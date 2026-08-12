# Review: Story RT-2 — `bmad-swarm scaffold-team` CLI command

**Story:** `artifacts/implementation/stories/story-RT-2-scaffold-team-cli.md`
**Reviewer:** reviewer (lenses: `code-quality`, `test-coverage`)
**Date:** 2026-04-29
**Verdict:** **approved**

---

## Summary

RT-2 lands the `bmad-swarm scaffold-team` CLI cleanly. Files modified/created:
1. **`cli/scaffold-team.js`** — new, 285 lines. Exports `registerScaffoldTeamCommand(program)` (matches `cli/doctor.js` shape), `runScaffoldTeam(options)` (test-callable with `_io`/`_cwd`/`_emitOverride` seams), `unifiedDiff(a, b, aLabel, bLabel)` (inline LCS-style diff, ~50 LOC).
2. **`bin/bmad-swarm.js`** — single-line import + register call (alphabetical position after `registerDoctorCommand`).
3. **`test/scaffold-team.test.js`** — new, 21 tests covering AC1–AC14 plus aux cases (source order, reviewer-hint print/no-print, pre-existing-invalid swarm.yaml, stale-`.tmp` recovery, `unifiedDiff` sanity).
4. **`artifacts/context/decision-log.md`** — D-020 + D-021 logged with appropriate tactical scope.

**Tests: 391/391 passing** (verified locally; 367 pre-RT-2 + 24 new from RT-2 + RT-3). Zero regressions.

**All 5 ADR-011 safety rules implemented faithfully**: rolled `.bak`, refuse-on-conflict with diff, atomic-replace via `.tmp` + fsync + rename, round-trip validation, restore-from-bak on failure. Each rule maps 1:1 to a code path and to at least one test.

**All 7 implementation calls dev-1 flagged are sound** — verified live during this review. No blocking findings. No new advisory findings. F-001/F-002 do NOT cause a regression here because the emitter only produces well-formed values (model line is commented out per AC2; fallback role hard-coded to `'developer'`).

---

## Acceptance criteria verification

| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | Print path emits valid YAML team block, exits 0, doesn't write files | PASS | `cli/scaffold-team.js:126-129` (no-write branch) calls `io.log(emitTeamBlockForPrint(team))` and returns. Test at `test/scaffold-team.test.js:97-115` verifies stdout matches `^team:`, parses cleanly back as YAML (3 specializations, source order), `swarm.yaml` byte-identical to pre-call, no `.bak` created. |
| AC2 | Each spec carries `role`/`domain`/`description`; `# model: opus` comment emitted | PASS | `cli/scaffold-team.js:118-122` builds `{role: 'developer', domain, description}` per row. `emitTeamBlockForPrint` post-processes the dump to inject `# model: opus  # uncomment to override defaults.model` after each `domain:` line. Test at `test/scaffold-team.test.js:120-129`. |
| AC3 | Defaults `mode: fixed`, `fallback.enabled: true`, `fallback.role: 'developer'` | PASS | `cli/scaffold-team.js:116-124` constructs `{mode: 'fixed', specializations: [...], fallback: {enabled: fallbackEnabled, role: 'developer'}}`. Test at `test/scaffold-team.test.js:134-142`. |
| AC4 | `--no-fallback` flips `fallback.enabled` to `false` | PASS | `cli/scaffold-team.js:115` — `fallbackEnabled = options.fallback !== false` correctly handles commander's negation pattern (commander sets `options.fallback = false` when `--no-fallback` is passed). Test at `test/scaffold-team.test.js:147-155`. |
| AC5 | `--architecture <path>` reads override path | PASS | `cli/scaffold-team.js:74-87` — when `options.architecture` is set, resolves it via `resolve(cwd, options.architecture)`; default falls back to `<output.artifacts_dir>/design/architecture.md` reading `output.artifacts_dir` from `swarm.yaml` if present. Test at `test/scaffold-team.test.js:160-170` proves the override wins by intentionally placing INVALID content at the default path and valid content at the override. |
| AC6 | `--write` injects, creates `.bak`, `loadSwarmConfig` succeeds, success message names backup | PASS | `cli/scaffold-team.js:131-193` — `--write` branch: refuses if `swarm.yaml` missing; loads + validates existing config; refuses on conflict (next AC); writes `.bak`; atomic-replaces; round-trip-validates; prints `Wrote N specializations to ...` and `Backup: ...`. Test at `test/scaffold-team.test.js:176-197` verifies all four invariants (`.bak` content byte-exact, team block present, existing keys preserved, success message names backup). |
| AC7 | `--write` refuses if `team:` key already exists; prints diff; no `.bak` | PASS | `cli/scaffold-team.js:147-160` — uses `rawExisting.team !== undefined` (raw YAML check, NOT `loadSwarmConfig` post-defaults — see implementation-call #4 below). Calls `unifiedDiff` between existing and proposed blocks; prints to stderr; throws `ScaffoldError` for exit code 1. Test at `test/scaffold-team.test.js:202-227` verifies error message, diff presence (containing `legacy-domain` AND `backend-auth`), `swarm.yaml` byte-unchanged, no `.bak` created. |
| AC8 | Refuse with documented message when architecture is missing | PASS | `cli/scaffold-team.js:90-92` — error message format: `architecture not found at <path>\n  Hint: run /feature or /plan to produce one, or pass --architecture <path>`. Test at `test/scaffold-team.test.js:232-238`. |
| AC9 | Refuse when Domain Map heading is missing | PASS | `cli/scaffold-team.js:95-102` — direct heading-presence regex probe (`/^(##\|###)\s+Domain Map\s*$/m`) used to disambiguate from AC10. Error: `no Domain Map found in <path>\n  Hint: run /retrofit-team in Claude Code to add one, or hand-author a "## Domain Map" section per agents/architect.md`. Test at `test/scaffold-team.test.js:243-250`. **See implementation-call #1 below.** |
| AC10 | Refuse when Domain Map is malformed (line-numbered) | PASS | `cli/scaffold-team.js:105-112` — calls `parseDomainMap`, surfaces first 3 errors. Two tests: `test/scaffold-team.test.js:255-269` verifies `missing the table header` + `line 3`; `271-284` verifies invalid-slug case with `line 5`. |
| AC11 | `--write` refuses when `swarm.yaml` missing | PASS | `cli/scaffold-team.js:132-134` — `no swarm.yaml found at <path>\n  Hint: run \`bmad-swarm init\` first`. Test at `test/scaffold-team.test.js:289-296`. |
| AC12 | Round-trip validation failure restores from `.bak` | PASS | `cli/scaffold-team.js:181-188` — `try { loadSwarmConfig(swarmYamlPath); } catch (err) { copyFileSync(bakPath, swarmYamlPath); ... fail('post-write validation failed; restored from swarm.yaml.bak') }`. Test at `test/scaffold-team.test.js:301-325` uses the `_emitOverride` test seam to inject an invalid emit (`type: NOT_A_VALID_TYPE`); asserts both error message paths surface AND swarm.yaml is byte-restored from `.bak`. **See implementation-call #2 below.** |
| AC13 | Atomic-replace: interrupted writes don't corrupt | PASS | `cli/scaffold-team.js:228-237` — `atomicWrite()` cleans up stale `.tmp`, writes new content, `openSync`+`fsyncSync`+`closeSync` (durable on disk), then `renameSync` (atomic). Two stronger-than-the-AC tests: post-success `swarm.yaml.tmp` does NOT exist (`test/scaffold-team.test.js:340-347`), AND a stale-`.tmp` from a prior crash is cleaned up (`349-360`). **See implementation-call #3 below.** |
| AC14 | `--help` documents all flags + examples | PASS | `cli/scaffold-team.js:30-43` — `addHelpText('after', ...)` with 3 examples (print, `--write`, `--no-fallback`) + 6 refuse-conditions enumerated. Test at `test/scaffold-team.test.js:365-377` spawns the actual binary (`node bin/bmad-swarm.js scaffold-team --help`) and asserts the strings. **Verified live during review** — full help output captured and structurally complete. |

All 14 ACs met.

---

## Seven implementation-call sanity checks (dev-1's flagged escalations)

### #1 — AC9/AC10 disambiguation via direct heading regex probe

The CLI uses `/^(##|###)\s+Domain Map\s*$/m` (line 99) to detect "is there a Domain Map heading?" before falling through to `parseDomainMap` for the malformed-table case. This is necessary because RT-1's `findDomainMap` returns `found: false` for both "no heading" AND "heading exists but malformed table" (per RT-1's "found requires ≥1 valid data row" choice that I approved last review).

**Verified live: regex matches RT-1's parser shape on all 8 boundary cases:**

| Input | Expected | Actual |
| --- | --- | --- |
| `## Domain Map` | accepted | ✓ accepted |
| `### Domain Map` | accepted | ✓ accepted |
| `# Domain Map` (h1) | rejected | ✓ rejected |
| `#### Domain Map` (h4) | rejected | ✓ rejected |
| `## domain map` (lowercase) | rejected | ✓ rejected |
| `## Domain-Map` (hyphenated) | rejected | ✓ rejected |
| `foo ## Domain Map bar` (inline) | rejected | ✓ rejected (multiline anchor) |
| `  ## Domain Map` (indented) | rejected | ✓ rejected |

The regex matches `utils/domain-map.js:7` exactly — no shape divergence. Avoiding an RT-1 surface change is the right call: changing `findDomainMap`'s contract to distinguish "no heading" from "malformed table" would break the simple `found: boolean` API that RT-3 also depends on.

**Subtle drift risk noted (not a finding):** if a future schema change accepts `Domain Map` headings beyond `##` and `###` (e.g., `####`), both this regex AND `utils/domain-map.js:7` need to change. They're not import-coupled. The cleanest forward-fix would be exporting the regex from `utils/domain-map.js` and importing it here — same pattern RT-1 followed for `DOMAIN_SLUG_RE`. **Recommend logging as a low-priority follow-up at some future point**, but absolutely not blocking RT-2.

**Confirm: regex matches RT-1 parser shape verbatim. No push-back.**

### #2 — `_emitOverride` test seam for AC12

The CLI exposes an underscore-prefixed `_emitOverride: (newDoc) => string` option (line 174) that the AC12 test uses to inject a known-invalid emit so the restore-from-bak branch can be exercised directly. The seam is documented inline ("test seam... lets a test inject a known-invalid emitted document").

**Reviewer assessment: confirm.** The seam is the right design because:
1. **Naming convention signals intent.** Underscore-prefix (`_io`, `_cwd`, `_emitOverride`) clearly marks these as internal API. Same convention as Python's `_private` and JavaScript's de-facto convention. A future reader is unlikely to think these are user-facing options.
2. **The alternative is structurally worse.** Without the seam, AC12 would require either (a) finding a real input that produces an invalid emit (hard — `js-yaml.dump` on a well-formed object always produces valid YAML), or (b) mocking `yaml.dump` globally, which would also affect `swarm.yaml.bak` writing. The seam is surgical.
3. **The seam doesn't change production code paths.** When `_emitOverride` is undefined (the production case), line 174-176 falls through to `yaml.dump(newDoc, ...)` — identical to no seam at all. No production overhead, no production behavior change.
4. **The test exercises real restore-from-bak logic.** `copyFileSync(bakPath, swarmYamlPath)` is the same line that runs in production; only the trigger is different. This is a "white-box test" of an error path that's hard to provoke from the outside; the alternative is a missing test (or a brittle external mock).

**No push-back.** The seam is a model citizen of "test-only API" design.

### #3 — AC13 atomic-replace verification (two tests instead of just the proxy)

The story's AC13 says "an acceptable substitute is a unit test that asserts the implementation uses `writeFileSync(tmpPath)` followed by `renameSync(tmpPath, finalPath)`." Dev-1 went stronger:
- **Test 1** (`test/scaffold-team.test.js:340-347`): post-success, `swarm.yaml.tmp` does NOT exist — proves the `tmp + rename` happened (no half-written state left behind).
- **Test 2** (`test/scaffold-team.test.js:349-360`): stale `.tmp` from a prior crash is cleaned up by `atomicWrite()`'s `try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}` (line 230). The CLI doesn't fail on a stale `.tmp` from a previously-killed run.

**Reviewer assessment: confirm.** Both tests are stronger than the proxy. Test 2 in particular catches a real failure mode (a previously-killed run leaves a stale `.tmp` in the way; the next `--write` would fail without the cleanup) that the proxy spec wouldn't have caught.

**Verified live (separately):** `cli/scaffold-team.js:234-235` contains the exact `openSync(tmpPath, 'r+'); try { fsyncSync(fd); } finally { closeSync(fd); }` sequence. fsync occurs after `writeFileSync` and before `renameSync` — the disk-flush happens for the tmp file's contents before the rename publishes the new path. This protects against the power-loss-between-write-and-rename failure mode.

**No push-back.**

### #4 — Refuse-on-conflict scope: `rawExisting.team !== undefined` (raw YAML, NOT post-defaults)

The CLI uses `rawExisting = loadYaml(swarmYamlPath)` (line 150) and checks `rawExisting && rawExisting.team !== undefined` for the refuse-on-conflict gate. It does NOT use `loadSwarmConfig` post-`applyDefaults` because that synthesizes an empty `team` block with `mode: 'dynamic'` for every project (per WT-1's D-005), making every project look like it has a `team:` block.

**Verified live:**
- **Case A** (raw `swarm.yaml` has NO `team:` key, defaults synthesize one): `--write` does NOT refuse. ✓ (proceeds to write the new team block)
- **Case B** (raw `swarm.yaml` has user-authored `team:` key, even minimal): `--write` REFUSES with the documented message. ✓

Distinguishing user-authored-empty-`team:` from defaults-synthesized-empty-`team:` is the correct discrimination. The user's mental model of "I wrote `team: {}` so the tool should refuse" matches the implementation.

**Subtle behavior worth noting (not a finding):** if a user writes `team:` (literal empty value, parses to `null`), `rawExisting.team !== undefined` is `true` (the key exists in the YAML even with null value), so `--write` refuses. That's defensible — the user did write something. If the user wants to clear it, they can delete the key entirely. This is the same posture as `git push --force` (the flag is the deliberate signal).

**No push-back.** Scope is correct.

### #5 — Reviewer hint print/no-print

Print path emits a trailing comment block at `cli/scaffold-team.js:215-219`:
```yaml
  # To add per-domain reviewer specialization, append entries with:
  #   - role: reviewer
  #     domain: <one of the above>
```
`--write` path does NOT emit it (only the team object goes through `yaml.dump` to disk).

**Verified live:**
- **Print path stdout** contains `role: reviewer` (the hint is rendered): ✓
- **`--write` path swarm.yaml on disk** does NOT contain `role: reviewer` or "To add per-domain reviewer": ✓

The split is correct — guidance for human eyes belongs in stdout where the user reads-and-edits before pasting into `swarm.yaml`. Polluting the user's actual `swarm.yaml` with comments they didn't author would be presumptuous.

Test at `test/scaffold-team.test.js:396-408` asserts both behaviors (presence in print, absence in both `--write` stdout AND on-disk file).

**No push-back.**

### #6 — Source order preservation

`parseDomainMap` returns rows in document order. The CLI maps them at line 118-122 with no sorting. Test at `test/scaffold-team.test.js:413-430` writes a deliberately non-alphabetical Domain Map (`zeta-feature`, `alpha-core`, `middle-thing`) and asserts the emit preserves source order. Verified.

**Reviewer assessment: confirm.** Source-order preservation is the right call because:
1. **The architect chose the order in the Domain Map.** That order presumably reflects narrative flow (e.g., "first the foundation, then the layers built on it"). Alphabetizing would erase that intent.
2. **Subsequent tools (RT-1's parser, RT-3's overlay) all preserve source order.** Sorting in RT-2 would be the only inversion; consumers reading the YAML expect it to match the table they approved.
3. **Cost of sorting is negative** — implementation simplicity, predictability, and architect-respect all argue against it.

**No push-back.**

### #7 — `fsync` before rename in `atomicWrite`

The implementation at `cli/scaffold-team.js:228-237` reopens the tmp FD with `openSync(tmpPath, 'r+')`, calls `fsyncSync(fd)`, closes the FD, then renames. **Verified live:** the regex `openSync\(tmpPath[^)]*\);\s*try\s*\{\s*fsyncSync\(fd\);\s*\}\s*finally\s*\{\s*closeSync` matches the source. The fsync happens AFTER `writeFileSync(tmpPath, ...)` and BEFORE `renameSync(tmpPath, finalPath)`.

**Reviewer assessment: confirm.** This is the correct write-durability order:
1. `writeFileSync` puts content in the kernel buffer (not on disk yet on most filesystems).
2. `openSync` + `fsyncSync` + `closeSync` flushes the kernel buffer to physical media.
3. `renameSync` is the atomic publish step — POSIX guarantees a same-volume rename is atomic.

Without fsync, a power loss between `writeFileSync` and `renameSync` could leave `swarm.yaml` post-rename pointing at an inode whose data hasn't been flushed — resulting in a zero-byte or partially-written `swarm.yaml`. With fsync, the rename publishes a file whose content is already durable on disk.

The ~1ms latency cost is acceptable for a CLI command run interactively. The user's mental model "after `--write` succeeded, my `swarm.yaml` is safe" is now formally guaranteed.

**No push-back.** Belt-and-braces, but the right kind.

---

## F-001 / F-002 regression risk check

Team-lead asked me to check whether RT-2's emitted `team:` block could trigger F-001 (`defaults.model` unvalidated against model enum) or F-002 (`team.fallback.role` not enum-validated) regression.

**Result: no regression.** The CLI's emitted block contains:
- **No `defaults.model` key** — F-001 is about `swarm.yaml:defaults.model` which is independent of the team block. RT-2 doesn't touch it.
- **`team.fallback.role` hardcoded to `'developer'`** at `cli/scaffold-team.js:123` — this is one of `VALID_SPECIALIST_ROLES` (`['developer', 'reviewer']`), so F-002 wouldn't fire even if the validator did enforce it. The hardcoded value is also correct per ADR-007 (fallback default-on, role: developer).
- **No `model:` field on emitted specializations** — the post-process injects a COMMENTED `# model: opus` line; `js-yaml.load` doesn't parse comments, so no model value flows back through `applyDefaults` or `validateConfig`.

Round-trip validation (ADR-011 rule 3) at line 182 calls `loadSwarmConfig` which runs `validateConfig`. **Verified live:** the emitted swarm.yaml round-trips through `loadSwarmConfig` without throwing, on both the no-team-key initial state AND the post-`--write` state.

F-001 and F-002 remain open as the validator-side concerns they were originally logged as. RT-2 doesn't make them worse, and doesn't depend on them being fixed.

---

## Architecture compliance — ADR-011's 5 rules

| Rule | Implementation site | Test coverage |
| --- | --- | --- |
| 1. Single rolled `.bak` before mutation | `cli/scaffold-team.js:163-164` (`copyFileSync(swarmYamlPath, bakPath)`) | AC6 (`.bak` byte-exact pre-write content), AC7 (no `.bak` on refuse) |
| 2. Refuse on conflict; print diff | `cli/scaffold-team.js:147-160` (raw-yaml check + `unifiedDiff` to stderr) | AC7 (refuse + diff + no mutation + no `.bak`) |
| 3. Round-trip validation; restore on failure | `cli/scaffold-team.js:181-188` (try/catch around `loadSwarmConfig` + `copyFileSync` restore) | AC12 (forced failure via `_emitOverride`, byte-restore verified) |
| 4. Atomic-replace via `.tmp` + fsync + rename | `cli/scaffold-team.js:228-237` (`atomicWrite()`) | AC13 (post-success no `.tmp`; stale-`.tmp` cleanup) |
| 5. No prompt on `--write` | Confirmed by absence: no `readline` import, no `prompt` call anywhere | All `--write` tests proceed without input |

All 5 rules implemented faithfully.

---

## Anti-pattern compliance (from story Dev Notes)

| Anti-pattern guidance | Honoured |
| --- | --- |
| Do NOT skip round-trip validation | YES — `loadSwarmConfig` after write at line 182. |
| Do NOT add `--force` flag | YES — no `--force` option registered. |
| Do NOT prompt on `--write` | YES — no readline / prompt. |
| Do NOT add `.bak` to `.gitignore` automatically | YES — no `.gitignore` modification. |
| Do NOT auto-spawn `bmad-swarm validate`/`update` after `--write` | YES — success message at line 192 says "Next: review the diff (`git diff swarm.yaml`), then run `bmad-swarm validate` and `bmad-swarm update`." Tells, doesn't run. |
| Do NOT auto-emit `role: reviewer` specializations | YES — only `role: 'developer'` emitted at line 119. Reviewer hint is comment-only, opt-in by hand-editing. |
| Do NOT preserve YAML comments on `--write` | YES — accepts ADR-011 §"Negative" trade-off. D-021 documents the choice. `.bak` carries the comments. |
| Do NOT silently rename `.bak` files | YES — single rolled `.bak`, overwrites on each `--write`. |

All 8 anti-patterns honoured.

---

## Lens: code-quality

**Strengths**

- **Clean module structure.** 285 lines, three exports (`registerScaffoldTeamCommand`, `runScaffoldTeam`, `unifiedDiff`), three private helpers (`emitTeamBlockForPrint`, `atomicWrite`, `buildLcsTable`/`walkDiff`). Each function has a clear responsibility.
- **Test seams via underscore-prefix options.** `_io`, `_cwd`, `_emitOverride` make the function fully testable without mocking globals or spawning subprocesses (though AC14 still spawns the binary to verify help text, which is correct — help registration is a `commander` concern). The seams have zero production overhead.
- **`fail = (msg) => { throw new ScaffoldError(msg); }` pattern** keeps refuse-paths uniform. `ScaffoldError` extends Error so the harness wrapper at line 47-49 can `console.error` + `process.exit(1)` cleanly without distinguishing error types. Tests catch the throw via try/catch — much cleaner than `process.exit` mocking.
- **The fallback-to-`./artifacts` default for architecture path** (line 77) handles the edge case where `swarm.yaml` exists but `output.artifacts_dir` is undefined. Defensive.
- **Documented `_emitOverride` use** (lines 171-173): "lets a test inject a known-invalid emitted document so the restore-from-bak branch can be exercised directly." Comment names the test, explains intent.
- **The `unifiedDiff` LCS implementation is iterative** (lines 267-284), avoiding stack-overflow risk on large diffs. 50 LOC is a reasonable size for the diff quality required (informational, human-readable, not pixel-perfect).
- **`atomicWrite` cleans up stale `.tmp` before writing** (line 230). The `try { ... } catch {}` pattern is appropriate here — if the cleanup fails for any reason, the subsequent `writeFileSync(tmpPath, ...)` will overwrite anyway.
- **D-020 + D-021 are well-scoped tactical decisions.** Both are reversible with minimal effort, both have clear rationale tied to ADR-011 §"Negative" (which already accepts the trade-offs).

**Findings (none)**

No high, medium, or low findings.

**One observation (non-finding):** The heading-presence regex at line 99 is a near-duplicate of `utils/domain-map.js:7`'s `HEADING_RE`. They should never drift, but they're not import-coupled. The cleanest forward-fix would be to export `HEADING_RE` from `utils/domain-map.js` and import it here — same pattern RT-1 used for `DOMAIN_SLUG_RE`. Cost: 2 lines (one export, one import) for one fewer drift surface. **Suggested follow-up — not a blocking finding.**

---

## Lens: test-coverage

**Quantitative**: 21 new tests covering AC1–AC14 plus aux cases. **Tests: 391/391 passing** (367 + 24 new from RT-2 + RT-3). All existing suites green.

**Qualitative**

- **`callRun` helper at lines 61-70** standardizes test setup: makes IO buffers, runs `runScaffoldTeam` with `_io`/`_cwd` injection, catches throws, returns `{io, thrown}`. Every test uses this helper — uniform error capture, uniform stdout/stderr capture. Easy to read, easy to extend.
- **Per-test temp directories via `mkdtempSync` + `mkdirSync` for `artifacts/design/` subtree** (lines 76-78) — fresh isolation per test. `afterEach` cleans up.
- **AC13 has TWO tests** (post-success no-`.tmp` + stale-`.tmp`-recovery). Stronger than the AC's stated proxy.
- **AC12 uses `_emitOverride` to force the restore path** (line 312). Without this seam, the test would have no way to provoke a post-write validation failure short of mocking `js-yaml.dump` globally.
- **AC14 spawns the actual binary** (line 366-368) — the only test that doesn't use `runScaffoldTeam` directly. This is correct: help text registration is a `commander` lifecycle concern that runs in `process.argv` parsing, not in `action()`.
- **Source-order preservation test** (line 413-430) uses deliberately non-alphabetical names (`zeta` first, `alpha` second, `middle` third) — alphabetical sort would produce a clearly-wrong order that the test would catch. Diabolic naming = good adversarial test design.
- **Pre-existing-invalid `swarm.yaml` test** (line 435-441) covers the case where the user has a corrupted YAML and runs `--write`. The CLI surfaces the existing problem rather than silently writing over it (`fail('swarm.yaml is invalid; fix it before running --write...')`). Good user experience.
- **AC7 diff assertions check both old and new content present** (lines 222-223): `legacy-domain` (old) AND `backend-auth` (new) both appear in the diff output. This catches a hypothetical regression where the diff was generated against the wrong baseline.
- **AC6 verifies existing keys preserved** (line 192: `assert.equal(parsed.project.name, 'rt2-test')`). Important — the implementation re-emits the whole document via `yaml.dump`, and a regression that dropped existing keys would silently corrupt user config.
- **`unifiedDiff` quick sanity check** (line 382-391) — tests the basic shape (`+`, `-`, ` ` prefixes; `--- a` / `+++ b` headers). Doesn't cover edge cases (empty inputs, all-different inputs) but is sufficient given the function is informational-only.

**Coverage gaps (none blocking)**

- No test for the case where `output.artifacts_dir` in `swarm.yaml` overrides the default. Defensive code path (line 81); not exercised by tests. Out of explicit AC scope; not blocking.
- No test for `--architecture` with an absolute path (vs the relative path tested at AC5). The `resolve(cwd, options.architecture)` call handles both correctly via Node's `path.resolve` semantics; visible coverage gap but defense-in-depth.
- No test asserting the exact line break between `Backup:` and `Next:` in the success message — purely cosmetic.

A separate `test-coverage-report.md` is not produced for this review — the test inventory above is sufficient given the bounded surface (one CLI module, 21 tests, 1:1+aux mapping to 14 ACs + 5 ADR-011 rules).

---

## Decision Traceability

- **D-004** (grandparent strategic — wide-team specialization adoption): Honoured — RT-2 is a user-facing surface enabling D-004 retrofit.
- **D-014** (parent strategic — adopt retrofit tooling): Honoured — RT-2 is a foundation story under D-014. Status remains `accepted` (will flip to `verified` after RT-4 lands).
- **D-016** (`swarm.yaml` write safety strategy: rolled `.bak` + refuse-on-conflict + round-trip validation): **Verified — implemented**. All 5 ADR-011 rules implemented faithfully. Status flip recommended: D-016 → `verified`.
- **D-020** (inline LCS diff, no new dep): **Verified — implemented**. `unifiedDiff` at lines 244-284 is the LCS implementation; `package.json` deps unchanged (still 2 packages: commander + js-yaml). Status flip recommended: D-020 → `verified`.
- **D-021** (whole-document re-emit via `js-yaml.dump`): **Verified — implemented**. Line 170: `const newDoc = { ...rawExisting, team }` then `yaml.dump(newDoc, ...)`. Comments and original key ordering not preserved per ADR-011 §"Negative" trade-off. Status flip recommended: D-021 → `verified`.
- **ADR-011**: Verified — every alternative rejection holds (no "trust git", no timestamped `.bak`, no auto-merge, no `--force`, no skip-validation, no sidecar file).
- **D-005** (`swarm.yaml` `team` block schema): Honoured — emit shape matches schema; round-trip validation confirms.
- **D-007** (story `domain:` field): Honoured — `description` flows from Domain Map row to `team.specializations[i].description`.
- **D-008** (fallback default-on): Honoured — default `fallback.enabled: true` at line 115; `--no-fallback` flips it.
- **ADR-012** (Domain Map parser contract): Consumed via RT-1's `parseDomainMap`. The CLI also adds a defense-in-depth `domains.length === 0` check at line 110 (fires when parser succeeds with zero data rows — not strictly possible given RT-1's `found: false`-gate, but cheap to keep).

---

## Findings register dedupe

Read `artifacts/context/findings-register.md` at review start. Three existing entries:
- **F-001** — `defaults.model` unvalidated. Not relevant to RT-2 (CLI emits no `defaults.model`).
- **F-002** — `team.fallback.role` not enum-validated. Not relevant to RT-2 (CLI hardcodes `'developer'`, which IS in the valid enum).
- **F-003** — hook duplicates `utils/config.js` fallback defaults. Not relevant to RT-2 (CLI uses `loadSwarmConfig`, no duplication).

No regressions of existing findings. RT-2 produces no new findings.

(One subtle observation: the CLI's heading-presence regex at line 99 is a near-duplicate of `utils/domain-map.js:7`'s `HEADING_RE`. Symmetric to F-003 but not identical — both are ESM and could be import-coupled with a 2-line change. **Recommend logging as a low-priority follow-up at some future point** when either side is next changed; not blocking RT-2 and not warranting an F-NNN entry now since the regex is small enough to inspect by eye.)

---

## Verdict

**approved**

All 14 acceptance criteria met. **391/391 tests passing**. All 5 ADR-011 safety rules implemented faithfully. All 8 anti-patterns honoured.

All 7 implementation calls dev-1 flagged are sound — verified live during this review:
1. **AC9/AC10 disambiguation regex** matches RT-1 parser shape on all 8 boundary cases.
2. **`_emitOverride` test seam** is correctly underscore-prefixed, well-documented, zero production overhead.
3. **AC13 two-test approach** is stronger than the proxy spec; covers stale-`.tmp` recovery as well.
4. **Refuse-on-conflict scope** correctly distinguishes user-authored from defaults-synthesized via raw-YAML check; verified live with both Case A (no key) and Case B (user-authored).
5. **Reviewer hint print-only** verified live — present in stdout, absent in `--write`'s on-disk file.
6. **Source-order preservation** correct posture; deliberate non-alphabetical test catches regressions.
7. **`fsync` before rename** present and correctly ordered (write → fsync → rename).

F-001/F-002 do NOT cause a regression here because the emitted block uses safe values (no `defaults.model`, fallback role hardcoded to valid `'developer'`, model line emitted as comment-only).

D-016, D-020, D-021 status flips to `verified` recommended. RT-1 + RT-2 + RT-3 all approved. Pending: RT-4 (retrofit docs). After RT-4 approval, D-014 flips to `verified` and the retrofit feature is implementation-complete pending end-of-feature `bmad-swarm update` regen.
