import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const {
  parseClaimsTable,
  extractCommit,
  extractPaths,
  checkClaimDecay,
  CLAIM_STATUSES,
} = require('../bin/replay-check.cjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

describe('claims-table parsing', () => {
  const md = `# Doc

The endpoint returns icon-name strings [C-12].

| C-ID  | Claim                 | Status   | Backing                         |
|-------|-----------------------|----------|---------------------------------|
| C-12  | icon-name strings     | checked  | fixture E-3 @ commit ab12ef1 — src/x.js |
| C-13  | 10 req/s rate limit   | cited    | E-4                             |
| C-14  | disk headroom         | assumed  | E-5 — revisit                   |
| note  | not a claim row       | n/a      | ignored                         |
`;

  it('parses only C-NNN rows, with columns mapped by header', () => {
    const rows = parseClaimsTable(md);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.cid), ['C-12', 'C-13', 'C-14']);
    assert.deepEqual(rows.map((r) => r.status), ['checked', 'cited', 'assumed']);
  });

  it('returns [] when there is no claims table', () => {
    assert.deepEqual(parseClaimsTable('# Doc\n\nprose only\n'), []);
  });

  it('exposes the status vocabulary', () => {
    assert.deepEqual(CLAIM_STATUSES, ['checked', 'cited', 'attested', 'assumed']);
  });

  it('extractCommit prefers an anchored SHA and falls back to a bare hex', () => {
    assert.equal(extractCommit('E-3 @ commit ab12ef1 — src/x.js'), 'ab12ef1');
    assert.equal(extractCommit('sha 9f3ab12'), '9f3ab12');
    assert.equal(extractCommit('deadbee at head'), 'deadbee');
    assert.equal(extractCommit('E-4 only, no sha'), null);
  });

  it('extractPaths pulls path-like tokens', () => {
    const p = extractPaths('fixture E-3 @ commit ab12ef1 — src/ingest/edgar.js and b.js');
    assert.ok(p.includes('src/ingest/edgar.js'));
    assert.ok(p.includes('b.js'));
  });
});

describe('claim decay (git-backed)', () => {
  const repo = join(tmpdir(), 'bmad-decay-' + Date.now());
  let pin; // the commit checked claims are verified at

  before(() => {
    mkdirSync(repo, { recursive: true });
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 't@t.t');
    git(repo, 'config', 'user.name', 't');
    writeFileSync(join(repo, 'a.js'), 'v1\n');
    writeFileSync(join(repo, 'b.js'), 'stable\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'c1');
    pin = git(repo, 'rev-parse', 'HEAD');
    // a.js changes AFTER the pin; b.js never does.
    writeFileSync(join(repo, 'a.js'), 'v2 changed\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'c2');
  });

  after(() => rmSync(repo, { recursive: true, force: true }));

  const claim = (cid, status, backing) => `| ${cid} | c | ${status} | ${backing} |`;
  const doc = (...rows) =>
    `# Doc\n\n| C-ID | Claim | Status | Backing |\n|------|-------|--------|---------|\n${rows.join('\n')}\n`;

  it('flags a checked claim whose monitored file changed after the pin', () => {
    const md = doc(claim('C-1', 'checked', `E @ commit ${pin} — a.js`), claim('C-2', 'cited', 'E-4'), claim('C-3', 'assumed', 'E-5'));
    const { findings } = checkClaimDecay(md, { projectRoot: repo });
    const stale = findings.filter((f) => f.kind === 'stale');
    assert.equal(stale.length, 1);
    assert.equal(stale[0].cid, 'C-1');
    assert.match(stale[0].message, /a\.js has changed since/);
  });

  it('does NOT flag a checked claim whose monitored file is unchanged', () => {
    const md = doc(claim('C-1', 'checked', `E @ commit ${pin} — b.js`), claim('C-2', 'cited', 'E-4'), claim('C-3', 'assumed', 'E-5'));
    const { findings } = checkClaimDecay(md, { projectRoot: repo });
    assert.deepEqual(findings.filter((f) => f.kind === 'stale'), []);
  });

  it('ignores non-checked claims entirely', () => {
    const md = doc(claim('C-1', 'cited', 'E-4'), claim('C-2', 'assumed', 'a.js changed but assumed'), claim('C-3', 'attested', 'a human'));
    const { checkedCount, findings } = checkClaimDecay(md, { projectRoot: repo });
    assert.equal(checkedCount, 0);
    assert.deepEqual(findings, []);
  });

  it("flags a 'checked' claim that pins no commit", () => {
    const md = doc(claim('C-1', 'checked', 'E-1 (no commit)'), claim('C-2', 'cited', 'E-4'), claim('C-3', 'assumed', 'E-5'));
    const { findings } = checkClaimDecay(md, { projectRoot: repo });
    assert.ok(findings.some((f) => f.kind === 'unpinned' && f.cid === 'C-1'), JSON.stringify(findings));
  });

  it('flags a checked claim pinning a commit the repo does not contain', () => {
    const md = doc(claim('C-1', 'checked', 'E @ commit deadbee — a.js'), claim('C-2', 'cited', 'E-4'), claim('C-3', 'assumed', 'E-5'));
    const { findings } = checkClaimDecay(md, { projectRoot: repo });
    assert.ok(findings.some((f) => f.kind === 'unknown-commit' && f.cid === 'C-1'), JSON.stringify(findings));
  });
});
