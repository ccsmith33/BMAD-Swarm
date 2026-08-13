// The project brain — comprehension continuity (phase2 design §4.4,
// continuity divergence §1). One curated, bounded artifact that survives
// compaction and fresh starts: what the project IS, the current mental model,
// the surprises, the WIP threads, the dead ends, the open questions. It holds
// POINTERS into the cold stores (decision-log, ledger, lessons-learned), never
// copies (continuity §1.2 corollary).
//
// This module is the one source of truth for the brain's shape: the schema
// (section → item cap), the frontmatter contract, the token budget + proxy, and
// the touch-or-die eviction (§1.3). The validate/doctor checks, the PreCompact
// flush hook, and the SessionStart warm-boot all read it. Body writes are the
// orchestrator's job (single-writer, prose); this module never writes the file
// — it parses, validates, and computes an eviction plan.

import yaml from 'js-yaml';

// Schema tag stamped in frontmatter; bump when the section set/caps change.
export const SCHEMA_VERSION = 'project-brain/1';

// Hard budget. The budget IS the design (continuity §1.1): an unbounded brain
// becomes a second transcript, and the eviction pressure is what forces
// curation. ~2,500 tokens ≈ the char-proxy threshold below.
export const BUDGET_TOKENS = 2500;

// Frontmatter keys every brain must carry. `phase`/`gates` are the machine-state
// home that subsumes project.yaml (D-037 / continuity §4.2) — put machine state
// here, never in a separate chore file.
export const REQUIRED_FRONTMATTER = Object.freeze(['schema', 'updated', 'checkpoint', 'phase']);

// The fixed section set, in order, each with its item cap (continuity §1.1).
// `evictable` marks the sections eviction may prune; identity + mental model +
// pointers are protected (identity is the human's intent, §2.4; pointers are the
// fixed index block, §1.1).
export const SECTIONS = Object.freeze([
  { heading: 'What this is (and why)', key: 'identity', max: 5, unit: 'sentence', evictable: false },
  { heading: 'Current mental model', key: 'mental-model', max: 8, unit: 'bullet', evictable: false },
  { heading: 'Load-bearing facts', key: 'facts', max: 10, unit: 'bullet', evictable: true, needsPointer: true },
  { heading: 'Active threads', key: 'threads', max: 6, unit: 'entry', evictable: true },
  { heading: 'Dead ends', key: 'dead-ends', max: 6, unit: 'bullet', evictable: true },
  { heading: 'Open questions', key: 'open-questions', max: 5, unit: 'bullet', evictable: true },
  { heading: 'Pointers', key: 'pointers', max: Infinity, unit: 'line', evictable: false },
]);

const SECTION_BY_HEADING = new Map(SECTIONS.map((s) => [normalizeHeading(s.heading), s]));

function normalizeHeading(h) {
  return String(h).trim().toLowerCase();
}

/**
 * Token estimate — the char/4 proxy the design calls for (a "word-count proxy",
 * §4.4). Deterministic and dependency-free; it is the number the budget gate and
 * the eviction loop both use, so the proxy just has to be consistent, not exact.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

/**
 * Split a brain file into { frontmatter, body, raw, frontmatterBlock }.
 * Frontmatter is the leading `---`-fenced YAML block; body is everything after
 * it. `frontmatterBlock` is the VERBATIM leading slice (fences included) such
 * that `frontmatterBlock + body === raw` byte-for-byte — so eviction can measure
 * against the same serialization the budget gate measures, never a re-`dump`ed
 * copy (M-2).
 * @param {string} text
 * @returns {{ frontmatter: object|null, body: string, raw: string, frontmatterBlock: string, frontmatterError: string|null }}
 */
export function splitFrontmatter(text) {
  const raw = String(text || '');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) return { frontmatter: null, body: raw, raw, frontmatterBlock: '', frontmatterError: 'no --- frontmatter block' };
  let frontmatter = null;
  let frontmatterError = null;
  try {
    frontmatter = yaml.load(m[1]) || {};
  } catch (e) {
    frontmatterError = e && e.message ? e.message : String(e);
  }
  const body = m[2] || '';
  // Exact prefix (handles the optional trailing newline after the closing ---).
  const frontmatterBlock = raw.slice(0, raw.length - body.length);
  return { frontmatter, body, raw, frontmatterBlock, frontmatterError };
}

// Parse a `## Heading` sectioned markdown body into ordered sections. Each
// section carries its raw text and its list items (lines beginning with `-`).
// Bullet items may end with a touch marker `@cN` (the checkpoint they were last
// confirmed at, §1.3); it is stripped from `.text` and surfaced as `.touchedAt`.
function parseSections(body) {
  const lines = String(body).split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const h = /^##\s+(.*\S)\s*$/.exec(line);
    if (h) {
      current = { heading: h[1].trim(), rawLines: [], items: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    current.rawLines.push(line);
    const b = /^\s*[-*]\s+(.*\S)\s*$/.exec(line);
    if (b) current.items.push(parseItem(b[1]));
  }
  for (const s of sections) s.raw = s.rawLines.join('\n');
  return sections;
}

// Extract a trailing `@cN` touch marker from a bullet, if present.
function parseItem(text) {
  const m = /\s*@c(\d+)\s*$/.exec(text);
  if (m) return { text: text.slice(0, m.index).trim(), touchedAt: Number(m[1]) };
  return { text: text.trim(), touchedAt: null };
}

/**
 * Parse a brain file into a structured object.
 * @param {string} text
 * @returns {{ frontmatter, body, sections, sectionMap, frontmatterError }}
 */
export function parseBrain(text) {
  const { frontmatter, body, frontmatterBlock, frontmatterError } = splitFrontmatter(text);
  const sections = parseSections(body);
  const sectionMap = new Map();
  for (const s of sections) sectionMap.set(normalizeHeading(s.heading), s);
  return { frontmatter, body, frontmatterBlock, sections, sectionMap, frontmatterError };
}

/**
 * Validate a brain against the schema, the frontmatter contract, and the budget.
 * Over-budget is an ERROR (the checkpoint write must fail and force an eviction
 * pass, §1.3) — not a soft warning. Item-cap overflow is likewise an error.
 *
 * @param {string} text - The full brain file contents.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], tokens: number, overBudget: boolean }}
 */
export function validateBrain(text) {
  const errors = [];
  const warnings = [];
  const parsed = parseBrain(text);
  const fm = parsed.frontmatter;

  if (parsed.frontmatterError) {
    errors.push(`frontmatter: ${parsed.frontmatterError}`);
  } else if (!fm || typeof fm !== 'object') {
    errors.push('frontmatter: missing or not a mapping');
  } else {
    for (const key of REQUIRED_FRONTMATTER) {
      if (fm[key] === undefined || fm[key] === null || fm[key] === '') {
        errors.push(`frontmatter: missing required key "${key}"`);
      }
    }
    if (fm.schema !== undefined && fm.schema !== SCHEMA_VERSION) {
      errors.push(`frontmatter: schema is "${fm.schema}", expected "${SCHEMA_VERSION}"`);
    }
    if (fm.checkpoint !== undefined && !Number.isInteger(fm.checkpoint)) {
      errors.push('frontmatter: checkpoint must be an integer');
    }
  }

  // Every required section present, in the schema, and within its item cap.
  for (const spec of SECTIONS) {
    const sec = parsed.sectionMap.get(normalizeHeading(spec.heading));
    if (!sec) {
      errors.push(`section: missing "## ${spec.heading}"`);
      continue;
    }
    const count = spec.unit === 'sentence' ? countSentences(sec.raw) : sec.items.length;
    if (count > spec.max) {
      errors.push(`section "${spec.heading}": ${count} ${spec.unit}s exceeds cap of ${spec.max} — evict before checkpoint`);
    }
    if (spec.needsPointer) {
      for (const item of sec.items) {
        if (!hasPointer(item.text)) {
          warnings.push(`section "${spec.heading}": item has no evidence pointer (path or D-ID): "${truncate(item.text)}"`);
        }
      }
    }
  }

  // Any `## Heading` not in the schema is a drift signal (warning, not fatal —
  // prose between sections is legal).
  for (const sec of parsed.sections) {
    if (!SECTION_BY_HEADING.has(normalizeHeading(sec.heading))) {
      warnings.push(`section "${sec.heading}": not in the project-brain schema`);
    }
  }

  const tokens = estimateTokens(text);
  const overBudget = tokens > BUDGET_TOKENS;
  if (overBudget) {
    errors.push(`budget: ${tokens} tokens exceeds the ${BUDGET_TOKENS}-token cap — run an eviction pass (touch-or-die) before checkpoint`);
  }

  return { ok: errors.length === 0, errors, warnings, tokens, overBudget };
}

/**
 * Extract the brain's verifiable pointers: cold-store file paths and cited
 * D-IDs (continuity §2.5 anti-fabrication guard — Vantage's 22 fabricated paths).
 * Only `artifacts/…` paths are returned (the cold stores + phase artifacts the
 * brain indexes); scaffold refs like `.claude/…` are deliberately excluded — they
 * are regenerated, not durable records, and would false-positive against a stale
 * dogfood install. The `next D-ID: D-NNN` pointer line is skipped: that ID is
 * intentionally not-yet-allocated.
 * @param {string} text
 * @returns {{ paths: string[], dIds: string[] }}
 */
export function extractPointers(text) {
  const paths = new Set();
  for (const m of String(text).matchAll(/\b(artifacts\/[\w./-]+\.\w{2,5})\b/g)) paths.add(m[1]);
  const dIds = new Set();
  for (const line of String(text).split('\n')) {
    if (/next\s*d-id/i.test(line)) continue; // the "next D-ID" pointer is not-yet-allocated
    for (const m of line.matchAll(/\bD-\d+\b/g)) dIds.add(m[0]);
  }
  return { paths: [...paths], dIds: [...dIds] };
}

// A load-bearing fact must carry a resolvable pointer: a file path or a D-ID
// (or L-/F-/R-/C- record id). The anti-fabrication guard (continuity §2.5 /
// Vantage's 22 fabricated paths) — a brain of unpointered assertions accumulates
// confident falsehoods.
function hasPointer(text) {
  return /\b[DLFRC]-\d+\b/.test(text) || /[\w./-]+\.[a-z]{2,4}\b/.test(text) || /artifacts\//.test(text);
}

function countSentences(text) {
  const t = String(text).trim();
  if (!t) return 0;
  // Sentence-ish: terminal ., !, ? that end a clause. Good enough for a cap.
  const matches = t.match(/[.!?](\s|$)/g);
  return matches ? matches.length : 1;
}

function truncate(s, n = 60) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * Touch-or-die eviction (§1.3). When the brain is over budget, prune the
 * oldest-touched entries from evictable sections until it fits — resolved/stale
 * detail already lives in the cold stores the brain points at. Entries with no
 * `@cN` touch marker are treated as freshly touched (age unknown ⇒ never
 * auto-evicted); the orchestrator's checkpoint ritual is where those get curated
 * by judgment. Identity, mental-model, and pointers are protected and never cut.
 *
 * This is a PLAN + a rebuilt body — it does not write the file. Deterministic so
 * it is unit-testable.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.budget=BUDGET_TOKENS]
 * @returns {{ body: string, evicted: Array<{section:string,text:string,touchedAt:number|null}>,
 *            tokens: number, underBudget: boolean, protectedRemaining: boolean }}
 */
export function evictToBudget(text, opts = {}) {
  const budget = opts.budget ?? BUDGET_TOKENS;
  const { frontmatterBlock, body } = splitFrontmatter(text);

  // Work directly on the RAW body lines so a zero-eviction result reserializes
  // byte-for-byte to the input (frontmatterBlock + body === raw), and the token
  // count agrees exactly with validateBrain (M-2). Only whole evicted bullet
  // lines are removed; every other line is preserved verbatim.
  const evictableSpecs = new Set(SECTIONS.filter((s) => s.evictable).map((s) => normalizeHeading(s.heading)));
  const lines = body.split('\n');
  const candidates = [];        // { lineIdx, heading, item }
  let currentHeadingNorm = null;
  let currentHeading = null;
  lines.forEach((line, lineIdx) => {
    const h = /^##\s+(.*\S)\s*$/.exec(line);
    if (h) { currentHeading = h[1].trim(); currentHeadingNorm = normalizeHeading(currentHeading); return; }
    const b = /^\s*[-*]\s+(.*\S)\s*$/.exec(line);
    if (b && currentHeadingNorm && evictableSpecs.has(currentHeadingNorm)) {
      candidates.push({ lineIdx, heading: currentHeading, item: parseItem(b[1]) });
    }
  });

  // Oldest touched first; null (unmarked) sorts last, but we STOP before cutting
  // unmarked items (protected by judgment), so in practice unmarked entries
  // survive mechanical eviction.
  candidates.sort((a, b) => {
    const ta = a.item.touchedAt, tb = b.item.touchedAt;
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb;
  });

  const dropped = new Set();    // line indices to remove
  const evicted = [];
  const render = () => frontmatterBlock + lines.filter((_, i) => !dropped.has(i)).join('\n');
  for (const c of candidates) {
    if (estimateTokens(render()) <= budget) break;
    if (c.item.touchedAt === null) break; // do not mechanically cut unmarked items
    dropped.add(c.lineIdx);
    evicted.push({ section: c.heading, text: c.item.text, touchedAt: c.item.touchedAt });
  }

  const rebuiltBody = lines.filter((_, i) => !dropped.has(i)).join('\n');
  const tokens = estimateTokens(frontmatterBlock + rebuiltBody);
  return {
    body: rebuiltBody,
    evicted,
    tokens,
    underBudget: tokens <= budget,
    // true if we ran out of evictable/marked items before fitting — the
    // orchestrator must curate identity/mental-model/pointers by hand.
    protectedRemaining: tokens > budget,
  };
}
