import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getCurrentPhase, getAvailableTransitions, advancePhase, setPhase, PHASE_ORDER,
  minimalBrainScaffold, migrateProjectYamlToBrain,
} from '../utils/phase-machine.js';
import { validateBrain, splitFrontmatter } from '../utils/project-brain.js';
import yaml from 'js-yaml';

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

  // Regression: the migration read-modify-writes the brain frontmatter. A gate
  // note that carries a YAML-significant character (comma, colon-space, leading
  // `#`) must survive that round-trip byte-for-byte. The historical bug: notes
  // were emitted UNQUOTED, so `design-led, no PRD` re-parsed as flow syntax on the
  // next read — the comma split `no PRD` off into a bogus null-valued key (silent
  // data corruption). The fix quotes every string scalar on emit.
  const RISKY_BRAIN = [
    '---',
    'schema: project-brain/1',
    "updated: '2026-08-13T23:02:49.854Z'",
    'checkpoint: 1',
    'phase: implementation',
    'gates:',
    '  prd-approved:',
    '    status: skipped',
    "    note: 'reinvention track is design-led, no PRD'",   // comma
    '  arch-approved:',
    '    status: passed',
    "    note: 'accepted the 3:1 tradeoff'",                 // colon-space
    '  sec-review:',
    '    status: passed',
    "    note: 'see #hardening for details'",                // leading # token
    'staleness:',
    '  ledger-events-since-checkpoint: 0',
    '---',
    '',
    '## What this is (and why)',
    'A project.',
    '',
    '## Current mental model',
    '',
    '## Load-bearing facts',
    '',
    '## Active threads',
    '',
    '## Dead ends',
    '',
    '## Open questions',
    '',
    '## Pointers',
    '- decision-log: artifacts/context/decision-log.md',
    '',
  ].join('\n');

  it('preserves comma / colon / # gate notes across the migration (no split, no null, no loss)', () => {
    const { root, brainPath } = project('risky-notes');
    writeFileSync(brainPath, RISKY_BRAIN);
    writeFileSync(join(root, 'project.yaml'), 'phase: delivery\n');

    const r = migrateProjectYamlToBrain(root, brainPath);
    assert.equal(r.migrated, true);
    assert.equal(r.phase, 'delivery');

    const out = readFileSync(brainPath, 'utf8');
    const fm = splitFrontmatter(out).frontmatter;

    // The comma note is intact — NOT split into a `no PRD: null` sibling key.
    assert.equal(fm.gates['prd-approved'].note, 'reinvention track is design-led, no PRD');
    assert.equal(fm.gates['prd-approved'].status, 'skipped');
    assert.ok(!('no PRD' in fm.gates['prd-approved']), 'the comma must not have spawned a bogus key');

    // Colon-space and leading-# notes survive too.
    assert.equal(fm.gates['arch-approved'].note, 'accepted the 3:1 tradeoff');
    assert.equal(fm.gates['sec-review'].note, 'see #hardening for details');

    // The phase was actually folded in and the file is still schema-valid.
    assert.equal(fm.phase, 'delivery');
    assert.ok(validateBrain(out).ok, 'migrated brain must stay schema-valid: ' + validateBrain(out).errors.join('; '));
    assert.ok(!existsSync(join(root, 'project.yaml')));
  });

  it('emits string notes QUOTED so they stay safe even if later inlined into flow style', () => {
    const { root, brainPath } = project('quoted-emit');
    writeFileSync(brainPath, RISKY_BRAIN);
    writeFileSync(join(root, 'project.yaml'), 'phase: delivery\n');
    migrateProjectYamlToBrain(root, brainPath);

    const out = readFileSync(brainPath, 'utf8');
    // The comma note is emitted quoted — the guarantee that closes the corruption
    // loop: a quoted value survives even a reformat into `{...}` flow syntax.
    assert.match(out, /note: "reinvention track is design-led, no PRD"/);
    const reinlined = yaml.load('g: {status: skipped, note: "reinvention track is design-led, no PRD"}');
    assert.equal(reinlined.g.note, 'reinvention track is design-led, no PRD');
    assert.ok(!('no PRD' in reinlined.g));
  });
});
