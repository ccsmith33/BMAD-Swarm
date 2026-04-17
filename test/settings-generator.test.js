import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { generateSettings } from '../generators/settings-generator.js';

describe('Settings Generator', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-settings-' + Date.now());

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
    writeFileSync(configPath, 'project:\n  name: test\nstack:\n  language: JS\n');
    const config = loadSwarmConfig(configPath);
    const paths = getProjectPaths(projectDir);
    return { config, paths, projectDir };
  }

  it('generates valid JSON settings file', () => {
    const { config, paths } = makeProject('settings-test-1');
    const result = generateSettings(config, paths);

    assert.ok(existsSync(paths.settingsJson), 'settings.json should exist');
    assert.equal(result.path, paths.settingsJson, 'Should return the correct path');

    const content = readFileSync(paths.settingsJson, 'utf8');
    const parsed = JSON.parse(content);
    assert.ok(typeof parsed === 'object', 'Should be valid JSON object');
  });

  it('includes hooks configuration', () => {
    const { config, paths } = makeProject('settings-test-2');
    generateSettings(config, paths);

    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content.hooks, 'Should have hooks section');
    assert.ok(content.hooks.UserPromptSubmit, 'Should have UserPromptSubmit hooks');
    assert.ok(content.hooks.SessionStart, 'Should have SessionStart hooks');
    assert.ok(content.hooks.PreToolUse, 'Should have PreToolUse hooks (TeamCreate + Edit/Write gates)');
    assert.ok(content.hooks.TaskCompleted, 'Should have TaskCompleted hooks');
    assert.ok(!content.hooks.PostToolUse, 'Should NOT have PostToolUse hooks (task-tool-warning removed)');
    assert.ok(!content.hooks.TeammateIdle, 'Should NOT have TeammateIdle hooks (dead capability removed)');
  });

  it('permissions.allow does not include Task', () => {
    const { config, paths } = makeProject('settings-no-task');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(!content.permissions.allow.includes('Task'), 'Task must not be in allow-list (structural enforcement)');
  });

  it('permissions.allow does not include TodoRead or TodoWrite', () => {
    const { config, paths } = makeProject('settings-no-todo');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(!content.permissions.allow.includes('TodoRead'), 'TodoRead must not be in allow-list');
    assert.ok(!content.permissions.allow.includes('TodoWrite'), 'TodoWrite must not be in allow-list');
  });

  it('permissions.allow contains TeamCreate', () => {
    const { config, paths } = makeProject('settings-teamcreate');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content.permissions.allow.includes('TeamCreate'), 'TeamCreate must be in allow-list');
  });

  it('env.AGENT_ROLE is set to orchestrator', () => {
    const { config, paths } = makeProject('settings-agent-role');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content.env, 'Should have env section');
    assert.equal(content.env.AGENT_ROLE, 'orchestrator', 'AGENT_ROLE env must be set to orchestrator');
  });

  it('permissions.defaultMode is acceptEdits (ADR-001)', () => {
    const { config, paths } = makeProject('settings-default-mode');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.equal(content.permissions.defaultMode, 'acceptEdits', 'defaultMode must be acceptEdits to reduce permission prompts per ADR-001');
  });

  it('permissions.deny blocks destructive patterns (ADR-001)', () => {
    const { config, paths } = makeProject('settings-deny-list');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(Array.isArray(content.permissions.deny), 'Should have deny array');
    const mustDeny = [
      'Bash(rm -rf /*)',
      'Bash(sudo*)',
      'Bash(git push --force*)',
      'Bash(git reset --hard*)',
      'Bash(chmod 777*)',
    ];
    for (const pattern of mustDeny) {
      assert.ok(content.permissions.deny.includes(pattern), 'deny list must include ' + pattern);
    }
  });

  it('creates file at correct path inside .claude/', () => {
    const { config, paths } = makeProject('settings-test-3');
    const result = generateSettings(config, paths);

    assert.ok(result.path.includes('.claude'), 'Should be inside .claude directory');
    assert.ok(result.path.endsWith('settings.json'), 'Should end with settings.json');
  });

  it('includes permissions section from template', () => {
    const { config, paths } = makeProject('settings-test-4');
    generateSettings(config, paths);

    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content.permissions, 'Should have permissions section');
    assert.ok(Array.isArray(content.permissions.allow), 'Should have allow array');
  });

  it('embeds _bmadGenerated hash in settings.json', () => {
    const { config, paths } = makeProject('settings-hash');
    generateSettings(config, paths);

    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content._bmadGenerated, 'Should have _bmadGenerated key');
    assert.match(content._bmadGenerated, /^[a-f0-9]{8}$/, 'Hash should be 8 hex chars');
  });

  it('skips writing when settings.json is manually modified', () => {
    const { config, paths } = makeProject('settings-modified');

    // First generation
    generateSettings(config, paths);

    // Manually modify: change a value but keep structure
    const parsed = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    parsed.customKey = 'user-added';
    writeFileSync(paths.settingsJson, JSON.stringify(parsed, null, 2) + '\n');

    // Second generation should detect modification and skip
    const result = generateSettings(config, paths);
    assert.equal(result.modified, true, 'Should detect manual modification');

    // Verify user's change is preserved
    const afterContent = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.equal(afterContent.customKey, 'user-added', 'User change should be preserved');
  });

  it('overwrites when force option is set', () => {
    const { config, paths } = makeProject('settings-force');

    // First generation
    generateSettings(config, paths);

    // Manually modify
    const parsed = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    parsed.customKey = 'user-added';
    writeFileSync(paths.settingsJson, JSON.stringify(parsed, null, 2) + '\n');

    // Force should overwrite
    const result = generateSettings(config, paths, { force: true });
    assert.equal(result.modified, false, 'Should overwrite when forced');

    // Verify user's change is gone
    const afterContent = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.equal(afterContent.customKey, undefined, 'User change should be removed');
  });

  it('returns modified: false on first generation', () => {
    const { config, paths } = makeProject('settings-first-gen');
    const result = generateSettings(config, paths);
    assert.equal(result.modified, false, 'First generation should not be marked as modified');
  });
});
