// utils/record-envelope.js — the ESM face of the unified record envelope.
//
// The AUTHORITATIVE, self-contained implementation is bin/record.cjs (it must
// ship verbatim into user projects at .claude/bmad/bin/record.cjs, where this
// package's utils/ do not exist). This module re-exports its pure schema
// functions so package-side ESM code — the replay gate (T3), the migration
// script, cli/validate.js — imports one source of truth instead of duplicating
// the state machine (the ADR-021 "one envelope" guarantee, D-036).
//
// Node imports a CJS module's module.exports as the default export; we bind the
// named surface off it so callers can `import { validateEnvelope } from …`.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const record = require('../bin/record.cjs');

export const {
  TYPES,
  TYPE_NAME,
  NAME_TYPE,
  EVIDENCE_STATUS,
  EVIDENCE_KINDS,
  TRANSITIONS,
  INITIAL_STATUS,
  statusVocab,
  validateEnvelope,
  validateEvidenceItem,
  serializeRecord,
  emitFlow,
  emitScalar,
  nextId,
  sectionBounds,
  currentStatus,
  editRecordStatus,
  LEDGER_HEADER,
} = record;

export default record;
