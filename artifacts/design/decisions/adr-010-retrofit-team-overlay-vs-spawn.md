# ADR-010: `/retrofit-team` is an orchestrator overlay, not an architect spawn

**D-ID:** D-014 (parent strategic decision — adopt retrofit tooling for wide-team adoption)
**Grandparent D-ID:** D-004 (adopt wide-team specialization architecture)
**Status:** Proposed (pending human approval of `architecture-retrofit.md`)
**Date:** 2026-04-29
**Context:** Retrofit tooling design (Tool A — `/retrofit-team` slash command). See `artifacts/design/architecture-retrofit.md` §3.

## Context

`/retrofit-team` is the slash command that proposes a Domain Map for an existing project's `architecture.md` and (after human approval) edits the architecture to insert it. Two architectural shapes are reasonable:

- **Orchestrator overlay** (analogous to `/brainstorm` per D-BRN-1, and `/explore-idea` per D-BRN-4): the orchestrator loads the architect's Domain Map heuristics into its own session and runs the proposal conversation directly.
- **Fresh architect spawn** (analogous to `/feature` and `/migrate`): the orchestrator emits a `bmad-assembly` block, spawns an architect teammate, and the architect produces the Domain Map and edits the file.

Both shapes are valid in the existing precedent. The brief explicitly calls out the choice as one the architect must make and argue.

The decision matters for three reasons: (a) the user experience differs significantly (overlay = native conversation; spawn = relay-mediated); (b) the human-approval invariant on `architecture.md` (CLAUDE.md "Human approval is required for: ... architecture") interacts with both shapes differently; and (c) the precedent set here will guide future similar tools (e.g., a hypothetical `/retrofit-stories` for backfilling story `## Domain:` fields).

## Decision

**`/retrofit-team` is an orchestrator overlay.** The orchestrator loads the architect role identity (specifically the "Domain Map" section of `agents/architect.md`) into its own session, reads `architecture.md`, proposes a Domain Map, and iterates with the user until approval. After approval, the orchestrator emits a single-task `bmad-assembly` block and spawns one architect teammate to perform the actual file edit (a single `Edit` call inserting the approved Domain Map verbatim into `architecture.md`). The architect spawn does no design work — the design happened in the overlay; the spawn is a write delegate.

This is a hybrid: overlay for the design conversation, spawn for the file mutation. It honors both the conversational nature of the work and the orchestrator's "never edit code or artifacts" invariant from CLAUDE.md.

## Alternatives considered

- **A. Pure overlay with orchestrator-write-gate carve-out for architecture.md.** The orchestrator does the proposal conversation AND the file edit. To make this work, the `orchestrator-write-gate.cjs` allow-list would need to be extended to permit `artifacts/design/architecture.md` writes, scoped to `/retrofit-team` invocations.

  Rejected because: (a) the existing allow-list is intentionally minimal (`artifacts/context/`, `artifacts/design/decisions/`, `project.yaml`, plus the HARN-1 carve-out for `.claude/settings.local.json`). Each addition weakens the invariant. (b) Scoping the carve-out to "during /retrofit-team" requires session-state inference inside the hook, which the hook is not equipped for (the hook sees individual tool calls, not session context). The simpler alternative (carve out architecture.md unconditionally) is broader than needed and creates a new write-path the reviewer would have to audit. (c) ADR-003 explicitly chose to keep the gate strict; loosening it for ergonomics regresses that decision.

- **B. Pure architect spawn (the `/feature`-style shape).** The orchestrator emits a `bmad-assembly` block immediately on `/retrofit-team`; the architect teammate reads the architecture, proposes the Domain Map, iterates with the user via SendMessage relay, and edits the file.

  Rejected because: (a) the proposal conversation is iterative and conversational — the user might want to rename a domain, merge two slices, split one slice into two. Each iteration becomes an architect → orchestrator → user → orchestrator → architect relay loop. Latency and friction are high. This is exactly the substrate problem D-BRN-1 identified for `/brainstorm`. (b) The human-approval gate on `architecture.md` requires explicit user ack before the file is edited. With the architect-spawn shape, the ack handshake is two relays (architect asks orchestrator to ask user; orchestrator asks user; user replies to orchestrator; orchestrator relays to architect). The overlay shape collapses this to one direct exchange. (c) Spawn has a fixed cost (one teammate session, identity load, idle time). For a single-section file edit, the cost is disproportionate.

- **C. Pure overlay with no spawn (orchestrator does the file edit even though the gate denies it).** The orchestrator attempts the Edit, the gate denies, the orchestrator surfaces the deny to the user, the user manually edits the file.

  Rejected because: (a) it makes the user do the file edit, which is exactly the friction the tooling exists to remove. (b) The whole point of `/retrofit-team` is automation — pushing back to manual defeats the purpose.

- **D. Hybrid chosen here (overlay for design + spawn for file edit).**

  Selected. Trade-offs analyzed below.

- **E. Pre-spawn architect at `/retrofit-team` invocation, hand control to the architect, then have the architect dump the proposal back to the orchestrator for the user conversation.** A "spawn-but-then-overlay" hybrid.

  Rejected because: it has the latency cost of a spawn AND the relay cost of a multi-iteration conversation through the architect — worst of both worlds. No upside over D.

- **F. Make `/retrofit-team` a CLI command (no Claude Code session at all).** Run `bmad-swarm retrofit-team` in the shell; no agent involvement; deterministic heuristic-only proposal.

  Rejected because: the Domain Map heuristics (orthogonality test, architecturally-significant exception) require judgment over the architecture document's content. Code-side enumeration of components is brittle (markdown headings vary; component sections can be implicit). The architect's reading-and-judgment is the value-add. Making this a CLI command would force a code-based Domain Map proposer, which would then need to explain its choices — at which point we're back at "spawn an LLM to interpret the architecture," which is exactly what the overlay does, but worse-integrated with the user.

## Consequences

**Positive**

- Conversational iteration is native (overlay owns the human channel — no relay).
- Human-approval handshake is one direct exchange in the overlay session.
- The orchestrator-write-gate invariant (ADR-003) is unchanged. No new carve-outs.
- Pattern is consistent with D-BRN-1 (`/brainstorm`) and D-BRN-4 (`/explore-idea`), reinforcing the overlay-pattern as the default for conversational orchestrator process steps.
- The architect-spawn-for-write is a precise, short-lived, single-tool-call interaction — minimal context window, minimal cost.
- The Domain Map heuristics live in one place (`agents/architect.md` "Domain Map" section, added by WT-3). Both the overlay AND the spawn-for-write reference the same source — no duplication.

**Negative**

- The hybrid has two phases (overlay + spawn) where a pure shape would have one. Slightly more moving pieces. Mitigation: the spawn brief is trivial ("insert this text at this position; no other work; report and exit"), so the second phase is mechanical.
- The orchestrator must compose the spawn brief carefully so the architect doesn't try to redesign the Domain Map. The brief explicitly says "do not author; do not write an ADR." This is a prompting concern that is easy to get right but worth flagging to RT-3's developer.
- A failed architect spawn (e.g., the file edit conflicts with concurrent changes) requires the user to re-run `/retrofit-team`. There is no in-overlay retry. Mitigation: this is rare and the user can simply re-invoke; the retrofit is idempotent at the design stage (the proposal can be re-approved without re-discussing).

**Forward-compatibility**

- If we later want a fully-automated retrofit (no human ack), the overlay-then-spawn pattern is easy to extend: skip the approval pause. We're not building this now (CLAUDE.md invariant is law), but the design doesn't preclude it.
- A future `/retrofit-stories` (backfill `## Domain:` on existing stories — out of scope per the brief) would naturally use the same shape: overlay for proposal/iteration, spawn for the multi-file edit phase.
- If overlay sessions ever gain native file-write capabilities (e.g., a future Claude Code feature that lets overlay process steps write specific allow-listed paths), the spawn step collapses cleanly without changing the user-facing flow.

## Verification

1. `/retrofit-team` slash command body (in `commands-generator.js:buildRetrofitTeamBody`, post-RT-3) instructs the orchestrator to (a) load `agents/architect.md`'s Domain Map section, (b) propose iteratively, (c) wait for explicit human approval, (d) emit a `bmad-assembly` block spawning ONE architect teammate, and (e) the spawn brief instructs the architect to perform a single Edit and exit.
2. The architect spawn's brief contains the literal phrase "do not author a fresh Domain Map" and "do not write an ADR" to defend against scope creep.
3. After RT-3 lands, a manual end-to-end test: invoke `/retrofit-team` on a fresh project that has an architecture but no Domain Map; verify the overlay proposal, iteration, approval handshake, and the architect spawn each fire as specified.
4. The `orchestrator-write-gate` allow-list is unchanged before and after RT-3 lands. (Regression guard against the temptation to "just add architecture.md to the allow-list.")
5. The decision-log gets one tactical D-ID entry per `/retrofit-team` completion, per `architecture-retrofit.md` §3.2 step 9.

## Referenced by

- `artifacts/design/architecture-retrofit.md` §3
- `generators/commands-generator.js` (post-RT-3: new `buildRetrofitTeamBody`)
- `agents/orchestrator.md` (post-RT-3: optional cross-reference under "Brainstorming as process step" if we want to enumerate all overlay-pattern commands; not required for v1)
- `agents/architect.md` (post-RT-4: §8.1 retrofit-entry-path note)
- `artifacts/context/decision-log.md` D-014, D-015
