import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCost, GOVERNOR_MODES, QUOTA_COUPLING_NOTE } from '../utils/cost-estimator.js';

describe('Cost Estimator', () => {
  const baseConfig = {
    project: { name: 'test' },
    methodology: { phases: { implementation: { parallel_devs: 1 } } },
    agents: {},
  };

  describe('estimateCost', () => {
    it('returns all 9 agents for full-lifecycle', () => {
      const result = estimateCost(baseConfig, 'full-lifecycle');
      assert.equal(result.agents.length, 9);
      const expected = [
        'orchestrator', 'ideator', 'researcher', 'strategist', 'architect',
        'developer', 'reviewer', 'security', 'devops',
      ];
      for (const agent of expected) {
        assert.ok(result.agents.includes(agent), `Missing agent: ${agent}`);
      }
    });

    it('returns correct agents for bug-fix entry point', () => {
      const result = estimateCost(baseConfig, 'bug-fix');
      assert.deepEqual(result.agents, ['developer', 'reviewer']);
    });

    it('returns correct agents for brainstorm entry point', () => {
      const result = estimateCost(baseConfig, 'brainstorm');
      assert.deepEqual(result.agents, ['ideator']);
    });

    it('returns correct agents for explore-idea entry point', () => {
      const result = estimateCost(baseConfig, 'explore-idea');
      assert.deepEqual(result.agents, ['ideator', 'researcher']);
    });

    it('returns correct agents for small-feature entry point', () => {
      const result = estimateCost(baseConfig, 'small-feature');
      assert.deepEqual(result.agents, ['architect', 'developer', 'reviewer']);
    });

    it('filters disabled agents', () => {
      const config = {
        ...baseConfig,
        agents: { security: { enabled: false }, devops: { enabled: false } },
      };
      const result = estimateCost(config, 'full-lifecycle');
      assert.ok(!result.agents.includes('security'), 'Security should be filtered');
      assert.ok(!result.agents.includes('devops'), 'DevOps should be filtered');
      assert.equal(result.agents.length, 7);
    });

    it('returns correct agents for audit entry point', () => {
      const result = estimateCost(baseConfig, 'audit');
      assert.deepEqual(result.agents, ['researcher', 'reviewer', 'security']);
    });

    it('multiplies developer tokens for parallel devs', () => {
      const singleDev = estimateCost(baseConfig, 'bug-fix');

      const parallelConfig = {
        ...baseConfig,
        methodology: { phases: { implementation: { parallel_devs: 3 } } },
      };
      const multiDev = estimateCost(parallelConfig, 'bug-fix');

      // With 3 parallel devs, developer tokens should be tripled
      // bug-fix agents: developer + reviewer
      // developer min=30000 -> 3 * 30000 = 90000 for developer portion
      assert.ok(multiDev.estimatedTokensMin > singleDev.estimatedTokensMin,
        'Parallel devs should increase min tokens');
      assert.ok(multiDev.estimatedTokensMax > singleDev.estimatedTokensMax,
        'Parallel devs should increase max tokens');
    });

    it('returns cost as dollar strings', () => {
      const result = estimateCost(baseConfig, 'brainstorm');
      assert.ok(result.estimatedCostMin.startsWith('$'), 'Min cost should start with $');
      assert.ok(result.estimatedCostMax.startsWith('$'), 'Max cost should start with $');
      // Parse the dollar amounts to verify they are valid numbers
      const minCost = parseFloat(result.estimatedCostMin.slice(1));
      const maxCost = parseFloat(result.estimatedCostMax.slice(1));
      assert.ok(!isNaN(minCost), 'Min cost should be a valid number');
      assert.ok(!isNaN(maxCost), 'Max cost should be a valid number');
      assert.ok(maxCost >= minCost, 'Max cost should be >= min cost');
    });

    it('throws on an unknown entry point (no silent allAgents fallback)', () => {
      // CB-9: unknown keys used to fall back to the full roster, which mis-priced
      // plan-only (spawns nothing). The entry-point vocabulary is now closed.
      assert.throws(() => estimateCost(baseConfig, 'nonexistent-entry'), /Unknown entry point/);
    });

    it('returns no agents for plan-only', () => {
      const result = estimateCost(baseConfig, 'plan-only');
      assert.deepEqual(result.agents, []);
    });

    it('uses Opus pricing as baseline', () => {
      // Opus pricing: $5/1M input, $25/1M output
      // A single ideator (min 10000 tokens) at 60/40 input/output split:
      // input: 6000 tokens = $0.03, output: 4000 tokens = $0.10 => total $0.13
      const result = estimateCost(baseConfig, 'brainstorm');
      assert.equal(result.estimatedCostMin, '$0.13');
    });

    it('applies sonnet pricing ($3/$15 per 1M) when defaults.model is sonnet', () => {
      // input: 6000 tokens = $0.018, output: 4000 tokens = $0.06 => total ~$0.08
      const config = { ...baseConfig, defaults: { model: 'sonnet' } };
      const result = estimateCost(config, 'brainstorm');
      assert.equal(result.estimatedCostMin, '$0.08');
    });

    it('applies haiku pricing ($1/$5 per 1M) when defaults.model is haiku', () => {
      // input: 6000 tokens = $0.006, output: 4000 tokens = $0.02 => total ~$0.03
      const config = { ...baseConfig, defaults: { model: 'haiku' } };
      const result = estimateCost(config, 'brainstorm');
      assert.equal(result.estimatedCostMin, '$0.03');
    });

    it('applies fable pricing ($10/$50 per 1M) when defaults.model is fable', () => {
      // A single ideator (min 10000 tokens) at 60/40 input/output split:
      // input: 6000 tokens = $0.06, output: 4000 tokens = $0.20 => total $0.26
      const config = { ...baseConfig, defaults: { model: 'fable' } };
      const result = estimateCost(config, 'brainstorm');
      assert.equal(result.estimatedCostMin, '$0.26');
    });

    it('applies fable pricing only to fable-overridden agents', () => {
      // bug-fix = developer + reviewer. Developer on fable, reviewer on the
      // opus baseline. Min tokens: developer 30000, reviewer 15000.
      // developer: (18000/1M)*10 + (12000/1M)*50 = 0.18 + 0.60 = $0.78
      // reviewer:  (9000/1M)*5   + (6000/1M)*25  = 0.045 + 0.15 = $0.195
      // total = $0.975 => "$0.98"
      const config = { ...baseConfig, agents: { developer: { model: 'fable' } } };
      const result = estimateCost(config, 'bug-fix');
      assert.equal(result.estimatedCostMin, '$0.98');
    });

    it('prices fable above opus for the same workload', () => {
      const opus = parseFloat(estimateCost(baseConfig, 'brainstorm').estimatedCostMin.slice(1));
      const fable = parseFloat(
        estimateCost({ ...baseConfig, defaults: { model: 'fable' } }, 'brainstorm')
          .estimatedCostMin.slice(1),
      );
      assert.ok(fable > opus, 'Fable ($10/$50) must cost more than opus ($5/$25)');
    });
  });

  // D-038: one Governor, two modes. Treasurer by day (budget/cap-stall
  // avoidance), scheduler by night (clock-only, no cap). The token math is
  // identical in both modes — the mode only changes the governance framing —
  // because day and night draw the SAME subscription quota (the honesty coupling).
  describe('governor mode parameter (treasurer | scheduler — D-038)', () => {
    it('defaults to treasurer (day) mode, cap-aware', () => {
      const r = estimateCost(baseConfig, 'bug-fix');
      assert.equal(r.mode, GOVERNOR_MODES.TREASURER);
      assert.equal(r.governance.capAware, true);
      assert.equal(r.governance.hardResource, 'budget/limit');
      assert.match(r.governance.advice, /pause|story boundary|cap/i);
    });

    it('scheduler (night) mode is clock-only with no cap', () => {
      const r = estimateCost(baseConfig, 'bug-fix', { mode: GOVERNOR_MODES.SCHEDULER });
      assert.equal(r.mode, GOVERNOR_MODES.SCHEDULER);
      assert.equal(r.governance.capAware, false);
      assert.equal(r.governance.hardResource, 'clock');
      assert.match(r.governance.advice, /runway|redirect|dawn/i);
    });

    it('carries the quota-coupling honesty note in both modes', () => {
      const day = estimateCost(baseConfig, 'bug-fix', { mode: GOVERNOR_MODES.TREASURER });
      const night = estimateCost(baseConfig, 'bug-fix', { mode: GOVERNOR_MODES.SCHEDULER });
      assert.equal(day.quotaNote, QUOTA_COUPLING_NOTE);
      assert.equal(night.quotaNote, QUOTA_COUPLING_NOTE);
      assert.match(QUOTA_COUPLING_NOTE, /same/i);
      assert.match(QUOTA_COUPLING_NOTE, /quota/i);
    });

    it('produces identical token estimates regardless of mode (same quota)', () => {
      const day = estimateCost(baseConfig, 'full-lifecycle', { mode: GOVERNOR_MODES.TREASURER });
      const night = estimateCost(baseConfig, 'full-lifecycle', { mode: GOVERNOR_MODES.SCHEDULER });
      assert.equal(day.estimatedTokensMin, night.estimatedTokensMin);
      assert.equal(day.estimatedTokensMax, night.estimatedTokensMax);
      assert.equal(day.estimatedCostMin, night.estimatedCostMin);
    });

    it('falls back to treasurer on an unknown mode string', () => {
      const r = estimateCost(baseConfig, 'bug-fix', { mode: 'nonsense' });
      assert.equal(r.mode, GOVERNOR_MODES.TREASURER);
    });
  });
});
