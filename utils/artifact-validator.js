import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';
import yaml from 'js-yaml';
import { PACKAGE_METHODOLOGY_DIR } from './paths.js';

// The claims-table parser + vocabulary are single-sourced from the self-contained
// replay engine (bin/replay-check.cjs), so the advisory claims lint and the
// cli/doctor decay pass agree on what a claims table IS (no mirror to drift —
// the pattern utils/evidence.js uses over the same engine).
const require = createRequire(import.meta.url);
const { parseClaimsTable, CLAIM_STATUSES, extractCommit } = require('../bin/replay-check.cjs');

/**
 * The machine projection of the artifact schemas. This is the ONE structural
 * source the validator consults — nothing about artifact structure is hardcoded
 * here. See methodology/artifact-schemas/spec.yaml (lockstep-tested against the
 * prose schemas by test/artifact-spec.test.js).
 */
const SPEC_PATH = join(PACKAGE_METHODOLOGY_DIR, 'artifact-schemas', 'spec.yaml');

/** Phases the validator understands, in report order. Also drives `validate --phase`. */
export const VALID_PHASES = ['exploration', 'planning', 'design', 'implementation', 'reviews'];

let cachedSpec = null;
function loadSpec() {
  if (!cachedSpec) {
    cachedSpec = yaml.load(readFileSync(SPEC_PATH, 'utf8'));
  }
  return cachedSpec;
}

/**
 * Validate artifacts and return results.
 * @param {string} artifactsDir - Path to artifacts directory
 * @param {object} options - { phase, artifact }
 * @returns {{ passed: number, failed: number, results: Array<{file, status, issues}> }}
 */
export function validateArtifacts(artifactsDir, options = {}) {
  const results = [];

  if (options.artifact) {
    results.push(validateSingleArtifact(options.artifact));
    const passed = results.filter(r => r.status === 'pass').length;
    return { passed, failed: results.length - passed, results };
  }

  if (options.phase && !VALID_PHASES.includes(options.phase)) {
    throw new Error(
      `Unknown phase: ${options.phase}. Valid phases: ${VALID_PHASES.join(', ')}`,
    );
  }

  const phases = options.phase ? [options.phase] : VALID_PHASES;

  for (const phase of phases) {
    const phaseDir = join(artifactsDir, phase);
    if (!existsSync(phaseDir)) continue;

    const files = findMarkdownFiles(phaseDir);
    for (const file of files) {
      results.push(validateSingleArtifact(file));
    }
  }

  const passed = results.filter(r => r.status === 'pass').length;
  return { passed, failed: results.length - passed, results };
}

function findMarkdownFiles(dir) {
  const files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findMarkdownFiles(fullPath));
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch { /* ignore permission errors */ }
  return files;
}

function validateSingleArtifact(filePath) {
  const issues = [];
  const warnings = [];

  if (!existsSync(filePath)) {
    return { file: filePath, status: 'fail', issues: ['File does not exist'], warnings };
  }

  const content = readFileSync(filePath, 'utf8');
  const spec = loadSpec();
  const def = classifyArtifact(filePath, spec);
  const effective = def.variants ? selectVariant(content, def.variants) : def;

  checkSections(content, effective.required_sections, issues);
  checkPatterns(content, effective.required_patterns, issues);
  checkConditionalPatterns(content, effective.conditional_patterns, issues);
  // Claims table is an ADVISORY lint (warnings, never issues): a file-shape check
  // is gameable by its author, so it cannot be an honest hard gate (D-039).
  checkClaimsTable(content, warnings);

  return { file: filePath, status: issues.length === 0 ? 'pass' : 'fail', issues, warnings };
}

/**
 * Select the artifact class from the spec by matching file name / path.
 * Falls back to the `generic` class.
 */
function classifyArtifact(filePath, spec) {
  const name = basename(filePath);
  for (const [key, def] of Object.entries(spec.artifacts)) {
    if (key === 'generic') continue;
    const m = def.match || {};
    if (m.basename && name === m.basename) return def;
    if (m.basenamePrefix && name.startsWith(m.basenamePrefix)) return def;
    if (m.pathIncludes && filePath.includes(m.pathIncludes)) return def;
  }
  return spec.artifacts.generic;
}

/**
 * Pick the variant whose discriminator matches the content; the discriminator-less
 * variant is the default when none match.
 */
function selectVariant(content, variants) {
  let fallback = null;
  for (const vdef of Object.values(variants)) {
    if (vdef.discriminator) {
      if (new RegExp(vdef.discriminator, 'im').test(content)) return vdef;
    } else {
      fallback = vdef;
    }
  }
  return fallback || Object.values(variants)[0];
}

/** Normalize a heading's text for tolerant matching (numbering, bold, trailing colon). */
function normalizeHeading(text) {
  return text
    .replace(/\*\*/g, '')
    .replace(/^[\d.]+\s*/, '')
    .replace(/:\s*$/, '')
    .trim()
    .toLowerCase();
}

/** Extract all Markdown heading texts from the content, normalized. */
function contentHeadings(content) {
  const headings = [];
  for (const line of content.split('\n')) {
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (m) headings.push(normalizeHeading(m[1]));
  }
  return headings;
}

function checkSections(content, sections, issues) {
  if (!sections) return;
  const headings = contentHeadings(content);
  for (const section of sections) {
    const needle = section.trim().toLowerCase();
    const found = headings.some(h => h === needle || h.startsWith(needle));
    if (!found) issues.push(`Missing required section: ${section}`);
  }
}

function checkPatterns(content, patterns, issues) {
  if (!patterns) return;
  for (const p of patterns) {
    if (p.regex) {
      if (!new RegExp(p.regex, 'm').test(content)) {
        issues.push(p.message || `Missing required pattern: ${p.name}`);
      }
    } else if (typeof p.min_length === 'number') {
      if (content.trim().length < p.min_length) {
        issues.push(p.message || `Content appears too short (< ${p.min_length} chars)`);
      }
    }
  }
}

/**
 * Optional-field format checks: if `if_regex` matches, `must_regex` must too.
 * A file where the field is absent passes untouched — this is how the spec
 * expresses "optional, but well-formed when present" (e.g. story Depends-On).
 *
 * Self-implemented here in the exact shape of the `conditional_patterns`
 * capability staged on the l5-parallelism-promotion branch, which is NOT on this
 * baseline (94b2fe8) — so a later L-5 merge is a trivial dedupe of one identical
 * function, not a re-integration (Phase 4 §3.3 named dependency 3, fallback path).
 */
export function checkConditionalPatterns(content, patterns, issues) {
  if (!patterns) return;
  for (const p of patterns) {
    if (!new RegExp(p.if_regex, 'm').test(content)) continue;
    if (!new RegExp(p.must_regex, 'm').test(content)) {
      issues.push(p.message || `Malformed optional field: ${p.name}`);
    }
  }
}

/**
 * Advisory claims-table lint (Phase 4 Stream V — diverge-verification §2). A
 * claims table is OPTIONAL; when present it must be well-formed. Every finding is
 * a WARNING, never an issue — the claim table's presence and shape are gameable
 * by the artifact's own author, so treating them as a hard gate would launder
 * exactly the theater D-039 warns against. The load-bearing verification is the
 * reviewer attacking the claims (Tier 1) and the deterministic decay pass.
 *
 * Checks: 3–7 claim budget, statuses in the {checked,cited,attested,assumed}
 * vocabulary, `checked` claims pin a commit, no duplicate C-IDs, and inline
 * [C-NNN] markers resolve to a table row.
 *
 * @param {string} content - artifact markdown
 * @param {string[]} warnings - advisory sink (mutated)
 */
export function checkClaimsTable(content, warnings) {
  const rows = parseClaimsTable(content);
  const inline = new Set();
  for (const m of content.matchAll(/\[(C-\d+)\]/gi)) inline.add(m[1].toUpperCase());

  if (rows.length === 0) {
    if (inline.size > 0) {
      warnings.push(`Claims lint: ${inline.size} inline C-ID marker(s) but no claims table — add a footer table (| C-ID | Claim | Status | Backing |) so the markers resolve`);
    }
    return; // no table, no claims — claims tables are optional
  }

  // Budget: 3–7 load-bearing claims (§2.1). Over drowns the signal; under hints
  // either an under-claimed artifact or a table not worth keeping.
  if (rows.length > 7) {
    warnings.push(`Claims lint: ${rows.length} claims exceed the 3–7 budget — a table this long trains readers to skim; keep only load-bearing claims`);
  } else if (rows.length < 3) {
    warnings.push(`Claims lint: ${rows.length} claim(s) is below the 3–7 budget — either surface more load-bearing assertions or drop the table`);
  }

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.cid)) {
      warnings.push(`Claims lint: duplicate ${row.cid} in the claims table`);
    }
    seen.add(row.cid);

    if (!CLAIM_STATUSES.includes(row.status)) {
      const what = row.status ? `unknown status '${row.status}'` : 'no status';
      warnings.push(`Claims lint: ${row.cid} has ${what} — use one of ${CLAIM_STATUSES.join(' | ')}`);
    } else if (row.status === 'checked' && !extractCommit(row.backing)) {
      warnings.push(`Claims lint: ${row.cid} is 'checked' but its Backing pins no commit — a checked claim must record the commit it was verified at`);
    }
  }

  // Inline markers with no table row are unresolved references.
  const tableIds = new Set(rows.map((r) => r.cid));
  for (const id of inline) {
    if (!tableIds.has(id)) {
      warnings.push(`Claims lint: ${id} is referenced inline but absent from the claims table`);
    }
  }
}
