# Adversarial Review — Phase 1: Truth Sweep (WS-5) + Self-Contained Scaffolds (WS-6)

- **Reviewer:** reviewer (adversarial)
- **Date:** 2026-08-12
- **Branch:** `reinvention/phase1-truth-self-containment` (changes uncommitted in working tree vs `main`)
- **Spec:** `artifacts/design/phase1-truth-self-containment-2026-08-12.md`
- **Lenses:** code-quality, test-coverage, data
- **Verdict:** **CHANGES REQUIRED** — one blocking finding (M1); everything else solid.

## Summary

The workstream does what it claims. I independently reverified both headline claims and every priority-scrutiny item the team lead flagged. The self-containment fix (CB-1) is genuinely closed — a fresh `init` into a temp dir has **zero** dangling repo-relative references (my first grep was buggy and produced false positives; the corrected grep confirms clean). Deletions are safe — no live code/runtime reference to any deleted file. Entry-point single-sourcing, cost-estimator integration, and path-rewrite idempotency are correct and well-tested. The gitignore v2 flip preserves user content outside its managed block.

The **one real defect** is a gate widening in WS-5 that is unbacked by the schema and not needed by any artifact (M1). It is a one-line fix. Because the entire thesis of WS-5 is "the validator must contain no structural behavior absent from the schema," shipping a validator *allowance* the schema does not sanction contradicts the workstream's own exit invariant. I am treating it as blocking on that basis, not because its blast radius is large.

## Claims reverified (independently)

| Claim | Result |
|---|---|
| `npm test` 470/470 | ✅ 470 pass / 0 fail |
| `validate` 109/0 | ✅ 109 passed / 0 failed |
| CB-1: fresh init has no dangling refs | ✅ 0 bare `methodology/` or `agents/<role>` refs (corrected grep over generated `.claude/**` + `CLAUDE.md`) |
| Deletions genuinely orphaned | ✅ No live reader; only historical prose notes + README doc drift (L2) |
| `plan-only` → `[]`, unknown key throws | ✅ `estimateCost({}, 'plan-only')` → $0.00; `'bogus'` throws |
| scaffold-paths idempotent | ✅ `rewrite(rewrite(x)) === rewrite(x)` |
| `validate --phase bogus` clean error | ✅ prints "Unknown phase… Valid phases:" and exits 1 |

## Findings

### M1 (MEDIUM → treated blocking) — `### ACn:` regex branch is unbacked by the schema and non-load-bearing

- **Where:** `methodology/artifact-schemas/spec.yaml:77` (pattern `acceptance-criteria-format`), consumed by `utils/artifact-validator.js:158-164`.
- **What:** The AC regex accepts three alternatives:
  `(\bGiven\b[\s\S]*\bThen\b)|(#{2,4}\s*AC\d+)|(- \[[ x]\] ?AC\d+)`.
  The middle alternative `(#{2,4}\s*AC\d+)` green-lights a story on the presence of a bare `### AC1:` heading alone, with no behavioral body.
- **Demonstrated:** a constructed story containing only `## Acceptance Criteria` + `### AC1: x` + one `- [ ]` task (no Given/Then, no error-path AC) **passes** validation. Before this change it would have failed.
- **Not load-bearing:** all 11 stories in the repo that use `### ACn:` headings *also* satisfy the BDD branch (`Given…Then`) or the checklist branch (`- [ ] ACn:`). **No story in the repo passes only via the heading branch.** The two stories that genuinely motivated a widening (RT-3, RT-4) have `Given…Then` without `When` — those are handled by dropping `When`, not by the heading alternative.
- **Not backed by the schema prose:** `methodology/artifact-schemas/story.md:124` enumerates exactly two satisfying registers — "Given/When/Then scenarios **or** a list of `- [ ] AC<n>:` checklist items." A bare `### ACn:` heading is described only as the *layout* for a BDD criterion, never as a standalone register. So the validator now accepts a format the authoritative schema does not sanction — the inverse of the "validator invents requirements" anti-pattern WS-5 set out to eliminate.
- **Fix:** delete the `(#{2,4}\s*AC\d+)` alternative from `spec.yaml:77` (and mirror the message). Canonical BDD stories still match via `\bGiven\b[\s\S]*\bThen\b`; the checklist register is untouched. Rerun `validate` (expected: still 109/0) and `npm test`.
- **Confidence:** high on the facts (all verified empirically); the medium severity reflects that the validator is a structural smoke test and AC *semantics* remain the reviewer's job — but this is an unjustified relaxation that contradicts the workstream invariant, so it should not ship.

**Note (accepted, not a finding):** dropping the `When` requirement from the BDD branch **is** justified — RT-3 and RT-4 carry `Given…Then` state-assertion ACs with no `When`, and `story.md:120` was amended to make `When` optional for state-assertion criteria. Schema prose ↔ regex agree here. Keep it.

### M2 (MEDIUM) — Lockstep guard does not cover `required_patterns`, giving false drift-protection confidence

- **Where:** `test/artifact-spec.test.js` asserts only that each `required_sections` entry appears as a heading in the schema `.md`. It never inspects `required_patterns`/regexes (beyond compiling them).
- **Why it matters:** the design (§2.1) claims "the prose and the machine spec cannot drift silently." That holds for section headings only. The acceptance-criteria regex — where the actual AC gate lives and where M1's unbacked branch slipped in — is entirely unguarded by lockstep. Both the `When`-drop and the `### ACn:` addition landed with no test able to catch divergence from the schema prose.
- **Fix:** add an assertion that the AC registers accepted by the regex correspond to the registers enumerated in each schema's prose (or, minimally, a focused test that documents the exact accepted registers so a future silent change trips). At absolute minimum, annotate `spec.yaml` that patterns are NOT lockstep-guarded so the guarantee is not overstated.
- **Confidence:** high.

### L1 (LOW) — gitignore v2 removes user entries placed *inside* the managed block

- **Where:** `utils/fs-helpers.js:239-245` (wholesale marker-section replacement).
- **Verified:** content above the marker and after a trailing blank/comment survives; an entry a user hand-added directly among the managed lines (e.g. `my-secret.env` appended into the old broad section) is **deleted** on migration.
- **Assessment:** by-design per spec §3.5 (wholesale replacement was ratified), region is comment-marked "generated," and loss is git-recoverable. Residual risk is a pre-Phase-1 user who appended a personal ignore into the old broad block loses it silently on `update`.
- **Fix (optional):** have the migration notice / `doctor` advise keeping custom ignores outside the managed block, or strip only the known old-broad entry set rather than everything between marker and blank line.
- **Confidence:** high.

### L2 (LOW, docs lens) — README file-tree documents deleted methodology files as present

- **Where:** `README.md:504-509` still lists `task-templates/` (deleted), `orchestration-modes.md` (deleted), `adaptive-interaction.md` (deleted), and `quality-gates/ … (PRD, architecture, code, etc.)` (4 of 5 files deleted; only `code-quality.md` remains).
- **Assessment:** design §6.4 scoped README prose out of this slice, so non-blocking — but this is live doc drift shipping in the same change that deleted the files.
- **Fix:** update the README methodology tree; correct the quality-gates line to reflect only `code-quality.md`. This PR or a fast follow.
- **Confidence:** high.

## What I tried to break and could not

- **Self-containment hole via the exemption list:** the `<domain>`/`settings.local.json` exemptions in `test/self-containment.test.js` apply only to the on-disk existence check (part b); the bare-prefix dangling ban (part a) is unexempted. An independent grep of a real fresh init found zero bare `methodology/`/`agents/` refs — the rewrite is applied to backticked *and* non-backticked prose refs. CB-1 is genuinely closed.
- **Deletions removing something load-bearing:** grep across `*.js/*.md/*.yaml/*.json` (excluding artifacts/node_modules/.git) found no live reference to any deleted file — only "Folded from the former …" historical notes in the schemas, a phases.yaml comment, a test comment, CHANGELOG history, and the README drift (L2).
- **cost-estimator unknown-key fallback:** `agentsForEntryPoint` throws on unknown keys; `estimateCost` propagates it. `plan-only` → `[]` → $0.00. Correct.
- **entry-points lockstep tautology:** not tautological — `test/entry-points.test.js` reads the actual `orchestrator.md` enum line, `phases.yaml` keys *and* per-key agent lists, cost-estimator output per key, and the `entry_point:` literals emitted by `commands-generator.js`, comparing each to the constant. Strong.
- **Malformed artifacts other than M1:** empty-prose AC and incidental lowercase "given…then" prose both correctly **fail**. The `\bThen\b` case-sensitivity blocks incidental prose matches.

## Decision Traceability

- **D-041** (npm publish gated on WS-5 + WS-6): implementation consistent — validate green, self-contained init verified. Not yet "verified" end-to-end pending the joint dogfood (`update` on this repo) noted as known-deferred.
- **D-042** (sharing model / gitignore flip): implemented in `updateGitignore` v2 as specified. Verified.
- **ADR-E** ("ship methodology subset into scaffolds"): unminted; team lead is routing separately (known-deferred). Not a finding.
- **New decisions:** `D-048` (tier-mix, D-027 superseded) is logged in `decision-log.md` with a full strategic record and human-confirmation note — properly documented, out of this workstream's file scope but valid.
- No decision *violations* found: no implementation choice contradicts a logged decision.

## Test-coverage assessment

- New suites (`artifact-spec`, `entry-points`, `self-containment`) are real behavioral tests, not presence checks — they init into temp dirs, run the CLI, and compare against sources. Fixtures are generated from the real package (`METHODOLOGY_SHIP_LIST`, real `init`/`update`), not hand-rolled synthetic — provenance is sound.
- **Coverage gap (feeds M2):** no test pins the AC-format regex's accepted registers to the schema prose; the pattern layer of the "lockstep" is untested. The malformed-story skeleton case (M1) has no negative test guarding against it.

## Exit-criteria check

| Criterion | Status |
|---|---|
| WS-5: `validate` fully green on repo | ✅ |
| WS-5: `npm test` green | ✅ |
| WS-5: spec↔schema + entry-point lockstep tests exist and pass | ✅ (sections only — see M2) |
| WS-5: zero validator structural *requirements* absent from schemas | ✅ requirements; ❌ allowances (M1 — an accept-rule absent from the schema) |
| WS-6: references-resolve + update-migration tests green | ✅ |
| WS-6: fresh init has zero dangling repo-relative refs | ✅ |
| WS-6: gitignore minimal ignore set | ✅ |
