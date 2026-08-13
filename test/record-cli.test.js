import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Process-spawn tests for bin/record.cjs — the serialized-write channel. Runs
// the real CLI as a child process against a throwaway context dir, exactly as a
// scaffolded project would invoke `node .claude/bmad/bin/record.cjs`.
//
// --context-dir is confined under <CLAUDE_PROJECT_DIR>/artifacts/ (F2-H), so
// each test builds a throwaway project root and points the context dir at
// <proj>/artifacts/context, passing CLAUDE_PROJECT_DIR as the confinement root.

const CLI = fileURLToPath(new URL('../bin/record.cjs', import.meta.url));

function mkproj() {
  const proj = mkdtempSync(join(tmpdir(), 'record-cli-'));
  const ctx = join(proj, 'artifacts', 'context');
  mkdirSync(ctx, { recursive: true });
  return { proj, ctx };
}

function run(args, { stdin = '', ctx, proj } = {}) {
  return spawnSync('node', [CLI, ...args, '--context-dir', ctx], {
    input: stdin, encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: proj },
  });
}

const provBody = (body) => JSON.stringify({
  provenance: { role: 'reviewer', project: 'bmad-swarm', date: '2026-08-13', occurrences: [] },
  body,
});

describe('record.cjs: append + ID allocation', () => {
  let proj, ctx;
  before(() => { ({ proj, ctx } = mkproj()); });
  after(() => { rmSync(proj, { recursive: true, force: true }); });

  it('appends an F-record and prints the allocated ID', () => {
    const r = run(['append', '--type', 'F', '--title', 'first', '--fingerprint', 'fp-1'], { stdin: provBody('first finding'), ctx, proj });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'F-1');
    assert.match(readFileSync(join(ctx, 'ledger.md'), 'utf8'), /^## F-1 — first$/m);
  });

  it('allocates the next ID monotonically', () => {
    const r = run(['append', '--type', 'F', '--title', 'second', '--fingerprint', 'fp-2'], { stdin: provBody('second finding'), ctx, proj });
    assert.equal(r.stdout.trim(), 'F-2');
    assert.equal(run(['next-id', 'F'], { ctx, proj }).stdout.trim(), 'F-3');
  });

  it('rejects a malformed record (missing fingerprint on F)', () => {
    const r = run(['append', '--type', 'F', '--title', 'bad'], { stdin: provBody('no fingerprint'), ctx, proj });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /fingerprint is REQUIRED/);
  });
});

describe('record.cjs: --context-dir confinement (F2-H)', () => {
  let proj, ctx;
  before(() => { ({ proj, ctx } = mkproj()); });
  after(() => { rmSync(proj, { recursive: true, force: true }); });

  it('refuses a context dir outside <projectRoot>/artifacts/', () => {
    const r = run(['append', '--type', 'F', '--title', 't', '--fingerprint', 'fp'], { stdin: provBody('x'), ctx: join(proj, 'src'), proj });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /must be under .*artifacts/);
    assert.ok(!existsSync(join(proj, 'src', 'ledger.md')), 'must not write src/ledger.md');
  });

  it('accepts the default context dir (under artifacts/) with no --context-dir', () => {
    const r = spawnSync('node', [CLI, 'append', '--type', 'F', '--title', 't', '--fingerprint', 'fp'], {
      input: provBody('x'), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: proj },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(proj, 'artifacts', 'context', 'ledger.md')));
  });
});

describe('record.cjs: concurrent-append safety (RES-6 regression)', () => {
  let proj, ctx;
  before(() => { ({ proj, ctx } = mkproj()); });
  after(() => { rmSync(proj, { recursive: true, force: true }); });

  it('20 rapid concurrent appends all land with distinct IDs', async () => {
    const N = 20;
    const { spawn } = await import('node:child_process');
    await Promise.all(Array.from({ length: N }, (_, i) => new Promise((res, rej) => {
      const child = spawn('node', [CLI, 'append', '--type', 'F', '--title', `t${i}`, '--fingerprint', `fp${i}`, '--context-dir', ctx], {
        env: { ...process.env, CLAUDE_PROJECT_DIR: proj },
      });
      child.stdin.end(provBody(`finding ${i}`));
      child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`child ${i} exited ${code}`))));
    })));

    const ledger = readFileSync(join(ctx, 'ledger.md'), 'utf8');
    const ids = [...ledger.matchAll(/^  id: (F-\d+)$/gm)].map((m) => m[1]);
    assert.equal(ids.length, N, `expected ${N} records, got ${ids.length}`);
    assert.equal(new Set(ids).size, N, 'IDs must be distinct (no collisions)');
    assert.equal(run(['validate'], { ctx, proj }).status, 0);
  });

  it('steals an owner-less stale lock instead of blocking to timeout (lock DoS)', async () => {
    const { proj: p2, ctx: c2 } = mkproj();
    try {
      // Pre-create an owner-less lock dir, aged past the owner-less grace.
      mkdirSync(join(c2, '.ledger.lock'));
      const past = new Date(Date.now() - 10000);
      utimesSync(join(c2, '.ledger.lock'), past, past);
      const t0 = Date.now();
      const r = run(['append', '--type', 'F', '--title', 't', '--fingerprint', 'fp'], { stdin: provBody('x'), ctx: c2, proj: p2 });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(Date.now() - t0 < 5000, 'must steal quickly, not wait the full timeout');
    } finally {
      rmSync(p2, { recursive: true, force: true });
    }
  });

  it('concurrent steal of a stale lock does not double-grant (TOCTOU)', async () => {
    const { proj: p3, ctx: c3 } = mkproj();
    try {
      mkdirSync(join(c3, '.ledger.lock'));
      const past = new Date(Date.now() - 10000);
      utimesSync(join(c3, '.ledger.lock'), past, past);
      const { spawn } = await import('node:child_process');
      const N = 10;
      await Promise.all(Array.from({ length: N }, (_, i) => new Promise((res, rej) => {
        const child = spawn('node', [CLI, 'append', '--type', 'F', '--title', `t${i}`, '--fingerprint', `fp${i}`, '--context-dir', c3], {
          env: { ...process.env, CLAUDE_PROJECT_DIR: p3 },
        });
        child.stdin.end(provBody(`c${i}`));
        child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`child ${i} exited ${code}`))));
      })));
      const ids = [...readFileSync(join(c3, 'ledger.md'), 'utf8').matchAll(/^  id: (F-\d+)$/gm)].map((m) => m[1]);
      assert.equal(new Set(ids).size, N, 'all appends distinct despite racing a stale lock');
    } finally {
      rmSync(p3, { recursive: true, force: true });
    }
  });
});

describe('record.cjs: set-status state machine', () => {
  let proj, ctx;
  before(() => {
    ({ proj, ctx } = mkproj());
    run(['append', '--type', 'L', '--title', 'a lesson', '--fingerprint', 'lp'], { stdin: provBody('lesson body'), ctx, proj });
    run(['append', '--type', 'R', '--title', 'a rec'], { stdin: provBody('rec body'), ctx, proj });
  });
  after(() => { rmSync(proj, { recursive: true, force: true }); });

  it('walks the legal L ladder observed -> recurring -> candidate', () => {
    assert.equal(run(['set-status', 'L-1', 'recurring'], { ctx, proj }).status, 0);
    assert.equal(run(['set-status', 'L-1', 'candidate'], { ctx, proj }).status, 0);
  });

  it('refuses an illegal transition', () => {
    const r = run(['set-status', 'L-1', 'observed'], { ctx, proj });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /illegal L transition/);
  });

  it('enforces the L -> promoted human gate via set-status', () => {
    const blocked = run(['set-status', 'L-1', 'promoted'], { ctx, proj });
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /human gate/);
    const ok = run(['set-status', 'L-1', 'promoted', '--human-approved', 'D-050', '--enforcement-tier', 'reviewer-lens'], { ctx, proj });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(readFileSync(join(ctx, 'ledger.md'), 'utf8'), /enforcement_tier: reviewer-lens/);
  });

  it('requires a reopen-trigger when rejecting an R', () => {
    assert.equal(run(['set-status', 'R-1', 'rejected'], { ctx, proj }).status, 1);
    const ok = run(['set-status', 'R-1', 'rejected', '--reopen-trigger', 'if X regresses'], { ctx, proj });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(readFileSync(join(ctx, 'ledger.md'), 'utf8'), /reopen_trigger: "if X regresses"/);
  });
});

describe('record.cjs: append human gate (F-27 / F2-H3)', () => {
  let proj, ctx;
  before(() => { ({ proj, ctx } = mkproj()); });
  after(() => { rmSync(proj, { recursive: true, force: true }); });

  it('refuses append --type L --status promoted with no --human-approved', () => {
    const r = run(['append', '--type', 'L', '--title', 't', '--fingerprint', 'fp', '--status', 'promoted'], { stdin: provBody('x'), ctx, proj });
    assert.equal(r.status, 1, 'the append door must honor the constitutional gate');
    assert.match(r.stderr, /human gate/);
    assert.ok(!existsSync(join(ctx, 'ledger.md')), 'no record should be written');
  });

  it('also blocks a promoted status smuggled through the JSON body', () => {
    const stdin = JSON.stringify({ provenance: { role: 'r', project: 'p', date: '2026-08-13' }, body: 'x', status: 'promoted' });
    const r = run(['append', '--type', 'L', '--title', 't', '--fingerprint', 'fp'], { stdin, ctx, proj });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /human gate/);
  });

  it('allows the migration entry points observed and recurring, and promoted WITH approval', () => {
    assert.equal(run(['append', '--type', 'L', '--title', 'a', '--fingerprint', 'f1', '--status', 'observed'], { stdin: provBody('x'), ctx, proj }).status, 0);
    assert.equal(run(['append', '--type', 'L', '--title', 'b', '--fingerprint', 'f2', '--status', 'recurring'], { stdin: provBody('x'), ctx, proj }).status, 0);
    assert.equal(run(['append', '--type', 'L', '--title', 'c', '--fingerprint', 'f3', '--status', 'promoted', '--human-approved', 'D-050'], { stdin: provBody('x'), ctx, proj }).status, 0);
  });
});

describe('record.cjs: append --type D to the decision log', () => {
  let proj, ctx;
  before(() => { ({ proj, ctx } = mkproj()); });
  after(() => { rmSync(proj, { recursive: true, force: true }); });

  it('allocates D-IDs against decision-log.md prose, not the YAML ledger', () => {
    const r = run(['append', '--type', 'D'], { stdin: JSON.stringify({ title: 'a decision', body: 'the decision text', classification: 'Tactical' }), ctx, proj });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'D-1');
    const log = readFileSync(join(ctx, 'decision-log.md'), 'utf8');
    assert.match(log, /^## D-1 — a decision$/m);
    assert.match(log, /the decision text/);
    assert.ok(!existsSync(join(ctx, 'ledger.md')), 'D append must not create ledger.md');
  });
});
