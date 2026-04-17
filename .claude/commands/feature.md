<!-- bmad-generated:28fe85ee -->
---
description: Start a feature with architect + developer + reviewer
---

Score complexity (5-15). If 5-7 use small-feature; if ≥8 use full-lifecycle. Emit the assembly block and call TeamCreate. Default team for small-feature:

```bmad-assembly
entry_point: small-feature
complexity: 7
autonomy: auto
team:
  - role: architect
    model: opus
  - role: developer
    model: opus
  - role: reviewer
    lenses: [code-quality]
    model: opus
rationale: Small feature — architect designs, developer implements, reviewer verifies.
```