import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
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
    const agentPath = join(dir, '.claude', 'agents', 'developer.md');
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

  // Project-brain health check (M-1 wiring). A brain that points at a
  // non-existent cold store is flagged (the anti-fabrication guard).
  const VALID_BRAIN_FM = [
    '---',
    'schema: project-brain/1',
    'updated: 2026-08-13T14:00:00Z',
    'checkpoint: 1',
    'phase: implementation',
    '---',
    '',
  ].join('\n');

  const BRAIN_SECTIONS = (factsLine) => [
    '## What this is (and why)',
    'A test project.',
    '',
    '## Current mental model',
    '- hooks enforce',
    '',
    '## Load-bearing facts',
    factsLine,
    '',
    '## Active threads',
    '- t — s — n — artifacts/context/decision-log.md @c1',
    '',
    '## Dead ends',
    '- d — rejected @c1',
    '',
    '## Open questions',
    '- q?',
    '',
    '## Pointers',
    '- decision-log: artifacts/context/decision-log.md',
    '',
  ].join('\n');

  function writeBrain(dir, factsLine) {
    const ctx = join(dir, 'artifacts', 'context');
    mkdirSync(ctx, { recursive: true });
    // A decision log so D-ID resolution has something to check against.
    writeFileSync(join(ctx, 'decision-log.md'), '# Decision Log\n## D-1 — a real decision\n');
    writeFileSync(join(ctx, 'project-brain.md'), VALID_BRAIN_FM + BRAIN_SECTIONS(factsLine));
  }

  it('flags a dangling brain pointer', () => {
    const dir = join(tmpDir, 'brain-dangling');
    mkdirSync(dir, { recursive: true });
    execSync(`node "${CLI}" init -y`, { cwd: dir, encoding: 'utf8' });
    // A load-bearing fact that points at a file which does not exist.
    writeBrain(dir, '- claim (see artifacts/context/does-not-exist.md)');
    try {
      execSync(`node "${CLI}" doctor`, { cwd: dir, encoding: 'utf8' });
      assert.fail('Should have flagged the dangling brain pointer');
    } catch (err) {
      const out = (err.stdout || '') + (err.stderr || '');
      assert.match(out, /dangling path/);
      assert.match(out, /does-not-exist\.md/);
    }
  });

  it('passes brain health when all pointers resolve', () => {
    const dir = join(tmpDir, 'brain-ok');
    mkdirSync(dir, { recursive: true });
    execSync(`node "${CLI}" init -y`, { cwd: dir, encoding: 'utf8' });
    writeBrain(dir, '- the log lives at artifacts/context/decision-log.md (D-1)');
    const out = execSync(`node "${CLI}" doctor`, { cwd: dir, encoding: 'utf8' });
    assert.match(out, /project brain pointers resolve/);
  });
});
