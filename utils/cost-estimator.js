// Token estimates per agent role based on typical usage patterns
const TOKENS_PER_AGENT = {
  orchestrator: { min: 15000, max: 40000 },
  ideator: { min: 10000, max: 30000 },
  researcher: { min: 20000, max: 60000 },
  strategist: { min: 15000, max: 45000 },
  architect: { min: 20000, max: 50000 },
  'story-engineer': { min: 10000, max: 30000 },
  developer: { min: 30000, max: 100000 },
  reviewer: { min: 15000, max: 40000 },
  qa: { min: 15000, max: 40000 },
  devops: { min: 15000, max: 40000 },
  security: { min: 15000, max: 45000 },
  'tech-writer': { min: 10000, max: 25000 },
  retrospective: { min: 10000, max: 25000 },
};

// Claude pricing (per 1M tokens) - as of 2026 estimates
const PRICE_PER_1M_INPUT = 3.00;
const PRICE_PER_1M_OUTPUT = 15.00;
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

  for (const agent of agents) {
    const estimate = TOKENS_PER_AGENT[agent] || { min: 10000, max: 30000 };
    tokensMin += estimate.min;
    tokensMax += estimate.max;
    // Extra developers multiply developer tokens
    if (agent === 'developer' && parallelDevs > 1) {
      tokensMin += estimate.min * (parallelDevs - 1);
      tokensMax += estimate.max * (parallelDevs - 1);
    }
  }

  const costMin = calculateCost(tokensMin);
  const costMax = calculateCost(tokensMax);

  return {
    agents,
    estimatedTokensMin: tokensMin,
    estimatedTokensMax: tokensMax,
    estimatedCostMin: `$${costMin.toFixed(2)}`,
    estimatedCostMax: `$${costMax.toFixed(2)}`,
  };
}

function determineAgents(config, entryPoint) {
  const allAgents = ['orchestrator', 'ideator', 'researcher', 'strategist', 'architect', 'story-engineer', 'developer', 'reviewer', 'qa', 'devops', 'security', 'tech-writer', 'retrospective'];

  const entryPointAgents = {
    'full-lifecycle': allAgents,
    'bug-fix': ['developer', 'reviewer'],
    'small-feature': ['architect', 'developer', 'reviewer'],
    'brainstorm': ['ideator'],
    'explore-idea': ['ideator', 'researcher'],
    'debug': ['developer', 'reviewer'],
    'migrate': ['architect', 'developer', 'reviewer'],
    'audit': ['researcher', 'reviewer'],
    'maintain': ['developer', 'reviewer'],
  };

  const agents = entryPointAgents[entryPoint] || allAgents;

  // Filter disabled agents
  return agents.filter(name => {
    const agentConfig = config.agents?.[name];
    return agentConfig?.enabled !== false;
  });
}

function calculateCost(totalTokens) {
  const inputTokens = totalTokens * INPUT_OUTPUT_RATIO;
  const outputTokens = totalTokens * (1 - INPUT_OUTPUT_RATIO);
  return (inputTokens / 1_000_000) * PRICE_PER_1M_INPUT + (outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT;
}
