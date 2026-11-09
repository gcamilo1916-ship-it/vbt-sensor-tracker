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

// Live Weight Control (Milestone 2: R1)
const liveWeightControl      = document.getElementById('live-weight-control');
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
const controlsPanel     = document.querySelector('.controls-panel');

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

let weightListenersInitialized = false;
function initWeightControlListeners() {
  if (weightListenersInitialized) return;
  weightListenersInitialized = true;

  if (btnLiveWeightDec) {
    btnLiveWeightDec.addEventListener('click', () => stepWorkingWeight(-2.5));
  }
  if (btnLiveWeightInc) {
    btnLiveWeightInc.addEventListener('click', () => stepWorkingWeight(2.5));
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
  if (btnWorkoutText) btnWorkoutText.textContent = 'END WORKOUT';
  if (btnWorkoutMaster) btnWorkoutMaster.classList.add('session-active');
  if (sessionPulse) sessionPulse.classList.add('active');
  if (sessionStatusText) {
    sessionStatusText.textContent = 'ACTIVE WORKOUT';
    sessionStatusText.classList.add('active');
  }

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

  activeWorkout.name = formatWorkoutTitle(activeWorkout);
  activeWorkout.endTime = Date.now();
  stopSessionTimer();

  if (interSetRestInterval) {
    clearInterval(interSetRestInterval);
    interSetRestInterval = null;
  }
  restStartTime = null;
  currentRestElapsedSeconds = 0;
  if (typeof AthleteFX !== 'undefined' && typeof AthleteFX.stopRestCountdown === 'function') {
    AthleteFX.stopRestCountdown();
  }

  activeWorkout = null;
  activeSet = null;
  if (controlsPanel) {
    controlsPanel.classList.remove('set-active-compact');
  }

  // Reset UI
  if (btnWorkoutText) btnWorkoutText.textContent = 'START WORKOUT';
  if (btnWorkoutMaster) btnWorkoutMaster.classList.remove('session-active');
  if (sessionPulse) sessionPulse.classList.remove('active');
  if (sessionStatusText) {
    sessionStatusText.textContent = 'NO ACTIVE WORKOUT';
    sessionStatusText.classList.remove('active');
  }
  if (sessionTimerDisp) sessionTimerDisp.textContent = '00:00:00';

  updateLiveMiniHud();
  updateSetUI(null);
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

// ── Inter-Set Rest Stopwatch Controller (Requirement R2) ──
let restStartTime = null;
let interSetRestInterval = null;
let currentRestElapsedSeconds = 0;

function formatRestDuration(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

  // Stop & Reset Inter-Set Rest Stopwatch (R2)
  if (restStartTime) {
    const elapsedSeconds = Math.round((Date.now() - restStartTime) / 1000);
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

  const setLift = canonicalLift(lift || currentLift);
  const setNumber = activeWorkout.sets.length + 1;
  const setWeight = (typeof currentWorkingWeight === 'number' && !isNaN(currentWorkingWeight))
    ? currentWorkingWeight
    : getLastWeightForLift(setLift);
  currentWorkingWeight = setWeight;
  if (liveSetWeightInput) liveSetWeightInput.value = setWeight.toFixed(1);
  if (workoutSetWeightInput) workoutSetWeightInput.value = setWeight.toFixed(1);

  const newSet = {
    setId: `set_${Date.now()}_${setNumber}`,
    setNumber: setNumber,
    lift: setLift,
    weight: setWeight,
    targetRpe: currentTargetRpe,
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
  if (activeWorkout) {
    activeWorkout.name = formatWorkoutTitle(activeWorkout);
  }

  // Update Controls UI
  btnSetText.textContent = 'END SET';
  btnSetToggle.classList.add('set-active');
  btnSetToggle.classList.add('recording');
  if (controlsPanel) {
    controlsPanel.classList.add('set-active-compact');
  }

  if (livePeakVel) livePeakVel.textContent = '0.00';
  if (livePeakSub) livePeakSub.textContent = `Set ${setNumber} Initialized`;

  updateLiveMiniHud();
  updateSetUI(activeSet);
  updateWorkoutPage();
  persistStorage();

  // Dispatch to ErosSyncBus
  if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
    window.ErosSyncBus.emit('set:started', {
      setId: newSet.setId,
      setNumber: newSet.setNumber,
      lift: newSet.lift,
      weight: newSet.weight,
      restSeconds: null,
      timestamp: newSet.startTime
    });
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
  activeSet = null;

  // ── Inter-Set Rest Stopwatch: start counting immediately upon set completion (R2)
  restStartTime = Date.now();
  currentRestElapsedSeconds = 0;
  if (interSetRestInterval) {
    clearInterval(interSetRestInterval);
    interSetRestInterval = null;
  }
  const updateRestDisplay = () => {
    if (!restStartTime) return;
    currentRestElapsedSeconds = Math.round((Date.now() - restStartTime) / 1000);
    const timeStr = formatRestDuration(currentRestElapsedSeconds);
    const restEl = document.getElementById('summary-rest-time');
    if (restEl) restEl.textContent = timeStr;
  };
  updateRestDisplay();
  interSetRestInterval = setInterval(updateRestDisplay, 1000);

  // Trigger Athlete Celebratory FX & Post-Set Rest Transition
  if (typeof triggerSetCompletionCelebration === 'function') {
    triggerSetCompletionCelebration(completedSetForCelebration);
  } else if (typeof window !== 'undefined' && typeof window.triggerSetCompletionCelebration === 'function') {
    window.triggerSetCompletionCelebration(completedSetForCelebration);
  }

  if (activeWorkout) {
    activeWorkout.name = formatWorkoutTitle(activeWorkout);
  }

  // Update Controls UI
  btnSetText.textContent = 'START SET';
  btnSetToggle.classList.remove('set-active');
  btnSetToggle.classList.remove('recording');
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
function recordRepetition({ lift, velocity, rpe, deviationCm = null, trajectoryPoints = null }) {
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

  activeSet.reps.push(repObj);
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
    window.ErosSyncBus.emit('rep:recorded', syncRepPayload);
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

  // Asynchronous UI Dispatch (Non-blocking Observability)
  requestAnimationFrame(() => {
    updateLiveDisplay(repObj, true);
    renderBarPathStage(repObj.repNumber - 1, 1.0);
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

  // Velocity Loss Calculation: ((Max - Last) / Max) * 100
  if (maxV > 0) {
    const loss = ((maxV - lastV) / maxV) * 100;
    set.velocityLossPct = parseFloat(Math.max(0, loss).toFixed(1));
  } else {
    set.velocityLossPct = 0.0;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2D BARBELL VERTICAL DEVIATION & REPLAY ENGINE (Requirement R1)
// ═════════════════════════════════════════════════════════════════════════════

let barPathMode = 'path'; // 'path' or 'vel'
let currentReplayRepIdx = 0;
let replaySpeed = 1.0;
let isReplaying = false;
let replayAnimId = null;

function renderBarPathStage(repIndex = 0, scrubProgress = 1.0) {
  const canvas = document.getElementById('bar-path-canvas');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;  // 220
  const h = canvas.height; // 210

  ctx.clearRect(0, 0, w, h);

  // Background subtle fill
  ctx.fillStyle = '#080A10';
  ctx.fillRect(0, 0, w, h);

  const reps = (activeSet && Array.isArray(activeSet.reps)) ? activeSet.reps : [];
  if (reps.length === 0) {
    // Empty state
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WAITING FOR REP 1...', w / 2, h / 2);
    
    // Clear HUD values
    const devEl = document.getElementById('barpath-hud-dev');
    const effEl = document.getElementById('barpath-hud-eff');
    if (devEl) devEl.textContent = '0.0 cm';
    if (effEl) effEl.textContent = '100%';
    updateRepPills(0, 0);
    return;
  }

  const targetIdx = Math.min(Math.max(0, repIndex), reps.length - 1);
  currentReplayRepIdx = targetIdx;
  const currentRep = reps[targetIdx];
  const pts = currentRep.trajectoryPoints || [];
  if (pts.length < 2) return;

  // Update HUD text
  const devEl = document.getElementById('barpath-hud-dev');
  const effEl = document.getElementById('barpath-hud-eff');
  const devVal = (typeof currentRep.deviationCm === 'number') ? currentRep.deviationCm : 0.0;
  const effVal = (typeof currentRep.pathEfficiencyPct === 'number') ? currentRep.pathEfficiencyPct : 100.0;
  if (devEl) devEl.textContent = `${devVal >= 0 ? '+' : ''}${devVal.toFixed(1)} cm`;
  if (effEl) effEl.textContent = `${effVal.toFixed(1)}%`;

  if (barPathMode === 'path') {
    renderPathMode(ctx, w, h, pts, scrubProgress, reps, targetIdx);
  } else {
    renderVelocityMode(ctx, w, h, pts, scrubProgress);
  }

  updateRepPills(reps.length, targetIdx);
}

function renderPathMode(ctx, w, h, pts, scrubProgress, reps, targetIdx) {
  const centerX = w / 2; // 110 px (0.0 cm plumb line)
  const scaleX = 18;     // 18 px per cm (±5.0 cm range)
  const topY = 25;
  const botY = 185;

  const mapX = (dx) => Math.max(8, Math.min(w - 8, centerX + dx * scaleX));
  const mapY = (y) => {
    const normY = y > 1.5 ? (y / 50.0) : y;
    return botY - normY * (botY - topY);
  };

  // 1. Optimal Corridor (+-2.0cm)
  ctx.fillStyle = 'rgba(0, 255, 102, 0.04)';
  ctx.fillRect(centerX - 2 * scaleX, topY, 4 * scaleX, botY - topY);

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

  // Axis Labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('0.0', centerX, botY + 14);
  ctx.fillText('-2', centerX - 2 * scaleX, botY + 14);
  ctx.fillText('+2', centerX + 2 * scaleX, botY + 14);

  // Rep 1 Ghost Trail (25% opacity dashed) if current rep is not Rep 1
  if (targetIdx > 0 && reps.length > 0 && reps[0].trajectoryPoints) {
    const rep1Pts = reps[0].trajectoryPoints;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
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

  // Active Rep Color-Graded Segments
  const maxIdx = Math.max(0, Math.min(pts.length - 1, Math.round((pts.length - 1) * scrubProgress)));
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  for (let i = 1; i <= maxIdx; i++) {
    const pPrev = pts[i - 1];
    const pCurr = pts[i];
    const dev = Math.abs(pCurr.dx);

    let strokeColor = '#00FF66';
    if (dev > 3.5) strokeColor = '#FF3B30';
    else if (dev > 2.0) strokeColor = '#FFB800';

    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    ctx.moveTo(mapX(pPrev.dx), mapY(pPrev.y));
    ctx.lineTo(mapX(pCurr.dx), mapY(pCurr.y));
    ctx.stroke();
  }

  // Puck Position & Metrics at scrubProgress
  const currentPt = pts[maxIdx];
  if (currentPt) {
    const puckX = mapX(currentPt.dx);
    const puckY = mapY(currentPt.y);

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
    const dev = Math.abs(currentPt.dx);
    let haloColor = 'rgba(0, 255, 102, 0.35)';
    if (dev > 3.5) haloColor = 'rgba(255, 59, 48, 0.45)';
    else if (dev > 2.0) haloColor = 'rgba(255, 184, 0, 0.40)';

    ctx.fillStyle = haloColor;
    ctx.beginPath();
    ctx.arc(puckX, puckY, 9, 0, Math.PI * 2);
    ctx.fill();

    // Puck core
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

function startReplay() {
  const reps = (activeSet && Array.isArray(activeSet.reps)) ? activeSet.reps : [];
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

  function step(now) {
    if (!isReplaying) return;
    const delta = now - lastTime;
    lastTime = now;

    currentVal += (delta / durationMs) * 100;
    if (currentVal >= 100) {
      currentVal = 100;
      if (scrubber) scrubber.value = '100';
      renderBarPathStage(currentReplayRepIdx, 1.0);
      stopReplay();
      return;
    }

    if (scrubber) scrubber.value = String(Math.round(currentVal));
    renderBarPathStage(currentReplayRepIdx, currentVal / 100.0);
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

  const canvas = document.getElementById('bar-path-canvas');
  if (!canvas || !canvas.getContext) {
    if (onComplete) onComplete();
    return;
  }
  const ctx = canvas.getContext('2d');
  const w = canvas.width || 220;
  const h = canvas.height || 210;

  const centerX = w / 2; // 110 px (0.0 cm plumb line)
  const scaleX = 18;     // 18 px per cm
  const topY = 25;       // Lockout
  const botY = 185;      // Hole / Floor
  const travelY = botY - topY; // 160 px

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
    ctx.fillStyle = '#080A10';
    ctx.fillRect(0, 0, w, h);

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

    // Axis Labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0.0', centerX, botY + 14);
    ctx.fillText('-2', centerX - 2 * scaleX, botY + 14);
    ctx.fillText('+2', centerX + 2 * scaleX, botY + 14);
  }

  function frame(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1.0, elapsed / totalDurationMs);

    let yDot, romProgress, isConcentricPhase;

    if (isDeadlift) {
      // Deadlift: starts at floor (botY), pulls upward to lockout (topY) in concentric, then returns in eccentric
      if (progress <= 0.55) {
        isConcentricPhase = true;
        const pCon = progress / 0.55; // 0.0 to 1.0
        romProgress = pCon;
        yDot = botY - pCon * travelY;
      } else {
        isConcentricPhase = false;
        const pEcc = (progress - 0.55) / 0.45; // 0.0 to 1.0
        romProgress = 1.0 - pEcc;
        yDot = topY + pEcc * travelY;
      }
    } else {
      // Squat & Bench: start at lockout (topY), descend in eccentric to hole (botY), ascend in concentric to lockout (topY)
      if (progress <= 0.50) {
        isConcentricPhase = false;
        const pEcc = progress / 0.50; // 0.0 to 1.0
        romProgress = pEcc;
        yDot = topY + pEcc * travelY;
      } else {
        isConcentricPhase = true;
        const pCon = (progress - 0.50) / 0.50; // 0.0 to 1.0
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
      // Velocity reaches lowest near mid-ascent sticking region (p ~ 0.50)
      const stickDist = Math.abs(romProgress - 0.50);
      const stickWeight = Math.max(0, 1.0 - stickDist * 2.5);
      instVel = vPeak - stickWeight * (vPeak - vStick);
    } else {
      instVel = velocity * 0.85;
    }

    // Dynamic difficulty calculation D in [0.0, 1.0]
    // Starts at 0.0 (pure specular white), transitions into lift color as difficulty increases
    let difficulty = 0.0;
    if (isConcentricPhase) {
      const rpeFactor = Math.max(0, Math.min(1, (rpe - 6.0) / 4.0));
      const velDropFactor = Math.max(0, Math.min(1, (vPeak - instVel) / Math.max(0.1, vPeak - 0.15)));
      // Increases through concentric drive towards sticking point & lockout
      difficulty = Math.max(0, Math.min(1, (0.60 * rpeFactor + 0.40 * velDropFactor) * Math.min(1, romProgress * 1.6)));
    } else {
      // Eccentric phase has minimal difficulty color shift (stays predominantly white)
      difficulty = 0.10 * Math.max(0, Math.min(1, (rpe - 6.0) / 4.0)) * romProgress;
    }

    // Smooth color interpolation: rgb(255,255,255) -> targetColor
    const curR = Math.round(255 + difficulty * (targetColor.r - 255));
    const curG = Math.round(255 + difficulty * (targetColor.g - 255));
    const curB = Math.round(255 + difficulty * (targetColor.b - 255));
    const dotRgb = `rgb(${curR}, ${curG}, ${curB})`;

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
      // ── Variant B: Fluid Velocity Energy Ribbon ──
      ctx.save();
      for (let i = 1; i < historyPoints.length; i++) {
        const p1 = historyPoints[i - 1];
        const p2 = historyPoints[i];
        const normV = Math.max(0, Math.min(1, p2.v / vPeak));
        const ribbonWidth = 2.5 + 5.5 * normV; // 8px down to 2.5px during grind

        // Fatigue aura pulse frequency (1.2Hz at RPE 6 to 4.0Hz at RPE 10)
        const pulseFreq = 1.2 + 2.8 * Math.max(0, (rpe - 6.0) / 4.0);
        const pulse = 0.70 + 0.30 * Math.sin((elapsed / 1000) * pulseFreq * 2 * Math.PI);

        ctx.lineWidth = ribbonWidth;
        ctx.lineCap = 'round';
        ctx.strokeStyle = p2.rgb;
        ctx.shadowBlur = 12 * pulse * (p2.diff + 0.3);
        ctx.shadowColor = targetColor.hex;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.restore();

      // Lead puck
      ctx.fillStyle = dotRgb;
      ctx.beginPath();
      ctx.arc(xDot, yDot, 6, 0, Math.PI * 2);
      ctx.fill();

    } else if (variant === 'C') {
      // ── Variant C: Concentric Ripple Waves ──
      // Plumb connector hairline
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, yDot);
      ctx.lineTo(xDot, yDot);
      ctx.stroke();
      ctx.restore();

      // Concentric elliptical waves expanding towards plumb line
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

      // Center dot
      ctx.fillStyle = dotRgb;
      ctx.beginPath();
      ctx.arc(xDot, yDot, 5, 0, Math.PI * 2);
      ctx.fill();

    } else if (variant === 'D') {
      // ── Variant D: Spatial Ghost Vectors ──
      // Ghost baseline plumb reference
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(centerX, topY);
      ctx.lineTo(centerX, botY);
      ctx.stroke();
      ctx.restore();

      // Orthogonal Velocity Breakdown Vectors from (xDot, yDot)
      const vVertLen = Math.max(10, Math.min(36, instVel * 30));
      const vHorizLen = Math.max(4, Math.min(30, Math.abs(dxCm) * 6));
      const horizDir = dxCm >= 0 ? 1 : -1;

      // Vertical ascent vector (upward)
      ctx.save();
      ctx.strokeStyle = '#00FF66';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xDot, yDot);
      ctx.lineTo(xDot, yDot - vVertLen);
      ctx.stroke();
      // Arrowhead
      ctx.fillStyle = '#00FF66';
      ctx.beginPath();
      ctx.moveTo(xDot, yDot - vVertLen - 3);
      ctx.lineTo(xDot - 3, yDot - vVertLen + 2);
      ctx.lineTo(xDot + 3, yDot - vVertLen + 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Horizontal deviation vector
      ctx.save();
      ctx.strokeStyle = targetColor.hex;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xDot, yDot);
      ctx.lineTo(xDot + horizDir * vHorizLen, yDot);
      ctx.stroke();
      // Arrowhead
      ctx.fillStyle = targetColor.hex;
      ctx.beginPath();
      ctx.moveTo(xDot + horizDir * (vHorizLen + 3), yDot);
      ctx.lineTo(xDot + horizDir * (vHorizLen - 2), yDot - 3);
      ctx.lineTo(xDot + horizDir * (vHorizLen - 2), yDot + 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Puck Core
      ctx.fillStyle = dotRgb;
      ctx.beginPath();
      ctx.arc(xDot, yDot, 5, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // ── Variant A (Primary Concept): Kinetic Dot + Dynamic Difficulty Color Transition ──
      // Connector hairline to plumb line
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, yDot);
      ctx.lineTo(xDot, yDot);
      ctx.stroke();
      ctx.restore();

      // Ghost trail of previous path points
      if (historyPoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(historyPoints[0].x, historyPoints[0].y);
        for (let i = 1; i < historyPoints.length; i++) {
          ctx.lineTo(historyPoints[i].x, historyPoints[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Outer specular halo
      const haloRadius = 8 + 8 * difficulty;
      const haloAlpha = 0.35 + 0.30 * difficulty;
      ctx.save();
      ctx.fillStyle = `rgba(${curR}, ${curG}, ${curB}, ${haloAlpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(xDot, yDot, haloRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Specular dot core
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
      // ── Requirement R2: Repetition Completion Pop & Pure Web Audio Synthesis ──
      const popScale = 1.0 + 1.5 * ((Math.max(6.0, Math.min(10.0, rpe)) - 6.0) / 4.0); // 1.0 to 2.5
      triggerCompletionPop(ctx, w, h, xDot, yDot, popScale, targetColor, velocity, rpe, liftType, onComplete);
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

      // Expanding radial shockwave ring
      const currentR = 6 + (maxRadius - 6) * popProg;
      const ringAlpha = (1.0 - popProg) * 0.85;

      ctx.save();
      ctx.strokeStyle = `rgba(${colorObj.r}, ${colorObj.g}, ${colorObj.b}, ${ringAlpha.toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, currentR, 0, Math.PI * 2);
      ctx.stroke();

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

    rowsHtml += `
      <div class="workout-set-row ${isCurrent ? 'is-active-set' : ''}" data-set-number="${s.setNumber}" data-lift="${liftKey}">
        <div class="workout-set-row-left">
          <span class="workout-set-num">SET ${s.setNumber}</span>
          <span class="lift-tag" data-lift="${liftKey}">${escapeHtml(setLift.toUpperCase())}</span>
          <span class="workout-set-reps">${repCount} ${repCount === 1 ? 'rep' : 'reps'}</span>
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

    html += `
      <div class="session-card ${isExpanded ? 'expanded' : ''}" data-session-id="${session.id}">
        <div class="session-card-header" onclick="toggleSessionCard('${session.id}')">
          <div class="session-card-title-group">
            <span class="session-card-title">${escapeHtml(sessionTitle)}</span>
            <span class="session-card-meta">${session.dateStr} • ${durationMins} ${typeof durationMins === 'number' ? 'mins' : ''} • ${setList.length}S / ${sessionRepsCount}R</span>
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

    out += `
      <div class="session-set-item" data-lift="${setLiftKey}">
        <div class="session-set-header">
          <span class="session-set-tag" data-lift="${setLiftKey}">SET ${s.setNumber} — ${escapeHtml(setLift.toUpperCase())}${weightLabel}</span>
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
    const targetSeconds = payload.targetSeconds;
    if (activeSet) {
      activeSet.prescribedRestSeconds = targetSeconds;
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
          athleteId: 'ath_01',
          lastSync: Date.now()
        };
        saveConnectionState(currentState);
        updateUI(currentState);
      } else {
        if (!coachCode) {
          coachCode = 'EROS-7X9K';
          if (coachCodeInput) coachCodeInput.value = coachCode;
        }
        currentState = {
          connected: true,
          athleteName: athleteName,
          rackId: rackId,
          coachCode: coachCode,
          athleteId: 'ath_01',
          lastSync: Date.now()
        };
        saveConnectionState(currentState);
        updateUI(currentState);

        const payload = {
          athleteId: 'ath_01',
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

if (typeof window !== 'undefined') {
  window.initAthleteSettings = initAthleteSettings;
  window.synthesizeRepTrajectory = synthesizeRepTrajectory;
  window.renderBarPathStage = renderBarPathStage;
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

// ── Kickoff Execution on DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  applyLiftTheme('Deadlift');
  setTargetRpe(8.0);
  initTouchActiveStates();
  initBleSheetDrag();
  initCoachDirectiveSync();
  initAthleteSettings();
  initBarPathControls();
  renderBarPathStage(0, 1.0);
});
