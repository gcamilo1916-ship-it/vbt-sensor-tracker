/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS — ATHLETE COACH GUIDANCE & CUEING HUD CONTROLLER (coach-cue-hud.js)
 * Apple visionOS Spatial Glass OS Architecture — Milestone 3 (Requirement R2)
 *
 * Responsibilities:
 *  1. In-flight floating cue pill (#coach-cue-hud): 4-second auto-fade, non-intrusive.
 *  2. Rest period Coach Directive Modal (#coach-directive-modal): Load override & cue.
 *  3. 20-Second SVG Auto-Accept Countdown Ring (#countdown-ring-svg):
 *     - Ticks down from 20s to 0s
 *     - Accept & Decline actions
 *     - Auto-accepts and commits new working weight if timer expires
 *     - Emits coach:load_response back to ErosSyncBus
 *  4. Subtle acoustic chime via SoundFX.playCoachDirectiveChime()
 *  5. Strict R4 Terminology Compliance: Zero restricted terms. Pure Eros.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.CoachCueHUD = api;
    root.CoachInteractionHUD = api;
  }
  if (typeof window !== 'undefined') {
    window.CoachCueHUD = api;
    window.CoachInteractionHUD = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Module State ──
  let cueFadeTimeout = null;
  let cueHideTimeout = null;
  let lastCueSignature = null;
  let lastCueTimestamp = 0;
  let autoAcceptInterval = null;
  let activeDirective = null;
  let pendingDirective = null;
  let autoAcceptRemainingSeconds = 20;

  // SVG Ring Geometry: r = 13, circumference = 2 * PI * 13 ≈ 81.6814
  const RING_CIRCUMFERENCE = 81.68;

  // ── DOM Elements ──
  let dom = {
    cueHud: null,
    cueText: null,
    directiveModal: null,
    coachTitle: null,
    prevWeight: null,
    newWeight: null,
    loadDelta: null,
    overrideReason: null,
    cueBox: null,
    cueMessage: null,
    countdownRingSvg: null,
    countdownRingFill: null,
    countdownSecText: null,
    btnAccept: null,
    btnDecline: null,
    btnDismiss: null
  };

  /**
   * Caches or creates necessary DOM elements.
   */
  function ensureElements() {
    if (typeof document === 'undefined') return;

    // 1. In-flight Cue Pill (#coach-cue-hud)
    dom.cueHud = document.getElementById('coach-cue-hud') || document.getElementById('in-flight-coach-cue');
    if (!dom.cueHud) {
      dom.cueHud = document.createElement('div');
      dom.cueHud.id = 'coach-cue-hud';
      dom.cueHud.className = 'coach-cue-hud';
      dom.cueHud.setAttribute('role', 'status');
      dom.cueHud.setAttribute('aria-live', 'polite');
      dom.cueHud.style.display = 'none';

      dom.cueHud.innerHTML = `
        <div class="coach-cue-pill">
          <span class="coach-cue-dot" aria-hidden="true"></span>
          <span class="coach-cue-prefix">CUE:</span>
          <span id="coach-cue-text" class="coach-cue-text font-mono"></span>
        </div>
      `;

      const targetTab = document.getElementById('tab-live') || document.querySelector('.app-container') || document.body;
      targetTab.prepend(dom.cueHud);
    }
    dom.cueText = dom.cueHud.querySelector('#coach-cue-text') || dom.cueHud.querySelector('.coach-cue-text');

    // 2. Rest Interval Coach Directive Modal (#coach-directive-modal)
    dom.directiveModal = document.getElementById('coach-directive-modal');
    if (!dom.directiveModal) {
      dom.directiveModal = document.createElement('div');
      dom.directiveModal.id = 'coach-directive-modal';
      dom.directiveModal.className = 'coach-directive-modal';
      dom.directiveModal.setAttribute('role', 'dialog');
      dom.directiveModal.setAttribute('aria-modal', 'true');
      dom.directiveModal.setAttribute('aria-labelledby', 'coach-directive-title');
      dom.directiveModal.style.display = 'none';

      dom.directiveModal.innerHTML = `
        <div class="coach-directive-card glass-card">
          <div class="directive-header">
            <div class="coach-avatar-badge" aria-hidden="true">
              <span class="coach-avatar-initials">CM</span>
              <span class="coach-online-ping"></span>
            </div>
            <div class="directive-meta">
              <span class="coach-name" id="coach-directive-title">Coach Directive</span>
              <span class="directive-type-label" id="coach-directive-type">LOAD OVERRIDE</span>
            </div>
            <span class="directive-timestamp font-mono" id="coach-directive-time">Just now</span>
          </div>

          <div class="directive-body">
            <div class="directive-load-box" id="coach-directive-load-box">
              <div class="load-comparison font-mono">
                <span class="load-previous" id="coach-prev-weight">140.0 kg</span>
                <span class="load-arrow">→</span>
                <span class="load-prescribed highlight-accent" id="coach-new-weight">142.5 kg</span>
                <span class="load-delta positive" id="coach-load-delta">(+2.5 kg)</span>
              </div>
              <div class="load-reason" id="coach-override-reason">Prescribed load modification for upcoming set</div>
            </div>

            <div class="directive-cue-box" id="coach-directive-cue-box" style="display: none;">
              <span class="cue-quote-icon">“</span>
              <p class="cue-message" id="coach-directive-cue-text"></p>
            </div>
          </div>

          <div class="directive-actions">
            <button type="button" class="btn-directive-dismiss glass-pill" id="btn-directive-decline">
              <span id="btn-decline-text">Decline</span>
            </button>
            <button type="button" class="btn-directive-accept glass-pill-primary" id="btn-directive-accept">
              <span class="countdown-ring">
                <svg id="countdown-ring-svg" class="auto-accept-svg countdown-ring-svg" viewBox="0 0 32 32" aria-hidden="true">
                  <circle class="auto-accept-track" cx="16" cy="16" r="13"></circle>
                  <circle id="coach-accept-ring" class="auto-accept-fill" cx="16" cy="16" r="13"></circle>
                </svg>
              </span>
              <span class="btn-accept-label" id="btn-accept-label">Accept</span>
              <span class="countdown-seconds font-mono" id="coach-countdown-sec">20s</span>
            </button>
          </div>
        </div>
      `;

      const appContainer = document.querySelector('.app-container') || document.body;
      appContainer.appendChild(dom.directiveModal);
    }

    // Cache internal modal elements
    dom.coachTitle = dom.directiveModal.querySelector('#coach-directive-title');
    dom.prevWeight = dom.directiveModal.querySelector('#coach-prev-weight');
    dom.newWeight = dom.directiveModal.querySelector('#coach-new-weight');
    dom.loadDelta = dom.directiveModal.querySelector('#coach-load-delta');
    dom.overrideReason = dom.directiveModal.querySelector('#coach-override-reason');
    dom.cueBox = dom.directiveModal.querySelector('#coach-directive-cue-box') || dom.directiveModal.querySelector('.directive-cue-box');
    dom.cueMessage = dom.directiveModal.querySelector('#coach-directive-cue-text') || dom.directiveModal.querySelector('.cue-message');
    dom.countdownRingSvg = dom.directiveModal.querySelector('#countdown-ring-svg') || dom.directiveModal.querySelector('.auto-accept-svg');
    dom.countdownRingFill = dom.directiveModal.querySelector('#coach-accept-ring') || dom.directiveModal.querySelector('.auto-accept-fill');
    dom.countdownSecText = dom.directiveModal.querySelector('#coach-countdown-sec') || dom.directiveModal.querySelector('.countdown-seconds');
    dom.btnAccept = dom.directiveModal.querySelector('#btn-directive-accept') || dom.directiveModal.querySelector('#btn-coach-accept');
    dom.btnDecline = dom.directiveModal.querySelector('#btn-directive-decline') || dom.directiveModal.querySelector('#btn-coach-dismiss');

    bindModalButtons();
  }

  function bindModalButtons() {
    if (dom.btnAccept && !dom.btnAccept._hudBound) {
      dom.btnAccept.addEventListener('click', () => {
        acceptDirective();
      });
      dom.btnAccept._hudBound = true;
    }

    if (dom.btnDecline && !dom.btnDecline._hudBound) {
      dom.btnDecline.addEventListener('click', () => {
        declineDirective();
      });
      dom.btnDecline._hudBound = true;
    }
  }

  // ── Helper: Check Active Set State ──
  function isAthleteInActiveSet() {
    if (typeof activeSet !== 'undefined' && activeSet !== null) {
      return true;
    }
    const btnSetToggle = document.getElementById('btn-set-toggle');
    if (btnSetToggle && (btnSetToggle.classList.contains('recording') || btnSetToggle.classList.contains('set-active'))) {
      return true;
    }
    return false;
  }

  // ── Helper: Get Current Working Weight ──
  function getCurrentWeight() {
    if (typeof currentWorkingWeight === 'number' && !isNaN(currentWorkingWeight)) {
      return currentWorkingWeight;
    }
    const input = document.getElementById('live-set-weight-input') || document.getElementById('workout-set-weight-input');
    if (input) {
      const val = parseFloat(input.value);
      if (!isNaN(val)) return val;
    }
    return 140.0;
  }

  // ── Audio & Haptic Chimes ──
  let lastDirectiveAlertTime = 0;
  function playDirectiveArrivalAlert() {
    const now = Date.now();
    if (now - lastDirectiveAlertTime < 250) return;
    lastDirectiveAlertTime = now;

    if (typeof SoundFX !== 'undefined') {
      if (typeof SoundFX.playCoachDirectiveChime === 'function') {
        SoundFX.playCoachDirectiveChime();
      } else if (typeof SoundFX.playCoachCueIncoming === 'function') {
        SoundFX.playCoachCueIncoming();
      }
    }
    if (typeof HapticsFX !== 'undefined') {
      if (typeof HapticsFX.vibrateCoachDirective === 'function') {
        HapticsFX.vibrateCoachDirective();
      } else if (typeof HapticsFX.vibrate === 'function') {
        HapticsFX.vibrate([60, 40, 100]);
      }
    }
  }

  // ── 1. In-Flight Floating Cue Pill ──
  /**
   * Displays a non-intrusive floating frosted pill at the top of the Live tab.
   * Automatically fades out cleanly after durationMs (default 4.5s).
   *
   * @param {string|Object} cue - Cue text or payload object.
   * @param {number} [durationMs=4500] - Duration in milliseconds (default 4.5s).
   */
  function showCoachCue(cue, durationMs = 4500) {
    ensureElements();
    if (!dom.cueHud) return;

    const rawCueText = (typeof cue === 'object' && cue !== null)
      ? (cue.text || cue.cueText || cue.message || '')
      : String(cue || '');

    if (!rawCueText) return;

    // Remove redundant CUE: prefix if already present
    const cleanText = rawCueText.replace(/^CUE:\s*/i, '').trim();
    if (!cleanText) return;

    // De-duplicate rapid duplicate events (within 400ms)
    const cueSignature = (typeof cue === 'object' && cue !== null && cue.id)
      ? cue.id
      : cleanText;
    const now = Date.now();
    if (cueSignature === lastCueSignature && (now - lastCueTimestamp < 400)) {
      return;
    }
    lastCueSignature = cueSignature;
    lastCueTimestamp = now;

    if (dom.cueText) {
      dom.cueText.textContent = cleanText;
    }

    // Cancel existing fade or hide timeouts
    if (cueFadeTimeout) {
      clearTimeout(cueFadeTimeout);
      cueFadeTimeout = null;
    }
    if (cueHideTimeout) {
      clearTimeout(cueHideTimeout);
      cueHideTimeout = null;
    }

    // Display frosted pill
    dom.cueHud.style.display = 'block';
    // Force browser reflow for clean transition restart
    void dom.cueHud.offsetWidth;
    dom.cueHud.classList.add('active');

    // Tap to dismiss early
    if (!dom.cueHud._dismissBound) {
      dom.cueHud.addEventListener('click', () => dismissCue());
      dom.cueHud._dismissBound = true;
    }

    // Acoustic & tactile notification
    playDirectiveArrivalAlert();

    const parsedDuration = (typeof durationMs === 'number' && !isNaN(durationMs) && durationMs > 0)
      ? durationMs
      : ((typeof cue === 'object' && cue !== null && typeof cue.durationMs === 'number' && cue.durationMs > 0)
          ? cue.durationMs
          : 4500);

    // Clean auto-fade
    cueFadeTimeout = setTimeout(() => {
      dismissCue();
    }, parsedDuration);
  }

  /**
   * Immediately dismisses the in-flight cue pill.
   */
  function dismissCue() {
    if (cueFadeTimeout) {
      clearTimeout(cueFadeTimeout);
      cueFadeTimeout = null;
    }
    if (cueHideTimeout) {
      clearTimeout(cueHideTimeout);
      cueHideTimeout = null;
    }
    if (!dom.cueHud) ensureElements();
    if (dom.cueHud) {
      dom.cueHud.classList.remove('active');
      cueHideTimeout = setTimeout(() => {
        if (dom.cueHud && !dom.cueHud.classList.contains('active')) {
          dom.cueHud.style.display = 'none';
        }
        cueHideTimeout = null;
      }, 350);
    }
  }

  // ── 2. Rest Period Coach Directive Modal & 20s Countdown Ring ──
  /**
   * Displays the Coach Directive Modal during rest intervals.
   * If called while an active set is recording, queues the directive until the set ends.
   *
   * @param {Object} directive - Load override / strategic adjustment payload.
   */
  function showCoachDirective(directive = {}) {
    ensureElements();

    // Check if athlete is mid-lift; if so, queue until rest interval starts
    if (isAthleteInActiveSet()) {
      pendingDirective = directive;
      // Show subtle cue indicator
      const hint = directive.text || (directive.deltaKg ? `Coach load adjustment pending next set` : 'Coach directive pending');
      showCoachCue(hint, 4000);
      return;
    }

    activeDirective = {
      id: directive.id || `override_${Date.now()}`,
      coachName: directive.coachName || 'Coach',
      deltaKg: typeof directive.deltaKg === 'number' ? directive.deltaKg : 0,
      newWeight: typeof directive.newWeight === 'number' ? directive.newWeight : (getCurrentWeight() + (directive.deltaKg || 0)),
      reason: directive.reason || (directive.text ? directive.text : 'Prescribed load modification for upcoming set'),
      cueText: directive.cueText || (directive.deltaKg === 0 ? directive.text : ''),
      autoAcceptSeconds: Math.max(1, parseInt(directive.autoAcceptSeconds, 10) || 20),
      timestamp: directive.timestamp || Date.now()
    };

    const currentWeight = getCurrentWeight();
    const finalNewWeight = Math.max(0, activeDirective.newWeight);
    const delta = finalNewWeight - currentWeight;
    const deltaSign = delta >= 0 ? '+' : '';

    if (dom.coachTitle) dom.coachTitle.textContent = `${activeDirective.coachName} Directive`;
    if (dom.prevWeight) dom.prevWeight.textContent = `${currentWeight.toFixed(1)} kg`;
    if (dom.newWeight) dom.newWeight.textContent = `${finalNewWeight.toFixed(1)} kg`;

    if (dom.loadDelta) {
      dom.loadDelta.textContent = `(${deltaSign}${delta.toFixed(1)} kg)`;
      dom.loadDelta.className = `load-delta ${delta >= 0 ? 'positive' : 'negative'}`;
    }

    if (dom.overrideReason) {
      dom.overrideReason.textContent = activeDirective.reason;
    }

    if (dom.cueBox && dom.cueMessage) {
      if (activeDirective.cueText) {
        dom.cueMessage.textContent = activeDirective.cueText;
        dom.cueBox.style.display = 'flex';
      } else {
        dom.cueBox.style.display = 'none';
      }
    }

    // Update decline button label
    const declineText = dom.directiveModal.querySelector('#btn-decline-text') || dom.btnDecline;
    if (declineText) {
      declineText.textContent = `Decline (${currentWeight.toFixed(1)} kg)`;
    }

    // Update accept button label
    const acceptLabel = dom.directiveModal.querySelector('#btn-accept-label') || dom.directiveModal.querySelector('.btn-accept-label');
    if (acceptLabel) {
      acceptLabel.textContent = `Accept (${deltaSign}${delta.toFixed(1)} kg)`;
    }

    // Acoustic & tactile notification
    playDirectiveArrivalAlert();

    // Open Modal
    dom.directiveModal.style.display = 'flex';
    void dom.directiveModal.offsetWidth;
    dom.directiveModal.classList.add('open');

    // Start 20-second SVG circular countdown ring
    startCountdownRing(activeDirective.autoAcceptSeconds);
  }

  /**
   * Starts the circular countdown ring animation from 20s down to 0s.
   * Upon reaching 0s without rejection, automatically accepts the directive.
   */
  function startCountdownRing(seconds = 20) {
    stopCountdownRing();

    autoAcceptRemainingSeconds = seconds;
    const totalSecs = seconds;

    if (dom.countdownSecText) {
      dom.countdownSecText.textContent = `${autoAcceptRemainingSeconds}s`;
    }

    if (dom.countdownRingFill) {
      dom.countdownRingFill.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
      dom.countdownRingFill.style.strokeDashoffset = '0';
    }

    const startTime = Date.now();

    autoAcceptInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, totalSecs - elapsed);
      const wholeRemaining = Math.ceil(remaining);

      if (dom.countdownSecText) {
        dom.countdownSecText.textContent = `${wholeRemaining}s`;
      }

      if (dom.countdownRingFill) {
        const progress = Math.min(1, elapsed / totalSecs);
        const offset = progress * RING_CIRCUMFERENCE;
        dom.countdownRingFill.style.strokeDashoffset = offset.toFixed(2);
      }

      if (remaining <= 0) {
        stopCountdownRing();
        autoAcceptDirective();
      }
    }, 100);
  }

  function stopCountdownRing() {
    if (autoAcceptInterval) {
      clearInterval(autoAcceptInterval);
      autoAcceptInterval = null;
    }
  }

  /**
   * Commits acceptance of the coach load override.
   * Updates working weight and emits coach:load_response back to ErosSyncBus.
   */
  function acceptDirective() {
    stopCountdownRing();
    const directive = activeDirective;
    closeDirectiveModal();

    if (!directive) return;

    const finalWeight = directive.newWeight;

    // Update working weight synchronously across application
    if (typeof setWorkingWeight === 'function') {
      setWorkingWeight(finalWeight, true);
    } else {
      const liveInput = document.getElementById('live-set-weight-input');
      const workoutInput = document.getElementById('workout-set-weight-input');
      if (liveInput) liveInput.value = finalWeight.toFixed(1);
      if (workoutInput) workoutInput.value = finalWeight.toFixed(1);
    }

    // Emit confirmation payload back to ErosSyncBus
    const responsePayload = {
      id: directive.id,
      accepted: true,
      finalWeight: finalWeight,
      timestamp: Date.now()
    };

    emitSyncBusResponse(responsePayload);

    // Audio confirmation
    if (typeof SoundFX !== 'undefined' && typeof SoundFX.playStepperTick === 'function') {
      SoundFX.playStepperTick();
    }
  }

  /**
   * Internal auto-accept trigger when 20s countdown timer expires.
   */
  function autoAcceptDirective() {
    acceptDirective();
  }

  /**
   * Declines the coach load override.
   * Keeps the current working weight and emits coach:load_response (accepted: false).
   */
  function declineDirective() {
    stopCountdownRing();
    const directive = activeDirective;
    closeDirectiveModal();

    if (!directive) return;

    const currentWeight = getCurrentWeight();

    const responsePayload = {
      id: directive.id,
      accepted: false,
      finalWeight: currentWeight,
      timestamp: Date.now()
    };

    emitSyncBusResponse(responsePayload);

    // Audio tick
    if (typeof SoundFX !== 'undefined' && typeof SoundFX.playNavTick === 'function') {
      SoundFX.playNavTick();
    }
  }

  function closeDirectiveModal() {
    activeDirective = null;
    if (!dom.directiveModal) ensureElements();
    if (dom.directiveModal) {
      dom.directiveModal.classList.remove('open');
      setTimeout(() => {
        if (!dom.directiveModal.classList.contains('open')) {
          dom.directiveModal.style.display = 'none';
        }
      }, 350);
    }
  }

  /**
   * Dispatches coach:load_response to ErosSyncBus and DOM CustomEvents.
   */
  function emitSyncBusResponse(payload) {
    // 1. ErosSyncBus
    if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
      try {
        window.ErosSyncBus.emit('coach:load_response', payload);
        window.ErosSyncBus.emit('coach:feedback:ack', payload);
      } catch (err) {
        console.warn('[CoachCueHUD] ErosSyncBus emit error:', err);
      }
    }

    // 2. DOM CustomEvents for intra-page resilience
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('coach:load_response', { detail: payload }));
      window.dispatchEvent(new CustomEvent('eros:coach_load_response', { detail: payload }));
    }
  }

  // ── Sync Bus & Event Bus Coordination ──
  function setupBusListeners() {
    // ErosSyncBus direct registration
    if (typeof window !== 'undefined') {
      const registerOnBus = (bus) => {
        if (!bus || typeof bus.on !== 'function') return;
        bus.on('coach:cue', (payload) => {
          showCoachCue(payload);
        });

        bus.on('coach:load_override', (payload) => {
          showCoachDirective(payload);
        });

        bus.on('coach:feedback', (payload) => {
          // Adapt feedback action payload if needed
          if (payload && payload.action) {
            const act = payload.action;
            const loadMod = act.loadModification || {};
            const techCue = act.technicalCue || {};
            showCoachDirective({
              id: payload.commandId || payload.id,
              coachName: payload.coachName,
              deltaKg: loadMod.deltaKg || 0,
              newWeight: loadMod.prescribedWeightKg,
              reason: loadMod.reason,
              cueText: techCue.text,
              autoAcceptSeconds: payload.autoAcceptTimeoutSec || 20,
              timestamp: payload.timestamp
            });
          } else {
            showCoachDirective(payload);
          }
        });

        bus.on('set:completed', () => {
          if (pendingDirective) {
            const next = pendingDirective;
            pendingDirective = null;
            setTimeout(() => {
              showCoachDirective(next);
            }, 600);
          }
        });
      };

      if (window.ErosSyncBus) {
        registerOnBus(window.ErosSyncBus);
      } else {
        // Poll briefly or intercept setter when sync-bus.js loads
        let busChecked = 0;
        const checkInterval = setInterval(() => {
          busChecked++;
          if (window.ErosSyncBus) {
            clearInterval(checkInterval);
            registerOnBus(window.ErosSyncBus);
          } else if (busChecked > 50) {
            clearInterval(checkInterval);
          }
        }, 100);
      }

      // DOM CustomEvent listeners fallback
      window.addEventListener('coach:cue', (e) => {
        showCoachCue(e.detail);
      });
      window.addEventListener('eros:coach_cue', (e) => {
        showCoachCue(e.detail);
      });
      window.addEventListener('coach:load_override', (e) => {
        showCoachDirective(e.detail);
      });
      window.addEventListener('eros:coach_load_override', (e) => {
        showCoachDirective(e.detail);
      });
      window.addEventListener('set:completed', () => {
        if (pendingDirective) {
          const next = pendingDirective;
          pendingDirective = null;
          setTimeout(() => {
            showCoachDirective(next);
          }, 600);
        }
      });
    }
  }

  // ── Lifecycle Hook: Watch set completion in app.js ──
  function hookSetCompletion() {
    if (typeof window !== 'undefined') {
      window.addEventListener('eros:set_concluded', () => {
        if (pendingDirective) {
          const next = pendingDirective;
          pendingDirective = null;
          setTimeout(() => {
            showCoachDirective(next);
          }, 600);
        }
      });
    }
  }

  function init() {
    ensureElements();
    setupBusListeners();
    hookSetCompletion();
  }

  // Auto-init on document ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Public Interface
  return {
    init,
    showCoachCue,
    dismissCue,
    showCoachDirective,
    acceptDirective,
    declineDirective,
    closeDirectiveModal,
    getPendingDirective: () => pendingDirective,
    getActiveDirective: () => activeDirective,
    isModalVisible: () => Boolean(dom.directiveModal && dom.directiveModal.classList.contains('open')),
    isCueVisible: () => Boolean(dom.cueHud && dom.cueHud.classList.contains('active')),
    getRemainingCountdown: () => autoAcceptRemainingSeconds
  };
});
