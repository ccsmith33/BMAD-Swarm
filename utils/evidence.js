// utils/evidence.js — the ESM face of the Tier-0 replay evidence engine.
//
// The AUTHORITATIVE, self-contained implementation is bin/replay-check.cjs (it
// must ship verbatim into user projects at .claude/bmad/bin/replay-check.cjs,
// where this package's utils/ and node_modules — js-yaml — do not exist). This
// module re-exports its pure functions so package-side ESM code (tests, cli
// checks, any future reviewer tooling) imports ONE engine instead of a mirror.
// This is the same single-sourcing pattern T2 used for utils/record-envelope.js
// over bin/record.cjs (ADR-021 / D-036), applied to ADR-022's replay gate: the
// hook (generators/hooks/replay-gate.cjs.src) requires the same shipped script,
// so the blocking gate and the degradation CLI produce byte-identical verdicts.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../bin/replay-check.cjs');

export const {
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
} = engine;

export default engine;
