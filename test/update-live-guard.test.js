import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ADR-017 Amendment 1 §3.5: `bmad-swarm update` must NOT hot-swap .claude/hooks/
// + settings.json under a running session. While .claude/hooks/.session-active
// exists, those two regen steps are skipped; --swap-live-hooks overrides;
// --force does NOT override (a different consent). This wedged the 2026-08-13
// merge (regenerating the live gate mid-session).

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'bin', 'bmad-swarm.js');

describe('update live-swap guard (ADR-017 Amendment 1)', () => {
  const tmpBase = join(tmpdir(), 'bmad-live-guard-' + Date.now());

  function run(cmd, cwd) {
    return execSync(`node "${CLI}" ${cmd}`, { cwd, encoding: 'utf8', timeout: 20000 });
  }

  function scaffold(name) {
    const dir = join(tmpBase, name);
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    return dir;
  }

  function marker(dir) {
    return join(dir, '.claude', 'hooks', '.session-active');
  }

  before(() => { mkdirSync(tmpBase, { recursive: true }); });
  after(() => { rmSync(tmpBase, { recursive: true, force: true }); });

  it('with NO marker, update regenerates hooks + settings normally (control)', () => {
    const dir = scaffold('control');
    assert.ok(!existsSync(marker(dir)), 'init must not leave a session marker');
    const out = run('update', dir);
    assert.match(out, /Regenerated \.claude\/hooks\//);
    assert.match(out, /Regenerated \.claude\/settings\.json/);
  });

  it('with marker present, update SKIPS hooks + settings regen', () => {
    const dir = scaffold('skips');
    writeFileSync(marker(dir), String(process.pid));
    const out = run('update', dir);
    assert.match(out, /Skipped \.claude\/hooks\/: a live session is active/);
    assert.match(out, /Skipped \.claude\/settings\.json: a live session is active/);
    // The message must name the marker path and the override flag.
    assert.match(out, /\.session-active/);
    assert.match(out, /--swap-live-hooks/);
    // Non-live steps still run.
    assert.match(out, /Regenerated \.claude\/agents\//);
  });

  it('--swap-live-hooks overrides the guard and regenerates', () => {
    const dir = scaffold('override');
    writeFileSync(marker(dir), String(process.pid));
    const out = run('update --swap-live-hooks', dir);
    assert.match(out, /Regenerated \.claude\/hooks\//);
    assert.match(out, /Regenerated \.claude\/settings\.json/);
    assert.ok(!/Skipped \.claude\/hooks\/: a live session is active/.test(out),
      '--swap-live-hooks must not print the skip message');
  });

  it('--force does NOT override the guard (a different consent)', () => {
    const dir = scaffold('force-no-override');
    writeFileSync(marker(dir), String(process.pid));
    const out = run('update --force', dir);
    assert.match(out, /Skipped \.claude\/hooks\/: a live session is active/,
      '--force must still skip live hooks — only --swap-live-hooks overrides');
    assert.match(out, /Skipped \.claude\/settings\.json: a live session is active/);
  });
});
