# Story WT-7: Retrofit-path documentation (README + CLAUDE.md template addendum)

## Status: complete

## User Story

As a user with an existing bmad-swarm project who wants to opt in to wide-team specialization mid-flight,
I want a clear, copy-pasteable retrofit procedure documented in the README,
So that I can adopt the feature without guessing about migration steps or breaking my in-progress work.

## Acceptance Criteria

### AC1: README gains a Wide-Team section with retrofit steps

**Given** the project's `README.md`
**When** I read it after this story lands
**Then** there is a new section (e.g., `## Wide-team specialization`) describing what the feature is in 2-3 sentences
**And** the section contains a copy-pasteable 4-step retrofit procedure matching `architecture.md` §9.2:
1. Ensure `artifacts/design/architecture.md` includes a Domain Map section. Run `/feature` or `/plan` and ask the architect to add it if missing.
2. Edit `swarm.yaml` to add a `team` block (`mode: fixed`, list specializations matching the domain map).
3. Optionally update existing story files to include a `## Domain:` field, matching one of the declared specialists.
4. On the next session, the orchestrator will use fixed-mode routing.

### AC2: README section includes a worked-example `team` block

**Given** the new README section
**When** I read it
**Then** it shows a YAML example mirroring `architecture.md` §3.6 (multiple specializations + a fallback block, well-commented)

### AC3: README section flags the no-silent-migration property

**Given** the new section
**When** I read it
**Then** it states explicitly: "Existing projects without this configuration are unaffected. No automatic migration runs on `bmad-swarm update`."

### AC4: README section flags the dynamic-mode default

**Given** the new section
**When** I read it
**Then** it states: "Dynamic mode (default) is unchanged. Wide-team is opt-in."

### AC5: `templates/CLAUDE.md.template` gains an optional one-liner

**Given** `templates/CLAUDE.md.template`
**When** I read it after this story lands
**Then** there is an optional `{{#if team.mode}}` (or equivalent) reference noting wide-team mode in the project header — OR a small "Team mode: ..." line that renders only when the project has opted in
**And** existing projects without `team.mode` set see no rendered change (the template still produces the current output)

### AC6: Cross-references to architecture.md and ADRs are present

**Given** the new README section
**When** I read it
**Then** it links to `artifacts/design/architecture.md` for the full design and to ADR-004 / ADR-006 for the schema and story-field details

### AC7: No new CLI command is documented or implemented

**Given** the README change
**When** I read it
**Then** there is no mention of a `bmad-swarm migrate-to-fixed` command or similar — retrofit is a manual edit (per `architecture.md` §9.2)

## Tasks

- [ ] Task 1: Add a `## Wide-team specialization` section to `README.md`
  - [ ] Subtask 1.1: Position it logically (likely after the existing "Configuration" or "Getting Started" section)
  - [ ] Subtask 1.2: Cover the 2-3 sentence what-is-it intro
  - [ ] Subtask 1.3: Include the 4-step retrofit procedure verbatim
  - [ ] Subtask 1.4: Include the worked-example YAML block
  - [ ] Subtask 1.5: Include the no-silent-migration and opt-in callouts
  - [ ] Subtask 1.6: Cross-link to architecture.md and ADR-004 / ADR-006
- [ ] Task 2: Update `templates/CLAUDE.md.template` to optionally note `team.mode` when set
  - [ ] Subtask 2.1: Use the template engine's conditional syntax (the existing template uses Mustache-like `{{#if ...}}`); add a small block that renders only when `team.mode` is present
  - [ ] Subtask 2.2: Verify rendering: with `team.mode` absent, output matches the pre-feature output exactly
- [ ] Task 3: If `claude-md-generator.js`'s `buildTemplateData` does not currently expose `config.team`, add it to the data object
  - [ ] Subtask 3.1: Verify the change is additive — no existing template variable is renamed or removed

## Dev Notes

### Architecture Context

This story implements `architecture.md` §9.2 (Retrofit path for existing projects).

The retrofit is **documented**, not automated. There is no `bmad-swarm migrate-to-fixed` CLI command in this feature — that's a candidate follow-up explicitly deferred (architecture.md §10.6).

### Technical Implementation

**Documentation + a tiny template addendum.** No tests required.

For the README change: pure prose + a YAML example. Match the README's existing style (look at section ordering, callout format, code-block fencing).

For the CLAUDE.md template addendum: the existing template uses a small Mustache-style helper (see `claude-md-generator.js`'s `buildTemplateData()`). To render `team.mode` conditionally, you may need to:

1. Add `team` to the `data` object returned by `buildTemplateData(config)`. For example: `team: { mode: config.team?.mode, hasSpecializations: (config.team?.specializations || []).length > 0 }`.
2. Add a conditional block in `templates/CLAUDE.md.template` that renders only when `team.mode` is present and equals `fixed`.

A minimal template addition might look like:

```markdown
{{#if team.mode}}
Team mode: {{team.mode}}{{#if team.hasSpecializations}} (specialized){{/if}}
{{/if}}
```

This adds ONE line to the rendered CLAUDE.md when wide-team is on, and ZERO lines when off. Backward-compat preserved.

### File Locations

- Modify: `README.md`
- Modify: `templates/CLAUDE.md.template`
- Modify (only if needed): `generators/claude-md-generator.js` (`buildTemplateData` to expose `team`)

### Dependencies

None for the README change. The template-addendum task touches `claude-md-generator.js` — no behavioral conflict with WT-1, but if WT-1 hasn't landed yet, `config.team` may be undefined for projects without a `team` block. Use safe-access (`config.team?.mode`) so the absence-case renders nothing.

### Testing Approach

**No tests required.**

If you choose to add a test for the template-addendum (optional, low cost), add a single unit test for `buildTemplateData(config)` confirming that `team` is exposed when present and `team` is `undefined` (or empty) when absent. The renderer's output is verified by the template-engine's own behavior; no need to test it here.

### Anti-Patterns

- Do NOT add a `bmad-swarm migrate-to-fixed` CLI command. Out of scope per architecture.md §9.2 and §10.6.
- Do NOT prompt during `bmad-swarm init` for wide-team setup. Out of scope per architecture.md §9.1 (rationale: no domain map exists at init time).
- Do NOT auto-inject a `team` block into existing `swarm.yaml` files on `bmad-swarm update`. The user must edit `swarm.yaml` themselves; this is the no-silent-migration invariant (architecture.md §8.4, ADR-004).
- Do NOT make the CLAUDE.md template render `Team mode: dynamic` for default projects. The line should be PRESENT only when wide-team is explicitly on. Empty addition for the default path = backward-compat.
- Do NOT introduce a new doc directory like `docs/wide-team.md`. Use the existing README. The architecture document is the single source of design truth; the README is the user-facing entry point. Keep both, don't add a third.

### D-IDs Referenced

- **D-004** — parent strategic decision
- **ADR-004** — `swarm.yaml` schema (referenced from README example)
- **ADR-006** — story `domain:` field (referenced from step 3 of retrofit)
- **D-013** — tactical: CLAUDE.md template renders `Team mode:` line only when `team.mode === "fixed"` (logged during this story; filter at `claude-md-generator.js:94`)

## File List

- `README.md` — modified (new `## Wide-team specialization` section between "Per-Project Customization" and "Artifact System": intro paragraph, two bolded callouts (opt-in default + no-silent-migration), 4-step retrofit procedure verbatim from architecture.md §9.2, worked-example `team:` YAML block with multiple specializations + reviewer + fallback + inline comments, trailing paragraph with routing-tree pointer to orchestrator role doc, cross-refs to architecture.md + ADR-004 + ADR-006)
- `templates/CLAUDE.md.template` — modified (one conditional block added in project header: `{{#if team.mode}}Team mode: {{team.mode}}{{#if team.hasSpecializations}} (specialized){{/if}}{{/if}}`. Renders one line in opt-in projects; zero output in default projects.)
- `generators/claude-md-generator.js` — modified (additive `team` data object in `buildTemplateData` return value: `{ mode: config.team?.mode === 'fixed' ? config.team.mode : undefined, hasSpecializations: (config.team?.specializations || []).length > 0 }`. Inline comment naming D-013 and the WT-7 anti-pattern.)
- `artifacts/context/decision-log.md` — D-013 logged (tactical, full record with rationale linking to anti-pattern at WT-7 story line 126)

## Dev Agent Record

- All 7 ACs implemented across three minimal, additive edits.
- **D-013 verified live** across three rendering paths during review: (a) default project (no team block) → no `Team mode:` line; (b) explicit `team.mode: dynamic` → no `Team mode:` line (filter correctly suppresses); (c) `team.mode: fixed` + specializations → `Team mode: fixed (specialized)` renders. Backward-compat preserved on (a) and (b); opt-in path correct on (c).
- D-013 filter sits at the data-builder layer (rather than the template) — keeps template syntax simple (`{{#if team.mode}}` truthy check, no equality comparator needed), centralizes opt-in semantics next to where defaults are applied, and is single-source-of-truth (template can't bypass).
- Worked example in README adds a reviewer specialization (commented "Optional — reviewer continuity is the consistency anchor by default") beyond the architecture §3.6 example — demonstrates schema permissiveness without making reviewer specialization seem required.
- 4-step retrofit procedure reproduces architecture.md §9.2 verbatim, including the "Run `/feature` or `/plan` and ask the architect to add it if missing" hint in step 1.
- Tests: 342/342 still passing (no new tests — story explicitly says no tests required).

### Reviewer notes (carried forward)

- D-013 → verified (status flipped in decision-log).
- The `hasSpecializations` computation is technically defense-in-depth: WT-1's validator hard-rejects fixed mode with empty specializations, so `hasSpecializations` is always `true` whenever the parent `{{#if team.mode}}` guard fires. The `(specialized)` suffix will therefore always render in fixed mode. This is fine — the suffix is informative either way — but worth noting if the suffix is later removed or extended.
- The README's worked example is a small but valuable enrichment over architecture §3.6's example: more concrete = more copy-pasteable. Future schema changes should land in the architecture spec first; the README example follows.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-29 | Story implemented; README + CLAUDE.md template + generator updated; D-013 logged | dev-2 |
| 2026-04-29 | Review approved; status → complete; D-013 → verified; no findings | reviewer |
