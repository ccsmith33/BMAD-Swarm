import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateHooks } from '../generators/hooks-generator.js';
import { generateBin } from '../generators/bin-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// End-to-end of the replay gate at the hook boundary: generate the shipped hook
// + the pinned engine into a scaffold, then drive the hook with the EXACT
// TaskCompleted / TaskCreated payload shapes the spike captured live
// (v2.1.221). Exit 2 is the platform's "block completion" signal; exit 0 lets
// it through. No live Claude session is needed — the hook reads stdin and the
// engine is deterministic (verification §6: this whole path is unit-testable).

describe('replay-gate hook', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'replay-gate-'));
  const projectDir = join(tmpDir, 'project');
  let hookPath;

  before(() => {
    mkdirSync(join(projectDir, 'src'), { recursive: true });
    mkdirSync(join(projectDir, 'artifacts', 'context'), { recursive: true });
    writeFileSync(join(projectDir, 'src', 'real.js'), 'export const x = 1;\n');
    writeFileSync(join(projectDir, 'swarm.yaml'), [
      'project:',
      '  name: replay-test',
      'replay:',
      '  allowed_commands: ["node -e"]',
      '  timeout_seconds: 60',
    ].join('\n'));
    const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
    const paths = getProjectPaths(projectDir);
    generateHooks(config, paths);
    generateBin(config, paths);
    hookPath = join(paths.hooksDir, 'replay-gate.cjs');
  });
  after(() => rmSync(tmpDir, { recursive: true, force: true }));

  function runHook(payload) {
    return spawnSync('node', [hookPath], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
  }

  function writeBundle(name, yaml) {
    const p = join(projectDir, name);
    writeFileSync(p, yaml);
    return name;
  }

  it('generates the hook and ships the engine into the scaffold', () => {
    assert.ok(existsSync(hookPath), 'replay-gate.cjs generated');
    assert.ok(existsSync(join(projectDir, '.claude', 'bmad', 'bin', 'replay-check.cjs')), 'engine shipped');
  });

  it('PASSES (exit 0) a gated task whose evidence is fully satisfied', () => {
    // story class => requireExecutable, so the bundle carries a re-run command.
    writeBundle('good.evidence.yaml', [
      'evidence_bundle:',
      '  artifact: artifacts/story-1.md',
      '  items:',
      '    - id: E-1',
      '      kind: file-exists',
      '      paths: [src/real.js]',
      '    - id: E-2',
      '      kind: command',
      '      cmd: "node -e process.exit(0)"',
    ].join('\n'));
    const r = runHook({
      hook_event_name: 'TaskCompleted',
      task_id: '12',
      task_subject: 'story-1 implement thing',
      task_description: 'gate: replay\nevidence: good.evidence.yaml',
    });
    assert.equal(r.status, 0, r.stderr);
  });

  it('BLOCKS (exit 2) a gated task with a fabricated file path AND appends an F-record', () => {
    writeBundle('fab.evidence.yaml', [
      'evidence_bundle:',
      '  artifact: artifacts/story-2.md',
      '  items:',
      '    - id: E-0',
      '      kind: command',
      '      cmd: "node -e process.exit(0)"',
      '    - id: E-1',
      '      kind: file-exists',
      '      paths: [src/fabricated.js]',
    ].join('\n'));
    const r = runHook({
      hook_event_name: 'TaskCompleted',
      task_id: '13',
      task_subject: 'story-2 implement other thing',
      task_description: 'gate: replay\nevidence: fab.evidence.yaml',
    });
    assert.equal(r.status, 2, 'completion is blocked');
    assert.match(r.stderr, /BLOCKED \(replay gate\)/);
    assert.match(r.stderr, /fabricated\.js does not exist/);

    const ledger = readFileSync(join(projectDir, 'artifacts', 'context', 'ledger.md'), 'utf8');
    assert.match(ledger, /F-\d+ — replay rejection/, 'F-record appended');
    assert.match(ledger, /replay-file-exists-failure/, 'fingerprint records the failure class');
  });

  it('REFUSES a command not on the allow-list (never executes it)', () => {
    writeBundle('cmd.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: command',
      '      cmd: "rm -rf /tmp/should-never-run"',
    ].join('\n'));
    const r = runHook({
      hook_event_name: 'TaskCompleted',
      task_id: '14',
      task_subject: 'story-3',
      task_description: 'gate: replay\nevidence: cmd.evidence.yaml',
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /allow-list; NOT executed/);
  });

  it('BLOCKS a gated task that declares no evidence: path', () => {
    const r = runHook({
      hook_event_name: 'TaskCompleted',
      task_id: '15',
      task_subject: 'story-4',
      task_description: 'gate: replay',
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /no `evidence:` path/);
  });

  it('lets an UNGATED task through untouched (exit 0)', () => {
    const r = runHook({
      hook_event_name: 'TaskCompleted',
      task_id: '16',
      task_subject: 'coordinate the epic',
      task_description: 'no gate marker here',
    });
    assert.equal(r.status, 0, r.stderr);
  });

  it('TaskCreated: refuses a story task with no replay marker (exit 2)', () => {
    const r = runHook({
      hook_event_name: 'TaskCreated',
      task_id: '17',
      task_subject: 'story-14 build the parser',
      task_description: 'implement per the story',
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /BLOCKED \(replay marker\)/);
  });

  it('TaskCreated: allows a story task that carries the marker (exit 0)', () => {
    const r = runHook({
      hook_event_name: 'TaskCreated',
      task_id: '18',
      task_subject: 'story-15 build the writer',
      task_description: 'gate: replay\nevidence: artifacts/story-15.evidence.yaml',
    });
    assert.equal(r.status, 0, r.stderr);
  });

  it('TaskCreated: refuses a bug-fix task with no replay marker (exit 2)', () => {
    const r = runHook({
      hook_event_name: 'TaskCreated',
      task_id: '20',
      task_subject: 'bug-fix the login redirect',
      task_description: 'fix it',
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /BLOCKED \(replay marker\)/);
  });

  it('TaskCreated: refuses a review-verdict task with no replay marker (D-049(e))', () => {
    const r = runHook({
      hook_event_name: 'TaskCreated',
      task_id: '25',
      task_subject: 'Review: story-8 implementation',
      task_description: 'adversarial review of the diff',
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /BLOCKED \(replay marker\)/);
  });

  it('coverage-by-OWNER: a developer completing a non-story-subject task with no marker is BLOCKED', () => {
    // Subject dodges the story/bug-fix/review regexes, but the OWNER is a
    // developer — the completing agent cannot rename around the gate (security
    // critical 3). No marker => refused at completion.
    const r = runHook({
      hook_event_name: 'TaskCompleted',
      task_id: '21',
      task_subject: 'Implement auth module',
      task_description: 'build login',
      teammate_name: 'dev-auth',
    });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /gated "story"-class task but carries no|no `gate: replay` marker/);
  });

  it('solo (no owner) ungated task with a dodging subject still passes (exit 0)', () => {
    // With no teammate_name and no class-matching subject, the task is ungated —
    // solo sessions rely on the orchestrator-added marker.
    const r = runHook({
      hook_event_name: 'TaskCompleted',
      task_id: '22',
      task_subject: 'Implement auth module',
      task_description: 'build login',
    });
    assert.equal(r.status, 0, r.stderr);
  });

  it('FAILS CLOSED (exit 2) when the engine throws on a gated task', () => {
    // A NUL byte in a cmd makes spawnSync throw synchronously inside the engine;
    // the gate must block, not fall through to exit 0 (security critical 2).
    writeBundle('throw.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: command',
      '      cmd: "node -e   bad"',   // a REAL NUL byte → spawnSync throws synchronously
    ].join('\n'));
    const r = runHook({
      hook_event_name: 'TaskCompleted',
      task_id: '23',
      task_subject: 'story-9 do a thing',
      task_description: 'gate: replay\nevidence: throw.evidence.yaml',
    });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /fail-closed|errored/i);
  });

  it('TaskCreated: ignores non-gated coordination tasks (exit 0)', () => {
    const r = runHook({
      hook_event_name: 'TaskCreated',
      task_id: '24',
      task_subject: 'coordinate the epic kickoff',
      task_description: 'assign owners',
    });
    assert.equal(r.status, 0, r.stderr);
  });
});
