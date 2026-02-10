import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
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
    .argument('<type>', 'Type to uneject ("agent" or "methodology")')
    .argument('<name>', 'Name of the item to restore')
    .addHelpText('after', `
Examples:
  $ bmad-swarm uneject agent developer             Restore developer to package version
  $ bmad-swarm uneject methodology phases           Restore phases.yaml to package version
  $ bmad-swarm uneject methodology quality-gate/prd-quality  Restore a quality gate

Deletes the override file. The next "bmad-swarm update" will use the package version.
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
    unejectMethodology(name, paths);
    console.log(`Removed ejected override for methodology "${name}".`);
    console.log('Next `bmad-swarm update` will use the package version.');
  } else {
    console.error(`Unknown uneject type: "${type}". Supported types: agent, methodology`);
    process.exit(1);
  }
}

/**
 * Remove an ejected methodology override.
 * @param {string} name - Name like "phases" or "quality-gate/prd-quality"
 * @param {object} paths - Project paths
 */
function unejectMethodology(name, paths) {
  let destRelative;
  if (name === 'phases') {
    destRelative = 'phases.yaml';
  } else if (name.startsWith('quality-gate/') || name.startsWith('quality-gate\\')) {
    const gateName = name.split(/[/\\]/).pop();
    destRelative = join('quality-gates', `${gateName}.md`);
  } else {
    destRelative = name.endsWith('.yaml') ? name : `${name}.yaml`;
  }

  const overridePath = join(paths.overridesMethodologyDir, destRelative);
  if (!existsSync(overridePath)) {
    throw new Error(`Methodology "${name}" is not ejected (no file at ${overridePath})`);
  }

  unlinkSync(overridePath);
}
