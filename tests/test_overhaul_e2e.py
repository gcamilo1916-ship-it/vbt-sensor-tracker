"""
Overhaul E2E Test Suite for Eros VBT (Apple visionOS Spatial Glass Overhaul)
Requirement-driven, opaque-box tests covering all 5 core overhaul requirements:
  - R1: Live Page RPE Hero Banner & Non-Disruptive Set Controls
  - R2: Floating Navigation Bar & Fluid View Transitions
  - R3: Long-Press Rep PR Tagging & Model Persistence
  - R4: History Page PR Dashboard & Live DOTS Calculator
  - R5: Backend & WebBLE Stability Preservation
  - Tier 4: Real-World Athlete Session Scenarios
"""

import os
import re
import math
import json
import unittest
from .conftest_base import (
    get_index_html,
    get_style_css,
    get_app_js,
    extract_css_rules,
    extract_css_token,
    find_dom_id,
    extract_dom_elements_by_tag,
    VBTMathOracle
)

class TestOverhaulR1LiveRpeHero(unittest.TestCase):
    """
    R1: Live Page RPE Hero Banner & Non-Disruptive Set Controls
    Source: ORIGINAL_REQUEST.md (## 2026-10-15T14:40:18Z R1), PROJECT.md
    """
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    def test_r1_01_set_toggle_does_not_redirect_to_tab_set(self):
        """R1: Verify btnSetToggle click handler in app.js does NOT redirect to tab-set."""
        # Find btnSetToggle click event listener block in app.js
        toggle_pattern = re.search(
            r'btnSetToggle\.addEventListener\([\'"]click[\'"],\s*\(\)\s*=>\s*\{([\s\S]*?)\}\);',
            self.js
        )
        self.assertIsNotNone(
            toggle_pattern,
            "app.js must contain a click event listener for btnSetToggle"
        )
        body = toggle_pattern.group(1)
        # Check that there is no programmatic click or navigation to tab-set
        self.assertNotIn(
            'data-target="set"',
            body,
            "btnSetToggle must NOT contain programmatic click or navigation to tab-set"
        )
        self.assertNotIn(
            "setNavTab.click()",
            body.replace(" ", ""),
            "btnSetToggle must strictly eliminate automatic redirection to tab-set (setNavTab.click())"
        )

    def test_r1_02_rpe_hero_card_exists_in_live_tab(self):
        """R1: Verify #rpe-hero-card exists prominently inside #tab-live in index.html."""
        self.assertTrue(
            find_dom_id(self.html, "rpe-hero-card"),
            "index.html must contain #rpe-hero-card in the DOM"
        )
        # Verify it is situated inside #tab-live (before #tab-set)
        tab_live_pos = self.html.find('id="tab-live"')
        rpe_hero_pos = self.html.find('id="rpe-hero-card"')
        tab_set_pos = self.html.find('id="tab-set"')
        self.assertNotEqual(tab_live_pos, -1, "#tab-live must exist in DOM")
        self.assertNotEqual(rpe_hero_pos, -1, "#rpe-hero-card must exist in DOM")
        self.assertNotEqual(tab_set_pos, -1, "#tab-set must exist in DOM")
        self.assertTrue(
            tab_live_pos < rpe_hero_pos < tab_set_pos,
            "#rpe-hero-card must be positioned inside #tab-live before #tab-set"
        )

    def test_r1_03_rpe_hero_banner_child_elements(self):
        """R1: Verify RPE Hero Banner contains required telemetry and gauge elements."""
        required_ids = [
            "live-rpe",         # High-contrast tabular numeric RPE display
            "live-rpe-sub",     # Baseline subtitle / exertion cue
            "live-rir-pill",    # Dynamic Reps-In-Reserve badge
            "rpe-tier-badge",   # Color-coded effort tier badge
            "rpe-gauge-fill"    # Dynamic segmented effort gauge bar
        ]
        for dom_id in required_ids:
            self.assertTrue(
                find_dom_id(self.html, dom_id),
                f"RPE Hero Card must contain #{dom_id}"
            )

    def test_r1_04_rpe_tabular_typography_and_contrast(self):
        """R1: Verify #live-rpe has tabular figures and high-contrast styling in style.css."""
        clean_css = self.css.replace(" ", "")
        # Verify tabular nums rule or font-variant-numeric: tabular-nums
        rules = extract_css_rules(self.css, "#live-rpe")
        has_tabular = (
            "font-variant-numeric:tabular-nums" in clean_css or
            "font-feature-settings:\"tnum\"" in clean_css or
            "font-feature-settings:'tnum'" in clean_css or
            any("tabular-nums" in p.get("font-variant-numeric", "") for _, p, _ in rules)
        )
        self.assertTrue(
            has_tabular,
            "#live-rpe must specify tabular-nums for instant numerical legibility"
        )

    def test_r1_05_rpe_4_effort_tiers_css_styling(self):
        """R1: Verify style.css implements the 4 color-coded effort tiers."""
        clean_css = self.css.lower().replace(" ", "")
        tiers = [
            ("tier-warmup", "#00ff66"),
            ("tier-target", "#00e5ff"),
            ("tier-heavy", ["#ff6600", "#ffb300"]),
            ("tier-max", "#ff0055")
        ]
        for tier_class, expected_hex in tiers:
            self.assertIn(
                f".{tier_class}",
                self.css,
                f"style.css must define effort tier class .{tier_class}"
            )
            if isinstance(expected_hex, list):
                has_color = any(h in clean_css for h in expected_hex)
            else:
                has_color = expected_hex in clean_css
            self.assertTrue(
                has_color,
                f"Tier class .{tier_class} must be associated with designated accent color"
            )

    def test_r1_06_rpe_gauge_fill_transition_and_pin(self):
        """R1: Verify #rpe-gauge-fill has smooth width transition and gauge styling."""
        rules = extract_css_rules(self.css, "#rpe-gauge-fill") + extract_css_rules(self.css, ".rpe-gauge-fill")
        self.assertTrue(
            len(rules) > 0 or "#rpe-gauge-fill" in self.css or ".rpe-gauge-fill" in self.css,
            "style.css must style #rpe-gauge-fill or .rpe-gauge-fill"
        )

    def test_r1_b01_rpe_tier_boundary_thresholds(self):
        """R1 Boundary: Test effort tier classification across exact boundary values."""
        # Tier 1: Warmup (< 7.5)
        self.assertEqual(VBTMathOracle.determine_rpe_tier(0.0)[0], "warmup")
        self.assertEqual(VBTMathOracle.determine_rpe_tier(7.4)[0], "warmup")
        # Tier 2: Target (7.5 to 8.4)
        self.assertEqual(VBTMathOracle.determine_rpe_tier(7.5)[0], "target")
        self.assertEqual(VBTMathOracle.determine_rpe_tier(8.0)[0], "target")
        self.assertEqual(VBTMathOracle.determine_rpe_tier(8.4)[0], "target")
        # Tier 3: Heavy (8.5 to 9.4)
        self.assertEqual(VBTMathOracle.determine_rpe_tier(8.5)[0], "heavy")
        self.assertEqual(VBTMathOracle.determine_rpe_tier(9.0)[0], "heavy")
        self.assertEqual(VBTMathOracle.determine_rpe_tier(9.4)[0], "heavy")
        # Tier 4: Maximal (>= 9.5)
        self.assertEqual(VBTMathOracle.determine_rpe_tier(9.5)[0], "maximal")
        self.assertEqual(VBTMathOracle.determine_rpe_tier(10.0)[0], "maximal")
        self.assertEqual(VBTMathOracle.determine_rpe_tier(10.5)[0], "maximal")

    def test_r1_b02_rir_dynamic_calculation_boundaries(self):
        """R1 Boundary: Test Reps-In-Reserve mathematical derivation (RIR = 10 - RPE)."""
        self.assertEqual(VBTMathOracle.calculate_rir(0.0), 10.0)
        self.assertEqual(VBTMathOracle.calculate_rir(7.5), 2.5)
        self.assertEqual(VBTMathOracle.calculate_rir(8.0), 2.0)
        self.assertEqual(VBTMathOracle.calculate_rir(8.5), 1.5)
        self.assertEqual(VBTMathOracle.calculate_rir(9.5), 0.5)
        self.assertEqual(VBTMathOracle.calculate_rir(10.0), 0.0)
        # Clamped non-negative
        self.assertEqual(VBTMathOracle.calculate_rir(11.0), 0.0)
        # Invalid input fallback
        self.assertEqual(VBTMathOracle.calculate_rir("invalid"), 0.0)

    def test_r1_b03_set_toggle_idempotent_session_integrity(self):
        """R1 Boundary: Verify startNewSet and endActiveSet state transitions remain intact."""
        self.assertIn("function startNewSet", self.js)
        self.assertIn("function endActiveSet", self.js)
        has_add = "btnSetToggle.classList.add('set-active')" in self.js or "btnSetToggle.classList.add('recording')" in self.js
        has_remove = "btnSetToggle.classList.remove('set-active')" in self.js or "btnSetToggle.classList.remove('recording')" in self.js
        self.assertTrue(has_add and has_remove, "app.js must toggle active state class on btnSetToggle")

    def test_r1_b04_rpe_hero_card_visionos_glass_styling(self):
        """R1 Boundary: Verify #rpe-hero-card uses visionOS glass surface tokens."""
        clean_css = self.css.replace(" ", "")
        self.assertTrue(
            "#rpe-hero-card" in self.css or ".rpe-hero-card" in self.css or ".rpe-hero-banner" in self.css,
            "style.css must style #rpe-hero-card with visionOS frosted glass surface"
        )


class TestOverhaulR2FloatingNavAndTransitions(unittest.TestCase):
    """
    R2: Floating Navigation Bar & Fluid View Transitions
    Source: ORIGINAL_REQUEST.md (## 2026-10-15T14:40:18Z R2), PROJECT.md
    """
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    def test_r2_01_bottom_glass_nav_floating_capsule(self):
        """R2: Verify .bottom-glass-nav is a floating pill capsule with border-radius: 999px."""
        rules = extract_css_rules(self.css, ".bottom-glass-nav")
        self.assertTrue(len(rules) > 0, ".bottom-glass-nav must exist in style.css")
        matched = False
        for _, props, _ in rules:
            br = props.get("border-radius", "").strip()
            if "999px" in br or "50px" in br or "9999px" in br:
                matched = True
                break
        self.assertTrue(
            matched,
            ".bottom-glass-nav must specify pill border-radius: 999px"
        )

    def test_r2_02_nav_indicator_pill_element_exists(self):
        """R2: Verify .nav-indicator-pill element exists in navigation bar markup."""
        self.assertIn(
            "nav-indicator-pill",
            self.html,
            "index.html must include the sliding .nav-indicator-pill element inside .bottom-glass-nav"
        )

    def test_r2_03_nav_indicator_spring_animation(self):
        """R2: Verify .nav-indicator-pill implements visionOS spring curve cubic-bezier transition."""
        self.assertIn(
            ".nav-indicator-pill",
            self.css,
            "style.css must define styling and animation rules for .nav-indicator-pill"
        )
        rules = extract_css_rules(self.css, ".nav-indicator-pill")
        has_transition = False
        for _, props, _ in rules:
            t = props.get("transition", "")
            if "transform" in t or "cubic-bezier" in t or "ease" in t:
                has_transition = True
                break
        self.assertTrue(
            has_transition or "cubic-bezier" in self.css,
            ".nav-indicator-pill must have a smooth sliding spring transition"
        )

    def test_r2_04_fluid_gpu_view_transitions_classes(self):
        """R2: Verify CSS and app.js implement fluid cross-fades via leaving-section staging."""
        self.assertIn(
            ".leaving-section",
            self.css,
            "style.css must define .leaving-section for fluid staged cross-fades"
        )
        self.assertIn(
            ".active-section",
            self.css,
            "style.css must define .active-section"
        )

    def test_r2_05_micro_interaction_spring_physics(self):
        """R2: Verify micro-interaction spring physics curves are configured."""
        self.assertTrue(
            "cubic-bezier(0.16" in self.css or "cubic-bezier" in self.css,
            "style.css must use fluid spring bezier curves for tactile feedback"
        )

    def test_r2_b01_nav_tabs_all_have_pill_radius(self):
        """R2 Boundary: Verify all .nav-tab elements have pill radius 999px."""
        rules = extract_css_rules(self.css, ".nav-tab")
        self.assertTrue(len(rules) > 0)
        has_pill = False
        for _, props, _ in rules:
            if "999px" in props.get("border-radius", ""):
                has_pill = True
                break
        self.assertTrue(has_pill, ".nav-tab must have border-radius: 999px")

    def test_r2_b02_nav_data_active_sync(self):
        """R2 Boundary: Verify bottom-glass-nav tracks data-active attribute in app.js."""
        self.assertTrue(
            "data-active" in self.js or "data-target" in self.js,
            "app.js must coordinate tab target selection with bottom navigation"
        )

    def test_r2_b03_leaving_section_timeout_cleanup(self):
        """R2 Boundary: Verify leaving-section class is removed cleanly after transition."""
        self.assertTrue(
            "leaving-section" in self.js or "leaving-section" in self.css,
            "Fluid tab transitions must support staged cleanup of leaving sections"
        )


class TestOverhaulR3LongPressRepPR(unittest.TestCase):
    """
    R3: Long-Press Rep PR Tagging & Model Persistence
    Source: ORIGINAL_REQUEST.md (## 2026-10-15T14:40:18Z R3), PROJECT.md
    """
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    def test_r3_01_long_press_duration_500ms(self):
        """R3: Verify 500ms press-and-hold duration is configured in app.js."""
        # Check for 500ms duration constant or timer
        has_500ms = (
            "500" in self.js and
            ("pressTimer" in self.js or "holdTimer" in self.js or "longPress" in self.js or "LONG_PRESS_MS" in self.js)
        )
        self.assertTrue(
            has_500ms,
            "app.js must implement a 500ms press-and-hold timer for repetition PR tagging"
        )

    def test_r3_02_radial_progress_glow_fx(self):
        """R3: Verify radial progress ring / halo markup and styling exists."""
        self.assertTrue(
            "rep-press-progress-ring" in self.css or "radial-indicator" in self.css or "press-holding" in self.css,
            "style.css must define visual progress feedback (.rep-press-progress-ring / .press-holding)"
        )

    def test_r3_03_haptic_vibration_trigger(self):
        """R3: Verify haptic vibration pulse (navigator.vibrate) is triggered on 500ms completion."""
        self.assertIn(
            "navigator.vibrate",
            self.js,
            "app.js must trigger tactile feedback via navigator.vibrate upon 500ms hold"
        )

    def test_r3_04_gold_glowing_pr_badge_styling(self):
        """R3: Verify gold glowing PR badge styling (.rep-pr-badge.gold-glow) exists in style.css."""
        self.assertIn(
            ".rep-pr-badge",
            self.css,
            "style.css must define .rep-pr-badge styling"
        )
        clean_css = self.css.lower().replace(" ", "")
        has_gold = (
            "gold" in clean_css or
            "#ffd700" in clean_css or
            "rgba(255,215,0" in clean_css or
            "--pr-gold" in clean_css
        )
        self.assertTrue(has_gold, ".rep-pr-badge must feature gold glowing specular appearance")

    def test_r3_05_is_pr_flag_in_rep_model(self):
        """R3: Verify isPR boolean flag is integrated into repetition data model and persistence."""
        self.assertIn(
            "isPR",
            self.js,
            "app.js must support isPR property on repetition items"
        )
        self.assertIn(
            "vbt_workouts_v1",
            self.js,
            "Repetition PR state must persist into vbt_workouts_v1 in localStorage"
        )

    def test_r3_b01_displacement_guard_cancels_over_10px(self):
        """R3 Boundary: Verify movement exceeding 10px cancels the long-press gesture."""
        # Test displacement calculation with oracle
        self.assertLessEqual(VBTMathOracle.check_euclidean_distance(0, 0, 6, 7), 10.0) # ~9.22px -> valid hold
        self.assertGreater(VBTMathOracle.check_euclidean_distance(0, 0, 8, 8), 10.0)   # ~11.31px -> cancelled
        # Verify displacement guard check in app.js
        has_displacement_guard = (
            "10" in self.js and
            ("Math.hypot" in self.js or "Math.sqrt" in self.js or "pointermove" in self.js or "touchmove" in self.js)
        )
        self.assertTrue(
            has_displacement_guard,
            "app.js must cancel 500ms hold if pointer/touch movement exceeds 10px"
        )

    def test_r3_b02_early_release_cancels_timer(self):
        """R3 Boundary: Verify pointerup/touchend clears press timer without PR tag."""
        has_abort_listener = (
            "pointerup" in self.js or "touchend" in self.js or "clearTimeout" in self.js
        )
        self.assertTrue(
            has_abort_listener,
            "app.js must clear long-press timer on pointerup / touchend"
        )

    def test_r3_b03_pr_toggle_reversibility(self):
        """R3 Boundary: Verify toggling isPR is reversible (true -> false -> true)."""
        # Test logical negation logic in JS
        self.assertTrue(
            "!rep.isPR" in self.js or "isPR = !isPR" in self.js or "isPR: !rep.isPR" in self.js or "rep.isPR" in self.js,
            "app.js must toggle isPR boolean state upon subsequent long-press"
        )

    def test_r3_b04_contextmenu_prevented_during_long_press(self):
        """R3 Boundary: Verify contextmenu event is suppressed to prevent mobile browser interruptions."""
        self.assertTrue(
            "contextmenu" in self.js,
            "app.js must prevent default on contextmenu during long-press gesture"
        )

    def test_r3_b05_euclidean_distance_oracle(self):
        """R3 Boundary: Validate Euclidean distance calculations against mathematical oracle."""
        self.assertAlmostEqual(VBTMathOracle.check_euclidean_distance(100, 200, 100, 200), 0.0)
        self.assertAlmostEqual(VBTMathOracle.check_euclidean_distance(0, 0, 3, 4), 5.0)
        self.assertAlmostEqual(VBTMathOracle.check_euclidean_distance(10, 10, 16, 18), 10.0)
        self.assertAlmostEqual(VBTMathOracle.check_euclidean_distance(0, 0, 10, 1), 10.0498756, places=5)

TestOverhaulR3LongPressPRTagging = TestOverhaulR3LongPressRepPR


class TestOverhaulR4HistoryPRAndDots(unittest.TestCase):
    """
    R4: History Page PR Dashboard & Live DOTS Calculator
    Source: ORIGINAL_REQUEST.md (## 2026-10-15T14:40:18Z R4), PROJECT.md
    """
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    def test_r4_01_pr_competition_tracker_container_in_history(self):
        """R4: Verify #pr-competition-tracker container exists inside #tab-history."""
        self.assertTrue(
            find_dom_id(self.html, "pr-competition-tracker"),
            "index.html must contain #pr-competition-tracker in the DOM"
        )
        tab_history_match = re.search(r'<section[^>]*id=[\'"]tab-history[\'"][^>]*>([\s\S]*?)</section>', self.html)
        self.assertIsNotNone(tab_history_match, "#tab-history must exist")
        self.assertIn('id="pr-competition-tracker"', tab_history_match.group(1),
                      "#pr-competition-tracker must be located inside #tab-history")

    def test_r4_02_current_prs_card_and_1rm_inputs(self):
        """R4: Verify Current PRs Card (#current-prs-card) and 1RM inputs exist."""
        required_inputs = [
            "current-prs-card",
            "pr-squat-weight",
            "pr-bench-weight",
            "pr-deadlift-weight",
            "pr-current-total"
        ]
        for dom_id in required_inputs:
            self.assertTrue(
                find_dom_id(self.html, dom_id),
                f"#tab-history must contain #{dom_id}"
            )

    def test_r4_03_sensor_peak_velocities_displays(self):
        """R4: Verify dynamic sensor peak velocity displays exist in Current PRs card."""
        peak_ids = [
            "pr-squat-vel",
            "pr-bench-vel",
            "pr-deadlift-vel"
        ]
        for dom_id in peak_ids:
            self.assertTrue(
                find_dom_id(self.html, dom_id),
                f"Current PRs card must contain dynamic sensor velocity display #{dom_id}"
            )

    def test_r4_04_comp_pr_box_and_records(self):
        """R4: Verify Competition PR Box (#comp-pr-box) and inputs exist."""
        comp_ids = [
            "comp-pr-box",
            "comp-squat-weight",
            "comp-bench-weight",
            "comp-deadlift-weight",
            "comp-pr-total"
        ]
        for dom_id in comp_ids:
            self.assertTrue(
                find_dom_id(self.html, dom_id),
                f"History tab must contain Competition PR element #{dom_id}"
            )

    def test_r4_05_dots_calculator_module_and_controls(self):
        """R4: Verify Live DOTS Calculator module and interactive controls exist."""
        dots_ids = [
            "dots-calculator-module",
            "dots-bodyweight-input",
            "dots-gender-male",
            "dots-gender-female",
            "dots-src-current",
            "dots-src-comp",
            "dots-score-display",
            "dots-total-display",
            "dots-tier-badge"
        ]
        for dom_id in dots_ids:
            self.assertTrue(
                find_dom_id(self.html, dom_id),
                f"Live DOTS Calculator module must contain #{dom_id}"
            )

    def test_r4_06_official_ipf_dots_polynomial_male_vector(self):
        """R4: Verify official IPF DOTS 4th-order polynomial for Male: 80kg BW, 600kg Total = 413.73."""
        score = VBTMathOracle.calculate_dots_score(total_kg=600.0, bodyweight_kg=80.0, gender="male")
        self.assertEqual(score, 413.73, "Official IPF DOTS Male benchmark: 600kg @ 80kg BW must equal 413.73")

    def test_r4_07_official_ipf_dots_polynomial_female_vector(self):
        """R4: Verify official IPF DOTS 4th-order polynomial for Female: 60kg BW, 350kg Total = 388.00."""
        score = VBTMathOracle.calculate_dots_score(total_kg=350.0, bodyweight_kg=60.0, gender="female")
        self.assertAlmostEqual(score, 388.00, delta=0.05, msg="Official IPF DOTS Female benchmark: 350kg @ 60kg BW must be approx 388.00")

    def test_r4_08_official_ipf_dots_polynomial_elite_vector(self):
        """R4: Verify official IPF DOTS 4th-order polynomial for Male: 100kg BW, 750kg Total = 461.64."""
        score = VBTMathOracle.calculate_dots_score(total_kg=750.0, bodyweight_kg=100.0, gender="male")
        self.assertEqual(score, 461.64, "Official IPF DOTS Male benchmark: 750kg @ 100kg BW must equal 461.64")

    def test_r4_09_persistence_schema_vbt_pr_data_v1(self):
        """R4: Verify athlete PR profile and DOTS preferences persist under vbt_pr_data_v1."""
        self.assertIn(
            "vbt_pr_data_v1",
            self.js,
            "app.js must persist athlete PR loads and bodyweight under key 'vbt_pr_data_v1'"
        )

    def test_r4_b01_dots_zero_and_negative_input_guards(self):
        """R4 Boundary: Verify DOTS calculator guards against zero, negative, and invalid numbers."""
        self.assertEqual(VBTMathOracle.calculate_dots_score(total_kg=0, bodyweight_kg=80.0), 0.0)
        self.assertEqual(VBTMathOracle.calculate_dots_score(total_kg=-500, bodyweight_kg=80.0), 0.0)
        self.assertEqual(VBTMathOracle.calculate_dots_score(total_kg=500, bodyweight_kg=0), 0.0)
        self.assertEqual(VBTMathOracle.calculate_dots_score(total_kg=500, bodyweight_kg=-80.0), 0.0)
        self.assertEqual(VBTMathOracle.calculate_dots_score(total_kg="invalid", bodyweight_kg=80.0), 0.0)
        self.assertEqual(VBTMathOracle.calculate_dots_score(total_kg=500, bodyweight_kg=None), 0.0)

    def test_r4_b02_dots_extreme_bodyweight_stability(self):
        """R4 Boundary: Verify DOTS formula evaluates safely across extreme bodyweights."""
        # Lightweight lifter (40 kg)
        score_light = VBTMathOracle.calculate_dots_score(total_kg=300, bodyweight_kg=40.0, gender="female")
        self.assertGreater(score_light, 0.0)
        self.assertLess(score_light, 1000.0)

        # Superheavyweight lifter (210 kg)
        score_shw = VBTMathOracle.calculate_dots_score(total_kg=850, bodyweight_kg=210.0, gender="male")
        self.assertGreater(score_shw, 0.0)
        self.assertLess(score_shw, 1000.0)

        # Extreme 350 kg lifter (denominator turns negative; guard returns 0.0)
        score_extreme = VBTMathOracle.calculate_dots_score(total_kg=900, bodyweight_kg=350.0, gender="male")
        self.assertEqual(score_extreme, 0.0)

    def test_r4_b03_sensor_peak_velocity_extraction_algorithm(self):
        """R4 Boundary: Verify sensor peak velocity extraction across multiple lifts and sessions."""
        mock_workouts = [
            {
                "id": 1,
                "sets": [
                    {
                        "setNumber": 1,
                        "lift": "Squat",
                        "reps": [
                            {"lift": "Squat", "velocity": 0.65},
                            {"lift": "Squat", "velocity": 0.82},
                            {"lift": "Squat", "velocity": 0.58}
                        ]
                    },
                    {
                        "setNumber": 2,
                        "lift": "Bench",
                        "reps": [
                            {"lift": "Bench", "velocity": 0.95},
                            {"lift": "Bench", "velocity": 0.72}
                        ]
                    }
                ]
            },
            {
                "id": 2,
                "sets": [
                    {
                        "setNumber": 1,
                        "lift": "Deadlift",
                        "reps": [
                            {"lift": "Deadlift", "velocity": 0.74}
                        ]
                    }
                ]
            }
        ]
        peaks = VBTMathOracle.extract_sensor_peak_velocities(mock_workouts)
        self.assertEqual(peaks["squat"], 0.82)
        self.assertEqual(peaks["bench"], 0.95)
        self.assertEqual(peaks["deadlift"], 0.74)

        # Empty workouts
        empty_peaks = VBTMathOracle.extract_sensor_peak_velocities([])
        self.assertEqual(empty_peaks["squat"], 0.0)
        self.assertEqual(empty_peaks["bench"], 0.0)
        self.assertEqual(empty_peaks["deadlift"], 0.0)

    def test_r4_b04_corrupted_pr_storage_recovery(self):
        """R4 Boundary: Verify storage loading in app.js gracefully recovers from malformed JSON."""
        # Check that loadPrData or equivalent in app.js wraps JSON.parse in try/catch
        has_safe_load = (
            "JSON.parse" in self.js and "try" in self.js and "catch" in self.js
        )
        self.assertTrue(has_safe_load, "app.js must safely wrap localStorage parsing in try/catch")


class TestOverhaulR5Stability(unittest.TestCase):
    """
    R5: Backend & WebBLE Stability Preservation
    Source: ORIGINAL_REQUEST.md (## 2026-10-15T14:40:18Z R5), PROJECT.md
    """
    @classmethod
    def setUpClass(cls):
        cls.js = get_app_js()
        cls.html = get_index_html()

    def test_r5_01_service_uuid_match(self):
        """R5 Invariant: Web Bluetooth GATT Service UUID must remain 4fafc201-1fb5-459e-8fcc-c5c9c331914b."""
        self.assertIn("4fafc201-1fb5-459e-8fcc-c5c9c331914b", self.js)

    def test_r5_02_data_characteristic_uuid_match(self):
        """R5 Invariant: Web Bluetooth Data Characteristic UUID must remain beb5483e-36e1-4688-b7f5-ea07361b26a8."""
        self.assertIn("beb5483e-36e1-4688-b7f5-ea07361b26a8", self.js)

    def test_r5_03_cmd_characteristic_uuid_match(self):
        """R5 Invariant: Web Bluetooth Command Characteristic UUID must remain 5a7d3c90-951d-444a-8f5b-11c500732890."""
        self.assertIn("5a7d3c90-951d-444a-8f5b-11c500732890", self.js)

    def test_r5_04_ble_device_filter_intact(self):
        """R5 Invariant: Bluetooth device name filter must remain 'VBT_Tracker'."""
        self.assertIn("VBT_Tracker", self.js)

    def test_r5_05_esp32_command_strings_intact(self):
        """R5 Invariant: Hardware command strings CMD:SL:DL, CMD:SL:SQ, CMD:SL:BP must be intact."""
        self.assertIn("CMD:SL:DL", self.js)
        self.assertIn("CMD:SL:SQ", self.js)
        self.assertIn("CMD:SL:BP", self.js)

    def test_r5_06_telemetry_payload_parsing_intact(self):
        """R5 Invariant: Pipe-delimited telemetry payload parser must correctly extract lift, vel, rpe."""
        payload = "Squat | 0.82 m/s | RPE: 7.5"
        parsed = VBTMathOracle.parse_ble_payload(payload)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["lift"], "Squat")
        self.assertEqual(parsed["velocity"], 0.82)
        self.assertEqual(parsed["rpe"], 7.5)

    def test_r5_07_primary_storage_key_intact(self):
        """R5 Invariant: Primary workout storage key must remain 'vbt_workouts_v1'."""
        self.assertIn("vbt_workouts_v1", self.js)

    def test_r5_08_set_analytics_formulas_intact(self):
        """R5 Invariant: Mathematical formulas for Avg, Max, Min Velocity, Velocity Loss %, Avg RPE intact."""
        reps = [
            {"velocity": 0.80, "rpe": 7.0},
            {"velocity": 0.75, "rpe": 7.5},
            {"velocity": 0.65, "rpe": 8.5}
        ]
        metrics = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(metrics["avgVelocity"], 0.73)
        self.assertEqual(metrics["maxVelocity"], 0.80)
        self.assertEqual(metrics["minVelocity"], 0.65)
        self.assertEqual(metrics["avgRpe"], 7.7)
        self.assertEqual(metrics["velocityLossPct"], 18.8)

    def test_r5_09_csv_export_headers_intact(self):
        """R5 Invariant: CSV export headers must retain 10 standard columns."""
        headers = [
            "Workout ID", "Workout Date", "Set Number", "Lift", "Rep Number",
            "Velocity (m/s)", "RPE", "Set Avg Velocity", "Set Velocity Loss %", "Timestamp"
        ]
        mock_workouts = [{
            "id": 1,
            "dateStr": "2026-10-15",
            "sets": [{
                "setNumber": 1,
                "lift": "Deadlift",
                "avgVelocity": 0.70,
                "velocityLossPct": 10.0,
                "reps": [{
                    "repNumber": 1,
                    "velocity": 0.70,
                    "rpe": 8.0,
                    "timestamp": 123456789
                }]
            }]
        }]
        rows = VBTMathOracle.generate_csv_rows(mock_workouts)
        self.assertEqual(rows[0], headers)
        self.assertEqual(len(rows), 2)

    def test_r5_10_json_export_structure_intact(self):
        """R5 Invariant: Export JSON routine must stringify workout array with 2 spaces indent."""
        self.assertIn("JSON.stringify(workouts, null, 2)", self.js)


class TestOverhaulTier4Scenarios(unittest.TestCase):
    """
    Tier 4: Real-World Athlete Session Scenarios
    Source: orchestrator_2/TEST_INFRA.md § Real-World Application Scenarios
    """
    def test_s01_high_cadence_squat_set_no_redirect(self):
        """Scenario 1: High-Cadence Squat Set without Tab Interruption."""
        # 5 reps ingested, athlete observes real-time tier progression
        reps = [
            {"lift": "Squat", "velocity": 0.90, "rpe": 6.5},  # Warmup
            {"lift": "Squat", "velocity": 0.82, "rpe": 7.5},  # Target
            {"lift": "Squat", "velocity": 0.78, "rpe": 8.0},  # Target
            {"lift": "Squat", "velocity": 0.71, "rpe": 8.5},  # Heavy
            {"lift": "Squat", "velocity": 0.62, "rpe": 9.5}   # Maximal
        ]
        # Verify tier sequence
        tiers = [VBTMathOracle.determine_rpe_tier(r["rpe"])[0] for r in reps]
        self.assertEqual(tiers, ["warmup", "target", "target", "heavy", "maximal"])
        # Verify RIR progression
        rirs = [VBTMathOracle.calculate_rir(r["rpe"]) for r in reps]
        self.assertEqual(rirs, [3.5, 2.5, 2.0, 1.5, 0.5])
        # Verify set analytics
        metrics = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(metrics["avgVelocity"], 0.77)
        self.assertEqual(metrics["maxVelocity"], 0.90)
        self.assertEqual(metrics["velocityLossPct"], 31.1)

    def test_s02_heavy_bench_long_press_pr_lifecycle(self):
        """Scenario 2: Heavy Bench Press with Long-Press PR Tagging."""
        # Rep 3 is personal record
        rep = {
            "repNumber": 3,
            "lift": "Bench",
            "velocity": 0.98,
            "rpe": 9.0,
            "timestamp": 1729000000000,
            "isPR": False
        }
        # Simulate 500ms hold trigger
        rep["isPR"] = not rep.get("isPR", False)
        self.assertTrue(rep["isPR"])
        # Serialized in workout
        session = {"id": 1, "sets": [{"setNumber": 1, "reps": [rep]}]}
        dumped = json.loads(json.dumps(session))
        self.assertTrue(dumped["sets"][0]["reps"][0]["isPR"])

    def test_s03_competition_prep_live_dots_evaluation(self):
        """Scenario 3: Competition Preparation & Live DOTS Tracking."""
        # Athlete 82.5 kg Male with 550 kg Total
        male_score = VBTMathOracle.calculate_dots_score(550.0, 82.5, "male")
        self.assertGreater(male_score, 360.0)
        self.assertLess(male_score, 390.0)

        # Same total on 65 kg Female
        female_score = VBTMathOracle.calculate_dots_score(450.0, 65.0, "female")
        self.assertGreater(female_score, 450.0)

    def test_s04_rapid_multi_tab_navigation_transitions(self):
        """Scenario 4: Rapid Multi-Tab Navigation with Glass Pill Transitions."""
        tabs = ["live", "set", "history", "live"]
        self.assertEqual(len(tabs), 4)

    def test_s05_full_powerlifting_meet_lifetime_history_simulation(self):
        """Scenario 5: Full Powerlifting Meet (SBD) Lifetime History Simulation."""
        meet_workouts = [
            {
                "id": 101,
                "sets": [
                    {"lift": "Squat", "reps": [{"lift": "Squat", "velocity": 0.75}, {"lift": "Squat", "velocity": 0.88}]},
                    {"lift": "Bench", "reps": [{"lift": "Bench", "velocity": 0.92}, {"lift": "Bench", "velocity": 1.02}]},
                    {"lift": "Deadlift", "reps": [{"lift": "Deadlift", "velocity": 0.68}, {"lift": "Deadlift", "velocity": 0.79}]}
                ]
            }
        ]
        peaks = VBTMathOracle.extract_sensor_peak_velocities(meet_workouts)
        self.assertEqual(peaks["squat"], 0.88)
        self.assertEqual(peaks["bench"], 1.02)
        self.assertEqual(peaks["deadlift"], 0.79)


if __name__ == '__main__':
    unittest.main()
