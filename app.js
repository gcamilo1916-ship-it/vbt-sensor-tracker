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
const WEIGHT_STORAGE_KEY      = 'vbt_last_lift_weights_v1';

// ── DOM References ──
// Header & Master Workout Controls
const btnWorkoutMaster  = document.getElementById('btn-workout-master');
const btnWorkoutText    = document.getElementById('btn-workout-text');
const btnProgrammedWorkout = document.getElementById('btn-programmed-workout');
const liveProgrammedDrawer = document.getElementById('live-programmed-drawer');
const liveProgrammedDrawerBackdrop = document.getElementById('live-programmed-drawer-backdrop');
const btnProgrammedDrawerClose = document.getElementById('btn-programmed-drawer-close');
const liveProgrammedDrawerList = document.getElementById('live-programmed-drawer-list');
const btnProgrammedOpenPrep = document.getElementById('btn-programmed-open-prep');
const sessionPulse      = document.getElementById('session-pulse');
const sessionStatusText = document.getElementById('session-status-text');
const sessionTimerDisp  = document.getElementById('session-timer-display');
const sessionRestClock  = document.getElementById('session-rest-clock');
const statusBadge       = document.getElementById('status-badge');
const syncBanner        = document.getElementById('sync-banner');
const syncBannerText    = document.getElementById('sync-banner-text');

// Connection Controls & Lift Selector
const btnConnect        = document.getElementById('btn-connect');
const btnConnectText    = btnConnect ? btnConnect.querySelector('.btn-text') : null;
const liftSelectWrapper = document.getElementById('lift-select-wrapper');
const selectTrigger     = liftSelectWrapper ? liftSelectWrapper.querySelector('.custom-select-trigger') : null;
const selectedLiftCode  = document.getElementById('selected-lift-code');
const selectedLiftText  = document.getElementById('selected-lift-text');
const customOptions     = liftSelectWrapper ? liftSelectWrapper.querySelectorAll('.custom-option') : [];
const btnSetToggle      = document.getElementById('btn-set-toggle');
const btnSetText        = document.getElementById('btn-set-text');
const floatingSetDock   = document.getElementById('floating-set-dock');

// Live Weight Control (Milestone 2: R1 & Phase 6 Popover)
const liveWeightControl      = document.getElementById('live-weight-control');
const btnLiveWeightTrigger   = document.getElementById('btn-live-weight-trigger');
const liveWeightDisplay      = document.getElementById('live-weight-display');
const liveWeightPopover      = document.getElementById('live-weight-popover');
const liveSetWeightInput     = document.getElementById('live-set-weight-input');
const btnLiveWeightDec       = document.getElementById('btn-live-weight-dec');
const btnLiveWeightInc       = document.getElementById('btn-live-weight-inc');

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
const btnTargetRpeTrigger  = document.getElementById('btn-target-rpe-trigger');
const targetRpePopover     = document.getElementById('target-rpe-popover');
const targetRpePopoverVal  = document.getElementById('target-rpe-popover-val');
const btnTargetRpeDec      = document.getElementById('btn-target-rpe-dec');
const btnTargetRpeInc      = document.getElementById('btn-target-rpe-inc');
const targetRpeDisplay     = document.getElementById('target-rpe-display');
const targetChips          = document.querySelectorAll('.target-chip');
const rpeTargetPin         = document.getElementById('rpe-target-pin');
let currentTargetRpe       = 8.0;

// Live Tracker Arena & Rep Replay Modal
const liveVelocity         = document.getElementById('live-velocity');
const livePeakVel          = document.getElementById('live-peak-vel');
const liveRpe              = document.getElementById('live-rpe');
const liveVelSub           = document.getElementById('live-vel-sub');
const livePeakSub          = document.getElementById('live-peak-sub');
const liveRpeSub           = document.getElementById('live-rpe-sub');
const orb                  = document.getElementById('orb');
const apexGlow             = document.getElementById('apex-glow');
const controlsPanel        = document.querySelector('.controls-panel');
const velocityChangeCanvas = document.getElementById('velocity-change-canvas');
const repReplayModal       = document.getElementById('rep-replay-modal');
const repReplayBackdrop    = document.getElementById('rep-replay-backdrop');
const repReplayCounter     = document.getElementById('rep-replay-counter');
const btnRepReplayClose    = document.getElementById('btn-rep-replay-close');
const repModalCanvas       = document.getElementById('rep-modal-canvas');
const repModalMeanVel      = document.getElementById('rep-modal-mean-vel');
const repModalPeakVel      = document.getElementById('rep-modal-peak-vel');
const repModalRpe          = document.getElementById('rep-modal-rpe');

// 2D Sagittal Bar Path & Replay Controls (R1)
const barPathCanvas       = document.getElementById('bar-path-canvas');
const btnBarpathMode      = document.getElementById('btn-barpath-mode');
const barpathModePath     = document.getElementById('barpath-mode-path');
const barpathModeVel      = document.getElementById('barpath-mode-vel');
const barpathHudDev       = document.getElementById('barpath-hud-dev');
const barpathHudEff       = document.getElementById('barpath-hud-eff');
const barpathScrubber     = document.getElementById('barpath-scrubber');
const barpathScrubRom     = document.getElementById('barpath-scrub-rom');
const barpathScrubInstVel = document.getElementById('barpath-scrub-inst-vel');
const barpathScrubInstDev = document.getElementById('barpath-scrub-inst-dev');
const btnBarpathReplay    = document.getElementById('btn-barpath-replay');
const barpathReplayText   = document.getElementById('barpath-replay-text');
const btnBarpathSpeed     = document.getElementById('btn-barpath-speed');
const barpathSpeedLabel   = document.getElementById('barpath-speed-label');
const barpathRepPills     = document.getElementById('barpath-rep-pills');

// Live RPE Hero Banner
const rpeHeroCard       = document.getElementById('rpe-hero-card');
const liveRirPill       = document.getElementById('live-rir-pill');
const rpeTierBadge      = document.getElementById('rpe-tier-badge');
const rpeGaugeFill      = document.getElementById('rpe-gauge-fill');

// Live Mini-HUD
const hudActiveSet      = document.getElementById('hud-active-set');
const hudSetReps        = document.getElementById('hud-set-reps');
const hudVelLoss        = document.getElementById('hud-vel-loss');

// Velocity Ergonomics & Bryan Mann Zone Badges (Milestone 3 / R2)
const liveVelZoneBadge     = document.getElementById('live-vel-zone-badge');
const livePeakZoneBadge    = document.getElementById('live-peak-zone-badge');
const liveTargetVelBadge   = document.getElementById('live-target-vel-badge');
const liveTargetVelVal     = document.getElementById('live-target-vel-val');
const liveVelDelta         = document.getElementById('live-vel-delta');
const hudFatigueArcFill    = document.getElementById('hud-fatigue-arc-fill');
const hudVelLossCard       = document.getElementById('hud-vel-loss-card');

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

// Workout Set Weight Module (Milestone 2: R1)
const workoutSetWeightModule = document.getElementById('workout-set-weight-module');
const workoutSetWeightInput  = document.getElementById('workout-set-weight-input');
const btnWorkoutWeightDec    = document.getElementById('btn-workout-weight-dec');
const btnWorkoutWeightInc    = document.getElementById('btn-workout-weight-inc');

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
const sumVolume         = document.getElementById('sum-volume');
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
const prSquatBadge     = document.getElementById('pr-squat-badge');
const prBenchBadge     = document.getElementById('pr-bench-badge');
const prDeadliftBadge  = document.getElementById('pr-deadlift-badge');

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

// Preparation Hub & Smart PR Push State (declared early so every lifecycle hook can read it safely)
const ATHLETE_PREP_ID = 'ath_01';
const ATHLETE_CONNECTION_KEY = 'eros_athlete_coach_connection_v1';
const ATHLETE_BIO_FALLBACK_KEY = 'eros_athlete_bio_fallback_v1';

/**
 * Returns the persisted athleteId when paired with a coach, or 'ath_01' when unbonded.
 */
function getActiveAthleteId() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(ATHLETE_CONNECTION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.athleteId && String(parsed.athleteId).trim()) {
          return String(parsed.athleteId).trim();
        }
      }
    }
  } catch (_) {}
  return ATHLETE_PREP_ID;
}

/**
 * Safely updates a play/stop button's .sr-only label, sibling .btn-short-label, and SVG icon without destroying child SVGs.
 */
function updatePlayStopButtonVisual(btn, textEl, srText, shortText, isActive) {
  if (textEl) textEl.textContent = srText;
  if (!btn || typeof btn.querySelector !== 'function') return;
  const shortLabel = btn.querySelector('.btn-short-label');
  if (shortLabel) shortLabel.textContent = shortText;
  const svg = btn.querySelector('svg.eros-svg-icon');
  if (svg) {
    svg.innerHTML = isActive
      ? '<rect x="6" y="6" width="12" height="12" rx="1"></rect>'
      : '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
  }
}

/**
 * Returns the compact Crown SVG + 'PR' + .sr-only 'Gold' badge markup.
 */
function goldenPrBadgeHtml() {
  return '<span class="golden-pr-badge" data-prep-tooltip-key="prep_golden_pr">' +
    '<svg class="eros-svg-icon eros-svg-icon--xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"></path><line x1="5" y1="20" x2="19" y2="20"></line>' +
    '</svg>' +
    '<span>PR</span><span class="sr-only"> Gold</span>' +
    '</span>';
}
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let activePlannedWorkoutId = null;
let activePlannedSlotId = null;
let activePlannedLift = null;
const athletePrepState = {
  initialized: false,
  plan: null,
  workouts: [],
  cache: { plan: null, workouts: {} },
  selectedDate: null,
  selectedByUser: false,
  slotMemory: {},
  lastSlotsHtml: null,
  lastCompareHtml: null,
  noticeTimer: null,
  badgeTimer: null,
  bioTimer: null,
  bioStatusTimer: null
};
const prPromptedKeys = new Set();
const prSuppressedKeys = new Set();
let pendingPrCandidate = null;
let prHudTimer = null;

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

/**
 * Bryan Mann 5-Zone Velocity Continuum Resolver
 * Zone 1: Speed / Power (>1.0 m/s) -> Laser Cyan (#00E5FF)
 * Zone 2: Speed-Strength (0.75-1.0 m/s) -> Electric Emerald (#00FF66)
 * Zone 3: Strength-Speed (0.50-0.75 m/s) -> Specular Gold (#FFD700)
 * Zone 4: Accelerative Strength (0.30-0.50 m/s) -> Caution Orange (#FF9500)
 * Zone 5: Absolute Strength / Grind (<0.30 m/s) -> Apple System Punchy Red (#FF3B30)
 */
function getBryanMannZone(velocity) {
  if (typeof window !== 'undefined' && window.AthleteFX && typeof window.AthleteFX.getVelocityZone === 'function') {
    return window.AthleteFX.getVelocityZone(velocity);
  }
  const v = Number(velocity) || 0;
  if (v > 1.00) {
    return {
      id: 'power',
      name: 'Power / Speed',
      shortLabel: 'POWER',
      min: 1.00,
      cssClass: 'vel-zone-power',
      textClass: 'vel-zone-power-text',
      color: '#00E5FF'
    };
  }
  if (v >= 0.75) {
    return {
      id: 'speed',
      name: 'Speed-Strength',
      shortLabel: 'SPEED-STRENGTH',
      min: 0.75,
      cssClass: 'vel-zone-speed',
      textClass: 'vel-zone-speed-text',
      color: '#00FF66'
    };
  }
  if (v >= 0.50) {
    return {
      id: 'strength',
      name: 'Strength-Speed',
      shortLabel: 'STRENGTH-SPEED',
      min: 0.50,
      cssClass: 'vel-zone-strength',
      textClass: 'vel-zone-strength-text',
      color: '#FFD700'
    };
  }
  if (v >= 0.30) {
    return {
      id: 'accel',
      name: 'Accelerative Strength',
      shortLabel: 'ACCEL',
      min: 0.30,
      cssClass: 'vel-zone-accel',
      textClass: 'vel-zone-accel-text',
      color: '#FF9500'
    };
  }
  return {
    id: 'grind',
    name: 'Absolute Strength / Grind',
    shortLabel: 'GRIND',
    min: 0.00,
    cssClass: 'vel-zone-grind',
    textClass: 'vel-zone-grind-text',
    color: '#FF3B30'
  };
}

/**
 * Checks if a recorded repetition sets a speed PR for the current lift & load
 */
function checkIfSpeedPR(lift, velocity, weight) {
  if (!activeWorkout || !activeWorkout.sets) return false;
  const canonical = canonicalLift(lift);
  const v = Number(velocity) || 0;
  if (v <= 0) return false;

  // Check active workout sets
  for (const s of activeWorkout.sets) {
    if (!sameLift(s.lift, canonical)) continue;
    if (typeof s.weight === 'number' && typeof weight === 'number' && Math.abs(s.weight - weight) < 0.5) {
      if (s.reps && s.reps.some(r => r.velocity >= v)) {
        return false;
      }
    }
  }

  // Check past sessions in storage
  if (typeof allWorkouts !== 'undefined' && Array.isArray(allWorkouts)) {
    for (const w of allWorkouts) {
      if (!w.sets) continue;
      for (const s of w.sets) {
        if (!sameLift(s.lift, canonical)) continue;
        if (typeof s.weight === 'number' && typeof weight === 'number' && Math.abs(s.weight - weight) < 0.5) {
          if (s.reps && s.reps.some(r => r.velocity >= v)) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

/**
 * R3: Resolves workout naming based on Powerlifting hierarchy rules:
 * - Squat and Deadlift are always "Main" ("Main squat", "Main deadlift")
 * - Bench is "Bench"
 * - Squat, Bench, and Deadlift together -> "SBD"
 * - Deadlift + Bench -> "Main deadlift + Bench"
 * - Squat + Bench -> "Main squat + Bench"
 * - Squat + Deadlift -> "Main squat + Main deadlift"
 * - Bench only -> "Bench"
 * - Custom lifts preserved with canonical formatting
 */
function formatWorkoutTitle(session) {
  if (!session) return 'Main deadlift';

  const liftSet = new Set();
  const sets = Array.isArray(session.sets) ? session.sets : [];

  sets.forEach(s => {
    if (s && s.lift) {
      liftSet.add(canonicalLift(s.lift));
    } else if (s && Array.isArray(s.reps)) {
      s.reps.forEach(r => {
        if (r && r.lift) liftSet.add(canonicalLift(r.lift));
      });
    }
  });

  // If no sets are logged yet, deduce lift from session.name or currentLift
  if (liftSet.size === 0) {
    if (session.name && typeof session.name === 'string') {
      const cleaned = session.name.replace(/\s+Session$/i, '').trim();
      if (cleaned.length > 0) {
        if (cleaned === 'SBD' || cleaned.includes('+') || cleaned.startsWith('Main ')) {
          return session.name;
        }
        liftSet.add(canonicalLift(cleaned));
      }
    }
    if (liftSet.size === 0 && typeof currentLift !== 'undefined' && currentLift) {
      liftSet.add(canonicalLift(currentLift));
    }
  }

  const lifts = Array.from(liftSet);
  const hasSquat = lifts.some(l => sameLift(l, 'Squat'));
  const hasBench = lifts.some(l => sameLift(l, 'Bench'));
  const hasDeadlift = lifts.some(l => sameLift(l, 'Deadlift'));

  const customLifts = lifts.filter(l =>
    !sameLift(l, 'Squat') && !sameLift(l, 'Bench') && !sameLift(l, 'Deadlift')
  );

  // 1. Squat, Bench, and Deadlift together -> "SBD"
  if (hasSquat && hasBench && hasDeadlift) {
    return customLifts.length > 0 ? `SBD + ${customLifts.join(' + ')}` : 'SBD';
  }

  // 2. Canonical parts in priority order: Squat, Deadlift, Bench, then custom lifts
  const parts = [];
  if (hasSquat) parts.push('Main squat');
  if (hasDeadlift) parts.push('Main deadlift');
  if (hasBench) parts.push('Bench');
  customLifts.forEach(l => parts.push(l));

  if (parts.length === 0) {
    return 'Main deadlift';
  }

  return parts.join(' + ');
}

if (typeof window !== 'undefined') {
  window.formatWorkoutTitle = formatWorkoutTitle;
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

    // Requirement R2: Difficulty-Scaled Repetition Completion Pop & Pure Web Audio Synthesis
    playRepPopChime(velocity = 0.5, rpe = 7.5, lift = 'Squat') {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const triggerChime = () => {
          const now = ctx.currentTime;
          const numRpe = Math.max(6.0, Math.min(10.0, Number(rpe) || 7.5));
          const diff = (numRpe - 6.0) / 4.0; // 0.0 (easy) to 1.0 (grind)
          const vel = Math.max(0.1, Number(velocity) || 0.45);

          // Stage 1: Acoustic Pop Impulse Transient (Frequency sweep 280 -> 80 Hz in 35ms)
          const popOsc = ctx.createOscillator();
          const popGain = ctx.createGain();
          popOsc.type = 'sine';
          popOsc.frequency.setValueAtTime(280 - diff * 80, now);
          popOsc.frequency.exponentialRampToValueAtTime(80, now + 0.035);
          popGain.gain.setValueAtTime(0.35 + diff * 0.25, now);
          popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.040);
          popOsc.connect(popGain);
          popGain.connect(ctx.destination);
          popOsc.start(now);
          popOsc.stop(now + 0.045);

          // Stage 2: Crystalline D5 Harmonic Chime
          const baseFreq = 587.33; // D5
          const highFreq = Math.min(1350, baseFreq * (1 + vel * 0.45));
          const chimeOsc1 = ctx.createOscillator();
          const chimeOsc2 = ctx.createOscillator();
          const chimeGain = ctx.createGain();

          chimeOsc1.type = 'sine';
          chimeOsc2.type = 'triangle';
          chimeOsc1.frequency.setValueAtTime(baseFreq, now + 0.020);
          chimeOsc2.frequency.setValueAtTime(highFreq, now + 0.025);

          const chimeDuration = 0.22 + diff * 0.25; // 220ms up to 470ms
          chimeGain.gain.setValueAtTime(0.22, now + 0.020);
          chimeGain.gain.exponentialRampToValueAtTime(0.001, now + chimeDuration);

          chimeOsc1.connect(chimeGain);
          chimeOsc2.connect(chimeGain);
          chimeGain.connect(ctx.destination);
          chimeOsc1.start(now + 0.020);
          chimeOsc2.start(now + 0.025);
          chimeOsc1.stop(now + chimeDuration + 0.01);
          chimeOsc2.stop(now + chimeDuration + 0.01);

          // Stage 3: Sub-Bass Effort Resonance (For RPE >= 8.5)
          if (numRpe >= 8.5) {
            const subOsc = ctx.createOscillator();
            const subGain = ctx.createGain();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(55, now + 0.010);
            subGain.gain.setValueAtTime(0.32 * diff, now + 0.010);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
            subOsc.connect(subGain);
            subGain.connect(ctx.destination);
            subOsc.start(now + 0.010);
            subOsc.stop(now + 0.22);
          }
        };

        if (ctx.state === 'suspended') {
          ctx.resume().then(triggerChime).catch(() => {});
        } else {
          triggerChime();
        }
      } catch (e) {
        // Fallback silent
      }
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
    },

    // Coach directive and technical cue arrival chime (subtle ascending two-tone glass chime)
    playCoachDirectiveChime() {
      playTone(659.25, 'sine', 0.14, 0.22, 0);
      playTone(880.00, 'triangle', 0.24, 0.25, 0.08);
    },

    playCoachCueIncoming() {
      playTone(659.25, 'sine', 0.14, 0.22, 0);
      playTone(880.00, 'triangle', 0.24, 0.25, 0.08);
    },

    // Coach Portal Sound Effects
    playCoachPanelOpen() {
      playTone(392.00, 'sine', 0.12, 0.20, 0);
      playTone(587.33, 'triangle', 0.24, 0.22, 0.06);
    },

    playCoachActionSend() {
      playTone(784.00, 'sine', 0.08, 0.22, 0);
      playTone(1174.66, 'triangle', 0.16, 0.25, 0.04);
    },

    playCoachPillSelect() {
      playTone(1250.00, 'sine', 0.02, 0.12, 0);
    },

    playCoachPanelSwitch() {
      playTone(950.00, 'sine', 0.03, 0.12, 0);
    },

    // Set Completion Triumph Fanfare (Major Triad Chime: D5 -> F#5 -> A5 -> D6)
    playSetTriumph(isPR = false, velocityLossPct = 0) {
      if (isPR) {
        this.playPrFanfare();
        return;
      }
      playTone(587.33, 'sine', 0.18, 0.25, 0.00);
      playTone(739.99, 'sine', 0.22, 0.24, 0.08);
      playTone(880.00, 'sine', 0.28, 0.22, 0.16);
      playTone(1174.66, 'triangle', 0.45, 0.30, 0.24);
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
    },

    vibrateCoachDirective() {
      this.vibrate([60, 40, 100]);
    }
  };
})();

if (typeof window !== 'undefined') {
  window.SoundFX = SoundFX;
  window.HapticsFX = HapticsFX;
}

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

// ── Set Weight & Volume State Engine (Milestone 2: R1 & R2) ──
const DEFAULT_LIFT_WEIGHTS = {
  Deadlift: 140.0,
  Squat: 100.0,
  Bench: 80.0
};

let lastLiftWeights = (() => {
  try {
    const raw = localStorage.getItem(WEIGHT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : { ...DEFAULT_LIFT_WEIGHTS };
  } catch (e) {
    return { ...DEFAULT_LIFT_WEIGHTS };
  }
})();

function persistLastLiftWeights() {
  try {
    localStorage.setItem(WEIGHT_STORAGE_KEY, JSON.stringify(lastLiftWeights));
  } catch (e) {}
}

function getLastWeightForLift(liftName) {
  const canon = canonicalLift(liftName || currentLift);
  // 1. Check active workout sets in reverse
  if (activeWorkout && Array.isArray(activeWorkout.sets)) {
    for (let i = activeWorkout.sets.length - 1; i >= 0; i--) {
      const s = activeWorkout.sets[i];
      if (sameLift(s.lift, canon) && typeof s.weight === 'number' && !isNaN(s.weight) && s.weight > 0) {
        return s.weight;
      }
    }
  }
  // 2. Check stored history workouts in reverse
  if (Array.isArray(workouts)) {
    for (const w of workouts) {
      if (Array.isArray(w.sets)) {
        for (let i = w.sets.length - 1; i >= 0; i--) {
          const s = w.sets[i];
          if (sameLift(s.lift, canon) && typeof s.weight === 'number' && !isNaN(s.weight) && s.weight > 0) {
            return s.weight;
          }
        }
      }
    }
  }
  // 3. Fallback to cached per-lift memory or default
  if (lastLiftWeights && typeof lastLiftWeights[canon] === 'number' && !isNaN(lastLiftWeights[canon])) {
    return lastLiftWeights[canon];
  }
  return DEFAULT_LIFT_WEIGHTS[canon] || 100.0;
}

let currentWorkingWeight = 140.0;

function syncLiveWeightDisplay(formatted) {
  const disp = liveWeightDisplay || document.getElementById('live-weight-display');
  if (disp) {
    disp.innerHTML = `${escapeHtml(formatted)} <span class="weight-unit">kg</span>`;
  }
}

function setWorkingWeight(val, updateInputs = true, source = null) {
  let num = parseFloat(val);
  if (isNaN(num)) num = 0;
  num = Math.max(0, Math.min(600, Math.round(num * 10) / 10));
  currentWorkingWeight = num;
  const canon = canonicalLift(currentLift);
  if (!lastLiftWeights) lastLiftWeights = { ...DEFAULT_LIFT_WEIGHTS };
  lastLiftWeights[canon] = num;
  persistLastLiftWeights();

  const formatted = num.toFixed(1);
  if (updateInputs) {
    if (liveSetWeightInput && liveSetWeightInput.value !== formatted) {
      liveSetWeightInput.value = formatted;
    }
    if (workoutSetWeightInput && workoutSetWeightInput.value !== formatted) {
      workoutSetWeightInput.value = formatted;
    }
  } else {
    if (source === 'live' && workoutSetWeightInput && workoutSetWeightInput.value !== String(val)) {
      workoutSetWeightInput.value = val;
    }
    if (source === 'workout' && liveSetWeightInput && liveSetWeightInput.value !== String(val)) {
      liveSetWeightInput.value = val;
    }
  }
  syncLiveWeightDisplay(formatted);

  if (activeSet) {
    activeSet.weight = num;
    persistStorage();
    updateWorkoutPage();
  }
}

function stepWorkingWeight(delta) {
  const current = (typeof currentWorkingWeight === 'number' && !isNaN(currentWorkingWeight))
    ? currentWorkingWeight
    : getLastWeightForLift(currentLift);
  const next = Math.max(0, Math.min(600, Math.round((current + delta) * 10) / 10));
  setWorkingWeight(next, true);
  if (typeof SoundFX !== 'undefined' && SoundFX.playStepperTick) SoundFX.playStepperTick();
  if (typeof HapticsFX !== 'undefined' && HapticsFX.vibrate) HapticsFX.vibrate([10]);
}

function closeLiveWeightPopover() {
  const pop = liveWeightPopover || document.getElementById('live-weight-popover');
  const trig = btnLiveWeightTrigger || document.getElementById('btn-live-weight-trigger');
  const wrap = liveWeightControl || document.getElementById('live-weight-control');
  if (pop) pop.style.display = 'none';
  if (trig && typeof trig.setAttribute === 'function') trig.setAttribute('aria-expanded', 'false');
  if (wrap && wrap.classList) wrap.classList.remove('open');
}

function openLiveWeightPopover() {
  closeTargetRpePopover();
  closeProgrammedDrawer();
  if (liftSelectWrapper && liftSelectWrapper.classList) liftSelectWrapper.classList.remove('open');
  const pop = liveWeightPopover || document.getElementById('live-weight-popover');
  const trig = btnLiveWeightTrigger || document.getElementById('btn-live-weight-trigger');
  const wrap = liveWeightControl || document.getElementById('live-weight-control');
  if (pop) pop.style.display = 'block';
  if (trig && typeof trig.setAttribute === 'function') trig.setAttribute('aria-expanded', 'true');
  if (wrap && wrap.classList) wrap.classList.add('open');
}

function toggleLiveWeightPopover(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const pop = liveWeightPopover || document.getElementById('live-weight-popover');
  const isOpen = Boolean(pop && (pop.style.display === 'block' || pop.style.display === 'flex'));
  if (isOpen) {
    closeLiveWeightPopover();
  } else {
    openLiveWeightPopover();
  }
}

let weightListenersInitialized = false;
function initWeightControlListeners() {
  if (weightListenersInitialized) return;
  weightListenersInitialized = true;

  const weightTrig = btnLiveWeightTrigger || document.getElementById('btn-live-weight-trigger');
  if (weightTrig) {
    weightTrig.addEventListener('click', toggleLiveWeightPopover);
  }
  const weightWrap = liveWeightControl || document.getElementById('live-weight-control');
  if (weightWrap) {
    weightWrap.addEventListener('click', (e) => {
      const pop = liveWeightPopover || document.getElementById('live-weight-popover');
      if (pop && e && e.target && typeof pop.contains === 'function' && pop.contains(e.target)) return;
      if (weightTrig && e && e.target && typeof weightTrig.contains === 'function' && weightTrig.contains(e.target)) return;
      toggleLiveWeightPopover(e);
    });
  }
  const weightPop = liveWeightPopover || document.getElementById('live-weight-popover');
  if (weightPop && typeof weightPop.querySelectorAll === 'function') {
    weightPop.querySelectorAll('.weight-quick-btn[data-weight-delta]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        const delta = parseFloat(btn.getAttribute('data-weight-delta'));
        if (!isNaN(delta)) stepWorkingWeight(delta);
      });
    });
  }

  if (btnLiveWeightDec) {
    btnLiveWeightDec.addEventListener('click', (e) => {
      if (e) e.stopPropagation();
      stepWorkingWeight(-2.5);
    });
  }
  if (btnLiveWeightInc) {
    btnLiveWeightInc.addEventListener('click', (e) => {
      if (e) e.stopPropagation();
      stepWorkingWeight(2.5);
    });
  }
  if (btnWorkoutWeightDec) {
    btnWorkoutWeightDec.addEventListener('click', () => stepWorkingWeight(-2.5));
  }
  if (btnWorkoutWeightInc) {
    btnWorkoutWeightInc.addEventListener('click', () => stepWorkingWeight(2.5));
  }

  if (liveSetWeightInput) {
    liveSetWeightInput.addEventListener('input', (e) => {
      setWorkingWeight(e.target.value, false, 'live');
    });
    liveSetWeightInput.addEventListener('change', (e) => {
      setWorkingWeight(e.target.value, true);
    });
    liveSetWeightInput.addEventListener('blur', (e) => {
      setWorkingWeight(e.target.value, true);
    });
  }

  if (workoutSetWeightInput) {
    workoutSetWeightInput.addEventListener('input', (e) => {
      setWorkingWeight(e.target.value, false, 'workout');
    });
    workoutSetWeightInput.addEventListener('change', (e) => {
      setWorkingWeight(e.target.value, true);
    });
    workoutSetWeightInput.addEventListener('blur', (e) => {
      setWorkingWeight(e.target.value, true);
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const wrap = liveWeightControl || document.getElementById('live-weight-control');
      if (wrap && e && e.target && typeof wrap.contains === 'function' && !wrap.contains(e.target)) {
        closeLiveWeightPopover();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e && e.key === 'Escape') {
        closeLiveWeightPopover();
      }
    });
  }
}

function initStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      workouts = JSON.parse(raw);
      if (Array.isArray(workouts)) {
        workouts.forEach(w => {
          w.name = formatWorkoutTitle(w);
        });
        persistStorage();
      }
      console.log(`[Eros] Loaded ${workouts.length} workout sessions from localStorage.`);
    }
  } catch (err) {
    console.warn('[Eros] Failed to read localStorage:', err);
    workouts = [];
  }
  currentWorkingWeight = getLastWeightForLift(currentLift);
  if (liveSetWeightInput) liveSetWeightInput.value = currentWorkingWeight.toFixed(1);
  if (workoutSetWeightInput) workoutSetWeightInput.value = currentWorkingWeight.toFixed(1);
  initWeightControlListeners();
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
    name: formatWorkoutTitle({ sets: [{ lift: currentLift }] }),
    sets: []
  };

  workouts.unshift(session);
  activeWorkout = session;

  // Start Session Timer
  startSessionTimer(session.startTime);

  // Update UI
  updatePlayStopButtonVisual(btnWorkoutMaster, btnWorkoutText, 'END WORKOUT', 'End', true);
  if (btnWorkoutMaster) btnWorkoutMaster.classList.add('session-active');
  if (sessionPulse) sessionPulse.classList.add('active');
  if (sessionStatusText) {
    sessionStatusText.textContent = 'ACTIVE WORKOUT';
    sessionStatusText.classList.add('active');
  }
  lastReplayableSet = null;
  if (typeof renderVelocityChangeGraph === 'function') {
    renderVelocityChangeGraph(1.0);
  }

  persistStorage();
  updateHistoryStats();
  updateWorkoutPage();
  renderLivePrescriptionStrip();
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

  activeWorkout.name = formatWorkoutTitle(activeWorkout);
  activeWorkout.endTime = Date.now();
  stopSessionTimer();

  if (interSetRestInterval) {
    clearInterval(interSetRestInterval);
    interSetRestInterval = null;
  }
  restStartTime = null;
  currentRestElapsedSeconds = 0;
  lastDisplayedRestTargetSeconds = null;
  hideRestClockUI();
  if (typeof AthleteFX !== 'undefined' && typeof AthleteFX.stopRestCountdown === 'function') {
    AthleteFX.stopRestCountdown();
  }

  activeWorkout = null;
  activeSet = null;
  lastReplayableSet = null;
  if (controlsPanel) {
    controlsPanel.classList.remove('set-active-compact');
  }

  // Reset UI
  updatePlayStopButtonVisual(btnWorkoutMaster, btnWorkoutText, 'START WORKOUT', 'New', false);
  if (btnWorkoutMaster) btnWorkoutMaster.classList.remove('session-active');
  if (sessionPulse) sessionPulse.classList.remove('active');
  if (sessionStatusText) {
    sessionStatusText.textContent = 'NO ACTIVE WORKOUT';
    sessionStatusText.classList.remove('active');
  }
  if (sessionTimerDisp) sessionTimerDisp.textContent = '00:00:00';

  updateLiveMiniHud();
  renderLivePrescriptionStrip();
  updateSetUI(null);
  if (typeof renderVelocityChangeGraph === 'function') {
    renderVelocityChangeGraph(1.0);
  }
  if (typeof renderBarPathStage === 'function') {
    renderBarPathStage(0, 1.0);
  }
  persistStorage();
  updateHistoryStats();
  renderHistoryView();
}

/**
 * Toggles master workout session state
 */
if (btnWorkoutMaster) {
  btnWorkoutMaster.addEventListener('click', () => {
    if (activeWorkout) {
      if (confirm('Are you sure you want to end this workout session?')) {
        endWorkoutSession();
      }
    } else {
      startWorkoutSession();
    }
  });
}

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

// ── Inter-Set Rest Stopwatch & Smart Target Countdown Controller (Requirement R2 & Phase 6) ──
let restStartTime = null;
let interSetRestInterval = null;
let currentRestElapsedSeconds = 0;
let activeCoachTargetRestSeconds = null;
let lastDisplayedRestTargetSeconds = null;
let lastReplayableSet = null;

function formatRestDuration(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatRestClockMmSs(seconds) {
  const abs = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function resolveTargetRestSeconds(completedSet = null) {
  if (completedSet && typeof completedSet.prescribedRestSeconds === 'number' && completedSet.prescribedRestSeconds > 0) {
    return Math.round(completedSet.prescribedRestSeconds);
  }
  if (typeof activeCoachTargetRestSeconds === 'number' && activeCoachTargetRestSeconds > 0) {
    return Math.round(activeCoachTargetRestSeconds);
  }
  const wkId = (completedSet && completedSet.plannedWorkoutId) || activePlannedWorkoutId || (activeWorkout && activeWorkout.plannedWorkoutId) || null;
  const slId = (completedSet && completedSet.plannedSlotId) || activePlannedSlotId || null;
  if (wkId && Array.isArray(athletePrepState.workouts)) {
    const wk = athletePrepState.workouts.find(w => w.workoutId === wkId);
    if (wk && Array.isArray(wk.prescribedSlots)) {
      const slot = (slId && wk.prescribedSlots.find(s => s.slotId === slId))
        || wk.prescribedSlots.find(s => sameLift(s.baseLift, (completedSet && completedSet.lift) || currentLift));
      if (slot) {
        const candidates = [
          slot.targetRestSeconds,
          slot.restSeconds,
          slot.topSet && slot.topSet.targetRestSeconds,
          slot.topSet && slot.topSet.restSeconds,
          slot.backoff && slot.backoff.targetRestSeconds,
          slot.backoff && slot.backoff.restSeconds
        ];
        for (let i = 0; i < candidates.length; i++) {
          const val = Number(candidates[i]);
          if (isFinite(val) && val > 0) return Math.round(val);
        }
      }
    }
  }
  return null;
}

function hideRestClockUI() {
  const headerTickerEl = document.getElementById('header-rest-ticker');
  if (headerTickerEl) headerTickerEl.style.display = 'none';
  const clockEl = sessionRestClock || document.getElementById('session-rest-clock');
  if (clockEl) {
    clockEl.style.display = 'none';
    clockEl.textContent = '00:00';
    if (clockEl.classList) clockEl.classList.remove('is-overrun');
  }
}

function updateRestClockDisplay(targetRestOverride = undefined) {
  if (!restStartTime || activeSet) return;
  if (targetRestOverride !== undefined) {
    lastDisplayedRestTargetSeconds = targetRestOverride;
  }
  currentRestElapsedSeconds = Math.max(0, Math.round((Date.now() - restStartTime) / 1000));
  const elapsedStr = formatRestClockMmSs(currentRestElapsedSeconds);

  const restEl = document.getElementById('summary-rest-time');
  if (restEl) restEl.textContent = elapsedStr;

  const headerTicker = document.getElementById('header-rest-ticker');
  const headerTime = document.getElementById('header-rest-time');
  if (headerTime) headerTime.textContent = elapsedStr;
  if (headerTicker) headerTicker.style.display = 'inline-flex';

  const clockEl = sessionRestClock || document.getElementById('session-rest-clock');
  if (clockEl) {
    const targetRest = (typeof lastDisplayedRestTargetSeconds === 'number' && lastDisplayedRestTargetSeconds > 0)
      ? lastDisplayedRestTargetSeconds
      : resolveTargetRestSeconds(null);
    if (targetRest && targetRest > 0) {
      if (currentRestElapsedSeconds <= targetRest) {
        clockEl.textContent = formatRestClockMmSs(targetRest - currentRestElapsedSeconds);
        if (clockEl.classList) clockEl.classList.remove('is-overrun');
      } else {
        clockEl.textContent = `-${formatRestClockMmSs(currentRestElapsedSeconds - targetRest)}`;
        if (clockEl.classList) clockEl.classList.add('is-overrun');
      }
    } else {
      clockEl.textContent = `+${elapsedStr}`;
      if (clockEl.classList) clockEl.classList.remove('is-overrun');
    }
    clockEl.style.display = 'inline-flex';
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

  // Dismiss Post-Set Summary Banner (R1)
  const summaryBanner = document.getElementById('set-summary-banner');
  if (summaryBanner) {
    summaryBanner.classList.remove('visible');
  }
  if (typeof AthleteFX !== 'undefined' && typeof AthleteFX.dismissSummaryBanner === 'function') {
    AthleteFX.dismissSummaryBanner();
  }

  // Stop & Reset Inter-Set Rest Stopwatch (R2) — always log true positive elapsed restSeconds
  if (restStartTime) {
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - restStartTime) / 1000));
    if (activeWorkout && Array.isArray(activeWorkout.sets) && activeWorkout.sets.length > 0) {
      const previousSet = activeWorkout.sets[activeWorkout.sets.length - 1];
      if (previousSet) {
        previousSet.restSeconds = elapsedSeconds;
        if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
          const completedPayload = {
            setId: previousSet.setId,
            setNumber: previousSet.setNumber,
            lift: previousSet.lift,
            weight: previousSet.weight,
            reps: Array.isArray(previousSet.reps) ? [...previousSet.reps] : [],
            avgVelocity: previousSet.avgVelocity,
            maxVelocity: previousSet.maxVelocity,
            velocityLoss: previousSet.velocityLossPct,
            restSeconds: previousSet.restSeconds,
            timestamp: previousSet.endTime || Date.now()
          };
          if (previousSet.plannedWorkoutId) completedPayload.plannedWorkoutId = previousSet.plannedWorkoutId;
          if (previousSet.plannedSlotId) completedPayload.plannedSlotId = previousSet.plannedSlotId;
          if (typeof previousSet.avgRpe === 'number' && !isNaN(previousSet.avgRpe)) completedPayload.avgRpe = previousSet.avgRpe;
          if (typeof previousSet.targetRpe === 'number' && !isNaN(previousSet.targetRpe)) completedPayload.targetRpe = previousSet.targetRpe;
          completedPayload.athleteId = getActiveAthleteId();
          if (previousSet.isPR || previousSet.isPr) completedPayload.isPr = true;
          if (previousSet.prType) completedPayload.prType = previousSet.prType;
          if (typeof previousSet.maxDeviationCm === 'number' && !isNaN(previousSet.maxDeviationCm)) {
            completedPayload.maxDeviationCm = previousSet.maxDeviationCm;
          }
          window.ErosSyncBus.emit('set:completed', completedPayload);
        }
      }
    }
  }
  if (interSetRestInterval) {
    clearInterval(interSetRestInterval);
    interSetRestInterval = null;
  }
  restStartTime = null;
  currentRestElapsedSeconds = 0;
  lastDisplayedRestTargetSeconds = null;
  hideRestClockUI();

  const setLift = canonicalLift(lift || currentLift);
  const setNumber = activeWorkout.sets.length + 1;
  const setWeight = (typeof currentWorkingWeight === 'number' && !isNaN(currentWorkingWeight))
    ? currentWorkingWeight
    : getLastWeightForLift(setLift);
  currentWorkingWeight = setWeight;
  if (liveSetWeightInput) liveSetWeightInput.value = setWeight.toFixed(1);
  if (workoutSetWeightInput) workoutSetWeightInput.value = setWeight.toFixed(1);
  syncLiveWeightDisplay(setWeight.toFixed(1));

  const resolvedPlannedWorkoutId = activePlannedWorkoutId || (activeWorkout && activeWorkout.plannedWorkoutId) || null;
  const resolvedPlannedSlotId = resolvePlannedSlotIdForSet(resolvedPlannedWorkoutId, setLift);

  const newSet = {
    setId: `set_${Date.now()}_${setNumber}`,
    setNumber: setNumber,
    lift: setLift,
    weight: setWeight,
    targetRpe: currentTargetRpe,
    prescribedRestSeconds: activeCoachTargetRestSeconds || null,
    plannedWorkoutId: resolvedPlannedWorkoutId,
    plannedSlotId: resolvedPlannedSlotId,
    isPR: false,
    isPr: false,
    prType: null,
    startTime: Date.now(),
    endTime: null,
    restSeconds: null,
    avgVelocity: 0.0,
    maxVelocity: 0.0,
    minVelocity: 0.0,
    velocityLossPct: 0.0,
    avgRpe: 0.0,
    reps: []
  };

  activeWorkout.sets.push(newSet);
  activeSet = newSet;
  lastReplayableSet = newSet;
  if (activeWorkout) {
    activeWorkout.name = formatWorkoutTitle(activeWorkout);
  }

  // Update Controls UI & Floating Set Dock
  updatePlayStopButtonVisual(btnSetToggle, btnSetText, 'END SET', 'Stop Set', true);
  if (btnSetToggle) {
    btnSetToggle.classList.add('set-active');
    btnSetToggle.classList.add('recording');
    btnSetToggle.style.display = 'none';
  }
  const btnCompleteSetEl = document.getElementById('btn-complete-set');
  if (btnCompleteSetEl) btnCompleteSetEl.style.display = 'inline-flex';
  if (controlsPanel) {
    controlsPanel.classList.add('set-active-compact');
  }

  if (liveVelocity) liveVelocity.textContent = '0.00';
  if (livePeakVel) livePeakVel.textContent = '0.00';
  if (livePeakSub) livePeakSub.textContent = `Set ${setNumber} Initialized`;

  updateLiveMiniHud();
  updateSetUI(activeSet);
  updateWorkoutPage();
  if (typeof renderVelocityChangeGraph === 'function') {
    renderVelocityChangeGraph(1.0);
  }
  if (typeof renderBarPathStage === 'function') {
    renderBarPathStage(0, 1.0);
  }
  persistStorage();

  // Dispatch to ErosSyncBus
  if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
    const startedPayload = {
      setId: newSet.setId,
      setNumber: newSet.setNumber,
      lift: newSet.lift,
      weight: newSet.weight,
      targetRpe: newSet.targetRpe,
      athleteId: getActiveAthleteId(),
      restSeconds: null,
      timestamp: newSet.startTime
    };
    if (newSet.plannedWorkoutId) startedPayload.plannedWorkoutId = newSet.plannedWorkoutId;
    if (newSet.plannedSlotId) startedPayload.plannedSlotId = newSet.plannedSlotId;
    window.ErosSyncBus.emit('set:started', startedPayload);
  }

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

  // Dispatch to ErosSyncBus before nulling activeSet
  if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function' && activeSet) {
    const completedPayload = {
      setId: activeSet.setId,
      setNumber: activeSet.setNumber,
      lift: activeSet.lift,
      weight: activeSet.weight,
      reps: Array.isArray(activeSet.reps) ? [...activeSet.reps] : [],
      avgVelocity: activeSet.avgVelocity,
      maxVelocity: activeSet.maxVelocity,
      velocityLoss: activeSet.velocityLossPct,
      restSeconds: typeof activeSet.restSeconds === 'number' ? activeSet.restSeconds : null,
      timestamp: activeSet.endTime || Date.now()
    };
    if (activeSet.plannedWorkoutId) completedPayload.plannedWorkoutId = activeSet.plannedWorkoutId;
    if (activeSet.plannedSlotId) completedPayload.plannedSlotId = activeSet.plannedSlotId;
    if (typeof activeSet.avgRpe === 'number' && !isNaN(activeSet.avgRpe)) completedPayload.avgRpe = activeSet.avgRpe;
    if (typeof activeSet.targetRpe === 'number' && !isNaN(activeSet.targetRpe)) completedPayload.targetRpe = activeSet.targetRpe;
    completedPayload.athleteId = getActiveAthleteId();
    if (activeSet.isPR || activeSet.isPr) completedPayload.isPr = true;
    if (activeSet.prType) completedPayload.prType = activeSet.prType;
    if (typeof activeSet.maxDeviationCm === 'number' && !isNaN(activeSet.maxDeviationCm)) {
      completedPayload.maxDeviationCm = activeSet.maxDeviationCm;
    }
    if (typeof activeSet.deviationCm === 'number' && !isNaN(activeSet.deviationCm)) {
      completedPayload.deviationCm = activeSet.deviationCm;
    }
    if (typeof activeSet.pathEfficiencyPct === 'number' && !isNaN(activeSet.pathEfficiencyPct)) {
      completedPayload.pathEfficiencyPct = activeSet.pathEfficiencyPct;
    }
    const lastRep = (activeSet.reps && activeSet.reps.length > 0) ? activeSet.reps[activeSet.reps.length - 1] : null;
    if (lastRep && Array.isArray(lastRep.trajectoryPoints)) {
      completedPayload.trajectoryPoints = lastRep.trajectoryPoints;
    }
    window.ErosSyncBus.emit('set:completed', completedPayload);
  }

  const completedSetForCelebration = Object.assign({}, activeSet);
  lastReplayableSet = activeSet;
  activeSet = null;

  // ── Inter-Set Rest Stopwatch & Smart Target Countdown (R2 & Phase 6)
  restStartTime = Date.now();
  currentRestElapsedSeconds = 0;
  lastDisplayedRestTargetSeconds = resolveTargetRestSeconds(completedSetForCelebration);
  if (interSetRestInterval) {
    clearInterval(interSetRestInterval);
    interSetRestInterval = null;
  }
  updateRestClockDisplay(lastDisplayedRestTargetSeconds);
  interSetRestInterval = setInterval(() => updateRestClockDisplay(), 1000);

  // Trigger Athlete Celebratory FX & Post-Set Rest Transition
  if (typeof triggerSetCompletionCelebration === 'function') {
    triggerSetCompletionCelebration(completedSetForCelebration);
  } else if (typeof window !== 'undefined' && typeof window.triggerSetCompletionCelebration === 'function') {
    window.triggerSetCompletionCelebration(completedSetForCelebration);
  }

  if (activeWorkout) {
    activeWorkout.name = formatWorkoutTitle(activeWorkout);
  }

  // Update Controls UI & Floating Set Dock
  updatePlayStopButtonVisual(btnSetToggle, btnSetText, 'START SET', 'Start Set', false);
  if (btnSetToggle) {
    btnSetToggle.classList.remove('set-active');
    btnSetToggle.classList.remove('recording');
    btnSetToggle.style.display = 'inline-flex';
  }
  const btnCompleteSetClose = document.getElementById('btn-complete-set');
  if (btnCompleteSetClose) btnCompleteSetClose.style.display = 'none';
  if (controlsPanel) {
    controlsPanel.classList.remove('set-active-compact');
  }
  if (liveRpeSub) {
    const baseline = LIFT_BASELINES[currentLift.toLowerCase()] || LIFT_BASELINES.deadlift;
    liveRpeSub.textContent = `MVT Baseline: ${baseline.mvt.toFixed(2)} m/s`;
  }

  updateLiveMiniHud();
  updateWorkoutPage();
  persistStorage();
  updateHistoryStats();
  renderHistoryView();
  maybeEvaluateSetPrCandidate(completedSetForCelebration);
  advanceActivePlannedSlotSet(completedSetForCelebration);
  renderLivePrescriptionStrip();
  renderAthletePrepHub();
  renderAthletePlanVsActual();
  if (typeof renderVelocityChangeGraph === 'function') {
    renderVelocityChangeGraph(1.0);
  }
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

const btnCompleteSetBtn = document.getElementById('btn-complete-set');
if (btnCompleteSetBtn) {
  btnCompleteSetBtn.addEventListener('click', () => {
    if (activeSet) {
      SoundFX.playSetEnd();
      HapticsFX.vibrate([40]);
      endActiveSet();
    }
  });
}

/**
 * Synthesizes deterministic 2D trajectory curve points and deviation metrics
 * for a repetition based on lift biomechanics and velocity.
 */
function synthesizeRepTrajectory(liftOrConfig, velocityArg, deviationCmArg = null, romCmArg = 50.0) {
  let lift, velocity, deviationCm, romCm, rpe;
  if (typeof liftOrConfig === 'object' && liftOrConfig !== null) {
    lift = liftOrConfig.lift;
    velocity = liftOrConfig.velocity;
    deviationCm = liftOrConfig.deviationCm;
    romCm = liftOrConfig.romCm || liftOrConfig.rom;
    rpe = liftOrConfig.rpe;
  } else {
    lift = liftOrConfig;
    velocity = velocityArg;
    deviationCm = deviationCmArg;
    romCm = romCmArg;
    rpe = 7.5;
  }

  const liftName = canonicalLift(lift || (typeof currentLift !== 'undefined' ? currentLift : 'Deadlift')).toLowerCase();
  const N = 40;
  const meanVel = Math.max(0.10, Number(velocity) || 0.45);
  const numRpe = Math.max(0, Math.min(10, Number(rpe) || 7.5));
  const rom = Math.max(20.0, Number(romCm) || 50.0);
  const repDuration = (rom / 100.0) / meanVel;

  // 1. Generate base kinematic drift dxRaw(p)
  const rawPoints = [];
  for (let i = 0; i < N; i++) {
    const p = i / (N - 1); // 0.0 to 1.0 (% ROM)
    let dxRaw = 0.0;

    if (liftName.includes('squat')) {
      // In the hole: slight anterior lean; sticking region: forward drift; lockout: returns to midfoot
      dxRaw = 0.8 * Math.pow(1 - p, 2) + 1.8 * Math.sin(Math.PI * p) * (1 - 0.4 * p);
    } else if (liftName.includes('bench')) {
      // McLaughlin J-curve: touches chest, flares backward over shoulder joint (-dx), presses to lockout
      dxRaw = 1.6 * Math.pow(1 - p, 2) - 3.2 * Math.sin(Math.PI * Math.pow(p, 0.75)) * (1 - 0.2 * p);
    } else {
      // Deadlift: sweeping into thighs as bar clears knees, stabilizing at hip lockout
      dxRaw = -0.9 * Math.sin(Math.PI * (1 - p)) + 2.0 * Math.sin(2 * Math.PI * p) * p;
    }
    rawPoints.push({ p, dxRaw });
  }

  // 2. Scale amplitude with measured DEV or RPE fatigue model
  const meanRaw = rawPoints.reduce((s, pt) => s + Math.abs(pt.dxRaw), 0) / N;
  let scale = 1.0;
  if (typeof deviationCm === 'number' && !isNaN(deviationCm) && deviationCm > 0) {
    scale = deviationCm / (meanRaw || 1.0);
  } else {
    scale = 0.8 + (numRpe / 10.0) * 0.6 + Math.max(0, 0.5 - meanVel) * 0.5;
  }

  // 3. Instantaneous velocity curve v(p) with sticking point valley
  const vPeak = Math.max(meanVel * 1.35, meanVel + 0.15);
  const vStick = Math.max(0.12, meanVel * (1.0 - 0.45 * (numRpe / 10.0)));

  const points = rawPoints.map(pt => {
    const p = pt.p;
    const dx = Math.round(pt.dxRaw * scale * 10) / 10;

    let v = meanVel;
    if (p <= 0.25) {
      v = 0.10 + (vPeak - 0.10) * Math.sin((p / 0.25) * (Math.PI / 2));
    } else if (p <= 0.55) {
      const progressInStick = (p - 0.25) / 0.30;
      v = vPeak - (vPeak - vStick) * Math.sin(progressInStick * Math.PI);
    } else {
      const progressInLockout = (p - 0.55) / 0.45;
      v = vStick + (vPeak * 0.95 - vStick) * Math.sin(progressInLockout * Math.PI);
    }
    v = Math.max(0.08, Math.round(v * 100) / 100);

    const t = Math.round(p * repDuration * 1000) / 1000;
    return { t, y: Math.round(p * 1000) / 1000, dx, v };
  });

  const maxDeviationCm = Math.round(Math.max(...points.map(pt => Math.abs(pt.dx))) * 10) / 10;
  const meanDevCm = Math.round((points.reduce((s, pt) => s + Math.abs(pt.dx), 0) / N) * 10) / 10;

  // Path efficiency % = (ROM / actualPathLength) * 100
  let actualPathLen = 0.0;
  for (let i = 1; i < N; i++) {
    const dy = (points[i].y - points[i - 1].y) * rom;
    const ddx = points[i].dx - points[i - 1].dx;
    actualPathLen += Math.sqrt(dy * dy + ddx * ddx);
  }
  const pathEfficiencyPct = Math.min(100.0, Math.round((rom / (actualPathLen || rom)) * 1000) / 10);

  return {
    points,
    trajectoryPoints: points,
    maxDeviationCm,
    deviationCm: meanDevCm,
    pathEfficiencyPct
  };
}
if (typeof window !== 'undefined') {
  window.synthesizeRepTrajectory = synthesizeRepTrajectory;
}

/**
 * Pushes an ingested repetition into the active set hierarchy
 */
function recordRepetition({ lift, velocity, rpe, deviationCm = null, trajectoryPoints = null, peakVelocity = null }) {
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
  const isSpeedRecord = checkIfSpeedPR(repLift, velocity, (activeSet && typeof activeSet.weight === 'number') ? activeSet.weight : currentWorkingWeight);
  const repObj = {
    repNumber: repNumber,
    lift: repLift,
    velocity: velocity,
    rpe: rpe,
    timestamp: Date.now(),
    isPR: isSpeedRecord
  };
  if (typeof deviationCm === 'number' && !isNaN(deviationCm)) {
    repObj.deviationCm = parseFloat(deviationCm.toFixed(1));
  }

  // Synthesize or attach trajectory points and kinematic metrics
  const romVal = (activeSet && typeof activeSet.rom === 'number') ? activeSet.rom : 50.0;
  const synth = synthesizeRepTrajectory(repLift, velocity, repObj.deviationCm, romVal);
  repObj.trajectoryPoints = (Array.isArray(trajectoryPoints) && trajectoryPoints.length > 0) ? trajectoryPoints : synth.points;
  repObj.maxDeviationCm = synth.maxDeviationCm;
  if (repObj.deviationCm == null) {
    repObj.deviationCm = synth.deviationCm;
  }
  repObj.pathEfficiencyPct = synth.pathEfficiencyPct;

  // Resolve per-rep peak velocity from trajectory points with deterministic fallback
  const ptsForPeak = repObj.trajectoryPoints || [];
  const maxPtVel = ptsForPeak.length > 0
    ? Math.max(...ptsForPeak.map(p => Number(p && p.v) || 0))
    : 0;
  const fallbackPeak = Math.max(velocity * 1.35, velocity + 0.15);
  const resolvedPeak = (typeof peakVelocity === 'number' && isFinite(peakVelocity) && peakVelocity > 0)
    ? peakVelocity
    : (maxPtVel > 0 ? Math.max(velocity, maxPtVel) : fallbackPeak);
  repObj.peakVelocity = parseFloat(resolvedPeak.toFixed(2));

  activeSet.reps.push(repObj);
  lastReplayableSet = activeSet;
  recalculateSetMetrics(activeSet);

  persistStorage();

  // Dispatch to ErosSyncBus
  if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function' && activeSet) {
    const syncRepPayload = {
      setId: activeSet.setId,
      repNumber: repObj.repNumber,
      velocity: repObj.velocity,
      peakVelocity: (typeof repObj.peakVelocity === 'number') ? repObj.peakVelocity : repObj.velocity,
      rom: (typeof repObj.rom === 'number') ? repObj.rom : 50.0,
      rpe: repObj.rpe,
      lossPercent: activeSet.velocityLossPct,
      deviationCm: repObj.deviationCm,
      maxDeviationCm: repObj.maxDeviationCm,
      pathEfficiencyPct: repObj.pathEfficiencyPct,
      trajectoryPoints: repObj.trajectoryPoints
    };
    if (activeSet.plannedWorkoutId) syncRepPayload.plannedWorkoutId = activeSet.plannedWorkoutId;
    if (activeSet.plannedSlotId) syncRepPayload.plannedSlotId = activeSet.plannedSlotId;
    if (repObj.isPR) syncRepPayload.isPr = true;
    window.ErosSyncBus.emit('rep:recorded', syncRepPayload);
  }

  const prCandidate = evaluatePrCandidate({
    lift: repLift,
    weight: activeSet.weight,
    velocity: velocity,
    rpe: rpe,
    setId: activeSet.setId,
    workoutId: activeSet.plannedWorkoutId || (activeWorkout && activeWorkout.id) || null,
    slotId: activeSet.plannedSlotId || null,
    repNumber: repObj.repNumber,
    timestamp: repObj.timestamp
  });
  if (prCandidate) {
    showPrConfirmHud(prCandidate);
  }

  // Play rep chime and trigger light haptic pulse
  SoundFX.playRepPopChime(velocity, rpe, activeSet ? activeSet.exercise : currentLift);
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
  updateRpeHeroBanner(rpe, repObj);
  updateSetUI(activeSet);
  updateLiveMiniHud();
  updateHistoryStats();
  renderAthletePlanVsActual();

  // Synchronously reflect latest Mean/Peak velocity readouts for instant DOM consistency
  if (liveVelocity) liveVelocity.textContent = (Number(repObj.velocity) || 0).toFixed(2);
  if (livePeakVel) {
    const setMax = (activeSet && activeSet.maxVelocity > 0) ? activeSet.maxVelocity : repObj.peakVelocity;
    livePeakVel.textContent = Number(setMax).toFixed(2);
  }

  const velCanvasEl = velocityChangeCanvas || document.getElementById('velocity-change-canvas');
  if (velCanvasEl && typeof velCanvasEl.getBoundingClientRect !== 'function' && typeof renderVelocityChangeGraph === 'function') {
    renderVelocityChangeGraph(1.0);
  }

  // Asynchronous UI Dispatch (Non-blocking Observability)
  requestAnimationFrame(() => {
    updateLiveDisplay(repObj, true);
    renderBarPathStage(repObj.repNumber - 1, 1.0);
    if (typeof triggerVelocityGraphTween === 'function') {
      triggerVelocityGraphTween();
    }
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
  const peakVels = set.reps.map(r => (typeof r.peakVelocity === 'number' && r.peakVelocity > 0) ? r.peakVelocity : r.velocity);
  const rpes = set.reps.map(r => r.rpe);

  const sumV = vels.reduce((a, b) => a + b, 0);
  const sumR = rpes.reduce((a, b) => a + b, 0);

  const maxMeanV = Math.max(...vels);
  const maxPeakV = Math.max(...peakVels);
  const minV = Math.min(...vels);
  const lastV = vels[vels.length - 1];

  set.avgVelocity = parseFloat((sumV / vels.length).toFixed(2));
  set.maxVelocity = parseFloat(maxPeakV.toFixed(2));
  set.minVelocity = parseFloat(minV.toFixed(2));
  set.avgRpe      = parseFloat((sumR / rpes.length).toFixed(1));

  const devs = set.reps
    .map(r => r.deviationCm)
    .filter(d => typeof d === 'number' && !isNaN(d));
  if (devs.length > 0) {
    set.maxDeviationCm = parseFloat(Math.max(...devs.map(d => Math.abs(d))).toFixed(1));
    set.deviationCm = parseFloat((devs.reduce((a, b) => a + b, 0) / devs.length).toFixed(1));
  }
  const effs = set.reps
    .map(r => r.pathEfficiencyPct)
    .filter(e => typeof e === 'number' && !isNaN(e));
  if (effs.length > 0) {
    set.pathEfficiencyPct = parseFloat((effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(1));
  }

  // Velocity Loss Calculation: ((MaxMean - LastMean) / MaxMean) * 100
  if (maxMeanV > 0) {
    const loss = ((maxMeanV - lastV) / maxMeanV) * 100;
    set.velocityLossPct = parseFloat(Math.max(0, loss).toFixed(1));
  } else {
    set.velocityLossPct = 0.0;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2D BARBELL VERTICAL DEVIATION, LIVE VELOCITY GRAPH & REPLAY ENGINE (R1 & Phase 6)
// ═════════════════════════════════════════════════════════════════════════════

let barPathMode = 'path'; // 'path' or 'vel'
let currentReplayRepIdx = 0;
let replaySpeed = 1.0;
let isReplaying = false;
let replayAnimId = null;

const velGraphState = {
  yMin: 0.0,
  yMax: 1.0,
  xMax: 5.0,
  animId: null,
  animStart: 0,
  durationMs: 380,
  hitTargets: []
};

const repReplayModalState = {
  isOpen: false,
  repIdx: 0,
  setRef: null
};

/**
 * Syncs canvas backing-store dimensions to devicePixelRatio when mounted in a browser layout,
 * falling back cleanly to explicit attribute dimensions in headless / Node DOM test harnesses.
 */
function syncCanvasDpr(canvas, fallbackW, fallbackH) {
  if (!canvas || !canvas.getContext) return { ctx: null, w: fallbackW, h: fallbackH, dpr: 1, isHeadless: true };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ctx: null, w: fallbackW, h: fallbackH, dpr: 1, isHeadless: true };

  if (typeof canvas.getBoundingClientRect === 'function') {
    const rect = canvas.getBoundingClientRect();
    if (rect && rect.width >= 40 && rect.height >= 80) {
      const dpr = Math.min(3, Math.max(1, (typeof window !== 'undefined' && Number(window.devicePixelRatio) > 0) ? Number(window.devicePixelRatio) : 1));
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;
      if (typeof ctx.setTransform === 'function') {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { ctx, w: rect.width, h: rect.height, dpr, isHeadless: false };
    }
  }

  const w = canvas.width || fallbackW;
  const h = canvas.height || fallbackH;
  if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return { ctx, w, h, dpr: 1, isHeadless: true };
}

/**
 * Piecewise exertion intensity color ramp for Bar Path trajectory:
 * [0.00-0.30] #FFFFFF -> #00E5FF
 * [0.30-0.65] #00E5FF -> #FFB800
 * [0.65-1.00] #FFB800 -> #FF3B30
 */
function getExertionRgb(d) {
  const t = Math.max(0, Math.min(1, Number(d) || 0));
  let r, g, b;
  if (t <= 0.30) {
    const u = t / 0.30;
    r = Math.round(255 + u * (0 - 255));
    g = Math.round(255 + u * (229 - 255));
    b = Math.round(255 + u * (255 - 255));
  } else if (t <= 0.65) {
    const u = (t - 0.30) / 0.35;
    r = Math.round(0 + u * (255 - 0));
    g = Math.round(229 + u * (184 - 229));
    b = Math.round(255 + u * (0 - 255));
  } else {
    const u = (t - 0.65) / 0.35;
    r = 255;
    g = Math.round(184 + u * (59 - 184));
    b = Math.round(0 + u * (48 - 0));
  }
  return { r, g, b, css: `rgb(${r}, ${g}, ${b})` };
}

/**
 * Exertion ramp for Mean Velocity graph curve & rep dots:
 * [0.00-0.33] #00FF66 -> #00E5FF
 * [0.33-0.66] #00E5FF -> #FFB800
 * [0.66-1.00] #FFB800 -> #FF3B30
 */
function getVelocityCurveRgb(d) {
  const t = Math.max(0, Math.min(1, Number(d) || 0));
  let r, g, b;
  if (t <= 0.33) {
    const u = t / 0.33;
    r = 0;
    g = Math.round(255 + u * (229 - 255));
    b = Math.round(102 + u * (255 - 102));
  } else if (t <= 0.66) {
    const u = (t - 0.33) / 0.33;
    r = Math.round(0 + u * (255 - 0));
    g = Math.round(229 + u * (184 - 229));
    b = Math.round(255 + u * (0 - 255));
  } else {
    const u = (t - 0.66) / 0.34;
    r = 255;
    g = Math.round(184 + u * (59 - 184));
    b = Math.round(0 + u * (48 - 0));
  }
  return { r, g, b, css: `rgb(${r}, ${g}, ${b})` };
}

function computeRepDifficulty(rep, repNumber, maxSetMeanVel) {
  const rpeVal = (rep && typeof rep.rpe === 'number' && !isNaN(rep.rpe)) ? rep.rpe : 7.0;
  const meanVel = (rep && typeof rep.velocity === 'number' && !isNaN(rep.velocity)) ? rep.velocity : 0.5;
  const rpeFactor = Math.max(0, Math.min(1, (rpeVal - 6.0) / 4.0));
  const velDrop = maxSetMeanVel > 0 ? Math.max(0, (maxSetMeanVel - meanVel) / maxSetMeanVel) : 0;
  return Math.max(0, Math.min(1, Math.max(rpeFactor, velDrop / 0.25 + (repNumber - 1) * 0.05)));
}

function resolveRepPeakVelocity(rep) {
  if (!rep) return 0;
  if (typeof rep.peakVelocity === 'number' && isFinite(rep.peakVelocity) && rep.peakVelocity > 0) {
    return rep.peakVelocity;
  }
  const pts = Array.isArray(rep.trajectoryPoints) ? rep.trajectoryPoints : [];
  if (pts.length > 0) {
    const ptMax = Math.max(...pts.map(p => Number(p && p.v) || 0));
    if (ptMax > 0) return parseFloat(Math.max(Number(rep.velocity) || 0, ptMax).toFixed(2));
  }
  const meanVel = Math.max(0, Number(rep.velocity) || 0);
  return parseFloat(Math.max(meanVel * 1.35, meanVel + 0.15).toFixed(2));
}

function getLiveDisplaySetForGraphs() {
  if (activeSet) return activeSet;
  if (lastReplayableSet && Array.isArray(lastReplayableSet.reps) && lastReplayableSet.reps.length > 0) {
    return lastReplayableSet;
  }
  if (activeWorkout && Array.isArray(activeWorkout.sets) && activeWorkout.sets.length > 0) {
    const latest = activeWorkout.sets[activeWorkout.sets.length - 1];
    if (latest && Array.isArray(latest.reps) && latest.reps.length > 0) return latest;
  }
  return null;
}

function triggerVelocityGraphTween() {
  const canvas = velocityChangeCanvas || document.getElementById('velocity-change-canvas');
  if (!canvas || !canvas.getContext) return;
  if (typeof canvas.getBoundingClientRect !== 'function' || typeof requestAnimationFrame !== 'function') {
    renderVelocityChangeGraph(1.0);
    return;
  }

  if (velGraphState.animId) {
    cancelAnimationFrame(velGraphState.animId);
    velGraphState.animId = null;
  }

  velGraphState.animStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const step = (now) => {
    const curNow = now || Date.now();
    const elapsed = curNow - velGraphState.animStart;
    const progress = Math.min(1.0, elapsed / velGraphState.durationMs);
    renderVelocityChangeGraph(progress);
    if (progress < 1.0) {
      velGraphState.animId = requestAnimationFrame(step);
    } else {
      velGraphState.animId = null;
      renderVelocityChangeGraph(1.0);
    }
  };
  velGraphState.animId = requestAnimationFrame(step);
}

function renderVelocityChangeGraph(animProgress = 1.0) {
  const canvas = velocityChangeCanvas || document.getElementById('velocity-change-canvas');
  if (!canvas || !canvas.getContext) return;
  const { ctx, w, h, isHeadless } = syncCanvasDpr(canvas, 420, 240);
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);

  const displaySet = getLiveDisplaySetForGraphs();
  const reps = (displaySet && Array.isArray(displaySet.reps)) ? displaySet.reps : [];
  const maxMeanVel = reps.length > 0 ? Math.max(...reps.map(r => Number(r.velocity) || 0)) : 0;

  const series = reps.map((rep, i) => {
    const repNumber = rep.repNumber || (i + 1);
    const meanVelocity = Math.max(0.05, Number(rep.velocity) || 0);
    const peakVelocity = Math.max(meanVelocity, resolveRepPeakVelocity(rep));
    const rpe = (typeof rep.rpe === 'number' && !isNaN(rep.rpe)) ? rep.rpe : 7.5;
    const difficulty = computeRepDifficulty(rep, repNumber, maxMeanVel);
    return { repNumber, meanVelocity, peakVelocity, rpe, difficulty, repIdx: i };
  });

  // Smooth damped Y/X auto-scaling
  let targetYMin = 0.0;
  let targetYMax = 1.0;
  let targetXMax = 5.0;
  if (series.length > 0) {
    const dataMin = Math.min(...series.map(s => s.meanVelocity));
    const dataMax = Math.max(...series.map(s => Math.max(s.peakVelocity, s.meanVelocity)));
    targetYMin = dataMin < 0.25 ? 0.0 : Math.max(0, Math.floor((dataMin - 0.12) * 10) / 10);
    targetYMax = Math.max(0.90, Math.ceil((dataMax + 0.12) * 10) / 10);
    targetXMax = Math.max(5, series.length);
  }

  if (animProgress >= 0.999 && velGraphState.animId === null) {
    velGraphState.yMin = targetYMin;
    velGraphState.yMax = targetYMax;
    velGraphState.xMax = targetXMax;
  } else {
    velGraphState.yMin += (targetYMin - velGraphState.yMin) * 0.22;
    velGraphState.yMax += (targetYMax - velGraphState.yMax) * 0.22;
    velGraphState.xMax += (targetXMax - velGraphState.xMax) * 0.24;
  }

  const yMin = velGraphState.yMin;
  const yMax = Math.max(yMin + 0.3, velGraphState.yMax);
  const xMax = Math.max(5, velGraphState.xMax);

  const pad = { left: 26, right: 14, top: 20, bottom: 28 };
  const plotW = Math.max(40, w - pad.left - pad.right);
  const plotH = Math.max(40, h - pad.top - pad.bottom);

  const mapX = (repNum) => {
    if (xMax <= 1) return pad.left + plotW / 2;
    return pad.left + ((repNum - 1) / (xMax - 1)) * plotW;
  };
  const mapY = (v) => {
    const norm = (v - yMin) / (yMax - yMin);
    return pad.top + plotH - Math.max(0, Math.min(1, norm)) * plotH;
  };

  // Faint whisper target & baseline hairlines (minimalist hints)
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  [0.25, 0.65].forEach(frac => {
    const hy = pad.top + plotH * frac;
    ctx.beginPath();
    ctx.moveTo(pad.left, hy);
    ctx.lineTo(w - pad.right, hy);
    ctx.stroke();
  });

  // Target velocity whisper reference
  const effLift = canonicalLift((displaySet && displaySet.lift) || currentLift || 'Deadlift');
  const baseline = LIFT_BASELINES[effLift.toLowerCase()] || LIFT_BASELINES.deadlift;
  const effTargetRpe = (displaySet && typeof displaySet.targetRpe === 'number') ? displaySet.targetRpe : currentTargetRpe;
  const targetVel = baseline.rpe8 + (8.0 - effTargetRpe) * ((baseline.rpe8 - baseline.mvt) / 2.0);
  if (targetVel >= yMin && targetVel <= yMax) {
    const ty = mapY(targetVel);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, ty);
    ctx.lineTo(w - pad.right, ty);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Quiet muted #71717a corner labels
  ctx.fillStyle = '#71717a';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('v (m/s)', pad.left, 11);
  ctx.fillText(yMax.toFixed(1), 2, pad.top + 4);
  ctx.fillText(yMin.toFixed(1), 2, pad.top + plotH);

  const tickY = pad.top + plotH + 11;
  const slotCount = Math.max(5, series.length);
  ctx.textAlign = 'center';
  for (let n = 1; n <= slotCount; n++) {
    if (slotCount > 8 && n !== 1 && n !== slotCount && n % 2 === 0) continue;
    ctx.fillText(String(n), mapX(n), tickY);
  }

  ctx.textAlign = 'right';
  ctx.fillText('n. reps', w - pad.right, h - 4);
  ctx.restore();

  velGraphState.hitTargets = [];

  if (series.length === 0) {
    ctx.save();
    ctx.fillStyle = '#71717a';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Waiting for Rep 1', pad.left + plotW / 2, pad.top + plotH / 2);
    ctx.restore();
    return;
  }

  const clampedProg = Math.max(0, Math.min(1, animProgress));
  const easedProg = 1 - Math.pow(1 - clampedProg, 3);

  const coords = series.map((pt, idx) => {
    let x = mapX(pt.repNumber);
    let yMean = mapY(pt.meanVelocity);
    let yPeak = mapY(pt.peakVelocity);
    if (idx === series.length - 1 && clampedProg < 1.0 && series.length > 1) {
      const prev = series[idx - 1];
      const prevX = mapX(prev.repNumber);
      const prevMeanY = mapY(prev.meanVelocity);
      const prevPeakY = mapY(prev.peakVelocity);
      x = prevX + (x - prevX) * easedProg;
      yMean = prevMeanY + (yMean - prevMeanY) * easedProg;
      yPeak = prevPeakY + (yPeak - prevPeakY) * easedProg;
    }
    return {
      x,
      yMean,
      yPeak,
      repNumber: pt.repNumber,
      repIdx: pt.repIdx,
      meanVelocity: pt.meanVelocity,
      peakVelocity: pt.peakVelocity,
      rpe: pt.rpe,
      difficulty: pt.difficulty,
      rgb: getVelocityCurveRgb(pt.difficulty)
    };
  });

  // Subtle vertical gradient fill wash under Mean Velocity curve
  const latestCoord = coords[coords.length - 1];
  if (coords.length >= 2 && typeof ctx.createLinearGradient === 'function') {
    ctx.save();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, `rgba(${latestCoord.rgb.r}, ${latestCoord.rgb.g}, ${latestCoord.rgb.b}, 0.14)`);
    grad.addColorStop(1, `rgba(${latestCoord.rgb.r}, ${latestCoord.rgb.g}, ${latestCoord.rgb.b}, 0.00)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(coords[0].x, pad.top + plotH);
    coords.forEach(c => ctx.lineTo(c.x, c.yMean));
    ctx.lineTo(latestCoord.x, pad.top + plotH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Peak Velocity upper curve: dashed #00E5FF (1.75px, [4, 4])
  if (coords.length >= 2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.65)';
    ctx.lineWidth = 1.75;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].yPeak);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i].x, coords[i].yPeak);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Mean Velocity lower curve: exertion-colored 2.5px solid segments
  if (coords.length >= 2) {
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    for (let i = 1; i < coords.length; i++) {
      ctx.strokeStyle = coords[i].rgb.css;
      ctx.beginPath();
      ctx.moveTo(coords[i - 1].x, coords[i - 1].yMean);
      ctx.lineTo(coords[i].x, coords[i].yMean);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Render Peak (3.5px glowing #00E5FF) & Mean (5px glowing + #212121 ring) rep dots
  coords.forEach((c, idx) => {
    const isLatest = idx === coords.length - 1;
    const popScale = (isLatest && clampedProg < 1.0)
      ? Math.min(1.12, easedProg * 1.12)
      : 1.0;

    // Peak dot halo + core
    ctx.save();
    ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
    ctx.beginPath();
    ctx.arc(c.x, c.yPeak, 8 * popScale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#00E5FF';
    ctx.beginPath();
    ctx.arc(c.x, c.yPeak, 3.5 * popScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Mean dot glow + #212121 separation ring + exertion core
    ctx.save();
    ctx.fillStyle = `rgba(${c.rgb.r}, ${c.rgb.g}, ${c.rgb.b}, 0.28)`;
    ctx.beginPath();
    ctx.arc(c.x, c.yMean, 10 * popScale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.arc(c.x, c.yMean, 6.2 * popScale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = c.rgb.css;
    ctx.beginPath();
    ctx.arc(c.x, c.yMean, 5 * popScale, 0, Math.PI * 2);
    ctx.fill();

    // Arrival ring pop on incoming rep
    if (isLatest && clampedProg < 1.0) {
      const ringR = 5 + 11 * easedProg;
      const ringAlpha = (1 - easedProg) * 0.7;
      ctx.strokeStyle = `rgba(${c.rgb.r}, ${c.rgb.g}, ${c.rgb.b}, ${ringAlpha.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.x, c.yMean, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    velGraphState.hitTargets.push({
      x: c.x,
      y: c.yMean,
      peakY: c.yPeak,
      repIdx: c.repIdx,
      repNumber: c.repNumber,
      setRef: displaySet
    });
  });

  // Latest dot quiet value tag
  if (latestCoord) {
    ctx.save();
    ctx.font = '9px monospace';
    ctx.textAlign = latestCoord.x > w - 42 ? 'right' : 'center';
    ctx.fillStyle = '#00E5FF';
    ctx.fillText(latestCoord.peakVelocity.toFixed(2), latestCoord.x, Math.max(12, latestCoord.yPeak - 9));
    ctx.fillStyle = latestCoord.rgb.css;
    ctx.fillText(latestCoord.meanVelocity.toFixed(2), latestCoord.x, Math.min(pad.top + plotH - 3, latestCoord.yMean + 15));
    ctx.restore();
  }
}

function findVelGraphHitTarget(clientX, clientY, canvas) {
  if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < velGraphState.hitTargets.length; i++) {
    const t = velGraphState.hitTargets[i];
    const dMean = Math.hypot(x - t.x, y - t.y);
    const dPeak = Math.hypot(x - t.x, y - t.peakY);
    const dCol = Math.abs(x - t.x);
    const d = Math.min(dMean, dPeak);
    if ((d <= 28 || dCol <= 18) && d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function renderBarPathStage(repIndex = 0, scrubProgress = 1.0, targetCanvasOverride = null, setOverride = null) {
  const canvas = targetCanvasOverride || document.getElementById('bar-path-canvas');
  if (!canvas || !canvas.getContext) return;
  const fallbackW = targetCanvasOverride ? 240 : 220;
  const fallbackH = targetCanvasOverride ? 240 : 210;
  const { ctx, w, h, isHeadless } = syncCanvasDpr(canvas, fallbackW, fallbackH);
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);

  // Transparent background for seamless card integration
  ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  ctx.fillRect(0, 0, w, h);

  const sourceSet = setOverride || activeSet;
  const reps = (sourceSet && Array.isArray(sourceSet.reps)) ? sourceSet.reps : [];
  if (reps.length === 0) {
    const centerX = w / 2;
    const cmRange = 4.5;
    const scaleX = Math.min(18, Math.max(4, (w / 2 - 10) / cmRange));
    const topY = isHeadless ? 25 : Math.max(16, Math.round(h * 0.08));
    const botY = isHeadless ? 185 : Math.max(topY + 60, h - Math.max(16, Math.round(h * 0.08)));
    const travelY = botY - topY;

    // Optimal corridor (+-2.0cm)
    ctx.fillStyle = 'rgba(0, 255, 102, 0.04)';
    ctx.fillRect(centerX - 2 * scaleX, topY, 4 * scaleX, travelY);

    ctx.strokeStyle = 'rgba(0, 255, 102, 0.25)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - 2 * scaleX, topY); ctx.lineTo(centerX - 2 * scaleX, botY);
    ctx.moveTo(centerX + 2 * scaleX, topY); ctx.lineTo(centerX + 2 * scaleX, botY);
    ctx.stroke();

    // Warning corridor (+-4.0cm)
    ctx.strokeStyle = 'rgba(255, 184, 0, 0.20)';
    ctx.beginPath();
    ctx.moveTo(centerX - 4 * scaleX, topY); ctx.lineTo(centerX - 4 * scaleX, botY);
    ctx.moveTo(centerX + 4 * scaleX, topY); ctx.lineTo(centerX + 4 * scaleX, botY);
    ctx.stroke();

    // 0.0 cm Plumb Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX, topY);
    ctx.lineTo(centerX, botY);
    ctx.stroke();

    // Resting dot at starting position
    const effLift = (typeof currentLift !== 'undefined' && currentLift ? String(currentLift) : 'Squat').toLowerCase();
    const isDeadlift = effLift.includes('dead');
    const restY = isDeadlift ? botY : topY;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, restY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Empty state text (compact on narrow column, full phrase in headless tests)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = isHeadless ? '10px -apple-system, BlinkMacSystemFont, monospace' : '9px -apple-system, BlinkMacSystemFont, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(w < 140 ? 'READY' : 'WAITING FOR REP 1...', w / 2, h / 2);

    if (!targetCanvasOverride) {
      const devEl = document.getElementById('barpath-hud-dev');
      const effEl = document.getElementById('barpath-hud-eff');
      if (devEl) devEl.textContent = '0.0 cm';
      if (effEl) effEl.textContent = '100%';
      updateRepPills(0, 0);
    }
    return;
  }

  const targetIdx = Math.min(Math.max(0, repIndex), reps.length - 1);
  if (!targetCanvasOverride) {
    currentReplayRepIdx = targetIdx;
  }
  const currentRep = reps[targetIdx];
  const pts = currentRep.trajectoryPoints || [];
  if (pts.length < 2) return;

  if (!targetCanvasOverride) {
    const devEl = document.getElementById('barpath-hud-dev');
    const effEl = document.getElementById('barpath-hud-eff');
    const devVal = (typeof currentRep.deviationCm === 'number') ? currentRep.deviationCm : 0.0;
    const effVal = (typeof currentRep.pathEfficiencyPct === 'number') ? currentRep.pathEfficiencyPct : 100.0;
    if (devEl) devEl.textContent = `${devVal >= 0 ? '+' : ''}${devVal.toFixed(1)} cm`;
    if (effEl) effEl.textContent = `${effVal.toFixed(1)}%`;
  }

  if (barPathMode === 'path' || targetCanvasOverride) {
    renderPathMode(ctx, w, h, pts, scrubProgress, reps, targetIdx, isHeadless);
  } else {
    renderVelocityMode(ctx, w, h, pts, scrubProgress);
  }

  if (!targetCanvasOverride) {
    updateRepPills(reps.length, targetIdx);
  }
}

function renderPathMode(ctx, w, h, pts, scrubProgress, reps, targetIdx, isHeadless = true) {
  const centerX = w / 2;
  const maxAbsDx = Math.max(2.0, ...pts.map(pt => Math.abs(Number(pt && pt.dx) || 0)));
  const cmRange = Math.max(4.5, maxAbsDx + 0.8);
  const scaleX = Math.min(18, Math.max(4, (w / 2 - 10) / cmRange));
  const topY = isHeadless ? 25 : Math.max(16, Math.round(h * 0.08));
  const botY = isHeadless ? 185 : Math.max(topY + 60, h - Math.max(16, Math.round(h * 0.08)));

  const mapX = (dx) => Math.max(8, Math.min(w - 8, centerX + dx * scaleX));
  const mapY = (y) => {
    const normY = y > 1.5 ? (y / 50.0) : y;
    return botY - normY * (botY - topY);
  };

  // Subtle vertical Canvas linearGradient plumb-corridor glow
  if (typeof ctx.createLinearGradient === 'function') {
    const corridorGrad = ctx.createLinearGradient(0, botY, 0, topY);
    corridorGrad.addColorStop(0, 'rgba(255, 255, 255, 0.02)');
    corridorGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.04)');
    corridorGrad.addColorStop(1, 'rgba(255, 59, 48, 0.05)');
    ctx.fillStyle = corridorGrad;
    ctx.fillRect(centerX - 2 * scaleX, topY, 4 * scaleX, botY - topY);
  } else {
    ctx.fillStyle = 'rgba(0, 255, 102, 0.04)';
    ctx.fillRect(centerX - 2 * scaleX, topY, 4 * scaleX, botY - topY);
  }

  // 1. Optimal Corridor (+-2.0cm)
  ctx.strokeStyle = 'rgba(0, 255, 102, 0.25)';
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX - 2 * scaleX, topY); ctx.lineTo(centerX - 2 * scaleX, botY);
  ctx.moveTo(centerX + 2 * scaleX, topY); ctx.lineTo(centerX + 2 * scaleX, botY);
  ctx.stroke();

  // 2. Warning Corridor (+-4.0cm)
  ctx.strokeStyle = 'rgba(255, 184, 0, 0.20)';
  ctx.beginPath();
  ctx.moveTo(centerX - 4 * scaleX, topY); ctx.lineTo(centerX - 4 * scaleX, botY);
  ctx.moveTo(centerX + 4 * scaleX, topY); ctx.lineTo(centerX + 4 * scaleX, botY);
  ctx.stroke();

  // 3. 0.0 cm Plumb Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(centerX, topY);
  ctx.lineTo(centerX, botY);
  ctx.stroke();

  // Axis Labels (preserved in headless Node DOM checks; omitted on browser narrow column for clean minimalism)
  if (isHeadless) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0.0', centerX, botY + 14);
    ctx.fillText('-2', centerX - 2 * scaleX, botY + 14);
    ctx.fillText('+2', centerX + 2 * scaleX, botY + 14);
  }

  // Rep 1 Ghost Trail (dashed) if current rep is not Rep 1
  if (targetIdx > 0 && reps.length > 0 && reps[0].trajectoryPoints) {
    const rep1Pts = reps[0].trajectoryPoints;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(mapX(rep1Pts[0].dx), mapY(rep1Pts[0].y));
    for (let i = 1; i < rep1Pts.length; i++) {
      ctx.lineTo(mapX(rep1Pts[i].dx), mapY(rep1Pts[i].y));
    }
    ctx.stroke();
    ctx.restore();
  }

  // Compute exertion intensity gradient across segments using getExertionRgb(d)
  const currentRep = reps[targetIdx] || {};
  const repRpe = (typeof currentRep.rpe === 'number' && !isNaN(currentRep.rpe)) ? currentRep.rpe : 7.5;
  const maxSetMean = reps.length > 0 ? Math.max(...reps.map(r => Number(r && r.velocity) || 0)) : 0;
  const baseRepDiff = computeRepDifficulty(currentRep, targetIdx + 1, maxSetMean);
  const vPeakPt = Math.max(0.25, ...pts.map(p => Number(p && p.v) || 0));

  const pointDiff = (pt, idx) => {
    const romP = pts.length > 1 ? idx / (pts.length - 1) : 1.0;
    const stickDrop = Math.max(0, Math.min(1, (vPeakPt - (Number(pt.v) || vPeakPt)) / Math.max(0.1, vPeakPt - 0.15)));
    if (repRpe <= 6.5 && baseRepDiff < 0.20) {
      return 0.04 + 0.22 * Math.pow(romP, 2);
    }
    return Math.max(0, Math.min(1, (0.58 * baseRepDiff + 0.42 * stickDrop) * (0.35 + 0.75 * romP)));
  };

  // Active Rep Color-Graded Segments
  const maxIdx = Math.max(0, Math.min(pts.length - 1, Math.round((pts.length - 1) * scrubProgress)));
  ctx.lineWidth = 2.75;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  for (let i = 1; i <= maxIdx; i++) {
    const pPrev = pts[i - 1];
    const pCurr = pts[i];
    const d = pointDiff(pCurr, i);
    const rgb = getExertionRgb(d);

    ctx.strokeStyle = rgb.css;
    ctx.beginPath();
    ctx.moveTo(mapX(pPrev.dx), mapY(pPrev.y));
    ctx.lineTo(mapX(pCurr.dx), mapY(pCurr.y));
    ctx.stroke();
  }

  // Turnaround highlight ring at bottom inflection
  if (pts.length > 0 && scrubProgress >= 0.45) {
    const turnPt = pts[0];
    const tx = mapX(turnPt.dx);
    const ty = mapY(turnPt.y);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(tx, ty, 6.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Puck Position & Metrics at scrubProgress
  const currentPt = pts[maxIdx];
  if (currentPt) {
    const puckX = mapX(currentPt.dx);
    const puckY = mapY(currentPt.y);
    const puckDiff = pointDiff(currentPt, maxIdx);
    const puckRgb = getExertionRgb(puckDiff);

    // Connector hairline to plumb line
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, puckY);
    ctx.lineTo(puckX, puckY);
    ctx.stroke();
    ctx.restore();

    // Puck outer halo
    ctx.fillStyle = `rgba(${puckRgb.r}, ${puckRgb.g}, ${puckRgb.b}, 0.36)`;
    ctx.beginPath();
    ctx.arc(puckX, puckY, 9, 0, Math.PI * 2);
    ctx.fill();

    // Puck core
    ctx.fillStyle = scrubProgress >= 0.99 && baseRepDiff >= 0.35 ? puckRgb.css : '#FFFFFF';
    ctx.beginPath();
    ctx.arc(puckX, puckY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Update scrubber HUD values
    const romPct = Math.round(Math.max(0, Math.min(1, scrubProgress)) * 100);
    const romEl = document.getElementById('barpath-scrub-rom');
    const instVelEl = document.getElementById('barpath-scrub-inst-vel');
    const instDevEl = document.getElementById('barpath-scrub-inst-dev');
    if (romEl) romEl.textContent = `${romPct}% ROM`;
    if (instVelEl) instVelEl.textContent = `${currentPt.v.toFixed(2)} m/s`;
    if (instDevEl) instDevEl.textContent = `${currentPt.dx >= 0 ? '+' : ''}${currentPt.dx.toFixed(1)} cm`;
  }
}

function renderVelocityMode(ctx, w, h, pts, scrubProgress) {
  const topY = 25;
  const botY = 185;
  const leftX = 35;
  const rightX = w - 20;

  // Horizontal velocity axis: 0.0 to 1.2 m/s
  const maxVel = 1.2;
  const mapX = (v) => leftX + (Math.max(0, Math.min(maxVel, v)) / maxVel) * (rightX - leftX);
  const mapY = (y) => {
    const normY = y > 1.5 ? (y / 50.0) : y;
    return botY - normY * (botY - topY);
  };

  // Background Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  // Horizontal ROM dividers (25%, 50%, 75%)
  [0.25, 0.50, 0.75].forEach(r => {
    ctx.beginPath();
    ctx.moveTo(leftX, mapY(r)); ctx.lineTo(rightX, mapY(r));
    ctx.stroke();
  });

  // Vertical velocity markers (0.3, 0.6, 0.9 m/s)
  [0.3, 0.6, 0.9].forEach(v => {
    ctx.beginPath();
    ctx.moveTo(mapX(v), topY); ctx.lineTo(mapX(v), botY);
    ctx.stroke();
  });

  // Baseline MVT reference vertical dashed line
  const baseline = LIFT_BASELINES[currentLift.toLowerCase()] || LIFT_BASELINES.deadlift;
  const mvtX = mapX(baseline.mvt);
  ctx.strokeStyle = 'rgba(255, 59, 48, 0.5)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(mvtX, topY); ctx.lineTo(mvtX, botY);
  ctx.stroke();

  // Axis Labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('0.0', leftX, botY + 14);
  ctx.fillText('0.6', mapX(0.6), botY + 14);
  ctx.fillText('1.2', rightX, botY + 14);

  // Find sticking point (minimum velocity between 20% and 70% ROM)
  let stickPt = null;
  let minVInMid = 999;
  pts.forEach(p => {
    const normY = p.y > 1.5 ? (p.y / 50.0) : p.y;
    if (normY >= 0.20 && normY <= 0.70 && p.v < minVInMid) {
      minVInMid = p.v;
      stickPt = p;
    }
  });

  // Draw velocity curve
  const maxIdx = Math.max(0, Math.min(pts.length - 1, Math.round((pts.length - 1) * scrubProgress)));
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.strokeStyle = '#00E5FF';

  ctx.beginPath();
  ctx.moveTo(mapX(pts[0].v), mapY(pts[0].y));
  for (let i = 1; i <= maxIdx; i++) {
    ctx.lineTo(mapX(pts[i].v), mapY(pts[i].y));
  }
  ctx.stroke();

  // Sticking Point annotation
  if (stickPt && mapY(stickPt.y) <= mapY(pts[maxIdx].y)) {
    ctx.save();
    ctx.fillStyle = '#FFB800';
    ctx.beginPath();
    ctx.arc(mapX(stickPt.v), mapY(stickPt.y), 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 184, 0, 0.9)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`STICK ${stickPt.v.toFixed(2)}m/s`, mapX(stickPt.v) + 6, mapY(stickPt.y) + 3);
    ctx.restore();
  }

  // Puck Position at scrubProgress
  const currentPt = pts[maxIdx];
  if (currentPt) {
    const puckX = mapX(currentPt.v);
    const puckY = mapY(currentPt.y);

    ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(puckX, puckY, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(puckX, puckY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Update scrubber HUD values
    const normProgress = currentPt.y > 1.5 ? (currentPt.y / 50.0) : currentPt.y;
    const romPct = Math.round(Math.max(0, Math.min(1, scrubProgress)) * 100);
    const romEl = document.getElementById('barpath-scrub-rom');
    const instVelEl = document.getElementById('barpath-scrub-inst-vel');
    const instDevEl = document.getElementById('barpath-scrub-inst-dev');
    if (romEl) romEl.textContent = `${romPct}% ROM`;
    if (instVelEl) instVelEl.textContent = `${currentPt.v.toFixed(2)} m/s`;
    if (instDevEl) instDevEl.textContent = `${currentPt.dx >= 0 ? '+' : ''}${currentPt.dx.toFixed(1)} cm`;
  }
}

function updateRepPills(totalReps, activeIdx) {
  const container = document.getElementById('barpath-rep-pills');
  if (!container) return;

  if (totalReps === 0) {
    container.innerHTML = '';
    return;
  }

  if (container.children.length !== totalReps) {
    container.innerHTML = '';
    for (let i = 0; i < totalReps; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `barpath-rep-pill font-mono ${i === activeIdx ? 'active' : ''}`;
      btn.setAttribute('data-rep', String(i));
      btn.setAttribute('aria-label', `Select Repetition ${i + 1}`);
      btn.textContent = `R${i + 1}`;
      btn.addEventListener('click', () => {
        stopReplay();
        currentReplayRepIdx = i;
        const scrubber = document.getElementById('barpath-scrubber');
        if (scrubber) scrubber.value = '100';
        renderBarPathStage(i, 1.0);
      });
      container.appendChild(btn);
    }
  } else {
    Array.from(container.children).forEach((child, i) => {
      if (i === activeIdx) child.classList.add('active');
      else child.classList.remove('active');
    });
  }
}

function toggleReplay() {
  if (isReplaying) {
    stopReplay();
  } else {
    startReplay();
  }
}

function openRepReplayModal(repIndex = 0, setOverride = null) {
  const modal = repReplayModal || document.getElementById('rep-replay-modal');
  const sourceSet = setOverride || getLiveDisplaySetForGraphs();
  const reps = (sourceSet && Array.isArray(sourceSet.reps)) ? sourceSet.reps : [];
  if (!modal || reps.length === 0) return;

  stopReplay();
  const targetIdx = Math.min(Math.max(0, Number(repIndex) || 0), reps.length - 1);
  repReplayModalState.isOpen = true;
  repReplayModalState.repIdx = targetIdx;
  repReplayModalState.setRef = sourceSet;
  currentReplayRepIdx = targetIdx;

  const rep = reps[targetIdx];
  const meanVel = Number(rep.velocity) || 0;
  const peakVel = resolveRepPeakVelocity(rep);
  const rpeVal = (typeof rep.rpe === 'number' && !isNaN(rep.rpe)) ? rep.rpe : 0;

  const counterEl = repReplayCounter || document.getElementById('rep-replay-counter');
  const meanEl = repModalMeanVel || document.getElementById('rep-modal-mean-vel');
  const peakEl = repModalPeakVel || document.getElementById('rep-modal-peak-vel');
  const rpeEl = repModalRpe || document.getElementById('rep-modal-rpe');
  if (counterEl) counterEl.textContent = `Rep ${targetIdx + 1} of ${reps.length}`;
  if (meanEl) meanEl.textContent = `${meanVel.toFixed(2)} m/s`;
  if (peakEl) peakEl.textContent = `${peakVel.toFixed(2)} m/s`;
  if (rpeEl) rpeEl.textContent = rpeVal.toFixed(1);

  modal.style.display = 'flex';
  if (typeof modal.setAttribute === 'function') modal.setAttribute('aria-hidden', 'false');

  const modalCanvas = repModalCanvas || document.getElementById('rep-modal-canvas');
  if (modalCanvas) {
    renderBarPathStage(targetIdx, 1.0, modalCanvas, sourceSet);
  }
  const scrubber = document.getElementById('barpath-scrubber');
  if (scrubber) scrubber.value = '100';
  if (typeof requestAnimationFrame === 'function') {
    startReplay();
  }
}

function closeRepReplayModal() {
  stopReplay();
  repReplayModalState.isOpen = false;
  const modal = repReplayModal || document.getElementById('rep-replay-modal');
  if (!modal) return;
  modal.style.display = 'none';
  if (typeof modal.setAttribute === 'function') modal.setAttribute('aria-hidden', 'true');
}

function startReplay() {
  const sourceSet = (repReplayModalState.isOpen && repReplayModalState.setRef)
    ? repReplayModalState.setRef
    : getLiveDisplaySetForGraphs();
  const reps = (sourceSet && Array.isArray(sourceSet.reps)) ? sourceSet.reps : [];
  if (reps.length === 0) return;

  isReplaying = true;
  const replayText = document.getElementById('barpath-replay-text');
  if (replayText) replayText.textContent = 'PAUSE';

  const scrubber = document.getElementById('barpath-scrubber');
  let currentVal = scrubber ? parseFloat(scrubber.value) : 100;
  if (currentVal >= 99) {
    currentVal = 0;
    if (scrubber) scrubber.value = '0';
  }

  const durationMs = (1200 / replaySpeed); // 1.2s baseline concentric duration
  let lastTime = performance.now();
  const modalCanvas = repModalCanvas || document.getElementById('rep-modal-canvas');

  function step(now) {
    if (!isReplaying) return;
    const delta = now - lastTime;
    lastTime = now;

    currentVal += (delta / durationMs) * 100;
    if (currentVal >= 100) {
      currentVal = 100;
      if (scrubber) scrubber.value = '100';
      renderBarPathStage(currentReplayRepIdx, 1.0, null, sourceSet);
      if (repReplayModalState.isOpen && modalCanvas) {
        renderBarPathStage(currentReplayRepIdx, 1.0, modalCanvas, sourceSet);
      }
      stopReplay();
      return;
    }

    if (scrubber) scrubber.value = String(Math.round(currentVal));
    renderBarPathStage(currentReplayRepIdx, currentVal / 100.0, null, sourceSet);
    if (repReplayModalState.isOpen && modalCanvas) {
      renderBarPathStage(currentReplayRepIdx, currentVal / 100.0, modalCanvas, sourceSet);
    }
    replayAnimId = requestAnimationFrame(step);
  }

  replayAnimId = requestAnimationFrame(step);
}

function stopReplay() {
  isReplaying = false;
  if (replayAnimId) {
    cancelAnimationFrame(replayAnimId);
    replayAnimId = null;
  }
  if (activeStrokeAnimId) {
    cancelAnimationFrame(activeStrokeAnimId);
    activeStrokeAnimId = null;
  }
  const replayText = document.getElementById('barpath-replay-text');
  if (replayText) replayText.textContent = 'REPLAY';
}

function toggleReplaySpeed() {
  replaySpeed = replaySpeed === 1.0 ? 0.5 : 1.0;
  const speedLabel = document.getElementById('barpath-speed-label');
  if (speedLabel) speedLabel.textContent = `${replaySpeed.toFixed(1)}X`;
}

function toggleBarPathMode() {
  barPathMode = barPathMode === 'path' ? 'vel' : 'path';
  const pathOpt = document.getElementById('barpath-mode-path');
  const velOpt = document.getElementById('barpath-mode-vel');
  if (pathOpt) pathOpt.classList.toggle('active', barPathMode === 'path');
  if (velOpt) velOpt.classList.toggle('active', barPathMode === 'vel');

  const scrubber = document.getElementById('barpath-scrubber');
  const progress = scrubber ? (parseFloat(scrubber.value) || 100) / 100 : 1.0;
  renderBarPathStage(currentReplayRepIdx, progress);
}

/* ═══════════════════════════════════════════════════════════════════ */
/* ANIMATION CONTROLLER & PROTOTYPE SWITCHER (Requirements R1, R2, R3) */
/* ═══════════════════════════════════════════════════════════════════ */

let activeAnimationVariant = 'A';
let activeStrokeAnimId = null;

function getActiveAnimationVariant() {
  return activeAnimationVariant;
}

function setAnimationVariant(variant) {
  const norm = String(variant || 'A').toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(norm)) {
    activeAnimationVariant = norm;
  } else {
    activeAnimationVariant = 'A';
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('eros_animation_variant', activeAnimationVariant);
    }
  } catch (e) {}

  if (typeof window !== 'undefined') {
    window.activeAnimationVariant = activeAnimationVariant;
  }

  // Update UI pill and switcher sheet cards
  const pillVal = document.getElementById('barpath-active-variant');
  if (pillVal) pillVal.textContent = activeAnimationVariant;

  if (typeof document !== 'undefined') {
    const cards = document.querySelectorAll('.variant-card');
    cards.forEach(card => {
      const isTarget = card.getAttribute('data-variant') === activeAnimationVariant;
      if (isTarget) {
        card.classList.add('active');
        card.setAttribute('aria-checked', 'true');
      } else {
        card.classList.remove('active');
        card.setAttribute('aria-checked', 'false');
      }
    });
  }

  // Re-render stage if reps exist and not actively animating
  if (!activeStrokeAnimId && typeof renderBarPathStage === 'function') {
    renderBarPathStage(currentReplayRepIdx, 1.0);
  }

  return activeAnimationVariant;
}

function openVariantSheet() {
  const sheet = document.getElementById('variant-switcher-sheet');
  const btn = document.getElementById('btn-variant-switcher');
  if (sheet) {
    sheet.style.display = 'flex';
  }
  if (btn) {
    btn.setAttribute('aria-expanded', 'true');
  }
}

function closeVariantSheet() {
  const sheet = document.getElementById('variant-switcher-sheet');
  const btn = document.getElementById('btn-variant-switcher');
  if (sheet) {
    sheet.style.display = 'none';
  }
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
  }
}

function toggleVariantSheet() {
  const sheet = document.getElementById('variant-switcher-sheet');
  if (sheet && sheet.style.display !== 'none') {
    closeVariantSheet();
  } else {
    openVariantSheet();
  }
}

/**
 * Biomechanical horizontal raw deviation formulas dx(p) in cm.
 * Normalized ROM progress p in [0.0, 1.0].
 */
function getBiomechanicalRawDeviation(liftName, p) {
  const l = String(liftName || 'Squat').toLowerCase();
  const clampedP = Math.max(0, Math.min(1, p));
  if (l.includes('bench')) {
    // McLaughlin J-curve: touches sternum, flares backward towards shoulders (-dx), presses to vertical
    return 1.6 * Math.pow(1 - clampedP, 2) - 3.2 * Math.sin(Math.PI * Math.pow(clampedP, 0.75)) * (1 - 0.2 * clampedP);
  } else if (l.includes('dead')) {
    // Deadlift: sweeps bar backwards into shins/thighs clearing knees, stabilizing at hip lockout
    return -0.9 * Math.sin(Math.PI * (1 - clampedP)) + 2.0 * Math.sin(2 * Math.PI * clampedP) * clampedP;
  }
  // Squat: anterior lean in the hole at low p, knee travel during mid-ascent, returning to plumb line
  return 0.8 * Math.pow(1 - clampedP, 2) + 1.8 * Math.sin(Math.PI * clampedP) * (1 - 0.4 * clampedP);
}

/**
 * Requirement R1: Unified Deviation & RPE Animated Kinematic Controller
 * window.animateRepetitionStroke({ lift, velocity, rpe, deviationCm, variant, onComplete })
 */
function animateRepetitionStroke(options = {}) {
  const lift = options.lift || currentLift || 'Squat';
  const velocity = (typeof options.velocity === 'number') ? options.velocity : 0.45;
  const rpe = (typeof options.rpe === 'number') ? options.rpe : 8.0;
  const deviationCm = (typeof options.deviationCm === 'number') ? options.deviationCm : 1.8;
  const variant = (options.variant || activeAnimationVariant || 'A').toUpperCase();
  const onComplete = (typeof options.onComplete === 'function') ? options.onComplete : null;

  if (activeStrokeAnimId) {
    cancelAnimationFrame(activeStrokeAnimId);
    activeStrokeAnimId = null;
  }

  const canvas = options.canvas || document.getElementById('bar-path-canvas');
  if (!canvas || !canvas.getContext) {
    if (onComplete) onComplete();
    return;
  }
  const { ctx, w, h, isHeadless } = syncCanvasDpr(canvas, 220, 210);
  if (!ctx) {
    if (onComplete) onComplete();
    return;
  }

  const centerX = w / 2;
  const cmRange = Math.max(4.5, Math.abs(deviationCm) + 1.2);
  const scaleX = Math.min(18, Math.max(4, (w / 2 - 10) / cmRange));
  const topY = isHeadless ? 25 : Math.max(16, Math.round(h * 0.08));
  const botY = isHeadless ? 185 : Math.max(topY + 60, h - Math.max(16, Math.round(h * 0.08)));
  const travelY = botY - topY;

  const effLift = (lift ? String(lift) : 'Squat').toLowerCase();
  const isDeadlift = effLift.includes('dead');
  const isBench = effLift.includes('bench');
  const liftType = isDeadlift ? 'Deadlift' : (isBench ? 'Bench' : 'Squat');

  const LIFT_COLORS = {
    Deadlift: { r: 255, g: 59, b: 48, hex: '#FF3B30', textHex: '#FF857D' },
    Squat:    { r: 0,   g: 255, b: 102, hex: '#00FF66', textHex: '#66FFA3' },
    Bench:    { r: 0,   g: 229, b: 255, hex: '#00E5FF', textHex: '#70F0FF' }
  };
  const targetColor = LIFT_COLORS[liftType] || LIFT_COLORS.Squat;

  // Repetition duration scaled to velocity: T in [0.8, 3.5] seconds
  const totalDurationMs = Math.max(800, Math.min(3500, ((0.5 / Math.max(velocity, 0.1)) * 2) * 1000));
  const startTime = performance.now();

  // Biomechanical deviation scaling factor
  const rawMax = isBench ? 2.5 : (isDeadlift ? 1.8 : 1.6);
  const devScale = deviationCm > 0 ? (deviationCm / rawMax) : (0.8 + 0.6 * (rpe / 10) + 0.5 * Math.max(0, 0.5 - velocity));

  // Velocity profile parameters
  const vPeak = Math.max(velocity * 1.35, velocity + 0.15);
  const vStick = Math.max(0.12, velocity * (1.0 - 0.45 * (rpe / 10)));

  // Trajectory history for continuous trail/ribbon rendering
  const initY = isDeadlift ? botY : topY;
  const historyPoints = [{ x: centerX, y: initY, dx: 0, v: velocity, diff: 0, rgb: 'rgb(255, 255, 255)' }];

  function drawBaseCorridors() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, w, h);

    // Optimal corridor (+-2.0cm) with subtle vertical linearGradient highlight
    if (typeof ctx.createLinearGradient === 'function') {
      const corridorGrad = ctx.createLinearGradient(0, botY, 0, topY);
      corridorGrad.addColorStop(0, 'rgba(255, 255, 255, 0.02)');
      corridorGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.04)');
      corridorGrad.addColorStop(1, 'rgba(255, 59, 48, 0.05)');
      ctx.fillStyle = corridorGrad;
    } else {
      ctx.fillStyle = 'rgba(0, 255, 102, 0.05)';
    }
    ctx.fillRect(centerX - 2 * scaleX, topY, 4 * scaleX, travelY);
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.28)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - 2 * scaleX, topY); ctx.lineTo(centerX - 2 * scaleX, botY);
    ctx.moveTo(centerX + 2 * scaleX, topY); ctx.lineTo(centerX + 2 * scaleX, botY);
    ctx.stroke();

    // Warning corridor (+-4.0cm)
    ctx.strokeStyle = 'rgba(255, 184, 0, 0.22)';
    ctx.beginPath();
    ctx.moveTo(centerX - 4 * scaleX, topY); ctx.lineTo(centerX - 4 * scaleX, botY);
    ctx.moveTo(centerX + 4 * scaleX, topY); ctx.lineTo(centerX + 4 * scaleX, botY);
    ctx.stroke();

    // Lockout & Turnaround Target Guidelines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - 3 * scaleX, topY); ctx.lineTo(centerX + 3 * scaleX, topY);
    ctx.moveTo(centerX - 3 * scaleX, botY); ctx.lineTo(centerX + 3 * scaleX, botY);
    ctx.stroke();

    // 0.0 cm Plumb Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX, topY);
    ctx.lineTo(centerX, botY);
    ctx.stroke();

    // Dimmed ghost line of previous rep / baseline for consistency comparison
    const ghostPts = (typeof window !== 'undefined' && window._lastRepTrajectory) ||
      (typeof activeSet !== 'undefined' && activeSet && activeSet.reps && activeSet.reps.length > 0 && activeSet.reps[0].trajectoryPoints);
    if (ghostPts && ghostPts.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const firstX = ghostPts[0].dx !== undefined ? (centerX + ghostPts[0].dx * scaleX) : ghostPts[0].x;
      const firstY = ghostPts[0].y !== undefined ? (ghostPts[0].y <= 1.5 ? (botY - ghostPts[0].y * travelY) : ghostPts[0].y) : initY;
      ctx.moveTo(firstX, firstY);
      for (let i = 1; i < ghostPts.length; i++) {
        const ptX = ghostPts[i].dx !== undefined ? (centerX + ghostPts[i].dx * scaleX) : ghostPts[i].x;
        const ptY = ghostPts[i].y !== undefined ? (ghostPts[i].y <= 1.5 ? (botY - ghostPts[i].y * travelY) : ghostPts[i].y) : initY;
        ctx.lineTo(ptX, ptY);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function frame(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1.0, elapsed / totalDurationMs);

    let yDot, romProgress, isConcentricPhase;

    if (isDeadlift) {
      if (progress <= 0.55) {
        isConcentricPhase = true;
        const pCon = progress / 0.55;
        romProgress = pCon;
        yDot = botY - pCon * travelY;
      } else {
        isConcentricPhase = false;
        const pEcc = (progress - 0.55) / 0.45;
        romProgress = 1.0 - pEcc;
        yDot = topY + pEcc * travelY;
      }
    } else {
      if (progress <= 0.50) {
        isConcentricPhase = false;
        const pEcc = progress / 0.50;
        romProgress = pEcc;
        yDot = topY + pEcc * travelY;
      } else {
        isConcentricPhase = true;
        const pCon = (progress - 0.50) / 0.50;
        romProgress = pCon;
        yDot = botY - pCon * travelY;
      }
    }

    // Instantaneous horizontal deviation
    const dxRaw = getBiomechanicalRawDeviation(liftType, romProgress);
    const dxCm = dxRaw * devScale;
    const xDot = Math.max(8, Math.min(w - 8, centerX + dxCm * scaleX));

    // Instantaneous velocity calculation with sticking point
    let instVel;
    if (isConcentricPhase) {
      const stickDist = Math.abs(romProgress - 0.50);
      const stickWeight = Math.max(0, 1.0 - stickDist * 2.5);
      instVel = vPeak - stickWeight * (vPeak - vStick);
    } else {
      instVel = velocity * 0.85;
    }

    // Turnaround inflection flash detection
    const isTurnaround = isDeadlift ? (progress > 0.02 && progress < 0.08) : (Math.abs(progress - 0.50) < 0.035);

    // Dynamic difficulty calculation D in [0.0, 1.0]
    let difficulty = 0.0;
    if (elapsed === 0) {
      difficulty = 0.0;
    } else if (isConcentricPhase) {
      const rpeFactor = Math.max(0, Math.min(1, (rpe - 6.0) / 4.0));
      const velDropFactor = Math.max(0, Math.min(1, (vPeak - instVel) / Math.max(0.1, vPeak - 0.15)));
      const setRepsCount = (typeof activeSet !== 'undefined' && activeSet && activeSet.reps) ? activeSet.reps.length : 0;
      const setVelLoss = (typeof activeSet !== 'undefined' && activeSet && typeof activeSet.velocityLossPct === 'number') ? activeSet.velocityLossPct : 0;
      const fatigueFactor = Math.max(rpeFactor, Math.min(1, setVelLoss / 25.0 + setRepsCount * 0.06));

      if (rpe <= 6.5 && fatigueFactor < 0.20) {
        difficulty = 0.05 + 0.18 * Math.pow(romProgress, 2);
      } else {
        difficulty = Math.max(0, Math.min(1, (0.55 * fatigueFactor + 0.45 * velDropFactor) * Math.min(1, 0.40 + romProgress * 1.2)));
      }
    } else {
      difficulty = 0.05 * Math.max(0, Math.min(1, (rpe - 6.0) / 4.0)) * romProgress;
    }

    // Exertion palette ramp (#FFFFFF -> #00E5FF -> #FFB800 -> #FF3B30)
    const exRgb = getExertionRgb(difficulty);
    const curR = exRgb.r;
    const curG = exRgb.g;
    const curB = exRgb.b;
    const dotRgb = exRgb.css;

    historyPoints.push({ x: xDot, y: yDot, dx: dxCm, v: instVel, diff: difficulty, rgb: dotRgb });

    // Update Stage HUD live values
    const devEl = document.getElementById('barpath-hud-dev');
    const effEl = document.getElementById('barpath-hud-eff');
    if (devEl) devEl.textContent = `${dxCm >= 0 ? '+' : ''}${dxCm.toFixed(1)} cm`;
    if (effEl) effEl.textContent = `${Math.round(Math.max(70, 100 - Math.abs(dxCm) * 5))}%`;

    // Render Base
    drawBaseCorridors();

    // Render Selected Variant
    if (variant === 'B') {
      ctx.save();
      for (let i = 1; i < historyPoints.length; i++) {
        const p1 = historyPoints[i - 1];
        const p2 = historyPoints[i];
        const normV = Math.max(0, Math.min(1, p2.v / vPeak));
        const ribbonWidth = 2.5 + 5.5 * normV;
        const pulseFreq = 1.2 + 2.8 * Math.max(0, (rpe - 6.0) / 4.0);
        const pulse = 0.70 + 0.30 * Math.sin((elapsed / 1000) * pulseFreq * 2 * Math.PI);

        ctx.lineWidth = ribbonWidth;
        ctx.lineCap = 'round';
        ctx.strokeStyle = p2.rgb;
        ctx.shadowBlur = 12 * pulse * (p2.diff + 0.3);
        ctx.shadowColor = p2.rgb;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = dotRgb;
      ctx.beginPath();
      ctx.arc(xDot, yDot, 6, 0, Math.PI * 2);
      ctx.fill();

    } else if (variant === 'C') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, yDot);
      ctx.lineTo(xDot, yDot);
      ctx.stroke();
      ctx.restore();

      const waveCount = 3;
      for (let wIdx = 0; wIdx < waveCount; wIdx++) {
        const waveOffset = (elapsed * 0.003 + wIdx * 0.33) % 1.0;
        const waveR = 8 + waveOffset * 22;
        const alpha = (1.0 - waveOffset) * (0.35 + 0.45 * difficulty);
        ctx.save();
        ctx.strokeStyle = `rgba(${curR}, ${curG}, ${curB}, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(xDot, yDot, waveR, waveR * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = dotRgb;
      ctx.beginPath();
      ctx.arc(xDot, yDot, 5, 0, Math.PI * 2);
      ctx.fill();

    } else if (variant === 'D') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(centerX, topY);
      ctx.lineTo(centerX, botY);
      ctx.stroke();
      ctx.restore();

      const vVertLen = Math.max(10, Math.min(36, instVel * 30));
      const vHorizLen = Math.max(4, Math.min(30, Math.abs(dxCm) * 6));
      const horizDir = dxCm >= 0 ? 1 : -1;

      ctx.save();
      ctx.strokeStyle = '#00FF66';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xDot, yDot);
      ctx.lineTo(xDot, yDot - vVertLen);
      ctx.stroke();
      ctx.fillStyle = '#00FF66';
      ctx.beginPath();
      ctx.moveTo(xDot, yDot - vVertLen - 3);
      ctx.lineTo(xDot - 3, yDot - vVertLen + 2);
      ctx.lineTo(xDot + 3, yDot - vVertLen + 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = dotRgb;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xDot, yDot);
      ctx.lineTo(xDot + horizDir * vHorizLen, yDot);
      ctx.stroke();
      ctx.fillStyle = dotRgb;
      ctx.beginPath();
      ctx.moveTo(xDot + horizDir * (vHorizLen + 3), yDot);
      ctx.lineTo(xDot + horizDir * (vHorizLen - 2), yDot - 3);
      ctx.lineTo(xDot + horizDir * (vHorizLen - 2), yDot + 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = dotRgb;
      ctx.beginPath();
      ctx.arc(xDot, yDot, 5, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // ── Variant A (Primary Concept): Kinetic Dot + Per-Segment Exertion Gradient ──
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, yDot);
      ctx.lineTo(xDot, yDot);
      ctx.stroke();
      ctx.restore();

      if (historyPoints.length > 1) {
        ctx.save();
        ctx.lineWidth = 2.75;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < historyPoints.length; i++) {
          ctx.strokeStyle = historyPoints[i].rgb;
          ctx.beginPath();
          ctx.moveTo(historyPoints[i - 1].x, historyPoints[i - 1].y);
          ctx.lineTo(historyPoints[i].x, historyPoints[i].y);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (isTurnaround) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(xDot, yDot, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${curR}, ${curG}, ${curB}, 0.50)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(xDot, yDot, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const haloRadius = 10 + 10 * difficulty;
      const haloAlpha = 0.40 + 0.32 * difficulty;
      ctx.save();
      ctx.fillStyle = `rgba(${curR}, ${curG}, ${curB}, ${haloAlpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(xDot, yDot, haloRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = dotRgb;
      ctx.beginPath();
      ctx.arc(xDot, yDot, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (progress < 1.0) {
      activeStrokeAnimId = requestAnimationFrame(frame);
    } else {
      activeStrokeAnimId = null;
      const popScale = 1.0 + 1.5 * ((Math.max(6.0, Math.min(10.0, rpe)) - 6.0) / 4.0);
      const endExertion = getExertionRgb(Math.max(0.15, (rpe - 6.0) / 4.0));
      const popColorObj = rpe >= 7.5 ? endExertion : targetColor;
      triggerCompletionPop(ctx, w, h, xDot, yDot, popScale, popColorObj, velocity, rpe, liftType, onComplete);
    }
  }

  function triggerCompletionPop(ctx, w, h, x, y, scale, colorObj, vel, repRpe, liftName, cb) {
    // 1. Synthesize Web Audio Pop Chime
    SoundFX.playRepPopChime(vel, repRpe, liftName);

    // 2. CSS Bloom on stage
    const stage = document.querySelector('.bar-path-stage');
    if (stage) {
      stage.style.setProperty('--pop-scale', scale.toFixed(2));
      stage.style.setProperty('--pop-accent-rgb', `${colorObj.r}, ${colorObj.g}, ${colorObj.b}`);
      stage.classList.remove('rep-pop-bloom');
      void stage.offsetWidth;
      stage.classList.add('rep-pop-bloom');
      setTimeout(() => stage.classList.remove('rep-pop-bloom'), 400);
    }

    // 3. Optional sparks for high exertion (RPE >= 8.5)
    if (repRpe >= 8.5 && window.AthleteFX && typeof window.AthleteFX.emitCelebrationSparks === 'function') {
      try {
        AthleteFX.emitCelebrationSparks('power', 5, stage);
      } catch (e) {}
    }

    // 4. Canvas-native radial shockwave expansion animation
    const shockwaveDuration = 260;
    const shockStart = performance.now();
    const maxRadius = 14 * scale;

    function popFrame(popNow) {
      const popElapsed = popNow - shockStart;
      const popProg = Math.min(1.0, popElapsed / shockwaveDuration);

      drawBaseCorridors();

      // Expanding radial shockwave ring outline (Decision 13)
      const currentR = 6 + (maxRadius - 6) * popProg;
      const ringAlpha = (1.0 - popProg) * 0.85;

      ctx.save();
      ctx.strokeStyle = `rgba(${colorObj.r}, ${colorObj.g}, ${colorObj.b}, ${ringAlpha.toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, currentR, 0, Math.PI * 2);
      ctx.stroke();

      // Distinct visual tiers (Decision 14): Secondary concentric ring for heavy/max effort
      if (repRpe >= 8.5) {
        const outerR = 6 + (maxRadius * 1.25 - 6) * popProg;
        const outerAlpha = (1.0 - popProg) * 0.55;
        ctx.strokeStyle = `rgba(255, 255, 255, ${outerAlpha.toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, outerR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Locked out puck core with specular bloom
      ctx.fillStyle = colorObj.hex;
      ctx.shadowBlur = 12 * (1.0 - popProg);
      ctx.shadowColor = colorObj.hex;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (popProg < 1.0) {
        requestAnimationFrame(popFrame);
      } else {
        if (typeof window !== 'undefined') {
          window._lastRepTrajectory = [...historyPoints];
        }
        // Redraw static stage
        if (typeof renderBarPathStage === 'function') {
          renderBarPathStage(currentReplayRepIdx, 1.0);
        }
        if (cb) cb();
      }
    }

    requestAnimationFrame(popFrame);
  }

  activeStrokeAnimId = requestAnimationFrame(frame);
}

function initBarPathControls() { if (initBarPathControls._initialized) return; initBarPathControls._initialized = true;
  const modeBtn = document.getElementById('btn-barpath-mode');
  if (modeBtn) {
    modeBtn.addEventListener('click', toggleBarPathMode);
  }

  const replayBtn = document.getElementById('btn-barpath-replay');
  if (replayBtn) {
    replayBtn.addEventListener('click', toggleReplay);
  }

  const speedBtn = document.getElementById('btn-barpath-speed');
  if (speedBtn) {
    speedBtn.addEventListener('click', toggleReplaySpeed);
  }

  // Velocity Change Graph dot hit-testing -> 80% Rep Replay Modal
  const velCanvas = velocityChangeCanvas || document.getElementById('velocity-change-canvas');
  if (velCanvas && !velCanvas._velGraphBound) {
    velCanvas._velGraphBound = true;
    velCanvas.addEventListener('click', (e) => {
      if (!e) return;
      const hit = findVelGraphHitTarget(e.clientX, e.clientY, velCanvas);
      if (hit) {
        openRepReplayModal(hit.repIdx, hit.setRef);
      }
    });
    velCanvas.addEventListener('mousemove', (e) => {
      if (!e) return;
      const hit = findVelGraphHitTarget(e.clientX, e.clientY, velCanvas);
      if (velCanvas.style) {
        velCanvas.style.cursor = hit ? 'pointer' : 'default';
      }
    });
  }

  // 80% Rep Replay Modal dismiss listeners
  const modalBackdrop = repReplayBackdrop || document.getElementById('rep-replay-backdrop');
  if (modalBackdrop && !modalBackdrop._repModalBound) {
    modalBackdrop._repModalBound = true;
    modalBackdrop.addEventListener('click', closeRepReplayModal);
  }
  const modalCloseBtn = btnRepReplayClose || document.getElementById('btn-rep-replay-close');
  if (modalCloseBtn && !modalCloseBtn._repModalBound) {
    modalCloseBtn._repModalBound = true;
    modalCloseBtn.addEventListener('click', closeRepReplayModal);
  }
  if (typeof document !== 'undefined' && !document._repModalEscBound) {
    document._repModalEscBound = true;
    document.addEventListener('keydown', (e) => {
      if (e && e.key === 'Escape' && repReplayModalState.isOpen) {
        closeRepReplayModal();
      }
    });
  }

  // Programmed Workout Drawer wiring (#btn-programmed-workout -> #live-programmed-drawer)
  initProgrammedWorkoutDrawer();

  const scrubber = document.getElementById('barpath-scrubber');
  if (scrubber) {
    scrubber.addEventListener('input', (e) => {
      stopReplay();
      const progress = (parseFloat(e.target.value) || 0) / 100.0;
      renderBarPathStage(currentReplayRepIdx, progress);
    });
  }

  // Variant Switcher Pill and Sheet Handlers (R3)
  const variantBtn = document.getElementById('btn-variant-switcher');
  if (variantBtn) {
    let pressTimer = null;
    let didLongPress = false;

    const startPress = () => {
      didLongPress = false;
      pressTimer = setTimeout(() => {
        didLongPress = true;
        toggleVariantSheet();
      }, 350);
    };

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    variantBtn.addEventListener('pointerdown', startPress);
    variantBtn.addEventListener('pointerup', cancelPress);
    variantBtn.addEventListener('pointerleave', cancelPress);

    variantBtn.addEventListener('click', () => {
      if (didLongPress) {
        didLongPress = false;
        return;
      }
      // Quick click: cycle variant A -> B -> C -> D -> A
      const variants = ['A', 'B', 'C', 'D'];
      const nextIdx = (variants.indexOf(activeAnimationVariant) + 1) % variants.length;
      setAnimationVariant(variants[nextIdx]);
    });
  }

  const closeSheetBtn = document.getElementById('btn-variant-sheet-close');
  if (closeSheetBtn) {
    closeSheetBtn.addEventListener('click', closeVariantSheet);
  }

  const auditionBtn = document.getElementById('btn-variant-audition-rep');
  if (auditionBtn) {
    auditionBtn.addEventListener('click', () => {
      animateRepetitionStroke({
        lift: currentLift || 'Squat',
        velocity: 0.42,
        rpe: 8.5,
        deviationCm: 1.8,
        variant: activeAnimationVariant
      });
    });
  }

  const variantCards = document.querySelectorAll('.variant-card');
  variantCards.forEach(card => {
    card.addEventListener('click', () => {
      const v = card.getAttribute('data-variant');
      if (v) setAnimationVariant(v);
    });
  });

  // URL deep-linking: ?variant=A|B|C|D
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    try {
      const urlVar = new URLSearchParams(window.location.search).get('variant');
      if (urlVar && /^[A-D]$/i.test(urlVar)) {
        setAnimationVariant(urlVar.toUpperCase());
      } else {
        const saved = localStorage.getItem('eros_animation_variant');
        if (saved) setAnimationVariant(saved);
      }
    } catch (e) {}
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

// Target RPE Configuration Handlers & Popover
function closeTargetRpePopover() {
  const pop = targetRpePopover || document.getElementById('target-rpe-popover');
  const trig = btnTargetRpeTrigger || document.getElementById('btn-target-rpe-trigger');
  const mod = targetRpeModule || document.getElementById('target-rpe-module');
  if (pop) pop.style.display = 'none';
  if (trig && typeof trig.setAttribute === 'function') trig.setAttribute('aria-expanded', 'false');
  if (mod && mod.classList) mod.classList.remove('open');
}

function openTargetRpePopover() {
  closeLiveWeightPopover();
  closeProgrammedDrawer();
  if (liftSelectWrapper && liftSelectWrapper.classList) liftSelectWrapper.classList.remove('open');
  const pop = targetRpePopover || document.getElementById('target-rpe-popover');
  const trig = btnTargetRpeTrigger || document.getElementById('btn-target-rpe-trigger');
  const mod = targetRpeModule || document.getElementById('target-rpe-module');
  if (pop) pop.style.display = 'block';
  if (trig && typeof trig.setAttribute === 'function') trig.setAttribute('aria-expanded', 'true');
  if (mod && mod.classList) mod.classList.add('open');
}

function toggleTargetRpePopover(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const pop = targetRpePopover || document.getElementById('target-rpe-popover');
  const isOpen = Boolean(pop && (pop.style.display === 'block' || pop.style.display === 'flex'));
  if (isOpen) {
    closeTargetRpePopover();
  } else {
    openTargetRpePopover();
  }
}

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
  const popValEl = targetRpePopoverVal || document.getElementById('target-rpe-popover-val');
  if (popValEl) {
    popValEl.textContent = currentTargetRpe.toFixed(1);
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

  if (typeof renderVelocityChangeGraph === 'function') {
    renderVelocityChangeGraph(1.0);
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

const rpeTrigBtn = btnTargetRpeTrigger || document.getElementById('btn-target-rpe-trigger');
if (rpeTrigBtn) {
  rpeTrigBtn.addEventListener('click', toggleTargetRpePopover);
}
if (targetRpeModule) {
  targetRpeModule.addEventListener('click', (e) => {
    const pop = targetRpePopover || document.getElementById('target-rpe-popover');
    if (pop && e && e.target && typeof pop.contains === 'function' && pop.contains(e.target)) return;
    if (rpeTrigBtn && e && e.target && typeof rpeTrigBtn.contains === 'function' && rpeTrigBtn.contains(e.target)) return;
    toggleTargetRpePopover(e);
  });
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const mod = targetRpeModule || document.getElementById('target-rpe-module');
    if (mod && e && e.target && typeof mod.contains === 'function' && !mod.contains(e.target)) {
      closeTargetRpePopover();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e && e.key === 'Escape') {
      closeTargetRpePopover();
    }
  });
}

if (btnTargetRpeDec) {
  btnTargetRpeDec.addEventListener('click', (e) => {
    if (e) e.stopPropagation();
    setTargetRpe(currentTargetRpe - 0.5, true);
  });
}
if (btnTargetRpeInc) {
  btnTargetRpeInc.addEventListener('click', (e) => {
    if (e) e.stopPropagation();
    setTargetRpe(currentTargetRpe + 0.5, true);
  });
}

targetChips.forEach(chip => {
  chip.addEventListener('click', (e) => {
    if (e) e.stopPropagation();
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
 * Format: "Lift Name | 0.45 m/s | RPE: 8.5" or "Lift Name | 0.45 m/s | RPE: 8.5 | DEV: 2.4cm"
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

    let deviationCm = null;
    for (let i = 3; i < parts.length; i++) {
      if (/^DEV\s*:/i.test(parts[i])) {
        const devMatch = parts[i].match(/([+-]?[\d.]+)/);
        if (devMatch) {
          const parsedDev = parseFloat(devMatch[1]);
          if (!isNaN(parsedDev)) {
            deviationCm = Math.max(0, parsedDev);
          }
        }
      }
    }

    // Dispatch to nested data hierarchy
    recordRepetition({ lift, velocity, rpe, deviationCm });

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
  closeLiveWeightPopover();
  closeTargetRpePopover();
  closeProgrammedDrawer();
  const isOpen = liftSelectWrapper.classList.toggle('open');
  if (selectTrigger && typeof selectTrigger.setAttribute === 'function') {
    selectTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
}

selectTrigger.addEventListener('click', toggleDropdown);

document.addEventListener('click', (e) => {
  if (!liftSelectWrapper.contains(e.target)) {
    liftSelectWrapper.classList.remove('open');
    if (selectTrigger && typeof selectTrigger.setAttribute === 'function') {
      selectTrigger.setAttribute('aria-expanded', 'false');
    }
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

// Top Header Quick Lift Buttons (S / B / D)
document.querySelectorAll('.header-lift-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const val = btn.getAttribute('data-lift');
    if (val) {
      applyLiftTheme(val);
      await sendLiftCommand(val);
    }
  });
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
  const liftCodeEl = selectedLiftCode || document.getElementById('selected-lift-code');
  if (liftCodeEl) {
    const lower = nextLift.toLowerCase();
    liftCodeEl.textContent = lower.includes('dead') ? 'DL' : (lower.includes('squat') ? 'SQ' : (lower.includes('bench') ? 'BP' : nextLift.slice(0, 2).toUpperCase()));
  }
  document.body.className = `theme-${nextLift.toLowerCase()}`;

  customOptions.forEach(o => o.classList.remove('selected'));
  const targetOpt = Array.from(customOptions).find(o => sameLift(o.getAttribute('data-value'), nextLift));
  if (targetOpt) targetOpt.classList.add('selected');

  // Sync top header lift buttons
  const headerBtns = document.querySelectorAll('.header-lift-btn');
  if (headerBtns && headerBtns.length > 0) {
    headerBtns.forEach(btn => {
      const isTarget = sameLift(btn.getAttribute('data-lift'), nextLift);
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-checked', isTarget ? 'true' : 'false');
    });
  }

  // Update MVT baseline subtext
  const baseline = LIFT_BASELINES[nextLift.toLowerCase()] || LIFT_BASELINES.deadlift;
  if (liveRpeSub) {
    liveRpeSub.textContent = `MVT Baseline: ${baseline.mvt.toFixed(2)} m/s`;
  }

  // Restore remembered weight for this lift
  const liftWeight = getLastWeightForLift(nextLift);
  setWorkingWeight(liftWeight, true);

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
function updateRpeHeroBanner(rpe, repObj = null) {
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

  // Dynamic groove/deviation feedback in #live-rpe-sub (R2)
  if (liveRpeSub) {
    const baseline = LIFT_BASELINES[currentLift.toLowerCase()] || LIFT_BASELINES.deadlift;
    if (activeSet && activeSet.reps && activeSet.reps.length > 0) {
      const lastRep = repObj || activeSet.reps[activeSet.reps.length - 1];
      const dev = (lastRep && typeof lastRep.deviationCm === 'number') ? lastRep.deviationCm : null;
      if (typeof dev === 'number' && !isNaN(dev)) {
        const absDev = Math.abs(dev);
        const sign = dev >= 0 ? '+' : '-';
        let grooveTag = 'GROOVE: LOCKED';
        if (absDev > 3.5) {
          grooveTag = 'GROOVE: BAR DRIFT';
        } else if (absDev > 2.0) {
          grooveTag = 'GROOVE: MILD DRIFT';
        }
        liveRpeSub.textContent = `${grooveTag} (${sign}${absDev.toFixed(1)} cm) • MVT ${baseline.mvt.toFixed(2)} m/s`;
      } else {
        liveRpeSub.textContent = `GROOVE: LOCKED (±0.0 cm) • MVT ${baseline.mvt.toFixed(2)} m/s`;
      }
    } else {
      liveRpeSub.textContent = `MVT Baseline: ${baseline.mvt.toFixed(2)} m/s`;
    }
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
  // 5-Zone Bryan Mann Color Coding for Mean Concentric Velocity
  const meanZone = getBryanMannZone(velocity);
  if (liveVelocity) {
    liveVelocity.textContent = velocity.toFixed(2);
    liveVelocity.classList.remove(
      'vel-zone-power-text', 'vel-zone-speed-text', 'vel-zone-strength-text',
      'vel-zone-accel-text', 'vel-zone-grind-text', 'vel-speed',
      'vel-speed-strength', 'vel-strength-speed', 'vel-accel', 'vel-max', 'vel-grind'
    );
    liveVelocity.classList.add(meanZone.textClass);
    liveVelocity.style.color = meanZone.color;
    liveVelocity.style.textShadow = `0 0 24px ${meanZone.color}`;
  }

  const velBadge = liveVelZoneBadge || document.getElementById('live-vel-zone-badge');
  if (velBadge) {
    velBadge.className = `vel-zone-badge ${meanZone.cssClass} font-mono`;
    velBadge.textContent = meanZone.shortLabel || meanZone.name;
    velBadge.style.display = 'inline-flex';
  }

  if (liveRpe) liveRpe.textContent           = rpe.toFixed(1);
  if (liveVelSub) liveVelSub.textContent     = `Rep Completed: ${velocity >= 0.5 ? 'Explosive' : 'Grinding'}`;

  // Update Peak Velocity Hero Metric (Mean and Peak as Main Focus)
  const currentPeak = activeSet && activeSet.maxVelocity > 0 ? activeSet.maxVelocity : velocity;
  const peakZone = getBryanMannZone(currentPeak);
  if (livePeakVel) {
    livePeakVel.textContent = currentPeak.toFixed(2);
    livePeakVel.classList.remove(
      'vel-zone-power-text', 'vel-zone-speed-text', 'vel-zone-strength-text',
      'vel-zone-accel-text', 'vel-zone-grind-text', 'vel-speed',
      'vel-speed-strength', 'vel-strength-speed', 'vel-accel', 'vel-max', 'vel-grind'
    );
    livePeakVel.classList.add(peakZone.textClass);
    livePeakVel.style.color = peakZone.color;
    livePeakVel.style.textShadow = `0 0 24px ${peakZone.color}`;
  }

  const peakBadge = livePeakZoneBadge || document.getElementById('live-peak-zone-badge');
  if (peakBadge) {
    peakBadge.className = `vel-zone-badge ${peakZone.cssClass} font-mono`;
    peakBadge.textContent = `PEAK • ${peakZone.shortLabel || peakZone.name}`;
    peakBadge.style.display = 'inline-flex';
  }

  if (livePeakSub) {
    livePeakSub.textContent = activeSet ? `Set ${activeSet.setNumber} Peak: ${currentPeak.toFixed(2)} m/s` : `Bar Ascent Peak: ${currentPeak.toFixed(2)} m/s`;
  }

  // PR / Target Velocity Delta Badge
  const targetBadge = liveTargetVelBadge || document.getElementById('live-target-vel-badge');
  const targetValEl = liveTargetVelVal || document.getElementById('live-target-vel-val');
  const deltaEl = liveVelDelta || document.getElementById('live-vel-delta');
  if (targetBadge && targetValEl && deltaEl) {
    const effLift = canonicalLift(lift || currentLift);
    const baseline = LIFT_BASELINES[effLift.toLowerCase()] || LIFT_BASELINES.deadlift;
    const targetRpe = (activeSet && typeof activeSet.targetRpe === 'number') ? activeSet.targetRpe : currentTargetRpe;
    const targetVel = baseline.rpe8 + (8.0 - targetRpe) * ((baseline.rpe8 - baseline.mvt) / 2.0);
    const delta = velocity - targetVel;
    const isPositive = delta >= 0;
    const deltaSign = isPositive ? '+' : '';
    const isPR = activeSet ? activeSet.reps.some(r => r.velocity === velocity && r.isPR) : false;

    targetValEl.textContent = `${targetVel.toFixed(2)} m/s`;
    if (isPR) {
      deltaEl.textContent = `PR ${deltaSign}${delta.toFixed(2)}`;
      deltaEl.className = 'badge-delta positive gold-glow';
    } else {
      deltaEl.textContent = `${deltaSign}${delta.toFixed(2)}`;
      deltaEl.className = `badge-delta ${isPositive ? 'positive' : 'negative'}`;
    }
    targetBadge.style.display = 'inline-flex';
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

  // Trigger real-time animated repetition stroke on the stage
  if (typeof animateRepetitionStroke === 'function') {
    const dev = (typeof arguments[0] === 'object' && typeof arguments[0].deviationCm === 'number') ? arguments[0].deviationCm : 1.8;
    animateRepetitionStroke({
      lift: lift || currentLift,
      velocity: velocity,
      rpe: rpe,
      deviationCm: dev,
      variant: activeAnimationVariant
    });
  }
}

/**
 * Updates the Live tab mini HUD
 */
function updateLiveMiniHud() {
  const velLossPct = activeSet ? activeSet.velocityLossPct : 0.0;
  const arcFill = hudFatigueArcFill || document.getElementById('hud-fatigue-arc-fill');
  const heroBanner = rpeHeroCard || document.getElementById('rpe-hero-card');

  if (activeSet) {
    hudActiveSet.textContent = `Set ${activeSet.setNumber}`;
    hudSetReps.textContent   = `${activeSet.reps.length}`;
    hudVelLoss.textContent   = `${velLossPct.toFixed(1)}%`;
  } else {
    hudActiveSet.textContent = activeWorkout ? `Set ${activeWorkout.sets.length}` : 'Set 0';
    hudSetReps.textContent   = '0';
    hudVelLoss.textContent   = '0.0%';
  }

  // Dynamic Fatigue Color Tokens
  if (hudVelLoss) {
    hudVelLoss.classList.remove('fatigue-minimal', 'fatigue-optimal', 'fatigue-cutoff');
    if (velLossPct > 20.0) {
      hudVelLoss.classList.add('fatigue-cutoff');
    } else if (velLossPct >= 10.0) {
      hudVelLoss.classList.add('fatigue-optimal');
    } else {
      hudVelLoss.classList.add('fatigue-minimal');
    }
  }

  // Dynamic SVG Fatigue Percentage Arc
  if (arcFill) {
    const circumference = 138.23; // 2 * Math.PI * 22
    // Scale: 30% velocity loss maps to 100% full arc
    const ratio = Math.min(Math.max(velLossPct / 30.0, 0), 1);
    const offset = circumference - (circumference * ratio);
    arcFill.style.strokeDashoffset = offset.toFixed(2);

    if (velLossPct > 20.0) {
      arcFill.style.stroke = '#FF3B30'; // Punchy Red
    } else if (velLossPct >= 10.0) {
      arcFill.style.stroke = '#FFD700'; // Specular Gold
    } else {
      arcFill.style.stroke = '#00FF66'; // Electric Emerald
    }
  }

  // Cutoff threshold warning on hero banner
  if (heroBanner) {
    if (velLossPct > 20.0) {
      heroBanner.classList.add('cutoff-exceeded');
    } else {
      heroBanner.classList.remove('cutoff-exceeded');
    }
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

    const restStr = (typeof s.restSeconds === 'number' && s.restSeconds > 0)
      ? formatRestDuration(s.restSeconds)
      : '-';

    const setWeightVal = (typeof s.weight === 'number' && !isNaN(s.weight) && s.weight > 0)
      ? `${s.weight.toFixed(1)} kg`
      : '-';

    const isPushedPr = Boolean(s.isPR || s.isPr || s.prPushed || (Array.isArray(s.reps) && s.reps.some(r => r && r.prPushed)));
    const prBadgeHtml = isPushedPr ? goldenPrBadgeHtml() : '';
    const pushPrBtnHtml = (!isCurrent && repCount > 0 && !isPushedPr)
      ? `<button type="button" class="push-pr-mini-btn" data-push-pr-set-id="${escapeHtml(s.setId)}" data-prep-tooltip-key="prep_push_pr" aria-label="Push Personal Record">` +
        `<svg class="eros-svg-icon eros-svg-icon--sm" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>` +
        `<span class="sr-only">PUSH PR</span>` +
        `</button>`
      : '';

    rowsHtml += `
      <div class="workout-set-row ${isCurrent ? 'is-active-set' : ''} ${isPushedPr ? 'is-pr-set' : ''}" data-set-number="${s.setNumber}" data-set-id="${escapeHtml(s.setId)}" data-lift="${liftKey}">
        <div class="workout-set-row-left">
          <span class="workout-set-num">SET ${s.setNumber}</span>
          <span class="lift-tag" data-lift="${liftKey}">${escapeHtml(setLift.toUpperCase())}</span>
          <span class="workout-set-reps">${repCount} ${repCount === 1 ? 'rep' : 'reps'}</span>
          ${prBadgeHtml}
          ${pushPrBtnHtml}
        </div>
        <div class="workout-set-row-right">
          <div class="workout-set-metric">
            <span class="workout-set-metric-val">${setWeightVal}</span>
            <span class="workout-set-metric-lbl">LOAD</span>
          </div>
          <div class="workout-set-metric">
            <span class="workout-set-metric-val">${avgV}${repCount > 0 ? ' m/s' : ''}</span>
            <span class="workout-set-metric-lbl">AVG</span>
          </div>
          <div class="workout-set-metric">
            <span class="workout-set-metric-val">${maxV}${repCount > 0 ? ' m/s' : ''}</span>
            <span class="workout-set-metric-lbl">PEAK</span>
          </div>
          <div class="workout-set-metric">
            <span class="workout-set-metric-val">${restStr}</span>
            <span class="workout-set-metric-lbl">REST</span>
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
  if (!tableEl._pushPrBound) {
    tableEl.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-push-pr-set-id]') : null;
      if (!btn) return;
      const setId = btn.getAttribute('data-push-pr-set-id');
      if (setId) pushSetAsManualPr(setId);
    });
    tableEl._pushPrBound = true;
  }
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

  const displayWeight = (set && typeof set.weight === 'number' && !isNaN(set.weight))
    ? set.weight
    : (typeof currentWorkingWeight === 'number' ? currentWorkingWeight : getLastWeightForLift(effectiveLift));
  if (liveSetWeightInput && document.activeElement !== liveSetWeightInput) {
    liveSetWeightInput.value = displayWeight.toFixed(1);
  }
  if (workoutSetWeightInput && document.activeElement !== workoutSetWeightInput) {
    workoutSetWeightInput.value = displayWeight.toFixed(1);
  }

  if (!set || set.reps.length === 0) {
    const nextSetNum = set ? set.setNumber : (activeWorkout && Array.isArray(activeWorkout.sets) ? activeWorkout.sets.length + 1 : 1);
    setBadgeLabel.textContent = `SET ${nextSetNum}`;
    setLiftName.textContent   = effectiveLift.toUpperCase();
    setLiftName.setAttribute('data-lift', effectiveLiftKey);
    setRepCounter.textContent = '0 REPS RECORDED';
    setAvgVel.textContent     = '-';
    setAvgVel.style.color     = '';
    setAvgVel.style.textShadow = '';
    setMaxVel.textContent     = '-';
    setMaxVel.style.color     = '';
    setMaxVel.style.textShadow = '';
    setMinVel.textContent     = '-';
    setMinVel.style.color     = '';
    setVelLoss.textContent    = '-';
    setVelLoss.classList.remove('fatigue-minimal', 'fatigue-optimal', 'fatigue-cutoff');
    setAvgRpe.textContent     = '-';
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
  const avgZone = getBryanMannZone(set.avgVelocity);
  setAvgVel.style.color = avgZone.color;
  setAvgVel.style.textShadow = `0 0 16px ${avgZone.color}`;

  setMaxVel.textContent  = set.maxVelocity.toFixed(2);
  const maxZone = getBryanMannZone(set.maxVelocity);
  setMaxVel.style.color = maxZone.color;

  setMinVel.textContent  = set.minVelocity.toFixed(2);
  const minZone = getBryanMannZone(set.minVelocity);
  setMinVel.style.color = minZone.color;

  setVelLoss.textContent = `${set.velocityLossPct.toFixed(1)}`;
  setVelLoss.classList.remove('fatigue-minimal', 'fatigue-optimal', 'fatigue-cutoff');
  if (set.velocityLossPct > 20.0) {
    setVelLoss.classList.add('fatigue-cutoff');
  } else if (set.velocityLossPct >= 10.0) {
    setVelLoss.classList.add('fatigue-optimal');
  } else {
    setVelLoss.classList.add('fatigue-minimal');
  }

  setAvgRpe.textContent  = set.avgRpe.toFixed(1);

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
    const repZone = getBryanMannZone(rep.velocity);
    const baseline = LIFT_BASELINES[repLiftKey] || LIFT_BASELINES.deadlift;
    const targetRpe = (set && typeof set.targetRpe === 'number') ? set.targetRpe : currentTargetRpe;
    const targetVel = baseline.rpe8 + (8.0 - targetRpe) * ((baseline.rpe8 - baseline.mvt) / 2.0);
    const repDelta = rep.velocity - targetVel;
    const deltaSign = repDelta >= 0 ? '+' : '';
    const deltaClass = repDelta >= 0 ? 'positive' : 'negative';
    const deltaBadgeHtml = `<span class="rep-delta-badge font-mono ${deltaClass}">${deltaSign}${repDelta.toFixed(2)}</span>`;
    const prBadgeHtml = isPR ? '<span class="rep-pr-badge gold-glow">PR</span>' : '';
    const progressRingHtml = `<div class="rep-press-progress-ring" aria-hidden="true"><svg class="radial-progress-svg" viewBox="0 0 44 44"><circle class="radial-track" cx="22" cy="22" r="18" /><circle class="radial-indicator" cx="22" cy="22" r="18" /></svg></div>`;

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
          <span class="rep-vel-pill ${repZone.cssClass}">${rep.velocity.toFixed(2)} m/s</span>
          ${deltaBadgeHtml}
          <span class="rep-rpe-pill">RPE ${rep.rpe.toFixed(1)}</span>
        </div>
      </div>
    `;
  });
  activeSetRepsList.innerHTML = html;
  updateWorkoutPage();

  // Attach 500ms long-press listeners on repetition elements
  const repEls = activeSetRepsList.querySelectorAll('.rep-row-item');
  if (repEls.length > 0 && set.reps.length > 0) {
    const cancelFns = [];
    repEls.forEach((rowEl) => {
      const repNum = parseInt(rowEl.getAttribute('data-rep-number'), 10);
      const rep = set.reps.find(r => r.repNumber === repNum) || (repEls.length === 1 ? set.reps[0] : null);
      if (!rep) return;

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
          rowEl.classList.remove('press-holding');
        }
      };
      cancelFns.push(abortHold);

      rowEl.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
        startX = e.clientX;
        startY = e.clientY;
        isHolding = true;
        rowEl.classList.add('press-holding');
        SoundFX.playLongPressHold(0.2);

        pressTimer = setTimeout(() => {
          isHolding = false;
          rowEl.classList.remove('press-holding');
          pressTimer = null;
          if (!rowEl.isConnected || set.endTime || (activeSet && activeSet !== set)) return;

          // Haptic feedback & celebration fanfare
          HapticsFX.vibrate([40, 30, 60]);
          SoundFX.playPrFanfare();

          // Toggle rep.isPR boolean state
          rep.isPR = !rep.isPR;

          // Promote to Gym PR if toggled true
          if (rep.isPR) {
            const repLift = canonicalLift(rep.lift || set.lift || currentLift);
            const repLiftKey = liftKeyOf(repLift);
            const repWeight = (typeof rep.weight === 'number' && rep.weight > 0)
              ? rep.weight
              : ((set && typeof set.weight === 'number' && set.weight > 0)
                  ? set.weight
                  : (prProfile.currentPRs[repLiftKey] || 100.0));

            if (prProfile.currentPRs[repLiftKey] !== undefined) {
              prProfile.currentPRs[repLiftKey] = repWeight;
              if (!prProfile.currentPRDetails) prProfile.currentPRDetails = {};
              prProfile.currentPRDetails[repLiftKey] = {
                weight: repWeight,
                velocity: Number((rep.peakVelocity || rep.velocity || 0).toFixed(2)),
                rpe: Number((rep.rpe || 10).toFixed(1)),
                timestamp: rep.timestamp || Date.now()
              };
              persistPrProfile();
            }
          }

          persistStorage();

          // Update UI
          updateSetUI(set);
          updatePrDashboardUI(true);
          renderHistoryView();
        }, LONG_PRESS_MS);
      });

      rowEl.addEventListener('pointermove', (e) => {
        if (!isHolding) return;
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist > 10) {
          abortHold();
        }
      });

      rowEl.addEventListener('pointerup', abortHold);
      rowEl.addEventListener('pointercancel', abortHold);
      rowEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });
    });

    activeRepPressCancel = () => {
      cancelFns.forEach(fn => fn());
    };
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
  currentPRDetails: {
    squat: { weight: 140.0, velocity: 0.35, rpe: 9.5, timestamp: null },
    bench: { weight: 100.0, velocity: 0.25, rpe: 9.5, timestamp: null },
    deadlift: { weight: 180.0, velocity: 0.28, rpe: 9.5, timestamp: null }
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
        const cSquat = parsed.currentPRs && typeof parsed.currentPRs.squat === 'number' ? parsed.currentPRs.squat : defaultPrProfile.currentPRs.squat;
        const cBench = parsed.currentPRs && typeof parsed.currentPRs.bench === 'number' ? parsed.currentPRs.bench : defaultPrProfile.currentPRs.bench;
        const cDead  = parsed.currentPRs && typeof parsed.currentPRs.deadlift === 'number' ? parsed.currentPRs.deadlift : defaultPrProfile.currentPRs.deadlift;

        const parseDetail = (d, fallbackWeight, def) => {
          if (d && typeof d === 'object') {
            return {
              weight: typeof d.weight === 'number' && !isNaN(d.weight) ? d.weight : fallbackWeight,
              velocity: typeof d.velocity === 'number' && !isNaN(d.velocity) ? d.velocity : def.velocity,
              rpe: typeof d.rpe === 'number' && !isNaN(d.rpe) ? d.rpe : def.rpe,
              timestamp: d.timestamp || null
            };
          }
          return {
            weight: fallbackWeight,
            velocity: def.velocity,
            rpe: def.rpe,
            timestamp: null
          };
        };

        const pDetails = parsed.currentPRDetails || {};

        prProfile = {
          version: parsed.version || 1,
          bodyweight: typeof parsed.bodyweight === 'number' && parsed.bodyweight > 0 ? parsed.bodyweight : defaultPrProfile.bodyweight,
          gender: parsed.gender === 'female' ? 'female' : 'male',
          currentPRs: {
            squat: cSquat,
            bench: cBench,
            deadlift: cDead
          },
          currentPRDetails: {
            squat: parseDetail(pDetails.squat, cSquat, defaultPrProfile.currentPRDetails.squat),
            bench: parseDetail(pDetails.bench, cBench, defaultPrProfile.currentPRDetails.bench),
            deadlift: parseDetail(pDetails.deadlift, cDead, defaultPrProfile.currentPRDetails.deadlift)
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
    if (!prProfile.currentPRDetails) {
      prProfile.currentPRDetails = JSON.parse(JSON.stringify(defaultPrProfile.currentPRDetails));
    }
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

  // Update Gym PR Badges (R3)
  const formatPrBadge = (details, fallbackWeight) => {
    const w = (details && typeof details.weight === 'number' && !isNaN(details.weight)) ? details.weight : (fallbackWeight || 0);
    const v = (details && typeof details.velocity === 'number' && !isNaN(details.velocity)) ? details.velocity : 0.0;
    const r = (details && typeof details.rpe === 'number' && !isNaN(details.rpe)) ? details.rpe : 0.0;
    return `${w.toFixed(1)} kg • ${v.toFixed(2)} m/s • RPE ${r.toFixed(1)}`;
  };

  const details = prProfile.currentPRDetails || {};
  const elSquatBadge = prSquatBadge || document.getElementById('pr-squat-badge');
  const elBenchBadge = prBenchBadge || document.getElementById('pr-bench-badge');
  const elDeadBadge  = prDeadliftBadge || document.getElementById('pr-deadlift-badge');
  if (elSquatBadge) elSquatBadge.textContent = formatPrBadge(details.squat, prProfile.currentPRs.squat);
  if (elBenchBadge) elBenchBadge.textContent = formatPrBadge(details.bench, prProfile.currentPRs.bench);
  if (elDeadBadge)  elDeadBadge.textContent  = formatPrBadge(details.deadlift, prProfile.currentPRs.deadlift);

  // Evaluate DOTS score from selected source total
  const evaluatedTotal = prProfile.activeDotsSource === 'comp' ? compTotal : currentTotal;
  if (dotsTotalDisplay) dotsTotalDisplay.textContent = `${evaluatedTotal.toFixed(1)} kg`;

  const dotsScore = calculateDotsScore(evaluatedTotal, prProfile.bodyweight, prProfile.gender);
  if (dotsScoreDisplay) dotsScoreDisplay.textContent = dotsScore.toFixed(2);
  if (dotsTierBadge) dotsTierBadge.textContent = getDotsClassification(dotsScore);
}

/** Updates the DOTS calculator display and PR summary cards. */
function updateDotsDisplay(updateInputs = false) {
  updatePrDashboardUI(updateInputs);
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

    if (!prProfile.currentPRDetails) prProfile.currentPRDetails = {};
    if (!prProfile.currentPRDetails.squat) {
      prProfile.currentPRDetails.squat = { weight: prProfile.currentPRs.squat, velocity: 0.35, rpe: 9.5, timestamp: null };
    } else {
      prProfile.currentPRDetails.squat.weight = prProfile.currentPRs.squat;
    }

    if (!prProfile.currentPRDetails.bench) {
      prProfile.currentPRDetails.bench = { weight: prProfile.currentPRs.bench, velocity: 0.25, rpe: 9.5, timestamp: null };
    } else {
      prProfile.currentPRDetails.bench.weight = prProfile.currentPRs.bench;
    }

    if (!prProfile.currentPRDetails.deadlift) {
      prProfile.currentPRDetails.deadlift = { weight: prProfile.currentPRs.deadlift, velocity: 0.28, rpe: 9.5, timestamp: null };
    } else {
      prProfile.currentPRDetails.deadlift.weight = prProfile.currentPRs.deadlift;
    }

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
      syncBiometricsFromDots(prProfile.bodyweight, prProfile.gender);
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
      syncBiometricsFromDots(prProfile.bodyweight, prProfile.gender);
    });

    dotsGenderFemale.addEventListener('click', () => {
      prProfile.gender = 'female';
      dotsGenderMale.classList.remove('active');
      dotsGenderMale.setAttribute('aria-checked', 'false');
      dotsGenderFemale.classList.add('active');
      dotsGenderFemale.setAttribute('aria-checked', 'true');
      persistPrProfile();
      updatePrDashboardUI(false);
      syncBiometricsFromDots(prProfile.bodyweight, prProfile.gender);
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
  let lifetimeVolume = 0;

  workouts.forEach(w => {
    if (w.sets) {
      totalSets += w.sets.length;
      w.sets.forEach(s => {
        const reps = Array.isArray(s.reps) ? s.reps : [];
        totalReps += reps.length;
        const setWeight = (typeof s.weight === 'number' && !isNaN(s.weight)) ? s.weight : 0;
        lifetimeVolume += setWeight * reps.length;
        reps.forEach(r => {
          if (r.velocity > peakVel) peakVel = r.velocity;
        });
      });
    }
  });

  sumWorkouts.textContent = totalWorkouts;
  sumSets.textContent     = totalSets;
  sumReps.textContent     = totalReps;
  sumBestVel.textContent  = peakVel.toFixed(2);
  if (sumVolume) {
    sumVolume.textContent = `${Math.round(lifetimeVolume).toLocaleString('en-US')} kg`;
  }
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
    let sessionVolume = 0;

    setList.forEach(s => {
      const reps = Array.isArray(s.reps) ? s.reps : [];
      sessionRepsCount += reps.length;
      const sWeight = (typeof s.weight === 'number' && !isNaN(s.weight)) ? s.weight : 0;
      sessionVolume += sWeight * reps.length;
      reps.forEach(r => { velSum += r.velocity; });
    });

    const sessionAvgVel = sessionRepsCount > 0 ? (velSum / sessionRepsCount).toFixed(2) : '0.00';
    const durationMins = session.endTime
      ? Math.max(1, Math.round((session.endTime - session.startTime) / 60000))
      : 'Active';
    const formattedVolume = `${Math.round(sessionVolume).toLocaleString('en-US')} kg`;

    const sessionTitle = formatWorkoutTitle(session);
    session.name = sessionTitle;
    const sessionHasPr = setList.some(s => Boolean(s.isPR || s.isPr || s.prPushed || (Array.isArray(s.reps) && s.reps.some(r => r && r.prPushed))));

    html += `
      <div class="session-card ${isExpanded ? 'expanded' : ''}" data-session-id="${escapeHtml(session.id)}">
        <div class="session-card-header" onclick="toggleSessionCard('${escapeHtml(session.id)}')">
          <div class="session-card-title-group">
            <span class="session-card-title">${escapeHtml(sessionTitle)}${sessionHasPr ? ` ${goldenPrBadgeHtml()}` : ''}</span>
            <span class="session-card-meta">${escapeHtml(session.dateStr)} • ${durationMins} ${typeof durationMins === 'number' ? 'mins' : ''} • ${setList.length}S / ${sessionRepsCount}R</span>
          </div>
          <div class="session-card-stats">
            <div class="session-stat-chip">
              <span class="stat-chip-val font-mono">${formattedVolume}</span>
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
    const sWeight = (typeof s.weight === 'number' && !isNaN(s.weight)) ? s.weight : 0;
    const repCount = Array.isArray(s.reps) ? s.reps.length : 0;
    const setVol = sWeight * repCount;
    const formattedSetVol = `${Math.round(setVol).toLocaleString('en-US')} kg`;
    const weightLabel = sWeight > 0 ? ` (${sWeight.toFixed(1)} kg)` : '';

    const repPills = (s.reps || []).map(r => `
      <span class="history-rep-pill font-mono">#${r.repNumber}: ${r.velocity.toFixed(2)}m/s${r.isPR ? ' <span class="rep-pr-badge gold-glow">PR</span>' : ''}</span>
    `).join('');

    const restStr = (typeof s.restSeconds === 'number' && s.restSeconds > 0)
      ? formatRestDuration(s.restSeconds)
      : '-';
    const setHasPr = Boolean(s.isPR || s.isPr || s.prPushed || (Array.isArray(s.reps) && s.reps.some(r => r && r.prPushed)));

    out += `
      <div class="session-set-item ${setHasPr ? 'is-pr-set' : ''}" data-lift="${setLiftKey}">
        <div class="session-set-header">
          <span class="session-set-tag" data-lift="${setLiftKey}">SET ${s.setNumber} — ${escapeHtml(setLift.toUpperCase())}${weightLabel}${setHasPr ? ` ${goldenPrBadgeHtml()}` : ''}</span>
          <div class="session-set-stats font-mono">
            <span class="set-stat-vol">Vol: ${formattedSetVol}</span>
            <span class="set-stat-vel">Avg: ${s.avgVelocity.toFixed(2)} m/s</span>
            <span class="set-stat-loss">Loss: ${s.velocityLossPct.toFixed(1)}%</span>
            <span class="set-stat-rest">Rest: ${restStr}</span>
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
    ['Workout ID', 'Workout Date', 'Set Number', 'Lift', 'Rep Number', 'Velocity (m/s)', 'RPE', 'Set Avg Velocity', 'Set Velocity Loss %', 'Rest Time (s)', 'Timestamp']
  ];

  workouts.forEach(w => {
    (w.sets || []).forEach(s => {
      const restSecVal = (typeof s.restSeconds === 'number' && !isNaN(s.restSeconds)) ? s.restSeconds : '';
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
          restSecVal,
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

const TAB_ORDER = {
  live: 0,
  set: 1,
  history: 2
};

let tabTransitionTimeouts = [];

function clearTabTransitions() {
  tabTransitionTimeouts.forEach(t => clearTimeout(t));
  tabTransitionTimeouts = [];
  Object.values(tabSections).forEach(s => {
    if (s) {
      s.classList.remove(
        'leaving-section',
        'slide-left-out',
        'slide-right-out',
        'slide-left-in',
        'slide-right-in'
      );
    }
  });
}

function switchTab(target) {
  const targetTab = Array.from(navTabs).find(t => t.getAttribute('data-target') === target);
  if (targetTab) {
    targetTab.click();
  }
}

if (typeof window !== 'undefined') {
  window.TAB_ORDER = TAB_ORDER;
  window.clearTabTransitions = clearTabTransitions;
  window.switchTab = switchTab;
}

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    SoundFX.playNavTick();
    HapticsFX.vibrate([15]);

    const target = tab.getAttribute('data-target');
    if (!target || !tabSections[target]) return;
    if (target === currentTabTarget && tabSections[target].classList.contains('active-section')) return;

    const prevTarget = currentTabTarget;
    currentTabTarget = target;

    const prevIndex = TAB_ORDER[prevTarget] !== undefined ? TAB_ORDER[prevTarget] : 0;
    const targetIndex = TAB_ORDER[target] !== undefined ? TAB_ORDER[target] : 0;
    const isForward = targetIndex > prevIndex;

    const inClass = isForward ? 'slide-left-in' : 'slide-right-in';
    const outClass = isForward ? 'slide-left-out' : 'slide-right-out';

    // 1. Update active class on navTabs
    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update data-active attribute on .bottom-glass-nav
    if (bottomGlassNav) {
      bottomGlassNav.setAttribute('data-active', target);
    }

    const prevSection = tabSections[prevTarget];
    const targetSection = tabSections[target];

    const dockEl = floatingSetDock || document.getElementById('floating-set-dock');
    if (dockEl) {
      dockEl.style.display = target === 'live' ? 'flex' : 'none';
    }

    if (target === 'set') {
      renderAthletePrepHub();
      renderAthletePlanVsActual();
    } else if (target === 'history') {
      populateAthleteBiometricsForm();
    } else if (target === 'live') {
      if (typeof renderVelocityChangeGraph === 'function') renderVelocityChangeGraph(1.0);
      if (typeof renderBarPathStage === 'function') renderBarPathStage(currentReplayRepIdx, 1.0);
    }

    // 2. Clear any active transition states from rapid clicking
    clearTabTransitions();

    // 3. Mark non-target sections inactive
    Object.values(tabSections).forEach(s => {
      if (s && s !== targetSection) {
        s.classList.remove('active-section');
      }
    });

    // 4. Stage leaving section
    if (prevSection && prevSection !== targetSection) {
      prevSection.classList.add('leaving-section', outClass);
    }

    // 5. Activate target section with explicit WebKit reflow trigger
    if (targetSection) {
      targetSection.classList.add('active-section');
      // Explicit iOS WebKit reflow trigger: forces style evaluation before animation
      void targetSection.offsetHeight;
      targetSection.classList.add(inClass);
    }

    // 6. Cleanup after transition duration (280ms)
    const timeoutId = setTimeout(() => {
      if (prevSection) {
        prevSection.classList.remove('leaving-section', outClass);
      }
      if (targetSection) {
        targetSection.classList.remove(inClass);
      }
    }, 280);
    tabTransitionTimeouts.push(timeoutId);
  });
});

function setConnectedUI(connected) {
  btnConnect.disabled = false;
  if (connected) {
    if (btnConnectText) btnConnectText.innerHTML = 'DISCONNECT <span class="eros-wordmark">Eros</span>';
    btnConnect.classList.add('connected');
    statusBadge.className = 'glass-pill status-connected';
    statusBadge.setAttribute('aria-label', 'Eros Connected');
    const statusLblConn = statusBadge.querySelector('.status-label');
    if (statusLblConn) statusLblConn.textContent = 'Connected';
  } else {
    if (btnConnectText) btnConnectText.innerHTML = 'CONNECT <span class="eros-wordmark">Eros</span>';
    btnConnect.classList.remove('connected');
    statusBadge.className = 'glass-pill status-disconnected';
    statusBadge.setAttribute('aria-label', 'Eros Disconnected');
    const statusLblDisc = statusBadge.querySelector('.status-label');
    if (statusLblDisc) statusLblDisc.textContent = 'Disconnected';
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

// ── Coach Downlink Directive Synchronization ──
function initCoachDirectiveSync() {
  if (typeof window === 'undefined' || !window.ErosSyncBus || typeof window.ErosSyncBus.on !== 'function') return;

  // Listen for coach technical cues
  window.ErosSyncBus.on('coach:cue', (payload) => {
    if (!payload || !payload.text) return;
    if (typeof CoachCueHUD !== 'undefined' && typeof CoachCueHUD.showCoachCue === 'function') {
      CoachCueHUD.showCoachCue(payload, 4500);
    } else if (typeof AthleteFX !== 'undefined' && typeof AthleteFX.showCoachCue === 'function') {
      AthleteFX.showCoachCue(payload.text, 4500);
    }
  });

  // Listen for coach load overrides
  window.ErosSyncBus.on('coach:load_override', (payload) => {
    if (!payload) return;
    if (typeof CoachCueHUD !== 'undefined' && typeof CoachCueHUD.showCoachDirective === 'function') {
      CoachCueHUD.showCoachDirective(payload);
      return;
    }
    const currentWeight = (typeof currentWorkingWeight === 'number' && !isNaN(currentWorkingWeight))
      ? currentWorkingWeight
      : 140.0;
    const newWeight = (typeof payload.newWeight === 'number')
      ? payload.newWeight
      : Math.max(0, currentWeight + (payload.deltaKg || 0));

    if (typeof AthleteFX !== 'undefined' && typeof AthleteFX.showCoachDirectiveModal === 'function') {
      AthleteFX.showCoachDirectiveModal({
        id: payload.id,
        deltaKg: payload.deltaKg || (newWeight - currentWeight),
        newWeight: newWeight,
        prevWeight: currentWeight,
        autoAcceptSeconds: payload.autoAcceptSeconds || 20,
        cueText: payload.text || `Coach load modification: ${(newWeight - currentWeight) >= 0 ? '+' : ''}${(newWeight - currentWeight).toFixed(1)} kg`
      }, {
        onAccept: (acceptedWeight) => {
          setWorkingWeight(acceptedWeight, true);
          if (window.ErosSyncBus) {
            window.ErosSyncBus.emit('coach:load_response', {
              id: payload.id,
              accepted: true,
              finalWeight: acceptedWeight,
              timestamp: Date.now()
            });
          }
        },
        onDismiss: (keptWeight) => {
          if (window.ErosSyncBus) {
            window.ErosSyncBus.emit('coach:load_response', {
              id: payload.id,
              accepted: false,
              finalWeight: keptWeight,
              timestamp: Date.now()
            });
          }
        }
      });
    } else {
      setWorkingWeight(newWeight, true);
      if (window.ErosSyncBus) {
        window.ErosSyncBus.emit('coach:load_response', {
          id: payload.id,
          accepted: true,
          finalWeight: newWeight,
          timestamp: Date.now()
        });
      }
    }
  });

  // Listen for coach target rest configuration
  window.ErosSyncBus.on('coach:rest_target', (payload) => {
    if (!payload || !payload.targetSeconds) return;
    const targetSeconds = Math.round(Number(payload.targetSeconds));
    if (!isFinite(targetSeconds) || targetSeconds <= 0) return;
    activeCoachTargetRestSeconds = targetSeconds;
    if (activeSet) {
      activeSet.prescribedRestSeconds = targetSeconds;
    } else if (restStartTime) {
      lastDisplayedRestTargetSeconds = targetSeconds;
      updateRestClockDisplay(targetSeconds);
    }
  });
}

// ── Athlete Settings Micro-Menu & Coach Connection (Requirement R4) ──
function initAthleteSettings() {
  const btnSettings = document.getElementById('btn-athlete-settings');
  const modal = document.getElementById('athlete-settings-modal');
  const btnClose = document.getElementById('btn-athlete-settings-close');
  const backdrop = document.getElementById('athlete-settings-backdrop');
  const nameInput = document.getElementById('athlete-settings-name');
  const rackInput = document.getElementById('athlete-settings-rack');
  const coachCodeInput = document.getElementById('athlete-settings-coach-code');
  const btnConnect = document.getElementById('btn-athlete-connect-coach');
  const btnConnectText = document.getElementById('btn-athlete-connect-text');
  const statusBadge = document.getElementById('athlete-coach-status-badge');
  const statusText = document.getElementById('athlete-coach-status-text');

  if (!btnSettings || !modal) return;

  const STORAGE_KEY = 'eros_athlete_coach_connection_v1';

  function loadConnectionState() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch (_) {}
    return {
      connected: false,
      athleteName: 'Active Athlete',
      rackId: 'Rack 01',
      coachCode: '',
      athleteId: 'ath_01',
      lastSync: null
    };
  }

  function saveConnectionState(state) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (_) {}
  }

  function updateUI(state) {
    if (nameInput && state.athleteName) nameInput.value = state.athleteName;
    if (rackInput && state.rackId) rackInput.value = state.rackId;
    if (coachCodeInput && state.coachCode) coachCodeInput.value = state.coachCode;

    if (statusBadge && statusText && btnConnect && btnConnectText) {
      if (state.connected) {
        statusBadge.className = 'athlete-coach-status-badge status-connected';
        statusText.textContent = 'Connected';
        btnConnect.classList.add('connected-mode');
        btnConnectText.textContent = 'Disconnect from Coach';
      } else {
        statusBadge.className = 'athlete-coach-status-badge status-disconnected';
        statusText.textContent = 'Disconnected';
        btnConnect.classList.remove('connected-mode');
        btnConnectText.textContent = 'Connect to Coach';
      }
    }
  }

  let currentState = loadConnectionState();
  updateUI(currentState);

  function openModal() {
    currentState = loadConnectionState();
    updateUI(currentState);
    modal.style.display = 'flex';
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  if (!btnSettings._athleteBound) {
    btnSettings.addEventListener('click', openModal);
    btnSettings._athleteBound = true;
  }
  if (btnClose && !btnClose._athleteBound) {
    btnClose.addEventListener('click', closeModal);
    btnClose._athleteBound = true;
  }
  if (backdrop && !backdrop._athleteBound) {
    backdrop.addEventListener('click', closeModal);
    backdrop._athleteBound = true;
  }

  if (typeof document !== 'undefined' && !document._athleteEscBound) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display !== 'none') {
        closeModal();
      }
    });
    document._athleteEscBound = true;
  }

  if (btnConnect && !btnConnect._athleteBound) {
    btnConnect.addEventListener('click', () => {
      const isCurrentlyConnected = currentState.connected;
      const athleteName = (nameInput && nameInput.value.trim()) || 'Active Athlete';
      const rackId = (rackInput && rackInput.value.trim()) || 'Rack 01';
      let coachCode = (coachCodeInput && coachCodeInput.value.trim().toUpperCase()) || '';

      if (isCurrentlyConnected) {
        currentState = {
          connected: false,
          athleteName: athleteName,
          rackId: rackId,
          coachCode: coachCode,
          athleteId: currentState.athleteId || ATHLETE_PREP_ID,
          lastSync: Date.now()
        };
        saveConnectionState(currentState);
        updateUI(currentState);
      } else {
        if (!coachCode) {
          coachCode = 'EROS-7X9K';
          if (coachCodeInput) coachCodeInput.value = coachCode;
        }
        const assignedAthleteId = (currentState.athleteId && String(currentState.athleteId).trim())
          ? String(currentState.athleteId).trim()
          : ATHLETE_PREP_ID;
        currentState = {
          connected: true,
          athleteName: athleteName,
          rackId: rackId,
          coachCode: coachCode,
          athleteId: assignedAthleteId,
          lastSync: Date.now()
        };
        saveConnectionState(currentState);
        updateUI(currentState);

        const payload = {
          athleteId: assignedAthleteId,
          athleteName: athleteName,
          rackId: rackId,
          coachCode: coachCode,
          timestamp: Date.now()
        };

        if (window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
          window.ErosSyncBus.emit('athlete:connect', payload);
        }

        if (typeof CustomEvent === 'function') {
          window.dispatchEvent(new CustomEvent('eros:athlete_connect', { detail: payload }));
        }
      }
    });
    btnConnect._athleteBound = true;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. ATHLETE PREPARATION HUB, BIOMETRICS DOSSIER & SMART PR CONFIRMATION
// ═════════════════════════════════════════════════════════════════════════════

function formatLocalIsoDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMondayDateStr(dateStr) {
  const parts = String(dateStr || '').split('-').map(Number);
  const d = (parts.length === 3 && parts[0] && parts[1] && parts[2])
    ? new Date(parts[0], parts[1] - 1, parts[2])
    : new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalIsoDate(d);
}

function addDaysIsoDate(dateStr, offsetDays) {
  const parts = String(dateStr || '').split('-').map(Number);
  const d = (parts.length === 3 && parts[0] && parts[1] && parts[2])
    ? new Date(parts[0], parts[1] - 1, parts[2])
    : new Date();
  d.setDate(d.getDate() + Number(offsetDays || 0));
  return formatLocalIsoDate(d);
}

function getPrepStore() {
  return (typeof window !== 'undefined' && window.ErosPrepStore) ? window.ErosPrepStore : null;
}

function getPrepEngine() {
  return (typeof window !== 'undefined' && window.ErosPrepEngine) ? window.ErosPrepEngine : null;
}

function normalizePrepSlot(rawSlot, idx = 0) {
  const s = (rawSlot && typeof rawSlot === 'object') ? rawSlot : {};
  const topSrc = (s.topSet && typeof s.topSet === 'object') ? s.topSet : {};
  const backSrc = (s.backoff && typeof s.backoff === 'object')
    ? s.backoff
    : ((s.backoffSets && typeof s.backoffSets === 'object') ? s.backoffSets : null);
  const baseLift = canonicalLift(s.baseLift || s.base_lift || s.lift || currentLift || 'Deadlift');
  const topRpe = Number(topSrc.rpe != null ? topSrc.rpe : (topSrc.targetRpe != null ? topSrc.targetRpe : 8.0));
  const topLoad = Number(topSrc.loadKg != null ? topSrc.loadKg : (topSrc.suggestedLoadKg != null ? topSrc.suggestedLoadKg : 0));
  const topVel = Number(topSrc.targetVelocity != null ? topSrc.targetVelocity : 0);
  const topLoss = Number(topSrc.velocityLossCapPct != null ? topSrc.velocityLossCapPct : 20);

  let normalizedBackoff = null;
  if (backSrc && (Number(backSrc.sets) > 0 || Number(backSrc.reps) > 0 || backSrc.rpe != null || backSrc.targetRpe != null)) {
    const bRpe = Number(backSrc.rpe != null ? backSrc.rpe : (backSrc.targetRpe != null ? backSrc.targetRpe : 7.0));
    const bDrop = Number(backSrc.dropPct != null ? backSrc.dropPct : 10);
    const bLoad = Number(backSrc.loadKg != null ? backSrc.loadKg : (backSrc.suggestedLoadKg != null ? backSrc.suggestedLoadKg : (topLoad > 0 ? Math.round((topLoad * (1 - bDrop / 100)) * 2) / 2 : 0)));
    normalizedBackoff = {
      sets: Number(backSrc.sets) || 2,
      reps: Number(backSrc.reps) || Number(topSrc.reps) || 5,
      rpe: isFinite(bRpe) ? bRpe : 7.0,
      targetRpe: isFinite(bRpe) ? bRpe : 7.0,
      dropPct: isFinite(bDrop) ? bDrop : 10,
      loadKg: isFinite(bLoad) ? bLoad : 0,
      targetVelocity: Number(backSrc.targetVelocity != null ? backSrc.targetVelocity : 0),
      velocityLossCapPct: Number(backSrc.velocityLossCapPct != null ? backSrc.velocityLossCapPct : topLoss)
    };
  }

  return {
    slotId: String(s.slotId || s.slot_id || `slot_${idx + 1}`),
    exerciseId: String(s.exerciseId || s.exercise_id || ''),
    exerciseName: String(s.exerciseName || s.exercise_name || s.name || baseLift),
    baseLift: baseLift,
    topSet: {
      sets: Number(topSrc.sets) || 1,
      reps: Number(topSrc.reps) || 3,
      rpe: isFinite(topRpe) ? topRpe : 8.0,
      targetRpe: isFinite(topRpe) ? topRpe : 8.0,
      loadKg: isFinite(topLoad) ? topLoad : 0,
      targetVelocity: isFinite(topVel) ? topVel : 0,
      velocityLossCapPct: isFinite(topLoss) ? topLoss : 20
    },
    backoff: normalizedBackoff
  };
}

function normalizePlannedWorkout(rawWk) {
  if (!rawWk || typeof rawWk !== 'object') return null;
  let rawSlots = rawWk.prescribedSlots || rawWk.slots || rawWk.prescribed_slots_json || [];
  if (typeof rawSlots === 'string') {
    try { rawSlots = JSON.parse(rawSlots); } catch (_) { rawSlots = []; }
  }
  const slots = Array.isArray(rawSlots) ? rawSlots.map((s, idx) => normalizePrepSlot(s, idx)) : [];
  return {
    ...rawWk,
    workoutId: String(rawWk.workoutId || rawWk.workout_id || ''),
    planId: String(rawWk.planId || rawWk.plan_id || ''),
    athleteId: String(rawWk.athleteId || rawWk.athlete_id || ATHLETE_PREP_ID),
    scheduledDate: String(rawWk.scheduledDate || rawWk.scheduled_date || '').slice(0, 10),
    weekIndex: Number(rawWk.weekIndex != null ? rawWk.weekIndex : (rawWk.week_index || 1)),
    dayOfWeek: String(rawWk.dayOfWeek || rawWk.day_of_week || ''),
    blockPhase: String(rawWk.blockPhase || rawWk.block_phase || ''),
    isDeload: Boolean(rawWk.isDeload != null ? rawWk.isDeload : rawWk.is_deload),
    sessionTitle: String(rawWk.sessionTitle || rawWk.session_title || 'Planned Session'),
    prescribedSlots: slots,
    workoutNotes: String(rawWk.workoutNotes != null ? rawWk.workoutNotes : (rawWk.workout_notes || '')),
    dietaryNotes: String(rawWk.dietaryNotes != null ? rawWk.dietaryNotes : (rawWk.dietary_notes || '')),
    athleteFeedbackNote: String(rawWk.athleteFeedbackNote != null ? rawWk.athleteFeedbackNote : (rawWk.athlete_feedback_note || '')),
    adherenceStatus: String(rawWk.adherenceStatus || rawWk.adherence_status || '')
  };
}

function normalizePrepPlan(rawPlan) {
  if (!rawPlan || typeof rawPlan !== 'object') return null;
  let macroBlocks = rawPlan.macroBlocks || rawPlan.macro_blocks_json || [];
  if (typeof macroBlocks === 'string') {
    try { macroBlocks = JSON.parse(macroBlocks); } catch (_) { macroBlocks = []; }
  }
  return {
    ...rawPlan,
    planId: String(rawPlan.planId || rawPlan.plan_id || ''),
    athleteId: String(rawPlan.athleteId || rawPlan.athlete_id || ATHLETE_PREP_ID),
    title: String(rawPlan.title || 'Active Preparation Plan'),
    goalType: String(rawPlan.goalType || rawPlan.goal_type || ''),
    durationMonths: Number(rawPlan.durationMonths != null ? rawPlan.durationMonths : (rawPlan.duration_months || 0)),
    startDate: String(rawPlan.startDate || rawPlan.start_date || '').slice(0, 10),
    targetMeetDate: String(rawPlan.targetMeetDate || rawPlan.target_meet_date || '').slice(0, 10),
    macroBlocks: Array.isArray(macroBlocks) ? macroBlocks : [],
    dietaryStrategyNotes: String(rawPlan.dietaryStrategyNotes != null ? rawPlan.dietaryStrategyNotes : (rawPlan.dietary_strategy_notes || '')),
    coachNotes: String(rawPlan.coachNotes != null ? rawPlan.coachNotes : (rawPlan.coach_notes || ''))
  };
}

function loadPrepStateFromStore() {
  const store = getPrepStore();
  let plan = null;
  let list = [];

  if (store) {
    if (typeof store.getActivePlan === 'function') {
      plan = normalizePrepPlan(store.getActivePlan(ATHLETE_PREP_ID));
    }
    if (typeof store.listPlannedWorkouts === 'function') {
      list = (store.listPlannedWorkouts(ATHLETE_PREP_ID) || []).map(normalizePlannedWorkout).filter(Boolean);
    } else if (plan && plan.planId && typeof store.getWorkoutsForPlan === 'function') {
      list = (store.getWorkoutsForPlan(plan.planId) || []).map(normalizePlannedWorkout).filter(Boolean);
    }
  }

  if (!plan && athletePrepState.cache.plan) {
    plan = normalizePrepPlan(athletePrepState.cache.plan);
  }
  if (list.length === 0 && Object.keys(athletePrepState.cache.workouts).length > 0) {
    list = Object.values(athletePrepState.cache.workouts).map(normalizePlannedWorkout).filter(Boolean);
  }

  list.sort((a, b) => String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')));
  athletePrepState.plan = plan;
  athletePrepState.workouts = list;

  const today = formatLocalIsoDate(new Date());
  if (!athletePrepState.selectedDate) {
    const exactToday = list.find(w => w.scheduledDate === today);
    const nextUpcoming = list.find(w => w.scheduledDate >= today);
    athletePrepState.selectedDate = (exactToday && exactToday.scheduledDate)
      || (nextUpcoming && nextUpcoming.scheduledDate)
      || (list[0] && list[0].scheduledDate)
      || today;
  }
}

function getSelectedPlannedWorkout() {
  const dateKey = athletePrepState.selectedDate || formatLocalIsoDate(new Date());
  return athletePrepState.workouts.find(w => w.scheduledDate === dateKey) || null;
}

function getAllRecordedSetsForComparison(plannedWorkout) {
  const collected = [];
  const seenIds = new Set();
  const targetDate = plannedWorkout && plannedWorkout.scheduledDate ? plannedWorkout.scheduledDate : '';
  const targetWorkoutId = plannedWorkout && plannedWorkout.workoutId ? plannedWorkout.workoutId : '';

  const allSessions = [];
  if (activeWorkout) allSessions.push(activeWorkout);
  workouts.forEach(w => {
    if (w && w !== activeWorkout) allSessions.push(w);
  });

  allSessions.forEach(session => {
    const sessionDate = session && session.startTime ? formatLocalIsoDate(session.startTime) : '';
    const sessionMatchesWorkout = Boolean(
      targetWorkoutId && session && session.plannedWorkoutId && session.plannedWorkoutId === targetWorkoutId
    );
    const sets = Array.isArray(session && session.sets) ? session.sets : [];
    sets.forEach(s => {
      if (!s || seenIds.has(s.setId)) return;
      const setWorkoutId = s.plannedWorkoutId || s.planned_workout_id || '';
      const dateMatches = Boolean(targetDate && sessionDate === targetDate && !setWorkoutId);
      const idMatches = Boolean(targetWorkoutId && setWorkoutId === targetWorkoutId);
      if (idMatches || sessionMatchesWorkout || dateMatches || !targetWorkoutId) {
        seenIds.add(s.setId);
        collected.push(s);
      }
    });
  });

  return collected;
}

function resolvePlannedSlotIdForSet(workoutId, liftName) {
  if (!workoutId) return null;
  const wk = athletePrepState.workouts.find(w => w.workoutId === workoutId);
  if (!wk || !Array.isArray(wk.prescribedSlots) || wk.prescribedSlots.length === 0) {
    return activePlannedSlotId || null;
  }
  if (activePlannedSlotId) {
    const explicit = wk.prescribedSlots.find(s => s.slotId === activePlannedSlotId);
    if (explicit && sameLift(explicit.baseLift, liftName)) {
      return explicit.slotId;
    }
  }
  const byLift = wk.prescribedSlots.find(s => sameLift(s.baseLift, liftName));
  return byLift ? byLift.slotId : (activePlannedSlotId || null);
}

function isSlotCompletedLocally(workout, slot) {
  if (!workout || !slot) return false;
  const sets = getAllRecordedSetsForComparison(workout);
  return sets.some(s => {
    if (!s || !Array.isArray(s.reps) || s.reps.length === 0) return false;
    const sSlotId = s.plannedSlotId || s.planned_slot_id;
    if (sSlotId && sSlotId === slot.slotId) return true;
    return !sSlotId && sameLift(s.lift, slot.baseLift);
  });
}

function ensurePrepNoticeEl() {
  const hub = document.getElementById('athlete-prep-hub');
  if (!hub) return null;
  let el = document.getElementById('athlete-prep-notice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'athlete-prep-notice';
    el.className = 'athlete-prep-notice font-mono';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    const header = document.getElementById('athlete-prep-header-card');
    if (header && header.nextSibling) {
      hub.insertBefore(el, header.nextSibling);
    } else {
      hub.prepend(el);
    }
  }
  return el;
}

function showPrepNotice(text, durationMs = 3400) {
  const el = ensurePrepNoticeEl();
  if (!el) return;
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(athletePrepState.noticeTimer);
  athletePrepState.noticeTimer = setTimeout(() => {
    el.classList.remove('visible');
  }, durationMs);
}

function launchPlannedSlot(workout, slot) {
  if (!workout || !slot) return;
  const targetLift = canonicalLift(slot.baseLift || currentLift || 'Deadlift');
  activePlannedWorkoutId = workout.workoutId || null;
  activePlannedSlotId = slot.slotId || null;
  activePlannedLift = targetLift;

  if (!sameLift(currentLift, targetLift)) {
    applyLiftTheme(targetLift);
  }
  const loadKg = Number(slot.topSet && slot.topSet.loadKg);
  if (isFinite(loadKg) && loadKg > 0) {
    setWorkingWeight(loadKg, true);
  }
  const targetRpe = Number(slot.topSet && (slot.topSet.rpe != null ? slot.topSet.rpe : slot.topSet.targetRpe));
  if (isFinite(targetRpe) && targetRpe >= 5 && targetRpe <= 10) {
    setTargetRpe(targetRpe, false);
  }

  if (!activeWorkout) {
    startWorkoutSession();
  }
  if (activeWorkout) {
    activeWorkout.plannedWorkoutId = activePlannedWorkoutId;
    persistStorage();
  }

  renderAthletePrepHub();
  renderAthletePlanVsActual();
  renderLivePrescriptionStrip();
  switchTab('live');
}

/**
 * Counts completed sets in the current workout (or stored workouts) matching a planned slot.
 */
function countCompletedSetsForSlot(workout, slot) {
  if (!workout || !slot) return 0;
  const sets = getAllRecordedSetsForComparison(workout);
  return sets.filter(s => {
    if (!s || !Array.isArray(s.reps) || s.reps.length === 0) return false;
    const sSlotId = s.plannedSlotId || s.planned_slot_id;
    if (sSlotId) return sSlotId === slot.slotId;
    return sameLift(s.lift, slot.baseLift);
  }).length;
}

/**
 * Auto-advances Set X -> Set Y target weight and RPE when top sets for the active slot finish.
 */
function advanceActivePlannedSlotSet(completedSet) {
  if (!activePlannedWorkoutId || !activePlannedSlotId || activeSet) return;
  const wk = athletePrepState.workouts.find(w => w.workoutId === activePlannedWorkoutId);
  if (!wk || !Array.isArray(wk.prescribedSlots)) return;
  const slot = wk.prescribedSlots.find(s => s.slotId === activePlannedSlotId);
  if (!slot) return;

  const topSets = Number(slot.topSet && slot.topSet.sets) || 1;
  const backoffSets = slot.backoff ? (Number(slot.backoff.sets) || 0) : 0;
  const completedCount = countCompletedSetsForSlot(wk, slot);

  if (completedCount >= topSets && backoffSets > 0 && slot.backoff) {
    const backoffLoad = Number(slot.backoff.loadKg);
    const backoffRpe = Number(slot.backoff.rpe);
    if (isFinite(backoffLoad) && backoffLoad > 0) setWorkingWeight(backoffLoad, true);
    if (isFinite(backoffRpe) && backoffRpe >= 5 && backoffRpe <= 10) setTargetRpe(backoffRpe, false);
  } else if (completedSet && completedCount < topSets && slot.topSet) {
    const topLoad = Number(slot.topSet.loadKg);
    const topRpe = Number(slot.topSet.rpe);
    if (isFinite(topLoad) && topLoad > 0) setWorkingWeight(topLoad, true);
    if (isFinite(topRpe) && topRpe >= 5 && topRpe <= 10) setTargetRpe(topRpe, false);
  }
}

/**
 * Renders the compact #live-prescription-strip above .controls-panel showing the active planned slot and 1-tap Next Slot loader.
 */
function renderLivePrescriptionStrip() {
  const strip = document.getElementById('live-prescription-strip');
  if (!strip) return;

  const wk = activePlannedWorkoutId
    ? athletePrepState.workouts.find(w => w.workoutId === activePlannedWorkoutId)
    : null;
  const slots = (wk && Array.isArray(wk.prescribedSlots)) ? wk.prescribedSlots : [];
  if (!wk || slots.length === 0) {
    strip.style.display = 'none';
    strip.innerHTML = '';
    return;
  }

  let slotIdx = activePlannedSlotId ? slots.findIndex(s => s.slotId === activePlannedSlotId) : 0;
  if (slotIdx < 0) slotIdx = 0;
  const slot = slots[slotIdx];
  if (!slot) {
    strip.style.display = 'none';
    strip.innerHTML = '';
    return;
  }

  const topSets = Number(slot.topSet && slot.topSet.sets) || 1;
  const backoffSets = slot.backoff ? (Number(slot.backoff.sets) || 0) : 0;
  const totalSlotSets = Math.max(1, topSets + backoffSets);
  const completedCount = countCompletedSetsForSlot(wk, slot);
  const currentSetNum = Math.min(totalSlotSets, completedCount + 1);
  const isBackoffPhase = backoffSets > 0 && completedCount >= topSets;
  const activePhase = isBackoffPhase ? slot.backoff : slot.topSet;
  const targetKg = Number(activePhase && activePhase.loadKg) || Number(slot.topSet && slot.topSet.loadKg) || 0;
  const targetRpe = Number(activePhase && activePhase.rpe) || Number(slot.topSet && slot.topSet.rpe) || currentTargetRpe;

  const summaryText = `Slot ${slotIdx + 1}/${slots.length} • Set ${currentSetNum}/${totalSlotSets} • ${targetKg.toFixed(1)} kg @ RPE ${targetRpe.toFixed(1)}`;
  const hasNextSlot = slots.length > 1;
  const nextSlot = hasNextSlot ? slots[(slotIdx + 1) % slots.length] : null;

  strip.innerHTML = `
    <div class="live-rx-main">
      <span class="live-rx-badge font-mono">${escapeHtml(slot.exerciseName || slot.baseLift || 'PLANNED')}</span>
      <span class="live-rx-meta font-mono">${escapeHtml(summaryText)}</span>
    </div>
    ${hasNextSlot && nextSlot ? `
      <button type="button" id="btn-live-next-slot" class="live-rx-next-btn font-mono" data-next-slot-id="${escapeHtml(nextSlot.slotId)}" aria-label="Load next planned slot">
        <span>Next Slot</span>
        <svg class="eros-svg-icon eros-svg-icon--xs" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    ` : ''}
  `;
  strip.style.display = 'flex';

  const nextBtn = document.getElementById('btn-live-next-slot');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (nextSlot) launchPlannedSlot(wk, nextSlot);
    });
  }
}

/**
 * Binds quick-trim (-2.5 / +2.5 kg) and Next Set buttons inside #set-summary-banner.
 */
function bindSummaryBannerQuickActions() {
  const decBtn = document.getElementById('btn-summary-weight-dec');
  const incBtn = document.getElementById('btn-summary-weight-inc');
  const nextBtn = document.getElementById('btn-summary-next-set');

  if (decBtn && !decBtn._summaryBound) {
    decBtn._summaryBound = true;
    decBtn.addEventListener('click', () => {
      if (typeof SoundFX !== 'undefined' && typeof SoundFX.playStepperTick === 'function') SoundFX.playStepperTick();
      const base = (typeof currentWorkingWeight === 'number' && !isNaN(currentWorkingWeight)) ? currentWorkingWeight : 0;
      setWorkingWeight(Math.max(0, base - 2.5), true);
    });
  }
  if (incBtn && !incBtn._summaryBound) {
    incBtn._summaryBound = true;
    incBtn.addEventListener('click', () => {
      if (typeof SoundFX !== 'undefined' && typeof SoundFX.playStepperTick === 'function') SoundFX.playStepperTick();
      const base = (typeof currentWorkingWeight === 'number' && !isNaN(currentWorkingWeight)) ? currentWorkingWeight : 0;
      setWorkingWeight(base + 2.5, true);
    });
  }
  if (nextBtn && !nextBtn._summaryBound) {
    nextBtn._summaryBound = true;
    nextBtn.addEventListener('click', () => {
      if (typeof SoundFX !== 'undefined' && typeof SoundFX.playSetStart === 'function') SoundFX.playSetStart();
      if (typeof HapticsFX !== 'undefined' && typeof HapticsFX.vibrate === 'function') HapticsFX.vibrate([40]);
      if (!activeSet) startNewSet(currentLift);
    });
  }
}

/**
 * Applies a coach-pushed planned slot & target RPE directive into the Live tracker.
 */
function applyCoachPrescribedSlot(directive) {
  if (!directive || typeof directive !== 'object') return;
  if (directive.lift) {
    const targetLift = canonicalLift(directive.lift);
    if (!sameLift(currentLift, targetLift)) {
      applyLiftTheme(targetLift);
    }
  }
  if (directive.plannedWorkoutId) activePlannedWorkoutId = directive.plannedWorkoutId;
  if (directive.plannedSlotId) activePlannedSlotId = directive.plannedSlotId;
  if (typeof directive.targetRpe === 'number' && !isNaN(directive.targetRpe)) {
    setTargetRpe(directive.targetRpe, false);
  }
  renderLivePrescriptionStrip();
}

function buildComparisonFallback(workout, completedSets) {
  const slots = Array.isArray(workout && workout.prescribedSlots) ? workout.prescribedSlots : [];
  const used = new Set();
  const rows = slots.map(slot => {
    const matched = [];
    completedSets.forEach((s, idx) => {
      if (!s || used.has(idx)) return;
      const sSlot = s.plannedSlotId || s.planned_slot_id;
      if (sSlot && sSlot === slot.slotId) {
        matched.push(s);
        used.add(idx);
      } else if (!sSlot && sameLift(s.lift, slot.baseLift)) {
        matched.push(s);
        used.add(idx);
      }
    });
    const plannedSets = (slot.topSet.sets || 1) + (slot.backoff ? (slot.backoff.sets || 0) : 0);
    const plannedLoadKg = Number(slot.topSet.loadKg || 0);
    const plannedVelocity = Number(slot.topSet.targetVelocity || 0);
    const plannedRpe = Number(slot.topSet.rpe || 8);

    let actualLoadKg = 0;
    let velSum = 0;
    let velCount = 0;
    let rpeSum = 0;
    let rpeCount = 0;
    let hasPr = false;
    matched.forEach(s => {
      const w = Number(s.weight) || 0;
      if (w > actualLoadKg) actualLoadKg = w;
      if (typeof s.avgVelocity === 'number' && s.avgVelocity > 0) {
        velSum += s.avgVelocity;
        velCount++;
      }
      if (typeof s.avgRpe === 'number' && s.avgRpe > 0) {
        rpeSum += s.avgRpe;
        rpeCount++;
      }
      if (s.isPR || s.isPr || s.prPushed || (Array.isArray(s.reps) && s.reps.some(r => r && r.prPushed))) {
        hasPr = true;
      }
    });
    const actualVelocity = velCount > 0 ? Number((velSum / velCount).toFixed(2)) : 0;
    const actualRpe = rpeCount > 0 ? Number((rpeSum / rpeCount).toFixed(1)) : 0;
    let status = 'pending';
    if (matched.length > 0) {
      if (hasPr || actualLoadKg > plannedLoadKg || (plannedVelocity > 0 && actualVelocity >= plannedVelocity + 0.03)) {
        status = 'exceeded';
      } else if (matched.length >= plannedSets && actualLoadKg >= plannedLoadKg * 0.95) {
        status = 'hit';
      } else {
        status = 'under';
      }
    }
    return {
      slotId: slot.slotId,
      exerciseName: slot.exerciseName,
      baseLift: slot.baseLift,
      planned: {
        sets: plannedSets,
        reps: slot.topSet.reps,
        loadKg: plannedLoadKg,
        rpe: plannedRpe,
        targetVelocity: plannedVelocity,
        backoff: slot.backoff
      },
      actual: {
        sets: matched.length,
        loadKg: actualLoadKg,
        avgVelocity: actualVelocity,
        avgRpe: actualRpe,
        hasPr: hasPr
      },
      hasPr: hasPr,
      status: status
    };
  });
  const done = rows.filter(r => r.actual.sets > 0).length;
  return {
    rows: rows,
    adherencePct: rows.length > 0 ? Math.round((done / rows.length) * 100) : 0
  };
}

/** Renders the side-by-side planned versus actual table for the selected workout day. */
function renderAthletePlanVsActual() {
  const container = document.getElementById('athlete-plan-vs-actual-body');
  if (!container) return;

  const workout = getSelectedPlannedWorkout();
  if (!workout || !Array.isArray(workout.prescribedSlots) || workout.prescribedSlots.length === 0) {
    const emptyHtml = '<p class="athlete-prep-empty">Planned and actual sets appear side by side once a session is scheduled.</p>';
    if (athletePrepState.lastCompareHtml !== emptyHtml) {
      container.innerHTML = emptyHtml;
      athletePrepState.lastCompareHtml = emptyHtml;
    }
    return;
  }

  const matchedSets = getAllRecordedSetsForComparison(workout);
  const engine = getPrepEngine();
  const comparison = (engine && typeof engine.comparePlanVsActual === 'function')
    ? engine.comparePlanVsActual(workout, matchedSets)
    : buildComparisonFallback(workout, matchedSets);

  const rows = Array.isArray(comparison && comparison.rows) ? comparison.rows : [];
  const totalPlanned = rows.reduce((acc, r) => acc + (Number(r.planned && r.planned.sets) || 0), 0);
  const totalActual = rows.reduce((acc, r) => acc + (Number(r.actual && r.actual.sets) || 0), 0);
  const adherencePct = Number(comparison && comparison.adherencePct) || 0;

  const rowsHtml = rows.map(r => {
    const p = r.planned || {};
    const a = r.actual || {};
    const statusMap = {
      hit: { cls: 'hit', label: 'HIT' },
      exceeded: { cls: 'over', label: 'EXCEEDED' },
      over: { cls: 'over', label: 'EXCEEDED' },
      under: { cls: 'short', label: 'IN PROGRESS' },
      short: { cls: 'short', label: 'IN PROGRESS' }
    };
    const st = statusMap[r.status] || { cls: 'pending', label: 'PLANNED' };
    const planLoad = Number(p.loadKg) > 0 ? `${Number(p.loadKg).toFixed(1)} kg` : '--';
    const planVel = Number(p.targetVelocity) > 0 ? `${Number(p.targetVelocity).toFixed(2)} m/s` : '--';
    const planRpe = Number(p.rpe) > 0 ? `RPE ${Number(p.rpe).toFixed(1)}` : '--';

    const actSets = Number(a.sets) || 0;
    const actLoad = actSets > 0 && Number(a.loadKg) > 0 ? `${Number(a.loadKg).toFixed(1)} kg` : '--';
    const actVel = actSets > 0 && Number(a.avgVelocity) > 0 ? `${Number(a.avgVelocity).toFixed(2)} m/s` : '--';
    const actRpe = actSets > 0 && Number(a.avgRpe) > 0 ? `RPE ${Number(a.avgRpe).toFixed(1)}` : '--';
    const isPr = Boolean(r.hasPr || a.hasPr || matchedSets.some(ms => {
      const mSlot = ms.plannedSlotId || ms.planned_slot_id;
      const hitSlot = mSlot ? (mSlot === r.slotId) : sameLift(ms.lift, r.baseLift);
      return hitSlot && Boolean(ms.isPR || ms.isPr || ms.prPushed || (Array.isArray(ms.reps) && ms.reps.some(rep => rep && rep.prPushed)));
    }));

    return `
      <div class="plan-actual-row" data-slot-id="${escapeHtml(r.slotId)}" data-status="${st.cls}" data-prep-tooltip-key="prep_plan_vs_actual_row">
        <div class="plan-actual-cell">
          <span class="pa-name">${escapeHtml(r.exerciseName)}</span>
          <span class="pa-status ${st.cls}" data-prep-tooltip-key="prep_adherence_status">${st.label}</span>
          ${isPr ? goldenPrBadgeHtml() : ''}
        </div>
        <div class="plan-actual-cell">
          <span class="pa-line strong">${Number(p.sets) || 0} sets • ${planLoad}</span>
          <span class="pa-line">${planRpe} • ${planVel}</span>
        </div>
        <div class="plan-actual-cell">
          <span class="pa-line ${actSets > 0 ? 'strong' : 'muted'}">${actSets} sets • ${actLoad}</span>
          <span class="pa-line ${actSets > 0 ? '' : 'muted'}">${actRpe} • ${actVel}</span>
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <div class="plan-actual-summary font-mono" data-prep-tooltip-key="prep_daily_adherence">
      <span>Adherence <strong>${adherencePct}%</strong></span>
      <span>Sets <strong>${totalActual}/${totalPlanned}</strong></span>
    </div>
    <div class="plan-actual-table">
      <div class="plan-actual-row plan-actual-head font-mono">
        <span>EXERCISE</span>
        <span>PLANNED</span>
        <span>ACTUAL</span>
      </div>
      ${rowsHtml}
    </div>
  `;

  if (athletePrepState.lastCompareHtml !== html) {
    container.innerHTML = html;
    athletePrepState.lastCompareHtml = html;
  }
}

/** Renders the athlete preparation hub header, weekly strip, notes, and prescribed slots. */
function renderAthletePrepHub() {
  const hub = document.getElementById('athlete-prep-hub');
  if (!hub) return;

  loadPrepStateFromStore();

  const plan = athletePrepState.plan;
  const selectedWorkout = getSelectedPlannedWorkout();
  const titleEl = document.getElementById('athlete-prep-plan-title');
  const phaseEl = document.getElementById('athlete-prep-phase-badge');
  const weekEl = document.getElementById('athlete-prep-week-pill');
  const meetEl = document.getElementById('athlete-meet-countdown-pill');
  const workoutNotesEl = document.getElementById('athlete-prep-workout-notes');
  const dietaryNotesEl = document.getElementById('athlete-prep-dietary-notes');
  const slotsListEl = document.getElementById('athlete-prep-slots-list');
  const feedbackInputEl = document.getElementById('athlete-prep-feedback-input');

  if (titleEl) {
    titleEl.textContent = plan ? plan.title : 'No active plan';
  }
  if (phaseEl) {
    const phaseLabel = (selectedWorkout && selectedWorkout.blockPhase)
      || (plan && plan.macroBlocks && plan.macroBlocks[0] && (plan.macroBlocks[0].phase || plan.macroBlocks[0].name))
      || '';
    phaseEl.textContent = phaseLabel ? `PHASE ${String(phaseLabel).toUpperCase()}` : 'PHASE —';
  }
  if (weekEl) {
    weekEl.textContent = selectedWorkout && selectedWorkout.weekIndex
      ? `WEEK ${selectedWorkout.weekIndex}${selectedWorkout.isDeload ? ' DELOAD' : ''}`
      : 'WEEK —';
  }
  if (meetEl) {
    const engine = getPrepEngine();
    if (plan && plan.targetMeetDate) {
      const countdown = (engine && typeof engine.computeMeetCountdown === 'function')
        ? engine.computeMeetCountdown(plan.targetMeetDate)
        : null;
      if (countdown && countdown.label) {
        meetEl.textContent = String(countdown.label).toUpperCase();
      } else {
        const diffDays = Math.ceil((new Date(plan.targetMeetDate).getTime() - Date.now()) / 86400000);
        meetEl.textContent = isFinite(diffDays) ? (diffDays >= 0 ? `${diffDays}D TO MEET` : 'MEET PASSED') : 'NO MEET DATE';
      }
    } else {
      meetEl.textContent = 'NO MEET DATE';
    }
  }

  // Render Monday-Sunday weekly schedule pills around selected date
  const todayIso = formatLocalIsoDate(new Date());
  const selectedIso = athletePrepState.selectedDate || todayIso;
  const mondayIso = getMondayDateStr(selectedIso);
  const dayButtons = document.querySelectorAll('#athlete-prep-week-strip .athlete-week-day-pill');
  dayButtons.forEach((btn, idx) => {
    const iso = addDaysIsoDate(mondayIso, idx);
    const dayNum = iso.slice(8, 10) || '—';
    const dateSpan = btn.querySelector('.athlete-week-day-date');
    if (dateSpan) dateSpan.textContent = dayNum;
    btn.setAttribute('data-date', iso);

    const dayWorkout = athletePrepState.workouts.find(w => w.scheduledDate === iso);
    const hasSlots = Boolean(dayWorkout && Array.isArray(dayWorkout.prescribedSlots) && dayWorkout.prescribedSlots.length > 0);
    const allComplete = Boolean(hasSlots && dayWorkout.prescribedSlots.every(sl => isSlotCompletedLocally(dayWorkout, sl)));
    const isSelected = iso === selectedIso;

    btn.classList.toggle('has-workout', hasSlots);
    btn.classList.toggle('is-today', iso === todayIso);
    btn.classList.toggle('is-complete', allComplete);
    btn.classList.toggle('active', isSelected);
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    btn.setAttribute('data-prep-tooltip-key', 'prep_week_day');
  });

  if (workoutNotesEl) {
    const wNote = (selectedWorkout && selectedWorkout.workoutNotes) || (plan && plan.coachNotes) || '';
    workoutNotesEl.textContent = wNote || 'No session notes for this day.';
    workoutNotesEl.classList.toggle('has-content', Boolean(wNote));
  }
  if (dietaryNotesEl) {
    const dNote = (selectedWorkout && selectedWorkout.dietaryNotes) || (plan && plan.dietaryStrategyNotes) || '';
    dietaryNotesEl.textContent = dNote || 'No dietary notes for this day.';
    dietaryNotesEl.classList.toggle('has-content', Boolean(dNote));
  }
  if (feedbackInputEl && document.activeElement !== feedbackInputEl) {
    feedbackInputEl.value = (selectedWorkout && selectedWorkout.athleteFeedbackNote) || '';
  }

  if (slotsListEl) {
    const slots = (selectedWorkout && Array.isArray(selectedWorkout.prescribedSlots))
      ? selectedWorkout.prescribedSlots
      : [];
    let slotsHtml = '';
    if (slots.length === 0) {
      slotsHtml = `
        <p class="athlete-prep-empty">No prescribed exercises for this day.</p>
        <button type="button" id="btn-start-planned-workout" class="btn-start-planned-workout" data-prep-tooltip-key="prep_start_planned_workout" disabled>START PLANNED WORKOUT</button>
      `;
    } else {
      const cardsHtml = slots.map(slot => {
        const liftKey = liftKeyOf(slot.baseLift);
        const top = slot.topSet;
        const back = slot.backoff;
        const isCurrent = Boolean(
          activePlannedWorkoutId === selectedWorkout.workoutId && activePlannedSlotId === slot.slotId
        );
        const isDone = isSlotCompletedLocally(selectedWorkout, slot);
        const statusCls = isDone ? 'is-done' : (isCurrent ? 'is-active' : '');
        const statusText = isDone ? 'DONE' : (isCurrent ? 'LOADED' : 'PLANNED');

        const topLoadStr = top.loadKg > 0 ? `${top.loadKg.toFixed(1)} kg` : 'AUTO';
        const topVelStr = top.targetVelocity > 0 ? `${top.targetVelocity.toFixed(2)} m/s` : '--';
        const topLossStr = `${Math.round(top.velocityLossCapPct || 20)}%`;

        let backoffHtml = '';
        if (back) {
          const backLoadStr = back.loadKg > 0 ? `${back.loadKg.toFixed(1)} kg` : `-${Math.round(back.dropPct)}%`;
          const backVelStr = back.targetVelocity > 0 ? `${back.targetVelocity.toFixed(2)} m/s` : '--';
          const backLossStr = `${Math.round(back.velocityLossCapPct || top.velocityLossCapPct || 20)}%`;
          backoffHtml = `
            <div class="athlete-slot-set" data-prep-tooltip-key="prep_set_y_backoff">
              <span class="athlete-slot-set-label font-mono">SET Y BACKOFF</span>
              <span class="athlete-slot-set-main">${back.sets} x ${back.reps} @ RPE ${back.rpe.toFixed(1)}</span>
              <div class="athlete-slot-kpis">
                <div class="athlete-slot-kpi" data-prep-tooltip-key="prep_prescribed_load"><span class="k">LOAD</span><span class="v font-mono">${backLoadStr}</span></div>
                <div class="athlete-slot-kpi" data-prep-tooltip-key="prep_target_velocity"><span class="k">TARGET VEL</span><span class="v font-mono">${backVelStr}</span></div>
                <div class="athlete-slot-kpi" data-prep-tooltip-key="prep_velocity_loss_cap"><span class="k">VEL LOSS</span><span class="v font-mono">${backLossStr}</span></div>
              </div>
            </div>
          `;
        }

        return `
          <article class="athlete-slot-card ${statusCls}" data-slot-id="${escapeHtml(slot.slotId)}" data-prep-tooltip-key="prep_slot_card">
            <div class="athlete-slot-head">
              <div class="athlete-slot-titles">
                <span class="lift-tag" data-lift="${escapeHtml(liftKey)}">${escapeHtml(slot.baseLift.toUpperCase())}</span>
                <span class="athlete-slot-name">${escapeHtml(slot.exerciseName)}</span>
              </div>
              <span class="athlete-slot-status font-mono" data-prep-tooltip-key="prep_slot_status">${statusText}</span>
            </div>
            <div class="athlete-slot-sets">
              <div class="athlete-slot-set" data-prep-tooltip-key="prep_set_x_top">
                <span class="athlete-slot-set-label font-mono">SET X TOP SET</span>
                <span class="athlete-slot-set-main">${top.sets} x ${top.reps} @ RPE ${top.rpe.toFixed(1)}</span>
                <div class="athlete-slot-kpis">
                  <div class="athlete-slot-kpi" data-prep-tooltip-key="prep_prescribed_load"><span class="k">LOAD</span><span class="v font-mono">${topLoadStr}</span></div>
                  <div class="athlete-slot-kpi" data-prep-tooltip-key="prep_target_velocity"><span class="k">TARGET VEL</span><span class="v font-mono">${topVelStr}</span></div>
                  <div class="athlete-slot-kpi" data-prep-tooltip-key="prep_velocity_loss_cap"><span class="k">VEL LOSS</span><span class="v font-mono">${topLossStr}</span></div>
                </div>
              </div>
              ${backoffHtml}
            </div>
            <button type="button" class="athlete-slot-load-btn" data-load-slot-id="${escapeHtml(slot.slotId)}" data-prep-tooltip-key="prep_load_into_live" aria-label="Load into Live">
              <svg class="eros-svg-icon eros-svg-icon--sm" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"></rect><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
              <span class="sr-only">LOAD INTO LIVE</span>
            </button>
          </article>
        `;
      }).join('');

      slotsHtml = `${cardsHtml}<button type="button" id="btn-start-planned-workout" class="btn-start-planned-workout" data-prep-tooltip-key="prep_start_planned_workout">START PLANNED WORKOUT</button>`;
    }

    if (athletePrepState.lastSlotsHtml !== slotsHtml) {
      slotsListEl.innerHTML = slotsHtml;
      athletePrepState.lastSlotsHtml = slotsHtml;
    }
  }

  renderAthletePlanVsActual();
}

function handleCoachPrepSync(eventType, payload) {
  const store = getPrepStore();
  if (store && typeof store.applyRemoteSync === 'function' && payload && typeof payload === 'object') {
    store.applyRemoteSync(eventType, payload);
  }
  if (payload && typeof payload === 'object') {
    if (eventType === 'prep:plan_sync') {
      const incomingPlan = payload.plan && typeof payload.plan === 'object' ? payload.plan : payload;
      athletePrepState.cache.plan = normalizePrepPlan(incomingPlan);
    } else if (eventType === 'prep:workout_updated') {
      const incomingWk = payload.workout && typeof payload.workout === 'object' ? payload.workout : payload;
      const normWk = normalizePlannedWorkout(incomingWk);
      if (normWk && normWk.workoutId) {
        athletePrepState.cache.workouts[normWk.workoutId] = normWk;
        if (normWk.scheduledDate && !athletePrepState.selectedByUser) {
          athletePrepState.selectedDate = normWk.scheduledDate;
        }
      }
    }
  }

  loadPrepStateFromStore();

  // Apply non-destructive target adjustments only to uncompleted active slots when not mid-set
  if (activePlannedWorkoutId && activePlannedSlotId && !activeSet) {
    const activeWk = athletePrepState.workouts.find(w => w.workoutId === activePlannedWorkoutId);
    const activeSlot = activeWk && activeWk.prescribedSlots.find(s => s.slotId === activePlannedSlotId);
    if (activeSlot && !isSlotCompletedLocally(activeWk, activeSlot)) {
      const nextLoad = Number(activeSlot.topSet.loadKg);
      if (isFinite(nextLoad) && nextLoad > 0) setWorkingWeight(nextLoad, true);
      const nextRpe = Number(activeSlot.topSet.rpe);
      if (isFinite(nextRpe) && nextRpe >= 5 && nextRpe <= 10) setTargetRpe(nextRpe, false);
    }
  }

  const syncBadge = document.getElementById('athlete-prep-sync-badge');
  if (syncBadge) {
    syncBadge.textContent = 'LIVE';
    syncBadge.classList.add('is-live');
  }
  showPrepNotice('COACH UPDATED PREPARATION');
  renderAthletePrepHub();
}

/** Initializes the athlete preparation hub and binds coach sync listeners. */
function initAthletePrepView() {
  const hub = document.getElementById('athlete-prep-hub');
  if (!hub) {
    loadPrepStateFromStore();
    return;
  }

  if (!athletePrepState.initialized) {
    athletePrepState.initialized = true;

    const weekStrip = document.getElementById('athlete-prep-week-strip');
    if (weekStrip && !weekStrip._prepBound) {
      weekStrip.addEventListener('click', (e) => {
        const pill = e.target && e.target.closest ? e.target.closest('.athlete-week-day-pill') : null;
        if (!pill) return;
        const iso = pill.getAttribute('data-date');
        if (iso) {
          athletePrepState.selectedDate = iso;
          athletePrepState.selectedByUser = true;
          renderAthletePrepHub();
        }
      });
      weekStrip._prepBound = true;
    }

    const slotsList = document.getElementById('athlete-prep-slots-list');
    if (slotsList && !slotsList._prepBound) {
      slotsList.addEventListener('click', (e) => {
        const slotBtn = e.target && e.target.closest ? e.target.closest('[data-load-slot-id]') : null;
        if (slotBtn) {
          const wk = getSelectedPlannedWorkout();
          const slotId = slotBtn.getAttribute('data-load-slot-id');
          const slot = wk && wk.prescribedSlots.find(s => s.slotId === slotId);
          if (wk && slot) launchPlannedSlot(wk, slot);
          return;
        }
        const startBtn = e.target && e.target.closest ? e.target.closest('#btn-start-planned-workout') : null;
        if (startBtn) {
          const wk = getSelectedPlannedWorkout();
          const firstSlot = wk && wk.prescribedSlots && wk.prescribedSlots[0];
          if (wk && firstSlot) launchPlannedSlot(wk, firstSlot);
        }
      });
      slotsList._prepBound = true;
    }

    const btnSendFeedback = document.getElementById('btn-send-prep-feedback');
    const feedbackInput = document.getElementById('athlete-prep-feedback-input');
    if (btnSendFeedback && feedbackInput && !btnSendFeedback._prepBound) {
      const submitFeedback = () => {
        const note = feedbackInput.value.trim();
        const wk = getSelectedPlannedWorkout();
        if (!note) return;
        const workoutId = (wk && wk.workoutId) || activePlannedWorkoutId || '';
        const store = getPrepStore();
        if (store && typeof store.saveAthleteSessionFeedback === 'function' && workoutId) {
          store.saveAthleteSessionFeedback(workoutId, note, { emit: false });
        }
        if (wk) wk.athleteFeedbackNote = note;
        if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
          window.ErosSyncBus.emit('prep:athlete_feedback', {
            athleteId: ATHLETE_PREP_ID,
            workoutId: workoutId,
            planId: (wk && wk.planId) || (athletePrepState.plan && athletePrepState.plan.planId) || '',
            note: note,
            timestamp: Date.now()
          });
        }
        const syncBadge = document.getElementById('athlete-prep-sync-badge');
        if (syncBadge) {
          syncBadge.textContent = 'SENT';
          syncBadge.classList.add('is-live');
          clearTimeout(athletePrepState.badgeTimer);
          athletePrepState.badgeTimer = setTimeout(() => {
            syncBadge.textContent = 'LIVE';
          }, 2200);
        }
        showPrepNotice('FEEDBACK SENT TO COACH', 2200);
      };
      btnSendFeedback.addEventListener('click', submitFeedback);
      feedbackInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitFeedback();
        }
      });
      btnSendFeedback._prepBound = true;
    }

    if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.on === 'function') {
      window.ErosSyncBus.on('prep:plan_sync', (payload) => handleCoachPrepSync('prep:plan_sync', payload));
      window.ErosSyncBus.on('prep:workout_updated', (payload) => handleCoachPrepSync('prep:workout_updated', payload));
      window.ErosSyncBus.on('session:state', (payload) => {
        const store = getPrepStore();
        if (store && typeof store.applyRemoteSync === 'function' && payload) {
          store.applyRemoteSync('session:state', payload);
          renderAthletePrepHub();
        }
      });
    }
  }

  renderAthletePrepHub();
}

function readBiometricsFallback() {
  try {
    const raw = localStorage.getItem(ATHLETE_BIO_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (_) {}
  return {};
}

function writeBiometricsFallback(bio) {
  try {
    localStorage.setItem(ATHLETE_BIO_FALLBACK_KEY, JSON.stringify(bio));
  } catch (_) {}
}

function getCurrentAthleteBiometrics() {
  const store = getPrepStore();
  let bio = {};
  if (store && typeof store.getAthleteBiometrics === 'function') {
    bio = store.getAthleteBiometrics(ATHLETE_PREP_ID) || {};
  } else {
    bio = readBiometricsFallback();
  }
  return {
    athleteId: ATHLETE_PREP_ID,
    age: bio.age != null ? bio.age : '',
    bodyweightKg: (typeof bio.bodyweightKg === 'number' && bio.bodyweightKg > 0) ? bio.bodyweightKg : prProfile.bodyweight,
    targetWeightClass: bio.targetWeightClass || bio.weightClass || '',
    trainingAgeYears: bio.trainingAgeYears != null ? bio.trainingAgeYears : '',
    experienceTier: bio.experienceTier || 'Novice',
    meetsCompleted: bio.meetsCompleted != null ? bio.meetsCompleted : '',
    federation: bio.federation || '',
    availableDays: Array.isArray(bio.availableDays) ? bio.availableDays : [],
    dutiesInjuryNotes: bio.dutiesInjuryNotes || '',
    gender: bio.gender || prProfile.gender || 'male'
  };
}

function populateAthleteBiometricsForm() {
  const bio = getCurrentAthleteBiometrics();
  const ageEl = document.getElementById('bio-age-input');
  const bwEl = document.getElementById('bio-bw-input');
  const classEl = document.getElementById('bio-weight-class-select');
  const trainAgeEl = document.getElementById('bio-training-age-input');
  const tierEl = document.getElementById('bio-exp-tier-select');
  const meetsEl = document.getElementById('bio-meets-count-input');
  const fedEl = document.getElementById('bio-federation-input');
  const notesEl = document.getElementById('bio-duties-notes-input');

  if (ageEl && document.activeElement !== ageEl) ageEl.value = bio.age !== '' && bio.age != null ? String(bio.age) : '';
  if (bwEl && document.activeElement !== bwEl) bwEl.value = bio.bodyweightKg ? String(bio.bodyweightKg) : '';
  if (classEl && document.activeElement !== classEl) classEl.value = bio.targetWeightClass || '';
  if (trainAgeEl && document.activeElement !== trainAgeEl) trainAgeEl.value = bio.trainingAgeYears !== '' && bio.trainingAgeYears != null ? String(bio.trainingAgeYears) : '';
  if (tierEl && document.activeElement !== tierEl) tierEl.value = bio.experienceTier || 'Novice';
  if (meetsEl && document.activeElement !== meetsEl) meetsEl.value = bio.meetsCompleted !== '' && bio.meetsCompleted != null ? String(bio.meetsCompleted) : '';
  if (fedEl && document.activeElement !== fedEl) fedEl.value = bio.federation || '';
  if (notesEl && document.activeElement !== notesEl) notesEl.value = bio.dutiesInjuryNotes || '';

  const activeSetDays = new Set(Array.isArray(bio.availableDays) ? bio.availableDays : []);
  document.querySelectorAll('#bio-available-days-group .bio-day-pill').forEach(btn => {
    const day = btn.getAttribute('data-day');
    const isActive = activeSetDays.has(day);
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function syncBiometricsFromDots(bwKg, gender) {
  const bwEl = document.getElementById('bio-bw-input');
  if (bwEl && typeof bwKg === 'number' && !isNaN(bwKg) && document.activeElement !== bwEl) {
    bwEl.value = bwKg > 0 ? String(bwKg) : '';
  }
  const existing = getCurrentAthleteBiometrics();
  const next = {
    ...existing,
    bodyweightKg: (typeof bwKg === 'number' && bwKg > 0) ? bwKg : existing.bodyweightKg,
    gender: gender === 'female' ? 'female' : 'male'
  };
  const store = getPrepStore();
  if (store && typeof store.saveAthleteBiometrics === 'function') {
    store.saveAthleteBiometrics(ATHLETE_PREP_ID, next, { emit: false });
  }
  writeBiometricsFallback(next);

  clearTimeout(athletePrepState.bioTimer);
  athletePrepState.bioTimer = setTimeout(() => {
    if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
      window.ErosSyncBus.emit('athlete:profile_updated', {
        ...next,
        timestamp: Date.now()
      });
    }
  }, 180);
}

/** Collects and saves the athlete biometrics dossier and broadcasts updates to the coach. */
function saveAthleteBiometricsFromUI() {
  const ageEl = document.getElementById('bio-age-input');
  const bwEl = document.getElementById('bio-bw-input');
  const classEl = document.getElementById('bio-weight-class-select');
  const trainAgeEl = document.getElementById('bio-training-age-input');
  const tierEl = document.getElementById('bio-exp-tier-select');
  const meetsEl = document.getElementById('bio-meets-count-input');
  const fedEl = document.getElementById('bio-federation-input');
  const notesEl = document.getElementById('bio-duties-notes-input');
  const statusEl = document.getElementById('bio-save-status');

  const availableDays = [];
  document.querySelectorAll('#bio-available-days-group .bio-day-pill.active').forEach(btn => {
    const d = btn.getAttribute('data-day');
    if (WEEKDAY_NAMES.includes(d)) availableDays.push(d);
  });

  const parsedAge = ageEl && ageEl.value !== '' ? Number(ageEl.value) : null;
  const parsedBw = bwEl && bwEl.value !== '' ? Number(bwEl.value) : prProfile.bodyweight;
  const parsedTrainAge = trainAgeEl && trainAgeEl.value !== '' ? Number(trainAgeEl.value) : null;
  const parsedMeets = meetsEl && meetsEl.value !== '' ? Number(meetsEl.value) : null;

  const payload = {
    athleteId: ATHLETE_PREP_ID,
    age: (parsedAge != null && isFinite(parsedAge)) ? Math.max(10, Math.min(100, Math.round(parsedAge))) : undefined,
    bodyweightKg: (isFinite(parsedBw) && parsedBw > 0) ? Math.max(20, Math.min(300, Number(parsedBw.toFixed(1)))) : prProfile.bodyweight,
    targetWeightClass: classEl ? String(classEl.value || '').trim() : '',
    trainingAgeYears: (parsedTrainAge != null && isFinite(parsedTrainAge)) ? Math.max(0, Math.min(60, Number(parsedTrainAge.toFixed(1)))) : undefined,
    experienceTier: tierEl ? String(tierEl.value || 'Novice').trim() : 'Novice',
    meetsCompleted: (parsedMeets != null && isFinite(parsedMeets)) ? Math.max(0, Math.min(500, Math.round(parsedMeets))) : undefined,
    federation: fedEl ? String(fedEl.value || '').trim() : '',
    availableDays: availableDays,
    dutiesInjuryNotes: notesEl ? String(notesEl.value || '').trim() : '',
    gender: prProfile.gender || 'male'
  };

  if (typeof payload.bodyweightKg === 'number' && payload.bodyweightKg > 0) {
    prProfile.bodyweight = payload.bodyweightKg;
    if (dotsBwInput && document.activeElement !== dotsBwInput) {
      dotsBwInput.value = String(payload.bodyweightKg);
    }
    persistPrProfile();
    updateDotsDisplay(false);
  }

  const store = getPrepStore();
  const saved = (store && typeof store.saveAthleteBiometrics === 'function')
    ? store.saveAthleteBiometrics(ATHLETE_PREP_ID, payload, { emit: false })
    : payload;
  writeBiometricsFallback(saved);

  if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
    window.ErosSyncBus.emit('athlete:profile_updated', {
      ...saved,
      timestamp: Date.now()
    });
  }

  if (statusEl) {
    statusEl.textContent = 'SAVED';
    clearTimeout(athletePrepState.bioStatusTimer);
    athletePrepState.bioStatusTimer = setTimeout(() => {
      statusEl.textContent = '';
    }, 2400);
  }

  return saved;
}

/** Updates the compact summary pill and collapsed/expanded state on #athlete-biometrics-card. */
function setAthleteBiometricsCollapsed(collapsed) {
  const card = document.getElementById('athlete-biometrics-card');
  const body = document.getElementById('athlete-bio-body');
  const toggleBtn = document.getElementById('btn-toggle-biometrics');
  const summaryPill = document.getElementById('athlete-bio-summary-pill');
  if (!card) return;

  card.classList.toggle('is-collapsed', Boolean(collapsed));
  if (body) body.style.display = collapsed ? 'none' : '';
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

  if (summaryPill) {
    const bio = getCurrentAthleteBiometrics();
    const bwVal = Number(bio.bodyweightKg);
    const daysCount = Array.isArray(bio.availableDays) ? bio.availableDays.length : 0;
    if (bwVal > 0 && daysCount > 0) {
      summaryPill.textContent = `${bwVal.toFixed(1)} kg • ${daysCount}d/wk`;
      summaryPill.style.display = collapsed ? 'inline-flex' : 'none';
    } else if (bwVal > 0) {
      summaryPill.textContent = `${bwVal.toFixed(1)} kg`;
      summaryPill.style.display = collapsed ? 'inline-flex' : 'none';
    } else {
      summaryPill.style.display = 'none';
    }
  }
}

/** Initializes the athlete biometrics dossier inputs, schedule toggles, and bodyweight sync. */
function initAthleteBiometricsDossier() {
  const card = document.getElementById('athlete-biometrics-card');
  if (!card) return;

  populateAthleteBiometricsForm();

  const initialBio = getCurrentAthleteBiometrics();
  const hasBwAndDays = Number(initialBio.bodyweightKg) > 0 && Array.isArray(initialBio.availableDays) && initialBio.availableDays.length > 0;
  setAthleteBiometricsCollapsed(hasBwAndDays);

  if (!card._bioBound) {
    card._bioBound = true;

    const toggleBtn = document.getElementById('btn-toggle-biometrics');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const nextCollapsed = !card.classList.contains('is-collapsed');
        setAthleteBiometricsCollapsed(nextCollapsed);
      });
    }

    const daysGroup = document.getElementById('bio-available-days-group');
    if (daysGroup) {
      daysGroup.addEventListener('click', (e) => {
        const pill = e.target && e.target.closest ? e.target.closest('.bio-day-pill') : null;
        if (!pill) return;
        const nextActive = !pill.classList.contains('active');
        pill.classList.toggle('active', nextActive);
        pill.setAttribute('aria-pressed', nextActive ? 'true' : 'false');
        saveAthleteBiometricsFromUI();
      });
    }

    const bwInput = document.getElementById('bio-bw-input');
    if (bwInput) {
      bwInput.addEventListener('input', () => {
        const val = parseFloat(bwInput.value);
        if (isFinite(val) && val > 0) {
          prProfile.bodyweight = val;
          if (dotsBwInput) dotsBwInput.value = String(val);
          persistPrProfile();
          updateDotsDisplay(false);
        }
      });
    }

    const saveBtn = document.getElementById('btn-save-biometrics');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveAthleteBiometricsFromUI();
      });
    }

    const autoSaveIds = [
      'bio-age-input',
      'bio-bw-input',
      'bio-weight-class-select',
      'bio-training-age-input',
      'bio-exp-tier-select',
      'bio-meets-count-input',
      'bio-federation-input',
      'bio-duties-notes-input'
    ];
    autoSaveIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => saveAthleteBiometricsFromUI());
      }
    });
  }
}

/** Evaluates whether a repetition or set qualifies as a personal record candidate. */
function evaluatePrCandidate(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const lift = canonicalLift(src.lift || currentLift);
  const liftKey = liftKeyOf(lift);
  if (liftKey !== 'squat' && liftKey !== 'bench' && liftKey !== 'deadlift') return null;

  const weight = Number(src.weight != null ? src.weight : currentWorkingWeight) || 0;
  const velocity = Number(src.velocity) || 0;
  const rpe = Number(src.rpe) || 0;
  if (weight <= 0 || velocity <= 0) return null;

  const currentPrWeight = Number(prProfile.currentPRs && prProfile.currentPRs[liftKey]) || 0;
  const prDetail = (prProfile.currentPRDetails && prProfile.currentPRDetails[liftKey]) || {};
  const currentPrVel = Number(prDetail.velocity) || 0;

  let prType = null;
  if (rpe >= 7.5 && weight > currentPrWeight) {
    prType = 'weight';
  } else if (currentPrWeight > 0 && weight >= currentPrWeight && velocity > currentPrVel + 0.03) {
    prType = 'velocity';
  }
  if (!prType) return null;

  const setId = String(src.setId || (activeSet && activeSet.setId) || '');
  const dedupeKey = `${setId}:${liftKey}:${weight.toFixed(1)}:${prType}`;
  if (prSuppressedKeys.has(dedupeKey) || prPromptedKeys.has(dedupeKey)) {
    return null;
  }

  return {
    key: dedupeKey,
    lift: lift,
    liftKey: liftKey,
    weight: Number(weight.toFixed(1)),
    velocity: Number(velocity.toFixed(2)),
    rpe: Number((rpe || 8.0).toFixed(1)),
    prType: prType,
    setId: setId,
    workoutId: src.workoutId || activePlannedWorkoutId || (activeWorkout && activeWorkout.id) || '',
    slotId: src.slotId || activePlannedSlotId || '',
    repNumber: src.repNumber || null,
    timestamp: src.timestamp || Date.now()
  };
}

function maybeEvaluateSetPrCandidate(setObj) {
  if (!setObj || !Array.isArray(setObj.reps) || setObj.reps.length === 0) return null;
  if (setObj.isPR || setObj.isPr || setObj.prPushed) return null;
  const bestVel = Math.max(...setObj.reps.map(r => Number(r.velocity) || 0));
  const maxRpe = Math.max(...setObj.reps.map(r => Number(r.rpe) || 0));
  const cand = evaluatePrCandidate({
    lift: setObj.lift,
    weight: setObj.weight,
    velocity: bestVel,
    rpe: maxRpe || setObj.avgRpe,
    setId: setObj.setId,
    workoutId: setObj.plannedWorkoutId || '',
    slotId: setObj.plannedSlotId || '',
    timestamp: setObj.endTime || Date.now()
  });
  if (cand) showPrConfirmHud(cand);
  return cand;
}

/** Displays the personal record confirmation overlay for a detected candidate. */
function showPrConfirmHud(candidate) {
  if (!candidate) return;
  pendingPrCandidate = candidate;
  if (candidate.key) prPromptedKeys.add(candidate.key);

  const hud = document.getElementById('pr-confirm-hud');
  const summaryEl = document.getElementById('pr-confirm-summary');
  const metricsEl = document.getElementById('pr-confirm-metrics');
  const typeLabel = candidate.prType === 'velocity' ? 'VELOCITY PR' : (candidate.prType === 'manual' ? 'PR CANDIDATE' : 'WEIGHT PR');

  if (summaryEl) {
    summaryEl.textContent = `${canonicalLift(candidate.lift).toUpperCase()} ${typeLabel}`;
  }
  if (metricsEl) {
    metricsEl.textContent = `${Number(candidate.weight).toFixed(1)} kg • ${Number(candidate.velocity).toFixed(2)} m/s • RPE ${Number(candidate.rpe).toFixed(1)}`;
  }
  if (hud) {
    hud.setAttribute('aria-hidden', 'false');
    clearTimeout(prHudTimer);
    prHudTimer = setTimeout(() => {
      if (hud.getAttribute('aria-hidden') === 'false') {
        dismissPrConfirmHud();
      }
    }, 18000);
  }
}

/** Dismisses the personal record confirmation overlay and remembers suppression for this candidate. */
function dismissPrConfirmHud() {
  if (pendingPrCandidate && pendingPrCandidate.key) {
    prSuppressedKeys.add(pendingPrCandidate.key);
  }
  pendingPrCandidate = null;
  clearTimeout(prHudTimer);
  const hud = document.getElementById('pr-confirm-hud');
  if (hud) {
    hud.setAttribute('aria-hidden', 'true');
  }
}

function findSetByIdAcrossWorkouts(setId) {
  if (!setId) return null;
  if (activeSet && activeSet.setId === setId) return activeSet;
  if (activeWorkout && Array.isArray(activeWorkout.sets)) {
    const found = activeWorkout.sets.find(s => s && s.setId === setId);
    if (found) return found;
  }
  for (let i = 0; i < workouts.length; i++) {
    const w = workouts[i];
    if (!w || !Array.isArray(w.sets)) continue;
    const found = w.sets.find(s => s && s.setId === setId);
    if (found) return found;
  }
  return null;
}

/** Promotes a confirmed personal record candidate, stamps golden badges, and notifies the coach. */
function confirmPushPr(explicitCandidate = null) {
  const cand = explicitCandidate || pendingPrCandidate;
  if (!cand) return null;

  const lift = canonicalLift(cand.lift || currentLift);
  const liftKey = liftKeyOf(lift);
  const weight = Number(cand.weight) || 0;
  const velocity = Number(cand.velocity) || 0;
  const rpe = Number(cand.rpe) || 8.0;
  const prType = String(cand.prType || 'weight');
  const timestamp = Number(cand.timestamp) || Date.now();

  if (prProfile.currentPRs && prProfile.currentPRs[liftKey] !== undefined) {
    if (weight > prProfile.currentPRs[liftKey] || prProfile.currentPRs[liftKey] <= 0) {
      prProfile.currentPRs[liftKey] = weight;
    }
    if (!prProfile.currentPRDetails) prProfile.currentPRDetails = {};
    prProfile.currentPRDetails[liftKey] = {
      weight: weight,
      velocity: Number(velocity.toFixed(2)),
      rpe: Number(rpe.toFixed(1)),
      timestamp: timestamp
    };
    persistPrProfile();
  }

  const targetSet = findSetByIdAcrossWorkouts(cand.setId);
  if (targetSet) {
    targetSet.isPR = true;
    targetSet.isPr = true;
    targetSet.prPushed = true;
    targetSet.prType = prType;
    if (Array.isArray(targetSet.reps) && targetSet.reps.length > 0) {
      let matchedRep = null;
      if (cand.repNumber != null) {
        matchedRep = targetSet.reps.find(r => r && r.repNumber === cand.repNumber);
      }
      if (!matchedRep) {
        matchedRep = targetSet.reps.reduce((best, r) => {
          if (!best) return r;
          return (Number(r && r.velocity) || 0) >= (Number(best.velocity) || 0) ? r : best;
        }, null);
      }
      if (matchedRep) {
        matchedRep.isPR = true;
        matchedRep.isPr = true;
        matchedRep.prPushed = true;
      }
    }
    persistStorage();
  }

  const prPayload = {
    athleteId: ATHLETE_PREP_ID,
    lift: lift,
    weight: weight,
    weightKg: weight,
    velocity: Number(velocity.toFixed(2)),
    rpe: Number(rpe.toFixed(1)),
    prType: prType,
    setId: String(cand.setId || ''),
    workoutId: String(cand.workoutId || (targetSet && targetSet.plannedWorkoutId) || ''),
    slotId: String(cand.slotId || (targetSet && targetSet.plannedSlotId) || ''),
    plannedWorkoutId: String(cand.workoutId || (targetSet && targetSet.plannedWorkoutId) || ''),
    plannedSlotId: String(cand.slotId || (targetSet && targetSet.plannedSlotId) || ''),
    isPr: true,
    timestamp: timestamp
  };

  const store = getPrepStore();
  if (store && typeof store.recordPushedPr === 'function') {
    store.recordPushedPr(prPayload, { emit: false });
  }

  if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
    window.ErosSyncBus.emit('workout:pr_pushed', prPayload);
  }

  if (typeof SoundFX !== 'undefined' && typeof SoundFX.playPrFanfare === 'function') {
    SoundFX.playPrFanfare();
  }
  if (typeof HapticsFX !== 'undefined' && typeof HapticsFX.vibrate === 'function') {
    HapticsFX.vibrate([40, 30, 60]);
  }

  pendingPrCandidate = null;
  clearTimeout(prHudTimer);
  const hud = document.getElementById('pr-confirm-hud');
  if (hud) hud.setAttribute('aria-hidden', 'true');

  updatePrDashboardUI(true);
  updateDotsDisplay(false);
  updateWorkoutPage();
  renderHistoryView();
  renderAthletePrepHub();
  renderAthletePlanVsActual();

  return prPayload;
}

function pushSetAsManualPr(setId) {
  const s = findSetByIdAcrossWorkouts(setId);
  if (!s) return null;
  const bestVel = (Array.isArray(s.reps) && s.reps.length > 0)
    ? Math.max(...s.reps.map(r => Number(r.velocity) || 0))
    : (Number(s.maxVelocity) || Number(s.avgVelocity) || 0);
  const rpe = Number(s.avgRpe) || (Array.isArray(s.reps) && s.reps[s.reps.length - 1] && Number(s.reps[s.reps.length - 1].rpe)) || 8.5;
  return confirmPushPr({
    lift: canonicalLift(s.lift || currentLift),
    weight: Number(s.weight) || currentWorkingWeight || 0,
    velocity: bestVel,
    rpe: rpe,
    prType: 'manual',
    setId: s.setId,
    workoutId: s.plannedWorkoutId || activePlannedWorkoutId || '',
    slotId: s.plannedSlotId || activePlannedSlotId || '',
    timestamp: Date.now()
  });
}

function initPrConfirmHudListeners() {
  const btnPush = document.getElementById('btn-confirm-push-pr');
  const btnDismiss = document.getElementById('btn-dismiss-push-pr');
  if (btnPush && !btnPush._prBound) {
    btnPush.addEventListener('click', () => confirmPushPr());
    btnPush._prBound = true;
  }
  if (btnDismiss && !btnDismiss._prBound) {
    btnDismiss.addEventListener('click', () => dismissPrConfirmHud());
    btnDismiss._prBound = true;
  }
}

// ── Preparation Clean-Slate Hover Tooltip Dictionary & Engine ──
const PREP_TOOLTIP_DICTIONARY = {
  prep_plan_title: {
    title: 'Plan Title',
    category: 'Plan Meta',
    description: 'Names the active training macrocycle created by the coach and mirrors it live to the athlete Preparation hub.',
    tip: 'Use a clear block goal and meet name so both coach and athlete know which cycle is active.'
  },
  prep_sync_badge: {
    title: 'Live Sync Status',
    category: 'Live Bridge',
    description: 'Shows whether the current plan and feedback are stored locally on this device or actively streaming with the coach.',
    tip: 'If it stays on Local, confirm your pairing code in Profile Settings before starting the session.'
  },
  prep_phase_badge: {
    title: 'Training Phase',
    category: 'Periodization',
    description: 'Identifies the physiological focus for the selected day, such as Hypertrophy, Strength, Peaking, Taper, or Deload.',
    tip: 'Shift from Hypertrophy toward Peaking as meet day approaches to prioritize bar speed and specificity.'
  },
  prep_week_pill: {
    title: 'Microcycle Week',
    category: 'Schedule',
    description: 'Displays the current week number within the 0 to 12 month plan and flags whether the week is scheduled as a deload.',
    tip: 'Check for a Deload flag before pushing top-set intensity so planned recovery stays intact.'
  },
  prep_meet_countdown: {
    title: 'Meet Countdown',
    category: 'Plan Meta',
    description: 'Calculates remaining days and weeks until the target competition date so peaking and taper timing stay aligned.',
    tip: 'Start tapering heavy axial fatigue 10 to 14 days out when the countdown drops below two weeks.'
  },
  prep_week_day: {
    title: 'Weekly Day Selector',
    category: 'Schedule',
    description: 'Switches the view across Monday through Sunday of the active week, highlighting days with prescribed work or completion.',
    tip: 'Compare adjacent training days to ensure heavy Squat and Deadlift sessions have enough recovery spacing.'
  },
  prep_session_notes: {
    title: 'Session Technical Notes',
    category: 'Notes',
    description: 'Carries technical cues, tempo reminders, and execution intent authored by the coach for the selected day.',
    tip: 'Keep cues short and focused on one movement checkpoint per lift so the athlete executes cleanly under load.'
  },
  prep_dietary_notes: {
    title: 'Dietary & Hydration Strategy',
    category: 'Notes',
    description: 'Shares daily fueling, pre-session carbohydrate timing, and hydration targets matched to session demand and weight class.',
    tip: 'Increase carbohydrate and electrolyte guidance on high-volume Squat or Deadlift days.'
  },
  prep_slot_card: {
    title: 'Prescribed Exercise Slot',
    category: 'Prescription',
    description: 'Groups a planned movement with its Set X top-set prescription, Set Y backoff volume, and live completion status.',
    tip: 'Complete primary competition movements before moving to accessories while velocity output is highest.'
  },
  prep_slot_status: {
    title: 'Slot Completion Status',
    category: 'Execution',
    description: 'Tracks whether a prescribed slot is Planned, currently Loaded into the Live tracker, or Done for the day.',
    tip: 'Load each slot directly from Prep so completed sets automatically link to the Planned vs Actual matrix.'
  },
  prep_set_x_top: {
    title: 'Set X (Top Set)',
    category: 'Prescription',
    description: 'Defines the primary heavy work sets, reps, target RPE, and expected bar speed used to gauge daily readiness.',
    tip: 'Use the first top set velocity to decide whether to hold, add 2.5 kg, or trim load for the backoff work.'
  },
  prep_set_y_backoff: {
    title: 'Set Y (Backoff Volume)',
    category: 'Prescription',
    description: 'Prescribes fatigue-managed volume sets scaled down from the top set by percentage drop and target RPE.',
    tip: 'Keep backoff drop percentages around 8 to 12% in Strength blocks to build quality volume without grinding.'
  },
  prep_prescribed_load: {
    title: 'Prescribed Load (kg)',
    category: 'VBT Target',
    description: 'Shows the target barbell weight in kilograms derived from the athlete 1RM anchor or manually entered by the coach.',
    tip: 'Leave the load blank in the builder to auto-calculate weight from 1RM and target RPE, or type an exact kg load.'
  },
  prep_target_velocity: {
    title: 'Target Mean Velocity (m/s)',
    category: 'VBT Target',
    description: 'States the expected mean concentric velocity in meters per second matching the prescribed load and RPE zone.',
    tip: 'Adjust working weight if warmups move 0.05 m/s slower than expected so daily fatigue never turns into form breakdown.'
  },
  prep_velocity_loss_cap: {
    title: 'Velocity Loss Ceiling (%)',
    category: 'VBT Target',
    description: 'Sets the maximum speed drop-off allowed across reps in a set before stopping to protect power output and recovery.',
    tip: 'Cap velocity loss at 10 to 15% for peaking speed work and 20% for hypertrophy accumulation.'
  },
  prep_load_into_live: {
    title: 'Load Into Live',
    category: 'Live Bridge',
    description: 'Pushes this slot lift, target working weight, and target RPE straight into the Live Tracker and marks the slot loaded.',
    tip: 'Tap Load Into Live right before starting warmups so every working set maps cleanly back to the plan.'
  },
  prep_start_planned_workout: {
    title: 'Start Planned Workout',
    category: 'Live Bridge',
    description: 'Starts an active workout session if none is running and loads the first prescribed slot of the day into Live.',
    tip: 'Use this button at the start of training to keep session duration, rest timers, and adherence tracking unified.'
  },
  prep_plan_vs_actual: {
    title: 'Planned vs Actual Matrix',
    category: 'Execution',
    description: 'Compares prescribed sets, loads, RPE, and velocity against real logged sets side by side for both athlete and coach.',
    tip: 'Review load and velocity deltas after each session before raising next week prescriptions.'
  },
  prep_daily_adherence: {
    title: 'Daily Adherence Summary',
    category: 'Execution',
    description: 'Summarizes the percentage of prescribed exercise slots completed and total actual versus planned sets for the day.',
    tip: 'Aim for 90% or higher adherence across key main-lift weeks before progressing intensity.'
  },
  prep_plan_vs_actual_row: {
    title: 'Exercise Execution Row',
    category: 'Execution',
    description: 'Details planned versus completed sets, load, RPE, and mean velocity for an individual exercise slot.',
    tip: 'If actual RPE runs higher than planned at faster or matching loads, check rest intervals and technique.'
  },
  prep_adherence_status: {
    title: 'Execution Status Badge',
    category: 'Execution',
    description: 'Flags whether an exercise hit the prescription (Hit), exceeded target volume or load (Exceeded), or is still In Progress.',
    tip: 'Watch for repeated Exceeded badges on peaking days so enthusiasm does not steal recovery from meet week.'
  },
  prep_athlete_feedback: {
    title: 'Session Feedback Input',
    category: 'Coaching',
    description: 'Lets the athlete record short post-session notes on soreness, sleep, bar feel, or pain for the selected training day.',
    tip: 'Log one honest sentence right after your last set while bar feel and fatigue signals are fresh.'
  },
  prep_send_feedback: {
    title: 'Send Feedback to Coach',
    category: 'Coaching',
    description: 'Saves the feedback note to the session and broadcasts it immediately to the coach Planned vs Actual panel.',
    tip: 'Mention joint tightness or sleep drops early so the coach can adjust tomorrow load before warmups.'
  },
  workout_summary: {
    title: 'Live Workout Summary',
    category: 'Live Telemetry',
    description: 'Aggregates total completed sets, total reps, mean velocity, and peak velocity across the currently active workout.',
    tip: 'Watch average velocity across the whole session to spot cumulative fatigue before starting accessory work.'
  },
  current_set_metrics: {
    title: 'Active Set Telemetry',
    category: 'Live Telemetry',
    description: 'Displays real-time Eros tracking metrics for the current set including working weight, average speed, velocity loss, and RPE.',
    tip: 'Check velocity loss and average RPE right after racking the bar to confirm whether to add a rep or rest.'
  },
  workout_set_load: {
    title: 'Working Weight Control',
    category: 'Live Telemetry',
    description: 'Adjusts the barbell load in 2.5 kg steps or direct entry for the active or upcoming set and keeps Live in sync.',
    tip: 'Update the weight before starting the set so e1RM, volume, and Planned vs Actual deltas stay exact.'
  },
  workout_avg_velocity_ring: {
    title: 'Average Velocity Ring',
    category: 'Live Telemetry',
    description: 'Visualizes mean concentric bar velocity of the current set relative to strength-speed and maximal effort zones.',
    tip: 'Keep early warmup reps snappy above 0.70 m/s to prime neural drive without burning energy.'
  },
  workout_peak_velocity: {
    title: 'Peak Set Velocity',
    category: 'Live Telemetry',
    description: 'Captures the fastest instantaneous concentric bar speed achieved during the active set in meters per second.',
    tip: 'Accelerate smoothly off the chest or floor and drive explosively through the sticking point.'
  },
  workout_velocity_loss: {
    title: 'Set Velocity Loss (%)',
    category: 'Live Telemetry',
    description: 'Measures the percentage speed drop from the fastest rep to the slowest rep in the current set.',
    tip: 'End the set once velocity loss reaches your planned ceiling to maximize strength gain per unit of fatigue.'
  },
  workout_avg_rpe: {
    title: 'Average Set RPE',
    category: 'Live Telemetry',
    description: 'Estimates Rating of Perceived Exertion from bar velocity against lift-specific Minimum Velocity Threshold baselines.',
    tip: 'Compare estimated RPE against how the set felt; consistent mismatches signal a need to refresh 1RM anchors.'
  },
  workout_min_velocity: {
    title: 'Minimum Set Velocity',
    category: 'Live Telemetry',
    description: 'Reports the slowest rep mean velocity in the set, usually the final rep that reflects peak momentary fatigue.',
    tip: 'If minimum velocity drops near MVT earlier than planned, increase rest before the next set.'
  },
  active_set_reps: {
    title: 'Current Set Rep Stream',
    category: 'Live Telemetry',
    description: 'Lists each recorded repetition in the active set with velocity, RPE, and horizontal bar deviation in centimeters.',
    tip: 'Scan rep-to-rep deviation to catch forward drift or uneven hip shift as fatigue rises.'
  },
  workout_sets_history: {
    title: 'Session Sets Log',
    category: 'Live Telemetry',
    description: 'Shows every completed set in the current workout with lift tag, load, velocity averages, rest duration, and Push PR actions.',
    tip: 'Verify rest intervals between heavy sets stayed consistent before evaluating speed drop-off.'
  },
  prep_push_pr: {
    title: 'Push Personal Record',
    category: 'PR Tracking',
    description: 'Confirms a new weight or velocity personal record, updates athlete 1RM benchmarks, and stamps golden PR badges across views.',
    tip: 'Push verified top-set PRs right after the set so both DOTS calculations and coach prescriptions update automatically.'
  },
  prep_golden_pr: {
    title: 'Golden PR Badge',
    category: 'PR Tracking',
    description: 'Marks sets, workouts, and Planned vs Actual rows that produced a verified athlete-pushed personal record.',
    tip: 'Use golden PR dates on the timeline to identify which loading wave produced peak performance.'
  },
  coach_prep_factoring_strip: {
    title: 'Biometric & Duty Factoring Strip',
    category: 'Factoring',
    description: 'Combines athlete age, bodyweight, target weight class, training age, available days, and life-duty notes into planning alerts.',
    tip: 'Check factoring alerts before building a new block so weekly frequency matches real schedule constraints.'
  },
  coach_prep_athlete_select: {
    title: 'Target Athlete Selector',
    category: 'Factoring',
    description: 'Selects which connected athlete plan, biometric profile, and execution history are loaded into the Preparation workbench.',
    tip: 'Confirm the active athlete name before applying templates or publishing updates.'
  },
  coach_prep_factoring_badges: {
    title: 'Athlete Factor Badges',
    category: 'Factoring',
    description: 'Displays key profile inputs synced from the athlete dossier including bodyweight, target class, tier, meets, and training days.',
    tip: 'Watch bodyweight versus target class badges to time nutrition and taper weeks safely.'
  },
  coach_prep_factoring_alerts: {
    title: 'Readiness & Schedule Alerts',
    category: 'Factoring',
    description: 'Highlights actionable warnings such as weight-class gaps, injury constraints, limited weekly availability, or novice pacing.',
    tip: 'Address warning-level alerts in the Session Notes or reduce weekly backoff sets before publishing.'
  },
  coach_prep_plan_card: {
    title: 'Macro Plan Configuration',
    category: 'Plan Meta',
    description: 'Controls plan title, 0 to 12 month horizon, start and meet dates, Squat/Bench/Deadlift 1RM anchors, and live publishing.',
    tip: 'Set accurate 1RM anchors first so every prescribed load and target velocity auto-calculates cleanly.'
  },
  coach_prep_horizon: {
    title: 'Plan Horizon (0-12 Months)',
    category: 'Plan Meta',
    description: 'Sets the macrocycle length from a single current-week sprint (0 months) up to a full 12-month annual progression.',
    tip: 'Use 3 to 4 months for a focused meet build or 0 to 1 month for short reassessment blocks.'
  },
  coach_prep_start_date: {
    title: 'Plan Start Date',
    category: 'Plan Meta',
    description: 'Anchors Week 1 Day 1 on the calendar so every macro week and daily session maps to exact dates.',
    tip: 'Start blocks on a Monday to keep ISO week adherence and weekend recovery slots aligned.'
  },
  coach_prep_meet_date: {
    title: 'Target Meet Date',
    category: 'Plan Meta',
    description: 'Sets the competition date used to compute the live meet countdown and peak/taper timing.',
    tip: 'Leave empty for off-season general strength blocks, or lock the meet Saturday as soon as registration opens.'
  },
  coach_prep_1rm_anchors: {
    title: 'Lift 1RM Anchors',
    category: 'VBT Target',
    description: 'Stores Squat, Bench, and Deadlift reference maximums used to compute prescribed loads and RPE-matched velocities.',
    tip: 'Update 1RM anchors conservatively after a pushed PR or mid-block test rather than jumping more than 5% at once.'
  },
  coach_prep_publish: {
    title: 'Publish Plan',
    category: 'Live Bridge',
    description: 'Saves the macro plan header and broadcasts the full plan and upcoming sessions live to the athlete Preparation hub.',
    tip: 'Hit Publish Plan after any major calendar, 1RM, or template change so the athlete device stays synchronized.'
  },
  coach_prep_macro_card: {
    title: 'Macro Timeline & Block Tools',
    category: 'Periodization',
    description: 'Navigates every week across the horizon and provides one-click templates, deload generation, and week cloning.',
    tip: 'Build Week 1 carefully, then clone and progress load or RPE week by week to save programming time.'
  },
  coach_prep_template_select: {
    title: 'Periodization Template Selector',
    category: 'Periodization',
    description: 'Chooses a structured multi-week progression model (hypertrophy, strength, peaking, or conjugate) to populate the plan.',
    tip: 'Match the template to training age and available days before fine-tuning individual exercises.'
  },
  coach_prep_apply_template: {
    title: 'Apply Block Template',
    category: 'Periodization',
    description: 'Generates scheduled workouts across the selected plan horizon using the chosen template and current 1RM anchors.',
    tip: 'Apply the template first, then customize individual exercise variations and notes per training day.'
  },
  coach_prep_deload_week: {
    title: 'Deload Week Generator',
    category: 'Periodization',
    description: 'Converts all sessions in the currently selected week into reduced-volume, reduced-RPE recovery sessions.',
    tip: 'Place a deload week every 3 to 5 hard weeks or whenever velocity loss and readiness alerts accumulate.'
  },
  coach_prep_clone_week: {
    title: 'Clone Week Forward',
    category: 'Periodization',
    description: 'Copies every prescribed session, exercise slot, and note from the active week into the following week.',
    tip: 'Clone a solid baseline week forward and bump Set X RPE by 0.5 or add 2.5 kg to keep progression simple.'
  },
  coach_prep_weeks_track: {
    title: 'Macro Week Track',
    category: 'Periodization',
    description: 'Displays clickable week tiles across the 0 to 12 month timeline showing block phase tags, deload status, and planned days.',
    tip: 'Scan the track from left to right to confirm phases step smoothly from Accumulation to Peaking without abrupt jumps.'
  },
  coach_prep_session_card: {
    title: 'Daily Session Builder',
    category: 'Prescription',
    description: 'Authors the selected day title, phase, exercise slots, Set X/Y targets, and technical/dietary notes.',
    tip: 'Keep daily main-lift slots to 1 to 3 focused movements so session quality stays high.'
  },
  coach_prep_session_title: {
    title: 'Daily Session Title',
    category: 'Prescription',
    description: 'Names the workout day (such as Heavy Squat & Bench) shown on both coach timeline and athlete Prep hub.',
    tip: 'Include the main emphasis in the title so the athlete knows the session priority at a glance.'
  },
  coach_prep_deload_day: {
    title: 'Deload Day Flag',
    category: 'Periodization',
    description: 'Marks the individual training day as a light recovery or technique session inside the athlete week badge.',
    tip: 'Toggle Deload Day on mid-week recovery days when full-week deloads are unnecessary.'
  },
  coach_prep_exercise_search: {
    title: 'Exercise Catalog Search',
    category: 'Exercise Builder',
    description: 'Filters the 88-movement powerlifting and accessory catalog in real time by name, lift family, or variation keyword.',
    tip: 'Search by constraint like pause, tempo, or deficit to target specific sticking points quickly.'
  },
  coach_prep_exercise_select: {
    title: 'Exercise Catalog Selector',
    category: 'Exercise Builder',
    description: 'Chooses the movement whose base lift kinematics and MVT profile drive velocity and load auto-calculation.',
    tip: 'Pick the closest competition variation so Set X and Set Y velocity targets match real bar speeds.'
  },
  coach_prep_custom_exercise: {
    title: 'Custom Exercise Builder',
    category: 'Exercise Builder',
    description: 'Registers a custom movement name mapped to Squat, Bench, Deadlift, or accessory velocity models.',
    tip: 'Map specialty bar movements to their closest main lift so Eros target velocities still guide effort accurately.'
  },
  coach_prep_set_volume_rpe: {
    title: 'Sets, Reps & RPE Inputs',
    category: 'Prescription',
    description: 'Sets the prescribed set count, rep target, and RPE intensity for Set X top sets or Set Y backoff sets.',
    tip: 'Keep top-set RPE between 7.5 and 8.5 during regular strength weeks to leave room for steady progression.'
  },
  coach_prep_backoff_drop: {
    title: 'Backoff Load Drop (%)',
    category: 'Prescription',
    description: 'Specifies the percentage reduction from the top-set load used to compute Set Y backoff working weight.',
    tip: 'Use 8 to 10% drop for strength triples/fives and 12 to 15% when aiming for crisp hypertrophy bar speed.'
  },
  coach_prep_add_exercise: {
    title: 'Add Exercise to Session',
    category: 'Prescription',
    description: 'Compiles Set X and Set Y targets with computed bar velocity and appends the slot into the day draft table.',
    tip: 'Check the Target Velocity preview before adding so intensity and rep counts match the block goal.'
  },
  coach_prep_slots_table: {
    title: 'Prescribed Session Draft Table',
    category: 'Prescription',
    description: 'Lists every exercise slot queued for the selected day with Set X, Set Y, load, velocity targets, and remove controls.',
    tip: 'Order competition lifts at the top of the table so fatigue from accessories never slows primary lifts.'
  },
  coach_prep_save_session: {
    title: 'Save & Sync Session',
    category: 'Live Bridge',
    description: 'Persists the current day exercises and notes and pushes a live update to the athlete Prep hub.',
    tip: 'Save Session after adding or removing exercises so any active athlete view updates immediately.'
  },
  coach_prep_athlete_feedback_view: {
    title: 'Athlete Feedback Note',
    category: 'Coaching',
    description: 'Displays the most recent feedback note sent by the athlete for the selected training day.',
    tip: 'Check this line before adjusting next-day load or rest targets.'
  },
  header_status_badge: {
    title: 'Eros Connection Status',
    category: 'Connection',
    description: 'Shows whether Eros is paired and ready to stream bar velocity, or waiting to connect.',
    tip: 'Tap the badge before starting your first warmup set to pair your Eros unit.'
  },
  header_rest_ticker: {
    title: 'Inter-Set Rest Timer',
    category: 'Rest Tracking',
    description: 'Counts elapsed rest time between completed sets so recovery intervals stay consistent across the session.',
    tip: 'Use 3 to 5 minutes between heavy top sets and 90 to 120 seconds on backoff work.'
  },
  header_mode_toggle: {
    title: 'Athlete & Coach Mode Switch',
    category: 'Navigation',
    description: 'Switches between the Athlete Live Cockpit and the Coach Supervision Portal.',
    tip: 'Use Coach Mode to review squad telemetry, adjust loads, or build training blocks.'
  },
  header_workout_master: {
    title: 'Session Start & End',
    category: 'Session',
    description: 'Starts or concludes the active training session and saves all logged sets to Workout History.',
    tip: 'Start the workout before your first working set so session duration and DOTS totals stay accurate.'
  },
  live_prescription_strip: {
    title: 'Active Planned Slot',
    category: 'Live Bridge',
    description: 'Shows the currently loaded exercise slot, set progress, prescribed load, and target RPE right above your controls.',
    tip: 'Tap Next Slot after finishing all prescribed sets to advance straight to the next movement.'
  },
  live_lift_select: {
    title: 'Movement Selector',
    category: 'Live Setup',
    description: 'Selects Squat, Bench Press, or Deadlift to apply the matching velocity baseline and RPE curve.',
    tip: 'Switch lifts before starting a set so estimated RPE and PR thresholds match the movement.'
  },
  live_weight_control: {
    title: 'Working Weight Stepper',
    category: 'Live Setup',
    description: 'Adjusts the barbell load in 2.5 kg increments or direct entry for the upcoming set.',
    tip: 'Keep working weight updated before each set so volume and e1RM calculations stay exact.'
  },
  live_set_toggle: {
    title: 'Set Start & Stop',
    category: 'Live Execution',
    description: 'Begins tracking repetitions for the current set or ends the set to compute summary metrics and start rest.',
    tip: 'Start the set right before unracking so every repetition is captured cleanly.'
  },
  live_complete_set: {
    title: 'Complete Active Set',
    category: 'Live Execution',
    description: 'Finalizes the active set, logs all recorded repetitions, and starts the inter-set rest stopwatch.',
    tip: 'Tap Done as soon as the barbell is racked to lock in accurate rest timing.'
  },
  live_target_rpe: {
    title: 'Target RPE Zone',
    category: 'Autoregulation',
    description: 'Sets the intended Rating of Perceived Exertion ceiling for the active set and updates the stage gauge.',
    tip: 'Match your target RPE to the day prescription so bar speed guides when to rack the bar.'
  },
  live_barpath_mode: {
    title: 'Stage Display Mode',
    category: 'Bar Path',
    description: 'Toggles the live stage between 2D movement trajectory path and vertical velocity profile.',
    tip: 'Use Path mode to inspect horizontal bar drift and Velocity mode to compare rep speed.'
  },
  live_barpath_variant: {
    title: 'Visual Trace Style',
    category: 'Bar Path',
    description: 'Opens visual trace style options for rendering repetition paths and ghost consistency lines.',
    tip: 'Pick a high-contrast trace style when training under bright gym lighting.'
  },
  live_programmed_workout: {
    title: 'Programmed Session Loader',
    category: 'Live Bridge',
    description: 'Opens today prescribed exercise slots from your coach plan for one-tap loading into the Live tracker.',
    tip: 'Load a programmed slot before starting warmups so weights, target RPE, and rest intervals stay aligned.'
  },
  live_velocity_graph: {
    title: 'Live Velocity Change Graph',
    category: 'Live Telemetry',
    description: 'Plots rep-by-rep peak and mean bar velocity across the active set. Tap any repetition dot to inspect its bar path replay.',
    tip: 'Watch the gap between peak and mean speed or tap slower late reps to check bar drift.'
  },
  live_set_summary: {
    title: 'Post-Set Summary Banner',
    category: 'Live Telemetry',
    description: 'Summarizes completed set reps, working weight, mean velocity, and elapsed rest right after racking.',
    tip: 'Review mean velocity before choosing whether to add 2.5 kg or hold load.'
  },
  summary_weight_trim: {
    title: 'Quick Load Trim (2.5 kg)',
    category: 'Live Streamlining',
    description: 'Adds or subtracts 2.5 kg from the next set working weight directly from the post-set summary banner.',
    tip: 'Trim 2.5 kg if bar speed dropped faster than your target RPE zone.'
  },
  summary_next_set: {
    title: 'Quick Start Next Set',
    category: 'Live Streamlining',
    description: 'Starts the next set immediately using your updated working weight and active lift.',
    tip: 'Tap Next once your rest target is reached to jump straight into the next set.'
  },
  history_athlete_settings: {
    title: 'Coach Pairing & Settings',
    category: 'Connection',
    description: 'Opens athlete profile settings to enter a coach pairing code and manage live session streaming.',
    tip: 'Confirm your pairing code is active before starting a coached session.'
  },
  history_biometrics_card: {
    title: 'Athlete Biometrics Dossier',
    category: 'Profile',
    description: 'Stores bodyweight, weight class, training age, and weekly availability used for DOTS and coaching alerts.',
    tip: 'Keep bodyweight and available training days current so block prescriptions fit your schedule.'
  },
  history_toggle_biometrics: {
    title: 'Collapse or Expand Dossier',
    category: 'Profile',
    description: 'Toggles the athlete biometrics form between full edit view and a compact summary pill.',
    tip: 'Keep the dossier collapsed during training blocks and expand only when updating measurements.'
  },
  history_save_biometrics: {
    title: 'Save Biometrics Dossier',
    category: 'Profile',
    description: 'Saves updated athlete profile details and syncs them to the coach Preparation factoring strip.',
    tip: 'Save after changing available days so your coach sees updated schedule constraints.'
  },
  history_export_json: {
    title: 'Export History JSON',
    category: 'Data Export',
    description: 'Downloads your complete workout and repetition history as a structured JSON archive.',
    tip: 'Export a backup periodically before clearing local browser storage.'
  },
  history_export_csv: {
    title: 'Export History CSV',
    category: 'Data Export',
    description: 'Downloads set and repetition telemetry in CSV spreadsheet format for external analysis.',
    tip: 'Open the CSV in a spreadsheet to chart long-term velocity trends at fixed loads.'
  },
  history_clear: {
    title: 'Clear Workout History',
    category: 'Data Management',
    description: 'Removes saved local workout sessions after confirmation to reset history storage.',
    tip: 'Export a JSON or CSV backup before clearing past sessions.'
  },
  coach_sidebar_toggle: {
    title: 'Toggle Coach Sidebar',
    category: 'Navigation',
    description: 'Collapses or expands the coach navigation rail between compact icon-only mode and full labels.',
    tip: 'Press [ on your keyboard anytime to toggle the sidebar rail.'
  },
  coach_sidebar_ticker: {
    title: 'Active Athlete Rest Ticker',
    category: 'Live Monitoring',
    description: 'Displays the focused athlete live inter-set rest clock directly inside the coach sidebar.',
    tip: 'Watch the ticker approach target rest to cue your athlete right before their next set.'
  },
  coach_cloud_sync: {
    title: 'Cloud Session Sync',
    category: 'Live Bridge',
    description: 'Opens the pairing and cloud room connection panel to link remote athlete devices.',
    tip: 'Share the room pairing code with athletes so live sets stream into your squad roster.'
  },
  coach_nav_live: {
    title: 'Coach Live Monitor',
    category: 'Navigation',
    description: 'Opens the live athlete bar path stage, rep stream, and tactical coaching console.',
    tip: 'Use Live Monitor during heavy top sets to send immediate cues or load adjustments.'
  },
  coach_nav_history: {
    title: 'Athlete History & Analytics',
    category: 'Navigation',
    description: 'Reviews completed sessions, calendar adherence, and set-by-set replay for the focused athlete.',
    tip: 'Compare bar path replays across weeks to spot technical consistency under fatigue.'
  },
  coach_nav_preparation: {
    title: 'Block Preparation Workbench',
    category: 'Navigation',
    description: 'Builds multi-week periodized training blocks, exercise slots, and target velocities.',
    tip: 'Publish changes after editing the week so the athlete Preparation hub updates live.'
  },
  coach_nav_roster: {
    title: 'Squad Roster Overview',
    category: 'Navigation',
    description: 'Displays all connected athletes, active lifts, rest clocks, and readiness status cards.',
    tip: 'Click any athlete card to focus their live telemetry and coaching console.'
  },
  coach_nav_prescriptions: {
    title: 'Tactical Prescription Console',
    category: 'Navigation',
    description: 'Jumps to the load override, target RPE, rest timer, and cue dispatch controls.',
    tip: 'Push prescribed Set X or Set Y targets directly to the athlete rest modal.'
  },
  coach_nav_sync: {
    title: 'Live Sync Status',
    category: 'Navigation',
    description: 'Checks connection health and pairing status for the active coaching room.',
    tip: 'Verify sync is active before remote sessions begin.'
  },
  coach_nav_bonds: {
    title: 'Athlete Roster Bonds',
    category: 'Navigation',
    description: 'Manages incoming athlete pairing requests, active bonds, and roster access.',
    tip: 'Approve pending athlete requests here to unlock live streaming.'
  },
  coach_roster_filters: {
    title: 'Roster Lift & Status Filters',
    category: 'Squad View',
    description: 'Filters the squad overview by Squat, Bench, Deadlift, or active lifting state.',
    tip: 'Filter to Active sets during busy team sessions to keep attention on lifters under the bar.'
  },
  coach_barpath_mode: {
    title: 'Coach Stage View Mode',
    category: 'Bar Path',
    description: 'Switches the focused athlete stage between 2D movement path and velocity trace.',
    tip: 'Toggle to Path mode to inspect horizontal bar drift during replays.'
  },
  coach_barpath_replay: {
    title: 'Coach Stage Replay',
    category: 'Bar Path',
    description: 'Replays the selected set bar path and repetition cadence on the Coach Live Monitor stage.',
    tip: 'Step through completed sets to review bar drift and sticking-point speed with your athlete.'
  },
  coach_prep_bump_week: {
    title: 'Progressive Week Bump',
    category: 'Periodization',
    description: 'Steps all non-deload prescriptions in the selected week forward by a chosen load or RPE increment.',
    tip: 'Review the updated Set Y backoff weights and hit Publish Plan when ready.'
  },
  coach_prescribed_bridge: {
    title: 'Prescribed Set X / Set Y Bridge',
    category: 'Live Bridge',
    description: 'One-click push for today planned Set X top set or Set Y backoff load and target RPE to the athlete.',
    tip: 'Push Set Y right after the top set finishes so the athlete receives the exact backoff target.'
  },
  coach_rpe_target_pin: {
    title: 'Pinned Target RPE',
    category: 'Autoregulation',
    description: 'Pins the coach-prescribed target RPE zone on the athlete stage for the upcoming set.',
    tip: 'Use the pinned target RPE to verify whether bar speed matches daily readiness.'
  },
  coach_squad_card: {
    title: 'Connected Athlete Card',
    category: 'Squad View',
    description: 'Shows live lift, working load, velocity, RPE, and rest status for a connected athlete.',
    tip: 'Select Focus to load this athlete full stage and coaching controls.'
  },
  coach_rep_pill: {
    title: 'Repetition Telemetry Pill',
    category: 'Live Telemetry',
    description: 'Summarizes a single recorded repetition with mean velocity, RPE, and bar deviation.',
    tip: 'Compare velocity drop from Rep 1 to the final rep to verify effort.'
  },
  coach_calendar_day: {
    title: 'Training Calendar Day',
    category: 'History',
    description: 'Indicates logged training sessions and personal records on that calendar date.',
    tip: 'Click any highlighted day to inspect its completed sets and replays.'
  },
  coach_replay_set: {
    title: 'Replay Set Trajectory',
    category: 'Bar Path',
    description: 'Animates the recorded bar path and repetition cadence for the selected completed set.',
    tip: 'Use replay to review sticking-point deceleration with your athlete between sets.'
  },
  coach_focus_athlete: {
    title: 'Focus Athlete',
    category: 'Squad View',
    description: 'Pins this athlete to the main Coach Live Monitor and Prescription Console.',
    tip: 'Switch focus anytime without interrupting background telemetry from other racks.'
  },
  coach_fab_trigger: {
    title: 'Quick Action Wheel',
    category: 'Navigation',
    description: 'Opens radial shortcuts for common coaching actions and view switches.',
    tip: 'Use the wheel for fast one-handed navigation.'
  },
  radial_fab: {
    title: 'Quick Action Wheel',
    category: 'Navigation',
    description: 'Opens radial shortcuts for common coaching actions and view switches.',
    tip: 'Use the wheel for fast one-handed navigation.'
  },
  coach_barpath_rep_pill: {
    title: 'Repetition Trajectory Pill',
    category: 'Bar Path',
    description: 'Selects an individual repetition from the completed set to inspect its bar path and velocity trace.',
    tip: 'Compare Rep 1 against the final rep to spot fatigue-related bar drift.'
  },
  coach_cal_day: {
    title: 'Calendar Training Day',
    category: 'History',
    description: 'Highlights dates with logged training sessions or verified personal records.',
    tip: 'Click any highlighted day to load its completed sets and replays.'
  },
  coach_cmd_push_prescribed: {
    title: 'Push Prescribed Load & RPE',
    category: 'Live Bridge',
    description: 'Sends the selected Set X or Set Y load and target RPE directly to the athlete rest modal.',
    tip: 'Push backoff targets immediately after the top set concludes.'
  },
  coach_load_pills: {
    title: 'Quick Load Adjustment Chips',
    category: 'Coaching',
    description: 'Applies a 2.5 kg or 5.0 kg load increment or decrement to the athlete upcoming set.',
    tip: 'Use small 2.5 kg nudges when bar speed drifts slightly above or below target.'
  },
  coach_prep_week_bump: {
    title: 'Progressive Week Bump',
    category: 'Periodization',
    description: 'Steps all non-deload prescriptions in the selected week forward by a chosen load or RPE increment.',
    tip: 'Review the updated Set Y backoff weights and hit Publish Plan when ready.'
  },
  coach_rep_stream_pill: {
    title: 'Live Rep Stream Pill',
    category: 'Live Telemetry',
    description: 'Shows repetition number, mean velocity, RPE, and bar deviation in real time.',
    tip: 'Watch velocity drop across reps to time your rack cue.'
  },
  coach_send_custom: {
    title: 'Send Custom Tactical Cue',
    category: 'Coaching',
    description: 'Dispatches a custom text cue straight to the athlete floating HUD during or between sets.',
    tip: 'Keep live cues under five words so the athlete can process them between reps.'
  },
  modal_athlete_settings_connect: {
    title: 'Connect to Coach',
    category: 'Connection',
    description: 'Links this athlete device to a coach session using the shared pairing code.',
    tip: 'Confirm your name and rack label before connecting.'
  },
  modal_ble_connect: {
    title: 'Pair Eros Device',
    category: 'Connection',
    description: 'Scans for and pairs your nearby Eros unit for live bar velocity tracking.',
    tip: 'Keep Eros awake and nearby before tapping Connect.'
  },
  modal_directive_accept: {
    title: 'Accept Coach Directive',
    category: 'Coaching',
    description: 'Commits the coach prescribed working weight and target RPE for the upcoming set.',
    tip: 'Accept before unracking so your next set logs against the updated target.'
  },
  modal_directive_decline: {
    title: 'Decline Coach Directive',
    category: 'Coaching',
    description: 'Keeps your current working weight and notifies the coach that the override was declined.',
    tip: 'Decline if bar feel or joint readiness calls for holding your current load.'
  },
  nav_prep: {
    title: 'Preparation Hub',
    category: 'Navigation',
    description: 'Opens your coach-prescribed training plan, Set X/Y targets, and Planned vs Actual comparison.',
    tip: 'Load planned slots from here before starting warmups.'
  },
  nav_live: {
    title: 'Live Tracker',
    category: 'Navigation',
    description: 'Opens the real-time bar speed, RPE, and trajectory stage.',
    tip: 'Keep Live open during working sets for instant velocity feedback.'
  },
  nav_set: {
    title: 'Preparation & Active Set',
    category: 'Navigation',
    description: 'Opens your coach-prescribed training plan, Set X/Y targets, and active set breakdown.',
    tip: 'Load planned slots from here before starting warmups.'
  },
  nav_history: {
    title: 'Workout History',
    category: 'Navigation',
    description: 'Reviews past training sessions, DOTS score, PRs, and athlete biometrics.',
    tip: 'Check long-term PRs and export backups from History.'
  },
  nav_coach: {
    title: 'Coach Portal',
    category: 'Navigation',
    description: 'Switches to the multi-athlete Coach Supervision Cockpit.',
    tip: 'Monitor squad velocity and push prescriptions from Coach Mode.'
  },
  pr_confirm_hud: {
    title: 'PR Confirmation Prompt',
    category: 'PR Tracking',
    description: 'Prompts to verify a detected weight or velocity personal record before updating 1RM benchmarks.',
    tip: 'Confirm only clean, full-ROM repetitions so future prescriptions stay accurate.'
  },
  coach_bond_modal: {
    title: 'Roster Bonds Manager',
    category: 'Coaching',
    description: 'Reviews pending athlete link requests and manages connected athlete bonds.',
    tip: 'Revoke old test bonds to keep your active squad roster clean.'
  }
};

const PREP_TOOLTIP_SELECTOR_MAP = [
  ['.coach-golden-pr-badge', 'prep_golden_pr'],
  ['.golden-pr-badge', 'prep_golden_pr'],
  ['.push-pr-mini-btn', 'prep_push_pr'],
  ['.coach-prep-slot-remove', 'coach_prep_slots_table'],
  ['.coach-prep-week-cell', 'coach_prep_weeks_track'],
  ['.coach-prep-day-tab', 'prep_week_day'],
  ['.coach-prep-factor-badge', 'coach_prep_factoring_badges'],
  ['.coach-prep-alert', 'coach_prep_factoring_alerts'],
  ['.coach-prep-compare-table', 'prep_plan_vs_actual'],
  ['.athlete-week-day-pill', 'prep_week_day'],
  ['.athlete-slot-load-btn', 'prep_load_into_live'],
  ['.athlete-slot-card', 'prep_slot_card'],
  ['.plan-actual-summary', 'prep_daily_adherence'],
  ['.plan-actual-row', 'prep_plan_vs_actual_row'],
  ['.pa-status', 'prep_adherence_status']
];

const TOOLTIP_HOVER_DELAY_MS = 1500;

const prepTooltipRuntime = {
  openTimer: null,
  activeTrigger: null,
  pendingTrigger: null,
  globalBound: false,
  dragActive: false,
  lastTouchTs: 0,
  lastInputWasKeyboard: false
};

function isTooltipSuppressed() {
  if (prepTooltipRuntime.dragActive) return true;
  if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
    if (document.querySelector('.is-dragging, .coach-pill-dragging, .coach-pill-drag-over, .custom-select-wrapper.open')) {
      return true;
    }
    const bleSheet = document.getElementById('bluetooth-search-tab');
    if (bleSheet && bleSheet.classList && (bleSheet.classList.contains('dragging') || bleSheet.classList.contains('is-dragging'))) {
      return true;
    }
  }
  return false;
}

function isCollapsedCoachSidebarTarget(el) {
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('#coach-sidebar.coach-sidebar--collapsed'));
}

function matchesPrepTooltipSelector(node, selector) {
  if (!node || !selector) return false;
  if (typeof node.matches === 'function') {
    try { return node.matches(selector); } catch (_) { return false; }
  }
  if (selector.startsWith('.') && node.classList && typeof node.classList.contains === 'function') {
    return node.classList.contains(selector.slice(1));
  }
  return false;
}

function resolvePrepTooltipTarget(rawNode, rootPanel) {
  let cur = rawNode;
  if (cur && cur.nodeType === 3) cur = cur.parentElement;
  while (cur) {
    const key = typeof cur.getAttribute === 'function' ? cur.getAttribute('data-prep-tooltip-key') : null;
    if (key && Object.prototype.hasOwnProperty.call(PREP_TOOLTIP_DICTIONARY, key)) {
      return { el: cur, key: key };
    }
    for (let i = 0; i < PREP_TOOLTIP_SELECTOR_MAP.length; i++) {
      const pair = PREP_TOOLTIP_SELECTOR_MAP[i];
      if (matchesPrepTooltipSelector(cur, pair[0]) && Object.prototype.hasOwnProperty.call(PREP_TOOLTIP_DICTIONARY, pair[1])) {
        return { el: cur, key: pair[1] };
      }
    }
    if (cur === rootPanel) break;
    cur = cur.parentElement || null;
  }
  return null;
}

function positionPrepTooltipCard(card, targetEl, preferredPlacement) {
  if (!card || !targetEl || typeof targetEl.getBoundingClientRect !== 'function') return;
  const margin = 8;
  const gap = 10;
  const vw = (typeof window !== 'undefined' && Number(window.innerWidth) > 0) ? Number(window.innerWidth) : 1024;
  const vh = (typeof window !== 'undefined' && Number(window.innerHeight) > 0) ? Number(window.innerHeight) : 768;

  if (card.style) {
    card.style.maxWidth = `${Math.min(310, Math.max(200, vw - margin * 2))}px`;
  }

  const tRect = targetEl.getBoundingClientRect();
  const cRect = typeof card.getBoundingClientRect === 'function'
    ? card.getBoundingClientRect()
    : { width: 290, height: 120 };
  const cardW = cRect.width > 0 ? cRect.width : (card.offsetWidth || 290);
  const cardH = cRect.height > 0 ? cRect.height : (card.offsetHeight || 120);

  let placement = 'top';
  let left = 0;
  let top = 0;

  if (preferredPlacement === 'right') {
    placement = 'right';
    let rawLeft = tRect.right + gap;
    if (rawLeft + cardW > vw - margin && tRect.left - cardW - gap >= margin) {
      rawLeft = tRect.left - cardW - gap;
      placement = 'left';
    }
    const maxLeft = Math.max(margin, vw - margin - cardW);
    left = Math.max(margin, Math.min(rawLeft, maxLeft));

    const rawTop = tRect.top + (tRect.height - cardH) / 2;
    const maxTop = Math.max(margin, vh - margin - cardH);
    top = Math.max(margin, Math.min(rawTop, maxTop));
  } else {
    const rawLeft = tRect.left + (tRect.width - cardW) / 2;
    const maxLeft = Math.max(margin, vw - margin - cardW);
    left = Math.max(margin, Math.min(rawLeft, maxLeft));

    const aboveTop = tRect.top - cardH - gap;
    const belowTop = tRect.bottom + gap;
    let candidateTop = aboveTop;
    if (aboveTop < margin) {
      if (belowTop + cardH <= vh - margin) {
        placement = 'bottom';
        candidateTop = belowTop;
      } else {
        const spaceAbove = Math.max(0, tRect.top - margin);
        const spaceBelow = Math.max(0, vh - margin - tRect.bottom);
        if (spaceBelow > spaceAbove) {
          placement = 'bottom';
          candidateTop = belowTop;
        }
      }
    }
    const maxTop = Math.max(margin, vh - margin - cardH);
    top = Math.max(margin, Math.min(candidateTop, maxTop));
  }

  card.setAttribute('data-placement', placement);
  if (card.style) {
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }
}

function hidePrepTooltipCard() {
  clearTimeout(prepTooltipRuntime.openTimer);
  prepTooltipRuntime.openTimer = null;
  prepTooltipRuntime.pendingTrigger = null;
  prepTooltipRuntime.activeTrigger = null;
  const card = document.getElementById('eros-prep-tooltip-card');
  if (!card) return;
  card.setAttribute('aria-hidden', 'true');
  if (card.classList && typeof card.classList.remove === 'function') {
    card.classList.remove('visible');
  }
}

function showPrepTooltipForTarget(targetEl, key, preferredPlacement) {
  const entry = PREP_TOOLTIP_DICTIONARY[key];
  const card = document.getElementById('eros-prep-tooltip-card');
  if (!entry || !card || !targetEl || isTooltipSuppressed()) return;

  prepTooltipRuntime.activeTrigger = targetEl;
  prepTooltipRuntime.pendingTrigger = null;

  card.innerHTML =
    `<div class="eros-tooltip-head">` +
      `<span class="eros-tooltip-slash" aria-hidden="true"></span>` +
      `<span class="eros-tooltip-title">${escapeHtml(entry.title)}</span>` +
      `<span class="eros-tooltip-cat">${escapeHtml(entry.category)}</span>` +
    `</div>` +
    `<p class="eros-tooltip-desc">${escapeHtml(entry.description)}</p>` +
    `<div class="eros-tooltip-tip">` +
      `<span class="eros-tooltip-tip-label">Coach Tip</span>` +
      `<span class="eros-tooltip-tip-text">${escapeHtml(entry.tip)}</span>` +
    `</div>`;

  card.setAttribute('aria-hidden', 'false');
  if (card.classList && typeof card.classList.add === 'function') {
    card.classList.add('visible');
  }
  const placement = preferredPlacement || (isCollapsedCoachSidebarTarget(targetEl) ? 'right' : undefined);
  positionPrepTooltipCard(card, targetEl, placement);
}

/** Initializes idempotent document-level hover and keyboard-focus tooltips across the entire app (Desktop Hover & Focus Only). */
function initPrepHoverTooltips() {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return false;
  const card = document.getElementById('eros-prep-tooltip-card');
  if (!card) return false;

  if (!prepTooltipRuntime.globalBound && typeof document.addEventListener === 'function') {
    prepTooltipRuntime.globalBound = true;
    const rootEl = document.body || document.documentElement;
    const isInsideTooltipCard = (node) => Boolean(node && typeof node.closest === 'function' && node.closest('#eros-prep-tooltip-card'));

    // Record touch timestamps to suppress synthetic iOS Safari mouseover events for 800ms post-touch
    document.addEventListener('touchstart', () => {
      prepTooltipRuntime.lastTouchTs = Date.now();
    }, true);

    // Immediate hide on press/drag start and mark pointer input so mouse clicks do not trigger keyboard focus tooltips
    document.addEventListener('pointerdown', (e) => {
      prepTooltipRuntime.lastInputWasKeyboard = false;
      if (e && e.pointerType === 'touch') {
        prepTooltipRuntime.lastTouchTs = Date.now();
      }
      hidePrepTooltipCard();
    }, true);
    document.addEventListener('mousedown', () => {
      prepTooltipRuntime.lastInputWasKeyboard = false;
      hidePrepTooltipCard();
    }, true);
    document.addEventListener('dragstart', () => {
      prepTooltipRuntime.dragActive = true;
      hidePrepTooltipCard();
    }, true);
    document.addEventListener('dragend', () => { prepTooltipRuntime.dragActive = false; }, true);
    document.addEventListener('drop', () => { prepTooltipRuntime.dragActive = false; }, true);
    document.addEventListener('pointercancel', () => { prepTooltipRuntime.dragActive = false; }, true);

    document.addEventListener('mouseover', (e) => {
      if (Date.now() - prepTooltipRuntime.lastTouchTs < 800) return;
      if (isInsideTooltipCard(e && e.target)) return;
      if (isTooltipSuppressed()) {
        hidePrepTooltipCard();
        return;
      }
      const resolved = resolvePrepTooltipTarget(e && e.target, rootEl);
      if (!resolved) {
        clearTimeout(prepTooltipRuntime.openTimer);
        prepTooltipRuntime.openTimer = null;
        prepTooltipRuntime.pendingTrigger = null;
        return;
      }
      if (resolved.el === prepTooltipRuntime.activeTrigger && card.getAttribute('aria-hidden') === 'false') {
        return;
      }
      if (resolved.el === prepTooltipRuntime.pendingTrigger) {
        return;
      }
      clearTimeout(prepTooltipRuntime.openTimer);
      prepTooltipRuntime.pendingTrigger = resolved.el;
      const collapsedSidebar = isCollapsedCoachSidebarTarget(resolved.el);
      const delay = TOOLTIP_HOVER_DELAY_MS;
      const placement = collapsedSidebar ? 'right' : undefined;
      prepTooltipRuntime.openTimer = setTimeout(() => {
        prepTooltipRuntime.openTimer = null;
        if (isTooltipSuppressed()) return;
        showPrepTooltipForTarget(resolved.el, resolved.key, placement);
      }, delay);
    });

    document.addEventListener('mouseout', (e) => {
      if (isInsideTooltipCard(e && e.target)) return;
      const next = resolvePrepTooltipTarget(e && e.relatedTarget, rootEl);
      if (next && (next.el === prepTooltipRuntime.activeTrigger || next.el === prepTooltipRuntime.pendingTrigger)) {
        return;
      }
      hidePrepTooltipCard();
    });

    document.addEventListener('focusin', (e) => {
      if (!prepTooltipRuntime.lastInputWasKeyboard) return;
      if (isInsideTooltipCard(e && e.target)) return;
      if (isTooltipSuppressed()) return;
      const resolved = resolvePrepTooltipTarget(e && e.target, rootEl);
      if (!resolved) return;
      clearTimeout(prepTooltipRuntime.openTimer);
      prepTooltipRuntime.openTimer = null;
      const placement = isCollapsedCoachSidebarTarget(resolved.el) ? 'right' : undefined;
      showPrepTooltipForTarget(resolved.el, resolved.key, placement);
    });

    document.addEventListener('focusout', (e) => {
      if (isInsideTooltipCard(e && e.target)) return;
      const next = resolvePrepTooltipTarget(e && e.relatedTarget, rootEl);
      if (next && next.el === prepTooltipRuntime.activeTrigger) return;
      hidePrepTooltipCard();
    });

    document.addEventListener('click', () => {
      if (prepTooltipRuntime.activeTrigger || prepTooltipRuntime.pendingTrigger) hidePrepTooltipCard();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e && (e.key === 'Tab' || (typeof e.key === 'string' && e.key.startsWith('Arrow')))) {
        prepTooltipRuntime.lastInputWasKeyboard = true;
      }
      if (e && e.key === 'Escape') hidePrepTooltipCard();
    }, true);

    document.addEventListener('scroll', () => {
      if (prepTooltipRuntime.activeTrigger || prepTooltipRuntime.pendingTrigger) hidePrepTooltipCard();
    }, true);

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('blur', () => {
        prepTooltipRuntime.dragActive = false;
        hidePrepTooltipCard();
      });
      window.addEventListener('resize', () => {
        if (prepTooltipRuntime.activeTrigger && card.getAttribute('aria-hidden') === 'false') {
          const resolved = resolvePrepTooltipTarget(prepTooltipRuntime.activeTrigger, document.body || prepTooltipRuntime.activeTrigger);
          if (resolved) {
            const placement = isCollapsedCoachSidebarTarget(resolved.el) ? 'right' : undefined;
            positionPrepTooltipCard(card, resolved.el, placement);
          }
        }
      });
    }
  }

  return true;
}

if (typeof window !== 'undefined') {
  window.PREP_TOOLTIP_DICTIONARY = PREP_TOOLTIP_DICTIONARY;
  window.initPrepHoverTooltips = initPrepHoverTooltips;
  window.setWorkingWeight = setWorkingWeight;
  window.setTargetRpe = setTargetRpe;
  window.applyCoachPrescribedSlot = applyCoachPrescribedSlot;
  window.renderLivePrescriptionStrip = renderLivePrescriptionStrip;
  window.bindSummaryBannerQuickActions = bindSummaryBannerQuickActions;
  window.initAthleteSettings = initAthleteSettings;
  window.initAthletePrepView = initAthletePrepView;
  window.renderAthletePrepHub = renderAthletePrepHub;
  window.renderAthletePlanVsActual = renderAthletePlanVsActual;
  window.initAthleteBiometricsDossier = initAthleteBiometricsDossier;
  window.saveAthleteBiometricsFromUI = saveAthleteBiometricsFromUI;
  window.evaluatePrCandidate = evaluatePrCandidate;
  window.showPrConfirmHud = showPrConfirmHud;
  window.confirmPushPr = confirmPushPr;
  window.dismissPrConfirmHud = dismissPrConfirmHud;
  window.updateDotsDisplay = updateDotsDisplay;
  window.updatePrDashboardUI = updatePrDashboardUI;
  window.updateWorkoutPage = updateWorkoutPage;
  window.renderHistoryView = renderHistoryView;
  window.synthesizeRepTrajectory = synthesizeRepTrajectory;
  window.renderBarPathStage = renderBarPathStage;
  window.renderVelocityChangeGraph = renderVelocityChangeGraph;
  window.triggerVelocityGraphTween = triggerVelocityGraphTween;
  window.openRepReplayModal = openRepReplayModal;
  window.closeRepReplayModal = closeRepReplayModal;
  window.getExertionRgb = getExertionRgb;
  window.toggleBarPathMode = toggleBarPathMode;
  window.startReplay = startReplay;
  window.stopReplay = stopReplay;
  window.animateRepetitionStroke = animateRepetitionStroke;
  window.setAnimationVariant = setAnimationVariant;
  window.getActiveAnimationVariant = getActiveAnimationVariant;
  window.openVariantSheet = openVariantSheet;
  window.closeVariantSheet = closeVariantSheet;
  window.toggleVariantSheet = toggleVariantSheet;
  window.activeAnimationVariant = activeAnimationVariant;
  initBarPathControls();
}

// ── Programmed Workout Drawer Controller (Phase 6) ──
function closeProgrammedDrawer() {
  const drawer = liveProgrammedDrawer || document.getElementById('live-programmed-drawer');
  const btn = btnProgrammedWorkout || document.getElementById('btn-programmed-workout');
  if (drawer) {
    drawer.style.display = 'none';
    if (typeof drawer.setAttribute === 'function') drawer.setAttribute('aria-hidden', 'true');
  }
  if (btn && typeof btn.setAttribute === 'function') {
    btn.setAttribute('aria-expanded', 'false');
  }
}

function renderProgrammedDrawerList() {
  const listEl = liveProgrammedDrawerList || document.getElementById('live-programmed-drawer-list');
  if (!listEl) return;

  loadPrepStateFromStore();
  const todayIso = formatLocalIsoDate(new Date());
  const todayWk = athletePrepState.workouts.find(w => w.scheduledDate === todayIso) || null;
  const fallbackWk = todayWk || getSelectedPlannedWorkout();
  const slots = (fallbackWk && Array.isArray(fallbackWk.prescribedSlots)) ? fallbackWk.prescribedSlots : [];

  if (!fallbackWk || slots.length === 0) {
    listEl.innerHTML = '<p class="live-programmed-empty">No prescribed slots scheduled for today.</p>';
    return;
  }

  const headerSub = todayWk
    ? escapeHtml(todayWk.sessionTitle || 'Today')
    : `${escapeHtml(fallbackWk.sessionTitle || 'Planned')} (${escapeHtml(fallbackWk.scheduledDate || '')})`;

  const rowsHtml = slots.map(slot => {
    const top = slot.topSet || {};
    const loadText = Number(top.loadKg) > 0 ? `${Number(top.loadKg).toFixed(1)} kg` : 'Auto';
    const rpeText = Number(top.rpe) > 0 ? `@${Number(top.rpe).toFixed(1)}` : '';
    const isDone = isSlotCompletedLocally(fallbackWk, slot);
    const isActive = activePlannedWorkoutId === fallbackWk.workoutId && activePlannedSlotId === slot.slotId;
    const statusLabel = isDone ? 'Done' : (isActive ? 'Loaded' : 'Planned');

    return `
      <div class="live-programmed-slot-row ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}">
        <div class="live-programmed-slot-info">
          <div class="live-programmed-slot-name">${escapeHtml(slot.exerciseName || slot.baseLift || 'Movement')}</div>
          <div class="live-programmed-slot-meta font-mono">${escapeHtml(String(top.sets || 1))}x${escapeHtml(String(top.reps || 3))} • ${escapeHtml(loadText)} ${escapeHtml(rpeText)} • ${escapeHtml(statusLabel)}</div>
        </div>
        <button type="button" class="live-programmed-load-btn" data-drawer-workout-id="${escapeHtml(fallbackWk.workoutId)}" data-drawer-slot-id="${escapeHtml(slot.slotId)}">Load</button>
      </div>
    `;
  }).join('');

  listEl.innerHTML = `<div class="live-programmed-session-sub font-mono">${headerSub}</div>${rowsHtml}`;

  if (typeof listEl.querySelectorAll === 'function') {
    listEl.querySelectorAll('.live-programmed-load-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        const slotId = btn.getAttribute('data-drawer-slot-id');
        const wkId = btn.getAttribute('data-drawer-workout-id');
        const wk = athletePrepState.workouts.find(w => w.workoutId === wkId) || fallbackWk;
        const slot = wk && Array.isArray(wk.prescribedSlots) ? wk.prescribedSlots.find(s => s.slotId === slotId) : null;
        if (wk && slot) {
          launchPlannedSlot(wk, slot);
          closeProgrammedDrawer();
        }
      });
    });
  }
}

function openProgrammedDrawer() {
  closeLiveWeightPopover();
  closeTargetRpePopover();
  if (liftSelectWrapper && liftSelectWrapper.classList) liftSelectWrapper.classList.remove('open');
  renderProgrammedDrawerList();
  const drawer = liveProgrammedDrawer || document.getElementById('live-programmed-drawer');
  const btn = btnProgrammedWorkout || document.getElementById('btn-programmed-workout');
  if (drawer) {
    drawer.style.display = 'flex';
    if (typeof drawer.setAttribute === 'function') drawer.setAttribute('aria-hidden', 'false');
  }
  if (btn && typeof btn.setAttribute === 'function') {
    btn.setAttribute('aria-expanded', 'true');
  }
}

function toggleProgrammedDrawer(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const drawer = liveProgrammedDrawer || document.getElementById('live-programmed-drawer');
  const isOpen = Boolean(drawer && (drawer.style.display === 'flex' || drawer.style.display === 'block'));
  if (isOpen) {
    closeProgrammedDrawer();
  } else {
    openProgrammedDrawer();
  }
}

function initProgrammedWorkoutDrawer() {
  if (initProgrammedWorkoutDrawer._initialized) return;
  initProgrammedWorkoutDrawer._initialized = true;

  const btn = btnProgrammedWorkout || document.getElementById('btn-programmed-workout');
  if (btn) {
    btn.addEventListener('click', toggleProgrammedDrawer);
  }
  const backdrop = liveProgrammedDrawerBackdrop || document.getElementById('live-programmed-drawer-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', closeProgrammedDrawer);
  }
  const closeBtn = btnProgrammedDrawerClose || document.getElementById('btn-programmed-drawer-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeProgrammedDrawer);
  }
  const openPrepBtn = btnProgrammedOpenPrep || document.getElementById('btn-programmed-open-prep');
  if (openPrepBtn) {
    openPrepBtn.addEventListener('click', () => {
      closeProgrammedDrawer();
      switchTab('set');
    });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const drawer = liveProgrammedDrawer || document.getElementById('live-programmed-drawer');
      if (!drawer || drawer.style.display === 'none' || drawer.style.display === '') return;
      const sheet = typeof drawer.querySelector === 'function' ? drawer.querySelector('.live-programmed-drawer-sheet') : null;
      const progBtn = btnProgrammedWorkout || document.getElementById('btn-programmed-workout');
      const inSheet = sheet && e && e.target && typeof sheet.contains === 'function' && sheet.contains(e.target);
      const inBtn = progBtn && e && e.target && typeof progBtn.contains === 'function' && progBtn.contains(e.target);
      if (!inSheet && !inBtn) {
        closeProgrammedDrawer();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e && e.key === 'Escape') {
        closeProgrammedDrawer();
      }
    });
  }
}

// ── Kickoff Execution on DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  applyLiftTheme('Deadlift');
  setTargetRpe(8.0);
  initTouchActiveStates();
  initBleSheetDrag();
  initCoachDirectiveSync();
  initAthleteSettings();
  bindSummaryBannerQuickActions();
  renderLivePrescriptionStrip();
  initAthletePrepView();
  initAthleteBiometricsDossier();
  initPrConfirmHudListeners();
  initPrepHoverTooltips();
  initBarPathControls();
  initProgrammedWorkoutDrawer();
  renderBarPathStage(0, 1.0);
  renderVelocityChangeGraph(1.0);
});
