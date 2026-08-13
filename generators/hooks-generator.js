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
    'session-start-warmboot.cjs',
    'pre-compact-flush.cjs',
    'user-prompt-submit.cjs',
    'team-assembly-lint.cjs',
    'orchestrator-write-gate.cjs',
    'ledger-write-guard.cjs',
    'replay-gate.cjs',
    'task-ledger-writer.cjs',
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
      // Project brain WARM BOOT (phase2 design §4.4). Fires on BOTH a fresh
      // session (startup) and after compaction (compact): re-injects the durable
      // project-brain.md + the read-back-handshake sequence so COMPREHENSION is
      // restored, not just identity. Composes with post-compact-reinject (which
      // restores identity on compact); Claude Code concatenates their
      // additionalContext.
      { matcher: 'startup|compact', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start-warmboot.cjs"' }] },
    ],
    // Project brain PreCompact FLUSH (phase2 design §4.4; continuity §2.2/§6.1).
    // Fires before every compaction: injects the current project-brain.md + its
    // schema as custom compaction instructions so the summary becomes a
    // delta-patch against the brain (schema-driven compaction, spike-verified on
    // v2.1.221). ALWAYS exit 0 — exit 2 would block compaction and pin the
    // session at the context ceiling.
    PreCompact: [
      { hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-compact-flush.cjs"' }] },
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
      // matched too (all-identity backstop for the shell-redirect bypass); the
      // guard denies only WRITE/redirect shapes onto the protected files, so the
      // pinned CLI (which never names those basenames in argv) still runs.
      { matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/ledger-write-guard.cjs"' }] },
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
    // ADR-018 / D-037 / D-049: the task-ledger writer. A guaranteed, event-driven
    // writer of artifacts/context/task-ledger.md — the durable coordination log
    // that lets a fresh session reconstruct in-flight state (crash-only). Fires
    // AFTER the tool succeeds and appends a lifecycle row through the pinned
    // record.cjs (lock + atomic); it never blocks (advisory logging side-channel,
    // always exit 0). Payload shapes verified live on v2.1.222 (spike-posttooluse
    // -2026-08-13): TaskCreate -> created/assigned, TaskUpdate -> the status set,
    // SendMessage -> woken (resolved by an owner->task-id JOIN, not text-parsing).
    PostToolUse: [
      { matcher: 'TaskCreate|TaskUpdate|SendMessage', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/task-ledger-writer.cjs"' }] },
    ],
  };
}
