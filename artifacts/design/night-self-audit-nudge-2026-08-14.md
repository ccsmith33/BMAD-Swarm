# Night self-audit nudge (anti-premature-stop) — design note

**Feature:** D-54 · **Branch:** `feat/night-self-audit-nudge` (off `a0ff467`) · **Base:** Phases 3+4+5+L-5 shipped.
**One line:** during `/sleep`, when a night teammate goes idle or declares "done," the orchestrator prompts it once to reconsider — automating the human's repeated "why did you stop?" intervention. Operationalizes **L-5** (scope is a floor, not a ceiling) at the moment a teammate stops.

## Runtime model (verified against shipped code)
Confirmed correct. At night the **orchestrator is the live coordinator** — it owns task assignment (single wake channel, `orchestrator.md:291`) and receives teammate idle/completion messages. The **Governor is the orchestrator's night-scheduler mode** (same identity, not a separate process; `orchestrator.md:365`). Therefore the nudge is **orchestrator coordination behavior (prompt/identity-level), NOT a hook.** Enforcement stays in `night-floor.cjs` (untouched); this feature is pure judgment. Labels per D-039: floor = ENFORCEMENT, nudge = ADVISORY.

## Locked decisions

**1. Trigger.** Fire when, during an **active charter**, a night teammate hits a *stopping point*: (a) it sends a completion / "done" message to the orchestrator, or (b) reconcile shows its task fell out of `in_progress` with no follow-on (idle). Idle-notification-driven; the orchestrator's existing reconcile pass is the **timer backstop** (a teammate that died mid-idle is caught on the next reconcile). *Active charter* = pointer present, floor armed, `markerWoke` false.
**Do NOT fire when:** not in a night charter (day mode already reads scope as a floor); or `runway.computeRunway(charter).inDawnSlice || .expired` — the reserved dawn slice is report-writing time and must not be spent nudging; or the stopping point was already nudged (guard below).

**2. Anti-thrash guard (nudge at most once per stopping point).** A *stopping point* is anchored to the teammate's current **work episode** = the ISO timestamp of its most recent `in_progress` task-ledger event. State the orchestrator tracks, per teammate: `{ episodeAnchor, nudged: bool, disposition }`. Enforcement:
- Before nudging, check the **task-ledger** for a `nudged` row whose `episode:<anchor>` matches the teammate's current episode. Present → skip. (Ledger is the source of truth so the guard survives 3am compaction / warm-boot; the in-context map is only a fast path.)
- Nudge once → write the `nudged` row → set `nudged=true` for this episode.
- Teammate reaffirms **"genuinely done"** (+ parked list) → **ACCEPT**, record `disposition=done`, and **do not re-nudge**. It stays idle for the night unless the orchestrator re-tasks it.
- Teammate **continues** → it acks a *new* `in_progress` (new episode anchor). When it next stops, that is a NEW stopping point eligible for exactly one fresh nudge.
This bounds total nudges to ≤ the number of distinct work episodes, and each new episode required real work to create — so the loop cannot run forever and cannot coerce make-work (the teammate may always answer "done").

**3. The nudge prompt (exact text the orchestrator sends).**
> **Night self-audit** (L-5: scope is a floor, not a ceiling). Before you go idle for the night, reconsider once — this is a checkpoint, not a push to invent work.
>
> 1. **Parked work (required).** List what you deliberately did NOT do that is still in scope — adjacent reversible work, a follow-on you set aside, a test you skipped. One line each, with why you parked it. If you parked nothing, say "nothing parked" and why the scope is genuinely exhausted.
> 2. **Weigh each parked item against the Night Ladder.** Reversible and safe (branch commit, spike, doc, test, fork)? If it is genuinely valuable, **proceed with it now** — don't wait for morning. Irreversible or world-facing (merge, publish, deploy, a one-way decision)? **Park it** for the morning queue with a one-line brief — never do it tonight.
> 3. **Your call.** Either "**Continuing with X**" (name the specific reversible work), or "**Genuinely done: <reason>**" — a good stopping point is a fully valid answer. Do not manufacture low-value make-work to look busy; the bar is **value, not activity**. If the only work left is low-value or blocked, done is the right call.
>
> Reply with your disposition. I will not ask again about this stopping point.

**4. Durable logging (reuse the record envelope — no new store).** The existing `record.cjs task-event` envelope already accepts arbitrary `--event`/`--detail`; **no record.cjs logic change is required.** Stable task pointer `night-nudge` (mirrors the floor's `night-floor` red-banner rows). Three events:
| Event | When | `--owner` | `--detail` |
| --- | --- | --- | --- |
| `nudged` | nudge issued | teammate | `episode:<anchor> task:<taskId>` |
| `nudge-continued` | teammate continues | teammate | `picked up: <X>` |
| `nudge-done` | teammate reaffirms done | teammate | `parked: <Y>; reason: <Z>` |
The `nudged` row lands even if the teammate dies before replying, so the guard and the report both see it. *Optional* record.cjs edit: add these three names to the HELP/comment block as a documented vocabulary (discoverability only — not functional).

**5. Morning report integration (`utils/mission-control.js`).** Surface nudge outcomes in **§7 Night ledger** (transparency layer — the human reads it, does not act on it). Fold `nudged`/`nudge-continued`/`nudge-done` per teammate into `nightLedger.nudges = [{ agent, disposition, detail }]` plus a count of bare `nudged` rows with no disposition (crash between nudge and reply). Concretely:
- `buildMorningReport`: add a `NUDGE_EVENTS` set beside the other event-set consts (~L390-394); fold beside `deniedAttempts`/`routerDecisions` (~L504-509); add `nudges` to the returned `nightLedger` object (~L543-549).
- `renderMorningReport` §7: after the router-decisions block (~L678), before "Records minted", render e.g. `Self-audit nudges (N): considered stopping, then —` and one line per teammate: `- <agent>: continued with <X>` / `- <agent>: done, parked <Y> (<reason>)`.

## File-by-file change list (for the developer)
1. **`agents/orchestrator.md`** (SOURCE) — add a "Self-audit nudge" subsection under `## Night shift — the /sleep protocol` (~after L357): trigger + dawn-slice/expired exclusion, the anti-thrash guard (once per episode, ledger-anchored), the exact prompt text, and the three `task-event` log calls. ~25 lines.
2. **`.claude/agents/orchestrator.md`** (MIRROR) — **do NOT hand-edit.** Regenerate via `bmad-swarm update` / `generateAgents`; `test/methodology-agents-parity.test.js` asserts byte-identity.
3. **`methodology/decision-classification.md`** (SOURCE) — one-line note under the Night Ladder table (~L207) cross-referencing the self-audit nudge as the per-stopping-point application of L-5, so methodology and identity agree.
4. **`.claude/bmad/methodology/decision-classification.md`** (MIRROR) — regenerate; same parity guard.
5. **`utils/mission-control.js`** — §5 above (NUDGE_EVENTS const, fold, `nightLedger.nudges`, §7 render).
6. **`bin/record.cjs`** — *optional, doc-only*: add the three `night-nudge` event names to HELP/comment as a documented vocabulary. **No logic change** (task-event already serves).
7. **`generators/commands-generator.js`** (source of `.claude/commands/sleep.md` + `wake.md`, both `bmad-generated`) — *optional, light*: one cross-reference line in the `/sleep` step-4 block ("issue a self-audit nudge at each teammate stopping point") and in `/wake` step-3 (nudge outcomes appear in §7). Regenerate the two command mirrors after editing.
8. **`README.md`** — Night Mode section (~L164): one sentence that the orchestrator issues a one-per-stopping-point self-audit nudge and that outcomes surface in the morning §7. Standalone file, edit directly.

### Tests to add
- **`test/morning-report.test.js`** — feed synthetic `night-nudge` ledger lines; assert §7 renders continued/done outcomes and the bare-nudged-no-disposition count. (Primary new-behavior test.)
- **`test/mission-control.test.js`** — unit the fold: `nudged`/`nudge-continued`/`nudge-done` → `nightLedger.nudges`.
- **Regression guard:** `test/methodology-agents-parity.test.js`, `test/night-floor.test.js`, and its acceptance test must stay green (no hook change → they should; step 2/4 regeneration is the only way to keep parity green).
- If step 6 adds HELP text: `test/record-cli.test.js` help-output assertion may need the vocabulary line.

## Constraints honored
No new hook (coordination-level only). Reuses the `task-event` envelope — zero parallel store, zero record.cjs logic change. Touches neither `night-floor.cjs` nor its acceptance test nor the enforcement floor. Parity guards respected via regeneration (steps 2, 4, 7). Proportionate: one prompt-level behavior + one report fold + doc/cross-ref lines.
