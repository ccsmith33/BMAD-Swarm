import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Ensure a directory exists, creating it and parents if needed.
 * @param {string} dirPath - Directory path to ensure exists
 */
export function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

/**
 * Write a file, creating parent directories as needed.
 * @param {string} filePath - File path to write
 * @param {string} content - Content to write
 */
export function writeFileSafe(filePath, content) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Read a file as UTF-8 string. Returns null if not found.
 * @param {string} filePath - File path to read
 * @returns {string|null}
 */
export function readFileSafe(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf8');
}

// --- Generated file hash protection ---

const HASH_PATTERN = /^<!-- bmad-generated:([a-f0-9]+) -->\n/;
const JS_HASH_PATTERN = /^\/\/ bmad-generated:([a-f0-9]+)\n/;

/**
 * Compute a short SHA-256 hash of content (8 hex chars).
 * @param {string} content
 * @returns {string}
 */
export function contentHash(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

/**
 * Write a generated file with a content hash header.
 * The hash allows detecting manual modifications on subsequent updates.
 * @param {string} filePath - File path to write
 * @param {string} content - Content to write (hash is prepended automatically)
 */
export function writeGeneratedFile(filePath, content) {
  const hash = contentHash(content);
  const output = `<!-- bmad-generated:${hash} -->\n${content}`;
  ensureDir(dirname(filePath));
  writeFileSync(filePath, output, 'utf8');
}

/**
 * Check if a generated file has been manually modified since it was last written.
 * Returns false if the file doesn't exist or has no hash header (backwards compatible).
 * Supports both HTML-comment headers (markdown/text) and JS-comment headers (.cjs/.js).
 * For JS files with shebangs, the hash may be on line 2.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isFileManuallyModified(filePath) {
  if (!existsSync(filePath)) return false;

  const existing = readFileSync(filePath, 'utf8');

  // Try HTML-comment hash on line 1
  let match = existing.match(HASH_PATTERN);
  if (match) {
    const contentAfterHeader = existing.slice(match[0].length);
    return match[1] !== contentHash(contentAfterHeader);
  }

  // Try JS-comment hash on line 1
  match = existing.match(JS_HASH_PATTERN);
  if (match) {
    const contentAfterHeader = existing.slice(match[0].length);
    return match[1] !== contentHash(contentAfterHeader);
  }

  // Try JS-comment hash on line 2 (after shebang)
  if (existing.startsWith('#!')) {
    const newlineIdx = existing.indexOf('\n');
    if (newlineIdx !== -1) {
      const afterShebang = existing.slice(newlineIdx + 1);
      match = afterShebang.match(JS_HASH_PATTERN);
      if (match) {
        const shebang = existing.slice(0, newlineIdx + 1);
        const contentAfterHeader = afterShebang.slice(match[0].length);
        // The original content was shebang + contentAfterHeader
        const originalContent = shebang + contentAfterHeader;
        return match[1] !== contentHash(originalContent);
      }
    }
  }

  return false; // No hash header = pre-hash file, allow overwrite
}

/**
 * Write a generated JS file with a JS-comment content hash header.
 * Like writeGeneratedFile but uses // comment syntax instead of HTML comments.
 * If the content starts with a shebang, the hash is placed after it.
 * @param {string} filePath - File path to write
 * @param {string} content - Content to write (hash is inserted automatically)
 */
export function writeGeneratedJsFile(filePath, content) {
  const hash = contentHash(content);
  const hashLine = `// bmad-generated:${hash}`;
  let output;
  if (content.startsWith('#!')) {
    const newlineIdx = content.indexOf('\n');
    const shebang = content.slice(0, newlineIdx + 1);
    const rest = content.slice(newlineIdx + 1);
    output = `${shebang}${hashLine}\n${rest}`;
  } else {
    output = `${hashLine}\n${content}`;
  }
  ensureDir(dirname(filePath));
  writeFileSync(filePath, output, 'utf8');
}
