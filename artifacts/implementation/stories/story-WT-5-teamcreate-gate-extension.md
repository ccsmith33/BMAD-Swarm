# Story WT-5: `teamcreate-gate` hook — fixed-mode Pass 2 enforcement

## Status: complete

## User Story

As a bmad-swarm user running fixed-mode wide team,
I want the `teamcreate-gate` hook to refuse a TeamCreate that routes to an undeclared specialist,
So that misroutes are caught at the moment they would corrupt the bounded-context property — not later, by a reviewer noticing the wrong dev did the work.

## Acceptance Criteria

### AC1: Dynamic mode is unaffected

**Given** a project with `team.mode: dynamic` (or no `team` block at all)
**When** any TeamCreate fires
**Then** the hook's behavior is byte-for-byte identical to the pre-feature behavior (Pass 1 required-keys check only)
**And** Pass 2 is skipped entirely (verified by hook unit test)

### AC2: Fixed mode + matching specialist passes

**Given** `swarm.yaml: team.mode: fixed` with a specialization `(role: developer, domain: backend-auth)`
**And** a `bmad-assembly` block whose `team[]` contains an entry with `role: developer, domain: backend-auth`
**When** TeamCreate fires
**Then** the hook passes (no deny envelope emitted, exit 0)

### AC3: Fixed mode + unmatched specialist + fallback enabled passes via fallback

**Given** `swarm.yaml: team.mode: fixed`, fallback enabled
**And** a `bmad-assembly` block with a `developer` entry that has NO `domain:` sub-field
**When** TeamCreate fires
**Then** the hook passes (entry treated as fallback developer, fallback enabled → accept)

### AC4: Fixed mode + unmatched specialist + fallback disabled denies

**Given** `swarm.yaml: team.mode: fixed`, `team.fallback.enabled: false`
**And** a `bmad-assembly` block with a `developer` entry that has NO `domain:` sub-field
**When** TeamCreate fires
**Then** the hook emits a deny envelope
**And** the `permissionDecisionReason` contains `team mode is "fixed"` AND `does not match any declared specialist` AND `set team.fallback.enabled: true`

### AC5: Fixed mode + specialized entry whose domain doesn't match any specialization denies

**Given** `swarm.yaml: team.mode: fixed`, specializations declare only `backend-auth`
**And** a `bmad-assembly` block with `team[].domain: frontend-dashboard` for a developer entry
**When** TeamCreate fires
**Then** the hook emits a deny envelope referencing the unknown `(developer, frontend-dashboard)` pair

### AC6: Non-specialized roles always pass

**Given** `swarm.yaml: team.mode: fixed`
**And** a `bmad-assembly` `team[]` containing roles like `architect`, `security`, `devops`, `researcher`, `strategist`, `ideator` (any subset)
**When** TeamCreate fires
**Then** these roles pass through Pass 2 unconditionally regardless of `domain:` presence

### AC7: Malformed `swarm.yaml` fails open

**Given** the project's `swarm.yaml` is missing OR contains malformed YAML OR is unreadable due to IO error
**When** TeamCreate fires
**Then** Pass 2 is skipped silently (consistent with the hook's existing fail-open posture for missing transcripts)
**And** Pass 1 still runs as normal

### AC8: Mixed-team `bmad-assembly` validates each entry independently

**Given** a `bmad-assembly` `team[]` containing one valid specialist developer, one valid non-specialist (architect), and one INVALID developer entry
**When** TeamCreate fires
**Then** the hook denies, with the deny reason naming the specific invalid entry

### AC9: Hook regenerates correctly via `bmad-swarm update`

**Given** the `generators/hooks-generator.js` source is updated to embed the Pass 2 logic
**When** `bmad-swarm update` is run on this repo
**Then** `.claude/hooks/teamcreate-gate.cjs` is regenerated with the Pass 2 logic
**And** the file's `bmad-generated:<hash>` line is updated
**And** `bmad-swarm update` rerun is idempotent (no diff on second run)

### AC10: All existing `teamcreate-gate` Pass 1 tests still pass

**Given** the existing test suite for `teamcreate-gate` (the required-keys check, the fence parsing, the structured + raw-transcript-scan fallback per GATE-1)
**When** the test suite runs after this story lands
**Then** every existing test still passes (no regression)

## Tasks

- [ ] Task 1: Patch `generators/hooks-generator.js:generateTeamCreateGateHook(config)` to embed the Pass 2 logic
  - [ ] Subtask 1.1: After Pass 1 passes (structured or raw-scan match found with no missing keys), trigger Pass 2
  - [ ] Subtask 1.2: Pass 2 reads `swarm.yaml` from CWD via `fs.readFileSync` + a YAML parser. Use `js-yaml` (already a dep — `utils/config.js` imports it; bundling-strategy decision is yours but document the choice as a tactical D-NNN entry in `decision-log.md`)
  - [ ] Subtask 1.3: If `team.mode !== "fixed"`: pass through, exit 0
  - [ ] Subtask 1.4: For each `team[]` entry in the matched bmad-assembly block, parse `role:` and optional `domain:` sub-fields
  - [ ] Subtask 1.5: For unspecialized roles (architect, security, devops, researcher, strategist, ideator, orchestrator): pass through that entry
  - [ ] Subtask 1.6: For specialized roles (developer, reviewer): if `domain:` present, look up `(role, domain)` in `team.specializations`. If missing, treat as fallback candidate (require `team.fallback.enabled === true && team.fallback.role === role`)
  - [ ] Subtask 1.7: On failure, emit deny envelope with the documented `permissionDecisionReason` shape (see AC4 / AC5)
  - [ ] Subtask 1.8: On any YAML read/parse error: pass through silently (fail-open)
- [ ] Task 2: Regenerate `.claude/hooks/teamcreate-gate.cjs` (run the generator OR check in the regenerated file as part of this PR — match existing repo practice)
- [ ] Task 3: Add hook tests in `test/hooks.test.js` (or wherever hook tests live) — one per AC1 through AC8
  - [ ] Subtask 3.1: AC1 — dynamic mode pass-through
  - [ ] Subtask 3.2: AC2 — fixed mode + matching specialist passes
  - [ ] Subtask 3.3: AC3 — fixed + no-domain entry + fallback enabled passes
  - [ ] Subtask 3.4: AC4 — fixed + no-domain entry + fallback disabled denies
  - [ ] Subtask 3.5: AC5 — fixed + unmatched-domain entry denies
  - [ ] Subtask 3.6: AC6 — non-specialized roles always pass
  - [ ] Subtask 3.7: AC7 — malformed swarm.yaml fails open
  - [ ] Subtask 3.8: AC8 — mixed team with one bad entry denies and names the bad entry
- [ ] Task 4: Verify AC10 — run the full hook test suite, confirm no Pass 1 regressions
- [ ] Task 5: Verify AC9 — run `bmad-swarm update` twice, diff the output, confirm idempotence

## Dev Notes

### Architecture Context

This story implements `architecture.md` §7 (`teamcreate-gate` hook extension) and the relevant slice of §10.2 (generator delta).

Parent strategic decision: **D-004**. Direct ADR: **ADR-008** (`artifacts/design/decisions/adr-008-teamcreate-gate-fixed-mode-enforcement.md`). The fail-open posture, the role-by-role parsing logic, and the deny-message shape are all specified in ADR-008 — implement faithfully.

The existing hook is heavily commented (see `.claude/hooks/teamcreate-gate.cjs:1-19` for the header + GATE-1 history). Match that comment density: Pass 2's purpose, fail-open posture, and ADR-008 reference should be in a header comment block.

### Technical Implementation

**Where the hook reads `swarm.yaml`**: the hook currently uses `event.transcript_path` to find the transcript. For Pass 2, read `swarm.yaml` from CWD (`process.cwd()`-relative). The hook's Claude Code invocation has `cwd` set to the project root. If the file isn't there, fail-open per AC7.

**YAML parsing**: `utils/config.js` uses `js-yaml`. The hook is a `.cjs` file (CommonJS, standalone Node script — no ES module imports). Two valid options:
1. `require('js-yaml')` — works because the hook runs in the project's Node context with the package's deps available.
2. Inline a minimal YAML subset parser. Brittle and not recommended.

Strongly prefer option 1. Wrap the require in a try/catch — if `js-yaml` isn't installed for some reason, fail-open. Document the choice as a tactical decision (D-NNN, one-liner in decision-log.md).

**Parsing the `team[]` array from the bmad-assembly block**: the existing hook extracts the block as a raw string (see `FENCE_RE`). For Pass 2, parse that string as YAML (the block content IS YAML — see the schema in `agents/orchestrator.md`). Operate on the parsed structure: iterate `parsed.team` array, read `role` and optional `domain`.

**Per-entry validation logic** (pseudocode):

```javascript
const teamConfig = swarmYaml.team || {};
const mode = teamConfig.mode || 'dynamic';
if (mode !== 'fixed') return passThrough();

const specs = teamConfig.specializations || [];
const fallback = teamConfig.fallback || {};
const fallbackEnabled = fallback.enabled !== false;  // default true
const fallbackRole = fallback.role || 'developer';

const SPECIALIZED_ROLES = new Set(['developer', 'reviewer']);

for (const entry of (assembly.team || [])) {
  if (!SPECIALIZED_ROLES.has(entry.role)) continue;  // unspecialized → pass

  if (entry.domain) {
    const matched = specs.some(s => s.role === entry.role && s.domain === entry.domain);
    if (!matched) return deny(`team mode is "fixed" but the team[] entry "${entry.role} domain=${entry.domain}" does not match any declared specialist in swarm.yaml:team.specializations and fallback is disabled. Either declare the specialist or set team.fallback.enabled: true.`);
  } else {
    // no domain → fallback candidate
    if (!(fallbackEnabled && fallbackRole === entry.role)) {
      return deny(`...`);  // same shape, naming the no-domain entry
    }
  }
}

return passThrough();
```

**Deny-envelope shape**: the existing hook uses `hookSpecificOutput.permissionDecision: 'deny'` with a `permissionDecisionReason`. Match the same envelope.

### File Locations

- Modify: `generators/hooks-generator.js` (the `generateTeamCreateGateHook` function — patch site)
- Regenerate: `.claude/hooks/teamcreate-gate.cjs` (output of the generator)
- Add: tests in `test/hooks.test.js` (or sibling — match existing test layout)

### Dependencies

**Story WT-5 depends on Story WT-1.** WT-1 lands the `swarm.yaml` schema with the `team` block, the validator, and the `getTeamConfig` helper. WT-5's hook reads that schema. Without WT-1, the hook would have no schema to validate against.

The hook can technically inline its own YAML parsing without importing from `utils/config.js` (the hook is a standalone script and does not bootstrap the full app), but it MUST agree with WT-1's defaults exactly — duplicate the default-application logic carefully (or, cleaner: have the hook `require('../utils/config.js')` if the path resolution works in the hook context — verify before relying on it).

### Testing Approach

- The hook runs as a child process (Claude Code invokes `node .claude/hooks/teamcreate-gate.cjs`). Tests should spawn the hook as a child process with synthetic stdin (event JSON) and synthetic on-disk fixtures (a temp `swarm.yaml`, a fake `transcript.jsonl`).
- Look at the existing `test/hooks.test.js` (or equivalent) for the spawn pattern. Match it.
- Use a temp directory per test (e.g., `mkdtemp`) for fixture isolation. Don't pollute CWD.
- Assert on the hook's stdout (the JSON envelope) and exit code.
- For AC7 (fail-open), prove the hook exits 0 with no deny envelope when `swarm.yaml` is malformed — DO NOT assert "an error was logged". The hook should be quiet.

### Anti-Patterns

- Do NOT make the hook fail-closed. ADR-008 §"Why fail-open here" explains the posture; routing failures are correctness issues, not security issues. The reviewer is the backstop.
- Do NOT cache the parsed `swarm.yaml` across hook invocations via filesystem state. Each hook call is a fresh process; per-process caching is fine, cross-process is wrong.
- Do NOT add a new `swarm.yaml` validation pass to the hook. The validator is `utils/validator.js`'s job; the hook trusts what it reads (or fails open).
- Do NOT block legitimate orchestrator escapes — if `team.mode: fixed` is removed mid-session, the next TeamCreate sees `mode: dynamic` and Pass 2 skips. No special handling needed.
- Do NOT change the existing Pass 1 behavior. The structured walk + raw-scan fallback (GATE-1 fix) must remain intact. Pass 2 runs ONLY after Pass 1 has accepted.
- Do NOT regenerate `.claude/hooks/teamcreate-gate.cjs` manually-by-editing — change the generator and regenerate. The file's `bmad-generated:<hash>` line is the contract.

### D-IDs Referenced

- **D-004** — parent strategic decision
- **D-009** — `teamcreate-gate` Pass 2 enforcement (this story implements)
- **D-012** — `require('js-yaml')` try/catch wrapped (tactical, logged during this story per Subtask 1.2)
- **ADR-008** — full hook design + fail-open posture rationale
- **ADR-003** — analog precedent (orchestrator-write-gate's two-layer identity check; same "load-bearing invariant requires hook enforcement" reasoning)
- **D-001** — permission model context (the hook still fires under `acceptEdits` because hook deny overrides permission mode)

## File List

- `generators/hooks-generator.js` — modified (`generateTeamCreateGateHook`: Pass 1 control flow refactored so accepted block is handed to Pass 2 instead of exit-on-pass; Pass 2 logic embedded — `js-yaml` require with try/catch, CWD-relative `swarm.yaml` read, mode gate, per-entry validation against `team.specializations`, fallback handling, deny envelope with documented reason; header comment block extended for Pass 2 narrative + ADR-008 + D-009 + D-012 references)
- `.claude/hooks/teamcreate-gate.cjs` — regenerated (`bmad-generated:035d3a4b` hash; 8935 bytes; idempotent — second `bmad-swarm update` produces zero diff, verified live during review)
- `test/hooks.test.js` — modified (10 new test cases covering AC1–AC8: AC1 split into default-block-absent + explicit-dynamic; AC7 split into malformed-yaml + missing-yaml; new `runHookInCwd` helper with `NODE_PATH=<repo>/node_modules` injection so hook's `require('js-yaml')` resolves under temp-project fixtures)
- `artifacts/context/decision-log.md` — D-012 logged (tactical, one-paragraph entry with rationale linking to Subtask 1.2 and ADR-008's "Brittle and not recommended" rejection of inline parser)

## Dev Agent Record

- All 10 ACs implemented; **342/342** full suite passing (332 pre-WT-5 + 10 new). AC9 idempotence verified live during this review by invoking `generateHooks` twice against a fresh temp dir — first vs second run byte-identical (length 8935); first-run output also byte-identical to committed on-disk hook.
- D-012 logged for the `require('js-yaml')` try/catch choice (Option 1 of Subtask 1.2). Inline parser (Option 2) rejected per ADR-008's "Brittle and not recommended".
- Pass 1 control-flow refactor uses unified `acceptedBlock` variable for both structured-walk and raw-scan paths; Pass 1's required-keys / fence semantics are byte-identical to pre-WT-5 behavior.
- SPECIALIZED_ROLES set is `new Set(['developer', 'reviewer'])` — matches WT-1's `VALID_SPECIALIST_ROLES` constant (`utils/validator.js:7`).
- Hook duplicates fallback default-application from `utils/config.js:111-113` (~2 lines: `fallback.enabled !== false`, `fallback.role || 'developer'`) rather than `require('../utils/config.js')` — intentional ESM/CJS bridge avoidance, documented inline + in D-012. Reviewer logged this as F-003 advisory follow-up (out of WT-5 scope).
- Test fixture `runHookInCwd` injects `NODE_PATH=<repo>/node_modules` so the hook's `require('js-yaml')` resolves under temp-project test fixtures (which have no `node_modules` of their own). Models the real installed-dependency case. Without this, fail-open would silently mask Pass 2 entirely in tests — caught during initial run (3 deny tests failed), fixed by adding `NODE_PATH`.

### Reviewer notes (carried forward)

- D-009 → verified, D-012 → verified (status flips applied to `decision-log.md`).
- One new low-severity advisory finding: **F-003** — hook/validator default-application duplication without drift-detection. Out of WT-5 scope; suggested follow-up is either a small drift-detection unit test or a shared `utils/team-defaults.cjs` module.
- AC7 split into two tests (malformed-yaml + missing-yaml) is the right design — they hit different code paths (line 150 parse-error catch vs line 146 file-existence check) and both must fail open.
- AC1 split into two tests (no team block + explicit `mode: dynamic`) protects against future regressions where one path breaks but the other doesn't.
- AC6's deliberate `fallback.enabled: false` configuration ensures non-specialized roles cannot sneak through via the fallback path — they must be passing via the SPECIALIZED_ROLES set check at hook line 176. Cleanly isolates the assertion.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-29 | Story implemented; generator patched; hook regenerated; 10 tests added; 342/342 suite green; D-012 logged | dev-1 |
| 2026-04-29 | Review approved; status → complete; D-009 + D-012 → verified; F-003 logged as low-severity follow-up | reviewer |
