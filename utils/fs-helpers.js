import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

const MARKER_LINE_RE = /^<!-- bmad-generated:([a-f0-9]+) -->$/;
const JS_HASH_PATTERN = /^\/\/ bmad-generated:([a-f0-9]+)\n/;
// The HTML marker may sit on line 1 (pre-v3 format) or just below a YAML
// frontmatter block (v3 format, ADR-014 — frontmatter must be the first
// bytes for Claude Code agent/command registration). Search this many
// leading lines for it; anything deeper is body content, not a header.
const MARKER_SEARCH_LINES = 10;

/**
 * Compute a short SHA-256 hash of content (8 hex chars).
 * Normalizes CRLF to LF so Windows (git core.autocrlf=true) and *nix produce
 * identical hashes for the same semantic content. Without normalization a
 * checkout on Windows would flip every hash and defeat modification detection.
 * @param {string} content
 * @returns {string}
 */
export function contentHash(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 8);
}

/**
 * Write a generated file with a content hash marker.
 * The hash allows detecting manual modifications on subsequent updates.
 * When the content starts with a YAML frontmatter block, the marker is
 * inserted immediately AFTER the closing fence so the frontmatter stays the
 * first bytes of the file (required for Claude Code agent/command
 * registration, ADR-014). Otherwise the marker is prepended as before.
 * @param {string} filePath - File path to write
 * @param {string} content - Content to write (hash marker is inserted automatically)
 */
export function writeGeneratedFile(filePath, content) {
  const marker = `<!-- bmad-generated:${contentHash(content)} -->\n`;
  let output;
  if (content.startsWith('---\n')) {
    const endIdx = content.indexOf('\n---\n', 4);
    if (endIdx !== -1) {
      const fmEnd = endIdx + '\n---\n'.length;
      output = content.slice(0, fmEnd) + marker + content.slice(fmEnd);
    }
  }
  if (output === undefined) {
    output = marker + content;
  }
  ensureDir(dirname(filePath));
  writeFileSync(filePath, output, 'utf8');
}

/**
 * Find the bmad-generated HTML marker within the first MARKER_SEARCH_LINES
 * lines of (CRLF-normalized) content. Supports both the pre-v3 line-1
 * placement and the v3 after-frontmatter placement.
 * @param {string} content - LF-normalized file content
 * @returns {{ hash: string, original: string }|null} The marker hash and the
 *   content with the marker line removed (= the content the hash was
 *   computed over), or null when no marker is found.
 */
function findHtmlMarker(content) {
  const lines = content.split('\n');
  const limit = Math.min(lines.length, MARKER_SEARCH_LINES);
  for (let i = 0; i < limit; i++) {
    const match = lines[i].match(MARKER_LINE_RE);
    if (match) {
      const original = lines.slice(0, i).concat(lines.slice(i + 1)).join('\n');
      return { hash: match[1], original };
    }
  }
  return null;
}

/**
 * Remove the bmad-generated HTML marker line from content (old or new
 * placement). Returns the content unchanged when no marker is present.
 * @param {string} content
 * @returns {string}
 */
export function stripGeneratedMarker(content) {
  const found = findHtmlMarker(content.replace(/\r\n/g, '\n'));
  return found ? found.original : content;
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

  // Normalize CRLF -> LF to handle Windows git core.autocrlf=true, which
  // converts checked-in files to CRLF on checkout. The hash was computed
  // over LF content at write time, so the file must be normalized before
  // comparison. Without this, the hash-pattern regexes fail to match (since
  // they expect `\n` after the header) and the function silently returns
  // false for both unmodified AND modified files — a broken detection path.
  const existing = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

  // Try HTML-comment marker within the first few lines (line 1 in the
  // pre-v3 format, after the frontmatter fence in the v3 format).
  const htmlMarker = findHtmlMarker(existing);
  if (htmlMarker) {
    return htmlMarker.hash !== contentHash(htmlMarker.original);
  }

  // Try JS-comment hash on line 1
  let match = existing.match(JS_HASH_PATTERN);
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

  // Try JSON _bmadGenerated key
  if (filePath.endsWith('.json')) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed._bmadGenerated) {
        const { _bmadGenerated, ...rest } = parsed;
        const contentWithoutHash = JSON.stringify(rest, null, 2) + '\n';
        return _bmadGenerated !== contentHash(contentWithoutHash);
      }
    } catch {
      // Not valid JSON, fall through
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

// The D-042 sharing model tracks everything and ignores only these three
// (§3.5). This is the whole managed set: the scaffold (`.claude/`), config
// (`swarm.yaml`, `CLAUDE.md`), and work outputs (`artifacts/`) are deliberately
// git-visible so a team can commit and share them.
const GITIGNORE_MARKER = '# bmad-swarm (generated files)';
const GITIGNORE_ENTRIES = ['.claude/settings.local.json', '.session-active', '*.bak'];
// Entries the tool has ever managed inside the marker block: the current
// minimal set plus the v1 broad set. Anything else found inside the block is a
// user-added custom ignore that the wholesale replace would silently drop —
// callers warn about these so the user can move them above the marker.
const GITIGNORE_KNOWN_MANAGED = new Set([
  ...GITIGNORE_ENTRIES,
  '.claude/', 'artifacts/', 'swarm.yaml', 'project.yaml', 'CLAUDE.md', 'overrides/',
]);

/**
 * Ensure the bmad-swarm managed section of .gitignore holds exactly the minimal
 * ignore set (D-042). Unlike v1, this REPLACES the marker section wholesale:
 * a pre-Phase-1 project whose section still lists the old broad ignores
 * (`.claude/`, `artifacts/`, `swarm.yaml`, `CLAUDE.md`, `overrides/`) is
 * migrated to the sharing model — those entries are removed, not merely
 * supplemented. User lines outside the marker section are preserved. Idempotent.
 * @param {string} projectRoot - Project root directory
 * @returns {{ changed: boolean, droppedCustom: string[] }} whether the file was
 *   rewritten, and any user-added custom ignores that lived inside the managed
 *   block and were removed by the replace (so the caller can warn — L1).
 */
export function updateGitignore(projectRoot) {
  const gitignorePath = join(projectRoot, '.gitignore');
  const section = GITIGNORE_MARKER + '\n' + GITIGNORE_ENTRIES.join('\n');

  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  const lines = existing.split('\n');
  const markerIdx = lines.findIndex((l) => l.replace(/\r$/, '').trim() === GITIGNORE_MARKER);

  if (markerIdx === -1) {
    // No managed section yet: append one, keeping a blank separator after any
    // existing user content.
    const prefix = existing.trim() ? existing.replace(/\s*$/, '') + '\n\n' : '';
    writeFileSync(gitignorePath, prefix + section + '\n', 'utf8');
    return { changed: true, droppedCustom: [] };
  }

  // Managed entries are the consecutive non-blank, non-comment lines directly
  // below the marker. Replace that whole block with the current minimal set.
  let end = markerIdx + 1;
  while (end < lines.length) {
    const l = lines[end].replace(/\r$/, '').trim();
    if (l === '' || l.startsWith('#')) break;
    end++;
  }

  // Any in-block entry that is neither a current nor a historical bmad entry is
  // a user custom ignore the replace would drop.
  const droppedCustom = lines.slice(markerIdx + 1, end)
    .map((l) => l.replace(/\r$/, '').trim())
    .filter((l) => l && !GITIGNORE_KNOWN_MANAGED.has(l));

  const rebuilt = [...lines.slice(0, markerIdx), GITIGNORE_MARKER, ...GITIGNORE_ENTRIES, ...lines.slice(end)].join('\n');
  const changed = rebuilt !== existing;
  if (changed) writeFileSync(gitignorePath, rebuilt, 'utf8');
  return { changed, droppedCustom };
}
