import { DEFAULT_MODEL } from './validator.js';

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

// Pricing per 1M tokens, keyed by model tier. opus is the long-standing
// baseline; fable (Claude Fable 5, the tier above opus — D-023) is $10/$50.
// Tiers without an entry fall back to the opus baseline.
const MODEL_PRICING = {
  opus: { input: 15.00, output: 75.00 },
  fable: { input: 10.00, output: 50.00 },
};
const INPUT_OUTPUT_RATIO = 0.6; // ~60% input, 40% output

/**
 * Estimate cost for a swarm run.
 * @param {object} config - Swarm config
 * @param {string} entryPoint - Entry point name (e.g., 'full-lifecycle', 'bug-fix')
 * @returns {{ agents: string[], estimatedTokensMin: number, estimatedTokensMax: number, estimatedCostMin: string, estimatedCostMax: string }}
 */
export function estimateCost(config, entryPoint = 'full-lifecycle') {
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
  };
}

function determineAgents(config, entryPoint) {
  const allAgents = ['orchestrator', 'ideator', 'researcher', 'strategist', 'architect', 'developer', 'reviewer', 'security', 'devops'];

  const entryPointAgents = {
    'solo': ['developer'],
    'full-lifecycle': allAgents,
    'bug-fix': ['developer', 'reviewer'],
    'small-feature': ['architect', 'developer', 'reviewer'],
    'brainstorm': ['ideator'],
    'explore-idea': ['ideator', 'researcher'],
    'debug': ['developer', 'reviewer'],
    'migrate': ['architect', 'developer', 'reviewer'],
    'audit': ['researcher', 'reviewer', 'security'],
    'maintain': ['developer', 'reviewer'],
  };

  const agents = entryPointAgents[entryPoint] || allAgents;

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
