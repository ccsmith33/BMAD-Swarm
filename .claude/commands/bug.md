<!-- bmad-generated:807ff476 -->
---
description: Start a bug fix with developer + reviewer
---

Acknowledge the user's bug report. Then emit this assembly block and call TeamCreate:

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