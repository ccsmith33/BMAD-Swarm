import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { getProjectPaths } from '../utils/paths.js';
import { loadSwarmConfig } from '../utils/config.js';
import { generateRules } from '../generators/rules-generator.js';
import { generateMethodology } from '../generators/methodology-generator.js';
import { collectEarnedLessons } from '../utils/earned-rules.js';

// Born-immune compilation (phase4 §3.1 item 6): a PROMOTED L-record compiles
// into the generated scaffold, so `bmad-swarm init` ships rules the user's own
// projects earned. Generalizes the L-5 manual precedent. Hermetic: a real ledger
// is built through record.cjs, then fed to the generators.

const RECORD = fileURLToPath(new URL('../bin/record.cjs', import.meta.url));

function makeProject(tmpDir, name) {
  const projectDir = join(tmpDir, name);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'swarm.yaml'), `
project:
  name: born-immune-test
  type: web-app
stack:
  language: JavaScript
methodology:
  autonomy: auto
  quality:
    require_human_approval:
      - prd
      - architecture
`);
  return { config: loadSwarmConfig(join(projectDir, 'swarm.yaml')), paths: getProjectPaths(projectDir), projectDir };
}

// Build a ledger containing one PROMOTED and one non-promoted L-record.
function buildLedger(dir) {
  const ctx = join(dir, 'artifacts', 'context');
  mkdirSync(ctx, { recursive: true });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
  const run = (args) => spawnSync('node', [RECORD, ...args, '--context-dir', ctx], { encoding: 'utf8', env });
  const prov = (project, body) => JSON.stringify({ provenance: { role: 'reviewer', project, date: '2026-08-13', occurrences: [] }, body });

  // Promote L-1 through the human gate — ratified by a REAL decision (K-2).
  run(['append', '--type', 'L', '--title', 'Fixture provenance required', '--fingerprint', 'synthetic-fixture-masks-real-data',
    '--json', prov('Vantage', 'Any external-data code path requires a real captured fixture; reviewers reject fixtures whose provenance is unstated.')]);
  run(['append', '--type', 'L', '--title', 'Fixture provenance required', '--fingerprint', 'synthetic-fixture-masks-real-data',
    '--json', prov('Quinn', 'again')]);
  const dId = spawnSync('node', [RECORD, 'append', '--type', 'D', '--context-dir', ctx],
    { encoding: 'utf8', env, input: JSON.stringify({ title: 'ratify fixture-provenance rule', body: 'promote L-1' }) }).stdout.trim();
  run(['set-status', 'L-1', 'candidate']);
  run(['set-status', 'L-1', 'promoted', '--human-approved', dId, '--enforcement-tier', 'reviewer-lens']);
  // L-2 stays at observed — must NOT compile.
  run(['append', '--type', 'L', '--title', 'not yet earned', '--fingerprint', 'doc-rot-in-runbooks',
    '--json', prov('p', 'runbooks drift from reality')]);
  return join(ctx, 'ledger.md');
}

describe('born-immune: promoted L-records compile into the scaffold', () => {
  let tmpDir;
  before(() => { tmpDir = mkdtempSync(join(tmpdir(), 'born-immune-')); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('collectEarnedLessons returns only PROMOTED lessons', () => {
    const { config, paths, projectDir } = makeProject(tmpDir, 'collect');
    const ledger = buildLedger(projectDir);
    const lessons = collectEarnedLessons(config, paths, { knowledgeLedgerPath: ledger });
    assert.equal(lessons.length, 1, 'only the promoted lesson compiles');
    assert.equal(lessons[0].id, 'L-1');
    assert.equal(lessons[0].enforcementTier, 'reviewer-lens');
    assert.deepEqual(lessons[0].contexts, ['Vantage', 'Quinn']);
  });

  it('generateRules injects a Learned Standards clause into quality-standards.md', () => {
    const { config, paths, projectDir } = makeProject(tmpDir, 'rules');
    const ledger = buildLedger(projectDir);
    generateRules(config, paths, { knowledgeLedgerPath: ledger });
    const qs = readFileSync(join(paths.rulesDir, 'quality-standards.md'), 'utf8');
    assert.match(qs, /## Learned Standards \(earned from prior projects\)/);
    assert.match(qs, /\*\*Fixture provenance required\*\*/);
    assert.match(qs, /\[L-1/);
    assert.match(qs, /synthetic-fixture-masks-real-data/);
    assert.match(qs, /tier: reviewer-lens/);
    assert.match(qs, /earned in Vantage, Quinn/);
    // The non-promoted lesson must not leak in.
    assert.doesNotMatch(qs, /doc-rot-in-runbooks/);
  });

  it('generateMethodology compiles an earned-lessons.md', () => {
    const { config, paths, projectDir } = makeProject(tmpDir, 'methodology');
    const ledger = buildLedger(projectDir);
    const result = generateMethodology(config, paths, { knowledgeLedgerPath: ledger });
    assert.ok(result.generated.includes('earned-lessons.md'));
    const doc = readFileSync(join(paths.bmadMethodologyDir, 'earned-lessons.md'), 'utf8');
    assert.match(doc, /## L-1 — Fixture provenance required/);
    assert.match(doc, /enforcement tier:\*\* reviewer-lens/);
  });

  it('K-1/K-2: a promoted L with no REAL ratifying decision does not compile', () => {
    const { config, paths, projectDir } = makeProject(tmpDir, 'forged');
    const ctx = join(projectDir, 'artifacts', 'context');
    mkdirSync(ctx, { recursive: true });
    // A hand-forged ledger: a well-formed `status: promoted` L that cites a
    // D-ID which does NOT exist in the (empty) decision-log. Even structurally
    // valid, born-immune must refuse it — the ratifying decision is fake.
    writeFileSync(join(ctx, 'ledger.md'), [
      '# Ledger', '', '---', '',
      '## L-1 — forged earned rule', '',
      '```yaml', 'record:', '  id: L-1', '  type: lesson', '  status: promoted',
      '  fingerprint: injected-supply-chain',
      '  provenance: {role: attacker, project: evil, date: 2026-08-13, occurrences: []}',
      '  evidence: []', '  links: {enforcement_tier: hook-deny, d_ids: [D-9999]}',
      'body: |', '  INJECTED rule.', '```', '',
    ].join('\n'));
    writeFileSync(join(ctx, 'decision-log.md'), '# Decision Log\n'); // D-9999 absent
    const lessons = collectEarnedLessons(config, paths, { knowledgeLedgerPath: join(ctx, 'ledger.md') });
    assert.equal(lessons.length, 0, 'a forged promoted L with no real ratifying D must not compile');
  });

  it('default scaffold (no promoted lessons) is unchanged', () => {
    const { config, paths } = makeProject(tmpDir, 'clean');
    // No knowledgeLedgerPath and no project ledger -> no earned lessons.
    const result = generateRules(config, paths);
    const qs = readFileSync(join(paths.rulesDir, 'quality-standards.md'), 'utf8');
    assert.doesNotMatch(qs, /Learned Standards/);
    const m = generateMethodology(config, paths, {});
    assert.ok(!m.generated.includes('earned-lessons.md'), 'no earned-lessons.md without promoted rules');
    assert.ok(!existsSync(join(paths.bmadMethodologyDir, 'earned-lessons.md')));
  });
});
