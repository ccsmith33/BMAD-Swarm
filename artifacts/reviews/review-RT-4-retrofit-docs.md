# Review — Story RT-4 (Retrofit-tooling documentation)

- **Date:** 2026-04-29
- **Reviewer:** reviewer (team `bmad-rt4-finish`)
- **Story:** `artifacts/implementation/stories/story-RT-4-retrofit-docs.md`
- **Lenses:** `code-quality` + `docs` (no `test-coverage` — doc-only story per Dev Notes)
- **Verdict:** **approved-with-minor-issues**

All 8 ACs are met. No high-severity findings. One medium-severity docs-lens finding (M-1: README transcript stdout block omits two comment artifacts the live CLI injects) is logged below as advisory; it does not block approval because (a) AC4 explicitly anchors the transcript against `architecture-retrofit.md` §2.4 — which the README does match verbatim — and (b) the missing content is comment metadata, not YAML structure, so a user copy-pasting will produce a valid `team:` block. Two low-severity items round out the review.

This is the final story of the retrofit feature (D-014). On approval, D-014 promotes from `accepted` → `verified`.

---

## Acceptance Criteria Verification

| AC | Status | Evidence |
| --- | --- | --- |
| **AC1** README gains a "Retrofit tooling" subsection under "Wide-team specialization" | PASS | `README.md:291` `### Retrofit tooling for existing projects` is a sibling of the existing `### Retrofit procedure (existing projects)` (line 254) and `### Worked example` (line 263) under the `## Wide-team specialization` parent at line 246. Subsection introduces both tools at line 293 in 2 sentences. Cross-link to `artifacts/design/architecture-retrofit.md` present at line 293. |
| **AC2** README documents `/retrofit-team` | PASS | `README.md:295` paragraph names: orchestrator overlay, reads `architecture.md`, proposes Domain Map iteratively, "explicit human approval (architecture is approval-gated per the project's CLAUDE.md invariant)", spawns one architect for the file edit. Refuse cases listed (already-configured / missing architecture / existing Domain Map). |
| **AC3** README documents `bmad-swarm scaffold-team` CLI | PASS | `README.md:297` paragraph names: read-only stdout default, `--write` flag, `swarm.yaml.bak` (rolled, single backup), atomic write, `loadSwarmConfig` round-trip validation, refuse-on-conflict with unified diff. |
| **AC4** Worked-example chain | PASS (with M-1 caveat) | `README.md:299-336` four-step transcript matches `architecture-retrofit.md` §2.4 verbatim modulo a small re-wording of step 3's success-message lines. The transcript is copy-pasteable. **See M-1** for the divergence between the transcript and the *as-implemented* CLI output. |
| **AC5** No-silent-migration callout | PASS | `README.md:340` explicit callout: "Neither `bmad-swarm init` nor `bmad-swarm update` invokes either retrofit tool. The user types the slash command, approves the proposed Domain Map, and runs the CLI explicitly — every edit is a deliberate action." |
| **AC6** `agents/architect.md` retrofit-entry-path addendum | PASS | `agents/architect.md:76-78` `### Retrofit entry path` subsection appended at the end of "Domain Map (when using fixed-mode wide team)". Carries the §8.1 paragraph from `architecture-retrofit.md` near-verbatim. Cross-link to `architecture-retrofit.md` §3.2–§3.4 present. The four heuristics above (lines 67-74) are untouched. |
| **AC7** CHANGELOG entry | PASS | `CHANGELOG.md:5-25` `[Unreleased]` block frames the feature, two `### New` bullets (one per tool, both citing **D-014**), `### Docs` subsection covering README + architect.md, `### References` listing architecture doc + ADR-010/011/012 + D-IDs. AC requires "each entry references parent strategic decision D-014 and the architecture document `artifacts/design/architecture-retrofit.md`" — both bullets reference D-014; both reference `architecture-retrofit.md`. |
| **AC8** No new CLI/slash command beyond the two specified | PASS | `grep -nE "migrate-to-fixed\|doctor\|--auto" README.md CHANGELOG.md agents/architect.md` returns zero hits. No language promising auto-running on `update` or `init`; the no-silent-migration callout (AC5) is the explicit counter-statement. |

All 8 ACs PASS. Story acceptance is met.

---

## Decision Traceability

### Forward traceability (D-IDs referenced by the story → verified in implementation)

| D-ID | Type | Status before | Status after this review | Evidence |
| --- | --- | --- | --- | --- |
| **D-004** | Strategic (grandparent) | verified | verified (no change) | Referenced as the parent of D-014 in CHANGELOG and README; not re-verified (out of RT-4 scope — verified during WT-7). |
| **D-014** | Strategic (parent of this feature) | accepted | **verified** (promoted by this approval) | Both `### New` CHANGELOG bullets reference D-014 (line 11 and line 12). README §"Retrofit tooling for existing projects" implements the user-facing surface D-014 specifies. RT-1, RT-2, RT-3 already verified the implementation surfaces; RT-4 closes the documentation surface — the last child of D-014. |
| **D-015** | Tactical (overlay-vs-spawn, ADR-010) | verified (RT-3) | verified (no change) | README line 295 paragraph for `/retrofit-team` describes "spawns one architect teammate whose only job is to insert the approved Domain Map verbatim into `architecture.md` — the architect spawn is a write-delegate, not a designer", which is the verbatim shape D-015 chose. CHANGELOG line 12 cites D-015 by name. |
| **D-016** | Tactical (write-safety, ADR-011) | verified (RT-2) | verified (no change) | README line 297 names all 5 ADR-011 rules: rolled `.bak`, refuse-on-conflict with diff, atomic write, round-trip via `loadSwarmConfig`, restore on failure (implicit via "writes atomically, and round-trips the result through `loadSwarmConfig` to validate before declaring success"). CHANGELOG line 11 cites D-016. |
| **D-017** | Tactical (parser contract, ADR-012) | verified (RT-1) | verified (no change) | CHANGELOG line 11 cites D-017 by name; the parser is the unspoken precondition for `scaffold-team` reading the Domain Map. |
| **D-018** | Tactical (human approval gate) | accepted | **verified** (this is the final approval-gated artifact ship of the feature) | D-018 gated implementation start; RT-4 ships the final user-facing artifact, completing the chain. Recommend status promotion. |

### Backward traceability (new D-IDs created during RT-4)

| D-ID | Classification | Verdict | Notes |
| --- | --- | --- | --- |
| **D-022** — RT-4 documentation shape (sibling subsection + two-bullet CHANGELOG + "two opt-in tools" framing) | Tactical | **Approved as logged** | Three coupled doc-shape choices bundled into one D-ID. Per `methodology/decision-classification.md`, bundling is appropriate when the choices share a load-bearing rationale. The dev's rationale ("shared 'two-tool' framing makes splitting feel like fragmentation") is sound: all three choices flow from the same architectural framing in `architecture-retrofit.md` §1.1. Splitting into D-022/023/024 would create three entries that all cite the same upstream rationale — fragmentation, not granularity. **See L-1** for a lesson on entry granularity. |

### ADR traceability

| ADR | Status | Notes |
| --- | --- | --- |
| ADR-010 (overlay vs. spawn) | Accepted | Cross-linked from README line 293 and CHANGELOG line 22. |
| ADR-011 (write safety) | Accepted | Cross-linked from README line 293 and CHANGELOG line 23. |
| ADR-012 (parser contract) | Accepted | Cross-linked from README line 293 and CHANGELOG line 24. |

No ADR needs status promotion from this review (all three already flipped to Accepted under D-018).

### Decision-log status updates (to be applied on approval)

- D-014: `accepted` → **`verified`** (final child story of the feature signed off; the strategic decision now has full traceability through implementation + verification)
- D-018: `accepted` → **`verified`** (architecture approval gate satisfied end-to-end; all four child stories shipped and reviewer-approved)

---

## Findings

Findings register read at review start; F-001/F-002/F-003 are existing advisory follow-ups unrelated to RT-4; F-004 is explicitly out of RT-4 scope per dev brief. No new IDs invented; the medium and low items below are advisory and would be added to the register only if they remain unaddressed past RT-4 closeout. None block this approval.

### M-1 (medium, docs lens) — README transcript omits two comment-block artifacts the live CLI injects

**Where:** `README.md:309-325` (the `bmad-swarm scaffold-team` no-flag stdout transcript).

**Claim:** The transcript shows a clean `team:` YAML block. The live `cli/scaffold-team.js:emitTeamBlockForPrint` (lines 202-221) post-processes the `js-yaml` dump to inject:

1. A `# model: opus  # uncomment to override defaults.model` comment line **after every `domain:` line** (lines 208-213).
2. A trailing 4-line reviewer-specialization hint block (lines 215-219):
   ```
       # To add per-domain reviewer specialization, append entries with:
       #   - role: reviewer
       #     domain: <one of the above>
   ```

Neither is in the README transcript. A user running the documented command verbatim today gets ~10 more lines of comments than the README shows.

**Why this is medium, not high:** AC4 anchors the transcript against `architecture-retrofit.md` §2.4 (which also shows the cleaner form — the comments were a later RT-2 implementation detail per Subtask 1.4, post-architecture). The story's own AC is met by matching §2.4. The user gets *more* than the docs promise (extra commented-out hints), not less, and the YAML the user copy-pastes is structurally identical and valid. The risk surface is purely "user is briefly surprised that real output has extra comments," not "user runs the command and it fails."

**Why it's still worth flagging:** Team-lead's reviewer brief explicitly tasked: "does the README transcript match the *actual* output of `cli/scaffold-team.js`?" The answer is "no, it matches the architecture spec which the CLI later extended in RT-2." This is a docs/code drift in the making, exactly the kind of thing the docs lens is supposed to catch.

**Suggested fix (advisory, post-RT-4):** Either (a) update the README transcript to include the `# model: opus` comment after each `domain:` line and the trailing reviewer hint block (faithful to the as-implemented CLI; ~10 added lines), or (b) add a one-line note above the transcript: "(Output abbreviated; the live CLI also emits commented `# model:` and reviewer-specialization hints — copy-paste-safe to keep or strip.)" Option (b) is cheaper. Either is a single-line follow-up touch when the README is next edited; neither blocks RT-4 approval.

**Suggested register entry on closeout:** F-005 (new ID), severity advisory, opens with the wording above, decision_trail line: `2026-04-29 — by reviewer — initial — flagged during RT-4 review; out of RT-4 scope per AC4 anchoring on architecture-retrofit.md §2.4`.

### L-1 (low, code-quality lens) — D-022 bundle of three coupled choices is correct, but the entry text could foreground the bundling rationale earlier

**Where:** `artifacts/context/decision-log.md:247-254` (D-022).

**Claim:** Bundling three doc-shape choices under one D-ID is the right call (see Decision Traceability above). The D-022 entry as written is structurally fine — Decision field labels the three sub-choices `(1)`, `(2)`, `(3)`; Rationale explains each. However, the bundling rationale itself ("the three choices flow from a shared 'two-tool' framing") is buried at the end of the Rationale field rather than stated up front. A future audit reading D-022 cold has to read 80% of the entry before understanding why three choices share an ID.

**Why low:** Pure clarity nit. The entry is correct; the structure works; the bundling decision was sound. This affects auditability of the decision log as it grows, not the correctness of RT-4.

**Suggested fix (advisory):** When the decision log is next touched, prepend one sentence to D-022's Decision field: "Three coupled doc-shape choices bundled into one D-ID because they share the 'two-tool' architectural framing from `architecture-retrofit.md` §1.1; splitting would create three entries with identical upstream rationale." Then keep the existing `(1)/(2)/(3)` structure. Non-blocking.

### L-2 (low, docs lens) — `[Unreleased]` block uses past tense, mildly inconsistent with conventional changelog imperative/present mood under unreleased

**Where:** `CHANGELOG.md:7` and `:16-17` ("…gains a new subsection", "…gains a 'Retrofit entry path' note").

**Claim:** The dev's call-out flagged this as a judgment item. Conventional changelog wisdom under `[Unreleased]` is present-tense or imperative ("Add a Retrofit tooling subsection to README"); the dev used the same past-perfect form as the released 2.0.2 entry.

**Verdict on the bundle question:** **Past tense is acceptable here, no change required.** Three reasons:

1. The `[Unreleased]` content is identical in shape to what will be in `[2.0.3]` once the heading flips at release time. Re-tensing once at release is busywork the project hasn't historically done (2.0.0/2.0.1/2.0.2 all use the same tense in `### Fixed`/`### New`/`### Docs` bullets — past tense throughout).
2. The dev's mimicry of 2.0.2's style is itself the right pattern: matches existing conventions, lower review surface.
3. The bullets are inarguably clear in either tense.

**Action:** None. Logged as L-2 only because dev explicitly raised it — the answer is "no change."

---

## Cross-checks performed

1. **README cross-link existence** (Task 4): `artifacts/design/architecture-retrofit.md`, `adr-010-retrofit-team-overlay-vs-spawn.md`, `adr-011-scaffold-team-write-safety.md`, `adr-012-domain-map-parser-contract.md`, `artifacts/context/decision-log.md` — all 5 present and resolve.

2. **AC8 forbidden-token grep**: `grep -nE "migrate-to-fixed|doctor|--auto"` across `README.md`, `CHANGELOG.md`, `agents/architect.md` returns zero hits. AC8 satisfied.

3. **README `/retrofit-team` description vs. `commands-generator.js:buildRetrofitTeamBody`**: README line 295 paragraph claims orchestrator-overlay + iterative proposal + explicit human approval + spawn one architect for file edit + refuse on already-configured / missing architecture / existing Domain Map. `generators/commands-generator.js:223-292` (`buildRetrofitTeamBody`) implements all four claims:
   - "Refuse if wide-team is already configured" (step 1, lines 228)
   - "Refuse if architecture is missing" (step 2, line 230)
   - "Detect existing Domain Map" (step 3, lines 232-237) — covers the "existing Domain Map" refuse case via the `refuse / append / replace` prompt
   - "Spawn ONE architect for the file edit" with verbatim Domain Map and "do not author / do not write an ADR" (step 8, lines 263-284)
   - Human-approval gate present at step 7 (line 261)
   README description is faithful to the implementation.

4. **README transcript vs. live `scaffold-team` output**: Drift identified — see M-1 above.

5. **WT-7 prose unmodified**: The existing `### Retrofit procedure (existing projects)` (lines 254-261) and `### Worked example: \`team\` block in \`swarm.yaml\`` (lines 263-289) are untouched. The new RT-4 subsection is purely additive.

6. **Anti-pattern compliance** (Story Anti-Patterns section):
   - No third tool / mode / flag introduced. ✓
   - No "future doctor" / "smart merge" / "auto-detect" promises. ✓
   - No new `docs/retrofit.md` directory. ✓
   - Worked example appears once, in one place. ✓
   - WT-7 content unmodified. ✓
   - F-004 not touched (out of scope per dev brief). ✓
   - `.claude/agents/` and `.claude/commands/` untouched (regenerate via `bmad-swarm update` post-approval per orchestrator's standing process). ✓

---

## Test coverage assessment

Not applicable. RT-4 is documentation-only per Dev Notes; no automated tests required. Cross-link verification (Task 4) is a manual check, performed above.

---

## Architecture compliance

RT-4 implements documentation for an architecture (`architecture-retrofit.md`) that itself is a child design under `architecture.md`. The documentation:

- Surfaces D-014's two tools per architecture-retrofit.md §1.1's "Two tools, one chain" framing.
- Honors §6.4's "no silent migration — explicit principle" via the README §"No silent migration" callout.
- Surfaces §8.1's retrofit-entry-path note in `agents/architect.md` per the architecture's explicit task assignment.
- Cross-links to all three ADRs and the architecture doc itself, preserving the design-of-record traceability chain.

No deviations. RT-4 documents what the architecture specifies, no more, no less.

---

## Summary

**Verdict: approved-with-minor-issues.** All 8 ACs met. No high-severity findings. One medium-severity docs/code-drift finding (M-1) and two lows (L-1 clarity, L-2 tense — non-issue). All findings are advisory.

**Next steps:**
1. Reviewer (this report): update story file `status: in-progress` → `complete`; record dev notes; flip D-014 to `verified` and D-018 to `verified` in `decision-log.md`.
2. Orchestrator (post-approval): run `bmad-swarm update` to regenerate `.claude/agents/` and `.claude/commands/` from the modified `agents/architect.md` and `generators/commands-generator.js`. Write retrospective to `artifacts/context/lessons-learned.md`.
3. Optional follow-up (any future README edit): consider M-1 advisory fix.

Feature D-014 (retrofit tooling) is implementation-complete on RT-4 sign-off.
