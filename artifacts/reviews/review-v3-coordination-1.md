# Review — v3 coordination layer change set (Task #2, resume)

- **Reviewer:** reviewer (team v3-coordination-r2)
- **Date:** 2026-06-09
- **Lenses:** code-quality, test-coverage
- **Governing decision:** D-028 (strategic); developer tacticals D-029–D-032
- **Scope:** v3 delta only — current working tree diffed against the reconstructed pre-v3 tree (HEAD + `artifacts/context/.pre-v3-baseline.diff`, applied in a temp worktree). Pre-existing untracked artifacts (WT/RT stories, reviews, architecture docs) excluded as out-of-delta.
- **Verdict:** **APPROVED with minor issues** (zero blocking findings; 2 medium advisories, 3 low advisories)
- **Test result:** `npm test` → **415 / 415 pass**, 65 suites, 0 fail (run independently by reviewer; matches the developer's claim). 46 hook tests confirmed by count.
- **Generated-file drift:** none — independently regenerated `.claude/{agents,hooks,commands,rules}` and `CLAUDE.md` from this repo's `swarm.yaml`; all byte-identical to the committed outputs (only the runtime `.claude/hooks/.session-active` session marker differs, which is not generated content).

## Summary

The change set implements all three D-028 items faithfully. (0) The single wake-channel task protocol is injected into exactly the 8 non-orchestrator teammates with the matching owner-assignment rules added to the orchestrator identity; no self-claim residue remains anywhere in the repo. (1) All 9 generated agents are valid native Claude Code agent definitions — frontmatter first bytes, js-yaml-parseable, `name`/`description` present with the defensive anti-delegation phrasing, `model: fable` and the developer's `isolation: worktree` preserved; the native-spawn experiment (run from the orchestrator seat) confirmed hot registry pickup with no session restart. (2) The gate is fully transcript-free — `transcript_path` is ignored, all three transcript passes are deleted, Pass 1 anchors on the last fence in the whole handshake file (F-009 resolved with regression tests), deny messages are actionable, and Pass 2 routing runs on the handshake-accepted block. ADR-013/ADR-014 are accurate against the code, D-029–D-032 are properly logged with the inherited-vs-redone seam explicitly annotated, and the CHANGELOG/README/CLAUDE.md/template were updated consistently.

The two-author seam (priority-1 attack surface) held up under direct probing: the inherited `utils/fs-helpers.js` marker logic round-trips both formats, and the live Quinn oracle check found **27/27** old-format files under `.claude/{agents,commands}` (plus 2 rules files = the ADR's 29/29 claim, independently reproduced) recognized as generated with **zero false "modified" flags**. Tampering is detected in body, frontmatter, and old-format placements.

Two genuine defects were found, both advisory: the gate silently accepts a previous valid handshake block when the newest append has an unclosed fence (empirically confirmed — a fixed-mode roster that Pass 2 would deny escapes the check), and seven workflow command bodies still instruct "emit this assembly block and call TeamCreate" without the now-required log append.

## Task-spec attack-surface verification

| # | Surface | Status | Evidence |
|---|---|---|---|
| 1 | fs-helpers hash detection (inherited code) | PASS | Quinn oracle: 27/27 `.md` files in agents+commands recognized, 0 false modified; new-format round-trip + tamper detection (body, frontmatter, old format) all confirmed by live probe; `MARKER_SEARCH_LINES=10` window holds (real markers at lines 6–7); CRLF cases tested |
| 2 | Gate rewrite (redone from scratch) | PASS (one advisory, F-011) | No `transcript_path` reference anywhere in the generated hook; `deny()` exits inline; all four deny messages name the file and corrective action; fresh-project bootstrap cannot brick (missing log → actionable deny; `artifacts/context/` is an allowed orchestrator write path); F-009 resolved with two regression tests; Pass 2 confirmed to run on the handshake block (test + my own deny probe) |
| 3 | Agent definitions | PASS (one advisory, F-013) | All 9: frontmatter first bytes, js-yaml OK, `name`+`description`+`model` present, descriptions delegation-defensive, `isolation: worktree` survives; native-spawn experiment succeeded mid-session (orchestrator-seat result, incorporated) |
| 4 | Wake-protocol text | PASS | Orchestrator "Coordination discipline" owner-assignment rules and the injected "Team task protocol" are mutually consistent; peer-to-peer messaging explicitly preserved; zero self-claim residue (repo-wide grep); the only remaining "FIRST: Invoke /identity" strings are retirement notices in `agents/orchestrator.md:166` and the CHANGELOG |
| 5 | Docs / traceability | PASS (one advisory, F-012) | ADR-013 and ADR-014 exist and match the code line-for-line (29/29 Quinn claim reproduced); CHANGELOG migration note present and accurate; README ceremony text replaced; CLAUDE.md + template invariant updated to the append-to-log wording; D-028 logged strategic, D-029–D-032 tactical with seam annotations; F-009 marked resolved with mechanism + test evidence |
| 6 | Tests green | PASS | 415/415, 65 suites, independent run |

## Findings

### Medium (advisory)

**F-011 (medium, advisory, confidence: high — empirically confirmed) — An unclosed `bmad-assembly` fence in the newest log append silently re-validates the PREVIOUS block, bypassing Pass 2 routing for the imminent TeamCreate.**
`generators/hooks-generator.js` / `.claude/hooks/teamcreate-gate.cjs:80` — `FENCE_RE` only matches *closed* fences, so when the orchestrator's latest append is malformed (opening ```` ```bmad-assembly ```` without a closing fence — exactly the "orchestrator made a writing mistake" case the deny messages exist to catch), the last *complete* match is the previous block. The file mtime is fresh (it was just appended), so Pass 1 accepts the old block and Pass 2 routing validates the OLD roster. Confirmed by probe: with `team.mode: fixed`, a valid `backend-auth` block followed by an unclosed block declaring `developer domain=payments-api` (which Pass 2 denies when closed — covered by test AC5) produced a silent accept, exit 0. The existing test "denies on the LAST block even when an earlier block is valid" covers an incomplete-but-**closed** last block only. Severity tempered by design intent: the gate is "a shape check, not an authorization boundary," it never inspects the actual `tool_input` roster even on the happy path, and an unclosed-fence author has demonstrably done the planning the ceremony exists to force. *Suggested fix:* after the last complete match, check `logRaw.indexOf('```bmad-assembly', FENCE_RE.lastIndex)` (or search the remainder after the last match) — if a later unclosed opener exists, deny with "the newest bmad-assembly block is unclosed (missing closing fence)". One test: valid block + unclosed newer block → deny.

**F-012 (medium, advisory, confidence: high) — Seven generated workflow commands still instruct "emit this assembly block and call TeamCreate" with no mention of the now-REQUIRED log append.**
`generators/commands-generator.js` workflow builders → `.claude/commands/{bug,feature,plan,brainstorm,explore-idea,retrofit-team}.md` (+ the ideator identity text): the bodies predate ADR-013 (hashes unchanged from the baseline; only the marker moved) and describe the retired message-channel contract. An orchestrator following a workflow command literally — without the Invariant-1 context, e.g. deep in a session — emits the block in its message, calls TeamCreate, and is denied. The failure self-heals in one round trip because the deny message names the corrective action, and `/identity-orchestrator` + CLAUDE.md carry the correct invariant, so this is advisory rather than blocking — but the instruction surfaces now contradict each other, which is the exact drift class ADR-014's alternative D was rejected for. *Suggested fix:* update the builder wording in `generators/commands-generator.js` to "append this assembly block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then call TeamCreate", regenerate, and extend the existing generator content assertions to match.

### Low (advisory)

**F-013 (low, advisory, confidence: medium) — `orchestrator.md` also receives registration frontmatter, making "orchestrator" natively spawnable with a self-contradictory description.**
`generators/agent-generator.js` applies `applyIdentityFrontmatter` to all agents including the orchestrator, whose generated description reads "Orchestrator teammate … spawned by the orchestrator via the team flow." ADR-014 is explicit that the main session cannot be a custom agent type and the orchestrator is excluded from the task protocol — but it is now registered in the agent registry, so `subagent_type: "orchestrator"` resolves, inviting a second orchestrator that carries full TeamCreate ambitions and no teammate protocol. Impact is speculative (the defensive description discourages auto-delegation). *Suggested fix:* either skip the identity frontmatter for the orchestrator (mirroring the task-protocol exclusion) or give it a bespoke description ("Main-session role — do not spawn; loaded via /identity-orchestrator").

**F-014 (low, advisory, confidence: high mechanics / low likelihood) — `MARKER_SEARCH_LINES = 10` silently degrades modification protection if generated frontmatter ever grows past ~8 lines.**
`utils/fs-helpers.js:41` — a marker pushed beyond line 10 (e.g. a future `tools:` list or multi-line description in agent frontmatter) is invisible to `findHtmlMarker`; `isFileManuallyModified` then returns `false` ("no header = pre-hash file, allow overwrite"), so `bmad-swarm update` would silently overwrite user edits to such a file. Current frontmatter is 5–6 lines (markers at lines 6–7) and the constant is documented, so this is a tripwire, not a defect. The detection-side behavior is test-covered ("ignores a marker that only appears beyond the first 10 lines"); the *write* side has no guard. *Suggested fix (if ever revisited):* in `writeGeneratedFile`, assert/warn when the computed marker insertion point exceeds `MARKER_SEARCH_LINES`, or derive the search limit from the frontmatter fence position instead of a constant.

**OBS-1 (low, doc observation, per team-lead request) — ADR-014's session-restart caveat is now provably conservative.**
ADR-014 Consequences says registration "may require a session restart"; the CHANGELOG migration note repeats it. The orchestrator-seat experiment resolved `subagent_type: "developer"` mid-session with no restart, with role identity and the injected protocol section confirmed. "May require" remains factually safe (one success on one host does not prove all harness versions pick up hot), so I do not require a change; my recommendation is a one-line addendum to ADR-014's Consequences and the migration note recording the verified hot pickup ("observed to register without restart on Claude Code <version/date>; restart is a fallback, not an expected step"). Advisory, orchestrator's call.

### Out-of-delta observations (not v3 findings, noted for the register's benefit)

- Pass 2's deny message appends "and fallback is disabled. Either declare the specialist or set `team.fallback.enabled: true`" even when fallback IS enabled but the domained entry simply has no matching specialization (fallback never applies to domained entries by design). Pre-existing wording, untouched by v3, mildly misleading.
- CLAUDE.md still asserts "Default model is opus for every teammate" while this repo runs `defaults.model: fable` — that is F-010 (open, pre-existing in `claude-md-generator`), reconfirmed in passing.

## Two-author seam assessment (special review context)

The seam map (inherited: fs-helpers marker logic, fs-helpers tests, `applyIdentityFrontmatter` + protocol injection, commands-generator relabeling, D-028 entry; redone: gate rewrite + hooks tests; second-session: docs/ADRs/D-029–D-032/F-009 trail) was verified at its joints:

- **Inherited fs-helpers ↔ redone gate:** no interaction defects — the gate uses the JS-comment marker path (line 1 of `.cjs`), untouched by the HTML-marker changes; hash `88b27433` validates.
- **Inherited generator injection ↔ second-session docs:** ADR-014's description text, injection-site rationale (D-029), and exclusion rules match the inherited code exactly — the second session documented what the first session actually built, not what it intended.
- **Discarded test file:** no residue of the dead session's deleted helpers; `test/hooks.test.js` is internally consistent, all helpers defined (`makeProject`, `runHookInCwd`, `writeAssemblyLog`, `assemblyBlockFor`), and the cwd-isolation lesson from the fable retrospective is applied (default `cwd: tmpDir`, per-test fixture dirs).
- **The one real seam casualty** is F-012: the workflow command bodies sat outside both sessions' file lists and were never reconciled with the new gate contract.

## Test quality assessment (test-coverage lens)

Full report at `artifacts/reviews/test-coverage-report.md`. Headline: 415/415 green (independent run); net delta from the inherited 395/424-red tree is ~28 obsolete transcript tests removed, ~19 handshake/marker/native-definition tests added; 46 hook tests total. Assertion quality is high throughout — deny reasons matched by specific regex (including a negative assertion that present keys are NOT listed as missing), F-009 covered in both geometries (>4KB block; >4KB trailing content), a transcript-ignored regression guard, both marker placements round-tripped including CRLF, and the native-definition test parses every generated agent with real js-yaml rather than string-matching. Gaps: the unclosed-fence geometry (F-011) and a write-side guard for the 10-line window (F-014).

## Decision Traceability

- **D-028** (strategic, governing): **Verified** — all three items implemented as specified: item 0 (protocol injected into 8 teammates, never the orchestrator; orchestrator owner-assignment rules added; no self-claim residue), item 1 (native definitions valid per js-yaml probe; ceremony retired with /identity-orchestrator exception; live spawn experiment positive), item 2 (transcript scanning fully deleted; handshake sole Pass-1 channel; F-009 fixed via whole-file last-fence anchor; Pass 2 unchanged and fed by the handshake block). ADR-013/ADR-014 authored as required. Status updated to verified in the decision log.
- **D-029** (tactical, inherited): **Verified & reasonable** — generator-side injection confirmed; genuinely tactical (single edit site, reversible); seam provenance honestly annotated.
- **D-030** (tactical, inherited): **Verified & reasonable** — both placements work; the 29/29 Quinn claim independently reproduced (27 agents+commands probed live + 2 rules files, all old-format, zero false flags).
- **D-031** (tactical, second session): **Verified & reasonable** — deny-vs-fail-open boundary implemented exactly as logged; the 424→415 test-count claim matches my independent run.
- **D-032** (tactical, inherited): **Verified & reasonable** — all 9 identity commands still generated; teammate descriptions carry the inspection-aid label; orchestrator description unchanged in intent.
- **Backward traceability:** no unlogged strategic decisions found. F-011/F-012 are omissions, not silent decisions.
- **New decisions:** D-029–D-032 all carry one-line tactical rationale per convention, including provenance annotations for the inherited items — a practice worth keeping for any future mid-task handoff.

## Findings register updates (applied with this review)

- **F-009** — reconfirm resolved: developer's resolution evidence verified (whole-file last-fence anchor in generated hook; both regression tests present and passing); trail line appended.
- **F-011** (new) — gate accepts previous block when newest append is unclosed; advisory medium.
- **F-012** (new) — workflow command bodies contradict the ADR-013 handshake contract; advisory medium.
- **F-013** (new) — orchestrator registered as a spawnable agent type; advisory low.
- **F-014** (new) — `MARKER_SEARCH_LINES` write-side tripwire; advisory low.
- **F-010** — reconfirmed in passing (no trail change needed; unchanged by v3).

## Story-file note

This epic was run task-graph-only under D-028 (no story file exists in `artifacts/implementation/stories/`); completion status, file list, and dev notes live in Task #1's completion report and this review. No story file update is applicable.

## Follow-up verification — 2026-06-10 (Task #4, F-011/F-012 remediation)

**Result: VERIFIED.** Scoped delta re-review of the Task #3 follow-up only; the original approval stands. (A first verification attempt on 2026-06-10 ran before the work had landed — a host cut mid-task, only the red F-011 tests existed — and was reported FAILED-premature; this section records the re-verification after Task #3 genuinely completed.)

1. **F-011 probe re-run — DENIES.** My original exploit probe (fixed mode, valid `backend-auth` block followed by an unclosed block declaring `payments-api`) now produces a deny with an actionable message: "the newest bmad-assembly block in artifacts/context/team-assembly-log.md is unclosed (missing its closing fence) — close the fence or append…". A second geometry (unclosed block as the only content) also denies with the same message. Implementation verified at `.claude/hooks/teamcreate-gate.cjs:80-87`: `lastEnd` tracks the end of the last complete match and any later `` ```bmad-assembly `` opener denies; the check correctly precedes the no-block deny, and a closed valid last block cannot false-positive (an opener inside a matched block is consumed by the regex).
2. **Regression tests — present and meaningful.** Two new tests in `test/hooks.test.js` (lines 212–240) exercise both geometries and assert the `/unclosed/` deny reason, not just "denied". Hook tests now 48 (was 46).
3. **F-012 — fully remediated, widened scope intact.** Zero stale "emit this assembly block and call TeamCreate" / "emit the assembly block below and spawn" residue in `.claude/commands/`; 12 generated commands now name `team-assembly-log.md` and no TeamCreate-mentioning command omits it. The developer's widened scope (research/audit/migrate/review carried the same stale contract; /plan defers the append until approval; /brainstorm exit handoff; `agents/ideator.md` overlay exit text and `agents/orchestrator.md` brainstorm step 5) is internally consistent with Invariant 1 and ADR-013 — verified by content read, not flagged as scope creep (noted in the F-012 trail). Pinned by new generator content assertions in `test/generators.test.js` (every spawning command must name the log).
4. **ADR-014/CHANGELOG addendum — present.** ADR-014 Consequences carries the dated 2026-06-10 addendum (mid-session registry pickup verified; restart is fallback); the CHANGELOG migration note was rewritten to match.
5. **Register — F-011 and F-012 both `resolved`** with dated 2026-06-10 trail entries accurately describing the fixes, including the honest widened-scope note.
6. **Tests — 418/418 pass, 65 suites** (independent run; +2 F-011 gate tests, +1 F-012 generator assertion over the approved 415). **Zero generated-file drift**: regenerated agents/hooks/commands/rules from this repo's `swarm.yaml` are byte-identical to the committed outputs.

Remaining open advisories from the original review (unchanged, no action required now): F-013 (orchestrator spawnable), F-014 (marker search window tripwire).
