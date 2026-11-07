/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS BASE44 REALTIME CLOUD BRIDGE & ACTOR INTEGRATION TEST SUITE
 * File: tests/test_base44_cloud_bridge.js
 * 
 * Validates:
 *   1. CompletedSet and CoachDirective entity schemas match Base44 requirements
 *   2. SquadSession Actor message protocol & payload structure
 *   3. ErosSyncBus cloud bridge connection, subscription, and broadcasting
 *   4. Cross-client bidirectional streaming: Athlete -> Cloud -> Coach
 *   5. Loopback echo prevention and fault-isolated offline-first resilience
 *   6. Strict R4/R5 terminology compliance across all Base44 artifacts
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const SYNC_BUS_PATH = path.join(ROOT_DIR, 'sync-bus.js');
const COMPLETED_SET_SCHEMA_PATH = path.join(ROOT_DIR, 'base44', 'entities', 'completed-set.jsonc');
const COACH_DIRECTIVE_SCHEMA_PATH = path.join(ROOT_DIR, 'base44', 'entities', 'coach-directive.jsonc');
const SQUAD_SESSION_ACTOR_PATH = path.join(ROOT_DIR, 'base44', 'actors', 'SquadSession', 'entry.ts');

const { ErosEventBus, ErosSyncBus, EVENTS } = require(SYNC_BUS_PATH);

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║       EROS BASE44 CLOUD BRIDGE & REALTIME ACTOR TEST HARNESS           ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    if (err.stack) console.error(`         ${err.stack.split('\n').slice(1, 3).join('\n')}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    if (err.stack) console.error(`         ${err.stack.split('\n').slice(1, 3).join('\n')}`);
  }
}

// ── Mock Base44 Realtime Actor Cloud Room ──
function createMockBase44Client() {
  const rooms = new Map();

  return {
    actors: {
      SquadSession: (roomId) => {
        const normalizedId = String(roomId).trim().toUpperCase();
        if (!rooms.has(normalizedId)) {
          rooms.set(normalizedId, {
            subscribers: new Set(),
            sentMessages: []
          });
        }
        const roomState = rooms.get(normalizedId);

        return {
          connect: () => {
            let currentCallback = null;
            const connection = {
              subscribe: (callback) => {
                currentCallback = callback;
                roomState.subscribers.add(callback);
                return {
                  unsubscribe: () => {
                    roomState.subscribers.delete(callback);
                  }
                };
              },
              send: (msg) => {
                roomState.sentMessages.push(msg);
                // Broadcast to all connected subscribers in the room
                for (const sub of roomState.subscribers) {
                  try {
                    sub(msg);
                  } catch (_) {}
                }
              },
              close: () => {
                if (currentCallback) {
                  roomState.subscribers.delete(currentCallback);
                }
              }
            };
            return connection;
          }
        };
      }
    },
    _getRoomState: (roomId) => rooms.get(String(roomId).trim().toUpperCase())
  };
}

(async function executeAllTests() {
  console.log('\n--- SUITE 1: Base44 Entity Schemas Integrity ---');

  runTest('1.1 CompletedSet entity schema existence and required fields', () => {
    assert.ok(fs.existsSync(COMPLETED_SET_SCHEMA_PATH), 'completed-set.jsonc must exist in base44/entities/');
    const raw = fs.readFileSync(COMPLETED_SET_SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(raw);

    assert.strictEqual(schema.name, 'CompletedSet');
    assert.strictEqual(schema.type, 'object');
    assert.ok(schema.properties.set_id, 'set_id property must exist');
    assert.ok(schema.properties.pairing_code, 'pairing_code property must exist');
    assert.ok(schema.properties.athlete_id, 'athlete_id property must exist');
    assert.ok(schema.properties.athlete_name, 'athlete_name property must exist');
    assert.ok(schema.properties.set_number, 'set_number property must exist');
    assert.ok(schema.properties.lift, 'lift property must exist');
    assert.ok(schema.properties.weight, 'weight property must exist');
    assert.ok(schema.properties.avg_velocity, 'avg_velocity property must exist');
    assert.ok(schema.properties.max_velocity, 'max_velocity property must exist');
    assert.ok(schema.properties.velocity_loss, 'velocity_loss property must exist');
    assert.ok(schema.properties.avg_rpe, 'avg_rpe property must exist');
    assert.ok(schema.properties.target_rpe, 'target_rpe property must exist');
    assert.ok(schema.properties.rest_seconds, 'rest_seconds property must exist');
    assert.ok(schema.properties.max_deviation_cm, 'max_deviation_cm property must exist');
    assert.ok(schema.properties.path_efficiency_pct, 'path_efficiency_pct property must exist');
    assert.ok(schema.properties.reps_json, 'reps_json property must exist');
    assert.ok(schema.properties.trajectory_points_json, 'trajectory_points_json property must exist');
    assert.ok(schema.properties.completed_at, 'completed_at property must exist');
  });

  runTest('1.2 CoachDirective entity schema existence and required fields', () => {
    assert.ok(fs.existsSync(COACH_DIRECTIVE_SCHEMA_PATH), 'coach-directive.jsonc must exist in base44/entities/');
    const raw = fs.readFileSync(COACH_DIRECTIVE_SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(raw);

    assert.strictEqual(schema.name, 'CoachDirective');
    assert.strictEqual(schema.type, 'object');
    assert.ok(schema.properties.directive_id, 'directive_id property must exist');
    assert.ok(schema.properties.pairing_code, 'pairing_code property must exist');
    assert.ok(schema.properties.athlete_id, 'athlete_id property must exist');
    assert.ok(schema.properties.directive_type, 'directive_type property must exist');
    assert.ok(schema.properties.delta_kg, 'delta_kg property must exist');
    assert.ok(schema.properties.prescribed_weight_kg, 'prescribed_weight_kg property must exist');
    assert.ok(schema.properties.target_rest_seconds, 'target_rest_seconds property must exist');
    assert.ok(schema.properties.cue_text, 'cue_text property must exist');
  });

  console.log('\n--- SUITE 2: SquadSession Realtime Actor Integrity ---');

  runTest('2.1 SquadSession entry.ts existence and class export', () => {
    assert.ok(fs.existsSync(SQUAD_SESSION_ACTOR_PATH), 'entry.ts must exist in base44/actors/SquadSession/');
    const content = fs.readFileSync(SQUAD_SESSION_ACTOR_PATH, 'utf8');

    assert.ok(content.includes('import { Actor } from "base44:runtime/actors"'), 'Must import Actor base class');
    assert.ok(content.includes('export default class SquadSession extends Actor'), 'Must export SquadSession class');
    assert.ok(content.includes('handleConnect'), 'Must implement handleConnect');
    assert.ok(content.includes('handleMessage'), 'Must implement handleMessage');
    assert.ok(content.includes('handleClose'), 'Must implement handleClose');
    assert.ok(content.includes('handleTick()'), 'Must implement handleTick');
    assert.ok(content.includes('this.broadcast('), 'Must broadcast validated messages');
  });

  console.log('\n--- SUITE 3: ErosSyncBus Cloud Bridge Contract ---');

  runTest('3.1 ErosSyncBus connects to mock Base44 SquadSession actor', () => {
    const mockClient = createMockBase44Client();
    const bus = new ErosEventBus({ busId: 'test_athlete_bus_1' });

    const connected = bus.connectCloud('EROS-TEST', mockClient);
    assert.strictEqual(connected, true, 'connectCloud should succeed with valid client and pairing code');
    assert.strictEqual(bus.cloudPairingCode, 'EROS-TEST');
    assert.ok(bus.cloudRoom, 'cloudRoom instance must be initialized');
    assert.ok(bus.cloudSub, 'cloudSub instance must be initialized');

    bus.destroy();
  });

  await runAsyncTest('3.2 Athlete rep:recorded streams live deviationCm & trajectoryPoints to Cloud', async () => {
    const mockClient = createMockBase44Client();
    const athleteBus = new ErosEventBus({ busId: 'athlete_bus_phone' });
    athleteBus.connectCloud('EROS-9999', mockClient);

    const trajectory = [
      { x: 0.1, y: 10.0, t: 100 },
      { x: -0.4, y: 35.0, t: 250 },
      { x: 0.0, y: 55.0, t: 400 }
    ];

    athleteBus.emit('rep:recorded', {
      setId: 'set_live_01',
      repNumber: 1,
      velocity: 0.82,
      peakVelocity: 0.95,
      rom: 54.2,
      rpe: 7.0,
      lossPercent: 0.0,
      deviationCm: -0.4,
      trajectoryPoints: trajectory
    });

    const roomState = mockClient._getRoomState('EROS-9999');
    assert.ok(roomState, 'Room EROS-9999 must exist');
    assert.strictEqual(roomState.sentMessages.length, 1, 'Exactly one message must be sent to cloud');

    const sent = roomState.sentMessages[0];
    assert.strictEqual(sent.type, 'rep:recorded');
    assert.strictEqual(sent.data.setId, 'set_live_01');
    assert.strictEqual(sent.data.velocity, 0.82);
    assert.strictEqual(sent.data.deviationCm, -0.4);
    assert.deepStrictEqual(sent.data.trajectoryPoints, trajectory);

    athleteBus.destroy();
  });

  await runAsyncTest('3.3 Bidirectional Cloud Streaming: Coach Directive from Laptop reaches Athlete on Phone', async () => {
    const mockClient = createMockBase44Client();
    const athleteBus = new ErosEventBus({ busId: 'athlete_iphone' });
    const coachBus = new ErosEventBus({ busId: 'coach_laptop' });

    athleteBus.connectCloud('EROS-SQUAD1', mockClient);
    coachBus.connectCloud('EROS-SQUAD1', mockClient);

    let athleteReceivedCue = null;
    let athleteReceivedOverride = null;

    athleteBus.on('coach:cue', (payload) => {
      athleteReceivedCue = payload;
    });

    athleteBus.on('coach:load_override', (payload) => {
      athleteReceivedOverride = payload;
    });

    // Coach prescribes weight increase and cue
    coachBus.emit('coach:cue', {
      id: 'cue_001',
      text: 'Drive through the midfoot and keep chest proud',
      type: 'technical',
      coachName: 'Coach Marcus',
      athleteId: 'ath_01'
    });

    coachBus.emit('coach:load_override', {
      id: 'load_001',
      deltaKg: 2.5,
      newWeight: 142.5,
      autoAcceptSeconds: 20,
      coachName: 'Coach Marcus',
      athleteId: 'ath_01'
    });

    assert.ok(athleteReceivedCue, 'Athlete must receive coach:cue over cloud bridge');
    assert.strictEqual(athleteReceivedCue.text, 'Drive through the midfoot and keep chest proud');

    assert.ok(athleteReceivedOverride, 'Athlete must receive coach:load_override over cloud bridge');
    assert.strictEqual(athleteReceivedOverride.deltaKg, 2.5);
    assert.strictEqual(athleteReceivedOverride.newWeight, 142.5);

    athleteBus.destroy();
    coachBus.destroy();
  });

  runTest('3.4 Loopback Prevention: Originator does not process its own echoed cloud packet', () => {
    const mockClient = createMockBase44Client();
    const bus = new ErosEventBus({ busId: 'isolated_sender' });
    bus.connectCloud('EROS-LOOPBACK', mockClient);

    let localDispatches = 0;
    bus.on('set:started', (p, meta) => {
      if (!meta.isOriginator) {
        localDispatches++;
      }
    });

    // Emitting set:started sends to cloud, which broadcasts to all room subs including this connection
    bus.emit('set:started', {
      setId: 'set_loop_test',
      setNumber: 1,
      lift: 'Main squat',
      weight: 120
    });

    assert.strictEqual(localDispatches, 0, 'Originator bus must filter out its own echoed packet via senderId');

    bus.destroy();
  });

  runTest('3.5 Offline-First Resilience: Cloud failure does not interrupt local synchronous events', () => {
    const brokenClient = {
      actors: {
        SquadSession: () => ({
          connect: () => ({
            subscribe: () => ({ unsubscribe: () => {} }),
            send: () => { throw new Error('Network offline: Cloud unreachable'); },
            close: () => {}
          })
        })
      }
    };

    const bus = new ErosEventBus({ busId: 'offline_bus' });
    bus.connectCloud('EROS-OFFLINE', brokenClient);

    let receivedLocally = false;
    bus.on('rep:recorded', (p) => {
      receivedLocally = true;
    });

    assert.doesNotThrow(() => {
      bus.emit('rep:recorded', {
        setId: 'set_offline',
        repNumber: 1,
        velocity: 0.75
      });
    }, 'Emit must never throw when cloud bridge transport fails');

    assert.strictEqual(receivedLocally, true, 'Local listener must execute synchronously despite cloud failure');

    bus.destroy();
  });

  console.log('\n--- SUITE 4: Terminology Audit (R4/R5 Compliance) ---');

  runTest('4.1 Zero forbidden hardware terms in Base44 files and sync-bus.js', () => {
    const filesToAudit = [
      SYNC_BUS_PATH,
      COMPLETED_SET_SCHEMA_PATH,
      COACH_DIRECTIVE_SCHEMA_PATH,
      SQUAD_SESSION_ACTOR_PATH
    ];

    const forbidden = ['webble', '100hz', 'esp32', 'esp32-c6', 'imu', 'madgwick', 'bluefy', 'sensor', 'firmware'];

    for (const filePath of filesToAudit) {
      assert.ok(fs.existsSync(filePath), `File ${filePath} must exist for audit`);
      const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
      for (const term of forbidden) {
        const matches = (content.match(new RegExp(`\\b${term}\\b`, 'g')) || []).length;
        assert.strictEqual(
          matches,
          0,
          `Forbidden string "${term}" detected ${matches} time(s) in ${path.basename(filePath)}`
        );
      }
    }
  });

  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log(`║ CLOUD BRIDGE TEST HARNESS: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests} ║`);
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  if (failedTests > 0) {
    process.exit(1);
  }
})();
