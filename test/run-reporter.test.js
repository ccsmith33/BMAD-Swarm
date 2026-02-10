import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateRunReport } from '../utils/run-reporter.js';

describe('Run Reporter', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-reporter-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates a run report file', () => {
    const projectDir = join(tmpDir, 'report-test');
    mkdirSync(join(projectDir, 'artifacts', 'reviews'), { recursive: true });
    mkdirSync(join(projectDir, 'artifacts', 'planning'), { recursive: true });

    writeFileSync(join(projectDir, 'artifacts', 'planning', 'prd.md'), '# PRD');

    const config = {
      project: { name: 'test-project' },
      methodology: { autonomy: 'auto' },
    };

    const paths = {
      artifactsDir: join(projectDir, 'artifacts'),
      projectYaml: join(projectDir, 'project.yaml'),
    };

    const reportPath = generateRunReport(config, paths);
    assert.ok(existsSync(reportPath));

    const content = readFileSync(reportPath, 'utf8');
    assert.ok(content.includes('# Run Report'));
    assert.ok(content.includes('test-project'));
    assert.ok(content.includes('auto'));
    assert.ok(content.includes('artifacts/planning/prd.md'));
  });

  it('includes optional data when provided', () => {
    const projectDir = join(tmpDir, 'report-opts');
    mkdirSync(join(projectDir, 'artifacts', 'reviews'), { recursive: true });

    const config = {
      project: { name: 'opts-test' },
      methodology: { autonomy: 'guided' },
    };

    const paths = {
      artifactsDir: join(projectDir, 'artifacts'),
      projectYaml: join(projectDir, 'project.yaml'),
    };

    const reportPath = generateRunReport(config, paths, {
      agentsTasks: ['developer: Implement login', 'reviewer: Review login'],
      qualityIssues: ['Missing error handling in auth.js'],
      decisions: ['Use JWT for session management'],
    });

    const content = readFileSync(reportPath, 'utf8');
    assert.ok(content.includes('developer: Implement login'));
    assert.ok(content.includes('reviewer: Review login'));
    assert.ok(content.includes('Missing error handling'));
    assert.ok(content.includes('JWT for session management'));
  });

  it('includes phase history from project.yaml', () => {
    const projectDir = join(tmpDir, 'report-phases');
    mkdirSync(join(projectDir, 'artifacts', 'reviews'), { recursive: true });

    writeFileSync(join(projectDir, 'project.yaml'), `
phase: implementation
status: active
phase_history:
  - from: exploration
    to: definition
    timestamp: "2026-01-01"
  - from: definition
    to: design
    timestamp: "2026-01-02"
`);

    const config = {
      project: { name: 'phase-test' },
      methodology: { autonomy: 'auto' },
    };

    const paths = {
      artifactsDir: join(projectDir, 'artifacts'),
      projectYaml: join(projectDir, 'project.yaml'),
    };

    const reportPath = generateRunReport(config, paths);
    const content = readFileSync(reportPath, 'utf8');
    assert.ok(content.includes('implementation'));
    assert.ok(content.includes('exploration'));
    assert.ok(content.includes('definition'));
  });
});
