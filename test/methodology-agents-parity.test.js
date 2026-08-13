import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateAgents } from '../generators/agent-generator.js';
import { generateMethodology } from '../generators/methodology-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { METHODOLOGY_SHIP_LIST } from '../utils/scaffold-paths.js';

// F-29 generalized. bin/ had a single-source parity guard; the shipped
// .claude/agents/ and .claude/bmad/methodology/ mirrors did NOT — which is why
// Streams A and V shipped RED (advisory.md + claims-table.md, plus the agent
// identity/schema edits, lived in source but were never regenerated into the
// committed scaffold, so `doctor` was red and the advisory/claims layers were
// inert on a fresh install).
//
// Rather than re-derive the marker + scaffold-path rewrites the generators
// apply, this guard regenerates the mirrors from the SAME source + config that
// `bmad-swarm update` uses, into a throwaway project dir, and asserts every
// committed shipped file byte-matches that fresh output (and that the file sets
// match in BOTH directions). Edit a source agent/methodology file without
// regenerating, add a ship-list entry without shipping it, or leave a stale
// committed mirror behind, and this suite goes red.

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

describe('shipped mirrors are in sync with source (methodology + agents parity guard)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'mirror-parity-'));
  const projectDir = join(tmpDir, 'project');
  let paths;

  before(() => {
    mkdirSync(projectDir, { recursive: true });
    // Regenerate with the repo's OWN swarm.yaml so Layer-2 overrides (e.g.
    // defaults.model) match exactly what `update` committed into .claude/.
    const config = loadSwarmConfig(join(repoRoot, 'swarm.yaml'));
    paths = getProjectPaths(projectDir);
    generateAgents(config, paths);
    generateMethodology(config, paths);
  });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  describe('.claude/agents/*.md', () => {
    it('every committed agent mirror byte-matches a fresh regeneration', () => {
      const committedDir = join(repoRoot, '.claude', 'agents');
      const freshDir = paths.agentsDir;

      const committed = readdirSync(committedDir).filter((f) => f.endsWith('.md')).sort();
      const fresh = readdirSync(freshDir).filter((f) => f.endsWith('.md')).sort();
      assert.deepEqual(committed, fresh,
        'the set of shipped .claude/agents/*.md differs from a fresh generation — run `bmad-swarm update`');

      for (const name of committed) {
        const committedBody = readFileSync(join(committedDir, name), 'utf8');
        const freshBody = readFileSync(join(freshDir, name), 'utf8');
        assert.equal(committedBody, freshBody,
          `.claude/agents/${name} is stale vs its source in agents/${name} — run \`bmad-swarm update\``);
      }
    });
  });

  describe('.claude/bmad/methodology/**', () => {
    it('every ship-list methodology file is committed and byte-matches a fresh regeneration', () => {
      const committedDir = join(repoRoot, '.claude', 'bmad', 'methodology');
      const freshDir = paths.bmadMethodologyDir;

      for (const relPath of METHODOLOGY_SHIP_LIST) {
        const committedPath = join(committedDir, relPath);
        const freshPath = join(freshDir, relPath);
        assert.ok(existsSync(committedPath),
          `ship-list file .claude/bmad/methodology/${relPath} is missing from the committed scaffold — run \`bmad-swarm update\``);
        assert.ok(existsSync(freshPath),
          `ship-list file ${relPath} was not produced by the generator — source missing from methodology/`);
        const committedBody = readFileSync(committedPath, 'utf8');
        const freshBody = readFileSync(freshPath, 'utf8');
        assert.equal(committedBody, freshBody,
          `.claude/bmad/methodology/${relPath} is stale vs methodology/${relPath} — run \`bmad-swarm update\``);
      }
    });
  });
});
