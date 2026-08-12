---
description: Research-only task with researcher
---
<!-- bmad-generated:1418bf98 -->

Append this block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then spawn each teammate via the Agent tool (`subagent_type` = role):

```bmad-assembly
entry_point: research
complexity: 6
autonomy: auto
team:
  - role: researcher
    model: opus
rationale: Research-only exploration, no build.
```

Spawn researcher with the user's question. Relay findings.