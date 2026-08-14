import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateHooks } from '../generators/hooks-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// The human-authenticated early-wake marker (phase5 Stream S). UserPromptSubmit
// fires only on a real human prompt (an agent cannot), so a prompt during an open
// night sets .human-wake — the un-forgeable "the human is awake" signal.

describe('user-prompt-submit human-wake marker', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'wake-marker-'));
  const projectDir = join(tmpDir, 'project');
  let hooksDir;
  const deliveryDir = join(projectDir, 'artifacts', 'delivery');
  const pointer = join(deliveryDir, '.night-charter-current');
  const charterFile = join(deliveryDir, 'night-charter-x.md');
  const wakeMarker = join(projectDir, '.claude', 'hooks', '.human-wake');
  const NONCE = 'abcdef0123456789abcdef0123456789';

  before(() => {
    mkdirSync(join(projectDir, 'artifacts', 'delivery'), { recursive: true });
    mkdirSync(join(projectDir, '.claude', 'hooks'), { recursive: true });
    writeFileSync(join(projectDir, 'swarm.yaml'), 'project:\n  name: wake\n');
    const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
    const paths = getProjectPaths(projectDir);
    generateHooks(config, paths, { force: true });
    hooksDir = paths.hooksDir;
  });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function prompt() {
    return spawnSync('node', [join(hooksDir, 'user-prompt-submit.cjs')], {
      input: JSON.stringify({ cwd: projectDir, prompt: 'hello' }), encoding: 'utf8', cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
  }

  it('does NOT set the wake marker when no charter is open', () => {
    rmSync(pointer, { force: true }); rmSync(wakeMarker, { force: true });
    prompt();
    assert.ok(!existsSync(wakeMarker), 'no marker without an open night');
  });

  it('sets the wake marker carrying the charter nonce when a charter is open', () => {
    writeFileSync(charterFile, `---\nnight_charter:\n  wake_nonce: ${NONCE}\n---\n`);
    writeFileSync(pointer, 'night-charter-x.md\n');
    rmSync(wakeMarker, { force: true });
    prompt();
    assert.ok(existsSync(wakeMarker), 'a human prompt during a night sets .human-wake');
    assert.match(readFileSync(wakeMarker, 'utf8'), new RegExp(NONCE), 'marker carries the charter nonce (unforgeable lift)');
  });

  it('still emits the identity reminder on the first prompt (behavior preserved)', () => {
    rmSync(join(hooksDir, '.session-active'), { force: true });
    const r = prompt();
    assert.match(r.stdout, /identity-orchestrator/);
  });
});
