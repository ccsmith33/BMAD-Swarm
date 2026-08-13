// utils/earned-rules.js — the born-immune compiler (diverge-knowledge §3.1 / §4;
// phase4 §3.1 item 6). Promoted L-records are rules the human ratified; at
// `init`/`update` they compile INTO the generated scaffold so a new project is
// "born already immune" to failure classes prior projects paid for. The L-5
// promotion was the manual precedent — this generalizes it: any PROMOTED
// L-record, not one hand-wired rule.
//
// Read-only + provenance-explicit. The only writer of the ledger is
// bin/record.cjs; this module merely READS promoted L-records (via the pure
// extractPromotedLessons re-exported from the envelope) and renders scaffold
// text. It NEVER auto-promotes — promotion is the record.cjs human gate.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { extractPromotedLessons } from './record-envelope.js';

/**
 * Resolve promoted L-records for a project from the first available source.
 * Precedence (highest first):
 *   1. options.earnedLessons — a pre-extracted array (direct injection / tests)
 *   2. options.knowledgeLedgerPath — an explicit ledger.md to parse
 *   3. the user ring ~/.bmad/knowledge/ledger.md — ONLY when the knowledge ring
 *      is enabled in config (H-2 consent; default OFF, F-015 out-of-repo class)
 *   4. the project's own artifacts/context/ledger.md (self-earned rules)
 *
 * Stack filtering is soft: a promoted rule with no declared stack is universal
 * (earned + human-gated, so shipping it everywhere is safe); a rule naming a
 * stack token in its body only ships when the project's stack overlaps.
 *
 * @param {object} config       parsed swarm.yaml
 * @param {object} projectPaths getProjectPaths() result
 * @param {object} [options]    { earnedLessons?, knowledgeLedgerPath?, homeDir? }
 * @returns {Array<{id,title,fingerprint,enforcementTier,rule,contexts,occurrenceCount}>}
 */
export function collectEarnedLessons(config, projectPaths, options = {}) {
  let lessons;
  let ratifyingDIds = null; // set of D-IDs that exist in the sibling decision-log
  if (Array.isArray(options.earnedLessons)) {
    lessons = options.earnedLessons;
  } else {
    const source = resolveLedgerSource(config, projectPaths, options);
    lessons = source && existsSync(source)
      ? extractPromotedLessons(readFileSync(source, 'utf8'))
      : [];
    ratifyingDIds = source ? readDecisionIds(join(dirname(source), 'decision-log.md')) : new Set();
  }
  const stack = normalizeStack(config && config.stack);
  return lessons.filter((l) => matchesStack(l, stack) && ratifiedByRealDecision(l, ratifyingDIds, options));
}

// Read the set of D-IDs that actually exist as headings in a decision-log.md.
function readDecisionIds(decisionLogPath) {
  const ids = new Set();
  if (!decisionLogPath || !existsSync(decisionLogPath)) return ids;
  const content = readFileSync(decisionLogPath, 'utf8');
  const re = /^##\s+(D-\d+)\s+—/gm;
  let m;
  while ((m = re.exec(content)) !== null) ids.add(m[1]);
  return ids;
}

// A promoted lesson only compiles into a scaffold if it is ratified by a REAL
// decision (K-1 #4 / K-2): the L must carry links.d_ids and at least one of them
// must exist in the decision-log. This defeats a forged `status: promoted` block
// (it has no genuine ratifying D). When lessons are injected directly for tests
// (options.earnedLessons) or no decision-log is resolvable, the caller owns
// trust and the check is skipped — but the default init/update path enforces it.
function ratifiedByRealDecision(lesson, ratifyingDIds, options) {
  if (ratifyingDIds === null) return true;         // direct injection: caller trusts
  if (options && options.skipRatificationCheck) return true;
  const dIds = Array.isArray(lesson.dIds) ? lesson.dIds : [];
  return dIds.some((d) => ratifyingDIds.has(d));
}

function resolveLedgerSource(config, projectPaths, options) {
  if (options.knowledgeLedgerPath) return options.knowledgeLedgerPath;
  const ring = config && config.knowledge && config.knowledge.ring;
  if (ring && ring.enabled) {
    const home = options.homeDir || homedir();
    return ring.path ? join(ring.path, 'ledger.md') : join(home, '.bmad', 'knowledge', 'ledger.md');
  }
  if (projectPaths && projectPaths.artifactsDir) {
    return join(projectPaths.artifactsDir, 'context', 'ledger.md');
  }
  return null;
}

function normalizeStack(stack) {
  if (!stack) return [];
  const flat = [];
  const push = (v) => { if (typeof v === 'string') flat.push(v.toLowerCase()); };
  if (Array.isArray(stack)) stack.forEach(push);
  else if (typeof stack === 'object') Object.values(stack).forEach((v) => Array.isArray(v) ? v.forEach(push) : push(v));
  else push(stack);
  return flat;
}

// A lesson matches when it declares no stack (universal) or its body names a
// stack token the project uses. We look for an explicit `stack: [..]` / `stack:
// x` hint in the rule body; absent that, the rule is universal.
function matchesStack(lesson, stack) {
  const hint = /stack:\s*\[?([a-z0-9 ,._+-]+)\]?/i.exec(lesson.rule || '');
  if (!hint) return true;
  if (stack.length === 0) return true;
  const declared = hint[1].toLowerCase().split(/[\s,]+/).filter(Boolean);
  return declared.some((d) => stack.includes(d));
}

/**
 * Render the "Learned Standards" section appended to quality-standards.md.
 * Returns '' when there are no earned lessons (so the default scaffold is byte
 * identical to before — no born-immune noise until a rule is actually earned).
 */
export function renderLearnedStandards(lessons) {
  if (!lessons || lessons.length === 0) return '';
  const out = [];
  out.push('');
  out.push('## Learned Standards (earned from prior projects)');
  out.push('');
  out.push('These clauses were promoted from recurring lessons via the human-gated');
  out.push('promotion ladder (ADR-021). Each carries its provenance — a scar, not a');
  out.push('style preference. Reviewers enforce them at the named tier.');
  out.push('');
  for (const l of lessons) {
    const tier = l.enforcementTier ? ` _(tier: ${l.enforcementTier})_` : '';
    const prov = l.contexts && l.contexts.length ? ` — earned in ${l.contexts.join(', ')}` : '';
    out.push(`- **${l.title}** [${l.id}${l.fingerprint ? ' · ' + l.fingerprint : ''}]${tier}${prov}`);
    for (const line of firstSentences(l.rule)) out.push(`  ${line}`);
  }
  out.push('');
  return out.join('\n');
}

/**
 * Render a standalone compiled methodology file (.claude/bmad/methodology/
 * earned-lessons.md) listing every promoted rule with its detection heuristic.
 * Returns '' when there are no earned lessons.
 */
export function renderEarnedMethodology(lessons) {
  if (!lessons || lessons.length === 0) return '';
  const out = [];
  out.push('# Earned Lessons (compiled from promoted L-records)');
  out.push('');
  out.push('Generated at init/update from the human-promoted lessons in the knowledge');
  out.push('ledger. Do not edit by hand — promote or retire lessons through');
  out.push('`record.cjs` and regenerate. Each rule below is enforcement-active at its');
  out.push('named tier; the detection heuristic tells a reviewer what to look for.');
  out.push('');
  for (const l of lessons) {
    out.push(`## ${l.id} — ${l.title}`);
    out.push('');
    out.push(`- **fingerprint:** ${l.fingerprint || '(none)'}`);
    out.push(`- **enforcement tier:** ${l.enforcementTier || 'reviewer-lens'}`);
    if (l.contexts && l.contexts.length) out.push(`- **earned in:** ${l.contexts.join(', ')} (${l.occurrenceCount} contexts)`);
    out.push('');
    out.push(l.rule || '(no rule text)');
    out.push('');
  }
  return out.join('\n');
}

// First 1–2 non-empty lines of a rule body, for the terse quality-standards clause.
function firstSentences(rule) {
  const lines = String(rule || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.slice(0, 2);
}
