---
description: Audit with researcher + reviewer + security
---
<!-- bmad-generated:958ae56f -->

Append this block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then spawn each teammate via the Agent tool (`subagent_type` = role):

```bmad-assembly
entry_point: audit
complexity: 9
autonomy: auto
team:
  - role: researcher
    model: opus
  - role: reviewer
    lenses: [code-quality, security, test-coverage]
    model: opus
  - role: security
    model: opus
rationale: Multi-lens audit — researcher collects evidence, reviewer + security produce findings.
```

After all three agents report, update `artifacts/context/findings-register.md`: add a new entry for each novel finding, or append a `YYYY-MM-DD — by <agent> — reconfirm — <why>` line to the `decision_trail` of any finding already in the register (same claim + location = same ID, do not invent new IDs for carried-forward issues).