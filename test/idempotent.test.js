import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { generateAgents } from '../generators/agent-generator.js';
import { generateClaudeMd } from '../generators/claude-md-generator.js';
import { generateHooks } from '../generators/hooks-generator.js';

describe('Idempotency', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-idem-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('running update twice produces the same output', () => {
    const projectDir = join(tmpDir, 'idem-test');
    mkdirSync(projectDir, { recursive: true });

    const configPath = join(projectDir, 'swarm.yaml');
    writeFileSync(configPath, `
project:
  name: idem-test
  type: api
stack:
  language: Python
  framework: FastAPI
methodology:
  autonomy: auto
`);

    const config = loadSwarmConfig(configPath);
    const paths = getProjectPaths(projectDir);

    // First run
    generateAgents(config, paths);
    generateClaudeMd(config, paths);
    generateHooks(config, paths);

    // Capture first run output
    const firstRunAgents = {};
    const agentFiles = ['orchestrator', 'ideator', 'researcher', 'strategist', 'architect', 'story-engineer', 'developer', 'reviewer', 'qa'];
    for (const name of agentFiles) {
      const filePath = join(paths.agentsDir, `${name}.md`);
      if (existsSync(filePath)) {
        firstRunAgents[name] = readFileSync(filePath, 'utf8');
      }
    }
    const firstClaudeMd = readFileSync(paths.claudeMd, 'utf8');

    // Second run
    generateAgents(config, paths);
    generateClaudeMd(config, paths);
    generateHooks(config, paths);

    // Compare
    for (const name of agentFiles) {
      const filePath = join(paths.agentsDir, `${name}.md`);
      if (existsSync(filePath)) {
        const secondContent = readFileSync(filePath, 'utf8');
        assert.equal(secondContent, firstRunAgents[name], `Agent ${name} should be identical on second run`);
      }
    }
    const secondClaudeMd = readFileSync(paths.claudeMd, 'utf8');
    assert.equal(secondClaudeMd, firstClaudeMd, 'CLAUDE.md should be identical on second run');
  });

  it('ejected files survive update', () => {
    const projectDir = join(tmpDir, 'eject-survive');
    mkdirSync(projectDir, { recursive: true });

    const configPath = join(projectDir, 'swarm.yaml');
    writeFileSync(configPath, 'project:\n  name: test\n');

    const config = loadSwarmConfig(configPath);
    const paths = getProjectPaths(projectDir);

    // First run
    generateAgents(config, paths);

    // Eject orchestrator
    const overridePath = join(paths.overridesAgentsDir, 'orchestrator.md');
    mkdirSync(paths.overridesAgentsDir, { recursive: true });
    writeFileSync(overridePath, '# My Custom Orchestrator\n\nCustom content here.');

    // Run update again
    const result = generateAgents(config, paths);
    assert.ok(result.skipped.includes('orchestrator'), 'Orchestrator should be skipped');

    // Verify ejected content is preserved
    const content = readFileSync(join(paths.agentsDir, 'orchestrator.md'), 'utf8');
    assert.ok(content.includes('My Custom Orchestrator'), 'Should use ejected content');

    // Verify override file is untouched
    const overrideContent = readFileSync(overridePath, 'utf8');
    assert.ok(overrideContent.includes('My Custom Orchestrator'), 'Override file should be preserved');
  });
});
