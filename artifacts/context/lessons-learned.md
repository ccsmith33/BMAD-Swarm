# Lessons Learned

Append-only log of recurring patterns extracted from completed-epic reviews. Per orchestrator process step (see `agents/orchestrator.md` §"Retrospective as process step").

---

## 2026-04-29 — Wide-team specialization feature (D-004; stories WT-1 through WT-7)

Implementation epic for D-004 (wide-team specialization) — 7 stories across schema (`utils/config.js`, `utils/validator.js`), agent docs (`agents/architect.md`, `agents/orchestrator.md`), hook extension (`generators/hooks-generator.js` + regenerated `.claude/hooks/teamcreate-gate.cjs`), methodology docs (`methodology/artifact-schemas/story.md`, `methodology/decision-traceability.md`), and retrofit docs (`README.md`, `templates/CLAUDE.md.template`, `generators/claude-md-generator.js`). **All 7 stories approved on first pass; zero blocking findings; 342/342 tests passing.**

### What worked

- **Architecture-first sequencing.** The architect produced a complete design + 6 ADRs + 7 detailed story files (with BDD ACs, file paths, anti-pattern lists, dev-notes pseudocode) before any implementation began. Both devs reported every story as "faithful transcription" with zero strategic judgment calls required at code-time. Story-engineering quality is high-leverage — it translated directly into clean implementation passes.
- **Anti-pattern lists in every story.** Each story spec included an explicit "do not do X" section. Devs cited them in completion reports ("did NOT touch the generated file per anti-pattern"; "no `Team mode: dynamic` rendered for default projects per anti-pattern"). Anti-pattern lists are cheaper to write than to debug post-merge — keep producing them.
- **D-ID reservation as coordination protocol.** Pre-assigning D-012 to dev-1's WT-5 (anticipated tactical decision around `js-yaml` import strategy) and reserving D-013+ for dev-2 prevented D-ID collisions across parallel work. Cheap convention with real value when devs run in parallel.
- **Continuous reviewer as consistency anchor.** One reviewer across 7 stories caught cross-story improvements that per-story reviewers would have missed — e.g., flagged §6.6 implementation as *better* than spec (single source of truth on the assembly schema instead of duplicate examples). Validates the "continuous reviewer" architectural choice from D-004 itself.
- **Sample reads of story files before approving.** Spot-checking WT-1 (foundation) and WT-5 (trickiest) before greenlighting implementation surfaced the `getTeamConfig` interface contract between the two stories early; allowed the orchestrator to relay it cleanly to dev-1.

### Recurring patterns to watch

- **"Out-of-scope but adjacent" findings cluster.** F-001 (`defaults.model` enum), F-002 (`team.fallback.role` enum), F-003 (hook ↔ config fallback-default duplication) all share the same shape: a validation or coverage gap in code touched by but not owned by the current story. Reviewer correctly logged all three as advisory (low). Pattern: when implementing schema-adjacent or hook-adjacent features, expect the reviewer to surface "while we're here" findings — ensure the findings register exists *before* the first review so they don't fall on the floor.
- **Race-replay noise from task queue across session restart.** After the mid-epic restart, dev-2 and reviewer received phantom `task_assignment` notifications for already-completed work. They handled it correctly (re-verified disk state, reported "no rework needed") but it generated several misleading chat turns. Future session-restart procedure should include explicit task-queue reconciliation.
- **Findings-register write-blockage on first attempt.** Reviewer's initial attempt to bootstrap `artifacts/context/findings-register.md` during the first review was blocked by a subagent guard. Orchestrator created the file post-WT-1; after that the register absorbed F-001/F-002/F-003 cleanly. Bootstrap-empty-coordination-files proactively at architecture-approval time, don't wait for the first writer to hit the wall.

### Preventive practices for next epic

- **Bootstrap `findings-register.md` at architecture-approval time** (not at first-finding time). Cheap, prevents the write-blockage encountered here.
- **Codify "architect doubles as story-engineer" in the small-feature flow.** This flow has no dedicated story-engineer step, so the architect produces story files in addition to architecture + ADRs. The pattern worked well here but had to be discovered. Add a one-line note to `agents/architect.md` covering the small-feature case so future architects don't have to be told.
- **Pre-assign tactical D-IDs across parallel devs in their spawn briefs.** Done here (dev-1 reserved D-012; dev-2 told to start at D-013). Continue.
- **For a 7-story feature, run regen + retrospective as a single end-of-epic batch** — done here at the cost of a short post-WT-7 turn. No surprise.

### Decision-log additions (this epic)

D-004 (parent strategic), D-005 through D-010 (architect's design ADRs), D-011 (human approval), D-012 (js-yaml require strategy in hook), D-013 (CLAUDE.md template `Team mode:` filter). **10 D-IDs total; all children verified by reviewer.**

### Findings register (open advisory follow-ups)

F-001, F-002, F-003 — all low-severity, scoped as "next time the relevant code is touched." None blocking; none in this epic's scope.

### Test coverage delta

332/332 → **342/342** (+10 new tests, all in `test/hooks.test.js` covering Pass 2 enforcement). Schema-side tests (`test/config.test.js`, `test/validator.test.js`) added 24 new cases bundled in WT-1's count.

---

## 2026-04-30 — Retrofit tooling for wide-team adoption (D-014; stories RT-1 through RT-4)

Implementation epic for D-014 — tooling that lets existing projects adopt the wide-team feature without hand-editing `architecture.md` and `swarm.yaml` from scratch. 4 stories: RT-1 (Domain Map parser, foundation), RT-2 (`bmad-swarm scaffold-team` CLI), RT-3 (`/retrofit-team` slash command), RT-4 (docs). **All 4 approved; RT-1/RT-2/RT-3 first-pass with zero findings; RT-4 approved-with-minor-issues (1 medium advisory + 2 lows).**

### What worked (continued from the wide-team epic)

- **The "architect-as-story-engineer in small-feature flow" pattern proved itself again.** Architect-2 produced architecture-retrofit.md + 3 ADRs + 4 story files in one design phase. Story file quality stayed at the bar set by the wide-team epic — devs reported zero strategic judgment calls required, every spec was implementable as transcribed.
- **D-ID reservation continued working.** Devs were told to start at D-019 (RT-1), D-020 (RT-2), D-022 (RT-4); RT-3 took zero. No D-ID collisions across parallel work even when devs landed work in close succession.
- **The "ESM-to-ESM import beats duplication" pattern.** RT-1's dev preemptively imported `DOMAIN_SLUG_RE` from `utils/validator.js` (logged as D-019), closing the F-003-class drift risk *by construction* on the parser side. The reviewer then flagged the symmetric F-004 (heading regex duplicated between scaffold-team CLI and the parser) — demonstrates that the F-003 pattern recurs everywhere two files derive from the same upstream spec, and the cheap-fix is always the same: export-and-import, not duplicate.
- **Bootstrapping `findings-register.md` at architecture time** (preventive practice from the wide-team retro) paid off — F-004 and F-005 went straight into the register with no friction.
- **Hybrid overlay+spawn pattern (ADR-010) is the third "process step" shape** alongside `/brainstorm` (D-BRN-1) and `/explore-idea` (D-BRN-4). Overlay handles the conversational design phase; a single architect spawn handles the file-edit phase that the orchestrator-write-gate forbids the orchestrator itself from doing. Pattern is reusable for any future tool that needs interactive proposal + file mutation (e.g., a hypothetical `/retrofit-stories`).

### Recurring patterns to watch

- **Spec-vs-implementation drift in transcript documentation.** F-005 (RT-4 review): the README transcript was anchored to architecture-retrofit.md §2.4 (which is correct per AC4), but the live CLI added comment lines during RT-2 that the architecture spec didn't anticipate. Result: README transcript lags the live CLI by ~10 lines of comments. Pattern: when later stories add output details not specified at architecture time, the docs that anchor to the architecture inherit the gap. Mitigation options for future epics: (a) update architecture during implementation when spec-tightening happens, (b) anchor doc transcripts to live command output rather than spec, (c) add a "transcript drift" check to the reviewer's docs-lens checklist.
- **Reviewer report bundling vs per-story.** RT-3 reviewer's verdict line "RT-1 + RT-2 + RT-3 all approved" was overconfident — only RT-1 + RT-3 had review reports written; RT-2's report landed shortly after but the reviewer's status summary in the RT-3 verdict didn't reflect that timeline. Required a clarifying ping. Pattern: reviewer should issue exactly one verdict message per story with a strict "this is verdict for story X only" framing — bundling progress into another story's verdict creates ambiguity. Codify in `agents/reviewer.md` next time it's touched: one SendMessage = one story verdict.
- **Race-replay across session boundaries.** Same pattern as the wide-team epic: phantom task_assignment notifications fire after dev/reviewer have already completed and reported the work. Devs handled it gracefully (re-verified disk state, reported "no rework needed"). Cheap to live with; expensive to fix at the harness level.

### Preventive practices for next epic

- **Codify "one verdict per story" in `agents/reviewer.md`.** Add a one-line rule. Prevents the RT-2/RT-3 confusion from recurring.
- **Add "transcript-vs-live-output check" to the reviewer's docs lens.** When a story's docs include CLI/command transcripts, reviewer runs the actual command and diffs output against the transcript. Catches F-005-class drift at first review, not later.
- **Continue importing-not-duplicating** for any file that anchors to the same upstream spec as another file. F-003/F-004 are the cautionary examples; D-019 is the model citizen.
- **End-of-feature `bmad-swarm update` is now a stable orchestrator process step** (parallel to the retrospective). Done at end of wide-team and again here. Codify in `agents/orchestrator.md` under the retrospective section as "after the retrospective, run `bmad-swarm update` to sync `.claude/` to the source `.md` changes."

### Decision-log additions (this epic)

D-014 (parent strategic), D-015 (overlay-vs-spawn), D-016 (write safety), D-017 (parser contract), D-018 (human approval), D-019 (slug regex import), D-020 (inline LCS diff in scaffold-team), D-021 (yaml.dump re-emit shape), D-022 (RT-4 doc shape — bundled). **9 D-IDs total; all children verified by reviewer.**

### Findings register (open advisory follow-ups)

- F-004 (low) — heading regex duplicated between `cli/scaffold-team.js` and `utils/domain-map.js`. ESM-to-ESM, fixable by export-and-import.
- F-005 (medium) — README transcript trails live CLI by ~10 comment lines. Spec-anchored, satisfies AC; address on next README touch.

Pre-existing F-001/F-002/F-003 still open from the wide-team epic; none addressed in this epic (out of scope).

### Test coverage delta

342/342 → **391/391** (+49 new tests). Breakdown: +25 in `test/domain-map.test.js` (RT-1 parser), +24 in `test/scaffold-team.test.js` + `test/generators.test.js` (RT-2 CLI + RT-3 slash command). RT-4 added zero (doc-only per spec).

## 2026-06-09 — fable-support epic retrospective (1 story, review APPROVED)

Source: `artifacts/reviews/review-fable-support-1.md` (D-023; D-024–D-026 tactical).

### Recurring findings by category

- **Architecture compliance / harness drift:** transcript-format drift broke `teamcreate-gate` under Fable 5 (empty thinking blocks, deferred text flush) — the second harness-drift incident after HARN-1. **Preventive practice:** enforcement hooks must not depend on harness internals (transcript shapes, env vars) as their only channel; prefer explicit file-based handshakes in repo-controlled paths (the HARN-2 Pass 3 pattern). Audit remaining hooks for transcript/env coupling.
- **Test isolation:** hook tests ran with cwd = repo root, so the repo's own live config/artifacts leaked into cwd-relative reads — deny tests passed for the wrong reason once Pass 3 landed. **Preventive practice:** hook/CLI tests default to a hermetic tmp cwd (now done in `runHook`); treat any test reading cwd-relative paths as suspect.
- **Validation gaps cluster on sibling fields:** F-001 (`defaults.model`) reconfirmed and its sibling F-007 (`agents.*.model`) logged — enum validation was added field-by-field, leaving look-alike fields unvalidated and one new test passing trivially. **Preventive practice:** when validating one field of a config family, validate (and test-negative) every sibling in the same pass.
- **Stale constants survive scoped stories:** correct fable pricing landed next to a stale opus baseline (F-006), inverting the documented cost ordering. **Preventive practice:** when a story adds a value adjacent to existing constants of the same kind, verify the neighbors or flag them explicitly in the completion message (the developer did flag it — the practice worked; the follow-up just needs scheduling).

### Test coverage delta

391/391 → **410/410** (+19): 8 HARN-2 hook tests, fable acceptance across validator/config suites, 2 fable pricing tests, 2 parameterized-command generator tests, plus assertion updates.

## 2026-06-10 — v3-coordination epic retrospective (1 story + 1 follow-up, APPROVED + VERIFIED)

Source: `artifacts/reviews/review-v3-coordination-1.md` (D-028; D-029–D-032 tactical; F-011/F-012 resolved in follow-up; F-013/F-014 open advisory).

### Recurring findings by category

- **Correctness / new enforcement paths need adversarial probes before ship:** the brand-new handshake gate shipped with a probe-provable hole (F-011, unclosed fence silently re-accepting the previous block) that unit tests missed but the reviewer's exploit-style probe caught immediately. **Preventive practice:** any change to an enforcement hook gets at least one attacker-mindset probe (malformed/partial/stale input geometries) as part of the story's own test plan, not just the review.
- **Instruction-surface drift:** changing the TeamCreate contract (ADR-013) updated the invariant and orchestrator identity but missed 11 workflow command bodies that restate the old contract (F-012) — they sat outside both developer sessions' file lists. **Preventive practice:** when a contract changes, grep ALL instruction surfaces (agents/, generators' command bodies, templates/, README) for the old contract's distinctive phrasing before declaring done; pin with a generator content assertion as done here.
- **Coordination / a third wake channel exists:** the single-wake-channel protocol (item 0) accounted for self-claim and start messages, but TaskUpdate ASSIGNMENT notifications also wake idle teammates — the reviewer self-started its blocked verification task on assignment. **Preventive practice:** assign owners to blocked tasks at creation time but state in the task description that assignment ≠ start; the start message remains the only go signal. Consider folding this into the generated Team task protocol text.
- **Host-restart resilience (3 crashes this epic):** work-on-disk survived every time; coordination state (teams, tasks, in-flight progress) never did. Recovery worked but cost a forensic re-derivation each time, and one crash masqueraded as a silently-stalled teammate. **Preventive practice:** adopt the durable epic-state artifact (orchestrator-maintained task-graph snapshot in artifacts/context/) as the next framework epic; until then, orchestrators should treat unexplained teammate idleness after in_progress as a possible host cut and check the working tree before re-instructing.
- **Two-author seams are manageable when accounted explicitly:** the resume developer's inherited-vs-redone declaration let the reviewer target the seams; the only seam casualty (F-012) was in files NEITHER session listed. Pattern worth keeping for any resumed story.

### Test coverage delta

410/410 → **418/418** (net +8 after −28 obsolete transcript tests): handshake gate suite (48 hook tests incl. 2 F-011 regressions), fs-helpers marker compatibility (+ Quinn-oracle verification), native agent-definition + task-protocol generator assertions, F-012 content pins.
