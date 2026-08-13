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
import { estimateCost } from './cost-estimator.js';
import { ENTRY_POINT_NAMES } from './entry-points.js';
import { getProjectPaths } from './paths.js';

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
