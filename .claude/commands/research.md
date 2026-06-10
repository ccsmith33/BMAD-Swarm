---
description: Research-only task with researcher
---
<!-- bmad-generated:76e0f21d -->

Append this block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then call TeamCreate:

```bmad-assembly
entry_point: audit
complexity: 6
autonomy: auto
team:
  - role: researcher
    model: fable
rationale: Research-only exploration, no build.
```

Spawn researcher with the user's question. Relay findings.