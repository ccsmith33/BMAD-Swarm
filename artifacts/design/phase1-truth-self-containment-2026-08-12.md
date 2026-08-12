# Phase 1 Design — Truth Sweep (WS-5) + Self-Contained Scaffolds (WS-6)

- **Author:** architect
- **Date:** 2026-08-12
- **Status:** DESIGN — implementation by two parallel dev tracks (§6). No source outside `artifacts/` was modified by this design pass.
- **Inputs:** `artifacts/planning/reinvention-vision-2026-08-11.md` (§5 Phase 1, D-041, D-042), `artifacts/exploration/audit-2026-08-11-codebase.md` (CB-1, CB-3, CB-9), `artifacts/reviews/audit-2026-08-11-agent-prompts.md` (AP-8, AP-9, AP-10, AP-12), and a fresh verification pass over `utils/artifact-validator.js`, `methodology/**`, `generators/agent-generator.js`, `generators/commands-generator.js`, `utils/cost-estimator.js`, `utils/fs-helpers.js`, `utils/paths.js` (all reference locations below re-verified 2026-08-12).
- **Decision context:** implements Phase 1 of D-041 (npm publish is hard-gated on WS-5 + WS-6); implements the D-042 sharing model; supplies the content for ADR-E ("shipping the methodology subset into scaffolds", vision approval-queue item 9). Out of this slice: WS-5's non-schema truth items (write-policy AP-2, roster counts, model prose) — handled in P0/other tracks.

---

## 1. Scope and rulings at a glance

| # | Question | Ruling |
|---|---|---|
| R1 | CB-3: which of the three artifact-truth sources is authoritative? | `methodology/artifact-schemas/*.md` is the single truth. A colocated machine projection (`spec.yaml`) drives the validator. Quality-gates cease to be a structural source (§4). The 28 `validate` failures resolve by **correcting the validator to the schema** — zero story rewrites, one one-line artifact edit. |
| R2 | CB-1: how do generated projects stop referencing dev-repo-only paths? | Ship the load-bearing methodology subset (19 files, §3.3) into `.claude/bmad/methodology/` at init/update via a new generator using the existing hash-marker machinery; rewrite all repo-relative paths at generation time. `update` migrates existing scaffolds through the normal regeneration path. |
| R3 | AP-9: disposition of ~1,600 orphaned methodology lines | Ship-and-wire 19 files (incl. rescuing `testing-knowledge/`); keep 2 as repo-only reference; delete ~1,550 lines of true shelf-ware after folding their checklists into the schemas (§4). |
| R4 | CB-9: which entry-point list is authoritative? | The orchestrator invariant enum, extended to 13 values, exported as `utils/entry-points.js` and consumed by every other surface (§5). |

---

## 2. R1 — Artifact-schema single source (CB-3, WS-5)

### 2.1 The ruling

**`methodology/artifact-schemas/*.md` is the ONE authoritative source of artifact structure.** Rationale:

- It is the only source agents (Claude) can read as prose — and per R2 it now ships into every project, so producing agents and the validator finally grade against the same document.
- The validator's checks are demonstrably invented in three places (below) — it never had design authority.
- The quality-gates files conflict with the reviewer's live taxonomy (AP-8) and duplicate schema checklists; they are a judgment rubric, not a structure source, and are dissolved in §4.

The validator becomes a **derivation**: a new machine projection `methodology/artifact-schemas/spec.yaml` encodes, per artifact class, the required sections/patterns; `utils/artifact-validator.js` loads it from the package (`PACKAGE_METHODOLOGY_DIR`, already exported by `utils/paths.js`) and hardcodes nothing. A lockstep content-assertion test parses `spec.yaml` and asserts every required section name appears as a heading in the corresponding schema `.md`'s Expected Structure block — the prose and the machine spec cannot drift silently.

`spec.yaml` shape (pinned interface):

```yaml
# Machine projection of the artifact schemas. Lockstep test: artifact-spec.test.js
artifacts:
  prd:
    match: { basename: "prd.md" }
    required_sections: ["Executive Summary", "Success Criteria", "Product Scope", "User Journeys", "Functional Requirements", "Non-Functional Requirements"]
    required_patterns:
      - name: numbered-frs
        regex: "FR-\\d+"
        message: "Functional requirements must be numbered (FR-NNN)"
  product-brief:
    match: { basename: "product-brief.md" }
    required_sections: ["Vision Statement", "Problem Statement", "Target Users", "Core Capabilities", "Success Metrics", "Scope Boundaries"]
  architecture:
    match: { basename: "architecture.md" }
    variants:
      delta:
        discriminator: "^(\\*\\*)?scope(\\*\\*)?:\\s*(\\*\\*)?delta"   # case-insensitive, multiline
        required_sections: ["Overview"]
        required_patterns:
          - name: decision-references
            regex: "ADR-\\d{3}|D-\\d{3}"
            message: "Architecture must reference its decisions (ADR-NNN or D-NNN)"
      full:
        required_sections: ["Technology Stack", "System Architecture", "Data Models", "API Design", "Key Architectural Decisions"]
  story:
    match: { pathIncludes: "stories", basenamePrefix: "story-" }
    required_sections: ["Acceptance Criteria"]
    required_patterns:
      - name: acceptance-criteria-format
        regex: "(\\bGiven\\b[\\s\\S]*\\bWhen\\b[\\s\\S]*\\bThen\\b)|(- \\[[ x]\\] ?AC\\d+)"
        message: "Acceptance criteria must be BDD (Given/When/Then) or verifiable checklist ACs (- [ ] ACn:)"
      - name: task-checklist
        regex: "- \\[[ x]\\]"
        message: "Missing task checklist"
  generic:
    required_patterns:
      - name: has-heading
        regex: "^# "
      - name: non-trivial
        min_length: 50
```

Matching semantics: `required_sections` match **headings** (`##`/`###`, tolerant of `## 2.`-style numbering and bold variants), replacing today's substring-anywhere matching (`content.toLowerCase().includes(...)`, `utils/artifact-validator.js:92-118`), which passes on accidental prose mentions and is not a check at all.

### 2.2 Where the current validator invented requirements (the corrections)

| Validator check | Location | Backing in schema/identity | Correction |
|---|---|---|---|
| Story "story points / size / estimate" | `utils/artifact-validator.js:131-133` | **None.** `artifact-schemas/story.md` has no estimate field; `quality-gates/story-quality.md` never mentions points; strategist "Size stories appropriately" (agents/strategist.md:113) is about task counts, not a points field | **Delete the check.** If sizing is ever wanted, it enters the schema first — truth flows schema → validator |
| Story Given/When/Then mandatory | `:123-125` | Schema requires BDD (`story.md:112`) — but the live `/bug` flow produces checklist-AC stories (e.g. `story-A-BUG-1.md`: `- [ ] AC1: …` with dev notes and D-ID refs — a *good* story in a different register) | **Amend the schema** (see below), then validate either format |
| Architecture "System Components", "API Contracts" | `:104` | Schema says "System Architecture", "API Design" (`artifact-schemas/architecture.md:29,62`) — the validator's names match nothing | Use schema names; add the delta variant (below) |
| PRD "Purpose" | `:91` | Schema has "Executive Summary", no "Purpose" section (`artifact-schemas/prd.md:10`) | Use schema names |
| Product-brief "Value Proposition" | `:113` | Schema has no such section (`artifact-schemas/product-brief.md`) | Use schema names |

Two **schema amendments** (the schema is the truth, so the truth is edited where reality earned it):

1. **`story.md` — dual acceptance-criteria formats.** Add an "Acceptance-criteria formats" subsection: (a) BDD Given/When/Then — the default, required for feature stories (full-lifecycle / small-feature decomposition); (b) verifiable checklist ACs (`- [ ] AC<n>: <testable assertion>`) — acceptable for bug-fix / debug / maintain stories, where the AC is a concrete verifiable claim rather than a behavioral scenario. Both formats require an `## Acceptance Criteria` section.
2. **`architecture.md` — delta variant.** Add a "Delta architecture" section: a feature/incremental architecture (the `/feature`, `/migrate`, retrofit outputs — the majority brownfield case) declares `**Scope:** delta` in its header block and requires Overview + explicit decision references, not the greenfield product sections (Technology Stack etc.). The full section set remains required for product architectures.

### 2.3 Resolution of the 28 failures (verified against today's run: 80 pass / 28 fail)

| Failure class | Count | Resolution | Artifact edits needed |
|---|---|---|---|
| Stories missing "story points" (only defect) | 17 | Check deleted (unbacked) | None |
| Stories missing points + Given/When/Then | 10 (A-BUG-1/3/4/5/8/9, B-TOKEN-2, C-TOOLS-1, C-WIRE-1/2) | Points check deleted; AC check widened to the schema-sanctioned dual format — all 10 carry `- [ ] ACn:` checklists and pass | None |
| `artifacts/design/architecture.md` missing System Components / API Contracts / Data Models | 1 | Validator's section names were wrong anyway; doc is a feature architecture → declares the delta variant | **One line**: add `**Scope:** delta` to the header block of `artifacts/design/architecture.md` |

Net: **fix the validator to match the real schema; one one-line artifact edit; no story rewrites, no relaxation of anything the schema actually requires.** Residual risk: moving from substring-anywhere to heading-based matching may newly fail a few of the 80 currently-passing artifacts (they passed on prose luck). The WS-5 dev runs `validate` after the spec lands and remediates any stragglers (they own `artifacts/` remediation); the exit criterion is a green run, not a snapshot of today's pass list.

Adjacent fix bundled here (D-10/CB-12): `validate --phase <unknown>` currently TypeErrors (`utils/artifact-validator.js:19-31` + `cli/validate.js`); emit a proper error listing valid phases (now including `reviews`).

---

## 3. R2 — The shipped-path model (CB-1, WS-6)

### 3.1 The problem, precisely

Generated agents and command bodies instruct Claude to read repo-relative paths. In a user project generated by `bmad-swarm init`, `methodology/` does not exist at all and `agents/` exists only as `.claude/agents/`. Every one of these references dangles. Verified census of **all** runtime references (2026-08-12):

| Referenced file | Referencing surfaces |
|---|---|
| `methodology/decision-classification.md` | orchestrator.md:34, architect.md:115, strategist.md:79, security.md:78, devops.md:70, reviewer.md:86 |
| `methodology/decision-traceability.md` | reviewer.md:90, ideator.md:88, orchestrator.md:108, commands-generator.js:297 (`/retrofit-team`) |
| `methodology/brainstorming-techniques.md` | ideator.md:35, ideator.md:141 |
| `methodology/elicitation-methods.md` | ideator.md:49 |
| `methodology/artifact-schemas/product-brief.md` | ideator.md:85 |
| `methodology/quality-gates/code-quality.md` | reviewer.md:78 (fixture-provenance lens) |
| `agents/ideator.md` | commands-generator.js:160 (`/brainstorm`), :185 (`/explore-idea`), orchestrator.md:184 |
| `agents/architect.md` | commands-generator.js:250, :254 (`/retrofit-team`) |

Internal cross-refs inside shipped files (must also resolve): decision-traceability ↔ decision-classification, product-brief/decision-log schemas → decision-traceability, decision-traceability:190 → `agents/reviewer.md`. All stay inside the ship list + generated agents, so the rewrite rule below closes them.

Important distinction: this is a **Claude-runtime** problem only. The CLI (`validate`, `eject`) runs from the installed npm package and can read `PACKAGE_METHODOLOGY_DIR` directly — `spec.yaml` (§2) is therefore *not* shipped and needs no scaffold copy.

### 3.2 The model

**Shipped path:** `.claude/bmad/methodology/…`, preserving subpaths (`artifact-schemas/`, `quality-gates/`, `testing-knowledge/`).

**Copy mechanism:** new `generators/methodology-generator.js` — iterates the ship list (a constant, §3.3), reads from `PACKAGE_METHODOLOGY_DIR`, writes via the existing `writeGeneratedFile` hash-marker machinery (`<!-- bmad-generated:HASH -->`), so shipped methodology gets the exact same update-safety as agents: user-modified files are detected and skipped unless `--force`. This also **replaces the `eject methodology` placebo (V-5)**: the shipped copy *is* the editable surface; `overrides/methodology/` (which nothing ever read back) is retired — `eject`/`uneject` drop the methodology type.

**Path rewriting at generation time:** package sources keep repo-relative paths (they resolve for maintainers browsing the repo). A shared `rewriteScaffoldPaths(content)` (new `utils/scaffold-paths.js`) applies, in order:

1. `methodology/` → `.claude/bmad/methodology/`
2. `agents/<role>.md` → `.claude/agents/<role>.md` (role ∈ the 9-role enum; leaves `.claude/agents/…` already-rewritten refs alone)

Applied by: `agent-generator.js` (identity bodies), `commands-generator.js` (command bodies, incl. the identity-* skill bodies which embed agent file contents), and `methodology-generator.js` (shipped file bodies — the internal cross-refs of §3.1). The dev repo dogfoods the same model: after `update`, this repo also gets `.claude/bmad/methodology/` and its regenerated identities reference shipped paths.

### 3.3 The ship list (exact — 19 files, ~2,600 lines, read-on-demand, never session-loaded)

From `methodology/` into `.claude/bmad/methodology/`:

```
decision-classification.md
decision-traceability.md
brainstorming-techniques.md
elicitation-methods.md
artifact-schemas/product-brief.md
artifact-schemas/prd.md
artifact-schemas/epic.md
artifact-schemas/story.md
artifact-schemas/architecture.md
artifact-schemas/project-context.md
artifact-schemas/decision-log.md
artifact-schemas/lessons-learned.md
quality-gates/code-quality.md
testing-knowledge/api-testing.md
testing-knowledge/auth-testing.md
testing-knowledge/data-testing.md
testing-knowledge/frontend-testing.md
testing-knowledge/performance-testing.md
testing-knowledge/security-testing.md
```

Why the whole `artifact-schemas/` set ships even though only `product-brief.md` is referenced today: R1 makes the schemas the single truth the producing agents are graded against, and the AP-9 fix (adopted here) wires the missing references — strategist → prd/epic/story schemas, architect → architecture schema, researcher → project-context schema, decision-classification step 4 → decision-log schema (AP-12 alignment). `testing-knowledge/` ships because it is genuine differentiated methodology rescued by two one-line wirings (reviewer test-coverage lens, developer testing requirements) — see §4. `package.json` already whitelists `methodology/` in `files`, so no packaging change is needed.

**Not shipped:** `spec.yaml` (CLI reads it from the package; shipping would invite scaffold/package drift), `phases.yaml` and everything ruled REFERENCE-ONLY or DELETE in §4.

### 3.4 `update` migration for existing scaffolds

`bmad-swarm update` on a pre-Phase-1 project:

1. `generateMethodology()` runs — `.claude/bmad/methodology/` appears (all files new → clean generation; report counts like other generators).
2. Agents/commands regenerate through the existing hash-marker flow — unmodified files pick up the rewritten paths automatically; user-modified files are skipped with the standard warning (their old dangling refs were broken anyway; `doctor` should flag remaining `methodology/`-prefixed refs in user-modified generated files as a skew note — small addition, WS-6).
3. `updateGitignore` v2 runs (§3.5) and the CLI prints a migration notice: "sharing model updated — `.claude/`, `artifacts/`, `swarm.yaml`, `CLAUDE.md` are now tracked; review `git status` and commit the scaffold."
4. No stale-sweep additions: no old paths are abandoned (`overrides/methodology/` is user-owned; left in place, noted by `doctor`).

### 3.5 The gitignore flip (D-042 dependency — flagged)

Current `updateGitignore` (`utils/fs-helpers.js:213`) ignores `.claude/`, `artifacts/`, `swarm.yaml`, `project.yaml`, `CLAUDE.md`, `overrides/` — which would leave the entire shipped scaffold, and the config the README says users own, uncommittable. D-042 (ratified with the vision's secondary calls) flips the model: **track everything; ignore only** `.claude/settings.local.json`, `.session-active`, `*.bak`.

Implementation note: the current function only *appends* missing entries to its marker section — the v2 must **replace the marker section wholesale** (locate `# bmad-swarm (generated files)` block, rewrite it with the minimal list), otherwise existing projects keep the old broad ignores forever. WS-6 owns this. Without the flip, WS-6's scaffold works but cannot be committed/shared, and the Phase 3 `--github` CI path stays dead — this is the named cross-dependency, ratified, implemented in this phase.

---

## 4. R3 — Orphaned-methodology dispositions (AP-9)

Guardrail applied: "protect the brain" — differentiated methodology is shipped or folded, never deleted; true shelf-ware (no reader, no differentiator, stale roster) is cut.

| Item | Lines | Ruling | Rationale / action |
|---|---|---|---|
| `decision-classification.md`, `decision-traceability.md`, `brainstorming-techniques.md`, `elicitation-methods.md` | 696 | **LOAD-BEARING — ship** | Referenced by 6 identities + `/retrofit-team` (§3.1 census). decision-classification gets the AP-12 step-4 alignment (log format per `artifact-schemas/decision-log.md`, D-ID required) |
| `artifact-schemas/` (8 .md) | 1,228 | **LOAD-BEARING — ship** | Becomes the single truth (R1); wired into strategist/architect/researcher per AP-9 fix. Amendments: story dual-AC, architecture delta variant, quality-checklist folds (below) |
| `artifact-schemas/spec.yaml` (new) | ~80 | **Package-only** | Machine projection for the validator; lockstep-tested against the .md schemas; not shipped |
| `quality-gates/code-quality.md` | 100 | **LOAD-BEARING — ship** | Referenced by reviewer.md:78 (fixture-provenance lens — a Phase 0 moat win); path kept stable |
| `quality-gates/prd-quality.md`, `architecture-quality.md`, `story-quality.md`, `adr-readiness.md` | 444 | **FOLD then DELETE** | No prompt path reaches them; their useful checklist content merges into the corresponding schema's Quality Checklist section (schemas already carry one), then the files are deleted. Content preserved, duplication cut |
| `quality-gates/review-quality.md` | 99 | **DELETE** | AP-8: its Critical/Major/Minor + Approved/Changes-Requested/Blocked taxonomy conflicts with the reviewer identity's live High/Medium/Low + blocking/advisory vocabulary. The reviewer identity is authoritative; keeping this file only preserves the conflict |
| `task-templates/` (5 YAML) | 685 | **DELETE** | Zero readers ever (no code, no identity, no command); staffed with the retired story-engineer/qa roster; duplicates team-composition logic that lives in the orchestrator identity + entry-points constant (§5) |
| `orchestration-modes.md` | 169 | **DELETE** | Unreferenced; stages a "QA agent"; surviving content already lives in orchestrator.md §Brainstorming/§Entry points (per AP-9) |
| `adaptive-interaction.md` | 157 | **DELETE** | Unreferenced; duplicates ideator.md's inline Adaptive Interaction section with a *conflicting* framework (5 personas vs 4 signal classes). The inline version is the one agents actually load — it is authoritative |
| `testing-knowledge/` (6 .md) | 408 | **LOAD-BEARING — ship + wire** | The one orphan worth rescuing: per-domain testing methodology (api/auth/data/frontend/performance/security) that makes scaffolds "born knowing". Wire: one line in reviewer.md (test-coverage lens: "consult `methodology/testing-knowledge/<domain>-testing.md` for the domain checklist") and one in developer.md (testing requirements). Also fixes README's stale "for the QA agent" line downstream |
| `phases.yaml` | 510 | **REFERENCE-ONLY — keep in repo, don't ship** | Read by no code (only the eject placebo, which is being removed). It remains the repo's lifecycle design reference: its `entry_points:` section is rewritten to the canonical 13 keys (§5) and its stale roster (story-engineer/qa/retrospective staffing, phases.yaml:199-242,289-303) is swept to the 9-role reality (CB-4 overlap — this slice sweeps only what R4 and the roster touch; deeper CB-4 rewrites can follow) |

Net deletion: ~1,554 lines (task-templates 685 + orchestration-modes 169 + adaptive-interaction 157 + quality-gates 543 less code-quality) — matching AP-9's ~1,600 estimate — while 408 lines of testing knowledge and 1,928 lines of decision/schema methodology are promoted to shipped product.

---

## 5. R4 — Entry-point vocabulary (CB-9, WS-5)

### 5.1 The canonical set (13 values)

**Authoritative list** = the orchestrator invariant enum (the only copy that participates in the live assembly-block contract), extended with the two values whose absence forces `/research` and `/review` to mislabel themselves:

```
solo · bug-fix · small-feature · full-lifecycle · brainstorm · explore-idea ·
debug · migrate · audit · research · review · maintain · plan-only
```

Single source in code — new `utils/entry-points.js` (pinned interface, WS-5's first commit):

```js
export const ENTRY_POINTS = Object.freeze({
  'solo':           { agents: ['developer'] },
  'bug-fix':        { agents: ['developer', 'reviewer'] },
  'small-feature':  { agents: ['architect', 'developer', 'reviewer'] },
  'full-lifecycle': { agents: ALL_AGENTS },
  'brainstorm':     { agents: ['ideator'] },
  'explore-idea':   { agents: ['ideator', 'researcher'] },
  'debug':          { agents: ['developer', 'reviewer'] },
  'migrate':        { agents: ['architect', 'developer', 'reviewer'] },
  'audit':          { agents: ['researcher', 'reviewer', 'security'] },
  'research':       { agents: ['researcher'] },
  'review':         { agents: ['reviewer'] },
  'maintain':       { agents: ['developer', 'reviewer'] },
  'plan-only':      { agents: [] },
});
```

### 5.2 The divergent copies and their disposition

| Copy | Location | State today | Disposition |
|---|---|---|---|
| Orchestrator invariant enum | `agents/orchestrator.md:16` | 11 values (no research/review) | **Authoritative prose.** Extended to the 13 (exact replacement line pinned in §6.3); a content-assertion test locks it to the constant |
| `phases.yaml` `entry_points:` | `methodology/phases.yaml:370-468` | 13 keys, **6 orphans used nowhere else** (`vague-idea`, `clear-requirements`, `add-feature`, `refactor`, `ideate-then-build`, `exploration-only`); missing `small-feature`, `full-lifecycle`, `explore-idea`, `research`, `review`, `plan-only` | Rewritten to exactly the canonical 13 keys. Orphan intents fold as descriptions: vague-idea → brainstorm/explore-idea, clear-requirements → full-lifecycle, add-feature → small-feature, refactor → migrate note, ideate-then-build → note under brainstorm, exploration-only → research |
| Cost-estimator map | `utils/cost-estimator.js:68-79` | Own 10-key map; unknown keys silently fall back to `allAgents` (wrong for `plan-only`, which spawns nothing) | Map deleted; imports `ENTRY_POINTS`; unknown key becomes an error, `plan-only` → `[]` |
| Command emissions | `generators/commands-generator.js:124` (`/research`), `:219` (`/review`) | Both emit `entry_point: audit` (mislabel — the value didn't exist) | Emit `research` / `review` respectively (WS-6 file; exact values pinned here) |

Lockstep enforcement (new `test/entry-points.test.js`): constant keys ⊆/≡ the orchestrator.md enum line; `phases.yaml` `entry_points` keys ≡ constant keys; every `entry_point:` literal emitted by `commands-generator.js` output ∈ constant keys.

---

## 6. Work breakdown — two parallel tracks, disjoint file ownership

### 6.1 Track WS-5 — "Truth & schema" (Dev A)

Owns (exclusively): `utils/artifact-validator.js`, `utils/cost-estimator.js`, **new** `utils/entry-points.js`, **new** `methodology/artifact-schemas/spec.yaml`, all of `methodology/**` (amendments + deletions per §2/§4/§5), `agents/orchestrator.md` **line 16 only** (enum extension, pinned §6.3), `cli/validate.js` (D-10 fix), `artifacts/**` remediation, tests: `test/artifact-validator.test.js` (rewrite), `test/cost-estimator.test.js` (fix the drift-preserving expectations), **new** `test/artifact-spec.test.js` (spec↔schema lockstep), **new** `test/entry-points.test.js`.

Tasks, in order:
1. Land `utils/entry-points.js` (the pinned constant — first commit; WS-6 reads its keys as pinned literals meanwhile).
2. Schema amendments: story dual-AC formats; architecture delta variant; fold the four quality-gate checklists into schema Quality Checklists; AP-12 alignment in `decision-classification.md`.
3. Author `spec.yaml`; rewrite `artifact-validator.js` to load it (heading-based matching); fix `validate --phase` error handling.
4. Deletions: `task-templates/`, `orchestration-modes.md`, `adaptive-interaction.md`, `quality-gates/` minus `code-quality.md`.
5. `phases.yaml`: entry-points rewrite + roster sweep; `cost-estimator.js` onto the constant (+ `plan-only`); orchestrator.md enum line.
6. Remediation: add `**Scope:** delta` to `artifacts/design/architecture.md`; run `validate`, fix any newly-failing artifacts.
7. Tests green (incl. lockstep suites).

**Exit criteria (WS-5):** `node bin/bmad-swarm.js validate` exits fully green on this repo (the validate-green criterion); `npm test` green; spec↔schema and entry-point lockstep tests exist and pass; zero structural requirements exist in the validator that are absent from the schemas.

### 6.2 Track WS-6 — "Self-containment & generators" (Dev B)

Owns (exclusively): **new** `generators/methodology-generator.js`, **new** `utils/scaffold-paths.js` (rewrite function + `METHODOLOGY_SHIP_LIST` constant of §3.3), `generators/agent-generator.js`, `generators/commands-generator.js`, `cli/init.js`, `cli/update.js`, `cli/eject.js`, `cli/uneject.js`, `cli/doctor.js` (skew note), `utils/fs-helpers.js` (`updateGitignore` v2), `utils/paths.js` (add `bmadDir`/`bmadMethodologyDir` to `getProjectPaths`), `agents/*.md` **except** orchestrator.md line 16 (AP-9 wiring one-liners into strategist/architect/researcher/reviewer/developer), tests: **new** `test/self-containment.test.js`, plus updates to `test/generators.test.js`, `test/fs-helpers.test.js`, `test/cli.test.js`.

Tasks, in order:
1. `utils/scaffold-paths.js`: ship-list constant + `rewriteScaffoldPaths()` (rules of §3.2; idempotent — never double-prefixes).
2. `generators/methodology-generator.js` (hash-marker writes; applies the rewrite to shipped bodies); wire into `cli/init.js` and `cli/update.js`.
3. Apply the rewrite in `agent-generator.js` and `commands-generator.js`; change the two `entry_point` emissions to `research`/`review` (pinned §5.2).
4. AP-9 wiring one-liners in the five agent sources (they reference `methodology/artifact-schemas/…` repo-relative; the generator rewrites them).
5. `updateGitignore` v2 (marker-section replacement, minimal ignore set: `.claude/settings.local.json`, `.session-active`, `*.bak`) + update migration notice; remove the methodology eject type; doctor skew note.
6. The **generated-references-resolve test** (the WS-6 exit test): `init -y` into a temp dir; for every generated `.md` under `.claude/` and `CLAUDE.md`, extract backticked path tokens matching `^(\.claude|methodology|agents|overrides)/…`; assert (a) **no token starts with bare `methodology/` or `agents/`** (dangling-prefix ban), (b) every `.claude/…` token exists on disk. (`artifacts/…` refs are work outputs, exempt.) Plus an update-migration test: fixture of a pre-Phase-1 scaffold → `update` → refs resolve, `.claude/bmad/` populated, gitignore flipped.

**Exit criteria (WS-6):** references-resolve + update-migration tests green; a fresh `init` in an empty temp project contains zero dangling repo-relative references; gitignore contains only the minimal ignore set; `npm test` green.

### 6.3 Cross-track contracts (pinned so no mid-flight coordination is needed)

1. **Shipped prefix literal:** `.claude/bmad/methodology/` (both tracks).
2. **`ENTRY_POINTS` interface** as in §5.1; WS-6 uses the literals `research`/`review` directly.
3. **orchestrator.md:16 replacement line** (WS-5's only edit in `agents/`):
   `entry_point: <solo|bug-fix|small-feature|full-lifecycle|brainstorm|explore-idea|debug|migrate|audit|research|review|maintain|plan-only>`
4. **No shared files.** The only cross-file *reads* are in tests (WS-5's lockstep test reads commands-generator output; it will pass once both merge). Integration lands on one branch; merge order is free, but both must be in before the joint check.

**Joint exit check (after both merge):** run `bmad-swarm update` on this repo itself — `.claude/bmad/methodology/` appears, regenerated identities/commands reference shipped paths, `validate` stays green, `npm test` green. This is the dogfood proof and the release precondition per D-041 (npm publish hard-gated on WS-1 + WS-5 + WS-6).

### 6.4 Dependencies and flags

- **D-042 gitignore flip** — ratified; implemented inside WS-6 (§3.5). Without it the shipped scaffold cannot be committed by users and the sharing model stays broken; it is also a Phase 3 (`--github` CI, field `update` rollout) precondition.
- **ADR-E** ("ship the methodology subset into scaffolds", vision queue item 9): the content is §3 of this document — shipped-path model, ship list, rewrite rule, update migration, eject-methodology retirement. Needs minting as `artifacts/design/decisions/adr-E-*.md` (suggest routing to the ADR track rather than duplicating here).
- **Out of scope, do not touch:** write-policy statements (AP-2), roster/model prose in README/CLAUDE.md (P0/other tracks), facade-ring deletions other than the methodology eject type (Phase 3 WS-8), project.yaml disposition (D-037, later phase — it simply becomes tracked for now).
