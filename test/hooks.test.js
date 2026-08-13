import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

// Resolve the nearest ANCESTOR node_modules that exists, starting at startDir
// and walking up to the filesystem root. Returns null if none is found. Used
// to keep the spawned-hook harness hermetic in worktree checkouts that were
// never `npm ci`'d (no node_modules of their own) — a nested worktree resolves
// up to the main repo's node_modules.
function nearestNodeModules(startDir) {
  let dir = startDir;
  while (dir) {
    const candidate = join(dir, 'node_modules');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
import { generateHooks } from '../generators/hooks-generator.js';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';

// Process-spawn tests for bmad-swarm hooks.
// Each test spawns the hook as a child process, pipes a synthetic event as
// stdin JSON, and asserts the stdout permissionDecision / additionalContext
// contract — the same contract Claude Code uses at runtime.

describe('Hooks (process-spawn contract)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'bmad-hooks-test-'));
  let hooksDir;

  before(() => {
    // Generate fresh hooks into a test project so every test runs against
    // the generator output, not the repo-committed copy.
    const projectDir = join(tmpDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const configPath = join(projectDir, 'swarm.yaml');
    writeFileSync(configPath, 'project:\n  name: hooks-test\n');
    const config = loadSwarmConfig(configPath);
    const paths = getProjectPaths(projectDir);
    generateHooks(config, paths);
    hooksDir = paths.hooksDir;
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // cwd defaults to the bare tmpDir so cwd-relative reads (swarm.yaml,
  // artifacts/context/team-assembly-log.md) never leak in from the real
  // repo checkout the tests happen to run in.
  function runHook(hookName, { stdin = '{}', env = {}, cwd = tmpDir } = {}) {
    const hookPath = join(hooksDir, hookName);
    const result = spawnSync('node', [hookPath], {
      input: stdin,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      cwd,
    });
    let decision = null;
    if (result.stdout && result.stdout.trim()) {
      try { decision = JSON.parse(result.stdout); } catch {}
    }
    return { ...result, decision };
  }

  const validAssemblyBlock = [
    '```bmad-assembly',
    'entry_point: bug-fix',
    'complexity: 6',
    'autonomy: auto',
    'team:',
    '  - role: developer',
    'rationale: test fix',
    '```',
  ].join('\n');

  // -----------------------------------------------------------------------
  describe('team-assembly-lint.cjs', () => {
    // ADR-015: the lint anchors on PreToolUse:Agent (TeamCreate no longer
    // exists) and only fires for orchestrator main-thread spawns of bmad
    // team roles (.claude/agents/<type>.md exists). The
    // artifacts/context/team-assembly-log.md handshake is the SOLE Pass 1
    // channel. The transcript is never read (transcript_path in the event is
    // ignored). Pass 1 anchors on the LAST ```bmad-assembly fence in the
    // whole file (no byte window — F-009) and requires the file mtime to be
    // fresh (< 15 minutes, and not in the future beyond skew tolerance —
    // F-022). Missing/stale/incomplete declaration = deny with an actionable
    // message; fail-open is reserved for environmental errors (unparseable
    // stdin, unreadable swarm.yaml, missing js-yaml).

    // The canonical team spawn: orchestrator main thread (no agent_id /
    // agent_type) spawning a bmad team role via subagent_type.
    const SPAWN_STDIN = JSON.stringify({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'developer', name: 'dev-1', prompt: 'implement the story' },
    });

    function makeProject(swarmYamlContents) {
      const projectDir = join(tmpDir, 'gate-' + Math.random().toString(36).slice(2));
      mkdirSync(projectDir, { recursive: true });
      if (swarmYamlContents !== null) {
        writeFileSync(join(projectDir, 'swarm.yaml'), swarmYamlContents);
      }
      // A bmad role definition makes spawns of subagent_type "developer"
      // count as team spawns for the lint.
      mkdirSync(join(projectDir, '.claude', 'agents'), { recursive: true });
      writeFileSync(join(projectDir, '.claude', 'agents', 'developer.md'),
        '---\nname: developer\n---\n# Developer\n');
      return projectDir;
    }

    function runHookInCwd(hookName, { stdin = '{}', env = {}, cwd } = {}) {
      const hookPath = join(hooksDir, hookName);
      // The generated hooks are node-only (team-assembly-lint no longer needs
      // js-yaml — it parses with built-ins), so this NODE_PATH is not required
      // for the current hooks. It is kept HERMETIC-ROBUST for any future hook
      // that does load a bmad-swarm dependency: point NODE_PATH at the nearest
      // ANCESTOR node_modules that actually exists rather than pinning to the
      // checkout's own node_modules. A worktree run WITHOUT `npm ci` has no
      // node_modules of its own; walking ancestors finds the repo's (a nested
      // .claude/worktrees checkout resolves up to the main repo), so the spawn
      // is hermetic instead of false-failing. If none is found we omit
      // NODE_PATH entirely (never point it at a non-existent dir).
      const nodeModules = nearestNodeModules(import.meta.dirname || cwd || process.cwd());
      const childEnv = { ...process.env, ...env };
      if (nodeModules) childEnv.NODE_PATH = nodeModules;
      const result = spawnSync('node', [hookPath], {
        input: stdin,
        encoding: 'utf8',
        env: childEnv,
        cwd,
      });
      let decision = null;
      if (result.stdout && result.stdout.trim()) {
        try { decision = JSON.parse(result.stdout); } catch {}
      }
      return { ...result, decision };
    }

    function writeAssemblyLog(projectDir, contents, { ageMinutes = 0 } = {}) {
      const contextDir = join(projectDir, 'artifacts', 'context');
      mkdirSync(contextDir, { recursive: true });
      const logPath = join(contextDir, 'team-assembly-log.md');
      writeFileSync(logPath, contents);
      if (ageMinutes !== 0) {
        // Negative ageMinutes = mtime in the future (F-022 fixture).
        const ts = new Date(Date.now() - ageMinutes * 60 * 1000);
        utimesSync(logPath, ts, ts);
      }
      return logPath;
    }

    function assemblyBlockFor(teamYaml) {
      return [
        '```bmad-assembly',
        'entry_point: bug-fix',
        'complexity: 6',
        'autonomy: auto',
        'team:',
        teamYaml,
        'rationale: test routing',
        '```',
      ].join('\n');
    }

    // -------------------------------------------------------------------
    // Pass 1 (ADR-013): handshake file is the sole channel.
    // -------------------------------------------------------------------

    it('accepts when a fresh log holds a valid block', () => {
      const projectDir = makeProject('project:\n  name: gate-accept\n');
      writeAssemblyLog(projectDir, '## 2026-06-09 — bug fix\n\n' + validAssemblyBlock + '\n');
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null, 'fresh log with valid block → accept (no deny JSON)');
      assert.equal(result.status, 0);
    });

    it('denies when the log file is missing, with the append instruction', () => {
      const projectDir = makeProject('project:\n  name: gate-missing\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      const reason = decision.hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /append a fenced bmad-assembly block/,
        'deny must tell the orchestrator the corrective action');
      assert.match(reason, /artifacts\/context\/team-assembly-log\.md/,
        'deny must name the handshake file');
      assert.match(reason, /entry_point, complexity, autonomy, team, rationale/,
        'deny must list the required keys');
    });

    it('denies when the log is stale (mtime >= 15 minutes)', () => {
      const projectDir = makeProject('project:\n  name: gate-stale\n');
      writeAssemblyLog(projectDir, validAssemblyBlock + '\n', { ageMinutes: 16 });
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'stale handshake must not satisfy the gate');
      const reason = decision.hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /stale/);
      assert.match(reason, /append a fenced bmad-assembly block/);
    });

    it('denies when the fresh log block is missing required keys, naming only the missing ones', () => {
      const projectDir = makeProject('project:\n  name: gate-keys\n');
      const partialBlock = [
        '```bmad-assembly',
        'entry_point: bug-fix',
        'complexity: 6',
        'autonomy: auto',
        'team:',
        '  - role: developer',
        '```',
      ].join('\n');
      writeAssemblyLog(projectDir, partialBlock + '\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      const reason = decision.hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /Missing: rationale\b/,
        'the missing-keys list should contain rationale');
      assert.ok(!/Missing:[^—]*entry_point/.test(reason),
        'the missing-keys list should NOT contain the 4 present keys');
      assert.match(reason, /append a fenced bmad-assembly block/);
    });

    it('denies when the fresh log contains no fenced block at all', () => {
      const projectDir = makeProject('project:\n  name: gate-nofence\n');
      writeAssemblyLog(projectDir, '## just prose\n\nno fence here\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      assert.match(decision.hookSpecificOutput.permissionDecisionReason,
        /no fenced bmad-assembly block/);
    });

    it('uses the LAST fenced block in the log (earlier incomplete block ignored)', () => {
      const projectDir = makeProject('project:\n  name: gate-last\n');
      const staleIncomplete = [
        '```bmad-assembly',
        'entry_point: bug-fix',
        '```',
      ].join('\n');
      writeAssemblyLog(projectDir, staleIncomplete + '\n\n' + validAssemblyBlock + '\n');
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null,
        'last (most recent) block decides, not the first');
    });

    // F-011: an unclosed fence in the newest append must not let the gate
    // fall back to the previous (stale) complete block.
    it('F-011: denies when the newest block is unclosed, even though an earlier block is valid', () => {
      const projectDir = makeProject('project:\n  name: gate-f011\n');
      const unclosedNewer = [
        '```bmad-assembly',
        'entry_point: bug-fix',
        'complexity: 6',
        'autonomy: auto',
        'team:',
        '  - role: developer',
        '    domain: payments-api',
        'rationale: unterminated append',
      ].join('\n');
      writeAssemblyLog(projectDir, validAssemblyBlock + '\n\n' + unclosedNewer + '\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'the stale previous block must not be accepted in place of the unclosed newest one');
      assert.match(decision.hookSpecificOutput.permissionDecisionReason, /unclosed/,
        'deny must name the missing closing fence');
    });

    it('F-011: denies with the unclosed message when the only block is unclosed', () => {
      const projectDir = makeProject('project:\n  name: gate-f011-only\n');
      writeAssemblyLog(projectDir, '```bmad-assembly\nentry_point: bug-fix\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      assert.match(decision.hookSpecificOutput.permissionDecisionReason, /unclosed/);
    });

    it('denies on the LAST block even when an earlier block is valid (append-only semantics)', () => {
      const projectDir = makeProject('project:\n  name: gate-last-deny\n');
      const incompleteLast = [
        '```bmad-assembly',
        'entry_point: bug-fix',
        '```',
      ].join('\n');
      writeAssemblyLog(projectDir, validAssemblyBlock + '\n\n' + incompleteLast + '\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'an earlier valid block must not rescue an incomplete last block');
    });

    // F-009: the 4KB tail window silently rejected large blocks. The gate now
    // anchors on the last fence in the WHOLE file, so block size and trailing
    // log content no longer matter.
    it('F-009: accepts a valid block larger than 4KB', () => {
      const projectDir = makeProject('project:\n  name: gate-f009-big\n');
      const bigBlock = [
        '```bmad-assembly',
        'entry_point: bug-fix',
        'complexity: 6',
        'autonomy: auto',
        'team:',
        '  - role: developer',
        'rationale: ' + 'x'.repeat(5000),
        '```',
      ].join('\n');
      writeAssemblyLog(projectDir, bigBlock + '\n');
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null,
        'a block whose fence falls outside the old 4KB tail must now be accepted');
      assert.equal(result.status, 0);
    });

    it('F-009: accepts the last valid block even when >4KB of log content follows it', () => {
      const projectDir = makeProject('project:\n  name: gate-f009-tail\n');
      const padding = ('x'.repeat(80) + '\n').repeat(64); // > 4KB after the block
      writeAssemblyLog(projectDir, validAssemblyBlock + '\n\n' + padding);
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null,
        'the last fence is found regardless of how much log follows it');
    });

    it('ignores the transcript entirely: valid block in transcript but no log → deny', () => {
      const projectDir = makeProject('project:\n  name: gate-no-transcript\n');
      const transcriptPath = join(projectDir, 'transcript.jsonl');
      writeFileSync(transcriptPath, JSON.stringify({
        type: 'assistant',
        message: { id: 'msg_1', content: [{ type: 'text', text: validAssemblyBlock }] },
      }) + '\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', {
        stdin: JSON.stringify({
          transcript_path: transcriptPath,
          tool_name: 'Agent',
          tool_input: { subagent_type: 'developer' },
        }),
        cwd: projectDir,
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'the transcript is no longer a channel (ADR-013)');
    });

    it('fails open when stdin is not valid JSON (environmental error)', () => {
      const result = runHook('team-assembly-lint.cjs', { stdin: 'not-json-at-all' });
      assert.equal(result.decision, null);
      assert.equal(result.status, 0);
    });

    // -------------------------------------------------------------------
    // ADR-015 anchor: PreToolUse:Agent, no-op unless the call is an
    // orchestrator main-thread spawn of a bmad team role.
    // -------------------------------------------------------------------

    it('ADR-015: no-ops when subagent_type is absent (generic Agent call), even with no log', () => {
      const projectDir = makeProject('project:\n  name: gate-no-subtype\n');
      const result = runHookInCwd('team-assembly-lint.cjs', {
        stdin: JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: 'search the repo' } }),
        cwd: projectDir,
      });
      assert.equal(result.decision, null, 'non-team spawn must pass without a declaration');
      assert.equal(result.status, 0);
    });

    it('ADR-015: no-ops for subagent-context spawns (agent_id present), even with no log', () => {
      const projectDir = makeProject('project:\n  name: gate-subagent-ctx\n');
      const result = runHookInCwd('team-assembly-lint.cjs', {
        stdin: JSON.stringify({
          agent_id: 'agent-abc123',
          tool_name: 'Agent',
          tool_input: { subagent_type: 'developer' },
        }),
        cwd: projectDir,
      });
      assert.equal(result.decision, null, 'teammates spawning helpers are not team assembly');
    });

    it('ADR-015: no-ops when subagent_type has no .claude/agents definition (built-in type)', () => {
      const projectDir = makeProject('project:\n  name: gate-builtin-type\n');
      const result = runHookInCwd('team-assembly-lint.cjs', {
        stdin: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'Explore' } }),
        cwd: projectDir,
      });
      assert.equal(result.decision, null, 'built-in agent types are not team spawns');
    });

    it('ADR-015: deny messages use Agent-spawn vocabulary, never TeamCreate', () => {
      const projectDir = makeProject('project:\n  name: gate-vocab\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      const reason = decision.hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /retry the Agent spawn/);
      assert.ok(!reason.includes('TeamCreate'), 'dead tool name must not appear in messaging');
      assert.match(reason, /not an authorization boundary/,
        'deny must carry the honest advisory classification (ADR-015 / D-039)');
    });

    // -------------------------------------------------------------------
    // F-022: freshness must be bounded in BOTH directions.
    // -------------------------------------------------------------------

    it('F-022: denies when the log mtime is in the future beyond skew tolerance', () => {
      const projectDir = makeProject('project:\n  name: gate-f022-future\n');
      writeAssemblyLog(projectDir, validAssemblyBlock + '\n', { ageMinutes: -10 });
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'a future-dated log must not count as fresh');
      assert.match(decision.hookSpecificOutput.permissionDecisionReason, /future/);
    });

    it('F-022: accepts a log mtime slightly in the future (within skew tolerance)', () => {
      const projectDir = makeProject('project:\n  name: gate-f022-skew\n');
      writeAssemblyLog(projectDir, validAssemblyBlock + '\n', { ageMinutes: -0.5 });
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null, '30s of clock skew must not trip the lint');
      assert.equal(result.status, 0);
    });

    // -------------------------------------------------------------------
    // Pass 2 (ADR-008, D-009, Story WT-5): fixed-mode routing enforcement,
    // unchanged in logic but now fed exclusively by the handshake block.
    // Each test sets up a per-test temp project dir with a bespoke
    // swarm.yaml + fresh assembly log, then spawns the hook with cwd set to
    // that dir so the CWD-relative reads pick up the fixtures.
    // -------------------------------------------------------------------

    it('AC1: dynamic mode (no team block) is byte-for-byte unchanged — Pass 2 skipped', () => {
      // No team block at all → mode defaults to "dynamic" → Pass 2 must skip.
      // Even an "obviously invalid" specialist entry must still pass.
      const projectDir = makeProject('project:\n  name: dyn-test\n');
      const block = assemblyBlockFor('  - role: developer\n    domain: nonexistent-domain');
      writeAssemblyLog(projectDir, block + '\n');
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null, 'dynamic mode → Pass 2 skipped → exit 0');
      assert.equal(result.status, 0);
    });

    it('AC1: explicit team.mode: dynamic is also unchanged', () => {
      const projectDir = makeProject([
        'project:',
        '  name: dyn-explicit',
        'team:',
        '  mode: dynamic',
        '',
      ].join('\n'));
      const block = assemblyBlockFor('  - role: developer\n    domain: nope');
      writeAssemblyLog(projectDir, block + '\n');
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null);
    });

    it('AC2: fixed mode + matching specialist (developer, backend-auth) passes', () => {
      const projectDir = makeProject([
        'project:',
        '  name: ac2',
        'team:',
        '  mode: fixed',
        '  specializations:',
        '    - role: developer',
        '      domain: backend-auth',
        '      description: backend auth specialist',
        '',
      ].join('\n'));
      const block = assemblyBlockFor('  - role: developer\n    domain: backend-auth');
      writeAssemblyLog(projectDir, block + '\n');
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null, 'matching (role,domain) → pass');
      assert.equal(result.status, 0);
    });

    it('AC3: fixed mode + no-domain developer + fallback enabled passes via fallback', () => {
      const projectDir = makeProject([
        'project:',
        '  name: ac3',
        'team:',
        '  mode: fixed',
        '  specializations:',
        '    - role: developer',
        '      domain: backend-auth',
        '  fallback:',
        '    enabled: true',
        '    role: developer',
        '',
      ].join('\n'));
      const block = assemblyBlockFor('  - role: developer');
      writeAssemblyLog(projectDir, block + '\n');
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null, 'no-domain dev with fallback enabled → pass');
    });

    it('AC4: fixed mode + no-domain developer + fallback disabled denies with documented reason', () => {
      const projectDir = makeProject([
        'project:',
        '  name: ac4',
        'team:',
        '  mode: fixed',
        '  specializations:',
        '    - role: developer',
        '      domain: backend-auth',
        '  fallback:',
        '    enabled: false',
        '',
      ].join('\n'));
      const block = assemblyBlockFor('  - role: developer');
      writeAssemblyLog(projectDir, block + '\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      const reason = decision.hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /team mode is "fixed"/);
      assert.match(reason, /does not match any declared specialist/);
      assert.match(reason, /set team\.fallback\.enabled: true/);
    });

    it('AC5: fixed mode + specialist whose domain is not declared denies, naming the bad pair', () => {
      const projectDir = makeProject([
        'project:',
        '  name: ac5',
        'team:',
        '  mode: fixed',
        '  specializations:',
        '    - role: developer',
        '      domain: backend-auth',
        '  fallback:',
        '    enabled: true',
        '',
      ].join('\n'));
      const block = assemblyBlockFor('  - role: developer\n    domain: frontend-dashboard');
      writeAssemblyLog(projectDir, block + '\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      const reason = decision.hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /developer domain=frontend-dashboard/);
    });

    it('AC6: fixed mode + non-specialized roles (architect, security, devops, etc.) always pass', () => {
      const projectDir = makeProject([
        'project:',
        '  name: ac6',
        'team:',
        '  mode: fixed',
        '  specializations:',
        '    - role: developer',
        '      domain: backend-auth',
        '  fallback:',
        '    enabled: false',  // disabled to ensure non-specialized roles aren't accepted via fallback
        '',
      ].join('\n'));
      const block = assemblyBlockFor([
        '  - role: architect',
        '  - role: security',
        '  - role: devops',
        '  - role: researcher',
        '  - role: strategist',
        '  - role: ideator',
      ].join('\n'));
      writeAssemblyLog(projectDir, block + '\n');
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null, 'all non-specialized roles must pass through Pass 2');
    });

    it('AC7: malformed swarm.yaml fails open (Pass 2 silently skipped, exit 0)', () => {
      const projectDir = makeProject('project:\n  name: ac7\nteam:\n  mode: fixed\n  specializations: [this is: not valid: yaml: at all\n');
      const block = assemblyBlockFor('  - role: developer\n    domain: nope');
      writeAssemblyLog(projectDir, block + '\n');
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null, 'malformed swarm.yaml → Pass 2 silently skipped');
      assert.equal(result.status, 0);
    });

    it('AC7: missing swarm.yaml fails open (Pass 2 silently skipped)', () => {
      const projectDir = makeProject(null);  // no swarm.yaml at all
      const block = assemblyBlockFor('  - role: developer\n    domain: nope');
      writeAssemblyLog(projectDir, block + '\n');
      const result = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(result.decision, null, 'missing swarm.yaml → Pass 2 silently skipped');
      assert.equal(result.status, 0);
    });

    it('AC8: mixed team with valid specialist + valid non-specialist + one invalid specialist denies, naming the bad entry', () => {
      const projectDir = makeProject([
        'project:',
        '  name: ac8',
        'team:',
        '  mode: fixed',
        '  specializations:',
        '    - role: developer',
        '      domain: backend-auth',
        '  fallback:',
        '    enabled: false',
        '',
      ].join('\n'));
      const block = assemblyBlockFor([
        '  - role: developer',
        '    domain: backend-auth',  // valid specialist
        '  - role: architect',        // valid non-specialist
        '  - role: developer',
        '    domain: payments-api',   // INVALID — not declared
      ].join('\n'));
      writeAssemblyLog(projectDir, block + '\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      const reason = decision.hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /developer domain=payments-api/,
        'deny reason must name the specific invalid entry');
    });

    it('routing deny runs on the handshake-accepted block (Pass 1 accept is not a Pass 2 bypass)', () => {
      const projectDir = makeProject([
        'project:',
        '  name: routing-on-handshake',
        'team:',
        '  mode: fixed',
        '  specializations:',
        '    - role: developer',
        '      domain: backend-auth',
        '  fallback:',
        '    enabled: false',
        '',
      ].join('\n'));
      const block = assemblyBlockFor('  - role: developer\n    domain: payments-api');
      writeAssemblyLog(projectDir, block + '\n');
      const { decision } = runHookInCwd('team-assembly-lint.cjs', { stdin: SPAWN_STDIN, cwd: projectDir });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'handshake-accepted block must still go through Pass 2 routing');
      assert.match(decision.hookSpecificOutput.permissionDecisionReason,
        /developer domain=payments-api/);
    });

    // -------------------------------------------------------------------
    // Self-containment regression (F-team-assembly-lint-requires-js-yaml-
    // fails-open): the lint must ENFORCE in a scaffolded project that has no
    // node_modules — i.e. with js-yaml entirely unresolvable. The prior
    // `try { require('js-yaml') } catch { exit 0 }` fail-open silently
    // no-opped Pass 2 in every real project. These tests spawn the hook with
    // NODE_PATH stripped; because the generated hook lives under a mkdtemp dir
    // (no ancestor node_modules), js-yaml is genuinely unresolvable — the true
    // scaffolded-project condition.
    // -------------------------------------------------------------------

    function runHookNoJsYaml(cwd, stdin) {
      const hookPath = join(hooksDir, 'team-assembly-lint.cjs');
      const env = { ...process.env };
      delete env.NODE_PATH; // guarantee js-yaml cannot be resolved via NODE_PATH
      const result = spawnSync('node', [hookPath], { input: stdin, encoding: 'utf8', env, cwd });
      let decision = null;
      if (result.stdout && result.stdout.trim()) {
        try { decision = JSON.parse(result.stdout); } catch {}
      }
      return { ...result, decision };
    }

    it('regression: the generated hook carries no js-yaml dependency', () => {
      const src = readFileSync(join(hooksDir, 'team-assembly-lint.cjs'), 'utf8');
      assert.ok(!/require\(\s*['"]js-yaml['"]\s*\)/.test(src),
        'team-assembly-lint must not require js-yaml (self-contained, node built-ins only)');
    });

    it('regression: js-yaml unresolvable — Pass 1 still DENIES a missing declaration', () => {
      const projectDir = makeProject('project:\n  name: nojsyaml-missing\n');
      const { decision, status } = runHookNoJsYaml(projectDir, SPAWN_STDIN);
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'Pass 1 must enforce even with js-yaml unresolvable (no fail-open no-op)');
      assert.equal(status, 0);
    });

    it('regression: js-yaml unresolvable — Pass 2 fixed-mode routing still DENIES', () => {
      const projectDir = makeProject([
        'project:',
        '  name: nojsyaml-routing',
        'team:',
        '  mode: fixed',
        '  specializations:',
        '    - role: developer',
        '      domain: backend-auth',
        '  fallback:',
        '    enabled: false',
        '',
      ].join('\n'));
      writeAssemblyLog(projectDir, assemblyBlockFor('  - role: developer\n    domain: payments-api') + '\n');
      const { decision } = runHookNoJsYaml(projectDir, SPAWN_STDIN);
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'Pass 2 routing must enforce without js-yaml (this is the regression the fix closes)');
      assert.match(decision.hookSpecificOutput.permissionDecisionReason,
        /developer domain=payments-api/);
    });

    it('regression: js-yaml unresolvable — a valid dynamic-mode block still ACCEPTS', () => {
      const projectDir = makeProject('project:\n  name: nojsyaml-accept\n');
      writeAssemblyLog(projectDir, assemblyBlockFor('  - role: developer\n    domain: anything') + '\n');
      const { decision, status } = runHookNoJsYaml(projectDir, SPAWN_STDIN);
      assert.equal(decision, null, 'dynamic mode + valid fresh block → accept, even without js-yaml');
      assert.equal(status, 0);
    });
  });

  // -----------------------------------------------------------------------
  describe('orchestrator-write-gate.cjs', () => {
    it('is inert when AGENT_ROLE is not orchestrator', () => {
      const event = { tool_input: { file_path: '/anywhere/random/file.txt' } };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: '' },
      });
      assert.equal(result.decision, null);
      assert.equal(result.status, 0);
    });

    it('allows artifacts/ writes when AGENT_ROLE=orchestrator', () => {
      const event = { tool_input: { file_path: 'artifacts/reviews/audit.md' } };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null, 'artifacts/ path should be allowed');
    });

    it('allows Windows-style (backslash) relative artifacts paths', () => {
      // Backslash separators normalize to `/` and anchor to <root>/artifacts/.
      // (Absolute foreign-root paths like C:\… can only be anchored on the host
      // that owns that root; the cross-platform guarantee is the separator
      // normalization, exercised here with a repo-relative path.)
      const event = { tool_input: { file_path: 'artifacts\\reviews\\foo.md' } };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null);
    });

    // ADR-017 Amendment 1: project.yaml was REMOVED from the writable set
    // (D-037 retires the file; the Stream B cutover relies on this). The
    // orchestrator can no longer write it directly.
    it('DENIES project.yaml (removed from the writable set, ADR-017 Amendment 1)', () => {
      const event = { tool_input: { file_path: 'project.yaml' } };
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'project.yaml is no longer in the orchestrator writable set');
    });

    it('allows swarm.yaml', () => {
      const event = { tool_input: { file_path: 'swarm.yaml' } };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null);
    });

    it('allows .gitignore', () => {
      const event = { tool_input: { file_path: '.gitignore' } };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null);
    });

    it('allows session-active marker path', () => {
      const event = { tool_input: { file_path: '.claude/hooks/.session-active' } };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null);
    });

    it('denies non-artifacts code paths when orchestrator', () => {
      const event = { tool_input: { file_path: 'generators/hooks-generator.js' } };
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      assert.match(decision.hookSpecificOutput.permissionDecisionReason,
        /Delegate code\/artifact changes to a teammate spawned via the Agent tool/);
    });

    it('denies when file_path is missing (empty string does not match allow list)', () => {
      const event = { tool_input: {} };
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
    });

    it('falls through on invalid stdin JSON', () => {
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: 'not-json',
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null, 'parse failure is treated as pass-through');
      assert.equal(result.status, 0);
    });

    // HARN-1 fix tests (per ADR-003): two-layer identity check.
    // Primary: event.agent_id || event.agent_type => teammate subagent.
    // Secondary: AGENT_ROLE env var (defense-in-depth / override path).

    it('is inert when agent_id is present (teammate subagent call, even with AGENT_ROLE env leaked)', () => {
      const event = {
        tool_input: { file_path: 'generators/hooks-generator.js' },
        agent_id: 'agent-abc123',
      };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null,
        'teammate subagent must pass through even when AGENT_ROLE env leaked (HARN-1)');
    });

    it('is inert when agent_type is present (teammate subagent call)', () => {
      const event = {
        tool_input: { file_path: 'generators/hooks-generator.js' },
        agent_type: 'developer',
      };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null);
    });

    it('denies orchestrator code edit when no subagent fields present (regression guard for HARN-1 fix)', () => {
      // This is the regression test that would have caught HARN-1 itself: with
      // AGENT_ROLE=orchestrator and no payload agent fields, the gate must still
      // fire on a code path.
      const event = { tool_input: { file_path: 'generators/hooks-generator.js' } };
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
    });

    it('F-020: DENIES .claude/settings.local.json (it can disable the gate)', () => {
      // ADR-017: the orchestrator must not write the file that can widen its own
      // permissions / disable this gate. Recovery is human-only now.
      const event = { tool_input: { file_path: '.claude/settings.local.json' } };
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'settings.local.json is a self-ungate surface — orchestrator write denied (F-020)');
    });

    it('F-020: DENIES settings.local.json via backslash separators too', () => {
      const event = { tool_input: { file_path: '.claude\\settings.local.json' } };
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
    });

    it('treats empty-string agent_id as main-thread (falsy — denies code edit)', () => {
      const event = {
        tool_input: { file_path: 'generators/hooks-generator.js' },
        agent_id: '',
      };
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
    });

    it('treats null agent_id and undefined agent_type as main-thread (reviewer amendment §5.1)', () => {
      const event = {
        tool_input: { file_path: 'generators/hooks-generator.js' },
        agent_id: null,
        // agent_type intentionally omitted
      };
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
    });

    // -------------------------------------------------------------------
    // F-017: path normalization — traversal and sibling-directory bypass.
    // The gate resolves + rejects `..` + segment-anchors, so a path that
    // merely CONTAINS an allowed prefix cannot slip through.
    // -------------------------------------------------------------------

    function orchestratorFileDecision(filePath) {
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify({ tool_input: { file_path: filePath } }),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      return decision?.hookSpecificOutput?.permissionDecision || null;
    }

    it('F-017: DENIES traversal out of artifacts/ (artifacts/../.claude/settings.json)', () => {
      assert.equal(orchestratorFileDecision('artifacts/../.claude/settings.json'), 'deny',
        '`..` must be rejected before the allow check');
    });

    it('F-017: DENIES an absolute path that traverses through artifacts/', () => {
      assert.equal(orchestratorFileDecision('/home/u/artifacts/../.claude/settings.json'), 'deny');
    });

    it('F-017: DENIES a sibling artifacts dir (src/artifacts/malware.js)', () => {
      assert.equal(orchestratorFileDecision('src/artifacts/malware.js'), 'deny',
        'only <root>/artifacts/ is writable, not any dir literally named artifacts');
    });

    it('F-017: DENIES a substring match (notes-artifacts/x.js)', () => {
      assert.equal(orchestratorFileDecision('notes-artifacts/x.js'), 'deny');
    });

    it('F-017: DENIES a $-suffix config match (evil/project.yaml)', () => {
      assert.equal(orchestratorFileDecision('evil/project.yaml'), 'deny',
        'config files match as exact repo-root basenames, not path suffixes');
    });

    it('F-017: still ALLOWS a legitimate nested artifacts path', () => {
      assert.equal(orchestratorFileDecision('artifacts/implementation/stories/1-1.md'), null);
    });

    // -------------------------------------------------------------------
    // F-016: Bash write-shape interception for the orchestrator identity.
    // -------------------------------------------------------------------

    function orchestratorBashDecision(command, env = {}) {
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
        env: { AGENT_ROLE: 'orchestrator', ...env },
      });
      return decision?.hookSpecificOutput?.permissionDecision || null;
    }

    const BLOCKED_BASH = [
      ['echo redirection into a code path', "echo 'evil' > src/auth.js"],
      ['append redirection into a code path', "echo 'x' >> generators/hooks-generator.js"],
      ['redirection into .claude/', 'echo x > .claude/settings.json'],
      ['redirection into settings.local.json (F-020)', 'printf x > .claude/settings.local.json'],
      ['tee into a code path', "echo x | tee src/index.js"],
      ['node -e fs write', 'node -e \'require("fs").writeFileSync("src/x.js","bad")\''],
      ['node --eval', 'node --eval "1+1"'],
      ['python -c', 'python3 -c "open(\'src/x.py\',\'w\').write(1)"'],
      ['sed -i on .claude', 'sed -i s/a/b/ .claude/settings.json'],
      ['dd of= a code path', 'dd if=/dev/zero of=src/x.js'],
      ['cp into a code path', 'cp /tmp/x.js src/x.js'],
      ['mv into a code path', 'mv /tmp/x.js generators/x.js'],
      ['chained write after a benign command', 'git status && echo evil > src/x.js'],
      ['sudo-wrapped node -e', 'sudo node -e \'process.exit(0)\''],
      ['traversal redirect out of artifacts', 'echo x > artifacts/../.claude/settings.json'],
      ['clobber operator >| into a code path', 'echo x >| src/x.js'],
      ['fd redirect 2> to a code file', 'echo x 2> src/err.log'],
      ['truncate-via-redirect (: > file)', ': > src/x.js'],
      ['no-space redirect', 'echo x >src/z.js'],
      // F-016 reopened: subshell / wrapper / stdin-fed interpreter bypasses.
      ['command substitution running node -e', 'true $(node -e \'require("fs").writeFileSync("code2.js","x")\')'],
      ['backtick substitution running node -e', 'echo `node -e "1"`'],
      ['pipe into xargs node -e', 'echo x | xargs node -e \'require("fs").writeFileSync("c.js","x")\''],
      ['pipe into node /dev/stdin', 'echo "code" | node /dev/stdin'],
      ['find -exec node -e', 'find . -name x -exec node -e \'1\' {} ;'],
      ['node running a non-pinned script', 'node bin/bmad-swarm.js status'],
      ['python interpreter', 'python3 script.py'],
      // Medium: git tree-mutations + misc write-shape binaries (tripwire deny).
      ['git apply a patch', 'git apply /tmp/x.patch'],
      ['git checkout -- path', 'git checkout HEAD~3 -- src/foo.js'],
      ['git restore', 'git restore src/foo.js'],
      ['git stash apply', 'git stash apply'],
      ['patch', 'patch -p0 -i /tmp/x.patch'],
      ['ed in-place', 'ed -s code.js'],
      ['awk internal redirect', 'awk \'{print > "src/x.js"}\' /etc/hosts'],
      ['base64 decode into a file', 'base64 -d in.b64 > src/x.js'],
      // Security HIGH: raw shell writes to the serialized ledger files.
      ['append to ledger.md', 'echo garbage >> artifacts/context/ledger.md'],
      ['redirect to decision-log.md', 'echo x > artifacts/context/decision-log.md'],
      ['tee to task-ledger.md', 'echo x | tee artifacts/context/task-ledger.md'],
      // F-017 reopened: symlink whose target escapes the writable set.
      ['ln -s pointing outside the writable set', 'ln -s /outside artifacts/esc'],
    ];
    for (const [label, cmd] of BLOCKED_BASH) {
      it(`F-016: DENIES ${label}`, () => {
        assert.equal(orchestratorBashDecision(cmd), 'deny', `should block: ${cmd}`);
      });
    }

    const ALLOWED_BASH = [
      ['git status', 'git status'],
      ['git log', 'git log --oneline -5'],
      ['git diff', 'git diff HEAD~1'],
      ['ls', 'ls -la src/'],
      ['grep', 'grep -rn foo src/'],
      ['npm test', 'npm test'],
      ['the pinned record helper', 'node .claude/bmad/bin/record.cjs append --type F --stdin'],
      ['the pinned replay-check helper', 'node .claude/bmad/bin/replay-check.cjs artifacts/x.evidence.yaml'],
      ['echo with no redirect', "echo 'just printing'"],
      ['redirect to /dev/null', 'ls -la > /dev/null'],
      ['redirect to /tmp (scratchpad)', 'echo x > /tmp/scratch.txt'],
      ['fd dup (not a file write)', 'npm test 2>&1'],
      ['redirect INTO artifacts (writable set)', 'echo note > artifacts/context/scratch.md'],
      ['cat for reading', 'cat swarm.yaml'],
      // F2-H2: quoted `>` / `->` must NOT be read as redirection (false positives).
      ['rg with quoted > in the pattern', 'rg "value > 5" src/'],
      ['git commit with -> in the message', 'git commit -m "rename a -> b"'],
      ['git log with > in --grep', 'git log --grep="foo>bar"'],
      ['grep with quoted >', "grep -rn 'a > b' src/"],
    ];
    for (const [label, cmd] of ALLOWED_BASH) {
      it(`F-016: ALLOWS ${label}`, () => {
        assert.equal(orchestratorBashDecision(cmd), null, `should pass: ${cmd}`);
      });
    }

    // -------------------------------------------------------------------
    // ADR-017 Amendment 1: git inspection matrix. Coordination git is
    // ALLOWED; write-vector + destructive git is DENIED. Includes the -C bug
    // (option-with-argument globals consumed before subcommand resolution),
    // the -c alias/shell-escape vector, and --exec-path.
    // -------------------------------------------------------------------
    const GIT_ALLOWED = [
      ['git commit', 'git commit -m "wip"'],
      ['git push (plain)', 'git push origin stream-a'],
      ['git fetch', 'git fetch origin'],
      ['git merge --ff-only', 'git merge --ff-only stream-a'],
      ['git pull --ff-only', 'git pull --ff-only origin main'],
      ['git checkout branch-form', 'git checkout main'],
      ['git checkout -b (create)', 'git checkout -b feature'],
      ['git switch branch-form', 'git switch main'],
      ['git switch -c (create)', 'git switch -c feature'],
      ['git branch', 'git branch feature'],
      ['git tag', 'git tag v3.0.0'],
      ['git reset --soft', 'git reset --soft HEAD~1'],
      ['git reset (default/mixed)', 'git reset HEAD~1'],
      ['git -C <path> checkout main (the -C bug: subcommand must resolve to checkout)', 'git -C /tmp checkout main'],
      ['git -c core.pager=cat log', 'git -c core.pager=cat log --oneline'],
    ];
    for (const [label, cmd] of GIT_ALLOWED) {
      it(`git-matrix: ALLOWS ${label}`, () => {
        assert.equal(orchestratorBashDecision(cmd), null, `coordination git should pass: ${cmd}`);
      });
    }

    const GIT_DENIED = [
      ['git apply a patch', 'git apply /tmp/x.patch'],
      ['git -C <path> apply (the -C bug: must still be denied)', 'git -C /tmp apply evil.patch'],
      ['git am a mailbox', 'git am /tmp/x.mbox'],
      ['git restore', 'git restore src/foo.js'],
      ['git stash pop', 'git stash pop'],
      ['git checkout <ref> -- <path> (pathspec)', 'git checkout main -- src/app.js'],
      ['git checkout <ref> <path> (two operands, pathspec)', 'git checkout HEAD~3 src/foo.js'],
      ['git switch pathspec', 'git switch main -- src/app.js'],
      ['git reset --hard', 'git reset --hard HEAD~1'],
      ['git reset --merge', 'git reset --merge'],
      ['git clean', 'git clean -fdx'],
      ['git push --force', 'git push --force'],
      ['git push --force-with-lease', 'git push --force-with-lease'],
      ['git push --delete', 'git push origin --delete stream-a'],
      ['git merge without --ff-only', 'git merge stream-a'],
      ['git pull without --ff-only', 'git pull origin main'],
      ['git rebase', 'git rebase main'],
      ['git filter-branch', 'git filter-branch --tree-filter x HEAD'],
      ['git update-ref', 'git update-ref refs/heads/x HEAD'],
      ['git -c alias shell-escape', "git -c alias.x='!sh' x"],
      ['git --exec-path binary substitution', 'git --exec-path=/tmp/evil status'],
    ];
    for (const [label, cmd] of GIT_DENIED) {
      it(`git-matrix: DENIES ${label}`, () => {
        assert.equal(orchestratorBashDecision(cmd), 'deny', `write-vector/destructive git should be denied: ${cmd}`);
      });
    }

    it('F-016: a teammate (agent_id present) is UNAFFECTED by the Bash gate', () => {
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify({
          tool_name: 'Bash',
          tool_input: { command: "echo 'evil' > src/auth.js" },
          agent_id: 'agent-abc123',
        }),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision, null, 'teammates keep their working shell (ADR-003 identity check)');
    });

    it('F-016: a teammate (agent_type present) may run node -e', () => {
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify({
          tool_name: 'Bash',
          tool_input: { command: 'node -e "1+1"' },
          agent_type: 'developer',
        }),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision, null);
    });

    it('F-016: Bash gate is inert when AGENT_ROLE is not orchestrator', () => {
      assert.equal(orchestratorBashDecision("echo x > src/y.js", { AGENT_ROLE: '' }), null);
    });

    // -------------------------------------------------------------------
    // F-016: NotebookEdit is now intercepted like the other write tools.
    // -------------------------------------------------------------------

    it('F-016: DENIES NotebookEdit to a code path (notebook_path)', () => {
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'src/analysis.ipynb' } }),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
    });

    it('F-016: ALLOWS NotebookEdit inside artifacts/', () => {
      const { decision } = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'artifacts/exploration/nb.ipynb' } }),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(decision, null);
    });
  });

  // -----------------------------------------------------------------------
  describe('user-prompt-submit.cjs', () => {
    // Each test uses an isolated cwd so marker-file state is independent.
    function freshCwd() {
      const d = join(tmpDir, 'ups-' + Math.random().toString(36).slice(2));
      mkdirSync(join(d, '.claude', 'hooks'), { recursive: true });
      return d;
    }

    it('emits identity-orchestrator pointer when marker is missing', () => {
      const cwd = freshCwd();
      const event = { cwd };
      const { decision } = runHook('user-prompt-submit.cjs', { stdin: JSON.stringify(event) });
      assert.equal(decision?.hookSpecificOutput?.hookEventName, 'UserPromptSubmit');
      assert.match(decision.hookSpecificOutput.additionalContext,
        /\/identity-orchestrator/);
      assert.ok(existsSync(join(cwd, '.claude', 'hooks', '.session-active')),
        'marker file should be written');
    });

    it('emits nothing when marker exists (suppresses re-fire)', () => {
      const cwd = freshCwd();
      writeFileSync(join(cwd, '.claude', 'hooks', '.session-active'), '123');
      const event = { cwd };
      const result = runHook('user-prompt-submit.cjs', { stdin: JSON.stringify(event) });
      assert.equal(result.decision, null, 'should exit silently when marker exists');
      assert.equal(result.status, 0);
    });

    it('swallows write errors silently when marker directory is missing', () => {
      const cwd = join(tmpDir, 'ups-no-dir-' + Math.random().toString(36).slice(2));
      mkdirSync(cwd, { recursive: true });
      // Note: .claude/hooks/ directory intentionally NOT created
      const event = { cwd };
      const result = runHook('user-prompt-submit.cjs', { stdin: JSON.stringify(event) });
      assert.equal(result.status, 0, 'hook should exit 0 even if marker write fails');
      // The additionalContext is still emitted (write failure is swallowed)
      assert.match(result.decision?.hookSpecificOutput?.additionalContext || '',
        /\/identity-orchestrator/);
    });

    it('exits silently on invalid stdin JSON', () => {
      const result = runHook('user-prompt-submit.cjs', { stdin: 'not-json' });
      assert.equal(result.decision, null);
      assert.equal(result.status, 0);
    });
  });

  // -----------------------------------------------------------------------
  describe('post-compact-reinject.cjs', () => {
    it('emits identity pointer on compact event', () => {
      const { decision } = runHook('post-compact-reinject.cjs', { stdin: '{}' });
      assert.equal(decision?.hookSpecificOutput?.hookEventName, 'SessionStart');
      assert.match(decision.hookSpecificOutput.additionalContext,
        /\/identity-orchestrator/);
      assert.match(decision.hookSpecificOutput.additionalContext,
        /Context was compacted/);
    });

    it('removes the session-active marker if present', () => {
      // The hook uses process.cwd() for the marker path, so run it with
      // a cwd that has a marker to remove.
      const cwd = join(tmpDir, 'pcr-' + Math.random().toString(36).slice(2));
      mkdirSync(join(cwd, '.claude', 'hooks'), { recursive: true });
      const markerPath = join(cwd, '.claude', 'hooks', '.session-active');
      writeFileSync(markerPath, 'will-be-removed');

      const hookPath = join(hooksDir, 'post-compact-reinject.cjs');
      spawnSync('node', [hookPath], { input: '{}', encoding: 'utf8', cwd });

      assert.equal(existsSync(markerPath), false, 'marker should be removed');
    });

    it('tolerates missing marker file (swallows unlink error)', () => {
      const cwd = join(tmpDir, 'pcr-nomarker-' + Math.random().toString(36).slice(2));
      mkdirSync(cwd, { recursive: true });
      const hookPath = join(hooksDir, 'post-compact-reinject.cjs');
      const result = spawnSync('node', [hookPath], { input: '{}', encoding: 'utf8', cwd });
      assert.equal(result.status, 0, 'hook exits cleanly even when marker does not exist');
    });
  });
});
