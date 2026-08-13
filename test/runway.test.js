import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  parseCharter,
  computeRunway,
  iterationCounts,
  readActiveCharter,
  formatDuration,
  DEFAULT_DAWN_RESERVE_MS,
  DEFAULT_TRIPWIRE_ITERATIONS,
} from '../utils/runway.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Task-ledger line in the exact format record.cjs task-event writes.
function line(ts, task, event, owner, subject) {
  let s = `${ts} session=s1 task=${task} event=${event}`;
  if (owner) s += ` owner=${owner}`;
  if (subject) s += ` subject=${JSON.stringify(subject)}`;
  return s;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('runway: parseCharter', () => {
  it('parses ends: from YAML frontmatter (--- delimited)', () => {
    const text = `---
schema: night-charter/1
ends: 2026-08-14T07:00:00-05:00
queue: [BUG-141, FEAT-52]
initiative: unrestrained
extra_deny: ["no dependency bumps"]
escalation: none
---

# Night charter 2026-08-13
`;
    const c = parseCharter(text);
    assert.ok(Number.isFinite(c.endsMs), 'ends parses to epoch ms');
    assert.deepEqual(c.queue, ['BUG-141', 'FEAT-52']);
    assert.equal(c.initiative, 'unrestrained');
    assert.deepEqual(c.extraDeny, ['no dependency bumps']);
    assert.equal(c.escalation, 'none');
  });

  it('parses a wrapped night_charter: block (the overnight-doc form)', () => {
    const text = `night_charter:
  ends: 2026-08-14T07:00:00-05:00
  queue: [BUG-141]
  initiative: queue-only
  extra_deny: []
  escalation: none
`;
    const c = parseCharter(text);
    assert.ok(Number.isFinite(c.endsMs));
    assert.equal(c.initiative, 'queue-only');
    assert.deepEqual(c.queue, ['BUG-141']);
  });

  it('tolerates a trailing timezone abbreviation (best-effort; schema is ISO)', () => {
    const c = parseCharter('---\nends: 2026-08-14T07:00 CT\n---\n');
    assert.ok(Number.isFinite(c.endsMs), 'best-effort strips " CT" and parses');
  });

  it('returns a null clock and safe defaults on a charter with no ends', () => {
    const c = parseCharter('---\nqueue: [X]\n---\n');
    assert.equal(c.ends, null);
    assert.ok(Number.isNaN(c.endsMs));
    assert.deepEqual(c.queue, ['X']);
    assert.equal(c.escalation, 'none');
  });

  it('never throws on garbage input', () => {
    assert.doesNotThrow(() => parseCharter('not: [valid: yaml: at all'));
    assert.doesNotThrow(() => parseCharter(''));
    assert.doesNotThrow(() => parseCharter(null));
  });
});

describe('runway: computeRunway (clock is the only hard resource — D-034)', () => {
  const ends = Date.parse('2026-08-14T07:00:00Z');

  it('computes remaining runway and reserves a dawn slice planned backward from ends', () => {
    const now = ends - 4 * HOUR;
    const r = computeRunway({ endsMs: ends, now });
    assert.equal(r.valid, true);
    assert.equal(r.active, true);
    assert.equal(r.expired, false);
    assert.equal(r.totalRemainingMs, 4 * HOUR);
    // 4h night basis, 5% = 12m < 30m floor -> 30m dawn slice.
    assert.equal(r.dawnSliceMs, DEFAULT_DAWN_RESERVE_MS);
    assert.equal(r.dawnStartsMs, ends - DEFAULT_DAWN_RESERVE_MS);
    assert.equal(r.workRemainingMs, 4 * HOUR - DEFAULT_DAWN_RESERVE_MS);
    assert.equal(r.inDawnSlice, false);
  });

  it('uses 5% of the night when that exceeds the 30-minute floor', () => {
    const start = ends - 12 * HOUR; // 12h night, 5% = 36m > 30m
    const now = ends - 6 * HOUR;
    const r = computeRunway({ endsMs: ends, now, startMs: start });
    assert.equal(r.dawnSliceMs, Math.floor(0.05 * 12 * HOUR));
    assert.ok(r.dawnSliceMs > DEFAULT_DAWN_RESERVE_MS);
  });

  it('flags inDawnSlice once now crosses into the reserved slice', () => {
    const now = ends - 10 * MIN; // inside the final 30m
    const r = computeRunway({ endsMs: ends, now });
    assert.equal(r.inDawnSlice, true);
    assert.equal(r.workRemainingMs, 0);
    assert.equal(r.expired, false);
  });

  it('reports expired once now is at or past ends', () => {
    const r = computeRunway({ endsMs: ends, now: ends + MIN });
    assert.equal(r.expired, true);
    assert.equal(r.active, false);
    assert.equal(r.totalRemainingMs, 0);
  });

  it('is invalid (never throws) when ends is unparseable', () => {
    const r = computeRunway({ endsMs: NaN, now: ends });
    assert.equal(r.valid, false);
    assert.equal(r.active, false);
  });
});

describe('runway: iterationCounts (tripwire ADVISORY data, not a cap — D-034)', () => {
  it('counts iterations per task and flags a no-progress loop', () => {
    const ledger = [
      // task 1: healthy, ends on a progress event -> not tripwired
      line('2026-08-14T01:00:00Z', '1', 'in_progress', 'dev-a', 'story-1'),
      line('2026-08-14T01:10:00Z', '1', 'evidence', 'dev-a', 'story-1'),
      line('2026-08-14T01:20:00Z', '1', 'completed', 'dev-a', 'story-1'),
      // task 2: rejection-retry death loop -> tripwired (3 churn events, no progress)
      line('2026-08-14T02:00:00Z', '2', 'rejected', 'dev-b', 'story-2'),
      line('2026-08-14T02:10:00Z', '2', 'retry', 'dev-b', 'story-2'),
      line('2026-08-14T02:20:00Z', '2', 'rejected', 'dev-b', 'story-2'),
    ];
    const items = iterationCounts(ledger);
    const byTask = Object.fromEntries(items.map((i) => [i.task, i]));
    assert.equal(byTask['1'].iterations, 3);
    assert.equal(byTask['1'].tripwired, false, 'a task making progress is not tripwired');
    assert.equal(byTask['2'].iterations, 3);
    assert.equal(byTask['2'].tripwired, true, 'a no-progress loop past N iterations is flagged');
    assert.deepEqual(byTask['2'].trail, ['rejected', 'retry', 'rejected'], 'trail is verbatim event sequence');
  });

  it('does not flag a short loop below the iteration threshold', () => {
    const ledger = [
      line('2026-08-14T02:00:00Z', '9', 'rejected', 'dev-b', 'story-9'),
      line('2026-08-14T02:10:00Z', '9', 'rejected', 'dev-b', 'story-9'),
    ];
    const items = iterationCounts(ledger);
    assert.equal(items[0].iterations, 2);
    assert.equal(items[0].tripwired, false, `below the ${DEFAULT_TRIPWIRE_ITERATIONS}-iteration default`);
  });

  it('respects a custom tripwire threshold', () => {
    const ledger = [
      line('2026-08-14T02:00:00Z', '9', 'rejected', 'dev-b', 'story-9'),
      line('2026-08-14T02:10:00Z', '9', 'failed', 'dev-b', 'story-9'),
    ];
    const items = iterationCounts(ledger, { tripwireIterations: 2 });
    assert.equal(items[0].tripwired, true);
  });
});

describe('runway: formatDuration', () => {
  it('renders human-readable durations', () => {
    assert.equal(formatDuration(0), '0m');
    assert.equal(formatDuration(30 * MIN), '30m');
    assert.equal(formatDuration(90 * MIN), '1h 30m');
    assert.equal(formatDuration(2 * HOUR), '2h 0m');
  });
});

describe('runway: readActiveCharter (read-only, resolves the current charter)', () => {
  it('reads the newest dated charter under artifacts/delivery/', () => {
    const dir = join(tmpdir(), 'bmad-runway-' + Date.now());
    const delivery = join(dir, 'artifacts', 'delivery');
    mkdirSync(delivery, { recursive: true });
    writeFileSync(join(delivery, 'night-charter-2026-08-12.md'), '---\nends: 2026-08-12T07:00:00Z\n---\n');
    writeFileSync(join(delivery, 'night-charter-2026-08-14.md'), '---\nends: 2026-08-14T07:00:00Z\n---\n');
    const c = readActiveCharter(dir);
    assert.ok(c);
    assert.equal(c.endsMs, Date.parse('2026-08-14T07:00:00Z'), 'newest dated charter wins');
    rmSync(dir, { recursive: true, force: true });
  });

  it('follows a night-charter-current pointer when present', () => {
    const dir = join(tmpdir(), 'bmad-runway-ptr-' + Date.now());
    const delivery = join(dir, 'artifacts', 'delivery');
    mkdirSync(delivery, { recursive: true });
    writeFileSync(join(delivery, 'night-charter-2026-08-14.md'), '---\nends: 2026-08-14T07:00:00Z\ninitiative: unrestrained\n---\n');
    writeFileSync(join(delivery, 'night-charter-current'), 'night-charter-2026-08-14.md\n');
    const c = readActiveCharter(dir);
    assert.ok(c);
    assert.equal(c.initiative, 'unrestrained');
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when no charter exists (a normal day)', () => {
    const dir = join(tmpdir(), 'bmad-runway-none-' + Date.now());
    mkdirSync(join(dir, 'artifacts', 'delivery'), { recursive: true });
    assert.equal(readActiveCharter(dir), null);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('runway: read-only by construction', () => {
  it('the module source imports no fs write API', () => {
    const src = readFileSync(join(__dirname, '..', 'utils', 'runway.js'), 'utf8');
    for (const forbidden of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'createWriteStream', 'writeSync', 'rmdirSync']) {
      assert.ok(!src.includes(forbidden), `runway.js must not reference ${forbidden} (read-only)`);
    }
  });
});
