import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateOrchestratorAllowEntry,
  SAFE_DEFAULT_ALLOW,
  GIT_COORDINATION_SUBCMDS,
  DENY_LEADING_BINARIES,
  WRAPPER_BINARIES,
  EXEC_AFFECTING_ENV_VARS,
} from '../utils/orchestrator-allow.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Extract a `const <NAME> = new Set([ ... ])` literal's string members from a
// source file. Used to pin the gate's sets (standalone CJS, cannot be imported)
// to the validator's exported sets — §3.6 single-source-of-truth-by-test.
function extractSetLiteral(source, name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)');
  const m = re.exec(source);
  assert.ok(m, `could not find "const ${name} = new Set([...])" in the gate source`);
  return new Set([...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
}

describe('orchestrator-allow validator', () => {
  const ok = (e) => validateOrchestratorAllowEntry(e).ok;
  const why = (e) => validateOrchestratorAllowEntry(e).reason;

  describe('accepts safe entries', () => {
    const ACCEPT = [
      'Bash(cargo check:*)',
      'Bash(bundle exec rubocop:*)',
      'Bash(go test:*)',
      'Bash(cargo build)',
      'Bash(pnpm test:*)',           // pnpm is fine — only `pnpm dlx` is refused
      'Bash(yarn lint:*)',
      'Bash(git commit:*)',
      'Bash(git merge --ff-only:*)',
      'Bash(bmad-swarm validate:*)',
      'Bash(node .claude/bmad/bin/record.cjs:*)',     // pinned-script exception
      'Bash(node .claude/bmad/bin/replay-check.cjs:*)',
      'Bash(RUSTFLAGS=-D cargo check:*)',             // env-var prefix, real command follows
      'Bash(CI=1 npm test:*)',                        // benign env prefix stays allowed
      'Bash(CARGO_TERM_COLOR=always cargo build:*)',  // benign CARGO_* env prefix
    ];
    for (const entry of ACCEPT) {
      it(`accepts ${entry}`, () => {
        assert.ok(ok(entry), `${entry} should be accepted, got: ${why(entry)}`);
      });
    }
  });

  describe('refuses dangerous entries', () => {
    const REJECT = [
      ['bare git (would allow git apply/reset)', 'Bash(git:*)'],
      ['git non-coordination subcommand (apply)', 'Bash(git apply:*)'],
      ['git reset (not coordination)', 'Bash(git reset:*)'],
      ['git stash (excluded)', 'Bash(git stash:*)'],
      ['node inline eval', 'Bash(node -e:*)'],
      ['node arbitrary script', 'Bash(node build.js:*)'],
      ['sh -c', 'Bash(sh -c ls:*)'],
      ['bash', 'Bash(bash script.sh:*)'],
      ['python', 'Bash(python3 x.py:*)'],
      ['npx anything', 'Bash(npx anything:*)'],
      ['pnpm dlx', 'Bash(pnpm dlx cowsay:*)'],
      ['yarn dlx', 'Bash(yarn dlx cowsay:*)'],
      ['redirection metacharacter', 'Bash(echo hi > f:*)'],
      ['chaining metacharacter', 'Bash(ls; rm -rf x:*)'],
      ['pipe metacharacter', 'Bash(cat x | sh:*)'],
      ['command substitution', 'Bash(echo $(whoami):*)'],
      ['backtick substitution', 'Bash(echo `id`:*)'],
      ['git push --force', 'Bash(git push --force:*)'],
      ['standalone -f force flag', 'Bash(git push -f:*)'],
      ['reset --hard literal', 'Bash(git reset --hard:*)'],
      ['tee write-util', 'Bash(tee x:*)'],
      ['dd write-util', 'Bash(dd of=x:*)'],
      ['cp write-util', 'Bash(cp a b:*)'],
      ['sed write-util', 'Bash(sed -i s/a/b/ f:*)'],
      ['curl network-execute', 'Bash(curl http://x:*)'],
      ['rm destructive', 'Bash(rm -rf x:*)'],
      ['vim editor', 'Bash(vim f:*)'],
      ['env wrapper prefix', 'Bash(env node -e 1:*)'],
      ['sudo wrapper', 'Bash(sudo make install:*)'],
      ['xargs wrapper', 'Bash(xargs rm:*)'],
      ['find wrapper', 'Bash(find . -delete:*)'],
      // F-INT-1 launcher-wrapper family — grantable-then-invisible bypass.
      ['timeout bare launcher', 'Bash(timeout:*)'],
      ['timeout node -e launcher', 'Bash(timeout node -e 1:*)'],
      ['timeout rm launcher', 'Bash(timeout rm -rf src:*)'],
      ['setsid launcher', 'Bash(setsid python3 evil.py:*)'],
      ['flock launcher', 'Bash(flock /tmp/l sh:*)'],
      ['chrt launcher', 'Bash(chrt 1 node build.js:*)'],
      ['ionice launcher', 'Bash(ionice node build.js:*)'],
      ['nice launcher', 'Bash(nice node build.js:*)'],
      ['unbuffer launcher', 'Bash(unbuffer node build.js:*)'],
      ['setarch launcher', 'Bash(setarch x86_64 sh:*)'],
      ['catchsegv launcher', 'Bash(catchsegv node build.js:*)'],
      ['watch launcher', 'Bash(watch node build.js:*)'],
      // F-INT-2 execution-affecting env-var prefixes.
      ['GIT_EXTERNAL_DIFF exec env prefix', 'Bash(GIT_EXTERNAL_DIFF=/tmp/evil git diff:*)'],
      ['GIT_SSH_COMMAND exec env prefix', 'Bash(GIT_SSH_COMMAND=/tmp/evil git fetch:*)'],
      ['GIT_PAGER exec env prefix', 'Bash(GIT_PAGER=/tmp/evil git log:*)'],
      ['GIT_CONFIG_GLOBAL exec env prefix', 'Bash(GIT_CONFIG_GLOBAL=/tmp/evil git commit:*)'],
      ['GIT_CONFIG_COUNT exec env prefix', 'Bash(GIT_CONFIG_COUNT=1 git commit:*)'],
      ['NODE_OPTIONS exec env prefix', 'Bash(NODE_OPTIONS=--require=/tmp/x.js npm test:*)'],
      ['LD_PRELOAD exec env prefix', 'Bash(LD_PRELOAD=/tmp/x.so git status:*)'],
      ['DYLD_INSERT_LIBRARIES exec env prefix', 'Bash(DYLD_INSERT_LIBRARIES=/tmp/x.dylib git status:*)'],
      ['PATH hijack env prefix', 'Bash(PATH=/tmp git commit:*)'],
      ['IFS hijack env prefix', 'Bash(IFS=x git commit:*)'],
      ['GIT_DIR env-prefix smuggling a git write', 'Bash(GIT_DIR=x git apply:*)'],
      ['non-Bash tool grant (WebFetch)', 'WebFetch'],
      ['non-Bash tool grant (mcp)', 'mcp__foo__bar'],
      ['node non-pinned .cjs path', 'Bash(node scripts/evil.cjs:*)'],
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
    // `Bash(git  commit:*)` — the tokenizer splits on \s+, so the double space
    // must not smuggle a bare-git grant past rule 4.
    assert.ok(ok('Bash(git  commit:*)'), 'double-space git commit should still be recognized as commit');
    assert.equal(ok('Bash(git  apply:*)'), false, 'double-space must not hide a non-coordination subcommand');
  });
});

// §3.6 — the validator's sets and the gate's sets are duplicated by
// construction (hooks are standalone CJS, no shared import) and pinned by THIS
// test. Drift breaks the build, not the field.
describe('validator ↔ gate set consistency (§3.6)', () => {
  const gateSource = readFileSync(
    join(REPO_ROOT, 'generators', 'hooks', 'orchestrator-write-gate.cjs.src'),
    'utf8',
  );
  const gateWriteSubcmds = extractSetLiteral(gateSource, 'GIT_WRITE_SUBCMDS');
  const gateDenyBinaries = extractSetLiteral(gateSource, 'DENY_BINARIES');
  const gateLauncherWrappers = extractSetLiteral(gateSource, 'LAUNCHER_WRAPPERS');
  const gateEnvVars = extractSetLiteral(gateSource, 'EXEC_AFFECTING_ENV_VARS');

  // Symmetric drift (a bypass missing from BOTH sides) is invisible to subset
  // checks — assert full EQUALITY on the wrapper and env-var denylist sets so
  // the two layers can never diverge on them again (F-INT-1 / F-INT-2).
  const assertSetEqual = (a, b, label) => {
    const missingFromB = [...a].filter((x) => !b.has(x));
    const missingFromA = [...b].filter((x) => !a.has(x));
    assert.deepEqual(missingFromB, [], `${label}: validator has members the gate lacks: ${missingFromB.join(', ')}`);
    assert.deepEqual(missingFromA, [], `${label}: gate has members the validator lacks: ${missingFromA.join(', ')}`);
  };

  it('validator git coordination set is DISJOINT from the gate write-vector set', () => {
    // A project may never grant a git subcommand the gate treats as a
    // write-vector — otherwise the allow-list would authorize a shape the gate
    // then fights.
    for (const sub of GIT_COORDINATION_SUBCMDS) {
      assert.ok(!gateWriteSubcmds.has(sub),
        `coordination subcommand "${sub}" is also a gate write-vector — the two sets drifted`);
    }
  });

  it('gate DENY_BINARIES ⊆ validator (DENY_LEADING_BINARIES ∪ WRAPPER_BINARIES)', () => {
    // Everything the gate tripwires must also be refused by the validator, so a
    // project can never pre-authorize a binary the gate denies at runtime.
    const validatorRefused = new Set([...DENY_LEADING_BINARIES, ...WRAPPER_BINARIES]);
    for (const bin of gateDenyBinaries) {
      assert.ok(validatorRefused.has(bin),
        `gate denies "${bin}" but the validator would not refuse it as a leading binary — drift`);
    }
  });

  it('validator WRAPPER_BINARIES === gate LAUNCHER_WRAPPERS (F-INT-1)', () => {
    // The launcher-wrapper set must be identical: the validator refuses these as
    // grants and the gate denies them at runtime. A member missing from either
    // side reopens the `timeout <interpreter>` grantable-then-invisible bypass.
    assertSetEqual(WRAPPER_BINARIES, gateLauncherWrappers, 'launcher-wrapper set');
  });

  it('validator EXEC_AFFECTING_ENV_VARS === gate EXEC_AFFECTING_ENV_VARS (F-INT-2)', () => {
    // The env-var denylist must be identical across the two layers so an
    // execution-affecting prefix (GIT_EXTERNAL_DIFF / NODE_OPTIONS / LD_PRELOAD /
    // …) can never be refused by one layer but accepted by the other.
    assertSetEqual(EXEC_AFFECTING_ENV_VARS, gateEnvVars, 'exec-affecting env-var denylist');
  });
});
