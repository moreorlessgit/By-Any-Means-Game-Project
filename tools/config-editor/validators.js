// validators.js — cross-field checks per section.
//
// Each validator returns an array of { path, level, message } where:
//   path:    string field path inside the entry (e.g. "seats[2].requiredCert")
//   level:   'error' | 'warn'
//   message: human text shown beneath the field
//
// The app surfaces these inline near the field but never blocks save —
// the player owns the final paste.

const Validators = (() => {

  // ── unitTypes — seats sanity + cert references ───────────────────────────
  function validateUnit(entry, ctx) {
    const issues = [];
    const certKeys = new Set(Object.keys(ctx.draft.certifications || {}));

    if (!entry.label) issues.push({ path: 'label', level: 'error', message: 'Required' });
    if (entry.stationType && !['fire','ems','police','air'].includes(entry.stationType)) {
      issues.push({ path: 'stationType', level: 'warn', message: 'Unknown stationType' });
    }
    if (entry.providerLevel && !['first_aid','bls','als'].includes(entry.providerLevel)) {
      issues.push({ path: 'providerLevel', level: 'warn', message: 'Unknown providerLevel' });
    }

    const seats = Array.isArray(entry.seats) ? entry.seats : [];
    const seenIds = new Map();
    let driverCount = 0;
    seats.forEach((seat, i) => {
      const prefix = 'seats[' + i + ']';
      if (!seat.id) issues.push({ path: prefix + '.id', level: 'error', message: 'Seat id required' });
      else if (seenIds.has(seat.id)) {
        issues.push({ path: prefix + '.id', level: 'error', message: 'Duplicate seat id "' + seat.id + '" (also at seat #' + (seenIds.get(seat.id) + 1) + ')' });
      } else {
        seenIds.set(seat.id, i);
      }

      // Mutually exclusive roles
      const roles = ['isPatientSeat','isPrisonerSeat'].filter(r => seat[r]);
      const hasResponder = !!(seat.requiredCert || (seat.niceToHaveCerts && seat.niceToHaveCerts.length) || (seat.interchangeableCerts && seat.interchangeableCerts.length));
      if (roles.length > 1) {
        issues.push({ path: prefix, level: 'error', message: 'Seat cannot be both patient and prisoner' });
      }
      if (roles.length > 0 && hasResponder) {
        issues.push({ path: prefix, level: 'error', message: 'Patient/prisoner seats cannot hold responders (remove cert fields)' });
      }

      if (seat.isDriver) driverCount++;

      // Cert references
      if (seat.requiredCert && !certKeys.has(seat.requiredCert)) {
        issues.push({ path: prefix + '.requiredCert', level: 'warn',
          message: 'Cert "' + seat.requiredCert + '" not in certifications. ' + suggest(seat.requiredCert, certKeys) });
      }
      for (const c of (seat.interchangeableCerts || [])) {
        if (!certKeys.has(c)) {
          issues.push({ path: prefix + '.interchangeableCerts', level: 'warn',
            message: 'Cert "' + c + '" not in certifications. ' + suggest(c, certKeys) });
          break;
        }
      }
      for (const c of (seat.niceToHaveCerts || [])) {
        if (!certKeys.has(c)) {
          issues.push({ path: prefix + '.niceToHaveCerts', level: 'warn',
            message: 'Cert "' + c + '" not in certifications. ' + suggest(c, certKeys) });
          break;
        }
      }
    });

    if (driverCount === 0 && seats.length > 0) {
      issues.push({ path: 'seats', level: 'warn', message: 'No seat marked isDriver — dispatch may behave unexpectedly' });
    }
    if (driverCount > 1) {
      issues.push({ path: 'seats', level: 'warn', message: 'More than one isDriver seat — only the first is checked' });
    }
    return issues;
  }

  // ── upgrades — unlocks must reference known unit keys ────────────────────
  function validateUpgrade(entry, ctx) {
    const issues = [];
    const unitKeys = new Set(Object.keys(ctx.draft.unitTypes || {}));
    for (const u of (entry.unlocks || [])) {
      if (!unitKeys.has(u)) {
        issues.push({ path: 'unlocks', level: 'warn', message: 'Unknown unit "' + u + '"' });
        break;
      }
    }
    if (entry.requires && !['fire','ems','police'].includes(entry.requires)) {
      issues.push({ path: 'requires', level: 'warn', message: 'requires should be fire/ems/police' });
    }
    return issues;
  }

  // ── missions — injuryType references + requirement slot sanity ───────────
  function validateMission(entry, ctx) {
    const issues = [];
    const injuryKeys = new Set(Object.keys(ctx.draft.injuryTypes || {}));
    for (const p of (entry.patients || [])) {
      if (p.injuryType && !injuryKeys.has(p.injuryType)) {
        issues.push({ path: 'patients', level: 'warn', message: 'Unknown injuryType "' + p.injuryType + '"' });
        break;
      }
    }
    return issues;
  }

  // ── certifications — prereqs/satisfies must reference known certs ────────
  function validateCert(entry, ctx) {
    const issues = [];
    const allCerts = new Set(Object.keys(ctx.draft.certifications || {}));
    for (const p of (entry.prereqs || [])) {
      if (!allCerts.has(p)) {
        issues.push({ path: 'prereqs', level: 'warn', message: 'Unknown cert "' + p + '"' });
        break;
      }
    }
    for (const s of (entry.satisfies || [])) {
      if (!allCerts.has(s)) {
        issues.push({ path: 'satisfies', level: 'warn', message: 'Unknown cert "' + s + '"' });
        break;
      }
    }
    return issues;
  }

  // ── rankConfig (entries within fire/ems/police_*) — cert refs ────────────
  function validateRank(entry, ctx) {
    const issues = [];
    const allCerts = new Set(Object.keys(ctx.draft.certifications || {}));
    for (const p of (entry.prereqCerts || [])) {
      if (!allCerts.has(p)) {
        issues.push({ path: 'prereqCerts', level: 'warn', message: 'Unknown cert "' + p + '"' });
        break;
      }
    }
    return issues;
  }

  // ── Fuzzy suggestion — closest cert key by Levenshtein ───────────────────
  function suggest(input, keys) {
    let best = null, bestDist = 4;
    for (const k of keys) {
      const d = levenshtein(input, k);
      if (d < bestDist) { bestDist = d; best = k; }
    }
    return best ? 'Did you mean "' + best + '"?' : '';
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  return {
    validateUnit,
    validateUpgrade,
    validateMission,
    validateCert,
    validateRank,
  };

})();
