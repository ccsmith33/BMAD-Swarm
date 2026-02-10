import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';

const PHASE_ORDER = ['not-started', 'ideation', 'exploration', 'definition', 'design', 'implementation', 'delivery', 'complete'];

/**
 * Get current phase from project.yaml
 * @param {string} projectYamlPath
 * @returns {{ phase: string, history: Array }}
 */
export function getCurrentPhase(projectYamlPath) {
  if (!existsSync(projectYamlPath)) {
    throw new Error(`project.yaml not found at ${projectYamlPath}`);
  }
  const content = yaml.load(readFileSync(projectYamlPath, 'utf8'));
  return {
    phase: content.phase || 'not-started',
    history: content.phase_history || [],
  };
}

/**
 * Get available transitions from current phase
 * @param {string} currentPhase
 * @returns {string[]}
 */
export function getAvailableTransitions(currentPhase) {
  const idx = PHASE_ORDER.indexOf(currentPhase);
  if (idx === -1) return PHASE_ORDER.slice(1);
  if (idx >= PHASE_ORDER.length - 1) return [];
  return [PHASE_ORDER[idx + 1]];
}

/**
 * Advance to the next phase
 * @param {string} projectYamlPath
 * @param {object} options - { force: boolean }
 * @returns {{ from: string, to: string }}
 */
export function advancePhase(projectYamlPath, options = {}) {
  const content = yaml.load(readFileSync(projectYamlPath, 'utf8'));
  const currentPhase = content.phase || 'not-started';
  const transitions = getAvailableTransitions(currentPhase);

  if (transitions.length === 0) {
    throw new Error(`Cannot advance from "${currentPhase}" - already at final phase`);
  }

  const nextPhase = transitions[0];
  return setPhase(projectYamlPath, nextPhase, options);
}

/**
 * Set phase to a specific value
 * @param {string} projectYamlPath
 * @param {string} targetPhase
 * @param {object} options - { force: boolean }
 * @returns {{ from: string, to: string }}
 */
export function setPhase(projectYamlPath, targetPhase, options = {}) {
  if (!PHASE_ORDER.includes(targetPhase) && !options.force) {
    throw new Error(`Invalid phase "${targetPhase}". Valid phases: ${PHASE_ORDER.join(', ')}`);
  }

  const content = yaml.load(readFileSync(projectYamlPath, 'utf8'));
  const from = content.phase || 'not-started';
  const now = new Date().toISOString();

  // Update history
  if (!content.phase_history) content.phase_history = [];
  if (from !== targetPhase) {
    // Close current phase
    const lastEntry = content.phase_history[content.phase_history.length - 1];
    if (lastEntry && !lastEntry.exited_at) {
      lastEntry.exited_at = now;
    }
    // Open new phase
    content.phase_history.push({ phase: targetPhase, entered_at: now, exited_at: null });
  }

  content.phase = targetPhase;
  content.last_updated = now;

  writeFileSync(projectYamlPath, yaml.dump(content, { lineWidth: 120, noRefs: true }));
  return { from, to: targetPhase };
}

export { PHASE_ORDER };
