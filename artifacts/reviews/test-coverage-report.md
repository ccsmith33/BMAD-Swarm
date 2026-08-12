# Test coverage report — v3 coordination change set

- **Reviewer:** reviewer (team v3-coordination-r2), 2026-06-09
- **Companion to:** `artifacts/reviews/review-v3-coordination-1.md`
- **Suite result (independent run):** 415 tests / 415 pass, 65 suites, 0 fail, ~3.0 s

## Delta accounting

The tree was inherited mid-epic at 395/424 (28 ReferenceErrors from the dead session's deleted hook-test helpers, 1 unrelated). The second session discarded the broken hook-test section and rebuilt it. Net: ~28 obsolete transcript-channel tests removed, ~19 new tests added (handshake gate contract, marker placement/round-trip, native agent definitions, task-protocol injection), landing at 415 green. Hook tests: 46 `it()` blocks confirmed by count.

## Coverage by surface

| Surface | New/changed tests | Verdict |
|---|---|---|
| `utils/fs-helpers.js` marker logic | 12 (2 write-placement, 5 modification-detection incl. old format + deep-marker rejection, 1 CRLF frontmatter, 4 `stripGeneratedMarker`) | Strong — both placements, both directions, hash round-trip asserted against `contentHash`, backward-compat fixtures mirror the real Quinn shape |
| Gate Pass 1 (handshake) | 10 (accept, deny-missing-file, deny-stale via `utimesSync`, deny-missing-keys, deny-no-fence, last-block-wins ×2, F-009 ×2, transcript-ignored, stdin fail-open) | Strong — deny reasons asserted by specific regex including a negative assertion (present keys NOT listed); F-009 covered in both geometries |
| Gate Pass 2 (routing, regression) | 11 (AC1–AC8 + routing-on-handshake) | Strong — pre-existing contract fully re-expressed against the new channel; fail-open paths (malformed/missing swarm.yaml) preserved |
| Agent generator (ADR-014 / D-028 item 0) | 3 (marker-after-fence, native-definition validity via real `js-yaml` parse over every generated agent, protocol injection incl. orchestrator exclusion) | Strong — parses rather than string-matches; asserts the defensive description phrase and `isolation: worktree` survival |
| Commands generator | 2 changed (exactly-one-marker count replaces the weaker index check; retrofit-team frontmatter-first regex) | Good |
| Rules generator | 1 changed (frontmatter-aware marker placement) | Good |

## Test-quality observations

- The fable-retrospective cwd-isolation lesson is applied: `runHook` defaults to a bare tmp cwd and every gate test builds a per-test fixture project, so the repo's live `swarm.yaml`/`team-assembly-log.md` cannot leak into cwd-relative reads.
- `runHookInCwd` injects `NODE_PATH` for `js-yaml` resolution with an honest comment about why — fidelity to real installs is preserved.
- Accept-path assertions use `decision === null` + exit 0, which is the actual hook contract (no stdout = allow); acceptable breadth.
- No flakiness vectors observed: no shared mutable fixtures, no order dependence, mtime manipulation uses explicit `utimesSync`.

## Gaps (mapped to review findings)

1. **Unclosed-fence geometry untested (F-011):** the last-block tests cover an incomplete-but-closed block; an unclosed opener after a valid block silently re-accepts the old block (empirically confirmed). One test wanted: valid block + unclosed newer block → deny.
2. **Write-side window guard untested (F-014):** detection-side "marker beyond 10 lines is ignored" is covered; nothing guards `writeGeneratedFile` against emitting a marker past the search window if frontmatter grows.
3. **Workflow-command wording (F-012):** generator content assertions don't pin the assembly-block instruction to the ADR-013 append contract; adding one would have caught the stale "emit … and call TeamCreate" text.
