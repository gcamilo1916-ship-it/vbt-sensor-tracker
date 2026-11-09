# Testing Infrastructure — Eros Interactive Switcher Variants & Synthetic Telemetry

## 1. Overview & Test Philosophy

The testing infrastructure for Eros interactive switcher variants and synthetic telemetry provides comprehensive, opaque-box, requirement-driven verification derived directly from `ORIGINAL_REQUEST.md` and `PROJECT.md`.

### Core Testing Tenets:
1. **Opaque-Box Requirement Derivation**: Tests validate system behavior, biomechanical kinematics, acoustic frequency sweeps, and visual transformations against specifications rather than implementation artifacts.
2. **Deterministic Mathematical Oracles**: Expected values for velocity decay, dynamic color interpolation, transform scaling, and Web Audio envelopes are derived from canonical physics and biomechanics formulas rather than hardcoded snapshots.
3. **Strict Physical Device Abstraction**: All tests execute in a pure headless software environment without physical equipment connections. In accordance with project guardrails, zero prohibited device terms are introduced anywhere in test files, code, or documentation; the system is referenced exclusively as `Eros`.
4. **Progressive Testability & Independence**: Each test case sets up its own isolated environment, asserts invariants deterministically, and cleans up after itself without cross-test state leakage.

---

## 2. 4-Tier Testing Methodology & Feature Inventory

The test suite is structured around a rigorous 4-Tier hierarchical methodology:
- **Tier 1 (Feature Coverage in Isolation)**: Verifies each visual, acoustic, and interactive feature independently.
- **Tier 2 (Boundary & Corner Cases)**: Exercises minimum velocity thresholds (MVT), explosive velocities, maximum RPE grinds, extreme plumb line deviations, rapid rep cycling, and missing audio contexts.
- **Tier 3 (Cross-Feature Combinations)**: Evaluates pairwise interactions between lift movements, RPE tiers, deviation corridors, and switcher exploration variants A–D.
- **Tier 4 (Real-World Application Scenarios)**: Simulates complete multi-rep training sets with progressive fatigue accumulation, sticking point deceleration, and end-to-end user workflows.

### Feature Inventory & Tier Coverage Mapping

| # | Feature from PROJECT.md | Scope | Tier 1 (Isolation) | Tier 2 (Boundaries) | Tier 3 (Cross-Combos) | Tier 4 (Workloads) | Total Tests |
|---|-------------------------|-------|:------------------:|:-------------------:|:---------------------:|:------------------:|:-----------:|
| 1 | Real-Time Vertical Stroke & Phase Kinematics | Squat, Bench, Deadlift displacement curves | 3 tests (1.1–1.3) | 2 tests (2.9, 2.12) | 3 tests (3.1–3.3) | 3 tests (4.1–4.3) | 11 |
| 2 | Horizontal Plumb-Line Deviation Tracking | 0.0cm plumb line, optimal/warning corridors | 1 test (1.4) | 3 tests (2.3–2.5) | 3 tests (3.1, 3.4, 3.5) | 2 tests (4.1, 4.2) | 9 |
| 3 | White-to-Lift Color Interpolation | Smooth transition (#FFFFFF -> Lift Color) | 3 tests (1.5–1.7) | 2 tests (2.1, 2.2) | 2 tests (3.4, 3.6) | 2 tests (4.2, 4.3) | 9 |
| 4 | Difficulty-Scaled Visual Completion Pop | Transform scale S_pop in [1.0, 2.5] | 1 test (1.8) | 2 tests (2.1, 2.6) | 2 tests (3.4, 3.8) | 2 tests (4.1, 4.3) | 7 |
| 5 | Pure Web Audio API Pop & Chime Synthesis | Frequency down-sweep + D5 chime + 55Hz sub | 4 tests (1.9–1.12) | 2 tests (2.6, 2.8) | 2 tests (3.8, 3.9) | 2 tests (4.1, 4.3) | 10 |
| 6 | Stage Micro-Switcher Pill UI | Variant cycling [VAR: A -> B -> C -> D -> A] | 1 test (1.13) | 1 test (2.10) | 1 test (3.7) | 1 test (4.5) | 4 |
| 7 | Collapsible Spatial Glass Switcher Sheet | Modal sheet open/close lifecycle | 1 test (1.14) | 1 test (2.10) | 1 test (3.10) | 1 test (4.5) | 4 |
| 8 | Variant A Implementation | Kinetic Dot + Difficulty Transition + Pop | 1 test (1.5) | 1 test (2.10) | 1 test (3.4) | 1 test (4.3) | 4 |
| 9 | Variant B Implementation | Fluid Velocity Energy Ribbon | 1 test (1.13) | 1 test (2.2) | 2 tests (3.1, 3.6) | 1 test (4.5) | 5 |
| 10 | Variant C Implementation | Concentric Ripple Waves anchored to plumb line | 1 test (1.13) | 1 test (2.3) | 2 tests (3.2, 3.9) | 1 test (4.5) | 5 |
| 11 | Variant D Implementation | Spatial Ghost Path + Velocity Breakdown Vectors | 1 test (1.13) | 1 test (2.4) | 2 tests (3.3, 3.5) | 1 test (4.4) | 5 |
| 12 | URL Deep-Linking & State Persistence | ?variant=A\|B\|C\|D query param & storage | 1 test (1.16) | 1 test (2.10) | 2 tests (3.9, 3.10) | 1 test (4.5) | 5 |
| 13 | Design Tokens & Terminology Compliance | visionOS glass tokens, zero forbidden terms | 2 tests (1.17, 1.18) | 1 test (2.9) | 1 test (3.8) | 1 test (4.6) | 5 |
| 14 | Synthetic Telemetry Test Harness | Deterministic 40-pt curves & set fatigue | 1 test (1.1) | 2 tests (2.7, 2.11) | 2 tests (3.1, 3.8) | 2 tests (4.1, 4.4) | 7 |
| 15 | E2E Regression & Integrity Verification | Full lifecycle verification & regression baseline | 1 test (1.15) | 2 tests (2.7, 2.8) | 2 tests (3.7, 3.10) | 2 tests (4.5, 4.6) | 7 |
| **TOTAL** | **Comprehensive Suite Coverage** | **4-Tier Suite Execution** | **18 Tests** | **12 Tests** | **10 Tests** | **6 Tests** | **46 Tests** |

---

## 3. Test Architecture & Components

The testing system is implemented across two coordinated modules in `tests/`:
1. `tests/synthetic_telemetry_harness.js`: The underlying simulation engine, mathematical oracles, and mock infrastructure.
2. `tests/test_interactive_switcher_variants.js`: The executable 46-test E2E assertion suite.

```
c:\Users\gcami\Documents\VBTanti\
├── tests/
│   ├── synthetic_telemetry_harness.js      # Simulation engine, mocks & mathematical oracles
│   └── test_interactive_switcher_variants.js # 4-Tier comprehensive E2E test runner
├── TEST_INFRA.md                          # Testing architecture documentation (this file)
└── TEST_READY.md                          # Test readiness report & coverage declaration
```

### 3.1 Deterministic Biomechanical Trajectory Generator
- Generates 40-point normalized kinematic trajectories ($p \in [0.0, 1.0]$) modeling authentic barbell biomechanics:
  - **Squat**: Anterior hole lean at depth ($0.8(1-p)^2$), mid-ascent knee travel flare ($1.8\sin(\pi p)(1-0.4p)$), returning to plumb line at lockout.
  - **Bench Press (McLaughlin J-curve)**: Sternum touch flaring rearward toward glenohumeral joint ($-3.2\sin(\pi p^{0.75})(1-0.2p)$) before vertical lockout.
  - **Deadlift**: Backward bar sweep into shins and thighs ($-0.9\sin(\pi(1-p)) + 2.0\sin(2\pi p)p$) clearing patellae into hip lockout.
- Calculates sticking point velocity depression near mid-ascent ($p \approx 0.40 - 0.65$):
  $$v_{peak} = \max(v_{mean} \times 1.35, v_{mean} + 0.15)$$
  $$v_{stick} = \max(0.12, v_{mean} \times (1.0 - 0.45 \times (rpe / 10)))$$

### 3.2 Headless Canvas 2D Mock Context
- Provides a comprehensive in-memory Canvas 2D rendering mock recording all graphical calls into an inspectable timeline (`ctx.operations`).
- Supports gradients (`createLinearGradient`, `createRadialGradient`, `addColorStop`), paths (`beginPath`, `moveTo`, `lineTo`, `arc`, `ellipse`), styling (`fillStyle`, `strokeStyle`, `lineWidth`, `lineDash`, `shadowBlur`), and state saving (`save`, `restore`).
- Provides inspection utilities: `findOperations()`, `getArcs()`, `getFills()`, `getStrokes()`, and `clearOperations()`.

### 3.3 Headless Web Audio API Mock
- Completely intercepts the Web Audio API graph without physical audio device dependencies:
  - Tracks all created `OscillatorNode` and `GainNode` instances.
  - Logs scheduled parameter events: `setValueAtTime`, `exponentialRampToValueAtTime`, and `linearRampToValueAtTime`.
  - Inspector helpers verify:
    * `hasFrequencySweep(startFreq, endFreq)`: checks for the 35ms downward pop transient sweep ($280 \to 80$ Hz).
    * `hasHarmonicChime(expectedBaseFreq)`: checks for the crystalline D5 (587.33 Hz) harmonic tone.
    * `hasSubBassThump(freq = 55)`: asserts presence of low-frequency sine resonance for heavy lifts ($RPE \ge 8.5$).

### 3.4 Headless DOM Environment
- Lightweight in-memory DOM simulation modeling `.bar-path-stage`, `#bar-path-canvas`, `#btn-variant-switcher`, `#variant-switcher-sheet`, `#btn-variant-audition-rep`, and HUD telemetry readouts.
- Full event listener registration and synchronous dispatch (`addEventListener`, `dispatchEvent`, `click()`).
- Emulates browser APIs: `window.location`, `window.localStorage`, and `requestAnimationFrame`.

### 3.5 Authoritative Mathematical Oracles
- **Difficulty Metric**:
  $$D = \text{clamp}\left(0.0, 1.0, 0.65 \times \frac{RPE - 6.0}{4.0} + 0.35 \times \frac{\max(0, v_{peak} - v)}{v_{peak} - v_{mvt}}\right)$$
- **Color Interpolation**:
  $$\mathbf{C}(D) = (1 - D) \cdot \mathbf{C}_{white} + D \cdot \mathbf{C}_{lift}$$
  - Deadlift: `#FF3B30` $(255, 59, 48)$
  - Squat: `#00FF66` $(0, 255, 102)$
  - Bench: `#00E5FF` $(0, 229, 255)$
- **Visual Pop Transform Scale**:
  $$S_{pop} = 1.0 + 1.5 \times \left(\frac{RPE - 6.0}{4.0}\right) \in [1.0, 2.5]$$
- **Corridor Boundaries**:
  $X_{canvas} = 110 + dx \times 18$ px. Optimal corridor: $|dx| \le 2.0$ cm. Warning corridor: $2.0 < |dx| \le 4.0$ cm. Alert corridor: $|dx| > 4.0$ cm.

### 3.6 Static Guardrail Scanners
- Scans all web application and test files for zero occurrences of prohibited device terms.
- Scans all `<button>` elements for zero emoji characters or symbol glyphs.

---

## 4. Test Execution Guide

### Primary Test Runner (Comprehensive 4-Tier Suite)
```powershell
Set-Location "c:\Users\gcami\Documents\VBTanti"
node tests/test_interactive_switcher_variants.js
```
*Expected Output*: `46 / 46 Passed (100%)` with zero errors.

### Existing Test Suite Regression Checks
```powershell
Set-Location "c:\Users\gcami\Documents\VBTanti"

# 1. Athlete View Overhaul Verification (R1 - R4)
node tests/test_athlete_view_r1_r4.js
# Expected: 24 / 24 assertions passed (100%)

# 2. Athlete View DOM & Replay Engine Challenge Harness
node tests/test_athlete_dom_replay_challenger.js
# Expected: 25 / 25 assertions passed (100% OK)
```

### Terminology Compliance Independent Verification
```powershell
Set-Location "c:\Users\gcami\Documents\VBTanti"
node -e "
const h = require('./tests/synthetic_telemetry_harness.js');
const files = [
  'index.html', 'style.css', 'athlete-fx.css', 'athlete-fx.js', 'app.js',
  'coach-portal.js', 'sync-bus.js', 'coach.css', 'coach-cue-hud.css', 'coach-cue-hud.js',
  'tests/synthetic_telemetry_harness.js', 'tests/test_interactive_switcher_variants.js'
];
const v = h.scanForbiddenTerms(files);
if (v.length === 0) console.log('Zero prohibited terms verified across all web and test files.');
else { console.error('Violations found:', v); process.exit(1); }
"
```
*Expected Output*: `Zero prohibited terms verified across all web and test files.`
