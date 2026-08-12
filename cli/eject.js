import { getProjectPaths } from '../utils/paths.js';
import { ejectAgent } from '../generators/agent-generator.js';

/**
 * Register the eject command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerEjectCommand(program) {
  program
    .command('eject')
    .description('Copy a package agent to overrides/ for full local customization')
    .argument('<type>', 'Type to eject ("agent")')
    .argument('<name>', 'Name of the item to eject')
    .addHelpText('after', `
Examples:
  $ bmad-swarm eject agent developer              Eject the developer agent
  $ bmad-swarm eject agent orchestrator            Eject the orchestrator agent

Agent ejections go to overrides/agents/<name>.md

Methodology is no longer ejected: the load-bearing subset ships into
.claude/bmad/methodology/ on init/update and that shipped copy IS the editable
surface — edit it in place (\`bmad-swarm update\` preserves your edits).
`)
    .action(async (type, name) => {
      try {
        await runEject(type, name);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Run the eject command.
 * @param {string} type - Type to eject ("agent")
 * @param {string} name - Name of the agent
 */
async function runEject(type, name) {
  const projectRoot = process.cwd();
  const paths = getProjectPaths(projectRoot);

  if (type === 'agent') {
    const ejectedPath = ejectAgent(name, paths);
    console.log(`Ejected agent "${name}" to ${ejectedPath}`);
    console.log('This local copy now takes priority over the package version.');
    console.log(`\`bmad-swarm update\` will NOT overwrite it.`);
    console.log(`To return to package version: bmad-swarm uneject agent ${name}`);
  } else if (type === 'methodology') {
    console.error('Methodology eject was removed. The load-bearing methodology subset now ships');
    console.error('into `.claude/bmad/methodology/` on init/update — that shipped copy IS the');
    console.error('editable surface. Edit those files in place; `bmad-swarm update` preserves your');
    console.error('edits (they are hash-tracked like agents and skipped unless you pass --force).');
    process.exit(1);
  } else {
    console.error(`Unknown eject type: "${type}". Supported types: agent`);
    process.exit(1);
  }
}
