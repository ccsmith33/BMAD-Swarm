# Fork Decision Sheet — 2026-08-11 (answer all four in one pass)

Prepared overnight under D-033. Everything referenced is PROPOSED and awaits your approval. Governing doc: `artifacts/planning/reinvention-vision-2026-08-11.md`. Proposed ADRs: `artifacts/design/decisions/adr-015` … `adr-023`. Write your answer on each blank (an option letter is enough; add conditions inline if you want).

---

## Fork A — Security posture: does the orchestrator lose its interpreter shell?

- **Question:** May the orchestrator lose interpreter-capable Bash (`node`, `npx`, `npm`, `echo`, `cat` redirects — it delegates `npm test` etc. by design), with stack-aware teammate allowlists to follow?
- **Options:** **A1** structural narrowing now · **A2** keep permissive, document the trust assumption · **A3** = A1 + stack-aware teammate allowlists at init
- **Recommendation: A1 now, A3 follow-on.** The orchestrator is the actor the product promises to constrain; the write-gate is bypassable via shell today (SEC-F-016/F-018). This is also the **/sleep precondition** — until it lands, "worst case = delete the branch" is prose, not fact (D-034).
- **Unblocks:** WS-3; delegate-everything becomes structural; Phase 5 (/sleep) becomes honest.
- **Ratifies:** ADR-017.

**Your answer:** ______________________________

## Fork B — Model tier: retire fable-everywhere (D-027)?

- **Question:** Retire D-027's fable-everywhere in favor of the tier mix, with a visible per-project override knob? (Only you can retire D-027 — it's your standing directive.)
- **Options:** **B1** keep fable-everywhere · **B2** tier mix (default opus; fable for architect/strategist/security + complexity ≥ 12; sonnet for researcher/devops) · **B3** = B2 + visible override in generated `swarm.yaml`
- **Recommendation: B2/B3.** ~40–50% limit-burn reduction on implementation-heavy runs; fewer mid-epic cap stalls (the most expensive failure mode); dev+reviewer ≈ 60–70% of token volume and opus demonstrably suffices there. One line (`defaults.model: fable`) restores B1 anytime.
- **Unblocks:** WS-9's policy half; slower drain on the day/night shared quota.
- **Ratifies:** ADR-023 (formal D-027 supersession).

**Your answer:** ______________________________

## Fork C — Gate posture: stop calling the assembly gate enforcement?

- **Question:** Reframe the assembly-log gate as declared-intent lint and put the entire enforcement budget into the deterministic replay gate (whose blocking is structurally sound, pending spike 1)?
- **Options:** **C1** invest to make the assembly gate a real boundary (tool_input↔log binding) · **C2** advisory reframe + cheap correctness fixes + native blocking quality hooks (replay gate)
- **Recommendation: C2.** A repo-file gate can never bind the actor who writes the file (it was gamed the week it shipped); pretending otherwise is the defect. Cheap correctness fixes (freshness, cwd, path anchoring) ship either way. Standing rule: only deterministic replay and PreToolUse denies get called enforcement (D-039).
- **Unblocks:** WS-4; the gate re-anchor's final framing; decides `team-assembly-log.md`'s disposition in the five-file budget (retire or rename).
- **Ratifies:** ADR-015 (re-anchor + enforcement classes) and ADR-022's framing (replay gate as the sole blocking gate; also formally supersedes D-002, spike-gated).

**Your answer:** ______________________________  · team-assembly-log.md: retire / rename? ______

## Fork D — Orchestrator as a native `--agent` main session?

- **Question:** Launch the orchestrator via `bmad-swarm start` → `claude --agent orchestrator` (with `initialPrompt`), retiring the /identity ceremony, the reminder hook, and most post-compact re-injection?
- **Options:** **D1** native main-session agent · **D2** keep the slash-command ceremony, fix vocabulary/anchor only
- **Recommendation: D1.** Three audits independently converge on it; it structurally fixes orchestrator-spawnable-as-teammate and gives WS-2's reconciliation and the project brain's warm boot a guaranteed home. **Spike 4 verifies the primitive first** (D-040); D2 remains the working fallback if the spike disappoints, so answering D1 costs nothing if the harness says no.
- **Unblocks:** WS-1's final shape; WS-2's reconciliation home; the brain's warm-boot slot.
- **Ratifies:** ADR-016 (formal supersession of ADR-014's "main session can't be a custom agent" claim).

**Your answer:** ______________________________

---

## Same pass, one sentence each (architect resolves if silent)

- **Sharing model:** git-track `swarm.yaml`, `CLAUDE.md`, `artifacts/` (recommended — the decision ledger is only an asset under version control)? → ratifies ADR-020 pt 1. **Answer:** ________
- **Facade kill list:** kill all five (github.js, eject, workspaces, plugins, broken `--github`); run-reporter wired into WS-2 or deleted, no limbo (recommended)? → ratifies ADR-020 pt 2–3. **Answer:** ________

## Also queued for this pass (not forks — ratifications)

1. **D-036–D-041** (minted overnight under D-033; full records in vision §9). ADR-021 ratifies D-036 (record envelope + five-file budget); ADR-018 ratifies D-037 (machine-state home; project.yaml deleted). **Answer:** ________
2. **The vision doc + integrated roadmap** (prd-class): `reinvention-vision-2026-08-11.md` §5. **Answer:** ________
3. **ADR-019** (self-contained scaffolds — Phase 1, hard publish gate) rides the roadmap approval; flag here only if you object. **Answer:** ________

## ADR ↔ fork map (for the record)

| ADR | Title | Supersedes | Gated by |
|---|---|---|---|
| 015 | Gate re-anchor to Agent tool + enforcement classes | ADR-013 | Fork C |
| 016 | Orchestrator as native `--agent` main session | ADR-014 (pt 4 claim) | Fork D + spike 4 |
| 017 | Permission posture: shell narrowing | ADR-001/003 implicit posture | Fork A |
| 018 | Liveness + task ledger + machine-state home | WS-2 item 5 (project.yaml) | ratify D-037 |
| 019 | Self-contained scaffolds (`.claude/bmad/`) | package-path model | roadmap approval |
| 020 | Sharing model + facade kill list | documented gitignore default | secondary calls |
| 021 | Unified record envelope + promotion machine | five wave schemas | ratify D-036 |
| 022 | TaskCompleted exit-2 replay-gate trigger | **D-002** | Fork C + spike 1 |
| 023 | Tier mix + visible override | **D-027** | Fork B |
