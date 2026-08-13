import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseYaml,
  loadReplayConfig,
  tokenizeCommand,
  commandAllowed,
  confinedResolve,
  evaluateBundle,
  DEFAULT_REPLAY_CONFIG,
} from '../utils/evidence.js';
import { loadSwarmConfig } from '../utils/config.js';

// The Tier-0 evidence engine is the trust anchor of the whole reinvention
// (verification-as-product §8): its correctness must not depend on an LLM. These
// unit tests exercise the constrained YAML reader, the allow-list, the path
// confinement, and every check kind against a scaffold-shaped temp repo.

describe('evidence: constrained YAML reader', () => {
  it('parses a block map with scalars of every type', () => {
    const v = parseYaml([
      'artifact: artifacts/story-1.md',
      'produced_by: developer',
      'count: 3',
      'ratio: 0.5',
      'flag: true',
      'nothing: null',
    ].join('\n'));
    assert.deepEqual(v, {
      artifact: 'artifacts/story-1.md',
      produced_by: 'developer',
      count: 3,
      ratio: 0.5,
      flag: true,
      nothing: null,
    });
  });

  it('parses a block sequence of inline block-maps with continuation keys', () => {
    const v = parseYaml([
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: file-exists',
      '      paths: [src/a.js, src/b.js]',
      '    - id: E-2',
      '      kind: test-run',
      '      cmd: "npm test"',
      '      expect: {exit: 0}',
    ].join('\n'));
    assert.equal(v.evidence_bundle.items.length, 2);
    assert.deepEqual(v.evidence_bundle.items[0], { id: 'E-1', kind: 'file-exists', paths: ['src/a.js', 'src/b.js'] });
    assert.deepEqual(v.evidence_bundle.items[1], { id: 'E-2', kind: 'test-run', cmd: 'npm test', expect: { exit: 0 } });
  });

  it('parses a flow sequence of flow maps', () => {
    const v = parseYaml('items: [{id: E-1, kind: assumed}, {id: E-2, kind: citation}]');
    assert.deepEqual(v.items, [{ id: 'E-1', kind: 'assumed' }, { id: 'E-2', kind: 'citation' }]);
  });

  it('parses a same-indent sequence under a key', () => {
    const v = parseYaml(['items:', '- a', '- b'].join('\n'));
    assert.deepEqual(v.items, ['a', 'b']);
  });

  it('honors quotes and strips line comments outside quotes', () => {
    const v = parseYaml([
      'a: "value # not a comment"   # real comment',
      "b: 'it''s quoted'",
    ].join('\n'));
    assert.equal(v.a, 'value # not a comment');
    assert.equal(v.b, "it's quoted");
  });

  it('throws on an unsupported block scalar rather than misreading', () => {
    assert.throws(() => parseYaml(['body: |', '  multi', '  line'].join('\n')), /block scalar/);
  });
});

describe('evidence: command allow-list + tokenizer', () => {
  it('matches the allow-list on EXACT tokens, not loose string prefix', () => {
    const allowed = ['npm test', 'npm run test'];
    assert.equal(commandAllowed('npm test', allowed), true);
    assert.equal(commandAllowed('npm test --watch', allowed), true, 'trailing args allowed');
    assert.equal(commandAllowed('npm run test', allowed), true);
    assert.equal(commandAllowed('rm -rf /', allowed), false);
    assert.equal(commandAllowed('node evil.js', allowed), false);
    // The loose-prefix bug the review found: `npm testfoo` must NOT match `npm test`.
    assert.equal(commandAllowed('npm testfoo', allowed), false);
    // A token-prefix entry matches deeper tokens; equality is per-token.
    assert.equal(commandAllowed('npm run test:unit', ['npm run']), true);
    assert.equal(commandAllowed('npm run test:unit', ['npm run test']), false, 'test !== test:unit');
  });

  it('tokenizes respecting quotes, no shell interpretation', () => {
    assert.deepEqual(tokenizeCommand('npm test'), ['npm', 'test']);
    assert.deepEqual(tokenizeCommand('node -e "a b"'), ['node', '-e', 'a b']);
  });
});

describe('evidence: path confinement (F-017)', () => {
  it('rejects traversal and absolute escapes', () => {
    const root = '/repo';
    assert.equal(confinedResolve('../etc/passwd', root), null);
    assert.equal(confinedResolve('a/../../b', root), null);
    assert.equal(confinedResolve('/etc/passwd', root), null);
    assert.equal(confinedResolve('src/a.js', root), '/repo/src/a.js');
  });
});

describe('evidence: config loading', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ev-cfg-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('returns safe defaults when swarm.yaml is absent', () => {
    const cfg = loadReplayConfig(join(dir, 'nope.yaml'));
    assert.deepEqual(cfg.allowed_commands, DEFAULT_REPLAY_CONFIG.allowed_commands);
  });

  it('reads the replay block over defaults', () => {
    const p = join(dir, 'swarm.yaml');
    writeFileSync(p, [
      'project:',
      '  name: x',
      'replay:',
      '  allowed_commands: ["npm test", "pytest"]',
      '  timeout_seconds: 120',
      '  url_citations: skip',
    ].join('\n'));
    const cfg = loadReplayConfig(p);
    assert.deepEqual(cfg.allowed_commands, ['npm test', 'pytest']);
    assert.equal(cfg.timeout_seconds, 120);
    assert.equal(cfg.url_citations, 'skip');
  });
});

describe('evidence: config drift (L-003 — the engine cannot import package code)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ev-drift-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('utils/config.js replay defaults match the engine DEFAULT_REPLAY_CONFIG', () => {
    const p = join(dir, 'swarm.yaml');
    writeFileSync(p, 'project:\n  name: drift\n');
    const cfg = loadSwarmConfig(p).replay;
    assert.deepEqual(cfg.allowed_commands, DEFAULT_REPLAY_CONFIG.allowed_commands);
    assert.equal(cfg.timeout_seconds, DEFAULT_REPLAY_CONFIG.timeout_seconds);
    assert.equal(cfg.url_citations, DEFAULT_REPLAY_CONFIG.url_citations);
    assert.deepEqual(cfg.gated_task_classes, DEFAULT_REPLAY_CONFIG.gated_task_classes);
    assert.equal(cfg.gated_owner_pattern, DEFAULT_REPLAY_CONFIG.gated_owner_pattern);
  });
});

describe('evidence: evaluateBundle', () => {
  let repo;
  before(() => {
    repo = mkdtempSync(join(tmpdir(), 'ev-repo-'));
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'a.js'), 'export const a = 1;\n');
    writeFileSync(join(repo, 'cite.md'), 'l1\nl2\nl3\n');
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  function writeBundle(name, obj) {
    const p = join(repo, name);
    writeFileSync(p, obj);
    return p;
  }

  it('passes when every declared evidence item is satisfied', () => {
    const p = writeBundle('good.evidence.yaml', [
      'evidence_bundle:',
      '  artifact: artifacts/story-1.md',
      '  items:',
      '    - id: E-1',
      '      kind: file-exists',
      '      paths: [src/a.js]',
      '    - id: E-2',
      '      kind: citation',
      '      ref: "cite.md:2"',
      '    - id: E-3',
      '      kind: fixture-provenance',
      '      fixture: src/a.js',
      '      synthetic: true',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: DEFAULT_REPLAY_CONFIG });
    assert.equal(v.ok, true, JSON.stringify(v, null, 2));
    assert.equal(v.firstFailure, null);
  });

  it('BLOCKS when a file-exists path is fabricated (the Vantage class)', () => {
    const p = writeBundle('fab.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: file-exists',
      '      paths: [src/does-not-exist.js]',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: DEFAULT_REPLAY_CONFIG });
    assert.equal(v.ok, false);
    assert.equal(v.firstFailure.kind, 'file-exists');
    assert.match(v.firstFailure.reason, /does not exist/);
  });

  it('REFUSES (does not execute) a command not on the allow-list', () => {
    const p = writeBundle('cmd.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: command',
      '      cmd: "node -e process.exit(0)"',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: { ...DEFAULT_REPLAY_CONFIG, allowed_commands: ['npm test'] } });
    assert.equal(v.ok, false);
    assert.match(v.firstFailure.reason, /allow-list; NOT executed/);
  });

  it('runs an allow-listed command and checks its exit code', () => {
    const p = writeBundle('run.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: command',
      '      cmd: "node -e process.exit(0)"',
      '      expect: {exit: 0}',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: { ...DEFAULT_REPLAY_CONFIG, allowed_commands: ['node -e'] } });
    assert.equal(v.ok, true, JSON.stringify(v.checks));
  });

  it('BLOCKS when an allow-listed command exits non-zero', () => {
    const p = writeBundle('runfail.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: command',
      '      cmd: "node -e process.exit(3)"',
      '      expect: {exit: 0}',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: { ...DEFAULT_REPLAY_CONFIG, allowed_commands: ['node -e'] } });
    assert.equal(v.ok, false);
    assert.match(v.firstFailure.reason, /exit 3 != expected 0/);
  });

  it('BLOCKS a fixture-provenance item declaring neither captured_from nor synthetic', () => {
    const p = writeBundle('fix.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: fixture-provenance',
      '      fixture: src/a.js',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: DEFAULT_REPLAY_CONFIG });
    assert.equal(v.ok, false);
    assert.match(v.firstFailure.reason, /EXACTLY ONE/);
  });

  it('BLOCKS a citation pointing past EOF', () => {
    const p = writeBundle('badcite.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: citation',
      '      ref: "cite.md:99"',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: DEFAULT_REPLAY_CONFIG });
    assert.equal(v.ok, false);
    assert.match(v.firstFailure.reason, /past EOF/);
  });

  it('BLOCKS a missing bundle with an actionable message', () => {
    const v = evaluateBundle(join(repo, 'nope.evidence.yaml'), { projectRoot: repo, config: DEFAULT_REPLAY_CONFIG });
    assert.equal(v.ok, false);
    assert.match(v.error, /not found/);
  });

  it('runs cheap file-exists BEFORE executing commands (fabricated path short-circuits)', () => {
    const p = writeBundle('order.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-cmd',
      '      kind: command',
      '      cmd: "node -e process.exit(0)"',
      '    - id: E-file',
      '      kind: file-exists',
      '      paths: [src/ghost.js]',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: { ...DEFAULT_REPLAY_CONFIG, allowed_commands: ['node -e'] } });
    assert.equal(v.ok, false);
    // file-exists is priority 1, so it is the first failure even though it is
    // declared second — the existence pre-pass runs before any exec.
    assert.equal(v.firstFailure.id, 'E-file');
  });

  it('BLOCKS a forged expect.exit — success is exit 0, the bundle cannot declare its own pass code', () => {
    const p = writeBundle('forge.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: command',
      '      cmd: "node -e process.exit(1)"',
      '      expect: {exit: 1}',       // a failing suite tries to declare 1 as "pass"
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: { ...DEFAULT_REPLAY_CONFIG, allowed_commands: ['node -e'] } });
    assert.equal(v.ok, false, 'attacker-supplied expect.exit must be ignored');
    assert.match(v.firstFailure.reason, /exit 1 != expected 0/);
  });

  it('BLOCKS an empty bundle (items: []) — proves nothing', () => {
    const p = writeBundle('empty.evidence.yaml', [
      'evidence_bundle:',
      '  items: []',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: DEFAULT_REPLAY_CONFIG });
    assert.equal(v.ok, false);
    assert.match(v.error, /no items|empty bundle/i);
  });

  it('BLOCKS a bundle whose path is outside the repo (no /tmp self-satisfying)', () => {
    // An absolute path outside projectRoot must be refused, not resolved.
    const v = evaluateBundle('/tmp/foreign.evidence.yaml', { projectRoot: repo, config: DEFAULT_REPLAY_CONFIG });
    assert.equal(v.ok, false);
    assert.match(v.error, /escapes the repo|not found/);
  });

  it('with requireExecutable, BLOCKS a story bundle that has no test-run/command item (green-check theater)', () => {
    const p = writeBundle('static.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: file-exists',
      '      paths: [src/a.js]',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: DEFAULT_REPLAY_CONFIG, requireExecutable: true });
    assert.equal(v.ok, false);
    assert.match(v.firstFailure.reason, /at least one test-run\/command/);
  });

  it('rejects prototype-polluting keys in a crafted bundle', () => {
    const p = writeBundle('proto.evidence.yaml', [
      'evidence_bundle:',
      '  items: [{id: E-1, kind: file-exists, __proto__: {polluted: true}}]',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: DEFAULT_REPLAY_CONFIG });
    assert.equal(v.ok, false);
    assert.match(v.error, /parse|dangerous key/i);
    assert.equal(({}).polluted, undefined, 'global Object prototype not polluted');
  });

  it('treats an empty reviewer_addendum as advisory, never a block', () => {
    const p = writeBundle('rev.evidence.yaml', [
      'evidence_bundle:',
      '  items:',
      '    - id: E-1',
      '      kind: file-exists',
      '      paths: [src/a.js]',
      '  reviewer_addendum:',
      '    failure_scenarios_attempted: []',
    ].join('\n'));
    const v = evaluateBundle(p, { projectRoot: repo, config: DEFAULT_REPLAY_CONFIG });
    assert.equal(v.ok, true);
    const addendum = v.checks.find((c) => c.id === 'reviewer_addendum');
    assert.equal(addendum.result, 'advisory');
  });
});
