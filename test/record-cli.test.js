import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
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
    assert.match(blocked.stderr, /ratification marker/);
    // K-2: --human-approved must resolve to a REAL decision, so ratify with one.
    const dId = run(['append', '--type', 'D'], { stdin: JSON.stringify({ title: 'ratify L-1', body: 'promote it' }), ctx, proj }).stdout.trim();
    const ok = run(['set-status', 'L-1', 'promoted', '--human-approved', dId, '--enforcement-tier', 'reviewer-lens'], { ctx, proj });
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
    assert.match(r.stderr, /ratification marker/);
    assert.ok(!existsSync(join(ctx, 'ledger.md')), 'no record should be written');
  });

  it('also blocks a promoted status smuggled through the JSON body', () => {
    const stdin = JSON.stringify({ provenance: { role: 'r', project: 'p', date: '2026-08-13' }, body: 'x', status: 'promoted' });
    const r = run(['append', '--type', 'L', '--title', 't', '--fingerprint', 'fp'], { stdin, ctx, proj });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ratification marker/);
  });

  it('allows the migration entry points observed and recurring, and promoted WITH approval', () => {
    assert.equal(run(['append', '--type', 'L', '--title', 'a', '--fingerprint', 'f1', '--status', 'observed'], { stdin: provBody('x'), ctx, proj }).status, 0);
    assert.equal(run(['append', '--type', 'L', '--title', 'b', '--fingerprint', 'f2', '--status', 'recurring'], { stdin: provBody('x'), ctx, proj }).status, 0);
    const dId = run(['append', '--type', 'D'], { stdin: JSON.stringify({ title: 'ratify f3', body: 'promote' }), ctx, proj }).stdout.trim();
    assert.equal(run(['append', '--type', 'L', '--title', 'c', '--fingerprint', 'f3', '--status', 'promoted', '--human-approved', dId], { stdin: provBody('x'), ctx, proj }).status, 0);
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

describe('record.cjs: reconcile subcommand (SE-3 / T7)', () => {
  let proj, ctx;
  before(() => {
    ({ proj, ctx } = mkproj());
    // Build a ledger through the sanctioned writer (the only door to task-ledger.md).
    run(['task-event', '--task', '1', '--event', 'created', '--owner', 'dev-a', '--session', 's1', '--detail', 'story-1'], { ctx, proj });
    run(['task-event', '--task', '1', '--event', 'in_progress', '--owner', 'dev-a', '--session', 's1'], { ctx, proj });
    run(['task-event', '--task', '2', '--event', 'created', '--owner', 'dev-b', '--session', 's1', '--detail', 'story-2'], { ctx, proj });
    // Task 3: the ledger believes it is live, but TaskList will have dropped it.
    run(['task-event', '--task', '3', '--event', 'created', '--owner', 'dev-c', '--session', 's1', '--detail', 'orphan'], { ctx, proj });
    run(['task-event', '--task', '3', '--event', 'in_progress', '--owner', 'dev-c', '--session', 's1'], { ctx, proj });
    // A brain with an awaiting-human gate (project-brain.md is exempt from the deny).
    writeFileSync(join(ctx, 'project-brain.md'), [
      '---',
      'schema: project-brain/1',
      'updated: 2026-08-13T10:00:00Z',
      'checkpoint: 4',
      'phase: implementation',
      'gates:',
      '  prd: {status: awaiting-human, d_id: D-9, at: 2026-08-13T09:00:00Z}',
      '  architecture: {status: pending}',
      'staleness: {ledger-events-since-checkpoint: 0}',
      '---',
      '',
      '## What this is (and why)',
      'A test.',
      '',
    ].join('\n'));
  });
  after(() => { rmSync(proj, { recursive: true, force: true }); });

  const TASKLIST = JSON.stringify({ tasks: [
    { id: '1', status: 'in_progress', owner: 'dev-a' },
    { id: '2', status: 'pending', owner: 'dev-b' },
    // task 3 dropped => orphan
  ] });

  it('--json reports the unwoken pending task, the orphan, and the awaiting-human gate', () => {
    const r = run(['reconcile', '--tasklist', '-', '--json'], { stdin: TASKLIST, ctx, proj });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.rewake.map((x) => x.task), ['2']);
    assert.match(out.rewake[0].reason, /not yet woken/);
    assert.deepEqual(out.orphans.map((x) => x.task), ['3']);
    assert.equal(out.orphans[0].owner, 'dev-c');
    assert.deepEqual(out.awaitingHuman.map((x) => x.gate), ['prd']);
    assert.equal(out.awaitingHuman[0].dId, 'D-9');
    assert.equal(out.staleness.brainCheckpoint, 4);
  });

  it('human-readable mode prints an action list with RE-WAKE / ORPHANS / AWAITING HUMAN sections', () => {
    const r = run(['reconcile', '--tasklist', '-'], { stdin: TASKLIST, ctx, proj });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /RE-WAKE/);
    assert.match(r.stdout, /ORPHANS/);
    assert.match(r.stdout, /AWAITING HUMAN/);
    assert.match(r.stdout, /task 2 owner=dev-b/);
    assert.match(r.stdout, /task 3 owner=dev-c/);
  });

  it('fails loudly on malformed TaskList JSON', () => {
    const r = run(['reconcile', '--tasklist', '-'], { stdin: 'not json', ctx, proj });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /not valid JSON/);
  });

  it('reports nothing to reconcile when TaskList matches the ledger and no gates await', () => {
    const clean = mkproj();
    run(['task-event', '--task', '1', '--event', 'created', '--owner', 'dev-a'], { ctx: clean.ctx, proj: clean.proj });
    run(['task-event', '--task', '1', '--event', 'in_progress', '--owner', 'dev-a'], { ctx: clean.ctx, proj: clean.proj });
    const r = run(['reconcile', '--tasklist', '-'], {
      stdin: JSON.stringify({ tasks: [{ id: '1', status: 'in_progress', owner: 'dev-a' }] }),
      ctx: clean.ctx, proj: clean.proj,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /nothing to reconcile/);
    rmSync(clean.proj, { recursive: true, force: true });
  });
});

// F-INT-1: a BLOCK-nested gate (`gates:\n  prd:\n    status: awaiting-human`)
// passes validate/doctor but the old parseFrontmatterLite flattened the deeper
// `status:` onto `gates` instead of `gates.prd`, so reconcile returned
// awaitingHuman=[] and the warm boot SILENTLY skipped the human-approval pause
// (RES-4). This locks in that the 2-level block form surfaces the gate — the
// exact shape that failed — alongside the flow-map form that already worked.
describe('record.cjs: reconcile surfaces a BLOCK-nested awaiting-human gate (F-INT-1)', () => {
  let proj, ctx;
  before(() => {
    ({ proj, ctx } = mkproj());
    run(['task-event', '--task', '1', '--event', 'created', '--owner', 'dev-a'], { ctx, proj });
    run(['task-event', '--task', '1', '--event', 'in_progress', '--owner', 'dev-a'], { ctx, proj });
    // Deep 2-level block form (NOT the single-line flow-map): status/d_id sit on
    // their own indented lines under gates.prd.
    writeFileSync(join(ctx, 'project-brain.md'), [
      '---',
      'schema: project-brain/1',
      'updated: 2026-08-13T10:00:00Z',
      'checkpoint: 7',
      'phase: implementation',
      'gates:',
      '  prd:',
      '    status: awaiting-human',
      '    d_id: D-9',
      '    at: 2026-08-13T09:00:00Z',
      '  architecture:',
      '    status: passed',
      'staleness: {ledger-events-since-checkpoint: 0}',
      '---',
      '',
      '## What this is (and why)',
      'A test.',
      '',
    ].join('\n'));
  });
  after(() => { rmSync(proj, { recursive: true, force: true }); });

  const TASKLIST = JSON.stringify({ tasks: [{ id: '1', status: 'in_progress', owner: 'dev-a' }] });

  it('--json surfaces the block-form awaiting-human gate (not silently dropped)', () => {
    const r = run(['reconcile', '--tasklist', '-', '--json'], { stdin: TASKLIST, ctx, proj });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.awaitingHuman.map((x) => x.gate), ['prd']);
    assert.equal(out.awaitingHuman[0].dId, 'D-9');
    // The passed gate must NOT be surfaced, and the deeper keys must not have
    // leaked up onto `gates` (the old flattening bug).
    assert.equal(out.awaitingHuman.length, 1);
    assert.equal(out.staleness.brainCheckpoint, 7);
  });

  it('human-readable mode names the awaiting-human gate', () => {
    const r = run(['reconcile', '--tasklist', '-'], { stdin: TASKLIST, ctx, proj });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /AWAITING HUMAN/);
    assert.match(r.stdout, /prd/);
  });
});
