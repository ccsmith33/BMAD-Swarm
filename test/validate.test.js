import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateArtifacts } from '../utils/artifact-validator.js';

describe('Artifact Validator', () => {
  const tmpDir = join(tmpdir(), 'bmad-validate-test-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates valid PRD', () => {
    const dir = join(tmpDir, 'valid-prd');
    mkdirSync(join(dir, 'planning'), { recursive: true });
    writeFileSync(join(dir, 'planning', 'prd.md'), `# PRD
## Purpose
The purpose of this project.
## Functional Requirements
FR-1: Do the thing.
## Non-Functional Requirements
NFR-1: Response time < 200ms.
## User Journeys
User opens the app and does stuff.
## Success Criteria
All tests pass.
`);
    const result = validateArtifacts(dir, { phase: 'planning' });
    assert.equal(result.failed, 0);
  });

  it('catches PRD missing sections', () => {
    const dir = join(tmpDir, 'bad-prd');
    mkdirSync(join(dir, 'planning'), { recursive: true });
    writeFileSync(join(dir, 'planning', 'prd.md'), '# PRD\n## Purpose\nJust the purpose.\n');
    const result = validateArtifacts(dir, { phase: 'planning' });
    assert.ok(result.failed > 0);
    assert.ok(result.results[0].issues.some(i => i.includes('Functional Requirements')));
  });

  it('validates valid product brief', () => {
    const dir = join(tmpDir, 'valid-brief');
    mkdirSync(join(dir, 'planning'), { recursive: true });
    writeFileSync(join(dir, 'planning', 'product-brief.md'), `# Product Brief
## Vision
Our vision.
## Target Users
Developers.
## Value Proposition
Save time.
## Scope
The whole thing.
`);
    const result = validateArtifacts(dir, { phase: 'planning' });
    assert.equal(result.failed, 0);
  });

  it('validates story with BDD criteria', () => {
    const dir = join(tmpDir, 'valid-story');
    mkdirSync(join(dir, 'implementation', 'stories'), { recursive: true });
    writeFileSync(join(dir, 'implementation', 'stories', 'story-1.md'), `# Story 1
## Acceptance Criteria
Given the user is logged in
When they click save
Then the data is saved

## Tasks
- [ ] Implement save endpoint
- [ ] Write tests

## Size
Story points: 3
`);
    const result = validateArtifacts(dir, { phase: 'implementation' });
    assert.equal(result.failed, 0);
  });

  it('catches story missing BDD', () => {
    const dir = join(tmpDir, 'bad-story');
    mkdirSync(join(dir, 'implementation', 'stories'), { recursive: true });
    writeFileSync(join(dir, 'implementation', 'stories', 'story-2.md'), `# Story 2
## Description
Just do the thing.
`);
    const result = validateArtifacts(dir, { phase: 'implementation' });
    assert.ok(result.failed > 0);
  });

  it('validates single artifact by path', () => {
    const dir = join(tmpDir, 'single');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'test.md');
    writeFileSync(filePath, '# Test Document\n\nThis is a test document with enough content to pass validation checks.\n');
    const result = validateArtifacts(dir, { artifact: filePath });
    assert.equal(result.results.length, 1);
  });

  it('handles empty artifacts directory', () => {
    const dir = join(tmpDir, 'empty');
    mkdirSync(dir, { recursive: true });
    const result = validateArtifacts(dir);
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 0);
  });
});
