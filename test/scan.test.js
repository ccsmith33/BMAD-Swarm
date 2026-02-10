import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLanguageFromPackageJson,
  detectFrameworkFromPackageJson,
  detectTestingFromPackageJson,
  detectDatabaseFromPackageJson,
  detectProjectTypeFromPackageJson,
  detectPythonFramework,
  generateProjectContext,
} from '../cli/scan.js';

describe('Scan Detection Functions', () => {
  describe('detectLanguageFromPackageJson', () => {
    it('detects TypeScript via typescript dep', () => {
      assert.equal(detectLanguageFromPackageJson({ devDependencies: { typescript: '^5.0' } }), 'TypeScript');
    });

    it('detects TypeScript via ts-node dep', () => {
      assert.equal(detectLanguageFromPackageJson({ dependencies: { 'ts-node': '^10' } }), 'TypeScript');
    });

    it('defaults to JavaScript', () => {
      assert.equal(detectLanguageFromPackageJson({ dependencies: { express: '^4' } }), 'JavaScript');
    });

    it('handles empty package.json', () => {
      assert.equal(detectLanguageFromPackageJson({}), 'JavaScript');
    });
  });

  describe('detectFrameworkFromPackageJson', () => {
    const frameworks = [
      ['next', 'Next.js'],
      ['react', 'React'],
      ['vue', 'Vue'],
      ['@angular/core', 'Angular'],
      ['express', 'Express'],
      ['fastify', 'Fastify'],
      ['koa', 'Koa'],
      ['hono', 'Hono'],
      ['@sveltejs/kit', 'SvelteKit'],
    ];

    for (const [dep, name] of frameworks) {
      it(`detects ${name}`, () => {
        assert.equal(detectFrameworkFromPackageJson({ dependencies: { [dep]: '*' } }), name);
      });
    }

    it('detects Angular via angular dep', () => {
      assert.equal(detectFrameworkFromPackageJson({ dependencies: { angular: '*' } }), 'Angular');
    });

    it('detects SvelteKit via svelte dep', () => {
      assert.equal(detectFrameworkFromPackageJson({ dependencies: { svelte: '*' } }), 'SvelteKit');
    });

    it('returns null when no framework found', () => {
      assert.equal(detectFrameworkFromPackageJson({ dependencies: { lodash: '*' } }), null);
    });

    it('handles empty deps', () => {
      assert.equal(detectFrameworkFromPackageJson({}), null);
    });
  });

  describe('detectTestingFromPackageJson', () => {
    const runners = [
      ['vitest', 'Vitest'],
      ['jest', 'Jest'],
      ['mocha', 'Mocha'],
      ['@playwright/test', 'Playwright'],
      ['cypress', 'Cypress'],
    ];

    for (const [dep, name] of runners) {
      it(`detects ${name}`, () => {
        assert.equal(detectTestingFromPackageJson({ devDependencies: { [dep]: '*' } }), name);
      });
    }

    it('returns null when no test runner found', () => {
      assert.equal(detectTestingFromPackageJson({ dependencies: {} }), null);
    });
  });

  describe('detectDatabaseFromPackageJson', () => {
    const databases = [
      ['prisma', 'Prisma'],
      ['@prisma/client', 'Prisma'],
      ['pg', 'PostgreSQL'],
      ['mysql2', 'MySQL'],
      ['mysql', 'MySQL'],
      ['mongodb', 'MongoDB'],
      ['mongoose', 'MongoDB'],
      ['better-sqlite3', 'SQLite'],
      ['sqlite3', 'SQLite'],
      ['drizzle', 'Drizzle'],
    ];

    for (const [dep, name] of databases) {
      it(`detects ${name} via ${dep}`, () => {
        assert.equal(detectDatabaseFromPackageJson({ dependencies: { [dep]: '*' } }), name);
      });
    }

    it('returns null when no database found', () => {
      assert.equal(detectDatabaseFromPackageJson({}), null);
    });
  });

  describe('detectProjectTypeFromPackageJson', () => {
    it('detects cli from bin field', () => {
      assert.equal(detectProjectTypeFromPackageJson({ bin: './index.js' }), 'cli');
    });

    it('detects web-app from React', () => {
      assert.equal(detectProjectTypeFromPackageJson({ dependencies: { react: '*' } }), 'web-app');
    });

    it('detects web-app from Angular core', () => {
      assert.equal(detectProjectTypeFromPackageJson({ dependencies: { '@angular/core': '*' } }), 'web-app');
    });

    it('detects api from Express', () => {
      assert.equal(detectProjectTypeFromPackageJson({ dependencies: { express: '*' } }), 'api');
    });

    it('detects library from main field', () => {
      assert.equal(detectProjectTypeFromPackageJson({ main: './index.js' }), 'library');
    });

    it('detects library from exports field', () => {
      assert.equal(detectProjectTypeFromPackageJson({ exports: { '.': './index.js' } }), 'library');
    });

    it('returns other as fallback', () => {
      assert.equal(detectProjectTypeFromPackageJson({}), 'other');
    });
  });

  describe('detectPythonFramework', () => {
    it('detects FastAPI', () => {
      assert.equal(detectPythonFramework('fastapi==0.100.0\nuvicorn'), 'FastAPI');
    });

    it('detects Django', () => {
      assert.equal(detectPythonFramework('Django>=4.0'), 'Django');
    });

    it('detects Flask', () => {
      assert.equal(detectPythonFramework('flask==2.0\ngunicorn'), 'Flask');
    });

    it('returns null for no framework', () => {
      assert.equal(detectPythonFramework('requests\nnumpy'), null);
    });
  });

  describe('generateProjectContext', () => {
    it('produces valid markdown', () => {
      const results = {
        language: 'TypeScript',
        framework: 'Next.js',
        testing: 'Jest',
        database: 'PostgreSQL',
        projectType: 'web-app',
        structure: ['src', 'test', 'docs'],
        detectedFiles: { 'package.json': true },
      };
      const md = generateProjectContext(results, '/tmp/test-project');
      assert.ok(md.includes('# Project Context'));
      assert.ok(md.includes('TypeScript'));
      assert.ok(md.includes('Next.js'));
      assert.ok(md.includes('web-app'));
      assert.ok(md.includes('src, test, docs'));
    });
  });
});
