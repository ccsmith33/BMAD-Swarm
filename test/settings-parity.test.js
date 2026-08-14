import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHooksConfig } from '../generators/hooks-generator.js';

// NF-6 (security-night-2026-08-13): the shipped .claude/settings.json is the file
// the live session actually runs on. getHooksConfig() is the single source of
// truth, but nothing caught the drift when the shipped mirror lagged behind a
// newly-registered hook — so the night floor was registered in the generator yet
// NEVER FIRED on this repo. This guard fails the suite whenever the shipped
// settings' hooks block diverges from getHooksConfig(): the integrator's `update`
// regenerates the mirror, and this test proves the floor is actually wired.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('shipped settings.json ⋈ getHooksConfig() (NF-6 parity guard)', () => {
  const shipped = JSON.parse(readFileSync(join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'));

  it('the shipped hooks block equals getHooksConfig() exactly', () => {
    assert.deepEqual(
      shipped.hooks,
      getHooksConfig(),
      'shipped .claude/settings.json hooks drifted from getHooksConfig() — regenerate the mirror (bmad-swarm update / generateSettings --force)',
    );
  });

  it('the night floor is actually wired into the shipped PreToolUse chain', () => {
    const cmds = (shipped.hooks?.PreToolUse || [])
      .flatMap((e) => e.hooks || [])
      .map((h) => h.command || '');
    assert.ok(
      cmds.some((c) => c.includes('night-floor.cjs')),
      'night-floor.cjs must be present in the shipped PreToolUse hooks (else the floor never fires)',
    );
  });
});
