# Decision Traceability

Decisions are first-class tracked objects in BMAD Swarm. Every strategic or tactical decision made during a project receives a unique Decision ID (D-ID) and is logged in `artifacts/context/decision-log.md`. Decision IDs flow through all downstream artifacts -- PRD requirements, architecture sections, story acceptance criteria, and implementation code -- creating a traceable chain from "why we decided this" to "where we built it" to "did we verify it."

## Decision ID Format

Decision IDs use the format `D-NNN` where NNN is a zero-padded sequential number starting at 001. IDs are assigned in chronological order and never reused, even if a decision is later superseded.

Examples: `D-001`, `D-042`, `D-117`

## Decision Record Structure

Each decision is documented with the following fields:

| Field | Required | Description |
|-------|----------|-------------|
| **ID** | Yes | The D-ID (e.g., `D-003`) |
| **Date** | Yes | Date the decision was made (YYYY-MM-DD) |
| **Summary** | Yes | One-line description of what was decided |
| **Rationale** | Strategic: Yes, Tactical: No | Why this option was chosen over alternatives |
| **Source** | Yes | One of: `human`, `agent`, `brainstorming-session`, `quality-gate` |
| **Affects** | Strategic: Yes, Tactical: No | List of downstream artifact types and specific IDs that this decision impacts |
| **Status** | Yes | One of: `proposed`, `accepted`, `implemented`, `verified` |

### Status Lifecycle

```
proposed → accepted → implemented → verified
```

- **proposed**: Decision has been identified and documented but not yet approved. Used in collaborative/guided autonomy modes where human approval is needed.
- **accepted**: Decision has been approved (by orchestrator in auto mode, or by human in guided/collaborative mode). Work may proceed based on this decision.
- **implemented**: The decision has been realized in code, architecture, or other artifacts. The implementing agent updates the status when the relevant story or artifact is complete.
- **verified**: The reviewer has confirmed that the implementation correctly reflects the decision. Updated during code review.

In auto mode, most decisions skip `proposed` and are logged directly as `accepted` since the orchestrator resolves them immediately.

### Affects Format

The `Affects` field uses artifact-type:identifier notation:

- `PRD:NFR-3` -- a specific non-functional requirement in the PRD
- `PRD:FR-12` -- a specific functional requirement in the PRD
- `ARCH:frontend-strategy` -- a named section or component in the architecture document
- `ARCH:data-model` -- the data model section of the architecture
- `Stories:1-*` -- all stories in Epic 1
- `Stories:2-3` -- story 3 of Epic 2 specifically
- `Context:conventions` -- the conventions section of project context

Multiple affected artifacts are comma-separated: `PRD:NFR-3, ARCH:frontend-strategy, Stories:1-*`

## How Agents CREATE Decisions

### Strategic Decisions (Full Record)

When an agent encounters or resolves a strategic decision (per the classification framework in `methodology/decision-classification.md`), the agent:

1. Assigns the next available D-ID by checking the current highest ID in `artifacts/context/decision-log.md`
2. Writes a full record to the decision log with all fields populated
3. Adds a row to the quick-reference table at the top of the log
4. References the D-ID in any artifact being created or modified as a result of the decision

### Tactical Decisions (Lightweight Record)

When an agent auto-resolves a tactical decision, the agent:

1. Assigns the next available D-ID
2. Writes a single-line entry to the decision log (ID, date, summary, source, status)
3. No rationale, affects, or detailed documentation is required -- the summary should be self-explanatory

Both types get D-IDs. The difference is documentation depth, not whether the decision is tracked.

## How Agents REFERENCE Decisions

When creating or modifying downstream artifacts, agents tag sections, requirements, and components with the D-IDs they implement. This creates the forward link from "decision" to "implementation."

### In PRD Requirements

```markdown
### FR-12: User authentication via OAuth2 (implements D-003)
Users must be able to authenticate using Google or GitHub OAuth2 providers.
```

### In Architecture Documents

```markdown
## Authentication Strategy (implements D-003, D-007)
The system uses OAuth2 with PKCE flow for all client authentication...
```

### In Story Files

```markdown
## Acceptance Criteria
- Given a user clicks "Sign in with Google" (implements D-003)
  - When the OAuth flow completes successfully
  - Then the user is authenticated and redirected to the dashboard
```

### In Code (Comments for Non-Obvious Decisions)

```javascript
// D-015: Rate limiting at 100 req/min per user, not per IP
const rateLimiter = createRateLimiter({ windowMs: 60000, max: 100, keyGenerator: (req) => req.user.id });
```

Code comments referencing D-IDs should be used sparingly -- only when the decision is non-obvious and a future developer might reasonably change the behavior without realizing it contradicts a logged decision.

## How the REVIEWER Enforces Traceability

During code review, the reviewer performs decision traceability checks as part of the standard review process:

### Forward Traceability (Decision to Implementation)

1. Read the story file and identify all referenced D-IDs
2. For each D-ID, verify the implementation correctly reflects the decision as logged in `artifacts/context/decision-log.md`
3. Flag any implementation that contradicts a referenced decision as a **high-severity finding**

### Backward Traceability (Implementation to Decision)

1. Check for significant implementation choices that are not backed by a logged decision
2. If the developer made a strategic-level decision during implementation without logging a D-ID, flag it as a **medium-severity finding**
3. Verify that any new D-IDs created during implementation are properly documented in the decision log

### Status Updates

1. When approving a review, update the status of all verified D-IDs from `implemented` to `verified` in the decision log
2. When rejecting for decision violations, note which D-IDs were contradicted in the review report

### Review Report Section

Each review report should include a "Decision Traceability" section:

```markdown
## Decision Traceability
- **D-003**: Verified -- OAuth2 implementation matches decision record
- **D-007**: Verified -- PKCE flow used as specified
- **D-015**: VIOLATION -- Rate limiting uses IP-based keys, contradicting D-015 which specifies user-based keys
- **New decisions**: D-042 logged during implementation (tactical, reasonable)
```

## Decision Supersession

When a decision is reversed or replaced:

1. Update the original decision's status to `superseded`
2. Add a note to the original record: `Superseded by D-XXX`
3. Create a new decision record with its own D-ID explaining the reversal
4. Update all affected artifacts to reference the new D-ID

Never delete or modify the original rationale of a superseded decision. The history is valuable context.

## Quality Criteria

- Every strategic decision has a D-ID and full record
- Every tactical decision has a D-ID and a one-line record
- All downstream artifacts reference the D-IDs they implement
- The reviewer verifies D-ID compliance during every code review
- No decision exists only in prose -- if it matters enough to affect implementation, it has a D-ID
