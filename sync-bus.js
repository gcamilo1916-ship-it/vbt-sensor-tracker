/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EROS SYNC BUS — EVENT SYNCHRONIZATION ENGINE
 * High-Precision In-Memory, Cross-Tab & Multi-Screen Synchronization Engine
 * Exclusively for Eros Velocity-Based Training
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.ErosEventBus = exports.ErosEventBus;
    root.ErosSyncBus = exports.ErosSyncBus;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Standard Typed Event Constants ──
  const EVENTS = Object.freeze({
    SET_STARTED: 'set:started',
    REP_RECORDED: 'rep:recorded',
    SET_COMPLETED: 'set:completed',
    COACH_CUE: 'coach:cue',
    COACH_LOAD_OVERRIDE: 'coach:load_override',
    COACH_LOAD_RESPONSE: 'coach:load_response',
    COACH_REST_TARGET: 'coach:rest_target',
    ATHLETE_CONNECT: 'athlete:connect'
  });

  const BROADCAST_CHANNEL_NAME = 'eros_coach_sync_v1';
  const STORAGE_FALLBACK_KEY = 'eros_coach_sync_v1_storage';

  // ── Event Payload Validators ──

  function validateSetStarted(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('[ErosSyncBus] Payload for set:started must be an object');
    }
    if (data.setId == null || String(data.setId).trim() === '') {
      throw new TypeError('[ErosSyncBus] set:started requires non-empty setId');
    }
    const setNumber = Number(data.setNumber);
    if (isNaN(setNumber) || setNumber <= 0) {
      throw new TypeError('[ErosSyncBus] set:started requires positive numeric setNumber');
    }
    if (!data.lift || typeof data.lift !== 'string' || data.lift.trim() === '') {
      throw new TypeError('[ErosSyncBus] set:started requires non-empty string lift');
    }
    const weight = Number(data.weight);
    if (isNaN(weight) || weight < 0) {
      throw new TypeError('[ErosSyncBus] set:started requires non-negative numeric weight');
    }
    const timestamp = (typeof data.timestamp === 'number' && !isNaN(data.timestamp))
      ? data.timestamp
      : Date.now();

    let restSeconds = null;
    if (data.restSeconds != null) {
      const parsed = Number(data.restSeconds);
      if (!isNaN(parsed) && parsed >= 0) {
        restSeconds = Math.round(parsed);
      }
    }

    const payload = {
      setId: String(data.setId).trim(),
      setNumber: Math.round(setNumber),
      lift: data.lift.trim(),
      weight: Math.round(weight * 10) / 10,
      timestamp: timestamp
    };
    if (restSeconds !== null) {
      payload.restSeconds = restSeconds;
    }
    return payload;
  }

  function validateRepRecorded(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('[ErosSyncBus] Payload for rep:recorded must be an object');
    }
    if (data.setId == null || String(data.setId).trim() === '') {
      throw new TypeError('[ErosSyncBus] rep:recorded requires non-empty setId');
    }
    const repNumber = Number(data.repNumber);
    if (isNaN(repNumber) || repNumber <= 0) {
      throw new TypeError('[ErosSyncBus] rep:recorded requires positive numeric repNumber');
    }
    const velocity = Number(data.velocity != null ? data.velocity : data.meanVelocity);
    if (isNaN(velocity) || velocity < 0) {
      throw new TypeError('[ErosSyncBus] rep:recorded requires non-negative numeric velocity');
    }
    const peakVelocity = Number(data.peakVelocity != null ? data.peakVelocity : velocity);
    const rom = Number(data.rom != null ? data.rom : (data.romCm != null ? data.romCm : 0));
    const rpe = Number(data.rpe != null ? data.rpe : 0);
    const lossPercent = Number(data.lossPercent != null ? data.lossPercent : (data.velocityLossPct != null ? data.velocityLossPct : 0));

    const payload = {
      setId: String(data.setId).trim(),
      repNumber: Math.round(repNumber),
      velocity: Math.round(velocity * 100) / 100,
      peakVelocity: Math.round(peakVelocity * 100) / 100,
      rom: Math.round(rom * 10) / 10,
      rpe: Math.round(rpe * 10) / 10,
      lossPercent: Math.round(lossPercent * 10) / 10
    };
    if (data.deviationCm != null) {
      const dev = Number(data.deviationCm);
      if (!isNaN(dev)) payload.deviationCm = Math.round(dev * 10) / 10;
    }
    if (data.maxDeviationCm != null) {
      const maxDev = Number(data.maxDeviationCm);
      if (!isNaN(maxDev)) payload.maxDeviationCm = Math.round(maxDev * 10) / 10;
    }
    if (data.pathEfficiencyPct != null) {
      const eff = Number(data.pathEfficiencyPct);
      if (!isNaN(eff)) payload.pathEfficiencyPct = Math.round(eff * 10) / 10;
    }
    if (Array.isArray(data.trajectoryPoints)) {
      payload.trajectoryPoints = data.trajectoryPoints.map(pt => {
        if (!pt || typeof pt !== 'object') return pt;
        const out = { ...pt };
        if (pt.t != null) out.t = Number(pt.t);
        if (pt.y != null) out.y = Math.round(Number(pt.y) * 10) / 10;
        if (pt.dx != null) out.dx = Math.round(Number(pt.dx) * 10) / 10;
        if (pt.x != null) out.x = Math.round(Number(pt.x) * 10) / 10;
        if (pt.v != null) out.v = Math.round(Number(pt.v) * 100) / 100;
        return out;
      });
    }
    return payload;
  }

  function validateSetCompleted(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('[ErosSyncBus] Payload for set:completed must be an object');
    }
    if (data.setId == null || String(data.setId).trim() === '') {
      throw new TypeError('[ErosSyncBus] set:completed requires non-empty setId');
    }
    const setNumber = Number(data.setNumber);
    if (isNaN(setNumber) || setNumber <= 0) {
      throw new TypeError('[ErosSyncBus] set:completed requires positive numeric setNumber');
    }
    if (!data.lift || typeof data.lift !== 'string' || data.lift.trim() === '') {
      throw new TypeError('[ErosSyncBus] set:completed requires non-empty string lift');
    }
    const weight = Number(data.weight);
    if (isNaN(weight) || weight < 0) {
      throw new TypeError('[ErosSyncBus] set:completed requires non-negative numeric weight');
    }
    const reps = Array.isArray(data.reps) ? data.reps : [];
    const avgVelocity = Number(data.avgVelocity != null ? data.avgVelocity : 0);
    const maxVelocity = Number(data.maxVelocity != null ? data.maxVelocity : 0);
    const velocityLoss = Number(data.velocityLoss != null ? data.velocityLoss : (data.velocityLossPct != null ? data.velocityLossPct : 0));
    const timestamp = (typeof data.timestamp === 'number' && !isNaN(data.timestamp))
      ? data.timestamp
      : Date.now();

    let restSeconds = null;
    if (data.restSeconds != null) {
      const parsed = Number(data.restSeconds);
      if (!isNaN(parsed) && parsed >= 0) {
        restSeconds = Math.round(parsed);
      }
    }

    const payload = {
      setId: String(data.setId).trim(),
      setNumber: Math.round(setNumber),
      lift: data.lift.trim(),
      weight: Math.round(weight * 10) / 10,
      reps: reps,
      avgVelocity: Math.round(avgVelocity * 100) / 100,
      maxVelocity: Math.round(maxVelocity * 100) / 100,
      velocityLoss: Math.round(velocityLoss * 10) / 10,
      timestamp: timestamp
    };
    if (restSeconds !== null) {
      payload.restSeconds = restSeconds;
    }
    if (data.deviationCm != null) {
      const dev = Number(data.deviationCm);
      if (!isNaN(dev)) payload.deviationCm = Math.round(dev * 10) / 10;
    }
    if (data.maxDeviationCm != null) {
      const maxDev = Number(data.maxDeviationCm);
      if (!isNaN(maxDev)) payload.maxDeviationCm = Math.round(maxDev * 10) / 10;
    } else if (payload.deviationCm != null) {
      payload.maxDeviationCm = payload.deviationCm;
    }
    if (data.pathEfficiencyPct != null) {
      const eff = Number(data.pathEfficiencyPct);
      if (!isNaN(eff)) payload.pathEfficiencyPct = Math.round(eff * 10) / 10;
    }
    if (Array.isArray(data.trajectoryPoints)) {
      payload.trajectoryPoints = data.trajectoryPoints.map(pt => {
        if (!pt || typeof pt !== 'object') return pt;
        const out = { ...pt };
        if (pt.t != null) out.t = Number(pt.t);
        if (pt.y != null) out.y = Math.round(Number(pt.y) * 10) / 10;
        if (pt.dx != null) out.dx = Math.round(Number(pt.dx) * 10) / 10;
        if (pt.x != null) out.x = Math.round(Number(pt.x) * 10) / 10;
        if (pt.v != null) out.v = Math.round(Number(pt.v) * 100) / 100;
        return out;
      });
    }
    if (typeof data.avgRpe === 'number' && !isNaN(data.avgRpe)) {
      payload.avgRpe = Math.round(data.avgRpe * 10) / 10;
    } else if (typeof data.rpe === 'number' && !isNaN(data.rpe)) {
      payload.avgRpe = Math.round(data.rpe * 10) / 10;
    }
    if (typeof data.targetRpe === 'number' && !isNaN(data.targetRpe)) {
      payload.targetRpe = Math.round(data.targetRpe * 10) / 10;
    }
    if (data.athleteId) {
      payload.athleteId = String(data.athleteId).trim();
    }
    if (data.athleteName) {
      payload.athleteName = String(data.athleteName).trim();
    }
    if (data.pairingCode) {
      payload.pairingCode = String(data.pairingCode).trim();
    }
    return payload;
  }

  function validateCoachCue(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('[ErosSyncBus] Payload for coach:cue must be an object');
    }
    if (data.text == null || String(data.text).trim() === '') {
      throw new TypeError('[ErosSyncBus] coach:cue requires non-empty text');
    }
    const id = (data.id != null && String(data.id).trim() !== '')
      ? String(data.id).trim()
      : `cue_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const type = (data.type != null && String(data.type).trim() !== '')
      ? String(data.type).trim()
      : 'technical';
    const timestamp = (typeof data.timestamp === 'number' && !isNaN(data.timestamp))
      ? data.timestamp
      : Date.now();

    const payload = {
      id: id,
      text: String(data.text).trim(),
      type: type,
      timestamp: timestamp
    };
    if (data.coachName) payload.coachName = String(data.coachName).trim();
    if (data.athleteId) payload.athleteId = String(data.athleteId).trim();
    if (typeof data.deltaKg === 'number') payload.deltaKg = data.deltaKg;
    if (typeof data.newWeight === 'number') payload.newWeight = data.newWeight;
    if (typeof data.autoAcceptSeconds === 'number') payload.autoAcceptSeconds = data.autoAcceptSeconds;
    return payload;
  }

  function validateCoachLoadOverride(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('[ErosSyncBus] Payload for coach:load_override must be an object');
    }
    const deltaKg = Number(data.deltaKg);
    if (isNaN(deltaKg)) {
      throw new TypeError('[ErosSyncBus] coach:load_override requires numeric deltaKg');
    }
    const newWeight = Number(data.newWeight != null ? data.newWeight : data.prescribedWeightKg);
    if (isNaN(newWeight) || newWeight < 0) {
      throw new TypeError('[ErosSyncBus] coach:load_override requires non-negative numeric newWeight');
    }
    const id = (data.id != null && String(data.id).trim() !== '')
      ? String(data.id).trim()
      : `override_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const autoAcceptSeconds = (typeof data.autoAcceptSeconds === 'number' && !isNaN(data.autoAcceptSeconds) && data.autoAcceptSeconds >= 0)
      ? data.autoAcceptSeconds
      : 20;
    const timestamp = (typeof data.timestamp === 'number' && !isNaN(data.timestamp))
      ? data.timestamp
      : Date.now();

    const payload = {
      id: id,
      deltaKg: Math.round(deltaKg * 10) / 10,
      newWeight: Math.round(newWeight * 10) / 10,
      autoAcceptSeconds: Math.round(autoAcceptSeconds),
      timestamp: timestamp
    };
    if (data.coachName) payload.coachName = String(data.coachName).trim();
    if (data.text) payload.text = String(data.text).trim();
    if (data.reason) payload.reason = String(data.reason).trim();
    if (data.cueText) payload.cueText = String(data.cueText).trim();
    if (data.athleteId) payload.athleteId = String(data.athleteId).trim();
    return payload;
  }

  function validateCoachLoadResponse(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('[ErosSyncBus] Payload for coach:load_response must be an object');
    }
    if (data.id == null || String(data.id).trim() === '') {
      throw new TypeError('[ErosSyncBus] coach:load_response requires non-empty id');
    }
    const accepted = Boolean(data.accepted);
    const finalWeight = Number(data.finalWeight != null ? data.finalWeight : (data.newWeight != null ? data.newWeight : 0));
    if (isNaN(finalWeight) || finalWeight < 0) {
      throw new TypeError('[ErosSyncBus] coach:load_response requires non-negative numeric finalWeight');
    }
    const timestamp = (typeof data.timestamp === 'number' && !isNaN(data.timestamp))
      ? data.timestamp
      : Date.now();

    return {
      id: String(data.id).trim(),
      accepted: accepted,
      finalWeight: Math.round(finalWeight * 10) / 10,
      timestamp: timestamp
    };
  }

  function validateCoachRestTarget(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('[ErosSyncBus] Payload for coach:rest_target must be an object');
    }
    const targetSeconds = Number(data.targetSeconds != null ? data.targetSeconds : data.seconds);
    if (isNaN(targetSeconds) || targetSeconds <= 0) {
      throw new TypeError('[ErosSyncBus] coach:rest_target requires positive numeric targetSeconds');
    }
    const athleteId = (data.athleteId != null && String(data.athleteId).trim() !== '')
      ? String(data.athleteId).trim()
      : 'ath_01';
    const timestamp = (typeof data.timestamp === 'number' && !isNaN(data.timestamp))
      ? data.timestamp
      : Date.now();

    return {
      athleteId: athleteId,
      targetSeconds: Math.round(targetSeconds),
      timestamp: timestamp
    };
  }

  function validateAthleteConnect(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('[ErosSyncBus] Payload for athlete:connect must be an object');
    }
    const athleteId = (data.athleteId != null && String(data.athleteId).trim() !== '')
      ? String(data.athleteId).trim()
      : 'ath_01';
    const athleteName = (data.athleteName != null && String(data.athleteName).trim() !== '')
      ? String(data.athleteName).trim()
      : 'Active Athlete';
    const coachCode = (data.coachCode != null && String(data.coachCode).trim() !== '')
      ? String(data.coachCode).trim().toUpperCase()
      : '';
    const rackId = (data.rackId != null && String(data.rackId).trim() !== '')
      ? String(data.rackId).trim()
      : 'Rack 01';
    const timestamp = (typeof data.timestamp === 'number' && !isNaN(data.timestamp))
      ? data.timestamp
      : Date.now();

    return {
      athleteId: athleteId,
      athleteName: athleteName,
      coachCode: coachCode,
      rackId: rackId,
      timestamp: timestamp
    };
  }

  const VALIDATORS = {
    [EVENTS.SET_STARTED]: validateSetStarted,
    [EVENTS.REP_RECORDED]: validateRepRecorded,
    [EVENTS.SET_COMPLETED]: validateSetCompleted,
    [EVENTS.COACH_CUE]: validateCoachCue,
    [EVENTS.COACH_LOAD_OVERRIDE]: validateCoachLoadOverride,
    [EVENTS.COACH_LOAD_RESPONSE]: validateCoachLoadResponse,
    [EVENTS.COACH_REST_TARGET]: validateCoachRestTarget,
    [EVENTS.ATHLETE_CONNECT]: validateAthleteConnect
  };

  /**
   * ErosEventBus
   * High-reliability pub/sub bus supporting local listeners,
   * typed payload validation, BroadcastChannel cross-tab synchronization,
   * and automatic localStorage fallback.
   */
  class ErosEventBus {
    constructor(options = {}) {
      this.channelName = options.channelName || BROADCAST_CHANNEL_NAME;
      this.storageKey = options.storageKey || STORAGE_FALLBACK_KEY;
      this.busId = options.busId || `bus_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      this.listeners = new Map();
      this.lastEvents = {};
      this.history = [];
      this.maxHistory = options.maxHistory || 100;
      this.isClosed = false;

      // Base44 Cloud Bridge state
      this.cloudRoom = null;
      this.cloudSub = null;
      this.cloudPairingCode = null;
      this.base44Client = options.base44Client || null;

      // Bind storage listener for cleanup
      this._onStorageEvent = this._onStorageEvent.bind(this);

      // Initialize cross-tab BroadcastChannel
      this._initBroadcastChannel();

      // Initialize localStorage fallback listener
      this._initStorageFallback();

      if (options.pairingCode) {
        this.connectCloud(options.pairingCode, this.base44Client);
      }
    }

    static get EVENTS() {
      return EVENTS;
    }

    _initBroadcastChannel() {
      this.channel = null;
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.channel = new BroadcastChannel(this.channelName);
          if (typeof this.channel.unref === 'function') {
            this.channel.unref();
          }
          this.channel.onmessage = (event) => {
            if (this.isClosed || !event || !event.data) return;
            const { type, payload, senderId } = event.data;
            if (senderId && senderId !== this.busId && type) {
              this._dispatchLocal(type, payload, false);
            }
          };
        } catch (_) {
          this.channel = null;
        }
      }
    }

    _initStorageFallback() {
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('storage', this._onStorageEvent);
      }
    }

    _onStorageEvent(e) {
      if (this.isClosed || !e || e.key !== this.storageKey || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed && parsed.senderId && parsed.senderId !== this.busId && parsed.type) {
          this._dispatchLocal(parsed.type, parsed.payload, false);
        }
      } catch (_) {
        // Safe ignoring of corrupted storage messages
      }
    }

    /**
     * Validates and normalizes payload for an event type
     */
    validate(event, data) {
      const validator = VALIDATORS[event];
      if (typeof validator === 'function') {
        return validator(data);
      }
      return data;
    }

    /**
     * Registers a subscriber callback for an event
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
      if (typeof handler !== 'function') {
        throw new TypeError('[ErosSyncBus] Event handler must be a function');
      }
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event).add(handler);

      return () => this.off(event, handler);
    }

    /**
     * Registers a one-time subscriber callback
     * @returns {Function} Unsubscribe function
     */
    once(event, handler) {
      if (typeof handler !== 'function') {
        throw new TypeError('[ErosSyncBus] Event handler must be a function');
      }
      const wrapped = (payload) => {
        this.off(event, wrapped);
        handler(payload);
      };
      return this.on(event, wrapped);
    }

    /**
     * Unregisters a subscriber callback or all callbacks for an event
     */
    off(event, handler) {
      if (!this.listeners.has(event)) return;
      if (typeof handler === 'function') {
        this.listeners.get(event).delete(handler);
        if (this.listeners.get(event).size === 0) {
          this.listeners.delete(event);
        }
      } else {
        this.listeners.delete(event);
      }
    }

    /**
     * Dispatches an event locally and across tabs
     * @param {string} event Event name
     * @param {*} data Event payload
     * @param {Object} [options]
     * @param {boolean} [options.broadcast=true] Whether to broadcast cross-tab
     * @returns {*} Validated payload
     */
    emit(event, data, options = {}) {
      if (this.isClosed) return data;
      if (!event || typeof event !== 'string') {
        throw new TypeError('[ErosSyncBus] Event name must be a non-empty string');
      }

      // 1. Validate payload
      const validated = this.validate(event, data);

      // 2. Cache latest event state
      this.lastEvents[event] = validated;
      this.history.push({ event, data: validated, timestamp: Date.now() });
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }

      // 3. Dispatch locally
      this._dispatchLocal(event, validated, true);

      // 4. Broadcast cross-tab and cloud if enabled
      const shouldBroadcast = options.broadcast !== false;
      if (shouldBroadcast) {
        this._broadcastCrossTab(event, validated);
        if (typeof this._broadcastCloud === 'function') {
          this._broadcastCloud(event, validated);
        }
      }

      return validated;
    }

    _dispatchLocal(event, payload, isOriginator) {
      // Specific event listeners
      if (this.listeners.has(event)) {
        const eventHandlers = Array.from(this.listeners.get(event));
        for (let i = 0; i < eventHandlers.length; i++) {
          try {
            eventHandlers[i](payload, { event, isOriginator });
          } catch (err) {
            console.error(`[ErosSyncBus] Error in listener for ${event}:`, err);
          }
        }
      }

      // Wildcard '*' listeners
      if (this.listeners.has('*')) {
        const wildcardHandlers = Array.from(this.listeners.get('*'));
        for (let j = 0; j < wildcardHandlers.length; j++) {
          try {
            wildcardHandlers[j](event, payload, { isOriginator });
          } catch (err) {
            console.error(`[ErosSyncBus] Error in wildcard listener for ${event}:`, err);
          }
        }
      }
    }

    _broadcastCrossTab(event, payload) {
      const messagePacket = {
        type: event,
        payload: payload,
        senderId: this.busId,
        timestamp: Date.now()
      };

      let broadcastSucceeded = false;

      // Primary cross-tab channel: BroadcastChannel
      if (this.channel) {
        try {
          this.channel.postMessage(messagePacket);
          broadcastSucceeded = true;
        } catch (_) {
          broadcastSucceeded = false;
        }
      }

      // Fallback cross-tab channel: localStorage event broadcasting
      // If BroadcastChannel is not supported or failed, use storage events
      if (!broadcastSucceeded && typeof window !== 'undefined' && window.localStorage) {
        try {
          const serialized = JSON.stringify({
            ...messagePacket,
            nonce: Math.random()
          });
          window.localStorage.setItem(this.storageKey, serialized);
        } catch (_) {
          // Ignore localStorage quota errors
        }
      }
    }

    /**
     * Returns the most recent payload emitted for an event
     */
    getLast(event) {
      return this.lastEvents[event] || null;
    }

    /**
     * Returns recent event history
     */
    getHistory(limit = 20) {
      return this.history.slice(-limit);
    }

    /**
     * Clears history log
     */
    clearHistory() {
      this.history = [];
    }

    /**
     * Returns the count of active listeners for an event
     */
    listenerCount(event) {
      if (!this.listeners.has(event)) return 0;
      return this.listeners.get(event).size;
    }

    /**
     * Returns an array of event names currently having listeners
     */
    eventNames() {
      return Array.from(this.listeners.keys());
    }

    /**
     * Clears all listeners
     */
    clear(event) {
      if (event) {
        this.listeners.delete(event);
      } else {
        this.listeners.clear();
      }
    }

    /**
     * Connects to the Base44 realtime actor room for cross-device synchronization
     * @param {string} [pairingCode] Room / squad session code (e.g. 'EROS-7X9K')
     * @param {Object} [client] Optional Base44 SDK client instance
     * @returns {boolean} Whether connection was initiated
     */
    connectCloud(pairingCode, client) {
      if (client) this.base44Client = client;
      const b44 = this.base44Client || (typeof base44 !== 'undefined' ? base44 : (typeof window !== 'undefined' ? window.base44 : null));
      if (!b44 || !b44.actors || typeof b44.actors.SquadSession !== 'function') {
        return false;
      }

      const code = String(pairingCode || this.cloudPairingCode || 'EROS-7X9K').trim().toUpperCase();
      if (this.cloudRoom && this.cloudPairingCode === code) {
        return true;
      }

      this.disconnectCloud();
      this.cloudPairingCode = code;

      try {
        const room = b44.actors.SquadSession(code).connect();
        const sub = room.subscribe((msg) => {
          if (this.isClosed || !msg || typeof msg !== 'object') return;
          const type = msg.type;
          const data = msg.data !== undefined ? msg.data : msg.payload;
          const senderId = msg.senderId || (data && data.senderId);
          if (senderId && senderId === this.busId) return;
          if (type && data) {
            this._dispatchLocal(type, data, false);
          }
        });

        this.cloudRoom = room;
        this.cloudSub = sub;
        return true;
      } catch (err) {
        return false;
      }
    }

    /**
     * Disconnects from the current Base44 realtime actor room
     */
    disconnectCloud() {
      if (this.cloudSub && typeof this.cloudSub.unsubscribe === 'function') {
        try {
          this.cloudSub.unsubscribe();
        } catch (_) {}
      }
      this.cloudSub = null;

      if (this.cloudRoom && typeof this.cloudRoom.close === 'function') {
        try {
          this.cloudRoom.close();
        } catch (_) {}
      }
      this.cloudRoom = null;
      this.cloudPairingCode = null;
    }

    _broadcastCloud(event, payload) {
      if (this.isClosed || !this.cloudRoom || typeof this.cloudRoom.send !== 'function') return;
      try {
        this.cloudRoom.send({
          type: event,
          data: {
            ...payload,
            senderId: this.busId,
            timestamp: payload.timestamp || Date.now()
          }
        });
      } catch (_) {
        // Non-blocking: offline primary path remains untouched
      }
    }

    /**
     * Closes the bus instance, disposing BroadcastChannel and event listeners
     */
    destroy() {
      this.isClosed = true;
      this.clear();
      this.disconnectCloud();
      if (this.channel) {
        try {
          this.channel.close();
        } catch (_) {}
        this.channel = null;
      }
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('storage', this._onStorageEvent);
      }
    }
  }

  // ── Global Singleton Instance ──
  const ErosSyncBus = new ErosEventBus();

  return {
    ErosEventBus,
    ErosSyncBus,
    EVENTS,
    validateRepRecorded,
    validateSetCompleted
  };
});
