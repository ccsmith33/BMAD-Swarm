# bmad-swarm

Autonomous development teams powered by [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) agent teams, built on the [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD).

bmad-swarm is a **thin methodology layer over native Claude Code primitives** — custom agents, hooks, slash commands, and settings — plus a differentiated **brain** that those primitives don't provide on their own:

- **Complexity-based routing.** A task is scored and routed to exactly one execution regime: the main session handles it solo, a deterministic Workflow script runs it, or a full agentic team assembles around it. You pay for agency only when the work needs it.
- **Adversarial review, always.** Code and artifacts pass an independent reviewer (and, where relevant, a security teammate) before they're considered done.
- **Traceability that survives compaction.** Decisions (D-IDs), recommendations (R-IDs), lessons (L-IDs), and claims (C-IDs) live in durable on-disk ledgers, not in the model's context window — so nothing is silently dropped when the conversation is summarized.
- **An opinionated collaborator.** The advisory layer lets every role push back in its own domain, anchored on one carved principle: *the human is the source of truth for decisions, not for what is best.*
- **Night mode.** With `/sleep`, the swarm runs unattended for hours behind a fail-closed constitutional floor and hands you a ranked morning action queue.

Run `bmad-swarm init` once to configure your project, then `bmad-swarm start` to launch. There are no special commands to learn and no agent names to remember — the methodology activates automatically. `bmad-swarm start` launches Claude with the orchestrator identity loaded via the `/identity-orchestrator` slash command, so every message you send is routed through the orchestrator methodology. It reads your request, scores complexity, routes to the right regime, and manages the lifecycle. You just talk.

**Anyone can use it.** Non-technical users describe ideas in plain language and make product choices while the AI handles all code decisions. Technical users go as deep as they want — debate architecture, review patterns, pick frameworks. The system reads your conversation style and adapts.

## Prerequisites

- **Node.js >= 18** — [download](https://nodejs.org/)
- **Claude Code** installed and authenticated — [setup guide](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)
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

- `swarm.yaml` — project configuration (you own and edit this)
- `.claude/agents/` — native Claude Code agent definitions, one per role (teammates are spawned directly via `subagent_type`)
- `.claude/hooks/` — quality-gate and enforcement hooks
- `.claude/commands/` — slash commands (`/identity-orchestrator` plus the workflow and night-mode commands; the other `identity-*` commands are inspection aids — teammates load identity natively from `.claude/agents/`)
- `.claude/rules/` — methodology rules (coding standards, quality standards, orchestrator methodology)
- `.claude/workflows/` — named deterministic pipelines for the middle routing tier
- `.claude/bmad/methodology/` — the load-bearing methodology subset (decision classification, artifact schemas, testing knowledge)
- `.claude/bmad/bin/` — the `record.cjs` ledger tool that ships into the project
- `.claude/settings.json` — Claude Code permissions
- `CLAUDE.md` — project context (type, stack, invariants, artifact locations)
- `artifacts/` — directory structure for all methodology artifacts

> Phase and gate state are **not** kept in a separate config file. They live in the frontmatter of `artifacts/context/project-brain.md`, written when the orchestrator first records progress (D-037). Earlier versions generated a `project.yaml` for this — that file has been retired.

## How It Works

bmad-swarm works by generating configuration files that Claude Code reads automatically. The agent definitions in `.claude/agents/`, hooks in `.claude/hooks/`, and rules in `.claude/rules/` are all standard Claude Code features — bmad-swarm just generates them with the right content.

The key is the **slash-command identity system**. On a fresh session the orchestrator invokes `/identity-orchestrator` as its first action; the command body is the full orchestrator role and arrives as user-turn content, which the model weights more heavily than system-ambient instructions. A `UserPromptSubmit` hook emits a short reminder on the first turn of a session pointing at `/identity-orchestrator`. After context compaction a `SessionStart` hook (`session-start-warmboot`) re-points the orchestrator at the same slash command and instructs it to reconcile coordination state. This is reinforced by `.claude/rules/` files that define routing and quality standards, and `CLAUDE.md` provides project context. Teammates do not use slash-command identity: the generated `.claude/agents/*.md` files are native Claude Code agent definitions, so teammates are spawned directly via `subagent_type` with their full role attached (ADR-014).

After initialization, launch with `bmad-swarm start` and just talk. No special commands, no agent names to remember.

### The Regime Router

Claude itself becomes the orchestrator — an AI coordinator that never writes code, only delegates. When you give it a task, it scores complexity on a **5–15 scale** and routes to exactly **one** execution regime (D-038). The complexity brain is the control law; the native primitives — the solo main session, a deterministic Workflow script, a full agentic team — are the actuators.

| Complexity | Regime | What runs |
|---|---|---|
| **≤ 6** (single-file, well-shaped) | **solo** | The main session handles it directly — no spawn, no assembly ceremony. |
| **7–11** (shaped but multi-step) | **Workflow script** | A named `.claude/workflows/` deterministic pipeline (reproduce → fix → test → review → ledger) with schema-validated node outputs, resumable at node boundaries. |
| **≥ 12** (or ill-defined / exploratory) | **agentic team** | The full assembly — sized by the complexity tables — **pauses for human approval before spawning** (WS-12). |

**Regime-invariant traceability.** Whichever regime runs, the work emits the *same* D-IDs, the same ledger lines, and the same artifact species. An auditor cannot tell — and shouldn't care — which regime produced a change. The regime is a cost decision, never a rigor decision. The router stays a rule table (auditable and tunable), never a learned model. A misroute costs one `router-miss` telemetry event and a fallback team spawn, not a wrong answer.

### Parallel by default

Within the agentic regime, **tasks are independent unless a dependency is declared** (L-5 / D-050). A sequencing edge requires a *named* reason — task B reads task A's output, or task B needs a decision task A produces. At `TaskCreate` time this is mechanical: a story task is blocked only on the stories in its `## Depends-On:` field (or an equally nameable reason). Every other task is created unblocked and its owner spawned in the same batch. The orchestrator never serializes work because it "feels tidy."

### Phases

| Phase | Purpose | Primary Agents |
|-------|---------|----------------|
| **0. Ideation** | Brainstorm and refine ideas | Ideator |
| **1. Exploration** | Research the problem space | Researcher |
| **2. Definition** | Define requirements (PRD) | Strategist |
| **3. Design** | Architecture and technical decisions | Architect |
| **4. Implementation** | Build, test, review in sprints | Strategist, Developer, Reviewer |
| **5. Delivery** | Final validation and handoff | Reviewer |

Phases are skipped based on complexity. A bug fix goes straight to Implementation. A small feature might skip Exploration and Definition.

### Agents

Nine roles ship with bmad-swarm:

| Agent | Role |
|-------|------|
| **orchestrator** | Team lead. Scores complexity, routes to a regime, builds teams, creates task graphs. Never implements directly. |
| **ideator** | Structured brainstorming partner. Uses a curated technique library, anti-bias protocols, and elicitation methods. Adapts to your thinking style. |
| **researcher** | Discovery, analysis, and context acquisition. Web research and codebase scanning. |
| **strategist** | Product strategy, requirements definition, PRD creation, and story decomposition (implementation-ready stories with BDD acceptance criteria). |
| **architect** | Technical design, system architecture, technology selection. |
| **developer** | Story implementation following TDD. Multiple developers can work in parallel. |
| **reviewer** | Adversarial code review. Validates quality, security, architecture compliance, and decision traceability. Its lens system covers test coverage and documentation. |
| **devops** | Infrastructure, CI/CD, deployment automation, branch integration. |
| **security** | Security design, threat modeling, vulnerability analysis. |

## The Brain

Everything above is orchestration. What makes bmad-swarm more than a team spawner is the durable record system underneath it — four kinds of record, all appended to on-disk ledgers by a single tool (`record.cjs`) so they survive context compaction and crash-restart.

### Decision traceability (D-IDs)

Every significant decision gets a **D-ID** that flows through the entire artifact chain:

```
Human says "mobile-first" during brainstorming
  -> D-001 logged in the decision log
    -> Strategist references D-001 in a PRD requirement
      -> Architect references D-001 in the frontend design
        -> Strategist includes D-001 in acceptance criteria
          -> Reviewer verifies D-001 compliance
```

Tactical decisions get a lightweight one-line D-record; strategic decisions get full documentation with rationale and lifecycle status. Decisions made once are never silently dropped, and a pattern of tactical decisions stays auditable.

### The advisory layer (R-IDs)

The advisory layer is the **proposal half** of the decision system — it lets swarm be an opinionated collaborator rather than a passive order-taker. Recommendations are **R-records** in `artifacts/context/ledger.md`: decisions-in-waiting that carry a stakes assessment and evidence sized to those stakes.

- **Per-recommendation judgment.** Delivery mode is judged from each recommendation's *own* stakes — never a fixed policy. Two recommendations at the same moment can earn opposite modes: **silent-proceed**, **inline-note**, or **pause-and-ask**. A variable-name nit is silent; "the library the architecture picked is abandoned with an open CVE" pauses.
- **Challenge-the-premise is in scope.** Swarm may argue that a recorded decision is wrong.
- **The contradiction escalator (constitutional floor).** Any recommendation that crosses an accepted D-ID or an explicit human statement can *never* be delivered silent-proceed and always carries the maximum evidence bar. This is the carved principle made mechanical: **the human is the source of truth for decisions, not for what is best.** If the human reaffirms, the recommendation becomes a *rejected R with a re-open trigger* — recorded, not relitigated.

### Knowledge promotion (L-IDs)

Lessons learned are promoted from one-off observations into **earned rules** compiled into future scaffolds:

- `bmad-swarm recall <query...>` — interrogate the knowledge ledger; answers cite L/D/C records.
- `bmad-swarm lessons harvest` — mine retrospectives and lessons markdown into recurrence-aware L-records.
- `bmad-swarm lessons propose <L-ID>` — emit a human-gated promotion proposal with retro-catch evidence.
- `bmad-swarm lessons reopen-scan` — surface rejected R-records whose re-open trigger may have fired.

Promoted cross-project lessons are compiled into new project scaffolds at `init`/`update` time. Pass `--skip-earned-rules` to opt out.

### Verification (C-IDs)

Factual claims are tracked as **C-records** against a claims table (`methodology/artifact-schemas/claims-table.md`). Unlike decisions and lessons, claims don't promote — they *decay*: a claim carries a status and is re-checked over time rather than trusted forever.

### Mission Control

Read-only surfaces for seeing the whole run at a glance:

- `bmad-swarm status --full` — awaiting-human gates, running/stuck tasks, decisions/recommendations, and a spend estimate.
- `bmad-swarm report` — generates the Mission Control surface to `artifacts/delivery/mission-control-<date>.md`.

## Night Mode

With `/sleep`, the swarm runs unattended for hours and hands you a ranked action queue in the morning (D-034 / D-038, Phase 5). It is **off by default** — `/sleep` arms only when `swarm.yaml` has `sleep:\n  enabled: true`.

- **`/sleep`** opens a *night charter* (`record.cjs night-charter open --ends <iso>`), runs a preflight canary, and works the queue behind the constitutional floor. Decisions follow the **Night Ladder**: reversible strategic decisions *fork* into isolated worktrees (both candidates get tests + a blind judge note, so the morning is a selection between working artifacts); low-stakes one-way decisions *default* on a reasoned choice logged as a re-openable R-ID; high-stakes one-way decisions *park* as a ≤10-line brief and the scheduler routes around them. Pause-and-ask isn't available at night — a night that stalls waiting for an answer is a wasted night.
- **The night floor** (`night-floor` hook) is a **fail-closed guardrail, not a hermetic boundary.** It is an allowlist: it denies every *direct* shelled escape (interpreters, redirects, obfuscation, out-of-tree writes) and mechanically enforces never-merge / never-push / never-publish / never-deploy. It is honestly a strong guardrail against direct escapes, not a proof against a determined adversary. The charter is a *file*, not context, so compaction at 3am cannot erase it.
- **The Governor** is a treasurer by day (forecasts token burn, advises a clean story-boundary checkpoint before a cap-stall) and a scheduler by night (surfaces a no-progress tripwire as advisory data, ranks work). It never refuses work — ranking orders it.
- **`/wake`** (or any human prompt) closes the charter, reconciles crash-only state, and refreshes the morning report.
- **`bmad-swarm report --morning`** generates the seven-section ranked morning queue (**ANSWER THESE**, **PICK ONE**, **MERGE THESE**, **INITIATIVE SHELF**, **PROPOSALS**, **PARKED / TRIPWIRED**, **NIGHT LEDGER**) to `artifacts/delivery/morning-report-<date>.md`. It is generated entirely from durable stores, so it produces the same queue even if the orchestrator that ran the night has died. `bmad-swarm status` also renders a compact night panel while a charter is open.

Nothing merges, pushes, publishes, or deploys as part of night mode. The morning stays human-gated by posture even after `/wake` lifts the floor.

## Permission Model

bmad-swarm's central invariant is **the orchestrator delegates everything** — it never writes code or teammate-owned artifacts (PRD, architecture, stories, reviews). This is enforced mechanically, not just by prompt.

- **`orchestrator-write-gate` hook** — the delegate-everything boundary. A **fail-closed, read-only allowlist**: the orchestrator may write only `artifacts/**` plus a small config set (`swarm.yaml`, `.gitignore`, `.claude/settings.local.json`); everything else is denied. It identifies the orchestrator via a two-layer check (Claude Code hook-payload subagent fields + `AGENT_ROLE` env) so teammates pass through even when env vars are inherited (ADR-003).
- **Git allow-list.** The write-gate distinguishes *coordination* git (`commit`, `push`, `fetch`, `merge --ff-only`, `checkout`/`switch`, `branch`, `tag`) — allowed — from *write-vector* and *destructive* git (`reset --hard`, `clean`, `push --force`, non-`--ff-only` `merge`, `rebase`, `filter-branch`, `apply`, `restore`, …) — denied. `git -C`/`-c` global-option smuggling is parsed out before subcommand resolution.
- **Per-project allow-list.** `permissions.orchestrator_allow` in `swarm.yaml` lets each project declare the read-only + coordination commands its orchestrator needs prompt-free (e.g. `Bash(cargo check:*)`), merged onto a widened safe default. Invalid entries fail config load loudly.
- **Standard permission mode** is `acceptEdits` — in-scope tools run without prompting, for autonomous execution. Destructive shell patterns (`rm -rf /`, `git push --force`, `sudo`, curl-piped-to-shell) are denied in `.claude/settings.json`.

Roughly eleven hooks ship, including `orchestrator-write-gate`, `night-floor`, `user-prompt-submit`, `session-start-warmboot`, `pre-compact-flush` / `post-compact-reinject` (context durability), `task-ledger-writer` and `ledger-write-guard` (durable coordination state), `team-assembly-lint` (advisory assembly check), `replay-gate`, and `workflow-integrity`.

## Autonomy Levels

| Level | Behavior | Best For |
|-------|----------|----------|
| `auto` | No human checkpoints; reports at the end. (The `≥ 12` plan-approval gate still applies.) | Bug fixes, small features, well-defined tasks |
| `guided` | Pauses at phase boundaries for human review. | Medium features, new modules |
| `collaborative` | Pauses at phase boundaries **and** within phases for key choices. | New apps, major redesigns, vague requirements |

## CLI Reference

### `bmad-swarm init`

Initialize a new project in the current directory.

| Flag | Description |
|------|-------------|
| `--scan` | Auto-detect language, framework, and test setup from an existing codebase |
| `--template <name>` | Use a predefined stack template |
| `-y, --yes` | Accept all defaults without interactive prompts |
| `--github` | Generate a GitHub Actions workflow for artifact validation |
| `--skip-earned-rules` | Do not compile promoted cross-project lessons into the scaffold |

**Available templates:** `next-app` (TypeScript + Next.js + Jest), `express-api` (TypeScript + Express + Jest), `react-app` (TypeScript + React + Vitest), `node-cli` (JavaScript + node:test), `python-api` (Python + FastAPI + pytest).

### `bmad-swarm start`

Launch Claude Code in the project. Orchestrator identity loads via `/identity-orchestrator` on the first user turn.

| Flag | Description |
|------|-------------|
| `--print` | Print the `claude` command instead of running it |

Tool permissions are scoped via `.claude/settings.json` (`allow` + `deny` + `defaultMode: acceptEdits`), not CLI flags. See ADR-001.

### `bmad-swarm update`

Regenerate all managed files from `swarm.yaml` (agents, CLAUDE.md, slash commands, hooks, rules, workflows, settings). Never touches user-owned files (`swarm.yaml`, `overrides/`, `artifacts/`, `src/`). It also folds a legacy `project.yaml`'s phase into the project-brain frontmatter and deletes the file.

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview what would be regenerated without writing |
| `--force` | Overwrite files even if manually modified |
| `--swap-live-hooks` | Regenerate `.claude/hooks/` + `settings.json` while a session is live (off by default; `--force` alone does not override the live-session skip) |
| `--skip-earned-rules` | Do not compile promoted cross-project lessons into the scaffold |

### `bmad-swarm eject agent <name>` / `uneject agent <name>`

Copy an agent template to `overrides/agents/` for per-project customization (the ejected copy takes priority and survives `update`), or remove the override and restore the package version.

```bash
bmad-swarm eject agent developer
# Edit overrides/agents/developer.md to taste
bmad-swarm update  # your override is preserved
```

### `bmad-swarm scan`

Detect the stack from the current codebase and generate `project-context.md`.

### `bmad-swarm status`

Show project configuration, current phase, agent status, and artifact counts. Renders a night panel while a `/sleep` charter is open.

| Flag | Description |
|------|-------------|
| `--full` | Render the Mission Control control surface (awaiting-human, running/stuck, decisions/recommendations, spend estimate) |

### `bmad-swarm report`

Generate the read-only Mission Control surface to `artifacts/delivery/`.

| Flag | Description |
|------|-------------|
| `--morning` | Generate the seven-section ranked morning action queue instead |

### `bmad-swarm recall <query...>`

Interrogate the knowledge ledger; answers cite L/D/C records. `--json` emits structured output.

### `bmad-swarm lessons <subcommand>`

Harvest, propose, and review knowledge-ledger lessons.

| Subcommand | Description | Flags |
|------------|-------------|-------|
| `harvest` | Mine retrospectives/lessons markdown into L-records | `--project <name>`, `--dry-run`, `--json` |
| `propose <lessonId>` | Emit a human-gated promotion proposal with retro-catch evidence | `--artifacts-root <dir>`, `--json` |
| `reopen-scan` | Surface rejected R-records whose re-open trigger may have fired | `--against <path>`, `--json` |

### `bmad-swarm phase <subcommand>`

Manage phase transitions (state lives in the project-brain frontmatter). `show` displays the current phase and available transitions; `advance` moves to the next phase; `set <name>` sets it manually (`--force` bypasses validation).

### `bmad-swarm validate` / `doctor`

`validate` checks artifact quality against the quality-gate criteria. `doctor` checks project configuration health and reports issues. Both enforce the `gates:` frontmatter contract in the project brain.

### `bmad-swarm scaffold-team`

Generate the `swarm.yaml` `team:` block from the architecture Domain Map (see "Retrofit tooling" below).

| Flag | Description |
|------|-------------|
| `--write` | Inject the `team:` block into `swarm.yaml` (backs up to `swarm.yaml.bak` first) |
| `--architecture <path>` | Path to `architecture.md` (default: `artifacts/design/architecture.md`) |
| `--no-fallback` | Set `fallback.enabled` to false (advanced) |

## Slash Commands

Workflow commands set up a team assembly and spawn the right roles; identity commands are inspection aids (teammates load identity natively).

| Command | Purpose |
|---------|---------|
| `/bug` | Bug fix — developer + reviewer |
| `/feature` | Feature — architect + developer + reviewer |
| `/research` | Research-only task — researcher |
| `/audit` | Audit — researcher + reviewer + security |
| `/brainstorm` | Brainstorm with the ideator overlay |
| `/explore-idea` | Explore an idea — ideator overlay + parallel researcher |
| `/migrate` | Migration — architect + developer + reviewer |
| `/review` | Review an artifact with lens selection |
| `/plan` | Produce an assembly block only; do not spawn |
| `/retrofit-team` | Propose a Domain Map for an existing architecture |
| `/sleep` | Open a night charter and run the overnight runtime |
| `/wake` | End the night: close the charter, reconcile, generate the morning report |

## Escape Hatches

Not every task needs the full lifecycle:

```bash
# Quick bug fix — routes straight to implementation
> Fix: users can't log in with special characters in email

# Brainstorm only — no code, just thinking
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

1. **Package templates** (default) — ship with `bmad-swarm`, regenerated on `update`.
2. **swarm.yaml overrides** (lightweight) — add `extra_context` or `extra_rules` per agent.
3. **Ejected overrides** (full control) — `bmad-swarm eject agent <name>` copies the template for free editing.

Resolution order: ejected file > package template + swarm.yaml overrides.

## Wide-Team Specialization

Wide-team specialization lets you pre-spawn multiple domain-specialized teammates (e.g. one developer dedicated to `backend-auth`, another to `backend-upload`, another to `frontend-dashboard`) instead of recycling one generic developer across many domains. Each specialist holds bounded context for the entire session and only handles stories within its domain — addressing long-context drift without abandoning the long-running multi-story workflow. See `artifacts/design/architecture.md` and ADR-004 / ADR-006.

**Dynamic mode (default) is unchanged. Wide-team is opt-in.** Existing projects without this configuration are unaffected; no automatic migration runs on `update`.

### Worked example: `team` block in `swarm.yaml`

```yaml
team:
  mode: fixed                    # dynamic (default) | fixed — opt in to wide-team
  specializations:               # only meaningful when mode: fixed
    - role: developer
      domain: backend-auth       # required when role is specialized; kebab-case slug
      description: OAuth2/PKCE flow, session storage, password reset endpoints.
    - role: developer
      domain: backend-upload
      description: File ingestion pipeline, S3 adapters, virus-scan integration.
    - role: developer
      domain: frontend-dashboard
      description: React dashboard pages, charts, real-time websocket UI.
  fallback:
    enabled: true                # default: true — generic dev for unrouted stories
    role: developer
```

Stories without a `## Domain:` field route to the generic-dev fallback. Stories whose domain doesn't match any declared specialist trigger the orchestrator's mid-epic injection decision tree. See the orchestrator role doc for routing rules.

### Retrofit tooling for existing projects

Two opt-in tools remove the manual edits when adopting wide-team in a project that already has an architecture — neither runs automatically:

- **`/retrofit-team`** (slash command) loads the architect's Domain Map heuristics into the orchestrator session, reads `artifacts/design/architecture.md`, and proposes a Domain Map iteratively with you. After explicit human approval (architecture is approval-gated), it spawns one architect teammate whose only job is to insert the approved Domain Map verbatim. Refuses cleanly if the project is already wide-team configured, if `architecture.md` is missing, or if a `## Domain Map` section already exists.
- **`bmad-swarm scaffold-team`** (CLI) reads that Domain Map and emits the matching `team:` block. Default is read-only (prints YAML to stdout). `--write` backs up to `swarm.yaml.bak`, writes atomically, and round-trips the result through config validation before declaring success. Refuses if `swarm.yaml` already has a `team:` block.

See `artifacts/design/architecture-retrofit.md` and ADR-010 / ADR-011 / ADR-012.

## Artifact System

Agents coordinate through structured files on disk, not message passing. Each agent reads only the artifacts relevant to its task.

```
artifacts/
  exploration/     Research and analysis
  planning/        Product brief, PRD
  design/          Architecture, ADRs
  implementation/  Epics, stories
  reviews/         Code reviews, retrospectives, test reports
  delivery/        Mission Control / morning reports, night charters
  context/         Project brain, decision log, ledger (R/L/C), lessons
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
    exploration:  { enabled: true }
    definition:   { enabled: true }
    design:       { enabled: true }
    implementation:
      enabled: true
      parallel_devs: 2          # Max concurrent developer agents (number, default: 2)
    delivery:     { enabled: true }

  quality:
    require_tests: true
    require_review: true
    require_human_approval:
      - prd
      - architecture

# Overnight runtime (off by default)
sleep:
  enabled: false                # /sleep arms only when true

# Orchestrator permission allow-list (merged onto the safe default)
permissions:
  orchestrator_allow: []        # e.g. ["Bash(cargo check:*)"]

# Agent customization
agents:
  orchestrator:
    # enabled: true             # Disable an agent entirely (boolean)
    # model: sonnet             # Model hint (haiku | sonnet | opus | fable | inherit)
    # extra_context: ""         # Appended to the agent's prompt (string)
    # extra_rules: []           # Additional behavioral rules (string[])
  # ideator / researcher / strategist / architect / developer / reviewer / devops / security: { ... }

# Output locations
output:
  artifacts_dir: ./artifacts
  code_dir: ./src
```

</details>

### Model tiers

Valid model values (for `defaults.model`, `agents.{name}.model`, `team.specializations[].model`, and `team.fallback.model`): `haiku`, `sonnet`, `opus`, `fable`, `inherit`. The framework default is `opus`. `fable` maps to Claude Fable 5 — the tier above opus with the highest intelligence ceiling and a 1M context window, at **2× opus cost** ($10/MTok input, $50/MTok output vs opus's $5/$25). Reserve it for deep-reasoning, low-token-volume roles (architect, strategist, security) or complexity ≥ 12 work; token-heavy roles (developer, reviewer) are usually better served by the opus default.

## Examples

```bash
# Greenfield web app — full lifecycle
mkdir saas-app && cd saas-app && git init
bmad-swarm init --template next-app
bmad-swarm start
> Build a SaaS project management tool with team workspaces

# Add a feature to an existing project
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

```bash
git clone https://github.com/ccsmith33/BMAD-Swarm.git
cd BMAD-Swarm
npm install
npm test
```

### Project Structure

```
bmad-swarm/
  bin/bmad-swarm.js           CLI entry point
  bin/record.cjs              The ledger tool (D/R/L/C records, night charter, reconcile); ships to .claude/bmad/bin/
  cli/                        Command implementations (init, update, start, eject, scan, status,
                              validate, doctor, scaffold-team, phase, recall, lessons, report)
  agents/                     Agent templates (9 agents)
  methodology/                Authoritative methodology; a load-bearing subset ships into
                              generated projects at .claude/bmad/methodology/
    phases.yaml               Phase definitions, gates, transitions
    decision-classification.md  Tactical vs strategic + the regime router (D-038)
    advisory.md               The advisory layer — R-records and delivery modes
    decision-traceability.md  The D-ID system
    artifact-schemas/         Single source of artifact structure + quality checklists (incl. claims-table.md)
    quality-gates/            Code-quality gate
    testing-knowledge/        Stack-aware testing guides for the reviewer's test-coverage lens
    brainstorming-techniques.md / elicitation-methods.md
  hooks (generated)           orchestrator-write-gate, night-floor, user-prompt-submit,
                              session-start-warmboot, pre/post-compact, task-ledger-writer,
                              ledger-write-guard, team-assembly-lint, replay-gate, workflow-integrity
  templates/                  Template files for code generation
  generators/                 File generation logic (agents, hooks, commands, settings, rules, claude-md)
  utils/                      Shared utilities
  test/                       Test suite (node:test)
```

### Eject vs. Development

| I want to... | Do this |
|--------------|---------|
| Change an agent's behavior for **one project** | `bmad-swarm eject agent <name>` in the project |
| Change an agent's behavior for **all projects** | Edit `agents/<name>.md` in the bmad-swarm repo |
| Change methodology (phases, gates, routing) | Edit files in `methodology/` |
| Change what `bmad-swarm init` generates | Edit files in `generators/` and `templates/` |
| Add a new CLI command | Add a file in `cli/`, register in `bin/bmad-swarm.js` |

### Testing Changes Locally

```bash
npm link                     # 'bmad-swarm' now points to your local checkout
cd /some/test-project
bmad-swarm init
npm unlink -g bmad-swarm      # when done
```

## Relationship to BMAD Method

bmad-swarm is built on the [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) (Breakthrough Method for Agile AI-Driven Development) by Brian Madison.

| | Original BMAD | bmad-swarm |
|---|---|---|
| **Execution** | One AI, sequential, you switch personas manually | Complexity-routed: solo session, deterministic Workflow, or a parallel agentic team |
| **Orchestration** | You manage the process with commands | Claude becomes the orchestrator automatically after `bmad-swarm start` |
| **Integration** | Load persona files into your AI session | `bmad-swarm init` once, then `bmad-swarm start` — no prefixes, no commands |
| **Brainstorming** | Structured techniques with named personas | Same techniques, invisible to the user, adaptive to your style |
| **Documentation** | Rich artifacts as a byproduct | Same, plus D/R/L/C-ID traceability that survives compaction |

## Troubleshooting

**`bmad-swarm init` says "already has a swarm.yaml"**
Run `bmad-swarm update` instead, or delete `swarm.yaml` to start fresh.

**Agents are not being spawned**
Verify `.claude/settings.json` exists. Re-run `bmad-swarm update` to regenerate it.

**The orchestrator spawns too many agents**
Set `methodology.autonomy: auto` in `swarm.yaml` and give more specific instructions — low-complexity work should route solo or to a Workflow, not a team.

**Tests are not running / wrong test framework**
Set `stack.testing` explicitly in `swarm.yaml`.

**Agent behavior is wrong after update**
Check `overrides/agents/` for ejected files. Run `bmad-swarm uneject agent <name>` to restore defaults.

**Quality gates blocking progress**
Check `artifacts/reviews/` for feedback. To relax gates: `methodology.quality.require_review: false` in `swarm.yaml`.

**The orchestrator ignores instructions or uses the wrong agent types**
Make sure you launched with `bmad-swarm start` (not bare `claude`) and that it invoked `/identity-orchestrator` first. If the reminder is missing, run `bmad-swarm update --force` to regenerate `.claude/commands/` and `.claude/hooks/`.

## License

MIT
