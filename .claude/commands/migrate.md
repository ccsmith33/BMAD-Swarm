---
description: Migration with architect + developer + reviewer
---
<!-- bmad-generated:beda16ae -->

Append this block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then call TeamCreate:

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