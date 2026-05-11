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
      fire:   15000,
      ems:    12000,
      police: 10000
    },
    // Upgrade costs defined per upgrade in UPGRADES section below
  },

  // ---------------------------------------------------------------------------
  // UNIT TYPE DEFINITIONS
  // ---------------------------------------------------------------------------
  // "tags" is the backend capability list. A mission requiring "engine" will
  // accept ANY unit that has "engine" in its tags.
  // "cost" = purchase price. "personnel" = default crew size.
  // ---------------------------------------------------------------------------
  unitTypes: {
    // ── FIRE ──────────────────────────────────────────────────────────────────
    engine: {
      label:      'Engine',
      tags:       ['engine'],
      stationType:'fire',
      cost:       8000,
      personnel:  4,
      color:      '#e05c1a',
      icon:       '🚒'
    },
    pumper_tanker: {
      label:      'Pumper/Tanker',
      tags:       ['engine','tanker'],   // counts as BOTH
      stationType:'fire',
      cost:       14000,
      personnel:  3,
      color:      '#e05c1a',
      icon:       '🚒'
    },
    tanker: {
      label:      'Tanker',
      tags:       ['tanker'],
      stationType:'fire',
      cost:       10000,
      personnel:  2,
      color:      '#c94800',
      icon:       '🚒'
    },
    ladder: {
      label:      'Ladder/Aerial',
      tags:       ['ladder','engine'],   // ladder also counts as engine
      stationType:'fire',
      cost:       18000,
      personnel:  4,
      color:      '#e05c1a',
      icon:       '🚒'
    },
    brush_truck: {
      label:      'Brush Truck',
      tags:       ['brush'],
      stationType:'fire',
      cost:       6000,
      personnel:  2,
      color:      '#8b4513',
      icon:       '🚒'
    },
    rescue: {
      label:      'Heavy Rescue',
      tags:       ['rescue'],
      stationType:'fire',
      cost:       16000,
      personnel:  4,
      color:      '#e05c1a',
      icon:       '🚒'
    },
    rescue_engine: {
      label:      'Rescue Engine',
      tags:       ['rescue','engine'],   // counts as BOTH
      stationType:'fire',
      cost:       20000,
      personnel:  4,
      color:      '#e05c1a',
      icon:       '🚒'
    },
    // ── EMS ───────────────────────────────────────────────────────────────────
    als_ambulance: {
      label:      'ALS Ambulance',
      tags:       ['als','bls','transport'],
      stationType:'ems',
      cost:       9000,
      personnel:  2,
      color:      '#2ea8ff',
      icon:       '🚑'
    },
    bls_ambulance: {
      label:      'BLS Ambulance',
      tags:       ['bls','transport'],
      stationType:'ems',
      cost:       7000,
      personnel:  2,
      color:      '#1a7fc4',
      icon:       '🚑'
    },
    fly_car: {
      label:      'Medic Fly Car',
      tags:       ['als'],              // ALS but NO transport
      stationType:'ems',
      cost:       5000,
      personnel:  1,
      color:      '#2ea8ff',
      icon:       '🚗'
    },
    // ── POLICE ────────────────────────────────────────────────────────────────
    patrol: {
      label:      'Patrol Unit',
      tags:       ['patrol','transport_prisoner'],
      stationType:'police',
      cost:       4000,
      personnel:  1,
      color:      '#5865f2',
      icon:       '🚔'
    },
    supervisor: {
      label:      'Supervisor',
      tags:       ['patrol','supervisor'],
      stationType:'police',
      cost:       5000,
      personnel:  1,
      color:      '#5865f2',
      icon:       '🚔'
    },
    k9: {
      label:      'K9 Unit',
      tags:       ['patrol','k9'],
      stationType:'police',
      cost:       6000,
      personnel:  1,
      color:      '#5865f2',
      icon:       '🚔'
    }
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
      requires: 'fire',   // can add to fire stations too
      unlocks:  ['patrol','supervisor'],
      cost:     8000,
      icon:     '👮'
    }
  },

  // ---------------------------------------------------------------------------
  // MISSION DEFINITIONS
  // ---------------------------------------------------------------------------
  // spawnWeight: relative probability (higher = more common)
  // requirements: array of unit TAG groups. Each group is AND logic within,
  //               OR logic between units. e.g. ['engine'] means one unit with
  //               'engine' tag. Multiple entries mean multiple units needed.
  // reward: $ on resolution
  // patientChance: 0-1 probability that this call has patients
  // patientCount: [min, max]
  // escalatesTo: mission key this can upgrade to (null = no escalation)
  // escalateChance: 0-1 chance per minute of escalating (if escalatesTo set)
  // escalateAfter: seconds before escalation becomes possible
  // ---------------------------------------------------------------------------
  missions: {

    // ── FIRE CALLS ────────────────────────────────────────────────────────────
    structure_fire: {
      label:         'Structure Fire',
      category:      'fire',
      spawnMode:     'building',   // spawn on OSM building centroid
      spawnWeight:   5,
      requirements:  [['engine'],['engine'],['tanker']],   // 2 engines + 1 tanker
      reward:        800,
      patientChance: 0.3,
      patientCount:  [0, 3],
      escalatesTo:   'working_structure_fire',
      escalateChance:0.4,
      escalateAfter: 120,
      color:         '#e05c1a'
    },
    working_structure_fire: {
      label:         'Working Structure Fire',
      category:      'fire',
      spawnMode:     'building',
      spawnWeight:   0,    // 0 = never spawns directly, only via escalation
      requirements:  [['engine'],['engine'],['engine'],['tanker'],['ladder'],['rescue']],
      reward:        2000,
      patientChance: 0.6,
      patientCount:  [1, 5],
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#ff2200'
    },
    vehicle_fire: {
      label:         'Vehicle Fire',
      category:      'fire',
      spawnMode:     'road_any',   // vehicles are on roads
      spawnWeight:   8,
      requirements:  [['engine']],
      reward:        300,
      patientChance: 0.2,
      patientCount:  [0, 2],
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#e05c1a'
    },
    brush_fire: {
      label:         'Brush / Grass Fire',
      category:      'fire',
      spawnMode:     'random',     // can be anywhere in the polygon
      spawnWeight:   10,
      requirements:  [['brush'],['engine']],
      reward:        400,
      patientChance: 0.05,
      patientCount:  [0, 1],
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
      patientCount:  [0, 2],
      escalatesTo:   null,
      escalateChance:0,
      escalateAfter: 0,
      color:         '#8b0000'
    },
    mvа_fire: {
      label:         'MVA w/ Fire',
      category:      'fire',
      spawnMode:     'road_major',  // MVAs favor major roads/intersections
      spawnWeight:   6,
      requirements:  [['engine'],['rescue']],
      reward:        600,
      patientChance: 0.8,
      patientCount:  [1, 4],
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
      requirements:  [['als'],['bls']],   // fly car + ambulance
      reward:        700,
      patientChance: 1.0,
      patientCount:  [1, 1],
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
      patientCount:  [1, 2],
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
      patientCount:  [1, 3],
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
      requirements:  [['bls'],['engine']],   // EMS + fire for extrication
      reward:        500,
      patientChance: 1.0,
      patientCount:  [1, 4],
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
      patientCount:  [1, 3],
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
      patientCount:  [0, 0],
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
      patientCount:  [0, 1],
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
      patientCount:  [0, 2],
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
      patientCount:  [0, 0],
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
      patientCount:  [1, 4],
      escalatesTo:   'mva_entrapment',
      escalateChance:0.2,
      escalateAfter: 90,
      color:         '#e05c1a'
    }
  },

  // ---------------------------------------------------------------------------
  // PATIENT INJURY TYPES
  // Determines what level of care is needed and transport destination.
  // ---------------------------------------------------------------------------
  injuryTypes: {
    // Medical
    cardiac:        { label: 'Cardiac Event',        needsALS: true,  transport: 'hospital', stabilizeTime: 120 },
    respiratory:    { label: 'Respiratory Distress',  needsALS: true,  transport: 'hospital', stabilizeTime: 90  },
    diabetic:       { label: 'Diabetic Emergency',    needsALS: false, transport: 'hospital', stabilizeTime: 60  },
    syncope:        { label: 'Syncope / Fainting',    needsALS: true, transport: 'hospital', stabilizeTime: 45  },
    // Trauma
    trauma_critical:{ label: 'Critical Trauma',       needsALS: true,  transport: 'hospital', stabilizeTime: 180 },
    trauma_moderate:{ label: 'Moderate Trauma',       needsALS: true, transport: 'hospital', stabilizeTime: 90  },
    trauma_minor:   { label: 'Minor Trauma',          needsALS: false, transport: 'hospital', stabilizeTime: 30  },
    // Behavioral / Other
    intoxicated:    { label: 'Intoxicated Person',    needsALS: false, transport: 'hospital', stabilizeTime: 20  },
    prisoner:       { label: 'Prisoner / Arrestee',   needsALS: false, transport: 'prison',   stabilizeTime: 0   }
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
    ems:    ['als','bls','transport'],
    police: ['patrol','supervisor','k9','transport_prisoner']
  },

  // ---------------------------------------------------------------------------
  // INCIDENT SPAWN SETTINGS
  // ---------------------------------------------------------------------------
  spawn: {
    intervalMinMs:  45000,   // minimum ms between spawns
    intervalMaxMs:  90000,   // maximum ms between spawns
    maxActiveIncidents: 8,   // won't spawn more than this at once
    defaultRadiusKm: 8,      // default km radius around stations to spawn calls

    // ── OSM-aware spawn settings ──────────────────────────────────────────────
    snapToRoad:         true,   // snap random-mode points to nearest driveable road
    snapToRoadRadiusM:  500,    // discard snap if road is more than this far (meters)

    // Highway categories used when fetching road nodes from Overpass
    majorHighways: ['motorway','trunk','primary','secondary'],
    minorHighways: ['tertiary','residential','unclassified','service'],
    majorRoadWeight:    4,      // weight multiplier for major roads vs. minor roads
    intersectionWeight: 3,      // additional multiplier per extra way sharing a node
    osmCacheTTLMs: 3600000      // re-fetch ESN OSM data after 1 hour (0 = never refresh)
  },

  // ---------------------------------------------------------------------------
  // UI DEFAULTS
  // ---------------------------------------------------------------------------
  // Default AVL label colors and style. Overridden at runtime by the Settings panel.
  // Colors use CSS hex strings. fontSize is in pixels.
  // ---------------------------------------------------------------------------
  ui: {
    avlLabelColors: {
      enroute:   '#22c55e',   // bright green — unit en route to call
      on_scene:  '#3b82f6',   // blue — unit on scene
      returning: '#fbbf24',   // yellow — unit returning to station
    },
    avlLabelStyle: {
      borderColor: '#000000',
      textColor:   '#ffffff',
      fontSize:    9,         // px
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
