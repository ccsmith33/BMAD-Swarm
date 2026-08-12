import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PACKAGE_METHODOLOGY_DIR } from '../utils/paths.js';
import { writeGeneratedFile, isFileManuallyModified, ensureDir } from '../utils/fs-helpers.js';
import { METHODOLOGY_SHIP_LIST, rewriteScaffoldPaths } from '../utils/scaffold-paths.js';

/**
 * Ship the load-bearing methodology subset into `.claude/bmad/methodology/`
 * (CB-1, WS-6). Generated agents and command bodies instruct Claude to read
 * `methodology/…` paths; in a user project those only exist once shipped here.
 *
 * Files are read from the installed package, path-rewritten (their internal
 * cross-references point at other shipped files, §3.1), and written through the
 * same hash-marker machinery as agents — so shipped methodology gets identical
 * update-safety: user-modified files are detected and skipped unless --force.
 *
 * This is the editable methodology surface for a user project; it replaces the
 * retired `eject methodology` placebo (V-5) — the shipped copy IS the override.
 *
 * @param {object} config - Parsed swarm.yaml config (unused today; kept for
 *   signature parity with the other generators and future gating)
 * @param {object} projectPaths - Project paths from getProjectPaths()
 * @param {object} [options] - Options
 * @param {boolean} [options.force] - Overwrite even if manually modified
 * @returns {{ generated: string[], modified: string[] }} shipped subpaths and
 *   the subpaths skipped because the user had modified them
 */
export function generateMethodology(config, projectPaths, options = {}) {
  ensureDir(projectPaths.bmadMethodologyDir);

  const generated = [];
  const modified = [];

  for (const relPath of METHODOLOGY_SHIP_LIST) {
    const sourcePath = join(PACKAGE_METHODOLOGY_DIR, relPath);
    if (!existsSync(sourcePath)) {
      // A ship-list entry with no package source is a packaging bug, not a
      // user condition — surface it rather than silently shipping less.
      console.warn(`Warning: methodology ship-list file missing from package: ${relPath}`);
      continue;
    }

    const outputPath = join(projectPaths.bmadMethodologyDir, relPath);

    // Respect user edits (same contract as generateAgents).
    if (!options.force && isFileManuallyModified(outputPath)) {
      modified.push(relPath);
      continue;
    }

    const source = readFileSync(sourcePath, 'utf8');
    const rewritten = rewriteScaffoldPaths(source);
    ensureDir(dirname(outputPath));
    writeGeneratedFile(outputPath, rewritten);
    generated.push(relPath);
  }

  return { generated, modified };
}
