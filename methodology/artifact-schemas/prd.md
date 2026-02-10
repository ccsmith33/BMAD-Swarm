# Artifact Schema: Product Requirements Document (PRD)

The PRD is the authoritative source of what to build. It drives architecture, epic/story creation, and implementation decisions. The PRD must serve dual audiences: human stakeholders who review and approve it, and LLM agents who consume it for downstream work. Every requirement must be specific, measurable, and traceable to a user need.

## Expected Structure

```markdown
# Product Requirements Document - [Product Name]

## 1. Executive Summary

### Product Vision
[2-3 paragraphs: What is this product? Who is it for? Why does it matter?]

### Key Differentiators
[What makes this product uniquely valuable compared to alternatives?]

### Target Users
[Primary and secondary user personas with goals and constraints]

## 2. Success Criteria

| Criterion | Target | Measurement Method | Timeline |
|-----------|--------|-------------------|----------|
| [Outcome] | [Specific target] | [How measured] | [When] |

## 3. Product Scope

### MVP (Phase 1)
[Features included in the minimum viable product]

### Growth (Phase 2)
[Features planned for post-MVP expansion]

### Vision (Phase 3)
[Long-term capabilities for the mature product]

## 4. User Journeys

### Journey 1: [Journey Name]
**User**: [Persona]
**Goal**: [What they want to accomplish]

1. [Step]: [Action] -> [System response]
2. [Step]: [Action] -> [System response]
...

**Error Paths**:
- [Condition]: [What happens]

### Journey 2: [Journey Name]
...

## 5. Functional Requirements

### FR-001: [Requirement Title]
[Specific, testable capability description]

### FR-002: [Requirement Title]
...

## 6. Non-Functional Requirements

### Performance
- NFR-P01: [Measurable performance target with conditions and measurement method]

### Security
- NFR-S01: [Security requirement with specific standard or target]

### Scalability
- NFR-SC01: [Scaling target with growth projections]

### Reliability
- NFR-R01: [Availability/durability target with measurement method]

## 7. Domain Requirements (if applicable)
[Industry-specific compliance, regulatory, or legal requirements]

## 8. Technical Constraints
[Known constraints on technology choices, infrastructure, or timeline]
```

## Section Guidelines

### Executive Summary
- Vision must articulate the core value proposition in 2-3 paragraphs
- Must name specific target users (personas, not demographics)
- Must explain competitive differentiation

### Success Criteria
- Each criterion must follow SMART format (Specific, Measurable, Attainable, Relevant, Time-bound)
- Must include the measurement method (how you'll know it's been achieved)
- Avoid vanity metrics; focus on outcomes that indicate real product value

**Adequate**:

| Criterion | Target | Measurement | Timeline |
|-----------|--------|-------------|----------|
| User retention | 40% monthly active users return within 30 days | Analytics | 6 months post-launch |

**Inadequate**: "The product should have good retention." (Not measurable, no target, no timeline)

### Functional Requirements
Each FR must be:
- **A capability, not an implementation**: "Users can filter search results by price range" not "Frontend sends filter params to /api/search endpoint"
- **Testable**: Can be converted to a test case with specific inputs and expected outputs
- **Specific**: Uses concrete values, not subjective adjectives
- **Singular**: Describes one capability per requirement (not compound)
- **Numbered**: Uses consistent IDs (FR-001, FR-002) for traceability

**Adequate**: "FR-012: Users can reset their password by requesting a reset link sent to their registered email address. The link expires after 24 hours. Using an expired link shows an error message and offers to send a new link."

**Inadequate**: "FR-012: The system should have good password management." (Vague, not testable, not a specific capability)

### Non-Functional Requirements
Each NFR must include:
- A specific numeric target
- The conditions under which the target applies
- How the metric will be measured

**Adequate**: "NFR-P01: API endpoints respond in under 200ms for the 95th percentile under normal load (up to 1,000 concurrent users), as measured by application performance monitoring."

**Inadequate**: "NFR-P01: The system should be fast." (No target, no conditions, no measurement)

### User Journeys
Each journey must include:
- A named user persona (not just "user")
- A specific goal
- Step-by-step flow with both user actions and system responses
- At least one error path showing what happens when things go wrong

**Adequate**:
```
Journey: First-time Artist Registration
User: Independent musician
Goal: Create an account and list their first track

1. Artist visits homepage -> sees "Join as Artist" CTA
2. Artist clicks CTA -> registration form with name, email, password, genre
3. Artist completes form -> email verification sent
4. Artist clicks email link -> account activated, redirected to dashboard
5. Artist clicks "Upload Track" -> upload form with title, genre, price, audio file
6. Artist completes upload -> track appears in their portfolio as "pending review"

Error Paths:
- Email already registered: Show "email in use" error with login link
- Invalid audio format: Show supported formats (MP3, WAV, FLAC) with file requirements
```

**Inadequate**: "Users sign up and add music." (No steps, no persona, no error paths)

## Quality Checklist

- [ ] All required sections are present with substantive content
- [ ] Executive summary clearly states vision, differentiation, and target users
- [ ] At least 3 success criteria with measurable targets and timelines
- [ ] Scope is phased (MVP at minimum) with clear boundaries
- [ ] At least 2 complete user journeys with error paths
- [ ] All FRs are testable, specific, and single-capability
- [ ] All NFRs have measurable targets with conditions and measurement methods
- [ ] No subjective adjectives without quantification
- [ ] No implementation details in functional requirements
- [ ] Requirements are numbered for traceability
- [ ] Domain requirements addressed if applicable
