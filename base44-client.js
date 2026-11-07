/* Eros cloud client: loads the Base44 SDK and joins the SquadSession room.
 * Offline-first: any failure here is silent and never affects local sync. */
(function () {
  'use strict';

  var APP_ID = '6aef31fc9b0008d92f24df46';
  var SDK_URL = 'https://esm.sh/@base44/sdk@0.8.59';
  var DEFAULT_CODE = 'EROS-7X9K';

  var clientPromise = null;
  var pendingCode = null;

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
    var clean = String(code || DEFAULT_CODE).trim().toUpperCase();
    pendingCode = clean;
    return getClient().then(function (client) {
      if (!client || pendingCode !== clean) return false;
      var bus = window.ErosSyncBus;
      if (!bus || typeof bus.connectCloud !== 'function') return false;
      return bus.connectCloud(clean, client);
    }).catch(function () { return false; });
  }

  function leave() {
    pendingCode = null;
    var bus = window.ErosSyncBus;
    if (bus && typeof bus.disconnectCloud === 'function') bus.disconnectCloud();
  }

  // Athlete: join when the athlete connects to a coach code.
  window.addEventListener('eros:athlete_connect', function (e) {
    join(e && e.detail && e.detail.coachCode);
  });

  // Coach: follow the active pairing code.
  window.addEventListener('eros:coach_pairing_code', function (e) {
    if (document.body.classList.contains('portal-coach')) {
      join(e && e.detail && e.detail.code);
    }
  });

  function coachCodeFromDom() {
    var el = document.getElementById('coach-pairing-code-display');
    var text = el && el.textContent ? el.textContent.trim() : '';
    return /^EROS-/i.test(text) ? text : DEFAULT_CODE;
  }

  var wasCoach = false;
  new MutationObserver(function () {
    var isCoach = document.body.classList.contains('portal-coach');
    if (isCoach && !wasCoach) join(coachCodeFromDom());
    if (!isCoach && wasCoach) leave();
    wasCoach = isCoach;
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  window.ErosCloud = { join: join, leave: leave };
})();
