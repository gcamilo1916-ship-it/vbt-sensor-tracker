"""
Eros UI Polish & Workout Page Verification Suite
Covers all 9 UI/UX and functional requirements:
  1. Target RPE chips (@7.0-@9.5) unclipped geometry when active/clicked
  2. Lift selection pill WCAG AA+ text contrast (>= 4.5:1) for Deadlift, Squat, Bench
  3. Emoji-free velocity subtext ("Rep Completed: Explosive" / "Rep Completed: Grinding")
  4. Left-aligned MVT Baseline subtitle (#live-rpe-sub / .rpe-baseline-sub)
  5. "WARMUP" tier badge text (replacing "WARMUP TIER")
  6. Set movement denomination tagging & automatic set end/save on mid-set lift change
  7. "Workout" navigation item and page (#workout-summary-card + #workout-sets-table)
  8. "Eros" wordmark styling in connection sheet & slide-down/drag-to-dismiss interaction
  9. Complete purge of hardware terminology from HTML, CSS, and JS
"""

import re
import unittest
from .conftest_base import (
    get_index_html,
    get_style_css,
    get_app_js,
    extract_css_rules,
    extract_css_token,
    find_dom_id,
    find_emojis_in_text
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


def contains_emoji(text):
    return len(find_emojis_in_text(text)) > 0


class TestErosUiPolish(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = get_index_html()
        cls.css = get_style_css()
        cls.js = get_app_js()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Target RPE chips (@7.0 - @9.5) clipping fix
    # ─────────────────────────────────────────────────────────────────────────

    def test_polish_01_target_rpe_chips_no_scrollport_clipping(self):
        """Req 1: .target-rpe-chips must use overflow: visible with vertical padding so active chips never clip."""
        rules = extract_css_rules(self.css, ".target-rpe-chips")
        self.assertTrue(len(rules) > 0, ".target-rpe-chips rule must exist in style.css")
        merged = {}
        for _, props, _ in rules:
            merged.update(props)
        self.assertEqual(
            merged.get("overflow", "").strip(),
            "visible",
            ".target-rpe-chips must set overflow: visible to prevent scrollport clipping"
        )
        self.assertNotIn("overflow-x", merged, ".target-rpe-chips must not set overflow-x: auto which forces overflow-y: auto")

        active_rules = extract_css_rules(self.css, ".target-chip.active")
        self.assertTrue(len(active_rules) > 0, ".target-chip.active rule must exist")
        for _, props, _ in active_rules:
            transform_val = props.get("transform", "")
            self.assertNotIn(
                "translateY(-",
                transform_val,
                ".target-chip.active must not translate upward into a clipping boundary"
            )

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Lift selection pill lighter accent tint & WCAG AA+ contrast
    # ─────────────────────────────────────────────────────────────────────────

    def test_polish_02_lift_pill_lighter_tint_wcag_contrast(self):
        """Req 2: Lift pill text colors (--lift-text-dl/sq/bp) must achieve >= 4.5:1 WCAG contrast on dark glass."""
        dl_text = extract_css_token(self.css, "--lift-text-dl")
        sq_text = extract_css_token(self.css, "--lift-text-sq")
        bp_text = extract_css_token(self.css, "--lift-text-bp")

        self.assertIsNotNone(dl_text, "--lift-text-dl token must be defined in style.css")
        self.assertIsNotNone(sq_text, "--lift-text-sq token must be defined in style.css")
        self.assertIsNotNone(bp_text, "--lift-text-bp token must be defined in style.css")

        for name, hex_val in [("Deadlift", dl_text), ("Squat", sq_text), ("Bench", bp_text)]:
            ratio_card = wcag_contrast_ratio(hex_val, "#0F111A")
            ratio_void = wcag_contrast_ratio(hex_val, "#050508")
            self.assertGreaterEqual(
                ratio_card, 4.5,
                f"{name} pill text color {hex_val} contrast against #0F111A is {ratio_card:.2f}:1 (< 4.5:1)"
            )
            self.assertGreaterEqual(
                ratio_void, 4.5,
                f"{name} pill text color {hex_val} contrast against #050508 is {ratio_void:.2f}:1 (< 4.5:1)"
            )

        # Verify .select-value uses var(--current-lift-text)
        select_val_rules = extract_css_rules(self.css, ".select-value")
        self.assertTrue(
            any("var(--current-lift-text)" in p.get("color", "") for _, p, _ in select_val_rules),
            ".select-value must use color: var(--current-lift-text)"
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Emoji removal from velocity animation pill
    # ─────────────────────────────────────────────────────────────────────────

    def test_polish_03_velocity_pill_has_no_emojis(self):
        """Req 3: Velocity subtext pill must use plain text ('Explosive' / 'Grinding') with zero emojis."""
        self.assertIn(
            "`Rep Completed: ${velocity >= 0.5 ? 'Explosive' : 'Grinding'}`",
            self.js,
            "updateLiveDisplay must format liveVelSub without emojis"
        )
        self.assertFalse(contains_emoji(self.html), "index.html must contain zero emojis")
        self.assertFalse(contains_emoji(self.css), "style.css must contain zero emojis")
        self.assertFalse(contains_emoji(self.js), "app.js must contain zero emojis")

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Left-aligned MVT Baseline subtitle
    # ─────────────────────────────────────────────────────────────────────────

    def test_polish_04_mvt_baseline_left_aligned(self):
        """Req 4: #live-rpe-sub / .rpe-baseline-sub must be left-aligned so it avoids the right-side target pin."""
        rules = extract_css_rules(self.css, ".rpe-baseline-sub") + extract_css_rules(self.css, "#live-rpe-sub")
        self.assertTrue(len(rules) > 0, ".rpe-baseline-sub or #live-rpe-sub must be styled in style.css")
        merged = {}
        for _, props, _ in rules:
            merged.update(props)
        self.assertEqual(merged.get("text-align", "").strip(), "left")
        self.assertEqual(merged.get("align-self", "").strip(), "flex-start")

    # ─────────────────────────────────────────────────────────────────────────
    # 5. "WARMUP" instead of "WARMUP TIER"
    # ─────────────────────────────────────────────────────────────────────────

    def test_polish_05_warmup_badge_text(self):
        """Req 5: #rpe-tier-badge must display 'WARMUP' and never 'WARMUP TIER'."""
        self.assertNotIn("WARMUP TIER", self.html, "index.html must not contain 'WARMUP TIER'")
        self.assertNotIn("WARMUP TIER", self.js, "app.js must not contain 'WARMUP TIER'")
        self.assertIn('id="rpe-tier-badge">WARMUP<', self.html)
        self.assertIn("badge.textContent = 'WARMUP';", self.js)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Set movement denomination tagging & mid-set lift change auto-end
    # ─────────────────────────────────────────────────────────────────────────

    def test_polish_06_set_lift_tagging_and_auto_end_on_lift_change(self):
        """Req 6: Changing lift while a set is active must end & save that set under its original lift."""
        # Verify applyLiftTheme ends activeSet when lift changes
        apply_match = re.search(r'function applyLiftTheme\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(apply_match, "applyLiftTheme must exist in app.js")
        apply_body = apply_match.group(1)
        self.assertIn("activeSet", apply_body)
        self.assertIn("endActiveSet()", apply_body)

        # Verify recordRepetition also guards against cross-lift contamination
        rec_match = re.search(r'function recordRepetition\([^)]*\)\s*\{([\s\S]*?)\n\}', self.js)
        self.assertIsNotNone(rec_match, "recordRepetition must exist in app.js")
        rec_body = rec_match.group(1)
        self.assertIn("endActiveSet()", rec_body)
        self.assertIn("startNewSet(repLift)", rec_body)

        # Verify #set-lift-name has lift-tag class and data-lift attribute
        self.assertIn('id="set-lift-name"', self.html)
        self.assertIn("setLiftName.setAttribute('data-lift'", self.js)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. "Workout" menu item and page
    # ─────────────────────────────────────────────────────────────────────────

    def test_polish_07_workout_nav_and_page_structure(self):
        """Req 7: Bottom nav item for data-target='set' must be labeled 'WORKOUT' and #tab-set must show workout summary & sets table."""
        nav_match = re.search(
            r'<button[^>]*class="nav-tab"[^>]*data-target="set"[^>]*>([\s\S]*?)</button>',
            self.html
        )
        self.assertIsNotNone(nav_match, "Bottom nav button for data-target='set' must exist")
        self.assertIn("WORKOUT", nav_match.group(1))

        required_workout_ids = [
            "workout-summary-card",
            "workout-summary-status",
            "workout-sum-sets",
            "workout-sum-reps",
            "workout-sum-avg-vel",
            "workout-sum-peak-vel",
            "current-set-card",
            "workout-sets-section",
            "workout-sets-counter",
            "workout-sets-table"
        ]
        for dom_id in required_workout_ids:
            self.assertTrue(find_dom_id(self.html, dom_id), f"Workout page (#tab-set) must contain #{dom_id}")

        self.assertIn("function updateWorkoutPage()", self.js)

        # Verify workout summary card classes in index.html match style.css rules
        metric_rules = extract_css_rules(self.css, ".workout-summary-metric")
        self.assertTrue(len(metric_rules) > 0, ".workout-summary-metric must be styled in style.css")
        merged_metric = {}
        for _, props, _ in metric_rules:
            merged_metric.update(props)
        self.assertEqual(merged_metric.get("display", "").strip(), "flex")
        self.assertEqual(merged_metric.get("flex-direction", "").strip(), "column")
        self.assertTrue(len(extract_css_rules(self.css, ".workout-summary-title")) > 0)
        self.assertTrue(len(extract_css_rules(self.css, ".workout-summary-val")) > 0)
        self.assertTrue(len(extract_css_rules(self.css, ".workout-summary-lbl")) > 0)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Eros wordmark in connection sheet & slideable drag-to-dismiss
    # ─────────────────────────────────────────────────────────────────────────

    def test_polish_08_eros_wordmark_and_draggable_sheet(self):
        """Req 8: Connection sheet must style 'Eros' with .eros-wordmark and support dragging down to dismiss."""
        self.assertTrue(find_dom_id(self.html, "ble-drag-zone"), "#ble-drag-zone must exist in connection sheet")
        self.assertTrue(find_dom_id(self.html, "ble-search-handle"), "#ble-search-handle must exist in connection sheet")
        self.assertIn('class="eros-wordmark">Eros</span>', self.html)
        self.assertIn(".eros-wordmark", self.css)
        self.assertIn("function initBleSheetDrag()", self.js)
        self.assertIn("sheetHeight * 0.35", self.js)
        self.assertIn("resetBleSheetDragTransform()", self.js)

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Complete purge of hardware terminology
    # ─────────────────────────────────────────────────────────────────────────

    def test_polish_09_zero_hardware_strings_in_codebase(self):
        """Req 9: index.html, style.css, app.js, and web app docs must contain zero hardware terms (except internal DEVICE_NAME)."""
        import os
        forbidden_pattern = re.compile(
            r'\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|hardware)\b',
            re.IGNORECASE
        )
        self.assertIsNone(
            forbidden_pattern.search(self.html),
            f"Forbidden hardware term found in index.html: {forbidden_pattern.search(self.html)}"
        )
        self.assertIsNone(
            forbidden_pattern.search(self.css),
            f"Forbidden hardware term found in style.css: {forbidden_pattern.search(self.css)}"
        )
        self.assertIsNone(
            forbidden_pattern.search(self.js),
            f"Forbidden hardware term found in app.js: {forbidden_pattern.search(self.js)}"
        )

        # Also check web app docs in root folder
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        for doc_name in ("vbt_architecture.md", "TEST_INFRA.md", "TEST_READY.md"):
            doc_path = os.path.join(repo_root, doc_name)
            if os.path.exists(doc_path):
                with open(doc_path, "r", encoding="utf-8") as f:
                    doc_text = f.read()
                self.assertIsNone(
                    forbidden_pattern.search(doc_text),
                    f"Forbidden hardware term found in {doc_name}: {forbidden_pattern.search(doc_text)}"
                )

        # VBT_Tracker must appear ONLY in the single internal constant declaration in app.js
        self.assertNotIn("VBT_Tracker", self.html)
        self.assertNotIn("VBT_Tracker", self.css)
        vbt_tracker_matches = re.findall(r'VBT_Tracker', self.js)
        self.assertEqual(
            len(vbt_tracker_matches), 1,
            "VBT_Tracker must only appear once in app.js as the internal DEVICE_NAME constant"
        )


if __name__ == "__main__":
    unittest.main()
