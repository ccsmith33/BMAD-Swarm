---
description: Review an artifact with lens selection
---
<!-- bmad-generated:570d1e6f -->

Inspect the artifact the user referenced. Select lenses from the signal table in /identity-orchestrator (api, data, ui, perf, auth, test, docs). Append the assembly block with those lenses to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then call TeamCreate:

```bmad-assembly
entry_point: audit
complexity: 6
autonomy: auto
team:
  - role: reviewer
    lenses: [<selected>]
    model: fable
rationale: Lens-based review of <artifact>.
```