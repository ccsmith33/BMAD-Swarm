import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import yaml from 'js-yaml';
import { PACKAGE_METHODOLOGY_DIR } from './paths.js';

/**
 * The machine projection of the artifact schemas. This is the ONE structural
 * source the validator consults — nothing about artifact structure is hardcoded
 * here. See methodology/artifact-schemas/spec.yaml (lockstep-tested against the
 * prose schemas by test/artifact-spec.test.js).
 */
const SPEC_PATH = join(PACKAGE_METHODOLOGY_DIR, 'artifact-schemas', 'spec.yaml');

/** Phases the validator understands, in report order. Also drives `validate --phase`. */
export const VALID_PHASES = ['exploration', 'planning', 'design', 'implementation', 'reviews'];

let cachedSpec = null;
function loadSpec() {
  if (!cachedSpec) {
    cachedSpec = yaml.load(readFileSync(SPEC_PATH, 'utf8'));
  }
  return cachedSpec;
}

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

  if (options.phase && !VALID_PHASES.includes(options.phase)) {
    throw new Error(
      `Unknown phase: ${options.phase}. Valid phases: ${VALID_PHASES.join(', ')}`,
    );
  }

  const phases = options.phase ? [options.phase] : VALID_PHASES;

  for (const phase of phases) {
    const phaseDir = join(artifactsDir, phase);
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
  const issues = [];

  if (!existsSync(filePath)) {
    return { file: filePath, status: 'fail', issues: ['File does not exist'] };
  }

  const content = readFileSync(filePath, 'utf8');
  const spec = loadSpec();
  const def = classifyArtifact(filePath, spec);
  const effective = def.variants ? selectVariant(content, def.variants) : def;

  checkSections(content, effective.required_sections, issues);
  checkPatterns(content, effective.required_patterns, issues);

  return { file: filePath, status: issues.length === 0 ? 'pass' : 'fail', issues };
}

/**
 * Select the artifact class from the spec by matching file name / path.
 * Falls back to the `generic` class.
 */
function classifyArtifact(filePath, spec) {
  const name = basename(filePath);
  for (const [key, def] of Object.entries(spec.artifacts)) {
    if (key === 'generic') continue;
    const m = def.match || {};
    if (m.basename && name === m.basename) return def;
    if (m.basenamePrefix && name.startsWith(m.basenamePrefix)) return def;
    if (m.pathIncludes && filePath.includes(m.pathIncludes)) return def;
  }
  return spec.artifacts.generic;
}

/**
 * Pick the variant whose discriminator matches the content; the discriminator-less
 * variant is the default when none match.
 */
function selectVariant(content, variants) {
  let fallback = null;
  for (const vdef of Object.values(variants)) {
    if (vdef.discriminator) {
      if (new RegExp(vdef.discriminator, 'im').test(content)) return vdef;
    } else {
      fallback = vdef;
    }
  }
  return fallback || Object.values(variants)[0];
}

/** Normalize a heading's text for tolerant matching (numbering, bold, trailing colon). */
function normalizeHeading(text) {
  return text
    .replace(/\*\*/g, '')
    .replace(/^[\d.]+\s*/, '')
    .replace(/:\s*$/, '')
    .trim()
    .toLowerCase();
}

/** Extract all Markdown heading texts from the content, normalized. */
function contentHeadings(content) {
  const headings = [];
  for (const line of content.split('\n')) {
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (m) headings.push(normalizeHeading(m[1]));
  }
  return headings;
}

function checkSections(content, sections, issues) {
  if (!sections) return;
  const headings = contentHeadings(content);
  for (const section of sections) {
    const needle = section.trim().toLowerCase();
    const found = headings.some(h => h === needle || h.startsWith(needle));
    if (!found) issues.push(`Missing required section: ${section}`);
  }
}

function checkPatterns(content, patterns, issues) {
  if (!patterns) return;
  for (const p of patterns) {
    if (p.regex) {
      if (!new RegExp(p.regex, 'm').test(content)) {
        issues.push(p.message || `Missing required pattern: ${p.name}`);
      }
    } else if (typeof p.min_length === 'number') {
      if (content.trim().length < p.min_length) {
        issues.push(p.message || `Content appears too short (< ${p.min_length} chars)`);
      }
    }
  }
}
