# Orchestration Modes

The orchestrator selects one of three modes based on what the human is asking for and how complex the work is. The mode determines whether agents work interactively with the human, autonomously in parallel, or a mix of both.

---

## Interactive Mode (Single Agent, Human-in-the-Loop)

**When to use:**
- Brainstorming and ideation — the human wants to explore, not execute
- Concept refinement — ideas exist but need shaping through conversation
- Requirement clarification — the human knows what they want but hasn't articulated it yet
- Design decisions where human taste matters — data model shape, UX direction, naming, priorities
- Any work that is inherently conversational and doesn't benefit from parallelism

**How it works:**
- Orchestrator spawns a single agent (ideator, strategist, or architect depending on the task)
- That agent works directly with the human in conversation
- No task graph, no artifact coordination — just focused dialogue
- The agent produces artifacts (product brief, research report, architecture doc) as outputs of the conversation

**Why this mode exists:**
- Brainstorming doesn't parallelize. Two agents brainstorming independently produces two mediocre lists, not one great one.
- Some decisions require human judgment that can't be captured in a task description — "does this feel right?" is a valid and important question.
- The overhead of task graphs and artifact coordination adds latency without value for conversational work.

**Example triggers:**
- "help me brainstorm features for..."
- "let's think about the UX for..."
- "what should the data model look like?"
- "I'm not sure what to build yet"
- "can we explore a few approaches?"

**Complexity signal:** Score 5-7 on the complexity assessment, or any task in the Ideation/Exploration/Definition phases regardless of score.

---

## Parallel Mode (Multiple Agents, Autonomous, Artifact-Driven)

**When to use:**
- Implementation of well-defined work — stories exist, acceptance criteria are clear
- Independent research tracks — market research and technical research can run simultaneously
- Review + QA — reviewer and QA agent work on different aspects of the same code
- Multi-module development — two developers on independent modules with no shared interfaces

**How it works:**
- Orchestrator builds a task graph with dependencies
- Spawns team members and assigns tasks
- Agents coordinate through artifacts on disk (stories, code, reviews) — not through conversation
- Orchestrator monitors progress and resolves blockers
- Up to 2 developers run in parallel (more causes merge conflicts and coordination overhead that exceeds the speed gain)

**Why this mode exists:**
- Implementation genuinely benefits from parallelism. Two developers on independent modules is faster than one developer doing them sequentially.
- Well-defined work doesn't need human conversation at every step — the story file contains all the context.
- Artifact-driven coordination scales better than message-passing for implementation work.

**Example triggers:**
- "build this feature" (when stories/specs already exist)
- "implement the stories from the sprint plan"
- "review and QA the code"
- "research both the market opportunity and the technical feasibility"

**Complexity signal:** Score 11+ on the complexity assessment, or any task in the Implementation/Delivery phases with clear specs.

---

## Hybrid Mode (Interactive + Parallel)

**When to use:**
- Complex projects that need both brainstorming depth AND implementation speed
- Greenfield projects — "I have a vague idea and want to build it"
- Projects where early phases require human judgment but later phases are well-defined
- Any work that transitions from exploration to execution

**How it works:**
- **Phase 1 (Interactive):** Orchestrator spawns single agents for ideation, exploration, and definition. Human participates directly in brainstorming, product brief creation, and architecture decisions.
- **Phase boundary:** Once specs are approved (PRD, architecture, stories), the orchestrator transitions to parallel mode.
- **Phase 2 (Parallel):** Orchestrator builds task graph from approved specs, spawns development team, coordinates via artifacts.
- **Checkpoints:** Human is pulled back into interactive mode for approval gates (PRD approval, architecture approval) and when blockers require human judgment.

**Why this mode exists:**
- Most real projects aren't purely conversational or purely autonomous. They start vague and become concrete.
- The orchestrator's job is to recognize when the work has shifted from "needs human conversation" to "needs execution speed" and adjust.

**Example triggers:**
- "I have an idea for a product..." (starts interactive, transitions to parallel)
- "here's a rough concept, help me flesh it out and build it"
- "let's design the system and then implement it"

**Complexity signal:** Score 8-10 on the complexity assessment, or any project that spans multiple methodology phases.

---

## Decision Criteria

The orchestrator evaluates these factors to choose a mode:

### 1. Clarity of Requirements

| Clarity Level | Mode |
|--------------|------|
| Vague idea, no specs | Interactive — needs conversation to define |
| Partial specs, some unknowns | Hybrid — interactive to fill gaps, parallel to build |
| Complete specs, clear acceptance criteria | Parallel — execute directly |

### 2. Phase of Work

| Phase | Default Mode |
|-------|-------------|
| Ideation | Interactive |
| Exploration | Interactive |
| Definition | Interactive (with possible parallel research) |
| Design | Interactive for architecture decisions, parallel for independent design tasks |
| Implementation | Parallel |
| Delivery | Parallel |

### 3. Complexity Score

| Score | Mode | Rationale |
|-------|------|-----------|
| 5-7 | Interactive | Small enough for one agent to handle conversationally |
| 8-10 | Hybrid | Complex enough to benefit from parallelism, but needs human input for key decisions |
| 11+ | Parallel (or Hybrid if early-phase) | Large enough that parallel execution provides real speed gains |

### 4. Human's Intent

Sometimes the human tells you directly:
- "let's talk through this" → Interactive, regardless of complexity
- "just build it" → Parallel, if specs exist
- "I want to be involved in the design but not the implementation" → Hybrid

**Always respect explicit human intent over algorithmic mode selection.**

---

## Mode Transitions

The orchestrator can switch modes mid-project. Common transitions:

- **Interactive → Parallel:** Human approves specs, work becomes well-defined. "Great, the PRD looks good. Let me set up the development team."
- **Parallel → Interactive:** Blocker requires human judgment, or implementation reveals a design flaw. "We hit a question about the data model that needs your input."
- **Hybrid → Parallel:** All interactive phases complete, only execution remains.
- **Any → Interactive:** Human asks to get involved. "Wait, I want to see how you're handling auth." Always honor this immediately.

The orchestrator announces mode transitions clearly: "I'm going to set up parallel development for the three independent modules. I'll check back when they're ready for review, or sooner if we hit a decision that needs your input."
