import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

describe('Ideation Feature', () => {
  describe('Ideator agent template', () => {
    it('ideator.md exists in agents directory', () => {
      const ideatorPath = join(ROOT, 'agents', 'ideator.md');
      assert.ok(existsSync(ideatorPath), 'agents/ideator.md should exist');
    });

    it('ideator.md has required sections', () => {
      const content = readFileSync(join(ROOT, 'agents', 'ideator.md'), 'utf8');
      assert.ok(content.includes('## Role'), 'Should have Role section');
      assert.ok(content.includes('## Expertise'), 'Should have Expertise section');
      assert.ok(content.includes('## Inputs'), 'Should have Inputs section');
      assert.ok(content.includes('## Outputs'), 'Should have Outputs section');
      assert.ok(content.includes('## Quality Criteria'), 'Should have Quality Criteria section');
      assert.ok(content.includes('## Behavioral Rules'), 'Should have Behavioral Rules section');
    });

    it('ideator.md references four lenses', () => {
      const content = readFileSync(join(ROOT, 'agents', 'ideator.md'), 'utf8');
      assert.ok(content.includes('Product Strategist Lens'), 'Should have Product Strategist lens');
      assert.ok(content.includes('Technical Feasibility Lens'), 'Should have Technical Feasibility lens');
      assert.ok(content.includes("Devil's Advocate Lens"), 'Should have Devil\'s Advocate lens');
      assert.ok(content.includes('Innovation Lens'), 'Should have Innovation lens');
    });

    it('ideator.md references product brief artifact', () => {
      const content = readFileSync(join(ROOT, 'agents', 'ideator.md'), 'utf8');
      assert.ok(content.includes('artifacts/planning/product-brief.md'), 'Should reference product brief path');
    });
  });

  describe('Phases YAML', () => {
    let phases;

    it('phases.yaml has ideation phase', () => {
      const phasesContent = readFileSync(join(ROOT, 'methodology', 'phases.yaml'), 'utf8');
      phases = yaml.load(phasesContent);
      assert.ok(phases.phases.ideation, 'Should have ideation phase');
    });

    it('ideation has order 0', () => {
      const phasesContent = readFileSync(join(ROOT, 'methodology', 'phases.yaml'), 'utf8');
      phases = yaml.load(phasesContent);
      assert.equal(phases.phases.ideation.order, 0, 'Ideation should have order 0');
    });

    it('ideation comes before exploration (order 1)', () => {
      const phasesContent = readFileSync(join(ROOT, 'methodology', 'phases.yaml'), 'utf8');
      phases = yaml.load(phasesContent);
      assert.ok(phases.phases.ideation.order < phases.phases.exploration.order,
        'Ideation order should be less than exploration order');
    });

    it('ideation has ideator as primary agent', () => {
      const phasesContent = readFileSync(join(ROOT, 'methodology', 'phases.yaml'), 'utf8');
      phases = yaml.load(phasesContent);
      assert.ok(phases.phases.ideation.agents.primary.includes('ideator'),
        'Ideator should be a primary agent');
    });

    it('ideation has ideation-complete gate', () => {
      const phasesContent = readFileSync(join(ROOT, 'methodology', 'phases.yaml'), 'utf8');
      phases = yaml.load(phasesContent);
      assert.equal(phases.phases.ideation.gate.name, 'ideation-complete');
      assert.equal(phases.phases.ideation.gate.type, 'human-decision');
    });

    it('ideation has product-brief artifact', () => {
      const phasesContent = readFileSync(join(ROOT, 'methodology', 'phases.yaml'), 'utf8');
      phases = yaml.load(phasesContent);
      const artifacts = phases.phases.ideation.artifacts;
      const brief = artifacts.find(a => a.type === 'product-brief');
      assert.ok(brief, 'Should have product-brief artifact');
      assert.equal(brief.producer, 'ideator');
    });
  });

  describe('Entry points', () => {
    it('has brainstorm entry point', () => {
      const phasesContent = readFileSync(join(ROOT, 'methodology', 'phases.yaml'), 'utf8');
      const phases = yaml.load(phasesContent);
      assert.ok(phases.entry_points.brainstorm, 'Should have brainstorm entry point');
      assert.equal(phases.entry_points.brainstorm.start_phase, 'ideation');
    });

    it('has ideate-then-build entry point', () => {
      const phasesContent = readFileSync(join(ROOT, 'methodology', 'phases.yaml'), 'utf8');
      const phases = yaml.load(phasesContent);
      assert.ok(phases.entry_points['ideate-then-build'], 'Should have ideate-then-build entry point');
      assert.equal(phases.entry_points['ideate-then-build'].start_phase, 'ideation');
      assert.ok(phases.entry_points['ideate-then-build'].phases.includes('ideation'),
        'ideate-then-build should include ideation phase');
      assert.ok(phases.entry_points['ideate-then-build'].phases.includes('implementation'),
        'ideate-then-build should include implementation phase');
    });
  });

  describe('Transitions', () => {
    it('has ideation-to-exploration transition', () => {
      const phasesContent = readFileSync(join(ROOT, 'methodology', 'phases.yaml'), 'utf8');
      const phases = yaml.load(phasesContent);
      assert.ok(phases.transitions['ideation-to-exploration'],
        'Should have ideation-to-exploration transition');
      assert.equal(phases.transitions['ideation-to-exploration'].from, 'ideation');
      assert.equal(phases.transitions['ideation-to-exploration'].to, 'exploration');
    });
  });
});
