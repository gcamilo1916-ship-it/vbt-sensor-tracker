/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS — ATHLETE CELEBRATION FX & COACH HUD MODULE (athlete-fx.js)
 * Apple visionOS Spatial Glass OS Architecture — Milestone 3 (Requirement R2)
 * Strict R4 Terminology Compliance: Zero restricted terms. Pure Eros.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  // ── Bryan Mann Velocity Continuum Reference Zones ──
  const VELOCITY_ZONES = [
    {
      id: 'power',
      name: 'Power / Speed',
      label: 'POWER / SPEED (>1.0 m/s)',
      shortLabel: 'POWER',
      min: 1.00,
      max: Infinity,
      cssClass: 'vel-zone-power',
      textClass: 'vel-zone-power-text',
      color: '#00E5FF', // Laser Cyan
      sparkClass: 'cyan-spark'
    },
    {
      id: 'speed',
      name: 'Speed-Strength',
      label: 'SPEED-STRENGTH (0.75-1.0 m/s)',
      shortLabel: 'SPEED-STRENGTH',
      min: 0.75,
      max: 1.00,
      cssClass: 'vel-zone-speed',
      textClass: 'vel-zone-speed-text',
      color: '#00FF66', // Electric Emerald
      sparkClass: 'emerald-spark'
    },
    {
      id: 'strength',
      name: 'Strength-Speed',
      label: 'STRENGTH-SPEED (0.5-0.75 m/s)',
      shortLabel: 'STRENGTH-SPEED',
      min: 0.50,
      max: 0.75,
      cssClass: 'vel-zone-strength',
      textClass: 'vel-zone-strength-text',
      color: '#FFD700', // Specular Gold
      sparkClass: 'gold-spark'
    },
    {
      id: 'accel',
      name: 'Accelerative Strength',
      label: 'ACCEL STRENGTH (0.3-0.5 m/s)',
      shortLabel: 'ACCEL',
      min: 0.30,
      max: 0.50,
      cssClass: 'vel-zone-accel',
      textClass: 'vel-zone-accel-text',
      color: '#FF9500', // Caution Orange
      sparkClass: 'gold-spark'
    },
    {
      id: 'grind',
      name: 'Absolute Strength / Grind',
      label: 'ABSOLUTE STRENGTH / GRIND (<0.3 m/s)',
      shortLabel: 'GRIND',
      min: 0.00,
      max: 0.30,
      cssClass: 'vel-zone-grind',
      textClass: 'vel-zone-grind-text',
      color: '#FF3B30', // Apple System Punchy Red
      sparkClass: 'crimson-spark'
    }
  ];

  /**
   * Resolves the Bryan Mann velocity zone object for a given velocity in m/s.
   * @param {number} velocity - Concentric velocity in m/s.
   * @returns {Object} Zone configuration object.
   */
  function getVelocityZone(velocity) {
    const v = Number(velocity) || 0;
    if (v > 1.00) return VELOCITY_ZONES[0];
    if (v >= 0.75) return VELOCITY_ZONES[1];
    if (v >= 0.50) return VELOCITY_ZONES[2];
    if (v >= 0.30) return VELOCITY_ZONES[3];
    return VELOCITY_ZONES[4];
  }

  /**
   * Renders color-coded velocity badge HTML and returns the zone class.
   * @param {number} velocity - Concentric velocity in m/s.
   * @param {Object} [options] - Configuration options.
   * @param {boolean} [options.fullLabel=false] - Whether to show the complete range label.
   * @param {boolean} [options.showValue=true] - Whether to include the numeric velocity.
   * @returns {string} HTML string of the badge.
   */
  function renderVelocityZoneBadge(velocity, options = {}) {
    const v = Number(velocity) || 0;
    const zone = getVelocityZone(v);
    const labelText = options.fullLabel ? zone.label : zone.shortLabel;
    const valText = options.showValue !== false ? ` • ${v.toFixed(2)} m/s` : '';

    return `<span class="vel-zone-badge ${zone.cssClass} font-mono" data-zone="${zone.id}">${labelText}${valText}</span>`;
  }

  // ── Particle & Spark Burst Engine ──
  /**
   * Emits celebratory micro-particles from an origin element or container.
   * @param {string} [tier='default'] - 'gold' | 'cyan' | 'emerald' | 'crimson' | 'default'.
   * @param {number} [count=28] - Number of sparks to generate.
   * @param {HTMLElement} [containerEl] - Target container (defaults to #set-celebration-stage or #rpe-hero-card).
   */
  function emitCelebrationSparks(tier = 'default', count = 28, containerEl = null) {
    if (typeof document === 'undefined') return;

    let targetStage = containerEl;
    if (!targetStage) {
      targetStage = document.getElementById('set-celebration-stage');
    }
    if (!targetStage) {
      const heroCard = document.getElementById('rpe-hero-card');
      if (heroCard) {
        targetStage = heroCard.querySelector('.set-celebration-overlay');
        if (!targetStage) {
          targetStage = document.createElement('div');
          targetStage.className = 'set-celebration-overlay';
          targetStage.id = 'set-celebration-stage';
          targetStage.setAttribute('aria-hidden', 'true');
          heroCard.appendChild(targetStage);
        }
      }
    }
    if (!targetStage) return;

    let emitter = targetStage.querySelector('.burst-emitter');
    if (!emitter) {
      emitter = document.createElement('div');
      emitter.className = 'burst-emitter';
      targetStage.appendChild(emitter);
    }

    const fragment = document.createDocumentFragment();
    const sparkClass = tier === 'gold' ? 'gold-spark'
      : tier === 'cyan' ? 'cyan-spark'
      : tier === 'emerald' ? 'emerald-spark'
      : tier === 'crimson' ? 'crimson-spark'
      : '';

    for (let i = 0; i < count; i++) {
      const spark = document.createElement('div');
      spark.className = `celebration-spark ${sparkClass}`.trim();

      // Physics vector calculation (omnidirectional radial burst with upward drift bias)
      const angle = (Math.random() * Math.PI * 2);
      const distance = 40 + Math.random() * 110;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - (20 + Math.random() * 40);

      if (spark.style && typeof spark.style.setProperty === 'function') {
        spark.style.setProperty('--dx', `${dx.toFixed(1)}px`);
        spark.style.setProperty('--dy', `${dy.toFixed(1)}px`);
      } else if (spark.style) {
        spark.style['--dx'] = `${dx.toFixed(1)}px`;
        spark.style['--dy'] = `${dy.toFixed(1)}px`;
      }
      spark.style.animationDelay = `${(Math.random() * 0.12).toFixed(2)}s`;
      spark.style.animationDuration = `${(0.70 + Math.random() * 0.35).toFixed(2)}s`;

      fragment.appendChild(spark);

      // Self-cleanup after animation completes
      setTimeout(() => {
        if (spark.parentNode) {
          spark.parentNode.removeChild(spark);
        }
      }, 1200);
    }

    emitter.appendChild(fragment);
  }

  // ── Rest Countdown Controller ──
  let restCountdownInterval = null;

  /**
   * Starts a rest interval countdown in the summary banner.
   * @param {number} seconds - Rest duration in seconds (default 180s = 3m).
   * @param {HTMLElement} [displayEl] - Element receiving the MM:SS text.
   */
  function startRestCountdown(seconds = 180, displayEl = null) {
    stopRestCountdown();
    let remaining = Math.max(0, parseInt(seconds, 10) || 180);

    const targetEl = displayEl || (typeof document !== 'undefined' ? document.getElementById('summary-rest-time') : null);

    function formatTime(secs) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    if (targetEl) {
      targetEl.textContent = formatTime(remaining);
    }

    restCountdownInterval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stopRestCountdown();
        if (targetEl) targetEl.textContent = '00:00';
      } else if (targetEl) {
        targetEl.textContent = formatTime(remaining);
      }
    }, 1000);
  }

  /**
   * Cancels active rest countdown.
   */
  function stopRestCountdown() {
    if (restCountdownInterval) {
      clearInterval(restCountdownInterval);
      restCountdownInterval = null;
    }
  }

  // ── Web Audio Chimes & Haptics Fanfare ──
  /**
   * Triggers acoustic fanfare for set completion using Web Audio API via SoundFX singleton.
   * @param {boolean} [isPR=false] - Whether set achieved a personal record.
   * @param {number} [velocityLossPct=0] - Set velocity loss percentage.
   */
  function playCelebrationFanfare(isPR = false, velocityLossPct = 0) {
    const targetGlobal = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (!targetGlobal) return;

    const sfx = targetGlobal.SoundFX || (typeof SoundFX !== 'undefined' ? SoundFX : null);
    if (sfx) {
      if (typeof sfx.playSetTriumph === 'function') {
        sfx.playSetTriumph(isPR, velocityLossPct);
        return;
      }
      if (isPR && typeof sfx.playPrFanfare === 'function') {
        sfx.playPrFanfare();
        return;
      }

      // Native fallback Web Audio major triad synthesis: D5 -> F#5 -> A5 -> D6
      try {
        const ctx = typeof sfx.getAudioContext === 'function' ? sfx.getAudioContext() : null;
        if (ctx) {
          const now = ctx.currentTime;
          const notes = isPR
            ? [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6
            : [587.33, 739.99, 880.00, 1174.66]; // D5, F#5, A5, D6

          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const t = now + idx * 0.08;

            osc.type = idx === notes.length - 1 ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(freq, t);

            gain.gain.setValueAtTime(0.24, t);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(t);
            osc.stop(t + 0.38);
          });
        }
      } catch (e) {
        // Silent fallback
      }
    }

    // Haptics Fanfare Trigger
    const haptics = targetGlobal.HapticsFX || (typeof HapticsFX !== 'undefined' ? HapticsFX : null);
    if (haptics && typeof haptics.vibrate === 'function') {
      if (isPR) {
        haptics.vibrate([60, 40, 80, 40, 140, 50, 200]);
      } else {
        haptics.vibrate([40, 50, 80, 50, 120]);
      }
    }
  }

  // ── Set Completion Celebration Trigger ──
  /**
   * Executes the full celebratory sequence upon completing a workout set:
   * 1. Dynamic Glass Bloom Pulse on #rpe-hero-card
   * 2. Micro-particle spark burst tailored to velocity/PR tier
   * 3. Post-set summary banner transition and rest countdown initialization
   * 4. Acoustic Web Audio fanfare and haptic pulse
   *
   * @param {Object} [set] - Concluded set data object.
   * @returns {boolean} True if celebration executed.
   */
  function triggerSetCompletionCelebration(set = {}) {
    if (typeof document === 'undefined') return false;

    const setNum = set.setNumber || 1;
    const repsArr = Array.isArray(set.reps) ? set.reps : [];
    const repCount = repsArr.length;
    const weight = Number(set.weight) || 0;
    const avgVel = Number(set.avgVelocity) || 0;
    const maxVel = Number(set.maxVelocity) || 0;
    const velLoss = Number(set.velocityLossPct) || 0;
    const isPR = Boolean(set.isPR || (repsArr.some(r => r && r.isPR)));

    // 1. Trigger Dynamic Glass Bloom Pulse on Telemetry Hero Card
    const heroCard = document.getElementById('rpe-hero-card');
    if (heroCard) {
      heroCard.classList.remove('set-completing-pulse');
      // Trigger browser reflow to restart keyframe animation
      void heroCard.offsetWidth;
      heroCard.classList.add('set-completing-pulse');

      setTimeout(() => {
        heroCard.classList.remove('set-completing-pulse');
      }, 1000);
    }

    // 2. Determine Particle Tier and Emit Spark Burst
    let particleTier = 'default';
    if (isPR) {
      particleTier = 'gold';
    } else if (avgVel >= 1.00) {
      particleTier = 'cyan';
    } else if (avgVel >= 0.75 || velLoss < 10) {
      particleTier = 'emerald';
    } else if (avgVel < 0.35 || velLoss >= 20) {
      particleTier = 'crimson';
    }
    emitCelebrationSparks(particleTier, isPR ? 36 : 26);

    // 3. Render / Update Post-Set Summary Banner
    let summaryBanner = document.getElementById('set-summary-banner');
    if (!summaryBanner) {
      // Create dynamically if not yet in DOM
      summaryBanner = document.createElement('div');
      summaryBanner.className = 'set-summary-banner glass-card';
      summaryBanner.id = 'set-summary-banner';
      summaryBanner.setAttribute('role', 'status');
      summaryBanner.setAttribute('aria-live', 'polite');

      summaryBanner.innerHTML = `
        <div class="summary-check-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="summary-text-block">
          <span class="summary-title" id="summary-set-title">SET ${setNum} COMPLETED</span>
          <span class="summary-metrics font-mono" id="summary-set-metrics"></span>
        </div>
        <div class="summary-rest-countdown font-mono" id="summary-rest-countdown">
          <span class="rest-timer-label">REST</span>
          <span class="rest-time-val" id="summary-rest-time">03:00</span>
        </div>
      `;

      if (heroCard && heroCard.parentNode) {
        heroCard.parentNode.insertBefore(summaryBanner, heroCard.nextSibling);
      }
    }

    // Populate banner metrics
    const titleEl = document.getElementById('summary-set-title');
    const metricsEl = document.getElementById('summary-set-metrics');

    if (titleEl) {
      titleEl.textContent = isPR ? `SET ${setNum} COMPLETED — PR!` : `SET ${setNum} COMPLETED`;
    }

    if (metricsEl) {
      const weightStr = weight > 0 ? ` @ ${weight.toFixed(1)} kg` : '';
      const repLabel = repCount === 1 ? '1 REP' : `${repCount} REPS`;
      const avgStr = avgVel > 0 ? ` • AVG ${avgVel.toFixed(2)} m/s` : '';
      const lossStr = velLoss > 0 ? ` • VL ${velLoss.toFixed(1)}%` : '';
      metricsEl.textContent = `${repLabel}${weightStr}${avgStr}${lossStr}`;
    }

    // Reveal banner with slide-down transition
    summaryBanner.classList.add('visible');

    // 4. Start Rest Countdown (Prescribed 3:00 / 180s default)
    const restSeconds = set.prescribedRestSeconds || 180;
    startRestCountdown(restSeconds);

    // 5. Sound & Haptic Fanfare
    playCelebrationFanfare(isPR, velLoss);

    return true;
  }

  // ── In-Flight Coach Cue HUD Controller ──
  let coachCueTimeout = null;

  /**
   * Displays a non-intrusive floating coach cue pill during workouts.
   * @param {string} cueText - Text instruction from coach.
   * @param {number} [durationMs=4500] - Duration to display before auto-dismissing.
   */
  function showCoachCue(cueText, durationMs = 4500) {
    if (typeof document === 'undefined' || !cueText) return;

    let cueHud = document.getElementById('in-flight-coach-cue');
    if (!cueHud) {
      cueHud = document.createElement('div');
      cueHud.className = 'coach-cue-hud';
      cueHud.id = 'in-flight-coach-cue';
      cueHud.setAttribute('aria-live', 'polite');

      const pill = document.createElement('div');
      pill.className = 'coach-cue-pill';
      const dot = document.createElement('span');
      dot.className = 'coach-cue-dot';
      const text = document.createElement('span');
      text.className = 'coach-cue-text font-mono';
      text.id = 'in-flight-cue-text';
      pill.appendChild(dot);
      pill.appendChild(text);
      cueHud.appendChild(pill);

      const heroCard = document.getElementById('rpe-hero-card');
      if (heroCard) {
        heroCard.appendChild(cueHud);
      } else if (document.body) {
        document.body.appendChild(cueHud);
      }
    }

    const textEl = document.getElementById('in-flight-cue-text') || (cueHud ? cueHud.querySelector('#in-flight-cue-text, .coach-cue-text') : null);
    if (textEl) {
      textEl.textContent = `CUE: ${cueText}`;
    }

    cueHud.classList.add('active');

    if (coachCueTimeout) clearTimeout(coachCueTimeout);
    if (durationMs > 0) {
      coachCueTimeout = setTimeout(() => {
        hideCoachCue();
      }, durationMs);
    }
  }

  /**
   * Hides the in-flight coach cue HUD.
   */
  function hideCoachCue() {
    if (typeof document === 'undefined') return;
    const cueHud = document.getElementById('in-flight-coach-cue');
    if (cueHud) {
      cueHud.classList.remove('active');
    }
    if (coachCueTimeout) {
      clearTimeout(coachCueTimeout);
      coachCueTimeout = null;
    }
  }

  // ── Rest Directive Modal & Auto-Accept Ring Controller ──
  let autoAcceptTimer = null;
  let autoAcceptRemainingSecs = 20;

  /**
   * Displays the coach directive modal for rest intervals (e.g. load adjustments).
   * @param {Object} directive - Directive object { coachName, prevWeight, newWeight, reason, cueText, autoAcceptSecs }.
   * @param {Function} [onAccept] - Callback when accepted.
   * @param {Function} [onDismiss] - Callback when dismissed / kept previous weight.
   */
  function showCoachDirectiveModal(directive = {}, onAccept = null, onDismiss = null) {
    if (typeof document === 'undefined') return;

    dismissCoachDirectiveModal();

    let modal = document.getElementById('coach-directive-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'coach-directive-modal';
      modal.id = 'coach-directive-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'coach-sender-name');

      document.body.appendChild(modal);
    }

    const coachName = directive.coachName || 'Coach';
    const initials = coachName.split(' ').map(s => s[0]).join('').substring(0, 2).toUpperCase() || 'CM';
    const prevWeight = Number(directive.prevWeight) || 0;
    const newWeight = Number(directive.newWeight) || 0;
    const delta = newWeight - prevWeight;
    const deltaSign = delta >= 0 ? '+' : '';
    const deltaClass = delta >= 0 ? 'positive' : 'negative';
    const deltaText = `(${deltaSign}${delta.toFixed(1)} kg)`;
    const reasonText = directive.reason || 'Load adjustment based on set velocity drop-off';
    const cueText = directive.cueText || '';
    autoAcceptRemainingSecs = Math.max(5, parseInt(directive.autoAcceptSecs, 10) || 20);

    const circumference = 81.68; // 2 * PI * 13

    modal.innerHTML = `
      <div class="coach-directive-card">
        <div class="directive-header">
          <div class="coach-avatar-badge">
            <span class="coach-avatar-initials">${initials}</span>
            <span class="coach-online-ping"></span>
          </div>
          <div class="directive-meta">
            <span class="coach-name" id="coach-sender-name">${coachName}</span>
            <span class="directive-type-label">LOAD ADJUSTMENT & CUE</span>
          </div>
          <span class="directive-timestamp font-mono">Just now</span>
        </div>

        <div class="directive-body">
          <div class="directive-load-box">
            <div class="load-comparison font-mono">
              <span class="load-previous">${prevWeight.toFixed(1)} kg</span>
              <span class="load-arrow">→</span>
              <span class="load-prescribed highlight-accent">${newWeight.toFixed(1)} kg</span>
              <span class="load-delta ${deltaClass}">${deltaText}</span>
            </div>
            <div class="load-reason">${reasonText}</div>
          </div>

          ${cueText ? `
            <div class="directive-cue-box">
              <span class="cue-quote-icon">“</span>
              <p class="cue-message">${cueText}</p>
            </div>
          ` : ''}
        </div>

        <div class="directive-actions">
          <button type="button" class="btn-directive-dismiss" id="btn-coach-dismiss">
            KEEP ${prevWeight.toFixed(1)} kg
          </button>
          <button type="button" class="btn-directive-accept" id="btn-coach-accept">
            <span class="countdown-ring">
              <svg class="auto-accept-svg" viewBox="0 0 32 32">
                <circle class="auto-accept-track" cx="16" cy="16" r="13"></circle>
                <circle class="auto-accept-fill" id="coach-accept-ring" cx="16" cy="16" r="13"></circle>
              </svg>
            </span>
            <span class="btn-accept-label">ACCEPT (${deltaSign}${delta.toFixed(1)} kg)</span>
            <span class="countdown-seconds font-mono" id="coach-countdown-sec">${autoAcceptRemainingSecs}s</span>
          </button>
        </div>
      </div>
    `;

    modal.classList.add('open');

    const btnAccept = modal.querySelector('#btn-coach-accept');
    const btnDismiss = modal.querySelector('#btn-coach-dismiss');
    const ringEl = modal.querySelector('#coach-accept-ring');
    const secEl = modal.querySelector('#coach-countdown-sec');

    function commitAccept() {
      dismissCoachDirectiveModal();
      if (typeof onAccept === 'function') onAccept(newWeight, directive);
    }

    function commitDismiss() {
      dismissCoachDirectiveModal();
      if (typeof onDismiss === 'function') onDismiss(prevWeight, directive);
    }

    if (btnAccept) btnAccept.addEventListener('click', commitAccept);
    if (btnDismiss) btnDismiss.addEventListener('click', commitDismiss);

    // Auto-accept countdown loop
    const totalSecs = autoAcceptRemainingSecs;
    if (ringEl) ringEl.style.strokeDashoffset = '0';

    autoAcceptTimer = setInterval(() => {
      autoAcceptRemainingSecs -= 1;
      if (secEl) secEl.textContent = `${autoAcceptRemainingSecs}s`;

      if (ringEl) {
        const progress = (totalSecs - autoAcceptRemainingSecs) / totalSecs;
        ringEl.style.strokeDashoffset = String((progress * circumference).toFixed(2));
      }

      if (autoAcceptRemainingSecs <= 0) {
        commitAccept();
      }
    }, 1000);
  }

  /**
   * Closes the coach directive modal and stops the auto-accept countdown.
   */
  function dismissCoachDirectiveModal() {
    if (autoAcceptTimer) {
      clearInterval(autoAcceptTimer);
      autoAcceptTimer = null;
    }
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('coach-directive-modal');
    if (modal) {
      modal.classList.remove('open');
    }
  }

  // ── Public Export Interface ──
  const AthleteFX = {
    VELOCITY_ZONES,
    getVelocityZone,
    renderVelocityZoneBadge,
    emitCelebrationSparks,
    triggerSetCompletionCelebration,
    startRestCountdown,
    stopRestCountdown,
    playCelebrationFanfare,
    showCoachCue,
    hideCoachCue,
    showCoachDirectiveModal,
    dismissCoachDirectiveModal
  };

  // Expose directly to global/window context for seamless inter-module use
  if (typeof global !== 'undefined') {
    global.AthleteFX = AthleteFX;
    global.triggerSetCompletionCelebration = triggerSetCompletionCelebration;
    global.renderVelocityZoneBadge = renderVelocityZoneBadge;
    global.getVelocityZone = getVelocityZone;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AthleteFX;
  }

})(typeof window !== 'undefined' ? window : globalThis);
