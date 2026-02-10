# Artifact Schema: Lessons Learned

The lessons-learned file is a project-level knowledge base that captures actionable learnings from retrospectives, code reviews, and implementation experience. It is the institutional memory of the project -- a curated set of directives that prevent future agents from repeating past mistakes and reinforce patterns that have proven effective. This file is maintained by the retrospective agent and read by all agents before starting work.

## Expected Structure

```markdown
# Lessons Learned

## Coding Conventions

Conventions discovered or reinforced during implementation that are not obvious from the codebase alone.

- **[Convention name]**: [Clear directive describing the convention and how to follow it.]
  - Source: [Retrospective or review where this was identified]
  - Example: [Concrete code example or file reference if applicable]

## Test Patterns

Testing approaches that work well for this project and common testing mistakes to avoid.

- **[Pattern name]**: [Clear directive describing the pattern.]
  - Source: [Retrospective or review where this was identified]
  - Example: [Concrete example or file reference if applicable]

## Architecture Gotchas

Architectural decisions, constraints, or non-obvious behaviors that caused implementation friction.

- **[Gotcha name]**: [Clear directive describing what to watch out for and how to handle it.]
  - Source: [Retrospective or review where this was identified]

## Build & CI

Build system, CI pipeline, and environment issues that tripped up developers.

- **[Issue name]**: [Clear directive describing the issue and the workaround or fix.]
  - Source: [Retrospective or review where this was identified]

## Common Mistakes

Errors that appeared in multiple stories or review cycles. Each entry describes the mistake and the correct approach.

- **[Mistake name]**: [Description of the mistake and the correct approach to avoid it.]
  - Source: [Retrospective or review where this was identified]
  - Frequency: [How often this appeared, e.g., "3 of 5 stories in Epic 1"]

## Process Improvements

Changes to templates, checklists, or workflow that were recommended by retrospectives.

- **[Improvement name]**: [What changed and why.]
  - Source: [Retrospective where this was recommended]
  - Status: [implemented | pending]

## What Works Well

Practices and patterns that consistently led to clean implementations and first-pass review approvals.

- **[Practice name]**: [Description of the practice and why it works.]
  - Source: [Retrospective or review where this was identified]
```

## Section Guidelines

### Coding Conventions
- Capture conventions that agents would not infer from reading the codebase alone
- Each entry should be a clear directive, not a suggestion ("Use X" not "Consider using X")
- Include concrete examples where the convention might be ambiguous
- Do not duplicate conventions already documented in `project-context.md` -- this section is for conventions discovered during implementation that have not yet been added to project-context

**Adequate**: "**Async error propagation**: Always throw `AppError` instances from service-layer functions. Never catch and re-throw generic `Error` objects. The global error handler depends on `AppError.statusCode` to set the HTTP response code. Source: Epic 1 retrospective, observed in reviews for E1-S2, E1-S4."

**Inadequate**: "Handle errors properly." (Not specific, not actionable)

### Test Patterns
- Document testing patterns that produce reliable, maintainable tests for this specific project
- Include anti-patterns that led to review rejections
- Be specific about the testing framework and patterns in use

**Adequate**: "**Test database isolation**: Each integration test must use a transaction that rolls back after the test. Do not rely on `beforeAll` seed data. Source: Epic 1 retrospective. Tests in E1-S3 were flaky because they shared database state."

**Inadequate**: "Write good tests." (Not specific)

### Architecture Gotchas
- Document architectural constraints or behaviors that were not obvious from the architecture document
- Focus on things that caused developers to implement incorrectly on the first attempt
- Include the correct approach, not just the problem

### Build & CI
- Document build system quirks, CI configuration issues, and environment-specific problems
- Include exact workarounds, not just descriptions of the problem
- These entries often save significant debugging time for future developers

### Common Mistakes
- Only include mistakes that appeared in at least two stories or review cycles
- Include the frequency to help prioritize which mistakes to address first
- Describe both the mistake and the correct approach

### Process Improvements
- Track changes to templates, checklists, or workflows recommended by retrospectives
- Include implementation status so the orchestrator knows what has been applied
- Link back to the retrospective that recommended the change

### What Works Well
- Reinforce practices that consistently led to clean implementations
- Include enough detail that future agents can replicate the successful pattern
- This section is as important as the problems sections -- it prevents regression of good practices

## Maintenance Rules

- **Append only.** New entries are added to the appropriate section. Existing entries are never removed unless the orchestrator explicitly directs it.
- **No duplicates.** Before adding a new entry, check whether a substantially similar entry already exists. If it does, update the existing entry's source and frequency rather than adding a duplicate.
- **Source everything.** Every entry must include a source reference linking it to the retrospective or review where it was identified. Unsourced entries cannot be validated and should not be added.
- **Keep entries atomic.** Each entry should describe one learning. Do not combine multiple unrelated observations into a single entry.

## Quality Checklist

- [ ] Every entry is a clear, actionable directive (not a vague suggestion)
- [ ] Every entry includes a source reference to a specific retrospective or review
- [ ] No duplicate entries exist across sections
- [ ] Common mistakes include frequency data
- [ ] Process improvements include implementation status
- [ ] Entries do not duplicate content already in `project-context.md`
- [ ] Content is specific to this project (no generic software engineering advice)
- [ ] Sections are ordered with the most entries or highest-impact items first within each section
