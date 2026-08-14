import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseCharter } from '../utils/runway.js';
import { renderNightPanel } from '../cli/status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENDS = '2026-08-14T07:00:00Z';
const ENDS_MS = Date.parse(ENDS);
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function charterText(overrides = '') {
  return `---
night_charter:
  schema: night-charter/1
  date: 2026-08-13
  opened_at: 2026-08-13T22:00:00Z
  ends: ${ENDS}
  ends_epoch_ms: ${ENDS_MS}
  grace_ms: 7200000
  queue: [BUG-141, FEAT-52]
  initiative: unrestrained
  extra_deny: []
  escalation: none
  status: open
${overrides}---

# Night charter 2026-08-13
`;
}

describe('status night panel: renderNightPanel (read-only, §3.3 item 5)', () => {
  it('returns empty when no charter is open (status unchanged on a normal day)', () => {
    assert.equal(renderNightPanel(null), '');
  });

  it('renders scope, runway + dawn slice, and floor status while the clock runs', () => {
    const charter = parseCharter(charterText());
    const panel = renderNightPanel(charter, { now: ENDS_MS - 4 * HOUR });
    assert.match(panel, /Night charter: ACTIVE/);
    assert.match(panel, /Initiative: unrestrained/);
    assert.match(panel, /Queue: BUG-141, FEAT-52/);
    assert.match(panel, /Runway: 4h 0m remaining/);
    assert.match(panel, /dawn slice 30m/);
    assert.match(panel, /Floor: active — destructive actions denied/);
  });

  it('marks the dawn slice once the clock crosses into it', () => {
    const charter = parseCharter(charterText());
    const panel = renderNightPanel(charter, { now: ENDS_MS - 10 * MIN });
    assert.match(panel, /Floor: active \(dawn slice/);
  });

  it('after expiry, the floor persists through the grace window (H5-2d)', () => {
    const charter = parseCharter(charterText());
    const panel = renderNightPanel(charter, { now: ENDS_MS + 30 * MIN }); // within 2h grace
    assert.match(panel, /Runway: expired/);
    assert.match(panel, /Floor: active \(grace\)/);
    assert.match(panel, /persists 1h 30m until a human wake/);
  });

  it('once the clock + grace elapse, the floor is lifted', () => {
    const charter = parseCharter(charterText());
    const panel = renderNightPanel(charter, { now: ENDS_MS + 3 * HOUR }); // past 2h grace
    assert.match(panel, /Floor: lifted/);
    assert.match(panel, /human-gated by posture/);
  });

  it('shows FAIL-CLOSED when the charter clock is unreadable', () => {
    const charter = parseCharter('---\nnight_charter:\n  queue: [X]\n---\n'); // no ends
    const panel = renderNightPanel(charter, { now: ENDS_MS });
    assert.match(panel, /Floor: FAIL-CLOSED/);
  });
});

describe('status night panel: live `bmad-swarm status`', () => {
  const CLI = join(__dirname, '..', 'bin', 'bmad-swarm.js');

  function seedProject(dir, withCharter) {
    const ctx = join(dir, 'artifacts', 'context');
    mkdirSync(ctx, { recursive: true });
    writeFileSync(join(dir, 'swarm.yaml'), 'project:\n  name: night-status\n  type: web-app\ndefaults:\n  model: opus\n');
    writeFileSync(join(ctx, 'project-brain.md'), '---\nschema: project-brain/1\nupdated: 2026-08-13\ncheckpoint: 3\nphase: implementation\ngates: {}\n---\n\n## What this is\n');
    if (withCharter) {
      const delivery = join(dir, 'artifacts', 'delivery');
      mkdirSync(delivery, { recursive: true });
      // ends far in the future so the panel renders "active" regardless of wall clock.
      const future = Date.now() + 6 * HOUR;
      writeFileSync(join(delivery, 'night-charter-2026-08-13.md'),
        `---\nnight_charter:\n  ends: 2999-01-01T07:00:00Z\n  ends_epoch_ms: ${future}\n  grace_ms: 7200000\n  queue: [BUG-141]\n  initiative: unrestrained\n  status: open\n---\n\n# Night charter\n`);
      writeFileSync(join(delivery, '.night-charter-current'), 'night-charter-2026-08-13.md\n');
    }
  }

  it('shows the NIGHT PANEL when a charter is active', () => {
    const dir = join(tmpdir(), 'bmad-status-night-' + Date.now());
    seedProject(dir, true);
    const stdout = execSync(`node "${CLI}" status`, { cwd: dir, encoding: 'utf8', timeout: 15000 });
    assert.match(stdout, /Night charter: ACTIVE/);
    assert.match(stdout, /Runway: .* remaining/);
    assert.match(stdout, /Floor: active/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('shows NO night panel when no charter is open', () => {
    const dir = join(tmpdir(), 'bmad-status-day-' + Date.now());
    seedProject(dir, false);
    const stdout = execSync(`node "${CLI}" status`, { cwd: dir, encoding: 'utf8', timeout: 15000 });
    assert.doesNotMatch(stdout, /Night charter/);
    assert.match(stdout, /Project: night-status/); // normal status still renders
    rmSync(dir, { recursive: true, force: true });
  });
});
