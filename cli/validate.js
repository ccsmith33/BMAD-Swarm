import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { getProjectPaths } from '../utils/paths.js';
import { validateArtifacts } from '../utils/artifact-validator.js';

export function registerValidateCommand(program) {
  program
    .command('validate')
    .description('Validate artifact quality against quality gate criteria')
    .option('--phase <name>', 'Check only artifacts in a specific phase (exploration, planning, design, implementation)')
    .option('--artifact <path>', 'Check a single artifact file')
    .addHelpText('after', `
Examples:
  $ bmad-swarm validate                           Validate all artifacts
  $ bmad-swarm validate --phase design             Validate design artifacts only
  $ bmad-swarm validate --artifact artifacts/planning/prd.md  Validate single file
`)
    .action(async (options) => {
      try {
        await runValidate(options);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

async function runValidate(options) {
  const projectRoot = process.cwd();
  const paths = getProjectPaths(projectRoot);

  const artifactOpt = options.artifact ? resolve(options.artifact) : undefined;
  const result = validateArtifacts(paths.artifactsDir, {
    phase: options.phase,
    artifact: artifactOpt,
  });

  console.log('\nArtifact Validation Report\n');

  for (const r of result.results) {
    const icon = r.status === 'pass' ? '\u2713' : '\u2717';
    console.log(`  ${icon} ${r.file}`);
    for (const issue of r.issues) {
      console.log(`    - ${issue}`);
    }
  }

  console.log(`\nTotal: ${result.passed} passed, ${result.failed} failed`);

  if (result.failed > 0) {
    process.exit(1);
  }
}
