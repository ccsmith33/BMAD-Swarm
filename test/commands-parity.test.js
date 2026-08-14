import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateCommands } from '../generators/commands-generator.js';
import { generateAgents } from '../generators/agent-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// `.claude/agents/`, `.claude/bmad/methodology/`, and `.claude/bmad/bin/` each
// have a single-source byte-identity guard (see methodology-agents-parity.test.js
// and the bin-generator.test.js scaffold-sync suite) — but `.claude/commands/`
// had NO such guard. That gap let the identity-* command mirrors silently drift
// from source (agents/*.md) during the L-5 parallelism promotion: nothing failed
// CI, because nothing regenerated-and-diffed the committed commands against the
// generator's output.
//
// This guard closes it: regenerate .claude/commands/ from the SAME source +
// config `bmad-swarm update` uses, into a throwaway project dir, and assert
// every committed file byte-matches the fresh output — in both directions (no
// stale extra file, no missing file). Edit agents/*.md or
// generators/commands-generator.js without regenerating, and this suite goes
// red.

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

describe('shipped .claude/commands/ mirror is in sync with source (commands parity guard)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'commands-parity-'));
  const projectDir = join(tmpDir, 'project');
  let paths;

  before(() => {
    mkdirSync(projectDir, { recursive: true });
    // Regenerate with the repo's OWN swarm.yaml so Layer-2 overrides (e.g.
    // defaults.model) match exactly what `update` committed into .claude/.
    const config = loadSwarmConfig(join(repoRoot, 'swarm.yaml'));
    paths = getProjectPaths(projectDir);
    // identity-{role}.md bodies are sourced from the freshly generated
    // .claude/agents/{role}.md (see commands-generator.js) — generate agents
    // first so generateCommands has a source to read from.
    generateAgents(config, paths);
    generateCommands(config, paths);
  });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('the set of shipped .claude/commands/*.md matches a fresh generation', () => {
    const committedDir = join(repoRoot, '.claude', 'commands');
    const freshDir = join(paths.claudeDir, 'commands');

    const committed = readdirSync(committedDir).filter((f) => f.endsWith('.md')).sort();
    const fresh = readdirSync(freshDir).filter((f) => f.endsWith('.md')).sort();
    assert.deepEqual(committed, fresh,
      'the set of shipped .claude/commands/*.md differs from a fresh generation — run `bmad-swarm update`');
  });

  describe('every committed command mirror byte-matches a fresh regeneration', () => {
    const committedDir = join(repoRoot, '.claude', 'commands');
    const names = readdirSync(committedDir).filter((f) => f.endsWith('.md')).sort();

    for (const name of names) {
      it(`.claude/commands/${name} is in sync with the generator`, () => {
        const freshDir = join(paths.claudeDir, 'commands');
        const committedBody = readFileSync(join(committedDir, name), 'utf8');
        const freshBody = readFileSync(join(freshDir, name), 'utf8');
        assert.equal(committedBody, freshBody,
          `.claude/commands/${name} is stale vs a fresh generateCommands() run — run \`bmad-swarm update\``);
      });
    }
  });
});
