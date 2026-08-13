import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  buildMissionControl,
  renderMissionControl,
  readMissionControlInputs,
  missionControlMarkdown,
} from '../utils/mission-control.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const NOW = Date.parse('2026-08-13T12:00:00Z');

// Build a task-ledger line in the exact format record.cjs task-event writes.
function line(ts, task, event, owner, subject) {
  let s = `${ts} session=s1 task=${task} event=${event}`;
  if (owner) s += ` owner=${owner}`;
  if (subject) s += ` subject=${JSON.stringify(subject)}`;
  return s;
}

const DECISION_LOG = `# Decision Log

## D-001 — First decision

- **Date:** 2026-04-16

## D-036 — The record envelope

- **Date:** 2026-08-01

## D-050 — Staging posture

- **Date:** 2026-08-11
`;

const RECORD_LEDGER = `# Ledger

## F-001 — some finding

\`\`\`yaml
record:
  id: F-001
  type: finding
  status: open
\`\`\`

## R-001 — spike both paths before committing

\`\`\`yaml
record:
  id: R-001
  type: recommendation
  status: open
\`\`\`

## R-002 — already accepted, should not surface

\`\`\`yaml
record:
  id: R-002
  type: recommendation
  status: accepted
\`\`\`

## R-003 — reopened, awaiting a fresh call

\`\`\`yaml
record:
  id: R-003
  type: recommendation
  status: reopened
\`\`\`
`;

describe('mission-control: awaiting-human panel (the front door)', () => {
  it('surfaces a brain gate blocked on a human decision', () => {
    const model = buildMissionControl({
      brainFrontmatter: { gates: { architecture: { status: 'awaiting-human', d_id: 'D-051', at: '2026-08-13T09:00:00Z' } }, checkpoint: 7 },
      now: NOW,
    });
    assert.equal(model.awaitingHuman.length, 1);
    assert.equal(model.awaitingHuman[0].gate, 'architecture');
    assert.equal(model.awaitingHuman[0].dId, 'D-051');
    const md = renderMissionControl(model);
    assert.match(md, /## Awaiting human/);
    assert.match(md, /\*\*architecture\*\* \(D-051\)/);
  });

  it('shows the empty state when no gate is awaiting a human', () => {
    const model = buildMissionControl({ brainFrontmatter: { gates: { prd: { status: 'passed' } } }, now: NOW });
    assert.equal(model.awaitingHuman.length, 0);
    assert.match(renderMissionControl(model), /Nothing is blocked on a human decision/);
  });
});

describe('mission-control: running/stuck panel', () => {
  it('LIVE mode — reconcile classifies running vs stuck vs orphan', () => {
    const ledger = [
      // task 1: healthy, in progress, recent activity
      line('2026-08-13T11:55:00Z', '1', 'in_progress', 'dev-a', 'story-1'),
      // task 2: in progress but silent for hours -> stuck
      line('2026-08-13T06:00:00Z', '2', 'in_progress', 'dev-b', 'story-2'),
      // task 3: ledger thinks alive but absent from TaskList -> orphan
      line('2026-08-13T11:00:00Z', '3', 'in_progress', 'dev-c', 'story-3'),
      // task 4: completed -> not shown
      line('2026-08-13T10:00:00Z', '4', 'completed', 'dev-d', 'story-4'),
    ];
    const taskList = { tasks: [
      { id: '1', status: 'in_progress', owner: 'dev-a' },
      { id: '2', status: 'in_progress', owner: 'dev-b' },
      // task 3 missing from TaskList -> orphan
    ] };
    const model = buildMissionControl({ taskListJson: taskList, ledgerLines: ledger, now: NOW });
    assert.equal(model.liveTaskList, true);
    assert.deepEqual(model.running.map((t) => t.task), ['1']);
    const kinds = Object.fromEntries(model.stuck.map((t) => [t.task, t.kind]));
    assert.equal(kinds['2'], 'stuck');
    assert.equal(kinds['3'], 'orphan');
    assert.ok(!('4' in kinds), 'completed task must not appear');
    const md = renderMissionControl(model);
    assert.match(md, /Running \(1\)/);
    assert.match(md, /\[orphan\]/);
  });

  it('LEDGER-ONLY mode — classifies active tasks by recency when no TaskList is supplied', () => {
    const ledger = [
      line('2026-08-13T11:58:00Z', '1', 'in_progress', 'dev-a', 'story-1'), // fresh -> running
      line('2026-08-13T05:00:00Z', '2', 'in_progress', 'dev-b', 'story-2'), // stale -> stuck
      line('2026-08-13T10:00:00Z', '3', 'completed', 'dev-c', 'story-3'),   // done -> hidden
    ];
    const model = buildMissionControl({ ledgerLines: ledger, now: NOW, stuckThresholdMinutes: 30 });
    assert.equal(model.liveTaskList, false);
    assert.deepEqual(model.running.map((t) => t.task), ['1']);
    assert.deepEqual(model.stuck.map((t) => t.task), ['2']);
    assert.equal(model.stuck[0].kind, 'stale');
    assert.match(renderMissionControl(model), /classified by ledger recency only/);
  });
});

describe('mission-control: decisions & recommendations panel', () => {
  it('lists recent D-IDs (newest first) and only open/reopened R-records', () => {
    const model = buildMissionControl({ decisionLog: DECISION_LOG, recordLedger: RECORD_LEDGER, now: NOW });
    assert.deepEqual(model.decisions.map((d) => d.id), ['D-050', 'D-036', 'D-001']);
    const rIds = model.openRecommendations.map((r) => r.id);
    assert.deepEqual(rIds, ['R-001', 'R-003']);
    assert.ok(!rIds.includes('R-002'), 'accepted R must not surface as awaiting disposition');
    const md = renderMissionControl(model);
    assert.match(md, /D-050 — Staging posture/);
    assert.match(md, /R-001 — spike both paths before committing \(open\)/);
    assert.match(md, /R-003 — .*\(reopened\)/);
  });

  it('shows empty states with no decisions or recommendations', () => {
    const md = renderMissionControl(buildMissionControl({ now: NOW }));
    assert.match(md, /Recent decisions:\n- _none logged_/);
    assert.match(md, /Open recommendations \(awaiting disposition\):\n- _none open_/);
  });
});

describe('mission-control: spend estimate (labeled, never measured — D-038)', () => {
  it('renders a cost-estimator projection labeled an estimate', () => {
    const config = { project: { name: 'demo' }, defaults: { model: 'opus' } };
    const model = buildMissionControl({ config, entryPoint: 'bug-fix', now: NOW });
    assert.equal(model.spend.entryPoint, 'bug-fix');
    assert.deepEqual(model.spend.agents, ['developer', 'reviewer']);
    assert.ok(model.spend.tokensMax > model.spend.tokensMin);
    const md = renderMissionControl(model);
    assert.match(md, /## Spend estimate/);
    assert.match(md, /Estimate only/);
    assert.doesNotMatch(md, /\$\d+\.\d+\/(min|hour)/, 'no live cents odometer (kill list)');
  });

  it('falls back to full-lifecycle on an unknown entry point instead of throwing', () => {
    const model = buildMissionControl({ config: { project: { name: 'x' } }, entryPoint: 'nonsense', now: NOW });
    assert.equal(model.spend.entryPoint, 'full-lifecycle');
  });
});

describe('mission-control: renders all four panels together', () => {
  it('produces one markdown surface with every panel header', () => {
    const md = renderMissionControl(buildMissionControl({
      brainFrontmatter: { gates: { architecture: { status: 'awaiting-human' } } },
      ledgerLines: [line('2026-08-13T11:58:00Z', '1', 'in_progress', 'dev-a', 'story-1')],
      decisionLog: DECISION_LOG,
      recordLedger: RECORD_LEDGER,
      config: { project: { name: 'demo' } },
      entryPoint: 'full-lifecycle',
      now: NOW,
    }));
    assert.match(md, /# Mission Control — demo/);
    assert.match(md, /## Awaiting human/);
    assert.match(md, /## Running \/ stuck/);
    assert.match(md, /## Decisions & recommendations/);
    assert.match(md, /## Spend estimate/);
    assert.match(md, /_Staleness:/);
  });
});

describe('mission-control: read-only by construction', () => {
  it('the module source imports no fs write API and calls no writer', () => {
    const src = readFileSync(join(__dirname, '..', 'utils', 'mission-control.js'), 'utf8');
    for (const forbidden of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'createWriteStream', 'writeSync', 'rmdirSync']) {
      assert.ok(!src.includes(forbidden), `mission-control.js must not reference ${forbidden} (read-only surface)`);
    }
    // fs is imported for reads only.
    assert.match(src, /import \{ existsSync, readFileSync \} from 'node:fs'/);
  });

  it('missionControlMarkdown reads the stores without creating or modifying any file', () => {
    const dir = join(tmpdir(), 'bmad-mc-io-' + Date.now());
    const ctx = join(dir, 'artifacts', 'context');
    mkdirSync(ctx, { recursive: true });
    writeFileSync(join(dir, 'swarm.yaml'), 'project:\n  name: io-demo\ndefaults:\n  model: opus\n');
    writeFileSync(join(ctx, 'task-ledger.md'), line('2026-08-13T11:58:00Z', '1', 'in_progress', 'dev-a', 'story-1') + '\n');
    writeFileSync(join(ctx, 'project-brain.md'), '---\nschema: project-brain/1\nupdated: 2026-08-13\ncheckpoint: 3\nphase: implementation\ngates:\n  architecture:\n    status: awaiting-human\n    d_id: D-051\n---\n\n## What this is (and why)\n');
    writeFileSync(join(ctx, 'decision-log.md'), DECISION_LOG);
    writeFileSync(join(ctx, 'ledger.md'), RECORD_LEDGER);

    const snapshot = () => readdirSync(dir, { recursive: true })
      .filter((f) => typeof f === 'string')
      .map((f) => {
        const p = join(dir, f);
        let s; try { s = statSync(p); } catch { return `${f}:gone`; }
        return `${f}:${s.isFile() ? s.size + ':' + s.mtimeMs : 'dir'}`;
      })
      .sort()
      .join('\n');

    const before = snapshot();
    const md = missionControlMarkdown(dir, { now: NOW });
    const after = snapshot();

    assert.equal(before, after, 'no file may be created or modified by rendering the surface');
    // The deep-nested block gate must parse (js-yaml, not the lite reader).
    assert.match(md, /\*\*architecture\*\* \(D-051\)/);
    assert.match(md, /# Mission Control — io-demo/);

    rmSync(dir, { recursive: true, force: true });
  });

  it('readMissionControlInputs tolerates a fresh project with missing stores', () => {
    const dir = join(tmpdir(), 'bmad-mc-empty-' + Date.now());
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'swarm.yaml'), 'project:\n  name: empty\n');
    const inputs = readMissionControlInputs(dir, { now: NOW });
    const md = renderMissionControl(buildMissionControl(inputs));
    assert.match(md, /# Mission Control — empty/);
    assert.match(md, /Nothing is blocked on a human decision/);
    rmSync(dir, { recursive: true, force: true });
  });
});
