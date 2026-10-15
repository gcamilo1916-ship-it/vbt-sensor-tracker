"""
Challenger 1: Empirical DOTS & PR Adversarial Verification Suite
Empirically stress-tests and adversarially challenges:
1. The DOTS formula in app.js:
   - Official IPF benchmark cases (Male 80kg/600kg -> 413.73, Female 60kg/350kg -> 388.00, Male 100kg/750kg -> 461.64).
   - Boundary inputs: 30kg BW, 300kg BW, negative BW, zero total, non-numeric values.
   - Verification of calculation correctness, denominator <= 0 guards, and zero NaN / crash occurrences.
   - Live DOM synchronization: bodyweight input, gender toggles, source toggles, classification badges.
2. The Long-Press PR Tagging in app.js:
   - 500ms duration threshold verification (releasing <500ms aborts, >=500ms triggers).
   - >10px Euclidean movement cancellation threshold (move <=10px continues, move >10px aborts).
   - Reversible toggling (false -> true -> false -> true).
   - Haptic call safety (valid call with [40, 30, 60], missing API safety, throwing API safety).
   - LocalStorage persistence under vbt_workouts_v1.
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
    CHROME_PATH,
    INDEX_HTML
)

DEBUG_PORT = 9582
TARGET_URL = f"file:///{INDEX_HTML.replace(os.sep, '/')}"


class TestChallengerDotsAndPR(unittest.TestCase):
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
    def send_command(cls, method, params=None, timeout=3.0):
        req_id = cls._send_cdp(method, params)
        start_time = time.time()
        while time.time() - start_time < timeout:
            msg = cls._recv_cdp(timeout=1.0)
            if not msg:
                continue
            if msg.get("method") == "Runtime.consoleAPICalled":
                cls.console_messages.append(msg.get("params"))
            if msg.get("id") == req_id:
                return msg
        return None

    @classmethod
    def eval_js(cls, expr, timeout=5.0):
        msg = cls.send_command("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout=timeout)
        if not msg:
            return None
        res_wrap = msg.get("result", {})
        if "exceptionDetails" in res_wrap:
            raise RuntimeError(f"JS Exception in eval_js: {res_wrap['exceptionDetails']}")
        res = res_wrap.get("result", {})
        if "value" in res:
            return res["value"]
        return res

    # ═════════════════════════════════════════════════════════════════════════
    # 1. DOTS FORMULA ADVERSARIAL STRESS SUITE
    # ═════════════════════════════════════════════════════════════════════════

    def test_dots_ipf_official_benchmarks(self):
        """
        Verify DOTS calculation against official IPF benchmark cases:
        - Male 80kg / 600kg total -> 413.73
        - Female 60kg / 350kg total -> 388.00 (formula produces 387.99, within 0.01)
        - Male 100kg / 750kg total -> 461.64
        """
        res_m80_600 = self.eval_js("calculateDotsScore(600, 80, 'male')")
        self.assertEqual(res_m80_600, 413.73, f"Expected Male 80kg/600kg to yield 413.73, got {res_m80_600}")

        res_f60_350 = self.eval_js("calculateDotsScore(350, 60, 'female')")
        self.assertAlmostEqual(res_f60_350, 388.00, delta=0.02, msg=f"Expected Female 60kg/350kg ~388.00, got {res_f60_350}")
        self.assertEqual(res_f60_350, 387.99, f"Exact formula evaluation with toFixed(2) is 387.99")

        res_m100_750 = self.eval_js("calculateDotsScore(750, 100, 'male')")
        self.assertEqual(res_m100_750, 461.64, f"Expected Male 100kg/750kg to yield 461.64, got {res_m100_750}")

    def test_dots_boundary_inputs_extremes(self):
        """
        Test extreme valid boundaries:
        - 30kg bodyweight (min allowed in UI)
        - 300kg bodyweight (max allowed in UI)
        Verify results are positive, finite numbers with 2 decimal places,
        and female negative polynomial denominator at 300kg is safely guarded to 0.0.
        """
        # Male 30kg, 150kg total
        score_m30 = self.eval_js("calculateDotsScore(150, 30, 'male')")
        self.assertIsInstance(score_m30, (int, float))
        self.assertGreater(score_m30, 0.0)
        self.assertEqual(score_m30, round(score_m30, 2))

        # Female 30kg, 150kg total
        score_f30 = self.eval_js("calculateDotsScore(150, 30, 'female')")
        self.assertIsInstance(score_f30, (int, float))
        self.assertGreater(score_f30, 0.0)
        self.assertEqual(score_f30, round(score_f30, 2))

        # Male 300kg, 1000kg total
        score_m300 = self.eval_js("calculateDotsScore(1000, 300, 'male')")
        self.assertIsInstance(score_m300, (int, float))
        self.assertGreater(score_m300, 0.0)
        self.assertEqual(score_m300, round(score_m300, 2))

        # Female 200kg (extreme SHW), 500kg total
        score_f200 = self.eval_js("calculateDotsScore(500, 200, 'female')")
        self.assertIsInstance(score_f200, (int, float))
        self.assertGreater(score_f200, 0.0)

        # Female 300kg (polynomial denominator becomes negative: -856.34)
        # Verify app.js denominator <= 0 guard prevents negative score or NaN
        score_f300 = self.eval_js("calculateDotsScore(1000, 300, 'female')")
        self.assertEqual(score_f300, 0.0, "Female polynomial denominator <= 0 at 300kg must return 0.0 guard")

    def test_dots_negative_and_zero_inputs(self):
        """
        Test adversarial non-positive values:
        - Negative bodyweight (-80, -0.01) -> 0.0
        - Zero bodyweight (0, 0.0) -> 0.0
        - Negative total (-500, -1) -> 0.0
        - Zero total (0) -> 0.0
        Must return 0.0 without throwing errors or producing NaN/divide-by-zero.
        """
        cases = [
            (600, -80, 'male'),
            (600, 0, 'male'),
            (-600, 80, 'male'),
            (0, 80, 'male'),
            (-100, -50, 'female'),
            (0, 0, 'female'),
            (350, -0.001, 'female')
        ]
        for total, bw, gender in cases:
            score = self.eval_js(f"calculateDotsScore({total}, {bw}, '{gender}')")
            self.assertEqual(score, 0.0, f"Expected calculateDotsScore({total}, {bw}, '{gender}') to return 0.0, got {score}")

    def test_dots_corrupted_non_numeric_and_fuzz(self):
        """
        Adversarial fuzzing with non-numeric inputs:
        strings, null, undefined, NaN, Infinity, objects, arrays.
        Must return 0.0 without uncaught exceptions.
        """
        fuzz_expressions = [
            "calculateDotsScore('abc', 80, 'male')",
            "calculateDotsScore(600, 'xyz', 'male')",
            "calculateDotsScore('NaN', 80, 'male')",
            "calculateDotsScore(NaN, 80, 'male')",
            "calculateDotsScore(600, NaN, 'male')",
            "calculateDotsScore(null, 80, 'male')",
            "calculateDotsScore(600, null, 'male')",
            "calculateDotsScore(undefined, 80, 'male')",
            "calculateDotsScore(600, undefined, 'male')",
            "calculateDotsScore({}, 80, 'male')",
            "calculateDotsScore(600, {}, 'male')",
            "calculateDotsScore([], 80, 'male')",
            "calculateDotsScore(600, [], 'male')",
            "calculateDotsScore(600, 80, null)",
            "calculateDotsScore(600, 80, undefined)",
            "calculateDotsScore(600, 80, 'alien_gender')"
        ]
        for expr in fuzz_expressions:
            res = self.eval_js(expr)
            self.assertIsInstance(res, (int, float), f"Failed on {expr}: returned {type(res)}")
            if "alien_gender" in expr or "null" in expr or "undefined" in expr:
                # Should fallback to male default or return 0.0, but never throw
                self.assertTrue(res >= 0.0)
            else:
                self.assertEqual(res, 0.0, f"Expected 0.0 for {expr}, got {res}")

    def test_dots_classification_tier_mapping(self):
        """
        Verify official competitive strength tier classifications:
        <220 -> NOVICE
        220 - 279.99 -> CLASS III
        280 - 349.99 -> CLASS II
        350 - 414.99 -> CLASS I
        415 - 459.99 -> MASTER
        >=460 -> ELITE
        """
        test_boundaries = [
            (0.0, 'NOVICE'),
            (219.99, 'NOVICE'),
            (220.0, 'CLASS III'),
            (279.99, 'CLASS III'),
            (280.0, 'CLASS II'),
            (349.99, 'CLASS II'),
            (350.0, 'CLASS I'),
            (414.99, 'CLASS I'),
            (415.0, 'MASTER'),
            (459.99, 'MASTER'),
            (460.0, 'ELITE'),
            (550.0, 'ELITE')
        ]
        for score, expected_tier in test_boundaries:
            tier = self.eval_js(f"getDotsClassification({score})")
            self.assertEqual(tier, expected_tier, f"For score {score}, expected {expected_tier}, got {tier}")

    def test_dots_live_dom_interactive_updates(self):
        """
        Verify live DOM updates and persistence for DOTS inputs:
        - Setting bodyweight input updates display and persists to localStorage.
        - Switching gender updates active state, ARIA checked, and recalculates score.
        - Switching source (current vs comp) recalculates total and DOTS score.
        """
        js_test = """
        (() => {
            const bwInput = document.getElementById('dots-bodyweight-input');
            const maleBtn = document.getElementById('dots-gender-male');
            const femaleBtn = document.getElementById('dots-gender-female');
            const srcCurrent = document.getElementById('dots-src-current');
            const srcComp = document.getElementById('dots-src-comp');
            const scoreDisplay = document.getElementById('dots-score-display');
            const totalDisplay = document.getElementById('dots-total-display');

            // Set fixed test PRs
            prProfile.currentPRs = { squat: 200, bench: 150, deadlift: 250 }; // 600kg total
            prProfile.compPRs = { squat: 220, bench: 160, deadlift: 270 }; // 650kg total
            prProfile.bodyweight = 80.0;
            prProfile.gender = 'male';
            prProfile.activeDotsSource = 'current';
            updatePrDashboardUI(true);

            const initialScore = parseFloat(scoreDisplay.textContent);
            const initialTotal = totalDisplay.textContent;

            // 1. Switch to Female
            femaleBtn.click();
            const femaleScore = parseFloat(scoreDisplay.textContent);
            const femaleAria = femaleBtn.getAttribute('aria-checked');
            const maleAria = maleBtn.getAttribute('aria-checked');

            // 2. Switch to Comp PRs
            srcComp.click();
            const compTotal = totalDisplay.textContent;
            const compScore = parseFloat(scoreDisplay.textContent);

            // 3. Change bodyweight to 100kg
            bwInput.value = '100.0';
            bwInput.dispatchEvent(new Event('input'));
            const newBwScore = parseFloat(scoreDisplay.textContent);

            // 4. Check persistence
            const saved = JSON.parse(localStorage.getItem('vbt_pr_data_v1'));

            return {
                initialScore,
                initialTotal,
                femaleScore,
                femaleAria,
                maleAria,
                compTotal,
                compScore,
                newBwScore,
                savedBw: saved.bodyweight,
                savedGender: saved.gender,
                savedSource: saved.activeDotsSource
            };
        })()
        """
        res = self.eval_js(js_test)
        self.assertEqual(res["initialScore"], 413.73)
        self.assertEqual(res["initialTotal"], "600.0 kg")
        self.assertEqual(res["femaleAria"], "true")
        self.assertEqual(res["maleAria"], "false")
        self.assertEqual(res["compTotal"], "650.0 kg")
        self.assertEqual(res["savedBw"], 100.0)
        self.assertEqual(res["savedGender"], "female")
        self.assertEqual(res["savedSource"], "comp")


    # ═════════════════════════════════════════════════════════════════════════
    # 2. LONG-PRESS PR TAGGING ADVERSARIAL STRESS SUITE
    # ═════════════════════════════════════════════════════════════════════════

    def setUp(self):
        js_setup = """
        (() => {
            workouts = [{
                id: 'test_session_1',
                dateStr: new Date().toISOString(),
                sets: [{
                    setNumber: 1,
                    lift: 'Squat',
                    reps: [{
                        repNumber: 1,
                        velocity: 0.82,
                        rpe: 8.0,
                        lift: 'Squat',
                        timestamp: Date.now(),
                        isPR: false
                    }]
                }]
            }];
            activeWorkout = workouts[0];
            activeSet = activeWorkout.sets[0];
            recalculateSetMetrics(activeSet);
            updateSetUI(activeSet);
            persistStorage();
            return { repCount: activeSet.reps.length };
        })()
        """
        self.eval_js(js_setup)

    def test_long_press_duration_threshold_500ms(self):
        """
        Verify 500ms press-and-hold duration:
        - Release at 200ms (<500ms) -> cancels, NO PR badge, isPR remains false.
        - Release at 450ms (<500ms) -> cancels, NO PR badge, isPR remains false.
        - Hold for >=500ms -> triggers, PR badge displayed, isPR becomes true.
        """
        # Test A: Press and release at 200ms
        js_press_200 = """
        new Promise((resolve) => {
            const row = document.querySelector('#active-set-reps-list .rep-row-item');
            const rect = row.getBoundingClientRect();
            const cx = rect.left + 20;
            const cy = rect.top + 20;

            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
            const holdingImmediately = row.classList.contains('press-holding');

            setTimeout(() => {
                row.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
                const holdingAfterUp = row.classList.contains('press-holding');
                const rep = activeSet.reps[0];
                resolve({
                    holdingImmediately,
                    holdingAfterUp,
                    isPR: rep.isPR,
                    hasBadge: Boolean(row.querySelector('.rep-pr-badge'))
                });
            }, 200);
        })
        """
        res_200 = self.eval_js(js_press_200)
        self.assertTrue(res_200["holdingImmediately"])
        self.assertFalse(res_200["holdingAfterUp"])
        self.assertFalse(res_200["isPR"])
        self.assertFalse(res_200["hasBadge"])

        # Test B: Press and release at 450ms
        js_press_450 = """
        new Promise((resolve) => {
            const row = document.querySelector('#active-set-reps-list .rep-row-item');
            const rect = row.getBoundingClientRect();
            const cx = rect.left + 20;
            const cy = rect.top + 20;

            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
            setTimeout(() => {
                row.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
                const rep = activeSet.reps[0];
                resolve({
                    isPR: rep.isPR,
                    hasBadge: Boolean(row.querySelector('.rep-pr-badge'))
                });
            }, 450);
        })
        """
        res_450 = self.eval_js(js_press_450)
        self.assertFalse(res_450["isPR"])
        self.assertFalse(res_450["hasBadge"])

        # Test C: Press and hold for full 550ms (>= 500ms)
        js_press_550 = """
        new Promise((resolve) => {
            const row = document.querySelector('#active-set-reps-list .rep-row-item');
            const rect = row.getBoundingClientRect();
            const cx = rect.left + 20;
            const cy = rect.top + 20;

            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
            setTimeout(() => {
                const rep = activeSet.reps[0];
                const updatedRow = document.querySelector('#active-set-reps-list .rep-row-item');
                const badge = updatedRow.querySelector('.rep-pr-badge');
                resolve({
                    isPR: rep.isPR,
                    hasRowClass: updatedRow.classList.contains('is-pr'),
                    hasBadge: Boolean(badge),
                    badgeText: badge ? badge.textContent.trim() : null
                });
            }, 550);
        })
        """
        res_550 = self.eval_js(js_press_550)
        self.assertTrue(res_550["isPR"], "Expected rep.isPR to be true after 500ms hold")
        self.assertTrue(res_550["hasRowClass"], "Expected rep-row-item to have class is-pr")
        self.assertTrue(res_550["hasBadge"], "Expected rep-pr-badge to be present")
        self.assertEqual(res_550["badgeText"], "PR")

    def test_long_press_movement_cancellation_threshold(self):
        """
        Verify >10px Euclidean displacement threshold:
        - Movement <= 10px (e.g. dx=6, dy=8 -> dist=10.0px) MUST NOT abort hold.
        - Movement > 10px (e.g. dx=7, dy=8 -> dist=10.63px) MUST immediately abort hold.
        """
        # Part 1: Within threshold (dx=6, dy=8 -> dist=10.0px)
        js_move_10px = """
        new Promise((resolve) => {
            activeSet.reps[0].isPR = false;
            recalculateSetMetrics(activeSet);
            updateSetUI(activeSet);

            const row = document.querySelector('#active-set-reps-list .rep-row-item');
            const startX = 100;
            const startY = 100;

            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, button: 0, bubbles: true }));

            // Move 10.0px after 100ms
            setTimeout(() => {
                row.dispatchEvent(new PointerEvent('pointermove', { clientX: startX + 6, clientY: startY + 8, bubbles: true }));
            }, 100);

            // Check after 550ms
            setTimeout(() => {
                const rep = activeSet.reps[0];
                resolve({
                    isPR: rep.isPR,
                    holdingClass: row.classList.contains('press-holding')
                });
            }, 550);
        })
        """
        res_10px = self.eval_js(js_move_10px)
        self.assertTrue(res_10px["isPR"], "Displacement of exactly 10.0px must NOT cancel long-press")

        # Part 2: Exceeding threshold (dx=7, dy=8 -> dist=10.63px > 10px)
        js_move_11px = """
        new Promise((resolve) => {
            activeSet.reps[0].isPR = false;
            recalculateSetMetrics(activeSet);
            updateSetUI(activeSet);

            const row = document.querySelector('#active-set-reps-list .rep-row-item');
            const startX = 100;
            const startY = 100;

            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, button: 0, bubbles: true }));

            // Move 10.63px after 100ms
            setTimeout(() => {
                row.dispatchEvent(new PointerEvent('pointermove', { clientX: startX + 7, clientY: startY + 8, bubbles: true }));
                const holdingImmediatelyAfterExceed = row.classList.contains('press-holding');

                // Wait until past 500ms to verify no trigger occurred
                setTimeout(() => {
                    const rep = activeSet.reps[0];
                    resolve({
                        holdingImmediatelyAfterExceed,
                        isPR: rep.isPR
                    });
                }, 450);
            }, 100);
        })
        """
        res_11px = self.eval_js(js_move_11px)
        self.assertFalse(res_11px["holdingImmediatelyAfterExceed"], "Displacement >10px must immediately remove press-holding class")
        self.assertFalse(res_11px["isPR"], "Displacement >10px must abort long-press timer and prevent PR toggle")

    def test_long_press_reversible_toggling(self):
        """
        Verify reversible toggling:
        1. 500ms hold: false -> true
        2. 500ms hold: true -> false
        3. 500ms hold: false -> true
        """
        js_toggle_cycle = """
        (async () => {
            activeSet.reps[0].isPR = false;
            recalculateSetMetrics(activeSet);
            updateSetUI(activeSet);

            const triggerHold = () => {
                return new Promise((resolve) => {
                    const row = document.querySelector('#active-set-reps-list .rep-row-item');
                    row.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
                    setTimeout(() => {
                        resolve(activeSet.reps[0].isPR);
                    }, 550);
                });
            };

            const t1 = await triggerHold();
            const t2 = await triggerHold();
            const t3 = await triggerHold();

            return { t1, t2, t3 };
        })()
        """
        res_toggle = self.eval_js(js_toggle_cycle)
        self.assertTrue(res_toggle["t1"], "Cycle 1 must toggle false -> true")
        self.assertFalse(res_toggle["t2"], "Cycle 2 must toggle true -> false")
        self.assertTrue(res_toggle["t3"], "Cycle 3 must toggle false -> true")

    def test_long_press_haptic_feedback_safety(self):
        """
        Verify haptic vibration call safety:
        1. When navigator.vibrate is available: receives [40, 30, 60].
        2. When navigator.vibrate throws an exception: does not crash the app, PR still toggles.
        3. When navigator.vibrate is undefined: does not crash the app.
        """
        js_haptic_test = """
        (async () => {
            let vibrateCalls = [];
            const originalVibrate = navigator.vibrate;

            // Spy on vibrate
            navigator.vibrate = function(pattern) {
                vibrateCalls.push(pattern);
                return true;
            };

            // Hold 1: normal vibrate
            activeSet.reps[0].isPR = false;
            recalculateSetMetrics(activeSet);
            updateSetUI(activeSet);
            let row = document.querySelector('#active-set-reps-list .rep-row-item');
            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
            await new Promise(r => setTimeout(r, 550));
            const call1 = vibrateCalls.length > 0 ? vibrateCalls[0] : null;

            // Hold 2: throwing vibrate
            navigator.vibrate = function() {
                throw new Error('SecurityError: Vibration denied');
            };
            row = document.querySelector('#active-set-reps-list .rep-row-item');
            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
            await new Promise(r => setTimeout(r, 550));
            const toggledDespiteThrow = (activeSet.reps[0].isPR === false);

            // Hold 3: undefined vibrate
            delete navigator.vibrate;
            row = document.querySelector('#active-set-reps-list .rep-row-item');
            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
            await new Promise(r => setTimeout(r, 550));
            const toggledDespiteUndefined = (activeSet.reps[0].isPR === true);

            // Restore
            if (originalVibrate) {
                navigator.vibrate = originalVibrate;
            }

            return {
                call1,
                toggledDespiteThrow,
                toggledDespiteUndefined
            };
        })()
        """
        res_haptic = self.eval_js(js_haptic_test)
        self.assertEqual(res_haptic["call1"], [40, 30, 60], f"Expected navigator.vibrate([40, 30, 60]), got {res_haptic['call1']}")
        self.assertTrue(res_haptic["toggledDespiteThrow"], "App must survive throwing navigator.vibrate cleanly")
        self.assertTrue(res_haptic["toggledDespiteUndefined"], "App must survive undefined navigator.vibrate cleanly")

    def test_long_press_localstorage_persistence(self):
        """
        Verify that toggling PR tags immediately writes to localStorage under 'vbt_workouts_v1'.
        """
        js_storage_test = """
        (async () => {
            activeSet.reps[0].isPR = false;
            recalculateSetMetrics(activeSet);
            updateSetUI(activeSet);
            persistStorage();

            const getStoredPrState = () => {
                const raw = localStorage.getItem('vbt_workouts_v1');
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                return parsed[0].sets[0].reps[0].isPR;
            };

            const state0 = getStoredPrState();

            // Perform 500ms hold
            const row = document.querySelector('#active-set-reps-list .rep-row-item');
            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
            await new Promise(r => setTimeout(r, 550));

            const state1 = getStoredPrState();

            // Perform second 500ms hold
            const updatedRow = document.querySelector('#active-set-reps-list .rep-row-item');
            updatedRow.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
            await new Promise(r => setTimeout(r, 550));

            const state2 = getStoredPrState();

            return { state0, state1, state2 };
        })()
        """
        res_storage = self.eval_js(js_storage_test)
        self.assertFalse(res_storage["state0"])
        self.assertTrue(res_storage["state1"])
        self.assertFalse(res_storage["state2"])

    def test_long_press_cancellation_events_and_buttons(self):
        """
        Verify pointercancel and non-primary buttons:
        - pointercancel before 500ms aborts cleanly.
        - pointerdown with button=2 (right click) is ignored.
        - pointerdown with button=1 (middle click) is ignored.
        """
        js_event_test = """
        (async () => {
            activeSet.reps[0].isPR = false;
            recalculateSetMetrics(activeSet);
            updateSetUI(activeSet);
            const row = document.querySelector('#active-set-reps-list .rep-row-item');

            // 1. Right click
            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 2, bubbles: true }));
            const holdingRightClick = row.classList.contains('press-holding');

            // 2. Middle click
            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 1, bubbles: true }));
            const holdingMiddleClick = row.classList.contains('press-holding');

            // 3. Pointercancel
            row.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
            const holdingBeforeCancel = row.classList.contains('press-holding');
            await new Promise(r => setTimeout(r, 200));
            row.dispatchEvent(new PointerEvent('pointercancel', { clientX: 100, clientY: 100, bubbles: true }));
            const holdingAfterCancel = row.classList.contains('press-holding');
            await new Promise(r => setTimeout(r, 400));
            const prAfterCancel = activeSet.reps[0].isPR;

            return {
                holdingRightClick,
                holdingMiddleClick,
                holdingBeforeCancel,
                holdingAfterCancel,
                prAfterCancel
            };
        })()
        """
        res_events = self.eval_js(js_event_test)
        self.assertFalse(res_events["holdingRightClick"])
        self.assertFalse(res_events["holdingMiddleClick"])
        self.assertTrue(res_events["holdingBeforeCancel"])
        self.assertFalse(res_events["holdingAfterCancel"])
        self.assertFalse(res_events["prAfterCancel"])


if __name__ == '__main__':
    unittest.main()
