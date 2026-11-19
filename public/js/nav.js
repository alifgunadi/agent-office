'use strict';

// ---------- navigation: a grid over the floor and A* paths (pure maths, no DOM) ----------
// Used by the AlifGunadi controls (control.js). Everything is in world coordinates. The grid marks the cells whose centre is
// inside any obstacle grown by the walker's radius, so a path that goes through free cell centres never touches furniture.

const NAV_CELL = 8;       // world units per cell: a 30 unit door gap still leaves two free cells after the walker's radius is taken off
const NAV_RADIUS = 5;     // how far a character reaches around its centre

// obstacles: [{ x0, y0, x1, y1 }]; bounds: the floor, { w, h }. Anything outside the floor is blocked.
function buildNavGrid(bounds, obstacles, cell = NAV_CELL, radius = NAV_RADIUS) {
  const cols = Math.ceil(bounds.w / cell), rows = Math.ceil(bounds.h / cell);
  const blocked = new Uint8Array(cols * rows);
  for (const o of obstacles) {
    const c0 = Math.max(0, Math.floor((o.x0 - radius) / cell)), c1 = Math.min(cols - 1, Math.floor((o.x1 + radius) / cell));
    const r0 = Math.max(0, Math.floor((o.y0 - radius) / cell)), r1 = Math.min(rows - 1, Math.floor((o.y1 + radius) / cell));
    for (let r = r0; r <= r1; r++) {
      const cy = (r + 0.5) * cell;
      if (cy < o.y0 - radius || cy > o.y1 + radius) continue;
      for (let c = c0; c <= c1; c++) {
        const cx = (c + 0.5) * cell;
        if (cx >= o.x0 - radius && cx <= o.x1 + radius) blocked[r * cols + c] = 1;
      }
    }
  }
  return { cell, cols, rows, w: bounds.w, h: bounds.h, blocked };
}

const navIndex = (g, x, y) => {
  if (!(x >= 0 && y >= 0 && x < g.w && y < g.h)) return -1; // also false for NaN
  return Math.floor(y / g.cell) * g.cols + Math.floor(x / g.cell);
};

// Can a character stand at this point?
function navFree(g, x, y) {
  const i = navIndex(g, x, y);
  return i >= 0 && g.blocked[i] === 0;
}

// Is the straight line between two points free all the way? Every cell the segment passes through is checked
// (Amanatides-Woo grid traversal), so a thin corner cannot be skipped.
function navLineFree(g, ax, ay, bx, by) {
  if (navIndex(g, ax, ay) < 0 || navIndex(g, bx, by) < 0) return false;
  let c = Math.floor(ax / g.cell), r = Math.floor(ay / g.cell);
  const c1 = Math.floor(bx / g.cell), r1 = Math.floor(by / g.cell);
  const dx = bx - ax, dy = by - ay;
  const stepC = dx > 0 ? 1 : -1, stepR = dy > 0 ? 1 : -1;
  const tDeltaC = dx !== 0 ? Math.abs(g.cell / dx) : Infinity, tDeltaR = dy !== 0 ? Math.abs(g.cell / dy) : Infinity;
  let tMaxC = dx !== 0 ? ((dx > 0 ? (c + 1) * g.cell - ax : ax - c * g.cell) / Math.abs(dx)) : Infinity;
  let tMaxR = dy !== 0 ? ((dy > 0 ? (r + 1) * g.cell - ay : ay - r * g.cell) / Math.abs(dy)) : Infinity;
  for (let guard = 0; guard < g.cols + g.rows + 4; guard++) {
    if (g.blocked[r * g.cols + c]) return false;
    if (c === c1 && r === r1) return true;
    if (tMaxC < tMaxR) { c += stepC; tMaxC += tDeltaC; } else { r += stepR; tMaxR += tDeltaR; }
    if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return false;
  }
  return false;
}

// The free cell centre closest to a point, looking at most maxCells cells away (so a start inside a blocked cell can still leave).
function navNearestFree(g, x, y, maxCells = 6) {
  if (navFree(g, x, y)) return [x, y];
  const c0 = Math.floor(x / g.cell), r0 = Math.floor(y / g.cell);
  let best = null, bestD = Infinity;
  for (let d = 1; d <= maxCells; d++) {
    for (let r = r0 - d; r <= r0 + d; r++) {
      for (let c = c0 - d; c <= c0 + d; c++) {
        if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== d) continue;
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows || g.blocked[r * g.cols + c]) continue;
        const px = (c + 0.5) * g.cell, py = (r + 0.5) * g.cell, dist = Math.hypot(px - x, py - y);
        if (dist < bestD) { bestD = dist; best = [px, py]; }
      }
    }
    if (best) return best;
  }
  return null;
}

// Binary min-heap of cell indices ordered by f.
function navHeap(f) {
  const a = [];
  const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (f[a[p]] <= f[a[i]]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } };
  const down = (i) => {
    for (;;) {
      let m = i; const l = 2 * i + 1, r = l + 1;
      if (l < a.length && f[a[l]] < f[a[m]]) m = l;
      if (r < a.length && f[a[r]] < f[a[m]]) m = r;
      if (m === i) break;
      [a[m], a[i]] = [a[i], a[m]]; i = m;
    }
  };
  return { size: () => a.length, push: (i) => { a.push(i); up(a.length - 1); }, pop: () => { const t = a[0], e = a.pop(); if (a.length) { a[0] = e; down(0); } return t; } };
}

// A* over the grid (8 directions, no cutting corners), then the path is straightened wherever the line is free.
// Returns { pts: [[x, y], ...], length } from (x0, y0) to (x1, y1), or null when the target cannot be reached.
function navFindPath(g, x0, y0, x1, y1) {
  const s = navNearestFree(g, x0, y0), t = navFree(g, x1, y1) ? [x1, y1] : null;
  if (!s || !t) return null;
  const si = navIndex(g, s[0], s[1]), ti = navIndex(g, t[0], t[1]);
  const n = g.cols * g.rows;
  const gScore = new Float32Array(n).fill(Infinity), f = new Float32Array(n), parent = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const h = (i) => Math.hypot((i % g.cols) - (ti % g.cols), Math.floor(i / g.cols) - Math.floor(ti / g.cols));
  const heap = navHeap(f);
  gScore[si] = 0; f[si] = h(si); heap.push(si);
  const SQ = Math.SQRT2;
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ], [1, -1, SQ], [-1, 1, SQ], [-1, -1, SQ]];
  let found = false;
  while (heap.size()) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === ti) { found = true; break; }
    const c = i % g.cols, r = (i - c) / g.cols;
    for (const [dc, dr, cost] of dirs) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const ni = nr * g.cols + nc;
      if (g.blocked[ni] || closed[ni]) continue;
      if (dc && dr && (g.blocked[r * g.cols + nc] || g.blocked[nr * g.cols + c])) continue; // no cutting corners
      const ng = gScore[i] + cost;
      if (ng < gScore[ni]) { gScore[ni] = ng; parent[ni] = i; f[ni] = ng + h(ni); heap.push(ni); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let i = ti; i >= 0; i = parent[i]) cells.push(i);
  cells.reverse();
  const centre = (i) => [((i % g.cols) + 0.5) * g.cell, (Math.floor(i / g.cols) + 0.5) * g.cell];
  const raw = [[x0, y0], ...cells.slice(1, -1).map(centre), [t[0], t[1]]];
  // string pulling: from each point jump to the farthest later point that can be seen in a straight free line
  const pts = [raw[0]];
  let at = 0;
  while (at < raw.length - 1) {
    let next = at + 1;
    for (let k = raw.length - 1; k > at + 1; k--) {
      if (navLineFree(g, raw[at][0], raw[at][1], raw[k][0], raw[k][1])) { next = k; break; }
    }
    pts.push(raw[next]);
    at = next;
  }
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { pts, length };
}
