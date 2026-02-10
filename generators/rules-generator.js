import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_TEMPLATES_DIR } from '../utils/paths.js';
import { writeGeneratedFile, isFileManuallyModified, ensureDir } from '../utils/fs-helpers.js';
import { render } from '../utils/template.js';

/**
 * Generate .claude/rules/ files from rule templates and swarm.yaml config.
 *
 * @param {object} config - Parsed swarm.yaml config
 * @param {object} projectPaths - Project paths from getProjectPaths()
 * @param {object} [options] - Options
 * @param {boolean} [options.force] - Overwrite even if manually modified
 * @returns {{ generated: string[], modified: string[] }} Result lists
 */
export function generateRules(config, projectPaths, options = {}) {
  ensureDir(projectPaths.rulesDir);

  const generated = [];
  const modified = [];

  const rulesTemplateDir = join(PACKAGE_TEMPLATES_DIR, 'rules');
  if (!existsSync(rulesTemplateDir)) {
    return { generated, modified };
  }

  const templateFiles = readdirSync(rulesTemplateDir)
    .filter(f => f.endsWith('.md'))
    .sort();

  const data = buildRulesTemplateData(config);

  for (const templateFile of templateFiles) {
    const outputPath = join(projectPaths.rulesDir, templateFile);

    // Check for manual modifications (unless --force)
    if (!options.force && isFileManuallyModified(outputPath)) {
      modified.push(templateFile);
      continue;
    }

    const templatePath = join(rulesTemplateDir, templateFile);
    const template = readFileSync(templatePath, 'utf8');
    const content = render(template, data);

    writeGeneratedFile(outputPath, content);
    generated.push(templateFile);
  }

  return { generated, modified };
}

/**
 * Build template data for rule templates.
 * @param {object} config - Parsed swarm.yaml config
 * @returns {object} Data for template rendering
 */
function buildRulesTemplateData(config) {
  return {
    project: config.project,
    stack: config.stack,
    methodology: {
      ...config.methodology,
      quality: {
        ...config.methodology.quality,
        require_human_approval_list: config.methodology.quality.require_human_approval.join(', '),
      },
    },
    output: config.output,
  };
}
