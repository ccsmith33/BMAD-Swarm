# ADR-017: Generated permission-model posture — the orchestrator loses its interpreter shell

**D-ID:** implements D-039, D-041 (Phase 2); named precondition for /sleep per D-034; disposition per Fork A
**Status:** PROPOSED — AWAITING HUMAN APPROVAL (D-033)
**Date:** 2026-08-11
**Supersedes:** the implicit permissive posture of ADR-001 (allow-list scope) and ADR-003 (which hardened the write-gate's identity check while leaving the shell bypass open). Neither ADR's core decision is reversed: `acceptEdits` default (ADR-001) and the two-layer write-gate (ADR-003) both stand.
**Vision mapping:** ADR-C of `artifacts/planning/reinvention-vision-2026-08-11.md` §8

## Context

The generated allow-list grants the orchestrator an interpreter-capable shell (`Bash(node:*)`, `npx:*`, `npm:*`, `echo:*`, `cat:*`) while the write-gate intercepts only `Edit|Write|MultiEdit`. A blocked orchestrator can write code via `echo >`/`node -e`/heredoc; `npx` is arbitrary remote code; the destructive-pattern deny-list is decorative once an interpreter is allowed (SEC-F-016, SEC-F-018, SEC-F-019). `settings.local.json` being orchestrator-writable is a self-ungate (SEC-F-020). This is also the /sleep honesty condition: D-034's "worst case = delete the branch" is false while the orchestrator holds an interpreter (security F-016/F-018) — the night's one constitutional wall is prose until this lands.

## Decision

Per Fork A recommendation A1 now, A3 as follow-on:

1. **Orchestrator allow-list narrowed** in `templates/settings.json.template` + generators: interpreter/redirect-capable Bash entries removed; the orchestrator keeps read/inspection commands only. It can no longer run `npm test` or ad-hoc node itself — **by design**; delegate-everything says it never should have, and the delegate rule becomes structural instead of prose.
2. **Write-gate widened as defense-in-depth:** the `orchestrator-write-gate` matcher gains `Bash` and `NotebookEdit` (blocking write-shaped shell from the orchestrator identity), per WS-3.
3. **`settings.local.json` removed from the orchestrator-writable allow-list** (closes SEC-F-020; the ADR-003 recovery path becomes human-only).
4. **The deny-list is re-documented as a typo tripwire, not a security control** — consistent with the D-039 enforcement-class rule (PreToolUse denies are the control; pattern denies are lint).
5. **Follow-on (A3):** teammate allow-lists become stack-aware, derived from the detected stack at init (WS-11's scan feeds this), answering the field's escalate-to-`bypassPermissions` pressure without widening the orchestrator.

## Alternatives considered

- **A2 — keep the permissive posture, document the trust assumption loudly.** Rejected: the orchestrator is the actor the entire product promises to constrain; a documented hole is still a hole, and /sleep would stay permanently blocked on honesty grounds.
- **Narrow teammates equally.** Rejected: teammates legitimately need interpreters (tests, builds); the threat model is specifically the coordinator that pledged not to write.
- **Per-edit LLM classification of shell commands.** Rejected in ADR-003 already; deterministic allow-list encodes the classification at zero runtime cost.

## Consequences

- Delegate-everything becomes structurally enforced for the first time; the write-gate + narrowed shell close both known bypass families.
- /sleep's precondition is satisfied — the destructive/non-destructive axis becomes a real fence, unblocking Phase 5 (D-041).
- Behavior change for **every scaffolded project** (hence the human fork): orchestrators in the field lose self-run test ability on their next `bmad-swarm update`. Mitigation: the change ships with WS-11's update path and release notes.
- Slight friction increase for legitimate orchestrator inspection; the read/inspection allow-list is tuned during WS-3 to keep prompts rare.

## Amendment 1 (2026-08-13): project-aware allow-list, coordination-git, live-swap guard — PROPOSED

**Context.** ADR-017 narrowed the orchestrator to a fixed read-inspection shell. Field use immediately surfaced three gaps: (1) each project needs the orchestrator to run *that project's* safe commands without prompting (human directive: "build into each instance the allowance for what that project needs"); (2) the flat `GIT_WRITE_SUBCMDS` deny blocked coordination git (`checkout <branch>` for merges) while under-specifying destructive git; (3) `bmad-swarm update` hot-swapped the live gate under a running session, wedging the 2026-08-13 merge.

**Decision.**
1. **Safe default widened to coordination:** the template allow-list adds coordination git (`commit`, `push`, `fetch`, `merge --ff-only`, `checkout`/`switch`, `branch`, `tag`) and the read-only `bmad-swarm` CLI (`validate`, `doctor`, `status`, `scan`). Division of labor is explicit: the **allow-list stops prompting** for coarse shapes; the **write-gate hook denies precisely** the write/destructive vectors inside them (PreToolUse deny beats any allow entry). The gate's git inspection is upgraded accordingly: deny write-vector git (`apply`, `restore`, `am`, `stash`, `mv`, `rm`, `checkout`/`switch` with pathspec) and destructive git (`reset --hard/--merge/--keep`, `clean`, `push --force`-family, non-ff `merge`, `pull` without `--ff-only`, `rebase`, `filter-branch`, `update-ref`, `-c alias.*`, `--exec-path`), with global option-with-argument flags (`-C`, `-c`, `--git-dir`, `--work-tree`) consumed before subcommand resolution.
2. **Project-aware extension:** `swarm.yaml` gains `permissions.orchestrator_allow: [ "Bash(<cmd>:*)", … ]`, merged by the settings generator on top of the safe default. Teammate permissions are unaffected.
3. **Constrained merge (the invariant):** every project entry must pass the entry validator (`utils/orchestrator-allow.js`), which structurally refuses anything that could reopen the ADR-017 bypass: Bash-only shape, no shell metacharacters (no chaining/substitution/redirection), leading-binary deny-set (interpreters incl. `node`/`npx`/`bun`/`deno`, shells, write utils `tee`/`dd`/`cp`/`mv`/`sed`/`patch`, editors, `curl`/`wget`, destructive binaries), no wrapper binaries (`env`/`xargs`/`find`/`sudo`…), git entries subcommand-qualified to the coordination set (bare `Bash(git:*)` refused), no `--force`/`--hard` literals, pinned-script exception only for `node .claude/bmad/bin/*.cjs`. **Invalid entries fail config load loudly** — never silently dropped. The validator's sets and the gate's sets are pinned to each other by a source-parsing consistency test, so they cannot drift apart.
4. **Defense in depth:** a validator escape still does not grant writes — the write-gate independently inspects every orchestrator Bash call at runtime, and the file-tool writable set is unchanged. Both independent layers must fail for the bypass to reopen.
5. **Live-swap guard:** `bmad-swarm update` skips regenerating `.claude/hooks/` and `settings.json` while `.claude/hooks/.session-active` exists, with a warning; the new `--swap-live-hooks` flag overrides explicitly (`--force` does not). Hot-swapping live enforcement is now opt-in, never a side effect.

**Alternatives considered.** *Silently drop invalid entries*: rejected — hides broken config from the author. *Validate at settings-generation only*: rejected — every `loadSwarmConfig` caller must surface the error, or `validate`/`doctor` would bless a config `update` refuses. *Share one literal set module between validator and gate*: impossible while hooks stay standalone CJS; the consistency test is the honest substitute. *Allow non-Bash tool grants in `orchestrator_allow`*: deferred to A3 (stack-aware teammate lists) — v1 keeps the surface minimal.

**Consequences.** Projects tune orchestrator friction in `swarm.yaml` without touching enforcement; the ADR-017 security posture is preserved by construction rather than by review; scaffolded projects get coordination git on next `update` (release note); the gate gains the first git inspection that distinguishes branch-switching from tree-rewriting; live sessions can no longer be wedged by an update.
