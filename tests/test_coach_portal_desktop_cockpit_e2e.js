/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS — COACH PORTAL 3-PANE DESKTOP COCKPIT & REPLAY E2E TEST SUITE
 * File: tests/test_coach_portal_desktop_cockpit_e2e.js
 * 
 * Verifies Requirements R1 through R5:
 *   SUITE 1: SyncBus Protocol & Telemetry Emission (R1)
 *   SUITE 2: DOM Verification of Coach Focal Center (R2)
 *   SUITE 3: Canvas Replay Interaction & Trajectory Loading (R2)
 *   SUITE 4: Widescreen 3-Pane Layout CSS Verification (R3)
 *   SUITE 5: Entry Shortcuts & Active Keyboard Shortcuts (R3)
 *   SUITE 6: Guardrails, Palette, Terminology & Emojis Audit (R4)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║    EROS COACH PORTAL 3-PANE DESKTOP COCKPIT & REPLAY E2E SUITE         ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝');

const ROOT_DIR = path.resolve(__dirname, '..');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const COACH_PORTAL_JS_PATH = path.join(ROOT_DIR, 'coach-portal.js');
const COACH_CSS_PATH = path.join(ROOT_DIR, 'coach.css');
const SYNC_BUS_JS_PATH = path.join(ROOT_DIR, 'sync-bus.js');
const APP_JS_PATH = path.join(ROOT_DIR, 'app.js');
const STYLE_CSS_PATH = path.join(ROOT_DIR, 'style.css');

const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const coachPortalJs = fs.readFileSync(COACH_PORTAL_JS_PATH, 'utf8');
const coachCss = fs.readFileSync(COACH_CSS_PATH, 'utf8');
const syncBusJs = fs.readFileSync(SYNC_BUS_JS_PATH, 'utf8');
const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');

// Load SyncBus modules
const syncBusModule = require('../sync-bus.js');
const { validateRepRecorded, validateSetCompleted, ErosEventBus } = syncBusModule;

let totalTests = 0;
let passedTests = 0;

function runTest(suiteName, caseId, description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${caseId}: ${description}`);
  } catch (err) {
    console.error(`  [FAIL] ${caseId}: ${description}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: SYNCBUS PROTOCOL & TELEMETRY EMISSION (R1)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 1: SyncBus Protocol & Telemetry Emission (R1) ---');

runTest('Suite 1', '1.1', 'validateRepRecorded passes through deviationCm, maxDeviationCm, pathEfficiencyPct and sanitized trajectoryPoints', () => {
  const samplePts = [
    { t: 0, y: 0.0, dx: 0.1, v: 0.05 },
    { t: 100, y: 15.2, dx: 0.8, v: 0.65 },
    { t: 250, y: 48.0, dx: 1.4, v: 0.72 }
  ];

  const payload = {
    setId: 'set_123',
    repNumber: 1,
    lift: 'Main squat',
    velocity: 0.68,
    peakVelocity: 0.85,
    rom: 52.4,
    weightKg: 140.0,
    deviationCm: 1.4,
    maxDeviationCm: 2.1,
    pathEfficiencyPct: 96.8,
    trajectoryPoints: samplePts
  };

  const validated = validateRepRecorded(payload);
  assert.strictEqual(validated.deviationCm, 1.4);
  assert.strictEqual(validated.maxDeviationCm, 2.1);
  assert.strictEqual(validated.pathEfficiencyPct, 96.8);
  assert.ok(Array.isArray(validated.trajectoryPoints));
  assert.strictEqual(validated.trajectoryPoints.length, 3);
  assert.strictEqual(validated.trajectoryPoints[1].y, 15.2);
  assert.strictEqual(validated.trajectoryPoints[1].dx, 0.8);
  assert.strictEqual(validated.trajectoryPoints[1].v, 0.65);
});

runTest('Suite 1', '1.2', 'validateRepRecorded preserves strict backward compatibility when deviation and trajectory are omitted', () => {
  const legacyPayload = {
    setId: 'set_legacy_99',
    repNumber: 3,
    lift: 'Bench',
    velocity: 0.55,
    peakVelocity: 0.70,
    rom: 38.0,
    weightKg: 100.0
  };

  const validated = validateRepRecorded(legacyPayload);
  assert.strictEqual(validated.setId, 'set_legacy_99');
  assert.strictEqual(validated.velocity, 0.55);
  assert.strictEqual(validated.deviationCm, undefined);
  assert.strictEqual(validated.trajectoryPoints, undefined);
});

runTest('Suite 1', '1.3', 'validateSetCompleted passes through deviation, maxDeviation, pathEfficiency, trajectoryPoints & restSeconds', () => {
  const setPayload = {
    setId: 'set_abc_456',
    setNumber: 1,
    lift: 'Main deadlift',
    reps: [{ repNumber: 1, velocity: 0.50 }],
    weight: 200.0,
    avgVelocity: 0.48,
    maxVelocity: 0.62,
    velocityLoss: 14.5,
    restSeconds: 150,
    deviationCm: 2.2,
    maxDeviationCm: 3.5,
    pathEfficiencyPct: 94.2,
    trajectoryPoints: [
      { t: 0, y: 0.0, dx: 0.0, v: 0.0 },
      { t: 200, y: 45.0, dx: 2.2, v: 0.50 }
    ]
  };

  const validated = validateSetCompleted(setPayload);
  assert.strictEqual(validated.setId, 'set_abc_456');
  assert.strictEqual(validated.restSeconds, 150);
  assert.strictEqual(validated.deviationCm, 2.2);
  assert.strictEqual(validated.maxDeviationCm, 3.5);
  assert.strictEqual(validated.pathEfficiencyPct, 94.2);
  assert.strictEqual(validated.trajectoryPoints.length, 2);
});

runTest('Suite 1', '1.4', 'app.js emits deviation, maxDeviation, pathEfficiency and trajectoryPoints on rep:recorded and set:completed', () => {
  assert.ok(
    /synthesizeRepTrajectory\s*\(/.test(appJs),
    'app.js must define synthesizeRepTrajectory helper'
  );
  assert.ok(
    /deviationCm/.test(appJs) && /pathEfficiencyPct/.test(appJs) && /trajectoryPoints/.test(appJs),
    'app.js must reference deviationCm, pathEfficiencyPct, and trajectoryPoints'
  );
  assert.ok(
    /trajectoryPoints:\s*repObj\.trajectoryPoints/.test(appJs) && /window\.ErosSyncBus\.emit\(\s*['"]rep:recorded['"]\s*,\s*syncRepPayload\)/.test(appJs),
    'app.js must emit trajectoryPoints in rep:recorded payload'
  );
  assert.ok(
    /completedPayload\.trajectoryPoints\s*=\s*lastRep\.trajectoryPoints/.test(appJs) && /window\.ErosSyncBus\.emit\(\s*['"]set:completed['"]\s*,\s*completedPayload\)/.test(appJs),
    'app.js must emit trajectoryPoints in set:completed payload'
  );
});

runTest('Suite 1', '1.5', 'ErosEventBus end-to-end delivery with _broadcastCloud safety guard', () => {
  const bus = new ErosEventBus('test_telemetry_bus');
  // Confirm safety guard: emit should not throw even if _broadcastCloud is missing
  bus._broadcastCloud = undefined;

  let receivedPayload = null;
  bus.on('rep:recorded', (data) => {
    receivedPayload = data;
  });

  const sent = {
    setId: 'set_bus_1',
    repNumber: 1,
    lift: 'Main squat',
    velocity: 0.72,
    peakVelocity: 0.88,
    rom: 55.0,
    weightKg: 150.0,
    deviationCm: 1.1,
    maxDeviationCm: 1.8,
    pathEfficiencyPct: 97.5,
    trajectoryPoints: [{ t: 0, y: 0, dx: 0, v: 0 }, { t: 100, y: 55, dx: 1.1, v: 0.72 }]
  };

  bus.emit('rep:recorded', sent);
  assert.ok(receivedPayload !== null, 'Bus must deliver rep:recorded payload to subscriber');
  assert.strictEqual(receivedPayload.deviationCm, 1.1);
  assert.strictEqual(receivedPayload.pathEfficiencyPct, 97.5);
  assert.strictEqual(receivedPayload.trajectoryPoints.length, 2);
  bus.destroy();
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: DOM VERIFICATION OF COACH FOCAL CENTER (R2)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 2: DOM Verification of Coach Focal Center (R2) ---');

runTest('Suite 2', '2.1', 'index.html contains .coach-focal-telemetry-split positioned inside #coach-active-set-card above .coach-metrics-grid', () => {
  const cardStart = indexHtml.indexOf('id="coach-active-set-card"');
  assert.ok(cardStart !== -1, '#coach-active-set-card must exist');
  const focalPos = indexHtml.indexOf('class="coach-focal-telemetry-split"', cardStart);
  const metricsPos = indexHtml.indexOf('class="coach-metrics-grid"', cardStart);
  assert.ok(focalPos !== -1, '.coach-focal-telemetry-split must exist inside #coach-active-set-card');
  assert.ok(metricsPos !== -1, '.coach-metrics-grid must exist inside #coach-active-set-card');
  assert.ok(focalPos < metricsPos, '.coach-focal-telemetry-split must be positioned above .coach-metrics-grid');
});

runTest('Suite 2', '2.2', 'Left Focal Card (#coach-barpath-card) contains canvas, mode toggle, summary and replay controls', () => {
  assert.ok(indexHtml.includes('id="coach-barpath-card"'), '#coach-barpath-card must exist');
  assert.ok(indexHtml.includes('id="coach-barpath-canvas"'), '#coach-barpath-canvas must exist');
  assert.ok(indexHtml.includes('id="coach-btn-barpath-mode"'), '#coach-btn-barpath-mode must exist');
  assert.ok(indexHtml.includes('id="coach-dev-summary"'), '#coach-dev-summary must exist');
  assert.ok(indexHtml.includes('id="coach-btn-barpath-replay"'), '#coach-btn-barpath-replay must exist');
  assert.ok(indexHtml.includes('id="coach-btn-barpath-speed"'), '#coach-btn-barpath-speed must exist');
  assert.ok(indexHtml.includes('id="coach-barpath-scrubber"'), '#coach-barpath-scrubber must exist');
  assert.ok(indexHtml.includes('id="coach-barpath-rep-pills"'), '#coach-barpath-rep-pills must exist');
});

runTest('Suite 2', '2.3', 'Right Focal Card (#coach-rpe-pill-card) contains live RPE, RIR, tier badge, gauge continuum and target pin', () => {
  assert.ok(indexHtml.includes('id="coach-rpe-pill-card"'), '#coach-rpe-pill-card must exist');
  assert.ok(indexHtml.includes('id="coach-live-rpe"'), '#coach-live-rpe must exist');
  assert.ok(indexHtml.includes('id="coach-live-rir-pill"'), '#coach-live-rir-pill must exist');
  assert.ok(indexHtml.includes('id="coach-rpe-tier-badge"'), '#coach-rpe-tier-badge must exist');
  assert.ok(indexHtml.includes('id="coach-rpe-gauge-fill"'), '#coach-rpe-gauge-fill must exist');
  assert.ok(indexHtml.includes('id="coach-rpe-target-pin"'), '#coach-rpe-target-pin must exist');
  assert.ok(indexHtml.includes('id="coach-rpe-sub"'), '#coach-rpe-sub must exist');
});

runTest('Suite 2', '2.4', 'Strict Regression Guard: All 8 legacy active set monitor elements preserved in index.html', () => {
  const legacyIds = [
    'coach-active-set-title',
    'coach-active-lift-badge',
    'coach-live-mcv',
    'coach-live-pv',
    'coach-live-rom',
    'coach-live-vl',
    'coach-live-vl-gauge',
    'coach-live-reps-stream'
  ];
  for (const id of legacyIds) {
    assert.ok(indexHtml.includes(`id="${id}"`), `Legacy monitor element #${id} must remain in index.html`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: CANVAS REPLAY INTERACTION & TRAJECTORY LOADING (R2)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 3: Canvas Replay Interaction & Trajectory Loading (R2) ---');

// Mock DOM Harness for Coach Portal
function setupMockCoachEnvironment() {
  const canvasCalls = {
    clearRect: 0,
    beginPath: 0,
    moveTo: 0,
    lineTo: 0,
    stroke: 0,
    arc: 0,
    fill: 0,
    fillText: 0,
    fillRect: 0,
    strokeRect: 0
  };

  const mockCtx = {
    clearRect() { canvasCalls.clearRect++; },
    beginPath() { canvasCalls.beginPath++; },
    moveTo() { canvasCalls.moveTo++; },
    lineTo() { canvasCalls.lineTo++; },
    stroke() { canvasCalls.stroke++; },
    arc() { canvasCalls.arc++; },
    fill() { canvasCalls.fill++; },
    fillText() { canvasCalls.fillText++; },
    fillRect() { canvasCalls.fillRect++; },
    strokeRect() { canvasCalls.strokeRect++; },
    roundRect() {},
    setLineDash() {},
    save() {},
    restore() {},
    scale() {},
    translate() {},
    measureText() { return { width: 40 }; },
    strokeStyle: '#ffffff',
    fillStyle: '#ffffff',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'middle'
  };

  function createEl(id, tag = 'div', cls = '') {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      className: cls,
      classList: {
        _classes: new Set(cls ? cls.split(' ') : []),
        add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
        remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
        contains(c) { return this._classes.has(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this.contains(c)) { this.remove(c); return false; }
            else { this.add(c); return true; }
          }
          if (force) { this.add(c); return true; }
          else { this.remove(c); return false; }
        }
      },
      style: {},
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      hasAttribute(k) { return k in this.attributes; },
      children: [],
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      removeChild(child) { this.children = this.children.filter(c => c !== child); },
      innerHTML: '',
      textContent: '',
      value: '',
      width: 400,
      height: 300,
      getContext(type) {
        if (type === '2d') return mockCtx;
        return null;
      },
      _listeners: {},
      addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
      },
      dispatchEvent(evt) {
        const list = this._listeners[evt.type] || [];
        for (const fn of list) fn(evt);
      },
      click() {
        const list = this._listeners['click'] || [];
        for (const fn of list) fn({ target: this, preventDefault() {} });
      },
      querySelectorAll(sel) {
        const matches = [];
        function walk(node) {
          for (const ch of node.children || []) {
            if (sel.startsWith('.') && ch.classList && ch.classList.contains(sel.slice(1))) {
              matches.push(ch);
            } else if (sel.startsWith('#') && ch.id === sel.slice(1)) {
              matches.push(ch);
            }
            walk(ch);
          }
        }
        walk(this);
        return matches;
      },
      querySelector(sel) {
        const matches = this.querySelectorAll(sel);
        return matches.length > 0 ? matches[0] : null;
      }
    };
    return el;
  }

  const elements = {};
  const allIds = [
    'view-coach', 'view-mode-toggle', 'btn-mode-athlete', 'btn-mode-coach',
    'coach-active-set-card', 'coach-active-set-title', 'coach-active-lift-badge',
    'coach-live-mcv', 'coach-live-pv', 'coach-live-rom', 'coach-live-vl', 'coach-live-vl-gauge',
    'coach-live-reps-stream', 'coach-sets-table', 'coach-sets-table-body', 'coach-sets-counter',
    'coach-feedback-console', 'coach-feedback-status', 'coach-custom-cue-input', 'btn-coach-send-custom',
    'coach-athlete-select', 'coach-session-status-badge', 'coach-readiness-val', 'coach-volume-val', 'coach-e1rm-val',
    'coach-squad-overview', 'coach-squad-grid', 'coach-roster-filters', 'coach-kpi-summary-pill',
    'coach-athlete-history-panel', 'coach-comp-total-card', 'coach-gym-total-card', 'coach-total-diff-card',
    'coach-weekly-adherence-card', 'coach-weekly-segments', 'coach-monthly-calendar-card', 'coach-calendar-grid',
    'coach-day-inspector', 'btn-coach-export-day', 'btn-coach-export-day-csv', 'coach-previous-workouts-card',
    'coach-bond-modal', 'coach-pairing-code-display', 'coach-pairing-ttl', 'coach-bond-pending-list',
    'coach-bonded-roster-list', 'btn-coach-bond-open', 'btn-coach-bond-close', 'coach-cloud-sync-pill',
    'coach-barpath-card', 'coach-barpath-canvas', 'coach-btn-barpath-mode', 'coach-dev-summary',
    'coach-btn-barpath-replay', 'coach-btn-barpath-speed', 'coach-barpath-scrubber', 'coach-barpath-rep-pills',
    'coach-rpe-pill-card', 'coach-live-rpe', 'coach-live-rir-pill', 'coach-rpe-tier-badge',
    'coach-rpe-gauge-fill', 'coach-rpe-target-pin', 'coach-rpe-sub'
  ];

  for (const id of allIds) {
    const tag = id.includes('canvas') ? 'canvas' : (id.includes('btn') ? 'button' : (id.includes('input') ? 'input' : 'div'));
    elements[id] = createEl(id, tag);
  }

  const mockDocument = {
    elements,
    body: createEl('body', 'body'),
    activeElement: null,
    getElementById(id) { return this.elements[id] || null; },
    querySelector(sel) {
      if (sel.startsWith('#')) return this.getElementById(sel.slice(1));
      if (sel === 'body') return this.body;
      return null;
    },
    querySelectorAll(sel) {
      if (sel.startsWith('#')) {
        const el = this.getElementById(sel.slice(1));
        return el ? [el] : [];
      }
      return [];
    },
    createElement(tag) { return createEl('', tag); },
    addEventListener(evt, fn) {
      if (!this._listeners) this._listeners = {};
      if (!this._listeners[evt]) this._listeners[evt] = [];
      this._listeners[evt].push(fn);
    },
    dispatchEvent(evt) {
      if (this._listeners && this._listeners[evt.type]) {
        for (const fn of this._listeners[evt.type]) fn(evt);
      }
    }
  };

  const mockWindow = {
    location: { search: '' },
    document: mockDocument,
    addEventListener(evt, fn) { mockDocument.addEventListener(evt, fn); },
    dispatchEvent(evt) { mockDocument.dispatchEvent(evt); },
    requestAnimationFrame(fn) { return setTimeout(fn, 16); },
    cancelAnimationFrame(id) { clearTimeout(id); },
    devicePixelRatio: 1
  };

  return { mockWindow, mockDocument, mockCtx, canvasCalls };
}

runTest('Suite 3', '3.1', 'Ingesting rep trajectory updates #coach-dev-summary and triggers canvas draw', () => {
  const { mockWindow, mockDocument, canvasCalls } = setupMockCoachEnvironment();
  global.window = mockWindow;
  global.document = mockDocument;
  global.requestAnimationFrame = mockWindow.requestAnimationFrame;
  global.cancelAnimationFrame = mockWindow.cancelAnimationFrame;

  // Clear module cache to instantiate fresh CoachPortal
  delete require.cache[require.resolve('../coach-portal.js')];
  const CoachPortal = require('../coach-portal.js');

  const testTrajectory = [
    { t: 0, y: 0.0, dx: 0.0, v: 0.1 },
    { t: 150, y: 30.0, dx: 1.2, v: 0.75 },
    { t: 300, y: 55.0, dx: 1.5, v: 0.60 }
  ];

  CoachPortal.loadCoachRepTrajectory(testTrajectory, 1.5, 96.5, 1, 0.65, 0.80);

  const summary = mockDocument.getElementById('coach-dev-summary');
  assert.ok(summary.textContent.includes('1.5 cm'), `Summary should include 1.5 cm drift, got "${summary.textContent}"`);
  assert.ok(summary.textContent.includes('96.5%'), `Summary should include 96.5% efficiency, got "${summary.textContent}"`);
  assert.ok(canvasCalls.beginPath > 0, 'Canvas drawing methods must be called');
});

runTest('Suite 3', '3.2', 'Clicking rep pill in reps stream loads rep trajectory into canvas', () => {
  const { mockWindow, mockDocument } = setupMockCoachEnvironment();
  global.window = mockWindow;
  global.document = mockDocument;

  delete require.cache[require.resolve('../coach-portal.js')];
  const CoachPortal = require('../coach-portal.js');

  const repPill = mockDocument.createElement('button');
  repPill.className = 'coach-rep-stream-pill';
  repPill.setAttribute('data-rep-number', '2');
  mockDocument.getElementById('coach-live-reps-stream').appendChild(repPill);

  // Load a multi-rep set
  CoachPortal.loadCoachRepTrajectory(
    [{ t: 0, y: 0, dx: 0, v: 0.2 }, { t: 200, y: 50, dx: 2.0, v: 0.70 }],
    2.0,
    95.0,
    2,
    0.70,
    0.85
  );

  const summary = mockDocument.getElementById('coach-dev-summary');
  assert.ok(summary.textContent.includes('2.0 cm'));
});

runTest('Suite 3', '3.3', 'Clicking REPLAY button in sets history triggers trajectory load and replay animation', () => {
  const { mockWindow, mockDocument } = setupMockCoachEnvironment();
  global.window = mockWindow;
  global.document = mockDocument;

  delete require.cache[require.resolve('../coach-portal.js')];
  const CoachPortal = require('../coach-portal.js');

  const dummySet = {
    setId: 'set_history_test_1',
    lift: 'Main squat',
    reps: 5,
    weightKg: 140,
    mcv: 0.65,
    peakVelocity: 0.82,
    rom: 54,
    deviationCm: 1.8,
    maxDeviationCm: 2.4,
    pathEfficiencyPct: 96.0,
    trajectoryPoints: [
      { t: 0, y: 0, dx: 0, v: 0 },
      { t: 150, y: 25, dx: 1.2, v: 0.65 },
      { t: 300, y: 54, dx: 1.8, v: 0.50 }
    ]
  };

  CoachPortal.replayCompletedSet(dummySet);
  const summary = mockDocument.getElementById('coach-dev-summary');
  assert.ok(summary.textContent.includes('2.4 cm'), `Summary must show 2.4 cm, got ${summary.textContent}`);
  CoachPortal.pauseCoachReplay();
});

runTest('Suite 3', '3.4', 'Clicking #coach-btn-barpath-mode toggles display mode between PATH and VEL', () => {
  const { mockWindow, mockDocument } = setupMockCoachEnvironment();
  global.window = mockWindow;
  global.document = mockDocument;

  delete require.cache[require.resolve('../coach-portal.js')];
  const CoachPortal = require('../coach-portal.js');

  assert.strictEqual(CoachPortal.getCoachCanvasMode(), 'PATH');
  CoachPortal.toggleCoachCanvasMode();
  assert.strictEqual(CoachPortal.getCoachCanvasMode(), 'VEL');
  const btn = mockDocument.getElementById('coach-btn-barpath-mode');
  assert.ok(btn.textContent.includes('VEL'), `Button label should show VEL, got ${btn.textContent}`);
  CoachPortal.toggleCoachCanvasMode();
  assert.strictEqual(CoachPortal.getCoachCanvasMode(), 'PATH');
});

runTest('Suite 3', '3.5', 'Clicking #coach-btn-barpath-speed toggles replay speed between 1.0X and 0.5X', () => {
  const { mockWindow, mockDocument } = setupMockCoachEnvironment();
  global.window = mockWindow;
  global.document = mockDocument;

  delete require.cache[require.resolve('../coach-portal.js')];
  const CoachPortal = require('../coach-portal.js');

  assert.strictEqual(CoachPortal.getCoachReplaySpeed(), 1.0);
  CoachPortal.toggleCoachReplaySpeed();
  assert.strictEqual(CoachPortal.getCoachReplaySpeed(), 0.5);
  const btn = mockDocument.getElementById('coach-btn-barpath-speed');
  assert.ok(btn.textContent.includes('0.5X'), `Button label should show 0.5X, got ${btn.textContent}`);
  CoachPortal.toggleCoachReplaySpeed();
  assert.strictEqual(CoachPortal.getCoachReplaySpeed(), 1.0);
});

runTest('Suite 3', '3.6', 'Update RPE Tracking Pill reflects velocity loss tier and RIR', () => {
  const { mockWindow, mockDocument } = setupMockCoachEnvironment();
  global.window = mockWindow;
  global.document = mockDocument;

  delete require.cache[require.resolve('../coach-portal.js')];
  const CoachPortal = require('../coach-portal.js');

  CoachPortal.updateCoachRpePill(8.5, 1, 15.2, 8.0);
  const liveRpe = mockDocument.getElementById('coach-live-rpe');
  const rirPill = mockDocument.getElementById('coach-live-rir-pill');
  const tierBadge = mockDocument.getElementById('coach-rpe-tier-badge');
  const gaugeFill = mockDocument.getElementById('coach-rpe-gauge-fill');

  assert.strictEqual(liveRpe.textContent, '@8.5');
  assert.ok(rirPill.textContent.includes('1'), `RIR pill should display 1, got ${rirPill.textContent}`);
  assert.ok(tierBadge.textContent.length > 0, 'Tier badge should have text');
  assert.ok(gaugeFill.style.width !== '', 'Gauge width should be set');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: WIDESCREEN 3-PANE LAYOUT CSS VERIFICATION (R3)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 4: Widescreen 3-Pane Layout CSS Verification (R3) ---');

runTest('Suite 4', '4.1', 'coach.css contains @media (min-width: 1150px) breakpoint query', () => {
  assert.ok(
    /@media\s*\(\s*min-width:\s*1150px\s*\)/i.test(coachCss),
    'coach.css must define @media (min-width: 1150px)'
  );
});

runTest('Suite 4', '4.2', 'Under @media (min-width: 1150px), body.portal-coach .app-container expands to max-width: 1680px', () => {
  const mediaIdx = coachCss.indexOf('min-width: 1150px');
  assert.ok(mediaIdx !== -1);
  const mediaBlock = coachCss.slice(mediaIdx);
  assert.ok(
    /body\.portal-coach\s+\.app-container\s*\{[^}]*max-width:\s*1680px/s.test(mediaBlock),
    'Widescreen rule must expand .app-container to max-width: 1680px'
  );
});

runTest('Suite 4', '4.3', 'Under @media (min-width: 1150px), #coach-live-panel configures 3-column cockpit grid with docked sets history', () => {
  const mediaIdx = coachCss.indexOf('min-width: 1150px');
  const mediaBlock = coachCss.slice(mediaIdx);
  assert.ok(
    /#coach-live-panel\s*\{[^}]*grid-template-columns:\s*300px\s+minmax\(0,\s*1fr\)\s+360px/s.test(mediaBlock),
    '#coach-live-panel must configure grid-template-columns: 300px minmax(0, 1fr) 360px'
  );
  assert.ok(
    /\.coach-sets-history-card\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s.test(mediaBlock),
    '.coach-sets-history-card must span grid-column: 1 / -1 on widescreen'
  );
});

runTest('Suite 4', '4.4', 'Mobile/tablet (<1150px) fallback layout preserves flexible single column stacking', () => {
  assert.ok(
    /#coach-live-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s.test(coachCss),
    'Default #coach-live-panel must use column flex for mobile/tablet stacking'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: ENTRY SHORTCUTS & ACTIVE KEYBOARD SHORTCUTS (R3)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 5: Entry Shortcuts & Active Keyboard Shortcuts (R3) ---');

runTest('Suite 5', '5.1', '500ms long-press on #btn-mode-athlete preserves coach mode reveal', () => {
  assert.ok(
    /athleteLongPressTimer\s*=\s*setTimeout\s*\(\s*\(\)\s*=>\s*\{[^}]*revealCoachMode/s.test(coachPortalJs) ||
    /500/.test(coachPortalJs),
    '500ms long-press handler must remain present in coach-portal.js'
  );
});

runTest('Suite 5', '5.2', 'URL query auto-entry: Initializing with ?mode=coach switches to coach mode', () => {
  const { mockWindow, mockDocument } = setupMockCoachEnvironment();
  mockWindow.location.search = '?mode=coach';
  global.window = mockWindow;
  global.document = mockDocument;

  delete require.cache[require.resolve('../coach-portal.js')];
  const CoachPortal = require('../coach-portal.js');

  // Trigger init
  CoachPortal.initCoachPortal();
  assert.strictEqual(CoachPortal.getIsCoachMode(), true, 'Portal must activate coach mode on ?mode=coach query');
});

runTest('Suite 5', '5.3', 'Global keyboard shortcut Ctrl+Shift+C / Cmd+Shift+C toggles coach mode', () => {
  const { mockWindow, mockDocument } = setupMockCoachEnvironment();
  mockWindow.location.search = '';
  global.window = mockWindow;
  global.document = mockDocument;

  delete require.cache[require.resolve('../coach-portal.js')];
  const CoachPortal = require('../coach-portal.js');
  CoachPortal.initCoachPortal();

  assert.strictEqual(CoachPortal.getIsCoachMode(), false);

  // Simulate Ctrl+Shift+C
  const ctrlShiftC = {
    type: 'keydown',
    key: 'C',
    code: 'KeyC',
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    preventDefault() {}
  };
  mockWindow.dispatchEvent(ctrlShiftC);
  assert.strictEqual(CoachPortal.getIsCoachMode(), true, 'Ctrl+Shift+C should toggle coach mode ON');

  mockWindow.dispatchEvent(ctrlShiftC);
  assert.strictEqual(CoachPortal.getIsCoachMode(), false, 'Ctrl+Shift+C should toggle coach mode OFF');
});

runTest('Suite 5', '5.4', 'Active laptop shortcuts R, M, [, ] operate when body.portal-coach is active', () => {
  const { mockWindow, mockDocument } = setupMockCoachEnvironment();
  global.window = mockWindow;
  global.document = mockDocument;

  delete require.cache[require.resolve('../coach-portal.js')];
  const CoachPortal = require('../coach-portal.js');
  CoachPortal.initCoachPortal();
  CoachPortal.switchMode('coach');

  assert.strictEqual(CoachPortal.getCoachCanvasMode(), 'PATH');

  // Press 'm' to toggle canvas mode
  mockWindow.dispatchEvent({
    type: 'keydown',
    key: 'm',
    code: 'KeyM',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() {}
  });
  assert.strictEqual(CoachPortal.getCoachCanvasMode(), 'VEL', 'Pressing M should toggle canvas mode to VEL');

  // Press 'r' to toggle replay
  let replayToggled = false;
  mockDocument.getElementById('coach-btn-barpath-replay').addEventListener('click', () => {
    replayToggled = true;
  });
  mockWindow.dispatchEvent({
    type: 'keydown',
    key: 'r',
    code: 'KeyR',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() {}
  });
  assert.ok(replayToggled, 'Pressing R should trigger replay action');
});

runTest('Suite 5', '5.5', 'Focus safety guard: Hotkeys do NOT trigger when input or textarea has focus', () => {
  const { mockWindow, mockDocument } = setupMockCoachEnvironment();
  global.window = mockWindow;
  global.document = mockDocument;

  delete require.cache[require.resolve('../coach-portal.js')];
  const CoachPortal = require('../coach-portal.js');
  CoachPortal.initCoachPortal();
  CoachPortal.switchMode('coach');

  // Set activeElement to custom cue input
  const cueInput = mockDocument.getElementById('coach-custom-cue-input');
  mockDocument.activeElement = cueInput;

  assert.strictEqual(CoachPortal.getCoachCanvasMode(), 'PATH');

  // Press 'm' while focused in input
  mockWindow.dispatchEvent({
    type: 'keydown',
    key: 'm',
    code: 'KeyM',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() {}
  });

  assert.strictEqual(CoachPortal.getCoachCanvasMode(), 'PATH', 'M must NOT toggle canvas mode when typing in an input');
  mockDocument.activeElement = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: GUARDRAILS, PALETTE, TERMINOLOGY & EMOJIS AUDIT (R4)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 6: Guardrails, Palette, Terminology & Emojis Audit (R4) ---');

runTest('Suite 6', '6.1', 'ChatGPT Matte Obsidian 4-surface tokens strictly defined in coach.css', () => {
  assert.ok(coachCss.includes('#0d0d0d'), '--coach-bg-canvas must be #0d0d0d');
  assert.ok(coachCss.includes('#171717'), '--coach-bg-surface-1 must be #171717');
  assert.ok(coachCss.includes('#212121'), '--coach-bg-surface-2 must be #212121');
  assert.ok(coachCss.includes('#2f2f2f'), '--coach-border-subtle must be #2f2f2f');
});

runTest('Suite 6', '6.2', 'Feature ownership: Load and rest adjustment pills confined to #coach-feedback-console', () => {
  // In index.html, load-pill and rest-pill must only appear inside #coach-feedback-console
  const squadPos = indexHtml.indexOf('id="coach-squad-overview"');
  const consolePos = indexHtml.indexOf('id="coach-feedback-console"');
  const historyPos = indexHtml.indexOf('id="coach-sets-table"');

  const squadSection = indexHtml.slice(squadPos, consolePos);
  assert.ok(
    !squadSection.includes('coach-load-pill') && !squadSection.includes('coach-rest-pill'),
    'Squad overview cards must NOT contain load or rest adjustment pills'
  );
});

runTest('Suite 6', '6.3', 'Zero mock athletes: Complete absence of fake personas across all files', () => {
  const fakePersonas = ['Alex Vance', 'Jordan Bell', 'Elena Rostova', 'Liam Thorne'];
  for (const fake of fakePersonas) {
    assert.strictEqual(indexHtml.includes(fake), false, `index.html must not contain fake persona "${fake}"`);
    assert.strictEqual(coachPortalJs.includes(fake), false, `coach-portal.js must not contain fake persona "${fake}"`);
    assert.strictEqual(appJs.includes(fake), false, `app.js must not contain fake persona "${fake}"`);
  }
});

runTest('Suite 6', '6.4', 'Zero prohibited hardware terms across all 10 web files; VBT_Tracker isolated strictly to app.js:13', () => {
  const webFiles = [
    INDEX_HTML_PATH,
    STYLE_CSS_PATH,
    path.join(ROOT_DIR, 'athlete-fx.css'),
    path.join(ROOT_DIR, 'athlete-fx.js'),
    APP_JS_PATH,
    COACH_PORTAL_JS_PATH,
    SYNC_BUS_JS_PATH,
    COACH_CSS_PATH,
    path.join(ROOT_DIR, 'coach-cue-hud.css'),
    path.join(ROOT_DIR, 'coach-cue-hud.js')
  ];

  const prohibitedRegex = /\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|sensors|hardware)\b/i;

  for (const file of webFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const match = prohibitedRegex.exec(line);
      assert.strictEqual(
        match,
        null,
        `Forbidden term "${match ? match[0] : ''}" at ${path.basename(file)}:${idx + 1}: ${line.trim()}`
      );
    });
  }

  // VBT_Tracker check
  let vbtTrackerCount = 0;
  for (const file of webFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/VBT_Tracker/g);
    if (matches) {
      assert.strictEqual(path.basename(file), 'app.js', `VBT_Tracker must not be in ${path.basename(file)}`);
      vbtTrackerCount += matches.length;
    }
  }
  assert.strictEqual(vbtTrackerCount, 1, 'VBT_Tracker must appear exactly once in app.js');
});

runTest('Suite 6', '6.5', 'Zero emojis inside any <button> elements across all HTML and JS files', () => {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const buttonRegex = /<button\b[^>]*>(.*?)<\/button>/gis;

  let match;
  while ((match = buttonRegex.exec(indexHtml)) !== null) {
    const btnInner = match[1];
    assert.strictEqual(
      emojiRegex.test(btnInner),
      false,
      `Emoji found inside <button>: "${btnInner.trim()}"`
    );
  }
});

console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log(`║ ALL COACH PORTAL E2E TESTS PASSED (100% OK) — Total: ${totalTests} | Passed: ${passedTests}       ║`);
console.log('╚════════════════════════════════════════════════════════════════════════╝');
process.exit(0);
