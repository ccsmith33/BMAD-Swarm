# Quality Standards

Quality gates are mandatory for all artifacts. Self-validate before reporting done.

## Test Requirements

{{#if methodology.quality.require_tests}}- All code must have tests. No exceptions.
- Tests must pass before any code is considered complete.
- New features require unit tests at minimum. Integration tests for cross-module work.
{{/if}}{{#unless methodology.quality.require_tests}}- Tests are recommended but not required for this project.
{{/unless}}

## Review Requirements

{{#if methodology.quality.require_review}}- All code must pass adversarial review before merge.
- The reviewer checks for correctness, security vulnerabilities, architecture compliance, and test coverage.
- Review findings categorized as "blocking" must be resolved before proceeding.
- Advisory findings should be logged and addressed when practical.
{{/if}}{{#unless methodology.quality.require_review}}- Code review is recommended but not required for this project.
{{/unless}}

## Human Approval

Human approval is required for: {{methodology.quality.require_human_approval_list}}

These artifacts must be presented to the human and explicitly approved before downstream work begins.

## Phase Quality Gates

Each phase must satisfy its quality gate before the next phase begins:

- **Exploration**: Research findings documented, feasibility assessed, risks identified
- **Definition**: PRD complete with numbered requirements, acceptance criteria for each requirement, stakeholder approval
- **Design**: Architecture document complete, ADRs for key decisions, component interfaces defined
- **Implementation**: All stories implemented, tests passing, code reviewed and approved
- **Delivery**: Final validation complete, documentation updated, handoff artifacts produced

## Artifact Quality Criteria

- **Product Brief**: Clear problem statement, target users identified, success metrics defined, decisions logged with D-IDs
- **PRD**: Numbered functional and non-functional requirements, acceptance criteria, references to D-IDs from product brief
- **Architecture**: System diagram, component breakdown, technology choices justified with ADRs, references to D-IDs
- **Stories**: Acceptance criteria, dev notes with file paths, estimated scope, references to D-IDs from architecture
- **Code**: Tests passing, review approved, follows project coding standards, implements story acceptance criteria exactly
