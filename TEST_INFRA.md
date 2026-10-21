# Testing Infrastructure — Eros VBT (Apple visionOS Spatial Glass)

## 1. Overview & Methodology

The automated test suite for Eros VBT provides comprehensive, requirement-driven, opaque-box verification across the application's visual overhaul, typography, interaction design, and backend invariant preservation.

Testing is structured strictly around a **4-Tier Methodology**:
- **Tier 1: Feature Coverage (>=5 test cases per feature across all 16 features from `PROJECT.md`)**
- **Tier 2: Boundary, Negative & Adversarial Cases (>=5 test cases per feature across all 16 features)**
- **Tier 3: Cross-Feature Combinations & Pairwise Interactions (multi-feature state transitions, theme syncing, telemetry rendering)**
- **Tier 4: Real-World Application Workload Scenarios (5x5 strength training, endurance workloads, Eros reconnects, persistence & export)**
- **Browser Live Smoke & CDP Interception (Headless Chrome remote debugging on port 9444)**

Total test cases implemented: **187 automated tests**.

---

## 2. Environment & Zero-Dependency Execution

The test suite runs with **zero npm / Node.js dependencies**, executing entirely on Python 3.15 using standard libraries:
- `unittest` for hierarchical test discovery and assertion reporting.
- `urllib.request` / `json` for Chrome DevTools Protocol (CDP) session management.
- `subprocess` for headless browser process orchestration.
- `re` for strict CSS token, AST bracket balancing, and DOM contract validation.
- `math` for exact biomechanical formula verification.

### System Prerequisites
- **Python**: 3.15+ (`python --version`)
- **Headless Browser**: Google Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`)
- **Host OS**: Windows 11

---

## 3. Directory Layout

All testing code is isolated inside `C:\Users\gcami\Documents\VBTanti\tests/`:

```
C:\Users\gcami\Documents\VBTanti\tests/
├── __init__.py                 # Test package initialization
├── conftest_base.py            # Base fixtures, CSS/HTML parsers, math oracles, and CDP controller
├── test_tier1_features.py      # Tier 1: 80 Feature Coverage tests (Features 1–16)
├── test_tier2_boundaries.py    # Tier 2: 80 Boundary, Negative & Edge tests (Features 1–16)
├── test_tier3_pairwise.py      # Tier 3: 16 Cross-Feature Pairwise Interaction tests
├── test_tier4_workload.py      # Tier 4: 8 Real-World Training & Telemetry Workloads
├── test_browser_headless.py    # Headless Chrome DevTools integration & visual smoke
└── run_all_e2e_tests.py        # Unified CLI test runner with tier/milestone filters
```

---

## 4. Test Commands & CLI Runner

The test suite includes a unified runner (`tests/run_all_e2e_tests.py`) supporting flexible filtering by Tier or Milestone, verbose logging, and structured JSON reporting.

### 4.1 Run the Full Test Suite
```powershell
python tests/run_all_e2e_tests.py
```

### 4.2 Run with JSON Execution Report
```powershell
python tests/run_all_e2e_tests.py --json-report tests/report.json
```

### 4.3 Filter by Milestone
```powershell
# Milestone 1: Surfaces, Specular Refraction & CSS Syntax
python tests/run_all_e2e_tests.py --milestone M1

# Milestone 2: Apple Typography & Pill Buttons
python tests/run_all_e2e_tests.py --milestone M2

# Milestone 3: Interactive Dropdown & Unclipping
python tests/run_all_e2e_tests.py --milestone M3

# Milestone 4: Ambient Mesh Glow & 60fps Animations
python tests/run_all_e2e_tests.py --milestone M4

# Milestone 5: Backend GATT, BLE & Analytics Preservation
python tests/run_all_e2e_tests.py --milestone M5

# Milestone 6: Design QA, Browser Smoke & Visual Regression
python tests/run_all_e2e_tests.py --milestone M6
```

### 4.4 Filter by Tier
```powershell
python tests/run_all_e2e_tests.py --tier 1       # Run all 80 Tier 1 tests
python tests/run_all_e2e_tests.py --tier 2       # Run all 80 Tier 2 tests
python tests/run_all_e2e_tests.py --tier 3       # Run all 16 Tier 3 tests
python tests/run_all_e2e_tests.py --tier 4       # Run all 8 Tier 4 workloads
python tests/run_all_e2e_tests.py --tier browser # Run Headless Chrome CDP tests
```

### 4.5 Standard unittest Execution
```powershell
python -m unittest discover -s tests -p "test_*.py"
```

---

## 5. Authoritative Output Derivation & Mathematical Oracle

All test assertions derive expected values from authoritative ground truth defined in `PROJECT.md`, `ORIGINAL_REQUEST.md`, and `vbt_architecture.md`:

### 5.1 Analytics Formulas (`VBTMathOracle`)
- **Average Velocity**: $\text{avgVel} = \text{round}\left(\frac{\sum v_i}{N}, 2\right)$
- **Peak Velocity**: $\text{maxVel} = \text{round}(\max(V), 2)$
- **Minimum Velocity**: $\text{minVel} = \text{round}(\min(V), 2)$
- **Average RPE**: $\text{avgRpe} = \text{round}\left(\frac{\sum r_i}{N}, 1\right)$
- **Velocity Loss Percentage**: $\text{lossPct} = \text{round}\left(\max\left(0, \frac{\text{maxVel} - v_{\text{last}}}{\text{maxVel}} \times 100\right), 1\right)$
- **SVG Stroke Dashoffset**: $\text{Circumference} = 2 \pi (90) = 565.48$, $\text{offset} = 565.48 - (565.48 \times \min(\max(\frac{\text{avgVel}}{1.0}, 0), 1))$
- **Rep Physics Duration**: $\text{duration} = \text{clamp}\left(0.5, \left(\frac{0.5}{\max(v, 0.1)}\right) \times 2, 5.0\right)$
- **Apex Bloom Timing**:
  - Deadlift: $\text{delay} = \frac{\text{duration} \times 1000}{2}$ (zenith midpoint)
  - Squat / Bench: $\text{delay} = \text{duration} \times 1000 \times 0.95$ (top lockout)

---

## 6. Feature Coverage Matrix (16 Features)

| Feature ID | Description | Milestone | Tier 1 Tests | Tier 2 Tests | Tier 3/4 Coverage |
|---|---|---|---|---|---|
| F1 | Ultra-translucent glass panels | M1 | `test_f01_01`..`05` (5) | `test_b01_01`..`05` (5) | `test_p01`, `test_p06`, `test_p13` |
| F2 | Top-down specular light refraction | M1 | `test_f02_01`..`05` (5) | `test_b02_01`..`05` (5) | `test_p13` |
| F3 | CSS syntax cleanup | M1 | `test_f03_01`..`05` (5) | `test_b03_01`..`05` (5) | `test_p13` |
| F4 | Refined "Eros" brand styling | M2 | `test_f04_01`..`05` (5) | `test_b04_01`..`05` (5) | `test_p14` |
| F5 | Action button emoji purge | M2 | `test_f05_01`..`05` (5) | `test_b05_01`..`05` (5) | `test_p11` |
| F6 | VisionOS pill capsule buttons | M2 | `test_f06_01`..`05` (5) | `test_b06_01`..`05` (5) | `test_p05`, `test_p07`, `test_p10` |
| F7 | Monospace / tabular figures | M2 | `test_f07_01`..`05` (5) | `test_b07_01`..`05` (5) | `test_p03`, `test_p04`, `test_p14` |
| F8 | Unclipped lift dropdown | M3 | `test_f08_01`..`05` (5) | `test_b08_01`..`05` (5) | `test_p02`, `test_p06` |
| F9 | Dropdown interactivity & a11y | M3 | `test_f09_01`..`05` (5) | `test_b09_01`..`05` (5) | `test_p01`, `test_p02`, `test_p15` |
| F10 | Ambient mesh glow blobs | M4 | `test_f10_01`..`05` (5) | `test_b10_01`..`05` (5) | `test_p01`, `test_p06` |
| F11 | 60fps animations & apex bloom | M4 | `test_f11_01`..`05` (5) | `test_b11_01`..`05` (5) | `test_p01`, `test_p04`, `test_p09` |
| F12 | Backend GATT & BLE preservation | M5 | `test_f12_01`..`05` (5) | `test_b12_01`..`05` (5) | `test_p02`, `test_p03`, `test_p10`, `test_w03`, `test_w08` |
| F13 | Data hierarchy & schema | M5 | `test_f13_01`..`05` (5) | `test_b13_01`..`05` (5) | `test_p03`, `test_p04`, `test_p07`, `test_p11`, `test_p12`, `test_w01`..`w07` |
| F14 | DOM binding contracts (38 IDs) | M5 | `test_f14_01`..`05` (5) | `test_b14_01`..`05` (5) | `test_p05`, `test_p07`, `test_p08`, `test_p10`, `test_p15` |
| F15 | E2E Testing Suite (Tiers 1-4) | E2E | `test_f15_01`..`05` (5) | `test_b15_01`..`05` (5) | Self-verification |
| F16 | Design QA & Visual Regression | M6 | `test_f16_01`..`05` (5) | `test_b16_01`..`05` (5) | `test_chrome_01`..`03` |

Total test cases: **80 (Tier 1) + 80 (Tier 2) + 16 (Tier 3) + 8 (Tier 4) + 3 (Browser) = 187 tests**.
