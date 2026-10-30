/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS EMPIRICAL ADVERSARIAL CHALLENGE HARNESS: COACH SYNC & ROSTER
 * File: tests/test_challenger_coach_sync_roster.js
 * 
 * Challenger Role: EMPIRICAL CHALLENGER 2 (critic, specialist)
 * Validates:
 *   1. Requirement R3 (Coach Console & Prescription Restructure):
 *      - Buttons inside #coach-squad-grid: assert ZERO sub-load, add-load, or +/-2.5kg buttons
 *      - #coach-feedback-console: next-rep load buttons and rest pills (60s, 90s, 120s, 180s, 300s)
 *      - Trigger clicks on rest pills: assert coach:rest_target emitted with correct payload
 *      - Fake athlete purge: scan for "Alex Vance", "Jordan Bell", "Elena Rostova", "Liam Thorne"
 *   2. Requirement R4 (Athlete Settings & Coach Connection):
 *      - Verify #btn-athlete-settings on #tab-history
 *      - Settings modal opening/closing, Crockford pairing code entry & normalization
 *      - LocalStorage persistence under 'eros_athlete_coach_connection_v1'
 *      - Real-time roster hydration via athlete:connect (single, multi-athlete, idempotent)
 *   3. Requirement R5 (Terminology & Invariants):
 *      - Regex audit across all web files for prohibited terms (WebBLE, 100Hz, ESP32, IMU, etc.)
 *      - VBT_Tracker isolation strictly to app.js:13
 *      - Canonical lift naming conventions
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const APP_JS_PATH = path.join(ROOT_DIR, 'app.js');
const COACH_PORTAL_JS_PATH = path.join(ROOT_DIR, 'coach-portal.js');
const SYNC_BUS_JS_PATH = path.join(ROOT_DIR, 'sync-bus.js');

const WEB_FILES = [
  'index.html',
  'style.css',
  'coach.css',
  'athlete-fx.css',
  'coach-cue-hud.css',
  'app.js',
  'coach-portal.js',
  'sync-bus.js',
  'athlete-fx.js',
  'coach-cue-hud.js'
];

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║  EROS ADVERSARIAL CHALLENGE HARNESS: COACH SYNC & ROSTER (R3, R4, R5)   ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝');

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
    if (err.stack) console.error(`         ${err.stack.split('\n').slice(1, 3).join('\n')}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM SIMULATION BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function createMockDomEnvironment() {
  function makeElement(id = '', tag = 'div', className = '') {
    let _cls = className || '';
    const el = {
      id: id || '',
      tagName: tag.toUpperCase(),
      get className() { return _cls; },
      set className(v) {
        _cls = v || '';
        this.classList._classes = new Set(_cls.split(' ').filter(Boolean));
      },
      classList: {
        _classes: new Set(className ? className.split(' ').filter(Boolean) : []),
        add(c) { this._classes.add(c); _cls = Array.from(this._classes).join(' '); },
        remove(c) { this._classes.delete(c); _cls = Array.from(this._classes).join(' '); },
        contains(c) { return this._classes.has(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this.contains(c)) this.remove(c); else this.add(c);
          } else if (force) this.add(c); else this.remove(c);
        }
      },
      style: {},
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'value') this.value = String(v); },
      getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : (k === 'value' ? this.value : null); },
      removeAttribute(k) { delete this.attributes[k]; },
      children: [],
      parentNode: null,
      appendChild(child) {
        if (!child) return null;
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter(c => c !== child);
        child.parentNode = null;
        return child;
      },
      _listeners: {},
      addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
      removeEventListener(ev, fn) {
        if (this._listeners[ev]) this._listeners[ev] = this._listeners[ev].filter(f => f !== fn);
      },
      click() {
        const cbs = this._listeners['click'] || [];
        cbs.forEach(cb => cb({
          stopPropagation: () => {},
          preventDefault: () => {},
          target: this
        }));
      },
      value: '',
      textContent: '',
      innerHTML: '',
      querySelector(sel) {
        return findInTree(this, sel, true);
      },
      querySelectorAll(sel) {
        return findInTree(this, sel, false);
      }
    };
    return el;
  }

  function matchNode(node, sel) {
    if (!node) return false;
    if (sel.startsWith('#')) return node.id === sel.slice(1);
    if (sel.startsWith('.')) return node.classList && node.classList.contains(sel.slice(1));
    
    // Tag with attribute: e.g. option[value="ath_01"] or [value="ath_01"]
    const tagAttrMatch = sel.match(/^([a-z0-9_-]+)?\[([a-z0-9_-]+)(?:=(['"]?)(.*?)\3)?\]$/i);
    if (tagAttrMatch) {
      const [, tag, attr, , val] = tagAttrMatch;
      if (tag && node.tagName && node.tagName.toLowerCase() !== tag.toLowerCase()) return false;
      if (val !== undefined) {
        const attrVal = node.getAttribute(attr);
        const propVal = node[attr];
        return attrVal === val || propVal === val;
      }
      return node.getAttribute(attr) !== null || node[attr] !== undefined;
    }

    if (node.tagName && node.tagName.toLowerCase() === sel.toLowerCase()) return true;
    return false;
  }

  function findInTree(root, sel, single = false) {
    const results = [];

    function traverse(node) {
      if (matchNode(node, sel)) {
        results.push(node);
        if (single) return;
      }
      for (const ch of node.children) {
        traverse(ch);
        if (single && results.length > 0) return;
      }
    }

    for (const ch of root.children) {
      traverse(ch);
      if (single && results.length > 0) return results[0];
    }
    return single ? (results[0] || null) : results;
  }

  const elementsMap = {};
  const doc = {
    readyState: 'complete',
    body: makeElement('body', 'body', 'theme-deadlift'),
    elements: elementsMap,
    getElementById(id) {
      if (!elementsMap[id]) {
        elementsMap[id] = makeElement(id);
        doc.body.appendChild(elementsMap[id]);
      }
      return elementsMap[id];
    },
    createElement(tag) { return makeElement('', tag); },
    querySelector(sel) { return doc.body.querySelector(sel); },
    querySelectorAll(sel) { return doc.body.querySelectorAll(sel); },
    _listeners: {},
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    dispatchEvent(ev) {
      const cbs = this._listeners[ev.type] || [];
      cbs.forEach(cb => cb(ev));
    }
  };

  const win = {
    document: doc,
    _listeners: {},
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener(ev, fn) {
      if (this._listeners[ev]) this._listeners[ev] = this._listeners[ev].filter(f => f !== fn);
    },
    dispatchEvent(ev) {
      const cbs = this._listeners[ev.type] || [];
      cbs.forEach(cb => cb(ev));
    },
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] !== undefined ? this._store[k] : null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; },
      clear() { this._store = {}; }
    },
    navigator: {
      clipboard: {
        writeText: () => Promise.resolve()
      }
    }
  };

  return { doc, win, makeElement };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE ADVERSARIAL CHALLENGES
// ─────────────────────────────────────────────────────────────────────────────
(async function executeAdversarialSuite() {

  const indexHtmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const appJsContent = fs.readFileSync(APP_JS_PATH, 'utf8');
  const coachPortalJsContent = fs.readFileSync(COACH_PORTAL_JS_PATH, 'utf8');
  const syncBusJsContent = fs.readFileSync(SYNC_BUS_JS_PATH, 'utf8');

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 1: REQUIREMENT R3 (COACH CONSOLE & PRESCRIPTION RESTRUCTURING)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SUITE 1: Requirement R3 (Coach Console & Prescription Restructure) ---');

  // 1.1 Live squad cards have ZERO load adjustment buttons in coach-portal.js
  runTest('1.1 Adversarial check: renderSquadOverview contains exactly 0 add-load / sub-load / +/-2.5 buttons', () => {
    // Assert static code pattern
    assert.strictEqual(/data-action="add-load"/.test(coachPortalJsContent), false, 'Must not contain data-action="add-load"');
    assert.strictEqual(/data-action="sub-load"/.test(coachPortalJsContent), false, 'Must not contain data-action="sub-load"');

    // Assert that in renderSquadOverview, cards only contain focus-btn
    const squadCardActionMatch = coachPortalJsContent.match(/coach-squad-card-actions[\s\S]*?<\/div>/g);
    assert.ok(squadCardActionMatch && squadCardActionMatch.length > 0, 'Must have coach-squad-card-actions container');
    squadCardActionMatch.forEach(block => {
      assert.strictEqual(block.includes('-2.5'), false, 'Action block must not contain -2.5');
      assert.strictEqual(block.includes('+2.5'), false, 'Action block must not contain +2.5');
      assert.strictEqual(block.includes('sub-load'), false, 'Action block must not contain sub-load');
      assert.strictEqual(block.includes('add-load'), false, 'Action block must not contain add-load');
      assert.ok(block.includes('data-action="focus"'), 'Action block must retain focus button');
    });
  });

  // 1.2 Dedicated next-rep load adjustment buttons in #coach-feedback-console
  runTest('1.2 Dedicated next-rep load buttons (+1.0 kg, +2.5 kg, +5.0 kg, -5.0 kg, -2.5 kg, Keep) in #coach-feedback-console', () => {
    assert.ok(indexHtmlContent.includes('id="coach-feedback-console"'), 'Must have #coach-feedback-console');
    
    // Assert load pills with data-delta attributes
    const expectedDeltas = ['-5.0', '-2.5', '0.0', '1.0', '2.5', '5.0'];
    expectedDeltas.forEach(delta => {
      const regex = new RegExp(`class="coach-load-pill[^"]*"[^>]*data-delta="${delta}"`);
      assert.ok(regex.test(indexHtmlContent), `Prescription console must contain load pill with data-delta="${delta}"`);
    });

    // Specifically verify the required +1.0 kg, +2.5 kg, +5.0 kg buttons
    assert.ok(/data-delta="1\.0">[\s\S]*?\+1\.0\s*kg/.test(indexHtmlContent), 'Must contain +1.0 kg button');
    assert.ok(/data-delta="2\.5">[\s\S]*?\+2\.5\s*kg/.test(indexHtmlContent), 'Must contain +2.5 kg button');
    assert.ok(/data-delta="5\.0">[\s\S]*?\+5\.0\s*kg/.test(indexHtmlContent), 'Must contain +5.0 kg button');
  });

  // 1.3 Target rest configuration pills (60s, 90s, 120s, 180s, 300s)
  runTest('1.3 Target rest configuration pills (60s, 90s, 120s, 180s, 300s) in #coach-feedback-console', () => {
    assert.ok(indexHtmlContent.includes('id="coach-rest-target-block"'), 'Must contain #coach-rest-target-block');
    const requiredRestSeconds = ['60', '90', '120', '180', '300'];
    requiredRestSeconds.forEach(sec => {
      const regex = new RegExp(`class="coach-rest-pill[^"]*"[^>]*data-rest-seconds="${sec}"`);
      assert.ok(regex.test(indexHtmlContent), `Must contain rest pill for ${sec}s with data-rest-seconds="${sec}"`);
    });
  });

  // 1.4 Dynamic Click & Event Emission on Rest Pills
  runTest('1.4 Trigger clicks on rest pills and assert coach:rest_target emitted with correct payload on ErosSyncBus', () => {
    const { doc, win, makeElement } = createMockDomEnvironment();
    global.window = win;
    global.document = doc;
    global.self = win;

    const { ErosEventBus } = require(SYNC_BUS_JS_PATH);
    const bus = new ErosEventBus({ channelName: 'test_rest_target_bus' });
    win.ErosSyncBus = bus;

    // Build rest pills DOM
    const feedbackConsole = doc.getElementById('coach-feedback-console');
    const restPills = [60, 90, 120, 180, 300].map(s => {
      const pill = makeElement('', 'button', 'coach-rest-pill');
      pill.setAttribute('data-rest-seconds', String(s));
      pill.textContent = `${s}s`;
      feedbackConsole.appendChild(pill);
      return pill;
    });

    // Provide querySelectorAll for .coach-rest-pill
    doc.querySelectorAll = (sel) => {
      if (sel === '.coach-rest-pill') return restPills;
      if (sel === '.coach-load-pill') return [];
      if (sel === '.coach-cue-chip') return [];
      return [];
    };

    // Load CoachPortal
    delete require.cache[require.resolve(COACH_PORTAL_JS_PATH)];
    const CoachPortal = require(COACH_PORTAL_JS_PATH);
    CoachPortal.init();

    const emittedRestEvents = [];
    bus.on('coach:rest_target', (payload) => {
      emittedRestEvents.push(payload);
    });

    let customEventDispatched = null;
    win.addEventListener('eros:coach_rest_target', (e) => {
      customEventDispatched = e.detail;
    });

    // Adversarially test clicking each pill in sequence
    const testCases = [60, 90, 120, 180, 300];
    testCases.forEach((expectedSec, index) => {
      const pill = restPills[index];
      pill.click();

      // Assert classList active state
      assert.strictEqual(pill.classList.contains('active'), true, `Pill ${expectedSec}s must have active class`);
      restPills.forEach((otherPill, otherIdx) => {
        if (otherIdx !== index) {
          assert.strictEqual(otherPill.classList.contains('active'), false, `Pill ${testCases[otherIdx]}s must not be active`);
        }
      });

      // Assert event payload
      assert.strictEqual(emittedRestEvents.length, index + 1, `Must emit coach:rest_target event for ${expectedSec}s`);
      const lastEvent = emittedRestEvents[emittedRestEvents.length - 1];
      assert.strictEqual(lastEvent.targetSeconds, expectedSec, `targetSeconds must match ${expectedSec}`);
      assert.strictEqual(lastEvent.athleteId, 'ath_01', 'athleteId must default to ath_01');
      assert.ok(typeof lastEvent.timestamp === 'number', 'timestamp must be numeric');

      // Assert CustomEvent detail
      assert.ok(customEventDispatched, 'CustomEvent eros:coach_rest_target must be dispatched');
      assert.strictEqual(customEventDispatched.targetSeconds, expectedSec);

      // Assert currentAthlete state updated
      const currentAth = CoachPortal.getCurrentAthlete();
      assert.strictEqual(currentAth.prescribedRestSeconds, expectedSec, `prescribedRestSeconds must be ${expectedSec}`);
    });
  });

  // 1.5 Adversarial scan for fake athletes: Alex Vance, Jordan Bell, Elena Rostova, Liam Thorne
  runTest('1.5 Adversarial scan: exactly 0 traces of fake athletes across index.html, coach-portal.js, app.js, sync-bus.js', () => {
    const FAKE_ATHLETES = ['Alex Vance', 'Jordan Bell', 'Elena Rostova', 'Liam Thorne'];
    const filesToCheck = [
      { name: 'index.html', content: indexHtmlContent },
      { name: 'coach-portal.js', content: coachPortalJsContent },
      { name: 'app.js', content: appJsContent },
      { name: 'sync-bus.js', content: syncBusJsContent }
    ];

    filesToCheck.forEach(file => {
      FAKE_ATHLETES.forEach(fake => {
        const found = file.content.includes(fake);
        assert.strictEqual(found, false, `Fake athlete "${fake}" MUST NOT exist in ${file.name}`);
      });
    });

    // Check DEFAULT_SQUAD_ATHLETES in coach-portal.js
    const defaultSquadMatch = coachPortalJsContent.match(/const DEFAULT_SQUAD_ATHLETES\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(defaultSquadMatch, 'Must find DEFAULT_SQUAD_ATHLETES definition');
    FAKE_ATHLETES.forEach(fake => {
      assert.strictEqual(defaultSquadMatch[1].includes(fake), false, `DEFAULT_SQUAD_ATHLETES must not contain ${fake}`);
    });

    // Check pendingBondRequests in coach-portal.js
    const pendingMatch = coachPortalJsContent.match(/let pendingBondRequests\s*=\s*(\[[\s\S]*?\]);/);
    assert.ok(pendingMatch, 'Must find pendingBondRequests definition');
    assert.strictEqual(pendingMatch[1].replace(/\s+/g, ''), '[]', 'pendingBondRequests must start as an empty array []');

    // Check #coach-athlete-select in index.html
    const selectMatch = indexHtmlContent.match(/<select id="coach-athlete-select"[\s\S]*?<\/select>/);
    assert.ok(selectMatch, 'Must find #coach-athlete-select in index.html');
    FAKE_ATHLETES.forEach(fake => {
      assert.strictEqual(selectMatch[0].includes(fake), false, `#coach-athlete-select must not contain ${fake}`);
    });
    assert.ok(selectMatch[0].includes('Active Athlete (Rack 01)'), '#coach-athlete-select must contain Active Athlete');
  });

  // 1.6 Clean empty state for squad overview
  runTest('1.6 Clean empty state rendered when squad is empty in renderSquadOverview', () => {
    assert.ok(
      coachPortalJsContent.includes('No bonded athletes connected'),
      'coach-portal.js must render "No bonded athletes connected" when squad is empty'
    );
    assert.ok(
      coachPortalJsContent.includes('coach-empty-stream-msg'),
      'coach-portal.js must render .coach-empty-stream-msg container'
    );
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 2: REQUIREMENT R4 (ATHLETE SETTINGS & COACH CONNECTION)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SUITE 2: Requirement R4 (Athlete Settings & Coach Connection) ---');

  // 2.1 #btn-athlete-settings exists in .history-top-bar on #tab-history
  runTest('2.1 #btn-athlete-settings exists inside .history-top-bar on #tab-history', () => {
    const historySectionMatch = indexHtmlContent.match(/<section id="tab-history"[\s\S]*?<\/section>/);
    assert.ok(historySectionMatch, 'Must find #tab-history section');
    const historySection = historySectionMatch[0];
    assert.ok(historySection.includes('class="history-top-bar"'), 'Must have .history-top-bar');
    assert.ok(historySection.includes('id="btn-athlete-settings"'), 'Must have #btn-athlete-settings');
  });

  // 2.2 Modal DOM structure & elements
  runTest('2.2 #athlete-settings-modal contains all required inputs, badges, and controls', () => {
    const requiredModalElements = [
      'athlete-settings-modal',
      'athlete-settings-backdrop',
      'btn-athlete-settings-close',
      'athlete-settings-name',
      'athlete-settings-rack',
      'athlete-settings-coach-code',
      'btn-athlete-connect-coach',
      'athlete-coach-status-badge'
    ];
    requiredModalElements.forEach(id => {
      assert.ok(indexHtmlContent.includes(`id="${id}"`), `Modal must contain #${id}`);
    });
    // Check Crockford placeholder
    assert.ok(/placeholder="EROS-7X9K"/.test(indexHtmlContent), 'Must have EROS-7X9K placeholder');
  });

  // 2.3 Modal Opening, Closing, Code Normalization & LocalStorage Persistence
  runTest('2.3 Simulate modal opening, Crockford code entry (lowercase, whitespace, custom), saving & persistence', () => {
    const { doc, win, makeElement } = createMockDomEnvironment();
    global.window = win;
    global.document = doc;
    global.self = win;

    const { ErosEventBus } = require(SYNC_BUS_JS_PATH);
    win.ErosSyncBus = new ErosEventBus({ channelName: 'test_settings_bus' });

    // Setup DOM elements for settings modal
    const btnSettings = doc.getElementById('btn-athlete-settings');
    const modal = doc.getElementById('athlete-settings-modal');
    modal.style.display = 'none';
    const btnClose = doc.getElementById('btn-athlete-settings-close');
    const backdrop = doc.getElementById('athlete-settings-backdrop');
    const nameInput = doc.getElementById('athlete-settings-name');
    const rackInput = doc.getElementById('athlete-settings-rack');
    const coachCodeInput = doc.getElementById('athlete-settings-coach-code');
    const btnConnect = doc.getElementById('btn-athlete-connect-coach');
    const btnConnectText = doc.getElementById('btn-athlete-connect-text');
    btnConnect.appendChild(btnConnectText);
    const statusBadge = doc.getElementById('athlete-coach-status-badge');
    const statusText = doc.getElementById('athlete-coach-status-text');

    // Load initAthleteSettings from app.js using vm
    const vm = require('vm');
    const match = appJsContent.match(/function initAthleteSettings\(\) \{([\s\S]*?)\n\}\r?\n\r?\nif \(typeof window !== 'undefined'\)/);
    assert.ok(match, 'Must extract initAthleteSettings from app.js');
    const initAthleteSettingsCode = `function initAthleteSettings() { ${match[1]} }`;
    const context = vm.createContext({
      document: doc,
      window: win,
      localStorage: win.localStorage,
      CustomEvent: function(name, opts) { this.type = name; this.detail = opts ? opts.detail : null; }
    });
    vm.runInContext(initAthleteSettingsCode, context);
    vm.runInContext('initAthleteSettings();', context);

    // Initial state check
    assert.strictEqual(modal.style.display, 'none', 'Modal initially closed');
    assert.strictEqual(statusText.textContent, 'Disconnected', 'Initial status Disconnected');

    // 1. Open modal via btnSettings click
    btnSettings.click();
    assert.strictEqual(modal.style.display, 'flex', 'Modal opens on #btn-athlete-settings click');

    // 2. Close modal via btnClose click
    btnClose.click();
    assert.strictEqual(modal.style.display, 'none', 'Modal closes on #btn-athlete-settings-close click');

    // 3. Re-open and close via backdrop click
    btnSettings.click();
    assert.strictEqual(modal.style.display, 'flex');
    backdrop.click();
    assert.strictEqual(modal.style.display, 'none', 'Modal closes on backdrop click');

    // 4. Test Crockford Pairing Code Entry with LOWERCASE and WHITESPACE: '  eros-7x9k  '
    btnSettings.click();
    nameInput.value = 'Challenger Athlete';
    rackInput.value = 'Rack 42';
    coachCodeInput.value = '  eros-7x9k  ';

    let capturedConnectPayload = null;
    win.ErosSyncBus.on('athlete:connect', (p) => { capturedConnectPayload = p; });

    btnConnect.click();

    // Verify UI state
    assert.strictEqual(statusBadge.classList.contains('status-connected'), true, 'Status badge must be connected');
    assert.strictEqual(statusText.textContent, 'Connected', 'Status text must be Connected');
    assert.strictEqual(btnConnectText.textContent, 'Disconnect from Coach', 'Button text updates');

    // Verify LocalStorage persistence
    const savedRaw = win.localStorage.getItem('eros_athlete_coach_connection_v1');
    assert.ok(savedRaw, 'Must save connection state to localStorage');
    const savedState = JSON.parse(savedRaw);
    assert.strictEqual(savedState.connected, true, 'connected must be true');
    assert.strictEqual(savedState.athleteName, 'Challenger Athlete', 'athleteName preserved');
    assert.strictEqual(savedState.rackId, 'Rack 42', 'rackId preserved');
    assert.strictEqual(savedState.coachCode, 'EROS-7X9K', 'coachCode must be sanitized to uppercase and trimmed EROS-7X9K');
    assert.strictEqual(savedState.athleteId, 'ath_01', 'athleteId must be ath_01');
    assert.ok(typeof savedState.lastSync === 'number', 'lastSync timestamp recorded');

    // Verify athlete:connect event emission
    assert.ok(capturedConnectPayload, 'athlete:connect must be emitted on ErosSyncBus');
    assert.strictEqual(capturedConnectPayload.athleteId, 'ath_01');
    assert.strictEqual(capturedConnectPayload.athleteName, 'Challenger Athlete');
    assert.strictEqual(capturedConnectPayload.rackId, 'Rack 42');
    assert.strictEqual(capturedConnectPayload.coachCode, 'EROS-7X9K');

    // 5. Test Disconnect Toggle
    btnConnect.click();
    assert.strictEqual(statusBadge.classList.contains('status-disconnected'), true, 'Status badge updates to disconnected');
    assert.strictEqual(statusText.textContent, 'Disconnected');
    assert.strictEqual(btnConnectText.textContent, 'Connect to Coach');
    const disconnectedState = JSON.parse(win.localStorage.getItem('eros_athlete_coach_connection_v1'));
    assert.strictEqual(disconnectedState.connected, false, 'connected must be false');

    // 6. Test Empty Code Fallback to Default 'EROS-7X9K'
    coachCodeInput.value = '';
    btnConnect.click();
    const fallbackState = JSON.parse(win.localStorage.getItem('eros_athlete_coach_connection_v1'));
    assert.strictEqual(fallbackState.connected, true);
    assert.strictEqual(fallbackState.coachCode, 'EROS-7X9K', 'Empty code must fallback to EROS-7X9K');
  });

  // 2.4 Real-time Roster Hydration via athlete:connect (single, multi-athlete, idempotency)
  runTest('2.4 Dynamic Roster Sync: athlete:connect adds/updates athletes in Coach view in real-time', () => {
    const { doc, win, makeElement } = createMockDomEnvironment();
    global.window = win;
    global.document = doc;
    global.self = win;

    const { ErosEventBus } = require(SYNC_BUS_JS_PATH);
    const bus = new ErosEventBus({ channelName: 'test_roster_sync_bus' });
    win.ErosSyncBus = bus;

    // Build coach DOM
    const athleteSelect = doc.getElementById('coach-athlete-select');
    const initialOpt = makeElement('', 'option');
    initialOpt.setAttribute('value', 'ath_01');
    initialOpt.value = 'ath_01';
    initialOpt.textContent = 'Active Athlete (Rack 01)';
    athleteSelect.appendChild(initialOpt);

    const squadGrid = doc.getElementById('coach-squad-grid');

    delete require.cache[require.resolve(COACH_PORTAL_JS_PATH)];
    const CoachPortal = require(COACH_PORTAL_JS_PATH);
    CoachPortal.init();

    // Verify initial squad
    const initialAthletes = CoachPortal.getSquadAthletes();
    assert.strictEqual(initialAthletes.length, 1, 'Initial squad has 1 athlete');
    assert.strictEqual(initialAthletes[0].id, 'ath_01');
    assert.strictEqual(athleteSelect.children.length, 1);

    // Test A: Update existing athlete ath_01 via athlete:connect
    bus.emit('athlete:connect', {
      athleteId: 'ath_01',
      athleteName: 'Zeus Thunder',
      rackId: 'Rack Olympus',
      coachCode: 'EROS-7X9K',
      timestamp: Date.now()
    });

    const updatedAthletes = CoachPortal.getSquadAthletes();
    assert.strictEqual(updatedAthletes.length, 1, 'Squad still has 1 athlete');
    assert.strictEqual(updatedAthletes[0].name, 'Zeus Thunder', 'Athlete name updated');
    assert.strictEqual(updatedAthletes[0].rack, 'Rack Olympus', 'Rack updated');
    assert.strictEqual(athleteSelect.children.length, 1, 'Dropdown options must not duplicate');
    assert.strictEqual(athleteSelect.children[0].textContent, 'Zeus Thunder (Rack Olympus)', 'Option text updated');

    // Test B: Dynamically connect a NEW athlete (ath_02)
    bus.emit('athlete:connect', {
      athleteId: 'ath_02',
      athleteName: 'Ares War',
      rackId: 'Rack 02',
      coachCode: 'EROS-7X9K',
      timestamp: Date.now()
    });

    const multiAthletes = CoachPortal.getSquadAthletes();
    assert.strictEqual(multiAthletes.length, 2, 'Squad must now contain 2 athletes');
    assert.strictEqual(multiAthletes[1].id, 'ath_02');
    assert.strictEqual(multiAthletes[1].name, 'Ares War');
    assert.strictEqual(multiAthletes[1].rack, 'Rack 02');

    // Verify select dropdown has 2 options
    assert.strictEqual(athleteSelect.children.length, 2, 'Dropdown must have 2 options');
    assert.strictEqual(athleteSelect.children[1].value, 'ath_02');
    assert.strictEqual(athleteSelect.children[1].textContent, 'Ares War (Rack 02)');

    // Test C: Idempotent re-connect for ath_02 with name modification
    bus.emit('athlete:connect', {
      athleteId: 'ath_02',
      athleteName: 'Ares Mars',
      rackId: 'Rack 02B',
      coachCode: 'EROS-7X9K',
      timestamp: Date.now()
    });

    const idempotentAthletes = CoachPortal.getSquadAthletes();
    assert.strictEqual(idempotentAthletes.length, 2, 'Squad count remains 2 (no duplicate entries)');
    assert.strictEqual(idempotentAthletes[1].name, 'Ares Mars');
    assert.strictEqual(idempotentAthletes[1].rack, 'Rack 02B');
    assert.strictEqual(athleteSelect.children.length, 2, 'Select count remains 2 (no duplicate option tags)');
    assert.strictEqual(athleteSelect.children[1].textContent, 'Ares Mars (Rack 02B)');

    // Test D: Edge cases: null / empty / malformed payloads validation and defensive handling
    assert.throws(() => bus.emit('athlete:connect', null), TypeError, 'bus.emit must reject null payload');
    assert.throws(() => bus.emit('athlete:connect', undefined), TypeError, 'bus.emit must reject undefined payload');
    
    // Empty object payload should be normalized by sync-bus validators
    bus.emit('athlete:connect', {});
    assert.strictEqual(CoachPortal.getSquadAthletes().length, 2, 'Defaulted object payload does not corrupt squad state');

    // Direct window CustomEvent with null/undefined detail must be handled defensively
    win.dispatchEvent({ type: 'eros:athlete_connect', detail: null });
    assert.strictEqual(CoachPortal.getSquadAthletes().length, 2, 'Null window event detail does not corrupt state');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 3: REQUIREMENT R5 (TERMINOLOGY & INVARIANTS)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SUITE 3: Requirement R5 (Terminology & Invariants) ---');

  // 3.1 Prohibited Terms Regex Audit across all web application files
  runTest('3.1 Adversarial regex audit: 0 prohibited hardware terms across all 10 web application files', () => {
    const PROHIBITED_REGEX = /\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|sensors|hardware)\b/i;
    const violations = [];

    WEB_FILES.forEach(filename => {
      const filePath = path.join(ROOT_DIR, filename);
      if (!fs.existsSync(filePath)) {
        violations.push(`Missing expected file: ${filename}`);
        return;
      }
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        const match = line.match(PROHIBITED_REGEX);
        if (match) {
          violations.push(`${filename}:${idx + 1} — Found forbidden term "${match[0]}": "${line.trim()}"`);
        }
      });
    });

    if (violations.length > 0) {
      console.error('  Violations found:\n' + violations.join('\n'));
    }
    assert.strictEqual(violations.length, 0, `Expected 0 prohibited term violations, found ${violations.length}`);
  });

  // 3.2 VBT_Tracker isolation strictly to app.js:13
  runTest('3.2 VBT_Tracker strictly isolated to app.js:13 (DEVICE_NAME constant)', () => {
    const matches = [];

    WEB_FILES.forEach(filename => {
      const filePath = path.join(ROOT_DIR, filename);
      if (!fs.existsSync(filePath)) return;
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('VBT_Tracker')) {
          matches.push({ file: filename, lineNum: idx + 1, text: line.trim() });
        }
      });
    });

    assert.strictEqual(matches.length, 1, `VBT_Tracker must appear strictly ONCE across all web files, found ${matches.length}`);
    assert.strictEqual(matches[0].file, 'app.js', 'VBT_Tracker must be located in app.js');
    assert.strictEqual(matches[0].lineNum, 13, 'VBT_Tracker must be on line 13 of app.js');
    assert.ok(matches[0].text.includes('DEVICE_NAME'), 'Line must be DEVICE_NAME definition');
  });

  // 3.3 Lift naming convention: Squat and Deadlift are always "Main"
  runTest('3.3 Canonical lift naming conventions: "Main squat", "Main deadlift", and "Bench"', () => {
    delete require.cache[require.resolve(COACH_PORTAL_JS_PATH)];
    const CoachPortal = require(COACH_PORTAL_JS_PATH);
    
    assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['squat', 'bench', 'deadlift']), 'SBD');
    assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['squat', 'bench']), 'Main squat + Bench');
    assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['deadlift', 'bench']), 'Main deadlift + Bench');
    assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['squat', 'deadlift']), 'Main squat + Main deadlift');
    assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['squat']), 'Main squat');
    assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['deadlift']), 'Main deadlift');
    assert.strictEqual(CoachPortal.formatCanonicalWorkoutName(['bench']), 'Bench');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // FINAL VERDICT SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log(`║ ADVERSARIAL HARNESS RESULTS: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}       ║`);
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  if (failedTests > 0) {
    console.error(`\n[CHALLENGER 2 VERDICT]: REQUEST_CHANGES (${failedTests} tests failed)`);
    process.exit(1);
  } else {
    console.log('\n[CHALLENGER 2 VERDICT]: APPROVE (100% empirical assertions verified)');
    process.exit(0);
  }

})();
