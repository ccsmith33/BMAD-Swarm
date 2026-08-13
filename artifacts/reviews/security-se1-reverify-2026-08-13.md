# SE-1 Re-Verification — bypasses re-attempted against the fix

- **Date:** 2026-08-13
- **Reviewer:** security (adversarial re-verification)
- **Fix under test:** commit `d913a25` ("fix: SE-1 adversarial review — real enforcement (retry 1/2)")
- **Baseline findings:** `artifacts/reviews/security-se1-2026-08-13.md`
- **Method:** the fixed hook sources and pinned scripts were copied to a runnable scaffold and driven with the SAME crafted payloads that reproduced each bypass before. Verdicts below are observed hook exit codes / deny-JSON / actual file effects, not reasoning.

## Overall verdict: CLEAR

Every blocking and medium bypass I reproduced against the pre-fix code is now CLOSED, confirmed by re-execution. Legitimate read-only orchestrator commands and the pinned CLIs still pass. One residual, non-exploitable hardening note remains on the write-gate *tripwire* (the allow-list, which is the primary control, already refuses it).

## CLOSED / STILL-OPEN table

| # | Finding | Result | Observed on re-run |
|---|---------|--------|--------------------|
| 1 | Write-gate: `$(…)` / backtick cmd-subst node -e | CLOSED | DENY (recurses into substitutions) |
| 2 | Write-gate: `echo x \| xargs node -e` | CLOSED | DENY (`xargs` in DENY_BINARIES) |
| 3 | Write-gate: `echo x \| node /dev/stdin` | CLOSED | DENY (node non-pinned script) |
| 4 | Write-gate: `find … -exec node -e` | CLOSED | DENY (`find` in DENY_BINARIES) |
| 5 | Write-gate: `git apply` / `checkout -- path` / `stash` | CLOSED | DENY (GIT_WRITE_SUBCMDS) |
| 6 | Write-gate: `patch` / `ed` / `ex` / `awk` | CLOSED | DENY (DENY_BINARIES) |
| 7 | Write-gate: `python3 -c` / `perl` interpreters | CLOSED | DENY |
| 8 | Ledger Bash bypass: orchestrator `>> ledger.md` | CLOSED | DENY (shell-writable set excludes serialized files) |
| 9 | Ledger Bash bypass: TEAMMATE `>> ledger.md` (+ decision-log, task-ledger) | CLOSED | DENY (ledger-guard now inspects Bash for all identities) |
| 10 | `record.cjs --context-dir` arbitrary-location write | CLOSED | Refused: "must be under …/artifacts" for both `src/` and `/tmp/` |
| 11 | Symlink escape: `ln -s /outside artifacts/esc` | CLOSED | DENY (ln -s target-escape check) |
| 12 | Symlink escape: Write through pre-existing symlinked dir | CLOSED | DENY (realpath-ancestor guard) |
| 13 | Replay: attacker-declared `expect.exit:1` on failing test | CLOSED | REPLAY: FAIL ("exit 1 != expected 0"); hook exit 2 |
| 14 | Replay: fail-OPEN on engine throw (NUL-byte cmd) | CLOSED | hook exit 2 (fail-closed) |
| 15 | Replay: subject-regex coverage evasion ("Implement auth module", dev owner) | CLOSED | hook exit 2 (owner-gated via `gated_owner_pattern`) |
| 16 | Replay: irrelevant `file-exists`-only bundle for a story | CLOSED | hook exit 2 (`requireExecutable` for story/bug-fix) |
| 17 | Replay: bundle points at `/tmp/self.evidence.yaml` | CLOSED | FAIL ("bundle path escapes the repo") |
| 18 | Replay: loose prefix `npm testfoo` matches `npm test` | CLOSED | FAIL (exact-token prefix, "not on allow-list") |
| 19 | Replay: `__proto__` key in bundle (prototype pollution) | CLOSED | FAIL ("refusing dangerous key") |
| 20 | Lock DoS: owner-less pre-created `.ledger.lock/` | CLOSED | Steal after 5s mtime grace; write allocated F-4 |
| — | Control: legit reads (git status/log/diff, grep, rg, cat, npm test, pinned record/replay CLIs, `git commit`) | PASS | ALLOW |
| — | Control: real subdir write `artifacts/realsub/ok.md` | PASS | ALLOW |

## Residual note (advisory, NOT a blocking bypass)

**Write-gate tripwire still misses interpreters behind an unlisted wrapper or a non-enumerated interpreter binary.** Reproduced ALLOW at the hook: `timeout 5 node -e …`, `flock /tmp/l node -e …`, `setsid node -e …`, `watch node -e …`, `script -qc "node -e 1"`, and non-enumerated interpreters `deno`, `bun`, `lua -e`, `tclsh`, `Rscript`, `make -f`, `ninja`, `busybox sh -c`, `ssh host "… > file"`.

This is **not exploitable in the shipped configuration** and does not reopen any finding, because the fix correctly relocated the primary control to a deny-by-default allow-list: none of these commands (`timeout`, `flock`, `deno`, `make`, …) are on the orchestrator's `settings.json` allow-list, so a running shell never reaches them — exactly the design stated in the hook header ("a general interpreter shell is simply not grantable"). The gap matters only if a project **widens the orchestrator allow-list** to include a wrapper/interpreter, or runs in `bypassPermissions`. 

**Recommended hardening (non-blocking):** in `leadingBinary`, treat wrapper binaries as transparent and inspect the *next* real binary (so `timeout node -e` is seen as `node -e`); and/or make the interpreter check deny-by-default for any unknown non-allow-listed binary rather than enumerating `DENY_BINARIES`. File as a new low finding (next id F-025+); do not block on it.

## Verdict

**CLEAR.** The SE-1 enforcement layer holds against every payload that broke it before. The three critical replay bypasses (declared-exit forgery, fail-open-on-throw, rename-around coverage) are closed and confirmed fail-closed; the write layer is now allow-list-primary with a hardened net; the ledger serialization channel is sealed against Bash for all identities; path confinement is realpath-anchored; and the lock DoS is bounded. Ship.
