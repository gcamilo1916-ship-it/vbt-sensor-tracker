"""
Eros Athlete Set Completion Celebration FX & Coach HUD Test Suite
Milestone 3 — Requirement R2:
- Dynamic Glass Bloom Pulse keyframes and class
- Velocity tier particle spark burst container and keyframes
- Post-set summary transition pill & rest countdown HUD
- 5-zone Bryan Mann velocity metric badges (Power, Speed, Strength, Accel, Grind)
- Athlete coach cue HUD styles and rest interval directive modal
- JS helper logic (triggerSetCompletionCelebration, renderVelocityZoneBadge, getVelocityZone)
- Strict R4 Terminology Compliance: Zero restricted terms
"""

import os
import re
import unittest
try:
    from .conftest_base import (
        get_index_html,
        get_style_css,
        extract_css_rules,
        find_dom_id,
        find_emojis_in_text
    )
except (ImportError, ValueError):
    from conftest_base import (
        get_index_html,
        get_style_css,
        extract_css_rules,
        find_dom_id,
        find_emojis_in_text
    )

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ATHLETE_FX_CSS_PATH = os.path.join(ROOT_DIR, "athlete-fx.css")
ATHLETE_FX_JS_PATH = os.path.join(ROOT_DIR, "athlete-fx.js")


def read_text_file(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


class TestAthleteFxCelebration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.style_css = get_style_css()
        cls.fx_css = read_text_file(ATHLETE_FX_CSS_PATH)
        cls.fx_js = read_text_file(ATHLETE_FX_JS_PATH)

    # ─────────────────────────────────────────────────────────────────────────
    # 1. CSS Stylesheet & Rule Verification (athlete-fx.css)
    # ─────────────────────────────────────────────────────────────────────────

    def test_01_glass_bloom_pulse_keyframes_and_class(self):
        """Dynamic Glass Bloom Pulse @keyframes glassSetBloom and .set-completing-pulse must exist."""
        self.assertIn("@keyframes glassSetBloom", self.fx_css)
        self.assertIn(".set-completing-pulse", self.fx_css)
        self.assertIn("glassSetBloom", self.fx_css)

        rules = extract_css_rules(self.fx_css, ".set-completing-pulse")
        self.assertTrue(len(rules) > 0, ".set-completing-pulse rule must exist in athlete-fx.css")
        merged = {}
        for _, props, _ in rules:
            merged.update(props)
        self.assertIn("animation", merged)
        self.assertIn("glassSetBloom", merged["animation"])

    def test_02_particle_burst_container_and_sparks(self):
        """Micro-particle spark burst overlay, .celebration-spark, .gold-spark, and @keyframes sparkFly."""
        self.assertIn(".set-celebration-overlay", self.fx_css)
        self.assertIn(".celebration-spark", self.fx_css)
        self.assertIn(".gold-spark", self.fx_css)
        self.assertIn("@keyframes sparkFly", self.fx_css)
        self.assertIn(".burst-emitter", self.fx_css)

        # Check color tier variants
        self.assertIn(".cyan-spark", self.fx_css)
        self.assertIn(".emerald-spark", self.fx_css)
        self.assertIn(".crimson-spark", self.fx_css)

    def test_03_post_set_summary_banner_and_rest_hud(self):
        """Post-set summary transition banner, checkmark icon, metrics, and rest countdown styling."""
        required_classes = [
            ".set-summary-banner",
            ".summary-check-icon",
            ".summary-text-block",
            ".summary-title",
            ".summary-metrics",
            ".summary-rest-countdown",
            ".rest-timer-label",
            ".rest-time-val"
        ]
        for cls_name in required_classes:
            self.assertIn(cls_name, self.fx_css, f"athlete-fx.css must contain {cls_name}")

        rules = extract_css_rules(self.fx_css, ".set-summary-banner")
        self.assertTrue(len(rules) > 0, ".set-summary-banner must be styled")
        merged = {}
        for _, props, _ in rules:
            merged.update(props)
        self.assertEqual(merged.get("display", "").strip(), "flex")
        self.assertIn("backdrop-filter", merged)

    def test_04_bryan_mann_5_zone_velocity_badges(self):
        """Bryan Mann 5-zone velocity badges with color definitions matching visionOS spec."""
        zones = [
            (".vel-zone-power", "#00E5FF"),     # >1.0 m/s Laser Cyan
            (".vel-zone-speed", "#00FF66"),     # 0.75-1.0 m/s Electric Emerald
            (".vel-zone-strength", "#FFD700"),  # 0.50-0.75 m/s Specular Gold
            (".vel-zone-accel", "#FF9500"),     # 0.30-0.50 m/s Caution Orange
            (".vel-zone-grind", "#FF3B30")      # <0.30 m/s Apple System Punchy Red
        ]

        for cls_name, color_hex in zones:
            self.assertIn(cls_name, self.fx_css, f"athlete-fx.css must define {cls_name}")
            rules = extract_css_rules(self.fx_css, cls_name)
            self.assertTrue(len(rules) > 0, f"Rules for {cls_name} must exist")
            merged = {}
            for _, props, _ in rules:
                merged.update(props)
            self.assertEqual(
                merged.get("color", "").strip().upper(),
                color_hex.upper(),
                f"{cls_name} text color must be {color_hex}"
            )

    def test_05_coach_cue_hud_and_directive_modal(self):
        """In-flight floating cue HUD and rest interval directive modal with countdown ring."""
        cue_classes = [
            ".coach-cue-hud",
            ".coach-cue-pill",
            ".coach-cue-dot",
            ".coach-cue-text"
        ]
        for cls_name in cue_classes:
            self.assertIn(cls_name, self.fx_css, f"athlete-fx.css must define {cls_name}")

        modal_classes = [
            ".coach-directive-modal",
            ".coach-directive-card",
            ".directive-header",
            ".coach-avatar-badge",
            ".directive-load-box",
            ".directive-cue-box",
            ".directive-actions",
            ".btn-directive-dismiss",
            ".btn-directive-accept",
            ".countdown-ring",
            ".auto-accept-svg",
            ".auto-accept-fill"
        ]
        for cls_name in modal_classes:
            self.assertIn(cls_name, self.fx_css, f"athlete-fx.css must define {cls_name}")

    def test_06_index_html_integration(self):
        """index.html must link athlete-fx.css and athlete-fx.js, and provide required DOM containers."""
        self.assertIn('<link rel="stylesheet" href="athlete-fx.css"', self.html)
        self.assertIn('<script src="athlete-fx.js"></script>', self.html)

        # Confirm celebratory and HUD elements in DOM
        self.assertTrue(find_dom_id(self.html, "rpe-hero-card"), "#rpe-hero-card must exist in index.html")
        self.assertTrue(find_dom_id(self.html, "set-celebration-stage"), "#set-celebration-stage must exist")
        self.assertTrue(find_dom_id(self.html, "burst-emitter"), "#burst-emitter must exist")
        self.assertTrue(find_dom_id(self.html, "set-summary-banner"), "#set-summary-banner must exist")
        self.assertTrue(find_dom_id(self.html, "in-flight-coach-cue"), "#in-flight-coach-cue must exist")
        self.assertTrue(find_dom_id(self.html, "coach-directive-modal"), "#coach-directive-modal must exist")

    # ─────────────────────────────────────────────────────────────────────────
    # 2. JavaScript Logic & Helpers Verification (athlete-fx.js)
    # ─────────────────────────────────────────────────────────────────────────

    def test_07_js_function_definitions(self):
        """athlete-fx.js must export triggerSetCompletionCelebration and renderVelocityZoneBadge."""
        self.assertIn("function triggerSetCompletionCelebration", self.fx_js)
        self.assertIn("function renderVelocityZoneBadge", self.fx_js)
        self.assertIn("function getVelocityZone", self.fx_js)
        self.assertIn("function emitCelebrationSparks", self.fx_js)
        self.assertIn("function startRestCountdown", self.fx_js)
        self.assertIn("function showCoachCue", self.fx_js)
        self.assertIn("function showCoachDirectiveModal", self.fx_js)

        # Global export check
        self.assertIn("global.triggerSetCompletionCelebration = triggerSetCompletionCelebration", self.fx_js)
        self.assertIn("global.renderVelocityZoneBadge = renderVelocityZoneBadge", self.fx_js)

    def test_08_sound_and_haptics_fanfare_integration(self):
        """playCelebrationFanfare must connect to SoundFX and HapticsFX without external dependencies."""
        self.assertIn("playCelebrationFanfare", self.fx_js)
        self.assertIn("SoundFX", self.fx_js)
        self.assertIn("HapticsFX", self.fx_js)
        self.assertIn("playSetTriumph", self.fx_js)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Constraint R4 & Zero Emojis
    # ─────────────────────────────────────────────────────────────────────────

    def test_09_strict_r4_compliance_zero_restricted_terms(self):
        """athlete-fx.css and athlete-fx.js must strictly contain zero occurrences of restricted terms."""
        forbidden_pattern = re.compile(
            r'\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|hardware)\b',
            re.IGNORECASE
        )
        self.assertIsNone(
            forbidden_pattern.search(self.fx_css),
            f"Restricted term found in athlete-fx.css: {forbidden_pattern.search(self.fx_css)}"
        )
        self.assertIsNone(
            forbidden_pattern.search(self.fx_js),
            f"Restricted term found in athlete-fx.js: {forbidden_pattern.search(self.fx_js)}"
        )

    def test_10_zero_emojis_in_fx_files(self):
        """athlete-fx.css and athlete-fx.js must contain zero emojis or decorative pictographs."""
        self.assertEqual(len(find_emojis_in_text(self.fx_css)), 0, "No emojis allowed in athlete-fx.css")
        self.assertEqual(len(find_emojis_in_text(self.fx_js)), 0, "No emojis allowed in athlete-fx.js")


if __name__ == "__main__":
    unittest.main()
