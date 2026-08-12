import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { PACKAGE_METHODOLOGY_DIR } from '../utils/paths.js';

// Lockstep guard: methodology/artifact-schemas/*.md is the authoritative human
// source; spec.yaml is a machine projection the validator consumes. This test
// asserts the projection cannot silently drift from the prose — every
// required_section in spec.yaml must appear as a heading in the schema .md
// (heading appears literally in the Expected Structure fenced block).

const SCHEMA_DIR = join(PACKAGE_METHODOLOGY_DIR, 'artifact-schemas');
const spec = yaml.load(readFileSync(join(SCHEMA_DIR, 'spec.yaml'), 'utf8'));

function normalizeHeading(text) {
  return text
    .replace(/\*\*/g, '')
    .replace(/^[\d.]+\s*/, '')
    .replace(/:\s*$/, '')
    .trim()
    .toLowerCase();
}

function schemaHeadings(schemaFile) {
  const content = readFileSync(join(SCHEMA_DIR, schemaFile), 'utf8');
  const headings = [];
  for (const line of content.split('\n')) {
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (m) headings.push(normalizeHeading(m[1]));
  }
  return headings;
}

function collectRequiredSections(def) {
  const sections = [];
  if (def.required_sections) sections.push(...def.required_sections);
  if (def.variants) {
    for (const v of Object.values(def.variants)) {
      if (v.required_sections) sections.push(...v.required_sections);
    }
  }
  return sections;
}

describe('spec.yaml ↔ schema lockstep', () => {
  for (const [key, def] of Object.entries(spec.artifacts)) {
    if (key === 'generic') continue; // generic has no schema doc / no sections

    it(`every required section of "${key}" is a heading in ${key}.md`, () => {
      const headings = schemaHeadings(`${key}.md`);
      for (const section of collectRequiredSections(def)) {
        const needle = section.trim().toLowerCase();
        const found = headings.some(h => h === needle || h.startsWith(needle));
        assert.ok(
          found,
          `Required section "${section}" (spec.yaml, artifact "${key}") has no matching heading in ${key}.md`,
        );
      }
    });
  }

  it('every non-generic artifact class has a match rule', () => {
    for (const [key, def] of Object.entries(spec.artifacts)) {
      if (key === 'generic') continue;
      assert.ok(def.match, `artifact "${key}" is missing a match rule`);
    }
  });

  // M2 guard: the section-only checks above never exercised required_patterns,
  // which is how a too-permissive AC regex slipped in. Pin the story's accepted
  // acceptance-criteria registers to the schema prose (story.md) so any future
  // silent widening/narrowing of the regex breaks this test.
  describe('story acceptance-criteria registers ↔ story.md prose', () => {
    const storyDef = spec.artifacts.story;
    const acPattern = (storyDef.required_patterns || []).find(p => p.name === 'acceptance-criteria-format');
    const acRegex = new RegExp(acPattern.regex, 'm');
    const storyProse = readFileSync(join(SCHEMA_DIR, 'story.md'), 'utf8');

    // story.md sanctions exactly two registers: BDD scenarios, and `- [ ] ACn:` checklists.
    it('accepts a BDD (Given ... Then) criterion — register 1', () => {
      assert.ok(acRegex.test('### AC1: happy path\n**Given** a state\n**Then** an outcome'));
    });

    it('accepts a verifiable checklist AC (- [ ] ACn:) — register 2', () => {
      assert.ok(acRegex.test('- [ ] AC1: the command exits 1 with a valid-phases message'));
    });

    it('REJECTS a bare `### ACn:` heading with neither register (M1 regression guard)', () => {
      assert.ok(!acRegex.test('## Acceptance Criteria\n### AC1: does a thing\n### AC2: does another'));
    });

    it('story.md prose documents both sanctioned registers', () => {
      assert.match(storyProse, /Given\/When\/Then/, 'BDD register must be documented');
      assert.match(storyProse, /- \[ \] AC/, 'checklist AC register must be documented');
    });
  });

  it('compiles every regex pattern in the spec', () => {
    for (const def of Object.values(spec.artifacts)) {
      const defs = def.variants ? Object.values(def.variants) : [def];
      for (const d of defs) {
        if (d.discriminator) assert.doesNotThrow(() => new RegExp(d.discriminator, 'im'));
        for (const p of d.required_patterns || []) {
          if (p.regex) assert.doesNotThrow(() => new RegExp(p.regex, 'm'), `bad regex: ${p.name}`);
        }
      }
    }
  });
});
