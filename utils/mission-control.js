// Mission Control v1 — the read-only control surface (Phase 4 Stream M;
// vision §4 Phase-4 line, diverge-novel Unlock 3, cut to the D-041 read-only
// scope). It renders four ACTION panels from the durable stores — it never
// streams a chat transcript and never shows a live cents odometer (the
// diverge-novel kill list is binding).
//
// READ-ONLY BY CONSTRUCTION: this module imports no write API. It reads the
// stores (readFileSync/existsSync only) and returns a model + rendered markdown.
// Nothing here mutates the ledger, the task-ledger, the brain, or the decision
// log — the security review asserts this, and test/mission-control.test.js pins
// that the source references no fs write function.
//
// The four panels:
//   1. AWAITING HUMAN — brain-gate `awaiting-human` entries (the front door).
//   2. RUNNING / STUCK — task-ledger activity, classified by reconcile() when a
//      live TaskList is supplied, by ledger recency otherwise.
//   3. DECISIONS & RECOMMENDATIONS — recent D-IDs + open R-records.
//   4. SPEND ESTIMATE — cost-estimator projection, labeled an estimate (D-038:
//      there is no telemetry, so this is never presented as measured spend).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { reconcile, parseTaskLedgerLine } from './reconcile.js';
import { splitFrontmatter } from './project-brain.js';
import { estimateCost, GOVERNOR_MODES } from './cost-estimator.js';
import { ENTRY_POINT_NAMES } from './entry-points.js';
import { getProjectPaths } from './paths.js';
import { computeRunway, iterationCounts, readActiveCharter, formatDuration } from './runway.js';

// Ledger events that mean a task is DONE. Mirrors record.cjs's
// RECONCILE_TERMINAL_EVENTS (not exported from there); the DIFF logic itself is
// reused via reconcile() — this set only drives the ledger-only running roster,
// the degenerate case reconcile() documents it cannot cover without a live
// TaskList (see utils/reconcile.js caveat: TaskList carries `owner`, TaskGet
// drops it, and orphan detection needs the live list).
const TERMINAL_EVENTS = new Set(['completed', 'failed', 'rejected', 'retired']);

// Default minutes of ledger silence before a ledger-only active task is called
// stuck. Matches reconcile()'s RECONCILE_STUCK_DEFAULT_MIN so both modes agree.
const STUCK_DEFAULT_MIN = 30;

// R-record statuses that mean "still awaiting a human disposition" (TRANSITIONS.R:
// open → accepted | rejected → reopened). open and reopened are the undisposed
// states the recommendations panel surfaces.
const OPEN_R_STATUSES = new Set(['open', 'reopened']);

function ageMinutes(tsMs, now) {
  return Number.isFinite(tsMs) ? Math.floor((now - tsMs) / 60000) : null;
}

function byTaskNum(a, b) {
  const na = parseInt(a.task, 10);
  const nb = parseInt(b.task, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a.task).localeCompare(String(b.task));
}

// Fold the task-ledger into per-task last-state, reusing parseTaskLedgerLine (the
// same parser reconcile() uses). Chronological; later rows win.
function foldTaskLedger(ledgerLines) {
  const byTask = new Map();
  for (const line of ledgerLines || []) {
    const e = parseTaskLedgerLine(line);
    if (!e) continue;
    let rec = byTask.get(e.task);
    if (!rec) {
      rec = { task: e.task, owner: null, subject: null, lastEvent: null, lastTsMs: NaN };
      byTask.set(e.task, rec);
    }
    if (e.owner) rec.owner = e.owner;
    if (e.subject) rec.subject = e.subject;
    rec.lastEvent = e.event;
    if (Number.isFinite(e.tsMs)) rec.lastTsMs = e.tsMs;
  }
  return byTask;
}

function toRunningRow(rec, now) {
  return {
    task: rec.task,
    owner: rec.owner,
    subject: rec.subject,
    lastEvent: rec.lastEvent,
    ageMinutes: ageMinutes(rec.lastTsMs, now),
  };
}

// Parse `## D-NNN — title` headings from the decision log; return the most-recent
// `limit` by numeric D-ID, newest first. A supersession note in a body does not
// remove the heading, so "recent" is purely by ID order (the deltas panel is a
// "what's new since you looked" list, not a state audit).
function parseRecentDecisions(decisionLog, limit = 5) {
  const out = [];
  for (const m of String(decisionLog || '').matchAll(/^##\s+(D-(\d+))\s+—\s+(.+?)\s*$/gm)) {
    out.push({ id: m[1], num: Number(m[2]), title: m[3].trim() });
  }
  out.sort((a, b) => b.num - a.num);
  return out.slice(0, limit).map(({ id, title }) => ({ id, title }));
}

// Parse the unified R/L/C/F ledger for R-records still awaiting disposition.
// Titles live in the `## R-NNN — title` heading; status/type live in the fenced
// YAML `record:` block. We pair the two by ID. Malformed YAML blocks are skipped
// (a reader must never throw on a store another stream is actively writing).
function parseOpenRecommendations(recordLedger) {
  const text = String(recordLedger || '');
  const titles = new Map();
  for (const m of text.matchAll(/^##\s+(R-\d+)\s+—\s+(.+?)\s*$/gm)) {
    titles.set(m[1], m[2].trim());
  }
  const out = [];
  for (const block of text.matchAll(/```ya?ml\s*\n([\s\S]*?)```/g)) {
    let rec = null;
    try {
      const doc = yaml.load(block[1]);
      rec = doc && doc.record ? doc.record : null;
    } catch {
      continue;
    }
    if (!rec || rec.type !== 'recommendation') continue;
    const status = String(rec.status || '').toLowerCase();
    if (!OPEN_R_STATUSES.has(status)) continue;
    out.push({ id: rec.id, title: titles.get(rec.id) || '(untitled)', status });
  }
  out.sort((a, b) => {
    const na = parseInt(String(a.id).replace(/\D/g, ''), 10);
    const nb = parseInt(String(b.id).replace(/\D/g, ''), 10);
    return (Number.isFinite(na) ? na : 0) - (Number.isFinite(nb) ? nb : 0);
  });
  return out;
}

function buildSpend(config, entryPoint) {
  // estimateCost throws on an unknown entry point; fall back to full-lifecycle so
  // the surface never fails to render over a misconfigured swarm.yaml.
  const ep = ENTRY_POINT_NAMES.includes(entryPoint) ? entryPoint : 'full-lifecycle';
  try {
    const e = estimateCost(config || {}, ep);
    return {
      entryPoint: ep,
      agents: e.agents,
      tokensMin: e.estimatedTokensMin,
      tokensMax: e.estimatedTokensMax,
      costMin: e.estimatedCostMin,
      costMax: e.estimatedCostMax,
    };
  } catch {
    return { entryPoint: ep, agents: [], tokensMin: 0, tokensMax: 0, costMin: '$0.00', costMax: '$0.00' };
  }
}

/**
 * Build the mission-control model from already-read inputs (pure — no I/O).
 *
 * @param {object} inputs
 * @param {object|Array|null} inputs.taskListJson  Live TaskList output, or null (ledger-only).
 * @param {string[]} inputs.ledgerLines            task-ledger.md lines.
 * @param {object} inputs.brainFrontmatter         project-brain.md frontmatter (gates/checkpoint).
 * @param {string} inputs.decisionLog              decision-log.md raw text.
 * @param {string} inputs.recordLedger             ledger.md raw text (R/L/C/F records).
 * @param {object} inputs.config                   swarm.yaml parsed.
 * @param {string} inputs.entryPoint               entry point for the spend estimate.
 * @param {number} [inputs.now]                    epoch ms; defaults to Date.now().
 * @param {number} [inputs.stuckThresholdMinutes]  ledger-only stuck threshold.
 * @returns {object} the four-panel model.
 */
export function buildMissionControl(inputs = {}) {
  const {
    taskListJson = null,
    ledgerLines = [],
    brainFrontmatter = {},
    decisionLog = '',
    recordLedger = '',
    config = {},
    entryPoint = 'full-lifecycle',
  } = inputs;
  const now = inputs.now != null ? (inputs.now instanceof Date ? inputs.now.getTime() : inputs.now) : Date.now();
  const stuckMin = inputs.stuckThresholdMinutes != null ? inputs.stuckThresholdMinutes : STUCK_DEFAULT_MIN;

  // One reconcile() call. awaitingHuman is derived from the brain gates only, so
  // it is correct regardless of whether a live TaskList was supplied.
  const r = reconcile(taskListJson || { tasks: [] }, ledgerLines, brainFrontmatter, { now, stuckThresholdMinutes: stuckMin });
  const awaitingHuman = r.awaitingHuman;

  const byTask = foldTaskLedger(ledgerLines);
  const active = [...byTask.values()].filter((rec) => !TERMINAL_EVENTS.has(rec.lastEvent));

  const running = [];
  const stuck = [];
  if (taskListJson) {
    // LIVE mode: fully delegate classification to reconcile().
    const flagged = new Set();
    for (const x of r.rewake) { flagged.add(x.task); stuck.push({ task: x.task, owner: x.owner, kind: 'not-woken', lastEvent: null, ageMinutes: null, reason: x.reason }); }
    for (const x of r.stuck) { flagged.add(x.task); stuck.push({ task: x.task, owner: x.owner, kind: 'stuck', lastEvent: x.lastEvent, ageMinutes: x.ageMinutes, reason: null }); }
    for (const x of r.orphans) { flagged.add(x.task); stuck.push({ task: x.task, owner: x.owner, kind: 'orphan', lastEvent: x.lastEvent, ageMinutes: x.ageMinutes, reason: x.reason }); }
    for (const rec of active) {
      if (flagged.has(rec.task)) continue;
      running.push(toRunningRow(rec, now));
    }
  } else {
    // LEDGER-ONLY mode: reconcile() needs the live TaskList's owner/status to
    // separate stuck from orphaned, so with no list we classify active tasks by
    // ledger recency alone (an active task silent past the threshold is stuck).
    for (const rec of active) {
      const age = ageMinutes(rec.lastTsMs, now);
      if (age === null || age >= stuckMin) {
        stuck.push({ task: rec.task, owner: rec.owner, kind: 'stale', lastEvent: rec.lastEvent, ageMinutes: age, reason: null });
      } else {
        running.push(toRunningRow(rec, now));
      }
    }
  }
  running.sort(byTaskNum);
  stuck.sort(byTaskNum);

  return {
    generatedAt: new Date(now).toISOString(),
    projectName: config?.project?.name || 'unknown',
    liveTaskList: !!taskListJson,
    awaitingHuman,
    running,
    stuck,
    decisions: parseRecentDecisions(decisionLog),
    openRecommendations: parseOpenRecommendations(recordLedger),
    spend: buildSpend(config, entryPoint),
    staleness: r.staleness,
  };
}

function fmtAge(m) {
  return m == null ? '' : ` age=${m}m`;
}

/**
 * Render the model to markdown. The same text is written to a report and printed
 * by `status --full`; it reads cleanly in a terminal.
 * @param {object} model
 * @returns {string}
 */
export function renderMissionControl(model) {
  const out = [];
  out.push(`# Mission Control — ${model.projectName}`);
  out.push('');
  out.push(`_Generated ${model.generatedAt} · read-only surface from the durable stores (task-ledger, project-brain, decision-log, ledger)._`);
  if (!model.liveTaskList) {
    out.push('');
    out.push('_No live TaskList supplied — running/stuck is classified by ledger recency only (orphan detection needs a live TaskList)._');
  }
  out.push('');

  // Panel 1 — the front door.
  out.push('## Awaiting human');
  out.push('');
  if (model.awaitingHuman.length === 0) {
    out.push('_Nothing is blocked on a human decision._');
  } else {
    for (const g of model.awaitingHuman) {
      const dId = g.dId ? ` (${g.dId})` : '';
      const since = g.since ? ` · awaiting since ${g.since}` : '';
      out.push(`- **${g.gate}**${dId}${since}`);
    }
  }
  out.push('');

  // Panel 2 — running / stuck.
  out.push('## Running / stuck');
  out.push('');
  out.push(`Running (${model.running.length}):`);
  if (model.running.length === 0) {
    out.push('- _no active tasks_');
  } else {
    for (const t of model.running) {
      const subj = t.subject ? ` — ${t.subject}` : '';
      out.push(`- task ${t.task} · owner=${t.owner || '?'} · ${t.lastEvent || 'unknown'}${fmtAge(t.ageMinutes)}${subj}`);
    }
  }
  out.push('');
  out.push(`Stuck / needs attention (${model.stuck.length}):`);
  if (model.stuck.length === 0) {
    out.push('- _none_');
  } else {
    for (const t of model.stuck) {
      const reason = t.reason ? ` — ${t.reason}` : (t.lastEvent ? ` · lastEvent=${t.lastEvent}` : '');
      out.push(`- task ${t.task} · owner=${t.owner || '?'} · [${t.kind}]${fmtAge(t.ageMinutes)}${reason}`);
    }
  }
  out.push('');

  // Panel 3 — decisions & recommendations.
  out.push('## Decisions & recommendations');
  out.push('');
  out.push('Recent decisions:');
  if (model.decisions.length === 0) {
    out.push('- _none logged_');
  } else {
    for (const d of model.decisions) out.push(`- ${d.id} — ${d.title}`);
  }
  out.push('');
  out.push('Open recommendations (awaiting disposition):');
  if (model.openRecommendations.length === 0) {
    out.push('- _none open_');
  } else {
    for (const rr of model.openRecommendations) out.push(`- ${rr.id} — ${rr.title} (${rr.status})`);
  }
  out.push('');

  // Panel 4 — spend estimate (never measured spend — D-038).
  const s = model.spend;
  out.push('## Spend estimate');
  out.push('');
  out.push(`Entry point: ${s.entryPoint}${s.agents.length ? ` · agents: ${s.agents.join(', ')}` : ''}`);
  out.push(`Estimated tokens: ${s.tokensMin.toLocaleString()}–${s.tokensMax.toLocaleString()}`);
  out.push(`Estimated cost: ${s.costMin}–${s.costMax}`);
  out.push('_Estimate only — a pre-run projection from the cost model, not measured spend (no telemetry, D-038)._');
  out.push('');

  // Footer — staleness (from reconcile()).
  const st = model.staleness || {};
  out.push(`_Staleness: ledger last event ${st.ledgerAgeMinutes != null ? `${st.ledgerAgeMinutes}m ago` : 'n/a'}; brain checkpoint ${st.brainCheckpoint != null ? st.brainCheckpoint : 'n/a'}._`);
  out.push('');

  return out.join('\n');
}

/**
 * Read the durable stores from disk (read-only) and assemble the buildMissionControl
 * inputs. This is the I/O boundary; buildMissionControl itself is pure.
 * @param {string} projectRoot
 * @param {object} [opts] { now?, taskListJson?, entryPoint?, stuckThresholdMinutes? }
 * @returns {object} inputs for buildMissionControl.
 */
export function readMissionControlInputs(projectRoot, opts = {}) {
  const paths = getProjectPaths(projectRoot);
  const contextDir = join(paths.artifactsDir, 'context');
  const readSafe = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

  const taskLedgerRaw = readSafe(join(contextDir, 'task-ledger.md'));
  const ledgerLines = taskLedgerRaw ? taskLedgerRaw.split('\n') : [];
  const { frontmatter } = splitFrontmatter(readSafe(paths.brainPath));

  let config = {};
  if (existsSync(paths.swarmYaml)) {
    try { config = yaml.load(readFileSync(paths.swarmYaml, 'utf8')) || {}; } catch { config = {}; }
  }
  const entryPoint = opts.entryPoint || config?.methodology?.entry_point || 'full-lifecycle';

  return {
    taskListJson: opts.taskListJson || null,
    ledgerLines,
    brainFrontmatter: frontmatter || {},
    decisionLog: readSafe(join(contextDir, 'decision-log.md')),
    recordLedger: readSafe(join(contextDir, 'ledger.md')),
    config,
    entryPoint,
    now: opts.now != null ? opts.now : Date.now(),
    stuckThresholdMinutes: opts.stuckThresholdMinutes,
  };
}

/**
 * Convenience: read the stores and render the surface to markdown in one call.
 * @param {string} projectRoot
 * @param {object} [opts]
 * @returns {string} rendered markdown.
 */
export function missionControlMarkdown(projectRoot, opts = {}) {
  return renderMissionControl(buildMissionControl(readMissionControlInputs(projectRoot, opts)));
}

// ---------------------------------------------------------------------------
// The morning report (Phase 5 Stream GM) — `report --morning`.
//
// The seven-section ranked ACTION QUEUE the human clears at breakfast, in queue
// order (diverge-overnight §4 / decomposition §3.3). It is generated EXCLUSIVELY
// from the durable stores (task-ledger, ledger, decision-log, charter, git branch
// list) — REPORT-FROM-LEDGER, never report-from-memory. The acceptance test: a
// FRESH process, with the orchestrator that ran the night dead and its in-memory
// state gone, produces the same report from disk alone (a night IS a series of
// deaths; the 5am orchestrator crash must not cost the morning report).
//
// Still read-only by construction: buildMorningReport is pure; the I/O boundary
// (readMorningReportInputs) reads files only. The git branch list is read by the
// CLI caller (cli/report.js) and passed in — this module imports no child_process.
// ---------------------------------------------------------------------------

// Task-ledger event vocabularies the night writes (Streams S/R own the writers;
// the report reads whatever landed). Liberal on purpose — a reader must survive
// events it has never seen (they fall into the raw night-ledger count).
const DENY_EVENTS = new Set(['deny', 'denied', 'floor-deny', 'blocked-write', 'floor-block']);
const FORK_EVENTS = new Set(['fork', 'fork-pair']);
const PARK_EVENTS = new Set(['park', 'parked']);
const PROPOSAL_EVENTS = new Set(['proposal', 'proposed']);
const ROUTER_EVENTS = new Set(['router-miss', 'route', 'router-decision', 'router-escalate']);

// Branches touching these path fragments sort higher and get the heavier review
// lenses (diverge-overnight §1.1: flagged for attention, NEVER fenced — D-034).
const SENSITIVE_BRANCH_RE = /auth|secret|cred(ential)?|security|token|password|payment|billing|\bkey\b|private/i;

function foldNightEvents(ledgerLines) {
  const all = [];
  for (const raw of ledgerLines || []) {
    const e = parseTaskLedgerLine(raw);
    if (e) all.push(e);
  }
  return all;
}

function countRecordsMinted(recordLedger) {
  const text = String(recordLedger || '');
  const ids = new Set();
  for (const m of text.matchAll(/^##\s+([RLCF]-\d+)\s+—/gm)) ids.add(m[1]);
  return ids.size;
}

/**
 * Build the morning-report model from already-read inputs (pure — no I/O).
 *
 * @param {object} inputs
 * @param {object|null} inputs.charter        parsed night charter (runway.parseCharter) or null.
 * @param {string[]} inputs.ledgerLines       task-ledger.md lines (the night's events).
 * @param {string} inputs.recordLedger        ledger.md raw (R/L/C/F records).
 * @param {string} inputs.decisionLog         decision-log.md raw.
 * @param {string[]} inputs.branches          git branch names (queue/* and initiative/*).
 * @param {object} inputs.config              swarm.yaml parsed.
 * @param {string} inputs.entryPoint          entry point for the transparency spend figure.
 * @param {string|null} inputs.dawnNarrative  the W1 header slot (non-load-bearing) or null.
 * @param {number} [inputs.now]               epoch ms; defaults to Date.now().
 * @param {number} [inputs.tripwireIterations] no-progress threshold.
 * @returns {object} the seven-section model + runway header.
 */
export function buildMorningReport(inputs = {}) {
  const {
    charter = null,
    ledgerLines = [],
    recordLedger = '',
    decisionLog = '',
    branches = [],
    config = {},
    entryPoint = 'full-lifecycle',
    dawnNarrative = null,
    tripwireIterations,
  } = inputs;
  const now = inputs.now != null ? (inputs.now instanceof Date ? inputs.now.getTime() : inputs.now) : Date.now();

  // Runway header (clock is the only hard resource — D-034). Absent charter =
  // the report still generates; the runway block simply reads "no active charter".
  const runway = charter && Number.isFinite(charter.endsMs)
    ? computeRunway({ endsMs: charter.endsMs, startMs: charter.startMs, now })
    : null;

  const events = foldNightEvents(ledgerLines);
  const iters = iterationCounts(ledgerLines, { tripwireIterations });

  // 1 · ANSWER THESE — parked Rung-3 decisions (open/reopened R-records: the
  // advisory ledger's pause tier, time-shifted to morning).
  const answerThese = parseOpenRecommendations(recordLedger);

  // 2 · PICK ONE — Rung-1 fork pairs awaiting a morning selection between working
  // versions (a `fork` event per candidate; grouped by its subject slug).
  const forkBySlug = new Map();
  for (const e of events) {
    if (!FORK_EVENTS.has(e.event)) continue;
    const slug = e.subject != null ? String(e.subject) : `task-${e.task}`;
    if (!forkBySlug.has(slug)) forkBySlug.set(slug, { slug, tasks: [] });
    forkBySlug.get(slug).tasks.push(e.task);
  }
  const pickOne = [...forkBySlug.values()];

  // 3 · MERGE THESE — queue/* branches, one merge command each. Ranking is a
  // review convenience; it never refuses work (D-034).
  const mergeThese = branches
    .filter((b) => b.startsWith('queue/'))
    .sort()
    .map((branch) => ({ branch, command: `git merge --no-ff ${branch}` }));

  // 4 · INITIATIVE SHELF — initiative/* branches, best-first; sensitive-path
  // branches FLAGGED for heavier review (flagged, never fenced).
  const initiativeShelf = branches
    .filter((b) => b.startsWith('initiative/'))
    .sort()
    .map((branch) => ({ branch, sensitive: SENSITIVE_BRANCH_RE.test(branch) }));

  // 5 · PROPOSALS — floor-blocked prepared-but-unexecuted work (dependency bumps,
  // widenings): built and tested on a branch, blocked from execution by the floor.
  const proposals = events
    .filter((e) => PROPOSAL_EVENTS.has(e.event))
    .map((e) => ({ task: e.task, subject: e.subject != null ? String(e.subject) : null }));

  // 6 · PARKED / TRIPWIRED — loop trails VERBATIM (no euphemisms). Tripwire data
  // (advisory) plus explicit park events; the trail often IS the finding.
  const parkedTasks = new Set(events.filter((e) => PARK_EVENTS.has(e.event)).map((e) => e.task));
  const parkedTripwired = iters
    .filter((it) => it.tripwired || parkedTasks.has(it.task))
    .map((it) => ({
      task: it.task,
      subject: it.subject != null ? String(it.subject) : null,
      iterations: it.iterations,
      trail: it.trail,
      reason: it.tripwired ? 'no-progress tripwire' : 'parked',
    }));

  // 7 · NIGHT LEDGER — the night's transparency layer.
  const deniedAttempts = events
    .filter((e) => DENY_EVENTS.has(e.event))
    .map((e) => ({ task: e.task, ts: e.ts, subject: e.subject != null ? String(e.subject) : null }));
  const routerDecisions = events
    .filter((e) => ROUTER_EVENTS.has(e.event))
    .map((e) => ({ event: e.event, task: e.task, subject: e.subject != null ? String(e.subject) : null }));

  // Tokens for TRANSPARENCY, never a cap (D-038). Scheduler mode carries the
  // quota-coupling note; the figure is an estimate, never measured spend.
  const ep = ENTRY_POINT_NAMES.includes(entryPoint) ? entryPoint : 'full-lifecycle';
  let spend;
  try {
    const e = estimateCost(config || {}, ep, { mode: GOVERNOR_MODES.SCHEDULER });
    spend = { tokensMin: e.estimatedTokensMin, tokensMax: e.estimatedTokensMax, mode: e.mode, quotaNote: e.quotaNote };
  } catch {
    const e = estimateCost(config || {}, 'full-lifecycle', { mode: GOVERNOR_MODES.SCHEDULER });
    spend = { tokensMin: e.estimatedTokensMin, tokensMax: e.estimatedTokensMax, mode: e.mode, quotaNote: e.quotaNote };
  }

  return {
    generatedAt: new Date(now).toISOString(),
    projectName: config?.project?.name || 'unknown',
    charter: charter ? { ends: charter.ends ? charter.ends.toISOString() : null, initiative: charter.initiative, queue: charter.queue } : null,
    runway: runway ? {
      valid: runway.valid,
      expired: runway.expired,
      inDawnSlice: runway.inDawnSlice,
      remaining: formatDuration(runway.totalRemainingMs),
      workRemaining: formatDuration(runway.workRemainingMs),
      dawnSlice: formatDuration(runway.dawnSliceMs),
    } : null,
    dawnNarrative: dawnNarrative || null,
    answerThese,
    pickOne,
    mergeThese,
    initiativeShelf,
    proposals,
    parkedTripwired,
    decisions: parseRecentDecisions(decisionLog),
    nightLedger: {
      totalEvents: events.length,
      deniedAttempts,
      routerDecisions,
      recordsMinted: countRecordsMinted(recordLedger),
      spend,
    },
  };
}

/**
 * Render the morning-report model to markdown — the seven sections in queue
 * order under a dawn-narrative header slot (the slot is non-load-bearing: the
 * deterministic sections stand alone when the orchestrator died before writing it).
 * @param {object} model
 * @returns {string}
 */
export function renderMorningReport(model) {
  const out = [];
  out.push(`# Morning report — ${model.projectName}`);
  out.push('');
  out.push(`_Generated ${model.generatedAt} · report-from-ledger (durable stores only — survives a 5am orchestrator death)._`);
  out.push('');

  // Dawn-narrative header slot (W1) — written by the orchestrator during the dawn
  // slice IF alive; the report never depends on it.
  out.push('## Dawn synthesis');
  out.push('');
  if (model.dawnNarrative) {
    out.push(model.dawnNarrative.trim());
  } else {
    out.push('_No dawn narrative written (the orchestrator did not reach the dawn slice, or is dead). The queue below stands on its own — it is generated from the ledger, not from memory._');
  }
  out.push('');

  // Runway / floor header.
  if (model.runway) {
    const r = model.runway;
    const state = r.expired ? 'the clock has expired — the night is over' : (r.inDawnSlice ? 'in the reserved dawn slice' : `runway remaining ${r.remaining} (work ${r.workRemaining} · dawn slice ${r.dawnSlice})`);
    out.push(`_Charter: ${state}. The night floor was ${r.expired ? 'active until the clock expired' : 'active'} — destructive actions denied (D-034)._`);
  } else {
    out.push('_No active night charter — this is a day-mode snapshot of the durable stores._');
  }
  out.push('');

  // Queue verbs the human uses to clear it (the --skip protocol, H5-6).
  out.push('_Clear the queue with: **answer** · **pick** · **merge** · **shelf** · **skip** (defer an item without deciding — it reappears next report, un-escalated)._');
  out.push('');

  // 1 · ANSWER THESE
  out.push('## 1 · Answer these');
  out.push('');
  out.push('_Parked decisions awaiting your call (each is a re-openable R-record — the advisory pause tier, time-shifted)._');
  if (model.answerThese.length === 0) {
    out.push('- _nothing parked on a decision._');
  } else {
    for (const r of model.answerThese) out.push(`- **${r.id}** — ${r.title} (${r.status})`);
  }
  out.push('');

  // 2 · PICK ONE
  out.push('## 2 · Pick one');
  out.push('');
  out.push('_Fork pairs: pick between working versions (diffs + tests + judge note on each branch)._');
  if (model.pickOne.length === 0) {
    out.push('- _no forks to choose between._');
  } else {
    for (const f of model.pickOne) out.push(`- **${f.slug}** — fork across tasks ${f.tasks.join(', ')}`);
  }
  out.push('');

  // 3 · MERGE THESE
  out.push('## 3 · Merge these');
  out.push('');
  out.push('_Queue work that passed review — one merge command each (nothing was auto-merged, at any trust level)._');
  if (model.mergeThese.length === 0) {
    out.push('- _no queue branches ready to merge._');
  } else {
    for (const m of model.mergeThese) out.push(`- \`${m.command}\` — ${m.branch}`);
  }
  out.push('');

  // 4 · INITIATIVE SHELF
  out.push('## 4 · Initiative shelf');
  out.push('');
  out.push('_Self-directed work, best-first. Each branch cites its source in its first commit. Worst case for any of these is `git branch -D`._');
  if (model.initiativeShelf.length === 0) {
    out.push('- _the shelf is empty._');
  } else {
    for (const b of model.initiativeShelf) {
      out.push(`- ${b.branch}${b.sensitive ? ' — ⚠ sensitive path: heavier review lens' : ''}`);
    }
  }
  out.push('');

  // 5 · PROPOSALS
  out.push('## 5 · Proposals');
  out.push('');
  out.push('_Prepared-but-unexecuted work the floor blocked (dependency bumps, floor widenings) — built and tested, awaiting your go._');
  if (model.proposals.length === 0) {
    out.push('- _no floor-blocked proposals._');
  } else {
    for (const p of model.proposals) out.push(`- ${p.subject || `(task ${p.task})`}`);
  }
  out.push('');

  // 6 · PARKED / TRIPWIRED
  out.push('## 6 · Parked / tripwired');
  out.push('');
  out.push('_Items parked with their loop trail verbatim — often the loop itself is the finding._');
  if (model.parkedTripwired.length === 0) {
    out.push('- _nothing parked or tripwired._');
  } else {
    for (const p of model.parkedTripwired) {
      const subj = p.subject ? ` — ${p.subject}` : '';
      out.push(`- task ${p.task}${subj} · [${p.reason}] · ${p.iterations} iterations · trail: ${p.trail.join(' → ')}`);
    }
  }
  out.push('');

  // 7 · NIGHT LEDGER
  const nl = model.nightLedger;
  out.push('## 7 · Night ledger');
  out.push('');
  if (nl.deniedAttempts.length > 0) {
    out.push(`**🚨 DENIED ATTEMPTS (${nl.deniedAttempts.length})** — the floor blocked these; each is a red banner:`);
    for (const d of nl.deniedAttempts) {
      out.push(`- 🚨 \`${d.subject || '(unspecified)'}\`${d.task ? ` · task ${d.task}` : ''}${d.ts ? ` · ${d.ts}` : ''}`);
    }
    out.push('');
  } else {
    out.push('_No destructive action was attempted (no denied-attempt banners)._');
    out.push('');
  }
  out.push(`Router decisions: ${nl.routerDecisions.length === 0 ? '_none logged_' : ''}`);
  for (const r of nl.routerDecisions) out.push(`- ${r.event}${r.subject ? ` — ${r.subject}` : ''}${r.task ? ` · task ${r.task}` : ''}`);
  out.push('');
  out.push(`Records minted tonight: ${nl.recordsMinted}`);
  out.push(`Total night events: ${nl.totalEvents}`);
  out.push('');
  out.push(`Tokens (transparency only, never a cap): ~${nl.spend.tokensMin.toLocaleString()}–${nl.spend.tokensMax.toLocaleString()} estimated.`);
  out.push(`_${nl.spend.quotaNote}_`);
  out.push('');

  return out.join('\n');
}

/**
 * Read the durable stores for the morning report (read-only). The git branch
 * list is supplied by the caller (opts.branches) — this module reads no process.
 * @param {string} projectRoot
 * @param {object} [opts] { now?, branches?, entryPoint?, dawnNarrative?, tripwireIterations? }
 * @returns {object} inputs for buildMorningReport.
 */
export function readMorningReportInputs(projectRoot, opts = {}) {
  const paths = getProjectPaths(projectRoot);
  const contextDir = join(paths.artifactsDir, 'context');
  const readSafe = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

  const taskLedgerRaw = readSafe(join(contextDir, 'task-ledger.md'));
  const ledgerLines = taskLedgerRaw ? taskLedgerRaw.split('\n') : [];

  let config = {};
  if (existsSync(paths.swarmYaml)) {
    try { config = yaml.load(readFileSync(paths.swarmYaml, 'utf8')) || {}; } catch { config = {}; }
  }
  const entryPoint = opts.entryPoint || config?.methodology?.entry_point || 'full-lifecycle';

  return {
    charter: readActiveCharter(projectRoot),
    ledgerLines,
    recordLedger: readSafe(join(contextDir, 'ledger.md')),
    decisionLog: readSafe(join(contextDir, 'decision-log.md')),
    branches: opts.branches || [],
    config,
    entryPoint,
    dawnNarrative: opts.dawnNarrative || null,
    now: opts.now != null ? opts.now : Date.now(),
    tripwireIterations: opts.tripwireIterations,
  };
}

/**
 * Convenience: read the stores and render the morning report in one call.
 * @param {string} projectRoot
 * @param {object} [opts]
 * @returns {string} rendered markdown.
 */
export function morningReportMarkdown(projectRoot, opts = {}) {
  return renderMorningReport(buildMorningReport(readMorningReportInputs(projectRoot, opts)));
}
