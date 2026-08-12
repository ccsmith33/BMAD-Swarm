<!-- bmad-generated:78cf2200 -->
# Artifact Schema: Architecture Document

The architecture document translates PRD requirements into technical design. It is the authoritative reference for all technology selections, system structure, data models, API contracts, and key design decisions. Developers and the strategist (during story decomposition) use this document to ensure implementation follows the intended design. Every architectural decision must trace to a PRD requirement.

## Expected Structure

```markdown
# Architecture Document - [Product Name]

## 1. Technology Stack

### Core Technologies
| Technology | Version | Purpose | Rationale |
|-----------|---------|---------|-----------|
| [Language] | [Version] | [What it's used for] | [Why chosen] |
| [Framework] | [Version] | [What it's used for] | [Why chosen] |
| [Database] | [Version] | [What it's used for] | [Why chosen] |

### Development Tools
| Tool | Purpose |
|------|---------|
| [Tool] | [What it's used for] |

### Key Libraries
| Library | Version | Purpose |
|---------|---------|---------|
| [Library] | [Version] | [What it's used for] |

## 2. System Architecture

### Architecture Style
[Monolithic / Microservices / Serverless / Modular monolith / etc.]
[Rationale for this choice]

### Component Diagram
[Description or ASCII diagram showing major system components and their interactions]

### Data Flow
[How data moves through the system for primary use cases]

## 3. Project Structure

```
[directory-tree]
```

### Conventions
- [Naming convention for files]
- [Module organization rules]
- [Import/export patterns]

## 4. Data Models

### [Entity Name]
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| [field] | [type] | [constraints] | [description] |

**Relationships**: [Describe relationships to other entities]
**Indexes**: [List indexes needed for query performance]

## 5. API Design

### [Endpoint Group]

#### [HTTP Method] [Path]
**Purpose**: [What this endpoint does]
**Auth**: [Required / Public]
**Request**:
```json
{
  "field": "type - description"
}
```
**Response (200)**:
```json
{
  "field": "type - description"
}
```
**Errors**: [Error codes and conditions]

## 6. Authentication & Authorization

### Authentication Strategy
[How users authenticate - session, JWT, OAuth, etc.]
[Token lifecycle - creation, refresh, expiration]

### Authorization Model
[How permissions are enforced - RBAC, ABAC, etc.]
[Role definitions and their permissions]

## 7. Infrastructure & Deployment

### Hosting
[Where and how the application runs]

### Environments
[Dev, staging, production configurations]

### CI/CD
[Build, test, deploy pipeline]

## 8. Key Architectural Decisions

### ADR-001: [Decision Title]
**Context**: [What situation prompted this decision]
**Decision**: [What was decided]
**Rationale**: [Why this option]
**Alternatives**: [What else was considered]
**Consequences**: [Tradeoffs and implications]
```

## Delta Architecture Variant

The full section set above is required for a **product architecture** (greenfield / full-lifecycle output). The majority brownfield case — a feature, migration, or retrofit that extends an existing system (the `/feature`, `/migrate`, and retrofit-team outputs) — produces a **delta architecture** instead. A delta architecture documents only what changes, and declares itself with a `**Scope:** delta` line in its header block.

A delta architecture is NOT required to restate the greenfield product sections (Technology Stack, Data Models, etc. — those live in the existing product architecture). It requires only:

- A `**Scope:** delta` discriminator in the header block.
- An **Overview** section describing the change and its blast radius.
- Explicit decision references (`ADR-NNN` or `D-NNN`) tracing the delta to its decisions.

### Expected Structure (delta)

```markdown
# Architecture Delta - [Feature or Change Name]

**Scope:** delta

## Overview
[What is changing and why; which existing components/data models/APIs are touched;
 the blast radius of the change. Reference the decisions that drove it: ADR-012, D-041.]

## [Additional sections as needed]
[Only the sections the change actually affects — e.g. a new endpoint under API Design,
 a schema migration under Data Models. Omit sections the delta does not touch.]
```

A delta architecture that carries `**Scope:** delta`, an `## Overview` section, and at least one `ADR-NNN`/`D-NNN` reference satisfies this schema. Product architectures (no `Scope: delta` line) are held to the full section set above.

## Section Guidelines

### Technology Stack
- Every technology must include a version constraint (not "latest")
- Every selection must have a rationale explaining why it was chosen
- Rationale should reference PRD requirements or project constraints where applicable

**Adequate**:

| Technology | Version | Purpose | Rationale |
|-----------|---------|---------|-----------|
| Node.js | >= 18 | Runtime | Required for ES modules support; team familiarity; strong async I/O for API workload |
| PostgreSQL | 15.x | Primary database | Relational model fits structured data in PRD entities; JSONB for flexible fields; proven scaling |

**Inadequate**: "We'll use Node.js and Postgres." (No versions, no rationale)

### Data Models
- Every entity referenced in PRD user journeys must be modeled
- Relationships must specify cardinality (1:1, 1:N, N:M)
- Fields must have types and constraints (not null, unique, default values)
- Indexes must be specified for fields used in queries and lookups

**Adequate**:
```
### User
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login credential |
| password_hash | VARCHAR(255) | NOT NULL | Bcrypt hash |
| role | ENUM('artist','client','admin') | NOT NULL, DEFAULT 'client' | Authorization role |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Account creation time |

Relationships: User 1:N Track (artist), User 1:N Order (client)
Indexes: email (unique), role (btree)
```

**Inadequate**: "Users have an email and password." (No field types, no constraints, no relationships)

### API Design
- Each endpoint must include method, path, purpose, auth requirements, request schema, response schema, and error codes
- Consistent URL patterns and naming conventions across all endpoints
- Error responses must follow a uniform format

**Adequate**:
```
#### POST /api/auth/login
Purpose: Authenticate user and return access token
Auth: Public
Request:
  { "email": "string", "password": "string" }
Response (200):
  { "token": "string", "user": { "id": "uuid", "email": "string", "role": "string" } }
Errors:
  401 - Invalid credentials
  422 - Missing required fields
  429 - Rate limited (>5 attempts per minute)
```

**Inadequate**: "POST /login - logs in the user" (No schema, no errors, no auth specification)

### Architectural Decisions
- Must follow ADR format with Context, Decision, Rationale, Alternatives, and Consequences
- Each significant decision that a developer might question should be documented
- Consequences must honestly state tradeoffs, not just benefits

**Adequate**: "ADR-001: Monolithic Architecture. Context: MVP with small team and straightforward data model. Decision: Single deployable application. Rationale: Simplest deployment, fastest iteration, no distributed system complexity. Alternatives: Microservices (rejected: premature for MVP scale), serverless (rejected: cold start latency unacceptable for real-time features). Consequences: Will need to refactor if scaling beyond single-server capacity; all components share deployment lifecycle."

**Inadequate**: "We chose monolith because it's good." (No context, no alternatives, no consequences)

## Quality Checklist

- [ ] All required sections present with substantive content (product architecture), or `Scope: delta` + Overview + decision references (delta architecture)
- [ ] Every technology selection includes version and rationale
- [ ] All PRD entities are represented in data models
- [ ] Data model relationships include cardinality
- [ ] Data models note required/unique constraints and an indexing strategy
- [ ] API endpoints include request/response schemas and error codes
- [ ] Auth strategy is fully designed (not just named) — token lifecycle, refresh, permission model
- [ ] Project structure defines directory layout and conventions
- [ ] Key decisions follow ADR format with alternatives and tradeoffs
- [ ] Every functional requirement has a corresponding architectural element
- [ ] Every non-functional requirement has an explicit architectural strategy (caching, pooling, etc.)
- [ ] No architectural components exist without a PRD justification (no orphan architecture, no scope expansion)

## Common Failures to Check For

(Folded from the former `quality-gates/architecture-quality.md`, which is retired — this schema is the single source.)

- **Resume-driven architecture**: technologies chosen for trendiness, not fit
- **Astronaut architecture**: over-engineered abstractions and infrastructure beyond the requirements
- **Missing error strategies**: API design shows happy paths but no error-handling patterns
- **Implicit security**: auth "mentioned but not designed" (e.g. "we'll use JWT" with no lifecycle or permission model)
- **Database-as-afterthought**: vague or incomplete data models that push schema design onto the developer
- **Missing deployment story**: runtime behavior described, but not how the system deploys, configures, or is monitored
- **Unresolved contradictions**: decisions that conflict with stated constraints (e.g. "serverless" but needs persistent WebSockets)

## ADR Readiness Reference

(Folded from the former `quality-gates/adr-readiness.md`. A **reference checklist**, not a rigid gate — the architect applies the criteria relevant to the project type and notes why any skipped criterion does not apply; the reviewer validates that the selection was reasonable. Not every criterion applies to every project.)

- **Testability & automation**: test strategy and boundaries defined; CI runs and blocks on tests; contract tests planned for service/API integrations.
- **Test data strategy**: how test data is created and cleaned up; no production-data dependency; migration testing plan; multi-tenant isolation where relevant.
- **Scalability & availability**: concurrency model and limits; horizontal-scaling and database-scaling approach where NFRs require; availability target with redundancy/failover/health-check implications; graceful degradation for dependency failures.
- **Disaster recovery**: backup frequency/retention/restore; RTO and RPO defined and supported by the backup plan; failover procedure; post-recovery data-integrity verification.
- **Security**: authentication mechanism fully designed; authorization model with enforcement points; encryption at rest/in transit and key management; secrets management (no hardcoded/committed secrets); input-validation strategy; dependency scanning in CI.
- **Observability & debugging**: logging strategy (levels, structured format); error tracking/alerting; request tracing/correlation IDs for multi-service paths; health-check endpoints; key metrics identified.
- **Quality of service**: p50/p95/p99 response-time targets; throughput targets; rate limiting on client-facing APIs; timeout strategy (no unbounded waits); retry and circuit-breaker patterns for unreliable dependencies.
- **Deployability**: deployment strategy (rolling/blue-green/canary); environment parity; configuration management without code changes; zero-downtime deploys where availability targets require; documented rollback (including DB); feature flags for gradual rollout where needed.
