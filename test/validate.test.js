import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateArtifacts, VALID_PHASES } from '../utils/artifact-validator.js';

// Full section sets, keyed to methodology/artifact-schemas/spec.yaml. Building
// valid fixtures from these keeps the tests honest against the single source.
const PRD = `# Product Requirements Document - Test
## 1. Executive Summary
Vision, differentiator, and target users.
## 2. Success Criteria
Retention target.
## 3. Product Scope
MVP scope.
## 4. User Journeys
Journey 1.
## 5. Functional Requirements
### FR-001: Do the thing
The system does the thing.
## 6. Non-Functional Requirements
### Performance
NFR-P01: under 200ms.
`;

const PRODUCT_BRIEF = `# Product Brief: Test
## Vision Statement
What and why.
## Problem Statement
The problem.
## Target Users
Developers.
## Core Capabilities
- Cap 1
## Success Metrics
- Metric 1
## Scope Boundaries
In and out of scope.
`;

describe('Artifact Validator (spec-driven)', () => {
  const tmpDir = join(tmpdir(), 'bmad-validate-test-' + Date.now());

  before(() => { mkdirSync(tmpDir, { recursive: true }); });
  after(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function writePlanning(sub, name, content) {
    const dir = join(tmpDir, sub);
    mkdirSync(join(dir, 'planning'), { recursive: true });
    writeFileSync(join(dir, 'planning', name), content);
    return dir;
  }

  it('validates a schema-complete PRD', () => {
    const dir = writePlanning('valid-prd', 'prd.md', PRD);
    const result = validateArtifacts(dir, { phase: 'planning' });
    assert.equal(result.failed, 0, JSON.stringify(result.results));
  });

  it('catches a PRD missing required sections', () => {
    const dir = writePlanning('bad-prd', 'prd.md', '# PRD\n## 1. Executive Summary\nJust that.\n');
    const result = validateArtifacts(dir, { phase: 'planning' });
    assert.ok(result.failed > 0);
    assert.ok(result.results[0].issues.some(i => i.includes('Functional Requirements')));
  });

  it('catches a PRD whose FRs are not numbered', () => {
    const noFrNumbers = PRD.replace('### FR-001: Do the thing', '### Do the thing');
    const dir = writePlanning('unnumbered-prd', 'prd.md', noFrNumbers);
    const result = validateArtifacts(dir, { phase: 'planning' });
    assert.ok(result.results[0].issues.some(i => i.includes('numbered')));
  });

  it('uses headings, not prose mentions, for sections', () => {
    // The words appear in prose but not as headings -> must still fail.
    const prose = '# PRD\nThis doc covers executive summary, success criteria, product scope, user journeys, functional requirements and non-functional requirements in passing.\n';
    const dir = writePlanning('prose-prd', 'prd.md', prose);
    const result = validateArtifacts(dir, { phase: 'planning' });
    assert.ok(result.failed > 0, 'prose mentions must not satisfy heading checks');
  });

  it('validates a schema-complete product brief', () => {
    const dir = writePlanning('valid-brief', 'product-brief.md', PRODUCT_BRIEF);
    const result = validateArtifacts(dir, { phase: 'planning' });
    assert.equal(result.failed, 0, JSON.stringify(result.results));
  });

  it('validates a full (product) architecture', () => {
    const arch = `# Architecture - Test
## 1. Technology Stack
Node.js >= 18.
## 2. System Architecture
Monolith.
## 4. Data Models
User entity.
## 5. API Design
POST /login.
## 8. Key Architectural Decisions
ADR-001.
`;
    const dir = join(tmpDir, 'valid-arch');
    mkdirSync(join(dir, 'design'), { recursive: true });
    writeFileSync(join(dir, 'design', 'architecture.md'), arch);
    const result = validateArtifacts(dir, { phase: 'design' });
    assert.equal(result.failed, 0, JSON.stringify(result.results));
  });

  it('validates a delta architecture without the full product sections', () => {
    const delta = `# Architecture Delta - Feature X

**Scope:** delta

## Overview
Adds an endpoint. Traces to D-041 and ADR-007.
`;
    const dir = join(tmpDir, 'delta-arch');
    mkdirSync(join(dir, 'design'), { recursive: true });
    writeFileSync(join(dir, 'design', 'architecture.md'), delta);
    const result = validateArtifacts(dir, { phase: 'design' });
    assert.equal(result.failed, 0, JSON.stringify(result.results));
  });

  it('fails a delta architecture missing decision references', () => {
    const delta = `# Architecture Delta - Feature X

**Scope:** delta

## Overview
Adds an endpoint. No decision reference here.
`;
    const dir = join(tmpDir, 'delta-arch-nodec');
    mkdirSync(join(dir, 'design'), { recursive: true });
    writeFileSync(join(dir, 'design', 'architecture.md'), delta);
    const result = validateArtifacts(dir, { phase: 'design' });
    assert.ok(result.results[0].issues.some(i => i.includes('decisions')));
  });

  function writeStory(sub, name, content) {
    const dir = join(tmpDir, sub);
    mkdirSync(join(dir, 'implementation', 'stories'), { recursive: true });
    writeFileSync(join(dir, 'implementation', 'stories', name), content);
    return dir;
  }

  it('validates a BDD story (Given/When/Then)', () => {
    const dir = writeStory('bdd-story', 'story-1.md', `# Story 1
## Acceptance Criteria
### AC1: happy path
Given the user is logged in
When they click save
Then the data is saved
## Tasks
- [ ] Implement save endpoint
- [ ] Write tests
`);
    const result = validateArtifacts(dir, { phase: 'implementation' });
    assert.equal(result.failed, 0, JSON.stringify(result.results));
  });

  it('validates a checklist-AC story (bug-fix register)', () => {
    const dir = writeStory('checklist-story', 'story-A-BUG-1.md', `# Story A-BUG-1
## Acceptance Criteria
- [ ] AC1: validate --phase bogus exits 1 with a valid-phases message
- [ ] AC2: no TypeError is thrown
## Tasks
- [ ] Fix the phase map
- [ ] Write a test
`);
    const result = validateArtifacts(dir, { phase: 'implementation' });
    assert.equal(result.failed, 0, JSON.stringify(result.results));
  });

  it('validates a Given/Then AC-heading story (When omitted)', () => {
    const dir = writeStory('given-then-story', 'story-RT-9.md', `# Story RT-9
## Acceptance Criteria
### AC1: file is generated
**Given** the project after update runs
**Then** the file exists
## Tasks
- [ ] Generate the file
- [ ] Write tests
`);
    const result = validateArtifacts(dir, { phase: 'implementation' });
    assert.equal(result.failed, 0, JSON.stringify(result.results));
  });

  it('does NOT require story points', () => {
    const dir = writeStory('no-points-story', 'story-2.md', `# Story 2
## Acceptance Criteria
- [ ] AC1: it works
## Tasks
- [ ] Do it
`);
    const result = validateArtifacts(dir, { phase: 'implementation' });
    assert.equal(result.failed, 0, 'story points must not be a requirement');
  });

  it('catches a story with no acceptance criteria', () => {
    const dir = writeStory('bad-story', 'story-3.md', '# Story 3\n## Description\nJust do the thing.\n');
    const result = validateArtifacts(dir, { phase: 'implementation' });
    assert.ok(result.failed > 0);
  });

  it('validates a single artifact by path (generic)', () => {
    const dir = join(tmpDir, 'single');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'test.md');
    writeFileSync(filePath, '# Test Document\n\nEnough content to pass the generic non-trivial check.\n');
    const result = validateArtifacts(dir, { artifact: filePath });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].status, 'pass');
  });

  it('handles an empty artifacts directory', () => {
    const dir = join(tmpDir, 'empty');
    mkdirSync(dir, { recursive: true });
    const result = validateArtifacts(dir);
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 0);
  });

  it('throws on an unknown --phase instead of a TypeError (D-10)', () => {
    assert.throws(
      () => validateArtifacts(tmpDir, { phase: 'bogus' }),
      /Unknown phase: bogus.*Valid phases/,
    );
  });

  it('exports VALID_PHASES including reviews', () => {
    assert.ok(VALID_PHASES.includes('reviews'));
    assert.ok(VALID_PHASES.includes('implementation'));
  });
});
