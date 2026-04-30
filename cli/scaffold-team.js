import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
  unlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';
import { loadSwarmConfig, loadYaml } from '../utils/config.js';
import { parseDomainMap } from '../utils/domain-map.js';

// `bmad-swarm scaffold-team` — read architecture.md's Domain Map and emit a
// matching swarm.yaml:team block. Default: print to stdout. With --write:
// backup-then-replace swarm.yaml per ADR-011's five safety rules
// (rolled .bak, refuse-on-conflict with diff, atomic-replace, round-trip
// validate, restore-from-bak on failure).

export function registerScaffoldTeamCommand(program) {
  program
    .command('scaffold-team')
    .description('Generate the swarm.yaml team: block from the architecture Domain Map')
    .option('--write', 'Inject the team: block into swarm.yaml (backs up first)')
    .option('--architecture <path>', 'Path to architecture.md (default: artifacts/design/architecture.md)')
    .option('--no-fallback', 'Set fallback.enabled to false (advanced; emits warning at validation time)')
    .addHelpText('after', `
Examples:
  $ bmad-swarm scaffold-team                    Print the team: block to stdout
  $ bmad-swarm scaffold-team --write            Back up swarm.yaml and inject the team: block
  $ bmad-swarm scaffold-team --no-fallback      Generate with fallback.enabled: false

Refuses with exit 1 when:
  - architecture.md is missing
  - no Domain Map heading found in architecture.md
  - Domain Map is malformed (line-numbered errors shown)
  - --write and swarm.yaml already has a team: block (prints diff)
  - --write and swarm.yaml is missing
  - --write post-write validation fails (restores from swarm.yaml.bak)
`)
    .action(async (options) => {
      try {
        await runScaffoldTeam(options);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Resolve paths, parse Domain Map, build the team block, then either
 * print or --write per ADR-011.
 *
 * @param {object} options
 * @param {boolean} [options.write]
 * @param {string} [options.architecture]
 * @param {boolean} [options.fallback] - commander negates --no-fallback to fallback:false
 * @param {object} [options._io] - test seam for stdout/stderr/exit injection
 * @param {string} [options._cwd] - test seam to override process.cwd()
 */
export async function runScaffoldTeam(options = {}) {
  const io = options._io || { log: console.log.bind(console), error: console.error.bind(console) };
  const fail = (msg) => { throw new ScaffoldError(msg); };
  const cwd = options._cwd || process.cwd();
  const swarmYamlPath = join(cwd, 'swarm.yaml');

  // Resolve architecture path: --architecture overrides; else read
  // output.artifacts_dir from swarm.yaml if it exists; else default ./artifacts.
  let archPath;
  if (options.architecture) {
    archPath = resolve(cwd, options.architecture);
  } else {
    let artifactsDir = './artifacts';
    if (existsSync(swarmYamlPath)) {
      try {
        const raw = loadYaml(swarmYamlPath);
        if (raw?.output?.artifacts_dir) artifactsDir = raw.output.artifacts_dir;
      } catch {
        // Ignore; we'll discover the bad swarm.yaml when --write tries to load it.
      }
    }
    archPath = resolve(cwd, artifactsDir, 'design', 'architecture.md');
  }

  // AC8: refuse if architecture is missing.
  if (!existsSync(archPath)) {
    fail(`architecture not found at ${archPath}\n  Hint: run /feature or /plan to produce one, or pass --architecture <path>`);
  }
  const archText = readFileSync(archPath, 'utf8');

  // Distinguish AC9 (no heading at all) from AC10 (heading present but the
  // table is malformed). findDomainMap returns found:false for BOTH cases
  // (per RT-1's "found requires ≥1 valid data row" choice), so we use a
  // direct heading-presence probe and route accordingly.
  const hasHeading = /^(##|###)\s+Domain Map\s*$/m.test(archText);
  if (!hasHeading) {
    fail(`no Domain Map found in ${archPath}\n  Hint: run /retrofit-team in Claude Code to add one, or hand-author a "## Domain Map" section per agents/architect.md`);
  }

  // AC10: refuse on parser errors (heading exists but table is malformed).
  const parsed = parseDomainMap(archText);
  if (parsed.errors.length > 0) {
    const head = parsed.errors.slice(0, 3).join('\n  - ');
    fail(`Domain Map in ${archPath} is malformed:\n  - ${head}`);
  }
  if (parsed.domains.length === 0) {
    fail(`Domain Map in ${archPath} has no rows; add at least one specialist row`);
  }

  // Build the team object. fallback.enabled defaults true; --no-fallback flips to false.
  const fallbackEnabled = options.fallback !== false;
  const team = {
    mode: 'fixed',
    specializations: parsed.domains.map(d => ({
      role: 'developer',
      domain: d.domain,
      description: d.description,
    })),
    fallback: { enabled: fallbackEnabled, role: 'developer' },
  };

  if (!options.write) {
    io.log(emitTeamBlockForPrint(team));
    return;
  }

  // --write path. AC11: refuse if swarm.yaml is missing.
  if (!existsSync(swarmYamlPath)) {
    fail(`no swarm.yaml found at ${swarmYamlPath}\n  Hint: run \`bmad-swarm init\` first`);
  }

  // Load + validate the existing swarm.yaml so we can detect a pre-existing
  // team block on a known-good baseline. If it doesn't even validate, we
  // surface the user's existing problem rather than silently writing over it.
  let existingConfig;
  try {
    existingConfig = loadSwarmConfig(swarmYamlPath);
  } catch (err) {
    fail(`swarm.yaml is invalid; fix it before running --write:\n  ${err.message}`);
  }

  // AC7: refuse if a meaningful team block already exists. The applyDefaults
  // pass synthesizes an empty team with mode:'dynamic' — that's not a
  // user-authored block. We refuse only when the RAW yaml already has a
  // team key with substantive content.
  const rawExisting = loadYaml(swarmYamlPath);
  if (rawExisting && rawExisting.team !== undefined) {
    const existingBlock = yaml.dump({ team: rawExisting.team }, { lineWidth: 120, noRefs: true });
    const proposedBlock = yaml.dump({ team }, { lineWidth: 120, noRefs: true });
    const diffText = unifiedDiff(existingBlock, proposedBlock, 'existing', 'proposed');
    io.error('swarm.yaml already has a team: block. Refusing to overwrite.');
    io.error('Diff (existing -> proposed):');
    io.error(diffText);
    io.error('Resolve manually: edit swarm.yaml, or `git checkout swarm.yaml` then re-run --write.');
    fail('swarm.yaml already has a team: block');
  }

  // ADR-011 rule 1: rolled .bak before mutation.
  const bakPath = swarmYamlPath + '.bak';
  copyFileSync(swarmYamlPath, bakPath);

  // ADR-011 rule 4: atomic-replace via .tmp + fsync + rename. Re-emit the
  // entire document with the new team key set; js-yaml chooses key ordering
  // (D-021 — comments and key positioning are not preserved; the .bak retains
  // the original).
  const newDoc = { ...rawExisting, team };
  // _emitOverride is a test seam (see test/scaffold-team.test.js AC12) that
  // lets a test inject a known-invalid emitted document so the
  // restore-from-bak branch can be exercised directly.
  const newText = options._emitOverride
    ? options._emitOverride(newDoc)
    : yaml.dump(newDoc, { lineWidth: 120, noRefs: true });
  const tmpPath = swarmYamlPath + '.tmp';
  atomicWrite(tmpPath, swarmYamlPath, newText);

  // ADR-011 rule 3: round-trip validate. On failure, restore from .bak.
  try {
    loadSwarmConfig(swarmYamlPath);
  } catch (err) {
    copyFileSync(bakPath, swarmYamlPath);
    io.error(`Post-write validation failed: ${err.message}`);
    io.error(`Restored swarm.yaml from ${bakPath}`);
    fail('post-write validation failed; restored from swarm.yaml.bak');
  }

  io.log(`Wrote ${parsed.domains.length} specialization${parsed.domains.length === 1 ? '' : 's'} to ${swarmYamlPath}`);
  io.log(`Backup: ${bakPath}`);
  io.log('Next: review the diff (git diff swarm.yaml), then run `bmad-swarm validate` and `bmad-swarm update`.');
}

class ScaffoldError extends Error {}

/**
 * Build the print-path output: `team:` block plus the commented `# model:`
 * line under each specialization (cannot be done via yaml.dump — js-yaml
 * doesn't emit comments) plus the trailing reviewer hint.
 */
function emitTeamBlockForPrint(team) {
  // Use yaml.dump for the body; post-process to inject a commented model line
  // after each `domain:` line per Story Subtask 1.4.
  const dumped = yaml.dump({ team }, { lineWidth: 120, noRefs: true });
  const lines = dumped.split('\n');
  const out = [];
  for (const line of lines) {
    out.push(line);
    const m = line.match(/^(\s*)domain:\s/);
    if (m) {
      out.push(`${m[1]}# model: opus  # uncomment to override defaults.model`);
    }
  }
  // Trailing reviewer hint — print path only, NOT --write (per Story Dev Notes).
  out.push('');
  out.push('  # To add per-domain reviewer specialization, append entries with:');
  out.push('  #   - role: reviewer');
  out.push('  #     domain: <one of the above>');
  return out.join('\n');
}

/**
 * Atomic-replace write per ADR-011 rule 4. Writes content to tmpPath,
 * fsyncs the file, then renames over finalPath. The rename is atomic on
 * POSIX same-volume; on Windows same-volume, rename is also atomic.
 */
function atomicWrite(tmpPath, finalPath, content) {
  // Clean up any prior .tmp from a previous interrupted run.
  try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
  writeFileSync(tmpPath, content, 'utf8');
  // fsync the file contents to disk before rename so a power-loss between
  // rename and disk-flush still gives us a non-empty file.
  const fd = openSync(tmpPath, 'r+');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmpPath, finalPath);
}

/**
 * Minimal line-based unified-style diff (D-020). LCS via dynamic programming;
 * emits a single `--- a` / `+++ b` block with `+` / `-` / ` ` lines. Not
 * pixel-perfect — meant for human eyeballs (AC7).
 */
export function unifiedDiff(aText, bText, aLabel, bLabel) {
  const a = aText.split('\n');
  const b = bText.split('\n');
  const lcs = buildLcsTable(a, b);
  const diff = [];
  walkDiff(lcs, a, b, a.length, b.length, diff);
  const header = `--- ${aLabel}\n+++ ${bLabel}\n`;
  return header + diff.join('\n');
}

function buildLcsTable(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function walkDiff(dp, a, b, iStart, jStart, out) {
  // Iterative backwalk: collect markers in reverse, then push in order.
  const reversed = [];
  let i = iStart, j = jStart;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      reversed.push(' ' + a[i - 1]);
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversed.push('+' + b[j - 1]);
      j--;
    } else {
      reversed.push('-' + a[i - 1]);
      i--;
    }
  }
  for (let k = reversed.length - 1; k >= 0; k--) out.push(reversed[k]);
}
