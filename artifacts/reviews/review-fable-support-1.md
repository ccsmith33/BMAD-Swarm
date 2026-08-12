# Review — Fable 5 model tier support change set (Task #2)

- **Reviewer:** reviewer (team fable-support)
- **Date:** 2026-06-09
- **Lenses:** code-quality, test-coverage
- **Governing decision:** D-023 (artifacts/context/decision-log.md)
- **Verdict:** **APPROVED** (no blocking findings; 4 advisory findings)
- **Test result:** `npm test` → **410 / 410 pass**, 64 suites, 0 fail (run independently by reviewer)
- **Generated-file drift:** none — regenerated `.claude/{hooks,commands,agents}` byte-identical to committed outputs; `bmad-generated:` hashes valid.

## Summary

The change set implements D-023 faithfully and completely against the Task #1 brief: `fable` is added to `VALID_MODELS`, the duplicated default-model literal is centralized as an exported `DEFAULT_MODEL` constant, the cost estimator prices per-resolved-model, workflow command generators are parameterized on `defaults.model`, the teamcreate-gate gains a HARN-2 Fable-5 fallback (Pass 3), the orchestrator/developer/reviewer identities get Fable-class prompt tuning, this repo opts in via three per-agent overrides, and docs (README/CHANGELOG) are accurate. All 10 work items in the brief are addressed. Test coverage is strong (33 new/changed assertions across 5 suites). No blocking defects. Four advisory findings, the most substantive being the cost estimator's now-internally-inconsistent pricing baseline (F-006) and the absence of validation on `agents.*.model` / `defaults.model` (F-001 family, pre-existing).

## Work-item / acceptance verification

| Item | Status | Notes |
|---|---|---|
| 1. `fable` in `VALID_MODELS`; centralize `DEFAULT_MODEL` | PASS | `validator.js:8` order correct (`haiku, sonnet, opus, fable, inherit`); `DEFAULT_MODEL='opus'` exported, imported by config.js, cli/init.js, cost-estimator.js, commands-generator.js |
| 2. Cost estimator fable pricing | PASS (with advisory) | fable `$10/$50` added; per-agent resolution correct. Opus baseline left at stale `$15/$75` — see **F-006** |
| 3. Workflow command parameterization | PASS | All 8 model-emitting builders take `model`; `buildBrainstormBody`/`buildPlanBody` correctly parameterless; `config.defaults?.model || DEFAULT_MODEL` |
| 4. teamcreate-gate HARN-2 (Pass 3) | PASS | Freshness check (15 min mtime), 4KB tail, last-block, Pass 2 still runs, fail-open preserved. Generator and generated `.cjs` match. Security analysis below |
| 5. Orchestrator model heuristics | PASS | Valid values updated; promotion heuristics (complexity ≥ 12, architect/strategist/security, security-critical review) present |
| 6. Fable-class prompt tuning | PASS | developer "Autonomy calibration" + reviewer "report every finding" — surgical, consistent with Anthropic Opus 4.8/Fable 5 migration guidance; existing escalation rules intact |
| 7. Repo opt-in | PASS | swarm.yaml `agents.{architect,strategist,security}.model: fable`; `defaults.model: opus` retained |
| 8. Docs | PASS | README model-hint comment + new "Model tiers" section with 2× cost caveat; CHANGELOG New/Fixed entries accurate |
| 9. Tests | PASS | validator (fable accept + updated 5-value error assertion), config (DEFAULT_MODEL), cost-estimator (2 fable cases), generators (2 param cases), hooks (8 HARN-2 cases) |
| 10. Regenerate | PASS | `.claude/agents/{architect,strategist,security}.md` frontmatter picks up fable; no drift |

## teamcreate-gate Pass 3 — security & correctness analysis (task item 2)

The Pass 3 fallback is the highest-risk item; I analyzed it adversarially.

- **Freshness check present:** `Date.now() - st.mtimeMs < FRESH_MS` (15 min). A stale file (mtime ≥ 15 min) is rejected — verified by test AC2 and by direct probe.
- **Fail-open posture preserved:** the entire pass is wrapped in `try {} catch {}` and only runs when `acceptedBlock === null`; any error falls through to the existing transcript-based deny. It can only *widen* acceptance, never deny on its own. Confirmed.
- **Pass 2 routing still runs on the fallback block:** Pass 3 sets `acceptedBlock`, and the Pass 2 fixed-mode routing block executes after the `acceptedBlock === null` deny gate. Verified by test AC4 (a payments-api entry against a backend-auth-only fixed roster is correctly denied by routing even when accepted by Pass 3).
- **"Stale or malformed file" cannot satisfy the gate:** I tested the block-straddle scenario (a valid OLD block in-window while a fresh LARGE block's opening fence is pushed beyond the 4 KB tail). It is **not exploitable**: for an append-only log, the only geometry where the old block sits inside the last 4 KB also keeps the newer block's opening fence inside the window (so the newer block matches and wins via the last-match loop). When a single block exceeds 4 KB, its opening fence falls outside the window, no fence matches, and Pass 3 **fails closed** to the transcript deny — a false-negative (legitimate oversized block rejected), never a false-accept. Malformed/partial blocks are rejected by `missingKeys()` (test AC3). This is a safe design.
- **Residual edge (advisory, F-008):** a single assembly block larger than ~4 KB is silently rejected by Pass 3. Real blocks are ~200–400 bytes so this is low-probability, but a long `rationale` could trip it; documented below.

## Findings

### Advisory

**F-006 (medium, advisory) — Cost estimator opus baseline is stale, making fable estimates internally inconsistent.**
`utils/cost-estimator.js` adds `fable: {input:10, output:50}` (correct absolute pricing) but leaves the pre-existing `opus: {input:15, output:75}` baseline unchanged (D-025, "out of scope"). Real current pricing is opus `$5/$25` and fable `$10/$50` — fable is 2× opus. With the shipped constants, a fable agent ($10/$50) is priced *lower per token* than an opus agent ($15/$75), inverting the relationship that is the entire cost rationale of D-023 ("fable is 2× opus cost"). The new cost-estimator test "applies fable pricing only to fable-overridden agents" bakes this inversion into an assertion ($0.78 fable developer vs $0.585 opus reviewer at equal-ish token scale). Leaving opus stale was within the Task #1 brief (item 2 asked only to *add* fable pricing) and D-025 logs the scoping choice, so this is **advisory, not blocking** — but a cost estimator whose two known tiers contradict the documented cost ordering is misleading. Recommend a follow-up to correct the opus baseline to `$5/$25` (and ideally add haiku/sonnet tiers) so the estimator's relative costs match reality. *Suggested fix:* one-line constant change `opus: {input:5.00, output:25.00}` plus updating the two affected cost-estimator test expectations.

**F-001 family (low, advisory) — `agents.{name}.model` and `defaults.model` are still unvalidated against `VALID_MODELS`.**
The task spec (test-coverage lens) asks to confirm "fable accepted everywhere a model is configurable" and "error messages list all 5 values." Two of the four configurable model fields validate (`team.specializations[].model`, `team.fallback.model`); the other two do **not**: `validateConfig({agents:{architect:{model:'gpt-4-nonsense'}}})` and `validateConfig({defaults:{model:'gpt-4-nonsense'}})` both return `[]` (probed directly). Consequently the new test "accepts fable in agents.*.model" gives false confidence — it passes because nothing is rejected there, not because `fable` is specifically validated. `defaults.model` is the existing **F-001** in the findings register (open since WT-1); `agents.*.model` is the same gap on a sibling field. Impact is low: an invalid model falls back to the opus pricing baseline in the estimator and Claude Code's agent-spawn enum rejects a bad model at runtime. *Suggested fix:* validate `defaults.model` and `agents.{name}.model` against `VALID_MODELS` next time the validator is touched — closes F-001 and tightens the test's meaning. (Reconfirming F-001, not inventing a new ID; logging the agents-field sibling as F-007.)

**F-007 (low, advisory) — `artifacts/context/team-assembly-log.md` is untracked and not gitignored.**
The HARN-2 mechanism writes session-specific assembly blocks to this file (the live one from this session is present, 484 bytes). It is neither tracked nor in `.gitignore`, so it is ambiguous whether it should be committed; a `git add -A` would sweep an ephemeral, session-scoped artifact into the repo. Other `artifacts/context/` files (decision-log, findings-register) *are* tracked, so the convention is unclear. *Suggested fix:* decide explicitly — add `artifacts/context/team-assembly-log.md` to `.gitignore` (it is an ephemeral gate-handshake buffer, not a durable artifact), or document that it is intentionally tracked.

**F-008 (low, advisory) — Pass 3 silently rejects assembly blocks larger than ~4 KB.**
Because Pass 3 scans only the last 4096 bytes of the log, a single block whose opening fence is pushed beyond that window (e.g. a very long `rationale`) will not match and Pass 3 fails closed. Safe (no false-accept) but a legitimate large block would be rejected with the generic transcript deny, which is a confusing failure mode for the orchestrator. Real blocks are well under 4 KB so this is low-probability. *Suggested fix:* if ever revisited, anchor the slice on the last `` ```bmad-assembly `` occurrence rather than a fixed byte count, or raise the tail window; not worth a change now.

### ADR-precedent observation (advisory, non-blocking)

HARN-2 adds a third accept path to a security-adjacent enforcement hook and a new orchestrator invariant — comparable in surface to the Pass 2 routing enforcement, which received a full strategic record (D-009) **and** an ADR (ADR-008), and to the gate identity design (D-003 / ADR-003). HARN-2 is logged only as tactical one-liners (D-026 plus the D-024/D-025 siblings). This is acceptable here because the HARN-2 design was specified upstream in the Task #1 brief (verified-failure context, exact mechanism prescribed) — i.e. the strategic decision was made at the orchestrator level and pre-authorized, and the developer correctly logged only the residual implementation choice (whole-read+slice vs fd/offset). The gate is also explicitly a shape check, not an authorization boundary, and Pass 3 only widens acceptance with fail-open posture, so the blast radius is genuinely low. Recommendation (for the orchestrator, not the developer): consider a short ADR documenting the HARN-2 fallback design to match the ADR-003/ADR-008 precedent for the gate's other passes.

## Test quality assessment (test-coverage lens)

- **Coverage:** strong. 8 HARN-2 tests cover accept (AC1), stale-deny (AC2), missing-keys-deny (AC3), Pass-2-still-runs (AC4), last-block-wins (AC5), 4KB-tail-boundary (AC6), missing-file-fallthrough (AC7), and a transcript-acceptance regression guard (AC8). The new `runHook` cwd default (bare tmpDir) correctly prevents the real repo's `swarm.yaml` / `team-assembly-log.md` from leaking into cwd-relative reads — a real isolation bug that D-026 calls out and the helper change fixes.
- **Assertion quality:** tests assert the specific deny reason substring (`developer domain=payments-api`, `Missing: entry_point`), not just "denied" — good. The cost-estimator tests assert exact dollar strings with documented arithmetic including the float-rounding nuance (`1.365 → "$1.36"`).
- **Gap (ties to F-001):** the "accepts fable in agents.*.model" validator test passes trivially because that field is unvalidated; it does not actually prove fable-specific acceptance there. Not a blocker, but the test's name overstates what it verifies.
- **Fable transcript fixture:** `fableTranscript()` models the real failure (thinking block with empty content, no flushed text) — an accurate reproduction of the HARN-2 condition.

## Decision Traceability

- **D-023** (strategic, governing): **Verified** — implementation matches all five sub-decisions (fable in VALID_MODELS → claude-fable-5; opus stays default; repo opts in via architect/strategist/security overrides; orchestrator model heuristics added; agent identities prompt-tuned). Fable facts (`claude-fable-5`, 1M context, $10/$50 = 2× opus) independently confirmed against current Anthropic model documentation. Status remains `accepted`; recommend promotion to `verified` on merge.
- **D-024** (tactical, new — DEFAULT_MODEL location): **Verified & reasonable** — genuinely tactical (code organization, reversible), follows the D-019 export precedent.
- **D-025** (tactical, new — per-agent pricing, opus baseline left stale): **Verified; reasonable as scoped** — the mechanism is tactical; the residual product-visible inconsistency it leaves is logged as advisory **F-006**.
- **D-026** (tactical, new — Pass 3 whole-read+slice, last block, fail-through): **Verified & reasonable** — narrow implementation choice; the broader HARN-2 design was pre-authorized in the Task #1 brief (see ADR-precedent observation).
- **Backward traceability:** no unlogged strategic decisions made independently by the developer. The HARN-2 design originated in the orchestrator-authored brief.
- **New decisions:** D-024, D-025, D-026 all logged with one-line rationale per the tactical convention.

## Findings register updates (to apply)

- **F-001** — reconfirm: append `2026-06-09 — by reviewer — reconfirm — still open; D-023 added fable to VALID_MODELS but defaults.model remains unvalidated; agents.*.model sibling gap logged as F-007`.
- **F-006** (new) — Cost estimator opus baseline stale ($15/$75 vs real $5/$25), making fable estimates internally inconsistent; advisory medium; D-025 scoped the omission.
- **F-007** (new) — `agents.{name}.model` not enum-validated (F-001 sibling field); advisory low.
- **F-008** (new) — `team-assembly-log.md` untracked and not gitignored; advisory low. *(Note: register slot — renumber if F-006/F-007/F-008 collide with concurrent entries.)*
