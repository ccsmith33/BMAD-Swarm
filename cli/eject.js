import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectPaths, PACKAGE_METHODOLOGY_DIR } from '../utils/paths.js';
import { ejectAgent } from '../generators/agent-generator.js';
import { writeFileSafe, ensureDir } from '../utils/fs-helpers.js';

/**
 * Register the eject command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerEjectCommand(program) {
  program
    .command('eject')
    .description('Copy a package agent to overrides/ for full local customization')
    .argument('<type>', 'Type to eject ("agent" or "methodology")')
    .argument('<name>', 'Name of the item to eject')
    .addHelpText('after', `
Examples:
  $ bmad-swarm eject agent developer              Eject the developer agent
  $ bmad-swarm eject agent orchestrator            Eject the orchestrator agent
  $ bmad-swarm eject methodology phases            Eject phases.yaml
  $ bmad-swarm eject methodology quality-gate prd-quality  Eject a quality gate

Agent ejections go to overrides/agents/<name>.md
Methodology ejections go to overrides/methodology/<path>
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
    const ejectedPath = ejectMethodology(name, paths);
    console.log(`Ejected methodology "${name}" to ${ejectedPath}`);
    console.log('This local copy now takes priority over the package version.');
    console.log(`To return to package version: bmad-swarm uneject methodology ${name}`);
  } else {
    console.error(`Unknown eject type: "${type}". Supported types: agent, methodology`);
    process.exit(1);
  }
}

/**
 * Eject a methodology file to overrides/methodology/.
 * @param {string} name - Name like "phases" or "quality-gate/prd-quality"
 * @param {object} paths - Project paths
 * @returns {string} Path to the ejected file
 */
function ejectMethodology(name, paths) {
  // Map name to source file
  let sourcePath;
  let destRelative;
  if (name === 'phases') {
    sourcePath = join(PACKAGE_METHODOLOGY_DIR, 'phases.yaml');
    destRelative = 'phases.yaml';
  } else if (name.startsWith('quality-gate/') || name.startsWith('quality-gate\\')) {
    const gateName = name.split(/[/\\]/).pop();
    sourcePath = join(PACKAGE_METHODOLOGY_DIR, 'quality-gates', `${gateName}.md`);
    destRelative = join('quality-gates', `${gateName}.md`);
  } else {
    // Try as a direct path under methodology/
    sourcePath = join(PACKAGE_METHODOLOGY_DIR, name.endsWith('.yaml') ? name : `${name}.yaml`);
    destRelative = name.endsWith('.yaml') ? name : `${name}.yaml`;
  }

  if (!existsSync(sourcePath)) {
    throw new Error(`No methodology file found for "${name}" at ${sourcePath}`);
  }

  const destPath = join(paths.overridesMethodologyDir, destRelative);
  if (existsSync(destPath)) {
    throw new Error(`Methodology "${name}" is already ejected at ${destPath}`);
  }

  const content = readFileSync(sourcePath, 'utf8');
  const header = `# EJECTED from @bmad/swarm - this file takes priority over the package version\n# To return to package version, run: bmad-swarm uneject methodology ${name}\n\n`;

  ensureDir(paths.overridesMethodologyDir);
  writeFileSafe(destPath, header + content);
  return destPath;
}
