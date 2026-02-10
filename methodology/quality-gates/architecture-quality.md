# Architecture Quality Gate

Validation criteria for Architecture Documents. The architecture translates product requirements into technical design. Failures here result in stories that lack implementation guidance, developers making ad-hoc design decisions, and systems that don't meet NFR targets.

## Required Sections

The architecture document must contain all of the following sections with substantive content:

- [ ] **Technology Stack** - Language, framework, database, key libraries with version constraints and selection rationale
- [ ] **System Architecture** - High-level component diagram or description showing system boundaries, service interactions, and data flow
- [ ] **Data Models** - Entity definitions with attributes, relationships, and constraints; database schema design
- [ ] **API Design** - Endpoint definitions with HTTP methods, paths, request/response schemas, and error handling patterns
- [ ] **Authentication & Authorization** - How users authenticate, how permissions are enforced, session/token strategy
- [ ] **Infrastructure & Deployment** - Hosting environment, CI/CD approach, environment strategy (dev/staging/prod)
- [ ] **Project Structure** - Directory layout, file organization conventions, module boundaries
- [ ] **Key Architectural Decisions** - At least the most significant decisions with rationale and rejected alternatives

### Conditional Sections

- [ ] **Third-Party Integrations** - Required when the system integrates with external services. Must include API contracts, error handling, and fallback strategies.
- [ ] **Scaling Strategy** - Required when NFRs include concurrency or growth targets. Must describe horizontal/vertical scaling approach.
- [ ] **Security Architecture** - Required when the project handles sensitive data or operates in a regulated domain. Must address threat model and mitigation strategies.

## Quality Standards

### Technology Selection Quality

Each technology choice must:

- [ ] **Have rationale**: Explains why this technology was selected over alternatives
- [ ] **Address a requirement**: Links to a specific PRD requirement or constraint it satisfies
- [ ] **Include version**: Specifies a version or version range (not "latest")
- [ ] **Be consistent**: Does not conflict with other technology choices in the stack

### Data Model Quality

- [ ] **Complete entities**: All entities referenced in PRD user journeys are modeled
- [ ] **Defined relationships**: Cardinality (1:1, 1:N, N:M) is specified for each relationship
- [ ] **Constraints documented**: Required fields, unique constraints, valid ranges are noted
- [ ] **Indexing strategy**: Indicates which fields need indexes for query performance
- [ ] **No over-engineering**: Model complexity matches the requirements (not more)

### API Design Quality

- [ ] **RESTful or consistent style**: Follows a consistent API design pattern throughout
- [ ] **Complete contract**: Each endpoint has method, path, request schema, response schema, and error codes
- [ ] **Authentication noted**: Each endpoint indicates authentication requirements
- [ ] **Versioning strategy**: How API versions are handled (if applicable)
- [ ] **Error format**: Consistent error response structure defined

### Architectural Decision Quality

Each key decision must include:

- [ ] **Context**: What situation or requirement prompted this decision
- [ ] **Decision**: What was decided
- [ ] **Rationale**: Why this option was chosen
- [ ] **Alternatives considered**: What other options were evaluated
- [ ] **Consequences**: Known tradeoffs or implications of the decision

### PRD Alignment

- [ ] **FR coverage**: Every functional requirement in the PRD has a corresponding architectural element that supports it
- [ ] **NFR strategies**: Every non-functional requirement has an explicit architectural strategy (caching for performance, connection pooling for concurrency, etc.)
- [ ] **No orphan architecture**: No architectural components exist that don't serve a PRD requirement
- [ ] **No scope expansion**: Architecture does not introduce features or capabilities not in the PRD

## Common Failures to Check For

- **Resume-driven architecture**: Choosing technologies because they are trendy rather than appropriate for the requirements
- **Astronaut architecture**: Over-engineered design with abstractions, patterns, and infrastructure beyond what the requirements demand
- **Missing error strategies**: API design shows happy paths but no error handling patterns
- **Implicit security**: Authentication and authorization are mentioned but not designed (e.g., "we'll use JWT" without specifying token lifecycle, refresh strategy, or permission model)
- **Database-as-afterthought**: Data models are vague or incomplete, leaving schema design to the developer
- **Missing deployment story**: Architecture describes runtime behavior but not how the system gets deployed, configured, or monitored
- **Unresolved contradictions**: Architecture makes decisions that conflict with stated constraints (e.g., "serverless" but requires WebSocket connections)
- **Copy-paste infrastructure**: Infrastructure design from a template without tailoring to project requirements (e.g., Kubernetes for a simple API)
- **Missing project structure**: No directory layout or file organization conventions, forcing developers to invent their own

## Pass/Fail Criteria

**PASS** when:
- All required sections present with substantive content
- All technology selections have rationale and version constraints
- Data models cover all entities from PRD user journeys
- API contracts are complete with request/response schemas
- Authentication and authorization are fully designed
- Key architectural decisions have documented rationale
- All PRD functional requirements have architectural support
- All PRD non-functional requirements have explicit strategies
- No critical common failures detected

**FAIL** when:
- Any required section is missing or placeholder-only
- Technology selections lack rationale or version constraints
- Data models are incomplete or missing entities
- API contracts lack request/response schemas
- Auth design is mentioned but not specified
- Architectural decisions lack rationale
- PRD requirements have no corresponding architectural support
- Critical common failures detected (contradictions, missing security design)

## Validation Process

1. Check section completeness
2. Validate technology selections for rationale and consistency
3. Validate data models for completeness and relationship definitions
4. Validate API contracts for completeness
5. Validate auth design for specificity
6. Cross-reference every PRD FR against architecture components
7. Cross-reference every PRD NFR against architecture strategies
8. Check for common failures
9. Produce validation report with pass/fail and findings
