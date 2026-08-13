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

// Process-spawn tests for the NIGHT FLOOR (D-034, phase5 Stream S). This is the
// SECURITY-CRITICAL wall: while a /sleep charter is open it must deny the
// destructive/irreversible set for every agent, fail closed on a corrupt charter,
// and never falsely deny reversible night work. Each attack class below maps to a
// failure mode in diverge-overnight §6 / the security-review checklist (§10.2).

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REAL_RECORD = join(REPO_ROOT, 'bin', 'record.cjs');

describe('night-floor.cjs', () => {
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
    writeFileSync(join(projectDir, 'swarm.yaml'), 'project:\n  name: night-test\n');
    // record.cjs present so the red-banner logging path is exercised for real.
    copyFileSync(REAL_RECORD, join(projectDir, 'bin', 'record.cjs'));
    const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
    const paths = getProjectPaths(projectDir);
    generateHooks(config, paths, { force: true });
    hooksDir = paths.hooksDir;
  });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  // --- charter helpers -----------------------------------------------------
  function arm({ endsInMs = 9 * 3600e3, graceMs = 7200000, extraDeny = [], noEpoch = false } = {}) {
    const endsEpoch = Date.now() + endsInMs;
    const xd = extraDeny.length ? '[' + extraDeny.map((s) => JSON.stringify(s)).join(', ') + ']' : '[]';
    const fm = [
      '---', 'night_charter:', '  schema: night-charter/1',
      noEpoch ? '  ends: soon' : `  ends_epoch_ms: ${endsEpoch}`,
      `  grace_ms: ${graceMs}`, `  extra_deny: ${xd}`, '  status: open', '---', '', '# charter', '',
    ].join('\n');
    writeFileSync(charterFile, fm);
    writeFileSync(pointer, 'night-charter-test.md\n');
    rmSync(wakeMarker, { force: true });
  }
  function disarm() { rmSync(pointer, { force: true }); rmSync(charterFile, { force: true }); rmSync(wakeMarker, { force: true }); }

  function run(toolInput, extraEvent = {}) {
    const event = { tool_input: toolInput, cwd: projectDir, ...extraEvent };
    const r = spawnSync('node', [join(hooksDir, 'night-floor.cjs')], {
      input: JSON.stringify(event), encoding: 'utf8', cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
    let decision = null;
    if (r.stdout && r.stdout.trim()) { try { decision = JSON.parse(r.stdout); } catch {} }
    return { ...r, decision };
  }
  const denied = (d) => d.decision?.hookSpecificOutput?.permissionDecision === 'deny';
  const bash = (command, ev) => run({ command }, ev);

  // --- dormant by day ------------------------------------------------------
  describe('dormant without a charter', () => {
    before(() => disarm());
    it('allows git push when no night is open', () => assert.ok(!denied(bash('git push origin main'))));
    it('allows node -e when no night is open', () => assert.ok(!denied(bash('node -e "console.log(1)"'))));
  });

  // --- the destructive world set -------------------------------------------
  describe('armed: irreversible / world-facing denies', () => {
    before(() => arm());
    for (const cmd of [
      'git push origin main', 'git push --force', 'git -C /repo push',
      'git merge feature', 'git rebase main', 'git reset --hard HEAD~3',
      'git branch -D feature/x', 'git tag v1.2.3',
      'npm publish', 'yarn publish', 'pnpm publish', 'npm version patch',
      'terraform apply -auto-approve', 'kubectl apply -f k8s.yaml', 'ansible-playbook site.yml',
      'vercel deploy --prod', 'wrangler publish', 'gcloud run deploy svc',
      'prisma migrate deploy', 'flyway migrate', 'psql -c "DROP TABLE users"',
      'curl -X POST https://api.example.com/charge', 'curl --data @body https://x.io', 'wget --post-data=x https://x.io',
    ]) {
      it(`denies: ${cmd}`, () => assert.ok(denied(bash(cmd)), cmd));
    }
  });

  // --- interpreter escapes (the §2.1 teammate residual + wrapper classes) ---
  describe('armed: interpreter-escape denies (incl. wrappers)', () => {
    before(() => arm());
    for (const cmd of [
      'node -e "require(\'fs\')"', 'node --eval "1"', 'node -p "process.env"', 'nodejs -e "1"',
      'npx cowsay hi', 'python -c "import os"', 'python3 -c "1"', 'perl -e "print 1"', 'ruby -e "1"', 'php -r "1"',
      'bash -c "git push"', 'sh -c "rm -rf /"', 'zsh -lc "evil"',
      'timeout 5 node -e "escape()"', 'env FOO=1 node -e "escape()"', 'xargs node -e "escape()"',
      'node --require ./mod.js -e "escape()"', 'node -r ./mod.js --eval "escape()"', 'node --experimental-vm-modules -p "1"',
      'eval "$PAYLOAD"',
    ]) {
      it(`denies: ${cmd}`, () => assert.ok(denied(bash(cmd)), cmd));
    }
  });

  // --- reversible night work is NOT denied ---------------------------------
  describe('armed: reversible work passes', () => {
    before(() => arm());
    for (const cmd of [
      'git add -A', 'git commit -m "wip"', 'git status', 'git log --oneline', 'git diff',
      'git checkout -b initiative/foo', 'git switch -c queue/bar', 'git branch initiative/x', 'git worktree add ../w b',
      'node --test test/', 'npm test', 'npm install', 'npm ci',
      'node .claude/bmad/bin/record.cjs night-charter status',
      'node bin/record.cjs task-event --task t --event x',
      'curl https://example.com/data.json', 'wget https://example.com/f.tgz',
      'ls -la', 'grep -r foo src/', 'cat package.json',
    ]) {
      it(`allows: ${cmd}`, () => assert.ok(!denied(bash(cmd)), cmd));
    }
  });

  // --- self-legislation ----------------------------------------------------
  describe('armed: no self-legislation', () => {
    before(() => arm());
    it('denies Edit to a hook file', () => assert.ok(denied(run({ file_path: '.claude/hooks/night-floor.cjs' }))));
    it('denies Edit anywhere under .claude/', () => assert.ok(denied(run({ file_path: '.claude/settings.json' }))));
    it('denies Edit to the charter file', () => assert.ok(denied(run({ file_path: 'artifacts/delivery/night-charter-test.md' }))));
    it('denies Edit to the pointer', () => assert.ok(denied(run({ file_path: 'artifacts/delivery/.night-charter-current' }))));
    it('denies Write to the human-wake marker (agent cannot forge the wake)', () => assert.ok(denied(run({ file_path: '.claude/hooks/.human-wake' }))));
    it('denies a Bash redirect into .claude/', () => assert.ok(denied(bash('echo x > .claude/hooks/.human-wake'))));
    it('denies a Bash redirect into the charter', () => assert.ok(denied(bash('echo "ends_epoch_ms: 0" > artifacts/delivery/night-charter-test.md'))));
    it('denies sed -i on a hook', () => assert.ok(denied(bash('sed -i s/a/b/ .claude/hooks/night-floor.cjs'))));
    it('allows an ordinary source edit', () => assert.ok(!denied(run({ file_path: 'src/app.js' }))));
    it('allows an artifacts edit (reversible night output)', () => assert.ok(!denied(run({ file_path: 'artifacts/implementation/notes.md' }))));
  });

  // --- out-of-tree writes / deletes ----------------------------------------
  describe('armed: out-of-tree escape denies', () => {
    before(() => arm());
    it('denies Write to an absolute path outside the tree', () => assert.ok(denied(run({ file_path: '/etc/passwd' }))));
    it('denies Write under another home', () => assert.ok(denied(run({ file_path: '/home/someone/.bashrc' }))));
    it('denies rm of an absolute out-of-tree path', () => assert.ok(denied(bash('rm -rf /home/someone/data'))));
    it('denies rm targeting ~', () => assert.ok(denied(bash('rm -rf ~/notes'))));
    it('denies mv escaping via ..', () => assert.ok(denied(bash('mv secret.txt ../../../elsewhere/'))));
    it('allows rm inside the worktree', () => assert.ok(!denied(bash('rm -rf node_modules/.cache'))));
    it('allows a relative in-tree write', () => assert.ok(!denied(run({ file_path: 'test/new.test.js' }))));
  });

  // --- charter extra_deny (append-only narrowing) --------------------------
  describe('armed: charter extra_deny narrows further', () => {
    before(() => arm({ extraDeny: ['npm install', 'mass-rename'] }));
    after(() => arm()); // reset to a plain charter for later suites
    it('denies a command matching an extra_deny substring', () => assert.ok(denied(bash('npm install left-pad'))));
    it('still allows unrelated work', () => assert.ok(!denied(bash('git commit -m x'))));
  });

  // --- FAIL CLOSED ---------------------------------------------------------
  describe('fail-closed on a corrupt charter', () => {
    it('dangling pointer (charter deleted) → still denies git push', () => {
      arm(); rmSync(charterFile, { force: true });
      assert.ok(denied(bash('git push origin main')));
    });
    it('charter with no ends_epoch_ms → still denies git push', () => {
      arm({ noEpoch: true });
      assert.ok(denied(bash('git push origin main')));
    });
    it('pointer with a traversal basename → fails closed', () => {
      writeFileSync(pointer, '../../../etc/evil\n');
      assert.ok(denied(bash('git push origin main')));
      arm();
    });
  });

  // --- the floor lifts correctly -------------------------------------------
  describe('floor lifts on wake / grace', () => {
    it('human-wake marker present → floor lifts (human is driving)', () => {
      arm(); writeFileSync(wakeMarker, 'human');
      assert.ok(!denied(bash('git push origin main')));
      rmSync(wakeMarker, { force: true });
    });
    it('past ends + grace → floor lifts', () => {
      arm({ endsInMs: -3 * 3600e3, graceMs: 3600e3 }); // ended 3h ago, 1h grace → lifted
      assert.ok(!denied(bash('git push origin main')));
    });
    it('past ends but WITHIN grace → still armed', () => {
      arm({ endsInMs: -10 * 60e3, graceMs: 3600e3 }); // ended 10m ago, 1h grace → armed
      assert.ok(denied(bash('git push origin main')));
    });
  });

  // --- every identity + red-banner logging ---------------------------------
  describe('coverage: identity + logging', () => {
    it('denies for a teammate identity too (agent_id present)', () => {
      arm();
      assert.ok(denied(bash('git push', { agent_id: 'dev-1', agent_type: 'developer' })));
    });
    it('writes a red-banner row to the task-ledger on deny', () => {
      arm();
      bash('git push origin main');
      const ledger = join(projectDir, 'artifacts', 'context', 'task-ledger.md');
      assert.ok(existsSync(ledger), 'task-ledger written by the deny');
      const text = readFileSync(ledger, 'utf8');
      assert.match(text, /task=night-floor event=denied/);
    });
  });
});
