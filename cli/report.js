import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { getProjectPaths } from '../utils/paths.js';
import { missionControlMarkdown, morningReportMarkdown } from '../utils/mission-control.js';

/**
 * Register the report command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerReportCommand(program) {
  program
    .command('report')
    .description('Generate the read-only Mission Control surface to artifacts/delivery/mission-control-<date>.md')
    .option('--morning', 'Generate the 7-section ranked morning action queue (report-from-ledger) to artifacts/delivery/morning-report-<date>.md')
    .addHelpText('after', `
Examples:
  $ bmad-swarm report    Render the four Mission Control panels (awaiting-human,
                         running/stuck, decisions/recommendations, spend estimate)
                         to a dated markdown file under artifacts/delivery/.
                         Read-only w.r.t. the durable stores — it only writes the
                         generated report; regenerating overwrites the same-date file.

  $ bmad-swarm report --morning
                         Render the seven-section ranked action queue for the night
                         just past (answer / pick / merge / shelf / proposals /
                         parked-tripwired / night-ledger), generated exclusively from
                         the durable stores (task-ledger, ledger, decision-log,
                         charter, git branch list) — report-from-ledger, so a fresh
                         session after a 5am orchestrator death produces the same report.
`)
    .action(async (opts) => {
      try {
        if (opts.morning) {
          await runMorningReport();
        } else {
          await runReport();
        }
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

/**
 * Read the git branch list (read-only). The morning report's MERGE THESE and
 * INITIATIVE SHELF sections are driven by the `queue/*` and `initiative/*`
 * branches on disk — a durable store the fresh-process report reads directly.
 * Returns [] outside a git repo (the report still generates its other sections).
 */
function readGitBranches(cwd) {
  try {
    // The format string is single-quoted: its parentheses are a subshell to
    // /bin/sh and error out unquoted (execSync runs through the shell).
    const out = execSync("git branch --format='%(refname:short)'", { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Generate the seven-section morning report and write it to a dated file under
 * artifacts/delivery/. REPORT-FROM-LEDGER: every section comes from the durable
 * stores (read via utils/mission-control.js) plus the git branch list read here.
 * Nothing in the durable stores is mutated — the surface only writes its own
 * generated report. This is the path a FRESH session runs when the orchestrator
 * that drove the night is dead (report-from-ledger, never report-from-memory).
 */
async function runMorningReport() {
  const projectRoot = process.cwd();
  const paths = getProjectPaths(projectRoot);

  if (!existsSync(paths.swarmYaml)) {
    console.log('Not a BMAD Swarm project. Run `bmad-swarm init` first.');
    return;
  }

  const branches = readGitBranches(projectRoot);
  const markdown = morningReportMarkdown(projectRoot, { branches });

  const deliveryDir = join(paths.artifactsDir, 'delivery');
  if (!existsSync(deliveryDir)) mkdirSync(deliveryDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const outPath = join(deliveryDir, `morning-report-${date}.md`);
  writeFileSync(outPath, markdown);

  console.log(`Generated morning report: ${outPath}`);
}
