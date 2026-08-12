import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { updateGitignore } from '../utils/fs-helpers.js';

// D-042 sharing model (§3.5): the managed section holds ONLY the minimal
// ignore set. The scaffold and config are deliberately git-tracked so a team
// can commit and share them.
const MINIMAL = ['.claude/settings.local.json', '.session-active', '*.bak'];
const RETIRED_BROAD = ['.claude/', 'artifacts/', 'swarm.yaml', 'project.yaml', 'CLAUDE.md', 'overrides/'];

function markerEntryLines(content) {
  const lines = content.split('\n').map((l) => l.replace(/\r$/, '').trim());
  const idx = lines.findIndex((l) => l === '# bmad-swarm (generated files)');
  if (idx === -1) return [];
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i] === '' || lines[i].startsWith('#')) break;
    out.push(lines[i]);
  }
  return out;
}

describe('updateGitignore (v2 sharing model)', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-gitignore-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .gitignore with exactly the minimal ignore set when none exists', () => {
    const projectDir = join(tmpDir, 'no-gitignore');
    mkdirSync(projectDir, { recursive: true });

    updateGitignore(projectDir);

    const gitignorePath = join(projectDir, '.gitignore');
    assert.ok(existsSync(gitignorePath), '.gitignore should be created');

    const content = readFileSync(gitignorePath, 'utf8');
    assert.ok(content.includes('# bmad-swarm (generated files)'), 'Should have marker comment');
    assert.deepEqual(markerEntryLines(content), MINIMAL, 'Managed section should be exactly the minimal set');
  });

  it('does NOT ignore the shared scaffold/config (tracked for sharing)', () => {
    const projectDir = join(tmpDir, 'tracks-scaffold');
    mkdirSync(projectDir, { recursive: true });

    updateGitignore(projectDir);

    const entries = markerEntryLines(readFileSync(join(projectDir, '.gitignore'), 'utf8'));
    for (const broad of RETIRED_BROAD) {
      assert.ok(!entries.includes(broad), `Managed section must not ignore ${broad}`);
    }
  });

  it('migrates a pre-Phase-1 broad section to the minimal set (replaces, not appends)', () => {
    const projectDir = join(tmpDir, 'migrate-broad');
    mkdirSync(projectDir, { recursive: true });
    // Old broad section as written by v1.
    writeFileSync(join(projectDir, '.gitignore'),
      'node_modules/\n*.log\n\n# bmad-swarm (generated files)\n.claude/\nartifacts/\nswarm.yaml\nproject.yaml\nCLAUDE.md\noverrides/\n'
    );

    updateGitignore(projectDir);

    const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
    const entries = markerEntryLines(content);
    assert.deepEqual(entries, MINIMAL, 'Old broad entries should be replaced by the minimal set');
    // User content outside the marker section is preserved.
    assert.ok(content.includes('node_modules/'), 'Should preserve user entries');
    assert.ok(content.includes('*.log'), 'Should preserve user entries');
    // The broad ignores must be gone.
    assert.ok(!entries.includes('.claude/'), 'Broad .claude/ must be removed');
    assert.ok(!entries.includes('overrides/'), 'Broad overrides/ must be removed');
  });

  it('appends a managed section to an existing .gitignore without a marker', () => {
    const projectDir = join(tmpDir, 'existing-no-marker');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n*.log\n');

    updateGitignore(projectDir);

    const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
    assert.ok(content.includes('node_modules/'), 'Should preserve existing entries');
    assert.deepEqual(markerEntryLines(content), MINIMAL, 'Should add the minimal managed set');
  });

  it('is idempotent - no duplicates and stable content on repeated calls', () => {
    const projectDir = join(tmpDir, 'idempotent');
    mkdirSync(projectDir, { recursive: true });

    updateGitignore(projectDir);
    const first = readFileSync(join(projectDir, '.gitignore'), 'utf8');
    updateGitignore(projectDir);
    const second = readFileSync(join(projectDir, '.gitignore'), 'utf8');

    assert.equal(first, second, 'Second call should not change the file');
    const markerMatches = second.match(/# bmad-swarm/g);
    assert.equal(markerMatches.length, 1, 'Should have exactly one marker');
    const localMatches = second.match(/\.claude\/settings\.local\.json/g);
    assert.equal(localMatches.length, 1, 'Should have exactly one settings.local.json entry');
  });

  it('does not modify .gitignore when the managed section is already minimal', () => {
    const projectDir = join(tmpDir, 'already-minimal');
    mkdirSync(projectDir, { recursive: true });
    const original =
      'node_modules/\n\n# bmad-swarm (generated files)\n' + MINIMAL.join('\n') + '\n';
    writeFileSync(join(projectDir, '.gitignore'), original);

    updateGitignore(projectDir);

    const content = readFileSync(join(projectDir, '.gitignore'), 'utf8');
    assert.equal(content, original, 'Should not modify when already minimal');
  });

  it('reports custom in-block entries dropped by the wholesale replace (L1)', () => {
    const projectDir = join(tmpDir, 'drop-custom');
    mkdirSync(projectDir, { recursive: true });
    // A user had appended `my-secret.env` INSIDE the old bmad-managed block.
    writeFileSync(join(projectDir, '.gitignore'),
      'node_modules/\n\n# bmad-swarm (generated files)\n.claude/\nartifacts/\nmy-secret.env\nswarm.yaml\noverrides/\n'
    );

    const result = updateGitignore(projectDir);

    assert.ok(result.changed, 'should report the file changed');
    assert.deepEqual(result.droppedCustom, ['my-secret.env'], 'should report only the user custom entry, not bmad-managed ones');

    // The custom entry is indeed gone from the managed section.
    const entries = markerEntryLines(readFileSync(join(projectDir, '.gitignore'), 'utf8'));
    assert.deepEqual(entries, MINIMAL, 'managed section is the minimal set');
    assert.ok(!entries.includes('my-secret.env'), 'custom entry removed from managed block');
  });

  it('reports no dropped entries when the block held only bmad-managed ones', () => {
    const projectDir = join(tmpDir, 'drop-none');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, '.gitignore'),
      '# bmad-swarm (generated files)\n.claude/\nartifacts/\nswarm.yaml\nproject.yaml\nCLAUDE.md\noverrides/\n'
    );

    const result = updateGitignore(projectDir);

    assert.deepEqual(result.droppedCustom, [], 'historical bmad entries are not "custom" and must not be reported');
  });

  it('migrates a broad section even with Windows-style line endings', () => {
    const projectDir = join(tmpDir, 'crlf');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, '.gitignore'),
      'node_modules/\r\n# bmad-swarm (generated files)\r\n.claude/\r\nartifacts/\r\nswarm.yaml\r\nproject.yaml\r\nCLAUDE.md\r\noverrides/\r\n'
    );

    updateGitignore(projectDir);

    const entries = markerEntryLines(readFileSync(join(projectDir, '.gitignore'), 'utf8'));
    assert.deepEqual(entries, MINIMAL, 'Should migrate to minimal set despite CRLF');
  });
});
