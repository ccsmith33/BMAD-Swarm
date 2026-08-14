# Quality Standards

Quality gates are mandatory for all artifacts. Self-validate before reporting done.

## Test Requirements

{{#if methodology.quality.require_tests}}- All code must have tests. No exceptions.
- Tests must pass before any code is considered complete.
- New features require unit tests at minimum. Integration tests for cross-module work.
{{/if}}{{#unless methodology.quality.require_tests}}- Tests are recommended but not required for this project.
{{/unless}}

## Review Requirements

{{#if methodology.quality.require_review}}Review is **proportional, not mandatory-everything**. A reversible low-density change gets a glance; an irreversible, high-density, or security-touching change gets the full treatment. Verification depth scales with risk — it is never fragmented away, and it is never uniformly imposed regardless of risk.

The review **tier** is the Layer-3 verification score (constraint density × blast radius × reversibility × verifiability × ambiguity, 5–15) — one rubric, two consumers: it sizes production nowhere and sizes the *review gate* here.

| Tier | Score | Applies to | Verification |
|---|---|---|---|
| **T0 — self-verify** | 5–6, all factors reversible/loud | docs, comments, config values, single-file trivial fixes on a branch | tests pass + producer self-check against acceptance criteria; one-line ledger note; NO reviewer spawn |
| **T1 — light review** | 6–7 | small reversible changes, low constraint density | one reviewer, `code-quality` lens only, briefed with the DIFF (never the whole artifact) |
| **T2 — full adversarial review** | 8–11 (default for multi-file features, contract/data-model changes) | correctness, security, architecture compliance, test coverage; blocking findings resolved before proceeding | adversarial review; advisory findings logged and addressed when practical |
| **T3 — heavy verification** | 12–15, or any irreversible/silent-error surface | security boundaries, migrations, public APIs, releases, data-loss paths | adversarial review + security lens/agent + replay-gate evidence + human gate on the irreversible step |

### Constitutional floors (tiering can only move UP, never below these)

- **Security-touching changes** (the `auth`/`crypto`/`secret` signal row) never below **T2**, with the security lens — regardless of size.
- **Irreversible / world-facing actions** are always **human-gated** (the park-the-one-way-door rule, restated at the gate).
- **Replay-gated classes** (story / bug-fix / review-verdict) stay gated at **every** tier — deterministic replay is CHEAP verification. Tiering sizes the *agentic* review spend; it never turns off deterministic evidence.
- **Tests are always required.** "All code must have tests" stays — tests are cheap verification and were never the measured tax. What tiers is the *reviewer-spawn* mandate, not the test mandate.

> **Honesty — which floors actually bind (A3).** Two of these floors have independent HOOK enforcement and hold even if the orchestrator mis-tiers: **irreversible → human-gated** (the night-floor / park-the-one-way-door) and **replay-gated classes** (the TaskCompleted replay gate). The other two are **DOCTRINE-ONLY** — prompt-level, no hook backstop: **security-never-below-T2** binds only when the orchestrator *recognizes* the `auth`/`crypto`/`secret` signal, so a missed signal under-tiers **silently** (the signal→lens detection is its only, advisory, backstop), and **tests-always** is rules text. Treat the two doctrine floors as discipline you can violate by inattention, not as guarantees the harness enforces.

**One-shot caveat:** one-shot production means bigger diffs per review. Review cost scales sublinearly with diff size while review COUNT drops linearly — so tiering + one-shot is a net win, but a reviewer of one-shot output must be briefed with the **full diff and the acceptance criteria**, never a bare file path.
{{/if}}{{#unless methodology.quality.require_review}}- Code review is recommended but not required for this project.
{{/unless}}

## Human Approval

Human approval is required for: {{methodology.quality.require_human_approval_list}}

These artifacts must be presented to the human and explicitly approved before downstream work begins.

## Phase Quality Gates

Each phase must satisfy its quality gate before the next phase begins:

- **Exploration**: Research findings documented, feasibility assessed, risks identified
- **Definition**: PRD complete with numbered requirements, acceptance criteria for each requirement, stakeholder approval
- **Design**: Architecture document complete, ADRs for key decisions, component interfaces defined
- **Implementation**: All stories implemented, tests passing, code reviewed and approved
- **Delivery**: Final validation complete, documentation updated, handoff artifacts produced

## Artifact Quality Criteria

- **Product Brief**: Clear problem statement, target users identified, success metrics defined, decisions logged with D-IDs
- **PRD**: Numbered functional and non-functional requirements, acceptance criteria, references to D-IDs from product brief
- **Architecture**: System diagram, component breakdown, technology choices justified with ADRs, references to D-IDs
- **Stories**: Acceptance criteria, dev notes with file paths, estimated scope, references to D-IDs from architecture
- **Code**: Tests passing, review approved, follows project coding standards, implements story acceptance criteria exactly
