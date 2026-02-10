import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * Validate artifacts and return results.
 * @param {string} artifactsDir - Path to artifacts directory
 * @param {object} options - { phase, artifact }
 * @returns {{ passed: number, failed: number, results: Array<{file, status, issues}> }}
 */
export function validateArtifacts(artifactsDir, options = {}) {
  const results = [];

  if (options.artifact) {
    results.push(validateSingleArtifact(options.artifact));
    const passed = results.filter(r => r.status === 'pass').length;
    return { passed, failed: results.length - passed, results };
  }

  const phaseMap = {
    exploration: 'exploration',
    planning: 'planning',
    design: 'design',
    implementation: 'implementation',
    reviews: 'reviews',
  };

  const phases = options.phase ? { [options.phase]: phaseMap[options.phase] } : phaseMap;

  for (const [phaseName, dir] of Object.entries(phases)) {
    const phaseDir = join(artifactsDir, dir);
    if (!existsSync(phaseDir)) continue;

    const files = findMarkdownFiles(phaseDir);
    for (const file of files) {
      results.push(validateSingleArtifact(file));
    }
  }

  const passed = results.filter(r => r.status === 'pass').length;
  return { passed, failed: results.length - passed, results };
}

function findMarkdownFiles(dir) {
  const files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findMarkdownFiles(fullPath));
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  } catch { /* ignore permission errors */ }
  return files;
}

function validateSingleArtifact(filePath) {
  const name = basename(filePath);
  const issues = [];

  if (!existsSync(filePath)) {
    return { file: filePath, status: 'fail', issues: ['File does not exist'] };
  }

  const content = readFileSync(filePath, 'utf8');

  if (name === 'prd.md') {
    validatePRD(content, issues);
  } else if (name === 'architecture.md') {
    validateArchitecture(content, issues);
  } else if (name === 'product-brief.md') {
    validateProductBrief(content, issues);
  } else if (filePath.includes('stories') || name.startsWith('story-')) {
    validateStory(content, issues);
  } else {
    // Generic: check for heading and non-trivial content
    if (!content.includes('# ')) {
      issues.push('Missing heading');
    }
    if (content.trim().length < 50) {
      issues.push('Content appears too short (< 50 chars)');
    }
  }

  return { file: filePath, status: issues.length === 0 ? 'pass' : 'fail', issues };
}

function validatePRD(content, issues) {
  const requiredSections = ['Purpose', 'Functional Requirements', 'Non-Functional Requirements', 'User Journeys', 'Success Criteria'];
  for (const section of requiredSections) {
    if (!content.toLowerCase().includes(section.toLowerCase())) {
      issues.push(`Missing required section: ${section}`);
    }
  }
  // Check FRs are numbered
  if (content.includes('Functional Requirements') && !/FR[-.]?\d+|FR\s+\d+|\d+\.\s/.test(content)) {
    issues.push('Functional requirements should be numbered');
  }
}

function validateArchitecture(content, issues) {
  const requiredSections = ['Overview', 'System Components', 'API Contracts', 'Data Models', 'Decisions'];
  for (const section of requiredSections) {
    if (!content.toLowerCase().includes(section.toLowerCase())) {
      issues.push(`Missing required section: ${section}`);
    }
  }
}

function validateProductBrief(content, issues) {
  const requiredSections = ['Vision', 'Target Users', 'Value Proposition', 'Scope'];
  for (const section of requiredSections) {
    if (!content.toLowerCase().includes(section.toLowerCase())) {
      issues.push(`Missing required section: ${section}`);
    }
  }
}

function validateStory(content, issues) {
  // BDD acceptance criteria
  if (!/given|when|then/i.test(content)) {
    issues.push('Missing BDD acceptance criteria (Given/When/Then)');
  }
  // Task checklist
  if (!/- \[[ x]\]/i.test(content)) {
    issues.push('Missing task checklist (- [ ] items)');
  }
  // Size estimate
  if (!/story points|size|estimate|points:/i.test(content)) {
    issues.push('Missing story points or size estimate');
  }
}
