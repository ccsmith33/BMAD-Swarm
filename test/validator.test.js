import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../utils/validator.js';

describe('Config Validator', () => {
  it('returns no errors for valid config', () => {
    const config = {
      project: { name: 'test', type: 'web-app' },
      methodology: {
        autonomy: 'auto',
        phases: {
          implementation: { enabled: true, parallel_devs: 2 },
        },
        quality: { require_human_approval: ['prd'] },
      },
      agents: {},
    };
    const errors = validateConfig(config);
    assert.equal(errors.length, 0);
  });

  it('catches empty project name', () => {
    const errors = validateConfig({ project: { name: '' } });
    assert.ok(errors.some(e => e.includes('project.name')));
  });

  it('catches missing project name', () => {
    const errors = validateConfig({ project: {} });
    assert.ok(errors.some(e => e.includes('project.name')));
  });

  it('catches invalid project type', () => {
    const errors = validateConfig({ project: { name: 'test', type: 'invalid' } });
    assert.ok(errors.some(e => e.includes('project.type') && e.includes('invalid')));
  });

  it('catches invalid autonomy level', () => {
    const errors = validateConfig({
      project: { name: 'test' },
      methodology: { autonomy: 'typo' },
    });
    assert.ok(errors.some(e => e.includes('methodology.autonomy') && e.includes('typo')));
  });

  it('catches non-boolean phase enabled', () => {
    const errors = validateConfig({
      project: { name: 'test' },
      methodology: { phases: { exploration: { enabled: 'yes' } } },
    });
    assert.ok(errors.some(e => e.includes('phases.exploration.enabled') && e.includes('boolean')));
  });

  it('catches non-integer parallel_devs', () => {
    const errors = validateConfig({
      project: { name: 'test' },
      methodology: { phases: { implementation: { parallel_devs: 1.5 } } },
    });
    assert.ok(errors.some(e => e.includes('parallel_devs')));
  });

  it('catches zero parallel_devs', () => {
    const errors = validateConfig({
      project: { name: 'test' },
      methodology: { phases: { implementation: { parallel_devs: 0 } } },
    });
    assert.ok(errors.some(e => e.includes('parallel_devs')));
  });

  it('catches non-array require_human_approval', () => {
    const errors = validateConfig({
      project: { name: 'test' },
      methodology: { quality: { require_human_approval: 'prd' } },
    });
    assert.ok(errors.some(e => e.includes('require_human_approval') && e.includes('array')));
  });

  it('catches unknown agent name', () => {
    const errors = validateConfig({
      project: { name: 'test' },
      agents: { 'unknown-agent': { enabled: true } },
    });
    assert.ok(errors.some(e => e.includes('agents.unknown-agent') && e.includes('not a recognized agent')));
  });

  it('accepts all valid project types', () => {
    const types = ['web-app', 'api', 'cli', 'library', 'mobile', 'monorepo', 'other'];
    for (const type of types) {
      const errors = validateConfig({ project: { name: 'test', type } });
      assert.ok(!errors.some(e => e.includes('project.type')), `${type} should be valid`);
    }
  });

  it('accepts all valid autonomy levels', () => {
    const levels = ['auto', 'guided', 'collaborative'];
    for (const level of levels) {
      const errors = validateConfig({
        project: { name: 'test' },
        methodology: { autonomy: level },
      });
      assert.ok(!errors.some(e => e.includes('autonomy')), `${level} should be valid`);
    }
  });

  it('collects multiple errors', () => {
    const errors = validateConfig({
      project: { name: '', type: 'bad' },
      methodology: { autonomy: 'wrong' },
      agents: { fake: {} },
    });
    assert.ok(errors.length >= 3, `Expected at least 3 errors, got ${errors.length}`);
  });
});
