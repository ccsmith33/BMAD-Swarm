export const meta = {
  name: 'bug-fix',
  description: 'Pilot deterministic regime: reproduce → fix → test → adversarial review → ledger entry, with script-logic escalation to an agentic team.',
  phases: ['reproduce', 'fix', 'test', 'review', 'ledger'],
};

// Regime router deterministic tier (Unlock 1, D-038). Named workflow only
// (spike-3 packaging). Inputs arrive via `args`:
//   args.taskId  — the gated bug-fix task id (for router-miss task-events)
//   args.report  — the bug report / repro description
//   args.paths   — optional affected file hints
// Escalation is script logic, NOT a platform primitive: the `escalateToTeam`
// helper below logs a router-miss and hands the remainder to an agent() team
// node. Node outputs are schema-validated; the gates (`if (!x.passed)`, etc.)
// are the real enforcement — a Workflow step that blocks on a boolean is
// enforcement, not ceremony.
//
// The pipeline lives inside `run()` so its early exits can use `return` (a
// top-level `return` is illegal in the script context the runtime evaluates,
// where the last expression is the result). The final line `await run()` is
// that last expression — the regime-invariant summary.

// WF-2 (security): taskId flows into a record.cjs command an escalation agent may
// run in a shell (the sandboxed-runtime fallback). Validate it against a strict
// id shape so it can never carry shell/command metacharacters; fall back to a
// safe literal on anything unexpected. (The deterministic emitter below already
// uses array-arg spawnSync — no shell — but this defends the fallback path too.)
const rawTaskId = (args && args.taskId) || 'unknown';
const taskId = /^[A-Za-z0-9._-]{1,128}$/.test(String(rawTaskId)) ? String(rawTaskId) : 'unpinned';
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
// (there is no `escalate: agentic` primitive).
async function escalateToTeam(reason) {
  const telemetryEmitted = await emitRouterMiss(reason);
  const telemetryLine = telemetryEmitted
    ? 'The router-miss calibration event has ALREADY been logged deterministically by the workflow — do NOT log it again. '
    // WF-2: the fallback command uses only the sanitized taskId and a fixed
    // literal detail — no unsanitized node output is interpolated into a shell
    // command the agent is told to run.
    : 'The workflow could not log the router-miss itself (sandboxed runtime); as a fallback, FIRST run from the repo root: node .claude/bmad/bin/record.cjs task-event --task ' + taskId + ' --event router-miss --detail router-miss — then ';
  return await agent({
    agentType: 'developer',
    prompt:
      'The deterministic bug-fix workflow escalated to an agentic team. ' +
      telemetryLine +
      'take over the task agentically end to end: fix the bug, add or update ' +
      'tests, run the full suite, and produce the replay-evidence bundle the gated ' +
      'task requires. Report the files changed and the final test status.\n\n' +
      'Bug report:\n' + report,
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
    'fails because of it. Do not fix anything yet.\n\nBug report:\n' + report,
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
    'change in scope, set escalate=true with a reason instead of guessing.\n\n' +
    'Bug report:\n' + report,
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
    'coverage. Report verdict=approved only if there are no blocking findings.\n\n' +
    'Bug report:\n' + report,
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
    'warranted). Report the ledger reference.\n\nTask id: ' + taskId,
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
// bmad-generated:85a637a1
