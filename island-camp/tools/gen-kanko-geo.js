#!/usr/bin/env node
// Generate island-camp/kanko-geo.js from OpenStreetMap (Overpass API).
// Real road polylines (trunk/primary/secondary/tertiary) and settlement
// labels (place=town/village/hamlet) per island, simplified for the
// pamphlet-style map. Data (c) OpenStreetMap contributors, ODbL 1.0.
//
// Usage: node tools/gen-kanko-geo.js [islandId ...]
//   (no args = all islands found in geo.js)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'kanko-geo.js');
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];
const UA = 'island-camp-kanko-geo/1.0 (+https://github.com/yoshi2008815-ai/my-apps)';

/* ---------- load coastline rings from geo.js ---------- */
function loadGeo() {
  const src = fs.readFileSync(path.join(ROOT, 'geo.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox);
  return sandbox.window.GEO;
}
const REF_ALIAS = { 'okinawa-hontou': 'okinawa' };
function ringFor(GEO, id) {
  if (GEO.islands && GEO.islands[id]) return GEO.islands[id];
  const rk = REF_ALIAS[id] || id;
  if (GEO.refs && GEO.refs[rk]) {
    return GEO.refs[rk].reduce((a, b) => (a.length >= b.length ? a : b));
  }
  return null;
}

/* ---------- geometry helpers ---------- */
function bboxOf(ring, margin) {
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  for (const [la, ln] of ring) {
    if (la < s) s = la; if (la > n) n = la;
    if (ln < w) w = ln; if (ln > e) e = ln;
  }
  return [s - margin, w - margin, n + margin, e + margin];
}
// Douglas-Peucker on [lat,lng] points (degrees, lng scaled by cos(lat))
function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const kx = Math.cos((pts[0][0] * Math.PI) / 180);
  const sq = (p, a, b) => {
    let x = a[1] * kx, y = a[0], dx = b[1] * kx - x, dy = b[0] - y;
    if (dx || dy) {
      const t = (((p[1] * kx - x) * dx) + ((p[0] - y) * dy)) / (dx * dx + dy * dy);
      if (t > 1) { x = b[1] * kx; y = b[0]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    return (p[1] * kx - x) ** 2 + (p[0] - y) ** 2;
  };
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [i0, i1] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = sq(pts[i], pts[i0], pts[i1]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > t2) { keep[idx] = true; stack.push([i0, idx], [idx, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function pathLen(pts) {
  const kx = Math.cos((pts[0][0] * Math.PI) / 180);
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i][0] - pts[i - 1][0], (pts[i][1] - pts[i - 1][1]) * kx);
  }
  return L;
}
// stitch polylines whose endpoints coincide (within eps degrees)
function stitch(lines, eps) {
  const eq = (a, b) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
  const out = lines.map(l => l.slice());
  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        let joined = null;
        if (eq(a[a.length - 1], b[0])) joined = a.concat(b.slice(1));
        else if (eq(b[b.length - 1], a[0])) joined = b.concat(a.slice(1));
        else if (eq(a[a.length - 1], b[b.length - 1])) joined = a.concat(b.slice(0, -1).reverse());
        else if (eq(a[0], b[0])) joined = a.slice().reverse().concat(b.slice(1));
        if (joined) {
          out[i] = joined;
          out.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return out;
}

/* ---------- Overpass ---------- */
function queryFor(bbox, classes) {
  const bb = bbox.join(',');
  return `[out:json][timeout:120];
(
  way["highway"~"^(${classes.join('|')})$"](${bb});
);
out geom;
node["place"~"^(city|town|village|hamlet)$"](${bb});
out;`;
}
async function overpass(q) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': UA,
            'Accept': 'application/json',
          },
          body: 'data=' + encodeURIComponent(q),
        });
        if (res.status === 429 || res.status === 504) throw new Error(`HTTP ${res.status} @ ${ep}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} @ ${ep}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        console.warn(`  retrying on next endpoint: ${e.message}`);
        await sleep(3000);
      }
    }
    await sleep(15000);
  }
  throw lastErr;
}

/* ---------- per-island processing ---------- */
const MAIN_CLASSES = new Set(['trunk', 'primary', 'secondary']);
const round4 = v => Math.round(v * 1e4) / 1e4;

async function buildIsland(id, ring) {
  const bbox = bboxOf(ring, 0.015);
  const span = Math.max(bbox[2] - bbox[0], (bbox[3] - bbox[1]) * Math.cos((bbox[0] * Math.PI) / 180));
  // big islands: keep to the arterial network; small islands: include tertiary
  const classes = span > 0.45
    ? ['trunk', 'primary', 'secondary']
    : ['trunk', 'primary', 'secondary', 'tertiary'];
  let data = await overpass(queryFor(bbox, classes));
  let ways = data.elements.filter(el => el.type === 'way' && el.geometry);
  // tiny islands often only have unclassified roads
  if (ways.length < 3 && span < 0.2) {
    await sleep(1500);
    data = await overpass(queryFor(bbox, [...classes, 'unclassified']));
    ways = data.elements.filter(el => el.type === 'way' && el.geometry);
  }
  const places = data.elements.filter(el => el.type === 'node' && el.tags && el.tags.name);

  const tol = Math.min(0.002, Math.max(0.0004, span * 0.004));
  const minLen = span * 0.03;

  const groups = { main: [], sub: [] };
  for (const wy of ways) {
    const cls = (wy.tags && wy.tags.highway) || '';
    const line = wy.geometry.map(g => [g.lat, g.lon]);
    if (line.length < 2) continue;
    (MAIN_CLASSES.has(cls) ? groups.main : groups.sub).push(line);
  }
  // small islands may have no trunk/primary/secondary at all: promote
  if (!groups.main.length && groups.sub.length) {
    groups.main = groups.sub;
    groups.sub = [];
  }
  const finish = lines => {
    let st = stitch(lines, 2e-4);
    st = st.map(l => simplify(l, tol)).filter(l => l.length >= 2 && pathLen(l) >= minLen);
    st.sort((a, b) => pathLen(b) - pathLen(a));
    return st.map(l => l.map(([la, ln]) => [round4(la), round4(ln)]));
  };
  let main = finish(groups.main);
  let sub = finish(groups.sub);
  // keep the pamphlet look: cap the number of lines (longest first)
  main = main.slice(0, 14);
  sub = sub.slice(0, 18);

  const RANK = { city: 0, town: 1, village: 2, hamlet: 3 };
  const seen = new Set();
  const towns = places
    .sort((a, b) => RANK[a.tags.place] - RANK[b.tags.place])
    .filter(p => {
      const nm = p.tags.name;
      if (seen.has(nm) || nm.length > 8) return false;
      seen.add(nm);
      return true;
    })
    .slice(0, span > 0.45 ? 8 : 5)
    .map(p => ({ name: p.tags.name, lat: round4(p.lat), lng: round4(p.lon) }));

  const nPts = [...main, ...sub].reduce((a, l) => a + l.length, 0);
  console.log(`  roads: main=${main.length} sub=${sub.length} (${nPts} pts, tol=${tol.toFixed(4)}) towns: ${towns.map(t => t.name).join('・') || '-'}`);
  return { roads: { main, sub }, towns };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- main ---------- */
(async () => {
  const GEO = loadGeo();
  const all = Object.keys(GEO.islands || {}).concat(['okinawa-hontou', 'miyako', 'tanegashima']);
  const want = process.argv.slice(2);
  const ids = want.length ? want : all;

  // merge into existing output so partial runs are possible
  let prev = { roads: {}, towns: {} };
  if (fs.existsSync(OUT)) {
    const sandbox = { window: {} };
    try {
      vm.runInNewContext(fs.readFileSync(OUT, 'utf8'), sandbox);
      if (sandbox.window.KGEO) prev = sandbox.window.KGEO;
    } catch (e) { /* regenerate from scratch */ }
  }

  const save = () => {
    const body =
      '// AUTO-GENERATED by tools/gen-kanko-geo.js from OpenStreetMap (Overpass API).\n' +
      '// Road polylines + settlement labels for the pamphlet-style map. Do not hand-edit.\n' +
      '// Map data (c) OpenStreetMap contributors, ODbL 1.0 - www.openstreetmap.org/copyright\n' +
      'window.KGEO=' + JSON.stringify(prev) + ';\n';
    fs.writeFileSync(OUT, body);
    return body.length;
  };

  for (const id of ids) {
    const ring = ringFor(GEO, id);
    if (!ring) { console.warn(`skip ${id}: no coastline in geo.js`); continue; }
    console.log(`${id} ...`);
    try {
      const r = await buildIsland(id, ring);
      if (r.roads.main.length || r.roads.sub.length) prev.roads[id] = r.roads;
      if (r.towns.length) prev.towns[id] = r.towns;
      save(); // 島ごとに逐次保存（中断してもやり直しは残りだけで済む）
    } catch (e) {
      console.error(`  FAILED ${id}: ${e.message}`);
    }
    await sleep(1800);
  }

  console.log(`\nwrote ${OUT} (${(save() / 1024).toFixed(0)} KB, islands: ${Object.keys(prev.roads).length})`);
})();
