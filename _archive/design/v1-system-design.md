# BMAD Swarm - System Design Specification

## 1. Vision

BMAD Swarm is an autonomous development organization powered by Claude Code Agent Teams. The human operates as **product owner** - describing what they want built, providing research and context, making key product decisions. The swarm handles everything else: research, documentation, architecture, implementation, testing, and review.

The system is distributed as an **npm package** that installs a reusable methodology. Each project gets a thin config file (`swarm.yaml`) that customizes behavior. Agent definitions, quality gates, and orchestration logic live in the package and are updatable independently of project-specific configuration.

### Core Principles

1. **The methodology is the orchestrator** - No workflow XML or step files. The team lead carries the SDLC knowledge and dynamically builds the right task graph for each situation.
2. **Complexity-adaptive autonomy** - The system adjusts how much it involves the human based on project scope. Small tasks run end-to-end. Large projects check in at phase boundaries.
3. **Artifacts as integration** - Agents coordinate through files on disk, not message passing. PRDs, architecture docs, stories are written to a known location. Downstream agents read what they need.
4. **Enter anywhere** - The system handles the full spectrum from "I have a vague idea" to "fix this bug." Different entry points trigger different team shapes and process depths.
5. **Reusable, not copy-pasted** - The methodology is a package dependency. Projects consume it through configuration, not by owning the source files.

---

## 2. System Architecture

### 2.1 Package Structure (what you install)

```
@bmad/swarm/
├── package.json
├── bin/
│   └── bmad-swarm.js           # CLI entry point
├── cli/
│   ├── init.js                 # Project initialization
│   ├── update.js               # Regenerate from package + config
│   ├── eject.js                # Copy agent to local overrides
│   └── scan.js                 # Codebase analysis for brownfield
├── agents/
│   ├── orchestrator.md         # Team lead - methodology brain
│   ├── researcher.md           # Discovery & analysis
│   ├── strategist.md           # Product strategy & PRD
│   ├── architect.md            # Technical design
│   ├── story-engineer.md       # Context-rich story creation
│   ├── developer.md            # Implementation
│   ├── reviewer.md             # Adversarial code review
│   └── qa.md                   # Test engineering
├── methodology/
│   ├── phases.yaml             # Phase definitions & transitions
│   ├── task-templates/         # Reusable task graph patterns
│   │   ├── exploration.yaml
│   │   ├── planning.yaml
│   │   ├── design.yaml
│   │   ├── implementation.yaml
│   │   └── full-lifecycle.yaml
│   ├── quality-gates/          # Validation criteria per phase
│   │   ├── prd-quality.md
│   │   ├── architecture-quality.md
│   │   ├── story-quality.md
│   │   ├── code-quality.md
│   │   └── review-quality.md
│   └── artifact-schemas/       # What good artifacts look like
│       ├── product-brief.md
│       ├── prd.md
│       ├── architecture.md
│       ├── epic.md
│       ├── story.md
│       └── project-context.md
├── templates/
│   ├── swarm.yaml.template     # Default project config
│   ├── CLAUDE.md.template      # Generated CLAUDE.md template
│   └── settings.json.template  # Claude Code settings
└── generators/
    ├── agent-generator.js      # Merges package agents + config overrides
    ├── claude-md-generator.js  # Builds CLAUDE.md from config
    └── hooks-generator.js      # Creates quality gate hooks
```

### 2.2 Project Structure (what gets generated)

```
my-project/
├── .claude/
│   ├── agents/                 # GENERATED - from package + swarm.yaml
│   │   ├── orchestrator.md
│   │   ├── researcher.md
│   │   ├── strategist.md
│   │   ├── architect.md
│   │   ├── story-engineer.md
│   │   ├── developer.md
│   │   ├── reviewer.md
│   │   └── qa.md
│   ├── hooks/                  # GENERATED - quality gate enforcement
│   │   ├── TaskCompleted.sh
│   │   └── TeammateIdle.sh
│   └── settings.json           # GENERATED - agent teams enabled
├── CLAUDE.md                   # GENERATED - project context + methodology
├── swarm.yaml                  # USER-OWNED - project configuration
├── overrides/                  # USER-OWNED - ejected agent customizations
├── artifacts/                  # PRODUCED - all swarm output
│   ├── exploration/            # Research, brainstorming, analysis
│   ├── planning/               # Product brief, PRD
│   ├── design/                 # Architecture, UX, technical decisions
│   ├── implementation/         # Stories, sprint status
│   ├── reviews/                # Code reviews, retrospectives
│   └── context/                # Project context, decision log
├── project.yaml                # MAINTAINED - living project state
└── src/                        # The actual codebase
```

### 2.3 Layering Model

When generating `.claude/agents/` files, layers merge in priority order:

```
Layer 1: Package defaults (base agent definitions)
    ↓ overridden by
Layer 2: swarm.yaml agent config (project-level tweaks)
    ↓ overridden by
Layer 3: overrides/ directory (fully ejected custom agents)
    ↓ produces
Output: .claude/agents/*.md (what Claude Code loads)
```

**Merge behavior:**
- Layer 2 (swarm.yaml) can add `extra_context`, toggle features, adjust parameters
- Layer 3 (ejected) completely replaces the package version for that agent
- `bmad-swarm update` regenerates Layer 1+2 output but never touches Layer 3

---

## 3. The Orchestrator

The orchestrator is the team lead. It runs in **delegate mode** - it never writes code or produces artifacts directly. Its job is to understand the methodology, assess the situation, build the right team, create the task graph, and manage execution.

### 3.1 Complexity Assessment

When the human provides a request, the orchestrator evaluates:

| Factor | Low | Medium | High |
|--------|-----|--------|------|
| Scope | Single feature, bug fix | Multi-feature, new module | Full application, platform |
| Clarity | Specific requirements | General direction | Vague concept |
| Technical risk | Known patterns | Some unknowns | Novel technology |
| Codebase | Greenfield or small | Medium existing codebase | Large complex codebase |
| Dependencies | Self-contained | Some integrations | Multiple external systems |

Based on this assessment, the orchestrator determines:
- **Autonomy level**: auto / guided / collaborative
- **Team size**: 1-6+ agents
- **Process depth**: which phases to run
- **Check-in frequency**: when to involve the human

### 3.2 Team Composition

The orchestrator spawns only the agents needed:

| Scenario | Agents Spawned |
|----------|---------------|
| Bug fix | developer |
| Small feature | developer + reviewer |
| New module | strategist + architect + developer + reviewer |
| Full application | researcher + strategist + architect + story-engineer + developer(s) + reviewer + qa |
| Exploration only | researcher + strategist (no builders) |

### 3.3 Task Graph Generation

The orchestrator builds a dependency graph of tasks, not a linear sequence. Tasks have:
- **id**: Unique identifier
- **type**: research / artifact / implementation / validation / decision
- **agent**: Which specialist handles it
- **inputs**: What artifacts/info it needs (maps to `blockedBy`)
- **outputs**: What it produces
- **quality_gate**: Validation criteria for completion

Example task graph for a medium project:

```
[research-domain]──────────┐
[research-technical]────────┤
                            ├──[create-brief]──[create-prd]──┬──[create-ux]
                            │                                │
                            │                   [HUMAN: approve PRD]
                            │                                │
                            │                  [create-architecture]
                            │                                │
                            │                [create-epics-stories]
                            │                                │
                            │              [check-readiness]──[HUMAN: approve]
                            │                                │
                            │                    [sprint-planning]
                            │                         │
                            │          ┌──────────────┼──────────────┐
                            │    [story-1.1]    [story-1.2]    [story-1.3]
                            │         │              │              │
                            │    [dev-1.1]      [dev-1.2]      [dev-1.3]
                            │         │              │              │
                            │   [review-1.1]  [review-1.2]  [review-1.3]
                            │         │              │              │
                            └─────────┴──────────────┴──[retrospective]
```

### 3.4 Autonomy Management

The orchestrator inserts **decision points** into the task graph based on autonomy level:

- **auto**: No decision points. Orchestrator makes all calls. Reports results at the end.
- **guided**: Decision points at phase boundaries. "Here's the PRD - approve to continue?"
- **collaborative**: Decision points at phase boundaries AND within phases for key choices. "I see two architecture approaches - which do you prefer?"

Decision points are tasks of type `decision` that block downstream work until the human responds.

### 3.5 Context Curation

The orchestrator assembles context briefings for each agent based on their task:

- **Researcher**: Gets the human's description, any provided research, project.yaml
- **Strategist**: Gets research outputs, human's vision, competitive context
- **Architect**: Gets PRD, technical constraints, existing codebase analysis
- **Story engineer**: Gets PRD, architecture, UX, previous story learnings
- **Developer**: Gets the story file, project-context.md, relevant architecture sections
- **Reviewer**: Gets the story file, the code changes, architecture constraints

Context is curated via the **spawn prompt** when creating each teammate - this is how Agent Teams passes initial context.

---

## 4. Agent Definitions

Each agent has a consistent structure:

```markdown
# Agent Name

## Role
What this agent does - its primary responsibility

## Expertise
Deep domain knowledge this agent carries

## Inputs
What artifacts/information this agent needs to do its work

## Outputs
What artifacts this agent produces

## Quality Criteria
How this agent validates its own work before marking complete

## Behavioral Rules
How this agent operates, communicates, and coordinates
```

### 4.1 Orchestrator

- **Role**: Team lead. Understands full SDLC methodology. Assesses complexity, builds teams, creates task graphs, manages execution. Never does implementation work directly.
- **Mode**: Always runs in delegate mode
- **Key behaviors**:
  - Reads project.yaml to understand current state
  - Assesses incoming request complexity
  - Spawns appropriate teammates with context-curated prompts
  - Creates task list with proper dependencies
  - Monitors progress via task list status
  - Inserts decision points for human involvement
  - Escalates blockers to human
  - Shuts down teammates and cleans up when done

### 4.2 Researcher

- **Role**: Discovery, analysis, and context acquisition
- **Outputs**: Research artifacts (market analysis, domain analysis, technical feasibility, codebase analysis)
- **Key behaviors**:
  - Can perform web research for market/domain/technical context
  - Can scan existing codebases to understand structure and patterns
  - Produces structured research documents
  - Identifies risks, opportunities, and constraints
  - For brownfield: generates project-context.md from codebase scan

### 4.3 Product Strategist

- **Role**: Product definition and requirements
- **Outputs**: Product brief, PRD
- **Key behaviors**:
  - Synthesizes research into product strategy
  - Creates comprehensive PRDs with functional and non-functional requirements
  - Defines user journeys and success metrics
  - Prioritizes features for MVP scope
  - In collaborative mode: presents options with tradeoffs to human

### 4.4 Architect

- **Role**: Technical design and system architecture
- **Outputs**: Architecture document, technical decisions, technology selections
- **Key behaviors**:
  - Translates PRD requirements into technical design
  - Makes technology selections with rationale
  - Defines API contracts, data models, system boundaries
  - Documents architectural decisions (ADRs)
  - Validates technical feasibility of requirements
  - Considers developer productivity and maintainability

### 4.5 Story Engineer

- **Role**: Creating implementation-ready story files with comprehensive context
- **Outputs**: Story files with acceptance criteria, tasks, dev notes, architecture compliance requirements
- **Key behaviors**:
  - Extracts requirements from PRD, architecture, and UX artifacts
  - Creates stories with BDD-formatted acceptance criteria
  - Includes "dev notes" section with everything the developer needs
  - Analyzes previous story learnings and feeds them forward
  - Performs web research for latest library/framework specifics
  - Validates story completeness before marking ready-for-dev

### 4.6 Developer

- **Role**: Story implementation following TDD practices
- **Outputs**: Working code and tests
- **Key behaviors**:
  - Reads story file as authoritative implementation guide
  - Follows red-green-refactor cycle
  - Implements tasks/subtasks in exact order specified
  - Writes comprehensive tests (unit, integration, e2e as required)
  - Updates story file with completion status, file list, dev notes
  - Halts on blockers rather than making assumptions
  - Never lies about test status

### 4.7 Reviewer

- **Role**: Adversarial code review and quality assurance
- **Outputs**: Review reports with categorized findings and action items
- **Key behaviors**:
  - Reviews against story acceptance criteria
  - Checks architecture compliance
  - Identifies security vulnerabilities, performance issues
  - Validates test coverage and quality
  - Categorizes findings by severity (high/med/low)
  - Produces actionable review with specific fix recommendations

### 4.8 QA Engineer

- **Role**: Test strategy and automated test creation
- **Outputs**: Test suites, test plans, coverage reports
- **Key behaviors**:
  - Designs test strategy based on architecture and risk
  - Creates E2E tests for critical user flows
  - Generates API tests for service contracts
  - Identifies gaps in existing test coverage
  - Validates non-functional requirements (performance, security)

---

## 5. Methodology

### 5.1 Phases

The methodology has five phases, but not all are required for every project:

#### Phase 1: Exploration
- **Purpose**: Understand the problem space, research options, validate feasibility
- **Agents**: researcher, (strategist for devil's advocate)
- **Artifacts**: Research documents, feasibility analysis, competitive landscape
- **Gate**: Human confirms understanding is sufficient to proceed
- **Skip when**: Requirements are already clear, small scope

#### Phase 2: Definition
- **Purpose**: Define what to build - requirements, scope, success criteria
- **Agents**: strategist
- **Artifacts**: Product brief, PRD
- **Gate**: PRD passes quality check, human approves scope
- **Skip when**: Bug fix, small feature with obvious scope

#### Phase 3: Design
- **Purpose**: Technical and UX design decisions
- **Agents**: architect, (researcher for UX patterns)
- **Artifacts**: Architecture document, UX design (if applicable), technical ADRs
- **Gate**: Architecture passes quality check, aligns with PRD
- **Skip when**: Single-file change, trivial implementation

#### Phase 4: Implementation
- **Purpose**: Build, test, review
- **Agents**: story-engineer, developer(s), reviewer, qa
- **Artifacts**: Stories, source code, tests, review reports
- **Gate**: All stories complete, all tests pass, reviews approved
- **Sub-phases**:
  1. Sprint planning (story-engineer creates all stories)
  2. Story development (developers implement in parallel)
  3. Code review (reviewer validates each story)
  4. QA validation (qa runs/creates test suites)

#### Phase 5: Delivery
- **Purpose**: Final validation, documentation, handoff
- **Agents**: reviewer, qa, (researcher for final docs)
- **Artifacts**: Final review, test report, project documentation
- **Gate**: All quality gates pass, human accepts delivery

### 5.2 Entry Points

The orchestrator determines the entry point based on context:

| Situation | Entry Point | Phases Run |
|-----------|-------------|------------|
| "I have a vague idea" | Exploration | 1 → 2 → 3 → 4 → 5 |
| "Build X with these requirements" | Definition | 2 → 3 → 4 → 5 |
| "Add feature Y to this project" | Design or Implementation | 3 → 4 → 5 or 4 → 5 |
| "Fix this bug" | Implementation | 4 (abbreviated) |
| "Help me think about Z" | Exploration | 1 only (stays in exploration) |
| "Refactor the auth system" | Design | 3 → 4 → 5 |

### 5.3 Quality Gates

Each quality gate is a validation that runs when an agent marks a task complete:

- **Artifact quality**: Does the produced document meet the schema requirements?
- **Completeness**: Are all required sections present and substantive?
- **Consistency**: Does this artifact align with upstream artifacts?
- **Specificity**: Are requirements testable and unambiguous?
- **Coverage**: Does the implementation satisfy all acceptance criteria?

Quality gates can be enforced via:
1. Agent self-validation (built into each agent's behavioral rules)
2. Reviewer agent validation (adversarial cross-check)
3. Hook enforcement (TaskCompleted hooks that reject incomplete work)

---

## 6. Configuration System

### 6.1 swarm.yaml Schema

```yaml
# Project identity
project:
  name: string                    # Project name
  description: string             # What this project does
  type: enum                      # web-app | api | cli | library | mobile | monorepo | other

# Technology stack (auto-detected for brownfield, specified for greenfield)
stack:
  language: string                # Primary language
  framework: string               # Primary framework (optional)
  database: string                # Database (optional)
  testing: string                 # Test framework (optional)
  additional: string[]            # Other key technologies

# Methodology configuration
methodology:
  autonomy: enum                  # auto | guided | collaborative (default: guided)

  phases:
    exploration:
      enabled: boolean            # default: true
    definition:
      enabled: boolean            # default: true
    design:
      enabled: boolean            # default: true
    implementation:
      enabled: boolean            # default: true
      parallel_devs: number       # max concurrent dev agents (default: 2)
    delivery:
      enabled: boolean            # default: true

  quality:
    require_tests: boolean        # default: true
    require_review: boolean       # default: true
    require_human_approval:       # which artifacts need human sign-off
      - prd                       # default: [prd, architecture]
      - architecture

# Agent customization
agents:
  <agent-name>:
    enabled: boolean              # toggle agents on/off
    model: enum                   # sonnet | opus | haiku (override model per agent)
    extra_context: string         # additional instructions appended to agent
    extra_rules: string[]         # additional behavioral rules

# Output configuration
output:
  artifacts_dir: string           # default: ./artifacts
  code_dir: string                # default: ./src
```

### 6.2 Eject Mechanism

```bash
# Eject an agent for full customization
bmad-swarm eject agent orchestrator

# This copies the package's orchestrator.md to overrides/agents/orchestrator.md
# That local copy now takes priority
# bmad-swarm update will NOT overwrite it
# A comment at the top marks it as ejected with the source version

# Un-eject (return to package version)
bmad-swarm uneject agent orchestrator
# Deletes the local override, next update regenerates from package
```

---

## 7. Context Management

### 7.1 Auto-Scan (Brownfield)

When initializing on an existing project (`bmad-swarm init --scan`), the system:

1. **Detects language/framework** from package.json, requirements.txt, go.mod, Cargo.toml, etc.
2. **Maps folder structure** to understand project organization
3. **Identifies test framework** from config files and existing test directories
4. **Reads existing docs** (README, existing architecture docs, API docs)
5. **Analyzes recent git history** for active development patterns
6. **Produces `project-context.md`** summarizing everything discovered

### 7.2 Project Context File

A living document maintained by the orchestrator as work progresses:

```markdown
# Project Context

## Identity
- Project: [name]
- Type: [web-app, api, etc.]
- Stack: [language, framework, key deps]

## Architecture
- Structure: [folder layout, key directories]
- Patterns: [architecture style, design patterns in use]
- Conventions: [naming, file organization, code style]

## Current State
- Phase: [exploration | definition | design | implementation | delivery]
- Active work: [what's currently being built/changed]
- Completed: [what's been finished]
- Known issues: [blockers, tech debt, open questions]

## Decision Log
- [date]: [decision made and rationale]
- [date]: [decision made and rationale]

## Agent Notes
- [agent]: [observations, learnings, patterns established]
```

### 7.3 Context Curation per Agent

The orchestrator includes relevant context in each teammate's spawn prompt:

```
For a developer working on story 2.3:
- project-context.md (conventions, patterns)
- The story file (authoritative implementation guide)
- Architecture sections relevant to this story
- Previous story file in this epic (learnings)
- NOT: brainstorming notes, PRD drafts, research docs
```

This keeps each agent's context window focused on what matters for their task.

---

## 8. CLI Design

### 8.1 Commands

```bash
# Initialize a new project
bmad-swarm init [--scan] [--template <name>]
# --scan: analyze existing codebase and pre-populate config
# --template: use a predefined stack template (e.g., next-app, express-api)

# Regenerate .claude/ files from package + swarm.yaml
bmad-swarm update
# Safe: never touches swarm.yaml, overrides/, artifacts/, or src/
# Reports what changed

# Eject an agent for local customization
bmad-swarm eject agent <name>
# Copies to overrides/agents/<name>.md

# Return to package version
bmad-swarm uneject agent <name>

# Scan existing codebase (can run independently of init)
bmad-swarm scan
# Updates/creates project-context.md

# Show current project status
bmad-swarm status
# Reads project.yaml and shows phase, progress, active work
```

### 8.2 Init Flow

```
$ bmad-swarm init

? Project name: My SaaS App
? Project type: web-app
? Primary language: TypeScript
? Framework: Next.js
? Database: PostgreSQL
? Autonomy level: guided

Creating project structure...
  ✓ Generated swarm.yaml
  ✓ Generated .claude/agents/ (8 agents)
  ✓ Generated .claude/settings.json
  ✓ Generated .claude/hooks/
  ✓ Generated CLAUDE.md
  ✓ Created artifacts/ directory
  ✓ Initialized project.yaml

Ready! Start Claude Code and tell the orchestrator what to build.
```

---

## 9. Artifact System

### 9.1 Artifact Types

| Type | Phase | Producer | Consumers |
|------|-------|----------|-----------|
| Research document | Exploration | researcher | strategist, architect |
| Product brief | Exploration/Definition | strategist | strategist (for PRD) |
| PRD | Definition | strategist | architect, story-engineer |
| UX design | Design | researcher/strategist | architect, story-engineer |
| Architecture doc | Design | architect | story-engineer, developer |
| Epic/story listing | Design | story-engineer | story-engineer, developer |
| Sprint status | Implementation | orchestrator | story-engineer, developer |
| Story file | Implementation | story-engineer | developer, reviewer |
| Review report | Implementation | reviewer | developer |
| Test report | Implementation/Delivery | qa | reviewer, orchestrator |
| Project context | All | orchestrator/researcher | all agents |
| Decision log | All | orchestrator | all agents |

### 9.2 Artifact Storage

```
artifacts/
├── exploration/
│   ├── market-research.md
│   ├── domain-research.md
│   ├── technical-research.md
│   └── feasibility-analysis.md
├── planning/
│   ├── product-brief.md
│   └── prd.md
├── design/
│   ├── architecture.md
│   ├── ux-design.md
│   └── decisions/
│       ├── adr-001-database-selection.md
│       └── adr-002-auth-approach.md
├── implementation/
│   ├── sprint-status.yaml
│   ├── epics.md
│   └── stories/
│       ├── 1-1-project-setup.md
│       ├── 1-2-user-auth.md
│       └── ...
├── reviews/
│   ├── review-1-1-project-setup.md
│   └── ...
└── context/
    ├── project-context.md
    └── decision-log.md
```

---

## 10. Distribution

### 10.1 npm Package

```json
{
  "name": "@bmad/swarm",
  "version": "1.0.0",
  "bin": {
    "bmad-swarm": "./bin/bmad-swarm.js"
  },
  "files": [
    "bin/",
    "cli/",
    "agents/",
    "methodology/",
    "templates/",
    "generators/"
  ]
}
```

### 10.2 What's in the Package vs. Generated

| In Package (updatable) | Generated per Project | User-Owned |
|------------------------|----------------------|------------|
| Agent definitions | .claude/agents/ | swarm.yaml |
| Methodology phases | .claude/hooks/ | overrides/ |
| Quality gate criteria | .claude/settings.json | artifacts/ |
| Artifact schemas | CLAUDE.md | src/ |
| CLI commands | project.yaml (initial) | |
| Templates | | |
| Generators | | |

---

## 11. Key Differentiators from BMAD

| BMAD | BMAD Swarm |
|------|-----------|
| Single session role-playing agents | Real separate Claude instances per agent |
| Sequential workflow execution | Parallel task graphs with dependencies |
| Workflow XML step files | Orchestrator carries methodology knowledge |
| Interactive by default (confirm every step) | Autonomous by default, human at decision points |
| Fixed process regardless of scope | Complexity-adaptive team and process |
| Copy-paste installation | Package dependency with config |
| Greenfield-focused | First-class brownfield support |
| Party mode (simulated multi-agent) | Real inter-agent messaging and debate |
| YOLO mode as opt-in | Autonomy as the default |
| Monolithic context window | Curated per-agent context |
