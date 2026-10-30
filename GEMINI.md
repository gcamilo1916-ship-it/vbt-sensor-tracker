# IMU Biomechanics, Sensor Fusion & Long-Uptime Drift Rules

Critical biomechanics and sensor fusion guardrails for IMU Zero Velocity Update (ZUPT) and Velocity-Based Training (VBT) firmware.

## 1. Decouple Rest Detection from Baseline Drift
- **Never use static scalar magnitude thresholds alone** to determine stationary state (e.g., $|\|\mathbf{a}\| - 9.81| < \epsilon$). As the IMU warms up, junction thermal self-heating induces baseline acceleration drift ($+0.1\text{ to }+0.3\text{ m/s}^2$) and zero-rate gyro drift ($+0.02\text{ to }+0.06\text{ rad/s}$), which permanently breaks static threshold detectors.
- **Employ a multi-sample moving variance detector** (e.g., 20 samples / 200ms at 100Hz) on both acceleration ($\sigma_a^2 < 0.040$) and angular rate ($\sigma_\omega^2 < 0.005$).
- **Online Adaptation**: When high-frequency variance confirms true rest, adapt the ambient gravity baseline ($G_{base}$) and zero-rate gyroscope bias vectors ($\mathbf{b}_\omega$) smoothly ($0.998 \times \text{bias} + 0.002 \times \text{measurement}$).

## 2. 6-Axis Quaternion Gravity Alignment
- Ensure quaternion horizontal tilt cross-product aligns correctly with Earth gravity ($axis_x = ay, axis_y = -ax$ for body-to-world conversion).
- Project linear acceleration strictly along the estimated vertical gravity unit vector ($a_{vert} = \mathbf{a}_{lin} \cdot \hat{\mathbf{g}}$) to eliminate false velocity accumulation from lateral bar rattle and tilt.

## 3. Context-Aware Paused & Touch-and-Go Biomechanics
- **Paused Lifts**: In eccentric descent, gate bottom-pause ZUPT by velocity magnitude ($|v| < 0.10\text{ m/s}$) and vertical acceleration ($|a_{vert}| < 0.20\text{ m/s}^2$) so deceleration does not trigger mid-air velocity wipes. Allow up to 3.5s motionless holds on safety pins before aborting to IDLE.
- **Touch-and-Go Barbell Cycling**: Never zero velocity unconditionally during post-rep refractory windows; maintain negative velocity integration with directional lockouts so subsequent repetitions are captured seamlessly.

## 4. Eros Web App & Coach Portal Guardrails
- **Hardware Terminology Abstraction**: Never use `WebBLE`, `100Hz`, `ESP32`, `ESP32-C6`, `IMU`, `Madgwick`, `Bluefy`, `sensor`, or `hardware` anywhere in web application files (`*.html`, `*.css`, `*.js`, or web docs). Refer to the device exclusively as `Eros` (preserving `VBT_Tracker` solely as the single internal `DEVICE_NAME` constant in `app.js`).
- **Dual-Persona UI Architecture**:
  - **Athlete View**: Maintain the visionOS Spatial Glass aesthetic (`#050508` void, punchy red `#FF3B30` Deadlift with `#FF857D` WCAG AA text tint, `#00E5FF` Squat, `#00FF66` Bench, emoji-free velocity subtext, celebratory set-completion FX, 2-row responsive mobile `.controls-row` grid under `<= 430px`, and circular 36px icon-only connection button `#status-badge`).
  - **Coach View (`body.portal-coach`)**: Maintain a minimalist ChatGPT-inspired matte obsidian dark UI (`#0d0d0d`, `#171717`, `#212121`, `#2f2f2f`), revealed via 500ms long-press on `#btn-mode-athlete`, with landscape/large-screen advisory toast and synthesized Web Audio SFX.
- **History Page Workout Naming**: Squat and Deadlift are always `"Main"` (`"SBD"` for all three lifts, `"Main deadlift + Bench"`, `"Main squat + Bench"`, `"Main squat + Main deadlift"`, `"Main squat"`, `"Main deadlift"`, `"Bench"`).
- **Client-Side Sync & Backend Approval Gate**: Keep Athlete-to-Coach set telemetry synchronization client-side (`ErosSyncBus` in `sync-bus.js` via `CustomEvent` + `BroadcastChannel` + `localStorage`) unless the user explicitly approves backend server or database changes first.
- **Inter-Set Rest Tracking & Telemetry**: Automatically start an inter-set rest timer upon set completion and reset it when the next set begins. Persist `restSeconds` in workout history logs and stream live rest durations to the dedicated `REST` column in the coach console.
- **Coach Console & Prescription Feature Ownership**: Consolidate load adjustments and target rest duration configurations exclusively within the Coach Prescription Console; never inject load modification buttons into squad overview cards. Render only genuine connected athletes (or a clean empty state) in the coach console, omitting mock athlete profiles.
- **Athlete Settings Micro-Menu**: Provide a settings button on the Athlete History page opening a visionOS glass modal for coach connection management and pairing code entry.
- **Root Coach Cue HUD & Sound Engine**: Keep `#coach-cue-hud` at `.app-container` root for cross-tab visibility with 400ms event signature deduplication, responsive text truncation, and synthesized Web Audio chimes for incoming tactical cues.
