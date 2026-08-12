# ADR-019: Self-contained scaffolds — ship the load-bearing methodology subset into `.claude/bmad/`

**D-ID:** implements D-039 (kept/deleted table), D-041 (Phase 1; publish hard-gated on this + WS-1 + WS-5)
**Status:** PROPOSED — AWAITING HUMAN APPROVAL (D-033)
**Date:** 2026-08-11
**Supersedes:** the implicit package-vs-project path model (generated files referencing `methodology/*.md` and `agents/*.md` in the development repo)
**Vision mapping:** ADR-E of `artifacts/planning/reinvention-vision-2026-08-11.md` §8

## Context

Generated agents and commands instruct Claude to read `methodology/*.md` and `agents/*.md` — paths that exist only in this development repo. In every real consumer project, `/brainstorm`, `/explore-idea`, `/retrofit-team`, and every deep methodology reference silently dangle (CB-1, critical; confirmed across all ten field installs). This single finding decides whether the product works anywhere but here. Meanwhile ~40% of `methodology/` is orphaned — referenced by nothing that executes (AP-9).

## Decision

Per WS-6 Option 1, scoped to the load-bearing subset:

1. **`bmad-swarm init`/`update` copy the load-bearing methodology subset into the project at `.claude/bmad/`** — at minimum decision-classification, brainstorming-techniques, artifact-schemas, testing-knowledge, as pruned by the WS-5 sweep — and every generated reference is rewritten to the in-project path. Shipped files carry the `bmad-generated` marker so `update` manages them under the existing marker/hash safety model.
2. **The kill test is symmetrical:** whatever isn't worth shipping into scaffolds isn't worth keeping as product. The orphaned ~40% is deleted or demoted to repo-internal docs during WS-5 (feeds ADR-020's kill list).
3. **A path-resolution test locks it in:** generate a project into a temp dir and assert every path referenced inside generated `.md` files resolves. This test is a permanent CI gate (WS-10).
4. **Lazy-loading economics are preserved:** references stay lazy (read-on-need), only their targets move into the project. Identity files do not re-inflate.
5. This is a promoted-rule compile target: the "born immune" mechanism (vision §4.2) writes ledger-promoted rules into these shipped files at init.

## Alternatives considered

- **Option 2 — inline the needed content into generated agents/commands.** Rejected: re-inflates identity files (economics wants them thinner, and byte-stable for prefix caching), and loses the eject/customize story for methodology.
- **Publish `methodology/` as a separate npm asset resolved at runtime.** Rejected: adds a resolution mechanism and a failure mode for content that is small enough to ship; violates the two-dependency footprint.
- **Status quo (dangling references).** Not an option: the field evidence is that the product's brain is unreachable in every real install.

## Consequences

- ~25 files added to every scaffold; `update` must manage them (marker model already does).
- npm publish is unblocked (with WS-1 + WS-5) — the D-041 hard gate; publishing before this lands would re-ship brokenness with a fresh version number.
- The WS-5 single-source sweep must precede the copy so the shipped subset is the reconciled truth, not the current contradictions.
- Consumer projects gain a visible `.claude/bmad/` directory; README documents it as generated-and-managed (ride D-035).
