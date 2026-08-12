# ADR-012: Domain Map parser contract — heading-anchored markdown table, strict shape

**D-ID:** D-014 (parent strategic decision — adopt retrofit tooling for wide-team adoption)
**Grandparent D-ID:** D-004 (adopt wide-team specialization architecture)
**Status:** Proposed (pending human approval of `architecture-retrofit.md`)
**Date:** 2026-04-29
**Context:** Retrofit tooling design (shared parser used by Tool A and Tool B). See `artifacts/design/architecture-retrofit.md` §5.

## Context

Both retrofit tools depend on extracting structured data from a Domain Map embedded in `architecture.md`:

- Tool A (`/retrofit-team`) needs to detect whether a Domain Map already exists (to refuse re-runs cleanly).
- Tool B (`bmad-swarm scaffold-team`) needs to read the Domain Map and emit the matching `team:` block.

The Domain Map's format is already specified by `agents/architect.md` §"Domain Map" (added by WT-3): a markdown table with headers `Domain | Description | Components | Anticipated stories` placed under a `## Domain Map` heading. The format is human-authored — by the architect during a fresh design, by the orchestrator overlay during retrofit, or by the user manually.

The question for ADR-012 is: how strict should the parser be? Options range from "accept any markdown that mentions domain words" to "demand byte-exact match to the format in architect.md." The decision matters because:

- The Domain slug is a routing key. If the parser interprets it differently than the schema validator does, routing bugs follow that are very hard to debug.
- Permissive parsing rewards malformed input with a result that may not match what the user thinks they wrote.
- Strict parsing makes shape drift loudly visible, but may frustrate users with minor formatting variations.

## Decision

The Domain Map parser locks the format to a **markdown table immediately under a `## Domain Map` (or `### Domain Map`) heading**, with these contract rules:

1. **Heading anchor.** The parser searches for the first heading whose text is exactly `Domain Map` (case-sensitive, no leading/trailing whitespace), preceded by `## ` or `### ` (case-insensitive on the marker). All other variants (`# Domain Map`, `#### Domain Map`, `## domain map`, `## Domain-Map`) are NOT recognized; the parser reports "no Domain Map found."
2. **Table-immediate.** After the heading and any blank lines, the next non-blank line MUST be a markdown table header (line starting with `|`). The line after MUST be a separator line (cells of `---`). If either is missing, the parser returns an error: "Domain Map at line N is missing the table header."
3. **Required columns: `Domain`, `Description`.** Column names are matched case-insensitively, leading/trailing whitespace stripped. Other columns (e.g., `Components`, `Anticipated stories`) are accepted and recorded in the parsed structure under their original names; future tools can use them. Unknown columns are non-fatal.
4. **Domain cell validation.** The `Domain` cell value MUST match `^[a-z0-9][a-z0-9-]*[a-z0-9]$` — the same regex enforced by `utils/validator.js` for `team.specializations[i].domain`. Any non-matching value is an error: "row at line N has invalid domain slug '<value>'".
5. **Duplicate detection.** Two rows with the same `Domain` slug produce: "row at line N duplicates domain '<value>' first declared at line M."
6. **Description cell pass-through.** The `Description` cell value is stripped of leading/trailing whitespace and copied verbatim. No interpretation, no markdown stripping. If empty, it becomes the empty string (validator allows; `applyDefaults` defaults `description` to `""` per ADR-004 §3.4).
7. **Multiple Domain Map sections.** If two `## Domain Map` headings are found, the parser reports an error: "multiple Domain Map sections at lines N, M; resolve manually." It does NOT pick one.
8. **No reformatting, no mutation.** The parser is read-only. It returns a structured representation of the rows; it never edits the markdown.

The parser exposes two functions (in `utils/domain-map.js`):

```javascript
findDomainMap(markdown: string): {
  found: boolean,
  startLine?: number,    // 1-indexed line of the heading
  endLine?: number,      // 1-indexed line of the last table row
  raw?: string,          // the heading + table text, exactly as in source
}

parseDomainMap(markdown: string): {
  domains: Array<{
    domain: string,
    description: string,
    extras: Record<string, string>,  // any non-{Domain,Description} columns
    line: number,                     // 1-indexed row line for error reporting
  }>,
  errors: string[],
}
```

`findDomainMap` is the cheap detector (used by Tool A's "is there already one?" check). `parseDomainMap` does the full parse-and-validate (used by Tool B's emit path).

## Alternatives considered

- **A. Permissive parser — accept any list-like structure with domain-name-looking strings.** Walk the markdown; find anything resembling a domain enumeration (bulleted lists, tables with various column names, definition lists, etc.); coerce to the schema.

  Rejected because: (a) the Domain slug is a routing key. Multiple plausible interpretations of "what counts as a domain" mean multiple plausible routing decisions, and the user can't tell which the tool picked without reading the parser source. (b) The architect format is already specified and documented in `agents/architect.md`; permissive parsing makes the spec optional, which makes the spec drift over time. (c) Bug class: a user who writes a Domain Map in a permissive form learns to depend on it; later maintenance breaks them. Strict parsing forces a single canonical form from day one.

- **B. Frontmatter YAML.** Require the Domain Map to be expressed as YAML frontmatter at the top of `architecture.md`, parsed with `js-yaml`.

  Rejected because: (a) `architecture.md` is a long-form design document; frontmatter is for short metadata. The Domain Map is content, not metadata. (b) The architect's existing format (a markdown table) is a content choice that fits the document; moving it to frontmatter would be a backward-compat break for projects that already wrote the Domain Map per `agents/architect.md`. (c) Markdown tables render cleanly in GitHub previews and in the user's editor; YAML frontmatter for table-shaped data is awkward to write.

- **C. Sidecar file (`architecture/domain-map.yaml`).** The Domain Map lives in a separate file, parsed by `js-yaml`.

  Rejected because: (a) sidecar files fragment the source of truth — the architect document and its Domain Map should live in one place. (b) Same critique as ADR-006 alternative D ("sidecar story metadata file"): doubles the file count for the same artifact. (c) Breaks the existing `agents/architect.md` spec.

- **D. JSON code block in `architecture.md`.** Express the Domain Map as a fenced ```json``` block under `## Domain Map`.

  Rejected because: (a) the architect's existing format (markdown table) is more readable for humans inspecting the document. (b) Loses the visual review benefit of a rendered table on GitHub. (c) JSON is fussier to author than a markdown table (commas, brackets, quoting).

- **E. Loose regex extraction — pull lines matching a "domain pattern" from the entire document.** No table, no heading anchor, just regex over the full text.

  Rejected because: extreme version of A. Same critique applies, more strongly: zero structural anchors means any text containing a slug-like word becomes "a domain."

- **F. Strict parser AS DEFAULT, with a `--lenient` flag for permissive mode.** Allow the user to opt into looser parsing.

  Rejected because: (a) introduces a forking parsing pattern (one project parses one way, another parses another) for a feature whose value is a single canonical interpretation. (b) The default-strict + opt-in-lenient pattern accumulates complexity over time as users find new "lenient" cases. (c) If users genuinely need flexibility, the right answer is to extend the strict format (e.g., add a column), not to permit ambiguity.

## Consequences

**Positive**

- The slug interpretation in the parser matches the validator (`^[a-z0-9][a-z0-9-]*[a-z0-9]$`). No two-source-of-truth for what's a valid slug.
- Errors are loud and located ("row at line N..."). The user can fix specific rows without trial-and-error.
- The contract matches what `agents/architect.md` documents — one canonical format that both human authors and tools agree on.
- The `extras` field in the parsed row preserves columns the parser doesn't yet understand; future schema additions (e.g., a `Reviewer` column to opt into reviewer specialization per row) require no parser change.
- `findDomainMap` is cheap enough to call on every relevant CLI invocation (no caching needed) — the document is small (single-digit KB), parsing is O(lines).

**Negative**

- Users with malformed Domain Maps see an error and have to fix the formatting. Mitigation: the error message names the offending line and the expected shape; `agents/architect.md` documents the format; the architect (when invoked) writes the format correctly.
- Users who hand-author a Domain Map outside `## Domain Map` (e.g., under a `## Components and Domains` heading) are not recognized. Mitigation: the heading anchor is documented; rename the section.
- Strict parsing means a typo in the heading (`## Domani Map`) is silently ignored as "no Domain Map found." Mitigation: Tool B's error message ("no Domain Map found in architecture.md; run `/retrofit-team` first") tells the user to either run the overlay (which writes the heading correctly) or check the heading.

**Forward-compatibility**

- New columns (e.g., `Reviewer`, `OwnerHandle`, `EpicEstimate`) are accommodated via the `extras` map without parser changes. Tools opt in to reading them.
- A future move from kebab-case to namespaced slugs (e.g., `fe.dashboard`) is a one-line regex update in both the validator AND the parser. ADR-006 §"Forward-compatibility" already mentions this as a future direction.
- A future move to YAML frontmatter at the story-schema level (mentioned in ADR-006 alternative F) does NOT affect this parser — the architecture document and its Domain Map are independent of the story schema.
- If the architect format evolves to require a new mandatory column, ADR-012 evolves with one parser-rule update and a migration note.

## Verification

RT-1 story (Domain Map parser) ACs cover the contract:

1. A valid Domain Map (per the format in `agents/architect.md`) parses with zero errors.
2. A document with no `## Domain Map` heading returns `{ found: false }` from `findDomainMap` and `{ domains: [], errors: [] }` from `parseDomainMap`.
3. A `## Domain Map` heading followed by prose (no table) returns the documented "missing table header" error with the correct line number.
4. A row with an invalid slug (`Backend Auth`, `domain_with_underscore`, `UPPERCASE`) returns the documented invalid-slug error.
5. Two rows with the same slug return the duplicate error naming both line numbers.
6. Two `## Domain Map` headings return the multiple-sections error.
7. A row with extra columns has those columns appear in the `extras` map; required columns are unaffected.
8. The parser is read-only — calling it never modifies the input string (Node strings are immutable, but the function must also not mutate any passed-in references).
9. Round-trip: a Domain Map generated by `/retrofit-team` (the overlay's output, written by the architect spawn per ADR-010) parses cleanly and produces the same structured rows that were used to write the table.

## Referenced by

- `artifacts/design/architecture-retrofit.md` §5
- `utils/domain-map.js` (post-RT-1: the parser implementation)
- `test/domain-map.test.js` (post-RT-1: covers the contract)
- `cli/scaffold-team.js` (post-RT-2: consumer)
- `generators/commands-generator.js:buildRetrofitTeamBody` (post-RT-3: indirect consumer via the orchestrator overlay's "is there an existing Domain Map?" check)
- `agents/architect.md` (the canonical format spec — read by humans, enforced by this parser)
- `artifacts/context/decision-log.md` D-014, D-017
