// utils/reconcile.js — the ESM face of task-ledger reconciliation
// (ADR-018 §2 / RES-2/RES-4/RES-5; phase2 design §4.3).
//
// The AUTHORITATIVE implementation is bin/record.cjs (it must ship verbatim into
// user projects at .claude/bmad/bin/record.cjs, where this package's utils/ do
// not exist, and the `record.cjs reconcile` CLI subcommand runs from there under
// the warm boot). This module re-exports its pure functions so package-side ESM
// code imports one source of truth instead of duplicating the diff logic — the
// same split used by utils/record-envelope.js (D-036 "one source of truth").
//
// CAVEAT FOR CALLERS (verified live, spike-posttooluse-2026-08-13 §1/§4):
// reconcile() consumes the TaskList tool's output, NOT TaskGet's. TaskList
// returns `owner` on every task; TaskGet DROPS `owner` from its response even
// right after a TaskUpdate set it. reconcile()'s signature takes taskListJson for
// exactly this reason — do not switch it to per-task TaskGet lookups or `owner`
// silently becomes undefined and the not-yet-woken / dead-owner classification
// breaks.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const record = require('../bin/record.cjs');

/**
 * @param {object|Array} taskListJson  TaskList tool output (has `owner`; TaskGet does not).
 * @param {string[]} ledgerLines       task-ledger.md lines.
 * @param {object} brainFrontmatter    project-brain.md frontmatter (phase/gates/checkpoint).
 * @param {object} [opts]              { now?: Date|number, stuckThresholdMinutes?: number }
 * @returns {{rewake: object[], stuck: object[], awaitingHuman: object[], orphans: object[], staleness: object}}
 */
export const reconcile = record.reconcile;
export const parseTaskLedgerLine = record.parseTaskLedgerLine;
export const parseFrontmatterLite = record.parseFrontmatterLite;
export const formatReconcile = record.formatReconcile;

export default record.reconcile;
