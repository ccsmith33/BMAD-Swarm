import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

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

