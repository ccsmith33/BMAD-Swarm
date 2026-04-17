# Story C-TOOLS-1: Add --disallowedTools to bmad-swarm start

## Goal
By default, the orchestrator session launched by `bmad-swarm start` should exclude tools it never uses (Edit, Write, MultiEdit, NotebookEdit, NotebookRead, WebSearch), saving ~3,000-5,000 tokens of tool descriptions from the system prompt. Add an `--allow-tools` flag that disables this restriction.

## Acceptance Criteria
- [ ] AC1: `bmad-swarm start` passes `--disallowedTools Edit Write MultiEdit NotebookEdit NotebookRead WebSearch` to Claude Code by default
- [ ] AC2: `bmad-swarm start --allow-tools` does NOT pass `--disallowedTools`, allowing all tools
- [ ] AC3: `bmad-swarm start --print` shows the `--disallowedTools` arguments in the printed command
- [ ] AC4: `bmad-swarm start --print --allow-tools` shows the command WITHOUT `--disallowedTools`
- [ ] AC5: `bmad-swarm start --help` shows both `--allow-tools` and `--dangerous` flags
- [ ] AC6: README `bmad-swarm start` section is updated with the new `--allow-tools` flag
- [ ] AC7: Test passes: `npm test -- --grep "disallowedTools|allow.tools|start.*print"`

## Dev Notes
- Files to modify:
  - `cli/start.js:10-38` -- add `--allow-tools` option; add default `--disallowedTools` args unless `--allow-tools` is set
  - `README.md:158-169` -- add `--allow-tools` to the start command flag table
- Pattern to follow: Look at how `--dangerous` is handled in `cli/start.js:15-16,27-29`. The `--allow-tools` flag follows the same pattern but inverts the logic (flag presence DISABLES the default behavior).
- The `--disallowedTools` flag syntax for Claude Code CLI is: `--disallowedTools "Edit" "Write" "MultiEdit" "NotebookEdit" "NotebookRead" "WebSearch"` (each tool name as a separate argument after the flag).
- Implementation approach:
  ```js
  if (!options.allowTools) {
    args.push('--disallowedTools', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'NotebookRead', 'WebSearch');
  }
  ```
- Test file: `test/cli.test.js` -- test `bmad-swarm start --print` output to verify `--disallowedTools` is present, and `bmad-swarm start --print --allow-tools` output to verify it is absent.

## D-IDs Referenced
- Priority 2 from system-prompt-replacement.md (use --disallowedTools for the orchestrator)
- Section 6 "Hybrid Option: Surgical Tool Restriction" from system-prompt-replacement.md

## Closed (2026-04-16)

The `--disallowedTools` mechanism is superseded by `settings.json` permission scoping in Option C. `Task` is removed from the allow-list; that is stronger than a CLI flag.
