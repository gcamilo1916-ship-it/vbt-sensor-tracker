/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS COACH PORTAL CONTROLLER
 * ChatGPT-Inspired Dark UI Controller, Live Telemetry Monitor & Event Syncer
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CoachPortal = factory();
    root.initCoachPortal = root.CoachPortal.init;
    root.switchMode = root.CoachPortal.switchMode;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Private State ──
  let isCoachMode = false;
  let activeRepsStream = [];
  let expandedSetIds = new Set();
  let feedbackTimer = null;
  let lastProcessedRepKey = '';
  let lastProcessedSetId = '';
  let lastCompletedSetId = '';

  // Mock Squad Roster
  const SQUAD_ATHLETES = [
    { id: 'ath_01', name: 'Alex Vance', rack: 'Rack 01', readiness: '94% [OPTIMAL]', e1rm: '272.5 kg', volume: '7,420 kg' },
    { id: 'ath_02', name: 'Jordan Bell', rack: 'Rack 02', readiness: '88% [GOOD]', e1rm: '240.0 kg', volume: '5,850 kg' },
    { id: 'ath_03', name: 'Elena Rostova', rack: 'Rack 03', readiness: '96% [PRIME]', e1rm: '215.0 kg', volume: '8,100 kg' }
  ];
  let currentAthlete = SQUAD_ATHLETES[0];

  // ── DOM Element Cache ──
  let elements = {};

  function queryElements() {
    elements = {
      viewCoach: document.getElementById('view-coach'),
      btnModeAthlete: document.getElementById('btn-mode-athlete'),
      btnModeCoach: document.getElementById('btn-mode-coach'),
      viewModeToggle: document.getElementById('view-mode-toggle'),

      // Squad Ribbon
      athleteSelect: document.getElementById('coach-athlete-select'),
      sessionStatusBadge: document.getElementById('coach-session-status-badge'),
      sessionStatusText: document.getElementById('coach-session-status-text'),
      readinessVal: document.getElementById('coach-readiness-val'),
      volumeVal: document.getElementById('coach-volume-val'),
      e1rmVal: document.getElementById('coach-e1rm-val'),

      // Active Set Live Monitor
      activeSetTitle: document.getElementById('coach-active-set-title'),
      activeSetMeta: document.getElementById('coach-active-set-meta'),
      liveMcv: document.getElementById('coach-live-mcv'),
      livePv: document.getElementById('coach-live-pv'),
      liveRom: document.getElementById('coach-live-rom'),
      liveVl: document.getElementById('coach-live-vl'),
      liveVlGauge: document.getElementById('coach-live-vl-gauge'),
      repsStream: document.getElementById('coach-live-reps-stream'),

      // Sets History Table
      setsTable: document.getElementById('coach-sets-table'),
      setsTableBody: document.getElementById('coach-sets-table-body'),
      setsCounter: document.getElementById('coach-sets-counter'),

      // Feedback Console
      feedbackConsole: document.getElementById('coach-feedback-console'),
      feedbackStatus: document.getElementById('coach-feedback-status'),
      customCueInput: document.getElementById('coach-custom-cue-input'),
      btnSendCustom: document.getElementById('btn-coach-send-custom'),
      loadPills: document.querySelectorAll('.coach-load-pill'),
      cueChips: document.querySelectorAll('.coach-cue-chip')
    };
  }

  // ── Safe Helpers ──
  function getSafeActiveWorkout() {
    if (typeof activeWorkout !== 'undefined' && activeWorkout) {
      return activeWorkout;
    }
    if (typeof workouts !== 'undefined' && Array.isArray(workouts) && workouts.length > 0) {
      return workouts[0];
    }
    try {
      const stored = localStorage.getItem('vbt_workouts_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0];
        }
      }
    } catch (_) {}
    return null;
  }

  function getSafeActiveSet() {
    if (typeof activeSet !== 'undefined' && activeSet) {
      return activeSet;
    }
    return null;
  }

  function getSafeWorkingWeight() {
    if (typeof currentWorkingWeight !== 'undefined' && !isNaN(currentWorkingWeight)) {
      return currentWorkingWeight;
    }
    const safeSet = getSafeActiveSet();
    if (safeSet && safeSet.weight) {
      return safeSet.weight;
    }
    return 140.0;
  }

  // ── Initialization ──
  function init() {
    queryElements();

    // Mode Toggle Clicks
    if (elements.btnModeAthlete) {
      elements.btnModeAthlete.addEventListener('click', () => switchMode('athlete'));
    }
    if (elements.btnModeCoach) {
      elements.btnModeCoach.addEventListener('click', () => switchMode('coach'));
    }

    // Athlete Roster Dropdown
    if (elements.athleteSelect) {
      elements.athleteSelect.addEventListener('change', (e) => {
        const sel = SQUAD_ATHLETES.find(a => a.id === e.target.value);
        if (sel) {
          currentAthlete = sel;
          updateSquadRibbon();
          showFeedbackMessage(`Switched active supervision to ${sel.name} (${sel.rack})`);
        }
      });
    }

    // Feedback Controls
    initFeedbackHandlers();

    // Subscribe to Event Bus
    bindSyncBusEvents();

    // Window storage listener for cross-tab sync
    window.addEventListener('storage', (e) => {
      if (e.key === 'vbt_workouts_v1') {
        if (isCoachMode) {
          renderSetsHistoryTable();
          updateSquadRibbon();
        }
      }
    });

    // Listen to custom DOM events (fallback / intra-page)
    window.addEventListener('eros:set_started', (e) => handleSetStarted(e.detail || {}));
    window.addEventListener('eros:rep_recorded', (e) => handleRepRecorded(e.detail || {}));
    window.addEventListener('eros:set_completed', (e) => handleSetCompleted(e.detail || {}));
    window.addEventListener('eros:workout_updated', () => {
      if (isCoachMode) renderFullCoachDashboard();
    });

    // Initial check
    if (document.body.classList.contains('portal-coach')) {
      switchMode('coach');
    }
  }

  // ── Mode Switcher (Seamless In-Page Toggle) ──
  function switchMode(mode) {
    isCoachMode = (mode === 'coach');

    // Trigger subtle UI tick audio if available
    if (typeof SoundFX !== 'undefined' && typeof SoundFX.playNavTick === 'function') {
      try { SoundFX.playNavTick(); } catch (_) {}
    }
    if (typeof HapticsFX !== 'undefined' && typeof HapticsFX.vibrate === 'function') {
      try { HapticsFX.vibrate([20]); } catch (_) {}
    }

    if (!elements.viewCoach) queryElements();

    if (isCoachMode) {
      document.body.classList.add('portal-coach');
      if (elements.btnModeCoach) {
        elements.btnModeCoach.classList.add('active');
        elements.btnModeCoach.setAttribute('aria-checked', 'true');
      }
      if (elements.btnModeAthlete) {
        elements.btnModeAthlete.classList.remove('active');
        elements.btnModeAthlete.setAttribute('aria-checked', 'false');
      }
      if (elements.viewCoach) {
        elements.viewCoach.style.display = 'flex';
      }
      renderFullCoachDashboard();
    } else {
      document.body.classList.remove('portal-coach');
      if (elements.btnModeAthlete) {
        elements.btnModeAthlete.classList.add('active');
        elements.btnModeAthlete.setAttribute('aria-checked', 'true');
      }
      if (elements.btnModeCoach) {
        elements.btnModeCoach.classList.remove('active');
        elements.btnModeCoach.setAttribute('aria-checked', 'false');
      }
      if (elements.viewCoach) {
        elements.viewCoach.style.display = 'none';
      }
    }
  }

  // ── Sync Bus Event Binding ──
  function bindSyncBusEvents() {
    function attachToBus(bus) {
      if (!bus || typeof bus.on !== 'function') return;
      bus.on('set:started', handleSetStarted);
      bus.on('rep:recorded', handleRepRecorded);
      bus.on('set:completed', handleSetCompleted);
      bus.on('coach:load_response', handleLoadResponse);
      bus.on('workout:updated', () => {
        if (isCoachMode) renderFullCoachDashboard();
      });
    }

    if (typeof window !== 'undefined' && window.ErosSyncBus) {
      attachToBus(window.ErosSyncBus);
    } else if (typeof window !== 'undefined') {
      // Monitor for late bus instantiation
      let existingBus = window.ErosSyncBus;
      Object.defineProperty(window, 'ErosSyncBus', {
        configurable: true,
        enumerable: true,
        get: () => existingBus,
        set: (newBus) => {
          existingBus = newBus;
          attachToBus(newBus);
        }
      });
    }
  }

  // ── Event Handlers ──
  function handleSetStarted(payload) {
    if (payload && payload.setId && payload.setId === lastProcessedSetId && activeRepsStream.length === 0) return;
    lastProcessedSetId = (payload && payload.setId) ? payload.setId : '';

    activeRepsStream = [];
    if (!elements.viewCoach) queryElements();

    const lift = (payload && payload.lift) || (typeof currentLift !== 'undefined' ? currentLift : 'Deadlift');
    const setNum = (payload && payload.setNumber) || 1;
    const weight = (payload && payload.weight) || getSafeWorkingWeight();

    if (elements.activeSetTitle) {
      elements.activeSetTitle.textContent = `${lift.toUpperCase()} — SET ${setNum}`;
    }
    if (elements.activeSetMeta) {
      elements.activeSetMeta.textContent = `${weight.toFixed(1)} kg | In Progress`;
    }
    if (elements.sessionStatusText) {
      elements.sessionStatusText.textContent = 'SET IN PROGRESS';
    }

    // Reset metric cards
    if (elements.liveMcv) elements.liveMcv.textContent = '0.00';
    if (elements.livePv) elements.livePv.textContent = '0.00';
    if (elements.liveRom) elements.liveRom.textContent = '0.0';
    if (elements.liveVl) elements.liveVl.textContent = '0.0%';
    if (elements.liveVlGauge) {
      elements.liveVlGauge.style.width = '0%';
      elements.liveVlGauge.className = 'coach-vl-bar-fill';
    }
    if (elements.repsStream) {
      elements.repsStream.innerHTML = '<span class="coach-empty-stream-msg">Set initiated. Lift with Eros to record repetitions...</span>';
    }
  }

  function handleRepRecorded(payload) {
    if (!payload) return;
    if (!elements.viewCoach) queryElements();

    const repNum = payload.repNumber || (activeRepsStream.length + 1);
    const vel = typeof payload.velocity === 'number' ? payload.velocity : (payload.meanVelocity || 0);
    const peakVel = typeof payload.peakVelocity === 'number' ? payload.peakVelocity : (vel * 1.25);
    const rom = typeof payload.rom === 'number' ? payload.rom : (payload.romCm || 54.0);
    const vl = typeof payload.lossPercent === 'number' ? payload.lossPercent : (payload.velocityLossPct || 0);

    const repKey = `${payload.setId || ''}_${repNum}_${vel.toFixed(2)}`;
    if (repKey === lastProcessedRepKey) return;
    lastProcessedRepKey = repKey;

    activeRepsStream.push({
      repNumber: repNum,
      velocity: vel,
      peakVelocity: peakVel,
      rom: rom,
      lossPercent: vl
    });

    // Update Live Bento Values
    if (elements.liveMcv) elements.liveMcv.textContent = vel.toFixed(2);
    if (elements.livePv) elements.livePv.textContent = peakVel.toFixed(2);
    if (elements.liveRom) elements.liveRom.textContent = rom.toFixed(1);
    if (elements.liveVl) elements.liveVl.textContent = `${vl.toFixed(1)}%`;

    // Update VL Gauge
    if (elements.liveVlGauge) {
      const clampedVl = Math.min(100, Math.max(0, vl));
      elements.liveVlGauge.style.width = `${clampedVl}%`;
      if (clampedVl >= 20.0) {
        elements.liveVlGauge.className = 'coach-vl-bar-fill cutoff';
      } else if (clampedVl >= 15.0) {
        elements.liveVlGauge.className = 'coach-vl-bar-fill warning';
      } else {
        elements.liveVlGauge.className = 'coach-vl-bar-fill';
      }
    }

    // Append to Reps Stream
    renderRepsStream();
  }

  function handleSetCompleted(payload) {
    if (payload && payload.setId && payload.setId === lastCompletedSetId) return;
    lastCompletedSetId = (payload && payload.setId) ? payload.setId : '';

    if (!elements.viewCoach) queryElements();

    if (elements.activeSetTitle) {
      elements.activeSetTitle.textContent = 'NO ACTIVE SET — RESTING';
    }
    if (elements.activeSetMeta) {
      elements.activeSetMeta.textContent = 'Waiting for next set';
    }
    if (elements.sessionStatusText) {
      elements.sessionStatusText.textContent = 'REST INTERVAL';
    }

    renderSetsHistoryTable();
    updateSquadRibbon();
  }

  function handleLoadResponse(payload) {
    if (payload && payload.accepted) {
      showFeedbackMessage(`Athlete confirmed load: ${payload.finalWeight || payload.newWeight} kg`);
    } else {
      showFeedbackMessage('Athlete kept current working load');
    }
  }

  // ── Render Dashboard Functions ──
  function renderFullCoachDashboard() {
    updateSquadRibbon();
    renderActiveSetFromState();
    renderSetsHistoryTable();
  }

  function updateSquadRibbon() {
    if (!elements.readinessVal) queryElements();
    if (elements.readinessVal) elements.readinessVal.textContent = currentAthlete.readiness;
    if (elements.volumeVal) elements.volumeVal.textContent = currentAthlete.volume;
    if (elements.e1rmVal) elements.e1rmVal.textContent = currentAthlete.e1rm;

    const safeSet = getSafeActiveSet();
    if (safeSet) {
      if (elements.sessionStatusText) elements.sessionStatusText.textContent = 'ACTIVE SET';
    } else {
      const safeWorkout = getSafeActiveWorkout();
      if (safeWorkout && safeWorkout.sets && safeWorkout.sets.length > 0) {
        if (elements.sessionStatusText) elements.sessionStatusText.textContent = 'REST INTERVAL';
      } else {
        if (elements.sessionStatusText) elements.sessionStatusText.textContent = 'SESSION READY';
      }
    }
  }

  function renderActiveSetFromState() {
    const curSet = getSafeActiveSet();
    if (!curSet) {
      if (elements.activeSetTitle) elements.activeSetTitle.textContent = 'NO ACTIVE SET — READY';
      if (elements.activeSetMeta) elements.activeSetMeta.textContent = `${getSafeWorkingWeight().toFixed(1)} kg | Standing By`;
      if (elements.liveMcv) elements.liveMcv.textContent = '0.00';
      if (elements.livePv) elements.livePv.textContent = '0.00';
      if (elements.liveRom) elements.liveRom.textContent = '0.0';
      if (elements.liveVl) elements.liveVl.textContent = '0.0%';
      if (elements.liveVlGauge) {
        elements.liveVlGauge.style.width = '0%';
        elements.liveVlGauge.className = 'coach-vl-bar-fill';
      }
      if (elements.repsStream) {
        elements.repsStream.innerHTML = '<span class="coach-empty-stream-msg">No active set in progress. Start a set in Athlete view to begin streaming.</span>';
      }
      return;
    }

    const lift = curSet.lift || (typeof currentLift !== 'undefined' ? currentLift : 'Deadlift');
    if (elements.activeSetTitle) {
      elements.activeSetTitle.textContent = `${lift.toUpperCase()} — SET ${curSet.setNumber || 1}`;
    }
    if (elements.activeSetMeta) {
      elements.activeSetMeta.textContent = `${(curSet.weight || getSafeWorkingWeight()).toFixed(1)} kg | Target RPE @${(curSet.targetRpe || 8.0).toFixed(1)}`;
    }
    if (elements.liveMcv) elements.liveMcv.textContent = (curSet.avgVelocity || 0).toFixed(2);
    if (elements.livePv) elements.livePv.textContent = (curSet.maxVelocity || 0).toFixed(2);
    if (elements.liveRom) elements.liveRom.textContent = (curSet.rom || 56.2).toFixed(1);
    if (elements.liveVl) elements.liveVl.textContent = `${(curSet.velocityLossPct || 0).toFixed(1)}%`;

    if (elements.liveVlGauge) {
      const vl = curSet.velocityLossPct || 0;
      elements.liveVlGauge.style.width = `${Math.min(100, Math.max(0, vl))}%`;
      if (vl >= 20.0) {
        elements.liveVlGauge.className = 'coach-vl-bar-fill cutoff';
      } else if (vl >= 15.0) {
        elements.liveVlGauge.className = 'coach-vl-bar-fill warning';
      } else {
        elements.liveVlGauge.className = 'coach-vl-bar-fill';
      }
    }

    if (Array.isArray(curSet.reps) && curSet.reps.length > 0) {
      activeRepsStream = curSet.reps.map((r, idx) => ({
        repNumber: r.repNumber || idx + 1,
        velocity: r.velocity || 0,
        peakVelocity: r.peakVelocity || (r.velocity ? r.velocity * 1.25 : 0),
        rom: r.rom || 56.0,
        lossPercent: r.lossPercent || 0
      }));
      renderRepsStream();
    }
  }

  function renderRepsStream() {
    if (!elements.repsStream) return;
    if (activeRepsStream.length === 0) {
      elements.repsStream.innerHTML = '<span class="coach-empty-stream-msg">No repetitions logged in this set yet.</span>';
      return;
    }

    elements.repsStream.innerHTML = activeRepsStream.map(rep => {
      const isCutoff = rep.lossPercent >= 20.0;
      return `
        <div class="coach-rep-stream-pill ${isCutoff ? 'cutoff-alert' : ''}">
          <span class="rep-num">R${rep.repNumber}:</span>
          <span class="rep-vel">${rep.velocity.toFixed(2)} m/s</span>
          <span class="rep-loss">(${rep.lossPercent > 0 ? '-' : ''}${rep.lossPercent.toFixed(1)}%)</span>
        </div>
      `;
    }).join('');
  }

  function renderSetsHistoryTable() {
    if (!elements.setsTableBody) queryElements();
    if (!elements.setsTableBody) return;

    const safeWorkout = getSafeActiveWorkout();
    const sets = (safeWorkout && Array.isArray(safeWorkout.sets)) ? safeWorkout.sets : [];

    if (elements.setsCounter) {
      elements.setsCounter.textContent = `${sets.length} Completed`;
    }

    if (sets.length === 0) {
      elements.setsTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="coach-empty-cell">No sets completed yet in this session.</td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    sets.forEach(set => {
      const setId = set.setId || `set_${set.setNumber}`;
      const lift = set.lift || 'Deadlift';
      const liftLower = lift.toLowerCase();
      const isExpanded = expandedSetIds.has(setId);
      const isCutoff = (set.velocityLossPct || 0) >= 20.0;

      rowsHtml += `
        <tr class="coach-history-row ${isExpanded ? 'expanded' : ''}" data-set-id="${setId}">
          <td class="font-mono">Set ${set.setNumber}</td>
          <td><span class="coach-lift-badge lift-${liftLower}">${lift.toUpperCase()}</span></td>
          <td class="font-mono">${(set.weight || 0).toFixed(1)} kg</td>
          <td class="font-mono">${set.reps ? set.reps.length : 0}</td>
          <td class="font-mono">${(set.avgVelocity || 0).toFixed(2)} m/s</td>
          <td class="font-mono">${(set.maxVelocity || 0).toFixed(2)} m/s</td>
          <td class="font-mono ${isCutoff ? 'text-danger' : ''}">${(set.velocityLossPct || 0).toFixed(1)}%</td>
          <td class="font-mono">@${(set.avgRpe || 8.0).toFixed(1)}</td>
          <td>
            <button type="button" class="coach-expand-btn" data-toggle-id="${setId}" aria-label="Toggle details for set ${set.setNumber}">
              ${isExpanded ? 'Hide Reps' : 'View Reps'}
            </button>
          </td>
        </tr>
      `;

      if (isExpanded && set.reps && set.reps.length > 0) {
        rowsHtml += `
          <tr class="coach-expanded-drawer-row" id="drawer-${setId}">
            <td colspan="9">
              <div class="coach-rep-drawer-inner">
                <table class="coach-rep-subtable">
                  <thead>
                    <tr>
                      <th>REP #</th>
                      <th>MEAN VELOCITY</th>
                      <th>PEAK VELOCITY</th>
                      <th>EST. RPE</th>
                      <th>REPETITION STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${set.reps.map(r => `
                      <tr>
                        <td>Rep ${r.repNumber}</td>
                        <td class="text-cyan">${(r.velocity || 0).toFixed(2)} m/s</td>
                        <td>${(r.peakVelocity || (r.velocity ? r.velocity * 1.25 : 0)).toFixed(2)} m/s</td>
                        <td>@${(r.rpe || 8.0).toFixed(1)}</td>
                        <td>${r.isPR ? '<span class="text-success">Gym PR</span>' : 'Completed'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        `;
      }
    });

    elements.setsTableBody.innerHTML = rowsHtml;

    // Attach row / button expand handlers
    const expandButtons = elements.setsTableBody.querySelectorAll('.coach-expand-btn');
    expandButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-toggle-id');
        toggleSetExpansion(id);
      });
    });

    const rows = elements.setsTableBody.querySelectorAll('.coach-history-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-set-id');
        toggleSetExpansion(id);
      });
    });
  }

  function toggleSetExpansion(setId) {
    if (!setId) return;
    if (expandedSetIds.has(setId)) {
      expandedSetIds.delete(setId);
    } else {
      expandedSetIds.add(setId);
    }
    renderSetsHistoryTable();
  }

  // ── Feedback Controls & Downlink Dispatch ──
  function initFeedbackHandlers() {
    // Load Adjustment Pills
    if (elements.loadPills && elements.loadPills.length > 0) {
      elements.loadPills.forEach(pill => {
        pill.addEventListener('click', () => {
          const delta = parseFloat(pill.getAttribute('data-delta') || '0');
          const currentWeight = getSafeWorkingWeight();
          const newWeight = Math.max(0, currentWeight + delta);
          const cueText = delta !== 0
            ? `Load modification: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg for next set (${newWeight.toFixed(1)} kg)`
            : `Keep current working load (${currentWeight.toFixed(1)} kg)`;

          sendCoachPrescription(cueText, delta, newWeight);
        });
      });
    }

    // Quick Technical Cue Chips
    if (elements.cueChips && elements.cueChips.length > 0) {
      elements.cueChips.forEach(chip => {
        chip.addEventListener('click', () => {
          const cue = chip.getAttribute('data-cue');
          if (cue) {
            sendCoachPrescription(cue, 0, getSafeWorkingWeight());
          }
        });
      });
    }

    // Custom Cue Input & Button
    if (elements.btnSendCustom && elements.customCueInput) {
      elements.btnSendCustom.addEventListener('click', handleCustomCueSubmit);
      elements.customCueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCustomCueSubmit();
        }
      });
    }
  }

  function handleCustomCueSubmit() {
    if (!elements.customCueInput) return;
    const text = elements.customCueInput.value.trim();
    if (!text) return;
    sendCoachPrescription(text, 0, getSafeWorkingWeight());
    elements.customCueInput.value = '';
  }

  function sendCoachPrescription(cueText, deltaKg, targetWeight) {
    const activeSetRef = getSafeActiveSet();
    const nextSetNumber = activeSetRef ? (activeSetRef.setNumber + 1) : 1;

    const payload = {
      id: `cmd_cue_${Date.now()}`,
      coachName: 'Coach Marcus',
      athleteId: currentAthlete.id,
      setNumber: nextSetNumber,
      text: cueText,
      deltaKg: deltaKg,
      newWeight: targetWeight,
      type: deltaKg !== 0 ? 'load_override' : 'technical',
      autoAcceptSeconds: 20,
      timestamp: Date.now()
    };

    // 1. Dispatch via ErosSyncBus if present
    if (typeof window !== 'undefined' && window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
      window.ErosSyncBus.emit('coach:cue', payload);
      if (deltaKg !== 0) {
        window.ErosSyncBus.emit('coach:load_override', payload);
      }
    }

    // 2. Dispatch via DOM CustomEvent for intra-page listeners
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eros:coach_cue', { detail: payload }));
      if (deltaKg !== 0) {
        window.dispatchEvent(new CustomEvent('eros:coach_load_override', { detail: payload }));
      }
    }

    // 3. Local state synchronization with athlete working load
    if (deltaKg !== 0 && typeof targetWeight === 'number') {
      const liveWeightInput = document.getElementById('live-set-weight-input');
      const workoutWeightInput = document.getElementById('workout-set-weight-input');
      if (liveWeightInput) liveWeightInput.value = targetWeight.toFixed(1);
      if (workoutWeightInput) workoutWeightInput.value = targetWeight.toFixed(1);
      if (typeof currentWorkingWeight !== 'undefined') {
        try { currentWorkingWeight = targetWeight; } catch (_) {}
      }
    }

    // Visual feedback on Coach Console
    const sign = deltaKg > 0 ? '+' : '';
    const summary = deltaKg !== 0
      ? `Dispatched: "${cueText}" [${sign}${deltaKg} kg]`
      : `Dispatched technical cue: "${cueText}"`;

    showFeedbackMessage(summary);
  }

  function hookAppLifecycle() {
    if (typeof window === 'undefined') return;

    if (typeof window.startNewSet === 'function' && !window.startNewSet._coachHooked) {
      const origStart = window.startNewSet;
      window.startNewSet = function (lift) {
        const res = origStart.apply(this, arguments);
        const payload = {
          setId: res ? res.setId : `set_${Date.now()}`,
          setNumber: res ? res.setNumber : 1,
          lift: res ? res.lift : lift,
          weight: res ? res.weight : getSafeWorkingWeight(),
          timestamp: Date.now()
        };
        if (window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
          window.ErosSyncBus.emit('set:started', payload);
        } else {
          handleSetStarted(payload);
        }
        return res;
      };
      window.startNewSet._coachHooked = true;
    }

    if (typeof window.recordRepetition === 'function' && !window.recordRepetition._coachHooked) {
      const origRecord = window.recordRepetition;
      window.recordRepetition = function (repData) {
        const res = origRecord.apply(this, arguments);
        const safeSet = getSafeActiveSet();
        const payload = {
          setId: safeSet ? safeSet.setId : '',
          setNumber: safeSet ? safeSet.setNumber : 1,
          repNumber: safeSet && safeSet.reps ? safeSet.reps.length : 1,
          velocity: repData ? repData.velocity : 0,
          peakVelocity: repData ? repData.velocity * 1.25 : 0,
          rom: 54.0,
          rpe: repData ? repData.rpe : 8.0,
          lossPercent: safeSet ? safeSet.velocityLossPct : 0,
          timestamp: Date.now()
        };
        if (window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
          window.ErosSyncBus.emit('rep:recorded', payload);
        } else {
          handleRepRecorded(payload);
        }
        return res;
      };
      window.recordRepetition._coachHooked = true;
    }

    if (typeof window.endActiveSet === 'function' && !window.endActiveSet._coachHooked) {
      const origEnd = window.endActiveSet;
      window.endActiveSet = function () {
        const endingSet = getSafeActiveSet();
        const res = origEnd.apply(this, arguments);
        const payload = {
          setId: endingSet ? endingSet.setId : '',
          setNumber: endingSet ? endingSet.setNumber : 1,
          lift: endingSet ? endingSet.lift : '',
          weight: endingSet ? endingSet.weight : 0,
          reps: endingSet ? endingSet.reps : [],
          avgVelocity: endingSet ? endingSet.avgVelocity : 0,
          maxVelocity: endingSet ? endingSet.maxVelocity : 0,
          velocityLoss: endingSet ? endingSet.velocityLossPct : 0,
          timestamp: Date.now()
        };
        if (window.ErosSyncBus && typeof window.ErosSyncBus.emit === 'function') {
          window.ErosSyncBus.emit('set:completed', payload);
        } else {
          handleSetCompleted(payload);
        }
        return res;
      };
      window.endActiveSet._coachHooked = true;
    }
  }

  function showFeedbackMessage(msg) {
    if (!elements.feedbackStatus) queryElements();
    if (!elements.feedbackStatus) return;

    elements.feedbackStatus.textContent = msg;
    elements.feedbackStatus.style.opacity = '1';

    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      if (elements.feedbackStatus) {
        elements.feedbackStatus.style.opacity = '0';
      }
    }, 4000);
  }

  // Auto-init on DOMContentLoaded if document ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        init();
        hookAppLifecycle();
      });
    } else {
      init();
      hookAppLifecycle();
    }
  }

  // Public Interface
  return {
    init,
    switchMode,
    renderFullCoachDashboard,
    sendCoachPrescription,
    getIsCoachMode: () => isCoachMode,
    getSquadAthletes: () => SQUAD_ATHLETES,
    getCurrentAthlete: () => currentAthlete
  };
});
