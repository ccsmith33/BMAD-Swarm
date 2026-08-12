# Story RT-1: Domain Map parser (`utils/domain-map.js`)

## Status: complete

## User Story

As a developer of the wide-team retrofit tooling,
I want a strict, well-tested utility that finds and parses a Domain Map from `architecture.md` markdown,
So that both `bmad-swarm scaffold-team` (RT-2) and `/retrofit-team`'s detection step (RT-3) can read the same canonical structure with one source of truth and predictable error messages.

## Acceptance Criteria

### AC1: `findDomainMap` returns `{ found: false }` when no `## Domain Map` heading exists

**Given** a markdown string with no `## Domain Map` or `### Domain Map` heading
**When** `findDomainMap(markdown)` is called
**Then** it returns `{ found: false }`
**And** does not throw

### AC2: `findDomainMap` locates a valid Domain Map and returns its line range + raw text

**Given** a markdown string containing a `## Domain Map` heading followed by a valid table
**When** `findDomainMap(markdown)` is called
**Then** it returns `{ found: true, startLine, endLine, raw }` where:
- `startLine` is the 1-indexed line number of the `## Domain Map` heading
- `endLine` is the 1-indexed line number of the LAST table data row
- `raw` is the substring from heading through last data row, byte-exact

### AC3: `parseDomainMap` parses a valid Domain Map cleanly

**Given** a markdown string containing this Domain Map (matching the format in `agents/architect.md`):

```markdown
## Domain Map

| Domain | Description | Components | Anticipated stories |
| --- | --- | --- | --- |
| backend-auth | OAuth2/PKCE, sessions, password flows | `src/auth/*` | ~5 |
| frontend-dashboard | React dashboard pages | `web/src/pages/dashboard/*` | ~4 |
```

**When** `parseDomainMap(markdown)` is called
**Then** it returns `{ domains: [...], errors: [] }`
**And** `domains.length === 2`
**And** `domains[0]` matches `{ domain: 'backend-auth', description: 'OAuth2/PKCE, sessions, password flows', extras: { Components: '`src/auth/*`', 'Anticipated stories': '~5' }, line: <row-line> }`
**And** `domains[1].domain === 'frontend-dashboard'`

### AC4: Invalid domain slugs are rejected with line-numbered errors

**Given** a Domain Map row with `Domain` cell `Backend Auth` (whitespace, mixed case)
**When** `parseDomainMap` runs
**Then** `errors` contains a string matching `row at line N has invalid domain slug 'Backend Auth'`
**And** the offending row is omitted from `domains` (or included with a marker — implementer's call; the error is what's load-bearing)

### AC5: Missing table after heading produces a clear error

**Given** a markdown with `## Domain Map` followed by prose paragraphs (no table)
**When** `parseDomainMap` runs
**Then** `errors` contains `Domain Map at line N is missing the table header`

### AC6: Duplicate domain slugs produce a duplicate error naming both lines

**Given** two table rows whose `Domain` cell is `backend-auth`
**When** `parseDomainMap` runs
**Then** `errors` contains a string matching `row at line N duplicates domain 'backend-auth' first declared at line M`

### AC7: Required columns are case-insensitive; extras are preserved by name

**Given** a Domain Map header `| domain | DESCRIPTION | Components | OwnerHandle |`
**When** `parseDomainMap` runs
**Then** the required columns are matched (no error)
**And** each parsed row's `extras` map contains `{ Components: ..., OwnerHandle: ... }` with the original header casing as keys

### AC8: Multiple `## Domain Map` headings produce the documented error

**Given** a markdown with two `## Domain Map` headings
**When** `parseDomainMap` runs
**Then** `errors` contains a string matching `multiple Domain Map sections at lines N, M; resolve manually`

### AC9: `### Domain Map` (h3) is recognized; other heading depths are not

**Given** a markdown using `### Domain Map` (with valid table)
**When** `findDomainMap` runs
**Then** `found === true`

**Given** a markdown using `# Domain Map` or `#### Domain Map`
**When** `findDomainMap` runs
**Then** `found === false`

### AC10: Empty `Description` cell produces empty-string description, no error

**Given** a row whose `Description` cell is empty (or whitespace)
**When** `parseDomainMap` runs
**Then** that row's `description === ""`
**And** no error is generated

### AC11: Parser is read-only

**Given** any markdown input
**When** `parseDomainMap` runs
**Then** the function does not mutate any passed-in objects
**And** repeated calls with the same input return structurally equal results

### AC12: Helper exported and discoverable from package internals

**Given** the new module at `utils/domain-map.js`
**Then** `findDomainMap` and `parseDomainMap` are named exports
**And** the module imports `DOMAIN_SLUG_RE` (or equivalent) from `utils/validator.js` so the slug regex is single-source-of-truth — OR re-defines it with a comment naming the source line in `validator.js`

## Tasks

- [ ] Task 1: Create `utils/domain-map.js`
  - [ ] Subtask 1.1: Implement `findDomainMap(markdown: string)`
  - [ ] Subtask 1.2: Implement `parseDomainMap(markdown: string)` calling `findDomainMap` internally
  - [ ] Subtask 1.3: Source the `DOMAIN_SLUG_RE` from `utils/validator.js` (preferred) or co-locate with a `// matches utils/validator.js:DOMAIN_SLUG_RE` comment
  - [ ] Subtask 1.4: Add JSDoc to both exports including the return shape
- [ ] Task 2: Write tests in `test/domain-map.test.js`
  - [ ] Subtask 2.1: Tests for AC1–AC12 using `node:test` (matching the repo's existing pattern; see `test/config.test.js`)
  - [ ] Subtask 2.2: Use inline markdown strings for fixtures (no separate fixture files needed)
  - [ ] Subtask 2.3: One round-trip test: take an architect-style Domain Map, parse it, format the parsed structure back to YAML (inline helper), assert the YAML matches expected — guards against silent semantic loss
- [ ] Task 3: Verify the existing test suite still passes (`npm test` or equivalent)
- [ ] Task 4: Optional — add a JSDoc cross-reference from `utils/validator.js:DOMAIN_SLUG_RE` to `utils/domain-map.js` so future readers see both consumers

## Dev Notes

### Architecture Context

This story implements `architecture-retrofit.md` §5 (Domain Map parser strategy) and the contract documented in **ADR-012**. It is the foundation story for the retrofit feature — both RT-2 and RT-3 depend on it.

The parser's strictness is a design property, not an oversight. See ADR-012 §"Decision" for the eight contract rules and ADR-012 §"Alternatives considered" for why permissive parsing was rejected.

### Technical Implementation

**Module shape** — `utils/domain-map.js` is pure utility code (no IO, no external state). Both functions take a string and return a plain object. The split (`findDomainMap` for cheap detection, `parseDomainMap` for full parse-and-validate) is intentional: RT-3's overlay does the cheap check; RT-2's `--write` does the full parse.

**Heading detection** — recognize lines matching `/^(##|###)\s+Domain Map\s*$/`. Reject `# Domain Map` and `#### Domain Map` per ADR-012 §"Decision" rule 1.

**Table detection** — after the heading, skip blank lines, then expect:
- A header row matching `/^\s*\|.*\|\s*$/` containing pipe-separated cells.
- A separator row whose cells are `---` (or `:---:`, `---:` etc. — markdown allows alignment markers; the parser ignores alignment).

**Cell parsing** — split each row on `|`, trim each cell, drop the leading/trailing empty cells produced by edge pipes.

**Column resolution** — match `Domain` and `Description` headers case-insensitively, trimmed. Other headers are recorded in `extras` with their ORIGINAL casing preserved (so the user's header `OwnerHandle` doesn't collapse to `ownerhandle`).

**Slug regex** — import `DOMAIN_SLUG_RE` from `utils/validator.js` if exported; if not, refactor the validator to export it as a named constant first (one-line change). Single source of truth is the goal.

**Error messages** — match the exact strings in ADR-012 §"Verification" so downstream tools can pattern-match if needed.

### File Locations

- Create: `utils/domain-map.js`
- Create or extend: `test/domain-map.test.js`
- Possibly modify: `utils/validator.js` to export `DOMAIN_SLUG_RE` (additive, no behavior change)

### Dependencies

None new. Pure JavaScript, no external libraries.

If `DOMAIN_SLUG_RE` is currently file-private in `validator.js`, this story should add the export. The existing tests in `test/validator.test.js` are unaffected because they call `validateConfig` (which still uses the constant internally).

### Testing Approach

- `node:test` matches the existing pattern in `test/config.test.js` and `test/validator.test.js`.
- Inline markdown fixtures (template literals) are easier to read than separate fixture files for this story's surface.
- Cover the error messages by `assert.match(errors[0], /substring/)` — exact string matches are too brittle.
- Round-trip test (Subtask 2.3): write a Domain Map → parse it → assert the parsed structure preserves every domain slug and description. Catches silent semantic loss bugs.

### Anti-Patterns

- Do NOT make the parser permissive ("accept any markdown that mentions domains"). ADR-012 §"Alternatives considered" A is explicitly rejected.
- Do NOT cache results across calls. Each invocation is independent and cheap.
- Do NOT add a `--lenient` mode or any opt-out from strict parsing. ADR-012 §"Alternatives considered" F.
- Do NOT mutate the input markdown or any cell values beyond trimming whitespace. The parser is read-only (AC11).
- Do NOT regex over the entire document looking for "domain-like" lines. The contract is heading-anchored table-immediate.
- Do NOT silently accept `Domain` slugs that fail the regex by lower-casing or kebab-ifying them — reject loudly. Silent fixups create routing bugs (same logic as WT-1's anti-pattern at line 169 of `story-WT-1-swarm-yaml-schema.md`).

### D-IDs Referenced

- **D-004** — grandparent strategic decision (wide-team specialization adoption)
- **D-014** — parent strategic decision (retrofit tooling)
- **D-017** — tactical: Domain Map parser contract (this story implements)
- **ADR-012** — full contract specification

## File List

- `utils/domain-map.js` — new (161 lines; `findDomainMap` cheap detector + `parseDomainMap` full parse-and-validate; ADR-012's 8 contract rules implemented; imports `DOMAIN_SLUG_RE` from `utils/validator.js`)
- `test/domain-map.test.js` — new (25 unit tests covering AC1–AC12 plus round-trip parse→YAML check via Subtask 2.3 plus three anti-pattern guards: silent slug fixups, multiple-section ambiguity, h1/h4 heading-depth rejection)
- `utils/validator.js` — modified (additive: `const DOMAIN_SLUG_RE` → `export const DOMAIN_SLUG_RE` with inline comment naming `utils/domain-map.js (RT-1)` as consumer; no behavior change for existing callers — verified by 367/367 test pass)

## Dev Agent Record

- All 12 ACs implemented; **367/367 full suite passing** (342 pre-RT-1 + 25 new). All existing validator/config/hook suites green — `DOMAIN_SLUG_RE` export is additive only.
- Pure function utility — no IO, no external state. `parseDomainMap(string) → object` shape makes both consumers (RT-2 CLI, RT-3 overlay) trivial.
- **Single source of truth for slug regex** achieved via ESM-to-ESM import. Closes by construction the analog of F-003 (hook-side duplication risk) for the parser/validator pair. Future schema changes to slug shape flow through one constant.
- ADR-012's 8 contract rules each map 1:1 to either the implementation or a test (most map to both). Verified during review.
- **Two judgment calls** flagged for reviewer sanity-check, both confirmed approved:
  1. Invalid-slug rows are **omitted** from `domains[]` (matches duplicate-row behavior — uniform failure modes across error categories).
  2. `findDomainMap` requires **≥1 data row** before returning `found: true` (empty table is functionally absent — RT-3's "is there already one?" check sees no Domain Map).
- No new D-IDs. The slug-regex import (rather than duplicate) prevents F-003-shaped drift by construction; no tactical decision needed.

### Reviewer notes (carried forward)

- **D-017 → verified** (status flipped in decision-log).
- The split between `findDomainMap` (cheap detector) and `parseDomainMap` (full validator) is the right shape per ADR-012 §"Decision" — RT-3's overlay does the cheap check; RT-2's `--write` does the full parse.
- Round-trip test at `test/domain-map.test.js:290-310` emits the flat YAML shape RT-2's CLI will consume. RT-2 should ingest the parser's `domains[]` output directly without re-shaping.
- The `extras` map preserves unknown columns under their original casing — forward-compatible with future Domain Map schema additions (e.g., a `Reviewer` column to opt into reviewer specialization per row, mentioned in ADR-012 §"Forward-compatibility").
- Empty-Domain-Map case (heading + header + separator with zero data rows) returns `found: false` — RT-3 should treat this exactly the same as a missing Domain Map (no special-case needed).

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-29 | Story drafted by architect (RT-1) | architect-2 |
