<!-- bmad-generated:708ff01b -->
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
    model: fable
  - role: reviewer
    lenses: [code-quality]
    model: fable
rationale: Bug fix — developer implements, reviewer verifies.
```

Spawn both teammates with a curated brief including the bug description and affected files. Relay developer completion + reviewer approval back to the user.