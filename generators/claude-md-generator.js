import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_TEMPLATES_DIR } from '../utils/paths.js';
import { AGENT_NAMES } from '../utils/config.js';
import { writeFileSafe, readFileSafe } from '../utils/fs-helpers.js';
import { render } from '../utils/template.js';

/**
 * Generate the project's CLAUDE.md file from the template and swarm.yaml config.
 *
 * @param {object} config - Parsed swarm.yaml config
 * @param {object} projectPaths - Project paths from getProjectPaths()
 * @returns {string} Path to the generated CLAUDE.md
 */
export function generateClaudeMd(config, projectPaths) {
  const templatePath = join(PACKAGE_TEMPLATES_DIR, 'CLAUDE.md.template');

  let template;
  if (existsSync(templatePath)) {
    template = readFileSync(templatePath, 'utf8');
  } else {
    // Fallback: generate from scratch if template not found
    template = buildDefaultTemplate();
  }

  // Build the data object for template rendering
  const data = buildTemplateData(config);

  // Render the template
  const content = render(template, data);

  writeFileSafe(projectPaths.claudeMd, content);
  return projectPaths.claudeMd;
}

/**
 * Build template data from swarm config.
 * @param {object} config - Parsed swarm.yaml config
 * @returns {object} Data for template rendering
 */
function buildTemplateData(config) {
  const enabledPhases = Object.entries(config.methodology.phases)
    .filter(([_, phase]) => phase.enabled)
    .map(([name]) => name);

  const enabledAgents = AGENT_NAMES.filter(name => {
    const agentConfig = config.agents?.[name];
    return agentConfig?.enabled !== false;
  });

  const stackParts = [];
  if (config.stack.language) stackParts.push(config.stack.language);
  if (config.stack.framework) stackParts.push(config.stack.framework);
  if (config.stack.database) stackParts.push(config.stack.database);

  return {
    project: config.project,
    stack: {
      ...config.stack,
      summary: stackParts.join(', ') || 'Not specified',
    },
    methodology: {
      ...config.methodology,
      quality: {
        ...config.methodology.quality,
        require_human_approval_list: config.methodology.quality.require_human_approval.join(', '),
      },
      autonomy_auto: config.methodology.autonomy === 'auto',
      autonomy_guided: config.methodology.autonomy === 'guided',
      autonomy_collaborative: config.methodology.autonomy === 'collaborative',
      enabledPhases: enabledPhases.join(', '),
      phaseCount: enabledPhases.length,
    },
    agents: {
      list: enabledAgents.join(', '),
      count: enabledAgents.length,
    },
    output: config.output,
    hasFramework: !!config.stack.framework,
    hasDatabase: !!config.stack.database,
    hasTesting: !!config.stack.testing,
  };
}

/**
 * Build a default CLAUDE.md template when the package template is missing.
 * @returns {string} Default template content
 */
function buildDefaultTemplate() {
  return `# {{project.name}}

## Project Overview

{{project.description}}

- **Type**: {{project.type}}
- **Stack**: {{stack.summary}}
{{#if hasFramework}}- **Framework**: {{stack.framework}}{{/if}}
{{#if hasDatabase}}- **Database**: {{stack.database}}{{/if}}
{{#if hasTesting}}- **Testing**: {{stack.testing}}{{/if}}

## BMAD Swarm

This project uses **BMAD Swarm** for autonomous development.

- **Autonomy**: {{methodology.autonomy}}
- **Active Phases**: {{methodology.enabledPhases}}
- **Agents**: {{agents.list}} ({{agents.count}} agents)

### Artifact Locations

All swarm artifacts are stored in \`{{output.artifacts_dir}}\`:

- \`{{output.artifacts_dir}}/exploration/\` - Research and analysis
- \`{{output.artifacts_dir}}/planning/\` - Product brief, PRD
- \`{{output.artifacts_dir}}/design/\` - Architecture, UX, ADRs
- \`{{output.artifacts_dir}}/implementation/\` - Stories, sprint status
- \`{{output.artifacts_dir}}/reviews/\` - Code reviews
- \`{{output.artifacts_dir}}/context/\` - Project context, decision log

Source code goes in \`{{output.code_dir}}\`.

### Quality Standards

- Tests required: {{methodology.quality.require_tests}}
- Code review required: {{methodology.quality.require_review}}
- Human approval required for: {{methodology.quality.require_human_approval_list}}

### Working with the Swarm

The **orchestrator** agent manages the development process. Tell it what you want to build and it will:
1. Assess complexity and determine the right team composition
2. Create a task graph with proper dependencies
3. Spawn specialist agents with curated context
4. Manage execution through quality gates
5. Report results and request decisions at appropriate points

The autonomy level is set to **{{methodology.autonomy}}**:
- **auto**: Swarm makes all decisions, reports results at the end
- **guided**: Swarm checks in at phase boundaries for approval
- **collaborative**: Swarm checks in frequently for key decisions
`;
}
