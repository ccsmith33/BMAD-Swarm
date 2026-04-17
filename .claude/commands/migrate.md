<!-- bmad-generated:982185d0 -->
---
description: Migration with architect + developer + reviewer
---

Emit:

```bmad-assembly
entry_point: migrate
complexity: 9
autonomy: guided
team:
  - role: architect
    model: opus
  - role: developer
    model: opus
  - role: reviewer
    lenses: [code-quality, test-coverage]
    model: opus
rationale: Migration — architect plans, developer executes, reviewer validates coverage.
```