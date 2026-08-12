# Review: Story WT-4 — Orchestrator agent doc · Team mode + routing rules

**Story:** `artifacts/implementation/stories/story-WT-4-orchestrator-doc-team-mode.md`
**Reviewer:** reviewer (lenses: `code-quality`, `docs`)
**Date:** 2026-04-29
**Verdict:** **approved**

---

## Summary

WT-4 is a clean, additive-only documentation change to `agents/orchestrator.md`. The diff (verified via `git diff HEAD`) contains 2 surgical hunks: (1) a `domain:` sub-field added to the Invariants `bmad-assembly` example with a one-line clarifying note about its mode-dependent requirement, and (2) a new `## Team mode` section inserted between `## Entry points` and `## Signal → lens lookup` containing intro paragraph with cross-refs, two-mode bullet list, fixed-mode override paragraph, routing decision tree, mid-epic injection decision tree, and two bolded-lead behavioral rules. Zero existing prose modified or removed.

All 7 ACs pass. Wording is faithful to `architecture.md` §6.1-§6.6 with appropriate in-doc cross-ref adjustments (e.g. "see §6.3" → "see 'Mid-epic injection' below"). Required top-level `bmad-assembly` keys (`entry_point`, `complexity`, `autonomy`, `team`, `rationale`) are unchanged — Pass 1 contract preserved.

The `agents/orchestrator.md` source-of-truth file was edited; `.claude/agents/orchestrator.md` correctly left untouched per anti-pattern guidance (regen deferred to end-of-feature batch). No findings.

---

## Acceptance criteria verification

| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | `## Team mode` section after Entry points; describes both modes; explicit "fixed mode governs autonomy/phase-skipping but NOT team-sizing" | PASS | `agents/orchestrator.md:62` opens `## Team mode` (Entry points ends at line 60; Signal→lens lookup begins at line 108 — placement correct). Section intro at line 64 references `swarm.yaml:team.mode`. Both modes described in bullet form at lines 66-67: dynamic "current behavior, complexity-scoring + entry-point tables size the team per task"; fixed "roster pre-spawned per `swarm.yaml:team.specializations`. Complexity scoring and entry-point tables continue to govern **autonomy**... and **phase-skipping**... but **not team sizing**." Explicit AC1 requirement satisfied verbatim. |
| AC2 | Routing decision tree from architecture.md §6.2 documented (5 branches) | PASS | `agents/orchestrator.md:71-82` defines `### Routing rules (fixed mode)` with all 5 branches verbatim from §6.2: matched specialist → silent, unmatched-but-set → mid-epic injection, unset+one-off → fallback, unset+domain-aligned → mid-epic injection, multi-match → pick-closest+flag-reviewer. Trailing line 84 explicitly notes "In dynamic mode this tree does not apply" — useful guard against accidental application. |
| AC3 | Mid-epic injection decision tree (3 branches with autonomy-aware sub-branches) | PASS | `agents/orchestrator.md:86-102` defines `### Mid-epic injection decision tree` with all 3 main branches matching §6.3: (a) ≥2 stories + architecturally significant → SPAWN with three autonomy-aware sub-branches (auto=announce-then-proceed, guided=pause-and-ask, collaborative=pause-and-ask); (b) 1 story only → ROUTE TO FALLBACK; (c) ambiguous → PAUSE regardless of mode. Tree shape and branch wording match §6.3 verbatim. |
| AC4 | Two specialist-spawn-discipline rules: "≥2-story rule" + "every mid-epic spawn writes decision-log entry" | PASS | Both rules present as bolded-lead paragraphs. Line 104: "**Do not grow the specialist roster for one-off work.** A new specialist is spawned only when ≥2 stories are anticipated in its domain OR the domain is architecturally significant... One-off cross-cutting work routes to the generic-dev fallback." — wording matches AC4 spec verbatim. Line 106: "**Every mid-epic spawn writes a one-line decision-log entry.** When you spawn a new specialist mid-epic, log to `artifacts/context/decision-log.md` as a tactical decision: `D-NNN — <date> — Spawned <specialist-domain> mid-epic — <one-line reason>`. See `methodology/decision-traceability.md` 'Team-Shape Decisions' for the full template." — matches AC4 verbatim AND correctly cross-references the `methodology/decision-traceability.md` Team-Shape Decisions section landed by WT-6. |
| AC5 | Fixed-mode override-of-complexity-tables paragraph | PASS | `agents/orchestrator.md:69` reproduces architecture §6.5 verbatim: "**In fixed mode, do not let the complexity table or entry-point table change team size.** Both tables still inform autonomy override (e.g., complexity ≥12 promotes auto→guided) and phase-skipping (e.g., `bug-fix` skips Definition/Design). They do NOT pick the agents to spawn. The agents are the static roster declared in `swarm.yaml:team.specializations` plus the optional fallback. Use the tables for orchestration decisions other than sizing." |
| AC6 | `bmad-assembly` example shows optional `domain:` sub-field; note that it's required for specialized dev/reviewer in fixed mode | PASS | `agents/orchestrator.md:21` adds `domain: <optional kebab-case slug, e.g. backend-auth>` as a sub-field on `team[]` entries. One-line explanatory note at line 27: "The `domain:` sub-field on a `team[]` entry is optional in dynamic mode and **required** for specialized `developer` / `reviewer` entries in fixed mode (see `## Team mode` below). The required top-level keys (`entry_point`, `complexity`, `autonomy`, `team`, `rationale`) are unchanged — `teamcreate-gate` Pass 1 still enforces them." Note explicitly affirms that Pass 1 contract is preserved — important guard against ambiguity. |
| AC7 | Cross-refs to D-004, ADR-005; mid-epic spawn rule references ADR-007 + ADR-008 | PASS | `agents/orchestrator.md:64` (Team mode section intro): "This implements the parent strategic decision **D-004** and decision **D-006** (two-mode team shape), with full rationale in **ADR-005**. The mid-epic spawn rule below also depends on **ADR-007** (generic-dev fallback default-on) and **ADR-008** (`teamcreate-gate` Pass 2 enforcement, which validates the `domain:` sub-field documented in Invariants)." All five required references present (D-004, D-006, ADR-005, ADR-007, ADR-008) in a single intro paragraph with parenthetical disambiguation for each ADR. Goes beyond AC7 minimum (which only required D-004, ADR-005, ADR-007, ADR-008 — D-006 is additive). |

All 7 ACs met.

---

## Architecture compliance

- **§6.1 (Team Mode section)**: section heading, placement (after Entry points), and two-mode bullet list match verbatim. The implementation adds slightly richer enumeration of which prior tables continue to apply unchanged in dynamic mode (line 66) — a reading aid for orchestrators that doesn't contradict §6.1 and reduces ambiguity about the dynamic-mode contract.
- **§6.2 (Routing rules tree)**: all 5 branches reproduced byte-for-byte. The "see §6.3 (mid-epic injection)" cross-ref from the architecture is appropriately rewritten to "see 'Mid-epic injection' below" since the reference resolves locally inside the role doc.
- **§6.3 (Mid-epic injection tree)**: all 3 main branches + 3 autonomy sub-branches reproduced verbatim. The autonomy-aware sub-branches are critically important — they activate the orchestrator's autonomy-mode rules on the spawn decision, per ADR-005.
- **§6.4 (Specialist-spawn discipline rules)**: both bolded-lead paragraphs reproduced verbatim, with the architecture's "See §11 for full convention" rewritten to "See `methodology/decision-traceability.md` 'Team-Shape Decisions' for the full template" — correctly points at the canonical doc that WT-6 landed (rather than at the architecture's own §11). This is a better cross-ref than the architecture spec itself (which §11 only specifies the templates; the methodology doc is now the published convention).
- **§6.5 (Fixed-mode override)**: paragraph reproduced verbatim.
- **§6.6 (Bmad-assembly block in fixed mode)**: the example is implemented differently from the architecture spec — instead of reproducing the architecture's standalone fixed-mode `bmad-assembly` example, dev-2 added the `domain:` sub-field to the EXISTING Invariants schema example (which already shows the canonical block shape) and added a one-line note explaining its mode-dependent requirement. This is a stronger choice than reproducing a second example — keeping a single canonical schema in Invariants prevents future drift between two co-existing examples. The only thing the architecture spec example illustrated that this approach loses is a concrete "fixed-mode rationale" string (e.g., "routing story 1.3 to backend-auth specialist (matches story.domain)"), but that's an example-context concern not a schema concern. **Approved as a reasonable design improvement, not a deviation.**

No semantic deviation from the design. The §6.6 implementation choice is a deliberate consolidation that reduces drift surface area; not flagged.

---

## Anti-pattern compliance (from story Dev Notes)

| Anti-pattern guidance | Honoured |
| --- | --- |
| "Do NOT delete or weaken any existing orchestrator rule. New rules are additive." | YES — verified via `git diff HEAD`. Both hunks add new content; zero existing lines modified or removed. The 5 Invariants, the Complexity scoring table, Entry points table, Signal→lens lookup, Autonomy override rules, Human override, Rejection handling, Context curation, D-ID traceability, Spawn-prompt structure, Coordination discipline, Retrospective, Brainstorming, and Model selection sections are all untouched. |
| "Do NOT remove the complexity-scoring or entry-point tables" | YES — both tables present at lines 36-44 and 48-58, unchanged. The new Team mode section explicitly affirms they retain their meaning for autonomy and phase-skipping (line 67, line 69). |
| "Do NOT introduce a new `## Behavioral Rules` section if one doesn't exist — match the doc's existing structure (rules live as prose within topical sections)" | YES — no `## Behavioral Rules` heading was added. The two new specialist-spawn-discipline rules (AC4) live as bolded-lead paragraphs (`**Do not grow the specialist roster...`, `**Every mid-epic spawn writes...`) inside the Team mode section, matching the doc's existing pattern for behavioral rules. |
| "Do NOT change the `bmad-assembly` block's REQUIRED keys" | YES — verified by AC6 evidence above. The required top-level keys remain `entry_point`, `complexity`, `autonomy`, `team`, `rationale`. The new note at line 27 explicitly reaffirms this. The `domain:` sub-field is on individual `team[]` entries, not at the top level. `teamcreate-gate` Pass 1 contract is preserved (and the note says so out loud). |
| "Do NOT modify `.claude/agents/orchestrator.md` directly" | YES — dev-2's report confirms the generated file was not touched. Confirmed via observed `<!-- bmad-generated:58821f16 -->` hash in the identity-orchestrator skill — the generator will pick this up on next `bmad-swarm update` batch regen. |

All five anti-patterns honoured.

---

## Lens: docs

**Strengths**

- **Pure-additive diff with surgical edits.** Only 2 hunks: (1) the Invariants schema example gains one optional sub-field + one explanatory paragraph; (2) a new `## Team mode` section is inserted between Entry points and Signal→lens lookup. No risk of regressing the rest of the orchestrator's documented behavior.
- **Section placement matches story Dev Notes guidance.** The Dev Notes called for insertion "between `## Entry points` and `## Signal → lens lookup` so it sits with sizing-related material" — verified at line 62 (after Entry points line 60, before Signal→lens line 108).
- **The §6.6 implementation choice is better than the spec.** Architecture §6.6 proposes a separate fixed-mode example block; dev-2 instead extended the canonical Invariants example with the optional sub-field + a clarifying note. This consolidates the schema source of truth and prevents two examples from drifting apart. The note explicitly disambiguates dynamic-mode (optional) vs fixed-mode-specialized (required) requirements, AND reaffirms that Pass 1's required-key contract is unchanged. One example, three pieces of information. Strong.
- **Cross-references are concrete and current.** The AC4 mid-epic-spawn rule cross-refs `methodology/decision-traceability.md`'s "Team-Shape Decisions" section — this is the WT-6 deliverable that landed today. By pointing at the methodology doc rather than the architecture's own §11, future readers get a single canonical convention source.
- **The "In dynamic mode this tree does not apply" guard at line 84** is a small but valuable addition. The routing decision tree could otherwise be misread as universally applicable; this single line removes the ambiguity.
- **The autonomy-aware sub-branches in the mid-epic decision tree** are reproduced exactly. These are critically important because they tie the spawn decision back to the orchestrator's existing autonomy-override rules — readers familiar with the doc's autonomy-handling pattern will immediately recognize the convention.
- **Bolded-lead paragraph style for behavioral rules** matches the doc's existing convention (e.g., "Brainstorming as process step", "Coordination discipline" sections use the same pattern). Visual consistency with the rest of the file maintained.
- **D-006 cross-ref is added beyond AC7's minimum.** AC7 only required D-004 (parent), ADR-005 (primary), ADR-007 + ADR-008. The implementation also adds D-006 explicitly, which is the logged child decision for two-mode team shape — slightly more discoverable for a future reader following the D-ID chain.

**Findings (none)**

No high, medium, or low findings. Documentation-only change scoped per the story spec, with verbatim fidelity to architecture §6 and one positive design improvement at §6.6 (single canonical example).

---

## Lens: code-quality

Documentation-only change. No code, no tests, no logic. Markdown structure is well-formed:
- `## Team mode` and `### Routing rules (fixed mode)` / `### Mid-epic injection decision tree` heading levels nested correctly.
- Two `bmad-assembly` fenced code blocks (the existing one in Invariants and the routing/mid-epic ASCII trees) all balanced.
- The two ASCII decision trees use Unicode box-drawing characters (`├─`, `└─`, `│`) consistent with the architecture spec — these render correctly in monospace markdown viewers and in plain-text consumers (e.g., the orchestrator session itself).
- Bolded-lead paragraphs use `**...**` consistently with the rest of the doc.

Nothing to assess on a code-quality axis beyond markdown hygiene, which is clean.

---

## Decision Traceability

- **D-004** (parent strategic — wide-team specialization adoption): Verified — Team mode section names D-004 explicitly at line 64 as the parent. The orchestrator doc now operationalizes the parent decision into concrete rules.
- **D-006** (Two-mode team shape): **Verified — documented**. WT-4 is the surface that exercises D-006 most directly. Status flip recommended: D-006 → `verified` in `decision-log.md`.
- **D-008** (Generic-dev fallback default-on): Honoured — referenced via ADR-007 at line 64. The mid-epic injection decision tree's "ROUTE TO FALLBACK" branch (line 100) is the runtime expression of D-008. (Note: dev-2's escalation note mentions D-006/D-008 as referenced; D-008 is referenced via ADR-007 in the Team mode intro, which is the correct anchor.)
- **ADR-005** (full two-mode design rationale): Verified — referenced at line 64. The doc's two-mode bullet list and fixed-mode-override paragraph are the user-facing surface of ADR-005's decision.
- **ADR-007** (fallback default-on): Verified — referenced at line 64 with parenthetical disambiguation. Mid-epic decision tree's fallback branch implements ADR-007's runtime contract.
- **ADR-008** (teamcreate-gate Pass 2 enforcement): Verified — referenced at line 64 with the explicit note that the gate "validates the `domain:` sub-field documented in Invariants." This closes the loop between the doc's `bmad-assembly` schema documentation and WT-5's hook implementation. ADR-008 status remains `verified` from prior WT-5 review.
- **No new D-IDs created** during implementation — correct posture for a faithful documentation transcription. Dev-2's report confirms "no tactical D-IDs logged".

---

## Findings register dedupe

Read `artifacts/context/findings-register.md` at review start. Three existing entries (F-001 + F-002 from WT-1 validator, F-003 from WT-5 hook) — all are code-side concerns unrelated to WT-4's docs surface. No duplicates. WT-4 produces no new findings.

---

## Verdict

**approved**

All 7 acceptance criteria met. No findings of any severity. WT-4 is a clean, additive-only documentation change that respects architecture.md §6 verbatim, follows every anti-pattern guard in the story Dev Notes, and includes one positive design improvement at §6.6 (single canonical `bmad-assembly` example with mode-dependent note rather than two co-existing examples).

D-006 status flip to `verified` recommended. The orchestrator doc now provides deterministic, auditable rules for fixed-mode team-shape behavior — closing the doc-side surface of the wide-team specialization feature.

Generated `.claude/agents/orchestrator.md` is intentionally out-of-sync until end-of-feature `bmad-swarm update` batch regen — flagged in dev-2's notes; not a review-blocking concern.
