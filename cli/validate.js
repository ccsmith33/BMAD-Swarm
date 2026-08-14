import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { getProjectPaths } from '../utils/paths.js';
import { validateArtifacts } from '../utils/artifact-validator.js';
import { readFileSafe } from '../utils/fs-helpers.js';
import { validateBrain, BUDGET_TOKENS } from '../utils/project-brain.js';

export function registerValidateCommand(program) {
  program
    .command('validate')
    .description('Validate artifact quality against quality gate criteria')
    .option('--phase <name>', 'Check only artifacts in a specific phase (exploration, planning, design, implementation, reviews)')
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
    // Claims-table lint is ADVISORY: warnings print but never fail the command
    // (a file-shape check is gameable by its author \u2014 D-039). Same posture as
    // the project-brain lint below.
    for (const w of (r.warnings || [])) {
      console.log(`    \u2139 ${w}`);
    }
  }

  console.log(`\nTotal: ${result.passed} passed, ${result.failed} failed`);

  // Project-brain budget lint — ADVISORY only (the brain is a comprehension aid,
  // not a quality gate; spec §4.4 line 239). It never changes the exit code.
  lintProjectBrain(paths);

  if (result.failed > 0) {
    process.exit(1);
  }
}

// Advisory budget/schema lint for artifacts/context/project-brain.md. Prints an
// over-budget warning (the touch-or-die eviction trigger) plus any schema
// errors/warnings as advisories. Deliberately does NOT affect the exit code.
function lintProjectBrain(paths) {
  const brainPath = join(paths.artifactsDir, 'context', 'project-brain.md');
  if (!existsSync(brainPath)) return; // the brain is optional
  const text = readFileSafe(brainPath) || '';
  const v = validateBrain(text);

  console.log('\nProject Brain (advisory — comprehension aid, not a gate)\n');
  if (v.overBudget) {
    console.log(`  ⚠ over budget: ${v.tokens} tokens exceeds the ~${BUDGET_TOKENS}-token cap — run a touch-or-die eviction pass at the next checkpoint`);
  } else {
    console.log(`  ✓ within budget: ${v.tokens}/${BUDGET_TOKENS} tokens`);
  }
  for (const e of v.errors) {
    if (/^budget:/.test(e)) continue; // already surfaced above
    console.log(`  ⚠ ${e}`);
  }
  for (const w of v.warnings) {
    console.log(`  ℹ ${w}`);
  }
}
