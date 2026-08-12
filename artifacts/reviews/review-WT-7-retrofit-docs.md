# Review: Story WT-7 — Retrofit-path documentation (README + CLAUDE.md template addendum)

**Story:** `artifacts/implementation/stories/story-WT-7-retrofit-docs.md`
**Reviewer:** reviewer (lenses: `code-quality`, `docs`)
**Date:** 2026-04-29
**Verdict:** **approved**

---

## Summary

WT-7 closes out dev-2's track. Three additive edits land:
1. **`README.md`**: a new `## Wide-team specialization` section between "Per-Project Customization" and "Artifact System" — intro paragraph, two callouts (no-silent-migration + opt-in default), 4-step retrofit procedure verbatim from architecture.md §9.2, worked-example `team` YAML block (mirrors §3.6 with rich comments), pointer to orchestrator role doc for routing rules.
2. **`templates/CLAUDE.md.template`**: one conditional block — `{{#if team.mode}}Team mode: {{team.mode}}{{#if team.hasSpecializations}} (specialized){{/if}}{{/if}}`. Renders one line in opt-in projects; zero output in default projects.
3. **`generators/claude-md-generator.js:buildTemplateData`**: additive `team` data object exposing `team.mode` only when it equals `"fixed"` (D-013 filter).

All 7 ACs pass. **D-013's filter logic verified live across three rendering paths** (default, explicit-dynamic, fixed) — the only path that emits a `Team mode:` line is the explicit-fixed path. The default-project rendering is byte-for-byte unchanged from pre-WT-7. Tests still 342/342 passing.

D-013 is a tactical decision worth highlighting because it's the most subtle judgment call in this story — the choice to filter at the data-builder layer (rather than in the template) keeps template syntax simple AND centralizes the opt-in-semantics next to where defaults are applied. Reviewer agrees with the rationale; status flip recommended.

No findings of any severity.

---

## Acceptance criteria verification

| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | README has `## Wide-team specialization` section with 4-step retrofit procedure | PASS | `README.md` adds the section between "Per-Project Customization" and "Artifact System". The 4-step procedure at `README.md:255-260` reproduces architecture.md §9.2 verbatim: (1) Domain Map check via `/feature` or `/plan`, (2) edit `swarm.yaml` to add `team` block, (3) optional `## Domain:` field on stories, (4) next session uses fixed-mode routing. |
| AC2 | Worked-example YAML block mirroring architecture §3.6 | PASS | `README.md:264-285` shows a multi-specialization `team:` block with `mode: fixed`, three developer specializations (`backend-auth`, `backend-upload`, `frontend-dashboard`) plus a reviewer specialization, and a `fallback:` block with `enabled: true` and `role: developer`. Inline comments document each field's purpose. Mirrors §3.6 with appropriate enrichment (reviewer specialization added to demonstrate the optional-but-supported case). |
| AC3 | "Existing projects unaffected. No automatic migration on `bmad-swarm update`" callout | PASS | `README.md:251` reads verbatim: "**Existing projects without this configuration are unaffected. No automatic migration runs on `bmad-swarm update`.**" Bolded for visibility. |
| AC4 | "Dynamic mode (default) is unchanged. Wide-team is opt-in" callout | PASS | `README.md:249` reads verbatim: "**Dynamic mode (default) is unchanged. Wide-team is opt-in.**" Bolded for visibility. Both AC3 and AC4 callouts placed adjacent to each other immediately after the section's intro paragraph — high-visibility positioning. |
| AC5 | CLAUDE.md template gains optional one-liner; default projects render no change | PASS | `templates/CLAUDE.md.template:5-6` adds the conditional block. **Verified live across three rendering paths**: (a) default project (no team block) → no `Team mode:` line, byte-for-byte identical to pre-WT-7 header; (b) explicit `team.mode: dynamic` → no `Team mode:` line (D-013 filter correctly suppresses); (c) `team.mode: fixed` + specializations → `Team mode: fixed (specialized)` renders. Backward-compat preserved on (a) and (b); opt-in path renders correctly on (c). |
| AC6 | README cross-refs to architecture.md + ADR-004 + ADR-006 | PASS | `README.md:247` (intro paragraph) reads: "See `artifacts/design/architecture.md` for the full design and ADR-004 / ADR-006 in `artifacts/design/decisions/` for the schema and story-field details." All three references present, with concrete file paths. |
| AC7 | No CLI command documented or implemented | PASS | Searched the diff: no `bmad-swarm migrate-to-fixed`, no `migrate`, no new CLI in `bin/`. Step 2 of the retrofit procedure (`README.md:258`) explicitly says "Edit `swarm.yaml`" — manual edit, not a command. Architecture.md §9.2 prescribes manual edits and §10.6 defers any future CLI to a follow-up; both honoured. |

All 7 ACs met.

---

## D-013 deep-dive (the judgment call worth scrutiny)

Per team-lead's specific ask: "the judgment call worth a closer look at `generators/claude-md-generator.js` to confirm the filter does what dev-2 says it does."

### What the filter does

**`generators/claude-md-generator.js:94`**:
```javascript
mode: config.team?.mode === 'fixed' ? config.team.mode : undefined,
```

This evaluates to:
- `'fixed'` when (and only when) `config.team?.mode === 'fixed'`
- `undefined` otherwise — including the case where `config.team?.mode === 'dynamic'` (the default after `applyDefaults()` runs)

The template's `{{#if team.mode}}` block renders **only when** `team.mode` is truthy. `undefined` is falsy → block doesn't render. The string `'fixed'` is truthy → block renders.

### Why the filter is correct

`utils/config.js:applyDefaults` (D-005, ADR-004) sets `config.team.mode = 'dynamic'` for **every** parsed config, regardless of whether the user wrote a `team:` block. Without the filter, every default project would render `Team mode: dynamic` in CLAUDE.md — explicitly forbidden by Story WT-7's anti-pattern at line 126: "Do NOT make the CLAUDE.md template render `Team mode: dynamic` for default projects. The line should be PRESENT only when wide-team is explicitly on."

### Live verification (3 rendering paths exercised)

I generated CLAUDE.md against three swarm.yaml fixtures during this review:

**CASE A — default project (no team block):**
```
# default-proj

Project type: other · Language: 
Autonomy: guided · Artifacts: ./artifacts/


## You are the orchestrator
```
No `Team mode:` line. Byte-for-byte identical to pre-WT-7 header. ✓

**CASE B — explicit `team.mode: dynamic`:**
```
# dyn-proj

Project type: other · Language: 
Autonomy: guided · Artifacts: ./artifacts/


## You are the orchestrator
```
No `Team mode:` line. The D-013 filter correctly suppresses even the explicit-dynamic case (which is semantically equivalent to default-dynamic). ✓

**CASE C — `team.mode: fixed` + one specialization:**
```
# fixed-proj

Project type: other · Language: 
Autonomy: guided · Artifacts: ./artifacts/
Team mode: fixed (specialized)


```
Line renders correctly. The `(specialized)` suffix appears because `team.specializations.length > 0`. ✓

### Filter-design assessment

The choice to filter at the **data-builder layer** rather than in the template is the right call:

- **Template syntax stays simple.** The template uses `{{#if team.mode}}` (truthy check) rather than `{{#if (eq team.mode 'fixed')}}` (equality compare). The existing template engine (`utils/template.js`) supports `{{#if}}` blocks natively; introducing equality comparators would expand the engine's surface area for one use case.
- **Opt-in semantics are centralized.** The decision "render the line only when explicitly opted in" lives next to `applyDefaults()`'s consumer (in `buildTemplateData`), in the same JS file, with an explicit comment naming D-013 and the WT-7 anti-pattern. A future reader trying to understand "why doesn't this line show up?" lands on the answer immediately.
- **The filter is single-source-of-truth.** Future code paths consuming `team.mode` from `buildTemplateData`'s output get the filtered version automatically. The template can't accidentally bypass the filter.

D-013 is correctly classified as **tactical** — it's a one-ternary implementation choice that's reversible by editing one line. The decision-log entry is appropriately scoped (not over-documented as strategic).

**Filter does what dev-2 says it does.** Verified.

---

## Architecture compliance

- **§9.2 (Retrofit path)**: 4-step procedure reproduced verbatim. The README's wording matches the architecture spec word-for-word, including the "Run `/feature` or `/plan` and ask the architect to add it if missing" hint in step 1.
- **§9.1 (No init prompt)**: Honoured — no init prompt added to `cli/init.js` (no diff there).
- **§10.6 (No `bmad-swarm migrate-to-fixed` CLI)**: Honoured — verified by AC7.
- **§3.6 (Worked example)**: Mirrored with appropriate enrichment. The README's example adds a reviewer specialization (commented as "Optional — reviewer continuity is the consistency anchor by default") that the architecture spec doesn't have, demonstrating the schema's flexibility without contradicting it.
- **§8.4 / ADR-004 (No silent migration)**: Honoured — generator does not auto-inject a `team` block; AC3 callout in README documents this explicitly.

No deviation from the design. The README's example is a small enrichment over the architecture spec's example, which is the right scope for user-facing documentation (more concrete = more copy-pasteable).

---

## Anti-pattern compliance (from story Dev Notes)

| Anti-pattern guidance | Honoured |
| --- | --- |
| "Do NOT add a `bmad-swarm migrate-to-fixed` CLI command" | YES — verified by AC7. No new CLI command, no entry in `bin/`. |
| "Do NOT prompt during `bmad-swarm init` for wide-team setup" | YES — `cli/init.js` is not in the diff. Init flow unchanged. |
| "Do NOT auto-inject a `team` block into existing `swarm.yaml` files on `bmad-swarm update`" | YES — generator does not write to `swarm.yaml`; only reads it. AC3 callout documents the no-silent-migration property out loud. |
| "Do NOT make the CLAUDE.md template render `Team mode: dynamic` for default projects" | YES — D-013 filter at `claude-md-generator.js:94` suppresses both default-dynamic AND explicit-dynamic cases. **Verified live** across CASE A and CASE B (above). |
| "Do NOT introduce a new doc directory like `docs/wide-team.md`" | YES — content lives in the existing `README.md`. No new directory created. |

All five anti-patterns honoured.

---

## Lens: docs

**Strengths**

- **Section placement reads naturally.** Inserted between "Per-Project Customization" (which discusses customizing agent behavior) and "Artifact System" (which discusses how agents coordinate). Wide-team specialization sits at the right conceptual depth: it's a customization that affects coordination.
- **Bolded callouts for the two load-bearing properties** (no-silent-migration + opt-in default) at `README.md:249-251`. High visibility — a user skimming for "is this safe to ignore?" gets the answer in two lines without reading further.
- **The 4-step procedure is copy-pasteable.** Each step is a single, concrete action; numbering is preserved; no ambiguity about ordering.
- **The worked-example YAML is well-commented.** Inline comments explain the purpose of every field (`mode:`, `domain:`, `description:`, `fallback:`). A user can read just the comments and understand the schema. The example also includes a reviewer specialization (with a commented "Optional — reviewer continuity is the consistency anchor by default" note) that demonstrates the schema's permissiveness without making it seem mandatory.
- **The trailing paragraph at line 287** ("Stories without a `## Domain:` field route to the generic-dev fallback...") is a useful piece of connective tissue — it tells a reader who's just absorbed the schema what happens at runtime, with a pointer to the orchestrator role doc for full routing rules.
- **The intro paragraph is dense and accurate.** "Each specialist holds bounded context for the entire session and only handles stories within its domain — addressing long-context drift without abandoning the long-running multi-story workflow." This is the elevator pitch for the entire feature, distilled to one sentence. Good.

**Findings (none)**

No findings on the docs lens.

---

## Lens: code-quality

**Strengths**

- **Generator change is minimal and additive.** 8 lines added to `buildTemplateData`'s return value (the `team:` object). No existing fields renamed, removed, or touched.
- **Inline comment names D-013 and the anti-pattern.** `claude-md-generator.js:90-93` carries: "D-013: Render the 'Team mode' line in CLAUDE.md only when the user has explicitly opted in to fixed mode. applyDefaults() sets team.mode to 'dynamic' for every project, so a raw passthrough would render the line for every project — which the WT-7 story anti-patterns forbid." Future reader gets the full context immediately.
- **Safe-access patterns** (`config.team?.mode`, `(config.team?.specializations || []).length > 0`) protect against the case where `config.team` is undefined (not currently possible after `applyDefaults`, but defensive against future refactors of the defaults logic).
- **`hasSpecializations` is computed correctly.** It uses `.length > 0` which is `false` for the default empty array — but the parent `{{#if team.mode}}` guard means `hasSpecializations` is only ever consumed in the opt-in path, so the `(specialized)` suffix is meaningfully informative when it appears.
- **Template change is one conditional block.** Three lines in the template, no other changes. Doesn't disturb existing variable interpolation or the rest of the rendered output.
- **D-013's filter is single-source-of-truth.** The filter sits in one place; no duplication across template + data layer; no conditional logic spread across two files.

**Findings (none)**

No findings on the code-quality lens.

**One observation (non-finding):** The `hasSpecializations` computation reads `(config.team?.specializations || []).length > 0`, which evaluates to `false` for both "no specializations array" and "empty specializations array". The validator (WT-1) makes the second case impossible in fixed mode (`team.mode is "fixed" but team.specializations is empty` is a hard-rejection per AC4 of WT-1). So in practice `hasSpecializations` is always `true` when `team.mode === 'fixed'` reaches this point. The `(specialized)` suffix in CLAUDE.md will therefore always render in fixed mode. This is fine — the suffix is informative either way — but it's worth noting that the conditional inside `{{#if team.hasSpecializations}}` is currently load-bearing only as defense-in-depth. Not a finding; just a fact about the runtime behavior.

---

## Decision Traceability

- **D-004** (parent strategic — wide-team specialization adoption): Verified — README documents the user-facing surface of D-004; CLAUDE.md template signals when the project has opted in.
- **ADR-004** (`swarm.yaml` `team` block schema): Verified — referenced from README intro at line 247. The README's worked-example YAML is the user-facing surface of ADR-004's schema. ADR-004 status remains `verified` from prior WT-1 review.
- **ADR-006** (story `domain:` field): Verified — referenced from README intro at line 247. Step 3 of the retrofit procedure uses the field documented by ADR-006. Status remains `verified` from prior WT-2 review.
- **D-013** (CLAUDE.md template renders `Team mode:` line only when `team.mode === "fixed"`): **Verified — implemented**. Filter at `claude-md-generator.js:94` matches the decision wording verbatim. Verified live across three rendering paths (default, explicit-dynamic, fixed). Status flip recommended: D-013 → `verified`.
- **D-005** (`swarm.yaml` `team` block schema, the live decision behind `applyDefaults`'s `team.mode = 'dynamic'` default): Honoured — D-013's rationale explicitly cites D-005's defaulting behavior as the reason the filter is necessary. Decision-chain integrity preserved.
- **No new D-IDs created beyond D-013** during implementation — correct posture; D-013 is the only tactical choice that warranted a log entry.

---

## Findings register dedupe

Read `artifacts/context/findings-register.md` at review start. Three existing entries (F-001 + F-002 from WT-1 validator, F-003 from WT-5 hook) — all are unrelated to WT-7's surface (README + template + generator). No duplicates to reconcile. WT-7 produces no new findings.

---

## Verdict

**approved**

All 7 acceptance criteria met. No findings of any severity. WT-7 closes out the wide-team specialization feature's user-facing surface with three minimal, well-scoped additive changes.

D-013's tactical filter does exactly what dev-2 said it does — verified live across three rendering paths. The choice to filter at the data-builder layer (rather than the template) is the right call: keeps template syntax simple, centralizes opt-in semantics, and makes the filter single-source-of-truth.

D-013 status flip to `verified` recommended. With this approval, dev-2's track is complete (WT-2 ✓ WT-6 ✓ WT-3 ✓ WT-4 ✓ WT-7 ✓) and the wide-team feature is implementation-complete pending the post-feature `bmad-swarm update` regen step.
