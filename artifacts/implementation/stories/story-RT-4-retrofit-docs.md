# Story RT-4: Retrofit-tooling documentation (README + architect doc + CHANGELOG)

## Status: complete

## User Story

As a bmad-swarm user evaluating whether and how to retrofit wide-team into my existing project,
I want clear, copy-pasteable documentation for both `/retrofit-team` and `bmad-swarm scaffold-team`,
So that I can adopt the feature confidently without needing to read the architecture doc first.

## Acceptance Criteria

### AC1: README gains a "Retrofit tooling" subsection under "Wide-team specialization"

**Given** the project's `README.md` after this story lands
**Then** the existing "Wide-team specialization" section (added by WT-7) has a new subsection (e.g., `### Retrofit tooling for existing projects`)
**And** the subsection introduces both tools in 2-3 sentences
**And** the subsection cross-links to `artifacts/design/architecture-retrofit.md` for the full design

### AC2: README documents the `/retrofit-team` slash command

**Given** the new subsection
**Then** there is a paragraph describing what `/retrofit-team` does (proposes a Domain Map; iterates with the user; pauses for approval; spawns one architect to perform the file edit)
**And** the paragraph notes that human approval is required (per CLAUDE.md `architecture` invariant)

### AC3: README documents the `bmad-swarm scaffold-team` CLI

**Given** the new subsection
**Then** there is a paragraph describing the CLI command, its default print-to-stdout behavior, and the `--write` flag
**And** the paragraph mentions `swarm.yaml.bak`, the round-trip validation, and the refuse-on-conflict behavior at a high level

### AC4: README includes a worked-example chain

**Given** the new subsection
**Then** there is a copy-pasteable transcript showing:
1. The user invoking `/retrofit-team` in a Claude Code session.
2. The user inspecting the generated YAML via `bmad-swarm scaffold-team` (no flag).
3. The user injecting via `bmad-swarm scaffold-team --write`.
4. The user running `bmad-swarm validate` to confirm.
**And** the transcript matches the example in `architecture-retrofit.md` §2.4

### AC5: README explicitly states the no-silent-migration property

**Given** the new subsection
**Then** there is a callout stating that neither `bmad-swarm init` nor `bmad-swarm update` invokes either retrofit tool
**And** that both tools are deliberate user actions

### AC6: `agents/architect.md` gains the retrofit-entry-path addendum

**Given** the architect agent doc after this story lands
**Then** the "Domain Map (when using fixed-mode wide team)" section has the retrofit-entry-path paragraph from `architecture-retrofit.md` §8.1
**And** the paragraph cross-links to `architecture-retrofit.md` §3.2–§3.4

### AC7: CHANGELOG mentions the new tools

**Given** `CHANGELOG.md` after this story lands
**Then** there is an entry under the next-version heading mentioning:
- New CLI command: `bmad-swarm scaffold-team`
- New slash command: `/retrofit-team`
**And** each entry references the parent strategic decision D-014 and the architecture document `artifacts/design/architecture-retrofit.md`

### AC8: No new CLI or slash command is documented beyond the two specified

**Given** the README change
**Then** the documentation does not mention any `bmad-swarm migrate-to-fixed`, `bmad-swarm doctor` retrofit-related audit, or `--auto` mode
**And** the documentation does not promise auto-running on `update` or `init`

## Tasks

- [x] Task 1: Add the `### Retrofit tooling for existing projects` subsection to `README.md`
  - [x] Subtask 1.1: Position immediately after the existing "Wide-team specialization" content
  - [x] Subtask 1.2: 2-3 sentence intro
  - [x] Subtask 1.3: Paragraph for `/retrofit-team` (AC2)
  - [x] Subtask 1.4: Paragraph for `bmad-swarm scaffold-team` (AC3)
  - [x] Subtask 1.5: Worked-example chain transcript (AC4)
  - [x] Subtask 1.6: No-silent-migration callout (AC5)
  - [x] Subtask 1.7: Cross-links to `architecture-retrofit.md` and ADRs 010/011/012
- [x] Task 2: Apply the architect-doc addendum
  - [x] Subtask 2.1: Add the retrofit-entry-path paragraph from `architecture-retrofit.md` §8.1 to `agents/architect.md`'s "Domain Map (when using fixed-mode wide team)" section
  - [x] Subtask 2.2: Verify the addendum does not interfere with the existing four heuristics
- [x] Task 3: Update CHANGELOG
  - [x] Subtask 3.1: Add an entry under the next-version heading per AC7
- [x] Task 4: Verify all cross-links resolve
  - [x] Subtask 4.1: Each path mentioned in the README exists
  - [x] Subtask 4.2: Each ADR referenced exists in `artifacts/design/decisions/`

## Dev Notes

### Architecture Context

This story documents the retrofit tooling described in `architecture-retrofit.md`. It does not introduce new design — it surfaces what's already designed in the architecture document and the three ADRs (010/011/012).

**No tests required.** Documentation only. Cross-link verification (Task 4) is a manual check.

### Technical Implementation

For the README: pure prose plus a transcript code block. Match the README's existing style (look at how WT-7 added the "Wide-team specialization" section for tone, callout format, and cross-link convention).

For the architect doc addendum: a single paragraph appended to the existing "Domain Map (when using fixed-mode wide team)" section. The paragraph text is in `architecture-retrofit.md` §8.1 — copy verbatim or near-verbatim.

For CHANGELOG: match the existing entry style (look at the WT-1 through WT-7 entries from the wide-team feature for the tone).

### File Locations

- Modify: `README.md`
- Modify: `agents/architect.md`
- Modify: `CHANGELOG.md`

### Dependencies

- **RT-2** must land first so the README transcript reflects the actual command output.
- **RT-3** must land first so the README can describe the slash command behavior accurately.
- RT-1 is implicit (RT-2 and RT-3 depend on it).

### Testing Approach

No automated tests. Cross-link verification (Task 4) is manual: open each linked path and confirm it exists.

### Anti-Patterns

- Do NOT introduce a third tool, mode, or flag in the documentation. Document only what RT-1, RT-2, and RT-3 implement.
- Do NOT promise behaviors that aren't implemented (no "future doctor audit", no "smart merge", no "auto-detect from code"). Per `architecture-retrofit.md` §1.3 non-goals.
- Do NOT add a `docs/retrofit.md` or any new doc directory. The README is the user-facing entry point; `architecture-retrofit.md` is the design source of truth. Two surfaces is enough.
- Do NOT duplicate the worked example into multiple sections of the README. One transcript, one place.
- Do NOT change the existing "Wide-team specialization" content from WT-7. The new subsection is additive.

### D-IDs Referenced

- **D-004** — grandparent strategic decision
- **D-014** — parent strategic decision (this feature)
- **D-015, D-016, D-017** — tactical decisions backing the three ADRs
- **D-013** — tactical (CLAUDE.md template renders Team mode line — referenced for context, not implemented here)
- **D-022** — tactical (logged during RT-4: doc-shape choices — sibling subsection placement, two-bullet CHANGELOG, "two opt-in tools" framing)

## File List

- `README.md` — modified (new subsection)
- `agents/architect.md` — modified (one-paragraph addendum)
- `CHANGELOG.md` — modified (one entry)

## Dev Agent Record

(populated by developer)

## Reviewer Notes

- All 8 ACs verified PASS (see `artifacts/reviews/review-RT-4-retrofit-docs.md` §"Acceptance Criteria Verification").
- Verdict: **approved-with-minor-issues** — no high findings; one medium docs-lens drift (M-1: README transcript stdout block omits the `# model: opus` per-domain comment and the trailing reviewer-hint block that `cli/scaffold-team.js:emitTeamBlockForPrint` injects post-yaml.dump). M-1 does not block because AC4 anchors the transcript on `architecture-retrofit.md` §2.4 (which the README matches verbatim); the as-implemented CLI evolved the comment payload during RT-2 (Subtask 1.4) post-architecture, so the transcript trails the live CLI by ~10 lines of comments. User copy-paste remains valid YAML.
- Two low findings logged advisory: L-1 (D-022 entry could foreground the bundling rationale earlier — clarity nit, no rewrite required); L-2 (CHANGELOG `[Unreleased]` past tense — verdict: matches 2.0.2 style, no change required).
- Cross-checks performed: (a) all 5 cross-link targets resolve; (b) AC8 forbidden tokens (`migrate-to-fixed`, `doctor`, `--auto`) confirmed absent across README + CHANGELOG + architect.md; (c) README `/retrofit-team` description faithful to `generators/commands-generator.js:buildRetrofitTeamBody` (orchestrator-overlay + iterative proposal + explicit human approval + spawn-one-architect verified per-step); (d) WT-7 prose untouched (additive subsection only); (e) F-004 confirmed not touched (out of RT-4 scope).
- D-022 bundle (three coupled doc-shape choices under one D-ID) approved as logged — the shared "two-tool" framing makes splitting fragmentation rather than granularity.
- Decision-log status updates applied on this approval: **D-014 `accepted` → `verified`** (final child story signed off, full traceability through implementation + verification); **D-018 `accepted` → `verified`** (architecture approval gate satisfied end-to-end across RT-1 through RT-4); D-022 marked `verified` (the doc-shape choices the entry tracks all landed and were reviewed).
- Lesson for future doc stories: when a README transcript ships well after the implementing CLI's print-format evolves, anchor either to the as-built CLI output (and add a regen test) or explicitly note "abbreviated; live output adds comments" — the current "anchor to architecture spec example" works but creates a maintenance trail of doc-vs-CLI drift over time.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-29 | Story drafted by architect (RT-4) | architect-2 |
| 2026-04-29 | Implementation: README + architect.md + CHANGELOG verified satisfying AC1-AC8; D-022 logged for tactical doc-shape choices; status flipped to in-progress for reviewer | dev (RT-4) |
| 2026-04-29 | Reviewer: approved-with-minor-issues (M-1 medium advisory, L-1/L-2 low); D-014 + D-018 promoted to verified; D-022 verified; story status complete | reviewer (RT-4) |
