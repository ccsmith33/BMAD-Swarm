import { join } from 'node:path';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { writeFileSafe, ensureDir, contentHash } from '../utils/fs-helpers.js';

/**
 * Generate .claude/workflows/ named-workflow scripts — the regime router's
 * deterministic middle tier (Unlock 1, D-038; spike-3 packaging).
 *
 * These are NAMED workflows (invoked as `{name, args}`), not inline/dynamic
 * scripts: spike 3 found dynamic workflows are permission-gated, so named
 * packaging in `.claude/workflows/*.js` is the robust form. A live smoke run
 * confirmed the contract before this tier shipped (one `agent({schema})` node
 * ran, forced StructuredOutput, returned its sentinel; `resumeFromRunId`
 * completes cleanly).
 *
 * Marker placement is deliberate. The Workflow runtime requires the script to
 * BEGIN with the pure-literal `export const meta = {…}` block (a leading
 * comment would move `export` off the first byte and the runtime rejects a
 * second top-level export). So the bmad-generated hash marker is written as a
 * TRAILING comment — the body is wrapped by the runtime, so a trailing `//`
 * line is an in-body comment and parses cleanly, while still letting `update`
 * detect manual edits. This intentionally does NOT reuse writeGeneratedJsFile
 * (which prepends the marker).
 *
 * @param {object} config - Parsed swarm.yaml config (reserved for future
 *   per-project workflow tailoring; unused today — the pilot ships uniformly)
 * @param {object} projectPaths - Project paths (needs claudeDir)
 * @param {object} [options]
 * @param {boolean} [options.force] - Overwrite manually-modified workflow files
 * @returns {{ generated: string[], modified: string[] }}
 */
export function generateWorkflows(config, projectPaths, options = {}) {
  const workflowsDir = join(projectPaths.claudeDir, 'workflows');
  ensureDir(workflowsDir);
  const generated = [];
  const modified = [];

  const WORKFLOWS = [
    { name: 'smoke-test', body: buildSmokeTestWorkflow() },
    { name: 'bug-fix', body: buildBugFixWorkflow() },
  ];

  for (const wf of WORKFLOWS) {
    const filePath = join(workflowsDir, `${wf.name}.js`);
    if (!options.force && isWorkflowManuallyModified(filePath)) {
      modified.push(`${wf.name}.js`);
      continue;
    }
    writeWorkflowFile(filePath, wf.body);
    generated.push(`${wf.name}.js`);
  }

  return { generated, modified };
}

// --- Trailing-marker helpers (local by design; see the header note) ---

const TRAILING_MARKER_RE = /\n\/\/ bmad-generated:([a-f0-9]+)\n?$/;

/**
 * Write a workflow file whose FIRST bytes are its `export const meta` block,
 * with the bmad-generated hash appended as a trailing comment.
 * @param {string} filePath
 * @param {string} body - the workflow script, beginning with `export const meta`
 */
function writeWorkflowFile(filePath, body) {
  const normalized = body.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
  const output = `${normalized}// bmad-generated:${contentHash(normalized)}\n`;
  writeFileSafe(filePath, output);
}

/**
 * Detect a manual edit to a generated workflow file via its trailing marker.
 * No marker (hand-authored or pre-marker file) → treated as not-ours, left
 * alone (returns true so the generator skips it rather than clobbering).
 * @param {string} filePath
 * @returns {boolean}
 */
function isWorkflowManuallyModified(filePath) {
  if (!existsSync(filePath)) return false;
  const existing = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const m = existing.match(TRAILING_MARKER_RE);
  if (!m) return true; // unmarked file present — do not overwrite
  const bodyOnly = existing.replace(TRAILING_MARKER_RE, '\n');
  return m[1] !== contentHash(bodyOnly);
}

// --- Workflow bodies ---

/**
 * Minimal named-workflow smoke test. Ships in every scaffold as the canonical
 * "does the workflow tier run here?" check — one schema-validated agent node
 * returning a fixed sentinel. Kept deliberately trivial (one short structured
 * completion) so running it costs almost nothing.
 */
function buildSmokeTestWorkflow() {
  return `export const meta = {
  name: 'smoke-test',
  description: 'Minimal named-workflow smoke test — one schema-validated agent node returning a sentinel.',
  phases: ['echo'],
};

// Confirms a NAMED workflow in \`.claude/workflows/\` actually runs, with a
// schema-validated agent() node. Only \`export const meta\` may be exported —
// the body below is wrapped by the runtime, so no second \`export\`.

const echoed = await agent({
  prompt: 'Return exactly this JSON object and nothing else: {"ok": true, "marker": "SMOKE-OK"}.',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
      marker: { type: 'string' },
    },
    required: ['ok', 'marker'],
  },
});

echoed;
`;
}

/**
 * The pilot deterministic-regime workflow: the ops-loop bug fix as a fixed step
 * graph (reproduce → fix → test → adversarial review → ledger entry) with
 * agentic nodes, schema-validated node outputs, and worktree isolation on the
 * fix node. Escalation is SCRIPT LOGIC (spike-3 caveat: no `escalate: agentic`
 * primitive) — a node that cannot proceed deterministically, or whose review
 * finds blocking issues twice, routes the remainder to a fallback agentic team
 * node and logs a router-miss event via `record.cjs task-event`. Every node
 * emits the same D-IDs / ledger lines as an agentic run — traceability is
 * regime-invariant.
 */
function buildBugFixWorkflow() {
  return `export const meta = {
  name: 'bug-fix',
  description: 'Pilot deterministic regime: reproduce → fix → test → adversarial review → ledger entry, with script-logic escalation to an agentic team.',
  phases: ['reproduce', 'fix', 'test', 'review', 'ledger'],
};

// Regime router deterministic tier (Unlock 1, D-038). Named workflow only
// (spike-3 packaging). Inputs arrive via \`args\`:
//   args.taskId  — the gated bug-fix task id (for router-miss task-events)
//   args.report  — the bug report / repro description
//   args.paths   — optional affected file hints
// Escalation is script logic, NOT a platform primitive: the \`escalateToTeam\`
// helper below logs a router-miss and hands the remainder to an agent() team
// node. Node outputs are schema-validated; the gates (\`if (!x.passed)\`, etc.)
// are the real enforcement — a Workflow step that blocks on a boolean is
// enforcement, not ceremony.
//
// The pipeline lives inside \`run()\` so its early exits can use \`return\` (a
// top-level \`return\` is illegal in the script context the runtime evaluates,
// where the last expression is the result). The final line \`await run()\` is
// that last expression — the regime-invariant summary.

const taskId = (args && args.taskId) || 'unknown';
const report = (args && args.report) || 'No bug report supplied in args.report.';

// Deterministic router-miss emission — SCRIPT LOGIC, not an agent prompt. The
// calibration signal is the whole point of the router-miss (it feeds the
// self-tuning rubric, vision §4.6), so it must NOT depend on an escalation agent
// remembering to run a command. We exec record.cjs directly from the workflow at
// the moment escalation fires. record.cjs task-event is the serialized-write
// channel (the only legal ledger writer), invoked with array args (no shell, no
// injection surface). If the runtime sandboxes child_process (import throws or
// the spawn fails), we degrade honestly to a best-effort instruction in the
// escalation agent's prompt — never silently.
async function emitRouterMiss(reason) {
  try {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('node', [
      '.claude/bmad/bin/record.cjs', 'task-event',
      '--task', String(taskId), '--event', 'router-miss', '--detail', String(reason),
    ], { encoding: 'utf8' });
    return r.status === 0;
  } catch (_e) {
    return false;
  }
}

// Route the remainder of the task to a full agentic team. This IS the
// "deterministic tier escalates to agentic" behavior — script logic per spike 3
// (there is no \`escalate: agentic\` primitive).
async function escalateToTeam(reason) {
  const telemetryEmitted = await emitRouterMiss(reason);
  const telemetryLine = telemetryEmitted
    ? 'The router-miss calibration event has ALREADY been logged deterministically by the workflow — do NOT log it again. '
    : 'The workflow could not log the router-miss itself (sandboxed runtime); as a fallback, FIRST run from the repo root: node .claude/bmad/bin/record.cjs task-event --task ' + taskId + ' --event router-miss --detail ' + JSON.stringify(reason) + ' — then ';
  return await agent({
    agentType: 'developer',
    prompt:
      'The deterministic bug-fix workflow escalated to an agentic team. ' +
      telemetryLine +
      'take over the task agentically end to end: fix the bug, add or update ' +
      'tests, run the full suite, and produce the replay-evidence bundle the gated ' +
      'task requires. Report the files changed and the final test status.\\n\\n' +
      'Bug report:\\n' + report,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        router_miss_logged: { type: 'boolean' },
        resolved: { type: 'boolean' },
        files_changed: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['resolved'],
    },
  });
}

async function run() {
// 1. REPRODUCE — confirm the bug and pin a failing test.
const repro = await agent({
  agentType: 'developer',
  prompt:
    'Reproduce this bug and, if it reproduces, write (or point to) a test that ' +
    'fails because of it. Do not fix anything yet.\\n\\nBug report:\\n' + report,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reproduced: { type: 'boolean' },
      failing_test: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['reproduced'],
  },
});

// Gate: a bug that will not reproduce is not deterministically fixable — this is
// exactly the ambiguity the router must not force through the deterministic
// tier. Escalate.
if (!repro || !repro.reproduced) {
  const escalated = await escalateToTeam('bug did not reproduce deterministically in the reproduce node');
  return escalated;
}

// 2. FIX — implement the minimal fix in an isolated worktree.
const fix = await agent({
  agentType: 'developer',
  isolation: 'worktree',
  prompt:
    'Implement the minimal fix for the reproduced bug so the failing test ' +
    '(' + (repro.failing_test || 'the repro test') + ') passes. Change as little ' +
    'as possible. If the fix requires a design decision or exceeds a one-file ' +
    'change in scope, set escalate=true with a reason instead of guessing.\\n\\n' +
    'Bug report:\\n' + report,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      patched: { type: 'boolean' },
      files_changed: { type: 'array', items: { type: 'string' } },
      escalate: { type: 'boolean' },
      escalate_reason: { type: 'string' },
    },
    required: ['patched'],
  },
});

// Gate: an explicit node escalation output re-routes to the team (script logic).
if (fix && fix.escalate) {
  const escalated = await escalateToTeam(fix.escalate_reason || 'fix node requested escalation');
  return escalated;
}

// 3. TEST — run the full suite; the boolean gate below is the enforcement.
const test = await agent({
  agentType: 'developer',
  prompt:
    'Run the full test suite from the repo root and report the result. Do not ' +
    'change any code. Report passed=true only if the suite is green.',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      passed: { type: 'boolean' },
      command: { type: 'string' },
      exit_code: { type: 'integer' },
      output_tail: { type: 'string' },
    },
    required: ['passed'],
  },
});

if (!test || !test.passed) {
  const escalated = await escalateToTeam('test node reported a failing suite after the fix');
  return escalated;
}

// 4. REVIEW — adversarial review (the same reviewer identity the agentic regime
// runs; the review gate is regime-invariant).
const review = await agent({
  agentType: 'reviewer',
  prompt:
    'Adversarially review the bug fix for correctness, security, and test ' +
    'coverage. Report verdict=approved only if there are no blocking findings.\\n\\n' +
    'Bug report:\\n' + report,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      verdict: { type: 'string', enum: ['approved', 'rejected'] },
      blocking: { type: 'boolean' },
      findings: { type: 'array', items: { type: 'string' } },
    },
    required: ['verdict', 'blocking'],
  },
});

// Gate: a blocking review sends the remainder to the team (one deterministic
// retry is intentionally NOT attempted here — a blocking finding means the
// deterministic path already produced a wrong answer, which is the router-miss
// signal worth recording).
if (!review || review.blocking || review.verdict !== 'approved') {
  const escalated = await escalateToTeam('adversarial review returned blocking findings');
  return escalated;
}

// 5. LEDGER — emit the same ledger line an agentic run would (regime-invariant
// traceability). The node runs record.cjs; the workflow does not write the
// ledger directly (the serialized-write CLI is the only ledger writer).
const ledger = await agent({
  agentType: 'developer',
  prompt:
    'Record completion of this bug fix in the ledger by running record.cjs from ' +
    'the repo root (a task-event for the fix, plus any F/L records the review ' +
    'warranted). Report the ledger reference.\\n\\nTask id: ' + taskId,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      recorded: { type: 'boolean' },
      ledger_ref: { type: 'string' },
    },
    required: ['recorded'],
  },
});

// Final workflow result — a regime-invariant summary.
return {
  regime: 'workflow',
  workflow: 'bug-fix',
  taskId,
  reproduced: repro.reproduced,
  files_changed: (fix && fix.files_changed) || [],
  tests_passed: test.passed,
  review_verdict: review.verdict,
  ledger_ref: (ledger && ledger.ledger_ref) || null,
  escalated: false,
};
}

await run();
`;
}
