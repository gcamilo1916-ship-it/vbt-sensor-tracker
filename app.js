/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS — GLASS OS CORE LOGIC
 * Bluetooth connection, nested workout data hierarchy & LocalStorage
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Bluetooth Specifications (matching vbt_architecture.md) ──
const SERVICE_UUID            = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID     = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'; // Data: Notify, Read
const CMD_CHARACTERISTIC_UUID = '5a7d3c90-951d-444a-8f5b-11c500732890'; // Commands: Write
// Internal advertising name used only by the browser device filter (never displayed).
const DEVICE_NAME             = 'VBT_Tracker';
const STORAGE_KEY             = 'vbt_workouts_v1';
const PR_STORAGE_KEY          = 'vbt_pr_data_v1';

// ── DOM References ──
// Header & Master Workout Controls
const btnWorkoutMaster  = document.getElementById('btn-workout-master');
const btnWorkoutText    = document.getElementById('btn-workout-text');
const sessionPulse      = document.getElementById('session-pulse');
const sessionStatusText = document.getElementById('session-status-text');
const sessionTimerDisp  = document.getElementById('session-timer-display');
const statusBadge       = document.getElementById('status-badge');
const syncBanner        = document.getElementById('sync-banner');
const syncBannerText    = document.getElementById('sync-banner-text');

// Connection Controls & Lift Selector
const btnConnect        = document.getElementById('btn-connect');
const btnConnectText    = btnConnect ? btnConnect.querySelector('.btn-text') : null;
const liftSelectWrapper = document.getElementById('lift-select-wrapper');
const selectTrigger     = liftSelectWrapper ? liftSelectWrapper.querySelector('.custom-select-trigger') : null;
const selectedLiftText  = document.getElementById('selected-lift-text');
const customOptions     = liftSelectWrapper ? liftSelectWrapper.querySelectorAll('.custom-option') : [];
const btnSetToggle      = document.getElementById('btn-set-toggle');
const btnSetText        = document.getElementById('btn-set-text');

// Eros Connection Sheet Controls
const bleSearchSheet       = document.getElementById('bluetooth-search-tab');
const bleSearchBackdrop    = document.getElementById('ble-search-backdrop');
const bleSearchContent     = document.getElementById('ble-search-content');
const bleDragZone          = document.getElementById('ble-drag-zone');
const btnCloseBleSearch    = document.getElementById('btn-close-ble-search');
const bleSearchStatusText  = document.getElementById('ble-search-status-text');
const bleDeviceCard        = document.getElementById('ble-device-card');

// Target RPE Configuration Controls
const targetRpeModule      = document.getElementById('target-rpe-module');
const btnTargetRpeDec      = document.getElementById('btn-target-rpe-dec');
const btnTargetRpeInc      = document.getElementById('btn-target-rpe-inc');
const targetRpeDisplay     = document.getElementById('target-rpe-display');
const targetChips          = document.querySelectorAll('.target-chip');
const rpeTargetPin         = document.getElementById('rpe-target-pin');
let currentTargetRpe       = 8.0;

// Live Tracker Arena
const liveVelocity      = document.getElementById('live-velocity');
const livePeakVel       = document.getElementById('live-peak-vel');
const liveRpe           = document.getElementById('live-rpe');
const liveVelSub        = document.getElementById('live-vel-sub');
const livePeakSub       = document.getElementById('live-peak-sub');
const liveRpeSub        = document.getElementById('live-rpe-sub');
const orb               = document.getElementById('orb');
const apexGlow          = document.getElementById('apex-glow');

// Live RPE Hero Banner
const rpeHeroCard       = document.getElementById('rpe-hero-card');
const liveRirPill       = document.getElementById('live-rir-pill');
const rpeTierBadge      = document.getElementById('rpe-tier-badge');
const rpeGaugeFill      = document.getElementById('rpe-gauge-fill');

// Live Mini-HUD
const hudActiveSet      = document.getElementById('hud-active-set');
const hudSetReps        = document.getElementById('hud-set-reps');
const hudVelLoss        = document.getElementById('hud-vel-loss');

// Set Tracking Tab
const setBadgeLabel     = document.getElementById('set-badge-label');
const setLiftName       = document.getElementById('set-lift-name');
const setRepCounter     = document.getElementById('set-rep-counter');
const setAvgVel         = document.getElementById('set-avg-vel');
const setMaxVel         = document.getElementById('set-max-vel');
const setVelLoss        = document.getElementById('set-vel-loss');
const setAvgRpe         = document.getElementById('set-avg-rpe');
const setMinVel         = document.getElementById('set-min-vel');
const setRingProgress   = document.getElementById('set-ring-progress');
const activeSetRepsList = document.getElementById('active-set-reps-list');
const activeSetRepCounter = document.getElementById('active-set-rep-counter');

// Workout Tab (summary + sets table)
const workoutSummaryStatus = document.getElementById('workout-summary-status');
const workoutSumSets       = document.getElementById('workout-sum-sets');
const workoutSumReps       = document.getElementById('workout-sum-reps');
const workoutSumAvgVel     = document.getElementById('workout-sum-avg-vel');
const workoutSumPeakVel    = document.getElementById('workout-sum-peak-vel');
const workoutSetsTable     = document.getElementById('workout-sets-table');
const workoutSetsCounter   = document.getElementById('workout-sets-counter');

// History Tab & Data Export
const sumWorkouts       = document.getElementById('sum-workouts');
const sumSets           = document.getElementById('sum-sets');
const sumReps           = document.getElementById('sum-reps');
const sumBestVel        = document.getElementById('sum-best-vel');
const historySessionsList = document.getElementById('history-sessions-list');
const btnExportCsv      = document.getElementById('btn-export-csv');
const btnExportJson     = document.getElementById('btn-export-json');
const btnClearHistory   = document.getElementById('btn-clear-history');

// PR Dashboard & DOTS Calculator Controls (Milestone 4: R4)
const prSquatWeight    = document.getElementById('pr-squat-weight');
const prBenchWeight    = document.getElementById('pr-bench-weight');
const prDeadliftWeight = document.getElementById('pr-deadlift-weight');
const prSquatVel       = document.getElementById('pr-squat-vel');
const prBenchVel       = document.getElementById('pr-bench-vel');
const prDeadliftVel    = document.getElementById('pr-deadlift-vel');
const prCurrentTotal   = document.getElementById('pr-current-total');

const compSquatWeight  = document.getElementById('comp-squat-weight');
const compBenchWeight  = document.getElementById('comp-bench-weight');
const compDeadliftWeight = document.getElementById('comp-deadlift-weight');
const compPrTotal      = document.getElementById('comp-pr-total');

const dotsBwInput      = document.getElementById('dots-bodyweight-input');
const dotsGenderMale   = document.getElementById('dots-gender-male');
const dotsGenderFemale = document.getElementById('dots-gender-female');
const dotsSrcCurrent   = document.getElementById('dots-src-current');
const dotsSrcComp      = document.getElementById('dots-src-comp');
const dotsScoreDisplay = document.getElementById('dots-score-display');
const dotsTotalDisplay = document.getElementById('dots-total-display');
const dotsTierBadge    = document.getElementById('dots-tier-badge');

// Navigation Tabs
const navTabs           = document.querySelectorAll('.nav-tab');
const tabSections       = {
  live: document.getElementById('tab-live'),
  set: document.getElementById('tab-set'),
  history: document.getElementById('tab-history')
};
const bottomGlassNav    = document.querySelector('.bottom-glass-nav');
let currentTabTarget    = 'live';

// ── Application State ──
let bleDevice          = null;
let dataCharacteristic = null;
let cmdCharacteristic  = null;

let currentLift        = 'Deadlift';
let workoutTimerId     = null;

// Nested Data Storage Engine
let workouts = [];           // Array of Workout Sessions
let activeWorkout = null;    // Current active Workout Session object
let activeSet = null;        // Current active Set object

// Biomechanical Reference Baselines
const LIFT_BASELINES = {
  deadlift: { mvt: 0.15, rpe8: 0.35, cmd: 'CMD:SL:DL' },
  squat:    { mvt: 0.22, rpe8: 0.42, cmd: 'CMD:SL:SQ' },
  bench:    { mvt: 0.16, rpe8: 0.32, cmd: 'CMD:SL:BP' }
};

// ── Lift naming helpers (sets are always tagged with the lift they were performed under) ──
const KNOWN_LIFTS = { deadlift: 'Deadlift', squat: 'Squat', bench: 'Bench' };

/** Normalises the casing of the three known lifts; unknown names pass through trimmed. */
function canonicalLift(name) {
  const raw = String(name == null ? '' : name).trim();
  return KNOWN_LIFTS[raw.toLowerCase()] || raw;
}

/** Case-insensitive lift comparison. */
function sameLift(a, b) {
  return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase();
}

/** Maps any lift name to a styling key: deadlift | squat | bench | other. */
function liftKeyOf(name) {
  const k = String(name == null ? '' : name).toLowerCase();
  if (k.includes('dead')) return 'deadlift';
  if (k.includes('squat')) return 'squat';
  if (k.includes('bench')) return 'bench';
  return 'other';
}

// ═════════════════════════════════════════════════════════════════════════════
// SYNTHETIC SOUND & HAPTIC ENGINE (Web Audio Unlocking)
// ═════════════════════════════════════════════════════════════════════════════

const SoundFX = (() => {
  let audioCtx = null;
  let unlocked = false;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    return audioCtx;
  }

  function unlock() {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        unlocked = true;
      }).catch(() => {});
    } else {
      unlocked = true;
    }
  }

  // Auto-unlock on first touch / click gesture (vital for iOS Safari)
  ['touchstart', 'touchend', 'pointerdown', 'click'].forEach(evt => {
    window.addEventListener(evt, unlock, { passive: true });
  });

  function playToneActual(ctx, freq, type, duration, gainVal, delay) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime + delay;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + duration);
  }

  function playTone(freq, type, duration, gainVal = 0.15, delay = 0) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          playToneActual(ctx, freq, type, duration, gainVal, delay);
        }).catch(() => {});
        return;
      }
      playToneActual(ctx, freq, type, duration, gainVal, delay);
    } catch (e) {
      // Audio fallback silent
    }
  }

  return {
    unlock,
    getAudioContext,

    // Rep completed chime: Dual crystal tone modulated by bar velocity
    playRepChime(velocity = 0.5, rpe = 8.0) {
      const baseFreq = 587.33; // D5
      const highFreq = Math.min(1250, baseFreq * (1 + (velocity || 0.4) * 0.45));
      playTone(baseFreq, 'sine', 0.12, 0.22, 0);
      playTone(highFreq, 'triangle', 0.20, 0.28, 0.05);
    },

    // Target RPE reached warning alert (resonant ascending triad)
    playTargetReached() {
      playTone(740.0, 'triangle', 0.14, 0.32, 0);
      playTone(987.77, 'sine', 0.22, 0.35, 0.09);
      playTone(1174.66, 'sine', 0.35, 0.30, 0.20);
    },

    // Long press PR hold feedback
    playLongPressHold(ratio = 0.5) {
      playTone(200 + ratio * 240, 'sine', 0.05, 0.09, 0);
    },

    // Golden PR fanfare (C Major triumph chord)
    playPrFanfare() {
      playTone(523.25, 'triangle', 0.22, 0.25, 0);
      playTone(659.25, 'triangle', 0.28, 0.25, 0.07);
      playTone(783.99, 'triangle', 0.35, 0.30, 0.14);
      playTone(1046.50, 'sine', 0.55, 0.35, 0.22);
    },

    // Master workout & Set controls
    playSetStart() {
      playTone(440.0, 'sine', 0.10, 0.18, 0);
      playTone(659.25, 'triangle', 0.22, 0.22, 0.07);
    },

    playSetEnd() {
      playTone(550.0, 'sine', 0.12, 0.20, 0);
      playTone(369.99, 'triangle', 0.26, 0.22, 0.09);
    },

    // Navigation & UI tab switch tick
    playNavTick() {
      playTone(1350.0, 'sine', 0.02, 0.09, 0);
    },

    // Stepper & Chip setting tick
    playStepperTick() {
      playTone(1100.0, 'sine', 0.03, 0.12, 0);
    },

    // Sub-bass acoustic haptic thump fallback for iOS Safari
    playSubBassThump() {
      playTone(45, 'sine', 0.07, 0.35, 0);
    },

    // Bluetooth lifecycle sound cues
    playBleSearchPing() {
      playTone(880.0, 'sine', 0.08, 0.12, 0);
    },

    playBleConnected() {
      playTone(523.25, 'sine', 0.10, 0.20, 0);
      playTone(659.25, 'sine', 0.12, 0.20, 0.07);
      playTone(783.99, 'sine', 0.16, 0.25, 0.14);
      playTone(1046.50, 'triangle', 0.32, 0.32, 0.22);
    },

    playBleDisconnected() {
      playTone(659.25, 'sine', 0.12, 0.20, 0);
      playTone(440.0, 'sine', 0.22, 0.18, 0.09);
    }
  };
})();

const HapticsFX = (() => {
  return {
    vibrate(pattern) {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(pattern);
          return;
        } catch (e) {}
      }
      // iOS Safari fallback: Sub-bass acoustic haptic thump reusing SoundFX singleton
      try {
        SoundFX.playSubBassThump();
      } catch (e) {}
    }
  };
})();

// Touch responsiveness & active tactile feedback
document.addEventListener('touchstart', () => {}, { passive: true });

function initTouchActiveStates() {
  const touchSelectors = '.btn-glass-primary, .btn-glass-set, .btn-glass-connect, .btn-action-glass, .custom-select-trigger, .custom-option, .target-stepper-btn, .target-chip, .nav-tab, .dots-gender-btn, .dots-source-btn, #status-badge, .ble-close-btn, .ble-device-card';
  
  const addActive = (e) => {
    const el = e.target.closest(touchSelectors);
    if (el) el.classList.add('touch-active');
  };

  const removeActive = () => {
    document.querySelectorAll('.touch-active').forEach(el => el.classList.remove('touch-active'));
  };

  // Support both Touch Events and Pointer Events
  document.addEventListener('touchstart', addActive, { passive: true });
  document.addEventListener('touchend', removeActive, { passive: true });
  document.addEventListener('touchcancel', removeActive, { passive: true });
  document.addEventListener('touchmove', removeActive, { passive: true });

  document.addEventListener('pointerdown', addActive, { passive: true });
  document.addEventListener('pointerup', removeActive, { passive: true });
  document.addEventListener('pointercancel', removeActive, { passive: true });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. DATA STORAGE & INITIALIZATION
// ═════════════════════════════════════════════════════════════════════════════

function initStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      workouts = JSON.parse(raw);
      console.log(`[Eros] Loaded ${workouts.length} workout sessions from localStorage.`);
    }
  } catch (err) {
    console.warn('[Eros] Failed to read localStorage:', err);
    workouts = [];
  }
  loadPrProfile();
  updateHistoryStats();
  renderHistoryView();
  initPrDashboardListeners();
  updatePrDashboardUI(true);
  updateWorkoutPage();
}

function persistStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
  } catch (err) {
    console.error('[Eros] Failed to save to localStorage:', err);
    showBanner('Storage Full: Unable to persist workout history');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. WORKOUT SESSION & SET LIFECYCLE MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Starts a new master workout session
 */
function startWorkoutSession() {
  if (activeWorkout) return activeWorkout;

  const now = new Date();
  const session = {
    id: `ws_${Date.now()}`,
    startTime: now.getTime(),
    endTime: null,
    dateStr: now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    name: `${currentLift} Session`,
    sets: []
  };

  workouts.unshift(session);
  activeWorkout = session;

  // Start Session Timer
  startSessionTimer(session.startTime);

  // Update UI
  btnWorkoutText.textContent = 'END WORKOUT';
  btnWorkoutMaster.classList.add('session-active');
  sessionPulse.classList.add('active');
  sessionStatusText.textContent = 'ACTIVE WORKOUT';
  sessionStatusText.classList.add('active');

  persistStorage();
  updateHistoryStats();
  updateWorkoutPage();
  return session;
}

/**
 * Concludes the active workout session
 */
function endWorkoutSession() {
  if (!activeWorkout) return;

  // End active set if still ongoing
  if (activeSet) {
    endActiveSet();
  }

  activeWorkout.endTime = Date.now();
  stopSessionTimer();

  activeWorkout = null;
  activeSet = null;

  // Reset UI
  btnWorkoutText.textContent = 'START WORKOUT';
  btnWorkoutMaster.classList.remove('session-active');
  sessionPulse.classList.remove('active');
  sessionStatusText.textContent = 'NO ACTIVE WORKOUT';
  sessionStatusText.classList.remove('active');
  sessionTimerDisp.textContent = '00:00:00';

  updateLiveMiniHud();
  updateSetUI(null);
  persistStorage();
  updateHistoryStats();
  renderHistoryView();
}

/**
 * Toggles master workout session state
 */
btnWorkoutMaster.addEventListener('click', () => {
  if (activeWorkout) {
    if (confirm('Are you sure you want to end this workout session?')) {
      endWorkoutSession();
    }
  } else {
    startWorkoutSession();
  }
});

function startSessionTimer(startTimestamp) {
  stopSessionTimer();
  const updateTimer = () => {
    const elapsedMs = Date.now() - startTimestamp;
    const totalSecs = Math.floor(elapsedMs / 1000);
    const hrs = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSecs % 60).padStart(2, '0');
    sessionTimerDisp.textContent = `${hrs}:${mins}:${secs}`;
  };
  updateTimer();
  workoutTimerId = setInterval(updateTimer, 1000);
}

function stopSessionTimer() {
  if (workoutTimerId) {
    clearInterval(workoutTimerId);
    workoutTimerId = null;
  }
}

/**
 * Starts a new set under the active workout
 */
function startNewSet(lift = currentLift) {
  // Ensure workout session is active
  if (!activeWorkout) {
    startWorkoutSession();
  }

  const setLift = canonicalLift(lift || currentLift);
  const setNumber = activeWorkout.sets.length + 1;
  const newSet = {
    setId: `set_${Date.now()}_${setNumber}`,
    setNumber: setNumber,
    lift: setLift,
    targetRpe: currentTargetRpe,
    startTime: Date.now(),
    endTime: null,
    avgVelocity: 0.0,
    maxVelocity: 0.0,
    minVelocity: 0.0,
    velocityLossPct: 0.0,
    avgRpe: 0.0,
    reps: []
  };

  activeWorkout.sets.push(newSet);
  activeSet = newSet;

  // Update Controls UI
  btnSetText.textContent = 'END SET';
  btnSetToggle.classList.add('set-active');
  btnSetToggle.classList.add('recording');

  if (livePeakVel) livePeakVel.textContent = '0.00';
  if (livePeakSub) livePeakSub.textContent = `Set ${setNumber} Initialized`;

  updateLiveMiniHud();
  updateSetUI(activeSet);
  updateWorkoutPage();
  persistStorage();
  return newSet;
}

/**
 * Concludes the active set
 */
function endActiveSet() {
  if (!activeSet) return;

  if (typeof activeRepPressCancel === 'function') {
    activeRepPressCancel();
    activeRepPressCancel = null;
  }

  activeSet.endTime = Date.now();
  recalculateSetMetrics(activeSet);

  if (livePeakSub) {
    livePeakSub.textContent = `Set ${activeSet.setNumber} Concluded (Peak: ${activeSet.maxVelocity.toFixed(2)} m/s)`;
  }

  activeSet = null;

  // Update Controls UI
  btnSetText.textContent = 'START SET';
  btnSetToggle.classList.remove('set-active');
  btnSetToggle.classList.remove('recording');

  updateLiveMiniHud();
  updateWorkoutPage();
  persistStorage();
  updateHistoryStats();
  renderHistoryView();
}

/**
 * Toggles Set tracking state
 */
btnSetToggle.addEventListener('click', () => {
  if (activeSet) {
    SoundFX.playSetEnd();
    HapticsFX.vibrate([40]);
    endActiveSet();
  } else {
    SoundFX.playSetStart();
    HapticsFX.vibrate([40]);
    startNewSet(currentLift);
  }
});

/**
 * Pushes an ingested repetition into the active set hierarchy
 */
function recordRepetition({ lift, velocity, rpe }) {
  const repLift = canonicalLift(lift);

  // Auto-start workout session if idle
  if (!activeWorkout) {
    startWorkoutSession();
  }

  // A rep performed under a different lift never lands in the open set:
  // that set is saved under its original lift and a fresh set starts for the new lift.
  if (activeSet && !sameLift(activeSet.lift, repLift)) {
    endActiveSet();
  }

  // Synchronously align active lift theme if the incoming rep is for a different lift
  if (!sameLift(currentLift, repLift)) {
    applyLiftTheme(repLift);
  }

  // Auto-start set if idle (never drop bar data)
  if (!activeSet) {
    startNewSet(repLift);
  }

  const repNumber = activeSet.reps.length + 1;
  const repObj = {
    repNumber: repNumber,
    lift: repLift,
    velocity: velocity,
    rpe: rpe,
    timestamp: Date.now(),
    isPR: false
  };

  activeSet.reps.push(repObj);
  recalculateSetMetrics(activeSet);

  persistStorage();

  // Play rep chime and trigger light haptic pulse
  SoundFX.playRepChime(velocity, rpe);
  HapticsFX.vibrate([35]);

  // Check if rep meets or exceeds target RPE for this set
  const effectiveTarget = (activeSet && typeof activeSet.targetRpe === 'number') ? activeSet.targetRpe : currentTargetRpe;
  if (typeof rpe === 'number' && rpe >= effectiveTarget) {
    SoundFX.playTargetReached();
    HapticsFX.vibrate([60, 40, 80]);
    triggerTargetReachedAlert();
  }

  // Reactively update RPE Hero Banner, Current Set Card, and Workout Sets Table on repetition recording
  updateRpeHeroBanner(rpe);
  updateSetUI(activeSet);
  updateLiveMiniHud();
  updateHistoryStats();

  // Asynchronous UI Dispatch (Non-blocking Observability)
  requestAnimationFrame(() => {
    updateLiveDisplay(repObj, true);
  });
}

/**
 * Computes Avg Velocity, Max Velocity, Min Velocity, Velocity Loss %, and Avg RPE
 */
function recalculateSetMetrics(set) {
  if (!set || set.reps.length === 0) {
    set.avgVelocity = 0.0;
    set.maxVelocity = 0.0;
    set.minVelocity = 0.0;
    set.velocityLossPct = 0.0;
    set.avgRpe = 0.0;
    return;
  }

  const vels = set.reps.map(r => r.velocity);
  const rpes = set.reps.map(r => r.rpe);

  const sumV = vels.reduce((a, b) => a + b, 0);
  const sumR = rpes.reduce((a, b) => a + b, 0);

  const maxV = Math.max(...vels);
  const minV = Math.min(...vels);
  const lastV = vels[vels.length - 1];

  set.avgVelocity = parseFloat((sumV / vels.length).toFixed(2));
  set.maxVelocity = parseFloat(maxV.toFixed(2));
  set.minVelocity = parseFloat(minV.toFixed(2));
  set.avgRpe      = parseFloat((sumR / rpes.length).toFixed(1));

  // Velocity Loss Calculation: ((Max - Last) / Max) * 100
  if (maxV > 0) {
    const loss = ((maxV - lastV) / maxV) * 100;
    set.velocityLossPct = parseFloat(Math.max(0, loss).toFixed(1));
  } else {
    set.velocityLossPct = 0.0;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. BLUETOOTH CONNECTION ENGINE
// ═════════════════════════════════════════════════════════════════════════════

function resetBleSheetDragTransform() {
  if (bleSearchSheet) {
    bleSearchSheet.classList.remove('dragging');
  }
  if (bleSearchContent) {
    bleSearchContent.style.transform = '';
    bleSearchContent.style.webkitTransform = '';
  }
  if (bleSearchBackdrop) {
    bleSearchBackdrop.style.opacity = '';
  }
}

// Connection Sheet Open / Close Helpers
function openBleSearchSheet() {
  if (bleSearchSheet) {
    resetBleSheetDragTransform();
    bleSearchSheet.classList.add('open');
    bleSearchSheet.setAttribute('aria-hidden', 'false');
    SoundFX.playBleSearchPing();
    HapticsFX.vibrate([12]);
    if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) {
      if (bleSearchStatusText) bleSearchStatusText.innerHTML = 'Connected to <span class="eros-wordmark">Eros</span>';
    } else {
      if (bleSearchStatusText) bleSearchStatusText.innerHTML = 'Ready to connect to <span class="eros-wordmark">Eros</span>';
    }
  }
}

function closeBleSearchSheet() {
  if (bleSearchSheet) {
    const wasOpen = bleSearchSheet.classList.contains('open');
    resetBleSheetDragTransform();
    bleSearchSheet.classList.remove('open');
    bleSearchSheet.setAttribute('aria-hidden', 'true');
    if (wasOpen) {
      HapticsFX.vibrate([10]);
    }
  }
}

/**
 * Enables slide-down / drag-to-dismiss interaction on the Eros connection sheet
 * (#ble-drag-zone: handle + header).
 * Follows finger 1:1 downwards; dismisses past 35% height or fast downward flick,
 * and springs back to open otherwise.
 */
function initBleSheetDrag() {
  const dragZone = bleDragZone || document.getElementById('ble-drag-zone');
  if (!dragZone || initBleSheetDrag._initialized) return;
  initBleSheetDrag._initialized = true;

  let isDragging = false;
  let activeInputType = null;
  let lastHandledEvent = null;
  let startY = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocityY = 0;
  let currentDeltaY = 0;

  const isInteractiveIgnore = (target) => {
    return Boolean(target && target.closest && target.closest('#btn-close-ble-search'));
  };

  const beginDrag = (clientY, target, inputType) => {
    if (!bleSearchSheet || !bleSearchSheet.classList.contains('open')) return false;
    if (isInteractiveIgnore(target)) return false;
    if (isDragging && activeInputType && activeInputType !== inputType) return false;
    isDragging = true;
    activeInputType = inputType;
    startY = clientY;
    lastY = clientY;
    lastTime = performance.now();
    velocityY = 0;
    currentDeltaY = 0;
    bleSearchSheet.classList.add('dragging');
    return true;
  };

  const moveDrag = (clientY) => {
    if (!isDragging || !bleSearchContent) return;
    const now = performance.now();
    const dt = now - lastTime;
    const dyStep = clientY - lastY;
    if (dyStep !== 0) {
      const instVel = dyStep / Math.max(1, dt); // px per ms (positive = downward)
      velocityY = velocityY === 0 ? instVel : (velocityY * 0.35 + instVel * 0.65);
      lastTime = now;
    } else if (dt > 60) {
      velocityY = 0;
      lastTime = now;
    }
    lastY = clientY;

    currentDeltaY = Math.max(0, clientY - startY);
    const translateStr = `translate3d(0, ${currentDeltaY}px, 0)`;
    bleSearchContent.style.transform = translateStr;
    bleSearchContent.style.webkitTransform = translateStr;

    if (bleSearchBackdrop) {
      const sheetHeight = bleSearchContent.offsetHeight || 320;
      const fadeRatio = Math.max(0.2, 1 - (currentDeltaY / (sheetHeight * 1.15)));
      bleSearchBackdrop.style.opacity = String(fadeRatio.toFixed(3));
    }
  };

  const finishDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    activeInputType = null;
    if (bleSearchSheet) {
      bleSearchSheet.classList.remove('dragging');
    }

    const sheetHeight = (bleSearchContent && bleSearchContent.offsetHeight) || 320;
    const dismissThreshold = sheetHeight * 0.35;
    const isFastFlickDown = velocityY > 0.65 && currentDeltaY > 24;

    if (currentDeltaY > dismissThreshold || isFastFlickDown) {
      closeBleSearchSheet();
    } else {
      resetBleSheetDragTransform();
    }
    currentDeltaY = 0;
    velocityY = 0;
  };

  // Pointer Events
  dragZone.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (beginDrag(e.clientY, e.target, 'pointer')) {
      if (dragZone.setPointerCapture && e.pointerId !== undefined) {
        try { dragZone.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }
  });

  const onPointerMove = (e) => {
    if (!isDragging || activeInputType !== 'pointer' || e === lastHandledEvent) return;
    lastHandledEvent = e;
    moveDrag(e.clientY);
  };

  const onPointerEnd = (e) => {
    if (!isDragging || activeInputType !== 'pointer' || e === lastHandledEvent) return;
    lastHandledEvent = e;
    finishDrag();
  };

  dragZone.addEventListener('pointermove', onPointerMove);
  dragZone.addEventListener('pointerup', onPointerEnd);
  dragZone.addEventListener('pointercancel', onPointerEnd);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);

  // Touch Events fallback
  dragZone.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length === 0) return;
    beginDrag(e.touches[0].clientY, e.target, 'touch');
  }, { passive: true });

  const onTouchMove = (e) => {
    if (!isDragging || activeInputType !== 'touch' || e === lastHandledEvent || !e.touches || e.touches.length === 0) return;
    lastHandledEvent = e;
    moveDrag(e.touches[0].clientY);
  };

  const onTouchEnd = (e) => {
    if (!isDragging || activeInputType !== 'touch' || e === lastHandledEvent) return;
    lastHandledEvent = e;
    finishDrag();
  };

  dragZone.addEventListener('touchmove', onTouchMove, { passive: true });
  dragZone.addEventListener('touchend', onTouchEnd, { passive: true });
  dragZone.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
}

if (bleDragZone) {
  initBleSheetDrag();
}

if (statusBadge) {
  statusBadge.addEventListener('click', () => {
    openBleSearchSheet();
  });
  statusBadge.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openBleSearchSheet();
    }
  });
}

if (btnCloseBleSearch) {
  btnCloseBleSearch.addEventListener('click', closeBleSearchSheet);
}
if (bleSearchBackdrop) {
  bleSearchBackdrop.addEventListener('click', closeBleSearchSheet);
}

// Escape key to dismiss Bluetooth search sheet
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && bleSearchSheet && bleSearchSheet.classList.contains('open')) {
    closeBleSearchSheet();
  }
});

if (bleDeviceCard) {
  bleDeviceCard.addEventListener('click', async () => {
    if (!bleDevice || !bleDevice.gatt.connected) {
      await connectBLE();
    }
  });
}

// Target RPE Configuration Handlers
function setTargetRpe(val, triggerFeedback = false) {
  const num = parseFloat(val);
  if (isNaN(num)) return;
  currentTargetRpe = Math.max(6.0, Math.min(10.0, parseFloat(num.toFixed(1))));

  if (triggerFeedback) {
    SoundFX.playStepperTick();
    HapticsFX.vibrate([15]);
  }

  if (targetRpeDisplay) {
    targetRpeDisplay.textContent = currentTargetRpe.toFixed(1);
    targetRpeDisplay.style.transform = 'scale(1.2)';
    setTimeout(() => {
      if (targetRpeDisplay) targetRpeDisplay.style.transform = 'scale(1)';
    }, 150);
  }

  // Update quick chips
  targetChips.forEach(chip => {
    const chipRpe = parseFloat(chip.getAttribute('data-rpe'));
    if (Math.abs(chipRpe - currentTargetRpe) < 0.1) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  // Slide target pin on live effort gauge
  if (rpeTargetPin) {
    const targetPercent = Math.max(0, Math.min(100, (currentTargetRpe / 10) * 100));
    rpeTargetPin.style.left = `${targetPercent}%`;
    rpeTargetPin.classList.add('pin-moving');
    setTimeout(() => {
      if (rpeTargetPin) rpeTargetPin.classList.remove('pin-moving');
    }, 350);
    const targetText = rpeTargetPin.querySelector('.target-text');
    if (targetText) {
      targetText.textContent = `TARGET ${currentTargetRpe.toFixed(1)}`;
    }
  }

  // Sync with active set if ongoing
  if (activeSet) {
    activeSet.targetRpe = currentTargetRpe;
    persistStorage();
  }
}

function triggerTargetReachedAlert() {
  if (targetRpeModule) {
    targetRpeModule.classList.remove('target-reached-active');
    void targetRpeModule.offsetWidth;
    targetRpeModule.classList.add('target-reached-active');
    setTimeout(() => {
      if (targetRpeModule) targetRpeModule.classList.remove('target-reached-active');
    }, 3500);
  }

  if (rpeHeroCard) {
    rpeHeroCard.classList.remove('target-reached-pulse');
    void rpeHeroCard.offsetWidth;
    rpeHeroCard.classList.add('target-reached-pulse');
    setTimeout(() => {
      if (rpeHeroCard) rpeHeroCard.classList.remove('target-reached-pulse');
    }, 3500);
  }
}

if (btnTargetRpeDec) {
  btnTargetRpeDec.addEventListener('click', () => {
    setTargetRpe(currentTargetRpe - 0.5, true);
  });
}
if (btnTargetRpeInc) {
  btnTargetRpeInc.addEventListener('click', () => {
    setTargetRpe(currentTargetRpe + 0.5, true);
  });
}

targetChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const r = chip.getAttribute('data-rpe');
    if (r) setTargetRpe(parseFloat(r), true);
  });
});

btnConnect.addEventListener('click', async () => {
  if (bleDevice && bleDevice.gatt.connected) {
    disconnectBLE();
    return;
  }
  await connectBLE();
});

async function connectBLE() {
  try {
    btnConnectText.textContent = 'SCANNING…';
    btnConnect.disabled = true;
    if (bleSearchStatusText) bleSearchStatusText.innerHTML = 'Searching for <span class="eros-wordmark">Eros</span>…';
    SoundFX.playBleSearchPing();

    // Standard Web Bluetooth API Request (explicit user gesture)
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: DEVICE_NAME }],
      optionalServices: [SERVICE_UUID]
    });

    bleDevice.addEventListener('gattserverdisconnected', onBLEDisconnected);

    const server  = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    // Data Characteristic for rep telemetry
    dataCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    // Dedicated Command Characteristic for lift profile switching
    try {
      cmdCharacteristic = await service.getCharacteristic(CMD_CHARACTERISTIC_UUID);
      console.log('[Eros] Command Characteristic bound successfully.');
    } catch (cmdErr) {
      console.warn('[Eros] Command characteristic not discovered, using data characteristic fallback:', cmdErr);
      cmdCharacteristic = dataCharacteristic;
    }

    // Subscribe to rep notifications
    await dataCharacteristic.startNotifications();
    dataCharacteristic.addEventListener('characteristicvaluechanged', handleIncomingBLEData);

    console.log('[Eros] Subscribed to telemetry notifications.');
    setConnectedUI(true);
    SoundFX.playBleConnected();
    HapticsFX.vibrate([40, 20, 50]);
    if (bleSearchStatusText) bleSearchStatusText.innerHTML = 'Connected to <span class="eros-wordmark">Eros</span>';
    setTimeout(() => {
      closeBleSearchSheet();
    }, 1200);

    // Sync current active lift profile with Eros
    await sendLiftCommand(currentLift);

  } catch (err) {
    console.error('[Eros] Bluetooth connection error:', err);
    setConnectedUI(false);
    const errMsg = (err && err.message) ? err.message : 'Check Eros connection';
    if (bleSearchStatusText) {
      if (err && err.message) {
        bleSearchStatusText.textContent = `Connection error: ${err.message}`;
      } else {
        bleSearchStatusText.innerHTML = 'Connection error: Check <span class="eros-wordmark">Eros</span> connection';
      }
    }
    showBanner(`Connection error: ${errMsg}`);
  }
}

function disconnectBLE() {
  if (dataCharacteristic) {
    try {
      dataCharacteristic.removeEventListener('characteristicvaluechanged', handleIncomingBLEData);
    } catch (e) { /* ignore */ }
    dataCharacteristic = null;
  }
  cmdCharacteristic = null;

  if (bleDevice && bleDevice.gatt.connected) {
    bleDevice.gatt.disconnect();
  }
  bleDevice = null;
  setConnectedUI(false);
  SoundFX.playBleDisconnected();
  if (bleSearchStatusText) bleSearchStatusText.innerHTML = 'Ready to connect to <span class="eros-wordmark">Eros</span>';
}

function onBLEDisconnected() {
  console.warn('[Eros] BLE disconnected.');
  dataCharacteristic = null;
  cmdCharacteristic = null;
  setConnectedUI(false);
  SoundFX.playBleDisconnected();
  if (bleSearchStatusText) bleSearchStatusText.innerHTML = '<span class="eros-wordmark">Eros</span> disconnected.';
  showBanner('Eros disconnected.');
}

/**
 * Safe, robust parser for incoming telemetry payload:
 * Format: "Lift Name | 0.45 m/s | RPE: 8.5"
 */
function handleIncomingBLEData(event) {
  try {
    const rawValue = event.target.value;
    const text = new TextDecoder('utf-8').decode(rawValue).trim();
    console.log('[Eros BLE Payload]:', text);

    if (!text || !text.includes('|')) return;

    const parts = text.split('|').map(s => s.trim());
    if (parts.length < 3) return;

    const lift = parts[0];
    const velMatch = parts[1].match(/([\d.]+)/);
    const rpeMatch = parts[2].match(/([\d.]+)/);

    if (!velMatch || !rpeMatch) return;

    const velocity = parseFloat(velMatch[1]);
    const rpe      = parseFloat(rpeMatch[1]);

    if (isNaN(velocity) || isNaN(rpe)) return;

    // Dispatch to nested data hierarchy
    recordRepetition({ lift, velocity, rpe });

  } catch (err) {
    console.warn('[Eros] Failed to parse BLE frame:', err);
  }
}

/**
 * Transmits lift change command to Eros
 */
async function sendLiftCommand(liftName) {
  if (!cmdCharacteristic) return;

  const key = liftName.toLowerCase();
  const baseline = LIFT_BASELINES[key] || LIFT_BASELINES.deadlift;
  const cmdString = baseline.cmd;

  try {
    const encoded = new TextEncoder().encode(cmdString);
    if (cmdCharacteristic.writeValueWithoutResponse) {
      await cmdCharacteristic.writeValueWithoutResponse(encoded);
    } else {
      await cmdCharacteristic.writeValue(encoded);
    }
    console.log(`[Eros] Dispatched command: ${cmdString}`);
    clearBanner();
  } catch (err) {
    console.error('[Eros] Failed to write command characteristic:', err);
    showBanner('Sync failed: could not switch barbell profile');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. VISUALS, GLASS OS THEMING & PHYSICS ANIMATIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Dropdown lift selector handler
 */
function toggleDropdown(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  liftSelectWrapper.classList.toggle('open');
}

selectTrigger.addEventListener('click', toggleDropdown);

document.addEventListener('click', (e) => {
  if (!liftSelectWrapper.contains(e.target)) {
    liftSelectWrapper.classList.remove('open');
  }
});

customOptions.forEach(opt => {
  const handleSelect = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const val = opt.getAttribute('data-value');
    applyLiftTheme(val);
    liftSelectWrapper.classList.remove('open');
    await sendLiftCommand(val);
  };
  opt.addEventListener('click', handleSelect);
});

/**
 * Updates active lift theme and movement denomination.
 * If a set is currently active under a different lift, automatically ends & saves
 * that set under its original lift so subsequent sets start under the new lift.
 */
function applyLiftTheme(liftName) {
  const nextLift = canonicalLift(liftName || 'Deadlift');

  if (activeSet && !sameLift(activeSet.lift, nextLift)) {
    endActiveSet();
  }

  currentLift = nextLift;
  if (selectedLiftText) selectedLiftText.textContent = nextLift.toUpperCase();
  document.body.className = `theme-${nextLift.toLowerCase()}`;

  customOptions.forEach(o => o.classList.remove('selected'));
  const targetOpt = Array.from(customOptions).find(o => sameLift(o.getAttribute('data-value'), nextLift));
  if (targetOpt) targetOpt.classList.add('selected');

  // Update MVT baseline subtext
  const baseline = LIFT_BASELINES[nextLift.toLowerCase()] || LIFT_BASELINES.deadlift;
  if (liveRpeSub) {
    liveRpeSub.textContent = `MVT Baseline: ${baseline.mvt.toFixed(2)} m/s`;
  }

  // Keep Current Set card denomination synced and clear stale set reps when idle between sets
  if (!activeSet) {
    updateSetUI(null);
  } else {
    updateWorkoutPage();
  }
}

/**
 * Reactively updates Live Page RPE Hero Banner components & effort tier
 */
function updateRpeHeroBanner(rpe) {
  const card = rpeHeroCard || document.getElementById('rpe-hero-card');
  const rpeEl = liveRpe || document.getElementById('live-rpe');
  const rirEl = liveRirPill || document.getElementById('live-rir-pill');
  const badge = rpeTierBadge || document.getElementById('rpe-tier-badge');
  const fill = rpeGaugeFill || document.getElementById('rpe-gauge-fill');

  const numRpe = (typeof rpe === 'number' && !isNaN(rpe)) ? rpe : (parseFloat(rpe) || 0.0);

  if (rpeEl) {
    rpeEl.textContent = numRpe.toFixed(1);
  }

  // RIR = Math.max(0, 10 - rpe).toFixed(1)
  const rir = Math.max(0, 10 - numRpe).toFixed(1);
  if (rirEl) {
    rirEl.textContent = `RIR: ${rir}`;
  }

  // Effort gauge percentage: 0-100% width
  const gaugePercent = Math.max(0, Math.min(100, (numRpe / 10) * 100));
  if (fill) {
    fill.style.width = `${gaugePercent}%`;
  }

  // Toggle tier classes on #rpe-hero-card
  if (card) {
    card.classList.remove('tier-warmup', 'tier-target', 'tier-heavy', 'tier-max');
    if (numRpe < 7.5) {
      card.classList.add('tier-warmup');
      if (badge) badge.textContent = 'WARMUP';
    } else if (numRpe <= 8.4) {
      card.classList.add('tier-target');
      if (badge) badge.textContent = 'TARGET ZONE';
    } else if (numRpe <= 9.4) {
      card.classList.add('tier-heavy');
      if (badge) badge.textContent = 'HEAVY EFFORT';
    } else {
      card.classList.add('tier-max');
      if (badge) badge.textContent = 'MAXIMAL / FAILURE';
    }
  }
}

/**
 * Updates Live Telemetry display and fires bar path physics animation
 */
function updateLiveDisplay({ lift, velocity, rpe }, fromRepStream = false) {
  if (liveVelocity) liveVelocity.textContent = velocity.toFixed(2);
  if (liveRpe) liveRpe.textContent           = rpe.toFixed(1);
  if (liveVelSub) liveVelSub.textContent     = `Rep Completed: ${velocity >= 0.5 ? 'Explosive' : 'Grinding'}`;

  // Update Peak Velocity Hero Metric (Mean and Peak as Main Focus)
  const currentPeak = activeSet && activeSet.maxVelocity > 0 ? activeSet.maxVelocity : velocity;
  if (livePeakVel) {
    livePeakVel.textContent = currentPeak.toFixed(2);
  }
  if (livePeakSub) {
    livePeakSub.textContent = activeSet ? `Set ${activeSet.setNumber} Peak: ${currentPeak.toFixed(2)} m/s` : `Bar Ascent Peak: ${currentPeak.toFixed(2)} m/s`;
  }

  // Reactively update RPE Hero Banner on live display
  updateRpeHeroBanner(rpe);

  // If incoming rep has different lift (when called directly outside recordRepetition), sync UI
  if (!fromRepStream && currentLift.toLowerCase() !== lift.toLowerCase()) {
    applyLiftTheme(lift);
  }

  // Physics animation timing based on velocity
  // Distance / Velocity gives duration; scaled for bidirectional path
  let duration = (0.5 / Math.max(velocity, 0.1)) * 2;
  duration = Math.max(0.5, Math.min(duration, 5.0)); // Clamp 0.5s - 5.0s
  document.documentElement.style.setProperty('--rep-duration', `${duration.toFixed(2)}s`);

  // Animate Barbell Orb
  orb.classList.add('active');
  orb.style.animation = 'none';
  void orb.offsetWidth; // Force CSS reflow
  const animName = `${lift.toLowerCase()}-rep`;
  orb.style.animation = `${animName} var(--rep-duration) cubic-bezier(0.25, 1, 0.5, 1) forwards`;

  // Dynamic Apex Bloom Pop
  // Deadlift reaches zenith at midpoint; Squat/Bench at peak ascent
  const isDeadlift = lift.toLowerCase() === 'deadlift';
  const apexDelayMs = isDeadlift ? (duration * 1000) / 2 : (duration * 1000) * 0.95;

  const startTime = performance.now();
  const checkApexBloom = (now) => {
    if (now - startTime >= apexDelayMs) {
      apexGlow.classList.remove('bloom-active');
      void apexGlow.offsetWidth;
      apexGlow.classList.add('bloom-active');
    } else {
      requestAnimationFrame(checkApexBloom);
    }
  };
  requestAnimationFrame(checkApexBloom);
}

/**
 * Updates the Live tab mini HUD
 */
function updateLiveMiniHud() {
  if (activeSet) {
    hudActiveSet.textContent = `Set ${activeSet.setNumber}`;
    hudSetReps.textContent   = `${activeSet.reps.length}`;
    hudVelLoss.textContent   = `${activeSet.velocityLossPct.toFixed(1)}%`;
  } else {
    hudActiveSet.textContent = activeWorkout ? `Set ${activeWorkout.sets.length}` : 'Set 0';
    hudSetReps.textContent   = '0';
    hudVelLoss.textContent   = '0.0%';
  }
}

/**
 * Renders the Workout Tab summary card and all sets of the workout
 * tagged with their movement denomination (Deadlift, Squat, Bench).
 */
function updateWorkoutPage() {
  const statusEl = workoutSummaryStatus || document.getElementById('workout-summary-status');
  const setsEl   = workoutSumSets || document.getElementById('workout-sum-sets');
  const repsEl   = workoutSumReps || document.getElementById('workout-sum-reps');
  const avgEl    = workoutSumAvgVel || document.getElementById('workout-sum-avg-vel');
  const peakEl   = workoutSumPeakVel || document.getElementById('workout-sum-peak-vel');
  const tableEl  = workoutSetsTable || document.getElementById('workout-sets-table');
  const countEl  = workoutSetsCounter || document.getElementById('workout-sets-counter');

  const session = activeWorkout;
  const sets = (session && Array.isArray(session.sets)) ? session.sets : [];

  if (!session) {
    if (statusEl) statusEl.textContent = 'No active workout';
    if (setsEl) setsEl.textContent = '0';
    if (repsEl) repsEl.textContent = '0';
    if (avgEl) avgEl.textContent = '-';
    if (peakEl) peakEl.textContent = '-';
    if (countEl) countEl.textContent = '0 sets';
    if (tableEl) {
      tableEl.innerHTML = '<div class="empty-state">No sets recorded in this workout yet.</div>';
    }
    return;
  }

  let totalReps = 0;
  let sumVel = 0;
  let maxVel = 0;
  sets.forEach(s => {
    const reps = Array.isArray(s.reps) ? s.reps : [];
    totalReps += reps.length;
    reps.forEach(r => {
      if (typeof r.velocity === 'number') {
        sumVel += r.velocity;
        if (r.velocity > maxVel) maxVel = r.velocity;
      }
    });
  });

  if (statusEl) {
    statusEl.textContent = activeSet
      ? `Set ${activeSet.setNumber} Active • ${canonicalLift(activeSet.lift)}`
      : `Active Workout • ${sets.length} ${sets.length === 1 ? 'Set' : 'Sets'}`;
  }
  if (setsEl) setsEl.textContent = String(sets.length);
  if (repsEl) repsEl.textContent = String(totalReps);
  if (avgEl) avgEl.textContent = totalReps > 0 ? (sumVel / totalReps).toFixed(2) : '-';
  if (peakEl) peakEl.textContent = totalReps > 0 ? maxVel.toFixed(2) : '-';
  if (countEl) countEl.textContent = `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`;

  if (!tableEl) return;
  if (sets.length === 0) {
    tableEl.innerHTML = '<div class="empty-state">No sets recorded in this workout yet.</div>';
    return;
  }

  let rowsHtml = '';
  sets.forEach(s => {
    const setLift = canonicalLift(s.lift || currentLift);
    const liftKey = liftKeyOf(setLift);
    const repCount = Array.isArray(s.reps) ? s.reps.length : 0;
    const isCurrent = Boolean(activeSet && activeSet.setId === s.setId);
    const avgV = repCount > 0 ? s.avgVelocity.toFixed(2) : '-';
    const maxV = repCount > 0 ? s.maxVelocity.toFixed(2) : '-';
    const avgR = repCount > 0 ? s.avgRpe.toFixed(1) : '-';

    rowsHtml += `
      <div class="workout-set-row ${isCurrent ? 'is-active-set' : ''}" data-set-number="${s.setNumber}" data-lift="${liftKey}">
        <div class="workout-set-row-left">
          <span class="workout-set-num">SET ${s.setNumber}</span>
          <span class="lift-tag" data-lift="${liftKey}">${escapeHtml(setLift.toUpperCase())}</span>
          <span class="workout-set-reps">${repCount} ${repCount === 1 ? 'rep' : 'reps'}</span>
        </div>
        <div class="workout-set-row-right">
          <div class="workout-set-metric">
            <span class="workout-set-metric-val">${avgV}${repCount > 0 ? ' m/s' : ''}</span>
            <span class="workout-set-metric-lbl">AVG</span>
          </div>
          <div class="workout-set-metric">
            <span class="workout-set-metric-val">${maxV}${repCount > 0 ? ' m/s' : ''}</span>
            <span class="workout-set-metric-lbl">PEAK</span>
          </div>
          <div class="workout-set-metric">
            <span class="workout-set-metric-val">${avgR}</span>
            <span class="workout-set-metric-lbl">RPE</span>
          </div>
        </div>
      </div>
    `;
  });
  tableEl.innerHTML = rowsHtml;
}

let activeRepPressCancel = null;

/**
 * Updates the Workout Tab Current Set card (Ring, Stats Grid, Reps Table)
 */
function updateSetUI(set) {
  if (typeof activeRepPressCancel === 'function') {
    activeRepPressCancel();
    activeRepPressCancel = null;
  }

  const effectiveLift = canonicalLift((set && set.lift) ? set.lift : currentLift);
  const effectiveLiftKey = liftKeyOf(effectiveLift);

  if (!set || set.reps.length === 0) {
    const nextSetNum = set ? set.setNumber : (activeWorkout && Array.isArray(activeWorkout.sets) ? activeWorkout.sets.length + 1 : 1);
    setBadgeLabel.textContent = `SET ${nextSetNum}`;
    setLiftName.textContent   = effectiveLift.toUpperCase();
    setLiftName.setAttribute('data-lift', effectiveLiftKey);
    setRepCounter.textContent = '0 REPS RECORDED';
    setAvgVel.textContent     = '-';
    setMaxVel.textContent     = '-';
    setVelLoss.textContent    = '-';
    setAvgRpe.textContent     = '-';
    setMinVel.textContent     = '-';
    activeSetRepCounter.textContent = '0 reps';

    // Reset ring (circumference = 565.48)
    if (setRingProgress) setRingProgress.style.strokeDashoffset = '565.48';

    activeSetRepsList.innerHTML = '<div class="empty-state">No reps recorded in this set yet. Lift the barbell to record.</div>';
    updateWorkoutPage();
    return;
  }

  setBadgeLabel.textContent = `SET ${set.setNumber}`;
  setLiftName.textContent   = effectiveLift.toUpperCase();
  setLiftName.setAttribute('data-lift', effectiveLiftKey);
  setRepCounter.textContent = `${set.reps.length} ${set.reps.length === 1 ? 'REP' : 'REPS'} RECORDED`;
  activeSetRepCounter.textContent = `${set.reps.length} reps`;

  setAvgVel.textContent  = set.avgVelocity.toFixed(2);
  setMaxVel.textContent  = set.maxVelocity.toFixed(2);
  setVelLoss.textContent = `${set.velocityLossPct.toFixed(1)}`;
  setAvgRpe.textContent  = set.avgRpe.toFixed(1);
  setMinVel.textContent  = set.minVelocity.toFixed(2);

  // SVG Progress Ring (circumference = 2 * pi * 90 = 565.48)
  if (setRingProgress) {
    const maxScale = 1.0; // 1.0 m/s is 100% fill
    const fillRatio = Math.min(Math.max(set.avgVelocity / maxScale, 0), 1);
    const offset = 565.48 - (565.48 * fillRatio);
    setRingProgress.style.strokeDashoffset = offset.toFixed(1);
  }

  // Render Reps Table
  let html = '';
  const reversedReps = set.reps.slice().reverse();
  reversedReps.forEach((rep, idx) => {
    const isLatest = (idx === 0);
    const timeStr = new Date(rep.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isPR = Boolean(rep.isPR);
    const repLift = canonicalLift(rep.lift || effectiveLift);
    const repLiftKey = liftKeyOf(repLift);
    const prBadgeHtml = isPR ? '<span class="rep-pr-badge gold-glow">PR</span>' : '';
    const progressRingHtml = isLatest
      ? `<div class="rep-press-progress-ring" aria-hidden="true"><svg class="radial-progress-svg" viewBox="0 0 44 44"><circle class="radial-track" cx="22" cy="22" r="18" /><circle class="radial-indicator" cx="22" cy="22" r="18" /></svg></div>`
      : '';

    html += `
      <div class="rep-row-item ${isPR ? 'is-pr' : ''}" data-rep-number="${rep.repNumber}" data-lift="${repLiftKey}" ${isLatest ? 'data-is-latest="true"' : ''}>
        ${progressRingHtml}
        <div class="rep-row-left">
          <span class="rep-num-badge">#${rep.repNumber}</span>
          <span class="lift-tag rep-lift-tag" data-lift="${repLiftKey}">${escapeHtml(repLift.toUpperCase())}</span>
          <span class="rep-row-time">${timeStr}</span>
          ${prBadgeHtml}
        </div>
        <div class="rep-row-right">
          <span class="rep-vel-pill">${rep.velocity.toFixed(2)} m/s</span>
          <span class="rep-rpe-pill">RPE ${rep.rpe.toFixed(1)}</span>
        </div>
      </div>
    `;
  });
  activeSetRepsList.innerHTML = html;
  updateWorkoutPage();

  // Attach 500ms long-press listeners on the latest repetition element
  const latestEl = activeSetRepsList.querySelector('.rep-row-item');
  if (latestEl && set.reps.length > 0) {
    const rep = set.reps[set.reps.length - 1];
    let pressTimer = null;
    let startX = 0;
    let startY = 0;
    let isHolding = false;
    const LONG_PRESS_MS = 500;

    const abortHold = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      if (isHolding) {
        isHolding = false;
        latestEl.classList.remove('press-holding');
      }
    };
    activeRepPressCancel = abortHold;

    latestEl.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      startX = e.clientX;
      startY = e.clientY;
      isHolding = true;
      latestEl.classList.add('press-holding');
      SoundFX.playLongPressHold(0.2);

      pressTimer = setTimeout(() => {
        isHolding = false;
        latestEl.classList.remove('press-holding');
        pressTimer = null;
        if (!latestEl.isConnected || set.endTime || (activeSet && activeSet !== set)) return;

        // Haptic feedback & celebration fanfare
        HapticsFX.vibrate([40, 30, 60]);
        SoundFX.playPrFanfare();

        // Toggle rep.isPR boolean state
        rep.isPR = !rep.isPR;
        persistStorage();

        // Update UI
        updateSetUI(set);
        renderHistoryView();
      }, LONG_PRESS_MS);
    });

    latestEl.addEventListener('pointermove', (e) => {
      if (!isHolding) return;
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist > 10) {
        abortHold();
      }
    });

    latestEl.addEventListener('pointerup', abortHold);
    latestEl.addEventListener('pointercancel', abortHold);
    latestEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. HISTORY TAB, PR DASHBOARD & OFFICIAL DOTS CALCULATOR (R4)
// ═════════════════════════════════════════════════════════════════════════════

const defaultPrProfile = {
  version: 1,
  bodyweight: 80.0,
  gender: 'male',
  currentPRs: {
    squat: 140.0,
    bench: 100.0,
    deadlift: 180.0
  },
  compPRs: {
    squat: 150.0,
    bench: 105.0,
    deadlift: 190.0
  },
  activeDotsSource: 'current'
};

let prProfile = JSON.parse(JSON.stringify(defaultPrProfile));

/**
 * Loads athlete PR profile and DOTS preferences from localStorage under vbt_pr_data_v1
 */
function loadPrProfile() {
  try {
    const raw = localStorage.getItem(PR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        prProfile = {
          version: parsed.version || 1,
          bodyweight: typeof parsed.bodyweight === 'number' && parsed.bodyweight > 0 ? parsed.bodyweight : defaultPrProfile.bodyweight,
          gender: parsed.gender === 'female' ? 'female' : 'male',
          currentPRs: {
            squat: parsed.currentPRs && typeof parsed.currentPRs.squat === 'number' ? parsed.currentPRs.squat : defaultPrProfile.currentPRs.squat,
            bench: parsed.currentPRs && typeof parsed.currentPRs.bench === 'number' ? parsed.currentPRs.bench : defaultPrProfile.currentPRs.bench,
            deadlift: parsed.currentPRs && typeof parsed.currentPRs.deadlift === 'number' ? parsed.currentPRs.deadlift : defaultPrProfile.currentPRs.deadlift
          },
          compPRs: {
            squat: parsed.compPRs && typeof parsed.compPRs.squat === 'number' ? parsed.compPRs.squat : defaultPrProfile.compPRs.squat,
            bench: parsed.compPRs && typeof parsed.compPRs.bench === 'number' ? parsed.compPRs.bench : defaultPrProfile.compPRs.bench,
            deadlift: parsed.compPRs && typeof parsed.compPRs.deadlift === 'number' ? parsed.compPRs.deadlift : defaultPrProfile.compPRs.deadlift
          },
          activeDotsSource: parsed.activeDotsSource === 'comp' ? 'comp' : 'current'
        };
      }
    }
  } catch (err) {
    console.warn('[Eros] Failed to parse PR storage; restoring default athlete profile:', err);
    prProfile = JSON.parse(JSON.stringify(defaultPrProfile));
  }
}

/**
 * Persists athlete PR loads, bodyweight, gender, and source preference to vbt_pr_data_v1
 */
function persistPrProfile() {
  try {
    localStorage.setItem(PR_STORAGE_KEY, JSON.stringify(prProfile));
  } catch (err) {
    console.error('[Eros] Failed to persist athlete PR profile to localStorage:', err);
  }
}

/**
 * Official IPF DOTS 4th-order polynomial coefficients (2019 standard)
 */
const DOTS_COEFFICIENTS = {
  male: {
    a: -0.0000010930,
    b: 0.0007391293,
    c: -0.1918759221,
    d: 24.0900756,
    e: -307.75076
  },
  female: {
    a: -0.0000010706,
    b: 0.0005158568,
    c: -0.1126655495,
    d: 13.6175032,
    e: -57.96288
  }
};

/**
 * Calculates official powerlifting DOTS score using 4th-degree polynomial.
 * Formula: DOTS = Total * (500 / (a*BW^4 + b*BW^3 + c*BW^2 + d*BW + e))
 * @param {number} totalKg - Total 1RM load in kilograms
 * @param {number} bodyweightKg - Athlete bodyweight in kilograms
 * @param {'male'|'female'} gender - Athlete sex
 * @returns {number} Rounded DOTS score to 2 decimal places
 */
function calculateDotsScore(totalKg, bodyweightKg, gender = 'male') {
  const total = Number(totalKg);
  const bw = Number(bodyweightKg);

  if (isNaN(total) || isNaN(bw) || total <= 0 || bw <= 0) {
    return 0.0;
  }

  const gKey = String(gender).toLowerCase() === 'female' ? 'female' : 'male';
  const { a, b, c, d, e } = DOTS_COEFFICIENTS[gKey];

  const bw2 = bw * bw;
  const bw3 = bw2 * bw;
  const bw4 = bw3 * bw;

  const denominator = (a * bw4) + (b * bw3) + (c * bw2) + (d * bw) + e;
  if (denominator <= 0) {
    return 0.0;
  }

  const score = total * (500.0 / denominator);
  return parseFloat(score.toFixed(2));
}

/**
 * Maps DOTS score to competitive strength tier classification
 * @param {number} score - DOTS score
 * @returns {string} Tier label
 */
function getDotsClassification(score) {
  if (score >= 460) return 'ELITE';
  if (score >= 415) return 'MASTER';
  if (score >= 350) return 'CLASS I';
  if (score >= 280) return 'CLASS II';
  if (score >= 220) return 'CLASS III';
  return 'NOVICE';
}

/**
 * Traverses workouts hierarchy to extract the lifetime maximum velocity per lift
 * @param {Array} workoutList - Workout sessions array (defaults to workouts)
 * @returns {{ squat: number, bench: number, deadlift: number }}
 */
function extractErosPeakVelocities(workoutList = workouts) {
  const peaks = {
    squat: 0.0,
    bench: 0.0,
    deadlift: 0.0
  };

  if (!Array.isArray(workoutList)) return peaks;

  workoutList.forEach(w => {
    (w.sets || []).forEach(s => {
      (s.reps || []).forEach(r => {
        if (!r || !r.lift || typeof r.velocity !== 'number') return;
        const liftKey = String(r.lift).toLowerCase();
        if (liftKey.includes('squat')) {
          if (r.velocity > peaks.squat) peaks.squat = r.velocity;
        } else if (liftKey.includes('bench')) {
          if (r.velocity > peaks.bench) peaks.bench = r.velocity;
        } else if (liftKey.includes('deadlift')) {
          if (r.velocity > peaks.deadlift) peaks.deadlift = r.velocity;
        }
      });
    });
  });

  return {
    squat: parseFloat(peaks.squat.toFixed(2)),
    bench: parseFloat(peaks.bench.toFixed(2)),
    deadlift: parseFloat(peaks.deadlift.toFixed(2))
  };
}

/**
 * Updates UI values for the PR Dashboard, Competition PR Box, and Live DOTS Calculator
 * @param {boolean} updateInputs - Whether to write values back to the input elements
 */
function updatePrDashboardUI(updateInputs = true) {
  if (!prSquatWeight) return;

  if (updateInputs) {
    prSquatWeight.value    = prProfile.currentPRs.squat;
    prBenchWeight.value    = prProfile.currentPRs.bench;
    prDeadliftWeight.value = prProfile.currentPRs.deadlift;

    compSquatWeight.value    = prProfile.compPRs.squat;
    compBenchWeight.value    = prProfile.compPRs.bench;
    compDeadliftWeight.value = prProfile.compPRs.deadlift;

    if (dotsBwInput) dotsBwInput.value = prProfile.bodyweight;

    if (dotsGenderMale && dotsGenderFemale) {
      if (prProfile.gender === 'female') {
        dotsGenderMale.classList.remove('active');
        dotsGenderMale.setAttribute('aria-checked', 'false');
        dotsGenderFemale.classList.add('active');
        dotsGenderFemale.setAttribute('aria-checked', 'true');
      } else {
        dotsGenderFemale.classList.remove('active');
        dotsGenderFemale.setAttribute('aria-checked', 'false');
        dotsGenderMale.classList.add('active');
        dotsGenderMale.setAttribute('aria-checked', 'true');
      }
    }

    if (dotsSrcCurrent && dotsSrcComp) {
      if (prProfile.activeDotsSource === 'comp') {
        dotsSrcCurrent.classList.remove('active');
        dotsSrcComp.classList.add('active');
      } else {
        dotsSrcComp.classList.remove('active');
        dotsSrcCurrent.classList.add('active');
      }
    }
  }

  // Calculate totals
  const currentTotal = (prProfile.currentPRs.squat || 0) + (prProfile.currentPRs.bench || 0) + (prProfile.currentPRs.deadlift || 0);
  const compTotal = (prProfile.compPRs.squat || 0) + (prProfile.compPRs.bench || 0) + (prProfile.compPRs.deadlift || 0);

  if (prCurrentTotal) prCurrentTotal.textContent = `${currentTotal.toFixed(1)} kg`;
  if (compPrTotal) compPrTotal.textContent = `${compTotal.toFixed(1)} kg`;

  // Update Eros peak velocities from workout history
  const peaks = extractErosPeakVelocities();
  if (prSquatVel) prSquatVel.textContent = `${peaks.squat.toFixed(2)} m/s`;
  if (prBenchVel) prBenchVel.textContent = `${peaks.bench.toFixed(2)} m/s`;
  if (prDeadliftVel) prDeadliftVel.textContent = `${peaks.deadlift.toFixed(2)} m/s`;

  // Evaluate DOTS score from selected source total
  const evaluatedTotal = prProfile.activeDotsSource === 'comp' ? compTotal : currentTotal;
  if (dotsTotalDisplay) dotsTotalDisplay.textContent = `${evaluatedTotal.toFixed(1)} kg`;

  const dotsScore = calculateDotsScore(evaluatedTotal, prProfile.bodyweight, prProfile.gender);
  if (dotsScoreDisplay) dotsScoreDisplay.textContent = dotsScore.toFixed(2);
  if (dotsTierBadge) dotsTierBadge.textContent = getDotsClassification(dotsScore);
}

/**
 * Initializes event listeners for PR inputs, gender switches, and DOTS controls
 */
function initPrDashboardListeners() {
  if (!prSquatWeight || initPrDashboardListeners._initialized) return;
  initPrDashboardListeners._initialized = true;

  const onCurrentPrInput = () => {
    prProfile.currentPRs.squat = parseFloat(prSquatWeight.value) || 0;
    prProfile.currentPRs.bench = parseFloat(prBenchWeight.value) || 0;
    prProfile.currentPRs.deadlift = parseFloat(prDeadliftWeight.value) || 0;
    persistPrProfile();
    updatePrDashboardUI(false);
  };

  prSquatWeight.addEventListener('input', onCurrentPrInput);
  prBenchWeight.addEventListener('input', onCurrentPrInput);
  prDeadliftWeight.addEventListener('input', onCurrentPrInput);

  const onCompPrInput = () => {
    prProfile.compPRs.squat = parseFloat(compSquatWeight.value) || 0;
    prProfile.compPRs.bench = parseFloat(compBenchWeight.value) || 0;
    prProfile.compPRs.deadlift = parseFloat(compDeadliftWeight.value) || 0;
    persistPrProfile();
    updatePrDashboardUI(false);
  };

  compSquatWeight.addEventListener('input', onCompPrInput);
  compBenchWeight.addEventListener('input', onCompPrInput);
  compDeadliftWeight.addEventListener('input', onCompPrInput);

  if (dotsBwInput) {
    dotsBwInput.addEventListener('input', () => {
      prProfile.bodyweight = parseFloat(dotsBwInput.value) || 0;
      persistPrProfile();
      updatePrDashboardUI(false);
    });
  }

  if (dotsGenderMale && dotsGenderFemale) {
    dotsGenderMale.addEventListener('click', () => {
      prProfile.gender = 'male';
      dotsGenderFemale.classList.remove('active');
      dotsGenderFemale.setAttribute('aria-checked', 'false');
      dotsGenderMale.classList.add('active');
      dotsGenderMale.setAttribute('aria-checked', 'true');
      persistPrProfile();
      updatePrDashboardUI(false);
    });

    dotsGenderFemale.addEventListener('click', () => {
      prProfile.gender = 'female';
      dotsGenderMale.classList.remove('active');
      dotsGenderMale.setAttribute('aria-checked', 'false');
      dotsGenderFemale.classList.add('active');
      dotsGenderFemale.setAttribute('aria-checked', 'true');
      persistPrProfile();
      updatePrDashboardUI(false);
    });
  }

  if (dotsSrcCurrent && dotsSrcComp) {
    dotsSrcCurrent.addEventListener('click', () => {
      prProfile.activeDotsSource = 'current';
      dotsSrcComp.classList.remove('active');
      dotsSrcCurrent.classList.add('active');
      persistPrProfile();
      updatePrDashboardUI(false);
    });

    dotsSrcComp.addEventListener('click', () => {
      prProfile.activeDotsSource = 'comp';
      dotsSrcCurrent.classList.remove('active');
      dotsSrcComp.classList.add('active');
      persistPrProfile();
      updatePrDashboardUI(false);
    });
  }
}

/**
 * Calculates lifetime aggregates across all stored workouts
 */
function updateHistoryStats() {
  const totalWorkouts = workouts.length;
  let totalSets = 0;
  let totalReps = 0;
  let peakVel = 0.0;

  workouts.forEach(w => {
    if (w.sets) {
      totalSets += w.sets.length;
      w.sets.forEach(s => {
        if (s.reps) {
          totalReps += s.reps.length;
          s.reps.forEach(r => {
            if (r.velocity > peakVel) peakVel = r.velocity;
          });
        }
      });
    }
  });

  sumWorkouts.textContent = totalWorkouts;
  sumSets.textContent     = totalSets;
  sumReps.textContent     = totalReps;
  sumBestVel.textContent  = peakVel.toFixed(2);
  updatePrDashboardUI(false);
}

/**
 * Renders collapsible VisionOS session cards
 */
function renderHistoryView() {
  if (workouts.length === 0) {
    historySessionsList.innerHTML = '<div class="empty-state">No workout sessions recorded yet. Start a workout to build history!</div>';
    updatePrDashboardUI(false);
    return;
  }

  let html = '';
  workouts.forEach((session, index) => {
    const isExpanded = index === 0; // Expand most recent session by default
    const setList = session.sets || [];
    let sessionRepsCount = 0;
    let velSum = 0;

    setList.forEach(s => {
      if (s.reps) {
        sessionRepsCount += s.reps.length;
        s.reps.forEach(r => { velSum += r.velocity; });
      }
    });

    const sessionAvgVel = sessionRepsCount > 0 ? (velSum / sessionRepsCount).toFixed(2) : '0.00';
    const durationMins = session.endTime
      ? Math.max(1, Math.round((session.endTime - session.startTime) / 60000))
      : 'Active';

    html += `
      <div class="session-card ${isExpanded ? 'expanded' : ''}" data-session-id="${session.id}">
        <div class="session-card-header" onclick="toggleSessionCard('${session.id}')">
          <div class="session-card-title-group">
            <span class="session-card-title">${escapeHtml(session.name)}</span>
            <span class="session-card-meta">${session.dateStr} • ${durationMins} ${typeof durationMins === 'number' ? 'mins' : ''}</span>
          </div>
          <div class="session-card-stats">
            <div class="session-stat-chip">
              <span class="stat-chip-val font-mono">${setList.length}S / ${sessionRepsCount}R</span>
              <span class="stat-chip-lbl">VOLUME</span>
            </div>
            <div class="session-stat-chip">
              <span class="stat-chip-val font-mono">${sessionAvgVel}</span>
              <span class="stat-chip-lbl">AVG M/S</span>
            </div>
            <span class="session-toggle-chevron">▾</span>
          </div>
        </div>

        <div class="session-card-body">
          ${renderSessionSetsAccordion(setList)}
        </div>
      </div>
    `;
  });

  historySessionsList.innerHTML = html;
  updatePrDashboardUI(false);
}

function renderSessionSetsAccordion(sets) {
  if (sets.length === 0) {
    return '<div class="empty-state">No sets logged in this session.</div>';
  }

  let out = '';
  sets.forEach(s => {
    const setLift = canonicalLift(s.lift || currentLift);
    const setLiftKey = liftKeyOf(setLift);
    const repPills = (s.reps || []).map(r => `
      <span class="history-rep-pill font-mono">#${r.repNumber}: ${r.velocity.toFixed(2)}m/s${r.isPR ? ' <span class="rep-pr-badge gold-glow">PR</span>' : ''}</span>
    `).join('');

    out += `
      <div class="session-set-item" data-lift="${setLiftKey}">
        <div class="session-set-header">
          <span class="session-set-tag" data-lift="${setLiftKey}">SET ${s.setNumber} — ${escapeHtml(setLift.toUpperCase())}</span>
          <div class="session-set-stats font-mono">
            <span class="set-stat-vel">Avg: ${s.avgVelocity.toFixed(2)} m/s</span>
            <span class="set-stat-loss">Loss: ${s.velocityLossPct.toFixed(1)}%</span>
          </div>
        </div>
        <div class="session-reps-pills">
          ${repPills}
        </div>
      </div>
    `;
  });
  return out;
}

window.toggleSessionCard = function(sessionId) {
  const card = document.querySelector(`.session-card[data-session-id="${sessionId}"]`);
  if (card) {
    card.classList.toggle('expanded');
  }
};

/**
 * Export to CSV (Formatted for sports science / biomechanical analysis)
 */
btnExportCsv.addEventListener('click', () => {
  if (workouts.length === 0) {
    showBanner('No data to export.');
    return;
  }

  const rows = [
    ['Workout ID', 'Workout Date', 'Set Number', 'Lift', 'Rep Number', 'Velocity (m/s)', 'RPE', 'Set Avg Velocity', 'Set Velocity Loss %', 'Timestamp']
  ];

  workouts.forEach(w => {
    (w.sets || []).forEach(s => {
      (s.reps || []).forEach(r => {
        rows.push([
          `"${w.id}"`,
          `"${w.dateStr}"`,
          s.setNumber,
          `"${s.lift}"`,
          r.repNumber,
          r.velocity.toFixed(2),
          r.rpe.toFixed(1),
          s.avgVelocity.toFixed(2),
          s.velocityLossPct.toFixed(1),
          `"${new Date(r.timestamp).toISOString()}"`
        ]);
      });
    });
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `VBT_Workouts_Export_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

/**
 * Export to JSON
 */
btnExportJson.addEventListener('click', () => {
  if (workouts.length === 0) {
    showBanner('No data to export.');
    return;
  }

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(workouts, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', `VBT_Workouts_Hierarchy_${Date.now()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

/**
 * Clear History
 */
btnClearHistory.addEventListener('click', () => {
  if (workouts.length === 0) return;
  if (confirm('Clear all stored workout history? This action cannot be undone.')) {
    workouts = [];
    activeWorkout = null;
    activeSet = null;
    localStorage.removeItem(STORAGE_KEY);
    updateHistoryStats();
    renderHistoryView();
    updateLiveMiniHud();
    updateSetUI(null);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. NAVIGATION & UI UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    SoundFX.playNavTick();
    HapticsFX.vibrate([15]);

    const target = tab.getAttribute('data-target');
    if (!target || !tabSections[target]) return;
    if (target === currentTabTarget && tabSections[target].classList.contains('active-section')) return;

    const prevTarget = currentTabTarget;
    currentTabTarget = target;

    // Update active class on navTabs
    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update data-active attribute on .bottom-glass-nav
    if (bottomGlassNav) {
      bottomGlassNav.setAttribute('data-active', target);
    }

    // Synchronously clear active-section and set active-section on target section
    const prevSection = tabSections[prevTarget];
    const targetSection = tabSections[target];

    Object.values(tabSections).forEach(s => {
      if (s) s.classList.remove('active-section');
    });

    if (targetSection) {
      targetSection.classList.remove('leaving-section');
      targetSection.classList.add('active-section');
    }

    // Add leaving-section to previously active section and remove via setTimeout(..., 220)
    if (prevSection && prevSection !== targetSection) {
      prevSection.classList.add('leaving-section');
      setTimeout(() => {
        prevSection.classList.remove('leaving-section');
      }, 220);
    }
  });
});

function setConnectedUI(connected) {
  btnConnect.disabled = false;
  if (connected) {
    if (btnConnectText) btnConnectText.innerHTML = 'DISCONNECT <span class="eros-wordmark">Eros</span>';
    btnConnect.classList.add('connected');
    statusBadge.className = 'glass-pill status-connected';
    statusBadge.querySelector('.status-label').textContent = 'Connected';
  } else {
    if (btnConnectText) btnConnectText.innerHTML = 'CONNECT <span class="eros-wordmark">Eros</span>';
    btnConnect.classList.remove('connected');
    statusBadge.className = 'glass-pill status-disconnected';
    statusBadge.querySelector('.status-label').textContent = 'Disconnected';
  }
}

function showBanner(msg) {
  syncBannerText.textContent = msg;
  syncBanner.classList.remove('hidden');
  clearTimeout(syncBanner._timeout);
  syncBanner._timeout = setTimeout(() => clearBanner(), 4500);
}

function clearBanner() {
  syncBanner.classList.add('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ── Kickoff Execution on DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  applyLiftTheme('Deadlift');
  setTargetRpe(8.0);
  initTouchActiveStates();
  initBleSheetDrag();
});
