/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS COACH PORTAL CONTROLLER
 * ChatGPT-Inspired Dark UI Controller, Live Telemetry Monitor,
 * Manual Athlete Bonding, History Analytics & Monthly Calendar Engine
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  }
  if (root) {
    root.CoachPortal = factory();
    root.ErosCoachPortal = root.CoachPortal;
    root.initCoachPortal = root.CoachPortal.init;
    root.switchMode = root.CoachPortal.switchMode;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Private State ──
  let isCoachMode = false;
  let activeCoachPanel = 'live'; // 'live' | 'history' | 'preparation'
  let activeRosterFilter = 'all'; // 'all' | 'lifting' | 'resting' | 'idle'
  let activeHistoryLiftFilter = 'all';
  let gymTotalModel = 'abs'; // 'abs' | 'e1rm'
  let activeRepsStream = [];
  let expandedSetIds = new Set();
  let feedbackTimer = null;
  let pairingTtlTimer = null;
  let restTickerTimer = null;
  let pairingSecondsRemaining = 900;
  let currentPairingCode = '';
  let lastProcessedRepKey = '';
  let lastProcessedSetId = '';
  let lastCompletedSetId = '';

  // Orbital Motion & Radial Menu State
  let cursorGlowBound = false;
  let cursorGlowRaf = null;
  let cursorTargetX = -9999;
  let cursorTargetY = -9999;
  let cursorCurrentX = -9999;
  let cursorCurrentY = -9999;
  let isRadialOpen = false;
  let radialInitialized = false;
  let radialSuppressNextClick = false;
  let navHighlightTimer = null;

  // Calendar State (Defaults to October 2026 or current date)
  const nowDate = new Date();
  let currentCalYear = nowDate.getFullYear();
  let currentCalMonth = nowDate.getMonth(); // 0-indexed
  let selectedCalDateStr = formatIsoDate(nowDate);

  const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const BONDS_STORAGE_KEY = 'eros_coach_bonds_v1';
  const SIDEBAR_COLLAPSED_KEY = 'eros_coach_sidebar_collapsed_v1';
  const INTRO_SEEN_KEY = 'eros_coach_intro_seen';
  const RADIAL_CONFIG_KEY = 'eros_radial_fab_config_v1';
  const RADIAL_POS_KEY = 'eros_radial_fab_pos_v1';
  const PILL_ORDER_KEY = 'eros_coach_pill_order_v1';
  const COACH_BIG_PILL_DEFAULT_GROUP = {
    'coach-live-panel': 'coach-live-big-pills',
    'coach-athlete-history-panel': 'coach-history-big-pills',
    'coach-preparation-panel': 'coach-prep-big-pills'
  };
  const COACH_BIG_PILL_DEFAULT_ID = {
    'coach-squad-overview': 'squad-overview',
    'coach-active-set-card': 'active-set-card',
    'coach-feedback-console': 'feedback-console',
    'coach-sets-history-card': 'sets-history-card',
    'coach-history-bento-quad': 'history-bento-quad',
    'coach-monthly-calendar-card': 'monthly-calendar-card',
    'coach-previous-workouts-card': 'previous-workouts-card',
    'coach-prep-factoring-strip': 'prep-factoring-strip',
    'coach-prep-plan-card': 'prep-plan-card',
    'coach-prep-plan-header': 'prep-plan-header',
    'coach-prep-macro-card': 'prep-macro-card',
    'coach-prep-session-card': 'prep-session-card',
    'coach-prep-comparison-card': 'prep-comparison-card'
  };
  const INTERACTIVE_DRAG_CHILD_SELECTOR =
    'canvas, table, button, input, select, textarea, a, [role="button"], [role="slider"], .coach-squad-athlete-card, .coach-rep-stream-pill, .coach-barpath-rep-pill, .coach-cal-day, .coach-cal-day-cell, .coach-prep-day-tab';
  const PORTAL_MODE_KEY = 'eros_portal_mode_v1';
  const COACH_PANEL_KEY = 'eros_coach_active_panel_v1';
  const COACH_SECTION_KEY = 'eros_coach_active_section_v1';
  const FAKE_ATHLETE_NAME_REGEX = /^(alex vance|jordan bell|elena rostova|liam thorne|marcus vance|devon carter|sofia lindholm|marcus sterling)$/i;
  const DEFAULT_RADIAL_ACTIONS = [
    'switch-mode',
    'toggle-set',
    'link-athlete',
    'replay-path',
    'rest-timer',
    'quick-cue'
  ];

  const PREP_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const PREP_AUTOSAVE_DELAY_MS = 600;
  const PREP_EVENT_BROADCAST_CAP = 40;
  const PREP_LOCAL_DRAFT_KEY = 'eros_coach_prep_draft_v1';
  const PREP_SLOT_INPUT_IDS = [
    'coach-slot-top-sets', 'coach-slot-top-reps', 'coach-slot-top-rpe', 'coach-slot-top-load',
    'coach-slot-backoff-sets', 'coach-slot-backoff-reps', 'coach-slot-backoff-rpe', 'coach-slot-backoff-drop',
    'coach-prep-1rm-squat', 'coach-prep-1rm-bench', 'coach-prep-1rm-deadlift'
  ];
  const PREP_HEADER_INPUT_IDS = [
    'coach-prep-title-input', 'coach-prep-months-select', 'coach-prep-start-date', 'coach-prep-meet-date',
    'coach-prep-1rm-squat', 'coach-prep-1rm-bench', 'coach-prep-1rm-deadlift'
  ];
  const PREP_SESSION_INPUT_IDS = [
    'coach-prep-session-title', 'coach-prep-phase-select', 'coach-prep-deload-toggle',
    'coach-prep-workout-notes', 'coach-prep-dietary-notes'
  ];

  const prepState = {
    bound: false,
    athleteId: '',
    loadedFor: '',
    plan: null,
    workouts: [],
    weekIndex: 0,
    selectedWeek: 0,
    dayIndex: 0,
    draftSlots: [],
    profiles: {},
    feedbackByWorkout: {},
    customExercises: [],
    autosaveTimer: null
  };

  const goldenPr = { setIds: new Set(), dates: new Set() };
  let remoteCompletedSets = [];

  // ── XSS Sanitization Defense ──
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Genuine Active Session Athlete bound to ath_01 (No fake personas)
  function createSessionAthlete(name = 'Active Athlete', rack = 'Rack 01') {
    return {
      id: 'ath_01',
      name: name,
      rack: rack,
      weightClass: '-93 kg',
      bodyweightKg: 85.0,
      gender: 'unspecified',
      status: 'idle',
      restSeconds: 0,
      currentLift: 'Main deadlift',
      currentLoadKg: 0.0,
      currentMcv: 0.0,
      currentPv: 0.0,
      currentRomCm: 0.0,
      currentVlPct: 0.0,
      readiness: '100% [Optimal]',
      e1rm: '—',
      volume: '0 kg',
      compPrs: { squat: 0, bench: 0, deadlift: 0 },
      gymPrs: { squat: 0, bench: 0, deadlift: 0 },
      e1rmPrs: { squat: 0, bench: 0, deadlift: 0 },
      bondStatus: 'active',
      bondedSince: 'Session Active'
    };
  }

  // DEFAULT_SQUAD_ATHLETES contains genuine bonded athletes only (default: local session athlete ath_01)
  const DEFAULT_SQUAD_ATHLETES = [
    createSessionAthlete('Active Athlete', 'Rack 01')
  ];

  let SQUAD_ATHLETES = DEFAULT_SQUAD_ATHLETES.map(a => ({
    ...a,
    compPrs: { ...a.compPrs },
    gymPrs: { ...a.gymPrs },
    e1rmPrs: { ...a.e1rmPrs }
  }));

  let pendingBondRequests = [];

  let currentAthlete = SQUAD_ATHLETES[0];

  // ── Helper: ISO Date Formatting (YYYY-MM-DD in Local Time) ──
  function formatIsoDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ── Helper: Strict 'Main' Workout Naming Rule ──
  function formatCanonicalWorkoutName(liftsInput) {
    let rawList = [];
    if (Array.isArray(liftsInput)) {
      rawList = liftsInput;
    } else if (liftsInput && Array.isArray(liftsInput.lifts)) {
      rawList = liftsInput.lifts;
    } else if (liftsInput && Array.isArray(liftsInput.sets)) {
      rawList = liftsInput.sets.map(s => (s && (s.lift || s.exercise_name || s.exerciseName || s.exercise)) || '');
    } else if (liftsInput && typeof liftsInput === 'string') {
      rawList = [liftsInput];
    } else if (liftsInput && liftsInput.name) {
      rawList = [liftsInput.name];
    } else {
      rawList = [String(liftsInput || 'Deadlift')];
    }

    const hasSq = rawList.some(l => /squat/i.test(l));
    const hasBp = rawList.some(l => /bench/i.test(l));
    const hasDl = rawList.some(l => /deadlift/i.test(l));
    const isSbd = rawList.some(l => /\bSBD\b/i.test(l));

    if (isSbd || (hasSq && hasBp && hasDl)) return 'SBD';
    if (hasDl && hasBp) return 'Main deadlift + Bench';
    if (hasSq && hasBp) return 'Main squat + Bench';
    if (hasSq && hasDl) return 'Main squat + Main deadlift';
    if (hasSq) return 'Main squat';
    if (hasDl) return 'Main deadlift';
    if (hasBp) return 'Bench';
    return 'Main deadlift';
  }

  function formatCanonicalLiftLabel(liftStr) {
    const s = String(liftStr || 'Deadlift');
    if (/squat/i.test(s)) return 'Main squat';
    if (/deadlift/i.test(s)) return 'Main deadlift';
    if (/bench/i.test(s)) return 'Bench';
    return s;
  }

  /** Normalizes a raw lift name to Title Case without stripping short acronyms. */
  function formatDisplayLiftName(liftStr) {
    const raw = String(liftStr || 'Deadlift').trim();
    if (!raw) return 'Deadlift';
    if (raw.length > 3 && raw === raw.toUpperCase()) {
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  /** Formats internal canvas mode token for button UI without mutating API mode strings. */
  function formatCoachCanvasModeLabel(mode) {
    return mode === 'VEL' ? 'Mode: Vel' : 'Mode: Path';
  }

  function updateBarpathModeButton(mode) {
    const btn = elements.btnBarpathMode || (typeof document !== 'undefined' ? document.getElementById('coach-btn-barpath-mode') : null);
    if (!btn) return;
    const label = formatCoachCanvasModeLabel(mode);
    let textSpan = btn.querySelector ? btn.querySelector('#coach-barpath-mode-text') : null;
    if (!textSpan && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const hasSvg = btn.querySelector && btn.querySelector('svg');
      if (hasSvg) {
        textSpan = document.createElement('span');
        textSpan.id = 'coach-barpath-mode-text';
        btn.appendChild(textSpan);
      } else {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg><span id="coach-barpath-mode-text"></span>`;
        textSpan = btn.querySelector ? btn.querySelector('#coach-barpath-mode-text') : null;
      }
    }
    if (textSpan) {
      textSpan.textContent = label;
    } else {
      btn.textContent = label;
    }
  }

  function formatRestDuration(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return '-';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ── Helper: Bryan Mann 5-Zone Velocity Continuum ──
  function classifyBryanMannZone(velocityMps, liftName) {
    const v = Number(velocityMps) || 0;
    const isDl = /deadlift/i.test(String(liftName || ''));
    if (isDl) {
      if (v > 0.85) return { key: 'starting_strength', label: 'Starting Strength', css: 'zone-starting' };
      if (v >= 0.65) return { key: 'speed_strength', label: 'Speed-Strength', css: 'zone-speed-strength' };
      if (v >= 0.45) return { key: 'strength_speed', label: 'Strength-Speed', css: 'zone-strength-speed' };
      if (v >= 0.25) return { key: 'accelerative_strength', label: 'Accelerative', css: 'zone-accelerative' };
      return { key: 'absolute_strength', label: 'Absolute Strength', css: 'zone-absolute' };
    }
    if (v > 1.00) return { key: 'starting_strength', label: 'Starting Strength', css: 'zone-starting' };
    if (v >= 0.75) return { key: 'speed_strength', label: 'Speed-Strength', css: 'zone-speed-strength' };
    if (v >= 0.50) return { key: 'strength_speed', label: 'Strength-Speed', css: 'zone-strength-speed' };
    if (v >= 0.30) return { key: 'accelerative_strength', label: 'Accelerative', css: 'zone-accelerative' };
    return { key: 'absolute_strength', label: 'Absolute Strength', css: 'zone-absolute' };
  }

  // ── Helper: IPF DOTS Score Calculator ──
  function computeDotsScore(totalKg, bodyweightKg, gender) {
    const bw = Math.max(40, Math.min(210, Number(bodyweightKg) || 85));
    const tot = Math.max(0, Number(totalKg) || 0);
    const isFemale = String(gender || '').toLowerCase() === 'female';
    const c = isFemale
      ? [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706]
      : [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.0000010930];
    const denom = c[0] + c[1] * bw + c[2] * Math.pow(bw, 2) + c[3] * Math.pow(bw, 3) + c[4] * Math.pow(bw, 4);
    if (denom <= 0) return 0;
    return (500.0 / denom) * tot;
  }

  // ── Helper: Load-Velocity Ordinary Least Squares (OLS) Linear Regression ──
  // Models V = m * L + c. Evaluated at canonical MVTs (Squat: 0.30 m/s, Bench: 0.15 m/s, Deadlift: 0.15 m/s)
  // Projected e1RM = (V_MVT - c) / m.
  function calculateOlsE1rm(sets, liftType, fallbackPr) {
    const canonicalMvts = {
      squat: 0.30,
      bench: 0.15,
      deadlift: 0.15
    };
    const key = /squat/i.test(liftType) ? 'squat' : (/bench/i.test(liftType) ? 'bench' : 'deadlift');
    const vMvt = canonicalMvts[key];

    let maxCompletedLoad = 0;
    const points = [];
    if (Array.isArray(sets)) {
      sets.forEach(s => {
        if (!s) return;
        const sLift = s.lift || s.exercise_name || s.exerciseName || s.exercise || s.movement || '';
        const matchesLift = key === 'squat'
          ? /squat/i.test(sLift)
          : (key === 'bench' ? /bench/i.test(sLift) : /deadlift/i.test(sLift));
        const w = parseFloat(s.weight || s.load_kg || s.load || 0);
        let v = parseFloat(s.avgVelocity || s.mean_velocity_mps || s.meanVelocity || s.maxVelocity || s.peak_velocity_mps || 0);
        if (v === 0 && Array.isArray(s.reps) && s.reps.length > 0) {
          const repVels = s.reps.map(r => parseFloat(r.velocity || r.mean_velocity || 0)).filter(rv => rv > 0);
          if (repVels.length > 0) {
            v = repVels.reduce((a, b) => a + b, 0) / repVels.length;
          }
        }
        if (matchesLift && w > 0 && v >= vMvt && v <= 1.6) {
          points.push({ load: w, vel: v });
          if (w > maxCompletedLoad) maxCompletedLoad = w;
        }
      });
    }

    if (points.length >= 2) {
      const minLoad = Math.min(...points.map(p => p.load));
      const maxLoad = Math.max(...points.map(p => p.load));
      if (maxLoad - minLoad >= 15.0) {
        const n = points.length;
        let sumL = 0, sumV = 0, sumLV = 0, sumL2 = 0;
        points.forEach(p => {
          sumL += p.load;
          sumV += p.vel;
          sumLV += p.load * p.vel;
          sumL2 += p.load * p.load;
        });
        const denom = (n * sumL2 - sumL * sumL);
        if (denom !== 0) {
          const m = (n * sumLV - sumL * sumV) / denom;
          const c = (sumV - m * sumL) / n;
          // Slope must be negative (higher load = lower velocity)
          if (m < -0.0004) {
            let projected = (vMvt - c) / m;
            if (projected > 0 && projected <= 600) {
              if (maxCompletedLoad > 0 && projected < maxCompletedLoad) {
                projected = maxCompletedLoad;
              }
              return Math.round(projected * 10) / 10;
            }
          }
        }
      }
    }
    const numFallback = parseFloat(fallbackPr);
    return (!isNaN(numFallback) && numFallback > 0) ? numFallback : 0;
  }

  // ── DOM Element Cache ──
  let elements = {};
  let coachUnlocked = false;
  let athleteLongPressTimer = null;
  let athletePressStartTime = 0;
  const LONG_PRESS_DURATION_MS = 500;

  // ── Coach Focal Center State (R2) ──
  let coachCanvasMode = 'PATH'; // 'PATH' or 'VEL'
  let coachReplaySpeed = 1.0;   // 1.0 or 0.5
  let coachPlaybackActive = false;
  let coachPlaybackAnimFrame = null;
  let coachScrubProgress = 1.0;
  let coachActiveTrajectory = [];
  let coachRep1Trajectory = null;
  let coachActiveReps = [];
  let coachSelectedRepIdx = -1;
  let coachActiveTargetRpe = 8.0;

  function revealCoachOption() {
    coachUnlocked = true;
    if (!elements.viewModeToggle) elements.viewModeToggle = document.getElementById('view-mode-toggle');
    if (elements.viewModeToggle) {
      elements.viewModeToggle.classList.add('coach-unlocked');
    }
    if (typeof HapticsFX !== 'undefined' && typeof HapticsFX.vibrate === 'function') {
      try { HapticsFX.vibrate([40, 30, 40]); } catch (_) {}
    }
    if (typeof SoundFX !== 'undefined') {
      if (typeof SoundFX.playCoachDirectiveChime === 'function') {
        try { SoundFX.playCoachDirectiveChime(); } catch (_) {}
      } else if (typeof SoundFX.playNavTick === 'function') {
        try { SoundFX.playNavTick(); } catch (_) {}
      }
    }
  }

  function showCoachOrientationAdvisory() {
    if (typeof document === 'undefined') return;
    const banner = document.getElementById('coach-orientation-banner');
    if (!banner) return;
    const isLandscape = (typeof window !== 'undefined' && window.innerWidth > window.innerHeight);
    const isLargeScreen = (typeof window !== 'undefined' && window.innerWidth >= 1024);

    banner.classList.remove('dismissed');
    banner.style.display = 'flex';

    if (banner._dismissTimeout) clearTimeout(banner._dismissTimeout);
    const autoDismissMs = (isLandscape || isLargeScreen) ? 4500 : 7000;
    banner._dismissTimeout = setTimeout(() => {
      dismissCoachOrientationBanner();
    }, autoDismissMs);
  }

  function dismissCoachOrientationBanner() {
    if (typeof document === 'undefined') return;
    const banner = document.getElementById('coach-orientation-banner');
    if (!banner) return;
    banner.classList.add('dismissed');
    setTimeout(() => {
      if (banner && banner.classList.contains('dismissed')) {
        banner.style.display = 'none';
      }
    }, 350);
  }

  function queryElements() {
    elements = {
      viewCoach: document.getElementById('view-coach'),
      btnModeAthlete: document.getElementById('btn-mode-athlete'),
      btnModeCoach: document.getElementById('btn-mode-coach'),
      viewModeToggle: document.getElementById('view-mode-toggle'),

      // Squad Ribbon
      athleteSelect: document.getElementById('coach-athlete-select'),
      sessionStatusBadge: document.getElementById('coach-session-status-badge'),
      sessionStatusText: document.getElementById('coach-session-status-text'),
      readinessVal: document.getElementById('coach-readiness-val'),
      volumeVal: document.getElementById('coach-volume-val'),
      e1rmVal: document.getElementById('coach-e1rm-val'),

      // Sub-Navigation & Bonding Modal
      btnPanelLive: document.getElementById('btn-coach-panel-live'),
      btnPanelHistory: document.getElementById('btn-coach-panel-history'),
      btnPanelPreparation: document.getElementById('btn-coach-panel-preparation'),
      panelLive: document.getElementById('coach-live-panel'),
      panelHistory: document.getElementById('coach-athlete-history-panel'),
      panelPreparation: document.getElementById('coach-preparation-panel'),
      btnBondOpen: document.getElementById('btn-coach-bond-open'),
      btnBondClose: document.getElementById('btn-coach-bond-close'),
      bondModal: document.getElementById('coach-bond-modal'),
      bondPendingCount: document.getElementById('coach-bond-pending-count'),
      pairingCodeDisplay: document.getElementById('coach-pairing-code-display'),
      pairingTtl: document.getElementById('coach-pairing-ttl'),
      btnCopyCode: document.getElementById('btn-coach-copy-code'),
      btnRegenCode: document.getElementById('btn-coach-regen-code'),
      bondAthleteNameInput: document.getElementById('coach-bond-athlete-name'),
      bondAthleteRackInput: document.getElementById('coach-bond-athlete-rack'),
      btnBondManualAdd: document.getElementById('btn-coach-bond-manual-add'),
      bondPendingList: document.getElementById('coach-bond-pending-list'),
      bondedRosterList: document.getElementById('coach-bonded-roster-list'),

      // Squad Overview Grid
      kpiSummaryPill: document.getElementById('coach-kpi-summary-pill'),
      rosterFilters: document.getElementById('coach-roster-filters'),
      squadGrid: document.getElementById('coach-squad-grid'),

      // Active Set Live Monitor
      activeLiftBadge: document.getElementById('coach-active-lift-badge'),
      activeSetTitle: document.getElementById('coach-active-set-title'),
      activeSetMeta: document.getElementById('coach-active-set-meta'),
      liveZoneBadge: document.getElementById('coach-live-zone-badge'),
      liveMcv: document.getElementById('coach-live-mcv'),
      livePv: document.getElementById('coach-live-pv'),
      liveRom: document.getElementById('coach-live-rom'),
      liveVl: document.getElementById('coach-live-vl'),
      liveVlGauge: document.getElementById('coach-live-vl-gauge'),
      repsStream: document.getElementById('coach-live-reps-stream'),

      // Coach Focal Center (Requirement R2)
      barpathCard: document.getElementById('coach-barpath-card'),
      barpathCanvas: document.getElementById('coach-barpath-canvas'),
      btnBarpathMode: document.getElementById('coach-btn-barpath-mode'),
      devSummary: document.getElementById('coach-dev-summary'),
      btnBarpathReplay: document.getElementById('coach-btn-barpath-replay'),
      btnBarpathSpeed: document.getElementById('coach-btn-barpath-speed'),
      barpathScrubber: document.getElementById('coach-barpath-scrubber'),
      barpathRepPills: document.getElementById('coach-barpath-rep-pills'),
      rpePillCard: document.getElementById('coach-rpe-pill-card'),
      liveRpe: document.getElementById('coach-live-rpe'),
      liveRirPill: document.getElementById('coach-live-rir-pill'),
      rpeTierBadge: document.getElementById('coach-rpe-tier-badge'),
      rpeGaugeFill: document.getElementById('coach-rpe-gauge-fill'),
      rpeTargetPin: document.getElementById('coach-rpe-target-pin'),
      rpeSub: document.getElementById('coach-rpe-sub'),

      // Sets History Table
      setsTable: document.getElementById('coach-sets-table'),
      setsTableBody: document.getElementById('coach-sets-table-body'),
      setsCounter: document.getElementById('coach-sets-counter'),

      // Feedback Console
      feedbackConsole: document.getElementById('coach-feedback-console'),
      feedbackStatus: document.getElementById('coach-feedback-status'),
      customCueInput: document.getElementById('coach-custom-cue-input'),
      btnSendCustom: document.getElementById('btn-coach-send-custom'),
      loadPills: document.querySelectorAll('.coach-load-pill'),
      restPills: document.querySelectorAll('.coach-rest-pill'),
      cueChips: document.querySelectorAll('.coach-cue-chip'),

      // Athlete History Panel: Bento Quad
      compTotalVal: document.getElementById('coach-comp-total-val'),
      compBreakdown: document.getElementById('coach-comp-breakdown'),
      compMeta: document.getElementById('coach-comp-meta'),
      btnEditComp: document.getElementById('btn-coach-edit-comp'),
      compEditDrawer: document.getElementById('coach-comp-edit-drawer'),
      editCompSq: document.getElementById('coach-edit-comp-sq'),
      editCompBp: document.getElementById('coach-edit-comp-bp'),
      editCompDl: document.getElementById('coach-edit-comp-dl'),
      btnSaveComp: document.getElementById('btn-coach-save-comp'),

      gymTotalVal: document.getElementById('coach-gym-total-val'),
      gymBreakdown: document.getElementById('coach-gym-breakdown'),
      gymMeta: document.getElementById('coach-gym-meta'),
      btnGymModelAbs: document.getElementById('btn-coach-gym-model-abs'),
      btnGymModelE1rm: document.getElementById('btn-coach-gym-model-e1rm'),

      diffVal: document.getElementById('coach-diff-val'),
      diffBadge: document.getElementById('coach-diff-badge'),
      diffDirective: document.getElementById('coach-diff-directive'),

      weeklyRatioBadge: document.getElementById('coach-weekly-ratio-badge'),
      weeklyAdherenceVal: document.getElementById('coach-weekly-adherence-val'),
      weeklySegments: document.getElementById('coach-weekly-segments'),
      weeklyMeta: document.getElementById('coach-weekly-meta'),

      // Monthly Calendar & Day Inspector
      calSummaryStats: document.getElementById('coach-cal-summary-stats'),
      calMonthTitle: document.getElementById('coach-cal-month-title'),
      btnCalPrev: document.getElementById('btn-coach-cal-prev'),
      btnCalNext: document.getElementById('btn-coach-cal-next'),
      btnCalToday: document.getElementById('btn-coach-cal-today'),
      calendarGrid: document.getElementById('coach-calendar-grid'),

      dayInspector: document.getElementById('coach-day-inspector'),
      inspectorDate: document.getElementById('coach-inspector-date'),
      inspectorTitle: document.getElementById('coach-inspector-title'),
      inspectorMeta: document.getElementById('coach-inspector-meta'),
      btnExportDay: document.getElementById('btn-coach-export-day'),
      btnExportDayCsv: document.getElementById('btn-coach-export-day-csv'),
      cloudSyncPill: document.getElementById('coach-cloud-sync-pill'),
      inspectorSetsTbody: document.getElementById('coach-inspector-sets-tbody'),

      // Previous Workouts Feed
      prevWorkoutsCount: document.getElementById('coach-previous-workouts-count'),
      historyLiftFilters: document.getElementById('coach-history-lift-filters'),
      prevWorkoutsList: document.getElementById('coach-previous-workouts-list'),

      // Orbital Navigation, Motion & Radial Launcher
      coachShell: document.getElementById('coach-shell'),
      coachSidebar: document.getElementById('coach-sidebar'),
      coachSidebarToggle: document.getElementById('coach-sidebar-toggle'),
      coachNavButtons: typeof document.querySelectorAll === 'function' ? document.querySelectorAll('[data-coach-nav]') : [],
      sidebarRestTime: document.getElementById('coach-sidebar-rest-time'),
      sidebarRestState: document.getElementById('coach-sidebar-rest-state'),
      sidebarActiveCount: document.getElementById('coach-sidebar-active-count'),
      sidebarRestingCount: document.getElementById('coach-sidebar-resting-count'),
      readinessRing: document.getElementById('coach-readiness-ring'),
      introOverlay: document.getElementById('coach-intro-overlay'),
      cursorGlow: document.getElementById('coach-cursor-glow'),
      squadOverview: document.getElementById('coach-squad-overview'),
      radialFab: document.getElementById('eros-radial-fab'),
      radialItems: document.getElementById('eros-radial-items'),
      radialTrigger: document.getElementById('eros-radial-fab-trigger'),
      radialCustomizerModal: document.getElementById('eros-radial-customizer-modal')
    };
  }

  // ── Safe Helpers ──
  function getSafeActiveWorkout() {
    let base = null;
    if (typeof window !== 'undefined' && window.activeWorkout) {
      base = window.activeWorkout;
    } else if (typeof activeWorkout !== 'undefined' && activeWorkout) {
      base = activeWorkout;
    } else if (typeof workouts !== 'undefined' && Array.isArray(workouts) && workouts.length > 0) {
      base = workouts[0];
    } else {
      try {
        const stored = localStorage.getItem('vbt_workouts_v1');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            base = parsed[0];
          }
        }
      } catch (_) {}
    }

    const activeAthId = currentAthlete ? currentAthlete.id : 'ath_01';
    const matchingRemote = remoteCompletedSets.filter(s => (s.athleteId || 'ath_01') === activeAthId);
    if (!base) {
      if (matchingRemote.length === 0) return null;
      return {
        id: 'ws_remote_live',
        startTime: matchingRemote[0].timestamp || Date.now(),
        sets: matchingRemote.slice()
      };
    }

    if (matchingRemote.length === 0) return base;
    const baseSets = Array.isArray(base.sets) ? base.sets.slice() : [];
    const seen = new Set(baseSets.map(s => s && s.setId).filter(Boolean));
    matchingRemote.forEach(rs => {
      if (rs && (!rs.setId || !seen.has(rs.setId))) {
        baseSets.push(rs);
        if (rs.setId) seen.add(rs.setId);
      }
    });
    return { ...base, sets: baseSets };
  }

  function getSafeActiveSet() {
    if (typeof window !== 'undefined' && window.activeSet) {
      return window.activeSet;
    }
    if (typeof activeSet !== 'undefined' && activeSet) {
      return activeSet;
    }
    return null;
  }

  function getSafeWorkingWeight() {
    if (typeof window !== 'undefined' && typeof window.currentWorkingWeight === 'number' && !isNaN(window.currentWorkingWeight)) {
      return window.currentWorkingWeight;
    }
    if (typeof currentWorkingWeight !== 'undefined' && !isNaN(currentWorkingWeight)) {
      return currentWorkingWeight;
    }
    const safeSet = getSafeActiveSet();
    if (safeSet && safeSet.weight) {
      return safeSet.weight;
    }
    return 0.0;
  }

  // ── Historical Workout Logbook Builder for Each Bonded Athlete ──
  function getAthleteWorkouts(athleteId) {
    const targetId = athleteId || (currentAthlete ? currentAthlete.id : 'ath_01');
    const results = [];
    const seenDates = new Set();

    // 1. If inspecting primary local athlete (ath_01), merge local workouts from vbt_workouts_v1
    if (targetId === 'ath_01') {
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('vbt_workouts_v1') : null;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((w, idx) => {
              if (!w) return;
              const setsArr = Array.isArray(w.sets) ? w.sets : [];
              const dObj = w.startTime ? new Date(w.startTime) : (w.date ? new Date(w.date) : new Date());
              const dStr = !isNaN(dObj.getTime()) ? formatIsoDate(dObj) : formatIsoDate(new Date());
              const liftsInSets = setsArr.map(s => s.lift || w.lift || 'Deadlift');
              const canonicalName = formatCanonicalWorkoutName(liftsInSets.length > 0 ? liftsInSets : [w.lift || 'Deadlift']);
              let vol = 0;
              let velSum = 0;
              let velCnt = 0;
              setsArr.forEach(s => {
                const repsLen = Array.isArray(s.reps) ? s.reps.length : (Number(s.repsCount) || 0);
                vol += (Number(s.weight) || 0) * repsLen;
                if (s.avgVelocity) {
                  velSum += Number(s.avgVelocity);
                  velCnt++;
                }
              });
              seenDates.add(dStr);
              results.push({
                id: w.id || `ws_local_${idx}`,
                athleteId: 'ath_01',
                date: dStr,
                name: canonicalName,
                totalVolumeKg: vol,
                totalSets: setsArr.length,
                avgVelocity: velCnt > 0 ? (velSum / velCnt) : 0,
                sets: setsArr.map((s, sIdx) => ({
                  setId: s.setId || '',
                  plannedWorkoutId: s.plannedWorkoutId || s.planned_workout_id || '',
                  plannedSlotId: s.plannedSlotId || s.planned_slot_id || '',
                  isPr: Boolean(s.isPr || s.isPR || (s.setId && goldenPr.setIds.has(s.setId))),
                  isPR: Boolean(s.isPr || s.isPR || (s.setId && goldenPr.setIds.has(s.setId))),
                  setNumber: s.setNumber || (sIdx + 1),
                  rawLift: s.lift || w.lift || 'Deadlift',
                  lift: formatCanonicalLiftLabel(s.lift || w.lift || 'Deadlift'),
                  weight: Number(s.weight) || 0,
                  repsCount: Array.isArray(s.reps) ? s.reps.length : (Number(s.repsCount) || 0),
                  avgVelocity: Number(s.avgVelocity) || 0,
                  maxVelocity: Number(s.maxVelocity) || 0,
                  rom: Number(s.rom) || 0,
                  velocityLossPct: Number(s.velocityLossPct != null ? s.velocityLossPct : s.velocityLoss) || 0,
                  velocityLoss: Number(s.velocityLossPct != null ? s.velocityLossPct : s.velocityLoss) || 0,
                  rpe: Number(s.avgRpe != null ? s.avgRpe : s.rpe) || 0
                }))
              });
            });
          }
        }
      } catch (_) {}
    }

    // 2. Merge remote completed sets pushed over ErosSyncBus / Base44 Cloud for cross-device sessions
    const remoteForAthlete = remoteCompletedSets.filter(s => (s.athleteId || 'ath_01') === targetId);
    if (remoteForAthlete.length > 0) {
      const existingSetIds = new Set();
      results.forEach(w => (w.sets || []).forEach(s => { if (s && s.setId) existingSetIds.add(s.setId); }));

      remoteForAthlete.forEach((s, rIdx) => {
        if (s.setId && existingSetIds.has(s.setId)) return;
        const dObj = s.timestamp ? new Date(s.timestamp) : new Date();
        const dStr = !isNaN(dObj.getTime()) ? formatIsoDate(dObj) : formatIsoDate(new Date());
        let entry = results.find(w => w.date === dStr);
        if (!entry) {
          entry = {
            id: `ws_remote_${dStr}`,
            athleteId: targetId,
            date: dStr,
            name: formatCanonicalWorkoutName([s.lift || 'Deadlift']),
            totalVolumeKg: 0,
            totalSets: 0,
            avgVelocity: 0,
            sets: []
          };
          results.push(entry);
        }
        const repsLen = Array.isArray(s.reps) ? s.reps.length : (Number(s.repsCount) || 0);
        entry.sets.push({
          setId: s.setId || `remote_${rIdx}`,
          plannedWorkoutId: s.plannedWorkoutId || '',
          plannedSlotId: s.plannedSlotId || '',
          isPr: Boolean(s.isPr || s.isPR || (s.setId && goldenPr.setIds.has(s.setId))),
          isPR: Boolean(s.isPr || s.isPR || (s.setId && goldenPr.setIds.has(s.setId))),
          setNumber: s.setNumber || (entry.sets.length + 1),
          rawLift: s.lift || 'Deadlift',
          lift: formatCanonicalLiftLabel(s.lift || 'Deadlift'),
          weight: Number(s.weight) || 0,
          repsCount: repsLen,
          avgVelocity: Number(s.avgVelocity) || 0,
          maxVelocity: Number(s.maxVelocity) || 0,
          rom: Number(s.rom) || 0,
          velocityLossPct: Number(s.velocityLossPct != null ? s.velocityLossPct : s.velocityLoss) || 0,
          velocityLoss: Number(s.velocityLossPct != null ? s.velocityLossPct : s.velocityLoss) || 0,
          rpe: Number(s.avgRpe != null ? s.avgRpe : s.rpe) || 0
        });
        entry.name = formatCanonicalWorkoutName(entry.sets.map(st => st.rawLift || st.lift));
        entry.totalSets = entry.sets.length;
        entry.totalVolumeKg = entry.sets.reduce((acc, st) => acc + ((Number(st.weight) || 0) * (Number(st.repsCount) || 0)), 0);
        const velSets = entry.sets.filter(st => st.avgVelocity > 0);
        entry.avgVelocity = velSets.length > 0 ? velSets.reduce((acc, st) => acc + st.avgVelocity, 0) / velSets.length : 0;
      });
    }

    results.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return results;
  }

  function getMondayOfIsoWeek(refDate) {
    const d = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ── Initialization ──
  function init() {
    queryElements();
    loadPersistedBonds();
    generatePairingCode();

    try {
      if (typeof localStorage !== 'undefined') {
        const connRaw = localStorage.getItem('eros_athlete_coach_connection_v1');
        if (connRaw) {
          const conn = JSON.parse(connRaw);
          if (conn && conn.athleteName) {
            const ath = SQUAD_ATHLETES.find(a => a.id === (conn.athleteId || 'ath_01'));
            if (ath) {
              ath.name = conn.athleteName;
              ath.rack = conn.rackId || 'Rack 01';
            }
            if (elements.athleteSelect) {
              const opt = elements.athleteSelect.querySelector(`option[value="${conn.athleteId || 'ath_01'}"]`);
              if (opt) opt.textContent = `${conn.athleteName} (${conn.rackId || 'Rack 01'})`;
            }
          }
        }
      }
    } catch (_) {}

    // Mode Toggle Clicks & Long-Press Handling
    function startAthleteLongPress(e) {
      if (e && typeof e.button === 'number' && e.button !== 0) return;
      if (isCoachMode) return;
      athletePressStartTime = Date.now();
      if (elements.btnModeAthlete) elements.btnModeAthlete.classList.add('holding-longpress');
      if (athleteLongPressTimer) clearTimeout(athleteLongPressTimer);
      athleteLongPressTimer = setTimeout(() => {
        revealCoachOption();
        athleteLongPressTimer = null;
        if (elements.btnModeAthlete) elements.btnModeAthlete.classList.remove('holding-longpress');
      }, LONG_PRESS_DURATION_MS);
    }

    function cancelAthleteLongPress() {
      if (athleteLongPressTimer) {
        clearTimeout(athleteLongPressTimer);
        athleteLongPressTimer = null;
      }
      if (elements.btnModeAthlete) elements.btnModeAthlete.classList.remove('holding-longpress');
    }

    if (elements.btnModeAthlete && !elements.btnModeAthlete._coachBound) {
      elements.btnModeAthlete.addEventListener('click', () => {
        if (isCoachMode) switchMode('athlete');
      });
      elements.btnModeAthlete.addEventListener('touchstart', startAthleteLongPress, { passive: true });
      elements.btnModeAthlete.addEventListener('touchend', cancelAthleteLongPress, { passive: true });
      elements.btnModeAthlete.addEventListener('touchcancel', cancelAthleteLongPress, { passive: true });
      elements.btnModeAthlete.addEventListener('touchmove', cancelAthleteLongPress, { passive: true });
      elements.btnModeAthlete.addEventListener('mousedown', startAthleteLongPress);
      elements.btnModeAthlete.addEventListener('mouseup', cancelAthleteLongPress);
      elements.btnModeAthlete.addEventListener('mouseleave', cancelAthleteLongPress);
      elements.btnModeAthlete.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (!athleteLongPressTimer && !coachUnlocked) {
            startAthleteLongPress(e);
          }
        }
      });
      elements.btnModeAthlete.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          cancelAthleteLongPress();
        }
      });
      elements.btnModeAthlete._coachBound = true;
    }
    if (elements.btnModeCoach && !elements.btnModeCoach._coachBound) {
      elements.btnModeCoach.addEventListener('click', () => switchMode('coach'));
      elements.btnModeCoach._coachBound = true;
    }

    // Orientation Advisory Dismiss Handler
    const btnDismissOri = document.getElementById('btn-dismiss-orientation');
    if (btnDismissOri && !btnDismissOri._bound) {
      btnDismissOri.addEventListener('click', dismissCoachOrientationBanner);
      btnDismissOri._bound = true;
    }

    if (typeof window !== 'undefined' && !window._coachOrientationBound) {
      window.addEventListener('resize', () => {
        if (isCoachMode && (window.innerWidth > window.innerHeight || window.innerWidth >= 1024)) {
          dismissCoachOrientationBanner();
        }
      }, { passive: true });
      window._coachOrientationBound = true;
    }

    // Sub-Navigation Tabs (Live Panel vs Athlete History Panel)
    if (elements.btnPanelLive && !elements.btnPanelLive._coachBound) {
      elements.btnPanelLive.addEventListener('click', () => switchCoachPanel('live'));
      elements.btnPanelLive._coachBound = true;
    }
    if (elements.btnPanelHistory && !elements.btnPanelHistory._coachBound) {
      elements.btnPanelHistory.addEventListener('click', () => switchCoachPanel('history'));
      elements.btnPanelHistory._coachBound = true;
    }
    if (elements.btnPanelPreparation && !elements.btnPanelPreparation._coachBound) {
      elements.btnPanelPreparation.addEventListener('click', () => switchCoachPanel('preparation'));
      elements.btnPanelPreparation._coachBound = true;
    }
    initPreparationPanel();

    // Athlete Roster Dropdown
    if (elements.athleteSelect && !elements.athleteSelect._coachBound) {
      elements.athleteSelect.addEventListener('change', (e) => {
        selectAthleteById(e.target.value);
      });
      elements.athleteSelect._coachBound = true;
    }

    // Bonding Modal Controls
    initBondingHandlers();

    // Cloud Architecture Status Pill
    if (elements.cloudSyncPill && !elements.cloudSyncPill._coachBound) {
      elements.cloudSyncPill.addEventListener('click', () => {
        showFeedbackMessage('Eros Cloud Sync: Local bus active. PostgreSQL 15+ schemas ready in COACH_PORTAL_CLOUD_PLAN.md');
      });
      elements.cloudSyncPill._coachBound = true;
    }

    // Squad Roster Filter Pills
    initSquadFilterHandlers();

    // History & Calendar Controls
    initHistoryAndCalendarHandlers();

    // Feedback Controls
    initFeedbackHandlers();

    // Coach Bar Path & Replay Controls (Requirement R2)
    initCoachBarpathHandlers();

    // Subscribe to Event Bus
    bindSyncBusEvents();

    // Orbital Sidebar Toggle & Nav Links
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') {
        toggleCoachSidebar(true);
      }
    } catch (_) {}

    if (elements.coachSidebarToggle && !elements.coachSidebarToggle._coachBound) {
      elements.coachSidebarToggle.addEventListener('click', () => {
        toggleCoachSidebar();
      });
      elements.coachSidebarToggle._coachBound = true;
    }

    if (elements.coachNavButtons && typeof elements.coachNavButtons.forEach === 'function') {
      elements.coachNavButtons.forEach(btn => {
        if (btn && !btn._coachNavBound) {
          btn.addEventListener('click', () => {
            const targetSection = btn.getAttribute('data-coach-nav') || 'live';
            navigateCoachSection(targetSection);
          });
          btn._coachNavBound = true;
        }
      });
    }

    // Ambient Cursor Glow, Radial Action Menu, Movable Pills & Viewport Resize Safety
    initCoachCursorGlow();
    initRadialActionMenu();
    initMovableCoachPills();

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !window._coachViewportSafetyBound) {
      window.addEventListener('resize', () => {
        if (elements.bondModal && elements.bondModal.style && elements.bondModal.style.display === 'block') {
          const bondCard = elements.bondModal.querySelector ? elements.bondModal.querySelector('.coach-bond-card') : null;
          if (bondCard) applySmartOverflowProtection(bondCard, 12);
        }
        if (elements.radialCustomizerModal && elements.radialCustomizerModal.style && elements.radialCustomizerModal.style.display !== 'none') {
          applySmartOverflowProtection(elements.radialCustomizerModal, 12);
        }
        if (elements.radialFab) {
          clampRadialFabToViewport(elements.radialFab);
          if (isRadialOpen) positionRadialItems();
        }
        syncLivePanelGridColumns(elements.panelLive);
      }, { passive: true });
      window._coachViewportSafetyBound = true;
    }

    // Window storage listener for cross-tab sync
    if (typeof window !== 'undefined' && !window._coachStorageBound) {
      window.addEventListener('storage', (e) => {
        if (e.key === 'vbt_workouts_v1' || e.key === 'vbt_pr_data_v1' || e.key === BONDS_STORAGE_KEY || e.key === 'eros_athlete_biometrics_v1' || e.key === 'eros_pushed_prs_v1') {
          if (isCoachMode) {
            renderFullCoachDashboard();
          }
        }
      });

      // Listen to custom DOM events (fallback / intra-page)
      window.addEventListener('eros:set_started', (e) => handleSetStarted(e.detail || {}));
      window.addEventListener('eros:rep_recorded', (e) => handleRepRecorded(e.detail || {}));
      window.addEventListener('eros:set_completed', (e) => handleSetCompleted(e.detail || {}));
      window.addEventListener('eros:workout_updated', () => {
        if (isCoachMode) renderFullCoachDashboard();
      });
      window._coachStorageBound = true;
    }

    // URL query auto-entry: ?mode=coach (Requirement R3) & persisted portal state restoration
    let explicitQueryMode = null;
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const searchParams = new URLSearchParams(window.location.search);
        const queryMode = searchParams.get('mode');
        if (queryMode === 'coach' || queryMode === 'athlete') {
          explicitQueryMode = queryMode;
        }
      }
    } catch (_) {}

    const savedPanel = readPersistedState(COACH_PANEL_KEY);
    if (savedPanel === 'history' || savedPanel === 'live' || savedPanel === 'preparation') {
      activeCoachPanel = savedPanel;
    }
    const savedSection = readPersistedState(COACH_SECTION_KEY);

    if (explicitQueryMode === 'coach') {
      revealCoachOption();
      switchMode('coach');
      if (activeCoachPanel === 'history' || activeCoachPanel === 'preparation') {
        switchCoachPanel(activeCoachPanel, true);
      } else if (savedSection && savedSection !== 'bonds') {
        updateCoachNavActiveState(savedSection);
      }
    } else if (explicitQueryMode === 'athlete') {
      if (isCoachMode) switchMode('athlete');
    } else {
      const savedMode = readPersistedState(PORTAL_MODE_KEY);
      if (savedMode === 'coach') {
        revealCoachOption();
        switchMode('coach');
        if (activeCoachPanel === 'history' || activeCoachPanel === 'preparation') {
          switchCoachPanel(activeCoachPanel, true);
        } else if (savedSection && savedSection !== 'bonds') {
          updateCoachNavActiveState(savedSection);
        }
      }
    }

    // Global & Laptop Keyboard Shortcuts (Requirement R3)
    if (typeof document !== 'undefined' && !document._coachKeyboardShortcutsBound) {
      document.addEventListener('keydown', (e) => {
        // 1. Entry Shortcut: Ctrl+Shift+C / Cmd+Shift+C (global, works from athlete or coach mode)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
          e.preventDefault();
          if (!isCoachMode) {
            revealCoachOption();
            switchMode('coach');
          } else {
            switchMode('athlete');
          }
          return;
        }

        // 2. In-Coach Telemetry Shortcuts: Only active in body.portal-coach
        if (!document.body || !document.body.classList.contains('portal-coach')) {
          return;
        }

        // Guard: ignore if typing in input, textarea, select, or editable element
        const activeEl = document.activeElement;
        if (activeEl) {
          const tag = (activeEl.tagName || '').toUpperCase();
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
          if (activeEl.isContentEditable || activeEl.getAttribute('contenteditable') === 'true') return;
        }

        // Ignore if modifier keys are pressed for telemetry shortcuts
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // R: Replay bar path
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          const replayBtn = document.getElementById('coach-btn-barpath-replay');
          if (replayBtn) replayBtn.click();
          return;
        }

        // M: Toggle PATH / VEL mode
        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          const modeBtn = document.getElementById('coach-btn-barpath-mode');
          if (modeBtn) modeBtn.click();
          return;
        }

        // [: Step previous rep
        if (e.key === '[') {
          e.preventDefault();
          stepCoachRepSelection(-1);
          return;
        }

        // ]: Step next rep
        if (e.key === ']') {
          e.preventDefault();
          stepCoachRepSelection(1);
          return;
        }
      });
      document._coachKeyboardShortcutsBound = true;
    }

    // Initial check
    if (document.body && document.body.classList && document.body.classList.contains('portal-coach')) {
      switchMode('coach');
    }
  }

  function selectAthleteById(athleteId) {
    const sel = SQUAD_ATHLETES.find(a => a.id === athleteId);
    if (!sel) return;
    currentAthlete = sel;
    if (elements.athleteSelect) {
      elements.athleteSelect.value = sel.id;
    }
    renderFullCoachDashboard();
    showFeedbackMessage(`Switched active supervision to ${sel.name} (${sel.rack})`);
  }

  // ── Live Rest Ticker (Increments resting timers for live supervision) ──
  function startRestTicker() {
    if (restTickerTimer) clearInterval(restTickerTimer);
    restTickerTimer = setInterval(() => {
      if (!isCoachMode) return;
      let hasResting = false;
      SQUAD_ATHLETES.forEach(ath => {
        if (ath.status === 'resting') {
          ath.restSeconds = (ath.restSeconds || 0) + 1;
          hasResting = true;
        }
      });
      if (hasResting && activeCoachPanel === 'live' && elements.squadGrid) {
        elements.squadGrid.querySelectorAll('.coach-squad-status-pill.status-resting').forEach(pill => {
          const card = pill.closest('[data-squad-athlete-id]');
          if (!card) return;
          const athId = card.getAttribute('data-squad-athlete-id');
          const ath = SQUAD_ATHLETES.find(a => a.id === athId);
          if (ath && ath.status === 'resting') {
            const m = String(Math.floor((ath.restSeconds || 0) / 60)).padStart(2, '0');
            const s = String((ath.restSeconds || 0) % 60).padStart(2, '0');
            pill.textContent = `Resting (${m}:${s})`;
          }
        });
      }
      updateCoachSidebarTicker();
    }, 1000);
    if (restTickerTimer && typeof restTickerTimer.unref === 'function') {
      restTickerTimer.unref();
    }
  }

  function stopRestTicker() {
    if (restTickerTimer) {
      clearInterval(restTickerTimer);
      restTickerTimer = null;
    }
  }

  // ── Mode Switcher (Seamless In-Page Toggle) ──
  function switchMode(mode) {
    isCoachMode = (mode === 'coach');
    writePersistedState(PORTAL_MODE_KEY, isCoachMode ? 'coach' : 'athlete');

    // Trigger subtle UI tick / entrance audio if available
    if (typeof SoundFX !== 'undefined') {
      if (isCoachMode && typeof SoundFX.playCoachPanelOpen === 'function') {
        try { SoundFX.playCoachPanelOpen(); } catch (_) {}
      } else if (typeof SoundFX.playNavTick === 'function') {
        try { SoundFX.playNavTick(); } catch (_) {}
      }
    }
    if (typeof HapticsFX !== 'undefined' && typeof HapticsFX.vibrate === 'function') {
      try { HapticsFX.vibrate([20]); } catch (_) {}
    }

    if (!elements.viewCoach) queryElements();

    if (isCoachMode) {
      hookAppLifecycle();
      document.body.classList.add('portal-coach');
      revealCoachOption();
      if (elements.btnModeCoach) {
        elements.btnModeCoach.classList.add('active');
        elements.btnModeCoach.setAttribute('aria-checked', 'true');
      }
      if (elements.btnModeAthlete) {
        elements.btnModeAthlete.classList.remove('active');
        elements.btnModeAthlete.setAttribute('aria-checked', 'false');
      }
      if (elements.viewCoach) {
        elements.viewCoach.style.display = 'flex';
      }
      showCoachOrientationAdvisory();
      runCoachIntroOverlay();
      startCoachCursorGlowLoop();
      startRestTicker();
      if (activeCoachPanel === 'history' || activeCoachPanel === 'preparation') {
        switchCoachPanel(activeCoachPanel, true);
      } else {
        renderFullCoachDashboard();
      }
      initMovableCoachPills();
      if (activeCoachPanel === 'live') {
        syncLivePanelGridColumns(elements.panelLive);
      }
      updateCoachSidebarTicker();
      renderRadialMenuItems();
    } else {
      stopRestTicker();
      stopCoachCursorGlowLoop();
      document.body.classList.remove('portal-coach');
      if (elements.btnModeAthlete) {
        elements.btnModeAthlete.classList.add('active');
        elements.btnModeAthlete.setAttribute('aria-checked', 'true');
      }
      if (elements.btnModeCoach) {
        elements.btnModeCoach.classList.remove('active');
        elements.btnModeCoach.setAttribute('aria-checked', 'false');
      }
      if (elements.viewCoach) {
        elements.viewCoach.style.display = 'none';
      }
      if (typeof document !== 'undefined') {
        const dockEl = document.getElementById('floating-set-dock');
        const liveSec = document.getElementById('tab-live');
        if (dockEl) {
          dockEl.style.display = (!liveSec || liveSec.classList.contains('active-section')) ? 'flex' : 'none';
        }
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            if (typeof window !== 'undefined' && typeof window.refreshLiveStageCanvases === 'function') {
              window.refreshLiveStageCanvases();
            }
          });
        }
      }
      renderRadialMenuItems();
    }
  }

  // ── Sub-Navigation Switcher: Live Panel vs Athlete History vs Preparation ──
  /** Switches the active Coach panel between live, history and preparation. */
  function switchCoachPanel(panelName, skipPersist) {
    activeCoachPanel = (panelName === 'history' || panelName === 'preparation') ? panelName : 'live';
    if (!skipPersist) {
      writePersistedState(COACH_PANEL_KEY, activeCoachPanel);
      writePersistedState(COACH_SECTION_KEY, activeCoachPanel);
    }
    if (typeof SoundFX !== 'undefined') {
      if (typeof SoundFX.playCoachPanelSwitch === 'function') {
        try { SoundFX.playCoachPanelSwitch(); } catch (_) {}
      } else if (typeof SoundFX.playNavTick === 'function') {
        try { SoundFX.playNavTick(); } catch (_) {}
      }
    }
    if (!elements.panelLive) queryElements();

    const tabs = [
      ['live', elements.btnPanelLive],
      ['history', elements.btnPanelHistory],
      ['preparation', elements.btnPanelPreparation]
    ];
    tabs.forEach(([key, btn]) => {
      if (!btn) return;
      const active = key === activeCoachPanel;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (elements.panelLive) elements.panelLive.style.display = activeCoachPanel === 'live' ? '' : 'none';
    if (elements.panelHistory) elements.panelHistory.style.display = activeCoachPanel === 'history' ? '' : 'none';
    setPrepPanelHidden(activeCoachPanel !== 'preparation');

    if (activeCoachPanel === 'history') {
      updateCoachNavActiveState('history');
      renderAthleteHistoryPanel();
    } else if (activeCoachPanel === 'preparation') {
      updateCoachNavActiveState('preparation');
      renderPreparationPanel();
    } else {
      updateCoachNavActiveState('live');
      renderSquadOverview();
      renderActiveSetFromState();
      renderSetsHistoryTable();
      syncLivePanelGridColumns(elements.panelLive);
    }
  }

  // ── Manual Coach-Athlete Bonding (Requirement R2) ──
  function generatePairingCode() {
    let code = '';
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const randBytes = new Uint8Array(4);
      crypto.getRandomValues(randBytes);
      for (let i = 0; i < 4; i++) {
        code += CROCKFORD_ALPHABET[randBytes[i] % CROCKFORD_ALPHABET.length];
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const randIdx = Math.floor(Math.random() * CROCKFORD_ALPHABET.length);
        code += CROCKFORD_ALPHABET[randIdx];
      }
    }
    currentPairingCode = `EROS-${code}`;
    pairingSecondsRemaining = 900;
    if (elements.pairingCodeDisplay) {
      elements.pairingCodeDisplay.textContent = currentPairingCode;
    }
    updatePairingTtlDisplay();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('eros:coach_pairing_code', { detail: { code: currentPairingCode } }));
    }
    return currentPairingCode;
  }

  function updatePairingTtlDisplay() {
    if (!elements.pairingTtl) return;
    const mins = String(Math.floor(pairingSecondsRemaining / 60)).padStart(2, '0');
    const secs = String(pairingSecondsRemaining % 60).padStart(2, '0');
    elements.pairingTtl.textContent = `TTL: ${mins}:${secs}`;
  }

  function openBondModal() {
    if (!elements.bondModal) queryElements();
    if (!elements.bondModal) return;
    if (!currentPairingCode) generatePairingCode();
    elements.bondModal.style.display = 'block';
    const bondCard = elements.bondModal.querySelector ? elements.bondModal.querySelector('.coach-bond-card') : null;
    if (bondCard) applySmartOverflowProtection(bondCard, 12);
    renderBondModalLists();

    if (pairingTtlTimer) clearInterval(pairingTtlTimer);
    pairingTtlTimer = setInterval(() => {
      if (pairingSecondsRemaining > 0) {
        pairingSecondsRemaining--;
        updatePairingTtlDisplay();
      } else {
        generatePairingCode();
      }
    }, 1000);
    if (pairingTtlTimer && typeof pairingTtlTimer.unref === 'function') {
      pairingTtlTimer.unref();
    }
  }

  function closeBondModal() {
    if (!elements.bondModal) return;
    elements.bondModal.style.display = 'none';
    if (pairingTtlTimer) {
      clearInterval(pairingTtlTimer);
      pairingTtlTimer = null;
    }
  }

  function loadPersistedBonds() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BONDS_STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.athletes)) {
          let dirty = false;
          const sanitized = parsed.athletes.filter(ath => {
            if (!ath || typeof ath !== 'object') {
              dirty = true;
              return false;
            }
            const cleanName = String(ath.name || '').trim();
            if (FAKE_ATHLETE_NAME_REGEX.test(cleanName)) {
              dirty = true;
              return false;
            }
            return true;
          }).map(ath => {
            if (ath.status !== 'idle' || (ath.restSeconds || 0) !== 0) {
              dirty = true;
            }
            return {
              ...ath,
              status: 'idle',
              restSeconds: 0
            };
          });

          if (sanitized.length > 0) {
            SQUAD_ATHLETES = sanitized;
            currentAthlete = SQUAD_ATHLETES[0];
          } else {
            SQUAD_ATHLETES = DEFAULT_SQUAD_ATHLETES.map(a => ({
              ...a,
              compPrs: { ...a.compPrs },
              gymPrs: { ...a.gymPrs },
              e1rmPrs: { ...a.e1rmPrs }
            }));
            currentAthlete = SQUAD_ATHLETES[0];
          }

          if (dirty && typeof localStorage !== 'undefined') {
            localStorage.setItem(BONDS_STORAGE_KEY, JSON.stringify({
              athletes: sanitized.length > 0 ? SQUAD_ATHLETES : [],
              updatedAt: Date.now()
            }));
          }
        }
      }
    } catch (_) {}
  }

  function savePersistedBonds() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(BONDS_STORAGE_KEY, JSON.stringify({
          athletes: SQUAD_ATHLETES,
          updatedAt: Date.now()
        }));
      }
    } catch (_) {}
  }

  function syncAthleteSelectOptions() {
    if (!elements.athleteSelect) return;
    elements.athleteSelect.innerHTML = SQUAD_ATHLETES.map(a =>
      `<option value="${escapeHtml(a.id)}" ${currentAthlete && a.id === currentAthlete.id ? 'selected' : ''}>${escapeHtml(a.name)} (${escapeHtml(a.rack)})</option>`
    ).join('');
  }

  function approvePendingBond(reqId) {
    const idx = pendingBondRequests.findIndex(r => r.id === reqId);
    if (idx === -1) return null;
    const req = pendingBondRequests.splice(idx, 1)[0];
    const newAthlete = {
      id: `ath_${Date.now()}`,
      name: req.name,
      rack: req.rack || `Rack 0${SQUAD_ATHLETES.length + 1}`,
      weightClass: req.weightClass || '-93 kg',
      bodyweightKg: 85.0,
      gender: 'unspecified',
      status: 'idle',
      restSeconds: 0,
      currentLift: 'Main deadlift',
      currentLoadKg: 0.0,
      currentMcv: 0.0,
      currentPv: 0.0,
      currentRomCm: 0.0,
      currentVlPct: 0.0,
      readiness: '100% [Optimal]',
      e1rm: '—',
      volume: '0 kg',
      compPrs: req.compPrs || { squat: 0, bench: 0, deadlift: 0 },
      gymPrs: req.gymPrs || { squat: 0, bench: 0, deadlift: 0 },
      e1rmPrs: req.e1rmPrs || { squat: 0, bench: 0, deadlift: 0 },
      bondStatus: 'active',
      bondedSince: formatIsoDate(new Date())
    };
    SQUAD_ATHLETES.push(newAthlete);
    savePersistedBonds();
    syncAthleteSelectOptions();
    renderBondModalLists();
    renderFullCoachDashboard();

    if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
      window.ErosSyncBus.emit('bond:approved', {
        bondId: `bond_${newAthlete.id}`,
        athleteId: newAthlete.id,
        athleteName: newAthlete.name,
        timestamp: Date.now()
      });
    }
    showFeedbackMessage(`Approved dual-consent bond with ${newAthlete.name} (${newAthlete.rack})`);
    return newAthlete;
  }

  function declinePendingBond(reqId) {
    const idx = pendingBondRequests.findIndex(r => r.id === reqId);
    if (idx === -1) return;
    const removed = pendingBondRequests.splice(idx, 1)[0];
    renderBondModalLists();
    showFeedbackMessage(`Declined bond request from ${removed.name}`);
  }

  function manualLinkAthlete(nameStr, rackStr) {
    const cleanName = String(nameStr || '').trim();
    if (!cleanName) return null;
    const cleanRack = String(rackStr || `Rack 0${SQUAD_ATHLETES.length + 1}`).trim();
    const newAthlete = {
      id: `ath_manual_${Date.now()}`,
      name: cleanName,
      rack: cleanRack,
      weightClass: '-93 kg',
      bodyweightKg: 85.0,
      gender: 'unspecified',
      status: 'idle',
      restSeconds: 0,
      currentLift: 'Main deadlift',
      currentLoadKg: 0.0,
      currentMcv: 0.0,
      currentPv: 0.0,
      currentRomCm: 0.0,
      currentVlPct: 0.0,
      readiness: '100% [Optimal]',
      e1rm: '—',
      volume: '0 kg',
      compPrs: { squat: 0, bench: 0, deadlift: 0 },
      gymPrs: { squat: 0, bench: 0, deadlift: 0 },
      e1rmPrs: { squat: 0, bench: 0, deadlift: 0 },
      bondStatus: 'active',
      bondedSince: formatIsoDate(new Date())
    };
    SQUAD_ATHLETES.push(newAthlete);
    currentAthlete = newAthlete;
    savePersistedBonds();
    syncAthleteSelectOptions();
    renderBondModalLists();
    renderFullCoachDashboard();

    if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
      window.ErosSyncBus.emit('bond:approved', {
        bondId: `bond_${newAthlete.id}`,
        athleteId: newAthlete.id,
        athleteName: newAthlete.name,
        timestamp: Date.now()
      });
    }
    showFeedbackMessage(`Manually linked athlete ${newAthlete.name} (${newAthlete.rack})`);
    return newAthlete;
  }

  function revokeAthleteBond(athleteId) {
    if (SQUAD_ATHLETES.length <= 1) {
      showFeedbackMessage('At least one active athlete must remain in the roster');
      return false;
    }
    const idx = SQUAD_ATHLETES.findIndex(a => a.id === athleteId);
    if (idx === -1) return false;
    const removed = SQUAD_ATHLETES.splice(idx, 1)[0];
    if (currentAthlete && currentAthlete.id === athleteId) {
      currentAthlete = SQUAD_ATHLETES[0];
    }
    savePersistedBonds();
    syncAthleteSelectOptions();
    renderBondModalLists();
    renderFullCoachDashboard();

    if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
      window.ErosSyncBus.emit('bond:revoked', {
        athleteId: removed.id,
        athleteName: removed.name,
        timestamp: Date.now()
      });
    }
    showFeedbackMessage(`Revoked training bond with ${removed.name}. Access terminated.`);
    return true;
  }

  function renderBondModalLists() {
    if (elements.bondPendingCount) {
      elements.bondPendingCount.textContent = String(pendingBondRequests.length);
      elements.bondPendingCount.style.display = pendingBondRequests.length > 0 ? 'inline-flex' : 'none';
    }

    if (elements.bondPendingList) {
      if (pendingBondRequests.length === 0) {
        elements.bondPendingList.innerHTML = '<div class="coach-empty-stream-msg">No pending pairing requests.</div>';
      } else {
        elements.bondPendingList.innerHTML = pendingBondRequests.map(req => `
          <div class="coach-bond-item" data-req-id="${escapeHtml(req.id)}">
            <div class="coach-bond-item-info">
              <span class="coach-bond-item-name">${escapeHtml(req.name)} (${escapeHtml(req.weightClass)})</span>
              <span class="coach-bond-item-meta font-mono">Code: ${escapeHtml(req.codeEntered)} • ${escapeHtml(req.rack)}</span>
            </div>
            <div class="coach-pairing-actions">
              <button type="button" class="coach-sm-btn" data-decline-req="${escapeHtml(req.id)}" aria-label="Decline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span class="sr-only">Decline</span></button>
              <button type="button" class="coach-sm-btn accent" data-approve-req="${escapeHtml(req.id)}" aria-label="Approve Bond"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg><span class="sr-only">Approve Bond</span></button>
            </div>
          </div>
        `).join('');

        elements.bondPendingList.querySelectorAll('[data-approve-req]').forEach(btn => {
          btn.addEventListener('click', () => approvePendingBond(btn.getAttribute('data-approve-req')));
        });
        elements.bondPendingList.querySelectorAll('[data-decline-req]').forEach(btn => {
          btn.addEventListener('click', () => declinePendingBond(btn.getAttribute('data-decline-req')));
        });
      }
    }

    if (elements.bondedRosterList) {
      elements.bondedRosterList.innerHTML = SQUAD_ATHLETES.map(ath => `
        <div class="coach-bond-item" data-bonded-id="${escapeHtml(ath.id)}">
          <div class="coach-bond-item-info">
            <span class="coach-bond-item-name">${escapeHtml(ath.name)} (${escapeHtml(ath.rack)})</span>
            <span class="coach-bond-item-meta font-mono">Active Bond • Live &amp; History Permitted</span>
          </div>
          <div class="coach-pairing-actions">
            <button type="button" class="coach-sm-btn danger" data-revoke-id="${escapeHtml(ath.id)}" aria-label="Revoke"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></svg><span class="sr-only">Revoke</span></button>
          </div>
        </div>
      `).join('');

      elements.bondedRosterList.querySelectorAll('[data-revoke-id]').forEach(btn => {
        btn.addEventListener('click', () => revokeAthleteBond(btn.getAttribute('data-revoke-id')));
      });
    }
  }

  function initBondingHandlers() {
    if (elements.btnBondOpen && !elements.btnBondOpen._coachBound) {
      elements.btnBondOpen.addEventListener('click', () => {
        if (elements.bondModal && elements.bondModal.style.display === 'block') {
          closeBondModal();
        } else {
          openBondModal();
        }
      });
      elements.btnBondOpen._coachBound = true;
    }
    if (elements.btnBondClose && !elements.btnBondClose._coachBound) {
      elements.btnBondClose.addEventListener('click', closeBondModal);
      elements.btnBondClose._coachBound = true;
    }
    if (elements.btnRegenCode && !elements.btnRegenCode._coachBound) {
      elements.btnRegenCode.addEventListener('click', () => {
        const c = generatePairingCode();
        showFeedbackMessage(`Generated new 15m pairing code: ${c}`);
      });
      elements.btnRegenCode._coachBound = true;
    }
    if (elements.btnCopyCode && !elements.btnCopyCode._coachBound) {
      elements.btnCopyCode.addEventListener('click', () => {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try { navigator.clipboard.writeText(currentPairingCode); } catch (_) {}
        }
        showFeedbackMessage(`Copied pairing code ${currentPairingCode} to clipboard`);
      });
      elements.btnCopyCode._coachBound = true;
    }
    if (elements.btnBondManualAdd && !elements.btnBondManualAdd._coachBound) {
      elements.btnBondManualAdd.addEventListener('click', () => {
        const nameVal = elements.bondAthleteNameInput ? elements.bondAthleteNameInput.value : '';
        const rackVal = elements.bondAthleteRackInput ? elements.bondAthleteRackInput.value : '';
        if (manualLinkAthlete(nameVal, rackVal)) {
          if (elements.bondAthleteNameInput) elements.bondAthleteNameInput.value = '';
        }
      });
      elements.btnBondManualAdd._coachBound = true;
    }
    if (elements.bondModal && !elements.bondModal._backdropBound) {
      elements.bondModal.addEventListener('click', (e) => {
        if (e.target === elements.bondModal) {
          closeBondModal();
        }
      });
      elements.bondModal._backdropBound = true;
    }
    if (typeof document !== 'undefined' && !document._coachBondKeyBound) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.bondModal && elements.bondModal.style.display === 'block') {
          closeBondModal();
        }
      });
      document._coachBondKeyBound = true;
    }
    renderBondModalLists();
  }

  // ── Squad Roster Filter & Overview Grid (Requirement R3) ──
  function initSquadFilterHandlers() {
    if (!elements.rosterFilters || elements.rosterFilters._coachBound) return;
    const buttons = elements.rosterFilters.querySelectorAll('[data-filter]');
    buttons.forEach(btn => {
      if (typeof btn.setAttribute === 'function' && !btn.getAttribute('data-prep-tooltip-key')) {
        btn.setAttribute('data-prep-tooltip-key', 'coach_filter_pill');
      }
      btn.addEventListener('click', () => {
        activeRosterFilter = btn.getAttribute('data-filter') || 'all';
        buttons.forEach(b => b.classList.toggle('active', b === btn));
        renderSquadOverview();
      });
    });
    elements.rosterFilters._coachBound = true;
  }

  function renderSquadOverview() {
    if (!elements.squadGrid) queryElements();
    if (!elements.squadGrid) return;

    const liftingCount = SQUAD_ATHLETES.filter(a => a.status === 'lifting').length;
    const alertCount = SQUAD_ATHLETES.filter(a => (a.currentVlPct || 0) >= 20.0).length;

    if (elements.kpiSummaryPill) {
      elements.kpiSummaryPill.textContent = `${SQUAD_ATHLETES.length} Connected • ${liftingCount} Lifting • ${alertCount} Fatigue Alerts`;
    }
    updateCoachSidebarTicker();

    if (SQUAD_ATHLETES.length === 0) {
      elements.squadGrid.innerHTML = '<div class="coach-empty-stream-msg">No bonded athletes connected.</div>';
      return;
    }

    const filtered = SQUAD_ATHLETES.filter(a => {
      if (activeRosterFilter === 'all') return true;
      return a.status === activeRosterFilter;
    });

    if (filtered.length === 0) {
      elements.squadGrid.innerHTML = `<div class="coach-empty-stream-msg">No bonded athletes match filter "${escapeHtml(activeRosterFilter)}".</div>`;
      return;
    }

    elements.squadGrid.innerHTML = filtered.map(ath => {
      const isSelected = currentAthlete && ath.id === currentAthlete.id;
      const zone = classifyBryanMannZone(ath.currentMcv, ath.currentLift);
      const liftBadgeClass = /squat/i.test(ath.currentLift)
        ? 'lift-squat'
        : (/bench/i.test(ath.currentLift) ? 'lift-bench' : 'lift-deadlift');
      const restSecs = ath.restSeconds || 0;
      const restMinsStr = String(Math.floor(restSecs / 60)).padStart(2, '0');
      const restSecsStr = String(restSecs % 60).padStart(2, '0');
      const statusLabel = ath.status === 'lifting'
        ? 'Live with Eros'
        : (ath.status === 'resting' ? `Resting (${restMinsStr}:${restSecsStr})` : 'Idle');
      const statusClass = ath.status === 'lifting'
        ? ''
        : (ath.status === 'resting' ? 'status-resting' : 'status-idle');
      const vl = Math.min(100, Math.max(0, Number(ath.currentVlPct) || 0));
      const vlBarClass = vl >= 20 ? 'cutoff' : (vl >= 15 ? 'warning' : '');

      return `
        <div class="coach-squad-athlete-card ${isSelected ? 'selected' : ''}" data-squad-athlete-id="${escapeHtml(ath.id)}" data-prep-tooltip-key="coach_squad_card" role="button" tabindex="0" aria-label="Supervise ${escapeHtml(ath.name)} on ${escapeHtml(ath.rack)}">
          <div class="coach-squad-card-hdr">
            <div>
              <div class="coach-squad-card-name">${escapeHtml(ath.name)}</div>
              <div class="coach-squad-card-rack">${escapeHtml(ath.rack)} • ${escapeHtml(ath.weightClass || '-93 kg')}</div>
            </div>
            <span class="coach-squad-status-pill ${statusClass}">${statusLabel}</span>
          </div>
          <div class="coach-squad-card-hdr">
            <span class="coach-lift-badge ${liftBadgeClass}">${escapeHtml(formatDisplayLiftName(ath.currentLift))}</span>
            <span class="coach-stat-label font-mono">${(Number(ath.currentLoadKg) || 0).toFixed(1)} kg</span>
          </div>
          <div class="coach-squad-card-metrics">
            <div>
              <span class="coach-metric-label">MCV</span>
              <div class="coach-squad-mcv">${(Number(ath.currentMcv) || 0).toFixed(2)} m/s</div>
            </div>
            <span class="coach-zone-badge ${zone.css} font-mono">${zone.label}</span>
          </div>
          <div class="coach-vl-gauge-container">
            <div class="coach-vl-bar">
              <div class="coach-vl-bar-fill ${vlBarClass}" style="width: ${vl}%;"></div>
            </div>
            <div class="coach-metric-footer font-mono">
              <span>V-Loss: ${vl.toFixed(1)}%</span>
              <span>Max: 20.0%</span>
            </div>
          </div>
          <div class="coach-squad-card-actions">
            <button type="button" class="coach-squad-action-btn focus-btn" data-action="focus" data-athlete-id="${escapeHtml(ath.id)}" aria-label="Focus ${escapeHtml(ath.name)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg><span class="sr-only">Focus</span></button>
          </div>
        </div>
      `;
    }).join('');

    elements.squadGrid.querySelectorAll('.coach-squad-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const athId = btn.getAttribute('data-athlete-id');
        const action = btn.getAttribute('data-action');
        if (action === 'focus') {
          selectAthleteById(athId);
        }
      });
    });

    elements.squadGrid.querySelectorAll('[data-squad-athlete-id]').forEach(card => {
      card.addEventListener('click', () => {
        selectAthleteById(card.getAttribute('data-squad-athlete-id'));
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectAthleteById(card.getAttribute('data-squad-athlete-id'));
        }
      });
    });
  }

  // ── Athlete History Panel, Totals, Weekly Adherence & Monthly Calendar (Requirement R4) ──
  function initHistoryAndCalendarHandlers() {
    if (elements.btnGymModelAbs && !elements.btnGymModelAbs._coachBound) {
      elements.btnGymModelAbs.addEventListener('click', () => {
        gymTotalModel = 'abs';
        elements.btnGymModelAbs.classList.add('active');
        if (elements.btnGymModelE1rm) elements.btnGymModelE1rm.classList.remove('active');
        renderHistoryTotalsBento();
      });
      elements.btnGymModelAbs._coachBound = true;
    }

    if (elements.btnGymModelE1rm && !elements.btnGymModelE1rm._coachBound) {
      elements.btnGymModelE1rm.addEventListener('click', () => {
        gymTotalModel = 'e1rm';
        elements.btnGymModelE1rm.classList.add('active');
        if (elements.btnGymModelAbs) elements.btnGymModelAbs.classList.remove('active');
        renderHistoryTotalsBento();
      });
      elements.btnGymModelE1rm._coachBound = true;
    }

    if (elements.btnEditComp && !elements.btnEditComp._coachBound) {
      elements.btnEditComp.addEventListener('click', () => {
        if (!elements.compEditDrawer) return;
        const isHidden = elements.compEditDrawer.style.display === 'none';
        elements.compEditDrawer.style.display = isHidden ? 'block' : 'none';
      });
      elements.btnEditComp._coachBound = true;
    }

    if (elements.btnSaveComp && !elements.btnSaveComp._coachBound) {
      elements.btnSaveComp.addEventListener('click', () => {
        const sq = parseFloat(elements.editCompSq ? elements.editCompSq.value : '0') || 0;
        const bp = parseFloat(elements.editCompBp ? elements.editCompBp.value : '0') || 0;
        const dl = parseFloat(elements.editCompDl ? elements.editCompDl.value : '0') || 0;
        if (currentAthlete) {
          currentAthlete.compPrs = {
            ...currentAthlete.compPrs,
            squat: sq,
            bench: bp,
            deadlift: dl
          };
          savePersistedBonds();
          if (elements.compEditDrawer) elements.compEditDrawer.style.display = 'none';
          renderHistoryTotalsBento();
          showFeedbackMessage(`Updated Competition Total for ${currentAthlete.name}: ${(sq + bp + dl).toFixed(1)} kg`);
        }
      });
      elements.btnSaveComp._coachBound = true;
    }

    if (elements.btnCalPrev && !elements.btnCalPrev._coachBound) {
      elements.btnCalPrev.addEventListener('click', () => navigateCalendarMonth(-1));
      elements.btnCalPrev._coachBound = true;
    }
    if (elements.btnCalNext && !elements.btnCalNext._coachBound) {
      elements.btnCalNext.addEventListener('click', () => navigateCalendarMonth(1));
      elements.btnCalNext._coachBound = true;
    }
    if (elements.btnCalToday && !elements.btnCalToday._coachBound) {
      elements.btnCalToday.addEventListener('click', () => {
        const today = new Date();
        currentCalYear = today.getFullYear();
        currentCalMonth = today.getMonth();
        selectedCalDateStr = formatIsoDate(today);
        renderMonthlyCalendar();
      });
      elements.btnCalToday._coachBound = true;
    }

    if (elements.btnExportDay && !elements.btnExportDay._coachBound) {
      elements.btnExportDay.addEventListener('click', () => {
        const workoutsList = getAthleteWorkouts(currentAthlete.id);
        const dayWorkouts = workoutsList.filter(w => w.date === selectedCalDateStr);
        const payload = JSON.stringify({
          athlete: currentAthlete.name,
          date: selectedCalDateStr,
          workouts: dayWorkouts
        }, null, 2);
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try {
            navigator.clipboard.writeText(payload).catch(() => {});
          } catch (_) {}
        }
        try {
          if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            const blob = new Blob([payload], { type: 'application/json;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `eros_workout_${currentAthlete.name.toLowerCase().replace(/\s+/g, '_')}_${selectedCalDateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        } catch (_) {}
        showFeedbackMessage(`Exported workout telemetry JSON for ${selectedCalDateStr}`);
      });
      elements.btnExportDay._coachBound = true;
    }

    if (elements.btnExportDayCsv && !elements.btnExportDayCsv._coachBound) {
      elements.btnExportDayCsv.addEventListener('click', () => {
        const workoutsList = getAthleteWorkouts(currentAthlete.id);
        const dayWorkouts = workoutsList.filter(w => w.date === selectedCalDateStr);
        if (dayWorkouts.length === 0) {
          showFeedbackMessage(`No workouts to export for ${selectedCalDateStr}`);
          return;
        }
        const session = dayWorkouts[0];
        const rows = [
          'SET,MOVEMENT,LOAD_KG,REPS,AVG_VELOCITY_MPS,PEAK_VELOCITY_MPS,ROM_CM,VEL_LOSS_PCT,RPE'
        ];
        (session.sets || []).forEach((s, idx) => {
          rows.push([
            s.setNumber || (idx + 1),
            `"${s.lift || ''}"`,
            (parseFloat(s.weight) || 0).toFixed(1),
            s.repsCount || 0,
            (parseFloat(s.avgVelocity) || 0).toFixed(2),
            (parseFloat(s.maxVelocity) || 0).toFixed(2),
            (parseFloat(s.rom) || 0).toFixed(1),
            (parseFloat(s.velocityLossPct) || 0).toFixed(1),
            (parseFloat(s.rpe) || 8.0).toFixed(1)
          ].join(','));
        });
        const csvContent = rows.join('\n');
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try {
            navigator.clipboard.writeText(csvContent).catch(() => {});
          } catch (_) {}
        }
        try {
          if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `eros_workout_${currentAthlete.name.toLowerCase().replace(/\s+/g, '_')}_${selectedCalDateStr}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        } catch (_) {}
        showFeedbackMessage(`Exported workout CSV for ${selectedCalDateStr}`);
      });
      elements.btnExportDayCsv._coachBound = true;
    }

    if (elements.historyLiftFilters && !elements.historyLiftFilters._coachBound) {
      const filterBtns = elements.historyLiftFilters.querySelectorAll('[data-lift-filter]');
      filterBtns.forEach(btn => {
        if (typeof btn.setAttribute === 'function' && !btn.getAttribute('data-prep-tooltip-key')) {
          btn.setAttribute('data-prep-tooltip-key', 'coach_filter_pill');
        }
        btn.addEventListener('click', () => {
          activeHistoryLiftFilter = btn.getAttribute('data-lift-filter') || 'all';
          filterBtns.forEach(b => b.classList.toggle('active', b === btn));
          renderPreviousWorkoutsFeed();
        });
      });
      elements.historyLiftFilters._coachBound = true;
    }
  }

  function renderAthleteHistoryPanel() {
    if (!elements.compTotalVal) queryElements();
    renderHistoryTotalsBento();
    renderWeeklyAdherenceCard();
    renderMonthlyCalendar();
    renderPreviousWorkoutsFeed();
  }

  function getResolvedAthleteTotals(athlete) {
    const ath = athlete || currentAthlete || SQUAD_ATHLETES[0];
    let compSq = (ath && ath.compPrs) ? (Number(ath.compPrs.squat) || 0) : 0;
    let compBp = (ath && ath.compPrs) ? (Number(ath.compPrs.bench) || 0) : 0;
    let compDl = (ath && ath.compPrs) ? (Number(ath.compPrs.deadlift) || 0) : 0;

    let gymSq = (ath && ath.gymPrs) ? (Number(ath.gymPrs.squat) || 0) : 0;
    let gymBp = (ath && ath.gymPrs) ? (Number(ath.gymPrs.bench) || 0) : 0;
    let gymDl = (ath && ath.gymPrs) ? (Number(ath.gymPrs.deadlift) || 0) : 0;

    // Sync with vbt_pr_data_v1 if stored for primary athlete
    if (ath && ath.id === 'ath_01') {
      try {
        const prStored = typeof localStorage !== 'undefined' ? localStorage.getItem('vbt_pr_data_v1') : null;
        if (prStored) {
          const p = JSON.parse(prStored);
          if (p && p.comp) {
            if (Number(p.comp.squat) > 0) compSq = Number(p.comp.squat);
            if (Number(p.comp.bench) > 0) compBp = Number(p.comp.bench);
            if (Number(p.comp.deadlift) > 0) compDl = Number(p.comp.deadlift);
          }
          if (p && p.current) {
            if (Number(p.current.squat) > 0) gymSq = Number(p.current.squat);
            if (Number(p.current.bench) > 0) gymBp = Number(p.current.bench);
            if (Number(p.current.deadlift) > 0) gymDl = Number(p.current.deadlift);
          }
        }
      } catch (_) {}
    }

    const athleteWorkouts = getAthleteWorkouts(ath ? ath.id : 'ath_01');
    const allSets = athleteWorkouts.flatMap(w => Array.isArray(w.sets) ? w.sets : []);

    const defaultE1rmSq = (ath && ath.e1rmPrs) ? (Number(ath.e1rmPrs.squat) || 0) : (gymSq > 0 ? +(gymSq * 1.015).toFixed(1) : 0);
    const defaultE1rmBp = (ath && ath.e1rmPrs) ? (Number(ath.e1rmPrs.bench) || 0) : (gymBp > 0 ? +(gymBp * 1.015).toFixed(1) : 0);
    const defaultE1rmDl = (ath && ath.e1rmPrs) ? (Number(ath.e1rmPrs.deadlift) || 0) : (gymDl > 0 ? +(gymDl * 1.015).toFixed(1) : 0);

    const e1rmSq = calculateOlsE1rm(allSets, 'Squat', defaultE1rmSq);
    const e1rmBp = calculateOlsE1rm(allSets, 'Bench', defaultE1rmBp);
    const e1rmDl = calculateOlsE1rm(allSets, 'Deadlift', defaultE1rmDl);

    const compTotal = compSq + compBp + compDl;
    const absGymTotal = gymSq + gymBp + gymDl;
    const e1rmGymTotal = e1rmSq + e1rmBp + e1rmDl;
    const activeGymTotal = gymTotalModel === 'e1rm' ? e1rmGymTotal : absGymTotal;

    return {
      compSq, compBp, compDl, compTotal,
      gymSq: gymTotalModel === 'e1rm' ? e1rmSq : gymSq,
      gymBp: gymTotalModel === 'e1rm' ? e1rmBp : gymBp,
      gymDl: gymTotalModel === 'e1rm' ? e1rmDl : gymDl,
      absGymTotal,
      e1rmGymTotal,
      activeGymTotal
    };
  }

  function renderHistoryTotalsBento() {
    const totals = getResolvedAthleteTotals(currentAthlete);
    const dots = computeDotsScore(totals.compTotal, currentAthlete.bodyweightKg, currentAthlete.gender);

    if (elements.compTotalVal) {
      animateCountUp(elements.compTotalVal, totals.compTotal, 450, (v) => `${Number(v).toFixed(1)} kg`);
    }
    if (elements.compBreakdown) {
      elements.compBreakdown.textContent = `SQ: ${totals.compSq.toFixed(1)} | BP: ${totals.compBp.toFixed(1)} | DL: ${totals.compDl.toFixed(1)} kg`;
    }
    if (elements.compMeta) {
      elements.compMeta.textContent = totals.compTotal > 0
        ? `IPF Verified Meet • DOTS: ${dots.toFixed(1)}`
        : 'No Meet Totals Logged • DOTS: 0.0';
    }
    if (elements.editCompSq) elements.editCompSq.value = totals.compSq.toFixed(1);
    if (elements.editCompBp) elements.editCompBp.value = totals.compBp.toFixed(1);
    if (elements.editCompDl) elements.editCompDl.value = totals.compDl.toFixed(1);

    if (elements.gymTotalVal) {
      animateCountUp(elements.gymTotalVal, totals.activeGymTotal, 450, (v) => `${Number(v).toFixed(1)} kg`);
    }
    if (elements.gymBreakdown) {
      elements.gymBreakdown.textContent = `SQ: ${totals.gymSq.toFixed(1)} | BP: ${totals.gymBp.toFixed(1)} | DL: ${totals.gymDl.toFixed(1)} kg`;
    }
    if (elements.gymMeta) {
      elements.gymMeta.textContent = gymTotalModel === 'e1rm'
        ? 'Load-Velocity OLS Profile • MVT Validated'
        : 'Tracked with Eros • Verified Lockout';
    }

    const deltaKg = totals.activeGymTotal - totals.compTotal;
    const pctGap = totals.compTotal > 0 ? (deltaKg / totals.compTotal) * 100 : 0;
    const sign = deltaKg > 0 ? '+' : '';

    if (elements.diffVal) {
      elements.diffVal.textContent = `${sign}${deltaKg.toFixed(1)} kg (${sign}${pctGap.toFixed(1)}%)`;
    }
    if (elements.diffBadge && elements.diffDirective) {
      if (totals.compTotal === 0 && totals.activeGymTotal === 0) {
        elements.diffBadge.textContent = 'Ready';
        elements.diffDirective.textContent = 'Log sets with Eros or enter meet PRs to compute transfer gap.';
      } else if (pctGap > 8.0) {
        elements.diffBadge.textContent = 'Technical Leak';
        elements.diffDirective.textContent = 'Gym total exceeds meet total by >8%. Enforce competition pause gating with Eros.';
      } else if (pctGap >= 2.0) {
        elements.diffBadge.textContent = 'Optimal Transfer';
        elements.diffDirective.textContent = 'Standard gym-to-meet transfer (+2% to +6%). Athlete is competition-ready.';
      } else if (pctGap >= -2.0) {
        elements.diffBadge.textContent = 'Competition Peaker';
        elements.diffDirective.textContent = 'High meet conversion ratio. Prescribe assertive 3rd attempts.';
      } else {
        elements.diffBadge.textContent = 'Fatigue Accumulation';
        elements.diffDirective.textContent = 'Gym capacity below competition baseline. Cap velocity loss at 10% for recovery.';
      }
    }
  }

  function computeWeeklyAdherence(workoutsList, refDate) {
    const allWorkouts = Array.isArray(workoutsList) ? workoutsList : getAthleteWorkouts(currentAthlete.id);
    const currentNow = (refDate instanceof Date && !isNaN(refDate.getTime())) ? refDate : new Date();
    const monday = getMondayOfIsoWeek(currentNow);
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayIso = formatIsoDate(currentNow);

    let completedDaysCount = 0;
    let weeklyVolumeKg = 0;
    const segments = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dIso = formatIsoDate(d);
      const dayWorkouts = allWorkouts.filter(w => w.date === dIso && (w.totalSets > 0 || (Array.isArray(w.sets) && w.sets.length > 0)));
      const isDone = dayWorkouts.length > 0;
      const isToday = (dIso === todayIso);

      if (isDone) {
        completedDaysCount++;
        dayWorkouts.forEach(w => { weeklyVolumeKg += (Number(w.totalVolumeKg) || 0); });
      }

      segments.push({
        dayLabel: dayLabels[i],
        dateIso: dIso,
        isDone,
        isToday
      });
    }

    return {
      completedDaysCount,
      targetDays: 7,
      headline: `${completedDaysCount}/7 workouts completed this week with Eros`,
      weeklyVolumeKg,
      segments
    };
  }

  function renderWeeklyAdherenceCard() {
    const adherence = computeWeeklyAdherence(getAthleteWorkouts(currentAthlete.id));
    if (elements.weeklyRatioBadge) {
      elements.weeklyRatioBadge.textContent = `${adherence.completedDaysCount}/7 Days`;
    }
    if (elements.weeklyAdherenceVal) {
      elements.weeklyAdherenceVal.textContent = adherence.headline;
    }
    if (elements.weeklyMeta) {
      elements.weeklyMeta.textContent = `ISO Week Mon-Sun • ${(adherence.weeklyVolumeKg / 1000).toFixed(1)}t Weekly Volume`;
    }
    if (elements.weeklySegments) {
      elements.weeklySegments.innerHTML = adherence.segments.map(seg => `
        <div class="coach-week-day-pill ${seg.isDone ? 'done' : ''} ${seg.isToday ? 'today' : ''}" role="listitem" aria-label="${seg.dayLabel} ${seg.dateIso}: ${seg.isDone ? 'Completed with Eros' : 'Rest'}">
          <span>${seg.dayLabel}</span>
          <span>${seg.isDone ? 'Done' : '-'}</span>
        </div>
      `).join('');
    }
  }

  // ── Monthly Calendar View & Accessible Day Inspector ──
  function navigateCalendarMonth(deltaMonths) {
    currentCalMonth += deltaMonths;
    if (currentCalMonth < 0) {
      currentCalMonth = 11;
      currentCalYear--;
    } else if (currentCalMonth > 11) {
      currentCalMonth = 0;
      currentCalYear++;
    }
    renderMonthlyCalendar();
  }

  function renderMonthlyCalendar() {
    if (!elements.calendarGrid) queryElements();
    if (!elements.calendarGrid) return;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (elements.calMonthTitle) {
      elements.calMonthTitle.textContent = `${monthNames[currentCalMonth]} ${currentCalYear}`;
    }

    const workoutsList = getAthleteWorkouts(currentAthlete.id);
    const monthPrefix = `${currentCalYear}-${String(currentCalMonth + 1).padStart(2, '0')}`;
    const monthWorkouts = workoutsList.filter(w => w.date && w.date.startsWith(monthPrefix));

    const monthVolumeKg = monthWorkouts.reduce((acc, w) => acc + (Number(w.totalVolumeKg) || 0), 0);
    if (elements.calSummaryStats) {
      elements.calSummaryStats.textContent = `${monthWorkouts.length} Workouts with Eros • ${(monthVolumeKg / 1000).toFixed(1)}t Monthly Volume`;
    }

    const firstDayOfMonth = new Date(currentCalYear, currentCalMonth, 1);
    const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
    // Monday-first offset (0=Mon .. 6=Sun)
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

    // Ensure selectedCalDateStr defaults to the latest workout in the month if not in current month
    if (!selectedCalDateStr.startsWith(monthPrefix) && monthWorkouts.length > 0) {
      selectedCalDateStr = monthWorkouts[0].date;
    }

    const cellsHtml = [];
    // Leading empty cells from previous month
    const prevMonthDays = new Date(currentCalYear, currentCalMonth, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      cellsHtml.push(`
        <div class="coach-cal-day-cell outside-month" data-prep-tooltip-key="coach_cal_day" role="gridcell" aria-disabled="true">
          <span class="coach-cal-day-num">${dayNum}</span>
        </div>
      `);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      const dayWorkouts = monthWorkouts.filter(w => w.date === dateStr);
      const hasWorkout = dayWorkouts.length > 0;
      const isSelected = (dateStr === selectedCalDateStr);
      const primaryWorkout = hasWorkout ? dayWorkouts[0] : null;
      const dayHasPr = dayWorkouts.some(isWorkoutGoldenPr);

      let tagClass = '';
      if (primaryWorkout) {
        if (/deadlift/i.test(primaryWorkout.name) && !/squat/i.test(primaryWorkout.name)) tagClass = 'tag-deadlift';
        else if (/squat/i.test(primaryWorkout.name)) tagClass = 'tag-squat';
        else if (/bench/i.test(primaryWorkout.name)) tagClass = 'tag-bench';
      }

      const ariaDesc = hasWorkout
        ? `${dateStr}: ${primaryWorkout.name}, ${(primaryWorkout.totalVolumeKg / 1000).toFixed(1)} tonnes, ${primaryWorkout.totalSets} sets with Eros`
        : `${dateStr}: Rest day`;

      cellsHtml.push(`
        <div class="coach-cal-day-cell ${hasWorkout ? 'has-workout' : ''} ${isSelected ? 'selected-day' : ''}"
             data-cal-date="${dateStr}"
             data-prep-tooltip-key="coach_cal_day"
             role="gridcell"
             tabindex="0"
             aria-selected="${isSelected ? 'true' : 'false'}"
             aria-label="${ariaDesc}">
          <span class="coach-cal-day-num">${day}</span>
          ${hasWorkout ? `
            <span class="coach-cal-workout-tag ${tagClass}">${primaryWorkout.name}${dayHasPr ? goldenPrBadgeHtml(true) : ''}</span>
            <span class="coach-cal-day-meta">${(primaryWorkout.totalVolumeKg / 1000).toFixed(1)}t • ${primaryWorkout.totalSets}S</span>
          ` : `
            <span class="coach-cal-day-meta">Rest</span>
          `}
        </div>
      `);
    }

    elements.calendarGrid.innerHTML = cellsHtml.join('');

    elements.calendarGrid.querySelectorAll('[data-cal-date]').forEach(cell => {
      cell.addEventListener('click', () => {
        selectCalendarDate(cell.getAttribute('data-cal-date'));
      });
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectCalendarDate(cell.getAttribute('data-cal-date'));
        }
      });
    });

    renderDayInspector(selectedCalDateStr, workoutsList);
  }

  function selectCalendarDate(dateStr) {
    if (!dateStr) return;
    selectedCalDateStr = dateStr;
    renderMonthlyCalendar();
  }

  function renderDayInspector(dateStr, workoutsList) {
    if (!elements.inspectorSetsTbody) return;
    const allWorkouts = Array.isArray(workoutsList) ? workoutsList : getAthleteWorkouts(currentAthlete.id);
    const dayWorkouts = allWorkouts.filter(w => w.date === dateStr);

    if (elements.inspectorDate) {
      elements.inspectorDate.textContent = dateStr;
    }

    if (dayWorkouts.length === 0) {
      if (elements.inspectorTitle) elements.inspectorTitle.textContent = 'Rest & Recovery Day';
      if (elements.inspectorMeta) elements.inspectorMeta.textContent = '0 Sets Completed with Eros';
      elements.inspectorSetsTbody.innerHTML = `
        <tr>
          <td colspan="10" class="coach-empty-cell">No workouts logged with Eros on ${escapeHtml(dateStr)}. Select a highlighted calendar day to inspect telemetry.</td>
        </tr>
      `;
      return;
    }

    const session = dayWorkouts[0];
    if (elements.inspectorTitle) {
      elements.inspectorTitle.textContent = session.name;
    }
    if (elements.inspectorMeta) {
      elements.inspectorMeta.textContent = `${Math.round(session.totalVolumeKg).toLocaleString()} kg Volume • ${session.totalSets} Sets with Eros • Avg ${(Number(session.avgVelocity) || 0).toFixed(2)} m/s`;
    }

    const setsArr = Array.isArray(session.sets) ? session.sets : [];
    elements.inspectorSetsTbody.innerHTML = setsArr.map((s, idx) => {
      const zone = classifyBryanMannZone(s.avgVelocity, s.lift);
      const liftBadgeClass = /squat/i.test(s.lift)
        ? 'lift-squat'
        : (/bench/i.test(s.lift) ? 'lift-bench' : 'lift-deadlift');
      const isCutoff = (s.velocityLossPct || 0) >= 20.0;
      const setIsPr = isSetGoldenPr(s);

      return `
        <tr>
          <td class="font-mono">Set ${s.setNumber || (idx + 1)}</td>
          <td><span class="coach-lift-badge ${liftBadgeClass}">${escapeHtml(formatDisplayLiftName(s.lift))}</span>${setIsPr ? goldenPrBadgeHtml(false) : ''}</td>
          <td class="font-mono">${(Number(s.weight) || 0).toFixed(1)} kg</td>
          <td class="font-mono">${s.repsCount || 3}</td>
          <td class="font-mono text-cyan">${(Number(s.avgVelocity) || 0).toFixed(2)} m/s</td>
          <td class="font-mono">${(Number(s.maxVelocity) || 0).toFixed(2)} m/s</td>
          <td class="font-mono">${(Number(s.rom) || 56.0).toFixed(1)} cm</td>
          <td class="font-mono ${isCutoff ? 'text-danger' : ''}">${(Number(s.velocityLossPct) || 0).toFixed(1)}%</td>
          <td><span class="coach-zone-badge ${zone.css} font-mono">${zone.label}</span></td>
          <td class="font-mono">@${(Number(s.rpe) || 8.0).toFixed(1)}</td>
        </tr>
      `;
    }).join('');
  }

  function renderPreviousWorkoutsFeed() {
    if (!elements.prevWorkoutsList) return;
    const allWorkouts = getAthleteWorkouts(currentAthlete.id);
    const filtered = allWorkouts.filter(w => {
      if (activeHistoryLiftFilter === 'all') return true;
      if (activeHistoryLiftFilter === 'SBD') return w.name === 'SBD';
      return w.name.toLowerCase().includes(activeHistoryLiftFilter.toLowerCase());
    });

    if (elements.prevWorkoutsCount) {
      elements.prevWorkoutsCount.textContent = `${filtered.length} Sessions`;
    }

    if (filtered.length === 0) {
      elements.prevWorkoutsList.innerHTML = '<div class="coach-empty-stream-msg">No previous workouts match the selected movement filter.</div>';
      return;
    }

    elements.prevWorkoutsList.innerHTML = filtered.slice(0, 12).map(w => `
      <div class="coach-prev-workout-item" data-workout-date="${escapeHtml(w.date)}" role="button" tabindex="0" aria-label="Inspect workout ${escapeHtml(w.name)} on ${escapeHtml(w.date)}">
        <div class="coach-prev-workout-left">
          <span class="coach-inspector-date font-mono">${escapeHtml(w.date)}</span>
          <span class="coach-prev-workout-name">${escapeHtml(w.name)}${isWorkoutGoldenPr(w) ? goldenPrBadgeHtml(false) : ''}</span>
        </div>
        <div class="coach-prev-workout-right">
          <span>${w.totalSets} Sets with Eros</span>
          <span>${Math.round(w.totalVolumeKg).toLocaleString()} kg</span>
          <span class="text-cyan">Avg ${(w.avgVelocity || 0.45).toFixed(2)} m/s</span>
        </div>
      </div>
    `).join('');

    elements.prevWorkoutsList.querySelectorAll('[data-workout-date]').forEach(item => {
      item.addEventListener('click', () => {
        const dStr = item.getAttribute('data-workout-date');
        if (dStr) {
          const parts = dStr.split('-');
          if (parts.length === 3) {
            currentCalYear = parseInt(parts[0], 10);
            currentCalMonth = parseInt(parts[1], 10) - 1;
          }
          selectCalendarDate(dStr);
        }
      });
    });
  }

  // ── Sync Bus Event Binding ──
  function bindSyncBusEvents() {
    function attachToBus(bus) {
      if (!bus || typeof bus.on !== 'function' || bus._coachPortalAttached) return;
      bus.on('set:started', handleSetStarted);
      bus.on('rep:recorded', handleRepRecorded);
      bus.on('set:completed', handleSetCompleted);
      bus.on('coach:load_response', handleLoadResponse);
      bus.on('athlete:connect', handleAthleteConnect);
      bus.on('coach:rest_target', handleCoachRestTarget);
      bus.on('athlete:profile_updated', handleAthleteProfileUpdated);
      bus.on('prep:athlete_feedback', handlePrepAthleteFeedback);
      bus.on('workout:pr_pushed', handleWorkoutPrPushed);
      bus.on('workout:updated', () => {
        if (isCoachMode) renderFullCoachDashboard();
      });
      bus._coachPortalAttached = true;
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !window._coachAthleteConnectBound) {
      window.addEventListener('eros:athlete_connect', (e) => {
        if (e && e.detail) handleAthleteConnect(e.detail);
      });
      window._coachAthleteConnectBound = true;
    }

    if (typeof window !== 'undefined' && window.ErosSyncBus) {
      attachToBus(window.ErosSyncBus);
    } else if (typeof window !== 'undefined') {
      let existingBus = window.ErosSyncBus;
      Object.defineProperty(window, 'ErosSyncBus', {
        configurable: true,
        enumerable: true,
        get: () => existingBus,
        set: (newBus) => {
          existingBus = newBus;
          attachToBus(newBus);
        }
      });
    }
  }

  // ── Event Handlers ──
  function handleSetStarted(payload) {
    if (payload && payload.setId && payload.setId === lastProcessedSetId && activeRepsStream.length === 0) return;
    lastProcessedSetId = (payload && payload.setId) ? payload.setId : '';

    activeRepsStream = [];
    coachActiveReps = [];
    coachActiveTrajectory = [];
    coachRep1Trajectory = null;
    coachSelectedRepIdx = -1;
    if (payload && payload.targetRpe) {
      coachActiveTargetRpe = Number(payload.targetRpe) || 8.0;
    }

    if (!elements.viewCoach) queryElements();

    const lift = (payload && payload.lift) || (typeof currentLift !== 'undefined' ? currentLift : 'Deadlift');
    const setNum = (payload && payload.setNumber) || 1;
    const weight = (payload && payload.weight) || getSafeWorkingWeight();

    if (currentAthlete) {
      currentAthlete.status = 'lifting';
      currentAthlete.restSeconds = 0;
      currentAthlete.currentLift = formatCanonicalLiftLabel(lift);
      currentAthlete.currentLoadKg = weight;
    }

    if (elements.activeLiftBadge) {
      const canonicalLift = formatCanonicalLiftLabel(lift);
      elements.activeLiftBadge.textContent = canonicalLift;
      elements.activeLiftBadge.className = 'coach-lift-badge ' + (
        /squat/i.test(lift) ? 'lift-squat' : (/bench/i.test(lift) ? 'lift-bench' : 'lift-deadlift')
      );
    }

    if (elements.activeSetTitle) {
      elements.activeSetTitle.textContent = `${formatDisplayLiftName(lift)} — Set ${setNum}`;
    }
    if (elements.activeSetMeta) {
      elements.activeSetMeta.textContent = `${weight.toFixed(1)} kg | In Progress`;
    }
    if (elements.sessionStatusText) {
      elements.sessionStatusText.textContent = 'Active Set';
    }

    // Reset metric cards
    if (elements.liveMcv) elements.liveMcv.textContent = '0.00';
    if (elements.livePv) elements.livePv.textContent = '0.00';
    if (elements.liveRom) elements.liveRom.textContent = '0.0';
    if (elements.liveVl) elements.liveVl.textContent = '0.0%';
    if (elements.liveZoneBadge) {
      const zone = classifyBryanMannZone(0, lift);
      elements.liveZoneBadge.textContent = zone.label;
      elements.liveZoneBadge.className = `coach-zone-badge ${zone.css} font-mono`;
    }
    if (elements.liveVlGauge) {
      elements.liveVlGauge.style.width = '0%';
      elements.liveVlGauge.className = 'coach-vl-bar-fill';
    }
    if (elements.repsStream) {
      elements.repsStream.innerHTML = '<span class="coach-empty-stream-msg">Set initiated. Lift with Eros to record repetitions...</span>';
    }

    // Reset Bar Path Stage & RPE Pill
    if (elements.devSummary) {
      elements.devSummary.textContent = 'Max Dev: 0.0 cm • Eff: 100.0%';
    }
    renderCoachBarpathRepPills();
    updateCoachRpePill(8.0, 0, 0);
    renderCoachBarPathCanvas();

    renderSquadOverview();
  }

  function handleRepRecorded(payload) {
    if (!payload) return;
    if (!elements.viewCoach) queryElements();

    const repNum = payload.repNumber || (activeRepsStream.length + 1);
    const vel = typeof payload.velocity === 'number' ? payload.velocity : (payload.meanVelocity || 0);
    const peakVel = typeof payload.peakVelocity === 'number' ? payload.peakVelocity : (vel * 1.25);
    const rom = typeof payload.rom === 'number' ? payload.rom : (payload.romCm || 54.0);
    const vl = typeof payload.lossPercent === 'number' ? payload.lossPercent : (payload.velocityLossPct || 0);
    const dev = (typeof payload.deviationCm === 'number') ? payload.deviationCm : null;
    const maxDev = (typeof payload.maxDeviationCm === 'number') ? payload.maxDeviationCm : dev;
    const eff = (typeof payload.pathEfficiencyPct === 'number') ? payload.pathEfficiencyPct : null;
    let traj = Array.isArray(payload.trajectoryPoints) ? payload.trajectoryPoints : null;

    const repKey = `${payload.setId || ''}_${repNum}_${vel.toFixed(2)}`;
    if (repKey === lastProcessedRepKey) return;
    lastProcessedRepKey = repKey;

    if (!traj && typeof window !== 'undefined' && typeof window.synthesizeRepTrajectory === 'function') {
      const lift = (currentAthlete && currentAthlete.currentLift) || 'Deadlift';
      const synth = window.synthesizeRepTrajectory(lift, vel, dev, rom);
      traj = synth.points;
    }

    const repObj = {
      repNumber: repNum,
      velocity: vel,
      peakVelocity: peakVel,
      rom: rom,
      lossPercent: vl,
      rpe: payload.rpe != null ? payload.rpe : 8.0,
      deviationCm: dev,
      maxDeviationCm: maxDev,
      pathEfficiencyPct: eff,
      trajectoryPoints: traj
    };

    activeRepsStream.push(repObj);
    coachActiveReps.push(repObj);

    if (coachActiveReps.length === 1 && traj) {
      coachRep1Trajectory = traj;
    }

    if (currentAthlete) {
      currentAthlete.status = 'lifting';
      currentAthlete.currentMcv = vel;
      currentAthlete.currentPv = peakVel;
      currentAthlete.currentRomCm = rom;
      currentAthlete.currentVlPct = vl;
    }

    // Update Live Bento Values
    if (elements.liveMcv) elements.liveMcv.textContent = vel.toFixed(2);
    if (elements.livePv) elements.livePv.textContent = peakVel.toFixed(2);
    if (elements.liveRom) elements.liveRom.textContent = rom.toFixed(1);
    if (elements.liveVl) elements.liveVl.textContent = `${vl.toFixed(1)}%`;

    if (elements.liveZoneBadge) {
      const zone = classifyBryanMannZone(vel, currentAthlete ? currentAthlete.currentLift : 'Deadlift');
      elements.liveZoneBadge.textContent = zone.label;
      elements.liveZoneBadge.className = `coach-zone-badge ${zone.css} font-mono`;
    }

    // Update VL Gauge
    if (elements.liveVlGauge) {
      const clampedVl = Math.min(100, Math.max(0, vl));
      elements.liveVlGauge.style.width = `${clampedVl}%`;
      if (clampedVl >= 20.0) {
        elements.liveVlGauge.className = 'coach-vl-bar-fill cutoff';
      } else if (clampedVl >= 15.0) {
        elements.liveVlGauge.className = 'coach-vl-bar-fill warning';
      } else {
        elements.liveVlGauge.className = 'coach-vl-bar-fill';
      }
    }

    // Append to Reps Stream
    renderRepsStream();
    renderSquadOverview();

    // Render Pills and Load latest rep trajectory into Coach Bar Path
    renderCoachBarpathRepPills();
    loadCoachRepTrajectory(coachActiveReps.length - 1);
  }

  function handleSetCompleted(payload) {
    if (payload && payload.setId && payload.setId === lastCompletedSetId) return;
    lastCompletedSetId = (payload && payload.setId) ? payload.setId : '';

    if (!elements.viewCoach) queryElements();

    if (payload && typeof payload === 'object') {
      const normalizedSet = {
        setId: payload.setId || `set_remote_${Date.now()}`,
        athleteId: payload.athleteId || (currentAthlete ? currentAthlete.id : 'ath_01'),
        setNumber: Number(payload.setNumber) || (remoteCompletedSets.length + 1),
        lift: payload.lift || 'Deadlift',
        weight: Number(payload.weight) || 0,
        reps: Array.isArray(payload.reps) ? payload.reps.slice() : [],
        repsCount: Array.isArray(payload.reps) ? payload.reps.length : (Number(payload.repsCount) || 0),
        avgVelocity: Number(payload.avgVelocity) || 0,
        maxVelocity: Number(payload.maxVelocity) || 0,
        velocityLossPct: Number(payload.velocityLoss != null ? payload.velocityLoss : payload.velocityLossPct) || 0,
        velocityLoss: Number(payload.velocityLoss != null ? payload.velocityLoss : payload.velocityLossPct) || 0,
        avgRpe: payload.avgRpe != null ? Number(payload.avgRpe) : (payload.rpe != null ? Number(payload.rpe) : 0),
        restSeconds: typeof payload.restSeconds === 'number' ? payload.restSeconds : null,
        plannedWorkoutId: payload.plannedWorkoutId || payload.planned_workout_id || '',
        plannedSlotId: payload.plannedSlotId || payload.planned_slot_id || '',
        isPr: Boolean(payload.isPr || payload.isPR),
        isPR: Boolean(payload.isPr || payload.isPR),
        timestamp: Number(payload.timestamp) || Date.now()
      };
      const existingIdx = remoteCompletedSets.findIndex(s => s.setId === normalizedSet.setId);
      if (existingIdx >= 0) {
        remoteCompletedSets[existingIdx] = normalizedSet;
      } else {
        remoteCompletedSets.push(normalizedSet);
      }
    }

    if (payload && (payload.isPr || payload.isPR)) {
      registerGoldenPr(payload);
    }
    if (currentAthlete) {
      currentAthlete.status = 'resting';
      currentAthlete.restSeconds = 0;
    }

    if (elements.activeSetTitle) {
      elements.activeSetTitle.textContent = 'Set Complete — Resting';
    }
    if (elements.activeSetMeta) {
      elements.activeSetMeta.textContent = 'Waiting for next set';
    }
    if (elements.sessionStatusText) {
      elements.sessionStatusText.textContent = 'Rest Interval';
    }

    renderSetsHistoryTable();
    updateSquadRibbon();
    renderSquadOverview();
    if (activeCoachPanel === 'history') {
      renderAthleteHistoryPanel();
    } else if (activeCoachPanel === 'preparation') {
      renderPrepComparison();
    }
  }

  function handleLoadResponse(payload) {
    if (payload && payload.accepted) {
      showFeedbackMessage(`Athlete confirmed load: ${payload.finalWeight || payload.newWeight} kg`);
    } else {
      showFeedbackMessage('Athlete kept current working load');
    }
  }

  function handleAthleteConnect(payload) {
    if (!payload) return;
    const athleteId = payload.athleteId || 'ath_01';
    const athleteName = payload.athleteName || 'Active Athlete';
    const rackId = payload.rackId || 'Rack 01';

    let athlete = SQUAD_ATHLETES.find(a => a.id === athleteId);
    if (athlete) {
      athlete.name = athleteName;
      athlete.rack = rackId;
    } else {
      athlete = createSessionAthlete(athleteName, rackId);
      athlete.id = athleteId;
      SQUAD_ATHLETES.push(athlete);
    }

    if (!elements.athleteSelect) queryElements();
    if (elements.athleteSelect) {
      let opt = elements.athleteSelect.querySelector(`option[value="${athleteId}"]`);
      if (opt) {
        opt.textContent = `${athleteName} (${rackId})`;
      } else {
        opt = document.createElement('option');
        opt.value = athleteId;
        opt.textContent = `${athleteName} (${rackId})`;
        elements.athleteSelect.appendChild(opt);
      }
    }

    renderSquadOverview();
    if (activeCoachPanel === 'preparation') {
      populatePrepAthleteSelect();
      renderPrepFactoring();
    }
    showFeedbackMessage(`Athlete connected: ${athleteName} (${rackId})`);
  }

  function handleCoachRestTarget(payload) {
    if (!payload || !payload.targetSeconds) return;
    const targetSeconds = payload.targetSeconds;
    const athleteId = payload.athleteId || 'ath_01';
    const athlete = SQUAD_ATHLETES.find(a => a.id === athleteId);
    if (athlete) {
      athlete.prescribedRestSeconds = targetSeconds;
    }
    if (currentAthlete && currentAthlete.id === athleteId) {
      currentAthlete.prescribedRestSeconds = targetSeconds;
    }
  }

  // ── Render Dashboard Functions ──
  function renderFullCoachDashboard() {
    updateSquadRibbon();
    renderSquadOverview();
    renderActiveSetFromState();
    renderSetsHistoryTable();
    renderCoachPrescribedBridge();
    renderAthleteHistoryPanel();
    if (activeCoachPanel === 'preparation') renderPreparationPanel();
  }

  function updateSquadRibbon() {
    if (!elements.readinessVal) queryElements();

    const readinessRaw = String((currentAthlete && currentAthlete.readiness) || '100% [Optimal]');
    const readinessMatch = readinessRaw.match(/(\d+(?:\.\d+)?)\s*%/);
    const readinessPct = readinessMatch ? Math.max(0, Math.min(100, parseFloat(readinessMatch[1]))) : 100;
    const readinessSuffix = readinessMatch ? readinessRaw.slice(readinessMatch.index + readinessMatch[0].length) : '';

    if (elements.readinessVal) {
      if (readinessMatch) {
        animateCountUp(elements.readinessVal, readinessPct, 450, (v) => `${Math.round(v)}%${readinessSuffix}`);
      } else {
        elements.readinessVal.textContent = readinessRaw;
      }
    }

    if (elements.readinessRing) {
      const ringColor = readinessPct >= 85 ? '#10a37f' : (readinessPct >= 65 ? '#f59e0b' : '#ff3b30');
      renderProgressRing(elements.readinessRing, readinessPct, ringColor);
    }

    const volumeRaw = String((currentAthlete && currentAthlete.volume) || '0 kg');
    const volumeHasCommas = /\d,\d{3}/.test(volumeRaw);
    const volumeNormalized = volumeRaw.replace(/,/g, '');
    const volumeMatch = volumeNormalized.match(/(-?\d+(?:\.\d+)?)/);
    if (elements.volumeVal) {
      if (volumeMatch) {
        const volNum = parseFloat(volumeMatch[1]);
        const volHasDecimals = /\./.test(volumeMatch[1]);
        const volUnit = volumeNormalized.slice(volumeMatch.index + volumeMatch[0].length);
        animateCountUp(elements.volumeVal, volNum, 450, (v) => {
          const n = Number(v);
          let numStr;
          if (volumeHasCommas) {
            numStr = volHasDecimals
              ? n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
              : Math.round(n).toLocaleString('en-US');
          } else {
            numStr = volHasDecimals ? n.toFixed(1) : String(Math.round(n));
          }
          return `${numStr}${volUnit}`;
        });
      } else {
        elements.volumeVal.textContent = volumeRaw;
      }
    }

    const e1rmRaw = String((currentAthlete && currentAthlete.e1rm) || '—');
    const e1rmNormalized = e1rmRaw.replace(/,/g, '');
    const e1rmMatch = e1rmNormalized.match(/(-?\d+(?:\.\d+)?)/);
    if (elements.e1rmVal) {
      if (e1rmMatch) {
        const e1rmNum = parseFloat(e1rmMatch[1]);
        const e1rmUnit = e1rmNormalized.slice(e1rmMatch.index + e1rmMatch[0].length);
        animateCountUp(elements.e1rmVal, e1rmNum, 450, (v) => `${Number(v).toFixed(1)}${e1rmUnit}`);
      } else {
        elements.e1rmVal.textContent = e1rmRaw;
      }
    }

    updateCoachSidebarTicker();

    const safeSet = getSafeActiveSet();
    if (safeSet) {
      if (elements.sessionStatusText) elements.sessionStatusText.textContent = 'Active Set';
    } else {
      const safeWorkout = getSafeActiveWorkout();
      if (safeWorkout && safeWorkout.sets && safeWorkout.sets.length > 0) {
        if (elements.sessionStatusText) elements.sessionStatusText.textContent = 'Rest Interval';
      } else {
        if (elements.sessionStatusText) elements.sessionStatusText.textContent = 'Session Ready';
      }
    }
  }

  function renderActiveSetFromState() {
    const curSet = getSafeActiveSet();
    const fallbackLift = typeof currentLift !== 'undefined' ? currentLift : (currentAthlete ? currentAthlete.currentLift : 'Deadlift');

    if (!curSet) {
      if (elements.activeLiftBadge) {
        const canonicalLift = formatCanonicalLiftLabel(fallbackLift);
        elements.activeLiftBadge.textContent = canonicalLift;
        elements.activeLiftBadge.className = 'coach-lift-badge ' + (
          /squat/i.test(fallbackLift) ? 'lift-squat' : (/bench/i.test(fallbackLift) ? 'lift-bench' : 'lift-deadlift')
        );
      }
      if (elements.activeSetTitle) elements.activeSetTitle.textContent = 'No Active Set — Ready';
      if (elements.activeSetMeta) elements.activeSetMeta.textContent = `${getSafeWorkingWeight().toFixed(1)} kg | Standing By`;
      if (elements.liveMcv) elements.liveMcv.textContent = '0.00';
      if (elements.livePv) elements.livePv.textContent = '0.00';
      if (elements.liveRom) elements.liveRom.textContent = '0.0';
      if (elements.liveVl) elements.liveVl.textContent = '0.0%';
      if (elements.liveZoneBadge) {
        const zone = classifyBryanMannZone(0, fallbackLift);
        elements.liveZoneBadge.textContent = zone.label;
        elements.liveZoneBadge.className = `coach-zone-badge ${zone.css} font-mono`;
      }
      if (elements.liveVlGauge) {
        elements.liveVlGauge.style.width = '0%';
        elements.liveVlGauge.className = 'coach-vl-bar-fill';
      }
      if (elements.repsStream) {
        elements.repsStream.innerHTML = '<span class="coach-empty-stream-msg">No active set in progress. Start a set in Athlete view to begin streaming.</span>';
      }
      return;
    }

    const lift = curSet.lift || fallbackLift;
    if (elements.activeLiftBadge) {
      const canonicalLift = formatCanonicalLiftLabel(lift);
      elements.activeLiftBadge.textContent = canonicalLift;
      elements.activeLiftBadge.className = 'coach-lift-badge ' + (
        /squat/i.test(lift) ? 'lift-squat' : (/bench/i.test(lift) ? 'lift-bench' : 'lift-deadlift')
      );
    }
    if (elements.activeSetTitle) {
      elements.activeSetTitle.textContent = `${formatDisplayLiftName(lift)} — Set ${curSet.setNumber || 1}`;
    }
    if (elements.activeSetMeta) {
      elements.activeSetMeta.textContent = `${(curSet.weight || getSafeWorkingWeight()).toFixed(1)} kg | Target RPE @${(curSet.targetRpe || 8.0).toFixed(1)}`;
    }
    if (elements.liveMcv) elements.liveMcv.textContent = (curSet.avgVelocity || 0).toFixed(2);
    if (elements.livePv) elements.livePv.textContent = (curSet.maxVelocity || 0).toFixed(2);
    if (elements.liveRom) elements.liveRom.textContent = (curSet.rom || 56.2).toFixed(1);
    if (elements.liveVl) elements.liveVl.textContent = `${(curSet.velocityLossPct || 0).toFixed(1)}%`;
    if (elements.liveZoneBadge) {
      const zone = classifyBryanMannZone(curSet.avgVelocity || 0, lift);
      elements.liveZoneBadge.textContent = zone.label;
      elements.liveZoneBadge.className = `coach-zone-badge ${zone.css} font-mono`;
    }

    if (elements.liveVlGauge) {
      const vl = curSet.velocityLossPct || 0;
      elements.liveVlGauge.style.width = `${Math.min(100, Math.max(0, vl))}%`;
      if (vl >= 20.0) {
        elements.liveVlGauge.className = 'coach-vl-bar-fill cutoff';
      } else if (vl >= 15.0) {
        elements.liveVlGauge.className = 'coach-vl-bar-fill warning';
      } else {
        elements.liveVlGauge.className = 'coach-vl-bar-fill';
      }
    }

    if (Array.isArray(curSet.reps) && curSet.reps.length > 0) {
      activeRepsStream = curSet.reps.map((r, idx) => ({
        repNumber: r.repNumber || idx + 1,
        velocity: r.velocity || 0,
        peakVelocity: r.peakVelocity || (r.velocity ? r.velocity * 1.25 : 0),
        rom: r.rom || 56.0,
        lossPercent: r.lossPercent || 0,
        rpe: r.rpe || 8.0,
        deviationCm: r.deviationCm,
        maxDeviationCm: r.maxDeviationCm || r.deviationCm,
        pathEfficiencyPct: r.pathEfficiencyPct,
        trajectoryPoints: r.trajectoryPoints
      }));
      coachActiveReps = [...activeRepsStream];
      if (coachActiveReps[0] && coachActiveReps[0].trajectoryPoints) {
        coachRep1Trajectory = coachActiveReps[0].trajectoryPoints;
      }
      renderRepsStream();
      renderCoachBarpathRepPills();
      loadCoachRepTrajectory(coachActiveReps.length - 1);
    }
  }

  function renderRepsStream() {
    if (!elements.repsStream) return;
    if (activeRepsStream.length === 0) {
      elements.repsStream.innerHTML = '<span class="coach-empty-stream-msg">No repetitions logged in this set yet.</span>';
      return;
    }

    elements.repsStream.innerHTML = activeRepsStream.map((rep, idx) => {
      const isCutoff = rep.lossPercent >= 20.0;
      const isSelected = (idx === coachSelectedRepIdx);
      return `
        <div class="coach-rep-stream-pill ${isCutoff ? 'cutoff-alert' : ''} ${isSelected ? 'active' : ''}" data-rep-idx="${idx}" data-prep-tooltip-key="coach_rep_stream_pill" role="button" tabindex="0" aria-label="Select Rep ${rep.repNumber}">
          <span class="rep-num">R${rep.repNumber}:</span>
          <span class="rep-vel">${rep.velocity.toFixed(2)} m/s</span>
          <span class="rep-loss">(${rep.lossPercent > 0 ? '-' : ''}${rep.lossPercent.toFixed(1)}%)</span>
        </div>
      `;
    }).join('');

    elements.repsStream.querySelectorAll('.coach-rep-stream-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const idx = parseInt(pill.getAttribute('data-rep-idx'), 10);
        loadCoachRepTrajectory(idx);
        playCoachReplay();
      });
    });
  }

  function renderSetsHistoryTable() {
    if (!elements.setsTableBody) queryElements();
    if (!elements.setsTableBody) return;

    const safeWorkout = getSafeActiveWorkout();
    const sets = (safeWorkout && Array.isArray(safeWorkout.sets)) ? safeWorkout.sets : [];

    if (elements.setsCounter) {
      elements.setsCounter.textContent = `${sets.length} Completed`;
    }

    if (sets.length === 0) {
      elements.setsTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="coach-empty-cell">No sets completed yet in this session.</td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    sets.forEach(set => {
      const setId = set.setId || `set_${set.setNumber}`;
      const lift = set.lift || 'Deadlift';
      const liftLower = lift.toLowerCase();
      const isExpanded = expandedSetIds.has(setId);
      const isCutoff = (set.velocityLossPct || 0) >= 20.0;
      const setIsPr = isSetGoldenPr(set);
      const restDuration = (typeof set.restSeconds === 'number' && set.restSeconds > 0)
        ? formatRestDuration(set.restSeconds)
        : '-';

      rowsHtml += `
        <tr class="coach-history-row ${isExpanded ? 'expanded' : ''}" data-set-id="${escapeHtml(setId)}">
          <td class="font-mono">Set ${set.setNumber}</td>
          <td><span class="coach-lift-badge lift-${escapeHtml(liftLower)}">${escapeHtml(formatDisplayLiftName(lift))}</span>${setIsPr ? goldenPrBadgeHtml(false) : ''}</td>
          <td class="font-mono">${(set.weight || 0).toFixed(1)} kg</td>
          <td class="font-mono">${set.reps ? set.reps.length : 0}</td>
          <td class="font-mono">${(set.avgVelocity || 0).toFixed(2)} m/s</td>
          <td class="font-mono">${(set.maxVelocity || 0).toFixed(2)} m/s</td>
          <td class="font-mono ${isCutoff ? 'text-danger' : ''}">${(set.velocityLossPct || 0).toFixed(1)}%</td>
          <td class="font-mono">${restDuration}</td>
          <td class="font-mono">@${(set.avgRpe || 8.0).toFixed(1)}</td>
          <td>
            <div class="coach-table-actions">
              <button type="button" class="coach-replay-set-btn" data-action="replay" data-set-id="${escapeHtml(setId)}" aria-label="Replay set ${set.setNumber}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span class="sr-only">Replay</span></button>
              <button type="button" class="coach-expand-btn" data-toggle-id="${escapeHtml(setId)}" aria-label="Toggle details for set ${set.setNumber}">${isExpanded ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"></polyline></svg><span class="sr-only">Hide Reps</span>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg><span class="sr-only">View Reps</span>'}</button>
            </div>
          </td>
        </tr>
      `;

      if (isExpanded && set.reps && set.reps.length > 0) {
        rowsHtml += `
          <tr class="coach-expanded-drawer-row" id="drawer-${escapeHtml(setId)}">
            <td colspan="10">
              <div class="coach-rep-drawer-inner">
                <table class="coach-rep-subtable">
                  <thead>
                    <tr>
                      <th>Rep #</th>
                      <th>Mean Velocity</th>
                      <th>Peak Velocity</th>
                      <th>Est. RPE</th>
                      <th>Repetition Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${set.reps.map(r => `
                      <tr>
                        <td>Rep ${r.repNumber}</td>
                        <td class="text-cyan">${(r.velocity || 0).toFixed(2)} m/s</td>
                        <td>${(r.peakVelocity || (r.velocity ? r.velocity * 1.25 : 0)).toFixed(2)} m/s</td>
                        <td>@${(r.rpe || 8.0).toFixed(1)}</td>
                        <td>${(r.isPR || r.isPr) ? goldenPrBadgeHtml(false) : 'Completed'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        `;
      }
    });

    elements.setsTableBody.innerHTML = rowsHtml;

    // Attach row / button expand handlers
    const expandButtons = elements.setsTableBody.querySelectorAll('.coach-expand-btn');
    expandButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-toggle-id');
        toggleSetExpansion(id);
      });
    });

    const replayButtons = elements.setsTableBody.querySelectorAll('.coach-replay-set-btn');
    replayButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-set-id');
        replayCompletedSet(id);
      });
    });

    const rows = elements.setsTableBody.querySelectorAll('.coach-history-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-set-id');
        toggleSetExpansion(id);
      });
    });
  }

  function toggleSetExpansion(setId) {
    if (!setId) return;
    if (expandedSetIds.has(setId)) {
      expandedSetIds.delete(setId);
    } else {
      expandedSetIds.add(setId);
    }
    renderSetsHistoryTable();
  }

  // ── Coach Bar Path & Replay Engine (Requirement R2) ──
  function initCoachBarpathHandlers() {
    if (!elements.barpathCard) queryElements();

    if (elements.btnBarpathMode && !elements.btnBarpathMode._coachBound) {
      updateBarpathModeButton(coachCanvasMode);
      elements.btnBarpathMode.addEventListener('click', toggleCoachCanvasMode);
      elements.btnBarpathMode._coachBound = true;
    }

    if (elements.btnBarpathReplay && !elements.btnBarpathReplay._coachBound) {
      elements.btnBarpathReplay.addEventListener('click', toggleCoachReplay);
      elements.btnBarpathReplay._coachBound = true;
    }

    if (elements.btnBarpathSpeed && !elements.btnBarpathSpeed._coachBound) {
      elements.btnBarpathSpeed.textContent = `${coachReplaySpeed.toFixed(1)}x`;
      elements.btnBarpathSpeed.addEventListener('click', toggleCoachReplaySpeed);
      elements.btnBarpathSpeed._coachBound = true;
    }

    if (elements.barpathScrubber && !elements.barpathScrubber._coachBound) {
      elements.barpathScrubber.addEventListener('input', (e) => {
        pauseCoachReplay();
        coachScrubProgress = Math.max(0, Math.min(1.0, Number(e.target.value) / 100));
        renderCoachBarPathCanvas();
      });
      elements.barpathScrubber._coachBound = true;
    }

    renderCoachBarPathCanvas();
  }

  function renderCoachBarPathCanvas() {
    if (!elements.barpathCanvas) queryElements();
    const canvas = elements.barpathCanvas;
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width || 280;
    const h = canvas.height || 210;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    const plumbX = w / 2; // 140
    const topY = 25;
    const botY = h - 25; // 185
    const corridorWidth2cm = 32; // ~16px per cm
    const corridorWidth4cm = 64;

    if (coachCanvasMode === 'PATH') {
      // Mode A: Sagittal 2D Deviation (cm vs % ROM)
      ctx.save();

      // 0.0 cm plumb line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash([4, 4]);
      ctx.moveTo(plumbX, topY - 10);
      ctx.lineTo(plumbX, botY + 10);
      ctx.stroke();
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

      // ±2.0 cm corridor
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
      ctx.strokeRect(plumbX - corridorWidth2cm, topY, corridorWidth2cm * 2, botY - topY);

      // ±4.0 cm corridor
      ctx.strokeStyle = 'rgba(255, 59, 48, 0.08)';
      ctx.strokeRect(plumbX - corridorWidth4cm, topY, corridorWidth4cm * 2, botY - topY);

      // Rep 1 Ghost Trail (if active rep is > 0)
      if (coachRep1Trajectory && coachRep1Trajectory.length > 1 && coachSelectedRepIdx > 0) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([3, 3]);
        coachRep1Trajectory.forEach((pt, i) => {
          const ptRom = (pt.y != null) ? pt.y : 0;
          const maxRom = coachRep1Trajectory[coachRep1Trajectory.length - 1]?.y || 54.0;
          const pct = maxRom > 0 ? ptRom / maxRom : i / (coachRep1Trajectory.length - 1);
          const px = plumbX + (pt.dx || 0) * 16;
          const py = botY - pct * (botY - topY);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
      }

      // Active Trajectory Curve up to coachScrubProgress
      const pts = coachActiveTrajectory;
      if (pts && pts.length > 1) {
        const totalPts = pts.length;
        const visiblePtsCount = Math.max(2, Math.min(totalPts, Math.ceil(coachScrubProgress * totalPts)));
        const maxRom = pts[totalPts - 1]?.y || 54.0;

        for (let i = 1; i < visiblePtsCount; i++) {
          const pPrev = pts[i - 1];
          const pCur = pts[i];
          const pctPrev = maxRom > 0 ? (pPrev.y || 0) / maxRom : (i - 1) / (totalPts - 1);
          const pctCur = maxRom > 0 ? (pCur.y || 0) / maxRom : i / (totalPts - 1);

          const x1 = plumbX + (pPrev.dx || 0) * 16;
          const y1 = botY - pctPrev * (botY - topY);
          const x2 = plumbX + (pCur.dx || 0) * 16;
          const y2 = botY - pctCur * (botY - topY);

          // Color-grade segments by drift deviation
          const drift = Math.abs(pCur.dx || 0);
          let segColor = '#00FF66';
          if (drift > 3.5) segColor = '#FF3B30';
          else if (drift > 2.0) segColor = '#FFB800';

          ctx.beginPath();
          ctx.strokeStyle = segColor;
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        // Barbell Puck at current scrub point
        const curPt = pts[visiblePtsCount - 1];
        const curPct = maxRom > 0 ? (curPt.y || 0) / maxRom : (visiblePtsCount - 1) / (totalPts - 1);
        const puckX = plumbX + (curPt.dx || 0) * 16;
        const puckY = botY - curPct * (botY - topY);

        ctx.beginPath();
        ctx.arc(puckX, puckY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#00E5FF';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    } else {
      // Mode B: Velocity vs ROM Profile (Instantaneous m/s vs % ROM)
      ctx.save();

      // Axis grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(35, topY);
      ctx.lineTo(35, botY);
      ctx.lineTo(w - 20, botY);
      ctx.stroke();

      const pts = coachActiveTrajectory;
      if (pts && pts.length > 1) {
        const totalPts = pts.length;
        const visiblePtsCount = Math.max(2, Math.min(totalPts, Math.ceil(coachScrubProgress * totalPts)));
        const maxRom = pts[totalPts - 1]?.y || 54.0;
        const maxV = 1.2; // ceiling 1.2 m/s

        ctx.beginPath();
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';

        for (let i = 0; i < visiblePtsCount; i++) {
          const pt = pts[i];
          const pct = maxRom > 0 ? (pt.y || 0) / maxRom : i / (totalPts - 1);
          const vel = Math.min(maxV, Math.max(0, pt.v || 0));
          const px = 35 + (vel / maxV) * (w - 60);
          const py = botY - pct * (botY - topY);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Cursor Puck
        const curPt = pts[visiblePtsCount - 1];
        const curPct = maxRom > 0 ? (curPt.y || 0) / maxRom : (visiblePtsCount - 1) / (totalPts - 1);
        const curV = Math.min(maxV, Math.max(0, curPt.v || 0));
        const puckX = 35 + (curV / maxV) * (w - 60);
        const puckY = botY - curPct * (botY - topY);

        ctx.beginPath();
        ctx.arc(puckX, puckY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#FFB800';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function playCoachReplay() {
    coachPlaybackActive = true;
    updateCoachReplayButtonState();

    if (coachScrubProgress >= 1.0) {
      coachScrubProgress = 0.0;
      if (elements.barpathScrubber) elements.barpathScrubber.value = '0';
    }

    const durationMs = (1200 / coachReplaySpeed);
    let startTime = null;
    const initialProgress = coachScrubProgress;

    function animStep(timestamp) {
      if (!coachPlaybackActive) return;
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(1.0, initialProgress + (elapsed / durationMs));
      coachScrubProgress = progress;

      if (elements.barpathScrubber) {
        elements.barpathScrubber.value = Math.round(progress * 100);
      }
      renderCoachBarPathCanvas();

      if (progress < 1.0) {
        coachPlaybackAnimFrame = (typeof requestAnimationFrame === 'function')
          ? requestAnimationFrame(animStep)
          : null;
      } else {
        pauseCoachReplay();
      }
    }

    if (coachPlaybackAnimFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(coachPlaybackAnimFrame);
    }
    if (typeof requestAnimationFrame === 'function') {
      coachPlaybackAnimFrame = requestAnimationFrame(animStep);
    } else {
      coachScrubProgress = 1.0;
      if (elements.barpathScrubber) elements.barpathScrubber.value = '100';
      renderCoachBarPathCanvas();
      pauseCoachReplay();
    }
  }

  function pauseCoachReplay() {
    coachPlaybackActive = false;
    if (coachPlaybackAnimFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(coachPlaybackAnimFrame);
      coachPlaybackAnimFrame = null;
    }
    updateCoachReplayButtonState();
  }

  function toggleCoachReplay() {
    if (coachPlaybackActive) {
      pauseCoachReplay();
    } else {
      playCoachReplay();
    }
  }

  function updateCoachReplayButtonState() {
    if (!elements.btnBarpathReplay) queryElements();
    const btn = elements.btnBarpathReplay;
    if (!btn) return;
    const labelEl = btn.querySelector ? btn.querySelector('span') : null;
    const svgEl = btn.querySelector ? btn.querySelector('svg') : null;
    if (coachPlaybackActive) {
      if (svgEl) {
        svgEl.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
      }
      if (labelEl) {
        labelEl.textContent = 'Pause';
      } else if (!svgEl) {
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
          <span>Pause</span>
        `;
      }
      btn.classList.add('active');
    } else {
      if (svgEl) {
        svgEl.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
      }
      if (labelEl) {
        labelEl.textContent = 'Replay';
      } else if (!svgEl) {
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>Replay</span>
        `;
      }
      btn.classList.remove('active');
    }
  }

  function toggleCoachReplaySpeed() {
    coachReplaySpeed = (coachReplaySpeed === 1.0) ? 0.5 : 1.0;
    if (elements.btnBarpathSpeed) {
      elements.btnBarpathSpeed.textContent = `${coachReplaySpeed.toFixed(1)}x`;
    }
  }

  function toggleCoachCanvasMode() {
    coachCanvasMode = (coachCanvasMode === 'PATH') ? 'VEL' : 'PATH';
    updateBarpathModeButton(coachCanvasMode);
    renderCoachBarPathCanvas();
  }

  function loadCoachRepTrajectory(repIdxOrPoints, maxDevArg, effArg) {
    if (Array.isArray(repIdxOrPoints)) {
      coachActiveTrajectory = repIdxOrPoints;
      const maxDev = (typeof maxDevArg === 'number') ? maxDevArg : 0;
      const eff = (typeof effArg === 'number') ? effArg : 100.0;
      if (elements.devSummary) {
        elements.devSummary.textContent = `Max Dev: ${maxDev >= 0 ? '+' : ''}${maxDev.toFixed(1)} cm • Eff: ${eff.toFixed(1)}%`;
      }
      renderCoachBarPathCanvas();
      return;
    }

    const repIdx = repIdxOrPoints;
    if (!coachActiveReps || !coachActiveReps.length) return;
    if (repIdx < 0 || repIdx >= coachActiveReps.length) return;

    coachSelectedRepIdx = repIdx;
    const rep = coachActiveReps[repIdx];
    if (rep.trajectoryPoints && rep.trajectoryPoints.length > 0) {
      coachActiveTrajectory = rep.trajectoryPoints;
    } else if (typeof window !== 'undefined' && typeof window.synthesizeRepTrajectory === 'function') {
      const lift = (currentAthlete && currentAthlete.currentLift) || 'Deadlift';
      const synth = window.synthesizeRepTrajectory(lift, rep.velocity || 0.6, rep.deviationCm, rep.rom || 54.0);
      coachActiveTrajectory = synth.points;
    }

    const maxDev = (typeof rep.maxDeviationCm === 'number') ? rep.maxDeviationCm : (rep.deviationCm || 0);
    const eff = (typeof rep.pathEfficiencyPct === 'number') ? rep.pathEfficiencyPct : 100.0;
    if (elements.devSummary) {
      elements.devSummary.textContent = `Max Dev: ${maxDev >= 0 ? '+' : ''}${maxDev.toFixed(1)} cm • Eff: ${eff.toFixed(1)}%`;
    }

    // Update active rep pill highlighting in #coach-barpath-rep-pills
    if (elements.barpathRepPills) {
      elements.barpathRepPills.querySelectorAll('.coach-barpath-rep-pill').forEach((pill, idx) => {
        if (idx === repIdx) pill.classList.add('active');
        else pill.classList.remove('active');
      });
    }

    // Update active rep stream pill highlighting in #coach-live-reps-stream
    if (elements.repsStream) {
      elements.repsStream.querySelectorAll('.coach-rep-stream-pill').forEach((pill, idx) => {
        if (idx === repIdx) pill.classList.add('active');
        else pill.classList.remove('active');
      });
    }

    // Update Live RPE Pill readout to this rep
    updateCoachRpePill(rep.rpe || 8.0, maxDev, rep.lossPercent || 0);

    renderCoachBarPathCanvas();
  }

  function updateCoachRpePill(rpeVal, deviationCm = 0, lossPct = 0) {
    if (!elements.liveRpe) queryElements();
    const rpe = Number(rpeVal) || 8.0;
    if (elements.liveRpe) elements.liveRpe.textContent = `@${rpe.toFixed(1)}`;
    if (elements.liveRirPill) elements.liveRirPill.textContent = `${Math.max(0, 10.0 - rpe).toFixed(1)} RIR`;

    if (elements.rpeTierBadge) {
      let tier = 'Moderate';
      let tierClass = 'tier-optimal';
      if (rpe < 6.5) {
        tier = 'Warmup';
        tierClass = 'tier-optimal';
      } else if (rpe < 7.5) {
        tier = 'Speed';
        tierClass = 'tier-optimal';
      } else if (rpe < 8.5) {
        tier = 'Moderate';
        tierClass = 'tier-optimal';
      } else if (rpe < 9.5) {
        tier = 'Heavy';
        tierClass = 'tier-heavy';
      } else {
        tier = 'Max Effort';
        tierClass = 'tier-limit';
      }
      elements.rpeTierBadge.textContent = tier;
      elements.rpeTierBadge.className = `coach-tier-badge ${tierClass} font-mono`;
    }

    if (elements.rpeGaugeFill) {
      const pct = Math.min(100, Math.max(10, rpe * 10));
      elements.rpeGaugeFill.style.width = `${pct}%`;
    }

    if (elements.rpeTargetPin) {
      const targetPct = Math.min(100, Math.max(10, coachActiveTargetRpe * 10));
      const targetText = `Target @${coachActiveTargetRpe.toFixed(1)}`;
      elements.rpeTargetPin.style.left = `${targetPct}%`;
      if (typeof elements.rpeTargetPin.removeAttribute === 'function') {
        elements.rpeTargetPin.removeAttribute('title');
      }
      const pinLabel = typeof elements.rpeTargetPin.querySelector === 'function'
        ? (elements.rpeTargetPin.querySelector('.coach-rpe-target-label') || elements.rpeTargetPin.querySelector('span'))
        : null;
      if (pinLabel) {
        pinLabel.textContent = targetText;
      } else if (elements.rpeTargetPin.textContent && (!elements.rpeTargetPin.children || elements.rpeTargetPin.children.length === 0)) {
        elements.rpeTargetPin.textContent = targetText;
      }
    }

    if (elements.rpeSub) {
      if (Math.abs(deviationCm) > 3.0) {
        elements.rpeSub.textContent = 'Technical Drift Detected';
        elements.rpeSub.style.color = '#FF3B30';
      } else if (lossPct >= 20.0) {
        elements.rpeSub.textContent = 'Fatigue Ceiling Reached';
        elements.rpeSub.style.color = '#FF3B30';
      } else if (rpe >= coachActiveTargetRpe) {
        elements.rpeSub.textContent = 'Target RPE Attained';
        elements.rpeSub.style.color = '#00E5FF';
      } else {
        elements.rpeSub.textContent = 'On Target Groove';
        elements.rpeSub.style.color = '#00FF66';
      }
    }
  }

  function renderCoachBarpathRepPills() {
    if (!elements.barpathRepPills) queryElements();
    const container = elements.barpathRepPills;
    if (!container) return;
    if (!coachActiveReps || !coachActiveReps.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = coachActiveReps.map((r, idx) => `
      <button type="button" class="coach-barpath-rep-pill ${idx === coachSelectedRepIdx ? 'active' : ''}" data-rep-idx="${idx}" data-prep-tooltip-key="coach_barpath_rep_pill" aria-label="Select Rep ${r.repNumber || idx + 1}">
        R${r.repNumber || idx + 1}
      </button>
    `).join('');

    container.querySelectorAll('.coach-barpath-rep-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-rep-idx'), 10);
        loadCoachRepTrajectory(idx);
        playCoachReplay();
      });
    });
  }

  function replayCompletedSet(setIdOrSet) {
    let targetSet = null;
    if (typeof setIdOrSet === 'object' && setIdOrSet !== null) {
      targetSet = setIdOrSet;
    } else {
      const safeWorkout = getSafeActiveWorkout();
      const sets = (safeWorkout && Array.isArray(safeWorkout.sets)) ? safeWorkout.sets : [];
      targetSet = sets.find(s => (s.setId || `set_${s.setNumber}`) === setIdOrSet);
    }
    if (!targetSet) return;

    let repsList = [];
    if (Array.isArray(targetSet.reps) && targetSet.reps.length > 0) {
      repsList = targetSet.reps;
    } else {
      repsList = [{
        repNumber: 1,
        velocity: targetSet.mcv || targetSet.avgVelocity || 0.6,
        peakVelocity: targetSet.peakVelocity || targetSet.maxVelocity || 0.8,
        rom: targetSet.rom || 54.0,
        lossPercent: targetSet.velocityLoss || targetSet.velocityLossPct || 0,
        deviationCm: targetSet.deviationCm,
        maxDeviationCm: targetSet.maxDeviationCm || targetSet.deviationCm,
        pathEfficiencyPct: targetSet.pathEfficiencyPct,
        trajectoryPoints: targetSet.trajectoryPoints
      }];
    }

    coachActiveReps = repsList.map((r, idx) => ({
      repNumber: r.repNumber || idx + 1,
      velocity: r.velocity || 0,
      peakVelocity: r.peakVelocity || (r.velocity ? r.velocity * 1.25 : 0),
      rom: r.rom || 54.0,
      lossPercent: r.lossPercent || 0,
      rpe: r.rpe || targetSet.avgRpe || 8.0,
      deviationCm: r.deviationCm,
      maxDeviationCm: r.maxDeviationCm || r.deviationCm,
      pathEfficiencyPct: r.pathEfficiencyPct,
      trajectoryPoints: r.trajectoryPoints
    }));

    if (coachActiveReps[0] && coachActiveReps[0].trajectoryPoints) {
      coachRep1Trajectory = coachActiveReps[0].trajectoryPoints;
    } else {
      coachRep1Trajectory = null;
    }

    renderCoachBarpathRepPills();
    loadCoachRepTrajectory(0);
    playCoachReplay();
    showFeedbackMessage(`Loaded Set ${targetSet.setNumber} trajectory for replay`);
  }

  function stepCoachRepSelection(delta) {
    if (!coachActiveReps || !coachActiveReps.length) return;
    let nextIdx = coachSelectedRepIdx + delta;
    if (nextIdx < 0) nextIdx = coachActiveReps.length - 1;
    if (nextIdx >= coachActiveReps.length) nextIdx = 0;
    loadCoachRepTrajectory(nextIdx);
    playCoachReplay();
  }

  // ── Feedback Controls & Downlink Dispatch ──
  function initFeedbackHandlers() {
    if (elements.loadPills && elements.loadPills.length > 0) {
      elements.loadPills.forEach(pill => {
        if (pill._coachBound) return;
        pill.addEventListener('click', () => {
          if (typeof SoundFX !== 'undefined' && typeof SoundFX.playCoachPillSelect === 'function') {
            try { SoundFX.playCoachPillSelect(); } catch (_) {}
          }
          const delta = parseFloat(pill.getAttribute('data-delta') || '0');
          const currentWeight = getSafeWorkingWeight();
          const newWeight = Math.max(0, currentWeight + delta);
          const cueText = delta !== 0
            ? `Load modification: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg for next set (${newWeight.toFixed(1)} kg)`
            : `Keep current working load (${currentWeight.toFixed(1)} kg)`;

          sendCoachPrescription(cueText, delta, newWeight);
        });
        pill._coachBound = true;
      });
    }

    if (elements.restPills && elements.restPills.length > 0) {
      elements.restPills.forEach(pill => {
        if (pill._coachBound) return;
        pill.addEventListener('click', () => {
          if (typeof SoundFX !== 'undefined' && typeof SoundFX.playCoachPillSelect === 'function') {
            try { SoundFX.playCoachPillSelect(); } catch (_) {}
          }
          elements.restPills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          const targetSeconds = parseInt(pill.getAttribute('data-rest-seconds') || '180', 10);
          const targetId = currentAthlete ? currentAthlete.id : 'ath_01';

          if (currentAthlete) {
            currentAthlete.prescribedRestSeconds = targetSeconds;
          }

          if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
            window.ErosSyncBus.emit('coach:rest_target', {
              athleteId: targetId,
              targetSeconds: targetSeconds,
              timestamp: Date.now()
            });
          }

          if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('eros:coach_rest_target', {
              detail: { athleteId: targetId, targetSeconds: targetSeconds, timestamp: Date.now() }
            }));
          }

          showFeedbackMessage(`Configured target rest: ${targetSeconds}s for ${currentAthlete ? currentAthlete.name : 'Athlete'}`);
        });
        pill._coachBound = true;
      });
    }

    if (elements.cueChips && elements.cueChips.length > 0) {
      elements.cueChips.forEach(chip => {
        if (chip._coachBound) return;
        chip.addEventListener('click', () => {
          if (typeof SoundFX !== 'undefined' && typeof SoundFX.playCoachPillSelect === 'function') {
            try { SoundFX.playCoachPillSelect(); } catch (_) {}
          }
          const cue = chip.getAttribute('data-cue');
          if (cue) {
            sendCoachPrescription(cue, 0, getSafeWorkingWeight());
          }
        });
        chip._coachBound = true;
      });
    }

    if (elements.btnSendCustom && elements.customCueInput && !elements.btnSendCustom._coachBound) {
      elements.btnSendCustom.addEventListener('click', handleCustomCueSubmit);
      elements.customCueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCustomCueSubmit();
        }
      });
      elements.btnSendCustom._coachBound = true;
    }

    renderCoachPrescribedBridge();
  }

  function getTodayPrescribedBridgeContext() {
    const athleteId = currentAthlete ? currentAthlete.id : 'ath_01';
    const todayStr = formatIsoDate(new Date());
    let workouts = [];
    if (prepState.athleteId === athleteId && Array.isArray(prepState.workouts) && prepState.workouts.length > 0) {
      workouts = prepState.workouts;
    } else {
      const fromStore = callPrepStore(['listPlannedWorkouts'], [athleteId]);
      if (Array.isArray(fromStore) && fromStore.length > 0) {
        workouts = fromStore;
      } else {
        const local = readLocalPrepDraft(athleteId);
        if (local && Array.isArray(local.workouts)) workouts = local.workouts;
      }
    }
    const todayWorkout = workouts.find(w => w && w.scheduledDate === todayStr && Array.isArray(w.prescribedSlots) && w.prescribedSlots.length > 0) || null;
    if (!todayWorkout) return null;
    const activeLift = currentAthlete && currentAthlete.currentLift ? String(currentAthlete.currentLift).toLowerCase() : '';
    const slot = (activeLift
      ? todayWorkout.prescribedSlots.find(s => s && String(s.lift || s.exerciseName || s.exerciseId || '').toLowerCase().includes(activeLift))
      : null) || todayWorkout.prescribedSlots[0];
    if (!slot) return null;
    return { athleteId, workout: todayWorkout, slot };
  }

  function renderCoachPrescribedBridge() {
    const consoleEl = elements.feedbackConsole || (typeof document !== 'undefined' ? document.getElementById('coach-feedback-console') : null);
    if (!consoleEl || typeof document === 'undefined') return;
    let bridgeEl = consoleEl.querySelector ? consoleEl.querySelector('#coach-prescribed-bridge') : document.getElementById('coach-prescribed-bridge');
    if (!bridgeEl && typeof document.createElement === 'function') {
      bridgeEl = document.createElement('div');
      bridgeEl.id = 'coach-prescribed-bridge';
      bridgeEl.className = 'coach-console-block coach-prescribed-bridge';
      const headerEl = consoleEl.querySelector ? consoleEl.querySelector('.coach-console-header') : null;
      if (headerEl && headerEl.nextSibling) {
        consoleEl.insertBefore(bridgeEl, headerEl.nextSibling);
      } else {
        consoleEl.appendChild(bridgeEl);
      }
    }
    if (!bridgeEl) return;

    const ctx = getTodayPrescribedBridgeContext();
    if (!ctx) {
      bridgeEl.innerHTML = '<span class="coach-block-label">Today\'s Prescribed Slot:</span><div class="coach-prescribed-bridge-empty font-mono">No scheduled slot today</div>';
      return;
    }

    const { athleteId, workout, slot } = ctx;
    const liftLabel = slot.exerciseName || slot.lift || slot.exerciseId || 'Squat';
    const topSet = slot.topSet || {};
    const topWeight = Number(topSet.loadKg || topSet.suggestedLoadKg || 0);
    const topRpe = Number(topSet.targetRpe || topSet.rpe || 8.0);
    const backSet = slot.backoff || slot.backoffSets || null;
    const backWeight = backSet
      ? Number(backSet.loadKg || backSet.suggestedLoadKg || (topWeight > 0 && Number(backSet.dropPct) > 0 ? (topWeight * (1 - Number(backSet.dropPct) / 100)) : 0))
      : 0;
    const backRpe = backSet ? Number(backSet.targetRpe || backSet.rpe || 7.0) : 7.0;

    const setXText = `Set X: ${topWeight.toFixed(1)} kg @ RPE ${topRpe.toFixed(1)}`;
    const setYText = backSet ? `Set Y: ${backWeight.toFixed(1)} kg @ RPE ${backRpe.toFixed(1)}` : '';

    bridgeEl.innerHTML = `
      <span class="coach-block-label">Today's Prescribed Slot (${escapeHtml(liftLabel)}):</span>
      <div class="coach-prescribed-bridge-row">
        <div class="coach-prescribed-bridge-item">
          <span class="coach-prescribed-bridge-spec font-mono">${escapeHtml(setXText)}</span>
          <button type="button" id="btn-coach-push-set-x" class="coach-load-pill coach-prescribed-push-btn" data-prep-tooltip-key="prep_set_x_top" aria-label="Push Set X (${escapeHtml(setXText)})">Push Set X</button>
        </div>
        ${backSet ? `
        <div class="coach-prescribed-bridge-item">
          <span class="coach-prescribed-bridge-spec font-mono">${escapeHtml(setYText)}</span>
          <button type="button" id="btn-coach-push-set-y" class="coach-load-pill coach-prescribed-push-btn" data-prep-tooltip-key="prep_set_y_backoff" aria-label="Push Set Y (${escapeHtml(setYText)})">Push Set Y</button>
        </div>` : ''}
      </div>
    `;

    const pushSetXBtn = bridgeEl.querySelector ? bridgeEl.querySelector('#btn-coach-push-set-x') : document.getElementById('btn-coach-push-set-x');
    if (pushSetXBtn) {
      pushSetXBtn.addEventListener('click', () => {
        const currentLoadKg = getSafeWorkingWeight() || (currentAthlete ? Number(currentAthlete.currentLoadKg) || 0 : 0);
        const deltaKg = Number((topWeight - currentLoadKg).toFixed(2));
        sendCoachPrescription(
          `Prescribed Set X: ${liftLabel} ${topWeight.toFixed(1)} kg @ RPE ${topRpe.toFixed(1)}`,
          deltaKg,
          topWeight,
          athleteId,
          {
            forceLoadOverride: true,
            targetRpe: topRpe,
            plannedWorkoutId: workout.workoutId,
            plannedSlotId: slot.slotId,
            lift: liftLabel,
            setRole: 'topSet'
          }
        );
      });
    }

    const pushSetYBtn = bridgeEl.querySelector ? bridgeEl.querySelector('#btn-coach-push-set-y') : document.getElementById('btn-coach-push-set-y');
    if (pushSetYBtn && backSet) {
      pushSetYBtn.addEventListener('click', () => {
        const currentLoadKg = getSafeWorkingWeight() || (currentAthlete ? Number(currentAthlete.currentLoadKg) || 0 : 0);
        const deltaKg = Number((backWeight - currentLoadKg).toFixed(2));
        sendCoachPrescription(
          `Prescribed Set Y: ${liftLabel} ${backWeight.toFixed(1)} kg @ RPE ${backRpe.toFixed(1)}`,
          deltaKg,
          backWeight,
          athleteId,
          {
            forceLoadOverride: true,
            targetRpe: backRpe,
            plannedWorkoutId: workout.workoutId,
            plannedSlotId: slot.slotId,
            lift: liftLabel,
            setRole: 'backoff'
          }
        );
      });
    }
  }

  function handleCustomCueSubmit() {
    if (!elements.customCueInput) return;
    const text = elements.customCueInput.value.trim();
    if (!text) return;
    sendCoachPrescription(text, 0, getSafeWorkingWeight());
    elements.customCueInput.value = '';
  }

  function sendCoachPrescription(cueText, deltaKg, targetWeight, targetAthleteId, options) {
    const activeSetRef = getSafeActiveSet();
    const nextSetNumber = activeSetRef ? (activeSetRef.setNumber + 1) : 1;
    const targetId = targetAthleteId || (currentAthlete ? currentAthlete.id : 'ath_01');
    const opts = (options && typeof options === 'object') ? options : {};
    const forceLoadOverride = Boolean(opts.forceLoadOverride);
    const hasLoadOverride = deltaKg !== 0 || forceLoadOverride;

    const payload = {
      id: `cmd_cue_${Date.now()}`,
      coachName: 'Coach Marcus',
      athleteId: targetId,
      setNumber: nextSetNumber,
      text: cueText,
      deltaKg: deltaKg,
      newWeight: targetWeight,
      type: hasLoadOverride ? 'load_override' : 'technical',
      autoAcceptSeconds: 20,
      timestamp: Date.now()
    };

    if (opts.targetRpe !== undefined && isFinite(Number(opts.targetRpe))) {
      payload.targetRpe = Number(opts.targetRpe);
    }
    if (opts.plannedWorkoutId) payload.plannedWorkoutId = String(opts.plannedWorkoutId);
    if (opts.plannedSlotId) payload.plannedSlotId = String(opts.plannedSlotId);
    if (opts.lift) payload.lift = String(opts.lift);
    if (opts.setRole) payload.setRole = String(opts.setRole);

    // 1. Dispatch via ErosSyncBus if present
    if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
      window.ErosSyncBus.emit('coach:cue', payload);
      if (hasLoadOverride) {
        window.ErosSyncBus.emit('coach:load_override', payload);
      }
    }

    // 2. Dispatch via DOM CustomEvent for intra-page listeners
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('eros:coach_cue', { detail: payload }));
      if (hasLoadOverride) {
        window.dispatchEvent(new CustomEvent('eros:coach_load_override', { detail: payload }));
      }
    }

    if (typeof SoundFX !== 'undefined' && typeof SoundFX.playCoachActionSend === 'function') {
      try { SoundFX.playCoachActionSend(); } catch (_) {}
    }

    // 3. Pin #coach-rpe-target-pin when targetRpe is prescribed
    if (payload.targetRpe !== undefined) {
      coachActiveTargetRpe = payload.targetRpe;
      const pin = elements.rpeTargetPin || (typeof document !== 'undefined' ? document.getElementById('coach-rpe-target-pin') : null);
      if (pin) {
        const targetPct = Math.min(100, Math.max(10, coachActiveTargetRpe * 10));
        const targetText = `Target @${coachActiveTargetRpe.toFixed(1)}`;
        pin.style.left = `${targetPct}%`;
        if (typeof pin.removeAttribute === 'function') pin.removeAttribute('title');
        const pinLabel = typeof pin.querySelector === 'function'
          ? (pin.querySelector('.coach-rpe-target-label') || pin.querySelector('span'))
          : null;
        if (pinLabel) {
          pinLabel.textContent = targetText;
        }
      }
    }

    // 4. Local state synchronization with athlete working load (only for local primary athlete ath_01)
    if (targetId === 'ath_01' && hasLoadOverride && typeof targetWeight === 'number') {
      const liveWeightInput = document.getElementById('live-set-weight-input');
      const workoutWeightInput = document.getElementById('workout-set-weight-input');
      if (liveWeightInput) liveWeightInput.value = targetWeight.toFixed(1);
      if (workoutWeightInput) workoutWeightInput.value = targetWeight.toFixed(1);
      if (typeof currentWorkingWeight !== 'undefined') {
        try { currentWorkingWeight = targetWeight; } catch (_) {}
      }
    }

    const sign = deltaKg > 0 ? '+' : '';
    const summary = hasLoadOverride
      ? `Dispatched: "${cueText}" [${sign}${deltaKg} kg]`
      : `Dispatched technical cue: "${cueText}"`;

    showFeedbackMessage(summary);
  }

  function hookAppLifecycle() {
    if (typeof window === 'undefined') return;

    if (typeof window.applyLiftTheme === 'function' && !window.applyLiftTheme._coachHooked) {
      const origApplyLiftTheme = window.applyLiftTheme;
      window.applyLiftTheme = function () {
        const res = origApplyLiftTheme.apply(this, arguments);
        if (isCoachMode && typeof document !== 'undefined' && document.body && document.body.classList) {
          document.body.classList.add('portal-coach');
        }
        return res;
      };
      window.applyLiftTheme._coachHooked = true;
    }

    if (isCoachMode && typeof document !== 'undefined' && document.body && document.body.classList && !document.body.classList.contains('portal-coach')) {
      document.body.classList.add('portal-coach');
    }

    if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.body && !document.body._coachClassObserver) {
      try {
        const observer = new MutationObserver(() => {
          if (isCoachMode && document.body && document.body.classList && !document.body.classList.contains('portal-coach')) {
            document.body.classList.add('portal-coach');
          }
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        document.body._coachClassObserver = observer;
      } catch (_) {}
    }

    if (typeof window.startNewSet === 'function' && !window.startNewSet._coachHooked) {
      const origStart = window.startNewSet;
      window.startNewSet = function (lift) {
        const res = origStart.apply(this, arguments);
        const payload = {
          setId: res ? res.setId : `set_${Date.now()}`,
          setNumber: res ? res.setNumber : 1,
          lift: res ? res.lift : lift,
          weight: res ? res.weight : getSafeWorkingWeight(),
          timestamp: Date.now()
        };
        if (window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
          window.ErosSyncBus.emit('set:started', payload);
        } else {
          handleSetStarted(payload);
        }
        return res;
      };
      window.startNewSet._coachHooked = true;
    }

    if (typeof window.recordRepetition === 'function' && !window.recordRepetition._coachHooked) {
      const origRecord = window.recordRepetition;
      window.recordRepetition = function (repData) {
        const res = origRecord.apply(this, arguments);
        const safeSet = getSafeActiveSet();
        const payload = {
          setId: safeSet ? safeSet.setId : '',
          setNumber: safeSet ? safeSet.setNumber : 1,
          repNumber: safeSet && safeSet.reps ? safeSet.reps.length : 1,
          velocity: repData ? repData.velocity : 0,
          peakVelocity: repData ? repData.velocity * 1.25 : 0,
          rom: 54.0,
          rpe: repData ? repData.rpe : 8.0,
          lossPercent: safeSet ? safeSet.velocityLossPct : 0,
          timestamp: Date.now()
        };
        if (window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
          window.ErosSyncBus.emit('rep:recorded', payload);
        } else {
          handleRepRecorded(payload);
        }
        return res;
      };
      window.recordRepetition._coachHooked = true;
    }

    if (typeof window.endActiveSet === 'function' && !window.endActiveSet._coachHooked) {
      const origEnd = window.endActiveSet;
      window.endActiveSet = function () {
        const endingSet = getSafeActiveSet();
        const res = origEnd.apply(this, arguments);
        const payload = {
          setId: endingSet ? endingSet.setId : '',
          setNumber: endingSet ? endingSet.setNumber : 1,
          lift: endingSet ? endingSet.lift : '',
          weight: endingSet ? endingSet.weight : 0,
          reps: endingSet ? endingSet.reps : [],
          avgVelocity: endingSet ? endingSet.avgVelocity : 0,
          maxVelocity: endingSet ? endingSet.maxVelocity : 0,
          velocityLoss: endingSet ? endingSet.velocityLossPct : 0,
          isPr: Boolean(endingSet && (endingSet.isPr || endingSet.isPR)),
          timestamp: Date.now()
        };
        if (window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
          window.ErosSyncBus.emit('set:completed', payload);
        } else {
          handleSetCompleted(payload);
        }
        return res;
      };
      window.endActiveSet._coachHooked = true;
    }
  }

  function showFeedbackMessage(msg) {
    if (!elements.feedbackStatus) queryElements();
    if (!elements.feedbackStatus) return;

    elements.feedbackStatus.textContent = msg;
    elements.feedbackStatus.style.opacity = '1';
    if (elements.feedbackStatus.classList) {
      elements.feedbackStatus.classList.remove('status-pulse');
      if (typeof void 0 !== 'undefined') void elements.feedbackStatus.offsetWidth;
      elements.feedbackStatus.classList.add('status-pulse');
    }

    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      if (elements.feedbackStatus) {
        elements.feedbackStatus.style.opacity = '0';
        if (elements.feedbackStatus.classList) {
          elements.feedbackStatus.classList.remove('status-pulse');
        }
      }
    }, 4000);
  }

  // Auto-init on DOMContentLoaded if document ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        init();
        hookAppLifecycle();
      });
    } else {
      init();
      hookAppLifecycle();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ORBITAL SIDEBAR, MOTION CHOREOGRAPHY & RADIAL LAUNCHER
  // ─────────────────────────────────────────────────────────────────────────────

  function updateCoachNavActiveState(section) {
    const activeSec = String(section || 'live');
    const btns = (elements.coachNavButtons && typeof elements.coachNavButtons.forEach === 'function')
      ? elements.coachNavButtons
      : (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function'
          ? document.querySelectorAll('[data-coach-nav]')
          : []);
    if (!btns || typeof btns.forEach !== 'function') return;
    btns.forEach(btn => {
      if (!btn || !btn.classList) return;
      const sec = btn.getAttribute('data-coach-nav');
      if (sec === activeSec) {
        btn.classList.add('nav-active');
        btn.classList.add('neu-inset-sm');
      } else {
        btn.classList.remove('nav-active');
        btn.classList.remove('neu-inset-sm');
      }
    });
  }

  function highlightCoachSectionElement(el) {
    if (!el) return;
    let shouldScroll = typeof el.scrollIntoView === 'function';
    if (shouldScroll && typeof el.getBoundingClientRect === 'function' && typeof window !== 'undefined') {
      try {
        const rect = el.getBoundingClientRect();
        const winW = window.innerWidth || (typeof document !== 'undefined' && document.documentElement && document.documentElement.clientWidth) || 0;
        const winH = window.innerHeight || (typeof document !== 'undefined' && document.documentElement && document.documentElement.clientHeight) || 0;
        if (winH > 0) {
          const vertFullyVisible = rect.top >= 0 && rect.bottom <= winH;
          const horizVisible = winW <= 0 || (rect.left >= 0 && rect.right <= winW);
          const widescreenVisible = winW >= 1150 && rect.top >= 0 && rect.top < winH && rect.bottom > 0 && horizVisible;
          if ((vertFullyVisible && horizVisible) || widescreenVisible) {
            shouldScroll = false;
          }
        }
      } catch (_) {}
    }
    if (shouldScroll && typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
    }
    if (el.classList) {
      el.classList.add('coach-nav-highlight');
      if (navHighlightTimer) clearTimeout(navHighlightTimer);
      navHighlightTimer = setTimeout(() => {
        if (el.classList) el.classList.remove('coach-nav-highlight');
      }, 1300);
    }
  }

  function toggleCoachSidebar(forceCollapsed) {
    if (!elements.coachSidebar) queryElements();
    const sidebar = elements.coachSidebar;
    const toggleBtn = elements.coachSidebarToggle;
    const currentlyCollapsed = Boolean(sidebar && sidebar.classList && sidebar.classList.contains('coach-sidebar--collapsed'));
    const nextCollapsed = (typeof forceCollapsed === 'boolean') ? forceCollapsed : !currentlyCollapsed;

    if (sidebar && sidebar.classList) {
      if (nextCollapsed) {
        sidebar.classList.add('coach-sidebar--collapsed');
      } else {
        sidebar.classList.remove('coach-sidebar--collapsed');
      }
    }
    if (toggleBtn && typeof toggleBtn.setAttribute === 'function') {
      toggleBtn.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, nextCollapsed ? '1' : '0');
      }
    } catch (_) {}
    updateCoachSidebarTicker();
    return nextCollapsed;
  }

  function navigateCoachSection(section) {
    const sec = String(section || 'live');
    if (!elements.panelLive) queryElements();

    if (sec === 'history' || sec === 'preparation') {
      switchCoachPanel(sec);
      updateCoachNavActiveState(sec);
      writePersistedState(COACH_SECTION_KEY, sec);
      return sec;
    }

    if (sec === 'bonds') {
      openBondModal();
      updateCoachNavActiveState('bonds');
      return 'bonds';
    }

    switchCoachPanel('live');
    updateCoachNavActiveState(sec);
    writePersistedState(COACH_SECTION_KEY, sec);

    if (sec === 'live') {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        const scrollTop = window.scrollY || window.pageYOffset || 0;
        if (scrollTop > 4) {
          try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
        }
      }
    } else if (sec === 'roster') {
      const rosterEl = elements.squadOverview || (typeof document !== 'undefined' ? document.getElementById('coach-squad-overview') : null);
      highlightCoachSectionElement(rosterEl);
    } else if (sec === 'prescriptions') {
      const consoleEl = elements.feedbackConsole || (typeof document !== 'undefined' ? document.getElementById('coach-feedback-console') : null);
      highlightCoachSectionElement(consoleEl);
    } else if (sec === 'sync') {
      const syncEl = elements.cloudSyncPill || (typeof document !== 'undefined' ? document.getElementById('coach-cloud-sync-pill') : null);
      highlightCoachSectionElement(syncEl);
      showFeedbackMessage('Eros Cloud Sync verified: active session telemetry online.');
    }

    return sec;
  }

  function updateCoachSidebarTicker() {
    if (!elements.sidebarRestTime && typeof document !== 'undefined') {
      queryElements();
    }
    const activeAthletes = SQUAD_ATHLETES.filter(a => a.status === 'lifting');
    const restingAthletes = SQUAD_ATHLETES.filter(a => a.status === 'resting');
    const primaryRestTarget = (currentAthlete && currentAthlete.status === 'resting')
      ? currentAthlete
      : (restingAthletes[0] || currentAthlete || null);
    const restSecs = primaryRestTarget ? Math.max(0, Number(primaryRestTarget.restSeconds) || 0) : 0;
    const minsStr = String(Math.floor(restSecs / 60)).padStart(2, '0');
    const secsStr = String(restSecs % 60).padStart(2, '0');

    if (elements.sidebarRestTime) {
      elements.sidebarRestTime.textContent = `${minsStr}:${secsStr}`;
    }
    if (elements.sidebarRestState) {
      if (currentAthlete && currentAthlete.status === 'lifting') {
        elements.sidebarRestState.textContent = 'Lifting';
      } else if (restingAthletes.length > 0) {
        elements.sidebarRestState.textContent = 'Resting';
      } else if (activeAthletes.length > 0) {
        elements.sidebarRestState.textContent = 'Active';
      } else {
        elements.sidebarRestState.textContent = 'Ready';
      }
    }
    if (elements.sidebarActiveCount) {
      elements.sidebarActiveCount.textContent = `${activeAthletes.length} Active`;
    }
    if (elements.sidebarRestingCount) {
      elements.sidebarRestingCount.textContent = `${restingAthletes.length} Rest`;
    }
  }

  function runCoachIntroOverlay() {
    let alreadySeen = false;
    try {
      if (typeof sessionStorage !== 'undefined') {
        alreadySeen = sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
      }
    } catch (_) {}
    if (alreadySeen) return false;

    const overlay = elements.introOverlay || (typeof document !== 'undefined' ? document.getElementById('coach-intro-overlay') : null);
    if (!overlay) return false;

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(INTRO_SEEN_KEY, '1');
      }
    } catch (_) {}

    const textWrap = overlay.querySelector
      ? (overlay.querySelector('.coach-intro-wordmark') || overlay.querySelector('.coach-intro-text'))
      : null;
    if (textWrap && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      textWrap.innerHTML = '';
      const brandStr = 'Eros Coach.';
      for (let i = 0; i < brandStr.length; i++) {
        const span = document.createElement('span');
        span.className = 'coach-intro-letter';
        span.textContent = brandStr[i] === ' ' ? '\u00A0' : brandStr[i];
        span.style.animationDelay = `${(i * 0.05).toFixed(2)}s`;
        textWrap.appendChild(span);
      }
    }

    if (overlay.classList) overlay.classList.remove('is-fading');
    if (typeof overlay.setAttribute === 'function') overlay.setAttribute('aria-hidden', 'false');
    if (overlay.style) overlay.style.display = 'flex';

    setTimeout(() => {
      if (overlay.classList) overlay.classList.add('is-fading');
      if (typeof overlay.setAttribute === 'function') overlay.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        if (overlay.style) overlay.style.display = 'none';
      }, 450);
    }, 1450);
    return true;
  }

  function stopCoachCursorGlowLoop() {
    if (cursorGlowRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(cursorGlowRaf);
    }
    cursorGlowRaf = null;
  }

  function startCoachCursorGlowLoop() {
    if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return;
    if (typeof window.matchMedia === 'function') {
      try {
        if (!window.matchMedia('(pointer: fine)').matches) return;
      } catch (_) {}
    }
    const glow = elements.cursorGlow || (typeof document !== 'undefined' ? document.getElementById('coach-cursor-glow') : null);
    if (!glow) return;
    if (cursorGlowRaf) return;

    function tickGlow() {
      const coachActive = typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('portal-coach');
      if (!coachActive) {
        cursorGlowRaf = null;
        return;
      }
      if (cursorTargetX > -5000 && cursorTargetY > -5000) {
        if (cursorCurrentX < -5000) {
          cursorCurrentX = cursorTargetX;
          cursorCurrentY = cursorTargetY;
        } else {
          cursorCurrentX += (cursorTargetX - cursorCurrentX) * 0.04;
          cursorCurrentY += (cursorTargetY - cursorCurrentY) * 0.04;
        }
        if (glow.style) {
          glow.style.transform = `translate3d(${(cursorCurrentX - 300).toFixed(1)}px, ${(cursorCurrentY - 300).toFixed(1)}px, 0)`;
        }
      }
      cursorGlowRaf = requestAnimationFrame(tickGlow);
    }

    cursorGlowRaf = requestAnimationFrame(tickGlow);
  }

  function initCoachCursorGlow() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (typeof window.matchMedia === 'function') {
      try {
        if (!window.matchMedia('(pointer: fine)').matches) return;
      } catch (_) {}
    }
    if (!cursorGlowBound && typeof document.addEventListener === 'function') {
      document.addEventListener('mousemove', (e) => {
        if (!e) return;
        cursorTargetX = e.clientX;
        cursorTargetY = e.clientY;
        if (document.body && document.body.classList && document.body.classList.contains('portal-coach') && !cursorGlowRaf) {
          startCoachCursorGlowLoop();
        }
      }, { passive: true });
      cursorGlowBound = true;
    }
    if (document.body && document.body.classList && document.body.classList.contains('portal-coach')) {
      startCoachCursorGlowLoop();
    }
  }

  function animateCountUp(el, target, duration, formatter) {
    if (!el) return;
    const fmt = typeof formatter === 'function' ? formatter : (v) => String(Math.round(v));
    const dur = (typeof duration === 'number' && isFinite(duration)) ? duration : 600;
    const numTarget = Number(target);

    if (!isFinite(numTarget)) {
      el.textContent = fmt(target);
      return;
    }

    if (el._countUpRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(el._countUpRaf);
      el._countUpRaf = null;
    }

    const prevTarget = (typeof el._countUpLastTarget === 'number' && isFinite(el._countUpLastTarget))
      ? el._countUpLastTarget
      : 0;
    el._countUpLastTarget = numTarget;

    if (
      dur <= 0 ||
      prevTarget === numTarget ||
      typeof requestAnimationFrame !== 'function' ||
      typeof performance === 'undefined' ||
      typeof performance.now !== 'function'
    ) {
      el.textContent = fmt(numTarget);
      return;
    }

    const startVal = prevTarget;
    const delta = numTarget - startVal;
    const startTime = performance.now();

    function stepCountUp(now) {
      const elapsed = Math.max(0, now - startTime);
      const p = Math.min(1, elapsed / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      const currentVal = startVal + delta * ease;
      el.textContent = fmt(p >= 1 ? numTarget : currentVal);
      if (p < 1) {
        el._countUpRaf = requestAnimationFrame(stepCountUp);
      } else {
        el._countUpRaf = null;
      }
    }

    el.textContent = fmt(startVal);
    el._countUpRaf = requestAnimationFrame(stepCountUp);
  }

  function renderProgressRing(container, pct, color) {
    if (!container) return;
    const clampedPct = Math.max(0, Math.min(100, Number(pct) || 0));
    const safeColor = (typeof color === 'string' && /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|var\(--[a-zA-Z0-9-]+\)|[a-zA-Z]+)$/.test(color.trim()))
      ? color.trim()
      : '#10a37f';
    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - clampedPct / 100);

    container.innerHTML = `<svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true">`
      + `<circle cx="18" cy="18" r="${radius}" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="3"></circle>`
      + `<circle class="coach-ring-arc" cx="18" cy="18" r="${radius}" fill="none" stroke="${escapeHtml(safeColor)}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}"></circle>`
      + `</svg>`;
  }

  function computeSmartRadialAngles(anchorX, anchorY, viewportW, viewportH, itemCount, radius) {
    const count = Math.max(0, Math.floor(Number(itemCount) || 0));
    if (count === 0) return [];

    const vw = Math.max(240, Number(viewportW) || 1024);
    const vh = Math.max(240, Number(viewportH) || 768);
    const ax = Math.max(0, Math.min(vw, Number(anchorX) || (vw - 46)));
    const ay = Math.max(0, Math.min(vh, Number(anchorY) || (vh - 114)));
    const baseRadius = (typeof radius === 'number' && isFinite(radius) && radius > 0) ? radius : 92;

    const isLeft = ax < vw / 2;
    const isTop = ay < vh / 2;
    const quadrant = `${isTop ? 'top' : 'bottom'}-${isLeft ? 'left' : 'right'}`;

    const margin = 12;
    const bottomSafe = 84;
    const padX = margin + 16;
    const padTop = margin + 16;
    const minY = Math.min(padTop, vh - margin);
    const maxY = Math.max(minY, vh - bottomSafe);
    const minX = Math.min(padX, vw - margin);
    const maxX = Math.max(minX, vw - padX);

    // Choose strictly-inward corner or centered-edge sweep so slots never pile on blocked edges
    let startAngleDeg;
    let endAngleDeg;
    const centeredHorizontal = Math.abs(ax - vw / 2) < baseRadius * 0.45 && (ay < padTop + 56 || ay > vh - padTop - 96);

    if (centeredHorizontal) {
      startAngleDeg = isTop ? 15 : -165;
      endAngleDeg = isTop ? 165 : -15;
    } else if (!isLeft && !isTop) {
      // bottom-right -> strictly inward left (-180) to up (-90)
      startAngleDeg = -180;
      endAngleDeg = -90;
    } else if (isLeft && !isTop) {
      // bottom-left -> strictly inward up (-90) to right (0)
      startAngleDeg = -90;
      endAngleDeg = 0;
    } else if (!isLeft && isTop) {
      // top-right -> strictly inward down (90) to left (180)
      startAngleDeg = 90;
      endAngleDeg = 180;
    } else {
      // top-left -> strictly inward right (0) to down (90)
      startAngleDeg = 0;
      endAngleDeg = 90;
    }

    const sweepDeg = Math.abs(endAngleDeg - startAngleDeg);
    const minItemSpacing = 50;
    const minAnchorClearance = 56;
    let effectiveRadius = baseRadius;
    if (count > 1) {
      const halfStepRad = ((sweepDeg / (count - 1)) * Math.PI) / 360;
      const sinHalf = Math.sin(halfStepRad);
      if (sinHalf > 0.01) {
        const neededR = Math.ceil((minItemSpacing / 2) / sinHalf);
        const maxFitR = Math.max(baseRadius, Math.min(vw - margin * 2 - 42, vh - bottomSafe - margin, 220));
        effectiveRadius = Math.min(maxFitR, Math.max(baseRadius, neededR));
      }
    }

    const pts = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angleDeg = startAngleDeg + (endAngleDeg - startAngleDeg) * t;
      const angleRad = (angleDeg * Math.PI) / 180;
      pts.push({
        dx: Math.cos(angleRad) * effectiveRadius,
        dy: Math.sin(angleRad) * effectiveRadius,
        angleDeg,
        angleRad
      });
    }

    const clampDeltaX = (d) => Math.max(minX - ax, Math.min(maxX - ax, d));
    const clampDeltaY = (d) => Math.max(minY - ay, Math.min(maxY - ay, d));

    pts.forEach(p => {
      p.dx = clampDeltaX(p.dx);
      p.dy = clampDeltaY(p.dy);
    });

    // Relaxation loop guarantees >= 48px separation between buttons and >= 54px from FAB center even when clamped
    const minCenterDist = 48;
    const inwardX = vw / 2 - ax;
    const inwardY = vh / 2 - ay;
    const inwardLen = Math.hypot(inwardX, inwardY) || 1;
    const inDirX = inwardX / inwardLen;
    const inDirY = inwardY / inwardLen;

    for (let iter = 0; iter < 18; iter++) {
      let moved = false;

      // Push any slot too close to the FAB trigger outward toward screen center
      for (let i = 0; i < count; i++) {
        const p = pts[i];
        const distAnchor = Math.hypot(p.dx, p.dy);
        if (distAnchor < minAnchorClearance) {
          const ux = distAnchor > 0.5 ? p.dx / distAnchor : inDirX;
          const uy = distAnchor > 0.5 ? p.dy / distAnchor : inDirY;
          const push = minAnchorClearance - distAnchor + 1;
          p.dx = clampDeltaX(p.dx + ux * push);
          p.dy = clampDeltaY(p.dy + uy * push);
          moved = true;
        }
      }

      // Pairwise center separation
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const a = pts[i];
          const b = pts[j];
          const vx = b.dx - a.dx;
          const vy = b.dy - a.dy;
          const dist = Math.hypot(vx, vy);
          if (dist < minCenterDist) {
            const overlap = (minCenterDist - dist) * 0.52 + 0.5;
            let ux;
            let uy;
            if (dist > 0.5) {
              ux = vx / dist;
              uy = vy / dist;
            } else {
              ux = -inDirY;
              uy = inDirX;
            }
            a.dx = clampDeltaX(a.dx - ux * overlap);
            a.dy = clampDeltaY(a.dy - uy * overlap);
            b.dx = clampDeltaX(b.dx + ux * overlap);
            b.dy = clampDeltaY(b.dy + uy * overlap);
            moved = true;
          }
        }
      }

      if (!moved) break;
    }

    return pts.map(p => {
      const fx = Math.round(clampDeltaX(p.dx));
      const fy = Math.round(clampDeltaY(p.dy));
      const finalRad = Math.atan2(fy, fx);
      const finalDeg = (finalRad * 180) / Math.PI;
      return {
        angleDeg: Number(finalDeg.toFixed(2)),
        angleRad: Number(finalRad.toFixed(4)),
        x: fx,
        y: fy,
        quadrant
      };
    });
  }

  function applySmartOverflowProtection(el, margin) {
    if (!el) return null;
    const safeMargin = (typeof margin === 'number' && isFinite(margin) && margin >= 0) ? margin : 12;
    if (el.classList) el.classList.add('smart-overflow-protected');

    const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;

    if (el.style) {
      el.style.maxWidth = `calc(100vw - ${safeMargin * 2}px)`;
      el.style.maxHeight = `calc(100vh - ${safeMargin * 2}px)`;
      el.style.boxSizing = 'border-box';
    }

    let adjusted = false;
    if (typeof el.getBoundingClientRect === 'function' && el.style) {
      try {
        const rect = el.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          let shiftX = 0;
          let shiftY = 0;
          if (rect.left < safeMargin) shiftX = safeMargin - rect.left;
          else if (rect.right > vw - safeMargin) shiftX = (vw - safeMargin) - rect.right;
          if (rect.top < safeMargin) shiftY = safeMargin - rect.top;
          else if (rect.bottom > vh - safeMargin) shiftY = (vh - safeMargin) - rect.bottom;

          if (Math.abs(shiftX) > 0.5 || Math.abs(shiftY) > 0.5) {
            let computedPos = '';
            if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
              try { computedPos = window.getComputedStyle(el).position || ''; } catch (_) {}
            }
            const currentPos = el.style.position || computedPos;
            if (currentPos === 'fixed' || currentPos === 'absolute') {
              el.style.transform = 'none';
              el.style.left = `${Math.max(safeMargin, Math.min(vw - rect.width - safeMargin, rect.left + shiftX))}px`;
              el.style.top = `${Math.max(safeMargin, Math.min(vh - rect.height - safeMargin, rect.top + shiftY))}px`;
              el.style.right = 'auto';
              el.style.bottom = 'auto';
            }
            adjusted = true;
          }
        }
      } catch (_) {}
    }

    return { protected: true, adjusted };
  }

  function getRadialActionSvg(iconKey) {
    const common = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (iconKey === 'switch') {
      return `<svg ${common}><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`;
    }
    if (iconKey === 'play') {
      return `<svg ${common}><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
    }
    if (iconKey === 'link') {
      return `<svg ${common}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
    }
    if (iconKey === 'replay') {
      return `<svg ${common}><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`;
    }
    if (iconKey === 'clock') {
      return `<svg ${common}><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>`;
    }
    if (iconKey === 'cue') {
      return `<svg ${common}><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
    }
    return `<svg ${common}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
  }

  function getRadialActionCatalog() {
    return [
      { id: 'switch-mode', label: isCoachMode ? 'Athlete' : 'Switch Mode', icon: 'switch' },
      { id: 'toggle-set', label: 'Toggle Set', icon: 'play' },
      { id: 'link-athlete', label: 'Link Athlete', icon: 'link' },
      { id: 'replay-path', label: 'Replay Path', icon: 'replay' },
      { id: 'rest-timer', label: 'Rest Timer', icon: 'clock' },
      { id: 'quick-cue', label: 'Quick Cue', icon: 'cue' }
    ];
  }

  function getRadialActionsConfig() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(RADIAL_CONFIG_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const validIds = parsed.filter(id => DEFAULT_RADIAL_ACTIONS.includes(id));
            return validIds;
          }
        }
      }
    } catch (_) {}
    return DEFAULT_RADIAL_ACTIONS.slice();
  }

  function saveRadialActionsConfig(actionIds) {
    const cleanIds = Array.isArray(actionIds)
      ? Array.from(new Set(actionIds.filter(id => DEFAULT_RADIAL_ACTIONS.includes(id))))
      : DEFAULT_RADIAL_ACTIONS.slice();

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(RADIAL_CONFIG_KEY, JSON.stringify(cleanIds));
      }
    } catch (_) {}

    syncRadialCustomizerCheckboxes(cleanIds);
    renderRadialMenuItems();
    return cleanIds;
  }

  function syncRadialCustomizerCheckboxes(enabledIds) {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    const activeSet = new Set(Array.isArray(enabledIds) ? enabledIds : getRadialActionsConfig());
    const checks = document.querySelectorAll('[data-radial-action-toggle]');
    if (checks && typeof checks.forEach === 'function') {
      checks.forEach(cb => {
        const id = cb.getAttribute('data-radial-action-toggle');
        cb.checked = activeSet.has(id);
      });
    }
  }

  function openRadialCustomizer() {
    const modal = elements.radialCustomizerModal || (typeof document !== 'undefined' ? document.getElementById('eros-radial-customizer-modal') : null);
    if (!modal) return;
    toggleRadialActionMenu(false);
    syncRadialCustomizerCheckboxes(getRadialActionsConfig());
    if (modal.style) modal.style.display = 'flex';
    applySmartOverflowProtection(modal, 12);
  }

  function closeRadialCustomizer() {
    const modal = elements.radialCustomizerModal || (typeof document !== 'undefined' ? document.getElementById('eros-radial-customizer-modal') : null);
    if (!modal) return;
    if (modal.style) modal.style.display = 'none';
  }

  function executeRadialAction(actionId) {
    toggleRadialActionMenu(false);

    if (actionId === '__customize__') {
      openRadialCustomizer();
      return;
    }

    if (actionId === 'switch-mode') {
      revealCoachOption();
      switchMode(isCoachMode ? 'athlete' : 'coach');
      return;
    }

    if (actionId === 'toggle-set') {
      if (isCoachMode) {
        switchMode('athlete');
      }
      if (typeof document !== 'undefined') {
        const completeBtn = document.getElementById('btn-complete-set');
        const toggleBtn = document.getElementById('btn-set-toggle');
        const controlsPanel = completeBtn && completeBtn.closest ? completeBtn.closest('.controls-panel') : null;
        const completeVisible = completeBtn && ((controlsPanel && controlsPanel.classList && controlsPanel.classList.contains('set-active-compact')) || (completeBtn.style && completeBtn.style.display !== 'none'));
        if (completeVisible && typeof completeBtn.click === 'function') {
          completeBtn.click();
        } else if (toggleBtn && typeof toggleBtn.click === 'function') {
          toggleBtn.click();
        }
      }
      return;
    }

    if (actionId === 'link-athlete') {
      if (!isCoachMode) {
        revealCoachOption();
        switchMode('coach');
      }
      updateCoachNavActiveState('bonds');
      openBondModal();
      return;
    }

    if (actionId === 'replay-path') {
      if (!isCoachMode) {
        revealCoachOption();
        switchMode('coach');
      }
      navigateCoachSection('live');
      toggleCoachReplay();
      return;
    }

    if (actionId === 'rest-timer') {
      if (isCoachMode) {
        navigateCoachSection('prescriptions');
        const restBlock = typeof document !== 'undefined' ? document.getElementById('coach-rest-target-block') : null;
        if (restBlock) highlightCoachSectionElement(restBlock);
      } else if (typeof document !== 'undefined') {
        const settingsBtn = document.getElementById('btn-athlete-settings');
        const ticker = document.getElementById('header-rest-ticker');
        if (ticker && typeof ticker.scrollIntoView === 'function') {
          try { ticker.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        } else if (settingsBtn && typeof settingsBtn.click === 'function') {
          settingsBtn.click();
        }
      }
      return;
    }

    if (actionId === 'quick-cue') {
      if (!isCoachMode) {
        revealCoachOption();
        switchMode('coach');
      }
      sendCoachPrescription('Drive hips!', 0, getSafeWorkingWeight());
    }
  }

  function positionRadialItems() {
    const fab = elements.radialFab || (typeof document !== 'undefined' ? document.getElementById('eros-radial-fab') : null);
    const itemsContainer = elements.radialItems || (typeof document !== 'undefined' ? document.getElementById('eros-radial-items') : null);
    if (!fab || !itemsContainer) return [];

    const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;
    let anchorX = vw - 46;
    let anchorY = vh - 114;

    if (typeof fab.getBoundingClientRect === 'function') {
      try {
        const rect = fab.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          anchorX = rect.left + rect.width / 2;
          anchorY = rect.top + rect.height / 2;
        }
      } catch (_) {}
    }

    const itemNodes = itemsContainer.querySelectorAll ? itemsContainer.querySelectorAll('.eros-radial-item') : [];
    const count = itemNodes.length || 0;
    const coords = computeSmartRadialAngles(anchorX, anchorY, vw, vh, count, 92);

    if (coords.length > 0 && typeof fab.setAttribute === 'function') {
      fab.setAttribute('data-quadrant', coords[0].quadrant);
    }

    for (let i = 0; i < count; i++) {
      const node = itemNodes[i];
      const slot = coords[i];
      if (node && node.style && slot && typeof node.style.setProperty === 'function') {
        node.style.setProperty('--radial-x', `${slot.x}px`);
        node.style.setProperty('--radial-y', `${slot.y}px`);
      }
    }
    return coords;
  }

  function renderRadialMenuItems() {
    const itemsContainer = elements.radialItems || (typeof document !== 'undefined' ? document.getElementById('eros-radial-items') : null);
    if (!itemsContainer) return;

    const enabledIds = getRadialActionsConfig();
    const catalog = getRadialActionCatalog();
    const enabledActions = catalog.filter(a => enabledIds.includes(a.id));
    enabledActions.push({ id: '__customize__', label: 'Customize', icon: 'sliders', isCustomize: true });

    const itemTabIndex = isRadialOpen ? '0' : '-1';
    itemsContainer.innerHTML = enabledActions.map(action => (
      `<button type="button" class="eros-radial-item${action.isCustomize ? ' is-customize-item' : ''}" data-radial-action="${escapeHtml(action.id)}" role="menuitem" tabindex="${itemTabIndex}" aria-label="${escapeHtml(action.label)}">`
      + getRadialActionSvg(action.icon)
      + `<span class="eros-radial-item-label">${escapeHtml(action.label)}</span>`
      + `</button>`
    )).join('');

    if (itemsContainer.querySelectorAll) {
      const renderedBtns = itemsContainer.querySelectorAll('[data-radial-action]');
      if (renderedBtns && typeof renderedBtns.forEach === 'function') {
        renderedBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            const actId = btn.getAttribute('data-radial-action');
            executeRadialAction(actId);
          });
        });
      }
    }

    positionRadialItems();
  }

  function clampRadialFabToViewport(fab) {
    if (!fab || !fab.style) return;
    if (!fab.style.left || !fab.style.top || fab.style.left === 'auto' || fab.style.top === 'auto') return;
    const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;
    const pad = 12;
    const size = 52;
    const curL = parseFloat(fab.style.left) || (vw - size - 20);
    const curT = parseFloat(fab.style.top) || (vh - size - 88);
    const clampedL = Math.max(pad, Math.min(vw - size - pad, curL));
    const clampedT = Math.max(pad, Math.min(vh - size - pad, curT));
    fab.style.left = `${Math.round(clampedL)}px`;
    fab.style.top = `${Math.round(clampedT)}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }

  function toggleRadialActionMenu(forceOpen) {
    const fab = elements.radialFab || (typeof document !== 'undefined' ? document.getElementById('eros-radial-fab') : null);
    const items = elements.radialItems || (typeof document !== 'undefined' ? document.getElementById('eros-radial-items') : null);
    const trigger = elements.radialTrigger || (typeof document !== 'undefined' ? document.getElementById('eros-radial-fab-trigger') : null);

    isRadialOpen = (typeof forceOpen === 'boolean') ? forceOpen : !isRadialOpen;

    if (isRadialOpen) {
      renderRadialMenuItems();
      positionRadialItems();
    }

    if (fab) {
      if (typeof fab.setAttribute === 'function') {
        fab.setAttribute('data-radial-open', isRadialOpen ? 'true' : 'false');
      }
      if (fab.classList) {
        if (isRadialOpen) fab.classList.add('is-open');
        else fab.classList.remove('is-open');
      }
    }
    if (items) {
      if (typeof items.setAttribute === 'function') {
        items.setAttribute('aria-hidden', isRadialOpen ? 'false' : 'true');
      }
      if (items.classList) {
        if (isRadialOpen) items.classList.add('is-open');
        else items.classList.remove('is-open');
      }
      if (items.querySelectorAll) {
        const radialBtns = items.querySelectorAll('.eros-radial-item');
        if (radialBtns && typeof radialBtns.forEach === 'function') {
          radialBtns.forEach(btn => {
            if (btn && typeof btn.setAttribute === 'function') {
              btn.setAttribute('tabindex', isRadialOpen ? '0' : '-1');
            }
          });
        }
      }
    }
    if (trigger) {
      if (typeof trigger.setAttribute === 'function') {
        trigger.setAttribute('aria-expanded', isRadialOpen ? 'true' : 'false');
      }
      if (trigger.classList) {
        if (isRadialOpen) trigger.classList.add('is-open');
        else trigger.classList.remove('is-open');
      }
    }

    return isRadialOpen;
  }

  function initRadialActionMenu() {
    if (!elements.radialFab && typeof document !== 'undefined') queryElements();
    const fab = elements.radialFab;
    const trigger = elements.radialTrigger;
    const modal = elements.radialCustomizerModal;

    if (!fab || !trigger) return false;
    if (radialInitialized) return true;
    radialInitialized = true;

    // Restore persisted dragged position if available
    try {
      if (typeof localStorage !== 'undefined') {
        const posRaw = localStorage.getItem(RADIAL_POS_KEY);
        if (posRaw) {
          const parsedPos = JSON.parse(posRaw);
          if (parsedPos && typeof parsedPos.left === 'number' && typeof parsedPos.top === 'number' && fab.style) {
            fab.style.left = `${parsedPos.left}px`;
            fab.style.top = `${parsedPos.top}px`;
            fab.style.right = 'auto';
            fab.style.bottom = 'auto';
            clampRadialFabToViewport(fab);
          }
        }
      }
    } catch (_) {}

    renderRadialMenuItems();

    // Pointer Drag & Long-Press Support
    let dragStartX = 0;
    let dragStartY = 0;
    let origLeft = 0;
    let origTop = 0;
    let pointerActive = false;
    let isDragging = false;
    let longPressTimer = null;

    if (!trigger._radialBound) {
      trigger.addEventListener('click', (e) => {
        if (radialSuppressNextClick) {
          radialSuppressNextClick = false;
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          return;
        }
        toggleRadialActionMenu();
      });

      trigger.addEventListener('contextmenu', (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        openRadialCustomizer();
      });

      trigger.addEventListener('pointerdown', (e) => {
        if (!e || (typeof e.button === 'number' && e.button !== 0)) return;
        pointerActive = true;
        isDragging = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
        const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;
        if (typeof fab.getBoundingClientRect === 'function') {
          const rect = fab.getBoundingClientRect();
          origLeft = rect ? rect.left : (vw - 72);
          origTop = rect ? rect.top : (vh - 140);
        } else {
          origLeft = vw - 72;
          origTop = vh - 140;
        }

        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (!isDragging) {
            radialSuppressNextClick = true;
            openRadialCustomizer();
            setTimeout(() => { radialSuppressNextClick = false; }, 120);
          }
        }, 550);

        if (typeof trigger.setPointerCapture === 'function' && e.pointerId != null) {
          try { trigger.setPointerCapture(e.pointerId); } catch (_) {}
        }
      });

      trigger.addEventListener('pointermove', (e) => {
        if (!pointerActive || !e) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (!isDragging && Math.hypot(dx, dy) > 6) {
          isDragging = true;
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
          if (fab.classList) fab.classList.add('is-dragging');
        }
        if (isDragging && fab.style) {
          const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
          const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;
          const nextL = Math.max(12, Math.min(vw - 64, origLeft + dx));
          const nextT = Math.max(12, Math.min(vh - 64, origTop + dy));
          fab.style.left = `${Math.round(nextL)}px`;
          fab.style.top = `${Math.round(nextT)}px`;
          fab.style.right = 'auto';
          fab.style.bottom = 'auto';
          if (isRadialOpen) positionRadialItems();
        }
      });

      const finishPointer = () => {
        if (!pointerActive) return;
        pointerActive = false;
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (fab.classList) fab.classList.remove('is-dragging');
        if (isDragging) {
          isDragging = false;
          radialSuppressNextClick = true;
          setTimeout(() => { radialSuppressNextClick = false; }, 120);
          clampRadialFabToViewport(fab);
          if (isRadialOpen) positionRadialItems();
          try {
            if (typeof localStorage !== 'undefined' && fab.style) {
              localStorage.setItem(RADIAL_POS_KEY, JSON.stringify({
                left: parseFloat(fab.style.left) || 0,
                top: parseFloat(fab.style.top) || 0
              }));
            }
          } catch (_) {}
        }
      };

      trigger.addEventListener('pointerup', finishPointer);
      trigger.addEventListener('pointercancel', finishPointer);
      trigger._radialBound = true;
    }

    // Customizer Checkboxes & Buttons
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      const toggles = document.querySelectorAll('[data-radial-action-toggle]');
      if (toggles && typeof toggles.forEach === 'function') {
        toggles.forEach(cb => {
          if (!cb._radialToggleBound) {
            cb.addEventListener('change', () => {
              const selected = [];
              toggles.forEach(item => {
                if (item.checked) selected.push(item.getAttribute('data-radial-action-toggle'));
              });
              saveRadialActionsConfig(selected);
            });
            cb._radialToggleBound = true;
          }
        });
      }
    }

    if (typeof document !== 'undefined') {
      const btnClose = document.getElementById('btn-radial-customizer-close');
      const btnDismiss = document.getElementById('btn-radial-customizer-dismiss');
      const btnReset = document.getElementById('btn-radial-customizer-reset');

      if (btnClose && !btnClose._radialBound) {
        btnClose.addEventListener('click', closeRadialCustomizer);
        btnClose._radialBound = true;
      }
      if (btnDismiss && !btnDismiss._radialBound) {
        btnDismiss.addEventListener('click', closeRadialCustomizer);
        btnDismiss._radialBound = true;
      }
      if (btnReset && !btnReset._radialBound) {
        btnReset.addEventListener('click', () => {
          saveRadialActionsConfig(DEFAULT_RADIAL_ACTIONS.slice());
        });
        btnReset._radialBound = true;
      }

      if (!document._radialOutsideBound) {
        document.addEventListener('click', (e) => {
          if (isRadialOpen && fab && e && e.target && typeof fab.contains === 'function' && !fab.contains(e.target)) {
            toggleRadialActionMenu(false);
          }
        });
        document.addEventListener('keydown', (e) => {
          if (e && e.key === 'Escape') {
            if (modal && modal.style && modal.style.display !== 'none') {
              closeRadialCustomizer();
            } else if (isRadialOpen) {
              toggleRadialActionMenu(false);
            }
          }
        });
        document._radialOutsideBound = true;
      }
    }

    return true;
  }

  function readPersistedState(key) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const sVal = sessionStorage.getItem(key);
        if (sVal !== null && sVal !== undefined && sVal !== '') return sVal;
      }
    } catch (_) {}
    try {
      if (typeof localStorage !== 'undefined') {
        const lVal = localStorage.getItem(key);
        if (lVal !== null && lVal !== undefined && lVal !== '') return lVal;
      }
    } catch (_) {}
    return null;
  }

  function writePersistedState(key, val) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(key, String(val));
      }
    } catch (_) {}
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, String(val));
      }
    } catch (_) {}
  }

  function readSavedPillOrder() {
    try {
      if (typeof localStorage === 'undefined') return {};
      const raw = localStorage.getItem(PILL_ORDER_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeSavedPillOrder(orderMap) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PILL_ORDER_KEY, JSON.stringify(orderMap || {}));
      }
    } catch (_) {}
  }

  function isDirectChildOf(el, container) {
    return Boolean(el && container && (el.parentElement === container || el.parentNode === container));
  }

  /** Returns direct movable pill children of a container without matching nested inner pills. */
  function getDirectMovablePills(container) {
    if (!container) return [];
    const directChildren = container.children ? Array.from(container.children) : [];
    if (directChildren.length > 0) {
      return directChildren.filter(el => el && typeof el.getAttribute === 'function' && el.getAttribute('data-movable-pill') === 'true');
    }
    if (typeof container.querySelectorAll === 'function') {
      return Array.from(container.querySelectorAll('[data-movable-pill="true"]'))
        .filter(el => isDirectChildOf(el, container));
    }
    return [];
  }

  /** Checks whether a drag or pointer target belongs to a nested pill or interactive widget. */
  function classifyDragTarget(targetEl, pill) {
    if (!targetEl || typeof targetEl.closest !== 'function') {
      return { isNestedPill: false, isInteractiveChild: false };
    }
    const closestPill = targetEl.closest('[data-movable-pill="true"]');
    if (closestPill && closestPill !== pill) {
      return { isNestedPill: true, isInteractiveChild: true };
    }
    const interactiveEl = targetEl.closest(INTERACTIVE_DRAG_CHILD_SELECTOR);
    if (interactiveEl && interactiveEl !== pill) {
      return { isNestedPill: false, isInteractiveChild: true };
    }
    return { isNestedPill: false, isInteractiveChild: false };
  }

  function hasDirectMoveHint(pill) {
    if (!pill) return false;
    if (pill.children) {
      return Array.from(pill.children).some(c => c && c.classList && c.classList.contains('pill-move-hint'));
    }
    return typeof pill.querySelector === 'function' ? Boolean(pill.querySelector('.pill-move-hint')) : false;
  }

  function isLiveBigPillContainer(container, groupId) {
    return Boolean(
      (container && container.id === 'coach-live-panel') ||
      groupId === 'coach-live-big-pills'
    );
  }

  /** Adapts #coach-live-panel desktop grid track widths to the reordered column cards. */
  function syncLivePanelGridColumns(containerArg) {
    const panel = containerArg || elements.panelLive || (typeof document !== 'undefined' ? document.getElementById('coach-live-panel') : null);
    if (!panel || !panel.style) return;

    const winW = typeof window !== 'undefined' ? (window.innerWidth || 0) : 0;
    if (winW < 1150) {
      panel.style.gridTemplateColumns = '';
      return;
    }

    const orderedChildren = panel.children ? Array.from(panel.children) : getDirectMovablePills(panel);
    const columnIds = [];
    orderedChildren.forEach((child) => {
      if (!child) return;
      const domId = child.id || '';
      const pillId = typeof child.getAttribute === 'function' ? (child.getAttribute('data-pill-id') || '') : '';
      if (domId === 'coach-sets-history-card' || pillId === 'sets-history-card' || (child.classList && child.classList.contains('coach-sets-history-card'))) {
        return;
      }
      if (domId === 'coach-squad-overview' || pillId === 'squad-overview') {
        columnIds.push('squad-overview');
      } else if (domId === 'coach-active-set-card' || pillId === 'active-set-card') {
        columnIds.push('active-set-card');
      } else if (domId === 'coach-feedback-console' || pillId === 'feedback-console') {
        columnIds.push('feedback-console');
      }
    });

    if (columnIds.length !== 3) {
      panel.style.gridTemplateColumns = '';
      return;
    }

    const isDefaultOrder =
      columnIds[0] === 'squad-overview' &&
      columnIds[1] === 'active-set-card' &&
      columnIds[2] === 'feedback-console';
    if (isDefaultOrder) {
      panel.style.gridTemplateColumns = '';
      return;
    }

    const isCompactDesktop = winW <= 1440;
    const widthByRole = {
      'squad-overview': isCompactDesktop ? '248px' : '300px',
      'active-set-card': 'minmax(0, 1fr)',
      'feedback-console': isCompactDesktop ? '304px' : '360px'
    };
    panel.style.gridTemplateColumns = columnIds.map(id => widthByRole[id]).join(' ');
  }

  function saveGroupPillOrder(container, groupId) {
    if (!container || !groupId) return;
    const pills = getDirectMovablePills(container);
    const ids = pills.map(el => el.getAttribute('data-pill-id')).filter(Boolean);
    if (ids.length === 0) return;
    const map = readSavedPillOrder();
    map[groupId] = ids;
    writeSavedPillOrder(map);
  }

  function applyGroupPillOrder(container, groupId, orderMap) {
    if (!container || !groupId || !orderMap || !Array.isArray(orderMap[groupId])) return;
    if (typeof container.appendChild !== 'function') return;
    const savedIds = orderMap[groupId];
    const items = getDirectMovablePills(container);
    if (items.length < 2) return;
    const byId = new Map();
    items.forEach(el => {
      const id = el.getAttribute('data-pill-id');
      if (id) byId.set(id, el);
    });
    savedIds.forEach(id => {
      const node = byId.get(id);
      if (node) {
        container.appendChild(node);
        byId.delete(id);
      }
    });
    byId.forEach(node => container.appendChild(node));
  }

  function discoverContainerPills(container) {
    if (!container) return [];
    const candidates = (container.children && container.children.length > 0)
      ? Array.from(container.children)
      : (typeof container.querySelectorAll === 'function'
          ? Array.from(container.querySelectorAll('[data-movable-pill="true"], .coach-stat-chip, .coach-bento-card, .coach-sets-history-card'))
              .filter(el => isDirectChildOf(el, container))
          : []);
    return candidates.filter((el) => {
      if (!el || typeof el.getAttribute !== 'function') return false;
      if (el.getAttribute('data-movable-pill') === 'true') return true;
      if (el.id && COACH_BIG_PILL_DEFAULT_ID[el.id]) return true;
      return Boolean(el.classList && (
        el.classList.contains('coach-stat-chip') ||
        el.classList.contains('coach-bento-card') ||
        el.classList.contains('coach-sets-history-card')
      ));
    });
  }

  function initMovableCoachPills() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    const rawContainers = Array.from(
      document.querySelectorAll(
        '#coach-live-panel, #coach-athlete-history-panel, #coach-preparation-panel, #view-coach [data-pill-group], .coach-squad-stats, .coach-history-bento-quad, .coach-bento-grid'
      )
    );
    const uniqueContainers = Array.from(new Set(rawContainers)).filter((el) => {
      if (!el || typeof el.getAttribute !== 'function') return false;
      const isKnownContainer = Boolean(
        (el.id && COACH_BIG_PILL_DEFAULT_GROUP[el.id]) ||
        (el.classList && (
          el.classList.contains('coach-squad-stats') ||
          el.classList.contains('coach-history-bento-quad') ||
          el.classList.contains('coach-bento-grid')
        ))
      );
      if (isKnownContainer) return true;
      // Avoid treating leaf movable pills (which carry stamped data-pill-group) as containers
      if (el.getAttribute('data-movable-pill') === 'true') {
        return getDirectMovablePills(el).length > 0;
      }
      return true;
    });
    const savedMap = readSavedPillOrder();
    let draggedPill = null;
    let draggedGroup = '';

    uniqueContainers.forEach((container, containerIdx) => {
      if (!container) return;
      const defaultGroup = COACH_BIG_PILL_DEFAULT_GROUP[container.id || ''] || '';
      const groupId = container.getAttribute('data-pill-group') || defaultGroup || container.id || `coach-group-${containerIdx}`;
      if (!container.getAttribute('data-pill-group')) {
        container.setAttribute('data-pill-group', groupId);
      }

      const pills = discoverContainerPills(container);

      pills.forEach((pill, pillIdx) => {
        if (!pill.getAttribute('data-movable-pill')) pill.setAttribute('data-movable-pill', 'true');
        if (!pill.getAttribute('data-pill-id')) {
          const fallbackPillId = (pill.id && COACH_BIG_PILL_DEFAULT_ID[pill.id]) || pill.id || `${groupId}-pill-${pillIdx}`;
          pill.setAttribute('data-pill-id', fallbackPillId);
        }
        if (!pill.getAttribute('data-pill-group')) pill.setAttribute('data-pill-group', groupId);
        if (pill.classList) pill.classList.add('coach-movable-pill');
        pill.setAttribute('draggable', 'true');
        if (!pill.hasAttribute('tabindex')) pill.setAttribute('tabindex', '0');

        if (!hasDirectMoveHint(pill) && typeof document.createElement === 'function') {
          const hint = document.createElement('span');
          hint.className = 'pill-move-hint';
          hint.setAttribute('aria-hidden', 'true');
          pill.appendChild(hint);
        }

        if (pill._movableBound || typeof pill.addEventListener !== 'function') return;

        const temporarilySuppressCardDrag = (e) => {
          const state = classifyDragTarget(e && e.target, pill);
          if (!state.isInteractiveChild) return;
          pill.setAttribute('draggable', 'false');
          const restoreDraggable = () => {
            pill.setAttribute('draggable', 'true');
          };
          if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('pointerup', restoreDraggable, { once: true });
            window.addEventListener('mouseup', restoreDraggable, { once: true });
            window.addEventListener('pointercancel', restoreDraggable, { once: true });
          } else {
            pill.addEventListener('mouseup', restoreDraggable, { once: true });
          }
        };
        pill.addEventListener('pointerdown', temporarilySuppressCardDrag);
        pill.addEventListener('mousedown', temporarilySuppressCardDrag);

        pill.addEventListener('dragstart', (e) => {
          const state = classifyDragTarget(e && e.target, pill);
          if (state.isNestedPill) {
            return;
          }
          if (state.isInteractiveChild) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            return;
          }
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
          draggedPill = pill;
          draggedGroup = groupId;
          if (pill.classList) {
            pill.classList.add('is-dragging');
            pill.classList.add('coach-pill-dragging');
          }
          if (e && e.dataTransfer) {
            try {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', pill.getAttribute('data-pill-id') || '');
            } catch (_) {}
          }
        });

        pill.addEventListener('dragover', (e) => {
          if (!draggedPill || draggedPill === pill || draggedGroup !== groupId) return;
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
          if (pill.classList) {
            pill.classList.add('is-drag-over');
            pill.classList.add('coach-pill-drag-over');
          }
          if (e && e.dataTransfer) {
            try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
          }
        });

        pill.addEventListener('dragleave', () => {
          if (pill.classList) {
            pill.classList.remove('is-drag-over');
            pill.classList.remove('coach-pill-drag-over');
          }
        });

        pill.addEventListener('drop', (e) => {
          if (!draggedPill || draggedPill === pill || draggedGroup !== groupId) return;
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
          if (pill.classList) {
            pill.classList.remove('is-drag-over');
            pill.classList.remove('coach-pill-drag-over');
          }
          const children = Array.from(container.children || []);
          const dragIdx = children.indexOf(draggedPill);
          const dropIdx = children.indexOf(pill);
          if (dragIdx !== -1 && dropIdx !== -1 && typeof container.insertBefore === 'function') {
            if (dragIdx < dropIdx) {
              container.insertBefore(draggedPill, pill.nextSibling || null);
            } else {
              container.insertBefore(draggedPill, pill);
            }
            saveGroupPillOrder(container, groupId);
            if (isLiveBigPillContainer(container, groupId)) {
              syncLivePanelGridColumns(container);
            }
          }
        });

        pill.addEventListener('dragend', () => {
          if (pill.classList) {
            pill.classList.remove('is-dragging');
            pill.classList.remove('coach-pill-dragging');
          }
          pills.forEach(p => {
            if (p.classList) {
              p.classList.remove('is-drag-over');
              p.classList.remove('coach-pill-drag-over');
            }
          });
          draggedPill = null;
          draggedGroup = '';
        });

        pill.addEventListener('keydown', (e) => {
          if (!e || !e.altKey) return;
          const isPrev = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
          const isNext = e.key === 'ArrowRight' || e.key === 'ArrowDown';
          if (!isPrev && !isNext) return;
          const activeTarget = e.target;
          const keyState = classifyDragTarget(activeTarget, pill);
          if (keyState.isNestedPill) return;
          if (activeTarget && typeof activeTarget.closest === 'function' && activeTarget.closest('input, select, textarea, [role="slider"]')) return;
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          const ordered = getDirectMovablePills(container);
          const idx = ordered.indexOf(pill);
          if (idx === -1 || typeof container.insertBefore !== 'function') return;
          if (isPrev && idx > 0) {
            container.insertBefore(pill, ordered[idx - 1]);
            saveGroupPillOrder(container, groupId);
            if (isLiveBigPillContainer(container, groupId)) {
              syncLivePanelGridColumns(container);
            }
            if (typeof pill.focus === 'function') pill.focus();
          } else if (isNext && idx < ordered.length - 1) {
            container.insertBefore(pill, ordered[idx + 1].nextSibling || null);
            saveGroupPillOrder(container, groupId);
            if (isLiveBigPillContainer(container, groupId)) {
              syncLivePanelGridColumns(container);
            }
            if (typeof pill.focus === 'function') pill.focus();
          }
        });

        pill._movableBound = true;
      });

      applyGroupPillOrder(container, groupId, savedMap);
      if (isLiveBigPillContainer(container, groupId)) {
        syncLivePanelGridColumns(container);
      }
    });
  }

  // ── Coach Preparation Planner (0 to 12 month builder) ──

  /** Returns the markup for the golden personal record badge. */
  function goldenPrBadgeHtml(compact) {
    const label = compact ? 'PR' : 'PR Gold';
    const cls = compact ? 'coach-golden-pr-badge coach-golden-pr-badge--compact' : 'coach-golden-pr-badge';
    return `<span class="${cls}" data-prep-tooltip-key="prep_golden_pr"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg><span class="sr-only">${label}</span></span>`;
  }

  /** Whether the given set carries a personal record flag or was pushed as a record. */
  function isSetGoldenPr(set) {
    if (!set) return false;
    if (set.isPr === true || set.isPR === true) return true;
    return Boolean(set.setId && goldenPr.setIds.has(set.setId));
  }

  /** Whether any set of the given workout session is a golden personal record. */
  function isWorkoutGoldenPr(workout) {
    if (!workout) return false;
    if (workout.date && goldenPr.dates.has(workout.date)) return true;
    return Array.isArray(workout.sets) && workout.sets.some(isSetGoldenPr);
  }

  /** Records a pushed personal record so every Coach view can stamp the golden badge. */
  function registerGoldenPr(payload) {
    if (!payload) return;
    if (payload.setId) goldenPr.setIds.add(String(payload.setId));
    const ts = Number(payload.timestamp);
    const dateObj = isFinite(ts) && ts > 0 ? new Date(ts) : new Date();
    if (!isNaN(dateObj.getTime())) goldenPr.dates.add(formatIsoDate(dateObj));
  }

  /** Re-renders the Coach views that display golden personal record badges. */
  function refreshGoldenPrViews() {
    if (!isCoachMode) return;
    try { renderSetsHistoryTable(); } catch (_) {}
    if (activeCoachPanel === 'history') {
      try { renderAthleteHistoryPanel(); } catch (_) {}
    } else if (activeCoachPanel === 'preparation') {
      renderPrepComparison();
    }
  }

  function prepEl(id) {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return null;
    return document.getElementById(id);
  }

  function getPrepEngine() {
    return (typeof window !== 'undefined' && window.ErosPrepEngine) ? window.ErosPrepEngine : null;
  }

  function getPrepStore() {
    return (typeof window !== 'undefined' && window.ErosPrepStore) ? window.ErosPrepStore : null;
  }

  function callPrepStore(names, args) {
    const store = getPrepStore();
    if (!store) return undefined;
    for (let i = 0; i < names.length; i++) {
      if (typeof store[names[i]] === 'function') {
        try { return store[names[i]].apply(store, args || []); } catch (_) { return undefined; }
      }
    }
    return undefined;
  }

  function callPrepEngine(name, args) {
    const engine = getPrepEngine();
    if (!engine || typeof engine[name] !== 'function') return undefined;
    try { return engine[name].apply(engine, args || []); } catch (_) { return undefined; }
  }

  function prepNum(id, fallback) {
    const el = prepEl(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return isFinite(v) ? v : fallback;
  }

  function prepVal(id) {
    const el = prepEl(id);
    return el && typeof el.value === 'string' ? el.value : '';
  }

  function setPrepVal(id, value) {
    const el = prepEl(id);
    if (el) el.value = (value === null || value === undefined) ? '' : String(value);
  }

  function parsePrepDate(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
    if (!m) return null;
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }

  function clampPrepMonths(value) {
    const viaEngine = callPrepEngine('clampPlanHorizonMonths', [value]);
    if (typeof viaEngine === 'number' && isFinite(viaEngine)) return viaEngine;
    const n = Math.round(Number(value));
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(12, n));
  }

  function getPrepWeekCount() {
    const months = clampPrepMonths(prepVal('coach-prep-months-select'));
    return months === 0 ? 1 : Math.min(52, Math.ceil((months * 52) / 12));
  }

  function getPrepStartDate() {
    return parsePrepDate(prepVal('coach-prep-start-date')) || new Date();
  }

  function getPrepDate(weekIdx, dayIdx) {
    const anchor = getMondayOfIsoWeek(getPrepStartDate());
    anchor.setDate(anchor.getDate() + (weekIdx * 7) + dayIdx);
    return formatIsoDate(anchor);
  }

  function getPrepAthlete() {
    const id = prepState.athleteId;
    if (!id) return null;
    return SQUAD_ATHLETES.find(a => a.id === id) || null;
  }

  function normalizeBaseLift(value) {
    const s = String(value || '').toLowerCase();
    if (/squat/.test(s)) return 'squat';
    if (/bench/.test(s)) return 'bench';
    if (/dead/.test(s)) return 'deadlift';
    return s;
  }

  function getPrepCatalog() {
    const engine = getPrepEngine();
    const base = (engine && Array.isArray(engine.EXERCISE_CATALOG)) ? engine.EXERCISE_CATALOG.slice() : [];
    prepState.customExercises.forEach(ex => {
      if (!base.some(b => b && b.id === ex.id)) base.push(ex);
    });
    return base;
  }

  function lookupPrepExercise(exerciseId) {
    if (!exerciseId) return null;
    const viaEngine = callPrepEngine('getExerciseById', [exerciseId]);
    if (viaEngine) return viaEngine;
    return getPrepCatalog().find(ex => ex && ex.id === exerciseId) || null;
  }

  /** Fills the exercise picker from the catalog using the live search filter. */
  function populatePrepExerciseOptions(preferredId) {
    const select = prepEl('coach-prep-exercise-select');
    if (!select) return;
    const query = prepVal('coach-prep-exercise-search').trim().toLowerCase();
    const previous = preferredId || select.value;
    let items = getPrepCatalog();
    if (query) {
      const viaEngine = callPrepEngine('searchExercises', [query]);
      if (Array.isArray(viaEngine) && viaEngine.length > 0) {
        items = viaEngine;
      } else {
        items = items.filter(ex => ex && String(ex.name || '').toLowerCase().includes(query));
      }
    }
    if (items.length === 0) {
      select.innerHTML = `<option value="">${query ? 'No matching exercise' : 'Exercise catalog unavailable'}</option>`;
      return;
    }
    select.innerHTML = items.map(ex => {
      const id = escapeHtml(ex.id || ex.name || '');
      const lift = escapeHtml(normalizeBaseLift(ex.baseLift || ex.category || ''));
      return `<option value="${id}" data-base-lift="${lift}">${escapeHtml(ex.name || ex.id || 'Exercise')}</option>`;
    }).join('');
    if (previous && items.some(ex => (ex.id || ex.name) === previous)) {
      select.value = previous;
    }
  }

  /** Fills the template picker from the preparation engine catalog. */
  function populatePrepTemplateOptions() {
    const select = prepEl('coach-prep-template-select');
    const engine = getPrepEngine();
    if (!select || !engine) return;
    const list = Array.isArray(engine.TEMPLATE_CATALOG) ? engine.TEMPLATE_CATALOG : (Array.isArray(engine.PREP_TEMPLATES) ? engine.PREP_TEMPLATES : []);
    if (list.length === 0 || select.options.length > 1) return;
    list.forEach(t => {
      const key = (t && (t.key || t.id)) || '';
      if (!key) return;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = t.label || t.name || key;
      select.appendChild(opt);
    });
  }

  function populatePrepAthleteSelect() {
    const select = prepEl('coach-prep-athlete-select');
    if (!select) return;
    if (SQUAD_ATHLETES.length === 0) {
      select.innerHTML = '<option value="">No connected athlete</option>';
      prepState.athleteId = '';
      return;
    }
    select.innerHTML = SQUAD_ATHLETES.map(a =>
      `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} (${escapeHtml(a.rack || 'Rack 01')})</option>`
    ).join('');
    if (!prepState.athleteId || !SQUAD_ATHLETES.some(a => a.id === prepState.athleteId)) {
      prepState.athleteId = (currentAthlete && currentAthlete.id) || SQUAD_ATHLETES[0].id;
    }
    select.value = prepState.athleteId;
  }

  function readLocalPrepDraft(athleteId) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(PREP_LOCAL_DRAFT_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw);
      return (map && map[athleteId]) ? map[athleteId] : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocalPrepDraft(athleteId) {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(PREP_LOCAL_DRAFT_KEY);
      const map = raw ? (JSON.parse(raw) || {}) : {};
      map[athleteId] = { plan: prepState.plan, workouts: prepState.workouts };
      localStorage.setItem(PREP_LOCAL_DRAFT_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  /** Loads the stored plan and planned workouts of the given athlete into the planner state. */
  function loadPrepForAthlete(athleteId, opts) {
    const preserveCursor = Boolean(opts && opts.preserveCursor && athleteId && athleteId === prepState.loadedFor);
    prepState.athleteId = athleteId || '';
    prepState.loadedFor = prepState.athleteId;
    prepState.plan = null;
    prepState.workouts = [];
    if (!preserveCursor) {
      prepState.draftSlots = [];
      prepState.weekIndex = 0;
      prepState.selectedWeek = 0;
      prepState.dayIndex = 0;
    }
    if (!athleteId) return;

    let plan = callPrepStore(['getActivePlan'], [athleteId]) || null;
    let workouts = callPrepStore(['listPlannedWorkouts'], [athleteId]);
    if ((!Array.isArray(workouts) || workouts.length === 0) && plan && plan.planId) {
      const byPlan = callPrepStore(['getWorkoutsForPlan'], [plan.planId]);
      if (Array.isArray(byPlan)) workouts = byPlan;
    }
    if (!plan) {
      const local = readLocalPrepDraft(athleteId);
      if (local && local.plan) {
        plan = local.plan;
        workouts = Array.isArray(local.workouts) ? local.workouts : [];
      }
    }
    prepState.plan = plan;
    prepState.workouts = Array.isArray(workouts) ? workouts.slice() : [];

    setPrepVal('coach-prep-title-input', plan ? plan.title : '');
    const months = plan ? clampPrepMonths(plan.durationMonths) : 3;
    setPrepVal('coach-prep-months-select', months);
    setPrepVal('coach-prep-start-date', plan && plan.startDate ? plan.startDate : formatIsoDate(new Date()));
    setPrepVal('coach-prep-meet-date', plan ? (plan.targetMeetDate || '') : '');
    setPrepVal('coach-prep-1rm-squat', plan && plan.targetSquatKg ? plan.targetSquatKg : '');
    setPrepVal('coach-prep-1rm-bench', plan && plan.targetBenchKg ? plan.targetBenchKg : '');
    setPrepVal('coach-prep-1rm-deadlift', plan && plan.targetDeadliftKg ? plan.targetDeadliftKg : '');

    if (prepState.workouts.length > 0) {
      const curDate = getPrepDate(prepState.weekIndex, prepState.dayIndex);
      const hasCur = Boolean(findPrepWorkoutByDate(curDate));
      if (!hasCur && (!preserveCursor || prepState.draftSlots.length === 0)) {
        const todayStr = formatIsoDate(new Date());
        const targetW = prepState.workouts.find(w => w && w.scheduledDate === todayStr) || prepState.workouts[0];
        if (targetW && targetW.scheduledDate) {
          const dObj = parsePrepDate(targetW.scheduledDate);
          const anchor = getMondayOfIsoWeek(getPrepStartDate());
          if (dObj) {
            const diffDays = Math.round((dObj.getTime() - anchor.getTime()) / 86400000);
            if (diffDays >= 0) {
              prepState.weekIndex = Math.min(getPrepWeekCount() - 1, Math.floor(diffDays / 7));
              prepState.dayIndex = diffDays % 7;
            }
          }
        }
      }
    }
  }

  function getPrepOneRms() {
    return {
      squat: prepNum('coach-prep-1rm-squat', 0),
      bench: prepNum('coach-prep-1rm-bench', 0),
      deadlift: prepNum('coach-prep-1rm-deadlift', 0)
    };
  }

  function findPrepWorkoutByDate(dateStr) {
    return prepState.workouts.find(w => w && w.scheduledDate === dateStr) || null;
  }

  function getSelectedPrepWorkout() {
    return findPrepWorkoutByDate(getPrepDate(prepState.weekIndex, prepState.dayIndex));
  }

  /** Renders the 0 to 12 month macro week track. */
  function renderPrepWeeks() {
    const track = prepEl('coach-prep-weeks-track');
    if (!track) return;
    const total = getPrepWeekCount();
    if (prepState.weekIndex >= total) prepState.weekIndex = total - 1;
    if (prepState.weekIndex < 0) prepState.weekIndex = 0;
    prepState.selectedWeek = prepState.weekIndex;

    const cells = [];
    for (let i = 0; i < total; i++) {
      const weekWorkouts = prepState.workouts.filter(w => w && Number(w.weekIndex) === i);
      const phase = weekWorkouts.length > 0 ? String(weekWorkouts[0].blockPhase || '') : '';
      const isDeload = weekWorkouts.some(w => w.isDeload);
      const selected = i === prepState.weekIndex;
      cells.push(
        `<button type="button" role="option" class="coach-prep-week-cell${selected ? ' is-selected' : ''}${isDeload ? ' is-deload' : ''}${weekWorkouts.length ? ' has-sessions' : ''}" data-week="${i}" data-prep-tooltip-key="coach_prep_weeks_track" aria-selected="${selected ? 'true' : 'false'}" aria-label="Week ${i + 1}">` +
        `<span>W${i + 1}</span><span class="coach-prep-week-cell-phase">${escapeHtml(phase.slice(0, 4))}</span></button>`
      );
    }
    track.innerHTML = cells.join('');
  }

  /** Renders the Monday to Sunday session tabs of the selected week. */
  function renderPrepDayTabs() {
    const tabs = prepEl('coach-prep-day-tabs');
    if (!tabs) return;
    tabs.innerHTML = PREP_DAY_NAMES.map((name, i) => {
      const dateStr = getPrepDate(prepState.weekIndex, i);
      const selected = i === prepState.dayIndex;
      const hasSession = Boolean(findPrepWorkoutByDate(dateStr));
      return `<button type="button" role="tab" class="coach-prep-day-tab${selected ? ' is-selected' : ''}" data-day="${i}" data-prep-tooltip-key="prep_week_day" aria-selected="${selected ? 'true' : 'false'}">` +
        `<span>${escapeHtml(name)}${hasSession ? ' *' : ''}</span><span class="coach-prep-day-tab-date">${escapeHtml(dateStr.slice(5))}</span></button>`;
    }).join('');
  }

  function formatPrepSlotSet(block) {
    if (!block || !(Number(block.sets) > 0)) return '&mdash;';
    const rpe = Number(block.rpe);
    const drop = Number(block.dropPct);
    return escapeHtml(`${block.sets}x${block.reps || '-'}${isFinite(rpe) && rpe > 0 ? ` @RPE ${rpe}` : ''}${isFinite(drop) && drop > 0 ? ` (-${drop}%)` : ''}`);
  }

  function formatPrepVelocity(slot) {
    const parts = [];
    const back = slot.backoff || slot.backoffSets;
    if (slot.topSet && Number(slot.topSet.targetVelocity) > 0) parts.push(`${Number(slot.topSet.targetVelocity).toFixed(2)} m/s`);
    if (back && Number(back.targetVelocity) > 0) parts.push(`${Number(back.targetVelocity).toFixed(2)} m/s`);
    return parts.length ? escapeHtml(parts.join(' / ')) : '&mdash;';
  }

  /** Renders the prescribed exercise rows of the session draft. */
  function renderPrepSlotsTable() {
    const body = prepEl('coach-prep-slots-body');
    if (!body) return;
    if (prepState.draftSlots.length === 0) {
      body.innerHTML = '<tr><td colspan="6" class="coach-prep-empty">No exercises prescribed for this day yet.</td></tr>';
      return;
    }
    body.innerHTML = prepState.draftSlots.map(slot => {
      const load = slot.topSet && Number(slot.topSet.loadKg) > 0 ? `${Number(slot.topSet.loadKg).toFixed(1)} kg` : '-';
      return `<tr data-slot-id="${escapeHtml(slot.slotId)}" data-prep-tooltip-key="coach_prep_slots_table">` +
        `<td>${escapeHtml(slot.exerciseName || slot.exerciseId || 'Exercise')}</td>` +
        `<td class="font-mono">${formatPrepSlotSet(slot.topSet)}</td>` +
        `<td class="font-mono">${formatPrepSlotSet(slot.backoff || slot.backoffSets)}</td>` +
        `<td class="font-mono">${escapeHtml(load)}</td>` +
        `<td class="font-mono">${formatPrepVelocity(slot)}</td>` +
        `<td><button type="button" class="coach-prep-slot-remove" data-remove-slot="${escapeHtml(slot.slotId)}" data-prep-tooltip-key="coach_prep_slots_table" aria-label="Remove exercise"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span class="sr-only">Remove</span></button></td>` +
        `</tr>`;
    }).join('');
  }

  /** Loads the selected day session into the builder form. */
  function loadPrepSessionIntoForm() {
    const workout = getSelectedPrepWorkout();
    setPrepVal('coach-prep-session-title', workout ? workout.sessionTitle : '');
    setPrepVal('coach-prep-phase-select', workout && workout.blockPhase ? workout.blockPhase : 'Hypertrophy');
    const deload = prepEl('coach-prep-deload-toggle');
    if (deload) deload.checked = Boolean(workout && workout.isDeload);
    setPrepVal('coach-prep-workout-notes', workout ? workout.workoutNotes : '');
    setPrepVal('coach-prep-dietary-notes', workout ? workout.dietaryNotes : '');
    prepState.draftSlots = workout && Array.isArray(workout.prescribedSlots)
      ? workout.prescribedSlots.map(s => Object.assign({}, s))
      : [];
    renderPrepSlotsTable();
  }

  /** Builds a prescription slot from the Set X and Set Y inputs without storing it. */
  function buildPrepSlotFromInputs() {
    const select = prepEl('coach-prep-exercise-select');
    const exerciseId = select ? select.value : '';
    if (!exerciseId) return null;
    const exercise = lookupPrepExercise(exerciseId);
    const selectedOpt = select && select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    const baseLift = normalizeBaseLift(
      (exercise && (exercise.baseLift || exercise.category)) ||
      (selectedOpt && typeof selectedOpt.getAttribute === 'function' ? selectedOpt.getAttribute('data-base-lift') : '')
    );
    const topLoad = prepNum('coach-slot-top-load', 0);
    const backoffSets = Math.max(0, Math.round(prepNum('coach-slot-backoff-sets', 0)));
    const input = {
      exerciseId,
      exerciseName: (exercise && exercise.name) || (selectedOpt ? selectedOpt.textContent : exerciseId),
      baseLift,
      topSet: {
        sets: Math.max(1, Math.round(prepNum('coach-slot-top-sets', 1))),
        reps: Math.max(1, Math.round(prepNum('coach-slot-top-reps', 3))),
        rpe: prepNum('coach-slot-top-rpe', 8),
        targetRpe: prepNum('coach-slot-top-rpe', 8),
        loadKg: topLoad > 0 ? topLoad : undefined
      },
      backoff: backoffSets > 0 ? {
        sets: backoffSets,
        reps: Math.max(1, Math.round(prepNum('coach-slot-backoff-reps', 5))),
        rpe: prepNum('coach-slot-backoff-rpe', 7),
        targetRpe: prepNum('coach-slot-backoff-rpe', 7),
        dropPct: Math.max(0, prepNum('coach-slot-backoff-drop', 8))
      } : null
    };
    const prescribed = callPrepEngine('prescribeSlotWithTopAndBackoff', [input, getPrepOneRms()]);
    const slot = (prescribed && typeof prescribed === 'object') ? Object.assign({}, input, prescribed) : input;
    if (!slot.topSet) slot.topSet = input.topSet;
    if (!slot.backoff && slot.backoffSets) slot.backoff = slot.backoffSets;
    if (slot.backoff && !slot.backoffSets) slot.backoffSets = slot.backoff;
    if (!slot.slotId) slot.slotId = `slot_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    return slot;
  }

  /** Refreshes the live RPE-to-velocity previews of the Set X and Set Y builder. */
  function updatePrepSlotPreviews() {
    const topEl = prepEl('coach-slot-top-vel-preview');
    const backEl = prepEl('coach-slot-backoff-vel-preview');
    if (!topEl && !backEl) return;
    const slot = buildPrepSlotFromInputs();
    const topVel = slot && slot.topSet ? Number(slot.topSet.targetVelocity) : NaN;
    const backObj = slot ? (slot.backoff || slot.backoffSets) : null;
    const backVel = backObj ? Number(backObj.targetVelocity) : NaN;
    if (topEl) topEl.textContent = (isFinite(topVel) && topVel > 0) ? `${topVel.toFixed(2)} m/s` : '\u2014';
    if (backEl) backEl.textContent = (isFinite(backVel) && backVel > 0) ? `${backVel.toFixed(2)} m/s` : '\u2014';
    const loadEl = prepEl('coach-slot-top-load');
    if (loadEl && slot && slot.topSet && Number(slot.topSet.loadKg) > 0 && !loadEl.value) {
      loadEl.placeholder = Number(slot.topSet.loadKg).toFixed(1);
    }
  }

  function emitPrepEvent(type, payload) {
    if (typeof window === 'undefined') return false;
    const bus = window.ErosSyncBus;
    if (bus && typeof bus.emit === 'function') {
      try { bus.emit(type, payload); return true; } catch (_) {}
    }
    return false;
  }

  /** Builds or updates the active plan from the header inputs of the planner. */
  function syncPrepPlanFromHeader() {
    const athlete = getPrepAthlete();
    if (!athlete) return null;
    const rms = getPrepOneRms();
    const meetDate = prepVal('coach-prep-meet-date');
    const prior = prepState.plan;
    const plan = Object.assign({}, prior || {}, {
      planId: (prior && prior.planId) || `plan_${athlete.id}_${Date.now().toString(36)}`,
      athleteId: athlete.id,
      athleteName: athlete.name,
      title: prepVal('coach-prep-title-input').trim() || (prior && prior.title) || 'Preparation plan',
      goalType: meetDate ? 'meet_prep' : 'general',
      durationMonths: clampPrepMonths(prepVal('coach-prep-months-select')),
      startDate: prepVal('coach-prep-start-date') || formatIsoDate(new Date()),
      targetMeetDate: meetDate || '',
      targetSquatKg: rms.squat,
      targetBenchKg: rms.bench,
      targetDeadliftKg: rms.deadlift,
      version: ((prior && Number(prior.version)) || 0) + 1,
      updatedAt: new Date().toISOString()
    });
    prepState.plan = plan;
    return plan;
  }

  function persistPrepPlan(plan) {
    const stored = callPrepStore(['savePlan', 'upsertPlan', 'saveActivePlan'], [plan, 'coach']);
    if (stored && typeof stored === 'object' && stored.planId) {
      prepState.plan = Object.assign({}, plan, stored);
    }
    writeLocalPrepDraft(prepState.athleteId);
  }

  function persistPrepWorkout(workout) {
    callPrepStore(['saveWorkout', 'savePlannedWorkout', 'upsertPlannedWorkout'], [workout, 'coach']);
    writeLocalPrepDraft(prepState.athleteId);
  }

  function broadcastPrepPlan() {
    const plan = prepState.plan;
    if (!plan) return;
    emitPrepEvent('prep:plan_sync', { plan, planId: plan.planId, athleteId: plan.athleteId, timestamp: Date.now() });
  }

  function broadcastPrepWorkout(workout) {
    if (!workout) return;
    emitPrepEvent('prep:workout_updated', {
      workout,
      workoutId: workout.workoutId,
      planId: workout.planId,
      athleteId: workout.athleteId,
      timestamp: Date.now()
    });
  }

  function broadcastPrepWorkoutsCapped(list) {
    const todayStr = formatIsoDate(new Date());
    list.slice()
      .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)))
      .filter(w => String(w.scheduledDate) >= todayStr)
      .slice(0, PREP_EVENT_BROADCAST_CAP)
      .forEach(broadcastPrepWorkout);
  }

  /** Saves the selected day session and broadcasts it live to the athlete. */
  function saveCurrentPrepSession(opts) {
    const silent = Boolean(opts && opts.silent);
    const athlete = getPrepAthlete();
    if (!athlete) {
      if (!silent) showFeedbackMessage('Select a connected athlete to prepare a session.');
      return null;
    }
    const dateStr = getPrepDate(prepState.weekIndex, prepState.dayIndex);
    let workout = findPrepWorkoutByDate(dateStr);
    const title = prepVal('coach-prep-session-title').trim();
    const workoutNotes = prepVal('coach-prep-workout-notes').trim();
    const dietaryNotes = prepVal('coach-prep-dietary-notes').trim();
    const hasContent = prepState.draftSlots.length > 0 || title || workoutNotes || dietaryNotes;
    if (!workout && !hasContent) return null;

    const planWasMissing = !prepState.plan;
    const plan = syncPrepPlanFromHeader();
    if (!plan) return null;
    if (planWasMissing) persistPrepPlan(plan);

    const deloadEl = prepEl('coach-prep-deload-toggle');
    const isNew = !workout;
    workout = Object.assign({}, workout || {}, {
      workoutId: (workout && workout.workoutId) || `pw_${athlete.id}_${dateStr.replace(/-/g, '')}`,
      planId: plan.planId,
      athleteId: athlete.id,
      scheduledDate: dateStr,
      weekIndex: prepState.weekIndex,
      dayOfWeek: PREP_DAY_NAMES[prepState.dayIndex],
      blockPhase: prepVal('coach-prep-phase-select') || 'Hypertrophy',
      isDeload: Boolean(deloadEl && deloadEl.checked),
      sessionTitle: title,
      prescribedSlots: prepState.draftSlots.map(s => Object.assign({}, s)),
      workoutNotes,
      dietaryNotes,
      adherenceStatus: (workout && workout.adherenceStatus) || 'planned',
      updatedAt: new Date().toISOString()
    });

    const idx = prepState.workouts.findIndex(w => w && w.scheduledDate === dateStr);
    if (idx >= 0) prepState.workouts[idx] = workout; else prepState.workouts.push(workout);

    persistPrepWorkout(workout);
    if (planWasMissing) broadcastPrepPlan();
    broadcastPrepWorkout(workout);

    renderPrepWeeks();
    renderPrepDayTabs();
    renderPrepComparison();
    if (!silent) showFeedbackMessage(isNew ? 'Session saved and sent to the athlete.' : 'Session updated live for the athlete.');
    return workout;
  }

  function schedulePrepAutosave(kind) {
    if (typeof setTimeout !== 'function') return;
    if (prepState.autosaveTimer) clearTimeout(prepState.autosaveTimer);
    prepState.autosaveTimer = setTimeout(() => {
      prepState.autosaveTimer = null;
      if (kind === 'plan') {
        if (!prepState.plan) return;
        const plan = syncPrepPlanFromHeader();
        if (plan) {
          persistPrepPlan(plan);
          broadcastPrepPlan();
        }
      } else {
        saveCurrentPrepSession({ silent: true });
      }
    }, PREP_AUTOSAVE_DELAY_MS);
  }

  /** Marks or clears the dirty state on #btn-coach-publish-prep (explicit publish). */
  function markPrepPublishDirty(isDirty) {
    const btn = prepEl('btn-coach-publish-prep');
    if (!btn) return;
    if (isDirty) {
      if (btn.classList) btn.classList.add('is-dirty');
      if (typeof btn.setAttribute === 'function') btn.setAttribute('data-dirty', 'true');
    } else {
      if (btn.classList) btn.classList.remove('is-dirty');
      if (typeof btn.removeAttribute === 'function') btn.removeAttribute('data-dirty');
    }
  }

  /** Ensures the Macro Week Progression Stepper controls exist in #coach-prep-macro-card. */
  function ensurePrepMacroStepperControls() {
    if (typeof document === 'undefined') return;
    const macroCard = prepEl('coach-prep-macro-card');
    if (!macroCard) return;
    const quickTools = macroCard.querySelector ? macroCard.querySelector('.coach-prep-quick-tools') : null;
    if (!quickTools) return;

    if (!prepEl('coach-prep-bump-select') && typeof document.createElement === 'function') {
      const select = document.createElement('select');
      select.id = 'coach-prep-bump-select';
      select.className = 'coach-prep-input coach-prep-bump-select';
      select.setAttribute('aria-label', 'Week progression step');
      select.setAttribute('data-prep-tooltip-key', 'coach_prep_macro_card');
      select.innerHTML = [
        '<option value="1.25_kg">+1.25 kg</option>',
        '<option value="2.5_kg">+2.5 kg</option>',
        '<option value="0.5_rpe">+0.5 RPE</option>'
      ].join('');
      quickTools.appendChild(select);
    }

    if (!prepEl('btn-coach-bump-week-load') && typeof document.createElement === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-coach-bump-week-load';
      btn.className = 'coach-prep-btn';
      btn.setAttribute('data-prep-tooltip-key', 'coach_prep_macro_card');
      btn.textContent = 'Bump Week';
      quickTools.appendChild(btn);
    }
  }

  /** Increments all non-deload day slots in prepState.selectedWeek and marks publish dirty. */
  function bumpPrepWeekLoad() {
    const athlete = getPrepAthlete();
    if (!athlete) {
      showFeedbackMessage('Select a connected athlete first.');
      return null;
    }
    const plan = syncPrepPlanFromHeader();
    if (!plan) return null;

    const targetWeek = (typeof prepState.selectedWeek === 'number') ? prepState.selectedWeek : prepState.weekIndex;
    const weekWorkouts = prepState.workouts.filter(w => w && Number(w.weekIndex) === targetWeek && !w.isDeload);
    if (weekWorkouts.length === 0) {
      showFeedbackMessage('No non-deload sessions in the selected week.');
      return null;
    }

    const selectEl = prepEl('coach-prep-bump-select');
    const rawStep = selectEl ? String(selectEl.value || '2.5_kg') : '2.5_kg';
    const isRpeMode = /rpe/i.test(rawStep);
    const stepValue = parseFloat(rawStep) || (isRpeMode ? 0.5 : 2.5);
    const oneRms = getPrepOneRms();

    let updatedSlotsCount = 0;
    const updatedWorkouts = weekWorkouts.map(workout => {
      const slots = Array.isArray(workout.prescribedSlots) ? workout.prescribedSlots : [];
      const nextSlots = slots.map(slot => {
        if (!slot || typeof slot !== 'object') return slot;
        updatedSlotsCount += 1;
        const nextSlot = Object.assign({}, slot);
        const topSet = Object.assign({}, nextSlot.topSet || {});
        const rawBack = nextSlot.backoff || nextSlot.backoffSets;
        const backoff = rawBack ? Object.assign({}, rawBack) : null;

        if (isRpeMode) {
          const curTopRpe = Number(topSet.rpe != null ? topSet.rpe : (topSet.targetRpe != null ? topSet.targetRpe : 8.0));
          const nextTopRpe = Math.min(10, Number((curTopRpe + stepValue).toFixed(1)));
          topSet.rpe = nextTopRpe;
          topSet.targetRpe = nextTopRpe;
          if (backoff) {
            const curBackRpe = Number(backoff.rpe != null ? backoff.rpe : (backoff.targetRpe != null ? backoff.targetRpe : 7.0));
            const nextBackRpe = Math.min(10, Number((curBackRpe + stepValue).toFixed(1)));
            backoff.rpe = nextBackRpe;
            backoff.targetRpe = nextBackRpe;
          }
          // Clear cached loads if 1RM anchor is present so ErosPrepEngine derives new weights from RPE
          if (oneRms.squat > 0 || oneRms.bench > 0 || oneRms.deadlift > 0) {
            delete topSet.loadKg;
            delete topSet.suggestedLoadKg;
            if (backoff) {
              delete backoff.loadKg;
              delete backoff.suggestedLoadKg;
            }
          }
        } else {
          const curTopLoad = Number(topSet.loadKg || topSet.suggestedLoadKg || 0);
          if (curTopLoad > 0) {
            const nextTopLoad = Number((curTopLoad + stepValue).toFixed(2));
            topSet.loadKg = nextTopLoad;
            topSet.suggestedLoadKg = nextTopLoad;
          }
          if (backoff) {
            if (Number(backoff.dropPct) > 0) {
              // Let ErosPrepEngine recalculate Set Y weight from Set X load & dropPct
              delete backoff.loadKg;
              delete backoff.suggestedLoadKg;
            } else if (Number(backoff.loadKg || backoff.suggestedLoadKg || 0) > 0) {
              const curBackLoad = Number(backoff.loadKg || backoff.suggestedLoadKg || 0);
              const nextBackLoad = Number((curBackLoad + stepValue).toFixed(2));
              backoff.loadKg = nextBackLoad;
              backoff.suggestedLoadKg = nextBackLoad;
            }
          }
        }

        const engineInput = Object.assign({}, nextSlot, { topSet });
        if (backoff) engineInput.backoff = backoff;
        const recalculated = callPrepEngine('prescribeSlotWithTopAndBackoff', [engineInput, oneRms]);
        if (recalculated && typeof recalculated === 'object') {
          if (recalculated.topSet) nextSlot.topSet = recalculated.topSet;
          if (recalculated.backoff) {
            nextSlot.backoff = recalculated.backoff;
            nextSlot.backoffSets = recalculated.backoff;
          } else if (backoff) {
            nextSlot.backoff = backoff;
            nextSlot.backoffSets = backoff;
          }
        } else {
          nextSlot.topSet = topSet;
          if (backoff) {
            nextSlot.backoff = backoff;
            nextSlot.backoffSets = backoff;
          }
        }
        return nextSlot;
      });
      return Object.assign({}, workout, { prescribedSlots: nextSlots });
    });

    persistPrepPlan(plan);
    mergePrepWorkouts(updatedWorkouts);
    updatedWorkouts.forEach(persistPrepWorkout);
    afterPrepBulkChange(`Week ${targetWeek + 1} progressed (${isRpeMode ? `+${stepValue} RPE` : `+${stepValue} kg`}) across ${updatedSlotsCount} slots. Publish to sync.`);
    markPrepPublishDirty(true);
    return updatedWorkouts;
  }

  /** Saves the plan header and broadcasts the whole plan to the athlete. */
  function publishPrepPlan() {
    const athlete = getPrepAthlete();
    if (!athlete) {
      showFeedbackMessage('Select a connected athlete to publish a plan.');
      return null;
    }
    const sessionSaved = saveCurrentPrepSession({ silent: true });
    const plan = syncPrepPlanFromHeader();
    if (!plan) return null;
    persistPrepPlan(plan);
    broadcastPrepPlan();
    if (!sessionSaved) broadcastPrepWorkoutsCapped(prepState.workouts);
    renderPrepFactoring();
    renderCoachPrescribedBridge();
    markPrepPublishDirty(false);
    showFeedbackMessage(`Plan published: ${plan.title}`);
    return plan;
  }

  function normalizePrepWorkoutList(result) {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.workouts)) return result.workouts;
    return [];
  }

  function mergePrepWorkouts(list) {
    list.forEach(w => {
      if (!w || !w.scheduledDate) return;
      const idx = prepState.workouts.findIndex(x => x && x.scheduledDate === w.scheduledDate);
      if (idx >= 0) prepState.workouts[idx] = w; else prepState.workouts.push(w);
    });
  }

  function stampPrepWorkouts(list, plan, athlete) {
    return list.map(w => Object.assign({}, w, {
      workoutId: w.workoutId || `pw_${athlete.id}_${String(w.scheduledDate || '').replace(/-/g, '')}`,
      planId: plan.planId,
      athleteId: athlete.id
    }));
  }

  function afterPrepBulkChange(message) {
    renderPrepWeeks();
    renderPrepDayTabs();
    loadPrepSessionIntoForm();
    renderPrepComparison();
    renderCoachPrescribedBridge();
    broadcastPrepPlan();
    broadcastPrepWorkoutsCapped(prepState.workouts);
    writeLocalPrepDraft(prepState.athleteId);
    if (message) showFeedbackMessage(message);
  }

  /** Applies the chosen block template across the plan horizon. */
  function applyPrepTemplate() {
    const athlete = getPrepAthlete();
    const key = prepVal('coach-prep-template-select');
    if (!athlete || !key) {
      showFeedbackMessage(athlete ? 'Select a template first.' : 'Select a connected athlete first.');
      return;
    }
    const plan = syncPrepPlanFromHeader();
    if (!plan) return;
    const result = callPrepEngine('generateBlockTemplate', [key, {
      athleteId: athlete.id,
      startDate: plan.startDate,
      months: plan.durationMonths,
      oneRms: getPrepOneRms(),
      planId: plan.planId
    }]);
    const generated = stampPrepWorkouts(normalizePrepWorkoutList(result), plan, athlete);
    if (generated.length === 0) {
      showFeedbackMessage('Template unavailable.');
      return;
    }
    if (result && result.plan && typeof result.plan === 'object') {
      prepState.plan = Object.assign({}, plan, result.plan, { planId: plan.planId, athleteId: athlete.id });
    }
    persistPrepPlan(prepState.plan);
    mergePrepWorkouts(generated);
    generated.forEach(persistPrepWorkout);
    afterPrepBulkChange(`Template applied: ${generated.length} sessions planned.`);
  }

  /** Converts the selected week into a deload week. */
  function applyPrepDeloadWeek() {
    const athlete = getPrepAthlete();
    if (!athlete) {
      showFeedbackMessage('Select a connected athlete first.');
      return;
    }
    const plan = syncPrepPlanFromHeader();
    if (!plan) return;
    const weekWorkouts = prepState.workouts.filter(w => w && Number(w.weekIndex) === prepState.weekIndex);
    if (weekWorkouts.length === 0) {
      showFeedbackMessage('Plan sessions in this week before applying a deload.');
      return;
    }
    const result = callPrepEngine('generateDeloadWeek', [weekWorkouts, { weekIndex: prepState.weekIndex }]);
    const deloaded = stampPrepWorkouts(normalizePrepWorkoutList(result), plan, athlete);
    if (deloaded.length === 0) {
      showFeedbackMessage('Deload generator unavailable.');
      return;
    }
    persistPrepPlan(plan);
    mergePrepWorkouts(deloaded);
    deloaded.forEach(persistPrepWorkout);
    afterPrepBulkChange(`Week ${prepState.weekIndex + 1} converted to a deload week.`);
  }

  /** Clones the selected week into the following week. */
  function clonePrepWeek() {
    const athlete = getPrepAthlete();
    if (!athlete) {
      showFeedbackMessage('Select a connected athlete first.');
      return;
    }
    const plan = syncPrepPlanFromHeader();
    if (!plan) return;
    const weekWorkouts = prepState.workouts.filter(w => w && Number(w.weekIndex) === prepState.weekIndex);
    if (weekWorkouts.length === 0) {
      showFeedbackMessage('Plan sessions in this week before cloning it.');
      return;
    }
    const nextWeek = prepState.weekIndex + 1;
    if (nextWeek >= getPrepWeekCount()) {
      showFeedbackMessage('Extend the plan horizon to clone into another week.');
      return;
    }
    const result = callPrepEngine('cloneOrShiftWeek', [weekWorkouts, { shiftWeeks: 1, startDate: plan.startDate }]);
    const cloned = stampPrepWorkouts(normalizePrepWorkoutList(result), plan, athlete);
    if (cloned.length === 0) {
      showFeedbackMessage('Week cloning unavailable.');
      return;
    }
    persistPrepPlan(plan);
    mergePrepWorkouts(cloned);
    cloned.forEach(persistPrepWorkout);
    prepState.weekIndex = nextWeek;
    prepState.selectedWeek = nextWeek;
    afterPrepBulkChange(`Week ${nextWeek} cloned into week ${nextWeek + 1}.`);
  }

  function formatPrepCountdown(info) {
    if (!info) return 'No Meet Date';
    if (typeof info === 'string') return info;
    if (info.label) return String(info.label);
    const rawDays = typeof info.days === 'number' ? info.days : info.daysOut;
    if (typeof rawDays === 'number') {
      if (rawDays < 0) return 'Meet Completed';
      const rawWeeks = typeof info.weeks === 'number' ? info.weeks : (typeof info.weeksOut === 'number' ? info.weeksOut : Math.floor(rawDays / 7));
      return `${rawDays} Days | ${rawWeeks} Weeks`;
    }
    return 'No Meet Date';
  }

  function normalizeFactorAlerts(result) {
    const list = Array.isArray(result) ? result : ((result && (result.alerts || result.factors)) || []);
    return list.map(item => {
      if (typeof item === 'string') return { level: 'info', message: item };
      const rawLevel = String((item && (item.level || item.severity)) || 'info').toLowerCase();
      const level = /crit|high|error/.test(rawLevel) ? 'crit' : (/warn|medium/.test(rawLevel) ? 'warn' : 'info');
      return { level, message: String((item && (item.message || item.text)) || '') };
    }).filter(a => a.message);
  }

  /** Renders the athlete factoring badges, alerts and meet countdown. */
  function renderPrepFactoring() {
    const athlete = getPrepAthlete();
    const badgesEl = prepEl('coach-prep-factoring-badges');
    const alertsEl = prepEl('coach-prep-factoring-alerts');
    const countdownEl = prepEl('coach-prep-meet-countdown');

    const meetDate = prepVal('coach-prep-meet-date');
    if (countdownEl) {
      const info = meetDate ? callPrepEngine('computeMeetCountdown', [meetDate, formatIsoDate(new Date())]) : null;
      countdownEl.textContent = formatPrepCountdown(info);
    }
    if (!badgesEl && !alertsEl) return;
    if (!athlete) {
      if (badgesEl) badgesEl.innerHTML = '<span class="coach-prep-factor-badge" data-prep-tooltip-key="coach_prep_factoring_badges">No Athlete Selected</span>';
      if (alertsEl) alertsEl.innerHTML = '';
      return;
    }

    const stored = callPrepStore(['getAthleteBiometrics'], [athlete.id]) || {};
    const bio = Object.assign({}, stored, prepState.profiles[athlete.id] || {});
    const badges = [];
    if (bio.age) badges.push(`Age ${bio.age}`);
    if (bio.bodyweightKg) badges.push(`BW ${bio.bodyweightKg} kg`);
    if (bio.targetWeightClass) badges.push(`Class ${bio.targetWeightClass}`);
    if (bio.experienceTier) {
      const rawTier = String(bio.experienceTier).trim();
      const tierTitle = rawTier.replace(/\b[a-zA-Z]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      badges.push(`Tier ${tierTitle}`);
    }
    if (bio.trainingAgeYears !== undefined && bio.trainingAgeYears !== null && bio.trainingAgeYears !== '') badges.push(`Training Age ${bio.trainingAgeYears} yrs`);
    if (bio.meetsCompleted !== undefined && bio.meetsCompleted !== null && bio.meetsCompleted !== '') badges.push(`Meets ${bio.meetsCompleted}`);
    if (Array.isArray(bio.availableDays)) badges.push(`Days ${bio.availableDays.length}/7`);
    if (bio.federation) badges.push(String(bio.federation));
    if (badgesEl) {
      badgesEl.innerHTML = badges.length
        ? badges.map(b => `<span class="coach-prep-factor-badge" data-prep-tooltip-key="coach_prep_factoring_badges">${escapeHtml(b)}</span>`).join('')
        : '<span class="coach-prep-factor-badge" data-prep-tooltip-key="coach_prep_factoring_badges">Awaiting Athlete Profile</span>';
    }

    if (alertsEl) {
      const alerts = normalizeFactorAlerts(callPrepEngine('evaluateAthletePrepFactors', [bio, prepState.plan]));
      const dutiesNote = bio.dutiesInjuryNotes ? String(bio.dutiesInjuryNotes).trim() : '';
      if (dutiesNote && !alerts.some(a => a.message.indexOf(dutiesNote.slice(0, 24)) >= 0)) {
        alerts.push({ level: 'warn', message: `Athlete notes: ${dutiesNote}` });
      }
      alertsEl.innerHTML = alerts.map(a =>
        `<div class="coach-prep-alert coach-prep-alert-${escapeHtml(a.level)}" data-prep-tooltip-key="coach_prep_factoring_alerts" role="status">${escapeHtml(a.message)}</div>`
      ).join('');
    }
  }

  function collectCompletedSetsForDate(athleteId, dateStr) {
    const sets = [];
    const seen = new Set();
    const addSet = (s, fallbackLift) => {
      if (!s) return;
      const key = s.setId ? String(s.setId) : `${s.setNumber || ''}_${s.lift || fallbackLift || ''}_${s.weight || 0}`;
      if (s.setId && seen.has(key)) return;
      seen.add(key);
      const copy = Object.assign({}, s);
      if (s.rawLift) copy.lift = s.rawLift;
      else if (!copy.lift && fallbackLift) copy.lift = fallbackLift;
      copy.plannedWorkoutId = s.plannedWorkoutId || s.planned_workout_id || '';
      copy.plannedSlotId = s.plannedSlotId || s.planned_slot_id || '';
      copy.velocityLoss = Number(s.velocityLossPct != null ? s.velocityLossPct : s.velocityLoss) || 0;
      copy.isPr = Boolean(s.isPr || s.isPR || (s.setId && goldenPr.setIds.has(s.setId)));
      copy.isPR = copy.isPr;
      sets.push(copy);
    };

    getAthleteWorkouts(athleteId).forEach(w => {
      if (w && w.date === dateStr && Array.isArray(w.sets)) {
        w.sets.forEach(s => addSet(s, w.lift));
      }
    });

    if (!athleteId || athleteId === 'ath_01') {
      const activeW = getSafeActiveWorkout();
      if (activeW && Array.isArray(activeW.sets)) {
        const dObj = activeW.startTime ? new Date(activeW.startTime) : (activeW.date ? new Date(activeW.date) : new Date());
        const activeDate = !isNaN(dObj.getTime()) ? formatIsoDate(dObj) : formatIsoDate(new Date());
        if (activeDate === dateStr) {
          activeW.sets.forEach(s => addSet(s, activeW.lift));
        }
      }
    }
    return sets;
  }

  function fmtPrepCell(value) {
    if (value === null || value === undefined || value === '') return '&mdash;';
    if (typeof value === 'string' || typeof value === 'number') return escapeHtml(String(value));
    const sets = value.sets !== undefined ? value.sets : value.setCount;
    const reps = value.reps !== undefined ? value.reps : value.repsCount;
    const load = value.loadKg !== undefined ? value.loadKg : (value.weight !== undefined ? value.weight : value.load);
    const vel = value.velocity !== undefined ? value.velocity : (value.targetVelocity !== undefined ? value.targetVelocity : value.avgVelocity);
    const rpe = value.rpe !== undefined ? value.rpe : value.avgRpe;
    const parts = [];
    if (sets !== undefined && reps !== undefined) parts.push(`${sets}x${reps}`);
    else if (sets !== undefined) parts.push(`${sets} sets`);
    if (rpe !== undefined && Number(rpe) > 0) parts.push(`@RPE ${Number(rpe)}`);
    if (load !== undefined && Number(load) > 0) parts.push(`${Number(load).toFixed(1)} kg`);
    if (vel !== undefined && Number(vel) > 0) parts.push(`${Number(vel).toFixed(2)} m/s`);
    return parts.length ? escapeHtml(parts.join(' | ')) : '&mdash;';
  }

  function fmtPrepDelta(row) {
    if (row && row.actual && Number(row.actual.sets) > 0) {
      const bits = [];
      if (typeof row.loadDeltaKg === 'number' && isFinite(row.loadDeltaKg) && row.loadDeltaKg !== 0) {
        bits.push(`${row.loadDeltaKg > 0 ? '+' : ''}${row.loadDeltaKg.toFixed(1)} kg`);
      }
      if (typeof row.velocityDelta === 'number' && isFinite(row.velocityDelta) && row.velocityDelta !== 0) {
        bits.push(`${row.velocityDelta > 0 ? '+' : ''}${row.velocityDelta.toFixed(2)} m/s`);
      }
      if (row.status) bits.push(String(row.status));
      const cls = (row.loadDeltaKg > 0 || row.status === 'exceeded' || row.status === 'hit')
        ? 'coach-prep-delta-pos'
        : (row.loadDeltaKg < 0 || row.status === 'under' ? 'coach-prep-delta-neg' : 'coach-prep-delta-flat');
      return `<span class="${cls}">${escapeHtml(bits.join(' | ') || 'hit')}</span>`;
    }
    const delta = row && (row.delta !== undefined ? row.delta : (row.deltaLoadKg !== undefined ? row.deltaLoadKg : row.status));
    if (delta === undefined || delta === null || delta === '') return '&mdash;';
    if (typeof delta === 'number') {
      const cls = delta > 0 ? 'coach-prep-delta-pos' : (delta < 0 ? 'coach-prep-delta-neg' : 'coach-prep-delta-flat');
      return `<span class="${cls}">${escapeHtml((delta > 0 ? '+' : '') + delta.toFixed(1))}</span>`;
    }
    if (typeof delta === 'object') return fmtPrepCell(delta);
    return escapeHtml(String(delta));
  }

  /** Renders the side-by-side planned versus actual matrix and athlete feedback. */
  function renderPrepComparison() {
    const body = prepEl('coach-prep-comparison-body');
    const feedbackEl = prepEl('coach-prep-athlete-feedback-view');
    if (!body && !feedbackEl) return;
    const athlete = getPrepAthlete();
    const workout = athlete ? getSelectedPrepWorkout() : null;

    if (feedbackEl) {
      const note = workout ? (prepState.feedbackByWorkout[workout.workoutId] || workout.athleteFeedbackNote || '') : '';
      feedbackEl.textContent = note ? `Athlete feedback: ${note}` : '';
    }
    if (!body) return;
    if (!workout || !Array.isArray(workout.prescribedSlots) || workout.prescribedSlots.length === 0) {
      body.innerHTML = '<p class="coach-prep-empty">Select an athlete and a session day to compare plan and execution.</p>';
      return;
    }

    const completed = collectCompletedSetsForDate(athlete.id, workout.scheduledDate);
    const cmp = callPrepEngine('comparePlanVsActual', [workout, completed]);
    let rows = Array.isArray(cmp) ? cmp : ((cmp && (cmp.rows || cmp.slots || cmp.comparison)) || []);
    if (!Array.isArray(rows) || rows.length === 0) {
      rows = workout.prescribedSlots.map(slot => ({
        exerciseName: slot.exerciseName,
        planned: slot.topSet,
        actual: null
      }));
    }
    const adherence = cmp && !Array.isArray(cmp) ? (cmp.adherencePct !== undefined ? cmp.adherencePct : cmp.adherence) : undefined;
    const dayHasPr = completed.some(isSetGoldenPr) || goldenPr.dates.has(workout.scheduledDate);

    body.innerHTML =
      `<table class="coach-prep-compare-table"><thead><tr><th>Exercise</th><th>Planned</th><th>Actual</th><th>Delta</th></tr></thead><tbody>` +
      rows.map(row => {
        const name = row.exerciseName || row.name || row.exerciseId || 'Exercise';
        const rowPr = row.hasPr === true || row.isPr === true || row.isPR === true ||
          Boolean(row.actual && (row.actual.hasPr === true || row.actual.isPr === true || row.actual.isPR === true));
        return `<tr><td>${escapeHtml(name)}${rowPr ? goldenPrBadgeHtml(false) : ''}</td><td class="font-mono">${fmtPrepCell(row.planned)}</td><td class="font-mono">${fmtPrepCell(row.actual)}</td><td class="font-mono">${fmtPrepDelta(row)}</td></tr>`;
      }).join('') +
      `</tbody></table>` +
      (adherence !== undefined && adherence !== null && isFinite(Number(adherence))
        ? `<p class="coach-prep-empty">Adherence ${escapeHtml(String(Math.round(Number(adherence))))}%${dayHasPr ? goldenPrBadgeHtml(false) : ''}</p>`
        : (dayHasPr ? `<p class="coach-prep-empty">${goldenPrBadgeHtml(false)}</p>` : ''));
  }

  function setPrepPanelHidden(hidden) {
    const panel = prepEl('coach-preparation-panel');
    if (panel && panel.style) panel.style.display = hidden ? 'none' : '';
  }

  /** Renders every section of the Coach Preparation panel. */
  function renderPreparationPanel() {
    if (!prepEl('coach-preparation-panel')) return;
    initPreparationPanel();
    populatePrepAthleteSelect();
    loadPrepForAthlete(prepState.athleteId, { preserveCursor: prepState.athleteId === prepState.loadedFor });
    populatePrepTemplateOptions();
    populatePrepExerciseOptions();
    renderPrepWeeks();
    renderPrepDayTabs();
    loadPrepSessionIntoForm();
    renderPrepFactoring();
    renderPrepComparison();
    updatePrepSlotPreviews();
  }

  function addPrepSlotFromInputs() {
    const slot = buildPrepSlotFromInputs();
    if (!slot) {
      showFeedbackMessage('Choose an exercise before adding it to the session.');
      return;
    }
    prepState.draftSlots.push(slot);
    renderPrepSlotsTable();
    saveCurrentPrepSession({ silent: true });
  }

  function registerCustomPrepExercise() {
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
    const name = window.prompt('Custom exercise name');
    if (!name || !String(name).trim()) return;
    const lift = window.prompt('Base movement (squat, bench, deadlift or accessory)', 'accessory');
    const entry = { name: String(name).trim().slice(0, 60), baseLift: normalizeBaseLift(lift) || 'accessory' };
    const registered = callPrepEngine('registerCustomExercise', [entry]);
    const exercise = (registered && typeof registered === 'object' && registered.id)
      ? registered
      : Object.assign({ id: `custom_${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, category: 'custom' }, entry);
    if (!prepState.customExercises.some(ex => ex.id === exercise.id)) prepState.customExercises.push(exercise);
    setPrepVal('coach-prep-exercise-search', '');
    populatePrepExerciseOptions(exercise.id);
    updatePrepSlotPreviews();
  }

  function onPrepHeaderChanged(e) {
    const id = e && e.target ? e.target.id : '';
    if (id === 'coach-prep-months-select') {
      setPrepVal('coach-prep-months-select', clampPrepMonths(prepVal('coach-prep-months-select')));
    }
    renderPrepWeeks();
    renderPrepDayTabs();
    renderPrepFactoring();
    updatePrepSlotPreviews();
    schedulePrepAutosave('plan');
  }

  /** Binds the Coach Preparation panel controls exactly once. */
  function initPreparationPanel() {
    if (prepState.bound) return true;
    const panel = prepEl('coach-preparation-panel');
    if (!panel || typeof panel.addEventListener !== 'function') return false;
    prepState.bound = true;

    const on = (id, evt, fn) => {
      const el = prepEl(id);
      if (el && typeof el.addEventListener === 'function') el.addEventListener(evt, fn);
    };

    on('coach-prep-athlete-select', 'change', (e) => {
      loadPrepForAthlete(e.target.value);
      renderPreparationPanel();
    });
    PREP_HEADER_INPUT_IDS.forEach(id => on(id, 'input', onPrepHeaderChanged));
    PREP_HEADER_INPUT_IDS.forEach(id => on(id, 'change', onPrepHeaderChanged));
    PREP_SESSION_INPUT_IDS.forEach(id => {
      on(id, 'input', () => schedulePrepAutosave('session'));
      on(id, 'change', () => schedulePrepAutosave('session'));
    });
    PREP_SLOT_INPUT_IDS.forEach(id => on(id, 'input', updatePrepSlotPreviews));
    on('coach-prep-exercise-search', 'input', () => {
      populatePrepExerciseOptions();
      updatePrepSlotPreviews();
    });
    on('coach-prep-exercise-select', 'change', updatePrepSlotPreviews);
    on('btn-coach-custom-exercise', 'click', registerCustomPrepExercise);
    on('btn-coach-add-slot', 'click', addPrepSlotFromInputs);
    on('btn-coach-save-session', 'click', () => saveCurrentPrepSession({ silent: false }));
    on('btn-coach-publish-prep', 'click', publishPrepPlan);
    on('btn-coach-apply-template', 'click', applyPrepTemplate);
    on('btn-coach-deload-week', 'click', applyPrepDeloadWeek);
    on('btn-coach-clone-week', 'click', clonePrepWeek);
    ensurePrepMacroStepperControls();
    on('btn-coach-bump-week-load', 'click', bumpPrepWeekLoad);

    on('coach-prep-weeks-track', 'click', (e) => {
      const cell = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-week]') : null;
      if (!cell) return;
      prepState.weekIndex = parseInt(cell.getAttribute('data-week'), 10) || 0;
      prepState.selectedWeek = prepState.weekIndex;
      renderPrepWeeks();
      renderPrepDayTabs();
      loadPrepSessionIntoForm();
      renderPrepComparison();
    });
    on('coach-prep-day-tabs', 'click', (e) => {
      const tab = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-day]') : null;
      if (!tab) return;
      prepState.dayIndex = parseInt(tab.getAttribute('data-day'), 10) || 0;
      renderPrepDayTabs();
      loadPrepSessionIntoForm();
      renderPrepComparison();
    });
    on('coach-prep-slots-body', 'click', (e) => {
      const btn = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-remove-slot]') : null;
      if (!btn) return;
      const slotId = btn.getAttribute('data-remove-slot');
      prepState.draftSlots = prepState.draftSlots.filter(s => s.slotId !== slotId);
      renderPrepSlotsTable();
      saveCurrentPrepSession({ silent: true });
    });
    return true;
  }

  function handleAthleteProfileUpdated(payload) {
    if (!payload) return;
    const athleteId = payload.athleteId || 'ath_01';
    prepState.profiles[athleteId] = Object.assign({}, prepState.profiles[athleteId] || {}, payload);
    if (isCoachMode && activeCoachPanel === 'preparation') renderPrepFactoring();
    if (isCoachMode) showFeedbackMessage('Athlete profile updated.');
  }

  function handlePrepAthleteFeedback(payload) {
    if (!payload || !payload.workoutId) return;
    const note = String(payload.note || '').slice(0, 280);
    prepState.feedbackByWorkout[payload.workoutId] = note;
    const workout = prepState.workouts.find(w => w && w.workoutId === payload.workoutId);
    if (workout) workout.athleteFeedbackNote = note;
    if (isCoachMode && activeCoachPanel === 'preparation') renderPrepComparison();
    if (isCoachMode) showFeedbackMessage('Athlete feedback received.');
  }

  function handleWorkoutPrPushed(payload) {
    if (!payload) return;
    registerGoldenPr(payload);
    if (payload.setId) {
      remoteCompletedSets.forEach(s => {
        if (s && s.setId === payload.setId) {
          s.isPr = true;
          s.isPR = true;
        }
      });
    }
    refreshGoldenPrViews();
    if (isCoachMode) showFeedbackMessage(`Personal record pushed: ${payload.lift || 'lift'} ${payload.weight || ''} kg`.trim());
  }

  // Public Interface
  return {
    init,
    initCoachPortal: init,
    initPreparationPanel,
    renderPreparationPanel,
    publishPrepPlan,
    saveCurrentPrepSession,
    applyPrepTemplate,
    applyPrepDeloadWeek,
    clonePrepWeek,
    bumpPrepWeekLoad,
    markPrepPublishDirty,
    renderCoachPrescribedBridge,
    goldenPrBadgeHtml,
    isSetGoldenPr,
    isWorkoutGoldenPr,
    initMovableCoachPills,
    syncLivePanelGridColumns,
    startLiveRestTicker: startRestTicker,
    switchMode,
    switchCoachPanel,
    toggleCoachSidebar,
    navigateCoachSection,
    animateCountUp,
    renderProgressRing,
    computeSmartRadialAngles,
    applySmartOverflowProtection,
    initRadialActionMenu,
    toggleRadialActionMenu,
    getRadialActionsConfig,
    saveRadialActionsConfig,
    renderFullCoachDashboard,
    renderAthleteHistoryPanel,
    renderMonthlyCalendar,
    navigateCalendarMonth,
    selectCalendarDate,
    selectAthleteById,
    generatePairingCode,
    openBondModal,
    closeBondModal,
    approvePendingBond,
    declinePendingBond,
    manualLinkAthlete,
    revokeAthleteBond,
    computeWeeklyAdherence,
    getResolvedAthleteTotals,
    calculateOlsE1rm,
    formatCanonicalWorkoutName,
    classifyBryanMannZone,
    sendCoachPrescription,
    renderCoachBarPathCanvas,
    playCoachReplay,
    pauseCoachReplay,
    toggleCoachReplay,
    toggleCoachCanvasMode,
    toggleCoachReplaySpeed,
    loadCoachRepTrajectory,
    replayCompletedSet,
    stepCoachRepSelection,
    updateCoachRpePill,
    getCoachCanvasMode: () => coachCanvasMode,
    getCoachReplaySpeed: () => coachReplaySpeed,
    getCoachActiveTrajectory: () => coachActiveTrajectory,
    getIsCoachMode: () => isCoachMode,
    getActiveCoachPanel: () => activeCoachPanel,
    getSquadAthletes: () => SQUAD_ATHLETES,
    getCurrentAthlete: () => currentAthlete,
    getPendingBondRequests: () => pendingBondRequests
  };
});
