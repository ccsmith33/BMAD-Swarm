import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const methodologyDir = join(ROOT, 'methodology');
const agentsDir = join(ROOT, 'agents');

const advisory = readFileSync(join(methodologyDir, 'advisory.md'), 'utf8');
const classification = readFileSync(join(methodologyDir, 'decision-classification.md'), 'utf8');

// Verbatim-quote checks run against a flattened copy: markdown blockquote
// markers stripped and whitespace collapsed, so a quoted phrase matches
// regardless of line-wrapping or `> ` prefixes.
const advisoryFlat = advisory.replace(/^\s*>\s?/gm, '').replace(/\s+/g, ' ');

// The nine real roles (2.0.0), same set as methodology-roles.test.js.
const ROLES = [
  'orchestrator', 'ideator', 'researcher', 'strategist', 'architect',
  'developer', 'reviewer', 'security', 'devops',
];
const roleText = Object.fromEntries(
  ROLES.map((r) => [r, readFileSync(join(agentsDir, `${r}.md`), 'utf8')]),
);

describe('advisory.md — the interruption-tax encoding', () => {
  it('quotes the human hard constraint verbatim (per-recommendation, never fixed policy)', () => {
    // diverge-advisory §hard-constraint. This is the load-bearing law; it must
    // appear verbatim so the doc cannot be softened into a fixed policy.
    assert.ok(
      advisoryFlat.includes(
        "judged per-recommendation from that recommendation's own stakes — never a fixed pause-always or batch-at-intake policy",
      ),
      'the human constraint must be present verbatim',
    );
  });

  it('quotes the interruption tax verbatim (a pause is paid for in evidence)', () => {
    assert.ok(
      advisoryFlat.includes('a pause must be paid for in evidence'),
      'the interruption tax line must be present',
    );
    assert.ok(
      advisoryFlat.includes('No externally checkable evidence → it is not allowed to interrupt'),
      'the tax must state no-evidence-no-interrupt',
    );
  });

  it('encodes the two judgment outputs (surface forcefulness + evidence rigor)', () => {
    assert.match(advisory, /surface forcefulness/i);
    assert.match(advisory, /evidence rigor/i);
  });

  it('names the three delivery modes with their format ceilings', () => {
    assert.match(advisory, /silent-proceed/i);
    assert.match(advisory, /inline-note/i);
    assert.match(advisory, /pause-and-ask/i);
    assert.match(advisory, /≤3 lines/, 'inline ceiling');
    assert.match(advisory, /≤10 lines/, 'pause ceiling');
  });

  it('encodes the interruption budget (one pause-tier per dispatch, security excepted)', () => {
    assert.match(advisory, /one pause-tier advisory per dispatch/i);
    assert.match(advisory, /security\s+excepted/i);
  });

  it('encodes the one-pitch rule and disagree-and-commit', () => {
    assert.match(advisory, /one-pitch rule/i);
    assert.match(advisory, /disagree-and-commit/i);
  });
});

describe('advisory.md — the contradiction escalator floor', () => {
  it('is an untunable constitutional floor with the maximum evidence bar', () => {
    assert.match(advisory, /contradiction escalator/i);
    assert.match(advisory, /floor/i);
    assert.match(advisory, /untunable/i);
    assert.match(advisory, /accepted D-ID/);
    assert.match(advisory, /maximum evidence bar/i);
    assert.match(advisory, /never be delivered silent-proceed/i);
  });

  it('keeps challenge-the-premise in scope (swarm may argue against the goal)', () => {
    assert.match(advisory, /[Cc]hallenge.?the.?premise is in scope/);
  });

  it('is duplicated into decision-classification.md as an untunable floor', () => {
    assert.match(classification, /[Cc]ontradiction [Ee]scalator/);
    assert.match(classification, /constitutional floor|untunable/i);
    assert.match(classification, /can never be delivered silent-proceed/i);
    assert.match(classification, /maximum evidence bar/i);
    assert.match(classification, /accepted D-ID|accepted D-record/);
  });
});

describe('advisory.md — R-records as pre-decisions', () => {
  it('places R-records in ledger.md and explicitly forbids an advisory-ledger.md sibling', () => {
    assert.match(advisory, /artifacts\/context\/ledger\.md/);
    assert.match(advisory, /advisory-ledger\.md/, 'must name the rejected sibling');
    assert.match(advisory, /explicitly NOT created|NOT created/,
      'the sibling must be explicitly forbidden (no sixth context file)');
  });

  it('describes accept→graduate-to-D and reject→reopen_trigger', () => {
    assert.match(advisory, /graduates to a D|graduates into a D/i);
    assert.match(advisory, /source: swarm-advisory/);
    assert.match(advisory, /reopen.?trigger/i);
    assert.match(advisory, /reopen-scan/);
  });
});

describe('advisory.md — self-tuning skeleton', () => {
  it('files process-tuning proposals as human-gated R-records, nothing more', () => {
    assert.match(advisory, /[Ss]elf-tuning/);
    assert.match(advisory, /filed as an R-record|as R-records|--type R/);
    assert.match(advisory, /human-gated/i);
    // Must NOT lower the escalator or security floor.
    assert.match(advisory, /never the contradiction escalator|never the contradiction escalator \(§3\) or the\s+security floor/i);
  });
});

describe('advisory.md — the kill list', () => {
  const killed = [
    /batch.?all.?advice.?at.?intake|batch-at-intake|fixed questionnaire/i,
    /[Aa]lways-pause/,
    /[Nn]umeric confidence scores|confidence theater/,
    /[Pp]ersuasion loops/,
    /[Ss]ilent premise-substitution/,
  ];
  for (const [i, re] of killed.entries()) {
    it(`kill-list item ${i + 1} is present (${re})`, () => {
      assert.match(advisory, re);
    });
  }
});

describe('role identities wire the advisory layer', () => {
  for (const role of ROLES) {
    it(`${role}.md carries a counsel/editorial duty pointing at advisory.md`, () => {
      const text = roleText[role];
      assert.match(text, /advisory\.md/,
        `${role} must reference methodology/advisory.md`);
      assert.match(text, /[Cc]ounsel duty|[Ee]ditorial duty/,
        `${role} must declare a counsel or editorial duty`);
    });

    it(`${role}.md carries the contradiction escalator floor`, () => {
      assert.match(roleText[role], /[Cc]ontradiction escalator|escalator/,
        `${role} must reference the escalator floor`);
    });
  }

  it('orchestrator holds the editorial duty: single voice, dedupe, rejected-ledger check, interruption budget', () => {
    const o = roleText.orchestrator;
    assert.match(o, /[Ee]ditorial duty/);
    assert.match(o, /[Ss]ingle voice/);
    assert.match(o, /[Dd]edupe/);
    assert.match(o, /rejected ledger/i);
    assert.match(o, /one pause-tier advisory per dispatch/i);
    assert.match(o, /[Ii]ntake premise-check/);
  });

  it('orchestrator holds the self-tuning retrospective rule (proposals as R-records)', () => {
    const o = roleText.orchestrator;
    assert.match(o, /[Ss]elf-tuning/);
    assert.match(o, /--type R|R-record/);
  });

  it('developer has the pre-flight/mid-flight R-ID channel', () => {
    const d = roleText.developer;
    assert.match(d, /[Pp]re-flight/);
    assert.match(d, /[Mm]id-implementation|mid-flight/);
    assert.match(d, /append --type R/);
  });

  it('architect and strategist carry the design/premise divergence duty', () => {
    assert.match(roleText.architect, /divergence/i);
    assert.match(roleText.architect, /challenges the ask's how/i);
    assert.match(roleText.strategist, /divergence/i);
    assert.match(roleText.strategist, /[Cc]hallenge.?the.?premise/);
  });

  it('reviewer files advisory findings as R-records (blocking stays F-records)', () => {
    const r = roleText.reviewer;
    assert.match(r, /advisory findings.*R-records|as \*\*R-records\*\*/i);
    assert.match(r, /F-records/);
  });

  it('security is excepted from the interruption budget but still pays the tax', () => {
    const s = roleText.security;
    assert.match(s, /excepted from the interruption\s+budget/i);
    assert.match(s, /interruption tax/i);
  });
});
