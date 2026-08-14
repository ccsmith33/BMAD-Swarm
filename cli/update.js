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
import { collectEarnedLessons, renderEarnedRulesReview } from '../utils/earned-rules.js';
import { generateCommands } from '../generators/commands-generator.js';
import { generateWorkflows } from '../generators/workflows-generator.js';
import { migrateProjectYamlToBrain } from '../utils/phase-machine.js';
import { generateVersionStamp } from '../generators/version-stamp-generator.js';

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
    .option('--swap-live-hooks', 'Regenerate .claude/hooks/ + settings.json even while a live session is active (hot-swaps the running enforcement — off by default)')
    .option('--skip-earned-rules', 'Do not compile promoted cross-project lessons into the scaffold')
    .addHelpText('after', `
Examples:
  $ bmad-swarm update              Regenerate all managed files
  $ bmad-swarm update --dry-run    See what would change without writing
  $ bmad-swarm update --force      Overwrite even if files were manually edited

Safe to run repeatedly. Never touches user-owned files:
  swarm.yaml, overrides/, artifacts/, src/
Ejected agents (in overrides/agents/) are preserved and used as-is.
Files with manual edits are skipped unless --force is used.

While a live session is active (.claude/hooks/.session-active present), update
SKIPS regenerating .claude/hooks/ and settings.json so it cannot hot-swap the
enforcement the running session relies on. Pass --swap-live-hooks to override
(--force does NOT override this — it is a different consent).
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

  // Live-swap guard (ADR-017 Amendment 1 §3.5): regenerating .claude/hooks/ +
  // settings.json UNDER a running orchestrator session hot-swaps the gate that
  // session relies on — that wedged the 2026-08-13 merge. While the
  // .session-active marker exists, skip those two regen steps. --swap-live-hooks
  // restores the old behavior explicitly; --force does NOT override it (it means
  // "overwrite manual edits", a different consent). A stale marker left by a
  // crash makes this warn spuriously — the warning names the marker path so the
  // human can delete it (doctor already knows the marker; no new machinery).
  const sessionMarker = join(paths.hooksDir, '.session-active');
  const skipLiveHooks = existsSync(sessionMarker) && !options.swapLiveHooks;

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
  if (skipLiveHooks) {
    console.log('  ! Skipped .claude/hooks/: a live session is active (.claude/hooks/.session-active).');
    console.log('    Re-run after the session ends, or pass --swap-live-hooks to override.');
    console.log('    (If the session already ended, delete .claude/hooks/.session-active.)');
  } else if (options.dryRun) {
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
    // Even in dry-run, show which earned rules WOULD compile (K-2 review).
    const preview = collectEarnedLessons(config, paths, { skipEarnedRules: !!options.skipEarnedRules });
    const previewReview = renderEarnedRulesReview(preview, 'update');
    if (previewReview) console.log(previewReview);
  } else {
    const rulesResult = generateRules(config, paths, { ...genOptions, skipEarnedRules: !!options.skipEarnedRules });
    console.log(`  \u2713 Regenerated .claude/rules/ (${rulesResult.generated.length} rules)`);
    if (rulesResult.modified.length > 0) {
      console.log(`    Skipped (manually modified): ${rulesResult.modified.join(', ')}`);
      console.log(`    Use --force to overwrite.`);
    }
    // Born-immune human review (K-2 compensating control).
    const earnedReview = renderEarnedRulesReview(rulesResult.earnedLessons, 'update');
    if (earnedReview) console.log(earnedReview);
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

  // 4.2. Machine-state migration (D-037 / WS-11): fold a legacy project.yaml's
  // `phase` into the brain frontmatter, then delete project.yaml. Idempotent.
  //
  // This migrates a USER-OWNED file, NOT a generated hook/settings artifact, so
  // it MUST run even when the live-swap guard skips steps 3 (hooks) + 5
  // (settings.json) under an active session — it is deliberately OUTSIDE that
  // guarded region. Placed between 4.1 and 4.5, disjoint from the guard.
  if (options.dryRun) {
    if (existsSync(join(projectRoot, 'project.yaml'))) {
      console.log('  Would migrate project.yaml phase into the project-brain frontmatter and delete project.yaml (D-037)');
    }
  } else {
    const migration = migrateProjectYamlToBrain(projectRoot, paths.brainPath);
    if (migration.migrated) {
      console.log(`  ✓ Migrated project.yaml → project-brain.md frontmatter (phase: ${migration.phase}) and removed project.yaml (D-037 / WS-11)`);
      if (migration.createdBrain) {
        console.log('    Created a minimal artifacts/context/project-brain.md to hold the machine state — the orchestrator will flesh it out on next session.');
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

  // 4.6. Regenerate named workflows (the regime router's deterministic tier).
  // These are inert files until the orchestrator invokes them by name, so they
  // ship uniformly (no live-session guard, unlike hooks/settings).
  if (options.dryRun) {
    console.log('  Would regenerate .claude/workflows/');
  } else {
    const workflowResult = generateWorkflows(config, paths, genOptions);
    console.log(`  ✓ Regenerated .claude/workflows/ (${workflowResult.generated.length} workflows)`);
    if (workflowResult.modified.length > 0) {
      console.log(`    Skipped (manually modified): ${workflowResult.modified.join(', ')}`);
      console.log(`    Use --force to overwrite.`);
    }
  }

  // 5. Regenerate settings.json
  if (skipLiveHooks) {
    console.log('  ! Skipped .claude/settings.json: a live session is active (.claude/hooks/.session-active).');
    console.log('    Re-run after the session ends, or pass --swap-live-hooks to override.');
  } else if (options.dryRun) {
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

  // 5.5. Advance the scaffold version stamp (auto-heal, F-29/F-30). Advance it
  // ONLY after a FULL generation: if the live-swap guard deferred hooks/settings
  // (skipLiveHooks), the on-disk scaffold is NOT fully current, so leaving the
  // stamp behind keeps drift detectable until a between-sessions `update`
  // completes the regeneration. This is the one write that makes the fresh-
  // SessionStart drift check go quiet once the scaffold is actually current.
  if (options.dryRun) {
    console.log('  Would write scaffold version stamp (.claude/.bmad-version.json)');
  } else if (skipLiveHooks) {
    console.log('  ! Skipped version stamp: hooks/settings were deferred (live session), so the');
    console.log('    scaffold is not fully current. Re-run update after the session ends to stamp it.');
  } else {
    const stampResult = generateVersionStamp(config, paths);
    console.log(`  ✓ Stamped scaffold version (.claude/.bmad-version.json @ ${stampResult.version})`);
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
