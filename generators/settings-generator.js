import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_TEMPLATES_DIR } from '../utils/paths.js';
import { writeFileSafe } from '../utils/fs-helpers.js';

/**
 * Generate .claude/settings.json from the package template.
 * @param {object} projectPaths - Project paths from getProjectPaths()
 * @returns {string} Path to the generated settings.json
 */
export function generateSettings(projectPaths) {
  const templatePath = join(PACKAGE_TEMPLATES_DIR, 'settings.json.template');
  const content = readFileSync(templatePath, 'utf8');
  writeFileSafe(projectPaths.settingsJson, content);
  return projectPaths.settingsJson;
}
