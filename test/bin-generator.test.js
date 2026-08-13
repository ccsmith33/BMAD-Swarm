import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateBin } from '../generators/bin-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// Recover the pre-marker source from a generated JS scaffold: drop the single
// `// bmad-generated:<hash>` line (which writeGeneratedJsFile inserts after any
// shebang), preserving the shebang. The remainder is the verbatim bin/ source.
function stripJsMarker(content) {
  return content.replace(/^(#![^\n]*\n)?\/\/ bmad-generated:[a-f0-9]+\n/, '$1');
}

// The pinned CLI must ship into .claude/bmad/bin/ (the path Fork A allow-lists),
// carry the generated hash marker, and run as a self-contained script in the
// scaffold (no dependency on this package's utils/ or node_modules).

describe('bin-generator', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'bin-gen-'));
  const projectDir = join(tmpDir, 'project');
  let paths;

  before(() => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'swarm.yaml'), 'project:\n  name: bin-test\n');
    const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
    paths = getProjectPaths(projectDir);
    generateBin(config, paths);
  });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('ships record.cjs into .claude/bmad/bin/ with a hash marker', () => {
    const shipped = join(paths.bmadBinDir, 'record.cjs');
    assert.ok(existsSync(shipped));
    const body = readFileSync(shipped, 'utf8');
    assert.match(body, /^#!/, 'keeps the shebang');
    assert.match(body, /\/\/ bmad-generated:[a-f0-9]+/, 'carries the generated hash marker');
  });

  it('the shipped script runs self-contained against a scaffold context dir', () => {
    const shipped = join(paths.bmadBinDir, 'record.cjs');
    const ctx = join(projectDir, 'artifacts', 'context');
    const r = spawnSync('node', [shipped, 'append', '--type', 'F', '--title', 't', '--fingerprint', 'fp', '--context-dir', ctx], {
      input: JSON.stringify({ provenance: { role: 'reviewer', project: 'p', date: '2026-08-13', occurrences: [] }, body: 'b' }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'F-1');
  });

  it('the generated scaffold exposes the reconcile subcommand (F-29)', () => {
    // SE-3 warm-boot invokes the PINNED scaffold bin, so it must be
    // reconcile-capable on a fresh init — not just the package bin/.
    const shipped = readFileSync(join(paths.bmadBinDir, 'record.cjs'), 'utf8');
    assert.match(shipped, /case 'reconcile'/, 'scaffold record.cjs must expose the reconcile subcommand');
    assert.match(shipped, /function cmdReconcile/, 'scaffold record.cjs must carry the reconcile handler');
  });
});

// F-29: the scaffold under .claude/bmad/bin/ is generated FROM bin/ (single
// source). The committed copy went stale once — it shipped without reconcile
// while bin/record.cjs had it — silently breaking SE-3 warm-boot on a fresh
// init. This guard fails whenever bin/ is changed without regenerating the
// scaffold, so the two can never diverge again.
describe('bin scaffold is in sync with bin/ source (F-29 single-source guard)', () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  for (const name of ['record.cjs', 'replay-check.cjs']) {
    it(`.claude/bmad/bin/${name} byte-matches bin/${name} (regenerate if this fails)`, () => {
      const source = readFileSync(join(repoRoot, 'bin', name), 'utf8');
      const scaffold = readFileSync(join(repoRoot, '.claude', 'bmad', 'bin', name), 'utf8');
      assert.equal(stripJsMarker(scaffold), source,
        `.claude/bmad/bin/${name} is stale — run the bin generator to re-sync it with bin/${name}`);
    });
  }
});
