import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  validateOrchestratorAllowEntry,
  SAFE_DEFAULT_ALLOW,
  GIT_COORDINATION_SUBCMDS,
  KNOWN_GOOD_BINARIES,
  NPM_ALLOWED_SUBCMDS,
  CARGO_ALLOWED_SUBCMDS,
  BENIGN_ENV_VARS,
  isBenignEnvVar,
} from '../utils/orchestrator-allow.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Extract a `const <NAME> = new Set([ ... ])` literal's string members from a
// source file. Used to pin the gate's sets (standalone CJS, cannot be imported)
// to the validator's exported sets.
function extractSetLiteral(source, name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)');
  const m = re.exec(source);
  assert.ok(m, `could not find "const ${name} = new Set([...])" in the gate source`);
  return new Set([...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
}

// ── Run the REAL gate against a Bash command as the orchestrator identity.
// The gate ships as `.cjs.src` (the package is type:module, so it cannot run
// with a `.src`/`.js` extension); copy it verbatim to a `.cjs` and spawn it,
// exactly as it runs in a generated project. Returns 'deny' | null(allow).
const GATE_SRC = readFileSync(
  join(REPO_ROOT, 'generators', 'hooks', 'orchestrator-write-gate.cjs.src'),
  'utf8',
);
const GATE_PATH = join(mkdtempSync(join(tmpdir(), 'orch-gate-')), 'gate.cjs');
writeFileSync(GATE_PATH, GATE_SRC);

function gateBashDecision(command) {
  const res = spawnSync('node', [GATE_PATH], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    // main-thread orchestrator: no agent_id/agent_type; AGENT_ROLE=orchestrator.
    env: { ...process.env, AGENT_ROLE: 'orchestrator', CLAUDE_PROJECT_DIR: REPO_ROOT },
  });
  if (!res.stdout || !res.stdout.trim()) return null;
  try { return JSON.parse(res.stdout).hookSpecificOutput.permissionDecision || null; }
  catch { return null; }
}

describe('orchestrator-allow validator', () => {
  const ok = (e) => validateOrchestratorAllowEntry(e).ok;
  const why = (e) => validateOrchestratorAllowEntry(e).reason;

  describe('accepts known-good entries', () => {
    const ACCEPT = [
      // coordination git (subcommand-qualified)
      'Bash(git commit:*)',
      'Bash(git status:*)',
      'Bash(git log:*)',
      'Bash(git push:*)',
      'Bash(git fetch:*)',
      'Bash(git merge --ff-only:*)',
      'Bash(git checkout:*)',
      // pinned node scripts
      'Bash(node .claude/bmad/bin/record.cjs:*)',
      'Bash(node .claude/bmad/bin/replay-check.cjs:*)',
      // npm test/run
      'Bash(npm test:*)',
      'Bash(npm run build:*)',
      // cargo build-family
      'Bash(cargo check:*)',
      'Bash(cargo build)',
      'Bash(cargo test:*)',
      'Bash(cargo clippy:*)',
      // read-only inspection + harmless output
      'Bash(ls -la:*)',
      'Bash(cat swarm.yaml:*)',
      'Bash(head -5 f:*)',
      'Bash(tail -n 5 log:*)',
      'Bash(wc -l f:*)',
      'Bash(grep -rn foo src:*)',
      'Bash(rg pattern:*)',
      'Bash(pwd:*)',
      'Bash(echo hi:*)',
      'Bash(printf x:*)',
      // first-party CLI
      'Bash(bmad-swarm validate:*)',
      'Bash(bmad-swarm doctor:*)',
      // benign build env prefixes
      'Bash(RUSTFLAGS=-D cargo check:*)',
      'Bash(CI=1 npm test:*)',
      'Bash(CARGO_TERM_COLOR=always cargo build:*)',
      'Bash(CARGO_INCREMENTAL=0 cargo build:*)',
    ];
    for (const entry of ACCEPT) {
      it(`accepts ${entry}`, () => {
        assert.ok(ok(entry), `${entry} should be accepted, got: ${why(entry)}`);
      });
    }
  });

  describe('refuses everything outside the allowlist', () => {
    const REJECT = [
      // git shapes outside the coordination set
      ['bare git (would allow git apply/reset)', 'Bash(git:*)'],
      ['git non-coordination subcommand (apply)', 'Bash(git apply:*)'],
      ['git reset (not coordination)', 'Bash(git reset:*)'],
      ['git stash (excluded)', 'Bash(git stash:*)'],
      // interpreters / package runners
      ['node inline eval', 'Bash(node -e:*)'],
      ['node arbitrary script', 'Bash(node build.js:*)'],
      ['node non-pinned .cjs path', 'Bash(node scripts/evil.cjs:*)'],
      ['sh -c', 'Bash(sh -c ls:*)'],
      ['bash', 'Bash(bash script.sh:*)'],
      ['python', 'Bash(python3 x.py:*)'],
      ['perl', 'Bash(perl x.pl:*)'],
      ['ruby', 'Bash(ruby x.rb:*)'],
      ['npx anything', 'Bash(npx anything:*)'],
      ['npm exec (npx-equivalent)', 'Bash(npm exec cowsay:*)'],
      ['npm install (lifecycle scripts)', 'Bash(npm install:*)'],
      ['npm ci (lifecycle scripts)', 'Bash(npm ci:*)'],
      ['cargo install (fetch+build+exec)', 'Bash(cargo install ripgrep:*)'],
      ['pnpm test (not in allowlist)', 'Bash(pnpm test:*)'],
      ['pnpm dlx', 'Bash(pnpm dlx cowsay:*)'],
      ['yarn lint (not in allowlist)', 'Bash(yarn lint:*)'],
      ['yarn dlx', 'Bash(yarn dlx cowsay:*)'],
      ['go test (not in allowlist)', 'Bash(go test:*)'],
      ['bundle exec (arbitrary runner)', 'Bash(bundle exec rubocop:*)'],
      ['deno', 'Bash(deno run x.ts:*)'],
      ['bun', 'Bash(bun run x:*)'],
      // metacharacters
      ['redirection metacharacter', 'Bash(echo hi > f:*)'],
      ['chaining metacharacter', 'Bash(ls; rm -rf x:*)'],
      ['pipe metacharacter', 'Bash(cat x | sh:*)'],
      ['command substitution', 'Bash(echo $(whoami):*)'],
      ['backtick substitution', 'Bash(echo `id`:*)'],
      // force-family literals
      ['git push --force', 'Bash(git push --force:*)'],
      ['standalone -f force flag', 'Bash(git push -f:*)'],
      ['reset --hard literal', 'Bash(git reset --hard:*)'],
      // write / destructive utils
      ['tee write-util', 'Bash(tee x:*)'],
      ['dd write-util', 'Bash(dd of=x:*)'],
      ['cp write-util', 'Bash(cp a b:*)'],
      ['mv write-util', 'Bash(mv a b:*)'],
      ['sed', 'Bash(sed -i s/a/b/ f:*)'],
      ['curl network-execute', 'Bash(curl http://x:*)'],
      ['wget network-execute', 'Bash(wget http://x:*)'],
      ['rm destructive', 'Bash(rm -rf x:*)'],
      ['chmod', 'Bash(chmod 777 x:*)'],
      ['vim editor', 'Bash(vim f:*)'],
      ['patch', 'Bash(patch -p0:*)'],
      ['awk', 'Bash(awk BEGIN f:*)'],
      // original wrappers — refused as not-known-good (no denylist needed)
      ['env wrapper prefix', 'Bash(env node -e 1:*)'],
      ['sudo wrapper', 'Bash(sudo make install:*)'],
      ['xargs wrapper', 'Bash(xargs rm:*)'],
      ['find wrapper', 'Bash(find . -delete:*)'],
      ['timeout bare launcher', 'Bash(timeout:*)'],
      ['timeout node -e launcher', 'Bash(timeout node -e 1:*)'],
      ['setsid launcher', 'Bash(setsid python3 evil.py:*)'],
      ['flock launcher', 'Bash(flock /tmp/l sh:*)'],
      ['nice launcher', 'Bash(nice node build.js:*)'],
      ['watch launcher', 'Bash(watch node build.js:*)'],
      // NEW wrappers the prior denylist missed (F-INT-1 class, now closed)
      ['strace wrapper', 'Bash(strace node -e 1:*)'],
      ['strace rm', 'Bash(strace rm -rf src:*)'],
      ['ltrace wrapper', 'Bash(ltrace node build.js:*)'],
      ['script(1) wrapper', 'Bash(script build.log:*)'],
      ['parallel wrapper', 'Bash(parallel node build.js:*)'],
      ['rlwrap wrapper', 'Bash(rlwrap node build.js:*)'],
      ['chroot wrapper', 'Bash(chroot /tmp sh:*)'],
      ['runuser wrapper', 'Bash(runuser -u x sh:*)'],
      ['capsh wrapper', 'Bash(capsh --:*)'],
      ['proot wrapper', 'Bash(proot -0 sh:*)'],
      ['bwrap wrapper', 'Bash(bwrap --bind / / sh:*)'],
      // execution-affecting env prefixes (original F-INT-2 set)
      ['GIT_EXTERNAL_DIFF exec env prefix', 'Bash(GIT_EXTERNAL_DIFF=/tmp/evil git diff:*)'],
      ['GIT_SSH_COMMAND exec env prefix', 'Bash(GIT_SSH_COMMAND=/tmp/evil git fetch:*)'],
      ['GIT_CONFIG_GLOBAL exec env prefix', 'Bash(GIT_CONFIG_GLOBAL=/tmp/evil git commit:*)'],
      ['NODE_OPTIONS exec env prefix', 'Bash(NODE_OPTIONS=x npm test:*)'],
      ['LD_PRELOAD exec env prefix', 'Bash(LD_PRELOAD=/tmp/x.so git status:*)'],
      ['DYLD_INSERT_LIBRARIES exec env prefix', 'Bash(DYLD_INSERT_LIBRARIES=/tmp/x git status:*)'],
      ['PATH hijack env prefix', 'Bash(PATH=/tmp git commit:*)'],
      ['IFS hijack env prefix', 'Bash(IFS=x git commit:*)'],
      ['GIT_DIR env-prefix smuggling a git write', 'Bash(GIT_DIR=x git apply:*)'],
      // NEW env prefixes the prior denylist missed (F-INT-2 class, now closed)
      ['HOME redirect env prefix', 'Bash(HOME=/tmp/evil git log:*)'],
      ['PAGER exec env prefix', 'Bash(PAGER=/tmp/evil git log:*)'],
      ['MANPAGER exec env prefix', 'Bash(MANPAGER=/tmp/evil git diff:*)'],
      ['LESSOPEN exec env prefix', 'Bash(LESSOPEN=/tmp/evil git show:*)'],
      // cargo exec-override sub-family — inside the CARGO_ prefix but excluded
      ['CARGO_TARGET_*_RUNNER exec env prefix', 'Bash(CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUNNER=/tmp/evil cargo test:*)'],
      ['CARGO_BUILD_RUSTC_WRAPPER exec env prefix', 'Bash(CARGO_BUILD_RUSTC_WRAPPER=/tmp/evil cargo build:*)'],
      ['CARGO_HOME redirect env prefix', 'Bash(CARGO_HOME=/tmp/evil cargo build:*)'],
      // non-Bash grants / type errors
      ['non-Bash tool grant (WebFetch)', 'WebFetch'],
      ['non-Bash tool grant (mcp)', 'mcp__foo__bar'],
      ['not a string (number)', 42],
      ['not a string (null)', null],
    ];
    for (const [label, entry] of REJECT) {
      it(`refuses ${label}`, () => {
        const v = validateOrchestratorAllowEntry(entry);
        assert.equal(v.ok, false, `${JSON.stringify(entry)} should be refused`);
        assert.ok(typeof v.reason === 'string' && v.reason.length > 0, 'refusal must carry a reason');
      });
    }
  });

  it('the safe default is not a special case — every entry passes its own validator', () => {
    for (const entry of SAFE_DEFAULT_ALLOW) {
      assert.ok(ok(entry), `SAFE_DEFAULT_ALLOW entry ${entry} must pass the validator, got: ${why(entry)}`);
    }
  });

  it('double-space inside a git grant still resolves the subcommand', () => {
    assert.ok(ok('Bash(git  commit:*)'), 'double-space git commit should still be recognized as commit');
    assert.equal(ok('Bash(git  apply:*)'), false, 'double-space must not hide a non-coordination subcommand');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// CLOSEDNESS (fail-closed / default-deny). The security guarantee is no longer
// "these enumerated bad things are refused" but "everything NOT on the small
// known-good allowlist is refused" — at BOTH layers. These tests prove that
// structurally: a representative AND a randomly-fuzzed set of non-allowlisted
// leading binaries, wrappers and env prefixes ALL refuse (validator) and deny
// (gate); the known-good set stays open. Completeness is by construction (the
// default branch is deny), not by enumeration — so no future unlisted wrapper
// can slip through the way strace/script/HOME/PAGER did on the denylist.
// ─────────────────────────────────────────────────────────────────────────
describe('closedness — non-allowlisted commands refuse (validator) AND deny (gate)', () => {
  // Leading binaries / wrappers that are NOT known-good. Real target is
  // arbitrary; both layers must reject regardless of what follows.
  const NON_ALLOWLISTED = [
    'strace node build.js', 'ltrace node build.js', 'script build.log',
    'parallel node build.js', 'rlwrap node build.js',
    'chroot /tmp sh', 'runuser -u x sh', 'capsh --', 'proot -0 sh', 'bwrap --bind / / sh',
    'timeout 5 node build.js', 'setsid node build.js', 'flock /tmp/l node build.js',
    'env node build.js', 'sudo make install', 'nice node build.js', 'nohup node build.js',
    'xargs rm', 'find . -delete',
    'rm -rf src', 'curl example.com -o y', 'wget example.com', 'chmod 777 x',
    'tee src/x', 'cp a src/b', 'mv a src/b', 'dd if=/dev/zero of=src/x',
    'python3 build.py', 'perl x.pl', 'ruby x.rb', 'php x.php',
    'sh -c ls', 'bash build.sh', 'zsh x', 'awk BEGIN f', 'sed -i s/a/b/ f',
    'patch -p0', 'vim f', 'ed x', 'nano f',
    'npx cowsay', 'npm exec cowsay', 'npm install', 'cargo install ripgrep',
    'pnpm test', 'yarn lint', 'go test', 'bundle exec rubocop', 'deno run x', 'bun run x',
    'make', 'mvn test', 'gradle build', 'docker run x', 'ssh host', 'scp a b',
  ];
  // Non-benign env prefixes in front of a KNOWN-GOOD target — the prefix alone
  // must force a refuse/deny (the target being known-good must not save it).
  const NON_BENIGN_ENV = [
    'HOME=/tmp/evil git log', 'PAGER=/tmp/evil git log', 'MANPAGER=/tmp/evil git diff',
    'LESSOPEN=/tmp/evil git show', 'GIT_EXTERNAL_DIFF=/tmp/evil git diff',
    'GIT_SSH_COMMAND=/tmp/evil git fetch', 'GIT_CONFIG_GLOBAL=/tmp/evil git commit',
    'NODE_OPTIONS=x npm test', 'LD_PRELOAD=/tmp/x.so git status',
    'DYLD_INSERT_LIBRARIES=/tmp/x git status', 'PATH=/tmp git commit', 'IFS=x git commit',
    'CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUNNER=/tmp/evil cargo test',
    'CARGO_BUILD_RUSTC_WRAPPER=/tmp/evil cargo build', 'CARGO_HOME=/tmp/evil cargo build',
  ];

  for (const cmd of [...NON_ALLOWLISTED, ...NON_BENIGN_ENV]) {
    it(`refuses+denies: ${cmd}`, () => {
      assert.equal(validateOrchestratorAllowEntry(`Bash(${cmd}:*)`).ok, false,
        `validator must REFUSE grant for: ${cmd}`);
      assert.equal(gateBashDecision(cmd), 'deny',
        `gate must DENY at runtime: ${cmd}`);
    });
  }

  it('git -c exec-config keys deny at the gate (F-INT-4), value-agnostic', () => {
    for (const cmd of [
      'git -c core.hooksPath=/tmp/evil commit -m x',
      'git -c core.pager=/tmp/evil log',
      'git -c core.pager=cat log',            // value-agnostic: still an exec key
      'git -c core.fsmonitor=/tmp/evil status',
      'git -c core.sshCommand=/tmp/evil fetch',
      'git -c diff.external=/tmp/evil diff',
    ]) {
      assert.equal(gateBashDecision(cmd), 'deny', `gate must deny exec-config -c: ${cmd}`);
    }
    // a benign non-exec config key still passes.
    assert.equal(gateBashDecision('git -c commit.gpgsign=false commit -m x'), null);
  });

  it('structural fuzz — random non-allowlisted binary names all refuse + deny', () => {
    const rnd = () => 'zq' + Math.random().toString(36).slice(2, 9);
    for (let i = 0; i < 25; i++) {
      const bin = rnd();
      assert.equal(validateOrchestratorAllowEntry(`Bash(${bin} arg:*)`).ok, false,
        `validator must refuse random binary: ${bin}`);
      assert.equal(gateBashDecision(`${bin} arg`), 'deny',
        `gate must deny random binary: ${bin}`);
    }
  });

  it('the known-good allowlist stays OPEN (benign commands accept + allow)', () => {
    const BENIGN = [
      ['Bash(git status:*)', 'git status'],
      ['Bash(git log:*)', 'git log --oneline -5'],
      ['Bash(git commit:*)', 'git commit -m "a -> b"'],
      ['Bash(git push:*)', 'git push origin main'],
      ['Bash(git fetch:*)', 'git fetch origin'],
      ['Bash(git merge --ff-only:*)', 'git merge --ff-only main'],
      ['Bash(npm test:*)', 'npm test'],
      ['Bash(cargo build:*)', 'cargo build'],
      ['Bash(cargo check:*)', 'cargo check'],
      ['Bash(ls -la:*)', 'ls -la src/'],
      ['Bash(cat swarm.yaml:*)', 'cat swarm.yaml'],
      ['Bash(rg pattern:*)', 'rg "x > 5" src/'],
      ['Bash(echo hi:*)', "echo 'just printing'"],
      ['Bash(node .claude/bmad/bin/record.cjs:*)', 'node .claude/bmad/bin/record.cjs append --type F --stdin'],
      ['Bash(RUSTFLAGS=-D cargo build:*)', 'RUSTFLAGS=-D cargo build'],
      ['Bash(CI=1 npm test:*)', 'CI=1 npm test'],
      ['Bash(CARGO_TERM_COLOR=always cargo build:*)', 'CARGO_TERM_COLOR=always cargo build'],
    ];
    for (const [grant, cmd] of BENIGN) {
      assert.ok(validateOrchestratorAllowEntry(grant).ok,
        `validator must ACCEPT: ${grant} (${validateOrchestratorAllowEntry(grant).reason})`);
      assert.equal(gateBashDecision(cmd), null, `gate must ALLOW: ${cmd}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// validator ↔ gate ALLOWLIST consistency. The two layers duplicate the
// known-good allowlist by construction (hooks are standalone CJS, no shared
// import) and are pinned equal by THIS test. Drift breaks the build, not the
// field. (Unlike the old denylist-equality test, equality here pins an
// ALLOWLIST — a member dropped from either side narrows what is permitted, it
// can never widen the bypass surface, because everything off-list is denied.)
// ─────────────────────────────────────────────────────────────────────────
describe('validator ↔ gate allowlist consistency', () => {
  const gateSource = GATE_SRC;
  const gateKnownGood = extractSetLiteral(gateSource, 'KNOWN_GOOD_BINARIES');
  const gateNpm = extractSetLiteral(gateSource, 'NPM_ALLOWED_SUBCMDS');
  const gateCargo = extractSetLiteral(gateSource, 'CARGO_ALLOWED_SUBCMDS');
  const gateBenignEnv = extractSetLiteral(gateSource, 'BENIGN_ENV_VARS');
  const gateWriteSubcmds = extractSetLiteral(gateSource, 'GIT_WRITE_SUBCMDS');

  const assertSetEqual = (a, b, label) => {
    const missingFromB = [...a].filter((x) => !b.has(x));
    const missingFromA = [...b].filter((x) => !a.has(x));
    assert.deepEqual(missingFromB, [], `${label}: validator has members the gate lacks: ${missingFromB.join(', ')}`);
    assert.deepEqual(missingFromA, [], `${label}: gate has members the validator lacks: ${missingFromA.join(', ')}`);
  };

  it('KNOWN_GOOD_BINARIES is identical across the two layers', () => {
    assertSetEqual(KNOWN_GOOD_BINARIES, gateKnownGood, 'known-good binaries');
  });
  it('NPM_ALLOWED_SUBCMDS is identical across the two layers', () => {
    assertSetEqual(NPM_ALLOWED_SUBCMDS, gateNpm, 'npm subcommands');
  });
  it('CARGO_ALLOWED_SUBCMDS is identical across the two layers', () => {
    assertSetEqual(CARGO_ALLOWED_SUBCMDS, gateCargo, 'cargo subcommands');
  });
  it('BENIGN_ENV_VARS exact-name set is identical across the two layers', () => {
    assertSetEqual(BENIGN_ENV_VARS, gateBenignEnv, 'benign env-var exact names');
  });
  it('the CARGO_ env rule agrees across the two layers (spot-check the predicate parity)', () => {
    // The gate mirrors isBenignEnvVar; verify the shared decisions the source
    // string can only express as a regex + CARGO_HOME carve-out.
    assert.equal(isBenignEnvVar('CARGO_TERM_COLOR'), true);
    assert.equal(isBenignEnvVar('CARGO_INCREMENTAL'), true);
    assert.equal(isBenignEnvVar('CARGO_HOME'), false);
    assert.equal(isBenignEnvVar('CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_RUNNER'), false);
    assert.equal(isBenignEnvVar('CARGO_BUILD_RUSTC_WRAPPER'), false);
    assert.match(gateSource, /CARGO_EXEC_OVERRIDE_RE\s*=\s*\/RUSTC\|LINKER\|RUNNER\|RUSTDOC\/i/,
      'gate must carry the identical cargo exec-override regex');
    assert.match(gateSource, /name === 'CARGO_HOME'/, 'gate must carry the identical CARGO_HOME carve-out');
  });

  it('validator git coordination set is DISJOINT from the gate write-vector set', () => {
    for (const sub of GIT_COORDINATION_SUBCMDS) {
      assert.ok(!gateWriteSubcmds.has(sub),
        `coordination subcommand "${sub}" is also a gate write-vector — the two sets drifted`);
    }
  });
});
