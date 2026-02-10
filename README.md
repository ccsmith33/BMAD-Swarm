# bmad-swarm

Generate autonomous development swarm configurations for [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) Agent Teams. One command sets up a complete multi-agent SDLC -- from research through delivery -- with quality gates, artifact tracking, and configurable autonomy.

## Prerequisites

- **Node.js >= 18** -- [download](https://nodejs.org/)
- **Claude Code** installed and authenticated -- [setup guide](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)
- A git-initialized project directory

## How It Works

BMAD Swarm generates a team of AI agents that follow a structured software development lifecycle:

1. **You describe what to build** -- anything from a vague idea to a detailed spec
2. **The orchestrator assesses complexity** -- determines which phases and agents are needed
3. **Specialist agents execute each phase** -- research, define requirements, design architecture, implement stories, review code, and validate quality
4. **Quality gates enforce standards** -- no phase proceeds until its gate passes
5. **You stay in control** -- autonomy level determines how often the swarm checks in with you

The orchestrator never writes code. It delegates to specialists (researcher, strategist, architect, developer, reviewer, QA) and coordinates their work through a task graph with dependencies.

## Installation

```bash
npm install -g bmad-swarm
```

## Quick Start

```bash
# 1. Create a new project directory (or cd into an existing one)
mkdir my-app && cd my-app
git init

# 2. Initialize the swarm
bmad-swarm init

# 3. Open Claude Code and start building
claude
> @orchestrator Build a task management API with user authentication
```

`bmad-swarm init` generates:
- `swarm.yaml` -- project configuration (you own and edit this)
- `.claude/agents/` -- agent definition files for each role
- `.claude/hooks/` -- quality gate hooks
- `.claude/settings.json` -- Claude Code permission allowlist
- `CLAUDE.md` -- project instructions consumed by Claude Code
- `artifacts/` -- directory structure for methodology artifacts
- `project.yaml` -- project state tracking

## Escape Hatches

Not every task needs the full lifecycle. Use these minimal paths:

```bash
# Quick bug fix -- skips straight to implementation
> @orchestrator Fix: users can't log in with special characters in email

# Brainstorm only -- no code, just thinking
> @orchestrator I have a vague idea for a tech debt tracker. Help me think through it.

# Skip to coding with defaults
bmad-swarm init -y
claude
> @orchestrator Add a /health endpoint to the API
```

You can also disable phases entirely in `swarm.yaml`:

```yaml
methodology:
  phases:
    exploration: { enabled: false }
    definition: { enabled: false }
```

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

**Examples:**

```bash
bmad-swarm init                    # Interactive setup
bmad-swarm init -y                 # Quick start with defaults
bmad-swarm init --template next-app  # Start with Next.js template
bmad-swarm init --scan             # Brownfield project -- detect stack
bmad-swarm init --scan -y          # Auto-detect and skip prompts
```

**Available templates:**

| Template | Stack |
|----------|-------|
| `next-app` | TypeScript + Next.js + Jest |
| `express-api` | TypeScript + Express + Jest |
| `react-app` | TypeScript + React + Vitest |
| `node-cli` | JavaScript + node:test |
| `python-api` | Python + FastAPI + pytest |

### `bmad-swarm update`

Regenerate all managed files from `swarm.yaml`. Safe to run repeatedly -- never touches user-owned files (`swarm.yaml`, `overrides/`, `artifacts/`, `src/`).

```bash
bmad-swarm update [options]
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview what would be regenerated without writing any files |

### `bmad-swarm eject agent <name>`

Copy an agent template to `overrides/agents/` for full local customization. The ejected copy takes priority over the package version and is not overwritten by `bmad-swarm update`.

```bash
bmad-swarm eject agent developer
# Edit overrides/agents/developer.md
bmad-swarm update  # your override is preserved
```

### `bmad-swarm uneject agent <name>`

Remove a local override and restore the package version.

```bash
bmad-swarm uneject agent developer
bmad-swarm update
```

### `bmad-swarm scan`

Detect stack from the current codebase and generate `project-context.md`.

```bash
bmad-swarm scan [--output <path>]
```

### `bmad-swarm status`

Show project configuration, current phase, agent status, and artifact counts.

## Methodology

The orchestrator determines which phases to run based on the request.

| Phase | Purpose | Primary Agents | Gate |
|-------|---------|---------------|------|
| **0. Ideation** | Brainstorm and refine vague ideas | Ideator | Human confirms readiness |
| **1. Exploration** | Research problem space and feasibility | Researcher, Strategist | Human confirms understanding |
| **2. Definition** | Define requirements (PRD) | Strategist | PRD quality + human approval |
| **3. Design** | Architecture and technical decisions | Architect | Architecture quality + human approval |
| **4. Implementation** | Build, test, review in sprints | Story Engineer, Developer, Reviewer, QA | All stories complete, tests pass |
| **5. Delivery** | Final validation and handoff | Reviewer, QA | Human accepts delivery |

Phases can be skipped based on complexity. A bug fix goes straight to Implementation. A small feature might skip Exploration and Definition.

## Agent Roles

| Agent | Role |
|-------|------|
| **orchestrator** | Team lead. Assesses complexity, builds teams, creates task graphs. Never implements directly. |
| **ideator** | Multi-perspective brainstorming through four lenses. Refines ideas into product briefs. |
| **researcher** | Discovery, analysis, and context acquisition. |
| **strategist** | Product strategy, requirements definition, PRD creation. |
| **architect** | Technical design, system architecture, technology selection. |
| **story-engineer** | Creates implementation-ready stories with BDD acceptance criteria. |
| **developer** | Story implementation following TDD. Writes code and tests. |
| **reviewer** | Adversarial code review. Validates quality, security, and architecture compliance. |
| **qa** | Test strategy, automated test creation, coverage analysis. |

## Autonomy Levels

| Level | Behavior | Best For |
|-------|----------|----------|
| `auto` | No human checkpoints. Reports results at the end. | Bug fixes, small features, well-defined tasks |
| `guided` | Pauses at phase boundaries for human review. | Medium features, new modules |
| `collaborative` | Pauses at phase boundaries AND within phases for key choices. | New apps, major redesigns, vague requirements |

## Eject/Override System

Three layers for customizing agent behavior:

1. **Package templates** (default) -- ship with `bmad-swarm`, updated on `bmad-swarm update`
2. **swarm.yaml overrides** (lightweight) -- add `extra_context` or `extra_rules` per agent
3. **Ejected overrides** (full control) -- `bmad-swarm eject agent <name>` copies the template for free editing

Resolution order: ejected file > package template + swarm.yaml overrides.

## Artifact System

```
artifacts/
  exploration/     Research and analysis
  planning/        Product brief, PRD
  design/          Architecture, ADRs
  implementation/  Epics, stories
  reviews/         Code reviews, test reports
  context/         Project context, decision log
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

  # Ideation phase (brainstorming)
  ideation:
    enabled: true               # Enable ideation phase (boolean, default: true)
    default_perspectives:       # Brainstorming lenses for the ideator agent
      - product-strategist
      - technical-feasibility
      - devils-advocate
      - innovation

  # Development phases
  phases:
    exploration:
      enabled: true             # Enable/disable phase (boolean, default: true)
    definition:
      enabled: true
    design:
      enabled: true
    implementation:
      enabled: true
      parallel_devs: 2          # Max concurrent developer agents (number, default: 2)
    delivery:
      enabled: true

  # Quality gates
  quality:
    require_tests: true         # All code must have tests (boolean, default: true)
    require_review: true        # All code must pass review (boolean, default: true)
    require_human_approval:     # Artifacts requiring human sign-off (string[])
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
  artifacts_dir: ./artifacts    # Methodology artifacts directory (string)
  code_dir: ./src               # Source code directory (string)
```

</details>

## Examples

```bash
# Greenfield web app -- full lifecycle
mkdir saas-app && cd saas-app && git init
bmad-swarm init --template next-app
claude
> @orchestrator Build a SaaS project management tool with team workspaces

# Add feature to existing project
cd my-existing-app
bmad-swarm init --scan -y
claude
> @orchestrator Add a notification system with email and in-app alerts

# Brainstorming session
bmad-swarm init -y
claude
> @orchestrator I have a vague idea for a tool that helps developers track technical debt
```

## Troubleshooting

**`bmad-swarm init` says "already has a swarm.yaml"**
Run `bmad-swarm update` instead to regenerate managed files, or delete `swarm.yaml` to start fresh.

**Agents are not being spawned**
Verify `.claude/settings.json` exists and allows agent spawning. Re-run `bmad-swarm update` to regenerate it.

**The orchestrator spawns too many agents**
Set `methodology.autonomy: auto` in `swarm.yaml` and reduce complexity by giving more specific instructions. The orchestrator scales team size to match assessed complexity.

**Tests are not running / wrong test framework detected**
Set `stack.testing` explicitly in `swarm.yaml` (e.g., `Jest`, `Vitest`, `pytest`, `node:test`).

**Agent behavior is wrong after update**
Check if you have an ejected override in `overrides/agents/`. Ejected files take priority over package templates. Run `bmad-swarm uneject agent <name>` to restore defaults.

**Quality gates blocking progress**
Check `artifacts/reviews/` for the reviewer's feedback. Address blocking findings first. If gates are too strict for your use case, set `methodology.quality.require_review: false` in `swarm.yaml`.

## Project Structure

```
bmad-swarm/
  bin/bmad-swarm.js         CLI entry point
  cli/                      Command implementations
  agents/                   Package agent templates (9 agents)
  methodology/              Phase definitions, gates, transitions
  templates/                Template files for code generation
  generators/               File generation logic
  utils/                    Shared utilities
  test/                     Test suite (node:test)
```

## License

MIT
