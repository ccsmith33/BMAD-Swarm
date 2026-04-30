import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeGeneratedFile, isFileManuallyModified, ensureDir } from '../utils/fs-helpers.js';
import { getAgentNames } from '../utils/config.js';

/**
 * Generate .claude/commands/ files.
 *
 * Two categories:
 *   - identity-{role}.md: body is the full contents of agents/{role}.md
 *   - workflow commands (bug, feature, research, ...): body is the
 *     pre-wired assembly block + routing instruction
 *
 * @param {object} config - Parsed swarm.yaml config
 * @param {object} projectPaths - Project paths
 * @param {object} [options] - Options
 * @param {boolean} [options.force] - Overwrite manually-modified files
 * @returns {{ generated: string[], modified: string[] }}
 */
export function generateCommands(config, projectPaths, options = {}) {
  const commandsDir = join(projectPaths.claudeDir, 'commands');
  ensureDir(commandsDir);
  const generated = [];
  const modified = [];

  // 1. Identity commands — one per enabled agent
  for (const name of getAgentNames()) {
    const agentConfig = config.agents?.[name];
    if (agentConfig?.enabled === false) continue;
    const agentPath = join(projectPaths.agentsDir, `${name}.md`);
    if (!existsSync(agentPath)) continue;
    const agentContent = readFileSync(agentPath, 'utf8');
    const stripped = agentContent.replace(/^<!-- bmad-generated:[a-f0-9]+ -->\n/, '');
    const commandPath = join(commandsDir, `identity-${name}.md`);
    if (!options.force && isFileManuallyModified(commandPath)) {
      modified.push(`identity-${name}.md`);
      continue;
    }
    const body = `---\ndescription: Load ${name} role identity\n---\n\nYou are the ${name}. Your full role instructions follow — read and internalize them, then respond to the user's next message in character.\n\n${stripped}`;
    writeGeneratedFile(commandPath, body);
    generated.push(`identity-${name}.md`);
  }

  // 2. Workflow commands — hardcoded list
  const WORKFLOWS = [
    { name: 'bug', description: 'Start a bug fix with developer + reviewer', body: buildBugBody() },
    { name: 'feature', description: 'Start a feature with architect + developer + reviewer', body: buildFeatureBody() },
    { name: 'research', description: 'Research-only task with researcher', body: buildResearchBody() },
    { name: 'audit', description: 'Audit with researcher + reviewer + security', body: buildAuditBody() },
    { name: 'brainstorm', description: 'Brainstorm with ideator overlay (Mode A — orchestrator process step)', body: buildBrainstormBody() },
    { name: 'explore-idea', description: 'Explore an idea (Mode B — ideator overlay + researcher parallel spawn)', body: buildExploreIdeaBody() },
    { name: 'migrate', description: 'Migration with architect + developer + reviewer', body: buildMigrateBody() },
    { name: 'review', description: 'Review an artifact with lens selection', body: buildReviewBody() },
    { name: 'plan', description: 'Plan mode: produce assembly block only, do not spawn', body: buildPlanBody() },
    { name: 'retrofit-team', description: 'Propose a Domain Map for an existing architecture (orchestrator-overlay; spawns one architect for the file edit)', body: buildRetrofitTeamBody() },
  ];

  for (const wf of WORKFLOWS) {
    const commandPath = join(commandsDir, `${wf.name}.md`);
    if (!options.force && isFileManuallyModified(commandPath)) {
      modified.push(`${wf.name}.md`);
      continue;
    }
    writeGeneratedFile(commandPath, `---\ndescription: ${wf.description}\n---\n\n${wf.body}`);
    generated.push(`${wf.name}.md`);
  }

  return { generated, modified };
}

function buildBugBody() {
  return `Acknowledge the user's bug report. Then emit this assembly block and call TeamCreate:

\`\`\`bmad-assembly
entry_point: bug-fix
complexity: 6
autonomy: auto
team:
  - role: developer
    model: opus
  - role: reviewer
    lenses: [code-quality]
    model: opus
rationale: Bug fix — developer implements, reviewer verifies.
\`\`\`

Spawn both teammates with a curated brief including the bug description and affected files. Relay developer completion + reviewer approval back to the user.`;
}

function buildFeatureBody() {
  return `Score complexity (5-15). If 5-7 use small-feature; if ≥8 use full-lifecycle. Emit the assembly block and call TeamCreate. Default team for small-feature:

\`\`\`bmad-assembly
entry_point: small-feature
complexity: 7
autonomy: auto
team:
  - role: architect
    model: opus
  - role: developer
    model: opus
  - role: reviewer
    lenses: [code-quality]
    model: opus
rationale: Small feature — architect designs, developer implements, reviewer verifies.
\`\`\``;
}

function buildResearchBody() {
  return `Emit:

\`\`\`bmad-assembly
entry_point: audit
complexity: 6
autonomy: auto
team:
  - role: researcher
    model: opus
rationale: Research-only exploration, no build.
\`\`\`

Spawn researcher with the user's question. Relay findings.`;
}

function buildAuditBody() {
  return `Emit:

\`\`\`bmad-assembly
entry_point: audit
complexity: 9
autonomy: auto
team:
  - role: researcher
    model: opus
  - role: reviewer
    lenses: [code-quality, security, test-coverage]
    model: opus
  - role: security
    model: opus
rationale: Multi-lens audit — researcher collects evidence, reviewer + security produce findings.
\`\`\`

After all three agents report, update \`artifacts/context/findings-register.md\`: add a new entry for each novel finding, or append a \`YYYY-MM-DD — by <agent> — reconfirm — <why>\` line to the \`decision_trail\` of any finding already in the register (same claim + location = same ID, do not invent new IDs for carried-forward issues).`;
}

function buildExploreIdeaBody() {
  return `Enter explore-idea mode (Mode B — ideator overlay in your session + researcher spawned in parallel).

Step 1 (in your session): Read \`agents/ideator.md\` in full. Overlay the ideator persona onto your own session for the conversation with the user. Apply the Four Lenses, brainstorming techniques, elicitation methods invisibly. Check the exit condition at every turn.

Step 2 (parallel spawn): After your first exchange with the user — once the topic is clear enough to seed a research brief — emit the assembly block below and spawn a researcher via TeamCreate. The researcher gathers external evidence (market signals, technical feasibility, prior art, competitive landscape) while you continue the conversation with the user.

\`\`\`bmad-assembly
entry_point: explore-idea
complexity: 7
autonomy: auto
team:
  - role: researcher
    model: opus
rationale: Mode B — ideator overlay on orchestrator + parallel researcher for evidence gathering.
\`\`\`

Step 3 (on exit): When the user signals readiness to build, ask the researcher to finalize their report (SendMessage), then:
- Write \`artifacts/planning/brainstorm-<topic-slug>-<YYYY-MM-DD>.md\` — the brainstorm summary (same template as /brainstorm).
- Reference the researcher's evidence report in the summary's "open questions" / "supporting evidence" section.
- Emit a second assembly block for the next phase (typically strategist + architect).

DO NOT suppress the researcher spawn if the conversation hasn't started yet — the assembly block in Step 2 is mandatory and should go out in your first or second turn. The researcher will idle waiting for clarifying messages if needed.`;
}

function buildBrainstormBody() {
  return `Enter brainstorm mode (orchestrator-overlay pattern). Do NOT emit a bmad-assembly block. Do NOT call TeamCreate. Brainstorming is a conversational orchestrator process step — teammates cannot converse with the human directly, so the ideator persona overlays onto your own session instead.

1. Read \`agents/ideator.md\` in full. Internalize the Four Lenses, brainstorming techniques, elicitation methods, and adaptive interaction rules.
2. Greet the user as a thinking partner. Ask what they want to explore.
3. Run the conversation directly. Apply lenses and techniques invisibly — do not announce them.
4. Track decisions internally as they emerge. Append D-IDs to \`artifacts/context/decision-log.md\` (tactical = one-line, strategic = full record).
5. **Check the exit condition at every turn.** Before your turn ends, ask: has the user signaled readiness to build ("let's do this", "ok, build it", "hand it off")? If yes, exit now — do not take another brainstorming turn.
6. On exit:
   - Write \`artifacts/planning/brainstorm-<topic-slug>-<YYYY-MM-DD>.md\` containing: topic, key decisions with D-IDs, open questions, recommended next step.
   - Emit a \`bmad-assembly\` block for the recommended next phase (typically strategist for product brief + architect if architecture questions surfaced).
7. If the conversation reveals the idea needs substantial external research before it can be shaped further, suggest the user run \`/explore-idea\` (Mode B — ideator overlay + researcher in parallel). Do NOT silently spawn a researcher yourself mid-brainstorm.`;
}

function buildMigrateBody() {
  return `Emit:

\`\`\`bmad-assembly
entry_point: migrate
complexity: 9
autonomy: guided
team:
  - role: architect
    model: opus
  - role: developer
    model: opus
  - role: reviewer
    lenses: [code-quality, test-coverage]
    model: opus
rationale: Migration — architect plans, developer executes, reviewer validates coverage.
\`\`\``;
}

function buildReviewBody() {
  return `Inspect the artifact the user referenced. Select lenses from the signal table in /identity-orchestrator (api, data, ui, perf, auth, test, docs). Emit the assembly block with those lenses:

\`\`\`bmad-assembly
entry_point: audit
complexity: 6
autonomy: auto
team:
  - role: reviewer
    lenses: [<selected>]
    model: opus
rationale: Lens-based review of <artifact>.
\`\`\``;
}

function buildPlanBody() {
  return `Plan mode: assess the request, emit a bmad-assembly block, then STOP and wait for the user to approve. Do NOT call TeamCreate yet. After user says "go" or equivalent, execute the block.`;
}

function buildRetrofitTeamBody() {
  return `Enter retrofit-team mode (orchestrator-overlay pattern, hybrid: overlay for design + architect spawn for the file edit). Per ADR-010, this command proposes a Domain Map for an existing project's architecture, walks the user through iteration, gates the edit on explicit human approval (per the CLAUDE.md \`architecture\` human-approval invariant), and then spawns ONE architect teammate to perform the single Edit call that inserts the approved Domain Map into \`artifacts/design/architecture.md\`.

Walk these steps in order. Refuse cleanly at any gate that fails — do not improvise around a refused state.

1. **Refuse if wide-team is already configured.** Read \`swarm.yaml\`. If \`team.mode === "fixed"\` AND \`team.specializations\` is a non-empty list, REFUSE: print "wide-team already configured (\`team.mode: fixed\` with N specialization(s)); the retrofit chain ends here. Edit \`swarm.yaml\` directly to change the roster, or run \`/retrofit-team\` only after removing the existing \`team:\` block." Show the existing \`team\` block. Exit the overlay. Do NOT log a D-ID for refusals.

2. **Refuse if the architecture document is missing.** If \`artifacts/design/architecture.md\` does not exist, REFUSE: print "no architecture document found at \`artifacts/design/architecture.md\`; run \`/feature\` or \`/plan\` first to produce one — \`/retrofit-team\` works on top of an existing architecture." Exit the overlay.

3. **Detect existing Domain Map.** Read \`artifacts/design/architecture.md\` in full. Look for a \`## Domain Map\` (or \`### Domain Map\`) heading. If present:
   - Show the existing section verbatim to the user.
   - Ask: "this architecture already has a Domain Map. What would you like to do? [refuse (default) / append-as-comment / replace]"
   - **\`refuse\`** (default on empty input or "no"): exit cleanly. Suggest \`bmad-swarm scaffold-team\` if they want the corresponding \`team:\` block.
   - **\`append-as-comment\`**: continue to step 4, but in step 8 the architect brief instructs the architect to insert the new map as a commented-out block adjacent to the existing one (not replacing it).
   - **\`replace\`**: requires the user to type the literal word \`replace\` (not "yes", not "y", not "go"). This is the same rationale as \`git push --force\` — destructive overwrites need a deliberate signal. If the user types anything else, treat it as refuse.

4. **Load architect Domain Map heuristics.** Read \`agents/architect.md\` — specifically the "Domain Map (when using fixed-mode wide team)" section. Internalize the four heuristics: (a) ≥2-story rule, (b) architecturally-significant exception, (c) cross-cutting dependencies → fallback, (d) orthogonality test. You will overlay the architect persona for the duration of the proposal conversation.

5. **Propose a Domain Map.** Walk the architecture's component / system-overview / module sections. Apply the four heuristics to partition the codebase into bounded domains. Each candidate domain needs: a kebab-case slug (matches \`^[a-z0-9][a-z0-9-]*[a-z0-9]$\` — same regex the validator enforces), a one-line description, the components it covers (file globs or module names from the architecture), and the anticipated story count. If the architecture is too thin (<200 lines, single paragraph, no component breakdown), surface this and recommend running \`/feature\` first; do NOT fabricate domains from a stub.

6. **Present the proposed map** to the user as the markdown table format from \`agents/architect.md\`:

\`\`\`markdown
## Domain Map

| Domain | Description | Components | Anticipated stories |
| --- | --- | --- | --- |
| backend-auth | OAuth2/PKCE, sessions, password flows | \`src/auth/*\`, \`src/middleware/auth-*\` | ~5 |
| ... | ... | ... | ... |
\`\`\`

   Announce the chosen insertion position before approval, in this priority order (per \`architecture-retrofit.md\` §3.4):
   - (a) Immediately after \`## Components\` / \`## Architecture\` / \`## System Overview\` if any of these is present.
   - (b) Otherwise, immediately before any existing section whose heading contains \`domain\` or \`team\`.
   - (c) Otherwise, append at the end of the document (before any \`## References\` or \`## Appendix\` if present).

   The user may override the chosen position. Iterate on the partition with the user until they're satisfied.

7. **Human approval gate.** Pause and explicitly ask: "Approve the Domain Map for insertion into \`artifacts/design/architecture.md\`?" Wait for an explicit "yes" / "approve" / equivalent affirmative. This honors the CLAUDE.md invariant "Human approval is required for: ... architecture". If the user declines, exit cleanly with no edits and no D-ID logged.

8. **On approval: spawn ONE architect for the file edit.** Emit this \`bmad-assembly\` block, then call TeamCreate with a brief that contains the approved Domain Map verbatim and the chosen insertion position:

\`\`\`bmad-assembly
entry_point: small-feature
complexity: 5
autonomy: auto
team:
  - role: architect
    model: opus
rationale: Insert approved Domain Map verbatim into architecture.md (one Edit, no design work; spawn brief constrains scope).
\`\`\`

   Architect spawn brief template:

   > Insert the following Domain Map section into \`artifacts/design/architecture.md\`.
   > Position: <chosen position from step 6 — describe precisely, e.g. "immediately after the \`## Components\` heading, before \`## Data Model\`">.
   > **Do not author a fresh Domain Map.** The map below is final and approved by the human; copy it verbatim.
   > **Do not write an ADR.** This is a doc patch, not a design decision; the design happened in the orchestrator overlay.
   > Do not edit any other content. Do not modify the existing component diagram or any other section.
   > After the edit, report back with one line: "Inserted Domain Map at <line>".
   >
   > <the approved Domain Map table verbatim>

9. **After the architect reports completion, log a tactical D-ID.** Append a one-line tactical entry to \`artifacts/context/decision-log.md\` with the next available D-ID: \`## D-NNN — Retrofit Domain Map added to architecture.md via /retrofit-team\` followed by Date, Source (\`orchestrator (auto)\` or with human ack), and a one-line Reason. Per \`methodology/decision-traceability.md\` "Team-Shape Decisions" — this is a tactical entry. If the architect spawn fails or rejects the brief, do NOT log the D-ID; report the failure to the user and exit. The user can re-invoke \`/retrofit-team\` to retry.

10. **Tell the user the next step.** Print: "Domain Map inserted. Next step: run \`bmad-swarm scaffold-team\` (no flag) to preview the corresponding \`swarm.yaml:team\` block, or \`bmad-swarm scaffold-team --write\` to back up \`swarm.yaml\` and inject the block. See README §Wide-team specialization for the full chain."

Do NOT chain to \`scaffold-team\` automatically — the two tools are deliberately decoupled per \`architecture-retrofit.md\` §12 trade-off 5. The user runs the CLI command themselves.

Cross-references: \`artifacts/design/architecture-retrofit.md\` §3 (Tool A design), ADR-010 (overlay-vs-spawn rationale), ADR-003 (orchestrator-write-gate — this overlay does NOT loosen the gate; the architect spawn does the file edit), CLAUDE.md (\`architecture\` human-approval invariant).`;
}
