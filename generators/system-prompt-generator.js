import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_TEMPLATES_DIR } from '../utils/paths.js';
import { writeGeneratedFile, isFileManuallyModified } from '../utils/fs-helpers.js';
import { render } from '../utils/template.js';

/**
 * Generate the project's .claude/system-prompt.txt file from the template and swarm.yaml config.
 *
 * @param {object} config - Parsed swarm.yaml config
 * @param {object} projectPaths - Project paths from getProjectPaths()
 * @param {object} [options] - Options
 * @param {boolean} [options.force] - Overwrite even if manually modified
 * @returns {{ path: string, modified: boolean }} Path and whether it was skipped
 */
export function generateSystemPrompt(config, projectPaths, options = {}) {
  // Check for manual modifications (unless --force)
  if (!options.force && isFileManuallyModified(projectPaths.systemPrompt)) {
    return { path: projectPaths.systemPrompt, modified: true };
  }

  const templatePath = join(PACKAGE_TEMPLATES_DIR, 'system-prompt.txt.template');

  let template;
  if (existsSync(templatePath)) {
    template = readFileSync(templatePath, 'utf8');
  } else {
    // Fallback: minimal system prompt if template not found
    template = 'You are the orchestrator. Coordinate all work by delegating to specialist agents.\n';
  }

  // Build the data object for template rendering (supports future template variables)
  const data = buildTemplateData(config);

  // Render the template
  const content = render(template, data);

  writeGeneratedFile(projectPaths.systemPrompt, content);
  return { path: projectPaths.systemPrompt, modified: false };
}

/**
 * Build template data from swarm config.
 * @param {object} config - Parsed swarm.yaml config
 * @returns {object} Data for template rendering
 */
function buildTemplateData(config) {
  return {
    project: config.project,
    stack: config.stack,
    methodology: {
      ...config.methodology,
      quality: {
        ...config.methodology.quality,
        require_human_approval_list: config.methodology.quality.require_human_approval.join(', '),
      },
      autonomy_auto: config.methodology.autonomy === 'auto',
      autonomy_guided: config.methodology.autonomy === 'guided',
      autonomy_collaborative: config.methodology.autonomy === 'collaborative',
    },
    output: config.output,
  };
}
