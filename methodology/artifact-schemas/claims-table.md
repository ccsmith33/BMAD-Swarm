# Artifact Schema: The Claims Table (C-IDs)

D-IDs made *decisions* traceable and the field proved them load-bearing (threaded
through PRDs, architectures, stories, commit messages, supersession chains).
**C-IDs extend the same move to *claims*** — the load-bearing, non-obvious
assertions an artifact rests on. A claim that, if false, would change a decision,
break the build, or invalidate a downstream artifact earns a C-ID. "This API
paginates at 100 items" earns one; "we use TypeScript" does not
(diverge-verification §2).

This is a **cross-cutting convention**, not an artifact type: any artifact
(PRD, architecture, story, research doc) MAY carry a claims table. It is
**optional**, and the lint on it is **advisory** — a file-shape check is gameable
by its own author, so it can never be an honest hard gate (D-039). The
load-bearing verification is the reviewer *attacking* the table (Tier 1) and the
deterministic **claim-decay** check (below).

## Shape (low ceremony)

An inline marker where the claim is made, plus a footer table:

> The EDGAR full-text endpoint returns icon-name strings, not form types [C-012].

```
| C-ID  | Claim                                    | Status   | Backing                              |
|-------|------------------------------------------|----------|-------------------------------------|
| C-012 | EDGAR returns icon-name strings          | checked  | fixture E-3 @ commit ab12ef — src/ingest/edgar.js |
| C-013 | full-text search rate-limits at 10 req/s | cited    | E-4                                 |
| C-014 | prod disk headroom sufficient            | assumed  | E-5 — revisit before deploy         |
```

- **C-ID** — `C-NNN`, unique within the artifact, matching the inline `[C-NNN]`
  marker where the claim is asserted.
- **Claim** — the assertion, stated so it could be refuted.
- **Status** — one of the vocabulary below.
- **Backing** — the evidence. For `checked`, it MUST pin the commit the claim was
  verified at (`commit <sha>`, `@ <sha>`, or `sha <sha>`) and SHOULD name the
  file(s) the claim monitors, so decay can be checked.

## Status vocabulary

The same `checked | cited | attested | assumed` vocabulary the evidence bundle
and the record ledger use (see `replay-evidence-bundle.md`, `record-envelope.md`):

| Status | Meaning |
|--------|---------|
| `checked`  | Backed by a replayable evidence item, at a recorded commit. The only decay-bearing status. |
| `cited`    | Backed by a resolving source (a citation). |
| `attested` | A named human said so. |
| `assumed`  | Explicitly unverified — **allowed, visible, and queryable**. The honest `assumed` is the feature: today those assumptions are invisible until they explode. |

## The budget (load-bearing)

**3–7 C-IDs per artifact.** The budget is itself load-bearing: claim markers on
every sentence turn traceability into noise and train readers to skim past them
(the kill list, §7 item 4). Over-budget and under-budget both warn; neither
blocks.

## Claim decay (the quiet killer feature)

A `checked` claim records the commit it was verified at. The decay pass
(`cli/doctor.js`, backed by `bin/replay-check.cjs`) flags a claim as **stale**
when a file it monitors has changed since that commit:

> C-012 was checked at ab12ef; `src/ingest/edgar.js` has changed since —
> re-verify or downgrade to `assumed`.

It is deterministic and replayable (a `git diff` over a pinned SHA), so it is
honestly a **check**, not enforcement — it flags, it never gates. It converts an
artifact's claims from a snapshot into a monitored surface.

## Reviewer inversion

The reviewer's first pass on an artifact with a claims table is not "read
everything skeptically" — it is **attack the table**: try to refute each C-ID,
and hunt for load-bearing assertions that *should* carry a C-ID but don't. An
unclaimed load-bearing assertion is itself a finding. This focuses expensive
judgment where it pays.

## The lint (advisory — `bmad-swarm validate`)

When a claims table is present, `validate` checks that it is well-formed and
prints any problem as an **advisory warning** (never a failure):

1. **Budget** — 3–7 claims.
2. **Status vocabulary** — every status is one of `checked | cited | attested | assumed`.
3. **Checked pins a commit** — a `checked` claim whose Backing records no commit.
4. **No duplicate C-IDs**, and every inline `[C-NNN]` marker resolves to a table row.

Presence of a claims table is itself advisory — its absence is never a failure.
