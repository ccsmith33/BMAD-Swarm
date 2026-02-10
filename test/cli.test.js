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
    assert.ok(existsSync(join(dir, 'project.yaml')));
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
});
