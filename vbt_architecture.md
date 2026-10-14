# VBTanti Architecture

*This document is the project's central brain. Any agent that alters communication logic must update this document autonomously.*

## 1. Bluetooth Low Energy (BLE) Configuration

### UUIDs
- **Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- **Data Characteristic UUID:** `beb5483e-36e1-4688-b7f5-ea07361b26a8`
  - **Properties:** Notify, Read
  - **Purpose:** Sending lift results (velocity, RPE) from ESP32 to the App.
- **Command Characteristic UUID:** `5a7d3c90-951d-444a-8f5b-11c500732890`
  - **Properties:** Write, Write Without Response
  - **Purpose:** Receiving lift profile change commands from the App.

> **[!NOTE] Integration Architecture Aligned**
> The frontend `app.js` maps `dataCharacteristic` to `beb5483e...` for receiving notifications and `cmdCharacteristic` to `5a7d3c90...` for dispatching profile changes with strict command strings (`CMD:SL:DL`, `CMD:SL:SQ`, `CMD:SL:BP`). Both iOS Bluefy and desktop Chrome support standard GATT characteristic operations.

## 2. Data Packet Formats

### Device to App (Telemetry/Results)
Triggered when a repetition is completed (end of `CONCENTRIC` phase).
- **Format:** String payload, pipe-delimited (`|`)
- **Structure:** `[Lift Name] | [Mean Velocity] m/s | RPE: [Estimated RPE]`
- **Example:** `Deadlift | 0.45 m/s | RPE: 8.5`
- **Length limit:** Max 64 bytes (MTU set to 64 on ESP32)

### App to Device (Commands)
Sent when a user selects a different lift profile from the frontend UI.
- **Expected String Payload (ESP32 `main.cpp`):**
  - Squat: `CMD:SL:SQ`
  - Bench Press: `CMD:SL:BP`
  - Deadlift: `CMD:SL:DL`

## 3. Physics Engine & Finite State Machine (FSM)

### FSM States (`RepState` enum)
The bar tracking follows a strict Finite State Machine to track a repetition:
1. **`IDLE`**: Barbell is at rest or stabilizing. Context-aware ZUPT (Zero Velocity Update) is active to prevent sensor drift.
   - Transitions to `ECCENTRIC` if velocity drops below `-0.10 m/s`.
   - Transitions to `CONCENTRIC` if velocity exceeds `0.10 m/s` (bypassing eccentric, depending on the movement).
2. **`ECCENTRIC`**: The downward phase of the lift.
   - Transitions to `CONCENTRIC` when velocity reverses and exceeds `0.05 m/s`.
3. **`CONCENTRIC`**: The upward, power phase of the lift. Displacement is integrated over time.
   - Transitions to `IDLE` when velocity drops below `0.01 m/s` (end of lift).
   - If displacement > 0.12m and duration > 0.3s, a valid repetition is logged and transmitted via BLE.

### Global State Variables
- **`currentLift` / `pendingLift`**: Pointers to the active biomechanical `LiftProfile`. Queued changes apply only during the `IDLE` state.
- **`velocity` (float)**: Integrated from filtered dynamic acceleration.
- **`rep_displacement` (float)**: Accumulated distance during the concentric phase.
- **`gravity_baseline` (float)**: Calibrated 1G baseline to isolate dynamic acceleration. Slowly adapts during the `IDLE` phase.
- **`filtered_accel` (float)**: Exponentially smoothed acceleration (using `ALPHA = 0.15`).
- **`rep_start_time` (unsigned long)**: Timestamp capturing the start of the concentric phase to calculate mean velocity.

### Lift Profiles
Each movement has predefined biomechanical baselines for RPE estimation:
- **Deadlift:** Minimum Velocity Threshold (MVT) = `0.15 m/s`, Velocity at RPE 8 = `0.35 m/s`
- **Squat:** Minimum Velocity Threshold (MVT) = `0.22 m/s`, Velocity at RPE 8 = `0.42 m/s`
- **Bench:** Minimum Velocity Threshold (MVT) = `0.16 m/s`, Velocity at RPE 8 = `0.32 m/s`

## 4. Integration Points & Handshake
1. **Connection Lifecycle**: 
   - When a client connects, `deviceConnected` is set to `true`.
   - On disconnect, the ESP32 waits 500ms and restarts BLE advertising.
2. **Handshake Reset**: 
   - Upon a new connection (transition of `oldDeviceConnected` -> `deviceConnected`), the ESP32 performs a physics reset: zeroing out velocity, resetting `last_time = millis()`, and returning to the `IDLE` state.
3. **Safety Clamping**:
   - Delta-time clamp (`if (dt > 0.1) { dt = 0.01; }`) protects velocity integration from CPU blocks during BLE handshakes.
4. **Lift Queueing**: 
   - Commands sent via BLE to change the active lift modify the `pendingLift` variable. This avoids race conditions by only committing the new lift to `currentLift` once the FSM enters the `IDLE` state.

## 5. UI Architecture & Nested Data Hierarchy (Glass OS)

### Data Hierarchy (`localStorage` key: `vbt_workouts_v1`)
The application implements a strict 3-tier nested hierarchy:
1. **Workout Sessions (`workouts[]`)**:
   - Fields: `id`, `startTime`, `endTime`, `dateStr`, `name`, `sets[]`.
   - Lifecycle: Initiated via "Start Workout" button (or auto-started on first rep/set). Features real-time session duration timer.
2. **Sets (`sets[]`)**:
   - Fields: `setId`, `setNumber`, `lift`, `startTime`, `endTime`, `avgVelocity`, `maxVelocity`, `minVelocity`, `velocityLossPct`, `avgRpe`, `reps[]`.
   - Metrics: Evaluates velocity loss percentage: \(((V_{\text{max}} - V_{\text{last}}) / V_{\text{max}}) \times 100\%\).
3. **Reps (`reps[]`)**:
   - Fields: `repNumber`, `lift`, `velocity`, `rpe`, `timestamp`.
   - Logged in real-time as notifications arrive from the ESP32 data characteristic.

### Glass OS Visual Identity
- **VisionOS Obsidian Glow**: Deep obsidian base (`#08080C`) paired with radial ambient lighting that smoothly responds to the active lift theme (Deadlift Magenta `#FF0055`, Squat Emerald `#00FF66`, Bench Cyan `#00E5FF`).
- **Translucent Frosted Panels**: Built with `backdrop-filter: blur(20px)` and `-webkit-backdrop-filter: blur(20px)` specifically targeting iOS Safari & Bluefy WebBLE browser.
- **Specular Highlights & Depth**: `inset 0 1px 0 0 rgba(255, 255, 255, 0.16)` paired with soft neon drop shadows.
- **Physics Bar Path & Apex Bloom**: Dynamically binds CSS variable `--rep-duration` to \((0.5 / \text{velocity}) \times 2\), synchronizing the vertical orb travel and triggering an apex bloom at movement zenith.

### Data Portability
- **CSV Export**: Clean tabular export formatted for sports science, biomechanics coaching, and spreadsheet analysis.
- **JSON Export**: Full nested hierarchy dump for backups and developer imports.
