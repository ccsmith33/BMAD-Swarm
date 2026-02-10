// NOTE: This module is not yet wired into the CLI. It is intended for future workspace/monorepo support.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { loadYaml } from './config.js';

/**
 * Discover workspaces in a monorepo project.
 * Looks for swarm.yaml files in subdirectories listed in the root swarm.yaml
 * or auto-discovered from common monorepo patterns.
 *
 * @param {string} rootDir - Root directory of the monorepo
 * @param {object} rootConfig - Parsed root swarm.yaml config
 * @returns {object[]} Array of { name, path, config }
 */
export function discoverWorkspaces(rootDir, rootConfig) {
  const workspaces = [];
  const workspacePaths = rootConfig.workspaces || [];

  for (const wsPath of workspacePaths) {
    const absPath = resolve(rootDir, wsPath);
    const wsSwarmYaml = join(absPath, 'swarm.yaml');

    if (existsSync(wsSwarmYaml)) {
      const wsConfig = loadYaml(wsSwarmYaml);
      workspaces.push({
        name: wsConfig?.project?.name || wsPath,
        path: absPath,
        relativePath: wsPath,
        config: wsConfig,
      });
    }
  }

  return workspaces;
}

/**
 * Merge a workspace config with the root config.
 * Workspace values override root values. Deep merges stack and methodology.
 *
 * @param {object} rootConfig - Parsed root swarm.yaml
 * @param {object} workspaceConfig - Parsed workspace swarm.yaml
 * @returns {object} Merged config
 */
export function mergeWorkspaceConfig(rootConfig, workspaceConfig) {
  if (!workspaceConfig) return { ...rootConfig };

  const merged = { ...rootConfig };

  // Project: workspace takes full precedence
  if (workspaceConfig.project) {
    merged.project = { ...rootConfig.project, ...workspaceConfig.project };
  }

  // Stack: deep merge
  if (workspaceConfig.stack) {
    merged.stack = { ...rootConfig.stack, ...workspaceConfig.stack };
  }

  // Methodology: deep merge with phase-level merging
  if (workspaceConfig.methodology) {
    merged.methodology = { ...rootConfig.methodology };
    if (workspaceConfig.methodology.autonomy) {
      merged.methodology.autonomy = workspaceConfig.methodology.autonomy;
    }
    if (workspaceConfig.methodology.phases) {
      merged.methodology.phases = { ...rootConfig.methodology?.phases };
      for (const [phase, val] of Object.entries(workspaceConfig.methodology.phases)) {
        merged.methodology.phases[phase] = { ...merged.methodology.phases[phase], ...val };
      }
    }
    if (workspaceConfig.methodology.quality) {
      merged.methodology.quality = { ...rootConfig.methodology?.quality, ...workspaceConfig.methodology.quality };
    }
  }

  // Output: workspace overrides
  if (workspaceConfig.output) {
    merged.output = { ...rootConfig.output, ...workspaceConfig.output };
  }

  // Agents: deep merge
  if (workspaceConfig.agents) {
    merged.agents = { ...rootConfig.agents, ...workspaceConfig.agents };
  }

  return merged;
}

/**
 * Check if the current directory is a workspace within a monorepo.
 * Walks up looking for a root swarm.yaml with a workspaces key.
 *
 * @param {string} dir - Current directory
 * @returns {{ isWorkspace: boolean, rootDir: string|null, workspacePath: string|null }}
 */
export function detectWorkspaceContext(dir) {
  let current = resolve(dir);
  const original = current;

  // Walk up at most 5 levels
  for (let i = 0; i < 5; i++) {
    const parent = resolve(current, '..');
    if (parent === current) break; // reached filesystem root
    current = parent;

    const rootSwarm = join(current, 'swarm.yaml');
    if (existsSync(rootSwarm)) {
      const config = loadYaml(rootSwarm);
      if (config?.workspaces) {
        const rel = relative(current, original).replace(/\\/g, '/');
        if (config.workspaces.includes(rel)) {
          return { isWorkspace: true, rootDir: current, workspacePath: rel };
        }
      }
    }
  }

  return { isWorkspace: false, rootDir: null, workspacePath: null };
}
