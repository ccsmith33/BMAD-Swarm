import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Root of the @bmad/swarm package */
export const PACKAGE_ROOT = resolve(__dirname, '..');

/** Path to package agent templates */
export const PACKAGE_AGENTS_DIR = join(PACKAGE_ROOT, 'agents');

/** Path to package methodology content */
export const PACKAGE_METHODOLOGY_DIR = join(PACKAGE_ROOT, 'methodology');

/** Path to package templates */
export const PACKAGE_TEMPLATES_DIR = join(PACKAGE_ROOT, 'templates');

/** Path to package generators */
export const PACKAGE_GENERATORS_DIR = join(PACKAGE_ROOT, 'generators');

/**
 * Resolve project-level paths relative to a project root directory.
 * @param {string} projectRoot - The root directory of the user's project
 * @returns {object} All relevant project paths
 */
export function getProjectPaths(projectRoot) {
  const root = resolve(projectRoot);
  return {
    root,
    swarmYaml: join(root, 'swarm.yaml'),
    claudeDir: join(root, '.claude'),
    agentsDir: join(root, '.claude', 'agents'),
    hooksDir: join(root, '.claude', 'hooks'),
    settingsJson: join(root, '.claude', 'settings.json'),
    rulesDir: join(root, '.claude', 'rules'),
    systemPrompt: join(root, '.claude', 'system-prompt.txt'),
    claudeMd: join(root, 'CLAUDE.md'),
    overridesDir: join(root, 'overrides'),
    overridesAgentsDir: join(root, 'overrides', 'agents'),
    overridesMethodologyDir: join(root, 'overrides', 'methodology'),
    artifactsDir: join(root, 'artifacts'),
    projectYaml: join(root, 'project.yaml'),
  };
}
