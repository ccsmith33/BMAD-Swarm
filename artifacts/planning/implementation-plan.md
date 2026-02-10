# bmad-swarm Master Implementation Plan

**Date**: 2026-02-09
**Author**: Architect Agent
**Status**: Approved for Development
**Scope**: All work items from critical fixes through strategic investments

---

## How to Read This Plan

Each item includes:
- **Files**: Specific paths to create or modify
- **Effort**: Estimated time (hours or days)
- **Depends on**: Other items that must complete first (by ID)
- **Acceptance criteria**: How to verify the item is done

Items are numbered `P<phase>.<sequence>` for cross-referencing (e.g., P1.3 = Phase 1, item 3).

---

## Phase 1: Critical Fixes (Immediate)

These items fix broken output, failing tests, dead code, and structural duplication. All are independent and can be parallelized unless noted.

---

### P1.1 Fix CLAUDE.md Template -- require_human_approval_list

The template at `templates/CLAUDE.md.template:46` references `{{methodology.quality.require_human_approval_list}}` but `buildTemplateData()` in `generators/claude-md-generator.js` never constructs this property. The generated CLAUDE.md currently renders the literal placeholder text.

**Files to modify**:
- `generators/claude-md-generator.js` -- Add `require_human_approval_list` to the data object returned by `buildTemplateData()`

**Effort**: 30 minutes

**Depends on**: Nothing

**Acceptance criteria**:
- Running `bmad-swarm update` on a project with `require_human_approval: ['prd', 'architecture']` produces a CLAUDE.md containing `Human approval required for: prd, architecture` (not the raw placeholder)
- Running `bmad-swarm update` with a custom `require_human_approval` list renders the custom values
- Existing test `test/generators.test.js` still passes
- New test added that verifies the rendered CLAUDE.md contains the human-readable approval list

**Implementation detail**:
In `buildTemplateData()`, within the `methodology` spread, add:
```javascript
methodology: {
  ...config.methodology,
  enabledPhases: enabledPhases.join(', '),
  phaseCount: enabledPhases.length,
  quality: {
    ...config.methodology.quality,
    require_human_approval_list: config.methodology.quality.require_human_approval.join(', '),
  },
},
```

---

### P1.2 Fix CLAUDE.md Template -- Autonomy Boolean Flags

The template at `templates/CLAUDE.md.template:27-30` uses `{{#if methodology.autonomy_auto}}`, `{{#if methodology.autonomy_guided}}`, and `{{#if methodology.autonomy_collaborative}}` conditionals, but `buildTemplateData()` never sets these boolean flags. The autonomy description section in the generated CLAUDE.md is always empty.

**Files to modify**:
- `generators/claude-md-generator.js` -- Add boolean flags for each autonomy level to the data object

**Effort**: 30 minutes

**Depends on**: Nothing

**Acceptance criteria**:
- Running `bmad-swarm update` with `autonomy: auto` produces a CLAUDE.md containing the auto-mode description ("operates fully autonomously")
- Running with `autonomy: guided` produces the guided description
- Running with `autonomy: collaborative` produces the collaborative description
- Only one description block appears (the one matching the configured level)
- New test added that verifies the correct autonomy description renders for each mode

**Implementation detail**:
In `buildTemplateData()`, within the `methodology` spread:
```javascript
methodology: {
  ...config.methodology,
  autonomy_auto: config.methodology.autonomy === 'auto',
  autonomy_guided: config.methodology.autonomy === 'guided',
  autonomy_collaborative: config.methodology.autonomy === 'collaborative',
  // ...existing fields
},
```

---

### P1.3 Fix Idempotency Test -- Add ideator to Agent List

The idempotency test at `test/idempotent.test.js:49` checks agents `['orchestrator', 'researcher', 'strategist', 'architect', 'story-engineer', 'developer', 'reviewer', 'qa']` but omits `'ideator'`. This was added to `AGENT_NAMES` in `utils/config.js` but the test was not updated.

**Files to modify**:
- `test/idempotent.test.js` -- Add `'ideator'` to the `agentFiles` array at line 49

**Effort**: 10 minutes

**Depends on**: Nothing

**Acceptance criteria**:
- `node --test test/idempotent.test.js` passes
- The `agentFiles` array contains all 9 agents matching `AGENT_NAMES` in `utils/config.js`
- The idempotency test verifies that the ideator agent file is identical across two runs

---

### P1.4 Remove Dead Code from fs-helpers.js

`utils/fs-helpers.js` exports `copyFileSafe` (lines 37-40) and `fileExists` (lines 47-49) which are never imported or used anywhere in the codebase.

**Files to modify**:
- `utils/fs-helpers.js` -- Remove the `copyFileSafe` and `fileExists` functions and their associated `copyFileSync` import

**Effort**: 10 minutes

**Depends on**: Nothing

**Acceptance criteria**:
- `copyFileSafe` and `fileExists` no longer exist in `utils/fs-helpers.js`
- The `copyFileSync` import is removed from the import statement (line 1)
- `node --test` (all tests) still passes
- `grep -r "copyFileSafe\|fileExists" --include="*.js"` finds no references in the codebase (except possibly in test files, which should also be cleaned up)

---

### P1.5 Extract Shared Settings Generator

Settings generation logic is duplicated between `cli/init.js:271-283` and `cli/update.js:91-102`. Both construct the same hardcoded JSON object. Additionally, `templates/settings.json.template` exists but is never read.

**Files to create**:
- `generators/settings-generator.js` -- New shared module

**Files to modify**:
- `cli/init.js` -- Replace inline `generateSettings()` with import from shared generator
- `cli/update.js` -- Replace inline settings generation (lines 91-101) with import from shared generator

**Files to delete** (optional, can defer):
- `templates/settings.json.template` -- Either use it in the new generator or remove it

**Effort**: 1 hour

**Depends on**: Nothing

**Acceptance criteria**:
- `cli/init.js` and `cli/update.js` both import and call the same `generateSettings()` from `generators/settings-generator.js`
- No inline settings JSON construction exists in either CLI file
- The settings.json.template is either used by the generator or removed from the templates directory
- Running `bmad-swarm init -y` and `bmad-swarm update` both produce identical `.claude/settings.json` files
- `node --test` (all tests) still passes

**Implementation approach**:
```javascript
// generators/settings-generator.js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_TEMPLATES_DIR } from '../utils/paths.js';
import { writeFileSafe } from '../utils/fs-helpers.js';

export function generateSettings(projectPaths) {
  const templatePath = join(PACKAGE_TEMPLATES_DIR, 'settings.json.template');
  const content = readFileSync(templatePath, 'utf8');
  writeFileSafe(projectPaths.settingsJson, content);
  return projectPaths.settingsJson;
}
```

---

### P1.6 Add CLAUDE.md Content Validation Tests

The existing test at `test/generators.test.js` only checks that CLAUDE.md exists and contains the project name. It does not catch the two template bugs (P1.1 and P1.2). This item adds tests that would have caught both bugs.

**Files to modify**:
- `test/generators.test.js` -- Add new test cases

**Effort**: 2 hours

**Depends on**: P1.1, P1.2 (tests validate the fixes)

**Acceptance criteria**:
- Test verifies that `require_human_approval_list` renders as comma-separated values (not raw placeholder)
- Test verifies that the autonomy description section is non-empty for each autonomy mode (auto, guided, collaborative)
- Test verifies that the agent table contains all 9 agents
- Test verifies that conditional sections (framework, database, testing) render when config values are present and are absent when values are missing
- Test verifies that the phases section lists only enabled phases
- All tests pass: `node --test test/generators.test.js`

---

## Phase 2: Core Quality (1-2 Weeks)

Foundation improvements that make the tool reliable, cross-platform, and well-tested. These items establish the quality baseline for all future development.

---

### P2.1 Cross-Platform Hooks (Node.js Instead of Bash)

Generated hooks in `generators/hooks-generator.js` are bash scripts (`.sh`) with `#!/bin/bash` shebangs. These do not execute on Windows natively. Since bmad-swarm is a Node.js tool, hooks should be Node.js scripts.

**Files to modify**:
- `generators/hooks-generator.js` -- Rewrite to generate `.js` hooks instead of `.sh`

**Files affected**:
- Generated output: `.claude/hooks/TaskCompleted.js` (replaces `.sh`)
- Generated output: `.claude/hooks/TeammateIdle.js` (replaces `.sh`)

**Effort**: 4 hours

**Depends on**: Nothing

**Acceptance criteria**:
- Generated hooks have `.js` extension and `#!/usr/bin/env node` shebang
- Hook logic is equivalent to the current bash version (log messages, conditional checks)
- Hooks execute correctly on Windows (cmd.exe), macOS, and Linux
- No bash syntax in generated hooks
- `test/generators.test.js` hook test updated to check for node shebang instead of bash
- `node --test` passes

**Implementation notes**:
- Use `process.env.TASK_SUBJECT`, `process.env.TASK_OWNER`, etc. instead of `$TASK_SUBJECT`
- Use `process.stdout.write()` or `console.log()` instead of `echo`
- Use string includes checks instead of `[[ ]]` bash conditionals

---

### P2.2 swarm.yaml Schema Validation

`utils/config.js:loadSwarmConfig()` applies defaults but never validates. Typos like `autonomy: auot` pass silently. Invalid agent names in the `agents` section produce no warning. Non-numeric `parallel_devs` values cause downstream failures.

**Files to create**:
- `utils/validator.js` -- Schema validation module

**Files to modify**:
- `utils/config.js` -- Call `validateConfig()` after `applyDefaults()` in `loadSwarmConfig()`

**Files to create (test)**:
- `test/validator.test.js` -- Validation test suite

**Effort**: 1 day

**Depends on**: Nothing

**Acceptance criteria**:
- `loadSwarmConfig()` throws a clear, human-readable error when:
  - `project.name` is missing or empty
  - `project.type` is not one of: `web-app`, `api`, `cli`, `library`, `mobile`, `monorepo`, `other`
  - `methodology.autonomy` is not one of: `auto`, `guided`, `collaborative`
  - `methodology.phases.<name>.enabled` is not a boolean
  - `methodology.phases.implementation.parallel_devs` is not a positive integer
  - `agents.<name>` uses a name not in `AGENT_NAMES`
  - `methodology.quality.require_human_approval` is not an array
- Error messages include the invalid value and the valid options
- Valid configs continue to work without warnings
- Test suite covers all validation rules with positive and negative cases
- `node --test` passes

**Implementation approach**:
Hand-written validator (no external dependencies). A `validateConfig(config)` function that returns an array of error strings. If the array is non-empty, throw with all errors joined.

---

### P2.3 Template Engine -- Add {{#each}}, {{#else}}, and Array Formatting

The template engine in `utils/template.js` supports only `{{var}}` and `{{#if var}}...{{/if}}`. This is insufficient for dynamic content. The CLAUDE.md template works around limitations by pre-joining arrays in `buildTemplateData()`, but future templates will need iteration and else blocks.

**Files to modify**:
- `utils/template.js` -- Add `{{#each array}}...{{/each}}`, `{{#else}}`, and `{{#unless key}}...{{/unless}}`

**Files to modify (test)**:
- `test/template.test.js` -- Add tests for new constructs

**Effort**: 1 day

**Depends on**: Nothing

**Acceptance criteria**:
- `{{#each items}}{{this}}{{/each}}` iterates over arrays, rendering the block for each element
- `{{#each items}}{{name}}: {{value}}{{/each}}` iterates over arrays of objects with property access
- `{{#if key}}truthy{{#else}}falsy{{/if}}` renders the else block when condition is falsy
- `{{#unless key}}content{{/unless}}` renders content when key is falsy
- Nested conditionals inside each blocks work correctly
- Empty arrays render nothing for `{{#each}}`
- Undefined/null arrays render nothing for `{{#each}}`
- All existing template tests still pass (backward compatible)
- New test cases cover all the above scenarios
- `node --test` passes

---

### P2.4 Scan Command Unit Tests

`cli/scan.js` contains 7 detection functions with zero test coverage. These functions have complex conditional logic for detecting languages, frameworks, test runners, databases, and project types from manifest files.

**Files to create**:
- `test/scan.test.js` -- Comprehensive test suite for scan detection functions

**Files to modify**:
- `cli/scan.js` -- Export detection functions for testability (currently they are module-private)

**Effort**: 4-6 hours

**Depends on**: Nothing

**Acceptance criteria**:
- Detection functions are exported from `cli/scan.js` (or extracted to a testable module like `utils/detector.js`)
- Test cases cover:
  - `detectLanguageFromPackageJson`: TypeScript detection (via `typescript` dep), JavaScript fallback
  - `detectFrameworkFromPackageJson`: All 9 frameworks (Next.js, React, Vue, Angular, Express, Fastify, Koa, Hono, SvelteKit), null when none found
  - `detectTestingFromPackageJson`: All 5 test runners (Vitest, Jest, Mocha, Playwright, Cypress), null when none found
  - `detectDatabaseFromPackageJson`: All 7 database adapters (Prisma, PostgreSQL, MySQL, MongoDB, SQLite, Drizzle), null when none found
  - `detectProjectTypeFromPackageJson`: cli (has `bin`), web-app, api, library, other
  - `detectPythonFramework`: FastAPI, Django, Flask, null
  - `generateProjectContext`: Produces valid markdown with all fields populated
- `node --test test/scan.test.js` passes with all tests green

---

### P2.5 CLI Integration Tests

No tests exercise the actual CLI commands. The generators are tested in isolation, but the wiring between CLI commands and generators is untested.

**Files to create**:
- `test/cli.test.js` -- Integration tests using `child_process.execSync`

**Effort**: 1 day

**Depends on**: P1.5 (settings generator extraction, to avoid testing duplicated code)

**Acceptance criteria**:
- Tests exercise the following commands in temp directories:
  - `bmad-swarm init -y` -- Verify all expected files are created
  - `bmad-swarm init -y --template next-app` -- Verify template values appear in swarm.yaml
  - `bmad-swarm init -y --scan` -- Verify scan results are applied (using a temp dir with a mock package.json)
  - `bmad-swarm update` -- Verify files are regenerated (run after init)
  - `bmad-swarm update --dry-run` -- Verify no files are modified
  - `bmad-swarm status` -- Verify output includes project name, phase, agents
  - `bmad-swarm eject agent orchestrator` -- Verify override file created
  - `bmad-swarm uneject agent orchestrator` -- Verify override file removed
  - `bmad-swarm init` on an already-initialized project -- Verify error message
  - `bmad-swarm update` without swarm.yaml -- Verify error message
- Each test uses an isolated temp directory and cleans up after itself
- `node --test test/cli.test.js` passes

---

### P2.6 Error Path Tests

Limited coverage of error scenarios. Missing tests for malformed YAML, invalid config values, partial state, and invalid operations.

**Files to create**:
- `test/error-paths.test.js` -- Error scenario test suite

**Effort**: 4 hours

**Depends on**: P2.2 (schema validation, so errors are actually produced)

**Acceptance criteria**:
- Tests cover:
  - `loadSwarmConfig()` with malformed YAML (syntax error) -- throws with clear message
  - `loadSwarmConfig()` with invalid autonomy value -- throws with valid options listed
  - `loadSwarmConfig()` with non-existent file -- throws with file path
  - `generateAgents()` with missing package template -- warns but continues
  - `ejectAgent()` with unknown agent name -- throws with valid names listed
  - `ejectAgent()` on already-ejected agent -- throws with path
  - `unejectAgent()` on non-ejected agent -- throws
  - `render()` with deeply nested undefined path -- leaves placeholder unreplaced
- `node --test test/error-paths.test.js` passes

---

### P2.7 Orchestrator Decision Matrix

The orchestrator agent at `agents/orchestrator.md` relies entirely on prose instructions to assess complexity and choose team composition. Adding a structured lookup table makes decisions more consistent and predictable.

**Files to modify**:
- `agents/orchestrator.md` -- Add a decision matrix section

**Effort**: 4 hours

**Depends on**: Nothing

**Acceptance criteria**:
- The orchestrator agent template contains a "Decision Matrix" section with:
  - **Complexity scoring table**: 5 factors (scope, clarity, technical_risk, codebase, dependencies) each scored 1-3. Total score ranges 5-15.
  - **Team composition lookup**: Score 5-7 = minimal (developer only or developer + reviewer), Score 8-10 = standard (strategist + architect + developer + reviewer), Score 11-15 = full (all agents)
  - **Phase skip table**: Which phases to skip based on entry point and complexity score
  - **Autonomy override rules**: When to suggest a different autonomy level than configured
- The matrix is formatted as markdown tables that the LLM can reference during assessment
- The matrix aligns with the existing prose rules (does not contradict them)
- The prose rules are preserved (the matrix supplements, not replaces)

---

## Phase 3: New Capabilities (2-4 Weeks)

Features that fill functional gaps identified in research. Each adds user-facing value.

---

### P3.1 `bmad-swarm validate` Command

Users cannot verify artifact quality without manually reading quality gate docs. This command programmatically checks artifacts against quality gate criteria.

**Files to create**:
- `cli/validate.js` -- Validate command implementation
- `utils/artifact-validator.js` -- Validation engine
- `test/validate.test.js` -- Test suite

**Files to modify**:
- `bin/bmad-swarm.js` -- Register the validate command

**Effort**: 3 days

**Depends on**: P2.2 (schema validation patterns)

**Acceptance criteria**:
- `bmad-swarm validate` checks all artifacts in all phase directories
- `bmad-swarm validate --phase design` checks only design-phase artifacts
- `bmad-swarm validate --artifact artifacts/planning/prd.md` checks a single artifact
- Validation checks per artifact type:
  - **PRD** (`prd.md`): Has required sections (Purpose, Functional Requirements, Non-Functional Requirements, User Journeys, Success Criteria). FRs are numbered. NFRs contain numeric targets.
  - **Architecture** (`architecture.md`): Has required sections (Overview, System Components, API Contracts, Data Models, Decisions). ADR files exist in decisions/ if referenced.
  - **Story** (`stories/*.md`): Has BDD-format acceptance criteria (Given/When/Then). Has task checklist. Has story points or size estimate.
  - **Product Brief** (`product-brief.md`): Has Vision, Target Users, Value Proposition, Scope sections.
- Output is a pass/fail report with specific issues listed per artifact
- Exit code 0 if all pass, exit code 1 if any fail
- `node --test test/validate.test.js` passes

---

### P3.2 `bmad-swarm doctor` Command

Diagnosing configuration problems requires manual inspection. The doctor command checks configuration health and reports issues with suggested fixes.

**Files to create**:
- `cli/doctor.js` -- Doctor command implementation
- `test/doctor.test.js` -- Test suite

**Files to modify**:
- `bin/bmad-swarm.js` -- Register the doctor command

**Effort**: 1 day

**Depends on**: P2.2 (schema validation)

**Acceptance criteria**:
- `bmad-swarm doctor` checks and reports:
  - swarm.yaml exists and is valid (via schema validator)
  - All expected agent files exist in `.claude/agents/`
  - Agent count matches AGENT_NAMES (minus disabled agents)
  - CLAUDE.md exists and was generated by bmad-swarm (checks for the header comment)
  - Hooks exist in `.claude/hooks/`
  - `settings.json` exists in `.claude/`
  - `project.yaml` exists
  - Artifact directories exist
  - Ejected agents have corresponding override files
  - No orphaned override files (override for a non-existent agent)
- Output uses green checkmark / red X for each check
- Suggests fix commands for each failure (e.g., "Run `bmad-swarm update` to regenerate")
- Exit code 0 if healthy, exit code 1 if issues found
- `node --test test/doctor.test.js` passes

---

### P3.3 Quality Gate Enforcement in Hooks

Current hooks are echo statements. They create the appearance of quality enforcement without substance. This item makes hooks actually enforce quality gates.

**Files to modify**:
- `generators/hooks-generator.js` -- Generate hooks that perform real validation

**Files to modify (depends on)**:
- Must be Node.js hooks (depends on P2.1)

**Effort**: 2 days

**Depends on**: P2.1 (cross-platform hooks), P3.1 (validate command)

**Acceptance criteria**:
- TaskCompleted hook:
  - For implementation tasks: Runs `npm test` (or configured test command) and reports pass/fail
  - For artifact tasks: Runs basic artifact validation (required sections present)
  - Logs results clearly with pass/fail status
  - Does NOT block task completion (logs warnings, does not exit non-zero) -- enforcement is advisory in v1
- TeammateIdle hook:
  - Logs idle event with agent name
  - If orchestrator, logs warning that the orchestrator should not be idle while tasks are pending
- Hook behavior is configurable via swarm.yaml (e.g., `hooks.enforce: true` to make hooks blocking)
- Tests verify hook scripts are syntactically valid Node.js

---

### P3.4 Feedback Loops -- Reviewer Reject Leads to Developer Retry

The current methodology is linear: developer implements, reviewer reviews, done. If the reviewer rejects, there is no automated retry. The orchestrator must manually intervene. This item adds explicit feedback loop documentation and task graph patterns.

**Files to modify**:
- `agents/orchestrator.md` -- Add "Handling Rejections" behavioral rules
- `agents/reviewer.md` -- Add "Rejection Protocol" output format
- `methodology/phases.yaml` -- Add `feedback_loops` section to implementation phase

**Effort**: 4 hours

**Depends on**: P2.7 (decision matrix, since rejection handling is part of orchestration logic)

**Acceptance criteria**:
- `agents/reviewer.md` specifies a structured rejection format: `REJECTED: [reason]. Required changes: [list]. Severity: [blocking|advisory].`
- `agents/orchestrator.md` includes rules for:
  - Detecting reviewer rejection in task completion messages
  - Creating a follow-up task assigned to the original developer
  - Setting the follow-up task to blockedBy the rejection task
  - Limiting retries (max 2 retry cycles before escalating to human)
- `methodology/phases.yaml` implementation phase documents the feedback loop
- The pattern is documented clearly enough that the orchestrator LLM will follow it

---

### P3.5 Additional Workflow Entry Points

The methodology currently optimizes for greenfield feature development. Users need lightweight workflows for debugging, migration, auditing, and maintenance.

**Files to modify**:
- `methodology/phases.yaml` -- Add entry points: `debug`, `migrate`, `audit`, `maintain`
- `agents/orchestrator.md` -- Add routing rules for new entry points

**Effort**: 4 hours

**Depends on**: Nothing

**Acceptance criteria**:
- `phases.yaml` entry_points section includes:
  - `debug`: start_phase=implementation, phases=[implementation], agents=[developer, reviewer], description="Investigate and fix a bug with hypothesis-driven debugging"
  - `migrate`: start_phase=design, phases=[design, implementation, delivery], description="Migrate between frameworks, languages, or major versions"
  - `audit`: start_phase=exploration, phases=[exploration], agents=[researcher, reviewer], description="Security or code quality audit of existing codebase"
  - `maintain`: start_phase=implementation, phases=[implementation], agents=[developer, reviewer], description="Routine maintenance: dependency updates, deprecation fixes, test coverage"
- `agents/orchestrator.md` entry-point routing section lists trigger phrases for each new mode
- The orchestrator can distinguish between "fix this bug" (bug-fix) and "investigate why this is slow" (debug)

---

### P3.6 README Improvements

The README has documented friction points from user research: missing prerequisites, no mental model explanation, no troubleshooting, and the full config reference presented before context.

**Files to modify**:
- `README.md`

**Effort**: 4 hours

**Depends on**: Nothing

**Acceptance criteria**:
- README includes:
  - **Prerequisites** section: Node.js >= 18, Claude Code installed and authenticated, recommended Claude plan
  - **How It Works** section (30-second conceptual overview before Quick Start): explains the relationship between swarm.yaml, agents, and Claude Code
  - **Troubleshooting** section: covers rate limits, agent loops, quality gate failures, partial init state
  - **Escape Hatches** section: shows how the orchestrator skips phases for simple tasks, with examples of minimal paths (bug fix = developer + reviewer only)
  - Full configuration reference moved to a collapsible `<details>` block or separate doc
  - Safety guarantees prominently stated near brownfield examples
- README is under 400 lines (currently ~520) by moving reference material to separate docs

---

### P3.7 Cost Estimation Display

Users cannot predict token costs before running a swarm session. This item adds a cost estimation feature.

**Files to create**:
- `utils/cost-estimator.js` -- Cost estimation logic

**Files to modify**:
- `cli/init.js` -- Display estimated cost range after init
- `agents/orchestrator.md` -- Add rule to estimate and display costs before spawning team

**Effort**: 4 hours

**Depends on**: Nothing

**Acceptance criteria**:
- `utils/cost-estimator.js` exports `estimateCost(config, entryPoint)` that returns:
  - `agents`: list of agents that will be spawned
  - `estimatedTokensMin`: conservative minimum token estimate
  - `estimatedTokensMax`: conservative maximum token estimate
  - `estimatedCostMin`: USD cost at current Claude pricing
  - `estimatedCostMax`: USD cost at current Claude pricing
- Estimates are based on: number of agents, number of phases, parallel_devs setting, and typical token usage per agent role (from the devil's advocate cost analysis)
- `bmad-swarm init` prints: "Estimated cost for a full lifecycle run: $X-$Y (based on configured agents and phases)"
- The orchestrator agent template includes a rule to display cost estimates to the human before spawning the full team
- Estimates include a disclaimer that actual costs vary

---

## Phase 4: Strategic (1-3 Months)

Long-term investments that expand the tool's capabilities and addressable market.

---

### P4.1 Runtime Phase State Machine

Currently, `project.yaml` has a `phase` field set to `not-started` during init and never updated. Nothing prevents agents from writing artifacts out of order. This item adds programmatic phase tracking.

**Files to create**:
- `utils/phase-machine.js` -- State machine for phase transitions
- `cli/phase.js` -- Phase management commands
- `test/phase-machine.test.js` -- Test suite

**Files to modify**:
- `bin/bmad-swarm.js` -- Register phase commands
- `generators/hooks-generator.js` -- Add phase-aware validation to hooks

**Effort**: 1 week

**Depends on**: P2.1 (Node.js hooks), P3.1 (validate command)

**Acceptance criteria**:
- `bmad-swarm phase` -- Displays current phase and available transitions
- `bmad-swarm phase advance` -- Advances to next phase if gate criteria are met; errors with specific unmet criteria if not
- `bmad-swarm phase set <name>` -- Manually sets phase (with --force flag to bypass gate check)
- Phase transitions validate against `methodology/phases.yaml` transition rules
- `project.yaml` is updated on every phase transition with timestamp
- Hooks can optionally warn (not block) when an artifact write targets a phase directory that does not match the current phase
- Phase history is appended to `project.yaml` (array of `{phase, entered_at, exited_at}`)
- `node --test test/phase-machine.test.js` passes

---

### P4.2 Dynamic Agent Discovery

The agent list is hardcoded in `AGENT_NAMES` at `utils/config.js:99-109`. Adding a new agent requires modifying source code. This item auto-discovers agents from the filesystem.

**Files to modify**:
- `utils/config.js` -- Replace `AGENT_NAMES` constant with a function that scans the agents directory
- `generators/agent-generator.js` -- Use discovered agents instead of hardcoded list
- All files that import `AGENT_NAMES` -- Update to use the new discovery function

**Effort**: 3 days

**Depends on**: Nothing

**Acceptance criteria**:
- `AGENT_NAMES` is replaced with `getAgentNames()` that scans `agents/` directory for `.md` files
- Agent names are derived from filenames (e.g., `developer.md` -> `developer`)
- The function caches results (scans once per CLI invocation)
- Adding a new `.md` file to `agents/` automatically includes it in the agent list
- Removing a `.md` file from `agents/` automatically excludes it
- Existing behavior is preserved for all current agents
- Eject/uneject still works with discovered agents
- swarm.yaml `agents:` section can reference discovered agents
- `node --test` passes

---

### P4.3 Plugin System for Custom Agents

Users cannot extend the tool with custom agents without forking. This item adds a plugin convention for user-defined agents.

**Files to create**:
- `utils/plugins.js` -- Plugin discovery and loading
- Documentation: describe the plugin convention in README or a separate doc

**Files to modify**:
- `utils/config.js` -- Merge plugin agents with built-in agents
- `generators/agent-generator.js` -- Support plugin agent templates

**Effort**: 1 week

**Depends on**: P4.2 (dynamic agent discovery)

**Acceptance criteria**:
- Users can place custom agent `.md` files in a `plugins/agents/` directory (or path configured in swarm.yaml under `plugins.agents_dir`)
- Plugin agents are discovered alongside built-in agents
- Plugin agents appear in the CLAUDE.md agent table
- Plugin agents can be configured in swarm.yaml `agents:` section (extra_context, extra_rules, enabled)
- Plugin agents can be ejected and unejected
- Built-in agents take precedence over plugins with the same name (no override)
- `bmad-swarm status` shows plugin agents with a `(plugin)` marker

---

### P4.4 GitHub Integration

The most-requested integration from user research. PR creation, issue sync, and CI triggers.

**Files to create**:
- `integrations/github.js` -- GitHub API integration
- `generators/github-actions-generator.js` -- CI workflow generator

**Files to modify**:
- `cli/init.js` -- Option to generate GitHub Actions workflow
- `agents/orchestrator.md` -- Rules for creating PRs and issues

**Effort**: 1 week

**Depends on**: Nothing (but benefits from P3.1 validate command for CI checks)

**Acceptance criteria**:
- `bmad-swarm init --github` generates a `.github/workflows/bmad-validate.yml` that runs `bmad-swarm validate` on PRs
- The orchestrator agent template includes rules for when to create GitHub issues (from QA findings) and PRs (from completed stories)
- `bmad-swarm validate` can be run in CI mode (exits with code 0/1, machine-readable output)
- The GitHub Actions workflow is well-commented and runs on `pull_request` events
- No hardcoded GitHub tokens or secrets in generated files

---

### P4.5 Optional Agents -- DevOps, Tech Writer, Security

The current 9-agent set covers the SDLC through code review but lacks infrastructure, documentation, and security specialization. These are opt-in agents activated by project configuration.

**Files to create**:
- `agents/devops.md` -- CI/CD, Docker, infrastructure agent
- `agents/tech-writer.md` -- Documentation, API docs, README agent
- `agents/security.md` -- Threat modeling, dependency audit, OWASP review agent

**Files to modify**:
- `agents/orchestrator.md` -- Add routing rules for when to include optional agents
- `methodology/phases.yaml` -- Reference optional agents in relevant phases

**Effort**: 3 days

**Depends on**: P4.2 (dynamic agent discovery, so new agents are auto-detected)

**Acceptance criteria**:
- Each agent file follows the established template pattern (Role, Expertise, Inputs, Outputs, Quality Criteria, Behavioral Rules)
- Agents are disabled by default (not included in AGENT_NAMES or equivalent)
- Users enable them via swarm.yaml: `agents.devops.enabled: true`
- The orchestrator includes them in team composition only when enabled AND the task warrants it
- Each agent has at least one test verifying it generates correctly when enabled
- `node --test` passes

---

### P4.6 Monorepo Support

No support for multiple projects within a single repository. Each package would need separate initialization with no shared configuration.

**Files to modify**:
- `utils/config.js` -- Support workspace-aware config loading
- `cli/init.js` -- Support `--workspace <path>` flag
- `utils/paths.js` -- Support workspace-relative paths

**Files to create**:
- `utils/workspace.js` -- Workspace discovery and management

**Effort**: 1 week

**Depends on**: Nothing

**Acceptance criteria**:
- `bmad-swarm init --workspace packages/api` initializes a swarm config scoped to a workspace
- Root `swarm.yaml` can define shared configuration (stack, methodology) that workspaces inherit
- Workspace `swarm.yaml` can override any root-level setting
- `bmad-swarm status` in a monorepo shows all workspaces and their phases
- `bmad-swarm update` in a workspace only regenerates that workspace's files
- `bmad-swarm update` at root regenerates all workspaces

---

### P4.7 Run Reporting and Observability

After a swarm session, there is no summary of what happened. Users cannot evaluate whether the swarm provided value.

**Files to create**:
- `utils/run-reporter.js` -- Report generation
- `agents/orchestrator.md` -- Rules for producing run reports

**Files to modify**:
- `generators/hooks-generator.js` -- Hooks that log events for report aggregation

**Effort**: 3 days

**Depends on**: P2.1 (Node.js hooks), P4.1 (phase machine for phase timing)

**Acceptance criteria**:
- After a swarm session, a run report is written to `artifacts/reviews/run-report-<date>.md`
- Report includes:
  - Agents spawned and their tasks
  - Phase transitions and timing
  - Artifacts produced (list with paths)
  - Quality issues found by reviewer/QA
  - Estimated token usage (rough, based on message count)
  - Summary of decisions made (from decision log)
- The orchestrator agent template includes rules for generating the report as its final action before shutdown
- Report format is structured markdown that could be parsed programmatically

---

### P4.8 Methodology Overrides Directory

Users cannot customize methodology rules (phases, quality gates, transitions) without forking. This mirrors the agent override/eject pattern for methodology files.

**Files to modify**:
- `utils/paths.js` -- Add `overridesMethodologyDir` path
- `utils/config.js` -- Load methodology overrides when present
- `cli/init.js` -- Create `overrides/methodology/` directory

**Files to create**:
- `cli/eject.js` -- Extend eject to support `bmad-swarm eject methodology phases`
- `cli/uneject.js` -- Extend uneject for methodology

**Effort**: 3 days

**Depends on**: Nothing

**Acceptance criteria**:
- `bmad-swarm eject methodology phases` copies `methodology/phases.yaml` to `overrides/methodology/phases.yaml`
- Ejected methodology files take precedence over package versions
- `bmad-swarm uneject methodology phases` removes the override
- Quality gate overrides work the same way (`bmad-swarm eject methodology quality-gate prd-quality`)
- `bmad-swarm update` uses overridden methodology files when present
- `bmad-swarm status` shows ejected methodology files

---

## Dependency Graph Summary

```
Phase 1 (all independent, can parallelize):
  P1.1  Fix require_human_approval_list
  P1.2  Fix autonomy boolean flags
  P1.3  Fix idempotency test
  P1.4  Remove dead code
  P1.5  Extract settings generator
  P1.6  CLAUDE.md content tests         --> depends on P1.1, P1.2

Phase 2:
  P2.1  Cross-platform hooks            --> independent
  P2.2  Schema validation               --> independent
  P2.3  Template engine improvements    --> independent
  P2.4  Scan command tests              --> independent
  P2.5  CLI integration tests           --> depends on P1.5
  P2.6  Error path tests                --> depends on P2.2
  P2.7  Orchestrator decision matrix    --> independent

Phase 3:
  P3.1  Validate command                --> depends on P2.2
  P3.2  Doctor command                  --> depends on P2.2
  P3.3  Quality gate enforcement        --> depends on P2.1, P3.1
  P3.4  Feedback loops                  --> depends on P2.7
  P3.5  Workflow entry points           --> independent
  P3.6  README improvements             --> independent
  P3.7  Cost estimation                 --> independent

Phase 4:
  P4.1  Phase state machine             --> depends on P2.1, P3.1
  P4.2  Dynamic agent discovery         --> independent
  P4.3  Plugin system                   --> depends on P4.2
  P4.4  GitHub integration              --> independent
  P4.5  Optional agents                 --> depends on P4.2
  P4.6  Monorepo support                --> independent
  P4.7  Run reporting                   --> depends on P2.1, P4.1
  P4.8  Methodology overrides           --> independent
```

---

## Effort Summary

| Phase | Items | Estimated Total |
|-------|-------|-----------------|
| Phase 1: Critical Fixes | 6 items | 1-2 days |
| Phase 2: Core Quality | 7 items | 5-8 days |
| Phase 3: New Capabilities | 7 items | 8-12 days |
| Phase 4: Strategic | 8 items | 5-8 weeks |
| **Total** | **28 items** | **~3 months** |

---

## Priority Order for Maximum Impact

If resources are limited, implement in this order:

1. **P1.1 + P1.2** -- Fix the broken output first (30 min each)
2. **P1.3 + P1.4** -- Fix the test and clean dead code (10 min each)
3. **P1.5** -- Extract settings generator (1 hour)
4. **P2.1** -- Cross-platform hooks, unblocks Windows users (4 hours)
5. **P2.2** -- Schema validation, prevents silent config errors (1 day)
6. **P1.6 + P2.4** -- Tests that catch regressions (6 hours total)
7. **P2.7** -- Decision matrix, improves orchestrator quality (4 hours)
8. **P3.5 + P3.6** -- Entry points and README, reduces adoption friction (8 hours)
9. **P3.1 + P3.2** -- Validate and doctor commands, core user-facing features (4 days)
10. Everything else in phase order

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Template engine changes break existing output | P2.3 requires backward compatibility; all existing tests must pass |
| Schema validation rejects valid legacy configs | Validation is additive (warns on unknown fields, errors only on invalid values) |
| Cross-platform hooks have platform-specific bugs | P2.5 CLI integration tests run on the development platform; CI should test cross-platform |
| Phase state machine adds unwanted friction | Phase commands are opt-in; hooks warn but do not block by default |
| Dynamic agent discovery changes behavior | Discovery returns the same list as the current hardcoded constant; tested for equivalence |
| Plugin agents conflict with built-in agents | Built-in agents take precedence; plugins cannot override built-in names |
