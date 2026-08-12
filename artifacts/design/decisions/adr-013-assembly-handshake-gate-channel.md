# ADR-013: `team-assembly-log.md` handshake as the sole `teamcreate-gate` Pass-1 channel

**D-ID:** D-028 (parent strategic decision)
**Status:** Accepted
**Date:** 2026-06-09
**Context:** v3 coordination epic — replaces the transcript-scanning channels (original Pass 1, GATE-1 raw fallback, HARN-2 Pass 3 fallback) with the file handshake as the only Pass-1 mechanism

## Context

The `teamcreate-gate` PreToolUse hook enforces the "plan before you spawn" invariant: a fenced `bmad-assembly` block must exist before any `TeamCreate` call. Through 2.0.x the gate located that block by scanning the session transcript (`transcript_path` from the hook event): a structured content-block walk over the last 5 assistant message ids, plus the GATE-1 raw-JSON fallback, plus the HARN-2 file fallback added when Fable 5 broke both transcript passes.

The transcript channel failed twice in three months, for the same structural reason:

- **GATE-1 (2.0.2):** some assistant message shapes did not surface the fence through the typed content-block walk; a raw-text scan fallback was bolted on.
- **HARN-2 (2026-06-09):** under Fable 5, thinking blocks persist to the transcript with empty content and long text blocks are not flushed before `PreToolUse` fires — both transcript passes failed closed and `TeamCreate` was permanently blocked. The `artifacts/context/team-assembly-log.md` handshake was added as Pass 3, a third accept path.

The fable-support retrospective (lessons-learned, 2026-06-09) drew the general lesson: *enforcement hooks must not depend on harness internals (transcript shapes, env vars) as their only channel; prefer explicit file-based handshakes in repo-controlled paths.* The Pass-3 handshake had been running live since HARN-2 and was the channel that actually fired under Fable 5; the transcript passes were dead weight plus a maintenance liability tracking harness drift.

A second defect rode along: Pass 3 sliced only the last 4096 bytes of the log and anchored on the last fence *in that tail* (D-026). A block whose opening fence fell outside the window — e.g. a long `rationale` — was silently invisible (**F-009**).

## Decision

`generateTeamCreateGateHook` emits a gate whose Pass 1 is the handshake, and only the handshake:

1. The transcript is never read. `transcript_path` is ignored; all transcript-walking code (typed walk, GATE-1 raw scan, N=5 recency window) is deleted.
2. Pass 1 reads `artifacts/context/team-assembly-log.md` (cwd-relative) and anchors on the **LAST** ```` ```bmad-assembly ```` fence in the **whole file** — no byte window. The log is append-only, so the last fence is the block the orchestrator just wrote for the imminent `TeamCreate`. This resolves F-009: block size and trailing log content no longer matter.
3. Acceptance requires all 5 keys (`entry_point`, `complexity`, `autonomy`, `team`, `rationale`) in the last block AND file mtime < 15 minutes (freshness window unchanged from HARN-2).
4. **Missing, stale, or incomplete handshake = deny**, with an actionable reason that names the file and the corrective action: "append a fenced bmad-assembly block (keys: …) to artifacts/context/team-assembly-log.md, then retry TeamCreate."
5. **Fail-open is reserved for environmental errors**: unparseable stdin JSON, and (in Pass 2, unchanged per D-012) unreadable/malformed `swarm.yaml` or missing `js-yaml`. Previously the gate failed open when the transcript was missing; now a missing handshake is a deny — the orchestrator can always satisfy the gate because the channel is a file it owns.
6. Pass 2 (ADR-008 fixed-mode routing) is unchanged in logic and runs on the handshake-accepted block.

The orchestrator side (agents/orchestrator.md Invariant 1) inverts the previous emphasis: appending the block to the log is the REQUIRED action; emitting it in the visible message remains a SHOULD for human traceability but does not satisfy the gate.

## Why deny (not fail-open) on a missing handshake

The old fail-open posture existed because the transcript was harness-owned: the orchestrator could not guarantee its shape, so blocking on its absence would punish the orchestrator for harness behavior. The handshake file is orchestrator-owned and an allowed write path — there is no environmental excuse for its absence. Failing open on a missing log would reduce the gate to decoration, since the no-handshake state is exactly the state the gate exists to catch. Environmental errors that the orchestrator genuinely cannot fix (corrupt stdin, broken yaml dep) keep the fail-open posture.

## Alternatives considered

- **A. Keep transcript passes + handshake (status quo after HARN-2).** Rejected: two of the three channels are known-broken under the current model tier and exist only as drift-prone fallbacks; three channels with different recency semantics make the gate's accept condition hard to reason about and test.
- **B. Widen the tail window instead of anchoring on the last fence (F-009 fix only).** Rejected: any fixed byte window has the same failure class, just rarer. Whole-file read + last-fence anchor is simpler and the log is small in practice (D-026 already established whole-read).
- **C. Sidecar single-block file (e.g. `.bmad-assembly-pending`) instead of the append-only log.** Rejected: the log doubles as a human-auditable assembly history; a sidecar adds a second file protocol with no gain since last-fence anchoring gives the same "most recent block" semantics.

## Consequences

- The gate's accept condition is now testable without synthesizing transcripts; the obsolete transcript tests are removed and replaced with handshake tests (accept-fresh, deny-missing-file, deny-stale, deny-missing-keys, last-fence-wins, F-009 large-block cases, transcript-ignored regression guard).
- F-009 is resolved (findings-register trail updated).
- Existing projects must run `bmad-swarm update` to regenerate the hook; orchestrators already complying with Invariant 1 (HARN-2 behavior) see no workflow change.
