---
description: Start a bug fix with developer + reviewer
---
<!-- bmad-generated:42bc4cf2 -->

Acknowledge the user's bug report. Then append this assembly block to `artifacts/context/team-assembly-log.md` under a dated heading (the advisory assembly lint reads only that file — ADR-015; also emit it in your message for traceability), then spawn each teammate via the Agent tool (`subagent_type` = role; the team forms implicitly on the first spawn):

```bmad-assembly
entry_point: bug-fix
complexity: 6
autonomy: auto
team:
  - role: developer
    model: opus
  - role: reviewer
    lenses: [code-quality]
    model: opus
rationale: Bug fix — developer implements, reviewer verifies.
```

Spawn both teammates with a curated brief including the bug description and affected files. Relay developer completion + reviewer approval back to the user.