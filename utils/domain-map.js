import { DOMAIN_SLUG_RE } from './validator.js';

// Domain Map parser per ADR-012 (D-017). Strict, heading-anchored, table-immediate.
// Two functions: findDomainMap (cheap detector) and parseDomainMap (full parse + validate).
// Read-only — does not mutate input.

const HEADING_RE = /^(##|###)\s+Domain Map\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

function isSeparatorRow(cells) {
  if (cells.length === 0) return false;
  return cells.every(c => /^:?-{3,}:?$/.test(c.trim()));
}

function findHeadings(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) out.push(i);
  }
  return out;
}

function locateTable(lines, headingIdx) {
  let i = headingIdx + 1;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length) return { ok: false };
  if (!TABLE_ROW_RE.test(lines[i])) return { ok: false };
  const headerIdx = i;
  const headerCells = splitRow(lines[i]);
  i++;
  if (i >= lines.length || !TABLE_ROW_RE.test(lines[i])) return { ok: false };
  const sepCells = splitRow(lines[i]);
  if (!isSeparatorRow(sepCells)) return { ok: false };
  i++;
  const dataRowIdxs = [];
  while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
    dataRowIdxs.push(i);
    i++;
  }
  return { ok: true, headerIdx, headerCells, dataRowIdxs };
}

/**
 * Find a Domain Map section in markdown. Cheap detector — does not validate rows.
 *
 * @param {string} markdown
 * @returns {{found: boolean, startLine?: number, endLine?: number, raw?: string}}
 *   - found: true iff a `## Domain Map` or `### Domain Map` heading is followed
 *     by a valid table header + separator + at least one data row.
 *   - startLine: 1-indexed line of the heading (when found).
 *   - endLine: 1-indexed line of the last data row (when found).
 *   - raw: substring from heading line through last data row, byte-exact (when found).
 */
export function findDomainMap(markdown) {
  if (typeof markdown !== 'string') return { found: false };
  const lines = markdown.split(/\r?\n/);
  const headings = findHeadings(lines);
  for (const h of headings) {
    const t = locateTable(lines, h);
    if (!t.ok || t.dataRowIdxs.length === 0) continue;
    const lastRow = t.dataRowIdxs[t.dataRowIdxs.length - 1];
    const raw = lines.slice(h, lastRow + 1).join('\n');
    return { found: true, startLine: h + 1, endLine: lastRow + 1, raw };
  }
  return { found: false };
}

/**
 * Parse a Domain Map per ADR-012. Returns rows + accumulated errors.
 *
 * @param {string} markdown
 * @returns {{
 *   domains: Array<{
 *     domain: string,
 *     description: string,
 *     extras: Record<string, string>,
 *     line: number,
 *   }>,
 *   errors: string[],
 * }}
 */
export function parseDomainMap(markdown) {
  const result = { domains: [], errors: [] };
  if (typeof markdown !== 'string') return result;
  const lines = markdown.split(/\r?\n/);
  const headings = findHeadings(lines);

  if (headings.length === 0) return result;

  if (headings.length > 1) {
    const lineNums = headings.map(h => h + 1).join(', ');
    result.errors.push(`multiple Domain Map sections at lines ${lineNums}; resolve manually`);
    return result;
  }

  const headingIdx = headings[0];
  const t = locateTable(lines, headingIdx);
  if (!t.ok) {
    result.errors.push(`Domain Map at line ${headingIdx + 1} is missing the table header`);
    return result;
  }

  // Resolve required columns case-insensitively. Preserve original casing for extras.
  let domainCol = -1;
  let descCol = -1;
  const extraCols = [];
  for (let i = 0; i < t.headerCells.length; i++) {
    const cell = t.headerCells[i];
    const norm = cell.trim().toLowerCase();
    if (norm === 'domain' && domainCol === -1) {
      domainCol = i;
    } else if (norm === 'description' && descCol === -1) {
      descCol = i;
    } else if (cell.trim() !== '') {
      extraCols.push({ index: i, name: cell.trim() });
    }
  }

  if (domainCol === -1) {
    result.errors.push(`Domain Map at line ${headingIdx + 1} is missing required column 'Domain'`);
    return result;
  }
  if (descCol === -1) {
    result.errors.push(`Domain Map at line ${headingIdx + 1} is missing required column 'Description'`);
    return result;
  }

  const seen = new Map();
  for (const rowIdx of t.dataRowIdxs) {
    const cells = splitRow(lines[rowIdx]);
    const lineNum = rowIdx + 1;
    const slug = (cells[domainCol] ?? '').trim();
    const description = (cells[descCol] ?? '').trim();

    if (!DOMAIN_SLUG_RE.test(slug)) {
      result.errors.push(`row at line ${lineNum} has invalid domain slug '${slug}'`);
      continue;
    }
    if (seen.has(slug)) {
      result.errors.push(`row at line ${lineNum} duplicates domain '${slug}' first declared at line ${seen.get(slug)}`);
      continue;
    }
    seen.set(slug, lineNum);

    const extras = {};
    for (const ec of extraCols) {
      extras[ec.name] = (cells[ec.index] ?? '').trim();
    }
    result.domains.push({ domain: slug, description, extras, line: lineNum });
  }

  return result;
}
