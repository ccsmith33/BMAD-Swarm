import { DEFAULT_MODEL } from './validator.js';
import { agentsForEntryPoint } from './entry-points.js';

// Token estimates per agent role based on typical usage patterns
const TOKENS_PER_AGENT = {
  orchestrator: { min: 15000, max: 40000 },
  ideator: { min: 10000, max: 30000 },
  researcher: { min: 20000, max: 60000 },
  strategist: { min: 15000, max: 45000 },
  architect: { min: 20000, max: 50000 },
  developer: { min: 30000, max: 100000 },
  reviewer: { min: 15000, max: 40000 },
  devops: { min: 15000, max: 40000 },
  security: { min: 15000, max: 45000 },
};

// Pricing per 1M tokens, keyed by model tier — Anthropic API rates as of
// 2026-08. fable (Claude Fable 5, the tier above opus — D-023) is 2x opus.
// Tiers without an entry fall back to the DEFAULT_MODEL baseline.
const MODEL_PRICING = {
  opus: { input: 5.00, output: 25.00 },
  fable: { input: 10.00, output: 50.00 },
  sonnet: { input: 3.00, output: 15.00 },
  haiku: { input: 1.00, output: 5.00 },
};
const INPUT_OUTPUT_RATIO = 0.6; // ~60% input, 40% output

// The one Governor, two modes (D-038). By DAY it is a treasurer: it forecasts
// burn against the subscription limit and advises a story-boundary pause to
// avoid the economics audit's most expensive failure (mid-story cap-stall). By
// NIGHT it is a scheduler: the clock is the only hard resource (D-034), there is
// no cap, and token figures are transparency only. utils/runway.js does the
// night's clock math; this module supplies the governance framing per mode.
export const GOVERNOR_MODES = Object.freeze({ TREASURER: 'treasurer', SCHEDULER: 'scheduler' });

// The honest quota coupling (D-038), stated verbatim in every charter and in the
// morning report: night and day are not separate budgets. Running the swarm at
// 3am spends from the same subscription allowance as tomorrow's day work — there
// is simply no cap at night, because the clock, not the quota, bounds the night.
export const QUOTA_COUPLING_NOTE =
  'Night work draws the SAME subscription quota as the next day\'s work — there is no separate ' +
  'night budget and no cap. At night the clock is the only hard resource (D-034/D-038); token ' +
  'figures are transparency, never a limit.';

// Governance framing per mode. The token math is identical in both — only the
// hard resource and the advice differ (same quota, honestly coupled).
const GOVERNANCE = {
  [GOVERNOR_MODES.TREASURER]: {
    role: 'treasurer',
    capAware: true,
    hardResource: 'budget/limit',
    advice: 'Forecast burn vs the remaining limit; pause at the next story boundary before a '
      + 'mid-story cap-stall (clean checkpoint + resume note in the ledger).',
  },
  [GOVERNOR_MODES.SCHEDULER]: {
    role: 'scheduler',
    capAware: false,
    hardResource: 'clock',
    advice: 'No cap — allocate runway, reserve the dawn slice, and redirect capacity when a work '
      + 'class stalls; the terminal state is dawn synthesis, never idle silence.',
  },
};

/**
 * Estimate cost for a swarm run.
 * @param {object} config - Swarm config
 * @param {string} entryPoint - Entry point name (e.g., 'full-lifecycle', 'bug-fix')
 * @param {object} [opts] - { mode?: 'treasurer' | 'scheduler' }. Default treasurer (day).
 * @returns {{ agents: string[], estimatedTokensMin: number, estimatedTokensMax: number,
 *            estimatedCostMin: string, estimatedCostMax: string, mode: string,
 *            governance: object, quotaNote: string }}
 */
export function estimateCost(config, entryPoint = 'full-lifecycle', opts = {}) {
  const mode = opts.mode === GOVERNOR_MODES.SCHEDULER ? GOVERNOR_MODES.SCHEDULER : GOVERNOR_MODES.TREASURER;
  const agents = determineAgents(config, entryPoint);
  const parallelDevs = config.methodology?.phases?.implementation?.parallel_devs || 1;

  let tokensMin = 0;
  let tokensMax = 0;
  let costMin = 0;
  let costMax = 0;

  for (const agent of agents) {
    const estimate = TOKENS_PER_AGENT[agent] || { min: 10000, max: 30000 };
    let agentTokensMin = estimate.min;
    let agentTokensMax = estimate.max;
    // Extra developers multiply developer tokens
    if (agent === 'developer' && parallelDevs > 1) {
      agentTokensMin += estimate.min * (parallelDevs - 1);
      agentTokensMax += estimate.max * (parallelDevs - 1);
    }
    tokensMin += agentTokensMin;
    tokensMax += agentTokensMax;
    const model = resolveModel(config, agent);
    costMin += calculateCost(agentTokensMin, model);
    costMax += calculateCost(agentTokensMax, model);
  }

  return {
    agents,
    estimatedTokensMin: tokensMin,
    estimatedTokensMax: tokensMax,
    estimatedCostMin: `$${costMin.toFixed(2)}`,
    estimatedCostMax: `$${costMax.toFixed(2)}`,
    // The token/cost figures above are mode-invariant — day and night draw the
    // same quota (D-038). The mode changes only the governance framing below.
    mode,
    governance: GOVERNANCE[mode],
    quotaNote: QUOTA_COUPLING_NOTE,
  };
}

function determineAgents(config, entryPoint) {
  // Entry-point → agents is owned by the canonical ENTRY_POINTS constant
  // (utils/entry-points.js). Unknown keys throw here rather than silently
  // falling back to the full roster (which mis-priced plan-only, etc.).
  const agents = agentsForEntryPoint(entryPoint);

  // Filter disabled agents
  return agents.filter(name => {
    const agentConfig = config.agents?.[name];
    return agentConfig?.enabled !== false;
  });
}

function resolveModel(config, agent) {
  return config.agents?.[agent]?.model || config.defaults?.model || DEFAULT_MODEL;
}

function calculateCost(totalTokens, model) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const inputTokens = totalTokens * INPUT_OUTPUT_RATIO;
  const outputTokens = totalTokens * (1 - INPUT_OUTPUT_RATIO);
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}
