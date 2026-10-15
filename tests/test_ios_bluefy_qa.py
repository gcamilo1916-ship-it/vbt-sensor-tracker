"""
iOS Phone Viewport & Bluefy WebBLE QA Test Suite
Validates:
- Live Peak Velocity DOM binding, updates, and set lifecycle synchronization
- Target RPE slider CSS smooth transition and spring pop animations
- Web Audio auto-resume and tone preservation under iOS suspension
- HapticsFX singleton AudioContext reuse (prevention of WebKit hardware context exhaustion)
- Stepper and quick-chip audio/tactile feedback wiring
- Target RPE reached alert propagation to both stepper module and hero velocity focus card
- Bluetooth search sheet Escape key dismissal and touch interaction
- Floating navigation bar hardware acceleration and safe area constraints
"""

import unittest
import re
from .conftest_base import (
    get_index_html,
    get_style_css,
    get_app_js,
    extract_css_rules
)

class TestIOSBluefyQA(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    def test_01_live_peak_vel_dom_and_js_binding(self):
        """Verify #live-peak-vel is present in HTML and bound/updated in app.js."""
        self.assertIn('id="live-peak-vel"', self.html, "index.html must have #live-peak-vel")
        self.assertIn('document.getElementById(\'live-peak-vel\')', self.js, "app.js must select #live-peak-vel")
        self.assertIn('livePeakVel.textContent', self.js, "app.js must update livePeakVel.textContent")

    def test_02_live_peak_vel_updated_in_update_live_display(self):
        """Verify updateLiveDisplay updates peak velocity from activeSet or rep."""
        self.assertIn('function updateLiveDisplay', self.js)
        # Check that livePeakVel is updated inside updateLiveDisplay
        update_match = re.search(r'function updateLiveDisplay\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(update_match, "updateLiveDisplay must exist in app.js")
        body = update_match.group(1)
        self.assertIn('livePeakVel.textContent', body, "livePeakVel must be updated inside updateLiveDisplay")

    def test_03_target_rpe_pin_css_transition(self):
        """Verify .rpe-target-pin defines smooth left transition in style.css."""
        self.assertIn('.rpe-target-pin', self.css)
        rules = extract_css_rules(self.css, ".rpe-target-pin")
        has_left_transition = False
        for _, props, _ in rules:
            t = props.get("transition", "")
            if "left" in t:
                has_left_transition = True
                break
        self.assertTrue(has_left_transition, ".rpe-target-pin must have CSS transition for 'left' property")

    def test_04_target_rpe_reached_hero_card_pulse(self):
        """Verify target reached alert pulses both the stepper module and hero velocity focus card."""
        self.assertIn('target-reached-pulse', self.css, "style.css must have target-reached-pulse rule")
        self.assertIn('heroTargetPulse', self.css, "style.css must have heroTargetPulse @keyframes")
        self.assertIn('rpeHeroCard.classList.add(\'target-reached-pulse\')', self.js,
                      "triggerTargetReachedAlert in app.js must pulse rpeHeroCard")

    def test_05_soundfx_auto_resume_on_suspended_ctx(self):
        """Verify SoundFX checks for suspended state and resumes rather than dropping audio."""
        self.assertIn('ctx.state === \'suspended\'', self.js, "SoundFX must handle suspended audio context")
        self.assertIn('ctx.resume()', self.js, "SoundFX must call ctx.resume()")
        self.assertIn('playToneActual', self.js, "SoundFX must chain playToneActual upon resumption")

    def test_06_hapticsfx_reuses_singleton_audio_context(self):
        """Verify HapticsFX does NOT instantiate new AudioContext instances on every vibration."""
        haptics_match = re.search(r'const HapticsFX = \(\(\) => \{([\s\S]*?)\}\)\(\);', self.js)
        self.assertIsNotNone(haptics_match, "HapticsFX definition must exist in app.js")
        body = haptics_match.group(1)
        self.assertNotIn('new AudioCtxClass()', body,
                         "HapticsFX must NOT call new AudioCtxClass() per vibration (avoids hardware context exhaustion)")
        self.assertIn('SoundFX.playSubBassThump()', body,
                      "HapticsFX must reuse SoundFX sub-bass thump on iOS")

    def test_07_touch_and_pointer_active_states_bound(self):
        """Verify initTouchActiveStates binds both touch and pointer events."""
        init_match = re.search(r'function initTouchActiveStates\(\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(init_match, "initTouchActiveStates must exist")
        body = init_match.group(1)
        self.assertIn('touchstart', body)
        self.assertIn('pointerdown', body)
        self.assertIn('pointerup', body)

    def test_08_bluetooth_search_sheet_escape_dismissal(self):
        """Verify Escape key listener dismisses bluetooth search sheet."""
        self.assertIn('Escape', self.js)
        self.assertIn('closeBleSearchSheet()', self.js)

    def test_09_bottom_glass_nav_hardware_acceleration(self):
        """Verify .bottom-glass-nav includes WebKit hardware acceleration properties."""
        rules = extract_css_rules(self.css, ".bottom-glass-nav")
        self.assertTrue(len(rules) > 0, ".bottom-glass-nav must exist in style.css")
        props_merged = {}
        for _, p, _ in rules:
            props_merged.update(p)
        self.assertTrue(
            "fixed" in props_merged.get("position", ""),
            ".bottom-glass-nav must be position: fixed"
        )
        self.assertTrue(
            "transform" in props_merged.get("will-change", "") or
            "transform" in self.css,
            ".bottom-glass-nav must specify hardware acceleration"
        )

    def test_10_target_rpe_stepper_and_chip_feedback(self):
        """Verify stepper buttons and chip handlers trigger feedback."""
        self.assertIn('playStepperTick', self.js, "SoundFX must define playStepperTick")
        self.assertIn('setTargetRpe(currentTargetRpe - 0.5, true)', self.js,
                      "btnTargetRpeDec must trigger feedback")
        self.assertIn('setTargetRpe(currentTargetRpe + 0.5, true)', self.js,
                      "btnTargetRpeInc must trigger feedback")

if __name__ == '__main__':
    unittest.main()
