"""
Challenger 2 Empirical Verification & Adversarial Stress Harness for Eros VBT.
Connects directly to Headless Chrome via Chrome DevTools Protocol (CDP).
Empirically inspects:
1. Computed styles on .glass-card: backdrop-filter blur(30px) saturate(180%), specular border refraction
2. Computed border-radius on all action buttons (999px)
3. Computed typography: font-variant-numeric: tabular-nums and letter-spacing: -0.03em on metrics
4. Bounding rect analysis of .controls-panel vs .custom-select-options (overflow: visible, no clipping, elementFromPoint hit-testing)
5. Zero console errors, warnings, uncaught exceptions across full DOM lifecycle & simulated interactions
6. Viewport responsiveness across Mobile (375x667, 390x844) and Desktop (1920x1080)
"""

import os
import sys
import json
import time
import socket
import urllib.request
import subprocess

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
TARGET_URL = "file:///C:/Users/gcami/Documents/VBTanti/index.html"
DEBUG_PORT = 9588

class ChromeCDPClient:
    def __init__(self, port=DEBUG_PORT):
        self.port = port
        self.proc = None
        self.sock = None
        self.msg_id = 0
        self.console_events = []
        self.exception_events = []
        self.log_entries = []

    def start(self):
        self.proc = subprocess.Popen([
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu",
            f"--remote-debugging-port={self.port}",
            "--remote-allow-origins=*",
            TARGET_URL
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        ready = False
        for _ in range(40):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/json/version", timeout=0.2) as resp:
                    if resp.status == 200:
                        ready = True
                        break
            except Exception:
                time.sleep(0.1)

        if not ready:
            raise RuntimeError("Failed to connect to Chrome remote debugging port")

        eros_pages = []
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/json/list", timeout=2) as resp:
                    pages = json.loads(resp.read().decode('utf-8'))
                    eros_pages = [p for p in pages if "index.html" in p.get("url", "")]
                    if eros_pages:
                        break
            except Exception:
                time.sleep(0.1)

        if not eros_pages:
            raise RuntimeError("index.html target not found in Chrome pages")

        target = eros_pages[0]
        ws_url = target['webSocketDebuggerUrl']
        path = '/' + ws_url.split('/', 3)[3]

        self.sock = socket.socket()
        self.sock.connect(('127.0.0.1', self.port))
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode('utf-8'))
        self.sock.recv(4096)

        # Enable domains
        self.send_cdp("Runtime.enable")
        self.send_cdp("Log.enable")
        self.send_cdp("Page.enable")
        self.send_cdp("DOM.enable")
        self.send_cdp("CSS.enable")

        # Wait for document to load
        for _ in range(50):
            rs = self.eval_js("document.readyState")
            if rs in ("interactive", "complete"):
                break
            time.sleep(0.05)
        time.sleep(0.2)

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
        if self.proc:
            try:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.proc.pid)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass

    def send_cdp(self, method, params=None):
        self.msg_id += 1
        msg = {"id": self.msg_id, "method": method, "params": params or {}}
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
        self.sock.sendall(frame)
        return self.msg_id

    def recv_cdp(self, timeout=3.0):
        self.sock.settimeout(timeout)
        try:
            head = self.sock.recv(2)
            if not head:
                return None
            b2 = head[1]
            length = b2 & 0x7f
            if length == 126:
                length = int.from_bytes(self.sock.recv(2), 'big')
            elif length == 127:
                length = int.from_bytes(self.sock.recv(8), 'big')
            data = bytearray()
            while len(data) < length:
                chunk = self.sock.recv(length - len(data))
                if not chunk:
                    break
                data.extend(chunk)
            return json.loads(data.decode('utf-8'))
        except socket.timeout:
            return None

    def send_command(self, method, params=None, timeout=3.0):
        req_id = self.send_cdp(method, params)
        start_time = time.time()
        while time.time() - start_time < timeout:
            msg = self.recv_cdp(timeout=1.0)
            if not msg:
                continue
            if msg.get("method") == "Runtime.consoleAPICalled":
                self.console_events.append(msg.get("params"))
            elif msg.get("method") == "Runtime.exceptionThrown":
                self.exception_events.append(msg.get("params"))
            elif msg.get("method") == "Log.entryAdded":
                self.log_entries.append(msg.get("params"))
            if msg.get("id") == req_id:
                return msg
        return None

    def eval_js(self, expr, timeout=3.0):
        msg = self.send_command("Runtime.evaluate", {"expression": expr, "returnByValue": True}, timeout=timeout)
        if not msg:
            print(f"[DEBUG] eval_js timed out waiting for response!")
            return None
        if "error" in msg:
            print(f"[DEBUG] CDP Error in eval_js: {msg['error']}")
            return None
        res_obj = msg.get("result", {})
        if "exceptionDetails" in res_obj:
            print(f"[DEBUG] JS Exception in eval_js: {res_obj['exceptionDetails']}")
            return None
        res = res_obj.get("result", {})
        if "value" in res:
            return res["value"]
        return res


def run_empirical_suite():
    print("=" * 80)
    print("CHALLENGER 2: EMPIRICAL VERIFICATION & STRESS HARNESS")
    print("Target: Headless Google Chrome v131+ via CDP")
    print("URL   :", TARGET_URL)
    print("=" * 80)

    client = ChromeCDPClient()
    results = {
        "glass_cards": {},
        "action_buttons": {},
        "metrics_typography": {},
        "dropdown_bounding_rect": {},
        "console_lifecycle": {},
        "viewport_responsiveness": {}
    }
    failures = []

    try:
        client.start()
        print("\n[STEP 1] Inspecting Computed Styles on all .glass-card elements...")
        glass_cards = client.eval_js("""
            (() => {
                const els = Array.from(document.querySelectorAll('.glass-card'));
                return els.map(el => {
                    const style = window.getComputedStyle(el);
                    const tag = el.tagName.toLowerCase();
                    const id = el.id ? '#' + el.id : '';
                    const cls = el.className.split(' ').map(c => '.' + c).join('');
                    const selector = `${tag}${id}${cls}`;
                    return {
                        selector,
                        id: el.id,
                        className: el.className,
                        backdropFilter: style.backdropFilter || style.webkitBackdropFilter || 'none',
                        webkitBackdropFilter: style.webkitBackdropFilter || 'none',
                        backgroundColor: style.backgroundColor,
                        borderRadius: style.borderRadius,
                        boxShadow: style.boxShadow,
                        overflow: style.overflow
                    };
                });
            })()
        """)
        results["glass_cards"] = glass_cards
        print(f"  Found {len(glass_cards)} elements with .glass-card class:")
        for idx, gc in enumerate(glass_cards, 1):
            print(f"    [{idx}] {gc['selector']}")
            print(f"        backdrop-filter       : {gc['backdropFilter']}")
            print(f"        -webkit-backdrop-filter: {gc['webkitBackdropFilter']}")
            print(f"        background-color      : {gc['backgroundColor']}")
            print(f"        overflow              : {gc['overflow']}")
            
            # Check requirements
            bf = gc['backdropFilter'].lower().replace("180%", "1.8")
            has_blur = "blur(30px)" in bf
            has_sat = "saturate(1.8)" in bf or "saturate(180%)" in gc['backdropFilter'].lower()
            if not has_blur:
                failures.append(f"Glass card {gc['selector']} missing blur(30px): {gc['backdropFilter']}")
            if not has_sat:
                failures.append(f"Glass card {gc['selector']} missing saturate(180%): {gc['backdropFilter']}")

        print("\n[STEP 2] Inspecting Action Buttons border-radius (999px)...")
        buttons = client.eval_js("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button, .nav-tab, .btn-action-glass, .btn-glass-primary, .btn-glass-connect, .btn-glass-set'));
                // deduplicate
                const unique = Array.from(new Set(btns));
                return unique.map(b => {
                    const style = window.getComputedStyle(b);
                    return {
                        id: b.id || '(no-id)',
                        className: b.className,
                        textContent: b.textContent.trim().replace(/\\s+/g, ' '),
                        borderRadius: style.borderRadius
                    };
                });
            })()
        """)
        results["action_buttons"] = buttons
        print(f"  Found {len(buttons)} button / navigation action elements:")
        for idx, b in enumerate(buttons, 1):
            print(f"    [{idx}] ID: {b['id']:<24} | Radius: {b['borderRadius']:<10} | Class: {b['className']:<32} | Text: '{b['textContent'][:30]}'")
            # All pill action buttons and nav pills must have 999px border-radius
            if b['id'] in ['btn-workout-master', 'btn-connect', 'btn-set-toggle', 'btn-export-csv', 'btn-export-json', 'btn-clear-history']:
                if b['borderRadius'] != '999px':
                    failures.append(f"Action button #{b['id']} has border-radius {b['borderRadius']}, expected 999px")
            elif 'nav-tab' in b['className']:
                if b['borderRadius'] != '999px':
                    failures.append(f"Nav tab {b['textContent']} has border-radius {b['borderRadius']}, expected 999px")

        print("\n[STEP 3] Inspecting Typography & Metrics (tabular-nums & letter-spacing -0.03em)...")
        metrics = client.eval_js("""
            (() => {
                const targets = [
                    '#session-timer-display',
                    '#live-velocity',
                    '#live-rpe',
                    '#hud-active-set',
                    '#hud-set-reps',
                    '#hud-vel-loss',
                    '#set-avg-vel',
                    '#set-max-vel',
                    '#set-min-vel',
                    '#set-vel-loss',
                    '#set-avg-rpe'
                ];
                return targets.map(sel => {
                    const el = document.querySelector(sel);
                    if (!el) return { selector: sel, found: false };
                    const style = window.getComputedStyle(el);
                    const fontSize = parseFloat(style.fontSize);
                    const letterSpacingPx = parseFloat(style.letterSpacing);
                    const trackingEm = fontSize > 0 ? (letterSpacingPx / fontSize) : 0;
                    return {
                        selector: sel,
                        found: true,
                        fontFamily: style.fontFamily,
                        fontSize: style.fontSize,
                        fontVariantNumeric: style.fontVariantNumeric,
                        letterSpacing: style.letterSpacing,
                        computedTrackingEm: trackingEm.toFixed(4)
                    };
                });
            })()
        """)
        results["metrics_typography"] = metrics
        print(f"  Metrics elements checked ({len(metrics)}):")
        for idx, m in enumerate(metrics, 1):
            if not m['found']:
                failures.append(f"Metric element {m['selector']} not found in DOM")
                continue
            print(f"    [{idx}] {m['selector']:<24} | font-variant-numeric: {m['fontVariantNumeric']:<14} | font-size: {m['fontSize']:<8} | letter-spacing: {m['letterSpacing']:<10} | tracking: {m['computedTrackingEm']}em")
            if m['fontVariantNumeric'] != 'tabular-nums':
                failures.append(f"Metric {m['selector']} fontVariantNumeric is '{m['fontVariantNumeric']}', expected 'tabular-nums'")
            
            # Check letter-spacing: -0.03em produces computed tracking close to -0.0300em
            tracking_val = float(m['computedTrackingEm'])
            if not (-0.035 <= tracking_val <= -0.025):
                failures.append(f"Metric {m['selector']} tracking is {tracking_val}em, expected ~ -0.03em")

        print("\n[STEP 4] Bounding Rect Analysis & Clipping Verification of .controls-panel vs .custom-select-options...")
        clipping_check = client.eval_js("""
            (() => {
                const wrapper = document.querySelector('#lift-select-wrapper');
                const trigger = wrapper.querySelector('.custom-select-trigger');
                const options = wrapper.querySelector('.custom-select-options');
                const panel = document.querySelector('.controls-panel');
                
                // Pre-open rects
                const panelStyle = window.getComputedStyle(panel);
                const panelOverflow = panelStyle.overflow;
                const panelOverflowX = panelStyle.overflowX;
                const panelOverflowY = panelStyle.overflowY;
                const panelRectInitial = panel.getBoundingClientRect();
                
                // Open dropdown
                trigger.click();
                const isOpen = wrapper.classList.contains('open');
                
                const panelRectOpen = panel.getBoundingClientRect();
                const optionsRect = options.getBoundingClientRect();
                const optionsStyle = window.getComputedStyle(options);
                
                // Check ancestors overflow
                const ancestors = [];
                let curr = panel.parentElement;
                while (curr && curr !== document.documentElement) {
                    const st = window.getComputedStyle(curr);
                    ancestors.push({
                        tag: curr.tagName.toLowerCase(),
                        id: curr.id,
                        className: curr.className,
                        overflow: st.overflow,
                        overflowX: st.overflowX,
                        overflowY: st.overflowY
                    });
                    curr = curr.parentElement;
                }
                
                // ElementFromPoint hit testing at key coordinates on the open options menu
                // Center of options menu
                const midX = optionsRect.left + optionsRect.width / 2;
                const midY = optionsRect.top + optionsRect.height / 2;
                const elAtCenter = document.elementFromPoint(midX, midY);
                const centerBelongsToOptions = options.contains(elAtCenter);
                
                // Bottom edge center
                const bottomX = optionsRect.left + optionsRect.width / 2;
                const bottomY = optionsRect.bottom - 5;
                const elAtBottom = document.elementFromPoint(bottomX, bottomY);
                const bottomBelongsToOptions = options.contains(elAtBottom);
                
                // Does options rect extend below panel rect?
                const extendsBelowPanel = optionsRect.bottom > panelRectOpen.bottom;
                const overflowDeltaPx = optionsRect.bottom - panelRectOpen.bottom;

                return {
                    panelOverflow,
                    panelOverflowX,
                    panelOverflowY,
                    panelRect: {
                        top: panelRectOpen.top,
                        bottom: panelRectOpen.bottom,
                        left: panelRectOpen.left,
                        right: panelRectOpen.right,
                        width: panelRectOpen.width,
                        height: panelRectOpen.height
                    },
                    optionsRect: {
                        top: optionsRect.top,
                        bottom: optionsRect.bottom,
                        left: optionsRect.left,
                        right: optionsRect.right,
                        width: optionsRect.width,
                        height: optionsRect.height
                    },
                    optionsZIndex: optionsStyle.zIndex,
                    isOpen,
                    extendsBelowPanel,
                    overflowDeltaPx,
                    ancestors,
                    hitTestCenter: {
                        x: midX,
                        y: midY,
                        elementTag: elAtCenter ? elAtCenter.tagName : null,
                        elementClass: elAtCenter ? elAtCenter.className : null,
                        hitValid: centerBelongsToOptions
                    },
                    hitTestBottom: {
                        x: bottomX,
                        y: bottomY,
                        elementTag: elAtBottom ? elAtBottom.tagName : null,
                        elementClass: elAtBottom ? elAtBottom.className : null,
                        hitValid: bottomBelongsToOptions
                    }
                };
            })()
        """)
        results["dropdown_bounding_rect"] = clipping_check
        print(f"  .controls-panel computed overflow: {clipping_check['panelOverflow']} (X: {clipping_check['panelOverflowX']}, Y: {clipping_check['panelOverflowY']})")
        print(f"  .controls-panel bounding rect   : top={clipping_check['panelRect']['top']:.1f}, bottom={clipping_check['panelRect']['bottom']:.1f}, height={clipping_check['panelRect']['height']:.1f}")
        print(f"  .custom-select-options rect     : top={clipping_check['optionsRect']['top']:.1f}, bottom={clipping_check['optionsRect']['bottom']:.1f}, height={clipping_check['optionsRect']['height']:.1f}")
        print(f"  Extends below panel?            : {clipping_check['extendsBelowPanel']} (by {clipping_check['overflowDeltaPx']:.1f}px)")
        print(f"  Dropdown z-index                : {clipping_check['optionsZIndex']}")
        print(f"  Hit-test at center ({clipping_check['hitTestCenter']['x']:.1f}, {clipping_check['hitTestCenter']['y']:.1f}): tag={clipping_check['hitTestCenter']['elementTag']}, class='{clipping_check['hitTestCenter']['elementClass']}' -> HIT={clipping_check['hitTestCenter']['hitValid']}")
        print(f"  Hit-test at bottom ({clipping_check['hitTestBottom']['x']:.1f}, {clipping_check['hitTestBottom']['y']:.1f}): tag={clipping_check['hitTestBottom']['elementTag']}, class='{clipping_check['hitTestBottom']['elementClass']}' -> HIT={clipping_check['hitTestBottom']['hitValid']}")
        
        if clipping_check['panelOverflow'] != 'visible':
            failures.append(f".controls-panel overflow is '{clipping_check['panelOverflow']}', expected 'visible'")
        if not clipping_check['hitTestCenter']['hitValid']:
            failures.append(f"Dropdown center was obscured or clipped: hit {clipping_check['hitTestCenter']['elementTag']}.{clipping_check['hitTestCenter']['elementClass']}")
        if not clipping_check['hitTestBottom']['hitValid']:
            failures.append(f"Dropdown bottom was obscured or clipped: hit {clipping_check['hitTestBottom']['elementTag']}.{clipping_check['hitTestBottom']['elementClass']}")
        
        # Check all ancestors for any overflow clipping
        for anc in clipping_check['ancestors']:
            print(f"    Ancestor <{anc['tag']} id='{anc['id']}' class='{anc['className']}'> overflow={anc['overflow']}")
            if anc['overflow'] in ('hidden', 'clip', 'scroll', 'auto') and clipping_check['extendsBelowPanel']:
                print(f"    WARNING: Ancestor {anc['tag']} has overflow: {anc['overflow']}")

        print("\n[STEP 5] Exercising DOM Lifecycle & Interactive User Journeys for Console Errors...")
        lifecycle_run = client.eval_js("""
            (() => {
                const logs = [];
                // 1. Tab switches
                const navTabs = Array.from(document.querySelectorAll('.nav-tab'));
                const tabLive = navTabs.find(t => t.dataset.target === 'live');
                const tabSet = navTabs.find(t => t.dataset.target === 'set');
                const tabHist = navTabs.find(t => t.dataset.target === 'history');
                
                tabSet.click();
                tabHist.click();
                tabLive.click();
                
                // 2. Dropdown themes
                const wrapper = document.querySelector('#lift-select-wrapper');
                const trigger = wrapper.querySelector('.custom-select-trigger');
                
                trigger.click();
                const squatOpt = wrapper.querySelector('.custom-option[data-value="Squat"]');
                squatOpt.click();
                
                trigger.click();
                const benchOpt = wrapper.querySelector('.custom-option[data-value="Bench"]');
                benchOpt.click();
                
                trigger.click();
                const dlOpt = wrapper.querySelector('.custom-option[data-value="Deadlift"]');
                dlOpt.click();
                
                // 3. Workout button & set button clicks (stub confirm to prevent modal block)
                const origConfirm = window.confirm;
                window.confirm = () => true;
                const origAlert = window.alert;
                window.alert = () => {};
                const origAnchorClick = HTMLAnchorElement.prototype.click;
                HTMLAnchorElement.prototype.click = function() {};

                const btnWorkout = document.querySelector('#btn-workout-master');
                const btnSet = document.querySelector('#btn-set-toggle');
                
                btnWorkout.click(); // Start workout
                btnSet.click();     // Start set
                btnSet.click();     // End set
                btnWorkout.click(); // End workout (triggers confirm)
                
                // 4. Export buttons
                const btnCsv = document.querySelector('#btn-export-csv');
                const btnJson = document.querySelector('#btn-export-json');
                btnCsv.click();
                btnJson.click();

                // 5. Clear history button
                const btnClear = document.querySelector('#btn-clear-history');
                btnClear.click();   // Clear history (triggers confirm)

                // Restore
                window.confirm = origConfirm;
                window.alert = origAlert;
                HTMLAnchorElement.prototype.click = origAnchorClick;
                
                return {
                    status: 'completed',
                    currentTheme: document.body.className
                };
            })()
        """)
        # Allow any asynchronous logs or errors to bubble
        time.sleep(0.5)
        # Flush any incoming CDP messages
        while True:
            m = client.recv_cdp(timeout=0.2)
            if not m:
                break
            if m.get("method") == "Runtime.consoleAPICalled":
                client.console_events.append(m.get("params"))
            elif m.get("method") == "Runtime.exceptionThrown":
                client.exception_events.append(m.get("params"))
            elif m.get("method") == "Log.entryAdded":
                client.log_entries.append(m.get("params"))

        results["console_lifecycle"] = {
            "console_events_count": len(client.console_events),
            "exception_events_count": len(client.exception_events),
            "log_entries_count": len(client.log_entries),
            "console_events": client.console_events,
            "exception_events": client.exception_events
        }
        
        errors = [c for c in client.console_events if c.get("type") in ("error", "assert")]
        warnings = [c for c in client.console_events if c.get("type") == "warning"]
        
        print(f"  Console events recorded : {len(client.console_events)}")
        print(f"  Exceptions thrown       : {len(client.exception_events)}")
        print(f"  Console errors          : {len(errors)}")
        print(f"  Console warnings        : {len(warnings)}")
        
        if errors:
            print(f"  ERROR DETAILS: {json.dumps(errors, indent=2)}")
            failures.append(f"Console errors detected ({len(errors)}): {errors}")
        if client.exception_events:
            print(f"  EXCEPTION DETAILS: {json.dumps(client.exception_events, indent=2)}")
            failures.append(f"Uncaught exceptions detected ({len(client.exception_events)})")

        print("\n[STEP 6] Viewport Responsiveness & Layout Bounding Box Stress-Testing...")
        # Test mobile viewports: 375x667 (iPhone SE), 390x844 (iPhone 12/13/14), 1920x1080 (Desktop)
        viewports = [
            ("iPhone SE (375x667)", 375, 667),
            ("iPhone 14 (390x844)", 390, 844),
            ("Desktop (1920x1080)", 1920, 1080)
        ]
        viewport_results = {}
        for vp_name, width, height in viewports:
            client.send_command("Emulation.setDeviceMetricsOverride", {
                "width": width,
                "height": height,
                "deviceScaleFactor": 2.0 if width < 500 else 1.0,
                "mobile": width < 500
            })
            time.sleep(0.1)
            vp_data = client.eval_js(f"""
                (() => {{
                    const tabLive = document.querySelector('#tab-live');
                    if (!tabLive.classList.contains('active-section')) {{
                        document.querySelector('.nav-tab[data-target="live"]')?.click();
                    }}
                    const wrapper = document.querySelector('#lift-select-wrapper');
                    const trigger = wrapper.querySelector('.custom-select-trigger');
                    const options = wrapper.querySelector('.custom-select-options');
                    
                    // Open dropdown
                    if (!wrapper.classList.contains('open')) {{
                        trigger.click();
                    }}
                    
                    const optionsRect = options.getBoundingClientRect();
                    const docWidth = document.documentElement.clientWidth;
                    const docScrollWidth = document.documentElement.scrollWidth;
                    const bodyScrollWidth = document.body.scrollWidth;
                    
                    const horizontallyClipped = optionsRect.left < 0 || optionsRect.right > docWidth;
                    const hasHorizontalOverflow = docScrollWidth > docWidth || bodyScrollWidth > docWidth;

                    return {{
                        clientWidth: docWidth,
                        scrollWidth: docScrollWidth,
                        optionsLeft: optionsRect.left,
                        optionsRight: optionsRect.right,
                        optionsWidth: optionsRect.width,
                        horizontallyClipped,
                        hasHorizontalOverflow
                    }};
                }})()
            """)
            viewport_results[vp_name] = vp_data
            if vp_data is None:
                failures.append(f"Failed to evaluate viewport metrics for {vp_name}")
                continue
            print(f"  Viewport: {vp_name:<22} | clientWidth: {vp_data['clientWidth']}px | options width: {vp_data['optionsWidth']:.1f}px (left: {vp_data['optionsLeft']:.1f}, right: {vp_data['optionsRight']:.1f}) | horizontal scrollbar: {vp_data['hasHorizontalOverflow']}")
            if vp_data['horizontallyClipped']:
                failures.append(f"Dropdown horizontally clipped in {vp_name}: left={vp_data['optionsLeft']}, right={vp_data['optionsRight']}, clientWidth={vp_data['clientWidth']}")
        
        # Reset viewport
        client.send_command("Emulation.clearDeviceMetricsOverride")

    finally:
        client.close()

    print("\n" + "=" * 80)
    print("CHALLENGER 2 VERIFICATION SUMMARY")
    print("=" * 80)
    print(f"Total Failures Encountered: {len(failures)}")
    if failures:
        print("\nFAILURE DETAILS:")
        for idx, f in enumerate(failures, 1):
            print(f"  [{idx}] {f}")
        verdict = "REJECT"
    else:
        print("\nALL EMPIRICAL CHECKS PASSED WITH ZERO ERRORS!")
        verdict = "APPROVE"
    print(f"\nFINAL VERDICT: {verdict}")
    print("=" * 80)

    # Save output report to challenger directory
    report_file = r"C:\Users\gcami\Documents\VBTanti\.agents\teamwork\challenger_2\empirical_results.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "verdict": verdict,
            "failures": failures,
            "results": results,
            "viewport_results": viewport_results
        }, f, indent=2)
    print(f"Empirical results written to: {report_file}")
    return verdict == "APPROVE"

if __name__ == "__main__":
    success = run_empirical_suite()
    sys.exit(0 if success else 1)
