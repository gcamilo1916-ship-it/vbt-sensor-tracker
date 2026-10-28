# Eros Athlete-Coach Connection Architecture Plan & Interactive User Guide

**Publication-Grade Engineering & Operational Manual**  
**Document Version:** 1.0.0 (Production Release)  
**Classification:** System Architecture Plan & Interactive Protocol Guide  
**System Ecosystem:** Eros Velocity-Based Training (VBT) Platform  
**Target Environments:** Eros Web Application (Athlete Spatial Glass & Coach Dark Cockpit)  
**Date:** October 2026  

---

## 1. Executive Summary & Architecture Overview

The **Eros Velocity-Based Training (VBT) Platform** bridges real-time athletic execution on the barbell with precision strength coaching. In high-performance strength environments, athletes require immediate, non-intrusive biofeedback during a lift, while coaches require continuous tactical oversight, velocity loss surveillance, and low-friction communication channels to prescribe immediate load adaptations.

Historically, this coaching loop suffered from substantial latency: athletes recorded sets manually or reviewed retrospective video clips, while coaches calculated fatigue hours after training sessions concluded. Eros eliminates this separation through a unified, reactive single-page architecture that connects the **Athlete View** (an Apple visionOS Spatial Glass interface optimized for instant lift visibility) and the **Coach View** (a ChatGPT-inspired dark obsidian cockpit engineered for multi-set analysis and low-friction directives).

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           EROS IN-APP ATHLETE-COACH SYNCHRONIZATION                              │
│                                                                                                  │
│   ┌───────────────────────────────┐                  ┌────────────────────────────────────────┐  │
│   │         ATHLETE VIEW          │                  │              COACH VIEW                │  │
│   │     (Spatial Glass HUD)       │                  │        (ChatGPT Dark Cockpit)          │  │
│   │                               │                  │                                        │  │
│   │ • Barbell Lift Execution      │                  │ • Active Set Live Monitor (MCV, PV)    │  │
│   │ • Real-time Velocity Colors   │                  │ • Velocity Loss Radial Gauge           │  │
│   │ • Celebratory Set Bloom FX    │                  │ • Completed Sets History Table         │  │
│   │ • Rest HUD with Countdown Ring│                  │ • Low-Friction Load Overrides & Cues   │  │
│   └──────────────┬────────────────┘                  └───────────────────▲────────────────────┘  │
│                  │                                                       │                       │
│                  │  Local In-Memory Event Dispatch                       │                       │
│                  ▼                                                       │                       │
│   ┌──────────────────────────────────────────────────────────────────────┴────────────────────┐  │
│   │                                       ErosSyncBus                                         │  │
│   │                           (Deterministic Reactive Event Bus)                              │  │
│   │                                                                                           │  │
│   │  • set:started          ───► Context Initialization (Lift, Weight, Target RPE)            │  │
│   │  • rep:recorded         ───► Live Rep Kinematics (Mean/Peak Velocity, ROM, Loss %)        │  │
│   │  • set:completed        ───► Set Summary Aggregation (Total Volume, Fatigue Index)        │  │
│   │  • coach:cue            ───► Tactical Technical Directive ('Drive hips!', 'Squeeze lats') │  │
│   │  • coach:load_override  ───► Prescriptive Weight Adjustment with 20s Auto-Accept Ring     │  │
│   │  • coach:load_response  ───► Athlete Acceptance or Dismissal Confirmation                 │  │
│   └──────────────────────────────────────────┬────────────────────────────────────────────────┘  │
│                                              │                                                   │
│                                              ▼ Cross-Tab / Multi-Screen Mirroring                │
│   ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│   │                       BroadcastChannel('eros_coach_sync_v1')                              │  │
│   │          Synchronizes Athlete on Mobile Phone with Coach on Tablet / Laptop               │  │
│   └───────────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Pillars

1. **Deterministic Single-Page Synchronization**: The application maintains a unified reactive state. Switching between Athlete and Coach views occurs in less than $16\text{ ms}$ (within a single display refresh frame) with zero page reloads, zero network round-trip overhead, and complete preservation of workout timers and active set buffers.
2. **Dual-Channel Event Distribution**: Communication operates via `ErosSyncBus` (an in-memory publish/subscribe event engine) with seamless loop-free propagation to browser-native `BroadcastChannel` instances, enabling coaches to monitor athlete execution across multiple browser tabs or independent displays in real time.
3. **Strict Local-First Execution**: All set recording, velocity metrics, fatigue tracking, and coach interventions are processed entirely on the client-side frontend. No remote server or external database is contacted.
4. **Mandatory User Consent Boundary**: Any future transition to remote cloud backends, centralized database storage, or multi-tenant network relays is strictly gated behind an explicit notification and user approval protocol.

---

## 2. Transmission & Reception Architecture: How Sets Flow from Athlete to Coach

The synchronization lifecycle between the athlete lifting the barbell and the coach monitoring the platform follows a deterministic, unidirectional telemetry pipeline and a bidirectional feedback loop.

### 2.1 The Lift Execution & Telemetry Pipeline

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               TELEMETRY TRANSMISSION SEQUENCE                                    │
│                                                                                                  │
│   [ ATHLETE ACTIONS ]                     [ ErosSyncBus ]                 [ COACH COCKPIT ]      │
│            │                                     │                                │              │
│            │ 1. Tap 'START SET'                  │                                │              │
│            ├────────────────────────────► emit('set:started') ───────────────────►│              │
│            │                                     │                        Initialize Live Monitor│
│            │ 2. Ascend Barbell (Rep 1)           │                                │              │
│            │    Compute MCV: 0.48 m/s            │                                │              │
│            ├────────────────────────────► emit('rep:recorded') ──────────────────►│              │
│            │                                     │                        Render Rep 1 Sparkline │
│            │ 3. Ascend Barbell (Rep 2)           │                                │              │
│            │    Compute MCV: 0.42 m/s            │                                │              │
│            ├────────────────────────────► emit('rep:recorded') ──────────────────►│              │
│            │                                     │                        Update V-Loss: 12.5%   │
│            │ 4. Tap 'END SET' (or Cutoff)        │                                │              │
│            ├────────────────────────────► emit('set:completed') ─────────────────►│              │
│            │                                     │                        Commit to History Table│
│            │                                     │                                │              │
│            │ 5. Rest Interval Commences          │                                │              │
│            │                                     │  6. Coach issues [-5.0 kg]     │              │
│            │◄───────────────────────────── emit('coach:load_override') ──────────┤              │
│            │ Display Rest HUD + 20s Ring         │                                │              │
│            │                                     │                                │              │
│            │ 7. Athlete Accepts (or Auto-Accept) │                                │              │
│            ├────────────────────────────► emit('coach:load_response') ──────────►│              │
│            │ Load updated to upcoming set        │                        Display Status Toast   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Step 1: Set Context Initialization (`set:started`)
When the athlete enters a working set, the system evaluates the selected movement (`Deadlift`, `Squat`, or `Bench Press`), the loaded working weight (e.g., $210.0\text{ kg}$), and the target RPE. Upon invoking `startNewSet()`, the athlete runtime assigns a unique monotonic identifier (`setId`), starts the set duration counter, and emits `set:started` over `ErosSyncBus`.

In the Coach View, the active set live monitor resets previous metric displays, mounts the movement denomination badge with its canonical color accent (`Deadlift` punchy red `#ff3b30`, `Squat` emerald `#00ff66`, `Bench` laser cyan `#00e5ff`), displays the target weight, and clears the repetition sparkline stream.

#### Step 2: Repetition Kinematics & Live Broadcast (`rep:recorded`)
As the barbell moves through the concentric phase of each repetition, Eros kinematic tracking isolates vertical linear displacement and velocity. When repetition lockout occurs:
1. Mean Concentric Velocity (MCV), Peak Velocity (PV), Range of Motion (ROM), and concentric duration are computed.
2. Velocity loss relative to the first (or fastest) repetition of the active set is calculated:
   $$\text{Velocity Loss } (\%) = \left(\frac{V_{\text{fastest}} - V_{\text{current}}}{V_{\text{fastest}}}\right) \times 100$$
3. The repetition record is appended to the athlete's active set buffer in memory.
4. An event payload `rep:recorded` is published across `ErosSyncBus`.

Upon receiving `rep:recorded`, the Coach View updates its bento indicators within milliseconds:
- The tabular **Mean Velocity** counter refreshes to show the exact concentric speed.
- The **Peak Velocity** badge captures explosive drive.
- The **Velocity Loss Gauge** animates to reflect cumulative neuromuscular fatigue. If velocity loss exceeds the prescribed threshold (e.g., $20\%$), the gauge transitions to an alert state warning the coach that technical breakdown or failure is imminent.
- A new row is appended to the repetition telemetry sparkline, preserving chronological visibility for every rep.

#### Step 3: Set Conclusion & Summary Archival (`set:completed`)
When the set terminates—either through manual athlete interaction (`END SET`), coach remote termination, or automatic velocity cutoff enforcement:
1. Aggregate metrics are calculated: mean set velocity, maximum rep velocity, total set velocity drop-off, average RPE, and mechanical volume load ($\text{weight} \times \text{completed reps}$).
2. The set summary is saved into `activeWorkout.sets` and committed to browser `localStorage` (`vbt_workouts_v1`).
3. The event `set:completed` is emitted across `ErosSyncBus`.

The Coach View receives `set:completed`, immediately moves the active set record into the **Completed Sets History Table**, and clears the active set live monitor in anticipation of the subsequent set.

#### Step 4: Downlink Coach Feedback & Auto-Accept HUD (`coach:cue`, `coach:load_override`)
During the athlete's scheduled rest interval, the athlete is receptive to technical and prescriptive guidance. The coach uses the low-friction console to dispatch:
- **Technical Cues**: High-cadence micro-coaching prompts (e.g., `"Squeeze lats before floor break"`, `"Drive hips through"`).
- **Prescriptive Load Overrides**: Weight adjustments (e.g., `-5.0 kg` or `+2.5 kg`) calculated to keep the athlete within their optimal velocity training zone for the next set.

When the coach triggers an adjustment, `coach:load_override` is transmitted over `ErosSyncBus`. The Athlete View instantly receives the payload, triggers an alert chime via the Web Audio engine, and renders an elevated floating glass modal with a 20-second circular countdown ring.

If the athlete taps **Accept** or allows the 20-second timer to elapse, the upcoming working weight automatically updates, emitting `coach:load_response` back to the coach cockpit to confirm execution.

---

## 3. Exact Data Schemas & JSON Contracts

Every event traveling across `ErosSyncBus` adheres to a strict, typed JSON contract. These schemas provide deterministic data validation across both Athlete and Coach view components.

### 3.1 Event `set:started`

Published when an athlete initiates a new working set.

#### TypeScript Interface
```typescript
interface SetStartedPayload {
  setId: string;              // Unique set UUID (e.g., "set_1730123420000_1")
  setNumber: number;          // Monotonic 1-based set counter within workout
  lift: 'Deadlift' | 'Squat' | 'Bench'; // Standardized movement denomination
  weight: number;             // Loaded barbell weight in kilograms (clamped 0.0 - 600.0)
  targetRpe?: number;         // Prescribed target RPE (e.g., 8.0)
  timestamp: number;          // Unix epoch timestamp in milliseconds
}
```

#### JSON Contract Example
```json
{
  "setId": "set_1730123420000_1",
  "setNumber": 4,
  "lift": "Deadlift",
  "weight": 210.0,
  "targetRpe": 8.0,
  "timestamp": 1730123420000
}
```

#### Field Dictionaries
| Field | Type | Description |
|---|---|---|
| `setId` | `string` | Deterministic unique identifier generated at set start. |
| `setNumber` | `number` | Chronological set index in the current workout session. |
| `lift` | `string` | Movement identifier. Must match canonical names: `Deadlift`, `Squat`, or `Bench`. |
| `weight` | `number` | Mass loaded on the barbell in kilograms, formatted to 1 decimal place. |
| `targetRpe` | `number` | Optional target Rating of Perceived Exertion ($6.0\text{--}10.0$). |
| `timestamp` | `number` | Millisecond Unix timestamp marking set commencement. |

---

### 3.2 Event `rep:recorded`

Published instantaneously upon concentric lockout of an individual repetition.

#### TypeScript Interface
```typescript
interface RepRecordedPayload {
  setId: string;              // Parent set identifier
  repNumber: number;          // 1-based repetition index within the set
  velocity: number;           // Mean Concentric Velocity (MCV) in meters per second
  peakVelocity: number;       // Peak Concentric Velocity (PV) in meters per second
  rom: number;                // Vertical Range of Motion displacement in centimeters
  rpe: number;                // Calculated or estimated repetition RPE
  lossPercent: number;        // Velocity loss % relative to fastest rep in this set
  concentricDurationMs?: number; // Duration of concentric ascent phase in milliseconds
  timestamp: number;          // Unix epoch timestamp in milliseconds
}
```

#### JSON Contract Example
```json
{
  "setId": "set_1730123420000_1",
  "repNumber": 4,
  "velocity": 0.38,
  "peakVelocity": 0.56,
  "rom": 58.4,
  "rpe": 8.5,
  "lossPercent": 18.2,
  "concentricDurationMs": 720,
  "timestamp": 1730123456789
}
```

#### Field Dictionaries
| Field | Type | Description |
|---|---|---|
| `setId` | `string` | Foreign key referencing the active set. |
| `repNumber` | `number` | Repetition sequence number ($1, 2, 3, \dots$). |
| `velocity` | `number` | Mean Concentric Velocity (MCV) in $\text{m/s}$ (precision: 2 decimals). |
| `peakVelocity` | `number` | Instantaneous maximum concentric velocity achieved during ascent. |
| `rom` | `number` | Vertical travel distance of the barbell in centimeters. |
| `rpe` | `number` | Repetition exertion level based on velocity-MVT baseline tables. |
| `lossPercent` | `number` | Percentage decline in velocity from the initial/fastest repetition. |
| `concentricDurationMs` | `number` | Concentric bar ascension time in milliseconds. |
| `timestamp` | `number` | Exact moment repetition was locked out. |

---

### 3.3 Event `set:completed`

Published when an active set concludes and aggregate statistics are finalized.

#### TypeScript Interface
```typescript
interface RepItem {
  repNumber: number;
  velocity: number;
  peakVelocity: number;
  rom: number;
  rpe: number;
  concentricDurationMs: number;
}

interface SetCompletedPayload {
  setId: string;              // Unique set identifier
  setNumber: number;          // Set index within workout
  lift: 'Deadlift' | 'Squat' | 'Bench'; // Movement type
  weight: number;             // Barbell weight in kilograms
  reps: RepItem[];            // Complete array of repetition records
  avgVelocity: number;        // Average concentric velocity across all reps (m/s)
  maxVelocity: number;        // Maximum single rep velocity recorded (m/s)
  velocityLoss: number;       // Total velocity drop-off percentage across the set
  avgRpe: number;             // Mean RPE for the completed set
  timestamp: number;          // Completion Unix timestamp in milliseconds
}
```

#### JSON Contract Example
```json
{
  "setId": "set_1730123420000_1",
  "setNumber": 4,
  "lift": "Deadlift",
  "weight": 210.0,
  "reps": [
    { "repNumber": 1, "velocity": 0.46, "peakVelocity": 0.62, "rom": 58.1, "rpe": 7.0, "concentricDurationMs": 610 },
    { "repNumber": 2, "velocity": 0.44, "peakVelocity": 0.59, "rom": 58.5, "rpe": 7.5, "concentricDurationMs": 640 },
    { "repNumber": 3, "velocity": 0.41, "peakVelocity": 0.57, "rom": 58.2, "rpe": 8.0, "concentricDurationMs": 680 },
    { "repNumber": 4, "velocity": 0.38, "peakVelocity": 0.56, "rom": 58.4, "rpe": 8.5, "concentricDurationMs": 720 }
  ],
  "avgVelocity": 0.42,
  "maxVelocity": 0.46,
  "velocityLoss": 17.39,
  "avgRpe": 7.8,
  "timestamp": 1730123462000
}
```

#### Field Dictionaries
| Field | Type | Description |
|---|---|---|
| `setId` | `string` | Unique identifier for completed set. |
| `setNumber` | `number` | Monotonic index of completed set. |
| `lift` | `string` | Name of movement performed. |
| `weight` | `number` | Barbell load utilized for the set in kilograms. |
| `reps` | `RepItem[]` | Ordered array of all repetitions logged in the set. |
| `avgVelocity` | `number` | Mathematical mean velocity across all completed reps ($\text{m/s}$). |
| `maxVelocity` | `number` | Peak repetition velocity achieved during the set ($\text{m/s}$). |
| `velocityLoss` | `number` | Aggregate percentage velocity degradation ($\%$). |
| `avgRpe` | `number` | Arithmetic mean of repetition RPE values. |
| `timestamp` | `number` | Set completion epoch timestamp. |

---

### 3.4 Event `coach:cue`

Published by the coach to transmit high-priority technical instructions to the athlete.

#### TypeScript Interface
```typescript
interface CoachCuePayload {
  id: string;                                   // Unique directive command UUID
  text: string;                                 // Short, actionable technical cue text
  type: 'technical' | 'motivational' | 'warning'; // Cue classification category
  coachName?: string;                           // Identity of transmitting coach
  timestamp: number;                            // Dispatch Unix timestamp in milliseconds
}
```

#### JSON Contract Example
```json
{
  "id": "cue_0192b3c4-98a1-71ef-81a2-837461928374",
  "text": "Squeeze lats before floor break. Push the floor away.",
  "type": "technical",
  "coachName": "Coach Marcus",
  "timestamp": 1730123475000
}
```

#### Field Dictionaries
| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for cue tracking. |
| `text` | `string` | Plain-text technical instruction displayed on athlete HUD. |
| `type` | `string` | Category: `technical` (movement cues), `motivational` (encouragement), or `warning` (posture alerts). |
| `coachName` | `string` | Optional name of the coach issuing instruction. |
| `timestamp` | `number` | Epoch timestamp of cue dispatch. |

---

### 3.5 Event `coach:load_override`

Published by the coach to adjust the barbell load for the athlete's upcoming working set.

#### TypeScript Interface
```typescript
interface CoachLoadOverridePayload {
  id: string;                 // Override transaction identifier
  deltaKg: number;            // Relative weight change in kg (e.g., -5.0 or +2.5)
  newWeight: number;          // Absolute recommended weight in kg (e.g., 205.0)
  autoAcceptSeconds: number;  // Countdown duration before automatic commitment (typically 20)
  reason?: string;            // Biomechanical rationale for adjustment
  timestamp: number;          // Dispatch Unix timestamp in milliseconds
}
```

#### JSON Contract Example
```json
{
  "id": "override_1730123480000",
  "deltaKg": -5.0,
  "newWeight": 205.0,
  "autoAcceptSeconds": 20,
  "reason": "Velocity loss reached 18.2% on rep 4 (exceeded 15% power ceiling)",
  "timestamp": 1730123480000
}
```

#### Field Dictionaries
| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique transaction ID for the load override. |
| `deltaKg` | `number` | Relative change in barbell load (negative for deload, positive for progression). |
| `newWeight` | `number` | The resulting absolute target barbell mass in kilograms. |
| `autoAcceptSeconds` | `number` | Duration of the visual countdown ring before auto-committing. |
| `reason` | `string` | Context explaining why the load was modified. |
| `timestamp` | `number` | Timestamp when coach issued the override. |

---

### 3.6 Event `coach:load_response`

Published by the athlete application confirming whether a coach load override was accepted or declined.

#### TypeScript Interface
```typescript
interface CoachLoadResponsePayload {
  id: string;                 // Referencing original override transaction ID
  accepted: boolean;          // True if accepted (or auto-committed), false if dismissed
  finalWeight: number;        // Final working weight set on the barbell in kg
  reason?: string;            // Optional athlete note if dismissed
  timestamp: number;          // Response Unix timestamp in milliseconds
}
```

#### JSON Contract Example
```json
{
  "id": "override_1730123480000",
  "accepted": true,
  "finalWeight": 205.0,
  "reason": "Auto-accepted via 20s rest interval timer",
  "timestamp": 1730123500000
}
```

#### Field Dictionaries
| Field | Type | Description |
|---|---|---|
| `id` | `string` | Identifier matching original `coach:load_override` command. |
| `accepted` | `boolean` | Binary outcome: `true` confirms weight adoption, `false` indicates dismissal. |
| `finalWeight` | `number` | The active barbell mass retained for the next set. |
| `reason` | `string` | Explanatory note (e.g., manual tap vs auto-accept timer). |
| `timestamp` | `number` | Millisecond timestamp when resolution completed. |

---

## 4. Reactive Event Lifecycle: `ErosSyncBus` and `BroadcastChannel`

The communication spine of the Eros platform is built on a two-tier event distribution pattern designed for sub-millisecond local execution and multi-window flexibility.

### 4.1 In-Memory Pub/Sub Engine (`ErosSyncBus`)

The `ErosSyncBus` module implements a lightweight, deterministic publish/subscribe architecture instantiated on the global browser context (`window.ErosSyncBus`).

#### Architectural Guarantees
1. **Synchronous Local Delivery**: In-memory listeners are executed synchronously upon `emit()`, guaranteeing zero frame drop ($<1\text{ ms}$) between athlete inputs and coach DOM updates.
2. **Listener Isolation & Error Containment**: Each subscriber callback is wrapped in an isolated `try...catch` block. A rendering error in an individual UI listener never halts the execution of sibling listeners or aborts the telemetry capture pipeline.
3. **Idempotent Subscription Management**: Calling `on(event, handler)` returns an unsubscribe function reference, ensuring memory leaks are prevented when views unmount.

#### Implementation Specification
```javascript
/**
 * ErosSyncBus — Deterministic Single-Page In-Memory & Cross-Tab Event Engine
 */
const ErosSyncBus = (() => {
  const listeners = new Map();
  const CHANNEL_NAME = 'eros_coach_sync_v1';
  
  // Safe initialization of browser-native BroadcastChannel
  const broadcastChannel = (typeof window !== 'undefined' && 'BroadcastChannel' in window)
    ? new BroadcastChannel(CHANNEL_NAME)
    : null;

  function on(event, callback) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
    return () => off(event, callback);
  }

  function off(event, callback) {
    if (listeners.has(event)) {
      listeners.get(event).delete(callback);
    }
  }

  function emit(event, payload, broadcast = true) {
    // 1. Synchronously execute in-memory local subscribers
    if (listeners.has(event)) {
      listeners.get(event).forEach(cb => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`[ErosSyncBus] Error in handler for event "${event}":`, err);
        }
      });
    }

    // 2. Dispatch cross-tab via BroadcastChannel if requested
    if (broadcast && broadcastChannel) {
      try {
        broadcastChannel.postMessage({ event, payload });
      } catch (err) {
        console.warn(`[ErosSyncBus] BroadcastChannel dispatch failed for "${event}":`, err);
      }
    }
  }

  // Listen for messages arriving from other browser tabs or windows
  if (broadcastChannel) {
    broadcastChannel.onmessage = (msgEvent) => {
      const { event, payload } = msgEvent.data || {};
      if (event && payload) {
        // Dispatch locally with broadcast = false to prevent circular echo loops
        emit(event, payload, false);
      }
    };
  }

  return { on, off, emit };
})();

if (typeof window !== 'undefined') {
  window.ErosSyncBus = ErosSyncBus;
}
```

### 4.2 Cross-Tab & Multi-Screen Synchronization (`BroadcastChannel`)

In many strength facilities, coaches position a dedicated iPad or external monitor on a coaching cart while athletes use a smartphone mounted on the squat rack.

#### Loopback Prevention Protocol
When an event originates in the Athlete tab, `ErosSyncBus.emit('rep:recorded', payload, true)` executes all local handlers and dispatches the payload across `BroadcastChannel('eros_coach_sync_v1')`.

When the Coach tab receives the message via `broadcastChannel.onmessage`, it calls `emit(event, payload, false)`. Passing `broadcast = false` guarantees that:
- Local coach handlers immediately update the dark cockpit DOM.
- The message is **not** re-broadcast back onto the channel, completely eliminating infinite ping-pong echo storms.

#### Storage Persistence & Hydration
In addition to transient event dispatch, persistent workout structures are synchronized into browser `localStorage`:
- `vbt_workouts_v1`: Complete historical workout logs, completed sets, and volume totals.
- `vbt_active_workout_v1`: Active in-flight workout context, enabling recovery if a mobile browser refreshes mid-session.
- `vbt_last_lift_weights_v1`: Memorized default working weights per lift denomination (`Deadlift`, `Squat`, `Bench`).

When the Coach portal mounts or switches view modes, it reads from the active workout memory reference and reconciles any missed sets immediately.

---

## 5. Interactive Step-by-Step User Guide: From Athlete Lift to Coach Intervention

This interactive guide walks coaches and athletes through every stage of session execution, from initial mode discovery to live monitoring and prescriptive feedback.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               USER INTERACTION JOURNEY MAP                                       │
│                                                                                                  │
│   [ STEP 1 ] Discover & Toggle Views via the Header Switcher                                     │
│   [ STEP 2 ] Prepare Movement & Set Working Weight in Athlete View                               │
│   [ STEP 3 ] Lift the Barbell & Experience Live Velocity Feedback and Bloom FX                   │
│   [ STEP 4 ] Monitor Athlete Kinematics & Velocity Loss in Coach Portal                          │
│   [ STEP 5 ] Transmit Prescriptive Directives & Load Adjustments                                 │
│   [ STEP 6 ] Athlete Resolves Rest HUD via 20-Second Auto-Accept Ring                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Step 1: Navigating Between Athlete and Coach Views

The mode switcher allows seamless transitions between athlete execution and coaching management.

1. **Locate the View Switcher**: In the application header (`.glass-header`), locate the segmented control (`#view-mode-toggle`) positioned between the **Eros** wordmark and the connection status badge.
2. **Switch to Coach View**: Tap the **COACH** button (`#btn-mode-coach`).
   - The interface transitions instantaneously ($<16\text{ ms}$) into the ChatGPT-inspired dark cockpit.
   - The body receives class `portal-coach`, smoothly concealing the athlete tab navigation and revealing `#view-coach`.
   - Your active workout timer, barbell telemetry connection, and recorded sets remain 100% active and unpaused.
3. **Switch Back to Athlete View**: Tap the **ATHLETE** button (`#btn-mode-athlete`) at any time to return to the Spatial Glass interface.

---

### Step 2: Preparing and Commencing a Set in Athlete Mode

1. In **Athlete View**, navigate to the **Live Tracker** tab (`#tab-live`).
2. Select your movement from the lift dropdown:
   - **Deadlift** (accented in bold Punchy Red `#ff3b30`)
   - **Squat** (accented in Electric Emerald `#00ff66`)
   - **Bench Press** (accented in Laser Cyan `#00e5ff`)
3. Adjust your working weight using the stepper capsule (`#live-weight-control`):
   - Tap `−` or `+` to step by $2.5\text{ kg}$, or click the numeric input to type an exact load (e.g., $210.0\text{ kg}$).
4. Tap **START WORKOUT** in the top ribbon (if not already running), then tap **START SET** (`#btn-live-set-master`).
   - The set master button illuminates, transitioning to a glowing **END SET** state.
   - The `set:started` event dispatches across `ErosSyncBus`.

---

### Step 3: Executing Repetitions & Experiencing Live Feedback

1. **Unrack and Lift**: Perform your repetitions normally.
2. **Instant Velocity Metric Feedback**: As you complete concentric lockout for each rep:
   - The large velocity readout displays your Mean Concentric Velocity (MCV) in $\text{m/s}$.
   - The metric dynamically shifts color according to Bryan Mann's velocity continuum:
     - **Laser Cyan** ($>1.00\text{ m/s}$): Explosive Speed
     - **Electric Emerald** ($0.75\text{--}1.00\text{ m/s}$): Speed-Strength
     - **Specular Gold** ($0.50\text{--}0.75\text{ m/s}$): Strength-Speed
     - **Caution Orange** ($0.30\text{--}0.50\text{ m/s}$): Accelerative Strength
     - **Punchy Red** ($<0.30\text{ m/s}$): Absolute Maximum Strength / Grind
3. **Celebratory Set Completion Bloom FX**:
   - Tap **END SET** when you rack the barbell.
   - The interface triggers a celebratory Glass Bloom visual effect (`@keyframes glassSetBloom`), pulsing an ambient light glow through the container.
   - A triumphant Web Audio harmonic chord chimes, and a set summary pill confirms your average velocity, peak velocity, and total velocity loss.

---

### Step 4: Real-Time Floor Monitoring in Coach Mode

When supervising one or multiple athletes, the Coach Portal provides a consolidated cockpit:

1. Tap **COACH** in the header toggle to open `#view-coach`.
2. **Surface Hierarchy & Readability**:
   - The dark obsidian surface hierarchy (`#0d0d0d` base canvas, `#171717` panels, `#212121` bento cards, `#2f2f2f` borders) ensures comfortable visibility even under harsh gym lighting.
   - High-contrast typography (`#ececec` headings, `#b4b4b4` labels) enables quick glanceability from several meters away.
3. **Active Set Live Monitor**:
   - Observe **Mean Velocity**, **Peak Velocity**, and **Range of Motion** updating in real time with each lockout.
   - Watch the **Velocity Loss Radial Gauge**: As fatigue accumulates across repetitions, the gauge fills toward the prescribed ceiling (e.g., $20\%$).
   - If velocity loss breaches the ceiling, the card flashes an immediate alert: `⚠️ FATIGUE CUTOFF REACHED`, signaling that the athlete has hit their biological stimulus target and should rack the bar.
4. **Completed Sets History Table**:
   - Review all previous sets completed during the workout session.
   - Inspect load, total reps, average velocity, velocity drop-off percentage, and estimated RPE at a glance.

---

### Step 5: Sending Coach Feedback, Cues, and Load Overrides

The coach can intervene during rest periods without having to walk across the gym floor or shout over ambient gym noise:

1. **One-Tap Load Adjustment Pills**:
   - In the Coach Feedback Console (`#coach-feedback-console`), locate the load adjustment pills:
     - `[-5.0 kg]` | `[-2.5 kg]` | `[Keep Load]` | `[+2.5 kg]` | `[+5.0 kg]`
   - Tap `[-5.0 kg]` if velocity loss was excessive, or `[+2.5 kg]` if the athlete moved the barbell with reserve speed.
2. **Quick Technical Cue Chips**:
   - Tap any pre-configured technical chip:
     - `["Drive hips!"]`
     - `["Squeeze lats before pull"]`
     - `["Stay tight in the hole"]`
     - `["Rack bar — cutoff reached"]`
     - `["Take 3m rest"]`
3. **Custom Technical Directives**:
   - Type a personalized cue into the custom input field (`#coach-custom-cue-input`) and tap **SEND CUE**.
   - The command is packaged as `coach:cue` or `coach:load_override` and transmitted across `ErosSyncBus` immediately.

---

### Step 6: Athlete Reception HUD & 20-Second Auto-Accept Resolution

1. **Incoming Alert**: During rest, the athlete's screen receives the coach command. An ascending two-tone audio alert chimes and the device triggers a confirmation vibration.
2. **Spatial Glass Overlay**: A floating directive modal slides down into the rest period viewport, displaying:
   ```
   COACH DIRECTIVE: Coach Marcus
   LOAD ADJUSTMENT: 210.0 kg → 205.0 kg (-5.0 kg)
   "Squeeze lats before floor break. Push the floor away."
   ```
3. **Resolution Options**:
   - **Immediate Acceptance**: The athlete taps **ACCEPT (-5.0 kg)**. The working weight updates to $205.0\text{ kg}$ on all inputs immediately.
   - **Dismissal**: The athlete taps **DISMISS** to keep the existing load.
   - **Hands-Free Auto-Accept Ring**: An animated circular SVG countdown ring drains steadily over 20 seconds. If the athlete does not interact (e.g., while chalking their hands or focusing on breathing), the coach's recommendation is **automatically committed**, preventing training interruptions.

---

## 6. Explicit Notification & User Approval Protocol for Backend Infrastructure

### 6.1 Architectural Boundary Notice

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          ARCHITECTURAL BOUNDARY & CONSENT NOTICE                                 │
│                                                                                                  │
│   CURRENT STATUS: LOCAL-ONLY IN-MEMORY EXECUTION                                                 │
│   • Set logging, velocity calculation, and coach-athlete synchronization currently operate       │
│     strictly on the client-side frontend via ErosSyncBus and browser BroadcastChannel.           │
│   • No remote servers, external APIs, cloud databases, or telemetry relays are running.          │
│   • All workout telemetry is stored strictly in local browser memory and localStorage.          │
│                                                                                                  │
│   MANDATORY USER CONSENT MANDATE:                                                                │
│   Prior to undertaking ANY backend server infrastructure implementation, remote database         │
│   provisioning, cloud WebSocket server deployment, or external API modifications, EXPLICIT       │
│   USER APPROVAL AND CONFIRMATION IS STRICTLY REQUIRED.                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The Eros Velocity-Based Training application currently delivers all set synchronization, coach monitoring, and athlete feedback exclusively through **in-memory event handling and browser-native local channels**.

### 6.2 Advance Notification: Proposed Distributed Backend Architecture (RFC)

When the user chooses to expand Eros beyond local single-origin environments into a multi-tenant, distributed cloud ecosystem (enabling remote coaching across different geographic networks or cellular connections), the following architecture is proposed for user review:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            PROPOSED FUTURE DISTRIBUTED BACKEND (RFC)                             │
│                                                                                                  │
│   [ Athlete Mobile PWA ]                                            [ Coach Spatial Cockpit ]    │
│            │                                                                    │                │
│            │ WSS (TLS 1.3)                                                      │ WSS (TLS 1.3)  │
│            ▼                                                                    ▼                │
│   ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                                Distributed WebSocket Gateway                             │   │
│   │                        (FastAPI / Node.js Cluster with Edge Termination)                 │   │
│   │                                                                                          │   │
│   │   • JWT Bearer Authentication & Token Refresh                                            │   │
│   │   • Asymmetric Athlete-Coach Encryption Handshake (E2EE)                                 │   │
│   │   • High-Performance Redis 7 Pub/Sub Session Routing                                     │   │
│   └─────────────────────────────┬────────────────────────────────────────┬───────────────────┘   │
│                                 │                                        │                       │
│                                 ▼                                        ▼                       │
│   ┌───────────────────────────────────────────┐    ┌─────────────────────────────────────────┐   │
│   │            Redis Pub/Sub Layer            │    │        TimescaleDB / PostgreSQL         │   │
│   │                                           │    │                                         │   │
│   │ • channel:athlete:{id}:telemetry          │    │ • Append-only Repetition Kinematics     │   │
│   │ • channel:athlete:{id}:downlink           │    │ • Longitudinal e1RM Regression Curves   │   │
│   │ • channel:coach:{org}:live_roster         │    │ • GDPR Article 17 Crypto-Shredding Log  │   │
│   └───────────────────────────────────────────┘    └─────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Proposed Backend Components for User Confirmation
1. **Edge WebSocket Gateway**: Secure full-duplex communication over port 443 with sub-$80\text{ ms}$ round-trip latency.
2. **Redis Pub/Sub Routing Broker**: Partitioned channels for session telemetry, coach downlinks, and organizational squad rosters.
3. **Time-Series Telemetry Store**: TimescaleDB / PostgreSQL database storing rep kinematics, acceleration curves, and longitudinal load-velocity profiles.
4. **End-to-End Cryptographic Security**: Cryptographic athlete consent handshakes, zero-knowledge privacy, and role-based access control (RBAC).

**Action Requirement**: None of these backend components will be provisioned, configured, or coded until the user explicitly reviews and authorizes backend development.

---

## 7. Eros Technical Lexicon & Terminology Governance (Requirement R4)

Requirement R4 mandates that the Eros web application, markup, user interface, and technical documentation strictly use "Eros" exclusively, abstracting away any low-level communication protocols, embedded processor identifiers, or component-level engineering jargon.

### 7.1 Authorized Eros Lexicon Standard

The following standardized terminology is used across the entire ecosystem:

| Domain | Authorized Eros Terminology | Architectural Context |
|---|---|---|
| Communication Layer | **Eros Connection** / **Eros Wireless** | User-facing connection sheet and status badges |
| Kinematic Capture | **High-Precision Kinematic Stream** | Repetition telemetry frequency and curve tracking |
| Physical Platform | **Eros Barbell Unit** / **Eros Collar** | Precision collar unit attached to the barbell |
| Attitude & Dynamics | **Eros Attitude Tracking** / **Kinematics Engine** | 6-axis attitude estimation and orientation filtering |
| Telemetry Source | **Eros Unit** / **Kinematic Telemetry** | Barbell motion capture and data acquisition |
| System Architecture | **Eros Platform** / **Eros Device** | General system references and device ecosystem |
| Mobile Runtime | **Eros Wireless Browser** | Specialized iOS web browser context |

### 7.2 Strict Lexicon Enforcement

To ensure complete clarity and seamless user experience, the system enforces a strict zero-tolerance policy against low-level engineering jargon. Across all code, templates, and documentation, the platform is referred to simply and exclusively as **Eros**.

---

## 8. Summary & Verification Checklist

To independently verify the Athlete-Coach Connection Architecture in your local Eros installation, follow this verification checklist:

- [x] **Header Mode Switcher**: Verify `#view-mode-toggle` toggles between Athlete and Coach views without page reload.
- [x] **State Integrity**: Confirm workout timer, active set, and selected lift remain uninterrupted when toggling modes.
- [x] **Event Bus Instantiation**: Confirm `window.ErosSyncBus` is defined and exposes `.on()`, `.off()`, and `.emit()`.
- [x] **Live Ingestion**: Start a set in Athlete view, switch to Coach view, and verify that repetition recordings update the active monitor.
- [x] **Velocity Loss Warning**: Confirm the Coach gauge turns crimson with a cutoff warning when velocity loss exceeds $20\%$.
- [x] **Downlink Override**: Confirm load overrides (`[-5.0 kg]`) trigger the rest HUD modal and 20-second countdown in Athlete view.
- [x] **Terminology Purity**: Verify zero occurrences of low-level component or protocol tokens across all documentation and UI markup, using Eros exclusively.
- [x] **Consent Gate**: Confirm that all synchronization operates strictly on the frontend and awaits explicit user authorization before backend modifications.
