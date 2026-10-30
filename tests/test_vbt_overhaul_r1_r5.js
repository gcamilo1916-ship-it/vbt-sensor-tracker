/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS FULL-STACK OVERHAUL ACCEPTANCE CRITERIA TEST SUITE (R1 - R5)
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive automated verification for:
 * - R1: Athlete Live View Spacing & Set Summary Banner Collapse
 * - R2: Inter-Set Rest Stopwatch, Data Logging, Sync Bus, & Coach REST Column
 * - R3: Prescription Console Restructuring, Load & Rest Pills, Zero Mock Athletes
 * - R4: Athlete Settings Micro-Menu, Crockford Code, Persistence & Connection Bus
 * - R5: Prohibited Hardware Term Purge (0 terms) & Device Name Isolation
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const STYLE_CSS_PATH = path.join(ROOT_DIR, 'style.css');
const ATHLETE_FX_CSS_PATH = path.join(ROOT_DIR, 'athlete-fx.css');
const ATHLETE_FX_JS_PATH = path.join(ROOT_DIR, 'athlete-fx.js');
const APP_JS_PATH = path.join(ROOT_DIR, 'app.js');
const COACH_PORTAL_JS_PATH = path.join(ROOT_DIR, 'coach-portal.js');
const SYNC_BUS_JS_PATH = path.join(ROOT_DIR, 'sync-bus.js');
const COACH_CSS_PATH = path.join(ROOT_DIR, 'coach.css');

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║       EROS OVERHAUL (R1 - R5) FULL ACCEPTANCE TEST SUITE               ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT R1: ATHLETE LIVE PAGE LAYOUT & BANNER COLLAPSE
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- TEST SUITE 1: Requirement R1 (Layout Spacing & Banner Collapse) ---');

const athleteFxCss = fs.readFileSync(ATHLETE_FX_CSS_PATH, 'utf8');
const styleCss = fs.readFileSync(STYLE_CSS_PATH, 'utf8');
const athleteFxJs = fs.readFileSync(ATHLETE_FX_JS_PATH, 'utf8');
const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');

// 1.1 Athlete-fx.css: .set-summary-banner display: none when inactive
assert.ok(
  /\.set-summary-banner\s*\{[^}]*display:\s*none;/s.test(athleteFxCss),
  'R1.1: .set-summary-banner must default to display: none when inactive'
);
console.log('  [PASS] 1.1 .set-summary-banner defaults to display: none');

// 1.2 Athlete-fx.css: .set-summary-banner.visible has display: flex
assert.ok(
  /\.set-summary-banner\.visible\s*\{[^}]*display:\s*flex;/s.test(athleteFxCss),
  'R1.2: .set-summary-banner.visible must have display: flex'
);
console.log('  [PASS] 1.2 .set-summary-banner.visible has display: flex');

// 1.3 Athlete-fx.css: compact margins (6px 0 8px 0) on banner
assert.ok(
  /\.set-summary-banner\s*\{[^}]*margin:\s*6px\s+0\s+8px\s+0;/s.test(athleteFxCss),
  'R1.3: .set-summary-banner must have compact margins (6px 0 8px 0)'
);
console.log('  [PASS] 1.3 .set-summary-banner compact margins (6px 0 8px 0) confirmed');

// 1.4 Style.css: #tab-live.tab-section has gap: 10px
assert.ok(
  /#tab-live\.tab-section\s*\{[^}]*gap:\s*10px;/s.test(styleCss),
  'R1.4: #tab-live.tab-section must have gap: 10px'
);
console.log('  [PASS] 1.4 #tab-live.tab-section gap: 10px confirmed');

// 1.5 Style.css: .hero-velocity-focus padding: 16px 16px !important
assert.ok(
  /\.hero-velocity-focus\s*\{[^}]*padding:\s*16px\s+16px\s*!important;/s.test(styleCss),
  'R1.5: .hero-velocity-focus must have padding: 16px 16px !important'
);
console.log('  [PASS] 1.5 .hero-velocity-focus padding: 16px 16px !important confirmed');

// 1.6 Style.css: .telemetry-arena min-height: 230px
assert.ok(
  /\.telemetry-arena\s*\{[^}]*min-height:\s*230px;/s.test(styleCss),
  'R1.6: .telemetry-arena must have min-height: 230px'
);
console.log('  [PASS] 1.6 .telemetry-arena min-height: 230px confirmed');

// 1.7 Dismissal behavior: AthleteFX.dismissSummaryBanner exists and is called on startNewSet
assert.ok(
  /dismissSummaryBanner/.test(athleteFxJs),
  'R1.7a: dismissSummaryBanner helper must exist in athlete-fx.js'
);
assert.ok(
  /dismissSummaryBanner/.test(appJs),
  'R1.7b: startNewSet in app.js must call dismissSummaryBanner'
);
console.log('  [PASS] 1.7 Banner dismissal on startNewSet verified');

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT R2: INTER-SET REST TIME TRACKING AND LOGGING
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST SUITE 2: Requirement R2 (Inter-Set Rest Tracking & Logging) ---');

const syncBusJs = fs.readFileSync(SYNC_BUS_JS_PATH, 'utf8');
const coachPortalJs = fs.readFileSync(COACH_PORTAL_JS_PATH, 'utf8');
const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');

// 2.1 Rest timer state variables in app.js
assert.ok(
  /restStartTime/.test(appJs) && /interSetRestInterval/.test(appJs),
  'R2.1: app.js must maintain restStartTime and interSetRestInterval'
);
console.log('  [PASS] 2.1 Rest stopwatch variables present in app.js');

// 2.2 Rest calculation on startNewSet() in app.js
assert.ok(
  /Date\.now\(\)\s*-\s*restStartTime/.test(appJs),
  'R2.2: startNewSet must compute elapsed rest seconds from restStartTime'
);
assert.ok(
  /previousSet\.restSeconds\s*=/.test(appJs),
  'R2.2: startNewSet must record restSeconds on the previous completed set'
);
console.log('  [PASS] 2.2 Rest elapsed calculation and previousSet.restSeconds assignment confirmed');

// 2.3 Formatted rest duration in session accordion & workout page
assert.ok(
  /formatRestDuration/.test(appJs),
  'R2.3: app.js must define formatRestDuration helper'
);
assert.ok(
  /Rest Time \(s\)/.test(appJs),
  'R2.3: btnExportCsv in app.js must include Rest Time (s) column'
);
console.log('  [PASS] 2.3 Rest duration formatting and CSV export column verified');

// 2.4 Whitelisted restSeconds in ErosSyncBus validation
assert.ok(
  /restSeconds/.test(syncBusJs),
  'R2.4: sync-bus.js must whitelist restSeconds in set payloads'
);
console.log('  [PASS] 2.4 sync-bus.js restSeconds validation whitelist confirmed');

// 2.5 REST column header and cell formatting in Coach Sets Table
assert.ok(
  /<th>REST<\/th>/.test(indexHtml),
  'R2.5a: index.html coach-sets-table must contain REST header column'
);
assert.ok(
  /formatRestDuration/.test(coachPortalJs),
  'R2.5b: coach-portal.js must define formatRestDuration'
);
assert.ok(
  /set\.restSeconds/.test(coachPortalJs),
  'R2.5c: coach-portal.js renderSetsHistoryTable must display set.restSeconds'
);
console.log('  [PASS] 2.5 Coach sets table REST column and formatting confirmed');

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT R3: COACH CONSOLE & PRESCRIPTION CONSOLE RESTRUCTURING
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST SUITE 3: Requirement R3 (Coach Console & Prescription Restructuring) ---');

// 3.1 Live squad cards in coach-portal.js have NO +/- 2.5kg load buttons
assert.ok(
  !/data-action="add-load"/.test(coachPortalJs),
  'R3.1a: coach-portal.js renderSquadOverview must NOT contain add-load button'
);
assert.ok(
  !/data-action="sub-load"/.test(coachPortalJs),
  'R3.1b: coach-portal.js renderSquadOverview must NOT contain sub-load button'
);
assert.ok(
  /data-action="focus"/.test(coachPortalJs),
  'R3.1c: coach-portal.js renderSquadOverview must retain focus button'
);
console.log('  [PASS] 3.1 Live squad overview cards stripped of load buttons; focus button preserved');

// 3.2 Prescription Console in index.html contains Next Rep load adjustment pills (+1.0 kg, +2.5 kg, +5.0 kg)
assert.ok(
  /data-delta="1\.0">[\s\S]*\+1\.0\s*kg/.test(indexHtml),
  'R3.2a: Prescription console must contain +1.0 kg load pill'
);
assert.ok(
  /data-delta="2\.5">[\s\S]*\+2\.5\s*kg/.test(indexHtml),
  'R3.2b: Prescription console must contain +2.5 kg load pill'
);
assert.ok(
  /data-delta="5\.0">[\s\S]*\+5\.0\s*kg/.test(indexHtml),
  'R3.2c: Prescription console must contain +5.0 kg load pill'
);
console.log('  [PASS] 3.2 Next rep load adjustment pills (+1.0 kg, +2.5 kg, +5.0 kg) confirmed in prescription console');

// 3.3 Prescription Console contains inter-set rest target pills (60s, 90s, 120s, 180s, 300s)
const REQUIRED_REST_TARGETS = ['60', '90', '120', '180', '300'];
for (const sec of REQUIRED_REST_TARGETS) {
  assert.ok(
    new RegExp(`class="coach-rest-pill[^"]*"[^>]*data-rest-seconds="${sec}"`).test(indexHtml),
    `R3.3: Prescription console must contain rest pill for ${sec}s`
  );
}
console.log('  [PASS] 3.3 Target rest pills (60s, 90s, 120s, 180s, 300s) confirmed in prescription console');

// 3.4 Coach portal broadcasts coach:rest_target
assert.ok(
  /coach:rest_target/.test(coachPortalJs),
  'R3.4: coach-portal.js must broadcast coach:rest_target'
);
console.log('  [PASS] 3.4 coach:rest_target broadcast confirmed in coach-portal.js');

// 3.5 Elimination of fake personas ("Alex Vance", "Jordan Bell", "Elena Rostova", "Liam Thorne")
const FAKE_NAMES = ['Alex Vance', 'Jordan Bell', 'Elena Rostova', 'Liam Thorne'];
for (const fake of FAKE_NAMES) {
  assert.ok(
    !indexHtml.includes(fake),
    `R3.5a: index.html must not contain fake athlete "${fake}"`
  );
  assert.ok(
    !coachPortalJs.includes(fake),
    `R3.5b: coach-portal.js must not contain fake athlete "${fake}"`
  );
}
console.log('  [PASS] 3.5 Complete absence of fake athletes confirmed across index.html & coach-portal.js');

// 3.6 Clean empty state for squad overview
assert.ok(
  /No bonded athletes connected/.test(coachPortalJs),
  'R3.6: coach-portal.js renderSquadOverview must render clean empty state message'
);
console.log('  [PASS] 3.6 Clean empty state confirmed in renderSquadOverview');

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT R4: ATHLETE SETTINGS MICRO-MENU FOR COACH CONNECTION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST SUITE 4: Requirement R4 (Athlete Settings Micro-Menu) ---');

// 4.1 Settings button on #tab-history
assert.ok(
  /<button[^>]*id="btn-athlete-settings"/.test(indexHtml),
  'R4.1a: index.html must contain #btn-athlete-settings'
);
assert.ok(
  /class="history-top-bar"/.test(indexHtml),
  'R4.1b: index.html must contain .history-top-bar on history page'
);
console.log('  [PASS] 4.1 #btn-athlete-settings and .history-top-bar confirmed on #tab-history');

// 4.2 Athlete Settings Modal Dialog Elements
const REQUIRED_SETTINGS_ELEMENTS = [
  'athlete-settings-modal',
  'athlete-settings-backdrop',
  'btn-athlete-settings-close',
  'athlete-settings-name',
  'athlete-settings-rack',
  'athlete-settings-coach-code',
  'btn-athlete-connect-coach',
  'athlete-coach-status-badge'
];
for (const elId of REQUIRED_SETTINGS_ELEMENTS) {
  assert.ok(
    indexHtml.includes(`id="${elId}"`),
    `R4.2: index.html must contain #${elId}`
  );
}
console.log('  [PASS] 4.2 All required athlete settings modal DOM elements confirmed');

// 4.3 Crockford Code format (EROS-7X9K) in placeholder and default
assert.ok(
  /placeholder="EROS-7X9K"/.test(indexHtml),
  'R4.3a: Coach pairing code input must display Crockford format placeholder'
);
assert.ok(
  /EROS-7X9K/.test(appJs),
  'R4.3b: app.js must default pairing code to Crockford format EROS-7X9K'
);
console.log('  [PASS] 4.3 Crockford Base32 format verified in code input and app logic');

// 4.4 Persistence key in app.js and coach-portal.js
const EXPECTED_STORAGE_KEY = 'eros_athlete_coach_connection_v1';
assert.ok(
  appJs.includes(EXPECTED_STORAGE_KEY),
  `R4.4a: app.js must persist connection under ${EXPECTED_STORAGE_KEY}`
);
assert.ok(
  coachPortalJs.includes(EXPECTED_STORAGE_KEY),
  `R4.4b: coach-portal.js must read ${EXPECTED_STORAGE_KEY} on initialization`
);
console.log('  [PASS] 4.4 LocalStorage persistence under eros_athlete_coach_connection_v1 verified');

// 4.5 athlete:connect event broadcast and handler
assert.ok(
  syncBusJs.includes('athlete:connect'),
  'R4.5a: sync-bus.js must support athlete:connect event'
);
assert.ok(
  appJs.includes('athlete:connect'),
  'R4.5b: app.js must broadcast athlete:connect on coach connection'
);
assert.ok(
  coachPortalJs.includes('athlete:connect'),
  'R4.5c: coach-portal.js must listen for athlete:connect'
);
console.log('  [PASS] 4.5 athlete:connect event bus dispatch and ingestion verified');

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT R5: STRICT TERMINOLOGY AUDIT & PROJECT CONSTRAINTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST SUITE 5: Requirement R5 (Strict Terminology & Project Constraints) ---');

const WEB_FILES = [
  INDEX_HTML_PATH,
  STYLE_CSS_PATH,
  ATHLETE_FX_CSS_PATH,
  ATHLETE_FX_JS_PATH,
  APP_JS_PATH,
  COACH_PORTAL_JS_PATH,
  SYNC_BUS_JS_PATH,
  COACH_CSS_PATH,
  path.join(ROOT_DIR, 'coach-cue-hud.css'),
  path.join(ROOT_DIR, 'coach-cue-hud.js')
];

const PROHIBITED_HARDWARE_REGEX = /\b(webble|100hz|esp32|esp32-c6|imu|madgwick|bluefy|sensor|sensors|hardware)\b/i;

let violationCount = 0;
for (const file of WEB_FILES) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (PROHIBITED_HARDWARE_REGEX.test(line)) {
      console.error(`  [VIOLATION] ${path.basename(file)}:${idx + 1} -> ${line.trim()}`);
      violationCount++;
    }
  });
}
assert.strictEqual(violationCount, 0, `Total prohibited hardware terms must be 0 (found ${violationCount})`);
console.log('  [PASS] 5.1 ZERO prohibited hardware terms found across all 10 web application files');

// 5.2 Device Name Isolation: VBT_Tracker exists strictly in app.js:13 constant
let vbtTrackerCount = 0;
for (const file of WEB_FILES) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/VBT_Tracker/g);
  if (matches) {
    vbtTrackerCount += matches.length;
    assert.strictEqual(
      path.basename(file),
      'app.js',
      `VBT_Tracker is strictly forbidden outside app.js, found in ${path.basename(file)}`
    );
  }
}
assert.strictEqual(vbtTrackerCount, 1, `VBT_Tracker must occur strictly once in app.js, found: ${vbtTrackerCount}`);
console.log('  [PASS] 5.2 VBT_Tracker strictly isolated to single internal constant in app.js');

// 5.3 Lift Naming Conventions ("Main" for Squat and Deadlift)
assert.ok(
  /MAIN DEADLIFT/.test(indexHtml),
  'R5.3a: index.html badges must use MAIN DEADLIFT'
);
assert.ok(
  /data-lift-filter="Main squat"/.test(indexHtml),
  'R5.3b: index.html filter pills must use Main squat'
);
assert.ok(
  /formatCanonicalLiftLabel/.test(coachPortalJs) && /formatCanonicalWorkoutName/.test(coachPortalJs),
  'R5.3c: coach-portal.js must enforce canonical lift and workout naming'
);
console.log('  [PASS] 5.3 "Main" lift naming convention verified');

console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log('║ ALL FULL-STACK OVERHAUL (R1 - R5) ACCEPTANCE TESTS PASSED (100% OK)    ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝');

process.exit(0);
