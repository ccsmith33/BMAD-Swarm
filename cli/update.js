import { resolve, join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readFileSafe, updateGitignore } from '../utils/fs-helpers.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { generateAgents } from '../generators/agent-generator.js';
import { generateMethodology } from '../generators/methodology-generator.js';
import { generateBin } from '../generators/bin-generator.js';
import { generateClaudeMd } from '../generators/claude-md-generator.js';
import { generateHooks } from '../generators/hooks-generator.js';
import { generateSettings } from '../generators/settings-generator.js';
import { generateRules } from '../generators/rules-generator.js';
import { generateCommands } from '../generators/commands-generator.js';

/**
 * Register the update command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerUpdateCommand(program) {
  program
    .command('update')
    .description('Regenerate all managed files (.claude/agents, CLAUDE.md, hooks, settings) from swarm.yaml')
    .option('--dry-run', 'Preview what would be regenerated without writing any files')
    .option('--force', 'Overwrite files even if they have been manually modified')
    .addHelpText('after', `
Examples:
  $ bmad-swarm update              Regenerate all managed files
  $ bmad-swarm update --dry-run    See what would change without writing
  $ bmad-swarm update --force      Overwrite even if files were manually edited

Safe to run repeatedly. Never touches user-owned files:
  swarm.yaml, overrides/, artifacts/, src/
Ejected agents (in overrides/agents/) are preserved and used as-is.
Files with manual edits are skipped unless --force is used.
`)
    .action(async (options) => {
      try {
        await runUpdate(options);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Run the update command.
 * Safe: never touches swarm.yaml, overrides/, artifacts/, or src/.
 * @param {object} options - Command options
 */
async function runUpdate(options) {
  const projectRoot = process.cwd();
  const paths = getProjectPaths(projectRoot);

  if (!existsSync(paths.swarmYaml)) {
    console.error('No swarm.yaml found. Run `bmad-swarm init` first.');
    process.exit(1);
  }

  const config = loadSwarmConfig(paths.swarmYaml);
  const genOptions = { force: !!options.force };

  if (options.dryRun) {
    console.log('Dry run - showing what would be regenerated:\n');
  }

  console.log('Regenerating from package + swarm.yaml...');

  // 1. Regenerate agents
  if (options.dryRun) {
    console.log('  Would regenerate .claude/agents/');
  } else {
    const agentResult = generateAgents(config, paths, genOptions);
    console.log(`  \u2713 Regenerated .claude/agents/ (${agentResult.generated.length} generated, ${agentResult.skipped.length} ejected)`);
    if (agentResult.skipped.length > 0) {
      console.log(`    Ejected (using local override): ${agentResult.skipped.join(', ')}`);
    }
    if (agentResult.modified.length > 0) {
      console.log(`    Skipped (manually modified): ${agentResult.modified.join(', ')}`);
      console.log(`    Use --force to overwrite, or 'bmad-swarm eject agent <name>' to keep your changes.`);
    }
  }

  // 1.5. Ship / migrate the methodology subset into .claude/bmad/methodology/.
  // On a pre-Phase-1 project all files are new (clean generation); user-edited
  // shipped files are skipped like any other generated file (CB-1, §3.4).
  let methodologyMigrated = false;
  if (options.dryRun) {
    console.log('  Would regenerate .claude/bmad/methodology/');
  } else {
    const existedBefore = existsSync(paths.bmadMethodologyDir);
    const methodologyResult = generateMethodology(config, paths, genOptions);
    console.log(`  ✓ Regenerated .claude/bmad/methodology/ (${methodologyResult.generated.length} files)`);
    if (methodologyResult.modified.length > 0) {
      console.log(`    Skipped (manually modified): ${methodologyResult.modified.join(', ')}`);
      console.log(`    Use --force to overwrite.`);
    }
    methodologyMigrated = !existedBefore && methodologyResult.generated.length > 0;
  }

  // 1.6. Reship the pinned serialized-write CLI into .claude/bmad/bin/ (ADR-021).
  if (options.dryRun) {
    console.log('  Would regenerate .claude/bmad/bin/');
  } else {
    const binResult = generateBin(config, paths, genOptions);
    console.log(`  ✓ Regenerated .claude/bmad/bin/ (${binResult.generated.length} script)`);
    if (binResult.skipped.length > 0) {
      console.log(`    Skipped (manually modified): ${binResult.skipped.length} script(s)`);
      console.log(`    Use --force to overwrite.`);
    }
  }

  // 2. Regenerate CLAUDE.md
  if (options.dryRun) {
    console.log('  Would regenerate CLAUDE.md');
  } else {
    const claudeResult = generateClaudeMd(config, paths, genOptions);
    if (claudeResult.modified) {
      console.log('  ! Skipped CLAUDE.md (manually modified)');
      console.log('    Use --force to overwrite.');
    } else {
      console.log('  \u2713 Regenerated CLAUDE.md');
    }
  }

  // 3. Regenerate hooks
  if (options.dryRun) {
    console.log('  Would regenerate .claude/hooks/');
  } else {
    const hookResult = generateHooks(config, paths, genOptions);
    console.log(`  \u2713 Regenerated .claude/hooks/ (${hookResult.generated.length} hooks)`);
    if (hookResult.skipped.length > 0) {
      console.log(`    Skipped (manually modified): ${hookResult.skipped.length} hook(s)`);
      console.log(`    Use --force to overwrite.`);
    }
  }

  // 4. Regenerate rules
  if (options.dryRun) {
    console.log('  Would regenerate .claude/rules/');
  } else {
    const rulesResult = generateRules(config, paths, genOptions);
    console.log(`  \u2713 Regenerated .claude/rules/ (${rulesResult.generated.length} rules)`);
    if (rulesResult.modified.length > 0) {
      console.log(`    Skipped (manually modified): ${rulesResult.modified.join(', ')}`);
      console.log(`    Use --force to overwrite.`);
    }
  }

  // 4.1. Clean up stale generated files from older versions
  if (!options.dryRun) {
    // Rule files moved to agent file in v1.3
    const staleRules = ['orchestrator-identity.md', 'orchestrator-methodology.md'];
    for (const name of staleRules) {
      const rulePath = join(paths.rulesDir, name);
      if (!existsSync(rulePath)) continue;
      const content = readFileSafe(rulePath);
      if (content && /^<!-- bmad-generated:[a-f0-9]+ -->/.test(content)) {
        unlinkSync(rulePath);
        console.log(`  \u2713 Removed stale .claude/rules/${name}`);
      }
    }
    // Enforcement hooks removed in v1.4
    const staleHooks = ['orchestrator-post-tool.cjs', 'orchestrator-stop.cjs'];
    for (const name of staleHooks) {
      const hookPath = join(paths.hooksDir, name);
      if (!existsSync(hookPath)) continue;
      const content = readFileSafe(hookPath);
      if (content && /^\/\/ bmad-generated:[a-f0-9]+/.test(content.split('\n')[1])) {
        unlinkSync(hookPath);
        console.log(`  \u2713 Removed stale .claude/hooks/${name}`);
      }
    }
    // Agents removed in Option C restructure (v2.0)
    const staleAgents = ['qa.md', 'story-engineer.md', 'retrospective.md', 'tech-writer.md'];
    for (const name of staleAgents) {
      const p = join(paths.agentsDir, name);
      if (!existsSync(p)) continue;
      const content = readFileSafe(p);
      if (content && /^<!-- bmad-generated:[a-f0-9]+ -->/.test(content)) {
        unlinkSync(p);
        console.log(`  \u2713 Removed stale .claude/agents/${name}`);
      }
    }
    // Hooks removed in Option C restructure (v2.0)
    const staleHooksOptionC = ['task-tool-warning.cjs', 'TeammateIdle.cjs', 'identity-reinject.cjs'];
    for (const name of staleHooksOptionC) {
      const p = join(paths.hooksDir, name);
      if (!existsSync(p)) continue;
      const content = readFileSafe(p);
      const secondLine = content ? content.split('\n')[1] : '';
      if (content && /^\/\/ bmad-generated:[a-f0-9]+/.test(secondLine || '')) {
        unlinkSync(p);
        console.log(`  \u2713 Removed stale .claude/hooks/${name}`);
      }
    }
    // Gate re-anchored from the removed TeamCreate tool to PreToolUse:Agent
    // (ADR-015); the old hook file never fires and misleads readers.
    const staleHooksAdr015 = ['teamcreate-gate.cjs'];
    for (const name of staleHooksAdr015) {
      const p = join(paths.hooksDir, name);
      if (!existsSync(p)) continue;
      const content = readFileSafe(p);
      const secondLine = content ? content.split('\n')[1] : '';
      if (content && /^\/\/ bmad-generated:[a-f0-9]+/.test(secondLine || '')) {
        unlinkSync(p);
        console.log(`  ✓ Removed stale .claude/hooks/${name}`);
      }
    }
    // System prompt file removed in Option C restructure (v2.0)
    if (existsSync(paths.systemPrompt)) {
      const content = readFileSafe(paths.systemPrompt);
      if (content && /^<!-- bmad-generated:[a-f0-9]+ -->/.test(content)) {
        unlinkSync(paths.systemPrompt);
        console.log(`  \u2713 Removed stale .claude/system-prompt.txt`);
      }
    }
  }

  // 4.5. Regenerate slash commands
  if (options.dryRun) {
    console.log('  Would regenerate .claude/commands/');
  } else {
    const commandResult = generateCommands(config, paths, genOptions);
    console.log(`  \u2713 Regenerated .claude/commands/ (${commandResult.generated.length} commands)`);
    if (commandResult.modified.length > 0) {
      console.log(`    Skipped (manually modified): ${commandResult.modified.join(', ')}`);
    }
  }

  // 5. Regenerate settings.json
  if (options.dryRun) {
    console.log('  Would regenerate .claude/settings.json');
  } else {
    const settingsResult = generateSettings(config, paths, genOptions);
    if (settingsResult.modified) {
      console.log('  ! Skipped .claude/settings.json (manually modified)');
      console.log('    Use --force to overwrite.');
    } else {
      console.log('  \u2713 Regenerated .claude/settings.json');
    }
  }

  // Ensure .gitignore stays current
  let gitignoreResult = { changed: false, droppedCustom: [] };
  if (!options.dryRun) {
    gitignoreResult = updateGitignore(projectRoot);
  }

  // Sharing-model migration notice (D-042): first time the methodology subset
  // is shipped into a pre-Phase-1 project, tell the user the scaffold and its
  // config are now git-tracked and should be reviewed/committed.
  if (!options.dryRun && methodologyMigrated) {
    console.log('\n  Sharing model updated: `.claude/`, `artifacts/`, `swarm.yaml`, and `CLAUDE.md` are now git-tracked.');
    console.log('  Review `git status` and commit the scaffold to share it with your team.');
    console.log('  The bmad-managed `.gitignore` section was replaced with a minimal ignore set.');
  }

  // L1: the wholesale replace drops any custom ignores a user had added INSIDE
  // the bmad-managed block. Warn explicitly and list them (git-recoverable) so
  // they can be re-added ABOVE the marker to persist across future updates.
  if (!options.dryRun && gitignoreResult.droppedCustom.length > 0) {
    console.log(`\n  ! Removed ${gitignoreResult.droppedCustom.length} custom ignore(s) from inside the bmad-managed \`.gitignore\` section:`);
    for (const entry of gitignoreResult.droppedCustom) {
      console.log(`      ${entry}`);
    }
    console.log('    That section is now bmad-managed and gets replaced on every update. To keep these,');
    console.log('    re-add them ABOVE the `# bmad-swarm (generated files)` marker (recoverable via git).');
  }

  // Post-install probe: verify the orchestrator-write-gate accepts subagent
  // payload fields as the identity signal (HARN-1 regression guard).
  // Fires a synthetic hook event; warns if the hook denies when it shouldn't.
  // See ADR-003 §4.5 (residual risk: field-name drift under experimental flag).
  if (!options.dryRun) {
    probeOrchestratorWriteGate(paths);
  }

  console.log('\nUpdate complete. User-owned files (swarm.yaml, overrides/, artifacts/) were not touched.');
}

/**
 * Post-install probe for the orchestrator-write-gate.
 * Spawns the generated hook with a synthetic subagent payload and checks that
 * it passes through. If the hook denies, the identity check is miswired and
 * delegated work will be blocked.
 *
 * This guards against Claude Code hook-payload field-name drift under the
 * experimental agent-teams flag: the hook's two-layer check depends on
 * `event.agent_id`/`event.agent_type` being populated on subagent calls. A
 * silent rename would regress HARN-1 at runtime; this probe catches it at
 * install time instead.
 *
 * @param {object} paths - project paths from getProjectPaths()
 */
function probeOrchestratorWriteGate(paths) {
  const hookPath = join(paths.hooksDir, 'orchestrator-write-gate.cjs');
  if (!existsSync(hookPath)) return;
  const syntheticEvent = {
    tool_input: { file_path: 'src/probe-target.js' },
    agent_id: 'probe-subagent-id',
    agent_type: 'developer',
  };
  const result = spawnSync('node', [hookPath], {
    input: JSON.stringify(syntheticEvent),
    encoding: 'utf8',
    env: { ...process.env, AGENT_ROLE: 'orchestrator' },
    timeout: 5000,
  });
  const denied = result.stdout && result.stdout.trim().length > 0;
  if (denied) {
    console.log('  ! orchestrator-write-gate probe: hook DENIED a synthetic subagent call.');
    console.log('    This means the hook\'s identity check is not recognizing agent_id/agent_type.');
    console.log('    Expected cause: Claude Code payload field-name drift (see ADR-003 §4.5).');
    console.log('    Impact: all teammate Edits will be blocked by the gate (HARN-1 regression).');
    console.log('    Workaround: set `.claude/settings.local.json` env AGENT_ROLE="" to disable the gate.');
  }
}
