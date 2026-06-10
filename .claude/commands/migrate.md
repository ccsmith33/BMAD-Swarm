<!-- bmad-generated:40f1f117 -->
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
    model: fable
  - role: developer
    model: fable
  - role: reviewer
    lenses: [code-quality, test-coverage]
    model: fable
rationale: Migration — architect plans, developer executes, reviewer validates coverage.
```