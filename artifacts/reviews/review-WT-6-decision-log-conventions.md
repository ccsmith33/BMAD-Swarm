# Review: Story WT-6 — Decision-log conventions for team-shape decisions

**Story:** `artifacts/implementation/stories/story-WT-6-decision-log-conventions.md`
**Reviewer:** reviewer (lenses: `code-quality`, `docs`)
**Date:** 2026-04-29
**Verdict:** **approved**

---

## Summary

WT-6 lands a clean, additive-only documentation change to `methodology/decision-traceability.md`. The new `## Team-Shape Decisions` section (41 lines, sits between "Decision Supersession" and "Quality Criteria") faithfully transcribes both templates from `architecture.md` §11.1 and §11.2 byte-for-byte, and the reviewer-audit-posture subsection mirrors §11.3.

Diff verified pure-additive against `git HEAD` — no existing section was modified. All 5 ACs pass. The "5 mid-epic spawns per epic" advisory is correctly flagged as a future iteration (NOT v1), matching anti-pattern guidance from the story Dev Notes.

No findings. Approved as-is.

---

## Acceptance criteria verification

| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | New `## Team-Shape Decisions` section describing both entry shapes | PASS | Section heading at `methodology/decision-traceability.md:153`. Section intro (lines 153-157) explicitly describes both shapes: "spawning a new specialist mid-epic, or toggling `swarm.yaml:team.mode` between `dynamic` and `fixed`". Two distinct subsections follow: `### Mid-epic specialist spawn (tactical, one-line)` (line 159) and `### team.mode toggle (strategic, full record)` (line 172). Placement is between "Decision Supersession" (ends line 151) and "Quality Criteria" (line 194), matching Subtask 1.1. |
| AC2 | Mid-epic spawn template matches architecture.md §11.1 verbatim | PASS | `methodology/decision-traceability.md:163-168` reproduces the §11.1 template byte-for-byte: heading shape `## D-NNN — Spawned <role>-<domain> mid-epic`, Date, Source enum (`orchestrator (auto) | orchestrator (after human approval)`), Reason. The follow-up sentence about `autonomy ≠ auto` paused-and-asked spawns (line 170) also mirrors §11.1's clarification about the `human via orchestrator (guided)` Source variant. |
| AC3 | `team.mode` toggle template matches architecture.md §11.2 verbatim | PASS | `methodology/decision-traceability.md:176-186` reproduces every field from §11.2: Date, Classification: Strategic, Source: human, Rationale (one paragraph), Affects (`ARCH:domain-map, swarm.yaml, Stories:*-*`), Status: accepted, ADR, Referenced by. Field order, casing, and example values all match. |
| AC4 | Reviewer audit posture documented; >5 spawns per epic flagged as future-iteration only | PASS | `methodology/decision-traceability.md:188-192` states "the reviewer's existing decision-log audit (see `agents/reviewer.md`) extends naturally to team-shape entries — no separate audit configuration is required for v1" — matches §11.3 verbatim and AC4's "informational" framing. The future-iteration advisory check (line 192) explicitly says "**not** part of v1 scope and is noted here only to record the option" — this is the exact anti-pattern guard the story Dev Notes called out at line 96. |
| AC5 | D-004 and ADR-005 cross-references present | PASS | `methodology/decision-traceability.md:157`: "This convention derives from `architecture.md` §11 and **ADR-005** (two-mode team shape). The parent strategic decision is **D-004** (adopt wide-team specialization architecture)." Both references present in section intro, exactly as AC5 requires. |

All 5 ACs met.

---

## Architecture compliance

- §11.1 (Mid-epic spawn schema): template fields, ordering, and the "paused-and-asked" follow-up clarification all match.
- §11.2 (`team.mode` toggle schema): every required field present, field order preserved, example values (`ARCH:domain-map, swarm.yaml, Stories:*-*`) reproduced exactly.
- §11.3 (Reviewer audit hook): natural-extension framing, future-iteration deferral, and the >5-spawn cadence example all match the architecture's wording.
- ADR-005 §Decision: the new section reinforces the dynamic/fixed model coexistence ("toggling `swarm.yaml:team.mode` between `dynamic` and `fixed`") consistent with ADR-005's per-project-not-per-task constraint (ADR-005 §Decision item 3).

No deviation. No ADR required.

---

## Anti-pattern compliance (from story Dev Notes)

| Anti-pattern guidance | Honoured |
| --- | --- |
| "Do NOT introduce a new D-ID format or supersession rule" | YES — section explicitly says "tracked under the same D-ID system described above" (line 155). No new format introduced. |
| "Do NOT add code-level enforcement of mid-epic spawn logging" | YES — change is documentation-only; no code touched. |
| "Do NOT modify any existing section beyond adding the new section" | YES — verified via `git diff HEAD`. Diff is pure-additive: 41 new lines inserted; zero existing lines modified or removed. |
| "Do NOT bake the cap of 5 mid-epic spawns per epic into v1" | YES — line 192 explicitly states "**not** part of v1 scope and is noted here only to record the option." |

All four anti-patterns honoured.

---

## Lens: docs

**Strengths**

- Pure-additive diff: zero risk of regressing the rest of `decision-traceability.md`. Verified directly via `git diff HEAD` — only 41 new lines, no modifications elsewhere.
- Section placement (after "Decision Supersession", before "Quality Criteria") matches Subtask 1.1's "or wherever flows naturally given the doc's structure" guidance. Quality Criteria at the bottom is the natural anchor for "everything covered above"; team-shape conventions belong in the body, not the criteria summary.
- Both templates are wrapped in fenced ` ```markdown ` blocks identical to the architecture spec's wrapping — a copy-paste mismatch was a real risk for a "verbatim" requirement, and dev-2 avoided it.
- Cross-references use the same `**ADR-005**` and `**D-004**` bold-style as the rest of the doc, keeping visual consistency.
- The "Reviewer audit posture" subsection adds a useful nuance the architecture spec doesn't spell out: explicitly stating that mid-epic spawns are checked "the same way any other tactical entry is checked: D-ID present, status valid, summary self-explanatory" (line 190). This is a fair extrapolation from the §11.3 "extends naturally" language and gives a future reviewer concrete checks to run.

**Findings (none)**

No high, medium, or low findings. Documentation-only change, scoped per the story spec, with verbatim template fidelity.

---

## Lens: code-quality

Documentation-only change. No code, no tests, no logic. Markdown structure is well-formed (fenced code blocks balanced; section heading levels consistent with the rest of the doc — `##` for top-level sections, `###` for subsections). Nothing to assess on a code-quality axis beyond markdown hygiene, which is clean.

---

## Decision Traceability

- **D-004** (parent strategic — wide-team specialization adoption): Verified — section intro names D-004 as the parent (line 157). Implementation supports the parent decision by formalizing how team-shape decisions are recorded.
- **ADR-005** (two-mode team shape): Verified — section intro cites ADR-005 as the convention source (line 157). Templates are consistent with ADR-005's per-project mode selection (ADR-005 §Decision item 3) — note that the `team.mode` toggle is treated as strategic precisely because ADR-005 §Decision item 3 says "Switching modes mid-project is a strategic decision and gets a full ADR record."
- **No new D-IDs created** during implementation. Story Dev Notes line 95 explicitly told dev-2 not to introduce new format/supersession rules; that guidance was followed. Dev-2's report confirms "no tactical D-IDs logged".
- **D-012 reservation:** acknowledged — D-012 is reserved for dev-1's WT-5 js-yaml decision and is not used here.

---

## Findings register dedupe

Read `artifacts/context/findings-register.md` at review start. Two existing entries (F-001 `defaults.model` unvalidated, F-002 `team.fallback.role` not enum-validated) — both from WT-1 and unrelated to WT-6's surface (a docs file). No duplicates to reconcile. WT-6 produces no new findings.

---

## Verdict

**approved**

All 5 acceptance criteria met. No findings of any severity. WT-6 is a clean, additive-only schema-doc transcription that respects architecture.md §11 verbatim and follows every anti-pattern guard in the story Dev Notes.
