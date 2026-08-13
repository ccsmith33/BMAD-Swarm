# Artifact Schema: The Project Brain

`artifacts/context/project-brain.md` is the durable comprehension artifact — the
one curated, bounded file that survives compaction and fresh starts (continuity
divergence §1, phase2 design §4.4). It is the HOT tier of a two-tier memory:
this file holds the working set and POINTERS; the COLD stores it points at
(`decision-log.md`, `ledger.md`, `lessons-learned.md`) hold the records. It never
copies a cold-store record — a dead end is one line plus a `D-ID`; the rationale
lives in the decision log.

**Success test:** a fresh Claude that reads this brain must outperform a
several-times-compacted one. When that holds, "start fresh" is a feature, not a
loss.

**Single writer.** The orchestrator is the only writer (the body is prose; it is
exempt from the serialized-CLI write-deny that guards `ledger.md`/`decision-log.md`).
Machine state (`phase`, `gates`) lives in this file's frontmatter — there is no
`project.yaml` (D-037).

## The shape

Frontmatter (machine-read) + a fixed prose body (human-read). The fixed schema
is what lets compaction summarize AS A DELTA against it.

```markdown
---
schema: project-brain/1
updated: 2026-08-13T14:02:00Z   # ISO 8601; bumped on every write
checkpoint: 47                  # monotonic integer; bumped at each checkpoint ritual
phase: implementation           # the machine-state home (subsumes project.yaml)
gates:                          # REQUIRED phase-gate map (D-037). {gate: {status, d_id?, at?}}
  prd: {status: passed, d_id: D-009}          # status ∈ pending | awaiting-human | approved | passed | failed
  architecture: {status: awaiting-human, d_id: D-012, at: 2026-08-13T13:50:00Z}
staleness: {ledger-events-since-checkpoint: 0}
---

## What this is (and why)
<= 5 sentences. Identity: what the project is, who for, what "done" means, the
one-sentence why. The FIRST thing compaction eats; the FIRST thing a fresh
session needs. Human owns this paragraph — the orchestrator proposes diffs.

## Current mental model
<= 8 bullets. How the system works NOW — the shape a maintainer carries in their
head. Not architecture-doc detail (that lives in artifacts/design/); the
compressed working model.

## Load-bearing facts
<= 10 bullets, EACH with an evidence pointer (a file path or a D-/L-/F-/R-/C- id).
The weird-but-true facts a fresh Claude would get WRONG or burn an hour
rediscovering. Unpointered assertions accumulate confident falsehoods — every
fact must be mechanically verifiable.

## Active threads
<= 6 entries: name — state — next action — pointer. WIP at COMPREHENSION level,
not task level (task level is the ledger). Mark each with a trailing @cN (the
checkpoint it was last confirmed at) so touch-or-die eviction can age it.

## Dead ends
<= 6 bullets: approach — why abandoned — D-ID. The highest-value-per-byte
section: it stops a fresh session re-proposing the rejected thing.

## Open questions
<= 5 bullets. Known unknowns that shape near-term work.

## Pointers
Fixed block, never grows: decision-log (+ next D-ID), lessons-learned, ledger,
findings-register, latest phase artifacts. This is the index into the cold tier.
```

## Machine state in the frontmatter (D-037 / ADR-018)

There is no `project.yaml`. The frontmatter IS the machine-state home, with a
guaranteed reader (the warm boot, every session) and event-driven writers (gate
transitions). Two keys are load-bearing and **required** (`validate`/`doctor`
enforce them):

- `phase:` — the current lifecycle phase (scalar).
- `gates:` — a **required** map (empty `{}` until a gate exists) of
  `{gate-name: {status, d_id?, at?}}`. `status` ∈ `pending | awaiting-human |
  approved | passed | failed | skipped` (`skipped` = the gate is deliberately not
  applicable, e.g. a design-led track with no PRD). A gate at `awaiting-human` is what the warm-boot
  reconciler (`record.cjs reconcile`) surfaces FIRST — this map is the single
  home for "the run is paused on a human sign-off."

## The admission rule (surprise-weighted)

For every candidate line ask: **"Would a fresh Claude, reading the repo and the
durable artifacts, infer this on its own?"** If yes — do NOT store it (it is
derivable; a second copy only rots). If no — it is brain material.

- NOT in the brain: code structure, git-recoverable history, anything already in
  the cold stores (pointer only), resolved threads, transcript narrative, task
  status (the ledger's job), full rationale (the D-ID's job).
- IN the brain: the identity paragraph, the current model, the surprises, the WIP
  threads, the dead ends, the open questions.

## Budget + eviction (touch-or-die)

Hard budget **~2,500 tokens** (char/4 proxy). The budget is the design: an
unbounded brain becomes a second transcript. Over budget = the checkpoint write
FAILS and forces an eviction pass. At each checkpoint, an entry that has not been
relevant for several checkpoints gets one of three exits: resolved → delete
(detail is in the cold store); still true but no longer surprising → delete (now
derivable); durable lesson → `record.cjs append --type L`, then delete here.
Identity, mental-model, and pointers are protected — never mechanically cut.

## When it is written (event-driven, never a chore)

Brain writes are side effects of events the orchestrator already handles, plus a
compaction safety net — never a scheduled duty:

- **write-on-surprise:** a review rejection lands (dead end / load-bearing fact
  born); a decision gets a D-ID (thread updated); a hypothesis dies; a phase gate
  passes; the human corrects a misunderstanding.
- **gate-checkpoint ritual:** at each phase-gate transition, do the full eviction
  + staleness pass and bump `checkpoint:`.
- **PreCompact flush (safety net):** the `pre-compact-flush.cjs` hook fires before
  every compaction and steers the summarizer to update the brain, then summarize
  the transcript as a delta against it. Even a neglected brain is current at the
  moment of every compaction.

## Warm boot (rehydration)

Both entry paths (fresh session, post-compaction) converge on the same sequence,
injected by the `session-start-warmboot.cjs` hook:

1. **Identity** — `/identity-orchestrator` (main session cannot be a custom agent).
2. **Comprehension** — read this brain in full. Comprehension BEFORE coordination.
3. **Coordination** — reconcile the task ledger (sibling track), surface
   `awaiting-human` gates from the frontmatter.
4. **Read-back handshake** — before acting, state your understanding in ≤6 lines
   for correction: `identity (1 line) · top active thread + next action · any
   awaiting-human gate · staleness warning if any. Correct me or say go.` This
   converts a silently-wrong model into a sentence the human fixes in 10 seconds.
5. Only then: act.
