import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateHooks } from '../generators/hooks-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// Process-spawn tests for the task-ledger-writer PostToolUse hook (ADR-018 /
// D-037 / D-049; phase2 §3.3/§4.3). Verified against the LIVE payload shapes the
// spike captured (spike-posttooluse-2026-08-13). Each test drives the generated
// hook with a mock PostToolUse envelope on stdin and asserts the durable row(s)
// the pinned record.cjs appended to task-ledger.md.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('task-ledger-writer.cjs', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'task-ledger-writer-'));
  const projectDir = join(tmpDir, 'project');
  const contextDir = join(projectDir, 'artifacts', 'context');
  const ledgerPath = join(contextDir, 'task-ledger.md');
  let hooksDir;

  before(() => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'swarm.yaml'), 'project:\n  name: writer-test\n');
    const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
    const paths = getProjectPaths(projectDir);
    generateHooks(config, paths);
    hooksDir = paths.hooksDir;
    // Ship the pinned appender into the scaffold layout the hook resolves
    // (.claude/bmad/bin/record.cjs) — the hook writes THROUGH it, never directly.
    const binDir = join(projectDir, '.claude', 'bmad', 'bin');
    mkdirSync(binDir, { recursive: true });
    copyFileSync(join(REPO_ROOT, 'bin', 'record.cjs'), join(binDir, 'record.cjs'));
  });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  // Fire the PostToolUse hook with a mock envelope; returns spawn result.
  function fireWriter(event) {
    return spawnSync('node', [join(hooksDir, 'task-ledger-writer.cjs')], {
      input: JSON.stringify({ hook_event_name: 'PostToolUse', cwd: projectDir, ...event }),
      encoding: 'utf8',
      cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
  }

  function readLedger() {
    return existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : '';
  }

  it('the hook source and generated hook exist', () => {
    assert.ok(existsSync(join(REPO_ROOT, 'generators', 'hooks', 'task-ledger-writer.cjs.src')));
    assert.ok(existsSync(join(hooksDir, 'task-ledger-writer.cjs')));
  });

  it('always exits 0 (advisory writer never wedges) — even on a malformed payload', () => {
    const r = spawnSync('node', [join(hooksDir, 'task-ledger-writer.cjs')], {
      input: 'not json', encoding: 'utf8', cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
    assert.equal(r.status, 0);
  });

  it('TaskCreate appends a `created` row with the allocated id + subject', () => {
    const r = fireWriter({
      tool_name: 'TaskCreate',
      session_id: 'sess-A',
      tool_input: { subject: 'story-014 [gate: replay]', description: 'do the thing' },
      tool_response: { task: { id: '7', subject: 'story-014 [gate: replay]' } },
    });
    assert.equal(r.status, 0, r.stderr);
    const lines = readLedger().trim().split('\n');
    const created = lines.find((l) => /\btask=7\b/.test(l) && /\bevent=created\b/.test(l));
    assert.ok(created, 'expected a created row for task=7');
    assert.match(created, /session=sess-A/);
    assert.match(created, /subject="story-014 \[gate: replay\]"/);
  });

  it('TaskUpdate appends a status-change row carrying the owner (from tool_input)', () => {
    const r = fireWriter({
      tool_name: 'TaskUpdate',
      session_id: 'sess-A',
      // owner round-trips through tool_input, so the writer never re-queries it.
      tool_input: { taskId: '7', status: 'in_progress', owner: 'dev-auth' },
      tool_response: { statusChange: { from: 'pending', to: 'in_progress' }, updatedFields: ['status', 'owner'] },
    });
    assert.equal(r.status, 0, r.stderr);
    const lines = readLedger().trim().split('\n');
    const row = lines.find((l) => /\btask=7\b/.test(l) && /\bevent=in_progress\b/.test(l));
    assert.ok(row, 'expected an in_progress row for task=7');
    assert.match(row, /owner=dev-auth/);
  });

  it('the status event prefers tool_response.statusChange.to over tool_input.status', () => {
    fireWriter({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '7', status: 'in_progress', owner: 'dev-auth' },
      tool_response: { statusChange: { from: 'in_progress', to: 'completed' } },
    });
    const lines = readLedger().trim().split('\n');
    assert.ok(lines.some((l) => /\btask=7\b/.test(l) && /\bevent=completed\b/.test(l)),
      'expected a completed row (authoritative transition target from the result)');
  });

  it('SendMessage joins `to` against the owner->task-id map and appends a `woken` row', () => {
    // dev-auth was bound to task 7 by the TaskUpdate above. A message TO dev-auth
    // resolves (deterministic join, no text parsing) to a woken row for task 7.
    const r = fireWriter({
      tool_name: 'SendMessage',
      session_id: 'sess-A',
      tool_input: { to: 'dev-auth', summary: 'go', message: 'please start' },
      tool_response: { success: true },
    });
    assert.equal(r.status, 0, r.stderr);
    const lines = readLedger().trim().split('\n');
    const woken = lines.find((l) => /\btask=7\b/.test(l) && /\bevent=woken\b/.test(l));
    assert.ok(woken, 'expected a woken row for task=7');
    assert.match(woken, /owner=dev-auth/);
  });

  it('SendMessage to a non-owner logs nothing (coordination chatter)', () => {
    const before = readLedger();
    fireWriter({
      tool_name: 'SendMessage',
      tool_input: { to: 'nobody-owns-a-task', summary: 'fyi', message: 'fyi' },
      tool_response: { success: true },
    });
    assert.equal(readLedger(), before, 'no row should be appended for a non-owner target');
  });

  it('an undelivered SendMessage (success:false) wakes nobody', () => {
    const before = readLedger();
    fireWriter({
      tool_name: 'SendMessage',
      tool_input: { to: 'dev-auth', summary: 'go', message: 'go' },
      tool_response: { success: false },
    });
    assert.equal(readLedger(), before, 'a failed send must not log a woken row');
  });

  it('TaskCreate with an owner seeds both a created and an assigned row', () => {
    fireWriter({
      tool_name: 'TaskCreate',
      tool_input: { subject: 'preassigned', owner: 'dev-preassigned' },
      tool_response: { task: { id: '9', subject: 'preassigned' } },
    });
    const lines = readLedger().trim().split('\n');
    assert.ok(lines.some((l) => /\btask=9\b/.test(l) && /\bevent=created\b/.test(l)), 'created row');
    const assigned = lines.find((l) => /\btask=9\b/.test(l) && /\bevent=assigned\b/.test(l));
    assert.ok(assigned, 'assigned row');
    assert.match(assigned, /owner=dev-preassigned/);
    // And the map now resolves messages to dev-preassigned -> task 9.
    fireWriter({
      tool_name: 'SendMessage',
      tool_input: { to: 'dev-preassigned', summary: 'x', message: 'x' },
      tool_response: { success: true },
    });
    assert.ok(readLedger().split('\n').some((l) => /\btask=9\b/.test(l) && /\bevent=woken\b/.test(l)),
      'a create-time owner assignment must seed the woken join');
  });

  it('the most-recent owner->task binding wins the join', () => {
    // Reassign dev-auth from task 7 to a fresh task 11; the next message to
    // dev-auth must wake 11, not 7 (append-only ledger, last binding wins).
    fireWriter({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '11', status: 'in_progress', owner: 'dev-auth' },
      tool_response: { statusChange: { from: 'pending', to: 'in_progress' } },
    });
    fireWriter({
      tool_name: 'SendMessage',
      tool_input: { to: 'dev-auth', summary: 'x', message: 'x' },
      tool_response: { success: true },
    });
    const wokenRows = readLedger().split('\n').filter((l) => /\bevent=woken\b/.test(l) && /owner=dev-auth/.test(l));
    const last = wokenRows[wokenRows.length - 1];
    assert.match(last, /\btask=11\b/, 'the latest woken row for dev-auth must point at task 11');
  });

  it('concurrent appends through record.cjs are lock-serialized (no lost or torn rows)', () => {
    // Fire N writers in parallel; the CLI's directory lock must serialize them so
    // every row lands intact (RES-6 regression: two agents raced a shared file).
    const N = 12;
    const before = readLedger().split('\n').filter(Boolean).length;
    const procs = [];
    for (let i = 0; i < N; i++) {
      const event = {
        hook_event_name: 'PostToolUse', cwd: projectDir,
        tool_name: 'TaskCreate',
        tool_input: { subject: `concurrent-${i}` },
        tool_response: { task: { id: `c${i}` } },
      };
      procs.push(spawnSync('node', [join(hooksDir, 'task-ledger-writer.cjs')], {
        input: JSON.stringify(event), encoding: 'utf8', cwd: projectDir,
        env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      }));
    }
    for (const p of procs) assert.equal(p.status, 0, p.stderr);
    const lines = readLedger().split('\n').filter(Boolean);
    assert.equal(lines.length, before + N, 'every concurrent append must land exactly once');
    for (let i = 0; i < N; i++) {
      assert.ok(lines.some((l) => new RegExp(`\\btask=c${i}\\b`).test(l) && /\bevent=created\b/.test(l)),
        `row for concurrent-${i} is present and well-formed`);
    }
  });

  it('a DIRECT Edit to task-ledger.md is denied by the ledger-write-guard', () => {
    // The writer's whole premise: direct edits are structurally impossible, so
    // record.cjs is the only door. Verify the sibling guard still denies them.
    const r = spawnSync('node', [join(hooksDir, 'ledger-write-guard.cjs')], {
      input: JSON.stringify({ tool_input: { file_path: ledgerPath }, cwd: projectDir }),
      encoding: 'utf8', cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
    const decision = r.stdout && r.stdout.trim() ? JSON.parse(r.stdout) : null;
    assert.ok(decision, 'guard should emit a decision');
    assert.equal(decision.hookSpecificOutput.permissionDecision, 'deny',
      'a direct Edit/Write to task-ledger.md must be denied for every agent');
  });
});
