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
4. Log to `artifacts/context/decision-log.md`:
   ```
   | [date] | [What was decided] | [Why -- 1 sentence] |
   ```
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

## Connection to Decision Traceability

Both tactical and strategic decisions are tracked in the decision traceability system (see `methodology/decision-traceability.md`). The classification determines the documentation depth, not whether a decision is tracked.

### Tactical Decisions and Traceability

Tactical decisions that are auto-resolved still receive a D-ID and are logged to `artifacts/context/decision-log.md`. The record is lightweight -- one line with the D-ID, date, summary, source, and status. No rationale or affects list is required because tactical decisions are implementation-level, reversible, and low blast radius by definition.

This matters because even tactical decisions can accumulate into a pattern. If a reviewer notices that an agent made ten tactical decisions all pushing the codebase toward a particular approach, that pattern may constitute a de facto strategic decision that was never explicitly evaluated. D-IDs on tactical decisions make this pattern visible.

### Strategic Decisions and Traceability

Strategic decisions that are escalated and resolved receive a D-ID with full documentation: rationale, the artifacts they affect, and lifecycle status tracking through `proposed`, `accepted`, `implemented`, and `verified`. The D-ID is then referenced in all downstream artifacts (PRD requirements, architecture sections, story acceptance criteria) so that the reviewer can verify the implementation matches the decision.

### Classification Errors and the Reviewer

The reviewer audits the decision log during each code review. If a decision was classified as tactical but has the characteristics of a strategic decision (affects product direction, user experience, or has high blast radius), the reviewer flags it as a medium-severity finding. The D-ID system makes this audit possible -- without it, tactical decisions would be invisible and unauditable.
