// Sweeps the opening angle and checks that every piece behaves like real paper.
// Usage: node tests/kinematics.test.mjs [scene.json ...]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Popup = require('../engine/popup-engine.js');

const EPS = 1e-6;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a, b) => Math.hypot(...sub(a, b));
const at = (f, x, y) => [0, 1, 2].map(i => f.o[i] + f.ax[i] * x + f.ay[i] * y);

const synthetic = {
  book: { title: 'Test', page: [300, 210] },
  spreads: [{
    id: 'all', near: {}, far: {},
    pieces: [
      { id: 'b', type: 'box', x: [60, 240], near: 60, far: 40, height: 90, faces: { front: { outline: 'M0 0 H40 V-20 L60 -35 L80 -20 V0 H180 V90 H0 Z' } } },
      { id: 's1', type: 'step', parent: 'b', x: [70, 230], out: 25, up: 60 },
      { id: 's2', type: 'step', parent: 's1', x: [80, 220], out: 20, up: 30 },
      { id: 'sb', type: 'step', parent: 'b', side: 'back', x: [70, 230], out: 20, up: 50 },
      { id: 'v', type: 'vfold', x: 40, angle: 25, dir: 'right', width: 50, height: 70 },
      { id: 'vl', type: 'vfold', x: 270, angle: 30, dir: 'left', width: 40, farWidth: 30, height: 60 },
      { id: 'sl', type: 'slider', page: 'near', size: [40, 20], track: [[10, 170], [240, 170]] },
    ],
  }],
};

const scenes = process.argv.slice(2).length
  ? process.argv.slice(2).map(f => ({ name: f, scene: JSON.parse(readFileSync(f, 'utf8')) }))
  : [{ name: 'synthetic', scene: synthetic }];

let failures = 0;
const fail = (name, msg) => { failures++; console.error(`FAIL ${name}: ${msg}`); };

for (const { name, scene } of scenes) {
  const v = Popup.validate(scene);
  if (!v.ok) { v.errors.forEach(e => fail(name, 'validate: ' + e)); continue; }
  const model = v.model;
  const { n } = model;
  let checks = 0, worst = { glue: 0, crease: 0, valley: 0 };

  for (let s = 0; s < n; s++) {
    // Opening (far leaf moves) and page turn (near leaf moves).
    const configs = [];
    for (let k = 0; k <= 36; k++) {
      const th = k * 5;
      const a = new Array(n + 1).fill(0); for (let j = 0; j <= s; j++) a[j] = th; configs.push(a);
      const b = new Array(n + 1).fill(0); for (let j = 0; j <= s; j++) b[j] = 180; b[s + 1] = 180 - th; configs.push(b);
    }
    for (const phis of configs) {
      const P = Popup.pose(model, phis, {}, { bare: true, spreads: [s] });
      const S = P.spreads[0];
      const R = S.receivers;
      const theta = S.theta;
      for (const f of S.faces) {
        if (Math.abs(dot(f.ax, f.ay)) > EPS || Math.abs(Math.hypot(...f.ax) - 1) > EPS || Math.abs(Math.hypot(...f.ay) - 1) > EPS) fail(name, `${f.key} frame not orthonormal at theta ${theta}`);
        if (f.kind === 'tab') continue;
        for (const c of Popup.corners(f)) {
          const dn = dot(sub(c, R.near.o), R.near.n), df = dot(sub(c, R.far.o), R.far.n);
          const below = Math.min(dn, df);
          if (theta > 0.5 && below < -0.05 && -below > worst.valley) { worst.valley = -below; worst.valleyAt = `${f.piece} (${f.key.split(':')[1]}) at ${theta.toFixed(0)}°`; }
          checks++;
        }
      }
      for (const g of S.glue) {
        const pl = g.plane === 'near' ? R.near : g.plane === 'far' ? R.far : { o: g.plane.face.o, n: g.plane.face.n };
        for (const p of [g.a, g.b]) worst.glue = Math.max(worst.glue, Math.abs(dot(sub(p, pl.o), pl.n)));
        checks++;
      }
      // Creases: wall top edge = top crease edge; V halves share the crease.
      const byKey = Object.fromEntries(S.faces.map(f => [f.key, f]));
      for (const p of model.spreads[s].pieces) {
        const pairs = [];
        if (p.type === 'box') {
          const w = p.x[1] - p.x[0];
          for (const x of [0, w]) {
            pairs.push([at(byKey[p.keys.front], x, 0), at(byKey[p.keys.top], x, p.near)]);
            pairs.push([at(byKey[p.keys.top], x, 0), at(byKey[p.keys.topBack], x, p.far)]);
            pairs.push([at(byKey[p.keys.back], w - x, 0), at(byKey[p.keys.topBack], x, 0)]);
          }
        } else if (p.type === 'step') {
          const w = p.x[1] - p.x[0];
          for (const x of [0, w]) {
            if (p.side === 'front') pairs.push([at(byKey[p.keys.wall], x, 0), at(byKey[p.keys.top], x, p.out)]);
            else pairs.push([at(byKey[p.keys.wall], w - x, 0), at(byKey[p.keys.top], x, 0)]);
          }
        } else if (p.type === 'vfold') {
          const fn = byKey[p.keys.near], ff = byKey[p.keys.far];
          const xn = p.dir === 'right' ? 0 : p.width, xf = p.dir === 'right' ? 0 : (p.farWidth || p.width);
          pairs.push([at(fn, xn, 0), at(ff, xf, 0)], [at(fn, xn, p.height), at(ff, xf, p.height)]);
        }
        for (const [a, b] of pairs) worst.crease = Math.max(worst.crease, dist(a, b));
      }
    }
    // Rendered pose (real page thickness and stacking): glue lines must sit on the page surface, lifted 0.12 mm.
    for (const phis of configs) {
      const S = Popup.pose(model, phis, {}, { spreads: [s] }).spreads[0];
      if (S.theta < 1) continue;
      for (const g of S.glue) {
        if (typeof g.plane !== 'string') continue;
        const pl = S.receivers[g.plane];
        for (const p of [g.a, g.b]) {
          if (Math.hypot(p[1], p[2]) < 3) continue; // on the spine itself the point belongs to both pages
          worst.rendered = Math.max(worst.rendered || 0, Math.abs(dot(sub(p, pl.o), pl.n) - 0.12));
        }
      }
    }
    // Open pose: the reader sees the front of near-side walls (normal toward -y).
    const open = new Array(n + 1).fill(0); for (let j = 0; j <= s; j++) open[j] = 180;
    const O = Popup.pose(model, open, {}, { bare: true, spreads: [s] }).spreads[0];
    for (const f of O.faces) if (f.kind === 'wall' && f.key.endsWith(':front') && f.n[1] > -0.9) fail(name, `${f.key} front faces away from the reader (n=${f.n.map(q => q.toFixed(2))})`);
  }
  // 0.02 mm: at exactly theta = 0 the V-fold solver nudges the far page by 0.01 deg to avoid a zero cross product.
  if (worst.glue > 0.02) fail(name, `glue line leaves its plane by ${worst.glue.toExponential(2)} mm`);
  if (worst.crease > 1e-6) fail(name, `crease edges split by ${worst.crease.toExponential(2)} mm`);
  if (worst.valley > 0.05) fail(name, `${worst.valleyAt} goes through a page by ${worst.valley.toFixed(2)} mm`);
  if ((worst.rendered || 0) > 0.05) fail(name, `rendered glue line floats or sinks by ${worst.rendered.toFixed(3)} mm`);
  console.log(`${failures ? 'checked' : 'ok'} ${name}: ${checks} checks, max glue ${worst.glue.toExponential(1)} mm, max crease ${worst.crease.toExponential(1)} mm, max through-page ${worst.valley.toFixed(3)} mm, rendered glue error ${(worst.rendered || 0).toFixed(3)} mm`);
}

// The validator must reject a piece that sticks out of the closed book.
const bad = JSON.parse(JSON.stringify(synthetic));
bad.spreads[0].pieces = [{ id: 'tall', type: 'vfold', x: 150, angle: 20, dir: 'right', width: 60, height: 230 }];
const vb = Popup.validate(bad);
if (vb.ok) fail('closed-fit', 'a 230 mm crease on a 210 mm page was accepted');
else console.log('ok closed-fit rejects:', vb.errors[0]);

// The validator must reject two V-folds whose creases lean into each other.
const clash = JSON.parse(JSON.stringify(synthetic));
clash.spreads[0].pieces = [
  { id: 'right', type: 'vfold', x: 152, angle: 16, dir: 'right', width: 70, height: 100 },
  { id: 'left', type: 'vfold', x: 148, angle: 16, dir: 'left', width: 26, height: 150 },
];
const vc = Popup.validate(clash);
if (vc.ok) fail('collision', 'two crossing V-folds were accepted');
else console.log('ok collision rejects:', vc.errors[0]);

// The validator must name a piece whose outline reaches below its glue line, into the page.
const sink = JSON.parse(JSON.stringify(synthetic));
sink.spreads[0].pieces = [{ id: 'sinks', type: 'vfold', x: 100, angle: 20, dir: 'right', width: 40, height: 60, faces: { near: { outline: 'M0 0 H40 V74 H0 Z' } } }];
const vs = Popup.validate(sink);
if (vs.ok || !vs.errors.some(e => e.startsWith('sinks and the'))) fail('through-page', 'an outline below the glue line was accepted: ' + vs.errors.join('; '));
else console.log('ok through-page rejects:', vs.errors.find(e => e.startsWith('sinks')));

process.exit(failures ? 1 : 0);
