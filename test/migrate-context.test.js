import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseFindings, LESSON_RECORDS, buildLedger, migrate } from '../scripts/migrate-context-files.js';
import { validateEnvelope } from '../utils/record-envelope.js';

// A checked-in snapshot of the real findings-register.md is the golden input
// (phase2 §4.1 "golden-file test against a copy of the real
// findings-register.md"). A fixture COPY is used, not the live file, because the
// migration's job is to replace the live file with a pointer stub — coupling the
// test to the live file would make it self-destruct on first migration.
const REAL_FINDINGS = fileURLToPath(new URL('./fixtures/findings-register.golden.md', import.meta.url));

describe('migrate-context-files: findings parser', () => {
  const md = readFileSync(REAL_FINDINGS, 'utf8');
  const records = parseFindings(md);

  it('parses every F-NNN entry in the register (24 findings)', () => {
    assert.equal(records.length, 24);
    // The `## F-NNN — <format legend>` example line must NOT be parsed as a record.
    assert.ok(!records.some((r) => r.id === 'F-NNN'));
  });

  it('preserves each finding ID and produces a valid envelope', () => {
    for (const r of records) {
      assert.match(r.id, /^F-\d+$/);
      assert.deepEqual(validateEnvelope(r), [], `${r.id}: ${validateEnvelope(r).join('; ')}`);
    }
  });

  it('preserves provenance (date, role) and carries decision-trail as occurrences', () => {
    const f1 = records.find((r) => r.id === 'F-001');
    assert.equal(f1.provenance.role, 'reviewer');
    assert.equal(f1.provenance.date, '2026-04-29');
    assert.ok(Array.isArray(f1.provenance.occurrences) && f1.provenance.occurrences.length >= 1);
  });

  it('extracts referenced D-IDs into links', () => {
    const f3 = records.find((r) => r.id === 'F-003');
    assert.ok(f3.links.d_ids.includes('D-012'));
  });
});

describe('migrate-context-files: lessons', () => {
  it('emits fingerprinted L-records, all valid, with the synthetic-fixture lesson as L-001/recurring', () => {
    for (const r of LESSON_RECORDS) assert.deepEqual(validateEnvelope(r), [], `${r.id}: ${validateEnvelope(r).join('; ')}`);
    const l1 = LESSON_RECORDS.find((r) => r.id === 'L-001');
    assert.equal(l1.fingerprint, 'synthetic-fixture-masks-real-data');
    assert.equal(l1.status, 'recurring');
    // patterns documented across >=2 epics enter at recurring
    const race = LESSON_RECORDS.find((r) => r.fingerprint === 'race-replay-across-session-restart');
    assert.equal(race.status, 'recurring');
    assert.ok(race.provenance.occurrences.length >= 2);
  });
});

describe('migrate-context-files: full migration', () => {
  let ctx;
  before(() => {
    ctx = mkdtempSync(join(tmpdir(), 'migrate-'));
    writeFileSync(join(ctx, 'findings-register.md'), readFileSync(REAL_FINDINGS, 'utf8'));
    writeFileSync(join(ctx, 'lessons-learned.md'), '# Lessons Learned\n\nsome prose\n');
  });
  after(() => { rmSync(ctx, { recursive: true, force: true }); });

  it('writes ledger.md with 24 F + 4 L records and replaces originals with stubs', () => {
    const res = migrate({ contextDir: ctx });
    assert.deepEqual(res.errors, []);
    assert.equal(res.findings, 24);
    assert.equal(res.lessons, 4);

    const ledger = readFileSync(join(ctx, 'ledger.md'), 'utf8');
    assert.equal((ledger.match(/^## F-\d+ —/gm) || []).length, 24);
    assert.equal((ledger.match(/^## L-\d+ —/gm) || []).length, 4);

    // originals become pointer stubs (five-file cap: content now lives in ledger)
    assert.match(readFileSync(join(ctx, 'findings-register.md'), 'utf8'), /migrated into `artifacts\/context\/ledger\.md`/);
    assert.match(readFileSync(join(ctx, 'lessons-learned.md'), 'utf8'), /migrated into `artifacts\/context\/ledger\.md`/);
  });

  it('is idempotent — a second run yields byte-identical ledger.md', () => {
    const first = readFileSync(join(ctx, 'ledger.md'), 'utf8');
    migrate({ contextDir: ctx });
    assert.equal(readFileSync(join(ctx, 'ledger.md'), 'utf8'), first);
  });

  it('buildLedger orders F-records numerically then L-records', () => {
    const out = buildLedger(
      [{ id: 'F-10', type: 'finding', status: 'open', fingerprint: 'a', title: 'ten', provenance: { role: 'r', project: 'p', date: '2026-01-01', occurrences: [] }, evidence: [], links: {}, body: 'b' },
       { id: 'F-2', type: 'finding', status: 'open', fingerprint: 'b', title: 'two', provenance: { role: 'r', project: 'p', date: '2026-01-01', occurrences: [] }, evidence: [], links: {}, body: 'b' }],
      [{ id: 'L-1', type: 'lesson', status: 'observed', fingerprint: 'c', title: 'one', provenance: { role: 'r', project: 'p', date: '2026-01-01', occurrences: [] }, evidence: [], links: {}, body: 'b' }],
    );
    assert.ok(out.indexOf('## F-2 —') < out.indexOf('## F-10 —'));
    assert.ok(out.indexOf('## F-10 —') < out.indexOf('## L-1 —'));
  });
});
