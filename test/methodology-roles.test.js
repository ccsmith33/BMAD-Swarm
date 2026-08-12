import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const methodologyDir = join(__dirname, '..', 'methodology');

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
  const files = [
    join(methodologyDir, 'phases.yaml'),
    ...readdirSync(join(methodologyDir, 'task-templates'))
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => join(methodologyDir, 'task-templates', f)),
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
