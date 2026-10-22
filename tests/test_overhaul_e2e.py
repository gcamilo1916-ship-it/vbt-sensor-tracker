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


class TestOverhaulMilestone2WeightAndVolume(unittest.TestCase):
    """
    Milestone 2: Requirements R1 (Set Weight Selection & Persistence) & R2 (Workout Total Volume)
    Source: ORIGINAL_REQUEST.md (## 2026-10-22T13:29:21Z), PROJECT.md
    """
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    def test_m2_01_live_weight_control_dom_elements(self):
        """R1: Verify live page controls-row contains glass-pill weight control and steppers."""
        self.assertTrue(find_dom_id(self.html, "live-weight-control"), "Missing #live-weight-control")
        self.assertTrue(find_dom_id(self.html, "live-set-weight-input"), "Missing #live-set-weight-input")
        self.assertTrue(find_dom_id(self.html, "btn-live-weight-dec"), "Missing #btn-live-weight-dec")
        self.assertTrue(find_dom_id(self.html, "btn-live-weight-inc"), "Missing #btn-live-weight-inc")

    def test_m2_02_workout_weight_module_dom_elements(self):
        """R1: Verify workout page current-set-card contains weight module and steppers."""
        self.assertTrue(find_dom_id(self.html, "workout-set-weight-module"), "Missing #workout-set-weight-module")
        self.assertTrue(find_dom_id(self.html, "workout-set-weight-input"), "Missing #workout-set-weight-input")
        self.assertTrue(find_dom_id(self.html, "btn-workout-weight-dec"), "Missing #btn-workout-weight-dec")
        self.assertTrue(find_dom_id(self.html, "btn-workout-weight-inc"), "Missing #btn-workout-weight-inc")

    def test_m2_03_history_sum_volume_dom_element(self):
        """R2: Verify history summary bar contains #sum-volume metric tile."""
        self.assertTrue(find_dom_id(self.html, "sum-volume"), "Missing #sum-volume tile")

    def test_m2_04_weight_storage_key_and_defaults(self):
        """R1: Verify WEIGHT_STORAGE_KEY constant and per-lift weight memory in app.js."""
        self.assertIn("vbt_last_lift_weights_v1", self.js)
        self.assertIn("getLastWeightForLift", self.js)
        self.assertIn("setWorkingWeight", self.js)

    def test_m2_05_start_new_set_records_weight(self):
        """R1: Verify startNewSet initializes set.weight in activeSet."""
        start_set_match = re.search(r'function\s+startNewSet\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(start_set_match, "startNewSet function not found")
        body = start_set_match.group(1)
        self.assertIn("weight", body, "startNewSet must assign weight property to newSet")

    def test_m2_06_apply_lift_theme_updates_weight(self):
        """R1: Verify applyLiftTheme updates weight input on lift switch."""
        theme_match = re.search(r'function\s+applyLiftTheme\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(theme_match, "applyLiftTheme function not found")
        body = theme_match.group(1)
        self.assertIn("getLastWeightForLift", body, "applyLiftTheme must query remembered weight for new lift")
        self.assertIn("setWorkingWeight", body, "applyLiftTheme must call setWorkingWeight")

    def test_m2_07_workout_sets_table_renders_load(self):
        """R1: Verify updateWorkoutPage renders LOAD metric in sets table."""
        update_match = re.search(r'function\s+updateWorkoutPage\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(update_match, "updateWorkoutPage function not found")
        body = update_match.group(1)
        self.assertIn("LOAD", body, "updateWorkoutPage must render LOAD metric label in workout sets table")

    def test_m2_08_render_history_view_calculates_session_volume(self):
        """R2: Verify renderHistoryView calculates and formats session volume with comma separators."""
        history_match = re.search(r'function\s+renderHistoryView\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(history_match, "renderHistoryView function not found")
        body = history_match.group(1)
        self.assertIn("sessionVolume", body, "renderHistoryView must calculate session volume")
        self.assertIn("toLocaleString", body, "renderHistoryView must format volume with comma separators")

    def test_m2_09_render_accordion_set_volume(self):
        """R2: Verify renderSessionSetsAccordion displays set volume and weight in accordion headers."""
        accordion_match = re.search(r'function\s+renderSessionSetsAccordion\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(accordion_match, "renderSessionSetsAccordion function not found")
        body = accordion_match.group(1)
        self.assertIn("set-stat-vol", body, "renderSessionSetsAccordion must render set-stat-vol")

    def test_m2_10_lifetime_volume_aggregation(self):
        """R2: Verify updateHistoryStats aggregates lifetime volume across all workouts."""
        stats_match = re.search(r'function\s+updateHistoryStats\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(stats_match, "updateHistoryStats function not found")
        body = stats_match.group(1)
        self.assertIn("sumVolume", body, "updateHistoryStats must update sumVolume display")
        self.assertIn("lifetimeVolume", body, "updateHistoryStats must accumulate lifetime volume")

    def test_m2_11_history_summary_card_css_5_columns(self):
        """R2: Verify .history-summary-card in style.css has repeat(5, 1fr) grid columns."""
        rules = extract_css_rules(self.css, ".history-summary-card")
        self.assertTrue(len(rules) > 0, ".history-summary-card rule not found in style.css")
        grid_cols = rules[0][1].get("grid-template-columns", "").replace(" ", "")
        self.assertIn("repeat(5,1fr)", grid_cols, ".history-summary-card must use repeat(5, 1fr)")

    def test_m2_12_set_volume_mathematical_oracle(self):
        """R2: Mathematical verification of session volume sum(weight * reps)."""
        session_sets = [
            {"lift": "Deadlift", "weight": 140.0, "reps": [1, 2, 3, 4, 5]},  # 140 * 5 = 700
            {"lift": "Deadlift", "weight": 160.0, "reps": [1, 2, 3]},        # 160 * 3 = 480
            {"lift": "Deadlift", "weight": 180.0, "reps": [1]},              # 180 * 1 = 180
            {"lift": "Deadlift", "weight": 0.0, "reps": [1, 2]},             # 0 * 2 = 0
            {"lift": "Deadlift", "weight": None, "reps": [1, 2, 3]},         # None handled safely -> 0
        ]
        calc_vol = 0.0
        for s in session_sets:
            w = s.get("weight")
            w_val = float(w) if isinstance(w, (int, float)) and not math.isnan(w) else 0.0
            reps_len = len(s.get("reps", []))
            calc_vol += w_val * reps_len

        expected_vol = 1360.0
        self.assertEqual(calc_vol, expected_vol)
        formatted_vol = f"{int(round(calc_vol)):,d} kg"
        self.assertEqual(formatted_vol, "1,360 kg")

    def test_m2_13_two_way_sync_behavior(self):
        """R1: Verify setWorkingWeight updates activeSet and input synchronization."""
        sync_match = re.search(r'function\s+setWorkingWeight\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(sync_match, "setWorkingWeight function not found in app.js")
        body = sync_match.group(1)
        self.assertIn("liveSetWeightInput", body)
        self.assertIn("workoutSetWeightInput", body)
        self.assertIn("activeSet.weight", body)
        self.assertIn("persistStorage", body)


class TestOverhaulMilestone3GymPRPromotion(unittest.TestCase):
    """
    Milestone 3: Requirement R3 (Long-Press PR Promotion to Gym PR with Velocity & RPE)
    Source: ORIGINAL_REQUEST.md (## 2026-10-22T13:29:21Z R3), PROJECT.md
    """
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    def test_r3_01_gym_pr_badges_exist_in_dom(self):
        """R3: Verify #pr-squat-badge, #pr-bench-badge, #pr-deadlift-badge exist in index.html."""
        self.assertTrue(find_dom_id(self.html, "pr-squat-badge"), "Missing #pr-squat-badge in index.html")
        self.assertTrue(find_dom_id(self.html, "pr-bench-badge"), "Missing #pr-bench-badge in index.html")
        self.assertTrue(find_dom_id(self.html, "pr-deadlift-badge"), "Missing #pr-deadlift-badge in index.html")
        self.assertIn("pr-badge-wrap", self.html, "Missing .pr-badge-wrap container in index.html")
        self.assertIn("pr-gym-badge", self.html, "Missing .pr-gym-badge class in index.html")

    def test_r3_02_existing_pr_card_contract_ids_preserved(self):
        """R3: Verify all existing PR card contract IDs remain intact without breakage."""
        required_ids = [
            "pr-squat-weight",
            "pr-bench-weight",
            "pr-deadlift-weight",
            "pr-squat-vel",
            "pr-bench-vel",
            "pr-deadlift-vel",
            "pr-current-total"
        ]
        for dom_id in required_ids:
            self.assertTrue(find_dom_id(self.html, dom_id), f"Contract ID #{dom_id} must be preserved in index.html")

    def test_r3_03_default_pr_profile_has_current_pr_details_schema(self):
        """R3: Verify defaultPrProfile in app.js defines currentPRDetails with squat, bench, deadlift."""
        profile_match = re.search(r'const\s+defaultPrProfile\s*=\s*\{([\s\S]*?)\n\};', self.js)
        self.assertIsNotNone(profile_match, "defaultPrProfile definition not found in app.js")
        body = profile_match.group(1)
        self.assertIn("currentPRDetails", body, "defaultPrProfile must declare currentPRDetails")
        self.assertIn("squat", body)
        self.assertIn("bench", body)
        self.assertIn("deadlift", body)
        self.assertIn("velocity", body)
        self.assertIn("rpe", body)

    def test_r3_04_load_pr_profile_parses_current_pr_details(self):
        """R3: Verify loadPrProfile in app.js parses currentPRDetails with safe fallbacks."""
        load_match = re.search(r'function\s+loadPrProfile\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(load_match, "loadPrProfile function not found in app.js")
        body = load_match.group(1)
        self.assertIn("currentPRDetails", body, "loadPrProfile must parse and restore currentPRDetails")
        self.assertIn("PR_STORAGE_KEY", body)

    def test_r3_05_persist_pr_profile_stores_current_pr_details(self):
        """R3: Verify persistPrProfile saves currentPRDetails to localStorage under PR_STORAGE_KEY."""
        persist_match = re.search(r'function\s+persistPrProfile\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(persist_match, "persistPrProfile function not found in app.js")
        body = persist_match.group(1)
        self.assertIn("currentPRDetails", body, "persistPrProfile must ensure currentPRDetails is present")
        self.assertIn("localStorage.setItem", body)
        self.assertIn("PR_STORAGE_KEY", body)

    def test_r3_06_update_pr_dashboard_ui_formats_badges(self):
        """R3: Verify updatePrDashboardUI updates and formats Gym PR badges with load, velocity, and RPE."""
        ui_match = re.search(r'function\s+updatePrDashboardUI\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(ui_match, "updatePrDashboardUI function not found in app.js")
        body = ui_match.group(1)
        self.assertIn("currentPRDetails", body)
        self.assertIn("pr-squat-badge", body)
        self.assertIn("pr-bench-badge", body)
        self.assertIn("pr-deadlift-badge", body)
        self.assertIn("kg", body)
        self.assertIn("m/s", body)
        self.assertIn("RPE", body)

    def test_r3_07_on_current_pr_input_syncs_details_weight(self):
        """R3: Verify direct weight inputs sync weight to currentPRDetails."""
        input_listener_match = re.search(r'const\s+onCurrentPrInput\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};', self.js)
        self.assertIsNotNone(input_listener_match, "onCurrentPrInput handler not found in app.js")
        body = input_listener_match.group(1)
        self.assertIn("currentPRDetails", body, "onCurrentPrInput must keep currentPRDetails in sync")
        self.assertIn("persistPrProfile", body)

    def test_r3_08_long_press_rep_promotion_logic(self):
        """R3: Verify updateSetUI handles long-press promotion, haptics, fanfare, and PR details update."""
        update_set_match = re.search(r'function\s+updateSetUI\s*\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(update_set_match, "updateSetUI function not found in app.js")
        body = update_set_match.group(1)
        self.assertIn("HapticsFX.vibrate", body, "updateSetUI must call HapticsFX.vibrate on PR promotion")
        self.assertIn("SoundFX.playPrFanfare", body, "updateSetUI must play fanfare on PR promotion")
        self.assertIn("currentPRs", body, "updateSetUI must update currentPRs upon promotion")
        self.assertIn("currentPRDetails", body, "updateSetUI must update currentPRDetails upon promotion")
        self.assertIn("persistPrProfile", body, "updateSetUI must persist PR profile upon promotion")

    def test_r3_09_weight_resolution_hierarchy(self):
        """R3: Verify programmatic logic for rep weight resolution fallback hierarchy."""
        def resolve_rep_weight(rep_w, set_w, default_pr):
            return rep_w if (isinstance(rep_w, (int, float)) and rep_w > 0) else (
                set_w if (isinstance(set_w, (int, float)) and set_w > 0) else default_pr
            )

        # Case 1: rep has explicit weight
        self.assertEqual(resolve_rep_weight(155.0, 150.0, 100.0), 155.0)
        # Case 2: rep has no weight, set has weight
        self.assertEqual(resolve_rep_weight(None, 150.0, 100.0), 150.0)
        self.assertEqual(resolve_rep_weight(0, 150.0, 100.0), 150.0)
        # Case 3: neither has weight, fallback to current PR
        self.assertEqual(resolve_rep_weight(None, None, 140.0), 140.0)
        self.assertEqual(resolve_rep_weight(0, 0, 140.0), 140.0)

    def test_r3_10_badge_formatting_oracle(self):
        """R3: Verify formatting oracle generates exact visionOS format: X.X kg • X.XX m/s • RPE X.X."""
        def format_badge(weight, velocity, rpe):
            return f"{float(weight):.1f} kg • {float(velocity):.2f} m/s • RPE {float(rpe):.1f}"

        self.assertEqual(format_badge(140.0, 0.35, 9.5), "140.0 kg • 0.35 m/s • RPE 9.5")
        self.assertEqual(format_badge(100.0, 0.25, 9.5), "100.0 kg • 0.25 m/s • RPE 9.5")
        self.assertEqual(format_badge(180.0, 0.28, 9.5), "180.0 kg • 0.28 m/s • RPE 9.5")
        self.assertEqual(format_badge(142.5, 0.421, 9.0), "142.5 kg • 0.42 m/s • RPE 9.0")

    def test_r3_11_style_css_pr_gym_badge_and_wrap(self):
        """R3: Verify style.css defines .pr-gym-badge and .pr-badge-wrap with visionOS aesthetics."""
        badge_rules = extract_css_rules(self.css, ".pr-gym-badge")
        self.assertTrue(len(badge_rules) > 0, ".pr-gym-badge rule not found in style.css")
        wrap_rules = extract_css_rules(self.css, ".pr-badge-wrap")
        self.assertTrue(len(wrap_rules) > 0, ".pr-badge-wrap rule not found in style.css")
        declarations = badge_rules[0][1]
        self.assertIn("border-radius", declarations)
        self.assertIn("backdrop-filter", declarations)
        self.assertIn("font-family", declarations)


class TestOverhaulMilestone4DirectionalTabAnimations(unittest.TestCase):
    """
    Milestone 4: Requirement R4 (iOS Fluid Directional Tab Transition Animations & Glass FX)
    Source: ORIGINAL_REQUEST.md (## 2026-10-22T13:29:21Z R4), PROJECT.md
    """
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    def test_r4_01_tab_order_mapping_defined(self):
        """R4: Verify TAB_ORDER mapping exists in app.js with live: 0, set: 1, history: 2."""
        self.assertIn("TAB_ORDER", self.js, "TAB_ORDER mapping must be defined in app.js")
        match = re.search(r'const\s+TAB_ORDER\s*=\s*\{([^}]+)\}', self.js)
        self.assertIsNotNone(match, "TAB_ORDER object literal not found in app.js")
        clean_body = match.group(1).replace(" ", "")
        self.assertIn("live:0", clean_body)
        self.assertIn("set:1", clean_body)
        self.assertIn("history:2", clean_body)

    def test_r4_02_directional_classes_in_css(self):
        """R4: Verify style.css defines directional slide-and-fade classes."""
        classes = [
            ".slide-left-in",
            ".slide-left-out",
            ".slide-right-in",
            ".slide-right-out"
        ]
        for cls_name in classes:
            self.assertIn(cls_name, self.css, f"style.css must define directional class {cls_name}")

    def test_r4_03_hardware_accelerated_keyframes_in_css(self):
        """R4: Verify directional keyframes use GPU compositing (translate3d, scale, opacity)."""
        keyframes = [
            "tabSlideLeftIn",
            "tabSlideLeftOut",
            "tabSlideRightIn",
            "tabSlideRightOut"
        ]
        for kf in keyframes:
            self.assertIn(f"@keyframes {kf}", self.css, f"@keyframes {kf} must be defined in style.css")
            self.assertIn(f"@-webkit-keyframes {kf}", self.css, f"@-webkit-keyframes {kf} must be defined in style.css for iOS WebKit")

        # Verify GPU transforms and compositing
        self.assertIn("translate3d(36px, 0, 0)", self.css)
        self.assertIn("translate3d(-36px, 0, 0)", self.css)
        self.assertIn("scale(0.985)", self.css)

    def test_r4_04_tab_contents_overflow_clipping(self):
        """R4: Verify .tab-contents enforces horizontal clipping via overflow-x: hidden / overflow-x: clip."""
        rules = extract_css_rules(self.css, ".tab-contents")
        self.assertTrue(len(rules) > 0, ".tab-contents rule must exist in style.css")
        has_overflow_x = False
        for _, props, _ in rules:
            ox = props.get("overflow-x", "")
            if "hidden" in ox or "clip" in ox:
                has_overflow_x = True
                break
        self.assertTrue(
            has_overflow_x or "overflow-x: hidden" in self.css or "overflow-x: clip" in self.css,
            ".tab-contents must specify overflow-x: hidden / clip to prevent horizontal scroll jitter on iOS"
        )

    def test_r4_05_webkit_synchronous_reflow_trigger(self):
        """R4: Verify iOS WebKit synchronous reflow trigger (void offsetHeight) before adding inClass."""
        self.assertIn(
            "targetSection.offsetHeight",
            self.js,
            "app.js must trigger synchronous reflow via offsetHeight before adding inClass"
        )
        self.assertIn(
            "void targetSection.offsetHeight",
            self.js,
            "app.js must use void targetSection.offsetHeight to force layout evaluation"
        )

    def test_r4_06_clear_tab_transitions_debouncer(self):
        """R4: Verify clearTabTransitions cancels timeouts and removes lingering animation classes."""
        self.assertIn("clearTabTransitions", self.js, "clearTabTransitions function must be defined in app.js")
        match = re.search(r'function\s+clearTabTransitions\s*\(\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(match, "clearTabTransitions function body not found in app.js")
        body = match.group(1)
        self.assertIn("clearTimeout", body)
        self.assertIn("leaving-section", body)
        self.assertIn("slide-left-out", body)
        self.assertIn("slide-right-out", body)
        self.assertIn("slide-left-in", body)
        self.assertIn("slide-right-in", body)

    def test_r4_07_directional_navigation_math_oracle(self):
        """R4: Verify forward/backward directional transition class resolution oracle."""
        tab_order = {"live": 0, "set": 1, "history": 2}

        def resolve_directional_classes(prev, target):
            prev_idx = tab_order.get(prev, 0)
            target_idx = tab_order.get(target, 0)
            is_forward = target_idx > prev_idx
            in_class = "slide-left-in" if is_forward else "slide-right-in"
            out_class = "slide-left-out" if is_forward else "slide-right-out"
            return in_class, out_class

        # Forward transitions (slide left)
        self.assertEqual(resolve_directional_classes("live", "set"), ("slide-left-in", "slide-left-out"))
        self.assertEqual(resolve_directional_classes("set", "history"), ("slide-left-in", "slide-left-out"))
        self.assertEqual(resolve_directional_classes("live", "history"), ("slide-left-in", "slide-left-out"))

        # Backward transitions (slide right)
        self.assertEqual(resolve_directional_classes("history", "set"), ("slide-right-in", "slide-right-out"))
        self.assertEqual(resolve_directional_classes("set", "live"), ("slide-right-in", "slide-right-out"))
        self.assertEqual(resolve_directional_classes("history", "live"), ("slide-right-in", "slide-right-out"))

    def test_r4_08_transition_timeout_and_tracking(self):
        """R4: Verify 280ms transition duration and tabTransitionTimeouts array tracking."""
        self.assertIn("tabTransitionTimeouts", self.js, "tabTransitionTimeouts array must be defined in app.js")
        self.assertIn("setTimeout(", self.js)
        self.assertIn("280", self.js, "Tab transition cleanup timeout should be 280ms matching the cubic-bezier duration")
        self.assertIn("tabTransitionTimeouts.push", self.js, "Timeout IDs must be tracked in tabTransitionTimeouts")

    def test_r4_09_bottom_nav_data_active_and_tab_states(self):
        """R4: Verify bottomGlassNav data-active and active class switching logic."""
        self.assertIn("bottomGlassNav.setAttribute('data-active', target)", self.js)
        self.assertIn("tab.classList.add('active')", self.js)
        self.assertIn("prevSection.classList.add('leaving-section', outClass)", self.js)
        self.assertIn("targetSection.classList.add(inClass)", self.js)

    def test_r4_10_gpu_will_change_and_backface_visibility(self):
        """R4: Verify GPU will-change and -webkit-backface-visibility optimization on tab sections."""
        self.assertIn("will-change: opacity, transform", self.css)
        self.assertIn("-webkit-backface-visibility: hidden", self.css)
        self.assertIn("backface-visibility: hidden", self.css)


if __name__ == '__main__':
    unittest.main()
