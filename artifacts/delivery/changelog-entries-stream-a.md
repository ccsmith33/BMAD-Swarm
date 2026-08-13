# Changelog entries — Stream A (project-aware orchestrator allow-list)

The integrator concatenates these into `CHANGELOG.md` at assembly (do NOT edit
`CHANGELOG.md` from this stream — assembly protocol §6.3).

### Added
- **Project-aware orchestrator allow-list** (`permissions.orchestrator_allow` in `swarm.yaml`). Each project can declare the read-only + coordination commands its orchestrator needs prompt-free, e.g. `Bash(cargo check:*)`. Entries are merged onto a widened safe default by the settings generator. (ADR-017 Amendment 1)
- **Widened safe default:** scaffolded projects now get coordination git (`git commit`/`push`/`fetch`/`merge --ff-only`/`checkout`/`switch`/`branch`/`tag`) and the read-only `bmad-swarm` CLI (`validate`/`doctor`/`status`/`scan`) in the orchestrator allow-list — no more prompts for routine coordination. The write-gate still denies the write/destructive vectors inside those shapes.
- **`bmad-swarm update --swap-live-hooks`** flag to explicitly regenerate `.claude/hooks/` + `settings.json` while a session is live (off by default).

### Changed
- **Orchestrator write-gate git inspection** now distinguishes coordination git from tree/history rewrites. Denies write-vector git (`apply`, `restore`, `am`, `stash`, `mv`, `rm`, `checkout`/`switch` with a pathspec) and destructive git (`reset --hard/--merge/--keep`, `clean`, `push --force`-family, non-`--ff-only` `merge`, `pull` without `--ff-only`, `rebase`, `filter-branch`, `update-ref`, `-c alias.*`, `--exec-path`). Allows the coordination set.
- **`bmad-swarm update` no longer hot-swaps live enforcement.** While `.claude/hooks/.session-active` exists, it skips regenerating `.claude/hooks/` and `settings.json` (this wedged the 2026-08-13 merge). `--force` does not override the skip — use `--swap-live-hooks`.
- **Invalid `permissions.orchestrator_allow` entries fail config load loudly** — every `loadSwarmConfig` caller (`init`, `update`, `validate`, `doctor`, `start`) surfaces the error rather than silently dropping the entry.

### Fixed
- **Git subcommand parsing in the write-gate** misread `git -C /path <subcommand>`: the argument to `-C` was taken as the subcommand, so `git -C . apply evil.patch` slipped past the deny-set. Option-with-argument globals (`-C`, `-c`, `--git-dir`, `--work-tree`, `--namespace`) are now consumed before subcommand resolution; `-c alias.*`/`-c …!` and `--exec-path` are denied outright.

### Removed
- **`project.yaml` removed from the orchestrator writable set** (D-037 retires the file; the Stream B cutover relies on this). Phase writes flow through the CLI.

Security posture (ADR-017) is preserved by construction: the validator's deny sets and the gate's deny sets are pinned to each other by a source-parsing consistency test, and a validator escape still cannot grant writes (the runtime write-gate is an independent layer).
