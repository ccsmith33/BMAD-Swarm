import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI = join(__dirname, '..', 'bin', 'bmad-swarm.js');

function run(cmd, cwd) {
  return execSync(`node "${CLI}" ${cmd}`, { cwd, encoding: 'utf8', timeout: 15000 });
}

function runFail(cmd, cwd) {
  try {
    execSync(`node "${CLI}" ${cmd}`, { cwd, encoding: 'utf8', timeout: 15000 });
    return null;
  } catch (err) {
    return err.stderr || err.stdout || err.message;
  }
}

describe('CLI Integration', () => {
  const tmpBase = join(tmpdir(), 'bmad-cli-test-' + Date.now());

  before(() => {
    mkdirSync(tmpBase, { recursive: true });
  });

  after(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('init -y creates all expected files', () => {
    const dir = join(tmpBase, 'init-basic');
    mkdirSync(dir, { recursive: true });
    const output = run('init -y', dir);
    assert.ok(output.includes('Generated swarm.yaml'));
    assert.ok(existsSync(join(dir, 'swarm.yaml')));
    assert.ok(existsSync(join(dir, '.claude', 'agents', 'orchestrator.md')));
    assert.ok(existsSync(join(dir, '.claude', 'settings.json')));
    assert.ok(existsSync(join(dir, 'CLAUDE.md')));
    // project.yaml is RETIRED (D-037): machine state lives in the project-brain
    // frontmatter, not a prompted chore-file. init must NOT create it.
    assert.ok(!existsSync(join(dir, 'project.yaml')), 'init must not create the retired project.yaml');
    assert.ok(existsSync(join(dir, 'artifacts')));
  });

  it('init -y --template next-app applies template values', () => {
    const dir = join(tmpBase, 'init-template');
    mkdirSync(dir, { recursive: true });
    run('init -y --template next-app', dir);
    const yaml = readFileSync(join(dir, 'swarm.yaml'), 'utf8');
    assert.ok(yaml.includes('TypeScript'));
    assert.ok(yaml.includes('Next.js'));
    assert.ok(yaml.includes('Jest'));
  });

  it('init -y --scan applies detected values', () => {
    const dir = join(tmpBase, 'init-scan');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.18.0' },
      devDependencies: { typescript: '^5.0', jest: '^29' },
    }));
    run('init -y --scan', dir);
    const yaml = readFileSync(join(dir, 'swarm.yaml'), 'utf8');
    assert.ok(yaml.includes('TypeScript'));
    assert.ok(yaml.includes('Express'));
  });

  it('update regenerates after init', () => {
    const dir = join(tmpBase, 'update-test');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const output = run('update', dir);
    assert.ok(output.includes('Regenerated'));
  });

  it('update migrates a legacy project.yaml into the brain frontmatter and deletes it (D-037 / step 4.2)', () => {
    const dir = join(tmpBase, 'migrate-project-yaml');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    // Simulate a pre-D-037 project that still carries a project.yaml.
    writeFileSync(join(dir, 'project.yaml'), 'project:\n  name: legacy\nphase: design\nstatus: initialized\n');
    const output = run('update', dir);
    assert.match(output, /Migrated project\.yaml/);
    assert.ok(!existsSync(join(dir, 'project.yaml')), 'project.yaml must be deleted by the migration');
    const brain = readFileSync(join(dir, 'artifacts', 'context', 'project-brain.md'), 'utf8');
    assert.match(brain, /phase:\s*design/, 'migrated phase must land in the brain frontmatter');
  });

  it('update --dry-run does not write files', () => {
    const dir = join(tmpBase, 'dry-run');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const agentBefore = readFileSync(join(dir, '.claude', 'agents', 'orchestrator.md'), 'utf8');
    const output = run('update --dry-run', dir);
    assert.ok(output.includes('Would regenerate'));
    const agentAfter = readFileSync(join(dir, '.claude', 'agents', 'orchestrator.md'), 'utf8');
    assert.equal(agentBefore, agentAfter);
  });

  it('status shows project info', () => {
    const dir = join(tmpBase, 'status-test');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const output = run('status', dir);
    assert.ok(output.includes('my-project') || output.includes('Project'));
  });

  it('eject and uneject agent', () => {
    const dir = join(tmpBase, 'eject-test');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    run('eject agent orchestrator', dir);
    assert.ok(existsSync(join(dir, 'overrides', 'agents', 'orchestrator.md')));
    run('uneject agent orchestrator', dir);
    assert.ok(!existsSync(join(dir, 'overrides', 'agents', 'orchestrator.md')));
  });

  it('init fails on already-initialized project', () => {
    const dir = join(tmpBase, 'double-init');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const err = runFail('init -y', dir);
    assert.ok(err, 'Should fail on double init');
  });

  it('update fails without swarm.yaml', () => {
    const dir = join(tmpBase, 'no-yaml');
    mkdirSync(dir, { recursive: true });
    const err = runFail('update', dir);
    assert.ok(err, 'Should fail without swarm.yaml');
  });

  it('start --print outputs a bare claude command (identity loads via /identity-orchestrator slash command)', () => {
    const dir = join(tmpBase, 'start-print');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const output = run('start --print', dir);
    assert.ok(output.includes('claude'), 'Should print the claude command');
    assert.ok(!output.includes('--append-system-prompt'), 'Should NOT pass --append-system-prompt (system prompt mechanism removed in Option C)');
    assert.ok(!output.includes('--disallowedTools'), 'Should NOT include --disallowedTools');
    assert.ok(!output.includes('--dangerously-skip-permissions'), 'Should NOT include --dangerously-skip-permissions');
  });

  it('start --print does not include tool restrictions (handled by settings.json)', () => {
    const dir = join(tmpBase, 'start-no-restrictions');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const output = run('start --print', dir);
    assert.ok(!output.includes('--disallowedTools'), 'Should NOT include --disallowedTools');
    assert.ok(!output.includes('--allow-tools'), 'Should NOT include --allow-tools');
  });

  it('start --help shows --print flag', () => {
    const dir = join(tmpBase, 'start-help');
    mkdirSync(dir, { recursive: true });
    const output = run('start --help', dir);
    assert.ok(output.includes('--print'), 'Should show --print flag');
  });

  it('init -y --github generates GitHub Actions workflow', () => {
    const dir = join(tmpBase, 'init-github');
    mkdirSync(dir, { recursive: true });
    run('init -y --github', dir);
    const workflowPath = join(dir, '.github', 'workflows', 'bmad-validate.yml');
    assert.ok(existsSync(workflowPath), 'Should create workflow file');
    const content = readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('BMAD Validate'), 'Should contain workflow name');
    assert.ok(content.includes('bmad-swarm@latest validate'), 'Should contain the resolvable validate step');
  });

  it('F-018: --github workflow is runnable from a CI checkout', () => {
    const dir = join(tmpBase, 'init-github-f018');
    mkdirSync(dir, { recursive: true });
    run('init -y --github', dir);
    const content = readFileSync(join(dir, '.github', 'workflows', 'bmad-validate.yml'), 'utf8');

    // doctor needs .claude/, which is gitignored and absent from CI
    // checkouts — its presence guarantees a red workflow.
    assert.ok(!content.includes('bmad-swarm doctor'), 'workflow must not run doctor');

    // F-023: CI must resolve a *published* package. Pinning this repo's
    // local package.json version (`npm install -g bmad-swarm@<version>`)
    // 404s on npm until that exact version is published, reddening the
    // first run of every generated workflow. Use `npx bmad-swarm@latest`,
    // which resolves whatever is actually published.
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    assert.ok(!content.includes(`${pkg.name}@${pkg.version}`),
      'workflow must NOT pin the unpublished local package version (F-023)');
    assert.match(content, /npx\s+--yes\s+bmad-swarm@latest\s+validate/,
      'CI must run a resolvable published spec (npx --yes bmad-swarm@latest validate)');

    // F-D4: supported Node runtime, least-privilege token, and a push
    // trigger so main itself gets a validation signal (pull_request alone
    // never runs on merge commits).
    assert.ok(content.includes("node-version: '22'"), 'CI must target a supported Node version (18 is EOL)');
    assert.match(content, /permissions:\s*\n\s+contents: read/, 'workflow must declare a read-only token');
    assert.match(content, /on:\s*\n\s+push:\s*\n\s+branches: \[main, master\]/,
      'workflow must trigger on pushes to main');

    // Trigger paths must stay within the D-042 git-tracked set
    // (artifacts/**, swarm.yaml). Nothing under .claude/, project.yaml, or
    // overrides/ (permanently gitignored) may appear, or the trigger can
    // never fire. Full trigger-vs-.gitignore composition also needs the
    // D-042 gitignore flip in updateGitignore (shared change, tracked
    // separately).
    const pathLines = content.split('\n').filter(l => /^\s+- '/.test(l)).map(l => l.trim().slice(3, -1));
    assert.ok(pathLines.length > 0, 'workflow should have a paths filter');
    const tracked = ['artifacts/**', 'swarm.yaml'];
    for (const p of pathLines) {
      assert.ok(tracked.includes(p), `trigger path ${p} must be in the D-042 git-tracked set`);
    }
  });

  it('F-017: interactive init on piped (non-TTY) stdin fails loudly instead of silent exit 0', () => {
    const dir = join(tmpBase, 'init-non-tty');
    mkdirSync(dir, { recursive: true });
    let failed = null;
    try {
      execSync(`node "${CLI}" init`, {
        cwd: dir,
        encoding: 'utf8',
        timeout: 15000,
        input: 'proj\ndesc\nweb-app\nJS\n\n\n\nauto\n',
      });
    } catch (err) {
      failed = err;
    }
    assert.ok(failed, 'init must exit non-zero when prompts cannot be answered');
    const stderr = failed.stderr || '';
    assert.match(stderr, /not a TTY|stdin closed/i, 'error must explain the non-TTY failure');
    assert.match(stderr, /-y/, 'error must point at the non-interactive escape hatch');
    assert.ok(!existsSync(join(dir, 'swarm.yaml')), 'no half-initialized project may be left behind');
  });

  it('update removes the stale teamcreate-gate hook (ADR-015 re-anchor)', () => {
    const dir = join(tmpBase, 'update-stale-teamcreate');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const hooksDir = join(dir, '.claude', 'hooks');
    // Simulate the pre-ADR-015 generated hook (hash on line 2, after shebang).
    writeFileSync(join(hooksDir, 'teamcreate-gate.cjs'),
      '#!/usr/bin/env node\n// bmad-generated:abcd1234\n// old gate\n');

    const output = run('update', dir);
    assert.ok(!existsSync(join(hooksDir, 'teamcreate-gate.cjs')),
      'dead TeamCreate-anchored hook should be removed');
    assert.ok(existsSync(join(hooksDir, 'team-assembly-lint.cjs')),
      're-anchored lint should be present');
    assert.ok(output.includes('teamcreate-gate.cjs'), 'removal should be logged');
  });

  it('update preserves a manually modified teamcreate-gate hook', () => {
    const dir = join(tmpBase, 'update-modified-teamcreate');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const hooksDir = join(dir, '.claude', 'hooks');
    writeFileSync(join(hooksDir, 'teamcreate-gate.cjs'),
      '#!/usr/bin/env node\n// my hand-rolled gate, no marker\n');

    run('update', dir);
    assert.ok(existsSync(join(hooksDir, 'teamcreate-gate.cjs')),
      'files without the generated marker must not be deleted');
  });

  it('start --dangerous is not a valid option (permissions handled by settings.json)', () => {
    const dir = join(tmpBase, 'start-dangerous');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    try {
      execSync(`node "${CLI}" start --dangerous --print`, {
        cwd: dir,
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      assert.fail('Should have thrown for unknown option');
    } catch (err) {
      const stderr = err.stderr || '';
      assert.ok(stderr.includes('unknown option'), 'Should report unknown option --dangerous');
    }
  });

  it('start --print without --dangerous does not show warning', () => {
    const dir = join(tmpBase, 'start-no-dangerous');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const output = run('start --print', dir);
    assert.ok(!output.includes('WARNING'), 'Should NOT show warning without --dangerous');
  });

  it('init -y without --github does not generate workflow', () => {
    const dir = join(tmpBase, 'init-no-github');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const workflowPath = join(dir, '.github', 'workflows', 'bmad-validate.yml');
    assert.ok(!existsSync(workflowPath), 'Should NOT create workflow file without --github');
  });

  it('init --help shows --github flag', () => {
    const dir = join(tmpBase, 'init-help-github');
    mkdirSync(dir, { recursive: true });
    const output = run('init --help', dir);
    assert.ok(output.includes('--github'), 'Should show --github flag');
  });

  it('init -y shows correct hooks count (not undefined)', () => {
    const dir = join(tmpBase, 'init-hooks-count');
    mkdirSync(dir, { recursive: true });
    const output = run('init -y', dir);
    assert.ok(output.includes('hooks/'), 'Should mention hooks');
    assert.ok(!output.includes('undefined'), 'Should not contain undefined in output');
    assert.match(output, /\d+ hooks\)/, 'Should show a numeric hooks count');
  });

  it('update shows correct hooks count (not undefined)', () => {
    const dir = join(tmpBase, 'update-hooks-count');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const output = run('update', dir);
    assert.ok(!output.includes('undefined'), 'Should not contain undefined in update output');
    assert.match(output, /\d+ hooks\)/, 'Should show a numeric hooks count');
  });

  it('update removes stale orchestrator rule files', () => {
    const dir = join(tmpBase, 'update-stale-rules');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    // Simulate stale orchestrator rule files from a previous version
    const rulesDir = join(dir, '.claude', 'rules');
    writeFileSync(join(rulesDir, 'orchestrator-identity.md'), '<!-- bmad-generated:abcd1234 -->\n# Old rule content\n');
    writeFileSync(join(rulesDir, 'orchestrator-methodology.md'), '<!-- bmad-generated:ef005678 -->\n# Old methodology\n');
    assert.ok(existsSync(join(rulesDir, 'orchestrator-identity.md')), 'Stale file should exist before update');

    const output = run('update', dir);
    assert.ok(!existsSync(join(rulesDir, 'orchestrator-identity.md')), 'orchestrator-identity.md should be removed');
    assert.ok(!existsSync(join(rulesDir, 'orchestrator-methodology.md')), 'orchestrator-methodology.md should be removed');
    assert.ok(output.includes('Removed stale') || output.includes('removed'), 'Should log removal of stale files');
  });

  it('update preserves manually modified orchestrator rule files', () => {
    const dir = join(tmpBase, 'update-modified-rules');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    // Create a manually modified orchestrator rule file (no bmad-generated header)
    const rulesDir = join(dir, '.claude', 'rules');
    writeFileSync(join(rulesDir, 'orchestrator-identity.md'), '# My custom orchestrator identity rules\nDo not delete me.\n');

    run('update', dir);
    assert.ok(existsSync(join(rulesDir, 'orchestrator-identity.md')), 'Manually modified file should be preserved');
  });
});
