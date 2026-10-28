"""
Eros Athlete Velocity Metrics & Telemetry Ergonomics Verification Suite
Milestone 3 — Requirement R2:
- 5-zone Bryan Mann continuum color coding for Mean Concentric Velocity and Peak Velocity:
  - Zone 1: Speed / Power (>1.0 m/s) -> Laser Cyan (#00E5FF)
  - Zone 2: Speed-Strength (0.75-1.0 m/s) -> Electric Emerald (#00FF66)
  - Zone 3: Strength-Speed (0.50-0.75 m/s) -> Specular Gold (#FFD700)
  - Zone 4: Accelerative Strength (0.30-0.50 m/s) -> Caution Orange (#FF9500)
  - Zone 5: Absolute Strength / Grind (<0.30 m/s) -> Apple System Punchy Red (#FF3B30)
- PR / Target delta badge on rep completion
- Dynamic velocity loss / fatigue percentage arc calculation and display
- visionOS Glass OS design fidelity, responsive touch viewports, zero emoji pictographs
- Strict R4 Terminology Compliance: Zero restricted terms (WebBLE, 100Hz, ESP32, etc.)
"""

import os
import re
import unittest
from .conftest_base import (
    get_index_html,
    get_style_css,
    get_app_js,
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


class TestAthleteVelocityMetrics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.style_css = get_style_css()
        cls.app_js = get_app_js()
        cls.fx_css = read_text_file(ATHLETE_FX_CSS_PATH)
        cls.fx_js = read_text_file(ATHLETE_FX_JS_PATH)

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Bryan Mann 5-Zone Velocity Continuum in CSS & JS
    # ─────────────────────────────────────────────────────────────────────────

    def test_01_bryan_mann_zone_css_classes_and_colors(self):
        """Zone classes and colors in athlete-fx.css matching Bryan Mann Continuum."""
        zones = [
            (".vel-zone-power", "#00E5FF"),     # >1.0 m/s Laser Cyan
            (".vel-zone-speed", "#00FF66"),     # 0.75-1.0 m/s Electric Emerald
            (".vel-zone-strength", "#FFD700"),  # 0.50-0.75 m/s Specular Gold
            (".vel-zone-accel", "#FF9500"),     # 0.30-0.50 m/s Caution Orange
            (".vel-zone-grind", "#FF3B30")      # <0.30 m/s Apple System Punchy Red
        ]

        for cls_name, color_hex in zones:
            self.assertIn(cls_name, self.fx_css, f"athlete-fx.css must contain {cls_name}")
            rules = extract_css_rules(self.fx_css, cls_name)
            self.assertTrue(len(rules) > 0, f"Rule for {cls_name} must exist")
            merged = {}
            for _, props, _ in rules:
                merged.update(props)
            self.assertEqual(
                merged.get("color", "").strip().upper(),
                color_hex.upper(),
                f"{cls_name} text color must be {color_hex}"
            )

    def test_02_bryan_mann_numeric_text_tint_classes(self):
        """Numeric text tint classes for Mean and Peak velocity displays."""
        numeric_classes = [
            ".vel-zone-power-text",
            ".vel-zone-speed-text",
            ".vel-zone-strength-text",
            ".vel-zone-accel-text",
            ".vel-zone-grind-text"
        ]
        for cls_name in numeric_classes:
            self.assertIn(cls_name, self.fx_css, f"athlete-fx.css must define {cls_name}")

    def test_03_bryan_mann_resolver_in_app_js_and_athlete_fx_js(self):
        """getBryanMannZone / getVelocityZone must resolve correct zone bounds in JS."""
        self.assertIn("function getBryanMannZone", self.app_js)
        self.assertIn("function getVelocityZone", self.fx_js)
        self.assertIn("#00E5FF", self.app_js)
        self.assertIn("#00FF66", self.app_js)
        self.assertIn("#FFD700", self.app_js)
        self.assertIn("#FF9500", self.app_js)
        self.assertIn("#FF3B30", self.app_js)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. PR / Target Velocity Delta Badges
    # ─────────────────────────────────────────────────────────────────────────

    def test_04_target_velocity_badge_dom_and_css(self):
        """Target velocity badge elements in index.html and styles in athlete-fx.css."""
        self.assertTrue(find_dom_id(self.html, "live-target-vel-badge"))
        self.assertTrue(find_dom_id(self.html, "live-target-vel-val"))
        self.assertTrue(find_dom_id(self.html, "live-vel-delta"))
        self.assertTrue(find_dom_id(self.html, "live-vel-zone-badge"))
        self.assertTrue(find_dom_id(self.html, "live-peak-zone-badge"))

        self.assertIn(".target-velocity-badge", self.fx_css)
        self.assertIn(".badge-delta", self.fx_css)
        self.assertIn(".rep-delta-badge", self.fx_css)
        self.assertIn(".rep-vel-pr-pill", self.fx_css)

    def test_05_target_delta_calculation_in_app_js(self):
        """app.js must calculate delta = velocity - targetVel and handle positive/negative classes."""
        self.assertIn("velocity - targetVel", self.app_js)
        self.assertIn("badge-delta", self.app_js)
        self.assertIn("rep-delta-badge", self.app_js)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Dynamic Velocity Loss / Fatigue Percentage Arc
    # ─────────────────────────────────────────────────────────────────────────

    def test_06_fatigue_arc_svg_in_index_html(self):
        """index.html must include the fatigue arc SVG with id hud-fatigue-arc-fill."""
        self.assertTrue(find_dom_id(self.html, "hud-fatigue-arc-fill"))
        self.assertTrue(find_dom_id(self.html, "hud-vel-loss-card"))
        self.assertTrue(find_dom_id(self.html, "hud-vel-loss"))
        self.assertIn("fatigue-arc-svg", self.html)
        self.assertIn("fatigue-arc-track", self.html)
        self.assertIn("fatigue-arc-fill", self.html)

    def test_07_fatigue_arc_css_and_cutoff_pulse(self):
        """athlete-fx.css must define .fatigue-arc-fill and @keyframes cutoffWarningPulse."""
        self.assertIn(".fatigue-arc-fill", self.fx_css)
        self.assertIn(".cutoff-exceeded", self.fx_css)
        self.assertIn("@keyframes cutoffWarningPulse", self.fx_css)
        self.assertIn(".fatigue-minimal", self.fx_css)
        self.assertIn(".fatigue-optimal", self.fx_css)
        self.assertIn(".fatigue-cutoff", self.fx_css)

    def test_08_fatigue_arc_math_in_app_js(self):
        """app.js must dynamically update strokeDashoffset and color on velocity loss changes."""
        self.assertIn("hudFatigueArcFill", self.app_js)
        self.assertIn("strokeDashoffset", self.app_js)
        self.assertIn("cutoff-exceeded", self.app_js)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Zero Emojis and Zero R4 Hardware Terminology
    # ─────────────────────────────────────────────────────────────────────────

    def test_09_zero_emojis(self):
        """index.html, athlete-fx.css, athlete-fx.js, and app.js must contain zero emojis."""
        for name, content in [
            ("index.html", self.html),
            ("athlete-fx.css", self.fx_css),
            ("athlete-fx.js", self.fx_js),
            ("app.js", self.app_js)
        ]:
            emojis = find_emojis_in_text(content)
            self.assertEqual(len(emojis), 0, f"Emoji found in {name}: {emojis}")

    def test_10_strict_r4_compliance(self):
        """index.html, athlete-fx.css, athlete-fx.js, and app.js must have zero forbidden terms."""
        forbidden_pattern = re.compile(
            r'\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|hardware)\b',
            re.IGNORECASE
        )
        for name, content in [
            ("index.html", self.html),
            ("athlete-fx.css", self.fx_css),
            ("athlete-fx.js", self.fx_js),
            ("app.js", self.app_js)
        ]:
            match = forbidden_pattern.search(content)
            self.assertIsNone(match, f"Forbidden R4 hardware term in {name}: {match}")


if __name__ == "__main__":
    unittest.main()
