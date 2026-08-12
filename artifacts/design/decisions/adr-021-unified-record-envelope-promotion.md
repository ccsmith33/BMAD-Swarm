# ADR-021: The unified record envelope and the human-gated promotion state machine

**D-ID:** implements D-036 (primary), D-039; binds every subsystem in vision §4 before its first record write
**Status:** PROPOSED — AWAITING HUMAN APPROVAL (D-033)
**Date:** 2026-08-11
**Supersedes:** the five divergent record schemas from the 2026-08-11 divergence wave (advisory R-ID ledger schema, knowledge L-record schema, verification C-ID and failure-class schemas as standalone shapes); the separate `advisory-ledger.md` file proposal; the free-text `lessons-learned.md` format as an eviction target
**Vision mapping:** vision §2.5–§2.6 (the D-036 full record)

## Context

The divergence wave independently minted four record species across five schemas; the critique (§1.2, blocking) found the verification doc's failure-class record is the knowledge doc's L-record reinvented with renamed fields, and warned that `artifacts/context/` is heading toward the aspirational-taxonomy sprawl the field audit documented (real runs populate 2–4 of 6 dirs). Three ideators independently designing the same promotion ladder is the strongest signal in the wave — it must be built once, as one ledger, decided before any subsystem writes its first record.

## Decision

1. **One envelope, five types** (D | R | L | C | F):

```yaml
record:
  id: <TYPE>-<n>
  type: decision | recommendation | lesson | claim | finding
  status: <per-type vocabulary below>
  fingerprint: <slug>          # REQUIRED for L and F; optional elsewhere
  provenance: {role, project, date, occurrences: [{project, date, ref, d_ids}]}
  evidence: []                 # PCA evidence-item schema; items carry the C-status vocabulary
  links: {d_ids: [], supersedes: , reopen_trigger: }   # reopen_trigger required on rejected R
  body: <abstract statement / rationale / detection heuristic>
```

2. **Per-type status vocabularies, one promotion state machine:**
   - **D:** proposed → accepted → verified | superseded (unchanged — field-proven).
   - **R:** open → accepted (graduates to a D-record, `source: swarm-advisory, ref: R-x`) | rejected (+ mandatory re-open trigger → reopened). Rejections are decisions too.
   - **L:** observed → recurring (auto-flagged on second same-fingerprint occurrence, different project) → candidate (promotion proposal with retro-catch evidence scoring) → **promoted (HUMAN GATE — non-negotiable)** → retired (zero-hit demotion). Promotion names its enforcement tier — advisory citation → reviewer lens → structural check → generative/scaffold — and the human can downgrade the tier. The verification failure-class schema is merged in: one species, fingerprint-keyed.
   - **C:** not on the ladder — claims decay, they don't promote. `checked / cited / attested / assumed` is the single evidence-status vocabulary everywhere; `checked` records its commit; underpinning-file changes flag staleness. Budget: 3–7 load-bearing claims per artifact.
   - **F:** the instance; L is the class. `fingerprint:` on F makes rollup mechanical: two F-records sharing a fingerprint auto-propose the L-record occurrence append.
3. **Brain-eviction handoff:** eviction from the project brain mints or appends a **fingerprinted** L-record; a new fingerprint enters at `observed` (nothing skips the recurrence test); an existing one appends an occurrence. Free-text lessons are no longer a valid eviction target.
4. **File budget — exactly five standing files in `artifacts/context/`:** `project-brain.md`, `decision-log.md`, `ledger.md` (the unified R/L/C/F ledger), `task-ledger.md`, `team-assembly-log.md` (disposition per Fork C). `findings-register.md` merges into `ledger.md` as F-records during the Phase 1 truth-sweep (after the renumbering pass). Per-date operational files live in `artifacts/delivery/`; cross-project records live in `~/.bmad/knowledge/`. Any sixth standing file must supersede D-036 first.

## Alternatives considered

- **Per-subsystem schemas with a mapping layer.** Rejected: the mapping layer IS the drift; the wave already produced one subsystem designed twice under different names.
- **Force C-records onto the promotion ladder for uniformity.** Rejected per the critique: claims are a different animal (decay semantics); uniformity of *envelope*, not of *lifecycle*.
- **Database or embeddings for the ledger.** Rejected (knowledge kill #6): plain files + git — memory you can `cat`; the ledger's diff history is part of the product.
- **Brain eviction entering at `candidate`** (the critique's initial suggestion). Rejected in the vision: entry at `observed` keeps the 1-2-3 ladder honest.

## Consequences

- Every moat feature (advisory R-IDs, knowledge L-records, verification C-IDs, F-rollup) writes into one structure with one state machine — the three-way convergence is cashed once.
- `lessons-learned.md` and `findings-register.md` have an explicit migration destiny; `artifacts/context/` sprawl is capped by decision, not hope.
- The human gate on L-promotion is the constitutional line against learned autonomy (excluded from self-tuning by construction, vision §4.6).
- Phase 1 lands the envelope structurally (normalized decision log, `ledger.md` created, F-merge); Phase 4 lights up the flows.
