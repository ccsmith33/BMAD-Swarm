import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getCurrentPhase, getAvailableTransitions, advancePhase, setPhase, PHASE_ORDER,
  minimalBrainScaffold, migrateProjectYamlToBrain,
} from '../utils/phase-machine.js';
import { validateBrain } from '../utils/project-brain.js';

// Phase state is homed in the project-brain.md FRONTMATTER (D-037 / ADR-018),
// not project.yaml (deleted). These tests exercise the brain-frontmatter machine.

describe('Phase Machine (brain-frontmatter home, D-037)', () => {
  const tmpDir = join(tmpdir(), 'bmad-phase-test-' + Date.now());

  before(() => { mkdirSync(tmpDir, { recursive: true }); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  // Write a schema-valid brain at the given phase and return its path.
  function createBrain(phase = 'not-started') {
    const path = join(tmpDir, `brain-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
    writeFileSync(path, minimalBrainScaffold({ phase }));
    return path;
  }

  it('the minimal scaffold is schema-valid (all sections + required frontmatter incl. gates)', () => {
    const v = validateBrain(minimalBrainScaffold({ phase: 'implementation' }));
    assert.ok(v.ok, 'scaffold should validate: ' + v.errors.join('; '));
  });

  it('gets current phase from brain frontmatter', () => {
    const path = createBrain('design');
    assert.equal(getCurrentPhase(path).phase, 'design');
  });

  it('gets available transitions', () => {
    assert.deepEqual(getAvailableTransitions('not-started'), ['ideation']);
    assert.deepEqual(getAvailableTransitions('design'), ['implementation']);
    assert.deepEqual(getAvailableTransitions('complete'), []);
  });

  it('advances phase (and persists to the brain)', () => {
    const path = createBrain('not-started');
    const result = advancePhase(path);
    assert.equal(result.from, 'not-started');
    assert.equal(result.to, 'ideation');
    assert.equal(getCurrentPhase(path).phase, 'ideation');
  });

  it('records phase history in the frontmatter', () => {
    const path = createBrain('not-started');
    advancePhase(path);
    advancePhase(path);
    const { history } = getCurrentPhase(path);
    assert.ok(history.length >= 2);
    assert.equal(history[0].phase, 'ideation');
    assert.equal(history[1].phase, 'exploration');
  });

  it('preserves the prose body across a phase write', () => {
    const path = createBrain('not-started');
    setPhase(path, 'design');
    const v = validateBrain(readFileSync(path, 'utf8'));
    assert.ok(v.ok, 'brain still valid after write: ' + v.errors.join('; '));
  });

  it('sets a specific phase', () => {
    const path = createBrain('not-started');
    assert.equal(setPhase(path, 'implementation').to, 'implementation');
  });

  it('rejects an invalid phase without force', () => {
    const path = createBrain();
    assert.throws(() => setPhase(path, 'invalid-phase'), /invalid/i);
  });

  it('allows an invalid phase with force', () => {
    const path = createBrain();
    assert.equal(setPhase(path, 'custom-phase', { force: true }).to, 'custom-phase');
  });

  it('bootstraps a brain when setPhase runs with none present', () => {
    const path = join(tmpDir, `bootstrap-${Date.now()}.md`);
    assert.ok(!existsSync(path));
    setPhase(path, 'design');
    assert.ok(existsSync(path));
    assert.equal(getCurrentPhase(path).phase, 'design');
  });

  it('throws on advance from final phase', () => {
    const path = createBrain('complete');
    assert.throws(() => advancePhase(path), /cannot advance/i);
  });

  it('throws on a missing brain for getCurrentPhase', () => {
    assert.throws(() => getCurrentPhase('/nonexistent/project-brain.md'), /not found/i);
  });

  it('PHASE_ORDER has the correct sequence', () => {
    assert.ok(PHASE_ORDER.indexOf('not-started') < PHASE_ORDER.indexOf('ideation'));
    assert.ok(PHASE_ORDER.indexOf('ideation') < PHASE_ORDER.indexOf('exploration'));
    assert.ok(PHASE_ORDER.indexOf('implementation') < PHASE_ORDER.indexOf('delivery'));
    assert.ok(PHASE_ORDER.indexOf('delivery') < PHASE_ORDER.indexOf('complete'));
  });
});

describe('project.yaml → brain migration (D-037 / WS-11)', () => {
  const tmpDir = join(tmpdir(), 'bmad-migrate-test-' + Date.now());
  before(() => { mkdirSync(tmpDir, { recursive: true }); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function project(name) {
    const root = join(tmpDir, name);
    mkdirSync(join(root, 'artifacts', 'context'), { recursive: true });
    return { root, brainPath: join(root, 'artifacts', 'context', 'project-brain.md') };
  }

  it('folds a legacy project.yaml phase into a new brain and deletes project.yaml', () => {
    const { root, brainPath } = project('legacy-no-brain');
    writeFileSync(join(root, 'project.yaml'), 'project:\n  name: x\nphase: design\nstatus: initialized\n');

    const r = migrateProjectYamlToBrain(root, brainPath);
    assert.equal(r.migrated, true);
    assert.equal(r.phase, 'design');
    assert.equal(r.createdBrain, true);
    assert.ok(!existsSync(join(root, 'project.yaml')), 'project.yaml must be deleted');
    assert.equal(getCurrentPhase(brainPath).phase, 'design');
    assert.ok(validateBrain(readFileSync(brainPath, 'utf8')).ok);
  });

  it('folds the phase into an EXISTING brain, preserving the body', () => {
    const { root, brainPath } = project('legacy-with-brain');
    writeFileSync(brainPath, minimalBrainScaffold({ phase: 'not-started' }));
    writeFileSync(join(root, 'project.yaml'), 'phase: delivery\n');

    const r = migrateProjectYamlToBrain(root, brainPath);
    assert.equal(r.migrated, true);
    assert.equal(r.createdBrain, false);
    assert.equal(getCurrentPhase(brainPath).phase, 'delivery');
    assert.ok(!existsSync(join(root, 'project.yaml')));
  });

  it('is idempotent — a second run (no project.yaml) is a no-op', () => {
    const { root, brainPath } = project('idempotent');
    writeFileSync(join(root, 'project.yaml'), 'phase: implementation\n');
    migrateProjectYamlToBrain(root, brainPath);
    const second = migrateProjectYamlToBrain(root, brainPath);
    assert.equal(second.migrated, false);
  });
});
