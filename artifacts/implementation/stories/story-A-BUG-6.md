# Story A-BUG-6: Fix code_dir to point to actual source directories

## Goal
Change `code_dir` in `swarm.yaml` from `./src` (non-existent) to the actual source directories so the code guard hooks protect real source files.

## Acceptance Criteria
- [ ] AC1: `swarm.yaml` `output.code_dir` is changed to a value that reflects the actual source directories (e.g., `./cli` or a list)
- [ ] AC2: The orchestrator code guard hooks (`orchestrator-post-tool.cjs`, `orchestrator-stop.cjs`) protect the actual source directories after regeneration
- [ ] AC3: `bmad-swarm update` regenerates hooks with the correct code directory reference
- [ ] AC4: Test passes: `npm test -- --grep "code.dir|code.guard|hooks"`

## Dev Notes
- Files to modify:
  - `swarm.yaml:29` -- change `code_dir: ./src` to a value that covers `cli/`, `generators/`, `utils/`
- The `code_dir` field is used by `generateOrchestratorPostToolHook()` and `generateOrchestratorStopHook()` in `generators/hooks-generator.js:145,219`. These hooks check if a file path starts with the resolved `CODE_DIR`. Currently they protect `./src` which does not exist.
- IMPORTANT: The hooks only support a single directory path (they do `resolvedTarget.startsWith(resolvedCodeDir)`). If multiple directories need protection, the simplest approach is to set `code_dir` to `.` (project root) or find a common parent. However, `.` would be too broad. A better approach is to pick the most critical directory (e.g., `./cli`) or restructure the guard to check multiple paths.
- Recommended approach: Since this is bmad-swarm developing itself, and the hooks are primarily for the orchestrator (preventing it from writing code), setting `code_dir: .` for a self-developing project is reasonable. The orchestrator should not be writing ANY files directly. Alternatively, if the guard should be more precise, modify the hook template to accept an array of directories.
- For the hooks to support multiple directories, the `generateOrchestratorPostToolHook()` function would need to iterate over an array. However, that is a scope expansion. For this story, simply change the config value.
- After modifying `swarm.yaml`, run `bmad-swarm update` (or call `generateHooks()` in tests) to verify the hooks pick up the new value.
- Test file: `test/generators.test.js` or `test/cli.test.js` -- verify hooks reference the updated code_dir

## D-IDs Referenced
- A-5 from project review (code_dir set to ./src but no src/ exists)

## Closed (2026-04-16)

This story's subject (code_dir hook enforcement) became vestigial when `orchestrator-post-tool.cjs` was deleted in f72cd65. No replacement needed — Option C structural enforcement via `orchestrator-write-gate.cjs` supersedes it.
