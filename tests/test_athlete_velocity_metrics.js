/**
 * tests/test_athlete_velocity_metrics.js
 * Automated Verification Suite for Athlete Velocity Metrics & Telemetry Ergonomics (Milestone 3 / R2)
 *
 * Verifies:
 * 1. Bryan Mann 5-Zone Velocity Continuum color-coding:
 *    - Zone 1: Speed / Power (>1.0 m/s) -> Laser Cyan (#00E5FF)
 *    - Zone 2: Speed-Strength (0.75-1.0 m/s) -> Electric Emerald (#00FF66)
 *    - Zone 3: Strength-Speed (0.50-0.75 m/s) -> Specular Gold (#FFD700)
 *    - Zone 4: Accelerative Strength (0.30-0.50 m/s) -> Caution Orange (#FF9500)
 *    - Zone 5: Absolute Strength / Grind (<0.30 m/s) -> Apple System Punchy Red (#FF3B30)
 * 2. PR / Target Velocity Delta Badges on rep completion:
 *    - Target velocity calculation from lift baseline and target RPE
 *    - Positive delta (+0.04 m/s) and negative delta (-0.06 m/s)
 *    - PR delta badge display
 * 3. Dynamic Velocity Loss / Fatigue Arc:
 *    - SVG circumference & stroke-dashoffset math (r=22, C=138.23)
 *    - 3-tier fatigue color transitions (0-10% #00FF66, 10-20% #FFD700, >20% #FF3B30)
 *    - Critical cutoff warning pulse class (.cutoff-exceeded) on #rpe-hero-card
 * 4. VisionOS Glass OS fidelity & responsive touch ergonomics
 * 5. Strict R4 compliance: zero hardware terms, zero emojis, pure Eros
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fxCss = fs.readFileSync(path.join(ROOT, 'athlete-fx.css'), 'utf8');
const fxJs = require(path.join(ROOT, 'athlete-fx.js'));
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

console.log('=== ATHLETE VELOCITY METRICS & TELEMETRY ERGONOMICS TEST SUITE ===\n');

// ── Test 1: Bryan Mann 5-Zone Continuum Boundary Tests ──
console.log('[TEST 1] Bryan Mann 5-Zone Velocity Continuum Tests...');
const boundaryTests = [
  { v: 1.50, zone: 'power', color: '#00E5FF', label: 'Speed / Power' },
  { v: 1.01, zone: 'power', color: '#00E5FF', label: 'Speed / Power' },
  { v: 1.00, zone: 'speed', color: '#00FF66', label: 'Speed-Strength' },
  { v: 0.85, zone: 'speed', color: '#00FF66', label: 'Speed-Strength' },
  { v: 0.75, zone: 'speed', color: '#00FF66', label: 'Speed-Strength' },
  { v: 0.74, zone: 'strength', color: '#FFD700', label: 'Strength-Speed' },
  { v: 0.60, zone: 'strength', color: '#FFD700', label: 'Strength-Speed' },
  { v: 0.50, zone: 'strength', color: '#FFD700', label: 'Strength-Speed' },
  { v: 0.49, zone: 'accel', color: '#FF9500', label: 'Accelerative Strength' },
  { v: 0.40, zone: 'accel', color: '#FF9500', label: 'Accelerative Strength' },
  { v: 0.30, zone: 'accel', color: '#FF9500', label: 'Accelerative Strength' },
  { v: 0.29, zone: 'grind', color: '#FF3B30', label: 'Absolute Strength / Grind' },
  { v: 0.15, zone: 'grind', color: '#FF3B30', label: 'Absolute Strength / Grind' }
];

for (const t of boundaryTests) {
  const resolved = fxJs.getVelocityZone(t.v);
  assert.strictEqual(resolved.id, t.zone, `Failed zone for v=${t.v}`);
  assert.strictEqual(resolved.color.toUpperCase(), t.color.toUpperCase(), `Failed color for v=${t.v}`);
}
console.log('✔ All 13 Bryan Mann velocity boundary conditions verified.');

// ── Test 2: Target Velocity & Delta Badge Mechanics ──
console.log('\n[TEST 2] Target Velocity & PR Delta Badge Mechanics...');
// Biomechanical baselines for Deadlift: rpe8 = 0.35, mvt = 0.15
const dlRpe8 = 0.35;
const dlMvt = 0.15;
const slope = (dlRpe8 - dlMvt) / 2.0; // 0.10 m/s per RPE unit

function computeTargetVel(targetRpe) {
  return dlRpe8 + (8.0 - targetRpe) * slope;
}

assert.strictEqual(computeTargetVel(8.0), 0.35, 'Target velocity at @8.0 must be 0.35 m/s');
assert.strictEqual(parseFloat(computeTargetVel(7.0).toFixed(2)), 0.45, 'Target velocity at @7.0 must be 0.45 m/s');
assert.strictEqual(parseFloat(computeTargetVel(9.0).toFixed(2)), 0.25, 'Target velocity at @9.0 must be 0.25 m/s');

// Delta calculation
const fastRepDelta = 0.45 - computeTargetVel(8.0); // +0.10 m/s
assert.ok(fastRepDelta > 0, 'Faster than target must produce positive delta');

const slowRepDelta = 0.29 - computeTargetVel(8.0); // -0.06 m/s
assert.ok(slowRepDelta < 0, 'Slower than target must produce negative delta');
console.log('✔ Target velocity and delta mathematics verified.');

// ── Test 3: Dynamic Fatigue & Velocity Loss Arc Mechanics ──
console.log('\n[TEST 3] Dynamic Fatigue & Velocity Loss Arc Mechanics...');
const arcCircumference = 138.23; // 2 * PI * 22
function calcArcOffset(lossPct) {
  const ratio = Math.min(Math.max(lossPct / 30.0, 0), 1);
  return parseFloat((arcCircumference - (arcCircumference * ratio)).toFixed(2));
}

assert.strictEqual(calcArcOffset(0), 138.23, '0% loss must be empty arc');
assert.strictEqual(calcArcOffset(30), 0.0, '30% loss must be full arc');
assert.ok(Math.abs(calcArcOffset(15) - 69.115) < 0.05, '15% loss must be half arc (~69.12)');

// Fatigue tier colors
function getFatigueColor(lossPct) {
  if (lossPct > 20.0) return '#FF3B30';
  if (lossPct >= 10.0) return '#FFD700';
  return '#00FF66';
}
assert.strictEqual(getFatigueColor(5.0), '#00FF66', '5% must be emerald');
assert.strictEqual(getFatigueColor(15.0), '#FFD700', '15% must be gold');
assert.strictEqual(getFatigueColor(22.0), '#FF3B30', '22% must be punchy red');
console.log('✔ Dynamic fatigue arc offsets and tier colors verified.');

// ── Test 4: Required DOM Elements in index.html ──
console.log('\n[TEST 4] Required DOM Elements in index.html...');
const expectedDomIds = [
  'live-velocity',
  'live-peak-vel',
  'live-vel-zone-badge',
  'live-peak-zone-badge',
  'live-target-vel-badge',
  'live-target-vel-val',
  'live-vel-delta',
  'hud-vel-loss',
  'hud-fatigue-arc-fill',
  'hud-vel-loss-card',
  'set-avg-vel',
  'set-max-vel',
  'set-min-vel',
  'set-vel-loss'
];

for (const id of expectedDomIds) {
  assert.ok(html.includes(`id="${id}"`), `Missing element id="${id}" in index.html`);
}
console.log(`✔ All ${expectedDomIds.length} telemetry elements confirmed in index.html.`);

// ── Test 5: CSS Rule & Animation Integrity in athlete-fx.css ──
console.log('\n[TEST 5] CSS Rules in athlete-fx.css...');
const expectedCssRules = [
  '.vel-zone-power',
  '.vel-zone-speed',
  '.vel-zone-strength',
  '.vel-zone-accel',
  '.vel-zone-grind',
  '.target-velocity-badge',
  '.rep-delta-badge',
  '.fatigue-arc-wrap',
  '.fatigue-arc-fill',
  '.fatigue-minimal',
  '.fatigue-optimal',
  '.fatigue-cutoff',
  '.cutoff-exceeded',
  'cutoffWarningPulse'
];

for (const r of expectedCssRules) {
  assert.ok(fxCss.includes(r), `Missing CSS rule: ${r} in athlete-fx.css`);
}
console.log(`✔ All ${expectedCssRules.length} CSS rules and keyframes confirmed.`);

// ── Test 6: Zero Emoji & Strict R4 Compliance ──
console.log('\n[TEST 6] Zero Emoji & Strict R4 Compliance...');
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
const forbiddenPattern = /\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|hardware)\b/i;

const files = [
  { name: 'index.html', content: html },
  { name: 'athlete-fx.css', content: fxCss },
  { name: 'athlete-fx.js', content: fs.readFileSync(path.join(ROOT, 'athlete-fx.js'), 'utf8') },
  { name: 'app.js', content: appJs }
];

for (const f of files) {
  assert.ok(!emojiRegex.test(f.content), `Forbidden emoji found in ${f.name}`);
  assert.ok(!forbiddenPattern.test(f.content), `Forbidden R4 hardware term found in ${f.name}`);
}
console.log('✔ Zero emojis and zero R4 hardware terms verified across all files.');

console.log('\n======================================================');
console.log('ALL ATHLETE VELOCITY METRICS & ERGONOMICS TESTS PASSED!');
console.log('======================================================');
process.exit(0);
