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
    cardiac_arrest: {
      label:         'Cardiac Arrest',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   4,
      requirements:  [['als'],['bls']],
      reward:        700,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'cardiac', minCount: 1, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#2ea8ff'
    },
    medical_emergency: {
      label:         'Medical Emergency',
      category:      'ems',
      spawnMode:     'random',
      spawnWeight:   15,
      requirements:  [['bls']],
      reward:        300,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'diabetic',     minCount: 0, maxCount: 1 },
        { injuryType: 'syncope',      minCount: 0, maxCount: 1 },
        { injuryType: 'respiratory',  minCount: 0, maxCount: 1 },
      ],
      chargeTiers:   null,
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
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
      category:      'ems',
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
      category:      'ems',
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
      requirements:  [['patrol'],['als']],
      reward:        250,
      patientChance: 1.0,
      patients:      [
        { injuryType: 'psych_crisis', minCount: 1, maxCount: 2 },
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
    cardiac: {
      label:            'Cardiac Event',
      needsALS:         true,
      transport:        'hospital',
      requiredDept:     'cardiac_cath',
      patientTier:      'critical',
      stabilizeTimeSec: 120,
    },
    respiratory: {
      label:            'Respiratory Distress',
      needsALS:         true,
      transport:        'hospital',
      requiredDept:     'icu',
      patientTier:      'serious',
      stabilizeTimeSec: 90,
    },
    diabetic: {
      label:            'Diabetic Emergency',
      needsALS:         false,
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
  // PERSONNEL CERTIFICATIONS
  // Used to staff units. Each unit needs personnel meeting minimums.
  // ---------------------------------------------------------------------------
  certifications: {
    ff1:      { label: 'Firefighter I',     category: 'fire'   },
    ff2:      { label: 'Firefighter II',    category: 'fire'   },
    driver:   { label: 'Driver/Operator',   category: 'fire'   },
    emt:      { label: 'EMT-Basic',         category: 'ems'    },
    aemt:     { label: 'AEMT',              category: 'ems'    },
    medic:    { label: 'Paramedic',         category: 'ems'    },
    leo:      { label: 'Police Officer',    category: 'police' },
    leo_sup:  { label: 'Police Supervisor', category: 'police' }
  },

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
    intervalMinMs:  45000,
    intervalMaxMs:  90000,
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
