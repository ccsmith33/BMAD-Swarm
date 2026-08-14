import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const methodologyDir = join(__dirname, '..', 'methodology');
const agentsDir = join(__dirname, '..', 'agents');
const ALL_ROLES = [
  'orchestrator', 'ideator', 'researcher', 'strategist', 'architect',
  'developer', 'reviewer', 'security', 'devops',
];

// The real 9-role set (2.0.0). story-engineer, qa, retrospective, and
// tech-writer were retired: strategist owns story decomposition, the
// reviewer's test-coverage/docs lenses absorb qa/tech-writer, and the
// orchestrator runs retrospectives.
const VALID_ROLES = new Set([
  'orchestrator', 'ideator', 'researcher', 'strategist', 'architect',
  'developer', 'reviewer', 'security', 'devops',
]);

// Walk a parsed YAML tree and collect every value that staffs an agent:
// scalar `agent:`/`producer:` fields and string entries of `agents:`/
// `primary:`/`supporting:` arrays.
function collectRoles(node, found = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectRoles(item, found);
    return found;
  }
  if (node === null || typeof node !== 'object') return found;
  for (const [key, value] of Object.entries(node)) {
    if ((key === 'agent' || key === 'producer') && typeof value === 'string') {
      found.push(value);
    } else if (['agents', 'primary', 'supporting'].includes(key) && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') found.push(item);
        else collectRoles(item, found);
      }
    } else {
      collectRoles(value, found);
    }
  }
  return found;
}

describe('Methodology role references', () => {
  // task-templates/ was deleted (AP-9): zero readers, staffed the retired roster.
  // phases.yaml is now the only role-staffing methodology file.
  const files = [
    join(methodologyDir, 'phases.yaml'),
  ];

  for (const file of files) {
    it(`staffs only real roles in ${file.split('/').slice(-2).join('/')}`, () => {
      const doc = yaml.load(readFileSync(file, 'utf8'));
      const roles = collectRoles(doc);
      assert.ok(roles.length > 0, 'Expected at least one staffed role');
      const unknown = roles.filter((r) => !VALID_ROLES.has(r));
      assert.deepEqual(unknown, [], `Unknown/retired roles staffed: ${unknown.join(', ')}`);
    });
  }
});

// Stream R — the regime router lives in ONE table in decision-classification.md
// (a second table that must stay in lockstep would drift). These assertions pin
// the load-bearing router facts and the D-038 mode column.
describe('Regime router (decision-classification.md)', () => {
  const doc = readFileSync(join(methodologyDir, 'decision-classification.md'), 'utf8');

  it('keeps the three regimes as re-keyed actuators (shape/risk, not size)', () => {
    assert.match(doc, /The Regime Router/);
    assert.match(doc, /\*\*solo\*\*/);
    assert.match(doc, /named workflow/i);
    assert.match(doc, /agentic team/);
  });

  it('splits production shape from verification depth (D-57 reframe)', () => {
    assert.match(doc, /Decision 1 — production shape/);
    assert.match(doc, /Decision 2 — verification depth/);
    // production shape is seam-driven, never score-driven
    assert.match(doc, /Driven ONLY by seams/);
    // the 5-factor table is redefined to RISK factors...
    assert.match(doc, /Constraint density/);
    assert.match(doc, /Blast radius/);
    assert.match(doc, /Reversibility/);
    assert.match(doc, /Verifiability/);
    assert.match(doc, /Ambiguity/);
    // ...while preserving the 5–15 range so the assembly block + lint stay untouched
    assert.match(doc, /5–15/);
  });

  it('re-keys WS-12 to risk-not-size at the same threshold (≥ 12)', () => {
    assert.match(doc, /Plan approval at risk score ≥ 12/);
    assert.match(doc, /gates dangerous plans, not big ones/);
  });

  it('encodes escalation-as-script-logic and the router-miss calibration event', () => {
    assert.match(doc, /Escalation is script logic/);
    assert.match(doc, /escalate: agentic/); // the missing primitive spike 3 found
    assert.match(doc, /router-miss/);
  });

  it('ships named workflows only and stays a rule table (kill-list #7)', () => {
    assert.ok(doc.includes('.claude/workflows/'), 'must reference the named-workflow location');
    assert.match(doc, /never learned/);
  });

  it('has the D-038 mode column: day actions AND the Night Ladder rungs', () => {
    assert.match(doc, /Mode Column/);
    assert.match(doc, /silent-proceed/);
    assert.match(doc, /Rung 1/);
    assert.match(doc, /Rung 2/);
    assert.match(doc, /Rung 3/);
    assert.match(doc, /Night Ladder/);
  });

  it('applies Stream S\'s verbatim Night Ladder actions (fork/default/park)', () => {
    assert.match(doc, /FORK IT/);
    assert.match(doc, /DEFAULT IT/);
    assert.match(doc, /PARK \+ ROUTE AROUND/);
  });

  it('keeps the Contradiction Escalator invariant across modes', () => {
    assert.match(doc, /Contradiction Escalator/);
    assert.match(doc, /regime-invariant|invariant across every mode/);
  });
});

// Stream R — the identity spine: every role carries regime awareness, and the
// orchestrator carries the router-consultation section plus the flagged S/GM
// verbatim-text integration slots.
describe('Identity spine — regime awareness across the nine roles', () => {
  for (const role of ALL_ROLES) {
    it(`${role}.md carries a regime-awareness reference`, () => {
      const body = readFileSync(join(agentsDir, `${role}.md`), 'utf8');
      const hasSection = /## Regime (awareness|routing)/.test(body);
      const refsRouter = /decision-classification\.md/.test(body) && /regime/i.test(body);
      assert.ok(hasSection && refsRouter, `${role}.md must reference the regime router`);
    });
  }

  it('orchestrator.md consults the router and flags both handoff slots', () => {
    const body = readFileSync(join(agentsDir, 'orchestrator.md'), 'utf8');
    assert.match(body, /## Regime routing \(the router\)/);
    assert.match(body, /Plan approval at complexity ≥ 12/);
    // Stream S's Night-shift block has landed (applied verbatim).
    assert.match(body, /## Night shift — the \/sleep protocol/);
    assert.match(body, /Never-wake is the default/);
    // Stream GM's Governor night-mode block has landed (applied verbatim).
    assert.match(body, /Governor — night mode \(scheduler\)/);
    assert.match(body, /Redirects, never rations/);
  });

  it('developer.md instructs escalate-do-not-guess in a workflow node', () => {
    const body = readFileSync(join(agentsDir, 'developer.md'), 'utf8');
    assert.match(body, /`escalate` output/);
    assert.match(body, /router-miss/);
  });

  it('reviewer.md keeps the review gate regime-invariant', () => {
    const body = readFileSync(join(agentsDir, 'reviewer.md'), 'utf8');
    assert.match(body, /regime-invariant/);
    assert.match(body, /router-miss/);
  });

  it('security.md keeps the floor invariant across regime and mode', () => {
    const body = readFileSync(join(agentsDir, 'security.md'), 'utf8');
    assert.match(body, /invariant across every regime and every mode/);
  });
});
