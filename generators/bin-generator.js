import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../utils/paths.js';
import { writeGeneratedJsFile, isFileManuallyModified, ensureDir } from '../utils/fs-helpers.js';

/**
 * Ship the pinned serialized-write CLI into `.claude/bmad/bin/` (ADR-021 §3.2,
 * D-049). The orchestrator's narrowed allow-list (Fork A) permits exactly
 * `node .claude/bmad/bin/record.cjs:*` and nothing else under `bin/`, so this
 * script is the only door to the serialized context files. It must exist in the
 * scaffold for that allow-list — and the ledger-write-guard hook — to mean
 * anything.
 *
 * The script is shipped verbatim (it is self-contained: node built-ins only, no
 * dependency on this package's utils/ or node_modules), through the same
 * hash-marker machinery as the hooks so user edits are detected and preserved
 * across updates.
 *
 * @param {object} config - Parsed swarm.yaml config (unused; signature parity)
 * @param {object} projectPaths - Project paths from getProjectPaths()
 * @param {object} [options]
 * @param {boolean} [options.force] - Overwrite even if manually modified
 * @returns {{ generated: string[], skipped: string[] }}
 */
export function generateBin(config, projectPaths, options = {}) {
  ensureDir(projectPaths.bmadBinDir);

  const generated = [];
  const skipped = [];

  const scripts = ['record.cjs'];
  for (const name of scripts) {
    const sourcePath = join(PACKAGE_ROOT, 'bin', name);
    if (!existsSync(sourcePath)) {
      console.warn(`Warning: bin ship-list script missing from package: ${name}`);
      continue;
    }
    const outputPath = join(projectPaths.bmadBinDir, name);
    if (!options.force && isFileManuallyModified(outputPath)) {
      skipped.push(outputPath);
      continue;
    }
    writeGeneratedJsFile(outputPath, readFileSync(sourcePath, 'utf8'));
    generated.push(outputPath);
  }

  return { generated, skipped };
}
