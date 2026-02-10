# Orchestrator Methodology Reference

This rule provides the complexity scoring matrix, team composition table, phase skip rules, and autonomy override rules that the orchestrator uses for assessment.

## Complexity Scoring

| Factor | 1 (Low) | 2 (Medium) | 3 (High) |
|--------|---------|------------|----------|
| **Scope** | Single file/function fix | Multi-file feature | Cross-cutting system change |
| **Clarity** | Exact requirements given | Requirements need refinement | Vague or exploratory |
| **Technical Risk** | Known patterns, proven approach | Some unknowns, standard tech | New technology or architecture |
| **Codebase** | Greenfield or isolated change | Moderate integration needed | Deep integration with existing systems |
| **Dependencies** | No external deps or APIs | Some integration points | Multiple external systems |

**Total score range**: 5 (trivial) to 15 (maximum complexity)

## Team Composition by Complexity

| Score | Classification | Team | Phases |
|-------|---------------|------|--------|
| 5-7 | Minimal | developer (+ reviewer if review required) | Implementation only |
| 8-10 | Standard | strategist + architect + developer + reviewer | Design to Implementation |
| 11-15 | Full | All available agents | Full lifecycle |

## Phase Skip Rules

| Entry Point | Skip Phases | Required Agents |
|-------------|-------------|-----------------|
| bug-fix | Exploration, Definition, Design | developer, reviewer |
| small-feature (score 7 or less) | Exploration, Definition | architect, developer, reviewer |
| brainstorm | Definition, Design, Implementation, Delivery | ideator (Mode A) |
| explore-idea | Definition, Design, Implementation, Delivery | ideator, researcher (Mode B) |
| debug | Exploration, Definition, Design, Delivery | developer, reviewer |
| migrate | Exploration, Definition | architect, developer, reviewer |
| audit | Definition, Design, Implementation, Delivery | researcher, reviewer |
| maintain | Exploration, Definition, Design, Delivery | developer, reviewer |

## Autonomy Override Rules

Configured autonomy: **{{methodology.autonomy}}**

| Configured Level | Override To | When |
|-------------------|------------|------|
| auto | guided | Complexity score 12 or higher AND project is not greenfield |
| auto | collaborative | Human explicitly asks to be involved in decisions |
| collaborative | guided | Complexity score 7 or less (low complexity does not warrant frequent check-ins) |
| Any | auto | Entry point is bug-fix or maintain with score 7 or less |

## MANDATORY Entry Point Routing

Assess the human's request, then follow the matching rule EXACTLY.

### brainstorm

WHEN the user says "brainstorm", "help me think about", or "I have a vague idea":
1. Use TeamCreate to create a team
2. Spawn an ideator teammate
3. Create tasks for Ideation phase ONLY (Mode A: interactive brainstorming)
4. Do NOT enter Definition, Design, Implementation, or Delivery phases

### explore-idea

WHEN the user says "explore this idea", "research whether", or "is this feasible":
1. Use TeamCreate to create a team
2. Spawn an ideator teammate AND a researcher teammate in parallel
3. Create tasks for Ideation phase ONLY (Mode B: ideator + researcher)
4. Do NOT enter Definition, Design, Implementation, or Delivery phases

### bug-fix

WHEN the user says "fix this bug" or describes a specific bug:
1. Score complexity (typically 5-7)
2. Use TeamCreate to create a team
3. Spawn a developer teammate and a reviewer teammate
4. Create tasks for Implementation phase ONLY
5. Do NOT enter Exploration, Definition, or Design phases

### small-feature

WHEN the user requests a feature AND complexity scores 7 or less:
1. Use TeamCreate to create a team
2. Spawn an architect teammate, a developer teammate, and a reviewer teammate
3. Create tasks for Design and Implementation phases
4. Do NOT enter Exploration or Definition phases

### debug

WHEN the user says "debug this" or needs diagnostic investigation:
1. Use TeamCreate to create a team
2. Spawn a developer teammate and a reviewer teammate
3. Create tasks for Implementation phase ONLY
4. Do NOT enter Exploration, Definition, Design, or Delivery phases

### migrate

WHEN the user says "migrate from" or "upgrade to":
1. Use TeamCreate to create a team
2. Spawn an architect teammate, a developer teammate, and a reviewer teammate
3. Create tasks for Design and Implementation phases
4. Do NOT enter Exploration or Definition phases

### audit

WHEN the user says "audit", "review", or "security review":
1. Use TeamCreate to create a team
2. Spawn a researcher teammate and a reviewer teammate
3. Create tasks for Exploration phase ONLY
4. Do NOT enter Definition, Design, Implementation, or Delivery phases

### maintain

WHEN the user says "update dependencies", "improve test coverage", or similar maintenance:
1. Use TeamCreate to create a team
2. Spawn a developer teammate and a reviewer teammate
3. Create tasks for Implementation phase ONLY
4. Do NOT enter Exploration, Definition, Design, or Delivery phases

### Full lifecycle (default)

WHEN the request does not match any specific entry point above:
1. Score complexity
2. Determine appropriate phases based on complexity score and Team Composition table
3. Use TeamCreate to create a team with the agents required for those phases
4. Create the full task graph covering all applicable phases

## Orchestration Modes

- **Interactive** (complexity 5-7, or conversational phases): Single agent works directly with the human. No task graph. Use for brainstorming, requirement clarification, design decisions.
- **Parallel** (complexity 5-7 for implementation-only, or implementation phase of any project): Build task graph, spawn team, coordinate through artifacts. Use when stories exist and acceptance criteria are clear.
- **Hybrid** (complexity 8+, or multi-phase projects): Start interactive for planning phases, transition to parallel for implementation.

## Multi-Perspective Review

For complexity score 11 or higher, critical artifacts receive parallel review:
- Architecture documents get security-focused review by the reviewer agent
- PRDs get feasibility check by the researcher agent
- Add these as parallel tasks alongside the primary quality gate

## Handling Rejections

When a reviewer sends a rejection:
1. Parse the reason, required changes, and severity
2. Blocking: Create a follow-up fix task for the original agent (max 2 retries per story)
3. Advisory: Log the suggestion, continue unless the developer is idle
4. After 3 rejections: Escalate to the human with a summary
