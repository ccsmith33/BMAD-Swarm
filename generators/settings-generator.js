import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_TEMPLATES_DIR } from '../utils/paths.js';
import { writeFileSafe } from '../utils/fs-helpers.js';
import { getHooksConfig } from './hooks-generator.js';

/**
 * Generate .claude/settings.json from the package template,
 * merging in the hooks configuration from the hooks generator.
 * @param {object} projectPaths - Project paths from getProjectPaths()
 * @returns {string} Path to the generated settings.json
 */
export function generateSettings(projectPaths) {
  const templatePath = join(PACKAGE_TEMPLATES_DIR, 'settings.json.template');
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));

  // Hooks come exclusively from the hooks generator (single source of truth)
  template.hooks = getHooksConfig();

  const content = JSON.stringify(template, null, 2) + '\n';
  writeFileSafe(projectPaths.settingsJson, content);
  return projectPaths.settingsJson;
}
