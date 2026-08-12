# Changelog — proposed entry (D-035 review artifact)

> **DRAFT.** Written during the 2026-08-11 overnight-autonomous run (D-033). This is the proposed changelog entry for the reinvention; it lands in the real CHANGELOG.md with the approved build, not before. Everything below is contingent on morning ratification of the vision doc, D-036–D-041, and Forks A–D (`artifacts/planning/reinvention-vision-2026-08-11.md` §6–§9).

## [3.0.0-vision] — Unreleased / Proposed

The reinvention. bmad-swarm becomes a thin methodology layer on native Claude Code primitives whose differentiator is **outcome-linked decision memory**: every decision gets an ID, every recommendation is a pre-decision with evidence attached, every "done" claim is replayed deterministically before acceptance, every failure gets a fingerprint, and all of it compounds into cross-project memory. Major version because the coordination machinery, state model, enforcement posture, and several shipped commands change or disappear. Strategic basis: D-036 through D-041 (minted overnight under D-033 authority, queued for ratification), Forks A–D, and the integrated roadmap (vision doc §5).

### New — the moat capabilities

- **Unified record envelope (D-036).** One typed record system — D (decision), R (recommendation), L (lesson), C (claim), F (finding) — with one human-gated promotion state machine, one evidence-status vocabulary (`checked/cited/attested/assumed`), and a five-standing-file cap on `artifacts/context/` (`project-brain.md`, `decision-log.md`, `ledger.md`, `task-ledger.md`, `team-assembly-log.md`). `findings-register.md` merges into `ledger.md` as F-records.
- **Knowledge ledger with the 1-2-3 ladder.** Fingerprinted L-records: first occurrence is a lesson, second is a warning the system issues, third is structurally impossible — promotion (always human-gated) compiles lessons into enforcement tiers up to init-time scaffold rules ("born immune" projects). Cross-project records live in `~/.bmad/knowledge/`. First slice harvests the ten existing field projects.
- **Advisory layer (R-IDs).** Recommendations as pre-decisions: stakes-scored, evidence-priced, delivered through the priced router (silent / inline / pause), graduating to D-records when accepted, logged with mandatory re-open triggers when rejected.
- **Deterministic replay gate + C-IDs.** "Done" is accepted only after machinery re-executes the evidence: files stat'd, tests re-run with matching exit codes, citations resolved, fixture provenance declared (synthetic-only fixtures on an external-data path block). Tier-0 existence pre-pass. Claims (3–7 load-bearing per artifact) carry status and decay when underpinning files change. Enforcement-class honesty is a standing rule (D-039): only deterministic replay and PreToolUse denies are called enforcement; file-shape checks ship labeled advisory lint. *Blocking-hook trigger pending spike 1 (D-040); ships as a deterministic pre-review script under the other spike outcome.*
- **Project brain.** `artifacts/context/project-brain.md` — a ~2,500-token curated comprehension cache written on surprise/compaction/gate events, read at every warm boot, mechanically verified. Machine state (phase, gates) moves into its frontmatter (D-037). Success test: fresh-boot-beats-3×-compacted.
- **Priced decision router (D-038).** One routing function — stakes × human availability × complexity — covering the day-mode interruption tax, the overnight Night Ladder, and regime selection (solo / workflow / team: "the swarm that knows when not to swarm"). One Budget Governor, mode-parameterized: treasurer by day, scheduler by night; never a measured closed loop (limit telemetry does not exist). Constitutional floors (security, contradiction escalator, destructive axis) are invariant and unpriced.
- **`/sleep` — overnight autonomy (per D-034).** Fork it / default it / park it; destructive axis as the sole hard fence; morning report as a queue to clear; preflight canary; no-progress redirect; report-from-ledger crash resilience. *Hard-gated (D-041): ships only after Fork A permission narrowing, field-tested task ledger, and a live replay gate.*
- **Self-tuning methodology (human-gated).** Ledger data feeds proposed methodology adjustments (lens rosters, ceremony levels, rubric weights) as human-approved proposals — never learned autonomy; constitutional floors excluded from tuning by construction. Matures last, by design.

### Changed

- **Coordination replaced with native primitives (D-039 §3).** Hand-rolled coordination/liveness prose → native agent teams + a durable task ledger; identity ceremony → native agent definitions (and, per Fork D, a `--agent` orchestrator main session); prose team-shape rules → spawn allowlists + per-agent `permissionMode`; hand-rolled parallelism → `isolation: worktree`; ceremony-heavy deterministic dispatches → Workflow scripts (post-spike 3).
- **Machine-state home (D-037).** Phase/gate state moves to project-brain frontmatter; task lifecycle events to `task-ledger.md`; static init facts stay in `swarm.yaml`. Chore-maintained state files are dead as a pattern (project.yaml lied in 8 of 9 field projects).
- **Assembly gate honestly reframed (per Fork C).** A repo-file gate cannot bind the actor that writes the file; the assembly log becomes declared-intent lint and the entire blocking-enforcement budget moves to the replay gate.
- **Model tier policy (per Fork B, superseding D-027).** Proposed: default opus; fable for architect/strategist/security and complexity ≥ 12; sonnet for researcher/devops; visible per-project override.
- **Truth sweep + self-contained scaffolds.** All rosters, command counts, prices, write-policy statements, and entry-point vocabularies reconciled to single sources; the load-bearing methodology subset ships into generated projects (`.claude/bmad/`) so generated references resolve outside this repo — fixing the critical CB-1 class where `/brainstorm`, `/explore-idea`, and `/retrofit-team` dangled in every real user project.
- **Sharing model flipped (per ADR-F).** `swarm.yaml`, `CLAUDE.md`, and `artifacts/` become git-tracked; only session-local files stay ignored.

### Removed

- **The TeamCreate gate and vocabulary** — anchored to a tool no longer in Claude Code; re-anchored on the Agent-tool spawn path (WS-1).
- **The /identity ceremony** (per Fork D) — hooks, skill, and reminder machinery that simulated what a native `--agent` main session provides.
- **The facade ring** — `integrations/github.js`, methodology eject, `workspace` and `plugin` commands, and their ~275 lines of dead-code tests (run-reporter wired into the task ledger's session-end snapshot or deleted; no limbo).
- **project.yaml** (D-037) — a generated view may be emitted from brain frontmatter if tooling demands, never hand-maintained.
- **The orphaned methodology layer (~40%)** — whatever isn't worth shipping into scaffolds isn't worth keeping as product.

### Kept and extended (the field-proven core)

Adversarial review with retry budget 2 (gains the replay gate, fixture-provenance lens, and ledger-calibrated reviewers) · D-ID traceability (becomes the D-type of the envelope) · the shared `artifacts/context/` layer (becomes hot/cold two-tier with the five-file budget) · the complexity brain (becomes the router's input) · lessons-learned (becomes fingerprinted L-records) · the generator + eject/override model with marker/hash safety (becomes the compile target for promoted rules) · the single-wake-channel protocol (D-028, counterweighted with liveness, never reverted).

### Hard gates (D-041)

- npm publish only after the truth sweep and self-contained scaffolds land (WS-1 + WS-5 + WS-6) — publishing earlier re-ships brokenness under a fresh version number.
- `/sleep` only after Fork A + field-tested task ledger + live replay gate.
- No phase depends on an unverified primitive until its spike returns (D-040); D-002's TaskCompleted deletion is superseded only explicitly, after payload re-verification.
- Mission Control v1 is read-only; answers happen in the terminal.

### References

- Vision: `artifacts/planning/reinvention-vision-2026-08-11.md`
- Codebase audit: `artifacts/exploration/audit-2026-08-11-codebase.md`
- Decisions: D-033 through D-041 in `artifacts/context/decision-log.md`
- Forks A–D and the human-approval queue: vision doc §6, §8
