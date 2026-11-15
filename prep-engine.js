/**
 * Eros Preparation & Velocity Prescription Engine.
 * Provides an exercise catalog, RPE-to-velocity kinematics, athlete preparation factoring,
 * macro block generators, planned-vs-actual comparison, and an offline-first store.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    const api = factory(root);
    root.ErosPrepEngine = api.ErosPrepEngine;
    root.ErosPrepStore = api.ErosPrepStore;
  }
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';

  /** Storage key for preparation plans. */
  const STORAGE_PLANS_KEY = 'eros_prep_plans_v1';

  /** Storage key for scheduled planned workouts. */
  const STORAGE_WORKOUTS_KEY = 'eros_planned_workouts_v1';

  /** Storage key for athlete biometrics and experience dossiers. */
  const STORAGE_BIOMETRICS_KEY = 'eros_athlete_biometrics_v1';

  /** Storage key for athlete-confirmed personal record pushes. */
  const STORAGE_PUSHED_PRS_KEY = 'eros_pushed_prs_v1';

  /** Storage key for coach-registered custom exercises. */
  const STORAGE_CUSTOM_EXERCISES_KEY = 'eros_custom_exercises_v1';

  /** Upper bound for the preparation horizon in months. */
  const MAX_PLAN_MONTHS = 12;

  /** Upper bound for the preparation week index. */
  const MAX_PLAN_WEEKS = 52;

  /** Canonical weekday labels in Monday-first order. */
  const WEEKDAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

  /** Biomechanical reference velocities per primary lift family. */
  const LIFT_KINEMATICS = Object.freeze({
    Squat: Object.freeze({ mvt: 0.22, rpe8: 0.42, slope: 1.45 }),
    Bench: Object.freeze({ mvt: 0.16, rpe8: 0.32, slope: 1.15 }),
    Deadlift: Object.freeze({ mvt: 0.15, rpe8: 0.35, slope: 1.25 }),
    Accessory: Object.freeze({ mvt: 0.28, rpe8: 0.50, slope: 1.50 })
  });

  /** Built-in catalog of 84 powerlifting, strength, and bodybuilding exercises. */
  const EXERCISE_CATALOG = Object.freeze([
    // Competition Lifts
    { id: 'comp_squat', name: 'Competition Squat', baseLift: 'Squat', category: 'Competition', isCustom: false },
    { id: 'comp_bench', name: 'Competition Bench Press', baseLift: 'Bench', category: 'Competition', isCustom: false },
    { id: 'comp_deadlift', name: 'Competition Deadlift', baseLift: 'Deadlift', category: 'Competition', isCustom: false },
    { id: 'sumo_deadlift', name: 'Sumo Deadlift', baseLift: 'Deadlift', category: 'Competition', isCustom: false },
    { id: 'conv_deadlift', name: 'Conventional Deadlift', baseLift: 'Deadlift', category: 'Competition', isCustom: false },

    // Squat Variations
    { id: 'high_bar_squat', name: 'High-Bar Back Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'low_bar_squat', name: 'Low-Bar Back Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'pause_squat', name: '2-Count Pause Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'tempo_squat_310', name: 'Tempo Squat (3-1-0)', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'pin_squat', name: 'Pin Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'box_squat', name: 'Box Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'ssb_squat', name: 'Safety Bar Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'front_squat', name: 'Front Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'belt_squat', name: 'Belt Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'zercher_squat', name: 'Zercher Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'anderson_squat', name: 'Anderson Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'chains_squat', name: 'Accommodating Chain Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'banded_squat', name: 'Banded Back Squat', baseLift: 'Squat', category: 'Variation', isCustom: false },
    { id: 'goblet_squat', name: 'Goblet Squat', baseLift: 'Squat', category: 'Accessory', isCustom: false },
    { id: 'hack_squat', name: 'Hack Squat', baseLift: 'Squat', category: 'Accessory', isCustom: false },
    { id: 'pendulum_squat', name: 'Pendulum Squat', baseLift: 'Squat', category: 'Accessory', isCustom: false },
    { id: 'leg_press', name: '45-Degree Leg Press', baseLift: 'Squat', category: 'Accessory', isCustom: false },
    { id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', baseLift: 'Squat', category: 'Accessory', isCustom: false },

    // Bench Variations
    { id: 'pause_bench', name: '2-Count Pause Bench Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'tng_bench', name: 'Touch-and-Go Bench Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'spoto_press', name: 'Spoto Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'larsen_press', name: 'Larsen Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'close_grip_bench', name: 'Close-Grip Bench Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'wide_grip_bench', name: 'Wide-Grip Bench Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'pin_bench', name: 'Pin Bench Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'tempo_bench_310', name: 'Tempo Bench Press (3-1-0)', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'board_press_2', name: '2-Board Bench Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'board_press_3', name: '3-Board Bench Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'floor_press', name: 'Barbell Floor Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'feet_up_bench', name: 'Feet-Up Bench Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'incline_bb_bench', name: 'Incline Barbell Bench Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'decline_bb_bench', name: 'Decline Barbell Bench Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'chains_bench', name: 'Accommodating Chain Bench', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'db_flat_press', name: 'Dumbbell Flat Bench Press', baseLift: 'Bench', category: 'Accessory', isCustom: false },
    { id: 'db_incline_press', name: 'Dumbbell Incline Press', baseLift: 'Bench', category: 'Accessory', isCustom: false },
    { id: 'overhead_press', name: 'Standing Barbell Overhead Press', baseLift: 'Bench', category: 'Variation', isCustom: false },
    { id: 'seated_db_press', name: 'Seated Dumbbell Shoulder Press', baseLift: 'Bench', category: 'Accessory', isCustom: false },
    { id: 'weighted_dip', name: 'Weighted Parallel Bar Dip', baseLift: 'Bench', category: 'Accessory', isCustom: false },

    // Deadlift Variations
    { id: 'pause_deadlift', name: 'Pause Deadlift (Knee Height)', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'deficit_deadlift', name: 'Deficit Deadlift (2-Inch)', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'block_pull_2in', name: '2-Inch Block Pull', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'block_pull_4in', name: '4-Inch Block Pull', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'rack_pull', name: 'Rack Pull (Below Knee)', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'romanian_deadlift', name: 'Romanian Deadlift (RDL)', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'stiff_leg_deadlift', name: 'Stiff-Legged Deadlift', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'snatch_grip_dl', name: 'Snatch-Grip Deadlift', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'tempo_deadlift', name: 'Tempo Deadlift (3-1-0)', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'trap_bar_dl', name: 'Trap Bar Deadlift', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'chains_deadlift', name: 'Accommodating Chain Deadlift', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'good_morning', name: 'Barbell Good Morning', baseLift: 'Deadlift', category: 'Variation', isCustom: false },
    { id: 'barbell_hip_thrust', name: 'Barbell Hip Thrust', baseLift: 'Deadlift', category: 'Accessory', isCustom: false },

    // Back & Pulling Accessories
    { id: 'barbell_row', name: 'Bent-Over Barbell Row', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'pendlay_row', name: 'Pendlay Row', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'chest_supported_row', name: 'Chest-Supported T-Bar Row', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'seated_cable_row', name: 'Seated Cable Row', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'single_arm_db_row', name: 'Single-Arm Dumbbell Row', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'lat_pulldown', name: 'Wide-Grip Lat Pulldown', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'neutral_pulldown', name: 'Neutral-Grip Lat Pulldown', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'weighted_pullup', name: 'Weighted Pull-Up', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'chin_up', name: 'Chin-Up', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'face_pull', name: 'Cable Face Pull', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'rear_delt_fly', name: 'Machine Rear Delt Fly', baseLift: 'Accessory', category: 'Accessory', isCustom: false },

    // Lower Body Accessories
    { id: 'leg_extension', name: 'Seated Leg Extension', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'seated_leg_curl', name: 'Seated Hamstring Curl', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'lying_leg_curl', name: 'Lying Hamstring Curl', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'walking_lunge', name: 'Dumbbell Walking Lunge', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'back_extension', name: '45-Degree Back Extension', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'reverse_hyper', name: 'Reverse Hyperextension', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'standing_calf_raise', name: 'Standing Calf Raise', baseLift: 'Accessory', category: 'Accessory', isCustom: false },

    // Upper Body & Arm Accessories
    { id: 'cable_chest_fly', name: 'Cable Chest Fly', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'pec_deck_fly', name: 'Pec Deck Fly', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'db_lateral_raise', name: 'Dumbbell Lateral Raise', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'cable_lateral_raise', name: 'Cable Lateral Raise', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'barbell_curl', name: 'Standing Barbell Curl', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'hammer_curl', name: 'Dumbbell Hammer Curl', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'preacher_curl', name: 'EZ-Bar Preacher Curl', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'triceps_pushdown', name: 'Rope Triceps Pushdown', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'ez_skullcrusher', name: 'EZ-Bar Skullcrusher', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'overhead_triceps_ext', name: 'Overhead Cable Triceps Extension', baseLift: 'Accessory', category: 'Accessory', isCustom: false },

    // Trunk & Stability Accessories
    { id: 'hanging_leg_raise', name: 'Hanging Leg Raise', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'ab_wheel_rollout', name: 'Ab Wheel Rollout', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'pallof_press', name: 'Cable Pallof Press', baseLift: 'Accessory', category: 'Accessory', isCustom: false },
    { id: 'weighted_plank', name: 'Weighted Plank Hold', baseLift: 'Accessory', category: 'Accessory', isCustom: false }
  ]);

  /** Built-in multi-week preparation block templates. */
  const TEMPLATE_CATALOG = Object.freeze([
    {
      key: 'peaking_8w',
      label: '8-Week Meet Peak',
      goalType: 'Meet Peak',
      defaultMonths: 2,
      deloadCadenceWeeks: 4,
      phases: [
        { phase: 'Volume Accumulation', weeks: 3 },
        { phase: 'Intensity Build', weeks: 3 },
        { phase: 'Taper & Peak', weeks: 2 }
      ]
    },
    {
      key: 'strength_12w',
      label: '12-Week Strength & Peaking',
      goalType: 'Strength Peak',
      defaultMonths: 3,
      deloadCadenceWeeks: 4,
      phases: [
        { phase: 'Hypertrophy Base', weeks: 4 },
        { phase: 'Strength Accumulation', weeks: 4 },
        { phase: 'Realization & Peak', weeks: 4 }
      ]
    },
    {
      key: 'hypertrophy_6w',
      label: '6-Week Offseason Hypertrophy',
      goalType: 'Hypertrophy',
      defaultMonths: 1.5,
      deloadCadenceWeeks: 6,
      phases: [
        { phase: 'Hypertrophy Volume', weeks: 5 },
        { phase: 'Active Deload', weeks: 1 }
      ]
    },
    {
      key: 'deload_1w',
      label: '1-Week Active Deload',
      goalType: 'Deload',
      defaultMonths: 0.25,
      deloadCadenceWeeks: 1,
      phases: [
        { phase: 'Deload', weeks: 1 }
      ]
    }
  ]);

  /** In-memory registry of custom exercises keyed by exercise ID. */
  const customExercisesMap = new Map();

  // ── Shared Utility Helpers ──

  /** Rounds a numeric value to the requested decimal places. */
  function roundDec(val, places) {
    const factor = Math.pow(10, places);
    return Math.round(val * factor) / factor;
  }

  /** Rounds a weight in kilograms to the nearest 2.5 kg plate increment. */
  function roundPlateKg(kg) {
    if (!isFinite(kg) || kg <= 0) return 0;
    return Math.round(kg / 2.5) * 2.5;
  }

  /** Clamps a finite numeric value into [min, max], returning fallback otherwise. */
  function clampFinite(val, min, max, fallback) {
    if (val == null || val === '') return fallback;
    const num = Number(val);
    if (!isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  }

  /** Creates a deep clone of a JSON-serializable object. */
  function deepClone(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj));
  }

  /** Normalizes a lift string to Squat, Bench, Deadlift, or Accessory. */
  function normalizeBaseLift(lift) {
    const raw = String(lift || '').trim().toLowerCase();
    if (raw.includes('squat')) return 'Squat';
    if (raw.includes('bench') || raw.includes('press') || raw.includes('dip')) return 'Bench';
    if (raw.includes('dead') || raw.includes('pull') || raw.includes('rdl') || raw.includes('morning')) return 'Deadlift';
    return 'Accessory';
  }

  /** Parses an ISO YYYY-MM-DD string to UTC midnight epoch milliseconds. */
  function parseIsoDateUtcMs(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return NaN;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
    if (!match) return NaN;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return NaN;
    const ms = Date.UTC(year, month - 1, day);
    const check = new Date(ms);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
      return NaN;
    }
    return ms;
  }

  /** Formats UTC epoch milliseconds as an ISO YYYY-MM-DD string. */
  function formatIsoDateUtc(ms) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Adds calendar days to an ISO YYYY-MM-DD date string. */
  function addDaysIso(dateStr, deltaDays) {
    const baseMs = parseIsoDateUtcMs(dateStr);
    const startMs = isNaN(baseMs) ? Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) : baseMs;
    return formatIsoDateUtc(startMs + Math.round(deltaDays) * 86400000);
  }

  /** Returns the Monday-first weekday name for an ISO date string. */
  function weekdayOfIso(dateStr) {
    const ms = parseIsoDateUtcMs(dateStr);
    if (isNaN(ms)) return 'Mon';
    const utcDay = new Date(ms).getUTCDay();
    return WEEKDAYS[(utcDay + 6) % 7];
  }

  /** Reads a JSON value from localStorage safely without throwing. */
  function readStorageJson(key, fallback) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return deepClone(fallback);
      const raw = localStorage.getItem(key);
      if (!raw) return deepClone(fallback);
      const parsed = JSON.parse(raw);
      return parsed == null ? deepClone(fallback) : parsed;
    } catch (_) {
      return deepClone(fallback);
    }
  }

  /** Writes a JSON value to localStorage safely without throwing. */
  function writeStorageJson(key, value) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem(key, JSON.stringify(value));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Hydrates the custom exercise map from persistent storage once. */
  function syncCustomExercisesFromStorage() {
    const saved = readStorageJson(STORAGE_CUSTOM_EXERCISES_KEY, []);
    if (Array.isArray(saved)) {
      for (const item of saved) {
        if (item && item.id && item.name && !customExercisesMap.has(item.id)) {
          customExercisesMap.set(item.id, item);
        }
      }
    }
  }

  // ── Exercise Catalog API ──

  /** Returns the combined built-in and coach-registered exercise catalog. */
  function getAllExercises() {
    syncCustomExercisesFromStorage();
    return EXERCISE_CATALOG.concat(Array.from(customExercisesMap.values()));
  }

  /** Finds an exercise by its identifier across built-in and custom catalogs. */
  function getExerciseById(id) {
    if (!id) return null;
    const key = String(id).trim();
    const builtIn = EXERCISE_CATALOG.find(function (ex) { return ex.id === key; });
    if (builtIn) return builtIn;
    syncCustomExercisesFromStorage();
    return customExercisesMap.get(key) || null;
  }

  /** Searches exercises by substring query and optional primary lift filter. */
  function searchExercises(query, filterBaseLift) {
    const q = String(query || '').trim().toLowerCase();
    const liftFilter = filterBaseLift ? String(filterBaseLift).trim().toLowerCase() : '';
    return getAllExercises().filter(function (ex) {
      if (liftFilter && liftFilter !== 'all' && ex.baseLift.toLowerCase() !== liftFilter) {
        return false;
      }
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.baseLift.toLowerCase().includes(q) ||
        ex.category.toLowerCase().includes(q) ||
        ex.id.toLowerCase().includes(q)
      );
    });
  }

  /** Registers a custom exercise from either an options object or positional arguments. */
  function registerCustomExercise(arg1, categoryArg, baseLiftArg) {
    const opts = (arg1 && typeof arg1 === 'object')
      ? arg1
      : { name: arg1, category: categoryArg, baseLift: baseLiftArg };
    const name = String(opts.name || '').trim();
    if (!name) {
      throw new TypeError('[ErosPrepEngine] Custom exercise requires a non-empty name');
    }
    const baseLift = normalizeBaseLift(opts.baseLift || opts.category || name);
    const category = String(opts.category || 'Custom').trim() || 'Custom';
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'exercise';
    const id = String(opts.id || `custom_${slug}`).trim();
    const entry = {
      id: id,
      name: name,
      baseLift: baseLift,
      category: category,
      isCustom: true
    };
    customExercisesMap.set(id, entry);
    writeStorageJson(STORAGE_CUSTOM_EXERCISES_KEY, Array.from(customExercisesMap.values()));
    return entry;
  }

  // ── Velocity & RPE Prescription Engine ──

  /** Resolves a numeric 1RM for the requested base lift from an athlete map. */
  function resolveOneRm(oneRmInput, baseLift) {
    if (typeof oneRmInput === 'number') {
      return clampFinite(oneRmInput, 0, 700, 0);
    }
    if (!oneRmInput || typeof oneRmInput !== 'object') return 0;
    const key = normalizeBaseLift(baseLift).toLowerCase();
    if (key === 'squat') {
      return clampFinite(oneRmInput.squat != null ? oneRmInput.squat : (oneRmInput.Squat != null ? oneRmInput.Squat : oneRmInput.e1rmSquatKg), 0, 700, 0);
    }
    if (key === 'bench') {
      return clampFinite(oneRmInput.bench != null ? oneRmInput.bench : (oneRmInput.Bench != null ? oneRmInput.Bench : oneRmInput.e1rmBenchKg), 0, 700, 0);
    }
    if (key === 'deadlift') {
      return clampFinite(oneRmInput.deadlift != null ? oneRmInput.deadlift : (oneRmInput.Deadlift != null ? oneRmInput.Deadlift : oneRmInput.e1rmDeadliftKg), 0, 700, 0);
    }
    return clampFinite(oneRmInput.accessory || oneRmInput.Accessory, 0, 700, 0);
  }

  /** Converts a repetition count and RPE target into an estimated 1RM fraction. */
  function estimateFractionFromRepsAndRpe(reps, rpe) {
    const cleanReps = clampFinite(reps, 1, 50, 5);
    const cleanRpe = clampFinite(rpe, 5, 10, 8);
    const rir = Math.max(0, 10 - cleanRpe);
    const effectiveReps = cleanReps + rir;
    if (effectiveReps <= 1) return 1.0;
    return clampFinite(1.0 / (1 + (effectiveReps - 1) * 0.0333), 0.42, 1.0, 0.8);
  }

  /** Selects an appropriate velocity loss cap percentage from reps, RPE, and set role. */
  function deriveVelocityLossCap(reps, rpe, isBackoff) {
    const cleanReps = clampFinite(reps, 1, 50, 5);
    const cleanRpe = clampFinite(rpe, 5, 10, 8);
    let cap;
    if (cleanReps <= 3) {
      cap = cleanRpe >= 9 ? 10 : (cleanRpe >= 8 ? 15 : 20);
    } else if (cleanReps <= 6) {
      cap = cleanRpe >= 9 ? 15 : (cleanRpe >= 8 ? 20 : 25);
    } else {
      cap = isBackoff ? 25 : 30;
    }
    if (isBackoff && cleanRpe <= 7.5) {
      cap = Math.min(cap, 20);
    }
    return clampFinite(cap, 5, 50, 20);
  }

  /** Computes target velocity, velocity band, velocity loss cap, and load from RPE. */
  function computePrescribedKinematics(input) {
    const cfg = input && typeof input === 'object' ? input : {};
    const catalogHit = cfg.exerciseId ? getExerciseById(cfg.exerciseId) : null;
    const baseLift = normalizeBaseLift(cfg.baseLift || (catalogHit ? catalogHit.baseLift : 'Squat'));
    const ref = LIFT_KINEMATICS[baseLift] || LIFT_KINEMATICS.Squat;

    const reps = Math.round(clampFinite(cfg.reps, 1, 50, 5));
    const targetRpe = roundDec(clampFinite(cfg.targetRpe != null ? cfg.targetRpe : cfg.rpe, 5, 10, 8), 1);
    const isBackoff = Boolean(cfg.isBackoff);
    const oneRmKg = resolveOneRm(cfg.oneRmKg, baseLift);

    let fraction = estimateFractionFromRepsAndRpe(reps, targetRpe);
    if (cfg.loadPercent1Rm != null && Number(cfg.loadPercent1Rm) > 0) {
      fraction = clampFinite(Number(cfg.loadPercent1Rm) / 100, 0.3, 1.05, fraction);
    }

    let suggestedLoadKg = 0;
    const explicitLoad = clampFinite(cfg.loadKg, 0, 600, 0);
    const topLoad = clampFinite(cfg.topSetLoadKg, 0, 600, 0);
    const dropPct = clampFinite(cfg.dropPct, 0, 60, 0);

    if (explicitLoad > 0) {
      suggestedLoadKg = roundDec(explicitLoad, 1);
      if (oneRmKg > 0) {
        fraction = clampFinite(suggestedLoadKg / oneRmKg, 0.3, 1.05, fraction);
      }
    } else if (isBackoff && topLoad > 0) {
      if (dropPct > 0) {
        suggestedLoadKg = roundPlateKg(topLoad * (1 - dropPct / 100));
      } else {
        const topFraction = estimateFractionFromRepsAndRpe(
          clampFinite(cfg.topSetReps, 1, 50, reps),
          clampFinite(cfg.topSetRpe, 5, 10, 8.5)
        );
        suggestedLoadKg = roundPlateKg(topLoad * (fraction / Math.max(0.4, topFraction)));
      }
    } else if (oneRmKg > 0) {
      suggestedLoadKg = roundPlateKg(oneRmKg * fraction);
    }

    const rawVel = ref.mvt + Math.max(0, 1.0 - fraction) * ref.slope;
    const targetVelocity = roundDec(clampFinite(rawVel, ref.mvt, 1.3, ref.rpe8), 2);
    const minVel = roundDec(Math.max(ref.mvt, targetVelocity - 0.05), 2);
    const maxVel = roundDec(targetVelocity + 0.05, 2);
    const velocityLossCapPct = deriveVelocityLossCap(reps, targetRpe, isBackoff);

    return {
      exerciseId: cfg.exerciseId || (catalogHit ? catalogHit.id : ''),
      baseLift: baseLift,
      reps: reps,
      targetRpe: targetRpe,
      rpe: targetRpe,
      percent1Rm: roundDec(fraction * 100, 1),
      suggestedLoadKg: suggestedLoadKg,
      loadKg: suggestedLoadKg,
      targetVelocity: targetVelocity,
      velocityRange: [minVel, maxVel],
      velocityLossCapPct: velocityLossCapPct
    };
  }

  /** Prescribes a full exercise slot including Top Set and optional Backoff blocks. */
  function prescribeSlotWithTopAndBackoff(slotInput, athlete1Rms) {
    const src = slotInput && typeof slotInput === 'object' ? slotInput : {};
    const catalogHit = src.exerciseId ? getExerciseById(src.exerciseId) : null;
    const baseLift = normalizeBaseLift(src.baseLift || (catalogHit ? catalogHit.baseLift : src.exerciseName || 'Squat'));
    const oneRmKg = resolveOneRm(athlete1Rms, baseLift);

    const topRaw = src.topSet || src.top || {};
    const topSetsCount = Math.round(clampFinite(topRaw.sets, 1, 20, 1));
    const topKin = computePrescribedKinematics({
      exerciseId: src.exerciseId || (catalogHit ? catalogHit.id : ''),
      baseLift: baseLift,
      reps: topRaw.reps != null ? topRaw.reps : 5,
      targetRpe: topRaw.rpe != null ? topRaw.rpe : (topRaw.targetRpe != null ? topRaw.targetRpe : 8),
      oneRmKg: oneRmKg,
      loadKg: topRaw.loadKg,
      loadPercent1Rm: topRaw.loadPercent1Rm,
      isBackoff: false
    });

    const topSet = {
      sets: topSetsCount,
      reps: topKin.reps,
      rpe: topKin.targetRpe,
      targetRpe: topKin.targetRpe,
      loadKg: topKin.suggestedLoadKg,
      suggestedLoadKg: topKin.suggestedLoadKg,
      percent1Rm: topKin.percent1Rm,
      targetVelocity: topKin.targetVelocity,
      velocityRange: topKin.velocityRange,
      velocityLossCapPct: topKin.velocityLossCapPct
    };

    const backRaw = src.backoff || src.backoffSets || null;
    let backoff = null;
    if (backRaw && typeof backRaw === 'object' && Number(backRaw.sets != null ? backRaw.sets : 1) > 0) {
      const dropPct = clampFinite(backRaw.dropPct, 0, 60, 0);
      const backKin = computePrescribedKinematics({
        exerciseId: src.exerciseId || (catalogHit ? catalogHit.id : ''),
        baseLift: baseLift,
        reps: backRaw.reps != null ? backRaw.reps : topSet.reps,
        targetRpe: backRaw.rpe != null ? backRaw.rpe : (backRaw.targetRpe != null ? backRaw.targetRpe : Math.max(5.5, topSet.rpe - 1)),
        oneRmKg: oneRmKg,
        loadKg: backRaw.loadKg,
        loadPercent1Rm: backRaw.loadPercent1Rm,
        isBackoff: true,
        topSetLoadKg: topSet.loadKg,
        topSetRpe: topSet.rpe,
        topSetReps: topSet.reps,
        dropPct: dropPct
      });
      backoff = {
        sets: Math.round(clampFinite(backRaw.sets, 1, 20, 3)),
        reps: backKin.reps,
        rpe: backKin.targetRpe,
        targetRpe: backKin.targetRpe,
        dropPct: dropPct,
        loadKg: backKin.suggestedLoadKg,
        suggestedLoadKg: backKin.suggestedLoadKg,
        percent1Rm: backKin.percent1Rm,
        targetVelocity: backKin.targetVelocity,
        velocityRange: backKin.velocityRange,
        velocityLossCapPct: backKin.velocityLossCapPct
      };
    }

    const slotId = String(src.slotId || `slot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`).trim();
    return {
      slotId: slotId,
      exerciseId: src.exerciseId || (catalogHit ? catalogHit.id : ''),
      exerciseName: String(src.exerciseName || (catalogHit ? catalogHit.name : baseLift)).trim(),
      baseLift: baseLift,
      notes: String(src.notes || '').trim(),
      topSet: topSet,
      backoff: backoff,
      backoffSets: backoff ? deepClone(backoff) : null
    };
  }

  // ── Horizon, Meet Countdown & Athlete Biometric Factoring ──

  /** Clamps a preparation plan horizon to the 0 through 12 month ceiling. */
  function clampPlanHorizonMonths(months) {
    return roundDec(clampFinite(months, 0, MAX_PLAN_MONTHS, 0), 1);
  }

  /** Computes days and weeks remaining until a meet date along with phase guidance. */
  function computeMeetCountdown(targetMeetDateStr, nowDateStr) {
    const meetMs = parseIsoDateUtcMs(targetMeetDateStr);
    if (isNaN(meetMs)) return null;

    let nowMs = parseIsoDateUtcMs(nowDateStr);
    if (isNaN(nowMs)) {
      const now = new Date();
      nowMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    }

    const days = Math.round((meetMs - nowMs) / 86400000);
    const absDays = Math.abs(days);
    const weeks = days >= 0 ? Math.floor(days / 7) : 0;
    const remDays = days >= 0 ? (days % 7) : 0;

    let recommendedPhase = 'Accumulation';
    if (days < 0) recommendedPhase = 'Post-Meet Recovery';
    else if (days <= 14) recommendedPhase = 'Taper & Peak';
    else if (days <= 42) recommendedPhase = 'Peaking';
    else if (days <= 84) recommendedPhase = 'Strength';

    let label;
    if (days < 0) {
      label = `Meet Passed (${absDays}d ago)`;
    } else if (days === 0) {
      label = 'Meet Day';
    } else {
      label = `${weeks}w ${remDays}d (${days}d out)`;
    }

    return {
      days: days,
      daysOut: days,
      weeks: weeks,
      weeksOut: weeks,
      remDays: remDays,
      label: label,
      recommendedPhase: recommendedPhase,
      isPostMeet: days < 0
    };
  }

  /** Parses the numeric weight limit from a weight class label such as 83kg. */
  function parseWeightClassKg(label) {
    if (!label) return NaN;
    const match = /(\d+(?:\.\d+)?)/.exec(String(label));
    return match ? Number(match[1]) : NaN;
  }

  /** Evaluates athlete biometrics, experience, and schedule into coaching factor alerts. */
  function evaluateAthletePrepFactors(biometrics, plan) {
    const bio = biometrics && typeof biometrics === 'object' ? biometrics : {};
    const alerts = [];

    const age = clampFinite(bio.age, 0, 120, 0);
    if (age >= 40) {
      alerts.push({
        level: 'warn',
        code: 'AGE_MASTERS_RECOVERY',
        title: 'Masters Recovery',
        value: `${Math.round(age)}y`,
        message: `Age ${Math.round(age)}: favor 3-4w deload cadence and cap top-set fatigue.`
      });
    } else if (age > 0 && age < 20) {
      alerts.push({
        level: 'info',
        code: 'AGE_JUNIOR_TECHNIQUE',
        title: 'Junior Development',
        value: `${Math.round(age)}y`,
        message: `Age ${Math.round(age)}: prioritize technical consistency and bar path efficiency.`
      });
    }

    const bw = clampFinite(bio.bodyweightKg != null ? bio.bodyweightKg : bio.bodyweight_kg, 0, 300, 0);
    const classKg = parseWeightClassKg(bio.targetWeightClass || bio.target_weight_class || bio.weightClass);
    if (bw > 0 && isFinite(classKg) && classKg > 0) {
      const diff = roundDec(bw - classKg, 1);
      if (diff > 3) {
        alerts.push({
          level: 'crit',
          code: 'BW_CUT_AGGRESSIVE',
          title: 'Weight Cut Alert',
          value: `+${diff} kg`,
          message: `Bodyweight ${bw} kg is +${diff} kg over ${classKg} kg class; plan nutrition deficit early.`
        });
      } else if (diff > 1) {
        alerts.push({
          level: 'warn',
          code: 'BW_CUT_MODERATE',
          title: 'Weight Watch',
          value: `+${diff} kg`,
          message: `Bodyweight ${bw} kg is +${diff} kg above ${classKg} kg class.`
        });
      } else if (diff < -2) {
        alerts.push({
          level: 'info',
          code: 'BW_SURPLUS_HEADROOM',
          title: 'Mass Headroom',
          value: `${diff} kg`,
          message: `Bodyweight ${bw} kg gives ${Math.abs(diff)} kg headroom under ${classKg} kg class.`
        });
      } else {
        alerts.push({
          level: 'info',
          code: 'BW_ON_WEIGHT',
          title: 'On Weight Class',
          value: `${bw} kg`,
          message: `Bodyweight ${bw} kg is within target ${classKg} kg division.`
        });
      }
    }

    const tier = String(bio.experienceTier || bio.experience_tier || '').trim();
    const meets = clampFinite(bio.meetsCompleted != null ? bio.meetsCompleted : bio.meets_completed, 0, 500, 0);
    const trainAge = clampFinite(bio.trainingAgeYears != null ? bio.trainingAgeYears : bio.training_age_years, 0, 60, 0);
    if (tier === 'Novice' || (tier === '' && meets === 0 && trainAge > 0 && trainAge < 1.5)) {
      alerts.push({
        level: 'info',
        code: 'TIER_NOVICE_TECHNIQUE',
        title: 'Novice Pacing',
        value: `${Math.round(meets)} meets`,
        message: 'Novice / early competitor: prescribe conservative openers and clear RPE caps.'
      });
    } else if (tier === 'National' || tier === 'International' || meets >= 5) {
      alerts.push({
        level: 'info',
        code: 'TIER_COMPETITOR_PEAK',
        title: tier || 'Experienced',
        value: `${Math.round(meets)} meets`,
        message: `${tier || 'Veteran'} lifter (${Math.round(meets)} meets): supports higher specificity and sharper taper.`
      });
    }

    const avail = Array.isArray(bio.availableDays) ? bio.availableDays : [];
    if (avail.length > 0 && avail.length <= 2) {
      alerts.push({
        level: 'warn',
        code: 'SCHEDULE_LOW_FREQ',
        title: 'Limited Days',
        value: `${avail.length}d/wk`,
        message: `Only ${avail.length} training day(s) available (${avail.join(', ')}); consolidate primary lifts.`
      });
    }

    if (plan && Array.isArray(plan.scheduledDays) && avail.length > 0) {
      const mismatch = plan.scheduledDays.filter(function (d) { return !avail.includes(d); });
      if (mismatch.length > 0) {
        alerts.push({
          level: 'warn',
          code: 'SCHEDULE_DAY_MISMATCH',
          title: 'Schedule Conflict',
          value: mismatch.join(', '),
          message: `Planned sessions on ${mismatch.join(', ')} fall outside athlete availability.`
        });
      }
    }

    const notes = String(bio.dutiesInjuryNotes || bio.duties_injury_notes || '').trim();
    if (notes) {
      const highPriority = /(pain|injury|strain|tear|sciatica|impingement|shift|travel|exam|night|surgery)/i.test(notes);
      alerts.push({
        level: highPriority ? 'warn' : 'info',
        code: highPriority ? 'DUTIES_INJURY_FLAG' : 'DUTIES_NOTE_ACTIVE',
        title: highPriority ? 'Injury / Duty Flag' : 'Athlete Note',
        value: 'Active',
        message: `Athlete note: ${notes}`
      });
    }

    if (plan && plan.targetMeetDate) {
      const cd = computeMeetCountdown(plan.targetMeetDate, bio.nowDate);
      if (cd && cd.days >= 0 && cd.days <= 14) {
        alerts.push({
          level: 'warn',
          code: 'MEET_PEAK_WINDOW',
          title: 'Meet Taper Window',
          value: cd.label,
          message: `Meet is ${cd.days} days out: taper fatigue and verify competition openers.`
        });
      }
    }

    return alerts;
  }

  /** Summarizes athlete biometrics into compact badge pills for the Coach strip. */
  function getAthleteFactorBadges(biometrics, plan) {
    const bio = biometrics && typeof biometrics === 'object' ? biometrics : {};
    const badges = [];
    if (bio.age) badges.push({ label: `Age ${Math.round(Number(bio.age))}`, tone: 'neutral' });
    if (bio.bodyweightKg || bio.targetWeightClass) {
      const bwTxt = bio.bodyweightKg ? `${bio.bodyweightKg}kg` : '--';
      const clsTxt = bio.targetWeightClass ? ` -> ${bio.targetWeightClass}` : '';
      badges.push({ label: `${bwTxt}${clsTxt}`, tone: 'neutral' });
    }
    if (bio.experienceTier) {
      const meetsTxt = bio.meetsCompleted != null ? ` (${bio.meetsCompleted} meets)` : '';
      badges.push({ label: `${bio.experienceTier}${meetsTxt}`, tone: 'accent' });
    }
    if (Array.isArray(bio.availableDays) && bio.availableDays.length > 0) {
      badges.push({ label: `${bio.availableDays.length}d/wk`, tone: 'neutral' });
    }
    if (plan && plan.targetMeetDate) {
      const cd = computeMeetCountdown(plan.targetMeetDate);
      if (cd) badges.push({ label: cd.label, tone: cd.days <= 14 && cd.days >= 0 ? 'warn' : 'accent' });
    }
    return badges;
  }

  // ── Macro Block Generators, Deloads & Week Cloning ──

  /** Builds a default split of prescribed slots for a given weekday and phase. */
  function buildDefaultDaySlots(dayName, phaseName, isDeload, oneRms) {
    const rpeShift = isDeload ? -1.5 : (phaseName.includes('Peak') ? 0.5 : 0);
    const setsBackoff = isDeload ? 1 : 3;
    const dropPct = isDeload ? 15 : 10;

    if (dayName === 'Mon' || dayName === 'Wed') {
      return [
        prescribeSlotWithTopAndBackoff({
          exerciseId: 'comp_squat',
          topSet: { sets: 1, reps: phaseName.includes('Peak') ? 2 : 5, rpe: clampFinite(8 + rpeShift, 5.5, 9.5, 8) },
          backoff: { sets: setsBackoff, reps: 5, rpe: clampFinite(7 + rpeShift, 5, 8.5, 7), dropPct: dropPct }
        }, oneRms),
        prescribeSlotWithTopAndBackoff({
          exerciseId: 'comp_bench',
          topSet: { sets: 1, reps: 4, rpe: clampFinite(8 + rpeShift, 5.5, 9.5, 8) },
          backoff: { sets: setsBackoff, reps: 5, rpe: clampFinite(7 + rpeShift, 5, 8.5, 7), dropPct: dropPct }
        }, oneRms)
      ];
    }
    if (dayName === 'Tue' || dayName === 'Thu') {
      return [
        prescribeSlotWithTopAndBackoff({
          exerciseId: 'comp_deadlift',
          topSet: { sets: 1, reps: phaseName.includes('Peak') ? 2 : 4, rpe: clampFinite(8 + rpeShift, 5.5, 9.5, 8) },
          backoff: { sets: setsBackoff, reps: 4, rpe: clampFinite(7 + rpeShift, 5, 8.5, 7), dropPct: dropPct }
        }, oneRms),
        prescribeSlotWithTopAndBackoff({
          exerciseId: 'pause_bench',
          topSet: { sets: 1, reps: 4, rpe: clampFinite(7.5 + rpeShift, 5.5, 9, 7.5) },
          backoff: { sets: setsBackoff, reps: 6, rpe: clampFinite(6.5 + rpeShift, 5, 8, 6.5), dropPct: dropPct }
        }, oneRms)
      ];
    }
    return [
      prescribeSlotWithTopAndBackoff({
        exerciseId: 'pause_squat',
        topSet: { sets: 1, reps: 3, rpe: clampFinite(7.5 + rpeShift, 5.5, 9, 7.5) },
        backoff: { sets: Math.max(1, setsBackoff - 1), reps: 4, rpe: clampFinite(6.5 + rpeShift, 5, 8, 6.5), dropPct: dropPct }
      }, oneRms),
      prescribeSlotWithTopAndBackoff({
        exerciseId: 'chest_supported_row',
        topSet: { sets: 1, reps: 10, rpe: clampFinite(8 + rpeShift, 5.5, 9, 8) },
        backoff: { sets: Math.max(1, setsBackoff - 1), reps: 10, rpe: clampFinite(7 + rpeShift, 5, 8.5, 7), dropPct: dropPct }
      }, oneRms)
    ];
  }

  /** Generates a multi-week preparation plan and scheduled workouts from a template key. */
  function generateBlockTemplate(templateKey, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const template = TEMPLATE_CATALOG.find(function (t) { return t.key === templateKey; }) || TEMPLATE_CATALOG[0];
    const requestedMonths = opts.months != null ? opts.months : template.defaultMonths;
    const durationMonths = clampPlanHorizonMonths(requestedMonths);
    const totalWeeks = Math.max(1, Math.min(MAX_PLAN_WEEKS, Math.round(durationMonths * 4.33) || 1));

    const athleteId = String(opts.athleteId || 'ath_01').trim();
    const planId = String(opts.planId || `plan_${Date.now()}`).trim();
    const startDate = (opts.startDate && !isNaN(parseIsoDateUtcMs(opts.startDate)))
      ? opts.startDate
      : formatIsoDateUtc(Date.now());
    const deloadCadence = Math.round(clampFinite(opts.deloadCadenceWeeks, 0, MAX_PLAN_WEEKS, template.deloadCadenceWeeks));
    const oneRms = opts.oneRms || { squat: 180, bench: 120, deadlift: 220 };

    const rawDays = Array.isArray(opts.availableDays) && opts.availableDays.length > 0
      ? opts.availableDays
      : ['Mon', 'Tue', 'Thu', 'Sat'];
    const trainingDays = rawDays.filter(function (d) { return WEEKDAYS.includes(d); });
    const activeDays = trainingDays.length > 0 ? trainingDays : ['Mon', 'Wed', 'Fri'];

    // Scale template phase lengths proportionally to totalWeeks
    const baseWeeksSum = template.phases.reduce(function (acc, p) { return acc + p.weeks; }, 0) || 1;
    const macroBlocks = [];
    let cursorWeek = 0;
    for (let i = 0; i < template.phases.length; i++) {
      const ph = template.phases[i];
      const w = (i === template.phases.length - 1)
        ? Math.max(1, totalWeeks - cursorWeek)
        : Math.max(1, Math.round((ph.weeks / baseWeeksSum) * totalWeeks));
      if (cursorWeek < totalWeeks) {
        const clampedW = Math.min(w, totalWeeks - cursorWeek);
        macroBlocks.push({ phase: ph.phase, startWeek: cursorWeek, weeks: clampedW });
        cursorWeek += clampedW;
      }
    }

    const workouts = [];
    for (let w = 0; w < totalWeeks; w++) {
      const block = macroBlocks.find(function (b) { return w >= b.startWeek && w < b.startWeek + b.weeks; }) || macroBlocks[macroBlocks.length - 1];
      const isDeload = template.key === 'deload_1w' || (deloadCadence > 0 && ((w + 1) % deloadCadence === 0));
      const weekStartIso = addDaysIso(startDate, w * 7);
      const startWeekdayIdx = WEEKDAYS.indexOf(weekdayOfIso(weekStartIso));

      for (const dayName of activeDays) {
        const targetIdx = WEEKDAYS.indexOf(dayName);
        const dayOffset = (targetIdx - startWeekdayIdx + 7) % 7;
        const scheduledDate = addDaysIso(weekStartIso, dayOffset);
        const phaseLabel = isDeload ? 'Deload' : block.phase;
        const slots = buildDefaultDaySlots(dayName, phaseLabel, isDeload, oneRms);
        workouts.push({
          workoutId: `wk_${planId}_w${w}_${dayName.toLowerCase()}`,
          planId: planId,
          athleteId: athleteId,
          scheduledDate: scheduledDate,
          weekIndex: w,
          dayOfWeek: dayName,
          blockPhase: phaseLabel,
          isDeload: isDeload,
          sessionTitle: `Week ${w + 1} ${dayName} - ${phaseLabel}`,
          prescribedSlots: slots,
          workoutNotes: isDeload ? 'Active deload: move bar with crisp bar speed.' : `${phaseLabel} session.`,
          dietaryNotes: opts.dietaryStrategyNotes || '',
          athleteFeedbackNote: '',
          adherenceStatus: 'planned',
          updatedAt: new Date().toISOString()
        });
      }
    }

    const plan = {
      planId: planId,
      athleteId: athleteId,
      athleteName: String(opts.athleteName || '').trim(),
      title: String(opts.title || template.label).trim(),
      goalType: String(opts.goalType || template.goalType).trim(),
      durationMonths: durationMonths,
      startDate: startDate,
      targetMeetDate: String(opts.targetMeetDate || '').trim(),
      targetSquatKg: clampFinite(opts.targetSquatKg, 0, 600, 0),
      targetBenchKg: clampFinite(opts.targetBenchKg, 0, 600, 0),
      targetDeadliftKg: clampFinite(opts.targetDeadliftKg, 0, 600, 0),
      macroBlocks: macroBlocks,
      deloadCadenceWeeks: deloadCadence,
      dietaryStrategyNotes: String(opts.dietaryStrategyNotes || '').trim(),
      coachNotes: String(opts.coachNotes || '').trim(),
      version: 1,
      updatedAt: new Date().toISOString()
    };

    return { plan: plan, workouts: workouts, macroBlocks: macroBlocks };
  }

  /** Scales a set prescription down for a deload week. */
  function deloadSetBlock(block, loadFactor, rpeDrop) {
    if (!block || typeof block !== 'object') return null;
    const out = deepClone(block);
    out.sets = Math.max(1, Math.round((Number(out.sets) || 2) * 0.5));
    const nextRpe = roundDec(clampFinite((Number(out.rpe != null ? out.rpe : out.targetRpe) || 8) - rpeDrop, 5, 9, 6.5), 1);
    out.rpe = nextRpe;
    out.targetRpe = nextRpe;
    if (Number(out.loadKg) > 0) {
      out.loadKg = roundPlateKg(Number(out.loadKg) * loadFactor);
      out.suggestedLoadKg = out.loadKg;
    }
    if (Number(out.targetVelocity) > 0) {
      out.targetVelocity = roundDec(Math.min(1.25, Number(out.targetVelocity) + 0.08), 2);
      out.velocityRange = [roundDec(Math.max(0.15, out.targetVelocity - 0.05), 2), roundDec(out.targetVelocity + 0.05, 2)];
    }
    return out;
  }

  /** Generates a deload week from an existing week of planned workouts. */
  function generateDeloadWeek(sourceWeekWorkouts, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const list = Array.isArray(sourceWeekWorkouts) ? sourceWeekWorkouts : [];
    const loadDropPct = clampFinite(opts.loadDropPct, 5, 40, 12);
    const loadFactor = 1 - loadDropPct / 100;
    const rpeDrop = clampFinite(opts.rpeDrop, 0.5, 3, 1.5);
    const shiftWeeks = Math.round(clampFinite(opts.shiftWeeks, 0, MAX_PLAN_WEEKS, 1));

    return list.map(function (w, idx) {
      const cloned = deepClone(w);
      const nextWeekIndex = opts.targetWeekIndex != null
        ? Math.min(MAX_PLAN_WEEKS, Math.max(0, Math.round(Number(opts.targetWeekIndex))))
        : Math.min(MAX_PLAN_WEEKS, (Number(cloned.weekIndex) || 0) + shiftWeeks);
      const deltaDays = (nextWeekIndex - (Number(cloned.weekIndex) || 0)) * 7;
      cloned.weekIndex = nextWeekIndex;
      cloned.scheduledDate = addDaysIso(cloned.scheduledDate, deltaDays);
      cloned.isDeload = true;
      cloned.blockPhase = 'Deload';
      cloned.workoutId = `wk_deload_${cloned.planId || 'p'}_w${nextWeekIndex}_${idx}_${Date.now().toString(36).slice(-4)}`;
      cloned.sessionTitle = `Week ${nextWeekIndex + 1} ${cloned.dayOfWeek || ''} - Deload`.trim();
      cloned.workoutNotes = opts.notes || 'Scheduled active deload: prioritize bar speed and recovery.';
      cloned.adherenceStatus = 'planned';
      cloned.athleteFeedbackNote = '';
      cloned.updatedAt = new Date().toISOString();

      const slots = Array.isArray(cloned.prescribedSlots) ? cloned.prescribedSlots : [];
      cloned.prescribedSlots = slots.map(function (slot, sIdx) {
        const nextSlot = deepClone(slot);
        nextSlot.slotId = `${cloned.workoutId}_s${sIdx}`;
        nextSlot.topSet = deloadSetBlock(nextSlot.topSet, loadFactor, rpeDrop);
        if (nextSlot.backoff) {
          nextSlot.backoff = deloadSetBlock(nextSlot.backoff, loadFactor, rpeDrop);
          nextSlot.backoffSets = deepClone(nextSlot.backoff);
        }
        return nextSlot;
      });
      return cloned;
    });
  }

  /** Clones and date-shifts a week of workouts forward or backward within 0..52 weeks. */
  function cloneOrShiftWeek(sourceWeekWorkouts, options) {
    const opts = options && typeof options === 'object' ? options : {};
    if (opts.asDeload) {
      return generateDeloadWeek(sourceWeekWorkouts, opts);
    }
    const list = Array.isArray(sourceWeekWorkouts) ? sourceWeekWorkouts : [];
    const shiftWeeks = Math.round(clampFinite(opts.shiftWeeks, -MAX_PLAN_WEEKS, MAX_PLAN_WEEKS, 1));

    return list.map(function (w, idx) {
      const cloned = deepClone(w);
      const currentWeek = Number(cloned.weekIndex) || 0;
      const targetWeek = opts.targetWeekIndex != null
        ? Math.min(MAX_PLAN_WEEKS, Math.max(0, Math.round(Number(opts.targetWeekIndex))))
        : Math.min(MAX_PLAN_WEEKS, Math.max(0, currentWeek + shiftWeeks));
      const deltaDays = (targetWeek - currentWeek) * 7;

      cloned.weekIndex = targetWeek;
      cloned.scheduledDate = addDaysIso(cloned.scheduledDate, deltaDays);
      if (opts.planId) cloned.planId = opts.planId;
      cloned.workoutId = `wk_${cloned.planId || 'p'}_w${targetWeek}_${idx}_${Date.now().toString(36).slice(-4)}`;
      cloned.adherenceStatus = 'planned';
      cloned.athleteFeedbackNote = '';
      cloned.updatedAt = new Date().toISOString();

      const slots = Array.isArray(cloned.prescribedSlots) ? cloned.prescribedSlots : [];
      cloned.prescribedSlots = slots.map(function (slot, sIdx) {
        const nextSlot = deepClone(slot);
        nextSlot.slotId = `${cloned.workoutId}_s${sIdx}`;
        return nextSlot;
      });
      return cloned;
    });
  }

  // ── Planned vs. Actual Comparison Matrix ──

  /** Compares prescribed slots in a planned workout against actual completed sets. */
  function comparePlanVsActual(plannedWorkout, completedSets) {
    const workout = plannedWorkout && typeof plannedWorkout === 'object' ? plannedWorkout : {};
    const slots = Array.isArray(workout.prescribedSlots)
      ? workout.prescribedSlots
      : (Array.isArray(workout.slots) ? workout.slots : []);
    const sets = Array.isArray(completedSets) ? completedSets : [];
    const usedSetIndices = new Set();

    const rows = slots.map(function (slot) {
      const matched = [];
      sets.forEach(function (s, idx) {
        if (!s || usedSetIndices.has(idx)) return;
        const sSlotId = s.plannedSlotId || s.planned_slot_id;
        const sWorkoutId = s.plannedWorkoutId || s.planned_workout_id;
        if (sSlotId && sSlotId === slot.slotId) {
          matched.push(s);
          usedSetIndices.add(idx);
        } else if (!sSlotId && (!sWorkoutId || !workout.workoutId || sWorkoutId === workout.workoutId)) {
          const sLift = String(s.lift || '').trim().toLowerCase();
          const exName = String(slot.exerciseName || '').trim().toLowerCase();
          const base = String(slot.baseLift || '').trim().toLowerCase();
          if (sLift && (sLift === exName || sLift === base || exName.includes(sLift))) {
            matched.push(s);
            usedSetIndices.add(idx);
          }
        }
      });

      const top = slot.topSet || {};
      const back = slot.backoff || slot.backoffSets || null;
      const plannedSets = (Number(top.sets) || 1) + (back ? (Number(back.sets) || 0) : 0);
      const plannedLoadKg = Number(top.loadKg || top.suggestedLoadKg || 0);
      const plannedRpe = Number(top.rpe != null ? top.rpe : (top.targetRpe != null ? top.targetRpe : 8));
      const plannedVelocity = Number(top.targetVelocity || 0);

      let actualSets = matched.length;
      let actualReps = 0;
      let actualLoadKg = 0;
      let actualVelSum = 0;
      let actualVelCount = 0;
      let actualRpeSum = 0;
      let actualRpeCount = 0;
      let actualVelLossMax = 0;
      let hasPr = false;

      for (const s of matched) {
        const w = Number(s.weight != null ? s.weight : s.weightKg) || 0;
        if (w > actualLoadKg) actualLoadKg = w;
        const repsLen = Array.isArray(s.reps) ? s.reps.length : (Number(s.repsCount) || 0);
        actualReps += repsLen;
        const v = Number(s.avgVelocity != null ? s.avgVelocity : s.avg_velocity);
        if (isFinite(v) && v > 0) {
          actualVelSum += v;
          actualVelCount++;
        }
        const rpe = Number(s.avgRpe != null ? s.avgRpe : (s.rpe != null ? s.rpe : s.avg_rpe));
        if (isFinite(rpe) && rpe > 0) {
          actualRpeSum += rpe;
          actualRpeCount++;
        }
        const vl = Number(s.velocityLoss != null ? s.velocityLoss : s.velocity_loss);
        if (isFinite(vl) && vl > actualVelLossMax) actualVelLossMax = vl;
        if (s.isPr || s.isPR || s.is_pr) hasPr = true;
      }

      const actualVelocity = actualVelCount > 0 ? roundDec(actualVelSum / actualVelCount, 2) : 0;
      const actualRpe = actualRpeCount > 0 ? roundDec(actualRpeSum / actualRpeCount, 1) : 0;
      const loadDeltaKg = actualSets > 0 ? roundDec(actualLoadKg - plannedLoadKg, 1) : 0;
      const velocityDelta = (actualSets > 0 && plannedVelocity > 0 && actualVelocity > 0)
        ? roundDec(actualVelocity - plannedVelocity, 2)
        : 0;

      let status = 'pending';
      if (actualSets > 0) {
        if (hasPr || actualLoadKg > plannedLoadKg || velocityDelta >= 0.03) status = 'exceeded';
        else if (actualSets >= plannedSets && actualLoadKg >= plannedLoadKg * 0.95) status = 'hit';
        else status = 'under';
      }

      return {
        slotId: slot.slotId,
        exerciseId: slot.exerciseId,
        exerciseName: slot.exerciseName,
        baseLift: slot.baseLift,
        planned: {
          sets: plannedSets,
          reps: Number(top.reps) || 0,
          loadKg: plannedLoadKg,
          rpe: plannedRpe,
          targetVelocity: plannedVelocity,
          velocityLossCapPct: Number(top.velocityLossCapPct) || 20,
          backoff: back
        },
        actual: {
          sets: actualSets,
          reps: actualReps,
          loadKg: actualLoadKg,
          avgVelocity: actualVelocity,
          avgRpe: actualRpe,
          velocityLoss: roundDec(actualVelLossMax, 1),
          hasPr: hasPr
        },
        loadDeltaKg: loadDeltaKg,
        velocityDelta: velocityDelta,
        hasPr: hasPr,
        status: status
      };
    });

    const completedRows = rows.filter(function (r) { return r.actual.sets > 0; }).length;
    const adherencePct = rows.length > 0 ? Math.round((completedRows / rows.length) * 100) : 0;

    return {
      workoutId: workout.workoutId || '',
      planId: workout.planId || '',
      rows: rows,
      completedSlots: completedRows,
      totalSlots: rows.length,
      adherencePct: adherencePct
    };
  }

  // ── Offline-First Preparation Store with Coach RBAC ──

  /** Emits an event on ErosSyncBus when the bus is loaded in the runtime. */
  function emitOnBusIfAvailable(eventName, payload) {
    try {
      const bus = root && root.ErosSyncBus;
      if (bus && typeof bus.emit === 'function') {
        bus.emit(eventName, payload);
      }
    } catch (_) {
      // Offline store must remain non-blocking even if bus validation rejects
    }
  }

  /** Verifies that a plan or workout mutation is initiated by the coach role. */
  function assertCoachWriteRole(callerRole, operation) {
    if (String(callerRole || '').trim().toLowerCase() !== 'coach') {
      throw new Error(`[ErosPrepStore] Unauthorized: only coach role may perform ${operation}`);
    }
  }

  /** Normalizes a stored plan object and clamps its horizon to 0..12 months. */
  function normalizePlanRecord(planInput) {
    const p = deepClone(planInput || {});
    p.planId = String(p.planId || p.plan_id || `plan_${Date.now()}`).trim();
    p.athleteId = String(p.athleteId || p.athlete_id || 'ath_01').trim();
    p.title = String(p.title || 'Preparation Plan').trim();
    p.durationMonths = clampPlanHorizonMonths(p.durationMonths != null ? p.durationMonths : p.duration_months);
    p.deloadCadenceWeeks = Math.round(clampFinite(p.deloadCadenceWeeks, 0, MAX_PLAN_WEEKS, 4));
    p.version = Math.max(1, Math.round(Number(p.version) || 1));
    p.updatedAt = new Date().toISOString();
    return p;
  }

  /** Normalizes a scheduled workout record and clamps its week index to 0..52. */
  function normalizeWorkoutRecord(workoutInput) {
    const w = deepClone(workoutInput || {});
    w.workoutId = String(w.workoutId || w.workout_id || `wk_${Date.now()}`).trim();
    w.planId = String(w.planId || w.plan_id || '').trim();
    w.athleteId = String(w.athleteId || w.athlete_id || 'ath_01').trim();
    w.weekIndex = Math.round(clampFinite(w.weekIndex != null ? w.weekIndex : w.week_index, 0, MAX_PLAN_WEEKS, 0));
    w.isDeload = Boolean(w.isDeload != null ? w.isDeload : w.is_deload);
    w.prescribedSlots = Array.isArray(w.prescribedSlots)
      ? w.prescribedSlots
      : (Array.isArray(w.slots) ? w.slots : []);
    w.updatedAt = new Date().toISOString();
    return w;
  }

  const ErosPrepStore = {
    /** Returns all persisted preparation plans, optionally filtered by athlete ID. */
    getPlans: function (athleteId) {
      const plans = readStorageJson(STORAGE_PLANS_KEY, []);
      if (!Array.isArray(plans)) return [];
      if (!athleteId) return plans;
      const target = String(athleteId).trim();
      return plans.filter(function (p) { return p && p.athleteId === target; });
    },

    /** Returns the latest preparation plan for an athlete, or null when uninitialized. */
    getActivePlan: function (athleteId) {
      const plans = this.getPlans(athleteId);
      if (plans.length === 0) return null;
      return plans.slice().sort(function (a, b) {
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      })[0];
    },

    /** Returns null when no plan exists so the Coach dashboard stays clean on init. */
    ensureDefaultOrEmpty: function (athleteId) {
      return this.getActivePlan(athleteId);
    },

    /** Saves a preparation plan after enforcing coach-only write authorization. */
    savePlan: function (plan, callerRole, opts) {
      assertCoachWriteRole(callerRole, 'savePlan');
      const all = readStorageJson(STORAGE_PLANS_KEY, []);
      const list = Array.isArray(all) ? all : [];
      const incoming = normalizePlanRecord(plan);
      const idx = list.findIndex(function (p) { return p && p.planId === incoming.planId; });
      if (idx >= 0) {
        incoming.version = Math.max(incoming.version, (Number(list[idx].version) || 1) + 1);
        list[idx] = incoming;
      } else {
        list.push(incoming);
      }
      writeStorageJson(STORAGE_PLANS_KEY, list);
      if (opts && opts.emit === true) {
        emitOnBusIfAvailable('prep:plan_sync', incoming);
      }
      return incoming;
    },

    /** Returns all planned workouts belonging to a plan, sorted chronologically. */
    getWorkoutsForPlan: function (planId) {
      const target = String(planId || '').trim();
      const all = readStorageJson(STORAGE_WORKOUTS_KEY, []);
      if (!Array.isArray(all)) return [];
      return all
        .filter(function (w) { return w && (!target || w.planId === target); })
        .sort(function (a, b) {
          return (Number(a.weekIndex) - Number(b.weekIndex)) ||
            String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || ''));
        });
    },

    /** Lists all planned workouts assigned to an athlete, sorted chronologically. */
    listPlannedWorkouts: function (athleteId) {
      const all = readStorageJson(STORAGE_WORKOUTS_KEY, []);
      if (!Array.isArray(all)) return [];
      const target = athleteId ? String(athleteId).trim() : '';
      return all
        .filter(function (w) { return w && (!target || w.athleteId === target); })
        .sort(function (a, b) {
          return (Number(a.weekIndex) - Number(b.weekIndex)) ||
            String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || ''));
        });
    },

    /** Returns the planned workout scheduled on a specific ISO date for an athlete. */
    getWorkoutByDate: function (athleteId, isoDate) {
      const dateKey = String(isoDate || '').trim();
      if (!dateKey) return null;
      return this.listPlannedWorkouts(athleteId).find(function (w) {
        return w.scheduledDate === dateKey;
      }) || null;
    },

    /** Finds a single planned workout by its unique workout identifier. */
    getWorkoutById: function (workoutId) {
      const target = String(workoutId || '').trim();
      if (!target) return null;
      const all = readStorageJson(STORAGE_WORKOUTS_KEY, []);
      if (!Array.isArray(all)) return null;
      return all.find(function (w) { return w && w.workoutId === target; }) || null;
    },

    /** Saves or updates a planned workout after enforcing coach-only write authorization. */
    savePlannedWorkout: function (workout, callerRole, opts) {
      assertCoachWriteRole(callerRole, 'savePlannedWorkout');
      const all = readStorageJson(STORAGE_WORKOUTS_KEY, []);
      const list = Array.isArray(all) ? all : [];
      const incoming = normalizeWorkoutRecord(workout);
      const idx = list.findIndex(function (w) { return w && w.workoutId === incoming.workoutId; });
      if (idx >= 0) {
        if (!incoming.athleteFeedbackNote && list[idx].athleteFeedbackNote) {
          incoming.athleteFeedbackNote = list[idx].athleteFeedbackNote;
        }
        list[idx] = incoming;
      } else {
        list.push(incoming);
      }
      writeStorageJson(STORAGE_WORKOUTS_KEY, list);
      if (opts && opts.emit === true) {
        emitOnBusIfAvailable('prep:workout_updated', incoming);
      }
      return incoming;
    },

    /** Alias for savePlannedWorkout supporting coach caller conventions. */
    saveWorkout: function (workout, callerRole, opts) {
      return this.savePlannedWorkout(workout, callerRole, opts);
    },

    /** Generates and saves a macro block template for an athlete as coach. */
    applyBlockTemplate: function (templateKey, options, callerRole, opts) {
      assertCoachWriteRole(callerRole, 'applyBlockTemplate');
      const generated = generateBlockTemplate(templateKey, options);
      const savedPlan = this.savePlan(generated.plan, callerRole, opts);
      const savedWorkouts = [];
      for (const wk of generated.workouts) {
        savedWorkouts.push(this.savePlannedWorkout(wk, callerRole, opts));
      }
      return { plan: savedPlan, workouts: savedWorkouts, macroBlocks: generated.macroBlocks };
    },

    /** Generates and saves a deload week derived from a source week in a plan. */
    applyDeloadWeek: function (planId, sourceWeekIndex, targetWeekIndex, callerRole, opts) {
      assertCoachWriteRole(callerRole, 'applyDeloadWeek');
      const sourceWorkouts = this.getWorkoutsForPlan(planId).filter(function (w) {
        return Number(w.weekIndex) === Number(sourceWeekIndex);
      });
      const deloadWorkouts = generateDeloadWeek(sourceWorkouts, { targetWeekIndex: targetWeekIndex });
      const saved = [];
      for (const wk of deloadWorkouts) {
        saved.push(this.savePlannedWorkout(wk, callerRole, opts));
      }
      return saved;
    },

    /** Clones or shifts a week of workouts within a plan after checking coach role. */
    cloneOrShiftWeek: function (planIdOrWorkouts, fromWeek, toWeek, callerRole, opts) {
      assertCoachWriteRole(callerRole, 'cloneOrShiftWeek');
      const source = Array.isArray(planIdOrWorkouts)
        ? planIdOrWorkouts
        : this.getWorkoutsForPlan(planIdOrWorkouts).filter(function (w) {
            return Number(w.weekIndex) === Number(fromWeek);
          });
      const cloned = cloneOrShiftWeek(source, { targetWeekIndex: toWeek });
      const saved = [];
      for (const wk of cloned) {
        saved.push(this.savePlannedWorkout(wk, callerRole, opts));
      }
      return saved;
    },

    /** Returns the stored biometrics and experience dossier for an athlete. */
    getAthleteBiometrics: function (athleteId) {
      const id = String(athleteId || 'ath_01').trim();
      const map = readStorageJson(STORAGE_BIOMETRICS_KEY, {});
      const record = (map && typeof map === 'object' && map[id]) ? map[id] : {};
      return {
        athleteId: id,
        athleteName: record.athleteName || '',
        age: record.age != null ? record.age : null,
        bodyweightKg: record.bodyweightKg != null ? record.bodyweightKg : null,
        targetWeightClass: record.targetWeightClass || '',
        weightClass: record.weightClass || '',
        gender: record.gender || '',
        trainingAgeYears: record.trainingAgeYears != null ? record.trainingAgeYears : null,
        experienceTier: record.experienceTier || '',
        meetsCompleted: record.meetsCompleted != null ? record.meetsCompleted : null,
        federation: record.federation || '',
        availableDays: Array.isArray(record.availableDays) ? record.availableDays : [],
        dutiesInjuryNotes: record.dutiesInjuryNotes || '',
        updatedAt: record.updatedAt || null
      };
    },

    /** Persists athlete biometrics and optionally emits an update event. */
    saveAthleteBiometrics: function (athleteId, biometrics, opts) {
      const id = String(athleteId || 'ath_01').trim();
      const bio = biometrics && typeof biometrics === 'object' ? biometrics : {};
      const map = readStorageJson(STORAGE_BIOMETRICS_KEY, {});
      const store = (map && typeof map === 'object') ? map : {};
      const prior = store[id] || {};
      const next = {
        ...prior,
        athleteId: id,
        athleteName: bio.athleteName != null ? String(bio.athleteName).trim() : (prior.athleteName || ''),
        age: bio.age != null && bio.age !== '' ? Math.round(clampFinite(bio.age, 10, 100, 25)) : prior.age,
        bodyweightKg: bio.bodyweightKg != null && bio.bodyweightKg !== '' ? roundDec(clampFinite(bio.bodyweightKg, 20, 300, 80), 1) : prior.bodyweightKg,
        targetWeightClass: bio.targetWeightClass != null ? String(bio.targetWeightClass).trim() : (prior.targetWeightClass || ''),
        weightClass: bio.weightClass != null ? String(bio.weightClass).trim() : (prior.weightClass || ''),
        gender: bio.gender != null ? String(bio.gender).trim() : (prior.gender || ''),
        trainingAgeYears: bio.trainingAgeYears != null && bio.trainingAgeYears !== '' ? roundDec(clampFinite(bio.trainingAgeYears, 0, 60, 0), 1) : prior.trainingAgeYears,
        experienceTier: bio.experienceTier != null ? String(bio.experienceTier).trim() : (prior.experienceTier || ''),
        meetsCompleted: bio.meetsCompleted != null && bio.meetsCompleted !== '' ? Math.round(clampFinite(bio.meetsCompleted, 0, 500, 0)) : prior.meetsCompleted,
        federation: bio.federation != null ? String(bio.federation).trim() : (prior.federation || ''),
        availableDays: Array.isArray(bio.availableDays) ? bio.availableDays.filter(function (d) { return WEEKDAYS.includes(d); }) : (prior.availableDays || []),
        dutiesInjuryNotes: bio.dutiesInjuryNotes != null ? String(bio.dutiesInjuryNotes).trim() : (prior.dutiesInjuryNotes || ''),
        updatedAt: new Date().toISOString()
      };
      store[id] = next;
      writeStorageJson(STORAGE_BIOMETRICS_KEY, store);
      if (opts && opts.emit === true) {
        emitOnBusIfAvailable('athlete:profile_updated', next);
      }
      return next;
    },

    /** Saves athlete feedback onto a planned workout without touching Coach prescriptions. */
    saveAthleteSessionFeedback: function (workoutId, note, opts) {
      const target = String(workoutId || '').trim();
      if (!target) return null;
      const all = readStorageJson(STORAGE_WORKOUTS_KEY, []);
      const list = Array.isArray(all) ? all : [];
      const idx = list.findIndex(function (w) { return w && w.workoutId === target; });
      if (idx < 0) return null;
      list[idx].athleteFeedbackNote = String(note || '').trim();
      list[idx].updatedAt = new Date().toISOString();
      writeStorageJson(STORAGE_WORKOUTS_KEY, list);
      if (opts && opts.emit === true) {
        emitOnBusIfAvailable('prep:athlete_feedback', {
          workoutId: target,
          planId: list[idx].planId,
          athleteId: list[idx].athleteId,
          note: list[idx].athleteFeedbackNote,
          timestamp: Date.now()
        });
      }
      return list[idx];
    },

    /** Returns recorded golden personal records, optionally filtered by athlete ID. */
    getPushedPrs: function (athleteId) {
      const prs = readStorageJson(STORAGE_PUSHED_PRS_KEY, []);
      if (!Array.isArray(prs)) return [];
      if (!athleteId) return prs;
      const target = String(athleteId).trim();
      return prs.filter(function (item) { return item && item.athleteId === target; });
    },

    /** Records an athlete-confirmed personal record push in offline storage. */
    recordPushedPr: function (prPayload, opts) {
      const src = prPayload && typeof prPayload === 'object' ? prPayload : {};
      const prs = readStorageJson(STORAGE_PUSHED_PRS_KEY, []);
      const list = Array.isArray(prs) ? prs : [];
      const entry = {
        athleteId: String(src.athleteId || 'ath_01').trim(),
        lift: String(src.lift || 'Main').trim(),
        weightKg: roundDec(clampFinite(src.weightKg != null ? src.weightKg : src.weight, 0, 600, 0), 1),
        weight: roundDec(clampFinite(src.weight != null ? src.weight : src.weightKg, 0, 600, 0), 1),
        velocity: roundDec(clampFinite(src.velocity, 0, 10, 0), 2),
        rpe: roundDec(clampFinite(src.rpe, 1, 10, 8), 1),
        prType: String(src.prType || 'weight').trim(),
        setId: String(src.setId || '').trim(),
        plannedWorkoutId: String(src.plannedWorkoutId || src.workoutId || '').trim(),
        plannedSlotId: String(src.plannedSlotId || src.slotId || '').trim(),
        timestamp: Number(src.timestamp) || Date.now()
      };
      list.push(entry);
      writeStorageJson(STORAGE_PUSHED_PRS_KEY, list);
      if (opts && opts.emit === true) {
        emitOnBusIfAvailable('workout:pr_pushed', entry);
      }
      return entry;
    },

    /** Applies an incoming cloud or cross-tab event directly to local preparation storage. */
    applyRemoteSync: function (eventType, payload) {
      if (!payload || typeof payload !== 'object') return false;
      if (eventType === 'prep:plan_sync') {
        const plan = payload.plan && typeof payload.plan === 'object' ? payload.plan : payload;
        this.savePlan(plan, 'coach', { emit: false });
        return true;
      }
      if (eventType === 'prep:workout_updated') {
        const wk = payload.workout && typeof payload.workout === 'object' ? payload.workout : payload;
        this.savePlannedWorkout(wk, 'coach', { emit: false });
        return true;
      }
      if (eventType === 'athlete:profile_updated') {
        this.saveAthleteBiometrics(payload.athleteId || 'ath_01', payload, { emit: false });
        return true;
      }
      if (eventType === 'workout:pr_pushed') {
        this.recordPushedPr(payload, { emit: false });
        return true;
      }
      if (eventType === 'prep:athlete_feedback') {
        this.saveAthleteSessionFeedback(payload.workoutId, payload.note || payload.athleteFeedbackNote, { emit: false });
        return true;
      }
      if (eventType === 'session:state') {
        if (Array.isArray(payload.prepPlans)) {
          for (const p of payload.prepPlans) this.savePlan(p, 'coach', { emit: false });
        }
        if (Array.isArray(payload.plannedWorkouts)) {
          for (const w of payload.plannedWorkouts) this.savePlannedWorkout(w, 'coach', { emit: false });
        }
        if (Array.isArray(payload.athleteProfiles)) {
          for (const bio of payload.athleteProfiles) this.saveAthleteBiometrics(bio.athleteId || 'ath_01', bio, { emit: false });
        }
        return true;
      }
      return false;
    },

    /** Clears all persisted preparation store keys for isolated test runs. */
    clearAll: function () {
      try {
        if (typeof localStorage !== 'undefined' && localStorage) {
          localStorage.removeItem(STORAGE_PLANS_KEY);
          localStorage.removeItem(STORAGE_WORKOUTS_KEY);
          localStorage.removeItem(STORAGE_BIOMETRICS_KEY);
          localStorage.removeItem(STORAGE_PUSHED_PRS_KEY);
          localStorage.removeItem(STORAGE_CUSTOM_EXERCISES_KEY);
        }
      } catch (_) {}
      customExercisesMap.clear();
    }
  };

  const ErosPrepEngine = {
    EXERCISE_CATALOG: EXERCISE_CATALOG,
    TEMPLATE_CATALOG: TEMPLATE_CATALOG,
    PREP_TEMPLATES: TEMPLATE_CATALOG,
    WEEKDAYS: WEEKDAYS,
    MAX_PLAN_MONTHS: MAX_PLAN_MONTHS,
    MAX_PLAN_WEEKS: MAX_PLAN_WEEKS,
    LIFT_KINEMATICS: LIFT_KINEMATICS,
    getAllExercises: getAllExercises,
    getExerciseById: getExerciseById,
    searchExercises: searchExercises,
    registerCustomExercise: registerCustomExercise,
    computePrescribedKinematics: computePrescribedKinematics,
    prescribeSlotWithTopAndBackoff: prescribeSlotWithTopAndBackoff,
    clampPlanHorizonMonths: clampPlanHorizonMonths,
    computeMeetCountdown: computeMeetCountdown,
    evaluateAthletePrepFactors: evaluateAthletePrepFactors,
    getAthleteFactorBadges: getAthleteFactorBadges,
    generateBlockTemplate: generateBlockTemplate,
    generateDeloadWeek: generateDeloadWeek,
    cloneOrShiftWeek: cloneOrShiftWeek,
    comparePlanVsActual: comparePlanVsActual
  };

  return {
    ErosPrepEngine: ErosPrepEngine,
    ErosPrepStore: ErosPrepStore
  };
});
