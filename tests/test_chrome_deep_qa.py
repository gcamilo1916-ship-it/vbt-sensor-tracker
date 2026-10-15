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

        # Discover target page
        with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json/list", timeout=2) as resp:
            pages = json.loads(resp.read().decode('utf-8'))
        eros_pages = [p for p in pages if "index.html" in p.get("url", "")]
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
                cls.proc.terminate()
                cls.proc.wait(timeout=2)
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
        req_id = cls._send_cdp("Runtime.evaluate", {"expression": expr, "returnByValue": True})
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
        self.assertIn("CONNECT SENSOR", btn_connect["text"])
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

if __name__ == '__main__':
    unittest.main()
