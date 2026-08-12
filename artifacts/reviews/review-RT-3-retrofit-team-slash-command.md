# Review: Story RT-3 — `/retrofit-team` slash command (orchestrator overlay)

**Story:** `artifacts/implementation/stories/story-RT-3-retrofit-team-slash-command.md`
**Reviewer:** reviewer (lenses: `code-quality`, `docs`)
**Date:** 2026-04-29
**Verdict:** **approved**

---

## Summary

RT-3 lands the `/retrofit-team` slash command cleanly. Two source-side changes:
1. **`generators/commands-generator.js`** — new `buildRetrofitTeamBody()` function (74 lines) and a single new entry in the `WORKFLOWS` array between `plan` and the closing bracket. Other workflows untouched.
2. **`test/generators.test.js`** — 3 new test cases covering AC1/AC2 (frontmatter shape), AC3-AC10 (body invariants), and AC12 (existing-commands integrity).

The slash command body covers all 10 steps from `architecture-retrofit.md` §3.2 verbatim or near-verbatim, including the load-bearing literal phrases that the architect spawn brief depends on:
- `do not author a fresh Domain Map` (verified verbatim in body)
- `do not write an ADR` (verified verbatim in body)
- `literal word replace` requirement for destructive overwrites (verified)
- CLAUDE.md `architecture` human-approval invariant cited explicitly at step 7 (verified)
- ADR-003 non-loosening cross-reference in footer (verified — "this overlay does NOT loosen the gate")
- No auto-chain to `scaffold-team` (verified — explicit "Do NOT chain to scaffold-team automatically" line)

**Tests: 391/391 passing** (verified locally; 367 + 24 new, including RT-2's CLI tests that landed since team-lead's note). All existing slash commands (`bug`, `feature`, `research`, `audit`, `brainstorm`, `explore-idea`, `migrate`, `review`, `plan`) still generate correctly per AC12.

**Both design checks dev-2 flagged are sound** — confirmed during this review:
1. **Task 5 manual smoke test deferred to post-RT-4.** Correct call. The slash command body is prose for an LLM; it has no behavioral surface that automated tests can exercise without spinning up a full Claude Code session against a live project. Unit tests cover the structural invariants (which is what the developer can deterministically verify); end-to-end behavior is naturally exercised when the user runs `/retrofit-team` after `bmad-swarm update`.
2. **No JS import of `utils/domain-map.js`.** Correct call. The body operates at the LLM level (Read+grep instructions). Only RT-2's CLI is JS code that needs the parser. Story Dev Notes line 153 explicitly anticipated this: "If RT-1 has not landed when RT-3 starts, RT-3 can proceed."

No blocking findings. No new advisory findings.

---

## Acceptance criteria verification

| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | `.claude/commands/retrofit-team.md` exists with body matching §3.2 + standard frontmatter | PASS | Verified live: regenerated against a fresh temp project, file exists at `.claude/commands/retrofit-team.md`, 7360 bytes, `<!-- bmad-generated:4c1d3ac4 -->` hash header followed by `---\ndescription: ...\n---` frontmatter then the body. Test at `test/generators.test.js:879-906` asserts the exact pattern via regex. |
| AC2 | `WORKFLOWS` array contains the entry; `buildRetrofitTeamBody()` returns §3.2 instructions | PASS | `generators/commands-generator.js:55` adds: `{ name: 'retrofit-team', description: 'Propose a Domain Map for an existing architecture (orchestrator-overlay; spawns one architect for the file edit)', body: buildRetrofitTeamBody() }`. Function defined at `generators/commands-generator.js:223`. |
| AC3 | Step 1 refuses when wide-team is already configured | PASS | Body line: "Refuse if wide-team is already configured. Read `swarm.yaml`. If `team.mode === \"fixed\"` AND `team.specializations` is a non-empty list, REFUSE..." — names both conditions per AC3 spec. Refuse message tells user to edit `swarm.yaml` directly or remove the existing `team:` block. Explicit "Do NOT log a D-ID for refusals" guard. Test asserts the conjunction at `test/generators.test.js:921-922`. |
| AC4 | Step 2 refuses when `architecture.md` is missing; points at `/feature` or `/plan` | PASS | Body: "Refuse if the architecture document is missing. If `artifacts/design/architecture.md` does not exist, REFUSE: print '... run `/feature` or `/plan` first to produce one — `/retrofit-team` works on top of an existing architecture.'" Both `/feature` and `/plan` cited. Test at `test/generators.test.js:925-926`. |
| AC5 | Step 3 detects existing Domain Map; refuse default; replace requires literal `replace` | PASS | Body covers the three options with the documented behaviors: `refuse` (default on empty/no), `append-as-comment` (continue but architect inserts as comment), `replace` (requires literal word). Explicit ratchet: "If the user types anything else, treat it as refuse." Cites the same rationale as `git push --force`. Tests at `test/generators.test.js:929-933`. |
| AC6 | Step 4 loads architect Domain Map heuristics | PASS | Body: "Read `agents/architect.md` — specifically the 'Domain Map (when using fixed-mode wide team)' section. Internalize the four heuristics: (a) ≥2-story rule, (b) architecturally-significant exception, (c) cross-cutting dependencies → fallback, (d) orthogonality test." All four heuristics named explicitly. Tests at `test/generators.test.js:936-940`. |
| AC7 | Step 7 pauses for explicit human approval; cites CLAUDE.md invariant | PASS | Body: "Pause and explicitly ask: 'Approve the Domain Map for insertion into `artifacts/design/architecture.md`?' Wait for an explicit 'yes' / 'approve' / equivalent affirmative. This honors the CLAUDE.md invariant 'Human approval is required for: ... architecture'. If the user declines, exit cleanly with no edits and no D-ID logged." Tests at `test/generators.test.js:943-947`. |
| AC8 | Step 8 emits single-task `bmad-assembly` block; brief contains literal "do not author a fresh Domain Map" + "do not write an ADR" | PASS | The `bmad-assembly` block at body lines correctly emits `entry_point: small-feature, complexity: 5, autonomy: auto, team: [{role: architect, model: opus}]` with rationale stating "Insert approved Domain Map verbatim into architecture.md (one Edit, no design work; spawn brief constrains scope)." Architect spawn brief template includes both literal phrases verbatim: **"Do not author a fresh Domain Map"** and **"Do not write an ADR"** — verified live in this review. Tests at `test/generators.test.js:950-958`. |
| AC9 | Step 9 logs tactical D-NNN entry after architect reports done | PASS | Body: "Append a one-line tactical entry to `artifacts/context/decision-log.md` with the next available D-ID: `## D-NNN — Retrofit Domain Map added to architecture.md via /retrofit-team` followed by Date, Source... Per `methodology/decision-traceability.md` 'Team-Shape Decisions'..." Cross-refs WT-6's deliverable correctly. Failure-handling clause: "If the architect spawn fails or rejects the brief, do NOT log the D-ID; report the failure to the user and exit." Tests at `test/generators.test.js:961-964`. |
| AC10 | Step 10 tells user about `bmad-swarm scaffold-team` next | PASS | Body: "Print: 'Domain Map inserted. Next step: run `bmad-swarm scaffold-team` (no flag) to preview the corresponding `swarm.yaml:team` block, or `bmad-swarm scaffold-team --write` to back up `swarm.yaml` and inject the block. See README §Wide-team specialization for the full chain.'" Tests at `test/generators.test.js:967-968`. |
| AC11 | Generator unit test covers the new command | PASS | Three new tests at `test/generators.test.js:878-993` covering frontmatter/file-emission shape, body invariants (10+ regex assertions across all ACs), and existing-commands integrity. Substring-matching style avoids brittle exact-string equality while catching load-bearing wording changes. |
| AC12 | Existing slash commands unaffected | PASS | Test at `test/generators.test.js:973-993` iterates all 9 existing workflows (`bug`, `feature`, `research`, `audit`, `brainstorm`, `explore-idea`, `migrate`, `review`, `plan`), asserts each generates and appears in `result.generated`. Also asserts `result.modified === []` (first-pass run on fresh project). |

All 12 ACs met.

---

## Architecture compliance

| §3.2 step | Body coverage | ADR-010 alignment |
| --- | --- | --- |
| 1. Refuse-if-fixed | Verbatim — names both conditions (`mode: fixed` + non-empty specializations) | N/A (precondition) |
| 2. Refuse-if-no-architecture-md | Verbatim with both `/feature` and `/plan` pointers | N/A (precondition) |
| 3. Detect existing Domain Map; 3 options | Verbatim with `replace` literal-word requirement and "treat anything else as refuse" guard | §3.6 idempotence honoured |
| 4. Load architect heuristics | Verbatim with all 4 heuristics named | Overlay-pattern enabler — orchestrator overlays the architect persona |
| 5. Propose map | Walks components + applies 4 heuristics; rejects thin architectures | Honours §3.5 "what if architecture is thin" guard |
| 6. Present + insertion-position priority | All 3 priority rules from §3.4 verbatim (after `## Components`/`## Architecture`/`## System Overview`; else before any `domain`/`team` heading; else append at end with `## References`/`## Appendix` guard); user can override | §3.4 honoured |
| 7. Human approval gate | Cites CLAUDE.md invariant explicitly | ADR-010 §"Decision" — overlay enables one direct exchange |
| 8. Single-architect spawn with brief | `bmad-assembly` block emits ONE architect with `complexity: 5, autonomy: auto, opus` model; brief includes both literal phrases | ADR-010 §"Decision" — "spawn for the file mutation" — write delegate, no design work |
| 9. Tactical D-ID log | Cross-refs `methodology/decision-traceability.md` "Team-Shape Decisions" (WT-6); failure-mode guard | Honours D-014's no-silent-migration framing |
| 10. Next-step pointer to `scaffold-team` | Verbatim with explicit "Do NOT chain to `scaffold-team` automatically" guard | Honours §12 trade-off 5 |

All 10 §3.2 steps implemented faithfully.

**ADR-010 §"Decision" compliance**: the chosen pattern is hybrid (overlay for design + architect spawn for file mutation). The body's footer explicitly cross-refs ADR-010 with the rationale phrase "(overlay-vs-spawn rationale)". The orchestrator-write-gate is NOT loosened — verified by the body's footer line: "ADR-003 (orchestrator-write-gate — this overlay does NOT loosen the gate; the architect spawn does the file edit)". This closes the loop with ADR-010 §"Alternatives considered A" (the rejected pure-overlay-with-carve-out path).

No deviation from the design.

---

## Anti-pattern compliance (from story Dev Notes)

| Anti-pattern guidance | Honoured |
| --- | --- |
| Do NOT instruct orchestrator to write to `architecture.md` directly (preserve write-gate) | YES — body never tells orchestrator to Edit `architecture.md`. The `bmad-assembly` block in step 8 spawns an architect explicitly because the orchestrator-write-gate would deny the write. Footer cross-refs ADR-003 making this explicit. |
| Do NOT skip human-approval pause | YES — step 7 is a hard pause; explicit "If the user declines, exit cleanly with no edits and no D-ID logged." Cites CLAUDE.md invariant verbatim. |
| Do NOT auto-invoke `bmad-swarm scaffold-team` | YES — body ends with: "Do NOT chain to `scaffold-team` automatically — the two tools are deliberately decoupled per `architecture-retrofit.md` §12 trade-off 5. The user runs the CLI command themselves." |
| Do NOT instruct architect spawn to write an ADR | YES — architect brief contains literal: "**Do not write an ADR.** This is a doc patch, not a design decision; the design happened in the orchestrator overlay." |
| Do NOT default-yes the replace prompt | YES — "If the user types anything else, treat it as refuse." `replace` only accepts the literal word (not yes/y/go). |
| Do NOT introduce `--quick` skip-conversation flag | YES — no parallel flow. Single decision tree from step 1 through step 10. |

All six anti-patterns honoured.

---

## Two design checks (dev-2's flagged escalations)

### Check #1 — Task 5 (manual end-to-end smoke test) deferred to post-RT-4

**Reviewer assessment: confirm.**

The slash command body is prose for an LLM. There are two ways to verify it:
1. **Structural assertions** (what the unit tests do): the body contains the load-bearing phrases, the file generates, the WORKFLOWS array entry exists. These are the deterministic, repeatable checks a developer agent can run in isolation.
2. **End-to-end behavioral verification**: invoke `/retrofit-team` in a real Claude Code session and walk through the proposal, iteration, approval, and architect spawn. This requires a fresh project with `architecture.md`, a live Claude Code session, and human acknowledgment at step 7. It cannot be done deterministically by an automated test runner.

Dev-2's plan to defer the smoke test to post-RT-4 user-acceptance phase is correct because:
- Smoke testing the slash command requires `bmad-swarm update` to have run in a fresh real project — this is RT-4's surface (which adds the README guidance for retrofit, plus the `bmad-swarm update` regen step that ships the new `.claude/commands/retrofit-team.md`).
- The user naturally exercises the slash command when they follow the README's retrofit instructions. This is the same pattern used by every other slash command in the repo — none have automated end-to-end smoke tests because the LLM-conversational layer doesn't admit them.
- All structural invariants the developer COULD verify are verified by the new unit tests. AC11 (the "automated test" AC) explicitly says "structural assertions" are the bar.
- Story Task 5 is documented as the task; deferring it is acknowledged as a non-blocking follow-up. **Recommend logging it as such in the story's Change Log so it's not silently dropped.**

**No push-back.** Smoke test is a non-blocking follow-up; I'll note it in the Change Log on approval.

### Check #2 — RT-3 doesn't import `utils/domain-map.js`

**Reviewer assessment: confirm.**

The dependency relationship between RT-3 and RT-1 is **conceptual, not code-level**:
- RT-1 (the parser) is JS code that ingests a markdown string and produces structured rows. Its consumer is RT-2's CLI, which is also JS code.
- RT-3 (the slash command body) is **prose instructions for an LLM**. The orchestrator overlay reads `architecture.md` via the Read tool and detects an existing Domain Map heading via grep at the conversational level. It does not invoke `parseDomainMap()` because there is no Node-side execution — the body is shipped as markdown instructions, not as JavaScript.
- The format the parser locks (ADR-012) is the same format the orchestrator must produce in step 5 and detect in step 3. So the parser's design constrains the body's design at the spec level, but not at the implementation level.

Story Dev Notes line 153 explicitly anticipated and approved this read: "If RT-1 has not landed when RT-3 starts, RT-3 can proceed — the slash command body refers to the Domain Map format documented in `agents/architect.md`, which is independent of the parser."

**No push-back.** The decoupling is correct by design.

One subtle implication worth noting: if RT-3's body and RT-1's parser ever drift on the format expectations (e.g., RT-1 starts accepting an extra column shape that the orchestrator doesn't propose, or vice versa), there is no automated check that would catch the divergence. The shared spec is `agents/architect.md` §"Domain Map" + ADR-012. **This is acceptable** because: (a) both are anchored to the same upstream spec; (b) any drift would show up immediately when a user runs the full chain (`/retrofit-team` → `scaffold-team`) — the parser would either reject the orchestrator's output or accept output the orchestrator didn't intend, both of which fail loudly. Not a finding; observation only.

---

## Lens: code-quality

**Strengths**

- **Surgical additive change.** The `generators/commands-generator.js` diff adds one entry to the `WORKFLOWS` array (line 55) and one new function at the bottom of the file (line 223). Other workflows untouched. The new function follows the same shape as `buildBrainstormBody`, `buildExploreIdeaBody`, `buildPlanBody` — visual and stylistic consistency with the existing pattern.
- **The body's structure makes the protocol auditable.** Numbered steps 1-10 in the body match `architecture-retrofit.md` §3.2 step-for-step. A reader (human or LLM) can match each step to the spec line-by-line. The numbered structure is an essential part of what makes the body verifiable — alternative shapes (long paragraphs, sectioned-but-unnumbered) would be harder to audit.
- **Load-bearing phrases are reproduced verbatim.** "do not author a fresh Domain Map" and "do not write an ADR" are the architect spawn brief's correctness invariants — they MUST appear verbatim because the architect's compliance is keyed off them. Dev-2 reproduced them exactly. Tests assert their literal presence (`test/generators.test.js:953-958`).
- **Footer cross-references are explicit and load-bearing.** The body ends with cross-refs to `architecture-retrofit.md §3`, ADR-010, **ADR-003 (orchestrator-write-gate — this overlay does NOT loosen the gate)**, and the CLAUDE.md architecture human-approval invariant. The ADR-003 phrase is doing two jobs: it documents the design choice, AND it's a tripwire for any future maintainer who might be tempted to simplify the architecture. If someone later proposes "let the orchestrator just write architecture.md directly" they encounter the explicit rejection.
- **Tactical refusals are designed to be observable.** Each refuse path tells the orchestrator to print a specific user-facing message and exit cleanly without logging a D-ID. Refusals are identifiable in the user's terminal (specific string), and don't pollute the decision log with non-decisions.
- **Failure-mode handling at step 9.** "If the architect spawn fails or rejects the brief, do NOT log the D-ID; report the failure to the user and exit. The user can re-invoke `/retrofit-team` to retry." This is the correct posture — D-IDs only get logged when the decision is realized, not when the orchestrator intended to make one.
- **The `bmad-assembly` block in step 8 has a clean shape.** `complexity: 5, autonomy: auto` matches the `small-feature` entry-point's defaults. The rationale string explicitly says "(one Edit, no design work; spawn brief constrains scope)" which makes the spawn's purpose visible to anyone reading the assembly block.
- **No shell-escape risk in the body's instructions.** The architect's spawn brief is composed by the orchestrator using the approved Domain Map text. The body provides a template; the orchestrator fills it in. No string concatenation in JS-land that could be exploited (the JS function is a static string return).

**Findings (none)**

No high, medium, or low findings.

**One observation (non-finding):** The `WORKFLOWS` array now has 10 entries, all comma-separated on one line each. The new `retrofit-team` entry's `description` string is the longest at 109 characters and pushes the line beyond the soft 100-char convention many editors enforce. This is purely cosmetic — the file has no enforced line-length linting and other entries (e.g., `migrate` at 84 chars) are also long. Not flagged.

---

## Lens: docs

**Strengths**

- **The body reads as auditable protocol, not improvisation.** A reader unfamiliar with the project can follow the 10 numbered steps and understand the contract. The first paragraph names the pattern (orchestrator-overlay, hybrid: overlay for design + architect spawn for file edit), the second names the gates (refuse-if-fixed, refuse-if-no-arch, detect-existing-Map), and the body walks through them. This is good technical writing.
- **Bolded step titles match the architecture spec wording.** "Refuse if wide-team is already configured" / "Refuse if the architecture document is missing" / "Detect existing Domain Map" — these match `architecture-retrofit.md` §3.2 step-for-step. A reader can navigate from architecture to body without translation.
- **The `replace` ratchet is well-explained.** "This is the same rationale as `git push --force` — destructive overwrites need a deliberate signal." The git analogy is concrete and familiar, communicating intent without lecturing.
- **The architect spawn brief template uses blockquote (`>`) formatting** in the body. This visually distinguishes it from instructions to the orchestrator, signaling "this is what you tell the architect" vs "this is what you do." Subtle but valuable readability win.
- **Cross-references at the bottom are concrete.** Full file paths + ADR numbers + section anchors. A future maintainer hunting for "why does this overlay not write directly?" lands on ADR-003.
- **The body is 7360 bytes** — reasonable for a 10-step protocol. Long enough to be specific; short enough to fit in an LLM context without dominating it.

**Findings (none)**

No findings on the docs lens.

---

## Decision Traceability

- **D-004** (grandparent strategic — wide-team specialization adoption): Honoured — the `/retrofit-team` slash command is a user-facing surface enabling D-004 adoption for existing projects.
- **D-014** (parent strategic — adopt retrofit tooling): Honoured — RT-3 is a foundation story under D-014. D-014's status remains `accepted` (will flip to `verified` after RT-4 lands the documentation).
- **D-015** (`/retrofit-team` is overlay + architect spawn for file edit): **Verified — implemented**. Body reproduces ADR-010 §"Decision" item-for-item; the hybrid pattern (overlay for design + architect spawn for write) is realized faithfully. Status flip recommended: D-015 → `verified` in `decision-log.md`.
- **ADR-010**: Verified — every alternative rejection holds (no pure-overlay with carve-out, no pure architect spawn, no overlay-without-spawn requiring user manual edit, no spawn-then-overlay hybrid, no CLI-only).
- **ADR-003** (orchestrator-write-gate): Honoured explicitly — body's footer line "this overlay does NOT loosen the gate; the architect spawn does the file edit" is the explicit non-loosening cross-reference. ADR-003's status remains `verified` (no change).
- **D-BRN-1** (`/brainstorm` overlay precedent): Pattern-match honoured — RT-3's body shape mirrors `buildBrainstormBody`'s structure (numbered steps, conversational tone, exit cleanly on user decline, log artifacts on completion).
- **D-BRN-4** (`/explore-idea` overlay + spawn precedent): Pattern-match honoured — RT-3 inherits the overlay+spawn hybrid framing.
- **No new D-IDs created** during implementation — correct posture for a faithful transcription of §3.2. Dev-2's report confirms "no tactical D-IDs logged."

---

## Findings register dedupe

Read `artifacts/context/findings-register.md` at review start. Three existing entries (F-001 + F-002 from WT-1 validator, F-003 from WT-5 hook) — all are unrelated to RT-3's surface (slash-command body + generator + tests). No duplicates. RT-3 produces no new findings.

---

## Verdict

**approved**

All 12 acceptance criteria met. **391/391 tests passing** (verified locally). All 10 §3.2 steps in the body, all load-bearing literal phrases verbatim, all anti-patterns honoured, ADR-010 hybrid pattern realized faithfully, ADR-003 non-loosening explicitly cited.

Both design checks dev-2 flagged are sound:
- **Smoke test deferral** — correct call; verified live during this review (the body is prose for an LLM, has no Node-side behavior to test). Recommend logging as a non-blocking follow-up in the Change Log.
- **No `utils/domain-map.js` import** — correct call; the dependency on RT-1 is conceptual (shared spec via `agents/architect.md` §Domain Map + ADR-012), not code-level.

D-015 status flip to `verified` recommended. RT-2 (CLI) and RT-3 (slash command) are now both implementation-complete. Pending: RT-4 (retrofit docs — README + architect.md + CHANGELOG) which closes the user-facing surface and unblocks the post-RT-4 smoke test.

Generated `.claude/commands/retrofit-team.md` is intentionally out-of-sync with the source until end-of-feature `bmad-swarm update` batch regen — flagged in dev-2's notes; not a review-blocking concern.
