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

const taskId = (args && args.taskId) || 'unknown';
const report = (args && args.report) || 'No bug report supplied in args.report.';

// Fallback: route the remainder of the task to a full agentic team, and record
// the router-miss so the complexity rubric stays empirically tunable (vision
// §4.6; no tuner is built this phase). This IS the "deterministic tier escalates
// to agentic" behavior — implemented as script logic per spike 3.
async function escalateToTeam(reason) {
  return await agent({
    agentType: 'developer',
    prompt:
      'The deterministic bug-fix workflow could not complete this task and is ' +
      'escalating to an agentic team. FIRST, log the router-miss event by running ' +
      'this exact command from the repo root:\n\n' +
      '  node .claude/bmad/bin/record.cjs task-event --task ' + taskId +
      ' --event router-miss --detail ' + JSON.stringify(reason) + '\n\n' +
      'THEN take over the task agentically end to end: fix the bug, add or update ' +
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
      required: ['router_miss_logged', 'resolved'],
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
// bmad-generated:04d28474
