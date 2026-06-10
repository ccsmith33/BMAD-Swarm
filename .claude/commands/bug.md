---
description: Start a bug fix with developer + reviewer
---
<!-- bmad-generated:11586a84 -->

Acknowledge the user's bug report. Then append this assembly block to `artifacts/context/team-assembly-log.md` under a dated heading (the gate reads only that file — ADR-013; also emit it in your message for traceability), then call TeamCreate:

```bmad-assembly
entry_point: bug-fix
complexity: 6
autonomy: auto
team:
  - role: developer
    model: fable
  - role: reviewer
    lenses: [code-quality]
    model: fable
rationale: Bug fix — developer implements, reviewer verifies.
```

Spawn both teammates with a curated brief including the bug description and affected files. Relay developer completion + reviewer approval back to the user.