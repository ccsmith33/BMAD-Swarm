import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverWorkspaces, mergeWorkspaceConfig, detectWorkspaceContext } from '../utils/workspace.js';

describe('Workspace (Monorepo) Support', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-workspace-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers workspaces listed in root config', () => {
    const rootDir = join(tmpDir, 'monorepo');
    mkdirSync(join(rootDir, 'packages', 'api'), { recursive: true });
    mkdirSync(join(rootDir, 'packages', 'web'), { recursive: true });

    writeFileSync(join(rootDir, 'packages', 'api', 'swarm.yaml'), 'project:\n  name: api-service\n');
    writeFileSync(join(rootDir, 'packages', 'web', 'swarm.yaml'), 'project:\n  name: web-app\n');

    const rootConfig = {
      workspaces: ['packages/api', 'packages/web'],
    };

    const workspaces = discoverWorkspaces(rootDir, rootConfig);
    assert.equal(workspaces.length, 2);
    assert.ok(workspaces.some(w => w.name === 'api-service'));
    assert.ok(workspaces.some(w => w.name === 'web-app'));
  });

  it('returns empty array when no workspaces configured', () => {
    const result = discoverWorkspaces(tmpDir, {});
    assert.equal(result.length, 0);
  });

  it('merges workspace config with root config', () => {
    const root = {
      project: { name: 'root', type: 'monorepo' },
      stack: { language: 'TypeScript', framework: 'React' },
      methodology: { autonomy: 'guided', phases: { exploration: { enabled: true } } },
      output: { artifacts_dir: './artifacts', code_dir: './src' },
    };

    const workspace = {
      project: { name: 'api' },
      stack: { framework: 'Express' },
      methodology: { autonomy: 'auto' },
      output: { code_dir: './api/src' },
    };

    const merged = mergeWorkspaceConfig(root, workspace);
    assert.equal(merged.project.name, 'api');
    assert.equal(merged.project.type, 'monorepo');
    assert.equal(merged.stack.language, 'TypeScript');
    assert.equal(merged.stack.framework, 'Express');
    assert.equal(merged.methodology.autonomy, 'auto');
    assert.equal(merged.output.code_dir, './api/src');
    assert.equal(merged.output.artifacts_dir, './artifacts');
  });

  it('returns root config when workspace config is null', () => {
    const root = { project: { name: 'root' } };
    const merged = mergeWorkspaceConfig(root, null);
    assert.equal(merged.project.name, 'root');
  });

  it('detects workspace context by walking up', () => {
    const rootDir = join(tmpDir, 'detect-ws');
    const wsDir = join(rootDir, 'packages', 'api');
    mkdirSync(wsDir, { recursive: true });

    writeFileSync(join(rootDir, 'swarm.yaml'), 'workspaces:\n  - packages/api\n');

    const result = detectWorkspaceContext(wsDir);
    assert.equal(result.isWorkspace, true);
    assert.equal(result.workspacePath, 'packages/api');
  });

  it('returns not-workspace when no parent swarm.yaml found', () => {
    const isolatedDir = join(tmpDir, 'isolated');
    mkdirSync(isolatedDir, { recursive: true });

    const result = detectWorkspaceContext(isolatedDir);
    assert.equal(result.isWorkspace, false);
  });
});
