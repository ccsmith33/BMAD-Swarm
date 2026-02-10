# Artifact Schema: Product Brief

The product brief captures the initial product vision, target audience, and scope boundaries. It is produced during the Exploration phase and serves as the foundation for the PRD. The brief is concise by design -- it answers "what are we building and why" without diving into detailed requirements.

## Expected Structure

```markdown
# Product Brief: [Product Name]

## Vision Statement
[2-3 sentences describing what this product is and why it matters]

## Problem Statement
[What problem does this solve? Who has this problem? Why do existing solutions fall short?]

## Target Users
### Primary Users
[Who is the primary user? What are their characteristics, goals, and constraints?]

### Secondary Users (if applicable)
[Other user types who interact with the system]

## Key Differentiators
[What makes this product different from existing solutions? Why will users choose this?]
- [Differentiator 1]
- [Differentiator 2]
- [Differentiator 3]

## Core Capabilities
[High-level feature areas, not detailed requirements]
- [Capability 1]: [Brief description]
- [Capability 2]: [Brief description]
- [Capability 3]: [Brief description]

## Success Metrics
[How will we know the product is succeeding?]
- [Metric 1]: [Target]
- [Metric 2]: [Target]

## Scope Boundaries
### In Scope (MVP)
- [What the first version will include]

### Out of Scope
- [What is explicitly excluded from initial scope]

## Risks and Open Questions
- [Risk or unknown 1]
- [Risk or unknown 2]

## Decisions Made
Decisions from the brainstorming session, tracked with D-IDs per `methodology/decision-traceability.md`.

| D-ID | Decision | Source | Affects |
|------|----------|--------|---------|
| D-001 | [Decision summary] | [brainstorming-session / human] | [Downstream artifacts] |

### D-001: [Decision summary]
- **Rationale**: [Why this was decided]
- **Affects**: [What downstream artifacts this impacts]
- **Status**: accepted

## Alternatives Considered
For each major decision, what other options were discussed and why they were not chosen.

### [Decision topic]
- **Chosen**: [What was decided]
- **Alternative A**: [Description] -- rejected because [reason]
- **Alternative B**: [Description] -- rejected because [reason]

## Assumptions
Explicit assumptions the product brief depends on.

| Assumption | Status | Impact if Wrong |
|------------|--------|-----------------|
| [Assumption 1] | [validated / assumed / unknown] | [What changes if this is wrong] |
```

## Section Guidelines

### Vision Statement
- Must be concise (2-3 sentences maximum)
- Must articulate the core value proposition
- Should be understandable by someone with no context about the project

**Adequate**: "FreelanceMusic is a marketplace connecting independent musicians with clients who need custom music. It eliminates the overhead of traditional music licensing by enabling direct artist-client collaboration with transparent pricing."

**Inadequate**: "We're building something for music." (Too vague, no value proposition)

### Problem Statement
- Must name a specific, real problem
- Must identify who experiences this problem
- Must explain why current solutions are insufficient
- Should not propose the solution (that comes in capabilities)

**Adequate**: "Small businesses and content creators struggle to find affordable, original music for their projects. Stock music libraries are generic and expensive. Hiring musicians directly requires industry connections and negotiation skills most clients lack."

**Inadequate**: "People need music." (No specificity, no gap analysis)

### Target Users
- Must describe concrete user personas, not abstract demographics
- Must include goals and constraints, not just who they are
- Avoid generic descriptions that could apply to anyone

**Adequate**: "Content creators who produce YouTube videos, podcasts, or social media content. They need music that fits specific moods and lengths, typically have budgets under $200 per track, and lack music industry connections."

**Inadequate**: "Users who want music." (No persona depth, no constraints)

### Core Capabilities
- Must be high-level feature areas, not detailed requirements
- Each capability should map to a user need
- Should cover the breadth of the product without going deep

**Adequate**: "Music Discovery: Users can search and filter music by genre, mood, tempo, duration, and licensing terms."

**Inadequate**: "The system will have a search bar with autocomplete that queries Elasticsearch." (Implementation detail, not capability)

### Success Metrics
- Must be measurable outcomes, not activities
- Should include targets with specific numbers
- Should relate to the business value described in the vision

**Adequate**: "Artist signup rate: 50 active artists within 3 months of launch"

**Inadequate**: "The product should be successful." (Not measurable)

### Scope Boundaries
- Must explicitly state what is excluded to prevent scope creep
- MVP scope should be achievable and deliver core value
- Out-of-scope items should include things a reader might reasonably expect

**Adequate**: "Out of Scope: Mobile applications (web-responsive only for MVP), live streaming performances, music production tools"

**Inadequate**: No out-of-scope section at all (leaves scope ambiguous)

## Quality Checklist

- [ ] Vision is concise and articulates the core value
- [ ] Problem statement names a specific problem with specific affected users
- [ ] Target users are described with enough detail to inform design decisions
- [ ] At least 2 key differentiators are identified
- [ ] Core capabilities cover the product breadth at high level
- [ ] Success metrics are measurable with specific targets
- [ ] Scope boundaries explicitly state what is and is not included
- [ ] Risks and open questions acknowledge known unknowns
- [ ] All significant decisions have D-IDs and are logged in the decision log
- [ ] Alternatives considered are documented for each major decision
- [ ] Assumptions are listed with validation status and impact-if-wrong
