import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * Discover plugin agents from a configurable directory.
 * Plugin agents are user-defined .md files that extend the built-in agent set.
 *
 * @param {object} config - Parsed swarm.yaml config
 * @param {string} projectRoot - Project root directory
 * @returns {object[]} Array of { name, path, source: 'plugin' }
 */
export function discoverPluginAgents(config, projectRoot) {
  const pluginDir = config.plugins?.agents_dir || 'plugins/agents';
  const absDir = join(projectRoot, pluginDir);

  if (!existsSync(absDir)) return [];

  const files = readdirSync(absDir).filter(f => f.endsWith('.md'));
  return files.map(f => ({
    name: f.replace('.md', ''),
    path: join(absDir, f),
    source: 'plugin',
  }));
}

/**
 * Load a plugin agent's content.
 * @param {string} pluginPath - Absolute path to the plugin agent .md file
 * @returns {string} File content
 */
export function loadPluginAgent(pluginPath) {
  return readFileSync(pluginPath, 'utf8');
}

/**
 * Merge plugin agents with built-in agent names.
 * Built-in agents take precedence (plugins with the same name are ignored).
 *
 * @param {string[]} builtInNames - Array of built-in agent names
 * @param {object[]} pluginAgents - Array from discoverPluginAgents()
 * @returns {{ allNames: string[], plugins: object[] }} Merged names and active plugins
 */
export function mergeAgentNames(builtInNames, pluginAgents) {
  const builtInSet = new Set(builtInNames);
  const activePlugins = pluginAgents.filter(p => !builtInSet.has(p.name));
  const pluginNames = activePlugins.map(p => p.name);
  const allNames = [...builtInNames, ...pluginNames].sort();
  return { allNames, plugins: activePlugins };
}
