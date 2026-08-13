# Artifact Schema: The Night Charter

`artifacts/delivery/night-charter-<YYYY-MM-DD>.md` is the durable, file-not-context
record of an active `/sleep` night (diverge-overnight §1.1, phase5-decomposition
§3.1, **D-034**). It is the constitution the night runs under: the wake clock, the
work queue, and any per-night *additional* denies. It is written **exclusively**
through the pinned CLI `node .claude/bmad/bin/record.cjs night-charter …` (the
night-floor hook denies direct Edit/Write and shell-redirects onto it — no
self-legislation, §3.5.2). Date-stamped charters live in `artifacts/delivery/`
per D-036 — no sixth context file.

**Why a file, not context (diverge-overnight §1.1 property 2).** Compaction
amnesia at 3am cannot erase it; the night-floor hook re-reads it on every tool
call and the crash-only loop re-reads it at every boundary. Enforcement is
indifferent to what the LLM remembers.

## The pointer

`artifacts/delivery/.night-charter-current` holds the **basename** of the active
charter file (e.g. `night-charter-2026-08-13.md`). Its presence is the single
source of truth for "a night is open":

- **absent** → no night in progress → the floor is **dormant** (normal daytime).
- **present, target readable + parseable** → the floor evaluates the clock (below).
- **present, target missing or unparseable** → **FAIL CLOSED**: the destructive
  set stays denied and a loud doctor warning is emitted. A dangling or corrupt
  charter is never read as "no floor" (kill-list #9, failure-mode #8/#10).

`night-charter close` removes the pointer (it does not delete the dated charter —
the morning report cites it). `open` overwrites both the dated file and the pointer.

## The shape

YAML frontmatter (machine-read by the floor hook and by the Governor's
`runway.js`) + a human-readable confirmation block. **The frontmatter is the
S→GM interface** — `runway.js` parses `ends` / `ends_epoch_ms` for its clock math.

```markdown
---
night_charter:
  schema: night-charter/1
  date: 2026-08-13                              # YYYY-MM-DD; names the file
  opened_at: 2026-08-13T22:00:00-05:00          # ISO 8601 with offset (or Z)
  ends: 2026-08-14T07:00:00-05:00               # the ONLY hard resource: the clock
  ends_epoch_ms: 1755225600000                  # ends resolved to epoch ms AT OPEN TIME
                                                #   under the machine clock — the floor
                                                #   reads THIS, never re-parsing an
                                                #   ambiguous TZ string (anti clock/TZ
                                                #   manipulation; see "Clock" below)
  grace_ms: 7200000                             # H5-2(d): floor persists until the
                                                #   human-wake marker OR ends+grace,
                                                #   whichever is first (default 2h)
  queue: [BUG-141, BUG-137, FEAT-52]            # assigned work, priority order
  initiative: unrestrained                      # unrestrained | queue-only | proposals-only
  extra_deny: []                                # per-night ADDITIONS to the floor;
                                                #   APPEND-ONLY — there is no allow
                                                #   direction in this schema (D-034)
  escalation: none                              # wake-me channel (W3); ships `none` (H5-4)
  status: open                                  # open | closed
---

# Night charter — 2026-08-13

Wake at **2026-08-14T07:00:00-05:00** (in ~9h). Queue: BUG-141, BUG-137, FEAT-52.
Initiative: unrestrained. Extra denies tonight: none.

> Tonight draws the **same subscription quota** as tomorrow's day work — the clock
> is the only hard resource; there is no separate night budget (D-038).
```

## Field rules (validated by `night-charter open`)

- `ends` is **required** and must parse to a finite epoch; `open` computes and
  stores `ends_epoch_ms` from it at open time and refuses a `ends` in the past.
- `initiative` ∈ `unrestrained | queue-only | proposals-only` (default per the
  project's `sleep.initiative`, else `unrestrained` for this repo / `queue-only`
  for scaffolds — H5-1).
- `extra_deny` is a list of **additional** deny substrings compiled onto the fixed
  floor. It may only **narrow** (add denies); the schema has **no allow key** — the
  floor cannot be widened by a charter (H5-2(b), D-034 §3.5.2).
- `escalation` ships `none` (H5-4). Any other value names a wake channel that is
  NOT built in Phase 5 (the plumbing is a fast-follow).
- `status` flips `open → closed` only via `night-charter close`, which **refuses
  while `now < ends`** unless the human-wake marker exists (below).

## The human-wake marker (early wake, human-authenticated by construction)

`.claude/hooks/.human-wake` is written **only** by the `UserPromptSubmit` hook —
a real human prompt arriving while a charter is open sets it. An agent **cannot**
fire `UserPromptSubmit`, so the marker is human-authenticated by construction
(no `escalation`-channel forgery, no agent self-wake). It lives under `.claude/**`,
which the night floor write-denies for every agent, so it cannot be forged by
Edit/Write or a shell redirect during the night either. `night-charter open`
clears any stale marker so the night starts clean; its presence legitimizes an
early `close` and flips the protocol to dawn synthesis.

## The clock (anti-manipulation)

The floor's active/expired decision reads `ends_epoch_ms`, an absolute instant
fixed at open time under the machine clock — **not** a re-parse of the human
`ends` string. This removes the timezone-ambiguity and TZ-env manipulation vector
from the hot path (a `TZ=` prefix or a re-interpreted offset cannot move an
already-resolved epoch). Editing the charter to move the epoch is itself
write-denied during the night. If `ends_epoch_ms` is absent or non-numeric, the
floor treats the charter as corrupt and **fails closed**.

## Enforcement label (D-039)

The floor is **enforcement** (a PreToolUse deny + the marker's structural
un-forgeability). The Night Ladder's tripwire and anomaly detection are
**advisory** (orchestrator judgment over ledger data). `data-not-instructions`
is a **behavioral rule**, honestly prose — it is not a deterministic check and is
never labeled one.
