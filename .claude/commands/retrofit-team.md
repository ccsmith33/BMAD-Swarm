---
description: Propose a Domain Map for an existing architecture (orchestrator-overlay; spawns one architect for the file edit)
---
<!-- bmad-generated:0a78f0ee -->

Enter retrofit-team mode (orchestrator-overlay pattern, hybrid: overlay for design + architect spawn for the file edit). Per ADR-010, this command proposes a Domain Map for an existing project's architecture, walks the user through iteration, gates the edit on explicit human approval (per the CLAUDE.md `architecture` human-approval invariant), and then spawns ONE architect teammate to perform the single Edit call that inserts the approved Domain Map into `artifacts/design/architecture.md`.

Walk these steps in order. Refuse cleanly at any gate that fails — do not improvise around a refused state.

1. **Refuse if wide-team is already configured.** Read `swarm.yaml`. If `team.mode === "fixed"` AND `team.specializations` is a non-empty list, REFUSE: print "wide-team already configured (`team.mode: fixed` with N specialization(s)); the retrofit chain ends here. Edit `swarm.yaml` directly to change the roster, or run `/retrofit-team` only after removing the existing `team:` block." Show the existing `team` block. Exit the overlay. Do NOT log a D-ID for refusals.

2. **Refuse if the architecture document is missing.** If `artifacts/design/architecture.md` does not exist, REFUSE: print "no architecture document found at `artifacts/design/architecture.md`; run `/feature` or `/plan` first to produce one — `/retrofit-team` works on top of an existing architecture." Exit the overlay.

3. **Detect existing Domain Map.** Read `artifacts/design/architecture.md` in full. Look for a `## Domain Map` (or `### Domain Map`) heading. If present:
   - Show the existing section verbatim to the user.
   - Ask: "this architecture already has a Domain Map. What would you like to do? [refuse (default) / append-as-comment / replace]"
   - **`refuse`** (default on empty input or "no"): exit cleanly. Suggest `bmad-swarm scaffold-team` if they want the corresponding `team:` block.
   - **`append-as-comment`**: continue to step 4, but in step 8 the architect brief instructs the architect to insert the new map as a commented-out block adjacent to the existing one (not replacing it).
   - **`replace`**: requires the user to type the literal word `replace` (not "yes", not "y", not "go"). This is the same rationale as `git push --force` — destructive overwrites need a deliberate signal. If the user types anything else, treat it as refuse.

4. **Load architect Domain Map heuristics.** Read `.claude/agents/architect.md` — specifically the "Domain Map (when using fixed-mode wide team)" section. Internalize the four heuristics: (a) ≥2-story rule, (b) architecturally-significant exception, (c) cross-cutting dependencies → fallback, (d) orthogonality test. You will overlay the architect persona for the duration of the proposal conversation.

5. **Propose a Domain Map.** Walk the architecture's component / system-overview / module sections. Apply the four heuristics to partition the codebase into bounded domains. Each candidate domain needs: a kebab-case slug (matches `^[a-z0-9][a-z0-9-]*[a-z0-9]$` — same regex the validator enforces), a one-line description, the components it covers (file globs or module names from the architecture), and the anticipated story count. If the architecture is too thin (<200 lines, single paragraph, no component breakdown), surface this and recommend running `/feature` first; do NOT fabricate domains from a stub.

6. **Present the proposed map** to the user as the markdown table format from `.claude/agents/architect.md`:

```markdown
## Domain Map

| Domain | Description | Components | Anticipated stories |
| --- | --- | --- | --- |
| backend-auth | OAuth2/PKCE, sessions, password flows | `src/auth/*`, `src/middleware/auth-*` | ~5 |
| ... | ... | ... | ... |
```

   Announce the chosen insertion position before approval, in this priority order (per `architecture-retrofit.md` §3.4):
   - (a) Immediately after `## Components` / `## Architecture` / `## System Overview` if any of these is present.
   - (b) Otherwise, immediately before any existing section whose heading contains `domain` or `team`.
   - (c) Otherwise, append at the end of the document (before any `## References` or `## Appendix` if present).

   The user may override the chosen position. Iterate on the partition with the user until they're satisfied.

7. **Human approval gate.** Pause and explicitly ask: "Approve the Domain Map for insertion into `artifacts/design/architecture.md`?" Wait for an explicit "yes" / "approve" / equivalent affirmative. This honors the CLAUDE.md invariant "Human approval is required for: ... architecture". If the user declines, exit cleanly with no edits and no D-ID logged.

8. **On approval: spawn ONE architect for the file edit.** Append this `bmad-assembly` block to `artifacts/context/team-assembly-log.md` (and emit it in your message for traceability), then spawn the architect via the Agent tool (`subagent_type: architect`) with a brief that contains the approved Domain Map verbatim and the chosen insertion position:

```bmad-assembly
entry_point: small-feature
complexity: 5
autonomy: auto
team:
  - role: architect
    model: opus
rationale: Insert approved Domain Map verbatim into architecture.md (one Edit, no design work; spawn brief constrains scope).
```

   Architect spawn brief template:

   > Insert the following Domain Map section into `artifacts/design/architecture.md`.
   > Position: <chosen position from step 6 — describe precisely, e.g. "immediately after the `## Components` heading, before `## Data Model`">.
   > **Do not author a fresh Domain Map.** The map below is final and approved by the human; copy it verbatim.
   > **Do not write an ADR.** This is a doc patch, not a design decision; the design happened in the orchestrator overlay.
   > Do not edit any other content. Do not modify the existing component diagram or any other section.
   > After the edit, report back with one line: "Inserted Domain Map at <line>".
   >
   > <the approved Domain Map table verbatim>

9. **After the architect reports completion, log a tactical D-ID.** Append a one-line tactical entry to `artifacts/context/decision-log.md` with the next available D-ID: `## D-NNN — Retrofit Domain Map added to architecture.md via /retrofit-team` followed by Date, Source (`orchestrator (auto)` or with human ack), and a one-line Reason. Per `.claude/bmad/methodology/decision-traceability.md` "Team-Shape Decisions" — this is a tactical entry. If the architect spawn fails or rejects the brief, do NOT log the D-ID; report the failure to the user and exit. The user can re-invoke `/retrofit-team` to retry.

10. **Tell the user the next step.** Print: "Domain Map inserted. Next step: run `bmad-swarm scaffold-team` (no flag) to preview the corresponding `swarm.yaml:team` block, or `bmad-swarm scaffold-team --write` to back up `swarm.yaml` and inject the block. See README §Wide-team specialization for the full chain."

Do NOT chain to `scaffold-team` automatically — the two tools are deliberately decoupled per `architecture-retrofit.md` §12 trade-off 5. The user runs the CLI command themselves.

Cross-references: `artifacts/design/architecture-retrofit.md` §3 (Tool A design), ADR-010 (overlay-vs-spawn rationale), ADR-003 (orchestrator-write-gate — this overlay does NOT loosen the gate; the architect spawn does the file edit), CLAUDE.md (`architecture` human-approval invariant).