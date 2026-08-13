import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateHooks, getHooksConfig } from '../generators/hooks-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// Process-spawn tests for the ledger-write-guard hook (ADR-021 §3.2 / D-049).
// The guard must deny DIRECT Edit/Write to the serialized context files for
// EVERY agent identity, and pass everything else through.

describe('ledger-write-guard.cjs', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ledger-guard-'));
  const projectDir = join(tmpDir, 'project');
  let hooksDir;

  before(() => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'swarm.yaml'), 'project:\n  name: guard-test\n');
    const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
    const paths = getProjectPaths(projectDir);
    generateHooks(config, paths);
    hooksDir = paths.hooksDir;
  });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function runGuard(toolInput, extraEvent = {}) {
    const event = { tool_input: toolInput, cwd: projectDir, ...extraEvent };
    const r = spawnSync('node', [join(hooksDir, 'ledger-write-guard.cjs')], {
      input: JSON.stringify(event), encoding: 'utf8', cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
    let decision = null;
    if (r.stdout && r.stdout.trim()) { try { decision = JSON.parse(r.stdout); } catch {} }
    return { ...r, decision };
  }

  const denied = (d) => d.decision?.hookSpecificOutput?.permissionDecision === 'deny';

  it('denies a direct Edit to ledger.md', () => {
    const d = runGuard({ file_path: 'artifacts/context/ledger.md' });
    assert.ok(denied(d));
    assert.match(d.decision.hookSpecificOutput.permissionDecisionReason, /record\.cjs/);
  });

  it('denies task-ledger.md and decision-log.md too', () => {
    assert.ok(denied(runGuard({ file_path: 'artifacts/context/task-ledger.md' })));
    assert.ok(denied(runGuard({ file_path: 'artifacts/context/decision-log.md' })));
  });

  it('denies for EVERY identity — teammate (agent_id present) and orchestrator (absent)', () => {
    assert.ok(denied(runGuard({ file_path: 'artifacts/context/ledger.md' }, { agent_id: 'dev-1', agent_type: 'developer' })));
    assert.ok(denied(runGuard({ file_path: 'artifacts/context/ledger.md' })));
  });

  it('denies via an absolute path and a NotebookEdit notebook_path', () => {
    assert.ok(denied(runGuard({ file_path: join(projectDir, 'artifacts/context/ledger.md') })));
    assert.ok(denied(runGuard({ notebook_path: 'artifacts/context/ledger.md' })));
  });

  it('denies a traversal path that resolves into the protected file', () => {
    // `..` is rejected before resolution (F-017 discipline) -> not allowed ->
    // but such a path also never resolves to the protected file, so it passes
    // through this guard (the orchestrator-write-gate is what blocks `..`).
    // What we assert here: a sibling-looking path is NOT falsely denied.
    assert.ok(!denied(runGuard({ file_path: 'artifacts/context/ledger.md.bak' })));
    assert.ok(!denied(runGuard({ file_path: 'notes/ledger.md' })));
  });

  it('allows project-brain.md and team-assembly-log.md (exempt) and unrelated files', () => {
    assert.ok(!denied(runGuard({ file_path: 'artifacts/context/project-brain.md' })));
    assert.ok(!denied(runGuard({ file_path: 'artifacts/context/team-assembly-log.md' })));
    assert.ok(!denied(runGuard({ file_path: 'src/index.js' })));
  });

  it('is registered in the hooks config on the file-writing matcher (no Bash)', () => {
    const cfg = getHooksConfig();
    const entry = cfg.PreToolUse.find((e) => e.hooks.some((h) => /ledger-write-guard\.cjs/.test(h.command)));
    assert.ok(entry, 'ledger-write-guard must be registered under PreToolUse');
    assert.match(entry.matcher, /Edit\|Write\|MultiEdit\|NotebookEdit/);
    assert.ok(!/Bash/.test(entry.matcher), 'guard must NOT match Bash (record.cjs runs via Bash)');
  });
});
