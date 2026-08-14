import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseCharter } from '../utils/runway.js';
import {
  buildMorningReport,
  renderMorningReport,
  morningReportMarkdown,
} from '../utils/mission-control.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// A fixed "morning" clock: the night ends 2026-08-14T07:00Z; we render at 06:45.
const ENDS = '2026-08-14T07:00:00Z';
const NOW = Date.parse('2026-08-14T06:45:00Z');

function line(ts, task, event, owner, subject) {
  let s = `${ts} session=s1 task=${task} event=${event}`;
  if (owner) s += ` owner=${owner}`;
  if (subject) s += ` subject=${JSON.stringify(subject)}`;
  return s;
}

const CHARTER_TEXT = `---
night_charter:
  schema: night-charter/1
  date: 2026-08-13
  opened_at: 2026-08-13T22:00:00Z
  ends: ${ENDS}
  ends_epoch_ms: ${Date.parse(ENDS)}
  grace_ms: 7200000
  queue: [BUG-141, FEAT-52]
  initiative: unrestrained
  extra_deny: []
  escalation: none
  status: open
---

# Night charter 2026-08-13
`;

const RECORD_LEDGER = `# Ledger

## R-010 — should we split the auth module?
\`\`\`yaml
record:
  id: R-010
  type: recommendation
  status: open
\`\`\`

## L-004 — flaky test fingerprint
\`\`\`yaml
record:
  id: L-004
  type: lesson
  status: open
\`\`\`

## F-020 — missing null check
\`\`\`yaml
record:
  id: F-020
  type: finding
  status: open
\`\`\`
`;

const DECISION_LOG = `# Decision Log

## D-034 — clock is the only hard resource

## D-038 — one governor, honest quota coupling
`;

// A night's task-ledger: a denied 3am push, a fork pair, a tripwired loop, a
// proposal, a park, plus healthy work.
function nightLedger() {
  return [
    line('2026-08-14T01:00:00Z', '1', 'in_progress', 'dev-a', 'BUG-141'),
    line('2026-08-14T01:20:00Z', '1', 'completed', 'dev-a', 'BUG-141'),
    // denied destructive action at 3am -> red banner (canonical night-floor row)
    line('2026-08-14T03:00:00Z', 'night-floor', 'denied', 'dev-a', 'git push origin main'),
    // fork pair on a reversible decision
    line('2026-08-14T02:00:00Z', '5', 'fork', 'dev-b', 'cache-strategy'),
    line('2026-08-14T02:05:00Z', '6', 'fork', 'dev-c', 'cache-strategy'),
    // tripwired death loop (3 churn events, no progress)
    line('2026-08-14T04:00:00Z', '7', 'rejected', 'dev-d', 'FEAT-52'),
    line('2026-08-14T04:10:00Z', '7', 'retry', 'dev-d', 'FEAT-52'),
    line('2026-08-14T04:20:00Z', '7', 'rejected', 'dev-d', 'FEAT-52'),
    // a floor-blocked proposal (major dependency bump)
    line('2026-08-14T05:00:00Z', '8', 'proposal', 'dev-e', 'bump express 4->5'),
    // a router-miss calibration event
    line('2026-08-14T05:30:00Z', '9', 'router-miss', 'orchestrator', 'complexity underestimated'),
  ];
}

const BRANCHES = [
  'main',
  'queue/BUG-141',
  'queue/FEAT-52',
  'initiative/regime-cache',
  'initiative/auth-hardening',
];

function fixtureInputs(overrides = {}) {
  return {
    charter: parseCharter(CHARTER_TEXT),
    ledgerLines: nightLedger(),
    recordLedger: RECORD_LEDGER,
    decisionLog: DECISION_LOG,
    branches: BRANCHES,
    config: { project: { name: 'demo' }, defaults: { model: 'opus' } },
    entryPoint: 'full-lifecycle',
    now: NOW,
    ...overrides,
  };
}

describe('morning report: the seven-section model', () => {
  it('ANSWER THESE surfaces open R-records (parked decisions)', () => {
    const m = buildMorningReport(fixtureInputs());
    assert.deepEqual(m.answerThese.map((r) => r.id), ['R-010']);
  });

  it('PICK ONE groups fork pairs by slug', () => {
    const m = buildMorningReport(fixtureInputs());
    assert.equal(m.pickOne.length, 1);
    assert.equal(m.pickOne[0].slug, 'cache-strategy');
    assert.deepEqual(m.pickOne[0].tasks.sort(), ['5', '6']);
  });

  it('MERGE THESE lists queue/* branches with a merge command each', () => {
    const m = buildMorningReport(fixtureInputs());
    assert.deepEqual(m.mergeThese.map((x) => x.branch), ['queue/BUG-141', 'queue/FEAT-52']);
    assert.match(m.mergeThese[0].command, /git merge/);
  });

  it('INITIATIVE SHELF lists initiative/* branches and flags sensitive paths', () => {
    const m = buildMorningReport(fixtureInputs());
    const byBranch = Object.fromEntries(m.initiativeShelf.map((b) => [b.branch, b.sensitive]));
    assert.equal(byBranch['initiative/regime-cache'], false);
    assert.equal(byBranch['initiative/auth-hardening'], true, 'auth-* is sensitive, flagged not fenced');
  });

  it('PROPOSALS lists floor-blocked prepared work', () => {
    const m = buildMorningReport(fixtureInputs());
    assert.equal(m.proposals.length, 1);
    assert.match(m.proposals[0].subject, /express/);
  });

  it('PARKED / TRIPWIRED surfaces the death loop with its trail verbatim', () => {
    const m = buildMorningReport(fixtureInputs());
    const t7 = m.parkedTripwired.find((p) => p.task === '7');
    assert.ok(t7, 'the tripwired task appears');
    assert.equal(t7.reason, 'no-progress tripwire');
    assert.deepEqual(t7.trail, ['rejected', 'retry', 'rejected']);
    assert.ok(!m.parkedTripwired.some((p) => p.task === 'night-floor'), 'the floor deny log is never tripwired as a work item');
  });

  it('NIGHT LEDGER red-banners the denied 3am push and counts records/events', () => {
    const m = buildMorningReport(fixtureInputs());
    assert.equal(m.nightLedger.deniedAttempts.length, 1);
    assert.match(m.nightLedger.deniedAttempts[0].subject, /git push/);
    assert.equal(m.nightLedger.routerDecisions.length, 1);
    assert.equal(m.nightLedger.recordsMinted, 3, 'R-010, L-004, F-020');
    assert.ok(m.nightLedger.totalEvents >= 10);
  });

  it('tokens are transparency only, carrying the quota-coupling note (never a cap)', () => {
    const m = buildMorningReport(fixtureInputs());
    assert.ok(m.nightLedger.spend.tokensMax > 0);
    assert.match(m.nightLedger.spend.quotaNote, /same/i);
  });

  it('runway header reads from the charter clock (dawn-slice aware)', () => {
    const m = buildMorningReport(fixtureInputs());
    assert.ok(m.runway);
    assert.equal(m.runway.expired, false);
    assert.equal(m.runway.inDawnSlice, true, '06:45 is inside the final 30m dawn slice');
  });
});

describe('morning report: rendering', () => {
  it('renders all seven section headers plus the dawn slot', () => {
    const md = renderMorningReport(buildMorningReport(fixtureInputs()));
    assert.match(md, /# Morning report — demo/);
    assert.match(md, /## Dawn synthesis/);
    assert.match(md, /## 1 · Answer these/);
    assert.match(md, /## 2 · Pick one/);
    assert.match(md, /## 3 · Merge these/);
    assert.match(md, /## 4 · Initiative shelf/);
    assert.match(md, /## 5 · Proposals/);
    assert.match(md, /## 6 · Parked \/ tripwired/);
    assert.match(md, /## 7 · Night ledger/);
    // the denied 3am push is a visible red banner
    assert.match(md, /🚨.*git push/);
    // report-from-ledger provenance line
    assert.match(md, /report-from-ledger/);
  });

  it('the dawn narrative is a slot, never a dependency — absent still renders', () => {
    const md = renderMorningReport(buildMorningReport(fixtureInputs({ dawnNarrative: null })));
    assert.match(md, /## Dawn synthesis/);
    assert.match(md, /did not reach the dawn slice|is dead|stands on its own/);
  });

  it('renders a provided dawn narrative into the header slot', () => {
    const md = renderMorningReport(buildMorningReport(fixtureInputs({
      dawnNarrative: 'The night built two caches. The branch I most believe in is initiative/regime-cache.',
    })));
    assert.match(md, /branch I most believe in is initiative\/regime-cache/);
  });

  it('renders empty states for a quiet night without throwing', () => {
    const md = renderMorningReport(buildMorningReport({
      charter: null, ledgerLines: [], recordLedger: '', decisionLog: '', branches: [],
      config: { project: { name: 'quiet' } }, now: NOW,
    }));
    assert.match(md, /# Morning report — quiet/);
    assert.match(md, /No active night charter/);
    assert.match(md, /nothing parked on a decision/);
    assert.match(md, /No destructive action was attempted/);
  });
});

// ---------------------------------------------------------------------------
// Self-audit nudge (L-5): §7 surfaces per-teammate dispositions plus the count
// of bare nudges that never got a reply (a crash between nudge and disposition).
// ---------------------------------------------------------------------------
describe('morning report: self-audit nudges in §7', () => {
  // A night where three teammates were nudged at a stopping point: one continued,
  // one reaffirmed done, and one crashed after the nudge before replying.
  function nudgeLedger() {
    return [
      ...nightLedger(),
      line('2026-08-14T02:30:00Z', 'night-nudge', 'nudged', 'dev-b', 'episode:2026-08-14T02:00:00Z task:5'),
      line('2026-08-14T02:32:00Z', 'night-nudge', 'nudge-continued', 'dev-b', 'picked up: harden the cache eviction test'),
      line('2026-08-14T04:30:00Z', 'night-nudge', 'nudged', 'dev-d', 'episode:2026-08-14T04:00:00Z task:7'),
      line('2026-08-14T04:33:00Z', 'night-nudge', 'nudge-done', 'dev-d', 'parked: FEAT-52 rewrite; reason: blocked on an accepted D-ID'),
      // dev-e was nudged but the process died before it could answer (bare nudge).
      line('2026-08-14T05:10:00Z', 'night-nudge', 'nudged', 'dev-e', 'episode:2026-08-14T05:00:00Z task:8'),
    ];
  }

  it('folds nudge events per teammate into nightLedger.nudges + a bare-nudged count', () => {
    const m = buildMorningReport(fixtureInputs({ ledgerLines: nudgeLedger() }));
    const byAgent = Object.fromEntries(m.nightLedger.nudges.map((n) => [n.agent, n]));
    assert.equal(m.nightLedger.nudges.length, 2, 'two teammates gave a disposition');
    assert.equal(byAgent['dev-b'].disposition, 'continued');
    assert.match(byAgent['dev-b'].detail, /harden the cache eviction test/);
    assert.equal(byAgent['dev-d'].disposition, 'done');
    assert.match(byAgent['dev-d'].detail, /blocked on an accepted D-ID/);
    assert.ok(!byAgent['dev-e'], 'the crashed teammate has no disposition');
    assert.equal(m.nightLedger.bareNudged, 1, 'dev-e was nudged but never replied');
  });

  it('renders the continued/done dispositions and the bare-nudged count in §7', () => {
    const md = renderMorningReport(buildMorningReport(fixtureInputs({ ledgerLines: nudgeLedger() })));
    assert.match(md, /Self-audit nudges \(3\): considered stopping, then —/);
    assert.match(md, /dev-b: continued — picked up: harden the cache eviction test/);
    assert.match(md, /dev-d: done — parked: FEAT-52 rewrite; reason: blocked on an accepted D-ID/);
    assert.match(md, /1 nudged with no reply/);
  });

  it('omits the nudge block entirely on a night with no nudges', () => {
    const md = renderMorningReport(buildMorningReport(fixtureInputs()));
    assert.ok(!/Self-audit nudges/.test(md), 'no nudge line when nothing was nudged');
  });
});

// ---------------------------------------------------------------------------
// THE ACCEPTANCE TEST (decomposition §3.3 / §10.4): a FRESH process, with the
// orchestrator that drove the night dead and its in-memory state gone, produces
// the full seven-section report purely from the durable stores on disk.
// ---------------------------------------------------------------------------
describe('morning report: report-from-ledger (dead-orchestrator acceptance)', () => {
  function seedNightProject(dir) {
    const ctx = join(dir, 'artifacts', 'context');
    const delivery = join(dir, 'artifacts', 'delivery');
    mkdirSync(ctx, { recursive: true });
    mkdirSync(delivery, { recursive: true });
    writeFileSync(join(dir, 'swarm.yaml'), 'project:\n  name: night-demo\ndefaults:\n  model: opus\n');
    writeFileSync(join(ctx, 'task-ledger.md'), nightLedger().join('\n') + '\n');
    writeFileSync(join(ctx, 'ledger.md'), RECORD_LEDGER);
    writeFileSync(join(ctx, 'decision-log.md'), DECISION_LOG);
    writeFileSync(join(delivery, 'night-charter-2026-08-13.md'), CHARTER_TEXT);
    // The pointer (basename) is the schema's source of truth for "night open".
    writeFileSync(join(delivery, '.night-charter-current'), 'night-charter-2026-08-13.md\n');
  }

  it('morningReportMarkdown reads only the stores and mutates nothing', () => {
    const dir = join(tmpdir(), 'bmad-morning-io-' + Date.now());
    seedNightProject(dir);

    const snapshot = () => readdirSync(dir, { recursive: true })
      .filter((f) => typeof f === 'string')
      .map((f) => {
        const p = join(dir, f);
        let s; try { s = statSync(p); } catch { return `${f}:gone`; }
        return `${f}:${s.isFile() ? s.size + ':' + s.mtimeMs : 'dir'}`;
      })
      .sort().join('\n');

    const before = snapshot();
    const md = morningReportMarkdown(dir, { branches: BRANCHES, now: NOW });
    const after = snapshot();

    assert.equal(before, after, 'rendering the morning report must not create or modify any file');
    assert.match(md, /## 7 · Night ledger/);
    assert.match(md, /🚨.*git push/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('a FRESH `report --morning` process regenerates the full report from disk (orchestrator dead)', () => {
    const CLI = join(__dirname, '..', 'bin', 'bmad-swarm.js');
    const dir = join(tmpdir(), 'bmad-morning-fresh-' + Date.now());
    seedNightProject(dir);

    // Real git branches on disk are part of the durable store the fresh process reads.
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email t@t.co && git config user.name t', { cwd: dir });
    execSync('git add -A && git commit -q -m seed', { cwd: dir });
    for (const b of ['queue/BUG-141', 'queue/FEAT-52', 'initiative/regime-cache', 'initiative/auth-hardening']) {
      execSync(`git branch ${b}`, { cwd: dir });
    }

    // The orchestrator is GONE. This child `node` process never met it — it holds
    // no in-memory night state. Everything below must come from the stores + git.
    const stdout = execSync(`node "${CLI}" report --morning`, { cwd: dir, encoding: 'utf8', timeout: 20000 });
    assert.match(stdout, /Generated morning report/);

    const date = new Date().toISOString().slice(0, 10);
    const outPath = join(dir, 'artifacts', 'delivery', `morning-report-${date}.md`);
    assert.ok(existsSync(outPath), 'the dated morning-report file exists');
    const md = readFileSync(outPath, 'utf8');

    // All seven sections, generated from the ledger by a process that never met
    // the orchestrator that died at 5am.
    for (const h of [
      /## 1 · Answer these/, /## 2 · Pick one/, /## 3 · Merge these/,
      /## 4 · Initiative shelf/, /## 5 · Proposals/, /## 6 · Parked \/ tripwired/,
      /## 7 · Night ledger/,
    ]) assert.match(md, h);

    // Load-bearing content proving it came from the durable stores, not memory:
    assert.match(md, /R-010/);                          // parked decision (ledger.md)
    assert.match(md, /cache-strategy/);                 // fork pair (task-ledger)
    assert.match(md, /git merge.*queue\/BUG-141/);       // queue branch (git)
    assert.match(md, /initiative\/auth-hardening.*sensitive/); // sensitive flag (git)
    assert.match(md, /express/);                        // proposal (task-ledger)
    assert.match(md, /rejected → retry → rejected/);    // tripwire trail (task-ledger)
    assert.match(md, /🚨.*git push/);                    // denied 3am push red banner
    assert.match(md, /report-from-ledger/);

    rmSync(dir, { recursive: true, force: true });
  });
});
