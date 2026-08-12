import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { METHODOLOGY_SHIP_LIST } from '../utils/scaffold-paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI = join(__dirname, '..', 'bin', 'bmad-swarm.js');

function run(cmd, cwd) {
  return execSync(`node "${CLI}" ${cmd}`, { cwd, encoding: 'utf8', timeout: 30000 });
}

// Every generated .md under .claude/ plus CLAUDE.md.
function generatedMarkdownFiles(root) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) out.push(p);
    }
  };
  if (existsSync(join(root, '.claude'))) walk(join(root, '.claude'));
  if (existsSync(join(root, 'CLAUDE.md'))) out.push(join(root, 'CLAUDE.md'));
  return out;
}

// Backticked path tokens that look like scaffold references.
const TOKEN_RE = /`([^`]+)`/g;
const SCAFFOLD_PREFIX_RE = /^(\.claude|methodology|agents|overrides)\//;
// Tokens exempt from the on-disk existence check: metavariable placeholders
// (`<domain>`), and the user-owned local settings file (git-ignored, created on
// demand — see the D-042 minimal ignore set).
function isExemptFromExistence(token) {
  return token.includes('<') || token.includes('>') || token === '.claude/settings.local.json';
}

// Collect scaffold path tokens, stripping trailing punctuation that abuts a
// closing backtick in prose (e.g. a period or paren).
function scaffoldTokens(content) {
  const tokens = [];
  let m;
  while ((m = TOKEN_RE.exec(content))) {
    const raw = m[1].replace(/[)>.,;:]+$/, '');
    if (SCAFFOLD_PREFIX_RE.test(raw)) tokens.push(raw);
  }
  return tokens;
}

describe('Self-containment (CB-1)', () => {
  const tmpBase = join(tmpdir(), 'bmad-self-contain-' + Date.now());

  before(() => {
    mkdirSync(tmpBase, { recursive: true });
  });

  after(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('a fresh init ships the full methodology subset', () => {
    const dir = join(tmpBase, 'init-ship');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);

    const methDir = join(dir, '.claude', 'bmad', 'methodology');
    assert.ok(existsSync(methDir), '.claude/bmad/methodology/ should exist');
    for (const rel of METHODOLOGY_SHIP_LIST) {
      assert.ok(existsSync(join(methDir, rel)), `shipped methodology file should exist: ${rel}`);
    }
    // spec.yaml is package-only; it must NOT be shipped into the scaffold.
    assert.ok(!existsSync(join(methDir, 'artifact-schemas', 'spec.yaml')), 'spec.yaml must not be shipped');
  });

  it('generated references contain no dangling repo-relative paths and all .claude paths resolve', () => {
    const dir = join(tmpBase, 'init-refs');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);

    const files = generatedMarkdownFiles(dir);
    assert.ok(files.length > 0, 'should have generated markdown files');

    const dangling = [];
    const missing = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      for (const token of scaffoldTokens(content)) {
        // (a) dangling-prefix ban: no bare methodology/ or agents/<role>.md.
        if (token.startsWith('methodology/') || /^agents\//.test(token)) {
          dangling.push(`${token}  <= ${f.replace(dir, '')}`);
          continue;
        }
        // (b) every concrete .claude/ token resolves on disk.
        if (token.startsWith('.claude/') && !isExemptFromExistence(token)) {
          if (!existsSync(join(dir, token))) missing.push(`${token}  <= ${f.replace(dir, '')}`);
        }
      }
    }

    assert.deepEqual(dangling, [], `dangling repo-relative refs found:\n${dangling.join('\n')}`);
    assert.deepEqual(missing, [], `unresolved .claude/ refs found:\n${missing.join('\n')}`);
  });

  it('shipped methodology internal cross-references are rewritten to the shipped layout', () => {
    const dir = join(tmpBase, 'init-crossref');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);

    const methDir = join(dir, '.claude', 'bmad', 'methodology');
    // decision-traceability cross-references decision-classification and reviewer.
    const dt = readFileSync(join(methDir, 'decision-traceability.md'), 'utf8');
    assert.ok(!/`methodology\//.test(dt), 'shipped file must not carry bare methodology/ refs');
    assert.ok(dt.includes('.claude/bmad/methodology/decision-classification.md'), 'internal methodology cross-ref should be rewritten');
    assert.ok(!/`agents\/reviewer\.md`/.test(dt), 'shipped file must not carry bare agents/ refs');
  });

  it('update migrates a pre-Phase-1 scaffold: ships methodology, flips gitignore, resolves refs', () => {
    const dir = join(tmpBase, 'migrate');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);

    // Simulate a pre-Phase-1 (v2.0) project: no shipped methodology, and the
    // old broad gitignore section.
    rmSync(join(dir, '.claude', 'bmad'), { recursive: true, force: true });
    writeFileSync(join(dir, '.gitignore'),
      'node_modules/\n\n# bmad-swarm (generated files)\n.claude/\nartifacts/\nswarm.yaml\nproject.yaml\nCLAUDE.md\noverrides/\n'
    );

    const output = run('update', dir);

    // Methodology shipped.
    const methDir = join(dir, '.claude', 'bmad', 'methodology');
    for (const rel of METHODOLOGY_SHIP_LIST) {
      assert.ok(existsSync(join(methDir, rel)), `update should ship methodology file: ${rel}`);
    }

    // Gitignore flipped to the minimal set (broad ignores removed).
    const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
    assert.ok(gi.includes('.claude/settings.local.json'), 'gitignore should list the minimal set');
    const managed = gi.split('\n').map((l) => l.trim());
    const markerIdx = managed.indexOf('# bmad-swarm (generated files)');
    const after = managed.slice(markerIdx + 1).filter((l) => l && !l.startsWith('#'));
    assert.ok(!after.includes('.claude/'), 'broad .claude/ ignore must be removed on migration');
    assert.ok(!after.includes('artifacts/'), 'broad artifacts/ ignore must be removed on migration');

    // Migration notice printed.
    assert.ok(/Sharing model updated/.test(output), 'update should print the sharing-model migration notice');

    // Refs resolve after migration.
    const dangling = [];
    for (const f of generatedMarkdownFiles(dir)) {
      const content = readFileSync(f, 'utf8');
      for (const token of scaffoldTokens(content)) {
        if (token.startsWith('methodology/') || /^agents\//.test(token)) dangling.push(token);
      }
    }
    assert.deepEqual(dangling, [], `dangling refs after migration:\n${dangling.join('\n')}`);
  });

  it('update warns when migration drops a custom ignore from inside the managed block (L1)', () => {
    const dir = join(tmpBase, 'migrate-warn');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);

    // Pre-Phase-1 project whose old broad block also carried a user custom
    // ignore (the silent-loss case the L1 review flagged).
    rmSync(join(dir, '.claude', 'bmad'), { recursive: true, force: true });
    writeFileSync(join(dir, '.gitignore'),
      'node_modules/\n\n# bmad-swarm (generated files)\n.claude/\nartifacts/\nmy-secret.env\nswarm.yaml\noverrides/\n'
    );

    const output = run('update', dir);

    assert.ok(/Removed 1 custom ignore/.test(output), 'update should warn about the dropped custom ignore');
    assert.ok(/my-secret\.env/.test(output), 'the warning should name the dropped entry');
    assert.ok(/ABOVE the .* marker/.test(output), 'the warning should tell the user where to move it');
  });

  it('re-running update is idempotent for shipped methodology (no spurious modifications)', () => {
    const dir = join(tmpBase, 'idempotent');
    mkdirSync(dir, { recursive: true });
    run('init -y', dir);
    const before = readFileSync(join(dir, '.claude', 'bmad', 'methodology', 'decision-classification.md'), 'utf8');
    run('update', dir);
    const after = readFileSync(join(dir, '.claude', 'bmad', 'methodology', 'decision-classification.md'), 'utf8');
    assert.equal(before, after, 'shipped methodology should be byte-identical after re-generation');
  });
});
