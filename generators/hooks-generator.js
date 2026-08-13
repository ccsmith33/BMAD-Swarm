import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { writeGeneratedJsFile, isFileManuallyModified, ensureDir } from '../utils/fs-helpers.js';

// Hook sources live one-per-file under generators/hooks/<name>.cjs.src (the
// SE-1 prep split, phase2 design §3.4). Each .cjs.src file holds the VERBATIM
// hook body (shebang + comments + code) that the generator used to embed as an
// inline template literal. writeGeneratedJsFile() still inserts the
// bmad-generated hash marker after the shebang, so the emitted .claude/hooks/*.cjs
// are byte-for-byte identical to the pre-split output. Keeping each hook in its
// own source file lets the Phase 2 tracks (write-gate, replay gate, task-ledger,
// project brain) edit disjoint files instead of colliding in one string blob.
const HOOK_SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'hooks');

/**
 * Read a hook's verbatim source body from generators/hooks/<name>.cjs.src.
 * The returned string is passed straight to writeGeneratedJsFile (which adds
 * the hash marker) — no interpolation, so the source file is the source of truth.
 *
 * @param {string} hookName - The generated hook filename (e.g. 'user-prompt-submit.cjs')
 * @returns {string} The hook body
 */
function readHookSource(hookName) {
  return readFileSync(join(HOOK_SOURCE_DIR, `${hookName}.src`), 'utf8');
}

/**
 * Write a generated hook file with modification protection.
 * Skips writing if the file was manually modified (unless force is set).
 *
 * @param {string} filePath
 * @param {string} content
 * @param {object} [options]
 * @param {boolean} [options.force]
 * @returns {{ path: string, skipped: boolean }}
 */
function writeGeneratedHook(filePath, content, options = {}) {
  if (!options.force && isFileManuallyModified(filePath)) {
    return { path: filePath, skipped: true };
  }
  writeGeneratedJsFile(filePath, content);
  return { path: filePath, skipped: false };
}

/**
 * Generate Claude Code hooks (identity reminders, the advisory
 * team-assembly lint, and the orchestrator write gate).
 * Creates Node.js scripts in .claude/hooks/ that run on specific events.
 *
 * @param {object} config - Parsed swarm.yaml config
 * @param {object} projectPaths - Project paths from getProjectPaths()
 * @param {object} [options] - Options
 * @param {boolean} [options.force] - Overwrite even if manually modified
 * @returns {{ generated: string[], skipped: string[] }} Lists of generated and skipped hook file paths
 */
export function generateHooks(config, projectPaths, options = {}) {
  ensureDir(projectPaths.hooksDir);
  const generated = [];
  const skipped = [];

  const hooks = [
    'post-compact-reinject.cjs',
    'user-prompt-submit.cjs',
    'team-assembly-lint.cjs',
    'orchestrator-write-gate.cjs',
    'ledger-write-guard.cjs',
    'replay-gate.cjs',
  ];

  for (const name of hooks) {
    const filePath = join(projectPaths.hooksDir, name);
    const result = writeGeneratedHook(filePath, readHookSource(name), options);
    if (result.skipped) {
      skipped.push(filePath);
    } else {
      generated.push(filePath);
    }
  }

  return { generated, skipped };
}

/**
 * Return the hooks configuration object for settings.json.
 * This is the SINGLE SOURCE OF TRUTH for all hook definitions.
 *
 * @returns {object} Hooks configuration for settings.json
 */
export function getHooksConfig() {
  return {
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.cjs"' }] },
    ],
    SessionStart: [
      { matcher: 'compact', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/post-compact-reinject.cjs"' }] },
    ],
    PreToolUse: [
      // ADR-015: TeamCreate was removed from Claude Code (v2.1.178); teams
      // form on the first Agent-tool spawn, so the assembly lint anchors on
      // PreToolUse:Agent. TaskCreated exit-2 was evaluated as a secondary
      // anchor (spike 2026-08-11) but rejected: blocking there deletes the
      // just-created task instead of declining the spawn.
      { matcher: 'Agent', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/team-assembly-lint.cjs"' }] },
      // ADR-017 / F-016: the gate matches Bash + NotebookEdit as well, so a
      // narrowed orchestrator cannot shell out (echo>/tee/node -e/sed -i) or
      // NotebookEdit around the delegate-everything boundary.
      { matcher: 'Edit|Write|MultiEdit|Bash|NotebookEdit', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/orchestrator-write-gate.cjs"' }] },
      // ADR-021 / D-049: the serialized-write channel. Denies DIRECT edits to
      // ledger.md / task-ledger.md / decision-log.md for EVERY agent, forcing
      // all writes through node .claude/bmad/bin/record.cjs (RES-6 fix). Bash is
      // deliberately absent from this matcher so the pinned CLI still runs.
      { matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/ledger-write-guard.cjs"' }] },
    ],
    // ADR-022 / D-040 / D-049: the replay gate. TaskCompleted is the blocking
    // trigger (exit 2 re-runs declared evidence before "done" lands); TaskCreated
    // enforces the `gate: replay` marker on story/bug-fix tasks so coverage is
    // deterministic. Both events resolve to one source file (replay-gate.cjs),
    // which branches on hook_event_name. Requires the agent-teams config
    // (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1) under which these events fire
    // (spike 2026-08-11, v2.1.221).
    TaskCompleted: [
      { hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/replay-gate.cjs"' }] },
    ],
    TaskCreated: [
      { hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/replay-gate.cjs"' }] },
    ],
  };
}
