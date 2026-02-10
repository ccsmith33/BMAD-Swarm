# Technical Research: bmad-swarm Codebase Analysis

## Executive Summary

bmad-swarm is a well-structured Node.js CLI tool (ES modules, commander.js, js-yaml) that generates Claude Code Agent Team configurations for autonomous software development. The codebase is approximately 2,500 lines of JavaScript across 13 source files, with 43 passing tests, 9 agent templates, 6 methodology YAML files, 5 quality gates, 6 artifact schemas, and comprehensive markdown documentation.

**Overall assessment**: The codebase is clean, well-organized, and follows consistent patterns. However, it is fundamentally a **static configuration generator** -- it generates files and exits. It has no runtime orchestration, no artifact validation engine, no state machine for phase transitions, and no plugin system. The methodology documentation (phases.yaml, quality gates, artifact schemas) is rich and detailed but exists purely as documentation for agents to read, not as machine-enforceable rules. This represents both the tool's greatest strength (simplicity, low surface area) and its greatest limitation (the quality of autonomous development depends entirely on how well Claude Code agents interpret markdown instructions).

### Key Findings

1. **Architecture is generation-only** -- No runtime, no daemon, no watch mode. The tool generates files and the agents do the rest.
2. **Template engine is minimal** -- Supports `{{var}}` and `{{#if var}}...{{/if}}` only. No loops, no partials, no includes, no else blocks.
3. **Quality gates are documentation, not code** -- The 5 quality gate files are markdown checklists. No programmatic validation exists.
4. **Hooks are bash-only** -- Generated hooks are bash scripts, which do not work natively on Windows.
5. **No config validation** -- swarm.yaml is loaded and defaults are applied, but no schema validation catches typos or invalid values.
6. **Test coverage is good for unit/integration** -- 43 tests cover the template engine, config system, generators, eject/uneject, and idempotency. No CLI integration tests or E2E tests exist.
7. **Settings generation is duplicated** -- settings.json generation logic exists in both `cli/init.js` and `cli/update.js` instead of being shared.
8. **No npm publish workflow** -- Package is npm-publishable but no CI/CD, no version bump scripts, no changelog generation.

---

## Architecture Analysis

### File Structure Overview

```
bin/bmad-swarm.js          -- CLI entry point (42 lines)
cli/
  init.js                  -- Init command (284 lines)
  update.js                -- Update command (107 lines)
  eject.js                 -- Eject command (56 lines)
  uneject.js               -- Uneject command (50 lines)
  scan.js                  -- Codebase scanner (216 lines)
  status.js                -- Status display (95 lines)
generators/
  agent-generator.js       -- Agent file generator (172 lines)
  claude-md-generator.js   -- CLAUDE.md generator (137 lines)
  hooks-generator.js       -- Hook script generator (93 lines)
utils/
  paths.js                 -- Path resolution (43 lines)
  fs-helpers.js            -- File system utilities (50 lines)
  template.js              -- Template engine (59 lines)
  config.js                -- Config loading + defaults (110 lines)
agents/                    -- 9 agent markdown templates
methodology/               -- Phase definitions, task templates, quality gates, artifact schemas
templates/                 -- CLAUDE.md, swarm.yaml, settings.json templates
test/                      -- 5 test files, 43 tests
```

### Architecture Pattern

The tool follows a simple pipeline architecture:

```
swarm.yaml --> loadSwarmConfig() --> applyDefaults() --> generators --> filesystem output
```

Each generator (agents, claude-md, hooks) reads the config and writes files. There is no intermediate representation, no AST, and no plugin hooks. This is clean and effective for the current scope but limits extensibility.

### Dependency Graph

The codebase has a clean dependency tree with no circular dependencies:

- `bin/bmad-swarm.js` imports `cli/*.js`
- `cli/*.js` imports `generators/*.js` and `utils/*.js`
- `generators/*.js` imports `utils/*.js`
- `utils/*.js` are leaf modules (no cross-imports)

External dependencies are minimal: `commander` (CLI framework) and `js-yaml` (YAML parsing). Zero runtime dependencies beyond Node.js built-ins.

---

## Feature Gap Analysis (Prioritized)

### Priority 1: Critical Gaps

#### 1.1 Windows Compatibility -- Hooks Are Bash-Only
**File**: `generators/hooks-generator.js:37-93`
**Impact**: Tool cannot function on Windows without WSL or Git Bash
**Details**: Both generated hooks (`TaskCompleted.sh`, `TeammateIdle.sh`) are bash scripts with `#!/bin/bash` shebangs. On Windows, these will not execute natively. Claude Code on Windows may not support bash hooks at all.
**Recommendation**: Generate platform-appropriate hooks -- either .cmd/.ps1 on Windows, or use Node.js scripts (`.js` files) that work cross-platform. Since the tool itself is Node.js, Node.js hooks are the natural choice.

#### 1.2 No swarm.yaml Schema Validation
**File**: `utils/config.js:20-94`
**Impact**: Typos and invalid values in swarm.yaml silently produce incorrect output
**Details**: `loadSwarmConfig()` applies defaults but never validates. If a user types `autonomy: auot` (typo), it passes through without warning. If they add `agents.developer.enbled: false` (typo), the agent is not disabled. There is no validation for:
- Valid enum values (autonomy, project type, phase names)
- Valid agent names in the `agents` section
- Required fields
- Type checking (e.g., `parallel_devs` should be a number)
**Recommendation**: Add a `validateConfig()` function that checks against a schema. This could use a simple hand-written validator or adopt a lightweight schema library (Ajv, Zod, or even JSON Schema). Emit clear error messages for validation failures.

#### 1.3 Settings Generation Duplication
**Files**: `cli/init.js:271-283` and `cli/update.js:91-102`
**Impact**: Settings generation logic is duplicated, risking divergence
**Details**: Both `init.js` and `update.js` contain identical inline logic for generating `.claude/settings.json`. If the settings structure changes, both files must be updated.
**Recommendation**: Extract `generateSettings()` into a shared generator (either in `generators/settings-generator.js` or within the existing `hooks-generator.js`). The template at `templates/settings.json.template` already exists but is not used by either command.

#### 1.4 No Error Recovery in Init
**File**: `cli/init.js:53-134`
**Impact**: If init fails partway through, the project is left in a partial state
**Details**: `runInit()` performs 9 sequential steps (write swarm.yaml, load config, generate agents, generate settings, generate hooks, generate CLAUDE.md, create artifact dirs, write project.yaml, create overrides dir). If any step fails, previous steps' output remains on disk with no cleanup.
**Recommendation**: Either implement a rollback mechanism (track created files and remove them on failure) or, more pragmatically, make init detect and handle partial states gracefully (e.g., re-running init after partial failure should work or provide clear guidance).

### Priority 2: Important Gaps

#### 2.1 Quality Gate Enforcement Is Purely Documentation
**Files**: `methodology/quality-gates/*.md` (5 files)
**Impact**: Quality gates depend entirely on agents reading and following markdown instructions
**Details**: The quality gates (prd-quality, architecture-quality, story-quality, code-quality, review-quality) are detailed markdown checklists. They exist as documentation that agents are expected to read and apply. There is no programmatic validation. The hooks generator creates shell scripts that log messages but perform no actual validation.
**Recommendation**: Build a `validate` command that programmatically checks artifacts against quality gate criteria. For example:
- PRD validation: Check for required sections (regex-based section detection), check that FRs are numbered, check that NFRs contain numeric targets
- Architecture validation: Check for required sections, check that ADR files exist in the decisions directory
- Story validation: Check for BDD format acceptance criteria, check for task checklists
This would not replace agent judgment but would catch obvious omissions.

#### 2.2 No `bmad-swarm validate` Command
**Impact**: Users cannot verify artifact quality without manually reading quality gate docs
**Details**: After agents produce artifacts, there is no way to programmatically check them. A `validate` command could:
- Validate swarm.yaml against schema
- Validate project.yaml for consistent state
- Validate artifacts in each phase directory against their schemas
- Report quality gate pass/fail status
**Recommendation**: Add `bmad-swarm validate [--phase <name>] [--artifact <path>]` command.

#### 2.3 No `bmad-swarm doctor` Command
**Impact**: Diagnosing configuration problems requires manual inspection
**Details**: Common issues (missing agents, outdated CLAUDE.md, broken hooks, orphaned artifacts) are not detectable. A `doctor` command could check:
- All agents exist and match expected count
- CLAUDE.md is up-to-date with swarm.yaml (content hash comparison)
- Hooks exist and are executable
- project.yaml phase is consistent with artifact directory contents
- Overrides directory has valid agent names
**Recommendation**: Add `bmad-swarm doctor` that reports health status and suggests fixes.

#### 2.4 Template Engine Limitations
**File**: `utils/template.js`
**Impact**: Cannot express many useful patterns in templates
**Details**: The template engine supports only two constructs:
1. `{{key.path}}` -- variable substitution
2. `{{#if key}}...{{/if}}` -- conditional blocks

Missing features:
- **No `{{#else}}`** -- Cannot provide alternate content when condition is false
- **No `{{#each}}`** -- Cannot iterate over arrays (e.g., listing agents dynamically)
- **No partials/includes** -- Cannot compose templates from reusable fragments
- **No negation** -- Cannot do `{{#unless key}}` or `{{#if !key}}`
- **No array join** -- Values like `require_human_approval` (an array) render as literal JS array

**Evidence**: In `templates/CLAUDE.md.template:47`, the placeholder `{{methodology.quality.require_human_approval_list}}` is used but no `_list` property is constructed in `buildTemplateData()` (in `generators/claude-md-generator.js`). This means the CLAUDE.md renders with `{{methodology.quality.require_human_approval_list}}` literally unsubstituted in the output.

**Recommendation**: Either:
(a) Add `{{#each}}`, `{{#else}}`, and array-to-string formatting to the template engine
(b) Switch to a lightweight template library (Handlebars, eta, mustache)
(c) Keep the engine simple but add pre-processing to convert arrays to formatted strings in `buildTemplateData()`

#### 2.5 No Phase State Machine
**Files**: `methodology/phases.yaml`, `project.yaml`
**Impact**: Phase transitions are not enforced; agents can produce artifacts out of order
**Details**: `phases.yaml` defines a rich state machine (phases, gates, transitions, entry points) but this exists only as documentation. The `project.yaml` file has a `phase` field but it is set once during init (`not-started`) and never programmatically updated or validated. Nothing prevents an agent from writing to `artifacts/implementation/stories/` while the project is still in the `exploration` phase.
**Recommendation**: Add runtime phase validation:
- `bmad-swarm phase` -- show current phase
- `bmad-swarm phase advance` -- advance to next phase if gate criteria are met
- Optionally, hooks that check current phase before allowing artifact writes

### Priority 3: Nice-to-Have Improvements

#### 3.1 No `bmad-swarm diff` Command
**Impact**: After editing swarm.yaml, users cannot preview what `update` would change
**Details**: `update --dry-run` exists but only lists which files would be regenerated, not what would change in them. A proper diff would show the actual content differences.
**Recommendation**: Add `bmad-swarm diff` that generates to a temp directory and diffs against current output.

#### 3.2 No `bmad-swarm reset` Command
**Impact**: No way to cleanly reset to initial state for re-initialization
**Details**: If a user wants to start over, they must manually delete `.claude/`, `artifacts/`, `project.yaml`, `CLAUDE.md`, and `overrides/`. A `reset` command with confirmation would be safer.
**Recommendation**: Add `bmad-swarm reset [--hard]` with interactive confirmation.

#### 3.3 No `bmad-swarm migrate` Command
**Impact**: Users upgrading the package have no migration path for config changes
**Details**: If a future version changes the swarm.yaml schema, CLAUDE.md template, or agent format, users have no automated way to update. Their existing swarm.yaml may become incompatible.
**Recommendation**: Add a version field to swarm.yaml and a migration system that can transform configs between versions.

#### 3.4 No Plugin System
**Impact**: Cannot extend the tool with custom agents, generators, or commands
**Details**: The agent list is hardcoded in `AGENT_NAMES` array (`utils/config.js:99-109`). Adding a new agent requires modifying the source code. Custom generators or hooks require forking.
**Recommendation**: Consider a plugin system where users can register:
- Custom agent templates (beyond the 9 built-in)
- Custom generators (e.g., generating Dockerfile, CI configs)
- Custom commands
This could be as simple as a `plugins` directory convention or a `plugins` section in swarm.yaml.

#### 3.5 No Monorepo Support
**Impact**: Cannot manage multiple projects within a single repository
**Details**: The tool assumes a single project root with one swarm.yaml. Monorepo setups (e.g., `packages/frontend`, `packages/api`) would require separate initialization in each package, with no shared configuration or cross-project orchestration.
**Recommendation**: Add `project.type: monorepo` support with a workspace-aware config structure.

---

## Code Quality Issues

### Issue 1: Unreplaced Template Placeholder
**File**: `templates/CLAUDE.md.template:47`
**Severity**: Bug
**Details**: The template uses `{{methodology.quality.require_human_approval_list}}` but `buildTemplateData()` in `generators/claude-md-generator.js` never creates this property. The array `require_human_approval` is an array `['prd', 'architecture']` which would render as `prd,architecture` if accessed directly, but the template uses a `_list` suffix that does not exist. The current CLAUDE.md output literally contains `{{methodology.quality.require_human_approval_list}}` as text.
**Fix**: Add `require_human_approval_list: config.methodology.quality.require_human_approval.join(', ')` to the data object in `buildTemplateData()`.

### Issue 2: Autonomy-Level Conditional Flags Not Set
**File**: `templates/CLAUDE.md.template:27-30`
**Severity**: Bug
**Details**: The template uses `{{#if methodology.autonomy_auto}}`, `{{#if methodology.autonomy_guided}}`, and `{{#if methodology.autonomy_collaborative}}` but `buildTemplateData()` never sets these boolean flags. The autonomy description section in the generated CLAUDE.md is always empty.
**Fix**: Add boolean flags to the data object:
```javascript
methodology: {
  ...config.methodology,
  autonomy_auto: config.methodology.autonomy === 'auto',
  autonomy_guided: config.methodology.autonomy === 'guided',
  autonomy_collaborative: config.methodology.autonomy === 'collaborative',
}
```

### Issue 3: Scan Command Has Unused `resolve` Import
**File**: `cli/scan.js:1`
**Severity**: Minor (dead import)
**Details**: `resolve` is imported from `node:path` but only used conditionally (line 120). The import is not unused per se, but the overall detection logic could be improved.

### Issue 4: Settings Template Exists But Is Not Used
**File**: `templates/settings.json.template`
**Severity**: Design inconsistency
**Details**: A settings.json template file exists in the templates directory, but both `init.js` and `update.js` generate settings inline with hardcoded values. The template is never read or rendered.
**Fix**: Either use the template file through the template engine or remove it to avoid confusion.

### Issue 5: `copyFileSafe` and `fileExists` Unused
**File**: `utils/fs-helpers.js:37-49`
**Severity**: Minor (dead code)
**Details**: `copyFileSafe` and `fileExists` are exported but never imported or used anywhere in the codebase.
**Fix**: Remove dead code or mark as intentionally available for future use.

### Issue 6: Idempotency Test Missing `ideator` Agent
**File**: `test/idempotent.test.js:49`
**Severity**: Minor (incomplete test)
**Details**: The idempotency test checks agents `['orchestrator', 'researcher', 'strategist', 'architect', 'story-engineer', 'developer', 'reviewer', 'qa']` but does not include `'ideator'` in the list. The ideator agent was added after this test was written.
**Fix**: Add `'ideator'` to the `agentFiles` array.

---

## Testing Improvements

### Current Coverage

| Area | Tests | Status |
|------|-------|--------|
| Template engine | 11 tests | Good: covers simple, nested, conditional, unknown vars |
| Config loading | 6 tests | Good: covers defaults, user values, missing file, ideation |
| Agent generator | 6 tests | Good: covers generation, disable, extra_context, eject |
| Eject/Uneject | 4 tests | Good: covers eject, uneject, errors |
| CLAUDE.md generator | 1 test | Minimal: only checks file exists and contains project name |
| Hooks generator | 1 test | Minimal: only checks files exist and start with shebang |
| Idempotency | 2 tests | Good: covers double-run and eject survival |
| Ideation feature | 13 tests | Good: covers agent file, phases, entry points, transitions |
| **CLI commands** | **0 tests** | **Missing** |
| **Scan command** | **0 tests** | **Missing** |
| **Status command** | **0 tests** | **Missing** |
| **Error paths** | **~3 tests** | **Insufficient** |

### Missing Test Categories

1. **CLI Integration Tests**: No tests exercise the actual CLI commands (`init`, `update`, `eject`, `uneject`, `scan`, `status`). These commands are tested only indirectly through the generators they call.

2. **Scan Command Tests**: The `scan.js` file has complex detection logic for Node.js, Python, Go, and Rust projects. None of this is tested. Specific gaps:
   - No test for `detectLanguageFromPackageJson()` detecting TypeScript vs JavaScript
   - No test for `detectFrameworkFromPackageJson()` across all supported frameworks
   - No test for `detectTestingFromPackageJson()`
   - No test for `detectDatabaseFromPackageJson()`
   - No test for `detectProjectTypeFromPackageJson()`
   - No test for Python, Go, or Rust detection
   - No test for `generateProjectContext()`

3. **CLAUDE.md Content Tests**: The single test checks for project name presence but does not verify:
   - Conditional sections render correctly (framework, database, testing)
   - Agent table is complete
   - Phases section reflects config
   - Quality standards reflect config
   - The two template bugs (unreplaced placeholders) are caught

4. **Hook Content Tests**: The single test checks for bash shebang but does not verify:
   - Config values are properly interpolated into hook scripts
   - Quality gate checks are conditional on config

5. **Error Path Tests**: Limited coverage of error scenarios:
   - No test for init on an already-initialized project
   - No test for update without swarm.yaml
   - No test for malformed YAML
   - No test for invalid config values

6. **Cross-Platform Tests**: No verification that generated output works on Windows (or even that path separators are correct).

### Recommended Test Additions (Priority Order)

1. **Scan command unit tests** -- Test each detection function with mock package.json/requirements.txt data
2. **CLAUDE.md content validation tests** -- Verify template rendering produces correct output for various configs
3. **CLI integration tests** -- Use child_process to test actual CLI invocations
4. **Error path tests** -- Cover malformed input, partial state, and invalid operations
5. **Template engine edge cases** -- Nested conditionals, boolean false vs undefined, arrays as values

---

## Platform/Compatibility Issues

### 1. Bash Hooks on Windows
**Severity**: Critical for Windows users
**Files**: `generators/hooks-generator.js`
**Details**: Generated hooks use `#!/bin/bash` and bash syntax (`[[ ]]`, `$VAR`). These do not work on Windows natively. Even with Git Bash or WSL, Claude Code may not route hook execution through bash.
**Recommendation**: Use Node.js scripts for hooks (`.js` files with `#!/usr/bin/env node`). This is cross-platform and consistent with the tool's own runtime.

### 2. Path Separator Handling
**Severity**: Low (Node.js handles this, but generated content may not)
**Files**: `utils/paths.js`, all generators
**Details**: The codebase uses `join()` from `node:path` for filesystem paths (correct), but some template output and configuration values use hardcoded forward slashes (`./artifacts`, `./src`). This is generally fine because most tools accept forward slashes on Windows, but it could cause issues in edge cases.

### 3. No Shebang Handling for npx
**File**: `bin/bmad-swarm.js:1`
**Details**: The shebang `#!/usr/bin/env node` is correct for Unix systems. On Windows, npm handles the shebang translation via .cmd wrapper. No issues expected here, but worth noting.

### 4. Temp Directory Usage in Tests
**Files**: `test/idempotent.test.js`, `test/config.test.js`, `test/generators.test.js`
**Details**: Tests use `os.tmpdir()` which works cross-platform. Tests create and clean up temp directories correctly. No issues found.

---

## Scalability Considerations

### 1. Agent Count Scaling
The current architecture supports exactly 9 agents. Adding more requires:
- Adding the markdown template to `agents/`
- Adding the name to `AGENT_NAMES` in `utils/config.js`
- Updating `CLAUDE.md.template` agent table
- Updating `README.md`

There is no dynamic agent discovery. If the tool grows to 15-20 agents, this manual process becomes error-prone.

**Recommendation**: Auto-discover agents by scanning the `agents/` directory rather than maintaining a hardcoded list.

### 2. Methodology Extensibility
The methodology (phases, gates, transitions, task templates) is defined in YAML files that are read by agents, not by the tool's code. This means:
- The tool cannot validate methodology configurations
- The tool cannot enforce phase transitions
- Custom methodologies require modifying package files (no user-level override)

**Recommendation**: Add methodology overrides similar to agent overrides (`overrides/methodology/` directory).

### 3. Multi-Project / Multi-Team
No support for:
- Multiple swarm.yaml files in a monorepo
- Shared agent configurations across projects
- Team-level settings (e.g., all projects in an org use the same reviewer rules)

**Recommendation**: For enterprise use, consider a hierarchical config system: org-level -> team-level -> project-level settings that merge together.

### 4. Generated File Volume
Currently generates approximately 15 files per project. This scales linearly and is not a performance concern. The entire generation process completes in under 100ms.

---

## Missing Agent Capabilities

### 1. No DevOps/Infrastructure Agent
The current agent set covers the SDLC from ideation through code review but has no agent for:
- CI/CD pipeline configuration
- Docker/container setup
- Cloud infrastructure (Terraform, AWS CDK)
- Environment configuration
- Monitoring and alerting setup

**Recommendation**: Add an `infra` or `devops` agent for deployment and operations tasks.

### 2. No Documentation Agent
While the researcher can produce documentation, there is no dedicated agent for:
- API documentation generation
- User-facing documentation (guides, tutorials)
- Architecture diagram generation
- README maintenance
- Changelog generation

**Recommendation**: Add a `tech-writer` agent for documentation tasks.

### 3. No Security Specialist Agent
Security review is handled by the reviewer agent as a secondary concern. For projects in regulated industries or with sensitive data, a dedicated security agent could:
- Perform threat modeling
- Audit dependencies for known vulnerabilities
- Validate compliance requirements
- Review authentication and authorization implementations specifically

**Recommendation**: Consider an optional `security` agent activated for projects with security-sensitive requirements.

### 4. Orchestrator Could Be More Prescriptive
The orchestrator agent template is comprehensive (101 lines of behavioral rules) but relies entirely on the LLM's judgment to:
- Assess complexity correctly
- Select the right team composition
- Build an appropriate task graph
- Enforce quality gates

There are no structured decision tables or algorithms the orchestrator can reference. Everything is prose-based guidance.

**Recommendation**: Add structured decision matrices to the orchestrator's context:
- Complexity assessment rubric (score-based)
- Team composition lookup table (complexity -> agents)
- Phase skip decision tree (context -> which phases to run)

---

## Recommended Improvements

### Quick Wins (< 1 day each)

1. **Fix CLAUDE.md template bugs** -- Add `require_human_approval_list` and autonomy boolean flags to `buildTemplateData()`. (~30 min)
2. **Extract settings generation** -- Create `generators/settings-generator.js` and use it from both init and update. (~30 min)
3. **Remove dead code** -- Remove unused `copyFileSafe` and `fileExists` from `utils/fs-helpers.js`. (~10 min)
4. **Fix idempotency test** -- Add `ideator` to the agent list in `test/idempotent.test.js`. (~10 min)
5. **Add scan command unit tests** -- Test detection functions in isolation with mock data. (~2-4 hours)
6. **Add CLAUDE.md content tests** -- Verify template rendering for various configurations. (~2-4 hours)

### Medium Effort (1-3 days each)

7. **Add swarm.yaml schema validation** -- Validate config on load with clear error messages. (~1 day)
8. **Cross-platform hooks** -- Generate Node.js hooks instead of bash scripts. (~1 day)
9. **Add `validate` command** -- Programmatic artifact quality checking. (~2-3 days)
10. **Add `doctor` command** -- Configuration health check. (~1 day)
11. **Add CLI integration tests** -- Test actual CLI commands end-to-end. (~1-2 days)
12. **Improve template engine** -- Add `{{#each}}`, `{{#else}}`, and array formatting. (~1 day)

### Major Investments (1+ weeks each)

13. **Runtime phase state machine** -- Programmatic phase tracking, transition validation, and artifact gating. (~1-2 weeks)
14. **Plugin system** -- User-extensible agents, generators, and commands. (~1-2 weeks)
15. **Artifact validation engine** -- Parse artifacts and validate against quality gate criteria programmatically. (~2-3 weeks)
16. **Monorepo support** -- Workspace-aware configuration and multi-project orchestration. (~1-2 weeks)
17. **CI/CD integration** -- GitHub Actions workflow generation, publish automation, version management. (~1 week)
18. **Dynamic agent discovery** -- Auto-detect agents from filesystem instead of hardcoded list. (~2-3 days)

---

## Summary of File References

| File | Key Finding |
|------|-------------|
| `generators/hooks-generator.js` | Bash-only hooks, Windows incompatible |
| `generators/claude-md-generator.js:41-76` | Missing template data properties cause unreplaced placeholders |
| `templates/CLAUDE.md.template:27-30,47` | References undefined template variables |
| `utils/config.js:99-109` | Hardcoded agent list, no validation |
| `utils/template.js` | No loops, no else, no array formatting |
| `utils/fs-helpers.js:37-49` | Dead code (unused exports) |
| `cli/init.js:271-283` | Duplicated settings generation |
| `cli/update.js:91-102` | Duplicated settings generation |
| `cli/scan.js` | Complex detection logic with zero tests |
| `test/idempotent.test.js:49` | Missing ideator in agent list |
| `templates/settings.json.template` | Exists but is never used |
| `methodology/quality-gates/*.md` | Documentation only, no programmatic enforcement |
| `methodology/phases.yaml` | Rich state machine definition, no runtime enforcement |
