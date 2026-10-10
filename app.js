// ─────────────────────────────────────────────
//  VBT Pro – Native Prototype Logic
// ─────────────────────────────────────────────

const SERVICE_UUID            = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID     = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const CMD_CHARACTERISTIC_UUID = '5a7d3c90-951d-444a-8f5b-11c500732890';
const DEVICE_NAME             = 'VBT_Tracker';

// ── DOM refs ──
const btnConnect   = document.getElementById('btn-connect');
const btnText      = btnConnect.querySelector('.btn-text');
const liftSelect   = document.getElementById('lift-select');
const liveVelocity = document.getElementById('live-velocity');
const liveRpe      = document.getElementById('live-rpe');
const statusBadge  = document.getElementById('status-badge');
const historyList  = document.getElementById('history-list');
const orb          = document.getElementById('orb');

// ── State ──
let bleDevice          = null;
let dataCharacteristic = null;
let cmdCharacteristic  = null;
let repCounter         = 0;

// ═══════════════════════════════════════════
//  Bluetooth Connection
// ═══════════════════════════════════════════

btnConnect.addEventListener('click', async () => {
  if (bleDevice && bleDevice.gatt.connected) {
    disconnect();
    return;
  }
  await connect();
});

async function connect() {
  try {
    btnText.textContent = 'SCANNING…';
    btnConnect.disabled = true;

    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: DEVICE_NAME }],
      optionalServices: [SERVICE_UUID],
    });

    bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

    const server  = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    
    dataCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
    cmdCharacteristic  = await service.getCharacteristic(CMD_CHARACTERISTIC_UUID);

    await dataCharacteristic.startNotifications();
    dataCharacteristic.addEventListener('characteristicvaluechanged', handleIncomingData);
    console.log('[VBT] Successfully subscribed to notifications!');

    setConnectedUI(true);
  } catch (err) {
    console.error('[VBT] Connection failed:', err);
    setConnectedUI(false);
  }
}

function disconnect() {
  if (dataCharacteristic) {
    dataCharacteristic.removeEventListener('characteristicvaluechanged', handleIncomingData);
    dataCharacteristic = null;
  }
  cmdCharacteristic = null;
  if (bleDevice && bleDevice.gatt.connected) {
    bleDevice.gatt.disconnect();
  }
  bleDevice = null;
  setConnectedUI(false);
}

function onDisconnected() {
  console.warn('[VBT] Device disconnected unexpectedly');
  dataCharacteristic = null;
  cmdCharacteristic = null;
  setConnectedUI(false);
}

// ═══════════════════════════════════════════
//  Command Transmission & UI Theme
// ═══════════════════════════════════════════

liftSelect.addEventListener('change', async (event) => {
  const liftName = event.target.value;
  
  // 1. Immediately update UI theme colors
  document.body.className = `theme-${liftName.toLowerCase()}`;
  
  // 2. Send over BLE
  if (!cmdCharacteristic) return;

  let cmdStr = '';
  switch (liftName) {
    case 'Squat':    cmdStr = 'CMD:SL:SQ\n'; break;
    case 'Bench':    cmdStr = 'CMD:SL:BP\n'; break;
    case 'Deadlift': cmdStr = 'CMD:SL:DL\n'; break;
  }

  try {
    const encoder = new TextEncoder();
    const payload = encoder.encode(cmdStr);
    await cmdCharacteristic.writeValue(payload);
    console.log(`[VBT] Sent command: ${cmdStr.trim()}`);
  } catch (err) {
    console.error('[VBT] Failed to send command:', err);
  }
});

// ═══════════════════════════════════════════
//  BLE Notification Handler & Parsing
// ═══════════════════════════════════════════

function handleIncomingData(event) {
  try {
    const incomingText = new TextDecoder().decode(event.target.value);
    console.log('Received payload:', incomingText);

    const parts = incomingText.split('|').map(s => s.trim());
    if (parts.length !== 3) throw new Error('Payload missing required parts');

    const lift = parts[0];
    const velocityMatch = parts[1].match(/([\d.]+)/);
    const rpeMatch = parts[2].match(/([\d.]+)/);

    if (!velocityMatch || !rpeMatch) throw new Error('Could not extract numeric values');

    const parsedData = {
      lift: lift,
      velocity: parseFloat(velocityMatch[1]),
      rpe: parseFloat(rpeMatch[1]),
    };

    updateLiveDisplay(parsedData);
    appendHistoryRow(parsedData);

  } catch (err) {
    console.warn('[VBT] Parse error (ignoring malformed data):', err.message);
  }
}

// ═══════════════════════════════════════════
//  DOM Updates & Physics Animations
// ═══════════════════════════════════════════

function updateLiveDisplay({ lift, velocity, rpe }) {
  // 1. Update text
  liveVelocity.textContent = velocity.toFixed(2);
  liveRpe.textContent = rpe.toFixed(1);

  // 2. Sync theme & dropdown safely
  document.body.className = `theme-${lift.toLowerCase()}`;
  if (liftSelect.value !== lift) {
    for (const opt of liftSelect.options) {
      if (opt.value.toLowerCase() === lift.toLowerCase()) {
        liftSelect.value = opt.value;
        break;
      }
    }
  }

  // 3. Physics-based Animation Engine
  // Assume ~0.5m Range of Motion. Time = Distance / Velocity.
  // Multiply by 2 for the full down+up replay trace.
  let duration = (0.5 / velocity) * 2;
  
  // Clamp boundaries: A 1.0+ m/s lift is snappy (~1s visual). A 0.15 m/s grind is slow (~6s visual).
  duration = Math.max(0.6, Math.min(duration, 6.0));
  
  // Inject the calculated time into CSS
  document.documentElement.style.setProperty('--rep-duration', `${duration}s`);

  // Force reflow and restart the trace animation
  orb.classList.add('active');
  orb.style.animation = 'none';
  void orb.offsetWidth; 
  
  // The keyframe name perfectly matches our CSS (@keyframes deadlift-rep, etc.)
  const animationName = `${lift.toLowerCase()}-rep`;
  orb.style.animation = `${animationName} var(--rep-duration) cubic-bezier(0.25, 1, 0.5, 1) forwards`;
}

function appendHistoryRow({ lift, velocity, rpe }) {
  repCounter++;

  // Clear empty state on first rep
  const emptyState = historyList.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const row = document.createElement('div');
  row.className = 'history-item';
  row.innerHTML = `
    <div class="hist-main">
      <div class="hist-lift">${escapeHtml(lift)}</div>
      <div class="hist-time">REP ${repCounter} • ${time}</div>
    </div>
    <div class="hist-stats">
      <div class="hist-stat-block">
        <div class="hist-val">${velocity.toFixed(2)}</div>
        <div class="hist-lbl">m/s</div>
      </div>
      <div class="hist-stat-block">
        <div class="hist-val">${rpe.toFixed(1)}</div>
        <div class="hist-lbl">RPE</div>
      </div>
    </div>
  `;

  // Prepend to list
  historyList.prepend(row);
}

// ═══════════════════════════════════════════
//  UI Helpers
// ═══════════════════════════════════════════

function setConnectedUI(connected) {
  btnConnect.disabled = false;
  if (connected) {
    btnText.textContent = 'DISCONNECT';
    btnConnect.classList.add('connected');
    statusBadge.textContent = 'Connected';
    statusBadge.className = 'badge connected';
  } else {
    btnText.textContent = 'CONNECT SENSOR';
    btnConnect.classList.remove('connected');
    statusBadge.textContent = 'Disconnected';
    statusBadge.className = 'badge disconnected';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
