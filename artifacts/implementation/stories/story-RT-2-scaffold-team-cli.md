# Story RT-2: `bmad-swarm scaffold-team` CLI command

## Status: complete

## User Story

As a bmad-swarm user retrofitting wide-team into an existing project,
I want a CLI command that reads my architecture's Domain Map and emits the matching `swarm.yaml:team` block (printing by default, injecting with `--write`),
So that I do not have to hand-author the `team:` block while perfectly mirroring the Domain Map.

## Acceptance Criteria

### AC1: `bmad-swarm scaffold-team` (no flags) prints a valid YAML team block to stdout

**Given** a project with a valid `architecture.md` containing a Domain Map with three rows
**And** a valid `swarm.yaml` without a `team:` block
**When** the user runs `bmad-swarm scaffold-team`
**Then** the command writes a YAML `team:` block to stdout matching the Domain Map (one specialization per row, in source order)
**And** exits with code 0
**And** does not modify `swarm.yaml`
**And** does not create `swarm.yaml.bak`

### AC2: Each generated specialization carries the row's domain and description

**Given** a Domain Map row `| backend-auth | OAuth2 / sessions | ... | ~5 |`
**When** the command runs
**Then** the printed block contains:
```yaml
    - role: developer
      domain: backend-auth
      description: OAuth2 / sessions
```
**And** the `model:` line is commented out (`# model: opus`) per `architecture-retrofit.md` §4.2

### AC3: The generated block defaults to `mode: fixed`, `fallback.enabled: true`

**Given** any valid input
**When** the command runs (no flags)
**Then** the printed block has `mode: fixed` and a `fallback:` sub-block with `enabled: true` and `role: developer`

### AC4: `--no-fallback` flips `fallback.enabled` to `false`

**Given** any valid input
**When** the user runs `bmad-swarm scaffold-team --no-fallback`
**Then** the printed block contains `fallback: { enabled: false, role: developer }` (or equivalent YAML shape)

### AC5: `--architecture <path>` reads from the override path

**Given** a Domain Map at `custom/path/architecture.md`
**When** the user runs `bmad-swarm scaffold-team --architecture custom/path/architecture.md`
**Then** the command reads from that path and prints accordingly
**And** ignores any architecture at the default path

### AC6: `--write` injects the team block into `swarm.yaml` after backup

**Given** a valid `swarm.yaml` with no `team:` block, valid architecture with Domain Map
**When** the user runs `bmad-swarm scaffold-team --write`
**Then** `swarm.yaml.bak` exists with the byte-exact pre-write content
**And** `swarm.yaml` now contains a `team:` block matching the would-be-printed output
**And** `loadSwarmConfig('swarm.yaml')` succeeds without error
**And** the command exits with code 0
**And** prints a success message naming the backup path

### AC7: `--write` refuses if `swarm.yaml` already has a `team:` key, prints diff

**Given** a `swarm.yaml` already containing a `team:` block
**When** the user runs `bmad-swarm scaffold-team --write`
**Then** the command exits with code 1
**And** prints a unified diff between the existing `team:` block and the would-be-generated block
**And** prints the message `swarm.yaml already has a team: block` (substring match)
**And** does NOT create `swarm.yaml.bak`
**And** does NOT modify `swarm.yaml`

### AC8: Refuse with documented message when architecture is missing

**Given** no `artifacts/design/architecture.md` (and no `--architecture` override)
**When** the command runs
**Then** it exits with code 1
**And** prints `architecture not found` (substring) and points the user at `/feature` or `/plan`

### AC9: Refuse with documented message when Domain Map is missing

**Given** an architecture file that does not contain a `## Domain Map` section
**When** the command runs
**Then** it exits with code 1
**And** prints `no Domain Map found` (substring) and points the user at `/retrofit-team`

### AC10: Refuse with documented message when Domain Map is malformed

**Given** an architecture file with a `## Domain Map` heading followed by prose (no table)
**When** the command runs
**Then** it exits with code 1
**And** prints a message naming the malformation (e.g., `missing the table header`)
**And** the message includes a line number from the parser

### AC11: Refuse with documented message when `swarm.yaml` is missing (only when `--write` is used)

**Given** no `swarm.yaml` (somehow — e.g., user ran the command in a non-bmad-swarm directory)
**When** the user runs `bmad-swarm scaffold-team --write`
**Then** the command exits with code 1
**And** prints `no swarm.yaml found` (substring) and points the user at `bmad-swarm init`

### AC12: Round-trip validation failure restores from backup

**Given** a Domain Map containing a row whose slug somehow passes the parser but produces an invalid `swarm.yaml` after injection (use a test stub that mocks the YAML emit step to produce an invalid block)
**When** `--write` runs
**Then** the post-write `loadSwarmConfig` call throws
**And** the command restores `swarm.yaml` from `swarm.yaml.bak`
**And** exits with code 1
**And** prints both the validation error AND a message confirming the restore (e.g., `restored from swarm.yaml.bak`)

### AC13: Atomic-replace write — interrupted writes do not corrupt `swarm.yaml`

**Given** a simulated process kill between the `.tmp` write and the rename
**When** the command is re-run after the kill
**Then** the prior `swarm.yaml` is intact (unchanged from before the killed run)

(Implementation note: this AC may be hard to test reliably; an acceptable substitute is a unit test that asserts the implementation uses `writeFileSync(tmpPath)` followed by `renameSync(tmpPath, finalPath)` and not a single `writeFileSync(finalPath)` call.)

### AC14: `bmad-swarm scaffold-team --help` documents all flags and refuse-conditions

**Given** the command exists
**When** the user runs `bmad-swarm scaffold-team --help`
**Then** the help text describes `--write`, `--architecture`, `--no-fallback`
**And** the help text includes at least one example for the print path and one for the `--write` path

## Tasks

- [ ] Task 1: Create `cli/scaffold-team.js` exporting `registerScaffoldTeamCommand(program)`
  - [ ] Subtask 1.1: Define the `scaffold-team` subcommand with options (`--write`, `--architecture`, `--no-fallback`)
  - [ ] Subtask 1.2: Implement `runScaffoldTeam(options)` orchestrating: read paths, load architecture, parse Domain Map, build YAML, decide print-vs-write
  - [ ] Subtask 1.3: Build YAML via `js-yaml.dump` (matching `cli/init.js` pattern)
  - [ ] Subtask 1.4: For each Domain Map row, emit a specialization with `role`, `domain`, `description`, and a `# model: opus` commented line
  - [ ] Subtask 1.5: For the `--write` path, implement the five rules from ADR-011: `.bak` before mutation, refuse-on-conflict with diff, atomic-replace via `.tmp` + rename, round-trip validate, restore-from-bak on failure
  - [ ] Subtask 1.6: Use `diff` (Node has no built-in unified-diff; consider a tiny inline algorithm or a small dependency like `diff` — tactical decision, log)
- [ ] Task 2: Register the command in `bin/bmad-swarm.js`
  - [ ] Subtask 2.1: Import `registerScaffoldTeamCommand` and call it after `registerDoctorCommand` (alphabetical order matches existing pattern)
- [ ] Task 3: Write tests in `test/scaffold-team.test.js`
  - [ ] Subtask 3.1: Setup helper that creates a tmp directory with a fixture `swarm.yaml` and `architecture.md`, runs the command, returns stdout/stderr/exit code
  - [ ] Subtask 3.2: Tests for AC1–AC14 (some tests will exercise the same code paths; group as appropriate)
  - [ ] Subtask 3.3: For AC12, mock the YAML emitter or use a fixture that produces an invalid `team:` block
  - [ ] Subtask 3.4: For AC13, assert the implementation uses tmp+rename (read the source or use a stub) — exact mechanism is a tactical decision
- [ ] Task 4: Verify the existing test suite still passes
- [ ] Task 5: Decide on diff library
  - [ ] Subtask 5.1: Choose between `diff` (npm package, ~30KB), inline minimal-LCS implementation (~50 LOC), or `diff` from `node:util` if recent enough — log as tactical D-ID

## Dev Notes

### Architecture Context

This story implements `architecture-retrofit.md` §4 (Tool B — `bmad-swarm scaffold-team` CLI design) and the safety rules of **ADR-011** (`swarm.yaml`-write safety strategy).

The CLI command is structurally identical to `bmad-swarm doctor` — registered in `bin/bmad-swarm.js`, implemented in `cli/<name>.js`, exporting `register<Name>Command(program)`. Read `cli/doctor.js` and `cli/scan.js` to match the surrounding style.

### Technical Implementation

**Command registration** — copy the shape of `cli/doctor.js`:

```javascript
import { Command } from 'commander';

export function registerScaffoldTeamCommand(program) {
  program
    .command('scaffold-team')
    .description('Generate the swarm.yaml team: block from the architecture Domain Map')
    .option('--write', 'Inject the team: block into swarm.yaml (backs up first)')
    .option('--architecture <path>', 'Path to architecture.md (default: artifacts/design/architecture.md)')
    .option('--no-fallback', 'Set fallback.enabled to false (advanced; emits warning at validation time)')
    .addHelpText('after', `
Examples:
  $ bmad-swarm scaffold-team                    Print to stdout, paste-and-edit
  $ bmad-swarm scaffold-team --write             Back up and inject
`)
    .action(async (options) => {
      try {
        await runScaffoldTeam(options);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}
```

**`runScaffoldTeam` flow** (matches `architecture-retrofit.md` §4.3):

1. Resolve `--architecture` or default to `<output.artifacts_dir>/design/architecture.md`. If `swarm.yaml` exists, read `output.artifacts_dir` from it; else default to `./artifacts`.
2. Read architecture file (refuse with AC8 message if missing).
3. Call `findDomainMap` (RT-1). If `found === false`, refuse with AC9 message.
4. Call `parseDomainMap`. If `errors.length > 0`, refuse with AC10 message (concatenate the first ~3 errors).
5. Build the `team:` JS object from the parsed domains.
6. If `options.write !== true`: `console.log(yaml.dump({ team }, { lineWidth: 120, noRefs: true }))`. Done.
7. If `options.write === true`:
   - Verify `swarm.yaml` exists (refuse with AC11 message if not).
   - `loadSwarmConfig('swarm.yaml')` — if it fails, propagate the error (the user has a corrupted yaml).
   - If parsed config has `team` key with `mode` or `specializations` already: build the would-be-generated block, compute unified diff against the existing block, refuse with AC7 message.
   - Read raw `swarm.yaml` text, parse as JS object, add `team` key, dump back.
   - Write to `swarm.yaml.tmp`, fsync (`fs.fsyncSync` after open/write), rename to `swarm.yaml`.
   - Round-trip validate via `loadSwarmConfig('swarm.yaml')`. If it fails, restore `swarm.yaml` from `swarm.yaml.bak` (`copyFileSync`), exit code 1.
   - Print success.

**YAML emission** — use `yaml.dump({ team: { mode: 'fixed', specializations: [...], fallback: {...} } }, { lineWidth: 120, noRefs: true })`. Match `cli/init.js:101` for consistency.

**The `# model: opus` commented line** — `js-yaml.dump` does not preserve comments. To emit a comment, post-process the dumped string: after each `domain:` line, inject `      # model: opus  # uncomment to override defaults.model`. This is a string transform, not a YAML feature. Document the post-process in code comments.

**Trailing reviewer hint** — append a literal block comment at the end of the printed output (only in the print path, NOT the `--write` path — the comment shouldn't pollute the user's `swarm.yaml`):

```yaml
  # To add per-domain reviewer specialization, append entries with:
  #   - role: reviewer
  #     domain: <one of the above>
```

**Diff implementation** — for AC7, the user needs to see what's different between the existing and proposed `team:` blocks. Options:
- Add `diff` as a runtime dep (~30KB, ubiquitous).
- Implement a minimal line-by-line diff inline (~50 LOC, no dep).
- Use `git diff --no-index` via subprocess (no new dep, but requires git on PATH and is slow).

This is a **tactical decision** — log to `decision-log.md` with the choice and rationale, mirroring D-012's pattern (developer choice for `js-yaml` in the hook).

### File Locations

- Create: `cli/scaffold-team.js`
- Modify: `bin/bmad-swarm.js` (register the command)
- Create: `test/scaffold-team.test.js`
- Possibly modify: `package.json` (if adding `diff` as a dep — see Task 5)

### Dependencies

Depends on **RT-1** (Domain Map parser). RT-2 imports `findDomainMap` and `parseDomainMap` from `utils/domain-map.js`.

Existing deps already cover:
- `js-yaml` — emit YAML
- `commander` — CLI registration
- Node built-ins for `fs.copyFileSync`, `fs.renameSync`, `fs.writeFileSync`, `fs.readFileSync`, `path.join`

New dep candidate: `diff` (npm) — log decision.

### Testing Approach

- Tmp directory pattern: `os.tmpdir()` + `fs.mkdtempSync` for isolated test runs.
- Each test creates fixture files inline (template literals), runs the command via direct `runScaffoldTeam` call (faster than spawning `node bin/...`), captures stdout/stderr via stubs.
- For exit-code assertions, throw a sentinel error inside `runScaffoldTeam` instead of `process.exit(1)` when running in test mode — OR catch `process.exit` in the test harness.
- Test-isolation: every test cleans up its tmp dir (use `t.after(() => rmSync(tmpDir, { recursive: true }))`).
- For AC13, an acceptable proxy: assert via spy that the implementation calls `writeFileSync(<some>.tmp, ...)` before `renameSync(<some>.tmp, finalPath)`. Real-process-kill testing is brittle.

### Anti-Patterns

- Do NOT skip the round-trip validation step. Trusting the YAML emitter to produce valid output every time fails the moment the schema or emitter changes.
- Do NOT add a `--force` flag to overwrite existing `team:` blocks. Per ADR-011 §"Alternatives considered" D, start strict.
- Do NOT prompt the user "are you sure?" on `--write`. The flag IS the confirmation.
- Do NOT preserve the `swarm.yaml.bak` in `.gitignore` automatically. Per ADR-011 §"Decision" rule note, the user opts into ignoring it.
- Do NOT auto-spawn or auto-run `bmad-swarm validate` or `bmad-swarm update` after `--write`. The success message tells the user; the user runs them. Per `architecture-retrofit.md` §12 trade-off 4.
- Do NOT auto-emit `role: reviewer` specializations from Domain Map rows. Per `architecture-retrofit.md` §4.2 / open question 3, reviewer specialization is opt-in.
- Do NOT preserve YAML comments on `--write`. Per ADR-011 §"Alternatives considered" Option B (rejected for v1), `js-yaml` is the chosen emitter; the `.bak` carries the original comments.
- Do NOT silently rename `.bak` files (e.g., `swarm.yaml.bak.20260429`). Per ADR-011 §"Alternatives considered" B, single rolled `.bak`.

### D-IDs Referenced

- **D-004** — grandparent strategic decision (wide-team specialization)
- **D-014** — parent strategic decision (retrofit tooling)
- **D-016** — tactical: `swarm.yaml` write safety strategy (this story implements via ADR-011)
- **D-005** — `swarm.yaml` `team` block schema (the output shape)
- **D-007** — story `domain:` field (informs the `description` flow)
- **D-008** — fallback default-on (sets the default for the generated block)
- **ADR-011** — write safety
- **ADR-012** — Domain Map parser contract (consumed via RT-1)

## File List

- `cli/scaffold-team.js` — new (~285 lines; exports `registerScaffoldTeamCommand`, `runScaffoldTeam`, `unifiedDiff`; private helpers `emitTeamBlockForPrint`, `atomicWrite`, `buildLcsTable`, `walkDiff`; test seams `_io`/`_cwd`/`_emitOverride`)
- `bin/bmad-swarm.js` — modified (single-line import + register call; alphabetical position after `registerDoctorCommand`)
- `test/scaffold-team.test.js` — new (21 tests covering AC1–AC14 plus aux: source-order, reviewer-hint print/no-print, pre-existing-invalid swarm.yaml, stale-`.tmp` recovery, `unifiedDiff` sanity)
- `artifacts/context/decision-log.md` — D-020 + D-021 logged (tactical, full records)
- `package.json` — NOT modified (D-020 keeps deps at 2 packages: commander + js-yaml)

## Dev Agent Record

- All 14 ACs implemented; **391/391 full suite passing** (367 pre-RT-2 + 24 new RT-2/RT-3 tests). Zero regressions.
- All 5 ADR-011 safety rules implemented faithfully: rolled `.bak`, refuse-on-conflict with diff, atomic-replace via `.tmp` + fsync + rename, round-trip validation, restore-from-bak on failure. Each rule maps 1:1 to a code path and to at least one test.
- All 7 implementation calls verified live during review and confirmed sound:
  1. AC9/AC10 disambiguation regex matches RT-1 parser shape on all 8 boundary cases (h2/h3 accepted; h1/h4/lowercase/hyphenated/inline/indented rejected).
  2. `_emitOverride` test seam is correctly underscore-prefixed, well-documented, zero production overhead.
  3. AC13 two-test approach (post-success no-`.tmp` + stale-`.tmp`-recovery) is stronger than the AC's proxy spec.
  4. Refuse-on-conflict scope uses `rawExisting.team !== undefined` (raw YAML check, NOT `loadSwarmConfig` post-defaults). Distinguishes user-authored from defaults-synthesized — verified live with Case A (no key, proceeds) and Case B (user-authored, refuses).
  5. Reviewer hint print-only — verified live in stdout (present) and on-disk swarm.yaml (absent).
  6. Source-order preservation correct posture; deliberate non-alphabetical test (`zeta`, `alpha`, `middle`) catches regressions.
  7. `fsync` before rename present and correctly ordered (writeFileSync → openSync + fsyncSync + closeSync → renameSync).
- **D-020 logged**: inline ~50 LOC LCS-style line diff; no new runtime dep; package.json deps unchanged.
- **D-021 logged**: whole-document re-emit via `js-yaml.dump`; comments and original key ordering not preserved per ADR-011 §"Negative" trade-off; `.bak` retains the original.
- **F-001/F-002 regression check clean**: emitted block uses safe values (no `defaults.model` key, fallback role hardcoded to valid `'developer'`, model line emitted as comment-only — `js-yaml.load` doesn't parse comments). Round-trip validation confirms.

### Reviewer notes (carried forward)

- **D-016 → verified, D-020 → verified, D-021 → verified** (all three status-flipped in decision-log).
- **One non-blocking follow-up suggested:** the heading-presence regex at `cli/scaffold-team.js:99` is a near-duplicate of `utils/domain-map.js:7`'s `HEADING_RE`. They should never drift, but they're not import-coupled. Symmetric in spirit to F-003 (which is acknowledged ESM/CJS-bridge-blocked). The clean forward-fix would be exporting `HEADING_RE` from `utils/domain-map.js` and importing it here — same pattern RT-1 used for `DOMAIN_SLUG_RE`. Cost: 2 lines (one export, one import). Worth doing the next time either file is touched.
- **AC14 is the only test that spawns the binary** — `commander`'s help-text registration is a `process.argv` parsing concern that doesn't fit `runScaffoldTeam`'s direct-call pattern. This is correct.
- **The `_emitOverride` test seam is a model citizen of test-only API design** — underscore-prefixed naming convention signals intent, zero production overhead, exercises real restore-from-bak logic (the production `copyFileSync` runs; only the trigger is different). Worth replicating in future CLI commands that need to test error paths that are hard to provoke from outside.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-29 | Story drafted by architect (RT-2) | architect-2 |
| 2026-04-29 | Story implemented; CLI shipped; 21 tests added; 391/391 suite green; D-020 + D-021 logged | dev-1 |
| 2026-04-29 | Review approved; status → complete; D-016 + D-020 + D-021 → verified | reviewer |
