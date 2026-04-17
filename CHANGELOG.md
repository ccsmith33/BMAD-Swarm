# Changelog

All notable changes to bmad-swarm.

## [2.0.0] — 2026-04-16

Option C restructure. Major version because this is a breaking change: agent roster, hook pipeline, permission model, and orchestrator identity mechanism all changed. Projects on 1.x must run `bmad-swarm update --force` after upgrading the CLI.

### Breaking changes

- **Agent roster collapsed 13 → 9.** Removed: `qa`, `story-engineer`, `retrospective`, `tech-writer`. Their responsibilities were absorbed: `qa` and `tech-writer` into `reviewer` (via new `test-coverage` and `docs` lenses), `story-engineer` into `strategist` (now owns story decomposition), `retrospective` into the orchestrator as a process step after each epic closes.
- **System-prompt mechanism removed.** `.claude/system-prompt.txt`, `templates/system-prompt.txt.template`, and `generators/system-prompt-generator.js` are deleted. `bmad-swarm start` no longer passes `--append-system-prompt` to Claude Code. Orchestrator identity now loads via the `/identity-orchestrator` slash command (user-turn content — higher model weight than system-ambient instructions).
- **Slash commands added.** Every session now has 17 slash commands under `.claude/commands/`: 9 `identity-<role>` commands (one per enabled agent, body = full agent role file) and 8 workflow commands (`/bug`, `/feature`, `/research`, `/audit`, `/brainstorm`, `/migrate`, `/review`, `/plan`) that emit pre-wired `bmad-assembly` blocks and trigger `TeamCreate`.
- **Hook pipeline replaced.** `.claude/hooks/` now contains 5 files: `TaskCompleted.cjs` (unchanged), `user-prompt-submit.cjs` (rewrite: ~40-token reminder on first turn, no orchestrator.md read), `post-compact-reinject.cjs` (new: one-shot ~200-token pointer to `/identity-orchestrator` after compaction), `teamcreate-gate.cjs` (new: PreToolUse deny when no `bmad-assembly` block present in recent transcript — structural enforcement), `orchestrator-write-gate.cjs` (new: PreToolUse deny on Edit/Write/MultiEdit outside allowed paths when `AGENT_ROLE=orchestrator`). Removed: `TeammateIdle.cjs`, `identity-reinject.cjs`, `task-tool-warning.cjs`.
- **Permission model tightened + defaults flipped.** `.claude/settings.json` now scopes `Bash(*)` to specific subcommands (`Bash(npm:*)`, `Bash(node:*)`, `Bash(git:*)`, etc.), removes `Task` and `TodoRead`/`TodoWrite` from `allow`, adds `TeamCreate`/`Task{Create,Get,List,Update}`/`SendMessage`, and sets `defaultMode: acceptEdits` with an explicit `deny` list for destructive patterns (`rm -rf /`, `sudo`, `git push --force`, `git reset --hard`, `curl|sh`, `chmod 777`, and 8 others). See `artifacts/design/decisions/adr-001-permission-default-mode.md`. `env.AGENT_ROLE=orchestrator` is set so the `orchestrator-write-gate` hook knows when to enforce.
- **Opus by default.** Every agent's generated frontmatter now has `model: opus`. `swarm.yaml` supports `defaults.model: opus` (top-level); `utils/config.js` sets this as fallback when the user omits it. Cost-estimator switched to Opus pricing ($15/$75 per 1M input/output) — expect estimates ~5× higher than 1.x.
- **CLI `bmad-swarm start` simplified.** Removed flags: `--dangerous`, `--allow-tools`. Permission scoping is now handled by `.claude/settings.json` (see above). Existing scripts referencing these flags must be updated.
- **Reviewer lens system.** The reviewer agent now accepts a `lenses` list in its spawn prompt (`code-quality`, `test-coverage`, `performance`, `ux`, `api-design`, `a11y`, `data`, `docs`). Each lens is a review mode that runs alongside the standard adversarial review. The orchestrator selects lenses using a deterministic signal → lens table based on keywords in the story or task description.
- **`bmad-assembly` block required before `TeamCreate`.** A PreToolUse hook (`teamcreate-gate.cjs`) blocks `TeamCreate` when the most recent assistant message in the transcript does not contain a fenced `bmad-assembly` block with required keys (`entry_point`, `complexity`, `autonomy`, `team`, `rationale`). This is structural enforcement of the complexity/team assembly step that was previously prose-only.
- **Rules scope narrowed.** `templates/rules/coding-standards.md` frontmatter path scope now targets `{code_dir}/**/*`, `artifacts/implementation/**/*`, and `artifacts/design/**/*` — dropping the rule from orchestrator/ideator/researcher/strategist turns where it was dead weight.
- **`Task` tool removed from allow-list.** Orchestrator-level enforcement: project delegation must go through `TeamCreate`. Attempts to use `Task` will prompt for permission on each invocation. Only use `Task` for small internal lookups (reading a file, quick grep).

### New

- `artifacts/design/decisions/` ADR directory with ADR-001 (permission default mode).
- `artifacts/context/decision-log.md` with D-001.
- `generators/commands-generator.js` emits the new slash commands from agent templates + hardcoded workflow bodies.
- Regression tests covering the new hook semantics, permission model, and orchestrator-write-gate path allow/deny logic (265/265 total, up from 261/261 on 1.4.0).

### Migration from 1.x

1. Install 2.0.0: `npm install -g bmad-swarm@2.0.0`
2. In each existing bmad-swarm project: `bmad-swarm update --force`. This regenerates `.claude/` and `CLAUDE.md` from the new templates. The `update` command's stale-sweep removes the 4 deleted agent files, 3 deleted hook files, and `.claude/system-prompt.txt`.
3. If your `swarm.yaml` has per-agent overrides for `qa`, `story-engineer`, `tech-writer`, or `retrospective`, move those into `reviewer.extra_context`, `strategist.extra_context`, `reviewer.extra_rules`, or delete them (retrospective is now a process step, not an agent).
4. If your scripts use `bmad-swarm start --dangerous` or `--allow-tools`, remove those flags; scope permissions via `.claude/settings.json` instead.
5. If you have cost expectations based on Sonnet pricing, re-run `node bin/bmad-swarm.js validate` (or check `estimateCost()` output). Opus is ~5× the per-token cost; this is intentional per user request but worth flagging to stakeholders.
6. Confirm the new slash commands appear in your Claude Code menu: start a fresh session with `bmad-swarm start`, type `/` and verify `/identity-orchestrator` and the 8 workflow commands are listed.

### References

- Plan: `artifacts/design/restructure-plan.md`
- Regression diagnosis: `artifacts/reviews/regression-diagnosis.md`
- Orchestrator prompt review: `artifacts/reviews/orchestrator-prompt-review.md`
- ADR-001: `artifacts/design/decisions/adr-001-permission-default-mode.md`

### Known issues (V-3, follow-up patch)

- **Windows CRLF drift-detection bug in `utils/fs-helpers.js:isFileManuallyModified`.** On Windows checkouts the content hash is computed over LF-normalized bytes but the on-disk file has CRLF line endings, so `update` can report generated files as manually modified after a clean regen. Not blocking 2.0.0 (the `--force` flag unblocks the regeneration path). Fix is a one-liner: normalize line endings before hashing (`content.replace(/\r?\n/g, '\n')` in the hash path, or tighten the hash regexes with `\r?\n`).


## [1.4.0] — 2026-04

Prior release. See `git log v1.3.0..v1.4.0` for details.
