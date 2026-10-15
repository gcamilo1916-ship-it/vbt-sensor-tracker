"""
Base fixtures, reference oracles, and parser utilities for Eros VBT E2E tests.
Pure Python 3 standard library implementation with zero external dependencies.
"""

import os
import re
import sys
import json
import math
import subprocess
import urllib.request
import urllib.error
import time

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INDEX_HTML = os.path.join(ROOT_DIR, "index.html")
STYLE_CSS = os.path.join(ROOT_DIR, "style.css")
APP_JS = os.path.join(ROOT_DIR, "app.js")
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
CHROME_DEBUG_PORT = 9444

# Regex pattern for emojis, pictorial symbols, and decorative badges
EMOJI_PATTERN = re.compile(
    r"["
    r"\U00010000-\U0010ffff"  # Supplemental symbols, pictographs, emoji
    r"\u2600-\u27bf"          # Miscellaneous Symbols & Dingbats
    r"\u2300-\u23ff"          # Miscellaneous Technical
    r"\u2b50-\u2b55"          # Star / circle symbols (e.g. ⭕)
    r"\u200d"                 # Zero-width joiner
    r"\ufe0f"                 # Variation selector-16
    r"]",
    re.UNICODE
)

def read_file(path):
    """Safely read file contents as utf-8 string."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()

def get_index_html():
    return read_file(INDEX_HTML)

def get_style_css():
    return read_file(STYLE_CSS)

def get_app_js():
    return read_file(APP_JS)

# ─────────────────────────────────────────────────────────────────────────────
# CSS Analysis Utilities
# ─────────────────────────────────────────────────────────────────────────────

def strip_css_comments(css):
    """Remove standard C-style CSS comments."""
    return re.sub(r'/\*[\s\S]*?\*/', '', css)

def extract_css_rules(css, selector):
    """
    Extract property block for a given selector.
    Supports comma-separated selectors or exact selector match.
    """
    cleaned = strip_css_comments(css)
    # Match selector followed by { ... }
    escaped_selector = re.escape(selector)
    pattern = r'(?:^|\})\s*([^{}]*?' + escaped_selector + r'[^{}]*?)\{([^}]+)\}'
    matches = []
    for match in re.finditer(pattern, cleaned, re.MULTILINE):
        matched_sel = match.group(1).strip()
        body = match.group(2).strip()
        # Verify the target selector is an actual distinct selector token
        tokens = [t.strip() for t in matched_sel.split(',')]
        for token in tokens:
            if token == selector or token.endswith(selector) or selector in token:
                props = {}
                for line in body.split(';'):
                    if ':' in line:
                        k, v = line.split(':', 1)
                        props[k.strip()] = v.strip()
                matches.append((matched_sel, props, body))
                break
    return matches

def extract_css_token(css, token_name):
    """Extract CSS custom property (e.g., --bg-base) from :root."""
    cleaned = strip_css_comments(css)
    root_match = re.search(r':root\s*\{([^}]+)\}', cleaned)
    if not root_match:
        return None
    root_body = root_match.group(1)
    prop_match = re.search(rf'{re.escape(token_name)}\s*:\s*([^;]+);', root_body)
    if prop_match:
        return prop_match.group(1).strip()
    return None

def check_css_brace_balance(css):
    """
    Check if curly braces in CSS are properly balanced.
    Ignores strings and comments.
    Returns (is_balanced, open_count, close_count, list_of_issues).
    """
    in_comment = False
    in_string = False
    string_char = ''
    open_braces = 0
    close_braces = 0
    issues = []
    i = 0
    length = len(css)

    while i < length:
        ch = css[i]
        # Comment start
        if not in_comment and not in_string and ch == '/' and i + 1 < length and css[i+1] == '*':
            in_comment = True
            i += 2
            continue
        # Comment end
        if in_comment and ch == '*' and i + 1 < length and css[i+1] == '/':
            in_comment = False
            i += 2
            continue
        if in_comment:
            i += 1
            continue

        # String start / end
        if not in_string and (ch == '"' or ch == "'"):
            in_string = True
            string_char = ch
            i += 1
            continue
        if in_string and ch == string_char:
            # Check for escape
            if i > 0 and css[i-1] == '\\':
                pass
            else:
                in_string = False
            i += 1
            continue
        if in_string:
            i += 1
            continue

        # Brace counting
        if ch == '{':
            open_braces += 1
        elif ch == '}':
            close_braces += 1
            if close_braces > open_braces:
                issues.append(f"Unexpected closing brace '}}' at character offset {i}")
        i += 1

    if open_braces != close_braces:
        issues.append(f"Mismatched braces: {open_braces} open '{{' vs {close_braces} close '}}'")

    return (len(issues) == 0, open_braces, close_braces, issues)

# ─────────────────────────────────────────────────────────────────────────────
# HTML Analysis Utilities
# ─────────────────────────────────────────────────────────────────────────────

def extract_dom_elements_by_tag(html, tag):
    """Extract elements by tag name including attributes and inner HTML."""
    pattern = rf'<{tag}([^>]*)>([\s\S]*?)</{tag}>'
    matches = []
    for m in re.finditer(pattern, html, re.IGNORECASE):
        attrs = m.group(1)
        inner = m.group(2)
        # Parse attributes
        attr_dict = {}
        for attr_m in re.finditer(r'([a-zA-Z0-9_\-]+)(?:=[\'"]([^\'"]*)[\'"])?', attrs):
            attr_dict[attr_m.group(1).lower()] = attr_m.group(2) if attr_m.group(2) is not None else True
        matches.append({
            "raw": m.group(0),
            "attrs": attr_dict,
            "inner": inner
        })
    return matches

def find_dom_id(html, dom_id):
    """Check if an element with specified id exists in HTML."""
    pattern = rf'id=[\'"]{re.escape(dom_id)}[\'"]'
    return bool(re.search(pattern, html, re.IGNORECASE))

def find_emojis_in_text(text):
    """Find any emojis in a text string."""
    return EMOJI_PATTERN.findall(text)

# ─────────────────────────────────────────────────────────────────────────────
# Reference Mathematical & Behavioral Oracles
# ─────────────────────────────────────────────────────────────────────────────

class VBTMathOracle:
    """Authoritative reference mathematical formulas matching vbt_architecture.md and app.js."""

    @staticmethod
    def recalculate_set_metrics(reps):
        """
        Calculates set analytics from reps list according to app.js:345-377:
        avgVelocity = round(sum(v) / len(v), 2)
        maxVelocity = round(max(v), 2)
        minVelocity = round(min(v), 2)
        avgRpe      = round(sum(r) / len(r), 1)
        velocityLossPct = round(max(0, ((max_v - last_v) / max_v) * 100), 1)
        """
        if not reps:
            return {
                "avgVelocity": 0.0,
                "maxVelocity": 0.0,
                "minVelocity": 0.0,
                "avgRpe": 0.0,
                "velocityLossPct": 0.0
            }
        vels = [float(r["velocity"]) for r in reps]
        rpes = [float(r["rpe"]) for r in reps]

        sum_v = sum(vels)
        sum_r = sum(rpes)
        max_v = max(vels)
        min_v = min(vels)
        last_v = vels[-1]

        avg_vel = round(sum_v / len(vels), 2)
        max_vel = round(max_v, 2)
        min_vel = round(min_v, 2)
        avg_rpe = round(sum_r / len(rpes), 1)

        if max_v > 0:
            loss = ((max_v - last_v) / max_v) * 100
            loss_pct = round(max(0.0, loss), 1)
        else:
            loss_pct = 0.0

        return {
            "avgVelocity": avg_vel,
            "maxVelocity": max_vel,
            "minVelocity": min_vel,
            "avgRpe": avg_rpe,
            "velocityLossPct": loss_pct
        }

    @staticmethod
    def calculate_rep_duration(velocity):
        """
        Calculates physics animation duration in seconds:
        duration = (0.5 / max(velocity, 0.1)) * 2
        clamped to [0.5, 5.0]
        """
        dur = (0.5 / max(velocity, 0.1)) * 2.0
        return max(0.5, min(dur, 5.0))

    @staticmethod
    def calculate_apex_bloom_delay_ms(velocity, lift_name):
        """
        Apex bloom diffuser timing delay in milliseconds:
        Deadlift: duration / 2 (midpoint zenith)
        Squat / Bench: duration * 0.95 (top lockout)
        """
        dur = VBTMathOracle.calculate_rep_duration(velocity)
        if lift_name.lower() == 'deadlift':
            return (dur * 1000.0) / 2.0
        return (dur * 1000.0) * 0.95

    @staticmethod
    def calculate_ring_stroke_dashoffset(avg_velocity):
        """
        Calculates stroke-dashoffset for SVG progress ring (radius r=90, circumference=565.48):
        maxScale = 1.0 m/s
        fillRatio = min(max(avgVelocity / 1.0, 0), 1)
        offset = 565.48 - (565.48 * fillRatio)
        """
        fill_ratio = min(max(avg_velocity / 1.0, 0.0), 1.0)
        offset = 565.48 - (565.48 * fill_ratio)
        return round(offset, 1)

    @staticmethod
    def parse_ble_payload(payload_str):
        """
        Authoritative parsing logic for BLE payload matching app.js:464-492:
        Format: "[Lift Name] | [Velocity] m/s | RPE: [Value]"
        """
        text = payload_str.strip()
        if not text or '|' not in text:
            return None
        parts = [p.strip() for p in text.split('|')]
        if len(parts) < 3:
            return None
        lift = parts[0]
        vel_match = re.search(r'([\d.]+)', parts[1])
        rpe_match = re.search(r'([\d.]+)', parts[2])
        if not vel_match or not rpe_match:
            return None
        try:
            vel = float(vel_match.group(1))
            rpe = float(rpe_match.group(1))
            return {
                "lift": lift,
                "velocity": vel,
                "rpe": rpe
            }
        except ValueError:
            return None

    @staticmethod
    def generate_csv_rows(workouts):
        """
        Generates CSV export rows according to app.js:818-855:
        Headers: Workout ID,Workout Date,Set Number,Lift,Rep Number,Velocity (m/s),RPE,Set Avg Velocity,Set Velocity Loss %,Timestamp
        """
        headers = [
            "Workout ID", "Workout Date", "Set Number", "Lift", "Rep Number",
            "Velocity (m/s)", "RPE", "Set Avg Velocity", "Set Velocity Loss %", "Timestamp"
        ]
        rows = [headers]
        for session in workouts:
            for s in session.get("sets", []):
                for r in s.get("reps", []):
                    rows.append([
                        str(session.get("id", "")),
                        str(session.get("dateStr", "")),
                        str(s.get("setNumber", "")),
                        str(s.get("lift", "")),
                        str(r.get("repNumber", "")),
                        str(r.get("velocity", "")),
                        str(r.get("rpe", "")),
                        str(s.get("avgVelocity", "")),
                        str(s.get("velocityLossPct", "")),
                        str(r.get("timestamp", ""))
                    ])
        return rows

# ─────────────────────────────────────────────────────────────────────────────
# Headless Chrome Remote Debugging Controller
# ─────────────────────────────────────────────────────────────────────────────

class HeadlessChromeSession:
    """Manages a headless Chrome instance with remote debugging for E2E validation."""

    def __init__(self, port=CHROME_DEBUG_PORT):
        self.port = port
        self.proc = None
        self.target_url = f"file:///{INDEX_HTML.replace(os.sep, '/')}"

    def is_available(self):
        return os.path.exists(CHROME_PATH)

    def start(self):
        if not self.is_available():
            return False
        cmd = [
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu",
            f"--remote-debugging-port={self.port}",
            "--remote-allow-origins=*",
            self.target_url
        ]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        # Wait up to 3 seconds for port to open
        version_url = f"http://127.0.0.1:{self.port}/json/version"
        for _ in range(30):
            try:
                with urllib.request.urlopen(version_url, timeout=0.2) as resp:
                    if resp.status == 200:
                        return True
            except Exception:
                time.sleep(0.1)
        return False

    def query_pages(self):
        list_url = f"http://127.0.0.1:{self.port}/json/list"
        try:
            with urllib.request.urlopen(list_url, timeout=2) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception:
            return []

    def stop(self):
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=2)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            try:
                if self.proc.stdout:
                    self.proc.stdout.close()
                if self.proc.stderr:
                    self.proc.stderr.close()
            except Exception:
                pass
            self.proc = None

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
