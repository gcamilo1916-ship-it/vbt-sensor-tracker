"""
Challenger Milestone 5: Empirical Stress Testing & Adversarial Verification Suite
Validates Requirements R1-R4 under stress, edge cases, boundaries, and high-frequency interaction.

Covers:
  R1: Weight Selection & Persistence
      - Stepper boundary clamping [0.0, 600.0]
      - Decimal precision rounding (1 decimal place)
      - Fuzzing / non-numeric fallback resilience
      - Live <-> Workout bidirectional reactive synchronization
      - Per-lift default memory (vbt_last_lift_weights_v1)
      - Active set weight tracking and completed sets table LOAD column
  R2: Workout & Lifetime Volume Engine
      - Mathematical volume accumulation oracle: sum(weight * reps)
      - Comma formatting verification across orders of magnitude
      - Zero reps / zero weight edge cases (no NaN)
      - Legacy workout resilience (missing weight defaults to 0)
      - Responsive 5-column layout for #sum-volume
  R3: Long-Press PR Promotion to Gym PR
      - Schema conformance: prProfile.currentPRDetails[lift] = { weight, velocity, rpe, timestamp }
      - Dedicated badges: #pr-squat-badge, #pr-bench-badge, #pr-deadlift-badge
      - Badge format: "${weight.toFixed(1)} kg • ${velocity.toFixed(2)} m/s • RPE ${rpe.toFixed(1)}"
      - Direct input sync between #pr-*-weight and currentPRDetails
      - Long-press promotion: 500ms threshold, >10px movement abort, fanfare & haptics
  R4: iOS Fluid Directional Tab Transition Animations
      - Forward (slide-left) and backward (slide-right) directional mapping
      - Synchronous iOS WebKit reflow trigger (void offsetHeight)
      - Rapid-clicking debouncer (clearTabTransitions) stress test (50 switches)
      - Horizontal clipping: overflow-x: hidden / clip
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

from tests.conftest_base import CHROME_PATH, INDEX_HTML

DEBUG_PORT = 9592
TARGET_URL = f"file:///{INDEX_HTML.replace(os.sep, '/')}"


class TestChallengerM5Stress(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(CHROME_PATH):
            raise unittest.SkipTest("Google Chrome binary not found on host")

        cls.proc = subprocess.Popen([
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu",
            f"--remote-debugging-port={DEBUG_PORT}",
            "--remote-allow-origins=*",
            TARGET_URL
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

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

        for _ in range(50):
            rs = cls.eval_js("document.readyState")
            if rs in ("interactive", "complete"):
                break
            time.sleep(0.05)
        time.sleep(0.25)

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
        while time.time() - start_time < 3.0:
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
    # REQUIREMENT R1: Set Weight Selection & Persistence
    # ═════════════════════════════════════════════════════════════════════════

    def test_r1_01_stepper_lower_bound_clamping(self):
        """R1: Test stepping down at or near 0kg never produces negative weight."""
        res = self.eval_js("""
            (() => {
                setWorkingWeight(1.0, true);
                stepWorkingWeight(-2.5);
                const w1 = currentWorkingWeight;
                stepWorkingWeight(-2.5);
                const w2 = currentWorkingWeight;
                return { w1, w2, liveVal: liveSetWeightInput.value, workoutVal: workoutSetWeightInput.value };
            })()
        """)
        self.assertEqual(res['w1'], 0.0)
        self.assertEqual(res['w2'], 0.0)
        self.assertEqual(res['liveVal'], "0.0")
        self.assertEqual(res['workoutVal'], "0.0")

    def test_r1_02_stepper_upper_bound_clamping(self):
        """R1: Test stepping up past 600kg clamps at 600.0kg maximum."""
        res = self.eval_js("""
            (() => {
                setWorkingWeight(599.0, true);
                stepWorkingWeight(2.5);
                const w1 = currentWorkingWeight;
                stepWorkingWeight(10.0);
                const w2 = currentWorkingWeight;
                return { w1, w2, liveVal: liveSetWeightInput.value };
            })()
        """)
        self.assertEqual(res['w1'], 600.0)
        self.assertEqual(res['w2'], 600.0)
        self.assertEqual(res['liveVal'], "600.0")

    def test_r1_03_decimal_precision_rounding(self):
        """R1: Test float precision rounding rounds to nearest 0.1kg."""
        res = self.eval_js("""
            (() => {
                setWorkingWeight(142.555, true);
                return { weight: currentWorkingWeight, liveVal: liveSetWeightInput.value };
            })()
        """)
        self.assertEqual(res['weight'], 142.6)
        self.assertEqual(res['liveVal'], "142.6")

    def test_r1_04_fuzz_non_numeric_and_corrupt_inputs(self):
        """R1: Test entering non-numeric strings ('abc', '---', NaN) safely defaults to 0 without crash."""
        res = self.eval_js("""
            (() => {
                setWorkingWeight("abc", true);
                const w1 = currentWorkingWeight;
                setWorkingWeight("", true);
                const w2 = currentWorkingWeight;
                setWorkingWeight(NaN, true);
                const w3 = currentWorkingWeight;
                return { w1, w2, w3 };
            })()
        """)
        self.assertEqual(res['w1'], 0.0)
        self.assertEqual(res['w2'], 0.0)
        self.assertEqual(res['w3'], 0.0)

    def test_r1_05_bidirectional_input_synchronization(self):
        """R1: Test typing in Live input immediately updates Workout input and vice versa."""
        res = self.eval_js("""
            (() => {
                // Simulate typing in live input
                liveSetWeightInput.value = "175.5";
                liveSetWeightInput.dispatchEvent(new Event('input', { bubbles: true }));
                const afterLive = {
                    workoutVal: workoutSetWeightInput.value,
                    workingWeight: currentWorkingWeight
                };

                // Simulate typing in workout input
                workoutSetWeightInput.value = "210.0";
                workoutSetWeightInput.dispatchEvent(new Event('input', { bubbles: true }));
                const afterWorkout = {
                    liveVal: liveSetWeightInput.value,
                    workingWeight: currentWorkingWeight
                };

                return { afterLive, afterWorkout };
            })()
        """)
        self.assertEqual(res['afterLive']['workoutVal'], "175.5")
        self.assertEqual(res['afterLive']['workingWeight'], 175.5)
        self.assertEqual(res['afterWorkout']['liveVal'], "210.0")
        self.assertEqual(res['afterWorkout']['workingWeight'], 210.0)

    def test_r1_06_per_lift_independent_weight_memory(self):
        """R1: Test per-lift memory restores correct weight when switching between exercises."""
        res = self.eval_js("""
            (() => {
                // Set Deadlift
                applyLiftTheme('deadlift');
                setWorkingWeight(190.0, true);

                // Set Squat
                applyLiftTheme('squat');
                setWorkingWeight(130.0, true);

                // Set Bench
                applyLiftTheme('bench');
                setWorkingWeight(95.0, true);

                // Switch back to Deadlift
                applyLiftTheme('deadlift');
                const dlWeight = currentWorkingWeight;
                const dlLiveVal = liveSetWeightInput.value;

                // Switch back to Squat
                applyLiftTheme('squat');
                const sqWeight = currentWorkingWeight;
                const sqLiveVal = liveSetWeightInput.value;

                // Switch back to Bench
                applyLiftTheme('bench');
                const bpWeight = currentWorkingWeight;
                const bpLiveVal = liveSetWeightInput.value;

                const storedRaw = localStorage.getItem('vbt_last_lift_weights_v1');
                const stored = storedRaw ? JSON.parse(storedRaw) : {};

                return { dlWeight, dlLiveVal, sqWeight, sqLiveVal, bpWeight, bpLiveVal, stored };
            })()
        """)
        self.assertEqual(res['dlWeight'], 190.0)
        self.assertEqual(res['dlLiveVal'], "190.0")
        self.assertEqual(res['sqWeight'], 130.0)
        self.assertEqual(res['sqLiveVal'], "130.0")
        self.assertEqual(res['bpWeight'], 95.0)
        self.assertEqual(res['bpLiveVal'], "95.0")
        self.assertEqual(res['stored']['Deadlift'], 190.0)
        self.assertEqual(res['stored']['Squat'], 130.0)
        self.assertEqual(res['stored']['Bench'], 95.0)

    def test_r1_07_active_set_persistence_and_completed_sets_table_load(self):
        """R1: Test activeSet.weight is saved in vbt_workouts_v1 and rendered as LOAD in sets table."""
        res = self.eval_js("""
            (() => {
                // Ensure fresh session in workouts
                const session = {
                    id: 'test_session_r1',
                    name: 'Test Session R1',
                    startTime: Date.now(),
                    dateStr: '2026-10-22',
                    sets: []
                };
                workouts = [session];
                activeWorkout = session;

                // Start set under Squat with weight 135.0
                applyLiftTheme('squat');
                setWorkingWeight(135.0, true);
                startNewSet('Squat');
                const setWeightAtStart = activeSet.weight;

                // Modify weight mid-set to 140.0
                setWorkingWeight(140.0, true);
                const setWeightModified = activeSet.weight;

                // Add 2 reps
                activeSet.reps.push({
                    repNumber: 1,
                    velocity: 0.65,
                    peakVelocity: 0.85,
                    rpe: 7.5,
                    timestamp: Date.now(),
                    lift: 'Squat',
                    isPR: false
                });
                activeSet.reps.push({
                    repNumber: 2,
                    velocity: 0.60,
                    peakVelocity: 0.80,
                    rpe: 8.0,
                    timestamp: Date.now() + 1000,
                    lift: 'Squat',
                    isPR: false
                });

                // End set cleanly
                endActiveSet();

                // Inspect completed sets table
                updateWorkoutPage();
                const tableHtml = workoutSetsTable.innerHTML;
                const loadMetricPresent = tableHtml.includes('LOAD');
                const loadValuePresent = tableHtml.includes('140.0 kg');

                // Check localStorage
                const storedWorkouts = JSON.parse(localStorage.getItem('vbt_workouts_v1') || '[]');
                const savedSet = storedWorkouts.length > 0 && storedWorkouts[0].sets.length > 0
                    ? storedWorkouts[0].sets[0]
                    : null;

                return {
                    setWeightAtStart,
                    setWeightModified,
                    loadMetricPresent,
                    loadValuePresent,
                    savedSetWeight: savedSet ? savedSet.weight : null
                };
            })()
        """)
        self.assertEqual(res['setWeightAtStart'], 135.0)
        self.assertEqual(res['setWeightModified'], 140.0)
        self.assertTrue(res['loadMetricPresent'], "Completed sets table must display 'LOAD' metric label")
        self.assertTrue(res['loadValuePresent'], "Completed sets table must display '140.0 kg' load value")
        self.assertEqual(res['savedSetWeight'], 140.0, "Saved set in vbt_workouts_v1 must have weight 140.0")

    # ═════════════════════════════════════════════════════════════════════════
    # REQUIREMENT R2: Workout & Lifetime Volume Engine
    # ═════════════════════════════════════════════════════════════════════════

    def test_r2_01_volume_mathematical_oracle(self):
        """R2: Mathematical volume oracle: sum(set.weight * reps.length) matches expected sum."""
        res = self.eval_js("""
            (() => {
                workouts = [
                    {
                        id: 'sess_1',
                        name: 'Session 1',
                        startTime: 1000,
                        endTime: 2000,
                        dateStr: '2026-10-22',
                        sets: [
                            { setId: 's1', setNumber: 1, lift: 'Squat', weight: 100.0, avgVelocity: 0.7, velocityLossPct: 10, reps: [
                                { repNumber: 1, velocity: 0.7 }, { repNumber: 2, velocity: 0.7 }, { repNumber: 3, velocity: 0.7 }, { repNumber: 4, velocity: 0.7 }, { repNumber: 5, velocity: 0.7 }
                            ] }, // 5 * 100 = 500
                            { setId: 's2', setNumber: 2, lift: 'Squat', weight: 120.0, avgVelocity: 0.6, velocityLossPct: 15, reps: [
                                { repNumber: 1, velocity: 0.6 }, { repNumber: 2, velocity: 0.6 }, { repNumber: 3, velocity: 0.6 }
                            ] },       // 3 * 120 = 360
                            { setId: 's3', setNumber: 3, lift: 'Deadlift', weight: 140.0, avgVelocity: 0.5, velocityLossPct: 20, reps: [
                                { repNumber: 1, velocity: 0.5 }
                            ] }             // 1 * 140 = 140
                        ]
                    },
                    {
                        id: 'sess_2',
                        name: 'Session 2',
                        startTime: 3000,
                        endTime: 4000,
                        dateStr: '2026-10-22',
                        sets: [
                            { setId: 's4', setNumber: 1, lift: 'Bench', weight: 80.0, avgVelocity: 0.8, velocityLossPct: 5, reps: [
                                { repNumber: 1, velocity: 0.8 }, { repNumber: 2, velocity: 0.8 }, { repNumber: 3, velocity: 0.8 }, { repNumber: 4, velocity: 0.8 }, { repNumber: 5, velocity: 0.8 },
                                { repNumber: 6, velocity: 0.8 }, { repNumber: 7, velocity: 0.8 }, { repNumber: 8, velocity: 0.8 }, { repNumber: 9, velocity: 0.8 }, { repNumber: 10, velocity: 0.8 }
                            ] } // 10 * 80 = 800
                        ]
                    }
                ];

                updateHistoryStats();
                renderHistoryView();

                const sess1ExpectedVol = 500 + 360 + 140; // 1,000 kg
                const sess2ExpectedVol = 800;             // 800 kg
                const lifetimeExpectedVol = 1800;         // 1,800 kg

                const sumVolText = sumVolume ? sumVolume.textContent : '';
                const card1 = document.querySelector('.session-card[data-session-id="sess_1"]');
                const card1VolText = card1 ? card1.querySelector('.stat-chip-val').textContent : '';

                return {
                    sumVolText,
                    card1VolText,
                    sess1ExpectedVol,
                    sess2ExpectedVol,
                    lifetimeExpectedVol
                };
            })()
        """)
        self.assertEqual(res['sumVolText'], "1,800 kg")
        self.assertEqual(res['card1VolText'], "1,000 kg")

    def test_r2_02_volume_comma_formatting_across_orders_of_magnitude(self):
        """R2: Comma formatting renders correctly across small, medium, and massive volumes."""
        test_cases = [
            (500, "500 kg"),
            (1000, "1,000 kg"),
            (12450, "12,450 kg"),
            (100000, "100,000 kg"),
            (1250000, "1,250,000 kg")
        ]
        for vol_val, expected_str in test_cases:
            res = self.eval_js(f"""
                (() => {{
                    workouts = [{{
                        id: 'mag_test',
                        name: 'Magnitude Test',
                        sets: [{{
                            setId: 'm1',
                            setNumber: 1,
                            lift: 'Squat',
                            weight: {vol_val},
                            avgVelocity: 0.5,
                            velocityLossPct: 0,
                            reps: [{{ repNumber: 1, velocity: 0.5 }}]
                        }}]
                    }}];
                    updateHistoryStats();
                    renderHistoryView();
                    const card = document.querySelector('.session-card[data-session-id="mag_test"]');
                    const chip = card ? card.querySelector('.stat-chip-val').textContent : '';
                    const sum = sumVolume ? sumVolume.textContent : '';
                    return {{ chip, sum }};
                }})()
            """)
            self.assertEqual(res['chip'], expected_str, f"Session volume mismatch for {vol_val}")
            self.assertEqual(res['sum'], expected_str, f"Lifetime volume mismatch for {vol_val}")

    def test_r2_03_zero_and_legacy_session_resilience(self):
        """R2: Legacy sets without weight property and 0-rep sets do not throw or produce NaN."""
        res = self.eval_js("""
            (() => {
                workouts = [
                    {
                        id: 'legacy_sess',
                        name: 'Legacy Session',
                        sets: [
                            { setId: 'l1', setNumber: 1, lift: 'Deadlift', avgVelocity: 0.5, velocityLossPct: 0.0, reps: [{ repNumber: 1, velocity: 0.5 }] }, // missing weight
                            { setId: 'l2', setNumber: 2, lift: 'Squat', weight: 100, avgVelocity: 0.0, velocityLossPct: 0.0, reps: [] }          // 0 reps
                        ]
                    }
                ];
                updateHistoryStats();
                renderHistoryView();
                const card = document.querySelector('.session-card[data-session-id="legacy_sess"]');
                const chip = card ? card.querySelector('.stat-chip-val').textContent : '';
                const sum = sumVolume ? sumVolume.textContent : '';
                return { chip, sum, hasNaN: chip.includes('NaN') || sum.includes('NaN') };
            })()
        """)
        self.assertFalse(res['hasNaN'], "Volume rendering must never produce 'NaN'")
        self.assertEqual(res['chip'], "0 kg")
        self.assertEqual(res['sum'], "0 kg")

    def test_r2_04_history_summary_card_responsive_5_column_layout(self):
        """R2: Verify .history-summary-card has 5 columns and #sum-volume is properly positioned."""
        res = self.eval_js("""
            (() => {
                const card = document.querySelector('.history-summary-card');
                const computed = window.getComputedStyle(card);
                const cols = computed.getPropertyValue('grid-template-columns').trim();
                const tileCount = card.querySelectorAll('.summary-metric').length;
                const sumVolTile = document.getElementById('sum-volume');
                const isVolPresent = Boolean(sumVolTile && card.contains(sumVolTile));
                return { cols, tileCount, isVolPresent };
            })()
        """)
        self.assertEqual(res['tileCount'], 5, f"Expected 5 summary-metric tiles, got {res['tileCount']}")
        self.assertTrue('repeat(5' in res['cols'] or len(res['cols'].split()) >= 5 or '1fr' in res['cols'],
                        f"Grid columns must accommodate 5 tiles, got: {res['cols']}")
        self.assertTrue(res['isVolPresent'], "#sum-volume tile must be inside .history-summary-card")

    # ═════════════════════════════════════════════════════════════════════════
    # REQUIREMENT R3: Long-Press PR Promotion to Gym PR with Velocity & RPE
    # ═════════════════════════════════════════════════════════════════════════

    def test_r3_01_current_pr_details_schema_and_persistence(self):
        """R3: Verify currentPRDetails schema in default profile and persistence to vbt_pr_data_v1."""
        res = self.eval_js("""
            (() => {
                loadPrProfile();
                const hasSquat = Boolean(prProfile.currentPRDetails && prProfile.currentPRDetails.squat);
                const hasBench = Boolean(prProfile.currentPRDetails && prProfile.currentPRDetails.bench);
                const hasDead  = Boolean(prProfile.currentPRDetails && prProfile.currentPRDetails.deadlift);

                const sDetails = prProfile.currentPRDetails.squat;
                const validProps = ('weight' in sDetails) && ('velocity' in sDetails) && ('rpe' in sDetails) && ('timestamp' in sDetails);

                // Modify squat PR details and persist
                prProfile.currentPRDetails.squat = { weight: 165.0, velocity: 0.40, rpe: 9.0, timestamp: 123456789 };
                persistPrProfile();

                // Reload from localStorage
                const storedRaw = localStorage.getItem('vbt_pr_data_v1');
                const stored = storedRaw ? JSON.parse(storedRaw) : {};
                const storedSquat = stored.currentPRDetails ? stored.currentPRDetails.squat : null;

                return { hasSquat, hasBench, hasDead, validProps, storedSquat };
            })()
        """)
        self.assertTrue(res['hasSquat'] and res['hasBench'] and res['hasDead'], "currentPRDetails must contain squat, bench, deadlift")
        self.assertTrue(res['validProps'], "PR details must have weight, velocity, rpe, and timestamp")
        self.assertEqual(res['storedSquat']['weight'], 165.0)
        self.assertEqual(res['storedSquat']['velocity'], 0.40)
        self.assertEqual(res['storedSquat']['rpe'], 9.0)

    def test_r3_02_history_gym_pr_badges_dynamic_formatting(self):
        """R3: Badges #pr-squat-badge, #pr-bench-badge, #pr-deadlift-badge format correctly."""
        res = self.eval_js("""
            (() => {
                prProfile.currentPRDetails = {
                    squat: { weight: 145.5, velocity: 0.38, rpe: 9.5, timestamp: Date.now() },
                    bench: { weight: 102.5, velocity: 0.22, rpe: 10.0, timestamp: Date.now() },
                    deadlift: { weight: 185.0, velocity: 0.31, rpe: 9.0, timestamp: Date.now() }
                };
                updatePrDashboardUI(true);

                const squatBadgeText = prSquatBadge ? prSquatBadge.textContent.trim() : '';
                const benchBadgeText = prBenchBadge ? prBenchBadge.textContent.trim() : '';
                const deadBadgeText  = prDeadliftBadge ? prDeadliftBadge.textContent.trim() : '';

                return { squatBadgeText, benchBadgeText, deadBadgeText };
            })()
        """)
        self.assertEqual(res['squatBadgeText'], "145.5 kg • 0.38 m/s • RPE 9.5")
        self.assertEqual(res['benchBadgeText'], "102.5 kg • 0.22 m/s • RPE 10.0")
        self.assertEqual(res['deadBadgeText'], "185.0 kg • 0.31 m/s • RPE 9.0")

    def test_r3_03_contract_ids_preservation_in_current_prs_card(self):
        """R3: All prior contract IDs in #current-prs-card remain intact."""
        required_ids = [
            "pr-squat-weight",
            "pr-bench-weight",
            "pr-deadlift-weight",
            "pr-squat-vel",
            "pr-bench-vel",
            "pr-deadlift-vel",
            "pr-current-total",
            "pr-squat-badge",
            "pr-bench-badge",
            "pr-deadlift-badge"
        ]
        for el_id in required_ids:
            exists = self.eval_js(f"Boolean(document.getElementById('{el_id}'))")
            self.assertTrue(exists, f"Element #{el_id} must exist in DOM")

    def test_r3_04_direct_numeric_input_synchronizes_pr_details_weight(self):
        """R3: Editing #pr-*-weight numeric inputs updates currentPRDetails[lift].weight in lockstep."""
        res = self.eval_js("""
            (() => {
                initPrDashboardListeners();
                prSquatWeight.value = "172.5";
                prSquatWeight.dispatchEvent(new Event('input', { bubbles: true }));

                const squatDetailWeight = prProfile.currentPRDetails.squat.weight;
                const squatBadgeText = prSquatBadge.textContent.trim();

                return { squatDetailWeight, squatBadgeText };
            })()
        """)
        self.assertEqual(res['squatDetailWeight'], 172.5)
        self.assertTrue(res['squatBadgeText'].startswith("172.5 kg"), f"Badge should reflect 172.5 kg, got {res['squatBadgeText']}")

    def test_r3_05_long_press_rep_promotion_and_reversal(self):
        """R3: Long-pressing repetition promotes weight to Gym PR, updates details, and can reverse."""
        res = self.eval_js("""
            (async () => {
                // Setup active workout with a set and repetition
                activeWorkout = {
                    id: 'sess_pr_test',
                    name: 'PR Test',
                    sets: []
                };
                applyLiftTheme('bench');
                const testSet = {
                    setId: 'set_bench_pr',
                    setNumber: 1,
                    lift: 'Bench',
                    weight: 115.0,
                    avgVelocity: 0.28,
                    maxVelocity: 0.28,
                    minVelocity: 0.28,
                    velocityLossPct: 0,
                    avgRpe: 9.5,
                    reps: [
                        {
                            repNumber: 1,
                            velocity: 0.28,
                            peakVelocity: 0.32,
                            rpe: 9.5,
                            timestamp: Date.now(),
                            lift: 'Bench',
                            isPR: false
                        }
                    ]
                };
                activeWorkout.sets.push(testSet);
                activeSet = testSet;
                updateSetUI(testSet);

                const repRow = activeSetRepsList.querySelector('.rep-row-item[data-rep-number="1"]');
                if (!repRow) return { error: 'rep row not found' };

                // Trigger 500ms long-press
                repRow.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }));
                const holdingState = repRow.classList.contains('press-holding');

                // Wait 550ms for the 500ms long-press to fire
                await new Promise(r => setTimeout(r, 550));

                const rep = activeSet.reps[0];
                const benchPR = prProfile.currentPRs.bench;
                const benchDetails = prProfile.currentPRDetails.bench;
                const badgeText = prBenchBadge ? prBenchBadge.textContent.trim() : '';

                // Perform second 500ms hold to test reversal
                const updatedRow = activeSetRepsList.querySelector('.rep-row-item[data-rep-number="1"]');
                updatedRow.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }));
                await new Promise(r => setTimeout(r, 550));
                const reversedIsPR = activeSet.reps[0].isPR;

                return {
                    holdingState,
                    isPR: rep.isPR,
                    benchPR,
                    benchDetails,
                    badgeText,
                    reversedIsPR
                };
            })()
        """)
        self.assertTrue(res['holdingState'], "Pointerdown must initiate press-holding state")
        self.assertEqual(res['benchPR'], 115.0, "Gym PR for bench must be promoted to 115.0kg")
        self.assertEqual(res['benchDetails']['weight'], 115.0)
        self.assertEqual(res['benchDetails']['rpe'], 9.5)
        self.assertTrue(res['badgeText'].startswith("115.0 kg"), f"Badge text should start with 115.0 kg, got {res['badgeText']}")
        self.assertFalse(res['reversedIsPR'], "Second long-press must reverse isPR to false")

    def test_r3_06_long_press_movement_cancellation(self):
        """R3: Moving >10px during press-and-hold aborts the long-press and does not promote."""
        res = self.eval_js("""
            (async () => {
                const testSet = {
                    setId: 'set_move_abort',
                    setNumber: 1,
                    lift: 'Squat',
                    weight: 150.0,
                    avgVelocity: 0.4,
                    maxVelocity: 0.4,
                    minVelocity: 0.4,
                    velocityLossPct: 0,
                    avgRpe: 8.5,
                    reps: [
                        {
                            repNumber: 1,
                            velocity: 0.40,
                            peakVelocity: 0.45,
                            rpe: 8.5,
                            timestamp: Date.now(),
                            lift: 'Squat',
                            isPR: false
                        }
                    ]
                };
                activeWorkout.sets.push(testSet);
                activeSet = testSet;
                updateSetUI(testSet);

                const repRow = activeSetRepsList.querySelector('.rep-row-item[data-rep-number="1"]');
                repRow.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }));

                // Move 15px (exceeds 10px guard)
                repRow.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 115, clientY: 100 }));

                const holdingAfterMove = repRow.classList.contains('press-holding');

                // Wait 550ms
                await new Promise(r => setTimeout(r, 550));

                const isPR = activeSet.reps[0].isPR;
                return { holdingAfterMove, isPR };
            })()
        """)
        self.assertFalse(res['holdingAfterMove'], "Movement >10px must abort the hold")
        self.assertFalse(res['isPR'], "Rep must not be promoted when movement threshold was exceeded")

    # ═════════════════════════════════════════════════════════════════════════
    # REQUIREMENT R4: iOS Fluid Directional Tab Transition Animations
    # ═════════════════════════════════════════════════════════════════════════

    def test_r4_01_tab_order_mapping_and_directionality(self):
        """R4: Verify TAB_ORDER mapping and forward/backward directional classes."""
        res = self.eval_js("""
            (() => {
                const to = window.TAB_ORDER;
                return {
                    live: to.live,
                    set: to.set,
                    history: to.history
                };
            })()
        """)
        self.assertEqual(res['live'], 0)
        self.assertEqual(res['set'], 1)
        self.assertEqual(res['history'], 2)

    def test_r4_02_forward_and_backward_transition_classes(self):
        """R4: Navigating forward applies slide-left; navigating backward applies slide-right."""
        # Forward navigation: Live (0) -> History (2)
        forward_res = self.eval_js("""
            (() => {
                // Ensure on live
                switchTab('live');
                clearTabTransitions();

                // Switch to history
                switchTab('history');

                const liveSec = document.getElementById('tab-live');
                const histSec = document.getElementById('tab-history');

                const liveClasses = liveSec ? liveSec.className : '';
                const histClasses = histSec ? histSec.className : '';

                return { liveClasses, histClasses };
            })()
        """)
        self.assertIn("slide-left-out", forward_res['liveClasses'], "Exiting section forward must have slide-left-out")
        self.assertIn("slide-left-in", forward_res['histClasses'], "Entering section forward must have slide-left-in")

        # Wait for transition timeout cleanup (280ms)
        time.sleep(0.35)

        # Backward navigation: History (2) -> Live (0)
        backward_res = self.eval_js("""
            (() => {
                // Switch back to live
                switchTab('live');

                const liveSec = document.getElementById('tab-live');
                const histSec = document.getElementById('tab-history');

                const liveClasses = liveSec ? liveSec.className : '';
                const histClasses = histSec ? histSec.className : '';

                return { liveClasses, histClasses };
            })()
        """)
        self.assertIn("slide-right-out", backward_res['histClasses'], "Exiting section backward must have slide-right-out")
        self.assertIn("slide-right-in", backward_res['liveClasses'], "Entering section backward must have slide-right-in")

    def test_r4_03_rapid_clicking_stress_test(self):
        """R4: 50 ultra-rapid tab switches settle cleanly with exactly one active section."""
        res = self.eval_js("""
            (async () => {
                const targets = ['live', 'set', 'history'];
                for (let i = 0; i < 50; i++) {
                    const target = targets[i % 3];
                    switchTab(target);
                }

                // Check immediate state
                const activeCountImmediate = document.querySelectorAll('.tab-section.active-section').length;

                // Wait 350ms for transitions to settle
                await new Promise(r => setTimeout(r, 350));

                const activeSections = document.querySelectorAll('.tab-section.active-section');
                const leavingSections = document.querySelectorAll('.tab-section.leaving-section');
                const slidingIn = document.querySelectorAll('.slide-left-in, .slide-right-in');
                const slidingOut = document.querySelectorAll('.slide-left-out, .slide-right-out');
                const bottomNavActive = document.querySelector('.bottom-glass-nav').getAttribute('data-active');
                const activeSectionId = activeSections[0] ? activeSections[0].id : '';

                return {
                    activeCountImmediate,
                    activeCount: activeSections.length,
                    leavingCount: leavingSections.length,
                    slidingInCount: slidingIn.length,
                    slidingOutCount: slidingOut.length,
                    bottomNavActive,
                    activeSectionId
                };
            })()
        """)
        self.assertEqual(res['activeCountImmediate'], 1, "Exactly one active section must be marked active immediately")
        self.assertEqual(res['activeCount'], 1, "After settling, exactly one section must be active")
        self.assertEqual(res['leavingCount'], 0, "After settling, zero sections should have leaving-section")
        self.assertEqual(res['slidingInCount'], 0, "After settling, zero sections should have slide-*-in")
        self.assertEqual(res['slidingOutCount'], 0, "After settling, zero sections should have slide-*-out")
        self.assertEqual(f"tab-{res['bottomNavActive']}", res['activeSectionId'], "Bottom nav data-active must match active section ID")

    def test_r4_04_viewport_horizontal_clipping(self):
        """R4: .tab-contents must enforce horizontal clipping (overflow-x: hidden / clip)."""
        res = self.eval_js("""
            (() => {
                const tc = document.querySelector('.tab-contents');
                const comp = window.getComputedStyle(tc);
                return {
                    overflowX: comp.getPropertyValue('overflow-x')
                };
            })()
        """)
        self.assertIn(res['overflowX'], ['hidden', 'clip'], ".tab-contents overflow-x must be hidden or clip to prevent iOS horizontal jitter")


if __name__ == "__main__":
    unittest.main()
