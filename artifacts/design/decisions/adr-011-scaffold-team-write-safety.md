# ADR-011: `bmad-swarm scaffold-team --write` safety strategy

**D-ID:** D-014 (parent strategic decision — adopt retrofit tooling for wide-team adoption)
**Grandparent D-ID:** D-004 (adopt wide-team specialization architecture)
**Status:** Proposed (pending human approval of `architecture-retrofit.md`)
**Date:** 2026-04-29
**Context:** Retrofit tooling design (Tool B — `bmad-swarm scaffold-team` CLI command). See `artifacts/design/architecture-retrofit.md` §4.

## Context

Tool B is the only piece of the retrofit feature that mutates a user-owned file (`swarm.yaml`). Every other `bmad-swarm` write target falls into one of two categories:

- **Generated files** under `.claude/`, `CLAUDE.md`: protected by the `_bmadGenerated` hash, idempotent on regeneration, never user-edited (or if edited, detected and skipped per `isFileManuallyModified`).
- **User-owned files** (`swarm.yaml`, `project.yaml`, `artifacts/`, `src/`): never touched by the toolchain, full stop. `bmad-swarm update` explicitly prints "User-owned files (swarm.yaml, overrides/, artifacts/) were not touched."

`scaffold-team --write` breaks this clean partition by writing to `swarm.yaml`. It does so deliberately — that's the user-invoked opt-in that the no-silent-migration principle (D-007 / `architecture.md` §8.4) requires. But the act of writing requires a safety strategy: under what conditions, with what backup, with what conflict handling, with what recovery on partial failure.

ADR-011 fixes the safety strategy.

## Decision

The `--write` flag operates under five rules:

1. **Single rolled `.bak` written before mutation.** Before any write to `swarm.yaml`, the CLI copies the current contents to `swarm.yaml.bak`, overwriting any prior `.bak` with no prompt and no rotation (no `.bak.1`, `.bak.2`, etc.).
2. **Refuse on conflict.** If `swarm.yaml` already has a `team:` key at the top level (under any `mode`), the write is refused. The CLI prints a unified diff between the existing `team:` block and the would-be-generated block, then exits with code 1. The user resolves manually.
3. **Round-trip validation after write.** After writing the new `swarm.yaml`, the CLI re-loads it via `loadSwarmConfig()`. If validation fails (any `validateConfig` error), the CLI restores `swarm.yaml` from `swarm.yaml.bak` and exits with code 1. The user sees both the validation error and a confirmation that the original was restored.
4. **Atomic-replace write.** Write to `swarm.yaml.tmp`, fsync, then rename to `swarm.yaml`. POSIX atomic-replace; the rename also works on Windows for same-volume writes. No half-written `swarm.yaml` is ever visible.
5. **No prompt on `--write`.** The flag itself is the user's deliberate signal. Adding an interactive "are you sure?" on top of an explicit `--write` is friction without value. (Compare `git push --force` — the flag IS the confirmation.)

## Alternatives considered

- **A. No backup; trust git.** Skip writing `.bak` entirely. Rationale would be: every `bmad-swarm` user is in a git repo (init runs `git init` if not), so `git stash` or `git checkout swarm.yaml` is the universal undo.

  Rejected because: (a) the user might have uncommitted changes to `swarm.yaml` mixed with the retrofit (e.g., they were editing the file while running retrofit); `git checkout` would destroy those edits. (b) The cost of the `.bak` is one file copy on a sub-10KB file — trivial. (c) "trust git" is a fine principle for medium-term recovery but is less ergonomic than a single same-directory `.bak` for one-step undo.

- **B. Timestamped `.bak` files (`swarm.yaml.bak.20260429-191234`).** Never overwrite a previous backup; accumulate forever.

  Rejected because: (a) every other CLI tool that writes `.bak` (vim, sed -i.bak, gpg) uses a single rolled backup. The user's mental model is already established. (b) Accumulated backups are clutter; they pollute `ls`, `git status`, and tab-completion. (c) The user's git history is the durable archive — `.bak` is one-step undo, not a full backup system. (d) If the user runs `--write` twice without committing in between, the second `.bak` is the in-between state, which is what they want for one-step undo. The pre-first-write state is in git's commit log.

- **C. Backup but no refuse-on-conflict; merge intelligently.** Detect existing `team:` block; auto-merge the would-be-generated block with the existing one, preserving overrides.

  Rejected because: (a) "intelligent merge" of YAML is an open problem; there is no universally correct merge for arbitrary user customizations. (b) Silent merging violates the no-silent-migration principle the same way silent overwriting does. (c) The diff-and-exit pattern gives the user full control. They can `vim swarm.yaml` and merge by hand, informed by the diff. (d) For the most common case (post-overlay run, no prior `team:` block), refuse-on-conflict never fires. The complexity of merge logic only kicks in for the partial-adoption case, which is rare.

- **D. Refuse on conflict but offer a `--force` flag to overwrite.** Same as the chosen design plus an escape hatch.

  Rejected for v1 because: (a) `--force` flags are an attractive nuisance — users reach for them when frustrated, then lose work. (b) The genuine use case for "overwrite my existing team: block" is "I made a mistake earlier and want to start fresh," which is better served by `git checkout swarm.yaml` followed by `--write`. (c) Adding `--force` later if users complain is one PR; removing it after users depend on it is hard. Start strict, loosen on demand.

- **E. No round-trip validation after write.** Trust the YAML emitter; skip the post-write `loadSwarmConfig` call.

  Rejected because: (a) the YAML emit step (`js-yaml.dump`) does not preserve comments and could in theory mangle exotic content (though the inputs are well-formed YAML by definition). The round-trip is cheap (one file read + parse + validate) and catches any emitter bug or schema-drift bug before the user does. (b) The cost of one post-write validation is well under 100ms; the cost of a broken `swarm.yaml` discovered the next session is much higher.

- **F. Write to a separate file (`swarm.yaml.team`) and have the user manually merge.** Don't touch `swarm.yaml` at all; emit the team-block in a sidecar.

  Rejected because: (a) it's just another way of saying "don't use `--write`" (which is already supported by the default print-to-stdout behavior). (b) Sidecars fragment the source of truth; the user has to manually merge them anyway. (c) Defeats the purpose of `--write`.

## Consequences

**Positive**

- The `.bak` provides one-step undo for the immediate session, complementing git for longer-term recovery.
- Refuse-on-conflict prevents silent overwrites; the diff is informative for manual resolution.
- Round-trip validation catches emitter or schema issues before they manifest as session failures.
- Atomic-replace write prevents partial-write corruption (e.g., process killed mid-write).
- The CLI surface is small: one flag (`--write`), one `.bak`, one refuse condition. Easy to document, easy to predict.

**Negative**

- A user running `--write` twice in a row without committing loses their pre-first-write `.bak`. Mitigation: git history. Documented in `architecture-retrofit.md` §12 trade-off 2.
- Comments in `swarm.yaml` are lost on `--write` because `js-yaml.dump` doesn't preserve them. Mitigation: the `.bak` retains them; the user can restore comments manually post-write. Documented in the success message.
- The strict refuse-on-conflict means a partial-adoption project (manually-authored `team:` block, run `scaffold-team --write` to "sync") is blocked from one-step automation. Mitigation: the user runs `scaffold-team` (no `--write`) to see the diff, edits manually. Acceptable: partial-adoption is the rare path.

**Forward-compatibility**

- A future `--force` flag to overwrite-with-backup is a one-line addition if user demand surfaces. Start strict.
- A future YAML round-trip parser (eemeli/yaml or similar) that preserves comments is a drop-in replacement for `js-yaml`; the safety strategy is unchanged.
- A future `bmad-swarm doctor` audit that reports `team:`/Domain-Map drift (mentioned as the natural next-step in `architecture-retrofit.md` §9.3) reads the same files; no change to ADR-011's strategy.

## Verification

The RT-2 story (`bmad-swarm scaffold-team` CLI) ACs cover each rule:

1. After `--write`, `swarm.yaml.bak` exists and contains the pre-write content byte-for-byte.
2. Running `--write` twice produces a `.bak` matching the post-first-write content (rolled, not accumulated).
3. With an existing `team:` key, `--write` refuses with exit code 1 and prints a diff.
4. With a Domain Map containing a row whose slug is invalid (would fail validation), `--write` writes the bad block, post-write validation fails, the original is restored from `.bak`, exit code 1, error message names the validation failure AND confirms the restore.
5. A simulated mid-write crash (process killed between tmp-write and rename — tested via injecting a failure in the test harness) leaves `swarm.yaml` unchanged. The `.tmp` may exist; the CLI's next run cleans it up or overwrites it.

## Referenced by

- `artifacts/design/architecture-retrofit.md` §4.5
- `cli/scaffold-team.js` (post-RT-2: implementation)
- `test/scaffold-team.test.js` (post-RT-2: covers the five rules)
- `artifacts/context/decision-log.md` D-014, D-016
