import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { generateHooks } from '../generators/hooks-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// Byte-identity guard for the SE-1 prep split (phase2 design §3.4).
//
// The hook sources were extracted from inline template literals in
// hooks-generator.js into one file per hook under generators/hooks/<name>.cjs.src.
// This test proves the split is a PURE refactor: the bytes the generator emits
// into .claude/hooks/*.cjs are unchanged.
//
// It regenerates every hook into a temp project and diffs each file, byte for
// byte, against the repo-committed .claude/hooks/ copy — the same method the
// design names. This also keeps the committed hooks honest going forward: a
// downstream track that edits a .cjs.src must regenerate the live hooks (which
// it must anyway, to run on the change) or this test fails.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// orchestrator-write-gate.cjs is intentionally EXCLUDED here: Phase 2 SE-1 T1
// (ADR-017 / Fork A) rewrote its .cjs.src to narrow the orchestrator's write
// boundary, so the source no longer matches the committed .claude/hooks copy.
// The live hook is deliberately NOT regenerated mid-session (this session runs
// on it; swapping in the stricter gate mid-run could block the orchestrator);
// `bmad-swarm update` reconciles the committed copy at a safe point. The gate's
// behavior is covered by the process-spawn matrix in hooks.test.js instead.
const HOOK_NAMES = [
  'post-compact-reinject.cjs',
  'user-prompt-submit.cjs',
  'team-assembly-lint.cjs',
  // Auto-heal (F-29/F-30): a fresh hook (no live-session reconcile concern), so
  // its .cjs.src is guarded byte-for-byte from day one.
  'session-start-autoheal.cjs',
  // phase5 Stream S: the night floor is a fresh hook (no live-session reconcile
  // concern), so its .cjs.src is guarded byte-for-byte from day one.
  'night-floor.cjs',
  'workflow-integrity.cjs',
];

describe('Hooks byte-identity (prep split is a pure refactor)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'bmad-hooks-byteid-'));
  const projectDir = join(tmpDir, 'project');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'swarm.yaml'), 'project:\n  name: byteid\n');
  const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
  const paths = getProjectPaths(projectDir);
  generateHooks(config, paths);

  it('each .cjs.src source file exists', () => {
    for (const name of HOOK_NAMES) {
      const src = join(REPO_ROOT, 'generators', 'hooks', `${name}.src`);
      assert.ok(existsSync(src), `missing hook source ${name}.src`);
    }
  });

  for (const name of HOOK_NAMES) {
    it(`${name} is byte-for-byte identical to the committed .claude/hooks copy`, () => {
      const committedPath = join(REPO_ROOT, '.claude', 'hooks', name);
      assert.ok(existsSync(committedPath), `committed hook missing: ${committedPath}`);
      const generated = readFileSync(join(paths.hooksDir, name));
      const committed = readFileSync(committedPath);
      assert.equal(
        Buffer.compare(generated, committed),
        0,
        `${name} differs from committed .claude/hooks — regenerate the live hooks or reconcile the .cjs.src source`,
      );
    });
  }

  // teardown
  it('cleanup', () => { rmSync(tmpDir, { recursive: true, force: true }); });
});
