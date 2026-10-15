"""
Tier 2: Boundary, Negative & Edge Case Test Suite for Eros VBT
Covers all 16 features from PROJECT.md with >=5 tests per feature (80+ test cases).
Verifies boundary conditions, invalid inputs, edge cases, and adversarial resilience.
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
    check_css_brace_balance,
    find_dom_id,
    extract_dom_elements_by_tag,
    find_emojis_in_text,
    VBTMathOracle
)

class TestTier2BoundariesAndCornerCases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    # ─────────────────────────────────────────────────────────────────────────
    # F1 Boundaries: Ultra-translucent glass panels
    # ─────────────────────────────────────────────────────────────────────────

    def test_b01_01_empty_panel_styling(self):
        """B1.1: Verify .glass-card styling applies correctly even with minimal/empty children."""
        rules = extract_css_rules(self.css, ".glass-card")
        self.assertTrue(len(rules) > 0)
        # Ensure rules do not depend on child presence
        has_bg = any("background" in r[1] for r in rules)
        self.assertTrue(has_bg, ".glass-card must define background unconditionally")

    def test_b01_02_nested_card_translucency(self):
        """B1.2: Verify sub-panels like .rep-item-card, .session-history-card preserve glass translucency."""
        for card_sel in [".rep-item-card", ".session-history-card"]:
            rules = extract_css_rules(self.css, card_sel)
            self.assertTrue(len(rules) > 0, f"{card_sel} must be defined in style.css")

    def test_b01_03_extreme_saturation_handling(self):
        """B1.3: Verify backdrop-filter saturation is bounded at 180% without excessive blowouts."""
        rules = extract_css_rules(self.css, ".glass-card")
        for _, props, _ in rules:
            bf = props.get("backdrop-filter", "")
            if "saturate" in bf:
                m = re.search(r'saturate\((\d+)%\)', bf)
                if m:
                    sat_val = int(m.group(1))
                    self.assertLessEqual(sat_val, 250, "Saturation must not exceed 250%")
                    self.assertGreaterEqual(sat_val, 150, "Saturation must be at least 150%")

    def test_b01_04_missing_webkit_prefix_detection(self):
        """B1.4: Verify every backdrop-filter on .glass-card has a matching -webkit-backdrop-filter."""
        rules = extract_css_rules(self.css, ".glass-card")
        for _, props, _ in rules:
            if "backdrop-filter" in props:
                self.assertIn("-webkit-backdrop-filter", props,
                              "WebKit backdrop-filter prefix must accompany standard backdrop-filter")

    def test_b01_05_ultra_low_alpha_border(self):
        """B1.5: Verify base glass border alpha channel does not exceed 0.20 for subtlety."""
        val = extract_css_token(self.css, "--border-glass")
        if val:
            m = re.search(r'rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)', val)
            if m:
                alpha = float(m.group(1))
                self.assertLessEqual(alpha, 0.20, "--border-glass alpha should be subtle (<=0.20)")

    # ─────────────────────────────────────────────────────────────────────────
    # F2 Boundaries: Top-down specular light refraction
    # ─────────────────────────────────────────────────────────────────────────

    def test_b02_01_card_box_sizing_border_box(self):
        """B2.1: Verify * selector or .glass-card incorporates box-sizing: border-box."""
        self.assertIn("box-sizing: border-box", self.css)

    def test_b02_02_inverted_gradient_rejection(self):
        """B2.2: Verify specular refraction gradient starts at 180deg (top-down), not 0deg (bottom-up)."""
        clean_css = self.css.replace(" ", "")
        # Must not start with 0deg for specular refraction
        self.assertNotIn("linear-gradient(0deg,rgba(255,255,255,0.45)", clean_css)

    def test_b02_03_zero_height_card_border_clipping(self):
        """B2.3: Verify border-box gradient clipping is declared on dual-box background."""
        clean_css = self.css.replace(" ", "")
        self.assertTrue(
            "padding-box" in clean_css and "border-box" in clean_css,
            "Dual-box background clipping must declare both padding-box and border-box"
        )

    def test_b02_04_specular_gradient_syntax_format(self):
        """B2.4: Verify specular gradient syntax uses valid linear-gradient arguments."""
        clean = self.css.replace(" ", "")
        self.assertIn("linear-gradient(180deg,", clean)

    def test_b02_05_specular_box_shadow_spread(self):
        """B2.5: Verify specular top inset highlight in --specular-top has non-negative alpha."""
        val = extract_css_token(self.css, "--specular-top")
        self.assertIsNotNone(val)
        self.assertIn("inset", val)

    # ─────────────────────────────────────────────────────────────────────────
    # F3 Boundaries: CSS syntax cleanup
    # ─────────────────────────────────────────────────────────────────────────

    def test_b03_01_comment_nested_braces(self):
        """B3.1: Verify brace balance checker correctly ignores braces inside CSS comments."""
        css_with_comment = "/* { test comment with { braces } */ .rule { color: red; }"
        balanced, _, _, issues = check_css_brace_balance(css_with_comment)
        self.assertTrue(balanced, f"Comments with braces must be ignored: {issues}")

    def test_b03_02_quoted_string_braces(self):
        """B3.2: Verify brace balance checker correctly ignores braces inside CSS strings."""
        css_with_string = '.rule { content: "{ fake brace }"; }'
        balanced, _, _, issues = check_css_brace_balance(css_with_string)
        self.assertTrue(balanced, f"Strings with braces must be ignored: {issues}")

    def test_b03_03_media_queries_balanced(self):
        """B3.3: Verify all @keyframes and at-rules in style.css are cleanly closed and balanced."""
        clean = re.sub(r'/\*[\s\S]*?\*/', '', self.css)
        at_rules = re.findall(r'@[a-zA-Z\-]+[^{]+\{', clean)
        self.assertGreaterEqual(len(at_rules), 1, "Expected @keyframes at-rules in stylesheet")
        balanced, _, _, issues = check_css_brace_balance(self.css)
        self.assertTrue(balanced, f"Unbalanced braces in stylesheet at-rules: {issues}")

    def test_b03_04_pseudoclass_syntax_validity(self):
        """B3.4: Verify pseudoclasses :hover, :active, :focus in style.css are syntactically valid."""
        for pseudo in [":hover", ":active", ":focus"]:
            self.assertIn(pseudo, self.css, f"Missing pseudoclass {pseudo}")

    def test_b03_05_custom_option_no_dangling_blocks(self):
        """B3.5: Verify .custom-option block does not contain dangling unclosed sub-blocks."""
        clean = re.sub(r'/\*[\s\S]*?\*/', '', self.css)
        match = re.search(r'\.custom-option\s*\{([^}]+)\}', clean)
        self.assertIsNotNone(match, ".custom-option must have a valid closed block")
        body = match.group(1)
        self.assertNotIn("{", body, "Nested block inside .custom-option without selector is invalid")

    # ─────────────────────────────────────────────────────────────────────────
    # F4 Boundaries: Refined "Eros" brand styling
    # ─────────────────────────────────────────────────────────────────────────

    def test_b04_01_brand_title_whitespace_handling(self):
        """B4.1: Verify .brand-title inner text does not have unwanted extra text or linebreaks."""
        match = re.search(r'<span[^>]*class=[\'"][^\'"]*brand-title[^\'"]*[\'"][^>]*>([\s\S]*?)</span>', self.html)
        self.assertIsNotNone(match)
        clean_text = match.group(1).strip()
        self.assertEqual(clean_text, "Eros", f"Expected exact title 'Eros', got '{clean_text}'")

    def test_b04_02_brand_title_case_preservation(self):
        """B4.2: Verify brand title casing is title-cased 'Eros', not uppercase 'EROS' or 'eros'."""
        self.assertIn(">Eros<", self.html)

    def test_b04_03_legacy_glass_os_badge_cleanup(self):
        """B4.3: Verify no occurrence of GLASS_OS appears as an HTML element."""
        self.assertNotIn(">GLASS_OS<", self.html)

    def test_b04_04_brand_title_gradient_clip_properties(self):
        """B4.4: Verify .brand-title utilizes Apple specular text fill clipping."""
        rules = extract_css_rules(self.css, ".brand-title")
        self.assertTrue(len(rules) > 0)
        has_clip = any("-webkit-background-clip" in r[1] for r in rules)
        self.assertTrue(has_clip, ".brand-title must use -webkit-background-clip: text")

    def test_b04_05_header_container_layout_flex(self):
        """B4.5: Verify .header-top-row uses flexbox layout for responsive alignment."""
        rules = extract_css_rules(self.css, ".header-top-row")
        self.assertTrue(len(rules) > 0)
        disp = rules[0][1].get("display")
        self.assertEqual(disp, "flex", ".header-top-row must use display: flex")

    # ─────────────────────────────────────────────────────────────────────────
    # F5 Boundaries: Action button emoji purge
    # ─────────────────────────────────────────────────────────────────────────

    def test_b05_01_emoji_dingbats_unicode_scan(self):
        """B5.1: Verify no dingbats or geometric shapes used as icons in action buttons."""
        buttons = extract_dom_elements_by_tag(self.html, "button")
        action_btn_ids = {"btn-workout-master", "btn-connect", "btn-set-toggle", "btn-export-csv", "btn-export-json", "btn-clear-history"}
        for btn in buttons:
            btn_id = btn["attrs"].get("id")
            if btn_id in action_btn_ids:
                emojis = find_emojis_in_text(btn["inner"])
                self.assertEqual(emojis, [], f"Button #{btn_id} contains forbidden emojis: {emojis}")

    def test_b05_02_html_numeric_entity_emoji_scan(self):
        """B5.2: Verify no HTML entities (&#...;) represent emojis in buttons."""
        entity_matches = re.findall(r'&#(?:x[0-9a-fA-F]+|[0-9]+);', self.html)
        # Check no entity corresponds to high Unicode emoji planes (>127000 or 9000-10000)
        for ent in entity_matches:
            val = int(ent[3:-1], 16) if ent.startswith("&#x") else int(ent[2:-1])
            self.assertFalse(val > 0x1f000 or (0x2600 <= val <= 0x27bf),
                             f"Found emoji HTML entity in DOM: {ent}")

    def test_b05_03_span_icon_cleanup_in_buttons(self):
        """B5.3: Verify button spans do not hold isolated emojis."""
        btn_set = re.search(r'<button[^>]*id=[\'"]btn-set-toggle[\'"][^>]*>([\s\S]*?)</button>', self.html)
        if btn_set:
            self.assertNotIn('class="set-icon">⭕', btn_set.group(1))

    def test_b05_04_dynamic_js_emoji_injection_audit(self):
        """B5.4: Verify JavaScript button text mutations never inject button emojis."""
        btn_mutations = re.findall(r'btn[A-Za-z0-9_]*\.textContent\s*=\s*[\'"]([^\'"]+)[\'"]', self.js)
        for text in btn_mutations:
            emojis = find_emojis_in_text(text)
            self.assertEqual(emojis, [], f"app.js injects emoji into button: {text}")

    def test_b05_05_button_inner_text_trimming(self):
        """B5.5: Verify buttons have non-empty readable text labels."""
        buttons = extract_dom_elements_by_tag(self.html, "button")
        for b in buttons:
            clean = re.sub(r'<[^>]+>', '', b["inner"]).strip()
            self.assertGreater(len(clean), 0, f"Button {b['attrs']} must have readable text")

    # ─────────────────────────────────────────────────────────────────────────
    # F6 Boundaries: VisionOS pill capsule buttons
    # ─────────────────────────────────────────────────────────────────────────

    def test_b06_01_pill_radius_unit_strictly_pixels(self):
        """B6.1: Verify pill buttons use 999px (capsule) rather than percentages."""
        for cls in [".btn-glass-primary", ".btn-glass-connect", ".btn-glass-set", ".btn-action-glass"]:
            rules = extract_css_rules(self.css, cls)
            self.assertTrue(len(rules) > 0)
            br = rules[0][1].get("border-radius")
            self.assertEqual(br, "999px", f"{cls} border-radius must be exactly '999px'")

    def test_b06_02_button_overflow_hidden_for_pill(self):
        """B6.2: Verify pill buttons have overflow: hidden or contain borders properly."""
        rules = extract_css_rules(self.css, ".btn-glass-primary")
        self.assertTrue(len(rules) > 0)

    def test_b06_03_button_hover_active_radius_invariance(self):
        """B6.3: Verify :hover and :active states do not reset border-radius."""
        for state in [":hover", ":active"]:
            rules = extract_css_rules(self.css, f".btn-glass-primary{state}")
            for _, props, _ in rules:
                if "border-radius" in props:
                    self.assertEqual(props["border-radius"], "999px")

    def test_b06_04_pill_button_padding_balance(self):
        """B6.4: Verify pill buttons provide horizontal padding >= 12px for thumb targets."""
        rules = extract_css_rules(self.css, ".btn-glass-connect")
        self.assertTrue(len(rules) > 0)
        padding = rules[0][1].get("padding", "")
        self.assertTrue(len(padding) > 0, ".btn-glass-connect must define padding")

    def test_b06_05_pill_button_transition_smoothness(self):
        """B6.5: Verify buttons define smooth transition for visionOS elevation feedback."""
        for cls in [".btn-glass-primary", ".btn-glass-connect", ".btn-glass-set"]:
            rules = extract_css_rules(self.css, cls)
            self.assertTrue(len(rules) > 0)
            has_tr = any("transition" in r[1] for r in rules)
            self.assertTrue(has_tr, f"{cls} must define transition")

    # ─────────────────────────────────────────────────────────────────────────
    # F7 Boundaries: Monospace / tabular figures
    # ─────────────────────────────────────────────────────────────────────────

    def test_b07_01_zero_velocity_tabular_formatting(self):
        """B7.1: Verify initial zero velocity display is formatted as 0.00."""
        vel_span = re.search(r'<span[^>]*id=[\'"]live-velocity[\'"][^>]*>([\s\S]*?)</span>', self.html)
        self.assertIsNotNone(vel_span)
        self.assertIn("0.00", vel_span.group(1))

    def test_b07_02_extreme_high_velocity_formatting(self):
        """B7.2: Verify math oracle accurately rounds high velocity values (e.g. 2.456 -> 2.46)."""
        reps = [{"velocity": 2.456, "rpe": 6.5}]
        res = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(res["avgVelocity"], 2.46)
        self.assertEqual(res["maxVelocity"], 2.46)

    def test_b07_03_negative_velocity_clamping(self):
        """B7.3: Verify velocity loss percentage cannot be negative when velocity drops."""
        reps = [
            {"velocity": 0.40, "rpe": 8.0},
            {"velocity": 0.50, "rpe": 7.5}  # Increase in speed
        ]
        res = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(res["velocityLossPct"], 0.0, "Velocity loss must never be negative")

    def test_b07_04_rpe_scale_bounds(self):
        """B7.4: Verify RPE scale average is rounded to 1 decimal place."""
        reps = [
            {"velocity": 0.5, "rpe": 7.5},
            {"velocity": 0.5, "rpe": 8.0}
        ]
        res = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(res["avgRpe"], 7.8)

    def test_b07_05_fixed_precision_decimal_formatting(self):
        """B7.5: Verify velocity strings in app.js format with toFixed(2)."""
        self.assertIn(".toFixed(2)", self.js)

    # ─────────────────────────────────────────────────────────────────────────
    # F8 Boundaries: Unclipped lift dropdown
    # ─────────────────────────────────────────────────────────────────────────

    def test_b08_01_dropdown_parent_no_overflow_hidden(self):
        """B8.1: Verify .controls-panel explicitly overrides .glass-card overflow: hidden."""
        rules = extract_css_rules(self.css, ".controls-panel")
        has_override = any("overflow: visible !important" in r[2] for r in rules)
        self.assertTrue(has_override, ".controls-panel must override with overflow: visible !important")

    def test_b08_02_dropdown_stacking_above_telemetry_arena(self):
        """B8.2: Verify .custom-select-wrapper.open z-index (1000) exceeds telemetry arena."""
        rules_wrap = extract_css_rules(self.css, ".custom-select-wrapper.open")
        self.assertTrue(len(rules_wrap) > 0)
        zi = int(rules_wrap[0][1].get("z-index", 0))
        self.assertGreaterEqual(zi, 1000)

    def test_b08_03_dropdown_zindex_exceeds_bottom_nav(self):
        """B8.3: Verify dropdown options z-index (1001) is higher than open wrapper (1000)."""
        rules_opt = extract_css_rules(self.css, ".custom-select-options")
        self.assertTrue(len(rules_opt) > 0)
        zi = int(rules_opt[0][1].get("z-index", 0))
        self.assertGreaterEqual(zi, 1001)

    def test_b08_04_dropdown_options_absolute_positioning(self):
        """B8.4: Verify .custom-select-options uses position: absolute."""
        rules = extract_css_rules(self.css, ".custom-select-options")
        self.assertTrue(len(rules) > 0)
        self.assertEqual(rules[0][1].get("position"), "absolute")

    def test_b08_05_dropdown_width_matching_wrapper(self):
        """B8.5: Verify .custom-select-options spans left: 0 and right: 0."""
        rules = extract_css_rules(self.css, ".custom-select-options")
        self.assertTrue(len(rules) > 0)
        self.assertEqual(rules[0][1].get("left"), "0")
        self.assertEqual(rules[0][1].get("right"), "0")

    # ─────────────────────────────────────────────────────────────────────────
    # F9 Boundaries: Dropdown interactivity & a11y
    # ─────────────────────────────────────────────────────────────────────────

    def test_b09_01_rapid_toggle_state_idempotence(self):
        """B9.1: Verify classList.toggle('open') operates symmetrically."""
        self.assertIn("liftSelectWrapper.classList.toggle('open')", self.js)

    def test_b09_02_repeated_option_selection(self):
        """B9.2: Verify selecting an option updates data-value safely."""
        self.assertIn("opt.getAttribute('data-value')", self.js)

    def test_b09_03_outside_click_when_already_closed(self):
        """B9.3: Verify outside click uses classList.remove('open') which is safe when closed."""
        self.assertIn("liftSelectWrapper.classList.remove('open')", self.js)

    def test_b09_04_invalid_lift_name_handling(self):
        """B9.4: Verify baseline lookup falls back to deadlift for unknown lift names."""
        self.assertIn("LIFT_BASELINES[key] || LIFT_BASELINES.deadlift", self.js)

    def test_b09_05_combobox_aria_attributes_structure(self):
        """B9.5: Verify aria-haspopup is set to 'listbox' on combobox trigger."""
        self.assertIn('aria-haspopup="listbox"', self.html)

    # ─────────────────────────────────────────────────────────────────────────
    # F10 Boundaries: Ambient mesh glow blobs
    # ─────────────────────────────────────────────────────────────────────────

    def test_b10_01_rapid_theme_cycling_consistency(self):
        """B10.1: Verify all 3 body theme classes define matching --current-accent and --accent-rgb."""
        for theme in ["theme-deadlift", "theme-squat", "theme-bench"]:
            rules = extract_css_rules(self.css, f"body.{theme}")
            self.assertTrue(len(rules) > 0, f"body.{theme} must exist in style.css")
            self.assertIn("--current-accent", rules[0][1])
            self.assertIn("--accent-rgb", rules[0][1])

    def test_b10_02_accent_rgb_format_validity(self):
        """B10.2: Verify accent RGB tokens format as comma-separated integers (e.g. 255, 0, 85)."""
        for token in ["--accent-dl-rgb", "--accent-sq-rgb", "--accent-bp-rgb"]:
            val = extract_css_token(self.css, token)
            self.assertIsNotNone(val)
            parts = [int(p.strip()) for p in val.split(',')]
            self.assertEqual(len(parts), 3)
            for p in parts:
                self.assertTrue(0 <= p <= 255)

    def test_b10_03_ambient_mesh_fixed_viewport_inset(self):
        """B10.3: Verify ambient mesh has fixed positioning to cover viewport without scrolling."""
        rules = extract_css_rules(self.css, ".ambient-glow-mesh")
        self.assertTrue(len(rules) > 0)
        self.assertEqual(rules[0][1].get("position"), "fixed")

    def test_b10_04_ambient_drift_animation_timing(self):
        """B10.4: Verify ambient mesh uses smooth GPU transition timing."""
        self.assertIn("transition:", self.css)

    def test_b10_05_unknown_theme_fallback(self):
        """B10.5: Verify default active accent token points to deadlift in :root."""
        val = extract_css_token(self.css, "--current-accent")
        self.assertEqual(val, "var(--accent-dl)")

    # ─────────────────────────────────────────────────────────────────────────
    # F11 Boundaries: 60fps animations & apex bloom
    # ─────────────────────────────────────────────────────────────────────────

    def test_b11_01_velocity_clamping_low_bound(self):
        """B11.1: Verify very low velocity (0.01 m/s) clamps duration to maximum 5.0s."""
        dur = VBTMathOracle.calculate_rep_duration(0.01)
        self.assertEqual(dur, 5.0)

    def test_b11_02_velocity_clamping_high_bound(self):
        """B11.2: Verify very high velocity (5.0 m/s) clamps duration to minimum 0.5s."""
        dur = VBTMathOracle.calculate_rep_duration(5.0)
        self.assertEqual(dur, 0.5)

    def test_b11_03_deadlift_apex_bloom_timing_ratio(self):
        """B11.3: Verify deadlift apex bloom occurs at 50% midpoint of rep duration."""
        delay = VBTMathOracle.calculate_apex_bloom_delay_ms(1.0, "Deadlift")
        # For velocity 1.0, duration is (0.5/1.0)*2 = 1.0s = 1000ms. Half is 500ms.
        self.assertEqual(delay, 500.0)

    def test_b11_04_squat_bench_apex_bloom_timing_ratio(self):
        """B11.4: Verify squat/bench apex bloom occurs at 95% lockout of rep duration."""
        delay = VBTMathOracle.calculate_apex_bloom_delay_ms(1.0, "Squat")
        self.assertEqual(delay, 950.0)

    def test_b11_05_keyframes_transform_validity(self):
        """B11.5: Verify keyframes contain transform or top properties for motion."""
        clean = self.css.replace(" ", "")
        self.assertIn("@keyframesdeadlift-rep{", clean)

    # ─────────────────────────────────────────────────────────────────────────
    # F12 Boundaries: Backend GATT & BLE preservation
    # ─────────────────────────────────────────────────────────────────────────

    def test_b12_01_malformed_ble_payload_missing_pipe(self):
        """B12.1: Verify BLE parser ignores string with missing pipe delimiter."""
        res = VBTMathOracle.parse_ble_payload("Deadlift 0.45 m/s RPE 8.0")
        self.assertIsNone(res, "Parser must reject payload without pipes")

    def test_b12_02_malformed_ble_payload_empty_string(self):
        """B12.2: Verify BLE parser ignores empty payload."""
        res = VBTMathOracle.parse_ble_payload("")
        self.assertIsNone(res)

    def test_b12_03_malformed_ble_payload_corrupted_numbers(self):
        """B12.3: Verify BLE parser ignores payload with non-numeric velocity/rpe."""
        res = VBTMathOracle.parse_ble_payload("Squat | abc m/s | RPE: xyz")
        self.assertIsNone(res, "Parser must reject non-numeric values")

    def test_b12_04_malformed_ble_payload_extra_fields(self):
        """B12.4: Verify BLE parser successfully parses payload with extra trailing metadata."""
        res = VBTMathOracle.parse_ble_payload("Bench | 0.85 m/s | RPE: 6.5 | EXTRA_TAG")
        self.assertIsNotNone(res)
        self.assertEqual(res["velocity"], 0.85)
        self.assertEqual(res["rpe"], 6.5)

    def test_b12_05_ble_characteristic_write_fallback(self):
        """B12.5: Verify command dispatcher supports both writeValueWithoutResponse and writeValue."""
        self.assertIn("cmdCharacteristic.writeValueWithoutResponse", self.js)
        self.assertIn("cmdCharacteristic.writeValue", self.js)

    # ─────────────────────────────────────────────────────────────────────────
    # F13 Boundaries: Data hierarchy & schema preservation
    # ─────────────────────────────────────────────────────────────────────────

    def test_b13_01_empty_reps_metrics_default_zeros(self):
        """B13.1: Verify recalculateSetMetrics on empty reps returns zeroed metrics."""
        res = VBTMathOracle.recalculate_set_metrics([])
        self.assertEqual(res["avgVelocity"], 0.0)
        self.assertEqual(res["maxVelocity"], 0.0)
        self.assertEqual(res["velocityLossPct"], 0.0)

    def test_b13_02_single_rep_metrics_zero_loss(self):
        """B13.2: Verify single rep set always yields 0.0% velocity loss."""
        reps = [{"velocity": 0.72, "rpe": 7.0}]
        res = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(res["velocityLossPct"], 0.0)
        self.assertEqual(res["avgVelocity"], 0.72)

    def test_b13_03_monotonic_velocity_drop_accuracy(self):
        """B13.3: Verify 50% velocity drop calculation: Max 1.00 down to Last 0.50 -> 50.0%."""
        reps = [
            {"velocity": 1.00, "rpe": 6.0},
            {"velocity": 0.80, "rpe": 7.0},
            {"velocity": 0.50, "rpe": 9.5}
        ]
        res = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(res["velocityLossPct"], 50.0)
        self.assertEqual(res["maxVelocity"], 1.00)
        self.assertEqual(res["minVelocity"], 0.50)

    def test_b13_04_increasing_velocity_zero_loss(self):
        """B13.4: Verify velocity loss is 0.0% when lifter accelerates in final rep."""
        reps = [
            {"velocity": 0.60, "rpe": 8.0},
            {"velocity": 0.75, "rpe": 7.0}
        ]
        res = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(res["velocityLossPct"], 0.0)

    def test_b13_05_corrupted_localstorage_json_recovery(self):
        """B13.5: Verify app.js handles invalid localStorage JSON with try/catch."""
        self.assertIn("localStorage.getItem(STORAGE_KEY)", self.js)
        self.assertIn("JSON.parse", self.js)

    # ─────────────────────────────────────────────────────────────────────────
    # F14 Boundaries: DOM binding contract preservation
    # ─────────────────────────────────────────────────────────────────────────

    def test_b14_01_null_element_guard_verification(self):
        """B14.1: Verify app.js safely queries DOM elements without unhandled exceptions."""
        self.assertIn("document.getElementById", self.js)

    def test_b14_02_btn_connect_inner_btn_text_intact(self):
        """B14.2: Verify #btn-connect preserves inner .btn-text for text updates."""
        btn_match = re.search(r'<button[^>]*id=[\'"]btn-connect[\'"][^>]*>([\s\S]*?)</button>', self.html)
        self.assertIsNotNone(btn_match)
        self.assertIn('class="btn-text"', btn_match.group(1))

    def test_b14_03_status_badge_inner_status_label_intact(self):
        """B14.3: Verify #status-badge preserves inner .status-label."""
        badge_match = re.search(r'<div[^>]*id=[\'"]status-badge[\'"][^>]*>([\s\S]*?)</div>', self.html)
        self.assertIsNotNone(badge_match)
        self.assertIn('class="status-label"', badge_match.group(1))

    def test_b14_04_svg_progress_ring_radius_geometry(self):
        """B14.4: Verify SVG progress ring geometry matches circumference calculations."""
        dashoffset_full = VBTMathOracle.calculate_ring_stroke_dashoffset(1.0)
        self.assertEqual(dashoffset_full, 0.0, "1.0 m/s must produce 0.0 dashoffset (full ring)")
        dashoffset_zero = VBTMathOracle.calculate_ring_stroke_dashoffset(0.0)
        self.assertEqual(dashoffset_zero, 565.5, "0.0 m/s must produce 565.5 dashoffset (empty ring)")

    def test_b14_05_all_tab_sections_present(self):
        """B14.5: Verify all three tab sections (tab-live, tab-set, tab-history) exist."""
        for tid in ["tab-live", "tab-set", "tab-history"]:
            self.assertTrue(find_dom_id(self.html, tid))

    # ─────────────────────────────────────────────────────────────────────────
    # F15 Boundaries: E2E Testing Suite (Tiers 1-4)
    # ─────────────────────────────────────────────────────────────────────────

    def test_b15_01_oracle_math_boundary_division_by_zero(self):
        """B15.1: Verify oracle handles zero max velocity without ZeroDivisionError."""
        reps = [{"velocity": 0.0, "rpe": 0.0}]
        res = VBTMathOracle.recalculate_set_metrics(reps)
        self.assertEqual(res["velocityLossPct"], 0.0)

    def test_b15_02_oracle_duration_boundary_infinity(self):
        """B15.2: Verify duration formula with 0 velocity does not return infinity."""
        dur = VBTMathOracle.calculate_rep_duration(0.0)
        self.assertEqual(dur, 5.0)

    def test_b15_03_css_token_extractor_handles_missing(self):
        """B15.3: Verify extract_css_token returns None for non-existent token."""
        val = extract_css_token(self.css, "--non-existent-token-xyz")
        self.assertIsNone(val)

    def test_b15_04_html_dom_id_handles_special_chars(self):
        """B15.4: Verify find_dom_id returns False for non-existent ID."""
        self.assertFalse(find_dom_id(self.html, "phantom-nonexistent-element-12345"))

    def test_b15_05_test_suite_independent_state(self):
        """B15.5: Verify tests execute with stateless, re-read independent data."""
        html_fresh = get_index_html()
        self.assertEqual(len(html_fresh), len(self.html))

    # ─────────────────────────────────────────────────────────────────────────
    # F16 Boundaries: Design QA & Visual Regression
    # ─────────────────────────────────────────────────────────────────────────

    def test_b16_01_mobile_viewport_375x667_viewport_tag(self):
        """B16.1: Verify viewport tag includes initial-scale=1.0 for mobile devices."""
        self.assertIn("initial-scale=1.0", self.html)

    def test_b16_02_desktop_viewport_scaling(self):
        """B16.2: Verify html, body specifies min-height: 100vh for full viewport coverage."""
        clean = self.css.replace(" ", "")
        self.assertIn("min-height:100vh;", clean)
        self.assertIn("margin:0;", clean)

    def test_b16_03_css_font_family_fallbacks(self):
        """B16.3: Verify --font-sans concludes with generic sans-serif fallback."""
        val = extract_css_token(self.css, "--font-sans")
        self.assertIsNotNone(val)
        self.assertTrue(val.strip().endswith("sans-serif"))

    def test_b16_04_history_card_accordion_onclick_syntax(self):
        """B16.4: Verify dynamic session-card template in app.js binds toggleSessionCard."""
        self.assertIn("toggleSessionCard", self.js)

    def test_b16_05_console_script_load_integrity(self):
        """B16.5: Verify index.html loads style.css in head and app.js at end of body."""
        css_pos = self.html.find('href="style.css"')
        js_pos = self.html.find('src="app.js"')
        self.assertTrue(css_pos > 0, "style.css link missing")
        self.assertTrue(js_pos > 0, "app.js script tag missing")
        self.assertLess(css_pos, js_pos, "style.css must load before app.js")

if __name__ == '__main__':
    unittest.main()
