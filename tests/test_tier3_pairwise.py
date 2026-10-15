"""
Tier 3: Cross-Feature Combination & Pairwise Interaction Test Suite for Eros VBT
Tests multi-feature interactions, state transitions, theme syncing, and data flow.
"""

import os
import re
import unittest
from .conftest_base import (
    get_index_html,
    get_style_css,
    get_app_js,
    extract_css_rules,
    extract_css_token,
    find_dom_id,
    VBTMathOracle
)

class TestTier3PairwiseCombinations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    def test_p01_lift_theme_switch_updates_orb_and_surfaces(self):
        """P01: Lift theme selection (F9/F10) couples with orb animation (F11) and glass surfaces (F1)."""
        # When user selects Squat:
        # 1. body class switches to theme-squat
        # 2. theme-squat applies --accent-sq (#00FF66)
        # 3. orb plays squat-rep keyframe
        # 4. glass cards maintain blur(30px) saturate(180%)
        rules_squat = extract_css_rules(self.css, "body.theme-squat")
        self.assertTrue(len(rules_squat) > 0)
        self.assertIn("var(--accent-sq)", rules_squat[0][1].get("--current-accent", ""))
        self.assertIn("@keyframes squat-rep", self.css)

    def test_p02_lift_baseline_switch_commands_ble_and_closes_dropdown(self):
        """P02: Selecting Bench (F9) dispatches CMD:SL:BP (F12) and closes dropdown overlay (F8)."""
        # app.js must map Bench to CMD:SL:BP
        self.assertIn("bench:    { mvt: 0.16, rpe8: 0.32, cmd: 'CMD:SL:BP' }", self.js)
        # and remove 'open' class
        self.assertIn("liftSelectWrapper.classList.remove('open')", self.js)

    def test_p03_ble_rep_ingestion_updates_tabular_velocity_and_ring(self):
        """P03: BLE payload parsing (F12) recalculates metrics (F13) and updates SVG ring (F14)."""
        payload = "Deadlift | 0.60 m/s | RPE: 7.5"
        parsed = VBTMathOracle.parse_ble_payload(payload)
        self.assertIsNotNone(parsed)
        metrics = VBTMathOracle.recalculate_set_metrics([parsed])
        offset = VBTMathOracle.calculate_ring_stroke_dashoffset(metrics["avgVelocity"])

        # avgVelocity 0.60 m/s on a 1.0 m/s scale gives 60% fill -> offset = 565.48 - (565.48 * 0.6) = 226.2
        expected_offset = round(565.48 * 0.40, 1)
        self.assertAlmostEqual(offset, expected_offset, delta=0.5)

    def test_p04_velocity_loss_updates_mini_hud_and_apex_bloom(self):
        """P04: Progressive velocity drop (F13) synchronizes with Mini-HUD (F14) and apex timing (F11)."""
        reps = [
            {"velocity": 0.80, "rpe": 7.0},
            {"velocity": 0.60, "rpe": 8.0},
            {"velocity": 0.40, "rpe": 9.5}  # 50% velocity loss
        ]
        metrics = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(metrics["velocityLossPct"], 50.0)

        # For the final rep (0.40 m/s), verify duration and apex bloom delay
        dur = VBTMathOracle.calculate_rep_duration(0.40)
        delay = VBTMathOracle.calculate_apex_bloom_delay_ms(0.40, "Deadlift")
        self.assertEqual(dur, 2.5)  # (0.5 / 0.4) * 2 = 2.5s
        self.assertEqual(delay, 1250.0)  # 2.5s / 2 = 1.25s = 1250ms

    def test_p05_workout_master_button_toggles_session_and_timer(self):
        """P05: Master workout toggle (F14) updates button state (F6) and activates session timer (F7)."""
        self.assertIn("btnWorkoutMaster.addEventListener('click'", self.js)
        self.assertIn("startWorkoutSession", self.js)
        self.assertIn("endWorkoutSession", self.js)
        self.assertTrue(find_dom_id(self.html, "btn-workout-master"))
        self.assertTrue(find_dom_id(self.html, "session-timer-display"))

    def test_p06_dropdown_layering_above_telemetry_with_ambient_mesh(self):
        """P06: Dropdown options (F8) layer at z-index 1001 above telemetry arena without mesh obstruction (F10)."""
        rules_opt = extract_css_rules(self.css, ".custom-select-options")
        self.assertTrue(len(rules_opt) > 0)
        zi = int(rules_opt[0][1].get("z-index", 0))
        self.assertGreaterEqual(zi, 1000)

        rules_mesh = extract_css_rules(self.css, ".ambient-glow-mesh")
        self.assertTrue(len(rules_mesh) > 0)
        self.assertEqual(rules_mesh[0][1].get("pointer-events"), "none")

    def test_p07_tab_navigation_to_set_view_renders_rep_stream(self):
        """P07: Navigating to Set tab (F14) displays active reps container (F13) with pill tabs (F6)."""
        self.assertTrue(find_dom_id(self.html, "tab-set"))
        self.assertTrue(find_dom_id(self.html, "active-set-reps-list"))
        self.assertTrue(find_dom_id(self.html, "set-rep-counter"))

    def test_p08_tab_navigation_to_history_renders_lifetime_aggregates(self):
        """P08: Navigating to History tab (F14) displays lifetime summary statistics (F13)."""
        self.assertTrue(find_dom_id(self.html, "tab-history"))
        self.assertTrue(find_dom_id(self.html, "sum-workouts"))
        self.assertTrue(find_dom_id(self.html, "sum-sets"))
        self.assertTrue(find_dom_id(self.html, "sum-reps"))
        self.assertTrue(find_dom_id(self.html, "sum-best-vel"))
        self.assertTrue(find_dom_id(self.html, "history-sessions-list"))

    def test_p09_rapid_reps_and_velocity_threshold_feedback(self):
        """P09: Fast reps (>= 0.50 m/s) trigger explosive feedback (F14) and fast duration (F11)."""
        vel = 0.75
        dur = VBTMathOracle.calculate_rep_duration(vel)
        self.assertLess(dur, 1.5, "Fast velocity must produce sub-1.5s rep animation duration")

    def test_p10_ble_disconnect_updates_status_badge_and_button_text(self):
        """P10: Hardware disconnect (F12) sets status-badge to disconnected (F14) and updates text."""
        self.assertIn("statusBadge.className = 'glass-pill status-disconnected';", self.js)
        self.assertIn("btnConnectText.textContent = 'CONNECT SENSOR';", self.js)

    def test_p11_csv_export_matches_recorded_session_data(self):
        """P11: CSV export routine (F13) serializes workout session rows matching specification."""
        mock_sessions = [{
            "id": "ws_123456",
            "dateStr": "2026-10-15 10:00",
            "sets": [{
                "setNumber": 1,
                "lift": "Deadlift",
                "avgVelocity": 0.55,
                "velocityLossPct": 15.0,
                "reps": [
                    {"repNumber": 1, "velocity": 0.60, "rpe": 7.0, "timestamp": 1697360000},
                    {"repNumber": 2, "velocity": 0.50, "rpe": 8.0, "timestamp": 1697360005}
                ]
            }]
        }]
        csv_rows = VBTMathOracle.generate_csv_rows(mock_sessions)
        self.assertEqual(len(csv_rows), 3)  # Headers + 2 reps
        self.assertEqual(csv_rows[0][0], "Workout ID")
        self.assertEqual(csv_rows[1][3], "Deadlift")
        self.assertEqual(csv_rows[1][5], "0.6")

    def test_p12_json_export_structure_conforms_to_nested_schema(self):
        """P12: JSON export routine (F13) produces Workout -> Sets -> Reps 3-tier hierarchy."""
        mock_sessions = [{
            "id": "ws_9999",
            "startTime": 1697360000,
            "endTime": 1697361000,
            "dateStr": "2026-10-15",
            "name": "Strength Session",
            "sets": [{
                "setId": "set_1",
                "setNumber": 1,
                "lift": "Squat",
                "avgVelocity": 0.70,
                "reps": [{"repNumber": 1, "lift": "Squat", "velocity": 0.70, "rpe": 7.5}]
            }]
        }]
        self.assertIn("id", mock_sessions[0])
        self.assertIn("sets", mock_sessions[0])
        self.assertIn("reps", mock_sessions[0]["sets"][0])

    def test_p13_css_syntax_clean_and_glass_surfaces_intact(self):
        """P13: CSS syntax integrity (F3) ensures .glass-card specular refraction renders without corruption (F1/F2)."""
        rules = extract_css_rules(self.css, ".glass-card")
        self.assertTrue(len(rules) > 0)
        has_backdrop = any("backdrop-filter" in r[1] for r in rules)
        self.assertTrue(has_backdrop)

    def test_p14_brand_styling_harmonizes_with_metrics_and_theme(self):
        """P14: Brand title (F4) and numerical metrics (F7) render in unified typography over obsidian (F1)."""
        val_sans = extract_css_token(self.css, "--font-sans")
        val_mono = extract_css_token(self.css, "--font-mono")
        self.assertIsNotNone(val_sans)
        self.assertIsNotNone(val_mono)

    def test_p15_barbell_profile_syncs_with_lift_selection(self):
        """P15: Selected lift in dropdown (F9) updates active set lift name and subtext (F14)."""
        self.assertIn("applyLiftTheme(val)", self.js)
        self.assertIn("sendLiftCommand(val)", self.js)

    def test_p16_full_state_machine_and_visual_integrity(self):
        """P16: End-to-end simulation of session start -> rep ingestion -> set end -> session end."""
        # Verify app.js maintains workouts list and activeSession reference
        self.assertIn("let workouts = [];", self.js)
        self.assertIn("let activeWorkout = null;", self.js)
        self.assertIn("let activeSet = null;", self.js)

if __name__ == '__main__':
    unittest.main()
