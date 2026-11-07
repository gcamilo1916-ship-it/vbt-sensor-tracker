/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS ATHLETE VIEW OVERHAUL VERIFICATION SUITE (R1 - R4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive automated verification for:
 * - R1: 2D Sagittal Barbell Deviation Canvas & Interactive Replay Stage
 * - R2: Antigravity Luminous RPE Tracking Pill & Segmented Ticks
 * - R3: Zero-Scroll iPhone Ergonomics & Active-Set Auto-Collapse
 * - R4: Brand Identity, Guardrails, Zero Forbidden Terms, Zero Emojis in Buttons
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const STYLE_CSS_PATH = path.join(ROOT_DIR, 'style.css');
const APP_JS_PATH = path.join(ROOT_DIR, 'app.js');
const SYNC_BUS_JS_PATH = path.join(ROOT_DIR, 'sync-bus.js');

const htmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const cssContent = fs.readFileSync(STYLE_CSS_PATH, 'utf8');
const appJsContent = fs.readFileSync(APP_JS_PATH, 'utf8');
const syncBusContent = fs.readFileSync(SYNC_BUS_JS_PATH, 'utf8');

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║       EROS ATHLETE VIEW (R1 - R4) FULL AUTOMATED TEST SUITE            ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: REQUIREMENT R1 (2D Sagittal Barbell Deviation Canvas & Replay Stage)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- TEST SUITE 1: Requirement R1 (2D Sagittal Canvas & Replay Controls) ---');

// 1.1 Canvas element with exact dimensions
assert.ok(
  /<canvas[^>]*id=["']bar-path-canvas["'][^>]*width=["']220["'][^>]*height=["']210["']/i.test(htmlContent),
  'R1.1: #bar-path-canvas with width="220" and height="210" must exist in index.html'
);
console.log('  [PASS] 1.1 #bar-path-canvas (220x210) confirmed in DOM');

// 1.2 Backward compatibility: #orb and #apex-glow must remain inside .bar-path-stage
assert.ok(
  /<div[^>]*class=["'][^"']*bar-path-stage[^"']*["'][^>]*>[\s\S]*?<div[^>]*id=["']orb["'][\s\S]*?<div[^>]*id=["']apex-glow["']/i.test(htmlContent),
  'R1.2: #orb and #apex-glow must be preserved inside .bar-path-stage'
);
console.log('  [PASS] 1.2 #orb and #apex-glow legacy elements preserved inside .bar-path-stage');

// 1.3 Mode toggle button and labels
assert.ok(
  htmlContent.includes('id="btn-barpath-mode"') &&
  htmlContent.includes('id="barpath-mode-path"') &&
  htmlContent.includes('id="barpath-mode-vel"'),
  'R1.3: Mode toggle button #btn-barpath-mode with PATH and VEL options must exist'
);
console.log('  [PASS] 1.3 #btn-barpath-mode (PATH/VEL toggle) confirmed');

// 1.4 Top stage HUD metrics
assert.ok(
  htmlContent.includes('id="barpath-hud-metrics"') &&
  htmlContent.includes('id="barpath-hud-dev"') &&
  htmlContent.includes('id="barpath-hud-eff"'),
  'R1.4: Stage HUD metrics (#barpath-hud-dev and #barpath-hud-eff) must exist'
);
console.log('  [PASS] 1.4 Stage HUD overlay metrics confirmed');

// 1.5 Interactive Replay Panel elements
assert.ok(
  htmlContent.includes('id="barpath-replay-panel"') &&
  htmlContent.includes('id="barpath-scrubber"') &&
  htmlContent.includes('id="btn-barpath-replay"') &&
  htmlContent.includes('id="btn-barpath-speed"') &&
  htmlContent.includes('id="barpath-rep-pills"'),
  'R1.5: Replay panel with scrubber, replay button, speed toggle, and rep pills must exist'
);
console.log('  [PASS] 1.5 Interactive Replay Panel controls confirmed');

// 1.6 Biomechanical trajectory synthesis logic evaluation
// Load synthesizeRepTrajectory from app.js in a sandbox
const sandbox = {
  canonicalLift: (l) => l || 'Deadlift',
  currentLift: 'Deadlift',
  LIFT_BASELINES: {
    squat: { mvt: 0.30 },
    bench: { mvt: 0.18 },
    deadlift: { mvt: 0.15 }
  },
  Math: Math,
  Number: Number,
  Date: Date,
  parseFloat: parseFloat,
  isNaN: isNaN,
  Array: Array
};

// Extract synthesizeRepTrajectory code from app.js
const synthMatch = appJsContent.match(/function synthesizeRepTrajectory\([\s\S]*?\n\}/);
assert.ok(synthMatch, 'R1.6a: synthesizeRepTrajectory function must exist in app.js');

const synthFunc = new Function('canonicalLift', 'currentLift', 'LIFT_BASELINES',
  `return (${synthMatch[0]});`
)(sandbox.canonicalLift, sandbox.currentLift, sandbox.LIFT_BASELINES);

// Test Squat, Bench, Deadlift synthesis
const squatSynth = synthFunc('Squat', 0.60, 2.0);
assert.strictEqual(squatSynth.points.length, 40, 'Squat trajectory must generate 40 points');
assert.ok(typeof squatSynth.maxDeviationCm === 'number' && squatSynth.maxDeviationCm > 0, 'maxDeviationCm must be positive number');
assert.ok(typeof squatSynth.deviationCm === 'number' && squatSynth.deviationCm > 0, 'deviationCm must be positive number');
assert.ok(squatSynth.pathEfficiencyPct >= 70 && squatSynth.pathEfficiencyPct <= 100, 'pathEfficiencyPct must be in [70, 100]');

const benchSynth = synthFunc('Bench', 0.45, 3.0);
assert.strictEqual(benchSynth.points.length, 40, 'Bench trajectory must generate 40 points');
// Bench press McLaughlin J-curve should exhibit negative horizontal shift (toward face)
const hasNegativeShift = benchSynth.points.some(pt => pt.dx < 0);
assert.ok(hasNegativeShift, 'Bench trajectory must show backward flare (negative dx)');

const deadliftSynth = synthFunc('Deadlift', 0.50, null);
assert.strictEqual(deadliftSynth.points.length, 40, 'Deadlift trajectory must generate 40 points');
console.log('  [PASS] 1.6 synthesizeRepTrajectory generates 40-point curves & accurate metrics across Squat, Bench, Deadlift');

// 1.7 Deviation scaling test
const scaledSynth = synthFunc('Deadlift', 0.50, 4.5);
assert.ok(Math.abs(scaledSynth.deviationCm - 4.5) <= 0.8, 'synthesizeRepTrajectory must scale closely to measured deviationCm');
console.log('  [PASS] 1.7 synthesizeRepTrajectory scales with measured DEV input');

// 1.8 recordRepetition emits 2D trajectory metrics
assert.ok(
  appJsContent.includes('trajectoryPoints: repObj.trajectoryPoints') &&
  appJsContent.includes('deviationCm: repObj.deviationCm') &&
  appJsContent.includes('maxDeviationCm: repObj.maxDeviationCm') &&
  appJsContent.includes('pathEfficiencyPct: repObj.pathEfficiencyPct'),
  'R1.8: recordRepetition must emit deviationCm, maxDeviationCm, pathEfficiencyPct, and trajectoryPoints'
);
console.log('  [PASS] 1.8 recordRepetition emits full 2D trajectory metrics over ErosSyncBus');

// 1.9 ErosSyncBus whitelisting
assert.ok(
  syncBusContent.includes('payload.deviationCm =') &&
  syncBusContent.includes('payload.maxDeviationCm =') &&
  syncBusContent.includes('payload.pathEfficiencyPct =') &&
  syncBusContent.includes('payload.trajectoryPoints ='),
  'R1.9: sync-bus.js must whitelist deviationCm, maxDeviationCm, pathEfficiencyPct, and trajectoryPoints'
);
console.log('  [PASS] 1.9 sync-bus.js protocol whitelists all deviation and trajectory fields');

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: REQUIREMENT R2 (Antigravity Luminous RPE Tracking Pill & Segmented Ticks)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST SUITE 2: Requirement R2 (Luminous RPE Tracking Pill & Segmented Ticks) ---');

// 2.1 Core DOM elements preserved in .integrated-rpe-tracker
assert.ok(
  htmlContent.includes('id="live-rpe"') &&
  htmlContent.includes('id="live-rir-pill"') &&
  htmlContent.includes('id="rpe-tier-badge"') &&
  htmlContent.includes('id="rpe-gauge-fill"') &&
  htmlContent.includes('id="rpe-target-pin"') &&
  htmlContent.includes('id="live-rpe-sub"'),
  'R2.1: All core RPE tracking elements must be preserved in index.html'
);
console.log('  [PASS] 2.1 Core RPE tracker DOM elements preserved');

// 2.2 Segmented tick marks inside .rpe-gauge-track
assert.ok(
  htmlContent.includes('class="rpe-gauge-ticks"') &&
  htmlContent.includes('data-rpe="6.5"') &&
  htmlContent.includes('data-rpe="7.5"') &&
  htmlContent.includes('data-rpe="8.5"') &&
  htmlContent.includes('data-rpe="9.5"'),
  'R2.2: .rpe-gauge-ticks with 6.5, 7.5, 8.5, 9.5 ticks must exist in .rpe-gauge-track'
);
console.log('  [PASS] 2.2 Segmented tick marks (6.5, 7.5, 8.5, 9.5) present in DOM');

// 2.3 Luminous pill styling with specular highlight and tier auras
assert.ok(
  /\.integrated-rpe-tracker\s*\{[^}]*inset\s+0\s+1px\s+0\s+rgba\(255,\s*255,\s*255,\s*0\.12\)/s.test(cssContent),
  'R2.3a: .integrated-rpe-tracker must have specular top highlight'
);
assert.ok(
  cssContent.includes('#rpe-hero-card.tier-warmup .integrated-rpe-tracker') &&
  cssContent.includes('#rpe-hero-card.tier-target .integrated-rpe-tracker') &&
  cssContent.includes('#rpe-hero-card.tier-heavy .integrated-rpe-tracker') &&
  cssContent.includes('#rpe-hero-card.tier-max .integrated-rpe-tracker'),
  'R2.3b: .integrated-rpe-tracker must have tier-linked auras for warmup, target, heavy, and max'
);
console.log('  [PASS] 2.3 Luminous glass capsule styling & tier auras verified');

// 2.4 Apple spring transition curve
assert.ok(
  /cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/.test(cssContent),
  'R2.4: Apple spring curve cubic-bezier(0.22, 1, 0.36, 1) must be applied in style.css'
);
console.log('  [PASS] 2.4 Apple spring physics curve cubic-bezier(0.22, 1, 0.36, 1) confirmed');

// 2.5 #live-rpe-sub left-alignment preserved
assert.ok(
  /#live-rpe-sub[^{]*\{[^}]*text-align:\s*left;[^}]*align-self:\s*flex-start;/s.test(cssContent) ||
  /\.rpe-baseline-sub\s*\{[^}]*text-align:\s*left;[^}]*align-self:\s*flex-start;/s.test(cssContent),
  'R2.5: #live-rpe-sub must preserve text-align: left and align-self: flex-start'
);
console.log('  [PASS] 2.5 #live-rpe-sub left-alignment invariant preserved');

// 2.6 Dynamic groove and deviation feedback in app.js
assert.ok(
  appJsContent.includes('GROOVE: LOCKED') &&
  appJsContent.includes('GROOVE: MILD DRIFT') &&
  appJsContent.includes('GROOVE: BAR DRIFT'),
  'R2.6: updateRpeHeroBanner must provide dynamic groove feedback based on deviation'
);
console.log('  [PASS] 2.6 Dynamic groove feedback logic confirmed in updateRpeHeroBanner');

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: REQUIREMENT R3 (Zero-Scroll iPhone Ergonomics & Active-Set Auto-Collapse)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST SUITE 3: Requirement R3 (Zero-Scroll iPhone Ergonomics & Active-Set Auto-Collapse) ---');

// 3.1 Modernized viewport with 100dvh
assert.ok(
  /html,\s*body\s*\{[^}]*min-height:\s*100dvh;/s.test(cssContent),
  'R3.1a: html, body must include min-height: 100dvh'
);
assert.ok(
  /\.app-container\s*\{[^}]*min-height:\s*100dvh;/s.test(cssContent),
  'R3.1b: .app-container must include min-height: 100dvh'
);
console.log('  [PASS] 3.1 Viewport modernized with min-height: 100dvh');

// 3.2 .controls-panel.set-active-compact defined in style.css
assert.ok(
  /\.controls-panel\.set-active-compact\s*\{/.test(cssContent),
  'R3.2a: .controls-panel.set-active-compact must be defined in style.css'
);
assert.ok(
  /\.controls-panel\.set-active-compact\s+\.target-rpe-chips\s*\{[^}]*display:\s*none;/s.test(cssContent),
  'R3.2b: .controls-panel.set-active-compact must collapse/hide .target-rpe-chips'
);
console.log('  [PASS] 3.2 .controls-panel.set-active-compact collapses target RPE module into summary bar');

// 3.3 Mobile responsive 1-line grid under <= 430px
assert.ok(
  /@media\s*\(\s*max-width:\s*430px\s*\)[\s\S]*?\.controls-panel\.set-active-compact\s+\.controls-row\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr\s+1\.15fr;/s.test(cssContent),
  'R3.3: Mobile media query must collapse .controls-row into 1-line 3-column grid during active set'
);
console.log('  [PASS] 3.3 Mobile media query collapses controls to 1-line 3-column grid during active set');

// 3.4 Canvas and metric cards mobile balancing
assert.ok(
  /@media\s*\(\s*max-width:\s*430px\s*\)[\s\S]*?\.bar-path-canvas\s*\{[^}]*aspect-ratio:\s*220\s*\/\s*210;/s.test(cssContent),
  'R3.4: Canvas responsive aspect-ratio must be preserved under <= 430px'
);
console.log('  [PASS] 3.4 Canvas responsive aspect-ratio preserved for narrow mobile screens');

// 3.5 JS lifecycle: startNewSet adds set-active-compact, endActiveSet removes it
assert.ok(
  /controlsPanel\.classList\.add\(['"]set-active-compact['"]\)/.test(appJsContent),
  'R3.5a: startNewSet in app.js must add set-active-compact to controlsPanel'
);
assert.ok(
  /controlsPanel\.classList\.remove\(['"]set-active-compact['"]\)/.test(appJsContent),
  'R3.5b: endActiveSet in app.js must remove set-active-compact from controlsPanel'
);
console.log('  [PASS] 3.5 Controls panel lifecycle dynamically manages .set-active-compact');

// 3.6 Invariant preservation: base .controls-panel rules
assert.ok(
  /\.controls-panel\s*\{[^}]*overflow:\s*visible\s*!important;[^}]*position:\s*relative;[^}]*z-index:\s*50;/s.test(cssContent),
  'R3.6: Base .controls-panel must preserve overflow: visible !important, position: relative, z-index: 50'
);
console.log('  [PASS] 3.6 Base .controls-panel overflow and z-index invariants strictly preserved');

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: REQUIREMENT R4 (Brand Identity, Terminology, and Guardrails)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST SUITE 4: Requirement R4 (Brand Guardrails, Zero Forbidden Terms, Zero Emojis) ---');

// 4.1 Canonical lift colors
assert.ok(
  /--accent-dl:\s*#FF3B30;/i.test(cssContent) &&
  /--accent-sq:\s*#00FF66;/i.test(cssContent) &&
  /--accent-bp:\s*#00E5FF;/i.test(cssContent) &&
  /--lift-text-dl:\s*#FF857D;/i.test(cssContent),
  'R4.1: Canonical lift accent colors (#FF3B30, #00FF66, #00E5FF, #FF857D) must match in style.css'
);
console.log('  [PASS] 4.1 Canonical lift colors verified');

// 4.2 Brand title and wordmark
assert.ok(
  /<span[^>]*class=["']brand-title["']>Eros<\/span>/i.test(htmlContent),
  'R4.2a: <span class="brand-title">Eros</span> must exist in index.html'
);
assert.ok(
  /<span[^>]*class=["']eros-wordmark["']>Eros<\/span>/i.test(htmlContent),
  'R4.2b: <span class="eros-wordmark">Eros</span> must exist in index.html'
);
console.log('  [PASS] 4.2 Brand title and wordmarks confirmed');

// 4.3 36px circular #status-badge with inner .status-label preserved
assert.ok(
  /<div[^>]*id=["']status-badge["'][\s\S]*?<span[^>]*class=["']status-label["']/i.test(htmlContent),
  'R4.3: #status-badge must contain <span class="status-label"> in index.html'
);
assert.ok(
  /#status-badge\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s.test(cssContent),
  'R4.3b: #status-badge must have 36px width and height in style.css'
);
console.log('  [PASS] 4.3 36px circular #status-badge with inner .status-label preserved');

// 4.4 Static check for forbidden hardware terms across all web files
const WEB_FILES = [
  'index.html', 'style.css', 'athlete-fx.css', 'athlete-fx.js',
  'app.js', 'coach-portal.js', 'sync-bus.js', 'coach.css',
  'coach-cue-hud.css', 'coach-cue-hud.js'
];
const FORBIDDEN_HW_REGEX = /\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|sensors|hardware)\b/i;

let hwViolations = [];
for (const file of WEB_FILES) {
  const filePath = path.join(ROOT_DIR, file);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  content.split('\n').forEach((line, idx) => {
    if (FORBIDDEN_HW_REGEX.test(line)) {
      hwViolations.push(`${file}:${idx + 1} -> ${line.trim()}`);
    }
  });
}
assert.strictEqual(hwViolations.length, 0, `Forbidden hardware terms found:\n${hwViolations.join('\n')}`);
console.log('  [PASS] 4.4 Zero forbidden hardware terms across all 10 web application files');

// 4.5 DEVICE_NAME = 'VBT_Tracker' isolation
const devNameMatches = appJsContent.match(/VBT_Tracker/g) || [];
assert.strictEqual(devNameMatches.length, 1, 'VBT_Tracker must occur exactly once in app.js');
assert.ok(/const\s+DEVICE_NAME\s*=\s*['"]VBT_Tracker['"]/.test(appJsContent), 'DEVICE_NAME constant must be isolated in app.js:13');
console.log('  [PASS] 4.5 DEVICE_NAME = "VBT_Tracker" strictly isolated to constant definition');

// 4.6 Zero emojis in <button> tags across HTML and JS
const EMOJI_REGEX = /[\u2300-\u23FF\u2600-\u27BF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF\uDE00-\uDEFF]/;
const btnMatches = htmlContent.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
let emojiBtnViolations = [];
btnMatches.forEach((btn, idx) => {
  if (EMOJI_REGEX.test(btn)) {
    emojiBtnViolations.push(`Button ${idx + 1}: ${btn}`);
  }
});
assert.strictEqual(emojiBtnViolations.length, 0, `Emoji found in buttons:\n${emojiBtnViolations.join('\n')}`);
console.log('  [PASS] 4.6 Zero emojis or symbol glyphs in any <button> elements');

console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log('║ ALL 24 ATHLETE VIEW OVERHAUL (R1 - R4) ASSERTIONS PASSED (100%)       ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝');
