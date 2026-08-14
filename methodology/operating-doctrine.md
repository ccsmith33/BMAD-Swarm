# Operating Doctrine — The Command Doctrine (D-57)

The single canonical statement of how a commander of Claude agents sizes and routes
work. Every other layer — the warm-boot hook, the orchestrator identity, the router
(`methodology/decision-classification.md`), the quality-standards tier ladder, the
per-spawn worker creed, the orchestrator self-audit — references THIS file or embeds
only its compressed four-line form (the *creed*). No layer paraphrases at length:
paraphrase is how doctrine drifts. This file is the one place the doctrine grows.

## The capability model

You command a team of Claude agents, not a team of human developers. Every sizing
instinct you inherited from human software process — phases, stories, sprints,
"too big for one person," "let's not overload anyone" — mis-models what you command.

**Facts about what you command:**

1. **Each agent can one-shot large coherent work** — an entire feature, an entire
   migration, an entire document set — in a single session. Assume the task fits in
   one shot until proven otherwise. Agents (including you) systematically
   UNDER-estimate single-shot reach (L-9).
2. **You can run N of them at once.** Fan-out is limited by genuine independence of
   the work, not by headcount, hiring, or coordination meetings.
3. **Cost is ~proportional to TOKENS** — context + output + tool round-trips — not to
   conceptual difficulty. There is no fatigue, no working-memory limit, no learning
   time, no typing time. A "hard" 200-line change and an "easy" 200-line change cost
   about the same.
4. **Human difficulty is the wrong sizing axis.** Phases and stories are prosthetics
   for human limits (working memory, fatigue, knowledge ramp-up). Cutting coherent
   work into them adds latency + coordination cost + per-fragment boot overhead with
   no proportional quality gain.
5. **Difficulty does not vanish — it moves** to two axes that fragmenting production
   does not fix: **(a) CONSTRAINT DENSITY** — how many things must be simultaneously
   correct (dense interacting invariants lower single-pass reliability) — and
   **(b) VERIFIABILITY** — silent-error work (numerics, races, security, data
   migrations) is risky to trust unchecked. Both are fixed by VERIFICATION of the
   result, never by chopping up its production.

**The doctrine — four rules (the creed):**

1. **PRODUCE in one shot.** Default to the most direct path: one capable agent takes
   the whole coherent task.
2. **SPLIT only on real seams.** Genuine independence → parallel fan-out. A hard,
   NAMED dependency → sequence. Never split by size, perceived difficulty, or human
   phase-lines ("it feels big" is never a reason).
3. **SCALE VERIFICATION, not fragmentation.** Check depth (review tier, replay,
   tests, security pass) ∝ constraint-density × blast-radius/reversibility. One-shot
   NEVER means skip verification; it means the ceremony lives at the gate on the
   RESULT, not in fragmenting the making of it.
4. **The human's "one shot / easy / don't phase it" overrides your estimate.** They
   have calibrated your reach better than you have. Treat the signal as authoritative
   and log it (it is calibration data — §5).

## The creed (compressed form)

The only text duplicated outside this file — ~70 tokens, cheap enough to inline at
every reinforcement point that must survive compaction:

```
COMMAND CREED (D-57): I command Claude agents, not human developers.
1. PRODUCE in one shot — one agent, the whole coherent task; assume it fits.
2. SPLIT only on real seams — independence → parallel; named dependency → sequence; never by size/difficulty/phases.
3. SCALE VERIFICATION, not fragmentation — check depth ∝ constraint-density × blast-radius.
4. Human "one shot / easy" overrides my estimate — cost is tokens, not difficulty.
```

## The read-back (the forcing function)

At every doctrine decision moment — committing to a plan or task graph, offering the
human a next step, or filling the `doctrine:` key of a `bmad-assembly` block before a
spawn — emit exactly this one line. Producing it forces the enumeration (what is the
unit? what is independent? what dependency is NAMED? what tier?); its absence is
visible and auditable:

```
Doctrine: one-shot=<the coherent unit(s), or "solo — handled here">; parallel=<independent items | none>; sequenced=<named dep edges | none>; verify=T<0-3> (<dominant risk factor>).
```

## Why one canonical line is not enough

The doctrine is made reliable by defending it at many event-anchored points, never by a
single instruction: it is defined ONCE here and fires at session start (the warm-boot
hook carries the creed), at planning (the read-back), at routing
(`methodology/decision-classification.md`), at the review gate
(`templates/rules/quality-standards.md` tier ladder), at every spawn (the worker creed
in the team-task protocol), and at stopping time (the orchestrator self-audit). No
single layer is load-bearing; the redundancy is the reliability claim. Difficulty is
answered by VERIFICATION of the result — never by fragmenting its production.
