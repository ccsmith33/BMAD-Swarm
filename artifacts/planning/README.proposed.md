# bmad-swarm

> **DRAFT — PROPOSED README (D-035).** This is a review artifact written during the 2026-08-11 overnight-autonomous run. It describes the *reinvented* tool per `artifacts/planning/reinvention-vision-2026-08-11.md` and does not replace the live README until the vision and Forks A–D are ratified. Sections marked **⚠ pending Fork X** depend on an unratified decision and may change; everything else is written as final prose.

Autonomous development teams powered by [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) agent teams, built on the [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD).

**bmad-swarm remembers what it decided, proves what it finished, learns from what failed, and argues from its own receipts — and it does this on stock Claude Code, not a parallel runtime.**

Every significant decision gets an ID. Every recommendation is a decision-in-waiting with evidence attached. Every "done" claim is accepted only after a deterministic gate replays its evidence — files stat'd, tests re-run, citations resolved; the LLM's honesty is never load-bearing. Every failure gets a fingerprint, and the third occurrence of the same failure class is structurally impossible. All of it compounds into cross-project memory that grounds the system's advice in its own tracked track record.

bmad-swarm is a thin methodology layer on native Claude Code primitives — plain files and git, no database, no embeddings, memory you can `cat`. Run `bmad-swarm init` once to configure your project, then `bmad-swarm start` to launch. There are no special commands to learn, no agent names to remember, no workflow to manage — the methodology activates automatically.

**Anyone can use it.** Non-technical users describe ideas in plain language and make design choices while the AI handles all code decisions. Technical users go as deep as they want — debate architecture, review patterns, pick frameworks. The system reads your conversation style and adapts.

## Prerequisites

- **Node.js >= 20** — [download](https://nodejs.org/)
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

# Launch
bmad-swarm start
> Build a task management API with user authentication
```

`bmad-swarm init` generates:
- `swarm.yaml` — project configuration (you own and edit this)
- `.claude/agents/` — native Claude Code agent definitions for each role (teammates are spawned directly via `subagent_type`)
- `.claude/hooks/` — quality gate hooks
- `.claude/settings.json` — Claude Code permissions
- `.claude/commands/` — slash commands (10 workflow commands: `/bug`, `/feature`, `/research`, `/audit`, `/brainstorm`, `/explore-idea`, `/migrate`, `/review`, `/plan`, `/retrofit-team`)
- `.claude/rules/` — methodology rules (coding standards, quality standards, orchestrator methodology)
- `.claude/bmad/` — the methodology subset the generated files reference, shipped into your project so every reference resolves locally (self-contained scaffolds)
- `CLAUDE.md` — project context (type, stack, phases, artifacts)
- `artifacts/` — directory structure for all methodology artifacts

Scaffolds are **born immune**: rules your past projects earned through the knowledge ledger (see below) are compiled into the generated files at init time.

## The Architecture

Two mechanisms, a substrate, and a cache (D-039):

### 1. The record-promotion ledger (the moat)

One typed record system with one human-gated promotion state machine (D-036). Five record types share a single envelope:

| Type | What it is | Lifecycle |
|------|-----------|-----------|
| **D** — decision | A choice made, traceable through every downstream artifact | proposed → accepted → verified \| superseded |
| **R** — recommendation | A pre-decision: stakes-scored, evidence-priced, with a re-open trigger if rejected | open → accepted (graduates to a D) \| rejected (+ mandatory re-open trigger) |
| **L** — lesson | A fingerprinted failure *class* | observed → recurring → candidate → **promoted (human gate)** → retired |
| **C** — claim | A load-bearing assertion in an artifact: `checked / cited / attested / assumed` | Claims decay, they don't promote — file changes flag them stale |
| **F** — finding | A failure *instance*; shared fingerprints roll up to L-records mechanically | instance record |

The **1-2-3 ladder**: the first occurrence of a failure class is a lesson. The second is a warning the system issues. The third is structurally impossible — the lesson has been promoted (with your approval, always) into an enforcement tier: advisory citation → reviewer lens → structural check → scaffold change. Cross-project lessons live in `~/.bmad/knowledge/` and follow you between projects.

### 2. The priced decision router

One routing function decides how every decision is handled, priced by stakes (reversibility, blast radius, security/legal/data impact, cost delta, available evidence) × human availability × complexity (D-038). When you're present: silent-proceed, inline-note, or pause-and-ask. When you're asleep: default it, fork it, or park it (see Overnight autonomy below). The same stakes-read selects the execution regime — solo, workflow, or team — so a one-line fix never pays a full team's coordination overhead.

**Constitutional floors are never priced**: the security floor, the contradiction escalator (crossing an accepted decision or an explicit human statement is never silent), and the destructive-action floor. Floors park items; they never stall a run, and they can never be defaulted through.

### 3. The deterministic replay gate (the substrate)

A "done" claim is accepted only when deterministic machinery re-executes the attached evidence: referenced files exist, test commands re-run with matching exit codes, citations resolve, fixture provenance is declared (`captured_from:` or `synthetic: true` — synthetic-only fixtures on an external-data path block the review). This is the only mechanism whose correctness doesn't depend on an agent being diligent, and everything else inherits its trust.

Honesty rule (D-039): only deterministic replay and PreToolUse denies are called *enforcement*. Every file-shape check is labeled *advisory lint*, because a check on a file the agent writes can be gamed by that agent.

> **⚠ pending Fork C + spike 1** — whether Tier-0 replay runs as a blocking `TaskCompleted` hook or as a deterministic pre-review script (same checks, weaker trigger) depends on the gate-posture fork and the hook-payload spike. The checks themselves ship either way.

### 4. The project brain (the cache)

`artifacts/context/project-brain.md`: a hard-budgeted (~2,500-token) comprehension cache — identity, current mental model, load-bearing facts with resolvable pointers, active threads, dead ends, open questions — written as a side effect of work, read at every session boot, verified mechanically. Success test: a fresh Claude reading the brain outperforms a thrice-compacted Claude. Machine state (phase, gates) lives in the brain's frontmatter (D-037); there is no separately maintained state file to go stale.

## How It Works

BMAD Swarm works by generating configuration files that Claude Code reads natively. The agent definitions, hooks, commands, and rules are all standard Claude Code features — bmad-swarm just generates them with the right content, and `bmad-swarm update` regenerates them safely (hash-based modification detection; your edits are never clobbered).

> **⚠ pending Fork D** — the orchestrator launch mechanism. The proposed shape: `bmad-swarm start` launches `claude --agent orchestrator`, making the orchestrator a native main-session agent and retiring the `/identity-orchestrator` slash-command ceremony, the reminder hook, and most post-compact re-injection. Until Fork D is ratified (and spike 4 verifies the primitive), `start` continues to load orchestrator identity via `/identity-orchestrator` on the first turn.

### The Orchestrator

Claude itself becomes the orchestrator — an AI coordinator that never writes code, only delegates. When you give it a task it assesses complexity across 5 dimensions, routes it through the priced decision router (solo, workflow, or team), assembles only the agents needed, creates a task graph with quality gates, and calibrates which decisions to involve you in versus handle autonomously.

### Phases

| Phase | Mode | Purpose | Primary Agents |
|-------|------|---------|----------------|
| **0. Ideation** | Interactive | Brainstorm and refine ideas | Ideator |
| **1. Exploration** | Interactive | Research problem space | Researcher |
| **2. Definition** | Interactive | Define requirements (PRD) | Strategist |
| **3. Design** | Interactive | Architecture and technical decisions | Architect |
| **4. Implementation** | Parallel | Build, test, review in sprints | Developer, Reviewer |
| **5. Delivery** | Parallel | Final validation and handoff | Reviewer, DevOps |

Phases are skipped based on complexity. A bug fix goes straight to Implementation. A small feature might skip Exploration and Definition.

### Agents

Nine roles. Each is a native Claude Code agent definition spawned via `subagent_type`.

| Agent | Role |
|-------|------|
| **orchestrator** | Team lead. Assesses complexity, routes decisions, builds teams, creates task graphs. Never implements directly. |
| **ideator** | Structured brainstorming partner. Techniques, anti-bias protocols, elicitation methods. Adapts to your thinking style. |
| **researcher** | Discovery, analysis, and context acquisition. Web research and codebase scanning. |
| **strategist** | Product strategy, requirements definition, PRD creation, story decomposition. |
| **architect** | Technical design, system architecture, technology selection. |
| **developer** | Story implementation following TDD. Multiple developers can work in parallel via isolated worktrees. |
| **reviewer** | Adversarial code review with configurable lenses (test-coverage, security, docs, and more). Validates quality, architecture compliance, and decision traceability. |
| **devops** | Infrastructure, CI/CD, deployment automation. |
| **security** | Security design, threat modeling, vulnerability analysis. |

(The 1.x roster's `story-engineer`, `qa`, `retrospective`, and `tech-writer` were absorbed into strategist, reviewer, and orchestrator process steps in 2.0.0.)

### Decision Traceability

Every significant decision gets a **D-ID** that flows through the entire artifact chain — from brainstorm to product brief to PRD to architecture to story acceptance criteria to review. Decisions made once are never silently dropped, and crossing an accepted decision is never silent: the contradiction escalator surfaces it to you every time.

Recommendations get the same treatment. Every role carries a counsel duty; the orchestrator is the editor, not the author. Each recommendation is logged with its evidence and stakes, and when you reject one, the rejection is logged *with an explicit re-open trigger* — the system will not nag you, and it will tell you exactly what future observation would make it raise the topic again.

### Overnight autonomy — `/sleep`

> **⚠ pending Fork A** — `/sleep` ships only after the security-posture fork lands (permission narrowing is its named precondition), the durable task ledger is field-tested, and the replay gate is live. Until all three hold, this section is roadmap, not product.

Run the swarm while you sleep. The Night Ladder handles what the day mode would ask you about: **fork it** (explore both branches in isolated worktrees), **default it** (take the reversible default and log it), or **park it** (route around and queue it for morning). The one hard fence is the destructive axis — no pushes, publishes, deploys, real-data migrations, or auto-merges, ever; `.claude/`, hooks, and the night charter are write-denied so the system cannot legislate its own permissions.

You wake up to a morning report — a queue to clear, not a wall of questions: answers needed, branches to pick between, work ready to merge, shelved ideas, parked items. The ones you don't want cost only the deleting.

### Autonomy Levels

| Level | Behavior | Best For |
|-------|----------|----------|
| `auto` | No human checkpoints. Reports results at the end. | Bug fixes, small features, well-defined tasks |
| `guided` | Pauses at phase boundaries for human review. | Medium features, new modules |
| `collaborative` | Pauses at phase boundaries AND within phases for key choices. | New apps, major redesigns, vague requirements |

Human approval is always required for the PRD, the architecture, and every lesson promotion — regardless of autonomy level.

## CLI Reference

### `bmad-swarm init`

Initialize a new project in the current directory.

| Flag | Description |
|------|-------------|
| `--scan` | Auto-detect language, framework, and test setup from existing codebase |
| `--template <name>` | Use a predefined stack template (`next-app`, `express-api`, `react-app`, `node-cli`, `python-api`) |
| `-y, --yes` | Accept all defaults without interactive prompts |
| `--github` | Generate GitHub Actions workflow for artifact validation |

### `bmad-swarm start`

Launch Claude Code in the project with the orchestrator identity loaded.

| Flag | Description |
|------|-------------|
| `--print` | Print the claude command instead of running it |

> **⚠ pending Fork D** — under Fork D1 this becomes `claude --agent orchestrator` with an initial prompt; today it launches Claude and loads identity via `/identity-orchestrator`.

### `bmad-swarm update`

Regenerate all managed files from `swarm.yaml`. Safe to run repeatedly — never touches user-owned files (`swarm.yaml`, `overrides/`, `artifacts/`, `src/`). Flags: `--dry-run`, `--force`.

### `bmad-swarm validate`

Validate artifacts against the methodology's artifact schemas. `--phase <name>` restricts to one phase (`exploration`, `planning`, `design`, `implementation`, `reviews`).

### `bmad-swarm doctor`

Diagnose a project's bmad-swarm installation: generated-file integrity, hook wiring, settings, scaffold-version skew.

### `bmad-swarm status`

Show project configuration, current phase, agent status, and artifact counts.

### `bmad-swarm phase`

Inspect and advance the project's phase state.

### `bmad-swarm scan`

Detect stack from the current codebase and generate `project-context.md`.

### `bmad-swarm eject agent <name>` / `uneject agent <name>`

Copy an agent template to `overrides/agents/` for local customization (survives `update`); `uneject` restores the package version.

### `bmad-swarm scaffold-team`

Read the `## Domain Map` from `architecture.md` and emit the corresponding `team:` block for `swarm.yaml`. Read-only by default; `--write` injects it with backup and validation. See Wide-team specialization below.

### `bmad-swarm workspace` / `bmad-swarm plugin`

> **⚠ pending kill-list ratification** — both commands exist today but are inert facades (workspace context and discovered plugin agents are never consumed by generation). The reinvention vision recommends removing them (§3, facade ring). They are documented here for completeness, not endorsement; do not build on them.

## Wide-team specialization

Wide-team specialization lets you pre-spawn multiple domain-specialized teammates (one developer dedicated to `backend-auth`, another to `frontend-dashboard`) instead of recycling one generic developer across many domains. Each specialist holds bounded context for the entire session. Dynamic mode (default) is unchanged; wide-team is opt-in via a `team:` block in `swarm.yaml` (`mode: fixed` plus a specializations list matching the architecture's Domain Map). Two opt-in retrofit tools remove the manual edits for existing projects: `/retrofit-team` (proposes and inserts the Domain Map, human-approved) and `bmad-swarm scaffold-team` (emits the matching `team:` block). Neither runs automatically. See `artifacts/design/architecture-retrofit.md` and ADR-010–ADR-012.

## Artifact System

Agents coordinate through structured files on disk, not message passing.

```
artifacts/
  exploration/     Research and analysis
  planning/        Product brief, PRD
  design/          Architecture, ADRs
  implementation/  Epics, stories
  reviews/         Code reviews, retrospectives, test reports
  delivery/        Date-stamped operational files (night charters, morning reports)
  context/         Exactly five standing files (D-036):
    project-brain.md      Hot comprehension cache + machine-state frontmatter
    decision-log.md       D-records
    ledger.md             Unified R/L/C/F record ledger
    task-ledger.md        Append-only task lifecycle events
    team-assembly-log.md  Legacy (disposition per Fork C)
```

Cross-project knowledge (promoted rules, decision priors, tech verdicts) lives in `~/.bmad/knowledge/`, never in a single project.

### Model tiers

> **⚠ pending Fork B** — the default tier policy. Valid model values everywhere a model can be configured: `haiku`, `sonnet`, `opus`, `fable`, `inherit`. The proposed policy (Fork B recommendation, superseding D-027's fable-everywhere): default `opus`; `fable` (Claude Fable 5 — highest intelligence ceiling, 1M context, 2× opus cost) for architect/strategist/security and complexity ≥ 12 work; `sonnet` for researcher/devops; a visible per-project override knob. Until Fork B is decided, configure tiers explicitly per agent in `swarm.yaml`.

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
  bin/bmad-swarm.js   CLI entry point
  cli/                Command implementations
  agents/             Agent role templates (9 agents)
  methodology/        Phase definitions, gates, schemas, decision frameworks
  templates/          Template files for generation (settings.json, CLAUDE.md, rules)
  generators/         File generation logic (agents, hooks, commands, settings, rules, claude-md)
  utils/              Shared utilities (config, fs-helpers, domain-map, cost-estimator, ...)
  test/               Test suite (node:test)
```

### Testing Changes Locally

```bash
npm link                 # 'bmad-swarm' now points to your local checkout
cd /some/test-project && bmad-swarm init
npm unlink -g bmad-swarm # when done
```

## Relationship to BMAD Method

BMAD Swarm is built on the [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) (Breakthrough Method for Agile AI-Driven Development) by Brian Madison.

| | Original BMAD | BMAD Swarm |
|---|---|---|
| **Execution** | One AI, sequential, you switch personas manually | Multiple AI agents working in parallel |
| **Orchestration** | You manage the process with commands | Claude becomes the orchestrator automatically |
| **Memory** | Artifacts as documentation | Outcome-linked decision memory: D/R/L/C/F records, fingerprinted lessons, cross-project knowledge |
| **Verification** | Trust the model's report | Deterministic replay of evidence before any "done" is accepted |
| **Documentation** | Rich artifacts as a byproduct | Same, plus decision traceability across all artifacts |

BMAD Swarm keeps what BMAD does best — structured brainstorming, rich documentation, phased methodology, quality gates — and adds what native Claude Code agent teams do best — parallel execution, autonomous orchestration — plus the thing neither has: a system that argues from its own receipts.

## Troubleshooting

**`bmad-swarm init` says "already has a swarm.yaml"** — run `bmad-swarm update` instead, or delete `swarm.yaml` to start fresh.

**Agents are not being spawned** — verify `.claude/settings.json` exists; re-run `bmad-swarm update`.

**Tests are not running / wrong test framework** — set `stack.testing` explicitly in `swarm.yaml`.

**Agent behavior is wrong after update** — check `overrides/agents/` for ejected files; `bmad-swarm uneject agent <name>` restores defaults.

**Something looks broken after upgrading** — run `bmad-swarm doctor` to check for scaffold-version skew, then `bmad-swarm update` to regenerate.

## License

MIT
