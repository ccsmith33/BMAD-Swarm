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

  it('accepts valid isolation values on agent config', () => {
    for (const isolation of ['worktree', 'none']) {
      const errors = validateConfig({
        project: { name: 'test' },
        agents: { developer: { isolation } },
      });
      assert.ok(!errors.some(e => e.includes('isolation')), `"${isolation}" should be a valid isolation value`);
    }
  });

  it('catches invalid isolation value on agent config', () => {
    const errors = validateConfig({
      project: { name: 'test' },
      agents: { developer: { isolation: 'docker' } },
    });
    assert.ok(errors.some(e => e.includes('agents.developer.isolation') && e.includes('docker')));
  });

  it('isolation is optional — no error when omitted', () => {
    const errors = validateConfig({
      project: { name: 'test' },
      agents: { developer: { model: 'sonnet' } },
    });
    assert.ok(!errors.some(e => e.includes('isolation')), 'isolation should be optional');
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

  describe('team block (D-005, ADR-004)', () => {
    it('accepts dynamic mode with empty specializations', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: { mode: 'dynamic', specializations: [], fallback: { enabled: true, role: 'developer', model: 'opus' } },
      });
      assert.equal(errors.filter(e => e.includes('team')).length, 0);
    });

    it('accepts fixed mode with valid specializations', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: {
          mode: 'fixed',
          specializations: [
            { role: 'developer', domain: 'backend-auth', model: 'opus' },
            { role: 'reviewer', domain: 'code-quality', model: 'sonnet' },
          ],
          fallback: { enabled: true, role: 'developer', model: 'opus' },
        },
      });
      assert.equal(errors.filter(e => e.includes('team')).length, 0);
    });

    it('rejects unknown team.mode value', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: { mode: 'hybrid', specializations: [] },
      });
      assert.ok(errors.some(e => e.includes('team.mode "hybrid" is invalid') && e.includes('dynamic, fixed')));
    });

    it('rejects fixed mode with empty specializations', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: { mode: 'fixed', specializations: [] },
      });
      assert.ok(errors.some(e => e.includes('team.mode is "fixed" but team.specializations is empty')));
    });

    it('rejects invalid specialist role', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: { mode: 'fixed', specializations: [{ role: 'ideator', domain: 'backend-auth' }] },
      });
      assert.ok(errors.some(e => e.includes('developer and reviewer are valid v1 specialist roles')));
    });

    it('rejects invalid domain slug (uppercase + spaces)', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: { mode: 'fixed', specializations: [{ role: 'developer', domain: 'Backend Auth' }] },
      });
      assert.ok(errors.some(e => e.includes('domain') && e.includes('^[a-z0-9][a-z0-9-]*[a-z0-9]$')));
    });

    it('rejects domain with leading hyphen', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: { mode: 'fixed', specializations: [{ role: 'developer', domain: '-backend' }] },
      });
      assert.ok(errors.some(e => e.includes('domain')));
    });

    it('rejects domain with trailing hyphen', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: { mode: 'fixed', specializations: [{ role: 'developer', domain: 'backend-' }] },
      });
      assert.ok(errors.some(e => e.includes('domain')));
    });

    it('rejects single-char domain (deliberately)', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: { mode: 'fixed', specializations: [{ role: 'developer', domain: 'a' }] },
      });
      assert.ok(errors.some(e => e.includes('domain')));
    });

    it('rejects duplicate (role, domain) pair', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: {
          mode: 'fixed',
          specializations: [
            { role: 'developer', domain: 'backend-auth' },
            { role: 'developer', domain: 'backend-auth' },
          ],
        },
      });
      assert.ok(errors.some(e => e.includes('(role, domain) pair must be unique')));
    });

    it('allows same domain across different roles', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: {
          mode: 'fixed',
          specializations: [
            { role: 'developer', domain: 'backend-auth' },
            { role: 'reviewer', domain: 'backend-auth' },
          ],
        },
      });
      assert.equal(errors.filter(e => e.includes('uniqueness') || e.includes('unique')).length, 0);
    });

    it('rejects invalid per-specialization model', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: {
          mode: 'fixed',
          specializations: [{ role: 'developer', domain: 'backend-auth', model: 'gpt-4' }],
        },
      });
      assert.ok(errors.some(e => e.includes('model "gpt-4"') && e.includes('haiku, sonnet, opus, inherit')));
    });

    it('rejects invalid fallback.model', () => {
      const errors = validateConfig({
        project: { name: 'test' },
        team: { mode: 'dynamic', specializations: [], fallback: { enabled: true, model: 'gpt-4' } },
      });
      assert.ok(errors.some(e => e.includes('team.fallback.model') && e.includes('gpt-4')));
    });
  });
});
