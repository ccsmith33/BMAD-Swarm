# Artifact Schema: The Replay Evidence Bundle

Every task that claims completion under the **replay gate** (ADR-022 / D-049)
ships an evidence bundle: a sidecar YAML file, next to the artifact, that
declares the *replayable* proof of the work. A blocking `TaskCompleted` hook
re-executes the bundle before "done" is accepted — file existence is stat'd,
allow-listed test commands are re-run and their exit codes compared, citations
are resolved. **The bundle is not trusted; it is replayed.** An LLM writing "I
ran the tests" is not evidence — a command the gate can re-run is (verification
§0, the kill list §7 item 1).

## Where it lives, how a task opts in

A task is **gated** when its description carries a `gate: replay` line, and a
gated task MUST also declare the bundle path:

```
gate: replay
evidence: artifacts/implementation/stories/story-014.evidence.yaml
```

The orchestrator adds both lines to implementation-story, bug-fix, and
review-verdict tasks (the field's highest-fabrication classes). A `story-<n>`
task created without the marker is refused at `TaskCreated` (exit 2), so
coverage is deterministic, not protocol-dependent.

## The bundle

```yaml
evidence_bundle:
  artifact: artifacts/implementation/stories/story-014.md
  produced_by: developer          # a role, not a trust anchor — the replay is
  worktree_ref: <branch@sha>      # optional; where the evidence was captured
  items:
    - id: E-1
      kind: test-run              # test-run | command | file-exists | citation |
                                  #   fixture-provenance | human-attested | assumed
      cmd: "npm test"             # test-run/command: MUST prefix-match
      expect: {exit: 0}           #   swarm.yaml replay.allowed_commands, else REFUSED
      cwd: "."                    # optional; confined inside the repo
    - id: E-2
      kind: file-exists
      paths: [src/ingest/edgar.js, tests/fixtures/edgar-8k.json]
    - id: E-3
      kind: fixture-provenance
      fixture: tests/fixtures/edgar-8k.json
      captured_from: "EDGAR live 2026-08-10, filing 0000320193-26-000077"
      # ...OR: synthetic: true    # exactly one of captured_from / synthetic is REQUIRED
    - id: E-4
      kind: citation
      ref: "docs/api.md:47"       # file form: path[:line] must exist / have the line
      # ...OR: url: "https://…"   # url form: advisory in v1 (replay.url_citations)
    - id: E-5
      kind: assumed
      claim: "prod droplet has >=2GB free for the new index"
  reviewer_addendum:              # review-verdict tasks only
    failure_scenarios_attempted:  # presence is ADVISORY (concreteness is Tier-1)
      - "empty filing body → parser raises, does not silently skip (reproduced)"
    refutations_found: []
```

## What the gate checks (Tier-0, deterministic, in this order)

1. **Bundle** exists, parses, and every item names a known `kind` — else blocked
   with the convention spelled out so the agent can self-serve the fix.
2. **file-exists** — every path is stat'd (this alone catches fabricated-path
   claims for zero tokens). Paths that escape the repo or contain `..` are refused.
3. **test-run / command** — the command MUST prefix-match
   `replay.allowed_commands` in `swarm.yaml` or it is **refused, never executed**.
   Allowed commands are tokenized and spawned `shell:false`, with a timeout
   (`replay.timeout_seconds`) and `cwd` confined to the repo; the exit code must
   equal `expect.exit` (default 0).
4. **citation** — file form: the path (and `:line`, if given) resolves. Url form
   is advisory in v1 (`replay.url_citations: advisory | blocking | skip`).
5. **fixture-provenance** — exactly one of `captured_from:` / `synthetic: true`
   is present. (Whether synthetic-on-external-data blocks is the reviewer's
   Tier-1 judgment — this is a presence check.)
6. **reviewer_addendum** — `failure_scenarios_attempted` non-empty. **Advisory
   lint** (presence is gameable; concreteness is the reviewer's job).

The **evidence status** vocabulary — `checked | cited | attested | assumed` — is
the same one the record ledger uses (see `record-envelope.md`): `checked` is
backed by a replayable item, `assumed` is explicitly unverified (allowed and
visible — the honest `assumed` is the feature).

Every Tier-0 rejection appends an `F`-record via
`node .claude/bmad/bin/record.cjs` — the ledger of what the gate refused.

## Running it yourself (the degradation path)

The same engine runs standalone — a reviewer or the orchestrator can pre-check a
bundle before approval, and it is the fallback if the blocking hook ever goes
dark (ADR-022 point 3):

```
node .claude/bmad/bin/replay-check.cjs <path/to/bundle.evidence.yaml>
node .claude/bmad/bin/replay-check.cjs <bundle> --json   # machine-readable verdict
```

Exit 0 = clean replay; exit 1 = a check failed (identical verdict to the gate).
