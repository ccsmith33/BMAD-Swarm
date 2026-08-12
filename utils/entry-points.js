// Canonical entry-point vocabulary (CB-9, WS-5). This is the ONE source of
// entry-point truth in code: the orchestrator invariant enum (agents/orchestrator.md),
// methodology/phases.yaml, and utils/cost-estimator.js all derive from these keys.
// Lockstep tests (test/entry-points.test.js) pin every other copy to this constant.

/** The 9 project roles, in canonical order (matches cost-estimator + orchestrator). */
export const ALL_AGENTS = Object.freeze([
  'orchestrator', 'ideator', 'researcher', 'strategist', 'architect',
  'developer', 'reviewer', 'security', 'devops',
]);

/**
 * Canonical entry points → the agent set each one spawns.
 * `plan-only` deliberately spawns nothing (assembly block only).
 */
export const ENTRY_POINTS = Object.freeze({
  'solo':           { agents: Object.freeze(['developer']) },
  'bug-fix':        { agents: Object.freeze(['developer', 'reviewer']) },
  'small-feature':  { agents: Object.freeze(['architect', 'developer', 'reviewer']) },
  'full-lifecycle': { agents: ALL_AGENTS },
  'brainstorm':     { agents: Object.freeze(['ideator']) },
  'explore-idea':   { agents: Object.freeze(['ideator', 'researcher']) },
  'debug':          { agents: Object.freeze(['developer', 'reviewer']) },
  'migrate':        { agents: Object.freeze(['architect', 'developer', 'reviewer']) },
  'audit':          { agents: Object.freeze(['researcher', 'reviewer', 'security']) },
  'research':       { agents: Object.freeze(['researcher']) },
  'review':         { agents: Object.freeze(['reviewer']) },
  'maintain':       { agents: Object.freeze(['developer', 'reviewer']) },
  'plan-only':      { agents: Object.freeze([]) },
});

/** Canonical entry-point names, in declaration order. */
export const ENTRY_POINT_NAMES = Object.freeze(Object.keys(ENTRY_POINTS));

/**
 * Resolve the agent set for an entry point.
 * @param {string} entryPoint - A canonical entry-point name.
 * @returns {string[]} The agents that entry point spawns (may be empty for plan-only).
 * @throws {Error} If the entry point is not one of the canonical names.
 */
export function agentsForEntryPoint(entryPoint) {
  const entry = ENTRY_POINTS[entryPoint];
  if (!entry) {
    throw new Error(
      `Unknown entry point: ${entryPoint}. Valid entry points: ${ENTRY_POINT_NAMES.join(', ')}`,
    );
  }
  return [...entry.agents];
}
