import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  contentHash,
  writeGeneratedFile,
  writeGeneratedJsFile,
  isFileManuallyModified,
} from '../utils/fs-helpers.js';

describe('FS Helpers', () => {
  const tmpDir = join(tmpdir(), 'bmad-test-fs-' + Date.now());

  before(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('contentHash', () => {
    it('produces consistent hashes for same content', () => {
      const hash1 = contentHash('hello world');
      const hash2 = contentHash('hello world');
      assert.equal(hash1, hash2);
    });

    it('produces different hashes for different content', () => {
      const hash1 = contentHash('hello');
      const hash2 = contentHash('world');
      assert.notEqual(hash1, hash2);
    });

    it('returns 8-character hex string', () => {
      const hash = contentHash('test content');
      assert.equal(hash.length, 8);
      assert.match(hash, /^[a-f0-9]{8}$/);
    });
  });

  describe('writeGeneratedFile', () => {
    it('adds bmad-generated HTML comment header', () => {
      const filePath = join(tmpDir, 'gen-test-1.md');
      writeGeneratedFile(filePath, '# Test Content\n');

      const content = readFileSync(filePath, 'utf8');
      assert.ok(content.startsWith('<!-- bmad-generated:'), 'Should start with bmad-generated header');
      assert.ok(content.includes('# Test Content'), 'Should contain original content');
    });

    it('hash matches content after header', () => {
      const filePath = join(tmpDir, 'gen-test-2.md');
      const body = '# Some content\nWith multiple lines\n';
      writeGeneratedFile(filePath, body);

      const content = readFileSync(filePath, 'utf8');
      const match = content.match(/^<!-- bmad-generated:([a-f0-9]+) -->\n/);
      assert.ok(match, 'Should have hash header');

      const afterHeader = content.slice(match[0].length);
      assert.equal(match[1], contentHash(afterHeader), 'Hash should match content after header');
    });

    it('creates parent directories', () => {
      const filePath = join(tmpDir, 'nested', 'deep', 'gen-test-3.md');
      writeGeneratedFile(filePath, 'content');

      const content = readFileSync(filePath, 'utf8');
      assert.ok(content.includes('content'));
    });
  });

  describe('writeGeneratedJsFile', () => {
    it('adds JS comment hash header for non-shebang files', () => {
      const filePath = join(tmpDir, 'gen-test-js-1.cjs');
      writeGeneratedJsFile(filePath, 'console.log("hello");\n');

      const content = readFileSync(filePath, 'utf8');
      assert.ok(content.startsWith('// bmad-generated:'), 'Should start with JS hash header');
    });

    it('places hash after shebang for shebang files', () => {
      const filePath = join(tmpDir, 'gen-test-js-2.cjs');
      writeGeneratedJsFile(filePath, '#!/usr/bin/env node\nconsole.log("hello");\n');

      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      assert.ok(lines[0].startsWith('#!/usr/bin/env node'), 'Line 1 should be shebang');
      assert.ok(lines[1].startsWith('// bmad-generated:'), 'Line 2 should be hash header');
    });
  });

  describe('isFileManuallyModified', () => {
    it('returns false for nonexistent file', () => {
      assert.equal(isFileManuallyModified(join(tmpDir, 'nonexistent.md')), false);
    });

    it('returns false for unmodified generated markdown file', () => {
      const filePath = join(tmpDir, 'unmodified.md');
      writeGeneratedFile(filePath, '# Unmodified\n');
      assert.equal(isFileManuallyModified(filePath), false);
    });

    it('returns true for modified generated markdown file', () => {
      const filePath = join(tmpDir, 'modified.md');
      writeGeneratedFile(filePath, '# Original\n');

      // Manually append content
      const content = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, content + '\n# Added\n');

      assert.equal(isFileManuallyModified(filePath), true);
    });

    it('returns false for unmodified generated JS file', () => {
      const filePath = join(tmpDir, 'unmodified.cjs');
      writeGeneratedJsFile(filePath, 'console.log("ok");\n');
      assert.equal(isFileManuallyModified(filePath), false);
    });

    it('returns true for modified generated JS file', () => {
      const filePath = join(tmpDir, 'modified.cjs');
      writeGeneratedJsFile(filePath, 'console.log("ok");\n');

      const content = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, content + '\n// extra\n');

      assert.equal(isFileManuallyModified(filePath), true);
    });

    it('returns false for unmodified JS file with shebang', () => {
      const filePath = join(tmpDir, 'shebang-unmod.cjs');
      writeGeneratedJsFile(filePath, '#!/usr/bin/env node\nconsole.log("ok");\n');
      assert.equal(isFileManuallyModified(filePath), false);
    });

    it('returns true for modified JS file with shebang', () => {
      const filePath = join(tmpDir, 'shebang-mod.cjs');
      writeGeneratedJsFile(filePath, '#!/usr/bin/env node\nconsole.log("ok");\n');

      const content = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, content + '\n// tampered\n');

      assert.equal(isFileManuallyModified(filePath), true);
    });

    it('returns false for file without hash header (backward compat)', () => {
      const filePath = join(tmpDir, 'no-header.md');
      writeFileSync(filePath, '# No hash header\nJust plain content\n');
      assert.equal(isFileManuallyModified(filePath), false);
    });
  });
});
