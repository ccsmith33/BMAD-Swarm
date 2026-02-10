import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { getProjectPaths } from '../utils/paths.js';

/**
 * Register the start command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerStartCommand(program) {
  program
    .command('start')
    .description('Launch Claude Code with orchestrator system prompt')
    .option('--print', 'Print the claude command instead of running it')
    .option('--dangerous', 'Launch in dangerously-skip-permissions mode (skips all permission prompts)')
    .action(async (options) => {
      const projectRoot = process.cwd();
      const paths = getProjectPaths(projectRoot);

      if (!existsSync(paths.systemPrompt)) {
        console.error('No .claude/system-prompt.txt found. Run `bmad-swarm init` first.');
        process.exit(1);
      }

      const args = ['--append-system-prompt', paths.systemPrompt];

      if (options.dangerous) {
        args.push('--dangerously-skip-permissions');
      }

      if (options.print) {
        console.log(`claude ${args.join(' ')}`);
        return;
      }

      const child = spawn('claude', args, { stdio: 'inherit', shell: process.platform === 'win32' });
      child.on('exit', (code) => process.exit(code ?? 0));
    });
}
