#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

program
  .name('bmad-swarm')
  .description('Generate autonomous development swarm configurations for Claude Code Agent Teams')
  .version(pkg.version)
  .addHelpText('after', `
Getting started:
  $ bmad-swarm init          Create swarm.yaml and generate agents
  $ bmad-swarm status        Check project configuration
  $ bmad-swarm update        Regenerate managed files after editing swarm.yaml

Learn more: https://github.com/bmad-sim/bmad-swarm
`);

// Import and register commands
const { registerInitCommand } = await import('../cli/init.js');
const { registerUpdateCommand } = await import('../cli/update.js');
const { registerEjectCommand } = await import('../cli/eject.js');
const { registerUnejectCommand } = await import('../cli/uneject.js');
const { registerScanCommand } = await import('../cli/scan.js');
const { registerStatusCommand } = await import('../cli/status.js');

const { registerValidateCommand } = await import('../cli/validate.js');
const { registerDoctorCommand } = await import('../cli/doctor.js');

registerInitCommand(program);
registerUpdateCommand(program);
registerEjectCommand(program);
registerUnejectCommand(program);
registerScanCommand(program);
registerStatusCommand(program);
registerValidateCommand(program);
registerDoctorCommand(program);

const { registerPhaseCommand } = await import('../cli/phase.js');
registerPhaseCommand(program);

program.parse();
