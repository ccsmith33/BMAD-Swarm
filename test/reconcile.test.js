import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, parseTaskLedgerLine } from '../utils/reconcile.js';

// Pure-function reconciliation matrix (ADR-018 §2 / RES-1/2/3/4/5; phase2 §4.3).
// reconcile(taskListJson, ledgerLines, brainFrontmatter, opts) diffs the TaskList
// tool output against the task ledger + brain frontmatter. All fixtures pin a
// fixed `now` so age/staleness are deterministic.

const NOW = Date.parse('2026-08-13T12:00:00Z');
const opts = { now: NOW };

// Build a task-ledger line in the exact format record.cjs task-event writes.
function line(ts, task, event, owner, subject) {
  let s = `${ts} session=s1 task=${task} event=${event}`;
  if (owner) s += ` owner=${owner}`;
  if (subject) s += ` subject=${JSON.stringify(subject)}`;
  return s;
}

describe('reconcile: line parsing', () => {
  it('parses a full ledger line including a JSON-quoted subject with = inside', () => {
    const e = parseTaskLedgerLine(
      '2026-08-13T10:00:00Z session=s1 task=12 event=created owner=dev-a subject="story-1 [gate: replay] a=b"',
    );
    assert.equal(e.task, '12');
    assert.equal(e.event, 'created');
    assert.equal(e.owner, 'dev-a');
    assert.equal(e.session, 's1');
    assert.equal(e.subject, 'story-1 [gate: replay] a=b');
  });

  it('returns null on a blank or malformed line', () => {
    assert.equal(parseTaskLedgerLine(''), null);
    assert.equal(parseTaskLedgerLine('   '), null);
    assert.equal(parseTaskLedgerLine('not a ledger line'), null);
  });
});

describe('reconcile: unwoken pending task (RES-3)', () => {
  it('flags a pending task with no in_progress wake-ack as re-wake', () => {
    const ledger = [line('2026-08-13T11:55:00Z', '5', 'created', 'dev-x', 'story-5')];
    const taskList = { tasks: [{ id: '5', status: 'pending', owner: 'dev-x' }] };
    const r = reconcile(taskList, ledger, {}, opts);
    assert.equal(r.rewake.length, 1);
    assert.equal(r.rewake[0].task, '5');
    assert.equal(r.rewake[0].owner, 'dev-x');
    assert.match(r.rewake[0].reason, /not yet woken/);
    assert.equal(r.stuck.length, 0);
    assert.equal(r.orphans.length, 0);
  });

  it('does NOT re-wake a pending task that already has an in_progress row (woken)', () => {
    const ledger = [
      line('2026-08-13T11:50:00Z', '5', 'created', 'dev-x'),
      line('2026-08-13T11:51:00Z', '5', 'in_progress', 'dev-x'),
    ];
    // TaskList still reports pending (stale) but the ledger proves it was woken.
    const taskList = { tasks: [{ id: '5', status: 'pending', owner: 'dev-x' }] };
    const r = reconcile(taskList, ledger, {}, opts);
    assert.equal(r.rewake.length, 0);
  });

  it('classifies a lost wake (woken row but never acked in_progress) distinctly', () => {
    const ledger = [
      line('2026-08-13T11:50:00Z', '5', 'created', 'dev-x'),
      line('2026-08-13T11:51:00Z', '5', 'woken', 'dev-x'),
    ];
    const taskList = { tasks: [{ id: '5', status: 'pending', owner: 'dev-x' }] };
    const r = reconcile(taskList, ledger, {}, opts);
    assert.equal(r.rewake.length, 1);
    assert.match(r.rewake[0].reason, /lost wake/);
  });

  it('does NOT re-wake a blocked pending task', () => {
    const ledger = [line('2026-08-13T11:55:00Z', '6', 'created', 'dev-y')];
    const taskList = { tasks: [{ id: '6', status: 'pending', owner: 'dev-y', blockedBy: ['5'] }] };
    const r = reconcile(taskList, ledger, {}, opts);
    assert.equal(r.rewake.length, 0);
  });

  it('honors a status:blocked task as blocked (not re-woken)', () => {
    const taskList = { tasks: [{ id: '6', status: 'blocked', owner: 'dev-y' }] };
    const r = reconcile(taskList, [], {}, opts);
    assert.equal(r.rewake.length, 0);
  });
});

describe('reconcile: orphaned task (in ledger, gone from TaskList)', () => {
  it('flags a non-terminal ledger task absent from TaskList as an orphan', () => {
    const ledger = [
      line('2026-08-13T10:00:00Z', '9', 'created', 'dev-dead', 'orphan-story'),
      line('2026-08-13T10:05:00Z', '9', 'in_progress', 'dev-dead'),
    ];
    const taskList = { tasks: [{ id: '1', status: 'in_progress', owner: 'dev-a' }] };
    const r = reconcile(taskList, ledger, {}, opts);
    assert.equal(r.orphans.length, 1);
    assert.equal(r.orphans[0].task, '9');
    assert.equal(r.orphans[0].owner, 'dev-dead');
    assert.equal(r.orphans[0].lastEvent, 'in_progress');
    assert.match(r.orphans[0].reason, /absent from TaskList/);
  });

  it('does NOT treat a completed ledger task absent from TaskList as an orphan', () => {
    const ledger = [
      line('2026-08-13T10:00:00Z', '9', 'created', 'dev-a'),
      line('2026-08-13T10:05:00Z', '9', 'in_progress', 'dev-a'),
      line('2026-08-13T10:30:00Z', '9', 'completed', 'dev-a'),
    ];
    const taskList = { tasks: [] };
    const r = reconcile(taskList, ledger, {}, opts);
    assert.equal(r.orphans.length, 0);
  });

  it('does NOT orphan a ledger task still present in TaskList', () => {
    const ledger = [line('2026-08-13T10:00:00Z', '9', 'created', 'dev-a')];
    const taskList = { tasks: [{ id: '9', status: 'pending', owner: 'dev-a' }] };
    const r = reconcile(taskList, ledger, {}, opts);
    assert.equal(r.orphans.length, 0);
  });
});

describe('reconcile: stuck / liveness (RES-1)', () => {
  it('flags an in_progress task with stale ledger activity as stuck', () => {
    const ledger = [
      line('2026-08-13T09:00:00Z', '2', 'created', 'dev-b'),
      line('2026-08-13T09:01:00Z', '2', 'in_progress', 'dev-b'), // ~3h before NOW
    ];
    const taskList = { tasks: [{ id: '2', status: 'in_progress', owner: 'dev-b' }] };
    const r = reconcile(taskList, ledger, {}, opts);
    assert.equal(r.stuck.length, 1);
    assert.equal(r.stuck[0].task, '2');
    assert.ok(r.stuck[0].ageMinutes >= 30);
  });

  it('does NOT flag a freshly-active in_progress task', () => {
    const ledger = [line('2026-08-13T11:58:00Z', '2', 'in_progress', 'dev-b')];
    const taskList = { tasks: [{ id: '2', status: 'in_progress', owner: 'dev-b' }] };
    const r = reconcile(taskList, ledger, {}, opts);
    assert.equal(r.stuck.length, 0);
  });

  it('flags an in_progress task with no ledger activity at all (age null)', () => {
    const taskList = { tasks: [{ id: '2', status: 'in_progress', owner: 'dev-b' }] };
    const r = reconcile(taskList, [], {}, opts);
    assert.equal(r.stuck.length, 1);
    assert.equal(r.stuck[0].ageMinutes, null);
  });

  it('respects a custom stuckThresholdMinutes', () => {
    const ledger = [line('2026-08-13T11:00:00Z', '2', 'in_progress', 'dev-b')]; // 60m old
    const taskList = { tasks: [{ id: '2', status: 'in_progress', owner: 'dev-b' }] };
    assert.equal(reconcile(taskList, ledger, {}, { now: NOW, stuckThresholdMinutes: 120 }).stuck.length, 0);
    assert.equal(reconcile(taskList, ledger, {}, { now: NOW, stuckThresholdMinutes: 30 }).stuck.length, 1);
  });
});

describe('reconcile: awaiting-human gates from brain frontmatter (RES-4)', () => {
  it('surfaces gates whose status is awaiting-human', () => {
    const brain = {
      checkpoint: 7,
      gates: {
        prd: { status: 'passed', d_id: 'D-1' },
        architecture: { status: 'awaiting-human', d_id: 'D-9', at: '2026-08-13T09:00:00Z' },
      },
    };
    const r = reconcile({ tasks: [] }, [], brain, opts);
    assert.equal(r.awaitingHuman.length, 1);
    assert.equal(r.awaitingHuman[0].gate, 'architecture');
    assert.equal(r.awaitingHuman[0].dId, 'D-9');
    assert.equal(r.awaitingHuman[0].since, '2026-08-13T09:00:00Z');
  });

  it('tolerates a missing/empty gates map', () => {
    assert.deepEqual(reconcile({ tasks: [] }, [], {}, opts).awaitingHuman, []);
    assert.deepEqual(reconcile({ tasks: [] }, [], { gates: {} }, opts).awaitingHuman, []);
  });

  it('reads the brain checkpoint into staleness', () => {
    const r = reconcile({ tasks: [] }, [], { checkpoint: 42 }, opts);
    assert.equal(r.staleness.brainCheckpoint, 42);
  });
});

describe('reconcile: TaskList shape tolerance + staleness', () => {
  it('accepts a bare tasks array, {tasks}, and {tool_response:{tasks}}', () => {
    const t = [{ id: '1', status: 'pending', owner: 'dev-a' }];
    assert.equal(reconcile(t, [], {}, opts).rewake.length, 1);
    assert.equal(reconcile({ tasks: t }, [], {}, opts).rewake.length, 1);
    assert.equal(reconcile({ tool_response: { tasks: t } }, [], {}, opts).rewake.length, 1);
  });

  it('computes ledgerAgeMinutes from the most recent ledger line', () => {
    const ledger = [
      line('2026-08-13T10:00:00Z', '1', 'created', 'dev-a'),
      line('2026-08-13T11:30:00Z', '1', 'in_progress', 'dev-a'),
    ];
    const r = reconcile({ tasks: [{ id: '1', status: 'in_progress', owner: 'dev-a' }] }, ledger, {}, opts);
    assert.equal(r.staleness.ledgerAgeMinutes, 30);
  });

  it('null staleness when the ledger is empty', () => {
    assert.equal(reconcile({ tasks: [] }, [], {}, opts).staleness.ledgerAgeMinutes, null);
  });

  it('two-session interleave: owner from the latest ledger row wins', () => {
    const ledger = [
      line('2026-08-13T10:00:00Z', '3', 'created', 'dev-old'),
      '2026-08-13T10:10:00Z session=s2 task=3 event=assigned owner=dev-new',
    ];
    // Task dropped from TaskList => orphan; owner should be the reassigned one.
    const r = reconcile({ tasks: [] }, ledger, {}, opts);
    assert.equal(r.orphans.length, 1);
    assert.equal(r.orphans[0].owner, 'dev-new');
  });
});
