---
description: Start a feature with architect + developer + reviewer
---
<!-- bmad-generated:69845d54 -->

Score complexity (5-15). If 5-7 use small-feature; if ≥8 use full-lifecycle. Append the assembly block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then spawn each teammate via the Agent tool (`subagent_type` = role). Default team for small-feature:

```bmad-assembly
entry_point: small-feature
complexity: 7
autonomy: auto
team:
  - role: architect
    model: fable
  - role: developer
    model: fable
  - role: reviewer
    lenses: [code-quality]
    model: fable
rationale: Small feature — architect designs, developer implements, reviewer verifies.
```