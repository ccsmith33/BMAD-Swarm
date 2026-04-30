import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import yaml from 'js-yaml';
import { runScaffoldTeam, unifiedDiff } from '../cli/scaffold-team.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// RT-2: bmad-swarm scaffold-team CLI tests. Uses direct runScaffoldTeam()
// calls with _io and _cwd seams (faster than spawning the binary; AC14
// covered via a single spawn-help test).

const validArchitecture = [
  '# System Architecture',
  '',
  'Some prose here.',
  '',
  '## Domain Map',
  '',
  '| Domain | Description | Components | Anticipated stories |',
  '| --- | --- | --- | --- |',
  '| backend-auth | OAuth2 / sessions | `src/auth/*` | ~5 |',
  '| frontend-dashboard | React dashboard | `web/src/pages/*` | ~4 |',
  '| payments-api | Stripe integration | `src/payments/*` | ~3 |',
  '',
  '## Other section',
  '',
].join('\n');

const minimalSwarmYaml = [
  'project:',
  '  name: rt2-test',
  '  type: api',
  '',
  'methodology:',
  '  autonomy: auto',
  '',
].join('\n');

function makeIo() {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    log: (...args) => stdout.push(args.join(' ')),
    error: (...args) => stderr.push(args.join(' ')),
    out: () => stdout.join('\n'),
    err: () => stderr.join('\n'),
  };
}

async function callRun(opts, cwd) {
  const io = makeIo();
  let thrown = null;
  try {
    await runScaffoldTeam({ ...opts, _io: io, _cwd: cwd });
  } catch (e) {
    thrown = e;
  }
  return { io, thrown };
}

describe('scaffold-team CLI (RT-2)', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rt2-'));
    mkdirSync(join(tmp, 'artifacts', 'design'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeArch(text = validArchitecture, relPath = 'artifacts/design/architecture.md') {
    const p = join(tmp, relPath);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
    return p;
  }
  function writeSwarm(text = minimalSwarmYaml) {
    writeFileSync(join(tmp, 'swarm.yaml'), text);
  }

  // -------------------------------------------------------------------
  // AC1: print to stdout, do not modify swarm.yaml or create .bak
  // -------------------------------------------------------------------
  it('AC1: print path emits valid YAML team block, exits 0, does not write files', async () => {
    writeArch();
    writeSwarm();
    const { io, thrown } = await callRun({}, tmp);
    assert.equal(thrown, null);
    const out = io.out();
    assert.match(out, /^team:/m);
    // Parse the printed output back as YAML — must round-trip cleanly.
    const parsed = yaml.load(out);
    assert.equal(parsed.team.mode, 'fixed');
    assert.equal(parsed.team.specializations.length, 3);
    assert.equal(parsed.team.specializations[0].domain, 'backend-auth');
    assert.equal(parsed.team.specializations[1].domain, 'frontend-dashboard');
    assert.equal(parsed.team.specializations[2].domain, 'payments-api');
    // Source order preserved.
    // No mutation.
    assert.equal(readFileSync(join(tmp, 'swarm.yaml'), 'utf8'), minimalSwarmYaml);
    assert.equal(existsSync(join(tmp, 'swarm.yaml.bak')), false);
  });

  // -------------------------------------------------------------------
  // AC2: each spec carries domain, description; commented model line emitted
  // -------------------------------------------------------------------
  it('AC2: each row gets role/domain/description; # model: opus comment is emitted', async () => {
    writeArch();
    writeSwarm();
    const { io } = await callRun({}, tmp);
    const out = io.out();
    assert.match(out, /- role: developer/);
    assert.match(out, /domain: backend-auth/);
    assert.match(out, /description: OAuth2 \/ sessions/);
    assert.match(out, /# model: opus/);
  });

  // -------------------------------------------------------------------
  // AC3: defaults (mode: fixed, fallback.enabled: true, fallback.role: developer)
  // -------------------------------------------------------------------
  it('AC3: defaults to mode: fixed and fallback.enabled: true / role: developer', async () => {
    writeArch();
    writeSwarm();
    const { io } = await callRun({}, tmp);
    const parsed = yaml.load(io.out());
    assert.equal(parsed.team.mode, 'fixed');
    assert.equal(parsed.team.fallback.enabled, true);
    assert.equal(parsed.team.fallback.role, 'developer');
  });

  // -------------------------------------------------------------------
  // AC4: --no-fallback flips fallback.enabled to false
  // -------------------------------------------------------------------
  it('AC4: --no-fallback yields fallback.enabled: false', async () => {
    writeArch();
    writeSwarm();
    // commander sets options.fallback to false when --no-fallback is passed
    const { io } = await callRun({ fallback: false }, tmp);
    const parsed = yaml.load(io.out());
    assert.equal(parsed.team.fallback.enabled, false);
    assert.equal(parsed.team.fallback.role, 'developer');
  });

  // -------------------------------------------------------------------
  // AC5: --architecture <path> reads override path
  // -------------------------------------------------------------------
  it('AC5: --architecture <path> reads from the override path', async () => {
    // Default location intentionally has the WRONG content so we know the
    // override won.
    writeArch('## Domain Map\n\nNot a table — should not be parsed.\n');
    writeSwarm();
    const customPath = writeArch(validArchitecture, 'custom/arch.md');
    const { io, thrown } = await callRun({ architecture: customPath }, tmp);
    assert.equal(thrown, null, io.err());
    const parsed = yaml.load(io.out());
    assert.equal(parsed.team.specializations.length, 3);
  });

  // -------------------------------------------------------------------
  // AC6: --write injects the team block, creates .bak with pre-write content,
  //      loadSwarmConfig succeeds, success message names the backup
  // -------------------------------------------------------------------
  it('AC6: --write creates .bak, injects team block, validates, prints success', async () => {
    writeArch();
    writeSwarm();
    const before = readFileSync(join(tmp, 'swarm.yaml'), 'utf8');
    const { io, thrown } = await callRun({ write: true }, tmp);
    assert.equal(thrown, null, io.err());

    // .bak holds the pre-write content byte-for-byte.
    const bak = readFileSync(join(tmp, 'swarm.yaml.bak'), 'utf8');
    assert.equal(bak, before);

    // swarm.yaml now has a team: block.
    const after = readFileSync(join(tmp, 'swarm.yaml'), 'utf8');
    const parsed = yaml.load(after);
    assert.equal(parsed.team.mode, 'fixed');
    assert.equal(parsed.team.specializations.length, 3);
    assert.equal(parsed.project.name, 'rt2-test'); // existing keys preserved

    // Success message names the backup.
    assert.match(io.out(), /Backup:.*swarm\.yaml\.bak/);
    assert.match(io.out(), /Wrote 3 specialization/);
  });

  // -------------------------------------------------------------------
  // AC7: --write refuses if swarm.yaml already has team:, prints diff
  // -------------------------------------------------------------------
  it('AC7: --write refuses when team: block already exists, prints diff, no .bak', async () => {
    writeArch();
    writeSwarm([
      minimalSwarmYaml,
      'team:',
      '  mode: fixed',
      '  specializations:',
      '    - role: developer',
      '      domain: legacy-domain',
      '      description: existing',
      '  fallback:',
      '    enabled: true',
      '    role: developer',
    ].join('\n'));
    const before = readFileSync(join(tmp, 'swarm.yaml'), 'utf8');
    const { io, thrown } = await callRun({ write: true }, tmp);
    assert.ok(thrown, 'should throw to trigger exit 1');
    assert.match(thrown.message, /already has a team: block/);
    assert.match(io.err(), /already has a team: block/);
    assert.match(io.err(), /Diff/);
    assert.match(io.err(), /legacy-domain/);
    assert.match(io.err(), /backend-auth/);
    // No mutation, no .bak.
    assert.equal(readFileSync(join(tmp, 'swarm.yaml'), 'utf8'), before);
    assert.equal(existsSync(join(tmp, 'swarm.yaml.bak')), false);
  });

  // -------------------------------------------------------------------
  // AC8: refuse when architecture is missing
  // -------------------------------------------------------------------
  it('AC8: refuses with documented message when architecture is missing', async () => {
    writeSwarm();
    const { thrown } = await callRun({}, tmp);
    assert.ok(thrown);
    assert.match(thrown.message, /architecture not found/);
    assert.match(thrown.message, /\/feature|\/plan/);
  });

  // -------------------------------------------------------------------
  // AC9: refuse when Domain Map heading is missing
  // -------------------------------------------------------------------
  it('AC9: refuses with documented message when Domain Map is missing', async () => {
    writeArch('# Architecture\n\nNo domain map here.\n');
    writeSwarm();
    const { thrown } = await callRun({}, tmp);
    assert.ok(thrown);
    assert.match(thrown.message, /no Domain Map found/);
    assert.match(thrown.message, /\/retrofit-team/);
  });

  // -------------------------------------------------------------------
  // AC10: refuse when Domain Map is malformed (heading + prose)
  // -------------------------------------------------------------------
  it('AC10: refuses with line-numbered message when Domain Map is malformed', async () => {
    writeArch([
      '# Title',
      '',
      '## Domain Map',
      '',
      'Just prose here, no table at all.',
      '',
    ].join('\n'));
    writeSwarm();
    const { thrown } = await callRun({}, tmp);
    assert.ok(thrown);
    assert.match(thrown.message, /missing the table header/);
    assert.match(thrown.message, /line 3/);
  });

  it('AC10: refuses with row-line numbers when slugs are invalid', async () => {
    writeArch([
      '## Domain Map',
      '',
      '| Domain | Description |',
      '| --- | --- |',
      '| Backend Auth | bad slug |',
    ].join('\n'));
    writeSwarm();
    const { thrown } = await callRun({}, tmp);
    assert.ok(thrown);
    assert.match(thrown.message, /invalid domain slug/);
    assert.match(thrown.message, /line 5/);
  });

  // -------------------------------------------------------------------
  // AC11: refuse when --write and swarm.yaml is missing
  // -------------------------------------------------------------------
  it('AC11: --write refuses with documented message when swarm.yaml is missing', async () => {
    writeArch();
    // Note: NO swarm.yaml.
    const { thrown } = await callRun({ write: true }, tmp);
    assert.ok(thrown);
    assert.match(thrown.message, /no swarm\.yaml found/);
    assert.match(thrown.message, /bmad-swarm init/);
  });

  // -------------------------------------------------------------------
  // AC12: post-write validation failure restores from .bak (uses _emitOverride seam)
  // -------------------------------------------------------------------
  it('AC12: post-write validation failure restores swarm.yaml from .bak and exits 1', async () => {
    writeArch();
    writeSwarm();
    const before = readFileSync(join(tmp, 'swarm.yaml'), 'utf8');

    // Force a post-write validation failure via the _emitOverride seam:
    // emit a swarm.yaml whose project.type is invalid (validator rejects).
    // The .bak is written before this emit, so the restore-from-bak
    // branch must run.
    const { io, thrown } = await callRun({
      write: true,
      _emitOverride: () => 'project:\n  name: x\n  type: NOT_A_VALID_TYPE\n',
    }, tmp);

    assert.ok(thrown, 'should throw');
    assert.match(thrown.message, /post-write validation failed/);
    // Validator error surfaced to stderr.
    assert.match(io.err(), /Post-write validation failed/);
    assert.match(io.err(), /Restored swarm\.yaml from/);
    // swarm.yaml on disk equals the pre-write content (restore worked).
    const after = readFileSync(join(tmp, 'swarm.yaml'), 'utf8');
    assert.equal(after, before, 'restore-from-bak must yield the pre-write content byte-for-byte');
    // .bak is still present after restore.
    assert.ok(existsSync(join(tmp, 'swarm.yaml.bak')));
  });

  it('AC12: success-path round-trip still validates and leaves both files loadable', async () => {
    writeArch();
    writeSwarm();
    const { thrown } = await callRun({ write: true }, tmp);
    assert.equal(thrown, null);
    assert.doesNotThrow(() => yaml.load(readFileSync(join(tmp, 'swarm.yaml'), 'utf8')));
    assert.doesNotThrow(() => yaml.load(readFileSync(join(tmp, 'swarm.yaml.bak'), 'utf8')));
  });

  // -------------------------------------------------------------------
  // AC13: atomic-replace — implementation uses tmp+rename, verified by
  // confirming no .tmp file is left behind on success
  // -------------------------------------------------------------------
  it('AC13: --write leaves no .tmp file on success (tmp+rename completed)', async () => {
    writeArch();
    writeSwarm();
    const { thrown } = await callRun({ write: true }, tmp);
    assert.equal(thrown, null);
    assert.equal(existsSync(join(tmp, 'swarm.yaml.tmp')), false,
      'tmp file should have been renamed away');
  });

  it('AC13: --write recovers from a stale .tmp left over from a prior crash', async () => {
    writeArch();
    writeSwarm();
    // Simulate a prior crashed run: stale .tmp file in the way.
    writeFileSync(join(tmp, 'swarm.yaml.tmp'), 'leftover from crashed run');
    const { thrown } = await callRun({ write: true }, tmp);
    assert.equal(thrown, null);
    // Stale .tmp must have been cleaned up; new write succeeded.
    assert.equal(existsSync(join(tmp, 'swarm.yaml.tmp')), false);
    const after = yaml.load(readFileSync(join(tmp, 'swarm.yaml'), 'utf8'));
    assert.equal(after.team.specializations.length, 3);
  });

  // -------------------------------------------------------------------
  // AC14: --help text describes all flags + examples (spawn one real CLI invocation)
  // -------------------------------------------------------------------
  it('AC14: --help describes --write, --architecture, --no-fallback with examples', () => {
    const result = spawnSync('node', [join(REPO_ROOT, 'bin', 'bmad-swarm.js'), 'scaffold-team', '--help'], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    const out = result.stdout;
    assert.match(out, /--write/);
    assert.match(out, /--architecture/);
    assert.match(out, /--no-fallback/);
    assert.match(out, /Examples:/);
    assert.match(out, /Print the team: block to stdout/);
    assert.match(out, /Back up swarm\.yaml/);
  });

  // -------------------------------------------------------------------
  // unifiedDiff helper — quick sanity check
  // -------------------------------------------------------------------
  it('unifiedDiff produces a +/-/space-prefixed diff with --- / +++ headers', () => {
    const a = 'one\ntwo\nthree';
    const b = 'one\nTWO\nthree';
    const d = unifiedDiff(a, b, 'a', 'b');
    assert.match(d, /^--- a\n\+\+\+ b\n/);
    assert.match(d, /^-two$/m);
    assert.match(d, /^\+TWO$/m);
    assert.match(d, /^ one$/m);
    assert.match(d, /^ three$/m);
  });

  // -------------------------------------------------------------------
  // Trailing reviewer hint (Story Dev Notes)
  // -------------------------------------------------------------------
  it('print path appends reviewer-hint comment block; --write does NOT include it', async () => {
    writeArch();
    writeSwarm();
    const { io: printIo } = await callRun({}, tmp);
    assert.match(printIo.out(), /role: reviewer/);

    const { io: writeIo } = await callRun({ write: true }, tmp);
    // The success message printed to stdout must not include the reviewer hint.
    assert.doesNotMatch(writeIo.out(), /role: reviewer/);
    // And the on-disk swarm.yaml must not include the hint either.
    const written = readFileSync(join(tmp, 'swarm.yaml'), 'utf8');
    assert.doesNotMatch(written, /role: reviewer/);
  });

  // -------------------------------------------------------------------
  // Source order preservation
  // -------------------------------------------------------------------
  it('specializations are emitted in source order matching Domain Map row order', async () => {
    writeArch([
      '## Domain Map',
      '',
      '| Domain | Description |',
      '| --- | --- |',
      '| zeta-feature | last alphabetically, first in source |',
      '| alpha-core | first alphabetically, second in source |',
      '| middle-thing | middle |',
    ].join('\n'));
    writeSwarm();
    const { io } = await callRun({}, tmp);
    const parsed = yaml.load(io.out());
    assert.deepEqual(
      parsed.team.specializations.map(s => s.domain),
      ['zeta-feature', 'alpha-core', 'middle-thing'],
    );
  });

  // -------------------------------------------------------------------
  // Pre-existing invalid swarm.yaml: --write refuses cleanly
  // -------------------------------------------------------------------
  it('--write surfaces a clear error when pre-existing swarm.yaml is invalid', async () => {
    writeArch();
    writeFileSync(join(tmp, 'swarm.yaml'), 'project:\n  name: bad\nmethodology:\n  autonomy: NOT_A_LEVEL\n');
    const { thrown } = await callRun({ write: true }, tmp);
    assert.ok(thrown);
    assert.match(thrown.message, /swarm\.yaml is invalid/);
  });
});
