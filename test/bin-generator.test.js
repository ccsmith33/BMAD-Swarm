import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateBin } from '../generators/bin-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

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
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'F-1');
  });
});
