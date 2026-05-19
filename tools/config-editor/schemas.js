// schemas.js — every editable config section is one entry here.
//
// To add a new section to the editor: write a schema entry in SECTIONS below.
// The renderer + serializer handle the rest.
//
// Schema shape:
//   {
//     label:        'Display name on tab'
//     kind:         'keyedDict' | 'singleObject' | 'objectArray' | 'nestedKeyedArrays'
//     configPath:   'unitTypes' or 'ui.avlLabelColors' (dot path into BAM_CONFIG)
//     entryName:    'unit'            // singular noun for buttons
//     compact:      false             // emit one-line entries (cert style)
//     fields:       [...field defs]
//     validate:     fn(entry, ctx) => [{ path, level, message }]
//     groupBy:      fn(entry, key) => 'group label'   // optional, for left list
//     summary:      fn(entry, key)  => 'short label'  // optional list-row text
//   }
//
// Field shape:
//   {
//     key:       'fieldName'
//     label:     'Display label'   (default: key)
//     type:      'string' | 'number' | 'boolean' | 'select' | 'multiSelect' |
//                'color' | 'emoji' | 'stringArray' | 'arrayOf' | 'object' |
//                'json' | 'requirementSlots' | 'keyedDict'
//     required:  true              // marks visually; never blocks save
//     optional:  true              // adds (none) to selects, omits from output if undefined
//     nullable:  true              // allow explicit null
//     default:   value | fn        // used when adding a new entry
//     options:   array | (ctx) => array
//     min, max, step               // numeric bounds
//     itemSchema: schema           // for arrayOf / object types
//     valueField: { type, ... }    // for keyedDict
//     knownKeys:  [...]            // for keyedDict — pre-existing keys to render
//     when:      (parent, ctx) => boolean   // conditional visibility
//     omitWhenEmpty: true          // skip null/empty/'' on output (keeps file tight)
//   }

const Schemas = (() => {

  // ── Shared dynamic option providers ──────────────────────────────────────
  const certOptions = ctx => Object.keys(ctx.draft.certifications || {})
    .sort()
    .map(k => ({ value: k, label: k + ' — ' + (ctx.draft.certifications[k]?.label || '') }));

  const unitTagOptions = ctx => {
    const tags = new Set();
    for (const u of Object.values(ctx.draft.unitTypes || {})) {
      for (const t of (u.tags || [])) tags.add(t);
    }
    return Array.from(tags).sort();
  };

  const unitKeyOptions = ctx => Object.keys(ctx.draft.unitTypes || {}).sort();

  const stationTypeOptions = ['fire','ems','police','air'];
  const providerLevelOptions = ['first_aid','bls','als'];
  const spawnModeOptions = ['random','building','road_any','road_major','road_minor'];
  const missionCategoryOptions = ['fire','ems','police'];
  const certCategoryOptions = ['fire','ems','police','shared'];
  const stationStaffingOptions = ['career','combination','volunteer'];
  const chargeTierKeyOptions = ctx => Object.keys(ctx.draft.chargeTiers || {}).sort();
  const injuryTypeOptions = ctx => Object.keys(ctx.draft.injuryTypes || {}).sort();
  const hospitalDeptOptions = ctx => Object.keys(ctx.draft.hospitalDepartments || {}).sort();
  const patientTierOptions = ['minor','serious','critical'];
  const transportTargetOptions = ['hospital','prison','jail',null];

  // ── Nested sub-schemas (referenced from outer fields) ────────────────────

  const SEAT_SCHEMA = {
    label: 'seat',
    summary: (s) => {
      const role = s.isPatientSeat ? '(stretcher)'
                : s.isPrisonerSeat ? '(prisoner)'
                : s.isDriver       ? '(driver)'
                : '';
      return [s.id, role, s.requiredCert ? '→ ' + s.requiredCert : ''].filter(Boolean).join(' ');
    },
    fields: [
      { key: 'id',       type: 'string',  required: true,  hint: 'unique within this unit' },
      { key: 'label',    type: 'string',  required: true },
      { key: 'isDriver', type: 'boolean', omitWhenEmpty: true,
        when: (s) => !s.isPatientSeat && !s.isPrisonerSeat },
      { key: 'isPatientSeat',  type: 'boolean', omitWhenEmpty: true,
        when: (s) => !s.isPrisonerSeat && !s.requiredCert && !s.isDriver },
      { key: 'isPrisonerSeat', type: 'boolean', omitWhenEmpty: true,
        when: (s) => !s.isPatientSeat && !s.requiredCert && !s.isDriver },
      { key: 'requiredCert', type: 'select', options: certOptions, optional: true,
        when: (s) => !s.isPatientSeat && !s.isPrisonerSeat,
        omitWhenEmpty: true },
      { key: 'interchangeableCerts', type: 'multiSelect', options: certOptions,
        when: (s) => !s.isPatientSeat && !s.isPrisonerSeat,
        omitWhenEmpty: true },
      { key: 'niceToHaveCerts', type: 'multiSelect', options: certOptions,
        when: (s) => !s.isPatientSeat && !s.isPrisonerSeat,
        omitWhenEmpty: true },
    ],
  };

  const PATIENT_ENTRY_SCHEMA = {
    label: 'patient',
    summary: (p) => p.injuryType + ' [' + p.minCount + '-' + p.maxCount + ']',
    compact: true,
    fields: [
      { key: 'injuryType', type: 'select', options: injuryTypeOptions, required: true },
      { key: 'minCount',   type: 'number', min: 0, default: 0 },
      { key: 'maxCount',   type: 'number', min: 0, default: 1 },
    ],
  };

  const CHARGE_TIER_WEIGHT_SCHEMA = {
    label: 'tier',
    summary: (t) => t.tier + ' (' + t.weight + ')',
    compact: true,
    fields: [
      { key: 'tier',   type: 'select', options: chargeTierKeyOptions, required: true },
      { key: 'weight', type: 'number', min: 0, default: 1 },
    ],
  };

  const RANK_ENTRY_SCHEMA = {
    label: 'rank',
    summary: (r) => r.key + ' — ' + r.label,
    compact: true,
    fields: [
      { key: 'key',              type: 'string',  required: true },
      { key: 'label',            type: 'string',  required: true },
      { key: 'service',          type: 'select',  options: ['fire','ems','police_local','police_county','police_state'] },
      { key: 'prereqCerts',      type: 'multiSelect', options: certOptions },
      { key: 'salaryMultiplier', type: 'number',  step: 0.05, default: 1.0 },
    ],
    validate: (entry, ctx) => Validators.validateRank(entry, ctx),
  };

  // ── SECTIONS ──────────────────────────────────────────────────────────────

  const SECTIONS = {

    // ── Unit Types — primary editor target ──────────────────────────────────
    unitTypes: {
      label: 'Unit Types',
      kind: 'keyedDict',
      configPath: 'unitTypes',
      entryName: 'unit',
      groupBy: (e) => ({ fire:'Fire', ems:'EMS', police:'Police', air:'Air' }[e.stationType] || 'Other'),
      summary: (e, k) => (e.icon || '') + ' ' + (e.label || k),
      fields: [
        { key: 'label',          type: 'string',  required: true },
        { key: 'tags',           type: 'multiSelect', options: unitTagOptions, required: true,
          hint: 'Free text — type a new tag and press Enter.' },
        { key: 'stationType',    type: 'select',  options: stationTypeOptions, required: true },
        { key: 'cost',           type: 'number',  min: 0, required: true },
        { key: 'personnel',      type: 'number',  min: 1, required: true },
        { key: 'color',          type: 'color',   required: true },
        { key: 'icon',           type: 'emoji',   required: true },
        { key: 'providerLevel',  type: 'select',  options: providerLevelOptions, nullable: true,
          hint: 'null = no medical capability' },
        { key: 'straightLine',   type: 'boolean', optional: true, omitWhenEmpty: true,
          hint: 'aircraft only — bypasses OSRM routing' },
        { key: 'speedMph',       type: 'number',  optional: true, omitWhenEmpty: true,
          hint: 'aircraft only — for ETA/animation' },
        { key: 'autoFillOptionalSeats', type: 'boolean', default: true,
          hint: 'true = fire trucks (every seat); false = ambulances/patrol (required only)' },
        { key: 'seats',          type: 'arrayOf', itemSchema: SEAT_SCHEMA, required: true },
      ],
      validate: (entry, ctx) => Validators.validateUnit(entry, ctx),
    },

    // ── Certifications ──────────────────────────────────────────────────────
    certifications: {
      label: 'Certifications',
      kind: 'keyedDict',
      configPath: 'certifications',
      entryName: 'cert',
      compact: true,
      groupBy: (e) => ({ fire:'Fire', ems:'EMS', police:'Police', shared:'Shared' }[e.category] || 'Other'),
      summary: (e, k) => e.label || k,
      fields: [
        { key: 'label',     type: 'string',  required: true },
        { key: 'category',  type: 'select',  options: certCategoryOptions, required: true },
        { key: 'cost',      type: 'number',  min: 0, required: true },
        { key: 'prereqs',   type: 'multiSelect', options: certOptions, default: [] },
        { key: 'satisfies', type: 'multiSelect', options: certOptions, default: [] },
      ],
      validate: (entry, ctx) => Validators.validateCert(entry, ctx),
    },

    // ── Upgrades ────────────────────────────────────────────────────────────
    upgrades: {
      label: 'Upgrades',
      kind: 'keyedDict',
      configPath: 'upgrades',
      entryName: 'upgrade',
      summary: (e, k) => (e.icon || '') + ' ' + (e.label || k),
      fields: [
        { key: 'label',    type: 'string',  required: true },
        { key: 'desc',     type: 'string' },
        { key: 'requires', type: 'select',  options: ['fire','ems','police'] },
        { key: 'unlocks',  type: 'multiSelect', options: unitKeyOptions, default: [] },
        { key: 'cost',     type: 'number',  min: 0 },
        { key: 'icon',     type: 'emoji' },
      ],
      validate: (entry, ctx) => Validators.validateUpgrade(entry, ctx),
    },

    // ── Missions ────────────────────────────────────────────────────────────
    missions: {
      label: 'Missions',
      kind: 'keyedDict',
      configPath: 'missions',
      entryName: 'mission',
      groupBy: (e) => ({ fire:'Fire', ems:'EMS', police:'Police' }[e.category] || 'Other'),
      summary: (e, k) => e.label || k,
      fields: [
        { key: 'label',          type: 'string',  required: true },
        { key: 'category',       type: 'select',  options: missionCategoryOptions },
        { key: 'spawnMode',      type: 'select',  options: spawnModeOptions },
        { key: 'spawnWeight',    type: 'number',  min: 0, default: 1, hint: '0 = escalation-only, never spawns naturally' },
        { key: 'requirements',   type: 'requirementSlots',
          // requirementSlots widget needs to know what tags are available
          tagOptions: ctx => unitTagOptions(ctx) },
        { key: 'reward',         type: 'number',  min: 0 },
        { key: 'patientChance',  type: 'number',  min: 0, max: 1, step: 0.05 },
        { key: 'patients',       type: 'arrayOf', itemSchema: PATIENT_ENTRY_SCHEMA },
        { key: 'chargeTiers',    type: 'arrayOf', itemSchema: CHARGE_TIER_WEIGHT_SCHEMA, nullable: true,
          hint: 'null for non-criminal calls' },
        { key: 'escalatesTo',    type: 'select',  options: ctx => Object.keys(ctx.draft.missions || {}).sort(), nullable: true },
        { key: 'escalateChance', type: 'number',  min: 0, max: 1, step: 0.05 },
        { key: 'escalateAfter',  type: 'number',  min: 0, hint: 'seconds before escalation eligible' },
        { key: 'color',          type: 'color' },
      ],
      validate: (entry, ctx) => Validators.validateMission(entry, ctx),
    },

    // ── Injury Types ────────────────────────────────────────────────────────
    injuryTypes: {
      label: 'Injuries',
      kind: 'keyedDict',
      configPath: 'injuryTypes',
      entryName: 'injury',
      compact: true,
      summary: (e, k) => e.label || k,
      fields: [
        { key: 'label',            type: 'string',  required: true },
        { key: 'needsALS',         type: 'boolean' },
        { key: 'transport',        type: 'select',  options: ['hospital','prison','jail'], nullable: true },
        { key: 'requiredDept',     type: 'select',  options: hospitalDeptOptions, nullable: true },
        { key: 'patientTier',      type: 'select',  options: patientTierOptions },
        { key: 'stabilizeTimeSec', type: 'number',  min: 0 },
      ],
    },

    // ── Hospital Departments ────────────────────────────────────────────────
    hospitalDepartments: {
      label: 'Hospital Depts',
      kind: 'keyedDict',
      configPath: 'hospitalDepartments',
      entryName: 'department',
      summary: (e, k) => e.label || k,
      fields: [
        { key: 'label',               type: 'string', required: true },
        { key: 'baseBeds',            type: 'number', min: 0 },
        { key: 'cost',                type: 'number', min: 0 },
        { key: 'costPerBed',          type: 'number', min: 0 },
        { key: 'stageDurationMinSec', type: 'number', min: 0 },
        { key: 'stageDurationMaxSec', type: 'number', min: 0 },
      ],
    },

    // ── Charge Tiers ────────────────────────────────────────────────────────
    chargeTiers: {
      label: 'Charges',
      kind: 'keyedDict',
      configPath: 'chargeTiers',
      entryName: 'charge tier',
      compact: true,
      summary: (e, k) => e.label || k,
      fields: [
        { key: 'label',           type: 'string', required: true },
        { key: 'fine',            type: 'number', min: 0 },
        { key: 'jailTimeMinHours',type: 'number', min: 0 },
        { key: 'jailTimeMaxHours',type: 'number', min: 0 },
      ],
    },

    // ── Station Type Defs ───────────────────────────────────────────────────
    stationTypeDefs: {
      label: 'Station Types',
      kind: 'keyedDict',
      configPath: 'stationTypeDefs',
      entryName: 'station type',
      compact: true,
      summary: (e, k) => (e.icon || '') + ' ' + (e.label || k),
      fields: [
        { key: 'label',        type: 'string', required: true },
        { key: 'icon',         type: 'emoji' },
        { key: 'unitCategory', type: 'select', options: stationTypeOptions, required: true },
      ],
    },

    // ── Ranks ───────────────────────────────────────────────────────────────
    // rankConfig is a dict of arrays — render as keyedDict where the value is
    // an array-of-objects. We use a custom shape: each top-level key (fire,
    // ems, police_local…) is one "entry" whose body is an array of rank
    // objects.
    rankConfig: {
      label: 'Ranks',
      kind: 'keyedDict',
      configPath: 'rankConfig',
      entryName: 'rank service',
      summary: (entry, k) => k + ' (' + (Array.isArray(entry) ? entry.length : 0) + ' ranks)',
      // Each entry IS an array, so we tunnel it through a single `ranks` field
      // that the editor unpacks. Then on output we emit the array directly.
      // (Implemented as a custom unwrap below.)
      unwrap: (entry) => Array.isArray(entry) ? { ranks: entry } : entry,
      wrap:   (entry) => Array.isArray(entry.ranks) ? entry.ranks : [],
      fields: [
        { key: 'ranks', type: 'arrayOf', itemSchema: RANK_ENTRY_SCHEMA },
      ],
    },

    // ── Shift Templates (objectArray) ───────────────────────────────────────
    shiftTemplates: {
      label: 'Shifts',
      kind: 'objectArray',
      configPath: 'shiftTemplates',
      keyField: 'key',
      entryName: 'shift template',
      summary: (e) => e.key + ' — ' + e.label,
      fields: [
        { key: 'key',       type: 'string',  required: true },
        { key: 'label',     type: 'string',  required: true },
        { key: 'cycleDays', type: 'number',  min: 1, default: 1 },
        // onPattern is a non-trivial 2D array of [start,end] hour pairs.
        // For v1, expose it as JSON — covers the use case without bespoke UI.
        { key: 'onPattern', type: 'json',
          hint: 'Array of per-day on-hour windows: [ [[start,end], ...], [], ... ]' },
      ],
    },

    // ── Service Tags (singleObject of string-arrays) ────────────────────────
    serviceTags: {
      label: 'Service Tags',
      kind: 'singleObject',
      configPath: 'serviceTags',
      fields: [
        { key: 'fire',   type: 'stringArray', placeholder: '+ tag' },
        { key: 'ems',    type: 'stringArray', placeholder: '+ tag' },
        { key: 'police', type: 'stringArray', placeholder: '+ tag' },
      ],
    },

    // ── Economy ─────────────────────────────────────────────────────────────
    economy: {
      label: 'Economy',
      kind: 'singleObject',
      configPath: 'economy',
      fields: [
        { key: 'startingMoney', type: 'number', min: 0 },
        { key: 'stationCost',   type: 'keyedDict',
          knownKeys: ['fire','ems','police','helipad_building','airport_building'],
          valueField: { type: 'number', min: 0 } },
      ],
    },

    // ── Spawn ───────────────────────────────────────────────────────────────
    spawn: {
      label: 'Spawn',
      kind: 'singleObject',
      configPath: 'spawn',
      fields: [
        { key: 'intervalMinMs',     type: 'number', min: 0 },
        { key: 'intervalMaxMs',     type: 'number', min: 0 },
        { key: 'maxActiveIncidents',type: 'number', min: 1 },
        { key: 'defaultRadiusKm',   type: 'number', min: 0, step: 0.1 },
        { key: 'snapToRoad',        type: 'boolean' },
        { key: 'snapToRoadRadiusM', type: 'number', min: 0 },
        { key: 'majorHighways',     type: 'stringArray' },
        { key: 'minorHighways',     type: 'stringArray' },
        { key: 'majorRoadWeight',   type: 'number', min: 0 },
        { key: 'intersectionWeight',type: 'number', min: 0 },
        { key: 'osmCacheTTLMs',     type: 'number', min: 0 },
      ],
    },

    // ── UI defaults ─────────────────────────────────────────────────────────
    ui: {
      label: 'UI',
      kind: 'singleObject',
      configPath: 'ui',
      fields: [
        { key: 'avlLabelColors', type: 'object', itemSchema: {
          fields: [
            { key: 'enroute',      type: 'color' },
            { key: 'on_scene',     type: 'color' },
            { key: 'returning',    type: 'color' },
            { key: 'transporting', type: 'color' },
            { key: 'offloading',   type: 'color' },
          ]
        }},
        { key: 'avlLabelStyle', type: 'object', itemSchema: {
          fields: [
            { key: 'borderColor', type: 'color' },
            { key: 'textColor',   type: 'color' },
            { key: 'fontSize',    type: 'number', min: 6, max: 24 },
          ]
        }},
      ],
    },

    // ── Map ─────────────────────────────────────────────────────────────────
    map: {
      label: 'Map',
      kind: 'singleObject',
      configPath: 'map',
      fields: [
        { key: 'startLat',  type: 'number', step: 0.0001 },
        { key: 'startLng',  type: 'number', step: 0.0001 },
        { key: 'startZoom', type: 'number', min: 0, max: 22 },
        { key: 'bounds', type: 'object', itemSchema: {
          fields: [
            { key: 'minLat', type: 'number', step: 0.0001 },
            { key: 'maxLat', type: 'number', step: 0.0001 },
            { key: 'minLng', type: 'number', step: 0.0001 },
            { key: 'maxLng', type: 'number', step: 0.0001 },
          ]
        }},
      ],
    },

    // ── Tuning — all loose top-level scalars in one place ───────────────────
    tuning: {
      label: 'Tuning',
      kind: 'syntheticScalars',     // app.js handles this specially
      configPath: null,             // not a real path
      summary: (entry, k) => k,
      // Each entry below = one top-level scalar in BAM_CONFIG.
      // `path` is the BAM_CONFIG key; `field` is its widget definition.
      scalars: [
        { path: 'crewScorePreferredHit',          field: { type: 'number', label: 'crewScorePreferredHit' },
          hint: 'points for satisfying the hard cert gate' },
        { path: 'crewScoreNiceToHaveHit',         field: { type: 'number', label: 'crewScoreNiceToHaveHit' },
          hint: 'points per niceToHave cert (stacks)' },
        { path: 'crewScoreAtStation',             field: { type: 'number', label: 'crewScoreAtStation' },
          hint: 'bonus for career on-duty at the station' },
        { path: 'crewScoreVolEtaPerMin',          field: { type: 'number', label: 'crewScoreVolEtaPerMin' },
          hint: 'penalty per minute of volunteer assembly delay' },
        { path: 'volunteerAssemblyMeanGameMin',   field: { type: 'number', label: 'volunteerAssemblyMeanGameMin' } },
        { path: 'volunteerAssemblySpreadGameMin', field: { type: 'number', label: 'volunteerAssemblySpreadGameMin' } },
        { path: 'volunteerOutOfAreaMultiplier',   field: { type: 'number', label: 'volunteerOutOfAreaMultiplier', step: 0.1 } },
        { path: 'volunteerAssemblyFailGameMin',   field: { type: 'number', label: 'volunteerAssemblyFailGameMin' } },
        { path: 'volunteerFailedAssemblyLingerGameMin', field: { type: 'number', label: 'volunteerFailedAssemblyLingerGameMin' } },
        { path: 'volunteerAtStationHourlyChance', field: { type: 'number', label: 'volunteerAtStationHourlyChance', step: 0.01 } },
        { path: 'volunteerAvailableHomeChance',   field: { type: 'number', label: 'volunteerAvailableHomeChance', step: 0.05 } },
        { path: 'volunteerAvailableRoamingChance',field: { type: 'number', label: 'volunteerAvailableRoamingChance', step: 0.01 } },
        { path: 'volunteerPostCallReleaseGameSec',field: { type: 'number', label: 'volunteerPostCallReleaseGameSec' } },
        { path: 'volunteerReturnHomeGameSec',     field: { type: 'number', label: 'volunteerReturnHomeGameSec' } },
        { path: 'personnelHireCostBase',          field: { type: 'number', label: 'personnelHireCostBase' } },
        { path: 'salaryBaseAnnual',               field: { type: 'number', label: 'salaryBaseAnnual' } },
        { path: 'trainingCostMultiplier',         field: { type: 'number', label: 'trainingCostMultiplier', step: 0.05 } },
        { path: 'personnelStabilizationMaxRate',  field: { type: 'number', label: 'personnelStabilizationMaxRate', step: 0.005 } },
        { path: 'ambulanceDriverOnlyDefault',     field: { type: 'boolean', label: 'ambulanceDriverOnlyDefault' } },
        { path: 'overpassEndpoint',               field: { type: 'string', label: 'overpassEndpoint' } },
        { path: 'overpassTimeoutMs',              field: { type: 'number', label: 'overpassTimeoutMs' } },
        { path: 'osmCacheTtlMs',                  field: { type: 'number', label: 'osmCacheTtlMs' } },
        { path: 'osmRebuildCooldownSec',          field: { type: 'number', label: 'osmRebuildCooldownSec' } },
        { path: 'stationStaffingTypes',           field: { type: 'stringArray', label: 'stationStaffingTypes' } },
        { path: 'firstNames',                     field: { type: 'stringArray', label: 'firstNames' } },
        { path: 'lastNames',                      field: { type: 'stringArray', label: 'lastNames' } },
        { path: 'directToSceneAllowedRoles',      field: { type: 'multiSelect', label: 'directToSceneAllowedRoles', options: certOptions } },
        { path: 'spanOfControlOfficerCerts',      field: { type: 'multiSelect', label: 'spanOfControlOfficerCerts', options: certOptions } },
        { path: 'personnelStabilizationRates',    field: { type: 'json',  label: 'personnelStabilizationRates' },
          hint: 'per-cert stabilization rates per game-second' },
        { path: 'spanOfControlTiers',             field: { type: 'json',  label: 'spanOfControlTiers' },
          hint: 'tiered tooltips for officer-to-responder ratio' },
        { path: 'volunteerAssemblyMaxGameMin',    field: { type: 'number', label: 'volunteerAssemblyMaxGameMin' },
          hint: 'legacy alias for volunteerAssemblyFailGameMin' },
        { path: 'volunteerStationLingerGameMin',  field: { type: 'number', label: 'volunteerStationLingerGameMin' },
          hint: 'legacy alias for volunteerFailedAssemblyLingerGameMin' },
      ],
    },

  };

  return { SECTIONS };

})();
