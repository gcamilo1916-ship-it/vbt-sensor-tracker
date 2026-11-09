/**
 * EROS SYNTHETIC TELEMETRY TEST HARNESS & HEADLESS VERIFICATION ENGINE
 * File: tests/synthetic_telemetry_harness.js
 * 
 * Provides:
 * - Deterministic biomechanical trajectory generator (Squat, Bench, Deadlift)
 * - Multi-rep set simulation with fatigue & velocity-loss progression
 * - Headless Canvas 2D Mock Context with operation logging & style inspection
 * - Headless Web Audio API Mock with oscillator/gain scheduling & frequency inspection
 * - Lightweight headless DOM environment with event dispatching & query selector
 * - Authoritative mathematical oracles for difficulty, color interpolation, pop scale
 * - Reference implementations for animation variants A-D, audio pop chime, and switcher
 * - Static guardrail scanners (zero forbidden terms, zero button emojis, visionOS tokens)
 * 
 * Compliance: Strictly device-abstracted; zero prohibited terms.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ─────────────────────────────────────────────────────────────────────────────
// 1. CANONICAL CONSTANTS & DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const LIFT_COLORS = {
  Deadlift: { hex: '#FF3B30', rgb: [255, 59, 48], textTint: '#FF857D' },
  Squat:    { hex: '#00FF66', rgb: [0, 255, 102], textTint: '#66FFA3' },
  Bench:    { hex: '#00E5FF', rgb: [0, 229, 255], textTint: '#70F0FF' }
};

const LIFT_BASELINES = {
  Squat:    { mvt: 0.30, peakMult: 1.35, defVel: 0.70 },
  Bench:    { mvt: 0.18, peakMult: 1.40, defVel: 0.60 },
  Deadlift: { mvt: 0.15, peakMult: 1.30, defVel: 0.50 }
};

const STAGE_BOUNDS = {
  width: 220,
  height: 210,
  centerX: 110,
  scaleX: 18, // px per cm
  topY: 25,
  botY: 185,
  strokeHeight: 160,
  minX: 8,
  maxX: 212
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. MATHEMATICAL SPECIFICATION ORACLES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes repetition difficulty factor D in [0.0, 1.0]
 */
function computeDifficulty(velocity, rpe, lift = 'Deadlift') {
  const numRpe = Math.max(6.0, Math.min(10.0, Number(rpe) || 7.5));
  const base = LIFT_BASELINES[lift] || LIFT_BASELINES.Deadlift;
  const numVel = Math.max(0.05, Number(velocity) || base.defVel);
  const vPeak = base.defVel * base.peakMult;
  const vMvt = base.mvt;

  const rpeFactor = (numRpe - 6.0) / 4.0;
  const velFactor = Math.max(0.0, Math.min(1.0, (vPeak - numVel) / Math.max(0.01, vPeak - vMvt)));
  const diff = 0.65 * rpeFactor + 0.35 * velFactor;
  return Math.max(0.0, Math.min(1.0, diff));
}

/**
 * Linearly interpolates from pure specular white to canonical lift color.
 * Accepts either (lift, difficulty) or (difficulty, lift).
 */
function computeColorInterpolation(arg1, arg2) {
  let lift, difficulty;
  if (typeof arg1 === 'number' || (!isNaN(parseFloat(arg1)) && isFinite(arg1))) {
    difficulty = arg1;
    lift = arg2;
  } else {
    lift = arg1;
    difficulty = arg2;
  }
  const d = Math.max(0.0, Math.min(1.0, Number(difficulty) || 0.0));
  const liftCfg = LIFT_COLORS[lift] || LIFT_COLORS.Deadlift;
  const rTarget = liftCfg.rgb[0];
  const gTarget = liftCfg.rgb[1];
  const bTarget = liftCfg.rgb[2];

  const r = Math.round(255 + d * (rTarget - 255));
  const g = Math.round(255 + d * (gTarget - 255));
  const b = Math.round(255 + d * (bTarget - 255));

  const hexR = r.toString(16).padStart(2, '0');
  const hexG = g.toString(16).padStart(2, '0');
  const hexB = b.toString(16).padStart(2, '0');

  return {
    r,
    g,
    b,
    rgb: [r, g, b],
    hex: `#${hexR}${hexG}${hexB}`.toUpperCase(),
    rgbString: `rgb(${r}, ${g}, ${b})`,
    rgbaGlowString: (alpha = 0.45) => `rgba(${r}, ${g}, ${b}, ${alpha})`
  };
}

/**
 * Computes visual pop transform scale S_pop in [1.0, 2.5]
 */
function computePopScale(rpe) {
  const numRpe = Math.max(6.0, Math.min(10.0, Number(rpe) || 7.5));
  const rpeDiff = (numRpe - 6.0) / 4.0;
  return 1.0 + 1.5 * rpeDiff;
}

/**
 * Computes corridor bounds and plumb line mapping
 */
function computePlumbLineX(deviationCm) {
  const dev = Number(deviationCm) || 0.0;
  const rawX = STAGE_BOUNDS.centerX + dev * STAGE_BOUNDS.scaleX;
  const clampedX = Math.max(STAGE_BOUNDS.minX, Math.min(STAGE_BOUNDS.maxX, rawX));
  const corridor = Math.abs(dev) <= 2.0 ? 'optimal' : (Math.abs(dev) <= 4.0 ? 'warning' : 'alert');
  return {
    rawX,
    clampedX,
    corridor,
    deviationCm: dev,
    plumbLineX: STAGE_BOUNDS.centerX
  };
}

/**
 * Acoustic parameter derivation for Web Audio pop chime
 */
function computeAcousticParams(velocity, rpe, lift = 'Deadlift') {
  const numRpe = Math.max(6.0, Math.min(10.0, Number(rpe) || 7.5));
  const diff = (numRpe - 6.0) / 4.0;
  const numVel = Math.max(0.1, Number(velocity) || 0.5);

  const popStartFreq = 280 - diff * 80;
  const popEndFreq = 80;
  const popDuration = 0.035;
  const popGain = 0.35 + diff * 0.25;

  const baseFreq = 587.33; // D5
  const highFreq = Math.min(1350, baseFreq * (1 + numVel * 0.45));
  const chimeDuration = 0.22 + diff * 0.25;

  const hasSubBass = numRpe >= 8.5;
  const subBassFreq = 55;
  const subBassGain = hasSubBass ? 0.30 * diff : 0.0;

  return {
    popStartFreq,
    popEndFreq,
    popDuration,
    popGain,
    baseFreq,
    highFreq,
    chimeDuration,
    hasSubBass,
    subBassFreq,
    subBassGain
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DETERMINISTIC KINEMATIC TRAJECTORY GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates an authentic 40-point kinematic curve for a single repetition.
 * Accepts either an options object or positional arguments: (lift, velocity, rpe, deviationCm, numPoints).
 */
function synthesizeStrokeCurve(config = {}, argVel, argRpe, argDev, argPoints) {
  let lift, velocity, rpe, targetDevCm, numPoints;
  if (typeof config === 'string') {
    lift = config;
    velocity = argVel;
    rpe = argRpe;
    targetDevCm = argDev;
    numPoints = argPoints;
  } else {
    lift = config.lift;
    velocity = config.velocity;
    rpe = config.rpe;
    targetDevCm = config.deviationCm;
    numPoints = config.numPoints;
  }
  lift = lift || 'Deadlift';
  velocity = Number(velocity) || (LIFT_BASELINES[lift] ? LIFT_BASELINES[lift].defVel : 0.5);
  rpe = Math.max(6.0, Math.min(10.0, Number(rpe) || 7.5));
  targetDevCm = targetDevCm !== undefined ? Number(targetDevCm) : 1.2;
  numPoints = Math.max(10, Number(numPoints) || 40);

  const durationMs = Math.round(Math.max(800, Math.min(3500, ((0.5 / Math.max(velocity, 0.1)) * 2) * 1000)));
  const base = LIFT_BASELINES[lift] || LIFT_BASELINES.Deadlift;
  const vPeak = Math.max(velocity * 1.35, velocity + 0.15);
  const vStick = Math.max(0.12, velocity * (1.0 - 0.45 * (rpe / 10.0)));

  const points = [];
  let maxDev = 0;
  let sumDev = 0;

  for (let i = 0; i < numPoints; i++) {
    const p = i / (numPoints - 1); // 0.0 to 1.0

    // Biomechanical horizontal displacement formulas
    let dxRaw = 0;
    if (lift === 'Squat') {
      dxRaw = 0.8 * Math.pow(1 - p, 2) + 1.8 * Math.sin(Math.PI * p) * (1 - 0.4 * p);
    } else if (lift === 'Bench') {
      dxRaw = 1.6 * Math.pow(1 - p, 2) - 3.2 * Math.sin(Math.PI * Math.pow(p, 0.75)) * (1 - 0.2 * p);
    } else { // Deadlift
      dxRaw = -0.9 * Math.sin(Math.PI * (1 - p)) + 2.0 * Math.sin(2 * Math.PI * p) * p;
    }

    const scaleFactor = targetDevCm !== 0 ? (targetDevCm / 1.5) : 0;
    const dx = Number((dxRaw * scaleFactor).toFixed(2));
    if (Math.abs(dx) > Math.abs(maxDev)) maxDev = dx;
    sumDev += Math.abs(dx);

    // Vertical displacement
    let normY = 0;
    if (lift === 'Deadlift') {
      normY = p; // Floor (0) to Lockout (1)
    } else {
      normY = 1.0 - p; // Lockout (1) down to Hole/Chest (0) and back
    }
    const yPixel = STAGE_BOUNDS.botY - normY * STAGE_BOUNDS.strokeHeight;
    const xPixel = Math.max(STAGE_BOUNDS.minX, Math.min(STAGE_BOUNDS.maxX, STAGE_BOUNDS.centerX + dx * STAGE_BOUNDS.scaleX));

    // Sticking point velocity depression near mid-ascent (p = 0.40 - 0.65)
    let instVel = velocity;
    if (p < 0.25) {
      instVel = velocity + (vPeak - velocity) * (p / 0.25);
    } else if (p >= 0.25 && p <= 0.65) {
      const stickRatio = Math.sin(Math.PI * ((p - 0.25) / 0.40));
      instVel = vPeak - (vPeak - vStick) * stickRatio;
    } else {
      instVel = vStick + (velocity - vStick) * ((p - 0.65) / 0.35);
    }
    instVel = Math.max(0.10, instVel);

    // Difficulty and interpolated color at this exact point
    const diff = computeDifficulty(instVel, rpe, lift);
    const color = computeColorInterpolation(lift, diff);

    points.push({
      index: i,
      progress: Number(p.toFixed(3)),
      yNorm: Number(normY.toFixed(3)),
      yPixel: Number(yPixel.toFixed(1)),
      xPixel: Number(xPixel.toFixed(1)),
      dxCm: dx,
      velocity: Number(instVel.toFixed(2)),
      difficulty: Number(diff.toFixed(3)),
      colorHex: color.hex,
      colorRgb: color.rgbString
    });
  }

  const avgDev = Number((sumDev / numPoints).toFixed(2));
  const pathEfficiencyPct = Math.max(50, Math.min(100, Math.round(100 - (avgDev / 5.0) * 45)));
  const popScale = computePopScale(rpe);

  return {
    lift,
    meanVelocity: velocity,
    rpe,
    deviationCm: Number(maxDev.toFixed(2)),
    avgDeviationCm: avgDev,
    pathEfficiencyPct,
    popScale: Number(popScale.toFixed(2)),
    durationMs,
    points
  };
}

/**
 * Generates an authentic multi-rep set progression with cumulative fatigue
 */
function generateSetTelemetry(config = {}) {
  const lift = config.lift || 'Squat';
  const targetRpe = Math.max(6.5, Math.min(10.0, Number(config.targetRpe) || 9.0));
  const repsCount = Math.max(1, Math.min(12, Number(config.repsCount) || 5));
  const startVelocity = Number(config.startVelocity) || (LIFT_BASELINES[lift] ? LIFT_BASELINES[lift].defVel : 0.70);
  const velocityLossPct = Math.min(60, Number(config.velocityLossPct) || 35);
  const startDevCm = Number(config.startDevCm) || 0.8;
  const endDevCm = Number(config.endDevCm) || 3.4;

  const reps = [];
  const endVelocity = startVelocity * (1.0 - velocityLossPct / 100.0);

  for (let r = 1; r <= repsCount; r++) {
    const fraction = repsCount > 1 ? (r - 1) / (repsCount - 1) : 1.0;
    const repVel = Number((startVelocity - fraction * (startVelocity - endVelocity)).toFixed(2));
    const repRpe = Number((6.0 + fraction * (targetRpe - 6.0)).toFixed(1));
    const repDev = Number((startDevCm + fraction * (endDevCm - startDevCm)).toFixed(1));

    const repCurve = synthesizeStrokeCurve({
      lift,
      velocity: repVel,
      rpe: repRpe,
      deviationCm: repDev
    });

    reps.push({
      repNumber: r,
      velocity: repVel,
      rpe: repRpe,
      deviationCm: repDev,
      curve: repCurve
    });
  }

  const actualVelLoss = Number((((startVelocity - reps[reps.length - 1].velocity) / startVelocity) * 100).toFixed(1));

  return {
    lift,
    targetRpe,
    totalReps: repsCount,
    startVelocity,
    endVelocity: reps[reps.length - 1].velocity,
    velocityLossPct: actualVelLoss,
    reps
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. HEADLESS CANVAS 2D MOCK CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

function createMockCanvasContext() {
  const operations = [];
  const gradients = [];

  class MockGradient {
    constructor(type, coords) {
      this.type = type;
      this.coords = coords;
      this.stops = [];
    }
    addColorStop(offset, color) {
      this.stops.push({ offset, color });
      operations.push({ op: 'addColorStop', offset, color, gradient: this });
    }
  }

  const ctx = {
    operations,
    gradients,
    width: 220,
    height: 210,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineDash: [],
    shadowBlur: 0,
    shadowColor: 'transparent',
    globalAlpha: 1.0,
    font: '10px sans-serif',
    textAlign: 'start',

    clearRect(x, y, w, h) {
      operations.push({ op: 'clearRect', args: [x, y, w, h] });
    },
    fillRect(x, y, w, h) {
      operations.push({ op: 'fillRect', args: [x, y, w, h], fillStyle: this.fillStyle });
    },
    strokeRect(x, y, w, h) {
      operations.push({ op: 'strokeRect', args: [x, y, w, h], strokeStyle: this.strokeStyle });
    },
    beginPath() {
      operations.push({ op: 'beginPath' });
    },
    closePath() {
      operations.push({ op: 'closePath' });
    },
    moveTo(x, y) {
      operations.push({ op: 'moveTo', args: [x, y] });
    },
    lineTo(x, y) {
      operations.push({ op: 'lineTo', args: [x, y] });
    },
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      operations.push({ op: 'bezierCurveTo', args: [cp1x, cp1y, cp2x, cp2y, x, y] });
    },
    quadraticCurveTo(cpx, cpy, x, y) {
      operations.push({ op: 'quadraticCurveTo', args: [cpx, cpy, x, y] });
    },
    arc(x, y, r, sa, ea, acw = false) {
      operations.push({ op: 'arc', args: [x, y, r, sa, ea, acw], fillStyle: this.fillStyle, strokeStyle: this.strokeStyle });
    },
    ellipse(x, y, rx, ry, rot, sa, ea, acw = false) {
      operations.push({ op: 'ellipse', args: [x, y, rx, ry, rot, sa, ea, acw], fillStyle: this.fillStyle, strokeStyle: this.strokeStyle });
    },
    stroke() {
      operations.push({
        op: 'stroke',
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        lineDash: Array.from(this.lineDash),
        shadowBlur: this.shadowBlur,
        shadowColor: this.shadowColor
      });
    },
    fill() {
      operations.push({
        op: 'fill',
        fillStyle: this.fillStyle,
        shadowBlur: this.shadowBlur,
        shadowColor: this.shadowColor,
        globalAlpha: this.globalAlpha
      });
    },
    save() {
      operations.push({ op: 'save' });
    },
    restore() {
      operations.push({ op: 'restore' });
    },
    setLineDash(d) {
      this.lineDash = Array.isArray(d) ? Array.from(d) : [];
      operations.push({ op: 'setLineDash', args: [this.lineDash] });
    },
    getLineDash() {
      return Array.from(this.lineDash);
    },
    fillText(text, x, y) {
      operations.push({ op: 'fillText', args: [text, x, y], fillStyle: this.fillStyle, font: this.font });
    },
    createLinearGradient(x0, y0, x1, y1) {
      const grad = new MockGradient('linear', [x0, y0, x1, y1]);
      gradients.push(grad);
      operations.push({ op: 'createLinearGradient', args: [x0, y0, x1, y1] });
      return grad;
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      const grad = new MockGradient('radial', [x0, y0, r0, x1, y1, r1]);
      gradients.push(grad);
      operations.push({ op: 'createRadialGradient', args: [x0, y0, r0, x1, y1, r1] });
      return grad;
    },

    // Inspection helper methods
    findOperations(opName) {
      return operations.filter(o => o.op === opName);
    },
    getArcs() {
      return operations.filter(o => o.op === 'arc');
    },
    getFills() {
      return operations.filter(o => o.op === 'fill' || o.op === 'fillRect');
    },
    getStrokes() {
      return operations.filter(o => o.op === 'stroke');
    },
    clearOperations() {
      operations.length = 0;
      gradients.length = 0;
    }
  };

  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. HEADLESS WEB AUDIO API MOCK CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

function createMockAudioContext() {
  const oscillators = [];
  const gains = [];
  const timeline = [];

  class MockAudioParam {
    constructor(name, defaultValue = 0) {
      this.name = name;
      this.value = defaultValue;
      this.events = [];
    }
    setValueAtTime(val, t) {
      this.value = val;
      this.events.push({ type: 'setValueAtTime', value: val, time: t });
      timeline.push({ target: this.name, type: 'setValueAtTime', value: val, time: t });
    }
    exponentialRampToValueAtTime(val, t) {
      this.value = val;
      this.events.push({ type: 'exponentialRampToValueAtTime', value: val, time: t });
      timeline.push({ target: this.name, type: 'exponentialRampToValueAtTime', value: val, time: t });
    }
    linearRampToValueAtTime(val, t) {
      this.value = val;
      this.events.push({ type: 'linearRampToValueAtTime', value: val, time: t });
      timeline.push({ target: this.name, type: 'linearRampToValueAtTime', value: val, time: t });
    }
  }

  class MockGainNode {
    constructor() {
      this.gain = new MockAudioParam('gain', 1.0);
      this.connectedTo = null;
      gains.push(this);
    }
    connect(target) {
      this.connectedTo = target;
    }
    disconnect() {
      this.connectedTo = null;
    }
  }

  class MockOscillatorNode {
    constructor() {
      this.type = 'sine';
      this.frequency = new MockAudioParam('frequency', 440);
      this.connectedTo = null;
      this.startTime = null;
      this.stopTime = null;
      oscillators.push(this);
    }
    connect(target) {
      this.connectedTo = target;
    }
    disconnect() {
      this.connectedTo = null;
    }
    start(t = 0) {
      this.startTime = t;
      timeline.push({ target: 'oscillator', type: 'start', time: t, oscType: this.type });
    }
    stop(t = 0) {
      this.stopTime = t;
      timeline.push({ target: 'oscillator', type: 'stop', time: t });
    }
  }

  const audioCtx = {
    currentTime: 0.05,
    state: 'running',
    destination: { id: 'destination' },
    oscillators,
    gains,
    timeline,

    createOscillator() {
      return new MockOscillatorNode();
    },
    createGain() {
      return new MockGainNode();
    },
    resume() {
      this.state = 'running';
      return Promise.resolve();
    },
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    },
    close() {
      this.state = 'closed';
      return Promise.resolve();
    },

    // Inspection helpers
    getScheduledOscillators() {
      return oscillators.map(osc => ({
        type: osc.type,
        startFreq: osc.frequency.events[0] ? osc.frequency.events[0].value : osc.frequency.value,
        endFreq: osc.frequency.events[osc.frequency.events.length - 1] ? osc.frequency.events[osc.frequency.events.length - 1].value : osc.frequency.value,
        events: osc.frequency.events,
        startTime: osc.startTime,
        stopTime: osc.stopTime
      }));
    },
    hasFrequencySweep(startFreqMin, endFreqMax) {
      return oscillators.some(osc => {
        const events = osc.frequency.events;
        if (events.length < 2) return false;
        const initial = events[0].value;
        const terminal = events[events.length - 1].value;
        return initial >= startFreqMin && terminal <= endFreqMax && initial > terminal;
      });
    },
    hasHarmonicChime(expectedBaseFreq = 587.33) {
      return oscillators.some(osc => {
        const events = osc.frequency.events;
        const freqVal = events[0] ? events[0].value : osc.frequency.value;
        return Math.abs(freqVal - expectedBaseFreq) < 5.0;
      });
    },
    hasSubBassThump(freq = 55) {
      return oscillators.some(osc => {
        const events = osc.frequency.events;
        const freqVal = events[0] ? events[0].value : osc.frequency.value;
        return Math.abs(freqVal - freq) < 5.0 && osc.type === 'sine';
      });
    },
    reset() {
      oscillators.length = 0;
      gains.length = 0;
      timeline.length = 0;
      this.currentTime = 0.05;
    }
  };

  return audioCtx;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. LIGHTWEIGHT HEADLESS DOM ENVIRONMENT
// ─────────────────────────────────────────────────────────────────────────────

function createDOMEnvironment(initialHtml = '') {
  const elements = {};
  const eventListeners = {};

  function makeEl(id, tag = 'div', classes = '') {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      className: classes,
      innerHTML: '',
      textContent: '',
      classList: {
        _classes: new Set(classes ? classes.split(' ').filter(Boolean) : []),
        add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
        remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
        contains(c) { return this._classes.has(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this._classes.has(c)) this.remove(c);
            else this.add(c);
          } else if (force) {
            this.add(c);
          } else {
            this.remove(c);
          }
        }
      },
      style: {},
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; },
      removeAttribute(k) { delete this.attributes[k]; },
      hasAttribute(k) { return this.attributes[k] !== undefined; },
      children: [],
      parentNode: null,
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter(c => c !== child);
        if (child.parentNode === this) child.parentNode = null;
      },
      _listeners: {},
      addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
      },
      removeEventListener(evt, fn) {
        if (!this._listeners[evt]) return;
        this._listeners[evt] = this._listeners[evt].filter(f => f !== fn);
      },
      dispatchEvent(evt) {
        const type = typeof evt === 'string' ? evt : evt.type;
        const listeners = this._listeners[type] || [];
        listeners.forEach(fn => fn.call(this, evt));
      },
      click() {
        this.dispatchEvent({ type: 'click', target: this });
      }
    };
    if (id) elements[id] = el;
    return el;
  }

  // Pre-seed core DOM elements
  const canvas = makeEl('bar-path-canvas', 'canvas');
  canvas.width = 220;
  canvas.height = 210;
  const mockCtx = createMockCanvasContext();
  canvas.getContext = (type) => (type === '2d' ? mockCtx : null);

  // Switcher UI elements
  const btnVariantSwitcher = makeEl('btn-variant-switcher', 'button', 'barpath-variant-pill font-mono');
  btnVariantSwitcher.setAttribute('aria-label', 'Switch Animation Variant');
  btnVariantSwitcher.setAttribute('aria-expanded', 'false');

  const barpathActiveVariant = makeEl('barpath-active-variant', 'span', 'variant-current');
  barpathActiveVariant.textContent = 'A';
  btnVariantSwitcher.appendChild(barpathActiveVariant);

  const variantSwitcherSheet = makeEl('variant-switcher-sheet', 'div', 'variant-switcher-sheet hidden');
  variantSwitcherSheet.setAttribute('role', 'dialog');
  variantSwitcherSheet.setAttribute('aria-hidden', 'true');

  const btnVariantSheetClose = makeEl('btn-variant-sheet-close', 'button', 'btn-glass-icon');
  const btnVariantAuditionRep = makeEl('btn-variant-audition-rep', 'button', 'btn-pill-primary');
  btnVariantAuditionRep.textContent = 'AUDITION REP';

  variantSwitcherSheet.appendChild(btnVariantSheetClose);
  variantSwitcherSheet.appendChild(btnVariantAuditionRep);

  // HUD elements
  const barpathHudDev = makeEl('barpath-hud-dev', 'span');
  barpathHudDev.textContent = '0.0 cm';
  const barpathHudEff = makeEl('barpath-hud-eff', 'span');
  barpathHudEff.textContent = '100%';

  // Legacy elements
  const orb = makeEl('orb', 'div', 'barbell-orb');
  const apexGlow = makeEl('apex-glow', 'div', 'apex-bloom');

  // Query selector simulation
  const document = {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(selector) {
      if (selector.startsWith('#')) {
        return elements[selector.slice(1)] || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      const match = this.querySelector(selector);
      return match ? [match] : [];
    },
    createElement(tag) {
      return makeEl('', tag);
    },
    addEventListener(evt, fn) {
      if (!eventListeners[evt]) eventListeners[evt] = [];
      eventListeners[evt].push(fn);
    },
    dispatchEvent(evt) {
      const type = typeof evt === 'string' ? evt : evt.type;
      (eventListeners[type] || []).forEach(fn => fn(evt));
    }
  };

  const window = {
    document,
    AudioContext: function() { return createMockAudioContext(); },
    webkitAudioContext: function() { return createMockAudioContext(); },
    location: {
      search: '',
      href: 'http://localhost/'
    },
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] !== undefined ? this._store[k] : null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; },
      clear() { this._store = {}; }
    },
    requestAnimationFrame(cb) {
      return setTimeout(cb, 16);
    },
    cancelAnimationFrame(id) {
      clearTimeout(id);
    },
    activeAnimationVariant: 'A',
    elements,
    mockCanvasContext: mockCtx
  };

  return { window, document, elements, mockCanvasContext: mockCtx };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. REFERENCE CONTRACT IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authoritative reference animator implementing `window.animateRepetitionStroke`
 */
function animateRepetitionStroke(options = {}, env = null) {
  const lift = options.lift || 'Deadlift';
  const velocity = Number(options.velocity) || 0.5;
  const rpe = Math.max(6.0, Math.min(10.0, Number(options.rpe) || 7.5));
  const deviationCm = Number(options.deviationCm) || 0.0;
  const rawVariant = (options.variant || 'A').toUpperCase();
  const variant = ['A', 'B', 'C', 'D'].includes(rawVariant) ? rawVariant : 'A';
  const onComplete = typeof options.onComplete === 'function' ? options.onComplete : () => {};

  const ctx = env && env.mockCanvasContext ? env.mockCanvasContext : createMockCanvasContext();
  const curve = synthesizeStrokeCurve({ lift, velocity, rpe, deviationCm, numPoints: 40 });

  // 1. Clear stage
  ctx.clearRect(0, 0, STAGE_BOUNDS.width, STAGE_BOUNDS.height);
  ctx.fillStyle = '#080A10';
  ctx.fillRect(0, 0, STAGE_BOUNDS.width, STAGE_BOUNDS.height);

  // 2. Corridors and 0.0cm Plumb Line
  ctx.save();
  // Optimal Corridor (+/- 2.0cm = +/- 36px)
  ctx.fillStyle = 'rgba(0, 255, 102, 0.04)';
  ctx.fillRect(STAGE_BOUNDS.centerX - 36, STAGE_BOUNDS.topY, 72, STAGE_BOUNDS.strokeHeight);

  // Warning Corridor lines (+/- 4.0cm = +/- 72px)
  ctx.strokeStyle = 'rgba(255, 184, 0, 0.20)';
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(STAGE_BOUNDS.centerX - 72, STAGE_BOUNDS.topY);
  ctx.lineTo(STAGE_BOUNDS.centerX - 72, STAGE_BOUNDS.botY);
  ctx.moveTo(STAGE_BOUNDS.centerX + 72, STAGE_BOUNDS.topY);
  ctx.lineTo(STAGE_BOUNDS.centerX + 72, STAGE_BOUNDS.botY);
  ctx.stroke();

  // 0.0cm Plumb Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(STAGE_BOUNDS.centerX, STAGE_BOUNDS.topY);
  ctx.lineTo(STAGE_BOUNDS.centerX, STAGE_BOUNDS.botY);
  ctx.stroke();
  ctx.restore();

  // 3. Variant Rendering
  const finalPoint = curve.points[curve.points.length - 1];
  const midPoint = curve.points[Math.floor(curve.points.length / 2)];

  if (variant === 'A') {
    // Primary Concept: Kinetic Dot + Dynamic Difficulty Color Transition + Lockout Pop
    // Hairline connector from plumb line to coordinate puck
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(STAGE_BOUNDS.centerX, finalPoint.yPixel);
    ctx.lineTo(finalPoint.xPixel, finalPoint.yPixel);
    ctx.stroke();

    // Specular Glow Halo
    const diff = computeDifficulty(velocity, rpe, lift);
    const color = computeColorInterpolation(lift, diff);
    const popScale = computePopScale(rpe);
    const haloRadius = 8 + 10 * diff;

    ctx.save();
    ctx.fillStyle = color.rgbaGlowString(0.40);
    ctx.beginPath();
    ctx.arc(finalPoint.xPixel, finalPoint.yPixel, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // Lockout completion pop expanding bloom
    const popRadius = 14 * popScale;
    ctx.strokeStyle = color.rgbaGlowString(0.65);
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(finalPoint.xPixel, finalPoint.yPixel, popRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Specular Inner Dot Core (Interpolated rim + white center)
    ctx.fillStyle = color.rgbString;
    ctx.beginPath();
    ctx.arc(finalPoint.xPixel, finalPoint.yPixel, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(finalPoint.xPixel, finalPoint.yPixel, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

  } else if (variant === 'B') {
    // Energy Ribbon: Variable line width constricting during sticking region
    ctx.save();
    for (let i = 1; i < curve.points.length; i++) {
      const pPrev = curve.points[i - 1];
      const pCurr = curve.points[i];
      // Constricts from 8px (fast) down to 2.5px (grind/sticking)
      const w = Math.max(2.5, Math.min(8.0, 8.0 * (pCurr.velocity / 1.0)));
      const segColor = computeColorInterpolation(lift, pCurr.difficulty);
      ctx.strokeStyle = segColor.rgbString;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pPrev.xPixel, pPrev.yPixel);
      ctx.lineTo(pCurr.xPixel, pCurr.yPixel);
      ctx.stroke();
    }
    ctx.restore();

  } else if (variant === 'C') {
    // Ripple Waves: Concentric elliptical pulse rings emitted towards 0.0cm plumb line
    ctx.save();
    const ringCount = Math.max(2, Math.round(3 + (rpe - 6.0)));
    for (let r = 1; r <= ringCount; r++) {
      const ringRadius = r * 8;
      const ringAlpha = Math.max(0.1, 0.7 - r * 0.15);
      const ringColor = computeColorInterpolation(lift, midPoint.difficulty);
      ctx.strokeStyle = ringColor.rgbaGlowString(ringAlpha);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(finalPoint.xPixel, finalPoint.yPixel, ringRadius, ringRadius * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

  } else if (variant === 'D') {
    // Spatial Ghost Path & Orthogonal Velocity Breakdown Vectors
    ctx.save();
    // Rep 1 baseline ghost plumb trail
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(STAGE_BOUNDS.centerX, STAGE_BOUNDS.topY);
    ctx.lineTo(STAGE_BOUNDS.centerX, STAGE_BOUNDS.botY);
    ctx.stroke();

    // Orthogonal Vectors radiating from puck
    const vVertLength = Math.min(40, velocity * 35);
    const vHorizLength = Math.min(30, Math.abs(deviationCm) * 6);

    ctx.strokeStyle = '#00E5FF'; // Vertical vector
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(finalPoint.xPixel, finalPoint.yPixel);
    ctx.lineTo(finalPoint.xPixel, finalPoint.yPixel - vVertLength);
    ctx.stroke();

    ctx.strokeStyle = '#FF857D'; // Horizontal vector
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(finalPoint.xPixel, finalPoint.yPixel);
    ctx.lineTo(finalPoint.xPixel + (deviationCm >= 0 ? vHorizLength : -vHorizLength), finalPoint.yPixel);
    ctx.stroke();
    ctx.restore();
  }

  // Update HUD metrics in environment
  if (env && env.document) {
    const hudDev = env.document.getElementById('barpath-hud-dev');
    if (hudDev) hudDev.textContent = `${deviationCm >= 0 ? '+' : ''}${deviationCm.toFixed(1)} cm`;
    const hudEff = env.document.getElementById('barpath-hud-eff');
    if (hudEff) hudEff.textContent = `${curve.pathEfficiencyPct}%`;
  }

  onComplete();

  return {
    curve,
    context: ctx
  };
}

/**
 * Authoritative reference audio engine implementing `SoundFX.playRepPopChime`
 */
function playRepPopChime(velocity, rpe, lift = 'Deadlift', audioCtxOverride = null) {
  const ctx = audioCtxOverride || createMockAudioContext();
  if (!ctx || ctx.state === 'suspended' || ctx.state === 'closed') return false;

  const now = ctx.currentTime;
  const numRpe = Math.max(6.0, Math.min(10.0, Number(rpe) || 7.5));
  const diff = (numRpe - 6.0) / 4.0;
  const numVel = Math.max(0.1, Number(velocity) || 0.5);

  // 1. Acoustic Pop Transient (Downward frequency sweep)
  const popOsc = ctx.createOscillator();
  const popGain = ctx.createGain();
  popOsc.type = 'sine';
  const startFreq = 280 - diff * 80;
  popOsc.frequency.setValueAtTime(startFreq, now);
  popOsc.frequency.exponentialRampToValueAtTime(80, now + 0.035);

  const startPopGain = 0.35 + diff * 0.25;
  popGain.gain.setValueAtTime(startPopGain, now);
  popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.040);

  popOsc.connect(popGain);
  popGain.connect(ctx.destination);
  popOsc.start(now);
  popOsc.stop(now + 0.045);

  // 2. Crystalline Harmonic Chime
  const baseFreq = 587.33; // D5
  const highFreq = Math.min(1350, baseFreq * (1 + numVel * 0.45));
  const chimeOsc1 = ctx.createOscillator();
  const chimeOsc2 = ctx.createOscillator();
  const chimeGain = ctx.createGain();

  chimeOsc1.type = 'sine';
  chimeOsc2.type = 'triangle';
  chimeOsc1.frequency.setValueAtTime(baseFreq, now + 0.020);
  chimeOsc2.frequency.setValueAtTime(highFreq, now + 0.025);

  const duration = 0.22 + diff * 0.25;
  chimeGain.gain.setValueAtTime(0.20, now + 0.020);
  chimeGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  chimeOsc1.connect(chimeGain);
  chimeOsc2.connect(chimeGain);
  chimeGain.connect(ctx.destination);
  chimeOsc1.start(now + 0.020);
  chimeOsc2.start(now + 0.025);
  chimeOsc1.stop(now + duration + 0.01);
  chimeOsc2.stop(now + duration + 0.01);

  // 3. Sub-Bass Effort Resonance (High RPE only)
  let subOsc = null;
  if (numRpe >= 8.5) {
    subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(55, now + 0.010);
    subGain.gain.setValueAtTime(0.30 * diff, now + 0.010);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now + 0.010);
    subOsc.stop(now + 0.22);
  }

  return {
    ctx,
    popOsc,
    chimeOsc1,
    chimeOsc2,
    subOsc,
    duration
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. STATIC GUARDRAIL SCANNERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans files for prohibited device terms constructed dynamically to avoid false positives
 */
function scanForbiddenTerms(filePaths, rootDir = path.resolve(__dirname, '..')) {
  // Construct regex dynamically with zero literal forbidden terms in source
  const terms = [
    'web' + 'ble',
    '100' + 'hz',
    'esp' + '32',
    'esp' + '32-c6',
    'i' + 'mu',
    'madg' + 'wick',
    'blue' + 'fy',
    'sen' + 'sor',
    'sen' + 'sors',
    'hard' + 'ware'
  ];
  const regex = new RegExp(`\\b(${terms.join('|')})\\b`, 'i');
  const violations = [];

  for (const relPath of filePaths) {
    const fullPath = path.isAbsolute(relPath) ? relPath : path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (regex.test(line)) {
        violations.push({
          file: relPath,
          line: idx + 1,
          content: line.trim()
        });
      }
    });
  }

  return violations;
}

/**
 * Scans HTML/JS files for emojis or symbol glyphs in button elements
 */
function scanButtonEmojis(filePaths, rootDir = path.resolve(__dirname, '..')) {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  const violations = [];

  for (const relPath of filePaths) {
    const fullPath = path.isAbsolute(relPath) ? relPath : path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');

    let match;
    while ((match = buttonRegex.exec(content)) !== null) {
      if (emojiRegex.test(match[1])) {
        violations.push({
          file: relPath,
          buttonText: match[1].trim()
        });
      }
    }
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  LIFT_COLORS,
  LIFT_BASELINES,
  STAGE_BOUNDS,
  computeDifficulty,
  computeColorInterpolation,
  computePopScale,
  computePlumbLineX,
  computeAcousticParams,
  synthesizeStrokeCurve,
  generateSetTelemetry,
  createMockCanvasContext,
  createMockAudioContext,
  createDOMEnvironment,
  animateRepetitionStroke,
  playRepPopChime,
  scanForbiddenTerms,
  scanButtonEmojis
};
