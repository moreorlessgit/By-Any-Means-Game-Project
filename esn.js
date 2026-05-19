// =============================================================================
// BY ANY MEANS — ESN SYSTEM
// ESN zone drawing, dispatch centers, box alarms, and all geographic coverage logic.
// This file depends on: config.js (BAM_CONFIG), and globals from index.html
// (map, stations, getAllUnits, setStatus, setPlacing, renderStationList).
// =============================================================================

// ── STATE ─────────────────────────────────────────────────────────────────────
let esns             = [];  // { id, name, coords, assignments, inService, color, labelSize, polygon }
let dispatchCenters  = [];  // { id, name, lat, lng, assignedESNs, inService, marker }
let boxAlarms        = [];  // { id, name, esnId, missionTypes, requirements }

// ── ESN DRAWING STATE ─────────────────────────────────────────────────────────
let drawingESN         = false;
let drawCoords         = [];
let _drawMarkers       = [];      // draggable vertex markers while drawing
let _drawPolyline      = null;    // preview line while drawing
let _drawPolygon       = null;    // preview fill while drawing
let _clickTimer        = null;    // debounce timer for single-click vs. double-click
let _editingESNId      = null;    // ESN id being shape-edited, or null for new draw
let _suppressESNClicks = false;   // true while drawing — polygon clicks are silenced
let _refDots           = [];      // L.circleMarker reference dots shown during draw
let _selectedDCFilter  = null;    // DC id currently filtering the ESN list, or null (show all)
let _dcSectionCollapsed = false;  // whether the DC section header is collapsed

// ── ESN COLOR PRESETS ─────────────────────────────────────────────────────────
const ESN_COLOR_PRESETS = [
  '#f0a500','#f59e0b','#fbbf24',   // ambers / yellows
  '#34c96a','#22c55e','#16a34a',   // greens
  '#2ea8ff','#3b82f6','#1d4ed8',   // blues
  '#e8431a','#ef4444','#b91c1c',   // reds
  '#a855f7','#9333ea','#6d28d9',   // purples
  '#ec4899','#db2777',             // pinks
  '#14b8a6','#0d9488',             // teals
  '#64748b','#ffffff',             // gray, white
];

// =============================================================================
// ESN POLYGON DRAWING
// Vertices are draggable markers. Click = add vertex (debounced 200ms).
// Double-click = finish. Enter = finish. Escape = cancel.
// =============================================================================

function startDrawESN() {
  if (drawingESN) return;
  drawingESN = true;
  drawCoords = [];
  _drawMarkers = [];
  setPlacing(null);
  map.doubleClickZoom.disable();
  map.getContainer().style.cursor = 'crosshair';
  map.on('click', _onESNClick);
  map.on('dblclick', _onESNDblClick);
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-draw-esn')?.classList.add('active');
  _showDrawToolbar();
  // Suppress existing ESN polygon clicks so they can't be accidentally opened mid-draw
  esns.forEach(esn => esn.polygon?.off('click'));
  _suppressESNClicks = true;
  // Show small gray reference dots at all existing ESN vertices as a visual snapping aid
  esns.forEach(esn => {
    esn.coords.forEach(([lat, lng]) => {
      const dot = L.circleMarker([lat, lng], {
        radius: 4, color: '#888', fillColor: '#888', fillOpacity: .7,
        weight: 1, interactive: false
      }).addTo(map);
      _refDots.push(dot);
    });
  });
  setStatus('Drawing ESN: click to add points · double-click or Enter to finish · Escape to cancel');
}

// Single-click handler — debounced to avoid double-click adding extra vertices.
function _onESNClick(e) {
  if (!drawingESN) return;
  if (_clickTimer) clearTimeout(_clickTimer);
  _clickTimer = setTimeout(() => {
    _clickTimer = null;
    const snapped = _snapLatlng(e.latlng);
    _addVertex(snapped);
  }, 200);
}

// Double-click handler — cancels pending single-click and finishes the polygon.
function _onESNDblClick(e) {
  if (!drawingESN) return;
  L.DomEvent.stop(e);
  if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
  _finishDrawESN();
}

// Snaps a proposed latlng to any existing ESN vertex or current draw vertex
// within 15 pixels. Returns the snapped latlng or the original if no snap.
function _snapLatlng(latlng) {
  const threshold = 15;
  const pt = map.latLngToContainerPoint(latlng);

  // Snap to existing ESN polygon vertices
  for (const esn of esns) {
    for (const coord of esn.coords) {
      const cp = map.latLngToContainerPoint(L.latLng(coord[0], coord[1]));
      const dx = pt.x - cp.x, dy = pt.y - cp.y;
      if (Math.sqrt(dx * dx + dy * dy) < threshold) return L.latLng(coord[0], coord[1]);
    }
  }

  // Snap to first vertex of current drawing (for self-closing)
  if (drawCoords.length >= 2) {
    const first = drawCoords[0];
    const cp = map.latLngToContainerPoint(L.latLng(first[0], first[1]));
    const dx = pt.x - cp.x, dy = pt.y - cp.y;
    if (Math.sqrt(dx * dx + dy * dy) < threshold) return L.latLng(first[0], first[1]);
  }

  return latlng;
}

// Adds a vertex at the given latlng, creates a draggable marker, updates preview.
// First vertex (idx 0) is green to show the polygon start; subsequent are gold.
function _addVertex(latlng) {
  const idx = drawCoords.length;
  drawCoords.push([latlng.lat, latlng.lng]);

  const dotColor = idx === 0 ? 'var(--green)' : 'var(--gold)';
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;background:${dotColor};border:2px solid #fff;
      border-radius:50%;cursor:move;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  const marker = L.marker(latlng, { icon, draggable: true, zIndexOffset: 500 }).addTo(map);
  marker.on('drag', () => {
    drawCoords[idx] = [marker.getLatLng().lat, marker.getLatLng().lng];
    _updateDrawPreview();
  });

  _drawMarkers.push(marker);
  _updateDrawPreview();
  _updateDrawToolbar();
}

// Redraws the in-progress preview lines from current drawCoords.
function _updateDrawPreview() {
  if (_drawPolyline) { _drawPolyline.remove(); _drawPolyline = null; }
  if (_drawPolygon)  { _drawPolygon.remove();  _drawPolygon  = null; }
  if (drawCoords.length >= 2) {
    _drawPolyline = L.polyline(drawCoords, {
      color: '#f0a500', weight: 2, dashArray: '6,4', opacity: .9
    }).addTo(map);
  }
  if (drawCoords.length >= 3) {
    _drawPolygon = L.polygon(drawCoords, {
      color: '#f0a500', weight: 2, fillColor: '#f0a500', fillOpacity: .1
    }).addTo(map);
  }
}

// Updates the floating toolbar vertex count text.
function _updateDrawToolbar() {
  const el = document.getElementById('draw-toolbar-status');
  if (!el) return;
  if (_editingESNId) {
    const esn = esns.find(e => e.id === _editingESNId);
    const n = drawCoords.length;
    el.textContent = `Editing: ${esn?.name || 'ESN'} — ${n} point${n !== 1 ? 's' : ''}`;
    return;
  }
  const n = drawCoords.length;
  el.textContent = n === 0
    ? 'Click map to add points'
    : `${n} point${n !== 1 ? 's' : ''}${n >= 3 ? ' — ready' : ''}`;
}

function _showDrawToolbar() {
  const tb = document.getElementById('esn-draw-toolbar');
  if (tb) { tb.style.display = 'flex'; _updateDrawToolbar(); }
}

function _hideDrawToolbar() {
  const tb = document.getElementById('esn-draw-toolbar');
  if (tb) tb.style.display = 'none';
}

function _finishDrawESN() {
  if (drawCoords.length < 3) {
    setStatus('⚠️ Need at least 3 points to create an ESN zone.');
    return;
  }
  // Capture editId before _cancelESNDraw clears it
  const editId = _editingESNId;
  _editingESNId = null;  // clear first so _cancelESNDraw doesn't try to restore the old polygon
  _cancelESNDraw(false);

  if (editId) {
    // Shape-edit confirmed — update the ESN's coords and rebuild its polygon
    const esn = esns.find(e => e.id === editId);
    if (esn) {
      esn.coords = [...drawCoords];
      const polygon = L.polygon(esn.coords, {
        color: esn.color, weight: 2, fillColor: esn.color, fillOpacity: .07
      }).addTo(map);
      polygon.bindTooltip(`<span style="color:${esn.color};">${esn.name}</span>`, {
        permanent: true, direction: 'center', className: 'esn-label'
      });
      _applyTooltipStyle(polygon, esn.color, esn.labelSize);
      polygon.on('click', () => openESNModal(esn.id));
      esn.polygon = polygon;
      // Polygon changed, so the per-ESN OSM building cache is stale (candidates
      // may no longer fall inside the new shape). Purge; the next read lazy-
      // refetches. Volunteer auto-migration was removed in the abstract-
      // assembly refactor — volunteers no longer have physical home locations.
      if(typeof purgeBuildingCacheForESN === 'function') purgeBuildingCacheForESN(esn.id);
      setStatus(`✅ ESN "${esn.name}" shape updated.`);
      openESNModal(editId);
    }
    drawCoords = [];
  } else {
    openESNModal(null);
  }
}

// Cleans up all drawing state. Pass clearCoords=false to preserve drawn shape
// for use by the modal that immediately follows (create flow).
function _cancelESNDraw(clearCoords = true) {
  if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
  drawingESN = false;
  map.off('click',   _onESNClick);
  map.off('dblclick', _onESNDblClick);
  map.doubleClickZoom.enable();
  map.getContainer().style.cursor = '';
  if (_drawPolyline) { _drawPolyline.remove(); _drawPolyline = null; }
  if (_drawPolygon)  { _drawPolygon.remove();  _drawPolygon  = null; }
  _drawMarkers.forEach(m => m.remove());
  _drawMarkers = [];
  if (clearCoords) drawCoords = [];
  document.getElementById('btn-draw-esn')?.classList.remove('active');
  _hideDrawToolbar();

  // Restore click handlers on all ESN polygons
  if (_suppressESNClicks) {
    esns.forEach(esn => {
      if (esn.polygon) esn.polygon.on('click', () => openESNModal(esn.id));
    });
    _suppressESNClicks = false;
  }
  // Remove reference dots
  _refDots.forEach(d => d.remove());
  _refDots = [];
  // If shape-editing was cancelled (not finished), restore the original polygon
  if (_editingESNId) {
    const esn = esns.find(e => e.id === _editingESNId);
    if (esn && !esn.polygon) {
      const polygon = L.polygon(esn.coords, {
        color: esn.color, weight: 2, fillColor: esn.color,
        fillOpacity: esn.inService !== false ? .07 : .02,
        opacity:     esn.inService !== false ? 1   : .3
      }).addTo(map);
      polygon.bindTooltip(`<span style="color:${esn.color};">${esn.name}</span>`, {
        permanent: true, direction: 'center', className: 'esn-label'
      });
      _applyTooltipStyle(polygon, esn.color, esn.labelSize);
      polygon.on('click', () => openESNModal(esn.id));
      esn.polygon = polygon;
    }
    _editingESNId = null;
  }
}

// Public cancel — called by Escape key handler in index.html.
function cancelESNDraw() { _cancelESNDraw(true); }

// Enters draw mode pre-loaded with an existing ESN's vertices so the player
// can reshape it. Removes the current polygon, populates vertex markers, then
// on confirm the polygon is rebuilt from the new coords.
function startEditESNShape(esnId) {
  const esn = esns.find(e => e.id === esnId);
  if (!esn) return;
  closeESNModal();
  // Remove current polygon from map (kept in esn.coords for cancel restore)
  esn.polygon?.remove();
  esn.polygon = null;

  _editingESNId = esnId;
  drawingESN    = true;
  drawCoords    = [];
  _drawMarkers  = [];
  setPlacing(null);
  map.doubleClickZoom.disable();
  map.getContainer().style.cursor = 'crosshair';
  map.on('click', _onESNClick);
  map.on('dblclick', _onESNDblClick);
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

  // Create draggable vertex markers for each existing coord
  esn.coords.forEach(([lat, lng]) => _addVertex(L.latLng(lat, lng)));

  // Suppress polygon clicks on all OTHER ESNs
  esns.forEach(e => { if (e.id !== esnId && e.polygon) e.polygon.off('click'); });
  _suppressESNClicks = true;

  // Reference dots for all other ESN vertices
  esns.forEach(e => {
    if (e.id === esnId) return;
    (e.coords || []).forEach(([lat, lng]) => {
      const dot = L.circleMarker([lat, lng], {
        radius: 4, color: '#888', fillColor: '#888', fillOpacity: .7,
        weight: 1, interactive: false
      }).addTo(map);
      _refDots.push(dot);
    });
  });

  _showDrawToolbar();
  _updateDrawPreview();
  setStatus(`Editing shape of "${esn.name}" — drag vertices · double-click or Enter to confirm · Escape to cancel`);
}

// =============================================================================
// ESN MODAL (create / edit)
// =============================================================================

function openESNModal(esnId) {
  const existing = esnId ? esns.find(e => e.id === esnId) : null;
  document.getElementById('esn-modal-title').textContent = existing ? 'Edit ESN Zone' : 'New ESN Zone';
  document.getElementById('esn-name-input').value = existing?.name || '';
  document.getElementById('esn-modal').dataset.editId = esnId || '';

  // Color
  const color = existing?.color || '#f0a500';
  _renderColorSwatches(color);
  const colorInput = document.getElementById('esn-color-custom');
  if (colorInput) colorInput.value = color;

  // Label size
  const lsEl = document.getElementById('esn-label-size');
  if (lsEl) lsEl.value = existing?.labelSize || 'md';

  // Phase 5D bug-fix — exclude-from-generation toggle
  const exEl = document.getElementById('esn-exclude-from-gen');
  if (exEl) exEl.checked = !!existing?.excludeFromGeneration;

  _renderESNAssignUI(existing);
  _renderESNBoxAlarms(esnId);
  // Show "Edit Shape" button only when editing an existing ESN
  const editShapeBtn = document.getElementById('esn-edit-shape-btn');
  if (editShapeBtn) editShapeBtn.style.display = existing ? '' : 'none';
  // Phase 5D — same visibility rule for "Rebuild Building Cache"
  const rebuildBtn = document.getElementById('esn-rebuild-osm-btn');
  if (rebuildBtn) rebuildBtn.style.display = existing ? '' : 'none';
  document.getElementById('esn-modal').classList.add('open');
  setTimeout(() => document.getElementById('esn-name-input').focus(), 40);
}

// Phase 5D — Rebuild the volunteer building cache for a single ESN. Calls
// fetchBuildingsForESN(force=true). Provides progress feedback via setStatus.
async function _esnRebuildBuildingCache(esnId){
  if(!esnId || typeof fetchBuildingsForESN !== 'function') return;
  const esn = esns.find(e => e.id === esnId);
  if(!esn) return;
  setStatus(`Rebuilding OSM building cache for ${esn.name}…`);
  await fetchBuildingsForESN(esnId, true);
  // Status line is set by fetchBuildingsForESN itself.
}

function closeESNModal() {
  const modal = document.getElementById('esn-modal');
  modal.classList.remove('open');
  if (!modal.dataset.editId) drawCoords = [];
}

// Renders color preset swatches in the ESN modal.
function _renderColorSwatches(selectedColor) {
  const container = document.getElementById('esn-color-swatches');
  if (!container) return;
  container.innerHTML = ESN_COLOR_PRESETS.map(c =>
    `<div class="color-swatch${c.toLowerCase() === selectedColor.toLowerCase() ? ' selected' : ''}"
      style="background:${c};"
      onclick="_selectESNColor('${c}')"></div>`
  ).join('');
}

// Called when a swatch is clicked — syncs the color input and highlights the swatch.
function _selectESNColor(color) {
  const input = document.getElementById('esn-color-custom');
  if (input) input.value = color;
  _renderColorSwatches(color);
}

// Builds the station assignment UI grouped by service type and the DC dropdown.
// Each group uses a searchable-multiselect component (chip bar + search + filtered checkbox panel).
// The DC selector uses the same component in single-select mode.
function _renderESNAssignUI(existing) {
  const container = document.getElementById('esn-assignments');
  const labels = { fire: 'Fire Coverage', ems: 'EMS Coverage', police: 'Law Enforcement' };
  let html = '';

  ['fire', 'ems', 'police'].forEach(type => {
    const assigned = existing?.assignments[type] || [];
    const serviceTags = BAM_CONFIG.serviceTags[type];
    const eligible = stations.filter(s =>
      s.units.some(u => BAM_CONFIG.unitTypes[u.typeKey]?.tags.some(t => serviceTags.includes(t)))
    );
    const groupId = `esn-assign-${type}`;
    html += `<div class="esn-assign-group">
      <div class="esn-assign-label">${labels[type]}</div>`;
    if (!eligible.length) {
      html += `<div class="esn-assign-empty">No ${type} stations placed yet</div>`;
    } else {
      html += _buildSearchableMultiselect({
        panelId:     groupId,
        placeholder: `Search ${type} stations…`,
        options:     eligible.map(s => ({ value: s.id, label: s.name })),
        selected:    new Set(assigned),
        singleSelect:false,
        // checkbox extras so confirmESNModal's reader keeps working
        checkboxExtra: `data-svctype="${type}"`,
      });
    }
    html += `</div>`;
  });

  // Dispatch Center — single-select via the same component, paired with a hidden input
  // that confirmESNModal already reads (#esn-dc-assign).
  const currentDCId = existing
    ? (dispatchCenters.find(dc => dc.assignedESNs.includes(existing.id))?.id || '')
    : '';
  html += `<div class="esn-assign-group" style="margin-top:10px;">
    <div class="esn-assign-label">Dispatch Center</div>
    <input type="hidden" id="esn-dc-assign" value="${currentDCId}"/>`;
  if (!dispatchCenters.length) {
    html += `<div class="esn-assign-empty">No dispatch centers placed yet</div>`;
  } else {
    html += _buildSearchableMultiselect({
      panelId:     'esn-assign-dc',
      placeholder: 'Search dispatch centers…',
      options:     dispatchCenters.map(dc => ({ value: dc.id, label: dc.name })),
      selected:    currentDCId ? new Set([currentDCId]) : new Set(),
      singleSelect:true,
      hiddenInputId:'esn-dc-assign',
    });
  }
  html += `</div>`;

  container.innerHTML = html;
}

// Builds a searchable multi-select panel: chip bar (selected items, removable) + search input + filtered checkbox list.
// opts: { panelId, placeholder, options:[{value,label}], selected:Set, singleSelect, checkboxExtra, hiddenInputId }
// Selected state is the live source of truth — read by walking checked checkboxes inside #panelId.
// For singleSelect, the chosen value is also mirrored to #hiddenInputId so existing readers don't change.
function _buildSearchableMultiselect(opts){
  const { panelId, placeholder, options, selected, singleSelect, checkboxExtra='', hiddenInputId='' } = opts;
  const chipsHTML = options
    .filter(o => selected.has(o.value))
    .map(o => `<span class="esn-msm-chip" data-value="${o.value}">
        ${o.label}<span class="x" title="Remove"
          onclick="_msmRemove('${panelId}','${o.value}',${singleSelect ? 'true' : 'false'},'${hiddenInputId}')">×</span>
      </span>`)
    .join('');
  const rowsHTML = options.map(o => {
    const checked = selected.has(o.value) ? 'checked' : '';
    return `<label class="esn-check-row" data-label="${o.label.toLowerCase()}">
      <input type="checkbox" value="${o.value}" ${checkboxExtra} ${checked}
        onchange="_msmToggle('${panelId}','${o.value}',${singleSelect ? 'true' : 'false'},'${hiddenInputId}')"/>
      ${o.label}
    </label>`;
  }).join('');
  return `<div class="esn-msm-chips" id="${panelId}-chips">${chipsHTML}</div>
    <input type="text" placeholder="${placeholder}"
           style="width:100%;font-size:.78rem;padding:3px 7px;margin-bottom:4px;"
           oninput="_msmFilter(this,'${panelId}')"/>
    <div class="esn-msm-panel" id="${panelId}">${rowsHTML}</div>`;
}

// Filter handler — hides rows whose data-label doesn't contain the query.
function _msmFilter(inputEl, panelId){
  const q = inputEl.value.toLowerCase();
  document.querySelectorAll(`#${panelId} .esn-check-row`).forEach(row => {
    row.style.display = row.dataset.label?.includes(q) ? '' : 'none';
  });
}

// Toggle handler — fired on checkbox change. For singleSelect, unchecks all siblings first.
// Rebuilds the chip row and, when relevant, the hidden mirror input.
function _msmToggle(panelId, value, singleSelect, hiddenInputId){
  const panel = document.getElementById(panelId);
  if(!panel) return;
  if(singleSelect){
    // Uncheck every other box so the radio-like single value is enforced
    panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
      if(cb.value !== value) cb.checked = false;
    });
  }
  _msmRefreshChips(panelId, singleSelect, hiddenInputId);
}

// Removes a single value (via the chip × button).
function _msmRemove(panelId, value, singleSelect, hiddenInputId){
  const panel = document.getElementById(panelId);
  if(!panel) return;
  const cb = panel.querySelector(`input[type=checkbox][value="${value}"]`);
  if(cb) cb.checked = false;
  _msmRefreshChips(panelId, singleSelect, hiddenInputId);
}

// Rebuilds the chip bar from currently checked checkboxes and updates the hidden mirror input.
function _msmRefreshChips(panelId, singleSelect, hiddenInputId){
  const panel = document.getElementById(panelId);
  const chips = document.getElementById(panelId + '-chips');
  if(!panel || !chips) return;
  const checked = Array.from(panel.querySelectorAll('input[type=checkbox]:checked'));
  chips.innerHTML = checked.map(cb => {
    const label = cb.parentElement.textContent.trim();
    return `<span class="esn-msm-chip" data-value="${cb.value}">
      ${label}<span class="x" title="Remove"
        onclick="_msmRemove('${panelId}','${cb.value}',${singleSelect ? 'true' : 'false'},'${hiddenInputId}')">×</span>
    </span>`;
  }).join('');
  if(hiddenInputId){
    const hidden = document.getElementById(hiddenInputId);
    if(hidden) hidden.value = checked[0]?.value || '';
  }
}

// Shows existing box alarms for this ESN inside the modal.
function _renderESNBoxAlarms(esnId) {
  const section = document.getElementById('esn-ba-section');
  if (!esnId) { section.style.display = 'none'; return; }
  section.style.display = '';
  const alarms = boxAlarms.filter(b => b.esnId === esnId);
  const list = document.getElementById('esn-ba-list');
  if (!alarms.length) {
    list.innerHTML = '<div class="esn-assign-empty">No box alarms for this ESN yet.</div>';
  } else {
    list.innerHTML = alarms.map(ba => {
      const mTypes = ba.missionTypes.length
        ? ba.missionTypes.map(k => BAM_CONFIG.missions[k]?.label || k).join(', ')
        : 'All calls';
      const reqs = _baReqsLabel(ba.requirements);
      return `<div class="ba-row">
        <div class="ba-info">
          <div class="ba-name">${ba.name}</div>
          <div class="ba-meta">${mTypes} · ${reqs}</div>
        </div>
        <div class="ba-actions">
          <button class="btn-sm danger" onclick="deleteBoxAlarm('${ba.id}',this.closest('.ba-row'))">Del</button>
        </div>
      </div>`;
    }).join('');
  }
}

// Saves the ESN (create or update) when the modal confirm button is clicked.
function confirmESNModal() {
  const name = document.getElementById('esn-name-input').value.trim();
  if (!name) { setStatus('⚠️ Enter a name for this ESN.'); return; }

  const editId   = document.getElementById('esn-modal').dataset.editId;
  const color    = document.getElementById('esn-color-custom')?.value || '#f0a500';
  const labelSize = document.getElementById('esn-label-size')?.value || 'md';
  const excludeFromGeneration = !!document.getElementById('esn-exclude-from-gen')?.checked;

  const assignments = { fire: [], ems: [], police: [] };
  // Only coverage checkboxes have data-svctype; the DC checkboxes don't, so this naturally skips them.
  document.querySelectorAll('#esn-assignments input[type=checkbox][data-svctype]:checked').forEach(cb => {
    assignments[cb.dataset.svctype].push(cb.value);
  });

  // D2 — persist DC assignment: remove this ESN from all DCs, then re-add to selected
  const selectedDCId = document.getElementById('esn-dc-assign')?.value || '';

  if (editId) {
    const esn = esns.find(e => e.id === editId);
    if (esn) {
      esn.name = name;
      esn.color = color;
      esn.labelSize = labelSize;
      esn.assignments = assignments;
      esn.excludeFromGeneration = excludeFromGeneration;
      esn.polygon?.setStyle({ color, fillColor: color });
      esn.polygon?.setTooltipContent(`<span style="color:${color};">${name}</span>`);
      _applyTooltipStyle(esn.polygon, color, labelSize);
    }
    // Update DC assignment
    dispatchCenters.forEach(dc => {
      dc.assignedESNs = dc.assignedESNs.filter(eid => eid !== editId);
    });
    if(selectedDCId){
      const dc = dispatchCenters.find(d => d.id === selectedDCId);
      if(dc && !dc.assignedESNs.includes(editId)) dc.assignedESNs.push(editId);
    }
  } else {
    const newESN = _createESN(name, [...drawCoords], assignments, color, labelSize);
    if(newESN) newESN.excludeFromGeneration = excludeFromGeneration;
    drawCoords = [];
    // Assign to selected DC
    if(selectedDCId && newESN){
      const dc = dispatchCenters.find(d => d.id === selectedDCId);
      if(dc && !dc.assignedESNs.includes(newESN.id)) dc.assignedESNs.push(newESN.id);
    }
  }

  closeESNModal();
  renderESNList();
  renderDCList();
  // Phase 5A — ESN coverage assignments drive station-to-DC mapping, so refresh
  // anything that displays unit prefixes when those assignments change.
  if(typeof renderStationList === 'function')       renderStationList();
  if(typeof renderUnitList === 'function')          renderUnitList();
  if(typeof refreshAllUnitMapLabels === 'function') refreshAllUnitMapLabels();
  // Phase 5E bug-fix — keep the Database Health panel in sync with the live
  // ESN list (its OSM cache rows are keyed on esn.id).
  if(typeof refreshDatabaseHealthIfVisible === 'function') refreshDatabaseHealthIfVisible();
  // Volunteer auto-migration on ESN edit was removed (abstract-assembly
  // refactor — volunteers no longer have physical home locations).
  setStatus(`✅ ESN "${name}" saved.`);
}

// Creates the Leaflet polygon and adds the ESN to the esns array.
function _createESN(name, coords, assignments, color, labelSize) {
  color     = color     || '#f0a500';
  labelSize = labelSize || 'md';
  const id  = 'esn_' + Date.now();

  const polygon = L.polygon(coords, {
    color, weight: 2, fillColor: color, fillOpacity: .07
  }).addTo(map);
  polygon.bindTooltip(`<span style="color:${color};">${name}</span>`, {
    permanent: true, direction: 'center', className: 'esn-label'
  });
  _applyTooltipStyle(polygon, color, labelSize);
  polygon.on('click', () => openESNModal(id));

  const esn = { id, name, coords, assignments, inService: true, color, labelSize, polygon };
  _initOSMCache(esn);
  esns.push(esn);
  return esn;
}

// Applies font-size and visibility to a tooltip element based on labelSize.
// Uses setTimeout because Leaflet may not have attached the element yet.
function _applyTooltipStyle(polygon, color, labelSize) {
  setTimeout(() => {
    const el = polygon.getTooltip()?.getElement();
    if (!el) return;
    const sizeMap = { hidden: '', sm: '9px', md: '11px', lg: '15px' };
    el.style.display    = labelSize === 'hidden' ? 'none' : '';
    el.style.fontSize   = sizeMap[labelSize] || '11px';
    el.style.fontWeight = '700';
  }, 60);
}

// Deletes an ESN after confirmation.
function deleteESN(id) {
  if (!confirm('Delete this ESN zone? Box alarms assigned to it will also be removed.')) return;
  const esn = esns.find(e => e.id === id);
  esn?.polygon?.remove();
  esns = esns.filter(e => e.id !== id);
  boxAlarms = boxAlarms.filter(b => b.esnId !== id);
  // Strip the deleted ESN from every DC's assignedESNs so DC card counts stay accurate.
  dispatchCenters.forEach(dc => { dc.assignedESNs = dc.assignedESNs.filter(eid => eid !== id); });
  renderESNList();
  renderDCList();
  if(typeof refreshDatabaseHealthIfVisible === 'function') refreshDatabaseHealthIfVisible();
  setStatus('🗑 ESN deleted.');
}

// Toggles the in/out of service state of an ESN.
function toggleESNService(id) {
  const esn = esns.find(e => e.id === id);
  if (!esn) return;
  esn.inService = !esn.inService;
  esn.polygon?.setStyle({
    opacity:     esn.inService ? 1   : .3,
    fillOpacity: esn.inService ? .07 : .02
  });
  renderESNList();
  setStatus(`ESN "${esn.name}" — ${esn.inService ? 'IN SERVICE' : 'OUT OF SERVICE'}`);
}

// =============================================================================
// LAYER VISIBILITY
// Called by the layer toggle control in index.html.
// =============================================================================

function setESNLayerVisible(visible) {
  esns.forEach(e => {
    if (visible) { try { e.polygon?.addTo(map); } catch(x){} }
    else e.polygon?.remove();
  });
}

function setDCLayerVisible(visible) {
  dispatchCenters.forEach(d => {
    if (visible) { try { d.marker?.addTo(map); } catch(x){} }
    else d.marker?.remove();
  });
}

// =============================================================================
// ESN LIST (sidebar)
// =============================================================================

function renderESNList() {
  const searchEl = document.getElementById('esn-search');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  // Typing in search clears the DC filter so they don't conflict
  if (q && _selectedDCFilter !== null) {
    _selectedDCFilter = null;
    renderDCList();
  }
  _renderFilteredESNList();
}

// Renders the ESN list applying both the search term and the DC filter.
function _renderFilteredESNList() {
  const el = document.getElementById('esn-scroll');
  if (!el) return;
  const searchEl = document.getElementById('esn-search');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';

  // Determine which ESN ids belong to the selected DC (if any)
  let dcESNIds = null;
  if (_selectedDCFilter) {
    const dc = dispatchCenters.find(d => d.id === _selectedDCFilter);
    dcESNIds = dc ? new Set(dc.assignedESNs) : new Set();
  }

  const filtered = esns.filter(e => {
    if (q && !e.name.toLowerCase().includes(q)) return false;
    if (dcESNIds !== null && !dcESNIds.has(e.id)) return false;
    return true;
  });

  if (!filtered.length) {
    if (!esns.length) {
      el.innerHTML = '<div class="empty-msg">No ESN zones yet.<br>Click "Draw ESN Zone" and draw a polygon on the map.</div>';
    } else if (_selectedDCFilter) {
      const dc = dispatchCenters.find(d => d.id === _selectedDCFilter);
      el.innerHTML = `<div class="empty-msg">No ESNs assigned to ${dc?.name || 'this DC'} yet.<br>Click the DC card again to show all ESNs.</div>`;
    } else {
      el.innerHTML = '<div class="empty-msg">No ESNs match search.</div>';
    }
    return;
  }

  // Show a filter hint banner when a DC is selected
  const filterBanner = _selectedDCFilter
    ? (() => {
        const dc = dispatchCenters.find(d => d.id === _selectedDCFilter);
        return `<div style="font-size:.8rem;color:var(--gold);padding:4px 0 6px;border-bottom:1px solid var(--border);margin-bottom:6px;">
          Showing ESNs for: <b>${dc?.name || ''}</b> — <a href="#" style="color:var(--muted);" onclick="event.preventDefault();_selectDCFilter('${_selectedDCFilter}')">Clear filter</a>
        </div>`;
      })()
    : '';

  el.innerHTML = filterBanner + filtered.map(esn => {
    const oos = !esn.inService;
    const col = esn.color || '#f0a500';
    const asmSummary = ['fire', 'ems', 'police'].map(t => {
      const n = (esn.assignments[t] || []).length;
      return n ? `<span class="tag-pill" style="border-color:var(--${t})">${t}: ${n}</span>` : null;
    }).filter(Boolean).join('');
    const baCount = boxAlarms.filter(b => b.esnId === esn.id).length;
    return `<div class="scard${oos ? ' oos' : ''}">
      <div class="sn" style="color:${col};">${esn.name}${oos ? ' <span class="oos-badge">OOS</span>' : ''}</div>
      <div class="su" style="margin-top:4px;">${asmSummary || '<span style="color:var(--muted);font-size:.8rem;">No stations assigned</span>'}</div>
      ${baCount ? `<div style="font-size:.8rem;color:var(--muted);margin-top:3px;">📋 ${baCount} box alarm${baCount > 1 ? 's' : ''}</div>` : ''}
      <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;">
        <button class="btn-sm" onclick="openESNModal('${esn.id}')">Edit</button>
        <button class="btn-sm" onclick="openBoxAlarmModal('${esn.id}')">+ Box Alarm</button>
        <button class="btn-sm" onclick="toggleESNService('${esn.id}')">${oos ? 'In Svc' : 'OOS'}</button>
        <button class="btn-sm danger" onclick="deleteESN('${esn.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

// =============================================================================
// OSM DATA CACHE — per-ESN building and road node cache fetched from Overpass.
// =============================================================================

// Initializes an empty OSM cache on an ESN object.
function _initOSMCache(esn) {
  esn._osmCache = {
    fetched: false, fetching: false, fetchedAt: 0,
    buildings: [],   // { lat, lng }
    majorNodes: [],  // { lat, lng, intersectionCount }
    minorNodes: []   // { lat, lng, intersectionCount }
  };
}

// Fetches and caches buildings + road nodes for an ESN via Overpass API.
// Called lazily the first time a spawn needs OSM data for this ESN.
async function _fetchESNOSMData(esn) {
  if (!esn._osmCache) _initOSMCache(esn);
  const cache = esn._osmCache;
  if (cache.fetching) return;
  const ttl = BAM_CONFIG.spawn.osmCacheTTLMs || 0;
  if (cache.fetched && ttl > 0 && Date.now() - cache.fetchedAt < ttl) return;

  cache.fetching = true;
  try {
    const polyStr = esn.coords.map(c => `${c[0]} ${c[1]}`).join(' ');
    const hw = [
      ...BAM_CONFIG.spawn.majorHighways,
      ...BAM_CONFIG.spawn.minorHighways
    ].join('|');
    const query = `[out:json][timeout:25];
(
  way["building"](poly:"${polyStr}");
  way["highway"~"^(${hw})$"](poly:"${polyStr}");
);
(._;>;);
out center;`;

    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    const data = await resp.json();

    // Count how many ways reference each node (intersection detection)
    const nodeWayCount = {};
    data.elements.filter(el => el.type === 'way').forEach(way => {
      (way.nodes || []).forEach(nid => {
        nodeWayCount[nid] = (nodeWayCount[nid] || 0) + 1;
      });
    });
    const nodeById = {};
    data.elements.filter(el => el.type === 'node').forEach(n => { nodeById[n.id] = n; });

    const major = new Set(BAM_CONFIG.spawn.majorHighways);
    cache.buildings = [];
    cache.majorNodes = [];
    cache.minorNodes = [];

    data.elements.filter(el => el.type === 'way').forEach(way => {
      if (way.tags?.building) {
        // Use Overpass-supplied center or average nodes
        const clat = way.center?.lat;
        const clng = way.center?.lon;
        if (clat && clng) cache.buildings.push({ lat: clat, lng: clng });
      } else if (way.tags?.highway) {
        const isMajor = major.has(way.tags.highway);
        (way.nodes || []).forEach(nid => {
          const n = nodeById[nid];
          if (!n) return;
          const entry = { lat: n.lat, lng: n.lon, intersectionCount: nodeWayCount[nid] || 1 };
          if (isMajor) cache.majorNodes.push(entry);
          else cache.minorNodes.push(entry);
        });
      }
    });

    cache.fetched  = true;
    cache.fetchedAt = Date.now();
    console.log(`OSM cache for "${esn.name}": ${cache.buildings.length} buildings, ${cache.majorNodes.length} major nodes, ${cache.minorNodes.length} minor nodes`);
  } catch (e) {
    console.warn(`OSM fetch failed for ESN "${esn.name}":`, e);
  } finally {
    cache.fetching = false;
  }
}

// =============================================================================
// ESN-AWARE SPAWN LOCATION
// Called from spawnIncident() in index.html when ESNs exist.
// Returns { lat, lng, esnId } or null if no ESN is eligible for this call type.
// Respects per-DC call cap and uses OSM cache for accurate location placement.
// =============================================================================

function getESNSpawnLocation(mCfg) {
  const callType   = mCfg.category;
  const neededTags = new Set(mCfg.requirements.flat());
  const spawnMode  = mCfg.spawnMode || 'random';
  const w = BAM_CONFIG.spawn;

  const eligible = esns.filter(esn => {
    if (!esn.inService) return false;
    // Must have an assigned station for this call type
    const hasStation = (esn.assignments[callType] || []).some(sid => {
      const st = stations.find(s => s.id === sid);
      if (!st || st.inService === false) return false;
      return st.units.some(u =>
        BAM_CONFIG.unitTypes[u.typeKey]?.tags.some(t => neededTags.has(t))
      );
    });
    if (!hasStation) return false;

    // Must be covered by an active DC — check DC cap
    const dc = dispatchCenters.find(d =>
      d.inService !== false && d.assignedESNs.includes(esn.id)
    );
    if (!dc) return false;

    // Count unique stations in this DC's assigned ESNs for cap calculation
    const dcStations = new Set();
    dc.assignedESNs.forEach(eid => {
      const e = esns.find(x => x.id === eid);
      ['fire', 'ems', 'police'].forEach(t =>
        (e?.assignments[t] || []).forEach(sid => dcStations.add(sid))
      );
    });
    const cap = dcStations.size + 1;
    const activeInDC = (typeof incidents !== 'undefined' ? incidents : []).filter(i =>
      i.status !== 'resolved' && dc.assignedESNs.includes(i.esnId)
    ).length;
    return activeInDC < cap;
  });

  if (!eligible.length) return null;

  // Pick a random eligible ESN
  const esn = eligible[Math.floor(Math.random() * eligible.length)];

  // Ensure OSM cache is populated (trigger async fetch if needed)
  if (!esn._osmCache) _initOSMCache(esn);
  const cache = esn._osmCache;
  if (!cache.fetched && !cache.fetching) _fetchESNOSMData(esn);

  // ── Building spawn
  if (spawnMode === 'building' && cache.buildings.length > 0) {
    const b = cache.buildings[Math.floor(Math.random() * cache.buildings.length)];
    return { lat: b.lat, lng: b.lng, esnId: esn.id };
  }

  // ── Road node spawn (major or any)
  const hasMajor = cache.majorNodes.length > 0;
  const hasMinor = cache.minorNodes.length > 0;
  if ((spawnMode === 'road_major' || spawnMode === 'road_any') && (hasMajor || hasMinor)) {
    const pool = [];
    cache.majorNodes.forEach(n => {
      const wt = w.majorRoadWeight * (1 + (n.intersectionCount - 1) * w.intersectionWeight);
      pool.push({ n, wt });
    });
    if (spawnMode === 'road_any') {
      cache.minorNodes.forEach(n => {
        const wt = 1 + (n.intersectionCount - 1) * w.intersectionWeight;
        pool.push({ n, wt });
      });
    }
    if (pool.length > 0) {
      const totalW = pool.reduce((s, x) => s + x.wt, 0);
      let r = Math.random() * totalW;
      for (const { n, wt } of pool) { r -= wt; if (r <= 0) return { lat: n.lat, lng: n.lng, esnId: esn.id }; }
      const last = pool[pool.length - 1];
      return { lat: last.n.lat, lng: last.n.lng, esnId: esn.id };
    }
  }

  // ── Fallback: random point in polygon (caller will OSRM-snap it)
  const [lat, lng] = _randomPointInPolygon(esn.coords);
  return { lat, lng, esnId: esn.id };
}

// =============================================================================
// GEOMETRY UTILITIES
// =============================================================================

function _randomPointInPolygon(coords) {
  const lats = coords.map(c => c[0]);
  const lngs = coords.map(c => c[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  for (let i = 0; i < 50; i++) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lng = minLng + Math.random() * (maxLng - minLng);
    if (_pointInPolygon([lat, lng], coords)) return [lat, lng];
  }
  return [
    lats.reduce((a, b) => a + b, 0) / lats.length,
    lngs.reduce((a, b) => a + b, 0) / lngs.length
  ];
}

function _pointInPolygon(point, polygon) {
  const [y, x] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// =============================================================================
// DISPATCH CENTERS
// =============================================================================

function startPlaceDispatchCenter() {
  setPlacing(null);
  map.getContainer().style.cursor = 'crosshair';
  document.getElementById('btn-dispatch-center')?.classList.add('active');
  setStatus('Click map to place Dispatch Center.');
  map.once('click', e => {
    map.getContainer().style.cursor = '';
    document.getElementById('btn-dispatch-center')?.classList.remove('active');
    _openDCCreateModal(e.latlng);
  });
}

function _openDCCreateModal(latlng) {
  document.getElementById('dc-latlng').value = `${latlng.lat},${latlng.lng}`;
  document.getElementById('dc-name-input').value = '';
  // Phase 5A — reset prefix fields for a new DC
  const pfx = document.getElementById('dc-unit-prefix');
  if(pfx) pfx.value = '';
  const fmt = document.getElementById('dc-prefix-format');
  if(fmt) fmt.value = 'bracket';
  document.getElementById('dc-modal').dataset.editId = '';
  const titleEl = document.getElementById('dc-modal-title');
  if (titleEl) titleEl.textContent = 'New Dispatch Center';
  _renderDCESNList();
  document.getElementById('dc-modal').classList.add('open');
  setTimeout(() => document.getElementById('dc-name-input').focus(), 40);
}

function _renderDCESNList(preChecked = []) {
  // Clear search input when re-rendering
  const searchEl = document.getElementById('dc-esn-search');
  if(searchEl) searchEl.value = '';
  const el = document.getElementById('dc-esn-checkboxes');
  if (!esns.length) {
    el.innerHTML = '<div class="esn-assign-empty">No ESN zones exist yet.</div>';
    return;
  }
  el.innerHTML = esns.map(e => {
    const checked = preChecked.includes(e.id) ? 'checked' : '';
    return `<label class="esn-check-row" data-esn-name="${e.name.toLowerCase()}">
      <input type="checkbox" value="${e.id}" ${checked}/>
      ${e.name}
    </label>`;
  }).join('');
}

// Filters the DC ESN checkbox list in real-time by name.
function _filterDCESNSearch(query){
  const q = query.toLowerCase();
  document.querySelectorAll('#dc-esn-checkboxes .esn-check-row').forEach(row => {
    row.style.display = row.dataset.esnName?.includes(q) ? '' : 'none';
  });
}

function confirmDCModal() {
  const name = document.getElementById('dc-name-input').value.trim();
  if (!name) { setStatus('⚠️ Enter a name for the Dispatch Center.'); return; }

  const assignedESNs = [...document.querySelectorAll('#dc-esn-checkboxes input:checked')].map(cb => cb.value);
  const editId = document.getElementById('dc-modal').dataset.editId;

  if (editId) {
    // Editing an existing DC
    const dc = dispatchCenters.find(d => d.id === editId);
    if (dc) {
      dc.name         = name;
      dc.assignedESNs = assignedESNs;
      // Phase 5A — pull updated prefix + format from modal
      dc.unitPrefix   = document.getElementById('dc-unit-prefix')?.value.trim() || '';
      dc.prefixFormat = document.getElementById('dc-prefix-format')?.value      || 'bracket';
      dc.marker?.setIcon(_buildDCIcon(name));
      dc.marker?.bindTooltip(name + ' — Dispatch Center');
    }
    closeDCModal();
    renderDCList();
    // Re-render any open station-related views so prefix changes appear immediately
    if(typeof renderStationList === 'function')       renderStationList();
    if(typeof renderUnitList === 'function')          renderUnitList();
    if(typeof refreshAllUnitMapLabels === 'function') refreshAllUnitMapLabels();
    setStatus(`✅ Dispatch Center "${name}" updated.`);
  } else {
    // Creating a new DC
    const [lat, lng] = document.getElementById('dc-latlng').value.split(',').map(Number);
    const id     = 'dc_' + Date.now();
    const marker = _buildDCMarker(id, name, lat, lng);
    // Phase 5A — DC unit prefix + format come from modal inputs (default to empty/bracket)
    const unitPrefix   = document.getElementById('dc-unit-prefix')?.value.trim() || '';
    const prefixFormat = document.getElementById('dc-prefix-format')?.value      || 'bracket';
    dispatchCenters.push({
      id, name, lat, lng, assignedESNs, inService: true, marker,
      unitPrefix, prefixFormat
    });
    closeDCModal();
    renderDCList();
    // Refresh views so the new prefix shows immediately
    if(typeof renderStationList === 'function')       renderStationList();
    if(typeof renderUnitList === 'function')          renderUnitList();
    if(typeof refreshAllUnitMapLabels === 'function') refreshAllUnitMapLabels();
    setStatus(`✅ Dispatch Center "${name}" placed.`);
  }
}

function closeDCModal() {
  const modal = document.getElementById('dc-modal');
  modal.classList.remove('open');
  modal.dataset.editId = '';
  // Reset title back to default for next new-DC creation
  const titleEl = document.getElementById('dc-modal-title');
  if (titleEl) titleEl.textContent = 'New Dispatch Center';
}

function _buildDCIcon(name) {
  return L.divIcon({
    className: '',
    html: `<div class="dc-marker-label">📡 ${name.toUpperCase()}</div>`,
    iconAnchor: [0, 10]
  });
}

function _buildDCMarker(id, name, lat, lng) {
  const marker = L.marker([lat, lng], { icon: _buildDCIcon(name) }).addTo(map);
  marker.bindTooltip(name + ' — Dispatch Center');
  marker.on('click', () => openDCSummary(id));
  return marker;
}

// Calculates the call cap for a DC: unique stations across all assigned ESNs + 1.
function _getDCCap(dc) {
  const stationIds = new Set();
  dc.assignedESNs.forEach(eid => {
    const esn = esns.find(e => e.id === eid);
    if (!esn) return;
    ['fire', 'ems', 'police'].forEach(t =>
      (esn.assignments[t] || []).forEach(sid => stationIds.add(sid))
    );
  });
  return stationIds.size + 1;
}

// Counts active incidents (not resolved) in the ESNs served by a DC.
function _getDCActiveCallCount(dc) {
  return (typeof incidents !== 'undefined' ? incidents : []).filter(i =>
    i.status !== 'resolved' && dc.assignedESNs.includes(i.esnId)
  ).length;
}

function openDCSummary(id) {
  const dc = dispatchCenters.find(d => d.id === id);
  if (!dc) return;

  const cap     = _getDCCap(dc);
  const active  = _getDCActiveCallCount(dc);
  const capBase = cap - 1;  // number of unique stations
  const assignedESNObjs = dc.assignedESNs.map(eid => esns.find(e => e.id === eid)).filter(Boolean);

  let html = `<div class="dc-status-row">
    <span>Status:</span>
    <span style="font-weight:700;color:${dc.inService ? 'var(--green)' : 'var(--accent)'}">
      ${dc.inService ? 'IN SERVICE' : 'OUT OF SERVICE'}
    </span>
  </div>
  <div class="dc-status-row" style="margin-top:6px;">
    <span>Active calls:</span>
    <span style="font-family:var(--mono);color:${active >= cap ? 'var(--accent)' : 'var(--gold)'}">
      ${active} / ${cap}
    </span>
  </div>
  <div style="font-size:.8rem;color:var(--muted);margin-top:2px;">
    Call cap: ${cap} (${capBase} station${capBase !== 1 ? 's' : ''} + 1)
  </div>`;

  if (assignedESNObjs.length) {
    html += `<div class="section-title" style="margin-top:10px;">Assigned ESN Zones</div>`;
    const colDefs = [
      { type:'fire',   icon:'🔴', color:'var(--fire)'   },
      { type:'ems',    icon:'🔵', color:'var(--ems)'    },
      { type:'police', icon:'🟣', color:'var(--police)' },
    ];
    assignedESNObjs.forEach(esn => {
      const cols = colDefs.map(({type, icon, color}) => {
        const names = (esn.assignments[type] || [])
          .map(sid => stations.find(s => s.id === sid)?.name)
          .filter(Boolean);
        return `<div>
          <div style="font-size:.72rem;font-weight:700;color:${color};margin-bottom:3px;">${icon} ${type.toUpperCase()}</div>
          ${names.length
            ? names.map(n => `<div style="font-size:.75rem;color:var(--text);">${n}</div>`).join('')
            : `<div style="font-size:.74rem;color:var(--muted);">—</div>`}
        </div>`;
      }).join('');
      html += `<div class="scard" style="margin-bottom:6px;">
        <div class="sn" style="margin-bottom:6px;">${esn.name}${!esn.inService ? ' <span class="oos-badge">OOS</span>' : ''}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">${cols}</div>
      </div>`;
    });
  } else {
    html += '<div class="empty-msg" style="margin-top:8px;">No ESNs assigned to this center.</div>';
  }

  document.getElementById('dc-summary-name').textContent = dc.name;
  document.getElementById('dc-summary-body').innerHTML = html;
  document.getElementById('dc-summary-oos-btn').textContent = dc.inService ? 'Place Out of Service' : 'Return to Service';
  document.getElementById('dc-summary-oos-btn').onclick = () => { _toggleDCService(id); openDCSummary(id); };
  document.getElementById('dc-summary-edit-btn').onclick = () => { closeDCSummary(); openDCEditModal(id); };
  document.getElementById('dc-summary-modal').classList.add('open');
}

// Opens the DC create/edit modal pre-filled for editing an existing DC.
function openDCEditModal(id) {
  const dc = dispatchCenters.find(d => d.id === id);
  if (!dc) return;
  // Reuse the create modal but pre-fill it and tag the edit id
  document.getElementById('dc-modal').dataset.editId = id;
  document.getElementById('dc-modal-title').textContent = 'Edit Dispatch Center';
  document.getElementById('dc-name-input').value = dc.name;
  document.getElementById('dc-latlng').value = `${dc.lat},${dc.lng}`;
  // Phase 5A — pre-fill prefix + format
  const pfx = document.getElementById('dc-unit-prefix');
  if(pfx) pfx.value = dc.unitPrefix || '';
  const fmt = document.getElementById('dc-prefix-format');
  if(fmt) fmt.value = dc.prefixFormat || 'bracket';
  _renderDCESNList(dc.assignedESNs);
  document.getElementById('dc-modal').classList.add('open');
  setTimeout(() => document.getElementById('dc-name-input').focus(), 40);
}

// Renders the DC sidebar section showing all dispatch centers.
// DC cards are clickable: clicking one filters the ESN list to that DC's ESNs only.
// Clicking the same DC again clears the filter (show all ESNs).
function renderDCList() {
  const el = document.getElementById('dc-list');
  if (!el) return;
  if (!dispatchCenters.length) {
    el.innerHTML = '<div class="empty-msg">No dispatch centers placed yet.</div>';
    return;
  }
  el.innerHTML = dispatchCenters.map(dc => {
    const cap      = _getDCCap(dc);
    const active   = _getDCActiveCallCount(dc);
    const oos      = !dc.inService;
    const selected = _selectedDCFilter === dc.id;
    return `<div class="scard dc-filter-card${oos ? ' oos' : ''}${selected ? ' active' : ''}"
        onclick="_selectDCFilter('${dc.id}')" title="Click to filter ESN list to this DC">
      <div class="sn">📡 ${dc.name}${oos ? ' <span class="oos-badge">OOS</span>' : ''}</div>
      <div class="su" style="margin-top:3px;">
        ${dc.assignedESNs.length} ESN${dc.assignedESNs.length !== 1 ? 's' : ''}
        &nbsp;·&nbsp;
        <span style="font-family:var(--mono);color:${active >= cap ? 'var(--accent)' : 'var(--gold)'}">
          ${active}/${cap} calls
        </span>
      </div>
      <div class="scard-actions" style="margin-top:5px;" onclick="event.stopPropagation()">
        <button class="btn-sm" onclick="openDCEditModal('${dc.id}')">Edit</button>
        <button class="btn-sm" onclick="_toggleDCService('${dc.id}');renderDCList()">${oos ? 'In Svc' : 'OOS'}</button>
      </div>
    </div>`;
  }).join('');
}

// Toggles the DC filter: clicking a DC shows only its ESNs; clicking it again clears the filter.
function _selectDCFilter(dcId) {
  const turningOn = _selectedDCFilter !== dcId;
  _selectedDCFilter = (_selectedDCFilter === dcId) ? null : dcId;
  renderDCList();
  // Clear the search bar when a DC filter is selected, so both don't fight each other
  const searchEl = document.getElementById('esn-search');
  if(searchEl && _selectedDCFilter !== null) searchEl.value = '';
  _renderFilteredESNList();
  // UX: when filter is turned ON from the DC tab, hop to the ESN tab where the filtered list lives.
  if(turningOn && typeof switchOpsSubTab === 'function'
     && document.getElementById('ops-sub-dcs')?.style.display !== 'none'){
    switchOpsSubTab('esns');
  }
}

function closeDCSummary() {
  document.getElementById('dc-summary-modal').classList.remove('open');
}

function _toggleDCService(id) {
  const dc = dispatchCenters.find(d => d.id === id);
  if (!dc) return;
  dc.inService = !dc.inService;
  setStatus(`Dispatch Center "${dc.name}" — ${dc.inService ? 'IN SERVICE' : 'OUT OF SERVICE'}`);
}

// =============================================================================
// BOX ALARMS
// =============================================================================

function openBoxAlarmModal(esnId) {
  const esn = esns.find(e => e.id === esnId);
  if (!esn) return;

  document.getElementById('ba-esn-id').value = esnId;
  document.getElementById('ba-esn-label').textContent = esn.name;
  document.getElementById('ba-name-input').value = '';

  const missionEl = document.getElementById('ba-mission-types');
  missionEl.innerHTML = Object.entries(BAM_CONFIG.missions)
    .filter(([, m]) => m.spawnWeight >= 0)
    .map(([k, m]) => `<label class="esn-check-row">
      <input type="checkbox" value="${k}"/>
      ${m.label}
    </label>`).join('');

  document.getElementById('ba-req-rows').innerHTML = '';
  _addBASlot();
  document.getElementById('ba-modal').classList.add('open');
  setTimeout(() => document.getElementById('ba-name-input').focus(), 40);
}

function closeBoxAlarmModal() {
  document.getElementById('ba-modal').classList.remove('open');
}

// Adds a new requirement slot to the box alarm modal.
// Each slot = one resource position; prefs = ordered list of unit or tag fallbacks.
function _addBASlot() {
  const container = document.getElementById('ba-req-rows');
  const slotNum   = container.children.length + 1;
  const slot = document.createElement('div');
  slot.className = 'ba-slot';
  slot.style.cssText = 'background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:8px 10px;margin-bottom:8px;';
  slot.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <span style="font-size:.78rem;font-weight:700;color:var(--gold);">Slot ${slotNum}</span>
      <button class="btn-sm danger" onclick="this.closest('.ba-slot').remove();_renumberBASlots()" style="padding:2px 7px;font-size:.75rem;">Remove Slot</button>
    </div>
    <div class="ba-pref-list" style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px;"></div>
    <div style="display:flex;gap:5px;">
      <button class="btn-sm" onclick="_baAddTagPref(this)" style="font-size:.75rem;">+ Tag Fallback</button>
      <button class="btn-sm" onclick="_baAddUnitPref(this)" style="font-size:.75rem;">+ Specific Unit</button>
    </div>`;
  container.appendChild(slot);
  // Add one default tag pref to the new slot
  _baAddTagPref(slot.querySelector('.btn-sm'));
}

// Re-numbers slot headers after a slot is removed.
function _renumberBASlots(){
  document.querySelectorAll('#ba-req-rows .ba-slot').forEach((slot, i) => {
    const label = slot.querySelector('.ba-slot-label');
    if(label) label.textContent = `Slot ${i + 1}`;
  });
}

// Appends a tag-selector preference row to the slot containing the clicked button.
function _baAddTagPref(btn){
  const prefList = btn.closest('.ba-slot').querySelector('.ba-pref-list');
  const allTags  = [...new Set(Object.values(BAM_CONFIG.unitTypes).flatMap(u => u.tags))].sort();
  const row = document.createElement('div');
  row.className = 'ba-pref-row';
  row.dataset.prefType = 'tag';
  row.style.cssText = 'display:flex;align-items:center;gap:5px;';
  row.innerHTML = `
    <span style="font-size:.78rem;color:var(--muted);min-width:32px;">🏷</span>
    <select class="ba-pref-tag" style="flex:1;font-size:.8rem;padding:3px 6px;">
      ${allTags.map(t => `<option value="${t}">${t}</option>`).join('')}
    </select>
    <button class="btn-sm" onclick="const p=this.closest('.ba-pref-row');p.previousElementSibling&&p.parentNode.insertBefore(p,p.previousElementSibling);" style="padding:2px 5px;" title="Move up">▲</button>
    <button class="btn-sm" onclick="const p=this.closest('.ba-pref-row');p.nextElementSibling&&p.parentNode.insertBefore(p.nextElementSibling,p);" style="padding:2px 5px;" title="Move down">▼</button>
    <button class="btn-sm danger" onclick="this.closest('.ba-pref-row').remove()" style="padding:2px 6px;">✕</button>`;
  prefList.appendChild(row);
}

// Appends a specific-unit selector preference row to the slot.
function _baAddUnitPref(btn){
  const prefList = btn.closest('.ba-slot').querySelector('.ba-pref-list');
  const allUnits = typeof getAllUnits === 'function' ? getAllUnits() : [];
  const row = document.createElement('div');
  row.className = 'ba-pref-row';
  row.dataset.prefType = 'unit';
  row.style.cssText = 'display:flex;align-items:center;gap:5px;';
  const unitOpts = allUnits.length
    ? allUnits.map(({station,unit}) =>
        `<option value="${unit.id}" data-name="${unit.name}">${unit.name} (${station.name})</option>`
      ).join('')
    : '<option value="">No units placed yet</option>';
  row.innerHTML = `
    <span style="font-size:.78rem;color:var(--muted);min-width:32px;">🚒</span>
    <select class="ba-pref-unit" style="flex:1;font-size:.8rem;padding:3px 6px;">${unitOpts}</select>
    <button class="btn-sm" onclick="const p=this.closest('.ba-pref-row');p.previousElementSibling&&p.parentNode.insertBefore(p,p.previousElementSibling);" style="padding:2px 5px;" title="Move up">▲</button>
    <button class="btn-sm" onclick="const p=this.closest('.ba-pref-row');p.nextElementSibling&&p.parentNode.insertBefore(p.nextElementSibling,p);" style="padding:2px 5px;" title="Move down">▼</button>
    <button class="btn-sm danger" onclick="this.closest('.ba-pref-row').remove()" style="padding:2px 6px;">✕</button>`;
  prefList.appendChild(row);
}

function confirmBoxAlarm() {
  const name  = document.getElementById('ba-name-input').value.trim();
  const esnId = document.getElementById('ba-esn-id').value;
  if (!name) { setStatus('⚠️ Enter a name for this box alarm.'); return; }

  const missionTypes = [...document.querySelectorAll('#ba-mission-types input:checked')].map(cb => cb.value);

  // Build new ordered-preference requirements structure
  const requirements = [...document.querySelectorAll('#ba-req-rows .ba-slot')].map(slot => {
    const prefs = [...slot.querySelectorAll('.ba-pref-row')].map(row => {
      if(row.dataset.prefType === 'unit'){
        const sel = row.querySelector('.ba-pref-unit');
        const opt = sel?.selectedOptions?.[0];
        return { type: 'unit', id: sel?.value || '', name: opt?.dataset.name || opt?.text || '' };
      } else {
        const sel = row.querySelector('.ba-pref-tag');
        return { type: 'tag', tag: sel?.value || '' };
      }
    }).filter(p => p.type === 'unit' ? p.id : p.tag);
    return { prefs };
  });
  if (!requirements.length) { setStatus('⚠️ Add at least one requirement slot.'); return; }

  boxAlarms.push({ id: 'ba_' + Date.now(), name, esnId, missionTypes, requirements });
  closeBoxAlarmModal();
  renderESNList();
  renderBoxAlarmList();
  setStatus(`✅ Box alarm "${name}" saved.`);
}

function deleteBoxAlarm(id, row) {
  if (!confirm('Delete this box alarm?')) return;
  boxAlarms = boxAlarms.filter(b => b.id !== id);
  row?.remove();
  renderBoxAlarmList();
  renderESNList();
}

function getApplicableBoxAlarms(esnId, missionKey) {
  if (!esnId) return [];
  return boxAlarms.filter(b =>
    b.esnId === esnId &&
    (b.missionTypes.length === 0 || b.missionTypes.includes(missionKey))
  );
}

// Returns a human-readable string for a box alarm's requirements (new or old format).
function _baReqsLabel(requirements){
  return requirements.map((slot, i) => {
    // New format: { prefs: [...] }
    if(slot && slot.prefs){
      const prefLabels = slot.prefs.map(p =>
        p.type === 'unit' ? (p.name || p.id) : p.tag
      ).join(' → ');
      return `[${prefLabels}]`;
    }
    // Old format: ['tag1', 'tag2']
    if(Array.isArray(slot)) return slot.join('/');
    return '?';
  }).join(' + ');
}

function renderBoxAlarmList() {
  const el = document.getElementById('ba-list');
  if (!el) return;
  if (!boxAlarms.length) {
    el.innerHTML = '<div class="empty-msg" style="margin-top:4px;">No box alarms yet.<br>Open an ESN in the ESN tab and click "+ Box Alarm".</div>';
    return;
  }
  el.innerHTML = boxAlarms.map(ba => {
    const esnName = esns.find(e => e.id === ba.esnId)?.name || 'Unknown ESN';
    const mTypes  = ba.missionTypes.length
      ? ba.missionTypes.map(k => BAM_CONFIG.missions[k]?.label || k).join(', ')
      : 'All calls';
    const reqs = _baReqsLabel(ba.requirements);
    return `<div class="plan-card">
      <div class="plan-name">${ba.name}</div>
      <div class="plan-meta">${esnName} · ${mTypes}</div>
      <div class="plan-meta">${reqs}</div>
      <button class="btn-sm danger" style="margin-top:6px;" onclick="deleteBoxAlarm('${ba.id}',this.closest('.plan-card'))">Delete</button>
    </div>`;
  }).join('');
}

// =============================================================================
// SAVE / LOAD HELPERS
// =============================================================================

function getESNSaveData() {
  return esns.map(e => ({
    id: e.id, name: e.name, coords: e.coords,
    assignments: e.assignments, inService: e.inService,
    color: e.color, labelSize: e.labelSize,
    // Phase 5D — volunteer home/work building cache. Lives in the save blob
    // (consistent with Phase 5 persistence rule). TTL is 30 real-life days
    // (Date.now()-based) per docs/data-lifecycle.md. Distinct from the
    // separate _osmCache used by spawn (line 754) — different shape, different
    // purpose, both intentionally non-clashing field names.
    osmBuildingCache: e.osmBuildingCache || null
  }));
}

function getDCSaveData() {
  return dispatchCenters.map(d => ({
    id: d.id, name: d.name, lat: d.lat, lng: d.lng,
    assignedESNs: d.assignedESNs, inService: d.inService,
    // Phase 5A — DC-set unit prefix and format
    unitPrefix:   d.unitPrefix   || '',
    prefixFormat: d.prefixFormat || 'bracket'
  }));
}

function getBoxAlarmSaveData() {
  return boxAlarms.map(b => ({ ...b }));
}

function loadESNData(data) {
  (data || []).forEach(e => {
    const color     = e.color     || '#f0a500';
    const labelSize = e.labelSize || 'md';
    const polygon   = L.polygon(e.coords, {
      color, weight: 2, fillColor: color,
      fillOpacity: e.inService !== false ? .07 : .02,
      opacity:     e.inService !== false ? 1   : .3
    }).addTo(map);
    polygon.bindTooltip(`<span style="color:${color};">${e.name}</span>`, {
      permanent: true, direction: 'center', className: 'esn-label'
    });
    _applyTooltipStyle(polygon, color, labelSize);
    polygon.on('click', () => openESNModal(e.id));
    const esn = { ...e, inService: e.inService !== false, color, labelSize, polygon };
    _initOSMCache(esn);
    esns.push(esn);
  });
  renderESNList();
}

function loadDCData(data) {
  (data || []).forEach(d => {
    const marker = _buildDCMarker(d.id, d.name, d.lat, d.lng);
    // Phase 5A — default prefix fields for older saves missing them
    dispatchCenters.push({
      ...d,
      inService:    d.inService !== false,
      unitPrefix:   d.unitPrefix   || '',
      prefixFormat: d.prefixFormat || 'bracket',
      marker
    });
  });
  renderDCList();
}

function loadBoxAlarmData(data) {
  boxAlarms = (data || []).map(b => {
    // Convert old-format requirements [['engine'], ['als']] → new format [{ prefs: [{type:'tag', tag:'engine'}] }]
    const reqs = b.requirements || [];
    const converted = reqs.map(slot => {
      if(slot && slot.prefs) return slot;  // already new format
      if(Array.isArray(slot)){             // old format: ['tag1', 'tag2']
        return { prefs: slot.map(tag => ({ type:'tag', tag })) };
      }
      return { prefs: [] };
    });
    return { ...b, requirements: converted };
  });
  renderBoxAlarmList();
}

function clearESNState() {
  esns.forEach(e => e.polygon?.remove());
  dispatchCenters.forEach(d => d.marker?.remove());
  esns = []; dispatchCenters = []; boxAlarms = [];
  _selectedDCFilter = null;
}
