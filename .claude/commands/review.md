<!-- bmad-generated:34781f6a -->
---
description: Review an artifact with lens selection
---

Inspect the artifact the user referenced. Select lenses from the signal table in /identity-orchestrator (api, data, ui, perf, auth, test, docs). Emit the assembly block with those lenses:

```bmad-assembly
entry_point: audit
complexity: 6
autonomy: auto
team:
  - role: reviewer
    lenses: [<selected>]
    model: opus
rationale: Lens-based review of <artifact>.
```