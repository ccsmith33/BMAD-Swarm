import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import yaml from 'js-yaml';
import { splitFrontmatter, SCHEMA_VERSION } from './project-brain.js';

// Phase machine — the lifecycle-phase state, now homed in the project-brain.md
// FRONTMATTER (D-037 / ADR-018 point 5), not project.yaml. project.yaml was a
// prompted chore-file with no guaranteed reader; it lied in 8/9 field projects
// and is DELETED. The brain frontmatter has a guaranteed reader (the warm boot,
// every session) and event-driven writers (gate/phase transitions), so machine
// state written here survives. All functions here take the brain path.

const PHASE_ORDER = ['not-started', 'ideation', 'exploration', 'definition', 'design', 'implementation', 'delivery', 'complete'];

// A minimal, schema-valid brain used when phase state must be written but no
// brain exists yet (bootstrap via `phase set`, or the project.yaml migration).
// It validates against utils/project-brain.js (all sections present + within
// caps, required frontmatter incl. an empty gates map).
function minimalBrainScaffold({ phase = 'not-started', gates = {} } = {}) {
  const fm = {
    schema: SCHEMA_VERSION,
    updated: new Date().toISOString(),
    checkpoint: 0,
    phase,
    gates,
    staleness: { 'ledger-events-since-checkpoint': 0 },
  };
  const body = [
    '',
    '## What this is (and why)',
    'Machine-state placeholder created by the phase machine. The orchestrator owns this prose — replace it.',
    '',
    '## Current mental model',
    '',
    '## Load-bearing facts',
    '',
    '## Active threads',
    '',
    '## Dead ends',
    '',
    '## Open questions',
    '',
    '## Pointers',
    '- decision-log: artifacts/context/decision-log.md',
    '',
  ].join('\n');
  return `---\n${yaml.dump(fm, { lineWidth: 120, noRefs: true })}---\n${body}`;
}

// Read {frontmatter, body} from a brain file (throws if it is not there).
function readBrain(brainPath) {
  if (!existsSync(brainPath)) {
    throw new Error(`project-brain.md not found at ${brainPath}`);
  }
  const raw = readFileSync(brainPath, 'utf8');
  const { frontmatter, body, frontmatterError } = splitFrontmatter(raw);
  if (frontmatterError) throw new Error(`project-brain.md frontmatter is unreadable: ${frontmatterError}`);
  return { frontmatter: frontmatter || {}, body };
}

// Write mutated frontmatter back, preserving the prose body verbatim.
function writeBrain(brainPath, frontmatter, body) {
  mkdirSync(dirname(brainPath), { recursive: true });
  const out = `---\n${yaml.dump(frontmatter, { lineWidth: 120, noRefs: true })}---\n${body}`;
  writeFileSync(brainPath, out);
}

/**
 * Get current phase from the brain frontmatter.
 * @param {string} brainPath - path to artifacts/context/project-brain.md
 * @returns {{ phase: string, history: Array }}
 */
export function getCurrentPhase(brainPath) {
  const { frontmatter } = readBrain(brainPath);
  return {
    phase: frontmatter.phase || 'not-started',
    history: frontmatter.phase_history || [],
  };
}

/**
 * Get available transitions from current phase.
 * @param {string} currentPhase
 * @returns {string[]}
 */
export function getAvailableTransitions(currentPhase) {
  const idx = PHASE_ORDER.indexOf(currentPhase);
  if (idx === -1) return PHASE_ORDER.slice(1);
  if (idx >= PHASE_ORDER.length - 1) return [];
  return [PHASE_ORDER[idx + 1]];
}

/**
 * Advance to the next phase.
 * @param {string} brainPath
 * @param {object} options - { force: boolean }
 * @returns {{ from: string, to: string }}
 */
export function advancePhase(brainPath, options = {}) {
  const { frontmatter, body } = readBrain(brainPath);
  const currentPhase = frontmatter.phase || 'not-started';
  const transitions = getAvailableTransitions(currentPhase);

  if (transitions.length === 0) {
    throw new Error(`Cannot advance from "${currentPhase}" - already at final phase`);
  }

  const nextPhase = transitions[0];
  return setPhase(brainPath, nextPhase, { ...options, _parsed: { frontmatter, body } });
}

/**
 * Set phase to a specific value in the brain frontmatter (bootstraps a minimal
 * brain if none exists).
 * @param {string} brainPath
 * @param {string} targetPhase
 * @param {object} options - { force: boolean }
 * @returns {{ from: string, to: string }}
 */
export function setPhase(brainPath, targetPhase, options = {}) {
  if (!PHASE_ORDER.includes(targetPhase) && !options.force) {
    throw new Error(`Invalid phase "${targetPhase}". Valid phases: ${PHASE_ORDER.join(', ')}`);
  }

  let frontmatter;
  let body;
  if (options._parsed) {
    ({ frontmatter, body } = options._parsed);
  } else if (existsSync(brainPath)) {
    ({ frontmatter, body } = readBrain(brainPath));
  } else {
    // Bootstrap a fresh, schema-valid brain, then set the phase into it.
    const scaffold = splitFrontmatter(minimalBrainScaffold({ phase: 'not-started' }));
    frontmatter = scaffold.frontmatter;
    body = scaffold.body;
  }

  const from = frontmatter.phase || 'not-started';
  const now = new Date().toISOString();

  if (!frontmatter.phase_history) frontmatter.phase_history = [];
  if (from !== targetPhase) {
    const lastEntry = frontmatter.phase_history[frontmatter.phase_history.length - 1];
    if (lastEntry && !lastEntry.exited_at) lastEntry.exited_at = now;
    frontmatter.phase_history.push({ phase: targetPhase, entered_at: now, exited_at: null });
  }

  frontmatter.phase = targetPhase;
  frontmatter.updated = now;
  if (frontmatter.gates === undefined) frontmatter.gates = {};

  writeBrain(brainPath, frontmatter, body);
  return { from, to: targetPhase };
}

/**
 * WS-11 migration (D-037): fold a legacy project.yaml's `phase` into the brain
 * frontmatter, then delete project.yaml. Idempotent — a second run (no
 * project.yaml) is a no-op. Runs from `bmad-swarm update` step 4.2.
 *
 * This migrates a USER-OWNED file; it must run even when the live-swap guard
 * skips hook/settings regeneration (migrating project.yaml is not a hook swap).
 *
 * @param {string} projectRoot
 * @param {string} brainPath - path to artifacts/context/project-brain.md
 * @returns {{ migrated: boolean, phase?: string, createdBrain?: boolean }}
 */
export function migrateProjectYamlToBrain(projectRoot, brainPath) {
  const projectYamlPath = `${projectRoot}/project.yaml`;
  if (!existsSync(projectYamlPath)) return { migrated: false };

  let phase = 'not-started';
  try {
    const legacy = yaml.load(readFileSync(projectYamlPath, 'utf8')) || {};
    if (typeof legacy.phase === 'string' && legacy.phase.trim()) phase = legacy.phase.trim();
  } catch { /* unreadable legacy file: migrate with the default phase, still delete it */ }

  let createdBrain = false;
  if (existsSync(brainPath)) {
    const { frontmatter, body } = readBrain(brainPath);
    frontmatter.phase = phase;
    frontmatter.updated = new Date().toISOString();
    if (frontmatter.gates === undefined) frontmatter.gates = {};
    writeBrain(brainPath, frontmatter, body);
  } else {
    mkdirSync(dirname(brainPath), { recursive: true });
    writeFileSync(brainPath, minimalBrainScaffold({ phase }));
    createdBrain = true;
  }

  unlinkSync(projectYamlPath);
  return { migrated: true, phase, createdBrain };
}

export { PHASE_ORDER, minimalBrainScaffold };
