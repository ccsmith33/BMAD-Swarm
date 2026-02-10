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

  it('generates valid JSON settings file', () => {
    const projectDir = join(tmpDir, 'settings-test-1');
    mkdirSync(projectDir, { recursive: true });

    const configPath = join(projectDir, 'swarm.yaml');
    writeFileSync(configPath, 'project:\n  name: test\nstack:\n  language: JS\n');

    const config = loadSwarmConfig(configPath);
    const paths = getProjectPaths(projectDir);
    const resultPath = generateSettings(paths);

    assert.ok(existsSync(resultPath), 'settings.json should exist');
    assert.equal(resultPath, paths.settingsJson, 'Should return the correct path');

    const content = readFileSync(resultPath, 'utf8');
    const parsed = JSON.parse(content);
    assert.ok(typeof parsed === 'object', 'Should be valid JSON object');
  });

  it('includes hooks configuration', () => {
    const projectDir = join(tmpDir, 'settings-test-2');
    mkdirSync(projectDir, { recursive: true });

    const configPath = join(projectDir, 'swarm.yaml');
    writeFileSync(configPath, 'project:\n  name: test\nstack:\n  language: JS\n');

    const config = loadSwarmConfig(configPath);
    const paths = getProjectPaths(projectDir);
    generateSettings(paths);

    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content.hooks, 'Should have hooks section');
    assert.ok(content.hooks.PostToolUse, 'Should have PostToolUse hooks');
    assert.ok(content.hooks.Stop, 'Should have Stop hooks');
    assert.ok(content.hooks.SessionStart, 'Should have SessionStart hooks');
  });

  it('creates file at correct path inside .claude/', () => {
    const projectDir = join(tmpDir, 'settings-test-3');
    mkdirSync(projectDir, { recursive: true });

    const configPath = join(projectDir, 'swarm.yaml');
    writeFileSync(configPath, 'project:\n  name: test\nstack:\n  language: JS\n');

    const config = loadSwarmConfig(configPath);
    const paths = getProjectPaths(projectDir);
    const resultPath = generateSettings(paths);

    assert.ok(resultPath.includes('.claude'), 'Should be inside .claude directory');
    assert.ok(resultPath.endsWith('settings.json'), 'Should end with settings.json');
  });

  it('includes permissions section from template', () => {
    const projectDir = join(tmpDir, 'settings-test-4');
    mkdirSync(projectDir, { recursive: true });

    const configPath = join(projectDir, 'swarm.yaml');
    writeFileSync(configPath, 'project:\n  name: test\nstack:\n  language: JS\n');

    const config = loadSwarmConfig(configPath);
    const paths = getProjectPaths(projectDir);
    generateSettings(paths);

    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content.permissions, 'Should have permissions section');
    assert.ok(Array.isArray(content.permissions.allow), 'Should have allow array');
  });
});
