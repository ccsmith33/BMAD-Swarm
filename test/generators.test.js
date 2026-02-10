import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { generateAgents, ejectAgent, unejectAgent } from '../generators/agent-generator.js';
import { generateClaudeMd } from '../generators/claude-md-generator.js';
import { generateHooks } from '../generators/hooks-generator.js';

describe('Generators', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-gen-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Agent Generator', () => {
    it('generates agent files from package templates', () => {
      const projectDir = join(tmpDir, 'agent-test-1');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: test-project
  type: web-app
stack:
  language: TypeScript
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      const result = generateAgents(config, paths);

      assert.ok(result.generated.length > 0, 'Should generate at least some agents');
      assert.ok(result.skipped.length === 0, 'No agents should be skipped');

      // Check files were created
      for (const agentName of result.generated) {
        const filePath = join(paths.agentsDir, `${agentName}.md`);
        assert.ok(existsSync(filePath), `Agent file should exist: ${agentName}.md`);

        const content = readFileSync(filePath, 'utf8');
        assert.ok(content.includes('Project Info'), 'Should include project context');
        assert.ok(content.includes('test-project'), 'Should include project name');
      }
    });

    it('generates ideator.md agent file', () => {
      const projectDir = join(tmpDir, 'agent-test-ideator');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: ideator-test
  type: web-app
stack:
  language: JavaScript
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      const result = generateAgents(config, paths);

      assert.ok(result.generated.includes('ideator'), 'ideator should be generated');

      const filePath = join(paths.agentsDir, 'ideator.md');
      assert.ok(existsSync(filePath), 'ideator.md should exist');

      const content = readFileSync(filePath, 'utf8');
      assert.ok(content.includes('Ideator'), 'Should contain Ideator title');
      assert.ok(content.includes('Project Info'), 'Should include project context');
    });

    it('can disable ideator agent', () => {
      const projectDir = join(tmpDir, 'agent-test-ideator-disabled');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: test
agents:
  ideator:
    enabled: false
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      const result = generateAgents(config, paths);

      assert.ok(!result.generated.includes('ideator'), 'ideator should not be generated when disabled');
    });

    it('respects disabled agents', () => {
      const projectDir = join(tmpDir, 'agent-test-2');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: test
agents:
  qa:
    enabled: false
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      const result = generateAgents(config, paths);

      assert.ok(!result.generated.includes('qa'), 'QA should not be generated');
    });

    it('appends extra_context from config', () => {
      const projectDir = join(tmpDir, 'agent-test-3');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: test
agents:
  developer:
    extra_context: "Always use semicolons in JavaScript."
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);

      const devContent = readFileSync(join(paths.agentsDir, 'developer.md'), 'utf8');
      assert.ok(devContent.includes('Always use semicolons'), 'Should include extra context');
    });

    it('uses ejected override when present', () => {
      const projectDir = join(tmpDir, 'agent-test-4');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const paths = getProjectPaths(projectDir);

      // Create ejected override
      mkdirSync(paths.overridesAgentsDir, { recursive: true });
      writeFileSync(join(paths.overridesAgentsDir, 'orchestrator.md'), '# Custom Orchestrator\nMy custom content');

      const config = loadSwarmConfig(configPath);
      const result = generateAgents(config, paths);

      assert.ok(result.skipped.includes('orchestrator'), 'Orchestrator should be skipped (ejected)');

      const content = readFileSync(join(paths.agentsDir, 'orchestrator.md'), 'utf8');
      assert.ok(content.includes('Custom Orchestrator'), 'Should use ejected content');
    });
  });

  describe('Eject/Uneject', () => {
    it('ejects an agent to overrides directory', () => {
      const projectDir = join(tmpDir, 'eject-test-1');
      mkdirSync(projectDir, { recursive: true });
      const paths = getProjectPaths(projectDir);

      const ejectedPath = ejectAgent('developer', paths);
      assert.ok(existsSync(ejectedPath), 'Ejected file should exist');

      const content = readFileSync(ejectedPath, 'utf8');
      assert.ok(content.includes('EJECTED'), 'Should have ejected header');
    });

    it('throws when ejecting unknown agent', () => {
      const projectDir = join(tmpDir, 'eject-test-2');
      mkdirSync(projectDir, { recursive: true });
      const paths = getProjectPaths(projectDir);

      assert.throws(() => {
        ejectAgent('unknown-agent', paths);
      }, /Unknown agent/);
    });

    it('throws when agent already ejected', () => {
      const projectDir = join(tmpDir, 'eject-test-3');
      mkdirSync(projectDir, { recursive: true });
      const paths = getProjectPaths(projectDir);

      ejectAgent('researcher', paths);
      assert.throws(() => {
        ejectAgent('researcher', paths);
      }, /already ejected/);
    });

    it('unejects an agent', () => {
      const projectDir = join(tmpDir, 'uneject-test-1');
      mkdirSync(projectDir, { recursive: true });
      const paths = getProjectPaths(projectDir);

      const ejectedPath = ejectAgent('architect', paths);
      assert.ok(existsSync(ejectedPath));

      unejectAgent('architect', paths);
      assert.ok(!existsSync(ejectedPath), 'Ejected file should be removed');
    });
  });

  describe('CLAUDE.md Generator', () => {
    it('generates CLAUDE.md with project info', () => {
      const projectDir = join(tmpDir, 'claudemd-test-1');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: TestApp
  description: A test application
  type: web-app
stack:
  language: TypeScript
  framework: React
methodology:
  autonomy: guided
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateClaudeMd(config, paths);

      assert.ok(existsSync(paths.claudeMd), 'CLAUDE.md should exist');
      const content = readFileSync(paths.claudeMd, 'utf8');
      assert.ok(content.includes('TestApp'), 'Should include project name');
      assert.ok(content.includes('guided'), 'Should include autonomy level');
    });

    it('renders require_human_approval as comma-separated list', () => {
      const projectDir = join(tmpDir, 'claudemd-approval');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: approval-test
  type: web-app
stack:
  language: JavaScript
methodology:
  quality:
    require_human_approval:
      - prd
      - architecture
      - design
`);
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateClaudeMd(config, paths);
      const content = readFileSync(paths.claudeMd, 'utf8');
      assert.ok(content.includes('prd, architecture, design'), 'Should render approval list as comma-separated values');
      assert.ok(!content.includes('require_human_approval_list'), 'Should not contain raw placeholder');
    });

    it('renders autonomy description for auto mode', () => {
      const projectDir = join(tmpDir, 'claudemd-auto');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: auto-test
stack:
  language: JavaScript
methodology:
  autonomy: auto
`);
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateClaudeMd(config, paths);
      const content = readFileSync(paths.claudeMd, 'utf8');
      assert.ok(content.includes('fully autonomously'), 'Should contain auto mode description');
    });

    it('renders autonomy description for guided mode', () => {
      const projectDir = join(tmpDir, 'claudemd-guided');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: guided-test
stack:
  language: JavaScript
methodology:
  autonomy: guided
`);
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateClaudeMd(config, paths);
      const content = readFileSync(paths.claudeMd, 'utf8');
      assert.ok(content.includes('pauses at phase boundaries for human review'), 'Should contain guided mode description');
    });

    it('renders autonomy description for collaborative mode', () => {
      const projectDir = join(tmpDir, 'claudemd-collab');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: collab-test
stack:
  language: JavaScript
methodology:
  autonomy: collaborative
`);
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateClaudeMd(config, paths);
      const content = readFileSync(paths.claudeMd, 'utf8');
      assert.ok(content.includes('pauses at phase boundaries AND within phases'), 'Should contain collaborative mode description');
    });

    it('includes all 9 agents in agent table', () => {
      const projectDir = join(tmpDir, 'claudemd-agents');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: agent-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateClaudeMd(config, paths);
      const content = readFileSync(paths.claudeMd, 'utf8');
      const agents = ['orchestrator', 'ideator', 'researcher', 'strategist', 'architect', 'story-engineer', 'developer', 'reviewer', 'qa'];
      for (const agent of agents) {
        assert.ok(content.includes(`**${agent}**`), `Should include ${agent} in agent table`);
      }
    });

    it('renders conditional stack sections', () => {
      const projectDir = join(tmpDir, 'claudemd-stack');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: stack-test
stack:
  language: TypeScript
  framework: Next.js
  database: PostgreSQL
  testing: Jest
`);
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateClaudeMd(config, paths);
      const content = readFileSync(paths.claudeMd, 'utf8');
      assert.ok(content.includes('Next.js'), 'Should include framework');
      assert.ok(content.includes('PostgreSQL'), 'Should include database');
      assert.ok(content.includes('Jest'), 'Should include testing');
    });

    it('omits conditional sections when stack values missing', () => {
      const projectDir = join(tmpDir, 'claudemd-minimal');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: minimal-test
stack:
  language: JavaScript
`);
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateClaudeMd(config, paths);
      const content = readFileSync(paths.claudeMd, 'utf8');
      assert.ok(!content.includes('Framework'), 'Should not include Framework section');
      assert.ok(!content.includes('Database'), 'Should not include Database section');
      assert.ok(!content.includes('Testing'), 'Should not include Testing section');
    });
  });

  describe('Hooks Generator', () => {
    it('generates hook scripts', () => {
      const projectDir = join(tmpDir, 'hooks-test-1');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      const hookPaths = generateHooks(config, paths);

      assert.equal(hookPaths.length, 2, 'Should generate 2 hooks');
      for (const hookPath of hookPaths) {
        assert.ok(existsSync(hookPath), `Hook should exist: ${hookPath}`);
        assert.ok(hookPath.endsWith('.js'), 'Should have .js extension');
        const content = readFileSync(hookPath, 'utf8');
        assert.ok(content.startsWith('#!/usr/bin/env node'), 'Should be a Node.js script');
      }
    });
  });
});
