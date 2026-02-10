# Artifact Schema: Project Context

The project context file is a living document that provides AI agents with critical information about the project's current state, conventions, and patterns. It focuses on unobvious details that agents might otherwise miss or get wrong. This file is maintained by the orchestrator and updated as the project evolves.

## Expected Structure

```markdown
# Project Context

## Identity
- **Project**: [Name]
- **Type**: [web-app | api | cli | library | mobile | monorepo]
- **Stack**: [Primary language, framework, database, key dependencies]
- **Repository**: [Repo location or path]

## Technology Stack & Versions
| Technology | Version | Notes |
|-----------|---------|-------|
| [Technology] | [Exact version] | [Important constraints or configuration] |

## Architecture
- **Style**: [Monolithic, microservices, serverless, etc.]
- **Structure**: [Brief description of directory layout]
- **Key directories**:
  - `src/` - [What's in here]
  - `tests/` - [What's in here]
  - `config/` - [What's in here]

## Conventions

### Naming
- Files: [Convention, e.g., kebab-case.js]
- Functions: [Convention, e.g., camelCase]
- Classes: [Convention, e.g., PascalCase]
- Database: [Convention, e.g., snake_case tables and columns]

### Code Patterns
- [Pattern 1]: [Description and example]
- [Pattern 2]: [Description and example]

### Testing
- Framework: [Test framework and runner]
- Pattern: [How tests are organized and named]
- Fixtures: [Where test data lives and how it's managed]

## Critical Implementation Rules
[Rules that agents MUST follow. Focus on non-obvious details.]

- **Rule 1**: [Specific rule with rationale]
- **Rule 2**: [Specific rule with rationale]

## Current State
- **Phase**: [exploration | definition | design | implementation | delivery]
- **Active work**: [What's currently being built or changed]
- **Completed**: [Epics/stories/milestones already done]
- **Known issues**: [Blockers, tech debt, open questions]

## Decision Log
| Date | Decision | Rationale |
|------|----------|-----------|
| [date] | [What was decided] | [Why] |

## Agent Notes
[Observations and learnings recorded by agents during their work]
- [agent]: [Pattern, learning, or observation]
```

## Section Guidelines

### Identity
- Must accurately reflect the current project type and stack
- Stack should list the primary technologies, not every dependency
- For brownfield projects, this is populated by the initial scan

### Technology Stack & Versions
- Must include exact versions, not ranges or "latest"
- Notes should capture important configuration details or version-specific behaviors
- Keep this updated as dependencies change

**Adequate**:

| Technology | Version | Notes |
|-----------|---------|-------|
| Node.js | 18.17.0 | Using ES modules (type: module in package.json) |
| Express | 4.18.2 | Custom error handler middleware in src/middleware/error-handler.js |
| PostgreSQL | 15.4 | Using JSONB columns for flexible metadata; see migration files |
| Prisma | 5.7.0 | Schema at prisma/schema.prisma; run `npx prisma migrate dev` after changes |

**Inadequate**: "We use Node and Express." (No versions, no useful details)

### Conventions
- Focus on conventions that are non-obvious or project-specific
- Include examples where the convention might be ambiguous
- Cover naming, file organization, import patterns, error handling patterns

**Adequate**: "Error handling: All route handlers wrap async operations in the `asyncHandler` utility (src/utils/async-handler.js). Never use raw try/catch in route handlers. Errors are thrown as `AppError` instances with HTTP status codes. The global error handler in src/middleware/error-handler.js handles formatting."

**Inadequate**: "Follow standard conventions." (Not actionable, different agents have different ideas of "standard")

### Critical Implementation Rules
- These are the most important part of the project context
- Each rule should prevent a specific, likely mistake
- Rules should be stated as clear directives, not suggestions
- Include the rationale so agents understand why the rule exists

**Adequate**: "Never import from `src/` using relative paths that traverse up more than one directory. Use the path alias `@/` which maps to `src/`. Rationale: Deep relative imports (../../..) break when files move and are hard to read."

**Inadequate**: "Write good code." (Not a specific rule)

### Current State
- Must accurately reflect what phase the project is in
- Active work should name specific stories or tasks
- Known issues should include anything that might affect an agent's work
- This section is updated frequently by the orchestrator

### Decision Log
- Records significant decisions made during the project
- Each entry includes what was decided and why
- Helps agents understand the history behind current patterns
- Prevents agents from re-litigating settled decisions

### Agent Notes
- Populated by agents as they work
- Captures patterns, learnings, and gotchas discovered during implementation
- Forward-feeds context to future agents working on the same project

## Quality Checklist

- [ ] Identity section accurately reflects project type and stack
- [ ] Technology versions are exact (not ranges or "latest")
- [ ] Architecture section describes directory structure
- [ ] Conventions cover naming, code patterns, and testing
- [ ] Critical implementation rules are specific and actionable
- [ ] Current state reflects the actual project phase and active work
- [ ] Decision log captures significant decisions with rationale
- [ ] Content focuses on non-obvious details agents would miss
- [ ] No generic advice (every rule is project-specific)
