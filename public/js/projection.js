'use strict';

// ---------- projection and solids ----------

function setProj(cols) {
  if (cols === 0) { P.c = 0.883; P.s = 0.469; P.K = 1; P.tilt = 0.52; P.zk = 0.95; P.cs = 1.2; }
  else { P.c = 1; P.s = 0; P.K = 1; P.tilt = 0.62; P.zk = 0.9; P.cs = 1.3; }
}

// World (x, y, height z) -> scene px.
function pj(x, y, z) {
  return [(x * P.c - y * P.s) * P.K + P.ox, (x * P.s + y * P.c) * P.K * P.tilt - (z || 0) * P.zk + P.oy];
}

function fillPoly(pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function flat(x0, y0, x1, y1, z, fill) {
  fillPoly([pj(x0, y0, z), pj(x1, y0, z), pj(x1, y1, z), pj(x0, y1, z)], fill);
}

// Vertical rectangle in the plane y = const (faces the viewer).
function vface(y, x0, x1, z0, z1, fill) {
  fillPoly([pj(x0, y, z0), pj(x1, y, z0), pj(x1, y, z1), pj(x0, y, z1)], fill);
}

function groundShadow(x0, y0, x1, y1, h) {
  const d = Math.min(14, h * 0.45 + 2);
  flat(x0 + d, y0 + d, x1 + d, y1 + d, 0, 'rgba(31,42,55,0.11)');
}

// Extruded box: lit top, front (+y) face and shaded side (+x) face. o.glass = translucent.
function box(x0, y0, x1, y1, z0, z1, col, o) {
  o = o || {};
  if (!o.noShadow) groundShadow(x0, y0, x1, y1, z1);
  const g = !!o.glass;
  fillPoly([pj(x0, y1, z0), pj(x1, y1, z0), pj(x1, y1, z1), pj(x0, y1, z1)], g ? 'rgba(160,215,240,0.30)' : col);
  if (P.s > 0) fillPoly([pj(x1, y1, z0), pj(x1, y0, z0), pj(x1, y0, z1), pj(x1, y1, z1)], g ? 'rgba(120,190,225,0.38)' : mix(col, -0.22));
  fillPoly([pj(x0, y0, z1), pj(x1, y0, z1), pj(x1, y1, z1), pj(x0, y1, z1)], g ? 'rgba(235,248,255,0.65)' : mix(col, 0.16));
  if (g) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ---------- depth sorting ----------

function behind(a, b) { return a.y1 <= b.y0 || (P.s > 0 && a.x1 <= b.x0); }
function before(a, b) {
  const ab = behind(a, b), ba = behind(b, a);
  if (ab && !ba) return true;
  if (ba && !ab) return false;
  return a.k < b.k;
}
// Offset-free projection used for screen bounding boxes (the common ox/oy offset cancels out).
function pjr(x, y, z) {
  return [(x * P.c - y * P.s) * P.K, (x * P.s + y * P.c) * P.K * P.tilt - z * P.zk];
}
function footprintBox(x0, y0, x1, y1, h) {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const [x, y, z] of [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]]) {
    const q = pjr(x, y, z);
    if (q[0] < u0) u0 = q[0]; if (q[0] > u1) u1 = q[0];
    if (q[1] < v0) v0 = q[1]; if (q[1] > v1) v1 = q[1];
  }
  return [u0, v0, u1, v1];
}
const sbOverlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// Painter's order. Pairs that do not overlap on screen need no order at all; constraining them (by the
// diagonal tie-break) created cycles with far-away walls that left walls drawn on top of seated characters.
function depthSort(items) {
  const n = items.length, out = [], st = new Uint8Array(n);
  const visit = (i) => {
    if (st[i]) return;
    st[i] = 1;
    for (let j = 0; j < n; j++) if (j !== i && st[j] === 0 && sbOverlap(items[j].sb, items[i].sb) && before(items[j], items[i])) visit(j);
    out.push(items[i]);
    st[i] = 2;
  };
  for (let i = 0; i < n; i++) visit(i);
  return out;
}

function addItem(L, x0, y0, x1, y1, draw, h) {
  L.items.push({ x0, y0, x1, y1, k: P.s > 0 ? (x0 + x1 + y0 + y1) / 2 : (y0 + y1) / 2, draw, sb: footprintBox(x0, y0, x1, y1, h || 60) });
}
function addBoxItem(L, x0, y0, x1, y1, z0, z1, col, o) {
  addItem(L, x0, y0, x1, y1, () => box(x0, y0, x1, y1, z0, z1, col, o), z1);
}
