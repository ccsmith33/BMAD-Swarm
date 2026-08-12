# Review — Honest Foundation P0

- **Date:** 2026-08-12
- **Reviewer:** reviewer (re-run after prior reviewer died mid-pass on a usage limit)
- **Lenses:** code-quality, security, test-coverage
- **Scope:** working-tree diff on branch `reinvention/honest-foundation` vs `main` (34 files, +764/-220, plus 3 untracked files: `.github/workflows/ci.yml`, `LICENSE`, `test/methodology-roles.test.js`). Note: this is all **uncommitted** working-tree state — `git log main..HEAD` is empty; nothing on this branch has been committed yet.
- **Test suite:** `npm test` — 443/443 pass, 0 fail, in an independent run (3.1s).

## Verdict: APPROVED WITH MINOR ISSUES

All six exit criteria substantially pass. No blocking (high-severity, confidence-verified) defects in the gate re-anchor or the hook logic itself. One genuine functional regression was found in the `--github` CI-workflow fix (F-018's third half): the fix trades a "never triggers" bug for a "triggers and then always fails" bug, because the CI install step pins to this repo's *unpublished* `package.json` version. This is medium severity, not blocking, because it only affects projects generated via `bmad-swarm init --github` from this exact unreleased checkout, and is trivially fixable. One process finding (medium): the epic's own decision-log entry is a dangling empty heading — no D-IDs were logged for any of the tactical implementation choices made during this epic, which is a backward-traceability gap I'm required to flag.

---

## 1. Gate soundness — team-assembly-lint discriminator

**Verified, sound.** `generators/hooks-generator.js` (`generateTeamAssemblyLintHook`, lines ~73-233):

- **Discriminator chain**: (1) `event.agent_id || event.agent_type` present → pass through (teammate/subagent context, not orchestrator main thread) — this is the exact same primary discriminator already established and independently verified for `orchestrator-write-gate.cjs` under ADR-003/HARN-1, reused here rather than reinvented. (2) `tool_input.subagent_type` absent or non-string → pass through (generic `Agent` call, not a team spawn). (3) `subagent_type` given but no `.claude/agents/<type>.md` file exists (cwd-relative) → pass through (built-in types like `Explore`/`general-purpose` are not bmad roles). Only orchestrator-main-thread spawns of a real bmad role definition reach Pass 1. I hand-traced this against `test/hooks.test.js:80-160` (`SPAWN_STDIN` canonical case, `agent_id` present case, missing-`subagent_type` case, unknown-built-in-type case) — all four boundary conditions are exercised and pass.
- **False-negative risk**: none found. A teammate spawning its own nested `Agent` call correctly passes through via the `agent_id`/`agent_type` check (this is exactly what is happening in this very review session — a teammate spawned by team-lead — so the design is validated by dogfooding, not just by test fixtures).
- **False-positive risk**: none found beyond the advisory nature already disclosed. The `subagentType + '.md'` path-join with `fs.existsSync` takes untrusted input (`subagent_type` from the tool call), but the only effect of a crafted value (e.g. containing `..`) is whether the *advisory* lint fires — it never reads file contents, never executes anything, and can only make the check stricter (more likely to require the handshake) or a no-op (skip the lint), never grant capability. Not a security-relevant injection given the hook's disclosed advisory-only role (see §6).
- **Future-mtime/skew (F-022)**: fixed and tested bidirectionally — `ageMs >= FRESH_MS` (stale) and `ageMs < -SKEW_MS` (future beyond 2-minute tolerance) are both denied; `test/hooks.test.js:378-392` exercises both the deny-on-future-beyond-skew and accept-within-skew boundary cases with real fixture mtimes, not just code inspection.
- **`$CLAUDE_PROJECT_DIR`/cwd handling**: the *hook invocation* in `getHooksConfig()` now anchors on `$CLAUDE_PROJECT_DIR` (`generators/hooks-generator.js:66-79`), fixing M-2 (previously relative `.claude/hooks/...`, which broke if Claude Code's cwd ever drifted from the project root). Internally the hook's own file reads (`LOG_REL`, `swarm.yaml`, the new `.claude/agents/<type>.md` existence check) still use `process.cwd()`, consistent with pre-existing behavior and with the harness's contract that hooks run with cwd = project root; tests explicitly isolate cwd to a tmpdir to catch any accidental leakage into the real repo (`test/hooks.test.js:36-39`). No regression here — this is the same pattern the pre-existing code already used, not new.
- **Advisory reframe is honest.** Every user-facing string was swept from "Blocked: ... TeamCreate" to "Assembly lint: ... (Advisory declared-intent lint, ADR-015 — it checks that a team plan was declared; it is not an authorization boundary.)" (`generators/hooks-generator.js:170`). `test/hooks.test.js:363-370` (`ADR-015: deny messages use Agent-spawn vocabulary, never TeamCreate`) asserts both the absence of dead vocabulary and the presence of the "not an authorization boundary" disclosure string verbatim — this is a real content-pinning test, not a shape check.

## 2. CLI fixes

### F-016 — eject + update yields a spawnable agent

**Verified correct**, both by reading and by an independent manual repro. `generateAgents`'s Layer-3 path (`generators/agent-generator.js:37-48`) now runs ejected content through `stripEjectedHeader` → `applyAgentOverrides` → conditional `TEAM_TASK_PROTOCOL` append → `applyIdentityFrontmatter`, instead of copying it verbatim. I independently ran `ejectAgent('architect', ...)` then `generateAgents(...)` against a live temp project (source template has **no** frontmatter, the harder of the two cases since it exercises the "prepend a whole new frontmatter block" branch of `applyIdentityFrontmatter`) and confirmed the output starts with exactly one `name:` and one `description:` key, correctly interleaved with the `model:` frontmatter field:

```
---
name: architect
description: "Architect teammate for bmad-swarm orchestrated work — spawned by the orchestrator via the team flow. Not for ad-hoc delegation."
model: opus
---
# Architect
...
```

The dup-key guard in `applyIdentityFrontmatter` (`content.slice(4, endIdx)` tested against `/^name:\s*\S/m` before prepending) is also exercised for the "user already stamped their own identity" case by `test/generators.test.js:532-550`. `ejectAgent` itself now places its provenance `<!-- EJECTED ... -->` comment *below* the closing frontmatter fence when one exists (`generators/agent-generator.js:243-253`), verified by `test/generators.test.js:494-506`.

**Coverage gap (low-severity, advisory):** the only automated "eject + regenerate" round-trip test uses `developer` (`test/generators.test.js:508-530`), which is the *one* agent template (of 9) that ships with pre-existing frontmatter. The no-frontmatter path — which 8 of 9 templates take, and which exercises the different `applyIdentityFrontmatter` branch (`return \`---\n${fields}\n---\n${content}\`;`) — is not covered by an assertion-bearing test; I only confirmed it works via a manual one-off run outside the suite. Recommend adding one assertion-bearing test for eject+regenerate on a no-frontmatter agent (e.g. `architect`) alongside the existing `developer` case.

### F-017 — non-TTY init fails loudly, no partial files

**Verified correct.** `cli/init.js:74-78` now throws before any interactive path is entered when `!process.stdin.isTTY`. `promptUser()` additionally wires an `rl.on('close', ...)` handler that rejects the in-flight `ask()` promise if stdin closes mid-prompt (`cli/init.js:196-227`), converting the previous silent-exit-0-with-no-error into a loud failure either way. I did not find a code path where `buildSwarmYaml`/file writes occur before the TTY check — the check is the very first branch in `runInit`, ahead of `answers = await promptUser()`. Test coverage (`test/cli.test.js`, +89 lines per the diff stat) includes the piped-stdin scenario per the story text; I did not re-run this specific case live but the code path is unambiguous (throw precedes any `writeFileSafe` call).

### F-018 — `init --github` workflow

**Two of three sub-issues genuinely fixed; the third is a new regression.** `generators/github-actions-generator.js`:

- Trigger-path composition (workflow watches `artifacts/**`/`swarm.yaml`, which D-042 now git-tracks) — fixed, consistent with the sharing-model decision.
- Dropped the `bmad-swarm doctor` step (which needs `.claude/`, gitignored, absent from a CI checkout) — fixed.
- **NEW REGRESSION (medium severity, empirically verified): `npm install -g ${pkg.name}@${pkg.version}` pins CI to a version that does not exist on the npm registry today.** `package.json` in this repo says `"version": "2.0.0"`, but `bmad-swarm` is published on npm only through `1.2.0` (`npm view bmad-swarm versions` → `["1.0.1","1.1.0","1.2.0"]`). I reproduced the failure directly:
  ```
  $ npm install -g bmad-swarm@2.0.0 --dry-run
  npm error code ETARGET
  npm error notarget No matching version found for bmad-swarm@2.0.0.
  ```
  So the generated workflow now trades the old bug (never triggers — the `paths:` filter watched gitignored files) for a new one (triggers correctly, then the very first step 404s and the run is always red). The original audit finding this fix targets (`artifacts/reviews/audit-2026-08-11-cli-generators.md` F-018) explicitly anticipated this exact trap: *"Secondary risk: `npm install -g bmad-swarm` pins CI to whatever is published under that public npm name, which this package ... does not control. ... Pin the install step to a tarball/`npx github:` ref or the actual published name."* The fix implemented the wrong half of that recommendation — it pins to the *unpublished* local name+version instead of a tarball/git ref, so it is broken by construction until a matching npm release ships.
  - **Fix recommendation:** either (a) pin to a `github:` ref of the exact commit/tag instead of the npm registry (`npm install -g github:<org>/<repo>#<sha-or-tag>`), which works regardless of publish state, or (b) if npm-registry pinning is intentional, add a release-gate check (e.g. in `cli/publish`/CI) that fails loudly if `package.json.version` isn't actually published before generating workflows that assume it is, or (c) fall back to floating `bmad-swarm@latest` with a code comment noting the tradeoff, which is at least *runnable* even if not perfectly reproducible.
  - **Test-quality note:** `test/cli.test.js:203-224` (`F-018: --github workflow is runnable from a CI checkout`) asserts `content.includes(\`npm install -g ${pkg.name}@${pkg.version}\`)` — i.e. it checks that the generator's output matches the generator's own construction of the string, not that the resulting command actually resolves against the real npm registry. **This test passes today and would keep passing even with the regression fully in place** — it cannot catch this class of bug by construction, because it has no way to observe registry state. This isn't a flaw in the test's logic so much as an inherent limitation (a unit test can't reach the network), but it means "workflow is runnable" is not actually verified by the suite — only "workflow contains a syntactically well-formed install line" is.

## 3. Test coverage — additional notes

- **F-022 (gate freshness skew)**: genuinely bidirectional, both branches exercised with real fixture mtimes (`test/hooks.test.js:378-392`), not just code-reading.
- **AP-1 (no TeamCreate vocabulary in generated commands)**: `test/generators.test.js` (`AP-1: no workflow command body references the removed TeamCreate tool`) asserts absence of the string across all 10 spawning workflow commands and presence of `Agent tool`/`subagent_type` in at least one — a real content-pinning test, not a happy-path-only check.
- **`methodology-roles.test.js` (new file)**: mechanically walks `phases.yaml` and every `task-templates/*.yaml`, collects every role staffed via `agent:`/`producer:`/`agents:`/`primary:`/`supporting:` keys, and asserts each is in the current 9-role set. This is a real regression guard — it would fail if a phantom `story-engineer`/`qa`/`tech-writer`/`retrospective` staffing were reintroduced anywhere in methodology YAML, not just a snapshot of what's there today.
- **Eject/no-frontmatter gap**: see F-016 above — the one coverage hole I found that isn't purely cosmetic.
- No test I inspected was tautological or would pass even if its target fix regressed, **except** the F-018 install-string test noted above, which is structurally incapable of catching the specific regression it's named after.

## 4. Cost-estimator numbers

**Verified current and correctly ordered.** I checked `utils/cost-estimator.js`'s `MODEL_PRICING` against live Anthropic API pricing (via the `claude-api` skill's cached-but-current-as-of-2026-06-24 pricing table, which I'm required to consult rather than rely on training-data recall for this exact question):

| Tier | Repo's table | Actual current API pricing |
|---|---|---|
| Opus (5/4.8/4.7/4.6) | $5.00 / $25.00 | $5.00 / $25.00 ✓ |
| Sonnet 5 | $3.00 / $15.00 | $3.00 / $15.00 ✓ (there's a $2/$10 intro rate through 2026-08-31, but the sticker price the repo uses is correct) |
| Haiku 4.5 | $1.00 / $5.00 | $1.00 / $5.00 ✓ |
| Fable 5 | $10.00 / $50.00 | $10.00 / $50.00 ✓ |

Fable ($10/$50) is correctly 2× the opus baseline ($5/$25), matching D-023's stated cost model and closing F-006 (the stale $15/$75 opus baseline that previously *inverted* the fable>opus cost ordering). `test/cost-estimator.test.js` adds a dedicated `prices fable above opus for the same workload` assertion (not just fixed-point checks) plus new sonnet/haiku pricing tests — good test shape, asserts the *relationship* the fix is supposed to establish, not just updated magic numbers.

## 5. Phantom deleted-role references / TeamCreate residue

**Clean.** Swept `README.md`, all 9 `agents/*.md`, `methodology/phases.yaml`, `methodology/orchestration-modes.md`, `methodology/artifact-schemas/*.md`, `CLAUDE.md`, `templates/CLAUDE.md.template` — every `story-engineer`/`QA agent`/`tech-writer`/`retrospective agent` reference was rewritten to name the role that actually absorbed the responsibility (strategist for story decomposition, reviewer's `test-coverage`/`docs` lenses for qa/tech-writer, orchestrator for retrospectives). The only surviving occurrences of the old names are in explanatory "(formerly the story-engineer role)" prose (`agents/strategist.md:83`, `methodology/phases.yaml:200`), `CHANGELOG.md` history, and `cli/update.js:145`'s `staleAgents` cleanup list — the last of which is *correct and necessary*: it's the migration code that detects and removes the old role files from existing user projects on `bmad-swarm update`, so it must keep the old names to find them.

For `TeamCreate`: zero occurrences in any generated-output surface (settings.json template now grants `"Agent"` in place of `"TeamCreate"` in the permissions allow-list and adds `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"`; all 10 workflow command bodies in `generators/commands-generator.js` were rewritten; every deny-reason string in the hooks was rewritten). The two remaining source-code hits (`generators/hooks-generator.js:73`, a comment inside the `getHooksConfig()` function body that builds a JS *object*, never a generated file's text; `cli/update.js:167`, a comment on the code that cleans up the old hook file) are both explanatory comments about the historical removal, not leakage into generated artifacts — confirmed by direct inspection of surrounding code and cross-checked against the passing `AP-1` test.

## 6. Security

**No load-bearing capability was removed by the advisory reframe.** Per the prior audit's own finding (cited in ADR-015's "Alternatives considered": "the orchestrator writes the log file, so the binding can never constrain a misbehaving orchestrator") the gate was never a real authorization boundary before this change either — this diff only makes the framing match the (unchanged) reality. The mechanics that *do* provide value — catching the honest-mistake class of "spawned a team without declaring a plan," the handshake freshness/last-fence-wins logic, Pass 2's fixed-mode routing validation — are all carried forward byte-for-byte in logic, only re-anchored to fire on `Agent` instead of the now-nonexistent `TeamCreate`. Net effect on the product's actual (as opposed to claimed) security posture: neutral-to-positive — the gate now actually fires on the live spawn path, where before this epic it silently never fired at all (dead matcher on a removed tool), which is a bigger functional gap than anything this diff introduces.

**No new path-handling/injection issue found.** The one new untrusted-input-to-filesystem-path site (`subagentType + '.md'` in the discriminator, §1 above) only gates whether an advisory check runs, never reads or executes based on the result, and is bounded by the pre-existing `fs.existsSync` failure-safe pattern already used elsewhere in the same file for `LOG_REL`/`swarm.yaml`. The `$CLAUDE_PROJECT_DIR` command-anchoring change is a hardening improvement (fixes M-2), not a new risk — it removes a cwd-drift dependency, it doesn't introduce one.

## Decision Traceability

**Backward traceability gap (medium severity).** The branch's decision-log addition (`artifacts/context/decision-log.md`, +58 lines in this diff) ends with a bare, empty section heading and no body:

```
## 2026-08-11 — bug-fix/spike (Honest Foundation P0: feasibility spikes)
<EOF>
```

Every prior D-ID in this file (through D-042) has at minimum a one-line decision/rationale; this final heading has neither. None of the tactical implementation choices made in this specific epic — the `.claude/agents/<type>.md`-existence discriminator design, the `SKEW_MS = 2 * 60 * 1000` clock-skew constant, the F-016 eject-fix's "replace body, keep envelope" strategy, the F-017 non-TTY fail-loud design, the F-018 CI-pin strategy (which per §2 above turned out to need a decision that wasn't made), the cost-estimator's corrected pricing table — are backed by a logged D-ID. Per the reviewer's standing decision-traceability mandate, this is flagged as a medium-severity finding: these are exactly the class of "tactical, implementation-level, reversible" calls the framework expects to see at least a one-line entry for, and right now there is a placeholder with nothing under it. This also means there's nothing here for me to promote from `implemented` to `verified` — there's no completed decision entry to promote.

**Forward traceability**: this epic's own driving decision is D-042 ("Execution ruling: ... Start with the 4 feasibility spikes ... on branch `reinvention/honest-foundation`. Repair epic designed after spike results land."), already logged prior to this diff. The work reviewed here (bug fixes + gate re-anchor) is consistent with that ruling in spirit — it's exactly the kind of "cheap correctness fixes ship under any Fork C answer" work ADR-015 point 4 calls out as unconditional. ADR-015 itself is still `PROPOSED — AWAITING HUMAN APPROVAL (D-033)` (per `artifacts/design/decisions/adr-015-gate-reanchor-agent-tool-and-enforcement-classes.md:4`); the gate-reanchor *code* implements what ADR-015 proposes, ahead of its formal approval. That's consistent with D-042's ruling that "cheap correctness fixes ship under any Fork C answer" (ADR-015 §4) — the gate re-anchor is squarely in that bucket, since a dead matcher on a removed tool is a bug regardless of how Fork C resolves — but it's worth the team lead's attention that an ADR still marked PROPOSED has already been implemented in full; if the human's eventual Fork C answer diverges from C2 (the reframe this code assumes), this working tree would need to be revisited.

- D-033/D-034/D-042: consulted, consistent, not contradicted by this diff.
- New decisions created during this work: none logged (see backward-traceability gap above).

---

## Summary

**Blocking findings:** none.

**Medium (advisory-but-should-fix):**
1. `generators/github-actions-generator.js` pins the generated CI workflow's `npm install -g` to this repo's unpublished `package.json` version (`2.0.0` vs npm's actual `1.2.0` ceiling) — verified via a real `npm install --dry-run` reproduction (`ETARGET`). Every project generated with `--github` from the current checkout gets a workflow guaranteed to fail on its first run. See §2.
2. The epic's decision-log entry is an empty placeholder heading with no D-IDs for any of the tactical choices made — backward-traceability gap. See "Decision Traceability."

**Low/advisory:**
- F-016's eject+regenerate test coverage only exercises the one agent template that has pre-existing frontmatter (`developer`); the no-frontmatter path (8/9 templates) is unverified by an assertion-bearing test, though I confirmed by manual repro that it works correctly today.
- The F-018 CI-pin regression test (`test/cli.test.js:203-224`) can only assert the generator's output matches its own construction, not that the pinned version actually resolves on npm — structurally unable to catch the regression it's meant to guard, worth a comment noting the limitation if not a stronger test.

**Not re-verified in depth (deferred per the task's known-deferred list, confirmed genuinely out of scope):** WS-6 self-contained scaffolds (CB-1); regenerating this repo's own live `.claude/` directory; full README rewrite (`README.proposed.md`); Fork A shell-narrowing.
