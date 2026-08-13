# Decision Classification

When agents encounter decisions during their work, they classify them as **tactical** or **strategic** to determine whether to resolve autonomously or escalate.

## Tactical Decisions (Auto-Resolve)

Tactical decisions are implementation-level choices where multiple options are acceptable and the difference between them does not meaningfully affect the product, user experience, or long-term architecture. Agents resolve these independently and log the decision with rationale to `artifacts/context/decision-log.md`.

### Examples

- **Library selection within a category**: Choosing between equivalent libraries (date-fns vs dayjs, axios vs got) when no preference is stated in `swarm.yaml` or architecture
- **Code organization**: File naming, directory nesting, module grouping within the boundaries set by the architecture
- **Implementation approach**: Using a for loop vs map/filter, class vs function, async patterns -- when the architecture does not specify
- **Test structure**: How to organize test fixtures, helper functions, mock factories within the project's testing conventions
- **Error message wording**: Exact phrasing of user-facing error messages when the PRD specifies the behavior but not the copy
- **Database indexing**: Adding indexes for query performance when the architecture specifies the queries but not the indexes
- **API response field ordering**: Structural choices in serialization when contracts specify the fields but not the order
- **Framework-specific patterns**: Middleware ordering, hook composition, component structure where the framework has established conventions

### Auto-Resolve Protocol

1. Identify that a decision is needed
2. Evaluate whether it is tactical (implementation-level, multiple acceptable options, does not affect product direction)
3. Choose the option that best fits existing project conventions, or the simplest option if no convention exists
4. Log to `artifacts/context/decision-log.md` using the row format defined by `methodology/artifact-schemas/decision-log.md` — assign the next sequential D-ID (one higher than the current maximum; never skip or reuse):
   ```
   | [D-ID] | [date] | [What was decided -- summary] | agent | accepted |
   ```
   The D-ID is required even for tactical decisions (the lightweight record is a single row — no rationale or affects list needed), so that a pattern of tactical decisions remains visible and auditable.
5. Continue working without interruption

## Strategic Decisions (Escalate)

Strategic decisions affect the product's direction, user experience, business logic, security posture, or long-term maintainability in ways the human product owner would care about. Agents escalate these to the orchestrator with structured options.

### Examples

- **Business logic ambiguity**: "Should inactive accounts be soft-deleted or hard-deleted?" -- affects data retention and user experience
- **Scope interpretation**: "This requirement could mean X or Y, and they have different implementation costs" -- affects what gets built
- **Architecture tradeoffs with user impact**: "We can use server-side rendering for better SEO or client-side rendering for better interactivity" -- affects product behavior
- **Security design choices**: "Store sessions in cookies vs JWTs" -- affects security posture and scalability
- **Data model decisions with business meaning**: "Should users have one profile or support multiple profiles?" -- affects core product model
- **Feature behavior under edge cases**: "What should happen when a user tries to book an already-booked slot?" -- affects user experience
- **Third-party service selection**: Choosing between external services with different pricing, reliability, or feature tradeoffs
- **Breaking changes**: Any decision that would invalidate existing artifacts, require re-work, or change the meaning of existing requirements

### Escalation Protocol

1. Identify that a decision is needed
2. Evaluate whether it is strategic (affects product direction, user experience, business logic, or long-term architecture)
3. Formulate 2-3 options with clear tradeoffs:
   ```
   Decision needed: [concise description]

   Option A: [description]
   - Pro: [advantage]
   - Con: [disadvantage]

   Option B: [description]
   - Pro: [advantage]
   - Con: [disadvantage]

   Recommendation: [which option and why]
   ```
4. Send to orchestrator. The orchestrator either resolves it (in auto mode) or escalates to the human (in guided/collaborative mode)
5. Wait for the response before proceeding on any work that depends on this decision. Continue work on unrelated tasks if possible.

## The Contradiction Escalator (constitutional floor)

The classification above governs *decisions* an agent makes during its own work.
The advisory layer (`methodology/advisory.md`) governs *recommendations* — things
swarm proposes the human do differently. One rule binds the two together and is
**invariant and untunable:**

> **Any recommendation that crosses an accepted D-ID or an explicit human
> statement can never be delivered silent-proceed, and always carries the
> maximum evidence bar.**

This is a floor, not a threshold. The self-tuning profile can move swarm quieter
on everything else; it can never lower this. The reason is the carved principle
that the whole system rests on: **the human is the source of truth for
DECISIONS, not for what is BEST.** Swarm may argue that a recorded decision is
wrong (challenge-the-premise is in scope), but overriding a human call is the one
act that most needs receipts and a visible pause — so it gets both, always.

A recommendation trips the escalator when it would contradict, weaken, or route
around a decision already recorded as an accepted D-record in
`artifacts/context/decision-log.md`, or contradict something the human stated
explicitly in-session. On a hit: minimum delivery mode is **inline-note**,
expected mode is **pause-and-ask**, evidence bar is **maximum** (an external,
checkable citation or a constructed spike — never assertion). Silent-proceed is
structurally forbidden. If the human reaffirms the decision, the recommendation
becomes a *rejected R with a re-open trigger* — recorded, not relitigated
(disagree-and-commit). See `methodology/advisory.md` §3 for the full model.

## Classification Heuristics

When unsure, agents apply these heuristics:

- **Reversibility test**: Can this decision be easily changed later without rework? If yes, it's likely tactical. If changing it later requires significant rework or affects other components, it's likely strategic.
- **Stakeholder test**: Would the product owner have an opinion about this? If yes, it's strategic. If they'd say "I don't care, just pick one," it's tactical.
- **Blast radius test**: Does this decision affect only my current task, or does it ripple into other agents' work? Contained = tactical. Ripple = strategic.
- **Precedent test**: Does this decision set a pattern that future work will follow? If yes, lean toward strategic -- or at minimum, log it prominently so it can be revisited.

## Autonomy Level Interaction

The autonomy level shifts the classification boundary:

- **Auto mode**: The orchestrator resolves strategic decisions without human input. Agents still escalate to the orchestrator (not the human), but the orchestrator makes the call and logs the rationale.
- **Guided mode**: Strategic decisions at phase boundaries go to the human. Within-phase strategic decisions go to the orchestrator.
- **Collaborative mode**: All strategic decisions go to the human through the orchestrator.

Tactical decisions are always auto-resolved regardless of autonomy level. The whole point is that nobody needs to be bothered with them.

## The Regime Router (D-038)

Classification decides *how an agent handles a decision*. The **regime router**
decides something upstream of that: **how much agency a whole task needs before
any team is assembled.** The complexity brain (the orchestrator's scoring table)
is the control law; the native primitives — the solo main session, the
deterministic Workflow script, the full agentic team — are just actuators. The
router picks the actuator. This is Unlock 1 of the reinvention vision, amended by
**D-038** (one priced router) and by spike 3 (the Workflow-tool contract, see
"Escalation is script logic" below).

The orchestrator scores complexity (5–15, per the scoring table in
`agents/orchestrator.md`) and routes to exactly one regime:

| Complexity score | Regime | What runs | Cost floor |
|---|---|---|---|
| **≤ 6**, single-file / well-shaped | **solo** — the main session handles it, no spawn | one agent, no assembly ceremony | ~0 marginal |
| **7–11**, shaped but multi-step | **Workflow script** — a named `.claude/workflows/` deterministic pipeline with agentic nodes | fixed step graph (reproduce → fix → test → review → ledger), schema-validated node outputs, resumable at node boundaries | 1–2 spawns, resumable |
| **≥ 12**, or ill-defined / exploratory | **agentic team** — the full assembly (entry-point + complexity tables size it) | full assembly ceremony, justified by the score | full ceremony |

**Regime-invariant traceability (the load-bearing property).** Whichever regime
runs, the work emits the *same* D-IDs, the same ledger lines via `record.cjs`,
and the same artifact species as a full agentic run. An auditor cannot tell — and
should not care — which regime produced a change. A Workflow node that runs
`npm test` and blocks on a non-zero exit code is enforcement, not ceremony; a
Workflow node that spawns an `agent()` is the same review gate the agentic regime
runs. The regime is a cost decision, never a rigor decision.

**Plan approval at complexity ≥ 12 (WS-12).** When the router lands a task in the
agentic regime *because* its score is ≥ 12, the orchestrator produces the plan —
the `bmad-assembly` block and task graph — and **pauses for human approval before
spawning** (in `auto` mode this is the existing `auto → guided` autonomy override
in `agents/orchestrator.md`; the router states it here so the rule lives with the
routing decision that triggers it). Below 12, the router proceeds without a plan
gate. This is the single WS-12 rule that rides in the router; the rest of WS-12 is
deferred.

**Escalation is script logic, not a platform primitive (spike-3 caveat, honored).**
Spike 3 verified the Workflow tool live but found **no `escalate: agentic`
primitive** — nothing re-routes a deterministic pipeline to a team by that name.
So the router's "the deterministic tier escalates to agentic" is implemented as
**script logic inside the workflow**: a node whose schema validation is exhausted
(the StructuredOutput retry cap), or that emits an explicit escalation output,
routes the remainder of the task to a fallback `agent()` team node **and logs a
router-miss event** — `record.cjs task-event --event router-miss` — which is the
one telemetry stream worth keeping, because it makes the complexity rubric
empirically tunable later (self-tuning input, vision §4.6; no tuner is built this
phase). Deterministic-tier workflows ship as **named** workflows in
`.claude/workflows/` (never inline scripts): spike 3 found inline/dynamic
workflows are permission-gated, so named packaging is the robust form. A live
named-workflow smoke run confirmed the contract before this tier shipped (one
`agent({schema})` node ran, forced StructuredOutput, returned its sentinel; the
`resumeFromRunId` interface completes cleanly, with node-boundary resume as the
reliable mechanism rather than cross-invocation cache).

**Failure mode designed against: misrouting ambiguous work down.** The router's
one real risk is routing genuinely-ambiguous work into the deterministic regime,
where it cannot ask questions. The escape hatch above (any node may escalate to a
team) is the containment: a misroute costs one router-miss event and a fallback
spawn, not a wrong answer. **The router stays a rule table — never learned**
(kill-list #7): it is auditable, tunable, and explainable, which is the trust
that the whole ops loop depends on.

## Mode Column — day actions and the Night Ladder (D-038 / D-034)

The classes above (tactical / strategic / contradiction-escalator floor) route
the *same decision* differently depending on **mode**. There is one table, not
two: a day-table and a night-table would drift out of lockstep. The mode is set
by whether a `/sleep` charter is active (Stream S's night floor; a charter with
`ends:` in the future).

- **By day**, the delivery-mode ladder governs (`methodology/advisory.md`):
  silent-proceed → inline-note → pause-and-ask, judged per decision from its own
  stakes.
- **By night**, the human is asleep, so *pause-and-ask is not available* — a night
  that stalls waiting for an answer is a wasted night. The **Night Ladder** (D-034
  / D-038, Stream S) substitutes deterministic, reviewable actions that **never
  stall and never merge**: every night action ranks work and fills the morning
  report; ranking orders work, it never refuses it.

The day side is the delivery-mode ladder above (silent-proceed → inline-note →
pause-and-ask, per `methodology/advisory.md`). The night side is the **Night
Ladder** — Stream S's canonical wording, applied verbatim (the rung number tracks
the one-way-door test and the stakes, not the class name):

| Decision class | Night action |
|---|---|
| Tactical | Auto-resolve + one-line D-ID (unchanged from day). |
| Strategic, reversible (fails the one-way-door test) | **Rung 1 — FORK IT:** spike both options in isolated worktrees; both candidates get tests + evidence packs + a blind judge note. The decision becomes a morning selection between working artifacts — zero night time lost. Fork liberally; there is no fork budget (two branches cost two branch deletions). |
| Strategic, one-way but low-stakes (door closes, blast radius small, no floor signal) | **Rung 2 — DEFAULT IT:** proceed on a reasoned default; log a re-openable R-ID carrying rationale, the rejected alternative, and a rollback note. Morning review can reverse it while it is still cheap. Never Rung-2 anything that touches the destructive floor. |
| Strategic, one-way AND high-stakes (floor signal, contradiction-escalator hit) | **Rung 3 — PARK + ROUTE AROUND:** the decision enters the morning queue as a ≤10-line brief (claim, evidence, cost-both-ways, recommended call, default-if-approved); its dependent subtasks park with it; the scheduler moves to the next independent item. The night loses one work stream, not the night. |
| Constitutional floors (destructive-action floor, security floor, contradiction escalator) | Invariant across all modes — never priced, never defaulted through. At night they PARK the item rather than stall the run; they can never be raised or narrowed by the night. |

The **Contradiction Escalator** row is the one invariant across every mode and
every autonomy level: a decision (or recommendation) that crosses an accepted
D-ID or an explicit human statement can never be silent-proceed by day and can
never be auto-resolved by night — it is always Rung 3 (park) at night and always
at least inline-note by day, always at the maximum evidence bar. The human owns
DECISIONS; the router and the ladder may reorder *how little agency* the rest of
the work gets, but they can never lower this floor. See "The Contradiction
Escalator (constitutional floor)" above and `methodology/advisory.md` §3.

## Connection to Decision Traceability

Both tactical and strategic decisions are tracked in the decision traceability system (see `methodology/decision-traceability.md`). The classification determines the documentation depth, not whether a decision is tracked.

### Tactical Decisions and Traceability

Tactical decisions that are auto-resolved still receive a D-ID and are logged to `artifacts/context/decision-log.md`. The record is lightweight -- one line with the D-ID, date, summary, source, and status. No rationale or affects list is required because tactical decisions are implementation-level, reversible, and low blast radius by definition.

This matters because even tactical decisions can accumulate into a pattern. If a reviewer notices that an agent made ten tactical decisions all pushing the codebase toward a particular approach, that pattern may constitute a de facto strategic decision that was never explicitly evaluated. D-IDs on tactical decisions make this pattern visible.

### Strategic Decisions and Traceability

Strategic decisions that are escalated and resolved receive a D-ID with full documentation: rationale, the artifacts they affect, and lifecycle status tracking through `proposed`, `accepted`, `implemented`, and `verified`. The D-ID is then referenced in all downstream artifacts (PRD requirements, architecture sections, story acceptance criteria) so that the reviewer can verify the implementation matches the decision.

### Classification Errors and the Reviewer

The reviewer audits the decision log during each code review. If a decision was classified as tactical but has the characteristics of a strategic decision (affects product direction, user experience, or has high blast radius), the reviewer flags it as a medium-severity finding. The D-ID system makes this audit possible -- without it, tactical decisions would be invisible and unauditable.
