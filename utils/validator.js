import { AGENT_NAMES } from './config.js';

const VALID_PROJECT_TYPES = ['web-app', 'api', 'cli', 'library', 'mobile', 'monorepo', 'other'];
const VALID_AUTONOMY_LEVELS = ['auto', 'guided', 'collaborative'];

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
    for (const name of Object.keys(config.agents)) {
      if (!AGENT_NAMES.includes(name)) {
        errors.push(`agents.${name} is not a recognized agent. Valid agents: ${AGENT_NAMES.join(', ')}`);
      }
    }
  }

  return errors;
}
