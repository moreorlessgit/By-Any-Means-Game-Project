// api.js — REST client for the By Any Means backend (Phase 4A).
// Game scripts use window.api.* for all server calls; localStorage is no
// longer used for game data. The single auth-related localStorage key is
// bam_token (the JWT). Active-world/slot pointers also live in localStorage
// for UX continuity (so the player picks back up where they left off).
//
// All authenticated calls auto-attach Authorization: Bearer <token>.
// On 401 the token is cleared and the page is signalled to re-render the
// login overlay (window.onApiUnauthorized callback if set).

(function(){
  // Derive the backend origin from where the page was served so the game
  // works equally from localhost AND from a LAN IP on another device.
  // The backend listens on port 3001 by default; if the player has changed
  // that, also set window.BAM_API_BASE before this script loads to override.
  const API_BASE = (() => {
    if(typeof window !== 'undefined' && window.BAM_API_BASE) return window.BAM_API_BASE;
    const host = (typeof location !== 'undefined' && location.hostname) || 'localhost';
    return 'http://' + host + ':3001/api';
  })();

  // localStorage keys still in use under Phase 4A.
  const KEYS = {
    token:             'bam_token',
    activeWorldId:     'bam_active_world_id',
    activeSlotName:    'bam_active_slot_name',
    migrationHandled:  'bam_migration_handled',  // either "imported" or "dismissed"
  };

  // ── token storage ─────────────────────────────────────────────────────────
  function getToken(){ return localStorage.getItem(KEYS.token); }
  function setToken(t){
    if(t) localStorage.setItem(KEYS.token, t);
    else  localStorage.removeItem(KEYS.token);
  }
  function clearToken(){ localStorage.removeItem(KEYS.token); }

  // ── core fetch wrapper ────────────────────────────────────────────────────
  // Adds the Authorization header when a token is present, parses JSON,
  // raises an Error on non-2xx with the server's error message attached.
  async function call(method, path, body){
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if(token) headers['Authorization'] = 'Bearer ' + token;

    let resp;
    try {
      resp = await fetch(API_BASE + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch(networkErr){
      const e = new Error('Network error — is the server running?');
      e.cause = networkErr;
      throw e;
    }

    // 401 is special: token is bad/expired, drop it and let the page rerender.
    if(resp.status === 401){
      clearToken();
      if(typeof window.onApiUnauthorized === 'function') window.onApiUnauthorized();
      const e = new Error('Authentication required');
      e.status = 401;
      throw e;
    }

    // 204 No Content has no body to parse.
    if(resp.status === 204) return null;

    let json = null;
    try { json = await resp.json(); } catch(_){ /* empty body */ }

    if(!resp.ok){
      // The server returns either { error: "string" } or { error: { field: [msgs] } }.
      let msg = 'Request failed';
      if(json && json.error){
        msg = typeof json.error === 'string'
          ? json.error
          : Object.values(json.error).flat().join(', ');
      }
      const e = new Error(msg);
      e.status = resp.status;
      e.body   = json;
      throw e;
    }

    return json;
  }

  // ── public API surface ────────────────────────────────────────────────────
  window.api = {
    KEYS,
    getToken,
    setToken,
    clearToken,
    isAuthed: () => !!getToken(),

    auth: {
      // Register: returns { token, user }. Stores the token automatically.
      async register(username, password){
        const r = await call('POST', '/auth/register', { username, password });
        setToken(r.token);
        return r;
      },
      // Login: returns { token, user }. Stores the token automatically.
      async login(username, password){
        const r = await call('POST', '/auth/login', { username, password });
        setToken(r.token);
        return r;
      },
      // Verify token + fetch current user. Throws 401 on bad/expired token.
      me(){ return call('GET', '/auth/me'); },
      // Pure client-side: drop the token. No server-side session to revoke.
      logout(){ clearToken(); },
    },

    privateWorlds: {
      list(){               return call('GET',    '/private-worlds'); },
      create(name){         return call('POST',   '/private-worlds', { name }); },
      delete(id){           return call('DELETE', '/private-worlds/' + encodeURIComponent(id)); },
      saves: {
        list(worldId){      return call('GET',    '/private-worlds/' + encodeURIComponent(worldId) + '/saves'); },
        get(worldId, slot){ return call('GET',    '/private-worlds/' + encodeURIComponent(worldId) + '/saves/' + encodeURIComponent(slot)); },
        // Upserts on (world_id, slot_name). Returns { slot_name, saved_at }.
        put(worldId, slot_name, state_json){
          return call('POST', '/private-worlds/' + encodeURIComponent(worldId) + '/saves',
                      { slot_name, state_json });
        },
        delete(worldId, slot){ return call('DELETE', '/private-worlds/' + encodeURIComponent(worldId) + '/saves/' + encodeURIComponent(slot)); },
      },
    },

    settings: {
      get(){                       return call('GET', '/settings'); },
      put(settings_json){          return call('PUT', '/settings', { settings_json }); },
    },

    health(){ return call('GET', '/health'); },
  };

  // ── debounced settings sync ───────────────────────────────────────────────
  // Exposed separately so the game code can fire-and-forget on every change
  // (e.g., color picker drag). Coalesces rapid changes into one PUT.
  let _settingsTimer = null;
  let _settingsPending = null;
  window.api.settings.putDebounced = function(settings_json, delayMs = 500){
    _settingsPending = settings_json;
    if(_settingsTimer) clearTimeout(_settingsTimer);
    _settingsTimer = setTimeout(() => {
      const payload = _settingsPending;
      _settingsPending = null;
      _settingsTimer = null;
      window.api.settings.put(payload).catch(err => {
        console.error('Settings sync failed:', err.message);
      });
    }, delayMs);
  };

  // ── active world / slot pointer helpers ───────────────────────────────────
  // The frontend remembers the last (world, slot) the player was in so that
  // on next login it can offer "Continue" or auto-load. Server-side has no
  // notion of "active" — this is purely a UX pointer.
  window.api.activePointer = {
    get(){
      const id   = Number(localStorage.getItem(KEYS.activeWorldId)) || null;
      const slot = localStorage.getItem(KEYS.activeSlotName)         || null;
      return { worldId: id && Number.isFinite(id) ? id : null, slotName: slot };
    },
    set(worldId, slotName){
      if(worldId)  localStorage.setItem(KEYS.activeWorldId,  String(worldId));
      else         localStorage.removeItem(KEYS.activeWorldId);
      if(slotName) localStorage.setItem(KEYS.activeSlotName, slotName);
      else         localStorage.removeItem(KEYS.activeSlotName);
    },
    clear(){
      localStorage.removeItem(KEYS.activeWorldId);
      localStorage.removeItem(KEYS.activeSlotName);
    },
  };
})();
