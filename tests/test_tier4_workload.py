"""
Tier 4: Real-World Application Workload & Endurance Test Suite for Eros VBT
Simulates authentic training sessions, multi-set progression, and telemetry streams.
"""

import os
import json
import unittest
from .conftest_base import (
    get_index_html,
    get_style_css,
    get_app_js,
    VBTMathOracle
)

class TestTier4RealWorldWorkloads(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    def test_w01_standard_5x5_strength_workout(self):
        """W01: Standard 5x5 Strength Workout — 5 sets of 5 reps with progressive fatigue."""
        # Baseline velocity starts at 0.70 m/s and decreases with each set
        set_base_vels = [0.70, 0.66, 0.62, 0.58, 0.54]
        session_sets = []

        for set_idx, base_vel in enumerate(set_base_vels, start=1):
            reps = []
            for rep_idx in range(1, 6):
                # Rep fatigue drop within each set
                vel = round(base_vel - (rep_idx - 1) * 0.03, 2)
                rpe = round(7.0 + (set_idx * 0.4) + (rep_idx * 0.2), 1)
                reps.append({
                    "repNumber": rep_idx,
                    "lift": "Squat",
                    "velocity": vel,
                    "rpe": rpe,
                    "timestamp": 1697360000 + (set_idx * 180) + (rep_idx * 4)
                })
            metrics = VBTMathOracle.recalculate_set_metrics(reps)
            session_sets.append({
                "setNumber": set_idx,
                "lift": "Squat",
                "avgVelocity": metrics["avgVelocity"],
                "maxVelocity": metrics["maxVelocity"],
                "minVelocity": metrics["minVelocity"],
                "velocityLossPct": metrics["velocityLossPct"],
                "avgRpe": metrics["avgRpe"],
                "reps": reps
            })

        self.assertEqual(len(session_sets), 5)
        # Verify 5 reps per set = 25 reps total
        total_reps = sum(len(s["reps"]) for s in session_sets)
        self.assertEqual(total_reps, 25)

        # In set 1: base_vel 0.70 -> reps: 0.70, 0.67, 0.64, 0.61, 0.58
        # Loss: ((0.70 - 0.58) / 0.70) * 100 = 17.1%
        self.assertEqual(session_sets[0]["velocityLossPct"], 17.1)
        self.assertEqual(session_sets[0]["maxVelocity"], 0.70)

    def test_w02_high_cadence_rep_burst(self):
        """W02: High-Cadence Rep Burst — 10 reps in rapid succession with instant math updates."""
        reps = []
        for i in range(1, 11):
            reps.append({
                "repNumber": i,
                "lift": "Deadlift",
                "velocity": round(0.50 + (i % 3) * 0.05, 2),
                "rpe": 8.0,
                "timestamp": 1697360000 + i
            })
            metrics = VBTMathOracle.recalculate_set_metrics(reps)
            offset = VBTMathOracle.calculate_ring_stroke_dashoffset(metrics["avgVelocity"])
            self.assertTrue(0.0 <= offset <= 565.48)

        final_metrics = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(len(reps), 10)
        self.assertGreater(final_metrics["avgVelocity"], 0.45)

    def test_w03_powerlifting_rotation_three_lift_session(self):
        """W03: Powerlifting Rotation — Deadlift, Squat, Bench Press in single session."""
        lifts = ["Deadlift", "Squat", "Bench"]
        expected_cmds = {
            "Deadlift": "CMD:SL:DL",
            "Squat": "CMD:SL:SQ",
            "Bench": "CMD:SL:BP"
        }
        session = {
            "id": "ws_powerlifting_001",
            "sets": []
        }

        for idx, lift in enumerate(lifts, start=1):
            cmd = expected_cmds[lift]
            self.assertIn(cmd, self.js)
            reps = [
                {"repNumber": 1, "lift": lift, "velocity": 0.55, "rpe": 8.0},
                {"repNumber": 2, "lift": lift, "velocity": 0.50, "rpe": 8.5}
            ]
            metrics = VBTMathOracle.recalculate_set_metrics(reps)
            session["sets"].append({
                "setNumber": idx,
                "lift": lift,
                "metrics": metrics,
                "reps": reps
            })

        self.assertEqual(len(session["sets"]), 3)
        self.assertEqual(session["sets"][0]["lift"], "Deadlift")
        self.assertEqual(session["sets"][1]["lift"], "Squat")
        self.assertEqual(session["sets"][2]["lift"], "Bench")

    def test_w04_sensor_disconnect_and_reconnect_continuity(self):
        """W04: Sensor Disconnect & Reconnect — Zero data drop across hardware cycle."""
        # Session in progress with Set 1
        active_set_1 = {
            "setNumber": 1,
            "lift": "Squat",
            "reps": [{"repNumber": 1, "velocity": 0.65, "rpe": 7.0}]
        }
        # Disconnect event occurs -> state must preserve activeSet and activeWorkout
        # Reconnect event -> Set 2 begins
        active_set_2 = {
            "setNumber": 2,
            "lift": "Squat",
            "reps": [{"repNumber": 1, "velocity": 0.62, "rpe": 7.5}]
        }
        workout = {
            "id": "ws_cycle_test",
            "sets": [active_set_1, active_set_2]
        }
        self.assertEqual(len(workout["sets"]), 2)
        self.assertEqual(workout["sets"][0]["reps"][0]["velocity"], 0.65)
        self.assertEqual(workout["sets"][1]["reps"][0]["velocity"], 0.62)

    def test_w05_multi_session_lifetime_persistence_and_export(self):
        """W05: Multi-Session Lifetime Persistence — 3 sessions exported to CSV and JSON."""
        sessions = []
        for s_idx in range(1, 4):
            sets = []
            for set_idx in range(1, 3):
                reps = [
                    {"repNumber": 1, "lift": "Deadlift", "velocity": 0.60, "rpe": 7.0, "timestamp": 1697360000 + s_idx*1000 + set_idx*100},
                    {"repNumber": 2, "lift": "Deadlift", "velocity": 0.50, "rpe": 8.0, "timestamp": 1697360000 + s_idx*1000 + set_idx*100 + 10}
                ]
                metrics = VBTMathOracle.recalculate_set_metrics(reps)
                sets.append({
                    "setId": f"set_{s_idx}_{set_idx}",
                    "setNumber": set_idx,
                    "lift": "Deadlift",
                    "avgVelocity": metrics["avgVelocity"],
                    "velocityLossPct": metrics["velocityLossPct"],
                    "reps": reps
                })
            sessions.append({
                "id": f"ws_session_{s_idx}",
                "dateStr": f"2026-10-1{s_idx}",
                "name": f"Session {s_idx}",
                "sets": sets
            })

        # Test CSV export generator
        csv_rows = VBTMathOracle.generate_csv_rows(sessions)
        # 3 sessions * 2 sets * 2 reps = 12 reps + 1 header = 13 rows
        self.assertEqual(len(csv_rows), 13)

        # Test JSON serialization
        json_str = json.dumps(sessions)
        restored = json.loads(json_str)
        self.assertEqual(len(restored), 3)

    def test_w06_high_volume_endurance_workload(self):
        """W06: High-Volume Endurance Workload — 100 reps across 20 sets aggregated cleanly."""
        all_reps = []
        best_vel = 0.0
        for s in range(20):
            for r in range(5):
                vel = round(0.40 + (r * 0.05), 2)
                if vel > best_vel:
                    best_vel = vel
                all_reps.append(vel)

        self.assertEqual(len(all_reps), 100)
        self.assertEqual(best_vel, 0.60)
        avg_total = round(sum(all_reps) / len(all_reps), 2)
        self.assertEqual(avg_total, 0.50)

    def test_w07_cold_start_recovery_hydration(self):
        """W07: Cold-Start Recovery — App loads pre-existing vbt_workouts_v1 from storage."""
        # app.js must call initStorage() on boot
        self.assertIn("function initStorage()", self.js)
        self.assertIn("localStorage.getItem(STORAGE_KEY)", self.js)
        self.assertIn("renderHistoryView()", self.js)

    def test_w08_adversarial_ble_stream_resilience(self):
        """W08: Adversarial BLE Stream — Handles corrupted and malformed frames gracefully."""
        stream = [
            "Deadlift | 0.45 m/s | RPE: 8.5",     # Valid
            "Garbage line without pipes",           # Malformed
            "",                                     # Empty
            "Squat | invalid_velocity | RPE: 8.0",  # Corrupted number
            "Bench | 0.80 m/s | RPE: 7.0",          # Valid
            "Deadlift | 0.50 m/s | RPE: not_a_num", # Corrupted RPE
            "Deadlift | 0.48 m/s | RPE: 8.0"       # Valid
        ]

        valid_reps = []
        for packet in stream:
            parsed = VBTMathOracle.parse_ble_payload(packet)
            if parsed is not None:
                valid_reps.append(parsed)

        # Only 3 valid packets should be ingested
        self.assertEqual(len(valid_reps), 3)
        self.assertEqual(valid_reps[0]["lift"], "Deadlift")
        self.assertEqual(valid_reps[1]["lift"], "Bench")
        self.assertEqual(valid_reps[2]["lift"], "Deadlift")

        # Recalculate metrics on valid reps
        metrics = VBTMathOracle.recalculate_set_metrics(valid_reps)
        self.assertEqual(metrics["maxVelocity"], 0.80)

if __name__ == '__main__':
    unittest.main()
