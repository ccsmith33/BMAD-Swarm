import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  checkClaimsTable,
  checkConditionalPatterns,
  validateArtifacts,
} from '../utils/artifact-validator.js';

// Build a footer claims table from rows [{cid, claim, status, backing}].
function table(rows) {
  const head = '| C-ID | Claim | Status | Backing |\n|------|-------|--------|---------|\n';
  const body = rows
    .map((r) => `| ${r.cid} | ${r.claim} | ${r.status} | ${r.backing} |`)
    .join('\n');
  return `${head}${body}\n`;
}

const okRow = (cid, status = 'cited', backing = 'E-1') => ({ cid, claim: 'a load-bearing thing', status, backing });
const checkedRow = (cid, backing = 'E-1 @ commit ab12ef1 — src/x.js') => ({ cid, claim: 'a checked thing', status: 'checked', backing });

function warn(content) {
  const w = [];
  checkClaimsTable(content, w);
  return w;
}

describe('Claims-table lint (advisory)', () => {
  it('a within-budget, well-formed table produces no warnings', () => {
    const content = `# Doc\n\n${table([
      checkedRow('C-1'),
      okRow('C-2', 'cited'),
      okRow('C-3', 'attested'),
      okRow('C-4', 'assumed'),
      checkedRow('C-5'),
    ])}`;
    assert.deepEqual(warn(content), []);
  });

  it('warns when the table is OVER the 3–7 budget', () => {
    const rows = [];
    for (let i = 1; i <= 8; i++) rows.push(okRow(`C-${i}`, 'assumed'));
    const w = warn(`# Doc\n${table(rows)}`);
    assert.ok(w.some((m) => /8 claims exceed the 3–7 budget/.test(m)), JSON.stringify(w));
  });

  it('warns when the table is UNDER the 3–7 budget', () => {
    const w = warn(`# Doc\n${table([okRow('C-1'), okRow('C-2')])}`);
    assert.ok(w.some((m) => /below the 3–7 budget/.test(m)), JSON.stringify(w));
  });

  it('warns on an out-of-vocabulary status (unstatused)', () => {
    const w = warn(`# Doc\n${table([okRow('C-1'), okRow('C-2'), okRow('C-3', 'verified')])}`);
    assert.ok(w.some((m) => /C-3 has unknown status 'verified'/.test(m)), JSON.stringify(w));
  });

  it("warns when a 'checked' claim pins no commit", () => {
    const w = warn(`# Doc\n${table([
      { cid: 'C-1', claim: 'x', status: 'checked', backing: 'E-1 (no commit here)' },
      okRow('C-2'),
      okRow('C-3'),
    ])}`);
    assert.ok(w.some((m) => /C-1 is 'checked' but its Backing pins no commit/.test(m)), JSON.stringify(w));
  });

  it('warns on a duplicate C-ID', () => {
    const w = warn(`# Doc\n${table([okRow('C-1'), okRow('C-1'), okRow('C-2')])}`);
    assert.ok(w.some((m) => /duplicate C-1/.test(m)), JSON.stringify(w));
  });

  it('warns on an inline [C-NNN] marker with no table row', () => {
    const content = `# Doc\n\nThis rests on an assertion [C-9].\n\n${table([okRow('C-1'), okRow('C-2'), okRow('C-3')])}`;
    const w = warn(content);
    assert.ok(w.some((m) => /C-9 is referenced inline but absent/.test(m)), JSON.stringify(w));
  });

  it('warns on inline markers with no table at all', () => {
    const w = warn('# Doc\n\nAn assertion [C-1] and another [C-2] with no table.\n');
    assert.ok(w.some((m) => /inline C-ID marker\(s\) but no claims table/.test(m)), JSON.stringify(w));
  });

  it('says nothing about an artifact that has no claims at all', () => {
    assert.deepEqual(warn('# Doc\n\nPlain prose, no claims.\n'), []);
  });
});

// The load-bearing property: the claims lint is ADVISORY. A malformed table must
// WARN but never flip an otherwise-valid artifact to failed.
describe('Claims lint is advisory, never blocking', () => {
  const tmpDir = join(tmpdir(), 'bmad-claims-advisory-' + Date.now());
  before(() => mkdirSync(tmpDir, { recursive: true }));
  after(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('an over-budget + bad-status table still PASSES validation, with warnings surfaced', () => {
    const rows = [];
    for (let i = 1; i <= 8; i++) rows.push(okRow(`C-${i}`, 'bogus'));
    const content = `# A perfectly valid generic document\n\nEnough prose to clear the non-trivial length check comfortably.\n\n${table(rows)}`;
    const file = join(tmpDir, 'doc.md');
    writeFileSync(file, content);

    const result = validateArtifacts(tmpDir, { artifact: file });
    const r = result.results[0];
    assert.equal(r.status, 'pass', `claims problems must not fail the artifact: ${JSON.stringify(r)}`);
    assert.equal(r.issues.length, 0);
    assert.ok(r.warnings.length > 0, 'warnings must be surfaced');
    assert.ok(r.warnings.some((m) => /budget/.test(m)));
  });
});

// The generic conditional_patterns capability (self-implemented in the exact
// l5-parallelism-promotion shape). Blocking by design — distinct from the
// advisory claims lint above.
describe('checkConditionalPatterns (present-implies-well-formed)', () => {
  const pat = [{
    name: 'depends-on-named-reason',
    if_regex: '^## Depends-On',
    must_regex: '^## Depends-On:\\s*\\d+\\.\\d+\\s*\\([^)]+\\)',
    message: 'Depends-On entries must carry a named reason',
  }];

  it('passes untouched when the optional field is absent', () => {
    const issues = [];
    checkConditionalPatterns('# Story\nNo depends-on here.\n', pat, issues);
    assert.deepEqual(issues, []);
  });

  it('passes when the field is present AND well-formed', () => {
    const issues = [];
    checkConditionalPatterns('# Story\n## Depends-On: 1.2 (reads the schema created there)\n', pat, issues);
    assert.deepEqual(issues, []);
  });

  it('adds an issue when the field is present but malformed', () => {
    const issues = [];
    checkConditionalPatterns('# Story\n## Depends-On: 1.2\n', pat, issues);
    assert.ok(issues.some((m) => /named reason/.test(m)), JSON.stringify(issues));
  });

  it('is a no-op when there are no conditional patterns', () => {
    const issues = [];
    checkConditionalPatterns('# anything', undefined, issues);
    assert.deepEqual(issues, []);
  });
});
