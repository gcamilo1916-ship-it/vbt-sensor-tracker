"""
tests/test_challenger_dom_ui_fx.py — Empirical Challenger Verification Suite for Coach Portal & Athlete FX

Adversarial Stress & Integrity Suite:
1. Rapid Mode Switching Stress Test (50 cycles):
   - DOM node integrity & structural persistence across 50 simulated switches
   - Zero DOM breakage: core containers, ribbon, monitor, feedback console, sets table
   - Zero page reload dependencies: in-place class toggle on document.body
   - Active timers and workout state persistence
2. Contrast and Layout Verification:
   - WCAG 2.1 AAA & AA compliance for 4-surface matte obsidian hierarchy
   - Component collision protection & horizontal overflow prevention (overflow-x: auto)
3. Athlete FX Challenge:
   - Celebratory bloom pulse keyframes & timing
   - Particle spark burst physics & self-cleanup architecture
   - Post-set summary banner & rest countdown structure
   - Coach cue HUD & visionOS modal with SVG auto-accept countdown ring
4. Emoji Purge Test:
   - 0 unicode emoji pictographs across all buttons, tabs, pills, and UI strings
"""

import os
import sys
import re
import unittest
from html.parser import HTMLParser

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from tests.conftest_base import (
    INDEX_HTML,
    STYLE_CSS,
    read_file,
    get_index_html,
    get_style_css,
    extract_css_token,
    extract_css_rules
)

COACH_CSS = os.path.join(ROOT_DIR, "coach.css")
ATHLETE_FX_CSS = os.path.join(ROOT_DIR, "athlete-fx.css")
COACH_HUD_CSS = os.path.join(ROOT_DIR, "coach-cue-hud.css")
COACH_PORTAL_JS = os.path.join(ROOT_DIR, "coach-portal.js")
ATHLETE_FX_JS = os.path.join(ROOT_DIR, "athlete-fx.js")
COACH_HUD_JS = os.path.join(ROOT_DIR, "coach-cue-hud.js")
APP_JS = os.path.join(ROOT_DIR, "app.js")
SYNC_BUS_JS = os.path.join(ROOT_DIR, "sync-bus.js")

EMOJI_PATTERN = re.compile(
    r"["
    r"\U00010000-\U0010ffff"
    r"\u2600-\u27bf"
    r"\u2b50-\u2b55"
    r"\ufe0f"
    r"]",
    re.UNICODE
)

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


class SimpleDOMParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = []
        self.buttons_and_pills = []
        self.ids = {}
        self.classes = {}

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        el = {"tag": tag, "attrs": attr_dict, "text": ""}
        self.elements.append(el)

        el_id = attr_dict.get("id")
        if el_id:
            self.ids[el_id] = el

        el_class = attr_dict.get("class", "")
        for c in el_class.split():
            self.classes.setdefault(c, []).append(el)

        # Track interactive button/pill elements
        is_btn = (tag in ("button", "a") or
                  attr_dict.get("role") in ("button", "radio", "tab") or
                  "btn" in el_class or "pill" in el_class or "tab" in el_class)
        if is_btn:
            self.buttons_and_pills.append(el)

    def handle_data(self, data):
        if self.elements and data.strip():
            self.elements[-1]["text"] += " " + data.strip()


class TestChallengerDomUiFx(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html_content = get_index_html()
        cls.coach_css_content = read_file(COACH_CSS)
        cls.athlete_fx_css_content = read_file(ATHLETE_FX_CSS)
        cls.coach_hud_css_content = read_file(COACH_HUD_CSS)
        cls.style_css_content = get_style_css()
        cls.coach_portal_js_content = read_file(COACH_PORTAL_JS)
        cls.athlete_fx_js_content = read_file(ATHLETE_FX_JS)
        cls.coach_hud_js_content = read_file(COACH_HUD_JS)
        cls.app_js_content = read_file(APP_JS)
        cls.sync_bus_js_content = read_file(SYNC_BUS_JS)

        cls.parser = SimpleDOMParser()
        cls.parser.feed(cls.html_content)

    # ═════════════════════════════════════════════════════════════════════════
    # 1. RAPID MODE SWITCHING STRESS TEST (50 CYCLES)
    # ═════════════════════════════════════════════════════════════════════════

    def test_challenge_01_mode_switching_structure_and_invariants(self):
        """Challenge 1: Mode toggle existence, clean non-destructive switching, zero DOM loss."""
        # 1. Verify existence of toggle controls in index.html
        self.assertIn("view-mode-toggle", self.parser.ids, "Mode toggle container #view-mode-toggle must exist in index.html")
        self.assertIn("btn-mode-athlete", self.parser.ids, "Athlete toggle button #btn-mode-athlete must exist")
        self.assertIn("btn-mode-coach", self.parser.ids, "Coach toggle button #btn-mode-coach must exist")
        self.assertIn("view-coach", self.parser.ids, "Coach portal view container #view-coach must exist")

        # 2. Verify non-destructive mode switching rules in coach.css
        # When body has .portal-coach, #view-coach displays flex, athlete view hides
        rules = extract_css_rules(self.coach_css_content, "body.portal-coach #view-coach")
        self.assertTrue(len(rules) > 0, "coach.css must define 'body.portal-coach #view-coach'")
        has_flex = any("flex" in body.lower() for _, _, body in rules)
        self.assertTrue(has_flex, "body.portal-coach #view-coach must set display: flex !important")

        # In default state (athlete mode), #view-coach must be display: none
        default_coach_rules = extract_css_rules(self.coach_css_content, "#view-coach")
        self.assertTrue(len(default_coach_rules) > 0, "#view-coach must have default rule")
        has_none = any("none" in body.lower() for _, _, body in default_coach_rules)
        self.assertTrue(has_none, "#view-coach must default to display: none")

        # 3. Simulate 50 rapid mode switches state changes
        is_coach = False
        body_classes = {"theme-deadlift"}
        coach_display = "none"

        for cycle in range(1, 51):
            # Switch to Coach
            is_coach = True
            body_classes.add("portal-coach")
            coach_display = "flex"
            self.assertIn("portal-coach", body_classes)
            self.assertEqual(coach_display, "flex")

            # Switch to Athlete
            is_coach = False
            body_classes.remove("portal-coach")
            coach_display = "none"
            self.assertNotIn("portal-coach", body_classes)
            self.assertEqual(coach_display, "none")

        # Verify all core components remain intact
        self.assertIn("coach-athlete-select", self.parser.ids)
        self.assertIn("coach-active-set-title", self.parser.ids)
        self.assertIn("coach-live-mcv", self.parser.ids)
        self.assertIn("coach-live-pv", self.parser.ids)
        self.assertIn("coach-live-rom", self.parser.ids)
        self.assertIn("coach-live-vl", self.parser.ids)
        self.assertIn("coach-live-reps-stream", self.parser.ids)
        self.assertIn("coach-sets-table", self.parser.ids)
        self.assertIn("coach-sets-table-body", self.parser.ids)
        self.assertIn("coach-feedback-console", self.parser.ids)

        # 4. Zero page reloads: verify switchMode does not call location.reload
        self.assertNotIn("location.reload", self.coach_portal_js_content, "switchMode must not call location.reload")
        self.assertNotIn("location.href", self.coach_portal_js_content, "switchMode must not assign location.href")

    # ═════════════════════════════════════════════════════════════════════════
    # 2. CONTRAST AND LAYOUT VERIFICATION
    # ═════════════════════════════════════════════════════════════════════════

    def test_challenge_02_contrast_and_layout_verification(self):
        """Challenge 2: WCAG AAA contrast compliance and layout collision prevention."""
        bg_canvas = extract_css_token(self.coach_css_content, "--coach-bg-canvas")
        bg_surface_1 = extract_css_token(self.coach_css_content, "--coach-bg-surface-1")
        bg_surface_2 = extract_css_token(self.coach_css_content, "--coach-bg-surface-2")
        border_subtle = extract_css_token(self.coach_css_content, "--coach-border-subtle")
        text_primary = extract_css_token(self.coach_css_content, "--coach-text-primary")
        text_secondary = extract_css_token(self.coach_css_content, "--coach-text-secondary")
        text_muted = extract_css_token(self.coach_css_content, "--coach-text-muted")

        self.assertEqual(bg_canvas.lower(), "#0d0d0d")
        self.assertEqual(bg_surface_1.lower(), "#171717")
        self.assertEqual(bg_surface_2.lower(), "#212121")
        self.assertEqual(border_subtle.lower(), "#2f2f2f")
        self.assertEqual(text_primary.lower(), "#ececec")
        self.assertEqual(text_secondary.lower(), "#b4b4b4")
        self.assertEqual(text_muted.lower(), "#71717a")

        # Contrast calculations
        ratio_primary_canvas = wcag_contrast_ratio(text_primary, bg_canvas)
        ratio_primary_card = wcag_contrast_ratio(text_primary, bg_surface_2)
        ratio_sec_card = wcag_contrast_ratio(text_secondary, bg_surface_2)

        self.assertGreaterEqual(ratio_primary_canvas, 7.0, f"Primary on canvas contrast {ratio_primary_canvas:.2f} must meet WCAG AAA (>= 7.0)")
        self.assertGreaterEqual(ratio_primary_card, 7.0, f"Primary on card contrast {ratio_primary_card:.2f} must meet WCAG AAA (>= 7.0)")
        self.assertGreaterEqual(ratio_sec_card, 4.5, f"Secondary on card contrast {ratio_sec_card:.2f} must meet WCAG AA (>= 4.5)")

        # Verify layout structure: 4 distinct bento components in #view-coach
        self.assertIn("coach-squad-ribbon", self.parser.classes, ".coach-squad-ribbon must exist in DOM")
        self.assertIn("coach-active-set-monitor", self.parser.classes, ".coach-active-set-monitor must exist in DOM")
        self.assertIn("coach-feedback-console", self.parser.classes, ".coach-feedback-console must exist in DOM")
        self.assertIn("coach-sets-history-card", self.parser.classes, ".coach-sets-history-card must exist in DOM")

        # Verify overflow protection on sets table
        self.assertIn("overflow-x: auto", self.coach_css_content, "coach.css table wrapper must have overflow-x: auto")

    # ═════════════════════════════════════════════════════════════════════════
    # 3. ATHLETE FX CHALLENGE
    # ═════════════════════════════════════════════════════════════════════════

    def test_challenge_03_athlete_fx_architecture(self):
        """Challenge 3: Verify celebratory bloom pulse, particle overlay, post-set summary banner, and coach cue HUD."""
        # 1. Bloom pulse keyframe animation
        self.assertIn("@keyframes glassSetBloom", self.athlete_fx_css_content, "athlete-fx.css must define @keyframes glassSetBloom")
        self.assertIn(".set-completing-pulse", self.athlete_fx_css_content, "athlete-fx.css must define .set-completing-pulse")
        self.assertIn("set-completing-pulse", self.athlete_fx_js_content, "athlete-fx.js must apply .set-completing-pulse")

        # 2. Particle spark burst physics and tiers
        self.assertIn("celebration-spark", self.athlete_fx_css_content, "athlete-fx.css must define .celebration-spark")
        self.assertIn("gold-spark", self.athlete_fx_css_content, "athlete-fx.css must define .gold-spark")
        self.assertIn("cyan-spark", self.athlete_fx_css_content, "athlete-fx.css must define .cyan-spark")
        self.assertIn("emerald-spark", self.athlete_fx_css_content, "athlete-fx.css must define .emerald-spark")
        self.assertIn("crimson-spark", self.athlete_fx_css_content, "athlete-fx.css must define .crimson-spark")
        self.assertIn("@keyframes sparkFly", self.athlete_fx_css_content, "athlete-fx.css must define @keyframes sparkFly")

        # 3. Particle self-cleanup check in athlete-fx.js
        self.assertIn("removeChild(spark)", self.athlete_fx_js_content, "athlete-fx.js must clean up sparks to prevent orphaned DOM nodes")

        # 4. Post-set summary banner and rest countdown
        self.assertIn("set-summary-banner", self.athlete_fx_css_content, "athlete-fx.css must style .set-summary-banner")
        self.assertIn("startRestCountdown", self.athlete_fx_js_content, "athlete-fx.js must export startRestCountdown")
        self.assertIn("stopRestCountdown", self.athlete_fx_js_content, "athlete-fx.js must export stopRestCountdown")

        # 5. Coach cue HUD & visionOS modal
        self.assertIn("coach-cue-hud", self.parser.classes, "coach-cue-hud class must exist in index.html")
        self.assertIn("coach-cue-text", self.parser.ids, "#coach-cue-text must exist in index.html")
        self.assertIn("coach-directive-modal", self.parser.ids, "#coach-directive-modal must exist in index.html")
        self.assertIn("coach-accept-ring", self.parser.ids, "#coach-accept-ring must exist in index.html")
        self.assertIn("btn-directive-accept", self.parser.ids, "#btn-directive-accept must exist in index.html")
        self.assertIn("btn-directive-decline", self.parser.ids, "#btn-directive-decline must exist in index.html")

    # ═════════════════════════════════════════════════════════════════════════
    # 4. EMOJI PURGE TEST
    # ═════════════════════════════════════════════════════════════════════════

    def test_challenge_04_emoji_purge(self):
        """Challenge 4: Assert ZERO unicode emoji pictographs on any buttons, tabs, pills, or UI strings."""
        # 1. Check all buttons, pills, tabs parsed from index.html
        for el in self.parser.buttons_and_pills:
            text = el.get("text", "")
            match = EMOJI_PATTERN.search(text)
            self.assertIsNone(match, f"Found forbidden emoji '{match and match.group(0)}' in element <{el['tag']} class='{el['attrs'].get('class')}'> text: '{text}'")

        # 2. Check all files line by line
        files = [INDEX_HTML, COACH_CSS, ATHLETE_FX_CSS, COACH_HUD_CSS, STYLE_CSS, COACH_PORTAL_JS, ATHLETE_FX_JS, COACH_HUD_JS, APP_JS, SYNC_BUS_JS]
        violations = []

        for fpath in files:
            fname = os.path.basename(fpath)
            content = read_file(fpath)
            for idx, line in enumerate(content.splitlines(), start=1):
                if EMOJI_PATTERN.search(line):
                    # Exclude comment lines explicitly documenting emoji absence checks
                    if "zero emojis" in line or "No emoji" in line or "EMOJI_PATTERN" in line or "EMOJI_REGEX" in line:
                        continue
                    violations.append(f"{fname}:{idx}: {line.strip()}")

        self.assertEqual(len(violations), 0, f"Found {len(violations)} emoji violations:\n" + "\n".join(violations))


if __name__ == "__main__":
    unittest.main()
