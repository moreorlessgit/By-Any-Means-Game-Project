// =============================================================================
// BY ANY MEANS — DATABASE HEALTH PANEL (Phase 5E)
// =============================================================================
// Admin / housekeeping tools surfaced as a sub-tab under Operations Modal →
// Operations tab. Mirrors the spec in docs/data-lifecycle.md §5.
//
// Sections (every button shows a one-line descriptor below it):
//   • OSM Cache         — per-ESN row counts, last-fetched age, fallback-mode
//                         indicator, Rebuild buttons (per-ESN + Rebuild All).
//   • Orphan Inspector  — dangling-reference sweep. Should always be empty.
//   • Volunteer Locs    — bulk reset for selected stations.
//   • World Reset       — triple-confirm wipe of all entities in this world.
//
// Depends on: config.js, esn.js (esns[], _osmCache structure), personnel.js
// (personnel[], cascadeDeletePersonnelForStation), stations.js, hospitals.js,
// prisons.js, suspects, index.html (incidents, callLog, money, etc.).
// =============================================================================

// Selection set for the "Volunteer Locations" bulk-reset multi-select.
let _dbhealthVolResetSelection = new Set();
// Track in-flight rebuild-all so the button can be disabled mid-progress.
let _dbhealthRebuildInFlight = false;
let _dbhealthRebuildProgress = { done: 0, total: 0, current: '' };

// =============================================================================
// HTML ESCAPE
// =============================================================================
function _escDbhHtml(str){
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// =============================================================================
// PANEL RENDER
// =============================================================================

function renderDatabaseHealthPanel(){
  const el = document.getElementById('dbhealth-scroll');
  if(!el) return;
  el.innerHTML = `
    ${_renderOsmCacheSection()}
    ${_renderOrphanInspectorSection()}
    ${_renderWorldResetSection()}
  `;
  // Note: the Volunteer Locations bulk-reset section was removed when the
  // volunteer system shifted to abstract assembly delays — there are no
  // physical homes left to regenerate.
}

// Phase 5E bug-fix — public hook other modules can call to refresh the panel
// only if it's currently visible. Without this, adding an ESN / hiring a
// volunteer mid-session left the DB Health panel showing a stale snapshot
// until the player re-clicked the sub-tab.
function refreshDatabaseHealthIfVisible(){
  const pane = document.getElementById('ops-sub-dbhealth');
  if(!pane) return;
  if(pane.style.display === 'none') return;
  renderDatabaseHealthPanel();
}

// ── OSM CACHE SECTION ───────────────────────────────────────────────────────

function _renderOsmCacheSection(){
  const ttl = BAM_CONFIG.osmCacheTtlMs || (30 * 24 * 60 * 60 * 1000);
  const rows = (typeof esns !== 'undefined' ? esns : []).map(e => {
    const cache = e.osmBuildingCache;
    const counts = cache ? {
      H: (cache.houses     || []).length,
      C: (cache.commercial || []).length,
      I: (cache.industrial || []).length,
      R: (cache.retail     || []).length
    } : { H:0, C:0, I:0, R:0 };
    const total = counts.H + counts.C + counts.I + counts.R;
    let ageTxt = 'never fetched';
    let stale  = true;
    if(cache?.fetchedAt){
      const ageMs = Date.now() - cache.fetchedAt;
      stale = ageMs > ttl;
      ageTxt = _formatAge(ageMs) + (stale ? ' (stale)' : '');
    }
    const fallbackBadge = cache?.fallbackMode
      ? '<span style="background:rgba(251,191,36,0.18);color:var(--gold);padding:1px 6px;border-radius:9px;font-size:.66rem;margin-left:6px;">FALLBACK</span>'
      : '';
    const ageColor = stale ? 'var(--accent)' : 'var(--green)';
    return `<div style="display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.78rem;">
      <div><b>${_escDbhHtml(e.name)}</b> ${fallbackBadge}</div>
      <div>${total} buildings <span style="color:var(--muted);font-size:.7rem;">(${counts.H}H / ${counts.C}C / ${counts.I}I / ${counts.R}R)</span></div>
      <div style="color:${ageColor};font-size:.74rem;">${_escDbhHtml(ageTxt)}</div>
      <button class="btn-sm" onclick="_dbhealthRebuildOne('${e.id}')"
              ${_dbhealthRebuildInFlight ? 'disabled' : ''}>Rebuild</button>
    </div>`;
  }).join('') || '<div class="empty-msg">No ESN zones. The OSM building cache is per-ESN.</div>';

  const progressBar = _dbhealthRebuildInFlight
    ? `<div style="margin-top:6px;font-size:.74rem;color:var(--muted);">
        Rebuilding ${_dbhealthRebuildProgress.done}/${_dbhealthRebuildProgress.total} · ${_escDbhHtml(_dbhealthRebuildProgress.current)}
       </div>`
    : '';

  return `<div class="section-title">OSM Building Cache</div>
    <div style="font-size:.74rem;color:var(--muted);margin-bottom:6px;">
      Per-ESN cache of buildings (houses / commercial / industrial / retail) used to place volunteer home and work locations. TTL: 30 real-life days. Source: public Overpass API; falls back to road-snapped random points when Overpass is unreachable.
    </div>
    ${rows}
    <div style="display:flex;gap:6px;align-items:center;margin-top:8px;">
      <button class="btn-sm" onclick="_dbhealthRebuildAll()" ${_dbhealthRebuildInFlight ? 'disabled' : ''}>Rebuild All</button>
      <span style="font-size:.7rem;color:var(--muted);">Re-queries OpenStreetMap for every ESN. 1-second spacing between requests to stay polite on the public API. Non-destructive — existing personnel keep their homes.</span>
    </div>
    ${progressBar}
  `;
}

async function _dbhealthRebuildOne(esnId){
  if(_dbhealthRebuildInFlight) return;
  if(typeof fetchBuildingsForESN !== 'function') return;
  _dbhealthRebuildInFlight = true;
  renderDatabaseHealthPanel();
  await fetchBuildingsForESN(esnId, true);
  _dbhealthRebuildInFlight = false;
  renderDatabaseHealthPanel();
}

async function _dbhealthRebuildAll(){
  if(_dbhealthRebuildInFlight) return;
  if(typeof rebuildAllBuildingCaches !== 'function') return;
  _dbhealthRebuildInFlight = true;
  _dbhealthRebuildProgress = { done: 0, total: (typeof esns !== 'undefined' ? esns.length : 0), current: '' };
  renderDatabaseHealthPanel();
  await rebuildAllBuildingCaches(({ done, total, esnName }) => {
    _dbhealthRebuildProgress = { done, total, current: esnName || '' };
    renderDatabaseHealthPanel();
  });
  _dbhealthRebuildInFlight = false;
  renderDatabaseHealthPanel();
}

function _formatAge(ms){
  if(ms < 60_000) return '<1 min ago';
  if(ms < 3_600_000) return Math.round(ms / 60_000) + ' min ago';
  if(ms < 86_400_000) return Math.round(ms / 3_600_000) + ' hr ago';
  return Math.round(ms / 86_400_000) + ' days ago';
}

// ── ORPHAN INSPECTOR ────────────────────────────────────────────────────────

function _renderOrphanInspectorSection(){
  const orphans = findOrphans();
  const rows = orphans.length ? orphans.map(o => `
    <div style="padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.76rem;">
      <span style="color:var(--accent);">${_escDbhHtml(o.kind)}</span>
      <span style="color:var(--muted);">· ${_escDbhHtml(o.id)}</span>
      ${o.context ? `<span style="color:var(--muted);"> · ${_escDbhHtml(o.context)}</span>` : ''}
    </div>
  `).join('') : '<div style="font-size:.78rem;color:var(--green);padding:4px 0;">✓ No orphans found.</div>';

  return `<div class="section-title" style="margin-top:14px;">Orphan Inspector</div>
    <div style="font-size:.74rem;color:var(--muted);margin-bottom:6px;">
      Lists data that references something that no longer exists. A healthy world shows zero. Non-empty results mean a cleanup rule was skipped somewhere — useful for debugging.
    </div>
    ${rows}
  `;
}

// Sweeps for dangling references across the loaded world state. Returns
// { kind, id, context? }[]. Should always be [] in a healthy world.
function findOrphans(){
  const out = [];
  const stationIds = new Set((typeof stations !== 'undefined' ? stations : []).map(s => s.id));
  const unitIds = new Set();
  (typeof stations !== 'undefined' ? stations : []).forEach(s => (s.units || []).forEach(u => unitIds.add(u.id)));
  const esnIds = new Set((typeof esns !== 'undefined' ? esns : []).map(e => e.id));

  // Personnel → station
  (typeof personnel !== 'undefined' ? personnel : []).forEach(p => {
    if(p.stationId && !stationIds.has(p.stationId)){
      out.push({ kind: 'personnel.stationId', id: p.id, context: `→ ${p.stationId} (${p.name})` });
    }
    if(p.pinnedUnitId && !unitIds.has(p.pinnedUnitId)){
      out.push({ kind: 'personnel.pinnedUnitId', id: p.id, context: `→ ${p.pinnedUnitId}` });
    }
    // personnel.home/work checks removed — abstract-assembly refactor dropped
    // physical volunteer locations.
  });

  // DC → ESN
  (typeof dispatchCenters !== 'undefined' ? dispatchCenters : []).forEach(dc => {
    (dc.assignedESNs || []).forEach(eid => {
      if(!esnIds.has(eid)){
        out.push({ kind: 'dispatchCenter.assignedESNs', id: dc.id, context: `→ ${eid}` });
      }
    });
  });

  // Incidents → units (assigned but unit no longer exists)
  (typeof incidents !== 'undefined' ? incidents : []).forEach(inc => {
    (inc.units || []).forEach(uid => {
      if(!unitIds.has(uid)){
        out.push({ kind: 'incident.units', id: inc.id, context: `→ ${uid}` });
      }
    });
  });

  return out;
}

// ── VOLUNTEER LOCATIONS BULK RESET ──────────────────────────────────────────

function _renderVolunteerLocationsSection(){
  const stationsList = (typeof stations !== 'undefined' ? stations : [])
    .filter(s => {
      // Show stations with at least one volunteer.
      return (typeof personnel !== 'undefined' ? personnel : [])
        .some(p => p.stationId === s.id && p.type === 'volunteer');
    });

  const checkboxes = stationsList.length ? stationsList.map(s => {
    const checked = _dbhealthVolResetSelection.has(s.id) ? 'checked' : '';
    const volCount = (typeof personnel !== 'undefined' ? personnel : [])
      .filter(p => p.stationId === s.id && p.type === 'volunteer').length;
    return `<label style="display:flex;align-items:center;gap:6px;font-size:.78rem;padding:2px 0;">
      <input type="checkbox" ${checked} onchange="_dbhealthToggleStationSelection('${s.id}', this.checked)"/>
      ${_escDbhHtml(s.name)} <span style="color:var(--muted);font-size:.7rem;">(${volCount} volunteer${volCount===1?'':'s'})</span>
    </label>`;
  }).join('') : '<div class="empty-msg">No stations have volunteers yet.</div>';

  return `<div class="section-title" style="margin-top:14px;">Volunteer Locations</div>
    <div style="font-size:.74rem;color:var(--muted);margin-bottom:6px;">
      Regenerates home locations for all auto-generated, non-customized, non-super volunteers at the selected stations. Personnel you have manually edited or marked as super responders are skipped.
    </div>
    <div style="border:1px solid var(--border);border-radius:4px;padding:6px 8px;max-height:200px;overflow-y:auto;">
      ${checkboxes}
    </div>
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;">
      <button class="btn-sm" onclick="_dbhealthResetSelectedVolunteers()" ${_dbhealthVolResetSelection.size === 0 ? 'disabled' : ''}>Reset Selected</button>
      <button class="btn-sm" onclick="_dbhealthSelectAllVolStations()" ${stationsList.length === 0 ? 'disabled' : ''}>Select All</button>
      <button class="btn-sm" onclick="_dbhealthResetAllVolunteers()" ${stationsList.length === 0 ? 'disabled' : ''} title="Reset homes for every auto-generated volunteer across every station">⚡ Reset All</button>
      <button class="btn-sm danger" onclick="_dbhealthOverrideResetAllVolunteers()" ${stationsList.length === 0 ? 'disabled' : ''} title="DANGEROUS: also resets manually-edited and super responders. Triple-confirms.">⚠ Override Reset All</button>
    </div>
    <div style="font-size:.7rem;color:var(--muted);margin-top:4px;">
      Each reset regenerates the volunteer's home from current OSM data. Non-destructive otherwise — stats and certifications are preserved.
      <b style="color:var(--gold);">Reset All</b> skips customized and super responders. <b style="color:var(--accent);">Override Reset All</b> includes them — use with care.
    </div>
  `;
}

function _dbhealthToggleStationSelection(stationId, checked){
  if(checked) _dbhealthVolResetSelection.add(stationId);
  else        _dbhealthVolResetSelection.delete(stationId);
  renderDatabaseHealthPanel();
}

async function _dbhealthResetSelectedVolunteers(){
  if(!_dbhealthVolResetSelection.size) return;
  if(!confirm(`Regenerate volunteer homes for ${_dbhealthVolResetSelection.size} station(s)? Customized and super-responder personnel are skipped.`)) return;
  const list = (typeof personnel !== 'undefined' ? personnel : []).filter(p =>
       p.type === 'volunteer'
    && _dbhealthVolResetSelection.has(p.stationId)
    && !p.isCustomized
    && !p.isSuperResponder
  );
  await _dbhealthRunVolunteerReset(list);
}

// Phase 5 bugfix v2 — Reset All: skips customized + super responders, runs
// across every station with volunteers regardless of selection.
async function _dbhealthResetAllVolunteers(){
  const list = (typeof personnel !== 'undefined' ? personnel : []).filter(p =>
       p.type === 'volunteer'
    && !p.isCustomized
    && !p.isSuperResponder
  );
  if(!list.length){
    if(typeof setStatus === 'function') setStatus('No eligible volunteers to reset.');
    return;
  }
  if(!confirm(`Reset homes for ALL ${list.length} eligible volunteer${list.length===1?'':'s'} across every station? Customized + super responders are still skipped.`)) return;
  await _dbhealthRunVolunteerReset(list);
}

// Phase 5 bugfix v2 — Override Reset All: includes customized + super
// responders. Triple-confirm because this overwrites manual edits.
async function _dbhealthOverrideResetAllVolunteers(){
  const list = (typeof personnel !== 'undefined' ? personnel : []).filter(p => p.type === 'volunteer');
  if(!list.length){
    if(typeof setStatus === 'function') setStatus('No volunteers to reset.');
    return;
  }
  const custCount  = list.filter(p => p.isCustomized).length;
  const superCount = list.filter(p => p.isSuperResponder).length;
  if(!confirm(`⚠ OVERRIDE RESET: This will overwrite homes for ALL ${list.length} volunteers, INCLUDING ${custCount} manually edited and ${superCount} super-responder${superCount===1?'':'s'}. Continue?`)) return;
  if(!confirm(`Are you sure? Manually-set home locations will be lost.`)) return;
  if(!confirm(`Last confirmation. This cannot be undone. Override reset every volunteer's home?`)) return;
  // Clear the customization flags so a future "Reset All" doesn't keep
  // skipping them. Player explicitly chose to overwrite manual edits.
  list.forEach(p => {
    if(p.isCustomized) p.isCustomized = false;
    if(p.playerEdited) p.playerEdited = false;
  });
  await _dbhealthRunVolunteerReset(list);
}

// Shared worker — sequential to stay polite on Overpass.
async function _dbhealthRunVolunteerReset(list){
  let count = 0;
  for(const p of list){
    if(typeof generateVolunteerHome === 'function') await generateVolunteerHome(p);
    count++;
  }
  if(typeof setStatus === 'function') setStatus(`Reset ${count} volunteer home${count===1?'':'s'}.`);
  if(typeof refreshVolunteerLocationMarkers === 'function') refreshVolunteerLocationMarkers();
  renderDatabaseHealthPanel();
}

// Selects every station with at least one volunteer in the bulk-reset checkbox list.
function _dbhealthSelectAllVolStations(){
  const stationsList = (typeof stations !== 'undefined' ? stations : []).filter(s =>
    (typeof personnel !== 'undefined' ? personnel : [])
      .some(p => p.stationId === s.id && p.type === 'volunteer')
  );
  stationsList.forEach(s => _dbhealthVolResetSelection.add(s.id));
  renderDatabaseHealthPanel();
}

// ── WORLD RESET ─────────────────────────────────────────────────────────────

function _renderWorldResetSection(){
  return `<div class="section-title" style="margin-top:14px;color:var(--accent);">⚠ World Reset</div>
    <div style="font-size:.74rem;color:var(--muted);margin-bottom:6px;">
      Wipes all stations, units, personnel, and active calls in this world. Keeps the world record itself. This cannot be undone — saved slots are not affected (load a slot to restore).
    </div>
    <button class="btn-sm danger" onclick="_dbhealthWorldReset()">Wipe World</button>
  `;
}

async function _dbhealthWorldReset(){
  // Triple confirmation: two prompts + a typed phrase.
  if(!confirm('This will wipe every station, unit, personnel record, incident, and pending transport in the current world. Continue?')) return;
  if(!confirm('Really? Saved slots are untouched, but the live world will be reset to a clean state. There is no undo.')) return;
  const typed = prompt('Type "WIPE WORLD" exactly to confirm:');
  if(typed !== 'WIPE WORLD'){ if(typeof setStatus === 'function') setStatus('World reset cancelled.'); return; }
  _performWorldWipe();
  if(typeof setStatus === 'function') setStatus('World wiped. Place stations to begin again.');
  renderDatabaseHealthPanel();
}

// Performs the actual wipe. Touches the top-level state arrays maintained by
// the existing modules so reload-as-fresh path mirrors a brand-new world.
function _performWorldWipe(){
  // Stop active animations on units before clearing.
  (typeof stations !== 'undefined' ? stations : []).forEach(s => {
    (s.units || []).forEach(u => {
      u._animGen = (u._animGen || 0) + 1;
      u.animMarker?.remove(); u.routeLine?.remove(); u.returnLine?.remove();
    });
    s.marker?.remove();
  });
  if(typeof stations !== 'undefined') stations.length = 0;
  // Clear incidents + markers.
  (typeof incidents !== 'undefined' ? incidents : []).forEach(inc => inc.marker?.remove());
  if(typeof incidents !== 'undefined') incidents.length = 0;
  // ESNs (polygons), DCs (markers), box alarms.
  (typeof esns !== 'undefined' ? esns : []).forEach(e => e.polygon?.remove());
  if(typeof esns !== 'undefined') esns.length = 0;
  (typeof dispatchCenters !== 'undefined' ? dispatchCenters : []).forEach(d => d.marker?.remove());
  if(typeof dispatchCenters !== 'undefined') dispatchCenters.length = 0;
  if(typeof boxAlarms !== 'undefined') boxAlarms.length = 0;
  if(typeof responsePlans !== 'undefined') responsePlans.length = 0;
  // Facilities.
  (typeof hospitals !== 'undefined' ? hospitals : []).forEach(h => h.marker?.remove());
  if(typeof hospitals !== 'undefined') hospitals.length = 0;
  (typeof jails !== 'undefined' ? jails : []).forEach(j => j.marker?.remove());
  if(typeof jails !== 'undefined') jails.length = 0;
  // Personnel + volunteer markers.
  if(typeof personnel !== 'undefined') personnel.length = 0;
  if(typeof refreshVolunteerLocationMarkers === 'function') refreshVolunteerLocationMarkers();
  // Suspects + transport queue.
  if(typeof suspects !== 'undefined') suspects.length = 0;
  if(typeof pendingTransports !== 'undefined') pendingTransports.length = 0;
  // Cashflow log + counters.
  if(typeof cashflowLog !== 'undefined') cashflowLog.length = 0;
  if(typeof resolvedCount !== 'undefined') resolvedCount = 0;
  // Refresh every list/panel.
  ['renderStationList','renderIncidentList','renderStats','renderResponsePlanList',
   'renderBoxAlarmList','renderPersonnelTab','renderDCList','renderESNList','renderFacilitiesSidebarList']
    .forEach(fn => { if(typeof window[fn] === 'function') window[fn](); });
  if(typeof renderUnitList === 'function') renderUnitList();
}
