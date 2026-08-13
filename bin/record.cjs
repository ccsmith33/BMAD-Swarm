#!/usr/bin/env node
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
  // L: observed -> recurring -> candidate -> promoted(HUMAN GATE) -> retired.
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
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
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
  const title = (rec.title || '').trim() || '(untitled)';
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

// Highest allocated integer for `type` across all `id: <TYPE>-<n>` lines.
function maxIdNum(content, type) {
  const re = new RegExp(`\\bid:\\s*${type}-(\\d+)`, 'g');
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

  // The append door must honor the SAME constitutional gate as set-status
  // (F-27 / F2-H3): otherwise `append --type L --status promoted` mints a
  // promoted lesson with no human ratification. An L-record may only ENTER at
  // observed or recurring (the migration needs recurring); any later stage on
  // the append door requires --human-approved <D-ID>, and promoted stays the
  // non-negotiable human gate (ADR-021).
  if (type === 'L') {
    const requested = flags.status != null ? flags.status : (input.status != null ? input.status : INITIAL_STATUS.L);
    if (!['observed', 'recurring'].includes(requested) && !flags.humanApproved) {
      die(`append --type L may only enter at observed|recurring; status ${JSON.stringify(requested)} requires --human-approved <D-ID> (ADR-021 human gate)`);
    }
  }

  const contextDir = contextDirFrom(flags);

  if (type === 'D') {
    // D records live in decision-log.md as human-readable prose. The body is
    // caller-supplied free-form markdown (§3.1: D entries gain nothing new).
    const target = decisionLogPath(contextDir);
    let allocated = null;
    withFileLock(contextDir, target, (cur) => {
      const id = nextId(cur, 'D');
      allocated = id;
      const title = (input.title || flags.title || '').trim() || '(untitled)';
      const date = (input.provenance && input.provenance.date) || flags.date || todayISO();
      const cls = input.classification || flags.classification || 'Tactical';
      const body = (input.body || '').trim();
      const block = `\n## ${id} — ${title}\n\n- **Date:** ${date}\n- **Classification:** ${cls}\n- **Decision:** ${body}\n`;
      const base = cur && cur.trim() ? cur.replace(/\s*$/, '\n') : cur;
      return base + block;
    });
    process.stdout.write(allocated + '\n');
    return;
  }

  // R/L/C/F -> ledger.md fenced-YAML envelope.
  const target = ledgerPath(contextDir);
  let allocated = null;
  let validationErrors = null;
  withFileLock(contextDir, target, (cur) => {
    const base = cur && cur.trim() ? cur : LEDGER_HEADER;
    const rec = buildRecord(type, input, flags, base);
    const errs = validateEnvelope(rec);
    if (errs.length > 0) { validationErrors = errs; return null; }
    allocated = rec.id;
    return base.replace(/\s*$/, '\n') + '\n' + serializeRecord(rec) + '\n';
  });
  if (validationErrors) die('record failed envelope validation:\n  - ' + validationErrors.join('\n  - '));
  process.stdout.write(allocated + '\n');
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

  let err = null;
  withFileLock(contextDir, target, (cur) => {
    const b = sectionBounds(cur, id);
    if (!b) { err = `record ${id} not found in ledger`; return null; }
    const from = currentStatus(cur.slice(b.start, b.end));
    if (!from) { err = `record ${id} has no status`; return null; }
    const allowed = (TRANSITIONS[type][from] || []);
    if (!allowed.includes(newStatus)) {
      err = `illegal ${type} transition ${from} -> ${newStatus} (allowed: ${allowed.join(', ') || 'none'})`;
      return null;
    }
    // Constitutional gate: L -> promoted requires a human ratification D-ID.
    if (type === 'L' && newStatus === 'promoted' && !flags.humanApproved) {
      err = 'L -> promoted is the human gate: pass --human-approved <D-ID> (ADR-021)';
      return null;
    }
    // A rejected R must record a reopen trigger.
    if (type === 'R' && newStatus === 'rejected' && !flags.reopenTrigger) {
      err = 'R -> rejected requires --reopen-trigger "…" (ADR-021)';
      return null;
    }
    return editRecordStatus(cur, id, newStatus, {
      reopenTrigger: flags.reopenTrigger,
      enforcementTier: flags.enforcementTier,
    });
  });
  if (err) die(err);
  process.stdout.write(`${id} -> ${newStatus}\n`);
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
  const target = flags.file ? path.resolve(flags.file) : ledgerPath(contextDir);
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
  let curKey = null;
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^\S/.test(line)) {
      const tm = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (!tm) { curKey = null; continue; }
      const k = tm[1];
      const v = tm[2].replace(/\s+#.*$/, '');
      if (v.trim() === '') { fm[k] = {}; curKey = k; }
      else if (v.trim()[0] === '{') { fm[k] = _liteFlowMap(v); curKey = null; }
      else { fm[k] = _liteScalar(v); curKey = null; }
    } else if (curKey) {
      const cm = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (!cm) continue;
      const ck = cm[1];
      const cv = cm[2].replace(/\s+#.*$/, '');
      if (cv.trim() === '') fm[curKey][ck] = {};
      else if (cv.trim()[0] === '{') fm[curKey][ck] = _liteFlowMap(cv);
      else fm[curKey][ck] = _liteScalar(cv);
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
const BOOL_FLAGS = new Set(['stdin', 'json']);
const FLAG_ALIASES = {
  'reopen-trigger': 'reopenTrigger',
  'enforcement-tier': 'enforcementTier',
  'human-approved': 'humanApproved',
  'context-dir': 'contextDir',
};

function parseArgs(argv) {
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
      if (BOOL_FLAGS.has(key)) { flags[norm] = true; continue; }
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
  const { flags, positionals } = parseArgs(argv.slice(1));
  switch (cmd) {
    case 'append': return cmdAppend(flags);
    case 'set-status': return cmdSetStatus(positionals, flags);
    case 'next-id': return cmdNextId(positionals, flags);
    case 'task-event': return cmdTaskEvent(flags);
    case 'reconcile': return cmdReconcile(flags);
    case 'validate': return cmdValidate(flags);
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
  record.cjs reconcile --tasklist <-|file> [--json] [--context-dir <dir>]
  record.cjs validate [--file <ledger.md>] [--context-dir <dir>]

reconcile reads TaskList JSON (stdin with --tasklist -, or a file), diffs it
against artifacts/context/task-ledger.md + project-brain.md frontmatter, and
prints the re-wake / stuck / orphan / awaiting-human action list (--json for
machine consumption).

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
  main,
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    die(e && e.message ? e.message : String(e));
  }
}
