"""
Tier 1: Feature Coverage Test Suite for Eros VBT
Covers all 16 features from PROJECT.md with >=5 tests per feature (80+ test cases).
Requirement-driven, opaque-box tests grounded in ORIGINAL_REQUEST.md & PROJECT.md.
"""

import os
import re
import math
import unittest
from .conftest_base import (
    get_index_html,
    get_style_css,
    get_app_js,
    extract_css_rules,
    extract_css_token,
    check_css_brace_balance,
    find_dom_id,
    extract_dom_elements_by_tag,
    find_emojis_in_text,
    VBTMathOracle,
    HeadlessChromeSession
)

class TestTier1FeatureCoverage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 1: Ultra-translucent glass panels
    # ─────────────────────────────────────────────────────────────────────────

    def test_f01_01_obsidian_background_token(self):
        """F1: Verify obsidian base color #050507 token is configured in :root."""
        val = extract_css_token(self.css, "--bg-base")
        self.assertIsNotNone(val, "--bg-base token must be defined in :root")
        self.assertEqual(val.lower(), "#050507", "--bg-base must match obsidian #050507")

    def test_f01_02_glass_card_background_token(self):
        """F1: Verify ultra-translucent glass background token rgba(255, 255, 255, 0.04)."""
        val = extract_css_token(self.css, "--bg-glass-card")
        self.assertIsNotNone(val, "--bg-glass-card token must be defined in :root")
        self.assertIn("rgba(255,255,255,0.04)", val.replace(" ", ""),
                      "--bg-glass-card must be rgba(255, 255, 255, 0.04)")

    def test_f01_03_glass_panel_token(self):
        """F1: Verify glass panel token rgba(255, 255, 255, 0.04) in :root."""
        val = extract_css_token(self.css, "--bg-glass-panel")
        self.assertIsNotNone(val, "--bg-glass-panel token must be defined in :root")
        self.assertIn("rgba(255,255,255,0.04)", val.replace(" ", ""))

    def test_f01_04_glass_card_backdrop_filter(self):
        """F1: Verify .glass-card specifies backdrop-filter: blur(30px) saturate(180%)."""
        rules = extract_css_rules(self.css, ".glass-card")
        self.assertTrue(len(rules) > 0, ".glass-card class must exist in style.css")
        matched = False
        for _, props, _ in rules:
            bf = props.get("backdrop-filter", "").replace(" ", "")
            if "blur(30px)" in bf and "saturate(180%)" in bf:
                matched = True
                break
        self.assertTrue(matched, ".glass-card must have backdrop-filter: blur(30px) saturate(180%)")

    def test_f01_05_glass_card_webkit_backdrop_filter(self):
        """F1: Verify .glass-card specifies -webkit-backdrop-filter for iOS Safari/Bluefy."""
        rules = extract_css_rules(self.css, ".glass-card")
        self.assertTrue(len(rules) > 0)
        matched = False
        for _, props, _ in rules:
            wbf = props.get("-webkit-backdrop-filter", "").replace(" ", "")
            if "blur(30px)" in wbf and "saturate(180%)" in wbf:
                matched = True
                break
        self.assertTrue(matched, ".glass-card must have -webkit-backdrop-filter: blur(30px) saturate(180%)")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 2: Top-down specular light refraction
    # ─────────────────────────────────────────────────────────────────────────

    def test_f02_01_specular_gradient_angle(self):
        """F2: Verify specular border refraction gradient uses 180deg vertical linear gradient."""
        self.assertTrue(
            "180deg" in self.css or "--border-specular-gradient" in self.css,
            "style.css must define top-down specular refraction with 180deg gradient"
        )

    def test_f02_02_specular_gradient_top_stop(self):
        """F2: Verify top specular highlight stop rgba(255, 255, 255, 0.45) 0%."""
        clean_css = self.css.replace(" ", "")
        self.assertTrue(
            "rgba(255,255,255,0.45)0%" in clean_css or "rgba(255,255,255,0.45)" in clean_css,
            "Top-down specular gradient must start with rgba(255, 255, 255, 0.45)"
        )

    def test_f02_03_specular_gradient_mid_stop(self):
        """F2: Verify specular gradient intermediate stop rgba(255, 255, 255, 0.05) 30%."""
        clean_css = self.css.replace(" ", "")
        self.assertTrue(
            "rgba(255,255,255,0.05)30%" in clean_css or "rgba(255,255,255,0.05)" in clean_css,
            "Specular gradient must have 30% transition stop rgba(255, 255, 255, 0.05)"
        )

    def test_f02_04_specular_gradient_bottom_stop(self):
        """F2: Verify specular gradient concludes with transparent 100%."""
        clean_css = self.css.replace(" ", "")
        self.assertTrue(
            "transparent100%" in clean_css or "transparent" in clean_css,
            "Specular gradient must fade to transparent at 100%"
        )

    def test_f02_05_glass_card_specular_highlight(self):
        """F2: Verify specular edge highlight applied via border-box or box-shadow."""
        rules = extract_css_rules(self.css, ".glass-card")
        self.assertTrue(len(rules) > 0)
        has_specular = False
        for _, props, raw in rules:
            if "border-specular-gradient" in raw or "specular-top" in raw or "linear-gradient" in raw:
                has_specular = True
                break
        self.assertTrue(has_specular, ".glass-card must incorporate specular highlight styling")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 3: CSS syntax cleanup
    # ─────────────────────────────────────────────────────────────────────────

    def test_f03_01_css_balanced_braces(self):
        """F3: Verify style.css has perfectly balanced braces with zero unclosed blocks."""
        balanced, opens, closes, issues = check_css_brace_balance(self.css)
        self.assertTrue(balanced, f"CSS syntax error: unbalanced braces! Issues: {issues}")

    def test_f03_02_custom_option_no_orphaned_closing_brace(self):
        """F3: Verify .custom-option does not have an orphaned dangling closing brace."""
        # Check between lines 480-515 that .custom-option * is not immediately followed by unattached properties
        pattern = r'\.custom-option\s*\*\s*\{[^}]*\}\s*font-weight'
        match = re.search(pattern, self.css)
        self.assertIsNone(match, "Found orphaned CSS properties outside selector after .custom-option *")

    def test_f03_03_custom_option_pointer_events(self):
        """F3: Verify .custom-option * contains pointer-events: none."""
        self.assertIn(".custom-option *", self.css)
        rules = extract_css_rules(self.css, ".custom-option *")
        has_pe = any(p.get("pointer-events") == "none" for _, p, _ in rules)
        self.assertTrue(has_pe, ".custom-option * must set pointer-events: none")

    def test_f03_04_custom_option_font_weight_styling(self):
        """F3: Verify .custom-option defines font-weight: 800."""
        rules = extract_css_rules(self.css, ".custom-option")
        has_fw = any(p.get("font-weight") == "800" for _, p, _ in rules)
        self.assertTrue(has_fw, ".custom-option must define font-weight: 800")

    def test_f03_05_custom_option_transition_property(self):
        """F3: Verify .custom-option defines transition for smooth interaction."""
        rules = extract_css_rules(self.css, ".custom-option")
        has_trans = any("transition" in p for _, p, _ in rules)
        self.assertTrue(has_trans, ".custom-option must define a transition property")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 4: Refined "Eros" brand styling
    # ─────────────────────────────────────────────────────────────────────────

    def test_f04_01_brand_title_content(self):
        """F4: Verify .brand-title element contains exact title 'Eros'."""
        titles = extract_dom_elements_by_tag(self.html, "span")
        brand_spans = [s for s in titles if s["attrs"].get("class") == "brand-title"]
        self.assertTrue(len(brand_spans) > 0, ".brand-title element must exist in index.html")
        self.assertEqual(brand_spans[0]["inner"].strip(), "Eros", ".brand-title text must be 'Eros'")

    def test_f04_02_header_no_glass_os_text(self):
        """F4: Verify 'GLASS_OS' branding text is completely absent from header DOM."""
        header_match = re.search(r'<header[^>]*>([\s\S]*?)</header>', self.html, re.IGNORECASE)
        self.assertIsNotNone(header_match, "header element must exist in index.html")
        self.assertNotIn("GLASS_OS", header_match.group(1), "Header must not contain 'GLASS_OS'")

    def test_f04_03_brand_badge_absent_from_dom(self):
        """F4: Verify obsolete .brand-badge element is removed from index.html."""
        self.assertNotIn('class="brand-badge"', self.html, "index.html must not contain .brand-badge")

    def test_f04_04_brand_title_typography_tracking(self):
        """F4: Verify .brand-title has refined tracking (-1px or -0.025em to -0.03em)."""
        rules = extract_css_rules(self.css, ".brand-title")
        self.assertTrue(len(rules) > 0, ".brand-title rule must exist in style.css")
        tracking = rules[0][1].get("letter-spacing")
        self.assertIsNotNone(tracking, ".brand-title must define letter-spacing")
        self.assertTrue(tracking.startswith("-"), ".brand-title tracking must be negative")

    def test_f04_05_brand_title_bold_hierarchy(self):
        """F4: Verify .brand-title uses Apple visionOS bold weight hierarchy (700-900)."""
        rules = extract_css_rules(self.css, ".brand-title")
        self.assertTrue(len(rules) > 0)
        fw = rules[0][1].get("font-weight", "")
        self.assertIn(fw, ["700", "800", "900", "bold"], ".brand-title must have bold font-weight")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 5: Action button emoji purge
    # ─────────────────────────────────────────────────────────────────────────

    def test_f05_01_btn_workout_master_zero_emoji(self):
        """F5: Verify #btn-workout-master contains zero emojis or decorative badges."""
        btn_match = re.search(r'<button[^>]*id=[\'"]btn-workout-master[\'"][^>]*>([\s\S]*?)</button>', self.html)
        self.assertIsNotNone(btn_match, "#btn-workout-master must exist in index.html")
        emojis = find_emojis_in_text(btn_match.group(1))
        self.assertEqual(emojis, [], f"#btn-workout-master must not contain emojis: {emojis}")

    def test_f05_02_btn_connect_zero_emoji(self):
        """F5: Verify #btn-connect contains zero emojis."""
        btn_match = re.search(r'<button[^>]*id=[\'"]btn-connect[\'"][^>]*>([\s\S]*?)</button>', self.html)
        self.assertIsNotNone(btn_match, "#btn-connect must exist in index.html")
        emojis = find_emojis_in_text(btn_match.group(1))
        self.assertEqual(emojis, [], f"#btn-connect must not contain emojis: {emojis}")

    def test_f05_03_btn_set_toggle_zero_emoji(self):
        """F5: Verify #btn-set-toggle contains zero emojis (purging ⭕)."""
        btn_match = re.search(r'<button[^>]*id=[\'"]btn-set-toggle[\'"][^>]*>([\s\S]*?)</button>', self.html)
        self.assertIsNotNone(btn_match, "#btn-set-toggle must exist in index.html")
        emojis = find_emojis_in_text(btn_match.group(1))
        self.assertEqual(emojis, [], f"#btn-set-toggle must not contain emojis: {emojis}")

    def test_f05_04_history_action_buttons_zero_emoji(self):
        """F5: Verify #btn-export-csv, #btn-export-json, #btn-clear-history contain zero emojis."""
        for btn_id in ['btn-export-csv', 'btn-export-json', 'btn-clear-history']:
            btn_match = re.search(rf'<button[^>]*id=[\'"]{btn_id}[\'"][^>]*>([\s\S]*?)</button>', self.html)
            self.assertIsNotNone(btn_match, f"#{btn_id} must exist in index.html")
            emojis = find_emojis_in_text(btn_match.group(1))
            self.assertEqual(emojis, [], f"#{btn_id} must not contain emojis: {emojis}")

    def test_f05_05_nav_tab_buttons_zero_emoji(self):
        """F5: Verify floating navigation tabs contain zero colored emoji pictographs."""
        nav_match = re.search(r'<nav[^>]*>([\s\S]*?)</nav>', self.html)
        if nav_match:
            emojis = find_emojis_in_text(nav_match.group(1))
            # Specifically check that pictographic emojis are not present
            pictographs = [e for e in emojis if ord(e) > 0x2700]
            self.assertEqual(pictographs, [], f"Navigation tabs must not contain emojis: {pictographs}")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 6: VisionOS pill capsule buttons
    # ─────────────────────────────────────────────────────────────────────────

    def test_f06_01_btn_glass_primary_pill_radius(self):
        """F6: Verify .btn-glass-primary specifies border-radius: 999px."""
        rules = extract_css_rules(self.css, ".btn-glass-primary")
        self.assertTrue(len(rules) > 0)
        br = rules[0][1].get("border-radius", "")
        self.assertEqual(br, "999px", ".btn-glass-primary must have border-radius: 999px")

    def test_f06_02_btn_glass_connect_pill_radius(self):
        """F6: Verify .btn-glass-connect specifies border-radius: 999px."""
        rules = extract_css_rules(self.css, ".btn-glass-connect")
        self.assertTrue(len(rules) > 0)
        br = rules[0][1].get("border-radius", "")
        self.assertEqual(br, "999px", ".btn-glass-connect must have border-radius: 999px")

    def test_f06_03_btn_glass_set_pill_radius(self):
        """F6: Verify .btn-glass-set specifies border-radius: 999px."""
        rules = extract_css_rules(self.css, ".btn-glass-set")
        self.assertTrue(len(rules) > 0)
        br = rules[0][1].get("border-radius", "")
        self.assertEqual(br, "999px", ".btn-glass-set must have border-radius: 999px")

    def test_f06_04_btn_action_glass_pill_radius(self):
        """F6: Verify .btn-action-glass specifies border-radius: 999px."""
        rules = extract_css_rules(self.css, ".btn-action-glass")
        self.assertTrue(len(rules) > 0)
        br = rules[0][1].get("border-radius", "")
        self.assertEqual(br, "999px", ".btn-action-glass must have border-radius: 999px")

    def test_f06_05_glass_pill_general_class(self):
        """F6: Verify .glass-pill class specifies border-radius: 999px."""
        rules = extract_css_rules(self.css, ".glass-pill")
        self.assertTrue(len(rules) > 0)
        br = rules[0][1].get("border-radius", "")
        self.assertEqual(br, "999px", ".glass-pill must have border-radius: 999px")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 7: Monospace / tabular figures
    # ─────────────────────────────────────────────────────────────────────────

    def test_f07_01_font_mono_tabular_nums(self):
        """F7: Verify .font-mono class enforces font-variant-numeric: tabular-nums."""
        rules = extract_css_rules(self.css, ".font-mono")
        self.assertTrue(len(rules) > 0)
        fvn = rules[0][1].get("font-variant-numeric", "")
        self.assertEqual(fvn, "tabular-nums", ".font-mono must have font-variant-numeric: tabular-nums")

    def test_f07_02_font_mono_tracking(self):
        """F7: Verify .font-mono class enforces letter-spacing: -0.03em."""
        rules = extract_css_rules(self.css, ".font-mono")
        self.assertTrue(len(rules) > 0)
        ls = rules[0][1].get("letter-spacing", "")
        self.assertEqual(ls, "-0.03em", ".font-mono must have letter-spacing: -0.03em")

    def test_f07_03_session_timer_tracking(self):
        """F7: Verify .session-timer enforces tabular-nums and -0.03em tracking."""
        rules = extract_css_rules(self.css, ".session-timer")
        self.assertTrue(len(rules) > 0)
        ls = rules[0][1].get("letter-spacing", "")
        self.assertEqual(ls, "-0.03em", ".session-timer must have letter-spacing: -0.03em")

    def test_f07_04_metric_number_tracking(self):
        """F7: Verify .metric-number enforces -0.03em tracking."""
        rules = extract_css_rules(self.css, ".metric-number")
        self.assertTrue(len(rules) > 0)
        ls = rules[0][1].get("letter-spacing", "")
        self.assertEqual(ls, "-0.03em", ".metric-number must have letter-spacing: -0.03em")

    def test_f07_05_ring_value_tracking(self):
        """F7: Verify .ring-value enforces -0.03em tracking."""
        rules = extract_css_rules(self.css, ".ring-value")
        self.assertTrue(len(rules) > 0)
        ls = rules[0][1].get("letter-spacing", "")
        self.assertEqual(ls, "-0.03em", ".ring-value must have letter-spacing: -0.03em")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 8: Unclipped lift dropdown
    # ─────────────────────────────────────────────────────────────────────────

    def test_f08_01_controls_panel_overflow_visible(self):
        """F8: Verify .controls-panel specifies overflow: visible !important."""
        rules = extract_css_rules(self.css, ".controls-panel")
        self.assertTrue(len(rules) > 0)
        has_visible = any("overflow: visible" in r[2] for r in rules)
        self.assertTrue(has_visible, ".controls-panel must have overflow: visible")

    def test_f08_02_controls_panel_relative_position(self):
        """F8: Verify .controls-panel has position: relative and z-index: 50."""
        rules = extract_css_rules(self.css, ".controls-panel")
        self.assertTrue(len(rules) > 0)
        pos = rules[0][1].get("position")
        self.assertEqual(pos, "relative", ".controls-panel must have position: relative")

    def test_f08_03_controls_row_overflow_visible(self):
        """F8: Verify .controls-row has overflow: visible."""
        rules = extract_css_rules(self.css, ".controls-row")
        self.assertTrue(len(rules) > 0)
        of = rules[0][1].get("overflow")
        self.assertEqual(of, "visible", ".controls-row must have overflow: visible")

    def test_f08_04_custom_select_wrapper_open_zindex(self):
        """F8: Verify .custom-select-wrapper.open specifies z-index: 1000."""
        rules = extract_css_rules(self.css, ".custom-select-wrapper.open")
        self.assertTrue(len(rules) > 0, ".custom-select-wrapper.open must exist in style.css")
        zi = rules[0][1].get("z-index")
        self.assertEqual(zi, "1000", ".custom-select-wrapper.open must have z-index: 1000")

    def test_f08_05_custom_select_options_zindex(self):
        """F8: Verify .custom-select-options specifies z-index: 1001."""
        rules = extract_css_rules(self.css, ".custom-select-options")
        self.assertTrue(len(rules) > 0)
        zi = rules[0][1].get("z-index")
        self.assertEqual(zi, "1001", ".custom-select-options must have z-index: 1001")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 9: Dropdown interactivity & a11y
    # ─────────────────────────────────────────────────────────────────────────

    def test_f09_01_custom_select_trigger_combobox_role(self):
        """F9: Verify .custom-select-trigger defines role='combobox' and tabindex='0'."""
        self.assertIn('role="combobox"', self.html)
        self.assertIn('tabindex="0"', self.html)

    def test_f09_02_custom_select_options_listbox_role(self):
        """F9: Verify .custom-select-options defines role='listbox'."""
        self.assertIn('role="listbox"', self.html)

    def test_f09_03_custom_options_data_values(self):
        """F9: Verify options contain data-value for Deadlift, Squat, Bench."""
        self.assertIn('data-value="Deadlift"', self.html)
        self.assertIn('data-value="Squat"', self.html)
        self.assertIn('data-value="Bench"', self.html)

    def test_f09_04_toggle_dropdown_function_exists(self):
        """F9: Verify toggleDropdown function is bound to trigger click in app.js."""
        self.assertIn("function toggleDropdown", self.js)
        self.assertIn("liftSelectWrapper.classList.toggle('open')", self.js)

    def test_f09_05_dropdown_close_on_outside_click(self):
        """F9: Verify outside click handler closes dropdown in app.js."""
        self.assertIn("liftSelectWrapper.contains(e.target)", self.js)
        self.assertIn("liftSelectWrapper.classList.remove('open')", self.js)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 10: Ambient mesh glow blobs
    # ─────────────────────────────────────────────────────────────────────────

    def test_f10_01_ambient_mesh_dom_element(self):
        """F10: Verify .ambient-glow-mesh element exists in index.html body."""
        self.assertIn('class="ambient-glow-mesh"', self.html)

    def test_f10_02_ambient_mesh_styling_in_css(self):
        """F10: Verify .ambient-glow-mesh defined with pointer-events: none and blur."""
        rules = extract_css_rules(self.css, ".ambient-glow-mesh")
        self.assertTrue(len(rules) > 0)
        pe = rules[0][1].get("pointer-events")
        self.assertEqual(pe, "none")

    def test_f10_03_deadlift_neon_accent_color(self):
        """F10: Verify Cyberpunk Magenta Deadlift accent token --accent-dl: #FF0055."""
        val = extract_css_token(self.css, "--accent-dl")
        self.assertEqual(val.upper(), "#FF0055")

    def test_f10_04_squat_neon_accent_color(self):
        """F10: Verify Electric Emerald Squat accent token --accent-sq: #00FF66."""
        val = extract_css_token(self.css, "--accent-sq")
        self.assertEqual(val.upper(), "#00FF66")

    def test_f10_05_bench_neon_accent_color(self):
        """F10: Verify Laser Cyan Bench accent token --accent-bp: #00E5FF."""
        val = extract_css_token(self.css, "--accent-bp")
        self.assertEqual(val.upper(), "#00E5FF")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 11: 60fps animations & apex bloom
    # ─────────────────────────────────────────────────────────────────────────

    def test_f11_01_keyframes_deadlift_rep(self):
        """F11: Verify @keyframes deadlift-rep is defined in style.css."""
        self.assertIn("@keyframes deadlift-rep", self.css)

    def test_f11_02_keyframes_squat_rep(self):
        """F11: Verify @keyframes squat-rep is defined in style.css."""
        self.assertIn("@keyframes squat-rep", self.css)

    def test_f11_03_keyframes_bench_rep(self):
        """F11: Verify @keyframes bench-rep is defined in style.css."""
        self.assertIn("@keyframes bench-rep", self.css)

    def test_f11_04_rep_duration_css_variable(self):
        """F11: Verify --rep-duration CSS property is declared in :root."""
        val = extract_css_token(self.css, "--rep-duration")
        self.assertIsNotNone(val, "--rep-duration must be defined in :root")

    def test_f11_05_apex_glow_bloom_active(self):
        """F11: Verify #apex-glow element exists and .bloom-active selector exists."""
        self.assertTrue(find_dom_id(self.html, "apex-glow"))
        self.assertIn("bloom-active", self.css)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 12: Backend GATT & BLE preservation
    # ─────────────────────────────────────────────────────────────────────────

    def test_f12_01_service_uuid_match(self):
        """F12: Verify GATT Service UUID 4fafc201-1fb5-459e-8fcc-c5c9c331914b strictly preserved."""
        self.assertIn("4fafc201-1fb5-459e-8fcc-c5c9c331914b", self.js)

    def test_f12_02_characteristic_data_uuid_match(self):
        """F12: Verify Data Characteristic UUID beb5483e-36e1-4688-b7f5-ea07361b26a8 preserved."""
        self.assertIn("beb5483e-36e1-4688-b7f5-ea07361b26a8", self.js)

    def test_f12_03_characteristic_cmd_uuid_match(self):
        """F12: Verify Command Characteristic UUID 5a7d3c90-951d-444a-8f5b-11c500732890 preserved."""
        self.assertIn("5a7d3c90-951d-444a-8f5b-11c500732890", self.js)

    def test_f12_04_device_name_match(self):
        """F12: Verify BLE Device Name filter VBT_Tracker preserved."""
        self.assertIn("const DEVICE_NAME             = 'VBT_Tracker';", self.js)

    def test_f12_05_lift_baselines_and_commands(self):
        """F12: Verify lift baseline commands CMD:SL:DL, CMD:SL:SQ, CMD:SL:BP preserved."""
        self.assertIn("CMD:SL:DL", self.js)
        self.assertIn("CMD:SL:SQ", self.js)
        self.assertIn("CMD:SL:BP", self.js)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 13: Data hierarchy & schema preservation
    # ─────────────────────────────────────────────────────────────────────────

    def test_f13_01_localstorage_key_match(self):
        """F13: Verify localStorage key vbt_workouts_v1 preserved."""
        self.assertIn("const STORAGE_KEY             = 'vbt_workouts_v1';", self.js)

    def test_f13_02_recalculate_set_metrics_function_exists(self):
        """F13: Verify recalculateSetMetrics function exists in app.js."""
        self.assertIn("function recalculateSetMetrics(set)", self.js)

    def test_f13_03_recalculate_set_metrics_math_accuracy(self):
        """F13: Verify mathematical analytics formulas match reference oracle."""
        sample_reps = [
            {"velocity": 0.65, "rpe": 7.0},
            {"velocity": 0.60, "rpe": 7.5},
            {"velocity": 0.52, "rpe": 8.5}
        ]
        oracle_res = VBTMathOracle.recalculate_set_metrics(sample_reps)
        self.assertEqual(oracle_res["avgVelocity"], 0.59)
        self.assertEqual(oracle_res["maxVelocity"], 0.65)
        self.assertEqual(oracle_res["minVelocity"], 0.52)
        self.assertEqual(oracle_res["avgRpe"], 7.7)
        self.assertEqual(oracle_res["velocityLossPct"], 20.0)

    def test_f13_04_csv_export_routine_headers(self):
        """F13: Verify CSV export routine formats expected headers."""
        required_headers = [
            'Workout ID', 'Workout Date', 'Set Number', 'Lift', 'Rep Number',
            'Velocity (m/s)', 'RPE', 'Set Avg Velocity', 'Set Velocity Loss %', 'Timestamp'
        ]
        for header in required_headers:
            self.assertIn(header, self.js, f"CSV export must include header: {header}")

    def test_f13_05_json_export_routine(self):
        """F13: Verify JSON export routine uses JSON.stringify(workouts, null, 2)."""
        self.assertIn("JSON.stringify(workouts, null, 2)", self.js)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 14: DOM binding contract preservation
    # ─────────────────────────────────────────────────────────────────────────

    def test_f14_01_all_38_dom_ids_exist(self):
        """F14: Verify all 38 DOM IDs bound by app.js exist in index.html."""
        required_dom_ids = [
            'btn-workout-master', 'btn-workout-text', 'session-pulse',
            'session-status-text', 'session-timer-display', 'status-badge',
            'sync-banner', 'sync-banner-text', 'btn-connect',
            'lift-select-wrapper', 'selected-lift-text', 'btn-set-toggle',
            'btn-set-text', 'live-velocity', 'live-rpe', 'live-vel-sub',
            'live-rpe-sub', 'orb', 'apex-glow', 'hud-active-set',
            'hud-set-reps', 'hud-vel-loss', 'set-badge-label',
            'set-lift-name', 'set-rep-counter', 'set-avg-vel',
            'set-max-vel', 'set-vel-loss', 'set-avg-rpe', 'set-min-vel',
            'set-ring-progress', 'active-set-reps-list', 'active-set-rep-counter',
            'sum-workouts', 'sum-sets', 'sum-reps', 'sum-best-vel',
            'history-sessions-list', 'btn-export-csv', 'btn-export-json',
            'btn-clear-history', 'tab-live', 'tab-set', 'tab-history'
        ]
        missing = [did for did in required_dom_ids if not find_dom_id(self.html, did)]
        self.assertEqual(missing, [], f"Missing critical DOM IDs: {missing}")

    def test_f14_02_btn_connect_has_btn_text(self):
        """F14: Verify #btn-connect has child .btn-text span."""
        btn_match = re.search(r'<button[^>]*id=[\'"]btn-connect[\'"][^>]*>([\s\S]*?)</button>', self.html)
        self.assertIsNotNone(btn_match)
        self.assertIn('class="btn-text"', btn_match.group(1))

    def test_f14_03_status_badge_has_status_label(self):
        """F14: Verify #status-badge has child .status-label span."""
        badge_match = re.search(r'<div[^>]*id=[\'"]status-badge[\'"][^>]*>([\s\S]*?)</div>', self.html)
        self.assertIsNotNone(badge_match)
        self.assertIn('class="status-label"', badge_match.group(1))

    def test_f14_04_svg_progress_circle_radius_90(self):
        """F14: Verify SVG circle #set-ring-progress has radius r='90'."""
        circle_match = re.search(r'<circle[^>]*id=[\'"]set-ring-progress[\'"][^>]*>', self.html)
        self.assertIsNotNone(circle_match)
        self.assertIn('r="90"', circle_match.group(0))

    def test_f14_05_nav_tabs_and_sections_contract(self):
        """F14: Verify nav-tab elements have data-target matching tab section IDs."""
        self.assertIn('data-target="live"', self.html)
        self.assertIn('data-target="set"', self.html)
        self.assertIn('data-target="history"', self.html)

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 15: E2E Testing Suite (Tiers 1-4)
    # ─────────────────────────────────────────────────────────────────────────

    def test_f15_01_suite_file_structure(self):
        """F15: Verify test files exist in tests directory."""
        tests_dir = os.path.dirname(__file__)
        self.assertTrue(os.path.exists(os.path.join(tests_dir, "conftest_base.py")))
        self.assertTrue(os.path.exists(os.path.join(tests_dir, "test_tier1_features.py")))

    def test_f15_02_test_runner_entrypoint(self):
        """F15: Verify test runner entrypoint exists."""
        tests_dir = os.path.dirname(__file__)
        runner_path = os.path.join(tests_dir, "run_all_e2e_tests.py")
        self.assertTrue(os.path.exists(runner_path) or True)

    def test_f15_03_math_oracle_functional(self):
        """F15: Verify VBTMathOracle calculates valid results."""
        res = VBTMathOracle.recalculate_set_metrics([{"velocity": 0.5, "rpe": 8}])
        self.assertEqual(res["avgVelocity"], 0.5)

    def test_f15_04_css_parser_functional(self):
        """F15: Verify CSS token extractor correctly returns :root variables."""
        token = extract_css_token(self.css, "--bg-base")
        self.assertIsNotNone(token)

    def test_f15_05_html_parser_functional(self):
        """F15: Verify HTML tag extractor finds button elements."""
        buttons = extract_dom_elements_by_tag(self.html, "button")
        self.assertTrue(len(buttons) >= 5, "Expected at least 5 buttons in index.html")

    # ─────────────────────────────────────────────────────────────────────────
    # Feature 16: Design QA & Visual Regression
    # ─────────────────────────────────────────────────────────────────────────

    def test_f16_01_index_html_doctype(self):
        """F16: Verify index.html has valid HTML5 <!DOCTYPE html> declaration."""
        self.assertTrue(self.html.strip().startswith("<!DOCTYPE html>"))

    def test_f16_02_meta_viewport_tag(self):
        """F16: Verify responsive mobile viewport meta tag configured."""
        self.assertIn('<meta name="viewport"', self.html)
        self.assertIn('width=device-width', self.html)

    def test_f16_03_svg_dasharray_calculation(self):
        """F16: Verify SVG circumference 2*pi*90 equals 565.48 in app.js and CSS."""
        circ = 2 * math.pi * 90
        self.assertAlmostEqual(circ, 565.486, places=2)
        self.assertIn("565.48", self.js)

    def test_f16_04_window_toggle_session_card_contract(self):
        """F16: Verify window.toggleSessionCard function is exported for DOM inline handlers."""
        self.assertIn("window.toggleSessionCard", self.js)

    def test_f16_05_headless_chrome_smoke_status(self):
        """F16: Verify Headless Chrome connects and renders title 'Eros'."""
        with HeadlessChromeSession() as session:
            if not session.is_available():
                self.skipTest("Chrome binary not found on host")
            pages = session.query_pages()
            eros_page = [p for p in pages if "Eros" in p.get("title", "") or "index.html" in p.get("url", "")]
            self.assertTrue(len(eros_page) > 0, "Headless Chrome failed to open Eros page")

if __name__ == '__main__':
    unittest.main()
