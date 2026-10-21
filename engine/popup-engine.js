/* popup-engine.js - paper pop-up book engine, v0.
   Pure part (validate, buildModel, pose) runs in Node; mount() needs a browser with WebGL2. */
(function (root) {
  'use strict';

  const TAG = '[popup]';
  const VERSION = '0.1.0';
  const DEG = Math.PI / 180;

  const PALETTE = {
    paper: '#F4EEE1', cream: '#EADFC8', ink: '#2B2622', terracotta: '#C8643B', brick: '#A44A2F',
    ochre: '#D9A441', saffron: '#E8B83E', rose: '#E3A08C', peach: '#F0C3A0', sage: '#8FA98A',
    olive: '#7C8A4A', pine: '#3F6B4E', sea: '#3E7A99', deep: '#23506B', sky: '#BFD8E2',
    slate: '#6E7780', stone: '#C9C0AE',
  };

  const LEAF_STEP = 1.0;
  const BOARD = 0.8;
  const COVER_BOARD = 1.8;
  const COVER_PAD = 3;
  const TAB = { w: 24, h: 22, under: 9 };
  const GRIP = 8;
  const LIGHT = norm([-0.38, -0.62, 0.69]);

  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function madd(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.hypot(a[0], a[1], a[2]); }
  function norm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  const X = [1, 0, 0];

  // Leaf direction (spine to outer edge) and front normal at angle phi (deg): 0 = lying on the near side, 180 = far side.
  function U(phi) { return [0, -Math.cos(phi * DEG), Math.sin(phi * DEG)]; }
  function NF(phi) { return [0, Math.sin(phi * DEG), Math.cos(phi * DEG)]; }

  /* ---------- SVG path bounding box (curves and arcs sampled along the drawn line) ---------- */

  function pathBBox(d) {
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g;
    const toks = [];
    let m;
    while ((m = re.exec(d))) toks.push(m[1] || parseFloat(m[2]));
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
    let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0, last = null, lastQ = null;
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    const ext = (x, y) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); };
    const N = 24;
    const cubic = (x0, y0, x1, y1, x2, y2, x3, y3) => {
      for (let k = 1; k <= N; k++) {
        const t = k / N, u = 1 - t;
        ext(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
    };
    const quad = (x0, y0, x1, y1, x2, y2) => {
      for (let k = 1; k <= N; k++) { const t = k / N, u = 1 - t; ext(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2); }
    };
    // SVG arc, endpoint form to centre form (SVG spec F.6.5), then sampled.
    const arc = (x1, y1, rx, ry, rot, large, sweep, x2, y2) => {
      rx = Math.abs(rx); ry = Math.abs(ry);
      if (!rx || !ry) { ext(x2, y2); return; }
      const ph = rot * DEG, cp = Math.cos(ph), sp = Math.sin(ph);
      const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
      const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
      if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
      const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
      const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
      const ccx = cp * cxp - sp * cyp + (x1 + x2) / 2, ccy = sp * cxp + cp * cyp + (y1 + y2) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
      let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
      if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
      for (let k = 1; k <= N; k++) {
        const t = t1 + dt * k / N, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
        ext(cp * ex - sp * ey + ccx, sp * ex + cp * ey + ccy);
      }
    };
    while (i < toks.length) {
      if (typeof toks[i] === 'string') { cmd = toks[i++]; if (cmd === 'Z' || cmd === 'z') { cx = sx; cy = sy; cmd = null; last = lastQ = null; continue; } }
      if (!cmd) throw new Error('path: number without command');
      const U8 = cmd.toUpperCase(), rel = cmd !== U8, n = arity[U8];
      const p = toks.slice(i, i + n);
      if (p.length < n || p.some(t => typeof t !== 'number')) throw new Error('path: bad parameters for ' + cmd);
      i += n;
      const ox = rel ? cx : 0, oy = rel ? cy : 0;
      let nx = cx, ny = cy, c2 = null, q1 = null;
      if (U8 === 'H') nx = p[0] + ox;
      else if (U8 === 'V') ny = p[0] + oy;
      else if (U8 === 'A') { nx = p[5] + ox; ny = p[6] + oy; arc(cx, cy, p[0], p[1], p[2], p[3] ? 1 : 0, p[4] ? 1 : 0, nx, ny); }
      else if (U8 === 'C') { nx = p[4] + ox; ny = p[5] + oy; c2 = [p[2] + ox, p[3] + oy]; cubic(cx, cy, p[0] + ox, p[1] + oy, c2[0], c2[1], nx, ny); }
      else if (U8 === 'S') { nx = p[2] + ox; ny = p[3] + oy; const c1 = last ? [2 * cx - last[0], 2 * cy - last[1]] : [cx, cy]; c2 = [p[0] + ox, p[1] + oy]; cubic(cx, cy, c1[0], c1[1], c2[0], c2[1], nx, ny); }
      else if (U8 === 'Q') { nx = p[2] + ox; ny = p[3] + oy; q1 = [p[0] + ox, p[1] + oy]; quad(cx, cy, q1[0], q1[1], nx, ny); }
      else if (U8 === 'T') { nx = p[0] + ox; ny = p[1] + oy; q1 = lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy]; quad(cx, cy, q1[0], q1[1], nx, ny); }
      else { nx = p[0] + ox; ny = p[1] + oy; }
      ext(nx, ny);
      if (U8 === 'M') { ext(nx, ny); sx = nx; sy = ny; cmd = rel ? 'l' : 'L'; }
      cx = nx; cy = ny; last = c2; lastQ = q1;
    }
    if (!isFinite(b[0])) throw new Error('path: empty');
    return b;
  }

  /* ---------- validation ---------- */

  function validate(scene) {
    const errors = [], warnings = [];
    const err = (where, msg) => errors.push(`${where}: ${msg}`);
    const isNum = x => typeof x === 'number' && isFinite(x);
    const isPair = a => Array.isArray(a) && a.length === 2 && a.every(isNum);
    const color = (where, c) => { if (c !== undefined && !(c in PALETTE)) err(where, `unknown colour "${c}" (palette: ${Object.keys(PALETTE).join(', ')})`); };

    if (!scene || typeof scene !== 'object') return { ok: false, errors: ['scene: not an object'], warnings };
    const book = scene.book;
    if (!book || typeof book !== 'object') { err('book', 'missing'); return { ok: false, errors, warnings }; }
    if (typeof book.title !== 'string') err('book.title', 'must be a string');
    if (!isPair(book.page) || book.page.some(x => x < 80 || x > 400)) { err('book.page', 'must be [width, depth] in mm, 80..400'); return { ok: false, errors, warnings }; }
    color('book.cover', book.cover);
    if (book.view) {
      if (book.view.pitch !== undefined && !(isNum(book.view.pitch) && book.view.pitch >= 20 && book.view.pitch <= 75)) err('book.view.pitch', 'must be 20..75');
      if (book.view.yaw !== undefined && !(isNum(book.view.yaw) && Math.abs(book.view.yaw) <= 35)) err('book.view.yaw', 'must be -35..35');
    }
    const [W, H] = book.page;
    if (!Array.isArray(scene.spreads) || scene.spreads.length < 1 || scene.spreads.length > 8) { err('spreads', 'must be an array of 1..8 spreads'); return { ok: false, errors, warnings }; }

    const LAYER_KEYS = ['rect', 'path', 'circle', 'windows', 'tiles', 'waves', 'text'];
    const checkFace = (where, f) => {
      if (f === undefined) return;
      if (!f || typeof f !== 'object') return err(where, 'face must be an object');
      for (const k of Object.keys(f)) if (!['color', 'outline', 'art', 'back'].includes(k)) err(where, `unknown key "${k}"`);
      color(where + '.color', f.color); color(where + '.back', f.back);
      if (f.outline !== undefined) { try { pathBBox(f.outline); } catch (e) { err(where + '.outline', e.message); } }
      if (f.art !== undefined) {
        if (!Array.isArray(f.art)) return err(where + '.art', 'must be an array');
        f.art.forEach((l, i) => {
          const w = `${where}.art[${i}]`;
          const kind = LAYER_KEYS.filter(k => k in l);
          if (kind.length !== 1) return err(w, `needs exactly one of ${LAYER_KEYS.join(', ')}`);
          color(w + '.fill', l.fill); color(w + '.stroke', l.stroke); color(w + '.shutters', l.shutters);
          const k = kind[0];
          if (k === 'path') { try { pathBBox(l.path); } catch (e) { err(w, e.message); } }
          if ((k === 'rect' || k === 'tiles' || k === 'waves') && !(Array.isArray(l[k]) && l[k].length === 4 && l[k].every(isNum))) err(w, `${k} must be [x, y, w, h]`);
          if (k === 'circle' && !(Array.isArray(l.circle) && l.circle.length === 3 && l.circle.every(isNum))) err(w, 'circle must be [cx, cy, r]');
          if (k === 'windows') { const o = l.windows || {}; if (!['x', 'y', 'cols', 'rows'].every(q => isNum(o[q]))) err(w, 'windows needs x, y, cols, rows'); }
          if (k === 'text' && (typeof l.text !== 'string' || !isNum(l.x) || !isNum(l.y))) err(w, 'text needs text, x, y');
          if (k === 'text' && l.font !== undefined && !['display', 'text'].includes(l.font)) err(w, 'font must be display or text');
        });
      }
    };

    const ids = new Set();
    scene.spreads.forEach((sp, si) => {
      const ws = `spreads[${si}]` + (sp && sp.id ? ` (${sp.id})` : '');
      if (!sp || typeof sp !== 'object') return err(ws, 'must be an object');
      if (typeof sp.id !== 'string') err(ws, 'id must be a string');
      if (!sp.near) err(ws, 'near page missing'); else checkFace(ws + '.near', sp.near);
      if (!sp.far) err(ws, 'far page missing'); else checkFace(ws + '.far', sp.far);
      const local = {};
      (sp.pieces || []).forEach((p, pi) => {
        const w = `${ws}.pieces[${pi}]` + (p && p.id ? ` (${p.id})` : '');
        if (!p || typeof p.id !== 'string') return err(w, 'id must be a string');
        if (ids.has(p.id)) err(w, `duplicate id "${p.id}"`);
        ids.add(p.id);
        const faces = p.faces || {};
        const xr = a => isPair(a) && a[0] < a[1] && a[0] >= -0.01 && a[1] <= W + 0.01;
        if (p.type === 'box') {
          if (!xr(p.x)) err(w, `x must be [x0, x1] inside 0..${W}`);
          for (const k of ['near', 'far', 'height']) if (!(isNum(p[k]) && p[k] > 0)) err(w, `${k} must be > 0`);
          if (p.near + p.height > H + 0.01) err(w, `near + height = ${p.near + p.height} > page depth ${H}: it would stick out of the closed book`);
          if (p.far + p.height > H + 0.01) err(w, `far + height = ${p.far + p.height} > page depth ${H}: it would stick out of the closed book`);
          for (const k of Object.keys(faces)) { if (!['front', 'top', 'topBack', 'back'].includes(k)) err(w, `unknown face "${k}"`); else checkFace(`${w}.faces.${k}`, faces[k]); }
          local[p.id] = { type: 'box', x: p.x, wall: { front: p.height, back: p.height } };
        } else if (p.type === 'step') {
          const par = local[p.parent];
          if (!par) err(w, `parent "${p.parent}" must be a box or step defined earlier in the same spread`);
          if (!xr(p.x)) err(w, `x must be [x0, x1] inside 0..${W}`);
          for (const k of ['out', 'up']) if (!(isNum(p[k]) && p[k] > 0)) err(w, `${k} must be > 0`);
          if (p.side !== undefined && !['front', 'back'].includes(p.side)) err(w, 'side must be front or back');
          if (par) {
            const side = par.type === 'step' ? par.side : (p.side || 'front');
            if (par.type === 'step' && p.side && p.side !== par.side) err(w, `side "${p.side}" differs from parent side "${par.side}"`);
            if (isPair(p.x) && (p.x[0] < par.x[0] - 0.01 || p.x[1] > par.x[1] + 0.01)) err(w, `x [${p.x}] must lie inside parent x [${par.x}]: the top is glued on the parent wall`);
            const wall = par.wall[side];
            if (isNum(p.up) && p.up > wall + 0.01) err(w, `up ${p.up} > parent wall height ${wall}`);
            local[p.id] = { type: 'step', x: p.x, side, wall: { front: p.up, back: p.up } };
          }
          for (const k of Object.keys(faces)) { if (!['wall', 'top'].includes(k)) err(w, `unknown face "${k}"`); else checkFace(`${w}.faces.${k}`, faces[k]); }
        } else if (p.type === 'vfold') {
          if (!(isNum(p.x) && p.x >= 0 && p.x <= W)) err(w, `x must be inside 0..${W}`);
          if (!(isNum(p.angle) && p.angle >= 8 && p.angle <= 82)) err(w, 'angle must be 8..82 degrees');
          if (!['left', 'right'].includes(p.dir)) err(w, 'dir must be left or right');
          for (const k of ['width', 'height']) if (!(isNum(p[k]) && p[k] > 0)) err(w, `${k} must be > 0`);
          if (p.farWidth !== undefined && !(isNum(p.farWidth) && p.farWidth > 0)) err(w, 'farWidth must be > 0');
          for (const k of Object.keys(faces)) { if (!['near', 'far'].includes(k)) err(w, `unknown face "${k}"`); else checkFace(`${w}.faces.${k}`, faces[k]); }
        } else if (p.type === 'slider') {
          if (!['near', 'far'].includes(p.page)) err(w, 'page must be near or far');
          if (!(isPair(p.size) && p.size[0] > 0 && p.size[1] > 0)) err(w, 'size must be [w, h]');
          if (!(Array.isArray(p.track) && p.track.length === 2 && p.track.every(isPair))) err(w, 'track must be [[x, y], [x, y]]');
          else if (isPair(p.size)) for (const q of p.track) if (q[0] < 0 || q[1] < 0 || q[0] + p.size[0] > W + 0.01 || q[1] + p.size[1] > H + 0.01) err(w, `track point [${q}] puts the piece outside the page`);
          if (p.start !== undefined && !(isNum(p.start) && p.start >= 0 && p.start <= 1)) err(w, 'start must be 0..1');
          if (p.tab) color(w + '.tab.color', p.tab.color);
          checkFace(w + '.face', p.face);
        } else if (p.type === 'flap') {
          if (!['near', 'far'].includes(p.page)) err(w, 'page must be near or far');
          if (!xr(p.x)) err(w, `x must be [x0, x1] inside 0..${W}`);
          if (!(isNum(p.y) && p.y >= 0 && p.y <= H)) err(w, `y (hinge line) must be inside 0..${H}`);
          if (!(isNum(p.length) && p.length > 0)) err(w, 'length must be > 0');
          if (p.side !== undefined && !['down', 'up'].includes(p.side)) err(w, 'side must be down or up');
          if (p.open !== undefined && !(isNum(p.open) && p.open >= 10 && p.open <= 180)) err(w, 'open must be 10..180 degrees');
          if (p.start !== undefined && !(isNum(p.start) && p.start >= 0 && p.start <= 1)) err(w, 'start must be 0..1');
          for (const k of Object.keys(faces)) { if (!['front', 'back'].includes(k)) err(w, `unknown face "${k}"`); else checkFace(`${w}.faces.${k}`, faces[k]); }
        } else if (p.type === 'wheel') {
          if (!['near', 'far'].includes(p.page)) err(w, 'page must be near or far');
          if (!isPair(p.center)) err(w, 'center must be [x, y]');
          if (!(isNum(p.r) && p.r >= 12)) err(w, 'r must be >= 12 mm');
          if (p.steps !== undefined && !(Number.isInteger(p.steps) && p.steps >= 2)) err(w, 'steps must be an integer >= 2');
          if (p.start !== undefined && !isNum(p.start)) err(w, 'start must be an angle in degrees');
          if (p.window !== undefined) {
            try {
              const b = pathBBox(p.window);
              if (isPair(p.center) && isNum(p.r) && (b[0] < p.center[0] - p.r || b[2] > p.center[0] + p.r || b[1] < p.center[1] - p.r || b[3] > p.center[1] + p.r)) err(w, 'window must lie over the disc, or the hole would show the inside of the page');
            } catch (e) { err(w + '.window', e.message); }
          }
          checkFace(w + '.face', p.face);
        } else err(w, `unknown type "${p.type}"`);
      });
    });
    if (errors.length) return { ok: false, errors, warnings };

    // Geometry: build the model and check overhangs and the closed book.
    let model;
    try { model = buildModel(scene); } catch (e) { return { ok: false, errors: ['model: ' + e.message], warnings }; }
    for (const def of Object.values(model.faceDefs)) {
      if (def.maxOverhang !== undefined && def.ext[1] < -def.maxOverhang - 0.01)
        errors.push(`${def.label}: outline rises ${(-def.ext[1]).toFixed(1)} mm above the crease, but the adjacent top is only ${def.maxOverhang} mm long`);
    }
    const closed = checkClosed(model, 0.5);
    for (const c of closed) errors.push(`${c.piece}: ${c.msg}`);
    for (const c of checkCollisions(model)) errors.push(`${c.a} and ${c.b}: ${c.msg}`);
    return { ok: errors.length === 0, errors, warnings, model };
  }

  // Two pieces that are not glued to each other must never pass through each other while the book moves.
  function checkCollisions(model) {
    const out = [];
    const { n } = model;
    const crosses = (p, q, f) => {
      const d1 = dot(sub(p, f.o), f.n), d2 = dot(sub(q, f.o), f.n);
      if (!(d1 * d2 < 0) || Math.abs(d1) < 1e-4 || Math.abs(d2) < 1e-4) return false;
      const r = madd(p, sub(q, p), d1 / (d1 - d2));
      const x = dot(sub(r, f.o), f.ax), y = dot(sub(r, f.o), f.ay), e = 0.05;
      return x > f.ext[0] + e && x < f.ext[2] - e && y > f.ext[1] + e && y < f.ext[3] - e;
    };
    const hit = (A, B) => {
      for (const fa of A) {
        const c = corners(fa);
        for (let i = 0; i < 4; i++) for (const fb of B) if (crosses(c[i], c[(i + 1) % 4], fb)) return true;
      }
      return false;
    };
    for (let s = 0; s < n; s++) {
      const pieces = model.spreads[s].pieces;
      const byId = Object.fromEntries(pieces.map(p => [p.id, p]));
      const chain = p => { while (p.type === 'step') p = byId[p.parent]; return p.id; };
      const reported = new Set();
      const openFlaps = Object.fromEntries(pieces.filter(p => p.type === 'flap').map(p => [p.id, 1]));
      const runs = [3, 8, 15, 25, 40, 60, 80, 100, 120, 140, 160, 172, 178].map(th => [th, {}]);
      if (Object.keys(openFlaps).length) for (const th of [90, 120, 150, 180]) runs.push([th, openFlaps]);
      for (const [th, tabsState] of runs) {
        const phis = new Array(n + 1).fill(0);
        phis[s] = th;
        const S = pose(model, phis, tabsState, { bare: true, spreads: [s] }).spreads[0];
        const by = {};
        for (const f of S.faces) if (f.kind !== 'tab') (by[f.piece] = by[f.piece] || []).push(f);
        for (const f of S.faces) {
          if (f.kind === 'tab' || reported.has('page|' + f.piece)) continue;
          for (const c of corners(f)) {
            const dn = dot(sub(c, S.receivers.near.o), S.receivers.near.n), df = dot(sub(c, S.receivers.far.o), S.receivers.far.n);
            if (Math.min(dn, df) < -0.05) {
              reported.add('page|' + f.piece);
              out.push({ a: f.piece, b: dn < df ? 'the near page' : 'the far page', msg: `pass through each other by ${(-Math.min(dn, df)).toFixed(1)} mm at ${th}° of opening (face ${f.key.split(':')[1]}: its outline reaches below its glue line)` });
              break;
            }
          }
        }
        for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
          const a = pieces[i], b = pieces[j], key = a.id + '|' + b.id;
          if (reported.has(key) || chain(a) === chain(b)) continue;
          if (hit(by[a.id], by[b.id]) || hit(by[b.id], by[a.id])) {
            reported.add(key);
            out.push({ a: a.id, b: b.id, msg: `pass through each other at ${th}° of opening${tabsState === openFlaps ? ' with the flaps open' : ''}` });
          }
        }
      }
    }
    return out;
  }

  // Every piece must lie flat inside the page outline when its spread is closed.
  function checkClosed(model, tol) {
    const out = [];
    const { W, H, n } = model;
    for (let s = 0; s < n; s++) {
      const phis = new Array(n + 1).fill(0);
      const p = pose(model, phis, {}, { bare: true, spreads: [s] });
      const sp = p.spreads.find(q => q.s === s);
      const R = sp.receivers.near;
      const seen = new Set();
      for (const f of sp.faces) {
        if (f.kind === 'tab') continue;
        for (const c of corners(f)) {
          const q = sub(c, R.o);
          const off = Math.abs(dot(q, R.n)), x = dot(q, R.ax), y = dot(q, R.ay);
          let msg = null;
          if (off > tol) msg = `lifts ${off.toFixed(1)} mm off the page when the book is closed`;
          else if (x < -tol || x > W + tol) msg = `sticks out of the side of the closed book (x = ${x.toFixed(1)})`;
          else if (y < -tol || y > H + tol) msg = `sticks out of the closed book (${y < 0 ? 'past the spine' : 'past the page edge'} by ${(y < 0 ? -y : y - H).toFixed(1)} mm)`;
          if (msg && !seen.has(f.piece)) { seen.add(f.piece); out.push({ piece: f.piece, face: f.key, msg }); }
        }
      }
    }
    return out;
  }

  /* ---------- model ---------- */

  function buildModel(scene) {
    const [W, H] = scene.book.page;
    const n = scene.spreads.length;
    const faceDefs = {};
    const def = (key, spec, w, h, extra = {}) => {
      let ext = [0, 0, w, h];
      if (spec && spec.outline) {
        const b = pathBBox(spec.outline);
        ext = [Math.min(0, b[0]), Math.min(0, b[1]), Math.max(w, b[2]), Math.max(h, b[3])];
      }
      faceDefs[key] = Object.assign({ key, spec: spec || {}, w, h, ext, holes: [] }, extra);
      return faceDefs[key];
    };
    const coverColor = scene.book.cover || 'sea';
    const P = COVER_PAD;
    def('cover:front', { color: coverColor, art: coverArt(scene.book, W, H) }, W + 2 * P, H + P, { ext: [-P, 0, W + P, H + P], cover: true });
    def('cover:back', { color: coverColor }, W + 2 * P, H + P, { ext: [-P, -P, W + P, H], cover: true });

    const spreads = scene.spreads.map((sp, s) => {
      def(`s${s}:near`, Object.assign({ color: 'paper' }, sp.near), W, H, { page: true });
      def(`s${s}:far`, Object.assign({ color: 'paper' }, sp.far), W, H, { page: true });
      const pieces = [];
      const byId = {};
      for (const p of sp.pieces || []) {
        const f = p.faces || {};
        const q = Object.assign({}, p);
        if (p.type === 'box') {
          const ww = p.x[1] - p.x[0];
          q.keys = { front: `${p.id}:front`, top: `${p.id}:top`, topBack: `${p.id}:topBack`, back: `${p.id}:back` };
          def(q.keys.front, f.front, ww, p.height, { label: `${p.id}.front`, maxOverhang: p.near });
          def(q.keys.top, f.top, ww, p.near, { label: `${p.id}.top` }).holes.push({ from: q.keys.front, tf: [1, 0, 0, 1, 0, p.near] });
          def(q.keys.topBack, f.topBack, ww, p.far, { label: `${p.id}.topBack` }).holes.push({ from: q.keys.back, tf: [-1, 0, 0, -1, ww, 0] });
          def(q.keys.back, f.back, ww, p.height, { label: `${p.id}.back`, maxOverhang: p.far });
          q.side = null;
        } else if (p.type === 'step') {
          const par = byId[p.parent];
          q.side = par.type === 'step' ? par.side : (p.side || 'front');
          const ww = p.x[1] - p.x[0];
          q.keys = { wall: `${p.id}:wall`, top: `${p.id}:top` };
          def(q.keys.wall, f.wall, ww, p.up, { label: `${p.id}.wall`, maxOverhang: p.out });
          def(q.keys.top, f.top, ww, p.out, { label: `${p.id}.top` }).holes.push({ from: q.keys.wall, tf: q.side === 'front' ? [1, 0, 0, 1, 0, p.out] : [-1, 0, 0, -1, ww, 0] });
        } else if (p.type === 'vfold') {
          q.keys = { near: `${p.id}:near`, far: `${p.id}:far` };
          def(q.keys.near, f.near, p.width, p.height, { label: `${p.id}.near` });
          // Both halves are cut from one sheet: without its own outline the far half repeats the near silhouette.
          const farSpec = f.near && f.near.outline && !(f.far && f.far.outline) && !p.farWidth ? Object.assign({ color: f.near.color }, f.far, { outline: f.near.outline }) : f.far;
          def(q.keys.far, farSpec, p.farWidth || p.width, p.height, { label: `${p.id}.far` });
        } else if (p.type === 'slider') {
          q.keys = { face: `${p.id}:face`, tab: `${p.id}:tab` };
          def(q.keys.face, p.face, p.size[0], p.size[1], { label: `${p.id}.face` });
          const tab = p.tab || {};
          def(q.keys.tab, { color: tab.color || 'ochre', art: [{ text: tab.label || '‹ ›', x: TAB.w / 2, y: TAB.h - 4.2, size: 6.5, fill: 'ink', align: 'center', weight: 700 }] }, TAB.w, TAB.h, { label: `${p.id}.tab`, tabShape: true });
        } else if (p.type === 'flap') {
          const ww = p.x[1] - p.x[0];
          q.keys = { front: `${p.id}:front`, back: `${p.id}:back` };
          def(q.keys.front, f.front, ww, p.length, { label: `${p.id}.front` });
          def(q.keys.back, f.back || { color: 'paper' }, ww, p.length, { label: `${p.id}.back` });
        } else if (p.type === 'wheel') {
          const r = p.r, G = p.window ? 0 : GRIP, face0 = p.face || {};
          q.keys = { face: `${p.id}:face` };
          const grip = `M${r - 6} 0.5 V${-G + 2} Q${r - 6} ${-G} ${r - 4} ${-G} H${r + 4} Q${r + 6} ${-G} ${r + 6} ${-G + 2} V0.5 Z`;
          const disc = `M0 ${r} A${r} ${r} 0 1 1 ${2 * r} ${r} A${r} ${r} 0 1 1 0 ${r} Z`;
          const spec = Object.assign({}, face0, {
            outline: face0.outline || (p.window ? disc : `${grip} ${disc}`),
            art: [...(face0.art || []),
              ...(p.window ? [] : [{ path: grip, fill: face0.grip || 'ochre' },
                { path: `M${r - 3} ${-G + 2} V-1 M${r} ${-G + 2} V-1 M${r + 3} ${-G + 2} V-1`, stroke: 'brick', width: 0.5 }]),
              { circle: [r, r, 2.6], fill: 'slate' }, { circle: [r - 0.7, r - 0.7, 0.9], fill: 'paper' }],
          });
          def(q.keys.face, spec, 2 * r, 2 * r, { label: `${p.id}.face`, ext: [0, -G, 2 * r, 2 * r] });
          // A windowed wheel turns under its page and shows through a hole cut in it, like a real volvelle.
          if (p.window) faceDefs[`s${s}:${p.page}`].holes.push({ path: p.window });
        }
        pieces.push(q);
        byId[p.id] = q;
      }
      return { s, id: sp.id, pieces };
    });
    return { W, H, n, title: scene.book.title, cover: coverColor, view: Object.assign({ pitch: 42, yaw: 0 }, scene.book.view || {}), spreads, faceDefs };
  }

  function coverArt(book, W, H) {
    const P = COVER_PAD;
    const art = [
      { path: `M${10 - P + P} ${10} H${W - 10} V${H - 10} H${10} Z`, stroke: 'paper', width: 0.8 },
      { path: `M${14} ${14} H${W - 14} V${H - 14} H${14} Z`, stroke: 'paper', width: 0.35 },
      { text: (book.title || '').toUpperCase(), x: W / 2, y: H * 0.56, size: Math.min(46, W / Math.max(4, (book.title || '').length) * 2.1), fill: 'paper', align: 'center', font: 'display', tracking: 0.04 },
    ];
    if (book.subtitle) art.push({ text: book.subtitle.toUpperCase(), x: W / 2, y: H * 0.56 + 16, size: 7.2, fill: 'paper', align: 'center', weight: 600, tracking: 0.2 });
    return art;
  }

  /* ---------- kinematics ---------- */

  function face(key, kind, o, ax, ay, def, extra) {
    return Object.assign({ key, kind, o, ax, ay, ext: def.ext, n: norm(cross(ay, ax)) }, extra || {});
  }

  function corners(f) {
    if (f.c) return f.c;
    const [x0, y0, x1, y1] = f.ext;
    const at = (x, y) => madd(madd(f.o, f.ax, x), f.ay, y);
    return [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)];
  }

  function pose(model, phis, tabs, opts = {}) {
    const bare = !!opts.bare;
    const { W, H, n, faceDefs } = model;
    const T = bare ? 0 : LEAF_STEP;
    const thick = k => bare ? 0 : (k === 0 || k === n ? COVER_BOARD : BOARD);
    const off = k => { const s = smooth(phis[k] / 180); return (n - k) * T * (1 - s) - k * T * s; };
    const base0 = [-W / 2, 0, 0];
    const out = { leaves: [], spreads: [] };

    if (!opts.spreads) for (let k = 0; k <= n; k++) {
      const phi = phis[k], u = U(phi), nf = NF(phi), m = off(k), t = thick(k);
      const base = madd(base0, nf, m);
      const isCover = k === 0 || k === n;
      const pad = isCover ? COVER_PAD : 0;
      const faces = [];
      const xmin = -pad, xmax = W + pad, dmax = H + pad;
      const top = madd(base, nf, t / 2), bot = madd(base, nf, -t / 2);
      if (k === 0) faces.push(face('cover:front', 'cover', top, X, u, faceDefs['cover:front']));
      else faces.push(face(`s${k - 1}:near`, 'page', madd(top, nf, 0.02), X, u, faceDefs[`s${k - 1}:near`], { recv: { s: k - 1, side: 'near' }, gut: [1, 0] }));
      if (k === n) faces.push(face('cover:back', 'cover', madd(bot, u, H), X, mul(u, -1), faceDefs['cover:back']));
      else faces.push(face(`s${k}:far`, 'page', madd(madd(bot, u, H), nf, -0.02), X, mul(u, -1), faceDefs[`s${k}:far`], { recv: { s: k, side: 'far' }, gut: [-1, H] }));
      if (isCover) {
        const inner = k === 0 ? bot : top;
        const board = (o, ax, ay) => faces.push({ key: null, kind: 'edge', solid: model.cover, shade: 1, o, ax, ay, ext: [0, 0, xmax - xmin, dmax], n: norm(cross(ay, ax)) });
        // The board sits 0.6 mm inside the cover so a windowed wheel can turn between it and the endpaper.
        const sunk = bare ? 0 : 0.6;
        if (k === 0) board(madd(madd(madd(inner, nf, sunk), X, xmin), u, dmax), X, mul(u, -1));
        else board(madd(madd(inner, nf, -sunk), X, xmin), X, u);
      }
      const ed = isCover ? model.cover : 'cream';
      const edge = (o, ax, w) => faces.push({ key: null, kind: 'edge', solid: ed, shade: 0.92, o, ax, ay: mul(nf, -1), ext: [0, 0, w, t], n: norm(cross(mul(nf, -1), ax)) });
      if (t > 0) {
        edge(madd(madd(top, X, xmin), u, dmax), X, xmax - xmin);
        edge(madd(top, X, xmin), u, dmax);
        edge(madd(madd(top, X, xmax), u, dmax), mul(u, -1), dmax);
      }
      out.leaves.push({ k, phi, faces });
    }

    for (let s = 0; s < n; s++) {
      if (opts.spreads && !opts.spreads.includes(s)) continue;
      const L = s + 1, F = s;
      let phN = phis[L], phF = phis[F];
      const theta = phF - phN;
      if (!opts.spreads && theta < 0.05) continue;
      const un = U(phN), uf = U(phF);
      const nN = NF(phN), nFv = mul(NF(phF), -1);
      const oN = mul(nN, off(L) + thick(L) / 2), oF = mul(NF(phF), off(F) - thick(F) / 2);
      const base = base0;
      // Pieces are solved with both pages through the spine axis, then each point is carried to the real
      // page surfaces by its angular position in the valley: glue lines land exactly on their page.
      const LIFT = 0.12;
      const shN = add(oN, mul(nN, LIFT)), shF = add(oF, mul(nFv, LIFT));
      const warp = p => {
        if (bare) return p;
        const qy = p[1], qz = p[2];
        let t = 0.5;
        if (theta > 1e-4 && qy * qy + qz * qz > 1e-10) {
          let a = Math.atan2(qz, -qy) / DEG;
          if (a < -90) a += 360;
          t = clamp((a - phN) / theta, 0, 1);
        }
        return add(p, add(mul(shN, 1 - t), mul(shF, t)));
      };
      const receivers = {
        near: { o: add(base0, oN), ax: X, ay: un, n: nN },
        far: { o: madd(add(base0, oF), uf, H), ax: X, ay: mul(uf, -1), n: nFv },
      };
      const faces = [], glue = [], hinges = {}, metrics = [], handles = [];
      const wb = U((phN + phF) / 2);
      const angle = (a, b) => Math.acos(clamp(dot(norm(a), norm(b)), -1, 1)) / DEG;

      for (const p of model.spreads[s].pieces) {
        const D = k => faceDefs[p.keys[k]];
        if (p.type === 'box') {
          const [x0, x1] = p.x, X0 = madd(base, X, x0), X1 = madd(base, X, x1);
          const P = mul(un, p.near), Q = mul(uf, p.far), M = mul(wb, p.height);
          const C1 = add(P, M), C2 = add(Q, M);
          const tag = { piece: p.id, cast: true, s };
          faces.push(face(p.keys.front, 'wall', add(X0, C1), X, mul(wb, -1), D('front'), tag));
          faces.push(face(p.keys.top, 'top', add(X0, M), X, un, D('top'), tag));
          faces.push(face(p.keys.topBack, 'top', add(X0, C2), X, mul(uf, -1), D('topBack'), tag));
          faces.push(face(p.keys.back, 'wall', add(X1, C2), mul(X, -1), mul(wb, -1), D('back'), tag));
          glue.push({ piece: p.id, a: add(X0, P), b: add(X1, P), plane: 'near' }, { piece: p.id, a: add(X0, Q), b: add(X1, Q), plane: 'far' });
          hinges[p.id] = {
            front: { K: P, floor: un, wall: wb, x: p.x, wallFace: faces[faces.length - 4] },
            back: { K: Q, floor: uf, wall: wb, x: p.x, wallFace: faces[faces.length - 1] },
          };
          metrics.push({ id: p.id, label: 'wall/page', value: angle(wb, mul(un, -1)) });
        } else if (p.type === 'step') {
          const hg = hinges[p.parent][p.side];
          const [x0, x1] = p.x, X0 = madd(base, X, x0), X1 = madd(base, X, x1);
          const G = madd(hg.K, hg.floor, p.out), C = madd(G, hg.wall, p.up), Tt = madd(hg.K, hg.wall, p.up);
          const tag = { piece: p.id, cast: true, s };
          if (p.side === 'front') {
            faces.push(face(p.keys.wall, 'wall', add(X0, C), X, mul(hg.wall, -1), D('wall'), tag));
            faces.push(face(p.keys.top, 'top', add(X0, Tt), X, hg.floor, D('top'), tag));
          } else {
            faces.push(face(p.keys.wall, 'wall', add(X1, C), mul(X, -1), mul(hg.wall, -1), D('wall'), tag));
            faces.push(face(p.keys.top, 'top', add(X0, C), X, mul(hg.floor, -1), D('top'), tag));
          }
          glue.push({ piece: p.id, a: add(X0, G), b: add(X1, G), plane: p.side === 'front' ? 'near' : 'far' },
            { piece: p.id, a: add(X0, Tt), b: add(X1, Tt), plane: { face: hg.wallFace } });
          const wf = faces[faces.length - 2];
          hinges[p.id] = { [p.side]: { K: G, floor: hg.floor, wall: hg.wall, x: p.x, wallFace: wf } };
          metrics.push({ id: p.id, label: 'wall/floor', value: angle(hg.wall, mul(hg.floor, -1)) });
        } else if (p.type === 'vfold') {
          const sx = p.dir === 'right' ? 1 : -1;
          const a = p.angle * DEG, ca = Math.cos(a), sa = Math.sin(a);
          let ufv = uf;
          if (theta < 0.01) ufv = U(phN + 0.01);
          const gn = add(mul(X, sx * ca), mul(un, sa)), gf = add(mul(X, sx * ca), mul(ufv, sa));
          const c = mul(norm(cross(gn, gf)), sx);
          const O = madd(base, X, p.x);
          const wn = p.width, wf = p.farWidth || p.width, h = p.height;
          const tag = { piece: p.id, cast: true, s };
          const half = (g, w, key) => {
            const R = mul(g, sx), xc = sx > 0 ? 0 : w;
            faces.push(face(key, 'half', madd(madd(O, R, -xc), c, h), R, mul(c, -1), faceDefs[key], tag));
          };
          half(gn, wn, p.keys.near);
          half(gf, wf, p.keys.far);
          glue.push({ piece: p.id, a: O, b: madd(O, gn, wn), plane: 'near' }, { piece: p.id, a: O, b: madd(O, gf, wf), plane: 'far' });
          metrics.push({ id: p.id, label: 'V opening', value: angle(gn, gf) }, { id: p.id, label: 'crease/page', value: 90 - angle(c, nN) });
        } else if (p.type === 'slider') {
          const R = receivers[p.page];
          const t = clamp(tabs[p.id] !== undefined ? tabs[p.id] : (p.start !== undefined ? p.start : 0), 0, 1);
          const pos = [p.track[0][0] + (p.track[1][0] - p.track[0][0]) * t, p.track[0][1] + (p.track[1][1] - p.track[0][1]) * t];
          const at = (x, y, lift) => madd(madd(madd(R.o, R.ax, x), R.ay, y), R.n, lift);
          faces.push(face(p.keys.face, 'slider', at(pos[0], pos[1], bare ? 0 : 0.35), R.ax, R.ay, D('face'), { piece: p.id, cast: true, s, sliderLift: true }));
          const outer = p.page === 'near' ? H - TAB.under : -(TAB.h - TAB.under);
          const tabAt = q => [q[0] + p.size[0] / 2 - TAB.w / 2, outer];
          const tp = tabAt(pos);
          faces.push(face(p.keys.tab, 'tab', at(tp[0], tp[1], bare ? 0 : -0.3), R.ax, R.ay, D('tab'), { piece: p.id, s }));
          const centre = q => { const t2 = tabAt(q); return at(t2[0] + TAB.w / 2, t2[1] + TAB.h / 2 + (p.page === 'near' ? TAB.under / 2 : -TAB.under / 2), 0); };
          handles.push({ id: p.id, kind: 'slider', s, t, a: centre(p.track[0]), b: centre(p.track[1]), at: centre(pos) });
        } else if (p.type === 'flap') {
          // A flap is hinged on its page: it lifts by the user's amount, but the closing book presses it flat.
          const R = receivers[p.page];
          const t = clamp(tabs[p.id] !== undefined ? tabs[p.id] : (p.start || 0), 0, 1);
          const a = (p.open || 160) * t * clamp(theta / 180, 0, 1) * DEG;
          const ww = p.x[1] - p.x[0], L = p.length, sd = p.side === 'up' ? -1 : 1;
          const H0 = madd(madd(madd(R.o, R.ax, p.x[0]), R.ay, p.y), R.n, bare ? 0 : 0.3);
          const d = add(mul(R.ay, sd * Math.cos(a)), mul(R.n, Math.sin(a)));
          const tag = { piece: p.id, cast: true, s, exact: true };
          const front = sd > 0 ? face(p.keys.front, 'flap', H0, R.ax, d, D('front'), tag) : face(p.keys.front, 'flap', madd(H0, d, L), R.ax, mul(d, -1), D('front'), tag);
          const bo = sd > 0 ? madd(H0, d, L) : H0;
          faces.push(front, face(p.keys.back, 'flap', madd(bo, front.n, bare ? 0 : -0.06), R.ax, sd > 0 ? mul(d, -1) : d, D('back'), tag));
          handles.push({ id: p.id, kind: 'flap', s, t, at: madd(madd(H0, R.ax, ww / 2), d, L * 0.82) });
          metrics.push({ id: p.id, label: 'flap', value: a / DEG });
        } else if (p.type === 'wheel') {
          const R = receivers[p.page];
          const deg = tabs[p.id] !== undefined ? tabs[p.id] : (p.start || 0), b = deg * DEG;
          const ax = add(mul(R.ax, Math.cos(b)), mul(R.ay, Math.sin(b))), ay = add(mul(R.ax, -Math.sin(b)), mul(R.ay, Math.cos(b)));
          const C = madd(madd(madd(R.o, R.ax, p.center[0]), R.ay, p.center[1]), R.n, bare ? 0 : p.window ? -0.35 : 0.3);
          const o = madd(madd(C, ax, -p.r), ay, -p.r);
          faces.push(face(p.keys.face, 'wheel', o, ax, ay, D('face'), { piece: p.id, cast: !p.window, s, exact: true }));
          let at = madd(madd(o, ax, p.r), ay, -GRIP / 2);
          if (p.window) {
            const wb = pathBBox(p.window);
            let hx = (wb[0] + wb[2]) / 2, hy = (wb[1] + wb[3]) / 2;
            if (Math.hypot(hx - p.center[0], hy - p.center[1]) < p.r * 0.3) hy = p.center[1] - p.r * 0.6;
            at = madd(madd(R.o, R.ax, hx), R.ay, hy);
          }
          handles.push({ id: p.id, kind: 'wheel', s, t: deg, at, plane: R, center: p.center, steps: p.steps });
          metrics.push({ id: p.id, label: 'wheel', value: ((deg % 360) + 360) % 360 });
        }
      }
      if (!bare) {
        for (const f of faces) if (f.kind !== 'slider' && f.kind !== 'tab' && !f.exact) f.c = corners(f).map(warp);
        for (const g of glue) { g.a = warp(g.a); g.b = warp(g.b); }
      }
      out.spreads.push({ s, theta, phN, phF, faces, glue, receivers, metrics, handles });
    }
    return out;
  }

  const Popup = { VERSION, PALETTE, validate, buildModel, pose, corners, pathBBox, LIGHT, U, NF };
  root.Popup = Popup;
  if (typeof module !== 'undefined' && module.exports) module.exports = Popup;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ====================================================================== */
  /* ---------- browser: textures, WebGL renderer, interaction ---------- */

  const hex = c => { const h = PALETTE[c] || c; return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; };
  const mix = (c, d, k) => { const a = hex(c), b = hex(d); return `rgb(${a.map((v2, i) => Math.round((v2 * (1 - k) + b[i] * k) * 255)).join(',')})`; };
  const col = c => PALETTE[c] || PALETTE.ink;
  const FONT_DISPLAY = '"PopupDisplay", "Bebas Neue", "Arial Narrow", sans-serif';
  const FONT_TEXT = '"PopupText", "DM Sans", system-ui, sans-serif';

  function silhouette(def) {
    if (def.tabShape) {
      const w = def.w, h = def.h, r = 5;
      return new Path2D(`M0 0 H${w} V${h - r} Q${w} ${h} ${w - r} ${h} H${r} Q0 ${h} 0 ${h - r} Z`);
    }
    if (def.spec && def.spec.outline) return new Path2D(def.spec.outline);
    const p = new Path2D();
    p.rect(def.ext[0], def.ext[1], def.ext[2] - def.ext[0], def.ext[3] - def.ext[1]);
    return p;
  }

  function drawLayers(ctx, layers) {
    for (const l of layers || []) {
      ctx.save();
      if (l.rect) {
        ctx.fillStyle = col(l.fill || 'ink');
        ctx.beginPath();
        if (l.r && ctx.roundRect) ctx.roundRect(l.rect[0], l.rect[1], l.rect[2], l.rect[3], l.r); else ctx.rect(...l.rect);
        ctx.fill();
      } else if (l.path) {
        const p = new Path2D(l.path);
        if (l.fill) { ctx.fillStyle = col(l.fill); ctx.fill(p); }
        if (l.stroke) { ctx.strokeStyle = col(l.stroke); ctx.lineWidth = l.width || 0.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(p); }
        if (!l.fill && !l.stroke) { ctx.fillStyle = col('ink'); ctx.fill(p); }
      } else if (l.circle) {
        ctx.fillStyle = col(l.fill || 'ink');
        ctx.beginPath(); ctx.arc(l.circle[0], l.circle[1], l.circle[2], 0, Math.PI * 2); ctx.fill();
      } else if (l.windows) {
        const o = l.windows, w = o.w || 4, h = o.h || 6.5, gx = o.gx || 9, gy = o.gy || 11;
        for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.cols; c++) {
          const x = o.x + c * gx, y = o.y + r * gy;
          if (l.shutters) {
            const sw = w * 0.48;
            ctx.fillStyle = col(l.shutters);
            ctx.fillRect(x - sw - 0.25, y, sw, h); ctx.fillRect(x + w + 0.25, y, sw, h);
            ctx.strokeStyle = mix(l.shutters, 'ink', 0.35); ctx.lineWidth = 0.18;
            for (let k = 1; k < 5; k++) { const yy = y + h * k / 5; ctx.beginPath(); ctx.moveTo(x - sw - 0.25, yy); ctx.lineTo(x - 0.25, yy); ctx.moveTo(x + w + 0.25, yy); ctx.lineTo(x + w + sw + 0.25, yy); ctx.stroke(); }
          }
          ctx.fillStyle = col(l.fill || 'deep');
          ctx.beginPath();
          if (o.arch) { ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); }
          else ctx.rect(x, y, w, h);
          ctx.fill();
          ctx.fillStyle = 'rgba(244,238,225,0.85)';
          ctx.fillRect(x - 0.6, y + h, w + 1.2, 0.55);
        }
      } else if (l.tiles) {
        const [x, y, w, h] = l.tiles, c = l.fill || 'terracotta';
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.fillStyle = col(c); ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = mix(c, 'ink', 0.32); ctx.lineWidth = 0.3;
        const rh = 3.2, cw = 3.4;
        for (let r = 0, yy = y + rh; yy < y + h + rh; r++, yy += rh) {
          ctx.beginPath();
          for (let xx = x - (r % 2) * cw / 2; xx < x + w + cw; xx += cw) { ctx.moveTo(xx, yy - rh * 0.15); ctx.quadraticCurveTo(xx + cw / 2, yy + rh * 0.55, xx + cw, yy - rh * 0.15); }
          ctx.stroke();
        }
      } else if (l.waves) {
        const [x, y, w, h] = l.waves, c = l.fill || 'paper';
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.strokeStyle = col(c); ctx.lineWidth = 0.55; ctx.lineCap = 'round'; ctx.globalAlpha = 0.8;
        const rh = 7, cw = 9;
        for (let r = 0, yy = y + rh * 0.7; yy < y + h; r++, yy += rh) {
          ctx.beginPath();
          for (let xx = x + (r % 2) * cw * 0.55 + ((r * 37) % 5); xx < x + w; xx += cw * 1.6) { ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + cw * 0.25, yy - 1.6, xx + cw * 0.5, yy); ctx.quadraticCurveTo(xx + cw * 0.75, yy + 1.6, xx + cw, yy); }
          ctx.stroke();
        }
      } else if (l.text !== undefined) {
        ctx.fillStyle = col(l.fill || 'ink');
        const size = l.size || 6;
        ctx.font = l.font === 'display' ? `400 ${size}px ${FONT_DISPLAY}` : `${l.italic ? 'italic ' : ''}${l.weight || 500} ${size}px ${FONT_TEXT}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${(l.tracking || 0) * size}px`;
        ctx.textAlign = l.align || 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(l.text, l.x, l.y);
      }
      ctx.restore();
    }
  }

  function renderFaceCanvas(def, defs, ppm) {
    const [x0, y0, x1, y1] = def.ext;
    const pad = 2;
    const cw = Math.max(4, Math.ceil((x1 - x0) * ppm) + 2 * pad), ch = Math.max(4, Math.ceil((y1 - y0) * ppm) + 2 * pad);
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d');
    const sx = (cw - 2 * pad) / (x1 - x0), sy = (ch - 2 * pad) / (y1 - y0);
    const base = () => ctx.setTransform(sx, 0, 0, sy, pad - x0 * sx, pad - y0 * sy);
    base();
    const sil = silhouette(def);
    ctx.save();
    ctx.clip(sil);
    ctx.fillStyle = col(def.spec.color || 'paper');
    ctx.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
    drawLayers(ctx, def.spec.art);
    ctx.strokeStyle = 'rgba(250,246,236,0.9)';
    ctx.lineWidth = 0.7;
    ctx.stroke(sil);
    ctx.restore();
    for (const h of def.holes) {
      if (h.path) {
        const hole = new Path2D(h.path);
        ctx.save(); base();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fill(hole);
        ctx.restore();
        continue;
      }
      const src = defs[h.from];
      if (!src || src.ext[1] >= 0) continue;
      ctx.save();
      base();
      ctx.transform(...h.tf);
      ctx.beginPath(); ctx.rect(src.ext[0] - 1, src.ext[1] - 1, src.ext[2] - src.ext[0] + 2, -src.ext[1] + 1);
      ctx.clip();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.fill(silhouette(src));
      ctx.restore();
    }
    return { cv, uv: [pad / cw, pad / ch, (cw - pad) / cw, (ch - pad) / ch] };
  }

  /* ---------- mat4 (column-major) ---------- */

  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(eye, target, up) {
    const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }
  function mmul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function invert(m) {
    const a = m, o = new Array(16);
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
    const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
    const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
    const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
    o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
    o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
    o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
    o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
    return o;
  }
  function project(m, p) {
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [x / w, y / w, w];
  }

  /* ---------- shaders ---------- */

  const VS_MAIN = `#version 300 es
in vec3 aPos; in vec2 aUV; in vec2 aMM;
uniform mat4 uVP;
out vec2 vUV; out vec2 vMM;
void main(){ vUV=aUV; vMM=aMM; gl_Position=uVP*vec4(aPos,1.0); }`;

  const FS_MAIN = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec3 uTint; uniform vec3 uBack; uniform vec3 uN; uniform vec3 uL;
uniform vec2 uGut; uniform float uAO; uniform vec4 uSel; uniform vec2 uView; uniform float uPageH;
in vec2 vUV; in vec2 vMM;
out vec4 o;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.5) discard;
  bool front = gl_FrontFacing;
  vec3 n = front ? uN : -uN;
  vec3 c = front ? t.rgb * uTint : uBack;
  float lam = max(dot(n, uL), 0.0);
  float g = vn(vMM*0.85)*0.5 + vn(vMM*2.7)*0.3 + vn(vMM*vec2(7.0,1.1))*0.2;
  c *= 0.955 + 0.075*g;
  if (front && uGut.x != 0.0) {
    float d = uGut.x*vMM.y + uGut.y;
    float k = 0.17*exp(-d/10.0) + uAO*0.32*(1.0 - smoothstep(0.0, uPageH, d));
    vec4 m = texture(uMask, gl_FragCoord.xy / uView);
    float s = dot(m, uSel);
    c *= (1.0 - k) * (1.0 - 0.34*s*smoothstep(0.0, 0.25, lam));
  }
  c *= 0.66 + 0.36*lam;
  o = vec4(c, 1.0);
}`;

  const VS_MASK = `#version 300 es
in vec3 aPos; in vec2 aUV; in vec2 aMM;
uniform mat4 uVP;
out vec2 vUV; out vec2 vMM;
void main(){ vUV=aUV; vMM=aMM; gl_Position=uVP*vec4(aPos,1.0); }`;

  const FS_MASK = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec4 uSel; uniform vec2 uRect;
in vec2 vUV; in vec2 vMM;
out vec4 o;
void main(){
  if (vMM.x < 0.0 || vMM.y < 0.0 || vMM.x > uRect.x || vMM.y > uRect.y) discard;
  float a = texture(uTex, vUV, 2.5).a;
  o = uSel * smoothstep(0.05, 0.75, a);
}`;

  const VS_TABLE = `#version 300 es
in vec3 aPos; uniform mat4 uVP; out vec2 vP;
void main(){ vP=aPos.xy; gl_Position=uVP*vec4(aPos,1.0); }`;

  const FS_TABLE = `#version 300 es
precision highp float;
uniform vec4 uRect; uniform float uSoft; in vec2 vP; out vec4 o;
void main(){
  vec2 c = (uRect.xy+uRect.zw)*0.5, h = (uRect.zw-uRect.xy)*0.5;
  vec2 d = abs(vP-c) - h;
  float dist = length(max(d,0.0)) + min(max(d.x,d.y),0.0);
  float a = 1.0 - smoothstep(-uSoft*0.3, uSoft, dist);
  o = vec4(0.12,0.09,0.06, 0.26*a);
}`;

  function program(gl, vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aUV'); gl.bindAttribLocation(p, 2, 'aMM');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {};
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  /* ---------- mount ---------- */

  function mount(el, scene, opts = {}) {
    const tStart = performance.now();
    const debug = opts.debug !== undefined ? opts.debug : /[?&]debug=1\b/.test(location.search);
    const res = validate(scene);
    for (const w of res.warnings) console.warn(TAG, w);
    if (!res.ok) {
      for (const e of res.errors) console.error(TAG, 'validation:', e);
      el.classList.add('popup-book', 'popup-failed');
      el.textContent = `Scena non valida: ${res.errors.length} errori (vedi console).`;
      return null;
    }
    const model = res.model;
    const { W, H, n } = model;

    el.classList.add('popup-book');
    el.tabIndex = 0;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-roledescription', 'libro pop-up');
    el.setAttribute('aria-label', `${model.title}. Libro pop-up di ${n} aperture. Invio per aprire, frecce per sfogliare.`);
    el.innerHTML = `<canvas class="popup-canvas" aria-hidden="true"></canvas>
<div class="popup-handles"></div>
<div class="popup-hint" aria-live="polite"></div>
<div class="popup-ui"><button type="button" class="popup-prev" aria-label="Pagina precedente">&#8249;</button><span class="popup-count"></span><button type="button" class="popup-next" aria-label="Pagina successiva">&#8250;</button></div>
<div class="popup-debug" hidden></div>`;
    const canvas = el.querySelector('canvas');
    const hint = el.querySelector('.popup-hint'), countEl = el.querySelector('.popup-count');
    const btnPrev = el.querySelector('.popup-prev'), btnNext = el.querySelector('.popup-next');
    const handlesEl = el.querySelector('.popup-handles'), dbg = el.querySelector('.popup-debug');

    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, stencil: false });
    if (!gl) { el.classList.add('popup-failed'); el.textContent = 'Serve un browser con WebGL2.'; console.error(TAG, 'WebGL2 unavailable'); return null; }

    const progMain = program(gl, VS_MAIN, FS_MAIN), progMask = program(gl, VS_MASK, FS_MASK), progTable = program(gl, VS_TABLE, FS_TABLE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    const vbo = gl.createBuffer(), ibo = gl.createBuffer();
    const MAXQ = 4096;
    const idx = new Uint16Array(MAXQ * 6);
    for (let q = 0; q < MAXQ; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.slice(0, 6 * 512), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
    let iboQuads = 512;

    const isSmall = Math.min(screen.width, screen.height) < 700;
    const ppm = isSmall ? 2.2 : 3.2;
    const tex = {};
    const upload = (src, mip) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      return t;
    };
    let ready = false, texMs = 0;
    const buildTextures = () => {
      const tTex = performance.now();
      for (const def of Object.values(model.faceDefs)) {
        const r = renderFaceCanvas(def, model.faceDefs, def.page || def.cover ? ppm : ppm * 1.15);
        tex[def.key] = { t: upload(r.cv, true), uv: r.uv, ext: def.ext, back: hex(def.spec.back || 'paper') };
      }
      texMs = performance.now() - tTex;
      ready = true;
    };
    const fontsReady = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load(`40px ${FONT_DISPLAY}`), document.fonts.load(`500 12px ${FONT_TEXT}`), document.fonts.load(`700 12px ${FONT_TEXT}`)]).catch(e => console.warn(TAG, 'fonts not loaded, using fallback', e))
      : Promise.resolve();
    const white = document.createElement('canvas'); white.width = white.height = 4;
    const wctx = white.getContext('2d'); wctx.fillStyle = '#fff'; wctx.fillRect(0, 0, 4, 4);
    const whiteTex = upload(white, false);

    // shadow mask render target (half resolution)
    const maskTex = gl.createTexture(), fbo = gl.createFramebuffer();
    let maskW = 0, maskH = 0;
    const sizeMask = (w, h) => {
      maskW = Math.max(1, w >> 1); maskH = Math.max(1, h >> 1);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, maskW, maskH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, maskTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    /* state */
    const phis = new Array(n + 1).fill(0);
    const tabs = {};
    let current = 0, anim = null, dirty = true, visible = true, raf = 0, destroyed = false;
    let VP = null, cssW = 1, cssH = 1, eye = [0, 0, 1];
    const stats = { frames: 0, ms: 0, max: 0, last: 0, fps: 0, fpsAcc: [] };

    /* camera: fitted once per size to the bounds of the whole opening sweep */
    function fitCamera() {
      const aspect = cssW / cssH;
      const pitch = model.view.pitch * DEG, yaw = model.view.yaw * DEG;
      const dir = [Math.sin(yaw) * Math.cos(pitch), -Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];
      const P = COVER_PAD + 2;
      const pts = [];
      for (const x of [-W / 2 - P, W / 2 + P]) {
        for (const y of [-H - P - TAB.h, H + P]) pts.push([x, y, 0]);
        for (const phi of [30, 60, 90, 120, 150]) { const u = U(phi); pts.push([x, u[1] * (H + P), u[2] * (H + P)]); }
        pts.push([x, -H * 0.5, H * 0.75]);
      }
      const fov = 26 * DEG, proj = perspective(fov, aspect, 20, 6000);
      let target = [0, -H * 0.12, H * 0.12], dist = (W + 2 * H) * 2;
      const bounds = () => {
        const e = madd(target, dir, dist), V = mmul(proj, lookAt(e, target, [0, 0, 1]));
        let b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const p of pts) { const q = project(V, p); b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])]; }
        return { b, V, e };
      };
      const right = norm(cross(dir, [0, 0, 1])), up = cross(right, dir);
      const yLo = -1 + 2 * Math.min(0.2, 62 / cssH), yHi = 0.96;
      for (let it = 0; it < 6; it++) {
        let lo = 50, hi = 20000;
        for (let k = 0; k < 40; k++) {
          dist = (lo + hi) / 2;
          const { b } = bounds();
          if (b[2] - b[0] <= 1.88 && b[3] - b[1] <= yHi - yLo) hi = dist; else lo = dist;
        }
        dist = hi;
        const { b } = bounds();
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2 - (yLo + yHi) / 2;
        const halfH = Math.tan(fov / 2) * dist;
        target = madd(madd(target, right, -cx * halfH * aspect), up, cy * halfH);
      }
      const r = bounds();
      VP = r.V; eye = r.e;
    }

    function resize() {
      const rect = el.getBoundingClientRect();
      cssW = Math.max(1, rect.width); cssH = Math.max(1, rect.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      sizeMask(canvas.width, canvas.height);
      fitCamera();
      dirty = true; kick();
    }

    /* drawing */
    let vdata = new Float32Array(4096 * 28);
    function quadInto(arr, i, P4, uv4, mm4) {
      for (let k = 0; k < 4; k++) {
        const o = (i * 4 + k) * 7;
        arr[o] = P4[k][0]; arr[o + 1] = P4[k][1]; arr[o + 2] = P4[k][2];
        arr[o + 3] = uv4[k][0]; arr[o + 4] = uv4[k][1]; arr[o + 5] = mm4[k][0]; arr[o + 6] = mm4[k][1];
      }
    }

    function frame() {
      const t0 = performance.now();
      const P = pose(model, phis, tabs);
      const visSpreads = P.spreads.map(s => s.s);
      const slotOf = s => visSpreads.indexOf(s);
      const sel = (s, side) => { const sl = slotOf(s); if (sl < 0 || sl > 1) return [0, 0, 0, 0]; const v4 = [0, 0, 0, 0]; v4[sl * 2 + (side === 'near' ? 0 : 1)] = 1; return v4; };

      const draws = [];
      for (const L of P.leaves) for (const f of L.faces) draws.push(f);
      for (const S of P.spreads) for (const f of S.faces) draws.push(f);

      // shadow casters projected on their spread's pages
      const shadow = [];
      for (const S of P.spreads) for (const f of S.faces) {
        if (!f.cast) continue;
        for (const side of ['near', 'far']) {
          const R = S.receivers[side];
          const dl = dot(LIGHT, R.n);
          if (dl < 0.08) continue;
          const cs = corners(f);
          const ts = cs.map(c => dot(sub(c, R.o), R.n) / dl);
          if (ts.every(t => t <= 0.05)) continue;
          const pj = cs.map((c, i) => madd(c, LIGHT, -Math.max(0, ts[i])));
          const mm = pj.map(p => [dot(sub(p, R.o), R.ax), dot(sub(p, R.o), R.ay)]);
          shadow.push({ f, pos: pj, mm, sel: sel(S.s, side) });
        }
      }

      const total = draws.length + shadow.length + 1;
      if (vdata.length < total * 28) vdata = new Float32Array(total * 28 * 2);
      if (total > iboQuads) { iboQuads = Math.min(MAXQ, total * 2); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.slice(0, 6 * iboQuads), gl.STATIC_DRAW); }
      let qi = 0;
      const uvOf = f => {
        if (!f.key) return [[0, 0], [1, 0], [1, 1], [0, 1]];
        const u = tex[f.key].uv;
        return [[u[0], u[1]], [u[2], u[1]], [u[2], u[3]], [u[0], u[3]]];
      };
      const mmOf = f => { const [x0, y0, x1, y1] = f.ext; return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; };
      for (const f of draws) { f._q = qi; quadInto(vdata, qi++, corners(f), uvOf(f), mmOf(f)); }
      for (const s of shadow) { s._q = qi; quadInto(vdata, qi++, s.pos, uvOf(s.f), s.mm); }
      // table shadow quad
      let far = 0;
      for (const L of P.leaves) far = Math.max(far, -Math.cos(L.phi * DEG));
      const tq = qi++;
      const TR = [-W / 2 - COVER_PAD, -H - COVER_PAD, W / 2 + COVER_PAD, Math.max(0, far * (H + COVER_PAD))];
      const g = 30;
      quadInto(vdata, tq, [[TR[0] - g, TR[1] - g, -0.4], [TR[2] + g, TR[1] - g, -0.4], [TR[2] + g, TR[3] + g, -0.4], [TR[0] - g, TR[3] + g, -0.4]], [[0, 0], [0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0], [0, 0]]);

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vdata.subarray(0, qi * 28), gl.DYNAMIC_DRAW);

      // pass 1: shadow mask
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, maskW, maskH);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(progMask.p);
      gl.uniformMatrix4fv(progMask.u.uVP, false, VP);
      gl.uniform2f(progMask.u.uRect, W, H);
      gl.uniform1i(progMask.u.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      for (const s of shadow) {
        gl.bindTexture(gl.TEXTURE_2D, tex[s.f.key].t);
        gl.uniform4fv(progMask.u.uSel, s.sel);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, s._q * 12);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.blendEquation(gl.FUNC_ADD);

      // pass 2: scene
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.useProgram(progTable.p);
      gl.uniformMatrix4fv(progTable.u.uVP, false, VP);
      gl.uniform4f(progTable.u.uRect, TR[0], TR[1], TR[2], TR[3]);
      gl.uniform1f(progTable.u.uSoft, 14);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, tq * 12);
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      gl.useProgram(progMain.p);
      gl.frontFace(gl.CW);
      gl.uniformMatrix4fv(progMain.u.uVP, false, VP);
      gl.uniform3fv(progMain.u.uL, LIGHT);
      gl.uniform2f(progMain.u.uView, canvas.width, canvas.height);
      gl.uniform1f(progMain.u.uPageH, H);
      gl.uniform1i(progMain.u.uTex, 0); gl.uniform1i(progMain.u.uMask, 1);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.activeTexture(gl.TEXTURE0);
      const aoOf = {};
      for (const S of P.spreads) aoOf[S.s] = 1 - S.theta / 180;
      for (const f of draws) {
        if (f.key) {
          const T = tex[f.key];
          gl.bindTexture(gl.TEXTURE_2D, T.t);
          gl.uniform3f(progMain.u.uTint, 1, 1, 1);
          gl.uniform3fv(progMain.u.uBack, T.back);
        } else {
          gl.bindTexture(gl.TEXTURE_2D, whiteTex);
          const c = hex(f.solid).map(v2 => v2 * (f.shade || 1));
          gl.uniform3fv(progMain.u.uTint, c); gl.uniform3fv(progMain.u.uBack, c);
        }
        gl.uniform3fv(progMain.u.uN, f.n);
        if (f.recv) {
          gl.uniform2fv(progMain.u.uGut, f.gut);
          gl.uniform1f(progMain.u.uAO, aoOf[f.recv.s] !== undefined ? aoOf[f.recv.s] : 1);
          gl.uniform4fv(progMain.u.uSel, sel(f.recv.s, f.recv.side));
        } else {
          gl.uniform2f(progMain.u.uGut, 0, 0);
          gl.uniform4f(progMain.u.uSel, 0, 0, 0, 0);
        }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, f._q * 12);
      }

      placeHandles(P);
      if (debug) drawDebug(P);
      const ms = performance.now() - t0;
      stats.frames++; stats.ms += ms; stats.max = Math.max(stats.max, ms);
      return P;
    }

    /* tabs: DOM hotspots following the projected tab */
    const handleEls = {};
    function toScreen(p) { const q = project(VP, p); return [(q[0] * 0.5 + 0.5) * cssW, (0.5 - q[1] * 0.5) * cssH]; }
    function placeHandles(P) {
      const live = new Set();
      for (const S of P.spreads) for (const h of S.handles) {
        const usable = !anim && S.theta > 179.5;
        let d = handleEls[h.id];
        if (!d) {
          d = document.createElement('div');
          d.className = `popup-handle is-${h.kind}`;
          d.tabIndex = 0;
          if (h.kind === 'flap') { d.setAttribute('role', 'button'); d.setAttribute('aria-label', 'Sportello da sollevare'); }
          else {
            d.setAttribute('role', 'slider');
            d.setAttribute('aria-label', h.kind === 'wheel' ? 'Ruota da girare' : 'Linguetta da tirare');
            d.setAttribute('aria-valuemin', '0'); d.setAttribute('aria-valuemax', h.kind === 'wheel' ? '360' : '100');
          }
          (h.kind === 'flap' ? bindFlap : h.kind === 'wheel' ? bindWheel : bindHandle)(d, h.id);
          handlesEl.appendChild(d);
          handleEls[h.id] = d;
        }
        d._h = h;
        const [x, y] = toScreen(h.at);
        d.style.transform = `translate(${x}px, ${y}px)`;
        d.hidden = !usable;
        if (h.kind === 'flap') d.setAttribute('aria-pressed', String(h.t > 0.5));
        else d.setAttribute('aria-valuenow', String(Math.round(h.kind === 'wheel' ? ((h.t % 360) + 360) % 360 : h.t * 100)));
        live.add(h.id);
      }
      for (const id of Object.keys(handleEls)) if (!live.has(id)) handleEls[id].hidden = true;
    }
    function bindHandle(d, id) {
      let drag = null;
      d.addEventListener('pointerdown', e => {
        const h = d._h; if (!h) return;
        e.preventDefault(); e.stopPropagation();
        d.setPointerCapture(e.pointerId);
        const a = toScreen(h.a), b = toScreen(h.b);
        drag = { x: e.clientX, y: e.clientY, t: h.t, v: [b[0] - a[0], b[1] - a[1]] };
        d.classList.add('is-dragging');
      });
      d.addEventListener('pointermove', e => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y, v2 = drag.v, l2 = v2[0] * v2[0] + v2[1] * v2[1] || 1;
        tabs[id] = clamp(drag.t + (dx * v2[0] + dy * v2[1]) / l2, 0, 1);
        dirty = true; kick();
      });
      const end = () => { if (!drag) return; drag = null; d.classList.remove('is-dragging'); console.info(TAG, 'tab', id, (tabs[id] || 0).toFixed(2)); };
      d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
      d.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault(); e.stopPropagation();
        const h = d._h; tabs[id] = clamp((tabs[id] !== undefined ? tabs[id] : h.t) + (e.key === 'ArrowRight' ? 0.08 : -0.08), 0, 1);
        dirty = true; kick();
      });
    }

    const flapAnims = {};
    function bindFlap(d, id) {
      let down2 = null;
      const toggle = () => {
        const from = tabs[id] !== undefined ? tabs[id] : d._h.t;
        flapAnims[id] = { from, to: from > 0.5 ? 0 : 1, t0: performance.now(), dur: 650 };
        console.info(TAG, 'flap', id, from > 0.5 ? 'close' : 'open');
        kick();
      };
      d.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); down2 = { x: e.clientX, y: e.clientY }; });
      d.addEventListener('pointerup', e => { if (down2 && Math.hypot(e.clientX - down2.x, e.clientY - down2.y) < 12) toggle(); down2 = null; });
      d.addEventListener('pointercancel', () => { down2 = null; });
      d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(); } });
    }

    // Pointer to page coordinates: ray through the pixel, intersected with the page plane.
    function pageAt(e, R) {
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width * 2 - 1, ny = 1 - (e.clientY - rect.top) / rect.height * 2;
      const inv = invert(VP);
      const un = (z) => { const v4 = [0, 1, 2, 3].map(r => inv[r] * nx + inv[4 + r] * ny + inv[8 + r] * z + inv[12 + r]); return [v4[0] / v4[3], v4[1] / v4[3], v4[2] / v4[3]]; };
      const p0 = un(-1), p1 = un(1), dir = sub(p1, p0), den = dot(dir, R.n);
      if (Math.abs(den) < 1e-9) return null;
      const pt = madd(p0, dir, dot(sub(R.o, p0), R.n) / den);
      return [dot(sub(pt, R.o), R.ax), dot(sub(pt, R.o), R.ay)];
    }
    function bindWheel(d, id) {
      let drag = null;
      const angleOf = (e, h) => { const q = pageAt(e, h.plane); return q ? Math.atan2(q[1] - h.center[1], q[0] - h.center[0]) / DEG : null; };
      const snap = h => { if (h.steps) { const st = 360 / h.steps; tabs[id] = Math.round(tabs[id] / st) * st; } };
      d.addEventListener('pointerdown', e => {
        const h = d._h; if (!h) return;
        e.preventDefault(); e.stopPropagation();
        d.setPointerCapture(e.pointerId);
        drag = { a0: angleOf(e, h), deg: h.t };
        d.classList.add('is-dragging');
      });
      d.addEventListener('pointermove', e => {
        if (!drag || drag.a0 === null) return;
        const a = angleOf(e, d._h); if (a === null) return;
        let da = a - drag.a0; da = ((da + 540) % 360) - 180;
        drag.deg += da; drag.a0 = a;
        tabs[id] = drag.deg;
        dirty = true; kick();
      });
      const end = () => { if (!drag) return; drag = null; d.classList.remove('is-dragging'); snap(d._h); dirty = true; kick(); console.info(TAG, 'wheel', id, Math.round(tabs[id] || 0)); };
      d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
      d.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault(); e.stopPropagation();
        const h = d._h, st = h.steps ? 360 / h.steps : 15;
        tabs[id] = (tabs[id] !== undefined ? tabs[id] : h.t) + (e.key === 'ArrowRight' ? st : -st);
        dirty = true; kick();
      });
    }

    /* debug overlay */
    const badges = [];
    function drawDebug(P) {
      dbg.hidden = false;
      const now = performance.now();
      stats.fpsAcc.push(now); while (stats.fpsAcc.length && now - stats.fpsAcc[0] > 1000) stats.fpsAcc.shift();
      const LABEL = { 'wall/page': 'parete', 'wall/floor': 'parete', 'V opening': 'apertura V', 'crease/page': 'piega', flap: 'sportello', wheel: 'ruota' };
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      const fps = anim ? `${stats.fpsAcc.length} fotogrammi/s` : 'fermo';
      let html = `<div class="popup-debug-head"><b>Diagnostica</b><span>${fps} · ${(stats.ms / Math.max(1, stats.frames)).toFixed(1)} ms</span></div>`;
      let bi = 0;
      for (const S of P.spreads) {
        html += `<div class="popup-debug-spread">Apertura ${S.s + 1} · libro a ${S.theta.toFixed(0)}°</div>`;
        const seen = {}, rows = {};
        for (const m of S.metrics) {
          if (!(m.id in seen)) { seen[m.id] = ++bi; rows[m.id] = []; }
          rows[m.id].push(`${LABEL[m.label] || m.label} ${m.value.toFixed(0)}°`);
        }
        for (const id of Object.keys(rows)) html += `<div class="popup-debug-row"><i>${seen[id]}</i><span>${esc(id)}</span><em>${rows[id].join(' · ')}</em></div>`;
        for (const id of Object.keys(seen)) {
          const f = S.faces.find(q => q.piece === id); if (!f) continue;
          const cs = corners(f), c = mul(cs.reduce((a, b) => add(a, b), [0, 0, 0]), 0.25);
          let b = badges[seen[id] - 1];
          if (!b) { b = document.createElement('span'); b.className = 'popup-badge'; el.appendChild(b); badges[seen[id] - 1] = b; }
          const [x, y] = toScreen(c); b.textContent = seen[id]; b.style.transform = `translate(${x}px, ${y}px)`; b.hidden = false;
        }
      }
      for (let i = bi; i < badges.length; i++) if (badges[i]) badges[i].hidden = true;
      html += '<div class="popup-debug-note">Angoli misurati sulla carta: a libro aperto le pareti stanno a 90°.</div>';
      dbg.innerHTML = html;
    }

    /* animation */
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    function turn(leaf, to, dur, label, target) {
      if (anim) return;
      console.info(TAG, label, { from: current, to: target });
      current = target;
      anim = { leaf, from: phis[leaf], to, t0: performance.now(), dur, label };
      stats.frames = 0; stats.ms = 0; stats.max = 0;
      updateUI(); kick();
    }
    const open = () => { if (current === 0) turn(0, 180, 1700, 'open', 1); };
    const next = () => { if (current === 0) open(); else if (current < n) turn(current, 180, 1500, 'turn forward', current + 1); };
    const prev = () => { if (current > 0) turn(current - 1, 0, current === 1 ? 1600 : 1500, current === 1 ? 'close' : 'turn back', current - 1); };

    function tick(now) {
      raf = 0;
      if (destroyed) return;
      if (anim) {
        const t = clamp((now - anim.t0) / anim.dur, 0, 1);
        phis[anim.leaf] = anim.from + (anim.to - anim.from) * ease(t);
        dirty = true;
        if (t >= 1) {
          const a = anim; anim = null;
          console.info(TAG, a.label + ' done', { spread: current, frames: stats.frames, avgMs: +(stats.ms / Math.max(1, stats.frames)).toFixed(2), maxMs: +stats.max.toFixed(2) });
          updateUI();
        }
      }
      for (const id of Object.keys(flapAnims)) {
        const fa = flapAnims[id], t = clamp((now - fa.t0) / fa.dur, 0, 1);
        tabs[id] = fa.from + (fa.to - fa.from) * ease(t);
        dirty = true;
        if (t >= 1) delete flapAnims[id];
      }
      if (dirty && visible && ready) { dirty = false; frame(); }
      if (anim || dirty || Object.keys(flapAnims).length) kick();
    }
    function kick() { if (!raf && !destroyed) raf = requestAnimationFrame(tick); }

    function updateUI() {
      countEl.textContent = current === 0 ? '' : `${current} / ${n}`;
      btnPrev.disabled = current === 0 || !!anim;
      btnNext.disabled = (current >= n && current !== 0) || !!anim;
      el.classList.toggle('is-closed', current === 0);
      const kinds = current > 0 ? new Set(model.spreads[current - 1].pieces.map(p => p.type)) : new Set();
      const tips = [['slider', 'Trascina la linguetta'], ['flap', 'Tocca lo sportello'], ['wheel', 'Gira la ruota']].filter(([k]) => kinds.has(k)).map(([, t]) => t);
      hint.textContent = current === 0 ? 'Tocca il libro per aprirlo' : !anim ? tips.join(' · ') : '';
    }

    /* input */
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', e => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y, dt = performance.now() - down.t;
      down = null;
      if (Math.hypot(dx, dy) < 10 && dt < 700) { if (current === 0) open(); return; }
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) next(); else prev(); }
    });
    canvas.addEventListener('pointercancel', () => { down = null; });
    btnNext.addEventListener('click', e => { e.stopPropagation(); next(); });
    btnPrev.addEventListener('click', e => { e.stopPropagation(); prev(); });
    el.addEventListener('keydown', e => {
      if (e.target !== el && e.target.tagName !== 'BUTTON') return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'PageDown') next();
      else if (k === 'ArrowLeft' || k === 'PageUp') prev();
      else if ((k === 'Enter' || k === ' ') && e.target === el) { if (current === 0) open(); else next(); }
      else return;
      e.preventDefault();
    });

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) { dirty = true; kick(); } });
    io.observe(el);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); console.error(TAG, 'WebGL context lost'); });

    resize();
    updateUI();
    fontsReady.then(() => {
      if (destroyed) return;
      buildTextures();
      dirty = true; kick();
      console.info(TAG, 'scene loaded', { title: model.title, spreads: n, pieces: model.spreads.reduce((a, s) => a + s.pieces.length, 0), textures: Object.keys(tex).length, textureMs: Math.round(texMs), mountMs: Math.round(performance.now() - tStart), debug });
    });

    return {
      open, next, prev,
      get spread() { return current; },
      setAngle(leaf, phi) { phis[leaf] = phi; dirty = true; kick(); },
      setTab(id, t) { tabs[id] = t; dirty = true; kick(); },
      destroy() { destroyed = true; ro.disconnect(); io.disconnect(); cancelAnimationFrame(raf); el.innerHTML = ''; },
    };
  }

  Popup.mount = mount;
})(typeof globalThis !== 'undefined' ? globalThis : this);
