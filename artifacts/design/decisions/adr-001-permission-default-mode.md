# ADR-001: Default permission mode is `acceptEdits`; dangerous patterns explicitly denied

**D-ID:** D-001
**Status:** Accepted
**Date:** 2026-04-16
**Context:** Option C restructure, Group 8a (appendix to Task #2)

## Context

During the Option C restructure, the team narrowed the `permissions.allow` list in `.claude/settings.json` (removed `Bash(*)`, added specific scoped entries like `Bash(npm:*)`). The intent was "scoped but quiet" — the orchestrator and teammates should run common commands without a prompt on each invocation.

The original plan (`artifacts/design/restructure-plan.md` §1.7 and §2.3.1) specified the scoped allow-list but did not set a default permission mode. In practice, this left the user seeing a permission prompt on every tool call that was not explicitly allowed, defeating the goal of autonomous execution.

User feedback (mid-execution of Task #2): "too many permission prompts during normal work."

## Decision

Set `permissions.defaultMode: "acceptEdits"` in the generated `.claude/settings.json` (and in `templates/settings.json.template`). This flips Claude Code's default from *prompt-on-each-tool* to *allow-by-default* for tools matched by the `allow` list.

Balance the loosened default with an explicit `permissions.deny` list that blocks genuinely destructive patterns:

- `Bash(rm -rf /*)`, `Bash(rm -rf ~*)`, `Bash(rm -rf $HOME*)` — prevent wholesale filesystem wipes
- `Bash(sudo*)` — prevent privilege escalation
- `Bash(chmod 777*)` — prevent permission opening
- `Bash(git push --force*)`, `Bash(git push -f*)` — prevent shared-history rewrite
- `Bash(git reset --hard*)`, `Bash(git clean -fd*)` — prevent destructive local-state loss
- `Bash(curl*|*sh)`, `Bash(curl*|*bash)`, `Bash(wget*|*sh)`, `Bash(wget*|*bash)` — prevent unaudited-script execution (classic supply-chain pattern)

Document the model in the generated `CLAUDE.md` so the user knows default-allow is intentional and sees the deny-list exists as mitigation.

## Consequences

**Positive:**
- Fewer permission prompts during autonomous execution matches the user's workflow.
- The `allow` list's tight scoping (only npm, node, npx, git, ls, cat, echo, pwd for Bash) limits the attack surface even in acceptEdits mode. Arbitrary `Bash(python ...)`, `Bash(ssh ...)`, `Bash(kubectl ...)`, etc. will still prompt.
- The `deny` list catches the highest-impact destructive patterns unambiguously.
- The `orchestrator-write-gate` hook (Option C structural enforcement, §2.2.2) **continues to fire** under `acceptEdits`. Empirically verified during Group 8a: the hook emits `permissionDecision: 'deny'` on PreToolUse, which overrides the permission mode per the Claude Code hook contract. The delegate-everything rule is not weakened.

**Negative:**
- Larger blast radius if the deny-list is incomplete. The list above is a starting point, not an exhaustive threat model. If a new destructive pattern surfaces (e.g. `rm -rf .`, `docker system prune`, `npm publish --force`), the deny list must be extended.
- Relies on Claude Code's glob-style matching in `deny` — which exact subset of shell expansion Claude Code evaluates before matching is not fully documented in this repo. A user-specific shell alias could in principle slip through. Mitigation: the reviewer's security lens catches this at review time for any code that executes shell commands.
- `acceptEdits` applies project-wide once accepted. A careless `swarm.yaml.agents.<name>.extra_rules` that added a new Bash pattern would activate silently. Mitigation: the allow list in settings.json is canonical; per-agent extras can't widen it.

## Alternatives considered

- `permissions.defaultMode: "bypassPermissions"` — maximally quiet but skips deny-list entirely. Rejected: the point is *scoped+quiet*, not *unlimited+quiet*.
- Leave the default (prompt on each) but expand the `allow` list with more specific patterns — rejected because the enumeration is endless and the user feedback was clear.
- Use a dedicated role-separated settings file for the orchestrator and a broader one for teammates — rejected as over-engineering for Option C's scope; revisit if it becomes a real problem.

## Verification

1. `settings.json` contains `"defaultMode": "acceptEdits"`.
2. `settings.json` `deny` list contains at minimum the 13 patterns above.
3. Dry-run `orchestrator-write-gate.cjs` with `AGENT_ROLE=orchestrator` and a write to `src/foo.js` → still returns `permissionDecision: 'deny'` (verified during Group 8a execution).
4. Regeneration is idempotent (`update --force` twice produces identical output).

## Referenced by

- `templates/settings.json.template`
- `.claude/settings.json` (generated)
- `templates/CLAUDE.md.template` (documents the model)
- `artifacts/context/decision-log.md` D-001
