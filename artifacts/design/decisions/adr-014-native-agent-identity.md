# ADR-014: Generated agents are native Claude Code custom agent definitions

**D-ID:** D-028 (parent strategic decision)
**Status:** Accepted
**Date:** 2026-06-09
**Context:** v3 coordination epic — retires the `FIRST: Invoke /identity-{role}` spawn ceremony for teammates in favor of native `subagent_type` spawning

## Context

Since 2.0.0, generated `.claude/agents/{role}.md` files carried the role content but were **not valid Claude Code custom agent definitions**, for two verified reasons:

1. The `<!-- bmad-generated:HASH -->` marker was written as the first line, ABOVE the YAML frontmatter. Claude Code requires the frontmatter to be the first bytes of the file; the marker broke YAML parsing and the file was never registered.
2. The frontmatter lacked `name` and `description`, both required for the agent registry.

Confirmed symptom: spawning with `subagent_type: "developer"` returned "not found". The workaround was the spawn-prompt ceremony — every TeamCreate spawn prompt began with `FIRST: Invoke /identity-{role} as your next message…`, loading identity through a generated slash command as user-turn content. The ceremony worked but cost an extra round-trip per teammate, depended on the teammate obeying a prose instruction, and duplicated each agent definition into a parallel `identity-{role}` command.

## Decision

1. **`generators/agent-generator.js`** emits valid native agent definitions: frontmatter first, leading with `name: <role>` and `description: "<Role> teammate for bmad-swarm orchestrated work — spawned by the orchestrator via the team flow. Not for ad-hoc delegation."`, followed by the template's existing fields (`model`, `isolation`). The description is deliberately defensive so the platform does not auto-delegate to these agents outside the orchestrated team flow. The identity fields are injected by the generator (`applyIdentityFrontmatter`) rather than added to the 13 source templates — single point of change, templates stay registry-agnostic (D-029).
2. **`utils/fs-helpers.js`** moves the `bmad-generated` marker to immediately AFTER the closing frontmatter fence when content begins with a frontmatter block (`writeGeneratedFile`); marker detection (`isFileManuallyModified`, `stripGeneratedMarker`) searches the first 10 lines, accepting both placements. **Backward compatible:** pre-v3 files with the marker on line 1 (e.g. the Quinn deployment) are still recognized as generated — verified read-only against `/home/ccsmith33/personalProjects/Quinn` (29/29 generated files detected, zero false "modified" flags).
3. **Spawning** (agents/orchestrator.md "Spawn-prompt structure"): teammates are spawned natively via the Agent tool with `subagent_type: "<role>"` plus `team_name` and `name`; the spawn prompt is a task pointer + brief only. The `FIRST: Invoke /identity-{role}` line is retired.
4. **`/identity-orchestrator` stays.** The main session cannot be a custom agent type, so the orchestrator still loads its role via the slash command on fresh sessions and after compaction. The teammate `identity-{role}` commands remain generated as inspection/debugging aids and say so in their descriptions.
5. **Team task protocol** (D-028 item 0) rides along: the generator appends a "Team task protocol" section to every teammate (never the orchestrator) overriding the platform's self-claim guidance — orchestrator-assigned ownership is the single wake channel.

## Alternatives considered

- **A. Add `name`/`description` to the 13 source templates instead of generator injection.** Rejected: 13 edit sites for a mechanical field, and template forks (overrides/) would silently miss future registry requirements. The generator owns registry compliance.
- **B. Keep the marker on line 1 and teach Claude Code's parser to skip it.** Not in our control.
- **C. Drop the marker from agent files entirely.** Rejected: the marker is the manual-modification detection mechanism (`bmad-swarm update` skips user-edited files); losing it silently overwrites user customizations.
- **D. Keep the ceremony alongside native spawning ("belt and braces").** Rejected: two identity channels with different content (command body vs agent file) is a drift generator; the duplicate-engagement bug (D-028 item 0) showed what redundant channels do.

## Consequences

- One fewer round-trip per teammate spawn; identity is structural, not prose-dependent.
- Agent-type registration may require a session restart to be picked up — verified that all 9 regenerated files parse with `js-yaml` and carry `name`/`description`/`model`; the caveat is documented in the CHANGELOG migration note. **Addendum 2026-06-10:** the orchestrator's post-regeneration experiment verified mid-session registry pickup (a trivial `subagent_type: "developer"` spawn succeeded without restart) — restart is a fallback, not an expected step.
- Existing projects must run `bmad-swarm update`; old-format generated files are detected correctly (point 2), so the update is non-destructive.
