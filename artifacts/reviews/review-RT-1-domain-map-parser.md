# Review: Story RT-1 — Domain Map parser (`utils/domain-map.js`)

**Story:** `artifacts/implementation/stories/story-RT-1-domain-map-parser.md`
**Reviewer:** reviewer (lenses: `code-quality`, `test-coverage`)
**Date:** 2026-04-29
**Verdict:** **approved**

---

## Summary

RT-1 lands the foundation of the retrofit tooling cleanly. New module `utils/domain-map.js` (161 lines, no dependencies beyond a single `DOMAIN_SLUG_RE` import from `utils/validator.js`) implements both `findDomainMap` (cheap detector) and `parseDomainMap` (full parse + validate) per ADR-012's 8 contract rules. 25 new tests in `test/domain-map.test.js` cover all 12 ACs including a round-trip parse→YAML check and 3 anti-pattern guards (silent slug fixups via uppercase/underscore/leading-hyphen rejection, multiple-section ambiguity, h1/h4 heading-depth rejection).

**Test suite: 367/367 passing** (verified locally — 342 pre-RT-1 + 25 new). All existing validator/config/hook suites green; the `DOMAIN_SLUG_RE` export is purely additive (`const` → `export const` plus a JSDoc-style comment naming the consumer at `utils/validator.js:8-10`). No callers regressed.

**Both judgment calls dev-1 flagged are sound** — verified live during this review:
1. Invalid-slug rows omitted from `domains[]` matches duplicate-row behavior (also omit-on-error). Failure modes are uniform across error categories. Confirmed.
2. `findDomainMap` requires ≥1 data row before returning `found: true` — empty table is functionally absent. Documented in JSDoc at `utils/domain-map.js:50-60`. Confirmed.

The **F-003 symmetry concern is closed by construction**: dev-1 imports `DOMAIN_SLUG_RE` from `utils/validator.js` rather than duplicating the regex. Single source of truth. No new finding to log.

No blocking findings. No new advisory findings.

---

## Acceptance criteria verification

| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | `findDomainMap` returns `{ found: false }` when no `## Domain Map` heading exists; never throws | PASS | `utils/domain-map.js:62` early-returns on `typeof markdown !== 'string'`. `findHeadings` (line 22) returns empty array → for-loop body never executes → falls through to `{ found: false }` at line 72. Tests at `test/domain-map.test.js:29-43` cover three negative cases (no heading, empty string, non-string inputs `null`/`undefined`/`42`). |
| AC2 | `findDomainMap` returns `{ found: true, startLine, endLine, raw }` with byte-exact `raw` | PASS | `utils/domain-map.js:67-71` — `startLine = h + 1`, `endLine = lastRow + 1` (1-indexed), `raw = lines.slice(h, lastRow + 1).join('\n')` (byte-exact substring from heading line through last data row). Test at `test/domain-map.test.js:45-58` asserts exact line numbers (5, 10) and reproduces the expected `raw` byte-for-byte. **Note on judgment call #2 below.** |
| AC3 | `parseDomainMap` parses a valid Domain Map cleanly | PASS | Test at `test/domain-map.test.js:107-120` parses `validMap` (architect-style fixture with 4 columns), asserts `errors === []`, `domains.length === 2`, exact match on first row's full shape (`{domain, description, extras: {Components, 'Anticipated stories'}, line}`), domain + description + line of second row. |
| AC4 | Invalid domain slugs rejected with line-numbered errors | PASS | `utils/domain-map.js:142-145` matches the slug against `DOMAIN_SLUG_RE` and pushes `row at line ${lineNum} has invalid domain slug '${slug}'`. Tests at `test/domain-map.test.js:122-170` exercise four distinct invalid forms: `Backend Auth` (whitespace + mixed case), `domain_with_underscore`, `UPPERCASE`, `-bad` (leading hyphen). All four assert `domains.length === 0` and the documented error substring with line number. |
| AC5 | Missing table after heading produces clear error | PASS | `utils/domain-map.js:105-108` — `locateTable` returns `{ ok: false }` when the next non-blank line isn't a table-shaped line OR when no separator row follows. Error pushed: `Domain Map at line ${headingIdx + 1} is missing the table header`. Test at `test/domain-map.test.js:172-186` validates the line number (3) in the error. |
| AC6 | Duplicate domain slugs produce error naming both lines | PASS | `utils/domain-map.js:135-149` uses a `Map` keyed on slug, value = first-seen line. On collision: `row at line ${lineNum} duplicates domain '${slug}' first declared at line ${seen.get(slug)}`. Test at `test/domain-map.test.js:188-202` confirms first row preserved (`description === 'first'`), duplicate dropped, error mentions both lines (5 and 6). |
| AC7 | Required columns case-insensitive; extras preserve original casing | PASS | `utils/domain-map.js:114-124` — `cell.trim().toLowerCase()` for matching `domain`/`description` (case-insensitive), but stores extras using `cell.trim()` (line 122) which preserves original casing. Test at `test/domain-map.test.js:204-220` uses headers `domain | DESCRIPTION | Components | OwnerHandle` and asserts extras keys are exactly `Components` and `OwnerHandle` (not lowercased). |
| AC8 | Multiple `## Domain Map` headings produce documented error | PASS | `utils/domain-map.js:97-101` — when `headings.length > 1`, error pushed and **early return BEFORE attempting to parse rows from either section**. Test at `test/domain-map.test.js:222-242` confirms `domains.length === 0` and the documented error substring with both line numbers (1, 9). Verified live during this review. |
| AC9 | `### Domain Map` recognized; other heading depths not | PASS | Heading regex at `utils/domain-map.js:7`: `/^(##|###)\s+Domain Map\s*$/`. Tests at `test/domain-map.test.js:60-98` exercise `### Domain Map` (recognized), `# Domain Map` (rejected), `#### Domain Map` (rejected), and case variants `## domain map` / `## Domain-Map` (both rejected). |
| AC10 | Empty `Description` cell → empty-string description, no error | PASS | `utils/domain-map.js:140` — `description = (cells[descCol] ?? '').trim()`. Empty cell or whitespace-only cell both reduce to `''`. Tests at `test/domain-map.test.js:244-268` cover both cases (literally empty `\| backend-auth \|  \|`, whitespace-only `\| backend-auth \|    \|`). |
| AC11 | Parser is read-only | PASS | `utils/domain-map.js` does not mutate any passed-in objects (the input is a string, which is immutable). Tests at `test/domain-map.test.js:270-283` (a) call `parseDomainMap` twice with the same input and assert `deepEqual(r1, r2)`, (b) capture `validMap` before/after a parse call and assert string identity. |
| AC12 | Helper exported and discoverable; module imports `DOMAIN_SLUG_RE` from `utils/validator.js` | PASS | `utils/domain-map.js:1` — `import { DOMAIN_SLUG_RE } from './validator.js';` (single source of truth, NOT a duplicated regex). `utils/validator.js:11` adds `export const` to the existing `DOMAIN_SLUG_RE` constant with a comment naming `utils/domain-map.js` as the consumer. Test at `test/domain-map.test.js:313-318` asserts both functions are named exports. Round-trip test at `test/domain-map.test.js:290-310` (Subtask 2.3) verifies parse → flat YAML preserves every domain slug and description verbatim — guards against silent semantic loss. |

All 12 ACs met.

---

## Judgment-call sanity check (dev-1's flagged escalations)

### JC#1 — Invalid-slug rows omitted from `domains[]`

Story AC4 explicitly leaves the choice to the implementer ("the offending row is omitted from `domains` (or included with a marker — implementer's call; the error is what's load-bearing)"). Dev-1 chose **omit**.

**Reviewer assessment: confirm.** The choice is correct because:

1. **Uniformity across error categories.** Duplicate rows are also omitted (AC6 — first occurrence kept, duplicate dropped). Invalid-slug omission matches that posture, so downstream consumers (RT-2, RT-3) see one consistent rule: "if a row has an error, it doesn't appear in `domains[]`". A consumer iterating `domains[]` is iterating a clean, validated subset.
2. **Marker-based inclusion would create ambiguity.** A row with `invalid: true` would still be "in" the array — RT-2's CLI would have to special-case it before emitting YAML, RT-3's overlay would have to filter it before suggesting specialists. That's the same data-flow as omission, but with one extra reader-side filter step at every consumer site.
3. **Verified live.** I parsed an `[invalid, valid]` two-row map: error logged at line 5 for the bad row, only `backend-auth` (the good row) appears in `domains[]`. The good row coexists with the bad — error doesn't take down the whole parse, which is the correct posture.
4. **Tests assert this explicitly.** `test/domain-map.test.js:131` (`assert.equal(r.domains.length, 0, 'invalid row excluded from domains')`) documents the behavior in the test name itself.

### JC#2 — `findDomainMap` requires ≥1 data row before returning `found: true`

The story's AC2 says "endLine is the 1-indexed line number of the LAST table data row" — it implicitly assumes at least one data row exists. Dev-1 made that requirement explicit: a heading + header + separator with zero data rows returns `{ found: false }`.

**Reviewer assessment: confirm.** The choice is correct because:

1. **Functional equivalence.** A Domain Map with zero data rows is functionally absent — RT-3's "is there an existing Domain Map?" check should treat it the same as a missing one (the user has not yet authored any domains). Returning `found: true` here would force RT-3 to additionally check `domains.length > 0`, defeating the cheap-detector design.
2. **JSDoc documents the intent.** `utils/domain-map.js:55-56` reads: "found: true iff a `## Domain Map` or `### Domain Map` heading is followed by a valid table header + separator + **at least one data row**." Documented at the API boundary.
3. **`parseDomainMap` would ALSO be a no-op** in this case (no data rows to iterate) — both functions agree. No behavioral split between detector and full-parser.
4. **ADR-012 §"Verification" item 2 says** `parseDomainMap` returns `{ domains: [], errors: [] }` when no `## Domain Map` heading exists — but it doesn't speak to the zero-data-row case explicitly. Dev-1's interpretation extends the spirit: "a Domain Map you can't route from is no Domain Map." Reasonable extrapolation.
5. **Verified live.** Header + separator with zero data rows: `findDomainMap` returns `{ found: false }`. Confirmed.
6. **Test at `test/domain-map.test.js:100-103`** explicitly asserts `findDomainMap('## Domain Map\n\nJust prose, no table here.\n').found === false`, and the JSDoc on `findDomainMap` defines the contract clearly.

**Both judgment calls are correct. No push-back.**

---

## Architecture compliance (ADR-012's 8 contract rules)

| Rule | Description | Honoured |
| --- | --- | --- |
| 1 | Heading anchor: exactly `Domain Map` after `## ` or `### `; reject `# Domain Map` / `#### Domain Map` / case variants | YES — heading regex `/^(##|###)\s+Domain Map\s*$/` at line 7 enforces depth + case + whitespace. AC9 tests cover all rejection cases. |
| 2 | Table-immediate: header row + separator row required after heading + blank lines | YES — `locateTable` at line 30 skips blanks, requires table-shaped line, requires separator row. Missing → "missing the table header" error. AC5 covered. |
| 3 | Required columns `Domain`, `Description` (case-insensitive); other columns recorded in `extras` with original casing | YES — column resolution at lines 110-124 lowercases for matching but preserves original cell text for `extras` keys. AC7 tests confirm `Components` and `OwnerHandle` keys retain casing. |
| 4 | Domain cell validated against `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (same regex as `utils/validator.js`) | YES — line 1 imports `DOMAIN_SLUG_RE` from `utils/validator.js`. Single source of truth. AC4 covered with 4 distinct invalid-slug forms. |
| 5 | Duplicate detection with line-numbered error naming both lines | YES — `seen` Map at line 135, error format at line 147. AC6 covered. |
| 6 | Description: trimmed, copied verbatim, empty becomes `""` | YES — line 140 `(cells[descCol] ?? '').trim()`. AC10 tests both empty and whitespace-only cases. |
| 7 | Multiple `## Domain Map` headings → error, does NOT pick one | YES — lines 97-101 push error and **return BEFORE attempting to parse**. AC8 verifies `domains.length === 0` after the error. **Verified live during this review.** |
| 8 | No reformatting, no mutation; parser is read-only | YES — function returns plain objects derived from string operations; never edits input. AC11 covered. |

All 8 contract rules implemented faithfully.

---

## F-003 symmetry check

Team-lead asked me to confirm the F-003 hook-side duplication concern is mirrored correctly here. F-003 captures the fact that `.claude/hooks/teamcreate-gate.cjs` duplicates `utils/config.js` fallback default-application logic without drift-detection (an ESM/CJS bridge problem).

**The same drift risk would have applied** if dev-1 had inlined a `DOMAIN_SLUG_RE = /^[a-z0-9].../` constant in `utils/domain-map.js`. The slug regex is the routing key's shape — if the parser interprets it differently than the validator does, RT-2's emitted `swarm.yaml:team` block would contain slugs the validator would later reject. The bug class (silent disagreement between two checkers of the same constraint) is identical.

**Dev-1 closed this by construction**: ESM-to-ESM import of `DOMAIN_SLUG_RE` from `utils/validator.js`. The `utils/validator.js:8-10` comment explicitly names `utils/domain-map.js (RT-1)` as the consumer to make the dependency visible at the source. Future schema changes to the slug regex flow through one constant.

**No new finding to log on RT-1.** F-003 remains open as the hook-side analog (the hook is CJS, can't `import` from ESM without a bridge — orthogonal design problem). The two situations are different: in F-003 the duplication is intentional given the ESM/CJS constraint; here, dev-1 had no such constraint and chose the right pattern.

The story Dev Notes line 146 explicitly anticipated this: "import `DOMAIN_SLUG_RE` from `utils/validator.js` if exported; if not, refactor the validator to export it as a named constant first (one-line change). Single source of truth is the goal." Dev-1 followed the guidance.

---

## Lens: code-quality

**Strengths**

- **Pure function, no IO, no external state.** `parseDomainMap(string) → object` is a model citizen of the utility layer. Easy to test (which dev-1 did — 25 tests). Easy to reason about. Composable.
- **Single source of truth for slug regex.** Dev-1 promoted `DOMAIN_SLUG_RE` from file-private const to named export rather than duplicating. Story Dev Notes line 146 anticipated this; dev-1 executed cleanly.
- **The split between `findDomainMap` (cheap detector) and `parseDomainMap` (full validator) is the right shape.** ADR-012 §"Decision" sets up this split for RT-3's "is there already one?" use case. The detector loops over potentially-multiple headings (line 65-71) and returns the first that has a valid-shaped table; this is robust against e.g. a stray "Domain Map" string in a fenced code block elsewhere in the document.
- **Defensive parsing throughout.** `splitRow` (line 10) handles both trailing-pipe and no-trailing-pipe forms. `isSeparatorRow` (line 17) accepts alignment markers (`:---:`, `---:`, `:---`) per `markdown` spec. Empty-cell access uses `?? ''` (lines 139, 140, 154) so missing trailing cells don't throw.
- **Two-pass header resolution** (lines 110-124) — first scans all headers building `domainCol`, `descCol`, and `extraCols` simultaneously. The `&& domainCol === -1` guard means a duplicate `Domain` header collapses to the first one rather than being treated as an extra (subtle but correct — a malformed table with two `Domain` columns is still parseable as long as the first one has valid slugs).
- **Comments are economical and load-bearing.** The 3-line module header at lines 3-5 names ADR-012 and the read-only invariant. The comment at line 110 explains the case-insensitive-matching-with-original-casing-preservation choice. JSDoc on both exports documents the return shape per AC12.
- **No regex over the entire document.** Anti-pattern at story Dev Notes line 175 honoured: heading-anchored, then table-immediate. The parser never scans for "domain-like" lines.
- **No silent slug fixups.** Anti-pattern at story Dev Notes line 176 honoured: invalid slugs are rejected, not lower-cased or kebab-ified.
- **`HEADING_RE` and `TABLE_ROW_RE` extracted to module-top constants** (lines 7-8). Reusable, readable, no per-call recompile.

**Findings (none)**

No high, medium, or low findings.

**One observation (non-finding):** The early-return on multiple headings at line 99-101 is correct per ADR-012 rule 7 ("does NOT pick one"), and the error message names both line numbers. A slightly nicer-to-debug behavior would be to ALSO list lines for any headings beyond the second (e.g., 3 headings → name all 3 in the error), but this is purely cosmetic — ADR-012 §Decision rule 7 specifies "lines N, M" with two lines, and the test at `domain-map.test.js:241` asserts exactly two line numbers. Implementation matches the spec exactly. Not flagged.

---

## Lens: test-coverage

**Quantitative**: 25 new tests covering AC1–AC12 plus the round-trip check (Subtask 2.3) and the module-surface check (AC12). Per the story's Subtask 2.1 (one test per AC, AC1-AC12), this is at-or-above the required count. Full suite: **367 passing, 0 failing, 0 skipped**.

**Qualitative**

- **Inline markdown fixtures via template literals** (Subtask 2.2 honoured). The `validMap` constant at lines 8-24 is reusable across multiple tests. Per-test fixtures use `[...].join('\n')` for clarity. No separate fixture files — keeps the test file self-contained and easy to read.
- **Error-message assertions use `assert.match(errors[0], /substring/)`** rather than exact string equality. Future wording adjustments to the error messages won't break the tests as long as the load-bearing substrings (slug name, line numbers, error-class verb) survive. The right granularity for behavior-vs-implementation testing (story Testing Approach line 167 anticipated this).
- **AC9 covers FOUR distinct rejection cases in three tests** (h1, h4, two case variants in one test). Compact but thorough.
- **AC4 covers FOUR distinct invalid-slug forms in four tests** (whitespace+mixedcase, underscore, uppercase, leading hyphen). Each test is small and named for the specific malformation. Easy to extend if a new failure mode is discovered.
- **AC11's read-only assertion is two-pronged** — both "repeated calls produce equal results" AND "input string identity is preserved." The second test (line 276-283) acknowledges that strings are immutable in JS but documents the no-side-effects intent at the API boundary. Future regression where someone attaches a property to the input would still violate the spirit; the test as written is a placeholder for that intent.
- **AC8's multi-section test asserts `domains.length === 0`** (line 239) — this is the explicit verification that the parser doesn't pick one section, matching ADR-012 rule 7. Verified live during this review.
- **Round-trip test at lines 290-310** is exactly what Subtask 2.3 asked for: parse architect-style fixture → emit RT-2's flat YAML form → assert exact-string match. This is the contract that RT-2's CLI will consume; if dev-1 had silently dropped a description or mangled an extras column, this test would catch it.
- **Module-surface test at lines 313-318** confirms both `findDomainMap` and `parseDomainMap` are named exports — guards against accidental rename or default-export refactor.
- **Empty/whitespace Description coverage at AC10** is split into two tests (literal-empty vs whitespace-only) — protects against a future regex change that handles one but not the other.
- **The `validMap` constant** doubles as an integration fixture: AC2 verifies its line-numbering, AC3 verifies its full parse, AC11 verifies it's stable across calls, AC12 verifies it round-trips. One fixture, four lenses.

**Coverage gaps (none blocking)**

- No test asserts the behavior when the table has data rows but ALL of them have invalid slugs. The parser would log multiple errors and return `domains: []`. By induction from the existing tests this works correctly, but a single-row-all-invalid test would document the multi-error-accumulation behavior. Not blocking; out of explicit AC scope.
- No test for a Domain Map immediately preceded by another `## Section` heading on the line right above (e.g., `## Other\n## Domain Map\n...`). The `findHeadings` walk handles it correctly (the previous heading isn't `Domain Map`), but the test fixtures all have a blank line before the heading. Defense-in-depth coverage. Not blocking.
- No test for tabs (`\t`) inside cells. The parser uses `.trim()` which strips horizontal whitespace including tabs, so this works correctly, but a test with tab-separated-style content inside a cell would be defense-in-depth. Not blocking.

A separate `test-coverage-report.md` is not produced for this review — the test inventory above is sufficient given the bounded surface (one module, two functions, 25 tests, 1:1 mapping to ADR-012's 8 contract rules + 12 ACs).

---

## Decision Traceability

- **D-004** (grandparent strategic — wide-team specialization adoption): Verified — RT-1's parser is the foundation of the retrofit-tooling subtree under D-004. Status remains `verified` (aggregate parent).
- **D-014** (parent strategic — adopt retrofit tooling for wide-team adoption): Verified — RT-1 is the foundation story under D-014. D-014's status is `accepted` per D-018; remains `accepted` because the full retrofit feature isn't yet implemented (RT-2, RT-3, RT-4 still pending). Will flip to `verified` after RT-4 lands.
- **D-017** (Domain Map parser contract — heading-anchored, strict shape): **Verified — implemented**. All 8 contract rules from ADR-012 §Decision implemented faithfully. Status flip recommended: D-017 → `verified` in `decision-log.md`.
- **ADR-012**: Verified — every alternative rejection holds (no permissive parser, no frontmatter YAML, no sidecar file, no JSON code block, no loose regex extraction, no `--lenient` flag). The strict-only posture documented in §"Decision" matches the implementation.
- **No new D-IDs created** during implementation — correct posture for a faithful contract implementation. Dev-1's report confirms "no tactical D-IDs logged."

---

## Findings register dedupe

Read `artifacts/context/findings-register.md` at review start. Three existing entries:
- **F-001** — `defaults.model` unvalidated (validator-side, low) — unrelated to RT-1.
- **F-002** — `team.fallback.role` not enum-validated (validator-side, low) — unrelated to RT-1.
- **F-003** — `teamcreate-gate.cjs` duplicates `utils/config.js` fallback defaults (hook-side, low) — RELATED but orthogonal. RT-1 closes the ANALOGOUS slug-regex risk by construction (ESM-to-ESM import); F-003 remains open because the hook is CJS and can't import from ESM without a bridge. Different design problem, same value-of-shared-source-of-truth principle. RT-1 demonstrates the right pattern in the ESM-only case.

No duplicates. RT-1 produces no new findings.

---

## Verdict

**approved**

All 12 acceptance criteria met. **367/367 tests passing**. ADR-012's 8 contract rules each map 1:1 to either the implementation or a test (most map to both).

Both judgment calls dev-1 flagged are sound — verified live during this review:
- **JC#1** (invalid-slug omission): correct; matches duplicate-row behavior; uniform failure modes across error categories.
- **JC#2** (≥1 data row required for `findDomainMap` truthiness): correct; documented in JSDoc; functionally absent ↔ semantically absent.

The F-003 symmetry concern is closed by construction — `DOMAIN_SLUG_RE` is imported from `utils/validator.js`, not duplicated. RT-1 is the model citizen for "single source of truth for shape constants."

D-017 status flip to `verified` recommended. RT-2 and RT-3 are now unblocked: both consume the parser via the ADR-012 contract, which is now implemented and well-tested.
