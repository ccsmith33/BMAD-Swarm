import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { generateRules } from '../generators/rules-generator.js';

describe('Rules Generator', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-rules-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeProject(name) {
    const projectDir = join(tmpDir, name);
    mkdirSync(projectDir, { recursive: true });
    const configPath = join(projectDir, 'swarm.yaml');
    writeFileSync(configPath, `
project:
  name: rules-test
  type: web-app
stack:
  language: TypeScript
methodology:
  autonomy: auto
  quality:
    require_human_approval:
      - prd
      - architecture
`);
    const config = loadSwarmConfig(configPath);
    const paths = getProjectPaths(projectDir);
    return { config, paths, projectDir };
  }

  it('generates rule files from templates', () => {
    const { config, paths } = makeProject('rules-basic');
    const result = generateRules(config, paths);

    assert.ok(result.generated.length > 0, 'Should generate at least one rule file');
    assert.equal(result.modified.length, 0, 'No rules should be modified initially');

    // Check that rule files exist in the output directory
    for (const name of result.generated) {
      const filePath = join(paths.rulesDir, name);
      assert.ok(existsSync(filePath), `Rule file should exist: ${name}`);
    }
  });

  it('generates all expected rule template files', () => {
    const { config, paths } = makeProject('rules-expected');
    const result = generateRules(config, paths);

    // There are 4 rule templates
    const expectedRules = [
      'coding-standards.md',
      'orchestrator-identity.md',
      'orchestrator-methodology.md',
      'quality-standards.md',
    ];
    for (const rule of expectedRules) {
      assert.ok(result.generated.includes(rule), `Should generate ${rule}`);
    }
  });

  it('substitutes template variables correctly', () => {
    const { config, paths } = makeProject('rules-vars');
    generateRules(config, paths);

    const qualityPath = join(paths.rulesDir, 'quality-standards.md');
    if (existsSync(qualityPath)) {
      const content = readFileSync(qualityPath, 'utf8');
      // The quality standards template uses require_human_approval_list
      assert.ok(content.includes('prd, architecture'), 'Should substitute human approval list');
      assert.ok(!content.includes('{{'), 'Should not contain unresolved template variables');
    }
  });

  it('adds bmad-generated hash header', () => {
    const { config, paths } = makeProject('rules-hash');
    generateRules(config, paths);

    const files = readdirSync(paths.rulesDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = readFileSync(join(paths.rulesDir, file), 'utf8');
      assert.ok(content.startsWith('<!-- bmad-generated:'), `${file} should have bmad-generated header`);
    }
  });

  it('detects manual modifications and skips', () => {
    const { config, paths } = makeProject('rules-modified');

    // First generation
    generateRules(config, paths);

    // Manually modify one rule
    const codingPath = join(paths.rulesDir, 'coding-standards.md');
    const existing = readFileSync(codingPath, 'utf8');
    writeFileSync(codingPath, existing + '\n# My custom addition\n');

    // Second generation should skip the modified file
    const result = generateRules(config, paths);
    assert.ok(result.modified.includes('coding-standards.md'), 'Should detect modified coding-standards.md');
    assert.ok(result.generated.length > 0, 'Should still generate other rules');
  });

  it('force overwrites modified rules', () => {
    const { config, paths } = makeProject('rules-force');

    // First generation
    generateRules(config, paths);

    // Manually modify a rule
    const codingPath = join(paths.rulesDir, 'coding-standards.md');
    const existing = readFileSync(codingPath, 'utf8');
    writeFileSync(codingPath, existing + '\n# Modified\n');

    // Force should overwrite
    const result = generateRules(config, paths, { force: true });
    assert.equal(result.modified.length, 0, 'Should not skip anything with force');
    assert.ok(result.generated.includes('coding-standards.md'), 'Should regenerate coding-standards.md');
  });
});
