# bmad-swarm

Autonomous development teams powered by [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) Agent Teams, built on the [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD).

BMAD Swarm combines BMAD's structured brainstorming and documentation with Claude Agent Teams' parallel execution. Run `bmad-swarm init` once to configure your project, then `bmad-swarm start` to launch. There are no special commands to learn, no agent names to remember, no workflow to manage -- the methodology activates automatically.

Unlike the original BMAD Method (which requires manually switching agent personas and running workflow commands), BMAD Swarm integrates directly into Claude Code. `bmad-swarm start` launches Claude with the orchestrator identity injected at the system prompt level -- so every message you send is automatically routed through the orchestrator methodology. It reads your request, assesses complexity, assembles the right team, and manages the full lifecycle. You just talk.

**Anyone can use it.** Non-technical users describe ideas in plain language and make design choices while the AI handles all code decisions. Technical users go as deep as they want -- debate architecture, review patterns, pick frameworks. The system reads your conversation style and adapts.

## Prerequisites

- **Node.js >= 18** -- [download](https://nodejs.org/)
- **Claude Code** installed and authenticated -- [setup guide](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)
- A git-initialized project directory

## Quick Start

```bash
# Install
npm install -g bmad-swarm

# Create a project
mkdir my-app && cd my-app && git init

# Initialize the swarm
bmad-swarm init

# Launch Claude with orchestrator instructions
bmad-swarm start
> Build a task management API with user authentication
```

`bmad-swarm init` generates:
- `swarm.yaml` -- project configuration (you own and edit this)
- `.claude/agents/` -- agent definitions for each role
- `.claude/hooks/` -- quality gate hooks
- `.claude/settings.json` -- Claude Code permissions
- `.claude/system-prompt.txt` -- orchestrator identity injected into Claude's system prompt
- `.claude/rules/` -- methodology rules (coding standards, quality standards, orchestrator methodology)
- `CLAUDE.md` -- project context (type, stack, phases, artifacts)
- `artifacts/` -- directory structure for all methodology artifacts
- `project.yaml` -- project state tracking

## How It Works

BMAD Swarm works by generating configuration files that Claude Code reads automatically. The agent definitions in `.claude/agents/`, hooks in `.claude/hooks/`, and rules in `.claude/rules/` are all standard Claude Code features -- bmad-swarm just generates them with the right content.

The key is the **three-tier instruction system**. `bmad-swarm start` launches Claude Code with `--append-system-prompt`, injecting the orchestrator identity directly into Claude's system prompt -- the highest priority instruction level. This is reinforced by `.claude/rules/` files that define agent routing and quality standards. `CLAUDE.md` provides project context (stack, phases, artifact locations). This layered approach ensures Claude follows the orchestrator methodology reliably, even in long sessions.

After initialization, launch with `bmad-swarm start` and just talk. No special commands, no agent names to remember.

### The Orchestrator

Claude itself becomes the orchestrator -- an AI coordinator that never writes code, only delegates. When you give it a task:

1. **Assesses complexity** across 5 dimensions (scope, clarity, technical risk, codebase size, dependencies)
2. **Selects the orchestration mode**:
   - **Interactive** -- Single agent works directly with you (brainstorming, planning, design decisions)
   - **Parallel** -- Multiple agents work simultaneously (implementation, review, QA)
   - **Hybrid** -- Interactive for planning phases, parallel for building
3. **Assembles the right team** -- only the agents needed, not the full roster
4. **Creates a task graph** with dependencies and quality gates
5. **Adapts to you** -- reads your conversation style and calibrates which decisions to involve you in vs. handle autonomously

### Phases

Planning phases default to interactive mode (one agent working with you). Building phases default to parallel mode (multiple agents working simultaneously).

| Phase | Mode | Purpose | Primary Agents |
|-------|------|---------|---------------|
| **0. Ideation** | Interactive | Brainstorm and refine ideas | Ideator |
| **1. Exploration** | Interactive | Research problem space | Researcher |
| **2. Definition** | Interactive | Define requirements (PRD) | Strategist |
| **3. Design** | Interactive | Architecture and technical decisions | Architect |
| **4. Implementation** | Parallel | Build, test, review in sprints | Developer, Reviewer, QA |
| **5. Delivery** | Parallel | Final validation and handoff | Reviewer, QA |

Phases are skipped based on complexity. A bug fix goes straight to Implementation. A small feature might skip Exploration and Definition.

### Agents

| Agent | Role |
|-------|------|
| **orchestrator** | Team lead. Assesses complexity, builds teams, creates task graphs. Never implements directly. |
| **ideator** | Structured brainstorming partner. Uses 17 techniques, anti-bias protocols, and elicitation methods. Adapts to your thinking style. |
| **researcher** | Discovery, analysis, and context acquisition. Web research and codebase scanning. |
| **strategist** | Product strategy, requirements definition, PRD creation. |
| **architect** | Technical design, system architecture, technology selection. |
| **story-engineer** | Creates implementation-ready stories with BDD acceptance criteria. |
| **developer** | Story implementation following TDD. Multiple developers can work in parallel. |
| **reviewer** | Adversarial code review. Validates quality, security, architecture compliance, and decision traceability. |
| **qa** | Test strategy, automated test creation, coverage analysis. |
| **retrospective** | Post-epic analysis. Extracts patterns from reviews and updates lessons-learned. |
| **devops** | Infrastructure, CI/CD, deployment automation. |
| **security** | Security design, threat modeling, vulnerability analysis. |
| **tech-writer** | Documentation, API docs, user guides. |

### Decision Traceability

Every significant decision gets a **D-ID** (Decision ID) that flows through the entire artifact chain:

```
Human says "mobile-first" during brainstorming
  -> D-001 logged in product brief
    -> Strategist references D-001 in PRD requirement
      -> Architect references D-001 in frontend design
        -> Story engineer includes D-001 in acceptance criteria
          -> Reviewer verifies D-001 compliance
```

Decisions made once are never silently dropped.

### Adaptive Interaction

The system reads your conversation style and adapts in real-time:

- **Technical language** ("Should we use connection pooling?") -- engages at technical depth
- **Design language** ("Make the sidebar collapsible") -- engages on UX
- **Business language** ("We need to beat competitor X on onboarding") -- engages on strategy

Agents auto-resolve decisions you wouldn't care about (library choices, folder structure) and escalate decisions you would (scope, business logic, architecture tradeoffs).

### Autonomy Levels

| Level | Behavior | Best For |
|-------|----------|----------|
| `auto` | No human checkpoints. Reports results at the end. | Bug fixes, small features, well-defined tasks |
| `guided` | Pauses at phase boundaries for human review. | Medium features, new modules |
| `collaborative` | Pauses at phase boundaries AND within phases for key choices. | New apps, major redesigns, vague requirements |

## CLI Reference

### `bmad-swarm init`

Initialize a new project in the current directory.

```bash
bmad-swarm init [options]
```

| Flag | Description |
|------|-------------|
| `--scan` | Auto-detect language, framework, and test setup from existing codebase |
| `--template <name>` | Use a predefined stack template |
| `-y, --yes` | Accept all defaults without interactive prompts |

**Available templates:**

| Template | Stack |
|----------|-------|
| `next-app` | TypeScript + Next.js + Jest |
| `express-api` | TypeScript + Express + Jest |
| `react-app` | TypeScript + React + Vitest |
| `node-cli` | JavaScript + node:test |
| `python-api` | Python + FastAPI + pytest |

### `bmad-swarm start`

Launch Claude Code with the orchestrator system prompt. This injects the orchestrator identity at the system prompt level (highest priority).

```bash
bmad-swarm start [options]
```

| Flag | Description |
|------|-------------|
| `--print` | Print the claude command instead of running it |
| `--dangerous` | Launch in dangerously-skip-permissions mode (skips all permission prompts) |

### `bmad-swarm update`

Regenerate all managed files from `swarm.yaml` including agents, CLAUDE.md, system prompt, hooks, rules, and settings. Safe to run repeatedly -- never touches user-owned files (`swarm.yaml`, `overrides/`, `artifacts/`, `src/`).

```bash
bmad-swarm update [--dry-run]
```

### `bmad-swarm eject agent <name>`

Copy an agent template to `overrides/agents/` for local customization on a single project. The ejected copy takes priority over the package version and survives `bmad-swarm update`.

```bash
bmad-swarm eject agent developer
# Edit overrides/agents/developer.md to taste
bmad-swarm update  # your override is preserved
```

### `bmad-swarm uneject agent <name>`

Remove a local override and restore the package version.

### `bmad-swarm scan`

Detect stack from the current codebase and generate `project-context.md`.

### `bmad-swarm status`

Show project configuration, current phase, agent status, and artifact counts.

## Escape Hatches

Not every task needs the full lifecycle:

```bash
# Quick bug fix -- skips straight to implementation
> Fix: users can't log in with special characters in email

# Brainstorm only -- no code, just thinking
> I have a vague idea for a tech debt tracker. Help me think through it.

# Skip to coding with defaults
bmad-swarm init -y
bmad-swarm start
> Add a /health endpoint to the API
```

Disable phases in `swarm.yaml`:

```yaml
methodology:
  phases:
    exploration: { enabled: false }
    definition: { enabled: false }
```

## Per-Project Customization (Eject/Override)

Three layers for customizing agent behavior on a specific project:

1. **Package templates** (default) -- ship with `bmad-swarm`, regenerated on `bmad-swarm update`
2. **swarm.yaml overrides** (lightweight) -- add `extra_context` or `extra_rules` per agent
3. **Ejected overrides** (full control) -- `bmad-swarm eject agent <name>` copies the template for free editing

Resolution order: ejected file > package template + swarm.yaml overrides.

This is for customizing agent behavior within a single project (e.g., adding domain-specific rules to the architect). To change bmad-swarm itself, see [Development](#development) below.

## Artifact System

Agents coordinate through structured files on disk, not message passing. Each agent reads only the artifacts relevant to its task.

```
artifacts/
  exploration/     Research and analysis
  planning/        Product brief, PRD
  design/          Architecture, ADRs
  implementation/  Epics, stories
  reviews/         Code reviews, retrospectives, test reports
  context/         Project context, decision log, lessons learned
```

<details>
<summary><strong>swarm.yaml Configuration Reference</strong></summary>

```yaml
# Project identity
project:
  name: my-project              # Project name (string, required)
  description: ""               # Short description (string, optional)
  type: web-app                 # web-app | api | cli | library | mobile | monorepo | other

# Technology stack
stack:
  language: TypeScript          # Primary language (string)
  framework: React              # Framework (string, optional)
  database: PostgreSQL          # Database (string, optional)
  testing: Vitest               # Test framework (string, optional)
  additional: []                # Additional technologies (string[], optional)

# Methodology configuration
methodology:
  autonomy: guided              # auto | guided | collaborative

  ideation:
    enabled: true
    default_perspectives:
      - product-strategist
      - technical-feasibility
      - devils-advocate
      - innovation

  phases:
    exploration:
      enabled: true
    definition:
      enabled: true
    design:
      enabled: true
    implementation:
      enabled: true
      parallel_devs: 2          # Max concurrent developer agents (number, default: 2)
    delivery:
      enabled: true

  quality:
    require_tests: true
    require_review: true
    require_human_approval:
      - prd
      - architecture

# Agent customization
agents:
  orchestrator:
    # enabled: true             # Disable an agent entirely (boolean)
    # model: opus               # Preferred model hint (string)
    # extra_context: ""         # Appended to the agent's prompt (string)
    # extra_rules: []           # Additional behavioral rules (string[])
  # researcher: { ... }
  # strategist: { ... }
  # architect: { ... }
  # story-engineer: { ... }
  # developer: { ... }
  # reviewer: { ... }
  # qa: { ... }
  # ideator: { ... }

# Output locations
output:
  artifacts_dir: ./artifacts
  code_dir: ./src
```

</details>

## Examples

```bash
# Greenfield web app -- full lifecycle
mkdir saas-app && cd saas-app && git init
bmad-swarm init --template next-app
bmad-swarm start
> Build a SaaS project management tool with team workspaces

# Add feature to existing project
cd my-existing-app
bmad-swarm init --scan -y
bmad-swarm start
> Add a notification system with email and in-app alerts

# Brainstorming session
bmad-swarm init -y
bmad-swarm start
> I have a vague idea for a tool that helps developers track technical debt
```

## Development

To work on bmad-swarm itself (not a project that uses it):

### Setup

```bash
git clone https://github.com/ccsmith33/BMAD-Swarm.git
cd BMAD-Swarm
npm install
```

### Run Tests

```bash
npm test
```

### Project Structure

```
bmad-swarm/
  bin/bmad-swarm.js           CLI entry point
  cli/                        Command implementations (init, update, start, eject, scan, etc.)
  agents/                     Agent templates (13 agents)
  methodology/
    phases.yaml               Phase definitions, gates, transitions
    quality-gates/             Quality validation criteria (PRD, architecture, code, etc.)
    artifact-schemas/          Expected structure for each artifact type
    task-templates/            Pre-built task graphs for common workflows
    testing-knowledge/         Stack-aware testing guides for the QA agent
    decision-classification.md Tactical vs strategic decision framework
    decision-traceability.md   D-ID system for tracking decisions through artifacts
    orchestration-modes.md     When to use interactive vs parallel vs hybrid
    adaptive-interaction.md    How agents read and adapt to the human's style
    brainstorming-techniques.md  Curated technique library for the ideator
    elicitation-methods.md     Methods for deepening weak artifact sections
  templates/                   Template files for code generation (includes system-prompt.txt.template)
  generators/                  File generation logic (includes system-prompt-generator.js)
  utils/                       Shared utilities
  test/                        Test suite (node:test)
```

### Key areas to modify

**Agents** (`agents/*.md`): Each agent is a Markdown file with Role, Expertise, Inputs, Outputs, Quality Criteria, and Behavioral Rules. Edit these to change how an agent thinks and works. Changes here affect all new projects on `bmad-swarm init` or `bmad-swarm update`.

**Methodology** (`methodology/`): Phase definitions, quality gates, artifact schemas, brainstorming techniques, and decision frameworks. This is the "brain" of the system -- how the orchestrator decides what to do.

**Generators** (`generators/`): JavaScript modules that produce the files `bmad-swarm init` creates. If you want to change what gets generated (e.g., add a new template, change the system prompt or CLAUDE.md format), modify these.

**CLI** (`cli/`): Command implementations. Each file corresponds to a CLI command (`init.js`, `update.js`, `eject.js`, etc.).

### Eject vs. Development

| I want to... | Do this |
|--------------|---------|
| Change an agent's behavior for **one project** | `bmad-swarm eject agent <name>` in the project |
| Change an agent's behavior for **all projects** | Edit `agents/<name>.md` in the bmad-swarm repo |
| Add a new agent | Create `agents/<name>.md`, add to generator, update CLAUDE.md template |
| Change methodology (phases, gates, techniques) | Edit files in `methodology/` |
| Change what `bmad-swarm init` generates | Edit files in `generators/` and `templates/` |
| Add a new CLI command | Add a file in `cli/`, register in `bin/bmad-swarm.js` |

### Testing Changes Locally

```bash
# Link your local copy globally
npm link

# Now 'bmad-swarm' points to your local checkout
cd /some/test-project
bmad-swarm init

# Unlink when done
npm unlink -g bmad-swarm
```

## Relationship to BMAD Method

BMAD Swarm is built on the [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) (Breakthrough Method for Agile AI-Driven Development) by Brian Madison.

| | Original BMAD | BMAD Swarm |
|---|---|---|
| **Execution** | One AI, sequential, you switch personas manually | Multiple AI agents working in parallel |
| **Orchestration** | You manage the process with commands | Claude becomes the orchestrator automatically via system prompt injection (`bmad-swarm start`) |
| **Integration** | Load persona files into your AI session | `bmad-swarm init` once, then `bmad-swarm start` to launch -- no prefixes, no commands |
| **Brainstorming** | Structured techniques with named personas | Same techniques, invisible to the user, adaptive to your style |
| **Documentation** | Rich artifacts as a byproduct of the process | Same, plus decision traceability (D-IDs) across all artifacts |

BMAD Swarm keeps what BMAD does best -- structured brainstorming, rich documentation, phased methodology, quality gates -- and adds what Claude Agent Teams do best -- parallel execution, autonomous orchestration, and adaptive interaction.

## Troubleshooting

**`bmad-swarm init` says "already has a swarm.yaml"**
Run `bmad-swarm update` instead, or delete `swarm.yaml` to start fresh.

**Agents are not being spawned**
Verify `.claude/settings.json` exists. Re-run `bmad-swarm update` to regenerate it.

**The orchestrator spawns too many agents**
Set `methodology.autonomy: auto` in `swarm.yaml` and give more specific instructions.

**Tests are not running / wrong test framework**
Set `stack.testing` explicitly in `swarm.yaml`.

**Agent behavior is wrong after update**
Check `overrides/agents/` for ejected files. Run `bmad-swarm uneject agent <name>` to restore defaults.

**Quality gates blocking progress**
Check `artifacts/reviews/` for feedback. To relax gates: `methodology.quality.require_review: false` in `swarm.yaml`.

**The orchestrator ignores instructions or uses wrong agent types**
Make sure you launched with `bmad-swarm start` (not bare `claude`). The system prompt with orchestrator identity is only active when launched via `bmad-swarm start`.

## License

MIT
