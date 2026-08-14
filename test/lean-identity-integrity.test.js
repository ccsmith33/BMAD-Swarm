import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// D-57 Seam D — lean role identities (core/annex split). CONTENT-INTEGRITY
// GUARD: the per-spawn boot-cost win comes from moving on-demand reference
// material out of the resident CORE (`agents/<role>.md`) into a lazy-loaded
// ANNEX (`methodology/<role>-annex.md`). The split is only safe if NOTHING was
// dropped — a lost identity instruction is a real regression. This suite proves
// it by holding a byte-snapshot of each pre-split identity in
// `test/fixtures/lean-identity-originals/` and asserting every content line of
// the original still appears verbatim in CORE ∪ ANNEX.
//
// Direction is original → (core ∪ annex): the CORE may add NEW pointer/summary
// lines (that is the point — a short pointer replaces a long section), and the
// ANNEX may add NEW headers; what it may NOT do is lose an original line.

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const AGENTS_DIR = join(repoRoot, 'agents');
const ANNEX_DIR = join(repoRoot, 'methodology');
const ORIGINALS_DIR = join(__dirname, 'fixtures', 'lean-identity-originals');

// The 8 non-orchestrator roles Seam D splits (orchestrator is Seam A's).
const ROLES = ['ideator', 'reviewer', 'strategist', 'architect', 'developer', 'researcher', 'security', 'devops'];

// Normalize for content comparison: trim, collapse internal whitespace runs,
// drop blank lines. Whitespace-only differences are not content loss; a dropped
// or altered sentence is.
function contentLines(text) {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => l.length > 0);
}

describe('Lean identity split — content integrity (D-57 Seam D)', () => {
  for (const role of ROLES) {
    describe(`${role}`, () => {
      const originalPath = join(ORIGINALS_DIR, `${role}.md`);
      const corePath = join(AGENTS_DIR, `${role}.md`);
      const annexPath = join(ANNEX_DIR, `${role}-annex.md`);

      it('has a preserved original snapshot and a produced annex', () => {
        assert.ok(existsSync(originalPath), `missing integrity fixture for ${role}`);
        assert.ok(existsSync(corePath), `missing core identity agents/${role}.md`);
        assert.ok(existsSync(annexPath), `missing annex methodology/${role}-annex.md`);
      });

      it('CORE ∪ ANNEX preserves every content line of the pre-split identity (nothing dropped)', () => {
        const original = readFileSync(originalPath, 'utf8');
        const core = readFileSync(corePath, 'utf8');
        const annex = existsSync(annexPath) ? readFileSync(annexPath, 'utf8') : '';

        const combined = new Set([...contentLines(core), ...contentLines(annex)]);
        const missing = contentLines(original).filter((line) => !combined.has(line));

        assert.deepEqual(
          missing,
          [],
          `content lost in the ${role} core/annex split (present in the original, absent from CORE ∪ ANNEX):\n` +
            missing.map((l) => `  - ${l}`).join('\n')
        );
      });

      it('CORE holds its ACHIEVED boot-cost reduction floor (regression guard, A1)', () => {
        const originalChars = readFileSync(originalPath, 'utf8').length;
        const coreChars = readFileSync(corePath, 'utf8').length;
        const reductionPct = (1 - coreChars / originalChars) * 100;
        // The reduction actually DELIVERED by the split, pinned per role as a FLOOR.
        // The old check (`core < original`) let a -2% "reduction" pass as success
        // (A1): green did not mean the boot-cost goal was met. This locks in what
        // was delivered so a future edit that re-bloats a core fails here. NOTE:
        // these are NOT the design's aspirational ≤5K-char / -40–60% targets — those
        // were not met (cores carry resident behavioral rules; integrity > size) and
        // a deeper slimming pass is a documented follow-up, deliberately not done here.
        const REDUCTION_FLOOR_PCT = {
          ideator: 15, reviewer: 15, strategist: 28, architect: 2,
          researcher: 2, security: 8, developer: 13, devops: 3,
        };
        const floor = REDUCTION_FLOOR_PCT[role] ?? 0;
        assert.ok(
          reductionPct >= floor,
          `${role} CORE reduction ${reductionPct.toFixed(2)}% fell below its achieved floor of ${floor}% ` +
            `(core ${coreChars} / original ${originalChars} chars) — a core was re-bloated past what the split delivered (A1 regression)`
        );
      });
    });
  }

  it('reports the per-role and aggregate boot-cost reduction', () => {
    let totalOriginal = 0;
    let totalCore = 0;
    const rows = [];
    for (const role of ROLES) {
      const orig = readFileSync(join(ORIGINALS_DIR, `${role}.md`), 'utf8').length;
      const core = readFileSync(join(AGENTS_DIR, `${role}.md`), 'utf8').length;
      totalOriginal += orig;
      totalCore += core;
      rows.push(`  ${role.padEnd(11)} ${String(orig).padStart(6)} -> ${String(core).padStart(6)} chars  (-${Math.round((1 - core / orig) * 100)}%)`);
    }
    // Reported, not asserted beyond the strict-smaller per-role check above —
    // the exact % is design telemetry, not a pass/fail contract.
    console.log('\nLean-identity CORE sizes (pre-split -> post-split):');
    console.log(rows.join('\n'));
    console.log(`  ${'TOTAL'.padEnd(11)} ${String(totalOriginal).padStart(6)} -> ${String(totalCore).padStart(6)} chars  (-${Math.round((1 - totalCore / totalOriginal) * 100)}%)`);
    assert.ok(totalCore < totalOriginal);
  });
});
