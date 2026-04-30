import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findDomainMap, parseDomainMap } from '../utils/domain-map.js';

// RT-1: Domain Map parser contract per ADR-012.
// Inline markdown fixtures (template literals) — no separate fixture files.

const validMap = [
  '# Architecture',
  '',
  'Some prose here.',
  '',
  '## Domain Map',
  '',
  '| Domain | Description | Components | Anticipated stories |',
  '| --- | --- | --- | --- |',
  '| backend-auth | OAuth2/PKCE, sessions, password flows | `src/auth/*` | ~5 |',
  '| frontend-dashboard | React dashboard pages | `web/src/pages/dashboard/*` | ~4 |',
  '',
  '## Other section',
  '',
  'More prose.',
  '',
].join('\n');

describe('Domain Map parser (utils/domain-map.js)', () => {

  describe('findDomainMap', () => {
    it('AC1: returns { found: false } when no heading exists', () => {
      const md = '# Title\n\nSome prose with no map at all.\n';
      const r = findDomainMap(md);
      assert.deepEqual(r, { found: false });
    });

    it('AC1: does not throw on empty string', () => {
      assert.deepEqual(findDomainMap(''), { found: false });
    });

    it('AC1: does not throw on non-string input', () => {
      assert.deepEqual(findDomainMap(null), { found: false });
      assert.deepEqual(findDomainMap(undefined), { found: false });
      assert.deepEqual(findDomainMap(42), { found: false });
    });

    it('AC2: returns startLine, endLine, and byte-exact raw', () => {
      const r = findDomainMap(validMap);
      assert.equal(r.found, true);
      assert.equal(r.startLine, 5, 'heading is on line 5 (1-indexed)');
      assert.equal(r.endLine, 10, 'last data row is on line 10');
      assert.equal(r.raw, [
        '## Domain Map',
        '',
        '| Domain | Description | Components | Anticipated stories |',
        '| --- | --- | --- | --- |',
        '| backend-auth | OAuth2/PKCE, sessions, password flows | `src/auth/*` | ~5 |',
        '| frontend-dashboard | React dashboard pages | `web/src/pages/dashboard/*` | ~4 |',
      ].join('\n'));
    });

    it('AC9: ### Domain Map (h3) is recognized', () => {
      const md = [
        '## Section',
        '',
        '### Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| backend-auth | auth |',
      ].join('\n');
      assert.equal(findDomainMap(md).found, true);
    });

    it('AC9: # Domain Map (h1) is NOT recognized', () => {
      const md = [
        '# Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| backend-auth | auth |',
      ].join('\n');
      assert.equal(findDomainMap(md).found, false);
    });

    it('AC9: #### Domain Map (h4) is NOT recognized', () => {
      const md = [
        '#### Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| backend-auth | auth |',
      ].join('\n');
      assert.equal(findDomainMap(md).found, false);
    });

    it('AC9: case variants are NOT recognized (## domain map, ## Domain-Map)', () => {
      assert.equal(findDomainMap('## domain map\n\n| Domain | Description |\n| --- | --- |\n| a | b |\n').found, false);
      assert.equal(findDomainMap('## Domain-Map\n\n| Domain | Description |\n| --- | --- |\n| a | b |\n').found, false);
    });

    it('returns found:false when heading has no table at all', () => {
      const md = '## Domain Map\n\nJust prose, no table here.\n';
      assert.equal(findDomainMap(md).found, false);
    });
  });

  describe('parseDomainMap', () => {
    it('AC3: parses a valid Domain Map cleanly', () => {
      const r = parseDomainMap(validMap);
      assert.deepEqual(r.errors, []);
      assert.equal(r.domains.length, 2);
      assert.deepEqual(r.domains[0], {
        domain: 'backend-auth',
        description: 'OAuth2/PKCE, sessions, password flows',
        extras: { Components: '`src/auth/*`', 'Anticipated stories': '~5' },
        line: 9,
      });
      assert.equal(r.domains[1].domain, 'frontend-dashboard');
      assert.equal(r.domains[1].description, 'React dashboard pages');
      assert.equal(r.domains[1].line, 10);
    });

    it('AC4: invalid slug (whitespace + mixed case) is rejected with line-numbered error', () => {
      const md = [
        '## Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| Backend Auth | bad slug |',
      ].join('\n');
      const r = parseDomainMap(md);
      assert.equal(r.domains.length, 0, 'invalid row excluded from domains');
      assert.equal(r.errors.length, 1);
      assert.match(r.errors[0], /row at line 5 has invalid domain slug 'Backend Auth'/);
    });

    it('AC4: invalid slug (underscore) is rejected', () => {
      const md = [
        '## Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| domain_with_underscore | bad |',
      ].join('\n');
      const r = parseDomainMap(md);
      assert.match(r.errors[0], /invalid domain slug 'domain_with_underscore'/);
    });

    it('AC4: invalid slug (uppercase) is rejected', () => {
      const md = [
        '## Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| UPPERCASE | bad |',
      ].join('\n');
      const r = parseDomainMap(md);
      assert.match(r.errors[0], /invalid domain slug 'UPPERCASE'/);
    });

    it('AC4: invalid slug (leading hyphen) is rejected', () => {
      const md = [
        '## Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| -bad | nope |',
      ].join('\n');
      const r = parseDomainMap(md);
      assert.match(r.errors[0], /invalid domain slug '-bad'/);
    });

    it('AC5: heading followed by prose (no table) produces missing-header error', () => {
      const md = [
        '# Title',
        '',
        '## Domain Map',
        '',
        'This section will describe domains, but no table yet.',
        '',
        'More prose.',
      ].join('\n');
      const r = parseDomainMap(md);
      assert.equal(r.domains.length, 0);
      assert.equal(r.errors.length, 1);
      assert.match(r.errors[0], /Domain Map at line 3 is missing the table header/);
    });

    it('AC6: duplicate slugs produce error naming both lines', () => {
      const md = [
        '## Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| backend-auth | first |',
        '| backend-auth | dup |',
      ].join('\n');
      const r = parseDomainMap(md);
      assert.equal(r.domains.length, 1, 'first row kept; duplicate dropped');
      assert.equal(r.domains[0].description, 'first');
      assert.equal(r.errors.length, 1);
      assert.match(r.errors[0], /row at line 6 duplicates domain 'backend-auth' first declared at line 5/);
    });

    it('AC7: required columns matched case-insensitively; extras preserve original casing', () => {
      const md = [
        '## Domain Map',
        '',
        '| domain | DESCRIPTION | Components | OwnerHandle |',
        '| --- | --- | --- | --- |',
        '| backend-auth | auth | `src/auth/*` | @alice |',
      ].join('\n');
      const r = parseDomainMap(md);
      assert.deepEqual(r.errors, []);
      assert.equal(r.domains.length, 1);
      assert.deepEqual(r.domains[0].extras, {
        Components: '`src/auth/*`',
        OwnerHandle: '@alice',
      });
      assert.equal(r.domains[0].description, 'auth');
    });

    it('AC8: multiple ## Domain Map headings produce multi-section error', () => {
      const md = [
        '## Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| backend-auth | first |',
        '',
        '## Other',
        '',
        '## Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| frontend | second |',
      ].join('\n');
      const r = parseDomainMap(md);
      assert.equal(r.domains.length, 0, 'no domains parsed when ambiguous');
      assert.equal(r.errors.length, 1);
      assert.match(r.errors[0], /multiple Domain Map sections at lines 1, 9; resolve manually/);
    });

    it('AC10: empty Description cell yields empty-string description, no error', () => {
      const md = [
        '## Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| backend-auth |  |',
      ].join('\n');
      const r = parseDomainMap(md);
      assert.deepEqual(r.errors, []);
      assert.equal(r.domains[0].description, '');
    });

    it('AC10: whitespace-only Description cell trims to empty string, no error', () => {
      const md = [
        '## Domain Map',
        '',
        '| Domain | Description |',
        '| --- | --- |',
        '| backend-auth |    |',
      ].join('\n');
      const r = parseDomainMap(md);
      assert.deepEqual(r.errors, []);
      assert.equal(r.domains[0].description, '');
    });

    it('AC11: parser is read-only — repeated calls produce structurally equal results', () => {
      const r1 = parseDomainMap(validMap);
      const r2 = parseDomainMap(validMap);
      assert.deepEqual(r1, r2);
    });

    it('AC11: parser does not mutate input string semantics (substring equality)', () => {
      // Strings are immutable in JS; this guards against any cleverness like
      // attaching properties to the input, which would still compare equal.
      const before = validMap;
      parseDomainMap(validMap);
      const after = validMap;
      assert.equal(before, after);
    });

    it('returns empty result when no Domain Map heading exists', () => {
      const r = parseDomainMap('# Title\n\nNo map.\n');
      assert.deepEqual(r, { domains: [], errors: [] });
    });

    it('AC12: round-trip — parse then format-back-to-table preserves every domain slug and description', () => {
      const r = parseDomainMap(validMap);
      assert.deepEqual(r.errors, []);
      // Inline format-back helper: emit the YAML-like flat form expected by
      // RT-2's scaffold-team CLI (role/domain/description per row).
      const yaml = r.domains.map(d => [
        '- role: developer',
        `  domain: ${d.domain}`,
        `  description: ${JSON.stringify(d.description)}`,
      ].join('\n')).join('\n');

      const expected = [
        '- role: developer',
        '  domain: backend-auth',
        '  description: "OAuth2/PKCE, sessions, password flows"',
        '- role: developer',
        '  domain: frontend-dashboard',
        '  description: "React dashboard pages"',
      ].join('\n');
      assert.equal(yaml, expected);
    });
  });

  describe('AC12: module surface', () => {
    it('exports findDomainMap and parseDomainMap as named exports', () => {
      assert.equal(typeof findDomainMap, 'function');
      assert.equal(typeof parseDomainMap, 'function');
    });
  });
});
