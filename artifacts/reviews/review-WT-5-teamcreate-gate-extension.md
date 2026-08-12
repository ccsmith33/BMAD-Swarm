# Review: Story WT-5 — `teamcreate-gate` hook · Pass 2 fixed-mode enforcement

**Story:** `artifacts/implementation/stories/story-WT-5-teamcreate-gate-extension.md`
**Reviewer:** reviewer (lenses: `code-quality`, `test-coverage`)
**Date:** 2026-04-29
**Verdict:** **approved**

---

## Summary

WT-5 is the trickiest story in the wide-team epic — full code (generator patch + regenerated hook), 10 new tests covering AC1–AC8, and an idempotent `bmad-swarm update` round-trip. The implementation is faithful to ADR-008's design and posture: Pass 2 runs only after Pass 1 accepts, gates on `team.mode === 'fixed'`, fails open on every error path (missing yaml, missing js-yaml dep, parse errors, unexpected shape), and emits a deny envelope whose `permissionDecisionReason` matches the documented shape.

All 10 ACs pass. **342/342 tests green** (332 pre-WT-5 + 10 new), confirmed live with `npm test`. AC9 idempotence verified independently — `generateHooks(...)` produces byte-identical output across two runs, and that output matches the on-disk regenerated `.claude/hooks/teamcreate-gate.cjs`. AC10 (no Pass 1 regressions) verified by the existing GATE-1 / required-keys test cases continuing to pass.

D-012 (the `require('js-yaml')` tactical decision) is correctly logged in the decision log with rationale that maps to ADR-008 §"Why fail-open here". Two implementation observations are noted below — one is captured as a new low-severity finding (F-003) per the dev-1 escalation; the other is a positive note about the test fixture's `NODE_PATH` injection.

No blocking findings. One new low-severity advisory (F-003) appended to the findings register.

---

## Acceptance criteria verification

| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | Dynamic mode (or absent team block) is byte-for-byte unchanged; Pass 2 skipped | PASS | Hook source `.claude/hooks/teamcreate-gate.cjs:154-155` reads `mode = teamCfg.mode || 'dynamic'` and exits at line 155 if `mode !== 'fixed'`. Two test variants confirm this: `test/hooks.test.js:287-301` (no team block — Pass 2 skipped even with "obviously invalid" specialist entry), and `test/hooks.test.js:303-320` (explicit `team.mode: dynamic`). Both assert `decision === null`. |
| AC2 | Fixed mode + matching specialist (developer, backend-auth) passes | PASS | Hook source line 180 (`specs.some(s => s && s.role === role && s.domain === domain)`) returns true → no deny → exit 0. Test at `test/hooks.test.js:322-344` declares `developer/backend-auth` in `swarm.yaml` and a matching team entry; asserts `decision === null` and `status === 0`. |
| AC3 | Fixed mode + no-domain entry + fallback enabled passes via fallback | PASS | Hook source line 186 (`fallbackEnabled && fallbackRole === role`) — both true by default. Test at `test/hooks.test.js:346-369`: explicit `fallback.enabled: true, role: developer`, no-domain dev entry. Asserts `decision === null`. |
| AC4 | Fixed mode + no-domain entry + fallback disabled denies with documented reason | PASS | Hook source line 187 deny message includes all three required substrings: `team mode is "fixed"`, `does not match any declared specialist`, `set team.fallback.enabled: true`. Test at `test/hooks.test.js:371-397` asserts `decision.hookSpecificOutput.permissionDecision === 'deny'` and uses three regex matches against the reason — all three documented substrings checked. |
| AC5 | Fixed mode + specialist whose domain doesn't match denies, naming the bad pair | PASS | Hook source line 182 deny message format: `'... team[] entry "' + role + ' domain=' + domain + '" ...'`. Test at `test/hooks.test.js:399-423` declares only `backend-auth`, sends `domain: frontend-dashboard`, asserts deny + `/developer domain=frontend-dashboard/` regex matches the reason. |
| AC6 | Non-specialized roles always pass | PASS | Hook source line 176 (`if (!role || !SPECIALIZED_ROLES.has(role)) continue;`) where `SPECIALIZED_ROLES = new Set(['developer', 'reviewer'])` (line 166). Test at `test/hooks.test.js:425-454` exercises 6 distinct non-specialized roles in one assembly (architect, security, devops, researcher, strategist, ideator) with `fallback.enabled: false` (so they can't be sneaking through fallback). Asserts `decision === null`. |
| AC7 | Malformed/missing/unreadable swarm.yaml fails open | PASS | Hook source: missing file → exit 0 at line 146; parse error → exit 0 at line 150; non-object yaml → exit 0 at line 151; missing js-yaml → exit 0 at line 143. AC7 split into TWO tests at `test/hooks.test.js:456-468` (malformed YAML — actually invalid syntax, not just unparseable values) and `test/hooks.test.js:470-482` (missing file — `makeProject(null)`). Both assert `decision === null` and `status === 0`. The split is correct — parse-error and missing-file are distinct error paths and both must fail open. |
| AC8 | Mixed-team validates each entry independently; deny names the bad entry | PASS | Hook iterates the team array (line 173-191) and only the loop-internal `denyRouting` calls cause early exit (lines 183, 188). Test at `test/hooks.test.js:484-515` constructs a 3-entry team: valid specialist + valid non-specialist (architect) + invalid specialist (developer/payments-api). Asserts deny + the deny reason matches `/developer domain=payments-api/` (the specific bad entry, not a generic "something failed"). |
| AC9 | Hook regenerates correctly via `bmad-swarm update`; second run is idempotent | PASS | Verified live during this review by invoking `generateHooks({}, { hooksDir: <tmp> }, { force: true })` twice against a fresh temp dir; first-run vs second-run file comparison: byte-identical (length 8935). First-run output also matches the committed on-disk `.claude/hooks/teamcreate-gate.cjs` byte-for-byte. The `bmad-generated:035d3a4b` hash is updated correctly (was prior `bmad-generated:<old-hash>`, now `035d3a4b`). |
| AC10 | All existing Pass 1 tests still pass | PASS | `npm test` reports 342/342 passing. The pre-existing teamcreate-gate cases at `test/hooks.test.js:80-232` (denies-without-fence, structured-walk happy path, last-N=5 recency window, GATE-1 raw-transcript fallback, missing-keys deny, malformed-event-handling) all green. The Pass 2 logic is gated on `acceptedBlock !== null` (line 134-137), so Pass 1's deny-and-exit short-circuits before Pass 2 runs — no behavior overlap, no regression possible by construction. |

All 10 ACs met.

---

## Architecture compliance

- **ADR-008 §Decision item 1** (read swarm.yaml from CWD; fail open if unreadable): hook line 145-148 — exact match.
- **ADR-008 §Decision item 2** (`mode !== 'fixed'` → pass through): hook line 155 — exact match.
- **ADR-008 §Decision item 3** (per-entry rules for specialized w/domain, specialized w/o domain, unspecialized): hook lines 173-191 — exact match. SPECIALIZED_ROLES set matches ADR-008's enumeration (`developer`, `reviewer`).
- **ADR-008 §Decision item 4** (deny envelope shape and exact reason string): hook line 182 reproduces the documented reason wording verbatim. Verified in test AC4 with three independent regex assertions on the reason substrings.
- **ADR-008 §"Why fail-open here"** (every error path skips Pass 2 silently): every `try/catch` in Pass 2 catches → `process.exit(0)` with no stdout. No deny envelope emitted on any infrastructure failure. The hook's prior fail-open posture for transcript reading is preserved (lines 42, 44).
- **ADR-008 §Verification cases 1-8**: every documented test case is implemented as a corresponding test in `test/hooks.test.js`. Coverage is 1:1.

D-012's "tactical decision" framing is appropriate (implementation-strategy choice, reversible, low blast radius). The decision-log entry correctly links it back to Subtask 1.2's "strongly prefer option 1" guidance and references ADR-008's "Brittle and not recommended" rejection of the inline parser.

No deviation from the design.

---

## Anti-pattern compliance (from story Dev Notes)

| Anti-pattern guidance | Honoured |
| --- | --- |
| "Do NOT make the hook fail-closed" | YES — every error path in Pass 2 exits 0 with no stdout. Verified across 4 distinct failure modes (missing yaml, parse error, missing js-yaml, non-object yaml) by the hook source and by the AC7 tests. |
| "Do NOT cache the parsed swarm.yaml across hook invocations" | YES — no module-scoped state holds parsed yaml. Each invocation reads fresh from disk. |
| "Do NOT add a new swarm.yaml validation pass" | YES — hook trusts what it reads (or fails open). It does not re-implement validator rules; it only reads the fields it needs and gracefully handles missing/unexpected shapes. |
| "Do NOT block legitimate orchestrator escapes" | YES — removing `team.mode: fixed` mid-session would mean the next hook invocation reads `mode === 'dynamic'` (default), Pass 2 skips immediately. Verified by AC1's "no team block" path. |
| "Do NOT change existing Pass 1 behavior" | YES — diff inspection: Pass 1's structured walk + raw-scan fallback (lines 75-132 of the generator) is preserved verbatim. The new control-flow change is only that Pass 1's accept now sets `acceptedBlock` and falls through to Pass 2 instead of `process.exit(0)`. The required-keys fence regex, recency window (N=5), and 50KB raw-tail cap are all unchanged. |
| "Do NOT regenerate teamcreate-gate.cjs manually-by-editing" | YES — the on-disk `.claude/hooks/teamcreate-gate.cjs` is byte-identical to `generateTeamCreateGateHook(config)` output (verified live during this review). New `bmad-generated:035d3a4b` hash present. |

All six anti-patterns honoured.

---

## Lens: code-quality

**Strengths**

- **Control-flow refactor preserves Pass 1 contract.** The original Pass 1 had two exit-on-pass paths (structured-walk accept; raw-scan fallback accept). Dev-1 unified both into a single `acceptedBlock` variable that, when non-null, falls through to Pass 2. This is the cleanest possible refactor — Pass 1's logic semantics are byte-identical, only the post-accept disposition changes.
- **Defensive parsing throughout Pass 2.** `Array.isArray(teamCfg.specializations) ? ... : []` (line 157), `if (!swarmConfig || typeof swarmConfig !== 'object')` (line 151), `if (!entry || typeof entry !== 'object') continue` (line 174). These guards mean a yaml file that parses to a non-object (e.g., a top-level scalar or array) doesn't throw — it just exits 0 quietly, consistent with fail-open.
- **Two distinct deny helpers.** `denyMissing` (Pass 1) and `denyRouting` (Pass 2) at lines 51-68. Both write to stdout once and return; the hook then exits 0. Splitting them into named functions makes it visually obvious which deny is which when reading the hook flow.
- **The fallback-default values explicitly mirror `utils/config.js`.** Hook lines 159-164 carry an inline comment ("Match utils/config.js defaults: enabled defaults to true, role defaults to 'developer'") explaining the duplication and pointing at D-012. This is exactly the kind of comment that helps a future reader understand a non-obvious choice.
- **Header comment is extended, not replaced.** Lines 21-31 add the Pass 2 narrative paragraph after the existing Pass 1 / GATE-1 narrative — preserves the historical "what does this hook actually do?" reading order.
- **Generator and emitted file stay in sync.** AC9 verified live: regenerating produces the exact bytes already on disk, and a second regeneration produces the same bytes again. No drift potential.

**Findings**

### F-003 (low) — Hook duplicates `utils/config.js` fallback default-application logic without enforcement to keep them in sync

Hook lines 163-164 inline `fallback.enabled !== false` and `fallback.role || 'developer'`, duplicating `utils/config.js:111-113`. The hook comment correctly flags the duplication and references D-012 ("does not import from utils/config.js to keep the hook a self-contained CommonJS script"). The ESM/CJS bridge problem is real and the chosen tradeoff is defensible.

**However**, if either side later changes its default (e.g., `fallback.role` defaults to `'reviewer'` in some future schema rev), the hook will silently disagree with the validator. There is currently no test that exercises BOTH the validator's `applyDefaults` and the hook's inline defaults against the same input — a regression of one side would not be caught by the existing suite.

This is dev-1's flagged escalation. I agree it is **not in WT-5 scope** to fix (the story does not require import unification, and ADR-008 is silent on it). It is properly scoped as a low-severity follow-up, similar to F-001/F-002.

**Suggested fix (follow-up):** Either (a) extract the default values into a small constants module that both ESM and CJS can `require`/`import` (e.g., `utils/team-defaults.cjs`), or (b) add a unit test that asserts the hook's inlined defaults match `utils/config.js`'s `applyDefaults` output for an empty config — the test would fail loudly if either drifts. Option (b) is the smaller change.

**Out of WT-5 scope.** Logged as F-003 in the findings register. Not blocking.

---

## Lens: test-coverage

**Quantitative**: 10 new tests added across AC1–AC8 (AC1 split into default-block-absent + explicit-dynamic; AC7 split into malformed-yaml + missing-yaml). Per the story's Subtasks 3.1–3.8, this is at-or-above the required count. Full suite: **342 passing, 0 failing, 0 skipped**.

**Qualitative**

- **Real subprocess spawn.** Tests use `spawnSync('node', [hookPath], ...)` — they exercise the hook the same way Claude Code invokes it, not a unit-extracted handler. This catches integration concerns (require resolution, process exit codes, stdout JSON serialization) that an in-process test would miss.
- **Per-test temp project directories** (`makeProject` at lines 244-251 — fresh `mkdtemp`-style dir + `wt5-<random>` suffix). No fixture cross-contamination; tests can run in any order. The hook's `cwd:` is set to that dir for the spawn, so `process.cwd()`-relative `swarm.yaml` resolution is exercised authentically.
- **The `NODE_PATH` injection at line 260-264 is a strong design choice.** Without it, Pass 2's `require('js-yaml')` would silently fail and the hook would fail-open (exit 0) — every "deny" assertion would have been a false pass. Dev-1's note confirms this was caught during initial test development (3 tests failed, then `NODE_PATH` was added). The comment at lines 256-259 explains the mechanism for future maintainers. This is exactly what good test-fixture engineering looks like: it models the "real installed dependency" case rather than testing a degenerate one.
- **Deny-reason assertions are precise.** AC4 uses three independent regex matches against the documented substrings (rather than a single big string equality), so a wording change in non-load-bearing parts won't break the test, but a wording change in any of the three load-bearing parts (`team mode is "fixed"`, `does not match any declared specialist`, `set team.fallback.enabled: true`) WILL. Same for AC5/AC8 (`developer domain=<bad>` regex). This is the right granularity for behavior-vs-implementation testing.
- **AC7 split into two tests is correct.** "Malformed YAML" (parse error) and "missing YAML" (file doesn't exist) hit different code paths (line 150 vs line 146) and both must fail open. Splitting them documents intent and protects each path from silent regression.
- **AC1 split into two tests is correct.** "No team block" (defaults applied during parse) and "explicit `mode: dynamic`" (value present) hit the same exit-0 line (155) but via different `teamCfg.mode` lookups — splitting protects against a future regression where one path is broken but the other isn't.
- **AC6 deliberately disables fallback** (line 435: `'    enabled: false'`) — this means non-specialized roles cannot be passing via the fallback path; they must be passing via the SPECIALIZED_ROLES set check. Cleanly isolates the assertion. The 6-role mix (architect/security/devops/researcher/strategist/ideator) covers every non-specialized role bmad-swarm currently knows about — so a future role-enum change would prompt a test update at the right spot.
- **AC8 mixed-team asserts the SPECIFIC bad entry is named in the deny reason** (line 513-514). This is the right behavior contract — a deny that names which entry failed is the actionable error message ADR-008 specified.

**Coverage gaps (none blocking)**

- No test asserts deny when **both** an unmatched-domain dev AND a no-domain dev appear in the same team. The current AC8 mixed-team test would catch this transitively (the early-exit fires on the first bad entry; if the no-domain were ordered first vs the unmatched-domain second, the deny reason would name the no-domain). But this is an order-dependent assertion that isn't directly checked. Out of scope; not blocking.
- The fail-open behavior on "swarm.yaml exists but is empty" (yaml.load returns null/undefined) is handled by line 151 (`!swarmConfig || typeof swarmConfig !== 'object'`) but isn't explicitly tested. The malformed-yaml test (AC7a) likely covers it transitively, but a one-line additional test could harden this. Out of scope; not blocking.
- F-003's drift-detection test (would catch validator/hook default disagreement) is explicitly NOT in scope and would be the natural addition if F-003 is later scheduled.

A separate `test-coverage-report.md` is not produced for this review — the test inventory above is sufficient given the bounded surface (one hook, one generator function, 10 tests, 1:1 mapping to ADR-008's verification cases).

---

## Decision Traceability

- **D-004** (parent strategic — wide-team specialization adoption): Verified — implementation supports the parent decision by enforcing routing correctness at the hook layer.
- **D-009** (`teamcreate-gate` Pass 2 enforcement, fail-open): **Verified — implemented**. Hook implements every line of ADR-008's spec; fail-open is exhaustive across 4 distinct error paths. Status flip recommended: D-009 → `verified` in `decision-log.md`.
- **D-012** (`require('js-yaml')` try/catch wrapped): **Verified — implemented**. Hook line 143 (`try { yaml = require('js-yaml'); } catch { process.exit(0); }`) and line 150 (`try { swarmConfig = yaml.load(swarmRaw); } catch { process.exit(0); }`) match the decision wording verbatim. Status flip recommended: D-012 → `verified`.
- **ADR-008**: Verified — every alternative rejection holds (no advisory-only, no fail-closed, no dedicated separate hook, no story-domain validation in hook).
- **ADR-003** (orchestrator-write-gate, two-layer identity check) — analog precedent: Honoured. The "load-bearing invariant requires hook enforcement" reasoning carries over cleanly. ADR-008 explicitly cites ADR-003's precedent in its Context section, and the Pass 2 implementation maintains the same posture (hook deny overrides permission mode, per D-001).
- **D-001** (permission model context): Honoured. The hook fires under `acceptEdits` because `permissionDecision: 'deny'` overrides permission mode (per the empirical verification in D-001). No new permission concerns introduced.
- **No new D-IDs created beyond D-012** — correct posture; D-012 is the only tactical choice that warranted a log entry.

---

## Findings register dedupe

Read `artifacts/context/findings-register.md` at review start. Two existing entries (F-001 `defaults.model` unvalidated, F-002 `team.fallback.role` not enum-validated) — both are validator-side concerns unrelated to WT-5's hook surface. No duplicates.

WT-5 produces ONE new finding: **F-003** (hook/validator default-application duplication without drift-detection). Dev-1 explicitly flagged this for reviewer call; I agree it is out-of-WT-5-scope and worth tracking as a follow-up. Logged as low-severity advisory in the findings register.

---

## Verdict

**approved**

All 10 acceptance criteria met. **342/342 tests passing**. AC9 idempotence verified live. AC10 no-regression verified by passing test suite.

One new low-severity advisory (F-003) appended to the findings register — captures dev-1's flagged concern about the hook duplicating validator default-application logic. Not blocking; suggested follow-up is a small drift-detection test or shared constants module.

D-009 and D-012 status flip to `verified` recommended. Story file ready for `complete` status.
