import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import { getCurrentPhase, getAvailableTransitions, advancePhase, setPhase, PHASE_ORDER } from '../utils/phase-machine.js';

describe('Phase Machine', () => {
  const tmpDir = join(tmpdir(), 'bmad-phase-test-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function createProjectYaml(phase = 'not-started') {
    const path = join(tmpDir, `project-${Date.now()}.yaml`);
    writeFileSync(path, yaml.dump({ project: { name: 'test' }, phase, status: 'initialized' }));
    return path;
  }

  it('gets current phase', () => {
    const path = createProjectYaml('design');
    const result = getCurrentPhase(path);
    assert.equal(result.phase, 'design');
  });

  it('gets available transitions', () => {
    assert.deepEqual(getAvailableTransitions('not-started'), ['ideation']);
    assert.deepEqual(getAvailableTransitions('design'), ['implementation']);
    assert.deepEqual(getAvailableTransitions('complete'), []);
  });

  it('advances phase', () => {
    const path = createProjectYaml('not-started');
    const result = advancePhase(path);
    assert.equal(result.from, 'not-started');
    assert.equal(result.to, 'ideation');
    const updated = getCurrentPhase(path);
    assert.equal(updated.phase, 'ideation');
  });

  it('records phase history', () => {
    const path = createProjectYaml('not-started');
    advancePhase(path);
    advancePhase(path);
    const { history } = getCurrentPhase(path);
    assert.ok(history.length >= 2);
    assert.equal(history[0].phase, 'ideation');
    assert.equal(history[1].phase, 'exploration');
  });

  it('sets specific phase', () => {
    const path = createProjectYaml('not-started');
    const result = setPhase(path, 'implementation');
    assert.equal(result.to, 'implementation');
  });

  it('rejects invalid phase without force', () => {
    const path = createProjectYaml();
    assert.throws(() => setPhase(path, 'invalid-phase'), /invalid/i);
  });

  it('allows invalid phase with force', () => {
    const path = createProjectYaml();
    const result = setPhase(path, 'custom-phase', { force: true });
    assert.equal(result.to, 'custom-phase');
  });

  it('throws on advance from final phase', () => {
    const path = createProjectYaml('complete');
    assert.throws(() => advancePhase(path), /cannot advance/i);
  });

  it('throws on missing project.yaml', () => {
    assert.throws(() => getCurrentPhase('/nonexistent/project.yaml'), /not found/i);
  });

  it('PHASE_ORDER has correct sequence', () => {
    assert.ok(PHASE_ORDER.indexOf('not-started') < PHASE_ORDER.indexOf('ideation'));
    assert.ok(PHASE_ORDER.indexOf('ideation') < PHASE_ORDER.indexOf('exploration'));
    assert.ok(PHASE_ORDER.indexOf('implementation') < PHASE_ORDER.indexOf('delivery'));
    assert.ok(PHASE_ORDER.indexOf('delivery') < PHASE_ORDER.indexOf('complete'));
  });
});
