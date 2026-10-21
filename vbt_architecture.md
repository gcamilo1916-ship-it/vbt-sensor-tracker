# VBTanti Architecture

*This document is the project's central brain. Any agent that alters communication logic must update this document autonomously.*

## 1. Bluetooth Low Energy (BLE) Configuration

### UUIDs
- **Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- **Data Characteristic UUID:** `beb5483e-36e1-4688-b7f5-ea07361b26a8`
  - **Properties:** Notify, Read
  - **Purpose:** Sending lift results (velocity, RPE) from Eros to the App.
- **Command Characteristic UUID:** `5a7d3c90-951d-444a-8f5b-11c500732890`
  - **Properties:** Write, Write Without Response
  - **Purpose:** Receiving lift profile change commands from the App.

> **[!NOTE] Integration Architecture Aligned**
> The frontend `app.js` maps `dataCharacteristic` to `beb5483e...` for receiving notifications and `cmdCharacteristic` to `5a7d3c90...` for dispatching profile changes with strict command strings (`CMD:SL:DL`, `CMD:SL:SQ`, `CMD:SL:BP`). Both mobile and desktop browsers support standard GATT characteristic operations.

## 2. Data Packet Formats

### Eros to App (Telemetry/Results)
Triggered when a repetition is completed (end of `CONCENTRIC` phase).
- **Format:** String payload, pipe-delimited (`|`)
- **Structure:** `[Lift Name] | [Mean Velocity] m/s | RPE: [Estimated RPE]`
- **Example:** `Deadlift | 0.45 m/s | RPE: 8.5`
- **Length limit:** Max 64 bytes (MTU set to 64 on Eros)

### App to Eros (Commands)
Sent when a user selects a different lift profile from the frontend UI.
- **Expected String Payload (Eros `main.cpp`):**
  - Squat: `CMD:SL:SQ`
  - Bench Press: `CMD:SL:BP`
  - Deadlift: `CMD:SL:DL`

## 3. Physics Engine, Attitude Orientation & Finite State Machine (FSM)

### 3.1 High-Rate Attitude Orientation & 3D Gravity Removal
- **Orientation Fusion:** 6-axis attitude filter running deterministically at `dt = 0.01s`.
- **Orientation Tracking:** Quaternion $\mathbf{q} = (q_0, q_1, q_2, q_3)$ continuously tracks Eros attitude in 3D space with dynamic acceleration rejection ($|\mathbf{a}| - g < 2.5 m/s^2$).
- **Gravity Projection:** Derives the gravity reaction unit vector $\hat{\mathbf{g}}$ in body frame, isolates linear acceleration $\mathbf{a}_{lin} = \mathbf{a}_{meas} - G_{base}\hat{\mathbf{g}}$, and projects along the true Earth vertical axis: $a_{vert} = \mathbf{a}_{lin} \cdot \hat{\mathbf{g}}$.
- **Vibration & Tilt Immunity:** Eliminates false upward velocity caused by non-linear Euclidean magnitude rectification; lateral shudder and bar tilt do not leak into vertical velocity.

### 3.2 Dual-Signal Moving Variance ZUPT Detector
- **Windowed Variance:** Circular buffer evaluating moving variance over a 200ms window (20 samples) for both linear acceleration ($\sigma_a^2$) and gyroscope rates ($\sigma_\omega^2$).
- **Thermal Drift Tracking:** When verified stationary ($\sigma_a^2 < 0.040$, $\sigma_\omega^2 < 0.005$, $\omega_{rate} < 0.20$, $\Delta g < 0.35$):
  - Zero-rate gyroscope bias vector $\mathbf{b}_\omega$ adapts continuously: $\mathbf{b}_\omega \leftarrow 0.998\mathbf{b}_\omega + 0.002\bar{\mathbf{\omega}}$.
  - Gravity baseline $G_{base}$ adapts continuously: $G_{base} \leftarrow 0.998 G_{base} + 0.002 \|\bar{\mathbf{a}}\|$.
  - Velocity and filtered acceleration are zeroed (ZUPT).
  - Breaks the circular dependency: rest detection is invariant to baseline and thermal bias shifts.

### 3.3 FSM States (`RepState` enum)
The bar tracking follows an unbreakable Finite State Machine with timeouts:
1. **`IDLE`**: Barbell is at rest or stabilizing. ZUPT locks velocity when motionless; continuous damping ($v \times 0.96$) prevents jitter accumulation.
   - Transitions to `ECCENTRIC` if velocity drops below `-0.12 m/s`.
   - Transitions to `CONCENTRIC` if velocity exceeds `+0.12 m/s` (e.g. direct concentric pull for Deadlift).
2. **`ECCENTRIC`**: The downward phase of the lift.
   - Paused lift handling: If bar becomes stationary at the bottom (e.g. paused squat or paused bench), ZUPT zeros velocity to prevent negative integration drift.
   - Transitions to `CONCENTRIC` when upward drive produces velocity $> 0.10 m/s$.
   - Safety Guard: Aborts cleanly back to `IDLE` if eccentric duration exceeds 5.0 seconds, or if motionless on safety pins for $\ge 2.5$ seconds (allowing up to 2.0s paused bench/squat variations).
3. **`CONCENTRIC`**: The upward, power phase of the lift. Displacement and peak velocity are accumulated.
   - Completes repetition if:
     1. Bar is stationary at lockout with displacement $\ge 0.12m$, OR
     2. Velocity decelerates to $\le 0.04 m/s$ after peaking $\ge 0.15 m/s$ with displacement $\ge 0.12m$, OR
     3. State duration exceeds 5.0 seconds (timeout guard).
   - If displacement $\ge 0.12m$, duration $\ge 0.25s$, and peak velocity $\ge 0.15m/s$, a valid repetition is logged and notified via BLE.
   - Resets physics state and enters a 250ms refractory window before returning to `IDLE`.

### Global State Variables
- **`currentLift` / `pendingLift`**: Pointers to the active biomechanical `LiftProfile`. Queued changes apply only during the `IDLE` state.
- **`velocity` (float)**: Integrated from true Earth vertical linear acceleration.
- **`rep_displacement` (float)**: Accumulated distance during the concentric phase.
- **`peak_concentric_velocity` (float)**: Maximum velocity recorded during the concentric drive.
- **`gravity_baseline` (float)**: Ambient 1G baseline continuously adapted during stationary periods.
- **`gyro_bias_x/y/z` (float)**: 3-axis gyro zero-rate offsets continuously adapted during stationary periods.
- **`filtered_accel` (float)**: Low-pass filtered vertical acceleration (`ALPHA = 0.40`).
- **`state_start_time` (unsigned long)**: Timestamp capturing the entry into current FSM state for duration tracking and timeout protection.

### Lift Profiles
Each movement has predefined biomechanical baselines for RPE estimation:
- **Deadlift:** Minimum Velocity Threshold (MVT) = `0.15 m/s`, Velocity at RPE 8 = `0.35 m/s`
- **Squat:** Minimum Velocity Threshold (MVT) = `0.22 m/s`, Velocity at RPE 8 = `0.42 m/s`
- **Bench:** Minimum Velocity Threshold (MVT) = `0.16 m/s`, Velocity at RPE 8 = `0.32 m/s`

## 4. Integration Points & Handshake
1. **Connection Lifecycle**: 
   - When a client connects, `deviceConnected` is set to `true`.
   - On disconnect, Eros waits 500ms and restarts BLE advertising.
2. **Handshake Reset**: 
   - Upon a new connection (transition of `oldDeviceConnected` -> `deviceConnected`), Eros performs a physics reset: zeroing out velocity, resetting `last_time = millis()`, and returning to the `IDLE` state.
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
   - Logged in real-time as notifications arrive from the Eros data characteristic.

### Glass OS Visual Identity
- **VisionOS Obsidian Glow**: Deep obsidian base (`#08080C`) paired with radial ambient lighting that smoothly responds to the active lift theme (Deadlift Magenta `#FF0055`, Squat Emerald `#00FF66`, Bench Cyan `#00E5FF`).
- **Translucent Frosted Panels**: Built with `backdrop-filter: blur(20px)` and `-webkit-backdrop-filter: blur(20px)` specifically targeting iOS and desktop browsers.
- **Specular Highlights & Depth**: `inset 0 1px 0 0 rgba(255, 255, 255, 0.16)` paired with soft neon drop shadows.
- **Physics Bar Path & Apex Bloom**: Dynamically binds CSS variable `--rep-duration` to \((0.5 / \text{velocity}) \times 2\), synchronizing the vertical orb travel and triggering an apex bloom at movement zenith.

### Data Portability
- **CSV Export**: Clean tabular export formatted for sports science, biomechanics coaching, and spreadsheet analysis.
- **JSON Export**: Full nested hierarchy dump for backups and developer imports.
