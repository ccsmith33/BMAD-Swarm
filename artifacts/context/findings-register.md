# Findings Register

Persistent register of findings across reviews and audits. Reviewers and security agents should check this register before logging new findings to dedupe; if a finding already exists, append a dated entry to its `decision_trail` rather than inventing a new ID.

Format per finding:

```
## F-NNN — <one-line claim>

- **Date:** YYYY-MM-DD
- **Source:** <agent / review / audit identifier>
- **Status:** open | resolved | superseded
- **Severity:** high | medium | low | advisory
- **Description:** <what is wrong, where>
- **Suggested fix:** <one-line direction; full detail in source report>
- **Decision trail:**
  - YYYY-MM-DD — by <agent> — initial | reconfirm | resolved — <why>
```

---

## F-001 — `defaults.model` is unvalidated against the model enum

- **Date:** 2026-04-29
- **Source:** Reviewer (WT-1 review, `artifacts/reviews/review-WT-1-swarm-yaml-schema.md`)
- **Status:** open
- **Severity:** advisory (low)
- **Description:** `applyDefaults()` in `utils/config.js` accepts any string for `defaults.model` without validating against `VALID_MODELS = ['haiku','sonnet','opus','inherit']`. A typo would silently propagate to all per-specialization fallbacks.
- **Suggested fix:** Add `VALID_MODELS` validation for `defaults.model` next time the validator is touched.
- **Decision trail:**
  - 2026-04-29 — by reviewer — initial — flagged during WT-1 review; out of WT-1 scope.
  - 2026-06-09 — by reviewer — reconfirm — still open after D-023 (fable-support review). D-023 added `fable` to `VALID_MODELS` but `defaults.model` remains unvalidated; the `agents.{name}.model` sibling field has the same gap, logged as F-007. The new "accepts fable in agents.*.model" test passes trivially (field unvalidated), not because fable is specifically accepted.

## F-002 — `team.fallback.role` is not enum-validated

- **Date:** 2026-04-29
- **Source:** Reviewer (WT-1 review, `artifacts/reviews/review-WT-1-swarm-yaml-schema.md`)
- **Status:** open
- **Severity:** advisory (low)
- **Description:** `team.fallback.role` accepts any string; should be enum-validated. ADR-004 §3.3 reserves the field for future expansion, but in v1 only `developer` is meaningful.
- **Suggested fix:** Add validation against the allowed fallback role set next time the validator is touched.
- **Decision trail:**
  - 2026-04-29 — by reviewer — initial — flagged during WT-1 review; out of WT-1 scope.

## F-009 — `teamcreate-gate` Pass 3 silently rejects assembly blocks larger than ~4 KB

- **Date:** 2026-06-09
- **Source:** Reviewer (fable-support review, `artifacts/reviews/review-fable-support-1.md`)
- **Status:** resolved
- **Severity:** advisory (low)
- **Description:** Pass 3 (HARN-2) scans only the last 4096 bytes of `artifacts/context/team-assembly-log.md`. A single block whose opening fence falls outside that window (e.g. a very long `rationale`) fails closed to the generic transcript deny — safe (no false-accept) but a confusing failure mode. Real blocks are ~200–400 bytes.
- **Suggested fix:** If revisited, anchor the slice on the last ```` ```bmad-assembly ```` occurrence instead of a fixed byte count, or raise the tail window. Not worth a change now.
- **Decision trail:**
  - 2026-06-09 — by reviewer — initial — flagged during fable-support review (report F-008; renumbered F-009 on register entry to avoid collision).
  - 2026-06-09 — by developer — resolved — the suggested fix landed as part of ADR-013 (D-028 item 2): the gate now reads the whole log and anchors on the LAST ```` ```bmad-assembly ```` fence in the file; the 4 KB tail window is gone. Covered by two regression tests in `test/hooks.test.js` (block > 4 KB accepted; last block accepted with > 4 KB of trailing log content).
  - 2026-06-09 — by reviewer — reconfirm — resolution verified during v3-coordination review (`artifacts/reviews/review-v3-coordination-1.md`): whole-file last-fence anchor confirmed in the generated hook, both regression tests present and passing in an independent run. A residual edge of the new anchoring (unclosed newest fence re-accepts the previous block) is logged separately as F-011, not a reopen of this finding.

## F-008 — `artifacts/context/team-assembly-log.md` untracked git status

- **Date:** 2026-06-09
- **Source:** Reviewer (fable-support review, `artifacts/reviews/review-fable-support-1.md`)
- **Status:** resolved
- **Severity:** advisory (low)
- **Description:** Reviewer flagged the HARN-2 handshake file as neither tracked nor gitignored, risking a `git add -A` sweep of an ephemeral session artifact.
- **Suggested fix:** n/a — already covered.
- **Decision trail:**
  - 2026-06-09 — by reviewer — initial — flagged during fable-support review (report numbering inconsistent: F-007 in body, F-008 in register section).
  - 2026-06-09 — by orchestrator — resolved — moot on entry: the repo root `.gitignore` already ignores `artifacts/` wholesale (only previously-tracked files under it remain tracked), so the untracked handshake file is ignored by git; verified via `git status --short` returning empty for the path.

## F-007 — `agents.{name}.model` is not enum-validated (F-001 sibling field)

- **Date:** 2026-06-09
- **Source:** Reviewer (fable-support review, `artifacts/reviews/review-fable-support-1.md`)
- **Status:** open
- **Severity:** advisory (low)
- **Description:** `validateConfig({agents:{architect:{model:'gpt-4-nonsense'}}})` returns `[]` — per-agent model overrides are unvalidated against `VALID_MODELS`, the same gap F-001 records for `defaults.model`. The new "accepts fable in agents.*.model" test passes trivially as a result. Impact low: invalid values fall back to the opus pricing baseline in the estimator and Claude Code rejects bad models at spawn time.
- **Suggested fix:** Validate `defaults.model` and `agents.{name}.model` against `VALID_MODELS` next time the validator is touched — closes F-001 and F-007 together and makes the fable acceptance test meaningful.
- **Decision trail:**
  - 2026-06-09 — by reviewer — initial — flagged during fable-support review alongside the F-001 reconfirm.

## F-006 — Cost estimator opus baseline stale ($15/$75), inverting the fable/opus cost relationship

- **Date:** 2026-06-09
- **Source:** Reviewer (fable-support review, `artifacts/reviews/review-fable-support-1.md`)
- **Status:** open
- **Severity:** advisory (medium)
- **Description:** `utils/cost-estimator.js` adds correct fable pricing ($10/$50 per MTok) but keeps the pre-existing opus baseline at $15/$75 (real: $5/$25). The estimator therefore prices fable *below* opus per token, inverting the "fable is 2× opus" cost ordering that motivates D-023's model heuristics. D-025 logged the scoping choice (Task #1 item 2 asked only to add fable pricing).
- **Suggested fix:** One-line constant change to `opus: {input: 5, output: 25}` (ideally adding haiku $1/$5 and sonnet $3/$15 tiers) plus updating the two affected cost-estimator test expectations.
- **Decision trail:**
  - 2026-06-09 — by reviewer — initial — flagged during fable-support review; advisory not blocking because the omission was within the story scope and logged as D-025.

## F-005 — README `scaffold-team` transcript trails live CLI by ~10 comment lines

- **Date:** 2026-04-30
- **Source:** Reviewer (RT-4 review, `artifacts/reviews/review-RT-4-retrofit-docs.md`, M-1)
- **Status:** open
- **Severity:** advisory (medium)
- **Description:** The README §"Wide-team specialization" → "Retrofit tooling for existing projects" no-flag stdout block at lines 309-325 omits two comment artifacts the live `cli/scaffold-team.js:emitTeamBlockForPrint` injects post-RT-2: (a) `# model: opus  # uncomment to override defaults.model` line after every `domain:` line, and (b) a 4-line trailing reviewer-specialization hint block. AC4 anchored the transcript on `architecture-retrofit.md` §2.4 (which the README matches verbatim), and the CLI added these comments during RT-2 Subtask 1.4 — so the architecture-side spec trails the implementation. Copy-paste from the README remains valid YAML; the missing lines are documentation hints, not functional content.
- **Suggested fix:** When the README is next touched (e.g., a release-note pass), update the transcript to include the live CLI's comment output. Could also re-anchor architecture-retrofit.md §2.4 to match the implementation.
- **Decision trail:**
  - 2026-04-30 — by reviewer — initial — flagged during RT-4 review as advisory medium; AC4 satisfied by spec-anchored transcript; non-blocking.

## F-004 — Domain Map heading regex duplicated between `cli/scaffold-team.js` and `utils/domain-map.js`

- **Date:** 2026-04-29
- **Source:** Reviewer (RT-2 review forward-note, `artifacts/reviews/review-RT-2-scaffold-team-cli.md`)
- **Status:** open
- **Severity:** advisory (low)
- **Description:** `cli/scaffold-team.js:99` uses a heading regex that near-duplicates `utils/domain-map.js:7`'s `HEADING_RE`. Both anchor on `^(##|###)\s+Domain Map\s*$/m`. Symmetric in spirit to F-003 (config defaults duplication) but ESM-to-ESM (no CJS bridge problem). Verified byte-identical at review time.
- **Suggested fix:** Export `HEADING_RE` from `utils/domain-map.js` (2-line change: add `export` keyword + import in the CLI). Drift fails loudly at use, so non-blocking; clean forward-fix when either file is next touched.
- **Decision trail:**
  - 2026-04-29 — by reviewer — initial — flagged during RT-2 review as a forward-note (not a blocking finding).

## F-003 — `teamcreate-gate.cjs` duplicates `utils/config.js` fallback default-application without drift-detection

- **Date:** 2026-04-29
- **Source:** Reviewer (WT-5 review, `artifacts/reviews/review-WT-5-teamcreate-gate-extension.md`)
- **Status:** open
- **Severity:** advisory (low)
- **Description:** Hook `.claude/hooks/teamcreate-gate.cjs:163-164` inlines `fallback.enabled !== false` and `fallback.role || 'developer'`, duplicating `utils/config.js:111-113`. The duplication is intentional (ESM/CJS bridge avoidance, documented as D-012), but if either side later changes its default, the hook silently disagrees with the validator. No test currently exercises both sides against the same input.
- **Suggested fix:** Either (a) extract shared defaults into `utils/team-defaults.cjs` requireable from both ESM and CJS, or (b) add a unit test that asserts the hook's inlined defaults equal `utils/config.js:applyDefaults` output for an empty config — option (b) is the smaller change.
- **Decision trail:**
  - 2026-04-29 — by reviewer — initial — flagged by dev-1 in WT-5 implementation notes for reviewer call; agreed it's out of WT-5 scope. ADR-008 is silent on import unification; story does not require it.
  - 2026-08-11 — by reviewer — reconfirm — still open after ADR-013 rewrite; the inlined defaults now sit at `.claude/hooks/teamcreate-gate.cjs:121-122` (generator template `generators/hooks-generator.js:255-256`). No drift-detection test exists (hooks-gates audit, `artifacts/reviews/audit-2026-08-11-hooks-gates.md`).

## F-010 — `claude-md-generator` hardcodes "Default model is opus" invariant text

- **Date:** 2026-06-09
- **Source:** Orchestrator (post-D-027 regeneration verification)
- **Status:** open
- **Severity:** advisory (low)
- **Description:** After `defaults.model: fable` (D-027), regenerated `CLAUDE.md` still reads "Default model is opus for every teammate unless overridden in `swarm.yaml`" — the generator template hardcodes the model name rather than interpolating `config.defaults.model`. Same bug class as the commands-generator hardcoding fixed under D-023.
- **Suggested fix:** Parameterize the invariant line in `generators/claude-md-generator.js` on `defaults.model` (with `DEFAULT_MODEL` fallback); natural to bundle with the F-006 cost-estimator fix.
- **Decision trail:**
  - 2026-06-09 — by orchestrator — initial — found while verifying D-027 regeneration; doc-only inconsistency, no behavioral effect (agent frontmatter and commands regenerate correctly).
  - 2026-06-09 — by reviewer — reconfirm — still open after the v3 coordination change set; the CLAUDE.md invariant line was reworded for the ADR-013 handshake but the hardcoded "opus" remains while this repo runs `defaults.model: fable`.

## F-011 — `teamcreate-gate` accepts the PREVIOUS handshake block when the newest append has an unclosed fence

- **Date:** 2026-06-09
- **Source:** Reviewer (v3-coordination review, `artifacts/reviews/review-v3-coordination-1.md`)
- **Status:** resolved
- **Severity:** advisory (medium)
- **Description:** `FENCE_RE` in `.claude/hooks/teamcreate-gate.cjs` (template in `generators/hooks-generator.js`) only matches closed fences. When the orchestrator's latest append opens ```` ```bmad-assembly ```` but never closes it, the last *complete* match is the previous block; the file mtime is fresh, so Pass 1 accepts the old block and Pass 2 routing validates the OLD roster. Empirically confirmed: in fixed mode, an unclosed block declaring `developer domain=payments-api` (deniable when closed) after a valid `backend-auth` block produced a silent accept. Tempered by design: the gate is a shape check, never inspects the actual tool_input roster, and an unclosed-fence author has done the planning the ceremony forces.
- **Suggested fix:** After the last complete match, search the remainder of the log for a later `` ```bmad-assembly `` opener; if found, deny with "the newest bmad-assembly block is unclosed (missing closing fence)". Add one test: valid block + unclosed newer block → deny.
- **Decision trail:**
  - 2026-06-09 — by reviewer — initial — found probing the ADR-013 last-fence anchoring during the v3-coordination review; existing tests cover incomplete-but-closed last blocks only.
  - 2026-06-10 — by developer — resolved — suggested fix applied in `generators/hooks-generator.js`: after the last complete fence match, any later ```` ```bmad-assembly ```` opener denies with "the newest bmad-assembly block … is unclosed (missing its closing fence)" plus the standard append instruction. Two regression tests in `test/hooks.test.js` (valid block + unclosed newer block → deny; unclosed-only block → deny with the unclosed message). Regenerated via `bmad-swarm update`.

## F-012 — Generated workflow commands still instruct "emit this assembly block and call TeamCreate" (pre-ADR-013 contract)

- **Date:** 2026-06-09
- **Source:** Reviewer (v3-coordination review, `artifacts/reviews/review-v3-coordination-1.md`)
- **Status:** resolved
- **Severity:** advisory (medium)
- **Description:** Seven command bodies (`bug`, `feature`, `plan`, `brainstorm`, `explore-idea`, `retrofit-team`, plus the ideator identity text) generated by `generators/commands-generator.js` describe the retired message-channel contract and never mention the now-REQUIRED append to `artifacts/context/team-assembly-log.md` (ADR-013). An orchestrator following a workflow command literally is denied by the gate; the actionable deny message plus Invariant 1 make this self-healing in one round trip, but the instruction surfaces contradict each other — the drift class ADR-014 alternative D was rejected for.
- **Suggested fix:** Update the builder wording in `generators/commands-generator.js` to "append this assembly block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then call TeamCreate"; regenerate; pin with a generator content assertion.
- **Decision trail:**
  - 2026-06-09 — by reviewer — initial — found during the v3-coordination review; the command bodies sat outside both developer sessions' file lists (two-author seam casualty).
  - 2026-06-10 — by developer — resolved — all spawning command builders in `generators/commands-generator.js` now instruct "append … to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then call TeamCreate" (went beyond the seven named bodies: `research`/`audit`/`migrate`/`review` carried the same stale "Emit:" contract and were fixed in the same pass); `/plan` defers the append until user approval; `agents/ideator.md` overlay exit text and `agents/orchestrator.md` brainstorm step 5 updated to match. Pinned by a generator content assertion in `test/generators.test.js` (every spawning command names the log; the retired phrasing is rejected). Regenerated via `bmad-swarm update`.

## F-013 — Generated `orchestrator.md` carries registration frontmatter, making "orchestrator" natively spawnable

- **Date:** 2026-06-09
- **Source:** Reviewer (v3-coordination review, `artifacts/reviews/review-v3-coordination-1.md`)
- **Status:** open
- **Severity:** advisory (low)
- **Description:** `applyIdentityFrontmatter` in `generators/agent-generator.js` applies to all agents including the orchestrator, whose description reads "Orchestrator teammate … spawned by the orchestrator via the team flow" — self-contradictory, and it registers `subagent_type: "orchestrator"` even though ADR-014 states the main session cannot be a custom agent type. A spawned second orchestrator would carry full TeamCreate ambitions and no teammate task protocol. Impact speculative (defensive description discourages auto-delegation).
- **Suggested fix:** Skip identity frontmatter for the orchestrator (mirroring the task-protocol exclusion) or give it a bespoke description marking it not-spawnable (main-session role, loaded via /identity-orchestrator).
- **Decision trail:**
  - 2026-06-09 — by reviewer — initial — found validating the 9 agent definitions during the v3-coordination review.

## F-014 — `MARKER_SEARCH_LINES = 10` silently degrades modification protection if generated frontmatter grows past ~8 lines

- **Date:** 2026-06-09
- **Source:** Reviewer (v3-coordination review, `artifacts/reviews/review-v3-coordination-1.md`)
- **Status:** open
- **Severity:** advisory (low)
- **Description:** A `bmad-generated` marker pushed beyond line 10 (e.g. a future `tools:` list or multi-line description in agent frontmatter) is invisible to `findHtmlMarker` in `utils/fs-helpers.js`; `isFileManuallyModified` then returns false ("no header = allow overwrite"), so `bmad-swarm update` would silently overwrite user edits. Current frontmatter is 5–6 lines (markers at lines 6–7); detection-side behavior is test-covered, the write side has no guard. Tripwire, not a defect.
- **Suggested fix:** If revisited, warn/assert in `writeGeneratedFile` when the marker insertion point exceeds `MARKER_SEARCH_LINES`, or derive the search limit from the frontmatter fence position.
- **Decision trail:**
  - 2026-06-09 — by reviewer — initial — found reviewing the inherited fs-helpers marker logic during the v3-coordination review.

## F-015 — orchestrator-write-gate blocks the harness memory directory (out-of-repo path)

- **Date:** 2026-06-10
- **Source:** Orchestrator (live use, v3-coordination closeout)
- **Status:** open
- **Severity:** advisory (low)
- **Description:** The orchestrator-write-gate denies Write/Edit to `~/.claude/projects/<project>/memory/` — Claude Code's harness-level persistent memory for the session, which is not a project artifact and lies outside the repo. The orchestrator therefore cannot persist cross-session memory while the gate's deny-by-default treats every non-allowlisted absolute path as project work.
- **Suggested fix:** Allowlist the harness memory path (`~/.claude/projects/*/memory/**`) in the generated orchestrator-write-gate next time hooks are touched; it is session metadata, not delegatable project work.
- **Decision trail:**
  - 2026-06-10 — by orchestrator — initial — hit while saving session memories at epic closeout; declined to bypass the gate via shell as a matter of policy.
  - 2026-08-11 — by reviewer — reconfirm — still open; the allowlist in `.claude/hooks/orchestrator-write-gate.cjs:30-37` has no entry matching `~/.claude/projects/*/memory/**` (hooks-gates audit).

## F-016 — orchestrator-write-gate only matches Edit/Write/MultiEdit; Bash (echo/node/npx/npm) and NotebookEdit bypass it

- **Date:** 2026-08-11
- **Source:** Security (audit, `artifacts/reviews/audit-2026-08-11-security.md`)
- **Status:** open
- **Severity:** high
- **Description:** PreToolUse matcher `"Edit|Write|MultiEdit"` (`.claude/settings.json:81`, `generators/hooks-generator.js:73`) does not cover Bash or NotebookEdit, while `Bash(echo/node/npx/npm/cat:*)` are allow-listed (`settings.json:6-13`). A blocked orchestrator writes code via `echo > file`, `node -e fs.writeFileSync`, heredoc/`tee`, or `npm` lifecycle. Fully bypasses the delegate-everything invariant. Verified.
- **Suggested fix:** Remove interpreter/redirect-capable Bash grants from the orchestrator's allow-list (teammates run in subagents, unaffected), or add a Bash/NotebookEdit matcher inspecting for file writes outside artifacts/.
- **Decision trail:**
  - 2026-08-11 — by security — initial — top finding of the 2026-08-11 self-audit; verified matcher string and allow-list empirically.

## F-017 — Write-gate allow-list uses unanchored substring / suffix regexes (path-traversal + sibling-dir bypass)

- **Date:** 2026-08-11
- **Source:** Security (audit, `artifacts/reviews/audit-2026-08-11-security.md`)
- **Status:** open
- **Severity:** high
- **Description:** `orchestrator-write-gate.cjs:30-38` tests raw file_path with no normalization. `/artifacts[\\/]/` is an unanchored substring: `src/artifacts/x.js`, `notes-artifacts/x.js`, and `/home/u/artifacts/../.claude/settings.json` all ALLOW (verified). Config rules are `$`-suffix only (`evil/project.yaml` writable). `..` never resolved.
- **Suggested fix:** `path.resolve` then prefix-check the resolved path is inside `<root>/artifacts/`; match config files as exact root basenames; reject `..` pre-resolution.
- **Decision trail:**
  - 2026-08-11 — by security — initial — verified bypass cases empirically during self-audit.

## F-018 — Allow-list grants arbitrary code execution (node/npx/npm :*), making the deny-list decorative

- **Date:** 2026-08-11
- **Source:** Security (audit, `artifacts/reviews/audit-2026-08-11-security.md`)
- **Status:** open
- **Severity:** high
- **Description:** `Bash(node:*)`/`Bash(npx:*)`/`Bash(npm:*)` (`settings.json:6-9`, `templates/settings.json.template:5-8`) allow arbitrary local execution, reachable around every deny-list entry (`node -e fs.rmSync(...)`, `npx <pkg>`). `acceptEdits` + this allow-list ≈ unrestricted execution for any in-session agent. Sane only under a trusted-model/non-adversarial-input assumption, which is unstated.
- **Suggested fix:** Narrow wildcards to specific subcommands; drop broad `node`/`npx` grants for the orchestrator; document the trust assumption; consider `defaultMode: default` for untrusted repos.
- **Decision trail:**
  - 2026-08-11 — by security — initial — self-audit; deny-list (F-019) is cosmetic given these grants.

## F-019 — Destructive-pattern deny-list is trivially evadable

- **Date:** 2026-08-11
- **Source:** Security (audit, `artifacts/reviews/audit-2026-08-11-security.md`)
- **Status:** open
- **Severity:** medium
- **Description:** Literal command-prefix denies (`settings.json:29-42`) dodged by flag reorder (`rm -fr /`), indirection (`R=rm;$R -rf /`), alternate binaries (`find / -delete`, `shred`), pipe-to-shell staging / process substitution (`bash <(curl url)`), `pkexec` for sudo. Stops canonical copy-paste only.
- **Suggested fix:** Document as a typo/footgun tripwire, not a control; real restriction requires deny-by-default allow-listing incompatible with an allowed interpreter (see F-018).
- **Decision trail:**
  - 2026-08-11 — by security — initial — self-audit.

## F-020 — Orchestrator may write settings.local.json, the file that can disable its own gate

- **Date:** 2026-08-11
- **Source:** Security (audit, `artifacts/reviews/audit-2026-08-11-security.md`)
- **Status:** open
- **Severity:** medium
- **Description:** `orchestrator-write-gate.cjs:36` allow-lists writes to `.claude/settings.local.json`, which can set `AGENT_ROLE: ''` (gate disable, per the hook's own comment `:11-12`), add `permissions.allow`, or change `defaultMode`. The guarded actor can persist a change that ungates it (takes effect next session start).
- **Suggested fix:** Remove settings.local.json from the orchestrator's writable set, or schema-restrict the delta to exclude AGENT_ROLE/permissions.
- **Decision trail:**
  - 2026-08-11 — by security — initial — self-audit; below F-016/F-018 which grant the capability without this file.

## F-021 — Plugin agents loaded as identity text with no validation (latent injection channel)

- **Date:** 2026-08-11
- **Source:** Security (audit, `artifacts/reviews/audit-2026-08-11-security.md`)
- **Status:** open
- **Severity:** low
- **Description:** `utils/plugins.js:32-34` reads any `plugins/agents/*.md` verbatim as agent instructions; no path-escape check on `config.plugins.agents_dir`, no content validation. Inert today (wired only into `bmad-swarm plugin list`, `cli/plugin.js`), becomes a supply-chain prompt-injection vector once wired into `generateAgents`.
- **Suggested fix:** Before wiring plugins live: reject `..`/absolute in agents_dir, treat plugin content as untrusted (operator opt-in per plugin).
- **Decision trail:**
  - 2026-08-11 — by security — initial — self-audit; flagged pre-emptively per the module's "future support" note.

## F-022 — `teamcreate-gate` freshness guard is one-directional; a future mtime bypasses staleness permanently

- **Date:** 2026-08-11
- **Source:** Reviewer (hooks-gates audit, `artifacts/reviews/audit-2026-08-11-hooks-gates.md`)
- **Status:** open
- **Severity:** medium
- **Description:** `.claude/hooks/teamcreate-gate.cjs:69` uses `Date.now() - st.mtimeMs >= FRESH_MS`, which only fails when the file is in the past. A future mtime yields a negative delta (< FRESH_MS) and is always accepted. Verified: identical stale block at mtime 2020 → DENIED, at mtime 2099 → ACCEPTED. Reachable via clock skew on shared/NFS checkouts, timestamp-preserving copies, or `touch -d future` — after which one ancient assembly block re-authorizes every subsequent TeamCreate. Generator template `generators/hooks-generator.js:203`.
- **Suggested fix:** Bound both directions: `const age = Date.now() - st.mtimeMs; if (age >= FRESH_MS || age < -SKEW_MS) deny(...)` with `SKEW_MS ≈ 60_000`. Add a future-mtime → deny regression test.
- **Decision trail:**
  - 2026-08-11 — by reviewer — initial — empirically verified during the hooks-gates audit; not covered by any existing test in `test/hooks.test.js`.
  - 2026-08-12 — by reviewer — resolved — fixed as part of the Honest Foundation P0 gate re-anchor: `generators/hooks-generator.js` now bounds both directions (`ageMs >= FRESH_MS` stale, `ageMs < -SKEW_MS` future, `SKEW_MS = 2 * 60 * 1000`). Verified via `artifacts/reviews/review-honest-foundation-2026-08-12.md` §1: both boundary directions are exercised with real fixture mtimes in `test/hooks.test.js:378-392` (deny-on-future-beyond-skew and accept-within-skew).

## F-023 — Generated `--github` CI workflow pins `npm install -g` to an unpublished package version

- **Date:** 2026-08-12
- **Source:** Reviewer (Honest Foundation P0 review, `artifacts/reviews/review-honest-foundation-2026-08-12.md`)
- **Status:** open
- **Severity:** medium
- **Description:** `generators/github-actions-generator.js` fixes two of the three sub-issues in the CLI-generators audit's F-018 (`artifacts/reviews/audit-2026-08-11-cli-generators.md`, not registered here due to a numbering collision with this register's own F-016–F-018) — the trigger-path/gitignore mismatch and the doctor-step-needs-.claude/ issue — but implements the third half wrong: it pins `npm install -g ${pkg.name}@${pkg.version}` to this repo's local `package.json` version (`2.0.0`), which is not published to npm (`npm view bmad-swarm versions` → highest is `1.2.0`). Verified via `npm install -g bmad-swarm@2.0.0 --dry-run` → `ETARGET No matching version found`. Every project generated with `bmad-swarm init --github` from the current checkout gets a CI workflow that now triggers correctly but fails on its first step, every time. The original audit finding explicitly named the fix this needed ("Pin the install step to a tarball/`npx github:` ref or the actual published name") — the implementation chose neither.
- **Suggested fix:** Pin to a `github:` ref of the exact commit/tag (works regardless of publish state) instead of the npm registry name+version; or gate workflow generation on the version actually being published; or fall back to floating `@latest` with a documented tradeoff.
- **Decision trail:**
  - 2026-08-12 — by reviewer — initial — empirically reproduced during the Honest Foundation P0 review; the regression test (`test/cli.test.js:203-224`) asserts the generator's output matches its own string construction and cannot detect this class of failure (no network access in the test).

## F-024 — Honest Foundation P0 epic's decision-log entry is a dangling empty heading; no D-IDs logged for the epic's implementation choices

- **Date:** 2026-08-12
- **Source:** Reviewer (Honest Foundation P0 review, `artifacts/reviews/review-honest-foundation-2026-08-12.md`)
- **Status:** open
- **Severity:** advisory (low-medium; process/traceability, not functional)
- **Description:** `artifacts/context/decision-log.md` ends with `## 2026-08-11 — bug-fix/spike (Honest Foundation P0: feasibility spikes)` and no body — every other section in the file has at least a one-line decision/rationale. None of this epic's tactical implementation choices (gate discriminator design, `SKEW_MS` constant, F-016 eject-fix strategy, F-017 non-TTY design, the F-018 CI-pin choice that turned out to need one — see F-023, cost-estimator pricing correction) are backed by a logged D-ID, violating the standing backward-traceability requirement.
- **Suggested fix:** Before or at merge, add tactical D-ID entries (one-liners are sufficient per the repo's own convention) for the epic's implementation choices, replacing the empty heading.
- **Decision trail:**
  - 2026-08-12 — by reviewer — initial — flagged during the Honest Foundation P0 review's decision-traceability check.
