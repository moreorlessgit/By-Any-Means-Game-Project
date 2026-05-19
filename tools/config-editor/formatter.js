// formatter.js — emit JS source matching config.js style.
//
// Output rules:
//   • 2-space indent
//   • single-quoted strings
//   • trailing commas on multi-line objects/arrays
//   • unquoted keys when they're valid identifiers
//   • `null` / `true` / `false` / `Infinity` rendered as literals
//   • numbers preserved as written (no float drift)
//   • objects in a `compact:true` schema render on one line
//   • field order follows the schema's `fields` declaration
//
// The formatter is schema-aware so it can lock key order and apply per-field
// compactness, but it falls back to "format any JS value" for nested data
// that isn't covered by an explicit schema (e.g. mission requirement slots).

const Fmt = (() => {

  const INDENT = '  ';

  // ── Identifier check for unquoted keys ───────────────────────────────────
  // Matches JS identifiers AND reserves keywords as fine for property names.
  function isValidIdent(s) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
  }

  function renderKey(k) {
    return isValidIdent(k) ? k : quote(k);
  }

  function quote(s) {
    // Single-quoted, escape backslash, single quote, and newline.
    return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  }

  // ── Scalar renderer ──────────────────────────────────────────────────────
  function renderScalar(v) {
    if (v === null)      return 'null';
    if (v === undefined) return 'undefined';
    if (v === Infinity)  return 'Infinity';
    if (v === -Infinity) return '-Infinity';
    if (typeof v === 'number') {
      if (Number.isNaN(v)) return 'NaN';
      return String(v);
    }
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string')  return quote(v);
    return 'null'; // unknown — safe fallback
  }

  // ── Schema-free formatter for arbitrary JS values ────────────────────────
  // Used for nested data that schemas don't cover (or for output preview when
  // schema info isn't around). Mirrors the config style.
  function formatValue(v, indent = 0, opts = {}) {
    const pad = INDENT.repeat(indent);
    const padIn = INDENT.repeat(indent + 1);

    if (v === null || typeof v !== 'object') return renderScalar(v);

    if (Array.isArray(v)) {
      if (v.length === 0) return '[]';
      // Inline arrays of scalars (most readable for tags, name pools, etc.)
      const allScalar = v.every(x => x === null || typeof x !== 'object');
      if (allScalar && opts.inlineScalarArrays !== false) {
        const inline = v.map(renderScalar).join(', ');
        // If short enough, one line; otherwise wrap.
        if (inline.length < 80) return '[' + inline + ']';
      }
      const lines = v.map(x => padIn + formatValue(x, indent + 1, opts));
      return '[\n' + lines.join(',\n') + '\n' + pad + ']';
    }

    // Plain object
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    if (opts.compact) {
      const parts = keys.map(k => renderKey(k) + ':' + formatValue(v[k], 0, { ...opts, compact:false }));
      return '{ ' + parts.join(', ') + ' }';
    }
    const lines = keys.map(k =>
      padIn + renderKey(k) + ': ' + formatValue(v[k], indent + 1, opts)
    );
    return '{\n' + lines.join(',\n') + '\n' + pad + '}';
  }

  // ── Schema-aware object formatter ────────────────────────────────────────
  // Renders an object's keys in the order declared by `schema.fields`,
  // omitting unset optional fields, and honoring per-field compactness.
  function formatBySchema(value, schema, indent = 0, opts = {}) {
    const pad = INDENT.repeat(indent);
    const padIn = INDENT.repeat(indent + 1);
    if (value === null || typeof value !== 'object') return renderScalar(value);

    const fields = schema && schema.fields ? schema.fields : null;
    if (!fields) return formatValue(value, indent, opts);

    // Build ordered list of (key, val, fieldDef) tuples.
    const pairs = [];
    const seen = new Set();
    for (const f of fields) {
      if (!(f.key in value)) continue;
      const v = value[f.key];
      // Skip empty optionals if explicitly flagged
      if (f.omitWhenEmpty) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (typeof v === 'string' && v === '') continue;
      }
      // Skip optional undefined
      if (v === undefined) continue;
      pairs.push([f.key, v, f]);
      seen.add(f.key);
    }
    // Append any extra keys not in the schema (defensive — preserve user data)
    for (const k of Object.keys(value)) {
      if (!seen.has(k) && value[k] !== undefined) pairs.push([k, value[k], null]);
    }

    if (pairs.length === 0) return '{}';

    // Compact (single-line) emission, e.g. cert entries
    if (opts.compact || schema.compact) {
      const parts = pairs.map(([k, v, f]) => {
        const rendered = renderFieldValue(v, f, 0, { ...opts, compact: true });
        return renderKey(k) + ': ' + rendered;
      });
      return '{ ' + parts.join(', ') + ' }';
    }

    const lines = pairs.map(([k, v, f]) => {
      const rendered = renderFieldValue(v, f, indent + 1, opts);
      return padIn + renderKey(k) + ': ' + rendered;
    });
    return '{\n' + lines.join(',\n') + '\n' + pad + '}';
  }

  // ── Render a value with field-level hints ────────────────────────────────
  function renderFieldValue(v, fieldDef, indent, opts) {
    if (!fieldDef) return formatValue(v, indent, opts);

    // null is a valid value for nullable fields (e.g. mission chargeTiers).
    // Render the literal rather than collapsing to {} or [].
    if (v === null) return 'null';

    // Nested object with itemSchema → format by that schema.
    if (fieldDef.type === 'object' && fieldDef.itemSchema) {
      return formatBySchema(v, fieldDef.itemSchema, indent, opts);
    }
    // Array of objects with itemSchema → element-by-element schema format.
    if (fieldDef.type === 'arrayOf' && fieldDef.itemSchema) {
      if (!Array.isArray(v) || v.length === 0) return '[]';
      const pad = INDENT.repeat(indent);
      const padIn = INDENT.repeat(indent + 1);
      const itemOpts = { ...opts, compact: fieldDef.itemSchema.compact };
      const lines = v.map(item =>
        padIn + formatBySchema(item, fieldDef.itemSchema, indent + 1, itemOpts)
      );
      return '[\n' + lines.join(',\n') + '\n' + pad + ']';
    }
    // KeyedDict at field level (rare — e.g. economy.stationCost)
    if (fieldDef.type === 'keyedDict' && fieldDef.valueSchema) {
      if (!v || typeof v !== 'object') return '{}';
      const keys = Object.keys(v);
      if (keys.length === 0) return '{}';
      const pad = INDENT.repeat(indent);
      const padIn = INDENT.repeat(indent + 1);
      const lines = keys.map(k => {
        const child = formatBySchema(v[k], fieldDef.valueSchema, indent + 1, opts);
        return padIn + renderKey(k) + ': ' + child;
      });
      return '{\n' + lines.join(',\n') + '\n' + pad + '}';
    }
    // Default: schemaless format
    return formatValue(v, indent, opts);
  }

  // ── Top-level renderers used by app.js ───────────────────────────────────

  // Render a single entry from a keyedDict section.
  // Returns: `engineKey: { ... },`  (with trailing comma so it pastes cleanly)
  function renderEntry(key, value, sectionSchema) {
    const body = formatBySchema(value, sectionSchema, 0, { compact: sectionSchema.compact });
    return renderKey(key) + ': ' + body + ',';
  }

  // Render an entire keyed-dict section block.
  // Returns: `unitTypes: { ...entries... },`
  function renderKeyedDictBlock(sectionKey, sectionData, sectionSchema) {
    const keys = Object.keys(sectionData);
    if (keys.length === 0) {
      return renderKey(sectionKey) + ': {},';
    }
    const padIn = INDENT;
    const lines = keys.map(k => {
      const body = formatBySchema(sectionData[k], sectionSchema, 1, { compact: sectionSchema.compact });
      return padIn + renderKey(k) + ': ' + body;
    });
    return renderKey(sectionKey) + ': {\n' + lines.join(',\n') + '\n},';
  }

  // Render an array-of-objects section (e.g. shiftTemplates).
  function renderObjectArrayBlock(sectionKey, sectionData, sectionSchema) {
    if (!Array.isArray(sectionData) || sectionData.length === 0) {
      return renderKey(sectionKey) + ': [],';
    }
    const padIn = INDENT;
    const lines = sectionData.map(item =>
      padIn + formatBySchema(item, sectionSchema, 1, { compact: sectionSchema.compact })
    );
    return renderKey(sectionKey) + ': [\n' + lines.join(',\n') + '\n],';
  }

  // Render a single-object section (e.g. economy, ui).
  function renderSingleObjectBlock(sectionKey, sectionData, sectionSchema) {
    const body = formatBySchema(sectionData, sectionSchema, 0, {});
    return renderKey(sectionKey) + ': ' + body + ',';
  }

  // Render an array entry inside an objectArray section (one item).
  function renderArrayItem(item, sectionSchema) {
    return formatBySchema(item, sectionSchema, 0, { compact: sectionSchema.compact }) + ',';
  }

  return {
    formatValue,
    formatBySchema,
    renderEntry,
    renderKeyedDictBlock,
    renderObjectArrayBlock,
    renderSingleObjectBlock,
    renderArrayItem,
    renderScalar,
    renderKey,
  };

})();
