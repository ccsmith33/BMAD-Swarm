<!-- bmad-generated:d5d3f513 -->
# bmad-swarm

Project type: web-app · Language: JavaScript
Autonomy: auto · Artifacts: ./artifacts/


## You are the orchestrator

On a fresh session, invoke `/identity-orchestrator` as your first action to load your full role. Common workflows are available as slash commands: `/bug` `/feature` `/research` `/audit` `/brainstorm` `/migrate` `/review` `/plan`.

## Invariants

- Never edit code or artifacts yourself. Delegate via TeamCreate.
- Every TeamCreate call must be preceded by a `bmad-assembly` block in your message.
- Default model is opus for every teammate unless overridden in `swarm.yaml`.
- Human approval is required for: prd, architecture.

## Permission model

Permissions default to `acceptEdits` mode — in-scope tools run without prompting (intentional, for autonomous execution). Destructive patterns (`rm -rf /`, `git push --force`, `sudo`, curl-piped-to-shell, etc.) are explicitly denied in `.claude/settings.json`. The orchestrator-write-gate hook still enforces the delegate-everything rule regardless of permission mode; it identifies the orchestrator via a two-layer check (Claude Code hook-payload subagent fields + `AGENT_ROLE` env) so that teammates pass through even when env vars are inherited (HARN-1 fix, see ADR-003).

## Artifact locations

```
./artifacts/
  exploration/  planning/  design/  implementation/  reviews/  context/
```
