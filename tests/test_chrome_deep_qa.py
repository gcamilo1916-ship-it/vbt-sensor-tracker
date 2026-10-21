"""
Deep Headless Chrome CDP Verification and Visual QA Test Suite.
Validates live DOM rendering, CSS computed styles, interactive dropdown behavior,
theme switching, tab navigation, and ensures zero console errors occur during runtime.
"""

import os
import json
import time
import socket
import urllib.request
import subprocess
import unittest

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
TARGET_URL = "file:///C:/Users/gcami/Documents/VBTanti/index.html"
DEBUG_PORT = 9560

class TestChromeDeepQA(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(CHROME_PATH):
            raise unittest.SkipTest("Chrome binary not found")
        
        cls.proc = subprocess.Popen([
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu",
            f"--remote-debugging-port={DEBUG_PORT}",
            "--remote-allow-origins=*",
            TARGET_URL
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Wait for port
        ready = False
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json/version", timeout=0.2) as resp:
                    if resp.status == 200:
                        ready = True
                        break
            except Exception:
                time.sleep(0.1)
                
        if not ready:
            cls.proc.terminate()
            raise unittest.SkipTest("Could not connect to Chrome debugging port")

        # Discover target page with retry loop to absorb transient Chrome startup disconnects
        eros_pages = []
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json/list", timeout=2) as resp:
                    pages = json.loads(resp.read().decode('utf-8'))
                    eros_pages = [p for p in pages if "index.html" in p.get("url", "")]
                    if eros_pages:
                        break
            except Exception:
                time.sleep(0.1)

        if not eros_pages:
            cls.proc.terminate()
            raise unittest.SkipTest("index.html target not found in Chrome")
        
        target = eros_pages[0]
        cls.ws_url = target['webSocketDebuggerUrl']
        path = '/' + cls.ws_url.split('/', 3)[3]

        cls.sock = socket.socket()
        cls.sock.connect(('127.0.0.1', DEBUG_PORT))
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{DEBUG_PORT}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        cls.sock.sendall(req.encode('utf-8'))
        cls.sock.recv(4096) # Handshake response

        cls.msg_id = 0
        cls.console_messages = []

        cls._send_cdp("Runtime.enable")
        cls._send_cdp("Log.enable")

        # Wait for document to finish loading and executing scripts
        for _ in range(50):
            rs = cls.eval_js("document.readyState")
            if rs in ("interactive", "complete"):
                break
            time.sleep(0.05)
        time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        try:
            if hasattr(cls, 'sock') and cls.sock:
                cls.sock.close()
        except Exception:
            pass
        if hasattr(cls, 'proc') and cls.proc:
            try:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(cls.proc.pid)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                try:
                    cls.proc.kill()
                except Exception:
                    pass

    @classmethod
    def _send_cdp(cls, method, params=None):
        cls.msg_id += 1
        msg = {"id": cls.msg_id, "method": method, "params": params or {}}
        payload = json.dumps(msg).encode('utf-8')
        length = len(payload)
        frame = bytearray([0x81])
        if length <= 125:
            frame.append(0x80 | length)
        elif length <= 65535:
            frame.append(0x80 | 126)
            frame.extend(length.to_bytes(2, 'big'))
        else:
            frame.append(0x80 | 127)
            frame.extend(length.to_bytes(8, 'big'))
        mask = os.urandom(4)
        frame.extend(mask)
        masked = bytearray(payload)
        for i in range(len(masked)):
            masked[i] ^= mask[i % 4]
        frame.extend(masked)
        cls.sock.sendall(frame)
        return cls.msg_id

    @classmethod
    def _recv_cdp(cls, timeout=3.0):
        cls.sock.settimeout(timeout)
        try:
            head = cls.sock.recv(2)
            if not head:
                return None
            b2 = head[1]
            length = b2 & 0x7f
            if length == 126:
                length = int.from_bytes(cls.sock.recv(2), 'big')
            elif length == 127:
                length = int.from_bytes(cls.sock.recv(8), 'big')
            data = bytearray()
            while len(data) < length:
                chunk = cls.sock.recv(length - len(data))
                if not chunk:
                    break
                data.extend(chunk)
            return json.loads(data.decode('utf-8'))
        except socket.timeout:
            return None

    @classmethod
    def eval_js(cls, expr):
        req_id = cls._send_cdp("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        start_time = time.time()
        while time.time() - start_time < 3.0:
            msg = cls._recv_cdp(timeout=1.0)
            if not msg:
                continue
            if msg.get("method") == "Runtime.consoleAPICalled":
                cls.console_messages.append(msg.get("params"))
            if msg.get("id") == req_id:
                res = msg.get("result", {}).get("result", {})
                if "value" in res:
                    return res["value"]
                return res
        return None

    def test_01_page_title_and_header_branding(self):
        """Verify title is 'Eros' and header displays 'Eros' without 'GLASS_OS'."""
        info = self.eval_js("""
            ({
                title: document.title,
                brandTitle: document.querySelector('.brand-title')?.textContent?.trim(),
                headerFullText: document.querySelector('.glass-header')?.textContent
            })
        """)
        self.assertEqual(info["title"], "Eros")
        self.assertEqual(info["brandTitle"], "Eros")
        self.assertNotIn("GLASS_OS", info["headerFullText"])
        self.assertNotIn("GLASS OS", info["headerFullText"])

    def test_02_button_emoji_purge_and_labels(self):
        """Verify action buttons contain no emojis and have clean visionOS labels."""
        import re
        emoji_regex = re.compile(r'[\U00010000-\U0010ffff\u2600-\u27bf\u2300-\u23ff\u2b50-\u2b55]')
        buttons = self.eval_js("""
            Array.from(document.querySelectorAll('button')).map(b => ({
                id: b.id,
                className: b.className,
                text: b.textContent.trim()
            }))
        """)
        for b in buttons:
            self.assertFalse(bool(emoji_regex.search(b["text"])), f"Emoji found in button {b['id']}: {b['text']}")

        btn_workout = next(b for b in buttons if b["id"] == "btn-workout-master")
        btn_connect = next(b for b in buttons if b["id"] == "btn-connect")
        btn_set = next(b for b in buttons if b["id"] == "btn-set-toggle")
        self.assertIn("START WORKOUT", btn_workout["text"])
        self.assertIn("CONNECT Eros", btn_connect["text"])
        self.assertIn("START SET", btn_set["text"])

    def test_03_pill_button_border_radius(self):
        """Verify visionOS pill capsule buttons have 999px border radius."""
        radii = self.eval_js("""
            ({
                btnWorkout: window.getComputedStyle(document.querySelector('#btn-workout-master')).borderRadius,
                btnConnect: window.getComputedStyle(document.querySelector('#btn-connect')).borderRadius,
                btnSet: window.getComputedStyle(document.querySelector('#btn-set-toggle')).borderRadius,
                btnCsv: window.getComputedStyle(document.querySelector('#btn-export-csv')).borderRadius,
                btnJson: window.getComputedStyle(document.querySelector('#btn-export-json')).borderRadius,
                btnClear: window.getComputedStyle(document.querySelector('#btn-clear-history')).borderRadius,
                navPill: window.getComputedStyle(document.querySelector('.bottom-glass-nav')).borderRadius
            })
        """)
        for name, val in radii.items():
            self.assertEqual(val, "999px", f"{name} border radius is {val}, expected 999px")

    def test_04_glass_card_backdrop_filter_and_blur(self):
        """Verify frosted glass cards have blur(30px) and saturate(180%)."""
        filters = self.eval_js("""
            ({
                cardBackdrop: window.getComputedStyle(document.querySelector('.controls-panel')).backdropFilter,
                arenaBackdrop: window.getComputedStyle(document.querySelector('.telemetry-arena')).backdropFilter
            })
        """)
        for name, val in filters.items():
            self.assertIn("blur(30px)", val, f"{name} backdrop filter must contain blur(30px)")
            self.assertIn("saturate(1.8)", val.replace("180%", "1.8"), f"{name} backdrop filter must contain saturate(180%)")

    def test_05_dropdown_interaction_and_no_clipping(self):
        """Verify dropdown opens cleanly, container overflow is visible, and theme updates on option click."""
        res = self.eval_js("""
            (() => {
                const wrapper = document.querySelector('#lift-select-wrapper');
                const trigger = wrapper.querySelector('.custom-select-trigger');
                const panel = document.querySelector('.controls-panel');
                const panelOverflow = window.getComputedStyle(panel).overflow;
                
                // Open dropdown
                trigger.click();
                const isOpen = wrapper.classList.contains('open');
                const dropdownZIndex = parseInt(window.getComputedStyle(wrapper.querySelector('.custom-select-options')).zIndex, 10);
                
                // Click Squat option
                const squatOpt = wrapper.querySelector('.custom-option[data-value="Squat"]');
                squatOpt.click();
                const isClosed = !wrapper.classList.contains('open');
                const bodyThemeAfterSquat = document.body.className;
                const selectedTextAfterSquat = document.querySelector('#selected-lift-text')?.textContent;
                
                // Click Bench option
                trigger.click();
                const benchOpt = wrapper.querySelector('.custom-option[data-value="Bench"]');
                benchOpt.click();
                const bodyThemeAfterBench = document.body.className;
                const selectedTextAfterBench = document.querySelector('#selected-lift-text')?.textContent;
                
                // Restore Deadlift
                trigger.click();
                const dlOpt = wrapper.querySelector('.custom-option[data-value="Deadlift"]');
                dlOpt.click();
                const bodyThemeAfterDL = document.body.className;
                
                return {
                    panelOverflow,
                    isOpen,
                    dropdownZIndex,
                    isClosed,
                    bodyThemeAfterSquat,
                    selectedTextAfterSquat,
                    bodyThemeAfterBench,
                    selectedTextAfterBench,
                    bodyThemeAfterDL
                };
            })()
        """)
        self.assertEqual(res["panelOverflow"], "visible", "Panel overflow must be visible to avoid clipping")
        self.assertTrue(res["isOpen"], "Dropdown must open on trigger click")
        self.assertGreaterEqual(res["dropdownZIndex"], 1000, "Dropdown z-index must be >= 1000")
        self.assertTrue(res["isClosed"], "Dropdown must close upon option selection")
        self.assertIn("theme-squat", res["bodyThemeAfterSquat"])
        self.assertEqual(res["selectedTextAfterSquat"], "SQUAT")
        self.assertIn("theme-bench", res["bodyThemeAfterBench"])
        self.assertEqual(res["selectedTextAfterBench"], "BENCH")
        self.assertIn("theme-deadlift", res["bodyThemeAfterDL"])

    def test_06_typography_tabular_figures(self):
        """Verify metric numbers use font-variant-numeric: tabular-nums."""
        variants = self.eval_js("""
            ({
                timer: window.getComputedStyle(document.querySelector('#session-timer-display')).fontVariantNumeric,
                vel: window.getComputedStyle(document.querySelector('#live-velocity')).fontVariantNumeric,
                rpe: window.getComputedStyle(document.querySelector('#live-rpe')).fontVariantNumeric,
                hudSet: window.getComputedStyle(document.querySelector('#hud-active-set')).fontVariantNumeric,
                hudReps: window.getComputedStyle(document.querySelector('#hud-set-reps')).fontVariantNumeric,
                hudLoss: window.getComputedStyle(document.querySelector('#hud-vel-loss')).fontVariantNumeric
            })
        """)
        for name, val in variants.items():
            self.assertEqual(val, "tabular-nums", f"{name} fontVariantNumeric must be tabular-nums")

    def test_07_tab_navigation_and_section_switching(self):
        """Verify bottom navigation tabs switch active sections cleanly."""
        res = self.eval_js("""
            (() => {
                const navTabs = Array.from(document.querySelectorAll('.nav-tab'));
                const tabLive = navTabs.find(t => t.dataset.target === 'live');
                const tabSet = navTabs.find(t => t.dataset.target === 'set');
                const tabHist = navTabs.find(t => t.dataset.target === 'history');
                
                const secLive = document.querySelector('#tab-live');
                const secSet = document.querySelector('#tab-set');
                const secHist = document.querySelector('#tab-history');
                
                tabSet.click();
                const setSecActive = secSet.classList.contains('active-section') && !secLive.classList.contains('active-section');
                
                tabHist.click();
                const histSecActive = secHist.classList.contains('active-section') && !secSet.classList.contains('active-section');
                
                tabLive.click();
                const liveSecActive = secLive.classList.contains('active-section') && !secHist.classList.contains('active-section');
                
                return { setSecActive, histSecActive, liveSecActive };
            })()
        """)
        self.assertTrue(res["setSecActive"], "Switching to Set tab must activate #tab-set")
        self.assertTrue(res["histSecActive"], "Switching to History tab must activate #tab-history")
        self.assertTrue(res["liveSecActive"], "Switching to Live tab must activate #tab-live")

    def test_08_zero_console_errors(self):
        """Verify that zero runtime JavaScript console errors or uncaught exceptions were logged."""
        errors = [m for m in self.console_messages if m.get("type") in ("error", "assert")]
        self.assertEqual(len(errors), 0, f"Found console errors: {errors}")

    def test_09_target_rpe_chips_no_clipping_geometry(self):
        """Verify clicking @7.0-@9.5 chips never clips the top border or overflows a hidden scrollport."""
        res = self.eval_js("""
            (() => {
                const container = document.querySelector('.target-rpe-chips');
                const moduleEl = document.querySelector('#target-rpe-module');
                const chips = Array.from(document.querySelectorAll('.target-chip'));
                const containerStyle = window.getComputedStyle(container);
                const moduleStyle = window.getComputedStyle(moduleEl);

                const chipResults = chips.map(chip => {
                    chip.click();
                    const cRect = chip.getBoundingClientRect();
                    const pRect = container.getBoundingClientRect();
                    const mRect = moduleEl.getBoundingClientRect();
                    return {
                        rpe: chip.dataset.rpe,
                        active: chip.classList.contains('active'),
                        topDeltaParent: cRect.top - pRect.top,
                        bottomDeltaParent: pRect.bottom - cRect.bottom,
                        insideModule: cRect.top >= mRect.top && cRect.bottom <= mRect.bottom
                    };
                });

                return {
                    containerOverflowX: containerStyle.overflowX,
                    containerOverflowY: containerStyle.overflowY,
                    moduleOverflow: moduleStyle.overflow,
                    chipResults
                };
            })()
        """)
        self.assertEqual(res["containerOverflowX"], "visible")
        self.assertEqual(res["containerOverflowY"], "visible")
        self.assertEqual(res["moduleOverflow"], "visible")
        for cr in res["chipResults"]:
            self.assertTrue(cr["active"], f"Chip @{cr['rpe']} must become .active on click")
            self.assertGreaterEqual(cr["topDeltaParent"], 0.0, f"Chip @{cr['rpe']} top edge clipped outside parent")
            self.assertGreaterEqual(cr["bottomDeltaParent"], 0.0, f"Chip @{cr['rpe']} bottom edge clipped outside parent")
            self.assertTrue(cr["insideModule"], f"Chip @{cr['rpe']} must remain inside #target-rpe-module")

    def test_10_mvt_baseline_left_align_and_warmup_badge(self):
        """Verify #live-rpe-sub is left-aligned, #rpe-tier-badge shows WARMUP, and velocity pill has no emojis."""
        res = self.eval_js("""
            (() => {
                updateRpeHeroBanner(6.5);
                const sub = document.querySelector('#live-rpe-sub');
                const subStyle = window.getComputedStyle(sub);
                const badgeText = document.querySelector('#rpe-tier-badge').textContent.trim();

                updateLiveDisplay({ lift: 'Deadlift', velocity: 0.65, rpe: 7.0 });
                const velSubFast = document.querySelector('#live-vel-sub').textContent.trim();
                updateLiveDisplay({ lift: 'Deadlift', velocity: 0.32, rpe: 9.0 });
                const velSubSlow = document.querySelector('#live-vel-sub').textContent.trim();

                return {
                    textAlign: subStyle.textAlign,
                    alignSelf: subStyle.alignSelf,
                    badgeText,
                    velSubFast,
                    velSubSlow
                };
            })()
        """)
        self.assertEqual(res["textAlign"], "left")
        self.assertEqual(res["alignSelf"], "flex-start")
        self.assertEqual(res["badgeText"], "WARMUP")
        self.assertEqual(res["velSubFast"], "Rep Completed: Explosive")
        self.assertEqual(res["velSubSlow"], "Rep Completed: Grinding")

    def test_11_workout_page_mid_set_lift_change_auto_save(self):
        """Verify changing lift mid-set automatically ends & saves the set under its original lift, resets Current Set card, and survives rAF callbacks."""
        res = self.eval_js("""
            (async () => {
                // Reset clean session
                workouts = [];
                activeWorkout = null;
                activeSet = null;
                applyLiftTheme('Deadlift');

                const metricStyle = window.getComputedStyle(document.querySelector('.workout-summary-metric'));
                const summaryMetricFlex = metricStyle.display === 'flex' && metricStyle.flexDirection === 'column';

                // Set 1: 2 reps of Deadlift
                recordRepetition({ lift: 'Deadlift', velocity: 0.55, rpe: 7.5 });
                recordRepetition({ lift: 'Deadlift', velocity: 0.50, rpe: 8.0 });
                await new Promise(r => setTimeout(r, 40));

                // User switches lift dropdown to Squat while Set 1 is active
                applyLiftTheme('Squat');
                const setEndedOnSwitch = (activeSet === null);
                const currentCardBadgeAfterSwitch = document.querySelector('#set-badge-label').textContent.trim();
                const currentCardLiftAfterSwitch = document.querySelector('#set-lift-name').textContent.trim();
                const currentCardRepsAfterSwitch = document.querySelector('#set-rep-counter').textContent.trim();
                const currentCardRepRowsAfterSwitch = document.querySelectorAll('#active-set-reps-list .rep-row-item').length;

                // Set 2: 2 reps of Squat
                recordRepetition({ lift: 'Squat', velocity: 0.70, rpe: 7.0 });
                recordRepetition({ lift: 'Squat', velocity: 0.65, rpe: 7.5 });

                // Start an in-flight long-press PR hold on Set 2's latest rep, then interrupt it with lift change + new rep
                const squatLatestEl = document.querySelector('#active-set-reps-list .rep-row-item');
                squatLatestEl.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));

                // User switches lift dropdown to Bench while Set 2 is active (before 500ms hold or rAF settles)
                applyLiftTheme('Bench');

                // Set 3: 1 rep of Bench
                recordRepetition({ lift: 'Bench', velocity: 0.45, rpe: 8.5 });

                // Wait past the 500ms long-press window and all queued requestAnimationFrame callbacks
                await new Promise(r => setTimeout(r, 550));

                const set2LastRepIsPrAfterHoldAbort = Boolean(workouts[0].sets[1].reps[1].isPR);
                const activeSetStillOpenAfterRaf = Boolean(activeSet && activeSet.setNumber === 3 && activeSet.lift === 'Bench');
                const currentLiftAfterRaf = currentLift;
                const currentCardBadgeAfterRaf = document.querySelector('#set-badge-label').textContent.trim();
                const currentCardLiftAfterRaf = document.querySelector('#set-lift-name').textContent.trim();
                const currentCardRepsAfterRaf = document.querySelector('#set-rep-counter').textContent.trim();

                const rows = Array.from(document.querySelectorAll('#workout-sets-table .workout-set-row')).map(r => ({
                    setNumber: r.dataset.setNumber,
                    lift: r.dataset.lift,
                    text: r.textContent.replace(/\\s+/g, ' ').trim()
                }));

                const navSetLabel = document.querySelector('.nav-tab[data-target="set"] .nav-label').textContent.trim();
                const sumSets = document.querySelector('#workout-sum-sets').textContent.trim();
                const sumReps = document.querySelector('#workout-sum-reps').textContent.trim();

                // Clean up
                workouts = [];
                activeWorkout = null;
                activeSet = null;
                localStorage.removeItem('vbt_workouts_v1');
                applyLiftTheme('Deadlift');

                return {
                    summaryMetricFlex,
                    setEndedOnSwitch,
                    currentCardBadgeAfterSwitch,
                    currentCardLiftAfterSwitch,
                    currentCardRepsAfterSwitch,
                    currentCardRepRowsAfterSwitch,
                    set2LastRepIsPrAfterHoldAbort,
                    activeSetStillOpenAfterRaf,
                    currentLiftAfterRaf,
                    currentCardBadgeAfterRaf,
                    currentCardLiftAfterRaf,
                    currentCardRepsAfterRaf,
                    navSetLabel,
                    sumSets,
                    sumReps,
                    rows
                };
            })()
        """)
        self.assertTrue(res["summaryMetricFlex"], ".workout-summary-metric must render as a flex column card")
        self.assertTrue(res["setEndedOnSwitch"], "Switching lift while a set is active must end the active set")
        self.assertEqual(res["currentCardBadgeAfterSwitch"], "SET 2")
        self.assertEqual(res["currentCardLiftAfterSwitch"], "SQUAT")
        self.assertEqual(res["currentCardRepsAfterSwitch"], "0 REPS RECORDED")
        self.assertEqual(res["currentCardRepRowsAfterSwitch"], 0)
        self.assertFalse(res["set2LastRepIsPrAfterHoldAbort"], "Interrupted long-press hold must not toggle isPR on ended set")
        self.assertTrue(res["activeSetStillOpenAfterRaf"], "Queued rAF callbacks must not prematurely end the newly started set")
        self.assertEqual(res["currentLiftAfterRaf"], "Bench")
        self.assertEqual(res["currentCardBadgeAfterRaf"], "SET 3")
        self.assertEqual(res["currentCardLiftAfterRaf"], "BENCH")
        self.assertEqual(res["currentCardRepsAfterRaf"], "1 REP RECORDED")
        self.assertEqual(res["navSetLabel"], "WORKOUT")
        self.assertEqual(res["sumSets"], "3")
        self.assertEqual(res["sumReps"], "5")
        self.assertEqual(len(res["rows"]), 3)
        self.assertEqual(res["rows"][0]["lift"], "deadlift")
        self.assertIn("2 reps", res["rows"][0]["text"])
        self.assertEqual(res["rows"][1]["lift"], "squat")
        self.assertIn("2 reps", res["rows"][1]["text"])
        self.assertEqual(res["rows"][2]["lift"], "bench")
        self.assertIn("1 rep", res["rows"][2]["text"])

    def test_12_eros_sheet_wordmark_and_drag_dismiss(self):
        """Verify Eros connection sheet wordmark styling and slide-down drag-to-dismiss vs spring-back (including fast flick with dual pointer+touch events)."""
        res = self.eval_js("""
            (() => {
                openBleSearchSheet();
                const sheet = document.querySelector('#bluetooth-search-tab');
                const dragZone = document.querySelector('#ble-drag-zone');
                const content = document.querySelector('#ble-search-content');
                const wordmarks = sheet.querySelectorAll('.eros-wordmark').length;
                const openedOk = sheet.classList.contains('open');

                // 1. Short drag (20px < 35% height) -> should spring back and remain open
                dragZone.dispatchEvent(new PointerEvent('pointerdown', { clientY: 500, button: 0, bubbles: true }));
                dragZone.dispatchEvent(new PointerEvent('pointermove', { clientY: 510, bubbles: true }));
                // Pause >60ms or move slowly so it is not a fast flick
                dragZone.dispatchEvent(new PointerEvent('pointerup', { clientY: 510, bubbles: true }));
                const stillOpenAfterShortDrag = sheet.classList.contains('open');
                const transformResetAfterShortDrag = content.style.transform === '';

                // 2. Fast downward flick (45px < 35% height) with simultaneous TouchEvent + 0px lift-off step on window -> should dismiss sheet
                dragZone.dispatchEvent(new PointerEvent('pointerdown', { clientY: 400, button: 0, bubbles: true }));
                dragZone.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: dragZone, clientY: 400 })], bubbles: true }));
                window.dispatchEvent(new PointerEvent('pointermove', { clientY: 445, bubbles: true }));
                window.dispatchEvent(new TouchEvent('touchmove', { touches: [new Touch({ identifier: 1, target: dragZone, clientY: 445 })], bubbles: true }));
                // Stationary 0px pointermove right before lift-off
                window.dispatchEvent(new PointerEvent('pointermove', { clientY: 445, bubbles: true }));
                const transformDuringFlick = content.style.transform;
                window.dispatchEvent(new PointerEvent('pointerup', { clientY: 445, bubbles: true }));
                window.dispatchEvent(new TouchEvent('touchend', { changedTouches: [new Touch({ identifier: 1, target: dragZone, clientY: 445 })], bubbles: true }));
                const closedAfterFastFlick = !sheet.classList.contains('open');

                // 3. Re-open and full downward drag (250px > 35% height) -> should dismiss sheet
                openBleSearchSheet();
                dragZone.dispatchEvent(new PointerEvent('pointerdown', { clientY: 400, button: 0, bubbles: true }));
                window.dispatchEvent(new PointerEvent('pointermove', { clientY: 650, bubbles: true }));
                window.dispatchEvent(new PointerEvent('pointerup', { clientY: 650, bubbles: true }));
                const closedAfterLongDrag = !sheet.classList.contains('open');

                return {
                    openedOk,
                    wordmarks,
                    transformDuringFlick,
                    stillOpenAfterShortDrag,
                    transformResetAfterShortDrag,
                    closedAfterFastFlick,
                    closedAfterLongDrag
                };
            })()
        """)
        self.assertTrue(res["openedOk"])
        self.assertGreaterEqual(res["wordmarks"], 3, "Connection sheet must style Eros with .eros-wordmark")
        self.assertIn("45px", res["transformDuringFlick"])
        self.assertTrue(res["stillOpenAfterShortDrag"], "Short drag (<35% height) must spring back and keep sheet open")
        self.assertTrue(res["transformResetAfterShortDrag"], "Spring-back must clear inline drag transform")
        self.assertTrue(res["closedAfterFastFlick"], "Fast downward flick must dismiss sheet even when TouchEvents and 0px lift-off events also fire")
        self.assertTrue(res["closedAfterLongDrag"], "Dragging past 35% sheet height must dismiss the sheet")

if __name__ == '__main__':
    unittest.main()

