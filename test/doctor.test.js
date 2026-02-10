import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI = join(__dirname, '..', 'bin', 'bmad-swarm.js');

describe('Doctor Command', () => {
  const tmpDir = join(tmpdir(), 'bmad-doctor-test-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes on healthy project', () => {
    const dir = join(tmpDir, 'healthy');
    mkdirSync(dir, { recursive: true });
    execSync(`node "${CLI}" init -y`, { cwd: dir, encoding: 'utf8' });
    const output = execSync(`node "${CLI}" doctor`, { cwd: dir, encoding: 'utf8' });
    assert.ok(output.includes('All checks passed'));
  });

  it('fails on uninitiated project', () => {
    const dir = join(tmpDir, 'empty');
    mkdirSync(dir, { recursive: true });
    try {
      execSync(`node "${CLI}" doctor`, { cwd: dir, encoding: 'utf8' });
      assert.fail('Should have exited with error');
    } catch (err) {
      assert.ok(err.stdout.includes('not found') || err.stderr.includes('not found'));
    }
  });

  it('detects missing agent files', () => {
    const dir = join(tmpDir, 'missing-agent');
    mkdirSync(dir, { recursive: true });
    execSync(`node "${CLI}" init -y`, { cwd: dir, encoding: 'utf8' });
    // Delete one agent
    const agentPath = join(dir, '.claude', 'agents', 'qa.md');
    if (existsSync(agentPath)) {
      rmSync(agentPath);
    }
    try {
      execSync(`node "${CLI}" doctor`, { cwd: dir, encoding: 'utf8' });
      assert.fail('Should have detected missing agent');
    } catch (err) {
      assert.ok(err.stdout.includes('missing') || err.stderr.includes('missing'));
    }
  });
});
