# Architecture: Retrofit Tooling for Wide-Team Adoption

**Status:** Proposed (pending human approval)
**Date:** 2026-04-29
**Parent decision:** D-014 (adopt retrofit tooling for wide-team — this document proposes it)
**Grandparent decision:** D-004 (adopt wide-team specialization architecture)
**Source brief:** team-lead task "Design retrofit tooling for wide-team adoption (D-014 candidate)"
**Related:** `artifacts/design/architecture.md` §9 (retrofit path, deferred to documentation), §10.6 (CLI implications, `migrate-to-fixed` umbrella explicitly rejected)

---

## 1. Overview

The wide-team feature (D-004, shipped under D-005–D-013) is strictly opt-in. To adopt it, an existing project needs two manual edits:

1. A `## Domain Map` section appended to `artifacts/design/architecture.md`.
2. A matching `team:` block injected into `swarm.yaml`.

For greenfield projects, both edits land naturally — the architect produces the domain map as part of the architecture, and the user (or orchestrator) writes the `team:` block once. For brownfield projects, both edits are friction the user must do by hand. This document specifies tooling that removes the friction without weakening the **no-silent-migration** principle established in `architecture.md` §8.4 / D-007: the user must invoke each tool explicitly; nothing happens on `bmad-swarm update`.

### 1.1 Two tools, one chain

```
existing project   ─┐                          ┌─►  scaffold-team --write
(no Domain Map,     │                          │     ├─ writes team: block to swarm.yaml
 no team: block)    │   /retrofit-team         │     ├─ creates swarm.yaml.bak
                    ├─►  ├─ proposes Domain   ─┤     └─ refuses if team: exists
                    │   │   Map                │
                    │   ├─ HUMAN APPROVAL     ─┤  (or print to stdout — default)
                    │   └─ writes architecture │
                    │      .md                 │
                    │                          │
        wide-team   │                          │
        adopted     │                          │
                    └──────────────────────────┘
```

Each tool stands alone:

- **Tool A** (`/retrofit-team` slash command) is for projects that have an architecture but no Domain Map. It reads the existing architecture, applies the heuristics already documented in `agents/architect.md`'s "Domain Map" section, proposes a Domain Map, and (after human approval per the CLAUDE.md invariant on `architecture` artifacts) writes it into `architecture.md`.
- **Tool B** (`bmad-swarm scaffold-team` CLI) is for projects that have a Domain Map but no `team:` block. It parses the Domain Map and emits the corresponding `team:` block. Default: print to stdout. With `--write`: backs up `swarm.yaml`, injects the block.

Either can be used standalone. The chain is the common case (architecture-without-domain-map → run Tool A → run Tool B), but a project that hand-authored a Domain Map can skip directly to Tool B, and a project that wants only the Domain Map (e.g., to keep dynamic mode but make routing explicit per `agents/architect.md`'s "recommended for >10 stories" guidance) can stop after Tool A.

### 1.2 Goals (in scope)

1. Remove both retrofit-edit frictions for adopters of wide-team.
2. Preserve the no-silent-migration principle: every edit is user-invoked.
3. Match existing patterns: Tool A behaves like other orchestrator-overlay slash commands (`/brainstorm`, `/explore-idea`); Tool B behaves like other read-mostly CLI commands (`scan`, `doctor`).
4. Strictly backward compatible: projects that never run these tools see zero behavior change.
5. Safe for partial adoption: a project that already has `team:` but no Domain Map (or vice versa) is handled gracefully, never silently overwritten.
6. Refuses with clear messages on every ambiguous edge case rather than guessing.

### 1.3 Non-goals (explicitly out of scope)

- Auto-detecting domains from source code. The architect's heuristics (read the architecture, apply the ≥2-story rule, etc.) are sufficient and already documented; no code-scan is needed.
- Auto-migrating existing stories to add `## Domain:` headings. Story-engineer task; out of scope for retrofit.
- A `bmad-swarm migrate-to-fixed` umbrella command. Explicitly rejected in `architecture.md` §10.6.
- Any change to wide-team itself (D-004 through D-013 are stable).
- Addressing F-001/F-002/F-003 advisory findings (separate backlog).

### 1.4 Context boundary (what changes vs. what stays)

| Surface | Stays the same | Changes |
| --- | --- | --- |
| `bmad-swarm init` | Yes | — |
| `bmad-swarm update` | Yes | — |
| `swarm.yaml` schema (D-005, ADR-004) | Yes | — |
| Story `## Domain:` field (D-007, ADR-006) | Yes | — |
| Domain Map heuristics in `agents/architect.md` | Yes | — (§8 of this doc surfaces a small workflow note) |
| Orchestrator-write-gate (ADR-003) | Yes | — (§4.4 of this doc explicitly relies on its existing allow-list) |
| `teamcreate-gate` Pass 2 (ADR-008) | Yes | — |
| Orchestrator slash commands | — | New `/retrofit-team` (overlay pattern, see §3) |
| CLI commands | — | New `bmad-swarm scaffold-team` (see §4) |
| Generators | — | `commands-generator.js` adds one workflow command body |
| `agents/architect.md` | — | Tiny addendum noting the retrofit entry path (§8) |

---

## 2. Design overview

### 2.1 Tool A: `/retrofit-team` — orchestrator overlay

**Shape:** Orchestrator overlay, parallel to `/brainstorm` (D-BRN-1) and `/explore-idea` (D-BRN-4). The orchestrator loads the architect role into its own session, reads the existing architecture, applies the Domain Map heuristics, proposes a Domain Map back to the user, and on human approval edits `architecture.md` to add the Domain Map section.

**Decision argued in ADR-010** (`adr-010-retrofit-team-overlay-vs-spawn.md`). Summary: overlay wins because (a) the work is conversational (the human iterates on the domain partition before approving), (b) it touches a human-approval-gated artifact (`architecture.md` per CLAUDE.md invariant) so a teammate-spawn would relay-loop the approval handshake, and (c) the entire output is one section appended to one file — full-architect spawn machinery is overkill.

**Output:** the Domain Map section per the format in `agents/architect.md`, inserted into `architecture.md` at a position chosen per §3.4.

**Refuse conditions:**

- No `artifacts/design/architecture.md` → fail with "no architecture document found; run `/feature` or `/plan` first to produce one".
- Architecture already has a `## Domain Map` section → refuse, show the existing section, prompt the user to either remove it or run `bmad-swarm scaffold-team` directly.
- Architecture file looks unparseable as markdown (e.g., binary content) → fail-fast with a read-error message.

### 2.2 Tool B: `bmad-swarm scaffold-team` — CLI command

**Shape:** Standard `bmad-swarm` CLI subcommand, parallel to `bmad-swarm doctor` and `bmad-swarm scan`. Reads the Domain Map from `architecture.md`, generates the corresponding `team:` block, prints to stdout (default) or writes to `swarm.yaml` with `--write`.

**Default behavior (no flag):** print the YAML to stdout. User pastes into `swarm.yaml` and edits as desired. This is the safe default — no file mutation.

**`--write` behavior:** backs up `swarm.yaml` to `swarm.yaml.bak` (overwriting any prior `.bak`), then injects the `team:` block at the top level of the YAML, preserving comments and ordering of other top-level keys.

**Backup-and-write strategy argued in ADR-011** (`adr-011-scaffold-team-write-safety.md`). Summary: the `.bak` companion is the lightest-weight safety net consistent with how the rest of the toolchain handles user-owned files (`updateGitignore` does no backup but only appends; `bmad-swarm eject` operates on generated files only). For mutating `swarm.yaml` — which is unambiguously user-owned — a single rolled `.bak` plus refuse-on-conflict is enough; the user already has git for further history.

**Refuse conditions (with exit code 1):**

- No `artifacts/design/architecture.md` → "architecture not found; run `/feature` or `/plan` to produce one".
- Architecture has no `## Domain Map` section → "no Domain Map found in architecture.md; run `/retrofit-team` first to generate one".
- `--write` and `swarm.yaml` already has a `team:` block → "swarm.yaml already has a team: block; remove it manually or print without --write to compare". Show a unified diff between the existing block and the would-be-generated block to help the user decide.
- `--write` and `swarm.yaml` is missing → "no swarm.yaml found; run `bmad-swarm init` first".
- Domain Map section is present but malformed (no table, missing required columns) → "Domain Map at architecture.md:NNN is malformed: <reason>". Point at the parser contract (§5) so the user knows what shape to fix.

### 2.3 Domain Map parser

A shared utility module `utils/domain-map.js` exporting two functions:

- `findDomainMap(markdown: string): { found: boolean, startLine: number, endLine: number, raw: string } | null`
- `parseDomainMap(raw: string): { domains: Array<{ domain, description, components, anticipatedStories }>, errors: string[] }`

Used by Tool B to read what Tool A wrote. Contract argued in ADR-012 (`adr-012-domain-map-parser-contract.md`). Summary: the parser locks the format to a markdown table immediately under a `## Domain Map` heading (or `### Domain Map` — both accepted). The first column is the kebab-case domain slug; the parser rejects rows whose slug doesn't pass the same regex the validator uses (`^[a-z0-9][a-z0-9-]*[a-z0-9]$`). The `Components` and `Anticipated stories` columns are passed through as free text into the spawn-brief (`description` column flows into `team.specializations[i].description`).

This contract is **deliberately strict**. Permissive markdown parsing (try-various-shapes-until-something-works) creates routing bugs that are very hard to debug. The Domain Map is generated by Tool A under a known format, and hand-authored Domain Maps must follow the same format (the format is already in `agents/architect.md`). Loud failure on shape drift catches authoring mistakes immediately.

### 2.4 The full chain — what the user sees

A representative session for a brownfield adopter:

```
$ # 1. In Claude Code session:
> /retrofit-team
[orchestrator-overlay starts; reads architecture.md; proposes Domain Map]
[user iterates with the orchestrator on the partition]
[user approves; orchestrator edits architecture.md to insert the section]
> [exits overlay]

$ # 2. In shell:
$ bmad-swarm scaffold-team
team:
  mode: fixed
  specializations:
    - role: developer
      domain: backend-auth
      description: OAuth2/PKCE, sessions, password flows
    - role: developer
      domain: backend-upload
      description: File ingestion, S3, virus scan
    - role: developer
      domain: frontend-dashboard
      description: React dashboard pages
  fallback:
    enabled: true
    role: developer

$ # 3. User reviews, then writes:
$ bmad-swarm scaffold-team --write
✓ Backed up swarm.yaml -> swarm.yaml.bak
✓ Injected team: block into swarm.yaml
Run `bmad-swarm validate` to confirm the new config parses.

$ bmad-swarm validate
✓ swarm.yaml is valid

$ # 4. Next session:
$ bmad-swarm start
[orchestrator now in fixed mode, pre-spawns roster from team.specializations]
```

Each step is reversible: `architecture.md` edits live in git; `swarm.yaml` has the `.bak`; nothing under `.claude/` was touched.

---

## 3. Tool A — `/retrofit-team` design

### 3.1 Why orchestrator overlay (vs. teammate spawn)

The full argument is in **ADR-010**. The summary:

| Property | Overlay (chosen) | Architect spawn (rejected) |
| --- | --- | --- |
| Conversational iteration with human | Native (orchestrator owns the human channel) | Relay-only (architect would have to SendMessage every iteration) |
| Human approval gate on architecture.md | One handshake (orchestrator pauses for ack) | Two-hop relay (architect → orchestrator → human → orchestrator → architect) |
| Writes architecture.md | Orchestrator can write `artifacts/design/decisions/` already; needs allow-list extension OR hands off the file edit to a one-off architect spawn for just the write | Architect can write `architecture.md` natively |
| Generator complexity | Add one body to `commands-generator.js` (matches `/brainstorm` pattern) | Add one body to `commands-generator.js` plus a spawn brief template |
| Cost (token/$) | One overlay session | One overlay session + one architect spawn for the write |

The "orchestrator can't write architecture.md" objection is real but solvable two ways: (a) extend the orchestrator-write-gate allow-list to permit `artifacts/design/architecture.md` for this specific overlay (tightly scoped, like the `settings.local.json` extension in ADR-003), or (b) at the end of the overlay, the orchestrator emits a one-off `bmad-assembly` block that spawns a single-task architect to perform the file edit. **ADR-010 chooses option (b)**: it keeps the existing write-gate invariant pristine (no per-overlay carve-outs), uses the existing `/feature`-style spawn flow for the actual file edit, and the architect-spawn is short-lived and trivial (one Edit call, no design work — the design is already in the orchestrator's overlay output).

### 3.2 Slash command body (specification)

The `/retrofit-team` body (generated by `commands-generator.js`) instructs the orchestrator to:

1. Refuse if `swarm.yaml:team.mode === 'fixed'` AND `team.specializations` is non-empty (the project is already wide-team; no retrofit needed). Show the existing config and exit.
2. Refuse if `artifacts/design/architecture.md` does not exist (point at `/feature` or `/plan`).
3. Read the architecture in full. Detect existing `## Domain Map` section. If present, show it to the user and ask whether to refuse (default), append a fresh proposal as a comment, or replace (requires explicit confirmation).
4. Load the architect role identity (`agents/architect.md` "Domain Map" section) into the overlay context.
5. Propose a Domain Map by walking the architecture's component sections and applying the four heuristics (≥2-story rule, architecturally-significant exception, cross-cutting dependencies, orthogonality test).
6. Present the proposed map to the user as the table format from `agents/architect.md`. Iterate until the user approves.
7. **Human approval gate.** Pause and explicitly ask "approve the Domain Map for insertion into architecture.md?" — this is the architecture human-approval invariant from CLAUDE.md.
8. On approval: emit a `bmad-assembly` block spawning a single architect teammate with a precise brief: "Insert this Domain Map (verbatim) at <position> in `artifacts/design/architecture.md`. Do not edit any other content. Do not add an ADR — this is a doc patch, not a design decision."
9. After the architect reports completion, log a tactical D-ID to `artifacts/context/decision-log.md`: `D-NNN — Retrofit Domain Map added to architecture.md via /retrofit-team`.
10. Tell the user the next step: `bmad-swarm scaffold-team` (or `--write` to inject).

Step 8 is the cleanest way to honor "orchestrator never edits artifacts." The architect spawn does one Edit, reports back, exits.

### 3.3 The architect spawn brief

The orchestrator's TeamCreate brief for step 8 is intentionally minimal:

```
Insert the following Domain Map section into artifacts/design/architecture.md.
Position: after section §<N> (the position chosen per §3.4).
Do not edit any other content. Do not write an ADR. Do not modify the existing component diagram.
After the edit, report back with one line: "Inserted Domain Map at <line>".

<the approved Domain Map table verbatim>
```

The architect's role allows architecture.md edits natively; no allow-list change required.

### 3.4 Where to insert the Domain Map in `architecture.md`

The Domain Map section should land after the architecture's main system overview/component section but before any section that depends on routing (e.g., a wide-team-related section if one already exists). The orchestrator chooses one of these positions in priority order:

1. Immediately after a section titled `## Components` / `## Architecture` / `## System Overview` if present.
2. Immediately before any existing section with `domain` or `team` in its heading.
3. Otherwise, append at the end of the document (before any "References" or "Appendix" section if present).

The orchestrator announces the chosen position before approval. The user can override.

### 3.5 What if the architecture is missing or thin?

`/retrofit-team` is for projects that have a meaningful architecture document already. If the document exists but is a stub (e.g., a single paragraph), the orchestrator surfaces this and recommends running `/feature` or `/plan` first to flesh it out. It does NOT fabricate a domain map from a thin document — the heuristics need real component information.

### 3.6 Idempotence and re-runs

Re-running `/retrofit-team` on a project that already has a Domain Map is the most likely "user error" path. Behavior:

- Detect existing Domain Map. Show it. Prompt: refuse (default), append-as-comment, or replace.
- "Replace" requires the user to type the word `replace` (not just yes/no). This is the same rationale as `git push --force` — destructive overwrites need a deliberate signal.

---

## 4. Tool B — `bmad-swarm scaffold-team` design

### 4.1 CLI shape

```
$ bmad-swarm scaffold-team [--write]

Read the Domain Map from artifacts/design/architecture.md and emit the
corresponding swarm.yaml team: block.

Default: print to stdout.
With --write: back up swarm.yaml to swarm.yaml.bak and inject the block.

Options:
  --write              Inject the team: block into swarm.yaml. Backs up first.
  --architecture <p>   Override the path to architecture.md (default:
                       artifacts/design/architecture.md).
  --no-fallback        Generate a team: block with fallback.enabled=false (advanced;
                       triggers a warning at validation time per ADR-007).

Examples:
  $ bmad-swarm scaffold-team                    Print to stdout, paste-and-edit
  $ bmad-swarm scaffold-team --write             Back up and inject
  $ bmad-swarm scaffold-team --architecture path/to/architecture.md
```

The `--architecture` flag is a small ergonomic win for projects with non-default artifact directories (the `output.artifacts_dir` is configurable in `swarm.yaml`). Default: read `swarm.yaml`'s `output.artifacts_dir` to find the architecture. If `swarm.yaml` doesn't exist yet (impossible in practice — see §4.5 refuse rules — but theoretically), fall back to `./artifacts/design/architecture.md`.

### 4.2 Generated output shape

The block follows ADR-004's schema verbatim. For each Domain Map row:

```yaml
team:
  mode: fixed
  specializations:
    - role: developer
      domain: <slug>
      description: <description-column-content>
      # model: opus  # uncomment to override defaults.model
  fallback:
    enabled: true       # set false to enforce strict routing (warning emitted)
    role: developer
```

Notes on the generated output:

- `model:` lines for each specialization are commented-out by default. The user uncomments only when overriding `defaults.model`. (Per ADR-004 §3.4, `model` defaults inherit `defaults.model`.)
- One `developer` per Domain Map row. Reviewer specialization is NOT auto-generated — per `architecture.md` §15 open question 1 (resolved by D-011), reviewer specialization is "allowed but optional"; auto-generating reviewers would silently force a choice the user might not want. The output includes a trailing comment hinting at the option:
  ```yaml
  # To add per-domain reviewer specialization, append entries with:
  #   - role: reviewer
  #     domain: <one of the above>
  ```
- The `description` column from the Domain Map table is copied verbatim into `description:`. This is the value that flows into the orchestrator's spawn brief per ADR-004 §3.2 and ADR-009.
- `fallback.enabled` is `true` by default per ADR-007. `--no-fallback` flips it to `false` and the user gets the validator's startup warning at next load.

### 4.3 The `--write` flow (detailed)

```
1. Validate swarm.yaml exists (refuse if not — point at `bmad-swarm init`).
2. Validate architecture.md exists (refuse if not — point at /feature or /plan).
3. Parse architecture.md, extract Domain Map (refuse if missing — point at /retrofit-team).
4. Parse Domain Map (refuse loudly if malformed — show offending lines).
5. Read current swarm.yaml as YAML.
6. If swarm.yaml.team is present (under any mode):
   - Compute the would-be-generated block.
   - Print a unified diff between the existing block and the proposed block.
   - Refuse with: "swarm.yaml already has a team: block; resolve manually."
   - Exit with code 1.
7. Back up: copy swarm.yaml -> swarm.yaml.bak (overwriting any prior .bak with no
   prompt — same rationale as git's autosave-on-merge: one rolled .bak is enough,
   git history is the long-term archive).
8. Inject the team: block at the top level. Preserve all existing keys, comments,
   and ordering. Insert after the last existing top-level key (so it appears at
   the end of the file, minimizing diff churn).
9. Validate the new file via loadSwarmConfig() (round-trip). Refuse and restore
   from .bak if validation fails.
10. Print success: "Backed up swarm.yaml -> swarm.yaml.bak. Injected team: block."
11. Suggest next step: "Run `bmad-swarm validate` to confirm, then `bmad-swarm
    update` if you want CLAUDE.md to render the Team mode line (D-013)."
```

Step 9 (round-trip validation) is the safety net: even if the parser/emitter has a bug, the post-write validation will catch it before the user discovers a broken `swarm.yaml` in the next session.

### 4.4 Why no Edit-tool / hook interaction

`scaffold-team` is a CLI command running in a normal shell process. It does not invoke Claude Code's tool layer, so the orchestrator-write-gate (ADR-003) and `teamcreate-gate` (ADR-008) do not apply. The CLI writes `swarm.yaml` directly via Node's `fs.writeFileSync`, exactly like `bmad-swarm init` does today. This is the right level — the CLI is part of the `bmad-swarm` package, not a teammate, and the package has always had write access to `swarm.yaml`.

### 4.5 swarm.yaml-write safety strategy (full)

Argued in **ADR-011**. Summary:

- **Backup mechanism**: `swarm.yaml.bak`, single rolled file, written *before* mutation. No timestamps, no rotation. Rationale: git is the durable history; `.bak` is one-step undo for the immediate session.
- **Refuse on conflict**: existing `team:` block is never overwritten. The diff is shown to inform the user's manual resolution.
- **Round-trip validation**: after mutation, re-load via `loadSwarmConfig`. If validation fails, restore from `.bak` and exit with code 1.
- **Atomic-ish write**: write to `swarm.yaml.tmp`, fsync, rename to `swarm.yaml`. Standard atomic-replace on POSIX; on Windows the rename also works for same-volume ops (the only platform `bmad-swarm` targets non-Linux is Windows, per `cli/init.js` git-init fallback comment).
- **No prompt before backup**: writing the `.bak` is implicit. The CLI is a deliberate user-invoked action; prompting on top of `--write` is friction without value.
- **`.gitignore` does NOT cover `swarm.yaml.bak`**: deliberate. The user might want the `.bak` checked in to recover from a bad commit. The user can add `swarm.yaml.bak` to `.gitignore` themselves if desired. (Unlike `.claude/` and friends, which are auto-added by `updateGitignore`, the `.bak` is an artifact of a manual mutation, not a generated file.)

### 4.6 YAML emit strategy (preserving existing keys, comments)

The cheapest correct option: use the existing `js-yaml` dependency (already in `cli/init.js` and `utils/config.js`) to:

1. Load the YAML as an object.
2. Add the `team` key at the object level.
3. Dump back with `yaml.dump(obj, { lineWidth: 120, noRefs: true })`.

This is exactly the pattern `cli/init.js` uses to write the initial `swarm.yaml`. The cost: **comments and ordering of existing keys are not preserved by `js-yaml.dump`** — it normalizes to its own canonical order and strips comments.

ADR-011 evaluates two options:

- **Option A (chosen): use `js-yaml`, preserve nothing else.** Simpler, fewer dependencies, matches `init.js`. The user's comments in `swarm.yaml` are uncommon (this repo's own `swarm.yaml` has none) and the `.bak` provides recovery. Documented in the success message: "Existing comments in swarm.yaml were preserved in swarm.yaml.bak."
- **Option B (rejected for v1): pull in `yaml` (the eemeli/yaml package, supports round-trip with comments).** New dependency for a feature whose primary use case (a fresh `swarm.yaml` from `init` with no user comments) doesn't need it. Adds bundle weight. If users complain, Option B is a one-line dependency add and a parser swap; deferred until we see the pain.

### 4.7 Idempotence

Running `bmad-swarm scaffold-team` (no `--write`) is read-only and idempotent — same input, same stdout, every time.

Running `bmad-swarm scaffold-team --write` twice in a row:

- First run: `team:` absent → injects, creates `.bak`.
- Second run: `team:` now present → refuse with diff (the diff will be empty if nothing changed in the Domain Map). Exit code 1.

This is the right behavior per the no-silent-overwrite principle. A user who genuinely wants to re-sync after an architecture edit deletes the `team:` block manually first; the deletion is a deliberate signal that they accept the overwrite.

---

## 5. Domain Map parser strategy

Argued in **ADR-012**. Summary:

### 5.1 What it parses

A **markdown table immediately under a `## Domain Map`** (or `### Domain Map`) heading. The table must have at least these columns in any order:

- `Domain` — the kebab-case slug. Must match `^[a-z0-9][a-z0-9-]*[a-z0-9]$`.
- `Description` — free-text, copied into `team.specializations[i].description`.

These columns are ignored by the parser but accepted in the table for the architect's use:

- `Components` — free-text. Used by the architect; no schema implications.
- `Anticipated stories` — free-text. Used by the architect; no schema implications.

Additional columns are accepted and ignored.

### 5.2 Parsing rules

1. Find the first `## Domain Map` or `### Domain Map` heading. The parser is case-sensitive on `Domain Map`; case-insensitive on the heading marker.
2. Skip blank lines after the heading.
3. The next non-blank line must be a markdown table header (e.g., `| Domain | Description | ... |`).
4. The line after the header must be the markdown table separator (e.g., `| --- | --- | ... |`).
5. Subsequent lines starting with `|` are data rows, until the first non-`|` line (or EOF).
6. For each data row, split on `|`, trim, and map cells to the header columns.

### 5.3 Validation

- If `## Domain Map` heading is missing, return `{ found: false }` (callers handle).
- If heading is present but the next non-blank content is not a valid table header → `errors: ["Domain Map at line N is missing the table header"]`.
- If a row is missing the `Domain` or `Description` cell → `errors: ["row at line N is missing Domain or Description column"]`.
- If a `Domain` cell does not match the slug regex → `errors: ["row at line N has invalid domain slug '<value>'"]`.
- If two rows have the same `Domain` slug → `errors: ["row at line N duplicates domain '<value>' first declared at line M"]`.

Error array is returned alongside the partial result. Callers decide whether to refuse (Tool B) or continue (Tool A iterating). Tool B refuses on any error.

### 5.4 What the parser does NOT do

- It does NOT parse free-prose Domain Maps. The `agents/architect.md` format is a table; nothing else is supported.
- It does NOT deduce domains from prose elsewhere in the document.
- It does NOT mutate or reformat the markdown. Read-only.
- It does NOT cache. Cheap, called once per CLI invocation.

### 5.5 Forward-compatibility

If the format ever expands (e.g., a `Reviewer` column to allow per-row reviewer-specialization opt-in), the parser surfaces unknown columns by name in the returned object so future tools can read them. v1 ignores them.

### 5.6 Why a strict format

Permissive parsing creates a class of bugs where the user thinks the Domain Map says X but the parser interprets Y. The strictness matches the existing schema's strictness (validator hard-rejects bad slugs per ADR-004) and the same logic applies: a routing key needs a deterministic interpretation. The architect already authors in this exact format per `agents/architect.md`; the parser locks the contract.

---

## 6. Backwards compatibility

### 6.1 Compatibility guarantees

| Scenario | Behavior |
| --- | --- |
| Project never invokes either tool | Zero behavior change. Neither tool runs at `init` or `update` time. |
| Project has wide-team set up via the manual path (architecture has a Domain Map; swarm.yaml has team:) | `/retrofit-team` refuses with "Domain Map already exists" or "wide-team already configured"; `scaffold-team` refuses with "team: block already exists". User is steered to manual resolution. |
| Project has Domain Map but no team: | `scaffold-team` works (the common chain endpoint). `/retrofit-team` refuses (already done). |
| Project has team: but no Domain Map | `/retrofit-team` runs (proposes Domain Map). `scaffold-team` refuses with diff (already configured). |
| Project has malformed Domain Map | `scaffold-team` refuses with parse-error pointing at offending lines. `/retrofit-team` offers to replace (requires explicit `replace` confirmation). |
| Project has corrupted swarm.yaml | `scaffold-team` refuses (loadSwarmConfig fails); the existing config error path tells the user what's wrong before the retrofit can proceed. |
| Project has no architecture.md | Both tools refuse, point at `/feature` or `/plan`. |
| `bmad-swarm update` runs | Generators emit the `/retrofit-team` slash command file (one-time addition); no other change. The new command is available but inert until the user invokes it. |

### 6.2 Partial-adoption scenarios

A project may already have Domain Map authored manually (for example, the bmad-swarm project itself, where the architect added the heuristics during WT-3, but the Domain Map for *this* project is not authored — see §6.3). The tools must compose without conflict.

- Manual Domain Map → `scaffold-team` works as if Tool A had run. The parser doesn't care who wrote the Domain Map.
- Manual `team:` block (handwritten) → `scaffold-team --write` refuses; the user can run `scaffold-team` (no `--write`) to compare via diff and merge by hand.
- Manual Domain Map + manual `team:` → both tools refuse. The user is fully set up.

### 6.3 The bmad-swarm project itself

The bmad-swarm project has `artifacts/design/architecture.md` (the wide-team architecture) but **no Domain Map for the bmad-swarm codebase itself** (the wide-team architecture documents the wide-team feature, not the bmad-swarm codebase). The retrofit tools are aimed at downstream projects; running them in this repo would propose a Domain Map for the *wide-team feature's* components, which is meaningful but not what we want here.

This is fine — the tools are user-invoked, not auto-running, and the bmad-swarm project itself has not invoked them. No mitigation needed; documenting here so a future contributor doesn't run `/retrofit-team` in this repo by mistake and wonder why the proposal is about the wide-team feature.

### 6.4 No silent migration — explicit principle

Both tools are deliberate user actions:

- `/retrofit-team` requires the user to type the slash command, then explicitly approve the proposed Domain Map.
- `bmad-swarm scaffold-team` (default) is read-only.
- `bmad-swarm scaffold-team --write` requires the explicit flag.

`bmad-swarm update` does NOT run either tool. `bmad-swarm init` does NOT run either tool. No `_bmadGenerated` hash is involved (these tools edit user-owned files, not generated files).

---

## 7. Error and edge cases (consolidated)

### 7.1 Tool A error surfaces

| Condition | Behavior |
| --- | --- |
| `artifacts/design/architecture.md` missing | Refuse: "no architecture; run `/feature` or `/plan`". Do not propose to create an architecture. |
| Architecture is unreadable (binary, permission error) | Fail with the IO error verbatim. |
| `## Domain Map` already present | Show existing; ask refuse / append-as-comment / replace. `replace` requires typing the word. |
| `swarm.yaml:team.mode === 'fixed'` AND `team.specializations` non-empty | Refuse: "wide-team already configured; the chain ends here". |
| Architecture is a stub (<200 lines, single paragraph) | Surface to user; recommend running `/feature` first. Do NOT fabricate a Domain Map. |
| Multiple `## Domain Map` sections | Treat as malformed. Show all of them, refuse to overlay-propose. User must fix manually first. |
| User declines approval | Exit cleanly, no edits. Log nothing (no D-ID for declined proposals — keep the log clean). |
| Architect spawn (step 8) fails or rejects the brief | Orchestrator reports back to user with the failure; no retry loop. User can re-invoke `/retrofit-team`. |

### 7.2 Tool B error surfaces

| Condition | Exit code | Message |
| --- | --- | --- |
| `swarm.yaml` missing | 1 | "no swarm.yaml; run `bmad-swarm init` first" |
| `architecture.md` missing | 1 | "no architecture at <path>; run `/feature` or `/plan`" |
| `## Domain Map` missing | 1 | "no Domain Map; run `/retrofit-team` first" |
| Domain Map malformed | 1 | "Domain Map malformed: <reason>; see `agents/architect.md` for the format" |
| Multiple `## Domain Map` sections | 1 | "multiple Domain Map sections; resolve manually" |
| `--write` and `team:` already present | 1 | "team: block already present; printing diff for manual resolution: <diff>" |
| `--write` and the post-write validation fails | 1 | "post-write validation failed: <error>; restored from swarm.yaml.bak" |
| `--write` and `swarm.yaml` is read-only / permission error | 1 | "cannot write swarm.yaml: <error>" |
| Domain Map with zero rows | 1 | "Domain Map has zero rows; nothing to scaffold" |
| Domain Map row whose slug duplicates another | 1 | "domain '<slug>' declared twice at lines N, M" |

### 7.3 Edge cases that explicitly do NOT error

- A Domain Map with only one row → emits a `team:` block with one specialization. Validator accepts (ADR-004 doesn't require >1).
- `description` column empty → emits `description: ""` (validator allows; ADR-004 §3.2 says description defaults to empty string).
- Domain Map has trailing blank rows / extra whitespace → trimmed silently.
- Architecture file ends with the Domain Map (no trailing content) → fine; parser stops at EOF.

---

## 8. Architect agent doc — addendum

The `agents/architect.md` "Domain Map" section already documents the format and heuristics (added by WT-3). Two small additions needed for retrofit:

### 8.1 Retrofit-entry-path note

Add a paragraph at the end of the "Domain Map (when using fixed-mode wide team)" section:

> **Retrofit entry path.** For an existing project without a Domain Map, the user can invoke `/retrofit-team` to launch an orchestrator-overlay proposal session. The overlay proposes a Domain Map per the heuristics above, the user iterates and approves, and an architect teammate is spawned to perform the file edit (one Edit call to insert the Domain Map section into `architecture.md`). When you (the architect) are spawned by `/retrofit-team`, you receive a brief that contains the approved Domain Map verbatim and the target insertion position. Do not author a fresh Domain Map; do not write an ADR; the design has already happened in the overlay. Insert the table, report back, exit. See `artifacts/design/architecture-retrofit.md` §3.2–§3.4 for the full flow.

### 8.2 No new heuristics

The existing four heuristics (≥2-story rule, architecturally-significant exception, cross-cutting dependencies, orthogonality test) are sufficient. Retrofit reuses them; this doc does not add new ones.

---

## 9. Implementation roadmap

The implementation is naturally divisible into four story-sized chunks. Suggested order:

### 9.1 Story sequence

1. **Story RT-1: Domain Map parser (`utils/domain-map.js`).**
   - The shared utility consumed by RT-2 and RT-3. Build first because both downstream stories depend on it.
   - Touch: `utils/domain-map.js` (new), `test/domain-map.test.js` (new).
   - ACs: parse a valid Domain Map; detect missing heading; detect malformed table; reject invalid slugs; detect duplicate slugs; report unknown extra columns.
   - No CLI/orchestrator changes. Pure utility.

2. **Story RT-2: `bmad-swarm scaffold-team` CLI command.**
   - Touch: `cli/scaffold-team.js` (new), `bin/bmad-swarm.js` (register command).
   - Tests: `test/scaffold-team.test.js` covering each refuse condition, the print-to-stdout path, the `--write` path with backup-and-validate, the `--no-fallback` flag, the diff-on-conflict path.
   - Acceptance: every condition in §7.2 produces the documented exit code and message; `--write` round-trips through `loadSwarmConfig` cleanly; `swarm.yaml.bak` is created; restore-on-validation-failure works.
   - Depends on: RT-1.

3. **Story RT-3: `/retrofit-team` slash command.**
   - Touch: `generators/commands-generator.js` (new `buildRetrofitTeamBody`), regenerate `.claude/commands/retrofit-team.md` via `bmad-swarm update`.
   - Tests: existing `commands-generator` tests cover the file-emission shape (manual review covers the prose body — this is a slash-command body, not behavioral code). One unit test asserting the new entry is in the WORKFLOWS array; one snapshot of the body for regression.
   - Acceptance: `/retrofit-team` appears in `.claude/commands/`; running it in a session walks the steps in §3.2; refuse conditions in §7.1 honored.
   - Depends on: RT-1 (the parser is invoked by Tool A's "show existing Domain Map" path).

4. **Story RT-4: Documentation.**
   - Touch: `README.md` (new section "Retrofit tooling" cross-linked from "Wide-team specialization"), `agents/architect.md` (the §8.1 addendum above), `CHANGELOG.md`.
   - No tests.
   - Acceptance: README documents both tools with examples; architect doc has the retrofit-entry-path paragraph; CHANGELOG mentions the new command and slash command.

### 9.2 Suggested groupings

- **Sprint 1 (foundation)**: RT-1 alone. Must land before others.
- **Sprint 2 (tools)**: RT-2 and RT-3 in parallel (independent of each other; both depend only on RT-1).
- **Sprint 3 (docs)**: RT-4 after RT-2 and RT-3 land (so the README example commands are accurate).

### 9.3 Story boundaries — what NOT to bundle

- Do NOT combine RT-1 and RT-2: parser is reusable and deserves its own test surface (RT-3 also consumes it). Bundling forces the reviewer to mentally separate parser-correctness from CLI-flow-correctness in one PR.
- Do NOT combine RT-2 and RT-3: CLI command and slash command are different surfaces. The slash command depends on Claude-Code-runtime behavior (orchestrator-overlay flow) and reviews differently than a Node CLI.
- Do NOT bundle RT-4 docs into any of the implementation stories: docs land last so the examples reflect actual command output.
- Do NOT introduce a `bmad-swarm doctor` audit for Domain-Map / team: drift in this feature. That's the natural next step (and was deferred per `architecture.md` §15 open question 5), but it's a separate strategic ask. Out of scope for D-014.
- Do NOT add a `--from-stdin` or `--interactive` flag to `scaffold-team`. The default (print-to-stdout) is the interactive path — pipe to `pbcopy` or open in `$EDITOR`. Keep the CLI surface thin.

---

## 10. ADRs (this design produces)

| ADR | Title | Surface |
| --- | --- | --- |
| ADR-010 | `/retrofit-team` orchestrator overlay vs. architect spawn | §3.1 |
| ADR-011 | `swarm.yaml` write safety (backup, refuse-on-conflict, round-trip validation) | §4.5 |
| ADR-012 | Domain Map parser contract (markdown table, heading-anchored) | §5 |

All three reference parent decision **D-014** (logged in `decision-log.md` once this architecture is approved). ADR file paths: `artifacts/design/decisions/adr-010-*.md`, `adr-011-*.md`, `adr-012-*.md`.

---

## 11. D-IDs (logged in decision-log.md after approval)

| D-ID | Type | Title | Status |
| --- | --- | --- | --- |
| D-014 | Strategic | Adopt retrofit tooling for wide-team adoption | proposed |
| D-015 | Tactical | `/retrofit-team` is an orchestrator overlay, not an architect spawn (ADR-010) | proposed |
| D-016 | Tactical | `swarm.yaml` write safety strategy: rolled `.bak` + refuse-on-conflict + round-trip validation (ADR-011) | proposed |
| D-017 | Tactical | Domain Map parser locks to heading-anchored markdown table; loud failure on shape drift (ADR-012) | proposed |

D-014 is the parent strategic decision for this feature (matches the brief's "D-014 candidate"). The three tactical D-IDs each track one ADR. Status flips to `accepted` upon human approval of this architecture document; downstream stories carry the references through to verification.

---

## 12. Open questions / trade-offs flagged for human review

1. **Architect spawn for the file edit (vs. orchestrator-write-gate carve-out).** §3.1 / ADR-010 chose the architect-spawn route. The alternative — extending the orchestrator-write-gate allow-list to permit `architecture.md` edits during `/retrofit-team` — is simpler (no spawn) but weakens an invariant. Picking spawn keeps the invariant pristine at the cost of one extra teammate creation. **Human decision needed**: confirm the spawn route is correct, or override to the carve-out route if you'd prefer the simpler implementation.

2. **`scaffold-team --write` overwrite of `swarm.yaml.bak`.** §4.5 / ADR-011 specifies that the `.bak` is rolled (no timestamps, single file). A user who runs `--write` twice loses the original `.bak` after the second call. Mitigation: git history. **Trade-off acknowledgement**: if the user runs `--write` twice without committing in between, the original is gone. This is consistent with how every other CLI tool handles `.bak` (vim, sed -i.bak, etc.) — adopt or override.

3. **Reviewer specialization not auto-generated.** §4.2 leaves reviewer-specialization opt-in only. The Domain Map can carry a future column for it (per the parser's forward-compat in §5.5), but v1 emits `developer`-only specializations. Rationale: forcing reviewer specialization is opinionated; per `architecture.md` §15 open question 1 (resolved by D-011), reviewer specialization is "allowed but optional." **Human decision needed**: confirm this is the right default, or add an opt-in flag (`--with-reviewers`) to RT-2.

4. **`--write` doesn't auto-commit or auto-update.** The success message tells the user to run `bmad-swarm validate` and `bmad-swarm update` themselves. We could chain these; we don't, because chaining would entangle the retrofit with regeneration in ways the user might not expect. **Trade-off acknowledgement**: one extra step. Worth it for clarity of cause-and-effect.

5. **`/retrofit-team` doesn't itself run `scaffold-team`.** The two tools are deliberately decoupled: the user runs the slash command, then leaves the Claude Code session and runs the CLI. We considered chaining (have the orchestrator emit instructions to run `scaffold-team --write` automatically as a final step), but rejected it because (a) running CLI commands from inside a Claude Code session would require Bash tool use that the orchestrator should not have for this flow, and (b) keeping the surfaces separate makes the chain composable for users who want the manual `team:` (no `--write`) path. **Trade-off acknowledgement**: one extra context switch (slash command → shell → CLI). Worth it for boundary clarity.

---

## 13. Verification checklist

Before marking this architecture complete:

- [ ] D-004 referenced as grandparent decision; D-014 as parent strategic decision for this feature.
- [ ] Tool A (overlay) and Tool B (CLI) each have a complete spec section, refuse conditions, and at least one ADR.
- [ ] Backwards-compatibility (§6) explicitly covers: (a) projects that never invoke either tool, (b) projects with partial wide-team setup, (c) projects with malformed inputs.
- [ ] No silent migration — confirmed in §6.4. Both tools are user-invoked.
- [ ] Parser contract is strict and matches the format in `agents/architect.md` §"Domain Map".
- [ ] Implementation roadmap (§9) has natural story boundaries (RT-1 → RT-2 ∥ RT-3 → RT-4) with clear dependencies.
- [ ] Three ADRs written (overlay-vs-spawn, write safety, parser contract).
- [ ] Architect doc addendum (§8.1) specified and ready for RT-4 to apply.
- [ ] Open questions surfaced for human approval (§12).
- [ ] Cross-reference to this doc added in `architecture.md` (per §16 of that doc — added in RT-4 or as a one-liner during ADR landing).
