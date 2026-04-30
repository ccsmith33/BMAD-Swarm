import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSwarmConfig, getAgentNames, getTeamConfig } from '../utils/config.js';

describe('Config System', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-config-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  describe('loadSwarmConfig', () => {
    it('loads and applies defaults to minimal config', () => {
      const configPath = join(tmpDir, 'minimal.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      assert.equal(config.project.name, 'test');
      assert.equal(config.project.type, 'other');
      assert.equal(config.methodology.autonomy, 'guided');
      assert.equal(config.methodology.phases.exploration.enabled, true);
      assert.equal(config.methodology.phases.implementation.parallel_devs, 2);
      assert.equal(config.methodology.quality.require_tests, true);
      assert.equal(config.methodology.quality.require_review, true);
      assert.deepEqual(config.methodology.quality.require_human_approval, ['prd', 'architecture']);
      assert.equal(config.output.artifacts_dir, './artifacts');
      assert.equal(config.output.code_dir, './src');
    });

    it('applies ideation defaults', () => {
      const configPath = join(tmpDir, 'ideation-defaults.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      assert.equal(config.methodology.phases.ideation.enabled, true);
      assert.equal(config.methodology.ideation.enabled, true);
      assert.deepEqual(config.methodology.ideation.default_perspectives, [
        'product-strategist',
        'technical-feasibility',
        'devils-advocate',
        'innovation',
      ]);
    });

    it('preserves user-specified values', () => {
      const configPath = join(tmpDir, 'custom.yaml');
      writeFileSync(configPath, `
project:
  name: custom-project
  type: api
methodology:
  autonomy: auto
  phases:
    exploration:
      enabled: false
  quality:
    require_tests: false
output:
  artifacts_dir: ./docs
`);

      const config = loadSwarmConfig(configPath);
      assert.equal(config.project.name, 'custom-project');
      assert.equal(config.project.type, 'api');
      assert.equal(config.methodology.autonomy, 'auto');
      assert.equal(config.methodology.phases.exploration.enabled, false);
      assert.equal(config.methodology.phases.definition.enabled, true);
      assert.equal(config.methodology.quality.require_tests, false);
      assert.equal(config.output.artifacts_dir, './docs');
    });

    it('throws when file not found', () => {
      assert.throws(() => {
        loadSwarmConfig(join(tmpDir, 'nonexistent.yaml'));
      }, /not found/);
    });
  });

  describe('getAgentNames', () => {
    it('contains all agents discovered from agents/ directory', () => {
      const names = getAgentNames();
      const coreAgents = ['orchestrator', 'ideator', 'researcher', 'strategist', 'architect', 'developer', 'reviewer'];
      const optionalAgents = ['devops', 'security'];
      for (const name of [...coreAgents, ...optionalAgents]) {
        assert.ok(names.includes(name), `Missing agent: ${name}`);
      }
      assert.equal(names.length, 9);
    });

    it('is sorted alphabetically', () => {
      const names = getAgentNames();
      const sorted = [...names].sort();
      assert.deepEqual(names, sorted);
    });
  });

  describe('team block (D-005, ADR-004)', () => {
    it('AC1: absent team block → defaults applied (mode=dynamic, empty specs, fallback enabled)', () => {
      const configPath = join(tmpDir, 'no-team.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const config = loadSwarmConfig(configPath);
      assert.equal(config.team.mode, 'dynamic');
      assert.deepEqual(config.team.specializations, []);
      assert.equal(config.team.fallback.enabled, true);
      assert.equal(config.team.fallback.role, 'developer');
      assert.equal(config.team.fallback.model, 'opus');
    });

    it('AC2: valid fixed-mode config parses with per-spec model and description defaults', () => {
      const configPath = join(tmpDir, 'fixed-mode.yaml');
      writeFileSync(configPath, `
project:
  name: test
team:
  mode: fixed
  specializations:
    - role: developer
      domain: backend-auth
      description: OAuth and sessions
    - role: developer
      domain: backend-upload
`);

      const config = loadSwarmConfig(configPath);
      assert.equal(config.team.mode, 'fixed');
      assert.equal(config.team.specializations.length, 2);
      assert.equal(config.team.specializations[0].role, 'developer');
      assert.equal(config.team.specializations[0].domain, 'backend-auth');
      assert.equal(config.team.specializations[0].description, 'OAuth and sessions');
      assert.equal(config.team.specializations[0].model, 'opus');
      assert.equal(config.team.specializations[1].model, 'opus');
      assert.equal(config.team.specializations[1].description, '');
    });

    it('AC3: invalid team.mode is rejected', () => {
      const configPath = join(tmpDir, 'bad-mode.yaml');
      writeFileSync(configPath, 'project:\n  name: test\nteam:\n  mode: hybrid\n');
      assert.throws(
        () => loadSwarmConfig(configPath),
        /team\.mode "hybrid" is invalid\. Valid options: dynamic, fixed/,
      );
    });

    it('AC4: fixed mode with empty specializations is rejected', () => {
      const configPath = join(tmpDir, 'fixed-empty.yaml');
      writeFileSync(configPath, 'project:\n  name: test\nteam:\n  mode: fixed\n  specializations: []\n');
      assert.throws(
        () => loadSwarmConfig(configPath),
        /team\.mode is "fixed" but team\.specializations is empty/,
      );
    });

    it('AC5: invalid specialist role is rejected', () => {
      const configPath = join(tmpDir, 'bad-role.yaml');
      writeFileSync(configPath, `
project:
  name: test
team:
  mode: fixed
  specializations:
    - role: ideator
      domain: backend-auth
`);
      assert.throws(
        () => loadSwarmConfig(configPath),
        /developer and reviewer are valid v1 specialist roles/,
      );
    });

    it('AC6: invalid domain slug is rejected', () => {
      const configPath = join(tmpDir, 'bad-domain.yaml');
      writeFileSync(configPath, `
project:
  name: test
team:
  mode: fixed
  specializations:
    - role: developer
      domain: Backend Auth
`);
      assert.throws(
        () => loadSwarmConfig(configPath),
        /\^\[a-z0-9\]\[a-z0-9-\]\*\[a-z0-9\]\$/,
      );
    });

    it('AC7: duplicate (role, domain) pair is rejected', () => {
      const configPath = join(tmpDir, 'dup-domain.yaml');
      writeFileSync(configPath, `
project:
  name: test
team:
  mode: fixed
  specializations:
    - role: developer
      domain: backend-auth
    - role: developer
      domain: backend-auth
`);
      assert.throws(
        () => loadSwarmConfig(configPath),
        /\(role, domain\) pair must be unique/,
      );
    });

    it('AC8: disabling fallback in fixed mode warns but does not throw', () => {
      const configPath = join(tmpDir, 'fallback-disabled.yaml');
      writeFileSync(configPath, `
project:
  name: test
team:
  mode: fixed
  specializations:
    - role: developer
      domain: backend-auth
  fallback:
    enabled: false
`);

      const originalWarn = console.warn;
      const captured = [];
      console.warn = (msg) => captured.push(msg);
      try {
        const config = loadSwarmConfig(configPath);
        assert.equal(config.team.fallback.enabled, false);
      } finally {
        console.warn = originalWarn;
      }
      assert.ok(
        captured.some(m => String(m).includes('fallback disabled in fixed mode')),
        `Expected a warning containing "fallback disabled in fixed mode", got: ${JSON.stringify(captured)}`,
      );
    });

    it('AC9: per-specialization model overrides defaults.model', () => {
      const configPath = join(tmpDir, 'per-spec-model.yaml');
      writeFileSync(configPath, `
project:
  name: test
defaults:
  model: opus
team:
  mode: fixed
  specializations:
    - role: developer
      domain: backend-auth
      model: sonnet
    - role: developer
      domain: backend-upload
`);

      const config = loadSwarmConfig(configPath);
      assert.equal(config.team.specializations[0].model, 'sonnet');
      assert.equal(config.team.specializations[1].model, 'opus');
    });

    it('AC10: getTeamConfig returns the normalized team view', () => {
      const configPath = join(tmpDir, 'get-team.yaml');
      writeFileSync(configPath, `
project:
  name: test
team:
  mode: fixed
  specializations:
    - role: reviewer
      domain: code-quality
`);

      const config = loadSwarmConfig(configPath);
      const team = getTeamConfig(config);
      assert.equal(team.mode, 'fixed');
      assert.equal(team.specializations.length, 1);
      assert.equal(team.specializations[0].role, 'reviewer');
      assert.equal(team.specializations[0].domain, 'code-quality');
      assert.equal(team.specializations[0].model, 'opus');
      assert.equal(team.specializations[0].description, '');
      assert.equal(team.fallback.enabled, true);
      assert.equal(team.fallback.role, 'developer');
      assert.equal(team.fallback.model, 'opus');
    });

    it('AC10: getTeamConfig works on dynamic-mode (defaults-only) config', () => {
      const configPath = join(tmpDir, 'get-team-dynamic.yaml');
      writeFileSync(configPath, 'project:\n  name: test\n');

      const team = getTeamConfig(loadSwarmConfig(configPath));
      assert.equal(team.mode, 'dynamic');
      assert.deepEqual(team.specializations, []);
      assert.equal(team.fallback.enabled, true);
    });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
