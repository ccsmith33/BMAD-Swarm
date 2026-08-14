# L-5 Promotion: Parallel-by-Default — Design + Staged Implementation (2026-08-13)

- **Status:** PROPOSED — AWAITING HUMAN PROMOTION SIGN-OFF. Everything in this document and on the branch is a proposal; nothing merges without the human's explicit promotion approval.
- **Author:** architect (L-5 promotion spawn)
- **Branch:** `l5-parallelism-promotion` (off `reinvention/phase3-integration` @ `08cbfd3`)
- **Governing record:** ledger **L-5** (`artifacts/context/ledger.md`), fingerprint `orchestrator-over-conservative-autonomy`, links D-050. This document implements L-5's "STRUCTURAL FIX (promote, human-gated)" clause.

---

## 1. The problem, and why prose alone doesn't fix it

Twice in one session the orchestrator (a) serialized SE-3 and Phase 3 although they had no data dependency, and (b) stopped after the named target although adjacent, fully reversible, branch-isolated work was ready. Root cause (L-5): in autonomous mode the orchestrator over-weights a safe/tidy stopping point and reads a stated sequence/scope as a **ceiling**.

The human's challenge: *"your understanding of it dies with this session; every new project starts at 0% context — how do we ACTUALLY fix it?"* A lesson that lives only in this session's ledger is dead on arrival for the next project. The promotion ladder's durable rungs are:

1. **Structural** — make the tool's shape encode the rule, so following it requires no memory. (Strongest: works even for a model that never read the lesson.)
2. **Init-time compilation** — bake the rule into the generated scaffold, so every `bmad-swarm init` project is born with it at 0% context.
3. Prose in a live session's artifacts — weakest; dies with the session.

This promotion takes rungs 1 and 2 simultaneously: a schema-level `Depends-On` convention where **independence is the default and serialization must justify itself** (structural), plus the heuristic compiled into the shipped orchestrator/strategist identities and methodology (init-time). Rung 3 is already done (the ledger entry).

## 2. The structural mechanism: `## Depends-On:` — independent by default

### 2.1 Convention

A story file gains one optional machine-readable heading, mirroring the existing `## Domain:` field:

```markdown
## Depends-On: 2.1 (reads the Track schema created there), 1.2 (needs the auth decision D-012)
```

Semantics — this is the inversion that makes "serial must justify itself" the shape of the tool:

- **Absent (the normal case):** the story has NO dependency edges. Its task is created unblocked and fans out concurrently with every other story.
- **Present:** each entry is `<epic>.<story> (<named reason>)`. The parenthesized reason is **required, not decorative** — it is L-5's "if you can't name the dependency, they run concurrently" compiled into a validator rule. A reason-less entry fails `bmad-swarm validate`.
- The prose `### Dependencies` block under Dev Notes keeps its human-context role but carries **no scheduling semantics**.

### 2.2 Who produces / consumes it

| Actor | Role |
| --- | --- |
| **strategist** | Sets the field at story-creation time, only for nameable dependencies (new behavioral rule in `agents/strategist.md`). |
| **validator** (`bmad-swarm validate`) | Enforces the named-reason rule via a new spec-driven `conditional_patterns` capability (present-implies-well-formed). |
| **orchestrator** | At `TaskCreate` time, blocks a story task only on the stories in its `## Depends-On:` field (or an equally nameable reason stated in the task description); everything else is created unblocked and owners are spawned in the same batch (new Coordination-discipline rule). |
| **reviewer / human** | "Phantom sequencing" (an edge with no nameable reason) is a named defect in the story schema's Common Failures list. |

### 2.3 Exact changes (all staged on the branch)

1. **`methodology/artifact-schemas/story.md`** — `## Depends-On:` added to Expected Structure; a "### Depends-On (optional)" guideline section (format table, named-reason rule, relationship to Dev Notes); Quality Checklist line ("declared only for nameable dependencies"); "Phantom sequencing" added to Common Failures.
2. **`methodology/artifact-schemas/spec.yaml`** — story class gains:
   ```yaml
   conditional_patterns:
     - name: depends-on-named-reason
       if_regex: "^## Depends-On"
       must_regex: "^## Depends-On:\\s*\\d+\\.\\d+\\s*\\([^)]+\\)(\\s*,\\s*\\d+\\.\\d+\\s*\\([^)]+\\))*\\s*$"
       message: "Depends-On entries must be story IDs each carrying a named reason, …"
   ```
3. **`utils/artifact-validator.js`** — new `checkConditionalPatterns(content, patterns, issues)`: if `if_regex` matches, `must_regex` must too; absence passes untouched. Generic spec capability ("optional, but well-formed when present"), reusable for future optional fields.
4. **`agents/orchestrator.md`** (Coordination discipline) — see §3.
5. **`agents/strategist.md`** — story-quality criterion reworded ("Dependencies between stories are DECLARED, not implied …") + new behavioral rule "**Declare dependencies; never imply them with ordering.**" (numbering communicates reading order, not execution order).
6. **`methodology/artifact-schemas/epic.md`** (Story Sequencing) — "Ordering communicates reading/priority order, not execution order: execution edges come only from each story's `## Depends-On:` field. Stories without declared dependencies are independent by default and run in parallel."
7. **`test/validate.test.js`** — three new tests: well-formed Depends-On passes; reason-less entry fails; mixed (one entry with, one without a reason) fails. Field-absent behavior is pinned by every pre-existing passing story fixture.

Nothing here is a breaking change: the field is optional and additive; every existing story validates unchanged.

## 3. The prose heuristic compiled into the shipped orchestrator identity

Two edits inside `agents/orchestrator.md` → `## Coordination discipline` (kept tight — this ships in every scaffold):

**New bullet (parallel-by-default), verbatim:**

> **Parallel by default (L-5).** Tasks are independent unless a dependency is DECLARED. A sequencing edge requires a NAMED reason — task B reads task A's output, or task B needs a decision task A produces. If you cannot name the dependency, the tasks run concurrently. At `TaskCreate` time this is mechanical: block a story task only on the stories in its `## Depends-On:` field (or an equally nameable reason stated in the task description); create every other task unblocked and spawn their owners in the same batch. Never serialize because it feels tidy or cautious.

**Counterweighted idle rule (replaces the bare "Idle waiting is correct behavior while teammates work."), verbatim:**

> Idle waiting is correct behavior while teammates work — but park only IRREVERSIBLE actions (merge to main, publish, destructive ops) on a human gate. Keep ALL reversible work moving: branch commits, teammate spawns, the next unblocked task. Read a stated scope as a FLOOR, not a ceiling — when the intent is "keep making progress", continue past the named target onto adjacent reversible work.

Both are testable in the field: an orchestrator serializing without a nameable edge, or idling on reversible work, is now violating its identity text, not just folk wisdom.

## 4. How this reaches 0%-context projects (the point of the promotion)

Every changed surface is a **shipped** surface — verified end-to-end on this branch with a throwaway `bmad-swarm init -y` scaffold:

| Change | Delivery vehicle | Verified |
| --- | --- | --- |
| `agents/orchestrator.md`, `agents/strategist.md` | `generators/agent-generator.js` → `.claude/agents/{role}.md` at init/update | scaffolded orchestrator.md contains "Parallel by default (L-5)" + "FLOOR, not a ceiling"; strategist.md contains the declare-dependencies rule |
| `artifact-schemas/story.md`, `epic.md` | `generators/methodology-generator.js` (`METHODOLOGY_SHIP_LIST`) → `.claude/bmad/methodology/` | scaffolded story.md documents Depends-On (8 mentions); epic.md carries the execution-order note |
| `spec.yaml` + `utils/artifact-validator.js` | the npm package itself (`package.json` `files`: `methodology/`, `utils/`) — `bmad-swarm validate` always runs the package's spec/validator, no scaffold copy involved | in the scaffolded project, a story with `## Depends-On: 1.1` (no reason) fails validate with the named-reason message; adding the reason passes |

So a brand-new project — zero conversation context, fresh model — is born with (a) an orchestrator whose identity says parallel-by-default/floor-not-ceiling, (b) a strategist that declares rather than implies dependencies, (c) a story schema and epic schema that document the convention, and (d) a validator that mechanically rejects unnamed serialization. The lesson no longer depends on anyone remembering it.

## 5. Test evidence

- Full suite in a fresh worktree of this branch: **820/820 pass** (`node --test`), including the 3 new Depends-On tests and the `spec.yaml ↔ schema` lockstep suite. (The F-28 non-hermetic failure set is already resolved at this branch's tip; the fresh-worktree run is clean.)
- Scaffold smoke: `init -y` + generated-content greps + live `validate` negative/positive Depends-On cases (all shown in §4).

## 6. Explicitly out of scope (deliberate)

- **No change to the task-ledger / `record.cjs reconcile` machinery** — the graph inversion happens at TaskCreate-time semantics + story schema; reconcile consumes whatever graph exists and needs no knowledge of why edges exist.
- **No cross-file dependency resolver** (e.g. validating that `2.1` in a Depends-On actually exists as a story file). Worth considering as a later `validate` enhancement; kept out to keep this promotion small and reviewable.
- **No epics.md machine-readable graph** — the story file is the single source of edges, consistent with "the story is the only document a developer needs".

## 7. Promotion ask

Approve merging branch `l5-parallelism-promotion` into the Phase 3 integration line. On approval, L-5's ledger status should move from `recurring` to `promoted` (structural fix shipped). Until then: **PROPOSED — AWAITING HUMAN PROMOTION SIGN-OFF.**
