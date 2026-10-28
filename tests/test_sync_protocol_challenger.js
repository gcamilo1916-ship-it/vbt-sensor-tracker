/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS EMPIRICAL CHALLENGE SUITE: SET SYNCHRONIZATION & PROTOCOL STRESS
 * File: tests/test_sync_protocol_challenger.js
 * 
 * Challenger Role: EMPIRICAL CHALLENGER (critic, specialist)
 * Validates:
 *   1. High-throughput set & repetition synchronization (rapid bursts, 0% data loss)
 *   2. Coach feedback loop (load override -> modal -> 20s auto-accept -> weight update -> coach:load_response)
 *   3. Boundary & payload validation stress (malformed, negative velocities, extreme loads, timestamps)
 *   4. Cross-tab BroadcastChannel concurrency & loopback prevention
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const SYNC_BUS_PATH = path.join(ROOT_DIR, 'sync-bus.js');
const COACH_PORTAL_PATH = path.join(ROOT_DIR, 'coach-portal.js');
const COACH_HUD_PATH = path.join(ROOT_DIR, 'coach-cue-hud.js');
const ATHLETE_FX_PATH = path.join(ROOT_DIR, 'athlete-fx.js');

const { ErosEventBus, ErosSyncBus, EVENTS } = require(SYNC_BUS_PATH);

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║       EROS SET SYNCHRONIZATION & PROTOCOL EMPIRICAL CHALLENGE HARNESS  ║');
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
    if (err.stack) console.error(`         ${err.stack.split('\n').slice(1, 3).join('\n')}`);
  }
}

// ── Mock DOM Builder Helper ──
function createMockDomEnvironment() {
  function makeElement(id = '', tag = 'div', className = '') {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      className,
      classList: {
        _classes: new Set(className.split(' ').filter(Boolean)),
        add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
        remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
        contains(c) { return this._classes.has(c); }
      },
      style: {},
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      children: [],
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      removeChild(c) { this.children = this.children.filter(x => x !== c); },
      _listeners: {},
      addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
      click() {
        if (this._listeners['click']) {
          this._listeners['click'].forEach(fn => fn({ stopPropagation: () => {} }));
        }
      },
      value: '',
      textContent: '',
      innerHTML: '',
      querySelector(sel) {
        if (sel.startsWith('#')) {
          const targetId = sel.substring(1);
          return doc.getElementById(targetId);
        }
        return makeElement();
      },
      querySelectorAll() { return []; }
    };
    return el;
  }

  const elementsMap = {};
  const doc = {
    readyState: 'complete',
    body: makeElement('body', 'body'),
    getElementById(id) {
      if (!elementsMap[id]) elementsMap[id] = makeElement(id);
      return elementsMap[id];
    },
    createElement(tag) { return makeElement('', tag); },
    querySelectorAll() { return []; },
    addEventListener() {}
  };

  const win = {
    document: doc,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] || null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; }
    }
  };

  return { doc, win, makeElement };
}

(async function main() {

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 1: HIGH-THROUGHPUT SET AND REPETITION SYNCHRONIZATION
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SUITE 1: High-Throughput Set & Repetition Synchronization ---');

  runTest('1.1 Rapid Burst: 5 Sets of 8 Reps (40 reps total) with 0% data loss', () => {
    const bus = new ErosEventBus({ channelName: 'test_sync_suite1_1' });
    const receivedStarts = [];
    const receivedReps = [];
    const receivedCompletions = [];

    bus.on('set:started', (payload) => receivedStarts.push(payload));
    bus.on('rep:recorded', (payload) => receivedReps.push(payload));
    bus.on('set:completed', (payload) => receivedCompletions.push(payload));

    const NUM_SETS = 5;
    const REPS_PER_SET = 8;
    const TOTAL_EXPECTED_REPS = NUM_SETS * REPS_PER_SET;

    // Simulate athlete recording 5 sets of 8 reps
    for (let s = 1; s <= NUM_SETS; s++) {
      const setId = `set_burst_${s}`;
      const weight = 140.0 + (s - 1) * 5.0;
      bus.emit('set:started', {
        setId,
        setNumber: s,
        lift: 'Deadlift',
        weight,
        timestamp: Date.now() + s * 1000
      });

      const repsInSet = [];
      for (let r = 1; r <= REPS_PER_SET; r++) {
        const vel = Math.round((0.85 - (r - 1) * 0.04) * 100) / 100;
        const repPayload = bus.emit('rep:recorded', {
          setId,
          repNumber: r,
          velocity: vel,
          peakVelocity: Math.round((vel * 1.25) * 100) / 100,
          rom: 54.0,
          rpe: 7.0 + r * 0.25,
          lossPercent: Math.round(((0.85 - vel) / 0.85 * 100) * 10) / 10
        });
        repsInSet.push(repPayload);
      }

      bus.emit('set:completed', {
        setId,
        setNumber: s,
        lift: 'Deadlift',
        weight,
        reps: repsInSet,
        avgVelocity: 0.72,
        maxVelocity: 0.85,
        velocityLoss: 32.9,
        timestamp: Date.now() + s * 1000 + 30000
      });
    }

    assert.strictEqual(receivedStarts.length, NUM_SETS, `Must receive exactly ${NUM_SETS} set:started events`);
    assert.strictEqual(receivedReps.length, TOTAL_EXPECTED_REPS, `Must receive exactly ${TOTAL_EXPECTED_REPS} rep:recorded events`);
    assert.strictEqual(receivedCompletions.length, NUM_SETS, `Must receive exactly ${NUM_SETS} set:completed events`);

    // Verify ordering and integrity
    for (let i = 0; i < TOTAL_EXPECTED_REPS; i++) {
      const expectedSetNum = Math.floor(i / REPS_PER_SET) + 1;
      const expectedRepNum = (i % REPS_PER_SET) + 1;
      const rep = receivedReps[i];
      assert.strictEqual(rep.setId, `set_burst_${expectedSetNum}`);
      assert.strictEqual(rep.repNumber, expectedRepNum);
      assert.ok(typeof rep.velocity === 'number' && rep.velocity > 0);
      assert.ok(typeof rep.peakVelocity === 'number' && rep.peakVelocity >= rep.velocity);
      assert.ok(typeof rep.lossPercent === 'number');
    }

    bus.destroy();
  });

  runTest('1.2 Stress Extreme Burst: 10 Sets of 10 Reps (100 reps back-to-back synchronously)', () => {
    const bus = new ErosEventBus({ channelName: 'test_sync_suite1_2', maxHistory: 200 });
    let repCount = 0;
    bus.on('rep:recorded', () => { repCount++; });

    const startT = Date.now();
    for (let s = 1; s <= 10; s++) {
      bus.emit('set:started', { setId: `heavy_s${s}`, setNumber: s, lift: 'Squat', weight: 180 });
      for (let r = 1; r <= 10; r++) {
        bus.emit('rep:recorded', { setId: `heavy_s${s}`, repNumber: r, velocity: 0.60 });
      }
      bus.emit('set:completed', { setId: `heavy_s${s}`, setNumber: s, lift: 'Squat', weight: 180, reps: [] });
    }
    const elapsed = Date.now() - startT;

    assert.strictEqual(repCount, 100, 'Must record 100 reps without dropping any in synchronous burst');
    assert.ok(elapsed < 1000, `Synchronous 100-rep burst must complete in <1s (took ${elapsed}ms)`);
    assert.strictEqual(bus.getHistory(200).length, 120, 'History must contain all 10 starts + 100 reps + 10 completes = 120 events');

    bus.destroy();
  });

  await runAsyncTest('1.3 Asynchronous Microtask Interleaved Bursts (rep cadences 5-10ms)', async () => {
    const bus = new ErosEventBus({ channelName: 'test_sync_suite1_3' });
    const received = [];
    bus.on('rep:recorded', (p) => received.push(p));

    const emitRepAsync = (setId, repNumber, delayMs) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          bus.emit('rep:recorded', { setId, repNumber, velocity: 0.70 });
          resolve();
        }, delayMs);
      });
    };

    const tasks = [];
    for (let r = 1; r <= 25; r++) {
      tasks.push(emitRepAsync('async_set_1', r, r * 4));
    }
    await Promise.all(tasks);

    assert.strictEqual(received.length, 25, 'All 25 async reps must arrive in exact order');
    for (let i = 0; i < 25; i++) {
      assert.strictEqual(received[i].repNumber, i + 1, `Rep order must be preserved: got ${received[i].repNumber}, expected ${i+1}`);
    }

    bus.destroy();
  });

  await runAsyncTest('1.4 Cross-Tab High-Throughput Sync (Athlete Bus -> BroadcastChannel -> Coach Bus)', async () => {
    const channelName = 'eros_test_crosstab_burst_' + Date.now();
    const athleteBus = new ErosEventBus({ channelName, busId: 'bus_athlete_tab' });
    const coachBus = new ErosEventBus({ channelName, busId: 'bus_coach_tab' });

    const coachReceivedStarts = [];
    const coachReceivedReps = [];
    const coachReceivedCompletions = [];

    coachBus.on('set:started', (p) => coachReceivedStarts.push(p));
    coachBus.on('rep:recorded', (p) => coachReceivedReps.push(p));
    coachBus.on('set:completed', (p) => coachReceivedCompletions.push(p));

    const NUM_SETS = 5;
    const REPS_PER_SET = 8;
    const TOTAL_REPS = NUM_SETS * REPS_PER_SET;

    for (let s = 1; s <= NUM_SETS; s++) {
      const setId = `xtab_s${s}`;
      athleteBus.emit('set:started', { setId, setNumber: s, lift: 'Bench Press', weight: 100.0 });
      for (let r = 1; r <= REPS_PER_SET; r++) {
        athleteBus.emit('rep:recorded', { setId, repNumber: r, velocity: 0.80 - r * 0.02 });
      }
      athleteBus.emit('set:completed', { setId, setNumber: s, lift: 'Bench Press', weight: 100.0 });
    }

    // Allow BroadcastChannel microtask propagation across event loops
    await new Promise(r => setTimeout(r, 150));

    assert.strictEqual(coachReceivedStarts.length, NUM_SETS, `Coach tab must receive ${NUM_SETS} set starts across BroadcastChannel`);
    assert.strictEqual(coachReceivedReps.length, TOTAL_REPS, `Coach tab must receive all ${TOTAL_REPS} reps across BroadcastChannel`);
    assert.strictEqual(coachReceivedCompletions.length, NUM_SETS, `Coach tab must receive ${NUM_SETS} set completions across BroadcastChannel`);

    athleteBus.destroy();
    coachBus.destroy();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 2: COACH FEEDBACK LOOP
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SUITE 2: Coach Feedback Loop & Directive Auto-Accept ---');

  runTest('2.1 Coach Load Override (+2.5 kg) -> Athlete Accept -> coach:load_response received', () => {
    const { doc, win } = createMockDomEnvironment();
    const bus = new ErosEventBus({ channelName: 'test_feedback_accept' });
    win.ErosSyncBus = bus;

    let receivedResponse = null;
    bus.on('coach:load_response', (p) => { receivedResponse = p; });

    let currentWorkingWeightVal = 140.0;
    const setWorkingWeightFn = (w) => {
      currentWorkingWeightVal = w;
      doc.getElementById('live-set-weight-input').value = w.toFixed(1);
    };

    // Instantiate CoachCueHUD
    const coachHudFactory = new Function('root', 'window', 'document', 'SoundFX', 'HapticsFX', 'setWorkingWeight', 'currentWorkingWeight',
      fs.readFileSync(COACH_HUD_PATH, 'utf8') + '; return root.CoachCueHUD;'
    );
    const CoachCueHUD = coachHudFactory(win, win, doc, {}, {}, setWorkingWeightFn, currentWorkingWeightVal);

    // Coach sends load override
    bus.emit('coach:load_override', {
      id: 'ovr_accept_01',
      deltaKg: 2.5,
      newWeight: 142.5,
      autoAcceptSeconds: 20
    });

    assert.strictEqual(CoachCueHUD.isModalVisible(), true, 'Directive modal must display on Athlete view');
    assert.strictEqual(doc.getElementById('coach-new-weight').textContent, '142.5 kg');
    assert.strictEqual(doc.getElementById('coach-load-delta').textContent, '(+2.5 kg)');

    // Athlete taps Accept
    CoachCueHUD.acceptDirective();

    assert.strictEqual(CoachCueHUD.isModalVisible(), false, 'Directive modal must close after Accept');
    assert.ok(receivedResponse, 'coach:load_response event must be received on sync bus');
    assert.strictEqual(receivedResponse.id, 'ovr_accept_01');
    assert.strictEqual(receivedResponse.accepted, true);
    assert.strictEqual(receivedResponse.finalWeight, 142.5);
    assert.strictEqual(currentWorkingWeightVal, 142.5, 'Application working weight must update to 142.5 kg');

    bus.destroy();
  });

  runTest('2.2 Coach Load Override (-5.0 kg) -> Athlete Decline -> working weight preserved', () => {
    const { doc, win } = createMockDomEnvironment();
    const bus = new ErosEventBus({ channelName: 'test_feedback_decline' });
    win.ErosSyncBus = bus;

    let receivedResponse = null;
    bus.on('coach:load_response', (p) => { receivedResponse = p; });

    let currentWorkingWeightVal = 140.0;
    const setWorkingWeightFn = (w) => { currentWorkingWeightVal = w; };

    const coachHudFactory = new Function('root', 'window', 'document', 'SoundFX', 'HapticsFX', 'setWorkingWeight', 'currentWorkingWeight',
      fs.readFileSync(COACH_HUD_PATH, 'utf8') + '; return root.CoachCueHUD;'
    );
    const CoachCueHUD = coachHudFactory(win, win, doc, {}, {}, setWorkingWeightFn, currentWorkingWeightVal);

    bus.emit('coach:load_override', {
      id: 'ovr_decline_02',
      deltaKg: -5.0,
      newWeight: 135.0,
      autoAcceptSeconds: 20
    });

    assert.strictEqual(CoachCueHUD.isModalVisible(), true);

    // Athlete taps Decline
    CoachCueHUD.declineDirective();

    assert.strictEqual(CoachCueHUD.isModalVisible(), false);
    assert.ok(receivedResponse);
    assert.strictEqual(receivedResponse.id, 'ovr_decline_02');
    assert.strictEqual(receivedResponse.accepted, false);
    assert.strictEqual(receivedResponse.finalWeight, 140.0);
    assert.strictEqual(currentWorkingWeightVal, 140.0, 'Working weight must remain 140.0 kg');

    bus.destroy();
  });

  await runAsyncTest('2.3 20s Auto-Accept Timer Expiration -> Auto-Accept -> Weight Updated & Coach Console Feedback', async () => {
    const { doc, win } = createMockDomEnvironment();
    const bus = new ErosEventBus({ channelName: 'test_feedback_auto_accept' });
    win.ErosSyncBus = bus;

    let coachResponseReceived = null;
    bus.on('coach:load_response', (p) => { coachResponseReceived = p; });

    let currentWorkingWeightVal = 140.0;
    const setWorkingWeightFn = (w) => {
      currentWorkingWeightVal = w;
      doc.getElementById('live-set-weight-input').value = w.toFixed(1);
    };

    const coachHudFactory = new Function('root', 'window', 'document', 'SoundFX', 'HapticsFX', 'setWorkingWeight', 'currentWorkingWeight',
      fs.readFileSync(COACH_HUD_PATH, 'utf8') + '; return root.CoachCueHUD;'
    );
    const CoachCueHUD = coachHudFactory(win, win, doc, {}, {}, setWorkingWeightFn, currentWorkingWeightVal);

    // Coach sends load override with 1-second autoAcceptSeconds for fast deterministic test
    bus.emit('coach:load_override', {
      id: 'ovr_auto_03',
      deltaKg: 5.0,
      newWeight: 145.0,
      autoAcceptSeconds: 1
    });

    assert.strictEqual(CoachCueHUD.isModalVisible(), true, 'Modal open initially');
    assert.strictEqual(coachResponseReceived, null, 'No response yet before countdown expires');

    // Wait 1200ms for countdown interval to expire and auto-accept
    await new Promise(r => setTimeout(r, 1200));

    assert.strictEqual(CoachCueHUD.isModalVisible(), false, 'Modal closed after auto-accept');
    assert.ok(coachResponseReceived, 'coach:load_response must be emitted upon auto-accept');
    assert.strictEqual(coachResponseReceived.id, 'ovr_auto_03');
    assert.strictEqual(coachResponseReceived.accepted, true);
    assert.strictEqual(coachResponseReceived.finalWeight, 145.0);
    assert.strictEqual(currentWorkingWeightVal, 145.0, 'Working weight automatically updated to 145.0 kg');

    bus.destroy();
  });

  await runAsyncTest('2.4 Cross-Tab Feedback Loop: Coach Console -> Athlete Tab -> Coach Console Confirmation', async () => {
    const channelName = 'eros_test_feedback_xtab_' + Date.now();
    const coachBus = new ErosEventBus({ channelName, busId: 'bus_coach_cockpit' });
    const athleteBus = new ErosEventBus({ channelName, busId: 'bus_athlete_device' });

    let athleteWorkingWeight = 150.0;
    let coachReceivedConfirmation = null;

    coachBus.on('coach:load_response', (p) => {
      coachReceivedConfirmation = p;
    });

    // Athlete listener
    athleteBus.on('coach:load_override', (cmd) => {
      // Simulate athlete auto-accepting directive
      athleteWorkingWeight = cmd.newWeight;
      athleteBus.emit('coach:load_response', {
        id: cmd.id,
        accepted: true,
        finalWeight: cmd.newWeight,
        timestamp: Date.now()
      });
    });

    // Coach emits load override
    coachBus.emit('coach:load_override', {
      id: 'xtab_cmd_101',
      deltaKg: 2.5,
      newWeight: 152.5,
      autoAcceptSeconds: 20
    });

    await new Promise(r => setTimeout(r, 100));

    assert.ok(coachReceivedConfirmation, 'Coach bus must receive coach:load_response across channel');
    assert.strictEqual(coachReceivedConfirmation.id, 'xtab_cmd_101');
    assert.strictEqual(coachReceivedConfirmation.accepted, true);
    assert.strictEqual(coachReceivedConfirmation.finalWeight, 152.5);
    assert.strictEqual(athleteWorkingWeight, 152.5);

    coachBus.destroy();
    athleteBus.destroy();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 3: BOUNDARY & PAYLOAD VALIDATION STRESS
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SUITE 3: Boundary & Payload Validation Stress ---');

  runTest('3.1 Malformed / Primitive Payloads Rejected for All Event Types', () => {
    const bus = new ErosEventBus({ channelName: 'test_val_malformed' });
    const allEvents = Object.values(ErosEventBus.EVENTS);
    const badPayloads = [null, undefined, 42, 'string', true, Symbol('bad')];

    for (const evt of allEvents) {
      for (const bad of badPayloads) {
        assert.throws(() => {
          bus.emit(evt, bad);
        }, TypeError, `Event ${evt} must throw TypeError for primitive payload ${String(bad)}`);
      }
    }
    bus.destroy();
  });

  runTest('3.2 Missing Required Fields Rejection', () => {
    const bus = new ErosEventBus({ channelName: 'test_val_missing_fields' });

    // set:started missing setId
    assert.throws(() => bus.emit('set:started', { setNumber: 1, lift: 'Deadlift', weight: 140 }), TypeError);
    // set:started invalid setNumber <= 0
    assert.throws(() => bus.emit('set:started', { setId: 's1', setNumber: 0, lift: 'Deadlift', weight: 140 }), TypeError);
    // set:started missing lift
    assert.throws(() => bus.emit('set:started', { setId: 's1', setNumber: 1, lift: '', weight: 140 }), TypeError);
    // set:started negative weight
    assert.throws(() => bus.emit('set:started', { setId: 's1', setNumber: 1, lift: 'Deadlift', weight: -5 }), TypeError);

    // rep:recorded missing setId
    assert.throws(() => bus.emit('rep:recorded', { repNumber: 1, velocity: 0.7 }), TypeError);
    // rep:recorded invalid repNumber
    assert.throws(() => bus.emit('rep:recorded', { setId: 's1', repNumber: -1, velocity: 0.7 }), TypeError);

    // set:completed missing setId
    assert.throws(() => bus.emit('set:completed', { setNumber: 1, lift: 'Squat', weight: 100 }), TypeError);

    // coach:cue missing text
    assert.throws(() => bus.emit('coach:cue', { text: '' }), TypeError);
    assert.throws(() => bus.emit('coach:cue', {}), TypeError);

    // coach:load_override missing deltaKg
    assert.throws(() => bus.emit('coach:load_override', { newWeight: 140 }), TypeError);
    // coach:load_override negative newWeight
    assert.throws(() => bus.emit('coach:load_override', { deltaKg: 2.5, newWeight: -10 }), TypeError);

    // coach:load_response missing id
    assert.throws(() => bus.emit('coach:load_response', { accepted: true, finalWeight: 140 }), TypeError);
    // coach:load_response negative finalWeight
    assert.throws(() => bus.emit('coach:load_response', { id: 'x', accepted: true, finalWeight: -5 }), TypeError);

    bus.destroy();
  });

  runTest('3.3 Negative Velocities Strictly Rejected', () => {
    const bus = new ErosEventBus({ channelName: 'test_val_negative_vel' });

    assert.throws(() => {
      bus.emit('rep:recorded', { setId: 's1', repNumber: 1, velocity: -0.01 });
    }, TypeError, 'Negative velocity -0.01 must be rejected');

    assert.throws(() => {
      bus.emit('rep:recorded', { setId: 's1', repNumber: 1, velocity: -1.5 });
    }, TypeError, 'Negative velocity -1.5 must be rejected');

    assert.throws(() => {
      bus.emit('rep:recorded', { setId: 's1', repNumber: 1, velocity: -Infinity });
    }, TypeError, '-Infinity velocity must be rejected');

    // Zero velocity (isometric hold / grind stall) must be accepted
    const zeroVel = bus.emit('rep:recorded', { setId: 's1', repNumber: 1, velocity: 0.0 });
    assert.strictEqual(zeroVel.velocity, 0.0, 'Zero velocity must be accepted');

    bus.destroy();
  });

  runTest('3.4 Extreme Loads (0.0 kg to 600.0 kg) and Decimal Rounding', () => {
    const bus = new ErosEventBus({ channelName: 'test_val_extreme_loads' });

    // Boundary 0.0 kg (bodyweight / empty bar / PVC)
    const zeroLoad = bus.emit('set:started', { setId: 's0', setNumber: 1, lift: 'Squat', weight: 0.0 });
    assert.strictEqual(zeroLoad.weight, 0.0);

    // Boundary 600.0 kg (maximum world-record powerlifting boundary)
    const maxLoad = bus.emit('set:started', { setId: 's600', setNumber: 1, lift: 'Deadlift', weight: 600.0 });
    assert.strictEqual(maxLoad.weight, 600.0);

    // Floating-point decimal rounding (e.g. 142.3333333 -> 142.3)
    const roundedLoad = bus.emit('coach:load_override', { deltaKg: 2.333333, newWeight: 142.333333 });
    assert.strictEqual(roundedLoad.deltaKg, 2.3);
    assert.strictEqual(roundedLoad.newWeight, 142.3);

    // Coach load response extreme loads
    const respZero = bus.emit('coach:load_response', { id: 'r0', accepted: true, finalWeight: 0.0 });
    assert.strictEqual(respZero.finalWeight, 0.0);

    const respMax = bus.emit('coach:load_response', { id: 'r600', accepted: true, finalWeight: 600.0 });
    assert.strictEqual(respMax.finalWeight, 600.0);

    bus.destroy();
  });

  runTest('3.5 Missing and Malformed Timestamps Default to Date.now()', () => {
    const bus = new ErosEventBus({ channelName: 'test_val_timestamps' });
    const beforeT = Date.now();

    // Omitted timestamp
    const resOmitted = bus.emit('set:started', { setId: 's1', setNumber: 1, lift: 'Deadlift', weight: 140 });
    assert.ok(typeof resOmitted.timestamp === 'number');
    assert.ok(resOmitted.timestamp >= beforeT && resOmitted.timestamp <= Date.now() + 50);

    // Malformed timestamp (NaN)
    const resNaN = bus.emit('coach:cue', { text: 'Lockout hard!', timestamp: NaN });
    assert.ok(typeof resNaN.timestamp === 'number' && !isNaN(resNaN.timestamp));

    // Explicit valid timestamp preserved
    const explicitT = 1700000000000;
    const resExplicit = bus.emit('set:completed', { setId: 's1', setNumber: 1, lift: 'Deadlift', weight: 140, timestamp: explicitT });
    assert.strictEqual(resExplicit.timestamp, explicitT);

    bus.destroy();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 4: CROSS-TAB / BROADCASTCHANNEL CONCURRENCY & LOOPBACK PREVENTION
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SUITE 4: BroadcastChannel Concurrency & Loopback Prevention ---');

  await runAsyncTest('4.1 Loopback Prevention: Originator Does NOT Re-Receive Echo from BroadcastChannel', async () => {
    const channelName = 'eros_test_loopback_' + Date.now();
    const busA = new ErosEventBus({ channelName, busId: 'bus_originator_A' });
    const busB = new ErosEventBus({ channelName, busId: 'bus_listener_B' });

    let busADispatchCount = 0;
    let busBDispatchCount = 0;
    let busAOriginatorFlags = [];
    let busBOriginatorFlags = [];

    busA.on('rep:recorded', (p, meta) => {
      busADispatchCount++;
      busAOriginatorFlags.push(meta.isOriginator);
    });

    busB.on('rep:recorded', (p, meta) => {
      busBDispatchCount++;
      busBOriginatorFlags.push(meta.isOriginator);
    });

    // Bus A emits 1 rep
    busA.emit('rep:recorded', { setId: 'loop_1', repNumber: 1, velocity: 0.65 });

    // Wait for BroadcastChannel round-trip
    await new Promise(r => setTimeout(r, 120));

    // Bus A must have received EXACTLY 1 dispatch (the local one), NOT a second loopback echo!
    assert.strictEqual(busADispatchCount, 1, `Bus A must dispatch once locally without loopback echo (dispatched ${busADispatchCount} times)`);
    assert.strictEqual(busAOriginatorFlags[0], true, 'Bus A local dispatch must have isOriginator = true');

    // Bus B must have received exactly 1 dispatch from the network with isOriginator = false
    assert.strictEqual(busBDispatchCount, 1, 'Bus B must receive 1 network dispatch');
    assert.strictEqual(busBOriginatorFlags[0], false, 'Bus B remote dispatch must have isOriginator = false');

    busA.destroy();
    busB.destroy();
  });

  await runAsyncTest('4.2 Multi-Instance Concurrency (4 simultaneous buses interleaving traffic)', async () => {
    const channelName = 'eros_test_quad_concurrency_' + Date.now();
    const buses = [
      new ErosEventBus({ channelName, busId: 'bus_quad_1' }),
      new ErosEventBus({ channelName, busId: 'bus_quad_2' }),
      new ErosEventBus({ channelName, busId: 'bus_quad_3' }),
      new ErosEventBus({ channelName, busId: 'bus_quad_4' })
    ];

    const logs = [[], [], [], []];
    buses.forEach((b, idx) => {
      b.on('*', (evt, data, meta) => {
        logs[idx].push({ evt, data, isOriginator: meta.isOriginator });
      });
    });

    // Interleave events from all 4 buses concurrently
    buses[0].emit('set:started', { setId: 'c_s1', setNumber: 1, lift: 'Deadlift', weight: 200 });
    buses[1].emit('coach:cue', { id: 'cue_1', text: 'Brace core' });
    buses[2].emit('coach:load_override', { id: 'ovr_1', deltaKg: 5, newWeight: 205 });
    buses[3].emit('coach:load_response', { id: 'ovr_1', accepted: true, finalWeight: 205 });

    await new Promise(r => setTimeout(r, 150));

    // Every bus must have observed all 4 events exactly once
    for (let i = 0; i < 4; i++) {
      assert.strictEqual(logs[i].length, 4, `Bus ${i+1} must record all 4 interleaved events (recorded ${logs[i].length})`);
      const eventTypes = logs[i].map(x => x.evt).sort();
      assert.deepStrictEqual(eventTypes, ['coach:cue', 'coach:load_override', 'coach:load_response', 'set:started'].sort());
    }

    buses.forEach(b => b.destroy());
  });

  runTest('4.3 Fault Isolation: Unhandled Exception in Subscriber Does Not Halt Bus or Disrupt Peers', () => {
    const bus = new ErosEventBus({ channelName: 'test_fault_isolation' });
    let healthySubscriberRan = false;

    // Faulty subscriber that throws error
    bus.on('rep:recorded', () => {
      throw new Error('Fatal explosion in third-party listener');
    });

    // Healthy subscriber registered afterwards
    bus.on('rep:recorded', () => {
      healthySubscriberRan = true;
    });

    // Suppress console.error during this test
    const origError = console.error;
    console.error = () => {};
    try {
      bus.emit('rep:recorded', { setId: 'fault_s1', repNumber: 1, velocity: 0.75 });
    } finally {
      console.error = origError;
    }

    assert.strictEqual(healthySubscriberRan, true, 'Healthy subscriber must still run despite preceding listener error');
    bus.destroy();
  });

  runTest('4.4 Bus Lifecycle & Destruction Cleanup', () => {
    const bus = new ErosEventBus({ channelName: 'test_destroy_cleanup' });
    let callCount = 0;
    bus.on('set:started', () => { callCount++; });

    bus.emit('set:started', { setId: 's1', setNumber: 1, lift: 'Squat', weight: 100 });
    assert.strictEqual(callCount, 1);

    bus.destroy();
    assert.strictEqual(bus.isClosed, true);
    assert.strictEqual(bus.channel, null);
    assert.strictEqual(bus.listenerCount('set:started'), 0);

    // Emitting on destroyed bus must be safe no-op
    bus.emit('set:started', { setId: 's2', setNumber: 2, lift: 'Squat', weight: 100 });
    assert.strictEqual(callCount, 1, 'No callbacks must fire after destroy()');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 5: ADVERSARIAL STRESS, DEDUPLICATION, RE-ENTRANCY & TERMINOLOGY
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n--- SUITE 5: Adversarial Stress, Deduplication, Re-entrancy & Terminology ---');

  runTest('5.1 Duplicate Retransmission Deduplication in Coach Portal Handlers', () => {
    const { doc, win } = createMockDomEnvironment();
    global.document = doc;
    global.window = win;
    const bus = new ErosEventBus({ channelName: 'test_dedup_suite5_1' });
    win.ErosSyncBus = bus;
    global.ErosSyncBus = bus;

    const coachPortal = require(COACH_PORTAL_PATH);
    coachPortal.init();

    // Emit set:started twice with identical setId
    bus.emit('set:started', { setId: 'dedup_set_01', setNumber: 1, lift: 'Deadlift', weight: 140.0 });
    bus.emit('set:started', { setId: 'dedup_set_01', setNumber: 1, lift: 'Deadlift', weight: 140.0 });

    // Emit rep 1 twice (e.g. network retransmit)
    bus.emit('rep:recorded', { setId: 'dedup_set_01', repNumber: 1, velocity: 0.65 });
    bus.emit('rep:recorded', { setId: 'dedup_set_01', repNumber: 1, velocity: 0.65 });

    // Emit rep 2 once
    bus.emit('rep:recorded', { setId: 'dedup_set_01', repNumber: 2, velocity: 0.62 });

    // Check DOM stream output
    const streamHtml = doc.getElementById('coach-live-reps-stream').innerHTML;
    const r1Matches = (streamHtml.match(/R1:/g) || []).length;
    const r2Matches = (streamHtml.match(/R2:/g) || []).length;
    assert.strictEqual(r1Matches, 1, `Coach reps stream must deduplicate identical rep 1; R1 appeared ${r1Matches} times`);
    assert.strictEqual(r2Matches, 1, `Coach reps stream must contain rep 2; R2 appeared ${r2Matches} times`);

    bus.destroy();
  });

  runTest('5.2 Aborted Sets & Zero-Rep Set Completion Resilience', () => {
    const bus = new ErosEventBus({ channelName: 'test_aborted_set' });
    let completedSetReceived = null;
    bus.on('set:completed', (p) => { completedSetReceived = p; });

    // Lifter un-racks bar, aborts set immediately, zero reps recorded
    const completed = bus.emit('set:completed', {
      setId: 'abort_s1',
      setNumber: 1,
      lift: 'Bench Press',
      weight: 120.0,
      reps: [],
      avgVelocity: 0,
      maxVelocity: 0,
      velocityLoss: 0
    });

    assert.ok(completed);
    assert.strictEqual(completed.reps.length, 0);
    assert.strictEqual(completed.avgVelocity, 0);
    assert.strictEqual(completedSetReceived.setId, 'abort_s1');

    bus.destroy();
  });

  runTest('5.3 High Velocity Catapult & High-Precision Decimal Rounding', () => {
    const bus = new ErosEventBus({ channelName: 'test_precision' });

    // 4.25 m/s jump shrug / catapult rep with 7 decimal places
    const rep = bus.emit('rep:recorded', {
      setId: 's_jump',
      repNumber: 1,
      velocity: 4.2567891,
      peakVelocity: 5.1234567,
      rom: 68.7491,
      rpe: 6.5432,
      lossPercent: 0.1234
    });

    assert.strictEqual(rep.velocity, 4.26, 'Velocity must round to 2 decimals (4.26)');
    assert.strictEqual(rep.peakVelocity, 5.12, 'Peak velocity must round to 2 decimals (5.12)');
    assert.strictEqual(rep.rom, 68.7, 'ROM must round to 1 decimal (68.7)');
    assert.strictEqual(rep.rpe, 6.5, 'RPE must round to 1 decimal (6.5)');
    assert.strictEqual(rep.lossPercent, 0.1, 'Loss percent must round to 1 decimal (0.1)');

    bus.destroy();
  });

  runTest('5.4 Rapid Mode Switching under In-Flight Telemetry (50 toggles)', () => {
    const { doc, win } = createMockDomEnvironment();
    global.document = doc;
    global.window = win;
    const bus = new ErosEventBus({ channelName: 'test_mode_switch' });
    win.ErosSyncBus = bus;
    global.ErosSyncBus = bus;

    const coachPortal = require(COACH_PORTAL_PATH);
    coachPortal.init();

    // Toggle 50 times rapidly while reps arrive
    for (let i = 0; i < 50; i++) {
      const mode = (i % 2 === 0) ? 'coach' : 'athlete';
      coachPortal.switchMode(mode);
      bus.emit('rep:recorded', {
        setId: 'toggle_set_1',
        repNumber: (i % 10) + 1,
        velocity: 0.75 - (i % 5) * 0.05
      });
    }

    assert.strictEqual(coachPortal.getIsCoachMode(), false, 'Final mode should be athlete');
    coachPortal.switchMode('coach');
    assert.strictEqual(coachPortal.getIsCoachMode(), true, 'Must successfully switch back to coach mode');

    bus.destroy();
  });

  runTest('5.5 Storage Quota Exceeded Resilience (No Unhandled Exceptions on localStorage failure)', () => {
    const { doc, win } = createMockDomEnvironment();
    // Simulate quota exceeded
    win.localStorage.setItem = () => {
      const err = new Error('QuotaExceededError: DOM Exception 22');
      err.name = 'QuotaExceededError';
      throw err;
    };

    // Bus without BroadcastChannel to force localStorage fallback path
    const origBC = global.BroadcastChannel;
    global.BroadcastChannel = undefined;

    const bus = new ErosEventBus({ channelName: 'test_storage_quota_safe' });
    let localReceived = null;
    bus.on('set:started', (p) => { localReceived = p; });

    // Emitting must not crash even though localStorage.setItem throws
    assert.doesNotThrow(() => {
      bus.emit('set:started', { setId: 'quota_s1', setNumber: 1, lift: 'Deadlift', weight: 160 });
    }, 'Bus emit must survive localStorage QuotaExceededError gracefully');

    assert.ok(localReceived, 'Local listeners must still receive payload despite storage failure');

    global.BroadcastChannel = origBC;
    bus.destroy();
  });

  runTest('5.6 Requirement R4 Terminology Audit: Zero Forbidden Hardware Strings in sync-bus.js', () => {
    const syncBusContent = fs.readFileSync(SYNC_BUS_PATH, 'utf8');
    const forbidden = ['webble', '100hz', 'esp32', 'esp32-c6', 'imu', 'madgwick', 'bluefy', 'sensor', 'firmware'];

    for (const term of forbidden) {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      assert.strictEqual(
        regex.test(syncBusContent),
        false,
        `sync-bus.js must contain ZERO occurrences of "${term}"`
      );
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log(`║ CHALLENGE HARNESS COMPLETED: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests} ║`);
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
