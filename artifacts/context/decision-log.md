# Decision Log

Sequential D-IDs for all decisions that affect product direction, architecture, or cross-cutting behavior. Tactical decisions get one-line entries; strategic decisions get full records. See `methodology/decision-classification.md` for classification.

## D-001 — Default permission mode is `acceptEdits`; dangerous patterns explicitly denied

- **Date:** 2026-04-16
- **Classification:** Strategic (affects permission model, visible to end user, cross-cutting)
- **Context:** User reported too many permission prompts during autonomous execution. Option C scoped the `allow` list but left default mode unset.
- **Decision:** Set `permissions.defaultMode: "acceptEdits"` in generated settings.json + template. Add explicit `permissions.deny` for destructive patterns (rm -rf, sudo, git push --force, git reset --hard, curl|sh, chmod 777).
- **Rationale:** User explicitly asked for fewer prompts. The `allow` list is narrow (Bash(npm:*), Bash(node:*), etc.) so blast radius is bounded. The orchestrator-write-gate hook still fires under acceptEdits (hook `permissionDecision: deny` overrides permission mode — empirically verified).
- **Consequences:** Fewer prompts for in-scope work; explicit denies for high-impact destructive patterns; delegate-everything rule preserved via hook.
- **Alternatives considered:** `bypassPermissions` (rejected — skips deny list); expand allow list (rejected — endless enumeration).
- **ADR:** `artifacts/design/decisions/adr-001-permission-default-mode.md`
- **Referenced by:** `templates/settings.json.template`, `.claude/settings.json`, `templates/CLAUDE.md.template`
