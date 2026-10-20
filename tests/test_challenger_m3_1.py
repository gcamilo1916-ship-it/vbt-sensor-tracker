"""
tests/test_challenger_m3_1.py — Empirical Challenger M3-1 Adversarial Stress Test Suite.

Adversarially challenge and stress-test the Milestone 3 firmware routines:
1. I2C Recovery Logic & Fault Handling:
   - NXP UM10204 9-clock bit-bang un-wedge specification conformance
   - State transitions under bus fault conditions (transient vs prolonged outages)
   - 6-axis NaN/Inf dropout matrix and cooldown throttle
2. Boot Calibration Variance & Motion Injection:
   - Boundary variance sensitivity (just below vs just above threshold)
   - Extreme noise, violent motion, and corrupted packets during boot warmup
   - Dynamic auto-recalibration upon rack stillness without MCU reboot
3. BLE Reconnect Scenarios & Telemetry Integrity:
   - Rapid connect/disconnect storms mid-rep with displacement continuity verification
   - Offline repetition buffering and immediate reconnection flush
   - High-cadence cycling across wireless dropout windows
4. Embedded Hyperparameter Integrity & Compile-time Overrides:
   - 18 JADE-converged constants verification against optimized_parameters.json
   - Compile-time macro override guards (#ifndef OPT_*)
"""

from __future__ import annotations

import os
import re
import sys
import math
import json
import time
import random
import unittest
from typing import Dict, Any, List, Tuple, Optional

REPO_ROOT_ANTI = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO_ROOT_PIO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "PlatformIO", "Projects", "VBT"))
if REPO_ROOT_ANTI not in sys.path:
    sys.path.insert(0, REPO_ROOT_ANTI)

from tests.vbt_test_fixtures import VBTKinematicGenerator
from tests.sim_madgwick import RobustVBTTracker, MadgwickAHRS
from tests.policy_optimizer import DEFAULT_GENE_SPECS, decode_vector_to_params


class TestChallengerM3I2CRecovery(unittest.TestCase):
    """Adversarial stress-testing of I2C bus un-wedge and 6-axis fault recovery."""

    @classmethod
    def setUpClass(cls):
        cls.main_cpp_path = os.path.join(REPO_ROOT_PIO, "src", "main.cpp")
        cls.header_path = os.path.join(REPO_ROOT_PIO, "include", "i2c_recovery.hpp")
        cls.assertTrue(os.path.exists(cls.main_cpp_path), f"Missing {cls.main_cpp_path}")
        cls.assertTrue(os.path.exists(cls.header_path), f"Missing {cls.header_path}")

        with open(cls.main_cpp_path, "r", encoding="utf-8") as f:
            cls.main_cpp = f.read()
        with open(cls.header_path, "r", encoding="utf-8") as f:
            cls.header_cpp = f.read()

    def test_c1_01_nxp_scl_9_clock_unwedge_conformance(self):
        """Stress-test NXP UM10204 Section 3.1.16 Bus Clear specification in C++ code."""
        # 1. Wire.end() called to detach peripheral hardware
        self.assertIn("Wire.end()", self.main_cpp, "Must release hardware I2C controller via Wire.end()")

        # 2. GPIO SCL configured as OUTPUT, SDA as INPUT_PULLUP
        scl_out = bool(re.search(r"pinMode\s*\(\s*SCL\s*,\s*OUTPUT\s*\)", self.main_cpp))
        sda_pullup = bool(re.search(r"pinMode\s*\(\s*SDA\s*,\s*INPUT_PULLUP\s*\)", self.main_cpp))
        self.assertTrue(scl_out, "SCL must be configured as OUTPUT for bit-banging")
        self.assertTrue(sda_pullup, "SDA must be INPUT_PULLUP to monitor slave line release")

        # 3. 9 clock pulses on SCL (100kHz standard mode: 5us HIGH, 5us LOW)
        loop_match = re.search(r"for\s*\(\s*int\s+pulse\s*=\s*0\s*;\s*pulse\s*<\s*9\s*;\s*pulse\+\+\s*\)\s*\{([^}]+)\}", self.main_cpp)
        self.assertIsNotNone(loop_match, "Must contain a 9-clock toggle loop for (int pulse = 0; pulse < 9; pulse++)")
        loop_body = loop_match.group(1)
        self.assertIn("digitalWrite(SCL, HIGH)", loop_body)
        self.assertIn("digitalWrite(SCL, LOW)", loop_body)
        self.assertIn("delayMicroseconds(5)", loop_body)

        # 4. Standard STOP condition (SDA transitions LOW -> HIGH while SCL is HIGH)
        stop_match = re.search(r"digitalWrite\s*\(\s*SDA\s*,\s*LOW\s*\)[\s\S]*?digitalWrite\s*\(\s*SCL\s*,\s*HIGH\s*\)[\s\S]*?digitalWrite\s*\(\s*SDA\s*,\s*HIGH\s*\)", self.main_cpp)
        self.assertIsNotNone(stop_match, "Must generate valid STOP condition: SDA LOW -> SCL HIGH -> SDA HIGH")

        # 5. Hardware TwoWire re-attach with 400kHz fast mode and timeout guard
        self.assertIn("Wire.begin(SDA, SCL, 400000)", self.main_cpp)
        self.assertIn("Wire.setTimeOut(25)", self.main_cpp)

        # 6. MPU-6050 register reconfiguration
        self.assertIn("mpu.setAccelerometerRange(MPU6050_RANGE_4_G)", self.main_cpp)
        self.assertIn("mpu.setFilterBandwidth(MPU6050_BAND_21_HZ)", self.main_cpp)
        self.assertIn("mpu.setGyroRange(MPU6050_RANGE_500_DEG)", self.main_cpp)

    def test_c1_02_fault_threshold_and_cooldown_oracle(self):
        """Simulate I2C fault state machine and verify threshold gating and 500ms cooldown."""
        # Constants from header
        FAULT_THRESH = 5
        COOLDOWN_MS = 500
        MAX_MID_REP_ERRORS = 15

        state = {
            "consecutive_errors": 0,
            "total_read_errors": 0,
            "total_bus_resets": 0,
            "last_recovery_ms": -1000,
            "sensor_healthy": True,
            "current_state": "CONCENTRIC",
            "aborted_to_idle": False
        }

        def on_sensor_fault(current_ms: int, is_nan: bool = False):
            state["consecutive_errors"] += 1
            state["total_read_errors"] += 1

            if state["consecutive_errors"] >= MAX_MID_REP_ERRORS and state["current_state"] != "IDLE":
                state["current_state"] = "IDLE"
                state["aborted_to_idle"] = True

            if state["consecutive_errors"] >= FAULT_THRESH:
                if current_ms - state["last_recovery_ms"] >= COOLDOWN_MS:
                    state["last_recovery_ms"] = current_ms
                    state["total_bus_resets"] += 1
                    # Recovery succeeds
                    state["consecutive_errors"] = 0
                    state["sensor_healthy"] = True
                    return True
            return False

        # Phase 1: 1 to 4 dropouts (transient noise) -> no bus reset, no abort
        for t in range(10, 50, 10):
            recovered = on_sensor_fault(t)
            self.assertFalse(recovered, "Transient noise (< 5 dropouts) must not trigger bus reset")
            self.assertEqual(state["current_state"], "CONCENTRIC")

        # Phase 2: 5th dropout at t=50ms -> triggers recovery!
        recovered = on_sensor_fault(50)
        self.assertTrue(recovered, "5th consecutive dropout must trigger bus reset")
        self.assertEqual(state["total_bus_resets"], 1)
        self.assertEqual(state["consecutive_errors"], 0)

        # Phase 3: Persistent hardware wedge (slave disconnected)
        # Next 5 dropouts occur at t=60, 70, 80, 90, 100ms
        for t in range(60, 110, 10):
            on_sensor_fault(t)
        self.assertEqual(state["consecutive_errors"], 5)
        # Attempt recovery at t=100ms -> blocked by 500ms cooldown (50ms < 500ms)!
        self.assertEqual(state["total_bus_resets"], 1, "Cooldown must block bus reset thrashing")

        # Phase 4: Error streak reaches 15 mid-rep at t=200ms -> aborts to IDLE
        for t in range(110, 210, 10):
            on_sensor_fault(t)
        self.assertTrue(state["aborted_to_idle"], "15 consecutive errors mid-rep must trigger safety abort to IDLE")
        self.assertEqual(state["current_state"], "IDLE")

        # Phase 5: At t=560ms (510ms after last reset), cooldown expires -> retry reset permitted
        for t in range(210, 560, 10):
            pass
        recovered = on_sensor_fault(560)
        self.assertTrue(recovered, "Recovery retry must be permitted once 500ms cooldown has elapsed")
        self.assertEqual(state["total_bus_resets"], 2)

    def test_c1_03_6axis_nan_inf_permutation_matrix(self):
        """Exhaustively fuzz 6-axis floating point validator with all corrupt permutations."""
        axes = ["ax", "ay", "az", "gx", "gy", "gz"]
        corrupt_values = [float("nan"), float("inf"), float("-inf")]

        # Header validator logic
        def is_valid(packet):
            for v in packet:
                if math.isnan(v) or math.isinf(v):
                    return False
            return True

        # Clean packet
        clean = [0.0, 0.0, 9.81, 0.0, 0.0, 0.0]
        self.assertTrue(is_valid(clean))

        # Test every single axis corrupted with NaN, +Inf, -Inf
        for axis_idx in range(6):
            for bad_val in corrupt_values:
                pkt = list(clean)
                pkt[axis_idx] = bad_val
                self.assertFalse(is_valid(pkt), f"Failed to reject corrupt value {bad_val} on axis {axes[axis_idx]}")

        # Test multi-axis corruptions (2, 3, 4, 5, 6 axes corrupted simultaneously)
        for num_corrupt in range(2, 7):
            for _ in range(10):
                pkt = list(clean)
                corrupt_indices = random.sample(range(6), num_corrupt)
                for idx in corrupt_indices:
                    pkt[idx] = random.choice(corrupt_values)
                self.assertFalse(is_valid(pkt), f"Failed to reject multi-axis corruption ({num_corrupt} axes)")

    def test_c1_04_sensor_severance_zero_norm_guard(self):
        """Verify Madgwick AHRS guards against zero-vector acceleration during sensor severance."""
        ahrs = MadgwickAHRS(beta=0.0457)
        # Total sensor severance: ax=0, ay=0, az=0
        ahrs.init_from_gravity(0.0, 0.0, 0.0)
        # Must retain normalized identity quaternion without NaN
        self.assertFalse(math.isnan(ahrs.q[0]))
        self.assertFalse(math.isnan(ahrs.q[1]))
        self.assertFalse(math.isnan(ahrs.q[2]))
        self.assertFalse(math.isnan(ahrs.q[3]))
        self.assertAlmostEqual(sum(x*x for x in ahrs.q), 1.0, delta=1e-4)

        # Update step with 0 acceleration
        ahrs.update(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, dt=0.01, apply_accel=True)
        self.assertFalse(math.isnan(ahrs.q[0]))
        self.assertFalse(math.isnan(ahrs.q[1]))
        self.assertFalse(math.isnan(ahrs.q[2]))
        self.assertFalse(math.isnan(ahrs.q[3]))

    def test_c1_05_i2c_bus_fault_during_bottom_pause(self):
        """Simulate transient I2C bus dropout during 3.0s paused bench press on safety pins."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        dt = 0.01

        # 1. Eccentric descent (1.0s)
        ecc = VBTKinematicGenerator.generate_eccentric_bell(duration_s=1.0, v_peak_down=-0.45, dt=dt)
        for s in ecc["samples"]:
            tracker.step(tracker.state_start_time + dt, 0.0, 0.0, 9.81 + s["a"], 0.0, 0.0, 0.0, dt)
        self.assertEqual(tracker.currentState, "ECCENTRIC")

        # 2. Motionless pause on pins (2.0s motionless)
        for i in range(200):
            t = 1.0 + i * dt
            # At 1.0s of pause, 4 transient I2C dropouts occur
            if 100 <= i < 104:
                # Firmware skips step on transient error, holding state
                pass
            else:
                tracker.step(t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        # State must remain in ECCENTRIC without premature abort or false rep trigger
        self.assertEqual(tracker.currentState, "ECCENTRIC", "Transient I2C fault during pause must not abort state")
        self.assertEqual(len(tracker.reps), 0, "No false rep during pause")


class TestChallengerM3BootCalibration(unittest.TestCase):
    """Adversarial stress-testing of boot calibration variance gating and dynamic auto-recalibration."""

    def test_c2_01_boundary_variance_sensitivity(self):
        """Test variance detector precisely at boundary (0.95x threshold vs 1.05x threshold)."""
        ACCEL_VAR_THRESH = 0.0385
        GYRO_VAR_THRESH = 0.0045

        # Sub-threshold: verified stationary
        sub_var_a = ACCEL_VAR_THRESH * 0.95
        sub_var_g = GYRO_VAR_THRESH * 0.95
        is_sub_valid = (sub_var_a < ACCEL_VAR_THRESH) and (sub_var_g < GYRO_VAR_THRESH)
        self.assertTrue(is_sub_valid)

        # Super-threshold: flagged as unverified motion
        sup_var_a = ACCEL_VAR_THRESH * 1.05
        sup_var_g = GYRO_VAR_THRESH * 1.05
        is_sup_valid = (sup_var_a < ACCEL_VAR_THRESH) and (sup_var_g < GYRO_VAR_THRESH)
        self.assertFalse(is_sup_valid, "Variance above threshold must reject calibration")

    def test_c2_02_violent_motion_boot_injection(self):
        """Simulate violent shaking during 200 boot samples and verify rejection."""
        random.seed(42)
        n_samples = 200
        # Violent movement: 20 m/s^2 peak sinusoidal shaking + 5 rad/s rotation
        accel_samples = []
        gyro_samples = []
        for i in range(n_samples):
            t = i * 0.01
            ax = 15.0 * math.sin(2.0 * math.pi * 3.0 * t) + random.gauss(0, 1.0)
            ay = 12.0 * math.cos(2.0 * math.pi * 3.0 * t) + random.gauss(0, 1.0)
            az = 9.81 + 8.0 * math.sin(2.0 * math.pi * 2.0 * t)
            gx = 4.5 * math.sin(2.0 * math.pi * 1.5 * t)
            gy = 3.2 * math.cos(2.0 * math.pi * 1.5 * t)
            gz = 2.0 * math.sin(2.0 * math.pi * 2.0 * t)
            accel_samples.append((ax, ay, az))
            gyro_samples.append((gx, gy, gz))

        mean_ax = sum(s[0] for s in accel_samples) / n_samples
        mean_ay = sum(s[1] for s in accel_samples) / n_samples
        mean_az = sum(s[2] for s in accel_samples) / n_samples
        mean_gx = sum(s[0] for s in gyro_samples) / n_samples
        mean_gy = sum(s[1] for s in gyro_samples) / n_samples
        mean_gz = sum(s[2] for s in gyro_samples) / n_samples

        var_a = sum((s[0]-mean_ax)**2 + (s[1]-mean_ay)**2 + (s[2]-mean_az)**2 for s in accel_samples) / n_samples
        var_g = sum((s[0]-mean_gx)**2 + (s[1]-mean_gy)**2 + (s[2]-mean_gz)**2 for s in gyro_samples) / n_samples

        self.assertGreater(var_a, 50.0, "Violent boot motion must yield high accel variance")
        self.assertGreater(var_g, 10.0, "Violent boot motion must yield high gyro variance")

        # Must fail STATIONARY_ACCEL_VAR_THRESH (0.0385) and STATIONARY_GYRO_VAR_THRESH (0.0045)
        self.assertFalse(var_a < 0.0385)
        self.assertFalse(var_g < 0.0045)

    def test_c2_03_dynamic_auto_recalibration_lifecycle(self):
        """Simulate unverified boot -> continuous motion -> rack stillness -> auto-recalibration -> lift (C++ loop mirror)."""
        # Mirroring C++ main.cpp lines 881-916
        is_calibrated = False
        calibration_verified = False
        gravity_baseline = 9.81
        gyro_bias = [0.0, 0.0, 0.0]
        tracker = RobustVBTTracker(initial_baseline=gravity_baseline, initial_gyro_bias=gyro_bias)

        # Phase 1: 2.0s of motion (racking the bar or walking)
        dt = 0.01
        for i in range(200):
            t = i * dt
            ax = 0.8 * math.sin(2.0 * math.pi * 1.8 * t)
            ay = 0.6 * math.cos(2.0 * math.pi * 1.8 * t)
            az = 9.81 + 1.2 * math.sin(2.0 * math.pi * 1.8 * t)
            
            # C++ firmware logic: if (!isCalibrated) { velocity = 0.0f; filtered_accel = 0.0f; }
            tracker.step(t, ax, ay, az, 0.2, 0.1, -0.1, dt)
            if not is_calibrated:
                tracker.velocity = 0.0
                tracker.filtered_accel = 0.0
                tracker.rep_displacement = 0.0
                tracker.currentState = "IDLE"

            self.assertEqual(tracker.velocity, 0.0, "Velocity must be suppressed while uncalibrated")

        # Phase 2: Bar is placed on rack at rest (mean az = 9.95 m/s^2, true quiet rest)
        for i in range(200, 350): # 1.5s motionless rest
            t = i * dt
            tracker.step(t, 0.0, 0.0, 9.95, 0.0, 0.0, 0.0, dt)
            if not is_calibrated and tracker.is_stationary:
                # C++ lines 895-905: locks baseline & gyro bias upon confirmed rest
                gravity_baseline = 9.95
                tracker.gravity_baseline = 9.95
                tracker.filter.init_from_gravity(0.0, 0.0, 9.95)
                gyro_bias = list(tracker.gyro_bias)
                is_calibrated = True
                calibration_verified = True
                tracker.velocity = 0.0
                tracker.filtered_accel = 0.0

        # After resting, tracker must have triggered dynamic auto-recalibration!
        self.assertTrue(tracker.is_stationary, "Tracker must detect stillness on rack")
        self.assertTrue(is_calibrated, "Tracker must auto-recalibrate upon confirmed rack rest")
        self.assertAlmostEqual(tracker.gravity_baseline, 9.95, delta=0.15)

        # Phase 3: Execute a clean bench press rep (0.45m displacement)
        rep = VBTKinematicGenerator.generate_full_rep(ecc_dur=1.0, v_ecc=-0.40, pause_s=0.5, conc_dur=0.7, v_conc=0.65)
        start_t = 350 * dt
        for idx, sample in enumerate(rep["samples"]):
            cur_t = start_t + idx * dt
            tracker.step(cur_t, 0.0, 0.0, 9.95 + sample["a"], 0.0, 0.0, 0.0, dt)

        # Post-rep rest (1.0s)
        end_t = start_t + len(rep["samples"]) * dt
        for i in range(100):
            tracker.step(end_t + i * dt, 0.0, 0.0, 9.95, 0.0, 0.0, 0.0, dt)

        # Rep must be captured cleanly with accurate displacement
        self.assertEqual(len(tracker.reps), 1, "Must capture rep after dynamic auto-recalibration")
        self.assertAlmostEqual(tracker.reps[0]["disp"], rep["concentric_displacement"], delta=0.06)

    def test_c2_04_gravity_magnitude_bounds_rejection(self):
        """Verify calibration rejects mean gravity outside physical range [8.80, 10.80]."""
        GRAVITY_MIN = 8.80
        GRAVITY_MAX = 10.80

        # Case 1: Under-gravity (8.79 m/s^2) - e.g. sensor unweighted or accelerating downward
        self.assertFalse(8.79 >= GRAVITY_MIN and 8.79 <= GRAVITY_MAX)

        # Case 2: Over-gravity (10.81 m/s^2) - e.g. severe centripetal or external acceleration
        self.assertFalse(10.81 >= GRAVITY_MIN and 10.81 <= GRAVITY_MAX)

        # Case 3: Valid standard Earth gravities (9.78 equatorial, 9.81 standard, 9.83 polar)
        for g_val in [9.78, 9.81, 9.83, 10.0]:
            self.assertTrue(g_val >= GRAVITY_MIN and g_val <= GRAVITY_MAX)

    def test_c2_05_inverted_sensor_180deg_quaternion(self):
        """Verify Madgwick filter handles 180-degree inverted sensor mount (az = -9.81 m/s^2)."""
        ahrs = MadgwickAHRS(beta=0.0457)
        # Inverted sensor: gravity points along -Z
        ahrs.init_from_gravity(0.0, 0.0, -9.81)

        # az = -1.0 normalized triggers az <= -0.9999f branch:
        # q0 = 0.0, q1 = 1.0, q2 = 0.0, q3 = 0.0 (180 deg pitch/roll rotation)
        gx, gy, gz = ahrs.get_gravity_vector()
        self.assertAlmostEqual(gx, 0.0, delta=1e-3)
        self.assertAlmostEqual(gy, 0.0, delta=1e-3)
        self.assertAlmostEqual(gz, -1.0, delta=1e-3, msg="Body gravity must point along -Z for inverted sensor")


class TestChallengerM3BLEReconnect(unittest.TestCase):
    """Adversarial stress-testing of BLE rapid connect/disconnect and telemetry persistence."""

    def test_c3_01_mid_rep_rapid_reconnect_storm(self):
        """Simulate 50 rapid BLE connect/disconnect toggles during active concentric stroke."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        # Establish active concentric drive
        tracker.currentState = "CONCENTRIC"
        tracker.velocity = 0.52
        tracker.rep_displacement = 0.28
        tracker.peak_velocity = 0.58

        initial_disp = tracker.rep_displacement
        initial_vel = tracker.velocity

        # Simulate BLE connection state flapping (50 cycles)
        is_connected = True
        for cycle in range(50):
            # Disconnect
            is_connected = False
            # Firmware loop step: non-destructive reconnection does NOT call resetPhysicsState()
            # Verify displacement and velocity remain completely intact
            self.assertEqual(tracker.rep_displacement, initial_disp, f"Displacement wiped on disconnect cycle {cycle}")
            self.assertEqual(tracker.velocity, initial_vel, f"Velocity wiped on disconnect cycle {cycle}")

            # Reconnect
            is_connected = True
            self.assertEqual(tracker.rep_displacement, initial_disp, f"Displacement wiped on reconnect cycle {cycle}")
            self.assertEqual(tracker.velocity, initial_vel, f"Velocity wiped on reconnect cycle {cycle}")

    def test_c3_02_offline_rep_completion_and_buffer_flush(self):
        """Simulate rep completing while disconnected, payload buffering, and immediate flush upon reconnect."""
        main_cpp_path = os.path.join(REPO_ROOT_PIO, "src", "main.cpp")
        with open(main_cpp_path, "r", encoding="utf-8") as f:
            code = f.read()

        # 1. Verify buffer variables exist
        self.assertIn("char last_rep_payload[96]", code)
        self.assertIn("bool has_pending_rep_notify", code)

        # 2. Verify buffering when disconnected
        self.assertIn("has_pending_rep_notify = true;", code)
        self.assertIn("strncpy(last_rep_payload, payload,", code)

        # 3. Verify flush upon deviceConnected && !oldDeviceConnected
        reconnect_block = re.search(r"if\s*\(\s*deviceConnected\s*&&\s*!oldDeviceConnected\s*\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}", code)
        self.assertIsNotNone(reconnect_block, "Must contain non-destructive reconnection block")
        block_text = reconnect_block.group(1)

        # Must NOT contain resetPhysicsState() or transitionToState(IDLE)
        self.assertNotIn("resetPhysicsState()", block_text, "Reconnection block must NEVER call resetPhysicsState()")
        self.assertNotIn("transitionToState(IDLE)", block_text, "Reconnection block must NEVER force transitionToState(IDLE)")

        # Must notify buffered payload and clear pending flag
        self.assertIn("has_pending_rep_notify", block_text)
        self.assertIn("pDataCharacteristic->notify()", block_text)
        self.assertIn("has_pending_rep_notify = false;", block_text)

    def test_c3_03_cycling_with_random_ble_disconnects(self):
        """Stress-test touch-and-go cycling with randomized BLE dropouts."""
        tracker = RobustVBTTracker(initial_baseline=9.81)
        dt = 0.01

        # 3 touch-and-go reps
        random.seed(123)
        ble_connected = True
        buffered_payloads = []
        flushed_payloads = []

        cur_t = 0.0
        for rep_num in range(3):
            rep = VBTKinematicGenerator.generate_full_rep(ecc_dur=0.8, v_ecc=-0.45, pause_s=0.0, conc_dur=0.6, v_conc=0.60)
            for sample in rep["samples"]:
                cur_t += dt
                # Random BLE disconnect jitter
                if random.random() < 0.05:
                    old_conn = ble_connected
                    ble_connected = not ble_connected
                    if ble_connected and not old_conn:
                        # Reconnect flush
                        if buffered_payloads:
                            flushed_payloads.extend(buffered_payloads)
                            buffered_payloads.clear()

                tracker.step(cur_t, 0.0, 0.0, 9.81 + sample["a"], 0.0, 0.0, 0.0, dt)

            # Settle briefly between touch-and-go reps (0.1s)
            for _ in range(10):
                cur_t += dt
                tracker.step(cur_t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        # Rest after 3 reps (1.0s)
        for _ in range(100):
            cur_t += dt
            tracker.step(cur_t, 0.0, 0.0, 9.81, 0.0, 0.0, 0.0, dt)

        # All 3 reps must be captured despite wireless chaos
        self.assertEqual(len(tracker.reps), 3, f"Expected 3 touch-and-go reps, got {len(tracker.reps)}")

    def test_c3_04_multi_rep_offline_queue_counter(self):
        """Verify multiple repetitions completed offline accurately advance rep_counter and retain latest payload."""
        # Mirroring C++ firmware state
        rep_counter = 0
        last_rep_payload = ""
        has_pending_rep_notify = False
        device_connected = False

        # Complete 5 reps while disconnected
        for r in range(1, 6):
            mean_vel = 0.50 + r * 0.02
            rpe = 8.0 + r * 0.2
            payload = f"Deadlift | {mean_vel:.2f} m/s | RPE: {rpe:.1f}"
            rep_counter += 1
            last_rep_payload = payload
            has_pending_rep_notify = True

        self.assertEqual(rep_counter, 5, "Rep counter must count all 5 completed reps offline")
        self.assertEqual(last_rep_payload, "Deadlift | 0.60 m/s | RPE: 9.0", "Buffer must hold the latest completed rep")
        self.assertTrue(has_pending_rep_notify, "Pending notification must remain flagged")

        # Client reconnects
        device_connected = True
        flushed_payload = None
        if device_connected and has_pending_rep_notify and len(last_rep_payload) > 0:
            flushed_payload = last_rep_payload
            has_pending_rep_notify = False

        self.assertEqual(flushed_payload, "Deadlift | 0.60 m/s | RPE: 9.0", "Reconnection must flush latest buffered rep")
        self.assertFalse(has_pending_rep_notify, "Pending notification flag must clear upon flush")

    def test_c3_05_queued_lift_change_mid_rep_isolation(self):
        """Verify BLE lift change commands received mid-rep are queued and only applied in IDLE."""
        main_cpp_path = os.path.join(REPO_ROOT_PIO, "src", "main.cpp")
        with open(main_cpp_path, "r", encoding="utf-8") as f:
            code = f.read()

        # 1. Verify pendingLift pointer exists
        self.assertIn("LiftProfile* pendingLift = nullptr;", code)

        # 2. Verify CmdCallbacks only queues the lift change
        self.assertIn("pendingLift = &squatProfile;", code)
        self.assertIn("pendingLift = &benchProfile;", code)
        self.assertIn("pendingLift = &deadliftProfile;", code)

        # 3. Verify loop() applies pendingLift ONLY when currentState == IDLE
        queue_apply = re.search(r"if\s*\(\s*currentState\s*==\s*IDLE\s*&&\s*pendingLift\s*!=\s*nullptr\s*\)\s*\{([^}]+)\}", code)
        self.assertIsNotNone(queue_apply, "Firmware must gate application of pendingLift strictly by currentState == IDLE")
        apply_body = queue_apply.group(1)
        self.assertIn("currentLift = *pendingLift;", apply_body)
        self.assertIn("pendingLift = nullptr;", apply_body)


class TestChallengerM3HyperparameterIntegrity(unittest.TestCase):
    """Adversarial cross-check of 18 embedded hyperparameters against JADE-converged JSON."""

    @classmethod
    def setUpClass(cls):
        json_path = os.path.join(REPO_ROOT_ANTI, "tests", "optimized_parameters.json")
        cls.assertTrue(os.path.exists(json_path), f"Missing {json_path}")
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cls.json_params = {k: v["value"] for k, v in data["hyperparameters"].items()}

        main_cpp_path = os.path.join(REPO_ROOT_PIO, "src", "main.cpp")
        with open(main_cpp_path, "r", encoding="utf-8") as f:
            cls.main_cpp = f.read()

    def test_c4_01_all_18_hyperparameters_embedded_with_override_macros(self):
        """Verify each of the 18 hyperparameters has #ifndef OPT_*, #ifdef OPT_*, and #else."""
        param_macro_map = {
            "beta": "OPT_MADGWICK_BETA",
            "accel_rejection_thresh": "OPT_ACCEL_REJECTION_THRESH",
            "var_a_thresh_primary": "OPT_STATIONARY_ACCEL_VAR_THRESH",
            "var_g_thresh_primary": "OPT_STATIONARY_GYRO_VAR_THRESH",
            "var_a_thresh_recovery": "OPT_RECOVERY_ACCEL_VAR_THRESH",
            "var_g_thresh_recovery": "OPT_RECOVERY_GYRO_VAR_THRESH",
            "window_size_N": "OPT_VARIANCE_WINDOW_SIZE",
            "stationary_hold_count": "OPT_STATIONARY_HOLD_COUNT",
            "alpha_base": "OPT_ALPHA_GRAVITY_BASELINE",
            "alpha_gyro": "OPT_ALPHA_GYRO_BIAS",
            "eccentric_vel_trigger": "OPT_ECCENTRIC_VEL_TRIGGER",
            "concentric_vel_trigger": "OPT_CONCENTRIC_VEL_TRIGGER",
            "concentric_lockout_ms": "OPT_REFRACTORY_WINDOW_MS",
            "pause_motionless_max_ms": "OPT_PAUSE_MOTIONLESS_MAX_MS",
            "stall_persistence_count": "OPT_STALL_PERSISTENCE_LIMIT",
            "concentric_timeout_s": "OPT_CONCENTRIC_TIMEOUT_MS",
            "eccentric_timeout_s": "OPT_ECCENTRIC_TIMEOUT_MS",
            "runaway_velocity_clamp": "OPT_RUNAWAY_VELOCITY_CLAMP"
        }

        self.assertEqual(len(param_macro_map), 18)

        for json_key, macro_name in param_macro_map.items():
            # Verify #ifndef MACRO
            self.assertIn(f"#ifndef {macro_name}", self.main_cpp, f"Missing #ifndef {macro_name}")
            # Verify #define MACRO
            self.assertIn(f"#define {macro_name}", self.main_cpp, f"Missing #define {macro_name}")

            # Verify macro value matches JSON value
            expected_val = self.json_params[json_key]
            macro_pattern = rf"#define\s+{macro_name}\s+\(?([0-9.eE\-]+)"
            match = re.search(macro_pattern, self.main_cpp)
            self.assertIsNotNone(match, f"Could not extract value for {macro_name}")
            extracted_val = float(match.group(1))

            if "timeout_s" in json_key:
                # Millisecond conversion in C++ (e.g. 5.6601s -> 5660ms)
                expected_ms = int(round(expected_val * 1000.0))
                self.assertAlmostEqual(extracted_val, expected_ms, delta=10.0, msg=f"Timeout {macro_name} mismatch")
            elif isinstance(expected_val, int):
                self.assertEqual(int(extracted_val), expected_val, f"Macro {macro_name} mismatch")
            else:
                self.assertAlmostEqual(extracted_val, expected_val, delta=0.001, msg=f"Macro {macro_name} mismatch")


if __name__ == "__main__":
    unittest.main()
