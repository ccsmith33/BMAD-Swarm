import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { getProjectPaths } from '../utils/paths.js';
import { splitFrontmatter } from '../utils/project-brain.js';

/**
 * Register the status command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerStatusCommand(program) {
  program
    .command('status')
    .description('Show project configuration, current phase, agent status, and artifact counts')
    .addHelpText('after', `
Examples:
  $ bmad-swarm status    Display project name, type, stack, autonomy level,
                         current phase, agent list (with ejected markers),
                         and artifact file counts per directory
`)
    .action(async () => {
      try {
        await runStatus();
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Run the status command.
 * Reads the project-brain frontmatter (D-037 machine-state home) and shows
 * phase + gate status, agent status, and artifact counts.
 */
async function runStatus() {
  const projectRoot = process.cwd();
  const paths = getProjectPaths(projectRoot);

  // Check if initialized
  if (!existsSync(paths.swarmYaml)) {
    console.log('Not a BMAD Swarm project. Run `bmad-swarm init` first.');
    return;
  }

  // Read swarm.yaml
  const config = yaml.load(readFileSync(paths.swarmYaml, 'utf8'));
  console.log(`\n  Project: ${config.project?.name || 'unknown'}`);
  console.log(`  Type: ${config.project?.type || 'unknown'}`);
  console.log(`  Stack: ${[config.stack?.language, config.stack?.framework].filter(Boolean).join(' + ') || 'not specified'}`);
  console.log(`  Autonomy: ${config.methodology?.autonomy || 'guided'}`);

  // Read machine state (phase + gates) from the project-brain frontmatter — the
  // D-037 home; there is no project.yaml.
  if (existsSync(paths.brainPath)) {
    const { frontmatter } = splitFrontmatter(readFileSync(paths.brainPath, 'utf8'));
    const fm = frontmatter || {};
    console.log(`\n  Phase: ${fm.phase || 'unknown'}`);
    const gates = fm.gates && typeof fm.gates === 'object' ? Object.entries(fm.gates) : [];
    if (gates.length > 0) {
      console.log('  Gates:');
      for (const [name, spec] of gates) {
        console.log(`    ${name}: ${(spec && spec.status) || 'unknown'}`);
      }
    }
  }

  // Check agents
  console.log('\n  Agents:');
  if (existsSync(paths.agentsDir)) {
    const agentFiles = readdirSync(paths.agentsDir).filter(f => f.endsWith('.md'));
    for (const file of agentFiles) {
      const name = file.replace('.md', '');
      const ejectedPath = join(paths.overridesAgentsDir, file);
      const isEjected = existsSync(ejectedPath);
      console.log(`    ${name}${isEjected ? ' (ejected)' : ''}`);
    }
  } else {
    console.log('    No agents generated yet');
  }

  // Check artifacts
  console.log('\n  Artifacts:');
  if (existsSync(paths.artifactsDir)) {
    const subdirs = ['exploration', 'planning', 'design', 'implementation', 'reviews', 'context'];
    for (const subdir of subdirs) {
      const subdirPath = join(paths.artifactsDir, subdir);
      if (existsSync(subdirPath)) {
        try {
          const files = readdirSync(subdirPath, { recursive: true })
            .filter(f => typeof f === 'string' && f.endsWith('.md'));
          if (files.length > 0) {
            console.log(`    ${subdir}/: ${files.length} file(s)`);
          }
        } catch {
          // Ignore
        }
      }
    }
  }

  console.log('');
}
