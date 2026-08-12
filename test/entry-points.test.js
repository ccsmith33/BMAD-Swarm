import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { ENTRY_POINTS, ENTRY_POINT_NAMES, agentsForEntryPoint } from '../utils/entry-points.js';
import { PACKAGE_ROOT, PACKAGE_METHODOLOGY_DIR } from '../utils/paths.js';
import { estimateCost } from '../utils/cost-estimator.js';

// CB-9 lockstep: utils/entry-points.js is the ONE code source of the entry-point
// vocabulary. Every other copy — the orchestrator invariant enum, phases.yaml,
// the cost-estimator, and the entry_point literals emitted by commands-generator —
// must agree with it. These tests pin each copy to the constant.

const CANONICAL = new Set(ENTRY_POINT_NAMES);
const EXPECTED_13 = [
  'solo', 'bug-fix', 'small-feature', 'full-lifecycle', 'brainstorm', 'explore-idea',
  'debug', 'migrate', 'audit', 'research', 'review', 'maintain', 'plan-only',
];

describe('entry-points constant', () => {
  it('holds exactly the canonical 13 keys', () => {
    assert.deepEqual([...CANONICAL].sort(), [...EXPECTED_13].sort());
  });

  it('plan-only spawns no agents', () => {
    assert.deepEqual(agentsForEntryPoint('plan-only'), []);
  });

  it('throws on an unknown entry point', () => {
    assert.throws(() => agentsForEntryPoint('nonexistent'), /Unknown entry point/);
  });
});

describe('orchestrator.md enum ↔ constant', () => {
  it('the invariant enum line lists exactly the canonical keys', () => {
    const md = readFileSync(join(PACKAGE_ROOT, 'agents', 'orchestrator.md'), 'utf8');
    const m = /entry_point:\s*<([^>]+)>/.exec(md);
    assert.ok(m, 'could not find the entry_point enum line in orchestrator.md');
    const enumKeys = m[1].split('|').map(s => s.trim());
    assert.deepEqual([...enumKeys].sort(), [...EXPECTED_13].sort());
  });
});

describe('phases.yaml entry_points ↔ constant', () => {
  const phases = yaml.load(readFileSync(join(PACKAGE_METHODOLOGY_DIR, 'phases.yaml'), 'utf8'));

  it('has exactly the canonical keys', () => {
    const keys = Object.keys(phases.entry_points);
    assert.deepEqual([...keys].sort(), [...EXPECTED_13].sort());
  });

  it('each key\'s agents list equals ENTRY_POINTS[key].agents', () => {
    for (const [key, def] of Object.entries(phases.entry_points)) {
      const agents = def.agents || [];
      assert.deepEqual(
        agents, [...ENTRY_POINTS[key].agents],
        `phases.yaml entry_points.${key}.agents drifted from the constant`,
      );
    }
  });
});

describe('cost-estimator ↔ constant', () => {
  const config = { project: { name: 't' }, methodology: { phases: { implementation: { parallel_devs: 1 } } }, agents: {} };

  it('derives agents from the constant for every entry point', () => {
    for (const key of ENTRY_POINT_NAMES) {
      const result = estimateCost(config, key);
      assert.deepEqual(result.agents, [...ENTRY_POINTS[key].agents], `mismatch for ${key}`);
    }
  });

  it('plan-only estimates zero agents (not the full roster)', () => {
    const result = estimateCost(config, 'plan-only');
    assert.deepEqual(result.agents, []);
  });

  it('throws on an unknown entry point instead of falling back to allAgents', () => {
    assert.throws(() => estimateCost(config, 'nonexistent-entry'), /Unknown entry point/);
  });
});

describe('commands-generator entry_point literals ⊆ constant', () => {
  it('every emitted entry_point literal is a canonical key', () => {
    const src = readFileSync(join(PACKAGE_ROOT, 'generators', 'commands-generator.js'), 'utf8');
    const literals = [...src.matchAll(/entry_point:\s*([a-z][a-z-]*)/g)].map(m => m[1]);
    assert.ok(literals.length > 0, 'expected at least one entry_point literal in commands-generator.js');
    for (const lit of literals) {
      assert.ok(CANONICAL.has(lit), `commands-generator emits unknown entry_point: ${lit}`);
    }
  });
});
