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

// Launcher-wrapper binaries that exist only to exec an arbitrary FOLLOWING
// program (timeout/setsid/flock/…, plus env/sudo/nice/nohup/xargs/find/…).
// Refused OUTRIGHT as a leading command (never stripped-then-allowed here — a
// grant may not begin with a wrapper). The orchestrator's coordination set has
// no legitimate need to wrap a command, so outright-refuse is both simpler and
// safer than argument-aware re-inspection. Pinned EQUAL to the gate's
// LAUNCHER_WRAPPERS by test/orchestrator-allow.test.js (F-INT-1).
export const WRAPPER_BINARIES = new Set([
  'env', 'command', 'builtin', 'exec', 'sudo', 'doas',
  'nice', 'nohup', 'time', 'stdbuf', 'xargs', 'find',
  'timeout', 'setsid', 'flock', 'chrt', 'ionice',
  'unbuffer', 'setarch', 'catchsegv', 'watch',
]);

// Execution-affecting environment variables. An env prefix (`VAR=val cmd`) that
// sets any of these — or a member of the GIT_CONFIG*/DYLD_*/LD_* families
// (isExecAffectingEnvVar) — turns an otherwise-allowed coordination command into
// arbitrary code execution (git diff/pager/ssh drivers, the dynamic loader, the
// node/perl/python/ruby preload hooks, PATH/IFS hijack). Refused in a grant, and
// denied at runtime by the gate. Benign build vars (RUSTFLAGS, CI, CARGO_*, …)
// are intentionally absent and keep passing. Pinned EQUAL to the gate's
// EXEC_AFFECTING_ENV_VARS by the consistency test (F-INT-2).
export const EXEC_AFFECTING_ENV_VARS = new Set([
  'GIT_EXTERNAL_DIFF', 'GIT_SSH_COMMAND', 'GIT_SSH', 'GIT_PAGER', 'GIT_EDITOR',
  'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS',
  'GIT_PROXY_COMMAND', 'GIT_ASKPASS', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'NODE_OPTIONS', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT',
  'PERL5OPT', 'PERL5LIB', 'PYTHONSTARTUP', 'PYTHONPATH', 'RUBYOPT', 'RUBYLIB',
  'BASH_ENV', 'ENV', 'IFS', 'PATH', 'SHELLOPTS', 'BASHOPTS',
]);

// True iff an env-var NAME is execution-affecting (denylist + prefix families).
// The identical predicate lives in the gate; the exact-name Set above is pinned
// equal across the two layers by the consistency test.
export function isExecAffectingEnvVar(name) {
  if (EXEC_AFFECTING_ENV_VARS.has(name)) return true;
  if (name.startsWith('GIT_CONFIG')) return true; // GIT_CONFIG* family (KEY/VALUE/COUNT/…)
  if (name.startsWith('DYLD_')) return true;       // macOS dyld injection
  if (name.startsWith('LD_')) return true;         // ELF loader injection (PRELOAD/LIBRARY_PATH/AUDIT)
  return false;
}

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

  // Rule 3 — vet + strip env-var (VAR=val) prefixes; the leading real command
  // follows. An execution-affecting variable (GIT_EXTERNAL_DIFF, GIT_SSH_COMMAND,
  // NODE_OPTIONS, LD_PRELOAD, …) is refused — it would hijack the coordination
  // command into arbitrary execution. Benign build vars (RUSTFLAGS, CI, …) pass.
  let idx = 0;
  while (idx < tokens.length) {
    const em = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(tokens[idx]);
    if (!em) break;
    if (isExecAffectingEnvVar(em[1])) {
      return {
        ok: false,
        reason: `environment variable "${em[1]}" is execution-affecting (it can redirect git/interpreter/loader execution to an arbitrary program) and may not be set in a grant`,
      };
    }
    idx++;
  }
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
