# Spike — PostToolUse payload shapes for task/coordination tools (2026-08-13)

Gates SE-2 opening ("PostToolUse payload live check", phase2-enforcement-resilience-2026-08-13.md §6, §3.3). Investigation only, no live settings/hooks in the working project were touched. Environment: Claude Code CLI **v2.1.222** (installed, `claude --version`), `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Evidence classes: (1) Context7 docs (`/llmstxt/code_claude_llms_txt`, sourced from code.claude.com/docs), (2) live throwaway-session tests in the scratchpad (`.../scratchpad/spike-posttooluse/`), matching the spikes-2026-08-11.md methodology. No live project settings/hooks were modified.

## Verdict summary

| # | Question | Verdict |
|---|---|---|
| 1 | PostToolUse fires for TaskCreate/TaskUpdate/TaskGet/TaskList with enough fields for a task-ledger row | **works** — verified live |
| 2 | PostToolUse fires for SendMessage with enough fields for a "woken" event | **works-with-caveats** — fires, but no task-id linkage; needs a join, not free-text parsing |
| 3 | Matcher exists for these tool names; payload carries both input and result | **works** — verified live |
| 4 | Any field absent/unreliable forcing a fallback | **yes, two** — see below; neither forces ADR-018's prompted-append fallback |

**Bottom line for the team-lead's question:** PostToolUse hooks can durably capture task-create and task-status-change events with no LLM diligence in the write path — confirmed live, exactly as ADR-018/§3.3 assumed. The "woken" event is capturable too, but not via a task-id field (none exists on SendMessage) — it needs the writer hook to join `SendMessage.tool_input.to` against an owner→task-id map the hook itself maintains from TaskUpdate events, not text-parsing of the message. This is more reliable than the design doc's assumed heuristic and doesn't require falling back to a prompted append. One genuine gap (TaskGet drops `owner`) doesn't touch the reconciliation path, which reads TaskList instead — see caveats.

---

## Common PostToolUse envelope (verified live, all four tool types)

```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "...",
  "prompt_id": "...",
  "permission_mode": "acceptEdits",
  "effort": {"level": "high"},
  "hook_event_name": "PostToolUse",
  "tool_name": "TaskCreate|TaskUpdate|TaskGet|TaskList|SendMessage|Agent",
  "tool_input": { /* tool-specific */ },
  "tool_response": { /* tool-specific, present = post-success */ },
  "tool_use_id": "toolu_...",
  "duration_ms": 2
}
```

`agent_id` / `agent_type` are present **only** when the hook fires inside a subagent/teammate's own tool call (confirmed: absent on main-thread calls, present — `agent_id`, `agent_type: "general-purpose"` — on a spawned subagent's own `SendMessage`). `session_id` is shared between a parent session and its subagents (same value on both parent- and subagent-originated events in the same run) — it identifies the CLI process/session, not the individual teammate; owner/agent_id is what distinguishes teammates, matching how the design's `session=` field should be read (process/run identity, not per-teammate identity). No `timestamp` field — the writer hook must stamp wall-clock time itself at invocation (fine; hooks run synchronously at tool completion, so this is contemporaneous).

## 1. TaskCreate / TaskUpdate / TaskGet / TaskList — verdict: works

Live payloads (fields trimmed to what's new per tool; envelope above holds):

- **TaskCreate** — `tool_input: {subject, description}` (no `owner`, no `activeForm` used in this test but doc-confirmed as optional input). `tool_response: {task: {id, subject}}`.
- **TaskUpdate** — `tool_input: {taskId, status?, owner?, subject?, description?, addBlocks?, addBlockedBy?, metadata?}` — every field set (including `owner`) round-trips into `tool_response.updatedFields` and, for status, `tool_response.statusChange: {from, to}`.
- **TaskGet** — `tool_input: {taskId}`. `tool_response.task: {id, subject, description, status, blocks, blockedBy}` — **no `owner` field**, even after `owner` was set via TaskUpdate immediately prior. Reproduced twice.
- **TaskList** — `tool_input: {}`. `tool_response.tasks: [{id, subject, status, owner, blockedBy}]` — **`owner` present here**, unlike TaskGet.

This is enough for a task-ledger row (`id`, `owner`, `status`, `timestamp`): `id`/`status` come from every tool's payload; `owner` is captured the moment it's set via `TaskUpdate.tool_input.owner` (the writer hook doesn't need to re-query it later); `timestamp` is hook-stamped. Matches ADR-018/§4.3's line format directly — `created` from TaskCreate, `assigned`/`in_progress`/etc. from TaskUpdate's `statusChange`.

**Caveat (real, but not load-bearing for the design as written):** TaskGet drops `owner`; TaskList doesn't. §4.3's `reconcile` function is specified to take `taskListJson` (i.e., the TaskList tool's output) as input, not TaskGet's — so the reconciliation path already uses the tool that has `owner`. If anything in Phase 2 is later written against TaskGet expecting `owner`, it will silently get `undefined`; worth a one-line note in `utils/reconcile.js`'s docstring so a future track doesn't rediscover this the hard way.

## 2. SendMessage — verdict: works-with-caveats

Fires reliably, both directions (main → subagent, subagent → main), confirmed live twice. **Real field names differ from the Context7/SDK docs**, which describe `agent_id_or_name` + `message`. The live v2.1.222 payload is:

```json
"tool_input": {"to": "spike-worker", "summary": "ack task 1 in_progress", "message": "ack task 1 in_progress"}
```

```json
"tool_response": {"success": true, "message": "Agent \"spike-worker\" had no active task; resumed from transcript in the background with your message. ...", "resumedAgentId": "a44521079e862196b", "pin": {"id": "...", "name": "spike-worker", "ref": "248244"}}
```

(Response shape varies slightly by scenario — the subagent's reply to `"main"` returned `{"success": true, "message": "Message queued for the main conversation's next turn."}` with no `pin`/`resumedAgentId`.) This is a genuine doc-vs-live discrepancy to flag if `task-ledger-writer.cjs` is hand-written against the docs rather than this spike's fixtures.

**The gap:** there is no `task_id` field anywhere in `SendMessage`'s input or response — only `to` (target agent name/id), `summary`, and `message` (free text). §3.3's assumed heuristic ("message references the task id") would require parsing `summary`/`message` text, which is exactly the kind of fragile inference D-037/§3.3 exists to avoid.

**Better fallback than ADR-018's prompted append (still hook-only, no LLM diligence):** the writer hook already sees every `TaskUpdate.tool_input.owner` assignment (§1 above). Have it maintain an in-memory-per-invocation (or ledger-derived) `owner → most-recent-owned-task-id` map, and on `SendMessage` with `tool_input.to == <some owner>`, emit `woken` for that owner's current task. This is deterministic, requires no text parsing, and stays entirely inside the hook's write path. It's imprecise in one edge case — a `SendMessage` to an owner that's pure coordination chatter unrelated to their current task would spuriously log a `woken` line — but that's a false positive on an advisory-signal event, not a false negative on the authoritative one (see next paragraph), so it's an acceptable approximation.

**Lower-stakes than the design doc's own hedge suggests:** re-reading §4.3, the *authoritative* wake-ack signal RES-3 depends on is `TaskUpdate → in_progress` ("`in_progress` here is the wake-ack landing durably"), which is fully verified reliable (§1). `SendMessage → woken` is described as an earlier, softer signal in the event vocabulary, not the one `reconcile`'s not-yet-woken check depends on. So even in the worst case — drop `woken` entirely — the ledger's "pending + no in_progress line = not-yet-woken" logic (the property the design actually leans on) is untouched. Recommend keeping the owner-join `woken` line as a nice-to-have earlier signal, not treating its precision as gating.

## 3. Matcher + result availability — verdict: works

Matcher `"TaskCreate|TaskUpdate|TaskGet|TaskList|SendMessage|Agent"` on `PostToolUse` fired exactly and only for those tool names across three separate live runs — no false positives, no misses. `tool_response` (the actual result — `statusChange`, `updatedFields`, `task` object, `tasks` array, SendMessage delivery status/error) is present alongside `tool_input` on every event, confirming PostToolUse is genuinely post-success with both halves available, matching the doc's description ("triggered after a tool has been successfully executed").

## 4. Fields absent/unreliable — summary of both real gaps

1. **TaskGet omits `owner`** (TaskList doesn't). Not load-bearing for the design as specified (reconcile reads TaskList), but worth a docstring note.
2. **SendMessage carries no `task_id`.** Needs the owner-join approach above instead of text-parsing or a prompted-append fallback. Does not touch the authoritative wake-ack path (`TaskUpdate → in_progress`), which is fully hook-capturable.

**Neither gap forces ADR-018's stated degradation path** (falling back to prompted `record.cjs task-event` appends for events hooks can't see). `TaskCreate`/`TaskCreated`-equivalent and `TaskUpdate`-driven events (created, assigned, in_progress/wake-ack, completed, and any other status transition) are fully hook-capturable with real field data, live-verified on v2.1.222. Only the *soft* `woken` signal needs an inferential join rather than a direct field, and even that join is still 100% hook-side (no agent behavioral contract involved) — it's a design refinement to §3.3, not a retreat to prompted writes.

## Test artifacts

Throwaway project: `/tmp/claude-1000/-home-ccsmith33-BMAD-Swarm/d7561ee5-f3f6-4d70-bc13-138f84d1c4f9/scratchpad/spike-posttooluse/` — `.claude/settings.json` (PostToolUse hook logging stdin to `logs/posttooluse.jsonl`), three headless `claude -p` runs exercising TaskCreate → TaskUpdate → TaskGet → TaskUpdate, then TaskCreate → Agent (spawn) → SendMessage → TaskUpdate → subagent SendMessage-back, then TaskCreate → TaskUpdate → TaskList → TaskUpdate. Raw JSONL logs preserved in that directory (session-scoped scratchpad, auto-cleaned). No live project settings, hooks, or generators were modified.
