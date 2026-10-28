"""
Eros Coach Interaction HUD & Cue Specialist Verification Suite
Validates:
  1. In-flight floating cue pill (#coach-cue-hud) DOM and styling
  2. Rest period Coach Directive Modal (#coach-directive-modal) DOM, ARIA, and styling
  3. 20-Second SVG Auto-Accept Countdown Ring (#countdown-ring-svg, #coach-accept-ring)
  4. Subtle acoustic chime in SoundFX (playCoachDirectiveChime, playCoachCueIncoming)
  5. Sync bus event coordination with ErosSyncBus (coach:cue, coach:load_override, coach:load_response)
  6. Strict R4 terminology compliance (zero hardware terms, zero emojis, pure Eros)
  7. End-to-end headless simulation execution
"""

import os
import re
import subprocess
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INDEX_HTML = os.path.join(ROOT_DIR, "index.html")
COACH_HUD_CSS = os.path.join(ROOT_DIR, "coach-cue-hud.css")
COACH_HUD_JS = os.path.join(ROOT_DIR, "coach-cue-hud.js")
SYNC_BUS_JS = os.path.join(ROOT_DIR, "sync-bus.js")
APP_JS = os.path.join(ROOT_DIR, "app.js")
E2E_JS_TEST = os.path.join(ROOT_DIR, "tests", "test_coach_cue_hud_e2e.js")

FORBIDDEN_TERMS = [
    r'\bwebble\b',
    r'\b100hz\b',
    r'\besp32\b',
    r'\besp32-c6\b',
    r'\bimu\b',
    r'\bmadgwick\b',
    r'\bbluefy\b',
    r'\bsensor\b',
    r'\bhardware\b'
]

EMOJI_PATTERN = re.compile(
    r"["
    r"\U00010000-\U0010ffff"
    r"\u2600-\u27bf"
    r"\u2300-\u23ff"
    r"\u2b50-\u2b55"
    r"]",
    re.UNICODE
)


def read_file(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


class TestCoachCueHud(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = read_file(INDEX_HTML)
        cls.css = read_file(COACH_HUD_CSS)
        cls.js = read_file(COACH_HUD_JS)
        cls.sync_bus_js = read_file(SYNC_BUS_JS)
        cls.app_js = read_file(APP_JS)

    def test_01_dom_elements_presence(self):
        """Verify all required Coach HUD and Directive modal elements in index.html."""
        # 1. In-flight floating cue pill
        self.assertIn('id="coach-cue-hud"', self.html, "Missing #coach-cue-hud in index.html")
        self.assertIn('id="coach-cue-text"', self.html, "Missing #coach-cue-text inside cue pill")
        self.assertIn('role="status"', self.html, "#coach-cue-hud must have role='status'")
        self.assertIn('aria-live="polite"', self.html, "#coach-cue-hud must have aria-live='polite'")

        # 2. Rest period Coach Directive Modal
        self.assertIn('id="coach-directive-modal"', self.html, "Missing #coach-directive-modal in index.html")
        self.assertIn('role="dialog"', self.html, "#coach-directive-modal must have role='dialog'")
        self.assertIn('aria-modal="true"', self.html, "#coach-directive-modal must have aria-modal='true'")
        self.assertIn('id="coach-directive-title"', self.html, "Missing #coach-directive-title")

        # 3. 20-Second SVG Auto-Accept Countdown Ring
        self.assertIn('id="countdown-ring-svg"', self.html, "Missing #countdown-ring-svg element")
        self.assertIn('id="coach-accept-ring"', self.html, "Missing #coach-accept-ring fill circle")
        self.assertIn('id="coach-countdown-sec"', self.html, "Missing #coach-countdown-sec text")

        # 4. Action Buttons
        self.assertIn('id="btn-directive-accept"', self.html, "Missing #btn-directive-accept")
        self.assertIn('id="btn-directive-decline"', self.html, "Missing #btn-directive-decline")

        # 5. Linked Assets
        self.assertIn('coach-cue-hud.css', self.html, "index.html must link coach-cue-hud.css")
        self.assertIn('coach-cue-hud.js', self.html, "index.html must include coach-cue-hud.js script")

    def test_02_css_glass_os_styling(self):
        """Verify visionOS Glass OS styling rules in coach-cue-hud.css."""
        # Frosted glass styling for cue pill
        self.assertIn('.coach-cue-pill', self.css)
        self.assertIn('backdrop-filter', self.css)
        self.assertIn('border-radius: 9999px', self.css)

        # Pulse animation for cue indicator dot
        self.assertIn('@keyframes cueDotPulse', self.css)
        self.assertIn('#BF5AF2', self.css, "Spatial violet accent must be present in styling")

        # Modal styling
        self.assertIn('.coach-directive-card', self.css)
        self.assertIn('.directive-actions', self.css)
        self.assertIn('.countdown-ring', self.css)
        self.assertIn('.auto-accept-fill', self.css)
        self.assertIn('81.68', self.css, "Ring stroke-dasharray must match 2*PI*13 circumference (81.68)")

        # Mobile responsiveness
        self.assertIn('@media (max-width: 480px)', self.css)

    def test_03_soundfx_acoustic_chime(self):
        """Verify SoundFX in app.js defines playCoachDirectiveChime and playCoachCueIncoming."""
        self.assertIn('playCoachDirectiveChime()', self.app_js, "SoundFX must define playCoachDirectiveChime()")
        self.assertIn('playCoachCueIncoming()', self.app_js, "SoundFX must define playCoachCueIncoming()")
        self.assertIn('vibrateCoachDirective()', self.app_js, "HapticsFX must define vibrateCoachDirective()")

    def test_04_sync_bus_event_coordination(self):
        """Verify coach:cue, coach:load_override, and coach:load_response hooks."""
        # sync-bus.js events
        self.assertIn("'coach:cue'", self.sync_bus_js)
        self.assertIn("'coach:load_override'", self.sync_bus_js)
        self.assertIn("'coach:load_response'", self.sync_bus_js)

        # coach-cue-hud.js handlers and emitters
        self.assertIn("bus.on('coach:cue'", self.js)
        self.assertIn("bus.on('coach:load_override'", self.js)
        self.assertIn("emit('coach:load_response'", self.js)
        self.assertIn('setWorkingWeight', self.js, "coach-cue-hud.js must call setWorkingWeight on accept")

    def test_05_strict_r4_compliance_and_zero_emojis(self):
        """Verify zero occurrences of restricted hardware terms and zero emojis."""
        files_to_check = {
            "coach-cue-hud.js": self.js,
            "coach-cue-hud.css": self.css
        }

        for filename, content in files_to_check.items():
            for pattern in FORBIDDEN_TERMS:
                match = re.search(pattern, content, re.IGNORECASE)
                self.assertIsNone(
                    match,
                    f"R4 Violation: Found forbidden term '{pattern}' in {filename}"
                )

            emoji_matches = EMOJI_PATTERN.findall(content)
            self.assertEqual(
                len(emoji_matches),
                0,
                f"Emoji Violation: Found emojis {emoji_matches} in {filename}"
            )

    def test_06_e2e_node_test_runner(self):
        """Execute the headless E2E test suite in Node.js and verify 100% passing results."""
        proc = subprocess.run(
            ["node", E2E_JS_TEST],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True
        )
        self.assertEqual(
            proc.returncode,
            0,
            f"Node E2E tests failed with exit code {proc.returncode}:\nOutput:\n{proc.stdout}\nErrors:\n{proc.stderr}"
        )
        self.assertIn("ALL COACH GUIDANCE & CUEING HUD TESTS PASSED (100% OK)", proc.stdout)


if __name__ == '__main__':
    unittest.main()
