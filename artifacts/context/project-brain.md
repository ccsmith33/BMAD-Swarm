---
schema: project-brain/1
updated: 2026-08-13T15:00:00Z
checkpoint: 1
phase: implementation
gates:
  prd-approved: {status: skipped, note: reinvention track is design-led, no PRD}
  architecture-approved: {status: passed, ref: artifacts/design/phase2-enforcement-resilience-2026-08-13.md}
staleness: {ledger-events-since-checkpoint: 0}
---

## What this is (and why)

bmad-swarm is a multi-agent orchestration framework where one orchestrator delegates all work to spawned teammate agents and never writes code or artifacts itself. Enforcement lives in Claude Code hooks (deterministic), guidance lives in prompts (advisory) — the two are never conflated. "Done" for the current reinvention track means a fresh Claude that reads the durable artifacts outperforms a several-times-compacted one; the whole point is that comprehension survives compaction and fresh starts. The human's named pain: once a session compacts a few times, Claude loses what the project IS, and a lobotomized-but-warm Claude beats an amnesiac fresh one — this project inverts that.

## Current mental model

- Two enforcement classes, never blurred: hooks (deterministic — deny/exit-2) vs prompts (advisory lint, labeled as such in every message they emit).
- The orchestrator-write-gate hook, not prompt text, is what stops the orchestrator writing code; it identifies the orchestrator by hook-payload subagent fields + AGENT_ROLE env (HARN-1).
- The team-assembly-lint hook reads ONLY team-assembly-log.md (never the transcript) and gates the last fenced block's freshness before an Agent spawn.
- Serialized context files (ledger.md / task-ledger.md / decision-log.md) are write-denied to every agent; the only writer is the pinned CLI node .claude/bmad/bin/record.cjs.
- The replay gate re-executes declared evidence at task completion (TaskCompleted exit-2), so an LLM's honesty is never load-bearing for "done".
- Memory is two-tier: a bounded HOT brain (this file) + unbounded COLD stores it points into (decision-log, ledger, lessons-learned) — the brain holds pointers, never copies.
- Hooks are the durable writers (guaranteed trigger); prompted state dies (project.yaml lied in 8/9 field projects), so state that must survive is written as a side effect of an event, not a chore.

## Load-bearing facts

- Spike-verified on Claude Code v2.1.221: PreCompact stdout is injected as compaction instructions AND can flush state; never exit 2 (it blocks auto-compaction and pins the session at the ceiling) — see artifacts/design/phase2-enforcement-resilience-2026-08-13.md (Spike ground truth).
- SessionStart matcher:compact re-injects context after compaction; matcher:startup fires on fresh sessions (artifacts/design/phase2-enforcement-resilience-2026-08-13.md).
- The brain is a SINGLE-WRITER file (the orchestrator, prose body) — it is EXEMPT from the serialized-CLI write-deny (phase2 design §3.2, artifacts/design/phase2-enforcement-resilience-2026-08-13.md).
- project.yaml is being DELETED in the sibling task-ledger track (D-037); machine state (phase/gates) now lives in this brain's frontmatter, not a separate YAML.
- Do NOT regenerate the live .claude/ mid-session — this session runs on it; regeneration is deferred to pre-merge (D-045). Verify hooks via temp-dir generation + direct stdin invocation.
- The five standing context files (D-036 cap): ledger.md, task-ledger.md, project-brain.md, decision-log.md, team-assembly-log.md; findings-register + lessons-learned migrate into ledger.md.
- Token-budget proxy is char/4; the brain hard cap is ~2,500 tokens with touch-or-die eviction (utils/project-brain.js).
- The record envelope (one shape, five record types) is the single serialized-write schema — artifacts/context/ledger.md, D-036/ADR-021.

## Active threads

- Project brain (this piece, SE-2) — schema + PreCompact flush + SessionStart warm-boot landing — next: run the hook + module tests green — see artifacts/design/phase2-enforcement-resilience-2026-08-13.md @c1
- Task-ledger + machine-state cutover (sibling SE-2/SE-3 track) — reconcile + project.yaml deletion — owned elsewhere, do not build here — see artifacts/design/phase2-enforcement-resilience-2026-08-13.md (§4.3) @c1
- SE-1 enforcement layer — replay gate + record ledger + Fork A narrowing — COMMITTED at d913a25, D-051 — see artifacts/context/decision-log.md @c1

## Dead ends

- Rewire TaskCompleted to a Stop hook — rejected, the payload lacks task fields; superseded by the direct TaskCompleted event once spike 1 proved it exists (D-002, superseded by D-051) @c1
- project.yaml as a machine-state chore file — abandoned, it lied in 8/9 field projects because nothing read or event-wrote it (D-037) @c1
- Trusting the default compaction summarizer as the memory layer — rejected, it cannot know which 5% is load-bearing; only schema-driven compaction is acceptable (phase2 design §4.4) @c1

## Open questions

- Do PostToolUse payloads for TaskCreate/TaskUpdate/SendMessage carry the task fields the hook-written task ledger needs? (verified live — see artifacts/exploration/spike-posttooluse-2026-08-13.md)
- Final disposition of team-assembly-log.md as the 5th standing file vs folding into the task ledger (human decision, phase2 design §7).

## Pointers

- decision-log (next D-ID: D-052): artifacts/context/decision-log.md
- lessons-learned: artifacts/context/lessons-learned.md
- unified record ledger: artifacts/context/ledger.md
- findings-register (pre-migration): artifacts/context/findings-register.md
- resilience design (RES-1..10 → liveness/task-ledger/machine-state): artifacts/design/phase2-enforcement-resilience-2026-08-13.md (§4.3)
- continuity/brain design (full brain spec): artifacts/design/phase2-enforcement-resilience-2026-08-13.md (§4.4)
- phase-2 design (Piece 4 / brain): artifacts/design/phase2-enforcement-resilience-2026-08-13.md
- brain schema (agent-facing): .claude/bmad/methodology/artifact-schemas/project-brain.md
