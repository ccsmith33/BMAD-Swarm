// BMAD Swarm — orchestrator allow-list: safe default + entry validator.
//
// ADR-017 Amendment 1 (Stream A). Two responsibilities:
//   1. SAFE_DEFAULT_ALLOW — the coordination-git + read-only bmad-swarm CLI
//      grants added to every project's settings.json (mirrors the template so
//      the two can never drift; a test asserts the template is a superset and
//      that every default entry passes the validator below).
//   2. validateOrchestratorAllowEntry — the "can never reopen the ADR-017
//      bypass" guarantee for project-declared `permissions.orchestrator_allow`
//      entries. Called from validateConfig, so EVERY loadSwarmConfig (init,
//      update, validate, doctor, start) fails LOUDLY on a bad entry — invalid
//      entries are a config error, never silently dropped.
//
// Defense in depth: even a validator escape does not grant writes. The
// orchestrator-write-gate hook independently inspects every orchestrator Bash
// call at runtime and a PreToolUse deny beats any allow-list entry. The two
// modules cannot share an import (hooks are standalone CJS), so their deny /
// coordination sets are pinned to each other by a source-parsing consistency
// test (test/orchestrator-allow.test.js).

// The coordination-git + read-only CLI safe default. Mirrors the additions in
// templates/settings.json.template. Every entry here MUST pass
// validateOrchestratorAllowEntry (asserted in tests): the default may never be
// a special case.
export const SAFE_DEFAULT_ALLOW = [
  'Bash(git commit:*)',
  'Bash(git push:*)',
  'Bash(git fetch:*)',
  'Bash(git merge --ff-only:*)',
  'Bash(git checkout:*)',
  'Bash(git switch:*)',
  'Bash(git branch:*)',
  'Bash(git tag:*)',
  'Bash(bmad-swarm validate:*)',
  'Bash(bmad-swarm doctor:*)',
  'Bash(bmad-swarm status:*)',
  'Bash(bmad-swarm scan:*)',
];

// Pinned-script exception — identical to the gate's PINNED_SCRIPT_RE. The only
// `node` form a project may grant.
export const PINNED_SCRIPT_RE = /(^|\/)\.claude\/bmad\/bin\/(record|replay-check)\.cjs$/;

// git subcommands a project MAY grant: exactly the coordination set the gate
// does not deny, so a project can never pre-authorize a shape the gate must
// then fight. `stash` is deliberately excluded (the gate denies it). Pinned to
// the gate's GIT_WRITE_SUBCMDS by the consistency test (must be disjoint).
export const GIT_COORDINATION_SUBCMDS = new Set([
  'status', 'log', 'diff', 'show',
  'commit', 'push', 'fetch', 'pull', 'merge',
  'checkout', 'switch', 'branch', 'tag',
]);

// Wrapper binaries that can launch an arbitrary following program. Refused
// outright as a leading command (never stripped-then-allowed here — a grant may
// not begin with a wrapper). Superset of the gate's wrapper handling.
export const WRAPPER_BINARIES = new Set([
  'env', 'command', 'builtin', 'exec', 'sudo', 'doas',
  'nice', 'nohup', 'time', 'stdbuf', 'xargs', 'find',
]);

// Leading binaries refused because they can open a write vector: interpreters,
// package runners that download+exec, write utilities, editors, network-execute,
// and destructive tools. MUST be a superset of the gate's DENY_BINARIES (union
// with WRAPPER_BINARIES) — pinned by the consistency test. `node`/`nodejs` are
// listed here but the pinned-script exception is checked first.
export const DENY_LEADING_BINARIES = new Set([
  // interpreters
  'node', 'nodejs', 'python', 'python2', 'python3', 'perl', 'ruby', 'php',
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'awk', 'gawk', 'mawk', 'deno', 'bun',
  // package runners that download + execute arbitrary code
  'npx', 'uvx', 'pipx',
  // write utilities
  'tee', 'dd', 'cp', 'mv', 'install', 'rsync', 'ln', 'truncate', 'sed', 'patch',
  // editors
  'ed', 'ex', 'vi', 'vim', 'nano', 'emacs',
  // network-execute
  'curl', 'wget',
  // destructive
  'rm', 'rmdir', 'chmod', 'chown', 'shred', 'kill', 'pkill', 'mkfs',
]);

// pnpm / yarn are legitimate leading commands (pnpm test) EXCEPT the `dlx`
// subcommand, which runs arbitrary downloaded code like npx.
const DLX_RUNNERS = new Set(['pnpm', 'yarn']);

// Shell metacharacters — chaining, substitution, redirection. Any of these in a
// grant pattern is refused wholesale (a pattern with `>` would make redirection
// grants matchable).
const SHELL_METACHARACTERS = /[;|&\n><`$()]/;

// --force-family literals a project may not pre-authorize even on an allowed
// binary.
const FORCE_LITERALS = new Set(['--force', '-f', '--hard', '--no-verify', '--force-with-lease']);

function basename(token) {
  return token.replace(/.*\//, '');
}

/**
 * Validate a single `permissions.orchestrator_allow` entry.
 * @param {string} entry - e.g. "Bash(cargo check:*)"
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateOrchestratorAllowEntry(entry) {
  if (typeof entry !== 'string') {
    return { ok: false, reason: 'entry must be a string' };
  }
  const trimmed = entry.trim();

  // Rule 1 — shape: only Bash(<command>[:*]) grants are supported v1.
  const m = /^Bash\((.+?)(:\*)?\)$/.exec(trimmed);
  if (!m) {
    return {
      ok: false,
      reason: `only "Bash(<command>:*)" grants are supported in orchestrator_allow — tool-name grants (WebFetch, mcp__*, …) must be added to settings.json manually`,
    };
  }
  const inner = m[1].trim();
  if (!inner) return { ok: false, reason: 'empty command inside Bash(...)' };

  // Rule 2 — no shell metacharacters (no chaining / substitution / redirection).
  if (SHELL_METACHARACTERS.test(inner)) {
    return {
      ok: false,
      reason: 'shell metacharacters are not allowed in a grant pattern (no ; | & newline > < ` $ ( ) ) — chaining, substitution and redirection are refused',
    };
  }

  const tokens = inner.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, reason: 'empty command inside Bash(...)' };

  // Rule 5 — no --force-family literals anywhere in the pattern.
  for (const t of tokens) {
    if (FORCE_LITERALS.has(t) || t.startsWith('--force-with-lease=')) {
      return { ok: false, reason: `destructive flag "${t}" may not be pre-authorized in a grant` };
    }
  }

  // Rule 3 — strip env-var (VAR=val) prefixes; the leading real command follows.
  let idx = 0;
  while (idx < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[idx])) idx++;
  if (idx >= tokens.length) {
    return { ok: false, reason: 'grant sets environment variables but names no command' };
  }
  const base = basename(tokens[idx]);

  // Rule 3 — wrapper binaries may not lead a grant.
  if (WRAPPER_BINARIES.has(base)) {
    return { ok: false, reason: `wrapper binary "${base}" may not lead a grant — it can launch an arbitrary program` };
  }

  // Rule 3 — pinned-script exception (checked before the node deny below).
  if (base === 'node' || base === 'nodejs') {
    const scriptArg = tokens.slice(idx + 1).find((a) => a && !a.startsWith('-'));
    if (scriptArg && PINNED_SCRIPT_RE.test(scriptArg.replace(/\\/g, '/'))) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'node grants are only allowed for the pinned scripts (node .claude/bmad/bin/record.cjs, node .claude/bmad/bin/replay-check.cjs)',
    };
  }

  // Rule 3 — leading-binary deny-set.
  if (DENY_LEADING_BINARIES.has(base)) {
    return {
      ok: false,
      reason: `leading binary "${base}" is refused (interpreter / package-runner / write-util / editor / network-exec / destructive) — it could open a write vector`,
    };
  }

  // Rule 3 — pnpm/yarn dlx runs arbitrary downloaded code.
  if (DLX_RUNNERS.has(base) && tokens[idx + 1] === 'dlx') {
    return { ok: false, reason: `"${base} dlx" runs arbitrary downloaded code and may not be granted` };
  }

  // Rule 4 — git grants must be subcommand-qualified to the coordination set.
  if (base === 'git') {
    const sub = tokens.slice(idx + 1).find((a) => a && !a.startsWith('-'));
    if (!sub) {
      return {
        ok: false,
        reason: 'a bare "git" grant is refused — it would allow git apply/reset/checkout; name a coordination subcommand, e.g. Bash(git commit:*)',
      };
    }
    if (!GIT_COORDINATION_SUBCMDS.has(sub)) {
      return {
        ok: false,
        reason: `git subcommand "${sub}" is not in the coordination set (${[...GIT_COORDINATION_SUBCMDS].join(', ')}) — the write-gate would deny it anyway`,
      };
    }
    return { ok: true };
  }

  return { ok: true };
}
