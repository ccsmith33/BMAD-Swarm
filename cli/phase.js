import { getProjectPaths } from '../utils/paths.js';
import { getCurrentPhase, getAvailableTransitions, advancePhase, setPhase, PHASE_ORDER } from '../utils/phase-machine.js';

export function registerPhaseCommand(program) {
  const phase = program
    .command('phase')
    .description('Manage project phase transitions');

  phase
    .command('show')
    .description('Display current phase and available transitions')
    .action(() => {
      try {
        const paths = getProjectPaths(process.cwd());
        const { phase, history } = getCurrentPhase(paths.projectYaml);
        const transitions = getAvailableTransitions(phase);
        console.log(`\nCurrent phase: ${phase}`);
        if (transitions.length > 0) {
          console.log(`Next phase: ${transitions[0]}`);
        } else {
          console.log('No further transitions available.');
        }
        if (history.length > 0) {
          console.log('\nPhase history:');
          for (const entry of history) {
            const exit = entry.exited_at ? ` → ${entry.exited_at}` : ' (current)';
            console.log(`  ${entry.phase}: ${entry.entered_at}${exit}`);
          }
        }
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  phase
    .command('advance')
    .description('Advance to the next phase')
    .action(() => {
      try {
        const paths = getProjectPaths(process.cwd());
        const result = advancePhase(paths.projectYaml);
        console.log(`Phase advanced: ${result.from} → ${result.to}`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  phase
    .command('set <name>')
    .description('Manually set the current phase')
    .option('--force', 'Bypass validation')
    .action((name, options) => {
      try {
        const paths = getProjectPaths(process.cwd());
        const result = setPhase(paths.projectYaml, name, { force: options.force });
        console.log(`Phase set: ${result.from} → ${result.to}`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}
