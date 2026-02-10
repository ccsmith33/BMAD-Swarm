# Artifact Schema: Architecture Document

The architecture document translates PRD requirements into technical design. It is the authoritative reference for all technology selections, system structure, data models, API contracts, and key design decisions. Developers and story engineers use this document to ensure implementation follows the intended design. Every architectural decision must trace to a PRD requirement.

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

- [ ] All required sections present with substantive content
- [ ] Every technology selection includes version and rationale
- [ ] All PRD entities are represented in data models
- [ ] Data model relationships include cardinality
- [ ] API endpoints include request/response schemas and error codes
- [ ] Auth strategy is fully designed (not just named)
- [ ] Project structure defines directory layout and conventions
- [ ] Key decisions follow ADR format with alternatives and tradeoffs
- [ ] Every architectural element traces to a PRD requirement
- [ ] No architectural components exist without a PRD justification
