# Artifact Schema: The Unified Record Envelope

One record shape covers five record types (ADR-021 / D-036). It lives at
`artifacts/context/ledger.md` for R/L/C/F records and, for D-records, in
`artifacts/context/decision-log.md` in that file's human-readable prose. This is
the authoritative schema every subsystem writes into — the advisory ledger, the
knowledge lessons, the verification claims, and the replay gate's rejection
findings all use it, so the promotion machinery is built once.

**These files are serialized-write.** Never Edit/Write them directly — the
`ledger-write-guard` PreToolUse hook denies direct edits for every agent. The
only writer is the pinned CLI:

```
node .claude/bmad/bin/record.cjs append --type F --stdin   # JSON on stdin
node .claude/bmad/bin/record.cjs set-status F-042 resolved
```

## The envelope

```yaml
record:
  id: <TYPE>-<n>                # allocated by the CLI, monotonic per type
  type: decision | recommendation | lesson | claim | finding
  status: <per-type vocabulary below>
  fingerprint: <slug>          # REQUIRED for L and F; optional elsewhere
  provenance:
    role: <who>
    project: <name>
    date: <YYYY-MM-DD>
    occurrences: [{project, date, ref, d_ids}]   # for recurrence rollup
  evidence: []                 # evidence-item schema below
  links: {d_ids: [], supersedes: , reopen_trigger: }
body: |
  Abstract statement / rationale / detection heuristic.
```

The heading carries `ID + title` only; `status` lives solely in the YAML (no
dual-write drift). Status transitions edit `status:` in place — git history is
the transition audit log. The parser contract: a record is a fenced block whose
first key is `record:`; prose between records is legal and human-oriented.

## Types and the promotion state machine

| Type | Meaning | Status ladder |
|------|---------|---------------|
| **D** decision | a made decision | proposed → accepted → verified \| superseded |
| **R** recommendation | swarm advisory | open → accepted (graduates to a D) \| rejected (+ `reopen_trigger`) → reopened |
| **L** lesson | a recurring class | observed → recurring → candidate → **promoted (HUMAN GATE)** → retired |
| **C** claim | a load-bearing assertion | not a ladder — claims decay: `checked \| cited \| attested \| assumed \| stale` |
| **F** finding | one instance (L is its class) | open → resolved \| superseded |

- **L → promoted is the human gate.** The CLI refuses it without
  `--human-approved <D-ID>` (the human's ratification record). Promotion names an
  enforcement tier: advisory citation → reviewer lens → structural check →
  generative/scaffold.
- **F rolls up to L.** Two F-records sharing a `fingerprint` auto-propose the
  L-record occurrence append. A new fingerprint always enters at `observed`
  (nothing skips the recurrence test).
- **A rejected R must carry `reopen_trigger`.** Rejections are decisions too.

## Evidence-item schema (one status vocabulary everywhere)

```yaml
- id: E-1
  kind: test-run | command | file-exists | citation | fixture-provenance | human-attested | assumed
  status: checked | cited | attested | assumed
  cmd: "npm test"                # test-run/command
  expect: {exit: 0}              # test-run/command
  paths: [src/a.js]              # file-exists
  ref: "path/file.md:47"         # citation (file form) | url: "https://…"
  fixture: tests/fixtures/x.json # fixture-provenance
  captured_from: "…"             # fixture-provenance — XOR synthetic: true (one REQUIRED)
  claim: "…"                     # assumed / human-attested
  attested_by: "<human name>"    # human-attested
```

`checked` records its commit; changes to an underpinning file flag staleness.
Budget: 3–7 load-bearing claims per artifact.

## File budget

`artifacts/context/` holds exactly five standing files: `project-brain.md`,
`decision-log.md`, `ledger.md`, `task-ledger.md`, `team-assembly-log.md`. Any
sixth must supersede D-036 first. Per-date operational files live in
`artifacts/delivery/`; cross-project records in `~/.bmad/knowledge/`.
