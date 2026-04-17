# Story B-TOKEN-1: Move orchestrator rule content into orchestrator agent file

## Goal
Eliminate ~2,065 tokens of wasted context per non-orchestrator agent by moving orchestrator-specific rule content from `.claude/rules/` into the orchestrator agent definition file. Agent definition files only load for their specific agent, while rule files load for every agent.

## Acceptance Criteria
- [ ] AC1: The content of `templates/rules/orchestrator-identity.md` is merged into `agents/orchestrator.md` (the package template, not the generated file)
- [ ] AC2: The content of `templates/rules/orchestrator-methodology.md` is merged into `agents/orchestrator.md`
- [ ] AC3: The rule template files `templates/rules/orchestrator-identity.md` and `templates/rules/orchestrator-methodology.md` are deleted
- [ ] AC4: `generators/rules-generator.js` no longer processes these deleted templates (it scans the templates/rules/ directory, so deletion is sufficient)
- [ ] AC5: After `bmad-swarm update`, `.claude/rules/` no longer contains `orchestrator-identity.md` or `orchestrator-methodology.md`
- [ ] AC6: After `bmad-swarm update`, `.claude/agents/orchestrator.md` contains the merged content (identity table, key rules, anti-patterns, methodology tables)
- [ ] AC7: The generated `.claude/rules/` files that SHOULD remain (coding-standards.md, quality-standards.md) are still generated correctly
- [ ] AC8: The identity-reinject hook (`hooks-generator.js:271-288`) reference to `orchestrator-methodology.md` is updated to reference the orchestrator agent file instead
- [ ] AC9: Test passes: `npm test -- --grep "rules|orchestrator|agents"`

## Dev Notes
- Files to modify:
  - `agents/orchestrator.md` -- merge in content from the two rule templates. Deduplicate any content that already exists in orchestrator.md (see B-TOKEN-3).
  - `templates/rules/orchestrator-identity.md` -- DELETE this file
  - `templates/rules/orchestrator-methodology.md` -- DELETE this file
  - `generators/hooks-generator.js:283` -- update the identity reinject hook's `additionalContext` message. Currently says "Follow the entry point table in .claude/rules/orchestrator-methodology.md". Change to ".claude/agents/orchestrator.md"
- Pattern to follow: The rules generator (`generators/rules-generator.js:27-29`) reads all `.md` files from `templates/rules/` directory. Deleting the files is sufficient to stop generation.
- The `.claude/rules/orchestrator-identity.md` and `.claude/rules/orchestrator-methodology.md` (generated output files) should also be deleted as part of this change. Add a cleanup step or document that users should delete them manually or run `update --force`.
- IMPORTANT: When merging into `agents/orchestrator.md`, place the content BEFORE the "Project Info" section (which is always appended last by `injectProjectContext()`).
- The `agents/orchestrator.md` file is the PACKAGE template (source of truth). The generated `.claude/agents/orchestrator.md` will be rebuilt from it on update.
- Test file: `test/rules-generator.test.js` -- update to expect only 2 rule files (coding-standards.md, quality-standards.md) instead of 4. `test/generators.test.js` -- verify orchestrator agent contains the merged content.

## D-IDs Referenced
- Strategy 1 from token-optimization.md (scope orchestrator rules to orchestrator only)
- Note: Claude Code bug #16299 makes path-scoping unreliable, so moving content to agent file is the correct approach

## Closed (2026-04-16)

AC8 (update `identity-reinject` hook regex) is superseded by Option C: `identity-reinject.cjs` was deleted and replaced with `post-compact-reinject.cjs`, which injects only a slash-command pointer.
