import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  parseBrain,
  validateBrain,
  evictToBudget,
  estimateTokens,
  splitFrontmatter,
  extractPointers,
  SCHEMA_VERSION,
  BUDGET_TOKENS,
  SECTIONS,
} from '../utils/project-brain.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Build a schema-valid brain. Overrides let each test perturb one facet.
function makeBrain(overrides = {}) {
  const fm = {
    schema: SCHEMA_VERSION,
    updated: '2026-08-13T14:00:00Z',
    checkpoint: 47,
    phase: 'implementation',
    gates: '{prd: {status: passed, d_id: D-1}}', // required machine-state key (D-037)
    ...(overrides.frontmatter || {}),
  };
  const fmBlock = overrides.rawFrontmatter !== undefined
    ? overrides.rawFrontmatter
    : '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n';

  const sections = overrides.sections || {
    'What this is (and why)': 'bmad-swarm is a multi-agent orchestration framework. Done means a fresh Claude beats a compacted one.',
    'Current mental model': ['- hooks enforce, prompts instruct', '- the gate reads ONLY team-assembly-log.md'],
    'Load-bearing facts': ['- MCP Drive is orchestrator-only, not reachable from subagents (D-041)', '- the brain lives at artifacts/context/project-brain.md'],
    'Active threads': ['- project brain — schema+hooks landing — next: warm-boot test — see artifacts/design/phase2-enforcement-resilience-2026-08-13.md @c47'],
    'Dead ends': ['- rewire TaskCompleted to Stop hook — rejected, payload lacks task fields (D-002) @c12'],
    'Open questions': ['- does PostToolUse carry task fields? (see spikes-2026-08-11.md)'],
    'Pointers': ['- decision-log: artifacts/context/decision-log.md', '- ledger: artifacts/context/ledger.md'],
  };
  const body = Object.entries(sections).map(([h, content]) => {
    const lines = Array.isArray(content) ? content.join('\n') : content;
    return `## ${h}\n${lines}\n`;
  }).join('\n');

  return fmBlock + '\n' + body;
}

describe('project-brain: parse', () => {
  it('splits frontmatter from body', () => {
    const { frontmatter, body, frontmatterError } = splitFrontmatter(makeBrain());
    assert.equal(frontmatterError, null);
    assert.equal(frontmatter.schema, SCHEMA_VERSION);
    assert.equal(frontmatter.checkpoint, 47);
    assert.match(body, /## What this is/);
  });

  it('reports missing frontmatter block', () => {
    const { frontmatter, frontmatterError } = splitFrontmatter('# no frontmatter here\n');
    assert.equal(frontmatter, null);
    assert.match(frontmatterError, /frontmatter/);
  });

  it('parses sections and strips @cN touch markers from items', () => {
    const parsed = parseBrain(makeBrain());
    const threads = parsed.sectionMap.get('active threads');
    assert.equal(threads.items.length, 1);
    assert.equal(threads.items[0].touchedAt, 47);
    assert.doesNotMatch(threads.items[0].text, /@c47/);
  });
});

describe('project-brain: validate', () => {
  it('accepts a schema-valid, in-budget brain', () => {
    const result = validateBrain(makeBrain());
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.equal(result.overBudget, false);
  });

  it('rejects an over-budget brain (checkpoint write must fail)', () => {
    // Pad Open questions with a huge item to blow the token budget.
    const fat = '- ' + 'x'.repeat(BUDGET_TOKENS * 4 + 100);
    const brain = makeBrain({
      sections: {
        'What this is (and why)': 'A project.',
        'Current mental model': ['- a'],
        'Load-bearing facts': ['- fact (D-1)'],
        'Active threads': ['- t — s — n — artifacts/x.md @c1'],
        'Dead ends': ['- d — why (D-2) @c1'],
        'Open questions': [fat],
        'Pointers': ['- decision-log: artifacts/context/decision-log.md'],
      },
    });
    const result = validateBrain(brain);
    assert.equal(result.overBudget, true);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /budget/.test(e)), 'expected a budget error');
  });

  it('rejects an item-cap overflow (too many dead ends)', () => {
    const tooMany = Array.from({ length: 8 }, (_, i) => `- dead end ${i} (D-${i}) @c1`);
    const brain = makeBrain({
      sections: {
        'What this is (and why)': 'A project.',
        'Current mental model': ['- a'],
        'Load-bearing facts': ['- fact (D-1)'],
        'Active threads': ['- t — s — n — artifacts/x.md @c1'],
        'Dead ends': tooMany,
        'Open questions': ['- q?'],
        'Pointers': ['- decision-log: artifacts/context/decision-log.md'],
      },
    });
    const result = validateBrain(brain);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /Dead ends.*exceeds cap of 6/.test(e)), result.errors.join('; '));
  });

  it('rejects missing required frontmatter keys', () => {
    const result = validateBrain(makeBrain({ rawFrontmatter: '---\nschema: project-brain/1\nupdated: 2026-08-13\n---\n' }));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /missing required key "checkpoint"/.test(e)));
    assert.ok(result.errors.some((e) => /missing required key "phase"/.test(e)));
  });

  it('rejects a wrong schema version', () => {
    const result = validateBrain(makeBrain({ frontmatter: { schema: 'project-brain/99' } }));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /schema is "project-brain\/99"/.test(e)));
  });

  it('rejects a missing required section', () => {
    const brain = makeBrain({
      sections: {
        'What this is (and why)': 'A project.',
        'Current mental model': ['- a'],
        'Load-bearing facts': ['- fact (D-1)'],
        'Active threads': ['- t — s — n — artifacts/x.md @c1'],
        // Dead ends missing
        'Open questions': ['- q?'],
        'Pointers': ['- decision-log: artifacts/context/decision-log.md'],
      },
    });
    const result = validateBrain(brain);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /missing "## Dead ends"/.test(e)));
  });

  it('warns (not errors) on a load-bearing fact with no evidence pointer', () => {
    const brain = makeBrain({
      sections: {
        'What this is (and why)': 'A project.',
        'Current mental model': ['- a'],
        'Load-bearing facts': ['- this claim has no pointer at all'],
        'Active threads': ['- t — s — n — artifacts/x.md @c1'],
        'Dead ends': ['- d — why (D-2) @c1'],
        'Open questions': ['- q?'],
        'Pointers': ['- decision-log: artifacts/context/decision-log.md'],
      },
    });
    const result = validateBrain(brain);
    assert.ok(result.warnings.some((w) => /no evidence pointer/.test(w)));
  });
});

describe('project-brain: token budget + eviction', () => {
  it('estimateTokens is the char/4 proxy', () => {
    assert.equal(estimateTokens('a'.repeat(400)), 100);
    assert.equal(estimateTokens(''), 0);
  });

  it('touch-or-die eviction drops the oldest-touched entries until under budget', () => {
    // A brain just over budget with three threads touched at c1 (oldest), c5,
    // c9. Eviction should remove c1 first.
    const pad = 'y'.repeat(600); // ~150 tokens per thread item
    const brain = makeBrain({
      frontmatter: { checkpoint: 10 },
      sections: {
        'What this is (and why)': 'A project.',
        'Current mental model': ['- a'],
        'Load-bearing facts': ['- fact (D-1)'],
        'Active threads': [
          `- oldest ${pad} — artifacts/a.md @c1`,
          `- middle ${pad} — artifacts/b.md @c5`,
          `- newest ${pad} — artifacts/c.md @c9`,
        ],
        'Dead ends': ['- d — why (D-2) @c1'],
        'Open questions': ['- q?'],
        'Pointers': ['- decision-log: artifacts/context/decision-log.md'],
      },
    });
    // Set a tight budget so exactly one thread must go.
    const budget = estimateTokens(brain) - 100;
    const result = evictToBudget(brain, { budget });
    assert.ok(result.underBudget, 'should be under budget after eviction');
    assert.equal(result.evicted.length >= 1, true);
    // The oldest (c1) thread must be the first evicted.
    assert.equal(result.evicted[0].touchedAt, 1);
    assert.match(result.evicted[0].text, /oldest/);
    // The newest thread survives in the rebuilt body.
    assert.match(result.body, /newest/);
    assert.doesNotMatch(result.body, /oldest y/);
  });

  it('eviction never cuts protected sections (identity/mental-model/pointers)', () => {
    const pad = 'z'.repeat(4000);
    const brain = makeBrain({
      frontmatter: { checkpoint: 10 },
      sections: {
        'What this is (and why)': `A project with a long identity ${pad}.`,
        'Current mental model': [`- protected model ${pad}`],
        'Load-bearing facts': ['- fact (D-1) @c1'],
        'Active threads': ['- t — s — n — artifacts/x.md @c1'],
        'Dead ends': ['- d — why (D-2) @c1'],
        'Open questions': ['- q?'],
        'Pointers': [`- decision-log: artifacts/context/decision-log.md`],
      },
    });
    const result = evictToBudget(brain, { budget: 100 });
    // Even though it can't reach 100 tokens, the protected content stays.
    assert.match(result.body, /long identity/);
    assert.match(result.body, /protected model/);
    assert.match(result.body, /decision-log/);
    assert.equal(result.protectedRemaining, true);
  });

  it('unmarked (no @cN) entries are not mechanically evicted', () => {
    const pad = 'w'.repeat(2000);
    const brain = makeBrain({
      sections: {
        'What this is (and why)': 'A project.',
        'Current mental model': ['- a'],
        'Load-bearing facts': [`- unmarked fact with a pointer artifacts/keep.md ${pad}`],
        'Active threads': ['- t — s — n — artifacts/x.md @c1'],
        'Dead ends': ['- d — why (D-2) @c1'],
        'Open questions': ['- q?'],
        'Pointers': ['- decision-log: artifacts/context/decision-log.md'],
      },
    });
    const result = evictToBudget(brain, { budget: 50 });
    // The unmarked fact stays — mechanical eviction stops at unmarked items.
    assert.match(result.body, /unmarked fact/);
  });
});

describe('project-brain: extractPointers (M-1 doctor wiring)', () => {
  it('returns artifacts/ paths and excludes .claude/ scaffold refs', () => {
    const { paths } = extractPointers(makeBrain());
    assert.ok(paths.includes('artifacts/context/decision-log.md'));
    assert.ok(!paths.some((p) => p.startsWith('.claude/')), '.claude scaffold refs must be excluded');
  });

  it('collects cited D-IDs but skips the "next D-ID" pointer line', () => {
    const brain = makeBrain({
      sections: {
        'What this is (and why)': 'A project.',
        'Current mental model': ['- a'],
        'Load-bearing facts': ['- fact (D-1)'],
        'Active threads': ['- t — s — n — artifacts/x.md @c1'],
        'Dead ends': ['- d — rejected (D-2) @c1'],
        'Open questions': ['- q?'],
        'Pointers': ['- decision-log (next D-ID: D-99): artifacts/context/decision-log.md'],
      },
    });
    const { dIds } = extractPointers(brain);
    assert.ok(dIds.includes('D-1'));
    assert.ok(dIds.includes('D-2'));
    assert.ok(!dIds.includes('D-99'), 'the not-yet-allocated next D-ID must be skipped');
  });
});

describe('project-brain: M-2 token agreement (validate vs evict)', () => {
  // A no-op eviction must reserialize byte-identically and report the SAME token
  // count validateBrain reports — even with nested/flow frontmatter mappings
  // that a yaml.dump round-trip would mutate.
  const nested = makeBrain({
    frontmatter: {}, // uses defaults
    rawFrontmatter: [
      '---',
      'schema: project-brain/1',
      'updated: 2026-08-13T14:00:00Z',
      'checkpoint: 1',
      'phase: implementation',
      'gates:',
      '  prd-approved: {status: passed, d-id: D-009}',
      'staleness: {ledger-events-since-checkpoint: 0}',
      '---',
      '',
    ].join('\n'),
  });

  it('no-op eviction agrees with validate on token count (nested frontmatter)', () => {
    const v = validateBrain(nested).tokens;
    const e = evictToBudget(nested, { budget: 10 ** 9 }).tokens;
    assert.equal(v, e, 'validate and evict must measure the same serialization');
  });

  it('no-op eviction reserializes the body byte-for-byte', () => {
    const { body } = splitFrontmatter(nested);
    const result = evictToBudget(nested, { budget: 10 ** 9 });
    assert.equal(result.body, body, 'zero-eviction body must be verbatim');
    assert.equal(result.evicted.length, 0);
  });
});

// The two-brain probe, mechanical form (continuity §5.3): a reader given ONLY
// the brain + the cold stores must be able to answer key comprehension
// questions, and every pointer must resolve. This is the brain's unit test.
//
// Hermeticity (F-28): these read the real shipped artifacts/context/project-brain.md
// (a tracked file), so they are reproducible on any real checkout. Two guards keep
// them from turning a fresh/partial checkout RED: (1) if the brain is absent, the
// whole block skips rather than throwing (skip-if-absent); (2) the pointer-resolution
// check tolerates targets that git ignores — private working docs (spike-*, audit-*,
// …) legitimately do not exist on a fresh clone, so requiring them to resolve would
// be a non-hermetic false failure.
describe('project-brain: two-brain probe (the shipped brain)', () => {
  const brainPath = join(REPO_ROOT, 'artifacts', 'context', 'project-brain.md');
  const brainAbsent = !existsSync(brainPath);
  const skipReason = brainAbsent
    ? 'no shipped project-brain.md on this checkout — ship-gate skipped (F-28 hermeticity)'
    : false;

  // A pointer target that git ignores is a private working doc: absent on a fresh
  // clone by design, so it must NOT be required to resolve. Returns true when the
  // path is gitignored; false when tracked/committed or when git can't be consulted
  // (in which case the caller falls back to the strict existence check).
  function isGitIgnored(relPath) {
    try {
      // --no-index matches against the .gitignore PATTERNS alone, ignoring whether
      // the path is currently tracked: a private-doc-shaped pointer must be tolerated
      // even if someone force-committed the file. Exit 0 = ignored, 1 = not ignored.
      execFileSync('git', ['check-ignore', '--no-index', '-q', '--', relPath], { cwd: REPO_ROOT, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  it('the repo ships a project-brain.md', { skip: false }, () => {
    // This ship-gate is intentionally strict: project-brain.md is a tracked,
    // shippable artifact, so its absence is a genuine release defect, not a
    // checkout artifact. (It is not gitignored — see .gitignore.)
    assert.ok(existsSync(brainPath), 'artifacts/context/project-brain.md must exist');
  });

  it('the shipped brain validates and is in budget', { skip: skipReason }, () => {
    const result = validateBrain(readFileSync(brainPath, 'utf8'));
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.ok(result.tokens <= BUDGET_TOKENS, `brain is ${result.tokens} tokens (cap ${BUDGET_TOKENS})`);
  });

  it('answers: what is the current phase? (frontmatter)', { skip: skipReason }, () => {
    const { frontmatter } = parseBrain(readFileSync(brainPath, 'utf8'));
    assert.ok(frontmatter.phase, 'phase must be answerable from frontmatter');
  });

  it('answers: what was tried and abandoned? (dead ends non-empty, pointered)', { skip: skipReason }, () => {
    const parsed = parseBrain(readFileSync(brainPath, 'utf8'));
    const dead = parsed.sectionMap.get('dead ends');
    assert.ok(dead && dead.items.length >= 1, 'at least one dead end must be recorded');
  });

  it('every tracked file-path pointer in the shipped brain resolves on disk', { skip: skipReason }, () => {
    const raw = readFileSync(brainPath, 'utf8');
    // Extract artifacts/... path tokens (the cold-store pointers).
    const paths = new Set();
    for (const m of raw.matchAll(/\b(artifacts\/[\w./-]+\.\w{2,4})\b/g)) paths.add(m[1]);
    assert.ok(paths.size >= 1, 'brain should point at cold stores');
    for (const p of paths) {
      // Private working docs (gitignored) are absent on a fresh clone by design.
      if (isGitIgnored(p)) continue;
      assert.ok(existsSync(join(REPO_ROOT, p)), `brain points at a non-existent tracked path: ${p} (fabrication guard)`);
    }
  });
});
