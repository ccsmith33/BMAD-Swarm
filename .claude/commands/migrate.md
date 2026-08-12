---
description: Migration with architect + developer + reviewer
---
<!-- bmad-generated:1f6791f1 -->

Append this block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then spawn each teammate via the Agent tool (`subagent_type` = role):

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