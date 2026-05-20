// app.js — orchestrator. Boots the editor, wires the UI, and pushes output.
//
// Lifecycle:
//   1. Read window.BAM_CONFIG (loaded from ../../config.js).
//   2. Deep-clone into `state.draft` — all edits happen on the draft.
//   3. Build the tab bar from Schemas.SECTIONS.
//   4. On tab/entry change, render the form via Widgets and the snippet via Fmt.
//   5. Copy button copies the snippet; user pastes back into config.js.

const App = (() => {

  const state = {
    draft:       null,      // deep clone of BAM_CONFIG (mutated by widgets)
    activeTab:   null,      // section key, e.g. 'unitTypes'
    activeEntry: null,      // entry key (keyedDict) or numeric index (objectArray)
    issues:      [],        // validator output for current entry
    outputMode:  'entry',   // 'entry' | 'block'
  };

  // ── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    if (typeof BAM_CONFIG === 'undefined' || !BAM_CONFIG) {
      setStatus('ERROR: could not load BAM_CONFIG. Open this page through Live Server or check path to config.js.', true);
      return;
    }
    state.draft = deepClone(BAM_CONFIG);
    setStatus('loaded · ' + Object.keys(state.draft).length + ' top-level keys');

    buildTabs();
    wireGlobalControls();

    // Default to the first section
    const firstTab = Object.keys(Schemas.SECTIONS)[0];
    activateTab(firstTab);
  }

  // ── Tab bar ──────────────────────────────────────────────────────────────
  function buildTabs() {
    const tabsEl = document.getElementById('tabs');
    tabsEl.innerHTML = '';
    for (const [key, schema] of Object.entries(Schemas.SECTIONS)) {
      const btn = document.createElement('button');
      // Label first, then the dirty marker (added/removed by updateDirtyMarkers)
      const labelSpan = document.createElement('span');
      labelSpan.textContent = schema.label || key;
      btn.appendChild(labelSpan);
      btn.dataset.tab = key;
      btn.addEventListener('click', () => activateTab(key));
      tabsEl.appendChild(btn);
    }
    updateDirtyMarkers();
  }

  function activateTab(key) {
    state.activeTab = key;
    state.activeEntry = null;
    // Visual active state
    for (const btn of document.querySelectorAll('#tabs button')) {
      btn.classList.toggle('active', btn.dataset.tab === key);
    }
    renderEntryList();
    renderForm();
    renderOutput();
  }

  // ── Dirty-state detection ────────────────────────────────────────────────
  // Compares state.draft against the live BAM_CONFIG to flag entries/tabs
  // the user has edited but not yet pasted back into config.js.
  function isEntryDirty(sectionKey, entryKey) {
    const schema = Schemas.SECTIONS[sectionKey];
    if (!schema) return false;
    if (schema.kind === 'syntheticScalars') {
      return stableStringify(state.draft[entryKey]) !== stableStringify(BAM_CONFIG[entryKey]);
    }
    if (schema.kind === 'singleObject') {
      return stableStringify(getAtPath(state.draft, schema.configPath)) !==
             stableStringify(getAtPath(BAM_CONFIG, schema.configPath));
    }
    const draftData = getAtPath(state.draft, schema.configPath);
    const liveData = getAtPath(BAM_CONFIG, schema.configPath);
    if (schema.kind === 'keyedDict') {
      const a = draftData ? draftData[entryKey] : undefined;
      const b = liveData ? liveData[entryKey] : undefined;
      return stableStringify(a) !== stableStringify(b);
    }
    if (schema.kind === 'objectArray') {
      const a = draftData ? draftData[entryKey] : undefined;
      const b = liveData ? liveData[entryKey] : undefined;
      return stableStringify(a) !== stableStringify(b);
    }
    return false;
  }

  function isTabDirty(sectionKey) {
    const schema = Schemas.SECTIONS[sectionKey];
    if (!schema) return false;
    if (schema.kind === 'syntheticScalars') {
      return schema.scalars.some(s =>
        stableStringify(state.draft[s.path]) !== stableStringify(BAM_CONFIG[s.path]));
    }
    if (schema.kind === 'singleObject' || schema.kind === 'objectArray') {
      return stableStringify(getAtPath(state.draft, schema.configPath)) !==
             stableStringify(getAtPath(BAM_CONFIG, schema.configPath));
    }
    if (schema.kind === 'keyedDict') {
      const draftData = getAtPath(state.draft, schema.configPath) || {};
      const liveData = getAtPath(BAM_CONFIG, schema.configPath) || {};
      const draftKeys = Object.keys(draftData);
      const liveKeys = Object.keys(liveData);
      if (draftKeys.length !== liveKeys.length) return true;
      // Set membership differs OR any entry differs
      for (const k of draftKeys) {
        if (!(k in liveData)) return true;
        if (stableStringify(draftData[k]) !== stableStringify(liveData[k])) return true;
      }
      return false;
    }
    return false;
  }

  // Stringify with sorted object keys so two equivalent objects compare equal
  // regardless of property insertion order.
  function stableStringify(v) {
    return JSON.stringify(v, function (k, val) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const sorted = {};
        for (const key of Object.keys(val).sort()) sorted[key] = val[key];
        return sorted;
      }
      return val;
    });
  }

  // Apply dirty dots to tab buttons, entry list rows, and the global pill.
  // Called from ctx.onChange and after structural changes.
  function updateDirtyMarkers() {
    let totalDirtyTabs = 0;

    // Tabs
    for (const btn of document.querySelectorAll('#tabs button')) {
      const dirty = isTabDirty(btn.dataset.tab);
      btn.classList.toggle('dirty', dirty);
      // Re-create the dot span so we don't accumulate them
      const existingDot = btn.querySelector('.dirty-dot');
      if (existingDot) existingDot.remove();
      if (dirty) {
        const dot = document.createElement('span');
        dot.className = 'dirty-dot';
        dot.title = 'Unsaved changes — copy + paste into config.js';
        btn.appendChild(dot);
        totalDirtyTabs++;
      }
    }

    // Entry list rows
    for (const li of document.querySelectorAll('#entries li[data-key]')) {
      const dirty = isEntryDirty(state.activeTab, li.dataset.key);
      li.classList.toggle('dirty', dirty);
    }

    // Global pill in the top bar
    const pill = document.getElementById('unsavedPill');
    if (pill) {
      if (totalDirtyTabs > 0) {
        pill.textContent = '● Unsaved changes in ' + totalDirtyTabs + ' tab' + (totalDirtyTabs === 1 ? '' : 's');
        pill.classList.add('show');
      } else {
        pill.classList.remove('show');
      }
    }
  }

  // ── Entry list (left rail) ───────────────────────────────────────────────
  function renderEntryList() {
    const schema = Schemas.SECTIONS[state.activeTab];
    const list = document.getElementById('entries');
    const search = document.getElementById('entrySearch');
    const newBtn = document.getElementById('btnNew');
    const dupBtn = document.getElementById('btnDuplicate');
    const delBtn = document.getElementById('btnDelete');
    list.innerHTML = '';

    if (!schema) return;

    if (schema.kind === 'singleObject') {
      // No list — single object. Auto-select.
      newBtn.disabled = true;
      dupBtn.disabled = true;
      delBtn.disabled = true;
      search.disabled = true;
      const li = document.createElement('li');
      li.className = 'selected';
      li.innerHTML = '<span class="entry-key">' + (schema.label || state.activeTab) + '</span>';
      list.appendChild(li);
      state.activeEntry = '__single__';
      return;
    }

    if (schema.kind === 'syntheticScalars') {
      // Special: one row per scalar, no edit ops
      newBtn.disabled = true;
      dupBtn.disabled = true;
      delBtn.disabled = true;
      search.disabled = false;
      const q = (search.value || '').toLowerCase();
      for (const item of schema.scalars) {
        if (q && !item.path.toLowerCase().includes(q)) continue;
        const li = document.createElement('li');
        li.dataset.key = item.path;
        if (item.path === state.activeEntry) li.classList.add('selected');
        li.innerHTML = '<span class="entry-key">' + item.path + '</span>';
        li.addEventListener('click', () => { state.activeEntry = item.path; renderEntryList(); renderForm(); renderOutput(); });
        list.appendChild(li);
      }
      if (!state.activeEntry && schema.scalars[0]) state.activeEntry = schema.scalars[0].path;
      return;
    }

    newBtn.disabled = false;
    dupBtn.disabled = !state.activeEntry;
    delBtn.disabled = !state.activeEntry;
    search.disabled = false;

    const q = (search.value || '').toLowerCase();

    if (schema.kind === 'keyedDict') {
      const data = getAtPath(state.draft, schema.configPath) || {};
      const keys = Object.keys(data).sort();
      // Optional grouping
      if (typeof schema.groupBy === 'function') {
        const groups = new Map();
        for (const k of keys) {
          if (q && !k.toLowerCase().includes(q) && !(data[k].label || '').toLowerCase().includes(q)) continue;
          const g = schema.groupBy(data[k], k) || 'Other';
          if (!groups.has(g)) groups.set(g, []);
          groups.get(g).push(k);
        }
        for (const [g, ks] of groups) {
          list.appendChild(buildGroupHeader(g));
          for (const k of ks) list.appendChild(buildEntryRow(k, data[k], schema));
        }
      } else {
        for (const k of keys) {
          if (q && !k.toLowerCase().includes(q) && !((data[k].label || '') + '').toLowerCase().includes(q)) continue;
          list.appendChild(buildEntryRow(k, data[k], schema));
        }
      }
      return;
    }

    if (schema.kind === 'objectArray') {
      const arr = getAtPath(state.draft, schema.configPath) || [];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const display = (schema.summary ? schema.summary(item, i) : (item[schema.keyField] || ('#' + i)));
        if (q && !String(display).toLowerCase().includes(q)) continue;
        const li = document.createElement('li');
        li.dataset.key = String(i);
        if (String(i) === String(state.activeEntry)) li.classList.add('selected');
        li.innerHTML = '<span class="entry-key">' + escapeHtml(String(display)) + '</span>';
        li.addEventListener('click', () => { state.activeEntry = i; renderEntryList(); renderForm(); renderOutput(); });
        list.appendChild(li);
      }
      return;
    }
  }

  function buildGroupHeader(label) {
    const li = document.createElement('li');
    li.className = 'group-header';
    li.textContent = label;
    return li;
  }

  function buildEntryRow(key, entry, schema) {
    const li = document.createElement('li');
    li.dataset.key = key;
    if (key === state.activeEntry) li.classList.add('selected');
    const display = schema.summary ? schema.summary(entry, key) : (entry.label || key);
    li.innerHTML = '<span class="entry-key">' + escapeHtml(String(display)) + '</span>'
                 + '<span class="entry-meta">' + escapeHtml(key) + '</span>';
    li.addEventListener('click', () => { state.activeEntry = key; renderEntryList(); renderForm(); renderOutput(); });
    return li;
  }

  // ── Form pane (center) ───────────────────────────────────────────────────
  function renderForm() {
    // Refresh dirty dots on every navigation. ctx.onChange handles in-flight
    // edits; this handles list/tab/entry switches.
    updateDirtyMarkers();
    const schema = Schemas.SECTIONS[state.activeTab];
    const titleEl = document.getElementById('formTitle');
    const bodyEl  = document.getElementById('formBody');
    bodyEl.innerHTML = '';

    if (!schema || state.activeEntry === null) {
      titleEl.textContent = 'Select an entry on the left';
      return;
    }

    const ctx = makeCtx();

    if (schema.kind === 'singleObject') {
      titleEl.textContent = schema.label || state.activeTab;
      const data = getAtPath(state.draft, schema.configPath) || {};
      // Ensure path exists
      ensurePath(state.draft, schema.configPath);
      for (const f of schema.fields) {
        const row = Widgets.renderField(f, data[f.key], data, ctx);
        if (row) bodyEl.appendChild(row);
      }
      runValidation(data, schema, ctx);
      return;
    }

    if (schema.kind === 'syntheticScalars') {
      const scalar = schema.scalars.find(s => s.path === state.activeEntry);
      if (!scalar) { titleEl.textContent = '—'; return; }
      titleEl.textContent = scalar.path;
      const value = state.draft[scalar.path];
      // Build a single field row backed directly by state.draft[scalar.path]
      const field = { ...scalar.field, key: scalar.path, hint: scalar.hint };
      const row = Widgets.renderField(field, value, state.draft, ctx);
      if (row) bodyEl.appendChild(row);
      return;
    }

    if (schema.kind === 'keyedDict') {
      const data = getAtPath(state.draft, schema.configPath) || {};
      let entry = data[state.activeEntry];
      if (!entry) { titleEl.textContent = '—'; return; }

      titleEl.textContent = state.activeEntry;

      // Handle rankConfig-style unwrap (array → { ranks: [...] } for editing)
      let editTarget = entry;
      let useUnwrap = false;
      if (typeof schema.unwrap === 'function' && Array.isArray(entry)) {
        editTarget = schema.unwrap(entry);
        useUnwrap = true;
      }

      // Provide key-rename input above the fields
      bodyEl.appendChild(buildKeyRenameRow(state.activeEntry, schema));

      for (const f of schema.fields) {
        const row = Widgets.renderField(f, editTarget[f.key], editTarget, {
          ...ctx,
          onChange: () => {
            if (useUnwrap) {
              data[state.activeEntry] = schema.wrap(editTarget);
            }
            ctx.onChange();
          }
        });
        if (row) bodyEl.appendChild(row);
      }

      runValidation(useUnwrap ? editTarget : entry, schema, ctx);
      return;
    }

    if (schema.kind === 'objectArray') {
      const arr = getAtPath(state.draft, schema.configPath) || [];
      const item = arr[state.activeEntry];
      if (!item) { titleEl.textContent = '—'; return; }
      titleEl.textContent = (schema.summary ? schema.summary(item, state.activeEntry) : ('#' + state.activeEntry));
      for (const f of schema.fields) {
        const row = Widgets.renderField(f, item[f.key], item, ctx);
        if (row) bodyEl.appendChild(row);
      }
      runValidation(item, schema, ctx);
    }
  }

  // ── Inline key rename for keyedDict entries ──────────────────────────────
  function buildKeyRenameRow(key, schema) {
    const row = document.createElement('div');
    row.className = 'field';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = '(key)';
    const ctl = document.createElement('div');
    ctl.className = 'field-control';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = key;
    input.addEventListener('change', () => {
      const newKey = input.value.trim();
      if (!newKey || newKey === key) { input.value = key; return; }
      const data = getAtPath(state.draft, schema.configPath) || {};
      if (newKey in data) {
        toast('Key "' + newKey + '" already exists', true);
        input.value = key;
        return;
      }
      // Reinsert with new key, preserving order
      const entries = Object.entries(data);
      const reordered = entries.map(([k, v]) => [k === key ? newKey : k, v]);
      const next = {};
      for (const [k, v] of reordered) next[k] = v;
      setAtPath(state.draft, schema.configPath, next);
      state.activeEntry = newKey;
      renderEntryList();
      renderForm();
      renderOutput();
    });
    ctl.appendChild(input);
    const hint = document.createElement('div');
    hint.className = 'field-hint';
    hint.textContent = 'Property key inside config.js. Affects how other code references this entry.';
    ctl.appendChild(hint);
    row.appendChild(label);
    row.appendChild(ctl);
    return row;
  }

  // ── Validation surface ───────────────────────────────────────────────────
  function runValidation(entry, schema, ctx) {
    state.issues = (schema.validate ? schema.validate(entry, ctx) : []) || [];
    // Attach inline warnings to matching field-controls.
    const bodyEl = document.getElementById('formBody');
    for (const issue of state.issues) {
      // Find the field control by matching the row's label text.
      const rows = bodyEl.querySelectorAll('.field');
      for (const row of rows) {
        const lbl = row.querySelector('.field-label');
        if (!lbl) continue;
        const labelText = lbl.firstChild ? lbl.firstChild.textContent : '';
        // Match exact, or "seats" matches "seats[*]"
        const base = issue.path.replace(/\[.*$/,'').replace(/\..*$/,'');
        if (labelText === issue.path || labelText === base) {
          const ctl = row.querySelector('.field-control');
          if (issue.level === 'error') ctl.classList.add('invalid');
          const msg = document.createElement('div');
          msg.className = issue.level === 'error' ? 'field-error' : 'field-warning';
          msg.textContent = issue.message;
          ctl.appendChild(msg);
          break;
        }
      }
    }
  }

  // ── Output (right pane) ──────────────────────────────────────────────────
  function renderOutput() {
    const schema = Schemas.SECTIONS[state.activeTab];
    const out = document.getElementById('output');
    if (!schema || state.activeEntry === null) { out.value = ''; return; }

    try {
      if (schema.kind === 'singleObject') {
        const data = getAtPath(state.draft, schema.configPath) || {};
        const sectionKey = schema.configPath;
        // Single-object sections only have a "block" mode (no per-entry).
        out.value = Fmt.renderSingleObjectBlock(sectionKey, data, schema);
        return;
      }

      if (schema.kind === 'syntheticScalars') {
        const scalar = schema.scalars.find(s => s.path === state.activeEntry);
        if (!scalar) { out.value = ''; return; }
        const v = state.draft[scalar.path];
        if (state.outputMode === 'block') {
          // Output ALL tuning scalars as a contiguous block.
          const lines = schema.scalars.map(s =>
            Fmt.renderKey(s.path) + ': ' + Fmt.formatValue(state.draft[s.path], 0) + ','
          );
          out.value = lines.join('\n');
        } else {
          out.value = Fmt.renderKey(scalar.path) + ': ' + Fmt.formatValue(v, 0) + ',';
        }
        return;
      }

      if (schema.kind === 'keyedDict') {
        const data = getAtPath(state.draft, schema.configPath) || {};
        if (state.outputMode === 'block') {
          out.value = Fmt.renderKeyedDictBlock(schema.configPath, data, schema);
        } else {
          const entry = data[state.activeEntry];
          if (entry === undefined) { out.value = ''; return; }
          // rankConfig-style: entry is an array
          if (typeof schema.unwrap === 'function' && Array.isArray(entry)) {
            out.value = Fmt.renderKey(state.activeEntry) + ': '
              + Fmt.formatValue(entry, 0, {})
              + ',';
            return;
          }
          out.value = Fmt.renderEntry(state.activeEntry, entry, schema);
        }
        return;
      }

      if (schema.kind === 'objectArray') {
        const arr = getAtPath(state.draft, schema.configPath) || [];
        if (state.outputMode === 'block') {
          out.value = Fmt.renderObjectArrayBlock(schema.configPath, arr, schema);
        } else {
          const item = arr[state.activeEntry];
          if (!item) { out.value = ''; return; }
          out.value = Fmt.renderArrayItem(item, schema);
        }
      }
    } catch (e) {
      out.value = '/* ERROR generating output: ' + e.message + ' */';
      console.error(e);
    }
  }

  // ── Global controls (new/dup/del/copy/revert/search/output-mode) ─────────
  function wireGlobalControls() {
    document.getElementById('btnNew').addEventListener('click', onNew);
    document.getElementById('btnDuplicate').addEventListener('click', onDuplicate);
    document.getElementById('btnDelete').addEventListener('click', onDelete);
    document.getElementById('btnRevert').addEventListener('click', onRevert);
    document.getElementById('btnCopy').addEventListener('click', onCopy);
    document.getElementById('entrySearch').addEventListener('input', () => renderEntryList());
    for (const r of document.querySelectorAll('input[name=outputMode]')) {
      r.addEventListener('change', () => {
        state.outputMode = document.querySelector('input[name=outputMode]:checked').value;
        renderOutput();
      });
    }
  }

  function onNew() {
    const schema = Schemas.SECTIONS[state.activeTab];
    if (!schema) return;
    if (schema.kind === 'keyedDict') {
      const data = getAtPath(state.draft, schema.configPath) || {};
      const baseKey = 'new_' + schema.entryName.replace(/\s+/g,'_');
      let k = baseKey, i = 1;
      while (k in data) { i++; k = baseKey + '_' + i; }
      const blank = Widgets.buildDefault(schema);
      // For schemas with unwrap (rankConfig), we want to store an empty array.
      data[k] = (typeof schema.wrap === 'function') ? [] : blank;
      setAtPath(state.draft, schema.configPath, data);
      state.activeEntry = k;
    } else if (schema.kind === 'objectArray') {
      const arr = getAtPath(state.draft, schema.configPath) || [];
      arr.push(Widgets.buildDefault(schema));
      setAtPath(state.draft, schema.configPath, arr);
      state.activeEntry = arr.length - 1;
    } else {
      return;
    }
    renderEntryList();
    renderForm();
    renderOutput();
  }

  function onDuplicate() {
    const schema = Schemas.SECTIONS[state.activeTab];
    if (!schema || state.activeEntry === null) return;
    if (schema.kind === 'keyedDict') {
      const data = getAtPath(state.draft, schema.configPath) || {};
      const src = data[state.activeEntry];
      if (!src) return;
      let k = state.activeEntry + '_copy', i = 1;
      while (k in data) { i++; k = state.activeEntry + '_copy' + i; }
      data[k] = deepClone(src);
      state.activeEntry = k;
    } else if (schema.kind === 'objectArray') {
      const arr = getAtPath(state.draft, schema.configPath) || [];
      const src = arr[state.activeEntry];
      if (!src) return;
      arr.splice(state.activeEntry + 1, 0, deepClone(src));
      state.activeEntry = state.activeEntry + 1;
    }
    renderEntryList();
    renderForm();
    renderOutput();
  }

  function onDelete() {
    const schema = Schemas.SECTIONS[state.activeTab];
    if (!schema || state.activeEntry === null) return;
    if (!confirm('Delete "' + state.activeEntry + '"? (only affects the draft; nothing is written to config.js)')) return;
    if (schema.kind === 'keyedDict') {
      const data = getAtPath(state.draft, schema.configPath) || {};
      delete data[state.activeEntry];
      state.activeEntry = null;
    } else if (schema.kind === 'objectArray') {
      const arr = getAtPath(state.draft, schema.configPath) || [];
      arr.splice(state.activeEntry, 1);
      state.activeEntry = null;
    }
    renderEntryList();
    renderForm();
    renderOutput();
  }

  function onRevert() {
    if (!confirm('Discard ALL edits and reload from the live config.js?')) return;
    state.draft = deepClone(BAM_CONFIG);
    toast('Reverted to live config');
    renderEntryList();
    renderForm();
    renderOutput();
  }

  async function onCopy() {
    const out = document.getElementById('output');
    try {
      await navigator.clipboard.writeText(out.value);
      toast('Copied to clipboard');
    } catch (e) {
      out.select();
      document.execCommand('copy');
      toast('Copied');
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function makeCtx() {
    return {
      draft: state.draft,
      onChange: () => {
        renderOutput();
        rerunValidation();
        updateDirtyMarkers();
      },
      rerenderForm: () => renderForm(),
    };
  }

  // Re-run validation in place without rebuilding the entire form.
  function rerunValidation() {
    // Strip prior inline messages
    const bodyEl = document.getElementById('formBody');
    for (const ctl of bodyEl.querySelectorAll('.field-control')) {
      ctl.classList.remove('invalid');
      for (const w of ctl.querySelectorAll('.field-warning, .field-error')) w.remove();
    }
    const schema = Schemas.SECTIONS[state.activeTab];
    if (!schema || !schema.validate) return;
    let entry;
    if (schema.kind === 'keyedDict') {
      const data = getAtPath(state.draft, schema.configPath) || {};
      entry = data[state.activeEntry];
    } else if (schema.kind === 'objectArray') {
      const arr = getAtPath(state.draft, schema.configPath) || [];
      entry = arr[state.activeEntry];
    } else if (schema.kind === 'singleObject') {
      entry = getAtPath(state.draft, schema.configPath) || {};
    }
    if (!entry) return;
    runValidation(entry, schema, makeCtx());
  }

  function getAtPath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setAtPath(obj, path, value) {
    if (!path) return;
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  }
  function ensurePath(obj, path) {
    if (!path) return;
    const parts = path.split('.');
    let o = obj;
    for (const p of parts) {
      if (!o[p] || typeof o[p] !== 'object') o[p] = {};
      o = o[p];
    }
  }

  // Robust deep clone that preserves Infinity / NaN (structuredClone handles
  // them, but the global config.js might define them as literal numbers).
  function deepClone(v) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(v); } catch { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(v));
  }

  function setStatus(msg, isError = false) {
    const el = document.getElementById('loadStatus');
    el.textContent = msg;
    el.style.color = isError ? 'var(--bad)' : 'var(--text-mute)';
  }

  function toast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.toggle('error', isError);
    t.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ── Boot when DOM ready ──────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return { state };

})();
