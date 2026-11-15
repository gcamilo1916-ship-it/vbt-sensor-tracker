/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS INTEGRATED PREPARATION SYSTEM, RBAC, BIOMETRICS & PR TEST SUITE
 * File: tests/test_preparation_system.js
 *
 * Verifies:
 *   1. ErosPrepEngine.EXERCISE_CATALOG (>= 75 exercises) + custom registration
 *   2. computePrescribedKinematics & prescribeSlotWithTopAndBackoff (Set X / Set Y)
 *   3. clampPlanHorizonMonths (0..12 months clamping)
 *   4. evaluateAthletePrepFactors (age, BW vs class, tier, meets, schedule, duties)
 *   5. Coach-only RBAC write lock in ErosPrepStore and SquadSession/entry.ts
 *   6. Live Coach edit propagation (prep:workout_updated) without erasing completed sets
 *   7. Smart PR detection (evaluatePrCandidate) + confirmPushPr -> workout:pr_pushed -> .coach-golden-pr-badge
 *   8. Side-by-side comparePlanVsActual rendering in Athlete & Coach containers
 *   9. Zero forbidden hardware terms across all modified/new source files
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { stripTypeScriptTypes } = require('module');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║    EROS PREPARATION SYSTEM, RBAC & GOLDEN PR INTEGRATION TEST SUITE    ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    if (err.stack) {
      console.error(`         ${err.stack.split('\n').slice(1, 3).join('\n')}`);
    }
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    if (err.stack) {
      console.error(`         ${err.stack.split('\n').slice(1, 3).join('\n')}`);
    }
  }
}

// ── Shared Memory Storage & Rich Mock DOM Harness ──

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(String(k), String(v)); },
    removeItem(k) { store.delete(String(k)); },
    clear() { store.clear(); },
    key(i) { return Array.from(store.keys())[i] || null; },
    get length() { return store.size; }
  };
}

function createClassList(el) {
  const classes = new Set();
  return {
    add(...tokens) { tokens.forEach(t => { if (t) classes.add(t); }); el.className = Array.from(classes).join(' '); },
    remove(...tokens) { tokens.forEach(t => classes.delete(t)); el.className = Array.from(classes).join(' '); },
    toggle(token, force) {
      const has = classes.has(token);
      const next = force !== undefined ? Boolean(force) : !has;
      if (next) classes.add(token); else classes.delete(token);
      el.className = Array.from(classes).join(' ');
      return next;
    },
    contains(token) { return classes.has(token); },
    _set: classes
  };
}

function createMockElement(tagName, id) {
  const el = {
    tagName: String(tagName || 'div').toUpperCase(),
    id: id || '',
    className: '',
    style: { setProperty() {} },
    attributes: {},
    dataset: {},
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    children: [],
    options: [],
    selectedIndex: 0,
    listeners: {},
    clientWidth: 320,
    scrollWidth: 320,
    width: 300,
    height: 400,
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'class') {
        this.classList._set.clear();
        String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
      }
    },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    addEventListener(type, cb) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(cb);
    },
    dispatchEvent(ev) {
      const list = this.listeners[ev && ev.type] || [];
      list.forEach(cb => cb(ev));
    },
    appendChild(child) {
      this.children.push(child);
      if (child && child._isTextNode) {
        this.innerHTML += String(child.nodeValue || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }
      return child;
    },
    _sub: {},
    querySelector(sel) {
      if (!this._sub[sel]) this._sub[sel] = createMockElement('div', `${this.id}:${sel}`);
      return this._sub[sel];
    },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
    scrollIntoView() {},
    getBoundingClientRect() { return { left: 0, top: 0, right: 320, bottom: 40, width: 320, height: 40 }; },
    getContext() {
      return {
        clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        fillRect() {}, strokeRect() {}, arc() {}, arcTo() {}, roundRect() {},
        fill() {}, closePath() {}, setLineDash() {}, save() {}, restore() {},
        scale() {}, translate() {}, rotate() {}, fillText() {}, strokeText() {},
        measureText: () => ({ width: 20 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} })
      };
    }
  };
  el.classList = createClassList(el);
  return el;
}

function createBrowserSandbox() {
  const localStorage = createMemoryStorage();
  const elements = {};
  const winListeners = {};
  const docListeners = {};

  function ensureEl(id, tag = 'div') {
    if (!elements[id]) elements[id] = createMockElement(tag, id);
    return elements[id];
  }

  // Pre-seed key Athlete & Coach DOM containers
  const prepIds = [
    'athlete-prep-hub', 'athlete-prep-title', 'athlete-prep-goal', 'athlete-prep-countdown',
    'athlete-prep-sync-badge', 'athlete-prep-notice', 'athlete-prep-week-strip',
    'athlete-prep-workout-notes', 'athlete-prep-diet-notes', 'athlete-prep-slots-list',
    'btn-start-planned-workout', 'athlete-plan-vs-actual-card', 'athlete-plan-vs-actual-body',
    'athlete-prep-feedback-input', 'btn-send-prep-feedback',
    'athlete-biometrics-card', 'bio-age-input', 'bio-bw-input', 'bio-class-select',
    'bio-gender-select', 'bio-training-age-input', 'bio-tier-select', 'bio-meets-input',
    'bio-federation-select', 'bio-duties-input', 'bio-factors-summary', 'btn-save-biometrics',
    'dots-bodyweight-input', 'dots-gender-select', 'dots-squat-pr', 'dots-bench-pr', 'dots-deadlift-pr',
    'pr-confirm-hud', 'pr-confirm-summary', 'pr-confirm-metrics', 'btn-confirm-push-pr', 'btn-dismiss-pr-hud',
    'workout-sets-table', 'workout-sets-body', 'workout-sets-counter', 'workout-sum-sets',
    'workout-sum-reps', 'workout-sum-avg-vel', 'workout-sum-peak-vel', 'workout-summary-status',
    'view-coach', 'btn-mode-athlete', 'btn-mode-coach', 'coach-preparation-panel',
    'coach-prep-athlete-select', 'coach-prep-plan-title', 'coach-prep-goal-type',
    'coach-prep-months', 'coach-prep-start-date', 'coach-prep-meet-date',
    'coach-prep-countdown', 'coach-prep-factors-badges', 'coach-prep-factors-alerts',
    'coach-prep-template-select', 'coach-prep-weeks-track', 'coach-prep-selected-day-title',
    'coach-prep-exercise-search', 'coach-prep-exercise-select',
    'coach-slot-top-sets', 'coach-slot-top-reps', 'coach-slot-top-rpe',
    'coach-slot-back-sets', 'coach-slot-back-reps', 'coach-slot-back-rpe', 'coach-slot-back-drop',
    'coach-slot-kinematics-preview', 'coach-prep-slots-list', 'coach-prep-comparison-body',
    'coach-prep-athlete-feedback-view', 'coach-sets-table-body', 'coach-sets-counter',
    'coach-previous-workouts-list', 'coach-calendar-grid', 'coach-day-inspector',
    'coach-squad-list', 'coach-sidebar-rest-time', 'coach-sidebar-rest-state',
    'selected-lift-text', 'current-weight-display', 'target-rpe-display', 'bar-path-canvas',
    'history-workouts-list'
  ];
  prepIds.forEach(id => ensureEl(id));

  const mockDocument = {
    readyState: 'loading',
    body: createMockElement('body', 'doc-body'),
    elements,
    getElementById(id) { return ensureEl(id); },
    createElement(tag) { return createMockElement(tag); },
    createTextNode(str) { return { _isTextNode: true, nodeValue: String(str == null ? '' : str) }; },
    querySelector(sel) {
      if (sel && sel.startsWith('#')) return ensureEl(sel.slice(1));
      if (sel) return ensureEl(`qs:${sel}`);
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, cb) {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(cb);
    }
  };

  class MockCustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init ? init.detail : undefined;
    }
  }

  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Map,
    Set,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    CustomEvent: MockCustomEvent,
    localStorage,
    document: mockDocument,
    navigator: { vibrate: () => false },
    location: { search: '', href: 'http://localhost/' },
    history: { replaceState() {} },
    AudioContext: undefined,
    webkitAudioContext: undefined
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.localStorage = localStorage;
  sandbox.window.document = mockDocument;
  sandbox.window.addEventListener = (type, cb) => {
    if (!winListeners[type]) winListeners[type] = [];
    winListeners[type].push(cb);
  };
  sandbox.window.dispatchEvent = (ev) => {
    const list = winListeners[ev && ev.type] || [];
    list.forEach(cb => cb(ev));
  };

  vm.createContext(sandbox);

  // Load sync-bus.js, prep-engine.js, app.js, coach-portal.js inside the shared sandbox
  const filesToLoad = ['sync-bus.js', 'prep-engine.js', 'app.js', 'coach-portal.js'];
  for (const rel of filesToLoad) {
    const code = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
  }

  // Trigger DOMContentLoaded listeners cleanly
  mockDocument.readyState = 'complete';
  (docListeners['DOMContentLoaded'] || []).forEach(cb => cb());

  return { sandbox, localStorage, elements, mockDocument };
}

// ── Load Direct CJS Modules ──
global.localStorage = createMemoryStorage();
const { ErosPrepEngine, ErosPrepStore } = require(path.join(ROOT_DIR, 'prep-engine.js'));

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: ErosPrepEngine Catalog, Kinematics, Horizon & Factors
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- SUITE 1: ErosPrepEngine Core Math, Catalog & Factors ---');

runTest('1.1 EXERCISE_CATALOG has >= 75 exercises and supports custom registration', () => {
  assert.ok(Array.isArray(ErosPrepEngine.EXERCISE_CATALOG), 'EXERCISE_CATALOG must be an array');
  assert.ok(
    ErosPrepEngine.EXERCISE_CATALOG.length >= 75,
    `Expected >= 75 exercises in catalog, got ${ErosPrepEngine.EXERCISE_CATALOG.length}`
  );

  const compSquat = ErosPrepEngine.getExerciseById('comp_squat');
  assert.ok(compSquat && compSquat.baseLift === 'Squat', 'comp_squat must exist with baseLift Squat');

  const searchPause = ErosPrepEngine.searchExercises('pause');
  assert.ok(searchPause.length >= 2, 'searchExercises("pause") must return paused lift variants');

  const custom = ErosPrepEngine.registerCustomExercise({
    name: 'Safety Squat Bar Good Morning',
    baseLift: 'Deadlift',
    category: 'Powerlifting Variation'
  });
  assert.ok(custom && custom.id && custom.isCustom === true, 'registerCustomExercise must mark isCustom=true');

  const all = ErosPrepEngine.getAllExercises();
  assert.ok(all.some(ex => ex.id === custom.id), 'getAllExercises must include registered custom exercise');
});

runTest('1.2 computePrescribedKinematics & prescribeSlotWithTopAndBackoff (Set X & Set Y)', () => {
  const topKin = ErosPrepEngine.computePrescribedKinematics({
    exerciseId: 'comp_squat',
    baseLift: 'Squat',
    reps: 3,
    targetRpe: 8.5,
    oneRmKg: 240
  });
  assert.strictEqual(topKin.reps, 3);
  assert.strictEqual(topKin.targetRpe, 8.5);
  assert.ok(topKin.suggestedLoadKg >= 195 && topKin.suggestedLoadKg <= 230, `Expected Squat top load 195-230, got ${topKin.suggestedLoadKg}`);
  assert.ok(topKin.targetVelocity >= 0.30 && topKin.targetVelocity <= 0.60, `Expected Squat velocity 0.30-0.60, got ${topKin.targetVelocity}`);
  assert.ok(Array.isArray(topKin.velocityRange) && topKin.velocityRange.length === 2 && topKin.velocityRange[0] <= topKin.targetVelocity);
  assert.ok(topKin.velocityLossCapPct >= 5 && topKin.velocityLossCapPct <= 50);

  const slot = ErosPrepEngine.prescribeSlotWithTopAndBackoff({
    exerciseId: 'comp_bench',
    topSet: { sets: 1, reps: 2, rpe: 8.5 },
    backoff: { sets: 4, reps: 5, rpe: 7.0, dropPct: 12 }
  }, { squat: 240, bench: 160, deadlift: 280 });

  assert.strictEqual(slot.baseLift, 'Bench');
  assert.ok(slot.topSet && slot.topSet.rpe === 8.5 && slot.topSet.targetRpe === 8.5);
  assert.ok(slot.topSet.loadKg > 120 && slot.topSet.targetVelocity > 0.15);
  assert.ok(slot.backoff && slot.backoffSets, 'Both backoff and backoffSets aliases must be populated');
  assert.strictEqual(slot.backoff.sets, 4);
  assert.strictEqual(slot.backoff.rpe, 7.0);
  assert.ok(slot.backoff.loadKg < slot.topSet.loadKg, 'Backoff loadKg must be lighter than topSet loadKg');
  assert.ok(slot.backoff.targetVelocity > slot.topSet.targetVelocity, 'Backoff velocity must be faster than topSet velocity');
  assert.ok(slot.backoff.velocityLossCapPct >= 5 && slot.backoff.velocityLossCapPct <= 50);
});

runTest('1.3 clampPlanHorizonMonths enforces 0..12 month ceiling', () => {
  assert.strictEqual(ErosPrepEngine.clampPlanHorizonMonths(-3), 0);
  assert.strictEqual(ErosPrepEngine.clampPlanHorizonMonths(0), 0);
  assert.strictEqual(ErosPrepEngine.clampPlanHorizonMonths(6), 6);
  assert.strictEqual(ErosPrepEngine.clampPlanHorizonMonths(12), 12);
  assert.strictEqual(ErosPrepEngine.clampPlanHorizonMonths(18), 12);
});

runTest('1.4 evaluateAthletePrepFactors generates alerts for age, BW class, tier, meets, schedule & duties', () => {
  const alerts = ErosPrepEngine.evaluateAthletePrepFactors({
    age: 42,
    bodyweightKg: 98.5,
    targetWeightClass: '93',
    experienceTier: 'National',
    meetsCompleted: 8,
    availableDays: ['Mon', 'Wed'],
    dutiesInjuryNotes: 'Night shift recovery + mild patellar soreness',
    nowDate: '2026-11-01'
  }, {
    targetMeetDate: '2026-11-10',
    scheduledDays: ['Mon', 'Wed', 'Fri', 'Sat']
  });

  const codes = alerts.map(a => a.code);
  assert.ok(codes.includes('AGE_MASTERS_RECOVERY'), `Expected AGE_MASTERS_RECOVERY in ${codes.join(', ')}`);
  assert.ok(codes.includes('BW_CUT_AGGRESSIVE'), `Expected BW_CUT_AGGRESSIVE in ${codes.join(', ')}`);
  assert.ok(codes.includes('TIER_COMPETITOR_PEAK'), `Expected TIER_COMPETITOR_PEAK in ${codes.join(', ')}`);
  assert.ok(codes.includes('SCHEDULE_LOW_FREQ'), `Expected SCHEDULE_LOW_FREQ in ${codes.join(', ')}`);
  assert.ok(codes.includes('SCHEDULE_DAY_MISMATCH'), `Expected SCHEDULE_DAY_MISMATCH in ${codes.join(', ')}`);
  assert.ok(codes.includes('DUTIES_INJURY_FLAG'), `Expected DUTIES_INJURY_FLAG in ${codes.join(', ')}`);
  assert.ok(codes.includes('MEET_PEAK_WINDOW'), `Expected MEET_PEAK_WINDOW in ${codes.join(', ')}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Coach-Only RBAC Write Lock in ErosPrepStore & SquadSession/entry.ts
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 2: Coach-Only RBAC Write Lock (Store & Base44 Actor) ---');

runTest('2.1 ErosPrepStore rejects athlete writes and permits coach writes', () => {
  global.localStorage.clear();

  assert.throws(() => {
    ErosPrepStore.savePlan({ planId: 'p_rbac', athleteId: 'ath_01', title: 'Rogue Athlete Plan', durationMonths: 3 }, 'athlete');
  }, /Coach/i, 'Athlete savePlan must throw');
  assert.strictEqual(ErosPrepStore.getActivePlan('ath_01'), null, 'Rejected athlete write must not store plan');

  assert.throws(() => {
    ErosPrepStore.savePlannedWorkout({ workoutId: 'wk_rbac', planId: 'p_rbac', athleteId: 'ath_01' }, 'athlete');
  }, /Coach/i, 'Athlete savePlannedWorkout must throw');

  assert.throws(() => {
    ErosPrepStore.applyBlockTemplate('peaking_8w', { athleteId: 'ath_01' }, 'athlete');
  }, /Coach/i, 'Athlete applyBlockTemplate must throw');

  const savedPlan = ErosPrepStore.savePlan({
    planId: 'p_rbac',
    athleteId: 'ath_01',
    title: 'Nationals 18m Attempt',
    durationMonths: 18
  }, 'coach');
  assert.strictEqual(savedPlan.durationMonths, 12, 'Coach savePlan must clamp durationMonths to 12');

  const savedWk = ErosPrepStore.savePlannedWorkout({
    workoutId: 'wk_rbac_1',
    planId: 'p_rbac',
    athleteId: 'ath_01',
    scheduledDate: '2026-11-15',
    weekIndex: 1,
    prescribedSlots: [
      ErosPrepEngine.prescribeSlotWithTopAndBackoff({ exerciseId: 'comp_squat', topSet: { sets: 1, reps: 3, rpe: 8.5 } }, { squat: 240 })
    ]
  }, 'coach');
  assert.strictEqual(savedWk.workoutId, 'wk_rbac_1');
  assert.strictEqual(ErosPrepStore.listPlannedWorkouts('ath_01').length, 1);
});

runAsyncTest('2.2 SquadSession/entry.ts enforces Coach-only RBAC on prep:plan_sync & prep:workout_updated', async () => {
  const actorPath = path.join(ROOT_DIR, 'base44', 'actors', 'SquadSession', 'entry.ts');
  const tsSource = fs.readFileSync(actorPath, 'utf8')
    .replace(/import\s+\{[^}]*\}\s+from\s+["'][^"']+["'];?/g, 'class Actor { constructor() { this.instanceId = "PREP-ROOM-1"; this._peers = []; } broadcast(m) { this._peers.forEach(p => p.send(m)); } }')
    .replace(/export\s+default\s+class\s+SquadSession/, 'class SquadSession');

  const strippedJs = stripTypeScriptTypes(tsSource, { mode: 'transform' }) + '\nmodule.exports = SquadSession;';
  const actorSandbox = {
    module: { exports: null },
    exports: {},
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    Promise,
    isFinite,
    isNaN,
    parseInt,
    parseFloat
  };
  vm.createContext(actorSandbox);
  vm.runInContext(strippedJs, actorSandbox, { filename: 'SquadSession/entry.ts' });

  const SquadSessionClass = actorSandbox.module.exports;
  assert.strictEqual(typeof SquadSessionClass, 'function', 'SquadSession class must instantiate');

  const session = new SquadSessionClass();
  const athleteSent = [];
  const coachSent = [];
  const athleteConn = { id: 'conn_ath', send: (m) => athleteSent.push(m) };
  const coachConn = { id: 'conn_coach', send: (m) => coachSent.push(m) };
  session._peers = [athleteConn, coachConn];

  await session.handleConnect(athleteConn);
  await session.handleConnect(coachConn);
  await session.handleMessage(athleteConn, { type: 'athlete:connect', data: { athleteId: 'ath_01', athleteName: 'Lifter One' } });
  await session.handleMessage(coachConn, { type: 'coach:connect', data: { coachName: 'Head Coach' } });

  athleteSent.length = 0;
  coachSent.length = 0;

  // Athlete attempts Coach-only write -> MUST be rejected with security:unauthorized and NOT broadcast
  await session.handleMessage(athleteConn, {
    type: 'prep:plan_sync',
    data: { planId: 'plan_bad', athleteId: 'ath_01', title: 'Bypass', durationMonths: 10 }
  });
  assert.ok(
    athleteSent.some(m => m.type === 'security:unauthorized' && m.data && m.data.rejectedType === 'prep:plan_sync'),
    'Athlete prep:plan_sync must trigger security:unauthorized'
  );
  assert.strictEqual(coachSent.length, 0, 'Rejected athlete prep:plan_sync must not broadcast to coach');

  athleteSent.length = 0;
  await session.handleMessage(athleteConn, {
    type: 'prep:workout_updated',
    data: { workoutId: 'wk_bad', planId: 'plan_bad', athleteId: 'ath_01' }
  });
  assert.ok(
    athleteSent.some(m => m.type === 'security:unauthorized' && m.data && m.data.rejectedType === 'prep:workout_updated'),
    'Athlete prep:workout_updated must trigger security:unauthorized'
  );
  assert.strictEqual(coachSent.length, 0, 'Rejected athlete prep:workout_updated must not broadcast to coach');

  // Coach sends prep:plan_sync with excessive horizon (24m) -> accepted, clamped to 12m, broadcast
  athleteSent.length = 0;
  coachSent.length = 0;
  await session.handleMessage(coachConn, {
    type: 'prep:plan_sync',
    data: { planId: 'plan_live_1', athleteId: 'ath_01', title: 'Meet Peak', durationMonths: 24 }
  });
  const planBroadcast = athleteSent.find(m => m.type === 'prep:plan_sync');
  assert.ok(planBroadcast, 'Coach prep:plan_sync must broadcast to athlete');
  assert.strictEqual(planBroadcast.data.durationMonths, 12, 'Actor must clamp durationMonths to 12');

  // Verify room snapshot on reconnect contains the persisted Coach plan
  const reconnSent = [];
  const reconnConn = { id: 'conn_ath_2', send: (m) => reconnSent.push(m) };
  await session.handleConnect(reconnConn);
  const stateMsg = reconnSent.find(m => m.type === 'session:state');
  assert.ok(stateMsg && stateMsg.data.prepPlans.some(p => p.planId === 'plan_live_1'), 'Reconnect session:state must restore Coach prepPlans');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Live Coach Edit Propagation, Smart PR Push & Plan vs Actual Views
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 3: Live Coach Merge, Smart PR Push & Side-by-Side Comparison ---');

runTest('3.1 Live Coach prep:workout_updated merges uncompleted slots without erasing completed sets', () => {
  const { sandbox, elements } = createBrowserSandbox();
  const Engine = sandbox.ErosPrepEngine;
  const Store = sandbox.ErosPrepStore;

  const slot1 = Engine.prescribeSlotWithTopAndBackoff({
    slotId: 'slot_sq_1',
    exerciseId: 'comp_squat',
    topSet: { sets: 1, reps: 3, rpe: 8.5, loadKg: 200 }
  }, { squat: 240, bench: 160, deadlift: 280 });

  const slot2 = Engine.prescribeSlotWithTopAndBackoff({
    slotId: 'slot_bn_2',
    exerciseId: 'comp_bench',
    topSet: { sets: 1, reps: 3, rpe: 8.0, loadKg: 120 }
  }, { squat: 240, bench: 160, deadlift: 280 });

  const plan = {
    planId: 'plan_live_merge',
    athleteId: 'ath_01',
    title: 'Live Prep Cycle',
    goalType: 'meet_prep',
    durationMonths: 2,
    startDate: '2026-11-09',
    targetMeetDate: '2027-01-09'
  };
  const workout = {
    workoutId: 'wk_live_merge',
    planId: 'plan_live_merge',
    athleteId: 'ath_01',
    scheduledDate: '2026-11-15',
    weekIndex: 1,
    dayOfWeek: 'Sun',
    blockPhase: 'Strength',
    sessionTitle: 'Squat + Bench Day',
    prescribedSlots: [slot1, slot2]
  };

  Store.savePlan(plan, 'coach');
  Store.savePlannedWorkout(workout, 'coach');

  // Seed athlete's already-completed set for slot_sq_1 and mark slot_bn_2 as current active slot
  vm.runInContext(`
    workouts = [{
      id: 'w_today_1',
      name: 'Main squat',
      date: '2026-11-15',
      startTime: Date.now() - 300000,
      endTime: null,
      sets: [{
        setId: 'set_sq_done',
        setNumber: 1,
        lift: 'Squat',
        weight: 200,
        plannedWorkoutId: 'wk_live_merge',
        plannedSlotId: 'slot_sq_1',
        avgVelocity: 0.42,
        maxVelocity: 0.47,
        avgRpe: 8.5,
        velocityLossPct: 11,
        reps: [{ repNumber: 1, velocity: 0.44, rpe: 8.0 }, { repNumber: 2, velocity: 0.42, rpe: 8.5 }]
      }]
    }];
    activeWorkout = workouts[0];
    activeSet = null;
    activePlannedWorkoutId = 'wk_live_merge';
    activePlannedSlotId = 'slot_bn_2';
    setWorkingWeight(120, true);
    initAthletePrepView();
    renderAthletePrepHub();
  `, sandbox);

  // Coach updates slot 1 to 205 (already completed!) and slot 2 to 125 @ RPE 8.5 (uncompleted!)
  const updatedWorkout = JSON.parse(JSON.stringify(workout));
  updatedWorkout.prescribedSlots[0].topSet.loadKg = 205;
  updatedWorkout.prescribedSlots[1].topSet.loadKg = 125;
  updatedWorkout.prescribedSlots[1].topSet.rpe = 8.5;
  updatedWorkout.prescribedSlots[1].topSet.targetRpe = 8.5;

  sandbox.ErosSyncBus.emit('prep:workout_updated', {
    workout: updatedWorkout,
    planId: 'plan_live_merge',
    athleteId: 'ath_01'
  });

  const postState = vm.runInContext(`({
    completedSetWeight: activeWorkout.sets[0].weight,
    completedSetCount: activeWorkout.sets.length,
    currentWorkingWeight,
    currentTargetRpe
  })`, sandbox);

  assert.strictEqual(postState.completedSetCount, 1, 'Completed set must never be erased by live Coach update');
  assert.strictEqual(postState.completedSetWeight, 200, 'Completed set recorded weight (200 kg) must remain intact');
  assert.strictEqual(postState.currentWorkingWeight, 125, 'Uncompleted active slot weight must merge to Coach update (125 kg)');
  assert.strictEqual(postState.currentTargetRpe, 8.5, 'Uncompleted active slot RPE must update to 8.5');
  assert.strictEqual(elements['athlete-prep-sync-badge'].textContent, 'LIVE');
  assert.ok(elements['athlete-plan-vs-actual-body'].innerHTML.includes('200.0 kg'), 'Athlete Plan vs Actual must retain completed 200.0 kg');
  assert.ok(elements['athlete-plan-vs-actual-body'].innerHTML.includes('125.0 kg'), 'Athlete Plan vs Actual must reflect new 125.0 kg plan target');
});

runTest('3.2 Smart PR detection + confirmPushPr emits workout:pr_pushed & stamps .coach-golden-pr-badge + side-by-side accuracy', () => {
  const { sandbox, elements } = createBrowserSandbox();
  const Engine = sandbox.ErosPrepEngine;
  const Store = sandbox.ErosPrepStore;

  const slot = Engine.prescribeSlotWithTopAndBackoff({
    slotId: 'slot_pr_sq',
    exerciseId: 'comp_squat',
    topSet: { sets: 1, reps: 1, rpe: 9.0, loadKg: 220 }
  }, { squat: 220, bench: 150, deadlift: 260 });

  const now = new Date();
  const monOffset = (now.getDay() + 6) % 7;
  const monDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - monOffset);
  const mondayIso = `${monDate.getFullYear()}-${String(monDate.getMonth() + 1).padStart(2, '0')}-${String(monDate.getDate()).padStart(2, '0')}`;

  const plan = Store.savePlan({
    planId: 'plan_pr_test',
    athleteId: 'ath_01',
    title: 'Meet Simulation',
    durationMonths: 2,
    startDate: mondayIso,
    targetMeetDate: '2026-12-20'
  }, 'coach');

  const wk = Store.savePlannedWorkout({
    workoutId: 'wk_pr_today',
    planId: plan.planId,
    athleteId: 'ath_01',
    scheduledDate: mondayIso,
    weekIndex: 0,
    dayOfWeek: 'Mon',
    blockPhase: 'Peak',
    sessionTitle: 'Heavy Single',
    prescribedSlots: [slot]
  }, 'coach');

  // Seed workouts with one 225 kg Squat set (beats 220 kg PR) and track emitted workout:pr_pushed
  let pushedEvents = [];
  sandbox.ErosSyncBus.on('workout:pr_pushed', (payload) => pushedEvents.push(payload));

  vm.runInContext(`
    prProfile.currentPRs = { squat: 220, bench: 150, deadlift: 260 };
    prProfile.currentPRDetails = {
      squat: { weight: 220, velocity: 0.34, rpe: 9.0, timestamp: Date.now() - 86400000 }
    };
    workouts = [{
      id: 'w_pr_live',
      name: 'Main squat',
      date: '${mondayIso}',
      startTime: ${monDate.getTime() + 43200000},
      endTime: null,
      sets: [{
        setId: 'set_pr_225',
        setNumber: 1,
        lift: 'Squat',
        weight: 225,
        plannedWorkoutId: 'wk_pr_today',
        plannedSlotId: 'slot_pr_sq',
        avgVelocity: 0.37,
        maxVelocity: 0.39,
        avgRpe: 9.0,
        velocityLossPct: 4.0,
        reps: [{ repNumber: 1, velocity: 0.37, rpe: 9.0 }]
      }]
    }];
    activeWorkout = workouts[0];
    athletePrepState.selectedDate = '${mondayIso}';
    initAthletePrepView();
    renderAthletePrepHub();
    CoachPortal.init();
    CoachPortal.switchMode('coach');
    CoachPortal.switchCoachPanel('preparation');
  `, sandbox);

  // Verify non-PR below threshold returns null, Weight PR returns 'weight', Velocity PR returns 'velocity'
  const candResults = vm.runInContext(`({
    tooEasy: evaluatePrCandidate({ lift: 'Squat', weight: 230, velocity: 0.34, rpe: 6.5, setId: 'set_easy' }),
    weightPr: evaluatePrCandidate({ lift: 'Squat', weight: 225, velocity: 0.37, rpe: 9.0, setId: 'set_pr_225' }),
    velPr: evaluatePrCandidate({ lift: 'Squat', weight: 220, velocity: 0.42, rpe: 8.5, setId: 'set_vel_220' })
  })`, sandbox);

  assert.strictEqual(candResults.tooEasy, null, 'RPE < 7.5 weight jump must not fire auto-PR');
  assert.ok(candResults.weightPr && candResults.weightPr.prType === 'weight', 'Weight PR candidate must trigger at RPE >= 7.5');
  assert.ok(candResults.velPr && candResults.velPr.prType === 'velocity', 'Velocity PR candidate (+0.08 > +0.03) must trigger');

  // Show HUD then confirm push PR
  vm.runInContext(`
    const c = evaluatePrCandidate({ lift: 'Squat', weight: 225, velocity: 0.37, rpe: 9.0, setId: 'set_pr_225' });
    showPrConfirmHud(c);
  `, sandbox);
  assert.strictEqual(elements['pr-confirm-hud'].getAttribute('aria-hidden'), 'false', '#pr-confirm-hud must open');

  vm.runInContext(`confirmPushPr();`, sandbox);

  assert.strictEqual(pushedEvents.length, 1, 'confirmPushPr must emit workout:pr_pushed');
  assert.strictEqual(pushedEvents[0].weight, 225);
  assert.strictEqual(pushedEvents[0].isPr, true);

  // Check Athlete side updated
  const newSquatPr = vm.runInContext(`prProfile.currentPRs.squat`, sandbox);
  assert.strictEqual(newSquatPr, 225, 'Athlete Squat PR must promote to 225 kg');
  assert.ok(
    elements['athlete-plan-vs-actual-body'].innerHTML.includes('golden-pr-badge'),
    `Athlete Plan vs Actual must stamp .golden-pr-badge; got: ${elements['athlete-plan-vs-actual-body'].innerHTML}`
  );
  assert.ok(
    elements['athlete-plan-vs-actual-body'].innerHTML.includes('225.0 kg'),
    `Athlete Plan vs Actual must show 225.0 kg actual; got: ${elements['athlete-plan-vs-actual-body'].innerHTML}`
  );

  // Check Coach Cockpit side stamped .coach-golden-pr-badge in sets table AND comparison table
  vm.runInContext(`CoachPortal.renderPreparationPanel();`, sandbox);
  assert.ok(
    elements['coach-sets-table-body'].innerHTML.includes('coach-golden-pr-badge'),
    'Coach sets table must stamp .coach-golden-pr-badge'
  );
  assert.ok(
    elements['coach-prep-comparison-body'].innerHTML.includes('coach-golden-pr-badge'),
    `Coach prep comparison body must stamp .coach-golden-pr-badge; got: ${elements['coach-prep-comparison-body'].innerHTML}`
  );
  assert.ok(
    elements['coach-prep-comparison-body'].innerHTML.includes('225.0 kg'),
    `Coach prep comparison body must show 225.0 kg actual; got: ${elements['coach-prep-comparison-body'].innerHTML}`
  );

  // Verify direct comparePlanVsActual accuracy
  const completedSetsSnapshot = vm.runInContext(`workouts[0].sets`, sandbox);
  const cmp = Engine.comparePlanVsActual(wk, completedSetsSnapshot);
  assert.strictEqual(cmp.rows.length, 1);
  assert.strictEqual(cmp.rows[0].actual.loadKg, 225);
  assert.strictEqual(cmp.rows[0].status, 'exceeded');
  assert.strictEqual(cmp.adherencePct, 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Zero Forbidden Hardware Terms Across All Modified / New Source Files
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 4: Forbidden Hardware Terms Audit ---');

runTest('4.1 Zero forbidden hardware terms across all source files', () => {
  const forbidden = ['webble', '100hz', 'esp32', 'imu', 'madgwick', 'bluefy', 'sensor', 'firmware', 'hardware'];
  const filesToScan = [
    'index.html',
    'style.css',
    'coach.css',
    'app.js',
    'coach-portal.js',
    'sync-bus.js',
    'prep-engine.js',
    path.join('scripts', 'build-site.js'),
    path.join('base44', 'actors', 'SquadSession', 'entry.ts'),
    path.join('base44', 'entities', 'athlete-profile.jsonc'),
    path.join('base44', 'entities', 'completed-set.jsonc'),
    path.join('base44', 'entities', 'coach-directive.jsonc'),
    path.join('base44', 'entities', 'training-prep-plan.jsonc'),
    path.join('base44', 'entities', 'planned-workout.jsonc')
  ];

  const violations = [];
  for (const rel of filesToScan) {
    const abs = path.join(ROOT_DIR, rel);
    assert.ok(fs.existsSync(abs), `Required source file missing: ${rel}`);
    const content = fs.readFileSync(abs, 'utf8');
    for (const term of forbidden) {
      const re = new RegExp(`\\b${term}\\b`, 'gi');
      const hits = content.match(re);
      if (hits && hits.length > 0) {
        violations.push(`${rel}: "${term}" (${hits.length}x)`);
      }
    }
  }
  assert.strictEqual(violations.length, 0, `Forbidden hardware terms detected: ${violations.join('; ')}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Phase 4 UI/UX Fixes, Uniform 14px Radius, Tooltips & Case Discipline
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 5: Phase 4 Fixes (Grid Stability, Movable Pills, 14px Radius, Tooltips & Case) ---');

runTest('5.1 Fix 1: switchCoachPanel("live") preserves grid layout and avoids unwanted scroll jumps', () => {
  const coachJsSrc = fs.readFileSync(path.join(ROOT_DIR, 'coach-portal.js'), 'utf8');
  const coachCssSrc = fs.readFileSync(path.join(ROOT_DIR, 'coach.css'), 'utf8');

  // Verify switchCoachPanel('live') never sets inline display='flex'
  const switchMatch = coachJsSrc.match(/function switchCoachPanel\s*\([^)]*\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(switchMatch, 'coach-portal.js must define switchCoachPanel');
  assert.strictEqual(
    /panelLive\.style\.display\s*=\s*['"]flex['"]/.test(switchMatch[0]),
    false,
    'switchCoachPanel must NOT set panelLive.style.display = "flex"'
  );
  assert.ok(
    /syncLivePanelGridColumns\s*\(/.test(switchMatch[0]),
    'switchCoachPanel("live") must call syncLivePanelGridColumns'
  );

  // Verify highlightCoachSectionElement guards vertical scrollIntoView when already visible
  const hlMatch = coachJsSrc.match(/function highlightCoachSectionElement\s*\([^)]*\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(hlMatch, 'coach-portal.js must define highlightCoachSectionElement');
  assert.ok(
    /getBoundingClientRect\s*\(/.test(hlMatch[0]),
    'highlightCoachSectionElement must check getBoundingClientRect before scrolling'
  );

  // Verify widescreen grid rule remains intact in coach.css
  assert.ok(
    /#coach-live-panel\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*300px\s+minmax\(0,\s*1fr\)\s+360px/s.test(coachCssSrc),
    'coach.css must define 3-column desktop grid on #coach-live-panel'
  );

  // Live sandbox test: switchCoachPanel('live') keeps display='' and does not overwrite with 'flex'
  const { sandbox, elements } = createBrowserSandbox();
  sandbox.innerWidth = 1440;
  vm.runInContext(`CoachPortal.initCoachPortal(); CoachPortal.switchMode('coach'); CoachPortal.switchCoachPanel('history'); CoachPortal.switchCoachPanel('live');`, sandbox);
  assert.strictEqual(elements['coach-live-panel'].style.display, '', 'panelLive.style.display must clear to "" when returning to live panel');
});

runTest('5.2 Fix 2: Big cards across Live, History & Preparation have movable pill metadata and dynamic grid columns', () => {
  const indexHtmlSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const coachJsSrc = fs.readFileSync(path.join(ROOT_DIR, 'coach-portal.js'), 'utf8');

  const expectedMovableCardIds = [
    // Live Cockpit (4)
    'coach-squad-overview',
    'coach-active-set-card',
    'coach-feedback-console',
    'coach-sets-history-card',
    // History Panel (3)
    'coach-history-bento-quad',
    'coach-monthly-calendar-card',
    'coach-previous-workouts-card',
    // Preparation Panel (5)
    'coach-prep-factoring-strip',
    'coach-prep-plan-header',
    'coach-prep-macro-card',
    'coach-prep-session-card',
    'coach-prep-comparison-card'
  ];

  for (const id of expectedMovableCardIds) {
    const tagRe = new RegExp(`<(?:section|div)[^>]*id="${id}"[^>]*>`, 'i');
    const tagMatch = indexHtmlSrc.match(tagRe);
    assert.ok(tagMatch, `index.html missing Coach big card #${id}`);
    assert.ok(
      tagMatch[0].includes('data-movable-pill="true"'),
      `Coach card #${id} must carry data-movable-pill="true"`
    );
    assert.ok(
      tagMatch[0].includes('data-pill-group=') && tagMatch[0].includes('data-pill-id='),
      `Coach card #${id} must carry data-pill-group and data-pill-id`
    );
    assert.ok(
      tagMatch[0].includes('draggable="true"'),
      `Coach card #${id} must carry draggable="true"`
    );
  }

  // Verify interactive child drag suppression and grid column sync helper
  assert.ok(coachJsSrc.includes('INTERACTIVE_DRAG_CHILD_SELECTOR'), 'coach-portal.js must guard interactive children from dragging');
  assert.ok(coachJsSrc.includes('getDirectMovablePills'), 'coach-portal.js must isolate nested vs direct movable pill groups');
  assert.ok(coachJsSrc.includes('syncLivePanelGridColumns'), 'coach-portal.js must export/define syncLivePanelGridColumns');

  // Behavioral test: reorder mock Live cards to feedback-console -> squad-overview -> active-set-card -> sets-history-card
  const { sandbox } = createBrowserSandbox();
  sandbox.innerWidth = 1500;
  const computedCols = vm.runInContext(`
    const mk = (domId, pillId) => ({
      id: domId,
      attributes: { 'data-movable-pill': 'true', 'data-pill-id': pillId },
      getAttribute(k) { return this.attributes[k] || null; }
    });
    const fakePanel = {
      id: 'coach-live-panel',
      children: [
        mk('coach-feedback-console', 'feedback-console'),
        mk('coach-squad-overview', 'squad-overview'),
        mk('coach-active-set-card', 'active-set-card'),
        mk('coach-sets-history-card', 'sets-history-card')
      ],
      style: { gridTemplateColumns: '' }
    };
    CoachPortal.syncLivePanelGridColumns(fakePanel);
    fakePanel.style.gridTemplateColumns;
  `, sandbox);
  assert.strictEqual(
    computedCols,
    '360px 300px minmax(0, 1fr)',
    `Expected reordered desktop 3-col tracks "360px 300px minmax(0, 1fr)", got "${computedCols}"`
  );

  // Verify narrower desktop band (1150..1440) tracks scale cleanly without overflow
  sandbox.innerWidth = 1280;
  const midCols = vm.runInContext(`
    const mk2 = (domId, pillId) => ({
      id: domId,
      attributes: { 'data-movable-pill': 'true', 'data-pill-id': pillId },
      getAttribute(k) { return this.attributes[k] || null; }
    });
    const fakePanel2 = {
      id: 'coach-live-panel',
      children: [
        mk2('coach-active-set-card', 'active-set-card'),
        mk2('coach-feedback-console', 'feedback-console'),
        mk2('coach-squad-overview', 'squad-overview'),
        mk2('coach-sets-history-card', 'sets-history-card')
      ],
      style: { gridTemplateColumns: '' }
    };
    CoachPortal.syncLivePanelGridColumns(fakePanel2);
    fakePanel2.style.gridTemplateColumns;
  `, sandbox);
  assert.strictEqual(
    midCols,
    'minmax(0, 1fr) 304px 248px',
    `Expected 1280px reordered tracks "minmax(0, 1fr) 304px 248px", got "${midCols}"`
  );
});

runTest('5.3 Fix 3: Uniform 14px corner radius across Coach & Athlete styles with zero asymmetric 7px overrides', () => {
  const coachCssSrc = fs.readFileSync(path.join(ROOT_DIR, 'coach.css'), 'utf8');
  const styleCssSrc = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  const athleteFxCssSrc = fs.readFileSync(path.join(ROOT_DIR, 'athlete-fx.css'), 'utf8');
  const cueHudCssSrc = fs.readFileSync(path.join(ROOT_DIR, 'coach-cue-hud.css'), 'utf8');

  assert.ok(/--coach-radius-pill:\s*14px/.test(coachCssSrc), 'coach.css must set --coach-radius-pill: 14px');
  assert.ok(/--eros-rect-pill-radius:\s*14px/.test(styleCssSrc), 'style.css must set --eros-rect-pill-radius: 14px');

  // Verify zero asymmetric border-top-right-radius: 7px or old 999px capsule radii on Coach/pill classes
  assert.strictEqual(/border-top-right-radius:\s*7px/i.test(coachCssSrc + styleCssSrc), false, 'Must have zero asymmetric 7px corner overrides on .pill-move-hint');
  assert.strictEqual(/border-radius:\s*9999px/i.test(cueHudCssSrc), false, 'coach-cue-hud.css must use uniform 14px instead of 9999px');
  assert.ok(/\.coach-pill-btn[\s\S]*?border-radius:\s*14px/.test(coachCssSrc), '.coach-pill-btn must use border-radius: 14px');
  assert.ok(/\.vel-zone-badge[\s\S]*?border-radius:\s*14px/.test(athleteFxCssSrc), '.vel-zone-badge must use border-radius: 14px');
});

runTest('5.4 Fix 4: Preparation hover tooltip dictionary (#eros-prep-tooltip-card) covers Athlete & Coach with descriptions + tips', () => {
  const indexHtmlSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const styleCssSrc = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  const appJsSrc = fs.readFileSync(path.join(ROOT_DIR, 'app.js'), 'utf8');

  // Verify embossed clean-slate tooltip DOM + CSS
  assert.ok(indexHtmlSrc.includes('id="eros-prep-tooltip-card"'), 'index.html must include #eros-prep-tooltip-card');
  assert.ok(appJsSrc.includes('eros-tooltip-slash'), 'Tooltip renderer must render embossed angled slash element');
  assert.ok(/\.eros-tooltip-slash[\s\S]*?skewX\(-18deg\)/.test(styleCssSrc), 'style.css must style .eros-tooltip-slash with diagonal skew');
  assert.ok(/\.eros-prep-tooltip-card[\s\S]*?border-radius:\s*14px/.test(styleCssSrc), 'Tooltip card must use 14px Matte Obsidian corners');

  // Evaluate PREP_TOOLTIP_DICTIONARY & selector map inside sandbox
  const { sandbox } = createBrowserSandbox();
  const { dict, selMap } = vm.runInContext('({ dict: PREP_TOOLTIP_DICTIONARY, selMap: PREP_TOOLTIP_SELECTOR_MAP })', sandbox);
  const dictKeys = Object.keys(dict);
  assert.ok(dictKeys.length >= 50, `Expected comprehensive PREP_TOOLTIP_DICTIONARY (>= 50 keys), got ${dictKeys.length}`);

  for (const k of dictKeys) {
    const entry = dict[k];
    assert.ok(entry && typeof entry.title === 'string' && entry.title.trim().length > 2, `Tooltip key "${k}" missing title`);
    assert.ok(typeof entry.category === 'string' && entry.category.trim().length > 1, `Tooltip key "${k}" missing category`);
    assert.ok(typeof entry.description === 'string' && entry.description.trim().length > 10, `Tooltip key "${k}" missing plain-English description`);
    assert.ok(typeof entry.tip === 'string' && entry.tip.trim().length > 5, `Tooltip key "${k}" missing practical tip`);
  }

  // Every data-prep-tooltip-key in index.html & app.js and selector map must resolve cleanly in PREP_TOOLTIP_DICTIONARY
  const htmlKeys = Array.from(indexHtmlSrc.matchAll(/data-prep-tooltip-key="([^"]+)"/g)).map(m => m[1]);
  const appKeys = Array.from(appJsSrc.matchAll(/data-prep-tooltip-key="([^"]+)"/g)).map(m => m[1]);
  const mapKeys = selMap.map(pair => pair[1]);
  const referenced = new Set([...htmlKeys, ...appKeys, ...mapKeys]);

  for (const rk of referenced) {
    assert.ok(Object.prototype.hasOwnProperty.call(dict, rk), `Tooltip key "${rk}" referenced in DOM/JS is missing from PREP_TOOLTIP_DICTIONARY`);
  }

  // Confirm both #tab-set AND #coach-preparation-panel carry annotated tooltip triggers
  const tabSetSection = indexHtmlSrc.slice(indexHtmlSrc.indexOf('id="tab-set"'), indexHtmlSrc.indexOf('id="tab-history"'));
  const coachPrepIdx = indexHtmlSrc.indexOf('id="coach-preparation-panel"');
  const coachPrepEnd = indexHtmlSrc.indexOf('<!-- Orbital Quick-Jump', coachPrepIdx);
  const coachPrepSection = indexHtmlSrc.slice(coachPrepIdx, coachPrepEnd > coachPrepIdx ? coachPrepEnd : coachPrepIdx + 25000);
  assert.ok(/data-prep-tooltip-key="/.test(tabSetSection), 'Athlete Preparation (#tab-set) must declare data-prep-tooltip-key triggers');
  assert.ok(/data-prep-tooltip-key="/.test(coachPrepSection), 'Coach Preparation (#coach-preparation-panel) must declare data-prep-tooltip-key triggers');

  // Verify escapeHtml() guards tooltip card innerHTML interpolation
  assert.ok(/showPrepTooltipForTarget[\s\S]*?escapeHtml\(entry\.title\)/.test(appJsSrc), 'Tooltip renderer must escapeHtml entry fields');
});

runTest('5.5 Fix 5: Zero text-transform: uppercase in coach.css and zero unexpected ALL-CAPS words in Coach Cockpit', () => {
  const indexHtmlSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const coachCssSrc = fs.readFileSync(path.join(ROOT_DIR, 'coach.css'), 'utf8');
  const coachJsSrc = fs.readFileSync(path.join(ROOT_DIR, 'coach-portal.js'), 'utf8');

  assert.strictEqual(/text-transform\s*:\s*uppercase/i.test(coachCssSrc), false, 'coach.css must contain zero text-transform: uppercase rules');

  // Scan visible text inside #view-coach for disallowed purely uppercase words
  const allowedAcronyms = new Set([
    'RPE', 'RIR', '1RM', 'E1RM', 'SBD', 'PR', 'PRS', 'DOTS', 'IPF', 'GL',
    'ROM', 'MVT', 'CSV', 'JSON', 'KG', 'MCV', 'PV', 'SQ', 'BP', 'DL',
    'ISO', 'QR', 'TTL', 'EROS', 'INIT', 'AMRAP', 'VBT', 'PA', 'OK', 'ID'
  ]);
  const coachStart = indexHtmlSrc.indexOf('id="view-coach"');
  const coachEnd = indexHtmlSrc.indexOf('id="pr-confirm-hud"');
  const coachHtmlText = indexHtmlSrc
    .slice(coachStart, coachEnd)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  const badCaps = Array.from(new Set(coachHtmlText.match(/\b[A-Z]{2,}\b/g) || []))
    .filter(w => !allowedAcronyms.has(w));
  assert.deepStrictEqual(badCaps, [], `Unexpected ALL-CAPS words in #view-coach HTML: ${badCaps.join(', ')}`);

  // Verify Title/Sentence Case returns from Coach helpers
  assert.ok(/return 'Mode: Vel';/.test(coachJsSrc) || /'Mode: Vel'\s*:\s*'Mode: Path'/.test(coachJsSrc), 'Coach canvas mode toggle must use Title Case');
  assert.ok(coachJsSrc.includes('PR &bull; Gold'), 'goldenPrBadgeHtml must render "PR • Gold" rather than "PR • GOLD"');
});

Promise.resolve().then(() => {
  setTimeout(() => {
    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log(`║ PREPARATION SYSTEM SUITE: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}           ║`);
    console.log('╚════════════════════════════════════════════════════════════════════════╝');
    if (failedTests > 0) process.exit(1);
    process.exit(0);
  }, 50);
});
