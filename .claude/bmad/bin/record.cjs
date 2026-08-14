#!/usr/bin/env node
// bmad-generated:60a7cbed
// BMAD Swarm - record.cjs: the pinned, serialized-write channel for the unified
// record ledger (ADR-021 / D-036 / D-049; phase2 design §3.2, §4.1).
//
// This is the ONLY sanctioned writer of the serialized context files:
//   - artifacts/context/ledger.md        (R/L/C/F records, fenced-YAML envelope)
//   - artifacts/context/decision-log.md  (D records, human-readable prose)
//   - artifacts/context/task-ledger.md   (task lifecycle event lines)
// The ledger-write-guard PreToolUse hook denies DIRECT Edit/Write/MultiEdit to
// these files for EVERY agent identity, so this CLI is the only door (RES-6:
// two agents raced the decision-log live — the append here is lock + atomic).
//
// SELF-CONTAINED BY CONSTRAINT: this file is shipped verbatim into user projects
// at .claude/bmad/bin/record.cjs, where neither bmad-swarm's utils/ nor its
// node_modules (js-yaml) exist. Like the hooks, it uses ONLY node built-ins.
// Consequence: machine INPUT is JSON (JSON.parse is built-in); the STORED ledger
// format is still fenced YAML (ADR-021 §3.1) — record.cjs EMITS yaml, it does not
// parse arbitrary yaml. (Deviation from the design's "--file <yaml>" wording,
// forced by the no-dependency rule; documented in the T2 completion note.)
//
// Concurrency model (§3.2): a single directory lock (mkdir is atomic on POSIX)
// serializes every write across all three files; read-modify-write happens under
// the lock; the new content is written to a temp file and renamed over the
// target (atomic replace, ADR-011/RES-8). Monotonic IDs are allocated under the
// lock by scanning existing records, so concurrent appenders never collide.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Schema: the unified record envelope (ADR-021). One shape, five types.
// ---------------------------------------------------------------------------

const TYPES = ['D', 'R', 'L', 'C', 'F'];

const TYPE_NAME = {
  D: 'decision',
  R: 'recommendation',
  L: 'lesson',
  C: 'claim',
  F: 'finding',
};

const NAME_TYPE = {
  decision: 'D',
  recommendation: 'R',
  lesson: 'L',
  claim: 'C',
  finding: 'F',
};

// The single evidence-status vocabulary, everywhere (ADR-021 §2 C-clause).
const EVIDENCE_STATUS = ['checked', 'cited', 'attested', 'assumed'];

// PCA evidence-item kinds (phase2 §4.1 frozen schema).
const EVIDENCE_KINDS = [
  'test-run', 'command', 'file-exists', 'citation',
  'fixture-provenance', 'human-attested', 'assumed',
];

// Per-type status vocabularies + the promotion state machine as data
// (ADR-021 §2). A status maps to the set of statuses it may transition TO.
// C has no ladder — claims decay, they don't promote — so every C status may
// move to any other (computed below).
const C_STATUS = ['checked', 'cited', 'attested', 'assumed', 'stale'];
const cAllTo = (from) => C_STATUS.filter((s) => s !== from);

const TRANSITIONS = {
  // D: proposed -> accepted -> verified | superseded (unchanged, field-proven).
  D: {
    proposed: ['accepted', 'superseded'],
    accepted: ['verified', 'superseded'],
    verified: ['superseded'],
    superseded: [],
  },
  // R: open -> accepted | rejected(+reopen_trigger) -> reopened -> ...
  R: {
    open: ['accepted', 'rejected'],
    accepted: [],
    rejected: ['reopened'],
    reopened: ['accepted', 'rejected'],
  },
  // L: observed -> recurring -> candidate -> promoted(RATIFICATION MARKER) -> retired.
  L: {
    observed: ['recurring', 'retired'],
    recurring: ['candidate', 'retired'],
    candidate: ['promoted', 'recurring', 'retired'],
    promoted: ['retired'],
    retired: ['observed'],
  },
  // C: decay only, no ladder.
  C: Object.fromEntries(C_STATUS.map((s) => [s, cAllTo(s)])),
  // F: the instance. open -> resolved | superseded; resolved may reopen.
  F: {
    open: ['resolved', 'superseded'],
    resolved: ['open'],
    superseded: [],
  },
};

const INITIAL_STATUS = {
  D: 'proposed',
  R: 'open',
  L: 'observed',
  C: 'checked',
  F: 'open',
};

function statusVocab(type) {
  return Object.keys(TRANSITIONS[type] || {});
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a record envelope object. Returns an array of human-readable error
 * strings (empty === valid). The logical record includes `body` even though the
 * stored format keeps `body:` as a sibling of `record:` in the fenced block.
 *
 * @param {object} rec
 * @returns {string[]}
 */
function validateEnvelope(rec) {
  const errors = [];
  if (!rec || typeof rec !== 'object') return ['record is not an object'];

  // type
  if (!TYPES.includes(rec.type) && !NAME_TYPE[rec.type]) {
    errors.push(`type must be one of ${TYPES.join('|')} (or a long name); got ${JSON.stringify(rec.type)}`);
  }
  const type = TYPES.includes(rec.type) ? rec.type : NAME_TYPE[rec.type];

  // id
  if (typeof rec.id !== 'string' || !/^[DRLCF]-\d+$/.test(rec.id)) {
    errors.push(`id must match <TYPE>-<n>; got ${JSON.stringify(rec.id)}`);
  } else if (type && rec.id[0] !== type) {
    errors.push(`id prefix ${rec.id[0]} does not match type ${type}`);
  }

  // status
  if (type) {
    const vocab = statusVocab(type);
    if (!vocab.includes(rec.status)) {
      errors.push(`status ${JSON.stringify(rec.status)} not in ${type} vocabulary {${vocab.join(', ')}}`);
    }
  }

  // fingerprint required for L and F
  if ((type === 'L' || type === 'F') && (!rec.fingerprint || typeof rec.fingerprint !== 'string' || !rec.fingerprint.trim())) {
    errors.push(`fingerprint is REQUIRED for ${type}-records`);
  }

  // provenance
  const p = rec.provenance;
  if (!p || typeof p !== 'object') {
    errors.push('provenance is required (role, project, date, occurrences)');
  } else {
    if (!p.role) errors.push('provenance.role is required');
    if (!p.project) errors.push('provenance.project is required');
    if (!p.date) errors.push('provenance.date is required');
    if (p.occurrences != null && !Array.isArray(p.occurrences)) {
      errors.push('provenance.occurrences must be an array when present');
    }
  }

  // links + reopen_trigger required on a rejected R
  const links = rec.links || {};
  if (typeof links !== 'object' || Array.isArray(links)) {
    errors.push('links must be an object');
  }
  if (type === 'R' && rec.status === 'rejected') {
    const rt = links.reopen_trigger;
    if (!rt || typeof rt !== 'string' || !rt.trim()) {
      errors.push('links.reopen_trigger is REQUIRED on a rejected R-record');
    }
  }

  // evidence
  if (rec.evidence != null) {
    if (!Array.isArray(rec.evidence)) {
      errors.push('evidence must be an array');
    } else {
      rec.evidence.forEach((item, i) => {
        errors.push(...validateEvidenceItem(item, i));
      });
    }
  }

  // body
  if (typeof rec.body !== 'string' || !rec.body.trim()) {
    errors.push('body must be a non-empty string');
  }

  return errors;
}

function validateEvidenceItem(item, i) {
  const errs = [];
  const at = `evidence[${i}]`;
  if (!item || typeof item !== 'object') return [`${at} is not an object`];
  if (!EVIDENCE_KINDS.includes(item.kind)) {
    errs.push(`${at}.kind ${JSON.stringify(item.kind)} not in {${EVIDENCE_KINDS.join(', ')}}`);
  }
  if (item.status != null && !EVIDENCE_STATUS.includes(item.status)) {
    errs.push(`${at}.status ${JSON.stringify(item.status)} not in {${EVIDENCE_STATUS.join(', ')}}`);
  }
  if (item.kind === 'fixture-provenance') {
    const hasCaptured = item.captured_from != null && item.captured_from !== '';
    const isSynthetic = item.synthetic === true;
    if (hasCaptured === isSynthetic) {
      errs.push(`${at} (fixture-provenance) requires EXACTLY ONE of captured_from / synthetic:true`);
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// YAML emission (deterministic, for the fixed envelope shape only)
// ---------------------------------------------------------------------------

// Emit a scalar. Bare when it is an unambiguous plain token; double-quoted
// (with escaping) otherwise. Numbers/booleans/null pass through bare.
function emitScalar(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  if (s === '') return '""';
  // Bare-safe: letters, digits, and a handful of path/date/id punctuation, with
  // no leading/trailing space and not starting with an indicator character.
  if (/^[A-Za-z0-9][A-Za-z0-9_./+-]*$/.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s)) {
    return s;
  }
  // Escape backslash/quote AND every newline/control char (K-1): an unescaped
  // newline in a field value would close its line and let attacker text inject a
  // new record heading or a forged `status: promoted` block into ledger.md. A
  // scalar is single-line by construction; block bodies use emitBlockBody, not
  // this path, so escaping control chars here never truncates legitimate data.
  return '"' + s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0'))
    + '"';
}

// Collapse a value to a safe SINGLE LINE for a markdown heading / prose field
// (K-1/K-3): newlines and control chars become spaces, so an interpolated title
// can never open a second heading line. Returns '' for empty input.
function sanitizeInline(s) {
  return String(s == null ? '' : s).replace(/[\r\n\t\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Defang a MULTI-LINE prose body written to decision-log.md (K-3): escape any
// ATX-heading line-start (`#`…) so a body line can never masquerade as a
// `## D-NNNN` record heading (which would forge decisions AND poison nextId).
function defangProse(s) {
  return String(s == null ? '' : s)
    .split('\n')
    .map((line) => line.replace(/^(\s*)(#{1,6})(\s)/, '$1\\$2$3'))
    .join('\n');
}

// Emit a value in YAML flow style (used inside {} maps and [] seqs).
function emitFlow(v) {
  if (Array.isArray(v)) {
    return '[' + v.map(emitFlow).join(', ') + ']';
  }
  if (v && typeof v === 'object') {
    const parts = Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .map((k) => `${k}: ${emitFlow(v[k])}`);
    return '{' + parts.join(', ') + '}';
  }
  return emitScalar(v);
}

// Emit a block-scalar body with the given indent.
function emitBlockBody(body, indent) {
  const pad = ' '.repeat(indent);
  const lines = String(body).replace(/\s+$/, '').split('\n');
  return lines.map((l) => (l === '' ? '' : pad + l)).join('\n');
}

/**
 * Serialize a logical record to its fenced-YAML markdown section (ADR-021 §3.1).
 * The heading carries ID + title only (status lives solely in the YAML).
 *
 * @param {object} rec - logical record (envelope fields + title + body)
 * @returns {string}
 */
function serializeRecord(rec) {
  const type = TYPES.includes(rec.type) ? rec.type : NAME_TYPE[rec.type];
  // Heading title is forced single-line (K-1): a newline here would inject a
  // sibling `## L-N … status: promoted` block the born-immune compiler trusts.
  const title = sanitizeInline(rec.title) || '(untitled)';
  const prov = rec.provenance || {};
  const provOut = {
    role: prov.role,
    project: prov.project,
    date: prov.date,
    occurrences: Array.isArray(prov.occurrences) ? prov.occurrences : [],
  };
  const links = rec.links || {};

  const lines = [];
  lines.push(`## ${rec.id} — ${title}`);
  lines.push('');
  lines.push('```yaml');
  lines.push('record:');
  lines.push(`  id: ${rec.id}`);
  lines.push(`  type: ${TYPE_NAME[type]}`);
  lines.push(`  status: ${rec.status}`);
  if (rec.fingerprint) lines.push(`  fingerprint: ${emitScalar(rec.fingerprint)}`);
  lines.push(`  provenance: ${emitFlow(provOut)}`);
  const evidence = Array.isArray(rec.evidence) ? rec.evidence : [];
  if (evidence.length === 0) {
    lines.push('  evidence: []');
  } else {
    lines.push('  evidence:');
    for (const item of evidence) lines.push(`    - ${emitFlow(item)}`);
  }
  lines.push(`  links: ${emitFlow(links)}`);
  lines.push('body: |');
  lines.push(emitBlockBody(rec.body || '', 2));
  lines.push('```');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Lightweight text scanning (no YAML parse): ID allocation + status edits.
// ---------------------------------------------------------------------------

// Highest allocated integer for `type`, counted from the record HEADINGS
// (`## <TYPE>-<n> — …`). Headings are column-0 and single-line (titles are
// sanitized, bodies indented 2 spaces), so escaped or body-embedded
// `id: <TYPE>-N` text can NOT inflate the counter (K-6). This mirrors the
// line-anchored discipline maxDecisionNum already had for D-IDs.
function maxIdNum(content, type) {
  const re = new RegExp(`^##\\s+${type}-(\\d+)\\b`, 'gm');
  let max = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

// For the prose decision log, scan `## D-<n>` headings.
function maxDecisionNum(content) {
  const re = /^##\s+D-(\d+)\b/gm;
  let max = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

function nextId(content, type) {
  if (type === 'D') return `D-${maxDecisionNum(content) + 1}`;
  return `${type}-${maxIdNum(content, type) + 1}`;
}

// Return {start, end} char offsets of the section for `id` in ledger content
// (heading `## <id> —` through the char before the next `## ` or EOF), or null.
function sectionBounds(content, id) {
  const headRe = new RegExp(`^##\\s+${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s+—`, 'm');
  const h = headRe.exec(content);
  if (!h) return null;
  const start = h.index;
  const nextRe = /^##\s+/gm;
  nextRe.lastIndex = start + h[0].length;
  const n = nextRe.exec(content);
  const end = n ? n.index : content.length;
  return { start, end };
}

// Read the current top-level record status inside a section slice. The record's
// own `status:` sits on its own line; evidence-item statuses are inline in flow
// maps ({... status: cited ...}) so `^\s*status:` never matches those.
function currentStatus(sectionText) {
  const m = /^\s*status:\s*(\S+)/m.exec(sectionText);
  return m ? m[1] : null;
}

// Edit a record's status (and optional links fields) textually within its
// section. Returns the new full content, or throws on a malformed section.
function editRecordStatus(content, id, newStatus, opts) {
  const b = sectionBounds(content, id);
  if (!b) throw new Error(`record ${id} not found`);
  let section = content.slice(b.start, b.end);

  if (!/^\s*status:\s*\S+/m.test(section)) {
    throw new Error(`record ${id} has no status line`);
  }
  section = section.replace(/^(\s*status:\s*)\S+/m, `$1${newStatus}`);

  // Merge extra link fields into the `links: {...}` flow map when requested.
  const extra = {};
  if (opts && opts.reopenTrigger) extra.reopen_trigger = opts.reopenTrigger;
  if (opts && opts.enforcementTier) extra.enforcement_tier = opts.enforcementTier;
  if (Object.keys(extra).length > 0) {
    section = section.replace(/^(\s*links:\s*)(\{[^\n]*\})/m, (whole, prefix, flow) => {
      const inner = flow.slice(1, -1).trim();
      const additions = Object.keys(extra).map((k) => `${k}: ${emitFlow(extra[k])}`).join(', ');
      const merged = inner ? `${inner}, ${additions}` : additions;
      return `${prefix}{${merged}}`;
    });
  }

  return content.slice(0, b.start) + section + content.slice(b.end);
}

// ---------------------------------------------------------------------------
// Recurrence + record introspection (all textual — no YAML parse; the shipped
// script carries no parser). The provenance flow map is emitted single-line by
// emitFlow, so it is scannable with an anchored regex + a bracket walker.
// ---------------------------------------------------------------------------

// Strip surrounding double-quotes (and unescape) from an emitted scalar token.
function unquoteScalar(s) {
  const t = String(s).trim();
  if (t.length >= 2 && t[0] === '"' && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return t;
}

// Locate the single `provenance: {…}` line inside a record section. Returns
// {whole, indent, flow} or null. The flow is the `{…}` map, guaranteed on one
// line by emitFlow.
function provenanceLine(sectionText) {
  const m = /^(\s*)provenance:\s*(\{.*\})\s*$/m.exec(sectionText);
  if (!m) return null;
  return { whole: m[0], indent: m[1], flow: m[2] };
}

// Quote-aware bracket walk: given `[` at index `lb` in `s`, return the index of
// its matching `]` (skipping brackets inside double-quoted strings).
function matchBracket(s, lb) {
  let depth = 0;
  let inQ = false;
  for (let i = lb; i < s.length; i++) {
    const c = s[i];
    if (inQ) { if (c === '"' && s[i - 1] !== '\\') inQ = false; continue; }
    if (c === '"') { inQ = true; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Append one occurrence flow-map into the `occurrences: [...]` inside a
// provenance flow string. Returns the new flow string.
function appendOccurrenceToFlow(flow, occ) {
  const occFlow = emitFlow(occ);
  const ki = flow.indexOf('occurrences:');
  if (ki === -1) {
    // No occurrences key (shouldn't happen — serializeRecord always emits it),
    // splice one before the closing brace.
    return flow.replace(/\}\s*$/, `, occurrences: [${occFlow}]}`);
  }
  const lb = flow.indexOf('[', ki);
  const rb = matchBracket(flow, lb);
  if (lb === -1 || rb === -1) return flow;
  const inner = flow.slice(lb + 1, rb).trim();
  const newInner = inner ? `${inner}, ${occFlow}` : occFlow;
  return flow.slice(0, lb + 1) + newInner + flow.slice(rb);
}

// Distinct project names named in a provenance flow (own project + every
// occurrence's project) — the cross-context recurrence key.
function projectsInProvenance(flow) {
  const set = new Set();
  if (!flow) return set;
  const oi = flow.indexOf('occurrences:');
  const head = oi === -1 ? flow : flow.slice(0, oi);
  const tail = oi === -1 ? '' : flow.slice(oi);
  const own = /\bproject:\s*("(?:[^"\\]|\\.)*"|[^,}\]]+)/.exec(head);
  if (own) set.add(unquoteScalar(own[1]));
  const re = /\bproject:\s*("(?:[^"\\]|\\.)*"|[^,}\]]+)/g;
  let m;
  while ((m = re.exec(tail)) !== null) set.add(unquoteScalar(m[1]));
  return set;
}

// Find the section of the FIRST record of `type` whose fingerprint === `fp`.
// Returns {id, start, end} or null.
function findSectionByFingerprint(content, type, fp) {
  const headRe = new RegExp(`^##\\s+(${type}-\\d+)\\s+—`, 'gm');
  let m;
  while ((m = headRe.exec(content)) !== null) {
    const id = m[1];
    const b = sectionBounds(content, id);
    if (!b) continue;
    const section = content.slice(b.start, b.end);
    const fm = /^\s*fingerprint:\s*(\S+)/m.exec(section);
    if (fm && unquoteScalar(fm[1]) === String(fp)) return { id, start: b.start, end: b.end };
  }
  return null;
}

// Extract the dedented `body: |` block-scalar text from a record section.
function extractBody(sectionText) {
  const idx = sectionText.search(/^body:\s*\|\s*$/m);
  if (idx === -1) return '';
  const after = sectionText.slice(idx).split('\n').slice(1);
  const lines = [];
  for (const raw of after) {
    if (/^```/.test(raw)) break;               // end of the fenced block
    if (raw.trim() === '') { lines.push(''); continue; }
    const dm = /^(\s{2})(.*)$/.exec(raw);       // body is indented 2 spaces
    if (!dm && raw[0] !== ' ') break;           // a non-indented line ends it
    lines.push(dm ? dm[2] : raw.replace(/^\s{0,2}/, ''));
  }
  return lines.join('\n').replace(/\s+$/, '');
}

// Section heading title (`## <ID> — <title>`).
function sectionTitle(sectionText) {
  const m = /^##\s+\S+\s+—\s+(.+)$/m.exec(sectionText);
  return m ? m[1].trim() : '';
}

// Read an inline link field from a record section's `links: {...}` flow map.
function linkField(sectionText, key) {
  const re = new RegExp(`\\b${key}:\\s*("(?:[^"\\\\]|\\\\.)*"|[^,}\\]]+)`);
  const m = re.exec(sectionText);
  return m ? unquoteScalar(m[1]) : null;
}

// Read an inline ARRAY link field (e.g. `d_ids: [D-1, D-2]`) from a section.
function linkArray(sectionText, key) {
  const ki = sectionText.indexOf(`${key}:`);
  if (ki === -1) return [];
  const lb = sectionText.indexOf('[', ki);
  if (lb === -1 || lb > ki + key.length + 3) return [];
  const rb = matchBracket(sectionText, lb);
  if (rb === -1) return [];
  return sectionText.slice(lb + 1, rb).split(',').map((s) => unquoteScalar(s)).filter(Boolean);
}

// Append a D-ID into a record's `links.d_ids: [...]` array (creating the array
// or the whole links map when absent), returning the new full ledger content.
// Used to plant the R -> D forward pointer on graduation (the D carries the
// back-pointer in its prose), so the pair is bidirectional.
function addLinkDId(content, id, dId) {
  const b = sectionBounds(content, id);
  if (!b) return content;
  let section = content.slice(b.start, b.end);
  const lm = /^(\s*links:\s*)(\{[^\n]*\})\s*$/m.exec(section);
  if (!lm) return content; // no links line — leave untouched
  let flow = lm[2];
  const ki = flow.indexOf('d_ids:');
  if (ki === -1) {
    const inner = flow.slice(1, -1).trim();
    const addition = `d_ids: [${dId}]`;
    flow = `{${inner ? inner + ', ' + addition : addition}}`;
  } else {
    const lb = flow.indexOf('[', ki);
    const rb = matchBracket(flow, lb);
    if (lb === -1 || rb === -1) return content;
    const innerArr = flow.slice(lb + 1, rb).trim();
    if (new RegExp(`\\b${dId}\\b`).test(innerArr)) return content; // already linked
    const merged = innerArr ? `${innerArr}, ${dId}` : dId;
    flow = flow.slice(0, lb + 1) + merged + flow.slice(rb);
  }
  section = section.replace(lm[0], `${lm[1]}${flow}`);
  return content.slice(0, b.start) + section + content.slice(b.end);
}

/**
 * Apply a cross-context recurrence to an existing L/F record: append the new
 * sighting as an occurrence (deduped) instead of minting a duplicate, and
 * auto-transition an L observed -> recurring once ≥2 distinct project contexts
 * are recorded (diverge-knowledge §4: "the system now owes the human a
 * proposal"). Two F-records on one fingerprint flag an L rollup proposal.
 *
 * @returns {{content: string, summary: {id, transitioned, rollup, message}}}
 */
function applyRecurrence(content, existing, type, input, flags) {
  let section = content.slice(existing.start, existing.end);
  const pl = provenanceLine(section);
  const prov = input.provenance || {};
  const occ = {};
  if (prov.project) occ.project = prov.project;
  occ.date = prov.date || flags.date || todayISO();
  const ref = input.ref || (input.links && input.links.ref) || (flags.ref);
  if (ref) occ.ref = ref;

  let added = false;
  if (pl) {
    const occFlow = emitFlow(occ);
    if (pl.flow.includes(occFlow)) {
      // idempotent: this exact sighting is already recorded.
    } else {
      const newFlow = appendOccurrenceToFlow(pl.flow, occ);
      section = section.replace(pl.whole, `${pl.indent}provenance: ${newFlow}`);
      added = true;
    }
  }

  const flow = provenanceLine(section);
  const contexts = flow ? projectsInProvenance(flow.flow) : new Set();
  const status = currentStatus(section);
  let transitioned = false;
  if (type === 'L' && status === 'observed' && contexts.size >= 2) {
    section = section.replace(/^(\s*status:\s*)\S+/m, '$1recurring');
    transitioned = true;
  }
  const rollup = type === 'F' && contexts.size >= 2;

  const newContent = content.slice(0, existing.start) + section + content.slice(existing.end);
  const fp = flags.fingerprint != null ? flags.fingerprint : input.fingerprint;
  let msg = `recurrence: ${added ? 'appended occurrence to' : 'sighting already recorded on'} ${existing.id}`;
  if (transitioned) msg += ' — auto-transitioned observed -> recurring; the system now owes the human a promotion proposal (record.cjs promote-propose ' + existing.id + ')';
  if (rollup) msg += ` — 2+ findings share fingerprint ${fp}: propose an L rollup (record.cjs append --type L --fingerprint ${fp} …)`;
  return { content: newContent, summary: { id: existing.id, transitioned, rollup, added, message: 'record.cjs: ' + msg } };
}

// ---------------------------------------------------------------------------
// Locking + atomic write
// ---------------------------------------------------------------------------

const LOCK_RETRY_MS = 250;
const LOCK_TIMEOUT_MS = 30000;
const LOCK_STALE_MS = 60000;

function sleepSync(ms) {
  // Busy-free blocking sleep via Atomics (built-in, no deps).
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

// Age (ms) at which a lock with no readable/parseable owner is considered
// abandoned and stealable, using the lock dir's own mtime as the clock (shorter
// than LOCK_STALE_MS because an owner-less lock is already anomalous — the DoS
// vector is pre-creating `.ledger.lock/` with no owner file, M-lock-DoS).
const LOCK_OWNERLESS_GRACE_MS = 5000;

// Decide whether an existing lock is stale enough to steal.
function lockIsStale(lockDir, ownerFile) {
  try {
    const raw = fs.readFileSync(ownerFile, 'utf8').trim().split(/\s+/);
    const ts = parseInt(raw[1], 10);
    if (Number.isFinite(ts)) return Date.now() - ts > LOCK_STALE_MS;
  } catch { /* owner missing or mid-write — fall through to the mtime fallback */ }
  // Owner-less or unparseable: fall back to the lock dir's mtime so a wedged /
  // hand-created lock can never block writers forever.
  try {
    return Date.now() - fs.statSync(lockDir).mtimeMs > LOCK_OWNERLESS_GRACE_MS;
  } catch { return false; }
}

function acquireLock(contextDir) {
  const lockDir = path.join(contextDir, '.ledger.lock');
  const ownerFile = path.join(lockDir, 'owner');
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lockDir); // atomic on POSIX
      fs.writeFileSync(ownerFile, `${process.pid} ${Date.now()}\n`);
      return lockDir;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (lockIsStale(lockDir, ownerFile)) {
        // Rename-then-remove instead of rm-in-place (M8 TOCTOU): the rename is
        // atomic, so exactly one racer captures the stale dir; losers get ENOENT
        // and simply retry mkdir. This prevents two stealers both rm-ing and
        // both then mkdir-ing (a double-grant).
        const grave = `${lockDir}.stale.${process.pid}.${Math.random().toString(36).slice(2)}`;
        try {
          fs.renameSync(lockDir, grave);
          fs.rmSync(grave, { recursive: true, force: true });
        } catch { /* another racer won the rename; retry */ }
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`could not acquire ledger lock at ${lockDir} within ${LOCK_TIMEOUT_MS}ms (held by another writer)`);
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }
}

function releaseLock(lockDir) {
  try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* already gone */ }
}

// Atomic replace: write a temp sibling then rename over the target.
function atomicWrite(filePath, content) {
  const tmp = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

// Run `fn(currentText)` under the lock; fn returns the new text; write it
// atomically. Ensures the context dir exists.
function withFileLock(contextDir, filePath, fn) {
  fs.mkdirSync(contextDir, { recursive: true });
  const lockDir = acquireLock(contextDir);
  try {
    const cur = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const next = fn(cur);
    if (next != null && next !== cur) atomicWrite(filePath, next);
    return next;
  } finally {
    releaseLock(lockDir);
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

// Realpath the nearest EXISTING ancestor of `p` (p itself may not exist yet),
// then re-append the un-created tail. Catches a symlinked ancestor that lexical
// resolution alone would miss (F-017 symlink discipline).
function realpathAnchored(p) {
  let cur = path.resolve(p);
  const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync(cur), ...tail.reverse()); }
    catch (e) {
      if (e.code !== 'ENOENT') return path.resolve(p);
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p); // reached root, nothing real
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}

// Resolve the context dir, CONFINED under <projectRoot>/artifacts/ (F2-H, the
// unconfined-context-dir write). `record.cjs` is allow-listed as a pinned
// command, so an unconfined --context-dir would let an agent write ledger.md /
// decision-log.md / task-ledger.md anywhere (e.g. src/ledger.md). Default and
// explicit paths alike must live inside artifacts/; symlink escapes are caught
// by realpath-anchoring both the candidate and the boundary.
function contextDirFrom(opts) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const artifactsRoot = realpathAnchored(path.join(root, 'artifacts'));
  const candidate = opts.contextDir
    ? realpathAnchored(opts.contextDir)
    : path.join(artifactsRoot, 'context');
  if (candidate !== artifactsRoot && !candidate.startsWith(artifactsRoot + path.sep)) {
    die(`--context-dir must be under ${artifactsRoot} (got ${candidate}); refusing to write serialized files outside artifacts/`);
  }
  return candidate;
}

// Confine a READ path (harvest/promote-propose/reopen-scan/validate) under the
// project tree (K-4): an allow-listed command must not read arbitrary files
// outside the repo unless the human explicitly opts in with --allow-external
// (the H-2 field-harvest case). Symlink escapes are caught by realpath-anchoring
// both the candidate and the boundary, mirroring contextDirFrom.
function confineReadPath(p, opts) {
  const root = realpathAnchored(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const resolved = realpathAnchored(p);
  if (resolved === root || resolved.startsWith(root + path.sep)) return resolved;
  if (opts && opts.allowExternal) return resolved;
  die(`refusing to read ${resolved} outside the project tree ${root}; pass --allow-external to override (K-4 read confinement)`);
}

const LEDGER_HEADER = `# Ledger

The unified R/L/C/F record ledger (ADR-021 / D-036). One fenced-YAML \`record:\`
block per section; the heading carries ID + title, status lives only in the YAML.
Written exclusively through \`.claude/bmad/bin/record.cjs\` (direct edits are
denied by the ledger-write-guard hook). Status transitions edit \`status:\` in
place — git history is the transition audit log.

---
`;

function ledgerPath(contextDir) { return path.join(contextDir, 'ledger.md'); }
function decisionLogPath(contextDir) { return path.join(contextDir, 'decision-log.md'); }
function taskLedgerPath(contextDir) { return path.join(contextDir, 'task-ledger.md'); }

// The night charter lives in artifacts/delivery/ (D-036: date-stamped delivery
// artifact, not a sixth context file). Same confinement discipline as
// contextDirFrom: default and explicit paths alike must live under artifacts/,
// symlink escapes caught by realpath-anchoring both candidate and boundary.
function deliveryDirFrom(opts) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const artifactsRoot = realpathAnchored(path.join(root, 'artifacts'));
  const candidate = opts.deliveryDir
    ? realpathAnchored(opts.deliveryDir)
    : path.join(artifactsRoot, 'delivery');
  if (candidate !== artifactsRoot && !candidate.startsWith(artifactsRoot + path.sep)) {
    die(`--delivery-dir must be under ${artifactsRoot} (got ${candidate}); refusing to write the charter outside artifacts/`);
  }
  return candidate;
}

function nightCharterFile(deliveryDir, date) { return path.join(deliveryDir, `night-charter-${date}.md`); }
// The pointer the night-floor hook reads: presence = a night is open; content =
// the active charter's basename (deterministic path, indirection-free resolution).
function nightCharterPointer(deliveryDir) { return path.join(deliveryDir, '.night-charter-current'); }

// The human-wake marker. Written ONLY by the UserPromptSubmit hook (an agent
// cannot fire that event, so the marker is human-authenticated by construction);
// lives under .claude/** which the night floor write-denies for every agent, so
// it cannot be forged by Edit/Write or a shell redirect during a night either.
function humanWakeMarkerPath() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(root, '.claude', 'hooks', '.human-wake');
}

const INITIATIVE_MODES = ['unrestrained', 'queue-only', 'proposals-only'];
const DEFAULT_GRACE_MS = 2 * 60 * 60 * 1000; // H5-2(d): ends+2h grace.

// Lightweight, dependency-free scan of the project's swarm.yaml for the top-level
// `sleep:` block (record.cjs carries no YAML parser). Returns {enabled, initiative}.
// H5-5: sleep is off-by-default — absence of `sleep.enabled: true` means /sleep
// does not arm on a scaffold until the human opts in.
function readSleepConfig(root) {
  const cfg = { enabled: false, initiative: null };
  let text;
  try { text = fs.readFileSync(path.join(root, 'swarm.yaml'), 'utf8'); }
  catch { return cfg; }
  let inSleep = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^[A-Za-z0-9_-]+:/.test(line)) { inSleep = /^sleep:/.test(line); continue; }
    if (!inSleep) continue;
    const m = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const val = m[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
    if (m[1] === 'enabled') cfg.enabled = /^(true|yes|on)$/i.test(val);
    else if (m[1] === 'initiative') cfg.initiative = val || null;
  }
  return cfg;
}

// Parse a charter file's frontmatter into the night_charter map (or null).
function readCharter(charterFile) {
  if (!fs.existsSync(charterFile)) return null;
  let text;
  try { text = fs.readFileSync(charterFile, 'utf8'); } catch { return null; }
  const fm = parseFrontmatterLite(text);
  return fm && fm.night_charter && typeof fm.night_charter === 'object' ? fm.night_charter : null;
}

// The human is awake iff the wake marker exists AND carries THIS night's nonce
// (NF-1: a touched/empty/forged marker without the nonce does NOT count — the
// nonce is set only by the UserPromptSubmit hook, and .claude/** is write-denied
// to agents during the night).
function markerWoke(charter) {
  const nonce = charter && charter.wake_nonce != null ? String(charter.wake_nonce) : '';
  if (!nonce) return false;
  try {
    const p = humanWakeMarkerPath();
    return fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes(nonce);
  } catch { return false; }
}

function cmdNightCharter(argv, flags) {
  const sub = argv[0];
  const deliveryDir = deliveryDirFrom(flags);
  const pointer = nightCharterPointer(deliveryDir);
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (sub === 'open') {
    const sleepCfg = readSleepConfig(root);
    if (!sleepCfg.enabled) {
      die('sleep is not enabled for this project (H5-5). Set `sleep:\\n  enabled: true` in swarm.yaml to arm /sleep. '
        + 'Off-by-default is deliberate: the night floor changes every agent\'s behavior — opt in once you have run a supervised night.');
    }
    if (!flags.ends) die('night-charter open requires --ends <iso> (the wake clock is the only hard resource)');
    const endsEpoch = Date.parse(flags.ends);
    if (!Number.isFinite(endsEpoch)) die(`--ends ${JSON.stringify(flags.ends)} is not a parseable timestamp (use ISO 8601 with an offset or Z)`);
    const now = Date.now();
    if (endsEpoch <= now) die(`--ends ${flags.ends} is in the past; the night has no runway`);

    const initiative = flags.initiative || sleepCfg.initiative || 'unrestrained';
    if (!INITIATIVE_MODES.includes(initiative)) die(`--initiative must be one of ${INITIATIVE_MODES.join('|')}; got ${JSON.stringify(initiative)}`);
    const escalation = flags.escalation || 'none';
    const graceMs = flags.graceMs != null ? parseInt(flags.graceMs, 10) : DEFAULT_GRACE_MS;
    if (!Number.isFinite(graceMs) || graceMs < 0) die('--grace-ms must be a non-negative integer');
    const queue = flags.queue ? flags.queue.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const extraDeny = flags.extraDeny ? flags.extraDeny.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const date = todayISO();
    const openedIso = new Date(now).toISOString();
    const target = nightCharterFile(deliveryDir, date);
    // Per-night wake nonce: the floor lifts only for a wake marker carrying this
    // value (NF-1). Only the UserPromptSubmit hook writes it into the marker.
    const wakeNonce = require('node:crypto').randomBytes(16).toString('hex');

    const body = renderCharter({ date, openedIso, ends: flags.ends, endsEpoch, graceMs, queue, initiative, extraDeny, escalation, wakeNonce });

    fs.mkdirSync(deliveryDir, { recursive: true });
    withFileLock(deliveryDir, target, () => body);
    // Point the floor at the fresh charter and clear any stale wake marker so the
    // night starts clean (a marker forged before `open` cannot legitimize a close).
    atomicWrite(pointer, `night-charter-${date}.md\n`);
    try { fs.rmSync(humanWakeMarkerPath(), { force: true }); } catch { /* best-effort */ }
    process.stdout.write(target + '\n');
    return;
  }

  if (sub === 'status') {
    if (!fs.existsSync(pointer)) { process.stdout.write('no active night charter (floor dormant)\n'); return; }
    const base = fs.readFileSync(pointer, 'utf8').trim();
    const charterFile = path.join(deliveryDir, base);
    const ch = readCharter(charterFile);
    if (!ch) {
      process.stdout.write(`FAIL-CLOSED: pointer names ${base} but it is missing or unparseable — the floor stays ARMED (fix or close the charter)\n`);
      return;
    }
    const now = Date.now();
    const endsEpoch = Number.isFinite(ch.ends_epoch_ms) ? ch.ends_epoch_ms : Date.parse(ch.ends);
    const graceMs = Number.isFinite(ch.grace_ms) ? ch.grace_ms : DEFAULT_GRACE_MS;
    const woke = markerWoke(ch);
    const armed = !woke && (!Number.isFinite(endsEpoch) || now <= endsEpoch + graceMs);
    const remainMs = Number.isFinite(endsEpoch) ? endsEpoch - now : null;
    process.stdout.write(
      `night charter: ${base}\n`
      + `  ends: ${ch.ends || '?'}\n`
      + `  runway: ${remainMs == null ? 'unknown (corrupt clock — floor fails closed)' : (remainMs > 0 ? Math.round(remainMs / 60000) + ' min remaining' : 'past ends (' + Math.round(-remainMs / 60000) + ' min ago; grace ' + Math.round(graceMs / 60000) + ' min)')}\n`
      + `  human-wake marker: ${woke ? 'PRESENT (night is over — early wake)' : 'absent'}\n`
      + `  floor: ${armed ? 'ARMED (destructive set denied)' : 'lifted'}\n`,
    );
    return;
  }

  if (sub === 'close') {
    if (!fs.existsSync(pointer)) die('no active night charter to close');
    const base = fs.readFileSync(pointer, 'utf8').trim();
    const charterFile = path.join(deliveryDir, base);
    const ch = readCharter(charterFile);
    const now = Date.now();
    const endsEpoch = ch && Number.isFinite(ch.ends_epoch_ms) ? ch.ends_epoch_ms : (ch ? Date.parse(ch.ends) : NaN);
    const woke = markerWoke(ch);
    // Refuse an early close while the clock still runs UNLESS a human is awake
    // (the marker). This is the mechanical half of "the night never closes itself":
    // an agent cannot forge the marker (.claude/** is write-denied at night), so an
    // agent-driven `close` at 3am is refused here.
    if (Number.isFinite(endsEpoch) && now < endsEpoch && !woke) {
      die(`the night is still running (wake clock ${ch.ends}); close is human-gated. A human prompt — or /wake — sets the wake marker that legitimizes an early close.`);
    }
    // Flip status: open -> closed in the dated file (best-effort; the pointer
    // removal is what actually disarms the floor).
    if (fs.existsSync(charterFile)) {
      withFileLock(deliveryDir, charterFile, (cur) => cur.replace(/^(\s*status:\s*)open\b/m, '$1closed'));
    }
    fs.rmSync(pointer, { force: true });
    try { fs.rmSync(humanWakeMarkerPath(), { force: true }); } catch { /* best-effort */ }
    process.stdout.write(`closed ${base}\n`);
    return;
  }

  die('usage: night-charter <open|status|close> [--ends <iso>] [--queue a,b] [--initiative <mode>] [--extra-deny a,b] [--escalation none] [--grace-ms <n>] [--delivery-dir <dir>]');
}

// Render the charter markdown (frontmatter + human confirmation block). The
// frontmatter is the S->GM interface (runway.js parses ends / ends_epoch_ms).
function renderCharter(c) {
  const q = c.queue.length ? '[' + c.queue.join(', ') + ']' : '[]';
  const xd = c.extraDeny.length ? '[' + c.extraDeny.map((s) => JSON.stringify(s)).join(', ') + ']' : '[]';
  const remainMin = Math.round((c.endsEpoch - Date.parse(c.openedIso)) / 60000);
  return [
    '---',
    'night_charter:',
    '  schema: night-charter/1',
    `  date: ${c.date}`,
    `  opened_at: ${c.openedIso}`,
    `  ends: ${emitScalar(c.ends)}`,
    `  ends_epoch_ms: ${c.endsEpoch}`,
    `  wake_nonce: ${c.wakeNonce}`,
    `  grace_ms: ${c.graceMs}`,
    `  queue: ${q}`,
    `  initiative: ${c.initiative}`,
    `  extra_deny: ${xd}`,
    `  escalation: ${c.escalation}`,
    '  status: open',
    '---',
    '',
    `# Night charter — ${c.date}`,
    '',
    `Wake at **${c.ends}** (in ~${remainMin} min). Queue: ${c.queue.length ? c.queue.join(', ') : '(none — initiative from hour zero)'}.`,
    `Initiative: ${c.initiative}. Extra denies tonight: ${c.extraDeny.length ? c.extraDeny.join(', ') : 'none'}.`,
    '',
    '> Tonight draws the **same subscription quota** as tomorrow\'s day work — the',
    '> clock is the only hard resource; there is no separate night budget (D-038).',
    '',
    'The destructive-action floor is armed for the duration of this charter',
    '(push / publish / deploy / real-data migration / out-of-tree writes /',
    'interpreter escapes / self-legislation / never-merge). It can only be',
    'narrowed further by `extra_deny`, never widened (D-034).',
    '',
  ].join('\n');
}
// --human-approved is an AUDITABLE RATIFICATION MARKER, not an agent-proof gate
// (K-2, security re-verify 2026-08-13). It records — in the git ledger, with
// provenance — WHICH decision ratified a promotion, so a self-promotion leaves a
// visible D-record trail. It does NOT prove a *human* acted: an agent that can
// invoke record.cjs can `append --type D` and cite its own D. A CLI run by
// humans and agents at identical OS privilege cannot cryptographically tell them
// apart; the durable fix is operational (keep `append --type D` and
// `set-status … promoted` off the agent allow-list) or cryptographic (a signed
// marker) — a cross-stream decision escalated to the human, not a Stream-K patch.
// The compensating control is the human review of newly-compiled earned rules at
// init/update (born-immune never ships a promotion silently).
//
// decisionExists is the marker's integrity floor: the cited D-ID must resolve to
// a real D-record heading (not merely be a non-empty token). Decision-log
// D-records are prose (no machine status field, SE-1 scope), so existence — not
// accepted/verified status — is what is checkable here.
function decisionExists(contextDir, dId) {
  if (!dId || !/^D-\d+$/.test(String(dId))) return false;
  const f = decisionLogPath(contextDir);
  if (!fs.existsSync(f)) return false;
  const content = fs.readFileSync(f, 'utf8');
  return new RegExp('^##\\s+' + String(dId).replace(/[-]/g, '\\-') + '\\s+—', 'm').test(content);
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

// Read all of stdin synchronously. fs.readFileSync(0) can throw EAGAIN on a
// non-blocking pipe (seen under concurrent spawn), so loop on readSync and
// treat EAGAIN as "data not ready yet" rather than end-of-input.
function readStdinSync() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  for (;;) {
    let bytes;
    try {
      bytes = fs.readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (e.code === 'EAGAIN') { sleepSync(5); continue; }
      if (e.code === 'EOF') break;
      break;
    }
    if (bytes === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, bytes)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Build a logical record from JSON input + flag overrides, allocate id, validate.
function buildRecord(type, input, flags, existingContent) {
  const rec = Object.assign({}, input);
  rec.type = type;
  if (flags.title != null) rec.title = flags.title;
  if (flags.fingerprint != null) rec.fingerprint = flags.fingerprint;
  if (flags.status != null) rec.status = flags.status;
  if (rec.status == null) rec.status = INITIAL_STATUS[type];
  if (flags.reopenTrigger != null) {
    rec.links = Object.assign({}, rec.links);
    rec.links.reopen_trigger = flags.reopenTrigger;
  }
  rec.id = nextId(existingContent, type);
  return rec;
}

function cmdAppend(flags) {
  const type = normalizeType(flags.type);
  if (!type) die(`--type must be one of ${TYPES.join('|')}`);

  let input = {};
  // Input source precedence: --file, --json, then stdin. Stdin is read whenever
  // it is piped (not a TTY), so callers piping JSON need no explicit --stdin.
  const wantStdin = flags.stdin || (!flags.file && flags.json == null && !process.stdin.isTTY);
  const raw = flags.file ? fs.readFileSync(flags.file, 'utf8') : (flags.json != null ? flags.json : (wantStdin ? readStdinSync() : ''));
  if (raw && raw.trim()) {
    try { input = JSON.parse(raw); } catch (e) { die(`input is not valid JSON: ${e.message}`); }
  }
  if (flags.body != null) input.body = flags.body;

  // The append door applies the SAME ratification-marker discipline as
  // set-status (F-27 / F2-H3): `append --type L --status promoted` without the
  // marker would mint a promoted lesson with no ratification trail. An L-record
  // may only ENTER at observed or recurring (the migration needs recurring); any
  // later stage on the append door requires the --human-approved <D-ID> auditable
  // marker (ADR-021). NOTE: the marker is auditable, not agent-proof (see
  // decisionExists) — the compensating control is the init/update earned-rules
  // review, not this check.
  if (type === 'L') {
    const requested = flags.status != null ? flags.status : (input.status != null ? input.status : INITIAL_STATUS.L);
    if (!['observed', 'recurring'].includes(requested) && !flags.humanApproved) {
      die(`append --type L may only enter at observed|recurring; status ${JSON.stringify(requested)} requires the --human-approved <D-ID> ratification marker (ADR-021)`);
    }
  }

  // Mirror the L-gate posture for R (Stream A dependency): an R may only ENTER
  // at open, so nobody appends `--type R --status accepted` directly and skips
  // the R->D graduation that `set-status R-x accepted` performs.
  if (type === 'R') {
    const requested = flags.status != null ? flags.status : (input.status != null ? input.status : INITIAL_STATUS.R);
    if (requested !== 'open') {
      die(`append --type R may only enter at open; status ${JSON.stringify(requested)} is reached via set-status (R -> accepted graduates to a D)`);
    }
  }

  const contextDir = contextDirFrom(flags);

  // K-2 on the append door: a promoted-L entry via --human-approved must resolve
  // to a real ratifying decision too, and records the link so born-immune trusts it.
  if (type === 'L') {
    const requested = flags.status != null ? flags.status : (input.status != null ? input.status : INITIAL_STATUS.L);
    if (requested === 'promoted' && flags.humanApproved) {
      if (!decisionExists(contextDir, flags.humanApproved)) {
        die(`--human-approved D-ID ${JSON.stringify(flags.humanApproved)} does not resolve to an existing D-record in decision-log.md (K-2)`);
      }
      input.links = Object.assign({}, input.links);
      const existing = Array.isArray(input.links.d_ids) ? input.links.d_ids : [];
      if (!existing.includes(flags.humanApproved)) input.links.d_ids = existing.concat(flags.humanApproved);
    }
  }

  if (type === 'D') {
    // D records live in decision-log.md as human-readable prose. The body is
    // caller-supplied free-form markdown (§3.1: D entries gain nothing new).
    const target = decisionLogPath(contextDir);
    let allocated = null;
    withFileLock(contextDir, target, (cur) => {
      const id = nextId(cur, 'D');
      allocated = id;
      // Sanitize every interpolated field (K-3): title/date/classification are
      // single-line; the decision body is defanged so a `## D-NNNN` line inside
      // it cannot forge a record heading or poison nextId('D').
      const title = sanitizeInline(input.title || flags.title) || '(untitled)';
      const date = sanitizeInline((input.provenance && input.provenance.date) || flags.date || todayISO());
      const cls = sanitizeInline(input.classification || flags.classification || 'Tactical');
      const body = defangProse((input.body || '').trim());
      const block = `\n## ${id} — ${title}\n\n- **Date:** ${date}\n- **Classification:** ${cls}\n- **Decision:** ${body}\n`;
      const base = cur && cur.trim() ? cur.replace(/\s*$/, '\n') : cur;
      return base + block;
    });
    process.stdout.write(allocated + '\n');
    return;
  }

  // R/L/C/F -> ledger.md fenced-YAML envelope (recurrence-aware).
  const res = appendEnvelopeRecord(contextDir, type, input, flags);
  if (res.errors) die('record failed envelope validation:\n  - ' + res.errors.join('\n  - '));
  process.stdout.write(res.id + '\n');
  if (res.recurrence) process.stderr.write(res.recurrence.message + '\n');
}

// Append (or recurrence-fold) one R/L/C/F record into ledger.md under the lock.
// Returns {id, recurrence|null, errors|null}. Shared by cmdAppend and cmdHarvest
// so harvested lessons get the SAME dedup + auto-recurring behavior as manual
// appends (the flagship demo: two projects' synthetic-fixture lessons fold into
// one L at recurring). The F-27 ratification marker is enforced by the callers on the
// APPEND door (harvest only mints at observed, so it never needs the gate).
function appendEnvelopeRecord(contextDir, type, input, flags) {
  const target = ledgerPath(contextDir);
  let allocated = null;
  let validationErrors = null;
  let recurrence = null;
  withFileLock(contextDir, target, (cur) => {
    const base = cur && cur.trim() ? cur : LEDGER_HEADER;
    const fp = flags.fingerprint != null ? flags.fingerprint : input.fingerprint;
    if ((type === 'L' || type === 'F') && fp) {
      const existing = findSectionByFingerprint(base, type, fp);
      if (existing) {
        const r = applyRecurrence(base, existing, type, input, flags);
        recurrence = r.summary;
        allocated = existing.id;
        return r.content;
      }
    }
    const rec = buildRecord(type, input, flags, base);
    const errs = validateEnvelope(rec);
    if (errs.length > 0) { validationErrors = errs; return null; }
    allocated = rec.id;
    return base.replace(/\s*$/, '\n') + '\n' + serializeRecord(rec) + '\n';
  });
  return { id: allocated, recurrence, errors: validationErrors };
}

function cmdSetStatus(argv, flags) {
  const id = argv[0];
  const newStatus = argv[1];
  if (!id || !newStatus) die('usage: set-status <ID> <status> [--reopen-trigger "…"] [--enforcement-tier <t>] [--human-approved <D-ID>]');
  const type = id[0];
  if (!TYPES.includes(type)) die(`unknown record type for id ${id}`);
  if (type === 'D') die('D-record status transitions are human prose edits in decision-log.md (SE-1 scope); not routed through set-status');

  const contextDir = contextDirFrom(flags);
  const target = ledgerPath(contextDir);

  // K-2: L->promoted requires the --human-approved <D-ID> ratification marker,
  // and that D-ID must resolve to an existing decision (not just be truthy). This
  // is an auditable marker, not an agent-proof gate — see decisionExists.
  // Checked pre-lock (no lock needed to read decision-log.md).
  if (type === 'L' && newStatus === 'promoted') {
    if (!flags.humanApproved) die('L -> promoted requires the --human-approved <D-ID> ratification marker (ADR-021)');
    if (!decisionExists(contextDir, flags.humanApproved)) {
      die(`--human-approved D-ID ${JSON.stringify(flags.humanApproved)} does not resolve to an existing D-record in decision-log.md; the ratification marker must cite a real decision (K-2)`);
    }
  }

  let err = null;
  let graduate = null; // {title, body} captured when an R is accepted
  withFileLock(contextDir, target, (cur) => {
    const b = sectionBounds(cur, id);
    if (!b) { err = `record ${id} not found in ledger`; return null; }
    const section = cur.slice(b.start, b.end);
    const from = currentStatus(section);
    if (!from) { err = `record ${id} has no status`; return null; }
    const allowed = (TRANSITIONS[type][from] || []);
    if (!allowed.includes(newStatus)) {
      err = `illegal ${type} transition ${from} -> ${newStatus} (allowed: ${allowed.join(', ') || 'none'})`;
      return null;
    }
    // Ratification marker (defense-in-depth; the pre-lock K-2 check already
    // verified existence): L -> promoted requires --human-approved <D-ID>.
    if (type === 'L' && newStatus === 'promoted' && !flags.humanApproved) {
      err = 'L -> promoted requires the --human-approved <D-ID> ratification marker (ADR-021)';
      return null;
    }
    // A rejected R must record a reopen trigger.
    if (type === 'R' && newStatus === 'rejected' && !flags.reopenTrigger) {
      err = 'R -> rejected requires --reopen-trigger "…" (ADR-021)';
      return null;
    }
    // R -> accepted graduates into a D-record (source: swarm-advisory) unless
    // opted out — the advisory layer's accepted recommendations become tracked
    // decisions (phase4 §3.2 / diverge-advisory). Capture the text here (under
    // the lock, from the pre-edit section) and append the D after the ledger
    // write below; the accept itself is NOT blocked if graduation is disabled.
    if (type === 'R' && newStatus === 'accepted' && !flags.noGraduate) {
      graduate = { title: sectionTitle(section), body: extractBody(section) };
    }
    return editRecordStatus(cur, id, newStatus, {
      reopenTrigger: flags.reopenTrigger,
      enforcementTier: flags.enforcementTier,
    });
  });
  if (err) die(err);

  let graduatedD = null;
  if (graduate) {
    const dTarget = decisionLogPath(contextDir);
    withFileLock(contextDir, dTarget, (cur) => {
      const did = nextId(cur, 'D');
      graduatedD = did;
      // Same K-3 sanitation on the graduation writer: title single-line, the
      // rationale (which may carry the R's multi-line body or --decision) defanged.
      const title = sanitizeInline(flags.title || graduate.title) || `(graduated from ${id})`;
      const date = sanitizeInline(flags.date || todayISO());
      const cls = sanitizeInline(flags.classification || 'Tactical');
      const rationale = defangProse(flags.decision || graduate.body || `Accepted recommendation ${id}.`);
      const block = `\n## ${did} — ${title}\n\n- **Date:** ${date}\n- **Classification:** ${cls}\n- **Source:** swarm-advisory (ref: ${id})\n- **Decision:** ${rationale}\n`;
      const base = cur && cur.trim() ? cur.replace(/\s*$/, '\n') : cur;
      return base + block;
    });
    // Plant the R -> D forward pointer (links.d_ids) so the pair is bidirectional.
    withFileLock(contextDir, target, (cur) => addLinkDId(cur, id, graduatedD));
  }

  // Record the ratifying D-ID into the promoted L's links (K-1 #4): born-immune
  // compiles a promoted L only when it carries a link to a D that EXISTS, so a
  // forged `status: promoted` block with no real ratifying decision never ships.
  if (type === 'L' && newStatus === 'promoted' && !err) {
    withFileLock(contextDir, target, (cur) => addLinkDId(cur, id, flags.humanApproved));
  }

  process.stdout.write(`${id} -> ${newStatus}\n`);
  if (graduatedD) process.stdout.write(`graduated: ${id} -> ${graduatedD} (source: swarm-advisory, bidirectional)\n`);
}

function cmdNextId(argv, flags) {
  const type = normalizeType(argv[0]);
  if (!type) die(`usage: next-id <${TYPES.join('|')}>`);
  const contextDir = contextDirFrom(flags);
  const target = type === 'D' ? decisionLogPath(contextDir) : ledgerPath(contextDir);
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  process.stdout.write(nextId(cur, type) + '\n');
}

function cmdTaskEvent(flags) {
  if (!flags.task || !flags.event) die('usage: task-event --task <id> --event <e> [--owner <n>] [--session <s>] [--detail "…"]');
  const contextDir = contextDirFrom(flags);
  const target = taskLedgerPath(contextDir);
  const parts = [
    new Date().toISOString(),
    flags.session ? `session=${flags.session}` : null,
    `task=${flags.task}`,
    `event=${flags.event}`,
    flags.owner ? `owner=${flags.owner}` : null,
    flags.detail ? `subject=${JSON.stringify(flags.detail)}` : null,
  ].filter(Boolean);
  const line = parts.join(' ') + '\n';
  withFileLock(contextDir, target, (cur) => (cur || '') + line);
  process.stdout.write('ok\n');
}

// Validate every envelope record in ledger.md by re-scanning the emitted format.
// Because we don't ship a YAML parser, `validate` re-reads the structural
// invariants we can check textually: each `## <ID>` section has a well-formed
// record block with id/type/status matching the ID and a body.
function cmdValidate(flags) {
  const contextDir = contextDirFrom(flags);
  const target = flags.file ? confineReadPath(flags.file, { allowExternal: flags.allowExternal }) : ledgerPath(contextDir);
  if (!fs.existsSync(target)) { process.stdout.write('ledger.md does not exist yet; nothing to validate\n'); return; }
  const content = fs.readFileSync(target, 'utf8');
  const problems = [];
  const headRe = /^##\s+([DRLCF]-\d+)\s+—\s+(.+)$/gm;
  let m;
  let count = 0;
  while ((m = headRe.exec(content)) !== null) {
    count++;
    const id = m[1];
    const b = sectionBounds(content, id);
    const section = content.slice(b.start, b.end);
    const idM = /^\s*id:\s*(\S+)/m.exec(section);
    const typeM = /^\s*type:\s*(\S+)/m.exec(section);
    const st = currentStatus(section);
    if (!idM || idM[1] !== id) problems.push(`${id}: record block id mismatch`);
    if (!typeM || NAME_TYPE[typeM[1]] !== id[0]) problems.push(`${id}: type/id-prefix mismatch`);
    if (!st) problems.push(`${id}: missing status`);
    else if (!statusVocab(id[0]).includes(st)) problems.push(`${id}: status ${st} not in ${id[0]} vocabulary`);
    if (!/^body:\s*\|/m.test(section)) problems.push(`${id}: missing body block`);
  }
  if (problems.length > 0) {
    process.stderr.write(`ledger validation FAILED (${problems.length} problem(s)):\n  - ${problems.join('\n  - ')}\n`);
    process.exit(1);
  }
  process.stdout.write(`ledger.md OK: ${count} record(s) validate\n`);
}

// ---------------------------------------------------------------------------
// Reconciliation (ADR-018 §2 / RES-2/RES-3/RES-4/RES-5; phase2 design §4.3).
//
// PURE, no I/O: reconcile() diffs the TaskList tool's output against the task
// ledger + brain frontmatter and returns the machine-generated action list the
// warm boot acts on. It lives HERE (not utils/reconcile.js) for the same reason
// the envelope schema does: this file ships verbatim to .claude/bmad/bin/, where
// the package's utils/ do not exist. utils/reconcile.js re-exports these so the
// package side imports one source of truth (mirror of the record-envelope split).
//
// CAVEAT (verified live, spike-posttooluse-2026-08-13 §1/§4): consume the
// TaskList tool's output, NOT TaskGet's. TaskList carries `owner` on every task;
// TaskGet DROPS it. The not-yet-woken / dead-owner classification depends on
// `owner`, so reconcile() takes taskListJson — never per-task TaskGet lookups.
// ---------------------------------------------------------------------------

// Ledger events that mean a task is DONE (so its absence from TaskList is normal,
// not an orphan).
const RECONCILE_TERMINAL_EVENTS = ['completed', 'failed', 'rejected', 'retired'];
// Default minutes of ledger silence before an in_progress task is a liveness
// candidate (RES-1). Overridable via opts.stuckThresholdMinutes.
const RECONCILE_STUCK_DEFAULT_MIN = 30;

// Normalize the TaskList tool output. Accepts the raw tool_response
// (`{tasks:[…]}`), a bare tasks array, or a wrapper `{tool_response:{tasks:[…]}}`.
// Task shape per spike: {id, subject, status, owner, blockedBy}.
function _reconcileNormalizeTasks(taskListJson) {
  let arr = [];
  if (Array.isArray(taskListJson)) arr = taskListJson;
  else if (taskListJson && Array.isArray(taskListJson.tasks)) arr = taskListJson.tasks;
  else if (taskListJson && taskListJson.tool_response && Array.isArray(taskListJson.tool_response.tasks)) arr = taskListJson.tool_response.tasks;
  return arr.map((t) => ({
    id: String(t.id != null ? t.id : (t.task_id != null ? t.task_id : '')),
    status: String(t.status || '').toLowerCase(),
    owner: t.owner != null ? String(t.owner) : null,
    subject: t.subject || '',
    blockedBy: t.blockedBy != null ? t.blockedBy : (t.blocked_by != null ? t.blocked_by : null),
  })).filter((t) => t.id);
}

// Parse one task-ledger line (format written by record.cjs task-event):
//   <ISO> [session=X] task=Y event=Z [owner=W] [subject="…"]
// subject= is always LAST and JSON-quoted (may itself contain "task="/"owner="),
// so key scanning is confined to the head before " subject=".
function parseTaskLedgerLine(line) {
  const s = String(line == null ? '' : line).trim();
  if (!s) return null;
  const head = s.split(' subject=')[0];
  const get = (k) => { const m = new RegExp('(?:^|\\s)' + k + '=(\\S+)').exec(head); return m ? m[1] : null; };
  const task = get('task');
  const event = get('event');
  if (!task || !event) return null;
  const tsM = /^(\S+)/.exec(head);
  const ts = tsM ? tsM[1] : null;
  const tsMs = ts ? Date.parse(ts) : NaN;
  let subject = null;
  const subjM = / subject=(.*)$/.exec(s);
  if (subjM) { try { subject = JSON.parse(subjM[1]); } catch { subject = subjM[1]; } }
  return { ts, tsMs, session: get('session'), task, event, owner: get('owner'), subject };
}

// Fold the ledger lines into per-task state (chronological; later rows win).
function _reconcileLedgerByTask(ledgerLines) {
  const byTask = new Map();
  for (const line of ledgerLines || []) {
    const e = parseTaskLedgerLine(line);
    if (!e) continue;
    if (!byTask.has(e.task)) {
      byTask.set(e.task, { owner: null, subject: null, lastEvent: null, lastTsMs: NaN, statuses: new Set() });
    }
    const rec = byTask.get(e.task);
    if (e.owner) rec.owner = e.owner;      // last owner wins
    if (e.subject) rec.subject = e.subject;
    rec.statuses.add(e.event);
    rec.lastEvent = e.event;
    if (Number.isFinite(e.tsMs)) rec.lastTsMs = e.tsMs;
  }
  return byTask;
}

function _reconcileIsBlocked(t) {
  if (t.status === 'blocked') return true;
  const b = t.blockedBy;
  if (Array.isArray(b)) return b.length > 0;
  return b != null && String(b).length > 0;
}

// Numeric-aware ascending sort by `.task` for deterministic output.
function _reconcileSortByTask(a, b) {
  const na = parseInt(a.task, 10);
  const nb = parseInt(b.task, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a.task).localeCompare(String(b.task));
}

/**
 * Diff TaskList ⋈ task-ledger ⋈ brain frontmatter into a coordination action list.
 *
 * @param {object|Array} taskListJson  TaskList tool output (has `owner`).
 * @param {string[]} ledgerLines       task-ledger.md lines.
 * @param {object} brainFrontmatter    project-brain.md frontmatter (phase/gates/checkpoint).
 * @param {object} [opts]              { now?: Date|number, stuckThresholdMinutes?: number }
 * @returns {{rewake: object[], stuck: object[], awaitingHuman: object[], orphans: object[], staleness: object}}
 */
function reconcile(taskListJson, ledgerLines, brainFrontmatter, opts) {
  opts = opts || {};
  const now = opts.now != null ? (opts.now instanceof Date ? opts.now.getTime() : opts.now) : Date.now();
  const stuckMin = opts.stuckThresholdMinutes != null ? opts.stuckThresholdMinutes : RECONCILE_STUCK_DEFAULT_MIN;
  const tasks = _reconcileNormalizeTasks(taskListJson);
  const byTask = _reconcileLedgerByTask(ledgerLines);
  const taskIds = new Set(tasks.map((t) => t.id));

  const rewake = [];
  const stuck = [];
  for (const t of tasks) {
    const rec = byTask.get(t.id) || null;
    if (t.status === 'pending' && !_reconcileIsBlocked(t)) {
      // Authoritative wake-ack is a durable `in_progress` ledger row (RES-3).
      // pending + no in_progress = not-yet-woken (or a lost wake if a stray
      // `woken` row exists but was never acked).
      const hasInProgress = rec && rec.statuses.has('in_progress');
      if (!hasInProgress) {
        const hasWoken = rec && rec.statuses.has('woken');
        rewake.push({
          task: t.id,
          owner: t.owner || (rec && rec.owner) || null,
          reason: hasWoken
            ? 'woken but never acked in_progress in the ledger (lost wake, RES-3) — re-send exactly one start message'
            : 'pending with no in_progress wake-ack in the ledger (not yet woken, RES-3) — send exactly one start message',
        });
      }
    } else if (t.status === 'in_progress') {
      const lastTsMs = rec && Number.isFinite(rec.lastTsMs) ? rec.lastTsMs : NaN;
      const ageMinutes = Number.isFinite(lastTsMs) ? Math.floor((now - lastTsMs) / 60000) : null;
      if (ageMinutes === null || ageMinutes >= stuckMin) {
        stuck.push({ task: t.id, owner: t.owner || (rec && rec.owner) || null, lastEvent: rec ? rec.lastEvent : null, ageMinutes });
      }
    }
  }

  // Orphans: the ledger believes the task is live (non-terminal last event) but
  // TaskList has lost it — a dead-owner / lost-task signal (respawn candidate).
  const orphans = [];
  for (const [id, rec] of byTask) {
    if (taskIds.has(id)) continue;
    if (RECONCILE_TERMINAL_EVENTS.includes(rec.lastEvent)) continue;
    const ageMinutes = Number.isFinite(rec.lastTsMs) ? Math.floor((now - rec.lastTsMs) / 60000) : null;
    orphans.push({
      task: id,
      owner: rec.owner,
      lastEvent: rec.lastEvent,
      ageMinutes,
      reason: 'in the task ledger (last event: ' + rec.lastEvent + ') but absent from TaskList — dead owner or lost task; respawn against the same task pointer',
    });
  }

  // Awaiting-human gates from brain frontmatter (surface these first).
  const awaitingHuman = [];
  const gates = brainFrontmatter && brainFrontmatter.gates && typeof brainFrontmatter.gates === 'object' && !Array.isArray(brainFrontmatter.gates)
    ? brainFrontmatter.gates : {};
  for (const gate of Object.keys(gates)) {
    const g = gates[gate] || {};
    const st = String(g.status || '').toLowerCase();
    if (st === 'awaiting-human' || st === 'awaiting_human') {
      awaitingHuman.push({ gate, since: g.at || g.since || g.timestamp || null, dId: g.d_id || g['d-id'] || g.dId || null });
    }
  }

  let lastLedgerMs = NaN;
  for (const rec of byTask.values()) {
    if (Number.isFinite(rec.lastTsMs) && (!Number.isFinite(lastLedgerMs) || rec.lastTsMs > lastLedgerMs)) lastLedgerMs = rec.lastTsMs;
  }
  const staleness = {
    ledgerAgeMinutes: Number.isFinite(lastLedgerMs) ? Math.floor((now - lastLedgerMs) / 60000) : null,
    brainCheckpoint: brainFrontmatter && brainFrontmatter.checkpoint != null ? brainFrontmatter.checkpoint : null,
  };

  rewake.sort(_reconcileSortByTask);
  stuck.sort(_reconcileSortByTask);
  orphans.sort(_reconcileSortByTask);

  return { rewake, stuck, awaitingHuman, orphans, staleness };
}

// --- lightweight frontmatter reader (record.cjs carries no YAML parser) -------
// Reads the brain frontmatter's scalars + one level of nested maps whose entries
// are flow-maps (`gate: {status: awaiting-human, d_id: D-9}`) or scalars — the
// shape in artifact-schemas/project-brain.md. Deep block-nested gate entries are
// out of scope for this reader (the pure reconcile() takes an already-parsed
// object; only the CLI convenience path uses this).
function _liteScalar(v) {
  const s = String(v).trim();
  if (s === '') return null;
  if ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'"))) return s.slice(1, -1);
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  return s;
}

function _liteFlowMap(v) {
  const out = {};
  const inner = String(v).trim().replace(/^\{/, '').replace(/\}$/, '');
  if (!inner.trim()) return out;
  for (const part of inner.split(',')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = _liteScalar(part.slice(idx + 1));
  }
  return out;
}

function parseFrontmatterLite(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text || ''));
  if (!m) return {};
  const fm = {};
  // Indent stack: each frame is a map that keys indented deeper than `indent`
  // attach to. The root (indent -1) holds top-level keys; a key whose value is
  // empty opens a nested map and pushes a frame. This nests block maps at any
  // depth, so a 2-level block `gates:\n  prd:\n    status: …` correctly lands
  // status under gates.prd. (F-INT-1: the old single-parent reader flattened the
  // deeper line onto `gates`, so reconcile saw no gate.status and SILENTLY missed
  // the awaiting-human pause — defeating RES-4. Flow-map entries like
  // `gates:\n  prd: {status: …}` were unaffected and still parse the same way.)
  const stack = [{ indent: -1, container: fm }];
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const km = /^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!km) continue;
    const indent = km[1].length;
    const key = km[2];
    const val = km[3].replace(/\s+#.*$/, '');
    // The parent is the nearest open map strictly less indented than this key;
    // pop sibling/deeper frames until it is on top.
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].container;
    if (val.trim() === '') {
      const child = {};
      parent[key] = child;
      stack.push({ indent, container: child });
    } else if (val.trim()[0] === '{') {
      parent[key] = _liteFlowMap(val);
    } else {
      parent[key] = _liteScalar(val);
    }
  }
  return fm;
}

// Render the action list human-readably (the warm boot prints this and acts on it).
function formatReconcile(r) {
  const out = [];
  out.push('Reconciliation (TaskList ⋈ task-ledger) — action list:');
  out.push('');
  if (!r.rewake.length && !r.stuck.length && !r.orphans.length && !r.awaitingHuman.length) {
    out.push('  ✓ nothing to reconcile: no unwoken, stuck, or orphaned tasks, and no awaiting-human gates.');
  } else {
    if (r.rewake.length) {
      out.push('  RE-WAKE (send exactly one start message each):');
      for (const x of r.rewake) out.push('    - task ' + x.task + ' owner=' + (x.owner || '?') + ' — ' + x.reason);
      out.push('');
    }
    if (r.orphans.length) {
      out.push('  ORPHANS (in ledger, gone from TaskList — respawn against the same task pointer):');
      for (const x of r.orphans) out.push('    - task ' + x.task + ' owner=' + (x.owner || '?') + ' lastEvent=' + x.lastEvent + (x.ageMinutes != null ? ' age=' + x.ageMinutes + 'm' : ''));
      out.push('');
    }
    if (r.stuck.length) {
      out.push('  STUCK (in_progress, no recent ledger activity — one liveness ping, then respawn):');
      for (const x of r.stuck) out.push('    - task ' + x.task + ' owner=' + (x.owner || '?') + ' lastEvent=' + (x.lastEvent || 'none') + (x.ageMinutes != null ? ' age=' + x.ageMinutes + 'm' : ' (no ledger activity)'));
      out.push('');
    }
    if (r.awaitingHuman.length) {
      out.push('  AWAITING HUMAN (surface first):');
      for (const x of r.awaitingHuman) out.push('    - gate ' + x.gate + (x.dId ? ' (' + x.dId + ')' : '') + (x.since ? ' since ' + x.since : ''));
      out.push('');
    }
  }
  out.push('  staleness: ledger last event ' + (r.staleness.ledgerAgeMinutes != null ? r.staleness.ledgerAgeMinutes + 'm ago' : 'n/a')
    + '; brain checkpoint ' + (r.staleness.brainCheckpoint != null ? r.staleness.brainCheckpoint : 'n/a') + '.');
  return out.join('\n') + '\n';
}

function cmdReconcile(flags) {
  // TaskList JSON: `--tasklist -` (stdin) | `--tasklist <file>` | piped stdin.
  let rawTasks = '';
  if (flags.tasklist && flags.tasklist !== '-') {
    rawTasks = fs.readFileSync(flags.tasklist, 'utf8');
  } else if (flags.tasklist === '-' || !process.stdin.isTTY) {
    rawTasks = readStdinSync();
  }
  let taskListJson = [];
  if (rawTasks && rawTasks.trim()) {
    try { taskListJson = JSON.parse(rawTasks); }
    catch (e) { die('--tasklist input is not valid JSON: ' + e.message); }
  }

  const contextDir = contextDirFrom(flags);
  const ledgerFile = taskLedgerPath(contextDir);
  const ledgerLines = fs.existsSync(ledgerFile) ? fs.readFileSync(ledgerFile, 'utf8').split('\n') : [];

  const brainFile = path.join(contextDir, 'project-brain.md');
  const brainFm = fs.existsSync(brainFile) ? parseFrontmatterLite(fs.readFileSync(brainFile, 'utf8')) : {};

  const result = reconcile(taskListJson, ledgerLines, brainFm, {});
  if (flags.json) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return; }
  process.stdout.write(formatReconcile(result));
}

// ---------------------------------------------------------------------------
// Knowledge verbs: promote-propose, recall, reopen-scan, harvest
// (diverge-knowledge §4/§7; phase4 §3.1). These READ the ledger + on-disk
// artifacts and mint L-records; none writes outside artifacts/ (contextDirFrom
// keeps the confinement; the retro-catch walk is read-only).
// ---------------------------------------------------------------------------

// Text extensions the retro-catch / harvest walkers will read.
const SCAN_EXTS = new Set(['.md', '.markdown', '.txt', '.yaml', '.yml', '.json', '.js', '.cjs', '.ts', '.py']);
const SCAN_SKIP_DIRS = new Set(['node_modules', '.git', '.ledger.lock', 'dist', 'build', 'coverage']);
const SCAN_MAX_BYTES = 512 * 1024;

// Recursively list readable text files under `root` (bounded; skips vendor dirs).
function walkTextFiles(root, out = [], depth = 0) {
  if (depth > 12) return out;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') { if (SCAN_SKIP_DIRS.has(e.name)) continue; }
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (SCAN_SKIP_DIRS.has(e.name)) continue;
      walkTextFiles(full, out, depth + 1);
    } else if (e.isFile() && SCAN_EXTS.has(path.extname(e.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

// Keywords derived from a fingerprint slug (drop short stopwords).
function fingerprintKeywords(fp) {
  return String(fp).toLowerCase().split(/[-_]/).filter((w) => w.length >= 4);
}

// Crude morphological stem: strip a common inflection so "masks"/"masked",
// "regresses"/"regressed" match one another. Advisory-grade — retro-catch and
// reopen-scan are judgment aids, never enforcement, so light stemming is fine.
function stemWord(w) {
  return String(w).toLowerCase().replace(/(ings|ing|ed|es|s)$/, '');
}

// Which of `kws` appear in `text` — matched at WORD granularity (a keyword must
// be a whole word or a stem-equal word), never an unbounded substring. Without
// this, the slug "race" matched inside "traceability"/"trace" and inflated the
// retro-catch evidence a promotion proposal shows the human (correctness review,
// advisory). Stemming still folds inflections (regresses/regressed) together.
function keywordHits(text, kws) {
  const words = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
  const wordSet = new Set(words);
  const stemSet = new Set(words.map(stemWord));
  return kws.filter((k) => wordSet.has(k) || stemSet.has(stemWord(k)));
}

// Does the fingerprint slug appear as a bounded token in text (not a substring
// of a longer word)? Same evidence-honesty fix as keywordHits.
function slugMatches(text, slug) {
  const esc = String(slug).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + esc + '\\b', 'i').test(String(text));
}

/**
 * Counterfactual replay (diverge-knowledge §7.3): run a lesson's detection
 * signal over on-disk artifacts and count how many the rule WOULD have caught,
 * plus a false-positive check. Deterministic and cited — a file is a
 *   - retro-catch  if it names the exact fingerprint slug OR contains every
 *                  fingerprint keyword (a strong contextual match), and
 *   - weak/FP hit  if it contains SOME (but not all) keywords and not the slug.
 *
 * @returns {{root, catches: string[], falsePositives: string[], scanned: number}}
 */
function retroCatch(root, fp, opts) {
  opts = opts || {};
  const slug = String(fp).toLowerCase();
  const kws = fingerprintKeywords(fp);
  // The record store itself would circularly "catch" the lesson's own record —
  // a retro-catch must be an INDEPENDENT artifact, so exclude the ledger files.
  const STORE = new Set(['ledger.md', 'decision-log.md', 'task-ledger.md']);
  const files = walkTextFiles(root).filter((f) => !STORE.has(path.basename(f)));
  const catches = [];
  const falsePositives = [];
  for (const f of files) {
    let text;
    try {
      const st = fs.statSync(f);
      if (st.size > SCAN_MAX_BYTES) continue;
      text = fs.readFileSync(f, 'utf8').toLowerCase();
    } catch { continue; }
    const hasSlug = slugMatches(text, slug);
    const present = keywordHits(text, kws);
    // A strong contextual match is a majority of the fingerprint's keywords
    // (never fewer than two, so a lone generic word like "data" is not a catch).
    const strong = kws.length ? Math.max(2, Math.ceil(kws.length * 0.6)) : 1;
    const rel = path.relative(root, f) || f;
    if (hasSlug || present.length >= strong) catches.push(rel);
    else if (present.length > 0) falsePositives.push(rel);
  }
  return { root, catches, falsePositives, scanned: files.length };
}

function cmdPromotePropose(argv, flags) {
  const id = argv[0];
  if (!id || id[0] !== 'L') die('usage: promote-propose <L-ID> [--artifacts-root <dir>] [--json]');
  const contextDir = contextDirFrom(flags);
  const target = ledgerPath(contextDir);
  if (!fs.existsSync(target)) die('ledger.md does not exist yet; nothing to propose');
  const content = fs.readFileSync(target, 'utf8');
  const b = sectionBounds(content, id);
  if (!b) die(`record ${id} not found in ledger`);
  const section = content.slice(b.start, b.end);
  const status = currentStatus(section);
  const title = sectionTitle(section);
  const fpM = /^\s*fingerprint:\s*(\S+)/m.exec(section);
  if (!fpM) die(`${id} has no fingerprint; cannot run a retro-catch`);
  const fingerprint = unquoteScalar(fpM[1]);
  const tier = linkField(section, 'enforcement_tier') || 'reviewer-lens';
  const rule = extractBody(section);
  const flow = provenanceLine(section);
  const contexts = flow ? [...projectsInProvenance(flow.flow)] : [];

  // Retro-catch over the artifacts tree (default: the project's artifacts/ dir).
  // The root is read-confined under the project tree (K-4).
  const root = flags.artifactsRoot
    ? confineReadPath(flags.artifactsRoot, { allowExternal: flags.allowExternal })
    : path.dirname(contextDir); // .../artifacts
  const retro = retroCatch(root, fingerprint);

  if (flags.json) {
    process.stdout.write(JSON.stringify({
      id, title, fingerprint, status, proposedTier: tier, rule,
      contexts, occurrenceContexts: contexts.length,
      retroCatch: { root: retro.root, catches: retro.catches, count: retro.catches.length, scanned: retro.scanned },
      falsePositives: { files: retro.falsePositives, count: retro.falsePositives.length },
      humanGate: `record.cjs set-status ${id} promoted --human-approved <D-ID> --enforcement-tier ${tier}`,
    }, null, 2) + '\n');
    return;
  }

  const out = [];
  out.push(`PROMOTION PROPOSAL — ${id} (${title})`);
  out.push('');
  out.push(`  fingerprint:      ${fingerprint}`);
  out.push(`  current status:   ${status}`);
  out.push(`  distinct contexts: ${contexts.length}${contexts.length ? ' (' + contexts.join(', ') + ')' : ''}`);
  out.push(`  proposed tier:    ${tier}`);
  out.push('');
  out.push('  RULE (as it would compile into scaffolds):');
  for (const line of (rule || '(none)').split('\n')) out.push('    ' + line);
  out.push('');
  out.push(`  RETRO-CATCH (counterfactual replay over ${retro.root}, ${retro.scanned} files scanned):`);
  out.push(`    would have caught ${retro.catches.length} artifact(s):`);
  for (const c of retro.catches.slice(0, 25)) out.push('      ✓ ' + c);
  if (retro.catches.length > 25) out.push(`      … +${retro.catches.length - 25} more`);
  out.push('');
  out.push(`  FALSE-POSITIVE CHECK: ${retro.falsePositives.length} file(s) partially match (would need review):`);
  for (const c of retro.falsePositives.slice(0, 10)) out.push('      ? ' + c);
  if (retro.falsePositives.length > 10) out.push(`      … +${retro.falsePositives.length - 10} more`);
  out.push('');
  out.push('  This is a PROPOSAL. Promotion records an auditable ratification marker (ADR-021),');
  out.push('  and newly-compiled rules are surfaced for human review at init/update. To ratify:');
  if (status === 'recurring') out.push(`    record.cjs set-status ${id} candidate`);
  out.push(`    record.cjs set-status ${id} promoted --human-approved <D-ID> --enforcement-tier ${tier}`);
  process.stdout.write(out.join('\n') + '\n');
}

// Scan every `## <ID> — title` section of a markdown file and score by how many
// query terms it contains. Returns [{id, title, type, score, matched, snippet}].
function scanForRecall(content, terms, typesAllowed) {
  const out = [];
  const headRe = /^##\s+([DRLCF]-\d+)\s+—\s+(.+)$/gm;
  let m;
  while ((m = headRe.exec(content)) !== null) {
    const id = m[1];
    const title = m[2].trim();
    if (typesAllowed && !typesAllowed.has(id[0])) continue;
    const b = sectionBounds(content, id);
    const section = b ? content.slice(b.start, b.end) : (m[0] + '\n');
    const hay = section.toLowerCase();
    const matched = terms.filter((t) => hay.includes(t));
    if (matched.length === 0) continue;
    const bodyText = extractBody(section) || title;
    const snippet = bodyText.split('\n').find((l) => l.trim()) || title;
    out.push({ id, title, type: id[0], score: matched.length, matched, snippet: snippet.slice(0, 200) });
  }
  return out;
}

function cmdRecall(argv, flags) {
  const query = argv.join(' ').trim();
  if (!query) die('usage: recall <query…> [--json] [--context-dir <dir>]');
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const contextDir = contextDirFrom(flags);

  const results = [];
  const ledgerFile = ledgerPath(contextDir);
  if (fs.existsSync(ledgerFile)) {
    results.push(...scanForRecall(fs.readFileSync(ledgerFile, 'utf8'), terms));
  }
  const dlogFile = decisionLogPath(contextDir);
  if (fs.existsSync(dlogFile)) {
    // decision-log.md is prose (## D-n — title + a Decision: line); reuse the
    // same section scanner (it keys on `## <ID> — title`).
    results.push(...scanForRecall(fs.readFileSync(dlogFile, 'utf8'), terms, new Set(['D'])));
  }
  results.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));

  if (flags.json) { process.stdout.write(JSON.stringify({ query, results }, null, 2) + '\n'); return; }
  if (results.length === 0) { process.stdout.write(`recall "${query}": no records match.\n`); return; }
  const out = [`recall "${query}" — ${results.length} cited record(s):`, ''];
  for (const r of results) {
    out.push(`  [${r.id}] ${r.title}  (matched: ${r.matched.join(', ')})`);
    out.push(`      ${r.snippet}`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

function cmdReopenScan(flags) {
  const contextDir = contextDirFrom(flags);
  const target = ledgerPath(contextDir);
  const rejected = [];
  if (fs.existsSync(target)) {
    const content = fs.readFileSync(target, 'utf8');
    const headRe = /^##\s+(R-\d+)\s+—\s+(.+)$/gm;
    let m;
    while ((m = headRe.exec(content)) !== null) {
      const id = m[1];
      const b = sectionBounds(content, id);
      const section = b ? content.slice(b.start, b.end) : '';
      if (currentStatus(section) !== 'rejected') continue;
      const trigger = linkField(section, 'reopen_trigger') || '(no trigger recorded)';
      rejected.push({ id, title: m[2].trim(), trigger });
    }
  }

  // Optional evidence to test triggers against (a file or inline text). A
  // trigger "firing" is a judgment call (advisory lint, never enforcement, per
  // phase4 §3.2) — we only HIGHLIGHT likely fires by keyword overlap.
  let against = null;
  if (flags.against) {
    // --against is either inline text or a file; a file read is confined (K-4).
    if (fs.existsSync(flags.against)) {
      against = fs.readFileSync(confineReadPath(flags.against, { allowExternal: flags.allowExternal }), 'utf8').toLowerCase();
    } else {
      against = String(flags.against).toLowerCase();
    }
  }
  for (const r of rejected) {
    if (against) {
      const kws = r.trigger.toLowerCase().split(/\W+/).filter((w) => w.length >= 4);
      const hits = keywordHits(against, kws);
      // Judgment aid, not enforcement: a very short trigger needs all its words;
      // a longer one needs a 40% overlap (min two) to be flagged "likely fired".
      const need = kws.length <= 2 ? kws.length : Math.max(2, Math.ceil(kws.length * 0.4));
      r.likelyFired = kws.length > 0 && hits.length >= need;
      r.triggerHits = hits;
    }
  }

  if (flags.json) { process.stdout.write(JSON.stringify({ rejected }, null, 2) + '\n'); return; }
  if (rejected.length === 0) { process.stdout.write('reopen-scan: no rejected R-records to review.\n'); return; }
  const out = ['reopen-scan — rejected recommendations whose re-open trigger may have fired', '  (advisory: a trigger firing is a human judgment call, not enforcement)', ''];
  for (const r of rejected) {
    const flag = r.likelyFired ? ' [LIKELY FIRED]' : '';
    out.push(`  ${r.id} ${r.title}${flag}`);
    out.push(`      reopen-trigger: ${r.trigger}`);
    if (r.triggerHits && r.triggerHits.length) out.push(`      matched terms: ${r.triggerHits.join(', ')}`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

// Parse harvestable lessons out of a retrospective/lessons markdown file.
// Two lightweight conventions (a real retro can adopt either):
//   1) bullet form:  - **Title** (fingerprint: slug): statement…
//   2) heading form: ### Title  \n  fingerprint: slug  \n  statement paragraph
// Returns [{title, fingerprint, statement}].
function parseHarvestLessons(text) {
  const lessons = [];
  const lines = String(text).split('\n');

  // Bullet form.
  const bulletRe = /^\s*[-*]\s+(?:\*\*(.+?)\*\*|(.+?))\s*\(fingerprint:\s*([a-z0-9][a-z0-9-]*)\)\s*:?\s*(.*)$/i;
  for (const line of lines) {
    const bm = bulletRe.exec(line);
    if (bm) {
      lessons.push({
        title: (bm[1] || bm[2] || '').trim(),
        fingerprint: bm[3].trim().toLowerCase(),
        statement: (bm[4] || '').trim(),
      });
    }
  }

  // Heading form.
  for (let i = 0; i < lines.length; i++) {
    const hm = /^#{2,4}\s+(.+?)\s*$/.exec(lines[i]);
    if (!hm) continue;
    let fingerprint = null;
    const body = [];
    for (let j = i + 1; j < lines.length && !/^#{2,4}\s+/.test(lines[j]); j++) {
      const fm = /^\s*fingerprint:\s*([a-z0-9][a-z0-9-]*)\s*$/i.exec(lines[j]);
      if (fm) { fingerprint = fm[1].trim().toLowerCase(); continue; }
      if (lines[j].trim()) body.push(lines[j].trim());
    }
    if (fingerprint) lessons.push({ title: hm[1].trim(), fingerprint, statement: body.join(' ').slice(0, 400) });
  }
  return lessons;
}

function cmdHarvest(flags) {
  if (!flags.from) die('usage: harvest --from <dir|file> [--project <name>] [--dry-run] [--json] [--allow-external]');
  // Read-confined under the project tree unless --allow-external (K-4); the
  // real 10-field-project harvest is a human-present run that passes it.
  const src = confineReadPath(flags.from, { allowExternal: flags.allowExternal });
  if (!fs.existsSync(src)) die(`--from path does not exist: ${src}`);
  const isDir = fs.statSync(src).isDirectory();
  const files = isDir ? walkTextFiles(src) : [src];
  const date = flags.date || todayISO();

  // Provenance project: --project forces a single label; otherwise the source's
  // first path segment (or filename stem) is the project, so harvesting a tree
  // of per-project retros yields cross-context recurrence (the flagship demo:
  // Vantage + Quinn synthetic-fixture lessons fold into one L at recurring).
  const projectFor = (rel) => {
    if (flags.project) return flags.project;
    const seg = String(rel).split(/[\\/]/)[0];
    return seg.replace(/\.[^.]+$/, '') || 'harvest';
  };

  const found = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const rel = path.relative(src, f) || path.basename(f);
    for (const les of parseHarvestLessons(text)) {
      found.push({ ...les, source: rel, project: projectFor(rel) });
    }
  }

  if (flags.dryRun) {
    if (flags.json) { process.stdout.write(JSON.stringify({ dryRun: true, lessons: found }, null, 2) + '\n'); return; }
    process.stdout.write(`harvest --dry-run: ${found.length} lesson(s) found\n`);
    for (const l of found) process.stdout.write(`  [${l.fingerprint}] ${l.title} — ${l.source}\n`);
    return;
  }

  const contextDir = contextDirFrom(flags);
  const results = [];
  for (const les of found) {
    const input = {
      title: les.title,
      fingerprint: les.fingerprint,
      provenance: { role: 'harvester', project: les.project, date, occurrences: [] },
      body: les.statement || les.title,
    };
    // Mint at observed (never a later gated stage); recurrence-aware append
    // folds repeats of a fingerprint into one L and auto-flags recurring.
    const res = appendEnvelopeRecord(contextDir, 'L', input, { fingerprint: les.fingerprint, date });
    if (res.errors) { die('harvest: a lesson failed validation:\n  - ' + res.errors.join('\n  - ')); }
    results.push({ id: res.id, fingerprint: les.fingerprint, recurrence: res.recurrence ? res.recurrence.message : null });
  }

  if (flags.json) { process.stdout.write(JSON.stringify({ harvested: results }, null, 2) + '\n'); return; }
  process.stdout.write(`harvest: ${results.length} lesson(s) recorded\n`);
  for (const r of results) {
    process.stdout.write(`  ${r.id} [${r.fingerprint}]${r.recurrence ? '  (recurrence: folded)' : ''}\n`);
  }
}

// ---------------------------------------------------------------------------
// Born-immune compilation support (read-only): extract PROMOTED L-records so the
// package-side generators can compile earned rules into the scaffold. Pure +
// textual (no writes) — exported for utils/record-envelope.js re-use.
// ---------------------------------------------------------------------------

/**
 * Extract every promoted L-record from ledger.md content.
 * @returns {{id, title, fingerprint, enforcementTier, rule, contexts, occurrenceCount}[]}
 */
function extractPromotedLessons(ledgerContent) {
  const out = [];
  const content = String(ledgerContent || '');
  const headRe = /^##\s+(L-\d+)\s+—\s+(.+)$/gm;
  let m;
  while ((m = headRe.exec(content)) !== null) {
    const id = m[1];
    const b = sectionBounds(content, id);
    if (!b) continue;
    const section = content.slice(b.start, b.end);
    if (currentStatus(section) !== 'promoted') continue;
    // K-1 defense-in-depth: the fenced-block `id:` must match this heading's ID
    // AND the heading must directly open a ```yaml record: fence, so a block
    // embedded inside another record's field cannot masquerade as a top-level
    // promoted record. A structurally-inconsistent "promoted" section is dropped.
    const idM = /^\s*id:\s*(\S+)/m.exec(section);
    if (!idM || unquoteScalar(idM[1]) !== id) continue;
    if (!/^##\s+L-\d+\s+—\s+.*\n\s*```yaml\s*\n\s*record:/m.test(section)) continue;
    const fpM = /^\s*fingerprint:\s*(\S+)/m.exec(section);
    const flow = provenanceLine(section);
    const contexts = flow ? [...projectsInProvenance(flow.flow)] : [];
    out.push({
      id,
      title: m[2].trim(),
      fingerprint: fpM ? unquoteScalar(fpM[1]) : null,
      enforcementTier: linkField(section, 'enforcement_tier') || null,
      rule: extractBody(section),
      contexts,
      occurrenceCount: contexts.length,
      dIds: linkArray(section, 'd_ids'),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// argv parsing + dispatch
// ---------------------------------------------------------------------------

function normalizeType(t) {
  if (!t) return null;
  const up = String(t).toUpperCase();
  if (TYPES.includes(up)) return up;
  if (NAME_TYPE[String(t).toLowerCase()]) return NAME_TYPE[String(t).toLowerCase()];
  return null;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function die(msg) {
  process.stderr.write(`record.cjs: ${msg}\n`);
  process.exit(1);
}

// Parse `--flag value` / `--flag=value` / `--bool` into {flags, positionals}.
//
// Boolean-vs-valued is COMMAND-SCOPED because `--json` is overloaded: for the
// output commands (reconcile/recall/promote-propose/reopen-scan/harvest) it is a
// boolean output selector, but for `append` it carries the JSON record VALUE
// (`append --json '{...}'`). When it was in a single global BOOL_FLAGS set,
// `append --json '{...}'` set flags.json=true and dropped the JSON to a
// positional, so cmdAppend later did `true.trim()` and threw "raw.trim is not a
// function" (the documented --json path was dead). Scoping the bool set per
// command fixes it without breaking `reconcile --json` (D-036 append bug).
const DEFAULT_BOOL_FLAGS = new Set(['stdin', 'json', 'dry-run', 'no-graduate', 'allow-external']);
const COMMAND_BOOL_FLAGS = {
  append: new Set(['stdin']), // --json is VALUED here (inline record JSON)
};
const FLAG_ALIASES = {
  'reopen-trigger': 'reopenTrigger',
  'enforcement-tier': 'enforcementTier',
  'human-approved': 'humanApproved',
  'context-dir': 'contextDir',
  'artifacts-root': 'artifactsRoot',
  'no-graduate': 'noGraduate',
  'dry-run': 'dryRun',
};

function parseArgs(argv, boolFlags = DEFAULT_BOOL_FLAGS) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      let key = a.slice(2);
      let val;
      const eq = key.indexOf('=');
      if (eq !== -1) { val = key.slice(eq + 1); key = key.slice(0, eq); }
      const norm = FLAG_ALIASES[key] || camel(key);
      if (boolFlags.has(key) && val === undefined) { flags[norm] = true; continue; }
      if (val === undefined) { val = argv[++i]; }
      flags[norm] = val;
    } else {
      positionals.push(a);
    }
  }
  return { flags, positionals };
}

function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

function main(argv) {
  const cmd = argv[0];
  const boolFlags = COMMAND_BOOL_FLAGS[cmd] || DEFAULT_BOOL_FLAGS;
  const { flags, positionals } = parseArgs(argv.slice(1), boolFlags);
  switch (cmd) {
    case 'append': return cmdAppend(flags);
    case 'set-status': return cmdSetStatus(positionals, flags);
    case 'next-id': return cmdNextId(positionals, flags);
    case 'task-event': return cmdTaskEvent(flags);
    case 'night-charter': return cmdNightCharter(positionals, flags);
    case 'reconcile': return cmdReconcile(flags);
    case 'validate': return cmdValidate(flags);
    case 'promote-propose': return cmdPromotePropose(positionals, flags);
    case 'recall': return cmdRecall(positionals, flags);
    case 'reopen-scan': return cmdReopenScan(flags);
    case 'harvest': return cmdHarvest(flags);
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      process.stdout.write(HELP);
      return;
    default:
      die(`unknown subcommand ${JSON.stringify(cmd)}\n${HELP}`);
  }
}

const HELP = `record.cjs — the serialized-write channel for the unified record ledger

Usage:
  record.cjs append --type <D|R|L|C|F> [--stdin | --file <json> | --json <str>]
                    [--title "…"] [--fingerprint <slug>] [--status <s>]
                    [--body "…"] [--reopen-trigger "…"] [--context-dir <dir>]
  record.cjs set-status <ID> <status> [--reopen-trigger "…"]
                    [--enforcement-tier <t>] [--human-approved <D-ID>] [--context-dir <dir>]
  record.cjs next-id <D|R|L|C|F> [--context-dir <dir>]
  record.cjs task-event --task <id> --event <e> [--owner <n>] [--session <s>] [--detail "…"]
  record.cjs night-charter open --ends <iso> [--queue a,b] [--initiative unrestrained|queue-only|proposals-only]
                    [--extra-deny a,b] [--escalation none] [--grace-ms <n>] [--delivery-dir <dir>]
  record.cjs night-charter status [--delivery-dir <dir>]
  record.cjs night-charter close [--delivery-dir <dir>]
  record.cjs reconcile --tasklist <-|file> [--json] [--context-dir <dir>]
  record.cjs validate [--file <ledger.md>] [--context-dir <dir>]
  record.cjs promote-propose <L-ID> [--artifacts-root <dir>] [--json]
  record.cjs recall <query…> [--json] [--context-dir <dir>]
  record.cjs reopen-scan [--against <file|text>] [--json] [--context-dir <dir>]
  record.cjs harvest --from <dir|file> [--project <n>] [--dry-run] [--json]

reconcile reads TaskList JSON (stdin with --tasklist -, or a file), diffs it
against artifacts/context/task-ledger.md + project-brain.md frontmatter, and
prints the re-wake / stuck / orphan / awaiting-human action list (--json for
machine consumption).

task-event accepts an arbitrary --event/--detail vocabulary (--detail is stored
in the row's subject=). Documented night vocabularies (discoverability only — no
special handling): under the stable task pointer night-floor, the floor writes
denied rows; under night-nudge, the self-audit nudge writes nudged /
nudge-continued / nudge-done rows (owner=<teammate>, detail carries the episode
anchor or the teammate's disposition) — the morning report folds these into §7.

append is recurrence-aware: an L or F sharing a fingerprint folds the new
sighting into the existing record (no duplicate) and auto-flags an L recurring
on the 2nd distinct-project context. set-status R-x accepted graduates the
recommendation into a D-record (source: swarm-advisory) unless --no-graduate.
promote-propose emits a human-gated proposal with retro-catch evidence;
promotion itself stays behind set-status … promoted --human-approved <D-ID>.

Input is JSON (the shipped script carries no YAML dependency); the stored ledger
format is fenced YAML. append prints the newly allocated ID.
`;

// ---------------------------------------------------------------------------
// Exports (for package-side ESM re-use via utils/record-envelope.js) + CLI entry
// ---------------------------------------------------------------------------

module.exports = {
  TYPES,
  TYPE_NAME,
  NAME_TYPE,
  EVIDENCE_STATUS,
  EVIDENCE_KINDS,
  TRANSITIONS,
  INITIAL_STATUS,
  statusVocab,
  validateEnvelope,
  validateEvidenceItem,
  serializeRecord,
  emitFlow,
  emitScalar,
  nextId,
  maxIdNum,
  maxDecisionNum,
  sectionBounds,
  currentStatus,
  editRecordStatus,
  LEDGER_HEADER,
  reconcile,
  parseTaskLedgerLine,
  parseFrontmatterLite,
  formatReconcile,
  // knowledge-promotion surface (Stream K)
  findSectionByFingerprint,
  applyRecurrence,
  projectsInProvenance,
  appendOccurrenceToFlow,
  extractBody,
  sectionTitle,
  linkField,
  linkArray,
  addLinkDId,
  decisionExists,
  sanitizeInline,
  defangProse,
  retroCatch,
  parseHarvestLessons,
  extractPromotedLessons,
  main,
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    die(e && e.message ? e.message : String(e));
  }
}
