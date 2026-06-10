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
  stripGeneratedMarker,
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

    // ADR-014: frontmatter must be the first bytes of the file so Claude Code
    // can register the agent definition. The marker moves below the closing
    // frontmatter fence.
    it('places the marker AFTER the closing frontmatter fence when content has frontmatter', () => {
      const filePath = join(tmpDir, 'gen-fm-1.md');
      const body = '---\nname: developer\nmodel: opus\n---\n# Developer\nBody\n';
      writeGeneratedFile(filePath, body);

      const content = readFileSync(filePath, 'utf8');
      assert.ok(content.startsWith('---\nname: developer\n'),
        'Frontmatter must be the first bytes of the file');
      const lines = content.split('\n');
      assert.match(lines[4], /^<!-- bmad-generated:[a-f0-9]{8} -->$/,
        'Marker must sit immediately after the closing frontmatter fence');
      assert.equal(lines[5], '# Developer', 'Body follows the marker');
    });

    it('frontmatter-format hash matches the content with the marker line removed', () => {
      const filePath = join(tmpDir, 'gen-fm-2.md');
      const body = '---\nname: reviewer\n---\n# Reviewer\n';
      writeGeneratedFile(filePath, body);

      const content = readFileSync(filePath, 'utf8');
      const m = content.match(/<!-- bmad-generated:([a-f0-9]+) -->\n/);
      assert.ok(m, 'Should contain the marker');
      const original = content.replace(m[0], '');
      assert.equal(m[1], contentHash(original), 'Hash covers the marker-stripped content');
      assert.equal(original, body, 'Marker-stripped content round-trips to the input');
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

    // ADR-014 round-trip: new-format files (frontmatter first, marker after
    // the fence) must be recognized as generated in both directions.
    it('returns false for unmodified frontmatter-format file (new format round-trip)', () => {
      const filePath = join(tmpDir, 'fm-unmod.md');
      writeGeneratedFile(filePath, '---\nname: developer\nmodel: opus\n---\n# Developer\n');
      assert.equal(isFileManuallyModified(filePath), false);
    });

    it('returns true for modified frontmatter-format file', () => {
      const filePath = join(tmpDir, 'fm-mod.md');
      writeGeneratedFile(filePath, '---\nname: developer\n---\n# Developer\n');
      const content = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, content + '\n# user addition\n');
      assert.equal(isFileManuallyModified(filePath), true);
    });

    // Backward compatibility with the pre-v3 format (marker on line 1, above
    // any frontmatter) so `bmad-swarm update` on existing projects detects
    // old generated files as generated, not user-modified.
    it('returns false for unmodified OLD-format file (marker line 1 above frontmatter)', () => {
      const filePath = join(tmpDir, 'old-fmt-unmod.md');
      const original = '---\nisolation: worktree\nmodel: opus\n---\n# Developer\nOld format\n';
      writeFileSync(filePath, `<!-- bmad-generated:${contentHash(original)} -->\n${original}`);
      assert.equal(isFileManuallyModified(filePath), false,
        'Old-format generated file must be recognized as unmodified');
    });

    it('returns true for modified OLD-format file', () => {
      const filePath = join(tmpDir, 'old-fmt-mod.md');
      const original = '---\nmodel: opus\n---\n# Developer\n';
      writeFileSync(filePath, `<!-- bmad-generated:${contentHash(original)} -->\n${original}# tampered\n`);
      assert.equal(isFileManuallyModified(filePath), true,
        'Old-format file with edits must be detected as modified');
    });

    it('ignores a marker that only appears beyond the first 10 lines', () => {
      const filePath = join(tmpDir, 'deep-marker.md');
      const filler = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
      writeFileSync(filePath, `${filler}\n<!-- bmad-generated:deadbeef -->\nbody\n`);
      assert.equal(isFileManuallyModified(filePath), false,
        'Marker outside the first 10 lines = not a generated-file header');
    });

    it('returns false for file without hash header (backward compat)', () => {
      const filePath = join(tmpDir, 'no-header.md');
      writeFileSync(filePath, '# No hash header\nJust plain content\n');
      assert.equal(isFileManuallyModified(filePath), false);
    });

    it('returns false for unmodified JSON file with _bmadGenerated hash', () => {
      const filePath = join(tmpDir, 'unmodified.json');
      const data = { key: 'value' };
      const contentWithoutHash = JSON.stringify(data, null, 2) + '\n';
      const hash = contentHash(contentWithoutHash);
      const output = { _bmadGenerated: hash, ...data };
      writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n');
      assert.equal(isFileManuallyModified(filePath), false);
    });

    it('returns true for modified JSON file with _bmadGenerated hash', () => {
      const filePath = join(tmpDir, 'modified.json');
      const data = { key: 'value' };
      const contentWithoutHash = JSON.stringify(data, null, 2) + '\n';
      const hash = contentHash(contentWithoutHash);
      const output = { _bmadGenerated: hash, ...data };
      writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n');

      // Manually modify
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      parsed.extra = 'user-added';
      writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n');

      assert.equal(isFileManuallyModified(filePath), true);
    });

    // V-3 regression: on Windows with core.autocrlf=true, generated files
    // are read back with CRLF line endings even though the hash was computed
    // over LF content. Without CRLF normalization, every generated file
    // would appear "manually modified" after a git checkout on Windows.
    it('returns false for CRLF-converted markdown file (Windows autocrlf)', () => {
      const filePath = join(tmpDir, 'crlf-md.md');
      writeGeneratedFile(filePath, '# Generated\nWith multiple lines\n');

      // Simulate git core.autocrlf=true converting LF to CRLF on checkout
      const lfContent = readFileSync(filePath, 'utf8');
      const crlfContent = lfContent.replace(/\n/g, '\r\n');
      writeFileSync(filePath, crlfContent);

      assert.equal(isFileManuallyModified(filePath), false,
        'CRLF-converted file must not appear manually modified');
    });

    it('returns false for CRLF-converted JS file (Windows autocrlf)', () => {
      const filePath = join(tmpDir, 'crlf-js.cjs');
      writeGeneratedJsFile(filePath, 'console.log("hello");\nconsole.log("world");\n');

      const lfContent = readFileSync(filePath, 'utf8');
      const crlfContent = lfContent.replace(/\n/g, '\r\n');
      writeFileSync(filePath, crlfContent);

      assert.equal(isFileManuallyModified(filePath), false,
        'CRLF-converted JS file must not appear manually modified');
    });

    it('returns false for CRLF-converted JS file with shebang', () => {
      const filePath = join(tmpDir, 'crlf-shebang.cjs');
      writeGeneratedJsFile(filePath, '#!/usr/bin/env node\nconst x = 1;\nconsole.log(x);\n');

      const lfContent = readFileSync(filePath, 'utf8');
      const crlfContent = lfContent.replace(/\n/g, '\r\n');
      writeFileSync(filePath, crlfContent);

      assert.equal(isFileManuallyModified(filePath), false,
        'CRLF-converted shebang file must not appear manually modified');
    });

    it('returns false for CRLF-converted frontmatter-format file (Windows autocrlf)', () => {
      const filePath = join(tmpDir, 'crlf-fm.md');
      writeGeneratedFile(filePath, '---\nname: developer\n---\n# Developer\n');

      const lfContent = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, lfContent.replace(/\n/g, '\r\n'));

      assert.equal(isFileManuallyModified(filePath), false,
        'CRLF-converted frontmatter-format file must not appear manually modified');
    });

    it('returns true for genuinely modified CRLF file', () => {
      // After CRLF conversion, real modifications are still caught
      const filePath = join(tmpDir, 'crlf-tampered.md');
      writeGeneratedFile(filePath, '# Original\n');

      const lfContent = readFileSync(filePath, 'utf8');
      const crlfContent = lfContent.replace(/\n/g, '\r\n') + '\r\n# User-added line\r\n';
      writeFileSync(filePath, crlfContent);

      assert.equal(isFileManuallyModified(filePath), true,
        'Genuine modifications are still detected after CRLF conversion');
    });
  });

  describe('stripGeneratedMarker', () => {
    it('strips an old-format line-1 marker', () => {
      const content = '<!-- bmad-generated:abcd1234 -->\n# Title\nBody\n';
      assert.equal(stripGeneratedMarker(content), '# Title\nBody\n');
    });

    it('strips a new-format marker after frontmatter', () => {
      const content = '---\nname: developer\n---\n<!-- bmad-generated:abcd1234 -->\n# Title\n';
      assert.equal(stripGeneratedMarker(content), '---\nname: developer\n---\n# Title\n');
    });

    it('returns content unchanged when no marker is present', () => {
      const content = '# Plain\nNo marker here\n';
      assert.equal(stripGeneratedMarker(content), content);
    });

    it('does not strip markers beyond the first 10 lines', () => {
      const filler = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
      const content = `${filler}\n<!-- bmad-generated:abcd1234 -->\nbody\n`;
      assert.equal(stripGeneratedMarker(content), content);
    });
  });
});
