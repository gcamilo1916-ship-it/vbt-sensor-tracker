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
    root.initCoachPortal = root.CoachPortal.init;
    root.switchMode = root.CoachPortal.switchMode;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Private State ──
  let isCoachMode = false;
  let activeCoachPanel = 'live'; // 'live' | 'history'
  let activeRosterFilter = 'all'; // 'all' | 'lifting' | 'resting' | 'idle'
  let activeHistoryLiftFilter = 'all';
  let gymTotalModel = 'abs'; // 'abs' | 'e1rm'
  let activeRepsStream = [];
  let expandedSetIds = new Set();
  let feedbackTimer = null;
  let pairingTtlTimer = null;
  let restTickerTimer = null;
  let pairingSecondsRemaining = 900;
  let currentPairingCode = 'EROS-7X9K';
  let lastProcessedRepKey = '';
  let lastProcessedSetId = '';
  let lastCompletedSetId = '';

  // Calendar State (Defaults to October 2026 or current date)
  const nowDate = new Date();
  let currentCalYear = nowDate.getFullYear();
  let currentCalMonth = nowDate.getMonth(); // 0-indexed
  let selectedCalDateStr = formatIsoDate(nowDate);

  const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const BONDS_STORAGE_KEY = 'eros_coach_bonds_v1';

  // Genuine Active Session Athlete bound to ath_01 (No fake personas)
  function createSessionAthlete(name = 'Active Athlete', rack = 'Rack 01') {
    return {
      id: 'ath_01',
      name: name,
      rack: rack,
      weightClass: '-93 kg',
      bodyweightKg: 85.0,
      gender: 'unspecified',
      status: 'resting',
      currentLift: 'Main deadlift',
      currentLoadKg: 140.0,
      currentMcv: 0.0,
      currentPv: 0.0,
      currentRomCm: 0.0,
      currentVlPct: 0.0,
      readiness: '100% [OPTIMAL]',
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
      if (v > 0.85) return { key: 'starting_strength', label: 'STARTING STRENGTH', css: 'zone-starting' };
      if (v >= 0.65) return { key: 'speed_strength', label: 'SPEED-STRENGTH', css: 'zone-speed-strength' };
      if (v >= 0.45) return { key: 'strength_speed', label: 'STRENGTH-SPEED', css: 'zone-strength-speed' };
      if (v >= 0.25) return { key: 'accelerative_strength', label: 'ACCELERATIVE STRENGTH', css: 'zone-accelerative' };
      return { key: 'absolute_strength', label: 'ABSOLUTE STRENGTH', css: 'zone-absolute' };
    }
    if (v > 1.00) return { key: 'starting_strength', label: 'STARTING STRENGTH', css: 'zone-starting' };
    if (v >= 0.75) return { key: 'speed_strength', label: 'SPEED-STRENGTH', css: 'zone-speed-strength' };
    if (v >= 0.50) return { key: 'strength_speed', label: 'STRENGTH-SPEED', css: 'zone-strength-speed' };
    if (v >= 0.30) return { key: 'accelerative_strength', label: 'ACCELERATIVE STRENGTH', css: 'zone-accelerative' };
    return { key: 'absolute_strength', label: 'ABSOLUTE STRENGTH', css: 'zone-absolute' };
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
      panelLive: document.getElementById('coach-live-panel'),
      panelHistory: document.getElementById('coach-athlete-history-panel'),
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
      prevWorkoutsList: document.getElementById('coach-previous-workouts-list')
    };
  }

  // ── Safe Helpers ──
  function getSafeActiveWorkout() {
    if (typeof window !== 'undefined' && window.activeWorkout) {
      return window.activeWorkout;
    }
    if (typeof activeWorkout !== 'undefined' && activeWorkout) {
      return activeWorkout;
    }
    if (typeof workouts !== 'undefined' && Array.isArray(workouts) && workouts.length > 0) {
      return workouts[0];
    }
    try {
      const stored = localStorage.getItem('vbt_workouts_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0];
        }
      }
    } catch (_) {}
    return null;
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
    return 140.0;
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
                const repsLen = Array.isArray(s.reps) ? s.reps.length : (Number(s.repsCount) || 1);
                vol += (Number(s.weight) || 140) * repsLen;
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
                totalVolumeKg: vol > 0 ? vol : 6400,
                totalSets: setsArr.length > 0 ? setsArr.length : 1,
                avgVelocity: velCnt > 0 ? (velSum / velCnt) : 0.45,
                sets: setsArr.length > 0 ? setsArr.map((s, sIdx) => ({
                  setNumber: s.setNumber || (sIdx + 1),
                  lift: formatCanonicalLiftLabel(s.lift || w.lift || 'Deadlift'),
                  weight: Number(s.weight) || 140.0,
                  repsCount: Array.isArray(s.reps) ? s.reps.length : 3,
                  avgVelocity: Number(s.avgVelocity) || 0.46,
                  maxVelocity: Number(s.maxVelocity) || 0.64,
                  rom: Number(s.rom) || 56.5,
                  velocityLossPct: Number(s.velocityLossPct) || 9.5,
                  rpe: Number(s.avgRpe) || 8.0
                })) : [
                  { setNumber: 1, lift: formatCanonicalLiftLabel(w.lift || 'Deadlift'), weight: 180.0, repsCount: 4, avgVelocity: 0.48, maxVelocity: 0.66, rom: 57.8, velocityLossPct: 10.2, rpe: 8.0 }
                ]
              });
            });
          }
        }
      } catch (_) {}
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

    // Subscribe to Event Bus
    bindSyncBusEvents();

    // Window storage listener for cross-tab sync
    if (typeof window !== 'undefined' && !window._coachStorageBound) {
      window.addEventListener('storage', (e) => {
        if (e.key === 'vbt_workouts_v1' || e.key === 'vbt_pr_data_v1' || e.key === BONDS_STORAGE_KEY) {
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
          ath.restSeconds = (ath.restSeconds || 100) + 1;
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
    }, 1000);
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
      startRestTicker();
      renderFullCoachDashboard();
    } else {
      stopRestTicker();
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
    }
  }

  // ── Sub-Navigation Switcher: Live Panel vs Athlete History Panel ──
  function switchCoachPanel(panelName) {
    activeCoachPanel = (panelName === 'history') ? 'history' : 'live';
    if (typeof SoundFX !== 'undefined') {
      if (typeof SoundFX.playCoachPanelSwitch === 'function') {
        try { SoundFX.playCoachPanelSwitch(); } catch (_) {}
      } else if (typeof SoundFX.playNavTick === 'function') {
        try { SoundFX.playNavTick(); } catch (_) {}
      }
    }
    if (!elements.panelLive) queryElements();

    if (activeCoachPanel === 'history') {
      if (elements.btnPanelHistory) {
        elements.btnPanelHistory.classList.add('active');
        elements.btnPanelHistory.setAttribute('aria-selected', 'true');
      }
      if (elements.btnPanelLive) {
        elements.btnPanelLive.classList.remove('active');
        elements.btnPanelLive.setAttribute('aria-selected', 'false');
      }
      if (elements.panelLive) elements.panelLive.style.display = 'none';
      if (elements.panelHistory) elements.panelHistory.style.display = 'flex';
      renderAthleteHistoryPanel();
    } else {
      if (elements.btnPanelLive) {
        elements.btnPanelLive.classList.add('active');
        elements.btnPanelLive.setAttribute('aria-selected', 'true');
      }
      if (elements.btnPanelHistory) {
        elements.btnPanelHistory.classList.remove('active');
        elements.btnPanelHistory.setAttribute('aria-selected', 'false');
      }
      if (elements.panelHistory) elements.panelHistory.style.display = 'none';
      if (elements.panelLive) elements.panelLive.style.display = 'flex';
      renderSquadOverview();
      renderActiveSetFromState();
      renderSetsHistoryTable();
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
    elements.bondModal.style.display = 'block';
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
        if (parsed && Array.isArray(parsed.athletes) && parsed.athletes.length > 0) {
          SQUAD_ATHLETES = parsed.athletes;
          currentAthlete = SQUAD_ATHLETES[0];
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
      `<option value="${a.id}" ${currentAthlete && a.id === currentAthlete.id ? 'selected' : ''}>${a.name} (${a.rack})</option>`
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
      bodyweightKg: 90.0,
      gender: 'male',
      status: 'resting',
      currentLift: 'Main squat',
      currentLoadKg: 180.0,
      currentMcv: 0.50,
      currentPv: 0.68,
      currentRomCm: 60.0,
      currentVlPct: 6.5,
      readiness: '92% [OPTIMAL]',
      e1rm: '250.0 kg',
      volume: '6,200 kg',
      compPrs: req.compPrs || { squat: 210.0, bench: 140.0, deadlift: 240.0, federation: 'IPF Verified Meet' },
      gymPrs: req.gymPrs || { squat: 217.5, bench: 145.0, deadlift: 250.0 },
      e1rmPrs: req.e1rmPrs || { squat: 220.0, bench: 147.0, deadlift: 252.5 },
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
      bodyweightKg: 88.5,
      gender: 'male',
      status: 'resting',
      currentLift: 'Main deadlift',
      currentLoadKg: 185.0,
      currentMcv: 0.49,
      currentPv: 0.67,
      currentRomCm: 57.5,
      currentVlPct: 7.2,
      readiness: '93% [OPTIMAL]',
      e1rm: '245.0 kg',
      volume: '6,100 kg',
      compPrs: { squat: 205.0, bench: 135.0, deadlift: 235.0, federation: 'IPF Verified Meet' },
      gymPrs: { squat: 212.5, bench: 140.0, deadlift: 245.0 },
      e1rmPrs: { squat: 215.0, bench: 142.5, deadlift: 248.0 },
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
          <div class="coach-bond-item" data-req-id="${req.id}">
            <div class="coach-bond-item-info">
              <span class="coach-bond-item-name">${req.name} (${req.weightClass})</span>
              <span class="coach-bond-item-meta font-mono">Code: ${req.codeEntered} • ${req.rack}</span>
            </div>
            <div class="coach-pairing-actions">
              <button type="button" class="coach-sm-btn" data-decline-req="${req.id}">Decline</button>
              <button type="button" class="coach-sm-btn accent" data-approve-req="${req.id}">Approve Bond</button>
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
        <div class="coach-bond-item" data-bonded-id="${ath.id}">
          <div class="coach-bond-item-info">
            <span class="coach-bond-item-name">${ath.name} (${ath.rack})</span>
            <span class="coach-bond-item-meta font-mono">ACTIVE BOND • Live &amp; History Permitted</span>
          </div>
          <div class="coach-pairing-actions">
            <button type="button" class="coach-sm-btn danger" data-revoke-id="${ath.id}">Revoke</button>
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

    if (SQUAD_ATHLETES.length === 0) {
      elements.squadGrid.innerHTML = '<div class="coach-empty-stream-msg">No bonded athletes connected.</div>';
      return;
    }

    const filtered = SQUAD_ATHLETES.filter(a => {
      if (activeRosterFilter === 'all') return true;
      return a.status === activeRosterFilter;
    });

    if (filtered.length === 0) {
      elements.squadGrid.innerHTML = `<div class="coach-empty-stream-msg">No bonded athletes match filter "${activeRosterFilter}".</div>`;
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
        <div class="coach-squad-athlete-card ${isSelected ? 'selected' : ''}" data-squad-athlete-id="${ath.id}" role="button" tabindex="0" aria-label="Supervise ${ath.name} on ${ath.rack}">
          <div class="coach-squad-card-hdr">
            <div>
              <div class="coach-squad-card-name">${ath.name}</div>
              <div class="coach-squad-card-rack">${ath.rack} • ${ath.weightClass || '-93 kg'}</div>
            </div>
            <span class="coach-squad-status-pill ${statusClass}">${statusLabel}</span>
          </div>
          <div class="coach-squad-card-hdr">
            <span class="coach-lift-badge ${liftBadgeClass}">${ath.currentLift.toUpperCase()}</span>
            <span class="coach-stat-label font-mono">${(ath.currentLoadKg || 180).toFixed(1)} kg</span>
          </div>
          <div class="coach-squad-card-metrics">
            <div>
              <span class="coach-metric-label">MCV</span>
              <div class="coach-squad-mcv">${(ath.currentMcv || 0.45).toFixed(2)} m/s</div>
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
            <button type="button" class="coach-squad-action-btn focus-btn" data-action="focus" data-athlete-id="${ath.id}" aria-label="Focus ${ath.name}">Focus</button>
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
    let compSq = ath.compPrs ? ath.compPrs.squat : 215.0;
    let compBp = ath.compPrs ? ath.compPrs.bench : 142.5;
    let compDl = ath.compPrs ? ath.compPrs.deadlift : 245.0;

    let gymSq = ath.gymPrs ? ath.gymPrs.squat : 222.5;
    let gymBp = ath.gymPrs ? ath.gymPrs.bench : 147.5;
    let gymDl = ath.gymPrs ? ath.gymPrs.deadlift : 257.5;

    // Sync with vbt_pr_data_v1 if stored for primary athlete
    if (ath.id === 'ath_01') {
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

    const athleteWorkouts = getAthleteWorkouts(ath.id);
    const allSets = athleteWorkouts.flatMap(w => Array.isArray(w.sets) ? w.sets : []);

    const defaultE1rmSq = ath.e1rmPrs ? ath.e1rmPrs.squat : +(gymSq * 1.015).toFixed(1);
    const defaultE1rmBp = ath.e1rmPrs ? ath.e1rmPrs.bench : +(gymBp * 1.015).toFixed(1);
    const defaultE1rmDl = ath.e1rmPrs ? ath.e1rmPrs.deadlift : +(gymDl * 1.015).toFixed(1);

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
      elements.compTotalVal.textContent = `${totals.compTotal.toFixed(1)} kg`;
    }
    if (elements.compBreakdown) {
      elements.compBreakdown.textContent = `SQ: ${totals.compSq.toFixed(1)} | BP: ${totals.compBp.toFixed(1)} | DL: ${totals.compDl.toFixed(1)} kg`;
    }
    if (elements.compMeta) {
      elements.compMeta.textContent = `IPF Verified Meet • DOTS: ${dots.toFixed(1)}`;
    }
    if (elements.editCompSq) elements.editCompSq.value = totals.compSq.toFixed(1);
    if (elements.editCompBp) elements.editCompBp.value = totals.compBp.toFixed(1);
    if (elements.editCompDl) elements.editCompDl.value = totals.compDl.toFixed(1);

    if (elements.gymTotalVal) {
      elements.gymTotalVal.textContent = `${totals.activeGymTotal.toFixed(1)} kg`;
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
    const sign = deltaKg >= 0 ? '+' : '';

    if (elements.diffVal) {
      elements.diffVal.textContent = `${sign}${deltaKg.toFixed(1)} kg (${sign}${pctGap.toFixed(1)}%)`;
    }
    if (elements.diffBadge && elements.diffDirective) {
      if (pctGap > 8.0) {
        elements.diffBadge.textContent = 'TECHNICAL LEAK';
        elements.diffDirective.textContent = 'Gym total exceeds meet total by >8%. Enforce competition pause gating with Eros.';
      } else if (pctGap >= 2.0) {
        elements.diffBadge.textContent = 'OPTIMAL TRANSFER';
        elements.diffDirective.textContent = 'Standard gym-to-meet transfer (+2% to +6%). Athlete is competition-ready.';
      } else if (pctGap >= -2.0) {
        elements.diffBadge.textContent = 'COMPETITION PEAKER';
        elements.diffDirective.textContent = 'High meet conversion ratio. Prescribe assertive 3rd attempts.';
      } else {
        elements.diffBadge.textContent = 'FATIGUE ACCUMULATION';
        elements.diffDirective.textContent = 'Gym capacity below competition baseline. Cap velocity loss at 10% for recovery.';
      }
    }
  }

  function computeWeeklyAdherence(workoutsList, refDate) {
    const allWorkouts = Array.isArray(workoutsList) ? workoutsList : getAthleteWorkouts(currentAthlete.id);
    const currentNow = (refDate instanceof Date && !isNaN(refDate.getTime())) ? refDate : new Date();
    const monday = getMondayOfIsoWeek(currentNow);
    const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
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
      elements.weeklyRatioBadge.textContent = `${adherence.completedDaysCount}/7 DAYS`;
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
          <span>${seg.isDone ? 'DONE' : '-'}</span>
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
      'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
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
        <div class="coach-cal-day-cell outside-month" role="gridcell" aria-disabled="true">
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
             role="gridcell"
             tabindex="0"
             aria-selected="${isSelected ? 'true' : 'false'}"
             aria-label="${ariaDesc}">
          <span class="coach-cal-day-num">${day}</span>
          ${hasWorkout ? `
            <span class="coach-cal-workout-tag ${tagClass}">${primaryWorkout.name}</span>
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
          <td colspan="10" class="coach-empty-cell">No workouts logged with Eros on ${dateStr}. Select a highlighted calendar day to inspect telemetry.</td>
        </tr>
      `;
      return;
    }

    const session = dayWorkouts[0];
    if (elements.inspectorTitle) {
      elements.inspectorTitle.textContent = session.name;
    }
    if (elements.inspectorMeta) {
      elements.inspectorMeta.textContent = `${Math.round(session.totalVolumeKg).toLocaleString()} kg Volume • ${session.totalSets} Sets with Eros • Avg ${(session.avgVelocity || 0.45).toFixed(2)} m/s`;
    }

    const setsArr = Array.isArray(session.sets) ? session.sets : [];
    elements.inspectorSetsTbody.innerHTML = setsArr.map((s, idx) => {
      const zone = classifyBryanMannZone(s.avgVelocity, s.lift);
      const liftBadgeClass = /squat/i.test(s.lift)
        ? 'lift-squat'
        : (/bench/i.test(s.lift) ? 'lift-bench' : 'lift-deadlift');
      const isCutoff = (s.velocityLossPct || 0) >= 20.0;

      return `
        <tr>
          <td class="font-mono">Set ${s.setNumber || (idx + 1)}</td>
          <td><span class="coach-lift-badge ${liftBadgeClass}">${s.lift.toUpperCase()}</span></td>
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
      <div class="coach-prev-workout-item" data-workout-date="${w.date}" role="button" tabindex="0" aria-label="Inspect workout ${w.name} on ${w.date}">
        <div class="coach-prev-workout-left">
          <span class="coach-inspector-date font-mono">${w.date}</span>
          <span class="coach-prev-workout-name">${w.name}</span>
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
      elements.activeLiftBadge.textContent = canonicalLift.toUpperCase();
      elements.activeLiftBadge.className = 'coach-lift-badge ' + (
        /squat/i.test(lift) ? 'lift-squat' : (/bench/i.test(lift) ? 'lift-bench' : 'lift-deadlift')
      );
    }

    if (elements.activeSetTitle) {
      elements.activeSetTitle.textContent = `${lift.toUpperCase()} — SET ${setNum}`;
    }
    if (elements.activeSetMeta) {
      elements.activeSetMeta.textContent = `${weight.toFixed(1)} kg | In Progress`;
    }
    if (elements.sessionStatusText) {
      elements.sessionStatusText.textContent = 'SET IN PROGRESS';
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

    const repKey = `${payload.setId || ''}_${repNum}_${vel.toFixed(2)}`;
    if (repKey === lastProcessedRepKey) return;
    lastProcessedRepKey = repKey;

    activeRepsStream.push({
      repNumber: repNum,
      velocity: vel,
      peakVelocity: peakVel,
      rom: rom,
      lossPercent: vl
    });

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
  }

  function handleSetCompleted(payload) {
    if (payload && payload.setId && payload.setId === lastCompletedSetId) return;
    lastCompletedSetId = (payload && payload.setId) ? payload.setId : '';

    if (!elements.viewCoach) queryElements();

    if (currentAthlete) {
      currentAthlete.status = 'resting';
      currentAthlete.restSeconds = 0;
    }

    if (elements.activeSetTitle) {
      elements.activeSetTitle.textContent = 'NO ACTIVE SET — RESTING';
    }
    if (elements.activeSetMeta) {
      elements.activeSetMeta.textContent = 'Waiting for next set';
    }
    if (elements.sessionStatusText) {
      elements.sessionStatusText.textContent = 'REST INTERVAL';
    }

    renderSetsHistoryTable();
    updateSquadRibbon();
    renderSquadOverview();
    if (activeCoachPanel === 'history') {
      renderAthleteHistoryPanel();
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
    renderAthleteHistoryPanel();
  }

  function updateSquadRibbon() {
    if (!elements.readinessVal) queryElements();
    if (elements.readinessVal) elements.readinessVal.textContent = currentAthlete.readiness;
    if (elements.volumeVal) elements.volumeVal.textContent = currentAthlete.volume;
    if (elements.e1rmVal) elements.e1rmVal.textContent = currentAthlete.e1rm;

    const safeSet = getSafeActiveSet();
    if (safeSet) {
      if (elements.sessionStatusText) elements.sessionStatusText.textContent = 'ACTIVE SET';
    } else {
      const safeWorkout = getSafeActiveWorkout();
      if (safeWorkout && safeWorkout.sets && safeWorkout.sets.length > 0) {
        if (elements.sessionStatusText) elements.sessionStatusText.textContent = 'REST INTERVAL';
      } else {
        if (elements.sessionStatusText) elements.sessionStatusText.textContent = 'SESSION READY';
      }
    }
  }

  function renderActiveSetFromState() {
    const curSet = getSafeActiveSet();
    const fallbackLift = typeof currentLift !== 'undefined' ? currentLift : (currentAthlete ? currentAthlete.currentLift : 'Deadlift');

    if (!curSet) {
      if (elements.activeLiftBadge) {
        const canonicalLift = formatCanonicalLiftLabel(fallbackLift);
        elements.activeLiftBadge.textContent = canonicalLift.toUpperCase();
        elements.activeLiftBadge.className = 'coach-lift-badge ' + (
          /squat/i.test(fallbackLift) ? 'lift-squat' : (/bench/i.test(fallbackLift) ? 'lift-bench' : 'lift-deadlift')
        );
      }
      if (elements.activeSetTitle) elements.activeSetTitle.textContent = 'NO ACTIVE SET — READY';
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
      elements.activeLiftBadge.textContent = canonicalLift.toUpperCase();
      elements.activeLiftBadge.className = 'coach-lift-badge ' + (
        /squat/i.test(lift) ? 'lift-squat' : (/bench/i.test(lift) ? 'lift-bench' : 'lift-deadlift')
      );
    }
    if (elements.activeSetTitle) {
      elements.activeSetTitle.textContent = `${lift.toUpperCase()} — SET ${curSet.setNumber || 1}`;
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
        lossPercent: r.lossPercent || 0
      }));
      renderRepsStream();
    }
  }

  function renderRepsStream() {
    if (!elements.repsStream) return;
    if (activeRepsStream.length === 0) {
      elements.repsStream.innerHTML = '<span class="coach-empty-stream-msg">No repetitions logged in this set yet.</span>';
      return;
    }

    elements.repsStream.innerHTML = activeRepsStream.map(rep => {
      const isCutoff = rep.lossPercent >= 20.0;
      return `
        <div class="coach-rep-stream-pill ${isCutoff ? 'cutoff-alert' : ''}">
          <span class="rep-num">R${rep.repNumber}:</span>
          <span class="rep-vel">${rep.velocity.toFixed(2)} m/s</span>
          <span class="rep-loss">(${rep.lossPercent > 0 ? '-' : ''}${rep.lossPercent.toFixed(1)}%)</span>
        </div>
      `;
    }).join('');
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
      const restDuration = (typeof set.restSeconds === 'number' && set.restSeconds > 0)
        ? formatRestDuration(set.restSeconds)
        : '-';

      rowsHtml += `
        <tr class="coach-history-row ${isExpanded ? 'expanded' : ''}" data-set-id="${setId}">
          <td class="font-mono">Set ${set.setNumber}</td>
          <td><span class="coach-lift-badge lift-${liftLower}">${lift.toUpperCase()}</span></td>
          <td class="font-mono">${(set.weight || 0).toFixed(1)} kg</td>
          <td class="font-mono">${set.reps ? set.reps.length : 0}</td>
          <td class="font-mono">${(set.avgVelocity || 0).toFixed(2)} m/s</td>
          <td class="font-mono">${(set.maxVelocity || 0).toFixed(2)} m/s</td>
          <td class="font-mono ${isCutoff ? 'text-danger' : ''}">${(set.velocityLossPct || 0).toFixed(1)}%</td>
          <td class="font-mono">${restDuration}</td>
          <td class="font-mono">@${(set.avgRpe || 8.0).toFixed(1)}</td>
          <td>
            <button type="button" class="coach-expand-btn" data-toggle-id="${setId}" aria-label="Toggle details for set ${set.setNumber}">
              ${isExpanded ? 'Hide Reps' : 'View Reps'}
            </button>
          </td>
        </tr>
      `;

      if (isExpanded && set.reps && set.reps.length > 0) {
        rowsHtml += `
          <tr class="coach-expanded-drawer-row" id="drawer-${setId}">
            <td colspan="10">
              <div class="coach-rep-drawer-inner">
                <table class="coach-rep-subtable">
                  <thead>
                    <tr>
                      <th>REP #</th>
                      <th>MEAN VELOCITY</th>
                      <th>PEAK VELOCITY</th>
                      <th>EST. RPE</th>
                      <th>REPETITION STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${set.reps.map(r => `
                      <tr>
                        <td>Rep ${r.repNumber}</td>
                        <td class="text-cyan">${(r.velocity || 0).toFixed(2)} m/s</td>
                        <td>${(r.peakVelocity || (r.velocity ? r.velocity * 1.25 : 0)).toFixed(2)} m/s</td>
                        <td>@${(r.rpe || 8.0).toFixed(1)}</td>
                        <td>${r.isPR ? '<span class="text-success">Gym PR</span>' : 'Completed'}</td>
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
  }

  function handleCustomCueSubmit() {
    if (!elements.customCueInput) return;
    const text = elements.customCueInput.value.trim();
    if (!text) return;
    sendCoachPrescription(text, 0, getSafeWorkingWeight());
    elements.customCueInput.value = '';
  }

  function sendCoachPrescription(cueText, deltaKg, targetWeight, targetAthleteId) {
    const activeSetRef = getSafeActiveSet();
    const nextSetNumber = activeSetRef ? (activeSetRef.setNumber + 1) : 1;
    const targetId = targetAthleteId || (currentAthlete ? currentAthlete.id : 'ath_01');

    const payload = {
      id: `cmd_cue_${Date.now()}`,
      coachName: 'Coach Marcus',
      athleteId: targetId,
      setNumber: nextSetNumber,
      text: cueText,
      deltaKg: deltaKg,
      newWeight: targetWeight,
      type: deltaKg !== 0 ? 'load_override' : 'technical',
      autoAcceptSeconds: 20,
      timestamp: Date.now()
    };

    // 1. Dispatch via ErosSyncBus if present
    if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
      window.ErosSyncBus.emit('coach:cue', payload);
      if (deltaKg !== 0) {
        window.ErosSyncBus.emit('coach:load_override', payload);
      }
    }

    // 2. Dispatch via DOM CustomEvent for intra-page listeners
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('eros:coach_cue', { detail: payload }));
      if (deltaKg !== 0) {
        window.dispatchEvent(new CustomEvent('eros:coach_load_override', { detail: payload }));
      }
    }

    if (typeof SoundFX !== 'undefined' && typeof SoundFX.playCoachActionSend === 'function') {
      try { SoundFX.playCoachActionSend(); } catch (_) {}
    }

    // 3. Local state synchronization with athlete working load (only for local primary athlete ath_01)
    if (targetId === 'ath_01' && deltaKg !== 0 && typeof targetWeight === 'number') {
      const liveWeightInput = document.getElementById('live-set-weight-input');
      const workoutWeightInput = document.getElementById('workout-set-weight-input');
      if (liveWeightInput) liveWeightInput.value = targetWeight.toFixed(1);
      if (workoutWeightInput) workoutWeightInput.value = targetWeight.toFixed(1);
      if (typeof currentWorkingWeight !== 'undefined') {
        try { currentWorkingWeight = targetWeight; } catch (_) {}
      }
    }

    const sign = deltaKg > 0 ? '+' : '';
    const summary = deltaKg !== 0
      ? `Dispatched: "${cueText}" [${sign}${deltaKg} kg]`
      : `Dispatched technical cue: "${cueText}"`;

    showFeedbackMessage(summary);
  }

  function hookAppLifecycle() {
    if (typeof window === 'undefined') return;

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

  // Public Interface
  return {
    init,
    switchMode,
    switchCoachPanel,
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
    getIsCoachMode: () => isCoachMode,
    getActiveCoachPanel: () => activeCoachPanel,
    getSquadAthletes: () => SQUAD_ATHLETES,
    getCurrentAthlete: () => currentAthlete,
    getPendingBondRequests: () => pendingBondRequests
  };
});
