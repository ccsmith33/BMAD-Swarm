import { getAgentNames } from './config.js';

const VALID_PROJECT_TYPES = ['web-app', 'api', 'cli', 'library', 'mobile', 'monorepo', 'other'];
const VALID_AUTONOMY_LEVELS = ['auto', 'guided', 'collaborative'];
const VALID_ISOLATION_VALUES = ['worktree', 'none'];
const VALID_TEAM_MODES = ['dynamic', 'fixed'];
const VALID_SPECIALIST_ROLES = ['developer', 'reviewer'];
const VALID_MODELS = ['haiku', 'sonnet', 'opus', 'inherit'];
// Single source of truth for domain slug shape. Also consumed by
// utils/domain-map.js (RT-1) so the parser and the validator agree.
export const DOMAIN_SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/**
 * Validate a swarm config object. Returns array of error strings.
 * @param {object} config - Config after defaults applied
 * @returns {string[]} Array of error messages (empty if valid)
 */
export function validateConfig(config) {
  const errors = [];

  // Project validation
  if (!config.project?.name || config.project.name.trim() === '') {
    errors.push('project.name is required and cannot be empty');
  }

  if (config.project?.type && !VALID_PROJECT_TYPES.includes(config.project.type)) {
    errors.push(`project.type "${config.project.type}" is invalid. Valid options: ${VALID_PROJECT_TYPES.join(', ')}`);
  }

  // Methodology validation
  if (config.methodology?.autonomy && !VALID_AUTONOMY_LEVELS.includes(config.methodology.autonomy)) {
    errors.push(`methodology.autonomy "${config.methodology.autonomy}" is invalid. Valid options: ${VALID_AUTONOMY_LEVELS.join(', ')}`);
  }

  // Phase validation
  if (config.methodology?.phases) {
    for (const [name, phase] of Object.entries(config.methodology.phases)) {
      if (phase.enabled !== undefined && typeof phase.enabled !== 'boolean') {
        errors.push(`methodology.phases.${name}.enabled must be a boolean, got ${typeof phase.enabled}: ${phase.enabled}`);
      }
    }

    const implPhase = config.methodology.phases.implementation;
    if (implPhase?.parallel_devs !== undefined) {
      if (!Number.isInteger(implPhase.parallel_devs) || implPhase.parallel_devs < 1) {
        errors.push(`methodology.phases.implementation.parallel_devs must be a positive integer, got: ${implPhase.parallel_devs}`);
      }
    }
  }

  // Quality validation
  if (config.methodology?.quality?.require_human_approval !== undefined) {
    if (!Array.isArray(config.methodology.quality.require_human_approval)) {
      errors.push(`methodology.quality.require_human_approval must be an array, got: ${typeof config.methodology.quality.require_human_approval}`);
    }
  }

  // Agent validation
  if (config.agents) {
    for (const [name, agentConfig] of Object.entries(config.agents)) {
      if (!getAgentNames().includes(name)) {
        errors.push(`agents.${name} is not a recognized agent. Valid agents: ${getAgentNames().join(', ')}`);
      }
      if (agentConfig?.isolation !== undefined && !VALID_ISOLATION_VALUES.includes(agentConfig.isolation)) {
        errors.push(`agents.${name}.isolation "${agentConfig.isolation}" is invalid. Valid options: ${VALID_ISOLATION_VALUES.join(', ')}`);
      }
    }
  }

  // Team block validation (D-005, ADR-004)
  if (config.team) {
    if (config.team.mode !== undefined && !VALID_TEAM_MODES.includes(config.team.mode)) {
      errors.push(`team.mode "${config.team.mode}" is invalid. Valid options: ${VALID_TEAM_MODES.join(', ')}`);
    }

    const specializations = config.team.specializations || [];

    if (config.team.mode === 'fixed' && specializations.length === 0) {
      errors.push('team.mode is "fixed" but team.specializations is empty');
    }

    const seenPairs = new Set();
    for (let i = 0; i < specializations.length; i++) {
      const spec = specializations[i];
      const prefix = `team.specializations[${i}]`;

      if (!VALID_SPECIALIST_ROLES.includes(spec.role)) {
        errors.push(`${prefix}.role "${spec.role}" is invalid. Only developer and reviewer are valid v1 specialist roles.`);
      }

      if (typeof spec.domain !== 'string' || !DOMAIN_SLUG_RE.test(spec.domain)) {
        errors.push(`${prefix}.domain "${spec.domain}" is invalid. Domain must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$ (kebab-case, no leading/trailing hyphen)`);
      }

      if (spec.model !== undefined && !VALID_MODELS.includes(spec.model)) {
        errors.push(`${prefix}.model "${spec.model}" is invalid. Valid options: ${VALID_MODELS.join(', ')}`);
      }

      const pairKey = `${spec.role}::${spec.domain}`;
      if (seenPairs.has(pairKey)) {
        errors.push(`${prefix} duplicate (role, domain) pair: (${spec.role}, ${spec.domain}) — the (role, domain) pair must be unique across team.specializations`);
      }
      seenPairs.add(pairKey);
    }

    if (config.team.fallback?.model !== undefined && !VALID_MODELS.includes(config.team.fallback.model)) {
      errors.push(`team.fallback.model "${config.team.fallback.model}" is invalid. Valid options: ${VALID_MODELS.join(', ')}`);
    }

    if (config.team.mode === 'fixed' && config.team.fallback?.enabled === false) {
      console.warn('Warning: fallback disabled in fixed mode — stories whose domain does not match any specialist will not be routable.');
    }
  }

  return errors;
}
