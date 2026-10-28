/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS — COACH GUIDANCE & CUEING HUD TEST SUITE (test_coach_cue_hud_e2e.js)
 * Tests in-flight cue pill, rest directive modal, 20s countdown ring,
 * audio chimes, sync bus coordination, and R4 terminology compliance.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Starting Coach Guidance & Cueing HUD Test Suite ===');

const ROOT_DIR = path.resolve(__dirname, '..');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const COACH_HUD_JS_PATH = path.join(ROOT_DIR, 'coach-cue-hud.js');
const COACH_HUD_CSS_PATH = path.join(ROOT_DIR, 'coach-cue-hud.css');
const SYNC_BUS_JS_PATH = path.join(ROOT_DIR, 'sync-bus.js');
const APP_JS_PATH = path.join(ROOT_DIR, 'app.js');

// ── 1. Static Content & R4 Compliance Audit ──
console.log('\n[TEST 1] Verifying Static Files & R4 Compliance...');
assert.ok(fs.existsSync(COACH_HUD_JS_PATH), 'coach-cue-hud.js must exist on disk');
assert.ok(fs.existsSync(COACH_HUD_CSS_PATH), 'coach-cue-hud.css must exist on disk');

const coachHudJsContent = fs.readFileSync(COACH_HUD_JS_PATH, 'utf8');
const coachHudCssContent = fs.readFileSync(COACH_HUD_CSS_PATH, 'utf8');
const indexHtmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const appJsContent = fs.readFileSync(APP_JS_PATH, 'utf8');

const FORBIDDEN_TERMS = ['webble', '100hz', 'esp32', 'esp32-c6', 'imu', 'madgwick', 'bluefy', 'sensor', 'hardware'];
for (const term of FORBIDDEN_TERMS) {
  const regex = new RegExp(`\\b${term}\\b`, 'i');
  assert.strictEqual(
    regex.test(coachHudJsContent),
    false,
    `coach-cue-hud.js must not contain forbidden hardware term: "${term}"`
  );
  assert.strictEqual(
    regex.test(coachHudCssContent),
    false,
    `coach-cue-hud.css must not contain forbidden hardware term: "${term}"`
  );
}

// Check for emojis
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert.strictEqual(EMOJI_REGEX.test(coachHudJsContent), false, 'coach-cue-hud.js must contain zero emojis');
assert.strictEqual(EMOJI_REGEX.test(coachHudCssContent), false, 'coach-cue-hud.css must contain zero emojis');

console.log('✔ R4 compliance passed: zero hardware terms and zero emojis.');

// ── 2. DOM Structure Verification in index.html ──
console.log('\n[TEST 2] Verifying DOM Elements in index.html...');
assert.ok(indexHtmlContent.includes('coach-cue-hud.css'), 'index.html must link coach-cue-hud.css');
assert.ok(indexHtmlContent.includes('coach-cue-hud.js'), 'index.html must include coach-cue-hud.js script');
assert.ok(indexHtmlContent.includes('id="coach-cue-hud"'), 'index.html must contain #coach-cue-hud element');
assert.ok(indexHtmlContent.includes('id="coach-cue-text"'), 'index.html must contain #coach-cue-text element');
assert.ok(indexHtmlContent.includes('id="coach-directive-modal"'), 'index.html must contain #coach-directive-modal element');
assert.ok(indexHtmlContent.includes('id="countdown-ring-svg"'), 'index.html must contain #countdown-ring-svg element');
assert.ok(indexHtmlContent.includes('id="coach-accept-ring"'), 'index.html must contain #coach-accept-ring element');
assert.ok(indexHtmlContent.includes('id="coach-countdown-sec"'), 'index.html must contain #coach-countdown-sec element');
assert.ok(indexHtmlContent.includes('id="btn-directive-accept"'), 'index.html must contain #btn-directive-accept element');
assert.ok(indexHtmlContent.includes('id="btn-directive-decline"'), 'index.html must contain #btn-directive-decline element');
console.log('✔ All required DOM elements present in index.html.');

// ── 3. SoundFX Method Verification in app.js ──
console.log('\n[TEST 3] Verifying SoundFX & HapticsFX in app.js...');
assert.ok(appJsContent.includes('playCoachDirectiveChime'), 'app.js SoundFX must define playCoachDirectiveChime');
assert.ok(appJsContent.includes('playCoachCueIncoming'), 'app.js SoundFX must define playCoachCueIncoming');
assert.ok(appJsContent.includes('vibrateCoachDirective'), 'app.js HapticsFX must define vibrateCoachDirective');
console.log('✔ Acoustic chime and haptic methods confirmed.');

// ── 4. Behavioral & Execution Simulation ──
console.log('\n[TEST 4] Running Headless Behavioral Simulation...');

// Create a mock DOM environment
function createMockElement(id, tag = 'div', classes = '') {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    className: classes,
    classList: {
      _classes: new Set(classes ? classes.split(' ') : []),
      add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
      remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
      contains(c) { return this._classes.has(c); }
    },
    style: {},
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    children: [],
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    prepend(child) { this.children.unshift(child); child.parentNode = this; return child; },
    removeChild(child) { this.children = this.children.filter(c => c !== child); },
    _listeners: {},
    addEventListener(evt, fn) {
      if (!this._listeners[evt]) this._listeners[evt] = [];
      this._listeners[evt].push(fn);
    },
    click() {
      if (this._listeners['click']) {
        for (const fn of this._listeners['click']) fn();
      }
    },
    textContent: '',
    value: '',
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const targetId = sel.substring(1);
        if (this.id === targetId) return this;
        for (const ch of this.children) {
          const found = ch.querySelector ? ch.querySelector(sel) : (ch.id === targetId ? ch : null);
          if (found) return found;
        }
      }
      if (sel.startsWith('.')) {
        const cls = sel.substring(1);
        if (this.classList && this.classList.contains(cls)) return this;
        for (const ch of this.children) {
          const found = ch.querySelector ? ch.querySelector(sel) : (ch.classList && ch.classList.contains(cls) ? ch : null);
          if (found) return found;
        }
      }
      return null;
    }
  };
  return el;
}

const mockDoc = {
  elements: {},
  getElementById(id) { return this.elements[id] || null; },
  createElement(tag) { return createMockElement('', tag); },
  body: createMockElement('body', 'body'),
  querySelector(sel) {
    if (sel.startsWith('#')) return this.getElementById(sel.substring(1));
    return this.body.querySelector(sel);
  }
};

// Setup DOM elements in mock environment
const cueHud = createMockElement('coach-cue-hud', 'div', 'coach-cue-hud');
const cueText = createMockElement('coach-cue-text', 'span', 'coach-cue-text');
cueHud.appendChild(cueText);

const modal = createMockElement('coach-directive-modal', 'div', 'coach-directive-modal');
const coachTitle = createMockElement('coach-directive-title', 'span');
const prevWeight = createMockElement('coach-prev-weight', 'span');
const newWeight = createMockElement('coach-new-weight', 'span');
const loadDelta = createMockElement('coach-load-delta', 'span');
const overrideReason = createMockElement('coach-override-reason', 'div');
const cueBox = createMockElement('coach-directive-cue-box', 'div');
const cueMessage = createMockElement('coach-directive-cue-text', 'p');
const countdownSvg = createMockElement('countdown-ring-svg', 'svg');
const ringFill = createMockElement('coach-accept-ring', 'circle');
const countdownSec = createMockElement('coach-countdown-sec', 'span');
const btnAccept = createMockElement('btn-directive-accept', 'button');
const btnDecline = createMockElement('btn-directive-decline', 'button');
const liveWeightInput = createMockElement('live-set-weight-input', 'input');
liveWeightInput.value = '140.0';

modal.appendChild(coachTitle);
modal.appendChild(prevWeight);
modal.appendChild(newWeight);
modal.appendChild(loadDelta);
modal.appendChild(overrideReason);
modal.appendChild(cueBox);
modal.appendChild(cueMessage);
modal.appendChild(countdownSvg);
modal.appendChild(ringFill);
modal.appendChild(countdownSec);
modal.appendChild(btnAccept);
modal.appendChild(btnDecline);

mockDoc.elements['coach-cue-hud'] = cueHud;
mockDoc.elements['coach-cue-text'] = cueText;
mockDoc.elements['coach-directive-modal'] = modal;
mockDoc.elements['coach-directive-title'] = coachTitle;
mockDoc.elements['coach-prev-weight'] = prevWeight;
mockDoc.elements['coach-new-weight'] = newWeight;
mockDoc.elements['coach-load-delta'] = loadDelta;
mockDoc.elements['coach-override-reason'] = overrideReason;
mockDoc.elements['coach-directive-cue-box'] = cueBox;
mockDoc.elements['coach-directive-cue-text'] = cueMessage;
mockDoc.elements['countdown-ring-svg'] = countdownSvg;
mockDoc.elements['coach-accept-ring'] = ringFill;
mockDoc.elements['coach-countdown-sec'] = countdownSec;
mockDoc.elements['btn-directive-accept'] = btnAccept;
mockDoc.elements['btn-directive-decline'] = btnDecline;
mockDoc.elements['live-set-weight-input'] = liveWeightInput;

// Mock window and SoundFX
let playedChime = false;
let currentWorkingWeightVal = 140.0;

const mockWindow = {
  document: mockDoc,
  SoundFX: {
    playCoachDirectiveChime() { playedChime = true; },
    playCoachCueIncoming() { playedChime = true; },
    playStepperTick() {},
    playNavTick() {}
  },
  HapticsFX: {
    vibrateCoachDirective() {},
    vibrate() {}
  },
  setWorkingWeight(val) {
    currentWorkingWeightVal = val;
    liveWeightInput.value = val.toFixed(1);
  },
  addEventListener() {},
  dispatchEvent() {},
  activeSet: null
};

// Load sync-bus.js in mock sandbox
const syncBusFactory = new Function('root', 'window', 'document', 'BroadcastChannel',
  fs.readFileSync(SYNC_BUS_JS_PATH, 'utf8') + '; return { ErosEventBus, ErosSyncBus };'
);
const { ErosSyncBus } = syncBusFactory(mockWindow, mockWindow, mockDoc, undefined);
mockWindow.ErosSyncBus = ErosSyncBus;

// Load coach-cue-hud.js in mock sandbox
const coachHudFactory = new Function('root', 'window', 'document', 'SoundFX', 'HapticsFX', 'setWorkingWeight', 'currentWorkingWeight',
  fs.readFileSync(COACH_HUD_JS_PATH, 'utf8') + '; return root.CoachCueHUD;'
);
const CoachCueHUD = coachHudFactory(mockWindow, mockWindow, mockDoc, mockWindow.SoundFX, mockWindow.HapticsFX, mockWindow.setWorkingWeight, currentWorkingWeightVal);

// ── Test 4A: In-flight Cue Display & Auto-Fade ──
console.log('Sub-test 4A: In-flight cue display and auto-fade...');
playedChime = false;
CoachCueHUD.showCoachCue('Drive hips with maximum velocity!', 100);

assert.strictEqual(cueText.textContent, 'Drive hips with maximum velocity!');
assert.strictEqual(cueHud.classList.contains('active'), true, 'Cue HUD must have active class');
assert.strictEqual(playedChime, true, 'SoundFX chime must play upon cue arrival');

// Wait for auto-dismiss timeout
setTimeout(() => {
  assert.strictEqual(CoachCueHUD.isCueVisible(), false, 'Cue HUD must fade out after duration');
  console.log('✔ In-flight cue display and auto-fade verified.');

  // ── Test 4B: Rest Period Coach Directive Modal & Decline ──
  console.log('Sub-test 4B: Rest period directive modal & Decline action...');
  let lastResponse = null;
  ErosSyncBus.on('coach:load_response', (payload) => {
    lastResponse = payload;
  });

  CoachCueHUD.showCoachDirective({
    id: 'test_override_01',
    coachName: 'Coach Marcus',
    deltaKg: -5.0,
    newWeight: 135.0,
    reason: 'Cutoff reached, reduce load',
    autoAcceptSeconds: 20
  });

  assert.strictEqual(CoachCueHUD.isModalVisible(), true, 'Directive modal must be open');
  assert.strictEqual(prevWeight.textContent, '140.0 kg');
  assert.strictEqual(newWeight.textContent, '135.0 kg');
  assert.strictEqual(loadDelta.textContent, '(-5.0 kg)');

  // Lifter clicks "Decline"
  CoachCueHUD.declineDirective();
  assert.strictEqual(CoachCueHUD.isModalVisible(), false, 'Modal must close on decline');
  assert.ok(lastResponse, 'coach:load_response must be emitted');
  assert.strictEqual(lastResponse.accepted, false, 'accepted must be false');
  assert.strictEqual(lastResponse.finalWeight, 140.0, 'Weight must remain 140.0 kg');
  assert.strictEqual(currentWorkingWeightVal, 140.0, 'Working weight must not change on decline');
  console.log('✔ Decline directive verified.');

  // ── Test 4C: Rest Period Coach Directive Modal & Accept ──
  console.log('Sub-test 4C: Rest period directive modal & Accept action...');
  lastResponse = null;
  CoachCueHUD.showCoachDirective({
    id: 'test_override_02',
    coachName: 'Coach Marcus',
    deltaKg: 2.5,
    newWeight: 142.5,
    reason: 'Power output high, progressive overload',
    autoAcceptSeconds: 20
  });

  assert.strictEqual(CoachCueHUD.isModalVisible(), true, 'Directive modal must be open');
  assert.strictEqual(newWeight.textContent, '142.5 kg');

  // Lifter clicks "Accept"
  CoachCueHUD.acceptDirective();
  assert.strictEqual(CoachCueHUD.isModalVisible(), false, 'Modal must close on accept');
  assert.ok(lastResponse, 'coach:load_response must be emitted');
  assert.strictEqual(lastResponse.accepted, true, 'accepted must be true');
  assert.strictEqual(lastResponse.finalWeight, 142.5, 'Weight must update to 142.5 kg');
  assert.strictEqual(currentWorkingWeightVal, 142.5, 'setWorkingWeight must be called with 142.5');
  console.log('✔ Accept directive verified.');

  // ── Test 4D: 20-Second SVG Countdown Ring Auto-Accept ──
  console.log('Sub-test 4D: 20-Second SVG Countdown Ring Auto-Accept on Timeout...');
  lastResponse = null;
  CoachCueHUD.showCoachDirective({
    id: 'test_override_03',
    coachName: 'Coach Marcus',
    deltaKg: 5.0,
    newWeight: 147.5,
    reason: 'Auto-accept timeout test',
    autoAcceptSeconds: 1 // Quick 1s timeout for fast test
  });

  assert.strictEqual(CoachCueHUD.isModalVisible(), true, 'Directive modal must be open');

  // Wait 1200ms for auto-accept expiration
  setTimeout(() => {
    assert.strictEqual(CoachCueHUD.isModalVisible(), false, 'Modal must close on auto-accept');
    assert.ok(lastResponse, 'coach:load_response must be emitted on auto-accept');
    assert.strictEqual(lastResponse.accepted, true, 'accepted must be true on auto-accept');
    assert.strictEqual(lastResponse.finalWeight, 147.5, 'Weight must update to 147.5 kg');
    assert.strictEqual(currentWorkingWeightVal, 147.5, 'setWorkingWeight must be called with 147.5');
    console.log('✔ 20-second SVG Countdown Ring Auto-Accept verified.');

    // ── Test 4E: Event Bus Hook Coordination ──
    console.log('Sub-test 4E: ErosSyncBus reactive event triggering...');
    ErosSyncBus.emit('coach:cue', {
      id: 'cue_event_test',
      text: 'Squeeze lats before floor break',
      type: 'technical'
    });
    assert.strictEqual(cueText.textContent, 'Squeeze lats before floor break');
    console.log('✔ ErosSyncBus coach:cue triggering verified.');

    console.log('\n=======================================================');
    console.log('ALL COACH GUIDANCE & CUEING HUD TESTS PASSED (100% OK)');
    console.log('=======================================================');
  }, 1300);
}, 250);
