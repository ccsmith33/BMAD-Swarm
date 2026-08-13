import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Process-spawn tests for bin/record.cjs — the serialized-write channel. Runs
// the real CLI as a child process against a throwaway context dir, exactly as a
// scaffolded project would invoke `node .claude/bmad/bin/record.cjs`.

const CLI = fileURLToPath(new URL('../bin/record.cjs', import.meta.url));

function run(args, { stdin = '', ctx } = {}) {
  return spawnSync('node', [CLI, ...args, '--context-dir', ctx], {
    input: stdin, encoding: 'utf8',
  });
}

const provBody = (body) => JSON.stringify({
  provenance: { role: 'reviewer', project: 'bmad-swarm', date: '2026-08-13', occurrences: [] },
  body,
});

describe('record.cjs: append + ID allocation', () => {
  let ctx;
  before(() => { ctx = mkdtempSync(join(tmpdir(), 'record-cli-')); });
  after(() => { rmSync(ctx, { recursive: true, force: true }); });

  it('appends an F-record and prints the allocated ID', () => {
    const r = run(['append', '--type', 'F', '--title', 'first', '--fingerprint', 'fp-1'], { stdin: provBody('first finding'), ctx });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'F-1');
    assert.match(readFileSync(join(ctx, 'ledger.md'), 'utf8'), /^## F-1 — first$/m);
  });

  it('allocates the next ID monotonically', () => {
    const r = run(['append', '--type', 'F', '--title', 'second', '--fingerprint', 'fp-2'], { stdin: provBody('second finding'), ctx });
    assert.equal(r.stdout.trim(), 'F-2');
    assert.equal(run(['next-id', 'F'], { ctx }).stdout.trim(), 'F-3');
  });

  it('rejects a malformed record (missing fingerprint on F)', () => {
    const r = run(['append', '--type', 'F', '--title', 'bad'], { stdin: provBody('no fingerprint'), ctx });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /fingerprint is REQUIRED/);
  });
});

describe('record.cjs: concurrent-append safety (RES-6 regression)', () => {
  let ctx;
  before(() => { ctx = mkdtempSync(join(tmpdir(), 'record-conc-')); });
  after(() => { rmSync(ctx, { recursive: true, force: true }); });

  it('20 rapid concurrent appends all land with distinct IDs', async () => {
    const N = 20;
    const { spawn } = await import('node:child_process');
    await Promise.all(Array.from({ length: N }, (_, i) => new Promise((res, rej) => {
      const child = spawn('node', [CLI, 'append', '--type', 'F', '--title', `t${i}`, '--fingerprint', `fp${i}`, '--context-dir', ctx]);
      child.stdin.end(provBody(`finding ${i}`));
      child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`child ${i} exited ${code}`))));
    })));

    const ledger = readFileSync(join(ctx, 'ledger.md'), 'utf8');
    const ids = [...ledger.matchAll(/^  id: (F-\d+)$/gm)].map((m) => m[1]);
    assert.equal(ids.length, N, `expected ${N} records, got ${ids.length}`);
    assert.equal(new Set(ids).size, N, 'IDs must be distinct (no collisions)');
    // validate confirms every record is well-formed after the race
    assert.equal(run(['validate'], { ctx }).status, 0);
  });
});

describe('record.cjs: set-status state machine', () => {
  let ctx;
  before(() => {
    ctx = mkdtempSync(join(tmpdir(), 'record-status-'));
    run(['append', '--type', 'L', '--title', 'a lesson', '--fingerprint', 'lp'], { stdin: provBody('lesson body'), ctx });
    run(['append', '--type', 'R', '--title', 'a rec'], { stdin: provBody('rec body'), ctx });
  });
  after(() => { rmSync(ctx, { recursive: true, force: true }); });

  it('walks the legal L ladder observed -> recurring -> candidate', () => {
    assert.equal(run(['set-status', 'L-1', 'recurring'], { ctx }).status, 0);
    assert.equal(run(['set-status', 'L-1', 'candidate'], { ctx }).status, 0);
  });

  it('refuses an illegal transition', () => {
    const r = run(['set-status', 'L-1', 'observed'], { ctx });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /illegal L transition/);
  });

  it('enforces the L -> promoted human gate', () => {
    const blocked = run(['set-status', 'L-1', 'promoted'], { ctx });
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /human gate/);
    const ok = run(['set-status', 'L-1', 'promoted', '--human-approved', 'D-050', '--enforcement-tier', 'reviewer-lens'], { ctx });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(readFileSync(join(ctx, 'ledger.md'), 'utf8'), /enforcement_tier: reviewer-lens/);
  });

  it('requires a reopen-trigger when rejecting an R', () => {
    assert.equal(run(['set-status', 'R-1', 'rejected'], { ctx }).status, 1);
    const ok = run(['set-status', 'R-1', 'rejected', '--reopen-trigger', 'if X regresses'], { ctx });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(readFileSync(join(ctx, 'ledger.md'), 'utf8'), /reopen_trigger: "if X regresses"/);
  });
});

describe('record.cjs: append --type D to the decision log', () => {
  let ctx;
  before(() => { ctx = mkdtempSync(join(tmpdir(), 'record-d-')); });
  after(() => { rmSync(ctx, { recursive: true, force: true }); });

  it('allocates D-IDs against decision-log.md prose, not the YAML ledger', () => {
    const r = run(['append', '--type', 'D'], { stdin: JSON.stringify({ title: 'a decision', body: 'the decision text', classification: 'Tactical' }), ctx });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'D-1');
    const log = readFileSync(join(ctx, 'decision-log.md'), 'utf8');
    assert.match(log, /^## D-1 — a decision$/m);
    assert.match(log, /the decision text/);
    assert.ok(!existsSync(join(ctx, 'ledger.md')), 'D append must not create ledger.md');
  });
});
