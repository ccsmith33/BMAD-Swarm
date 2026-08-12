# Story WT-1: `swarm.yaml` `team` block schema + validator

## Status: complete

## User Story

As a bmad-swarm user adopting wide-team specialization,
I want to declare my specialist roster (and optional generic-dev fallback) in `swarm.yaml`,
So that the orchestrator can pre-spawn the right teammates and route stories to them in fixed mode without me having to configure anything at session time.

## Acceptance Criteria

### AC1: Existing `swarm.yaml` files load unchanged

**Given** an existing project's `swarm.yaml` that does NOT contain a `team:` block
**When** `loadSwarmConfig()` parses it
**Then** the returned config has `team.mode === "dynamic"`, `team.specializations === []`, `team.fallback.enabled === true`, and `team.fallback.role === "developer"`
**And** no validation errors are produced

### AC2: Valid `team.mode: fixed` config with specializations parses cleanly

**Given** a `swarm.yaml` containing:
```yaml
team:
  mode: fixed
  specializations:
    - role: developer
      domain: backend-auth
      description: OAuth and sessions
    - role: developer
      domain: backend-upload
```
**When** `loadSwarmConfig()` parses it
**Then** `config.team.mode === "fixed"`
**And** `config.team.specializations.length === 2`
**And** the first entry has `role: "developer"`, `domain: "backend-auth"`, `description: "OAuth and sessions"`, `model: "opus"` (inherited from `defaults.model`)
**And** the second entry has `model: "opus"` and `description: ""` (defaulted)
**And** no validation errors are produced

### AC3: Invalid `team.mode` value is rejected with a clear message

**Given** a `swarm.yaml` containing `team: { mode: hybrid }`
**When** `loadSwarmConfig()` is called
**Then** an error is thrown whose message contains `team.mode "hybrid" is invalid. Valid options: dynamic, fixed`

### AC4: `team.mode: fixed` with empty specializations is rejected

**Given** a `swarm.yaml` containing `team: { mode: fixed, specializations: [] }`
**When** `loadSwarmConfig()` is called
**Then** an error is thrown whose message contains `team.mode is "fixed" but team.specializations is empty`

### AC5: Invalid specialist `role` is rejected

**Given** a `swarm.yaml` with `team.specializations[0].role: "ideator"` and `team.mode: fixed`
**When** `loadSwarmConfig()` is called
**Then** an error is thrown indicating only `developer` and `reviewer` are valid v1 specialist roles

### AC6: Invalid domain slug is rejected

**Given** a `swarm.yaml` with `team.specializations[0].domain: "Backend Auth"` (whitespace, mixed case)
**When** `loadSwarmConfig()` is called
**Then** an error is thrown indicating the domain must match `^[a-z0-9][a-z0-9-]*[a-z0-9]$`

### AC7: Duplicate domains across specializations are rejected

**Given** two specializations with `role: developer, domain: backend-auth` each
**When** `loadSwarmConfig()` is called
**Then** an error is thrown indicating the `(role, domain)` pair must be unique

### AC8: Disabling fallback in fixed mode emits a warning, not an error

**Given** a `swarm.yaml` with `team.mode: fixed`, valid specializations, and `team.fallback.enabled: false`
**When** `loadSwarmConfig()` is called
**Then** parsing succeeds (no error thrown)
**And** a warning is written to stderr containing `fallback disabled in fixed mode`

### AC9: Per-specialization `model` overrides the default

**Given** a specialization entry with `model: sonnet` while `defaults.model` is `opus`
**When** the config is parsed
**Then** that specialization's effective `model` is `sonnet`

### AC10: A `getTeamConfig(config)` helper returns the normalized team view

**Given** a parsed config (any mode)
**When** `getTeamConfig(config)` is called
**Then** it returns an object with the shape `{ mode, specializations: [...], fallback: { enabled, role, model } }` with all defaults filled in
**And** the helper is exported from `utils/config.js` for hook reuse (Story WT-5 dependency)

## Tasks

- [ ] Task 1: Extend `applyDefaults()` in `utils/config.js`
  - [ ] Subtask 1.1: Add `team` block defaults (mode='dynamic', specializations=[], fallback={enabled:true, role:'developer', model: defaults.model})
  - [ ] Subtask 1.2: Backfill per-specialization `model` from `defaults.model` when absent
  - [ ] Subtask 1.3: Backfill per-specialization `description` to empty string when absent
- [ ] Task 2: Add validation rules to `utils/validator.js`
  - [ ] Subtask 2.1: Add `VALID_TEAM_MODES = ['dynamic', 'fixed']` and `VALID_SPECIALIST_ROLES = ['developer', 'reviewer']` constants
  - [ ] Subtask 2.2: Add `DOMAIN_SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/` constant
  - [ ] Subtask 2.3: Validate `team.mode` value
  - [ ] Subtask 2.4: When `team.mode === 'fixed'`, validate non-empty specializations
  - [ ] Subtask 2.5: For each specialization, validate role enum, domain slug, and per-specialization model enum
  - [ ] Subtask 2.6: Validate `(role, domain)` uniqueness across the array
  - [ ] Subtask 2.7: Detect `team.fallback.enabled === false` in fixed mode and emit a warning via `console.warn`
- [ ] Task 3: Export `getTeamConfig(config)` helper from `utils/config.js`
  - [ ] Subtask 3.1: Returns the normalized team view with all defaults filled in (used by Story WT-5 hook)
- [ ] Task 4: Write tests in `test/config.test.js` (or `test/validator.test.js` if separation exists)
  - [ ] Subtask 4.1: Test AC1 — absent team block round-trips with defaults
  - [ ] Subtask 4.2: Test AC2 — valid fixed-mode config parses
  - [ ] Subtask 4.3: Test AC3–AC7 — every reject case throws with expected message substring
  - [ ] Subtask 4.4: Test AC8 — disabled fallback warning (capture `console.warn`)
  - [ ] Subtask 4.5: Test AC9 — per-specialization model override
  - [ ] Subtask 4.6: Test AC10 — `getTeamConfig` returns normalized shape
- [ ] Task 5: Verify the repo's own `swarm.yaml` still parses (run `node -e "import('./utils/config.js').then(m => m.loadSwarmConfig('./swarm.yaml'))"` or equivalent)

## Dev Notes

### Architecture Context

This story implements `architecture.md` §3 (`swarm.yaml` schema additions), §10.3 (`utils/config.js` changes), and §10.4 (`utils/validator.js` changes). It is the foundational groundwork story — Story WT-5 (hook extension) depends on the schema and the `getTeamConfig` helper landing first.

Parent strategic decision: **D-004**. Direct ADR: **ADR-004** (`artifacts/design/decisions/adr-004-swarm-yaml-team-block-schema.md`). The schema shape, defaults, validation rules, and forward-compat reasoning are all spelled out there — implement as specified, do not invent new fields or alternative shapes.

### Technical Implementation

**Config defaults** — extend `applyDefaults()` near the bottom of `utils/config.js` (after the `config.defaults.model` block):

```javascript
config.team = config.team || {};
config.team.mode = config.team.mode || 'dynamic';
config.team.specializations = config.team.specializations || [];
config.team.fallback = config.team.fallback || {};
if (config.team.fallback.enabled === undefined) config.team.fallback.enabled = true;
config.team.fallback.role = config.team.fallback.role || 'developer';
config.team.fallback.model = config.team.fallback.model || config.defaults.model;
for (const spec of config.team.specializations) {
  spec.model = spec.model || config.defaults.model;
  if (spec.description === undefined) spec.description = '';
}
```

**Validator** — extend `validateConfig()` in `utils/validator.js`. Mirror the existing pattern (push strings into the `errors` array; the loader throws when `errors.length > 0`).

**Domain slug regex** — `^[a-z0-9][a-z0-9-]*[a-z0-9]$` — kebab-case, no leading/trailing hyphen, no consecutive uppercase. Single-char domains are rejected by this regex (deliberate — single chars aren't meaningful domain names).

**`getTeamConfig` helper** — thin wrapper. Just returns `config.team` after defaults applied, but expose it as a named function so Story WT-5's hook can import it. Story WT-5 will need to do `swarm.yaml` parse + defaults + this lookup in the hook, so factor accordingly. (Tactical decision deferred to that story; for now just expose the helper.)

### File Locations

- Modify: `utils/config.js` (`applyDefaults` extension, new `getTeamConfig` export)
- Modify: `utils/validator.js` (new validation rules)
- Create or extend: `test/config.test.js` and/or `test/validator.test.js` — match whatever test layout already exists. Look at existing `validateConfig` tests for the assertion pattern.

### Dependencies

None. This story is the foundation for the wide-team feature; nothing in the existing codebase depends on it before it lands.

### Testing Approach

- Use whatever test runner the repo already uses (the existing tests use Node's built-in `node:test` based on package.json scripts — verify before adding).
- For warning capture (AC8), wrap `console.warn` with a stub in the test, restore in cleanup.
- For round-trip tests (AC1, AC2): build the config object inline (no fixture files needed) — `applyDefaults` is the function under test.
- Do NOT mock `utils/validator.js` from `utils/config.js` tests; let the real validator run end-to-end via `loadSwarmConfig`.

### Anti-Patterns

- Do NOT add new fields to the schema beyond what ADR-004 specifies. The temptation to "while I'm here, add `team.rotation: ...`" is rejected — rotation is D-004's deferred backup plan and out of scope.
- Do NOT make the `team` block required. Backwards compatibility depends on it being fully optional.
- Do NOT silently lowercase / kebab-ify a malformed domain — reject loudly. Silent fixups create routing bugs that are very hard to debug later.
- Do NOT break the existing per-agent `model:` override semantics. Per-specialization models follow the same rule (override `defaults.model` if specified, else inherit).
- Do NOT introduce `js-yaml` schema validation as a new layer — this repo's pattern is hand-rolled validation in `validator.js`, mirror it.

### D-IDs Referenced

- **D-004** — parent strategic decision (wide-team specialization adoption)
- **D-005** — `swarm.yaml` `team` block schema (this story implements)
- **ADR-004** — full schema rationale

## File List

- `utils/config.js` — modified (`applyDefaults` extension for `team` block; new exported `getTeamConfig` helper)
- `utils/validator.js` — modified (`VALID_TEAM_MODES`, `VALID_SPECIALIST_ROLES`, `VALID_MODELS`, `DOMAIN_SLUG_RE` constants; team-block validation in `validateConfig`)
- `test/config.test.js` — modified (11 team-block tests covering AC1–AC10)
- `test/validator.test.js` — modified (13 unit tests for validator team rules)

## Dev Agent Record

- All 10 ACs implemented; 24 new tests added; full suite 332/332 passing.
- `VALID_MODELS = ['haiku','sonnet','opus','inherit']` enum chosen from `architecture.md` §3.1 line 106 — confirmed correct by reviewer.
- Repo's own `swarm.yaml` (`team` block absent) round-trips through new defaults: `team.mode='dynamic'`, `specializations=[]`, `fallback.enabled=true`, `fallback.model='opus'`. Verified live (Task 5).
- The `(role, domain)` uniqueness key uses `::` separator; deliberately permits same domain across different roles (matches ADR-004 forward-compat note for specialist reviewers).
- `getTeamConfig` is intentionally a thin pass-through, exported as the import handle for the WT-5 hook.

### Reviewer notes (carried forward)

- Two low-severity advisory findings recorded in the WT-1 review report (`artifacts/reviews/review-WT-1-swarm-yaml-schema.md`):
  - **F-001** — `defaults.model` is not enum-validated. Out of WT-1 scope; suggested follow-up.
  - **F-002** — `team.fallback.role` is not enum-validated. Out of WT-1 scope; suggested follow-up.
- Both are advisory and were NOT fixed in WT-1 because they fall outside the documented ACs. Schedule as a small hardening follow-up if/when the validator is next touched.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-28 | Story implemented; 24 tests added; 332/332 suite green | dev-1 |
| 2026-04-28 | Review approved; status → complete; F-001/F-002 logged as out-of-scope follow-ups | reviewer |
