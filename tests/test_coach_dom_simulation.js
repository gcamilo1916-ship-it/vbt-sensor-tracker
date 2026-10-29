const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Simple DOM element mock
class MockElement {
  constructor(tag, id = '', className = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = {
      _classes: new Set(className.split(' ').filter(Boolean)),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c)
    };
    this.style = {};
    this.attributes = {};
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.listeners = {};
    this.children = [];
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(ev, cb) {
    if (!this.listeners[ev]) this.listeners[ev] = [];
    this.listeners[ev].push(cb);
  }
  click() {
    if (this.listeners['click']) {
      this.listeners['click'].forEach(cb => cb({ stopPropagation: () => {} }));
    }
  }
  querySelector(sel) { return null; }
  querySelectorAll(sel) { return []; }
}

const mockDoc = {
  readyState: 'complete',
  body: new MockElement('body', '', 'theme-deadlift'),
  elements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = new MockElement('div', id);
    }
    return this.elements[id];
  },
  querySelectorAll(sel) { return []; },
  addEventListener: () => {}
};

global.document = mockDoc;
global.window = {
  addEventListener: () => {},
  dispatchEvent: (e) => {},
  document: mockDoc,
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  }
};

const CoachPortal = require('../coach-portal.js');

// 1. Verify init
CoachPortal.init();
assert.strictEqual(CoachPortal.getIsCoachMode(), false, "Initial mode should be athlete");

// 2. Switch to coach mode
CoachPortal.switchMode('coach');
assert.strictEqual(CoachPortal.getIsCoachMode(), true, "Mode should be coach");
assert.strictEqual(mockDoc.body.classList.contains('portal-coach'), true, "body must have portal-coach class");
assert.strictEqual(mockDoc.getElementById('view-coach').style.display, 'flex', "#view-coach must be flex");
assert.strictEqual(mockDoc.getElementById('btn-mode-coach').classList.contains('active'), true, "#btn-mode-coach must be active");
assert.strictEqual(mockDoc.getElementById('btn-mode-athlete').classList.contains('active'), false, "#btn-mode-athlete must not be active");

// 3. Switch back to athlete mode
CoachPortal.switchMode('athlete');
assert.strictEqual(CoachPortal.getIsCoachMode(), false, "Mode should be athlete");
assert.strictEqual(mockDoc.body.classList.contains('portal-coach'), false, "body must not have portal-coach class");
assert.strictEqual(mockDoc.getElementById('view-coach').style.display, 'none', "#view-coach must be none");
assert.strictEqual(mockDoc.getElementById('btn-mode-athlete').classList.contains('active'), true, "#btn-mode-athlete must be active");
assert.strictEqual(mockDoc.getElementById('btn-mode-coach').classList.contains('active'), false, "#btn-mode-coach must not be active");

// 4. Test Coach Cue Prescription & Target Athlete Routing
let dispatchedEvent = null;
global.window.dispatchEvent = (ev) => { dispatchedEvent = ev; };

// 4a. Default routing to current athlete (ath_01)
const liveWeightInput = mockDoc.getElementById('live-set-weight-input');
liveWeightInput.value = '140.0';
CoachPortal.sendCoachPrescription('Drive hips!', 2.5, 142.5);
assert.ok(dispatchedEvent, "Must dispatch CustomEvent when sending prescription");
assert.strictEqual(dispatchedEvent.detail.athleteId, 'ath_01', "Default athleteId must be ath_01");
assert.strictEqual(liveWeightInput.value, '142.5', "ath_01 load override must update live-set-weight-input");

// 4b. Explicit routing to squad member (ath_02)
CoachPortal.sendCoachPrescription('Stay tight!', 2.5, 187.5, 'ath_02');
assert.strictEqual(dispatchedEvent.detail.athleteId, 'ath_02', "Target athleteId must be ath_02");
assert.strictEqual(liveWeightInput.value, '142.5', "ath_02 prescription must NOT modify ath_01 live-set-weight-input");

// 5. Test Ordinary Least Squares (OLS) e1RM Calculation
// 5a. Standard multi-set linear regression
const sampleSquatSets = [
  { lift: 'Main squat', weight: 140.0, avgVelocity: 0.65 },
  { lift: 'Main squat', weight: 170.0, avgVelocity: 0.52 },
  { lift: 'Main squat', weight: 200.0, avgVelocity: 0.38 }
];
const projectedSq = CoachPortal.calculateOlsE1rm(sampleSquatSets, 'Squat', 220.0);
assert.ok(projectedSq > 210 && projectedSq < 235, `OLS Squat e1RM must project near 220kg, got: ${projectedSq}`);

// 5b. MVT boundary condition inclusion (v === 0.30 m/s for squat)
const boundarySquatSets = [
  { lift: 'Main squat', weight: 160.0, avgVelocity: 0.55 },
  { lift: 'Main squat', weight: 190.0, avgVelocity: 0.42 },
  { lift: 'Main squat', weight: 215.0, avgVelocity: 0.30 } // Exact MVT boundary
];
const boundaryProjected = CoachPortal.calculateOlsE1rm(boundarySquatSets, 'Squat', 215.0);
assert.ok(boundaryProjected >= 215.0, `Exact MVT point must be included and e1RM >= 215.0, got: ${boundaryProjected}`);

// 5c. COACH_PORTAL_CLOUD_PLAN.md schema key compatibility (exercise_name, load_kg, mean_velocity_mps)
const planSchemaSets = [
  { exercise_name: 'Bench', load_kg: 110.0, mean_velocity_mps: 0.55 },
  { exercise_name: 'Bench', load_kg: 130.0, mean_velocity_mps: 0.38 },
  { exercise_name: 'Bench', load_kg: 145.0, mean_velocity_mps: 0.22 }
];
const planBenchProjected = CoachPortal.calculateOlsE1rm(planSchemaSets, 'Bench', 145.0);
assert.ok(planBenchProjected > 145.0 && planBenchProjected < 165.0, `Plan schema e1RM projection must succeed, got: ${planBenchProjected}`);

// 5d. Reps-level velocity fallback when avgVelocity is missing
const repsOnlySets = [
  { lift: 'Bench', weight: 100.0, reps: [{ velocity: 0.60 }, { velocity: 0.58 }] },
  { lift: 'Bench', weight: 125.0, reps: [{ velocity: 0.42 }, { velocity: 0.40 }] },
  { lift: 'Bench', weight: 140.0, reps: [{ velocity: 0.26 }, { velocity: 0.24 }] }
];
const repsOnlyProjected = CoachPortal.calculateOlsE1rm(repsOnlySets, 'Bench', 140.0);
assert.ok(repsOnlyProjected > 140.0 && repsOnlyProjected < 165.0, `Reps-level OLS projection must succeed, got: ${repsOnlyProjected}`);

// 5e. String fallbackPr parsing ('225.0 kg' -> 225)
const fallbackParsed = CoachPortal.calculateOlsE1rm([], 'Squat', '225.0 kg');
assert.strictEqual(fallbackParsed, 225.0, `String fallbackPr '225.0 kg' must parse to 225.0, got: ${fallbackParsed}`);

// 5f. Flat or positive slope rejection (falls back to fallbackPr)
const invertedSets = [
  { lift: 'Main squat', weight: 140.0, avgVelocity: 0.35 },
  { lift: 'Main squat', weight: 180.0, avgVelocity: 0.65 } // Faster at heavier load (invalid)
];
const rejectedProjected = CoachPortal.calculateOlsE1rm(invertedSets, 'Squat', 200.0);
assert.strictEqual(rejectedProjected, 200.0, `Positive slope must be rejected and fallbackPr returned, got: ${rejectedProjected}`);

// 6. Test Strict 'Main' Workout Naming Conventions & Structured Input Support
assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['Squat', 'Bench', 'Deadlift']), 'SBD');
assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['Deadlift', 'Bench']), 'Main deadlift + Bench');
assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['Squat', 'Bench']), 'Main squat + Bench');
assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['Squat', 'Deadlift']), 'Main squat + Main deadlift');
assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['Squat']), 'Main squat');
assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['Deadlift']), 'Main deadlift');
assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['Bench']), 'Bench');

// Structured object support
assert.strictEqual(CoachPortal.formatCanonicalWorkoutName({ lifts: ['Squat', 'Bench'] }), 'Main squat + Bench');
assert.strictEqual(CoachPortal.formatCanonicalWorkoutName({ sets: [{ lift: 'Squat' }, { lift: 'Deadlift' }] }), 'Main squat + Main deadlift');
assert.strictEqual(CoachPortal.formatCanonicalWorkoutName({ name: 'SBD' }), 'SBD');

// 7. Test Weekly Adherence Calculation
const adherence = CoachPortal.computeWeeklyAdherence([]);
assert.strictEqual(adherence.targetDays, 7);
assert.ok(adherence.headline.includes('/7 workouts completed this week with Eros'));
assert.strictEqual(adherence.segments.length, 7);

// 7b. Multiple workouts on the same day count as 1 distinct completed day
const mockMultiWorkouts = [
  { date: '2026-10-26', totalSets: 5, totalVolumeKg: 7200 },
  { date: '2026-10-26', totalSets: 3, totalVolumeKg: 4100 }, // Same day
  { date: '2026-10-28', totalSets: 4, totalVolumeKg: 6500 }
];
const multiAdherence = CoachPortal.computeWeeklyAdherence(mockMultiWorkouts, new Date('2026-10-29T12:00:00Z'));
assert.strictEqual(multiAdherence.completedDaysCount, 2, "Multiple workouts on same date must count as 1 distinct day");

// 8. Test 6-Char Crockford Base32 Pairing Code Generation
const pairCode = CoachPortal.generatePairingCode();
assert.ok(/^EROS-[0-9A-HJKMNP-Z]{4}$/.test(pairCode), `Pairing code must match EROS-XXXX, got ${pairCode}`);
assert.strictEqual(/[ILOU]/.test(pairCode.split('-')[1]), false, "Crockford Base32 code must never contain I, L, O, or U");

// 9. Static Terminology Audit (Zero Hardware Terms & Zero Emojis)
const coachJsRaw = fs.readFileSync(path.join(__dirname, '..', 'coach-portal.js'), 'utf8');
const coachCssRaw = fs.readFileSync(path.join(__dirname, '..', 'coach.css'), 'utf8');
const indexHtmlRaw = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const FORBIDDEN_HARDWARE = [
  'webble', '100hz', 'esp32', 'esp32-c6', 'imu', 'madgwick', 'bluefy', 'sensor', 'hardware'
];
for (const term of FORBIDDEN_HARDWARE) {
  const re = new RegExp(`\\b${term}\\b`, 'i');
  assert.strictEqual(re.test(coachJsRaw), false, `coach-portal.js must not contain forbidden term: ${term}`);
  assert.strictEqual(re.test(coachCssRaw), false, `coach.css must not contain forbidden term: ${term}`);
  assert.strictEqual(re.test(indexHtmlRaw), false, `index.html must not contain forbidden term: ${term}`);
}

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}-\u{2B55}]/u;
assert.strictEqual(EMOJI_REGEX.test(coachJsRaw), false, 'coach-portal.js must contain zero emojis');
assert.strictEqual(EMOJI_REGEX.test(coachCssRaw), false, 'coach.css must contain zero emojis');
assert.strictEqual(EMOJI_REGEX.test(indexHtmlRaw), false, 'index.html must contain zero emojis');

console.log("ALL COACH PORTAL JS DOM SIMULATION TESTS PASSED!");
