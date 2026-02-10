import { readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { PACKAGE_AGENTS_DIR } from '../utils/paths.js';
import { AGENT_NAMES } from '../utils/config.js';
import { writeFileSafe, ensureDir, readFileSafe, writeGeneratedFile, isFileManuallyModified } from '../utils/fs-helpers.js';

/**
 * Generate .claude/agents/ files by merging:
 *   Layer 1: Package agent templates (src/agents/*.md)
 *   Layer 2: swarm.yaml agent overrides (extra_context, extra_rules)
 *   Layer 3: Ejected overrides (overrides/agents/*.md) - full replacement
 *
 * @param {object} config - Parsed swarm.yaml config
 * @param {object} projectPaths - Project paths from getProjectPaths()
 * @param {object} [options] - Options
 * @param {boolean} [options.force] - Overwrite even if manually modified
 * @returns {object} Result with generated, skipped (ejected), and modified (manually changed) lists
 */
export function generateAgents(config, projectPaths, options = {}) {
  ensureDir(projectPaths.agentsDir);

  const generated = [];
  const skipped = [];
  const modified = [];

  for (const agentName of AGENT_NAMES) {
    // Check if agent is disabled in config
    const agentConfig = config.agents?.[agentName];
    if (agentConfig?.enabled === false) {
      continue;
    }

    const outputPath = join(projectPaths.agentsDir, `${agentName}.md`);
    const ejectedPath = join(projectPaths.overridesAgentsDir, `${agentName}.md`);

    // Layer 3: If ejected override exists, use it directly (don't overwrite)
    if (existsSync(ejectedPath)) {
      const ejectedContent = readFileSync(ejectedPath, 'utf8');
      writeFileSafe(outputPath, ejectedContent);
      skipped.push(agentName);
      continue;
    }

    // Check for manual modifications (unless --force)
    if (!options.force && isFileManuallyModified(outputPath)) {
      modified.push(agentName);
      continue;
    }

    // Layer 1: Load package base template
    const packageTemplatePath = join(PACKAGE_AGENTS_DIR, `${agentName}.md`);
    if (!existsSync(packageTemplatePath)) {
      console.warn(`Warning: No package template found for agent "${agentName}"`);
      continue;
    }
    let content = readFileSync(packageTemplatePath, 'utf8');

    // Layer 2: Apply swarm.yaml overrides
    if (agentConfig) {
      content = applyAgentOverrides(content, agentConfig, agentName, config);
    }

    // Inject project context section
    content = injectProjectContext(content, config);

    writeGeneratedFile(outputPath, content);
    generated.push(agentName);
  }

  return { generated, skipped, modified };
}

/**
 * Apply swarm.yaml agent-level overrides to an agent template.
 * @param {string} content - Base agent template content
 * @param {object} agentConfig - Agent-specific config from swarm.yaml
 * @param {string} agentName - Name of the agent
 * @param {object} config - Full swarm config
 * @returns {string} Modified content
 */
function applyAgentOverrides(content, agentConfig, agentName, config) {
  // Append extra_context if provided
  if (agentConfig.extra_context) {
    content += `\n\n## Project-Specific Context\n\n${agentConfig.extra_context}\n`;
  }

  // Append extra_rules if provided
  if (agentConfig.extra_rules && agentConfig.extra_rules.length > 0) {
    content += `\n\n## Additional Rules\n\n`;
    for (const rule of agentConfig.extra_rules) {
      content += `- ${rule}\n`;
    }
  }

  // Add model preference as a comment if specified
  if (agentConfig.model) {
    content = `<!-- preferred-model: ${agentConfig.model} -->\n${content}`;
  }

  return content;
}

/**
 * Inject project context into agent template (project name, type, stack info).
 * Strips any existing Project Info section first to prevent duplicates.
 * @param {string} content - Agent template content
 * @param {object} config - Full swarm config
 * @returns {string} Content with project context injected
 */
function injectProjectContext(content, config) {
  // Strip any existing Project Info section(s) to prevent duplicates.
  // Project Info is always the last section, so strip from first occurrence to EOF.
  content = content.replace(/\n+## Project Info\n[\s\S]*$/, '');
  // Remove trailing whitespace left after stripping
  content = content.trimEnd();

  const contextLines = [];
  contextLines.push(`## Project Info`);
  contextLines.push('');
  contextLines.push(`- **Project**: ${config.project.name}`);
  if (config.project.description) {
    contextLines.push(`- **Description**: ${config.project.description}`);
  }
  contextLines.push(`- **Type**: ${config.project.type}`);
  if (config.stack.language) {
    contextLines.push(`- **Language**: ${config.stack.language}`);
  }
  if (config.stack.framework) {
    contextLines.push(`- **Framework**: ${config.stack.framework}`);
  }
  if (config.stack.database) {
    contextLines.push(`- **Database**: ${config.stack.database}`);
  }
  contextLines.push(`- **Artifacts**: ${config.output.artifacts_dir}`);
  contextLines.push(`- **Code**: ${config.output.code_dir}`);
  contextLines.push(`- **Autonomy**: ${config.methodology.autonomy}`);

  return content + '\n\n' + contextLines.join('\n') + '\n';
}

/**
 * Copy a package agent to the overrides directory (eject).
 * @param {string} agentName - Name of the agent to eject
 * @param {object} projectPaths - Project paths
 * @returns {string} Path to the ejected file
 */
export function ejectAgent(agentName, projectPaths) {
  if (!AGENT_NAMES.includes(agentName)) {
    throw new Error(`Unknown agent: "${agentName}". Valid agents: ${AGENT_NAMES.join(', ')}`);
  }

  const packageTemplatePath = join(PACKAGE_AGENTS_DIR, `${agentName}.md`);
  if (!existsSync(packageTemplatePath)) {
    throw new Error(`No package template found for agent "${agentName}"`);
  }

  const ejectedPath = join(projectPaths.overridesAgentsDir, `${agentName}.md`);
  if (existsSync(ejectedPath)) {
    throw new Error(`Agent "${agentName}" is already ejected at ${ejectedPath}`);
  }

  const content = readFileSync(packageTemplatePath, 'utf8');
  const header = `<!-- EJECTED from @bmad/swarm - this file takes priority over the package version -->\n<!-- To return to package version, run: bmad-swarm uneject agent ${agentName} -->\n\n`;

  ensureDir(projectPaths.overridesAgentsDir);
  writeFileSafe(ejectedPath, header + content);

  return ejectedPath;
}

/**
 * Remove an ejected agent override (uneject).
 * @param {string} agentName - Name of the agent to uneject
 * @param {object} projectPaths - Project paths
 */
export function unejectAgent(agentName, projectPaths) {
  if (!AGENT_NAMES.includes(agentName)) {
    throw new Error(`Unknown agent: "${agentName}". Valid agents: ${AGENT_NAMES.join(', ')}`);
  }

  const ejectedPath = join(projectPaths.overridesAgentsDir, `${agentName}.md`);
  if (!existsSync(ejectedPath)) {
    throw new Error(`Agent "${agentName}" is not ejected (no file at ${ejectedPath})`);
  }

  unlinkSync(ejectedPath);
}
