# BMAD Swarm - Bootstrap Build

## Project Overview

This project is building **BMAD Swarm** - an autonomous development organization powered by Claude Code Agent Teams. The system takes a human's product idea and delivers working software with full documentation, using a team of specialized AI agents that coordinate autonomously.

The system will be distributed as an npm package (`@bmad/swarm`) with a CLI that initializes projects, generates agent files, and manages configuration.

## What We're Building

An npm package that provides:
1. **CLI tool** (`bmad-swarm`) with commands: `init`, `update`, `eject`, `uneject`, `scan`, `status`
2. **Agent definitions** (orchestrator, researcher, strategist, architect, story-engineer, developer, reviewer, qa)
3. **Methodology engine** (phases, task templates, quality gates, artifact schemas)
4. **Config system** (`swarm.yaml` per project with layering/override/eject support)
5. **Generators** (merge package agents + project config to produce `.claude/agents/` files)

## Key Design Documents

- **Full system design**: `artifacts/design/v1-system-design.md` - Complete specification
- **Inspiration source**: `_bmad/` directory - The BMAD Method (v6.0.0) which informed this design

## Architecture Decisions

- **Runtime**: Node.js (npm package with CLI)
- **Agent format**: Markdown files in `.claude/agents/` (Claude Code native format)
- **Config format**: YAML (`swarm.yaml`)
- **Template engine**: Simple string replacement for generating agent files from templates + config
- **No external dependencies beyond Node.js stdlib where possible** - keep it lightweight

## File Structure Convention

```
src/                        # Package source code
├── cli/                    # CLI commands
├── generators/             # Agent/config file generators
├── templates/              # Base templates for agents, CLAUDE.md, settings
│   ├── agents/             # Agent template files
│   ├── methodology/        # Phase definitions, quality gates
│   └── project/            # swarm.yaml template, CLAUDE.md template
└── utils/                  # Shared utilities
```

## Coding Conventions

- ES modules (import/export)
- Node.js >= 18
- No transpilation - write directly executable JavaScript
- Use `commander` for CLI argument parsing
- Use `js-yaml` for YAML parsing
- Minimal dependencies - prefer stdlib
- Tests with Node.js built-in test runner (`node:test`)

## Current State

Phase: Implementation (building v1 from design spec)

## Quality Standards

- All CLI commands must have corresponding tests
- Agent template files must be valid markdown
- Generated output must match expected structure
- `init` → `update` must be idempotent (running update twice produces same output)
- Ejected files must survive `update` without being overwritten
