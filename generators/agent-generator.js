import { readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { PACKAGE_AGENTS_DIR } from '../utils/paths.js';
import { getAgentNames } from '../utils/config.js';
import { writeFileSafe, ensureDir, readFileSafe, writeGeneratedFile, isFileManuallyModified } from '../utils/fs-helpers.js';
import { rewriteScaffoldPaths } from '../utils/scaffold-paths.js';

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

    // Layer 3: If ejected override exists, it replaces the BODY, not the
    // registration envelope (F-016 fix). The ejected content still gets the
    // swarm.yaml overrides, the team task protocol, and the identity
    // frontmatter — otherwise the output has no name/description and Claude
    // Code cannot register it as a spawnable agent (ADR-014, D-029).
    if (existsSync(ejectedPath)) {
      let ejectedContent = stripEjectedHeader(readFileSync(ejectedPath, 'utf8'));
      ejectedContent = applyAgentOverrides(ejectedContent, agentConfig || {}, agentName, config);
      if (agentName !== 'orchestrator' && !ejectedContent.includes('## Team task protocol')) {
        ejectedContent += TEAM_TASK_PROTOCOL;
      }
      ejectedContent = applyIdentityFrontmatter(ejectedContent, agentName);
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

    // Layer 2: Apply swarm.yaml overrides (always run so defaults.model applies even without per-agent config)
    content = applyAgentOverrides(content, agentConfig || {}, agentName, config);

    // Teammates get the single wake-channel task protocol (D-028 item 0).
    // The orchestrator is excluded: it ASSIGNS tasks, it never claims them.
    if (agentName !== 'orchestrator') {
      content += TEAM_TASK_PROTOCOL;
    }

    // Self-containment (CB-1): rewrite repo-relative methodology/agent
    // references to the shipped scaffold layout so they resolve inside a user
    // project. Applied to the body before the frontmatter is prepended.
    content = rewriteScaffoldPaths(content);

    // Registration identity (ADR-014): name + description make the file a
    // valid Claude Code custom agent definition, spawnable via
    // subagent_type. Applied last so they are the leading frontmatter keys.
    content = applyIdentityFrontmatter(content, agentName);

    writeGeneratedFile(outputPath, content);
    generated.push(agentName);
  }

  return { generated, skipped, modified };
}

// Injected into every generated teammate (not the orchestrator). Overrides
// the platform default that tells teammates to self-claim unblocked tasks
// from TaskList — orchestrator-assigned ownership is the single wake channel
// (D-028 item 0; kills the "task already done" double-trigger).
const TEAM_TASK_PROTOCOL = `

## Team task protocol

Orchestrator-assigned ownership is the single wake channel for tasks (this overrides any platform guidance about claiming available tasks):

- Never self-claim tasks from TaskList. Work only tasks the orchestrator assigned to you.
- **Wake-ack (RES-3): the moment you receive your start message, your FIRST tool call is \`TaskUpdate\` → \`in_progress\` on your task.** This is not a formality — a hook writes that transition to the durable task ledger, and reconciliation treats a \`pending\` task with no \`in_progress\` row as never-woken and re-wakes it. Ack first, then work, so a crash mid-task is recoverable and you are never spuriously re-pinged.
- After completing a task, send your completion message and go idle — do not claim further work.
- Peer-to-peer messages to other teammates for technical questions are encouraged; task ownership changes are not.
`;

/**
 * Apply registration-identity frontmatter (ADR-014): `name` and
 * `description` are required for Claude Code to register the file as a
 * custom agent definition (spawnable via subagent_type). The description is
 * deliberately defensive so Claude does not auto-delegate to these agents
 * outside the orchestrated team flow. Keys are prepended so they lead the
 * frontmatter block; templates never define them, so no duplication arises.
 * @param {string} content - Agent file content (frontmatter optional)
 * @param {string} agentName - Agent role name (kebab/lowercase)
 * @returns {string} Content with name/description leading the frontmatter
 */
export function applyIdentityFrontmatter(content, agentName) {
  const role = agentName.charAt(0).toUpperCase() + agentName.slice(1);
  const fields = `name: ${agentName}\ndescription: "${role} teammate for bmad-swarm orchestrated work — spawned by the orchestrator via the team flow. Not for ad-hoc delegation."`;
  if (content.startsWith('---\n')) {
    const endIdx = content.indexOf('\n---\n', 4);
    if (endIdx !== -1) {
      // An ejected/custom file may already carry its own identity keys;
      // prepending a second name: would produce duplicate-key frontmatter.
      if (/^name:\s*\S/m.test(content.slice(4, endIdx))) {
        return content;
      }
      return `---\n${fields}\n${content.slice(4)}`;
    }
  }
  return `---\n${fields}\n---\n${content}`;
}

// Matches the provenance comments ejectAgent writes (both the pre-fix
// placement above the frontmatter and the current placement below it).
const EJECTED_HEADER_RE = /^<!-- (?:EJECTED from|To return to package version)[^\n]*-->\n?/gm;

/**
 * Remove ejectAgent's provenance comment lines so the ejected content can be
 * treated as a plain agent body during generation.
 * @param {string} content - Ejected agent file content
 * @returns {string}
 */
export function stripEjectedHeader(content) {
  return content.replace(EJECTED_HEADER_RE, '').replace(/^\n+/, '');
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

  // Add model as YAML frontmatter. Prefer agent override, fall back to config.defaults.model.
  const effectiveModel = agentConfig.model || config.defaults?.model;
  if (effectiveModel) {
    content = applyModelFrontmatter(content, effectiveModel);
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

  // Keep any frontmatter as the first bytes of the file (F-016): a comment
  // above the fence would break agent registration if the file were ever
  // consumed verbatim.
  let ejectedContent;
  if (content.startsWith('---\n')) {
    const endIdx = content.indexOf('\n---\n', 4);
    if (endIdx !== -1) {
      const fmEnd = endIdx + '\n---\n'.length;
      ejectedContent = content.slice(0, fmEnd) + header + content.slice(fmEnd);
    }
  }
  if (ejectedContent === undefined) {
    ejectedContent = header + content;
  }

  ensureDir(projectPaths.overridesAgentsDir);
  writeFileSafe(ejectedPath, ejectedContent);

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
