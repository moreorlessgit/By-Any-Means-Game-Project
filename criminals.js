// =============================================================================
// BY ANY MEANS — CRIMINALS MODULE
// =============================================================================
// Manages suspect generation, charge tier rolling, and scene/station processing.
// Depends on: config.js (BAM_CONFIG), index.html globals (updateMoney, logCashflow,
//   gameSeconds, setStatus), prisons.js (intakePrisoner, findNearestJail,
//   installHoldingCells)
// Provides: suspects[], createSuspect(), processSuspectAtScene(),
//   bookSuspectAtStation(), tickSuspectProcessing(), weightedRandom(),
//   getSuspectSaveData(), loadSuspectData()
// =============================================================================

// ── STATE ─────────────────────────────────────────────────────────────────────

let suspects = [];    // all generated suspects (across all statuses)

// ── ID GENERATOR ──────────────────────────────────────────────────────────────

function _susId(){ return 'sus_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

// ── WEIGHTED RANDOM ───────────────────────────────────────────────────────────

// Generic weighted picker. tierList = [{ tier: string, weight: number }, ...].
// Returns the tier string of the selected entry.
function weightedRandom(tierList){
  if(!tierList || !tierList.length) return null;
  const total = tierList.reduce((s, x) => s + (x.weight || 1), 0);
  let r = Math.random() * total;
  for(const entry of tierList){
    r -= (entry.weight || 1);
    if(r <= 0) return entry.tier;
  }
  return tierList[tierList.length - 1].tier;   // fallback to last
}

// ── SUSPECT CREATION ──────────────────────────────────────────────────────────

// Creates a suspect for a resolved incident. Rolls the charge tier from the
// mission's weighted chargeTiers list. Pays the arrest fee immediately.
// Returns the suspect object, or null if the mission has no chargeTiers.
function createSuspect(incidentId, mission){
  if(!mission?.chargeTiers) return null;

  const tier    = weightedRandom(mission.chargeTiers);
  const tierCfg = BAM_CONFIG.chargeTiers[tier];
  if(!tierCfg) return null;

  const suspect = {
    id:                   _susId(),
    incidentId,
    chargeTier:           tier,
    status:               'detained',    // detained → at_scene | at_station | at_jail | at_prison | released
    arrestUnitId:         null,          // set by the dispatching unit in index.html
    holdingStationId:     null,
    facilityId:           null,
    processingStartSec:   null,
    processingDurationSec:null,
    isInjured:            false,         // if true, needs hospital before jail
  };
  suspects.push(suspect);

  // Pay arrest fee immediately
  const fee = BAM_CONFIG.lawEnforcementRevenue.arrestFee[tier] || 0;
  if(fee > 0){
    updateMoney(fee);
    logCashflow(fee, `[ARREST REVENUE] ${tierCfg.label} — ${incidentId}`);
  }

  return suspect;
}

// ── SCENE PROCESSING ──────────────────────────────────────────────────────────

// Applies the scene release roll for a suspect. Call this when the arresting
// unit arrives at the scene (or at incident resolution).
// Returns 'released_scene' | 'needs_transport' to the caller.
function processSuspectAtScene(suspect){
  const tierCfg = BAM_CONFIG.chargeTiers[suspect.chargeTier];
  if(!tierCfg) return 'needs_transport';

  if(Math.random() < tierCfg.releaseChanceScene){
    releaseSuspect(suspect, 'scene');
    return 'released_scene';
  }
  // Suspect is detained and needs to be transported
  suspect.status = 'detained';
  return 'needs_transport';
}

// ── STATION BOOKING ───────────────────────────────────────────────────────────

// Books a suspect into a police station's holding cell and starts the processing timer.
// Rolls the station release probability. If they won't be released, marks them for jail transfer.
// The actual transfer is triggered when the processing timer expires.
function bookSuspectAtStation(suspect, stationId){
  const station = stations.find(s => s.id === stationId);
  if(!station || !station._holdingCells){
    setStatus(`⚠️ ${station?.name || 'Station'} has no holding cells installed.`);
    return false;
  }
  if(station._holdingCells.occupied >= station._holdingCells.cells){
    setStatus(`⚠️ ${station.name} holding cells are full (${station._holdingCells.cells}/${station._holdingCells.cells}).`);
    return false;
  }

  const tierCfg = BAM_CONFIG.chargeTiers[suspect.chargeTier];
  const minSec  = tierCfg?.processingTimeMinSec || 600;
  const maxSec  = tierCfg?.processingTimeMaxSec || 1800;

  suspect.status                = 'at_station';
  suspect.holdingStationId      = stationId;
  suspect.processingStartSec    = gameSeconds;
  suspect.processingDurationSec = Math.round(minSec + Math.random() * (maxSec - minSec));
  // Pre-roll the release outcome so it's determined at booking time
  suspect._stationRelease       = Math.random() < (tierCfg?.releaseChanceStation || 0);
  suspect._needsJailTransfer    = !suspect._stationRelease && (tierCfg?.transferChanceJail || 0) > 0;

  station._holdingCells.occupied++;
  station._holdingCells.suspects = station._holdingCells.suspects || [];
  station._holdingCells.suspects.push(suspect.id);

  return true;
}

// ── TICK — STATION HOLDING CELLS ─────────────────────────────────────────────

// Called every game clock tick from _tickGameClock() in index.html.
// Handles processing timers for suspects currently held at police station holding cells.
function tickSuspectProcessing(deltaGameSec){
  suspects.forEach(suspect => {
    if(suspect.status !== 'at_station') return;
    if(!suspect.processingStartSec || !suspect.processingDurationSec) return;

    const elapsed = gameSeconds - suspect.processingStartSec;
    if(elapsed < suspect.processingDurationSec) return;

    // Processing complete — release or transfer to jail
    const station = stations.find(s => s.id === suspect.holdingStationId);
    if(suspect._stationRelease || !suspect._needsJailTransfer){
      // Release from station
      _freeStationCell(station, suspect.id);
      releaseSuspect(suspect, 'station');
    } else {
      // Needs transfer to county jail
      _freeStationCell(station, suspect.id);
      suspect.status = 'awaiting_transfer';
      _requestJailTransport(suspect);
    }
  });
}

// Removes a suspect from a station holding cell.
function _freeStationCell(station, suspectId){
  if(!station?._holdingCells) return;
  station._holdingCells.occupied = Math.max(0, station._holdingCells.occupied - 1);
  station._holdingCells.suspects = (station._holdingCells.suspects || []).filter(id => id !== suspectId);
}

// Requests a prisoner transport to the nearest county jail.
// prisons.js exposes intakePrisoner and findNearestJail.
function _requestJailTransport(suspect){
  const station = stations.find(s => s.id === suspect.holdingStationId);
  const fromLat = station?.lat;
  const fromLng = station?.lng;
  const jail    = findNearestJail(fromLat, fromLng, 'county_jail');
  if(!jail){
    setStatus(`⚠️ No county jail available — suspect ${suspect.id} held pending transfer.`);
    return;
  }
  // Mark the transfer — actual dispatch routing is handled in index.html dispatchPrisonerTransport()
  suspect.status     = 'awaiting_transport';
  suspect.facilityId = jail.id;
  // Notify index.html to dispatch a transport unit
  if(typeof dispatchPrisonerTransport === 'function'){
    dispatchPrisonerTransport(suspect, jail);
  }
}

// ── RELEASE ───────────────────────────────────────────────────────────────────

// Releases a suspect from any location and pays the processing/release revenue.
// location: 'scene' | 'station' | 'jail' | 'prison'
function releaseSuspect(suspect, location){
  suspect.status = 'released';

  const tierCfg  = BAM_CONFIG.chargeTiers[suspect.chargeTier];
  const revCfg   = BAM_CONFIG.lawEnforcementRevenue;

  // Processing fee at station/jail/prison (not at scene — scene releases are citation-only)
  if(location !== 'scene' && tierCfg){
    const fee           = revCfg.processingFee[suspect.chargeTier] || 0;
    const minutesHeld   = suspect.processingStartSec
                            ? Math.max(0, (gameSeconds - suspect.processingStartSec) / 60)
                            : 0;
    const timeBonus     = Math.round(minutesHeld * revCfg.processingRevenuePerMinute);
    const total         = fee + timeBonus;
    if(total > 0){
      updateMoney(total);
      const locLabel = location.charAt(0).toUpperCase() + location.slice(1);
      logCashflow(total,
        `[${locLabel.toUpperCase()} PROCESSING REVENUE] ${tierCfg.label} (${Math.round(minutesHeld)}m held)`);
    }
  }
}

// ── SAVE / LOAD ───────────────────────────────────────────────────────────────

// Returns serializable suspect data for the save file.
// Processing timers are preserved so they resume from where they left off on load.
function getSuspectSaveData(){
  return suspects.map(s => ({
    id:                    s.id,
    incidentId:            s.incidentId,
    chargeTier:            s.chargeTier,
    status:                s.status,
    arrestUnitId:          s.arrestUnitId,
    holdingStationId:      s.holdingStationId,
    facilityId:            s.facilityId,
    processingStartSec:    s.processingStartSec,
    processingDurationSec: s.processingDurationSec,
    isInjured:             s.isInjured,
    _stationRelease:       s._stationRelease,
    _needsJailTransfer:    s._needsJailTransfer,
  }));
}

// Restores suspects from saved data.
function loadSuspectData(savedSuspects){
  suspects = (savedSuspects || []).map(s => ({ ...s }));
}
