# BMAD Brainstorming & Ideation Research Report

**Source:** `_archive/_bmad/` (BMAD Method v6.0.0-Beta.8)
**Researcher:** researcher agent
**Date:** 2026-02-10

---

## Table of Contents

1. [Brainstorming Technique Library](#1-brainstorming-technique-library) -- 61 techniques across 11 categories
2. [Anti-Bias Protocol](#2-anti-bias-protocol) -- Domain rotation and semantic clustering prevention
3. [Advanced Elicitation System](#3-advanced-elicitation-system) -- 50-method registry with interactive selection loop
4. [Brainstorming Workflow Steps](#4-brainstorming-workflow-steps) -- 4-step structured discovery process
5. [Party Mode Mechanics](#5-party-mode-mechanics) -- Multi-perspective deliberation system
6. [Product Brief Workflow](#6-product-brief-workflow) -- 6-step collaborative product discovery
7. [Storytelling & Narrative Techniques](#7-storytelling--narrative-techniques) -- 25 story frameworks from CIS module
8. [Scale-Adaptive Logic](#8-scale-adaptive-logic) -- Quick flow vs full planning decision system
9. [CIS Module Libraries](#9-cis-module-libraries) -- Design thinking, innovation, problem-solving methods
10. [Agent Personas for Brainstorming](#10-agent-personas-for-brainstorming) -- Character definitions used in party mode

---

## 1. Brainstorming Technique Library

**Source:** `core/workflows/brainstorming/brain-methods.csv`

The BMAD brainstorming system includes **61 techniques across 11 categories**. Each technique has a category, name, and rich description with embedded facilitation prompts. This is the single most valuable asset for the ideator agent.

### Category: Collaborative (5 techniques)

| Technique | Description | When to Use |
|-----------|-------------|-------------|
| **Yes And Building** | Build momentum through positive additions where each idea becomes a launching pad. Prompts: "Yes, and we could also...", "Building on that idea..." | Creating energetic collaborative flow, building on contributions |
| **Brain Writing Round Robin** | Silent idea generation followed by building on others' written concepts. Write silently, pass ideas, build on received concepts. | Giving quieter voices equal contribution while maintaining documentation |
| **Random Stimulation** | Use random words/images as creative catalysts to force unexpected connections. Ask how random elements relate, force relationships. | Breaking through mental blocks with serendipitous inspiration |
| **Role Playing** | Generate solutions from multiple stakeholder perspectives. Embody different roles -- what they want, how they'd approach problems, what matters most. | Building empathy and ensuring comprehensive consideration |
| **Ideation Relay Race** | Rapid-fire idea building under time pressure. 30-second additions, quick building, fast passing. | Creating urgency and breakthroughs, preventing overthinking |

### Category: Creative (10 techniques)

| Technique | Description |
|-----------|-------------|
| **What If Scenarios** | Explore radical possibilities by questioning all constraints. "What if we had unlimited resources?" "What if the opposite were true?" |
| **Analogical Thinking** | Find creative solutions by drawing parallels to other domains. "This is like what?" "How is this similar to...?" |
| **Reversal Inversion** | Deliberately flip problems upside down. "What if we did the opposite?" "How could we make this worse?" |
| **First Principles Thinking** | Strip away assumptions to rebuild from fundamental truths. "What do we know for certain?" "If we started from scratch?" |
| **Forced Relationships** | Connect unrelated concepts to spark innovative bridges. Take two unrelated things, find connections, explore synergies. |
| **Time Shifting** | Explore solutions across different time periods. "How would this work in the past?" "What about 100 years from now?" |
| **Metaphor Mapping** | Use extended metaphors as thinking tools. "This problem is like a [metaphor]" -- extend it, map elements, discover insights. |
| **Cross-Pollination** | Transfer solutions from completely different industries. "How would industry X solve this?" |
| **Concept Blending** | Merge two or more existing concepts to create entirely new categories. Goes beyond simple combination. |
| **Reverse Brainstorming** | Generate problems instead of solutions. "What could go wrong?" "How could we make this fail?" to reveal solution insights. |
| **Sensory Exploration** | Engage all five senses. "What does this idea feel/smell/taste/sound like?" |

### Category: Deep Analysis (8 techniques)

| Technique | Description |
|-----------|-------------|
| **Five Whys** | Drill down through layers of causation to uncover root causes. Ask "Why?" repeatedly until reaching fundamental drivers. |
| **Morphological Analysis** | Systematically explore all possible parameter combinations. Identify key parameters, list options, try combinations. |
| **Provocation Technique** | Use deliberately provocative statements. "What if [provocative statement]?" Extract useful ideas from absurd starting points. |
| **Assumption Reversal** | Challenge and flip core assumptions. "What assumptions are we making?" "What if the opposite were true?" Rebuild from new foundations. |
| **Question Storming** | Generate questions before seeking answers. Only questions, no answers yet. Focus on what we don't know. |
| **Constraint Mapping** | Identify and visualize all constraints. Which are real vs imagined? How to work around or eliminate barriers? |
| **Failure Analysis** | Study successful failures to extract valuable insights. What went wrong? Why? What lessons emerged? |
| **Emergent Thinking** | Allow solutions to emerge organically. What patterns emerge? What wants to happen naturally? What's trying to emerge from the system? |

### Category: Introspective Delight (6 techniques)

| Technique | Description |
|-----------|-------------|
| **Inner Child Conference** | Channel pure childhood curiosity. What would 7-year-old you ask? Use "why why why" questioning. Forbid boring thinking. |
| **Shadow Work Mining** | Explore what you're actively avoiding. Where's resistance? What scares you? Mine the shadows for buried wisdom. |
| **Values Archaeology** | Excavate deep personal values. What really matters? Why do you care? What's non-negotiable? |
| **Future Self Interview** | Seek wisdom from wiser future self. What would your 80-year-old self tell younger you? |
| **Body Wisdom Dialogue** | Let physical sensations guide ideation. What does your body say? Where do you feel it? Trust tension. |
| **Permission Giving** | Grant explicit permission to think impossible thoughts. Break self-imposed creative barriers. |

### Category: Structured (7 techniques)

| Technique | Description |
|-----------|-------------|
| **SCAMPER Method** | Seven lenses: Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse. |
| **Six Thinking Hats** | Six perspectives: White (facts), Red (emotions), Yellow (benefits), Black (risks), Green (creativity), Blue (process). |
| **Mind Mapping** | Visually branch ideas from central concept. Put main idea in center, branch concepts, identify sub-branches. |
| **Resource Constraints** | Impose extreme limitations. "What if you had only $1?" "No technology?" "One hour to solve?" |
| **Decision Tree Mapping** | Map out all possible decision paths and outcomes. Identify decision points, possible paths, where different choices lead. |
| **Solution Matrix** | Create systematic grid of problem variables and solution approaches. Identify key variables, test combinations. |
| **Trait Transfer** | Borrow attributes from successful solutions in unrelated domains. What traits make success X work? Transfer them. |

### Category: Theatrical (6 techniques)

| Technique | Description |
|-----------|-------------|
| **Time Travel Talk Show** | Interview past/present/future selves. Playful method for gaining perspective across life stages. |
| **Alien Anthropologist** | Examine familiar problems through completely foreign eyes. Become an alien observer. What seems strange? |
| **Dream Fusion Laboratory** | Start with impossible fantasy solutions then reverse-engineer practical steps. Dream impossible, work backwards. |
| **Emotion Orchestra** | Let different emotions lead separate sessions then harmonize. Angry perspectives, joyful approaches, fearful considerations. |
| **Parallel Universe Cafe** | Explore solutions under alternative reality rules. Different physics, alternative social norms, changed historical events. |
| **Persona Journey** | Embody different archetypes. Become the archetype, ask how the persona would solve this. |

### Category: Wild (8 techniques)

| Technique | Description |
|-----------|-------------|
| **Chaos Engineering** | Deliberately break things. Build anti-fragility. What if everything went wrong? Build from rubble. |
| **Guerrilla Gardening Ideas** | Plant unexpected solutions in unlikely places. Stealth innovation. Grow solutions underground. |
| **Pirate Code Brainstorm** | Take what works from anywhere, remix without permission. Rule-bending rapid prototyping. |
| **Zombie Apocalypse Planning** | Design for extreme survival scenarios. Strip away all but essential functions. Core value discovery. |
| **Drunk History Retelling** | Explain with uninhibited simplicity. No filter. Simplify to absurdity. |
| **Anti-Solution** | Generate ways to make the problem worse. Reveals hidden assumptions through destructive creativity. |
| **Quantum Superposition** | Hold multiple contradictory solutions simultaneously until best emerges. |
| **Elemental Forces** | Imagine solutions sculpted by natural elements (earth, fire, water, air). |

### Category: Biomimetic (3 techniques)

| Technique | Description |
|-----------|-------------|
| **Nature's Solutions** | Study how nature solves similar problems. Access 3.8 billion years of evolutionary wisdom. |
| **Ecosystem Thinking** | Analyze problem as ecosystem. Identify symbiotic relationships, natural succession, ecological principles. |
| **Evolutionary Pressure** | Apply evolutionary principles to gradually improve solutions through selective pressure and adaptation. |

### Category: Quantum (3 techniques)

| Technique | Description |
|-----------|-------------|
| **Observer Effect** | How does observing/measuring solutions change their behavior? Use observer effect advantageously. |
| **Entanglement Thinking** | Explore how different elements might be connected regardless of distance. Reveal hidden relationships. |
| **Superposition Collapse** | Hold multiple potential solutions simultaneously until constraints force single optimal outcome. |

### Category: Cultural (4 techniques)

| Technique | Description |
|-----------|-------------|
| **Indigenous Wisdom** | Draw upon traditional knowledge systems. What ancestral wisdom guides us? |
| **Fusion Cuisine** | Mix cultural approaches like fusion cuisine. Cultural cross-pollination. |
| **Ritual Innovation** | Apply ritual design principles. What ritual would transform this? |
| **Mythic Frameworks** | Use myths and archetypal stories as frameworks. What myth parallels this? What archetypes are involved? |

---

## 2. Anti-Bias Protocol

**Source:** `core/workflows/brainstorming/workflow.md` (lines 14-17) and `core/workflows/brainstorming/steps/step-03-technique-execution.md` (lines 13-14)

The BMAD brainstorming system includes an explicit anti-bias protocol designed to prevent LLMs from drifting into semantic clustering (sequential bias). This is one of the most important design patterns in the system.

### The Core Rule

From the workflow definition:

> **Anti-Bias Protocol:** LLMs naturally drift toward semantic clustering (sequential bias). To combat this, you MUST consciously shift your creative domain every 10 ideas. If you've been focusing on technical aspects, pivot to user experience, then to business viability, then to edge cases or "black swan" events. Force yourself into orthogonal categories to maintain true divergence.

### Reinforcement in Technique Execution

The execution step reinforces this with additional rules:

> **ANTI-BIAS DOMAIN PIVOT:** Every 10 ideas, review existing themes and consciously pivot to an orthogonal domain (e.g., UX -> Business -> Physics -> Social Impact).

> **THOUGHT BEFORE INK (CoT):** Before generating each idea, you must internally reason: "What domain haven't we explored yet? What would make this idea surprising or 'uncomfortable' for the user?"

> **SIMULATED TEMPERATURE:** Act as if your creativity is set to 0.85 -- take wilder leaps and suggest "provocative" concepts.

### Key Design Decisions

1. **Every 10 ideas** -- a concrete, enforceable interval
2. **Orthogonal domains** -- not just "different" but perpendicular conceptual spaces
3. **Chain-of-thought enforcement** -- must reason about novelty before generating
4. **Simulated temperature** -- explicit instruction to increase creative variance
5. **Domain examples** -- UX, Business, Physics, Social Impact as pivot targets

### The Quantity Goal

> **Quantity Goal:** Aim for 100+ ideas before any organization. The first 20 ideas are usually obvious -- the magic happens in ideas 50-100.

This establishes the discipline of pushing past the easy answers. The anti-bias protocol is what makes the push from 20 to 100 actually produce novel results rather than variations on the same themes.

---

## 3. Advanced Elicitation System

**Source:** `core/workflows/advanced-elicitation/workflow.xml` and `core/workflows/advanced-elicitation/methods.csv`

The advanced elicitation system is a 50-method registry with an interactive selection loop. It can be invoked standalone or embedded within other workflows (product brief, PRD, tech-spec) to deepen any content section.

### Method Registry (50 methods across 10 categories)

#### Collaboration Methods (10)

| # | Method | Description | Output Pattern |
|---|--------|-------------|----------------|
| 1 | Stakeholder Round Table | Convene multiple personas for diverse perspectives | perspectives -> synthesis -> alignment |
| 2 | Expert Panel Review | Assemble domain experts for deep specialized analysis | expert views -> consensus -> recommendations |
| 3 | Debate Club Showdown | Two personas argue opposing positions with moderator scoring | thesis -> antithesis -> synthesis |
| 4 | User Persona Focus Group | Gather user personas to react and share frustrations | reactions -> concerns -> priorities |
| 5 | Time Traveler Council | Past-you and future-you advise present-you | past wisdom -> present choice -> future impact |
| 6 | Cross-Functional War Room | PM + engineer + designer tackle problem together | constraints -> trade-offs -> balanced solution |
| 7 | Mentor and Apprentice | Senior teaches junior who asks naive questions | explanation -> questions -> deeper understanding |
| 8 | Good Cop Bad Cop | Supportive and critical personas alternate | encouragement -> criticism -> balanced view |
| 9 | Improv Yes-And | Multiple personas build without blocking | idea -> build -> build -> surprising result |
| 10 | Customer Support Theater | Angry customer + support rep roleplay | complaint -> investigation -> resolution -> prevention |

#### Advanced Reasoning Methods (6)

| # | Method | Description | Output Pattern |
|---|--------|-------------|----------------|
| 11 | Tree of Thoughts | Explore multiple reasoning paths simultaneously | paths -> evaluation -> selection |
| 12 | Graph of Thoughts | Model reasoning as interconnected network | nodes -> connections -> patterns |
| 13 | Thread of Thought | Maintain coherent reasoning across long contexts | context -> thread -> synthesis |
| 14 | Self-Consistency Validation | Generate multiple independent approaches, compare | approaches -> comparison -> consensus |
| 15 | Meta-Prompting Analysis | Step back to analyze methodology itself | current -> analysis -> optimization |
| 16 | Reasoning via Planning | Build reasoning tree guided by world models | model -> planning -> strategy |

#### Competitive Methods (3)

| # | Method | Description |
|---|--------|-------------|
| 17 | Red Team vs Blue Team | Adversarial attack-defend analysis |
| 18 | Shark Tank Pitch | Pitch to skeptical investors |
| 19 | Code Review Gauntlet | Senior devs with different philosophies review |

#### Technical Methods (5)

| # | Method | Description |
|---|--------|-------------|
| 20 | Architecture Decision Records | Multiple architects propose and debate |
| 21 | Rubber Duck Debugging Evolved | Explain to progressively more technical ducks |
| 22 | Algorithm Olympics | Multiple approaches compete with benchmarks |
| 23 | Security Audit Personas | Hacker + defender + auditor examine system |
| 24 | Performance Profiler Panel | DB expert + frontend + DevOps diagnose slowness |

#### Creative Methods (6)

| # | Method | Description |
|---|--------|-------------|
| 25 | SCAMPER Method | Seven creativity lenses |
| 26 | Reverse Engineering | Work backwards from desired outcome |
| 27 | What If Scenarios | Explore alternative realities |
| 28 | Random Input Stimulus | Inject unrelated concepts |
| 29 | Exquisite Corpse Brainstorm | Each persona adds seeing only previous contribution |
| 30 | Genre Mashup | Combine two unrelated domains |

#### Research Methods (3)

| # | Method | Description |
|---|--------|-------------|
| 31 | Literature Review Personas | Optimist + skeptic + synthesizer review |
| 32 | Thesis Defense Simulation | Student defends against committee |
| 33 | Comparative Analysis Matrix | Multiple analysts evaluate against weighted criteria |

#### Risk Methods (5)

| # | Method | Description |
|---|--------|-------------|
| 34 | Pre-mortem Analysis | Imagine future failure, work backwards to prevent |
| 35 | Failure Mode Analysis | Systematically explore how components could fail |
| 36 | Challenge from Critical Perspective | Devil's advocate to stress-test |
| 37 | Identify Potential Risks | Brainstorm what could go wrong |
| 38 | Chaos Monkey Scenarios | Deliberately break things to test resilience |

#### Core Methods (6)

| # | Method | Description |
|---|--------|-------------|
| 39 | First Principles Analysis | Strip assumptions, rebuild from truths |
| 40 | 5 Whys Deep Dive | Repeatedly ask why to find root causes |
| 41 | Socratic Questioning | Use targeted questions to reveal assumptions |
| 42 | Critique and Refine | Systematic review of strengths/weaknesses |
| 43 | Explain Reasoning | Step-by-step thinking walkthrough |
| 44 | Expand or Contract for Audience | Adjust detail for target audience |

#### Learning Methods (2)

| # | Method | Description |
|---|--------|-------------|
| 45 | Feynman Technique | Explain complex concepts simply |
| 46 | Active Recall Testing | Test understanding without references |

#### Philosophical & Retrospective (4)

| # | Method | Description |
|---|--------|-------------|
| 47 | Occam's Razor Application | Find simplest sufficient explanation |
| 48 | Trolley Problem Variations | Explore ethical trade-offs |
| 49 | Hindsight Reflection | Imagine looking back from the future |
| 50 | Lessons Learned Extraction | Systematically identify takeaways |

### The Interactive Selection Loop

The elicitation workflow uses an interactive menu that re-presents after every method execution:

```
Advanced Elicitation Options (If you launched Party Mode, they will participate randomly)
Choose a number (1-5), [r] to Reshuffle, [a] List All, or [x] to Proceed:

1. [Method Name]
2. [Method Name]
3. [Method Name]
4. [Method Name]
5. [Method Name]
r. Reshuffle the list with 5 new options
a. List all methods with descriptions
x. Proceed / No Further Actions
```

### Smart Selection Logic

The system uses context analysis to select the initial 5 methods:

1. **Analyze context:** Content type, complexity, stakeholder needs, risk level, creative potential
2. **Parse descriptions:** Understand each method's purpose from CSV descriptions
3. **Select 5 methods:** Choose methods that best match context
4. **Balance approach:** Include mix of foundational and specialized techniques

### Reshuffle Logic

When reshuffling, the system tries to:
- Pick a diverse set covering different categories and approaches
- Place the 2 most useful methods for the current document/section in positions 1 and 2

### Integration Pattern

The elicitation system integrates into parent workflows via the A/P/C menu pattern:
- **[A] Advanced Elicitation** -- dive deeper into current content
- **[P] Party Mode** -- bring multiple agent perspectives
- **[C] Continue** -- proceed to next step

When called from a parent workflow:
1. Receive current section content
2. Apply elicitation methods iteratively to enhance that content
3. Ask user to accept/reject changes after each method
4. Return enhanced version when user selects 'x'

---

## 4. Brainstorming Workflow Steps

**Source:** `core/workflows/brainstorming/` (workflow.md + steps/)

### Workflow Architecture

The brainstorming workflow uses **micro-file architecture** with 4 main steps plus 4 technique selection variants:

```
Step 1:  Session Setup (topic, goals, continuation detection)
  |
  +-- Step 1b: Continuation (if existing session found)
  |
Step 2:  Technique Selection (one of 4 approaches)
  |-- 2a: User-Selected (browse library, pick techniques)
  |-- 2b: AI-Recommended (context analysis, matched suggestions)
  |-- 2c: Random Selection (serendipitous discovery)
  |-- 2d: Progressive Flow (divergent -> convergent journey)
  |
Step 3:  Interactive Technique Execution (the core creative work)
  |
Step 4:  Idea Organization & Action Planning
```

### Step 1: Session Setup

Key behaviors:
- Detects existing session documents for continuation
- Gathers session topic and goals through 2 focused questions
- Confirms understanding before proceeding
- Presents the 4 technique approach options

### Step 2 Variants

**2a: User-Selected** -- Acts as a "technique librarian," not a recommender. Presents all 11 categories with technique counts. User browses and selects. Neutral presentation without steering.

**2b: AI-Recommended** -- Acts as a "technique matchmaker." Analyzes session context across 4 dimensions:
1. **Goal Analysis:** Innovation -> creative/wild; Problem Solving -> deep/structured; Team Building -> collaborative; Personal Insight -> introspective
2. **Complexity Match:** Complex -> deep/structured; Familiar -> creative/wild; Emotional -> introspective
3. **Energy/Tone:** Formal -> structured; Playful -> creative/theatrical/wild; Reflective -> introspective/deep
4. **Time Available:** <30min = 1-2 techniques; 30-60min = 2-3; >60min = multi-phase flow

Recommends techniques in phases: Foundation Setting -> Idea Generation -> Refinement & Action

**2c: Random Selection** -- "Serendipity facilitator." Random selection from different categories ensuring variety. Includes a [Shuffle] option for re-rolling. Builds excitement around unexpected discovery.

**2d: Progressive Flow** -- "Creative journey guide." 4-phase journey:
1. **Expansive Exploration** (divergent thinking) -- generate without judgment
2. **Pattern Recognition** (analytical thinking) -- identify themes and connections
3. **Idea Development** (convergent thinking) -- refine promising concepts
4. **Action Planning** (implementation focus) -- concrete next steps

### Step 3: Technique Execution (The Heart of the System)

This is the most important step. Key rules quoted directly:

> **AIM FOR 100+ IDEAS before suggesting organization -- quantity unlocks quality (quality must grow as we progress)**

> **DEFAULT IS TO KEEP EXPLORING -- only move to organization when user explicitly requests it**

**Idea Format Template:**
```
[Category #X]: [Mnemonic Title]
Concept: [2-3 sentence description]
Novelty: [What makes this different from obvious solutions]
```

**Facilitation patterns:**
- Present one technique element at a time
- Build upon user's ideas with genuine creative contributions
- Follow user's energy and interests
- Check for continuation interest before moving on
- Energy checkpoints every 4-5 exchanges

**When user says "next technique" or "move on":**
- Immediately document current progress
- Transition to next technique with fresh coaching approach
- Connect insights from previous technique

**End-of-technique menu:**
- [K] Keep exploring this technique
- [T] Try a different technique
- [A] Go deeper (invokes Advanced Elicitation)
- [B] Take a quick break
- [C] Move to organization (only when ready)

**Critical failure modes to avoid:**
- Offering organization after only one technique or <20 ideas
- AI initiating conclusion without user explicitly requesting it
- Rushing to document rather than staying in generative mode

### Step 4: Idea Organization

Systematic convergence process:
1. Review all generated ideas
2. Theme identification and clustering
3. Present organized themes with pattern insights
4. Facilitate prioritization (Impact, Feasibility, Innovation, Alignment)
5. Develop action plans for top priorities
6. Create comprehensive session documentation

### Session Document Template

```yaml
---
stepsCompleted: []
inputDocuments: []
session_topic: ''
session_goals: ''
selected_approach: ''
techniques_used: []
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** {{user_name}}
**Date:** {{date}}
```

---

## 5. Party Mode Mechanics

**Source:** `core/workflows/party-mode/` (workflow.md + steps/)

Party Mode is BMAD's multi-perspective deliberation system. It loads all installed agents (with full persona data) and orchestrates natural conversations between them.

### Agent Loading

Agents are loaded from the agent manifest CSV with complete personality data:
- **name, displayName, title, icon** -- identity
- **role** -- capabilities summary
- **identity** -- background/expertise
- **communicationStyle** -- how they communicate
- **principles** -- decision-making philosophy

### Agent Selection Logic

For each user message or topic:

1. **Relevance Analysis:**
   - Analyze user's message for domain and expertise requirements
   - Identify which agents would naturally contribute based on their role, capabilities, and principles
   - Consider conversation context and previous contributions
   - Select 2-3 most relevant agents for balanced perspective

2. **Priority Rules:**
   - If user addresses specific agent by name, prioritize that agent + 1-2 complementary agents
   - Rotate agent selection to ensure diverse participation over time
   - Enable natural cross-talk and agent-to-agent interactions

### Cross-Talk Rules

Agents interact naturally with each other:
- Reference each other by name: "As [Agent] mentioned..."
- Build on previous points: "[Agent] makes a great point about..."
- Respectful disagreements: "I see it differently than [Agent]..."
- Follow-up questions between agents

### Question Handling Protocol

- **Direct questions to user:** End response round immediately, highlight the questioning agent, wait for user input
- **Rhetorical questions:** Continue conversation flow
- **Inter-agent questions:** Allow natural back-and-forth within same round

### Moderation

- If discussion becomes circular, have bmad-master summarize and redirect
- Balance fun and productivity based on conversation tone
- Ensure all agents stay true to their merged personalities
- Rotate agent participation for inclusive discussion

### Exit Conditions

- Automatic triggers: `*exit`, `goodbye`, `end party`, `quit`
- Graceful conclusion with agent farewells in character
- Session highlight summary before exit

### Integration with Other Workflows

Party Mode can be invoked from within brainstorming or product brief workflows via the [P] menu option. When it returns, it uses a Return Protocol:
1. Identify the parent workflow step that invoked it
2. Re-read that file to restore context
3. Resume from where the parent workflow directed

---

## 6. Product Brief Workflow

**Source:** `bmm/workflows/1-analysis/create-product-brief/` (6 step files)

The product brief is a 6-step collaborative workflow that produces a structured product document. Every step uses the A/P/C menu pattern for depth control.

### Step Progression

| Step | Focus | Key Questions | Output Section |
|------|-------|---------------|----------------|
| 1. Init | Setup & document discovery | Find brainstorming reports, research docs, project context | Frontmatter initialization |
| 2. Vision | Problem & solution discovery | Core problem? Who experiences it? What would success look like? | Executive Summary, Core Vision |
| 3. Users | Target user personas & journeys | Who experiences the problem? Different user types? Primary vs secondary? | Target Users |
| 4. Metrics | Success criteria & KPIs | How will we know we're succeeding? What metrics show real value? | Success Metrics |
| 5. Scope | MVP boundaries & future vision | Smallest version that creates real value? What's out of scope? | MVP Scope |
| 6. Complete | Quality check & next steps | Completeness validation, consistency check, workflow recommendations | Finalization |

### What Makes This Process Rich

1. **Input Document Discovery:** Step 1 searches for brainstorming reports, research documents, and project context to seed the conversation with existing work.

2. **Facilitator Role:** Every step enforces "YOU ARE A FACILITATOR, not a content generator" -- content is always generated collaboratively with the user.

3. **A/P/C Menu at Every Step:** After generating content for each section, the user can:
   - [A] Advanced Elicitation -- dive deeper using the 50-method registry
   - [P] Party Mode -- bring multiple agent perspectives
   - [C] Continue -- save and move to next step

4. **Progressive Document Building:** Content is appended section by section. Frontmatter tracks `stepsCompleted` for continuation.

5. **Vision-First Approach:** Starts with the "why" (problem, vision, differentiators) before moving to the "who" (users) and "what" (scope).

6. **Collaborative Discovery Questions:** Each step has carefully crafted questions that guide without prescribing:
   - "What excites you most about this solution?"
   - "What would users consider 'incomplete' if it was missing?"
   - "What's the moment where they realize this is solving their problem?"

### Quality Gates

Step 6 includes explicit quality validation:
- Does the executive summary clearly communicate the vision and problem?
- Are target users well-defined with compelling personas?
- Do success metrics connect user value to business objectives?
- Is MVP scope focused and realistic?
- Does the brief provide clear direction for next steps?

---

## 7. Storytelling & Narrative Techniques

**Source:** `cis/workflows/storytelling/story-types.csv`

The Creative Intelligence Suite includes 25 storytelling frameworks across 5 categories. These can enhance brainstorming by framing ideas as narratives.

### Transformation Stories (5)

| Framework | Key Questions |
|-----------|---------------|
| **Hero's Journey** | Who is the hero? What's their ordinary world? What call disrupts it? What trials? How transformed? |
| **Pixar Story Spine** | Once upon a time...? Every day...? Until one day...? Because of that...? Until finally...? |
| **Customer Journey** | What was the before struggle? What discovery moment? How implement? What transformation? New reality? |
| **Challenge Overcome** | What obstacle blocked? How did stakes escalate? Darkest moment? What breakthrough? What learned? |
| **Character Arc** | Who at start? What forces change? What resist? What breakthrough shifts? Who have they become? |

### Strategic Stories (5)

| Framework | Key Questions |
|-----------|---------------|
| **Brand Story** | What sparked this brand? Core values? Impact on customers? What makes it different? Where heading? |
| **Vision Narrative** | Current reality? What opportunity? Bold vision? Strategic path? Transformed future? |
| **Origin Story** | Spark moment? Early struggles? Key breakthrough? How evolved? Current mission? |
| **Positioning Story** | Market gap? Uniquely qualified? Different approach? Why should audience care? Future enabled? |
| **Culture Story** | Principles guiding decisions? Behaviors exemplifying culture? Stories illustrating values? |

### Persuasive Stories (5)

| Framework | Key Questions |
|-----------|---------------|
| **Pitch Narrative** | Problem landscape? Vision for solution? Proof validates approach? Opportunity size? Action wanted? |
| **Sales Story** | Pain they feel? How you understand it? Solution transforms? Results expected? Path forward? |
| **Change Story** | Why can't we stay? What does better look like? What's at stake? How to get there? What's in it for them? |
| **Fundraising Story** | Problem that breaks hearts? Solution creating hope? Impact of investment? Why urgent? How can they help? |
| **Advocacy Story** | What injustice? Who affected? What change needed? What happens if we act? How join? |

### Analytical Stories (5)

| Framework | Key Questions |
|-----------|---------------|
| **Data Storytelling** | Context needed? What data reveals? Patterns explain? So what? Actions to follow? |
| **Case Study** | Situation? Approach taken? Challenges emerged? Results achieved? Lessons transfer? |
| **Research Narrative** | Question driving research? How investigated? What discovered? What does it mean? Implications? |
| **Insight Narrative** | What did everyone assume? What did you notice? Deeper pattern? Why matters? What should change? |
| **Process Story** | What being created? Approach chosen? Challenges arose? How solved? What learned? |

### Emotional Stories (5)

| Framework | Key Questions |
|-----------|---------------|
| **Hook Driven** | Surprising fact? Urgent question? Emotional peaks? Creates relatability? Payoff satisfies? |
| **Conflict Resolution** | Central conflict? Who wants what? What prevents resolution? Tension escalation? Resolution? |
| **Empathy Story** | Whose perspective? What experience? What feel? Why care? Common ground? |
| **Human Interest** | Who at center? Personal stakes? Universal themes? Emotional journey? What makes relatable? |
| **Vulnerable Story** | Truth hard to share? Struggle faced? What learned? Why share now? Hope offered? |

---

## 8. Scale-Adaptive Logic

**Source:** `bmm/workflows/bmad-quick-flow/quick-dev/steps/step-01-mode-detection.md`

BMAD has a built-in escalation system that decides when a task needs full planning vs quick execution. This is the "scale-adaptive logic" that makes BMAD smart about process depth.

### Two-Track System

BMAD offers two tracks:
1. **Quick Flow** (Quick-Spec + Quick-Dev) -- for focused features and small tasks
2. **Full BMad Method** (Product Brief -> PRD -> Architecture -> Stories -> Development) -- for complex systems

### Mode Detection

The Quick-Dev workflow first determines execution mode:
- **Mode A (Tech-Spec):** User provided a spec file -> execute directly
- **Mode B (Direct Instructions):** User described a task -> evaluate complexity

### Escalation Threshold (Mode B)

Complexity is evaluated by counting **escalation signals** in the user's input:

**Triggers escalation (if 2+ signals present):**
- Multiple components mentioned (dashboard + api + database)
- System-level language (platform, integration, architecture)
- Uncertainty about approach ("how should I", "best way to")
- Multi-layer scope (UI + backend + data together)
- Extended timeframe ("this week", "over the next few days")

**Reduces signal (simplicity markers):**
- "just", "quickly", "fix", "bug", "typo", "simple"
- Single file/component focus
- Confident, specific request

Uses **holistic judgment, not mechanical keyword matching**.

### Escalation Levels

**No Escalation (simple request):**
```
[P] Plan first (tech-spec)
[E] Execute directly
```

**Level 0-2 (focused feature with multiple components):**
```
[P] Plan first (tech-spec) (recommended)
[W] Seems bigger than quick-dev -- Recommend Full BMad Flow PRD Process
[E] Execute directly
```

**Level 3+ (platform/system work):**
```
[W] Start BMad Method (recommended)
[P] Plan first (tech-spec) (lighter planning)
[E] Execute directly -- feeling lucky
```

### Domain Complexity Detection

BMAD also has a domain complexity detection system (`create-prd/data/domain-complexity.csv`) that identifies high-complexity domains requiring special attention:

| Domain | Complexity | Key Concerns |
|--------|-----------|--------------|
| Healthcare | High | FDA, HIPAA, Patient safety |
| Fintech | High | KYC/AML, PCI DSS, Fraud prevention |
| GovTech | High | FedRAMP, 508 compliance, Privacy |
| Aerospace | High | DO-178C, Safety certification |
| Automotive | High | ISO 26262, Functional safety |
| LegalTech | High | Legal ethics, Attorney-client privilege |
| EdTech | Medium | COPPA/FERPA, Content moderation |
| Scientific | Medium | Reproducibility, Statistical validity |
| General | Low | Standard requirements |

### Project Type Detection

The system also detects project type (`create-prd/data/project-types.csv`) to customize the planning process:

| Project Type | Detection Signals | Key Questions |
|-------------|-------------------|---------------|
| API/Backend | API, REST, GraphQL | Endpoints? Auth? Rate limits? |
| Mobile App | iOS, Android, app | Native or cross-platform? Offline? |
| SaaS B2B | SaaS, platform, dashboard | Multi-tenant? Permissions? |
| Developer Tool | SDK, library, package | Language support? IDE integration? |
| CLI Tool | CLI, terminal, bash | Interactive or scriptable? |
| Web App | website, SPA, PWA | SPA or MPA? SEO? Accessibility? |
| Desktop App | Windows, Mac, Linux | Cross-platform? Auto-update? |
| IoT/Embedded | IoT, device, sensor | Hardware? Power constraints? |

---

## 9. CIS Module Libraries

**Source:** `cis/workflows/` (design-thinking, innovation-strategy, problem-solving)

### Design Thinking Methods (31 methods across 7 phases)

**Source:** `cis/workflows/design-thinking/design-methods.csv`

| Phase | Methods |
|-------|---------|
| **Empathize** | User Interviews, Empathy Mapping, Shadowing, Journey Mapping, Diary Studies |
| **Define** | Problem Framing, How Might We, Point of View Statement, Affinity Clustering, Jobs to be Done |
| **Ideate** | Brainstorming, Crazy 8s, SCAMPER Design, Provotype Sketching, Analogous Inspiration |
| **Prototype** | Paper Prototyping, Role Playing, Wizard of Oz, Storyboarding, Physical Mockups |
| **Test** | Usability Testing, Feedback Capture Grid, A/B Testing, Assumption Testing, Iterate and Refine |
| **Implement** | Pilot Programs, Service Blueprinting, Design System Creation, Stakeholder Alignment, Measurement Framework |

### Innovation Frameworks (31 frameworks across 6 categories)

**Source:** `cis/workflows/innovation-strategy/innovation-frameworks.csv`

| Category | Frameworks |
|----------|-----------|
| **Disruption** | Disruptive Innovation Theory, Jobs to be Done, Blue Ocean Strategy, Crossing the Chasm, Platform Revolution |
| **Business Model** | Business Model Canvas, Value Proposition Canvas, Business Model Patterns, Revenue Model Innovation, Cost Structure Innovation |
| **Market Analysis** | TAM SAM SOM, Five Forces, PESTLE Analysis, Market Timing Assessment, Competitive Positioning Map |
| **Strategic** | Three Horizons Framework, Lean Startup, Innovation Ambition Matrix, Strategic Intent Development, Scenario Planning |
| **Value Chain** | Value Chain Analysis, Unbundling Analysis, Platform Ecosystem Design, Make vs Buy, Partnership Strategy |
| **Technology** | Technology Adoption Lifecycle, S-Curve Analysis, Technology Roadmapping, Open Innovation Strategy, Digital Transformation |

### Problem-Solving Methods (31 methods across 7 categories)

**Source:** `cis/workflows/problem-solving/solving-methods.csv`

| Category | Methods |
|----------|---------|
| **Diagnosis** | Five Whys Root Cause, Fishbone Diagram, Problem Statement Refinement, Is/Is Not Analysis, Systems Thinking |
| **Analysis** | Force Field Analysis, Pareto Analysis, Gap Analysis, Constraint Identification, Failure Mode Analysis |
| **Synthesis** | TRIZ Contradiction Matrix, Lateral Thinking, Morphological Analysis, Biomimicry Problem Solving, Synectics Method |
| **Evaluation** | Decision Matrix, Cost Benefit Analysis, Risk Assessment Matrix, Pilot Testing Protocol, Feasibility Study |
| **Implementation** | PDCA Cycle, Gantt Chart Planning, Stakeholder Mapping, Change Management Protocol, Monitoring Dashboard |
| **Creative** | Assumption Busting, Random Word Association, Reverse Brainstorming, Six Thinking Hats, SCAMPER for Problems |

---

## 10. Agent Personas for Brainstorming

**Source:** `bmm/teams/default-party.csv` and `cis/teams/default-party.csv`

The system includes rich agent personas used in Party Mode and brainstorming. These personas define communication styles, principles, and expertise areas.

### BMM Agents (Methodology Module)

| Agent | Display Name | Communication Style | Principles |
|-------|-------------|---------------------|-----------|
| analyst | Mary | "Treats analysis like a treasure hunt -- excited by every clue, thrilled when patterns emerge" | Every business challenge has root causes waiting to be discovered. Ground in evidence. |
| architect | Winston | "Calm, pragmatic tones, balancing 'what could be' with 'what should be.' Champions boring technology" | User journeys drive decisions. Embrace boring technology. Design simple solutions. |
| dev | Amelia | "Ultra-succinct. Speaks in file paths and AC IDs. No fluff, all precision." | Story Context XML is single source of truth. Reuse over rebuilding. |
| pm | John | "Asks 'WHY?' relentlessly like a detective. Direct and data-sharp." | Uncover the deeper WHY. Ruthless prioritization. Proactively identify risks. |
| ux-designer | Sally | "Paints pictures with words, telling user stories that make you FEEL the problem" | Every decision serves genuine user needs. Start simple, evolve through feedback. |

### CIS Agents (Creative Intelligence Suite)

| Agent | Display Name | Communication Style | Principles |
|-------|-------------|---------------------|-----------|
| brainstorming-coach | Carson | "Enthusiastic improv coach -- high energy, YES AND, celebrates wild thinking" | Psychological safety unlocks breakthroughs. Wild ideas become innovations. |
| creative-problem-solver | Dr. Quinn | "Sherlock Holmes mixed with playful scientist -- deductive, curious, AHA moments" | Every problem is a system revealing weaknesses. Right question beats fast answer. |
| design-thinking-coach | Maya | "Jazz musician -- improvises around themes, vivid sensory metaphors" | Design is about THEM not us. Validate through real human interaction. |
| innovation-strategist | Victor | "Chess grandmaster -- bold declarations, strategic silences, devastatingly simple questions" | Markets reward genuine new value. Innovation without business model = theater. |
| storyteller | Sophia | "Bard weaving an epic tale -- flowery, whimsical, enrapturing" | Powerful narratives leverage timeless human truths. Find the authentic story. |
| presentation-master | Spike | "Creative director with sarcastic wit -- dramatic reveals, 'what if we tried THIS?!'" | Visual hierarchy tells story before words. Every slide earns its place. |

### Historical/Fictional CIS Personas

| Agent | Display Name | Communication Style |
|-------|-------------|---------------------|
| renaissance-polymath | Leonardo di ser Piero | "Here we observe the idea in its natural habitat... magnificent!" |
| surrealist-provocateur | Salvador Dali | "The drama! The tension! The RESOLUTION!" |
| lateral-thinker | Edward de Bono | "You stand at a crossroads. Choose wisely, adventurer!" |
| mythic-storyteller | Joseph Campbell | "I sense challenge and reward on the path ahead." |
| combinatorial-genius | Steve Jobs | "Insanely great, magical, revolutionary -- makes impossible seem inevitable." |

---

## Summary: What to Prioritize for BMAD-Swarm Integration

### Highest Value Content

1. **Brain Methods Library (61 techniques)** -- The complete categorized technique library with embedded facilitation prompts. This is the core content for the ideator agent.

2. **Anti-Bias Protocol** -- The domain rotation rules (every 10 ideas, orthogonal pivots, CoT enforcement, simulated temperature). This prevents the LLM's natural clustering tendency.

3. **100+ Ideas Discipline** -- The quantity-before-quality goal and the rules that keep the system in generative mode (don't offer organization, user must explicitly request it).

4. **Advanced Elicitation Interactive Loop** -- The choose/reshuffle/list-all/proceed pattern for method selection. Universal across all BMAD workflows.

5. **Party Mode Agent Selection** -- The relevance analysis and cross-talk rules that make multi-perspective deliberation work.

### Medium Value Content

6. **Progressive Flow** -- The divergent-to-convergent 4-phase journey design for systematic idea development.

7. **Scale-Adaptive Escalation** -- The signal-counting system for deciding when tasks need full planning vs quick execution.

8. **A/P/C Menu Pattern** -- The universal Advanced/Party/Continue menu that appears at every workflow step, allowing depth control.

9. **CIS Libraries** -- 25 storytelling frameworks, 31 design thinking methods, 31 innovation frameworks, 31 problem-solving methods. These are supplementary technique libraries.

10. **Agent Personas** -- The rich character definitions that make Party Mode engaging (communication styles, principles, identities).

### Patterns to Preserve

- **Micro-file architecture** -- each step is self-contained with embedded rules
- **Frontmatter state tracking** -- workflow progress persisted in document headers
- **Append-only document building** -- content built progressively through conversation
- **Facilitator role enforcement** -- "never generate content without user input"
- **Continuation detection** -- resume from where you left off
- **Context file injection** -- optional project context seeds the session
