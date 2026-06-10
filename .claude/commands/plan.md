---
description: Plan mode: produce assembly block only, do not spawn
---
<!-- bmad-generated:131d2090 -->

Plan mode: assess the request, emit a bmad-assembly block in your message, then STOP and wait for the user to approve. Do NOT call TeamCreate yet and do NOT append to the assembly log yet. After user says "go" or equivalent, append the block to `artifacts/context/team-assembly-log.md` (the gate reads only that file) and execute it.