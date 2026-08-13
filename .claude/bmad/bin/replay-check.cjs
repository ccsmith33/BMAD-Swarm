#!/usr/bin/env node
// bmad-generated:f089c0f8
// BMAD Swarm - replay-check.cjs: the deterministic Tier-0 evidence engine
// (ADR-022 / D-040 / D-049; phase2 design §4.2). This is the replay gate's
// engine, and — run directly by a reviewer or the orchestrator — the designed
// degradation path if the blocking TaskCompleted hook ever goes dark (ADR-022
// point 3). Same checks, same verdict, weaker trigger.
//
// SELF-CONTAINED BY CONSTRAINT (mirrors bin/record.cjs, T2): this file ships
// verbatim into user projects at .claude/bmad/bin/replay-check.cjs, where
// neither bmad-swarm's utils/ nor its node_modules (js-yaml) exist. It uses
// ONLY node built-ins. Because there is no YAML dependency, it carries a small
// YAML *reader* for the constrained evidence-bundle + swarm.yaml `replay:`
// subset (block/flow maps, block/flow sequences, quoted/bare scalars). The
// package-side ESM face utils/evidence.js re-exports these pure functions so
// the hook, the tests, and cli code share ONE engine (the "identical verdicts"
// guarantee, phase2 §4.2 exit criteria).
//
// TRUST MODEL (the whole point, verification-as-product §0): the engine never
// trusts a "done" claim. It re-executes declared evidence — stats every cited
// path, re-runs allow-listed commands and compares exit codes, resolves
// citations. An LLM's honesty is never load-bearing. Commands are executed ONLY
// when they prefix-match swarm.yaml `replay.allowed_commands` (the L-2 answer:
// no agent-invented command ever runs); everything is spawned shell:false with
// argv tokenization, a per-command timeout, and cwd confined inside the repo.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Config: the swarm.yaml `replay:` block, with safe defaults (phase2 §4.2).
// ---------------------------------------------------------------------------

const DEFAULT_REPLAY_CONFIG = {
  allowed_commands: ['npm test', 'npm run test', 'node --test'],
  timeout_seconds: 300,
  url_citations: 'advisory', // advisory | blocking | skip
  gated_task_classes: ['story', 'bug-fix', 'review'],
  // Owner-name pattern (matched against the completing teammate) that MUST
  // produce gated work — the non-renameable coverage signal (F2-M3 / security
  // critical 3): a developer/reviewer completing an implementation task cannot
  // escape the gate by choosing a subject that dodges the class regexes.
  gated_owner_pattern: '^(dev|reviewer|security)',
};

// Keys a crafted bundle/swarm.yaml must never be allowed to set on a parsed
// object (prototype-pollution gadget, security medium). Rejected loudly by the
// YAML reader rather than silently assigned.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// The evidence-item kinds the engine understands (phase2 §4.1 frozen schema;
// identical vocabulary to bin/record.cjs EVIDENCE_KINDS).
const EVIDENCE_KINDS = [
  'test-run', 'command', 'file-exists', 'citation',
  'fixture-provenance', 'human-attested', 'assumed',
];

// Category priority: cheap deterministic checks first, so a fabricated path is
// caught for zero tokens BEFORE any command is executed (§4.2 order). Lower runs
// first. Bundle parse/schema (0) happens before per-item checks.
const KIND_PRIORITY = {
  'file-exists': 1,
  'command': 2,
  'test-run': 2,
  'citation': 3,
  'fixture-provenance': 4,
  'human-attested': 5,
  'assumed': 5,
};

// ---------------------------------------------------------------------------
// A constrained YAML reader (no dependency). Supports the documented subset:
//   - block maps (indentation) and block sequences (`- ` items)
//   - inline block-map sequence items (`- key: val` + indented continuations)
//   - flow maps `{k: v, ...}` and flow sequences `[a, b]`
//   - scalars: bare, single/double quoted, numbers, booleans, null (~)
//   - `#` line comments (outside quotes)
// Constructs outside this subset (block scalars `|`/`>`, anchors, tags) throw,
// so an exotic bundle fails LOUDLY rather than being silently misread.
// ---------------------------------------------------------------------------

function stripComment(line) {
  let inS = false; // single quote
  let inD = false; // double quote
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD) {
      // A `#` is a comment only when preceded by whitespace or at line start.
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

function tokenizeLines(text) {
  const out = [];
  const raw = String(text).split('\n');
  for (let n = 0; n < raw.length; n++) {
    let line = raw[n];
    if (line.indexOf('\t') !== -1 && /^\s*\t/.test(line)) {
      throw new Error(`line ${n + 1}: tab indentation is not supported`);
    }
    line = stripComment(line);
    if (line.trim() === '') continue;
    if (line.trim() === '---' || line.trim() === '...') continue; // doc markers
    const indent = line.length - line.replace(/^ +/, '').length;
    out.push({ indent, content: line.slice(indent).replace(/\s+$/, ''), lineNo: n + 1 });
  }
  return out;
}

// Split "key: rest" at the first top-level `:` followed by space or EOL,
// ignoring colons inside quotes/flow. Returns [key, rest] or null when the line
// is not a map entry.
function splitKeyValue(content) {
  let inS = false;
  let inD = false;
  let depth = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (!inS && !inD) {
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      else if (c === ':' && depth === 0 && (i + 1 >= content.length || content[i + 1] === ' ')) {
        return [unquote(content.slice(0, i).trim()), content.slice(i + 1).trim()];
      }
    }
  }
  return null;
}

function isMapEntry(content) {
  return splitKeyValue(content) !== null;
}

function unquote(s) {
  const t = String(s).trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
  }
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function parseScalar(s) {
  const t = String(s).trim();
  if (t === '' ) return null;
  if (t[0] === '"' || t[0] === "'") return unquote(t);
  if (t === 'null' || t === '~') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?\d*\.\d+$/.test(t)) return parseFloat(t);
  return t;
}

// Parse a flow collection ({...} or [...]) from `s`, returning the value. A
// tiny recursive-descent tokenizer that respects nesting and quotes.
function parseFlow(s) {
  const str = String(s).trim();
  const { value, next } = parseFlowAt(str, 0);
  const rest = str.slice(next).trim();
  if (rest !== '') throw new Error(`trailing characters after flow value: ${JSON.stringify(rest)}`);
  return value;
}

function parseFlowAt(str, i) {
  i = skipWs(str, i);
  if (str[i] === '{') return parseFlowMap(str, i);
  if (str[i] === '[') return parseFlowSeq(str, i);
  return parseFlowScalar(str, i);
}

function skipWs(str, i) {
  while (i < str.length && /\s/.test(str[i])) i++;
  return i;
}

function parseFlowScalar(str, i) {
  // Read until a top-level , } ] (respecting quotes).
  let inS = false;
  let inD = false;
  const start = i;
  for (; i < str.length; i++) {
    const c = str[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (!inS && !inD && (c === ',' || c === '}' || c === ']')) break;
  }
  return { value: parseScalar(str.slice(start, i).trim()), next: i };
}

function parseFlowMap(str, i) {
  const obj = {};
  i++; // consume {
  i = skipWs(str, i);
  if (str[i] === '}') return { value: obj, next: i + 1 };
  for (;;) {
    i = skipWs(str, i);
    // key: read a scalar up to the top-level ':'
    let inS = false;
    let inD = false;
    const kStart = i;
    for (; i < str.length; i++) {
      const c = str[i];
      if (c === "'" && !inD) inS = !inS;
      else if (c === '"' && !inS) inD = !inD;
      else if (!inS && !inD && c === ':') break;
    }
    const key = unquote(str.slice(kStart, i).trim());
    if (str[i] !== ':') throw new Error(`flow map: expected ':' near ${JSON.stringify(str.slice(kStart))}`);
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`refusing dangerous key in flow map: ${key}`);
    i++; // consume :
    const r = parseFlowAt(str, i);
    obj[key] = r.value;
    i = skipWs(str, r.next);
    if (str[i] === ',') { i++; continue; }
    if (str[i] === '}') return { value: obj, next: i + 1 };
    throw new Error(`flow map: expected ',' or '}' near ${JSON.stringify(str.slice(i))}`);
  }
}

function parseFlowSeq(str, i) {
  const arr = [];
  i++; // consume [
  i = skipWs(str, i);
  if (str[i] === ']') return { value: arr, next: i + 1 };
  for (;;) {
    const r = parseFlowAt(str, i);
    arr.push(r.value);
    i = skipWs(str, r.next);
    if (str[i] === ',') { i++; i = skipWs(str, i); continue; }
    if (str[i] === ']') return { value: arr, next: i + 1 };
    throw new Error(`flow seq: expected ',' or ']' near ${JSON.stringify(str.slice(i))}`);
  }
}

function parseValueString(rest) {
  const t = String(rest).trim();
  if (t[0] === '{' || t[0] === '[') return parseFlow(t);
  if (t[0] === '|' || t[0] === '>') throw new Error('block scalars (|, >) are not supported in this subset');
  return parseScalar(t);
}

// Recursive block parser. Returns [value, nextIndex].
function parseBlock(lines, i, indent) {
  if (i >= lines.length || lines[i].indent < indent) return [null, i];
  if (lines[i].content.startsWith('- ') || lines[i].content === '-') {
    return parseSeq(lines, i, indent);
  }
  return parseMap(lines, i, indent);
}

function parseSeq(lines, i, indent) {
  const arr = [];
  while (i < lines.length && lines[i].indent === indent
         && (lines[i].content.startsWith('- ') || lines[i].content === '-')) {
    const rest = lines[i].content === '-' ? '' : lines[i].content.slice(2).trim();
    const childIndent = indent + 2;
    if (rest === '') {
      const [v, ni] = parseBlock(lines, i + 1, childIndent);
      arr.push(v);
      i = ni;
    } else if (rest[0] === '{' || rest[0] === '[') {
      arr.push(parseFlow(rest));
      i++;
    } else if (isMapEntry(rest)) {
      // Inline block-map item: synthesize the first key line at childIndent,
      // then let parseMap consume the indented continuation keys.
      lines[i] = { indent: childIndent, content: rest, lineNo: lines[i].lineNo };
      const [v, ni] = parseMap(lines, i, childIndent);
      arr.push(v);
      i = ni;
    } else {
      arr.push(parseScalar(rest));
      i++;
    }
  }
  return [arr, i];
}

function parseMap(lines, i, indent) {
  const obj = {};
  while (i < lines.length && lines[i].indent === indent
         && !(lines[i].content.startsWith('- ') || lines[i].content === '-')) {
    const kv = splitKeyValue(lines[i].content);
    if (!kv) throw new Error(`line ${lines[i].lineNo}: not a map entry: ${JSON.stringify(lines[i].content)}`);
    const [key, rest] = kv;
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`line ${lines[i].lineNo}: refusing dangerous key: ${key}`);
    i++;
    if (rest === '') {
      // Nested block: a child map/seq at greater indent, OR a sequence at the
      // SAME indent as this key (YAML allows `items:` then `- ` unindented).
      if (i < lines.length && lines[i].indent > indent) {
        const [v, ni] = parseBlock(lines, i, lines[i].indent);
        obj[key] = v;
        i = ni;
      } else if (i < lines.length && lines[i].indent === indent
                 && (lines[i].content.startsWith('- ') || lines[i].content === '-')) {
        const [v, ni] = parseSeq(lines, i, indent);
        obj[key] = v;
        i = ni;
      } else {
        obj[key] = null;
      }
    } else {
      obj[key] = parseValueString(rest);
    }
  }
  return [obj, i];
}

/**
 * Parse the supported YAML subset into a JS value.
 * @param {string} text
 * @returns {*}
 */
function parseYaml(text) {
  const lines = tokenizeLines(text);
  if (lines.length === 0) return null;
  const [value] = parseBlock(lines, 0, lines[0].indent);
  return value;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

/**
 * Load the `replay:` block from swarm.yaml, merged over safe defaults. Missing
 * file or missing block yields the defaults (the gate is safe-by-default; an
 * absent allow-list means NO command ever runs, only refusals).
 * @param {string} swarmYamlPath
 * @returns {object}
 */
function loadReplayConfig(swarmYamlPath) {
  const cfg = Object.assign({}, DEFAULT_REPLAY_CONFIG);
  if (!swarmYamlPath || !fs.existsSync(swarmYamlPath)) return cfg;
  let parsed;
  try { parsed = parseYaml(fs.readFileSync(swarmYamlPath, 'utf8')); } catch { return cfg; }
  const r = parsed && typeof parsed === 'object' ? parsed.replay : null;
  if (!r || typeof r !== 'object') return cfg;
  if (Array.isArray(r.allowed_commands)) cfg.allowed_commands = r.allowed_commands.map(String);
  if (Number.isFinite(r.timeout_seconds)) cfg.timeout_seconds = r.timeout_seconds;
  if (typeof r.url_citations === 'string') cfg.url_citations = r.url_citations;
  if (Array.isArray(r.gated_task_classes)) cfg.gated_task_classes = r.gated_task_classes.map(String);
  if (typeof r.gated_owner_pattern === 'string') cfg.gated_owner_pattern = r.gated_owner_pattern;
  return cfg;
}

// ---------------------------------------------------------------------------
// Path confinement (F-017 discipline, shared with the write-gate)
// ---------------------------------------------------------------------------

function normSlashes(p) { return String(p == null ? '' : p).replace(/\\/g, '/'); }

// Resolve `rawPath` (relative -> against root) to an absolute path WITHOUT
// touching the filesystem, rejecting any `..` segment. Returns null on traversal.
// This is the LEXICAL half of confinement; realpathConfined() below is the
// physical half (symlinked-ancestor escape, security HIGH F-017).
function confinedResolve(rawPath, root) {
  const norm = normSlashes(rawPath);
  if (norm === '') return null;
  if (norm.split('/').includes('..')) return null;
  const abs = path.isAbsolute(norm) ? path.normalize(norm) : path.normalize(path.join(root, norm));
  // Absolute paths must still sit inside the repo root.
  const nroot = path.normalize(root);
  if (abs !== nroot && !abs.startsWith(nroot + path.sep)) return null;
  return abs;
}

// Physical confinement: after lexical resolution, resolve symlinks on the path
// (or its nearest existing ancestor) and re-check the prefix against the repo's
// realpath. Catches a symlink whose lexical path is inside artifacts/ but whose
// physical target escapes the repo (security HIGH). Returns true when confined.
function realpathConfined(abs, root) {
  let realRoot;
  try { realRoot = fs.realpathSync(path.normalize(root)); } catch { return true; } // no root to anchor on; lexical check stands
  let target;
  try {
    target = fs.realpathSync(abs);
  } catch {
    // abs itself does not exist yet; check its nearest existing ancestor.
    let dir = path.dirname(abs);
    for (;;) {
      try { target = fs.realpathSync(dir); break; }
      catch {
        const parent = path.dirname(dir);
        if (parent === dir) return true; // nothing exists to resolve; lexical stands
        dir = parent;
      }
    }
  }
  return target === realRoot || target.startsWith(realRoot + path.sep);
}

// ---------------------------------------------------------------------------
// The checks (each returns {ok, reason})
// ---------------------------------------------------------------------------

function checkFileExists(item, ctx) {
  const paths = Array.isArray(item.paths) ? item.paths : (item.paths != null ? [item.paths] : []);
  if (paths.length === 0) return { ok: false, reason: 'file-exists item declares no paths' };
  for (const p of paths) {
    const abs = confinedResolve(p, ctx.projectRoot);
    if (!abs) return { ok: false, reason: `path escapes the repo or is a traversal: ${p}` };
    let st;
    try { st = fs.statSync(abs); } catch { return { ok: false, reason: `${p} does not exist` }; }
    if (!st.isFile() && !st.isDirectory()) return { ok: false, reason: `${p} is neither a file nor a directory` };
    if (!realpathConfined(abs, ctx.projectRoot)) return { ok: false, reason: `${p} resolves outside the repo via a symlink` };
  }
  return { ok: true };
}

// Tokenize a command string into argv, respecting single/double quotes. No
// shell metacharacter interpretation — the command is spawned shell:false.
function tokenizeCommand(cmd) {
  const argv = [];
  let cur = '';
  let inS = false;
  let inD = false;
  let has = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "'" && !inD) { inS = !inS; has = true; }
    else if (c === '"' && !inS) { inD = !inD; has = true; }
    else if (/\s/.test(c) && !inS && !inD) {
      if (has) { argv.push(cur); cur = ''; has = false; }
    } else { cur += c; has = true; }
  }
  if (has) argv.push(cur);
  return argv;
}

// Exact-TOKEN prefix match (security medium): the command's argv must begin with
// the allow-list entry's argv, token for token. `npm test` allows `npm test` and
// `npm test --watch`, but NOT `npm testfoo` (a loose string startsWith would let
// that through) and NOT `npm test; rm -rf x` (which tokenizes to a different
// third token anyway). No metacharacter interpretation — spawn is shell:false.
function commandAllowed(cmd, allowed) {
  const argv = tokenizeCommand(cmd);
  return (allowed || []).some((prefix) => {
    const p = tokenizeCommand(String(prefix));
    if (p.length === 0 || p.length > argv.length) return false;
    return p.every((tok, i) => tok === argv[i]);
  });
}

function checkCommand(item, ctx) {
  const cmd = item.cmd;
  if (!cmd || typeof cmd !== 'string') return { ok: false, reason: `${item.kind} item declares no cmd` };
  // ALLOW-LIST FIRST — a non-allow-listed command is REFUSED, never executed.
  if (!commandAllowed(cmd, ctx.config.allowed_commands)) {
    return {
      ok: false,
      reason: `command not on replay.allowed_commands allow-list; NOT executed: ${JSON.stringify(cmd)}`,
    };
  }
  const argv = tokenizeCommand(cmd);
  if (argv.length === 0) return { ok: false, reason: 'command tokenized to empty argv' };

  // cwd confined inside the repo (lexical + realpath).
  let cwd = ctx.projectRoot;
  if (item.cwd != null && item.cwd !== '' && item.cwd !== '.') {
    const abs = confinedResolve(item.cwd, ctx.projectRoot);
    if (!abs) return { ok: false, reason: `cwd escapes the repo: ${item.cwd}` };
    if (!realpathConfined(abs, ctx.projectRoot)) return { ok: false, reason: `cwd resolves outside the repo via a symlink: ${item.cwd}` };
    cwd = abs;
  }

  // SUCCESS IS EXIT 0, ALWAYS (security critical 1): the bundle author is the
  // same agent claiming "done", so an item-supplied `expect.exit` would let a
  // failing suite declare itself passing (`expect: {exit: 1}`). We ignore any
  // attacker-supplied expected code — a test/command passes iff it exits 0.
  const expectExit = 0;
  const timeoutMs = Math.max(1, (ctx.config.timeout_seconds || 300)) * 1000;

  const res = spawnSync(argv[0], argv.slice(1), {
    cwd,
    shell: false,
    timeout: timeoutMs,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.error && res.error.code === 'ETIMEDOUT') {
    return { ok: false, reason: `command timed out after ${ctx.config.timeout_seconds}s: ${cmd}` };
  }
  if (res.error) return { ok: false, reason: `command failed to spawn (${res.error.code || res.error.message}): ${cmd}` };
  if (res.signal) return { ok: false, reason: `command killed by signal ${res.signal}: ${cmd}` };
  if (res.status !== expectExit) {
    return { ok: false, reason: `command exit ${res.status} != expected ${expectExit}: ${cmd}` };
  }
  return { ok: true };
}

function checkCitation(item, ctx) {
  if (item.url != null && item.url !== '') {
    const mode = ctx.config.url_citations || 'advisory';
    if (mode === 'skip') return { ok: true, advisory: `url citation skipped (replay.url_citations: skip): ${item.url}` };
    // Network resolution is inherently non-deterministic; treat it as advisory
    // unless explicitly configured blocking. v1 never fails on a flaky network
    // in advisory mode (phase2 §4.2 check 4). Actual HEAD-fetch resolution is a
    // documented follow-on; here we record the intent without blocking.
    if (mode === 'blocking') return { ok: true, advisory: `url citation resolution is a documented follow-on; not blocking in v1: ${item.url}` };
    return { ok: true, advisory: `url citation (advisory): ${item.url}` };
  }
  const ref = item.ref;
  if (!ref || typeof ref !== 'string') return { ok: false, reason: 'citation item declares neither ref nor url' };
  const m = /^(.*?)(?::(\d+))?$/.exec(ref);
  const filePart = m[1];
  const line = m[2] ? parseInt(m[2], 10) : null;
  const abs = confinedResolve(filePart, ctx.projectRoot);
  if (!abs) return { ok: false, reason: `citation path escapes the repo or is a traversal: ${filePart}` };
  if (!realpathConfined(abs, ctx.projectRoot)) return { ok: false, reason: `citation resolves outside the repo via a symlink: ${filePart}` };
  let content;
  try { content = fs.readFileSync(abs, 'utf8'); } catch { return { ok: false, reason: `citation target does not exist: ${filePart}` }; }
  if (line != null) {
    const count = content.split('\n').length;
    if (count < line) return { ok: false, reason: `citation ${ref} points past EOF (${count} lines)` };
  }
  return { ok: true };
}

function checkFixtureProvenance(item) {
  const hasCaptured = item.captured_from != null && item.captured_from !== '';
  const isSynthetic = item.synthetic === true;
  if (hasCaptured === isSynthetic) {
    return { ok: false, reason: `fixture-provenance requires EXACTLY ONE of captured_from / synthetic:true (fixture: ${item.fixture || '?'})` };
  }
  return { ok: true };
}

// Presence-only (assumed / human-attested are declared, not replayable). Always
// passes Tier-0; they exist to make unverified claims VISIBLE, not to gate.
function checkDeclared(item) {
  if (!item.claim || String(item.claim).trim() === '') {
    return { ok: true, advisory: `${item.kind} item has no claim text` };
  }
  return { ok: true };
}

function runItemCheck(item, ctx) {
  switch (item.kind) {
    case 'file-exists': return checkFileExists(item, ctx);
    case 'test-run':
    case 'command': return checkCommand(item, ctx);
    case 'citation': return checkCitation(item, ctx);
    case 'fixture-provenance': return checkFixtureProvenance(item);
    case 'human-attested':
    case 'assumed': return checkDeclared(item);
    default: return { ok: false, reason: `unknown evidence kind: ${JSON.stringify(item.kind)}` };
  }
}

// ---------------------------------------------------------------------------
// Claim decay (Phase 4 Stream V — diverge-verification §2.3). A `checked` claim
// records the commit it was verified at; when a file it monitors changes after
// that commit, the claim is stale. Everything here is deterministic and
// replayable (git diff over a pinned SHA), so cli/doctor may honestly present it
// as a CHECK, not enforcement — it flags, it never gates. This machinery also
// backs the validator's advisory claims lint (shared parser, no mirror — the
// same single-sourcing utils/evidence.js uses over this engine).
// ---------------------------------------------------------------------------

// The claim-status vocabulary (diverge-verification §2.2). `checked` is the only
// decay-bearing status: it is the one backed by replayable evidence at a commit.
const CLAIM_STATUSES = ['checked', 'cited', 'attested', 'assumed'];

// Split one markdown table line into trimmed cells, or null if it is not a table
// row. Leading/trailing pipes are optional-tolerant.
function parseTableRow(line) {
  const t = String(line || '').trim();
  if (!t.startsWith('|')) return null;
  return t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

// A separator row (`|---|:--:|`) carries no data.
function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Parse the footer claims table out of an artifact's markdown. Recognizes a
 * pipe table whose header row contains the C-ID, Claim and Status columns (the
 * Backing column is optional in the header but read when present). Returns
 * [{ cid, claim, status, backing }] for every row whose C-ID cell is a C-NNN
 * marker; rows outside that shape are skipped rather than guessed at.
 */
function parseClaimsTable(markdown) {
  const lines = String(markdown || '').split('\n');
  const rows = [];
  let header = null;
  for (const line of lines) {
    const cells = parseTableRow(line);
    if (!cells) { header = null; continue; }
    const norm = cells.map((c) => c.toLowerCase());
    if (!header) {
      if (norm.includes('c-id') && norm.includes('claim') && norm.includes('status')) {
        header = norm;
      }
      continue;
    }
    if (isSeparatorRow(cells)) continue;
    const at = (name) => {
      const idx = header.indexOf(name);
      return idx >= 0 && idx < cells.length ? cells[idx] : '';
    };
    const cid = at('c-id');
    if (!/^C-\d+$/i.test(cid)) continue;
    rows.push({
      cid: cid.toUpperCase(),
      claim: at('claim'),
      status: at('status').toLowerCase(),
      backing: at('backing'),
    });
  }
  return rows;
}

// Pull the commit a `checked` claim pins from its Backing cell. Prefers an
// anchored form (`commit ab12ef`, `@ ab12ef`, `sha ab12ef`); falls back to any
// bare 7–40 char hex token. Returns a lowercased SHA or null.
function extractCommit(backing) {
  const s = String(backing || '');
  const anchored = /(?:@|\bcommit\b|\bsha\b)\s*([0-9a-f]{7,40})\b/i.exec(s);
  if (anchored) return anchored[1].toLowerCase();
  const bare = /\b([0-9a-f]{7,40})\b/i.exec(s);
  return bare ? bare[1].toLowerCase() : null;
}

// Pull repo-relative path-like tokens (a slashed path or a bare `name.ext`) from
// a Backing cell. The caller filters these against on-disk existence, so an
// over-match that names no real file is harmless.
function extractPaths(backing) {
  const s = String(backing || '');
  const re = /([\w.-]+(?:\/[\w.-]+)+(?:\.[\w]+)?|[\w-]+\.[a-z][\w]{0,4})/gi;
  const out = new Set();
  let m;
  while ((m = re.exec(s))) out.add(m[1]);
  return [...out];
}

// Is `sha` a commit object in the repo at `cwd`? (git is the trust anchor; a
// claim pinning a SHA the repo has never seen cannot be decay-checked.)
function gitCommitExists(sha, cwd) {
  const r = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd, encoding: 'utf8' });
  return r.status === 0;
}

// Has `file` changed between `sha` and HEAD? true/false, or null when git could
// not answer (no repo, unknown path) — the caller treats null as "cannot tell".
function gitFileChangedSince(sha, file, cwd) {
  const r = spawnSync('git', ['diff', '--quiet', sha, 'HEAD', '--', file], { cwd, encoding: 'utf8' });
  if (r.status === 0) return false;
  if (r.status === 1) return true;
  return null;
}

/**
 * Run the decay pass over one artifact's markdown. For each `checked` claim:
 *   - no pinned commit           → finding kind 'unpinned'
 *   - commit not in the repo     → finding kind 'unknown-commit'
 *   - pinned but names no file   → finding kind 'no-files'
 *   - a monitored file changed   → finding kind 'stale' (the headline signal)
 * Non-`checked` claims never decay. Returns { claimCount, checkedCount, findings }.
 *
 * @param {string} markdown - the artifact body
 * @param {object} opts - { projectRoot }
 */
function checkClaimDecay(markdown, opts) {
  const cwd = path.resolve((opts && opts.projectRoot) || process.cwd());
  const rows = parseClaimsTable(markdown);
  const findings = [];
  let checkedCount = 0;
  for (const row of rows) {
    if (row.status !== 'checked') continue;
    checkedCount++;
    const sha = extractCommit(row.backing);
    if (!sha) {
      findings.push({ cid: row.cid, kind: 'unpinned',
        message: `${row.cid} is 'checked' but its Backing pins no commit — a checked claim must record the commit it was verified at` });
      continue;
    }
    if (!gitCommitExists(sha, cwd)) {
      findings.push({ cid: row.cid, kind: 'unknown-commit', sha,
        message: `${row.cid} pins commit ${sha}, which this repo does not contain — decay cannot be checked` });
      continue;
    }
    const files = extractPaths(row.backing).filter((f) => fs.existsSync(path.join(cwd, f)));
    if (files.length === 0) {
      findings.push({ cid: row.cid, kind: 'no-files', sha,
        message: `${row.cid} pins ${sha} but names no on-disk file to monitor — decay cannot be checked` });
      continue;
    }
    const changed = files.filter((f) => gitFileChangedSince(sha, f, cwd) === true);
    if (changed.length) {
      findings.push({ cid: row.cid, kind: 'stale', sha, files: changed,
        message: `${row.cid} was checked at ${sha}; ${changed.join(', ')} has changed since — re-verify or downgrade to 'assumed'` });
    }
  }
  return { claimCount: rows.length, checkedCount, findings };
}

// ---------------------------------------------------------------------------
// Bundle evaluation — the verdict
// ---------------------------------------------------------------------------

/**
 * Evaluate an evidence bundle at `bundlePath`. Returns a structured verdict:
 *   { ok, artifact, checks:[{id,kind,result,reason?,advisory?}], firstFailure, error? }
 * `result` ∈ pass | fail | advisory. `ok` is true iff no check failed.
 *
 * @param {string} bundlePath
 * @param {object} opts - { projectRoot, config, requireExecutable }
 * @returns {object}
 */
function evaluateBundle(bundlePath, opts) {
  const projectRoot = path.resolve((opts && opts.projectRoot) || process.cwd());
  const config = (opts && opts.config) || DEFAULT_REPLAY_CONFIG;
  const requireExecutable = !!(opts && opts.requireExecutable);
  const ctx = { projectRoot, config };

  // The bundle itself must live inside the repo — a gated task cannot point at
  // /tmp/empty.yaml to self-satisfy (security HIGH: unconfined bundle path).
  const absBundle = confinedResolve(bundlePath, projectRoot);
  if (!absBundle) {
    return fail(bundlePath, `evidence bundle path escapes the repo or is a traversal: ${bundlePath}. The bundle must live inside the project, like the paths it cites.`);
  }
  if (!fs.existsSync(absBundle)) {
    return fail(bundlePath, `evidence bundle not found: ${bundlePath}. A gated task MUST declare evidence: <path/to/bundle.yaml> and the bundle must exist.`);
  }
  if (!realpathConfined(absBundle, projectRoot)) {
    return fail(bundlePath, `evidence bundle resolves outside the repo via a symlink: ${bundlePath}`);
  }
  let doc;
  try { doc = parseYaml(fs.readFileSync(absBundle, 'utf8')); } catch (e) {
    return fail(bundlePath, `evidence bundle did not parse: ${e.message}`);
  }
  const bundle = doc && typeof doc === 'object' ? (doc.evidence_bundle || doc) : null;
  if (!bundle || typeof bundle !== 'object') {
    return fail(bundlePath, 'evidence bundle malformed: expected a top-level evidence_bundle: map');
  }
  const items = Array.isArray(bundle.items) ? bundle.items : null;
  if (!items) {
    return fail(bundlePath, 'evidence bundle malformed: evidence_bundle.items must be a list');
  }
  // An empty bundle proves nothing — reject it rather than passing zero checks
  // (security HIGH: trivially-satisfiable gate).
  if (items.length === 0) {
    return fail(bundlePath, 'evidence bundle declares no items: an empty bundle cannot satisfy the gate. Declare the file paths, test commands, and citations that prove the work.');
  }

  // Schema pre-pass: every item names a known kind + a stable id.
  for (let n = 0; n < items.length; n++) {
    const it = items[n];
    if (!it || typeof it !== 'object') return fail(bundlePath, `items[${n}] is not a map`);
    if (!EVIDENCE_KINDS.includes(it.kind)) {
      return fail(bundlePath, `items[${n}].kind ${JSON.stringify(it.kind)} not in {${EVIDENCE_KINDS.join(', ')}}`);
    }
  }

  // Anti-green-check-theater (security HIGH): a story/bug-fix bundle whose only
  // item is `file-exists: [swarm.yaml]` replays clean but proves nothing about
  // the diff. Require at least one re-executed test-run/command item for these
  // classes (the hook sets requireExecutable; review-verdict tasks do not).
  if (requireExecutable) {
    const hasExec = items.some((it) => it.kind === 'test-run' || it.kind === 'command');
    if (!hasExec) {
      return fail(bundlePath, 'this task class requires at least one test-run/command evidence item (a re-executed test), not only static file/citation checks.');
    }
  }

  // Run in category-priority order (cheap existence pre-pass before any exec).
  const ordered = items
    .map((it, n) => ({ it, n }))
    .sort((a, b) => (KIND_PRIORITY[a.it.kind] - KIND_PRIORITY[b.it.kind]) || (a.n - b.n));

  const checks = [];
  let firstFailure = null;
  for (const { it } of ordered) {
    const r = runItemCheck(it, ctx);
    const id = it.id || `item-${it.kind}`;
    if (!r.ok) {
      checks.push({ id, kind: it.kind, result: 'fail', reason: r.reason });
      if (!firstFailure) firstFailure = { id, kind: it.kind, reason: r.reason };
    } else if (r.advisory) {
      checks.push({ id, kind: it.kind, result: 'advisory', reason: r.advisory });
    } else {
      checks.push({ id, kind: it.kind, result: 'pass' });
    }
  }

  // Review-verdict addendum: presence-only, ADVISORY (concreteness is Tier-1;
  // presence is gameable — §4.2 check 6). Never fails Tier-0.
  if (bundle.reviewer_addendum) {
    const fs2 = bundle.reviewer_addendum.failure_scenarios_attempted;
    if (!Array.isArray(fs2) || fs2.length === 0) {
      checks.push({ id: 'reviewer_addendum', kind: 'reviewer-addendum', result: 'advisory', reason: 'reviewer_addendum.failure_scenarios_attempted is empty (advisory lint — concreteness is the reviewer\'s Tier-1 job)' });
    } else {
      checks.push({ id: 'reviewer_addendum', kind: 'reviewer-addendum', result: 'pass' });
    }
  }

  return {
    ok: firstFailure === null,
    artifact: bundle.artifact || null,
    checks,
    firstFailure,
  };
}

function fail(bundlePath, reason) {
  return {
    ok: false,
    artifact: null,
    checks: [{ id: 'bundle', kind: 'bundle', result: 'fail', reason }],
    firstFailure: { id: 'bundle', kind: 'bundle', reason },
    error: reason,
  };
}

// ---------------------------------------------------------------------------
// CLI (the degradation path — reviewer/orchestrator run it directly, ADR-022)
// ---------------------------------------------------------------------------

function formatVerdict(verdict) {
  const lines = [];
  lines.push(verdict.ok ? 'REPLAY: PASS' : 'REPLAY: FAIL');
  if (verdict.artifact) lines.push(`  artifact: ${verdict.artifact}`);
  for (const c of verdict.checks) {
    const mark = c.result === 'fail' ? 'x' : (c.result === 'advisory' ? '!' : 'ok');
    lines.push(`  [${mark}] ${c.id} (${c.kind})${c.reason ? ' — ' + c.reason : ''}`);
  }
  return lines.join('\n');
}

function main(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'json') { flags.json = true; continue; }
      flags[camel(key)] = argv[++i];
    } else positionals.push(a);
  }
  const bundlePath = positionals[0];
  if (!bundlePath) {
    process.stderr.write('usage: replay-check.cjs <bundle.yaml> [--project-root <dir>] [--config <swarm.yaml>] [--json]\n');
    process.exit(2);
  }
  const projectRoot = path.resolve(flags.projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const swarmYaml = flags.config || path.join(projectRoot, 'swarm.yaml');
  const config = loadReplayConfig(swarmYaml);
  const verdict = evaluateBundle(bundlePath, { projectRoot, config });
  if (flags.json) process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
  else process.stdout.write(formatVerdict(verdict) + '\n');
  process.exit(verdict.ok ? 0 : 1);
}

module.exports = {
  DEFAULT_REPLAY_CONFIG,
  EVIDENCE_KINDS,
  parseYaml,
  loadReplayConfig,
  confinedResolve,
  tokenizeCommand,
  commandAllowed,
  checkFileExists,
  checkCommand,
  checkCitation,
  checkFixtureProvenance,
  runItemCheck,
  evaluateBundle,
  formatVerdict,
  main,
  // Claim decay + shared claims-table parser (Stream V)
  CLAIM_STATUSES,
  parseClaimsTable,
  extractCommit,
  extractPaths,
  checkClaimDecay,
};

function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`replay-check.cjs: ${e && e.message ? e.message : String(e)}\n`);
    process.exit(2);
  }
}
