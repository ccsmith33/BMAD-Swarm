import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEnvelope, serializeRecord, TRANSITIONS, INITIAL_STATUS,
  statusVocab, EVIDENCE_STATUS, TYPES, nextId,
} from '../utils/record-envelope.js';

// Unit tests for the record envelope schema (ADR-021 §1/§2). No files, no
// child processes — pure validation + serialization + the state-machine data.

function wellFormedF() {
  return {
    id: 'F-1',
    type: 'finding',
    status: 'open',
    fingerprint: 'some-finding',
    title: 'a finding',
    provenance: { role: 'reviewer', project: 'bmad-swarm', date: '2026-08-13', occurrences: [] },
    evidence: [{ kind: 'citation', status: 'cited', ref: 'artifacts/reviews/x.md:47' }],
    links: { d_ids: ['D-036'] },
    body: 'One-paragraph detection heuristic.',
  };
}

describe('record-envelope: validation', () => {
  it('accepts a well-formed record', () => {
    assert.deepEqual(validateEnvelope(wellFormedF()), []);
  });

  it('rejects an unknown type', () => {
    const r = wellFormedF(); r.type = 'quux';
    assert.ok(validateEnvelope(r).some((e) => /type must be one of/.test(e)));
  });

  it('rejects a malformed id', () => {
    const r = wellFormedF(); r.id = 'finding-1';
    assert.ok(validateEnvelope(r).some((e) => /id must match/.test(e)));
  });

  it('rejects an id whose prefix disagrees with the type', () => {
    const r = wellFormedF(); r.id = 'D-1';
    assert.ok(validateEnvelope(r).some((e) => /id prefix/.test(e)));
  });

  it('rejects a status outside the type vocabulary', () => {
    const r = wellFormedF(); r.status = 'promoted';
    assert.ok(validateEnvelope(r).some((e) => /not in F vocabulary/.test(e)));
  });

  it('requires fingerprint on L and F records', () => {
    for (const [type, id] of [['lesson', 'L-1'], ['finding', 'F-1']]) {
      const r = wellFormedF(); r.type = type; r.id = id; r.status = INITIAL_STATUS[id[0]];
      delete r.fingerprint;
      assert.ok(validateEnvelope(r).some((e) => /fingerprint is REQUIRED/.test(e)), `${type} needs fingerprint`);
    }
  });

  it('does NOT require fingerprint on D/R/C records', () => {
    const r = {
      id: 'R-1', type: 'recommendation', status: 'open',
      provenance: { role: 'ideator', project: 'p', date: '2026-08-13', occurrences: [] },
      links: {}, evidence: [], body: 'a rec',
    };
    assert.deepEqual(validateEnvelope(r), []);
  });

  it('requires reopen_trigger on a rejected R', () => {
    const r = {
      id: 'R-1', type: 'recommendation', status: 'rejected',
      provenance: { role: 'ideator', project: 'p', date: '2026-08-13', occurrences: [] },
      links: {}, evidence: [], body: 'a rejected rec',
    };
    assert.ok(validateEnvelope(r).some((e) => /reopen_trigger is REQUIRED/.test(e)));
    r.links.reopen_trigger = 'if X regresses';
    assert.deepEqual(validateEnvelope(r), []);
  });

  it('requires provenance fields', () => {
    const r = wellFormedF(); delete r.provenance;
    assert.ok(validateEnvelope(r).some((e) => /provenance is required/.test(e)));
  });

  it('requires a non-empty body', () => {
    const r = wellFormedF(); r.body = '   ';
    assert.ok(validateEnvelope(r).some((e) => /body must be a non-empty string/.test(e)));
  });

  it('rejects an evidence item with an unknown kind or status', () => {
    const r = wellFormedF(); r.evidence = [{ kind: 'vibes', status: 'believed' }];
    const errs = validateEnvelope(r);
    assert.ok(errs.some((e) => /kind .* not in/.test(e)));
    assert.ok(errs.some((e) => /status .* not in/.test(e)));
  });

  it('requires fixture-provenance to declare exactly one of captured_from / synthetic', () => {
    const base = wellFormedF();
    const neither = { ...base, evidence: [{ kind: 'fixture-provenance', status: 'attested', fixture: 'x.json' }] };
    assert.ok(validateEnvelope(neither).some((e) => /EXACTLY ONE of captured_from/.test(e)));
    const both = { ...base, evidence: [{ kind: 'fixture-provenance', status: 'attested', captured_from: 'run', synthetic: true }] };
    assert.ok(validateEnvelope(both).some((e) => /EXACTLY ONE of captured_from/.test(e)));
    const captured = { ...base, evidence: [{ kind: 'fixture-provenance', status: 'checked', captured_from: 'run-2026' }] };
    assert.deepEqual(validateEnvelope(captured), []);
    const synthetic = { ...base, evidence: [{ kind: 'fixture-provenance', status: 'attested', synthetic: true }] };
    assert.deepEqual(validateEnvelope(synthetic), []);
  });
});

describe('record-envelope: state machine', () => {
  it('has a ladder for every type', () => {
    for (const t of TYPES) assert.ok(TRANSITIONS[t], `TRANSITIONS.${t}`);
  });

  it('D ladder is proposed -> accepted -> verified | superseded', () => {
    assert.deepEqual(TRANSITIONS.D.proposed.sort(), ['accepted', 'superseded']);
    assert.deepEqual(TRANSITIONS.D.accepted.sort(), ['superseded', 'verified']);
    assert.deepEqual(TRANSITIONS.D.superseded, []);
  });

  it('L ladder gates at promoted (only from candidate) and terminal-ish at retired', () => {
    assert.ok(TRANSITIONS.L.candidate.includes('promoted'));
    // promoted is reachable ONLY from candidate
    for (const [from, tos] of Object.entries(TRANSITIONS.L)) {
      if (from !== 'candidate') assert.ok(!tos.includes('promoted'), `${from} must not reach promoted`);
    }
  });

  it('C statuses use the single evidence vocabulary (no promotion ladder)', () => {
    for (const s of EVIDENCE_STATUS) assert.ok(statusVocab('C').includes(s), `C vocab has ${s}`);
  });

  it('the evidence vocabulary is exactly checked|cited|attested|assumed', () => {
    assert.deepEqual([...EVIDENCE_STATUS].sort(), ['assumed', 'attested', 'checked', 'cited']);
  });
});

describe('record-envelope: serialization', () => {
  it('emits a fenced record whose first key is record: (parser contract)', () => {
    const out = serializeRecord(wellFormedF());
    assert.match(out, /^## F-1 — a finding$/m);
    assert.match(out, /```yaml\nrecord:/);
    assert.match(out, /^body: \|$/m);
    // status appears exactly once as a top-level key line
    const topLevelStatus = out.match(/^\s{2}status:/gm) || [];
    assert.equal(topLevelStatus.length, 1);
  });

  it('quotes scalars that contain YAML indicators (a citation ref with a colon)', () => {
    const out = serializeRecord(wellFormedF());
    assert.match(out, /ref: "artifacts\/reviews\/x\.md:47"/);
  });

  it('nextId allocates monotonically per type', () => {
    const content = '## F-3 —\n  id: F-3\n## F-7 —\n  id: F-7\n## L-1 —\n  id: L-1\n';
    assert.equal(nextId(content, 'F'), 'F-8');
    assert.equal(nextId(content, 'L'), 'L-2');
    assert.equal(nextId(content, 'C'), 'C-1');
  });
});
