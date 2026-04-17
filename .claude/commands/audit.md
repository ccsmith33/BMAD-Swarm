<!-- bmad-generated:51e9db56 -->
---
description: Audit with researcher + reviewer + security
---

Emit:

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