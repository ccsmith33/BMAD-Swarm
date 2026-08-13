# Phase 2 Design — Enforcement + Resilience (2026-08-13)

- **Author:** architect (Phase 2 design spawn)
- **Status:** DESIGN + WORK BREAKDOWN — no implementation in this pass
- **Implements:** vision §5 Phase 2 (D-041), plus the Phase-1 leftovers the vision assigned there that have not yet landed (the D-036 envelope structural landing and project-brain v1 — `artifacts/context/` today still has `findings-register.md`/`lessons-learned.md` and no `ledger.md`/`project-brain.md`/`task-ledger.md`)
- **Governing decisions:** D-036 (envelope), D-037 (machine-state home), D-039 (2+2 architecture, enforcement-class honesty), D-040 (spike gating), D-041 (roadmap), D-042 (Forks A/C/D ratified)
- **Governing ADRs (all PROPOSED, ratification is human-queue item 1 below):** ADR-017 (shell narrowing), ADR-018 (liveness/task-ledger/machine-state), ADR-021 (record envelope), ADR-022 (TaskCompleted resurrection / D-002 supersession)
- **Spike ground truth:** `artifacts/exploration/spikes-2026-08-11.md` — TaskCompleted exit-2 blocking verified live on v2.1.221 (payload: `task_id`, `task_subject`, `task_description?`, `teammate_name?`); PreCompact flush + steering verified both halves, PostCompact carries `compact_summary`; `--agent` main session verified.

---

## 1. Executive summary

Phase 2 lands the enforcement substrate (replay gate), the record substrate (unified ledger), and the resilience layer (task ledger + liveness + brain + machine-state migration), plus the Fork A permission narrowing. Five pieces, three sub-epics:

- **SE-1 — "Substrate + narrowed shell"** (recommended first): Fork A narrowing, the record-envelope module + serialized-write channel + `ledger.md` migration, and replay gate v1. Three parallel tracks after one small serialized prep commit.
- **SE-2 — "Memory"**: project brain v1 (schema, hooks, protocol) + the hook-written task ledger.
- **SE-3 — "Liveness + cutover"**: reconciliation/warm-boot integration, wake-ack + liveness carve-out, project.yaml deletion, RES-9 re-review fix, mandatory field test.

The single most important cross-cutting call in this design: **machine-written coordination state is written by hooks, not by prompted agents, wherever a hook can see the event** (§3.3). Hooks are deterministic writers with guaranteed triggers — the exact property whose absence killed project.yaml (8/9 field projects lying) and whose presence made decision-log survive.

---

## 2. Dependency graph

```
Piece 5 (Fork A narrowing) ──────────────┐  independent; hardens Piece 2's security story;
                                         │  /sleep precondition (D-041)
Piece 1 (record envelope + ledger.md)
   ├─ evidence-item schema ─────────────► Piece 2 (replay gate: bundle schema, citation
   ├─ serialized-write channel ─────────►          resolution, rejection F-records)
   └─ L-record shape ───────────────────► Piece 4 eviction handoff (deferrable to Phase 4)

Piece 4 (project brain)
   └─ frontmatter (phase/gates home) ───► Piece 3 machine-state cutover (project.yaml delete)

Piece 3 (task ledger + liveness)
   ├─ task-ledger writers (hooks) ── independent of everything above
   └─ reconciliation ── needs task-ledger + brain frontmatter; warm-boot home is the
                        Fork D --agent initialPrompt (already adopted)

Shared file chokepoint: generators/hooks-generator.js holds every hook's source inline.
Pieces 2, 3, 4, 5 all touch it → the SE-1 prep commit (§3.4) splits it first.
```

Reading order of hard edges:
1. **Envelope schema before any record write** (D-036 binds every subsystem). The schema module (§4.1) is the first code to exist.
2. **Replay gate needs the evidence-item schema and the rejection-record appender** — not the whole ledger migration. Track-parallelizable inside SE-1 against the frozen interface in this doc.
3. **project.yaml deletion needs the brain frontmatter to exist first** (D-037: state must have a guaranteed reader before the old home is removed). So the cutover is SE-3, after SE-2 ships the brain.
4. **Fork A depends on nothing** and nothing in Phase 2 hard-depends on it — but ADR-022's security rationale ("the hook executes only declared evidence under the narrowed model") is honest only once Fork A lands, so it goes in SE-1.
5. **Field test last** (ADR-018 consequence, D-041 mandate): SE-3 ends with a run against a real project before release.

---

## 3. Cross-cutting design decisions (shared substrate)

These bind all five pieces. Each is tactical-classified per `decision-classification.md` unless flagged; candidates for the decision log are listed in §8.

### 3.1 Record storage format — fenced YAML in markdown, one file

`artifacts/context/ledger.md` holds R/L/C/F records as markdown sections, each with one fenced YAML `record:` block (the ADR-021 envelope verbatim). `decision-log.md` keeps its existing human-readable format and remains the D-record home; D entries gain nothing new in SE-1 beyond what ADR-021 already specifies (accepted R-records graduate there with `source: swarm-advisory, ref: R-x`).

Entry shape in `ledger.md`:

````markdown
## F-042 — synthetic fixture masks real-data failure

```yaml
record:
  id: F-042
  type: finding
  status: open
  fingerprint: synthetic-fixture-masks-real-data
  provenance: {role: reviewer, project: bmad-swarm, date: 2026-08-13, occurrences: []}
  evidence:
    - {kind: citation, status: cited, ref: "artifacts/reviews/audit-2026-08-11-resilience.md:47"}
  links: {d_ids: [D-036]}
body: |
  One-paragraph abstract statement / detection heuristic.
```
````

Rules: heading carries ID + title only (status lives solely in YAML — no dual-write drift surface); records are appended in ID order; **status transitions edit the record's `status:` field in place** — git history is the transition audit log (the ledger's diff history is part of the product, ADR-021). The parser contract: extract fenced blocks whose first key is `record:`; ignore everything else (prose between records is legal and human-oriented).

### 3.2 Write-serialization — the pinned-script channel (RES-6/RES-8, seen live this session)

Concurrent agents corrupting or interleaving shared context files is a live, observed failure. The fix has two halves, one per enforcement class (D-039):

1. **A serialized appender CLI** — `.claude/bmad/bin/record.cjs` (shipped by the methodology generator, so scaffolds are self-contained per ADR-019). All writes to `ledger.md`, `task-ledger.md`, and `decision-log.md` go through it. It provides: directory-lock mutual exclusion (`mkdir artifacts/context/.ledger.lock`, atomic on POSIX; 250 ms retry, 60 s stale-steal with pid+timestamp file), read-modify-write, temp-file + `rename` atomic write (the ADR-011/RES-8 norm), and **collision-free ID allocation** (`next-id <TYPE>` scans under the lock). Subcommands:
   - `append --type <D|R|L|C|F> [--stdin | --file <yaml>]` → allocates ID, validates against the envelope schema, appends, prints the new ID
   - `set-status <ID> <status> [--reopen-trigger "…"] [--enforcement-tier <tier>]` → validates the transition against the per-type state machine; **refuses `L → promoted` unless `--human-approved <D-ID>` is supplied** (the constitutional gate gets a mechanical seatbelt; the D-ID is the human's ratification record)
   - `task-event --task <id> --event <e> [--owner <name>] [--session <sid>] [--detail "…"]` → task-ledger line append (used by hooks, §3.3)
   - `reconcile --tasklist -` → reads TaskList JSON on stdin, diffs against the task ledger, prints the RES-2/RES-3 action list (§4.3)
2. **A PreToolUse deny** on `Edit|Write|MultiEdit|NotebookEdit` targeting `artifacts/context/ledger.md`, `task-ledger.md`, `decision-log.md` — **for every agent identity**, with path normalization per F-017. This is the deterministic half: direct edits to serialized files are structurally impossible; the CLI is the only door. `project-brain.md` is exempt (single-writer by protocol — the orchestrator; body is prose the CLI shouldn't own). `team-assembly-log.md` is exempt pending its Fork C disposition (human-queue item 3).

**Fork A interaction (the pinned-script pattern):** the orchestrator loses `Bash(node:*)` but gains `Bash(node .claude/bmad/bin/record.cjs:*)` (and nothing else under `bin/`). This is safe because the write-gate already denies the orchestrator writes to `.claude/**` — it can execute the pinned script but never modify it. This pattern (deny-general-interpreter, allow-pinned-vetted-script) is the reusable answer to "the narrowed orchestrator still needs deterministic helpers" and should be stated in ADR-017 at ratification (one-paragraph amendment, flagged in §7).

### 3.3 Hook-written coordination state (the task-ledger writer decision)

ADR-018 assumed the orchestrator/teammates append task-ledger lines by protocol. This design upgrades that: **`PostToolUse` hooks on `TaskCreate|TaskUpdate|SendMessage` append the lifecycle lines** by invoking `record.cjs task-event` with fields read from the hook payload (`tool_input`/`tool_response` carry task id, status, owner; the payload carries `session_id`). Prompted appends remain only for events no tool call expresses (none currently identified).

Why: a hook is a *guaranteed event-driven writer* — the exact survival property D-037 is built on. A prompted append is a behavioral contract (RES-10's critique). The ledger becomes trustworthy input for reconciliation precisely because no LLM diligence is in its write path.

Caveat (honest): `PostToolUse` payload shapes for these three tools are **not spike-verified**. This is the one new platform assumption Phase 2 introduces; it gets a half-day live check at the top of SE-2 (§6). Degradation if it fails: fall back to ADR-018's prompted appends for the events hooks can't see, keep hook-written for TaskCompleted/TaskCreated (verified events).

### 3.4 The hooks-generator split (SE-1 prep commit, serialized)

`generators/hooks-generator.js` embeds all hook sources inline (387 lines today; Phase 2 adds four hooks and modifies two). One mechanical refactor lands **first, alone**: extract each hook's source into `generators/hooks/<name>.cjs.src` (verbatim string → file; generator reads + concatenates the shared header), with a content-equality test asserting generated output is byte-identical pre/post refactor. After it, every track owns disjoint hook files. Estimated half a day including tests. Nothing else in SE-1 starts on `hooks-generator.js` until this merges.

### 3.5 Enforcement-class labels (D-039 compliance, stated once)

| Mechanism | Class |
|---|---|
| Replay gate Tier-0 (exit-2 TaskCompleted re-execution) | **Enforcement** (deterministic replay) |
| PreToolUse denies (write-gate, serialized-files deny, narrowed allow-list) | **Enforcement** (PreToolUse deny) |
| Evidence-block *presence*, brain budget, ledger line shape, assembly block | Advisory lint — labeled as such in every message the hooks emit |
| Reviewer addendum concreteness, synthetic-fixture judgment | Tier-1 judgment (reviewer) |
| Wake-ack, single-wake, no-self-claim | Behavioral contract (protocol text) — unchanged class, now *audited* by the hook-written ledger |

---

## 4. Piece designs

### 4.1 Piece 1 — Unified record ledger (D-036 / ADR-021)

**New files:**
- `utils/record-envelope.js` — the schema module: parse/serialize the fenced-YAML entry format (§3.1); validate an envelope object (types, required fields, `fingerprint` required for L/F, `reopen_trigger` required on rejected R); the per-type status state machines as data (`TRANSITIONS = {L: {observed: ['recurring'], …}}`); the evidence-item schema with the single status vocabulary `checked|cited|attested|assumed`. **This module is the one source of truth** — the replay gate, the appender CLI, the validator, and (Phase 4) the promotion flows all import it. A mirror schema doc ships to `.claude/bmad/methodology/artifact-schemas/record-envelope.md` for agent consumption (generated or hand-kept-with-test, same discipline as the Phase 1 single-sourcing).
- `utils/ledger.js` — locking + atomic read-modify-write + ID allocation (§3.2 internals; the CLI is a thin argv wrapper).
- `bin/record.cjs` (package) → shipped to `.claude/bmad/bin/record.cjs` by the methodology generator.
- `scripts/migrate-context-files.js` — one-shot migration: `findings-register.md` → F-records in `ledger.md` (each existing F-NNN keeps its number; `fingerprint:` assigned where the finding text names a recurring class, else a per-finding slug); `lessons-learned.md` → L-records at `observed` (or `recurring` where the text already documents ≥2 occurrences — the synthetic-fixture lesson enters at `recurring`, per vision §4.2); originals replaced by a pointer stub for one release, then deleted (WS-11 migration-table entry).

**Evidence-item schema** (frozen here; both SE-1 tracks build against it):

```yaml
- id: E-1                     # unique within the bundle/record
  kind: test-run | command | file-exists | citation | fixture-provenance | human-attested | assumed
  status: checked | cited | attested | assumed
  # kind-specific:
  cmd: "npm test"             # test-run/command
  expect: {exit: 0}           # test-run/command
  cwd: "."                    # optional, relative to repo root
  paths: [src/a.js]           # file-exists
  ref: "path/file.md:47"      # citation (file form)  |  url: "https://…" (url form)
  fixture: tests/fixtures/x.json          # fixture-provenance
  captured_from: "…" # OR synthetic: true # fixture-provenance — one is REQUIRED
  claim: "…"                  # assumed/human-attested
  attested_by: "<human name>" # human-attested
```

**Five-file cap enforcement:** a `validate` check (advisory lint) that `artifacts/context/` contains exactly the five standing files (per-date files matching `*-20??-*` are flagged for `artifacts/delivery/`).

**Tests (unit, no live session needed):** envelope round-trip; every legal/illegal status transition per type; L→promoted refused without `--human-approved`; ID allocation under 20 concurrent `append` processes (spawn real child processes against a tmp ledger — this is the RES-6 regression test); lock steal after stale timeout; atomic-write crash simulation (kill child mid-write, assert old content intact); migration script golden-file test against a copy of the real `findings-register.md`.

**Exit criteria:** `ledger.md` exists with all migrated F/L records and validates; the concurrency test passes; `validate` runs the cap + envelope checks green; no agent-writable path to the serialized files except the CLI (PreToolUse deny verified by hook unit tests).

### 4.2 Piece 2 — Replay gate v1 (ADR-022 / Fork C)

**Trigger:** `TaskCompleted` hook (`generators/hooks/replay-gate.cjs.src` → `.claude/hooks/replay-gate.cjs`), registered in the hooks config. Spike-verified semantics: exit 2 → TaskUpdate returns `success:false`, status never lands, stderr reaches the completing agent verbatim.

**Task binding (how the hook finds the evidence).** The payload guarantees `task_id` + `task_subject` + `task_description` and nothing else (no owner in solo sessions). Convention, enforced deterministically:
- A task is **gated** iff its description contains a line `gate: replay`. Gated tasks MUST also carry `evidence: <path/to/bundle.yaml>`.
- The orchestrator's task templates (identity doc) add both lines for implementation-story, bug-fix, and review-verdict tasks.
- **Closing the unmarked-task gap:** a `TaskCreated` hook (same source file, second event registration) exits 2 on tasks whose owner name matches `^dev` or whose subject matches the story pattern (`story-\d+`) when the `gate: replay` marker is absent — message: "developer story tasks must carry `gate: replay` + `evidence:`". This makes gate coverage deterministic for the classes v1 covers instead of protocol-dependent. Scope of gated classes in v1 is a human knob (§7 item 4).
- Ungated tasks exit 0 untouched — coordination tasks never hit the gate.

**Evidence bundle** = sidecar YAML next to the artifact (`<artifact>.evidence.yaml`), shape:

```yaml
evidence_bundle:
  artifact: artifacts/implementation/stories/story-014.md
  produced_by: developer
  worktree_ref: <branch@sha>        # optional; if present, replay runs there
  items: [<evidence-item schema, §4.1>]
  reviewer_addendum:                # required only for review-verdict tasks
    failure_scenarios_attempted: ["…concrete, replayable phrasing…"]
    refutations_found: []
```

**Tier-0 checks (all deterministic, run in the hook, in order, first failure exits 2 with `E-n: <reason>` on stderr):**
1. Bundle exists at the declared path and parses against the schema (missing/malformed → blocked with the convention spelled out — the agent can self-serve the fix).
2. `file-exists`: every path stat'd (the Vantage 22-fabricated-paths class, for zero tokens).
3. `test-run`/`command`: re-executed, exit code must equal `expect.exit`. Guardrails: **command must prefix-match the `replay.allowed_commands` list in `swarm.yaml`** (see below); per-command timeout (`replay.timeout_seconds`, default 300); spawned with `shell: false` after argv tokenization; `cwd` confined inside the repo/worktree (realpath prefix check, F-017 discipline).
4. `citation` (file form): file exists and, when `:line` is given, has ≥ that many lines. `citation` (url form): **advisory in v1** — resolved with a 5 s HEAD fetch, failures logged, never blocking (network flake must not gate completion; posture knob `replay.url_citations: advisory|blocking|skip`).
5. `fixture-provenance`: every item has `captured_from` XOR `synthetic: true` (presence check only — whether synthetic-on-external-path blocks is Tier-1 reviewer judgment, per the ADR-015 reclassification).
6. Review-verdict tasks: `reviewer_addendum.failure_scenarios_attempted` non-empty — **labeled advisory lint in the message** (presence is gameable; concreteness is Tier-1).

**Every Tier-0 rejection appends an F-record** via `record.cjs` (`fingerprint: replay-<check>-failure`, evidence = the failing item + reason). This is "the ledger of what it refused" — it ships in v1 because it is one CLI call and it is the product's receipt.

**swarm.yaml addition:**

```yaml
replay:
  allowed_commands: ["npm test", "npm run test:"]   # prefix match
  timeout_seconds: 300
  url_citations: advisory
```

The declared-command allowlist is the L-2 answer: the hook executes only human-configured command shapes, not agent-invented ones. Residual risk: `swarm.yaml` is teammate-writable; adding `swarm.yaml` to the write-gate's protected set for the *orchestrator* is free (it already never edits it), but denying teammates would break init-time flows — v1 accepts the residual and states it; escalation path in §7 item 5.

**D-002 supersession:** on SE-1 completion the orchestrator presents the human with the supersession D-ID (queue item 12): "D-002 superseded by D-0xx per spike 1 + ADR-022; the resurrected hook is a replay trigger under a command allowlist, not an ambient test runner." The decision-log entry for D-002 gains the pointer only when the human approves.

**Degradation path (spike assumption breaks later — e.g., a CLI upgrade drops the event):** the Tier-0 engine lives in `utils/evidence.js` + a callable wrapper `.claude/bmad/bin/replay-check.cjs <bundle>`; the hook is a thin adapter. `doctor` gains a canary check (create a throwaway task in a scratch store is not possible offline, so: verify the installed CLI's hook-event enum still contains `TaskCompleted` by version pin — re-pin on CLI major versions, per the spike doc's own caveat). If the hook goes dark: reviewer brief + orchestrator protocol already instruct running `replay-check.cjs` pre-approval — same checks, weaker trigger, zero redesign.

**Tests:** `utils/evidence.js` fully unit-testable against fixture bundles (each check, pass + fail + malformed); allowlist prefix matcher; timeout kill; cwd confinement (attempt `../` escape); hook adapter tested by piping spike-format payloads on stdin and asserting exit codes/stderr (the spike captured the real payload shape — use it verbatim as the fixture). **Live checks (§6):** one scripted end-to-end in a throwaway session (blocked completion → fix bundle → completion lands), and `teammate_name` population in a real team session (spike flag #3).

**Exit criteria:** live E2E passes both directions; a rejection F-record lands in `ledger.md`; `TaskCreated` marker enforcement blocks an unmarked dev-story task; degradation script produces identical verdicts to the hook on the same fixtures (shared-engine test).

### 4.3 Piece 3 — Task ledger + liveness (ADR-018, RES-1/2/3/9)

**`artifacts/context/task-ledger.md`** — append-only, one line per event, no prose (D-036 file #4):

```
2026-08-13T10:00:00Z session=abc123 task=12 event=created owner=dev-auth subject="story-014 [gate: replay]"
2026-08-13T10:00:04Z session=abc123 task=12 event=woken owner=dev-auth
2026-08-13T10:00:31Z session=abc123 task=12 event=in_progress owner=dev-auth
2026-08-13T11:42:10Z session=abc123 task=12 event=completed owner=dev-auth
```

Event vocabulary: `created | assigned | woken | in_progress | blocked | completed | failed | rejected | retry | respawned`. `session=` on every line is the RES-6 session binding — reconciliation can distinguish "this session's wake" from a concurrent session's.

**Writers:** PostToolUse hooks per §3.3 (`task-ledger-writer.cjs`): `TaskCreate` → `created` (+`assigned` when owner set); `TaskUpdate` → the status it set (`in_progress` here is the wake-ack landing durably); `SendMessage` → `woken` when the message targets a task owner (heuristic: message references the task id — if the payload proves too thin in the live check, `woken` falls back to a prompted orchestrator append via `record.cjs task-event`, the only prompted write in the system). All lines go through `record.cjs task-event` (lock + atomic append).

**Wake-ack (RES-3):** teammate protocol text (generated agent docs + `.claude/agents/*.md`): "on receiving your start message, your first tool call is TaskUpdate → `in_progress`." With the PostToolUse writer, `pending` + no `in_progress`/`woken` line = not-yet-woken, authoritatively.

**Reconciliation (RES-2/RES-4/RES-5):** `record.cjs reconcile` — pure logic in `utils/reconcile.js` (`reconcile(taskListJson, ledgerLines, brainFrontmatter) → {rewake[], stuck[], awaitingHuman[], staleness}`), unit-testable exhaustively. Invoked in the warm boot (Fork D `initialPrompt` step 3, and the `SessionStart(compact)` injection): the orchestrator runs the pinned script, gets a machine-generated action list, acts on it. Actions: re-wake unblocked `pending` tasks with no `woken` entry (protocol-legal per RES-3 analysis); surface `in_progress` tasks with no ledger activity since the last reconciliation as liveness candidates; surface `awaiting-human` gates from brain frontmatter first.

**Liveness carve-out (RES-1):** protocol amendment in the orchestrator identity, exactly as ADR-018 point 3: event-driven reconciliation on every completion message; for a stuck owner — one liveness ping, then mark `failed` + `respawned` (ledger events) and respawn with the same task pointer. The `in_progress` no-message rule gains the carve-out sentence ("…whose owner is live; a post-reconciliation liveness probe is required, not spam").

**RES-9 fix (same protocol edit):** rejection handling now reads "create the fix task assigned to the original developer AND a re-review task assigned to the reviewer, blocked on the fix task" — the dead blocking-edge wording is deleted.

**Machine-state cutover (D-037, SE-3):** `utils/brain-state.js` reads/writes brain frontmatter (atomic rename; body bytes untouched on frontmatter-only writes). `phase-machine.js` is reduced to a shim over it, then deleted; `cli/status.js`, `cli/doctor.js`, `cli/validate.js`, generators, and `phases.yaml` references migrate; `project.yaml` deleted from templates + scaffolds with a WS-11 migration-table entry (`update` converts an existing project.yaml's phase into brain frontmatter, then removes it). `status` additionally learns to read the task ledger (closing RES-4's "status is task-blind").

**Tests:** reconcile pure-function matrix (every RES scenario as a fixture: compaction-mid-wake, lost wake, dead teammate, awaiting-human, two-session interleave); ledger line parse/serialize; brain-state atomic frontmatter writes; migration of a project.yaml fixture. **Live:** PostToolUse payload verification (§6, top of SE-2); the full field test (§6, end of SE-3).

**Exit criteria:** kill a teammate mid-task in the field test and watch reconciliation respawn it; close the terminal mid-epic and resume with zero human reconstruction; `project.yaml` gone and no code path references it; D-041's field-test mandate satisfied and written up.

### 4.4 Piece 4 — Project brain v1 (continuity doc §1–§5)

**File:** `artifacts/context/project-brain.md`, schema exactly as continuity §1.1 (identity ≤5 sentences · mental model ≤8 bullets · load-bearing facts ≤10 with pointers · active threads ≤6 · dead ends ≤6 · open questions ≤5 · fixed pointer block), frontmatter `schema: project-brain/1`, `checkpoint`, `phase`, `gates:` (the D-037 machine-state home), `staleness`. Budget ~2,500 tokens enforced as **advisory lint** (word-count proxy in `validate` + the checkpoint ritual; over-budget = the checkpoint instruction demands an eviction pass — honestly labeled, per §3.5).

**Writers:** orchestrator only (single-writer file — exempt from the serialized-CLI deny). Three write moments: write-on-surprise (protocol text: the trigger list from continuity §2.1 goes in the orchestrator identity); gate-checkpoint ritual (phase transitions bump `checkpoint:`); PreCompact flush.

**Hooks (three, all spike-verified primitives):**
- `pre-compact-flush.cjs` — **always exit 0** (spike caveat: exit 2 blocks auto-compaction and can pin a session at the ceiling — blocking is forbidden here). stdout = steering: "Before compacting: update `project-brain.md` per its schema with anything load-bearing since checkpoint N [frontmatter included in the instruction]. Then summarize the transcript AS A DELTA against the brain — omit anything the brain already holds." This is the safe subset *plus* the first slice of schema-driven compaction, which spike 2 verified stronger than the vision assumed.
- `post-compact-audit.cjs` — reads `compact_summary` from the payload, appends a one-line audit entry (ledger `task-event` channel, `event=compaction`) with a checked/missing verdict on the steering tokens. Free verification loop the vision didn't know existed.
- `SessionStart` (matchers `startup|compact`) — injects the brain frontmatter + the warm-boot sequence (identity is native under Fork D; then: read brain in full → run `record.cjs reconcile` → read-back handshake → act).

**Read-back handshake:** protocol text in the orchestrator identity, verbatim from continuity §3.2 (≤6-line state read-back before acting; converts silent staleness into a 10-second correction).

**Pointer verification:** `doctor` gains a brain check — every file path in the brain resolves, every cited D-ID exists in the decision log (the continuity §2.5 anti-fabrication guard; Vantage's 22 fabricated paths are the motivating incident). Deterministic, unit-testable.

**Eviction handoff (deferred interface):** the checkpoint ritual's eviction instruction says "durable lesson → `record.cjs append --type L`" (fingerprint required, enters at `observed`). The instruction ships in Phase 2; the *volume* of L-minting is a Phase 4 concern. No new machinery needed — the CLI from Piece 1 is the whole interface.

**Tests:** frontmatter parse/atomic write (shared with brain-state.js); budget lint; pointer-resolution check against fixture brains (valid, broken-path, broken-D-ID); hook stdout content tests (steering text contains the schema + checkpoint); PostCompact audit line format. **Live:** one manual `/compact` in a throwaway session asserting the flush fires and the summary honors the delta instruction (repeat of spike 2 with the real prompt text).

**Exit criteria:** two-brain probe run once (continuity §5.3): a throwaway agent reading only brain + cold stores answers the comprehension questions to human satisfaction; warm boot performs read-back on a real session start.

### 4.5 Piece 5 — Fork A permission narrowing (ADR-017, F-016/F-017/F-018/F-020)

**Template changes (`templates/settings.json.template`):**
- Remove from allow: `Bash(npm:*)`, `Bash(node:*)`, `Bash(npx:*)`, `Bash(echo:*)`, `Bash(cat:*)`.
- Keep/add read-inspection: `Bash(ls:*)`, `Bash(pwd)`, `Bash(git status:*)`, `Bash(git log:*)`, `Bash(git diff:*)`, `Bash(git show:*)`, `Bash(git branch:*)` (replacing blanket `git:*` — `git push`/`reset` fall out of the allow and hit the deny/tripwire; `cat` is redundant with the Read tool).
- Add the pinned scripts: `Bash(node .claude/bmad/bin/record.cjs:*)`, `Bash(node .claude/bmad/bin/replay-check.cjs:*)` (§3.2 pattern; safe because `.claude/**` is write-denied to the orchestrator).
- Deny-list re-labeled in comments/docs as typo tripwire, not a control (ADR-017 point 4).
- Teammate settings are untouched (teammates legitimately hold interpreters; A3 stack-aware allowlists are the follow-on, out of Phase 2 scope).

**Write-gate (`generators/hooks/orchestrator-write-gate.cjs.src`) changes:**
- Matcher extended to `Edit|Write|MultiEdit|Bash|NotebookEdit`. For `Bash` under the orchestrator identity: deny commands matching write-shapes (`>`/`>>` redirection outside `/tmp` and the scratchpad, `tee`, `sed -i`, `dd of=`, `mv`/`cp` into repo paths, heredoc into a file) — defense-in-depth behind the narrowed allow-list, so its false-negative rate is not load-bearing.
- **F-017 fix:** `path.resolve` the target against the repo root, then prefix-check against the resolved allow roots; reject any raw path containing `..` before resolution; config files matched as exact repo-root basenames. The bypass cases in the finding (`src/artifacts/x.js`, `notes-artifacts/`, `…/artifacts/../.claude/settings.json`) become the regression fixtures.
- `settings.local.json` moved to the denied set for the orchestrator identity (F-020; recovery path becomes human-only).
- The serialized-files deny (§3.2 half 2) lives in this same gate (it already intercepts the right tools and has the identity logic).

**Tests:** settings-generator golden file; write-gate unit matrix — every F-017 bypass case denied, allowed paths still allowed, Bash write-shapes denied for orchestrator + passed for teammates, serialized files denied for all, pinned-script Bash allowed. All stdin-driven `.cjs` tests, no live session needed. **Live:** one manual sanity pass in a scaffolded throwaway (orchestrator session: `node -e` prompts, `record.cjs` runs clean).

**Exit criteria:** all four security findings (F-016 orchestrator-shell family, F-017, F-018, F-020) closeable in the register with the fix commit as evidence; release note drafted (behavior change for every scaffolded project — ships with the WS-11 update path, per ADR-017 consequences).

---

## 5. Sub-epics and the recommended first slice

### SE-1 — Substrate + narrowed shell ★ RECOMMENDED FIRST

**Why this slice:** it is the maximal set that (a) depends on nothing else in Phase 2, (b) unblocks everything else (the envelope binds every future record write — D-036 says decide-before-first-write, and Phase 2's own hooks want to write records; Fork A makes ADR-022's security story true; the replay gate is the trust anchor the whole reinvention leans on), and (c) is honest to ship alone — after SE-1 the product already refuses unproven work and has receipts, even if the session then pauses for weeks. Fork A alone would be a quicker win but wastes the parallel capacity; ledger+gate without Fork A ships the gate with its security rationale hollow.

**Sequencing inside SE-1:** one serialized prep commit, then three disjoint tracks.

| Track | Scope | Files owned (disjoint) | Size |
|---|---|---|---|
| **prep** (serialized, first) | §3.4 hooks-generator split | `generators/hooks-generator.js`, `generators/hooks/*.cjs.src` (creation), byte-identity test | 0.5 d |
| **T1 — Fork A** | §4.5 | `templates/settings.json.template`, `generators/settings-generator.js`, `generators/hooks/orchestrator-write-gate.cjs.src`, `test/settings-generator.test.js`, `test/hooks.test.js` (gate sections) | 1–1.5 d |
| **T2 — Envelope + ledger** | §4.1 + §3.2 CLI | `utils/record-envelope.js`, `utils/ledger.js`, `bin/record.cjs`, `scripts/migrate-context-files.js`, `.claude/bmad/methodology/artifact-schemas/record-envelope.md`, methodology-generator ship-list line, new test files | 2 d |
| **T3 — Replay gate** | §4.2 | `generators/hooks/replay-gate.cjs.src`, `utils/evidence.js`, `bin/replay-check.cjs`, `swarm.yaml` schema addition (`utils/config.js` replay block), orchestrator task-template text, new test files | 2 d |

Cross-track interfaces, frozen by this doc: the evidence-item schema (§4.1) and the `record.cjs append`/`task-event` argv contract (§3.2). T3 imports `utils/record-envelope.js` (T2) for schema validation and calls `record.cjs` for rejection F-records — if T2 lags, T3 stubs against the frozen schema and wires the import at integration. T1 and T3 both register hooks in the (post-split) config map — two one-line disjoint additions, no conflict. T3's serialized-files deny lands in T1's gate file: T3 hands T1 the path list (three constants), T1 owns the code.

**SE-1 exit criteria:** everything in §4.1/§4.2/§4.5 exit criteria, plus: `validate` green including the new checks; full test suite green; the live E2E (blocked → fixed → completed) recorded; D-002 supersession D-ID presented to the human; migration leaves `artifacts/context/` at five standing files + the two pointer stubs.

### SE-2 — Memory (brain + hook-written task ledger)

Opens with the **PostToolUse payload live check** (half day, gates the track split below).

| Track | Scope | Files owned | Size |
|---|---|---|---|
| **T4 — Brain core** | §4.4 file/schema/protocol/validate/doctor | brain schema doc (methodology), orchestrator identity text, `utils/brain-state.js` (shared with SE-3 by interface, owned here), `cli/validate.js` + `cli/doctor.js` brain checks, tests | 1.5–2 d |
| **T5 — Compaction hooks** | §4.4 hooks | `generators/hooks/pre-compact-flush.cjs.src`, `post-compact-audit.cjs.src`, SessionStart injection source, retire/absorb `post-compact-reinject.cjs` (Fork D made its identity half obsolete; its pointer half folds into SessionStart), tests | 1–1.5 d |
| **T6 — Task-ledger writers** | §4.3 writers + wake-ack text | `generators/hooks/task-ledger-writer.cjs.src`, `record.cjs task-event` (extends T2's CLI — sequence after SE-1), teammate protocol text in agent generator, tests | 1–1.5 d |

**Exit:** brain exists and warm-boots with read-back; flush verified live once; ledger lines appear from real tool calls in a throwaway team session; two-brain probe passes.

### SE-3 — Liveness + cutover (+ field test)

| Track | Scope | Files owned | Size |
|---|---|---|---|
| **T7 — Reconciliation + liveness** | §4.3 reconcile/carve-out/RES-9 | `utils/reconcile.js`, `record.cjs reconcile` subcommand, orchestrator identity protocol edits (liveness carve-out, rejection wording, warm-boot step 3), tests | 1.5 d |
| **T8 — Machine-state cutover** | §4.3 cutover | `cli/phase.js`, `cli/status.js`, `cli/doctor.js` (state reads), `utils/phase-machine.js` removal, project.yaml template removal, `cli/update.js` migration, WS-11 table entry, tests | 1.5 d |
| **Field test** (serialized, last) | D-041 mandate | run one real project epic on the built stack; kill a teammate mid-task; close terminal mid-epic; resume; write up | 1 d |

**Exit:** §4.3 exit criteria; field-test writeup filed; `team-assembly-log.md` disposition executed per the human's §7 answer.

Total estimate: ~13–16 dev-days wall-clockable to roughly 6–8 days with the parallel tracks.

---

## 6. Live-check vs unit-testable ledger

| Item | Class | When |
|---|---|---|
| Envelope, ledger locking/IDs, Tier-0 engine, write-gate matrix, reconcile logic, brain checks, migrations | Unit (fixtures, child processes, stdin-driven hooks) | continuous |
| TaskCompleted E2E block/unblock + rejection F-record | **Live** (scripted throwaway, spike-1 method) | SE-1 T3 exit |
| `TaskCreated` marker enforcement | **Live** (same session) | SE-1 T3 exit |
| Narrowed orchestrator sanity (`node -e` prompts; pinned script runs) | **Live** (manual, 15 min) | SE-1 T1 exit |
| **PostToolUse payload shapes for TaskCreate/TaskUpdate/SendMessage** | **Live — the one new platform assumption in Phase 2** | SE-2 opening gate |
| `teammate_name` in real team sessions (spike flag #3) | **Live** | first orchestrated run with the gate on |
| PreCompact flush with production prompt + PostCompact audit | **Live** (repeat spike-2 method) | SE-2 T5 exit |
| SessionStart `compact` matcher injection | **Live** (same session) | SE-2 T5 exit |
| Full resilience field test (teammate kill, terminal close, resume) | **Live** (real project) | SE-3 close, release-gating |

---

## 7. Human decision points

1. **Ratify ADR-017, ADR-018, ADR-021, ADR-022** (all PROPOSED; Forks are ratified per D-042 but the ADRs themselves await approval) — with the one-paragraph ADR-017 amendment for the pinned-script pattern (§3.2).
2. **Mint the D-002 supersession D-ID** (queue item 12) — spike evidence is in hand; presented at SE-1 close before the hook ships to scaffolds.
3. **`team-assembly-log.md` disposition** (D-036 file #5): Fork C reframed the gate as declared-intent lint. Recommend: keep the file, rename the hook's messaging (already done in Phase 1 per the lint text), and keep it as the fifth standing file. Alternative: fold assembly blocks into the task ledger and retire the file — needs a sentence from the human.
4. **Replay-gate v1 gated classes:** recommend implementation-story + bug-fix + review-verdict tasks (the field's highest-fabrication classes). Widening to research/PRD artifacts (citation-heavy) is a knob, not a rebuild.
5. **`swarm.yaml` `replay.allowed_commands` residual risk:** v1 leaves swarm.yaml teammate-writable (a teammate could widen the allowlist, then declare a malicious "test"). Accept for v1 (stated in the ADR-022 consequences), or direct us to write-protect the `replay:` block now (costs: a parse-and-diff check in the write-gate, ~0.5 d). Recommend: accept for v1, revisit with A3 stack-aware allowlists.
6. **Approve the orchestrator read-inspection allow-list** (§4.5 list) — tactical in content but it is a behavior change for every scaffolded project on next `update`; the release note ships with it.

## 8. Tactical decisions made in this design (for the orchestrator to log as D-IDs)

- Storage format: fenced-YAML records in markdown, status-in-place edits, git as transition history (§3.1).
- Serialized-write channel: pinned CLI + PreToolUse deny on the three serialized files; brain exempt as single-writer (§3.2).
- Task ledger written by PostToolUse hooks, not prompted appends, wherever payloads allow (§3.3) — degradation to prompted appends named.
- Evidence bundles as sidecar YAML; task binding via `gate: replay` + `evidence:` description lines; TaskCreated marker enforcement for dev-story classes (§4.2).
- URL citations advisory in v1 (§4.2 check 4).
- Hooks-generator source split as SE-1 prep (§3.4).
- `post-compact-reinject.cjs` retired into SessionStart injection under Fork D (§SE-2 T5).
