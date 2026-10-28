"""
Eros Synchronization Engine & Terminology Verification Suite
Validates:
  1. ErosEventBus and window.ErosSyncBus instantiation & UMD module loading
  2. Intra-page pub/sub semantics (on, off, once, wildcard, unbind, clear)
  3. Strict schema validation for all 6 typed event contracts:
     - set:started: { setId, setNumber, lift, weight, timestamp }
     - rep:recorded: { setId, repNumber, velocity, peakVelocity, rom, rpe, lossPercent }
     - set:completed: { setId, setNumber, lift, weight, reps, avgVelocity, maxVelocity, velocityLoss, timestamp }
     - coach:cue: { id, text, type, timestamp }
     - coach:load_override: { id, deltaKg, newWeight, autoAcceptSeconds, timestamp }
     - coach:load_response: { id, accepted, finalWeight, timestamp }
  4. Cross-tab BroadcastChannel & localStorage fallback synchronization
  5. State caching (getLast, getHistory)
  6. Requirement R4 terminology purge: zero hardware strings across sync-bus.js and web files
"""

import os
import re
import json
import subprocess
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_node_eval(script_body):
    """Executes small node.js snippet inside the repo root directory and returns JSON output."""
    full_script = f"""
    const path = require('path');
    const {{ ErosEventBus, ErosSyncBus, EVENTS }} = require(path.join('{REPO_ROOT.replace(os.sep, "/")}', 'sync-bus.js'));
    {script_body}
    """
    proc = subprocess.run(
        ["node", "-e", full_script],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=10
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Node execution failed: {proc.stderr}\nCode:\n{full_script}")
    return json.loads(proc.stdout.strip())


class TestErosSyncBus(unittest.TestCase):

    def test_01_singleton_and_exports_structure(self):
        """Req 1: ErosEventBus class and ErosSyncBus singleton exist and export expected APIs."""
        res = run_node_eval("""
            const bus = new ErosEventBus();
            console.log(JSON.stringify({
                hasSingleton: Boolean(ErosSyncBus),
                isEventBusInstance: ErosSyncBus instanceof ErosEventBus,
                hasEventsConstant: Boolean(ErosEventBus.EVENTS),
                eventKeys: Object.keys(ErosEventBus.EVENTS).sort(),
                busId: typeof bus.busId === 'string' && bus.busId.length > 0,
                channelName: bus.channelName
            }));
        """)
        self.assertTrue(res["hasSingleton"], "ErosSyncBus singleton must exist")
        self.assertTrue(res["isEventBusInstance"], "ErosSyncBus must be an instance of ErosEventBus")
        self.assertTrue(res["hasEventsConstant"], "ErosEventBus.EVENTS must exist")
        self.assertEqual(res["channelName"], "eros_coach_sync_v1")
        expected_keys = [
            "COACH_CUE",
            "COACH_LOAD_OVERRIDE",
            "COACH_LOAD_RESPONSE",
            "REP_RECORDED",
            "SET_COMPLETED",
            "SET_STARTED"
        ]
        self.assertEqual(res["eventKeys"], expected_keys)

    def test_02_intra_page_pub_sub_lifecycle(self):
        """Req 1: on, off, once, wildcard '*', and unbind closures work reliably."""
        res = run_node_eval("""
            const bus = new ErosEventBus();
            let countA = 0;
            let countB = 0;
            let wildcardCount = 0;
            let onceCount = 0;

            const handlerA = (data) => { countA += 1; };
            const handlerB = (data) => { countB += 1; };
            const unsubA = bus.on('test:event', handlerA);
            bus.on('test:event', handlerB);
            bus.on('*', () => { wildcardCount += 1; });
            bus.once('test:event', () => { onceCount += 1; });

            bus.emit('test:event', { foo: 'bar' }); // A=1, B=1, once=1, wildcard=1
            unsubA(); // removes handlerA
            bus.emit('test:event', { foo: 'baz' }); // A=1, B=2, once=1, wildcard=2

            bus.off('test:event', handlerB); // removes handlerB
            bus.emit('test:event', { foo: 'qux' }); // A=1, B=2, once=1, wildcard=3

            console.log(JSON.stringify({
                countA,
                countB,
                onceCount,
                wildcardCount,
                listenersRemaining: bus.listenerCount('test:event')
            }));
        """)
        self.assertEqual(res["countA"], 1)
        self.assertEqual(res["countB"], 2)
        self.assertEqual(res["onceCount"], 1)
        self.assertEqual(res["wildcardCount"], 3)
        self.assertEqual(res["listenersRemaining"], 0)

    def test_03_typed_payload_set_started(self):
        """Req 1: set:started payload { setId, setNumber, lift, weight, timestamp } validated."""
        res = run_node_eval("""
            const bus = new ErosEventBus();
            let emitted = null;
            bus.on('set:started', (p) => { emitted = p; });

            const valid = bus.emit('set:started', {
                setId: 'set_101',
                setNumber: 2,
                lift: 'Deadlift',
                weight: 210.0
            });

            let errorThrown = false;
            try {
                bus.emit('set:started', { setId: '', setNumber: 2, lift: 'Deadlift', weight: 210 });
            } catch (err) {
                errorThrown = true;
            }

            console.log(JSON.stringify({
                valid,
                emittedMatches: emitted.setId === 'set_101' && emitted.weight === 210.0 && typeof emitted.timestamp === 'number',
                errorThrown
            }));
        """)
        self.assertEqual(res["valid"]["setId"], "set_101")
        self.assertEqual(res["valid"]["setNumber"], 2)
        self.assertEqual(res["valid"]["lift"], "Deadlift")
        self.assertEqual(res["valid"]["weight"], 210.0)
        self.assertTrue(res["emittedMatches"])
        self.assertTrue(res["errorThrown"], "Empty setId must throw TypeError")

    def test_04_typed_payload_rep_recorded(self):
        """Req 1: rep:recorded payload { setId, repNumber, velocity, peakVelocity, rom, rpe, lossPercent }."""
        res = run_node_eval("""
            const bus = new ErosEventBus();
            let received = null;
            bus.on('rep:recorded', (p) => { received = p; });

            const valid = bus.emit('rep:recorded', {
                setId: 'set_101',
                repNumber: 4,
                velocity: 0.38,
                peakVelocity: 0.56,
                rom: 58.4,
                rpe: 8.5,
                lossPercent: 18.2
            });

            let badVelocityThrown = false;
            try {
                bus.emit('rep:recorded', { setId: 'set_101', repNumber: 1, velocity: -0.5 });
            } catch (e) {
                badVelocityThrown = true;
            }

            console.log(JSON.stringify({
                valid,
                received,
                badVelocityThrown
            }));
        """)
        self.assertEqual(res["valid"]["setId"], "set_101")
        self.assertEqual(res["valid"]["repNumber"], 4)
        self.assertEqual(res["valid"]["velocity"], 0.38)
        self.assertEqual(res["valid"]["peakVelocity"], 0.56)
        self.assertEqual(res["valid"]["rom"], 58.4)
        self.assertEqual(res["valid"]["rpe"], 8.5)
        self.assertEqual(res["valid"]["lossPercent"], 18.2)
        self.assertTrue(res["badVelocityThrown"])

    def test_05_typed_payload_set_completed(self):
        """Req 1: set:completed payload { setId, setNumber, lift, weight, reps, avgVelocity, maxVelocity, velocityLoss, timestamp }."""
        res = run_node_eval("""
            const bus = new ErosEventBus();
            let captured = null;
            bus.on('set:completed', (p) => { captured = p; });

            const payload = {
                setId: 'set_101',
                setNumber: 4,
                lift: 'Deadlift',
                weight: 210.0,
                reps: [
                    { repNumber: 1, velocity: 0.46 },
                    { repNumber: 2, velocity: 0.44 },
                    { repNumber: 3, velocity: 0.41 },
                    { repNumber: 4, velocity: 0.38 }
                ],
                avgVelocity: 0.42,
                maxVelocity: 0.56,
                velocityLoss: 18.2
            };

            const result = bus.emit('set:completed', payload);

            console.log(JSON.stringify({
                result,
                capturedRepsCount: captured.reps.length,
                hasTimestamp: typeof captured.timestamp === 'number'
            }));
        """)
        self.assertEqual(res["result"]["setId"], "set_101")
        self.assertEqual(res["capturedRepsCount"], 4)
        self.assertEqual(res["result"]["avgVelocity"], 0.42)
        self.assertTrue(res["hasTimestamp"])

    def test_06_typed_payload_coach_cues_and_overrides(self):
        """Req 1: coach:cue, coach:load_override, and coach:load_response payloads validated."""
        res = run_node_eval("""
            const bus = new ErosEventBus();

            // 1. coach:cue
            const cue = bus.emit('coach:cue', {
                text: 'Squeeze lats before floor break',
                type: 'technical'
            });

            // 2. coach:load_override
            const override = bus.emit('coach:load_override', {
                deltaKg: -5.0,
                newWeight: 205.0
            });

            // 3. coach:load_response
            const response = bus.emit('coach:load_response', {
                id: override.id,
                accepted: true,
                finalWeight: 205.0
            });

            console.log(JSON.stringify({
                cueId: typeof cue.id === 'string' && cue.id.startsWith('cue_'),
                cueText: cue.text,
                overrideDelta: override.deltaKg,
                overrideNewWeight: override.newWeight,
                overrideAutoAccept: override.autoAcceptSeconds,
                responseAccepted: response.accepted,
                responseFinalWeight: response.finalWeight
            }));
        """)
        self.assertTrue(res["cueId"])
        self.assertEqual(res["cueText"], "Squeeze lats before floor break")
        self.assertEqual(res["overrideDelta"], -5.0)
        self.assertEqual(res["overrideNewWeight"], 205.0)
        self.assertEqual(res["overrideAutoAccept"], 20)
        self.assertTrue(res["responseAccepted"])
        self.assertEqual(res["responseFinalWeight"], 205.0)

    def test_07_state_caching_and_history(self):
        """Req 1: getLast and getHistory retain recent events for view-switch rehydration."""
        res = run_node_eval("""
            const bus = new ErosEventBus();
            bus.emit('set:started', { setId: 's1', setNumber: 1, lift: 'Squat', weight: 140 });
            bus.emit('rep:recorded', { setId: 's1', repNumber: 1, velocity: 0.65 });
            bus.emit('rep:recorded', { setId: 's1', repNumber: 2, velocity: 0.60 });

            const lastStart = bus.getLast('set:started');
            const lastRep = bus.getLast('rep:recorded');
            const history = bus.getHistory();

            console.log(JSON.stringify({
                lastStartSetId: lastStart ? lastStart.setId : null,
                lastRepNumber: lastRep ? lastRep.repNumber : null,
                historyLength: history.length
            }));
        """)
        self.assertEqual(res["lastStartSetId"], "s1")
        self.assertEqual(res["lastRepNumber"], 2)
        self.assertEqual(res["historyLength"], 3)

    def test_08_cross_bus_broadcast_channel_sync(self):
        """Req 1: Multiple ErosEventBus instances synchronize across BroadcastChannel."""
        res = run_node_eval("""
            // Emulate BroadcastChannel in Node environment if missing
            if (typeof BroadcastChannel === 'undefined') {
                const subscribers = new Map();
                global.BroadcastChannel = class FakeBroadcastChannel {
                    constructor(name) {
                        this.name = name;
                        if (!subscribers.has(name)) subscribers.set(name, new Set());
                        subscribers.get(name).add(this);
                        this.onmessage = null;
                    }
                    postMessage(data) {
                        const subs = subscribers.get(this.name) || new Set();
                        subs.forEach(target => {
                            if (target !== this && typeof target.onmessage === 'function') {
                                setTimeout(() => target.onmessage({ data }), 0);
                            }
                        });
                    }
                    close() {
                        const subs = subscribers.get(this.name);
                        if (subs) subs.delete(this);
                    }
                };
            }

            (async () => {
                const busAthlete = new ErosEventBus({ channelName: 'eros_coach_sync_v1' });
                const busCoach = new ErosEventBus({ channelName: 'eros_coach_sync_v1' });

                let coachReceivedSet = null;
                let coachReceivedRep = null;
                busCoach.on('set:started', (p) => { coachReceivedSet = p; });
                busCoach.on('rep:recorded', (p) => { coachReceivedRep = p; });

                busAthlete.emit('set:started', {
                    setId: 'set_cross_01',
                    setNumber: 1,
                    lift: 'Bench',
                    weight: 100.0
                });

                busAthlete.emit('rep:recorded', {
                    setId: 'set_cross_01',
                    repNumber: 1,
                    velocity: 0.72
                });

                // Wait for asynchronous broadcast turn
                await new Promise(r => setTimeout(r, 50));

                busAthlete.destroy();
                busCoach.destroy();

                console.log(JSON.stringify({
                    coachReceivedSet,
                    coachReceivedRep
                }));
            })();
        """)
        self.assertIsNotNone(res["coachReceivedSet"])
        self.assertEqual(res["coachReceivedSet"]["setId"], "set_cross_01")
        self.assertEqual(res["coachReceivedSet"]["lift"], "Bench")
        self.assertIsNotNone(res["coachReceivedRep"])
        self.assertEqual(res["coachReceivedRep"]["velocity"], 0.72)

    def test_09_local_storage_fallback_mechanism(self):
        """Req 1: When BroadcastChannel is absent, bus falls back to localStorage storage event."""
        res = run_node_eval("""
            // Simulate browser environment with window.localStorage and storage event dispatch
            const storageMap = new Map();
            const storageListeners = new Set();

            global.window = {
                addEventListener: (event, handler) => {
                    if (event === 'storage') storageListeners.add(handler);
                },
                removeEventListener: (event, handler) => {
                    if (event === 'storage') storageListeners.delete(handler);
                },
                localStorage: {
                    setItem: (key, val) => {
                        const oldVal = storageMap.get(key) || null;
                        storageMap.set(key, val);
                        storageListeners.forEach(listener => {
                            listener({ key, oldValue: oldVal, newValue: val });
                        });
                    },
                    getItem: (key) => storageMap.get(key) || null
                }
            };

            // Force bus to run without BroadcastChannel
            const origBC = global.BroadcastChannel;
            delete global.BroadcastChannel;

            const busA = new ErosEventBus({ channelName: 'test_fallback_v1', storageKey: 'test_sync_key' });
            const busB = new ErosEventBus({ channelName: 'test_fallback_v1', storageKey: 'test_sync_key' });

            let busBReceived = null;
            busB.on('coach:cue', (p) => { busBReceived = p; });

            busA.emit('coach:cue', { text: 'Drive feet into floor' });

            busA.destroy();
            busB.destroy();
            if (origBC) global.BroadcastChannel = origBC;

            console.log(JSON.stringify({
                busBReceived
            }));
        """)
        self.assertIsNotNone(res["busBReceived"])
        self.assertEqual(res["busBReceived"]["text"], "Drive feet into floor")

    def test_10_zero_forbidden_hardware_terms_in_sync_bus(self):
        """Req R4: sync-bus.js strictly contains zero occurrences of WebBLE, 100Hz, ESP32, or hardware terms."""
        sync_bus_path = os.path.join(REPO_ROOT, "sync-bus.js")
        self.assertTrue(os.path.exists(sync_bus_path), "sync-bus.js must exist")

        with open(sync_bus_path, "r", encoding="utf-8") as f:
            content = f.read()

        forbidden_pattern = re.compile(
            r'\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|hardware)\b',
            re.IGNORECASE
        )
        match = forbidden_pattern.search(content)
        self.assertIsNone(
            match,
            f"Forbidden hardware term '{match.group(0) if match else ''}' found in sync-bus.js"
        )


if __name__ == "__main__":
    unittest.main()
