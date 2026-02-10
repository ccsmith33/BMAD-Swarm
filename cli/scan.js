import { resolve, join, basename } from 'node:path';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { getProjectPaths } from '../utils/paths.js';
import { writeFileSafe } from '../utils/fs-helpers.js';

/**
 * Register the scan command with the CLI program.
 * @param {import('commander').Command} program
 */
export function registerScanCommand(program) {
  program
    .command('scan')
    .description('Detect language, framework, test runner, and database from the current codebase')
    .option('--output <path>', 'Custom output path for the generated project-context.md', './artifacts/context/project-context.md')
    .addHelpText('after', `
Examples:
  $ bmad-swarm scan                                    Scan and print results
  $ bmad-swarm scan --output ./docs/project-context.md Write context to custom path

Detects stack from manifest files:
  package.json       Node.js language, framework, test runner, database
  requirements.txt   Python framework detection
  pyproject.toml     Python project detection
  go.mod             Go project detection
  Cargo.toml         Rust project detection

Also maps top-level directory structure and generates a project-context.md
artifact that agents use to understand the existing codebase.
`)
    .action(async (options) => {
      try {
        await runScan(options);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Run the codebase scan.
 * Detects language, framework, test framework, database, and project structure.
 *
 * @param {object} options - Command options
 * @returns {object|void} Scan results (if options.returnResults is true)
 */
export async function runScan(options = {}) {
  const projectRoot = process.cwd();
  const results = {
    language: null,
    framework: null,
    testing: null,
    database: null,
    projectType: null,
    structure: [],
    detectedFiles: {},
  };

  // Detect from package.json (Node.js)
  const packageJsonPath = join(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    results.detectedFiles['package.json'] = true;
    results.language = detectLanguageFromPackageJson(pkg);
    results.framework = detectFrameworkFromPackageJson(pkg);
    results.testing = detectTestingFromPackageJson(pkg);
    results.database = detectDatabaseFromPackageJson(pkg);
    results.projectType = detectProjectTypeFromPackageJson(pkg);
  }

  // Detect from requirements.txt / pyproject.toml (Python)
  if (existsSync(join(projectRoot, 'requirements.txt'))) {
    results.language = results.language || 'Python';
    results.detectedFiles['requirements.txt'] = true;
    const content = readFileSync(join(projectRoot, 'requirements.txt'), 'utf8');
    if (!results.framework) results.framework = detectPythonFramework(content);
  }
  if (existsSync(join(projectRoot, 'pyproject.toml'))) {
    results.language = results.language || 'Python';
    results.detectedFiles['pyproject.toml'] = true;
  }

  // Detect from go.mod (Go)
  if (existsSync(join(projectRoot, 'go.mod'))) {
    results.language = 'Go';
    results.detectedFiles['go.mod'] = true;
  }

  // Detect from Cargo.toml (Rust)
  if (existsSync(join(projectRoot, 'Cargo.toml'))) {
    results.language = 'Rust';
    results.detectedFiles['Cargo.toml'] = true;
  }

  // Map top-level folder structure
  try {
    const entries = readdirSync(projectRoot, { withFileTypes: true });
    results.structure = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => e.name);
  } catch {
    // Ignore permission errors
  }

  if (options.returnResults) {
    return results;
  }

  if (!options.quiet) {
    console.log('\nCodebase Scan Results:');
    console.log(`  Language: ${results.language || 'unknown'}`);
    console.log(`  Framework: ${results.framework || 'none detected'}`);
    console.log(`  Testing: ${results.testing || 'none detected'}`);
    console.log(`  Database: ${results.database || 'none detected'}`);
    console.log(`  Project type: ${results.projectType || 'unknown'}`);
    console.log(`  Structure: ${results.structure.join(', ') || 'empty'}`);

    // Generate project-context.md
    const outputPath = resolve(options.output || './artifacts/context/project-context.md');
    const contextContent = generateProjectContext(results, projectRoot);
    writeFileSafe(outputPath, contextContent);
    console.log(`\n  \u2713 Generated ${outputPath}`);
  }
}

function detectLanguageFromPackageJson(pkg) {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps.typescript || allDeps['ts-node']) return 'TypeScript';
  return 'JavaScript';
}

function detectFrameworkFromPackageJson(pkg) {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps.next) return 'Next.js';
  if (allDeps.react) return 'React';
  if (allDeps.vue) return 'Vue';
  if (allDeps.angular || allDeps['@angular/core']) return 'Angular';
  if (allDeps.express) return 'Express';
  if (allDeps.fastify) return 'Fastify';
  if (allDeps.koa) return 'Koa';
  if (allDeps.hono) return 'Hono';
  if (allDeps.svelte || allDeps['@sveltejs/kit']) return 'SvelteKit';
  return null;
}

function detectTestingFromPackageJson(pkg) {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps.vitest) return 'Vitest';
  if (allDeps.jest) return 'Jest';
  if (allDeps.mocha) return 'Mocha';
  if (allDeps['@playwright/test']) return 'Playwright';
  if (allDeps.cypress) return 'Cypress';
  return null;
}

function detectDatabaseFromPackageJson(pkg) {
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps.prisma || allDeps['@prisma/client']) return 'Prisma';
  if (allDeps.pg) return 'PostgreSQL';
  if (allDeps.mysql2 || allDeps.mysql) return 'MySQL';
  if (allDeps.mongodb || allDeps.mongoose) return 'MongoDB';
  if (allDeps['better-sqlite3'] || allDeps.sqlite3) return 'SQLite';
  if (allDeps.drizzle) return 'Drizzle';
  return null;
}

function detectProjectTypeFromPackageJson(pkg) {
  if (pkg.bin) return 'cli';
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps.next || allDeps.react || allDeps.vue || allDeps.angular || allDeps['@angular/core']) return 'web-app';
  if (allDeps.express || allDeps.fastify || allDeps.koa) return 'api';
  if (pkg.main || pkg.exports) return 'library';
  return 'other';
}

function detectPythonFramework(content) {
  if (content.includes('fastapi') || content.includes('FastAPI')) return 'FastAPI';
  if (content.includes('django') || content.includes('Django')) return 'Django';
  if (content.includes('flask') || content.includes('Flask')) return 'Flask';
  return null;
}

/**
 * Generate a project-context.md document from scan results.
 * @param {object} results - Scan results
 * @param {string} projectRoot - Project root path
 * @returns {string} Markdown content
 */
function generateProjectContext(results, projectRoot) {
  return `# Project Context

## Identity
- **Project**: ${basename(projectRoot)}
- **Type**: ${results.projectType || 'unknown'}
- **Stack**: ${[results.language, results.framework].filter(Boolean).join(' + ') || 'unknown'}

## Architecture
- **Structure**: ${results.structure.join(', ') || 'No directories detected'}
- **Patterns**: To be determined
- **Conventions**: To be determined

## Current State
- **Phase**: Not started
- **Active work**: None
- **Completed**: Initial scan
- **Known issues**: None

## Decision Log
- ${new Date().toISOString().split('T')[0]}: Initial codebase scan completed

## Agent Notes
- scanner: Detected ${Object.keys(results.detectedFiles).join(', ') || 'no config files'}
`;
}

export {
  detectLanguageFromPackageJson,
  detectFrameworkFromPackageJson,
  detectTestingFromPackageJson,
  detectDatabaseFromPackageJson,
  detectProjectTypeFromPackageJson,
  detectPythonFramework,
  generateProjectContext,
};
