import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { getProjectPaths } from '../utils/paths.js';
import { splitFrontmatter } from '../utils/project-brain.js';
import { missionControlMarkdown } from '../utils/mission-control.js';
import { readActiveCharter, computeRunway, formatDuration } from '../utils/runway.js';

/**
 * Register the status command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerStatusCommand(program) {
  program
    .command('status')
    .description('Show project configuration, current phase, agent status, and artifact counts')
    .option('--full', 'Render the read-only Mission Control surface (awaiting-human, running/stuck, decisions/recommendations, spend estimate)')
    .addHelpText('after', `
Examples:
  $ bmad-swarm status         Display project name, type, stack, autonomy level,
                              current phase, agent list (with ejected markers),
                              and artifact file counts per directory
  $ bmad-swarm status --full  Render the Mission Control control surface: the
                              awaiting-human queue, running/stuck tasks, recent
                              decisions + open recommendations, and a spend
                              estimate — read-only, generated from the ledgers
`)
    .action(async (opts) => {
      try {
        if (opts.full) {
          await runMissionControl();
        } else {
          await runStatus();
        }
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Render the Mission Control surface (read-only, D-041). Prints the four action
 * panels generated purely from the durable stores — no live TaskList is passed,
 * so running/stuck is ledger-recency-classified (see utils/mission-control.js).
 */
async function runMissionControl() {
  const projectRoot = process.cwd();
  const paths = getProjectPaths(projectRoot);
  if (!existsSync(paths.swarmYaml)) {
    console.log('Not a BMAD Swarm project. Run `bmad-swarm init` first.');
    return;
  }
  process.stdout.write(missionControlMarkdown(projectRoot) + '\n');
}

/**
 * Render the live NIGHT PANEL (Phase 5 Stream GM, §3.3 item 5) for `status`.
 * Pure and read-only: given a parsed charter (utils/runway.readActiveCharter) and
 * the current time, it returns the panel lines — the active charter's scope, the
 * runway remaining + reserved dawn slice (computeRunway from ends_epoch_ms), and
 * the floor status. Returns '' when no charter is open, so `status` is unchanged
 * on a normal day.
 *
 * Floor status honors the H5-2(d) grace window: after the clock expires the floor
 * PERSISTS until the human-wake marker OR ends+grace, whichever is first. A
 * charter whose clock is unreadable is shown FAIL-CLOSED (the schema's stance).
 *
 * @param {object|null} charter - parseCharter() result, or null.
 * @param {object} [opts] - { now?: number|Date }
 * @returns {string} the panel text (may be multi-line), or '' when no night is open.
 */
export function renderNightPanel(charter, opts = {}) {
  if (!charter) return '';
  const now = opts.now != null ? (opts.now instanceof Date ? opts.now.getTime() : opts.now) : Date.now();

  const lines = [];
  lines.push('\n  Night charter: ACTIVE');
  lines.push(`    Initiative: ${charter.initiative || 'unrestrained'}`);
  const queue = Array.isArray(charter.queue) && charter.queue.length ? charter.queue.join(', ') : '(none)';
  lines.push(`    Queue: ${queue}`);

  const r = computeRunway({ endsMs: charter.endsMs, startMs: charter.startMs, now });
  if (!r.valid) {
    // Unparseable clock — the schema's fail-closed stance (the floor hook keeps
    // the destructive set denied; here we surface it honestly).
    lines.push('    Runway: unknown (charter clock unreadable)');
    lines.push('    Floor: FAIL-CLOSED — destructive set stays denied (D-034)');
    return lines.join('\n');
  }

  if (!r.expired) {
    lines.push(`    Runway: ${formatDuration(r.totalRemainingMs)} remaining (work ${formatDuration(r.workRemainingMs)} · dawn slice ${formatDuration(r.dawnSliceMs)})`);
    lines.push(`    Floor: active${r.inDawnSlice ? ' (dawn slice — writing the morning report)' : ''} — destructive actions denied (D-034)`);
  } else {
    const graceEndMs = r.endsMs + (Number.isFinite(charter.graceMs) ? charter.graceMs : 0);
    if (now < graceEndMs) {
      lines.push('    Runway: expired (the clock has passed)');
      lines.push(`    Floor: active (grace) — persists ${formatDuration(graceEndMs - now)} until a human wake or grace end (H5-2d)`);
    } else {
      lines.push('    Runway: expired (clock + grace elapsed)');
      lines.push('    Floor: lifted — morning merges are human-gated by posture (D-050)');
    }
  }
  return lines.join('\n');
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

  // Night panel (Phase 5 Stream GM, §3.3 item 5) — shown only when a night
  // charter is open; a normal day prints nothing extra here.
  const nightPanel = renderNightPanel(readActiveCharter(projectRoot));
  if (nightPanel) console.log(nightPanel);

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
