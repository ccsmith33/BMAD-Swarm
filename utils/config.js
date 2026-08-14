import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { validateConfig, DEFAULT_MODEL } from './validator.js';

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

  // Permissions defaults (ADR-017 Amendment 1). The project-aware orchestrator
  // allow-list block. Only default when ABSENT — a present-but-malformed value
  // (e.g. a non-array) is left intact so validateConfig can reject it loudly
  // rather than being silently replaced with an empty list.
  config.permissions = config.permissions || {};
  if (config.permissions.orchestrator_allow === undefined) {
    config.permissions.orchestrator_allow = [];
  }

  // Output defaults
  config.output = config.output || {};
  config.output.artifacts_dir = config.output.artifacts_dir || './artifacts';
  config.output.code_dir = config.output.code_dir || './src';

  // Default model: opus for every teammate unless overridden per-agent
  config.defaults = config.defaults || {};
  if (!config.defaults.model) config.defaults.model = DEFAULT_MODEL;

  // Replay gate defaults (ADR-022 / D-049). Safe-by-default: an absent block or
  // empty allow-list means NO command ever runs — the gate still stats paths and
  // resolves citations, but refuses (never executes) any command. The pinned
  // engine bin/replay-check.cjs reads swarm.yaml directly and carries the same
  // defaults; these mirror it so package-side consumers see one shape (D-036).
  config.replay = config.replay || {};
  if (!Array.isArray(config.replay.allowed_commands)) {
    config.replay.allowed_commands = ['npm test', 'npm run test', 'node --test'];
  }
  if (config.replay.timeout_seconds === undefined) config.replay.timeout_seconds = 300;
  if (!config.replay.url_citations) config.replay.url_citations = 'advisory';
  if (!Array.isArray(config.replay.gated_task_classes)) {
    config.replay.gated_task_classes = ['story', 'bug-fix', 'review'];
  }
  if (!config.replay.gated_owner_pattern) {
    config.replay.gated_owner_pattern = '^(dev|reviewer|security)';
  }

  // Delivery / auto-heal defaults (F-29/F-30). `auto_heal` governs what the
  // fresh-SessionStart drift check does when the scaffold's version stamp lags
  // the installed package: `offer` (default — surface a one-line update prompt,
  // regenerate nothing), `auto` (run `bmad-swarm update` at the fresh-start safe
  // window), or `off`. Default `offer` is the safe choice: it cannot hot-swap a
  // running session's hooks (live-swap hazard, D-045) because it writes nothing.
  config.delivery = config.delivery || {};
  if (!config.delivery.auto_heal) config.delivery.auto_heal = 'offer';

  // Team block defaults (wide-team specialization — D-005, ADR-004)
  config.team = config.team || {};
  config.team.mode = config.team.mode || 'dynamic';
  config.team.specializations = config.team.specializations || [];
  config.team.fallback = config.team.fallback || {};
  if (config.team.fallback.enabled === undefined) config.team.fallback.enabled = true;
  config.team.fallback.role = config.team.fallback.role || 'developer';
  config.team.fallback.model = config.team.fallback.model || config.defaults.model;
  for (const spec of config.team.specializations) {
    spec.model = spec.model || config.defaults.model;
    if (spec.description === undefined) spec.description = '';
  }

  return config;
}

/**
 * Return the normalized `team` view of a parsed config.
 * Used by the orchestrator-write-gate hook (Story WT-5) to look up routing
 * info without re-implementing defaults logic.
 * @param {object} config - Config after defaults applied
 * @returns {{mode: string, specializations: object[], fallback: {enabled: boolean, role: string, model: string}}}
 */
export function getTeamConfig(config) {
  return config.team;
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

