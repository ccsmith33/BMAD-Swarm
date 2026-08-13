# Team assembly — fable-support (2026-06-09)

```bmad-assembly
entry_point: small-feature
complexity: 7
autonomy: auto
team:
  - role: developer
    model: fable
  - role: reviewer
    lenses: [code-quality, test-coverage]
    model: opus
rationale: Design pre-resolved by orchestrator exploration (D-023); one developer for the cohesive change set, one adversarial reviewer with test-coverage lens. Developer runs on fable per the human's explicit request to exercise Fable 5.
```

# Team assembly — v3-coordination (2026-06-09)

```bmad-assembly
entry_point: small-feature
complexity: 9
autonomy: auto
team:
  - role: developer
    model: fable
  - role: reviewer
    lenses: [code-quality, test-coverage]
    model: fable
rationale: D-028 epic, design fully resolved in-session with human approval; one developer (shared files across all three items make parallel devs conflict-prone), one adversarial reviewer. Both on fable per D-027 (defaults.model: fable).
```

# Team assembly — v3-coordination-r2 (2026-06-09, resume after host restart)

```bmad-assembly
entry_point: small-feature
complexity: 9
autonomy: auto
team:
  - role: developer
    model: fable
  - role: reviewer
    lenses: [code-quality, test-coverage]
    model: fable
rationale: Resume of D-028 epic after host restart killed the first v3-coordination team mid-implementation (TDD-red state on disk, 29 failing tests). Same shape as the original assembly.
```

## 2026-08-11 — audit (full project analysis + upgrade roadmap)

```bmad-assembly
entry_point: audit
complexity: 12
autonomy: auto
team:
  - role: researcher
    domain: codebase-audit
    model: fable
  - role: researcher
    domain: ecosystem-capabilities
    model: fable
  - role: reviewer
    domain: hooks-gates
    lenses: [code-quality, security]
    model: fable
  - role: reviewer
    domain: cli-generators
    lenses: [code-quality, test-coverage]
    model: fable
  - role: security
    model: fable
  - role: devops
    model: fable
  - role: architect
    model: fable
  - role: strategist
    model: fable
rationale: Human requested FULL multi-angle audit of bmad-swarm itself with max team size, all agents on fable (D-027); audit trio expanded with second researcher, second reviewer, devops, plus architect+strategist synthesis wave.
```

## 2026-08-11 — audit (addition: field-usage researcher)

```bmad-assembly
entry_point: audit
complexity: 12
autonomy: auto
team:
  - role: researcher
    domain: field-usage
    model: fable
rationale: Human requested a researcher to audit local projects where bmad-swarm was actually used — real artifacts and scaffolds as field evidence for the upgrade analysis.
```

## 2026-08-11 — audit (addition: prompt-quality, cost-economics, runtime-resilience)

```bmad-assembly
entry_point: audit
complexity: 12
autonomy: auto
team:
  - role: reviewer
    domain: agent-prompts
    lenses: [docs, code-quality]
    model: fable
  - role: researcher
    domain: cost-economics
    model: fable
  - role: reviewer
    domain: runtime-resilience
    lenses: [code-quality]
    model: fable
rationale: Coverage-gap additions to the full audit — role identities reviewed as prompts, token-economics of orchestration overhead, and coordination-protocol failure modes (compaction, dead teammates, stale state).
```

## 2026-08-11 — audit (wave 2: synthesis)

```bmad-assembly
entry_point: audit
complexity: 13
autonomy: auto
team:
  - role: architect
    domain: upgrade-design
    model: fable
  - role: strategist
    domain: roadmap
    model: fable
rationale: All 10 wave-1 audit reports are in; architect converts findings into concrete upgrade proposals with options, strategist produces the prioritized/sequenced roadmap. Both on fable (deep-reasoning synthesis, D-027).
```

## 2026-08-11 — explore-idea (divergence wave: what makes swarm special)

```bmad-assembly
entry_point: explore-idea
complexity: 13
autonomy: auto
team:
  - role: ideator
    domain: advisory-layer
    model: fable
  - role: ideator
    domain: knowledge-moat
    model: fable
  - role: ideator
    domain: verification-product
    model: fable
  - role: ideator
    domain: novel-unlocks
    model: fable
  - role: researcher
    domain: competitive-grounding
    model: fable
rationale: Generative divergence wave to define swarm's net-new differentiators post-reinvention; four ideators on distinct non-converging lenses + one researcher grounding against competitors. Human wants swarm to be genuinely special; adaptive per-recommendation advisory + self-tuning methodology are anchor ideas. Critic+strategist synthesis follows.
```

## 2026-08-11 — explore-idea (addition: continuity / project-brain lens)

```bmad-assembly
entry_point: explore-idea
complexity: 13
autonomy: auto
team:
  - role: ideator
    domain: continuity-project-brain
    model: fable
rationale: Human surfaced the core continuity pain — compaction degrades project comprehension but fresh-start has zero context, so a degraded-warm Claude beats a sharp-cold one. Dedicated ideator to design a durable curated project-brain so fresh-rehydrate beats compacted-warm; intra-project scope, complements the cross-project knowledge-moat lens.
```

## 2026-08-11 — explore-idea (addition: overnight / sleep-mode lens)

```bmad-assembly
entry_point: explore-idea
complexity: 13
autonomy: auto
team:
  - role: ideator
    domain: overnight-sleep-mode
    model: fable
rationale: Human wants a /sleep overnight-autonomous mode — re-priced interruption tax (don't block hours of work for a decision that could be spiked-both/deferred), plus self-directed initiative when the queue drains, under constitutional guardrails (charter, never-merge, budget cap, review gate). Capstone that exercises every subsystem from the wave.
```

## 2026-08-11 — audit (closing pipeline: critic → synthesis → ADRs → doc drafts)

```bmad-assembly
entry_point: audit
complexity: 13
autonomy: auto
team:
  - role: reviewer
    domain: idea-critique
    lenses: [code-quality, feasibility]
    model: fable
  - role: strategist
    domain: reinvention-vision
    model: fable
  - role: architect
    domain: adrs-and-forks
    model: fable
  - role: developer
    domain: doc-drafts
    model: fable
rationale: Overnight-autonomous closing pipeline (D-033). Adversarial critic culls the 8 divergence docs; strategist synthesizes the master reinvention vision+roadmap from survivors; architect drafts the 4 forks + 7 proposed ADRs (awaiting approval); developer drafts proposed README+CHANGELOG as review artifacts. Serial dependency: critic → strategist → (architect ∥ developer).
```

## 2026-08-11 — audit (final parallel wave: ADRs, doc drafts, knowledge harvest)

```bmad-assembly
entry_point: audit
complexity: 12
autonomy: auto
team:
  - role: architect
    domain: adrs-and-forks
    model: fable
  - role: developer
    domain: doc-drafts
    model: fable
  - role: researcher
    domain: knowledge-harvest
    model: fable
rationale: Overnight closing wave off the ratified-pending vision (D-033). Architect drafts proposed ADRs + answer-ready fork sheet (awaiting approval); developer drafts proposed README+CHANGELOG (review artifacts, not live overwrite, D-035); researcher runs the day-one knowledge harvest over the 10 field projects to seed L-records and prove the fixture-fingerprint moat. All non-destructive, all reversible.
```

## 2026-08-11 — bug-fix (Honest Foundation P0: feasibility spikes)

```bmad-assembly
entry_point: bug-fix
complexity: 9
autonomy: auto
team:
  - role: developer
    domain: feasibility-spikes
    model: fable
rationale: Post-ratification (D-042). One developer runs the 4 unverified-primitive spikes (blocking TaskCompleted exit-2, PreCompact steering, Workflow contract, --agent main session) as zero-risk investigations on branch reinvention/honest-foundation before any repair depends on them (D-040).
```

## 2026-08-12 — small-feature (Honest Foundation P0 repair epic)

```bmad-assembly
entry_point: small-feature
complexity: 11
autonomy: auto
team:
  - role: developer
    domain: gate-and-cli
    model: fable
  - role: developer
    domain: truth-and-build
    model: fable
  - role: devops
    domain: ci-and-packaging
    model: fable
  - role: reviewer
    domain: honest-foundation
    lenses: [code-quality, security, test-coverage]
    model: fable
rationale: Spikes all green (artifacts/exploration/spikes-2026-08-11.md). Repair epic on branch reinvention/honest-foundation — fix the dead gate (Fork C advisory reframe, ADR-015), 3 blocking CLI bugs, npm test/engines, cost-estimator truth, phantom-role/prompt drift, CI + packaging. Two devs on disjoint source files (single .claude regen after), devops on .github+packaging, reviewer adversarial pass. Non-destructive: branch only, no merge/push.
```

## 2026-08-12 — review (Honest Foundation P0 adversarial pass)

```bmad-assembly
entry_point: audit
complexity: 9
autonomy: auto
team:
  - role: reviewer
    domain: honest-foundation
    lenses: [code-quality, security, test-coverage]
    model: fable
rationale: Both devs + devops done, branch reinvention/honest-foundation at 443/443. Adversarial review against P0 exit criteria before the branch is considered trustworthy; note WS-6/live-regen as known-deferred, not P0 failures.
```

## 2026-08-12 — review (Honest Foundation P0 — re-run on sonnet to conserve usage)

```bmad-assembly
entry_point: audit
complexity: 9
autonomy: auto
team:
  - role: reviewer
    domain: honest-foundation
    lenses: [code-quality, security, test-coverage]
    model: sonnet
rationale: Prior fable reviewer died on the human's usage limit (live proof of the economics finding / Fork B). Re-run on sonnet to conserve usage; reviewer is a token-heavy role that should not be on fable. Branch at 443/443.
```

## 2026-08-12 — small-feature (Phase 1: truth-sweep + self-contained scaffolds — design)

```bmad-assembly
entry_point: small-feature
complexity: 12
autonomy: auto
team:
  - role: architect
    domain: truth-and-self-containment
    model: fable
rationale: Phase 1 reinvention (WS-5 single-source-of-truth + WS-6 self-contained scaffolds, unblocks publish + fixes CB-1/CB-3/F-023). Architect (fable per tier mix) designs the load-bearing-methodology set, shipped-path model, and schema single-sourcing before devs implement. Tier mix (D-048) now active.
```

## 2026-08-12 — small-feature (Phase 1 implementation: WS-5 + WS-6)

```bmad-assembly
entry_point: small-feature
complexity: 12
autonomy: auto
team:
  - role: developer
    domain: truth-schema-ws5
    model: opus
  - role: developer
    domain: self-containment-ws6
    model: opus
  - role: reviewer
    domain: phase1
    lenses: [code-quality, test-coverage, data]
    model: opus
rationale: Implement architect's Phase 1 design (phase1-truth-self-containment-2026-08-12.md) on 2 disjoint tracks per its §6 breakdown; devs on opus per tier mix (D-048); reviewer held until both land. Branch reinvention/phase1-truth-self-containment.
```

## 2026-08-12 — review (Phase 1 WS-5+WS-6 adversarial pass)

```bmad-assembly
entry_point: audit
complexity: 10
autonomy: auto
team:
  - role: reviewer
    domain: phase1
    lenses: [code-quality, test-coverage, data]
    model: opus
rationale: Both Phase 1 tracks landed; combined tree 470/470 + validate 109/0. Adversarial review before merge — scrutinize the AC-regex widening (gate-weakening?), gitignore v2 REPLACE (data-loss?), CB-1 references-resolve soundness, and that deletions removed nothing load-bearing. Reviewer on opus per tier mix.
```

## 2026-08-13 — small-feature (Phase 2: enforcement + resilience — design)

```bmad-assembly
entry_point: small-feature
complexity: 13
autonomy: auto
team:
  - role: architect
    domain: phase2-enforcement-resilience
    model: fable
rationale: Phase 2 of the reinvention (forks ratified D-042, spikes green). Architect (fable per tier mix) decomposes the phase — unified record ledger (D-036/ADR-021), replay gate (ADR-022, TaskCompleted exit-2 spike-verified), liveness+task-ledger (ADR-018), project brain, Fork A permission narrowing (ADR-017) — into implementable tracks and recommends the first sub-epic. Design before devs, per the Phase 1 pattern that worked.
```

## 2026-08-13 — bug-fix (Phase 2 SE-1 prep: split inline hook sources)

```bmad-assembly
entry_point: bug-fix
complexity: 7
autonomy: auto
team:
  - role: developer
    domain: hooks-source-split
    model: opus
rationale: Prep refactor before SE-1's 3 parallel tracks — split generators/hooks-generator.js inline hook sources into per-file generators/hooks/<name>.cjs.src with a byte-identity test, so T1/T2/T3 own disjoint hook files with no collision. Pure refactor, zero behavior change.
```

## 2026-08-13 — bug-fix (Phase 2 SE-1 / T1: Fork A permission narrowing)

```bmad-assembly
entry_point: bug-fix
complexity: 10
autonomy: auto
team:
  - role: developer
    domain: fork-a-permission-narrowing
    model: opus
rationale: SE-1 track T1 (sequential, on committed prep base). Implement ADR-017 + pinned-script amendment (D-049): narrow orchestrator shell, extend write-gate to Bash/NotebookEdit, path normalization (F-017), settings.local.json out of writable set. Security-critical — fable security-lens review follows. Opus per tier mix.
```

## 2026-08-13 — bug-fix (Phase 2 SE-1 / T2: unified record ledger)

```bmad-assembly
entry_point: bug-fix
complexity: 11
autonomy: auto
team:
  - role: developer
    domain: record-ledger
    model: opus
rationale: SE-1 track T2 (sequential, on committed T1 base). Unified record envelope (D-036/ADR-021) + serialized record.cjs pinned helper (the one T1 just allow-listed) + ledger-write-guard hook (RES-6 fix) + findings-register/lessons migration to ledger.md. Opus per tier mix.
```

## 2026-08-13 — bug-fix (Phase 2 SE-1 / T3: replay gate)

```bmad-assembly
entry_point: bug-fix
complexity: 11
autonomy: auto
team:
  - role: developer
    domain: replay-gate
    model: opus
rationale: SE-1 track T3 (sequential, on committed T2 base). Blocking TaskCompleted exit-2 replay gate (ADR-022, spike-verified) — deterministic evidence-bundle re-run before task completion; appends rejection F-records via T2's record.cjs; Tier-0 engine utils/evidence.js + replay-check degradation script + gated classes story/bug-fix/review (D-049). Supersede D-002. Opus per tier mix.
```

## 2026-08-13 — audit (Phase 2 SE-1 adversarial review — security-critical)

```bmad-assembly
entry_point: audit
complexity: 12
autonomy: auto
team:
  - role: security
    model: fable
  - role: reviewer
    domain: se1
    lenses: [code-quality, security, test-coverage]
    model: fable
rationale: SE-1 (T1 Fork A + T2 ledger + T3 replay gate) all committed on branch. Security-critical slice (permission boundary + enforcement) gets fable adversarial review + a dedicated security teammate — try to bypass the narrowed write-gate, game the replay evidence, and race the ledger. Fable per tier mix (security-critical).
```
