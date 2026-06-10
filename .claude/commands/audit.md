---
description: Audit with researcher + reviewer + security
---
<!-- bmad-generated:2ef45b58 -->

Append this block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then call TeamCreate:

```bmad-assembly
entry_point: audit
complexity: 9
autonomy: auto
team:
  - role: researcher
    model: fable
  - role: reviewer
    lenses: [code-quality, security, test-coverage]
    model: fable
  - role: security
    model: fable
rationale: Multi-lens audit — researcher collects evidence, reviewer + security produce findings.
```

After all three agents report, update `artifacts/context/findings-register.md`: add a new entry for each novel finding, or append a `YYYY-MM-DD — by <agent> — reconfirm — <why>` line to the `decision_trail` of any finding already in the register (same claim + location = same ID, do not invent new IDs for carried-forward issues).