import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateWorkflows } from '../generators/workflows-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// Stream R — the regime router's deterministic tier ships as NAMED workflows in
// .claude/workflows/*.js (spike-3 packaging). These assertions encode the two
// contract facts a workflow file must satisfy to run, plus the escalation /
// router-miss behavior the router depends on.

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

describe('workflows-generator', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'wf-gen-'));
  const projectDir = join(tmpDir, 'project');
  let paths;
  let config;
  let workflowsDir;

  before(() => {
    mkdirSync(projectDir, { recursive: true });
    config = loadSwarmConfig(join(repoRoot, 'swarm.yaml'));
    paths = getProjectPaths(projectDir);
    workflowsDir = join(projectDir, '.claude', 'workflows');
  });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('generates the smoke-test and bug-fix named workflows', () => {
    const res = generateWorkflows(config, paths, { force: true });
    assert.deepEqual(res.generated.sort(), ['bug-fix.js', 'smoke-test.js']);
    const files = readdirSync(workflowsDir).filter((f) => f.endsWith('.js')).sort();
    assert.deepEqual(files, ['bug-fix.js', 'smoke-test.js']);
  });

  it('every workflow file BEGINS with `export const meta` (the runtime rule)', () => {
    // The Workflow runtime requires the script to begin with the pure-literal
    // meta block; a leading comment moves `export` off byte 0 and it is
    // rejected. This is why the bmad marker is a TRAILING comment.
    for (const name of readdirSync(workflowsDir).filter((f) => f.endsWith('.js'))) {
      const body = readFileSync(join(workflowsDir, name), 'utf8');
      assert.ok(
        body.startsWith('export const meta = {'),
        `${name} must begin with \`export const meta = {\` (found: ${JSON.stringify(body.slice(0, 40))})`,
      );
    }
  });

  it('every workflow file carries a TRAILING bmad-generated marker', () => {
    for (const name of readdirSync(workflowsDir).filter((f) => f.endsWith('.js'))) {
      const body = readFileSync(join(workflowsDir, name), 'utf8');
      assert.match(body, /\n\/\/ bmad-generated:[a-f0-9]+\n$/, `${name} must end with a trailing marker`);
    }
  });

  it('every workflow file is syntactically valid ESM (node --check)', () => {
    // Catches the top-level-return class of bug: the runtime wraps the body, but
    // a bare script context does not allow top-level `return`, so the pipeline
    // must live inside a function.
    for (const name of readdirSync(workflowsDir).filter((f) => f.endsWith('.js'))) {
      const r = spawnSync(process.execPath, ['--check', join(workflowsDir, name)], { encoding: 'utf8' });
      assert.equal(r.status, 0, `${name} failed node --check:\n${r.stderr}`);
    }
  });

  it('the bug-fix pilot encodes escalation-as-script-logic + a router-miss event', () => {
    const body = readFileSync(join(workflowsDir, 'bug-fix.js'), 'utf8');
    // Escalation is script logic (spike-3: no `escalate: agentic` primitive).
    assert.match(body, /escalateToTeam/, 'must define a script-logic escalation path');
    // The router-miss is emitted DETERMINISTICALLY from script logic (a
    // child_process exec of record.cjs), not delegated to an agent's prompt.
    assert.match(body, /async function emitRouterMiss/, 'must have a script-level emitter');
    assert.match(body, /node:child_process/, 'must exec record.cjs from script logic');
    assert.match(body, /spawnSync/, 'deterministic emission uses spawnSync (array args, no shell)');
    assert.match(body, /await emitRouterMiss\(/, 'escalation must call the deterministic emitter');
    assert.match(body, /record\.cjs['"],?\s*'task-event'|record\.cjs task-event/, 'escalation must log a router-miss task-event');
    assert.match(body, /'router-miss'|router-miss/, 'must name the router-miss event');
    // Worktree isolation on the fix node.
    assert.match(body, /isolation: 'worktree'/, 'fix node must isolate in a worktree');
    // Named workflow (not inline) — meta name matches the file.
    assert.match(body, /name: 'bug-fix'/, 'meta.name must be bug-fix');
    // The full deterministic pipeline is present.
    for (const phase of ['reproduce', 'fix', 'test', 'review', 'ledger']) {
      assert.ok(body.includes(`'${phase}'`), `pilot must declare the ${phase} phase`);
    }
    // The review gate is regime-invariant — a reviewer node runs inside the pipeline.
    assert.match(body, /agentType: 'reviewer'/, 'pilot must run an adversarial reviewer node');
  });

  it('the escalation path emits the router-miss DETERMINISTICALLY from script logic', async () => {
    // The router-miss must be logged by the workflow SCRIPT, not delegated to
    // the escalation agent's prompt — a skipped agent call would silently lose
    // the calibration signal. This test executes the real escalation path with a
    // STUB agent that never touches record.cjs, and asserts the event still lands
    // in the ledger. If it lands, the script emitted it; the agent could not have.
    generateWorkflows(config, paths, { force: true });

    // A throwaway project the workflow's `record.cjs task-event` writes into.
    const proj = realpathSync(mkdtempSync(join(tmpdir(), 'wf-routermiss-')));
    mkdirSync(join(proj, '.claude', 'bmad', 'bin'), { recursive: true });
    mkdirSync(join(proj, 'artifacts', 'context'), { recursive: true });
    copyFileSync(join(repoRoot, 'bin', 'record.cjs'), join(proj, '.claude', 'bmad', 'bin', 'record.cjs'));

    // Load the generated workflow body the way the runtime does: strip the
    // meta export (extracted separately) and the trailing marker, then wrap the
    // remainder — which uses top-level `await run()` and `agent`/`args` globals —
    // in an async function we can drive with a stub agent.
    let body = readFileSync(join(workflowsDir, 'bug-fix.js'), 'utf8');
    body = body.replace(/\n\/\/ bmad-generated:[a-f0-9]+\n$/, '\n');
    body = body.replace(/^export const meta = \{[\s\S]*?\n\};\n/, '');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runWorkflow = new AsyncFunction('agent', 'args', body);

    // Stub agent: fails reproduction on the first node (triggers escalation
    // immediately), returns a canned team result on the escalation node. It
    // NEVER runs record.cjs — so any router-miss in the ledger came from script.
    let agentCalls = 0;
    const stubAgent = async () => {
      agentCalls += 1;
      if (agentCalls === 1) return { reproduced: false };
      return { resolved: true, files_changed: [] };
    };

    const prevCwd = process.cwd();
    const prevProjEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = proj; // record.cjs default context dir root
    process.chdir(proj);
    try {
      await runWorkflow(stubAgent, { taskId: 'T-ROUTER-MISS', report: 'repro fails' });
    } finally {
      process.chdir(prevCwd);
      if (prevProjEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = prevProjEnv;
    }

    assert.ok(agentCalls >= 2, 'the escalation path should have run (repro fail → escalate)');
    const ledger = readFileSync(join(proj, 'artifacts', 'context', 'task-ledger.md'), 'utf8');
    assert.match(ledger, /event=router-miss/, 'router-miss must be recorded by the workflow script');
    assert.match(ledger, /task=T-ROUTER-MISS/, 'the router-miss must carry the task id');
    rmSync(proj, { recursive: true, force: true });
  });

  it('regeneration is idempotent (byte-identical on a second run)', () => {
    generateWorkflows(config, paths, { force: true });
    const first = readFileSync(join(workflowsDir, 'bug-fix.js'), 'utf8');
    generateWorkflows(config, paths, { force: true });
    const second = readFileSync(join(workflowsDir, 'bug-fix.js'), 'utf8');
    assert.equal(second, first);
  });

  it('skips a manually-modified workflow (does not clobber edits)', () => {
    generateWorkflows(config, paths, { force: true });
    const p = join(workflowsDir, 'smoke-test.js');
    writeFileSync(p, readFileSync(p, 'utf8').replace('SMOKE-OK', 'HAND-EDITED'));
    const res = generateWorkflows(config, paths, {}); // no force
    assert.ok(res.modified.includes('smoke-test.js'), 'manual edit must be reported as modified');
    assert.ok(!res.generated.includes('smoke-test.js'), 'manually-modified file must be skipped');
    assert.match(readFileSync(p, 'utf8'), /HAND-EDITED/, 'the hand edit must survive');
    // force overrides.
    const forced = generateWorkflows(config, paths, { force: true });
    assert.ok(forced.generated.includes('smoke-test.js'));
    assert.match(readFileSync(p, 'utf8'), /SMOKE-OK/, 'force must restore generated content');
  });
});
