import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { generateAgents } from '../generators/agent-generator.js';
import { generateClaudeMd } from '../generators/claude-md-generator.js';
import { generateHooks } from '../generators/hooks-generator.js';
import { generateSettings } from '../generators/settings-generator.js';

/**
 * Register the update command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerUpdateCommand(program) {
  program
    .command('update')
    .description('Regenerate all managed files (.claude/agents, CLAUDE.md, hooks, settings) from swarm.yaml')
    .option('--dry-run', 'Preview what would be regenerated without writing any files')
    .addHelpText('after', `
Examples:
  $ bmad-swarm update              Regenerate all managed files
  $ bmad-swarm update --dry-run    See what would change without writing

Safe to run repeatedly. Never touches user-owned files:
  swarm.yaml, overrides/, artifacts/, src/
Ejected agents (in overrides/agents/) are preserved and used as-is.
`)
    .action(async (options) => {
      try {
        await runUpdate(options);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Run the update command.
 * Safe: never touches swarm.yaml, overrides/, artifacts/, or src/.
 * @param {object} options - Command options
 */
async function runUpdate(options) {
  const projectRoot = process.cwd();
  const paths = getProjectPaths(projectRoot);

  if (!existsSync(paths.swarmYaml)) {
    console.error('No swarm.yaml found. Run `bmad-swarm init` first.');
    process.exit(1);
  }

  const config = loadSwarmConfig(paths.swarmYaml);

  if (options.dryRun) {
    console.log('Dry run - showing what would be regenerated:\n');
  }

  console.log('Regenerating from package + swarm.yaml...');

  // 1. Regenerate agents
  if (options.dryRun) {
    console.log('  Would regenerate .claude/agents/');
  } else {
    const agentResult = generateAgents(config, paths);
    console.log(`  \u2713 Regenerated .claude/agents/ (${agentResult.generated.length} generated, ${agentResult.skipped.length} ejected)`);
    if (agentResult.skipped.length > 0) {
      console.log(`    Ejected (using local override): ${agentResult.skipped.join(', ')}`);
    }
  }

  // 2. Regenerate CLAUDE.md
  if (options.dryRun) {
    console.log('  Would regenerate CLAUDE.md');
  } else {
    generateClaudeMd(config, paths);
    console.log('  \u2713 Regenerated CLAUDE.md');
  }

  // 3. Regenerate hooks
  if (options.dryRun) {
    console.log('  Would regenerate .claude/hooks/');
  } else {
    const hookPaths = generateHooks(config, paths);
    console.log(`  \u2713 Regenerated .claude/hooks/ (${hookPaths.length} hooks)`);
  }

  // 4. Regenerate settings.json
  if (options.dryRun) {
    console.log('  Would regenerate .claude/settings.json');
  } else {
    generateSettings(paths);
    console.log('  \u2713 Regenerated .claude/settings.json');
  }

  console.log('\nUpdate complete. User-owned files (swarm.yaml, overrides/, artifacts/) were not touched.');
}
