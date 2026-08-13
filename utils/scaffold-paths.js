import { getAgentNames } from './config.js';

/**
 * Self-containment path model (CB-1, WS-6).
 *
 * Package sources keep repo-relative paths (`methodology/…`, `agents/<role>.md`)
 * so they resolve for maintainers browsing the repo. At generation time those
 * bodies are rewritten to the shipped scaffold layout so that generated agents,
 * commands, and shipped methodology files reference paths that actually exist
 * inside a user project.
 *
 * See artifacts/design/phase1-truth-self-containment-2026-08-12.md §3.
 */

/** Shipped location of the methodology subset inside a generated project. */
export const SHIPPED_METHODOLOGY_PREFIX = '.claude/bmad/methodology/';

/**
 * The load-bearing methodology subset shipped into every scaffold (§3.3).
 * Paths are relative to PACKAGE_METHODOLOGY_DIR and preserved under
 * `.claude/bmad/methodology/`. `spec.yaml` is deliberately NOT shipped — the
 * CLI reads it from the installed package (it is a package-runtime concern).
 * @type {readonly string[]}
 */
export const METHODOLOGY_SHIP_LIST = Object.freeze([
  'decision-classification.md',
  'decision-traceability.md',
  'brainstorming-techniques.md',
  'elicitation-methods.md',
  'artifact-schemas/product-brief.md',
  'artifact-schemas/prd.md',
  'artifact-schemas/epic.md',
  'artifact-schemas/story.md',
  'artifact-schemas/architecture.md',
  'artifact-schemas/project-context.md',
  'artifact-schemas/decision-log.md',
  'artifact-schemas/lessons-learned.md',
  'artifact-schemas/record-envelope.md',
  'artifact-schemas/replay-evidence-bundle.md',
  'artifact-schemas/claims-table.md',
  'artifact-schemas/project-brain.md',
  'quality-gates/code-quality.md',
  'testing-knowledge/api-testing.md',
  'testing-knowledge/auth-testing.md',
  'testing-knowledge/data-testing.md',
  'testing-knowledge/frontend-testing.md',
  'testing-knowledge/performance-testing.md',
  'testing-knowledge/security-testing.md',
]);

/**
 * Rewrite repo-relative methodology/agent references to the shipped scaffold
 * layout. Applied to agent identity bodies, command bodies, and shipped
 * methodology bodies (to close their internal cross-references).
 *
 * Rules, applied in order (§3.2):
 *   1. `methodology/`      → `.claude/bmad/methodology/`
 *   2. `agents/<role>.md`  → `.claude/agents/<role>.md`   (role ∈ the role enum)
 *
 * Idempotent: an already-rewritten `.claude/bmad/methodology/…` or
 * `.claude/agents/<role>.md` token is not touched, so running the rewrite on
 * generated content (dev-repo dogfood) never double-prefixes.
 *
 * @param {string} content - Source body (may already contain rewritten refs)
 * @returns {string} Body with references pointing at the shipped layout
 */
export function rewriteScaffoldPaths(content) {
  // Rule 1: methodology/ → .claude/bmad/methodology/
  // Negative lookbehind on [\w/.] skips any `methodology/` already preceded by
  // a path segment (e.g. the `bmad/` in an already-shipped path, or
  // `overrides/methodology/`), leaving those untouched.
  let out = content.replace(/(?<![\w/.])methodology\//g, SHIPPED_METHODOLOGY_PREFIX);

  // Rule 2: agents/<role>.md → .claude/agents/<role>.md, restricted to the
  // known role enum so non-agent `agents/` paths are never rewritten. The same
  // negative lookbehind skips `.claude/agents/<role>.md` already-rewritten refs.
  const roles = getAgentNames();
  if (roles.length > 0) {
    const alternation = roles.map(escapeRegExp).join('|');
    const agentRe = new RegExp(`(?<![\\w/.])agents/(${alternation})\\.md`, 'g');
    out = out.replace(agentRe, '.claude/agents/$1.md');
  }

  return out;
}

/**
 * Escape regex metacharacters in a literal string (role names are kebab-case,
 * but guard against unexpected characters in the enum).
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
