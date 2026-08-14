import { join } from 'node:path';
import { writeFileSafe } from '../utils/fs-helpers.js';
import { buildStamp, serializeStamp, STAMP_FILENAME } from '../utils/auto-heal.js';

/**
 * Write the scaffold version stamp (.claude/.bmad-version.json).
 *
 * The stamp records the bmad-swarm version + scaffold content hash that produced
 * the current .claude/ scaffold. It is the durable marker auto-heal reads at a
 * fresh SessionStart to detect drift between the installed package and the
 * on-disk scaffold (F-29/F-30). Deterministic bytes (no timestamp) so re-running
 * `update` is idempotent.
 *
 * Unlike the hooks/agents generators this is NOT a hash-markered, manual-edit-
 * protected file: it is machine state that must always reflect the version that
 * generated the scaffold, so it is written unconditionally. Callers advance it
 * ONLY after a full generation (never when the live-swap guard deferred the
 * hooks/settings), so the stamp never falsely claims the scaffold is current.
 *
 * @param {object} config - Parsed swarm.yaml config (unused; kept for generator-signature parity)
 * @param {object} projectPaths - Project paths from getProjectPaths()
 * @returns {{ path: string, version: string }}
 */
export function generateVersionStamp(config, projectPaths) {
  const stamp = buildStamp();
  const stampPath = join(projectPaths.claudeDir, STAMP_FILENAME);
  writeFileSafe(stampPath, serializeStamp(stamp));
  return { path: stampPath, version: stamp.version };
}
