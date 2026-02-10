import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import yaml from 'js-yaml';
import { getProjectPaths } from '../utils/paths.js';
import { writeFileSafe, ensureDir } from '../utils/fs-helpers.js';
import { generateAgents } from '../generators/agent-generator.js';
import { generateClaudeMd } from '../generators/claude-md-generator.js';
import { generateHooks } from '../generators/hooks-generator.js';
import { generateSettings } from '../generators/settings-generator.js';
import { loadSwarmConfig } from '../utils/config.js';
import { runScan } from './scan.js';

/**
 * Register the init command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerInitCommand(program) {
  program
    .command('init')
    .description('Initialize a new BMAD Swarm project in the current directory')
    .option('--scan', 'Analyze existing codebase and auto-detect language, framework, and testing setup')
    .option('--template <name>', 'Use a predefined stack template (next-app, express-api, react-app, node-cli, python-api)')
    .option('-y, --yes', 'Accept all defaults without interactive prompts')
    .addHelpText('after', `
Examples:
  $ bmad-swarm init                       Interactive setup with prompts
  $ bmad-swarm init -y                    Quick setup with all defaults
  $ bmad-swarm init --template next-app   Start with Next.js + TypeScript + Jest
  $ bmad-swarm init --scan                Detect stack from existing package.json / requirements.txt
  $ bmad-swarm init --scan -y             Auto-detect stack and skip prompts

Available templates:
  next-app      TypeScript + Next.js + Jest
  express-api   TypeScript + Express + Jest
  react-app     TypeScript + React + Vitest
  node-cli      JavaScript + node:test
  python-api    Python + FastAPI + pytest
`)
    .action(async (options) => {
      try {
        await runInit(options);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Run the init command.
 * @param {object} options - Command options
 */
async function runInit(options) {
  const projectRoot = process.cwd();
  const paths = getProjectPaths(projectRoot);

  // Check if already initialized
  if (existsSync(paths.swarmYaml)) {
    console.error('This project already has a swarm.yaml. Use `bmad-swarm update` to regenerate.');
    process.exit(1);
  }

  let answers;
  if (options.yes) {
    answers = getDefaults();
  } else {
    answers = await promptUser();
  }

  // Apply template overrides if specified
  if (options.template) {
    const templateOverrides = getTemplateDefaults(options.template);
    answers = { ...answers, ...templateOverrides };
  }

  // Run codebase scan if requested
  let scanResults = null;
  if (options.scan) {
    console.log('\nScanning existing codebase...');
    scanResults = await runScan({ quiet: true, returnResults: true });
    if (scanResults) {
      // Auto-populate from scan
      if (scanResults.language) answers.language = scanResults.language;
      if (scanResults.framework) answers.framework = scanResults.framework;
      if (scanResults.testing) answers.testing = scanResults.testing;
      if (scanResults.database) answers.database = scanResults.database;
      console.log(`  Detected: ${scanResults.language || 'unknown'}${scanResults.framework ? ` + ${scanResults.framework}` : ''}`);
    }
  }

  console.log('\nCreating project structure...');

  // 1. Generate swarm.yaml
  const swarmConfig = buildSwarmYaml(answers);
  const swarmYamlContent = yaml.dump(swarmConfig, { lineWidth: 120, noRefs: true });
  writeFileSafe(paths.swarmYaml, swarmYamlContent);
  console.log('  \u2713 Generated swarm.yaml');

  // 2. Load the config back (with defaults applied)
  const config = loadSwarmConfig(paths.swarmYaml);

  // 3. Generate .claude/agents/
  const agentResult = generateAgents(config, paths);
  console.log(`  \u2713 Generated .claude/agents/ (${agentResult.generated.length} agents)`);

  // 4. Generate .claude/settings.json
  generateSettings(paths);
  console.log('  \u2713 Generated .claude/settings.json');

  // 5. Generate .claude/hooks/
  const hookPaths = generateHooks(config, paths);
  console.log(`  \u2713 Generated .claude/hooks/ (${hookPaths.length} hooks)`);

  // 6. Generate CLAUDE.md
  generateClaudeMd(config, paths);
  console.log('  \u2713 Generated CLAUDE.md');

  // 7. Create artifacts directory structure
  const artifactSubdirs = ['exploration', 'planning', 'design', 'design/decisions', 'implementation', 'implementation/stories', 'reviews', 'context'];
  for (const subdir of artifactSubdirs) {
    ensureDir(join(paths.artifactsDir, subdir));
  }
  console.log('  \u2713 Created artifacts/ directory');

  // 8. Initialize project.yaml
  const projectYaml = buildProjectYaml(answers);
  writeFileSafe(paths.projectYaml, yaml.dump(projectYaml, { lineWidth: 120, noRefs: true }));
  console.log('  \u2713 Initialized project.yaml');

  // 9. Create overrides directory
  ensureDir(paths.overridesAgentsDir);

  // Display cost estimate
  const { estimateCost } = await import('../utils/cost-estimator.js');
  const estimate = estimateCost(config);
  console.log(`\nEstimated cost for a full lifecycle run: ${estimate.estimatedCostMin}-${estimate.estimatedCostMax}`);
  console.log('  (Based on configured agents and phases. Actual costs vary.)');

  console.log('\nReady! Start Claude Code and tell the orchestrator what to build.');
}

/**
 * Prompt the user for project configuration.
 * @returns {Promise<object>} User answers
 */
async function promptUser() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question, defaultVal) => new Promise((resolve) => {
    const prompt = defaultVal ? `${question} (${defaultVal}): ` : `${question}: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });

  console.log('');
  const name = await ask('? Project name', 'my-project');
  const description = await ask('? Project description', '');
  const type = await ask('? Project type (web-app|api|cli|library|mobile|monorepo|other)', 'web-app');
  const language = await ask('? Primary language', 'TypeScript');
  const framework = await ask('? Framework (optional)', '');
  const database = await ask('? Database (optional)', '');
  const testing = await ask('? Test framework (optional)', '');
  const autonomy = await ask('? Autonomy level (auto|guided|collaborative)', 'guided');

  rl.close();

  return { name, description, type, language, framework, database, testing, autonomy };
}

/**
 * Get default answers for --yes mode.
 * @returns {object} Default answers
 */
function getDefaults() {
  return {
    name: 'my-project',
    description: '',
    type: 'web-app',
    language: 'TypeScript',
    framework: '',
    database: '',
    testing: '',
    autonomy: 'guided',
  };
}

/**
 * Get template-based defaults.
 * @param {string} templateName
 * @returns {object} Template-specific overrides
 */
function getTemplateDefaults(templateName) {
  const templates = {
    'next-app': { language: 'TypeScript', framework: 'Next.js', testing: 'Jest' },
    'express-api': { language: 'TypeScript', framework: 'Express', testing: 'Jest' },
    'react-app': { language: 'TypeScript', framework: 'React', testing: 'Vitest' },
    'node-cli': { language: 'JavaScript', framework: '', testing: 'node:test', type: 'cli' },
    'python-api': { language: 'Python', framework: 'FastAPI', testing: 'pytest', type: 'api' },
  };

  if (!templates[templateName]) {
    console.warn(`Unknown template "${templateName}". Available: ${Object.keys(templates).join(', ')}`);
    return {};
  }

  return templates[templateName];
}

/**
 * Build the swarm.yaml configuration object.
 * @param {object} answers - User answers
 * @returns {object} swarm.yaml content
 */
function buildSwarmYaml(answers) {
  const config = {
    project: {
      name: answers.name,
      description: answers.description || undefined,
      type: answers.type,
    },
    stack: {
      language: answers.language,
    },
    methodology: {
      autonomy: answers.autonomy,
      phases: {
        exploration: { enabled: true },
        definition: { enabled: true },
        design: { enabled: true },
        implementation: { enabled: true, parallel_devs: 2 },
        delivery: { enabled: true },
      },
      quality: {
        require_tests: true,
        require_review: true,
        require_human_approval: ['prd', 'architecture'],
      },
    },
    output: {
      artifacts_dir: './artifacts',
      code_dir: './src',
    },
  };

  if (answers.framework) config.stack.framework = answers.framework;
  if (answers.database) config.stack.database = answers.database;
  if (answers.testing) config.stack.testing = answers.testing;

  return config;
}

/**
 * Build the initial project.yaml state file.
 * @param {object} answers - User answers
 * @returns {object} project.yaml content
 */
function buildProjectYaml(answers) {
  return {
    project: {
      name: answers.name,
      type: answers.type,
    },
    phase: 'not-started',
    status: 'initialized',
    created: new Date().toISOString().split('T')[0],
  };
}

