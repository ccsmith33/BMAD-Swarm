import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { validateConfig } from './validator.js';

/**
 * Load and parse a YAML file. Returns null if file doesn't exist.
 * @param {string} filePath - Absolute path to the YAML file
 * @returns {object|null} Parsed YAML content or null
 */
export function loadYaml(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf8');
  return yaml.load(content);
}

/**
 * Load the project's swarm.yaml configuration.
 * @param {string} swarmYamlPath - Path to swarm.yaml
 * @returns {object} Parsed config with defaults applied
 */
export function loadSwarmConfig(swarmYamlPath) {
  const raw = loadYaml(swarmYamlPath);
  if (!raw) {
    throw new Error(`swarm.yaml not found at ${swarmYamlPath}`);
  }
  const config = applyDefaults(raw);
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid swarm.yaml configuration:\n  - ${errors.join('\n  - ')}`);
  }
  return config;
}

/**
 * Apply default values to a raw swarm.yaml config.
 * @param {object} raw - Raw parsed YAML
 * @returns {object} Config with defaults filled in
 */
function applyDefaults(raw) {
  const config = { ...raw };

  // Project defaults
  config.project = config.project || {};
  config.project.name = config.project.name || 'my-project';
  config.project.type = config.project.type || 'other';

  // Stack defaults
  config.stack = config.stack || {};
  config.stack.language = config.stack.language || '';

  // Methodology defaults
  config.methodology = config.methodology || {};
  config.methodology.autonomy = config.methodology.autonomy || 'guided';

  config.methodology.phases = config.methodology.phases || {};
  const phaseNames = ['ideation', 'exploration', 'definition', 'design', 'implementation', 'delivery'];
  for (const phase of phaseNames) {
    config.methodology.phases[phase] = config.methodology.phases[phase] || {};
    if (config.methodology.phases[phase].enabled === undefined) {
      config.methodology.phases[phase].enabled = true;
    }
  }
  if (config.methodology.phases.implementation.parallel_devs === undefined) {
    config.methodology.phases.implementation.parallel_devs = 2;
  }

  config.methodology.quality = config.methodology.quality || {};
  if (config.methodology.quality.require_tests === undefined) {
    config.methodology.quality.require_tests = true;
  }
  if (config.methodology.quality.require_review === undefined) {
    config.methodology.quality.require_review = true;
  }
  if (!config.methodology.quality.require_human_approval) {
    config.methodology.quality.require_human_approval = ['prd', 'architecture'];
  }

  // Ideation defaults
  config.methodology.ideation = config.methodology.ideation || {};
  if (config.methodology.ideation.enabled === undefined) {
    config.methodology.ideation.enabled = true;
  }
  if (!config.methodology.ideation.default_perspectives) {
    config.methodology.ideation.default_perspectives = [
      'product-strategist',
      'technical-feasibility',
      'devils-advocate',
      'innovation',
    ];
  }

  // Agent defaults
  config.agents = config.agents || {};

  // Output defaults
  config.output = config.output || {};
  config.output.artifacts_dir = config.output.artifacts_dir || './artifacts';
  config.output.code_dir = config.output.code_dir || './src';

  return config;
}

let _agentNamesCache = null;

/**
 * Get list of all agent names by scanning the agents/ directory.
 * Results are cached for the lifetime of the process.
 * @returns {string[]}
 */
export function getAgentNames() {
  if (_agentNamesCache) return _agentNamesCache;
  const agentsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'agents');
  try {
    _agentNamesCache = readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort();
  } catch {
    console.warn('Warning: agents/ directory not found. No agents will be available.');
    _agentNamesCache = [];
  }
  return _agentNamesCache;
}

/**
 * @deprecated Use getAgentNames() instead
 */
export const AGENT_NAMES = (() => {
  // Eagerly evaluate for backward compat
  const agentsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'agents');
  try {
    return readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort();
  } catch {
    return [];
  }
})();
