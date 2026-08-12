import { getProjectPaths } from '../utils/paths.js';
import { unejectAgent } from '../generators/agent-generator.js';

/**
 * Register the uneject command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerUnejectCommand(program) {
  program
    .command('uneject')
    .description('Remove a local override and restore the package version of an agent')
    .argument('<type>', 'Type to uneject ("agent")')
    .argument('<name>', 'Name of the item to restore')
    .addHelpText('after', `
Examples:
  $ bmad-swarm uneject agent developer             Restore developer to package version

Deletes the override file. The next "bmad-swarm update" will use the package version.

Methodology is no longer ejected/unejected: the shipped copy in
.claude/bmad/methodology/ is the editable surface. To discard your edits and
restore the package version of a shipped file, delete it and run
\`bmad-swarm update\` (or run update with --force).
`)
    .action(async (type, name) => {
      try {
        await runUneject(type, name);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Run the uneject command.
 * @param {string} type - Type to uneject ("agent")
 * @param {string} name - Name of the agent
 */
async function runUneject(type, name) {
  const projectRoot = process.cwd();
  const paths = getProjectPaths(projectRoot);

  if (type === 'agent') {
    unejectAgent(name, paths);
    console.log(`Removed ejected override for agent "${name}".`);
    console.log('Next `bmad-swarm update` will regenerate from the package version.');
  } else if (type === 'methodology') {
    console.error('Methodology uneject was removed. The shipped copy in `.claude/bmad/methodology/`');
    console.error('is the editable surface. To restore the package version of a shipped file, delete');
    console.error('it and run `bmad-swarm update` (or run update with --force to overwrite edits).');
    process.exit(1);
  } else {
    console.error(`Unknown uneject type: "${type}". Supported types: agent`);
    process.exit(1);
  }
}
