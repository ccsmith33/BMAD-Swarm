// utils/runway.js — the Governor's night clock (Phase 5 Stream GM).
//
// D-034 / D-038: at night the ONLY hard resource is the clock. The Governor is a
// treasurer by day (utils/cost-estimator.js, budget/cap-stall avoidance) and a
// SCHEDULER by night — and scheduling is clock math: how much runway is left, how
// much of it is reserved for writing the morning report (the dawn slice, planned
// backward from `ends:`), and which work items are spinning without producing new
// state (the no-progress tripwire).
//
// The tripwire here is ADVISORY DATA, not a budget cap (the kill list is binding).
// iterationCounts() is deterministic evidence — per-item event counts and trails;
// the DECISION to park a spinning item stays with the orchestrator. There is no
// measured closed loop and no cap: tokens never appear here, only the clock.
//
// READ-ONLY BY CONSTRUCTION (same stance as mission-control.js): this module
// imports no fs write API. It reads the charter and the task-ledger and returns
// plain data; test/runway.test.js pins that the source references no writer.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { parseTaskLedgerLine } from './reconcile.js';
import { getProjectPaths } from './paths.js';

// The dawn slice reserved at the END of the night for writing the morning report:
// max(30 minutes, 5% of the night), whichever is larger. Defaults per the design
// (diverge-overnight §4/§7-W1); callers may override both.
export const DEFAULT_DAWN_RESERVE_MS = 30 * 60 * 1000;
export const DEFAULT_DAWN_RESERVE_FRACTION = 0.05;

// No-progress tripwire default: N iterations with no new state → advisory park.
export const DEFAULT_TRIPWIRE_ITERATIONS = 3;

// H5-2(d): the floor persists until the human-wake marker OR ends+grace,
// whichever is first. Default 2h — matches the night-charter schema's grace_ms.
export const DEFAULT_GRACE_MS = 7200000;

// Task-ledger events that ADVANCE state. A task whose last N events contain one
// of these is making progress and is not tripwired; everything else (rejected,
// retry, failed, blocked, stuck, reopened, deny, park) is a no-progress signal.
const PROGRESS_EVENTS = new Set([
  'in_progress', 'completed', 'evidence', 'review-pass', 'created', 'merged', 'artifact', 'passed',
]);

// Synthetic "tasks" the night writes that are NOT work items — the floor's deny
// log (task=night-floor event=denied) is a rap sheet, not a spinning item, and
// must never be read as a no-progress work loop by the tripwire.
const META_TASKS = new Set(['night-floor']);

// Parse a charter clock value to epoch ms. The authoritative night-charter schema
// (owned by Stream S) is ISO-8601 with a numeric offset; we tolerate a js-yaml
// Date and, best-effort, a trailing timezone abbreviation like "07:00 CT".
function parseClock(v) {
  if (v == null) return NaN;
  if (v instanceof Date) return v.getTime();
  const s = String(v).trim();
  let ms = Date.parse(s);
  if (Number.isNaN(ms)) {
    ms = Date.parse(s.replace(/\s+[A-Za-z]{2,4}$/, ''));
  }
  return ms;
}

// Coerce a value to a finite epoch-ms number, accepting a number or a numeric
// string. Non-numeric → NaN (the caller falls back to the human `ends` string).
function toEpochMs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v != null && /^\d+$/.test(String(v).trim())) return Number(String(v).trim());
  return NaN;
}

/**
 * Parse a night-charter file's content (the night-charter/1 schema — the S→GM
 * interface). Accepts YAML frontmatter (`---` delimited) or a bare `night_charter:`
 * block. Never throws — a reader must survive a store another stream is writing.
 *
 * CLOCK CONTRACT (anti TZ/clock-manipulation, per the schema's "Clock" section):
 * `endsMs` prefers `ends_epoch_ms` — the absolute instant resolved at open time
 * under the machine clock — and re-parses the ambiguous human `ends` string ONLY
 * as a fallback when `ends_epoch_ms` is absent or non-numeric.
 *
 * @param {string} text - charter file content.
 * @returns {{ends: Date|null, endsMs: number, endsEpochMs: number, startMs: number,
 *            graceMs: number, queue: string[], initiative: string|null,
 *            extraDeny: string[], escalation: string, status: string|null, raw: object}}
 */
export function parseCharter(text) {
  const raw = String(text == null ? '' : text);
  const fm = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(raw);
  const body = fm ? fm[1] : raw;

  let data = {};
  try {
    const doc = yaml.load(body);
    if (doc && typeof doc === 'object') {
      data = doc.night_charter && typeof doc.night_charter === 'object' ? doc.night_charter : doc;
    }
  } catch {
    data = {};
  }
  if (!data || typeof data !== 'object') data = {};

  // The absolute epoch fixed at open time wins; the human string is the fallback.
  const endsEpochMs = toEpochMs(data.ends_epoch_ms != null ? data.ends_epoch_ms : data.endsEpochMs);
  const endsStringMs = parseClock(data.ends != null ? data.ends : null);
  const endsMs = Number.isFinite(endsEpochMs) ? endsEpochMs : endsStringMs;

  const startMs = parseClock(
    data.opened_at != null ? data.opened_at
      : (data.opened != null ? data.opened : (data.starts != null ? data.starts : null)),
  );
  const graceMs = (typeof data.grace_ms === 'number' && Number.isFinite(data.grace_ms)) ? data.grace_ms : DEFAULT_GRACE_MS;
  const extraDeny = Array.isArray(data.extra_deny) ? data.extra_deny
    : (Array.isArray(data.extraDeny) ? data.extraDeny : []);

  return {
    ends: Number.isFinite(endsMs) ? new Date(endsMs) : null,
    endsMs: Number.isFinite(endsMs) ? endsMs : NaN,
    endsEpochMs: Number.isFinite(endsEpochMs) ? endsEpochMs : NaN,
    startMs: Number.isFinite(startMs) ? startMs : NaN,
    graceMs,
    queue: Array.isArray(data.queue) ? data.queue : [],
    initiative: data.initiative != null ? data.initiative : null,
    extraDeny,
    escalation: data.escalation != null ? data.escalation : 'none',
    status: data.status != null ? String(data.status) : null,
    raw: data,
  };
}

function toMs(v, fallback) {
  if (v == null) return fallback;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return parseClock(v);
}

/**
 * Compute the night's runway from `ends:`. Pure clock math — no tokens, no cap.
 *
 * @param {object} opts
 * @param {number|Date|string} [opts.endsMs|opts.ends]  charter end time.
 * @param {number|Date} [opts.now]                       defaults to Date.now().
 * @param {number} [opts.startMs]                        night start (for the 5% basis).
 * @param {number} [opts.dawnReserveMs]                  dawn-slice floor (default 30m).
 * @param {number} [opts.dawnReserveFraction]            dawn-slice fraction (default 5%).
 * @returns {object} runway model.
 */
export function computeRunway(opts = {}) {
  const nowMs = toMs(opts.now, Date.now());
  const endsMs = opts.endsMs != null ? toMs(opts.endsMs, NaN) : toMs(opts.ends, NaN);
  const startMs = opts.startMs != null ? toMs(opts.startMs, NaN) : NaN;
  const reserveMs = opts.dawnReserveMs != null ? opts.dawnReserveMs : DEFAULT_DAWN_RESERVE_MS;
  const reserveFraction = opts.dawnReserveFraction != null ? opts.dawnReserveFraction : DEFAULT_DAWN_RESERVE_FRACTION;

  if (!Number.isFinite(endsMs)) {
    return {
      valid: false, active: false, expired: false,
      nowMs, endsMs: NaN, totalRemainingMs: 0, nightSpanMs: 0,
      dawnSliceMs: 0, dawnStartsMs: NaN, inDawnSlice: false, workRemainingMs: 0,
    };
  }

  const totalRemainingMs = Math.max(0, endsMs - nowMs);
  const expired = nowMs >= endsMs;
  // The 5% slice is 5% of the night span (start→ends) when a start is known; a
  // fresh process with no start still reserves a sane slice from the remaining
  // runway. Either way the 30-minute floor guarantees the report gets written.
  const nightSpanMs = Number.isFinite(startMs) ? Math.max(0, endsMs - startMs) : totalRemainingMs;
  const dawnSliceMs = Math.max(reserveMs, Math.floor(reserveFraction * nightSpanMs));
  const dawnStartsMs = endsMs - dawnSliceMs;
  const inDawnSlice = nowMs >= dawnStartsMs && nowMs < endsMs;
  const workRemainingMs = Math.max(0, dawnStartsMs - nowMs);

  return {
    valid: true,
    active: !expired,
    expired,
    nowMs,
    endsMs,
    totalRemainingMs,
    nightSpanMs,
    dawnSliceMs,
    dawnStartsMs,
    inDawnSlice,
    workRemainingMs,
  };
}

/**
 * Fold the task-ledger into per-item iteration data — the tripwire's ADVISORY
 * evidence. An item whose last N events show no state-advancing event is flagged
 * `tripwired` (a candidate for the orchestrator to park with its trail). This is
 * NOT a cap: it never stops work; it only surfaces standing-still (D-034).
 *
 * @param {string[]} ledgerLines
 * @param {object} [opts] { tripwireIterations?: number }
 * @returns {Array<{task, owner, subject, iterations, lastEvent, trail, tripwired}>}
 */
export function iterationCounts(ledgerLines, opts = {}) {
  const threshold = opts.tripwireIterations != null ? opts.tripwireIterations : DEFAULT_TRIPWIRE_ITERATIONS;
  const byTask = new Map();
  for (const raw of ledgerLines || []) {
    const e = parseTaskLedgerLine(raw);
    if (!e) continue;
    if (META_TASKS.has(e.task)) continue; // the floor's deny log is not a work loop
    let rec = byTask.get(e.task);
    if (!rec) { rec = { task: e.task, owner: null, subject: null, events: [] }; byTask.set(e.task, rec); }
    if (e.owner) rec.owner = e.owner;
    if (e.subject) rec.subject = e.subject;
    rec.events.push(e.event);
  }
  const out = [];
  for (const rec of byTask.values()) {
    const iterations = rec.events.length;
    const lastN = rec.events.slice(-threshold);
    const hasProgress = lastN.some((ev) => PROGRESS_EVENTS.has(ev));
    out.push({
      task: rec.task,
      owner: rec.owner,
      subject: rec.subject,
      iterations,
      lastEvent: rec.events[rec.events.length - 1] || null,
      trail: rec.events.slice(),
      tripwired: iterations >= threshold && !hasProgress,
    });
  }
  out.sort((a, b) => b.iterations - a.iterations || String(a.task).localeCompare(String(b.task)));
  return out;
}

/**
 * Render a duration in ms as `Hh Mm` (or `Mm` under an hour). Negative clamps to 0.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Resolve and read the active night charter for a project (read-only). The
 * `.night-charter-current` pointer under artifacts/delivery/ is the schema's
 * single source of truth for "a night is open" — it holds the BASENAME of the
 * active dated charter. When the pointer is absent (a normal day) we fall back to
 * the newest dated `night-charter-<date>.md` so the morning report can still cite
 * the night just past. Returns a parsed charter or null.
 *
 * Note: the floor hook's fail-closed semantics on a dangling/corrupt pointer are
 * Stream S's enforcement concern; this read-only reader simply returns null when
 * it cannot resolve a readable charter (the report degrades to a day-mode header).
 *
 * @param {string} projectRoot
 * @returns {object|null} parseCharter() result, or null when no charter resolves.
 */
export function readActiveCharter(projectRoot) {
  const paths = getProjectPaths(projectRoot);
  const deliveryDir = join(paths.artifactsDir, 'delivery');
  if (!existsSync(deliveryDir)) return null;

  const pointer = join(deliveryDir, '.night-charter-current');
  let target = null;
  if (existsSync(pointer)) {
    const ref = readFileSync(pointer, 'utf8').trim();
    if (ref) {
      // The pointer holds a basename; tolerate an absolute path defensively.
      const p = ref.startsWith('/') ? ref : join(deliveryDir, ref);
      if (existsSync(p)) target = p;
    }
  }
  if (!target) {
    let names;
    try { names = readdirSync(deliveryDir); } catch { return null; }
    const dated = names.filter((n) => /^night-charter-\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort();
    if (dated.length === 0) return null;
    target = join(deliveryDir, dated[dated.length - 1]);
  }
  if (!existsSync(target)) return null;
  return parseCharter(readFileSync(target, 'utf8'));
}
