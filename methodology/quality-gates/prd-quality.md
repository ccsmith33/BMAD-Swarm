# PRD Quality Gate

Validation criteria for Product Requirements Documents. The PRD is the foundation of all downstream work -- quality failures here cascade into architecture, stories, and code.

## Required Sections

The PRD must contain all of the following sections with substantive content (not placeholders):

- [ ] **Executive Summary** - Product vision, key differentiator, and target users stated clearly in 2-4 paragraphs
- [ ] **Success Criteria** - At least 3 measurable outcomes with specific targets and measurement methods
- [ ] **Product Scope** - At minimum an MVP phase with clearly bounded feature set; growth and vision phases recommended
- [ ] **User Journeys** - At least 2 complete user journeys covering primary use cases with step-by-step flows
- [ ] **Functional Requirements** - Numbered list of capabilities the system must provide
- [ ] **Non-Functional Requirements** - Performance, security, scalability, and reliability requirements with measurable targets

### Conditional Sections

- [ ] **Domain Requirements** - Required when the project operates in a regulated domain (healthcare, finance, government, e-commerce). Must include specific compliance standards.
- [ ] **Innovation Analysis** - Required when the project has direct competitors. Must articulate differentiation.

## Quality Standards

### Functional Requirements Quality

Each functional requirement must pass ALL of these checks:

- [ ] **Specific**: Describes a single, clearly defined capability (not a compound requirement)
- [ ] **Testable**: Can be verified with a concrete test scenario (not subjective language)
- [ ] **Capability-focused**: Describes what users can do, not how the system implements it
- [ ] **No subjective adjectives**: Free of "easy", "intuitive", "user-friendly", "fast", "responsive" without quantification
- [ ] **No implementation leakage**: Free of technology names, library references, or implementation details
- [ ] **No vague quantifiers**: Uses specific numbers instead of "multiple", "several", "various"
- [ ] **Traceable**: Can be linked to a user journey or business objective stated in the PRD

### Non-Functional Requirements Quality

Each NFR must pass ALL of these checks:

- [ ] **Measurable**: Includes a specific numeric target (e.g., "under 200ms", "99.9% uptime")
- [ ] **Contextualized**: Specifies the conditions under which the target applies (e.g., "under normal load", "for 95th percentile")
- [ ] **Measurement method**: States how the metric will be measured or verified
- [ ] **Realistic**: Target is achievable given the project's constraints and scope

### Success Criteria Quality

Each success criterion must pass these checks:

- [ ] **SMART**: Specific, Measurable, Attainable, Relevant, and Time-bound (or Traceable)
- [ ] **Outcome-focused**: Describes a business or user outcome, not a technical output
- [ ] **Verifiable**: Can be objectively evaluated as met or not met

### User Journey Quality

Each user journey must include:

- [ ] **User persona**: Who is performing the journey
- [ ] **Goal**: What the user is trying to accomplish
- [ ] **Steps**: Ordered sequence of user actions and system responses
- [ ] **Happy path**: The primary flow when everything works correctly
- [ ] **Error paths**: At least one alternative flow for error or edge case scenarios

### Scope Quality

- [ ] **Clear boundaries**: Explicitly states what is IN scope and what is OUT of scope
- [ ] **MVP focus**: MVP scope is achievable and delivers core value without unnecessary features
- [ ] **Prioritization**: Features or requirements are prioritized (must-have vs. nice-to-have)

## Common Failures to Check For

- **Wishful thinking**: Requirements that sound impressive but are unmeasurable ("AI-powered insights", "seamless experience")
- **Kitchen sink scope**: MVP that tries to include everything, making it unachievable
- **Missing error flows**: Only happy-path scenarios described, no consideration of failures
- **Copy-paste requirements**: Generic NFRs not tailored to the specific project (e.g., "99.999% uptime" for a hobby project)
- **Orphan requirements**: FRs that don't trace to any user journey or business need
- **Assumption gaps**: Implicit assumptions about infrastructure, third-party services, or user behavior that are never stated
- **Duplicate requirements**: Same capability expressed differently in multiple places
- **Contradictions**: Requirements that conflict with each other or with stated constraints

## Pass/Fail Criteria

**PASS** when:
- All required sections are present with substantive content
- At least 80% of functional requirements pass all quality checks
- All non-functional requirements have measurable targets
- All success criteria are SMART
- At least 2 complete user journeys with happy and error paths
- No critical common failures detected

**FAIL** when:
- Any required section is missing or contains only placeholder text
- More than 20% of functional requirements fail quality checks
- Any non-functional requirement lacks a measurable target
- Success criteria are vague or unmeasurable
- User journeys cover only happy paths with no error consideration
- Critical common failures detected (contradictions, orphan requirements)

## Validation Process

1. Check section completeness (all required sections present)
2. Validate each FR against quality checks
3. Validate each NFR against quality checks
4. Validate success criteria against SMART criteria
5. Validate user journeys for completeness
6. Check for common failures
7. Produce a validation report with pass/fail and specific findings
