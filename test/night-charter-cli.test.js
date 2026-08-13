import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Process-spawn tests for `record.cjs night-charter <open|status|close>` — the
// pinned, serialized charter writer for /sleep (phase5-decomposition §3.1 item 2,
// D-034/D-036). Exercises the real CLI exactly as a scaffolded project would.

const CLI = fileURLToPath(new URL('../bin/record.cjs', import.meta.url));

function mkproj({ sleepEnabled = true, initiative } = {}) {
  const proj = mkdtempSync(join(tmpdir(), 'night-charter-'));
  mkdirSync(join(proj, 'artifacts', 'delivery'), { recursive: true });
  mkdirSync(join(proj, '.claude', 'hooks'), { recursive: true });
  let yaml = 'project:\n  name: t\n';
  if (sleepEnabled || initiative) {
    yaml += 'sleep:\n';
    if (sleepEnabled) yaml += '  enabled: true\n';
    if (initiative) yaml += `  initiative: ${initiative}\n`;
  }
  writeFileSync(join(proj, 'swarm.yaml'), yaml);
  return proj;
}

function run(args, proj) {
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: proj },
  });
}

const isoIn = (ms) => new Date(Date.now() + ms).toISOString();
const deliveryDir = (proj) => join(proj, 'artifacts', 'delivery');
const pointer = (proj) => join(deliveryDir(proj), '.night-charter-current');
const wakeMarker = (proj) => join(proj, '.claude', 'hooks', '.human-wake');

describe('night-charter open', () => {
  it('refuses to open when sleep is not enabled (H5-5 off-by-default)', () => {
    const proj = mkproj({ sleepEnabled: false });
    try {
      const r = run(['night-charter', 'open', '--ends', isoIn(3600e3)], proj);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /sleep is not enabled/);
      assert.ok(!existsSync(pointer(proj)), 'no pointer when refused');
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('opens a charter, writes the pointer, prints the file path', () => {
    const proj = mkproj();
    try {
      const ends = isoIn(9 * 3600e3);
      const r = run(['night-charter', 'open', '--ends', ends, '--queue', 'BUG-1,FEAT-2'], proj);
      assert.equal(r.status, 0, r.stderr);
      const file = r.stdout.trim();
      assert.ok(existsSync(file), 'charter file exists');
      assert.ok(existsSync(pointer(proj)), 'pointer written');
      const body = readFileSync(file, 'utf8');
      assert.match(body, /night_charter:/);
      assert.match(body, /ends_epoch_ms: \d+/);
      assert.match(body, /status: open/);
      assert.match(body, /queue: \[BUG-1, FEAT-2\]/);
      assert.match(body, /same subscription quota/); // honest quota sentence (D-038)
      const ptr = readFileSync(pointer(proj), 'utf8').trim();
      assert.match(ptr, /^night-charter-\d{4}-\d\d-\d\d\.md$/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('clears a stale human-wake marker on open (a pre-forged marker cannot legitimize a close)', () => {
    const proj = mkproj();
    try {
      writeFileSync(wakeMarker(proj), 'stale');
      const r = run(['night-charter', 'open', '--ends', isoIn(3600e3)], proj);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(!existsSync(wakeMarker(proj)), 'open cleared the stale marker');
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('refuses an --ends in the past', () => {
    const proj = mkproj();
    try {
      const r = run(['night-charter', 'open', '--ends', isoIn(-3600e3)], proj);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /in the past/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('refuses an unparseable --ends', () => {
    const proj = mkproj();
    try {
      const r = run(['night-charter', 'open', '--ends', 'whenever'], proj);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /not a parseable timestamp/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('requires --ends', () => {
    const proj = mkproj();
    try {
      const r = run(['night-charter', 'open'], proj);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /requires --ends/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('validates --initiative against the closed set', () => {
    const proj = mkproj();
    try {
      const r = run(['night-charter', 'open', '--ends', isoIn(3600e3), '--initiative', 'yolo'], proj);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /--initiative must be one of/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('records extra_deny (append-only narrowing) in the frontmatter', () => {
    const proj = mkproj();
    try {
      const r = run(['night-charter', 'open', '--ends', isoIn(3600e3), '--extra-deny', 'no-dep-bumps,no-renames'], proj);
      assert.equal(r.status, 0, r.stderr);
      const body = readFileSync(r.stdout.trim(), 'utf8');
      assert.match(body, /extra_deny: \["no-dep-bumps", "no-renames"\]/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('honors swarm.yaml sleep.initiative as the default', () => {
    const proj = mkproj({ initiative: 'queue-only' });
    try {
      const r = run(['night-charter', 'open', '--ends', isoIn(3600e3)], proj);
      assert.equal(r.status, 0, r.stderr);
      assert.match(readFileSync(r.stdout.trim(), 'utf8'), /initiative: queue-only/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('refuses a --delivery-dir outside artifacts/ (confinement)', () => {
    const proj = mkproj();
    try {
      const r = run(['night-charter', 'open', '--ends', isoIn(3600e3), '--delivery-dir', join(proj, 'src')], proj);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /must be under .*artifacts/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });
});

describe('night-charter status', () => {
  it('reports dormant when no charter is open', () => {
    const proj = mkproj();
    try {
      const r = run(['night-charter', 'status'], proj);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /no active night charter/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('reports ARMED while the clock runs', () => {
    const proj = mkproj();
    try {
      run(['night-charter', 'open', '--ends', isoIn(3600e3)], proj);
      const r = run(['night-charter', 'status'], proj);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /floor: ARMED/);
      assert.match(r.stdout, /min remaining/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('FAILS CLOSED when the pointer dangles (charter deleted under it)', () => {
    const proj = mkproj();
    try {
      const file = run(['night-charter', 'open', '--ends', isoIn(3600e3)], proj).stdout.trim();
      rmSync(file, { force: true }); // corrupt: pointer present, charter gone
      const r = run(['night-charter', 'status'], proj);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /FAIL-CLOSED/);
      assert.match(r.stdout, /ARMED/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('reports the wake marker and a lifted floor after an early wake', () => {
    const proj = mkproj();
    try {
      run(['night-charter', 'open', '--ends', isoIn(3600e3)], proj);
      writeFileSync(wakeMarker(proj), 'human');
      const r = run(['night-charter', 'status'], proj);
      assert.match(r.stdout, /human-wake marker: PRESENT/);
      assert.match(r.stdout, /floor: lifted/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });
});

describe('night-charter close', () => {
  it('refuses an early close while the clock runs and no human is awake', () => {
    const proj = mkproj();
    try {
      run(['night-charter', 'open', '--ends', isoIn(3600e3)], proj);
      const r = run(['night-charter', 'close'], proj);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /still running/);
      assert.ok(existsSync(pointer(proj)), 'pointer survives a refused close (floor stays armed)');
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('closes early when the human-wake marker is present', () => {
    const proj = mkproj();
    try {
      const file = run(['night-charter', 'open', '--ends', isoIn(3600e3)], proj).stdout.trim();
      writeFileSync(wakeMarker(proj), 'human');
      const r = run(['night-charter', 'close'], proj);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(!existsSync(pointer(proj)), 'pointer removed (floor disarmed)');
      assert.match(readFileSync(file, 'utf8'), /status: closed/);
      assert.ok(!existsSync(wakeMarker(proj)), 'wake marker cleared on close');
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('closes after the wake clock has passed (grace path)', () => {
    const proj = mkproj();
    try {
      // ends 1s out; wait it out, then close should succeed with no marker.
      run(['night-charter', 'open', '--ends', isoIn(1000)], proj);
      const deadline = Date.now() + 1500;
      while (Date.now() < deadline) { /* spin briefly until ends passes */ }
      const r = run(['night-charter', 'close'], proj);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(!existsSync(pointer(proj)));
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });

  it('refuses to close when there is no open charter', () => {
    const proj = mkproj();
    try {
      const r = run(['night-charter', 'close'], proj);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /no active night charter/);
    } finally { rmSync(proj, { recursive: true, force: true }); }
  });
});
