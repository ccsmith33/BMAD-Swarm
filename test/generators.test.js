import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { generateAgents, ejectAgent, unejectAgent, applyModelFrontmatter, applyFrontmatterField } from '../generators/agent-generator.js';
import { generateClaudeMd } from '../generators/claude-md-generator.js';
import { generateHooks } from '../generators/hooks-generator.js';
import { generateCommands } from '../generators/commands-generator.js';
import { isFileManuallyModified } from '../utils/fs-helpers.js';

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
        assert.ok(!content.includes('Project Info'), 'Should not include Project Info section (removed for token savings)');
        assert.ok(!content.includes('test-project'), 'Should not include project name in agent file');
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
      assert.ok(!content.includes('Project Info'), 'Should not include Project Info section (removed for token savings)');
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
  security:
    enabled: false
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      const result = generateAgents(config, paths);

      assert.ok(!result.generated.includes('security'), 'Security should not be generated when disabled');
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

    it('adds model frontmatter when model is specified in config', () => {
      const projectDir = join(tmpDir, 'agent-test-model-fm');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: model-test
  type: web-app
stack:
  language: JavaScript
agents:
  developer:
    model: sonnet
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);

      const devContent = readFileSync(join(paths.agentsDir, 'developer.md'), 'utf8');
      // Should have YAML frontmatter with model field (after the bmad-generated hash)
      assert.ok(devContent.includes('---'), 'Should contain frontmatter delimiters');
      assert.ok(devContent.includes('model: sonnet'), 'Should contain model field in frontmatter');
      // Should NOT have the old HTML comment approach
      assert.ok(!devContent.includes('<!-- preferred-model:'), 'Should not use old HTML comment approach');
    });

    it('applies defaults.model as fallback when no per-agent model specified', () => {
      const projectDir = join(tmpDir, 'agent-test-default-model');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: default-model-test
  type: web-app
stack:
  language: JavaScript
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);

      const devContent = readFileSync(join(paths.agentsDir, 'developer.md'), 'utf8');
      // applyDefaults now sets defaults.model='opus' so every agent inherits opus when no per-agent override
      assert.ok(devContent.includes('model: opus'), 'Should contain model: opus from defaults.model fallback');
    });

    it('replaces existing model key in frontmatter instead of duplicating', () => {
      // Case 1: Content already has frontmatter with model: key
      const withModel = '---\nmodel: haiku\ndescription: custom\n---\n# Agent\nContent here\n';
      const result1 = applyModelFrontmatter(withModel, 'sonnet');
      const modelCount1 = (result1.match(/^model:/gm) || []).length;
      assert.equal(modelCount1, 1, 'Should have exactly one model: key when replacing existing');
      assert.ok(result1.includes('model: sonnet'), 'Should have new model value');
      assert.ok(!result1.includes('model: haiku'), 'Should not have old model value');

      // Case 2: Content has frontmatter without model: key
      const withoutModel = '---\ndescription: custom\n---\n# Agent\nContent here\n';
      const result2 = applyModelFrontmatter(withoutModel, 'opus');
      const modelCount2 = (result2.match(/^model:/gm) || []).length;
      assert.equal(modelCount2, 1, 'Should have exactly one model: key when adding new');
      assert.ok(result2.includes('model: opus'), 'Should have model: opus');

      // Case 3: Content has no frontmatter
      const noFm = '# Agent\nContent here\n';
      const result3 = applyModelFrontmatter(noFm, 'sonnet');
      assert.ok(result3.startsWith('---\nmodel: sonnet\n---\n'), 'Should prepend new frontmatter');
    });

    it('applyFrontmatterField handles all three cases for any key', () => {
      // Case 1: content has frontmatter with the key — replace value
      const withKey = '---\nisolation: none\n---\n# Agent\n';
      const r1 = applyFrontmatterField(withKey, 'isolation', 'worktree');
      assert.equal((r1.match(/^isolation:/gm) || []).length, 1, 'Should have exactly one isolation: key');
      assert.ok(r1.includes('isolation: worktree'), 'Should have updated value');
      assert.ok(!r1.includes('isolation: none'), 'Should not have old value');

      // Case 2: content has frontmatter without the key — append key
      const withoutKey = '---\nmodel: sonnet\n---\n# Agent\n';
      const r2 = applyFrontmatterField(withoutKey, 'isolation', 'worktree');
      assert.ok(r2.includes('isolation: worktree'), 'Should include new key');
      assert.ok(r2.includes('model: sonnet'), 'Should preserve existing key');

      // Case 3: content has no frontmatter — create new block
      const noFm2 = '# Agent\nContent\n';
      const r3 = applyFrontmatterField(noFm2, 'isolation', 'worktree');
      assert.ok(r3.startsWith('---\nisolation: worktree\n---\n'), 'Should prepend new frontmatter');
    });

    it('applyModelFrontmatter is a wrapper around applyFrontmatterField', () => {
      const content = '# Agent\n';
      const fromWrapper = applyModelFrontmatter(content, 'sonnet');
      const fromGeneric = applyFrontmatterField(content, 'model', 'sonnet');
      assert.equal(fromWrapper, fromGeneric, 'Both should produce identical output');
    });

    it('adds isolation frontmatter when isolation is specified in config', () => {
      const projectDir = join(tmpDir, 'agent-test-isolation-fm');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: isolation-test
  type: web-app
stack:
  language: JavaScript
agents:
  developer:
    isolation: worktree
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);

      const devContent = readFileSync(join(paths.agentsDir, 'developer.md'), 'utf8');
      assert.ok(devContent.includes('isolation: worktree'), 'Should contain isolation field in frontmatter');
    });

    it('model frontmatter works with hash-based modification detection', () => {
      const projectDir = join(tmpDir, 'agent-test-model-hash');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: hash-test
  type: web-app
stack:
  language: JavaScript
agents:
  developer:
    model: opus
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);

      const devPath = join(paths.agentsDir, 'developer.md');
      const content = readFileSync(devPath, 'utf8');
      // Hash should be the first line
      assert.ok(content.startsWith('<!-- bmad-generated:'), 'Hash should come first');
      // Frontmatter should come after the hash
      const afterHash = content.split('\n').slice(1).join('\n');
      assert.ok(afterHash.startsWith('---\n'), 'Frontmatter should start after hash line');

      // Running again should not flag as manually modified
      assert.ok(!isFileManuallyModified(devPath), 'Should not be detected as manually modified');
    });

    it('orchestrator agent contains assembly schema and slash-command pointer', () => {
      const projectDir = join(tmpDir, 'agent-test-orch-rules');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: orch-test
  type: web-app
stack:
  language: TypeScript
methodology:
  autonomy: guided
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);

      const orchPath = join(paths.agentsDir, 'orchestrator.md');
      const content = readFileSync(orchPath, 'utf8');

      // Post-Option-C invariants: slash-command pointer + bmad-assembly schema + signal-lens table
      assert.ok(content.includes('/identity-orchestrator'), 'Should reference /identity-orchestrator slash command');
      assert.ok(content.includes('bmad-assembly'), 'Should contain bmad-assembly schema');
      assert.ok(content.includes('Signal'), 'Should contain Signal -> lens lookup section');
      assert.ok(content.includes('code-quality'), 'Signal-lens table should include code-quality lens');
    });

    it('orchestrator agent has no duplicate section headers', () => {
      const projectDir = join(tmpDir, 'agent-test-orch-dedup');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: dedup-test
  type: web-app
stack:
  language: TypeScript
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);

      const orchPath = join(paths.agentsDir, 'orchestrator.md');
      const content = readFileSync(orchPath, 'utf8');

      const countMatches = (str, regex) => (str.match(regex) || []).length;

      // Each canonical section appears exactly once in the slim template
      assert.equal(countMatches(content, /#+\s+Complexity scoring/g), 1, 'Complexity scoring should appear once');
      assert.equal(countMatches(content, /#+\s+Entry points/g), 1, 'Entry points should appear once');
      assert.equal(countMatches(content, /#+\s+Autonomy override rules/g), 1, 'Autonomy override rules should appear once');
      assert.equal(countMatches(content, /#+\s+Rejection handling/g), 1, 'Rejection handling should appear once');

      // Deleted sections must NOT be present in the slim rewrite
      assert.equal(countMatches(content, /#+\s+Orchestration Modes/g), 0, 'Orchestration Modes section should be deleted');
      assert.equal(countMatches(content, /#+\s+Multi-Perspective Review/g), 0, 'Multi-Perspective Review section should be deleted');
      assert.equal(countMatches(content, /#+\s+Agent Team/g), 0, 'Agent Team directory should be deleted');
    });

    it('orchestrator agent includes opus model selection guidance', () => {
      const projectDir = join(tmpDir, 'agent-test-model-guidance');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, `
project:
  name: model-guidance-test
  type: web-app
stack:
  language: JavaScript
`);

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);

      const orchPath = join(paths.agentsDir, 'orchestrator.md');
      const content = readFileSync(orchPath, 'utf8');

      assert.ok(content.includes('Model selection'), 'Should contain Model selection section');
      assert.ok(content.includes('opus'), 'Should mention opus as default');
      assert.ok(content.includes('defaults.model'), 'Should reference swarm.yaml defaults.model');
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

    it('slim CLAUDE.md points at /identity-orchestrator slash command', () => {
      const projectDir = join(tmpDir, 'claudemd-slim-pointer');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: slim-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateClaudeMd(config, paths);
      const content = readFileSync(paths.claudeMd, 'utf8');
      assert.ok(content.includes('/identity-orchestrator'), 'Should point at /identity-orchestrator');
      assert.ok(content.includes('bmad-assembly'), 'Should require bmad-assembly block before TeamCreate');
      assert.ok(content.includes('opus'), 'Should mention opus default model');
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

      assert.equal(result.generated.length, 4, 'Should generate 4 hooks');
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
      const hookPath = join(paths.hooksDir, 'user-prompt-submit.cjs');
      const existing = readFileSync(hookPath, 'utf8');
      writeFileSync(hookPath, existing + '\n// my custom change\n');

      // Second generation should skip the modified hook
      const result = generateHooks(config, paths);
      assert.equal(result.skipped.length, 1, 'Should skip 1 modified hook');
      assert.ok(result.skipped[0].includes('user-prompt-submit'), 'Should skip user-prompt-submit');
      assert.equal(result.generated.length, 3, 'Should regenerate the other 3');
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
      const hookPath = join(paths.hooksDir, 'user-prompt-submit.cjs');
      const existing = readFileSync(hookPath, 'utf8');
      writeFileSync(hookPath, existing + '\n// modified\n');

      const result = generateHooks(config, paths, { force: true });
      assert.equal(result.skipped.length, 0, 'Should skip nothing with force');
      assert.equal(result.generated.length, 4, 'Should regenerate all 4');
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

    it('generates post-compact-reinject hook', () => {
      const projectDir = join(tmpDir, 'hooks-test-session');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: session-test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateHooks(config, paths);

      const hookPath = join(paths.hooksDir, 'post-compact-reinject.cjs');
      assert.ok(existsSync(hookPath), 'post-compact-reinject.cjs should exist');

      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes('/identity-orchestrator'), 'Should point at /identity-orchestrator slash command');
      assert.ok(content.includes('Context was compacted'), 'Should announce compaction');
      assert.ok(content.includes('.session-active'), 'Should clear session marker on compaction');
    });

    it('generates user-prompt-submit hook (minimal reminder, no orchestrator.md read)', () => {
      const projectDir = join(tmpDir, 'hooks-test-user-prompt');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateHooks(config, paths);

      const hookPath = join(paths.hooksDir, 'user-prompt-submit.cjs');
      assert.ok(existsSync(hookPath), 'user-prompt-submit.cjs should exist');

      const content = readFileSync(hookPath, 'utf8');
      assert.ok(!content.includes('orchestrator.md'), 'Must NOT read orchestrator.md (B-2/B-6 fix)');
      assert.ok(content.includes('/identity-orchestrator'), 'Should point at /identity-orchestrator slash command');
      assert.ok(content.includes('.session-active'), 'Should use session marker file');
    });

    it('generates teamcreate-gate hook', () => {
      const projectDir = join(tmpDir, 'hooks-test-teamcreate-gate');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateHooks(config, paths);

      const hookPath = join(paths.hooksDir, 'teamcreate-gate.cjs');
      assert.ok(existsSync(hookPath), 'teamcreate-gate.cjs should exist');
      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes("permissionDecision: 'deny'") || content.includes('permissionDecision: \'deny\''), 'Should deny when assembly block missing');
      assert.ok(content.includes('bmad-assembly'), 'Should look for bmad-assembly block');
      assert.ok(content.includes('transcript_path'), 'Should read transcript from event');
    });

    it('generates orchestrator-write-gate hook', () => {
      const projectDir = join(tmpDir, 'hooks-test-write-gate');
      mkdirSync(projectDir, { recursive: true });

      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateHooks(config, paths);

      const hookPath = join(paths.hooksDir, 'orchestrator-write-gate.cjs');
      assert.ok(existsSync(hookPath), 'orchestrator-write-gate.cjs should exist');
      const content = readFileSync(hookPath, 'utf8');
      assert.ok(content.includes("AGENT_ROLE"), 'Should gate on AGENT_ROLE env');
      assert.ok(content.includes("'orchestrator'"), 'Should check for orchestrator role');
      assert.ok(content.includes('artifacts') && content.includes('project.yaml'), 'Should allow artifacts/** and project.yaml');
    });

    it('orchestrator-write-gate allows all artifacts/ subpaths and denies source/test paths (hotfix Group 8d)', () => {
      const projectDir = join(tmpDir, 'hooks-test-write-gate-scope');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateHooks(config, paths);

      const hookPath = join(paths.hooksDir, 'orchestrator-write-gate.cjs');
      const content = readFileSync(hookPath, 'utf8');

      // Extract the allowed array and functionally exercise it
      const m = content.match(/const allowed = \[([\s\S]*?)\];/);
      assert.ok(m, 'Should contain allowed array');
      const allowed = eval('[' + m[1] + ']');

      // ALLOW: every artifacts subpath (reviews, context, design, planning, implementation, exploration)
      const allowPaths = [
        'artifacts/reviews/foo.md',
        'artifacts/context/decision-log.md',
        'artifacts/design/architecture.md',
        'artifacts/design/decisions/adr-002.md',
        'artifacts/planning/prd.md',
        'artifacts/implementation/stories/1-1.md',
        'artifacts/exploration/research.md',
        'C:/Users/foo/artifacts/reviews/bar.md',
        'C:\\Users\\foo\\artifacts\\reviews\\bar.md',
        'project.yaml',
        'swarm.yaml',
        '.gitignore',
      ];
      for (const p of allowPaths) {
        assert.ok(allowed.some(r => r.test(p)), 'Should ALLOW write to: ' + p);
      }

      // DENY: source, tests, generators, hooks, templates, agents, methodology, cli, bin, package.json
      const denyPaths = [
        'src/foo.js',
        'utils/config.js',
        'test/foo.test.js',
        'generators/hooks-generator.js',
        '.claude/hooks/orchestrator-write-gate.cjs',
        'templates/settings.json.template',
        'agents/orchestrator.md',
        'methodology/phases.yaml',
        'cli/init.js',
        'bin/bmad-swarm.js',
        'package.json',
        'projectXyaml',
      ];
      for (const p of denyPaths) {
        assert.ok(!allowed.some(r => r.test(p)), 'Should DENY write to: ' + p);
      }
    });
  });

  describe('Commands Generator', () => {
    it('generates identity commands for each enabled agent', () => {
      const projectDir = join(tmpDir, 'cmd-test-identity');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: cmd-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      // Must generate agents first so identity command bodies can include their content
      generateAgents(config, paths);
      const result = generateCommands(config, paths);

      const commandsDir = join(paths.claudeDir, 'commands');
      const identityCount = result.generated.filter(n => n.startsWith('identity-')).length;
      assert.ok(identityCount >= 9, `Should generate at least 9 identity commands (got ${identityCount})`);
      assert.ok(existsSync(join(commandsDir, 'identity-orchestrator.md')), 'identity-orchestrator.md should exist');
    });

    it('generates 9 workflow commands', () => {
      const projectDir = join(tmpDir, 'cmd-test-workflow');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: cmd-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);
      const result = generateCommands(config, paths);

      const commandsDir = join(paths.claudeDir, 'commands');
      const workflows = ['bug', 'feature', 'research', 'audit', 'brainstorm', 'explore-idea', 'migrate', 'review', 'plan'];
      for (const wf of workflows) {
        assert.ok(existsSync(join(commandsDir, `${wf}.md`)), `${wf}.md should exist`);
      }
    });

    it('brainstorm command uses overlay pattern (no assembly block, reads ideator.md)', () => {
      const projectDir = join(tmpDir, 'cmd-test-brainstorm-overlay');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: cmd-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);
      generateCommands(config, paths);

      const commandsDir = join(paths.claudeDir, 'commands');
      const content = readFileSync(join(commandsDir, 'brainstorm.md'), 'utf8');
      // Per D-BRN-1: /brainstorm is an overlay process step, not a teammate spawn.
      // The command body is allowed to mention "bmad-assembly" in prose ("Do NOT emit
      // a bmad-assembly block"), but must not contain an actual fenced block.
      assert.ok(!/```bmad-assembly/.test(content),
        'brainstorm command must NOT emit a fenced bmad-assembly block in overlay mode');
      assert.ok(content.includes('Do NOT') && /bmad-assembly|TeamCreate/.test(content),
        'brainstorm command should explicitly forbid assembly block / TeamCreate');
      assert.ok(content.includes('agents/ideator.md'),
        'brainstorm command must instruct the orchestrator to Read agents/ideator.md');
      assert.ok(content.includes('brainstorm mode') || content.includes('overlay'),
        'brainstorm command must frame itself as overlay/process-step mode');
    });

    it('explore-idea command is Mode B: ideator overlay + researcher parallel spawn', () => {
      const projectDir = join(tmpDir, 'cmd-test-explore-idea');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: cmd-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);
      generateCommands(config, paths);

      const commandsDir = join(paths.claudeDir, 'commands');
      const content = readFileSync(join(commandsDir, 'explore-idea.md'), 'utf8');
      // Mode B: overlay + researcher spawn.
      assert.ok(content.includes('agents/ideator.md') || /ideator.md/i.test(content),
        'explore-idea must use the ideator overlay (Mode B)');
      assert.ok(content.includes('bmad-assembly'),
        'explore-idea must emit a bmad-assembly block for the parallel researcher spawn');
      assert.ok(content.includes('researcher'),
        'explore-idea must spawn a researcher teammate in parallel with the overlay');
    });

    it('identity command body contains agent content (stripped of hash header)', () => {
      const projectDir = join(tmpDir, 'cmd-test-body');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: cmd-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);
      generateCommands(config, paths);

      const body = readFileSync(join(paths.claudeDir, 'commands', 'identity-orchestrator.md'), 'utf8');
      // No inner hash-header leak from the agent file
      assert.ok(!body.includes('<!-- bmad-generated:') || body.indexOf('<!-- bmad-generated:') === 0,
        'Agent hash header should be stripped from command body');
      // Should include the orchestrator's invariants
      assert.ok(body.includes('/identity-orchestrator') || body.includes('bmad-assembly'),
        'Command body should include orchestrator identity content');
    });

    it('skips manually modified commands; force overwrites', () => {
      const projectDir = join(tmpDir, 'cmd-test-mod');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: cmd-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);
      generateCommands(config, paths);

      const bugPath = join(paths.claudeDir, 'commands', 'bug.md');
      const existing = readFileSync(bugPath, 'utf8');
      writeFileSync(bugPath, existing + '\n# edited\n');

      const second = generateCommands(config, paths);
      assert.ok(second.modified.includes('bug.md'), 'Should flag bug.md as manually modified');

      const forced = generateCommands(config, paths, { force: true });
      assert.ok(forced.generated.includes('bug.md'), 'Force should regenerate bug.md');
    });

    // RT-3 / D-014, ADR-010 — /retrofit-team slash command
    it('retrofit-team workflow command is generated with the correct frontmatter description', () => {
      const projectDir = join(tmpDir, 'cmd-test-retrofit-team-emit');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: cmd-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);
      const result = generateCommands(config, paths);

      const commandsDir = join(paths.claudeDir, 'commands');
      const path = join(commandsDir, 'retrofit-team.md');
      assert.ok(existsSync(path), 'retrofit-team.md should be generated');
      assert.ok(result.generated.includes('retrofit-team.md'),
        'retrofit-team.md should appear in the generated list');

      const content = readFileSync(path, 'utf8');
      // The generator prepends a `<!-- bmad-generated:HASH -->` line; the
      // standard `---\ndescription: ...\n---` frontmatter follows immediately.
      assert.ok(/^<!-- bmad-generated:[a-f0-9]+ -->\n---\ndescription: /.test(content),
        'retrofit-team.md should have the hash header followed by the standard frontmatter');
      assert.ok(/description: Propose a Domain Map for an existing architecture/.test(content),
        'retrofit-team frontmatter description should mention the Domain Map proposal');
      assert.ok(/orchestrator-overlay/.test(content),
        'retrofit-team description should advertise the overlay pattern');
    });

    it('retrofit-team body honors all the ADR-010 / architecture-retrofit §3.2 invariants', () => {
      const projectDir = join(tmpDir, 'cmd-test-retrofit-team-body');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: cmd-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);
      generateCommands(config, paths);

      const content = readFileSync(join(paths.claudeDir, 'commands', 'retrofit-team.md'), 'utf8');

      // AC3 — refuses when wide-team is already configured.
      assert.ok(/team\.mode === "fixed"/.test(content) && /team\.specializations/.test(content),
        'Step 1 must refuse when team.mode is fixed AND specializations is non-empty');

      // AC4 — refuses when architecture.md is missing.
      assert.ok(/artifacts\/design\/architecture\.md/.test(content) && /\/feature|\/plan/.test(content),
        'Step 2 must refuse with a pointer to /feature or /plan when architecture.md is missing');

      // AC5 — handles existing Domain Map; replace requires literal "replace".
      assert.ok(/## Domain Map|### Domain Map/.test(content),
        'Step 3 must detect an existing Domain Map heading');
      assert.ok(/literal word .?replace.?|type the literal word/i.test(content),
        'Step 3 must require the literal word "replace" for destructive overwrite');

      // AC6 — loads architect Domain Map heuristics.
      assert.ok(content.includes('agents/architect.md'),
        'Step 4 must load agents/architect.md heuristics into the overlay');
      assert.ok(/four heuristics|≥2-story rule/.test(content),
        'Step 4 must reference the four-heuristics rule from the architect doc');

      // AC7 — explicit human approval pause.
      assert.ok(/Approve the Domain Map for insertion/i.test(content),
        'Step 7 must pause for explicit human approval before any edit');
      assert.ok(/CLAUDE\.md/.test(content) && /human.?approval/i.test(content),
        'Step 7 must cite the CLAUDE.md architecture human-approval invariant');

      // AC8 — single-task bmad-assembly block + spawn brief constraints.
      assert.ok(/```bmad-assembly[\s\S]+role: architect[\s\S]+```/.test(content),
        'Step 8 must emit a bmad-assembly block spawning ONE architect teammate');
      assert.ok(content.includes('do not author a fresh Domain Map') ||
                content.includes('Do not author a fresh Domain Map'),
        'Spawn brief must contain literal phrase "do not author a fresh Domain Map"');
      assert.ok(content.includes('do not write an ADR') ||
                content.includes('Do not write an ADR'),
        'Spawn brief must contain literal phrase "do not write an ADR"');

      // AC9 — log a tactical D-ID after the architect reports done.
      assert.ok(/D-NNN — Retrofit Domain Map added to architecture\.md via \/retrofit-team/.test(content),
        'Step 9 must log the tactical D-NNN entry via the documented title');
      assert.ok(/decision-log\.md/.test(content),
        'Step 9 must instruct logging to artifacts/context/decision-log.md');

      // AC10 — next-step guidance.
      assert.ok(/bmad-swarm scaffold-team/.test(content),
        'Step 10 must point the user at bmad-swarm scaffold-team as the follow-up CLI command');

      // ADR-010 cross-reference + non-loosening of orchestrator-write-gate.
      assert.ok(/ADR-010/.test(content),
        'Body must cross-reference ADR-010 (overlay-vs-spawn rationale)');
      assert.ok(/architecture-retrofit\.md/.test(content),
        'Body must cross-reference artifacts/design/architecture-retrofit.md');
    });

    it('retrofit-team addition does not break existing slash commands', () => {
      const projectDir = join(tmpDir, 'cmd-test-retrofit-team-noop');
      mkdirSync(projectDir, { recursive: true });
      const configPath = join(projectDir, 'swarm.yaml');
      writeFileSync(configPath, 'project:\n  name: cmd-test\nstack:\n  language: JS\n');
      const config = loadSwarmConfig(configPath);
      const paths = getProjectPaths(projectDir);
      generateAgents(config, paths);
      const result = generateCommands(config, paths);

      const commandsDir = join(paths.claudeDir, 'commands');
      const existingWorkflows = ['bug', 'feature', 'research', 'audit',
        'brainstorm', 'explore-idea', 'migrate', 'review', 'plan'];
      for (const wf of existingWorkflows) {
        assert.ok(existsSync(join(commandsDir, `${wf}.md`)),
          `Existing workflow ${wf}.md should still be generated after retrofit-team addition`);
        assert.ok(result.generated.includes(`${wf}.md`),
          `Existing workflow ${wf}.md should appear in result.generated`);
      }
      // First-pass run on a fresh project: no command can have been "manually
      // modified" yet, so result.modified is empty.
      assert.deepEqual(result.modified, [],
        'First-pass generation should not flag any commands as manually modified');
    });
  });
});
