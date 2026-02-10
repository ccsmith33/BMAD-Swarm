import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverPluginAgents, mergeAgentNames } from '../utils/plugins.js';

describe('Plugin System', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-plugins-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers plugin agents from configured directory', () => {
    const projectRoot = join(tmpDir, 'with-plugins');
    const pluginDir = join(projectRoot, 'plugins', 'agents');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'custom-agent.md'), '# Custom Agent');
    writeFileSync(join(pluginDir, 'data-engineer.md'), '# Data Engineer');

    const config = {};
    const plugins = discoverPluginAgents(config, projectRoot);
    assert.equal(plugins.length, 2);
    assert.ok(plugins.some(p => p.name === 'custom-agent'));
    assert.ok(plugins.some(p => p.name === 'data-engineer'));
    assert.equal(plugins[0].source, 'plugin');
  });

  it('returns empty array when plugin directory does not exist', () => {
    const projectRoot = join(tmpDir, 'no-plugins');
    mkdirSync(projectRoot, { recursive: true });

    const plugins = discoverPluginAgents({}, projectRoot);
    assert.equal(plugins.length, 0);
  });

  it('respects custom agents_dir config', () => {
    const projectRoot = join(tmpDir, 'custom-dir');
    const customDir = join(projectRoot, 'my-agents');
    mkdirSync(customDir, { recursive: true });
    writeFileSync(join(customDir, 'special.md'), '# Special Agent');

    const config = { plugins: { agents_dir: 'my-agents' } };
    const plugins = discoverPluginAgents(config, projectRoot);
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0].name, 'special');
  });

  it('merges plugin agents with built-in names', () => {
    const builtIn = ['architect', 'developer', 'orchestrator'];
    const plugins = [
      { name: 'custom-agent', path: '/fake/custom-agent.md', source: 'plugin' },
      { name: 'data-engineer', path: '/fake/data-engineer.md', source: 'plugin' },
    ];

    const result = mergeAgentNames(builtIn, plugins);
    assert.equal(result.allNames.length, 5);
    assert.ok(result.allNames.includes('custom-agent'));
    assert.ok(result.allNames.includes('data-engineer'));
    assert.deepEqual(result.allNames, [...result.allNames].sort());
  });

  it('built-in agents take precedence over plugins with same name', () => {
    const builtIn = ['architect', 'developer'];
    const plugins = [
      { name: 'developer', path: '/fake/developer.md', source: 'plugin' },
      { name: 'custom', path: '/fake/custom.md', source: 'plugin' },
    ];

    const result = mergeAgentNames(builtIn, plugins);
    assert.equal(result.allNames.length, 3);
    assert.equal(result.plugins.length, 1);
    assert.equal(result.plugins[0].name, 'custom');
  });
});
