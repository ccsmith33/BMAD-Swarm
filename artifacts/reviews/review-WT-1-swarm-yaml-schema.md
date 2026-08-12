# Review: Story WT-1 — `swarm.yaml` `team` block schema + validator

**Story:** `artifacts/implementation/stories/story-WT-1-swarm-yaml-schema.md`
**Reviewer:** reviewer (lenses: `code-quality`, `test-coverage`)
**Date:** 2026-04-28
**Verdict:** **approved**

---

## Summary

WT-1 lands a clean, faithful implementation of ADR-004's `team` block schema. All 10 acceptance criteria pass against the implementation and the test suite. Defaults are applied in the documented site (`utils/config.js:applyDefaults`), validation rules mirror the architecture spec (`utils/validator.js`), and `getTeamConfig()` is exported as the WT-5 hook handle. The repo's own `swarm.yaml` continues to parse without error (Task 5 verified directly). 332/332 tests pass; 24 of those are new for WT-1.

The `VALID_MODELS = ['haiku','sonnet','opus','inherit']` enum that dev-1 flagged for sanity-check matches `architecture.md` §3.1 (line 106) exactly — the choice is consistent with the architecture and the broader per-agent model-override convention.

No blocking findings. Two low-severity advisory observations are recorded below for future hygiene.

---

## Acceptance criteria verification

| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | Existing swarm.yaml without `team:` block round-trips to defaults | PASS | `applyDefaults` (`utils/config.js:106-117`) seeds `team.mode='dynamic'`, `specializations=[]`, `fallback.enabled=true`, `fallback.role='developer'`, `fallback.model=defaults.model`. Verified by `test/config.test.js:101-111` and live load of `./swarm.yaml`. |
| AC2 | Valid fixed-mode config parses with per-spec defaults | PASS | Per-spec `model` and `description` defaulting at `utils/config.js:114-117`. `test/config.test.js:113-137` asserts both entries' `model: 'opus'` (inherited) and entry-2's `description: ''`. |
| AC3 | Invalid `team.mode` rejected with documented message | PASS | `utils/validator.js:70-72` produces `team.mode "hybrid" is invalid. Valid options: dynamic, fixed`. Asserted by `test/config.test.js:139-146`. |
| AC4 | Fixed mode + empty specializations rejected | PASS | `utils/validator.js:76-78` produces `team.mode is "fixed" but team.specializations is empty`. Asserted by `test/config.test.js:148-155`. |
| AC5 | Invalid specialist role rejected | PASS | `utils/validator.js:85-87` rejects with message containing `developer and reviewer are valid v1 specialist roles`. Asserted by `test/config.test.js:157-172`. |
| AC6 | Invalid domain slug rejected with regex in message | PASS | `utils/validator.js:89-91` cites the regex `^[a-z0-9][a-z0-9-]*[a-z0-9]$` in the error. Asserted by `test/config.test.js:174-189` and reinforced by validator tests for leading/trailing-hyphen + single-char domains. |
| AC7 | Duplicate `(role, domain)` rejected; same domain across different roles allowed | PASS | `utils/validator.js:97-101` uses a `role::domain` set key. `test/config.test.js:191-208` covers the reject; `test/validator.test.js:233-245` confirms cross-role same-domain is permitted (matches ADR-004's stated forward-compat rationale for specialist reviewers). |
| AC8 | Disabling fallback in fixed mode warns, does not throw | PASS | `utils/validator.js:108-110` writes via `console.warn` only when both conditions hold. `test/config.test.js:210-237` stubs `console.warn`, asserts no throw, and verifies the warning string contains `fallback disabled in fixed mode`. |
| AC9 | Per-spec `model` overrides `defaults.model` | PASS | `utils/config.js:114-117` only fills missing values. `test/config.test.js:239-259` confirms `sonnet` override survives while sibling spec inherits `opus`. |
| AC10 | `getTeamConfig(config)` exported, returns normalized view | PASS | Exported at `utils/config.js:129-131`. `test/config.test.js:261-294` covers both fixed and dynamic shapes; the returned object has the documented `{mode, specializations, fallback: {enabled, role, model}}` keys. |

All 10 ACs met.

---

## Architecture compliance

- ADR-004 schema shape (mode | specializations[] | fallback): implemented as specified.
- Defaults snippet in architecture.md §3.4 (lines 113-122): the implementation is a superset — it correctly adds the `model` defaulting and per-spec `description` backfill that §3.4's snippet omits but the ACs require.
- Validation rules in architecture.md §3.3: each numbered rule (1-5) maps 1:1 to a check in `validateConfig`.
- Anti-pattern guidance in the story's Dev Notes is honoured: no js-yaml schema layer, no silent slug fixups, no extra fields beyond ADR-004, `team` block remains fully optional.

No deviation from the architecture document. No ADR required.

---

## Lens: code-quality

**Strengths**

- Validation logic is co-located with the existing pattern in `validator.js` (push to `errors`; loader throws). No new error machinery introduced.
- Constants named at module top (`VALID_TEAM_MODES`, `VALID_SPECIALIST_ROLES`, `VALID_MODELS`, `DOMAIN_SLUG_RE`) — discoverable, single source of truth, easy to extend when v2 adds roles.
- The `(role, domain)` uniqueness key uses `::` separator, which can't collide with any kebab-case slug — defensible against future role names containing hyphens.
- `getTeamConfig` is a thin pass-through that exists for the WT-5 import boundary (per the story's tactical note); resists the temptation to add transformation logic that doesn't yet have a caller.

**Findings (low only)**

- **F-001 (low) — `defaults.model` itself is unvalidated** — `utils/config.js:104` accepts any string for `config.defaults.model`. `team.fallback.model` (when absent) inherits from `defaults.model`, so an invalid `defaults.model` propagates silently into `fallback.model` and per-spec model defaults. WT-1 is not in scope to fix this (pre-existing gap; ADR-004 §3.3 rule 4 only addresses the team-block models), but the new `VALID_MODELS` constant is the natural place to extend coverage. _Recommendation: log as a follow-up; do not block WT-1._
- **F-002 (low) — `team.fallback.role` is not enum-validated** — Only `fallback.model` is checked against `VALID_MODELS`; `fallback.role` accepts any string. If a user writes `team.fallback.role: ideator` the validator passes but the orchestrator's spawn logic in WT-5 will misroute. ADR-004's table at line 78 implies `developer` is the only sensible value in v1, but the enum is not enforced. _Recommendation: add `VALID_SPECIALIST_ROLES.includes(config.team.fallback.role)` in a follow-up; do not block WT-1._

Both are advisory and out of WT-1 scope (story ACs do not require either check).

---

## Lens: test-coverage

**Quantitative**: 24 new tests added for WT-1 across the two suites. Every AC has at least one assertion in `test/config.test.js`; the validator unit suite adds 13 narrower checks that exercise edge cases (leading/trailing-hyphen domains, single-char domains, same-domain-across-roles, invalid `fallback.model`).

**Qualitative**

- AC tests use `loadSwarmConfig` end-to-end (real YAML round-trip → `applyDefaults` → `validateConfig`), not mocked validation. This is the correct posture per the story's Dev Notes "Testing Approach" section.
- AC8 captures `console.warn` via stub-and-restore in a `try/finally`, which protects sibling tests from leaked stubs.
- AC2 and AC9 use distinct fixture files (`fixed-mode.yaml` vs `per-spec-model.yaml`) — isolation is clean; tests can run in any order.
- Validator-level tests use direct config objects (no file I/O), which keeps them fast and decoupled from yaml parsing concerns.
- The `rejects single-char domain (deliberately)` test (`test/validator.test.js:211-217`) is particularly valuable — it documents intent, not just behavior. Single-char domains are rejected by regex shape, and the test name encodes the deliberate choice.

**Coverage gaps (none blocking)**

- No test asserts that a `team.fallback.model: 'sonnet'` overrides the default. Only the rejection case is tested. _This is implicit from `applyDefaults` reading the existing value, but a positive override test would mirror AC9's pattern at the fallback level. Out of WT-1's AC scope; flagged for awareness only._
- The repo's own `swarm.yaml` is not tested via an automated assertion; Task 5 was verified manually in this review (`node -e "import(...)..."` returned `OK — team.mode: dynamic — specs: 0 — fallback.enabled: true — fallback.model: opus`). A regression test using the live `./swarm.yaml` would be a small addition that would catch repo-config drift. Out of scope for WT-1 ACs.

A separate `test-coverage-report.md` is not produced for this review — the test inventory above is sufficient given the narrow surface (2 files, 24 tests, no integration boundaries).

---

## Decision Traceability

- **D-004** (parent strategic): Verified — implementation follows the wide-team specialization shape; nothing in WT-1 contradicts the parent decision.
- **D-005** (`swarm.yaml` `team` block schema): **Verified — implemented**. Schema, defaults, validation rules all match ADR-004. Status should advance from `implemented` → `verified` in `decision-log.md`.
- **ADR-004**: Verified — every alternative rejection holds (no `team.developers: 3` count shape, no embedding inside `agents.*`, no external file).
- **No new D-IDs created** during implementation. Dev-1's report explicitly notes "no tactical D-IDs logged" — this is correct for WT-1 because the only judgment call (the `VALID_MODELS` enum values) is fully specified in architecture.md §3.1 line 106 and is not a new decision.

---

## Findings register dedupe

Read `artifacts/context/findings-register.md` at review start — file did not exist. Initialized the register with the documented schema and added F-001, F-002 below.

---

## Test execution

```
$ npm test
ℹ tests 332
ℹ pass 332
ℹ fail 0
```

Full suite green. No flaky tests observed.

---

## Verdict

**approved**

All 10 acceptance criteria met. No high or medium findings. Two low-severity advisory items (F-001, F-002) recorded for future tightening of model/role enum coverage outside the team block — neither blocks WT-1 and neither falls within WT-1's documented scope.

WT-5 (hook extension) is unblocked: the `getTeamConfig` import handle is in place at `utils/config.js:129`.
