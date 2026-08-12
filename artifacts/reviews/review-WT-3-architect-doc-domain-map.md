# Review: Story WT-3 — Architect agent doc · Domain Map deliverable

**Story:** `artifacts/implementation/stories/story-WT-3-architect-doc-domain-map.md`
**Reviewer:** reviewer (lenses: `code-quality`, `docs`)
**Date:** 2026-04-29
**Verdict:** **approved**

---

## Summary

WT-3 is a clean, additive-only documentation change to `agents/architect.md`. The diff (verified via `git diff HEAD`) contains 5 hunks: a new sub-bullet in Outputs, a new `## Domain Map (when using fixed-mode wide team)` section between Outputs and Quality Criteria, a new Quality Criteria bullet, and a new Behavioral Rule. Zero existing lines modified or removed.

All 5 ACs pass. The new prose mirrors `architecture.md` §5.1-§5.4 verbatim where required, and the table example in the Format subsection reproduces §5.2 byte-for-byte (column headers, separators, all three example rows). Cross-references to D-004 plus ADR-004/ADR-006/ADR-009 appear in the section intro.

The `agents/architect.md` source-of-truth file was edited; `.claude/agents/architect.md` was correctly left untouched per the story's anti-pattern guidance (regen deferred to end-of-feature batch). No findings.

---

## Acceptance criteria verification

| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | Outputs sub-bullet for `Domain map section` (mandatory under fixed; recommended >10 stories) | PASS | `agents/architect.md:41` adds the sub-bullet under "Architecture document". Wording is verbatim from architecture.md §5.1: "list of named domains... Used by the orchestrator to seed `swarm.yaml:team.specializations`. Mandatory only when the project intends to use `team.mode: fixed`; recommended for any project larger than ~10 stories regardless of mode." Cross-ref to "Domain Map (when using fixed-mode wide team)" section is present at end of bullet. |
| AC2 | New Domain map section showing the table format and the four heuristics | PASS | `agents/architect.md:45-74` defines `## Domain Map (when using fixed-mode wide team)`. Subsection `### Format` (line 51) embeds the example table from architecture.md §5.2 byte-for-byte: columns `Domain | Description | Components | Anticipated stories`, three example rows (`backend-auth`, `backend-upload`, `frontend-dashboard`) reproduced exactly. Subsection `### Heuristics` (line 67) lists all four rules in order: ≥2-story rule, architecturally-significant exception, cross-cutting dependencies, orthogonality test — wording matches §5.2's heuristics list. |
| AC3 | Behavioral Rules gain the Domain-Map rule | PASS | `agents/architect.md:113` adds: "**Produce a domain map when the project uses fixed-mode wide team.** Read `swarm.yaml:team.mode`. If `fixed`, the domain map section is mandatory and feeds `swarm.yaml:team.specializations`. If `dynamic`, the section is optional but recommended for projects with >10 anticipated stories. Domain decomposition follows the ≥2-story heuristic (see "Domain Map (when using fixed-mode wide team)" above for the full set of heuristics)." Reproduces architecture.md §5.3 verbatim except for the cross-ref target adjustment from §Domain Map → "Domain Map (when using fixed-mode wide team) above" — appropriate adjustment since the §reference resolves locally inside the role doc. |
| AC4 | Quality Criteria gains a Domain-Map check | PASS | `agents/architect.md:89` adds: "If `team.mode: fixed`, every domain in the map has at least one specialist declared in the proposed `swarm.yaml:team.specializations`, and every `specializations[].domain` corresponds to a row in the map." Reproduces architecture.md §5.4 verbatim. |
| AC5 | D-004 + ADR-004/006/009 cross-references present in the new section | PASS | `agents/architect.md:47` (Domain Map section intro): "It implements the parent strategic decision **D-004** (adopt wide-team specialization architecture) and respects the schema constraints established by **ADR-004** (`swarm.yaml` `team` block schema), **ADR-006** (story `domain:` field for routing), and **ADR-009** (one role doc per role; specialization lives in the spawn brief, NOT in per-specialist `.md` files). See `artifacts/design/architecture.md` §5 for the full rationale." All five references present (D-004 + 3 ADRs + architecture §5 anchor). Goes beyond AC5's minimum (which only required D-004 and the three ADRs). |

All 5 ACs met.

---

## Architecture compliance

- §5.1 (Outputs sub-bullet): wording reproduced verbatim, with one local cross-ref adjustment to point to the new in-doc section.
- §5.2 (Format + heuristics): table reproduced byte-for-byte (columns, separators, example rows). All four heuristics present in correct order with matching wording.
- §5.3 (Behavioral rule): reproduced verbatim with an in-doc cross-ref adjustment (`§Domain Map heuristics in this doc` → `"Domain Map (when using fixed-mode wide team)" above`). Semantically equivalent.
- §5.4 (Quality criterion): reproduced verbatim.
- ADR-009 §Decision: honoured — the new section explicitly states "specialization lives in the spawn brief, NOT in per-specialist `.md` files", reinforcing ADR-009's one-role-doc-per-role rule for any reader of the architect doc.

The implementation also adds **one** piece of original prose not strictly required by the architecture spec: the second paragraph of the Domain Map section (line 49) defining what a "domain" is — "a coherent slice of the codebase or product that warrants its own bounded execution context". This is a useful framing aid for first-time readers and does not contradict any existing definition; it functions as connective tissue between the section heading and the format table. Not flagged as an issue.

No deviation from the design.

---

## Anti-pattern compliance (from story Dev Notes)

| Anti-pattern guidance | Honoured |
| --- | --- |
| "Do NOT change the existing architect role description, expertise, inputs, or behavioral rules unrelated to the Domain Map" | YES — verified via `git diff HEAD`. All 5 hunks add new content; zero existing lines modified or removed. Inputs section (lines 17-23) is untouched; existing Behavioral Rules (lines 91-111) are untouched; pre-existing Outputs sub-bullets are untouched. |
| "Do NOT add the Domain Map to the architect's Inputs" | YES — Domain Map appears only in Outputs and the new dedicated section, never in Inputs. |
| "Do NOT bake in a specific number of domains as a 'good' target" | YES — the doc cites the ≥2-story heuristic as the rule and references >10 stories as a project-size threshold for *recommending* a domain map (not for prescribing domain count). No "good count" target appears anywhere. |
| "Do NOT modify `.claude/agents/architect.md` directly" | YES — dev-2's report explicitly notes the generated file is out-of-sync until `bmad-swarm update` regenerates it; only the source `agents/architect.md` was touched. Confirmed via the `<!-- bmad-generated:fdedb03b -->` hash drift observed in this session: the generated file's hash has shifted relative to its prior value, signalling the regen handshake will pick this up on next `bmad-swarm update`. |

All four anti-patterns honoured.

---

## Lens: docs

**Strengths**

- Pure-additive diff: the 5 hunks all add new content. No risk of regressing existing architect guidance (Inputs, ADR rules, decision-classification rule, etc.).
- Section placement (between Outputs and Quality Criteria) reads naturally — readers encounter the deliverable description in Outputs, then the format/heuristics in the dedicated section, then the verification rule in Quality Criteria, then the behavioral activation rule at the bottom. This matches the doc's existing top-to-bottom flow.
- Cross-references are concrete: full ADR names with parenthetical disambiguation ("ADR-004 (`swarm.yaml` `team` block schema)", "ADR-006 (story `domain:` field for routing)", "ADR-009 (one role doc per role...)"). A reader hunting for the schema constraints has unambiguous breadcrumbs.
- The example table preserves the realistic, varied example values from architecture.md §5.2 (3 different example domains spanning backend-auth, backend-upload, frontend-dashboard with realistic story counts and component paths). This is much more useful than placeholder rows would be.
- The Domain Map section's intro paragraph (line 49) defines "domain" in concrete terms before showing the format. This is a small but valuable concession to the architect-as-first-time-reader who hasn't read the architecture spec yet.
- The Behavioral Rule preserves the "bold-lead, paragraph form" style of the doc's other rules (verified — every existing rule starts with `**...**` bold-lead followed by a paragraph). Visual consistency maintained.

**Findings (none)**

No high, medium, or low findings.

---

## Lens: code-quality

Documentation-only change. No code, no tests, no logic. Markdown structure is well-formed:
- `## Domain Map` and `### Format` / `### Heuristics` heading levels nested correctly.
- Fenced code block (lines 55-63) balanced; nested ` ```markdown ` fence renders correctly inside the example.
- Numbered list for heuristics uses `1.` `2.` `3.` `4.` consistently with bold-lead names matching the architecture spec's wording.
- Table syntax (lines 58-62) uses correct GFM pipe-table separators.

Nothing to assess on a code-quality axis beyond markdown hygiene, which is clean.

---

## Decision Traceability

- **D-004** (parent strategic — wide-team specialization adoption): Verified — section intro names D-004 as the parent at line 47. Implementation supports the parent decision by formalizing the architect's domain-map deliverable.
- **ADR-004** (`swarm.yaml` `team` block schema): Verified — referenced at line 47. The architect's domain map is correctly described as the upstream of `swarm.yaml:team.specializations` (matches ADR-004's specializations[].domain field). Status remains `verified` from prior WT-1 review.
- **ADR-006** (story `domain:` field for routing): Verified — referenced at line 47. Note at line 65 explicitly states the kebab-case slug "matches the regex enforced for `swarm.yaml:team.specializations[].domain` and the story `## Domain:` field" — keeps ADR-004 and ADR-006 in sync at the spec level. ADR-006 status remains `verified` from prior WT-2 review.
- **ADR-009** (one role doc per role; specialization in spawn brief): Verified — referenced at line 47 with explicit anti-pattern reminder ("NOT in per-specialist `.md` files"). The architect doc now reinforces ADR-009 wherever a reader might wonder "should I emit per-specialist files?". Status flip recommended: ADR-009 → `verified` (this is the first review surface that exercises ADR-009's spec).
- **No new D-IDs created** during implementation — correct posture for a faithful documentation transcription. Dev-2 confirms "no tactical D-IDs logged".

---

## Findings register dedupe

Read `artifacts/context/findings-register.md` at review start. Two existing entries (F-001, F-002) — both from WT-1 and unrelated to WT-3's surface (a docs-only edit to a role file). No duplicates to reconcile. WT-3 produces no new findings.

---

## Verdict

**approved**

All 5 acceptance criteria met. No findings of any severity. WT-3 is a clean, additive-only documentation change that respects architecture.md §5 verbatim, follows every anti-pattern guard in the story Dev Notes, and reinforces ADR-009's one-role-doc rule for future readers of the architect role file.

Generated `.claude/agents/architect.md` is intentionally out-of-sync until end-of-feature `bmad-swarm update` batch regen — flagged in dev-2's notes; not a review-blocking concern.
