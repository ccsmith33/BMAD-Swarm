import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import yaml from 'js-yaml';
import { getProjectPaths } from '../utils/paths.js';
import { writeFileSafe, ensureDir, updateGitignore } from '../utils/fs-helpers.js';
import { generateAgents } from '../generators/agent-generator.js';
import { generateMethodology } from '../generators/methodology-generator.js';
import { generateBin } from '../generators/bin-generator.js';
import { generateClaudeMd } from '../generators/claude-md-generator.js';
import { generateHooks } from '../generators/hooks-generator.js';
import { generateSettings } from '../generators/settings-generator.js';
import { generateRules } from '../generators/rules-generator.js';
import { renderEarnedRulesReview } from '../utils/earned-rules.js';
import { generateCommands } from '../generators/commands-generator.js';
import { generateWorkflows } from '../generators/workflows-generator.js';
import { generateVersionStamp } from '../generators/version-stamp-generator.js';
import { loadSwarmConfig } from '../utils/config.js';
import { DEFAULT_MODEL } from '../utils/validator.js';
import { runScan } from './scan.js';
import { generateGitHubWorkflow } from '../generators/github-actions-generator.js';

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
    .option('--github', 'Generate GitHub Actions workflow for artifact validation')
    .option('--skip-earned-rules', 'Do not compile promoted cross-project lessons into the scaffold')
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
    // F-017: with piped/redirected stdin, readline drops buffered answers and
    // Node exits 0 mid-await once stdin hits EOF — init would report success
    // having created nothing. Interactive prompts require a real terminal.
    if (!process.stdin.isTTY) {
      throw new Error('interactive init needs a terminal (stdin is not a TTY). Use `bmad-swarm init -y` for defaults, optionally with --template <name> or --scan.');
    }
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

  // 3.5. Ship the methodology subset into .claude/bmad/methodology/ so the
  // generated agents' and commands' methodology references resolve (CB-1).
  const methodologyResult = generateMethodology(config, paths);
  console.log(`  \u2713 Generated .claude/bmad/methodology/ (${methodologyResult.generated.length} files)`);

  // 3.6. Ship the pinned serialized-write CLI into .claude/bmad/bin/ (ADR-021).
  const binResult = generateBin(config, paths);
  console.log(`  \u2713 Generated .claude/bmad/bin/ (${binResult.generated.length} script)`);

  // 4. Generate .claude/settings.json
  generateSettings(config, paths);
  console.log('  \u2713 Generated .claude/settings.json');

  // 5. Generate .claude/hooks/
  const hookResult = generateHooks(config, paths);
  console.log(`  \u2713 Generated .claude/hooks/ (${hookResult.generated.length} hooks)`);

  // 6. Generate .claude/rules/
  const rulesResult = generateRules(config, paths, { skipEarnedRules: !!options.skipEarnedRules });
  console.log(`  \u2713 Generated .claude/rules/ (${rulesResult.generated.length} rules)`);

  // 6.1. Born-immune human review (K-2 compensating control): surface any earned
  // rules compiled into the scaffold so a self-promoted rule can't ship silently.
  const earnedReview = renderEarnedRulesReview(rulesResult.earnedLessons, 'init');
  if (earnedReview) console.log(earnedReview);

  // 6.5. Generate .claude/commands/
  const commandResult = generateCommands(config, paths);
  console.log(`  \u2713 Generated .claude/commands/ (${commandResult.generated.length} commands)`);

  // 6.6. Generate .claude/workflows/ (regime router deterministic tier)
  const workflowResult = generateWorkflows(config, paths);
  console.log(`  \u2713 Generated .claude/workflows/ (${workflowResult.generated.length} workflows)`);

  // 7. Generate CLAUDE.md
  generateClaudeMd(config, paths);
  console.log('  \u2713 Generated CLAUDE.md');

  // 7.5. Stamp the scaffold with the version that produced it (auto-heal, F-29/
  // F-30). A fresh init is a full generation, so the stamp is always advanced.
  const stampResult = generateVersionStamp(config, paths);
  console.log(`  \u2713 Stamped scaffold version (.claude/.bmad-version.json @ ${stampResult.version})`);

  // 8. Create artifacts directory structure
  const artifactSubdirs = ['exploration', 'planning', 'design', 'design/decisions', 'implementation', 'implementation/stories', 'reviews', 'context'];
  for (const subdir of artifactSubdirs) {
    ensureDir(join(paths.artifactsDir, subdir));
  }
  console.log('  \u2713 Created artifacts/ directory');

  // Machine state (phase + gates) is homed in the project-brain frontmatter when
  // the orchestrator first writes the brain (D-037). There is NO project.yaml \u2014
  // it was a prompted chore-file that lied in 8/9 field projects.

  // 10. Create overrides directory
  ensureDir(paths.overridesAgentsDir);

  // 11. Update .gitignore
  updateGitignore(projectRoot);
  console.log('  ✓ Updated .gitignore');

  // 12. Initialize git repo if not already one (required for Claude Code to load hooks)
  if (!existsSync(join(projectRoot, '.git'))) {
    try {
      execSync('git init', { cwd: projectRoot, stdio: 'pipe' });
      console.log('  \u2713 Initialized git repository');
    } catch {
      console.warn('  ! Could not initialize git repository (git not found). Run `git init` manually.');
    }
  }

  // 13. Generate GitHub Actions workflow if requested
  if (options.github) {
    const workflowPath = generateGitHubWorkflow(projectRoot);
    console.log(`  \u2713 Generated ${workflowPath}`);
  }

  // Display cost estimate
  const { estimateCost } = await import('../utils/cost-estimator.js');
  const estimate = estimateCost(config);
  console.log(`\nEstimated cost for a full lifecycle run: ${estimate.estimatedCostMin}-${estimate.estimatedCostMax}`);
  console.log('  (Based on configured agents and phases. Actual costs vary.)');

  console.log('\nReady! Run `bmad-swarm start` to launch Claude with orchestrator instructions.');
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

  // F-017 safety net: if stdin closes mid-prompt (EOF, Ctrl-D), the pending
  // rl.question callback never fires and the awaited promise would hang the
  // event loop into a silent exit-0. Reject instead so init fails loudly.
  let finished = false;
  let rejectPending = null;
  rl.on('close', () => {
    if (!finished && rejectPending) {
      rejectPending(new Error('stdin closed before all prompts were answered. Use `bmad-swarm init -y` for defaults.'));
    }
  });

  const ask = (question, defaultVal) => new Promise((resolve, reject) => {
    rejectPending = reject;
    const prompt = defaultVal ? `${question} (${defaultVal}): ` : `${question}: `;
    rl.question(prompt, (answer) => {
      rejectPending = null;
      resolve(answer.trim() || defaultVal || '');
    });
  });

  try {
    console.log('');
    const name = await ask('? Project name', 'my-project');
    const description = await ask('? Project description', '');
    const type = await ask('? Project type (web-app|api|cli|library|mobile|monorepo|other)', 'web-app');
    const language = await ask('? Primary language', 'TypeScript');
    const framework = await ask('? Framework (optional)', '');
    const database = await ask('? Database (optional)', '');
    const testing = await ask('? Test framework (optional)', '');
    const autonomy = await ask('? Autonomy level (auto|guided|collaborative)', 'guided');

    return { name, description, type, language, framework, database, testing, autonomy };
  } finally {
    finished = true;
    rl.close();
  }
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
        ideation: { enabled: true },
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
    defaults: {
      model: DEFAULT_MODEL,
    },
    output: {
      artifacts_dir: './artifacts',
      code_dir: './src',
    },
    // Auto-heal delivery (F-29/F-30): at a fresh session start, compare the
    // installed bmad-swarm to the version stamp the scaffold was generated with,
    // and on drift `offer` a one-line `bmad-swarm update` prompt (default; writes
    // nothing, so it never hot-swaps a live session), `auto` (run update at the
    // fresh-start safe window), or `off`.
    delivery: {
      auto_heal: 'offer',
    },
    // Replay gate (ADR-022 / D-049): the deterministic evidence engine re-runs
    // ONLY these command shapes (prefix match) — no agent-invented command is
    // ever executed. Widen allowed_commands to your test runner.
    replay: {
      allowed_commands: ['npm test', 'npm run test', 'node --test'],
      timeout_seconds: 300,
      url_citations: 'advisory',
      gated_task_classes: ['story', 'bug-fix', 'review'],
      gated_owner_pattern: '^(dev|reviewer|security)',
    },
  };

  if (answers.framework) config.stack.framework = answers.framework;
  if (answers.database) config.stack.database = answers.database;
  if (answers.testing) config.stack.testing = answers.testing;

  return config;
}

