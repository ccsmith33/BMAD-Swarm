---
paths:
  - "{{output.code_dir}}/**/*"
---

# Coding Standards

These standards apply to all source code in `{{output.code_dir}}/`.

## TDD Workflow

1. Write a failing test that defines the expected behavior
2. Write the minimum code to make the test pass
3. Refactor while keeping tests green
4. Repeat for each acceptance criterion in the story

## Architecture Compliance

- Follow the architecture document in `artifacts/design/`
- Respect component boundaries defined in the architecture
- Use the interfaces and patterns specified in the design
- Log an ADR at `artifacts/design/decisions/` for any deviation from the architecture

## Code Quality

- Keep functions focused on a single responsibility
- Prefer composition over inheritance
- Handle errors at system boundaries (user input, external APIs, file I/O)
- Do not add error handling for internal code paths that cannot fail
- Avoid premature abstraction: three similar lines are better than a premature helper

## Story Compliance

- Implement exactly what the story file specifies
- Do not add features, refactor surrounding code, or make improvements beyond the story scope
- If the story is unclear or incomplete, report a blocker to the orchestrator
- Mark each acceptance criterion as done when its test passes

## Decision Traceability

- Reference D-IDs from the story when implementing decisions
- If a new decision is needed during implementation, escalate to the orchestrator
- Do not make architectural decisions independently
