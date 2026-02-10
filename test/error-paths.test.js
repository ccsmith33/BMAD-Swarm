import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSwarmConfig } from '../utils/config.js';
import { render } from '../utils/template.js';
import { ejectAgent, unejectAgent } from '../generators/agent-generator.js';
import { getProjectPaths } from '../utils/paths.js';

describe('Error Paths', () => {
  it('loadSwarmConfig throws on malformed YAML', () => {
    const dir = join(tmpdir(), 'bmad-error-test-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const badPath = join(dir, 'bad.yaml');
    writeFileSync(badPath, '{ invalid yaml: [missing bracket');
    assert.throws(() => loadSwarmConfig(badPath));
    rmSync(dir, { recursive: true, force: true });
  });

  it('loadSwarmConfig throws on invalid autonomy', () => {
    const dir = join(tmpdir(), 'bmad-err-auto-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'swarm.yaml');
    writeFileSync(path, 'project:\n  name: test\nmethodology:\n  autonomy: typo\n');
    assert.throws(() => loadSwarmConfig(path), /autonomy.*typo/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it('loadSwarmConfig throws on non-existent file', () => {
    assert.throws(() => loadSwarmConfig('/nonexistent/swarm.yaml'), /not found/i);
  });

  it('render leaves deeply nested undefined path unreplaced', () => {
    const result = render('{{a.b.c.d.e}}', { a: { b: {} } });
    assert.equal(result, '{{a.b.c.d.e}}');
  });

  it('ejectAgent throws for unknown agent', () => {
    const dir = join(tmpdir(), 'bmad-err-eject-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const paths = getProjectPaths(dir);
    assert.throws(() => ejectAgent('fake-agent', paths), /fake-agent|unknown|not.*recognized/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it('unejectAgent throws for non-ejected agent', () => {
    const dir = join(tmpdir(), 'bmad-err-uneject-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const paths = getProjectPaths(dir);
    assert.throws(() => unejectAgent('orchestrator', paths), /not.*ejected|not found|does not exist/i);
    rmSync(dir, { recursive: true, force: true });
  });
});
