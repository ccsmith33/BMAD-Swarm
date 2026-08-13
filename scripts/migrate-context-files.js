#!/usr/bin/env node
// scripts/migrate-context-files.js — one-shot migration of the pre-envelope
// context files into the unified ledger (ADR-021 / D-036, phase2 §4.1).
//
//   artifacts/context/findings-register.md  -> F-records in ledger.md (each
//     existing F-NNN keeps its number and provenance; the decision-trail becomes
//     occurrences).
//   the recurring lessons in lessons-learned.md -> L-records in ledger.md
//     (fingerprinted; entering at `observed`, or `recurring` where the retros
//     document the same pattern across >=2 epics; the synthetic-fixture lesson
//     is L-001 per D-044, entering at `recurring` per the vision).
//
// Originals are replaced by a pointer stub for one release (WS-11 migration
// table), then deleted — so the five-file cap holds and nothing is lost (the
// rich retrospective prose remains in git history). Idempotent by construction:
// it rebuilds ledger.md from the sources each run.
//
// Importable (parseFindings / LESSON_RECORDS / buildLedger / migrate) for the
// golden-file test; runnable as a CLI (`node scripts/migrate-context-files.js
// [--context-dir <dir>] [--dry-run]`).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serializeRecord, LEDGER_HEADER, validateEnvelope } from '../utils/record-envelope.js';

const KNOWN_ROLES = ['reviewer', 'security', 'developer', 'architect', 'strategist', 'ideator', 'researcher', 'devops', 'orchestrator'];

// --- findings-register.md -> F-records -------------------------------------

function slugify(text, maxWords = 8) {
  return String(text)
    .replace(/`[^`]*`/g, (m) => m.replace(/`/g, '')) // drop code fences, keep text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join('-');
}

function firstPathRef(text) {
  const m = /(artifacts\/[^\s`)]+)/.exec(text || '');
  return m ? m[1] : null;
}

function extractDIds(text) {
  const ids = new Set();
  const re = /\bD-\d+\b/g;
  let m;
  while ((m = re.exec(text || '')) !== null) ids.add(m[0]);
  return [...ids];
}

// Pull the value of a `- **Field:** value` line (value runs until the next
// top-level `- **` bullet or a nested `  -` sub-list).
function fieldValue(block, field) {
  const re = new RegExp(`^- \\*\\*${field}:\\*\\*\\s*([\\s\\S]*?)(?=\\n- \\*\\*|\\n  -|\\n## |$)`, 'm');
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

function parseDecisionTrail(block) {
  const m = /- \*\*Decision trail:\*\*\s*([\s\S]*?)(?=\n## |$)/.exec(block);
  if (!m) return [];
  const out = [];
  const re = /^\s+-\s+(\d{4}-\d{2}-\d{2})\s+—\s+by\s+([^\s—]+)\s+—\s+([^\s—]+)/gm;
  let e;
  while ((e = re.exec(m[1])) !== null) {
    out.push({ project: 'bmad-swarm', date: e[1], ref: e[3] });
  }
  return out;
}

function normStatus(raw) {
  if (!raw) return 'open';
  const t = raw.toLowerCase();
  if (t.startsWith('resolved')) return 'resolved';
  if (t.startsWith('superseded')) return 'superseded';
  return 'open';
}

function roleFromSource(source) {
  if (!source) return 'reviewer';
  const first = source.trim().split(/[\s(]/)[0].toLowerCase();
  return KNOWN_ROLES.includes(first) ? first : 'reviewer';
}

/**
 * Parse findings-register.md into logical F-records (envelope objects).
 * @param {string} md
 * @returns {object[]}
 */
export function parseFindings(md) {
  const records = [];
  // Split on real finding headings (F-<digits>), skipping the `## F-NNN` legend.
  const re = /^## (F-\d+) — (.+?)$([\s\S]*?)(?=^## F-\d+ — |\Z)/gm;
  // The above lookahead needs a terminator; iterate manually instead.
  const headRe = /^## (F-\d+) — (.+)$/gm;
  const heads = [];
  let h;
  while ((h = headRe.exec(md)) !== null) {
    heads.push({ id: h[1], title: h[2].trim(), index: h.index, headLen: h[0].length });
  }
  for (let i = 0; i < heads.length; i++) {
    const cur = heads[i];
    const end = i + 1 < heads.length ? heads[i + 1].index : md.length;
    const block = md.slice(cur.index, end);

    const date = fieldValue(block, 'Date') || '2026-01-01';
    const source = fieldValue(block, 'Source') || '';
    const status = normStatus(fieldValue(block, 'Status'));
    const severity = fieldValue(block, 'Severity') || 'advisory';
    const description = fieldValue(block, 'Description') || cur.title;
    const suggested = fieldValue(block, 'Suggested fix') || '';
    const occurrences = parseDecisionTrail(block);
    const ref = firstPathRef(source);
    const dIds = extractDIds(block);

    const bodyParts = [description.replace(/\s+/g, ' ').trim()];
    if (suggested) bodyParts.push(`Suggested fix: ${suggested.replace(/\s+/g, ' ').trim()}`);
    bodyParts.push(`Severity: ${severity.replace(/\s+/g, ' ').trim()}.`);

    records.push({
      id: cur.id,
      type: 'finding',
      status,
      fingerprint: slugify(cur.title),
      title: cur.title,
      provenance: { role: roleFromSource(source), project: 'bmad-swarm', date, occurrences },
      evidence: ref ? [{ kind: 'citation', status: 'cited', ref }] : [],
      links: dIds.length ? { d_ids: dIds } : { d_ids: [] },
      body: bodyParts.join(' '),
    });
  }
  return records;
}

// --- lessons-learned.md -> L-records (curated recurring patterns) ----------

// The durable lessons the four epic retrospectives name. Patterns documented
// across >=2 epics enter at `recurring`; single-epic ones at `observed`. The
// synthetic-fixture lesson keeps its referenced ID L-001 (D-044) and enters at
// `recurring` per the vision (§4.2). Occurrences preserve the source epics.
export const LESSON_RECORDS = [
  {
    id: 'L-001',
    type: 'lesson',
    status: 'recurring',
    fingerprint: 'synthetic-fixture-masks-real-data',
    title: 'Synthetic fixtures mask real-data failures',
    provenance: {
      role: 'reviewer', project: 'bmad-swarm', date: '2026-08-12',
      occurrences: [
        { project: 'bmad-swarm', date: '2026-08-12', ref: 'honest-foundation-review' },
      ],
    },
    evidence: [{ kind: 'citation', status: 'cited', ref: 'artifacts/reviews/review-honest-foundation-2026-08-12.md' }],
    links: { d_ids: ['D-044'] },
    body: 'A test fixture that is synthetic (hand-authored) rather than captured from a real run can pass while the real-data path fails. Detection: any fixture on an external/real-data path must declare captured_from or synthetic:true; a synthetic fixture standing in for real data is a reviewer red flag (the fixture-provenance lens, L-001).',
  },
  {
    id: 'L-002',
    type: 'lesson',
    status: 'recurring',
    fingerprint: 'race-replay-across-session-restart',
    title: 'Phantom task-assignment replay across session restarts',
    provenance: {
      role: 'orchestrator', project: 'bmad-swarm', date: '2026-04-29',
      occurrences: [
        { project: 'bmad-swarm', date: '2026-04-29', ref: 'wide-team-epic' },
        { project: 'bmad-swarm', date: '2026-04-30', ref: 'retrofit-epic' },
      ],
    },
    evidence: [{ kind: 'citation', status: 'cited', ref: 'artifacts/context/lessons-learned.md' }],
    links: { d_ids: [] },
    body: 'After a mid-epic session restart, developers and reviewers receive phantom task_assignment notifications for already-completed work. Handled gracefully (re-verify disk state, report no rework) but noisy. Detection heuristic: on session restart, reconcile the task queue against disk state before acting on any wake. Motivates the RES-2 reconciliation work.',
  },
  {
    id: 'L-003',
    type: 'lesson',
    status: 'recurring',
    fingerprint: 'spec-derived-files-drift-without-import',
    title: 'Files deriving from the same upstream spec drift unless one imports the other',
    provenance: {
      role: 'reviewer', project: 'bmad-swarm', date: '2026-04-29',
      occurrences: [
        { project: 'bmad-swarm', date: '2026-04-29', ref: 'F-003-hook-config-duplication' },
        { project: 'bmad-swarm', date: '2026-04-30', ref: 'F-004-regex-duplication' },
      ],
    },
    evidence: [{ kind: 'citation', status: 'cited', ref: 'artifacts/context/findings-register.md' }],
    links: { d_ids: ['D-019'] },
    body: 'When two files encode the same upstream fact (a default, a regex, a schema) by copy, they drift. The cheap fix is always the same: export-and-import from one source of truth, not duplicate (D-019 is the model citizen; F-003/F-004 are the cautionary instances). Detection: any constant or pattern that appears verbatim in two files is a drift candidate.',
  },
  {
    id: 'L-004',
    type: 'lesson',
    status: 'observed',
    fingerprint: 'out-of-scope-adjacent-findings-cluster',
    title: 'Reviews of schema/hook-adjacent code surface a cluster of out-of-scope findings',
    provenance: {
      role: 'reviewer', project: 'bmad-swarm', date: '2026-04-29',
      occurrences: [
        { project: 'bmad-swarm', date: '2026-04-29', ref: 'wide-team-epic' },
      ],
    },
    evidence: [{ kind: 'citation', status: 'cited', ref: 'artifacts/context/lessons-learned.md' }],
    links: { d_ids: [] },
    body: 'Implementing a schema- or hook-adjacent feature reliably makes the reviewer surface "while we\'re here" validation/coverage gaps in code touched but not owned by the story (F-001/F-002/F-003 shape). Detection: ensure the findings register exists before the first review so these do not fall on the floor; log them advisory, do not scope-creep the story.',
  },
];

// --- ledger assembly + stubs -----------------------------------------------

/**
 * Build the full ledger.md content from F-records and L-records.
 * F-records are emitted in numeric ID order, then L-records.
 * @param {object[]} findingRecords
 * @param {object[]} lessonRecords
 * @returns {string}
 */
export function buildLedger(findingRecords, lessonRecords) {
  const findings = [...findingRecords].sort((a, b) => idNum(a.id) - idNum(b.id));
  const lessons = [...lessonRecords].sort((a, b) => idNum(a.id) - idNum(b.id));
  const sections = [...findings, ...lessons].map(serializeRecord);
  return LEDGER_HEADER.replace(/\s*$/, '\n') + '\n' + sections.join('\n\n') + '\n';
}

function idNum(id) { return parseInt(String(id).split('-')[1], 10); }

function stub(kind, movedInto) {
  return `# ${kind} (migrated)

The contents of this file were migrated into \`artifacts/context/ledger.md\` as
typed ${movedInto} per ADR-021 / D-036. This pointer stub is retained for one
release (WS-11 migration table) and will then be deleted. The original prose
remains recoverable in git history.

See \`.claude/bmad/methodology/artifact-schemas/record-envelope.md\` for the
record shape, and append via \`node .claude/bmad/bin/record.cjs\`.
`;
}

/**
 * Run the migration against a context dir.
 * @param {{contextDir: string, dryRun?: boolean}} opts
 * @returns {{ledger: string, findings: number, lessons: number, errors: string[]}}
 */
export function migrate(opts) {
  const contextDir = resolve(opts.contextDir);
  const findingsPath = join(contextDir, 'findings-register.md');
  const lessonsPath = join(contextDir, 'lessons-learned.md');
  const ledgerPath = join(contextDir, 'ledger.md');

  const findingsMd = existsSync(findingsPath) ? readFileSync(findingsPath, 'utf8') : '';
  const findingRecords = parseFindings(findingsMd);
  const lessonRecords = LESSON_RECORDS;

  // Idempotency / safety: a one-shot migration must not eat its own output. If
  // findings-register.md is already a stub (no F-records) and ledger.md exists,
  // the migration already ran — return the existing ledger untouched rather
  // than rebuilding it from an empty source.
  if (findingRecords.length === 0 && existsSync(ledgerPath)) {
    const existing = readFileSync(ledgerPath, 'utf8');
    return { ledger: existing, findings: 0, lessons: lessonRecords.length, errors: [], skipped: true };
  }

  const errors = [];
  for (const rec of [...findingRecords, ...lessonRecords]) {
    const e = validateEnvelope(rec);
    if (e.length) errors.push(`${rec.id}: ${e.join('; ')}`);
  }

  const ledger = buildLedger(findingRecords, lessonRecords);

  if (!opts.dryRun) {
    if (errors.length) {
      throw new Error('migration produced invalid records:\n  - ' + errors.join('\n  - '));
    }
    writeFileSync(ledgerPath, ledger);
    if (existsSync(findingsPath)) writeFileSync(findingsPath, stub('Findings Register', 'F-records'));
    if (existsSync(lessonsPath)) writeFileSync(lessonsPath, stub('Lessons Learned', 'L-records'));
  }

  return { ledger, findings: findingRecords.length, lessons: lessonRecords.length, errors };
}

// --- CLI -------------------------------------------------------------------

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const cdIdx = argv.indexOf('--context-dir');
  const contextDir = cdIdx !== -1 ? argv[cdIdx + 1]
    : join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), 'artifacts', 'context');
  const res = migrate({ contextDir, dryRun });
  if (res.errors.length) {
    process.stderr.write('validation problems:\n  - ' + res.errors.join('\n  - ') + '\n');
  }
  process.stdout.write(`${dryRun ? '[dry-run] ' : ''}migrated ${res.findings} F-records + ${res.lessons} L-records into ledger.md\n`);
  if (res.errors.length && !dryRun) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
