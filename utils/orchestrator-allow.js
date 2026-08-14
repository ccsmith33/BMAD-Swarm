// BMAD Swarm — orchestrator allow-list: safe default + entry validator.
//
// ADR-017 Amendment 1 (Stream A), Amendment 2 (fail-closed inversion). Two
// responsibilities:
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
// FAIL-CLOSED / ALLOWLIST (Amendment 2 — replaces the earlier denylist). The
// prior design refused an ENUMERATED set of wrappers / env-vars and ALLOWED
// anything unlisted; that is an unwinnable arms race (F-016 / F-INT-1 / F-INT-2:
// `strace node -e …`, `script -qc "rm -rf src"`, `parallel`, `rlwrap`,
// `HOME=/tmp/evil git log`, `PAGER=…`, `LESSOPEN=…` all slipped through because
// they simply were not on the list). The validator now accepts an entry ONLY if,
// after stripping benign env prefixes, its leading binary is in an EXPLICIT
// KNOWN-GOOD allowlist (coordination git, the pinned node scripts, `npm`
// test/run, `cargo` build-family, read-only inspection, and the first-party
// `bmad-swarm` CLI). EVERYTHING ELSE — every unknown binary, every wrapper
// (strace/script/parallel/rlwrap/timeout/env/sudo/…), every interpreter, every
// write/destructive util, and every env prefix outside the small benign-build
// allowlist (CI, RUSTFLAGS, most CARGO_*) — is REFUSED. Completeness is
// STRUCTURAL: a member's absence from the allowlist is a refusal, so there is no
// list to keep "one binary ahead" of.
//
// Defense in depth: even a validator escape does not grant writes. The
// orchestrator-write-gate hook independently inspects every orchestrator Bash
// call at runtime with the IDENTICAL allowlist and a PreToolUse deny beats any
// allow-list entry. The two modules cannot share an import (hooks are standalone
// CJS), so their allowlist sets are pinned to each other by a source-parsing
// consistency test AND a closedness (default-deny) test in
// test/orchestrator-allow.test.js.

// The coordination-git + read-only bmad-swarm CLI safe default. Mirrors the
// additions in templates/settings.json.template. Every entry here MUST pass
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

// ── KNOWN-GOOD ALLOWLIST (the ONLY things an orchestrator grant may resolve to)
//
// git subcommands a project MAY grant: exactly the coordination set the gate
// does not deny, so a project can never pre-authorize a shape the gate must then
// fight. `stash` is deliberately excluded (the gate denies it). Pinned to the
// gate's inspection by the consistency test (must be disjoint from the gate's
// GIT_WRITE_SUBCMDS).
export const GIT_COORDINATION_SUBCMDS = new Set([
  'status', 'log', 'diff', 'show',
  'commit', 'push', 'fetch', 'pull', 'merge',
  'checkout', 'switch', 'branch', 'tag',
]);

// `npm` is allowed ONLY for these non-fetching, non-download-exec subcommands.
// `npm exec` / `npm x` (npx-equivalent), `npm install` / `ci` (dependency
// lifecycle scripts), `npm publish`, etc. run arbitrary downloaded/foreign code
// and are NOT granted. Pinned EQUAL to the gate by the consistency test.
export const NPM_ALLOWED_SUBCMDS = new Set(['test', 'run', 'run-script']);

// `cargo` is allowed ONLY for these build/test verbs. `cargo install` (fetches +
// compiles + runs a crate's build.rs) and friends are NOT granted. Pinned EQUAL
// to the gate by the consistency test.
export const CARGO_ALLOWED_SUBCMDS = new Set([
  'build', 'check', 'test', 'bench', 'clippy', 'fmt', 'doc',
  'run', 'tree', 'metadata', 'version',
]);

// Flat known-good leading binaries — allowed with ANY arguments because they
// cannot exec an attacker-chosen program out of their arguments. `ls/cat/head/
// tail/wc/grep/rg/pwd` are read-only inspection; `echo/printf` are pure output
// (their redirection targets are still vetted by the gate); `bmad-swarm` is the
// trusted first-party CLI whose writes are the sanctioned CLI path (D-037).
// Pinned EQUAL to the gate by the consistency test.
export const KNOWN_GOOD_BINARIES = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'pwd', 'echo', 'printf',
  'bmad-swarm',
]);

// ── BENIGN BUILD ENV ALLOWLIST (the ONLY env prefixes a grant may set)
//
// An env prefix (`VAR=val cmd`) is an execution-substitution surface: git
// diff/pager/ssh drivers, GIT_CONFIG*, the dynamic loader (LD_*/DYLD_*), the
// node/perl/python/ruby preload hooks, PATH/IFS hijack, and the home/config
// redirects (HOME/PAGER/MANPAGER/LESSOPEN → attacker gitconfig / pager exec).
// Rather than enumerate those (endless), the env layer is ALSO an allowlist:
// only `CI`, `RUSTFLAGS`, and most `CARGO_*` build vars pass; everything else is
// refused. The cargo exec-override sub-family (…RUSTC…/…LINKER…/…RUNNER…/
// …RUSTDOC…, and CARGO_HOME which loads a config that can define a `runner`) is
// excluded — those redirect the compiler/linker/test-runner to an arbitrary
// program. Pinned EQUAL to the gate by the consistency test.
export const BENIGN_ENV_VARS = new Set(['CI', 'RUSTFLAGS']);
const CARGO_EXEC_OVERRIDE_RE = /RUSTC|LINKER|RUNNER|RUSTDOC/i;

// True iff an env-var NAME is a benign build var safe to set in a grant/at
// runtime. Everything not matched here is treated as execution-affecting and
// refused. The identical predicate lives in the gate; the exact-name Set and the
// CARGO_ rule are pinned equal across the two layers by the consistency test.
export function isBenignEnvVar(name) {
  if (BENIGN_ENV_VARS.has(name)) return true;
  if (name === 'CARGO_HOME') return false;                 // loads cargo config → runner exec
  if (name.startsWith('CARGO_') && !CARGO_EXEC_OVERRIDE_RE.test(name)) return true;
  return false;
}

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

  // Rule 3 — strip + vet env-var (VAR=val) prefixes. FAIL CLOSED: only the
  // benign-build allowlist (CI / RUSTFLAGS / most CARGO_*) passes; every other
  // prefix (HOME, PAGER, MANPAGER, LESSOPEN, GIT_*, NODE_OPTIONS, LD_*/DYLD_*,
  // PATH, IFS, CARGO_TARGET_*_RUNNER, …) is refused — it could redirect the
  // coordination command into arbitrary execution.
  let idx = 0;
  while (idx < tokens.length) {
    const em = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(tokens[idx]);
    if (!em) break;
    if (!isBenignEnvVar(em[1])) {
      return {
        ok: false,
        reason: `environment variable "${em[1]}" is not in the benign-build allowlist (CI, RUSTFLAGS, most CARGO_*) — an env prefix can redirect git/interpreter/loader/pager execution to an arbitrary program and may not be set in a grant`,
      };
    }
    idx++;
  }
  if (idx >= tokens.length) {
    return { ok: false, reason: 'grant sets environment variables but names no command' };
  }
  const base = basename(tokens[idx]);
  const rest = tokens.slice(idx + 1);
  const firstOperand = rest.find((a) => a && !a.startsWith('-'));

  // Rule 4 — KNOWN-GOOD ALLOWLIST. The leading binary must be one of the
  // explicitly sanctioned commands; anything else fails closed.

  // node/nodejs — only the two pinned scripts, never an interpreter.
  if (base === 'node' || base === 'nodejs') {
    if (rest.some((a) => a === '-e' || a === '--eval' || a === '-p' || a === '--print' ||
        a.startsWith('-e') || a.startsWith('--eval=') || a.startsWith('-p') || a.startsWith('--print='))) {
      return { ok: false, reason: 'node inline eval (-e/-p/--eval/--print) may not be granted' };
    }
    if (firstOperand && PINNED_SCRIPT_RE.test(firstOperand.replace(/\\/g, '/'))) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'node grants are only allowed for the pinned scripts (node .claude/bmad/bin/record.cjs, node .claude/bmad/bin/replay-check.cjs)',
    };
  }

  // git — must be subcommand-qualified to the coordination set.
  if (base === 'git') {
    if (!firstOperand) {
      return {
        ok: false,
        reason: 'a bare "git" grant is refused — it would allow git apply/reset/checkout; name a coordination subcommand, e.g. Bash(git commit:*)',
      };
    }
    if (!GIT_COORDINATION_SUBCMDS.has(firstOperand)) {
      return {
        ok: false,
        reason: `git subcommand "${firstOperand}" is not in the coordination allowlist (${[...GIT_COORDINATION_SUBCMDS].join(', ')})`,
      };
    }
    return { ok: true };
  }

  // npm — only the test/run subcommands (never exec/install/ci/publish).
  if (base === 'npm') {
    if (firstOperand && NPM_ALLOWED_SUBCMDS.has(firstOperand)) return { ok: true };
    return {
      ok: false,
      reason: `npm grants are only allowed for ${[...NPM_ALLOWED_SUBCMDS].join(', ')} (npm exec/install/ci/publish run downloaded or lifecycle code)`,
    };
  }

  // cargo — only the build/test verbs (never install/publish).
  if (base === 'cargo') {
    if (firstOperand && CARGO_ALLOWED_SUBCMDS.has(firstOperand)) return { ok: true };
    return {
      ok: false,
      reason: `cargo grants are only allowed for ${[...CARGO_ALLOWED_SUBCMDS].join(', ')} (cargo install fetches + builds + runs foreign code)`,
    };
  }

  // Flat known-good leading binaries (read-only inspection, echo/printf,
  // bmad-swarm).
  if (KNOWN_GOOD_BINARIES.has(base)) return { ok: true };

  // FAIL CLOSED — anything else (unknown binary, wrapper, interpreter, write /
  // destructive util, package runner) is refused.
  return {
    ok: false,
    reason: `leading binary "${base}" is not in the orchestrator known-good allowlist (coordination git, node .claude/bmad/bin/*.cjs, npm test/run, cargo build-family, ls/cat/head/tail/wc/grep/rg/pwd/echo/printf, bmad-swarm) — wrappers, interpreters, package runners and write/destructive tools are refused fail-closed`,
  };
}
