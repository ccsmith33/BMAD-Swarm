import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { generateAgents, ejectAgent, unejectAgent } from '../generators/agent-generator.js';
import { generateClaudeMd } from '../generators/claude-md-generator.js';
import { generateSystemPrompt } from '../generators/system-prompt-generator.js';
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

    it('includes bmad-swarm start note', () => {
      const projectDir = join(tmpDir, 'claudemd-start-note');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: start-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateClaudeMd(config, paths);
      const content = readFileSync(paths.claudeMd, 'utf8');
      assert.ok(content.includes('bmad-swarm start'), 'Should include bmad-swarm start note');
      assert.ok(content.includes('.claude/rules/'), 'Should reference rules directory');
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

  describe('System Prompt Generator', () => {
    it('generates system-prompt.txt', () => {
      const projectDir = join(tmpDir, 'sysprompt-test-1');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: prompt-test
  type: web-app
stack:
  language: TypeScript
methodology:
  autonomy: auto
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      const result = generateSystemPrompt(config, paths);

      assert.ok(existsSync(paths.systemPrompt), 'system-prompt.txt should exist');
      assert.equal(result.modified, false, 'Should not be marked as modified');

      const content = readFileSync(paths.systemPrompt, 'utf8');
      assert.ok(content.includes('orchestrator'), 'Should include orchestrator');
      assert.ok(content.includes('Five Rules'), 'Should include Five Rules');
    });

    it('skips when manually modified', () => {
      const projectDir = join(tmpDir, 'sysprompt-test-2');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: prompt-test-2
stack:
  language: JavaScript
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);

      // First generate normally
      generateSystemPrompt(config, paths);

      // Now manually modify the file (change content but keep the hash header)
      const existing = readFileSync(paths.systemPrompt, 'utf8');
      writeFileSync(paths.systemPrompt, existing + '\n# My custom addition\n');

      // Should skip because content was modified
      const result = generateSystemPrompt(config, paths);
      assert.equal(result.modified, true, 'Should detect manual modification');
    });

    it('overwrites when force is set', () => {
      const projectDir = join(tmpDir, 'sysprompt-test-3');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: prompt-test-3
stack:
  language: JavaScript
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);

      // First generate normally
      generateSystemPrompt(config, paths);

      // Manually modify
      const existing = readFileSync(paths.systemPrompt, 'utf8');
      writeFileSync(paths.systemPrompt, existing + '\n# Modified\n');

      // Force should overwrite
      const result = generateSystemPrompt(config, paths, { force: true });
      assert.equal(result.modified, false, 'Should overwrite when forced');
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
      const result = generateHooks(config, paths);

      assert.equal(result.generated.length, 6, 'Should generate 6 hooks');
      assert.equal(result.skipped.length, 0, 'No hooks should be skipped');
      for (const hookPath of result.generated) {
        assert.ok(existsSync(hookPath), `Hook should exist: ${hookPath}`);
        assert.ok(hookPath.endsWith('.cjs'), 'Should have .cjs extension');
        const content = readFileSync(hookPath, 'utf8');
        // Generated files have a bmad-generated hash header, then the shebang
        assert.ok(content.includes('#!/usr/bin/env node'), 'Should be a Node.js script');
      }
    });

    it('skips manually modified hooks', () => {
      const projectDir = join(tmpDir, 'hooks-test-2');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);

      // First generate normally
      generateHooks(config, paths);

      // Manually modify one hook
      const hookPath = join(paths.hooksDir, 'TaskCompleted.cjs');
      const existing = readFileSync(hookPath, 'utf8');
      writeFileSync(hookPath, existing + '\n// my custom change\n');

      // Second generation should skip the modified hook
      const result = generateHooks(config, paths);
      assert.equal(result.skipped.length, 1, 'Should skip 1 modified hook');
      assert.ok(result.skipped[0].includes('TaskCompleted'), 'Should skip TaskCompleted');
      assert.equal(result.generated.length, 5, 'Should regenerate the other 5');
    });

    it('overwrites modified hooks with force option', () => {
      const projectDir = join(tmpDir, 'hooks-test-3');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);

      // Generate, modify, force regenerate
      generateHooks(config, paths);
      const hookPath = join(paths.hooksDir, 'TaskCompleted.cjs');
      const existing = readFileSync(hookPath, 'utf8');
      writeFileSync(hookPath, existing + '\n// modified\n');

      const result = generateHooks(config, paths, { force: true });
      assert.equal(result.skipped.length, 0, 'Should skip nothing with force');
      assert.equal(result.generated.length, 6, 'Should regenerate all 6');
    });

    it('generates task-tool-warning hook', () => {
      const projectDir = join(tmpDir, 'hooks-test-4');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateHooks(config, paths);

      const hookPath = join(paths.hooksDir, 'task-tool-warning.cjs');
      assert.ok(existsSync(hookPath), 'task-tool-warning.cjs should exist');
      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('TeamCreate'), 'Should mention TeamCreate');
      assert.ok(content.includes('Task tool'), 'Should mention Task tool');
    });

    it('uses JSON.stringify for project name in identity hook', () => {
      const projectDir = join(tmpDir, 'hooks-test-5');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, "project:\n  name: \"Test's \\\"Project\\\"\"\n");

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateHooks(config, paths);

      const hookPath = join(paths.hooksDir, 'identity-reinject.cjs');
      const content = readFileSync(hookPath, 'utf8');
      // Should not contain the old .replace(/'/g, ...) pattern
      assert.ok(!content.includes(".replace"), 'Should not use string replace for escaping');
    });

    it('all generated hook files contain valid JavaScript', () => {
      const projectDir = join(tmpDir, 'hooks-test-valid-js');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      const result = generateHooks(config, paths);

      for (const hookPath of result.generated) {
        const content = readFileSync(hookPath, 'utf8');
        // Strip the hash header line (line 1 or line 2 if shebang)
        // All hooks should have process.exit or process.stdout.write
        assert.ok(
          content.includes('process.exit') || content.includes('process.stdout'),
          `Hook ${hookPath} should contain process operations`
        );
        // Verify it uses require() or const (CommonJS)
        assert.ok(
          content.includes('require(') || content.includes('const ') || content.includes('process.'),
          `Hook ${hookPath} should contain valid JS constructs`
        );
      }
    });

    it('generates SessionStart hooks (identity-reinject)', () => {
      const projectDir = join(tmpDir, 'hooks-test-session');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: session-test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateHooks(config, paths);

      const hookPath = join(paths.hooksDir, 'identity-reinject.cjs');
      assert.ok(existsSync(hookPath), 'identity-reinject.cjs should exist');

      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('IDENTITY REMINDER'), 'Should contain identity reminder text');
      assert.ok(content.includes('orchestrator'), 'Should reference orchestrator role');
      assert.ok(content.includes('session-test'), 'Should include project name');
    });

    it('generates orchestrator-post-tool hook for code dir enforcement', () => {
      const projectDir = join(tmpDir, 'hooks-test-post-tool');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\noutput:\n  code_dir: ./lib\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateHooks(config, paths);

      const hookPath = join(paths.hooksDir, 'orchestrator-post-tool.cjs');
      assert.ok(existsSync(hookPath), 'orchestrator-post-tool.cjs should exist');

      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('./lib'), 'Should use configured code_dir');
      assert.ok(content.includes('additionalContext'), 'Should output additionalContext');
    });

    it('generates orchestrator-stop hook', () => {
      const projectDir = join(tmpDir, 'hooks-test-stop');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateHooks(config, paths);

      const hookPath = join(paths.hooksDir, 'orchestrator-stop.cjs');
      assert.ok(existsSync(hookPath), 'orchestrator-stop.cjs should exist');

      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('block'), 'Should contain block decision');
      assert.ok(content.includes('code-modified-marker'), 'Should reference marker file');
    });
  });
});
