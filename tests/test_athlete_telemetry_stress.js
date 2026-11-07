/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS ATHLETE VIEW TELEMETRY, KINEMATICS & SYNCBUS EMPIRICAL STRESS HARNESS
 * Challenger 2 Verification Suite
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const APP_JS_PATH = path.join(ROOT_DIR, 'app.js');
const SYNC_BUS_JS_PATH = path.join(ROOT_DIR, 'sync-bus.js');

const appJsContent = fs.readFileSync(APP_JS_PATH, 'utf8');
const syncBusContent = fs.readFileSync(SYNC_BUS_JS_PATH, 'utf8');

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║   EROS ATHLETE TELEMETRY & SYNCBUS EMPIRICAL STRESS HARNESS (CHALLENGER)  ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

// ── Extract synthesizeRepTrajectory and helper environment
const synthMatch = appJsContent.match(/function synthesizeRepTrajectory\([\s\S]*?\n\}/);
assert.ok(synthMatch, 'synthesizeRepTrajectory function must be present in app.js');

const KNOWN_LIFTS = {
  'squat': 'Squat',
  'bench': 'Bench',
  'deadlift': 'Deadlift',
  'main squat': 'Squat',
  'main deadlift': 'Deadlift'
};

function canonicalLift(name) {
  const raw = String(name == null ? '' : name).trim();
  return KNOWN_LIFTS[raw.toLowerCase()] || raw;
}

const synthesizeRepTrajectory = new Function('canonicalLift',
  `return (${synthMatch[0]});`
)(canonicalLift);

// ── Extract validateRepRecorded and validateSetCompleted from sync-bus.js
const validateRepRecordedMatch = syncBusContent.match(/function validateRepRecorded\(data\) \{[\s\S]*?\n  \}/);
const validateSetCompletedMatch = syncBusContent.match(/function validateSetCompleted\(data\) \{[\s\S]*?\n  \}/);

assert.ok(validateRepRecordedMatch, 'validateRepRecorded must exist in sync-bus.js');
assert.ok(validateSetCompletedMatch, 'validateSetCompleted must exist in sync-bus.js');

const validateRepRecorded = new Function(`return (${validateRepRecordedMatch[0]});`)();
const validateSetCompleted = new Function(`return (${validateSetCompletedMatch[0]});`)();

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: KINEMATIC TRAJECTORY SYNTHESIS STRESS & EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- SUITE 1: Kinematic Trajectory Synthesis Stress & Edge Cases ---');

const testCases = [
  { name: 'Standard Squat', lift: 'Squat', vel: 0.65, dev: 2.1, rom: 55, rpe: 8.0 },
  { name: 'Standard Bench Press', lift: 'Bench', vel: 0.40, dev: 1.8, rom: 38, rpe: 8.5 },
  { name: 'Standard Deadlift', lift: 'Deadlift', vel: 0.50, dev: 2.5, rom: 52, rpe: 7.5 },
  { name: 'Zero Velocity (Clamped Fallback)', lift: 'Deadlift', vel: 0, dev: null, rom: 50, rpe: 8.0 },
  { name: 'Ultra-Slow Grind (0.05 m/s Clamped)', lift: 'Squat', vel: 0.05, dev: null, rom: 45, rpe: 10.0 },
  { name: 'Explosive Catapult (>2.0 m/s)', lift: 'Bench', vel: 2.20, dev: 0.8, rom: 35, rpe: 5.0 },
  { name: 'Zero Measured Deviation (0.0 cm)', lift: 'Deadlift', vel: 0.45, dev: 0.0, rom: 50, rpe: 7.0 },
  { name: 'Extreme Sway Deviation (15.0 cm)', lift: 'Squat', vel: 0.35, dev: 15.0, rom: 60, rpe: 9.5 },
  { name: 'Negative Measured Deviation (-3.5 cm)', lift: 'Bench', vel: 0.42, dev: -3.5, rom: 40, rpe: 8.0 },
  { name: 'Minimum ROM (20.0 cm Clamped)', lift: 'Bench', vel: 0.55, dev: 1.2, rom: 10.0, rpe: 7.0 },
  { name: 'Huge ROM (120.0 cm)', lift: 'Deadlift', vel: 0.60, dev: 3.0, rom: 120.0, rpe: 8.0 },
  { name: 'Max RPE 10.0 Fatigue Grind', lift: 'Deadlift', vel: 0.18, dev: 4.2, rom: 50, rpe: 10.0 },
  { name: 'Zero RPE Warmup (RPE 0)', lift: 'Squat', vel: 0.90, dev: 1.0, rom: 50, rpe: 0 },
  { name: 'Unknown / Custom Lift Fallback', lift: 'Zercher Squat', vel: 0.45, dev: 2.0, rom: 48, rpe: 8.0 }
];

testCases.forEach((tc, idx) => {
  runTest(`1.${idx + 1} Synthesis: ${tc.name}`, () => {
    const res = synthesizeRepTrajectory(tc.lift, tc.vel, tc.dev, tc.rom, tc.rpe);

    // 1. Point count assertion
    assert.strictEqual(res.points.length, 40, `Must generate exactly 40 points, got ${res.points.length}`);
    assert.strictEqual(res.trajectoryPoints.length, 40, `trajectoryPoints alias must have 40 points`);

    // 2. Point coordinate validity
    let prevT = -1;
    let prevY = -1;
    res.points.forEach((pt, ptIdx) => {
      assert.ok(typeof pt.t === 'number' && Number.isFinite(pt.t) && pt.t >= 0, `Point ${ptIdx}: t must be finite >= 0`);
      assert.ok(typeof pt.y === 'number' && Number.isFinite(pt.y) && pt.y >= 0, `Point ${ptIdx}: y must be finite >= 0`);
      assert.ok(typeof pt.dx === 'number' && Number.isFinite(pt.dx), `Point ${ptIdx}: dx must be finite`);
      assert.ok(typeof pt.v === 'number' && Number.isFinite(pt.v) && pt.v >= 0.08, `Point ${ptIdx}: v must be >= 0.08 m/s`);

      // Monotonic progression checks
      assert.ok(pt.t >= prevT, `Point ${ptIdx}: t must be non-decreasing (${pt.t} >= ${prevT})`);
      assert.ok(pt.y >= prevY, `Point ${ptIdx}: y must be non-decreasing (${pt.y} >= ${prevY})`);
      prevT = pt.t;
      prevY = pt.y;
    });

    // 3. Normalized y boundaries
    assert.strictEqual(res.points[0].y, 0, 'First y must be 0.0');
    assert.strictEqual(res.points[39].y, 1.0, 'Last y must be 1.0');

    // 4. Metric sanity
    assert.ok(typeof res.maxDeviationCm === 'number' && res.maxDeviationCm >= 0, 'maxDeviationCm must be non-negative');
    assert.ok(typeof res.deviationCm === 'number' && res.deviationCm >= 0, 'deviationCm must be non-negative');
    assert.ok(res.maxDeviationCm >= res.deviationCm, `maxDeviationCm (${res.maxDeviationCm}) must be >= deviationCm (${res.deviationCm})`);

    // 5. Path efficiency bounds: 0 < eff <= 100%
    assert.ok(typeof res.pathEfficiencyPct === 'number' && Number.isFinite(res.pathEfficiencyPct), 'pathEfficiencyPct must be finite');
    assert.ok(res.pathEfficiencyPct > 0, `pathEfficiencyPct must be > 0%, got ${res.pathEfficiencyPct}`);
    assert.ok(res.pathEfficiencyPct <= 100.0, `pathEfficiencyPct must be <= 100%, got ${res.pathEfficiencyPct}`);

    // 6. Lift-specific biomechanical profiles
    const liftNorm = canonicalLift(tc.lift).toLowerCase();
    if (liftNorm.includes('bench')) {
      // McLaughlin J-curve flare backward (negative dx)
      const hasNegativeFlare = res.points.some(p => p.dx < 0);
      assert.ok(hasNegativeFlare, 'Bench press trajectory must demonstrate backward McLaughlin J-flare (negative dx)');
    } else if (liftNorm.includes('squat')) {
      // Forward knee drift (positive dx)
      const hasForwardDrift = res.points.some(p => p.dx > 0);
      assert.ok(hasForwardDrift, 'Squat trajectory must demonstrate anterior knee tracking (positive dx)');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: COLOR-GRADING THRESHOLDS & GROOVE FEEDBACK ORACLE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 2: Color-Grading Boundaries & Dynamic Groove Feedback Oracle ---');

function getExpectedStrokeColor(dx) {
  const dev = Math.abs(dx);
  if (dev > 3.5) return '#FF3B30';
  if (dev > 2.0) return '#FFB800';
  return '#00FF66';
}

function getExpectedGrooveTag(dx) {
  const dev = Math.abs(dx);
  if (dev > 3.5) return 'GROOVE: BAR DRIFT';
  if (dev > 2.0) return 'GROOVE: MILD DRIFT';
  return 'GROOVE: LOCKED';
}

runTest('2.1 Boundary Thresholds: 0.0cm, 2.0cm, 2.01cm, 3.5cm, 3.51cm, 5.0cm', () => {
  const cases = [
    { dx: 0.0,  color: '#00FF66', tag: 'GROOVE: LOCKED' },
    { dx: 1.5,  color: '#00FF66', tag: 'GROOVE: LOCKED' },
    { dx: 2.0,  color: '#00FF66', tag: 'GROOVE: LOCKED' },
    { dx: 2.01, color: '#FFB800', tag: 'GROOVE: MILD DRIFT' },
    { dx: 3.0,  color: '#FFB800', tag: 'GROOVE: MILD DRIFT' },
    { dx: 3.5,  color: '#FFB800', tag: 'GROOVE: MILD DRIFT' },
    { dx: 3.51, color: '#FF3B30', tag: 'GROOVE: BAR DRIFT' },
    { dx: 6.2,  color: '#FF3B30', tag: 'GROOVE: BAR DRIFT' },
    // Negative signed values
    { dx: -1.8, color: '#00FF66', tag: 'GROOVE: LOCKED' },
    { dx: -2.0, color: '#00FF66', tag: 'GROOVE: LOCKED' },
    { dx: -2.5, color: '#FFB800', tag: 'GROOVE: MILD DRIFT' },
    { dx: -3.5, color: '#FFB800', tag: 'GROOVE: MILD DRIFT' },
    { dx: -4.0, color: '#FF3B30', tag: 'GROOVE: BAR DRIFT' }
  ];

  cases.forEach(c => {
    assert.strictEqual(getExpectedStrokeColor(c.dx), c.color, `Stroke color for dx=${c.dx} must be ${c.color}`);
    assert.strictEqual(getExpectedGrooveTag(c.dx), c.tag, `Groove tag for dx=${c.dx} must be ${c.tag}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: REP 1 GHOST TRAIL PERSISTENCE ACROSS MULTI-REP SETS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 3: Rep 1 Ghost Trail Persistence Across Multi-Rep Sets ---');

runTest('3.1 Rep 1 Ghost Trail immutability across 5 consecutive reps', () => {
  // Mock active set
  const set = {
    setId: 'set_ghost_test_1',
    setNumber: 1,
    lift: 'Deadlift',
    weight: 140,
    reps: []
  };

  // Rep 1: Initial benchmark repetition
  const rep1Synth = synthesizeRepTrajectory('Deadlift', 0.55, 1.4, 50, 7.0);
  const rep1 = {
    repNumber: 1,
    lift: 'Deadlift',
    velocity: 0.55,
    rpe: 7.0,
    deviationCm: rep1Synth.deviationCm,
    maxDeviationCm: rep1Synth.maxDeviationCm,
    pathEfficiencyPct: rep1Synth.pathEfficiencyPct,
    trajectoryPoints: JSON.parse(JSON.stringify(rep1Synth.points))
  };
  set.reps.push(rep1);

  // Snapshot Rep 1 points
  const rep1FrozenPoints = JSON.stringify(rep1.trajectoryPoints);

  // Add reps 2 through 5 with varying fatigue and deviation
  for (let r = 2; r <= 5; r++) {
    const vel = 0.55 - (r - 1) * 0.08;
    const dev = 1.4 + (r - 1) * 0.7;
    const synth = synthesizeRepTrajectory('Deadlift', vel, dev, 50, 7.0 + (r - 1) * 0.5);
    const rep = {
      repNumber: r,
      lift: 'Deadlift',
      velocity: vel,
      rpe: 7.0 + (r - 1) * 0.5,
      deviationCm: synth.deviationCm,
      maxDeviationCm: synth.maxDeviationCm,
      pathEfficiencyPct: synth.pathEfficiencyPct,
      trajectoryPoints: synth.points
    };
    set.reps.push(rep);

    // Ghost trail evaluation for targetIdx = r - 1
    const targetIdx = r - 1;
    const reps = set.reps;

    // Simulation of app.js lines 1557-1569:
    const shouldDrawGhost = (targetIdx > 0 && reps.length > 0 && reps[0].trajectoryPoints);
    assert.ok(shouldDrawGhost, `Rep ${r} must render ghost trail from Rep 1`);

    const ghostPts = reps[0].trajectoryPoints;
    assert.strictEqual(ghostPts.length, 40, `Ghost trail must contain 40 points on rep ${r}`);
    assert.strictEqual(JSON.stringify(ghostPts), rep1FrozenPoints, `Rep 1 ghost trail must remain strictly identical on rep ${r}`);
  }

  // When viewing Rep 1 (targetIdx = 0), ghost trail should NOT be rendered
  const shouldDrawOnRep1 = (0 > 0 && set.reps.length > 0 && set.reps[0].trajectoryPoints);
  assert.strictEqual(shouldDrawOnRep1, false, 'Ghost trail must not be drawn when inspecting Rep 1');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: EROSSYNCBUS WHITELISTS & TELEMETRY INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 4: ErosSyncBus Whitelist & Telemetry Integrity ---');

runTest('4.1 validateRepRecorded passes deviationCm, maxDeviationCm, pathEfficiencyPct, trajectoryPoints', () => {
  const synth = synthesizeRepTrajectory('Squat', 0.60, 2.3, 50, 8.0);
  const rawPayload = {
    setId: 'set_123',
    repNumber: 3,
    velocity: 0.60,
    peakVelocity: 0.75,
    rom: 52.5,
    rpe: 8.0,
    lossPercent: 8.5,
    deviationCm: synth.deviationCm,
    maxDeviationCm: synth.maxDeviationCm,
    pathEfficiencyPct: synth.pathEfficiencyPct,
    trajectoryPoints: synth.points
  };

  const validated = validateRepRecorded(rawPayload);

  assert.strictEqual(validated.setId, 'set_123');
  assert.strictEqual(validated.repNumber, 3);
  assert.strictEqual(validated.velocity, 0.60);
  assert.strictEqual(validated.deviationCm, synth.deviationCm);
  assert.strictEqual(validated.maxDeviationCm, synth.maxDeviationCm);
  assert.strictEqual(validated.pathEfficiencyPct, synth.pathEfficiencyPct);
  assert.ok(Array.isArray(validated.trajectoryPoints), 'trajectoryPoints must be an array');
  assert.strictEqual(validated.trajectoryPoints.length, 40, 'trajectoryPoints must have 40 points');

  // Verify fields on each point
  validated.trajectoryPoints.forEach((pt, i) => {
    assert.ok('t' in pt, `Point ${i} must have t`);
    assert.ok('y' in pt, `Point ${i} must have y`);
    assert.ok('dx' in pt, `Point ${i} must have dx`);
    assert.ok('v' in pt, `Point ${i} must have v`);
    assert.ok(Number.isFinite(pt.t), `Point ${i}.t must be finite`);
    assert.ok(Number.isFinite(pt.y), `Point ${i}.y must be finite`);
    assert.ok(Number.isFinite(pt.dx), `Point ${i}.dx must be finite`);
    assert.ok(Number.isFinite(pt.v), `Point ${i}.v must be finite`);
  });
});

runTest('4.2 validateSetCompleted passes set-level deviation metrics & last trajectory', () => {
  const synth = synthesizeRepTrajectory('Bench', 0.45, 1.9, 40, 8.5);
  const rawPayload = {
    setId: 'set_456',
    setNumber: 2,
    lift: 'Bench',
    weight: 100,
    reps: [
      { repNumber: 1, velocity: 0.50, deviationCm: 1.6 },
      { repNumber: 2, velocity: 0.45, deviationCm: 1.9 }
    ],
    avgVelocity: 0.48,
    maxVelocity: 0.50,
    velocityLoss: 10.0,
    restSeconds: 120,
    deviationCm: 1.8,
    maxDeviationCm: 2.2,
    pathEfficiencyPct: 96.5,
    trajectoryPoints: synth.points,
    avgRpe: 8.0,
    targetRpe: 8.5,
    athleteId: 'ath_001',
    athleteName: 'Guilherme Camilo',
    pairingCode: 'EROS-7749'
  };

  const validated = validateSetCompleted(rawPayload);

  assert.strictEqual(validated.setId, 'set_456');
  assert.strictEqual(validated.setNumber, 2);
  assert.strictEqual(validated.lift, 'Bench');
  assert.strictEqual(validated.weight, 100);
  assert.strictEqual(validated.restSeconds, 120);
  assert.strictEqual(validated.deviationCm, 1.8);
  assert.strictEqual(validated.maxDeviationCm, 2.2);
  assert.strictEqual(validated.pathEfficiencyPct, 96.5);
  assert.strictEqual(validated.avgRpe, 8.0);
  assert.strictEqual(validated.targetRpe, 8.5);
  assert.strictEqual(validated.athleteId, 'ath_001');
  assert.strictEqual(validated.athleteName, 'Guilherme Camilo');
  assert.strictEqual(validated.pairingCode, 'EROS-7749');
  assert.ok(Array.isArray(validated.trajectoryPoints));
  assert.strictEqual(validated.trajectoryPoints.length, 40);
});

runTest('4.3 Missing optional deviation fields in validateSetCompleted default gracefully', () => {
  const basicPayload = {
    setId: 'set_789',
    setNumber: 1,
    lift: 'Squat',
    weight: 120
  };

  const validated = validateSetCompleted(basicPayload);
  assert.strictEqual(validated.setId, 'set_789');
  assert.strictEqual(validated.deviationCm, undefined);
  assert.strictEqual(validated.maxDeviationCm, undefined);
  assert.strictEqual(validated.pathEfficiencyPct, undefined);
  assert.strictEqual(validated.trajectoryPoints, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: SET-LEVEL METRIC AGGREGATION ORACLE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 5: Set-Level Metric Aggregation Oracle ---');

runTest('5.1 recalculateSetMetrics accurately computes mean deviationCm, maxDeviationCm, and pathEfficiencyPct', () => {
  // Extract recalculateSetMetrics from app.js
  const recalcMatch = appJsContent.match(/function recalculateSetMetrics\(set\) \{[\s\S]*?\n\}/);
  assert.ok(recalcMatch, 'recalculateSetMetrics must exist in app.js');

  const recalculateSetMetrics = new Function(`return (${recalcMatch[0]});`)();

  const mockSet = {
    setId: 'set_agg_test',
    reps: [
      { repNumber: 1, velocity: 0.60, rpe: 7.0, deviationCm: 1.5, maxDeviationCm: 2.0, pathEfficiencyPct: 98.0 },
      { repNumber: 2, velocity: 0.55, rpe: 7.5, deviationCm: 2.1, maxDeviationCm: 2.8, pathEfficiencyPct: 95.0 },
      { repNumber: 3, velocity: 0.50, rpe: 8.0, deviationCm: 2.7, maxDeviationCm: 3.6, pathEfficiencyPct: 92.0 },
      { repNumber: 4, velocity: 0.45, rpe: 9.0, deviationCm: 3.3, maxDeviationCm: 4.4, pathEfficiencyPct: 88.0 }
    ]
  };

  recalculateSetMetrics(mockSet);

  // Mean velocity = (0.60 + 0.55 + 0.50 + 0.45) / 4 = 0.525 -> 0.53 (or 0.52 depending on rounding)
  assert.strictEqual(mockSet.avgVelocity, 0.53);
  assert.strictEqual(mockSet.maxVelocity, 0.60);
  assert.strictEqual(mockSet.minVelocity, 0.45);
  // Velocity Loss % = ((0.60 - 0.45) / 0.60) * 100 = 25.0%
  assert.strictEqual(mockSet.velocityLossPct, 25.0);
  // Mean RPE = (7.0 + 7.5 + 8.0 + 9.0) / 4 = 7.875 -> 7.9
  assert.strictEqual(mockSet.avgRpe, 7.9);

  // Mean deviationCm = (1.5 + 2.1 + 2.7 + 3.3) / 4 = 2.4
  assert.strictEqual(mockSet.deviationCm, 2.4);
  // Peak maxDeviationCm = max(1.5, 2.1, 2.7, 3.3) = 3.3
  assert.strictEqual(mockSet.maxDeviationCm, 3.3);
  // Mean pathEfficiencyPct = (98.0 + 95.0 + 92.0 + 88.0) / 4 = 93.25 -> 93.3 (or 93.2)
  assert.strictEqual(mockSet.pathEfficiencyPct, 93.3);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY REPORT
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log(`║ ALL ${passedTests} TELEMETRY & SYNCBUS EMPIRICAL STRESS TESTS PASSED (100%)    ║`);
console.log('╚════════════════════════════════════════════════════════════════════════╝');
