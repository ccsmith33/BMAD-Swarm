<!-- bmad-generated:905b792e -->
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

## Artifact locations

```
./artifacts/
  exploration/  planning/  design/  implementation/  reviews/  context/
```
