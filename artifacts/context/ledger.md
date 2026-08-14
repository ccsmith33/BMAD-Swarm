# Ledger

The unified R/L/C/F record ledger (ADR-021 / D-036). One fenced-YAML `record:`
block per section; the heading carries ID + title, status lives only in the YAML.
Written exclusively through `.claude/bmad/bin/record.cjs` (direct edits are
denied by the ledger-write-guard hook). Status transitions edit `status:` in
place — git history is the transition audit log.

---

## F-001 — `defaults.model` is unvalidated against the model enum

```yaml
record:
  id: F-001
  type: finding
  status: open
  fingerprint: defaults-model-is-unvalidated-against-the-model-enum
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-04-29, occurrences: [{project: bmad-swarm, date: 2026-04-29, ref: "initial (by reviewer)"}, {project: bmad-swarm, date: 2026-06-09, ref: "reconfirm (by reviewer)", d_ids: [D-023]}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-WT-1-swarm-yaml-schema.md}
  links: {d_ids: [D-023]}
body: |
  `applyDefaults()` in `utils/config.js` accepts any string for `defaults.model` without validating against `VALID_MODELS = ['haiku','sonnet','opus','inherit']`. A typo would silently propagate to all per-specialization fallbacks. Suggested fix: Add `VALID_MODELS` validation for `defaults.model` next time the validator is touched. Severity: advisory (low).
```

## F-002 — `team.fallback.role` is not enum-validated

```yaml
record:
  id: F-002
  type: finding
  status: open
  fingerprint: team-fallback-role-is-not-enum-validated
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-04-29, occurrences: [{project: bmad-swarm, date: 2026-04-29, ref: "initial (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-WT-1-swarm-yaml-schema.md}
  links: {d_ids: []}
body: |
  `team.fallback.role` accepts any string; should be enum-validated. ADR-004 §3.3 reserves the field for future expansion, but in v1 only `developer` is meaningful. Suggested fix: Add validation against the allowed fallback role set next time the validator is touched. Severity: advisory (low).
```

## F-003 — `teamcreate-gate.cjs` duplicates `utils/config.js` fallback default-application without drift-detection

```yaml
record:
  id: F-003
  type: finding
  status: open
  fingerprint: teamcreate-gate-cjs-duplicates-utils-config-js-fallback
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-04-29, occurrences: [{project: bmad-swarm, date: 2026-04-29, ref: "initial (by reviewer)"}, {project: bmad-swarm, date: 2026-08-11, ref: "reconfirm (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-WT-5-teamcreate-gate-extension.md}
  links: {d_ids: [D-012]}
body: |
  Hook `.claude/hooks/teamcreate-gate.cjs:163-164` inlines `fallback.enabled !== false` and `fallback.role || 'developer'`, duplicating `utils/config.js:111-113`. The duplication is intentional (ESM/CJS bridge avoidance, documented as D-012), but if either side later changes its default, the hook silently disagrees with the validator. No test currently exercises both sides against the same input. Suggested fix: Either (a) extract shared defaults into `utils/team-defaults.cjs` requireable from both ESM and CJS, or (b) add a unit test that asserts the hook's inlined defaults equal `utils/config.js:applyDefaults` output for an empty config — option (b) is the smaller change. Severity: advisory (low).
```

## F-004 — Domain Map heading regex duplicated between `cli/scaffold-team.js` and `utils/domain-map.js`

```yaml
record:
  id: F-004
  type: finding
  status: open
  fingerprint: domain-map-heading-regex-duplicated-between-cli-scaffold
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-04-29, occurrences: [{project: bmad-swarm, date: 2026-04-29, ref: "initial (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-RT-2-scaffold-team-cli.md}
  links: {d_ids: []}
body: |
  `cli/scaffold-team.js:99` uses a heading regex that near-duplicates `utils/domain-map.js:7`'s `HEADING_RE`. Both anchor on `^(##|###)\s+Domain Map\s*$/m`. Symmetric in spirit to F-003 (config defaults duplication) but ESM-to-ESM (no CJS bridge problem). Verified byte-identical at review time. Suggested fix: Export `HEADING_RE` from `utils/domain-map.js` (2-line change: add `export` keyword + import in the CLI). Drift fails loudly at use, so non-blocking; clean forward-fix when either file is next touched. Severity: advisory (low).
```

## F-005 — README `scaffold-team` transcript trails live CLI by ~10 comment lines

```yaml
record:
  id: F-005
  type: finding
  status: open
  fingerprint: readme-scaffold-team-transcript-trails-live-cli-by
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-04-30, occurrences: [{project: bmad-swarm, date: 2026-04-30, ref: "initial (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-RT-4-retrofit-docs.md}
  links: {d_ids: []}
body: |
  The README §"Wide-team specialization" → "Retrofit tooling for existing projects" no-flag stdout block at lines 309-325 omits two comment artifacts the live `cli/scaffold-team.js:emitTeamBlockForPrint` injects post-RT-2: (a) `# model: opus # uncomment to override defaults.model` line after every `domain:` line, and (b) a 4-line trailing reviewer-specialization hint block. AC4 anchored the transcript on `architecture-retrofit.md` §2.4 (which the README matches verbatim), and the CLI added these comments during RT-2 Subtask 1.4 — so the architecture-side spec trails the implementation. Copy-paste from the README remains valid YAML; the missing lines are documentation hints, not functional content. Suggested fix: When the README is next touched (e.g., a release-note pass), update the transcript to include the live CLI's comment output. Could also re-anchor architecture-retrofit.md §2.4 to match the implementation. Severity: advisory (medium).
```

## F-006 — Cost estimator opus baseline stale ($15/$75), inverting the fable/opus cost relationship

```yaml
record:
  id: F-006
  type: finding
  status: open
  fingerprint: cost-estimator-opus-baseline-stale-15-75-inverting
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-06-09, occurrences: [{project: bmad-swarm, date: 2026-06-09, ref: "initial (by reviewer)", d_ids: [D-025]}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-fable-support-1.md}
  links: {d_ids: [D-023, D-025]}
body: |
  `utils/cost-estimator.js` adds correct fable pricing ($10/$50 per MTok) but keeps the pre-existing opus baseline at $15/$75 (real: $5/$25). The estimator therefore prices fable *below* opus per token, inverting the "fable is 2× opus" cost ordering that motivates D-023's model heuristics. D-025 logged the scoping choice (Task #1 item 2 asked only to add fable pricing). Suggested fix: One-line constant change to `opus: {input: 5, output: 25}` (ideally adding haiku $1/$5 and sonnet $3/$15 tiers) plus updating the two affected cost-estimator test expectations. Severity: advisory (medium).
```

## F-007 — `agents.{name}.model` is not enum-validated (F-001 sibling field)

```yaml
record:
  id: F-007
  type: finding
  status: open
  fingerprint: agents-name-model-is-not-enum-validated-f
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-06-09, occurrences: [{project: bmad-swarm, date: 2026-06-09, ref: "initial (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-fable-support-1.md}
  links: {d_ids: []}
body: |
  `validateConfig({agents:{architect:{model:'gpt-4-nonsense'}}})` returns `[]` — per-agent model overrides are unvalidated against `VALID_MODELS`, the same gap F-001 records for `defaults.model`. The new "accepts fable in agents.*.model" test passes trivially as a result. Impact low: invalid values fall back to the opus pricing baseline in the estimator and Claude Code rejects bad models at spawn time. Suggested fix: Validate `defaults.model` and `agents.{name}.model` against `VALID_MODELS` next time the validator is touched — closes F-001 and F-007 together and makes the fable acceptance test meaningful. Severity: advisory (low).
```

## F-008 — `artifacts/context/team-assembly-log.md` untracked git status

```yaml
record:
  id: F-008
  type: finding
  status: resolved
  fingerprint: artifacts-context-team-assembly-log-md-untracked-git
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-06-09, occurrences: [{project: bmad-swarm, date: 2026-06-09, ref: "initial (by reviewer)"}, {project: bmad-swarm, date: 2026-06-09, ref: "resolved (by orchestrator)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-fable-support-1.md}
  links: {d_ids: []}
body: |
  Reviewer flagged the HARN-2 handshake file as neither tracked nor gitignored, risking a `git add -A` sweep of an ephemeral session artifact. Suggested fix: n/a — already covered. Severity: advisory (low).
```

## F-009 — `teamcreate-gate` Pass 3 silently rejects assembly blocks larger than ~4 KB

```yaml
record:
  id: F-009
  type: finding
  status: resolved
  fingerprint: teamcreate-gate-pass-3-silently-rejects-assembly-blocks
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-06-09, occurrences: [{project: bmad-swarm, date: 2026-06-09, ref: "initial (by reviewer)"}, {project: bmad-swarm, date: 2026-06-09, ref: "resolved (by developer)", d_ids: [D-028]}, {project: bmad-swarm, date: 2026-06-09, ref: "reconfirm (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-fable-support-1.md}
  links: {d_ids: [D-028]}
body: |
  Pass 3 (HARN-2) scans only the last 4096 bytes of `artifacts/context/team-assembly-log.md`. A single block whose opening fence falls outside that window (e.g. a very long `rationale`) fails closed to the generic transcript deny — safe (no false-accept) but a confusing failure mode. Real blocks are ~200–400 bytes. Suggested fix: If revisited, anchor the slice on the last ```` ```bmad-assembly ```` occurrence instead of a fixed byte count, or raise the tail window. Not worth a change now. Severity: advisory (low).
```

## F-010 — `claude-md-generator` hardcodes "Default model is opus" invariant text

```yaml
record:
  id: F-010
  type: finding
  status: open
  fingerprint: claude-md-generator-hardcodes-default-model-is-opus
  provenance: {role: orchestrator, project: bmad-swarm, date: 2026-06-09, occurrences: [{project: bmad-swarm, date: 2026-06-09, ref: "initial (by orchestrator)", d_ids: [D-027]}, {project: bmad-swarm, date: 2026-06-09, ref: "reconfirm (by reviewer)"}]}
  evidence: []
  links: {d_ids: [D-027, D-023]}
body: |
  After `defaults.model: fable` (D-027), regenerated `CLAUDE.md` still reads "Default model is opus for every teammate unless overridden in `swarm.yaml`" — the generator template hardcodes the model name rather than interpolating `config.defaults.model`. Same bug class as the commands-generator hardcoding fixed under D-023. Suggested fix: Parameterize the invariant line in `generators/claude-md-generator.js` on `defaults.model` (with `DEFAULT_MODEL` fallback); natural to bundle with the F-006 cost-estimator fix. Severity: advisory (low).
```

## F-011 — `teamcreate-gate` accepts the PREVIOUS handshake block when the newest append has an unclosed fence

```yaml
record:
  id: F-011
  type: finding
  status: resolved
  fingerprint: teamcreate-gate-accepts-the-previous-handshake-block-when
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-06-09, occurrences: [{project: bmad-swarm, date: 2026-06-09, ref: "initial (by reviewer)"}, {project: bmad-swarm, date: 2026-06-10, ref: "resolved (by developer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-v3-coordination-1.md}
  links: {d_ids: []}
body: |
  `FENCE_RE` in `.claude/hooks/teamcreate-gate.cjs` (template in `generators/hooks-generator.js`) only matches closed fences. When the orchestrator's latest append opens ```` ```bmad-assembly ```` but never closes it, the last *complete* match is the previous block; the file mtime is fresh, so Pass 1 accepts the old block and Pass 2 routing validates the OLD roster. Empirically confirmed: in fixed mode, an unclosed block declaring `developer domain=payments-api` (deniable when closed) after a valid `backend-auth` block produced a silent accept. Tempered by design: the gate is a shape check, never inspects the actual tool_input roster, and an unclosed-fence author has done the planning the ceremony forces. Suggested fix: After the last complete match, search the remainder of the log for a later `` ```bmad-assembly `` opener; if found, deny with "the newest bmad-assembly block is unclosed (missing closing fence)". Add one test: valid block + unclosed newer block → deny. Severity: advisory (medium).
```

## F-012 — Generated workflow commands still instruct "emit this assembly block and call TeamCreate" (pre-ADR-013 contract)

```yaml
record:
  id: F-012
  type: finding
  status: resolved
  fingerprint: generated-workflow-commands-still-instruct-emit-this-assembly
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-06-09, occurrences: [{project: bmad-swarm, date: 2026-06-09, ref: "initial (by reviewer)"}, {project: bmad-swarm, date: 2026-06-10, ref: "resolved (by developer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-v3-coordination-1.md}
  links: {d_ids: []}
body: |
  Seven command bodies (`bug`, `feature`, `plan`, `brainstorm`, `explore-idea`, `retrofit-team`, plus the ideator identity text) generated by `generators/commands-generator.js` describe the retired message-channel contract and never mention the now-REQUIRED append to `artifacts/context/team-assembly-log.md` (ADR-013). An orchestrator following a workflow command literally is denied by the gate; the actionable deny message plus Invariant 1 make this self-healing in one round trip, but the instruction surfaces contradict each other — the drift class ADR-014 alternative D was rejected for. Suggested fix: Update the builder wording in `generators/commands-generator.js` to "append this assembly block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then call TeamCreate"; regenerate; pin with a generator content assertion. Severity: advisory (medium).
```

## F-013 — Generated `orchestrator.md` carries registration frontmatter, making "orchestrator" natively spawnable

```yaml
record:
  id: F-013
  type: finding
  status: open
  fingerprint: generated-orchestrator-md-carries-registration-frontmatter-making-orchestrator
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-06-09, occurrences: [{project: bmad-swarm, date: 2026-06-09, ref: "initial (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-v3-coordination-1.md}
  links: {d_ids: []}
body: |
  `applyIdentityFrontmatter` in `generators/agent-generator.js` applies to all agents including the orchestrator, whose description reads "Orchestrator teammate … spawned by the orchestrator via the team flow" — self-contradictory, and it registers `subagent_type: "orchestrator"` even though ADR-014 states the main session cannot be a custom agent type. A spawned second orchestrator would carry full TeamCreate ambitions and no teammate task protocol. Impact speculative (defensive description discourages auto-delegation). Suggested fix: Skip identity frontmatter for the orchestrator (mirroring the task-protocol exclusion) or give it a bespoke description marking it not-spawnable (main-session role, loaded via /identity-orchestrator). Severity: advisory (low).
```

## F-014 — `MARKER_SEARCH_LINES = 10` silently degrades modification protection if generated frontmatter grows past ~8 lines

```yaml
record:
  id: F-014
  type: finding
  status: open
  fingerprint: marker-search-lines-10-silently-degrades-modification-protection
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-06-09, occurrences: [{project: bmad-swarm, date: 2026-06-09, ref: "initial (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-v3-coordination-1.md}
  links: {d_ids: []}
body: |
  A `bmad-generated` marker pushed beyond line 10 (e.g. a future `tools:` list or multi-line description in agent frontmatter) is invisible to `findHtmlMarker` in `utils/fs-helpers.js`; `isFileManuallyModified` then returns false ("no header = allow overwrite"), so `bmad-swarm update` would silently overwrite user edits. Current frontmatter is 5–6 lines (markers at lines 6–7); detection-side behavior is test-covered, the write side has no guard. Tripwire, not a defect. Suggested fix: If revisited, warn/assert in `writeGeneratedFile` when the marker insertion point exceeds `MARKER_SEARCH_LINES`, or derive the search limit from the frontmatter fence position. Severity: advisory (low).
```

## F-015 — orchestrator-write-gate blocks the harness memory directory (out-of-repo path)

```yaml
record:
  id: F-015
  type: finding
  status: open
  fingerprint: orchestrator-write-gate-blocks-the-harness-memory-directory
  provenance: {role: orchestrator, project: bmad-swarm, date: 2026-06-10, occurrences: [{project: bmad-swarm, date: 2026-06-10, ref: "initial (by orchestrator)"}, {project: bmad-swarm, date: 2026-08-11, ref: "reconfirm (by reviewer)"}]}
  evidence: []
  links: {d_ids: []}
body: |
  The orchestrator-write-gate denies Write/Edit to `~/.claude/projects/<project>/memory/` — Claude Code's harness-level persistent memory for the session, which is not a project artifact and lies outside the repo. The orchestrator therefore cannot persist cross-session memory while the gate's deny-by-default treats every non-allowlisted absolute path as project work. Suggested fix: Allowlist the harness memory path (`~/.claude/projects/*/memory/**`) in the generated orchestrator-write-gate next time hooks are touched; it is session metadata, not delegatable project work. Severity: advisory (low).
```

## F-016 — orchestrator-write-gate only matches Edit/Write/MultiEdit; Bash (echo/node/npx/npm) and NotebookEdit bypass it

```yaml
record:
  id: F-016
  type: finding
  status: open
  fingerprint: orchestrator-write-gate-only-matches-edit-write-multiedit
  provenance: {role: security, project: bmad-swarm, date: 2026-08-11, occurrences: [{project: bmad-swarm, date: 2026-08-11, ref: "initial (by security)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/audit-2026-08-11-security.md}
  links: {d_ids: []}
body: |
  PreToolUse matcher `"Edit|Write|MultiEdit"` (`.claude/settings.json:81`, `generators/hooks-generator.js:73`) does not cover Bash or NotebookEdit, while `Bash(echo/node/npx/npm/cat:*)` are allow-listed (`settings.json:6-13`). A blocked orchestrator writes code via `echo > file`, `node -e fs.writeFileSync`, heredoc/`tee`, or `npm` lifecycle. Fully bypasses the delegate-everything invariant. Verified. Suggested fix: Remove interpreter/redirect-capable Bash grants from the orchestrator's allow-list (teammates run in subagents, unaffected), or add a Bash/NotebookEdit matcher inspecting for file writes outside artifacts/. Severity: high.
```

## F-017 — Write-gate allow-list uses unanchored substring / suffix regexes (path-traversal + sibling-dir bypass)

```yaml
record:
  id: F-017
  type: finding
  status: open
  fingerprint: write-gate-allow-list-uses-unanchored-substring-suffix
  provenance: {role: security, project: bmad-swarm, date: 2026-08-11, occurrences: [{project: bmad-swarm, date: 2026-08-11, ref: "initial (by security)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/audit-2026-08-11-security.md}
  links: {d_ids: []}
body: |
  `orchestrator-write-gate.cjs:30-38` tests raw file_path with no normalization. `/artifacts[\\/]/` is an unanchored substring: `src/artifacts/x.js`, `notes-artifacts/x.js`, and `/home/u/artifacts/../.claude/settings.json` all ALLOW (verified). Config rules are `$`-suffix only (`evil/project.yaml` writable). `..` never resolved. Suggested fix: `path.resolve` then prefix-check the resolved path is inside `<root>/artifacts/`; match config files as exact root basenames; reject `..` pre-resolution. Severity: high.
```

## F-018 — Allow-list grants arbitrary code execution (node/npx/npm :*), making the deny-list decorative

```yaml
record:
  id: F-018
  type: finding
  status: open
  fingerprint: allow-list-grants-arbitrary-code-execution-node-npx
  provenance: {role: security, project: bmad-swarm, date: 2026-08-11, occurrences: [{project: bmad-swarm, date: 2026-08-11, ref: "initial (by security)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/audit-2026-08-11-security.md}
  links: {d_ids: []}
body: |
  `Bash(node:*)`/`Bash(npx:*)`/`Bash(npm:*)` (`settings.json:6-9`, `templates/settings.json.template:5-8`) allow arbitrary local execution, reachable around every deny-list entry (`node -e fs.rmSync(...)`, `npx <pkg>`). `acceptEdits` + this allow-list ≈ unrestricted execution for any in-session agent. Sane only under a trusted-model/non-adversarial-input assumption, which is unstated. Suggested fix: Narrow wildcards to specific subcommands; drop broad `node`/`npx` grants for the orchestrator; document the trust assumption; consider `defaultMode: default` for untrusted repos. Severity: high.
```

## F-019 — Destructive-pattern deny-list is trivially evadable

```yaml
record:
  id: F-019
  type: finding
  status: open
  fingerprint: destructive-pattern-deny-list-is-trivially-evadable
  provenance: {role: security, project: bmad-swarm, date: 2026-08-11, occurrences: [{project: bmad-swarm, date: 2026-08-11, ref: "initial (by security)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/audit-2026-08-11-security.md}
  links: {d_ids: []}
body: |
  Literal command-prefix denies (`settings.json:29-42`) dodged by flag reorder (`rm -fr /`), indirection (`R=rm;$R -rf /`), alternate binaries (`find / -delete`, `shred`), pipe-to-shell staging / process substitution (`bash <(curl url)`), `pkexec` for sudo. Stops canonical copy-paste only. Suggested fix: Document as a typo/footgun tripwire, not a control; real restriction requires deny-by-default allow-listing incompatible with an allowed interpreter (see F-018). Severity: medium.
```

## F-020 — Orchestrator may write settings.local.json, the file that can disable its own gate

```yaml
record:
  id: F-020
  type: finding
  status: open
  fingerprint: orchestrator-may-write-settings-local-json-the-file
  provenance: {role: security, project: bmad-swarm, date: 2026-08-11, occurrences: [{project: bmad-swarm, date: 2026-08-11, ref: "initial (by security)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/audit-2026-08-11-security.md}
  links: {d_ids: []}
body: |
  `orchestrator-write-gate.cjs:36` allow-lists writes to `.claude/settings.local.json`, which can set `AGENT_ROLE: ''` (gate disable, per the hook's own comment `:11-12`), add `permissions.allow`, or change `defaultMode`. The guarded actor can persist a change that ungates it (takes effect next session start). Suggested fix: Remove settings.local.json from the orchestrator's writable set, or schema-restrict the delta to exclude AGENT_ROLE/permissions. Severity: medium.
```

## F-021 — Plugin agents loaded as identity text with no validation (latent injection channel)

```yaml
record:
  id: F-021
  type: finding
  status: open
  fingerprint: plugin-agents-loaded-as-identity-text-with-no
  provenance: {role: security, project: bmad-swarm, date: 2026-08-11, occurrences: [{project: bmad-swarm, date: 2026-08-11, ref: "initial (by security)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/audit-2026-08-11-security.md}
  links: {d_ids: []}
body: |
  `utils/plugins.js:32-34` reads any `plugins/agents/*.md` verbatim as agent instructions; no path-escape check on `config.plugins.agents_dir`, no content validation. Inert today (wired only into `bmad-swarm plugin list`, `cli/plugin.js`), becomes a supply-chain prompt-injection vector once wired into `generateAgents`. Suggested fix: Before wiring plugins live: reject `..`/absolute in agents_dir, treat plugin content as untrusted (operator opt-in per plugin). Severity: low.
```

## F-022 — `teamcreate-gate` freshness guard is one-directional; a future mtime bypasses staleness permanently

```yaml
record:
  id: F-022
  type: finding
  status: open
  fingerprint: teamcreate-gate-freshness-guard-is-one-directional-a
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-08-11, occurrences: [{project: bmad-swarm, date: 2026-08-11, ref: "initial (by reviewer)"}, {project: bmad-swarm, date: 2026-08-12, ref: "resolved (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/audit-2026-08-11-hooks-gates.md}
  links: {d_ids: []}
body: |
  `.claude/hooks/teamcreate-gate.cjs:69` uses `Date.now() - st.mtimeMs >= FRESH_MS`, which only fails when the file is in the past. A future mtime yields a negative delta (< FRESH_MS) and is always accepted. Verified: identical stale block at mtime 2020 → DENIED, at mtime 2099 → ACCEPTED. Reachable via clock skew on shared/NFS checkouts, timestamp-preserving copies, or `touch -d future` — after which one ancient assembly block re-authorizes every subsequent TeamCreate. Generator template `generators/hooks-generator.js:203`. Suggested fix: Bound both directions: `const age = Date.now() - st.mtimeMs; if (age >= FRESH_MS || age < -SKEW_MS) deny(...)` with `SKEW_MS ≈ 60_000`. Add a future-mtime → deny regression test. Severity: medium.
```

## F-023 — Generated `--github` CI workflow pins `npm install -g` to an unpublished package version

```yaml
record:
  id: F-023
  type: finding
  status: open
  fingerprint: generated-github-ci-workflow-pins-npm-install-g
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-08-12, occurrences: [{project: bmad-swarm, date: 2026-08-12, ref: "initial (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-honest-foundation-2026-08-12.md}
  links: {d_ids: []}
body: |
  `generators/github-actions-generator.js` fixes two of the three sub-issues in the CLI-generators audit's F-018 (`artifacts/reviews/audit-2026-08-11-cli-generators.md`, not registered here due to a numbering collision with this register's own F-016–F-018) — the trigger-path/gitignore mismatch and the doctor-step-needs-.claude/ issue — but implements the third half wrong: it pins `npm install -g ${pkg.name}@${pkg.version}` to this repo's local `package.json` version (`2.0.0`), which is not published to npm (`npm view bmad-swarm versions` → highest is `1.2.0`). Verified via `npm install -g bmad-swarm@2.0.0 --dry-run` → `ETARGET No matching version found`. Every project generated with `bmad-swarm init --github` from the current checkout gets a CI workflow that now triggers correctly but fails on its first step, every time. The original audit finding explicitly named the fix this needed ("Pin the install step to a tarball/`npx github:` ref or the actual published name") — the implementation chose neither. Suggested fix: Pin to a `github:` ref of the exact commit/tag (works regardless of publish state) instead of the npm registry name+version; or gate workflow generation on the version actually being published; or fall back to floating `@latest` with a documented tradeoff. Severity: medium.
```

## F-024 — Honest Foundation P0 epic's decision-log entry is a dangling empty heading; no D-IDs logged for the epic's implementation choices

```yaml
record:
  id: F-024
  type: finding
  status: open
  fingerprint: honest-foundation-p0-epic-s-decision-log-entry
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-08-12, occurrences: [{project: bmad-swarm, date: 2026-08-12, ref: "initial (by reviewer)"}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-honest-foundation-2026-08-12.md}
  links: {d_ids: []}
body: |
  `artifacts/context/decision-log.md` ends with `## 2026-08-11 — bug-fix/spike (Honest Foundation P0: feasibility spikes)` and no body — every other section in the file has at least a one-line decision/rationale. None of this epic's tactical implementation choices (gate discriminator design, `SKEW_MS` constant, F-016 eject-fix strategy, F-017 non-TTY design, the F-018 CI-pin choice that turned out to need one — see F-023, cost-estimator pricing correction) are backed by a logged D-ID, violating the standing backward-traceability requirement. Suggested fix: Before or at merge, add tactical D-ID entries (one-liners are sufficient per the repo's own convention) for the epic's implementation choices, replacing the empty heading. Severity: advisory (low-medium; process/traceability, not functional).
```

## L-001 — Synthetic fixtures mask real-data failures

```yaml
record:
  id: L-001
  type: lesson
  status: recurring
  fingerprint: synthetic-fixture-masks-real-data
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-08-12, occurrences: [{project: bmad-swarm, date: 2026-08-12, ref: honest-foundation-review}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-honest-foundation-2026-08-12.md}
  links: {d_ids: [D-044]}
body: |
  A test fixture that is synthetic (hand-authored) rather than captured from a real run can pass while the real-data path fails. Detection: any fixture on an external/real-data path must declare captured_from or synthetic:true; a synthetic fixture standing in for real data is a reviewer red flag (the fixture-provenance lens, L-001).
```

## L-002 — Phantom task-assignment replay across session restarts

```yaml
record:
  id: L-002
  type: lesson
  status: recurring
  fingerprint: race-replay-across-session-restart
  provenance: {role: orchestrator, project: bmad-swarm, date: 2026-04-29, occurrences: [{project: bmad-swarm, date: 2026-04-29, ref: wide-team-epic}, {project: bmad-swarm, date: 2026-04-30, ref: retrofit-epic}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/context/lessons-learned.md}
  links: {d_ids: []}
body: |
  After a mid-epic session restart, developers and reviewers receive phantom task_assignment notifications for already-completed work. Handled gracefully (re-verify disk state, report no rework) but noisy. Detection heuristic: on session restart, reconcile the task queue against disk state before acting on any wake. Motivates the RES-2 reconciliation work.
```

## L-003 — Files deriving from the same upstream spec drift unless one imports the other

```yaml
record:
  id: L-003
  type: lesson
  status: recurring
  fingerprint: spec-derived-files-drift-without-import
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-04-29, occurrences: [{project: bmad-swarm, date: 2026-04-29, ref: F-003-hook-config-duplication}, {project: bmad-swarm, date: 2026-04-30, ref: F-004-regex-duplication}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/context/findings-register.md}
  links: {d_ids: [D-019]}
body: |
  When two files encode the same upstream fact (a default, a regex, a schema) by copy, they drift. The cheap fix is always the same: export-and-import from one source of truth, not duplicate (D-019 is the model citizen; F-003/F-004 are the cautionary instances). Detection: any constant or pattern that appears verbatim in two files is a drift candidate.
```

## L-004 — Reviews of schema/hook-adjacent code surface a cluster of out-of-scope findings

```yaml
record:
  id: L-004
  type: lesson
  status: observed
  fingerprint: out-of-scope-adjacent-findings-cluster
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-04-29, occurrences: [{project: bmad-swarm, date: 2026-04-29, ref: wide-team-epic}]}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/context/lessons-learned.md}
  links: {d_ids: []}
body: |
  Implementing a schema- or hook-adjacent feature reliably makes the reviewer surface "while we're here" validation/coverage gaps in code touched but not owned by the story (F-001/F-002/F-003 shape). Detection: ensure the findings register exists before the first review so these do not fall on the floor; log them advisory, do not scope-creep the story.
```

## F-25 — migration drops first decision-trail entry of every finding

```yaml
record:
  id: F-25
  type: finding
  status: open
  fingerprint: migration-drops-first-decision-trail-entry
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-08-13, occurrences: []}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-se1-2026-08-13.md}
  links: {d_ids: [D-036]}
body: |
  scripts/migrate-context-files.js parseDecisionTrail: the greedy \s* after **Decision trail:** consumed the newline AND the leading indentation of the first trail line, so the inner ^\s+- per-entry regex failed on it. Every finding lost its FIRST decision-trail entry; the 15 single-entry findings migrated with occurrences: []. The committed ledger.md carried the loss. Fixed by consuming only the rest of the Decision-trail line + its newline so the capture retains leading indentation; ledger.md regenerated from the 9c00390 source with exact occurrence counts.
```

## F-26 — write-gate denies legitimate commands with quoted > in arguments

```yaml
record:
  id: F-26
  type: finding
  status: open
  fingerprint: write-gate-quoted-redirect-false-positive
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-08-13, occurrences: []}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-se1-2026-08-13.md}
  links: {d_ids: [D-049]}
body: |
  generators/hooks/orchestrator-write-gate.cjs.src: the Bash redirect detector fires on > inside QUOTED arguments, hard-denying legitimate allow-listed commands (rg "value > 5", git commit -m "a -> b", git log --grep="x>y") — verified empirically. False-positive that blocks real work. Owned by dev-fork-a (write-gate track).
```

## F-27 — append --status bypasses the L-to-promoted human gate

```yaml
record:
  id: F-27
  type: finding
  status: resolved
  fingerprint: append-status-bypasses-human-gate
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-08-13, occurrences: []}
  evidence:
    - {kind: citation, status: cited, ref: artifacts/reviews/review-se1-2026-08-13.md}
  links: {d_ids: [D-036]}
body: |
  bin/record.cjs buildRecord honored flags.status/input.status with no gate: append --type L --status promoted minted a promoted lesson with NO --human-approved, bypassing the ADR-021 constitutional human gate (the set-status seatbelt did not cover the append door). Verified empirically. Fixed: append --type L may only ENTER at observed|recurring; any later stage requires --human-approved <D-ID>.
```

## L-5 — Orchestrator over-serializes independent work and stops early when parallel and continuing are both safe

```yaml
record:
  id: L-5
  type: lesson
  status: recurring
  fingerprint: orchestrator-over-conservative-autonomy
  provenance: {role: orchestrator, project: bmad-swarm, date: 2026-08-13, occurrences: ["Serialized SE-3 and Phase 3 as sequential though they have no data dependency (human asked why not parallel)", "Stopped after SE-2 overnight instead of continuing to the reversible SE-3/Phase-3 work already isolated on the branch"]}
  evidence: []
  links: {d_ids: [D-050]}
body: |
  ROOT: in autonomous mode the orchestrator over-weights a safe/tidy stopping point and reads the roadmaps stated sequence and scope as a ceiling, defaulting to serial execution and early stop even when the work is independent and fully reversible (branch-isolated, unmerged). HOW TO APPLY: (1) Default independent work to PARALLEL; sequencing must be justified by a NAMED dependency (B reads As output, or B needs As decision). If you cannot name the dependency, run in parallel. (2) Park only IRREVERSIBLE actions (merge to main, publish, destructive ops); keep ALL reversible work (branch commits, teammate spawns) moving continuously. (3) Read a stated scope as a FLOOR not a ceiling: when the intent is keep making progress, continue past the named target onto adjacent reversible work. STRUCTURAL FIX (promote, human-gated): invert the task-graph default so tasks are independent unless depends_on is declared, and compile this heuristic into the shipped orchestrator identity at init so every new project starts with it.
```

## F-28 — Test suite not hermetic: 5 tests pass in the live working dir but fail on a fresh checkout/worktree

```yaml
record:
  id: F-28
  type: finding
  status: open
  fingerprint: non-hermetic-test-suite
  provenance: {role: orchestrator, project: bmad-swarm, date: 2026-08-13, occurrences: ["Stream C worktree (fresh checkout of main efd3624): node --test = 676 tests / 5 fail, while the live session working dir on the same commit is 695/695 green"]}
  evidence: []
  links: {d_ids: [D-052]}
body: |
  ROOT: some tests (project-brain path-pointer checks; a gate-routing test) depend on gitignored working-tree artifacts that exist in the live session dir but are ABSENT from a fresh clone/worktree, so they pass locally and would fail in CI or for a fresh user. IMPACT: Phase 3 CI on a clean checkout would be RED; the merged main is only truly green because the live dir is polluted. FIX (integrator/SE-3 scope): make the affected tests hermetic — create their fixtures in a temp dir or skip-if-absent rather than reading gitignored artifacts/context files. Must be resolved before the npm publish sign-off. Surfaced by Stream C fresh-worktree run; not a Stream C regression (identical failure set before/after its changes).
```

## F-29 — Shipped .claude/bmad/bin/record.cjs is stale vs package bin/record.cjs (no reconcile) — warm-boot reconcile fails in scaffolded projects

```yaml
record:
  id: F-29
  type: finding
  status: open
  fingerprint: shipped-scaffold-bin-diverged-from-source
  provenance: {role: orchestrator, project: bmad-swarm, date: 2026-08-13, occurrences: ["dev-verification SE-3 field test: node .claude/bmad/bin/record.cjs reconcile dies unknown-subcommand (33KB scaffold copy); node bin/record.cjs reconcile works (47KB package source)"]}
  evidence: []
  links: {d_ids: [D-052]}
body: |
  ROOT: the shipped scaffold bin (.claude/bmad/bin/record.cjs, generated by bin-generator) is stale relative to the package source (bin/record.cjs) which gained the reconcile subcommand in SE-3. IMPACT: SE-3 warm-boot wires reconcile through the PINNED scaffold bin (node .claude/bmad/bin/record.cjs), so a real project resume would fail to reconcile until regenerated. FIX (pre-publish): confirm bin-generator single-sources the scaffold copy FROM bin/record.cjs (regeneration must produce the reconcile-capable version), and regenerate this repos committed .claude/bmad/bin/. If the two are separately maintained, make .claude/bmad/bin/record.cjs a pure generated artifact of bin/record.cjs. Must be green before the publish sign-off.
```

## F-30 — team-assembly-lint's js-yaml require fails open — Pass 2 routing silently no-ops in every scaffolded project

```yaml
record:
  id: F-30
  type: finding
  status: resolved
  fingerprint: team-assembly-lint-requires-js-yaml-fails-open
  provenance: {role: developer, project: bmad-swarm, date: 2026-08-13, occurrences: [{project: bmad-swarm, date: 2026-08-13, ref: "root-caused by devops-integrate2; fixed + regression-tested by developer on reinvention/phase3-integration"}]}
  evidence: []
  links: {citations: [{kind: citation, status: cited, ref: generators/hooks/team-assembly-lint.cjs.src}, {kind: citation, status: cited, ref: test/hooks.test.js}]}
body: |
  generators/hooks/team-assembly-lint.cjs.src loaded js-yaml via a try/catch that exit-0'd on the resolve failure, then used it to parse swarm.yaml and the bmad-assembly block for Pass 2 (fixed-mode routing). Scaffolded user projects are not npm packages and carry no node_modules, so js-yaml is unresolvable there — the require caught and Pass 2 SILENTLY NO-OPPED in every real project (latent-dead-hook class, same as the removed TeamCreate gate). It also caused 4 non-hermetic test failures (team-assembly-lint AC4/AC5/AC8 + routing-deny) in worktrees without npm ci, because the spawned-hook harness (test/hooks.test.js runHookInCwd) pinned NODE_PATH to the checkout's own node_modules, which worktrees lack. FIX (reinvention/phase3-integration): made the hook self-contained — parseYamlLite parses both shapes with node built-ins only (block maps, block sequences with inline-key map items, flow collections, scalars; throws on structurally broken input to preserve the js-yaml fail-open posture). Regenerated the committed .claude/hooks/team-assembly-lint.cjs (byte-identity guard). Hardened the harness to resolve NODE_PATH to the nearest ANCESTOR node_modules that exists (omitting it when none), so nested-worktree runs resolve up to the main repo. Added regression tests proving both passes enforce with js-yaml unresolvable (NODE_PATH stripped) plus a guard that the generated hook carries no js-yaml require. Verified: 847/847 node --test green on the populated checkout; the 4 formerly-failing tests + 4 new regression tests pass in a nested worktree WITHOUT npm ci.
```

## L-6 — A PreToolUse:Bash hook cannot sandbox arbitrary in-tree code execution

```yaml
record:
  id: L-6
  type: lesson
  status: observed
  fingerprint: pretooluse-bash-hook-cannot-sandbox-in-tree-code
  provenance: {role: developer, project: bmad-swarm, date: 2026-08-13, occurrences: [security-phase5-reverify-2026-08-13.md]}
  evidence: []
  links: {}
body: |
  A PreToolUse:Bash hook cannot sandbox arbitrary in-tree CODE execution. A fail-closed allowlist of BINARIES still admits interpreters/build tools (node <file>, node --test, npm test / npm run <script>, make, pytest, cargo test) that spawn child processes running arbitrary in-tree JS/native code the hook NEVER observes — those processes can fs-write out of tree, open network sockets, forge a marker via a direct fs-write, or execSync('git push') to a live remote. Therefore a hook is a strong GUARDRAIL against DIRECT shelled escapes (interpreters, redirects, obfuscation, out-of-tree writes) but NOT a containment BOUNDARY, and worktree-isolation + never-merge is not genuine containment for a determined agent. A true unattended-night security boundary needs an OS/credential layer: remove the push remote + strip credentials from night worktrees, OS-level filesystem and network egress deny. Do not market a Bash hook as a sandbox. Generalizes the fail-closed-allowlist lesson (a binary allowlist bounds WHICH programs start, not what those programs then do).
```

## L-7 — Orchestrator over-serialization is a PLANNING-time default (and surfaces in how options are offered to the human), not just a task-graph setting

```yaml
record:
  id: L-7
  type: lesson
  status: recurring
  fingerprint: serial-planning-default-recurs-at-decomposition
  provenance: {role: orchestrator, project: bmad-swarm, date: 2026-08-14, occurrences: ["Defaulted to serial planning / offered the human one-thing-at-a-time on independent work items 4x in one session, even after L-5/D-050 made the task graph parallel-by-default", "Presented a single next-step option (\"want me to do X?\") when X, Y, Z had no data dependency and could all run at once"]}
  evidence: []
  links: {d_ids: [D-050, D-55]}
body: |
  ROOT: recurring over-serialization is not merely a task-graph default — it is a PLANNING-time default that reasserts itself at DECOMPOSITION and, critically, in HUMAN-FACING option presentation (offering one option when several are independent). L-5/D-050 fixed the mechanical TaskCreate default (parallel unless Depends-On declared) but that setting does not fire at the moment the orchestrator decomposes a request or offers the human a next step, so the failure kept recurring (observed 4x this session). The lesson (mirrors the D-54 night-nudge lesson: a rule only works if it fires at the RIGHT MOMENT — placement matters). HOW TO APPLY: the fix must fire at DECOMPOSITION and in HUMAN-FACING OFFERS, not only at idle and not only at TaskCreate. (1) Before creating a task graph, committing to a plan, or offering the human a next step, enumerate the work items and ask pairwise "does B require A output (or a decision A produces)?" — if not, run CONCURRENTLY. Default PARALLEL; serialize only on a NAMED Depends-On edge (L-5). (2) If about to offer ONE option when X, Y, Z are independent, offer to fan them out instead. This is the planning-time complement to the D-54 idle self-audit nudge (see [[serial-planning-default-recurs-at-decomposition]] is the planning sibling of the idle nudge). STRUCTURAL FIX (shipped this record, identity-level): decompose-for-parallelism reflex compiled into agents/orchestrator.md Coordination discipline + a >=7 cross-ref in methodology/decision-classification.md (D-55). Recurrence on a distinct future project should promote it.
```

## L-8 — A scope/judgment reflex must live on the agent that HOLDS scope; putting it on context-free workers inverts its intent

```yaml
record:
  id: L-8
  type: lesson
  status: observed
  fingerprint: reflex-belongs-on-scope-holder-not-workers
  provenance: {role: orchestrator, project: bmad-swarm, date: 2026-08-14, occurrences: ["D-54 shipped the night self-audit as a nudge sent to context-free WORKERS; the human caught that this invites scope-creep — the opposite of the anti-premature-stop intent — because a worker holding only its own task cannot judge the human's scope"]}
  evidence: []
  links: {d_ids: [D-54, D-56]}
body: |
  ROOT: an anti-premature-stop / do-more reflex is a JUDGMENT AGAINST SCOPE, and only the scope-holder can make it. The orchestrator holds the human's intent + full scope; a worker is context-free (its assigned task only). Placing the reflex on the worker (D-54: nudge idle workers to reconsider) therefore inverts the intent — it pressures a context-blind agent to invent work, which is scope-creep, exactly what the audit was meant to prevent. This pairs with the placement lesson from [[serial-planning-default-recurs-at-decomposition]] (L-7) and the over-serialization/early-stop root of [[orchestrator-over-conservative-autonomy]] (L-5): a reflex only works if it fires at the right MOMENT and on the right AGENT. HOW TO APPLY: (1) Any judgment that needs the human's scope (do-more, stop-or-continue, is-this-in-scope, fan-out-or-serialize) lives on the ORCHESTRATOR, never a worker. (2) Workers REPORT UP: on completion, state what they did + anything noticed adjacent/out-of-scope, advisory only; they never self-extend. (3) The scope-holder decides whether a noticed item becomes newly-dispatched work. STRUCTURAL FIX (shipped, D-56): stopping-time self-audit relocated to the orchestrator and unified with the planning-time decomposition reflex (D-55) into ONE 'Orchestrator self-audit' discipline; worker protocol gains report-up (no self-extend); §7 + ledger events reworked (self-audit pointer). Recurrence on a distinct future project should promote it.
```
