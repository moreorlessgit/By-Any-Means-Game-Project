// =============================================================================
// BY ANY MEANS — MASTER CONFIG FILE
// =============================================================================
// Edit anything in this file to customize the game.
// All missions, unit types, upgrade paths, probabilities, and rewards live here.
// =============================================================================

const BAM_CONFIG = {

  // ---------------------------------------------------------------------------
  // MAP SETTINGS
  // ---------------------------------------------------------------------------
  map: {
    startLat:  41.785,
    startLng: -75.615,
    startZoom: 11,
    // Bounding box for incident spawning (expand as you build out)
    bounds: {
      minLat: 41.60, maxLat: 41.97,
      minLng: -76.05, maxLng: -75.30
    }
  },

  // ---------------------------------------------------------------------------
  // ECONOMY
  // ---------------------------------------------------------------------------
  economy: {
    startingMoney: 50000,       // $ you begin with
    stationCost: {
      fire:             15000,
      ems:              12000,
      police:           10000,
      helipad_building: 25000,  // helipad station for helicopter units
      airport_building: 50000,  // full airfield for helicopter units
    },
    // Upgrade costs defined per upgrade in UPGRADES section below
  },

  // ---------------------------------------------------------------------------
  // STATION TYPE DEFINITIONS
  // ---------------------------------------------------------------------------
  // Maps placement type keys to their display info and unit category.
  // unitCategory is the stationType value that units must have to be housed here.
  // ---------------------------------------------------------------------------
  stationTypeDefs: {
    fire:             { label: 'Fire Station',     icon: '🔴', unitCategory: 'fire'   },
    ems:              { label: 'EMS Station',       icon: '🔵', unitCategory: 'ems'    },
    police:           { label: 'Police Station',    icon: '🟣', unitCategory: 'police' },
    helipad_building: { label: 'Helipad',           icon: '🚁', unitCategory: 'air'    },
    airport_building: { label: 'Airport/Airfield',  icon: '✈️', unitCategory: 'air'    },
  },

  // ---------------------------------------------------------------------------
  // UNIT TYPE DEFINITIONS
  // ---------------------------------------------------------------------------
  // "tags" is the backend capability list. A mission requiring "engine" will
  // accept ANY unit that has "engine" in its tags.
  // "stationType" must match the unitCategory of the station type hosting this unit.
  // "providerLevel" = medical provider level for patient stabilization (null = none).
  // "maxTransportCapacity" = max patients or suspects this unit can transport at once.
  // "straightLine" = true for aircraft (bypasses OSRM, uses direct haversine path).
  // "speedMph" = used for ETA calc on straight-line (aircraft) units.
  // "seats" = ordered cab seating layout used by the Crew-Select Dispatch
  //           picker and the Unit Details panel. Each seat:
  //             id              — unique slot key.
  //             label           — display name. Rename freely.
  //             isDriver        — driver/operator seat. The driverCert from
  //                               crewDefaults[typeKey] is enforced as a hard
  //                               gate for this seat at dispatch time.
  //             preferredCerts  — soft hint. Personnel holding any of these
  //                               get a "fits this seat" badge in the picker.
  //                               NOT a filter — cross-staffed responders are
  //                               still selectable.
  //           Seats live alongside the rest of each apparatus' config so it's
  //           easy to see capacity + role layout next to min/ideal crew
  //           defaults in crewDefaults below.
  // ---------------------------------------------------------------------------
  unitTypes: {
    // ── FIRE ──────────────────────────────────────────────────────────────────
    engine: {
      label:                'Engine',
      tags:                 ['engine'],
      stationType:          'fire',
      cost:                 8000,
      personnel:            4,
      color:                '#e05c1a',
      icon:                 '🚒',
      providerLevel:        'first_aid',
      maxTransportCapacity: 0,
      seats: [
        { id:'driver',  label:'Driver/Operator', isDriver:true, preferredCerts:['evoc_large','pump_ops_1'] },
        { id:'officer', label:'Officer',                        preferredCerts:['fire_officer_1','fire_officer_2'] },
        { id:'cab_1',   label:'Cab Seat 1',                     preferredCerts:['ff1','ff2'] },
        { id:'cab_2',   label:'Cab Seat 2',                     preferredCerts:['ff1','ff2'] }
      ],
    },
    pumper_tanker: {
      label:                'Pumper/Tanker',
      tags:                 ['engine','tanker'],   // counts as BOTH
      stationType:          'fire',
      cost:                 14000,
      personnel:            3,
      color:                '#e05c1a',
      icon:                 '🚒',
      providerLevel:        'first_aid',
      maxTransportCapacity: 0,
      seats: [
        { id:'driver',  label:'Driver/Operator', isDriver:true, preferredCerts:['evoc_large','pump_ops_1'] },
        { id:'officer', label:'Officer',                        preferredCerts:['fire_officer_1'] },
        { id:'cab_1',   label:'Cab Seat 1',                     preferredCerts:['ff1','ff2'] }
      ],
    },
    tanker: {
      label:                'Tanker',
      tags:                 ['tanker'],
      stationType:          'fire',
      cost:                 10000,
      personnel:            2,
      color:                '#c94800',
      icon:                 '🚒',
      providerLevel:        'first_aid',
      maxTransportCapacity: 0,
      seats: [
        { id:'driver', label:'Driver/Operator', isDriver:true, preferredCerts:['evoc_large'] },
        { id:'cab_1',  label:'Cab Seat 1',                     preferredCerts:['ff1','ff2'] }
      ],
    },
    ladder: {
      label:                'Ladder/Aerial',
      tags:                 ['ladder','engine'],   // ladder also counts as engine
      stationType:          'fire',
      cost:                 18000,
      personnel:            4,
      color:                '#e05c1a',
      icon:                 '🚒',
      providerLevel:        'first_aid',
      maxTransportCapacity: 0,
      seats: [
        { id:'driver',  label:'Driver/Operator', isDriver:true, preferredCerts:['evoc_large','aerial_operator'] },
        { id:'officer', label:'Officer',                        preferredCerts:['fire_officer_1','fire_officer_2'] },
        { id:'cab_1',   label:'Cab Seat 1',                     preferredCerts:['ff1','ff2'] },
        { id:'cab_2',   label:'Cab Seat 2',                     preferredCerts:['ff1','ff2'] }
      ],
    },
    brush_truck: {
      label:                'Brush Truck',
      tags:                 ['brush'],
      stationType:          'fire',
      cost:                 6000,
      personnel:            2,
      color:                '#8b4513',
      icon:                 '🚒',
      providerLevel:        'first_aid',
      maxTransportCapacity: 0,
      seats: [
        { id:'driver', label:'Driver/Operator', isDriver:true, preferredCerts:['evoc_small'] },
        { id:'cab_1',  label:'Cab Seat 1',                     preferredCerts:['wildland_ff','fire_exterior','ff1'] }
      ],
    },
    rescue: {
      label:                'Heavy Rescue',
      tags:                 ['rescue'],
      stationType:          'fire',
      cost:                 16000,
      personnel:            4,
      color:                '#e05c1a',
      icon:                 '🚒',
      providerLevel:        'first_aid',
      maxTransportCapacity: 0,
      seats: [
        { id:'driver',  label:'Driver/Operator', isDriver:true, preferredCerts:['evoc_large'] },
        { id:'officer', label:'Officer',                        preferredCerts:['fire_officer_1'] },
        { id:'cab_1',   label:'Cab Seat 1',                     preferredCerts:['rescue_tech','ff1'] },
        { id:'cab_2',   label:'Cab Seat 2',                     preferredCerts:['rescue_tech','ff1'] }
      ],
    },
    rescue_engine: {
      label:                'Rescue Engine',
      tags:                 ['rescue','engine'],   // counts as BOTH
      stationType:          'fire',
      cost:                 20000,
      personnel:            4,
      color:                '#e05c1a',
      icon:                 '🚒',
      providerLevel:        'first_aid',
      maxTransportCapacity: 0,
      seats: [
        { id:'driver',  label:'Driver/Operator', isDriver:true, preferredCerts:['evoc_large','pump_ops_1'] },
        { id:'officer', label:'Officer',                        preferredCerts:['fire_officer_1'] },
        { id:'cab_1',   label:'Cab Seat 1',                     preferredCerts:['rescue_tech','ff1'] },
        { id:'cab_2',   label:'Cab Seat 2',                     preferredCerts:['ff1','ff2'] }
      ],
    },
    // ── EMS ───────────────────────────────────────────────────────────────────
    als_ambulance: {
      label:                'ALS Ambulance',
      tags:                 ['als','bls','transport'],
      stationType:          'ems',
      cost:                 9000,
      personnel:            2,
      color:                '#2ea8ff',
      icon:                 '🚑',
      providerLevel:        'als',
      maxTransportCapacity: 1,
      seats: [
        { id:'driver',          label:'Driver',          isDriver:true, preferredCerts:['evoc_small','emt'] },
        { id:'front_passenger', label:'Front Passenger',                preferredCerts:['emt','aemt','paramedic'] },
        { id:'captains_chair',  label:"Captain's Chair",                preferredCerts:['paramedic','aemt'] },
        { id:'bench',           label:'Bench Seat',                     preferredCerts:['emt','aemt','paramedic'] }
      ],
    },
    bls_ambulance: {
      label:                'BLS Ambulance',
      tags:                 ['bls','transport'],
      stationType:          'ems',
      cost:                 7000,
      personnel:            2,
      color:                '#1a7fc4',
      icon:                 '🚑',
      providerLevel:        'bls',
      maxTransportCapacity: 1,
      seats: [
        { id:'driver',          label:'Driver',          isDriver:true, preferredCerts:['evoc_small','emt'] },
        { id:'front_passenger', label:'Front Passenger',                preferredCerts:['emt','aemt'] },
        { id:'captains_chair',  label:"Captain's Chair",                preferredCerts:['emt','aemt'] },
        { id:'bench',           label:'Bench Seat',                     preferredCerts:['emt','emr'] }
      ],
    },
    fly_car: {
      label:                'Medic Fly Car',
      tags:                 ['als'],              // ALS but NO transport
      stationType:          'ems',
      cost:                 5000,
      personnel:            1,
      color:                '#2ea8ff',
      icon:                 '🚗',
      providerLevel:        'als',
      maxTransportCapacity: 0,
      seats: [
        { id:'driver',          label:'Driver',          isDriver:true, preferredCerts:['evoc_small','paramedic','emt'] },
        { id:'front_passenger', label:'Front Passenger',                preferredCerts:['paramedic','aemt','emt'] }
      ],
    },
    // ── POLICE ────────────────────────────────────────────────────────────────
    patrol: {
      label:                'Patrol Unit',
      tags:                 ['patrol','transport_prisoner'],
      stationType:          'police',
      cost:                 4000,
      personnel:            1,
      color:                '#5865f2',
      icon:                 '🚔',
      providerLevel:        null,
      maxTransportCapacity: 2,   // patrol can hold up to 2 suspects
      seats: [
        { id:'driver',          label:'Driver',          isDriver:true, preferredCerts:['evoc_small','patrol_officer'] },
        { id:'front_passenger', label:'Front Passenger',                preferredCerts:['patrol_officer'] }
      ],
    },
    supervisor: {
      label:                'Supervisor',
      tags:                 ['patrol','supervisor'],
      stationType:          'police',
      cost:                 5000,
      personnel:            1,
      color:                '#5865f2',
      icon:                 '🚔',
      providerLevel:        null,
      maxTransportCapacity: 1,
      seats: [
        { id:'driver',          label:'Driver',          isDriver:true, preferredCerts:['evoc_small','patrol_supervisor','patrol_officer'] },
        { id:'front_passenger', label:'Front Passenger',                preferredCerts:['patrol_officer','patrol_supervisor'] }
      ],
    },
    k9: {
      label:                'K9 Unit',
      tags:                 ['patrol','k9'],
      stationType:          'police',
      cost:                 6000,
      personnel:            1,
      color:                '#5865f2',
      icon:                 '🚔',
      providerLevel:        null,
      maxTransportCapacity: 1,
      seats: [
        { id:'driver',          label:'Handler/Driver',  isDriver:true, preferredCerts:['evoc_small','k9_handler'] },
        { id:'front_passenger', label:'Front Passenger',                preferredCerts:['patrol_officer'] }
      ],
    },
    sheriff_transport: {
      label:                'Sheriff Transport Van',
      tags:                 ['transport_prisoner'],
      stationType:          'police',
      cost:                 7000,
      personnel:            2,
      color:                '#64748b',
      icon:                 '🚐',
      providerLevel:        null,
      maxTransportCapacity: 6,   // van can hold more suspects
      seats: [
        { id:'driver',          label:'Driver',          isDriver:true, preferredCerts:['evoc_small','patrol_officer'] },
        { id:'front_passenger', label:'Front Passenger',                preferredCerts:['patrol_officer'] }
      ],
    },
    // ── AIR MEDICAL ───────────────────────────────────────────────────────────
    helicopter: {
      label:                'Medical Helicopter',
      tags:                 ['als','transport','air_als'],
      stationType:          'air',   // matches unitCategory 'air' in stationTypeDefs
      cost:                 80000,
      personnel:            2,
      color:                '#f59e0b',
      icon:                 '🚁',
      providerLevel:        'als',
      maxTransportCapacity: 1,
      straightLine:         true,   // bypasses OSRM; uses direct point-to-point path
      speedMph:             150,    // used for ETA calc and animation duration
      // No driverCert in crewDefaults — isDriver here is informational (labels
      // the pilot seat) but doesn't trip the hard driver gate.
      seats: [
        { id:'pilot',   label:'Pilot',         isDriver:true, preferredCerts:[] },
        { id:'medic_1', label:'Flight Medic 1',                preferredCerts:['paramedic','ccp'] },
        { id:'medic_2', label:'Flight Medic 2',                preferredCerts:['ccp','paramedic'] }
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // STATION UPGRADES
  // ---------------------------------------------------------------------------
  // Each upgrade unlocks additional unit types at a station.
  // "requires" = station type it can be added to.
  // "unlocks"  = array of unitType keys now available.
  // ---------------------------------------------------------------------------
  upgrades: {
    ems_wing: {
      label:    'EMS Wing',
      desc:     'Add an ambulance bay to a fire station.',
      requires: 'fire',
      unlocks:  ['als_ambulance','bls_ambulance','fly_car'],
      cost:     12000,
      icon:     '🏥'
    },
    fire_suppression: {
      label:    'Fire Suppression',
      desc:     'Add fire apparatus to an EMS station.',
      requires: 'ems',
      unlocks:  ['engine','brush_truck'],
      cost:     18000,
      icon:     '🔥'
    },
    heavy_rescue_bay: {
      label:    'Heavy Rescue Bay',
      desc:     'Allows housing a Heavy Rescue or Rescue Engine.',
      requires: 'fire',
      unlocks:  ['rescue','rescue_engine'],
      cost:     20000,
      icon:     '🔧'
    },
    aerial_bay: {
      label:    'Aerial Apparatus Bay',
      desc:     'Oversized bay required for ladder trucks.',
      requires: 'fire',
      unlocks:  ['ladder'],
      cost:     22000,
      icon:     '🪜'
    },
    substation: {
      label:    'Police Substation',
      desc:     'Add a police presence to any station.',
      requires: 'fire',
      unlocks:  ['patrol','supervisor'],
      cost:     8000,
      icon:     '👮'
    },
    holding_cells: {
      label:    'Holding Cells',
      desc:     'Add holding cells to a police station for booking and temporary detention.',
      requires: 'police',
      unlocks:  [],        // no units unlocked — enables the holding cell system
      cost:     5000,      // base cost to install the first cell
      icon:     '🔒'
    },
  },

  // ---------------------------------------------------------------------------
  // MISSION DEFINITIONS
  // ---------------------------------------------------------------------------
  // spawnWeight: relative probability (higher = more common)
  // requirements: array of unit TAG groups
  // reward: $ on scene resolution (before transport revenue)
  // patientChance: 0-1 probability that this call generates patients at all
  // patients: array of patient entries — each rolled independently:
  //   { injuryType: 'key', minCount: 0, maxCount: 2 }
  //   actual count = randInt(minCount, maxCount) per entry
  // chargeTiers: weighted list of possible charge outcomes, or null for non-criminal calls
  //   [ { tier: 'misdemeanor', weight: 70 }, ... ]
  // escalatesTo: mission key this can upgrade to (null = no escalation)
  // escalateChance: 0-1 chance per minute of escalating (if escalatesTo set)
  // escalateAfter: seconds before escalation becomes possible
  // ---------------------------------------------------------------------------
  missions: {

    // ── FIRE CALLS ────────────────────────────────────────────────────────────
    structure_fire: {
      label:         'Structure Fire',
      category:      'fire',
      spawnMode:     'building',
      spawnWeight:   5,
      requirements:  [['engine'],['engine'],['tanker']],
      reward:        800,
      patientChance: 0.3,
      patients:      [
        { injuryType: 'trauma_critical', minCount: 0, maxCount: 1 },
        { injuryType: 'trauma_moderate', minCount: 0, maxCount: 2 },
      ],
      chargeTiers:   null,
      escalatesTo:   'working_structure_fire',
      escalateChance:0.4,
      escalateAfter: 120,
      color:         '#e05c1a'
    },
    working_structure_fire: {
      label:         'Working Structure Fire',
      category:      'fire',
      spawnMode:     'building',
      spawnWeight:   0,
      requirements:  [['engine'],['engine'],['engine'],['tanker'],['ladder'],['rescue']],
      reward:        2000,
      patientChance: 0.6,
      patients:      [
        { injuryType: 'trauma_critical', minCount: 0, maxCount: 2 },
        { injuryType: 'trauma_moderate', minCount: 1, maxCount: 3 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#ff2200'
    },
    vehicle_fire: {
      label:         'Vehicle Fire',
      category:      'fire',
      spawnMode:     'road_any',
      spawnWeight:   8,
      requirements:  [['engine']],
      reward:        300,
      patientChance: 0.2,
      patients:      [
        { injuryType: 'trauma_minor',    minCount: 0, maxCount: 1 },
        { injuryType: 'trauma_moderate', minCount: 0, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#e05c1a'
    },
    brush_fire: {
      label:         'Brush / Grass Fire',
      category:      'fire',
      spawnMode:     'random',
      spawnWeight:   10,
      requirements:  [['brush'],['engine']],
      reward:        400,
      patientChance: 0.05,
      patients:      [
        { injuryType: 'trauma_minor', minCount: 0, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   'large_brush_fire',
      escalateChance:0.2,
      escalateAfter: 180,
      color:         '#8b4513'
    },
    large_brush_fire: {
      label:         'Large Brush Fire',
      category:      'fire',
      spawnMode:     'random',
      spawnWeight:   0,
      requirements:  [['brush'],['brush'],['engine'],['tanker']],
      reward:        1200,
      patientChance: 0.1,
      patients:      [
        { injuryType: 'trauma_minor',    minCount: 0, maxCount: 1 },
        { injuryType: 'trauma_moderate', minCount: 0, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#8b0000'
    },
    mvа_fire: {
      label:         'MVA w/ Fire',
      category:      'fire',
      spawnMode:     'road_major',
      spawnWeight:   6,
      requirements:  [['engine'],['rescue']],
      reward:        600,
      patientChance: 0.8,
      patients:      [
        { injuryType: 'trauma_critical', minCount: 0, maxCount: 1 },
        { injuryType: 'trauma_moderate', minCount: 1, maxCount: 3 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#e05c1a'
    },

    // ── EMS CALLS ─────────────────────────────────────────────────────────────
    cardiac_arrest_pt: {
      label:         'Cardiac Arrest',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   4,
      requirements:  [['als'],['bls']],
      reward:        700,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'cardiac_arrest', minCount: 1, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#880000'
    },
    respiratory_emergency: {
      label:         'Respiratory Arrest',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   15,
      requirements:  [['bls']],
      reward:        300,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'respiratory_arrest',  minCount: 1, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   'cardiac_arrest_pt',
      escalateChance:1,
      escalateAfter: 300,
      color:         '#880000'
    },
    unresponsive_patient:{
      label:         'Unresponsive Patient',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   15,
      requirements:  [['bls','als']],
      reward:        300,
      patientChance: 0.65,
      patients:      [
        { injuryType: 'unresponsive',     minCount: 0, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   'respiratory_emergency',
      escalateChance:0.05,
      escalateAfter: 400,
      color:         '#880000'
    },
    heart_attack:{
      label:         'Heart Attack',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   15,
      requirements:  [['bls','als']],
      reward:        300,
      patientChance: 1,
      patients:      [
        { injuryType: 'myocardial',     minCount: 1, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   'respiratory_emergency',
      escalateChance:0.15,
      escalateAfter: 300,
      color:         '#880000'
    },
    syncope_episode:{
      label:         'Syncope Episode',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   15,
      requirements:  [['bls']],
      reward:        300,
      patientChance: 0.60,
      patients:      [
        { injuryType: 'syncope',     minCount: 1, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#2ea8ff'
    },
    diabetic_emergency:{
      label:         'Diabetic Emergency',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   15,
      requirements:  [['bls','als']],
      reward:        300,
      patientChance: 0.8,
      patients:      [
        { injuryType: 'diabetic',     minCount: 0, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   'unresponsive_patient',
      escalateChance:0.7,
      escalateAfter: 300,
      color:         '#2ea8ff'
    },
    traumatic_injury: {
      label:         'Traumatic Injury',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   6,
      requirements:  [['als'],['transport']],
      reward:        500,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'trauma_critical', minCount: 0, maxCount: 1 },
        { injuryType: 'trauma_moderate', minCount: 1, maxCount: 2 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#2ea8ff'
    },
    mva_injury: {
      label:         'MVA w/ Injuries',
      category:      'fire',
      spawnMode:     'road_major',
      spawnWeight:   10,
      requirements:  [['bls'],['engine']],
      reward:        500,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'trauma_moderate', minCount: 1, maxCount: 2 },
        { injuryType: 'trauma_minor',    minCount: 0, maxCount: 2 },
      ],
      chargeTiers:   null,
      escalatesTo:   'mva_entrapment',
      escalateChance:0.25,
      escalateAfter: 60,
      color:         '#2ea8ff'
    },
    mva_entrapment: {
      label:         'MVA w/ Entrapment',
      category:      'fire',
      spawnMode:     'road_major',
      spawnWeight:   0,
      requirements:  [['als'],['transport'],['rescue'],['engine']],
      reward:        1500,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'trauma_critical', minCount: 1, maxCount: 2 },
        { injuryType: 'trauma_moderate', minCount: 0, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#ff6600'
    },

    // ── POLICE CALLS ──────────────────────────────────────────────────────────
    traffic_stop: {
      label:         'Traffic Stop',
      category:      'police',
      spawnMode:     'road_any',
      spawnWeight:   12,
      requirements:  [['patrol']],
      reward:        150,
      patientChance: 0,
      patients:      [],
      chargeTiers:   [
        { tier: 'summary_offense', weight: 80 },
        { tier: 'misdemeanor',     weight: 20 },
      ],
      escalatesTo:   'dui_arrest',
      escalateChance:0.15,
      escalateAfter: 30,
      color:         '#5865f2'
    },
    dui_arrest: {
      label:         'DUI Arrest',
      category:      'police',
      spawnMode:     'road_any',
      spawnWeight:   0,
      requirements:  [['patrol'],['transport_prisoner']],
      reward:        400,
      patientChance: 0.2,
      patients:      [
        { injuryType: 'intoxicated', minCount: 0, maxCount: 1 },
      ],
      chargeTiers:   [
        { tier: 'misdemeanor',     weight: 70 },
        { tier: 'felony',          weight: 25 },
        { tier: 'summary_offense', weight: 5  },
      ],
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#5865f2'
    },
    disturbance: {
      label:         'Disturbance / Fight',
      category:      'police',
      spawnMode:     'random',
      spawnWeight:   8,
      requirements:  [['patrol'],['patrol']],
      reward:        250,
      patientChance: 0.3,
      patients:      [
        { injuryType: 'trauma_minor',    minCount: 0, maxCount: 1 },
        { injuryType: 'trauma_moderate', minCount: 0, maxCount: 1 },
      ],
      chargeTiers:   [
        { tier: 'summary_offense', weight: 40 },
        { tier: 'misdemeanor',     weight: 45 },
        { tier: 'felony',          weight: 15 },
      ],
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#5865f2'
    },
    suspicious: {
      label:         'Suspicious Person/Vehicle',
      category:      'police',
      spawnMode:     'random',
      spawnWeight:   10,
      requirements:  [['patrol']],
      reward:        100,
      patientChance: 0,
      patients:      [],
      chargeTiers:   [
        { tier: 'summary_offense', weight: 70 },
        { tier: 'misdemeanor',     weight: 25 },
        { tier: 'felony',          weight: 5  },
      ],
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#5865f2'
    },

    // ── COMBINED CALLS ────────────────────────────────────────────────────────
    mva_pi: {
      label:         'MVA — Personal Injury',
      category:      'fire',
      spawnMode:     'road_major',
      spawnWeight:   12,
      requirements:  [['engine'],['bls'],['patrol']],
      reward:        600,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'trauma_moderate', minCount: 1, maxCount: 2 },
        { injuryType: 'trauma_minor',    minCount: 0, maxCount: 2 },
      ],
      chargeTiers:   [
        { tier: 'summary_offense', weight: 60 },
        { tier: 'misdemeanor',     weight: 30 },
        { tier: 'felony',          weight: 10 },
      ],
      escalatesTo:   'mva_entrapment',
      escalateChance:0.2,
      escalateAfter: 90,
      color:         '#e05c1a'
    },

    // ── MENTAL HEALTH / BEHAVIORAL CALLS ──────────────────────────────────────
    mental_health_crisis: {
      label:         'Mental Health Crisis',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   6,
      requirements:  [['patrol'],['bls','als']],
      reward:        200,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'psych_crisis', minCount: 1, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#a855f7'
    },
    suicidal_subject: {
      label:         'Suicidal Subject',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   4,
      requirements:  [['patrol'],['bls','als']],
      reward:        250,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'psych_crisis', minCount: 1, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#a855f7'
    },
  },

  // ---------------------------------------------------------------------------
  // PATIENT INJURY TYPES
  // ---------------------------------------------------------------------------
  // needsALS: whether ALS-level care is required for transport
  // transport: destination type ('hospital' or 'prison')
  // requiredDept: preferred hospital department; falls back to 'emergency' if unavailable
  // patientTier: drives hospital stage chain
  //   'minor'    → ED only (any hospital works)
  //   'serious'  → ED → requiredDept → medsurg
  //   'critical' → ED → requiredDept → ICU → medsurg
  // stabilizeTimeSec: game-seconds for patient to be stabilized on scene before transport
  // ---------------------------------------------------------------------------
  injuryTypes: {
    // ── Medical ───────────────────────────────────────────────────────────────
    cardiac_arrest: {
      label:            'Cardiac Arrest',
      needsALS:         true,
      transport:        'hospital',
      requiredDept:     'cardiac_cath',
      patientTier:      'critical',
      stabilizeTimeSec: 120,
    },
    respiratory_arrest: {
      label:            'Respiratory Arrest',
      needsALS:         true,
      transport:        'hospital',
      requiredDept:     'icu',
      patientTier:      'critical',
      stabilizeTimeSec: 90,
    },
    unresponsive: {
      label:            'Unresponsive',
      needsALS:         true,
      transport:        'hospital',
      requiredDept:     'emergency',
      patientTier:      'serious',
      stabilizeTimeSec: 60,
    },
    myocardial: {
      label:            'Heart Attack',
      needsALS:         true,
      transport:        'hospital',
      requiredDept:     'cardiac_cath',
      patientTier:      'critical',
      stabilizeTimeSec: 120,
    },
    diabetic: {
      label:            'Diabetic Emergency',
      needsALS:         true,
      transport:        'hospital',
      requiredDept:     'emergency',
      patientTier:      'minor',
      stabilizeTimeSec: 60,
    },
    syncope: {
      label:            'Syncope / Fainting',
      needsALS:         false,
      transport:        'hospital',
      requiredDept:     'emergency',
      patientTier:      'minor',
      stabilizeTimeSec: 45,
    },
    // ── Trauma ────────────────────────────────────────────────────────────────
    trauma_critical: {
      label:            'Critical Trauma',
      needsALS:         true,
      transport:        'hospital',
      requiredDept:     'trauma_bay',
      patientTier:      'critical',
      stabilizeTimeSec: 180,
    },
    trauma_moderate: {
      label:            'Moderate Trauma',
      needsALS:         true,
      transport:        'hospital',
      requiredDept:     'surgery',
      patientTier:      'serious',
      stabilizeTimeSec: 90,
    },
    trauma_minor: {
      label:            'Minor Trauma',
      needsALS:         false,
      transport:        'hospital',
      requiredDept:     'emergency',
      patientTier:      'minor',
      stabilizeTimeSec: 30,
    },
    // ── Behavioral / Other ────────────────────────────────────────────────────
    intoxicated: {
      label:            'Intoxicated Person',
      needsALS:         false,
      transport:        'hospital',
      requiredDept:     'emergency',
      patientTier:      'minor',
      stabilizeTimeSec: 20,
    },
    psych_crisis: {
      label:            'Psychiatric Crisis',
      needsALS:         false,
      transport:        'hospital',
      requiredDept:     'behavioral_health',
      patientTier:      'serious',
      stabilizeTimeSec: 90,
    },
    prisoner: {
      label:            'Prisoner / Arrestee',
      needsALS:         false,
      transport:        'prison',
      requiredDept:     null,
      patientTier:      'minor',
      stabilizeTimeSec: 0,
    },
  },

  // ---------------------------------------------------------------------------
  // HOSPITAL DEPARTMENT DEFINITIONS
  // ---------------------------------------------------------------------------
  // All stage durations are in game-seconds. Actual duration is rolled randomly
  // between minSec and maxSec at stage entry.
  // cost = purchase price to install this department at a hospital.
  // baseBeds = beds available when department is first installed.
  // ---------------------------------------------------------------------------
  hospitalDepartments: {
    emergency: {
      label:               'Emergency Department',
      baseBeds:            10,
      cost:                0,     // every hospital starts with ED (included in base cost)
      costPerBed:          2000,  // cost to add one bed to this department
      stageDurationMinSec: 600,
      stageDurationMaxSec: 1800,
    },
    trauma_bay: {
      label:               'Trauma Bay',
      baseBeds:            2,
      cost:                15000,
      costPerBed:          5000,
      stageDurationMinSec: 1200,
      stageDurationMaxSec: 3600,
    },
    cardiac_cath: {
      label:               'Cardiac / Cath Lab',
      baseBeds:            1,
      cost:                20000,
      costPerBed:          10000,
      stageDurationMinSec: 3600,
      stageDurationMaxSec: 7200,
    },
    icu: {
      label:               'ICU',
      baseBeds:            4,
      cost:                18000,
      costPerBed:          8000,
      stageDurationMinSec: 7200,
      stageDurationMaxSec: 14400,
    },
    surgery: {
      label:               'Surgery',
      baseBeds:            2,
      cost:                20000,
      costPerBed:          7000,
      stageDurationMinSec: 1800,
      stageDurationMaxSec: 5400,
    },
    neurology: {
      label:               'Neurology',
      baseBeds:            2,
      cost:                15000,
      costPerBed:          6000,
      stageDurationMinSec: 3600,
      stageDurationMaxSec: 7200,
    },
    ob_gyn: {
      label:               'OB / GYN',
      baseBeds:            4,
      cost:                12000,
      costPerBed:          4000,
      stageDurationMinSec: 1800,
      stageDurationMaxSec: 3600,
    },
    behavioral_health: {
      label:               'Behavioral Health',
      baseBeds:            4,
      cost:                10000,
      costPerBed:          3000,
      stageDurationMinSec: 3600,
      stageDurationMaxSec: 10800,
    },
    medsurg: {
      label:               'Med / Surg',
      baseBeds:            10,
      cost:                8000,
      costPerBed:          2000,
      stageDurationMinSec: 3600,
      stageDurationMaxSec: 14400,
    },
  },

  // ---------------------------------------------------------------------------
  // HOSPITAL TYPE DEFINITIONS
  // ---------------------------------------------------------------------------
  // All hospitals start with the Emergency Department. The label is the default
  // name — each placed hospital instance is individually named by the player.
  // availDepts = departments the player can purchase for this hospital type.
  // ---------------------------------------------------------------------------
  hospitalTypes: {
    hospital: {
      label:      'Hospital',
      icon:       '🏥',
      cost:       30000,
      color:      '#22c55e',
      baseDepts:  ['emergency'],
      availDepts: ['trauma_bay','cardiac_cath','icu','surgery','neurology','ob_gyn','behavioral_health','medsurg'],
    },
    // Architecture supports future: critical_access, level1_trauma, specialty_center
  },

  // ---------------------------------------------------------------------------
  // FACILITY PLACEMENT COSTS
  // ---------------------------------------------------------------------------
  facilityPlacementCost: {
    hospital:           30000,
    county_jail:        20000,
    state_correctional: 40000,
  },

  // ---------------------------------------------------------------------------
  // JAIL / CORRECTIONAL FACILITY TYPE DEFINITIONS
  // ---------------------------------------------------------------------------
  // startingCells: cells provided at facility placement (no extra cost)
  // costPerCell: cost to add one additional cell via the purchase UI
  // processingTime: range of game-seconds for processing a prisoner before release/transfer
  // ---------------------------------------------------------------------------
  facilityTypes: {
    county_jail: {
      label:               'County Jail',
      icon:                '🔒',
      color:               '#94a3b8',
      startingCells:       8,
      costPerCell:         500,
      processingTimeMinSec: 1200,
      processingTimeMaxSec: 3600,
    },
    state_correctional: {
      label:               'State Correctional Facility',
      icon:                '⛓️',
      color:               '#475569',
      startingCells:       20,
      costPerCell:         800,
      processingTimeMinSec: 3600,
      processingTimeMaxSec: 7200,
    },
  },

  // ---------------------------------------------------------------------------
  // POLICE STATION HOLDING CELL UPGRADE
  // ---------------------------------------------------------------------------
  holdingCellUpgrade: {
    startingCells: 1,    // every holding-cell upgrade starts with 1 cell
    costPerCell:   400,  // cost per additional cell purchased
  },

  // ---------------------------------------------------------------------------
  // EMERGENCY SPEED SYSTEM
  // ---------------------------------------------------------------------------
  // Applied to OSRM per-segment speeds during emergency dispatch and transport.
  // bonusMph: added to each road segment's OSRM predicted speed.
  // floorMph: minimum per-segment speed (prevents stop-and-go map walking).
  // maxSpeedByType: hard cap per unit type (0 = no cap).
  // alsCriticalBonusMph: total speed bonus when ALS unit transports a critical patient.
  // blsCriticalBonusMph: total speed bonus when BLS unit transports a critical patient.
  // ---------------------------------------------------------------------------
  emergencySpeed: {
    bonusMph:           15,   // added to OSRM speed on every road segment during emergency response
    floorMph:           40,   // minimum speed floor per segment during emergency response
    alsCriticalBonusMph: 20,  // replaces bonusMph for ALS units carrying a critical patient
    blsCriticalBonusMph: 10,  // replaces bonusMph for BLS units carrying a critical patient
    // Hard speed caps (mph) per unit typeKey. 0 = uncapped.
    maxSpeedByType: {
      // Fire apparatus — limited by vehicle weight and apparatus safety
      engine:            75,
      pumper_tanker:     75,
      tanker:            75,
      ladder:            75,
      brush_truck:       75,
      rescue:            75,
      rescue_engine:     75,
      // EMS — ambulances are built for speed but governed for safety
      als_ambulance:     90,
      bls_ambulance:     90,
      fly_car:           90,
      // Police — pursuit-capable vehicles
      patrol:            110,
      supervisor:        110,
      k9:                110,
      // Heavy transport van — slower than patrol cars
      sheriff_transport: 75,
      // Helicopter uses speedMph directly (straight-line, not segment-based)
    },
  },

  // ---------------------------------------------------------------------------
  // CHARGE TIER DEFINITIONS
  // ---------------------------------------------------------------------------
  // releaseChanceScene: 0–1 probability suspect is cited and released at the scene
  // releaseChanceStation: 0–1 probability released after booking at a police station
  // transferChanceJail: 0–1 probability suspect must be transferred to a county jail
  // processingTime: game-seconds range for booking/processing at each location
  // ---------------------------------------------------------------------------
  chargeTiers: {
    summary_offense: {
      label:                  'Summary Offense',
      processingTimeMinSec:   600,
      processingTimeMaxSec:   1200,
      releaseChanceScene:     0.40,
      releaseChanceStation:   0.80,
      transferChanceJail:     0.00,
    },
    misdemeanor: {
      label:                  'Misdemeanor',
      processingTimeMinSec:   1800,
      processingTimeMaxSec:   3600,
      releaseChanceScene:     0.00,
      releaseChanceStation:   0.50,
      transferChanceJail:     0.50,
    },
    felony: {
      label:                  'Felony',
      processingTimeMinSec:   3600,
      processingTimeMaxSec:   7200,
      releaseChanceScene:     0.00,
      releaseChanceStation:   0.00,
      transferChanceJail:     1.00,
    },
    violent_felony: {
      label:                  'Violent Felony',
      processingTimeMinSec:   3600,
      processingTimeMaxSec:   7200,
      releaseChanceScene:     0.00,
      releaseChanceStation:   0.00,
      transferChanceJail:     1.00,
    },
  },

  // ---------------------------------------------------------------------------
  // PATIENT STABILIZATION RATES BY PROVIDER LEVEL
  // ---------------------------------------------------------------------------
  // Rate applied per game-second per unit on scene (additive across units).
  // stabilizationProgress += (totalRate * deltaGameSec) / injuryType.stabilizeTimeSec
  // ---------------------------------------------------------------------------
  stabilizationRates: {
    als:        1.00,   // ALS ambulance, fly car, helicopter
    bls:        0.60,   // BLS ambulance
    first_aid:  0.20,   // fire units — contributes but minimally until Phase 4 personnel
  },

  // ---------------------------------------------------------------------------
  // EMS TRANSPORT REVENUE
  // ---------------------------------------------------------------------------
  // Paid to player when transport unit arrives at hospital.
  // baseFee: flat fee per transport.
  // perMileFee: per road mile (OSRM meters ÷ 1609.34 = miles).
  // Helicopters use ALS rates; distance is straight-line (haversine) miles.
  // ---------------------------------------------------------------------------
  transportRevenue: {
    als: {
      baseFee:    800,
      perMileFee: 7,
    },
    bls: {
      baseFee:    500,
      perMileFee: 5,
    },
  },

  // ---------------------------------------------------------------------------
  // HOSPITAL PATIENT REVENUE
  // ---------------------------------------------------------------------------
  // Paid to player when patient is discharged from the hospital.
  // basePerPatient: flat fee.
  // acuityMultiplier: multiplied by basePerPatient based on patient tier.
  // revenuePerMinute: per game-minute the patient spends in the hospital.
  // ---------------------------------------------------------------------------
  hospitalRevenue: {
    basePerPatient:   200,
    acuityMultiplier: {
      minor:    1.0,
      serious:  2.5,
      critical: 5.0,
    },
    revenuePerMinute: 1,
  },

  // ---------------------------------------------------------------------------
  // LAW ENFORCEMENT REVENUE
  // ---------------------------------------------------------------------------
  // arrestFee: paid immediately when a suspect is generated at scene resolution.
  // prisonerTransport: paid when transport unit arrives at jail/prison.
  // processingFee: paid when suspect is released from a facility.
  // ---------------------------------------------------------------------------
  lawEnforcementRevenue: {
    arrestFee: {
      summary_offense: 50,
      misdemeanor:     150,
      felony:          400,
      violent_felony:  600,
    },
    prisonerTransport: {
      baseFee:    100,
      perMileFee: 3,
    },
    processingFee: {
      summary_offense: 50,
      misdemeanor:     200,
      felony:          500,
      violent_felony:  800,
    },
    processingRevenuePerMinute: 0.5,
  },

  // ---------------------------------------------------------------------------
  // PERSONNEL CERTIFICATIONS  (Phase 5B)
  // ---------------------------------------------------------------------------
  // Every responder holds zero or more cert codes. Certs drive unit staffing
  // (which apparatus can roll with which crew) and determine training costs.
  //
  //   label     — display name shown in UI
  //   category  — 'fire' | 'ems' | 'police' | 'shared' (used for grouping/filters)
  //   cost      — flat $ to train an existing responder OR to add at hire time
  //   prereqs   — cert codes that must be held before this one can be earned
  //   satisfies — other cert codes this one automatically counts as. Equivalency
  //               walks are transitive (paramedic→aemt→emt→emr is one chain).
  //               These propagate through `expandCertSet()` in personnel.js so a
  //               Paramedic can fill an "EMT" crew slot, FF2 can fill an "FF1"
  //               slot, Large EVOC can fill a "Small EVOC" slot, etc.
  // ---------------------------------------------------------------------------
  certifications: {
    // ── Fire core ────────────────────────────────────────────────────────────
    fire_support:        { label: 'Fireground Support',     category: 'fire',   cost:  500, prereqs: [],                         satisfies: [] },
    fire_exterior:       { label: 'Exterior Firefighter',   category: 'fire',   cost: 1500, prereqs: [],                         satisfies: ['fire_support'] },
    ff1:                 { label: 'Firefighter 1',          category: 'fire',   cost: 3000, prereqs: [],                         satisfies: ['fire_support','fire_exterior'] },
    ff2:                 { label: 'Firefighter 2',          category: 'fire',   cost: 4500, prereqs: ['ff1'],                    satisfies: ['fire_support','fire_exterior','ff1'] },
    // EVOC: small covers ambulances and chief cars; large covers heavy apparatus and satisfies small.
    evoc_small:          { label: 'Small Vehicle EVOC',     category: 'fire',   cost:  800, prereqs: [],                         satisfies: [] },
    evoc_large:          { label: 'Large Vehicle EVOC',     category: 'fire',   cost: 1500, prereqs: ['evoc_small'],             satisfies: ['evoc_small'] },
    pump_ops_1:          { label: 'Pump Operator 1',        category: 'fire',   cost: 1500, prereqs: ['evoc_large'],             satisfies: [] },
    pump_ops_2:          { label: 'Pump Operator 2',        category: 'fire',   cost: 3000, prereqs: ['pump_ops_1'],             satisfies: ['pump_ops_1'] },
    aerial_operator:     { label: 'Aerial Operator',        category: 'fire',   cost: 4000, prereqs: ['evoc_large'],             satisfies: [] },
    fire_officer_1:      { label: 'Fire Officer 1',         category: 'fire',   cost: 3500, prereqs: ['ff1'],                    satisfies: [] },
    fire_officer_2:      { label: 'Fire Officer 2',         category: 'fire',   cost: 5000, prereqs: ['fire_officer_1'],         satisfies: ['fire_officer_1'] },
    hazmat_awareness:    { label: 'HazMat Awareness',       category: 'fire',   cost:  500, prereqs: [],                         satisfies: [] },
    hazmat_ops:          { label: 'HazMat Operations',      category: 'fire',   cost: 1500, prereqs: ['hazmat_awareness'],       satisfies: ['hazmat_awareness'] },
    hazmat_tech:         { label: 'HazMat Technician',      category: 'fire',   cost: 5000, prereqs: ['hazmat_ops'],             satisfies: ['hazmat_awareness','hazmat_ops'] },
    basic_vehicle_rescue:{ label: 'Basic Vehicle Rescue',   category: 'fire',   cost: 1000, prereqs: [],                         satisfies: [] },
    rescue_tech:         { label: 'Rescue Technician',      category: 'fire',   cost: 4000, prereqs: ['basic_vehicle_rescue'],   satisfies: ['basic_vehicle_rescue'] },
    wildland_ff:         { label: 'Wildland Firefighter',   category: 'fire',   cost: 1500, prereqs: [],                         satisfies: [] },
    fire_police:         { label: 'Fire Police',            category: 'fire',   cost:  500, prereqs: [],                         satisfies: [] },
    // ── EMS ladder + specialties ─────────────────────────────────────────────
    emr:                 { label: 'EMR',                    category: 'ems',    cost:  500, prereqs: [],                         satisfies: [] },
    emt:                 { label: 'EMT',                    category: 'ems',    cost: 2000, prereqs: [],                         satisfies: ['emr'] },
    aemt:                { label: 'AEMT',                   category: 'ems',    cost: 3500, prereqs: ['emt'],                    satisfies: ['emt','emr'] },
    paramedic:           { label: 'Paramedic',              category: 'ems',    cost: 6000, prereqs: ['emt'],                    satisfies: ['aemt','emt','emr'] },
    ccp:                 { label: 'Critical Care Paramedic',category: 'ems',    cost: 8000, prereqs: ['paramedic'],              satisfies: ['paramedic','aemt','emt','emr'] },
    phrn:                { label: 'Prehospital RN',         category: 'ems',    cost: 8000, prereqs: [],                         satisfies: ['paramedic','aemt','emt','emr'] },
    ems_supervisor:      { label: 'EMS Supervisor',         category: 'ems',    cost: 4000, prereqs: ['emt'],                    satisfies: [] },
    tactical_ems:        { label: 'Tactical EMS',           category: 'ems',    cost: 5000, prereqs: ['emt'],                    satisfies: [] },
    // ── Police ───────────────────────────────────────────────────────────────
    patrol_officer:      { label: 'Patrol Officer',         category: 'police', cost: 2000, prereqs: [],                         satisfies: [] },
    patrol_supervisor:   { label: 'Patrol Supervisor',      category: 'police', cost: 4000, prereqs: ['patrol_officer'],         satisfies: ['patrol_officer'] },
    fto:                 { label: 'Field Training Officer', category: 'police', cost: 2500, prereqs: ['patrol_officer'],         satisfies: [] },
    crash_investigation: { label: 'Crash Investigation',    category: 'police', cost: 2500, prereqs: ['patrol_officer'],         satisfies: [] },
    k9_handler:          { label: 'K9 Handler',             category: 'police', cost: 3000, prereqs: ['patrol_officer'],         satisfies: [] },
    swat:                { label: 'SWAT',                   category: 'police', cost: 6000, prereqs: ['patrol_officer'],         satisfies: [] },
    detective:           { label: 'Detective',              category: 'police', cost: 5000, prereqs: ['patrol_officer'],         satisfies: [] },
    crisis_negotiator:   { label: 'Crisis Negotiator',      category: 'police', cost: 4000, prereqs: ['patrol_officer'],         satisfies: [] },
    bomb_squad:          { label: 'Bomb Squad',             category: 'police', cost: 7000, prereqs: ['patrol_officer'],         satisfies: [] },
    // ── Shared across services ──────────────────────────────────────────────
    bls_first_aid:       { label: 'BLS / First Aid',        category: 'shared', cost:  300, prereqs: [],                         satisfies: [] },
    drone_operator:      { label: 'Drone Operator',         category: 'shared', cost: 2000, prereqs: [],                         satisfies: [] }
  },

  // ---------------------------------------------------------------------------
  // CREW DEFAULTS PER UNIT TYPE  (Phase 5B)
  // ---------------------------------------------------------------------------
  // Defines the minimum and ideal cert "slots" each apparatus needs to roll.
  //
  //   driverCert — Hard gate. Apparatus literally cannot move unless at least
  //                ONE assigned crew member holds this cert (or an equivalent
  //                via `satisfies`). When null, no driver gate is applied
  //                (used for aircraft where pilot certification is its own thing).
  //   min        — Cert slots required to dispatch at minimum staffing.
  //                Crew-slot rule: one person fills exactly one slot, even if
  //                multi-cert. So `{evoc_large:1, ff1:1}` requires TWO distinct
  //                people. The greedy matcher in personnel.js handles which
  //                person fills which slot using cert equivalency.
  //   ideal      — Cert slots the player wants on every response. Falling
  //                short of ideal does NOT block dispatch — it kicks off the
  //                ideal-wait timer per station/unit/call policy.
  //
  // Per-unit overrides (unit.crewMin / unit.crewIdeal) take precedence when set.
  //
  // Ambulance rule (player-confirmed 2026-05-17): 2-crew minimum is enforced
  // by min having TWO distinct slots — driver + patient-care provider.
  // ---------------------------------------------------------------------------
  crewDefaults: {
    // ── Fire ─────────────────────────────────────────────────────────────────
    engine:            { driverCert: 'evoc_large', min: { evoc_large:1, ff1:1 },            ideal: { evoc_large:1, fire_officer_1:1, ff1:2 } },
    pumper_tanker:     { driverCert: 'evoc_large', min: { evoc_large:1, ff1:1 },            ideal: { evoc_large:1, fire_officer_1:1, ff1:2 } },
    tanker:            { driverCert: 'evoc_large', min: { evoc_large:1 },                   ideal: { evoc_large:1, ff1:1 } },
    ladder:            { driverCert: 'evoc_large', min: { evoc_large:1, ff1:1 },            ideal: { evoc_large:1, aerial_operator:1, fire_officer_1:1, ff1:2 } },
    brush_truck:       { driverCert: 'evoc_small', min: { evoc_small:1, fire_exterior:1 },  ideal: { evoc_small:1, wildland_ff:1, fire_exterior:1 } },
    rescue:            { driverCert: 'evoc_large', min: { evoc_large:1, ff1:1 },            ideal: { evoc_large:1, ff1:2, rescue_tech:1 } },
    rescue_engine:     { driverCert: 'evoc_large', min: { evoc_large:1, ff1:1 },            ideal: { evoc_large:1, ff1:2, rescue_tech:1 } },
    // ── EMS ──────────────────────────────────────────────────────────────────
    als_ambulance:     { driverCert: 'evoc_small', min: { evoc_small:1, paramedic:1 },      ideal: { evoc_small:1, paramedic:1 } },
    bls_ambulance:     { driverCert: 'evoc_small', min: { evoc_small:1, emt:1 },            ideal: { evoc_small:1, emt:1 } },
    fly_car:           { driverCert: 'evoc_small', min: { evoc_small:1, emt:1 },            ideal: { evoc_small:1, paramedic:1 } },
    // ── Police ───────────────────────────────────────────────────────────────
    patrol:            { driverCert: 'evoc_small', min: { evoc_small:1, patrol_officer:1 }, ideal: { evoc_small:1, patrol_officer:1 } },
    supervisor:        { driverCert: 'evoc_small', min: { evoc_small:1, patrol_supervisor:1 }, ideal: { evoc_small:1, patrol_supervisor:1 } },
    k9:                { driverCert: 'evoc_small', min: { evoc_small:1, k9_handler:1 },     ideal: { evoc_small:1, k9_handler:1 } },
    sheriff_transport: { driverCert: 'evoc_small', min: { evoc_small:1, patrol_officer:1 }, ideal: { evoc_small:1, patrol_officer:2 } },
    // ── Air Medical ──────────────────────────────────────────────────────────
    // No driver gate for aircraft — pilot certification is parallel and out of scope for 5B.
    helicopter:        { driverCert: null,         min: { paramedic:1 },                    ideal: { paramedic:1, ccp:1 } }
  },

  // ---------------------------------------------------------------------------
  // PERSONNEL / DISPATCH POLICY DEFAULTS  (Phase 5B)
  // ---------------------------------------------------------------------------
  // idealCrewWaitMs        — Global default time a unit will wait for ideal
  //                          crew once min crew is met, before departing at
  //                          minimum staffing. Overridable per-station and
  //                          per-unit (station/unit `idealCrewWaitMs`).
  // stationStaffingTypes   — Valid values for station.stationType. Career and
  //                          combination are active in 5B; volunteer behavior
  //                          (home/work locations, direct-to-scene) lands in 5D.
  // personnelHireCostBase  — Flat onboarding cost per career responder, before
  //                          any selected cert training costs are added.
  // ---------------------------------------------------------------------------
  idealCrewWaitMs:       10 * 60 * 1000,
  stationStaffingTypes:  ['career','combination','volunteer'],
  personnelHireCostBase: 2000,

  // ---------------------------------------------------------------------------
  // SALARY + TRAINING ECONOMICS  (Phase 5C)
  // ---------------------------------------------------------------------------
  // salaryBaseAnnual          — Entry-level base annual salary in $. Per-person
  //                             salary = salaryBaseAnnual × rank.salaryMultiplier.
  //                             Daily deduction = salaryAnnual / 365.
  // salaryDeductionInterval   — 'gameDay' default. Runs once per in-game-day
  //                             rollover inside _tickGameClock. Configurable to
  //                             'gameHour' or 'realMinute' in the future.
  // trainingCostMultiplier    — Multiplier applied to a cert's `cost` when an
  //                             existing person is retrained into that cert.
  //                             1.0 = parity with the at-hire cost. Players can
  //                             nudge this if training feels too cheap/expensive.
  // ---------------------------------------------------------------------------
  salaryBaseAnnual:        50000,
  salaryDeductionInterval: 'gameDay',
  trainingCostMultiplier:  1.0,

  // ---------------------------------------------------------------------------
  // RANK CONFIG  (Phase 5C)
  // ---------------------------------------------------------------------------
  // Per-service rank ladders. Each rank:
  //   key                — internal id. person.rankKey points here.
  //   label              — display name shown to the player.
  //   service            — 'fire' | 'ems' | 'police_local' | 'police_county' | 'police_state'
  //   prereqCerts        — cert codes that must be held (transitively, via
  //                        expandCertSet) before the player can manually
  //                        promote the person into this rank. Empty = anyone.
  //   salaryMultiplier   — multiplier on salaryBaseAnnual for career personnel.
  //                        Volunteers ignore salaries entirely.
  //
  // Promotion is manual + free (player-confirmed 2026-05-17): the player picks
  // when an eligible person advances. Cert training is the economic cost.
  // Free-text fallback is preserved on the person via `rank` for backwards-
  // compat with the 5B free-text rank field.
  // ---------------------------------------------------------------------------
  rankConfig: {
    fire: [
      { key:'fire_probationary',  label:'Probationary Firefighter', service:'fire', prereqCerts:[],                                salaryMultiplier:0.80 },
      { key:'fire_firefighter',   label:'Firefighter',              service:'fire', prereqCerts:['ff1'],                           salaryMultiplier:1.00 },
      { key:'fire_senior_ff',     label:'Senior Firefighter',       service:'fire', prereqCerts:['ff2'],                           salaryMultiplier:1.10 },
      { key:'fire_driver_op',     label:'Driver/Operator',          service:'fire', prereqCerts:['evoc_large','pump_ops_1'],       salaryMultiplier:1.20 },
      { key:'fire_lieutenant',    label:'Lieutenant',               service:'fire', prereqCerts:['fire_officer_1'],                salaryMultiplier:1.35 },
      { key:'fire_captain',       label:'Captain',                  service:'fire', prereqCerts:['fire_officer_1'],                salaryMultiplier:1.55 },
      { key:'fire_battalion',     label:'Battalion Chief',          service:'fire', prereqCerts:['fire_officer_2'],                salaryMultiplier:1.80 },
      { key:'fire_deputy',        label:'Deputy Chief',             service:'fire', prereqCerts:['fire_officer_2'],                salaryMultiplier:2.00 },
      { key:'fire_assistant',     label:'Assistant Chief',          service:'fire', prereqCerts:['fire_officer_2'],                salaryMultiplier:2.20 },
      { key:'fire_dept_chief',    label:'Department Chief',         service:'fire', prereqCerts:['fire_officer_2'],                salaryMultiplier:2.60 },
      { key:'fire_marshal',       label:'Fire Marshal',             service:'fire', prereqCerts:['fire_officer_1'],                salaryMultiplier:1.50 },
      { key:'fire_inspector',     label:'Fire Inspector',           service:'fire', prereqCerts:['ff1'],                           salaryMultiplier:1.25 },
      { key:'fire_training',      label:'Training Officer',         service:'fire', prereqCerts:['fire_officer_1','ff2'],          salaryMultiplier:1.40 },
      { key:'fire_safety',        label:'Safety Officer',           service:'fire', prereqCerts:['fire_officer_1'],                salaryMultiplier:1.40 }
    ],
    ems: [
      { key:'ems_probationary',   label:'Probationary EMS Member',  service:'ems',  prereqCerts:[],                                salaryMultiplier:0.75 },
      { key:'ems_driver',         label:'EMS Driver',               service:'ems',  prereqCerts:['evoc_small'],                    salaryMultiplier:0.85 },
      { key:'ems_emr',            label:'EMR',                      service:'ems',  prereqCerts:['emr'],                           salaryMultiplier:0.90 },
      { key:'ems_emt',            label:'EMT',                      service:'ems',  prereqCerts:['emt'],                           salaryMultiplier:1.00 },
      { key:'ems_aemt',           label:'Advanced EMT',             service:'ems',  prereqCerts:['aemt'],                          salaryMultiplier:1.15 },
      { key:'ems_paramedic',      label:'Paramedic',                service:'ems',  prereqCerts:['paramedic'],                     salaryMultiplier:1.40 },
      { key:'ems_senior_emt',     label:'Senior EMT',               service:'ems',  prereqCerts:['emt'],                           salaryMultiplier:1.15 },
      { key:'ems_senior_medic',   label:'Senior Paramedic',         service:'ems',  prereqCerts:['paramedic'],                     salaryMultiplier:1.55 },
      { key:'ems_fto',            label:'Field Training Officer',   service:'ems',  prereqCerts:['paramedic'],                     salaryMultiplier:1.50 },
      { key:'ems_lieutenant',     label:'EMS Lieutenant',           service:'ems',  prereqCerts:['paramedic','ems_supervisor'],    salaryMultiplier:1.60 },
      { key:'ems_captain',        label:'EMS Captain',              service:'ems',  prereqCerts:['paramedic','ems_supervisor'],    salaryMultiplier:1.80 },
      { key:'ems_supervisor',     label:'EMS Supervisor',           service:'ems',  prereqCerts:['ems_supervisor'],                salaryMultiplier:1.70 },
      { key:'ems_duty_officer',   label:'EMS Duty Officer',         service:'ems',  prereqCerts:['paramedic','ems_supervisor'],    salaryMultiplier:1.85 },
      { key:'ems_chief',          label:'EMS Chief',                service:'ems',  prereqCerts:['paramedic','ems_supervisor'],    salaryMultiplier:2.20 },
      { key:'ems_medical_dir',    label:'Medical Director',         service:'ems',  prereqCerts:['paramedic'],                     salaryMultiplier:2.50 }
    ],
    police_local: [
      { key:'pol_recruit',        label:'Police Recruit',           service:'police_local', prereqCerts:[],                        salaryMultiplier:0.85 },
      { key:'pol_officer',        label:'Police Officer',           service:'police_local', prereqCerts:['patrol_officer'],        salaryMultiplier:1.00 },
      { key:'pol_senior',         label:'Senior Police Officer',    service:'police_local', prereqCerts:['patrol_officer'],        salaryMultiplier:1.10 },
      { key:'pol_corporal',       label:'Corporal',                 service:'police_local', prereqCerts:['patrol_officer'],        salaryMultiplier:1.20 },
      { key:'pol_sergeant',       label:'Sergeant',                 service:'police_local', prereqCerts:['patrol_supervisor'],     salaryMultiplier:1.35 },
      { key:'pol_lieutenant',     label:'Lieutenant',               service:'police_local', prereqCerts:['patrol_supervisor'],     salaryMultiplier:1.55 },
      { key:'pol_captain',        label:'Captain',                  service:'police_local', prereqCerts:['patrol_supervisor'],     salaryMultiplier:1.75 },
      { key:'pol_deputy',         label:'Deputy Chief',             service:'police_local', prereqCerts:['patrol_supervisor'],     salaryMultiplier:2.00 },
      { key:'pol_assistant',      label:'Assistant Chief',          service:'police_local', prereqCerts:['patrol_supervisor'],     salaryMultiplier:2.20 },
      { key:'pol_chief',          label:'Police Chief',             service:'police_local', prereqCerts:['patrol_supervisor'],     salaryMultiplier:2.50 }
    ],
    police_county: [
      { key:'sher_deputy',        label:"Sheriff's Deputy",         service:'police_county', prereqCerts:['patrol_officer'],       salaryMultiplier:1.00 },
      { key:'sher_senior',        label:'Senior Deputy',            service:'police_county', prereqCerts:['patrol_officer'],       salaryMultiplier:1.15 },
      { key:'sher_sergeant',      label:'Sergeant Deputy',          service:'police_county', prereqCerts:['patrol_supervisor'],    salaryMultiplier:1.35 },
      { key:'sher_lieutenant',    label:'Lieutenant Deputy',        service:'police_county', prereqCerts:['patrol_supervisor'],    salaryMultiplier:1.55 },
      { key:'sher_chief',         label:'Chief Deputy',             service:'police_county', prereqCerts:['patrol_supervisor'],    salaryMultiplier:2.00 },
      { key:'sher_sheriff',       label:'Sheriff',                  service:'police_county', prereqCerts:['patrol_supervisor'],    salaryMultiplier:2.50 }
    ],
    police_state: [
      { key:'sp_trooper',         label:'State Trooper',            service:'police_state', prereqCerts:['patrol_officer'],        salaryMultiplier:1.05 },
      { key:'sp_first_class',     label:'Trooper First Class',      service:'police_state', prereqCerts:['patrol_officer'],        salaryMultiplier:1.15 },
      { key:'sp_corporal',        label:'Trooper Corporal',         service:'police_state', prereqCerts:['patrol_officer'],        salaryMultiplier:1.25 },
      { key:'sp_sergeant',        label:'Trooper Sergeant',         service:'police_state', prereqCerts:['patrol_supervisor'],     salaryMultiplier:1.45 },
      { key:'sp_lieutenant',      label:'Trooper Lieutenant',       service:'police_state', prereqCerts:['patrol_supervisor'],     salaryMultiplier:1.65 },
      { key:'sp_captain',         label:'Trooper Captain',          service:'police_state', prereqCerts:['patrol_supervisor'],     salaryMultiplier:1.90 },
      { key:'sp_major',           label:'Major',                    service:'police_state', prereqCerts:['patrol_supervisor'],     salaryMultiplier:2.20 },
      { key:'sp_colonel',         label:'Colonel / Superintendent', service:'police_state', prereqCerts:['patrol_supervisor'],     salaryMultiplier:2.70 }
    ]
  },

  // ---------------------------------------------------------------------------
  // SHIFT TEMPLATES  (Phase 5C)
  // ---------------------------------------------------------------------------
  // Built-in shift schedules selectable in the Station Manage modal's shift
  // editor. Each station also keeps its own `shifts: []` array of custom
  // schedules. A person's `shiftId` points to either a built-in (by key) or a
  // station-custom (by id) shift.
  //
  //   key            — internal id used by person.shiftId.
  //   label          — display name in dropdowns.
  //   cycleDays      — total days in the repeat cycle (24/48 = 3-day cycle).
  //   onPattern      — per-cycle-day array of on-hour windows. Each window is
  //                    [startHour, endHour] in 24-hour time. endHour may exceed
  //                    24 to indicate the shift carries past midnight (cycle
  //                    rollover handled by isOnDutyNow).
  //
  // Common patterns (US fire/EMS career staffing):
  //   24/48 — 1 day on, 2 days off, 3-day cycle.
  //   48/96 — 2 days on, 4 days off, 6-day cycle.
  //   Day shift  — every day 06:00–18:00.
  //   Night shift — every day 18:00–06:00 (carries into next day).
  //   Weekday days — Mon–Fri 08:00–17:00.
  // ---------------------------------------------------------------------------
  shiftTemplates: [
    { key:'shift_24_48',    label:'24/48 (1 on, 2 off)',  cycleDays:3, onPattern:[ [[0,24]], [], [] ] },
    { key:'shift_48_96',    label:'48/96 (2 on, 4 off)',  cycleDays:6, onPattern:[ [[0,24]], [[0,24]], [], [], [], [] ] },
    { key:'shift_day',      label:'Day shift (06–18)',     cycleDays:1, onPattern:[ [[6,18]] ] },
    { key:'shift_night',    label:'Night shift (18–06)',   cycleDays:1, onPattern:[ [[18,30]] ] },
    { key:'shift_weekday',  label:'Weekday daytime',       cycleDays:7, onPattern:[ [[8,17]], [[8,17]], [[8,17]], [[8,17]], [[8,17]], [], [] ] }
  ],

  // ---------------------------------------------------------------------------
  // VOLUNTEER + OSM CONSTANTS  (Phase 5D)
  // ---------------------------------------------------------------------------
  // overpassEndpoint           — Public Overpass API. Used to fetch buildings
  //                              per ESN polygon for volunteer home/work
  //                              generation. Rate-limited by Overpass — see
  //                              osmRebuildCooldownSec for per-ESN throttling.
  // overpassTimeoutMs          — Single-query timeout. Hybrid plan calls for
  //                              fallback to road-snapped random points on
  //                              failure/timeout (docs/Phase5.md).
  // osrmNearestEndpoint        — OSRM's nearest-road API. Used in fallback mode
  //                              to snap a random polygon point to within a few
  //                              yards of the nearest roadway, so a fabricated
  //                              "home" is at least believable as a real address.
  // osmCacheTtlMs              — Per-ESN cache TTL in REAL-LIFE milliseconds
  //                              (calendar time, Date.now()-based — not game
  //                              days). 30 days per docs/data-lifecycle.md §3.
  // osmRebuildCooldownSec      — Soft per-ESN cooldown so click-happy "Rebuild"
  //                              presses don't hammer Overpass.
  // volunteerDefaultReliability— Default reliability roll (0..1) used when a
  //                              volunteer hasn't been customized. Higher =
  //                              more likely to respond on any given call.
  // ambulanceDriverOnlyDefault — Global default for the per-station ambulance
  //                              driver-only policy. Player-confirmed: FALSE.
  //                              Ambulances complete crew at the station by
  //                              default; driver-only response is opt-in.
  // directToSceneAllowedRoles  — Cert codes whose holders may respond direct
  //                              to scene (POV) instead of reporting to station
  //                              first. Per Phase5.md: chiefs, fire police,
  //                              LEOs, EMS, certified responders.
  // ---------------------------------------------------------------------------
  overpassEndpoint:            'https://overpass-api.de/api/interpreter',
  overpassTimeoutMs:           10000,
  osrmNearestEndpoint:         'https://router.project-osrm.org/nearest/v1/driving',
  osmCacheTtlMs:               30 * 24 * 60 * 60 * 1000,
  osmRebuildCooldownSec:       30,
  volunteerDefaultReliability: 0.8,
  // volunteerResponseSpeedMph — Speed used to animate volunteers traveling
  //                              from home (or a roaming location) to the
  //                              station before the apparatus departs.
  //                              Phase 5 bugfix: raised to 50 (player spec).
  //                              Acts as a floor — OSRM-predicted time wins
  //                              when it implies a faster route.
  volunteerResponseSpeedMph:   50,
  // Phase 5 bugfix — hourly availability state model.
  //
  // Every game-hour, each idle volunteer re-rolls their state:
  //   • availableHomeChance  — probability of being available at home
  //   • availableRoamingChance — probability of being available but at a
  //                              random point inside one of the station's
  //                              coverage ESNs (rare per spec)
  //   • the remainder (1 - home - roaming) — unavailable
  //
  // Schedule windows still apply on top of these — if the current hour falls
  // outside a configured availability window, the volunteer is forced to
  // 'unavailable' regardless of the dice roll.
  volunteerAvailableHomeChance:    0.7,
  volunteerAvailableRoamingChance: 0.05,
  // Post-call release timing (game-seconds).
  //   • PostCallReleaseGameSec  — after a volunteer's unit reaches the station
  //     on return, the volunteer stays at-station this long (still flagged
  //     busy so the player can re-dispatch them) before being marked
  //     available again.
  //   • ReturnHomeGameSec       — after that, this long passes before the
  //     volunteer auto-travels home (if no new assignment intervenes).
  volunteerPostCallReleaseGameSec: 300,   // 5 game-minutes
  volunteerReturnHomeGameSec:      600,   // 10 game-minutes after release
  ambulanceDriverOnlyDefault:  false,
  directToSceneAllowedRoles: [
    'fire_officer_1','fire_officer_2',     // chiefs and officers
    'fire_police',                          // fire police
    'patrol_officer','patrol_supervisor',   // LEOs
    'emt','aemt','paramedic','ccp','phrn',  // EMS
    'emr'                                   // first responders
  ],

  // ---------------------------------------------------------------------------
  // SPAN OF CONTROL  (Phase 5E — NIMS/ICS officer-to-responder ratio)
  // ---------------------------------------------------------------------------
  // Ratio = subordinates / officers (officers = Fire Officer 1+, EMS Supervisor,
  // Patrol Supervisor+). Universal across incident size per player requirement.
  // Each tier ships with a player-facing tooltip explaining what's happening
  // and how to fix it — surfaced on the call window status chip.
  // ---------------------------------------------------------------------------
  spanOfControlTiers: {
    bored: {
      label: 'Command Staff Bored',
      max:   3,            // ratio <= 3 (officers exceed need)
      color: '#9ca3af',
      tooltip: 'More officers on scene than needed. Subordinates are underutilized. Send officers to other incidents or release them.'
    },
    ideal: {
      label: 'Ideal Command Staffing',
      max:   5,            // ratio 4-5
      color: '#22c55e',
      tooltip: 'Officer-to-responder ratio is in the sweet spot (1:4–1:5). Command staffing is healthy.'
    },
    task_saturated: {
      label: 'Command Staff Task Saturated',
      max:   7,            // ratio 6-7
      color: '#fbbf24',
      tooltip: 'Officers are stretched thin (1:6–1:7). Consider sending another officer-qualified responder before the incident grows.'
    },
    overwhelmed: {
      label: 'Command Staff Overwhelmed — Need More Officers',
      max:   Infinity,     // ratio > 7
      color: '#e8431a',
      tooltip: 'Not enough officers to safely manage the incident (above 1:7). Send at least one more Fire Officer 1+ / supervisor immediately.'
    }
  },
  // Cert codes that count as "officer" for span-of-control evaluation.
  spanOfControlOfficerCerts: [
    'fire_officer_1','fire_officer_2',
    'ems_supervisor',
    'patrol_supervisor'
  ],

  // ---------------------------------------------------------------------------
  // PERSONNEL STABILIZATION RATES  (Phase 5E — personnel-driven patient mechanic)
  // ---------------------------------------------------------------------------
  // Per-game-second stabilization contribution from a provider holding each
  // EMS cert tier. Distinct from the existing unit-level `stabilizationRates`
  // block above (line 1073) — that one is the unit-on-scene rate inherited
  // from earlier phases; this one is the additive contribution from each
  // ASSIGNED personnel (Phase 5E patient mechanic).
  //
  // Multiple providers stack additively on the same patient. One provider can
  // only be assigned to one patient at a time (slot rule, enforced in
  // assignPersonToPatient).
  //
  // Tuning aims: solo EMT resolves a stable patient in ~3–4 in-game minutes;
  // a Paramedic ~1.5 min; CCP nearly halves that again.
  // ---------------------------------------------------------------------------
  personnelStabilizationRates: {
    emr:       0.0020,    // ~500 sec to stabilize solo
    emt:       0.0050,    // ~200 sec
    aemt:      0.0070,    // ~143 sec
    paramedic: 0.0110,    // ~91 sec
    ccp:       0.0140,    // ~71 sec
    phrn:      0.0140
  },
  // Cap on how much rate a single patient can receive (avoids 10-provider
  // pile-on degenerate cases). 0 = no cap.
  personnelStabilizationMaxRate: 0.05,

  // ---------------------------------------------------------------------------
  // PERSONNEL NAME POOLS  (Phase 5B)
  // ---------------------------------------------------------------------------
  // Used to auto-generate names for auto-staffed and batch-hired personnel.
  // Players can rename any responder at any time.
  // ---------------------------------------------------------------------------
  firstNames: [
    'James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles',
    'Christopher','Daniel','Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Joshua',
    'Mary','Patricia','Jennifer','Linda','Elizabeth','Barbara','Susan','Jessica','Sarah','Karen',
    'Nancy','Lisa','Margaret','Betty','Sandra','Ashley','Kimberly','Emily','Donna','Michelle',
    'Kevin','Brian','Edward','Ronald','Timothy','Jason','Jeffrey','Ryan','Jacob','Gary'
  ],
  lastNames: [
    'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
    'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
    'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
    'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
    'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts'
  ],

  // ---------------------------------------------------------------------------
  // SERVICE TAG LOOKUP
  // Maps each service category to the unit tags that count as that coverage type.
  // Used by the ESN assignment UI to determine which stations can cover which type.
  // ---------------------------------------------------------------------------
  serviceTags: {
    fire:   ['engine','tanker','ladder','rescue','brush'],
    ems:    ['als','bls','transport','air_als'],
    police: ['patrol','supervisor','k9','transport_prisoner']
  },

  // ---------------------------------------------------------------------------
  // INCIDENT SPAWN SETTINGS
  // ---------------------------------------------------------------------------
  spawn: {
    // Tuned for ~1 call every 5 minutes on average (4–6 min spread).
    intervalMinMs:  240000,
    intervalMaxMs:  360000,
    maxActiveIncidents: 8,
    defaultRadiusKm: 8,

    snapToRoad:         true,
    snapToRoadRadiusM:  500,

    majorHighways: ['motorway','trunk','primary','secondary'],
    minorHighways: ['tertiary','residential','unclassified','service'],
    majorRoadWeight:    4,
    intersectionWeight: 3,
    osmCacheTTLMs: 3600000
  },

  // ---------------------------------------------------------------------------
  // UI DEFAULTS
  // ---------------------------------------------------------------------------
  ui: {
    avlLabelColors: {
      enroute:      '#22c55e',
      on_scene:     '#3b82f6',
      returning:    '#fbbf24',
      transporting: '#f97316',   // orange — transporting patient or prisoner
      offloading:   '#a855f7',   // purple — at facility, offloading
    },
    avlLabelStyle: {
      borderColor: '#000000',
      textColor:   '#ffffff',
      fontSize:    9,
    }
  },

  // ---------------------------------------------------------------------------
  // TEST / SEED STATIONS (remove or replace these as you build your own)
  // ---------------------------------------------------------------------------
  /* seedStations: [
    {
      name:    'TEST — Harford Fire Co.',
      type:    'fire',
      lat:     41.7876,
      lng:    -75.6734,
      units:   [{ typeKey: 'engine', name: 'E-51' }, { typeKey: 'tanker', name: 'T-51' }]
    },
    {
      name:    'TEST — Clifford Twp EMS',
      type:    'ems',
      lat:     41.7650,
      lng:    -75.6520,
      units:   [{ typeKey: 'als_ambulance', name: 'M-52' }]
    },
    {
      name:    'TEST — Susquehanna Co. Sheriff',
      type:    'police',
      lat:     41.8200,
      lng:    -75.5600,
      units:   [{ typeKey: 'patrol', name: 'SC-1' }, { typeKey: 'patrol', name: 'SC-2' }]
    }
  ] */

}; // end BAM_CONFIG
