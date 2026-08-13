import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateHooks } from '../generators/hooks-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// Process-spawn tests for the project-brain continuity hooks (phase2 §4.4).
// Each spawns the generated hook as a child process, pipes a synthetic
// SessionStart/PreCompact payload as stdin JSON, and asserts the stdout
// contract — the same contract Claude Code uses at runtime.

const SAMPLE_BRAIN = [
  '---',
  'schema: project-brain/1',
  'updated: 2026-08-13T14:00:00Z',
  'checkpoint: 47',
  'phase: implementation',
  'staleness: {ledger-events-since-checkpoint: 3}',
  '---',
  '',
  '## What this is (and why)',
  'BRAIN-IDENTITY-TOKEN: a test project.',
  '',
  '## Current mental model',
  '- MENTAL-MODEL-TOKEN hooks enforce, prompts instruct',
  '',
  '## Load-bearing facts',
  '- LOADBEARING-TOKEN the brain lives at artifacts/context/project-brain.md',
  '',
  '## Active threads',
  '- THREAD-TOKEN — landing — next: test — artifacts/x.md @c47',
  '',
  '## Dead ends',
  '- DEADEND-TOKEN — rejected (D-002) @c12',
  '',
  '## Open questions',
  '- OPENQ-TOKEN?',
  '',
  '## Pointers',
  '- decision-log: artifacts/context/decision-log.md',
  '',
].join('\n');

describe('Project-brain hooks (process-spawn contract)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'bmad-brain-hooks-'));
  let hooksDir;
  let projectDir;

  before(() => {
    projectDir = join(tmpDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'swarm.yaml'), 'project:\n  name: brain-hooks-test\n');
    const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
    const paths = getProjectPaths(projectDir);
    generateHooks(config, paths);
    hooksDir = paths.hooksDir;
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeBrain(text) {
    const dir = join(projectDir, 'artifacts', 'context');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'project-brain.md'), text);
  }

  function writeSchema(text) {
    const dir = join(projectDir, '.claude', 'bmad', 'methodology', 'artifact-schemas');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'project-brain.md'), text);
  }

  function removeBrain() {
    rmSync(join(projectDir, 'artifacts', 'context', 'project-brain.md'), { force: true });
  }

  function runHook(hookName, { stdin = '{}' } = {}) {
    const result = spawnSync('node', [join(hooksDir, hookName)], {
      input: stdin,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      cwd: projectDir,
    });
    return result;
  }

  // -----------------------------------------------------------------------
  describe('pre-compact-flush.cjs', () => {
    it('emits the current brain + schema as delta-compaction steering, exit 0', () => {
      writeBrain(SAMPLE_BRAIN);
      writeSchema('# Project brain schema\nSCHEMA-DOC-TOKEN identity <=5 sentences.');
      const r = runHook('pre-compact-flush.cjs', {
        stdin: JSON.stringify({ hook_event_name: 'PreCompact', trigger: 'manual', custom_instructions: null }),
      });
      assert.equal(r.status, 0, 'must always exit 0 (exit 2 would block compaction)');
      // The brain content is injected verbatim.
      assert.match(r.stdout, /BRAIN-IDENTITY-TOKEN/);
      assert.match(r.stdout, /DEADEND-TOKEN/);
      // The schema is injected.
      assert.match(r.stdout, /SCHEMA-DOC-TOKEN/);
      // It steers a delta-against-brain summary.
      assert.match(r.stdout, /DELTA|delta/);
      // It names the current checkpoint so "since checkpoint N" is concrete.
      assert.match(r.stdout, /checkpoint 47/);
    });

    it('falls back to an inline schema reminder when the schema doc is absent', () => {
      writeBrain(SAMPLE_BRAIN);
      rmSync(join(projectDir, '.claude', 'bmad', 'methodology', 'artifact-schemas', 'project-brain.md'), { force: true });
      const r = runHook('pre-compact-flush.cjs', { stdin: '{"hook_event_name":"PreCompact"}' });
      assert.equal(r.status, 0);
      assert.match(r.stdout, /BRAIN-IDENTITY-TOKEN/);
      assert.match(r.stdout, /2,500 tokens/);
    });

    it('steers brain CREATION and exits 0 when no brain exists yet', () => {
      removeBrain();
      const r = runHook('pre-compact-flush.cjs', { stdin: '{"hook_event_name":"PreCompact"}' });
      assert.equal(r.status, 0, 'a missing brain must never wedge compaction');
      assert.match(r.stdout, /NO project-brain\.md|create/i);
    });

    it('never crashes on an empty / malformed payload', () => {
      writeBrain(SAMPLE_BRAIN);
      const r = runHook('pre-compact-flush.cjs', { stdin: 'not json at all' });
      assert.equal(r.status, 0);
      assert.match(r.stdout, /BRAIN-IDENTITY-TOKEN/);
    });
  });

  // -----------------------------------------------------------------------
  describe('session-start-warmboot.cjs', () => {
    function parseDecision(stdout) {
      try { return JSON.parse(stdout); } catch { return null; }
    }

    it('re-injects the brain + read-back handshake on compact, exit 0', () => {
      writeBrain(SAMPLE_BRAIN);
      const r = runHook('session-start-warmboot.cjs', {
        stdin: JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact' }),
      });
      assert.equal(r.status, 0);
      const decision = parseDecision(r.stdout);
      assert.ok(decision, 'stdout must be JSON');
      const ctx = decision.hookSpecificOutput.additionalContext;
      assert.equal(decision.hookSpecificOutput.hookEventName, 'SessionStart');
      // The brain is re-injected so comprehension (not just identity) is restored.
      assert.match(ctx, /BRAIN-IDENTITY-TOKEN/);
      assert.match(ctx, /THREAD-TOKEN/);
      // The read-back handshake is mandated before acting.
      assert.match(ctx, /Read-back handshake/i);
      assert.match(ctx, /Correct me or say go/);
      // Comprehension-before-coordination ordering is stated.
      assert.match(ctx, /Comprehension BEFORE coordination/);
      // Staleness from frontmatter is surfaced (3 events).
      assert.match(ctx, /3 ledger events/);
    });

    it('also fires on a fresh startup (matcher startup|compact)', () => {
      writeBrain(SAMPLE_BRAIN);
      const r = runHook('session-start-warmboot.cjs', {
        stdin: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' }),
      });
      assert.equal(r.status, 0);
      const ctx = parseDecision(r.stdout).hookSpecificOutput.additionalContext;
      assert.match(ctx, /BRAIN-IDENTITY-TOKEN/);
    });

    it('steers brain creation when none exists, exit 0', () => {
      removeBrain();
      const r = runHook('session-start-warmboot.cjs', {
        stdin: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' }),
      });
      assert.equal(r.status, 0);
      const ctx = parseDecision(r.stdout).hookSpecificOutput.additionalContext;
      assert.match(ctx, /NO artifacts\/context\/project-brain\.md/);
    });
  });
});
