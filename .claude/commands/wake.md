---
description: End the night: close the charter, reconcile, and generate the morning report
---
<!-- bmad-generated:ed933be9 -->

Enter /wake mode — end the night and hand off the morning queue (phase5 Stream S). A human prompt reaching this command has ALREADY set the human-authenticated wake marker (`.claude/hooks/.human-wake`, written by the UserPromptSubmit hook — an agent cannot fire it), so the floor has lifted and an early charter close is now legitimate.

1. **Close the charter.** Run `node .claude/bmad/bin/record.cjs night-charter close`. It succeeds now that the wake marker is present (it refuses an agent-driven early close while the clock runs — only a human prompt legitimizes it). Removing the pointer disarms the night floor.

2. **Reconcile crash-only state.** Run `node .claude/bmad/bin/record.cjs reconcile --tasklist -` (pipe TaskList JSON) to surface any tasks the night left un-acked, stuck, or orphaned — a night IS a series of deaths, so treat reconcile-and-resume as the normal path.

3. **Generate / refresh the morning report.** Run `bmad-swarm report --morning`. It is generated exclusively from durable stores (task-ledger, ledger, decision-log, charter, branch list), so it produces the same queue even if the orchestrator that ran the night is dead. Surface the seven sections in queue order: **ANSWER THESE** (parked Rung-3 decisions), **PICK ONE** (Rung-1 fork pairs), **MERGE THESE** (queue work passing review, one-line merge command each), **INITIATIVE SHELF** (volunteered branches best-first, source-cited; sensitive-path branches flagged for heavier review), **PROPOSALS** (floor-blocked prepared work incl. dependency bumps), **PARKED / TRIPWIRED** (loop trails verbatim, no euphemisms), **NIGHT LEDGER** (events, denied-attempt red banners, router decisions, self-audit nudge outcomes, tokens-for-transparency, records minted).

4. **Present the queue, not a transcript.** The report is a ranked list of ACTIONS the human takes — answer / pick / merge / shelf / skip — ordered so that stopping after the top section still captures most of the value. Nothing merges without the human's word; the ten branches they keep were free and the thirty they `git branch -D` cost nothing but the deleting.

Do NOT push, publish, merge, or deploy anything as part of /wake — the morning stays human-gated by posture even though the floor has lifted (D-050 precedent). Your job is to hand over a clean, ranked shelf.