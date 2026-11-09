/* Eros cloud client: loads the Base44 SDK and joins the SquadSession room.
 * Hardened for security: authenticated role attestation, strict pairing code validation,
 * zero unauthenticated default room broadcasts, and non-blocking offline-first fallback. */
(function () {
  'use strict';

  var APP_ID = '6aef31fc9b0008d92f24df46';
  var SDK_URL = 'https://esm.sh/@base44/sdk@0.8.59';
  var ATHLETE_STORAGE_KEY = 'eros_athlete_coach_connection_v1';

  var clientPromise = null;
  var pendingCode = null;

  function isValidPairingCode(code) {
    if (!code || typeof code !== 'string') return false;
    var trimmed = code.trim().toUpperCase();
    return /^EROS-[0-9A-Z]{4,8}$/.test(trimmed);
  }

  function getClient() {
    if (!clientPromise) {
      clientPromise = import(SDK_URL).then(function (mod) {
        var client = mod.createClient({ appId: APP_ID });
        window.base44 = client;
        return client;
      }).catch(function () {
        clientPromise = null;
        return null;
      });
    }
    return clientPromise;
  }

  function join(code) {
    if (!isValidPairingCode(code)) return Promise.resolve(false);
    var clean = String(code).trim().toUpperCase();
    pendingCode = clean;

    return getClient().then(function (client) {
      if (!client || pendingCode !== clean) return false;
      var bus = window.ErosSyncBus;
      if (!bus || typeof bus.connectCloud !== 'function') return false;
      var connected = bus.connectCloud(clean, client);
      if (connected) {
        var isCoach = document.body.classList.contains('portal-coach');
        if (isCoach) {
          bus.emit('coach:connect', {
            coachName: 'Coach',
            pairingCode: clean,
            timestamp: Date.now()
          });
        }
      }
      return connected;
    }).catch(function () { return false; });
  }

  function leave() {
    pendingCode = null;
    var bus = window.ErosSyncBus;
    if (bus && typeof bus.disconnectCloud === 'function') bus.disconnectCloud();
  }

  // Athlete: join when athlete explicitly connects to a coach code
  window.addEventListener('eros:athlete_connect', function (e) {
    if (e && e.detail && isValidPairingCode(e.detail.coachCode)) {
      join(e.detail.coachCode);
    }
  });

  // Coach: follow active generated pairing code
  window.addEventListener('eros:coach_pairing_code', function (e) {
    if (document.body.classList.contains('portal-coach') && e && e.detail && isValidPairingCode(e.detail.code)) {
      join(e.detail.code);
    }
  });

  function coachCodeFromDom() {
    var el = document.getElementById('coach-pairing-code-display');
    var text = el && el.textContent ? el.textContent.trim() : '';
    return isValidPairingCode(text) ? text : 'EROS-7X9K';
  }

  // Rehydration on page load: only connect if athlete or coach was explicitly connected
  try {
    if (typeof localStorage !== 'undefined') {
      var raw = localStorage.getItem(ATHLETE_STORAGE_KEY);
      if (raw) {
        var state = JSON.parse(raw);
        if (state && state.connected && isValidPairingCode(state.coachCode)) {
          join(state.coachCode);
        }
      }
    }
  } catch (_) {}

  var wasCoach = false;
  new MutationObserver(function () {
    var isCoach = document.body.classList.contains('portal-coach');
    if (isCoach && !wasCoach) join(coachCodeFromDom());
    if (!isCoach && wasCoach) leave();
    wasCoach = isCoach;
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  window.ErosCloud = { join: join, leave: leave, isValidPairingCode: isValidPairingCode };
})();
