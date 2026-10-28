const fs = require('fs');
const assert = require('assert');

// Simple DOM element mock
class MockElement {
  constructor(tag, id = '', className = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = {
      _classes: new Set(className.split(' ').filter(Boolean)),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c)
    };
    this.style = {};
    this.attributes = {};
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.listeners = {};
    this.children = [];
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(ev, cb) {
    if (!this.listeners[ev]) this.listeners[ev] = [];
    this.listeners[ev].push(cb);
  }
  click() {
    if (this.listeners['click']) {
      this.listeners['click'].forEach(cb => cb({ stopPropagation: () => {} }));
    }
  }
  querySelector(sel) { return null; }
  querySelectorAll(sel) { return []; }
}

const mockDoc = {
  readyState: 'complete',
  body: new MockElement('body', '', 'theme-deadlift'),
  elements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = new MockElement('div', id);
    }
    return this.elements[id];
  },
  querySelectorAll(sel) { return []; },
  addEventListener: () => {}
};

global.document = mockDoc;
global.window = {
  addEventListener: () => {},
  dispatchEvent: (e) => {},
  document: mockDoc,
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  }
};

const CoachPortal = require('../coach-portal.js');

// 1. Verify init
CoachPortal.init();
assert.strictEqual(CoachPortal.getIsCoachMode(), false, "Initial mode should be athlete");

// 2. Switch to coach mode
CoachPortal.switchMode('coach');
assert.strictEqual(CoachPortal.getIsCoachMode(), true, "Mode should be coach");
assert.strictEqual(mockDoc.body.classList.contains('portal-coach'), true, "body must have portal-coach class");
assert.strictEqual(mockDoc.getElementById('view-coach').style.display, 'flex', "#view-coach must be flex");
assert.strictEqual(mockDoc.getElementById('btn-mode-coach').classList.contains('active'), true, "#btn-mode-coach must be active");
assert.strictEqual(mockDoc.getElementById('btn-mode-athlete').classList.contains('active'), false, "#btn-mode-athlete must not be active");

// 3. Switch back to athlete mode
CoachPortal.switchMode('athlete');
assert.strictEqual(CoachPortal.getIsCoachMode(), false, "Mode should be athlete");
assert.strictEqual(mockDoc.body.classList.contains('portal-coach'), false, "body must not have portal-coach class");
assert.strictEqual(mockDoc.getElementById('view-coach').style.display, 'none', "#view-coach must be none");
assert.strictEqual(mockDoc.getElementById('btn-mode-athlete').classList.contains('active'), true, "#btn-mode-athlete must be active");
assert.strictEqual(mockDoc.getElementById('btn-mode-coach').classList.contains('active'), false, "#btn-mode-coach must not be active");

// 4. Test Coach Cue Prescription
let dispatchedEvent = null;
global.window.dispatchEvent = (ev) => { dispatchedEvent = ev; };

CoachPortal.sendCoachPrescription('Drive hips!', 2.5, 142.5);
assert.ok(dispatchedEvent, "Must dispatch CustomEvent when sending prescription");

console.log("ALL COACH PORTAL JS DOM SIMULATION TESTS PASSED!");
