import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../utils/paths.js';

// `bmad-swarm recall <query…>` — interrogate the project's knowledge ledger and
// answer with cited L/D/C records (diverge-knowledge §7.1). This is a thin front
// end over `record.cjs recall`: record.cjs is the single confined door to the
// serialized context files, so the CLI never reads/writes them directly — it
// spawns the same pinned script a scaffolded project uses.

/**
 * Resolve the record.cjs to run: prefer the project's shipped copy
 * (.claude/bmad/bin/record.cjs), else this package's bin/record.cjs.
 */
export function resolveRecordCjs(projectRoot) {
  const shipped = join(projectRoot, '.claude', 'bmad', 'bin', 'record.cjs');
  if (existsSync(shipped)) return shipped;
  return join(PACKAGE_ROOT, 'bin', 'record.cjs');
}

export function registerRecallCommand(program) {
  program
    .command('recall')
    .description('Interrogate the knowledge ledger; answers cite L/D/C records')
    .argument('<query...>', 'words to match against lessons, decisions, and claims')
    .option('--json', 'emit structured JSON')
    .addHelpText('after', `
Examples:
  $ bmad-swarm recall auth session         What have we learned about auth/sessions?
  $ bmad-swarm recall fixture provenance   Cited lessons on fixture provenance
`)
    .action((query, options) => {
      const projectRoot = process.cwd();
      const cli = resolveRecordCjs(projectRoot);
      const args = ['recall', ...query];
      if (options.json) args.push('--json');
      const r = spawnSync('node', [cli, ...args], {
        stdio: 'inherit',
        env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
      });
      process.exit(r.status == null ? 1 : r.status);
    });
}
