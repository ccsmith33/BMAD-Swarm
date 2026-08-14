import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { generateSettings } from '../generators/settings-generator.js';

describe('Settings Generator', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-settings-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeProject(name) {
    const projectDir = join(tmpDir, name);
    mkdirSync(projectDir, { recursive: true });
    const configPath = join(projectDir, 'swarm.yaml');
    writeFileSync(configPath, 'project:\n  name: test\nstack:\n  language: JS\n');
    const config = loadSwarmConfig(configPath);
    const paths = getProjectPaths(projectDir);
    return { config, paths, projectDir };
  }

  it('generates valid JSON settings file', () => {
    const { config, paths } = makeProject('settings-test-1');
    const result = generateSettings(config, paths);

    assert.ok(existsSync(paths.settingsJson), 'settings.json should exist');
    assert.equal(result.path, paths.settingsJson, 'Should return the correct path');

    const content = readFileSync(paths.settingsJson, 'utf8');
    const parsed = JSON.parse(content);
    assert.ok(typeof parsed === 'object', 'Should be valid JSON object');
  });

  it('includes hooks configuration', () => {
    const { config, paths } = makeProject('settings-test-2');
    generateSettings(config, paths);

    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content.hooks, 'Should have hooks section');
    assert.ok(content.hooks.UserPromptSubmit, 'Should have UserPromptSubmit hooks');
    assert.ok(content.hooks.SessionStart, 'Should have SessionStart hooks');
    assert.ok(content.hooks.PreToolUse, 'Should have PreToolUse hooks (Agent assembly lint + Edit/Write gate)');
    // ADR-022 supersedes D-002/ADR-002: the TaskCompleted hook returns as the
    // replay gate's blocking trigger (spike-verified on v2.1.221), and
    // TaskCreated enforces the `gate: replay` marker on story tasks.
    assert.ok(content.hooks.TaskCompleted, 'Should have the TaskCompleted replay-gate hook (ADR-022)');
    assert.ok(content.hooks.TaskCreated, 'Should have the TaskCreated marker-enforcement hook (ADR-022)');
    // ADR-018 / D-037: the task-ledger writer is a PostToolUse hook on the task
    // + messaging tools (the old task-tool-warning PostToolUse is still gone).
    assert.ok(content.hooks.PostToolUse, 'Should have the PostToolUse task-ledger writer (ADR-018)');
    assert.equal(content.hooks.PostToolUse[0].matcher, 'TaskCreate|TaskUpdate|SendMessage',
      'PostToolUse writer must match the task + messaging tools');
    assert.ok(!content.hooks.TeammateIdle, 'Should NOT have TeammateIdle hooks (dead capability removed)');
  });

  it('permissions.allow does not include Task', () => {
    const { config, paths } = makeProject('settings-no-task');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(!content.permissions.allow.includes('Task'), 'Task must not be in allow-list (structural enforcement)');
  });

  it('permissions.allow does not include TodoRead or TodoWrite', () => {
    const { config, paths } = makeProject('settings-no-todo');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(!content.permissions.allow.includes('TodoRead'), 'TodoRead must not be in allow-list');
    assert.ok(!content.permissions.allow.includes('TodoWrite'), 'TodoWrite must not be in allow-list');
  });

  it('permissions.allow contains Agent and not the removed TeamCreate (ADR-015)', () => {
    const { config, paths } = makeProject('settings-agent-allow');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content.permissions.allow.includes('Agent'), 'Agent must be in allow-list (teams form on Agent spawns)');
    assert.ok(!content.permissions.allow.includes('TeamCreate'), 'TeamCreate no longer exists and must not be listed');
  });

  it('env.AGENT_ROLE is set to orchestrator', () => {
    const { config, paths } = makeProject('settings-agent-role');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content.env, 'Should have env section');
    assert.equal(content.env.AGENT_ROLE, 'orchestrator', 'AGENT_ROLE env must be set to orchestrator');
  });

  it('env enables experimental agent teams (ADR-015)', () => {
    const { config, paths } = makeProject('settings-agent-teams-env');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.equal(content.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, '1',
      'agent-teams events (team spawns, TaskCreated/TaskCompleted) require the experimental flag');
  });

  it('PreToolUse anchors the assembly lint on Agent, not TeamCreate (ADR-015)', () => {
    const { config, paths } = makeProject('settings-agent-anchor');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    const matchers = content.hooks.PreToolUse.map(h => h.matcher);
    assert.ok(matchers.includes('Agent'), 'PreToolUse must match the Agent tool');
    assert.ok(!matchers.includes('TeamCreate'), 'dead TeamCreate matcher must not ship (misleads settings readers)');
    const agentHook = content.hooks.PreToolUse.find(h => h.matcher === 'Agent');
    assert.match(agentHook.hooks[0].command, /team-assembly-lint\.cjs/, 'Agent matcher runs the assembly lint');
    assert.match(agentHook.hooks[0].command, /\$CLAUDE_PROJECT_DIR/, 'hook command must be project-dir anchored (M-2)');
  });

  it('ADR-017/F-016/F-018: orchestrator allow-list drops interpreter/arbitrary-write Bash', () => {
    const { config, paths } = makeProject('settings-narrowed-shell');
    generateSettings(config, paths);
    const allow = JSON.parse(readFileSync(paths.settingsJson, 'utf8')).permissions.allow;
    // The interpreter/redirect-capable grants that made the deny-list decorative
    // and let a blocked orchestrator shell out must be gone.
    for (const forbidden of ['Bash(node:*)', 'Bash(npx:*)', 'Bash(echo:*)', 'Bash(npm:*)', 'Bash(git:*)']) {
      assert.ok(!allow.includes(forbidden), `allow-list must NOT include ${forbidden}`);
    }
    // No entry may grant a bare interpreter or npx with a wildcard.
    for (const entry of allow) {
      assert.ok(!/^Bash\(node:\*\)$|^Bash\(npx/.test(entry),
        `allow entry grants an interpreter shell: ${entry}`);
    }
  });

  it('ADR-017/D-049: orchestrator keeps read-inspection + BOTH pinned helpers', () => {
    const { config, paths } = makeProject('settings-pinned-helper');
    generateSettings(config, paths);
    const allow = JSON.parse(readFileSync(paths.settingsJson, 'utf8')).permissions.allow;
    for (const expected of [
      'Bash(git status:*)',
      'Bash(git log:*)',
      'Bash(git diff:*)',
      'Bash(git show:*)',
      'Bash(ls:*)',
      'Bash(npm test:*)',
      'Bash(node .claude/bmad/bin/record.cjs:*)',
      'Bash(node .claude/bmad/bin/replay-check.cjs:*)', // F2-M4: BOTH scripts pinned
    ]) {
      assert.ok(allow.includes(expected), `allow-list must include ${expected}`);
    }
    // F2-M4: the unpinned, teammate-writable repo-root bin/ path must be gone.
    assert.ok(!allow.includes('Bash(node bin/bmad-swarm.js:*)'),
      'must NOT grant the unpinned repo-root bin/ script (teammate-writable escape)');
    // No allow entry may name the repo-root bin/ interpreter path.
    for (const entry of allow) {
      assert.ok(!/^Bash\(node\s+bin\//.test(entry), `unpinned bin/ node grant: ${entry}`);
    }
  });

  it('permissions.defaultMode is acceptEdits (ADR-001)', () => {
    const { config, paths } = makeProject('settings-default-mode');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.equal(content.permissions.defaultMode, 'acceptEdits', 'defaultMode must be acceptEdits to reduce permission prompts per ADR-001');
  });

  it('permissions.deny blocks destructive patterns (ADR-001)', () => {
    const { config, paths } = makeProject('settings-deny-list');
    generateSettings(config, paths);
    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(Array.isArray(content.permissions.deny), 'Should have deny array');
    const mustDeny = [
      'Bash(rm -rf /*)',
      'Bash(sudo*)',
      'Bash(git push --force*)',
      'Bash(git reset --hard*)',
      'Bash(chmod 777*)',
    ];
    for (const pattern of mustDeny) {
      assert.ok(content.permissions.deny.includes(pattern), 'deny list must include ' + pattern);
    }
  });

  it('creates file at correct path inside .claude/', () => {
    const { config, paths } = makeProject('settings-test-3');
    const result = generateSettings(config, paths);

    assert.ok(result.path.includes('.claude'), 'Should be inside .claude directory');
    assert.ok(result.path.endsWith('settings.json'), 'Should end with settings.json');
  });

  it('includes permissions section from template', () => {
    const { config, paths } = makeProject('settings-test-4');
    generateSettings(config, paths);

    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content.permissions, 'Should have permissions section');
    assert.ok(Array.isArray(content.permissions.allow), 'Should have allow array');
  });

  it('embeds _bmadGenerated hash in settings.json', () => {
    const { config, paths } = makeProject('settings-hash');
    generateSettings(config, paths);

    const content = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.ok(content._bmadGenerated, 'Should have _bmadGenerated key');
    assert.match(content._bmadGenerated, /^[a-f0-9]{8}$/, 'Hash should be 8 hex chars');
  });

  it('skips writing when settings.json is manually modified', () => {
    const { config, paths } = makeProject('settings-modified');

    // First generation
    generateSettings(config, paths);

    // Manually modify: change a value but keep structure
    const parsed = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    parsed.customKey = 'user-added';
    writeFileSync(paths.settingsJson, JSON.stringify(parsed, null, 2) + '\n');

    // Second generation should detect modification and skip
    const result = generateSettings(config, paths);
    assert.equal(result.modified, true, 'Should detect manual modification');

    // Verify user's change is preserved
    const afterContent = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.equal(afterContent.customKey, 'user-added', 'User change should be preserved');
  });

  it('overwrites when force option is set', () => {
    const { config, paths } = makeProject('settings-force');

    // First generation
    generateSettings(config, paths);

    // Manually modify
    const parsed = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    parsed.customKey = 'user-added';
    writeFileSync(paths.settingsJson, JSON.stringify(parsed, null, 2) + '\n');

    // Force should overwrite
    const result = generateSettings(config, paths, { force: true });
    assert.equal(result.modified, false, 'Should overwrite when forced');

    // Verify user's change is gone
    const afterContent = JSON.parse(readFileSync(paths.settingsJson, 'utf8'));
    assert.equal(afterContent.customKey, undefined, 'User change should be removed');
  });

  it('returns modified: false on first generation', () => {
    const { config, paths } = makeProject('settings-first-gen');
    const result = generateSettings(config, paths);
    assert.equal(result.modified, false, 'First generation should not be marked as modified');
  });

  // -----------------------------------------------------------------------
  // ADR-017 Amendment 1: safe-default coordination git + project-aware merge.
  // -----------------------------------------------------------------------

  function makeProjectYaml(name, yaml) {
    const projectDir = join(tmpDir, name);
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'swarm.yaml'), yaml);
    const config = loadSwarmConfig(join(projectDir, 'swarm.yaml'));
    return { config, paths: getProjectPaths(projectDir) };
  }

  it('safe default includes coordination git + read-only bmad-swarm CLI', () => {
    const { config, paths } = makeProject('settings-coord-git');
    generateSettings(config, paths);
    const allow = JSON.parse(readFileSync(paths.settingsJson, 'utf8')).permissions.allow;
    for (const expected of [
      'Bash(git commit:*)', 'Bash(git push:*)', 'Bash(git fetch:*)',
      'Bash(git merge --ff-only:*)', 'Bash(git checkout:*)', 'Bash(git switch:*)',
      'Bash(git branch:*)', 'Bash(git tag:*)',
      'Bash(bmad-swarm validate:*)', 'Bash(bmad-swarm doctor:*)',
      'Bash(bmad-swarm status:*)', 'Bash(bmad-swarm scan:*)',
    ]) {
      assert.ok(allow.includes(expected), `safe default must include ${expected}`);
    }
  });

  it('merges validated project orchestrator_allow entries onto the safe default (appended, sorted)', () => {
    const { config, paths } = makeProjectYaml('settings-merge', [
      'project:',
      '  name: merge-test',
      'permissions:',
      '  orchestrator_allow:',
      '    - "Bash(cargo check:*)"',
      '    - "Bash(npm test:*)"',
      '',
    ].join('\n'));
    generateSettings(config, paths);
    const allow = JSON.parse(readFileSync(paths.settingsJson, 'utf8')).permissions.allow;
    assert.ok(allow.includes('Bash(cargo check:*)'), 'project entry merged');
    assert.ok(allow.includes('Bash(npm test:*)'), 'project entry merged');
    // Template entries come first; project entries are appended.
    assert.ok(allow.indexOf('Bash(cargo check:*)') > allow.indexOf('Bash(git commit:*)'),
      'project entries are appended after the template safe default');
  });

  it('does not duplicate a project entry that equals a safe-default entry', () => {
    const { config, paths } = makeProjectYaml('settings-dedupe', [
      'project:',
      '  name: dedupe-test',
      'permissions:',
      '  orchestrator_allow:',
      '    - "Bash(git commit:*)"',
      '',
    ].join('\n'));
    generateSettings(config, paths);
    const allow = JSON.parse(readFileSync(paths.settingsJson, 'utf8')).permissions.allow;
    assert.equal(allow.filter((e) => e === 'Bash(git commit:*)').length, 1,
      'a project entry equal to a safe default must not be duplicated');
  });

  it('a dangerous project entry fails config load loudly (never silently dropped)', () => {
    // loadSwarmConfig runs validateConfig, which rejects the entry — the throw
    // happens before generateSettings is ever reached.
    assert.throws(() => makeProjectYaml('settings-bad', [
      'project:',
      '  name: bad-test',
      'permissions:',
      '  orchestrator_allow:',
      '    - "Bash(git:*)"',
      '',
    ].join('\n')), /orchestrator_allow|refused|git/i,
      'a bare git grant must make loadSwarmConfig throw');
  });
});
