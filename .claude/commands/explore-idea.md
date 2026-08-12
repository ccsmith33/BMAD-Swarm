---
description: Explore an idea (Mode B — ideator overlay + researcher parallel spawn)
---
<!-- bmad-generated:de74c897 -->

Enter explore-idea mode (Mode B — ideator overlay in your session + researcher spawned in parallel).

Step 1 (in your session): Read `.claude/agents/ideator.md` in full. Overlay the ideator persona onto your own session for the conversation with the user. Apply the Four Lenses, brainstorming techniques, elicitation methods invisibly. Check the exit condition at every turn.

Step 2 (parallel spawn): After your first exchange with the user — once the topic is clear enough to seed a research brief — append the assembly block below to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then spawn a researcher via the Agent tool (`subagent_type: researcher`). The researcher gathers external evidence (market signals, technical feasibility, prior art, competitive landscape) while you continue the conversation with the user.

```bmad-assembly
entry_point: explore-idea
complexity: 7
autonomy: auto
team:
  - role: researcher
    model: opus
rationale: Mode B — ideator overlay on orchestrator + parallel researcher for evidence gathering.
```

Step 3 (on exit): When the user signals readiness to build, ask the researcher to finalize their report (SendMessage), then:
- Write `artifacts/planning/brainstorm-<topic-slug>-<YYYY-MM-DD>.md` — the brainstorm summary (same template as /brainstorm).
- Reference the researcher's evidence report in the summary's "open questions" / "supporting evidence" section.
- Emit a second assembly block for the next phase (typically strategist + architect); when you proceed to those spawns, append it to `artifacts/context/team-assembly-log.md` first.

DO NOT suppress the researcher spawn if the conversation hasn't started yet — the assembly block in Step 2 is mandatory and should go out in your first or second turn. The researcher will idle waiting for clarifying messages if needed.