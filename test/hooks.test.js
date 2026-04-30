import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

  function runHook(hookName, { stdin = '{}', env = {} } = {}) {
    const hookPath = join(hooksDir, hookName);
    const result = spawnSync('node', [hookPath], {
      input: stdin,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    let decision = null;
    if (result.stdout && result.stdout.trim()) {
      try { decision = JSON.parse(result.stdout); } catch {}
    }
    return { ...result, decision };
  }

  function writeTranscript(contents) {
    const transcriptPath = join(tmpDir, 'transcript-' + Math.random().toString(36).slice(2) + '.jsonl');
    const lines = contents.map(c => JSON.stringify(c)).join('\n');
    writeFileSync(transcriptPath, lines);
    return transcriptPath;
  }

  function assistantEntry(messageId, contentBlocks) {
    return {
      type: 'assistant',
      message: { id: messageId, content: contentBlocks },
    };
  }

  function textBlock(text) { return { type: 'text', text }; }
  function thinkingBlock(thinking) { return { type: 'thinking', thinking }; }

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
  describe('teamcreate-gate.cjs', () => {
    it('denies when transcript has zero assistant entries', () => {
      const transcriptPath = writeTranscript([{ type: 'user', message: { content: 'hi' } }]);
      const event = { transcript_path: transcriptPath };
      const { decision } = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      assert.match(decision.hookSpecificOutput.permissionDecisionReason, /Missing: entry_point/);
    });

    it('allows when valid assembly block is in the most recent message', () => {
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(validAssemblyBlock)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(result.decision, null, 'no stdout = allow (no deny JSON emitted)');
      assert.equal(result.status, 0);
    });

    it('denies with only rationale missing when 4 of 5 keys present', () => {
      const partialBlock = [
        '```bmad-assembly',
        'entry_point: bug-fix',
        'complexity: 6',
        'autonomy: auto',
        'team:',
        '  - role: developer',
        '```',
      ].join('\n');
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(partialBlock)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const { decision } = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      const reason = decision.hookSpecificOutput.permissionDecisionReason;
      // The "Missing: ..." suffix should list only rationale, not the other 4 keys.
      const missingSection = reason.split('Missing:')[1];
      assert.match(missingSection, /^\s*rationale\s*$/,
        'Missing section should contain only rationale');
    });

    it('allows when block is in 2nd-most-recent message (different id)', () => {
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(validAssemblyBlock)]),
        assistantEntry('msg_2', [textBlock('thinking more about the problem')]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(result.decision, null, 'last-N=5 search should find block in msg_1');
      assert.equal(result.status, 0);
    });

    it('allows when block is in 5th-most-recent message (boundary)', () => {
      const entries = [];
      entries.push(assistantEntry('msg_old', [textBlock(validAssemblyBlock)]));
      // Four messages after the one with the block (5 total counting msg_old)
      for (let i = 1; i <= 4; i++) {
        entries.push(assistantEntry(`msg_${i}`, [textBlock(`filler message ${i}`)]));
      }
      const transcriptPath = writeTranscript(entries);
      const event = { transcript_path: transcriptPath };
      const result = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(result.decision, null, 'block in 5th-most-recent should be found');
    });

    it('denies when block is in 6th-most-recent message (beyond N=5)', () => {
      const entries = [];
      entries.push(assistantEntry('msg_old', [textBlock(validAssemblyBlock)]));
      // Five messages after the block = block is in 6th-most-recent position
      for (let i = 1; i <= 5; i++) {
        entries.push(assistantEntry(`msg_${i}`, [textBlock(`filler message ${i}`)]));
      }
      const transcriptPath = writeTranscript(entries);
      const event = { transcript_path: transcriptPath };
      const { decision } = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'block beyond last-N=5 should be invisible to the gate');
    });

    it('allows when block is in a thinking content block', () => {
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [
          thinkingBlock('Here is my plan:\n' + validAssemblyBlock),
          textBlock('I will now call TeamCreate.'),
        ]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(result.decision, null, 'thinking-block assembly should be accepted');
    });

    it('fails open when transcript_path is missing', () => {
      const result = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify({}) });
      assert.equal(result.decision, null, 'missing transcript_path = exit 0 silent');
      assert.equal(result.status, 0);
    });

    it('fails open when transcript file does not exist', () => {
      const event = { transcript_path: join(tmpDir, 'no-such-transcript.jsonl') };
      const result = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(result.decision, null);
      assert.equal(result.status, 0);
    });

    it('fails open when stdin is not valid JSON', () => {
      const result = runHook('teamcreate-gate.cjs', { stdin: 'not-json-at-all' });
      assert.equal(result.decision, null);
      assert.equal(result.status, 0);
    });

    it('tolerates malformed transcript lines (skips non-JSON)', () => {
      const transcriptPath = join(tmpDir, 'malformed-' + Math.random().toString(36).slice(2) + '.jsonl');
      const goodLine = JSON.stringify(assistantEntry('msg_1', [textBlock(validAssemblyBlock)]));
      writeFileSync(transcriptPath, 'not-json\n' + goodLine + '\n{also not json\n');
      const event = { transcript_path: transcriptPath };
      const result = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(result.decision, null, 'bad lines skipped, good line found');
    });

    // GATE-1: raw-transcript-scan fallback. When the assembly fence lives only
    // in the raw transcript JSON (e.g., structured content-block walk misses
    // it because the block shape differs from the 'text'/'thinking' typed
    // blocks we walk), the secondary raw-scan should still accept it.
    it('allows when assembly block appears only in raw transcript text, not in structured content blocks', () => {
      // Construct an assistant entry whose content array has NO text/thinking
      // block containing the fence, but the raw JSON line still includes the
      // fence text (e.g., serialized inside a non-text block type the walker
      // ignores). The raw-scan fallback should pick it up.
      const hiddenBlock = {
        type: 'tool_use',
        name: 'SomeTool',
        input: { prose: 'Here is the plan:\n' + validAssemblyBlock },
      };
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [hiddenBlock]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(result.decision, null,
        'raw-scan fallback should find the fence when structured walk misses it');
      assert.equal(result.status, 0);
    });

    it('denies when no assembly block exists anywhere in the raw transcript or structured content', () => {
      // No fence in structured content, no fence anywhere in the raw JSON.
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock('just some prose with no fence')]),
        assistantEntry('msg_2', [textBlock('still no fence here either')]),
      ]);
      const event = { transcript_path: transcriptPath };
      const { decision } = runHook('teamcreate-gate.cjs', { stdin: JSON.stringify(event) });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny',
        'no fence anywhere → deny (regression guard)');
      assert.match(decision.hookSpecificOutput.permissionDecisionReason, /Missing: entry_point/);
    });

    // -------------------------------------------------------------------
    // Pass 2 (ADR-008, D-009, Story WT-5): fixed-mode routing enforcement.
    // Each test below sets up a per-test temp project dir containing a
    // bespoke swarm.yaml, then spawns the hook with cwd set to that dir
    // so Pass 2's CWD-relative read picks up the fixture.
    // -------------------------------------------------------------------

    function makeProject(swarmYamlContents) {
      const projectDir = join(tmpDir, 'wt5-' + Math.random().toString(36).slice(2));
      mkdirSync(projectDir, { recursive: true });
      if (swarmYamlContents !== null) {
        writeFileSync(join(projectDir, 'swarm.yaml'), swarmYamlContents);
      }
      return projectDir;
    }

    function runHookInCwd(hookName, { stdin = '{}', env = {}, cwd } = {}) {
      const hookPath = join(hooksDir, hookName);
      // The hook does require('js-yaml'); in real installations the package
      // is resolvable from the project's node_modules (transitive dep of
      // bmad-swarm). The test fixture project doesn't have node_modules of
      // its own, so we point NODE_PATH at the repo's node_modules to make
      // the require succeed — same effect as a real installed dependency.
      const repoNodeModules = join(import.meta.dirname || '', '..', 'node_modules');
      const result = spawnSync('node', [hookPath], {
        input: stdin,
        encoding: 'utf8',
        env: { ...process.env, NODE_PATH: repoNodeModules, ...env },
        cwd,
      });
      let decision = null;
      if (result.stdout && result.stdout.trim()) {
        try { decision = JSON.parse(result.stdout); } catch {}
      }
      return { ...result, decision };
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

    it('AC1: dynamic mode (no team block) is byte-for-byte unchanged — Pass 2 skipped', () => {
      // No team block at all → mode defaults to "dynamic" → Pass 2 must skip.
      // Even an "obviously invalid" specialist entry must still pass.
      const projectDir = makeProject('project:\n  name: dyn-test\n');
      const block = assemblyBlockFor('  - role: developer\n    domain: nonexistent-domain');
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(block)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHookInCwd('teamcreate-gate.cjs', {
        stdin: JSON.stringify(event), cwd: projectDir,
      });
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
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(block)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHookInCwd('teamcreate-gate.cjs', {
        stdin: JSON.stringify(event), cwd: projectDir,
      });
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
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(block)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHookInCwd('teamcreate-gate.cjs', {
        stdin: JSON.stringify(event), cwd: projectDir,
      });
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
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(block)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHookInCwd('teamcreate-gate.cjs', {
        stdin: JSON.stringify(event), cwd: projectDir,
      });
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
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(block)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const { decision } = runHookInCwd('teamcreate-gate.cjs', {
        stdin: JSON.stringify(event), cwd: projectDir,
      });
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
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(block)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const { decision } = runHookInCwd('teamcreate-gate.cjs', {
        stdin: JSON.stringify(event), cwd: projectDir,
      });
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
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(block)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHookInCwd('teamcreate-gate.cjs', {
        stdin: JSON.stringify(event), cwd: projectDir,
      });
      assert.equal(result.decision, null, 'all non-specialized roles must pass through Pass 2');
    });

    it('AC7: malformed swarm.yaml fails open (Pass 2 silently skipped, exit 0)', () => {
      const projectDir = makeProject('project:\n  name: ac7\nteam:\n  mode: fixed\n  specializations: [this is: not valid: yaml: at all\n');
      const block = assemblyBlockFor('  - role: developer\n    domain: nope');
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(block)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHookInCwd('teamcreate-gate.cjs', {
        stdin: JSON.stringify(event), cwd: projectDir,
      });
      assert.equal(result.decision, null, 'malformed swarm.yaml → Pass 2 silently skipped');
      assert.equal(result.status, 0);
    });

    it('AC7: missing swarm.yaml fails open (Pass 2 silently skipped)', () => {
      const projectDir = makeProject(null);  // no swarm.yaml at all
      const block = assemblyBlockFor('  - role: developer\n    domain: nope');
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(block)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const result = runHookInCwd('teamcreate-gate.cjs', {
        stdin: JSON.stringify(event), cwd: projectDir,
      });
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
      const transcriptPath = writeTranscript([
        assistantEntry('msg_1', [textBlock(block)]),
      ]);
      const event = { transcript_path: transcriptPath };
      const { decision } = runHookInCwd('teamcreate-gate.cjs', {
        stdin: JSON.stringify(event), cwd: projectDir,
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
      const reason = decision.hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /developer domain=payments-api/,
        'deny reason must name the specific invalid entry');
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

    it('allows Windows-style mixed-separator artifacts paths', () => {
      const event = { tool_input: { file_path: 'C:\\project\\artifacts\\reviews/foo.md' } };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null);
    });

    it('allows project.yaml', () => {
      const event = { tool_input: { file_path: 'project.yaml' } };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null);
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
        /Delegate code\/artifact changes to a teammate via TeamCreate/);
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

    it('allows .claude/settings.local.json (new allow-list entry)', () => {
      const event = { tool_input: { file_path: '.claude/settings.local.json' } };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null,
        'settings.local.json is a legitimate orchestrator write (ADR-003 §3.5)');
    });

    it('allows settings.local.json on Windows mixed separators', () => {
      const event = { tool_input: { file_path: 'C:\\proj\\.claude/settings.local.json' } };
      const result = runHook('orchestrator-write-gate.cjs', {
        stdin: JSON.stringify(event),
        env: { AGENT_ROLE: 'orchestrator' },
      });
      assert.equal(result.decision, null);
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
