import { readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { PACKAGE_AGENTS_DIR } from '../utils/paths.js';
import { getAgentNames } from '../utils/config.js';
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

  for (const agentName of getAgentNames()) {
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

  // Add model as YAML frontmatter if specified
  if (agentConfig.model) {
    content = applyModelFrontmatter(content, agentConfig.model);
  }

  // Add isolation as YAML frontmatter if specified
  if (agentConfig.isolation) {
    content = applyFrontmatterField(content, 'isolation', agentConfig.isolation);
  }

  return content;
}

/**
 * Apply a YAML frontmatter key/value to content.
 * If content already has frontmatter with the key: replaces the value.
 * If content has frontmatter without the key: appends the key.
 * If content has no frontmatter: prepends a new frontmatter block.
 * @param {string} content - Agent file content
 * @param {string} key - YAML key to set
 * @param {string} value - Value to assign
 * @returns {string} Content with frontmatter field applied
 */
export function applyFrontmatterField(content, key, value) {
  if (content.startsWith('---\n')) {
    const endIdx = content.indexOf('\n---\n', 4);
    if (endIdx !== -1) {
      const existingFm = content.slice(4, endIdx);
      const rest = content.slice(endIdx + 5);
      const keyRegex = new RegExp(`^${key}:\\s*.*`, 'm');
      if (keyRegex.test(existingFm)) {
        const updatedFm = existingFm.replace(new RegExp(`^${key}:\\s*.*$`, 'm'), `${key}: ${value}`);
        return `---\n${updatedFm}\n---\n${rest}`;
      }
      return `---\n${existingFm}\n${key}: ${value}\n---\n${rest}`;
    }
  }
  return `---\n${key}: ${value}\n---\n${content}`;
}

/**
 * Apply a model field to content as YAML frontmatter.
 * Thin wrapper around applyFrontmatterField for the 'model' key.
 * @param {string} content - Agent file content
 * @param {string} model - Model value (e.g., 'sonnet', 'opus', 'haiku')
 * @returns {string} Content with model frontmatter applied
 */
export function applyModelFrontmatter(content, model) {
  return applyFrontmatterField(content, 'model', model);
}

/**
 * Copy a package agent to the overrides directory (eject).
 * @param {string} agentName - Name of the agent to eject
 * @param {object} projectPaths - Project paths
 * @returns {string} Path to the ejected file
 */
export function ejectAgent(agentName, projectPaths) {
  if (!getAgentNames().includes(agentName)) {
    throw new Error(`Unknown agent: "${agentName}". Valid agents: ${getAgentNames().join(', ')}`);
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
  if (!getAgentNames().includes(agentName)) {
    throw new Error(`Unknown agent: "${agentName}". Valid agents: ${getAgentNames().join(', ')}`);
  }

  const ejectedPath = join(projectPaths.overridesAgentsDir, `${agentName}.md`);
  if (!existsSync(ejectedPath)) {
    throw new Error(`Agent "${agentName}" is not ejected (no file at ${ejectedPath})`);
  }

  unlinkSync(ejectedPath);
}
