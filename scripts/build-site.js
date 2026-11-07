// Copies only the static web assets referenced by index.html into ./dist
// so Base44 hosting never receives tests, docs, PDFs or node_modules.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const files = [
  'index.html',
  'style.css',
  'coach.css',
  'athlete-fx.css',
  'coach-cue-hud.css',
  'app.js',
  'coach-portal.js',
  'athlete-fx.js',
  'coach-cue-hud.js',
  'sync-bus.js',
  'base44-client.js'
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const f of files) {
  fs.copyFileSync(path.join(root, f), path.join(dist, f));
}
console.log(`Built ${files.length} static files into ${dist}`);
