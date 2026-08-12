---
description: Review an artifact with lens selection
---
<!-- bmad-generated:1b9d96e8 -->

Inspect the artifact the user referenced. Select lenses from the signal table in /identity-orchestrator (api, data, ui, perf, auth, test, docs). Append the assembly block with those lenses to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then spawn the reviewer via the Agent tool (`subagent_type: reviewer`):

```bmad-assembly
entry_point: review
complexity: 6
autonomy: auto
team:
  - role: reviewer
    lenses: [<selected>]
    model: opus
rationale: Lens-based review of <artifact>.
```