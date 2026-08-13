// Task-ledger reconciliation (ADR-018 §2 / RES-2/RES-4/RES-5; phase2 design §4.3).
//
// STUB — SE-3 (T7) owns the implementation. The task-ledger WRITERS (SE-2 T6,
// the PostToolUse task-ledger-writer hook) are live; the reader/diff logic that
// turns TaskList ⋈ task-ledger.md into a re-wake / liveness / awaiting-human
// action list lands here.
//
// CAVEAT FOR THE IMPLEMENTOR (verified live, spike-posttooluse-2026-08-13 §1/§4):
// consume the TaskList tool's output, NOT TaskGet's. TaskList returns `owner` on
// every task; TaskGet DROPS `owner` from its response even right after a
// TaskUpdate set it. reconcile()'s signature already takes taskListJson for this
// reason — do not switch it to per-task TaskGet lookups or `owner` silently
// becomes undefined and the not-yet-woken / dead-owner classification breaks.

/**
 * @param {object} _taskListJson   TaskList tool output (has `owner`; TaskGet does not).
 * @param {string[]} _ledgerLines  task-ledger.md lines.
 * @param {object} _brainFrontmatter  project-brain.md frontmatter (phase/gates).
 * @returns {{rewake: object[], stuck: object[], awaitingHuman: object[], staleness: object}}
 */
export function reconcile(_taskListJson, _ledgerLines, _brainFrontmatter) {
  throw new Error('reconcile() is not implemented yet (SE-3 / T7)');
}
