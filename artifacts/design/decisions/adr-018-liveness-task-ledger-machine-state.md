# ADR-018: Liveness protocol and the machine-state home — task ledger, reconciliation, wake-ack; project.yaml deleted

**D-ID:** implements D-037; complements D-028 (never reverts single-wake-channel); implements D-041 (Phase 2, field-tested before release)
**Status:** PROPOSED — AWAITING HUMAN APPROVAL (D-033)
**Date:** 2026-08-11
**Supersedes:** WS-2 item 5 of `artifacts/design/audit-2026-08-11-upgrade-design.md` ("make `project.yaml` real via a `gates:` map") — project.yaml is deleted instead. WS-2's other items are adopted as designed.
**Vision mapping:** ADR-D of `artifacts/planning/reinvention-vision-2026-08-11.md` §8

## Context

The v3 protocol has no liveness layer: teammate death, a lost wake message, or compaction each end in a silent permanent stall, and in two of three cases the recovery action is explicitly forbidden by the anti-spam rules (RES-1..RES-10). All coordination state lives only in the orchestrator's context window. `project.yaml` lies (`not-started`) in 8 of 9 real field projects — the chore-file pattern: no guaranteed reader, no event-driven writer. Field evidence (Vantage D-042): mailbox teammates idled through three nudges while run-to-completion spawns delivered.

## Decision

1. **Durable task ledger** — `artifacts/context/task-ledger.md`, one appended line per lifecycle event (created / assigned / woken / in_progress / blocked / completed / respawned, with timestamps). Machine events only, append-only, no prose (D-036 file #4). Crash-only design: any fresh session can reconstruct coordination state from TaskList ⋈ ledger.
2. **Reconciliation step** on fresh session and post-compaction (home: `initialPrompt` under ADR-016/Fork D1, else the identity ceremony): diff TaskList against the ledger; re-wake unblocked `pending` tasks with no `woken` entry; surface stuck `in_progress` tasks and any `awaiting-human` gate. Reconciliation reads **brain frontmatter** for phase/gates state (point 5).
3. **Liveness carve-out** — the sole exception to the no-status-check rule: event-driven reconciliation on every completion message; for an unresponsive owner, one liveness ping, then respawn. Resolves the RES-1/RES-10 tension without reverting D-028.
4. **Wake-ack** — teammates mark `in_progress` immediately on wake, making `pending` = not-yet-woken authoritative. **Session binding** — a `session:` key in the `bmad-assembly` block, checked against the payload `session_id` (RES-6).
5. **Machine-state home (D-037):** phase and gate state (`phase:`, `gates:` map with status + D-ID + timestamp) live in `artifacts/context/project-brain.md` frontmatter — the one file with a guaranteed reader (warm boot, every session) and guaranteed event-driven writers (gate transitions). **`project.yaml` is deleted.** Static init-time facts stay in `swarm.yaml`. If tooling ever demands a compatibility view, it is generated *from* frontmatter and marked generated — never hand-maintained.
6. **Spawn-mode guidance:** run-to-completion Agent spawns (result-only, no mailbox) documented as preferred where two-way messaging isn't needed (Vantage D-042); MCP-tools-may-be-orchestrator-only noted in role briefs (Vantage D-041). Rejection flow schedules an explicit re-review task (RES-9).

## Alternatives considered

- **Make project.yaml real (WS-2 item 5 as designed).** Rejected: repeats the chore-file design that already failed in the field — state maintained as a duty dies (project.yaml, 8/9 lying); state written as a side effect of work with a guaranteed reader survives (decision-log). The continuity doc's argument, adopted by D-037.
- **All state in the task ledger, no frontmatter.** Rejected: the ledger is an event stream, not a current-state snapshot; gate status would require replaying the file every boot, and the brain already has the guaranteed-boot reader.
- **Heartbeat polling for liveness.** Rejected: reintroduces the mailbox-spam failure D-028 killed; event-driven reconciliation + one-ping-then-respawn covers the same failures without polling.

## Consequences

- Crash-only coordination: terminal close, compaction, or a 5am orchestrator death no longer strands the run — this is /sleep's resume substrate and a hard /sleep gate (D-041).
- `project.yaml` deletion touches generators, validator, doctor, and field scaffolds (WS-11 migration table entry required).
- The ledger is also the morning report's data source (report-from-ledger, vision §4.5) and the record `run-reporter` either feeds (session-end snapshot) or dies (ADR-020).
- Field-test against a real project before release is mandatory (D-041 Phase 2).
