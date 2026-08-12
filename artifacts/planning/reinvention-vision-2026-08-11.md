# Reinvention Vision — bmad-swarm (2026-08-11)

- **Author:** strategist (master synthesis)
- **Date:** 2026-08-11 · Overnight-autonomous run per D-033
- **Inputs:** `artifacts/reviews/diverge-2026-08-11-critique.md` (governing), `artifacts/design/audit-2026-08-11-upgrade-design.md`, `artifacts/planning/audit-2026-08-11-roadmap.md`, the seven divergence docs (`artifacts/exploration/diverge-2026-08-11-*.md`), decision-log D-033/D-034/D-035.
- **Status:** DRAFT — this is the document the human wakes up to. It mints six strategic decisions (D-036–D-041, §9) under overnight authority; all six are queued for morning ratification alongside Forks A–D. No source code was touched (D-033: implementation is parked).

---

## 1. Product thesis

bmad-swarm becomes a **thin methodology layer on native Claude Code primitives whose differentiator is outcome-linked decision memory**. Every significant decision gets an ID; every recommendation is a decision-in-waiting with evidence attached; every "done" claim is accepted only after a deterministic gate replays its evidence; every failure gets a fingerprint; and all of it compounds into cross-project memory that grounds the system's proactive advice in its own tracked track record. The competitive scan confirms this exact loop — decisions → verification outcomes → cross-project memory → evidence-cited pushback — is white space nobody owns: Devin has memory without decisions, Spec Kit has traceable chains without decisions, CodeRabbit has verification without a lifecycle, and the academic proactivity framework has no implementation. Every competitor holds at most one link of the chain; bmad-swarm already produces the raw material for all four. The pitch a stranger can repeat: *"It remembers what it decided, proves what it finished, learns from what failed, and argues from its own receipts — and it does this on stock Claude Code, not a parallel runtime."*

What it stops being: a heavyweight ceremony layer with hand-rolled coordination machinery, gates that never fire, and prose presented as enforcement. The reinvention deletes the dead verb layer, replaces hand-rolled mechanics with native primitives, and concentrates all product identity in the methodology + memory + verification stack that the field record proves works.

---

## 2. Architecture — two mechanisms, a substrate, a cache

Per the critique's validated formulation (adopted as D-039): the system is **TWO unified mechanisms plus a substrate plus a cache**. Not one mechanism (marketing the architecture can't cash), not four unrelated features (wasting the wave's real three-way convergence).

### 2.1 Mechanism 1 — the record-promotion ledger (the moat)

**What it is.** One typed record system with one human-gated promotion state machine. Three ideators independently designed this mechanism (knowledge L-records, advisory R-IDs, verification failure-classes) — the strongest signal in the wave. It is built ONCE, as one ledger with one envelope (§2.5), never as parallel subsystems.

**What it delivers (flagship ideas):**
- **L-records + the 1-2-3 ladder** (knowledge doc §1–4): first occurrence of a failure class is a lesson; second is a warning the system issues; third is structurally impossible. Fingerprints are the recurrence key; promotion compiles lessons into enforcement (advisory citation → reviewer lens → structural check → scaffold change), human-gated at every promotion, with retro-catch evidence scoring (knowledge §7.3) as the promotion-proposal format and zero-hit retirement as the anti-ossification valve.
- **R-IDs — recommendations as pre-decisions** (advisory doc): stakes-scored, evidence-priced proposals that graduate into D-IDs when accepted, or are logged as rejections with explicit re-open triggers. One-pitch rule, single voice (orchestrator as editor), disagree-and-commit.
- **C-IDs + claim decay** (verification §2): 3–7 load-bearing claims per artifact, each `checked/cited/attested/assumed`, with staleness flagged when underpinning files change. The honest `assumed` is the feature.
- **F-records** (findings): instance records gaining a `fingerprint:` field so instance→class rollup to L-records is mechanical.

**What it rides on (native primitives):** plain files + git (no database, no embeddings — memory you can `cat`); per-agent `memory:` as private craft notes only ("habits in memory, scars in the ledger"); the `bmad init`/`update` generator as the compile target for promoted rules ("born immune" scaffolds); the user ring at `~/.bmad/knowledge/` for cross-project records.

### 2.2 Mechanism 2 — the priced decision router (the economics)

**What it is.** ONE decision-routing function — not three subsystems. The critique confirmed by inspection (§1.4) that the advisory layer's interruption tax and the overnight Night Ladder are the same mechanism with a different price of a pause, and the regime router is the same stakes-read applied to execution shape. Ruled here (D-038): one routing function, inputs = stakes signals (reversibility, blast radius, security/legal/data, cost delta, contradiction weight, available evidence) × **human availability** (present / async / asleep) × complexity score. Outputs:

| Output dimension | Human present (day) | Human asleep (night) |
|---|---|---|
| Interaction mode | silent-proceed · inline-note · pause-and-ask | default-it (Rung 2) · fork-it (Rung 1) · park-and-route-around (Rung 3) |
| Execution regime | solo · workflow · team (complexity-scored) | same, biased toward workflow for queue implementation; agentic exploration explicitly supported |

One table with a mode column — two tables that must stay in lockstep would drift. **Constitutional floors are invariant across all modes and are never priced:** the security floor, the contradiction escalator (crossing an accepted D-ID or explicit human statement is never silent), and at night the destructive-action floor per D-034. Floors park items; they never stall the run, and they can never be defaulted through.

**What it delivers:** the advisory delivery-mode model; the Night Ladder (the core of /sleep); the regime router ("the swarm that knows when not to swarm" — the answer to the 3×-overhead-on-one-line-fixes field pain); and the **Budget Governor as one mode-parameterized subsystem, not two** — treasurer by day (estimate-based planning against subscription limits, pausing at story boundaries to avoid mid-epic cap stalls), scheduler by night (the clock is the only hard resource, per D-034) — and never a measured closed loop, since limit telemetry doesn't exist (§7). One honest sentence the doc must carry: **day runs and night runs draw on the same subscription quota, so an unrestrained overnight run can cause exactly the daytime cap-stall the day-mode Governor exists to prevent** — the human ratified that trade-off in D-034, and it is named here rather than left looking like a contradiction between "budget-governed by day" and "unrestrained by night."

**What it rides on:** the existing decision-classification taxonomy and complexity brain (the one asset competitors can't npm-install); Workflow scripts for the deterministic regime (post-spike, §7); worktree isolation for fork-it spikes.

### 2.3 Substrate — the deterministic replay gate (the trust anchor)

**What it is.** Not a promotion ladder — the enforcement substrate the ladder compiles into. A "done" claim is accepted only when deterministic machinery re-executes the attached evidence: files stat'd, test commands re-run with matching exit codes, citations resolved, fixture provenance declared. The LLM's honesty is never load-bearing. This is the only mechanism in the entire design whose correctness doesn't depend on an agent being diligent, and everything else inherits its trust.

**What it delivers:** proof-carrying artifacts (PCA evidence blocks with class-based minimum-evidence tiers); the Tier-0 existence pre-pass (retroactively catches the entire Vantage 22-fabricated-paths class for zero tokens); the fixture-provenance lens (`captured_from:` or `synthetic: true`; synthetic-only on an external-data path = blocking — the thrice-field-earned rule, shippable this week as prose); repro-before-approve for bug fixes; reviewer addenda with concrete attempted failure scenarios.

**Enforcement-class honesty (standing rule, from the critique):** the only trustworthy enforcement classes are (a) deterministic replay/re-execution and (b) PreToolUse denies. Every file-shape check — evidence-block presence, addendum non-emptiness, charter shape, brain budget — is gameable by the agent that writes the file and must be labeled *advisory lint* in everything that ships. The assembly-log gate got gamed the week it shipped; we do not relive claude-flow's simulated-consensus cautionary tale. The reviewer-addendum non-emptiness check is hereby reclassified: presence = advisory lint; concreteness = Tier-1 judgment.

**What it rides on:** blocking `TaskCompleted` exit-2 hooks *pending the spike* (§7 — D-002 deleted this exact hook once; explicit supersession + payload re-verification required), with the designed degradation path: if the hook payload disappoints, Tier-0 ships as a deterministic pre-review script the orchestrator or reviewer spawn runs — same checks, same replay, weaker trigger, buildable today under either answer. Plus worktrees (clean replay environment) and PreToolUse denies (the destructive floor).

### 2.4 Cache — the project brain (the continuity layer)

**What it is.** `artifacts/context/project-brain.md`: a hard-budgeted (~2,500-token) curated comprehension cache — identity paragraph, current mental model, load-bearing facts with resolvable pointers, active threads, dead ends, open questions — plus machine-state frontmatter (§2.6, ruling 1). Written as a side effect of events (write-on-surprise + PreCompact flush + gate-checkpoint ritual), read at every boot (warm boot: identity → comprehension → coordination → read-back handshake), verified mechanically (pointer resolution + staleness counter). Success test: a fresh Claude reading the brain outperforms a 3×-compacted Claude. When that holds, `/reset` lands free and the human's "lobotomized vs amnesiac" dilemma dissolves.

**What it delivers:** the human's verbatim design brief, answered; the highest pain-relief-per-line item in the wave; buildable with zero unverified primitives (PreCompact flush is best-effort, not load-bearing).

**What it rides on:** existing identity/reconciliation machinery (works under Fork D1 or D2), SessionStart injection, git (the brain's diff history is the project's mind changing). Its single seam with Mechanism 1 is eviction (§2.6, ruling 3).

### 2.5 The unified record envelope (D-036)

Decided **before any subsystem writes its first record**, per the critique's directive. One envelope, five types:

```yaml
record:
  id: <TYPE>-<n>              # D | R | L | C | F
  type: decision | recommendation | lesson | claim | finding
  status: <per-type vocabulary, below>
  fingerprint: <slug>          # REQUIRED for L and F; optional elsewhere
  provenance: {role, project, date, occurrences: [{project, date, ref, d_ids}]}
  evidence: []                 # PCA evidence-item schema; each item carries the C-status vocabulary
  links: {d_ids: [], supersedes: , reopen_trigger: }   # reopen_trigger required on rejected R
  body: <abstract statement / rationale / detection heuristic>
```

**Per-type status vocabularies and the shared promotion state machine:**
- **D (decision):** proposed → accepted → verified | superseded. (Unchanged — field-proven.)
- **R (recommendation):** open → accepted (graduates to a D-record, `source: swarm-advisory, ref: R-x`) | rejected (+ mandatory re-open trigger; trigger fires → reopened). Rejections are decisions too.
- **L (lesson / failure class):** observed → recurring (auto-flagged on second occurrence, same fingerprint, different project) → candidate (promotion proposal, carrying retro-catch evidence scoring) → **promoted (HUMAN GATE — non-negotiable)** → retired (zero-hit demotion). Promotion names its enforcement tier: advisory citation → reviewer lens → structural check → generative/scaffold; the human can downgrade the tier. The verification doc's failure-class record **is merged into this** — one species, fingerprint-keyed; its schema is deleted.
- **C (claim):** not on the promotion ladder — claims decay, they don't promote. `checked / cited / attested / assumed` is the **single evidence-status vocabulary everywhere** (evidence items, C-records, promotion proposals). `checked` records its commit; underpinning-file changes flag it stale → re-verify or downgrade. Budget: 3–7 per artifact, load-bearing only.
- **F (finding):** an *instance*; L is the *class*. `fingerprint:` on F makes F→L rollup mechanical: two F-records sharing a fingerprint auto-propose the L-record occurrence append.

**The brain-eviction → lesson handoff (fixing the shape-incompatible seam):** when brain eviction promotes a durable lesson out of the hot cache, it mints or appends a **fingerprinted** L-record — fingerprint field required; a new fingerprint enters at `observed` (correcting the critique's suggested `candidate` — entry at observed keeps the 1-2-3 ladder honest: nothing skips the recurrence test); an existing fingerprint appends an occurrence and may trigger `recurring`. Free-text lessons without fingerprints — the proven-dead form — are no longer a valid eviction target.

**The file budget (stopping `artifacts/context/` sprawl):** exactly **five standing files** in `artifacts/context/`:
1. `project-brain.md` — hot cache + machine-state frontmatter
2. `decision-log.md` — D-records (accepted R-records graduate here)
3. `ledger.md` — the unified R/L/C/F record ledger (one file, typed envelope entries; the proposed advisory-ledger.md is this file, not a sibling)
4. `task-ledger.md` — machine lifecycle events only, append-only, no prose (WS-2)
5. `team-assembly-log.md` — legacy, disposition decided by Fork C (retire or rename with the gate re-anchor)

`findings-register.md` merges into `ledger.md` as F-records during the Phase 1 truth-sweep (after the design doc's renumbering pass). Per-date operational files (night charters, morning reports) live in `artifacts/delivery/`, are date-stamped, and do not count against the budget. Cross-project files (promoted-rules, decision-priors, tech-verdicts, advisory-profile) live in the user ring `~/.bmad/knowledge/`, never in `artifacts/context/`. Any subsystem proposing a sixth standing context file must supersede D-036 first.

### 2.6 The three tensions, resolved

**Ruling 1 — machine-state home (D-037).** Brain frontmatter + task-ledger; **project.yaml is deleted.** Phase and gate state (`phase:`, `gates:` map with status + D-ID + timestamp) live in the brain's frontmatter — the one place with a guaranteed reader (warm boot, every session) and guaranteed event-driven writers. Task lifecycle events live in `task-ledger.md`. Static init-time facts generators need (project type, stack) live in `swarm.yaml`, which already has a reader. This **supersedes WS-2 item 5** ("make project.yaml real via a gates: map"): the field evidence is decisive — state written as a side effect of work with a guaranteed reader survives (decision-log pattern); state maintained as a chore dies (project.yaml lied in 8/9 projects). WS-2's other items (ledger, reconciliation, liveness carve-out, wake-ack, session binding) are unchanged; the reconciliation step reads brain frontmatter for gates instead of project.yaml. If a generated compatibility view proves necessary for tooling, it is emitted *from* frontmatter and marked generated — never hand-maintained.

**Ruling 2 — volume vs precision overnight (D-038, confirming D-034).** Rank, don't restrict. The sole constitutional fences at night are the **destructive/non-destructive axis** (no push/publish/deploy/real-data migrations/rm-outside-worktree/destructive external APIs; never auto-merge; `.claude/**`, hooks, and charter write-denied — no self-legislation), the **data-not-instructions floor**, and the **security floor + contradiction escalator** (which park items, never stall the night). Everything else — budget ceilings, review-debt caps, per-item spend caps, charter allow-globs, "idle-with-report is honored" — is killed or demoted to a *ranking prior* that orders the morning report. Idle is a failure state, answered by the no-progress redirect tripwire (which maximizes output; it is not a cap). Night *implementation* work biases deterministic; night *exploration/ideation* is a supported first-class mode — this very session is the existence proof. The overnight doc's Rev 2 already complies; the **novel doc's Unlock 5 retains a stale pre-D-034 "hard budget cap" scope-guard line — amended by this ruling** (a one-line amendment to the clock-and-floor model, not a rewrite; the Unlock otherwise stands, with its Governor read as the night mode of §2.2's one subsystem). Synthesis directive honored: nothing here quietly re-cages the beast.

**Ruling 3 — one record envelope (D-036).** As specified in §2.5: one envelope, five types, one promotion state machine, one evidence-status vocabulary, the fingerprinted eviction handoff, and a five-file cap on `artifacts/context/`. This decision precedes and binds every subsystem in §4.

---

## 3. Kept / deleted / replaced-with-native (the reinvention core)

**KEPT AND EXTENDED** (the audited, field-proven assets every phase's review checks its diff against):

| Asset | Extension |
|---|---|
| Adversarial review, retry budget 2 | Gains the replay gate under it (Tier 0 pre-pass), the fixture-provenance lens, refute-by-default framing, and reviewer calibration from ledger data |
| D-ID decision traceability | Becomes the D-type of the unified envelope; extended to R/L/C/F — the full outcome-linked loop |
| Shared `artifacts/context/` knowledge layer | Becomes the two-tier hot/cold architecture (brain + cold stores) with the five-file budget; native `memory:` stays craft-notes-only |
| Complexity brain (scoring, entry points, signal→lens routing) | Becomes the routing input of Mechanism 2; router calibration data makes the rubric empirically tunable |
| Lessons-learned | Becomes fingerprinted L-records with the 1-2-3 ladder — the read-audience-of-zero problem is the wound the whole moat heals |
| Generator + eject/override model, marker/hash update safety, hook test discipline, two-dependency footprint | Becomes the compile target for promoted rules ("born immune" scaffolds) |
| Single-wake-channel (D-028) | Kept; WS-2 adds the liveness counterweight, never reverts the principle |

**DELETED:**
- The **TeamCreate gate and vocabulary** — anchored to a tool removed from Claude Code; the flagship gate never fires. Replaced by the Agent-tool re-anchor (WS-1) and, per Fork C's recommendation, honestly reframed as declared-intent lint while enforcement budget moves to the replay gate.
- The **/identity ceremony** (per Fork D1 recommendation, pending human approval) — ~3 hooks + a skill + reminder machinery that exist only to simulate what a native `--agent` main session provides.
- The **facade ring** — `integrations/github.js`, methodology eject, workspace and plugin commands, and their ~275 lines of dead-code tests (run-reporter is wired as WS-2's session-end snapshot or deleted; no limbo).
- The **orphaned methodology** (~40%) — whatever isn't worth shipping into scaffolds isn't worth keeping as product.
- **project.yaml** (ruling 1).

**REPLACED WITH NATIVE:**
- Hand-rolled coordination/liveness prose → **native agent teams + the durable task ledger** (spawn via Agent tool `subagent_type`; run-to-completion spawns preferred where two-way messaging isn't needed, per Vantage D-042).
- Identity ceremony → **native agent definitions + `--agent` main session** (Fork D).
- Prose team-shape rules → **`Agent(agent_type)` spawn allowlists + per-agent `permissionMode`** (structural enforcement of orchestrator-spawns-all/teammates-spawn-none).
- Hand-rolled parallelism → **`isolation: worktree`** for parallel devs, tournaments, and every night branch.
- Ceremony-heavy ops dispatches → **Workflow scripts** for the deterministic regime (post-spike).

---

## 4. The moat features

Each stands on the architecture of §2; none writes a record outside the D-036 envelope.

**4.1 Advisory (R-IDs).** *What:* every role gets a counsel duty; the orchestrator is the editor, not the author; recommendations are pre-decisions with stakes-priced delivery (silent/inline/pause via the one router) and re-open triggers as the auditable anti-nag mechanism. *Flagship bet:* recommendations inside the D-ID system — "here is the ledger of everything it advised, what you decided, what would reopen each one" — the first practical implementation of the published academic proactivity framework (arXiv:2605.06717) that no product ships. *Dependencies:* the envelope (D-036), the router (D-038); no unverified primitives. Calibration/counterfactual ledger (advisory W2) and standing staff-engineer (W3) stay speculative behind the editorial layer.

**4.2 Knowledge (L-IDs + the 1-2-3 ladder).** *What:* fingerprinted lessons in three privacy rings (project / user / commons), moment-matched injection (born-immune init compilation, kickoff briefs, reviewer prior-incident briefings, advisory citations, `bmad recall`), human-gated promotion compiling to four enforcement tiers. *Flagship bet:* "the third occurrence is impossible" — a falsifiable product promise; no competitor holds more than one link of fingerprints → recurrence → promotion → enforcement. *First slice:* harvest the ten existing field projects — the synthetic-fixture fingerprint enters at `recurring` and triggers a real promotion proposal on day one; the demo no competitor can fake is "this scaffold contains a rule your own projects earned." *Dependencies:* envelope only; structural-tier enforcement waits on spike 1 (degrades to lens tier meanwhile).

**4.3 Verification (replay gate + C-IDs).** *What:* §2.3's substrate plus the claim system, evidence tiering by artifact class, repro-before-approve, and the tournament/test-impl-split/saboteur variants (triple-gated: complexity ≥ threshold AND severe failure-cost class AND judgeable spec; the real value is test-suite union). *Flagship bet:* "here is the hook that refuses unproven work, and the ledger of what it refused" — versus claude-flow's admitted simulated consensus. Coverage score is trend-line only, never a gate (Goodhart). Signed VERIFICATION.md + CI replay action is the sellable interface, deferred until the gate matures. *Dependencies:* spike 1 for the hook trigger (script degradation available today); worktrees (verified native).

**4.4 Project brain (continuity).** *What:* §2.4. *Flagship bet:* fresh-boot-beats-3×-compacted, measured by the two-brain probe and the read-back handshake; `/reset` as the endgame. *Dependencies:* none unverified (PreCompact flush is the safe subset; schema-driven compaction §6.1 is the differentiating fast-follow behind spike 2).

**4.5 /sleep (the Night Ladder, per D-034).** *What:* the router in asleep mode — fork it / default it / park-and-route-around; the initiative engine ranked by value × novelty × evidence-of-pain (ordering, never refusal); the morning report as a queue to clear (answer / pick / merge / shelf / proposals / parked / ledger); preflight canary; no-progress redirect tripwire; report-from-ledger so a 5am orchestrator death still yields a morning report. Major/minor dependency bumps route to morning proposals because installing a package executes postinstall code — a supply-chain risk squarely on the destructive axis, not a mere review-surprise concern (patch-level bumps in isolated worktrees with full test replay remain fine). *Flagship bet:* "you don't wake up to questions or to damage — you wake up to a shelf of finished ideas, and the ones you don't want cost only the deleting." Uncopyable without the taxonomy + R-ID ledger + replay gate + narrowed shell — competitors have none of the four. *Dependencies (hard):* **Fork A shell-narrowing** (the honesty condition — without it "worst case = delete the branch" is false today, per security F-016/F-018), **WS-2 task ledger** (crash-only resume), **the replay gate** (morning-queue trust). Any roadmap showing /sleep before these is fiction; it is sequenced in Phase 5 accordingly.

**4.6 Self-tuning methodology (human-gated).** *What:* Loop 2 of the flywheel — coordination pathologies, finding-taxonomy stats, and router calibration data feed proposed methodology adjustments (lens rosters, ceremony levels, spawn-mode defaults, complexity rubric weights), always as human-approved proposals against a tracked profile file, never learned autonomy. Constitutional floors are excluded from tuning by construction. *Flagship bet:* the only methodology that can show *empirical* justification for its own rules. *Dependencies:* ledger data volume — this matures last, by design.

---

## 5. Integrated roadmap

One sequence folding the eleven repair workstreams and the new capabilities. **Standing rules:** every phase's review checks its diff against the protect-the-brain guardrails (roadmap §3: adversarial review, D-IDs, shared context layer, methodology brain, lessons, generator model, single-wake-channel); no phase may depend on an unverified primitive until its spike (§7) returns; **npm publish waits for the truth-sweep + self-contained scaffolds** — publishing before WS-1/WS-5/WS-6 land would re-ship brokenness with a fresh version number.

**Phase 0 — Repair and spike** *(fork-independent except WS-1's final shape; starts immediately)*
Findings-register renumbering (do first). WS-1 coordination repair: dead TeamCreate verb → Agent-tool vocabulary, gate re-anchor, `AGENT_TEAMS` env, content-assertion tests — *nothing else matters until the product works on current Claude Code*. WS-10 items 1–3 (working `npm test`, LICENSE/metadata, CI with init→doctor→validate smoke). WS-9 fork-independent half (honest estimator prices + missing tiers + `estimated_tokens` wiring). WS-7 role-prompt coherence + **the fixture-provenance standing lens as prose** (the cheapest real moat win in the entire wave — shippable this week, zero new infrastructure). **The four spikes (§7) run here in parallel.** *Guardrails: strengthens #1 (review lens) and #6; touches nothing else.*

**Phase 1 — Truth, self-containment, and the envelope** *(fork-independent; unblocks publishing)*
WS-5 single-source sweep (roster, write-policy, entry points, taxonomies, model prose; validator reads the schemas). WS-6 self-contained scaffolds (ship the load-bearing methodology subset into `.claude/bmad/`; path-resolution test). **D-036 envelope lands structurally:** decision-log format normalized, `ledger.md` created, findings-register merged as F-records, the five-file cap enforced. **Project brain v1** (file + schema + budget + write-on-surprise + read-back handshake — fork-independent; frontmatter becomes the machine-state home per D-037, project.yaml deleted). Proposed README/CHANGELOG rewrite per D-035 (describing the reinvented tool, landing with the approved build — not patching the being-replaced state). *Guardrails: #2 normalized not removed; #3 extended (brain = hot tier); #4 shipped and de-drifted, not diluted.*

**Phase 2 — Enforcement and resilience** *(needs Forks A, C, D)*
WS-3 permission narrowing per Fork A (also the /sleep precondition). WS-4 per Fork C: cheap gate-correctness fixes regardless; assembly gate honestly reframed; **replay gate v1** — Tier-0 as the exit-2 hook if spike 1 confirms, else as the deterministic pre-review script (same checks, weaker trigger). WS-2 in full: task ledger, reconciliation, liveness carve-out, wake-ack, session binding — with gates state in brain frontmatter per D-037; field-test against a real project before release. Brain warm-boot integrated into the reconciliation path (home depends on Fork D). *Guardrails: #1 strengthened (evidence contract), #7 counterweighted not reverted.*

**Phase 3 — Ship and heal the field** *(needs Phases 0–1; sharing-model sentence from the human)*
WS-8 facade cuts + gitignore sharing-model flip. WS-10 release cut — **HARD GATE: publish only after WS-1 + WS-5 + WS-6 have landed**; first honest release in six months. WS-11 version-stamped scaffolds, doctor skew check, migration table, scan-derived init; then `bmad-swarm update` across all ten field projects as the acceptance test — the first time any fix ever shipped reaches a real install. *Guardrails: #6 is the machinery this phase rides; facade cuts must not touch it.*

**Phase 4 — The moat goes live** *(needs the envelope + Phase 2 substrate)*
Knowledge first slice (harvest the ten projects; first real promotion proposal on day one). Init-time rule compilation ("born immune"). Advisory layer as the R-type of the ledger, delivered through the one router. C-IDs + claim decay on new artifacts. Counterfactual replay for promotion proposals. Morning report / Mission Control v1 — **read-only generated queue; answers via terminal** (interactive answering CUT until the substrate is verified). *Guardrails: #2 and #5 are the substance here; #3 extended with the user ring.*

**Phase 5 — The beast and the router** *(needs Fork A landed + WS-2 field-tested + replay gate live)*
/sleep with the Night Ladder per D-034 (destructive axis as the sole fence; preflight canary; redirect tripwire; report-from-ledger). Regime router on Workflow scripts (only if spike 3 confirms the contract; else the router ships team/solo-only). Governor switched to night mode (scheduler — the clock is the only hard resource; the day/night quota coupling of §2.2 is the accepted D-034 trade-off; never a measured closed loop — telemetry doesn't exist). WS-12 remainder (plan approval at complexity ≥ 12, upstream-BMAD steals, ops posture, plugin distribution). Self-tuning methodology proposals begin as ledger data accumulates. *Guardrails: all seven checked; #1 (review) is the morning queue's load-bearing wall.*

**Speculative tier (vision, not scheduled):** tournaments/saboteur (triple-gated), schema-driven compaction, signed VERIFICATION.md + CI replay action, commons ring / lesson packs, historian, standing staff-engineer, graduated world-access — **two-band structure preserved verbatim, or it becomes its own kill-list item: the INNER floor (real merges, production actions, self-legislation of `.claude/**`, hooks, the charter) is absolute and never widens at any trust level; only a named OUTER band (staging deploys, sandboxed external calls) may widen, per-category, by human-gated demonstrated track record** — wake-me protocol, scar-weighted staffing, brain transplant, calibration score, `/reset` (lands free once the brain's success test holds).

---

## 6. The four forks — decision-ready

These gate Phases 2+ and are architecture-class: they REQUIRE human approval. All four can be answered in one pass.

**Fork A — security posture.** *Recommendation: A1 now (drop interpreter-capable shell from the orchestrator's allow-list; write-gate covers Bash/NotebookEdit; settings.local.json out of the writable set), A3 stack-aware teammate allowlists as follow-on.* Unblocks: WS-3; the delegate-everything rule becomes structural; **and it is the named precondition for /sleep** — without it, "worst case = delete the branch" is false (F-016/F-018) and the night's one wall is prose. *Question: "May the orchestrator lose its interpreter shell (it delegates npm test etc. by design), with stack-aware teammate allowlists to follow?"*

**Fork B — model tier, superseding D-027.** *Recommendation: B2/B3 (default opus; fable for architect/strategist/security and complexity ≥ 12; sonnet for researcher/devops; visible per-project override).* Only the human who issued D-027 can retire it. Unblocks: WS-9's policy half; ~40–50% limit-burn reduction on implementation-heavy runs; fewer mid-epic cap stalls — the most expensive failure mode. *Question: "Retire fable-everywhere in favor of the tier mix with a visible override knob?"*

**Fork C — gate posture.** *Recommendation: C2 + native quality hooks (fix the cheap correctness bugs either way; reframe the assembly gate as declared-intent lint; spend the entire enforcement budget on the replay gate, whose blocking is structurally sound — pending spike 1).* A repo-file gate can never bind the actor who writes the file; pretending otherwise is the defect. Unblocks: WS-4; decides team-assembly-log.md's disposition in the file budget. *Question: "Do we stop calling the assembly gate enforcement and put all blocking into the replay gate?"*

**Fork D — orchestrator as native agent.** *Recommendation: D1 (`bmad-swarm start` → `claude --agent orchestrator` with `initialPrompt`; retires the /identity ceremony, the reminder hook, and most post-compact re-injection; structurally fixes orchestrator-spawnable-as-teammate).* Three audits independently converge on it; requires formally superseding ADR-014's "main session cannot be a custom agent type" claim, and spike 4 verifies the primitive first. Unblocks: WS-1 final shape; WS-2's reconciliation home; the brain's warm-boot slot. *Question: "Launch the orchestrator as a native --agent main session and retire the identity ceremony?"*

**Secondary calls (a sentence each; architect resolves if silent):** the artifact sharing model (recommended: git-track `swarm.yaml`, `CLAUDE.md`, `artifacts/`) and the facade kill list (recommended: kill all five; wire run-reporter into WS-2 or delete).

---

## 7. Must-spike-first

No roadmap phase may depend on one of these until its spike returns (D-040). All four run in Phase 0; each is ≤1 day.

1. **Blocking `TaskCompleted`/`TaskCreated` exit-2 hooks with a usable payload** — the highest-stakes assumption in the wave; anchor for the replay gate's trigger, the knowledge structural tier, and the night review gate. History demands caution: **D-002 deleted this exact hook in April because the event didn't exist and payloads lacked task fields.** The ecosystem audit says the platform grew it — both can be true across time, but D-002/ADR-002 must be **formally superseded, never silently contradicted**, and only after verifying the payload carries task identity + enough context to locate the gated artifact, and that exit-2 actually blocks. *Designed degradation:* Tier-0 as an orchestrator/reviewer-run deterministic pre-review script — buildable today under either spike outcome.
2. **PreCompact summarizer steering** — the hook firing is documented; the summarizer honoring injected custom compaction instructions is not. Ship the flush prompt (continuity §2.2, the safe subset) regardless; schema-driven compaction (§6.1) waits on this spike.
3. **Workflow script contract** — schema-validated node outputs, node-boundary resume, `escalate: agentic` re-routing. The primitive is asserted; the specific contract is design-on-top. The regime router's deterministic tier waits on this.
4. **`--agent` main session** — Fork D1's substrate. The brain's warm boot is designed to work under D1 or D2 either way.

**Not spikeable, already resolved by reframing:** budget/limit telemetry does not exist — the Governor ships as an estimate-based scheduler, never a measured closed loop. **Deferred without a spike:** Artifact interactivity — Mission Control v1 is read-only; answers happen in the terminal.

---

## 8. Human-approval queue

Everything below is architecture-class or a standing-directive supersession. One morning pass clears items 1–4; the rest land with their phases.

| # | Item | Class | When |
|---|---|---|---|
| 1 | **Forks A, B, C, D** (§6) | Architecture | Now — one pass |
| 2 | **Ratify D-036–D-041** (§9 — minted overnight under D-033 authority) | Strategic decisions | Now, same pass |
| 3 | **This vision doc + the integrated roadmap** (§5) | prd-class | Now |
| 4 | Sharing model + facade kill list | A sentence each | Same pass, optional |
| 5 | ADR-A (gate re-anchor + enforcement-class statement) | Architecture | Phase 0/2 epic, per Forks C/D |
| 6 | ADR-B (orchestrator as native main-session agent; supersedes ADR-014 claim) | Architecture | With Phase 0 epic, if D1 |
| 7 | ADR-C (permission-model posture; supersedes ADR-003's implicit posture) | Architecture | Phase 2, per Fork A |
| 8 | ADR-D (liveness protocol: ledger, reconciliation, wake-ack) | Architecture | Phase 2, before WS-2 build |
| 9 | ADR-E (shipping the methodology subset into scaffolds) | Architecture | Phase 1 |
| 10 | ADR-F (sharing model + kill list — reverses documented behavior) | Architecture | Phase 3, before WS-8 |
| 11 | **D-ID superseding D-027** (tier policy) | Standing human directive | Per Fork B |
| 12 | **D-ID superseding D-002** (TaskCompleted hook resurrection) | Standing decision | After spike 1, before the hook ships |
| 13 | L-record promotion proposals (first: the synthetic-fixture rule at `recurring`) | Promotion gate | Phase 4, day one of the harvest |

---

## 9. Decisions minted in this synthesis (D-036–D-041)

All strategic, all minted under D-033 overnight authority, all queued for morning ratification (item 2 above). One-line entries appended to `artifacts/context/decision-log.md`; these are the full records.

**D-036 — One record envelope.** D/R/L/C/F unify on a single record shape (id, type, status, fingerprint, provenance/occurrences, evidence, links, body) with one human-gated promotion state machine (§2.5). The verification doc's failure-class schema merges into L-records; F-records gain `fingerprint:` for mechanical rollup; `checked/cited/attested/assumed` is the single evidence-status vocabulary; brain eviction mints fingerprinted lessons entering at `observed`; `artifacts/context/` is capped at five standing files. Binds every subsystem before its first record write. *Supersedes: the five divergent record schemas; the separate advisory-ledger.md file proposal.*

**D-037 — Machine-state home.** Phase/gates → project-brain frontmatter (guaranteed reader); lifecycle events → task-ledger; static init facts → swarm.yaml; **project.yaml deleted** (a generated view may be emitted from frontmatter if tooling demands, never hand-maintained). *Supersedes: WS-2 item 5 ("make project.yaml real"). Rationale: field-proven — chore files die (8/9 lied); side-effect files with guaranteed readers survive.*

**D-038 — One priced decision router (and one Governor).** The interruption tax, the Night Ladder, and regime routing are one stakes × human-availability × complexity routing function with a mode column — never parallel tables. The Budget Governor is likewise ONE mode-parameterized subsystem: treasurer by day, scheduler by night — with the day/night quota coupling stated honestly (an unrestrained night draws the same subscription quota the day-mode Governor protects; trade-off ratified in D-034). Constitutional floors (security, contradiction escalator, destructive axis) are invariant and unpriced. Confirms D-034's rank-don't-restrict model; amends the novel doc's stale pre-D-034 Unlock 5 budget-cap line; softens "night defers all ambiguity" to an implementation-work bias — night exploration is a supported mode.

**D-039 — The 2+2 architecture and the reinvention core.** The product is two mechanisms (record-promotion ledger, priced decision router) on a substrate (deterministic replay gate) with a cache (project brain); the thesis is outcome-linked decision memory (§1). The kept/deleted/replaced-with-native table (§3) is adopted. Enforcement-class honesty is a standing rule: only deterministic replay and PreToolUse denies may be called enforcement; every file-shape check ships labeled advisory.

**D-040 — Must-spike-first.** No roadmap phase depends on an unverified primitive until its spike returns (the four in §7). Tier-0 ships with the script degradation path under either spike-1 outcome. D-002 is superseded only explicitly, after payload re-verification — silent contradiction of a logged decision is a defect class, not a shortcut.

**D-041 — The integrated roadmap and its hard gates.** Six phases per §5. Hard gates: npm publish only after WS-1 + WS-5 + WS-6 (truth-sweep + self-contained scaffolds); /sleep only after Fork A + field-tested WS-2 + live replay gate; every phase reviewed against the protect-the-brain guardrails; Mission Control v1 read-only.
