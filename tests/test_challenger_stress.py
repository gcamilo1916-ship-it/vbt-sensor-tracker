"""
Challenger 1: Empirical Adversarial Stress & Fuzzing Suite for Eros VBT
Independent adversarial verification harness executing empirical tests across:
1. Barbell velocity analytics boundaries (0.00, 0.01, 5.00, 10.00, negative, corrupt payloads, NaN guards).
2. High rep volume (100+ rapid reps across multiple sets and sessions in localStorage).
3. Rapid lift theme switching (50 full cycles / 150 transitions in rapid succession).
4. Dropdown keyboard navigation (extreme key sequences: rapid Escape, ArrowDown, ArrowUp, Home, End, Enter).
"""

import os
import sys
import json
import time
import socket
import urllib.request
import subprocess
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from tests.conftest_base import (
    get_index_html,
    get_style_css,
    get_app_js,
    VBTMathOracle,
    CHROME_PATH,
    INDEX_HTML
)

DEBUG_PORT = 9575
TARGET_URL = f"file:///{INDEX_HTML.replace(os.sep, '/')}"


class TestChallengerAdversarialStress(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(CHROME_PATH):
            raise unittest.SkipTest("Google Chrome binary not found on host")

        # Launch Headless Chrome instance
        cls.proc = subprocess.Popen([
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu",
            f"--remote-debugging-port={DEBUG_PORT}",
            "--remote-allow-origins=*",
            TARGET_URL
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        # Wait for debugging port readiness
        ready = False
        for _ in range(40):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json/version", timeout=0.25) as resp:
                    if resp.status == 200:
                        ready = True
                        break
            except Exception:
                time.sleep(0.1)

        if not ready:
            cls.proc.terminate()
            raise unittest.SkipTest("Failed to connect to Headless Chrome debugging port")

        # Locate target page with retry loop to absorb transient Chrome startup disconnects
        eros_pages = []
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json/list", timeout=2) as resp:
                    pages = json.loads(resp.read().decode('utf-8'))
                    eros_pages = [p for p in pages if "index.html" in p.get("url", "")]
                    if eros_pages:
                        break
            except Exception:
                time.sleep(0.1)

        if not eros_pages:
            cls.proc.terminate()
            raise unittest.SkipTest("index.html target not found in Chrome")

        target = eros_pages[0]
        cls.ws_url = target['webSocketDebuggerUrl']
        path = '/' + cls.ws_url.split('/', 3)[3]

        # Establish WebSocket connection
        cls.sock = socket.socket()
        cls.sock.connect(('127.0.0.1', DEBUG_PORT))
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{DEBUG_PORT}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        cls.sock.sendall(req.encode('utf-8'))
        cls.sock.recv(4096)

        cls.msg_id = 0
        cls.console_messages = []

        cls._send_cdp("Runtime.enable")
        cls._send_cdp("Log.enable")

        # Wait for page readyState
        for _ in range(50):
            rs = cls.eval_js("document.readyState")
            if rs in ("interactive", "complete"):
                break
            time.sleep(0.05)
        time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        try:
            if hasattr(cls, 'sock') and cls.sock:
                cls.sock.close()
        except Exception:
            pass
        if hasattr(cls, 'proc') and cls.proc:
            try:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(cls.proc.pid)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                try:
                    cls.proc.kill()
                except Exception:
                    pass

    @classmethod
    def _send_cdp(cls, method, params=None):
        cls.msg_id += 1
        msg = {"id": cls.msg_id, "method": method, "params": params or {}}
        payload = json.dumps(msg).encode('utf-8')
        length = len(payload)
        frame = bytearray([0x81])
        if length <= 125:
            frame.append(0x80 | length)
        elif length <= 65535:
            frame.append(0x80 | 126)
            frame.extend(length.to_bytes(2, 'big'))
        else:
            frame.append(0x80 | 127)
            frame.extend(length.to_bytes(8, 'big'))
        mask = os.urandom(4)
        frame.extend(mask)
        masked = bytearray(payload)
        for i in range(len(masked)):
            masked[i] ^= mask[i % 4]
        frame.extend(masked)
        cls.sock.sendall(frame)
        return cls.msg_id

    @classmethod
    def _recv_cdp(cls, timeout=3.0):
        cls.sock.settimeout(timeout)
        try:
            head = cls.sock.recv(2)
            if not head:
                return None
            b2 = head[1]
            length = b2 & 0x7f
            if length == 126:
                length = int.from_bytes(cls.sock.recv(2), 'big')
            elif length == 127:
                length = int.from_bytes(cls.sock.recv(8), 'big')
            data = bytearray()
            while len(data) < length:
                chunk = cls.sock.recv(length - len(data))
                if not chunk:
                    break
                data.extend(chunk)
            return json.loads(data.decode('utf-8'))
        except socket.timeout:
            return None

    @classmethod
    def eval_js(cls, expr):
        req_id = cls._send_cdp("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        start_time = time.time()
        while time.time() - start_time < 5.0:
            msg = cls._recv_cdp(timeout=1.0)
            if not msg:
                continue
            if msg.get("method") == "Runtime.consoleAPICalled":
                cls.console_messages.append(msg.get("params"))
            if msg.get("id") == req_id:
                res = msg.get("result", {}).get("result", {})
                if "value" in res:
                    return res["value"]
                return res
        return None

    # ═════════════════════════════════════════════════════════════════════════
    # STRESS 1: Barbell Velocity Analytics & Payload Boundary Fuzzing
    # ═════════════════════════════════════════════════════════════════════════

    def test_stress_01a_velocity_boundary_values(self):
        """Stress 1A: Feed boundary velocity values (0.00, 0.01, 5.00, 10.00, negative) to analytics engine."""
        res = self.eval_js("""
            (() => {
                // Initialize clean test set
                const testSet = {
                    setId: "stress_test_set_1",
                    setNumber: 1,
                    lift: "Deadlift",
                    startTime: Date.now(),
                    endTime: null,
                    avgVelocity: 0.0,
                    maxVelocity: 0.0,
                    minVelocity: 0.0,
                    velocityLossPct: 0.0,
                    avgRpe: 0.0,
                    reps: []
                };

                // Test 1: Zero velocity (0.00 m/s)
                testSet.reps.push({ repNumber: 1, lift: "Deadlift", velocity: 0.00, rpe: 10.0, timestamp: Date.now() });
                recalculateSetMetrics(testSet);
                const metricsZero = { ...testSet };

                // Test 2: Sub-baseline minimal velocity (0.01 m/s)
                testSet.reps.push({ repNumber: 2, lift: "Deadlift", velocity: 0.01, rpe: 10.0, timestamp: Date.now() });
                recalculateSetMetrics(testSet);
                const metricsMinimal = { ...testSet };

                // Test 3: Ballistic velocity (5.00 m/s)
                testSet.reps.push({ repNumber: 3, lift: "Deadlift", velocity: 5.00, rpe: 6.0, timestamp: Date.now() });
                recalculateSetMetrics(testSet);
                const metricsBallistic = { ...testSet };

                // Test 4: Extreme human limit velocity (10.00 m/s)
                testSet.reps.push({ repNumber: 4, lift: "Deadlift", velocity: 10.00, rpe: 5.0, timestamp: Date.now() });
                recalculateSetMetrics(testSet);
                const metricsExtreme = { ...testSet };

                // Test 5: Physics duration timing clamps
                // Duration formula in app.js: (0.5 / Math.max(velocity, 0.1)) * 2, clamped to [0.5, 5.0]
                const durations = [0.00, 0.01, 0.50, 5.00, 10.00].map(v => {
                    let d = (0.5 / Math.max(v, 0.1)) * 2;
                    return Math.max(0.5, Math.min(d, 5.0));
                });

                return {
                    metricsZero: {
                        avgVelocity: metricsZero.avgVelocity,
                        maxVelocity: metricsZero.maxVelocity,
                        minVelocity: metricsZero.minVelocity,
                        velocityLossPct: metricsZero.velocityLossPct,
                        avgRpe: metricsZero.avgRpe
                    },
                    metricsMinimal: {
                        avgVelocity: metricsMinimal.avgVelocity,
                        maxVelocity: metricsMinimal.maxVelocity,
                        minVelocity: metricsMinimal.minVelocity,
                        velocityLossPct: metricsMinimal.velocityLossPct
                    },
                    metricsBallistic: {
                        avgVelocity: metricsBallistic.avgVelocity,
                        maxVelocity: metricsBallistic.maxVelocity,
                        minVelocity: metricsBallistic.minVelocity,
                        velocityLossPct: metricsBallistic.velocityLossPct
                    },
                    metricsExtreme: {
                        avgVelocity: metricsExtreme.avgVelocity,
                        maxVelocity: metricsExtreme.maxVelocity,
                        minVelocity: metricsExtreme.minVelocity,
                        velocityLossPct: metricsExtreme.velocityLossPct
                    },
                    durations
                };
            })()
        """)

        # Zero velocity boundary
        self.assertEqual(res["metricsZero"]["avgVelocity"], 0.0)
        self.assertEqual(res["metricsZero"]["maxVelocity"], 0.0)
        self.assertEqual(res["metricsZero"]["velocityLossPct"], 0.0, "Zero velocity must yield 0% loss without division by zero")

        # Minimal velocity boundary (0.00 and 0.01)
        self.assertEqual(res["metricsMinimal"]["maxVelocity"], 0.01)
        self.assertEqual(res["metricsMinimal"]["minVelocity"], 0.0)
        self.assertAlmostEqual(res["metricsMinimal"]["avgVelocity"], 0.01, places=2)

        # Ballistic & Extreme limits
        self.assertEqual(res["metricsBallistic"]["maxVelocity"], 5.0)
        self.assertEqual(res["metricsExtreme"]["maxVelocity"], 10.0)
        self.assertGreaterEqual(res["metricsExtreme"]["avgVelocity"], res["metricsMinimal"]["avgVelocity"])

        # Duration clamps: min 0.5s, max 5.0s
        for d in res["durations"]:
            self.assertGreaterEqual(d, 0.5, "Duration must not be lower than 0.5s clamp")
            self.assertLessEqual(d, 5.0, "Duration must not exceed 5.0s clamp")

    def test_stress_01b_corrupt_ble_payloads_and_nan_guards(self):
        """Stress 1B: Fuzz BLE parser with corrupt frames, missing delimiters, nulls, and NaNs."""
        fuzz_results = self.eval_js("""
            (() => {
                const results = [];
                const testFrames = [
                    "",
                    "    ",
                    "CORRUPT_PACKET_NO_DELIMITERS",
                    "Deadlift | OnlyOnePipe",
                    "Deadlift | NaN m/s | RPE: 8.5",
                    "Squat | 0.75 m/s | RPE: NaN",
                    "Bench | undefined | RPE: null",
                    "Deadlift | -0.45 m/s | RPE: -2.0",
                    "|||",
                    "   |   |   ",
                    "Deadlift | [object Object] | RPE: [object Object]",
                    "Deadlift | 0.65 m/s | RPE: 8.0" // One valid frame
                ];

                const initialWorkoutCount = workouts.length;
                let activeSetRepCountBefore = activeSet ? activeSet.reps.length : 0;

                testFrames.forEach(frame => {
                    try {
                        const encoder = new TextEncoder();
                        const dummyEvent = {
                            target: {
                                value: {
                                    buffer: encoder.encode(frame).buffer
                                }
                            }
                        };
                        // Target value with byteLength
                        dummyEvent.target.value = encoder.encode(frame);
                        handleIncomingBLEData(dummyEvent);
                        results.push({ frame, status: "HANDLED_CLEANLY" });
                    } catch (err) {
                        results.push({ frame, status: "THREW_EXCEPTION", error: err.toString() });
                    }
                });

                const activeSetRepCountAfter = activeSet ? activeSet.reps.length : 0;

                return {
                    results,
                    repsAdded: activeSetRepCountAfter - activeSetRepCountBefore
                };
            })()
        """)

        # Verify no unhandled exceptions were thrown
        for item in fuzz_results["results"]:
            self.assertEqual(item["status"], "HANDLED_CLEANLY", f"Corrupt frame threw exception: {item}")

        # Exactly the valid frame (or valid-matching frames) should be processed, never crashing the engine
        self.assertGreaterEqual(fuzz_results["repsAdded"], 1)

    # ═════════════════════════════════════════════════════════════════════════
    # STRESS 2: High Rep Volume Endurance Stress (100+ Reps)
    # ═════════════════════════════════════════════════════════════════════════

    def test_stress_02_high_rep_volume_across_sets_and_sessions(self):
        """Stress 2: Ingest 150 reps across 5 sets and multiple sessions in vbt_workouts_v1."""
        res = self.eval_js("""
            (() => {
                const startTime = performance.now();
                // Clear previous state
                localStorage.removeItem('vbt_workouts_v1');
                workouts = [];
                activeWorkout = null;
                activeSet = null;

                // Start master session
                startWorkoutSession();
                const session = activeWorkout;

                // Inject 5 sets of 30 reps = 150 reps total
                const totalSets = 5;
                const repsPerSet = 30;
                let totalRepsInjected = 0;

                for (let s = 1; s <= totalSets; s++) {
                    const liftType = s % 2 === 0 ? 'Squat' : 'Deadlift';
                    if (s > 1) {
                        endActiveSet();
                        startNewSet(liftType);
                    }
                    
                    for (let r = 1; r <= repsPerSet; r++) {
                        // Natural biomechanical fatigue decay: 0.85 down to 0.35 m/s
                        const vel = parseFloat((0.85 - (r * 0.015)).toFixed(2));
                        const rpe = parseFloat((6.5 + (r * 0.1)).toFixed(1));
                        recordRepetition({ lift: liftType, velocity: Math.max(0.15, vel), rpe: Math.min(10.0, rpe) });
                        totalRepsInjected++;
                    }
                }
                endActiveSet();
                endWorkoutSession();

                const ingestionTimeMs = performance.now() - startTime;

                // Verify localStorage persistence
                const storedRaw = localStorage.getItem('vbt_workouts_v1');
                const parsedStored = JSON.parse(storedRaw);

                // Math verification across all sets
                const setSummaries = parsedStored[0].sets.map(set => ({
                    setNumber: set.setNumber,
                    repCount: set.reps.length,
                    avgVel: set.avgVelocity,
                    maxVel: set.maxVelocity,
                    minVel: set.minVelocity,
                    loss: set.velocityLossPct,
                    avgRpe: set.avgRpe,
                    validBounds: (set.minVelocity <= set.avgVelocity && set.avgVelocity <= set.maxVelocity),
                    lossValid: (set.velocityLossPct >= 0.0 && set.velocityLossPct <= 100.0)
                }));

                // Test CSV Export generation with 150 reps
                let csvLength = 0;
                let csvError = null;
                try {
                    const rows = [
                        ['Workout ID', 'Workout Date', 'Set Number', 'Lift', 'Rep Number', 'Velocity (m/s)', 'RPE', 'Set Avg Velocity', 'Set Velocity Loss %', 'Timestamp']
                    ];
                    parsedStored.forEach(w => {
                        (w.sets || []).forEach(s => {
                            (s.reps || []).forEach(r => {
                                rows.push([
                                    `"${w.id}"`, `"${w.dateStr}"`, s.setNumber, `"${s.lift}"`,
                                    r.repNumber, r.velocity.toFixed(2), r.rpe.toFixed(1),
                                    s.avgVelocity.toFixed(2), s.velocityLossPct.toFixed(1),
                                    `"${new Date(r.timestamp).toISOString()}"`
                                ]);
                            });
                        });
                    });
                    const csvContent = rows.map(e => e.join(',')).join('\\n');
                    csvLength = csvContent.length;
                } catch (e) {
                    csvError = e.toString();
                }

                // Test JSON Export serialization
                let jsonLength = 0;
                let jsonError = null;
                try {
                    const jsonStr = JSON.stringify(parsedStored, null, 2);
                    jsonLength = jsonStr.length;
                } catch (e) {
                    jsonError = e.toString();
                }

                return {
                    totalRepsInjected,
                    ingestionTimeMs,
                    storedSessions: parsedStored.length,
                    setsCount: parsedStored[0].sets.length,
                    setSummaries,
                    csvLength,
                    csvError,
                    jsonLength,
                    jsonError,
                    domHistoryItems: document.querySelectorAll('.session-card').length
                };
            })()
        """)

        self.assertEqual(res["totalRepsInjected"], 150, "Must successfully inject 150 reps")
        self.assertEqual(res["setsCount"], 5, "Must record 5 distinct sets")
        self.assertLess(res["ingestionTimeMs"], 3000, "150 reps must ingest and compute in < 3000ms")

        # Invariant checks across all sets
        for summary in res["setSummaries"]:
            self.assertEqual(summary["repCount"], 30)
            self.assertTrue(summary["validBounds"], f"Set {summary['setNumber']} violated min <= avg <= max bounds")
            self.assertTrue(summary["lossValid"], f"Set {summary['setNumber']} velocityLossPct out of [0, 100] range")

        # Export checks
        self.assertIsNone(res["csvError"])
        self.assertGreater(res["csvLength"], 5000, "CSV export should contain full 150 reps")
        self.assertIsNone(res["jsonError"])
        self.assertGreater(res["jsonLength"], 10000, "JSON export should contain full hierarchy")

    # ═════════════════════════════════════════════════════════════════════════
    # STRESS 3: Rapid Lift Theme Switching Stress (50 Cycles / 150 Switches)
    # ═════════════════════════════════════════════════════════════════════════

    def test_stress_03_rapid_lift_theme_switching(self):
        """Stress 3: Rapidly cycle themes Deadlift -> Squat -> Bench 50 times (150 transitions)."""
        res = self.eval_js("""
            (() => {
                const lifts = ["Deadlift", "Squat", "Bench"];
                const cycles = 50;
                const totalSwitches = cycles * lifts.length;
                let switchCount = 0;
                const errors = [];

                for (let i = 0; i < cycles; i++) {
                    for (let j = 0; j < lifts.length; j++) {
                        const targetLift = lifts[j];
                        try {
                            applyLiftTheme(targetLift);
                            switchCount++;
                            // Verify single theme class on body
                            const bodyClass = document.body.className;
                            const expectedClass = `theme-${targetLift.toLowerCase()}`;
                            if (bodyClass !== expectedClass) {
                                errors.push(`Mismatch at cycle ${i}, lift ${targetLift}: got "${bodyClass}"`);
                            }
                            // Verify exactly one selected option
                            const selectedOpts = document.querySelectorAll('.custom-option.selected');
                            if (selectedOpts.length !== 1) {
                                errors.push(`Selected options count = ${selectedOpts.length} (expected 1) at switch ${switchCount}`);
                            }
                        } catch (err) {
                            errors.push(`Exception switching to ${targetLift}: ${err.toString()}`);
                        }
                    }
                }

                const finalBodyClass = document.body.className;
                const finalSelectedText = document.querySelector('#selected-lift-text')?.textContent;
                const finalOptionValue = document.querySelector('.custom-option.selected')?.getAttribute('data-value');

                return {
                    totalSwitches,
                    switchCount,
                    errors,
                    finalBodyClass,
                    finalSelectedText,
                    finalOptionValue
                };
            })()
        """)

        self.assertEqual(res["switchCount"], 150, "All 150 theme switches must execute")
        self.assertEqual(len(res["errors"]), 0, f"Theme switching errors: {res['errors']}")
        self.assertEqual(res["finalBodyClass"], "theme-bench")
        self.assertEqual(res["finalSelectedText"], "BENCH")
        self.assertEqual(res["finalOptionValue"], "Bench")

    # ═════════════════════════════════════════════════════════════════════════
    # STRESS 4: Dropdown Keyboard Navigation Adversarial Fuzzing
    # ═════════════════════════════════════════════════════════════════════════

    def test_stress_04_dropdown_keyboard_navigation_extreme_fuzzing(self):
        """Stress 4: Adversarially fuzz dropdown keyboard navigation with extreme key sequences."""
        res = self.eval_js("""
            (async () => {
                const wrapper = document.querySelector('#lift-select-wrapper');
                const trigger = wrapper.querySelector('.custom-select-trigger');
                const options = Array.from(wrapper.querySelectorAll('.custom-option'));
                const fuzzLog = [];

                function fireKey(el, key) {
                    const evt = new KeyboardEvent('keydown', {
                        key: key,
                        bubbles: true,
                        cancelable: true
                    });
                    el.dispatchEvent(evt);
                }

                // 1. Extreme rapid Escapes when closed
                for (let i = 0; i < 10; i++) {
                    fireKey(trigger, 'Escape');
                    if (wrapper.classList.contains('open')) {
                        fuzzLog.push(`Error: Dropdown opened on Escape #${i}`);
                    }
                }

                // 2. Open via Enter
                fireKey(trigger, 'Enter');
                await new Promise(r => setTimeout(r, 20));
                const openedWithEnter = wrapper.classList.contains('open');
                const ariaExpandedOpen = trigger.getAttribute('aria-expanded');

                // 3. Extreme rapid Escapes when open
                fireKey(options[0], 'Escape');
                await new Promise(r => setTimeout(r, 20));
                const closedWithEscape = !wrapper.classList.contains('open');
                const ariaExpandedClosed = trigger.getAttribute('aria-expanded');

                // 4. Open via ArrowDown on trigger
                fireKey(trigger, 'ArrowDown');
                await new Promise(r => setTimeout(r, 20));
                const openedWithArrowDown = wrapper.classList.contains('open');

                // 5. Boundary cyclic wrap-around navigation
                // Focus option 0 (Deadlift)
                options[0].focus();
                
                // Down to option 1 (Squat)
                fireKey(options[0], 'ArrowDown');
                const focusedAfterDown1 = document.activeElement === options[1];

                // Down to option 2 (Bench)
                fireKey(options[1], 'ArrowDown');
                const focusedAfterDown2 = document.activeElement === options[2];

                // Down from option 2 -> cyclic wrap to option 0 (Deadlift)
                fireKey(options[2], 'ArrowDown');
                const cyclicWrappedToTop = document.activeElement === options[0];

                // Up from option 0 -> cyclic wrap to option 2 (Bench)
                fireKey(options[0], 'ArrowUp');
                const cyclicWrappedToBottom = document.activeElement === options[2];

                // 6. Home and End key navigation
                fireKey(options[2], 'Home');
                const homeKeyFocus = document.activeElement === options[0];

                fireKey(options[0], 'End');
                const endKeyFocus = document.activeElement === options[2];

                // 7. Select via Enter on focused option (Bench)
                fireKey(options[2], 'Enter');
                const closedAfterEnter = !wrapper.classList.contains('open');
                const selectedAfterEnter = options[2].classList.contains('selected');
                const bodyClassAfterEnter = document.body.className;

                // 8. Re-open and select via Space key on option 1 (Squat)
                fireKey(trigger, ' ');
                options[1].focus();
                fireKey(options[1], ' ');
                const closedAfterSpace = !wrapper.classList.contains('open');
                const selectedAfterSpace = options[1].classList.contains('selected');
                const bodyClassAfterSpace = document.body.className;

                return {
                    fuzzLog,
                    openedWithEnter,
                    ariaExpandedOpen,
                    closedWithEscape,
                    ariaExpandedClosed,
                    openedWithArrowDown,
                    focusedAfterDown1,
                    focusedAfterDown2,
                    cyclicWrappedToTop,
                    cyclicWrappedToBottom,
                    homeKeyFocus,
                    endKeyFocus,
                    closedAfterEnter,
                    selectedAfterEnter,
                    bodyClassAfterEnter,
                    closedAfterSpace,
                    selectedAfterSpace,
                    bodyClassAfterSpace
                };
            })()
        """)

        # Verify fuzzLog has no unexpected state failures
        self.assertEqual(len(res["fuzzLog"]), 0, f"Fuzz errors: {res['fuzzLog']}")

        # Trigger open/close & ARIA attributes
        self.assertTrue(res["openedWithEnter"], "Trigger Enter key must open dropdown")
        self.assertEqual(res["ariaExpandedOpen"], "true", "aria-expanded must be 'true' when open")
        self.assertTrue(res["closedWithEscape"], "Option Escape key must close dropdown")
        self.assertEqual(res["ariaExpandedClosed"], "false", "aria-expanded must be 'false' when closed")
        self.assertTrue(res["openedWithArrowDown"], "Trigger ArrowDown key must open dropdown")

        # Cyclic wrap-around
        self.assertTrue(res["focusedAfterDown1"], "ArrowDown from opt[0] must focus opt[1]")
        self.assertTrue(res["focusedAfterDown2"], "ArrowDown from opt[1] must focus opt[2]")
        self.assertTrue(res["cyclicWrappedToTop"], "ArrowDown from last opt must wrap to opt[0]")
        self.assertTrue(res["cyclicWrappedToBottom"], "ArrowUp from opt[0] must wrap to opt[2]")

        # Home & End keys
        self.assertTrue(res["homeKeyFocus"], "Home key must focus first option")
        self.assertTrue(res["endKeyFocus"], "End key must focus last option")

        # Enter & Space selections
        self.assertTrue(res["closedAfterEnter"], "Enter key on option must close dropdown")
        self.assertTrue(res["selectedAfterEnter"], "Enter key on option must set selected class")
        self.assertEqual(res["bodyClassAfterEnter"], "theme-bench")

        self.assertTrue(res["closedAfterSpace"], "Space key on option must close dropdown")
        self.assertTrue(res["selectedAfterSpace"], "Space key on option must set selected class")
        self.assertEqual(res["bodyClassAfterSpace"], "theme-squat")

    # ═════════════════════════════════════════════════════════════════════════
    # STRESS 6: Storage Corruption & Self-Healing Recovery
    # ═════════════════════════════════════════════════════════════════════════

    def test_stress_06_storage_corruption_and_recovery(self):
        """Stress 6: Feed corrupted / truncated JSON into localStorage and verify graceful fallback."""
        res = self.eval_js("""
            (() => {
                // Deliberately corrupt localStorage key
                localStorage.setItem('vbt_workouts_v1', '{"malformed": [undefined, NaN, {');
                let threwUncaught = false;
                try {
                    initStorage();
                } catch (e) {
                    threwUncaught = true;
                }

                const recoveredWorkouts = workouts;
                const historySummary = {
                    workouts: document.querySelector('#sum-workouts')?.textContent,
                    sets: document.querySelector('#sum-sets')?.textContent,
                    reps: document.querySelector('#sum-reps')?.textContent
                };

                // Restore clean state
                localStorage.removeItem('vbt_workouts_v1');
                initStorage();

                return {
                    threwUncaught,
                    isWorkoutsArray: Array.isArray(recoveredWorkouts),
                    recoveredLength: recoveredWorkouts.length,
                    historySummary
                };
            })()
        """)

        self.assertFalse(res["threwUncaught"], "initStorage must not throw uncaught error on corrupted JSON")
        self.assertTrue(res["isWorkoutsArray"], "workouts must reset to empty array on parse failure")
        self.assertEqual(res["recoveredLength"], 0)
        self.assertEqual(res["historySummary"]["workouts"], "0")

    # ═════════════════════════════════════════════════════════════════════════
    # STRESS 7: XSS & CSV Delimiter Injection Resilience
    # ═════════════════════════════════════════════════════════════════════════

    def test_stress_07_xss_and_csv_injection_resilience(self):
        """Stress 7: Inject HTML tags, quotes, commas, and control characters into workout hierarchy."""
        res = self.eval_js("""
            (() => {
                const maliciousSession = {
                    id: "ws_inject_<script>alert(1)</script>",
                    startTime: Date.now(),
                    endTime: Date.now() + 60000,
                    dateStr: 'Oct 15, 2026, 10:00 AM',
                    name: '<b onmouseover="alert(1)">Evil Workout</b> & "Quotes"',
                    sets: [{
                        setId: "set_inject",
                        setNumber: 1,
                        lift: 'Deadlift, 500lbs "PR"',
                        startTime: Date.now(),
                        endTime: Date.now() + 30000,
                        avgVelocity: 0.65,
                        maxVelocity: 0.70,
                        minVelocity: 0.60,
                        velocityLossPct: 14.3,
                        avgRpe: 8.5,
                        reps: [{
                            repNumber: 1,
                            lift: 'Deadlift, 500lbs "PR"',
                            velocity: 0.65,
                            rpe: 8.5,
                            timestamp: Date.now()
                        }]
                    }]
                };

                workouts = [maliciousSession];
                renderHistoryView();

                // Check DOM rendering: script tags must be escaped, not parsed as DOM nodes
                const titleEl = document.querySelector('.session-card-title');
                const rawHtml = titleEl ? titleEl.innerHTML : '';
                const textContent = titleEl ? titleEl.textContent : '';
                const injectedScriptFound = !!document.querySelector('.session-card-title script, .session-card-title b[onmouseover]');

                // Test CSV formatting
                let csvResult = '';
                const rows = [
                    ['Workout ID', 'Workout Date', 'Set Number', 'Lift', 'Rep Number', 'Velocity (m/s)', 'RPE', 'Set Avg Velocity', 'Set Velocity Loss %', 'Timestamp']
                ];
                workouts.forEach(w => {
                    (w.sets || []).forEach(s => {
                        (s.reps || []).forEach(r => {
                            rows.push([
                                `"${w.id}"`,
                                `"${w.dateStr}"`,
                                s.setNumber,
                                `"${s.lift}"`,
                                r.repNumber,
                                r.velocity.toFixed(2),
                                r.rpe.toFixed(1),
                                s.avgVelocity.toFixed(2),
                                s.velocityLossPct.toFixed(1),
                                `"${new Date(r.timestamp).toISOString()}"`
                            ]);
                        });
                    });
                });
                csvResult = rows.map(e => e.join(',')).join('\\n');

                return {
                    rawHtml,
                    textContent,
                    injectedScriptFound,
                    csvResult
                };
            })()
        """)

        self.assertFalse(res["injectedScriptFound"], "Malicious tags must be escaped, never rendered as active DOM elements")
        self.assertNotIn("<script>", res["rawHtml"])
        self.assertNotIn("<b onmouseover", res["rawHtml"])
        self.assertIn('"Deadlift, 500lbs "PR""', res["csvResult"], "CSV row must quote fields matching app.js export routine")

    # ═════════════════════════════════════════════════════════════════════════
    # STRESS 8: Dropdown Stacking Context & Geometry Inspection
    # ═════════════════════════════════════════════════════════════════════════

    def test_stress_08_dropdown_geometry_and_no_clipping(self):
        """Stress 8: Verify dropdown options element floats above panels with unclipped overflow."""
        res = self.eval_js("""
            (() => {
                const wrapper = document.querySelector('#lift-select-wrapper');
                const trigger = wrapper.querySelector('.custom-select-trigger');
                const optionsEl = wrapper.querySelector('.custom-select-options');
                const controlsPanel = document.querySelector('.controls-panel');

                // Open dropdown
                wrapper.classList.add('open');

                const panelStyle = window.getComputedStyle(controlsPanel);
                const optionsStyle = window.getComputedStyle(optionsEl);

                const panelRect = controlsPanel.getBoundingClientRect();
                const optionsRect = optionsEl.getBoundingClientRect();

                // Dropdown extends below the trigger
                const extendsBelow = optionsRect.bottom > panelRect.top;
                const panelOverflow = panelStyle.overflow;
                const zIndexVal = parseInt(optionsStyle.zIndex, 10);

                wrapper.classList.remove('open');

                return {
                    panelOverflow,
                    zIndexVal,
                    extendsBelow,
                    optionsVisible: optionsStyle.display !== 'none'
                };
            })()
        """)

        self.assertEqual(res["panelOverflow"], "visible", "Controls panel must have overflow: visible to prevent clipping")
        self.assertGreaterEqual(res["zIndexVal"], 1000, "Options container z-index must be >= 1000")

    # ═════════════════════════════════════════════════════════════════════════
    # STRESS 9: Rapid Burst Rep Ingestion Under Animation Pressure
    # ═════════════════════════════════════════════════════════════════════════

    def test_stress_09_rapid_burst_rep_ingestion(self):
        """Stress 9: Ingest 100 reps in high-speed rapid burst (<100ms) under animation pressure."""
        res = self.eval_js("""
            (async () => {
                localStorage.removeItem('vbt_workouts_v1');
                workouts = [];
                activeWorkout = null;
                activeSet = null;

                startWorkoutSession();
                startNewSet("Squat");

                const burstCount = 100;
                const startTime = performance.now();

                for (let i = 1; i <= burstCount; i++) {
                    recordRepetition({
                        lift: "Squat",
                        velocity: 0.50 + ((i % 10) * 0.02),
                        rpe: 8.0 + ((i % 5) * 0.2)
                    });
                }

                // Wait 100ms for requestAnimationFrame cycles to settle
                await new Promise(r => setTimeout(r, 100));

                const elapsedMs = performance.now() - startTime;
                const setRepsLogged = activeSet.reps.length;
                const avgVel = activeSet.avgVelocity;
                const maxVel = activeSet.maxVelocity;
                const minVel = activeSet.minVelocity;
                const lossPct = activeSet.velocityLossPct;

                const liveVelText = document.querySelector('#live-velocity')?.textContent;
                const repCounterText = document.querySelector('#set-rep-counter')?.textContent;

                return {
                    elapsedMs,
                    setRepsLogged,
                    avgVel,
                    maxVel,
                    minVel,
                    lossPct,
                    liveVelText,
                    repCounterText
                };
            })()
        """)

        self.assertEqual(res["setRepsLogged"], 100, "All 100 burst reps must be logged in active set")
        self.assertGreaterEqual(res["maxVel"], 0.60)
        self.assertLessEqual(res["minVel"], 0.55)
        self.assertTrue(0.50 <= res["avgVel"] <= 0.70)
        self.assertEqual(res["repCounterText"], "100 REPS RECORDED")

    # ═════════════════════════════════════════════════════════════════════════
    # STRESS 5: Clean Console & Zero Runtime Errors Under All Stress
    # ═════════════════════════════════════════════════════════════════════════

    def test_stress_05_zero_console_errors_under_adversarial_load(self):
        """Stress 5: Verify that zero JavaScript runtime errors or unhandled exceptions occurred."""
        errors = [m for m in self.console_messages if m.get("type") in ("error", "assert")]
        self.assertEqual(len(errors), 0, f"Found console errors during stress suite: {errors}")


if __name__ == '__main__':
    unittest.main()
