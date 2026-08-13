export const meta = {
  name: 'smoke-test',
  description: 'Minimal named-workflow smoke test — one schema-validated agent node returning a sentinel.',
  phases: ['echo'],
};

// Confirms a NAMED workflow in `.claude/workflows/` actually runs, with a
// schema-validated agent() node. Only `export const meta` may be exported —
// the body below is wrapped by the runtime, so no second `export`.

const echoed = await agent({
  prompt: 'Return exactly this JSON object and nothing else: {"ok": true, "marker": "SMOKE-OK"}.',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
      marker: { type: 'string' },
    },
    required: ['ok', 'marker'],
  },
});

echoed;
// bmad-generated:40edd35f
