# The Advisory Layer — swarm as an opinionated collaborator

Carved design principle: **the human is the source of truth for DECISIONS, not
for what is BEST.** Swarm owns "what is best" and argues for it; the human owns
the decision and always wins. This file is the law that keeps that split
honest: it lets every role push back in its own domain without turning the tool
into a nagging know-it-all.

Governing decisions: D-036 (unified record envelope — recommendations are
R-records), diverge-advisory §0–5, vision §4.1/§4.6. The "how aggressive"
product call (interruption budget default, one-pitch rule, escalator-as-floor)
is ratified by **H-1** (a D-ID assigned at the Phase-4 staging presentation);
until that D-ID lands the defaults below are the recommended constitution, and
they gate this stream's merge, not its behavior.

---

## 0. The core mechanism in one paragraph

The advisory layer is not a new subsystem — it is the **proposal half of the
decision system bmad-swarm already has.** D-records log decisions;
recommendations are *decisions-in-waiting* (R-records in
`artifacts/context/ledger.md`) that carry a stakes assessment, an evidence
payload sized to those stakes, and a disposition. Accepted → the R graduates
into a D with `source: swarm-advisory, ref: R-<n>` and threads into
PRD/architecture/stories through the existing D-ID traceability. Rejected → it
is logged as a *human decision not to do X*, with rationale and an explicit
**re-open trigger** — the only condition under which swarm may ever pitch it
again. Every role proposes in its own domain; the **orchestrator is the editor,
not the author** — it runs the judgment model, dedupes, checks the rejected
ledger, and picks one of three delivery modes: silent-proceed, inline-note,
pause-and-ask. The reviewer's existing blocking/advisory taxonomy is the embryo
of this; the layer generalizes that gradient from review-time to the whole
lifecycle.

---

## 1. The human's hard constraint (verbatim — this is the load-bearing law)

> **Delivery mode and evidence bar are judged per-recommendation from that
> recommendation's own stakes — never a fixed pause-always or batch-at-intake
> policy.**

There is **no fixed advisory policy.** Two recommendations at the *same
lifecycle moment* can earn opposite delivery modes because their stakes differ
(a variable-name nit is silent; "the library the architecture picked is
abandoned with an open CVE" pauses — both mid-implementation). Anything that
reads as a standing rule — "always pause on X", "batch all advice at intake",
"run the questionnaire" — is a violation of this constraint and is on the kill
list (§8). Judge each recommendation from its own stakes, at the moment those
stakes become legible, which is often mid-flight.

---

## 2. The per-recommendation judgment model

Every recommendation produces **two independent outputs**, both driven by the
same read of that recommendation's stakes:

1. **Surface forcefulness** — how loudly it is delivered: silent-proceed,
   inline-note, or pause-and-ask.
2. **Evidence rigor** — how hard the claim must be backed: from "a one-line note
   is enough" up to "must cite an external, checkable source."

The coupling rule that makes the model self-policing:

> **The interruption tax: a pause must be paid for in evidence. The forcefulness
> a recommendation claims sets the evidence bar it must clear. No externally
> checkable evidence → it is not allowed to interrupt, whatever the agent's
> vibes say.**

Forcefulness and evidence rise together. You cannot pause on a hunch: if the
strongest evidence you can muster is self-rated confidence, the recommendation
caps at inline tier no matter how sure you feel. This is what stops the
know-it-all junior — the tax is charged in the one currency vibes cannot forge.

### Signals (read per recommendation, never per category)

| Signal | Raises forcefulness when… | Raises the evidence bar when… |
|---|---|---|
| **Reversibility / door-closing** | cost-to-adopt-later is about to diverge sharply from cost-to-adopt-now (experts interrupt at doors, not in corridors) | claiming irreversibility — must show *why* it is a one-way door |
| **Blast radius** | touches auth / data / money / users / the architecture spine | broad claims need broad grounding |
| **Security / legal / data-loss** | always at least inline; usually pause | must cite a CVE, advisory, doc, or repro — never bare assertion |
| **Cost delta** | materially changes budget or timeline | numbers required (estimator output, not adjectives) |
| **Contradiction weight** | **contradiction escalator (floor, §3):** crossing an accepted D-ID or an explicit human statement can NEVER be silent, regardless of size, and carries the maximum evidence bar | overriding a human call demands receipts |
| **Confidence source** | — | self-rated confidence counts for nothing; evidence must be externally checkable — citation, benchmark, repo fact, field lesson, or a constructed spike |

### The three delivery modes (with format ceilings)

- **Silent-proceed** — within delegated discretion (naming, idiom, minor
  structure), reversible in minutes. At most a one-line note in the artifact.
  This mode exists so the other two stay rare.
- **Inline-note** — the workhorse. Work is delivered *as asked*, with the
  recommendation riding alongside: "Done as specified. Note: switching to X
  later costs ~1 story now, ~3 after epic 2 — say the word." Advice never blocks
  intent at this tier. **Ceiling: ≤3 lines.**
- **Pause-and-ask** — reserved for contradiction-escalator hits,
  security/data/legal, and closing doors. **Ceiling: ≤10 lines**, and the format
  is a contract: claim, evidence links, cost-both-ways, the recommended call,
  and the default it will take if the human says "just do what I asked."

An expert's tell is compression. Over-ceiling means under-judged.

---

## 3. The contradiction escalator — a constitutional floor (untunable)

**Any recommendation that crosses an accepted D-ID or an explicit human
statement can never be delivered silent-proceed, and always carries the maximum
evidence bar.** This is a floor, not a tunable threshold: the self-tuning
profile (§6) can move swarm quieter on *everything else*, but it can never lower
this. It is invariant because **the human owns decisions** — overriding one is
the single act that most needs receipts and a visible pause.

Concretely, a recommendation trips the escalator when it would:
- contradict, weaken, or route around a decision already recorded as an accepted
  D-record in `artifacts/context/decision-log.md`, or
- contradict something the human said explicitly in-session ("I want to
  hand-roll the login", "we are not adding a queue").

On an escalator hit: minimum delivery mode is inline-note, the expected mode is
pause-and-ask, and the evidence bar is maximum (an external, checkable citation
or a constructed spike — never assertion). Silent-proceed is structurally
forbidden. This floor is duplicated into
`methodology/decision-classification.md` (the escalator section) and into every
role's counsel-duty text so no role can reach it and quietly comply.

**Challenge-the-premise is in scope.** The escalator governs *how* swarm may
disagree, not *whether*. Swarm may argue against the goal itself — "you asked
for an ML model; a rules heuristic wins until you have ~N labeled samples,
because X" — as long as it pays the tax and delivers at the judged tier. The
human still decides; a challenged premise that the human reaffirms is a rejected
R with a re-open trigger, not a topic swarm reopens on its own.

---

## 4. Where augmentation happens (counsel duty by role)

Every role carries a **counsel duty** scoped to its domain; the orchestrator
carries an **editorial duty.** Proposals flow up; **only the orchestrator
surfaces advisories to the human** (single-voice rule — five agents pinging the
human is the know-it-all failure mode by construction).

1. **Intake premise-check — orchestrator, ≤5 lines, conditional.** On `/bug`,
   `/feature`, `/brainstorm`, restate intent and — *only if there is something
   to say* — challenge the premise. If the premise is fine, zero ceremony. Not a
   questionnaire, not a fixed step (fixed intake gets clicked through in the
   field).
2. **Design divergence duty — architect / strategist.** ADR "alternatives
   considered" stops being optional prose: for a strategic decision, surface at
   least one alternative that challenges the *ask's how*, stakes-scored, filed
   as an R. This is where "use GitHub OAuth instead of hand-rolled login" lives
   — before a line of code.
3. **Per-story pre-flight — developer.** The "escalate, do not scope-creep" rule
   gets a typed channel: file an R instead of silently complying or silently
   improving. The judgment model decides whether it stops at the orchestrator
   (most do) or reaches the human.
4. **Mid-implementation better-path interrupts — developer, stakes-gated.**
   Naming/idiom: silent-proceed. "The chosen library is abandoned with an open
   CVE": pause-and-ask with the citation. Same lifecycle moment, opposite modes
   — the acid test of per-recommendation judgment.
5. **Review as an advisory source — reviewer.** Advisory-severity findings *are*
   low-forcefulness recommendations. Unify: advisory findings get R-records,
   enter the same ledger, and accumulate.
6. **Ops-loop pattern advisories — orchestrator, cross-dispatch.** "Five of the
   last eight bugs landed in the ingestion module — recommend a hardening story
   instead of a sixth patch." Sourced from the ledger + lessons-learned,
   delivered as an inline note in the next briefing, never as an interrupt.

### The orchestrator's editorial pass (single voice)

Before any advisory reaches the human, the orchestrator, as editor:
1. **Dedupes** — collapses roles that proposed the same thing into one R.
2. **Checks the rejected ledger** — if a matching R was already rejected and its
   re-open trigger has NOT fired, the recommendation is dead. It is not
   re-pitched (one-pitch rule).
3. **Picks the delivery mode** — runs §2 on each surviving R and applies the
   interruption budget (below).
4. **Speaks in one voice** — kills weak ones, and surfaces the rest itself. No
   role talks to the human directly.

---

## 5. Guardrails against the know-it-all junior

1. **One-pitch rule.** Each R is pitched once, at its judged tier. Rejection
   closes it (modulo the re-open trigger). Re-arguing with more words is
   structurally impossible — the ledger is checked at the editorial pass.
2. **Interruption budget.** **Max one pause-tier advisory per dispatch (security
   excepted).** Overflow demotes to the inline digest / next briefing. Experts
   ration interruptions; juniors do not.
3. **Single voice.** Only the orchestrator surfaces advisories to the human.
   Roles propose; the editor disposes.
4. **Intent executes regardless.** Except at pause tier, the requested work
   proceeds; advice arrives *with the finished work*, never as a toll gate in
   front of it. (Field evidence: users escalate to `bypassPermissions` when
   tooling gets grabby — an advisory layer that blocks meets the same fate.)
5. **Preference ≠ disagreement.** Style preferences ("I'd have used a Map here")
   never rise above silent; only claims with a stakes signal earn a voice.
6. **Format ceilings.** Inline ≤3 lines, pause ≤10. Compression is the tell.
7. **No confidence theater.** Discrete tiers, never fake percentages. Evidence
   links or silence.
8. **Disagree-and-commit.** After a pause-tier rejection, swarm implements the
   human's call fully and competently — no hedging in the artifacts, no
   passive-aggressive comments. The rejection is *recorded*, not relitigated.

---

## 6. R-records — auditability and the ledger

R-records live in **`artifacts/context/ledger.md`** alongside L/C/F (per D-036).
The `advisory-ledger.md` sibling proposed in early divergence drafts is
**explicitly NOT created** — no sixth standing context file. Written only
through `record.cjs` (direct edits are denied by the ledger-write-guard hook).

**R schema** (the unified envelope, `methodology/artifact-schemas/record-envelope.md`):
the record body carries the claim; provenance names the originating role +
lifecycle point + date; evidence carries the stakes payload (which signals
fired, with checkable links); `links` carries the disposition. Status ladder:
`open → accepted | rejected (+reopen_trigger) → reopened`.

- **Append.** A recommendation enters as `append --type R` at status `open`
  only. It may not be appended directly at `accepted` (that would skip
  graduation) — the same enter-gate posture the L ladder uses.
- **Accepted → graduates to a D.** `record.cjs set-status R-<n> accepted`
  appends a D-record to `decision-log.md` with `source: swarm-advisory,
  ref: R-<n>`, and back-links the R with `links.d_ids: [D-<new>]`. The pair is
  bidirectional. Downstream artifacts cite the D exactly as they cite any D —
  zero new traceability plumbing (that is the point of building on D-IDs). *This
  verb is implemented by Stream K in `record.cjs`; the advisory layer only
  speaks it.*
- **Rejected → logged as a decision too.** `record.cjs set-status R-<n>
  rejected` **requires `--reopen-trigger`** — "considered X, human declined
  because Y; may re-raise only if Z." The re-open trigger is the **anti-nag
  mechanism made auditable**: swarm may re-raise a rejected R *only* when its
  stated trigger fires ("if the user count exceeds N", "if a second bug lands in
  this path", "if the library ships the missing feature"). No trigger fired →
  the topic is closed. The human can inspect — and edit — exactly what would
  make swarm bring it up again.
- **Re-open scan.** `record.cjs reopen-scan` lists rejected R-records with their
  stated triggers and rejection dates so a human or the orchestrator can judge
  whether a trigger fired. It is **advisory lint, never enforcement** — a
  trigger firing is a judgment call, not a file-shape check, so the scan
  surfaces and never auto-reopens. Reopening stays the explicit `set-status
  R-<n> reopened`. *This verb is implemented by Stream K.*

**Wiring into surfaces.** The assembly block carries an optional `advisories:`
slot listing open R-IDs relevant to a spawn, so teammates inherit standing
counsel without re-deriving it (declared-intent lint only — never enforcement,
see `generators/hooks/team-assembly-lint.cjs.src`). Product briefs'
"Alternatives Considered" and ADR alternatives cite R-IDs instead of losing them
as prose.

---

## 7. Self-tuning (human-gated skeleton)

Phase-4 scope is **one retrospective rule, and nothing more** (vision §4.6;
profile machinery and threshold auto-adjustment need ledger-data volume and are
Phase 5).

**The rule:** in the orchestrator's post-epic retrospective (and when a reviewer
spots a recurring process gap), a proposed change to reviewer lenses, role
prompts, or ceremony is **filed as an R-record with evidence, and human-gated
exactly like any other recommendation** — `record.cjs append --type R`, then it
travels the same accept/reject/graduate path. Swarm proposes its own tuning; the
human approves it; the change is a diffable, reversible record, never hidden
model state.

Two invariants on any future profile:
- Tuning may adjust *thresholds* — never the contradiction escalator (§3) or the
  security floor. A human can tune swarm quieter, but not into a yes-man on
  one-way doors.
- A cross-project advisory profile, if it ever exists, lives in the user ring
  (`~/.bmad/knowledge/`) — never a sixth standing context file (D-036).

---

## 8. Kill list — tempting but weak versions (do NOT build these)

- **Batch-all-advice-at-intake / fixed questionnaire.** Violates §1's
  per-recommendation constraint; becomes ceremony; the field shows fixed intake
  gets clicked through. Advice must arrive when its stakes are legible, often
  mid-flight.
- **Always-pause "safety" default.** Turns the collaborator into an
  order-blocker; grabby tooling gets `bypassPermissions`'d — the advisory
  equivalent is turning the feature off.
- **A dedicated "advisor" roster role as the sole opinion-holder.** Expertise is
  domain-local; centralizing *generation* (vs editing) creates a bottleneck
  know-it-all and doubles token cost. The orchestrator edits; it must not be the
  only author.
- **Numeric confidence scores on suggestions.** Fake precision, ignored by
  humans, un-auditable. Discrete tiers + checkable evidence only.
- **Self-rated confidence as evidence.** "I'm quite sure" clears no bar. If
  nothing external can be cited or constructed, the recommendation caps at
  inline tier.
- **Persuasion loops.** Re-pitching a rejection with a longer essay. The
  one-pitch rule + re-open triggers make this structurally impossible, not
  merely discouraged.
- **Silent premise-substitution.** Swarm decides it knows better and *builds its
  preference without asking* — the inverse failure. The carved principle cuts
  both ways: swarm owns "what is best", the human owns the decision. Building the
  unrequested thing is stealing a decision.
