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
import subprocess
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
E2E_JS_TEST = os.path.join(ROOT_DIR, "tests", "test_coach_portal_desktop_cockpit_e2e.js")


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

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Manual Coach-Athlete Bonding Mechanism (Requirement R2)
    # ─────────────────────────────────────────────────────────────────────────

    def test_r2_bonding_components_and_methods(self):
        """R2: Bonding modal, pairing code, QR preview, pending/active roster lists & methods."""
        self.assertTrue(find_dom_id(self.html, "coach-bond-modal"), "#coach-bond-modal must exist")
        self.assertTrue(find_dom_id(self.html, "coach-pairing-code-display"), "#coach-pairing-code-display must exist")
        self.assertTrue(find_dom_id(self.html, "coach-pairing-ttl"), "#coach-pairing-ttl must exist")
        self.assertTrue(find_dom_id(self.html, "coach-bond-pending-list"), "#coach-bond-pending-list must exist")
        self.assertTrue(find_dom_id(self.html, "coach-bonded-roster-list"), "#coach-bonded-roster-list must exist")
        self.assertTrue(find_dom_id(self.html, "btn-coach-bond-open"), "#btn-coach-bond-open must exist")
        self.assertTrue(find_dom_id(self.html, "btn-coach-bond-close"), "#btn-coach-bond-close must exist")
        self.assertTrue(find_dom_id(self.html, "coach-cloud-sync-pill"), "#coach-cloud-sync-pill must exist")

        self.assertIn("generatePairingCode", self.coach_js, "coach-portal.js must provide generatePairingCode")
        self.assertIn("openBondModal", self.coach_js, "coach-portal.js must provide openBondModal")
        self.assertIn("closeBondModal", self.coach_js, "coach-portal.js must provide closeBondModal")
        self.assertIn("approvePendingBond", self.coach_js, "coach-portal.js must provide approvePendingBond")
        self.assertIn("declinePendingBond", self.coach_js, "coach-portal.js must provide declinePendingBond")
        self.assertIn("manualLinkAthlete", self.coach_js, "coach-portal.js must provide manualLinkAthlete")
        self.assertIn("revokeAthleteBond", self.coach_js, "coach-portal.js must provide revokeAthleteBond")

    # ─────────────────────────────────────────────────────────────────────────
    # 10. Live Squad Overview & Multi-Athlete Roster Grid (Requirement R3)
    # ─────────────────────────────────────────────────────────────────────────

    def test_r3_live_squad_grid_and_bryan_mann_tokens(self):
        """R3: Live squad overview, roster grid, filter tabs, Bryan Mann 5-zone tokens."""
        self.assertTrue(find_dom_id(self.html, "coach-squad-overview"), "#coach-squad-overview must exist")
        self.assertTrue(find_dom_id(self.html, "coach-squad-grid"), "#coach-squad-grid must exist")
        self.assertTrue(find_dom_id(self.html, "coach-roster-filters"), "#coach-roster-filters must exist")
        self.assertTrue(find_dom_id(self.html, "coach-kpi-summary-pill"), "#coach-kpi-summary-pill must exist")

        self.assertIn(".coach-zone-badge.zone-starting", self.coach_css)
        self.assertIn(".coach-zone-badge.zone-speed-strength", self.coach_css)
        self.assertIn(".coach-zone-badge.zone-strength-speed", self.coach_css)
        self.assertIn(".coach-zone-badge.zone-accelerative", self.coach_css)
        self.assertIn(".coach-zone-badge.zone-absolute", self.coach_css)
        self.assertIn(".coach-squad-card-actions", self.coach_css)

        self.assertIn("classifyBryanMannZone", self.coach_js, "coach-portal.js must provide classifyBryanMannZone")
        self.assertIn("renderSquadOverview", self.coach_js, "coach-portal.js must provide renderSquadOverview")

    # ─────────────────────────────────────────────────────────────────────────
    # 11. Athlete History Bento Quad, Calendar & Day Inspector (Requirement R4)
    # ─────────────────────────────────────────────────────────────────────────

    def test_r4_history_bento_quad_and_calendar_components(self):
        """R4: In-Comp Total, Gym Total dual models, Weekly Adherence, 7-col Calendar, Day Inspector."""
        self.assertTrue(find_dom_id(self.html, "coach-athlete-history-panel"), "#coach-athlete-history-panel must exist")
        self.assertTrue(find_dom_id(self.html, "coach-comp-total-card"), "#coach-comp-total-card must exist")
        self.assertTrue(find_dom_id(self.html, "coach-gym-total-card"), "#coach-gym-total-card must exist")
        self.assertTrue(find_dom_id(self.html, "coach-total-diff-card"), "#coach-total-diff-card must exist")
        self.assertTrue(find_dom_id(self.html, "coach-weekly-adherence-card"), "#coach-weekly-adherence-card must exist")
        self.assertTrue(find_dom_id(self.html, "coach-weekly-segments"), "#coach-weekly-segments must exist")
        self.assertTrue(find_dom_id(self.html, "coach-monthly-calendar-card"), "#coach-monthly-calendar-card must exist")
        self.assertTrue(find_dom_id(self.html, "coach-calendar-grid"), "#coach-calendar-grid must exist")
        self.assertTrue(find_dom_id(self.html, "coach-day-inspector"), "#coach-day-inspector must exist")
        self.assertTrue(find_dom_id(self.html, "btn-coach-export-day"), "#btn-coach-export-day must exist")
        self.assertTrue(find_dom_id(self.html, "btn-coach-export-day-csv"), "#btn-coach-export-day-csv must exist")
        self.assertTrue(find_dom_id(self.html, "coach-previous-workouts-card"), "#coach-previous-workouts-card must exist")

    def test_r4_ols_e1rm_and_canonical_workout_naming(self):
        """R4: OLS linear regression e1RM, canonical 'Main' workout naming, adherence & DOTS calculation."""
        self.assertIn("calculateOlsE1rm", self.coach_js, "coach-portal.js must implement calculateOlsE1rm")
        self.assertIn("formatCanonicalWorkoutName", self.coach_js, "coach-portal.js must implement formatCanonicalWorkoutName")
        self.assertIn("computeDotsScore", self.coach_js, "coach-portal.js must implement computeDotsScore")
        self.assertIn("computeWeeklyAdherence", self.coach_js, "coach-portal.js must implement computeWeeklyAdherence")
        self.assertIn("getResolvedAthleteTotals", self.coach_js, "coach-portal.js must implement getResolvedAthleteTotals")

    # ─────────────────────────────────────────────────────────────────────────
    # 12. Coach Focal Center: Barbell Deviation & Live RPE Pill (Requirement R2)
    # ─────────────────────────────────────────────────────────────────────────

    def test_r2_coach_focal_center_dom(self):
        """R2: Twin Focal Center DOM verification inside #coach-active-set-card."""
        self.assertTrue(find_dom_id(self.html, "coach-focal-telemetry-split"), "#coach-focal-telemetry-split must exist")
        self.assertTrue(find_dom_id(self.html, "coach-barpath-card"), "#coach-barpath-card must exist")
        self.assertTrue(find_dom_id(self.html, "coach-barpath-canvas"), "#coach-barpath-canvas must exist")
        self.assertTrue(find_dom_id(self.html, "coach-btn-barpath-mode"), "#coach-btn-barpath-mode must exist")
        self.assertTrue(find_dom_id(self.html, "coach-dev-summary"), "#coach-dev-summary must exist")
        self.assertTrue(find_dom_id(self.html, "coach-btn-barpath-replay"), "#coach-btn-barpath-replay must exist")
        self.assertTrue(find_dom_id(self.html, "coach-btn-barpath-speed"), "#coach-btn-barpath-speed must exist")
        self.assertTrue(find_dom_id(self.html, "coach-barpath-scrubber"), "#coach-barpath-scrubber must exist")
        self.assertTrue(find_dom_id(self.html, "coach-barpath-rep-pills"), "#coach-barpath-rep-pills must exist")
        self.assertTrue(find_dom_id(self.html, "coach-rpe-pill-card"), "#coach-rpe-pill-card must exist")
        self.assertTrue(find_dom_id(self.html, "coach-live-rpe"), "#coach-live-rpe must exist")
        self.assertTrue(find_dom_id(self.html, "coach-live-rir-pill"), "#coach-live-rir-pill must exist")
        self.assertTrue(find_dom_id(self.html, "coach-rpe-tier-badge"), "#coach-rpe-tier-badge must exist")
        self.assertTrue(find_dom_id(self.html, "coach-rpe-gauge-fill"), "#coach-rpe-gauge-fill must exist")
        self.assertTrue(find_dom_id(self.html, "coach-rpe-target-pin"), "#coach-rpe-target-pin must exist")
        self.assertTrue(find_dom_id(self.html, "coach-rpe-sub"), "#coach-rpe-sub must exist")

    # ─────────────────────────────────────────────────────────────────────────
    # 13. Widescreen 3-Column Cockpit Layout (Requirement R3)
    # ─────────────────────────────────────────────────────────────────────────

    def test_r3_widescreen_cockpit_css(self):
        """R3: Widescreen @media (min-width: 1150px), 1680px container, and 3-column cockpit grid."""
        self.assertIn("@media (min-width: 1150px)", self.coach_css)
        self.assertIn("max-width: 1680px", self.coach_css)
        self.assertIn("grid-template-columns: 300px minmax(0, 1fr) 360px", self.coach_css)
        self.assertIn(".coach-sets-history-card", self.coach_css)
        self.assertIn("grid-column: 1 / -1", self.coach_css)

    # ─────────────────────────────────────────────────────────────────────────
    # 14. Entry Shortcuts & Laptop Hotkeys (Requirement R3)
    # ─────────────────────────────────────────────────────────────────────────

    def test_r3_shortcuts_and_query_entry(self):
        """R3: 500ms long press, ?mode=coach URL auto-entry, Ctrl+Shift+C toggle, and hotkeys R, M, [, ]."""
        self.assertIn("?mode=coach", self.coach_js)
        self.assertIn("Ctrl+Shift+C", self.coach_js)
        self.assertIn("stepCoachRepSelection", self.coach_js)
        self.assertIn("toggleCoachCanvasMode", self.coach_js)
        self.assertIn("toggleCoachReplay", self.coach_js)

    # ─────────────────────────────────────────────────────────────────────────
    # 15. Automated E2E Standalone Node Test Runner (Requirement R5)
    # ─────────────────────────────────────────────────────────────────────────

    def test_r5_desktop_cockpit_e2e_node_runner(self):
        """R5: Executes tests/test_coach_portal_desktop_cockpit_e2e.js verifying 100% pass across all 6 suites."""
        self.assertTrue(os.path.exists(E2E_JS_TEST), f"Missing E2E test file: {E2E_JS_TEST}")
        result = subprocess.run(
            ["node", E2E_JS_TEST],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True
        )
        self.assertEqual(
            result.returncode,
            0,
            f"E2E Node test failed with code {result.returncode}:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
        self.assertIn("ALL COACH PORTAL E2E TESTS PASSED (100% OK)", result.stdout)

    def test_r6_orbital_dom_ids_and_button_integrity(self):
        """R6: Verifies Orbital Dark Neumorphism & Radial FAB DOM IDs, ARIA semantics, CSP, clean buttons, and zero forbidden terms."""
        required_ids = [
            "coach-sidebar",
            "coach-sidebar-toggle",
            "coach-sidebar-ticker",
            "coach-tablet-nav",
            "coach-mobile-nav",
            "coach-intro-overlay",
            "coach-cursor-glow",
            "coach-readiness-ring",
            "coach-bond-modal",
            "btn-coach-bond-open",
            "coach-pairing-code-display",
            "eros-radial-fab",
            "eros-radial-fab-trigger",
            "eros-radial-items",
            "eros-radial-customizer-modal",
            "btn-radial-customizer-close",
        ]
        for dom_id in required_ids:
            self.assertTrue(
                find_dom_id(self.html, dom_id),
                f"Missing required Orbital/Radial DOM element #{dom_id} in index.html",
            )

        self.assertIn("smart-overflow-protected", self.html)
        self.assertIn('http-equiv="Content-Security-Policy"', self.html)

        # Accessibility attributes for Orbital sidebar toggle, Radial FAB & dialog modals
        sidebar_toggle_tag = re.search(r'<button[^>]*id=["\']coach-sidebar-toggle["\'][^>]*>', self.html)
        self.assertIsNotNone(sidebar_toggle_tag, "Missing #coach-sidebar-toggle button tag")
        self.assertIn("aria-label=", sidebar_toggle_tag.group(0))
        self.assertIn("aria-expanded=", sidebar_toggle_tag.group(0))

        radial_trigger_tag = re.search(r'<button[^>]*id=["\']eros-radial-fab-trigger["\'][^>]*>', self.html)
        self.assertIsNotNone(radial_trigger_tag, "Missing #eros-radial-fab-trigger button tag")
        self.assertIn('aria-controls="eros-radial-items"', radial_trigger_tag.group(0))
        self.assertIn("aria-expanded=", radial_trigger_tag.group(0))
        self.assertIn("aria-label=", radial_trigger_tag.group(0))

        radial_items_tag = re.search(r'<div[^>]*id=["\']eros-radial-items["\'][^>]*>', self.html)
        self.assertIsNotNone(radial_items_tag, "Missing #eros-radial-items container")
        self.assertIn('role="menu"', radial_items_tag.group(0))
        self.assertIn('aria-hidden="true"', radial_items_tag.group(0))

        # #btn-dismiss-orientation must use accessible SVG + text rather than raw x/+ glyphs or emojis
        dismiss_match = re.search(
            r'<button[^>]*id=["\']btn-dismiss-orientation["\'][^>]*>(.*?)</button>',
            self.html,
            re.DOTALL,
        )
        self.assertIsNotNone(dismiss_match, "Missing #btn-dismiss-orientation button")
        self.assertIn("<svg", dismiss_match.group(1))
        dismiss_text = re.sub(r"<[^>]+>", "", dismiss_match.group(1)).strip()
        self.assertTrue(dismiss_text, "#btn-dismiss-orientation should provide screen-reader label text")
        self.assertNotIn("×", dismiss_text)
        self.assertEqual(find_emojis_in_text(dismiss_text), [])

        # Inspect new Orbital/Coach/Radial sections for clean buttons (no emojis, no empty text, no single raw symbol glyphs)
        coach_idx = self.html.find('id="view-coach"')
        self.assertNotEqual(coach_idx, -1)
        coach_and_radial_html = self.html[coach_idx:]
        for btn_inner in re.findall(r"<button\b[^>]*>(.*?)</button>", coach_and_radial_html, re.DOTALL):
            clean_txt = re.sub(r"<svg\b.*?</svg>", "", btn_inner, flags=re.DOTALL)
            clean_txt = re.sub(r"<[^>]+>", " ", clean_txt)
            clean_txt = re.sub(r"\s+", " ", clean_txt).strip()
            self.assertEqual(find_emojis_in_text(btn_inner), [], f"Emoji found inside coach/radial button: {btn_inner!r}")
            self.assertNotIn(clean_txt, {"+", "×", "✕", "✖", "−", "-"}, f"Raw glyph-only button found: {btn_inner!r}")

        # Zero hardcoded legacy fallback room code & zero forbidden hardware terminology
        base44_client_js = read_file("base44-client.js")
        style_css = get_style_css()
        athlete_profile_jsonc = read_file("base44/entities/athlete-profile.jsonc")
        athlete_bond_jsonc = read_file("base44/entities/athlete-bond.jsonc")

        for name, src in [
            ("coach-portal.js", self.coach_js),
            ("base44-client.js", base44_client_js),
        ]:
            self.assertNotIn("EROS-7X9K", src, f"Hardcoded default pairing code EROS-7X9K found in {name}")
        pairing_display_match = re.search(
            r'<[^>]*id=["\']coach-pairing-code-display["\'][^>]*>(.*?)</',
            self.html,
            re.DOTALL,
        )
        self.assertIsNotNone(pairing_display_match, "Missing #coach-pairing-code-display in index.html")
        self.assertNotIn("EROS-7X9K", pairing_display_match.group(1))

        forbidden_re = re.compile(r"\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|sensors|hardware)\b", re.IGNORECASE)
        for name, src in [
            ("index.html", self.html),
            ("style.css", style_css),
            ("coach.css", self.coach_css),
            ("coach-portal.js", self.coach_js),
            ("base44-client.js", base44_client_js),
            ("athlete-profile.jsonc", athlete_profile_jsonc),
            ("athlete-bond.jsonc", athlete_bond_jsonc),
        ]:
            hits = forbidden_re.findall(src)
            self.assertEqual(hits, [], f"Forbidden hardware term(s) {hits} found in {name}")

    def test_r7_orbital_coach_css_neumorphism_and_breakpoints(self):
        """R7: Verifies Dark Obsidian Neumorphic tokens, shells, collapse classes, overflow guard, and 1024px/768px breakpoints in coach.css."""
        from .conftest_base import check_css_brace_balance

        required_tokens_and_classes = [
            "--neu-out",
            "--neu-in",
            ".neu-raised",
            ".neu-inset",
            ".coach-shell",
            ".coach-sidebar--collapsed",
            ".smart-overflow-protected",
            "#coach-intro-overlay",
            "#coach-cursor-glow",
        ]
        for token in required_tokens_and_classes:
            self.assertIn(token, self.coach_css, f"Missing {token} in coach.css")

        for hex_color in ("#0d0d0d", "#171717", "#212121", "#2f2f2f"):
            self.assertIn(hex_color, self.coach_css.lower(), f"Missing Matte Obsidian token {hex_color} in coach.css")

        self.assertIn("1024px", self.coach_css, "Missing 1024px desktop shell breakpoint in coach.css")
        self.assertIn("768px", self.coach_css, "Missing 768px tablet/mobile shell breakpoint in coach.css")

        balanced, open_c, close_c, brace_errs = check_css_brace_balance(self.coach_css)
        self.assertTrue(balanced, f"coach.css brace balance check failed ({open_c}/{close_c}): {brace_errs}")

    def test_r8_athlete_style_css_dark_obsidian_neumorphism_and_radial(self):
        """R8: Verifies Athlete UI Dark Obsidian Neumorphic control shadows, mobile active-set compact guard, and Radial FAB CSS in style.css."""
        from .conftest_base import check_css_brace_balance

        style_css = get_style_css()
        balanced, open_c, close_c, brace_errs = check_css_brace_balance(style_css)
        self.assertTrue(balanced, f"style.css brace balance check failed ({open_c}/{close_c}): {brace_errs}")

        # Verify tactile neumorphic box-shadow tokens & athlete controls exist in style.css
        for token in (".eros-radial-fab", ".eros-radial-items", ".eros-radial-item", ".eros-radial-customizer-modal", ".smart-overflow-protected", ".controls-panel.set-active-compact"):
            self.assertIn(token, style_css, f"Missing {token} in style.css")

        # Confirm neumorphic control tail in style.css styles athlete controls with box-shadow
        tail_idx = style_css.find(".btn-primary")
        self.assertNotEqual(tail_idx, -1)
        for selector in (".btn-primary", ".btn-secondary", ".lift-quick-btn", ".view-mode-btn", ".nav-tab", "#btn-set-toggle", "#btn-complete-set", ".rpe-pill"):
            self.assertIn(selector, style_css, f"Missing athlete control selector {selector} in style.css")
        self.assertRegex(
            style_css,
            r"(?s)\.lift-quick-btn[^{]*\{[^}]*box-shadow:",
            "Expected tactile box-shadow styling on Athlete controls in style.css",
        )

    def test_r9_coach_portal_exports_clean_state_and_pairing_contracts(self):
        """R9: Verifies CoachPortal exports, clean zero-mock roster, fresh pairing code, radial smart spacing, quick-cue fix, and ARIA tabindex gating."""
        required_exports = [
            "toggleCoachSidebar",
            "navigateCoachSection",
            "animateCountUp",
            "renderProgressRing",
            "computeSmartRadialAngles",
            "applySmartOverflowProtection",
            "initRadialActionMenu",
            "toggleRadialActionMenu",
            "getRadialActionsConfig",
            "saveRadialActionsConfig",
            "generatePairingCode",
        ]
        for symbol in required_exports:
            self.assertIn(symbol, self.coach_js, f"Missing {symbol} in coach-portal.js")

        for fake_name in ("Marcus Vance", "Elena Rostova", "Devon Carter", "Sofia Lindholm"):
            self.assertNotIn(fake_name, self.coach_js, f"Fake athlete {fake_name} must not appear in coach-portal.js")
            self.assertNotIn(fake_name, self.html, f"Fake athlete {fake_name} must not appear in index.html")

        # Dual-consent bonding accessible from both Bonds navigation & Radial FAB
        self.assertIn('data-coach-nav="bonds"', self.html)
        self.assertIn("link-athlete", self.coach_js)

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// 1. Verify runtime exports and behaviors on CoachPortal
const cp = require('./coach-portal.js');
const expectedExports = [
  'toggleCoachSidebar',
  'navigateCoachSection',
  'animateCountUp',
  'renderProgressRing',
  'computeSmartRadialAngles',
  'applySmartOverflowProtection',
  'initRadialActionMenu',
  'toggleRadialActionMenu',
  'getRadialActionsConfig',
  'saveRadialActionsConfig',
  'generatePairingCode',
  'getSquadAthletes',
  'getPendingBondRequests'
];
for (const fn of expectedExports) {
  assert.strictEqual(typeof cp[fn], 'function', `CoachPortal.${fn} must be a function`);
}

// Clean zero-mock initial state (no fake athletes; only empty array or blank session placeholder)
const initialRoster = cp.getSquadAthletes();
assert.ok(Array.isArray(initialRoster) && initialRoster.length <= 1, 'Initial roster must not contain multi-athlete mock data');
for (const ath of initialRoster) {
  assert.strictEqual(ath.id, 'ath_01');
  assert.strictEqual(ath.name, 'Active Athlete');
  assert.strictEqual(ath.volume, '0 kg');
  assert.strictEqual(ath.compPrs.squat + ath.compPrs.bench + ath.compPrs.deadlift, 0);
}
assert.deepStrictEqual(cp.getPendingBondRequests(), [], 'Initial pending bonds must be empty');

// Radial menu config defaults & persistence round-trip helper check
const defaultActions = cp.getRadialActionsConfig();
assert.ok(Array.isArray(defaultActions) && defaultActions.length >= 4);
assert.strictEqual(typeof cp.toggleCoachSidebar, 'function');
assert.strictEqual(typeof cp.navigateCoachSection, 'function');
assert.strictEqual(typeof cp.animateCountUp, 'function');
assert.strictEqual(typeof cp.saveRadialActionsConfig, 'function');
assert.strictEqual(typeof cp.toggleRadialActionMenu, 'function');

// Fresh Crockford Base32 pairing code & never EROS-7X9K or EROS-INIT
const code1 = cp.generatePairingCode();
const code2 = cp.generatePairingCode();
assert.match(code1, /^EROS-[0-9A-HJKMNP-TV-Z]{4}$/, `Invalid pairing code: ${code1}`);
assert.match(code2, /^EROS-[0-9A-HJKMNP-TV-Z]{4}$/, `Invalid pairing code: ${code2}`);
assert.notStrictEqual(code1, 'EROS-7X9K');
assert.notStrictEqual(code1, 'EROS-INIT');

// Smart radial angles across all 4 corners + centered top/bottom on desktop & mobile: non-overlapping >= 42px & clamped
const viewports = [[1440, 900], [390, 844]];
for (const [vw, vh] of viewports) {
  const anchors = [
    [vw - 46, vh - 114],
    [46, vh - 114],
    [vw - 46, 46],
    [46, 46],
    [vw / 2, vh - 96],
    [vw / 2, 46]
  ];
  for (const [ax, ay] of anchors) {
    const pts = cp.computeSmartRadialAngles(ax, ay, vw, vh, 7, 92);
    assert.strictEqual(pts.length, 7);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      const cx = ax + p.x;
      const cy = ay + p.y;
      assert.ok(cx >= 26 && cx <= vw - 26, `x out of bounds (${cx}) at ${vw}x${vh} anchor (${ax},${ay})`);
      assert.ok(cy >= 26 && cy <= vh - 82, `y out of bounds (${cy}) at ${vw}x${vh} anchor (${ax},${ay})`);
      for (let j = i + 1; j < pts.length; j++) {
        const q = pts[j];
        const dist = Math.hypot((ax + q.x) - cx, (ay + q.y) - cy);
        assert.ok(dist >= 42, `Radial items ${i} and ${j} overlap (${dist.toFixed(1)}px < 42px) at ${vw}x${vh} (${ax},${ay})`);
      }
    }
  }
}

// applySmartOverflowProtection contract
const classSet = new Set();
const fakeEl = {
  classList: { add: (c) => classSet.add(c), contains: (c) => classSet.has(c) },
  style: {},
  getBoundingClientRect: () => ({ left: -20, right: 980, top: 20, bottom: 500, width: 1000, height: 480 })
};
cp.applySmartOverflowProtection(fakeEl, 12);
assert.ok(classSet.has('smart-overflow-protected'));
assert.strictEqual(fakeEl.style.maxWidth, 'calc(100vw - 24px)');
assert.strictEqual(fakeEl.style.maxHeight, 'calc(100vh - 24px)');
assert.strictEqual(fakeEl.style.boxSizing, 'border-box');

// renderProgressRing generates SVG markup
const ringEl = { innerHTML: '', setAttribute: () => {} };
cp.renderProgressRing(ringEl, 88, '#10a37f');
assert.ok(ringEl.innerHTML.includes('<svg') && ringEl.innerHTML.includes('<circle'));

// animateCountUp completes at exact target value
const animEl = { textContent: '' };
cp.animateCountUp(animEl, 6200, 0, (v) => `${Math.round(v).toLocaleString('en-US')} kg`);
assert.strictEqual(animEl.textContent, '6,200 kg');

// Full DOM-backed CoachPortal runtime verification (sidebar toggle, section nav, radial menu ARIA/tabindex & quick-cue emission)
const storageMap = {};
const mockClassList = () => {
  const s = new Set();
  return {
    add: (...c) => c.forEach(x => s.add(x)),
    remove: (...c) => c.forEach(x => s.delete(x)),
    contains: (c) => s.has(c),
    toggle: (c, force) => {
      if (force === undefined) { if (s.has(c)) { s.delete(c); return false; } s.add(c); return true; }
      if (force) { s.add(c); return true; } s.delete(c); return false;
    }
  };
};
function mkEl(id) {
  return {
    id,
    style: {},
    attrs: {},
    classList: mockClassList(),
    innerHTML: '',
    textContent: '',
    _listeners: {},
    _children: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] !== undefined ? this.attrs[k] : null; },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    querySelectorAll() { return this._children; },
    querySelector() { return null; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 1368, top: 760, right: 1420, bottom: 812, width: 52, height: 52 }; }
  };
}
const domMap = {
  'coach-sidebar': mkEl('coach-sidebar'),
  'coach-sidebar-toggle': mkEl('coach-sidebar-toggle'),
  'eros-radial-fab': mkEl('eros-radial-fab'),
  'eros-radial-fab-trigger': mkEl('eros-radial-fab-trigger'),
  'eros-radial-items': mkEl('eros-radial-items'),
  'coach-cue-status': mkEl('coach-cue-status'),
  'view-coach': mkEl('view-coach'),
  'coach-pairing-code-display': mkEl('coach-pairing-code-display'),
  'coach-overview-section': mkEl('coach-overview-section'),
  'coach-history-card': mkEl('coach-history-card')
};
// Capture rendered radial item buttons with tabindex + click listener when renderRadialMenuItems writes innerHTML
Object.defineProperty(domMap['eros-radial-items'], 'innerHTML', {
  set(html) {
    this._html = html;
    const matches = Array.from(String(html).matchAll(/data-radial-action="([^"]+)"[^>]*tabindex="([^"]+)"/g));
    this._children = matches.map(m => {
      const btn = mkEl('');
      btn.setAttribute('data-radial-action', m[1]);
      btn.setAttribute('tabindex', m[2]);
      return btn;
    });
  },
  get() { return this._html || ''; }
});
const winEvents = [];
const syncEvents = [];
const vmWindow = {
  innerWidth: 1440,
  innerHeight: 900,
  location: { search: '' },
  ErosSyncBus: { emit: (ev, data) => syncEvents.push({ ev, data }) },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: (ev) => winEvents.push(ev),
  CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
};
const vmDoc = {
  body: { classList: mockClassList() },
  getElementById: (id) => domMap[id] || null,
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  createElement: () => mkEl('')
};
const vmCtx = {
  window: vmWindow,
  document: vmDoc,
  CustomEvent: vmWindow.CustomEvent,
  localStorage: { getItem: (k) => (k in storageMap ? storageMap[k] : null), setItem: (k, v) => { storageMap[k] = String(v); }, removeItem: (k) => { delete storageMap[k]; } },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  console,
  setTimeout: (fn) => { return 0; },
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: (fn) => 0,
  cancelAnimationFrame: () => {},
  navigator: {},
  performance: { now: () => 1000 },
  module: { exports: {} },
  exports: {}
};
vmCtx.window.document = vmDoc;
vm.createContext(vmCtx);
vm.runInContext(fs.readFileSync('coach-portal.js', 'utf8'), vmCtx);
const cpDom = (vmCtx.module && vmCtx.module.exports) || vmCtx.window.CoachPortal;

// toggleCoachSidebar
const c1 = cpDom.toggleCoachSidebar(true);
assert.strictEqual(c1, true);
assert.ok(domMap['coach-sidebar'].classList.contains('coach-sidebar--collapsed'));
assert.strictEqual(domMap['coach-sidebar-toggle'].getAttribute('aria-expanded'), 'false');
const c2 = cpDom.toggleCoachSidebar(false);
assert.strictEqual(c2, false);
assert.ok(!domMap['coach-sidebar'].classList.contains('coach-sidebar--collapsed'));

// navigateCoachSection
cpDom.navigateCoachSection('history');

// saveRadialActionsConfig & toggleRadialActionMenu ARIA + tabindex gating
cpDom.saveRadialActionsConfig(['quick-cue', 'link-athlete']);
assert.strictEqual(JSON.stringify(cpDom.getRadialActionsConfig()), JSON.stringify(['quick-cue', 'link-athlete']));
cpDom.toggleRadialActionMenu(true);
assert.strictEqual(domMap['eros-radial-items'].getAttribute('aria-hidden'), 'false');
assert.ok(domMap['eros-radial-items']._children.length >= 2);
for (const btn of domMap['eros-radial-items']._children) {
  assert.strictEqual(btn.getAttribute('tabindex'), '0');
}
cpDom.toggleRadialActionMenu(false);
assert.strictEqual(domMap['eros-radial-items'].getAttribute('aria-hidden'), 'true');
for (const btn of domMap['eros-radial-items']._children) {
  assert.strictEqual(btn.getAttribute('tabindex'), '-1');
}

// Re-open & invoke quick-cue click handler -> must emit coach:cue ('Drive hips!') with ZERO coach:load_override
cpDom.toggleRadialActionMenu(true);
const cueBtn = domMap['eros-radial-items']._children.find(b => b.getAttribute('data-radial-action') === 'quick-cue');
assert.ok(cueBtn && cueBtn._listeners.click && cueBtn._listeners.click.length > 0);
winEvents.length = 0;
syncEvents.length = 0;
cueBtn._listeners.click[0]({ stopPropagation: () => {} });
const cueEvs = winEvents.filter(e => e.type === 'eros:coach_cue');
const ovrEvs = winEvents.filter(e => e.type === 'eros:coach_load_override');
assert.strictEqual(cueEvs.length, 1, 'quick-cue must emit eros:coach_cue');
assert.strictEqual(cueEvs[0].detail.text, 'Drive hips!');
assert.strictEqual(ovrEvs.length, 0, 'quick-cue must NOT emit eros:coach_load_override');
assert.strictEqual(syncEvents.filter(s => s.ev === 'coach:cue').length, 1);
assert.strictEqual(syncEvents.filter(s => s.ev === 'coach:load_override').length, 0);

// Base44Client checks via vm context (no EROS-INIT accepted, no default room join on EROS-INIT DOM placeholder)
const emittedEvents = [];
const mockBodyClasses = new Set();
let observerCb = null;
const mockWindow = {
  addEventListener: () => {},
  dispatchEvent: (ev) => emittedEvents.push(ev),
  CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
  ErosSyncBus: { connectCloud: () => false, disconnectCloud: () => {}, emit: () => {} }
};
let mockDomCode = 'EROS-INIT';
let domReads = 0;
const mockDocument = {
  body: { classList: { contains: (c) => mockBodyClasses.has(c) } },
  getElementById: (id) => {
    if (id === 'coach-pairing-code-display') { domReads++; return { textContent: mockDomCode }; }
    return null;
  },
  querySelectorAll: () => []
};
const b44Src = fs.readFileSync('base44-client.js', 'utf8');
const b44Ctx = {
  window: mockWindow,
  document: mockDocument,
  localStorage: { getItem: () => null, setItem: () => {} },
  MutationObserver: class { constructor(cb) { observerCb = cb; } observe() {} disconnect() {} },
  console,
  setTimeout,
  clearTimeout,
  module: { exports: {} },
  exports: {}
};
vm.createContext(b44Ctx);
vm.runInContext(b44Src, b44Ctx);
const b44 = b44Ctx.window.ErosCloud;
assert.ok(b44 && typeof b44.isValidPairingCode === 'function', 'ErosCloud.isValidPairingCode must be exposed');
assert.strictEqual(b44.isValidPairingCode('EROS-INIT'), false, 'EROS-INIT must be rejected');
assert.strictEqual(b44.isValidPairingCode('EROS-2A3B'), true, 'Format helper validates Crockford pattern');
assert.strictEqual(b44.isValidPairingCode(code1), true, 'Generated Crockford Base32 pairing code must pass');
// Simulate switching to Coach mode while DOM still has EROS-INIT -> MutationObserver must read DOM and NOT crash or connect
mockBodyClasses.add('portal-coach');
if (observerCb) observerCb();
assert.ok(domReads >= 1, 'MutationObserver must inspect #coach-pairing-code-display on entering Coach mode');

b44.join('EROS-INIT').then((joinedInit) => {
  assert.strictEqual(joinedInit, false, 'ErosCloud.join must reject EROS-INIT');
  console.log('NODE_COACH_ORBITAL_CONTRACTS_OK');
});
"""
        result = subprocess.run(
            ["node", "-e", node_script],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            result.returncode,
            0,
            f"Node behavioral verification failed ({result.returncode}):\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}",
        )
        self.assertIn("NODE_COACH_ORBITAL_CONTRACTS_OK", result.stdout)

    def test_r10_base44_bonding_and_profile_schemas(self):
        """R10: Verifies AthleteProfile and AthleteBond Base44 entity JSONC schemas & dual-consent status enum."""
        import json

        profile_raw = re.sub(r"^\s*//.*$", "", read_file("base44/entities/athlete-profile.jsonc"), flags=re.MULTILINE)
        bond_raw = re.sub(r"^\s*//.*$", "", read_file("base44/entities/athlete-bond.jsonc"), flags=re.MULTILINE)

        profile = json.loads(profile_raw)
        bond = json.loads(bond_raw)

        self.assertEqual(profile.get("name"), "AthleteProfile")
        for req in ("athlete_id", "athlete_name"):
            self.assertIn(req, profile.get("required", []))
        for field in ("comp_squat_kg", "gym_squat_kg", "e1rm_squat_kg", "updated_at"):
            self.assertIn(field, profile.get("properties", {}))

        self.assertEqual(bond.get("name"), "AthleteBond")
        for req in ("bond_id", "pairing_code", "athlete_id", "coach_id", "status"):
            self.assertIn(req, bond.get("required", []))
        self.assertEqual(
            bond.get("properties", {}).get("status", {}).get("enum"),
            ["pending", "active", "revoked"],
        )


if __name__ == "__main__":
    unittest.main()


