import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectPaths } from '../utils/paths.js';
import { missionControlMarkdown } from '../utils/mission-control.js';

/**
 * Register the report command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerReportCommand(program) {
  program
    .command('report')
    .description('Generate the read-only Mission Control surface to artifacts/delivery/mission-control-<date>.md')
    .addHelpText('after', `
Examples:
  $ bmad-swarm report    Render the four Mission Control panels (awaiting-human,
                         running/stuck, decisions/recommendations, spend estimate)
                         to a dated markdown file under artifacts/delivery/.
                         Read-only w.r.t. the durable stores — it only writes the
                         generated report; regenerating overwrites the same-date file.
`)
    .action(async () => {
      try {
        await runReport();
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Generate the Mission Control markdown and write it to a dated file under
 * artifacts/delivery/. This is the D-041 read-only surface: it reads the durable
 * stores and writes ONLY its own generated report — it never mutates the ledger,
 * task-ledger, brain, or decision log. The date comes from the real clock (the
 * CLI has clock access, unlike the workflow sandbox).
 */
async function runReport() {
  const projectRoot = process.cwd();
  const paths = getProjectPaths(projectRoot);

  if (!existsSync(paths.swarmYaml)) {
    console.log('Not a BMAD Swarm project. Run `bmad-swarm init` first.');
    return;
  }

  const markdown = missionControlMarkdown(projectRoot);

  const deliveryDir = join(paths.artifactsDir, 'delivery');
  if (!existsSync(deliveryDir)) mkdirSync(deliveryDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const outPath = join(deliveryDir, `mission-control-${date}.md`);
  writeFileSync(outPath, markdown);

  console.log(`Generated Mission Control report: ${outPath}`);
}
