// widgets.js — schema-driven input renderers.
//
// Each widget returns a DOM element bound to the in-memory draft model.
// All widgets call `ctx.onChange()` after mutating a value so the app can
// re-render the entry's output snippet and re-run validation.
//
// Supported field types (declared in schemas.js):
//   string, number, boolean, select, multiSelect, color, emoji,
//   stringArray, arrayOf (objects), object (nested single), json (escape hatch),
//   requirementSlots (mission requirements union)

const Widgets = (() => {

  // ── Small DOM helpers ────────────────────────────────────────────────────
  function el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class')      e.className = v;
      else if (k === 'style') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') {
        e.addEventListener(k.slice(2).toLowerCase(), v);
      }
      else if (v === true)    e.setAttribute(k, '');
      else if (v === false || v == null) { /* skip */ }
      else                    e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return e;
  }

  function resolveOptions(field, ctx) {
    const opts = typeof field.options === 'function' ? field.options(ctx) : field.options;
    return Array.isArray(opts) ? opts : [];
  }

  // ── Field row wrapper (label + control + warnings) ───────────────────────
  function renderField(field, value, parent, ctx) {
    // Conditional visibility (e.g. seat-role-dependent fields)
    if (typeof field.when === 'function' && !field.when(parent, ctx)) {
      return null;
    }

    const label = el('label', { class: 'field-label' },
      field.label || field.key,
      field.required ? el('span', { class: 'req-marker' }, '*') : null
    );
    const control = el('div', { class: 'field-control' });

    const setValue = (v) => {
      parent[field.key] = v;
      ctx.onChange();
    };

    let inputEl;
    switch (field.type) {
      case 'string':   inputEl = renderString(value, setValue, field); break;
      case 'number':   inputEl = renderNumber(value, setValue, field); break;
      case 'boolean':  inputEl = renderBoolean(value, setValue, field); break;
      case 'select':   inputEl = renderSelect(value, setValue, field, ctx); break;
      case 'multiSelect': inputEl = renderMultiSelect(value, setValue, field, ctx); break;
      case 'color':    inputEl = renderColor(value, setValue, field); break;
      case 'emoji':    inputEl = renderEmoji(value, setValue, field); break;
      case 'stringArray': inputEl = renderStringArray(value, setValue, field, ctx); break;
      case 'arrayOf':  inputEl = renderArrayOf(value, setValue, field, ctx); break;
      case 'object':   inputEl = renderNestedObject(value, setValue, field, ctx); break;
      case 'json':     inputEl = renderJson(value, setValue, field); break;
      case 'requirementSlots': inputEl = renderRequirementSlots(value, setValue, field, ctx); break;
      case 'keyedDict': inputEl = renderKeyedDictField(value, setValue, field, ctx); break;
      default:
        inputEl = el('div', { class: 'field-hint' }, '(unknown field type: ' + field.type + ')');
    }
    control.appendChild(inputEl);

    if (field.hint) {
      control.appendChild(el('div', { class: 'field-hint' }, field.hint));
    }

    const row = el('div', { class: 'field' }, label, control);
    return row;
  }

  // ── Primitives ───────────────────────────────────────────────────────────
  function renderString(value, setValue, field) {
    const input = el('input', {
      type: 'text',
      value: value == null ? '' : String(value),
      placeholder: field.placeholder || ''
    });
    input.addEventListener('input', () => setValue(input.value));
    return input;
  }

  function renderNumber(value, setValue, field) {
    const input = el('input', {
      type: 'number',
      value: value == null ? '' : String(value),
    });
    if (field.min !== undefined) input.min = field.min;
    if (field.max !== undefined) input.max = field.max;
    if (field.step !== undefined) input.step = field.step;
    input.addEventListener('input', () => {
      if (input.value === '') setValue(field.nullable ? null : undefined);
      else setValue(Number(input.value));
    });
    return input;
  }

  function renderBoolean(value, setValue, field) {
    const row = el('div', { class: 'checkbox-row' });
    const cb = el('input', { type: 'checkbox' });
    cb.checked = !!value;
    cb.addEventListener('change', () => setValue(cb.checked));
    row.appendChild(cb);
    if (field.checkboxLabel) {
      const id = 'cb_' + Math.random().toString(36).slice(2);
      cb.id = id;
      row.appendChild(el('label', { for: id }, field.checkboxLabel));
    }
    return row;
  }

  function renderSelect(value, setValue, field, ctx) {
    const opts = resolveOptions(field, ctx);
    const sel = el('select');
    // Allow null/empty as first option if nullable
    if (field.nullable || field.optional) {
      sel.appendChild(el('option', { value: '__null__' }, '(none)'));
    }
    for (const opt of opts) {
      const v = typeof opt === 'object' ? opt.value : opt;
      const label = typeof opt === 'object' ? opt.label : (opt == null ? '(none)' : String(opt));
      const o = el('option', { value: v == null ? '__null__' : String(v) }, label);
      sel.appendChild(o);
    }
    const cur = value == null ? '__null__' : String(value);
    sel.value = cur;
    sel.addEventListener('change', () => {
      if (sel.value === '__null__') setValue(field.nullable ? null : undefined);
      else {
        // Coerce to number if all options are numeric
        const v = sel.value;
        const numeric = opts.every(o => typeof (typeof o === 'object' ? o.value : o) === 'number');
        setValue(numeric ? Number(v) : v);
      }
    });
    return sel;
  }

  // ── multiSelect — chip-based picker with dropdown popup ──────────────────
  function renderMultiSelect(value, setValue, field, ctx) {
    const arr = Array.isArray(value) ? value.slice() : [];
    const wrap = el('div', { class: 'multiselect' });
    const chips = el('div', { class: 'chips' });
    const opts = resolveOptions(field, ctx);

    const rerender = () => {
      chips.innerHTML = '';
      for (const v of arr) {
        const chip = el('span', { class: 'chip removable' });
        chip.appendChild(document.createTextNode(labelFor(v, opts)));
        const x = el('span', { class: 'x' }, '×');
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          const i = arr.indexOf(v);
          if (i >= 0) arr.splice(i, 1);
          setValue(arr.slice());
          rerender();
        });
        chip.appendChild(x);
        chips.appendChild(chip);
      }
      const addBtn = el('span', { class: 'chip', style: { cursor: 'pointer', background: 'var(--bg-hover)' } }, '+ add');
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showPopup();
      });
      chips.appendChild(addBtn);
    };

    let popup = null;
    function showPopup() {
      if (popup) { popup.remove(); popup = null; return; }
      const freshOpts = resolveOptions(field, ctx);
      popup = el('div', { class: 'multiselect-popup' });
      for (const opt of freshOpts) {
        const v = typeof opt === 'object' ? opt.value : opt;
        const label = typeof opt === 'object' ? opt.label : String(opt);
        const row = el('div', { class: 'option' });
        const checked = arr.includes(v);
        row.appendChild(el('span', { class: 'check' }, checked ? '✓' : ''));
        row.appendChild(document.createTextNode(label));
        row.addEventListener('click', () => {
          if (checked) {
            const i = arr.indexOf(v);
            if (i >= 0) arr.splice(i, 1);
          } else {
            arr.push(v);
          }
          setValue(arr.slice());
          popup.remove();
          popup = null;
          rerender();
        });
        popup.appendChild(row);
      }
      wrap.appendChild(popup);
      // Click-outside dismiss
      setTimeout(() => {
        const handler = (ev) => {
          if (popup && !wrap.contains(ev.target)) {
            popup.remove(); popup = null;
            document.removeEventListener('click', handler);
          }
        };
        document.addEventListener('click', handler);
      }, 0);
    }

    wrap.appendChild(chips);
    rerender();
    return wrap;
  }

  function labelFor(value, opts) {
    if (!Array.isArray(opts)) return String(value);
    for (const opt of opts) {
      if (typeof opt === 'object' && opt.value === value) return opt.label;
      if (opt === value) return String(value);
    }
    return String(value);
  }

  // ── Color (hex picker + text) ────────────────────────────────────────────
  function renderColor(value, setValue, field) {
    const row = el('div', { class: 'color-row' });
    const picker = el('input', { type: 'color', value: value || '#000000' });
    const text = el('input', { type: 'text', value: value || '' });
    picker.addEventListener('input', () => { text.value = picker.value; setValue(picker.value); });
    text.addEventListener('input', () => {
      const v = text.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) picker.value = v;
      setValue(v || (field.nullable ? null : ''));
    });
    row.appendChild(picker);
    row.appendChild(text);
    return row;
  }

  // ── Emoji (free text + common picks) ─────────────────────────────────────
  function renderEmoji(value, setValue, field) {
    const wrap = el('div', { class: 'color-row' });
    const text = el('input', { type: 'text', value: value || '', style: { width: '80px', fontSize: '16px' } });
    text.addEventListener('input', () => setValue(text.value));
    wrap.appendChild(text);
    const common = ['🚒','🚑','🚔','🚁','🚗','🚐','🔥','🔧','🪜','🔓','🔒','⛓️','✈️','🏥','🔴','🔵','🟣','👮','🟢','🟡'];
    const palette = el('div', { class: 'chips', style: { background: 'transparent', border: 'none', padding: 0 } });
    for (const e of common) {
      const btn = el('span', { class: 'chip', style: { cursor: 'pointer', fontSize: '14px' } }, e);
      btn.addEventListener('click', () => { text.value = e; setValue(e); });
      palette.appendChild(btn);
    }
    const col = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, wrap, palette);
    return col;
  }

  // ── stringArray — chips with free-text add ───────────────────────────────
  function renderStringArray(value, setValue, field, ctx) {
    const arr = Array.isArray(value) ? value.slice() : [];
    const wrap = el('div', { class: 'chips' });

    const rerender = () => {
      wrap.innerHTML = '';
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        const chip = el('span', { class: 'chip removable' }, String(v));
        const x = el('span', { class: 'x' }, '×');
        x.addEventListener('click', () => {
          arr.splice(i, 1);
          setValue(arr.slice());
          rerender();
        });
        chip.appendChild(x);
        wrap.appendChild(chip);
      }
      const adder = el('span', { class: 'chip chip-add' });
      const input = el('input', { type: 'text', placeholder: field.placeholder || '+ add' });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const v = input.value.trim();
          if (v) { arr.push(v); setValue(arr.slice()); rerender(); }
        }
      });
      input.addEventListener('blur', () => {
        const v = input.value.trim();
        if (v) { arr.push(v); setValue(arr.slice()); rerender(); }
      });
      adder.appendChild(input);
      wrap.appendChild(adder);
    };

    rerender();
    return wrap;
  }

  // ── arrayOf objects (seats, patients, ranks, shift entries) ──────────────
  function renderArrayOf(value, setValue, field, ctx) {
    const arr = Array.isArray(value) ? value : [];
    const wrap = el('div', { class: 'subarray' });

    const rerender = () => {
      wrap.innerHTML = '';
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const itemEl = el('div', { class: 'subarray-item' });

        const header = el('div', { class: 'subarray-item-header' });
        header.appendChild(el('span', { class: 'idx' }, '#' + (i + 1)));
        header.appendChild(el('span', { class: 'item-summary' }, summarize(item, field.itemSchema)));

        const upBtn = el('button', { title: 'Move up', disabled: i === 0 }, '↑');
        const downBtn = el('button', { title: 'Move down', disabled: i === arr.length - 1 }, '↓');
        const delBtn = el('button', { title: 'Remove' }, '🗑');
        upBtn.addEventListener('click', () => {
          if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; setValue(arr); rerender(); }
        });
        downBtn.addEventListener('click', () => {
          if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; setValue(arr); rerender(); }
        });
        delBtn.addEventListener('click', () => {
          arr.splice(i, 1); setValue(arr); rerender();
        });
        header.appendChild(upBtn);
        header.appendChild(downBtn);
        header.appendChild(delBtn);
        itemEl.appendChild(header);

        const fieldsBox = el('div', { class: 'subarray-item-fields' });
        for (const f of field.itemSchema.fields) {
          const row = renderField(f, item[f.key], item, ctx);
          if (row) fieldsBox.appendChild(row);
        }
        itemEl.appendChild(fieldsBox);
        wrap.appendChild(itemEl);
      }
      const add = el('button', { class: 'subarray-add' }, '+ Add ' + (field.itemSchema.label || 'item'));
      add.addEventListener('click', () => {
        arr.push(buildDefault(field.itemSchema));
        setValue(arr);
        rerender();
      });
      wrap.appendChild(add);
    };

    rerender();
    return wrap;
  }

  function summarize(item, itemSchema) {
    if (!item || typeof item !== 'object') return '';
    if (itemSchema && itemSchema.summary && typeof itemSchema.summary === 'function') {
      try { return itemSchema.summary(item); } catch { /* fall through */ }
    }
    // Default: show id/key/label if present
    const head = item.id || item.key || item.label || '';
    const tail = item.requiredCert || item.injuryType || item.tier || '';
    return [head, tail].filter(Boolean).join(' · ');
  }

  function buildDefault(schema) {
    if (!schema || !schema.fields) return {};
    const out = {};
    for (const f of schema.fields) {
      if (f.default !== undefined) out[f.key] = (typeof f.default === 'function' ? f.default() : f.default);
      else if (f.required) {
        if (f.type === 'string') out[f.key] = '';
        else if (f.type === 'number') out[f.key] = 0;
        else if (f.type === 'boolean') out[f.key] = false;
        else if (f.type === 'multiSelect' || f.type === 'stringArray' || f.type === 'arrayOf') out[f.key] = [];
      }
    }
    return out;
  }

  // ── Nested single object (e.g. ui.avlLabelColors) ────────────────────────
  function renderNestedObject(value, setValue, field, ctx) {
    if (value === null || typeof value !== 'object') value = {};
    const wrap = el('div', { class: 'subarray', style: { padding: '12px' } });
    for (const f of field.itemSchema.fields) {
      const row = renderField(f, value[f.key], value, {
        ...ctx,
        onChange: () => { setValue(value); ctx.onChange(); }
      });
      if (row) wrap.appendChild(row);
    }
    return wrap;
  }

  // ── keyedDict field (e.g. economy.stationCost: { fire: 15000, ems: 12000 }) ─
  function renderKeyedDictField(value, setValue, field, ctx) {
    if (value === null || typeof value !== 'object') value = {};
    const wrap = el('div', { class: 'subarray', style: { padding: '8px' } });
    const knownKeys = field.knownKeys || Object.keys(value);
    for (const k of knownKeys) {
      const v = value[k];
      // Render the underlying value with the field's valueType.
      const subField = { ...(field.valueField || { type: 'string' }), key: k, label: k };
      const row = renderField(subField, v, value, {
        ...ctx,
        onChange: () => { setValue(value); ctx.onChange(); }
      });
      if (row) wrap.appendChild(row);
    }
    // "Add key" row
    if (field.allowAddKeys !== false) {
      const adder = el('div', { class: 'subarray-add', style: { display: 'flex', gap: '4px' } });
      const k = el('input', { type: 'text', placeholder: 'new key', style: { flex: '1' } });
      const btn = el('button', { class: 'subarray-add', style: { width: '80px' } }, '+ Add');
      btn.addEventListener('click', () => {
        const key = k.value.trim();
        if (!key) return;
        value[key] = field.valueField && field.valueField.type === 'number' ? 0 : '';
        setValue(value);
        ctx.onChange();
        ctx.rerenderForm && ctx.rerenderForm();
      });
      adder.appendChild(k);
      adder.appendChild(btn);
      wrap.appendChild(adder);
    }
    return wrap;
  }

  // ── JSON escape hatch — raw text editor ──────────────────────────────────
  function renderJson(value, setValue, field) {
    const ta = el('textarea', { rows: 6 });
    ta.value = (typeof Fmt !== 'undefined' && Fmt.formatValue)
      ? Fmt.formatValue(value, 0)
      : JSON.stringify(value, null, 2);
    ta.addEventListener('blur', () => {
      try {
        // Use Function constructor so we can accept JS-literal syntax (single
        // quotes, unquoted keys, Infinity, trailing commas).
        // eslint-disable-next-line no-new-func
        const parsed = new Function('return (' + ta.value + ');')();
        setValue(parsed);
        ta.classList.remove('field-error');
      } catch (e) {
        ta.classList.add('field-error');
      }
    });
    return ta;
  }

  // ── Mission requirement slots (union: tags array OR seat-needs object) ───
  function renderRequirementSlots(value, setValue, field, ctx) {
    const arr = Array.isArray(value) ? value : [];
    const wrap = el('div', { class: 'subarray' });
    const tagOptions = field.tagOptions ? field.tagOptions(ctx) : [];

    const slotMode = (slot) => {
      if (Array.isArray(slot)) return 'tags';
      if (slot && typeof slot === 'object') {
        if (slot.tags && slot.needs) return 'both';
        if (slot.needs) return 'needs';
        if (slot.tags)  return 'tags-obj';
      }
      return 'tags';
    };

    const rerender = () => {
      wrap.innerHTML = '';
      for (let i = 0; i < arr.length; i++) {
        const slot = arr[i];
        const mode = slotMode(slot);
        const row = el('div', { class: 'req-slot' });

        const modeSel = el('select');
        for (const [v, lbl] of [['tags','tags'],['needs','seat'],['both','tags+seat']]) {
          const o = el('option', { value: v }, lbl);
          if (v === mode || (v === 'tags' && mode === 'tags-obj')) o.selected = true;
          modeSel.appendChild(o);
        }

        const body = el('div');

        function paintBody() {
          body.innerHTML = '';
          const m = modeSel.value;
          if (m === 'tags') {
            // Plain tag array: ['engine','tanker']
            const tags = Array.isArray(slot) ? slot.slice() : (slot.tags || []).slice();
            const ms = renderMultiSelect(tags, (newTags) => {
              arr[i] = newTags.slice();
              setValue(arr);
              header(arr[i]);
            }, { options: tagOptions }, ctx);
            body.appendChild(ms);
          } else if (m === 'needs') {
            const needsSel = el('select');
            for (const v of ['isPatientSeat','isPrisonerSeat']) {
              const o = el('option', { value: v }, v);
              if (slot && slot.needs === v) o.selected = true;
              needsSel.appendChild(o);
            }
            needsSel.addEventListener('change', () => {
              arr[i] = { needs: needsSel.value };
              setValue(arr);
            });
            // Initialize structure if needed
            if (!slot || Array.isArray(slot) || !slot.needs) {
              arr[i] = { needs: needsSel.value };
              setValue(arr);
            }
            body.appendChild(needsSel);
          } else if (m === 'both') {
            const obj = (slot && !Array.isArray(slot)) ? slot : { tags: Array.isArray(slot) ? slot : [], needs: 'isPatientSeat' };
            if (!obj.needs) obj.needs = 'isPatientSeat';
            if (!obj.tags) obj.tags = [];
            arr[i] = obj;
            const tagsMs = renderMultiSelect(obj.tags, (t) => { obj.tags = t; setValue(arr); }, { options: tagOptions }, ctx);
            const needsSel = el('select');
            for (const v of ['isPatientSeat','isPrisonerSeat']) {
              const o = el('option', { value: v }, v);
              if (obj.needs === v) o.selected = true;
              needsSel.appendChild(o);
            }
            needsSel.addEventListener('change', () => { obj.needs = needsSel.value; setValue(arr); });
            body.appendChild(tagsMs);
            body.appendChild(needsSel);
          }
        }

        const header = () => {}; // unused — kept simple

        modeSel.addEventListener('change', () => {
          // Reshape slot into the new mode's structure
          if (modeSel.value === 'tags') {
            arr[i] = Array.isArray(slot) ? slot : (slot && slot.tags ? slot.tags : []);
          } else if (modeSel.value === 'needs') {
            arr[i] = { needs: (slot && slot.needs) || 'isPatientSeat' };
          } else if (modeSel.value === 'both') {
            arr[i] = { tags: Array.isArray(slot) ? slot : (slot && slot.tags) || [], needs: (slot && slot.needs) || 'isPatientSeat' };
          }
          setValue(arr);
          paintBody();
        });

        const del = el('button', { title: 'Remove', style: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: '3px', cursor: 'pointer' } }, '🗑');
        del.addEventListener('click', () => { arr.splice(i, 1); setValue(arr); rerender(); });

        row.appendChild(modeSel);
        row.appendChild(body);
        row.appendChild(del);
        wrap.appendChild(row);
        paintBody();
      }
      const add = el('button', { class: 'subarray-add' }, '+ Add requirement slot');
      add.addEventListener('click', () => { arr.push([]); setValue(arr); rerender(); });
      wrap.appendChild(add);
    };

    rerender();
    return wrap;
  }

  // ── Public API ───────────────────────────────────────────────────────────
  return {
    el,
    renderField,
    renderArrayOf,
    renderMultiSelect,
    renderStringArray,
    buildDefault,
  };

})();
