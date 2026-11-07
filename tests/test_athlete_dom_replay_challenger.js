/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS ATHLETE VIEW DOM, REPLAY & AUTO-COLLAPSE EMPIRICAL CHALLENGE SUITE
 * File: tests/test_athlete_dom_replay_challenger.js
 * 
 * Adversarial empirical tests verifying:
 * - Suite 1: DOM Integrity (38 critical IDs + Overhaul IDs) & Zero Emojis in Buttons
 * - Suite 2: Bar Path Canvas Rendering & Mode Toggle (PATH <-> VEL)
 * - Suite 3: Interactive Replay Controls (Play, Pause, Speed 1.0X/0.5X, Step, Loop)
 * - Suite 4: Scrubber Dynamics (0% to 100% ROM, Puck Coordinates, Inst Readouts)
 * - Suite 5: Active-Set Auto-Collapse Geometry & 1-Line Mobile Grid (<= 430px)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const STYLE_CSS_PATH = path.join(ROOT_DIR, 'style.css');
const APP_JS_PATH = path.join(ROOT_DIR, 'app.js');
const SYNC_BUS_PATH = path.join(ROOT_DIR, 'sync-bus.js');

const htmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const cssContent = fs.readFileSync(STYLE_CSS_PATH, 'utf8');
const appJsContent = fs.readFileSync(APP_JS_PATH, 'utf8');
const syncBusContent = fs.readFileSync(SYNC_BUS_PATH, 'utf8');

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║    EROS ATHLETE VIEW DOM & REPLAY EMPIRICAL CHALLENGE HARNESS          ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         Reason: ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: DOM INTEGRITY, CRITICAL IDS & ZERO EMOJIS IN BUTTONS
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- SUITE 1: DOM Integrity, Critical IDs & Button Emojis ---');

// 1.1 All 38 Critical Base DOM IDs
const BASE_38_IDS = [
  'btn-workout-master', 'btn-workout-text', 'session-pulse',
  'session-status-text', 'session-timer-display', 'status-badge',
  'sync-banner', 'sync-banner-text', 'btn-connect',
  'lift-select-wrapper', 'selected-lift-text', 'btn-set-toggle',
  'btn-set-text', 'live-velocity', 'live-rpe', 'live-vel-sub',
  'live-rpe-sub', 'orb', 'apex-glow', 'hud-active-set',
  'hud-set-reps', 'hud-vel-loss', 'set-badge-label',
  'set-lift-name', 'set-rep-counter', 'set-avg-vel',
  'set-max-vel', 'set-vel-loss', 'set-avg-rpe', 'set-min-vel',
  'set-ring-progress', 'active-set-reps-list', 'active-set-rep-counter',
  'sum-workouts', 'sum-sets', 'sum-reps', 'sum-best-vel',
  'history-sessions-list', 'btn-export-csv', 'btn-export-json',
  'btn-clear-history', 'tab-live', 'tab-set', 'tab-history'
];

runTest('1.1 All 38 base DOM IDs present in index.html', () => {
  const missing = [];
  for (const id of BASE_38_IDS) {
    const idRegex = new RegExp(`id=["']${id}["']`, 'i');
    if (!idRegex.test(htmlContent)) {
      missing.push(id);
    }
  }
  assert.strictEqual(missing.length, 0, `Missing base DOM IDs: ${missing.join(', ')}`);
});

// 1.2 All Athlete View Overhaul IDs
const OVERHAUL_IDS = [
  'bar-path-canvas',
  'btn-barpath-mode',
  'barpath-mode-path',
  'barpath-mode-vel',
  'barpath-hud-metrics',
  'barpath-hud-dev',
  'barpath-hud-eff',
  'barpath-replay-panel',
  'barpath-scrubber',
  'barpath-scrub-rom',
  'barpath-scrub-inst-vel',
  'barpath-scrub-inst-dev',
  'btn-barpath-replay',
  'barpath-replay-text',
  'btn-barpath-speed',
  'barpath-speed-label',
  'barpath-rep-pills',
  'rpe-gauge-fill',
  'rpe-target-pin',
  'live-rir-pill',
  'rpe-tier-badge'
];

runTest('1.2 All 21 Athlete View Overhaul IDs present in index.html', () => {
  const missing = [];
  for (const id of OVERHAUL_IDS) {
    const idRegex = new RegExp(`id=["']${id}["']`, 'i');
    if (!idRegex.test(htmlContent)) {
      missing.push(id);
    }
  }
  assert.strictEqual(missing.length, 0, `Missing Overhaul DOM IDs: ${missing.join(', ')}`);
});

// 1.3 Canvas Dimensions & Attributes
runTest('1.3 #bar-path-canvas has explicit width="220" and height="210"', () => {
  const canvasMatch = htmlContent.match(/<canvas[^>]*id=["']bar-path-canvas["'][^>]*>/i);
  assert.ok(canvasMatch, 'Canvas tag not found');
  assert.ok(/width=["']220["']/.test(canvasMatch[0]), 'Canvas missing width="220"');
  assert.ok(/height=["']210["']/.test(canvasMatch[0]), 'Canvas missing height="210"');
});

// 1.4 Backward compatibility elements #orb and #apex-glow inside .bar-path-stage
runTest('1.4 Legacy elements #orb and #apex-glow preserved inside .bar-path-stage', () => {
  const stageMatch = htmlContent.match(/<div[^>]*class=["'][^"']*bar-path-stage[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*metric-card/i);
  assert.ok(stageMatch, '.bar-path-stage container not found');
  const stageInner = stageMatch[1];
  assert.ok(stageInner.includes('id="orb"'), '#orb must be inside .bar-path-stage');
  assert.ok(stageInner.includes('id="apex-glow"'), '#apex-glow must be inside .bar-path-stage');
});

// 1.5 Zero Emojis in any <button> element across HTML and JS
runTest('1.5 Zero emojis inside any <button> tags across HTML and JS', () => {
  const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/u;
  
  // HTML buttons
  const btnMatches = htmlContent.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
  const emojiViolations = [];
  btnMatches.forEach((btn, idx) => {
    if (EMOJI_REGEX.test(btn)) {
      emojiViolations.push(`HTML button ${idx + 1}: ${btn.replace(/\s+/g, ' ')}`);
    }
  });
  
  // JS dynamic buttons (e.g. createElement('button') in app.js and coach-portal.js)
  const jsFiles = ['app.js', 'coach-portal.js', 'athlete-fx.js', 'coach-cue-hud.js'];
  jsFiles.forEach(f => {
    const fPath = path.join(ROOT_DIR, f);
    if (!fs.existsSync(fPath)) return;
    const content = fs.readFileSync(fPath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, lineNo) => {
      if ((line.includes('.textContent') || line.includes('.innerHTML') || line.includes('<button')) && EMOJI_REGEX.test(line)) {
        emojiViolations.push(`${f}:${lineNo + 1}: ${line.trim()}`);
      }
    });
  });

  assert.strictEqual(emojiViolations.length, 0, `Found emojis in buttons:\n${emojiViolations.join('\n')}`);
});

// 1.6 Strict hardware terminology check across all web files
runTest('1.6 Zero forbidden hardware terms across all 10 web files', () => {
  const WEB_FILES = [
    'index.html', 'style.css', 'athlete-fx.css', 'athlete-fx.js',
    'app.js', 'coach-portal.js', 'sync-bus.js', 'coach.css',
    'coach-cue-hud.css', 'coach-cue-hud.js'
  ];
  const FORBIDDEN_HW_REGEX = /\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|sensors|hardware)\b/i;
  const hwViolations = [];

  for (const file of WEB_FILES) {
    const filePath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    content.split('\n').forEach((line, idx) => {
      if (FORBIDDEN_HW_REGEX.test(line)) {
        hwViolations.push(`${file}:${idx + 1} -> ${line.trim()}`);
      }
    });
  }
  assert.strictEqual(hwViolations.length, 0, `Forbidden hardware terms found:\n${hwViolations.join('\n')}`);
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: CANVAS 2D RENDERING ENGINE & MODE TOGGLE (PATH <-> VEL)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 2: Canvas 2D Rendering & Mode Toggle (PATH <-> VEL) ---');

// Mock DOM and Canvas Context Harness
function createMockCanvasContext() {
  const operations = [];
  return {
    operations,
    clearRect(x, y, w, h) { operations.push({ op: 'clearRect', args: [x, y, w, h] }); },
    fillRect(x, y, w, h) { operations.push({ op: 'fillRect', args: [x, y, w, h], fillStyle: this.fillStyle }); },
    beginPath() { operations.push({ op: 'beginPath' }); },
    moveTo(x, y) { operations.push({ op: 'moveTo', args: [x, y] }); },
    lineTo(x, y) { operations.push({ op: 'lineTo', args: [x, y] }); },
    stroke() { operations.push({ op: 'stroke', strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, lineDash: this.lineDash }); },
    fill() { operations.push({ op: 'fill', fillStyle: this.fillStyle }); },
    arc(x, y, r, sa, ea) { operations.push({ op: 'arc', args: [x, y, r, sa, ea] }); },
    save() { operations.push({ op: 'save' }); },
    restore() { operations.push({ op: 'restore' }); },
    setLineDash(d) { this.lineDash = d; operations.push({ op: 'setLineDash', args: [d] }); },
    fillText(text, x, y) { operations.push({ op: 'fillText', args: [text, x, y], fillStyle: this.fillStyle }); },
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineDash: [],
    font: '10px sans-serif',
    textAlign: 'start'
  };
}

function createDOMEnvironment() {
  const elements = {};
  function makeEl(id, tag = 'div', classes = '') {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      className: classes,
      classList: {
        _classes: new Set(classes ? classes.split(' ').filter(Boolean) : []),
        add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
        remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
        contains(c) { return this._classes.has(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this._classes.has(c)) this.remove(c);
            else this.add(c);
          } else if (force) {
            this.add(c);
          } else {
            this.remove(c);
          }
        }
      },
      style: {},
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; },
      children: [],
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      removeChild(child) { this.children = this.children.filter(c => c !== child); },
      _listeners: {},
      addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
      },
      dispatchEvent(evt) {
        const type = typeof evt === 'string' ? evt : evt.type;
        const listeners = this._listeners[type] || [];
        listeners.forEach(fn => fn(evt));
      },
      click() { this.dispatchEvent({ type: 'click' }); },
      textContent: '',
      value: '100',
      width: 220,
      height: 210,
      getContext(type) {
        if (!this._ctx) this._ctx = createMockCanvasContext();
        return this._ctx;
      },
      querySelector(sel) {
        if (sel.startsWith('#')) return elements[sel.substring(1)] || null;
        if (sel.startsWith('.')) {
          const cls = sel.substring(1);
          return Object.values(elements).find(e => e.classList && e.classList.contains(cls)) || null;
        }
        return null;
      },
      querySelectorAll(sel) {
        if (sel.startsWith('.')) {
          const cls = sel.substring(1);
          return Object.values(elements).filter(e => e.classList && e.classList.contains(cls));
        }
        return [];
      }
    };
    if (id) elements[id] = el;
    return el;
  }

  // Pre-populate elements found in index.html
  const allIds = [...htmlContent.matchAll(/id=["']([^"']+)["']/g)].map(m => m[1]);
  allIds.forEach(id => {
    let tag = 'div';
    if (id.startsWith('btn-') || id.includes('replay') || id.includes('speed') || id.includes('mode')) tag = 'button';
    if (id.includes('canvas')) tag = 'canvas';
    if (id.includes('scrubber') || id.includes('input')) tag = 'input';
    const el = makeEl(id, tag);
    const textMatch = htmlContent.match(new RegExp(`id=["']${id}["'][^>]*>([^<]*)<`, 'i'));
    if (textMatch && textMatch[1].trim()) {
      el.textContent = textMatch[1].trim();
    }
  });

  // Common class-based child elements used across app.js
  const selectTrigger = makeEl('mock-select-trigger', 'div', 'custom-select-trigger glass-pill');
  const btnText = makeEl('mock-btn-text', 'span', 'btn-text');
  const optDeadlift = makeEl('mock-opt-dl', 'div', 'custom-option selected');
  optDeadlift.setAttribute('data-value', 'Deadlift');
  const optSquat = makeEl('mock-opt-sq', 'div', 'custom-option');
  optSquat.setAttribute('data-value', 'Squat');
  const optBench = makeEl('mock-opt-bp', 'div', 'custom-option');
  optBench.setAttribute('data-value', 'Bench');

  const liftSelectWrapper = elements['lift-select-wrapper'];
  if (liftSelectWrapper) {
    liftSelectWrapper.appendChild(selectTrigger);
    liftSelectWrapper.appendChild(optDeadlift);
    liftSelectWrapper.appendChild(optSquat);
    liftSelectWrapper.appendChild(optBench);
  }

  const btnConnect = elements['btn-connect'];
  if (btnConnect) {
    btnConnect.appendChild(btnText);
  }

  // Specifically configure controls-panel
  const controlsPanel = makeEl('controls-panel-el', 'div', 'glass-card controls-panel');
  elements['controls-panel'] = controlsPanel;

  return { elements, makeEl };
}

// Extract and test trajectory synthesis
runTest('2.1 Biomechanical trajectory synthesis generates valid 40-pt curves', () => {
  const synthMatch = appJsContent.match(/function synthesizeRepTrajectory\([\s\S]*?\n\}/);
  assert.ok(synthMatch, 'synthesizeRepTrajectory function must exist in app.js');
  
  const synthFunc = new Function('canonicalLift', 'currentLift', 'LIFT_BASELINES',
    `return (${synthMatch[0]});`
  )(
    (l) => l || 'Deadlift',
    'Deadlift',
    { squat: { mvt: 0.30 }, bench: { mvt: 0.18 }, deadlift: { mvt: 0.15 } }
  );

  const squatTraj = synthFunc('Squat', 0.55, 1.8, 55.0);
  assert.strictEqual(squatTraj.points.length, 40);
  assert.ok(squatTraj.deviationCm > 0, 'Squat deviationCm must be positive');
  assert.ok(squatTraj.maxDeviationCm >= squatTraj.deviationCm, 'maxDeviationCm >= deviationCm');
  assert.ok(squatTraj.pathEfficiencyPct >= 80 && squatTraj.pathEfficiencyPct <= 100, 'pathEfficiencyPct valid');

  const benchTraj = synthFunc('Bench', 0.40, 2.8, 42.0);
  assert.strictEqual(benchTraj.points.length, 40);
  assert.ok(benchTraj.points.some(p => p.dx < 0), 'Bench trajectory exhibits J-curve backward flare');

  const dlTraj = synthFunc('Deadlift', 0.48, 3.2, 58.0);
  assert.strictEqual(dlTraj.points.length, 40);
  assert.ok(dlTraj.points.some(p => p.dx < 0), 'Deadlift exhibits backward sweep toward shin/thigh (-dx)');
});

// Setup sandbox environment to execute app.js functions directly
const domEnv = createDOMEnvironment();
const elements = domEnv.elements;

// Provide global context for app.js execution
const mockWindow = {
  document: {
    getElementById: (id) => elements[id] || null,
    querySelector: (sel) => {
      if (sel === '.controls-panel') return elements['controls-panel'];
      if (sel.startsWith('#')) return elements[sel.substring(1)] || null;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '.target-chip') return [elements['btn-target-rpe-dec']];
      return [];
    },
    createElement: (tag) => domEnv.makeEl('', tag),
    createTextNode: (text) => ({ textContent: String(text) }),
    addEventListener: () => {}
  },
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  },
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  AudioContext: function() {
    return {
      createOscillator: () => ({ connect: () => {}, start: () => {}, stop: () => {}, type: '', frequency: { setValueAtTime: () => {} } }),
      createGain: () => ({ connect: () => {}, gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} } }),
      currentTime: 0,
      destination: {}
    };
  },
  navigator: { vibrate: () => true },
  ErosSyncBus: { emit: () => {}, on: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {}
};

mockWindow.window = mockWindow;

// Create script execution sandbox
const context = vm.createContext({
  window: mockWindow,
  document: mockWindow.document,
  localStorage: mockWindow.localStorage,
  performance: mockWindow.performance,
  requestAnimationFrame: mockWindow.requestAnimationFrame,
  cancelAnimationFrame: mockWindow.cancelAnimationFrame,
  AudioContext: mockWindow.AudioContext,
  navigator: mockWindow.navigator,
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: () => 1,
  clearInterval: () => {},
  Set: Set,
  Math: Math,
  Date: Date,
  Number: Number,
  Array: Array,
  Object: Object,
  parseFloat: parseFloat,
  parseInt: parseInt,
  isNaN: isNaN,
  isFinite: isFinite,
  String: String
});

// Execute app.js in sandbox
vm.runInContext(appJsContent, context);

runTest('2.2 app.js exports renderBarPathStage and toggleBarPathMode to window', () => {
  assert.strictEqual(typeof mockWindow.renderBarPathStage, 'function', 'renderBarPathStage not exported');
  assert.strictEqual(typeof mockWindow.toggleBarPathMode, 'function', 'toggleBarPathMode not exported');
  assert.strictEqual(typeof mockWindow.startReplay, 'function', 'startReplay not exported');
  assert.strictEqual(typeof mockWindow.stopReplay, 'function', 'stopReplay not exported');
});

runTest('2.3 Initial state: PATH mode active, empty set shows WAITING message', () => {
  const canvas = elements['bar-path-canvas'];
  const ctx = canvas.getContext('2d');
  ctx.operations.length = 0;

  mockWindow.renderBarPathStage(0, 1.0);

  const fillTextOp = ctx.operations.find(o => o.op === 'fillText' && o.args[0].includes('WAITING FOR REP 1'));
  assert.ok(fillTextOp, 'Canvas must render "WAITING FOR REP 1..." when no reps present');
  assert.strictEqual(elements['barpath-hud-dev'].textContent, '0.0 cm');
  assert.strictEqual(elements['barpath-hud-eff'].textContent, '100%');
});

runTest('2.4 Mode toggle (PATH <-> VEL) updates UI classes and redraws canvas', () => {
  const pathOpt = elements['barpath-mode-path'];
  const velOpt = elements['barpath-mode-vel'];
  
  // Set initial class
  pathOpt.classList.add('active');
  velOpt.classList.remove('active');

  // Toggle to VEL
  mockWindow.toggleBarPathMode();
  assert.ok(velOpt.classList.contains('active'), 'VEL mode option must have class active');
  assert.ok(!pathOpt.classList.contains('active'), 'PATH mode option must not have class active');

  // Toggle back to PATH
  mockWindow.toggleBarPathMode();
  assert.ok(pathOpt.classList.contains('active'), 'PATH mode option must have class active');
  assert.ok(!velOpt.classList.contains('active'), 'VEL mode option must not have class active');
});

runTest('2.5 Rapid mode toggle stress test (100 switches)', () => {
  const pathOpt = elements['barpath-mode-path'];
  const velOpt = elements['barpath-mode-vel'];

  for (let i = 0; i < 100; i++) {
    mockWindow.toggleBarPathMode();
    const isVel = (i % 2 === 0);
    assert.strictEqual(velOpt.classList.contains('active'), isVel, `Iteration ${i}: velOpt class mismatch`);
    assert.strictEqual(pathOpt.classList.contains('active'), !isVel, `Iteration ${i}: pathOpt class mismatch`);
  }
  // Reset back to PATH mode
  if (velOpt.classList.contains('active')) {
    mockWindow.toggleBarPathMode();
  }
  assert.ok(pathOpt.classList.contains('active'), 'Reset to PATH mode');
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: REPLAY CONTROLS (PLAY, PAUSE, SPEED, STEPS)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 3: Replay Engine & Playback Controls ---');

// Populate a synthetic active set with 2 reps in context
const synth = mockWindow.synthesizeRepTrajectory('Deadlift', 0.52, 1.9, 50.0);
const synth2 = mockWindow.synthesizeRepTrajectory('Deadlift', 0.44, 3.8, 50.0);

vm.runInContext(`
  activeSet = {
    setId: 'set_test_1',
    setNumber: 1,
    lift: 'Deadlift',
    weight: 180.0,
    reps: [
      {
        repNumber: 1,
        velocity: 0.52,
        peakVelocity: 0.72,
        rpe: 7.5,
        deviationCm: ${synth.deviationCm},
        maxDeviationCm: ${synth.maxDeviationCm},
        pathEfficiencyPct: ${synth.pathEfficiencyPct},
        trajectoryPoints: ${JSON.stringify(synth.points)}
      },
      {
        repNumber: 2,
        velocity: 0.44,
        peakVelocity: 0.61,
        rpe: 8.5,
        deviationCm: ${synth2.deviationCm},
        maxDeviationCm: ${synth2.maxDeviationCm},
        pathEfficiencyPct: ${synth2.pathEfficiencyPct},
        trajectoryPoints: ${JSON.stringify(synth2.points)}
      }
    ]
  };
`, context);

runTest('3.1 Canvas renders PATH mode with color-coded corridors and 0.0 plumb line', () => {
  const canvas = elements['bar-path-canvas'];
  const ctx = canvas.getContext('2d');
  ctx.operations.length = 0;

  mockWindow.renderBarPathStage(0, 1.0);

  // Assert Top HUD updated
  assert.strictEqual(elements['barpath-hud-dev'].textContent, `+${synth.deviationCm.toFixed(1)} cm`);
  assert.strictEqual(elements['barpath-hud-eff'].textContent, `${synth.pathEfficiencyPct.toFixed(1)}%`);

  // Assert 0.0 cm plumb line rendered
  const plumbLine = ctx.operations.find(o => o.op === 'stroke' && o.lineWidth === 1.5);
  assert.ok(plumbLine, '0.0 cm plumb line must be stroked with lineWidth 1.5');

  // Assert corridor stroke and axis texts
  const axisTexts = ctx.operations.filter(o => o.op === 'fillText' && ['0.0', '-2', '+2'].includes(o.args[0]));
  assert.strictEqual(axisTexts.length, 3, 'Axis labels 0.0, -2, +2 must be rendered');

  // Assert puck halo and white core
  const arcs = ctx.operations.filter(o => o.op === 'arc');
  assert.ok(arcs.some(a => a.args[2] === 9), 'Puck halo circle radius 9 must be drawn');
  assert.ok(arcs.some(a => a.args[2] === 4), 'Puck core circle radius 4 must be drawn');
});

runTest('3.2 Rep 1 Ghost Trail rendered when Rep 2 is active', () => {
  const canvas = elements['bar-path-canvas'];
  const ctx = canvas.getContext('2d');
  ctx.operations.length = 0;

  mockWindow.renderBarPathStage(1, 1.0);

  // Assert Rep 2 Top HUD values
  assert.strictEqual(elements['barpath-hud-dev'].textContent, `+${synth2.deviationCm.toFixed(1)} cm`);
  assert.strictEqual(elements['barpath-hud-eff'].textContent, `${synth2.pathEfficiencyPct.toFixed(1)}%`);

  // Ghost trail dashed line check
  const ghostStroke = ctx.operations.find(o => o.op === 'setLineDash' && JSON.stringify(o.args[0]) === JSON.stringify([4, 4]));
  assert.ok(ghostStroke, 'Rep 1 ghost trail must use [4, 4] dashed line');
});

runTest('3.3 Canvas renders VEL mode with sticking point and MVT baseline', () => {
  mockWindow.toggleBarPathMode(); // Switch to VEL
  const canvas = elements['bar-path-canvas'];
  const ctx = canvas.getContext('2d');
  ctx.operations.length = 0;

  mockWindow.renderBarPathStage(0, 1.0);

  // Velocity axis labels (0.0, 0.6, 1.2)
  const velLabels = ctx.operations.filter(o => o.op === 'fillText' && ['0.0', '0.6', '1.2'].includes(o.args[0]));
  assert.strictEqual(velLabels.length, 3, 'Velocity axis labels 0.0, 0.6, 1.2 must be drawn');

  // Cyan stroke for velocity profile
  const cyanStroke = ctx.operations.find(o => o.op === 'stroke' && o.strokeStyle === '#00E5FF');
  assert.ok(cyanStroke, 'Velocity curve must be stroked in #00E5FF');

  mockWindow.toggleBarPathMode(); // Switch back to PATH
});

runTest('3.4 Replay play/pause toggle manages state and button text', () => {
  const replayText = elements['barpath-replay-text'];
  assert.strictEqual(replayText.textContent, 'REPLAY');

  // Trigger startReplay
  mockWindow.startReplay();
  assert.strictEqual(replayText.textContent, 'PAUSE');

  // Trigger stopReplay
  mockWindow.stopReplay();
  assert.strictEqual(replayText.textContent, 'REPLAY');
});

runTest('3.5 Speed toggle (1.0X <-> 0.5X) updates label and duration math', () => {
  const speedLabel = elements['barpath-speed-label'];
  assert.strictEqual(speedLabel.textContent, '1.0X');

  // Toggle to 0.5X
  vm.runInContext('toggleReplaySpeed();', context);
  assert.strictEqual(speedLabel.textContent, '0.5X');

  // Toggle back to 1.0X
  vm.runInContext('toggleReplaySpeed();', context);
  assert.strictEqual(speedLabel.textContent, '1.0X');

  // Rapid speed toggle stress test
  for (let i = 0; i < 20; i++) {
    vm.runInContext('toggleReplaySpeed();', context);
    const expected = (i % 2 === 0) ? '0.5X' : '1.0X';
    assert.strictEqual(speedLabel.textContent, expected);
  }
  if (speedLabel.textContent !== '1.0X') {
    vm.runInContext('toggleReplaySpeed();', context);
  }
  assert.strictEqual(speedLabel.textContent, '1.0X');
});

runTest('3.6 Replay automatically restarts from 0% when scrubber is at 100%', () => {
  const scrubber = elements['barpath-scrubber'];
  scrubber.value = '100';

  mockWindow.startReplay();
  assert.strictEqual(scrubber.value, '0', 'Scrubber must reset to 0 when replaying from 100');
  mockWindow.stopReplay();
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: SCRUBBER DYNAMICS & REALTIME HUD UPDATES
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 4: Scrubber Dynamics & Realtime HUD Updates ---');

runTest('4.1 Scrubber updates % ROM, inst velocity, and inst deviation at 0%, 50%, 100%', () => {
  const romEl = elements['barpath-scrub-rom'];
  const velEl = elements['barpath-scrub-inst-vel'];
  const devEl = elements['barpath-scrub-inst-dev'];

  // Test at 0%
  mockWindow.renderBarPathStage(0, 0.0);
  assert.strictEqual(romEl.textContent, '0% ROM');
  assert.ok(velEl.textContent.endsWith('m/s'), 'Velocity HUD must include m/s');
  assert.ok(devEl.textContent.endsWith('cm'), 'Deviation HUD must include cm');

  // Test at 50%
  mockWindow.renderBarPathStage(0, 0.5);
  assert.strictEqual(romEl.textContent, '50% ROM');

  // Test at 100%
  mockWindow.renderBarPathStage(0, 1.0);
  assert.strictEqual(romEl.textContent, '100% ROM');
});

runTest('4.2 Scrubber event listener stops active replay and redraws progress', () => {
  mockWindow.startReplay();
  assert.strictEqual(elements['barpath-replay-text'].textContent, 'PAUSE');

  // Trigger input on scrubber
  const scrubber = elements['barpath-scrubber'];
  scrubber.value = '42';
  scrubber.dispatchEvent({ type: 'input', target: { value: '42' } });

  assert.strictEqual(elements['barpath-replay-text'].textContent, 'REPLAY', 'Input must pause replay');
  assert.strictEqual(elements['barpath-scrub-rom'].textContent, '42% ROM');
});

runTest('4.3 Rep Selector Pills update active rep and scrubber', () => {
  const pillsContainer = elements['barpath-rep-pills'];
  assert.strictEqual(pillsContainer.children.length, 2, 'Must have 2 rep pills for 2 reps');

  const pill1 = pillsContainer.children[0];
  const pill2 = pillsContainer.children[1];
  assert.strictEqual(pill1.textContent, 'R1');
  assert.strictEqual(pill2.textContent, 'R2');

  // Click R2
  pill2.click();
  assert.ok(pill2.classList.contains('active'), 'Pill 2 must become active');
  assert.ok(!pill1.classList.contains('active'), 'Pill 1 must not be active');
  assert.strictEqual(elements['barpath-hud-dev'].textContent, `+${synth2.deviationCm.toFixed(1)} cm`);
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: ACTIVE-SET AUTO-COLLAPSE GEOMETRY & MOBILE RESPONSIVE (<= 430px)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 5: Active-Set Auto-Collapse & Responsive Layout (<= 430px) ---');

runTest('5.1 Lifecycle: startNewSet adds set-active-compact, endActiveSet removes it', () => {
  const panel = elements['controls-panel'];
  const btnSetText = elements['btn-set-text'];

  // Start new set
  vm.runInContext('startNewSet();', context);
  assert.ok(panel.classList.contains('set-active-compact'), 'startNewSet must add set-active-compact');
  assert.strictEqual(btnSetText.textContent, 'END SET', 'btn-set-text must show "END SET"');

  // End active set
  vm.runInContext('endActiveSet();', context);
  assert.ok(!panel.classList.contains('set-active-compact'), 'endActiveSet must remove set-active-compact');
  assert.strictEqual(btnSetText.textContent, 'START SET', 'btn-set-text must show "START SET"');
});

runTest('5.2 CSS Auto-Collapse rules defined in style.css', () => {
  assert.ok(
    /\.controls-panel\.set-active-compact\s*\{/.test(cssContent),
    '.controls-panel.set-active-compact selector must exist'
  );
  assert.ok(
    /\.controls-panel\.set-active-compact\s+\.target-rpe-chips\s*\{[^}]*display:\s*none;/s.test(cssContent),
    'target-rpe-chips must be hidden during set-active-compact'
  );
  assert.ok(
    /\.controls-panel\.set-active-compact\s+\.target-stepper-btn\s*\{[^}]*display:\s*none;/s.test(cssContent),
    'target-stepper-btn must be hidden during set-active-compact'
  );
  assert.ok(
    /\.controls-panel\.set-active-compact\s+\.target-rpe-help\s*\{[^}]*display:\s*none;/s.test(cssContent),
    'target-rpe-help must be hidden during set-active-compact'
  );
});

runTest('5.3 Mobile media query (<= 430px) collapses controls-row into 1-line 3-column grid', () => {
  const mqRegex = /@media\s*\(\s*max-width:\s*430px\s*\)[\s\S]*?\.controls-panel\.set-active-compact\s+\.controls-row\s*\{([^}]*)\}/s;
  const match = cssContent.match(mqRegex);
  assert.ok(match, 'Mobile media query (max-width: 430px) for .controls-row not found');
  
  const rules = match[1];
  assert.ok(/grid-template-columns:\s*1fr\s+1fr\s+1\.15fr;/.test(rules), 'Must use grid-template-columns: 1fr 1fr 1.15fr');
  assert.ok(/height:\s*44px;/.test(rules), 'Must set height: 44px');
  assert.ok(/gap:\s*6px;/.test(rules), 'Must set gap: 6px');
});

runTest('5.4 Viewport 100dvh dynamic modernization', () => {
  assert.ok(
    /html,\s*body\s*\{[^}]*min-height:\s*100dvh;/s.test(cssContent),
    'html, body must include min-height: 100dvh'
  );
  assert.ok(
    /\.app-container\s*\{[^}]*min-height:\s*100dvh;/s.test(cssContent),
    '.app-container must include min-height: 100dvh'
  );
});

runTest('5.5 Luminous RPE pill segmented tick marks and spring bezier transition', () => {
  // Tick marks in HTML
  ['6.5', '7.5', '8.5', '9.5'].forEach(tick => {
    assert.ok(htmlContent.includes(`data-rpe="${tick}"`), `Tick ${tick} missing from DOM`);
  });

  // Spring transition curve in CSS
  assert.ok(
    /cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/.test(cssContent),
    'Spring easing cubic-bezier(0.22, 1, 0.36, 1) missing from CSS'
  );

  // Left alignment invariant for #live-rpe-sub
  assert.ok(
    /#live-rpe-sub[^{]*\{[^}]*text-align:\s*left;/s.test(cssContent) ||
    /\.rpe-baseline-sub\s*\{[^}]*text-align:\s*left;/s.test(cssContent),
    '#live-rpe-sub text-align: left invariant missing'
  );
});

console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log(`║ ALL ${passedTests}/${totalTests} EMPIRICAL CHALLENGE ASSERTIONS PASSED (100% OK)         ║`);
console.log('╚════════════════════════════════════════════════════════════════════════╝');
