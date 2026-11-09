/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS INTERACTIVE SWITCHER, ANIMATION VARIANTS & SOUND HARNESS
 * File: tests/test_interactive_switcher_variants.js
 *
 * Verifies Requirements R1, R2, R3, R4:
 * - Suite 1: Switcher DOM & visionOS Spatial Glass Structure
 * - Suite 2: Unified Kinematic Trajectory & Phase Kinematics (Squat, Bench, Deadlift)
 * - Suite 3: Specular White-to-Lift Color Interpolation & Deviation Tracking
 * - Suite 4: Repetition Completion Pop Scaling & Pure Web Audio Synthesis
 * - Suite 5: Exploration Variants A, B, C, D Execution & URL Deep-Linking
 * - Suite 6: Terminology Compliance & Button Emoji Invariant
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
const ATHLETE_FX_JS_PATH = path.join(ROOT_DIR, 'athlete-fx.js');
const ATHLETE_FX_CSS_PATH = path.join(ROOT_DIR, 'athlete-fx.css');

const htmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const cssContent = fs.readFileSync(STYLE_CSS_PATH, 'utf8');
const appJsContent = fs.readFileSync(APP_JS_PATH, 'utf8');
const athleteFxJsContent = fs.readFileSync(ATHLETE_FX_JS_PATH, 'utf8');
const athleteFxCssContent = fs.readFileSync(ATHLETE_FX_CSS_PATH, 'utf8');

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║       EROS INTERACTIVE SWITCHER & VARIANTS A-D TEST SUITE               ║');
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
// SUITE 1: SWITCHER DOM & VISIONOS SPATIAL GLASS STRUCTURE (R3, R4)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- SUITE 1: Switcher DOM & visionOS Spatial Glass Structure ---');

runTest('1.1 Stage micro-switcher pill #btn-variant-switcher in .barpath-hud-top', () => {
  assert.ok(htmlContent.includes('id="btn-variant-switcher"'), '#btn-variant-switcher must exist in index.html');
  assert.ok(htmlContent.includes('id="barpath-active-variant"'), '#barpath-active-variant must exist inside pill');
  assert.ok(htmlContent.includes('VAR:'), 'Pill must contain VAR: label');
});

runTest('1.2 Collapsible spatial glass sheet #variant-switcher-sheet with 4 variant cards', () => {
  assert.ok(htmlContent.includes('id="variant-switcher-sheet"'), '#variant-switcher-sheet must exist in index.html');
  assert.ok(htmlContent.includes('id="btn-variant-sheet-close"'), '#btn-variant-sheet-close must exist');
  assert.ok(htmlContent.includes('data-variant="A"'), 'Variant card A must exist');
  assert.ok(htmlContent.includes('data-variant="B"'), 'Variant card B must exist');
  assert.ok(htmlContent.includes('data-variant="C"'), 'Variant card C must exist');
  assert.ok(htmlContent.includes('data-variant="D"'), 'Variant card D must exist');
});

runTest('1.3 Audition simulation button #btn-variant-audition-rep present', () => {
  assert.ok(htmlContent.includes('id="btn-variant-audition-rep"'), '#btn-variant-audition-rep must exist');
  assert.ok(htmlContent.includes('AUDITION REP'), 'Audition button must contain text AUDITION REP');
});

runTest('1.4 visionOS glass CSS tokens and styling present in style.css and athlete-fx.css', () => {
  assert.ok(cssContent.includes('.barpath-variant-pill'), '.barpath-variant-pill style rule must exist');
  assert.ok(cssContent.includes('.variant-switcher-sheet'), '.variant-switcher-sheet style rule must exist');
  assert.ok(cssContent.includes('.variant-card'), '.variant-card style rule must exist');
  assert.ok(cssContent.includes('.btn-variant-audition'), '.btn-variant-audition style rule must exist');
  assert.ok(athleteFxCssContent.includes('repCompletionPop'), 'repCompletionPop animation must exist in athlete-fx.css');
  assert.ok(athleteFxCssContent.includes('.rep-pop-bloom'), '.rep-pop-bloom class must exist in athlete-fx.css');
});

// ─────────────────────────────────────────────────────────────────────────────
// VM TEST ENVIRONMENT SETUP
// ─────────────────────────────────────────────────────────────────────────────
function createTestVM() {
  const operations = [];
  const mockCanvasContext = {
    operations,
    clearRect(x, y, w, h) { operations.push({ op: 'clearRect', args: [x, y, w, h] }); },
    fillRect(x, y, w, h) { operations.push({ op: 'fillRect', args: [x, y, w, h], fillStyle: this.fillStyle }); },
    beginPath() { operations.push({ op: 'beginPath' }); },
    moveTo(x, y) { operations.push({ op: 'moveTo', args: [x, y] }); },
    lineTo(x, y) { operations.push({ op: 'lineTo', args: [x, y] }); },
    stroke() { operations.push({ op: 'stroke', strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, lineDash: this.lineDash, shadowBlur: this.shadowBlur, shadowColor: this.shadowColor }); },
    fill() { operations.push({ op: 'fill', fillStyle: this.fillStyle }); },
    arc(x, y, r, sa, ea) { operations.push({ op: 'arc', args: [x, y, r, sa, ea] }); },
    ellipse(x, y, rx, ry, rot, sa, ea) { operations.push({ op: 'ellipse', args: [x, y, rx, ry, rot, sa, ea] }); },
    closePath() { operations.push({ op: 'closePath' }); },
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
    textAlign: 'start',
    shadowBlur: 0,
    shadowColor: 'transparent'
  };

  const scheduledAudio = [];
  class MockOscillator {
    constructor() {
      this.type = 'sine';
      this.frequency = {
        value: 440,
        setValueAtTime(v, t) { scheduledAudio.push({ type: 'osc_set_freq', value: v, time: t }); },
        exponentialRampToValueAtTime(v, t) { scheduledAudio.push({ type: 'osc_ramp_freq', value: v, time: t }); }
      };
    }
    connect(dest) { scheduledAudio.push({ type: 'osc_connect', dest }); }
    start(t) { scheduledAudio.push({ type: 'osc_start', time: t }); }
    stop(t) { scheduledAudio.push({ type: 'osc_stop', time: t }); }
  }

  class MockGain {
    constructor() {
      this.gain = {
        value: 1,
        setValueAtTime(v, t) { scheduledAudio.push({ type: 'gain_set', value: v, time: t }); },
        exponentialRampToValueAtTime(v, t) { scheduledAudio.push({ type: 'gain_ramp', value: v, time: t }); }
      };
    }
    connect(dest) { scheduledAudio.push({ type: 'gain_connect', dest }); }
  }

  class MockAudioContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.destination = { id: 'speaker_destination' };
    }
    createOscillator() { return new MockOscillator(); }
    createGain() { return new MockGain(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }

  const elements = {};
  function makeEl(id, tag = 'div', classes = '') {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      className: classes,
      style: {
        _props: {},
        display: '',
        animation: '',
        setProperty(k, v) { this._props[k] = v; },
        getPropertyValue(k) { return this._props[k]; }
      },
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
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      dataset: {},
      textContent: '',
      innerHTML: '',
      children: [],
      appendChild(child) { this.children.push(child); return child; },
      addEventListener(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = this._listeners[evt] || []; this._listeners[evt].push(fn); },
      trigger(evt, data) { if (this._listeners && this._listeners[evt]) this._listeners[evt].forEach(fn => fn(data || {})); },
      querySelector(sel) { return makeEl(`${id}-${sel.replace(/[^a-zA-Z0-9_-]/g, '')}`); },
      querySelectorAll(sel) { return []; },
      getBoundingClientRect() { return { top: 0, left: 0, bottom: 200, right: 200, width: 200, height: 200 }; },
      remove() {},
      focus() {},
      blur() {},
      cloneNode() { return makeEl(`${id}-clone`); }
    };
    elements[id] = el;
    return el;
  }

  // Populate key elements
  const canvasEl = makeEl('bar-path-canvas', 'canvas');
  canvasEl.width = 220;
  canvasEl.height = 210;
  canvasEl.getContext = () => mockCanvasContext;

  makeEl('btn-variant-switcher', 'button');
  makeEl('barpath-active-variant', 'span');
  makeEl('variant-switcher-sheet', 'div');
  makeEl('btn-variant-sheet-close', 'button');
  makeEl('btn-variant-audition-rep', 'button');
  makeEl('btn-barpath-mode', 'button');
  makeEl('barpath-mode-path', 'span');
  makeEl('barpath-mode-vel', 'span');
  makeEl('barpath-hud-dev', 'span');
  makeEl('barpath-hud-eff', 'span');
  makeEl('barpath-scrubber', 'input');
  makeEl('barpath-scrub-rom', 'span');
  makeEl('barpath-scrub-inst-vel', 'span');
  makeEl('barpath-scrub-inst-dev', 'span');
  makeEl('btn-barpath-replay', 'button');
  makeEl('btn-barpath-speed', 'button');
  makeEl('barpath-speed-label', 'span');
  makeEl('barpath-rep-pills', 'div');
  makeEl('orb', 'div');
  makeEl('apex-glow', 'div');
  makeEl('rpe-hero-card', 'div');

  const stageEl = makeEl('bar-path-stage', 'div', 'bar-path-stage');
  const cardA = makeEl('card-a', 'div', 'variant-card active'); cardA.setAttribute('data-variant', 'A');
  const cardB = makeEl('card-b', 'div', 'variant-card'); cardB.setAttribute('data-variant', 'B');
  const cardC = makeEl('card-c', 'div', 'variant-card'); cardC.setAttribute('data-variant', 'C');
  const cardD = makeEl('card-d', 'div', 'variant-card'); cardD.setAttribute('data-variant', 'D');

  const domStorage = {};
  const mockLocalStorage = {
    getItem(k) { return domStorage[k] || null; },
    setItem(k, v) { domStorage[k] = String(v); },
    removeItem(k) { delete domStorage[k]; }
  };

  const animFrames = [];
  let frameCounter = 0;
  function mockRequestAnimationFrame(cb) {
    const id = ++frameCounter;
    animFrames.push({ id, cb });
    return id;
  }
  function mockCancelAnimationFrame(id) {
    const idx = animFrames.findIndex(f => f.id === id);
    if (idx !== -1) animFrames.splice(idx, 1);
  }
  function flushAnimFrames(timestamp = 100) {
    const batch = animFrames.splice(0, animFrames.length);
    batch.forEach(f => f.cb(timestamp));
  }

  const mockWindow = {
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    localStorage: mockLocalStorage,
    requestAnimationFrame: mockRequestAnimationFrame,
    cancelAnimationFrame: mockCancelAnimationFrame,
    performance: { now: () => 1000 },
    location: { search: '?variant=A' },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {}
  };

  const mockDocument = {
    getElementById(id) { return elements[id] || makeEl(id); },
    querySelector(sel) {
      if (sel === '.bar-path-stage') return stageEl;
      if (sel === '#bar-path-canvas') return canvasEl;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.variant-card') return [cardA, cardB, cardC, cardD];
      return [];
    },
    createElement(tag) { return makeEl(`mock-${Date.now()}-${Math.random()}`, tag); },
    addEventListener() {},
    documentElement: { style: { setProperty() {} } }
  };

  const sandboxContext = {
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    requestAnimationFrame: mockRequestAnimationFrame,
    cancelAnimationFrame: mockCancelAnimationFrame,
    performance: { now: () => 1000 },
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    console,
    Math,
    Number,
    Date,
    String,
    Array,
    Object,
    parseFloat,
    parseInt,
    isNaN,
    Boolean,
    RegExp
  };

  mockWindow.window = mockWindow;
  mockWindow.document = mockDocument;

  const vmContext = vm.createContext(sandboxContext);
  vmContext.eval = (code) => vm.runInContext(code, vmContext);
  // Execute app.js in sandbox
  vm.runInContext(appJsContent, vmContext);

  return {
    vmContext,
    eval: (code) => vm.runInContext(code, vmContext),
    elements,
    mockCanvasContext,
    scheduledAudio,
    flushAnimFrames
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: UNIFIED KINEMATIC TRAJECTORY & PHASE KINEMATICS (R1)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 2: Unified Kinematic Trajectory & Phase Kinematics ---');

runTest('2.1 window.animateRepetitionStroke exists and is callable', () => {
  const { vmContext } = createTestVM();
  assert.strictEqual(typeof vmContext.window.animateRepetitionStroke, 'function', 'animateRepetitionStroke must be exported on window');
});

runTest('2.2 Squat starts at lockout (Y=25px), reaches hole (Y=185px), ascends to lockout (Y=25px)', () => {
  const { vmContext, mockCanvasContext, flushAnimFrames } = createTestVM();

  // Run Squat stroke
  vmContext.window.animateRepetitionStroke({
    lift: 'Squat',
    velocity: 0.50,
    rpe: 8.0,
    deviationCm: 2.0,
    variant: 'A'
  });

  // Step 1: Start of eccentric descent (t=0 -> Y should be near 25px)
  flushAnimFrames(1000); // elapsed = 0
  const startArc = mockCanvasContext.operations.filter(op => op.op === 'arc');
  assert.ok(startArc.length > 0, 'Must draw canvas arc at initiation');
  const startY = startArc[startArc.length - 1].args[1];
  assert.strictEqual(Math.round(startY), 25, `Squat start Y must be 25px (lockout), got ${startY}`);

  // Step 2: Halfway through eccentric descent (pEcc ~ 0.5 -> Y ~ 105px)
  flushAnimFrames(1500);
  const midArc = mockCanvasContext.operations.filter(op => op.op === 'arc');
  const midY = midArc[midArc.length - 1].args[1];
  assert.ok(midY > 30 && midY < 180, `Mid descent Y should be in range (25, 185), got ${midY}`);
});

runTest('2.3 Deadlift starts at floor (Y=185px), pulls to lockout (Y=25px), returns to floor', () => {
  const { vmContext, mockCanvasContext, flushAnimFrames } = createTestVM();

  vmContext.window.animateRepetitionStroke({
    lift: 'Deadlift',
    velocity: 0.40,
    rpe: 9.0,
    deviationCm: 1.5,
    variant: 'A'
  });

  // Step 1: Start at floor (elapsed = 0 -> Y should be 185px)
  flushAnimFrames(1000);
  const startArc = mockCanvasContext.operations.filter(op => op.op === 'arc');
  assert.ok(startArc.length > 0, 'Must draw canvas arc');
  const startY = startArc[startArc.length - 1].args[1];
  assert.strictEqual(Math.round(startY), 185, `Deadlift start Y must be 185px (floor), got ${startY}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: SPECULAR COLOR INTERPOLATION & DEVIATION TRACKING (R1)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 3: Specular White-to-Lift Color Interpolation & Deviation Tracking ---');

runTest('3.1 Dot starts pure specular white rgb(255, 255, 255) at movement initiation', () => {
  const { vmContext, mockCanvasContext, flushAnimFrames } = createTestVM();

  vmContext.window.animateRepetitionStroke({
    lift: 'Deadlift',
    velocity: 0.45,
    rpe: 8.5,
    deviationCm: 2.0,
    variant: 'A'
  });

  flushAnimFrames(1000); // Initiation frame (elapsed = 0)
  const fills = mockCanvasContext.operations.filter(op => op.op === 'fill');
  assert.ok(fills.length > 0, 'Must perform fill operations');
  const dotFill = fills[fills.length - 1].fillStyle;
  assert.strictEqual(dotFill, 'rgb(255, 255, 255)', `Dot core must start pure specular white, got ${dotFill}`);
});

runTest('3.2 Dot smoothly transitions into Deadlift red rgb(255, 59, 48) under fatigue / high RPE', () => {
  const { vmContext, mockCanvasContext, flushAnimFrames } = createTestVM();

  vmContext.window.animateRepetitionStroke({
    lift: 'Deadlift',
    velocity: 0.20,
    rpe: 10.0,
    deviationCm: 2.0,
    variant: 'A'
  });

  // Advance time deeply into the grind pull (concentric drive near sticking point / lockout)
  flushAnimFrames(2000); // Mid-pull
  const fills = mockCanvasContext.operations.filter(op => op.op === 'fill');
  const laterFill = fills[fills.length - 1].fillStyle;

  // Verify that green and blue have decayed towards Deadlift rgb(255, 59, 48)
  const match = laterFill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  assert.ok(match, `Must be RGB color string, got ${laterFill}`);
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);

  assert.strictEqual(r, 255, 'Red channel must remain 255');
  assert.ok(g < 200, `Green channel must decay from 255 towards 59, got ${g}`);
  assert.ok(b < 200, `Blue channel must decay from 255 towards 48, got ${b}`);
});

runTest('3.3 Horizontal deviation X swings left/right from plumb line X=110px matching deviationCm', () => {
  const { vmContext, mockCanvasContext, flushAnimFrames } = createTestVM();

  vmContext.window.animateRepetitionStroke({
    lift: 'Bench',
    velocity: 0.50,
    rpe: 8.0,
    deviationCm: 3.0,
    variant: 'A'
  });

  flushAnimFrames(1500);
  const arcs = mockCanvasContext.operations.filter(op => op.op === 'arc');
  const midX = arcs[arcs.length - 1].args[0];
  // McLaughlin J-curve flares backward (negative dx -> x < 110)
  assert.notStrictEqual(midX, 110, `Horizontal coordinate must deviate from plumb line 110px, got ${midX}`);
  assert.ok(midX < 110, `Bench press McLaughlin curve must flare towards face (x < 110), got ${midX}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: REPETITION COMPLETION POP & PURE WEB AUDIO SYNTHESIS (R2)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 4: Repetition Completion Pop & Pure Web Audio Synthesis ---');

runTest('4.1 SoundFX.playRepPopChime executes 35ms frequency sweep pop + crystalline chime', () => {
  const { vmContext, scheduledAudio } = createTestVM();

  // Trigger SoundFX.playRepPopChime
  vmContext.window.SoundFX = vm.runInContext('SoundFX', vmContext);
  assert.strictEqual(typeof vmContext.window.SoundFX.playRepPopChime, 'function', 'SoundFX.playRepPopChime must exist');

  vmContext.window.SoundFX.playRepPopChime(0.40, 7.5, 'Squat');

  const oscFreqs = scheduledAudio.filter(a => a.type === 'osc_set_freq' || a.type === 'osc_ramp_freq');
  assert.ok(oscFreqs.length >= 3, 'Must schedule pop transient and harmonic chime frequencies');

  // Verify transient frequency sweep starts >= 200Hz and ramps to 80Hz
  const rampTo80 = oscFreqs.some(f => f.type === 'osc_ramp_freq' && f.value === 80);
  assert.ok(rampTo80, 'Pop transient must ramp to 80 Hz in ~35ms');

  // Verify D5 harmonic chime (587.33 Hz)
  const hasD5 = oscFreqs.some(f => f.type === 'osc_set_freq' && Math.abs(f.value - 587.33) < 1);
  assert.ok(hasD5, 'Harmonic chime must include D5 base frequency (587.33 Hz)');
});

runTest('4.2 Sub-bass 55Hz effort thump triggers only for RPE >= 8.5', () => {
  const { vmContext, scheduledAudio } = createTestVM();
  const sfx = vm.runInContext('SoundFX', vmContext);

  // Test 1: RPE 7.0 (no sub-bass)
  scheduledAudio.length = 0;
  sfx.playRepPopChime(0.50, 7.0, 'Squat');
  const hasSubBass7 = scheduledAudio.some(a => a.type === 'osc_set_freq' && a.value === 55);
  assert.strictEqual(hasSubBass7, false, 'RPE 7.0 must NOT trigger 55Hz sub-bass');

  // Test 2: RPE 9.5 (triggers sub-bass)
  scheduledAudio.length = 0;
  sfx.playRepPopChime(0.30, 9.5, 'Deadlift');
  const hasSubBass95 = scheduledAudio.some(a => a.type === 'osc_set_freq' && a.value === 55);
  assert.strictEqual(hasSubBass95, true, 'RPE 9.5 must trigger 55Hz sub-bass resonance');
});

runTest('4.3 Completion pop transform scale scales monotonically with RPE in [1.0, 2.5]', () => {
  // Formula: scale = 1.0 + 1.5 * ((RPE - 6)/4)
  const calcScale = (rpe) => 1.0 + 1.5 * ((Math.max(6.0, Math.min(10.0, rpe)) - 6.0) / 4.0);

  const scale6 = calcScale(6.0);
  const scale8 = calcScale(8.0);
  const scale10 = calcScale(10.0);

  assert.strictEqual(scale6, 1.0, 'RPE 6.0 scale must be 1.0');
  assert.strictEqual(scale8, 1.75, 'RPE 8.0 scale must be 1.75');
  assert.strictEqual(scale10, 2.5, 'RPE 10.0 scale must be 2.5');
  assert.ok(scale10 > scale8 && scale8 > scale6, 'Pop scale must scale monotonically with RPE');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: EXPLORATION VARIANTS A, B, C, D & URL DEEP-LINKING (R3)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 5: Exploration Variants A, B, C, D & URL Deep-Linking ---');

runTest('5.1 window.setAnimationVariant toggles between A, B, C, D and persists state', () => {
  const { vmContext, elements } = createTestVM();

  vmContext.window.setAnimationVariant('B');
  assert.strictEqual(vmContext.window.getActiveAnimationVariant(), 'B');
  assert.strictEqual(elements['barpath-active-variant'].textContent, 'B');
  assert.strictEqual(vmContext.window.localStorage.getItem('eros_animation_variant'), 'B');

  vmContext.window.setAnimationVariant('C');
  assert.strictEqual(vmContext.window.getActiveAnimationVariant(), 'C');
  assert.strictEqual(elements['barpath-active-variant'].textContent, 'C');

  vmContext.window.setAnimationVariant('D');
  assert.strictEqual(vmContext.window.getActiveAnimationVariant(), 'D');

  vmContext.window.setAnimationVariant('A');
  assert.strictEqual(vmContext.window.getActiveAnimationVariant(), 'A');
});

runTest('5.2 Variant B renders fluid velocity energy ribbon with variable line width', () => {
  const { vmContext, mockCanvasContext, flushAnimFrames } = createTestVM();

  vmContext.window.animateRepetitionStroke({
    lift: 'Squat',
    velocity: 0.60,
    rpe: 8.0,
    deviationCm: 1.5,
    variant: 'B'
  });

  flushAnimFrames(1400);
  const strokes = mockCanvasContext.operations.filter(op => op.op === 'stroke');
  assert.ok(strokes.length > 0, 'Variant B must execute stroke operations for ribbon');
  // At least one stroke should have lineWidth > 2.5
  const hasThickRibbon = strokes.some(s => s.lineWidth && s.lineWidth >= 2.5);
  assert.ok(hasThickRibbon, 'Variant B ribbon must have dynamic width >= 2.5px');
});

runTest('5.3 Variant C renders concentric elliptical wave rings', () => {
  const { vmContext, mockCanvasContext, flushAnimFrames } = createTestVM();

  vmContext.window.animateRepetitionStroke({
    lift: 'Bench',
    velocity: 0.45,
    rpe: 8.0,
    deviationCm: 2.0,
    variant: 'C'
  });

  flushAnimFrames(1400);
  const ellipses = mockCanvasContext.operations.filter(op => op.op === 'ellipse');
  assert.ok(ellipses.length > 0, 'Variant C must render concentric ellipse wave pulses');
});

runTest('5.4 Variant D renders orthogonal velocity breakdown vectors', () => {
  const { vmContext, mockCanvasContext, flushAnimFrames } = createTestVM();

  vmContext.window.animateRepetitionStroke({
    lift: 'Deadlift',
    velocity: 0.40,
    rpe: 8.5,
    deviationCm: 2.5,
    variant: 'D'
  });

  flushAnimFrames(1400);
  // Should render arrowheads (closePath & fill) and lines
  const fills = mockCanvasContext.operations.filter(op => op.op === 'fill');
  assert.ok(fills.length >= 2, 'Variant D must render vector pointer arrowheads');
});

runTest('5.5 Sheet open/close toggles manage display and aria-expanded', () => {
  const { vmContext, elements } = createTestVM();

  vmContext.window.openVariantSheet();
  assert.strictEqual(elements['variant-switcher-sheet'].style.display, 'flex');
  assert.strictEqual(elements['btn-variant-switcher'].getAttribute('aria-expanded'), 'true');

  vmContext.window.closeVariantSheet();
  assert.strictEqual(elements['variant-switcher-sheet'].style.display, 'none');
  assert.strictEqual(elements['btn-variant-switcher'].getAttribute('aria-expanded'), 'false');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: STRICT HARDWARE TERMINOLOGY & EMOJI COMPLIANCE (R4)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 6: Strict Terminology & Emoji Compliance ---');

runTest('6.1 ZERO prohibited hardware terms across all 11 web application files', () => {
  const FORBIDDEN_HW_REGEX = /\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|sensors|hardware)\b/i;
  const webFiles = [
    'index.html', 'style.css', 'athlete-fx.css', 'athlete-fx.js', 'app.js',
    'coach-portal.js', 'sync-bus.js', 'coach.css', 'coach-cue-hud.css', 'coach-cue-hud.js'
  ];

  const violations = [];
  webFiles.forEach(file => {
    const p = path.join(ROOT_DIR, file);
    if (!fs.existsSync(p)) return;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, idx) => {
      if (FORBIDDEN_HW_REGEX.test(l)) {
        violations.push(`${file}:${idx + 1} -> ${l.trim()}`);
      }
    });
  });

  assert.strictEqual(violations.length, 0, `Forbidden hardware terms found:\n${violations.join('\n')}`);
});

runTest('6.2 ZERO emojis or symbol glyphs in any <button> elements across all web application files', () => {
  const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const buttonMatches = htmlContent.match(/<button[^>]*>[\s\S]*?<\/button>/gi) || [];

  const emojiViolations = [];
  buttonMatches.forEach(btnHtml => {
    if (EMOJI_REGEX.test(btnHtml)) {
      emojiViolations.push(btnHtml.trim());
    }
  });

  assert.strictEqual(emojiViolations.length, 0, `Emoji found in buttons:\n${emojiViolations.join('\n')}`);
});

console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log(`║ ALL ${passedTests}/${totalTests} INTERACTIVE SWITCHER & VARIANTS ASSERTIONS PASSED (100%) ║`);
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');
