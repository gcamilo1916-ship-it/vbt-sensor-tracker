"""
Automated Verification Suite for Coach Portal Dark UI (Requirement R1)
Covers all specifications:
  - ChatGPT-inspired dark UI theme (4-surface matte obsidian hierarchy)
  - High-contrast typography & WCAG AAA compliance
  - Mode toggle styling & non-destructive in-page switching
  - Squad Ribbon, Active Set Live Monitor, Sets History Table, and Coach Feedback Console
  - Strict R4 compliance (zero forbidden hardware terms)
  - Zero emoji pictographs (pure text & SVG)
"""

import os
import re
import unittest
from .conftest_base import (
    ROOT_DIR,
    read_file,
    get_index_html,
    get_style_css,
    extract_css_rules,
    extract_css_token,
    find_dom_id,
    find_emojis_in_text
)

COACH_CSS_PATH = os.path.join(ROOT_DIR, "coach.css")
COACH_PORTAL_JS_PATH = os.path.join(ROOT_DIR, "coach-portal.js")


def _srgb_channel_lum(c):
    v = c / 255.0
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def _relative_luminance(hex_color):
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return 0.2126 * _srgb_channel_lum(r) + 0.7152 * _srgb_channel_lum(g) + 0.0722 * _srgb_channel_lum(b)


def wcag_contrast_ratio(hex1, hex2):
    l1 = _relative_luminance(hex1)
    l2 = _relative_luminance(hex2)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


class TestCoachPortalDarkUi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.coach_css = read_file(COACH_CSS_PATH)
        cls.coach_js = read_file(COACH_PORTAL_JS_PATH)

    # ─────────────────────────────────────────────────────────────────────────
    # 1. 4-Surface Matte Obsidian Hierarchy
    # ─────────────────────────────────────────────────────────────────────────

    def test_r1_01_obsidian_hierarchy_tokens(self):
        """R1: coach.css must define the 4-surface matte obsidian hierarchy."""
        bg_canvas = extract_css_token(self.coach_css, "--coach-bg-canvas")
        bg_surface_1 = extract_css_token(self.coach_css, "--coach-bg-surface-1")
        bg_surface_2 = extract_css_token(self.coach_css, "--coach-bg-surface-2")
        border_subtle = extract_css_token(self.coach_css, "--coach-border-subtle")

        self.assertIsNotNone(bg_canvas, "--coach-bg-canvas must be defined in coach.css")
        self.assertIsNotNone(bg_surface_1, "--coach-bg-surface-1 must be defined in coach.css")
        self.assertIsNotNone(bg_surface_2, "--coach-bg-surface-2 must be defined in coach.css")
        self.assertIsNotNone(border_subtle, "--coach-border-subtle must be defined in coach.css")

        self.assertEqual(bg_canvas.lower(), "#0d0d0d", "Surface 0 (canvas) must be #0d0d0d")
        self.assertEqual(bg_surface_1.lower(), "#171717", "Surface 1 (structural panels) must be #171717")
        self.assertEqual(bg_surface_2.lower(), "#212121", "Surface 2 (elevated cards) must be #212121")
        self.assertEqual(border_subtle.lower(), "#2f2f2f", "Borders/dividers must be #2f2f2f")

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Typography & WCAG AAA Contrast
    # ─────────────────────────────────────────────────────────────────────────

    def test_r1_02_typography_tokens_and_wcag_contrast(self):
        """R1: High-contrast typography (#ececec, #b4b4b4, #71717a) with WCAG AAA compliance."""
        text_primary = extract_css_token(self.coach_css, "--coach-text-primary")
        text_secondary = extract_css_token(self.coach_css, "--coach-text-secondary")
        text_muted = extract_css_token(self.coach_css, "--coach-text-muted")

        self.assertIsNotNone(text_primary, "--coach-text-primary must be defined")
        self.assertIsNotNone(text_secondary, "--coach-text-secondary must be defined")
        self.assertIsNotNone(text_muted, "--coach-text-muted must be defined")

        self.assertEqual(text_primary.lower(), "#ececec")
        self.assertEqual(text_secondary.lower(), "#b4b4b4")
        self.assertEqual(text_muted.lower(), "#71717a")

        # Contrast of primary text (#ececec) on canvas (#0d0d0d) must be >= 7.0 (AAA)
        ratio_canvas = wcag_contrast_ratio(text_primary, "#0d0d0d")
        self.assertGreaterEqual(ratio_canvas, 7.0, f"Primary text on canvas contrast {ratio_canvas:.2f} must be >= 7.0 (AAA)")

        # Contrast of primary text (#ececec) on card surface (#212121) must be >= 7.0 (AAA)
        ratio_card = wcag_contrast_ratio(text_primary, "#212121")
        self.assertGreaterEqual(ratio_card, 7.0, f"Primary text on card contrast {ratio_card:.2f} must be >= 7.0 (AAA)")

        # Contrast of secondary text (#b4b4b4) on card surface (#212121) must be >= 4.5 (AA/AAA)
        ratio_sec = wcag_contrast_ratio(text_secondary, "#212121")
        self.assertGreaterEqual(ratio_sec, 4.5, f"Secondary text contrast {ratio_sec:.2f} must be >= 4.5")

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Body Class Mode Rules & Visibility Transitions
    # ─────────────────────────────────────────────────────────────────────────

    def test_r1_03_body_portal_coach_visibility_rules(self):
        """R1: body.portal-coach must hide athlete tab-contents & bottom nav, and display #view-coach."""
        # Check rule for hiding athlete elements
        self.assertIn("body.portal-coach .tab-contents", self.coach_css)
        self.assertIn("body.portal-coach .bottom-glass-nav", self.coach_css)
        self.assertIn("display: none !important", self.coach_css)

        # Check rule for displaying #view-coach
        self.assertIn("body.portal-coach #view-coach", self.coach_css)

        # Check default rule for #view-coach (hidden by default)
        rules = extract_css_rules(self.coach_css, "#view-coach")
        self.assertTrue(len(rules) > 0, "#view-coach rule must exist in coach.css")
        has_display_none = any("display" in props and "none" in props["display"] for _, props, _ in rules)
        self.assertTrue(has_display_none, "#view-coach must be hidden (display: none) by default")

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Mode Toggle Styling in coach.css
    # ─────────────────────────────────────────────────────────────────────────

    def test_r1_04_mode_toggle_styling(self):
        """R1: Mode toggle styling (#view-mode-toggle, #btn-mode-athlete, #btn-mode-coach) in coach.css."""
        toggle_rules = extract_css_rules(self.coach_css, ".view-mode-toggle")
        self.assertTrue(len(toggle_rules) > 0, ".view-mode-toggle rule must exist")

        btn_rules = extract_css_rules(self.coach_css, ".mode-toggle-btn")
        self.assertTrue(len(btn_rules) > 0, ".mode-toggle-btn rule must exist")

        active_btn_rules = extract_css_rules(self.coach_css, ".mode-toggle-btn.active")
        self.assertTrue(len(active_btn_rules) > 0, ".mode-toggle-btn.active rule must exist")

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Integration into index.html
    # ─────────────────────────────────────────────────────────────────────────

    def test_r1_05_index_html_head_and_script_integration(self):
        """R1: index.html must link coach.css and include coach-portal.js before app.js."""
        self.assertIn('<link rel="stylesheet" href="coach.css"', self.html)
        self.assertIn('<script src="coach-portal.js"></script>', self.html)

        # Ensure coach-portal.js comes before app.js
        coach_script_pos = self.html.find('coach-portal.js')
        app_script_pos = self.html.find('app.js')
        self.assertNotEqual(coach_script_pos, -1, "coach-portal.js script tag not found")
        self.assertNotEqual(app_script_pos, -1, "app.js script tag not found")
        self.assertLess(coach_script_pos, app_script_pos, "coach-portal.js must be loaded before app.js")

    def test_r1_06_index_html_segmented_mode_toggle(self):
        """R1: Segmented mode toggle #view-mode-toggle with athlete & coach buttons in header-top-row."""
        self.assertTrue(find_dom_id(self.html, "view-mode-toggle"), "#view-mode-toggle must exist in index.html")
        self.assertTrue(find_dom_id(self.html, "btn-mode-athlete"), "#btn-mode-athlete must exist in index.html")
        self.assertTrue(find_dom_id(self.html, "btn-mode-coach"), "#btn-mode-coach must exist in index.html")

        # Verify placement between branding and header-actions
        branding_pos = self.html.find('class="branding"')
        toggle_pos = self.html.find('id="view-mode-toggle"')
        actions_pos = self.html.find('class="header-actions"')

        self.assertLess(branding_pos, toggle_pos, "#view-mode-toggle must be placed after .branding")
        self.assertLess(toggle_pos, actions_pos, "#view-mode-toggle must be placed before .header-actions")

    def test_r1_07_index_html_coach_dashboard_components(self):
        """R1: #view-coach must contain Squad Ribbon, Active Set Live Monitor, Sets History Table, and Feedback Console."""
        self.assertTrue(find_dom_id(self.html, "view-coach"), "#view-coach container must exist in index.html")

        # Squad Ribbon
        self.assertTrue(find_dom_id(self.html, "coach-athlete-select"), "#coach-athlete-select must exist")
        self.assertTrue(find_dom_id(self.html, "coach-session-status-badge"), "#coach-session-status-badge must exist")
        self.assertTrue(find_dom_id(self.html, "coach-readiness-val"), "#coach-readiness-val must exist")
        self.assertTrue(find_dom_id(self.html, "coach-volume-val"), "#coach-volume-val must exist")
        self.assertTrue(find_dom_id(self.html, "coach-e1rm-val"), "#coach-e1rm-val must exist")

        # Active Set Live Monitor
        self.assertTrue(find_dom_id(self.html, "coach-active-set-card"), "#coach-active-set-card must exist")
        self.assertTrue(find_dom_id(self.html, "coach-active-set-title"), "#coach-active-set-title must exist")
        self.assertTrue(find_dom_id(self.html, "coach-live-mcv"), "#coach-live-mcv must exist")
        self.assertTrue(find_dom_id(self.html, "coach-live-pv"), "#coach-live-pv must exist")
        self.assertTrue(find_dom_id(self.html, "coach-live-rom"), "#coach-live-rom must exist")
        self.assertTrue(find_dom_id(self.html, "coach-live-vl"), "#coach-live-vl must exist")
        self.assertTrue(find_dom_id(self.html, "coach-live-vl-gauge"), "#coach-live-vl-gauge must exist")
        self.assertTrue(find_dom_id(self.html, "coach-live-reps-stream"), "#coach-live-reps-stream must exist")

        # Sets Performance History Table
        self.assertTrue(find_dom_id(self.html, "coach-sets-table"), "#coach-sets-table must exist")
        self.assertTrue(find_dom_id(self.html, "coach-sets-table-body"), "#coach-sets-table-body must exist")
        self.assertTrue(find_dom_id(self.html, "coach-sets-counter"), "#coach-sets-counter must exist")

        # Coach Feedback Console
        self.assertTrue(find_dom_id(self.html, "coach-feedback-console"), "#coach-feedback-console must exist")
        self.assertTrue(find_dom_id(self.html, "coach-feedback-status"), "#coach-feedback-status must exist")
        self.assertTrue(find_dom_id(self.html, "coach-custom-cue-input"), "#coach-custom-cue-input must exist")
        self.assertTrue(find_dom_id(self.html, "btn-coach-send-custom"), "#btn-coach-send-custom must exist")

        # Verify load adjustment pills
        self.assertIn('data-delta="-5.0"', self.html, "Must have -5.0 kg load adjustment pill")
        self.assertIn('data-delta="2.5"', self.html, "Must have +2.5 kg load adjustment pill")

    # ─────────────────────────────────────────────────────────────────────────
    # 6. coach-portal.js Controller Logic
    # ─────────────────────────────────────────────────────────────────────────

    def test_r1_08_coach_portal_js_exports_and_methods(self):
        """R1: coach-portal.js provides initCoachPortal(), switchMode(), and telemetry sync methods."""
        self.assertIn("switchMode", self.coach_js, "coach-portal.js must implement switchMode")
        self.assertIn("renderFullCoachDashboard", self.coach_js, "coach-portal.js must implement renderFullCoachDashboard")
        self.assertIn("sendCoachPrescription", self.coach_js, "coach-portal.js must implement sendCoachPrescription")
        self.assertIn("handleSetStarted", self.coach_js, "coach-portal.js must handle set:started")
        self.assertIn("handleRepRecorded", self.coach_js, "coach-portal.js must handle rep:recorded")
        self.assertIn("handleSetCompleted", self.coach_js, "coach-portal.js must handle set:completed")

        # Verify global exports
        self.assertIn("root.CoachPortal = factory()", self.coach_js)
        self.assertIn("root.switchMode = root.CoachPortal.switchMode", self.coach_js)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Requirement R4 Compliance (Zero Forbidden Hardware Terms)
    # ─────────────────────────────────────────────────────────────────────────

    def test_r1_09_strict_r4_zero_hardware_terms(self):
        """R4: Zero occurrences of webble, 100hz, esp32, imu, madgwick, bluefy, sensor, hardware in coach code."""
        forbidden_pattern = re.compile(
            r'\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|hardware)\b',
            re.IGNORECASE
        )
        self.assertIsNone(
            forbidden_pattern.search(self.coach_css),
            f"Forbidden hardware term found in coach.css: {forbidden_pattern.search(self.coach_css)}"
        )
        self.assertIsNone(
            forbidden_pattern.search(self.coach_js),
            f"Forbidden hardware term found in coach-portal.js: {forbidden_pattern.search(self.coach_js)}"
        )
        self.assertIsNone(
            forbidden_pattern.search(self.html),
            f"Forbidden hardware term found in index.html: {forbidden_pattern.search(self.html)}"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Zero Emoji Pictographs in Coach UI
    # ─────────────────────────────────────────────────────────────────────────

    def test_r1_10_zero_emojis_in_coach_portal(self):
        """R1: coach.css, coach-portal.js, and index.html must contain zero emojis."""
        self.assertEqual(len(find_emojis_in_text(self.coach_css)), 0, "coach.css must contain zero emojis")
        self.assertEqual(len(find_emojis_in_text(self.coach_js)), 0, "coach-portal.js must contain zero emojis")
        self.assertEqual(len(find_emojis_in_text(self.html)), 0, "index.html must contain zero emojis")


if __name__ == "__main__":
    unittest.main()
