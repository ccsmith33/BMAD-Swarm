import { spawnSync } from 'node:child_process';
import { resolveRecordCjs } from './recall.js';

// `bmad-swarm lessons <sub>` — the knowledge-promotion front end over record.cjs
// (diverge-knowledge §7). Every subcommand delegates to the pinned, confined
// record.cjs so the serialized-write discipline and the human gates live in ONE
// place; the CLI only forwards args + streams.
//
//   lessons harvest --from <dir|file>   mine retrospectives into L-records
//   lessons propose <L-ID>              emit a human-gated promotion proposal
//   lessons reopen-scan                 surface rejected R-records to re-review

function runRecord(args) {
  const projectRoot = process.cwd();
  const cli = resolveRecordCjs(projectRoot);
  const r = spawnSync('node', [cli, ...args], {
    stdio: 'inherit',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
  });
  process.exit(r.status == null ? 1 : r.status);
}

export function registerLessonsCommand(program) {
  const lessons = program
    .command('lessons')
    .description('Harvest, propose, and review knowledge-ledger lessons');

  lessons
    .command('harvest')
    .description('Mine retrospectives/lessons markdown into L-records (recurrence-aware)')
    .requiredOption('--from <path>', 'directory or file of retrospectives to harvest')
    .option('--project <name>', 'force a single provenance project (default: inferred from source path)')
    .option('--dry-run', 'list what would be harvested without writing')
    .option('--json', 'emit structured JSON')
    .action((options) => {
      const args = ['harvest', '--from', options.from];
      if (options.project) args.push('--project', options.project);
      if (options.dryRun) args.push('--dry-run');
      if (options.json) args.push('--json');
      runRecord(args);
    });

  lessons
    .command('propose')
    .description('Emit a human-gated promotion proposal with retro-catch evidence')
    .argument('<lessonId>', 'the L-ID to propose for promotion')
    .option('--artifacts-root <dir>', 'root to run the counterfactual retro-catch over')
    .option('--json', 'emit structured JSON')
    .action((lessonId, options) => {
      const args = ['promote-propose', lessonId];
      if (options.artifactsRoot) args.push('--artifacts-root', options.artifactsRoot);
      if (options.json) args.push('--json');
      runRecord(args);
    });

  lessons
    .command('reopen-scan')
    .description('Surface rejected R-records whose re-open trigger may have fired (advisory)')
    .option('--against <path>', 'file or text to test triggers against')
    .option('--json', 'emit structured JSON')
    .action((options) => {
      const args = ['reopen-scan'];
      if (options.against) args.push('--against', options.against);
      if (options.json) args.push('--json');
      runRecord(args);
    });
}
