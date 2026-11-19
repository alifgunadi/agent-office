'use strict';

// ---------- floorplan geometry ----------

function runs(a0, a1, gaps) {
  const g = gaps.slice().sort((p, q) => p[0] - q[0]);
  const out = [];
  let cur = a0;
  for (const [s, e] of g) {
    if (s > cur) out.push([cur, Math.min(s, a1)]);
    cur = Math.max(cur, e);
  }
  if (cur < a1) out.push([cur, a1]);
  return out.filter((r) => r[1] - r[0] > 1);
}
const gapsFor = (z, side) => z.doors.filter((d) => d.side === side).map((d) => [d.c - d.len / 2, d.c + d.len / 2]);

function resolveDoors(z, stacked) {
  const src = stacked
    ? [{ side: 'top', c: z.x + GX_OFF, len: 30 }, { side: 'bottom', c: z.x + GX_OFF, len: 30 }]
    : ZONES[z.key].doors.map((d) => ({
      side: d.side,
      c: (d.side === 'top' || d.side === 'bottom') ? z.x + z.w * d.at : z.y + z.h * d.at,
      len: d.len,
    }));
  z.doors = src.map((d) => {
    const horiz = d.side === 'top' || d.side === 'bottom';
    d.x = horiz ? d.c : (d.side === 'left' ? z.x : z.x + z.w);
    d.y = horiz ? (d.side === 'top' ? z.y : z.y + z.h) : d.c;
    const out = stacked ? 5 : (d.side === 'top' ? GAP - 10 : 10), inn = 16;
    d.outX = d.x; d.outY = d.y; d.inX = d.x; d.inY = d.y;
    if (d.side === 'top') { d.outY = d.y - out; d.inY = d.y + inn; }
    else if (d.side === 'bottom') { d.outY = d.y + out; d.inY = d.y - inn; }
    else if (d.side === 'left') { d.outX = d.x - 8; d.inX = d.x + inn; }
    else { d.outX = d.x + 8; d.inX = d.x - inn; }
    return d;
  });
}

function loungeGeom(z, stacked) {
  const X = z.x, Y = z.y, w = z.w, h = z.h - LBL; // furniture area; the bottom strip is the floor label
  const tw = 130, th = 58, tx = X + (w - tw) / 2, ty = Y + h - th - 34;
  const g = { z };
  g.table = { x0: tx, y0: ty, x1: tx + tw, y1: ty + th };
  g.seats = [[tx + 30, ty - 14], [tx + tw - 30, ty - 14], [tx + 30, ty + th + 14], [tx + tw - 30, ty + th + 14]];
  g.plants = [[X + 26, Y + h - 24], [X + w - 26, Y + h - 24]];
  g.counterX = X + w - 128;
  g.door = z.doors.find((d) => d.side === 'bottom');
  g.hub = { x: stacked ? X + GX_OFF : g.door.x, y: Y + 112 };
  const sofa = [71, 121, 171].map((dx) => [X + dx, Y + 66]);
  const S = (type, x, y, zz, face, anim, via, side, flipFace) => ({ type, x, y, z: zz, face: face || 'front', anim: anim || null, via: via || null, side: !!side, flipFace: !!flipFace });
  g.slots = [
    S('sofa', sofa[0][0], sofa[0][1], SEAT, 'front', 'chat'),
    S('coffee', X + w - 100, Y + 92, 0, 'front', 'coffee'),
    S('table', g.seats[0][0], g.seats[0][1], SEAT, 'front', 'chat'),
    S('sofa', sofa[1][0], sofa[1][1], SEAT, 'front', 'chat'),
    S('table', g.seats[1][0], g.seats[1][1], SEAT, 'front', 'chat'),
    S('plant', X + 54, Y + h - 46, 0, 'front', 'stretch'),
    S('coffee', X + w - 54, Y + 92, 0, 'front', 'coffee'),
    S('sofa', sofa[2][0], sofa[2][1], SEAT, 'front', 'chat'),
    S('table', g.seats[2][0], g.seats[2][1], SEAT, 'back', 'chat', [tx - 18, g.seats[2][1]]),
    S('floor', X + w * 0.5 - 34, Y + 102, 0, 'front', 'chat', null, true, false),
    S('plant', X + w - 54, Y + h - 46, 0, 'front', 'stretch'),
    S('table', g.seats[3][0], g.seats[3][1], SEAT, 'back', 'chat', [tx - 18, g.seats[3][1]]),
    S('floor', X + w * 0.5 + 34, Y + 102, 0, 'front', 'chat', null, true, true),
  ];
  return g;
}

// Floor lettering: the room name lies on the floor, using the floor's own affine basis.
// Door gaps of the wall that faces the viewer at the front of a room, as intervals along the view's x axis.
function frontGaps(z) {
  const side = ['bottom', 'top', 'left', 'right'].find((s) => wallRole(s) === 'S');
  const alongX = side === 'top' || side === 'bottom';
  const at = side === 'top' ? z.y : side === 'bottom' ? z.y + z.h : side === 'left' ? z.x : z.x + z.w;
  return gapsFor(z, side).map((g) => {
    const a = alongX ? viewXY(g[0], at)[0] : viewXY(at, g[0])[0], b = alongX ? viewXY(g[1], at)[0] : viewXY(at, g[1])[0];
    return [Math.min(a, b), Math.max(a, b)];
  });
}

function drawFloorLabel(z) {
  const T = z.glass ? T_GLASS : T_WALL;
  const ax = P.c * P.K, ay = P.s * P.K * P.tilt;
  const byv = P.c * P.K * P.tilt, bxv = -P.s * P.K * (1 - FLOOR_UPRIGHT);
  const vs = Math.min(1.8, 0.9 * Math.hypot(ax, ay) / byv);
  const ph = 24;
  let fs = 20;
  ctx.font = '800 ' + fs + 'px ' + FONT;
  let tw = ctx.measureText(z.label).width;
  const vr = viewRect(z.x, z.y, z.x + z.w, z.y + z.h); // the room as the camera sees it (the same rectangle at camera turn 0)
  const avail = (vr[2] - vr[0]) - 2 * T - 28;
  if (tw + 24 > avail) { fs = Math.max(14, fs * avail / (tw + 24)); ctx.font = '800 ' + fs + 'px ' + FONT; tw = ctx.measureText(z.label).width; }
  const w = tw + 24;
  const gaps = frontGaps(z);
  const clash = (x0) => gaps.some((g) => x0 < g[1] + 10 && x0 + w > g[0] - 10);
  let x = vr[0] + T + 12;
  if (clash(x)) {
    const cands = gaps.map((g) => g[1] + 10).concat([vr[2] - T - 12 - w]);
    x = cands.find((c) => c + w <= vr[2] - T - 8 && !clash(c)) ?? x;
  }
  const y = vr[3] - T - 1 - ph * vs;
  const o = projectView(x, y, 0.5);
  ctx.save();
  ctx.transform(ax, ay, bxv * vs, byv * vs, o[0], o[1]);
  rr(0, 0, w, ph, 8, 'rgba(255,255,255,0.6)');
  ctx.fillStyle = '#1f2a37';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '800 ' + fs + 'px ' + FONT;
  ctx.fillText(z.label, 12, ph / 2 + 1);
  if (z.key === 'guest' && z.empty) {
    const note = 'No visitors right now';
    ctx.font = '700 17px ' + FONT;
    const nw = ctx.measureText(note).width;
    if (x + w + 14 + nw < vr[2] - T - 8) {
      ctx.fillStyle = '#4b5563';
      ctx.fillText(note, w + 14, ph / 2 + 1);
    }
  }
  ctx.restore();
}

// The navigation grid of a layout, built the first time someone needs it. It treats every solid item, the chairs of the other desks
// and the sofa cushions as obstacles; the grid is for AlifGunadi, so his own chair is free.
function layoutNav(L) {
  if (!L.nav) {
    const obstacles = L.items.map((it) => ({ x0: it.wr[0], y0: it.wr[1], x1: it.wr[2], y1: it.wr[3] }));
    for (const o of L.obstacles) if (o.owner !== OfficeRoles.MAIN_DESK) obstacles.push(o);
    L.nav = buildNavGrid({ w: L.W, h: L.H }, obstacles);
  }
  return L.nav;
}

function buildLayout(list, cols) {
  setProj(cols);
  const stacked = cols > 0;
  const groups = { trainer: [], product: [], eng: [], qa: [], guest: [] };
  list.forEach((d, index) => { groups[ZONE_OF[d.id] || 'guest'].push({ id: d.id, index }); });
  const L = { cols, zones: [], places: [], byId: new Map(), floors: [], ground: [], items: [], tags: [], obstacles: [], nav: null, ver: ++layoutVer };
  const zone = (key, x, y, w, h, row) => {
    const z = Object.assign({ key, x, y, w, h, row }, ZONES[key]);
    z.hN = z.glass ? WG : (row === 0 ? WH : WL);
    resolveDoors(z, stacked);
    L.zones.push(z);
    return z;
  };
  const put = (pl) => { L.places.push(pl); L.byId.set(pl.id, pl); };
  const grid = (z, items, c) => {
    const gx = z.x + (z.w - c * CW) / 2;
    items.forEach((p, i) => put({ id: p.id, index: p.index, zone: z, x: gx + (i % c) * CW, y: z.y + HDR + Math.floor(i / c) * CH, k: 1 }));
  };
  const trainer = (z, items) => items.forEach((p) => put({ id: p.id, index: p.index, zone: z, x: z.x + (z.w - CW * TK) / 2, y: z.y + HDR, k: TK }));
  const guests = (x, y, w, c, row) => {
    const n = groups.guest.length;
    const z = zone('guest', x, y, w, n ? HDR + Math.ceil(n / c) * CH + LBL + 12 : LBL + 14, row);
    z.empty = !n;
    grid(z, groups.guest, c);
    return z;
  };
  let W, H;
  if (!stacked) {
    const R1 = 284, R2 = HDR + CH + LBL + 14, y2 = 10 + R1 + GAP;
    const tw = 260, pw = 5 * CW + 30, lw = 350;
    const px = 10 + tw + GAP, lx = px + pw + GAP, right = lx + lw;
    W = right + 10;
    trainer(zone('trainer', 10, 10, tw, R1, 0), groups.trainer);
    grid(zone('product', px, 10, pw, R1, 0), groups.product, 5);
    zone('lounge', lx, 10, lw, R1, 0);
    const ew = 4 * CW + 20, qx = 10 + ew + GAP;
    grid(zone('eng', 10, y2, ew, R2, 1), groups.eng, 4);
    grid(zone('qa', qx, y2, right - qx, R2, 1), groups.qa, 2);
    const g = guests(10, y2 + R2 + GAP, right - 10, 6, 2);
    H = g.y + g.h + 10;
  } else {
    W = cols * CW + 40;
    const zw = W - 20;
    let y = 10, row = 0;
    const next = (key, h) => { const z = zone(key, 10, y, zw, h, row++); y += h + 10; return z; };
    const rows = (key) => Math.ceil(ZONE_IDS[key].length / cols);
    trainer(next('trainer', HDR + Math.ceil(CH * TK) + LBL + 12), groups.trainer);
    grid(next('product', HDR + rows('product') * CH + LBL + 22), groups.product, cols);
    grid(next('eng', HDR + rows('eng') * CH + LBL + 12), groups.eng, cols);
    grid(next('qa', HDR + rows('qa') * CH + LBL + 12), groups.qa, cols);
    next('lounge', 230 + LBL);
    const n = groups.guest.length;
    const gz = next('guest', n ? HDR + Math.ceil(n / cols) * CH + LBL + 12 : LBL + 14);
    gz.empty = !n;
    grid(gz, groups.guest, cols);
    H = y;
  }
  L.W = W; L.H = H;
  setView(P.rot, W / 2, H / 2); // the camera turns around the middle of the floor
  L.rot = P.rot; L.walls = camera.walls;
  const lz = L.zones.find((z) => z.key === 'lounge');
  L.lounge = loungeGeom(lz, stacked);

  // base slab (corridor) and zone floors
  L.floors.push(() => {
    const so = shadowOffset(18);
    flat(so[0], so[1], W + so[0], H + so[1], -9, 'rgba(31,42,55,0.10)');
    box(0, 0, W, H, -9, -2, CORRIDOR, { noShadow: true });
  });
  for (const z of L.zones) {
    L.floors.push(() => {
      box(z.x, z.y, z.x + z.w, z.y + z.h, -2, 0, z.floor, { noShadow: true });
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = z.x + 40; x < z.x + z.w - 4; x += 40) {
        const a = pj(x, z.y + 4, 0), b = pj(x, z.y + z.h - 4, 0);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      for (let y = z.y + 40; y < z.y + z.h - 4; y += 40) {
        const a = pj(z.x + 4, y, 0), b = pj(z.x + z.w - 4, y, 0);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    });
    L.ground.push(() => drawFloorLabel(z));
  }
  for (const z of L.zones) { addWalls(L, z); addProps(L, z); }
  for (const p of L.places) addDesk(L, p);
  addLounge(L);

  // scene extents (scene px, before the css scale)
  P.ox = 0; P.oy = 0;
  const cs = [pj(0, 0, 0), pj(W, 0, 0), pj(0, H, 0), pj(W, H, 0)];
  const us = cs.map((c) => c[0]), vs = cs.map((c) => c[1]);
  const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs);
  const padX = 12, extra = WH * P.zk + 6;
  L.sceneW = maxU - minU + padX * 2;
  L.ox = padX - minU;
  L.sceneH = maxV - minV + extra + 9 * P.zk + 16;
  L.oy = extra - minV;
  return L;
}

function addWalls(L, z) {
  const g = !!z.glass, T = g ? T_GLASS : T_WALL, col = g ? '#8fcbe6' : z.wall;
  const o = g ? { glass: true, noShadow: true } : {};
  // wall items are marked so a click on a wall (above the floor line it stands on) is refused (see hitTest in control.js)
  const wall = (x0, y0, x1, y1, h) => { addBoxItem(L, x0, y0, x1, y1, 0, h, col, o); const it = L.items[L.items.length - 1]; it.wall = true; it.h = h; };
  runs(z.x + T, z.x + z.w, gapsFor(z, 'top')).forEach(([a, b]) => wall(a, z.y, b, z.y + T, wallHeight(z, 'top')));
  runs(z.y, z.y + z.h, gapsFor(z, 'left')).forEach(([a, b]) => wall(z.x, a, z.x + T, b, wallHeight(z, 'left')));
  runs(z.x + T, z.x + z.w, gapsFor(z, 'bottom')).forEach(([a, b]) => wall(a, z.y + z.h - T, b, z.y + z.h, wallHeight(z, 'bottom')));
  runs(z.y + T, z.y + z.h - T, gapsFor(z, 'right')).forEach(([a, b]) => wall(z.x + z.w - T, a, z.x + z.w, b, wallHeight(z, 'right')));
}

// The four walls of a room, by the direction they face in the world.
const WALL_NORMAL = { top: [0, -1], left: [-1, 0], bottom: [0, 1], right: [1, 0] };
// Which way a wall faces in the view: 'N' and 'W' are the back walls (tall), 'S' and 'E' the front ones (low), seen from the camera.
function wallRole(side) {
  const n = WALL_NORMAL[side], v = viewDir(n[0], n[1]);
  return v[1] < 0 ? 'N' : v[1] > 0 ? 'S' : v[0] < 0 ? 'W' : 'E';
}
// Wall height by mode: 'up' = every wall full height, 'cut' = the two back walls tall and the front ones low (a cutaway), 'down' = only a low edge.
function wallHeight(z, side) {
  const g = !!z.glass;
  if (camera.walls === 'down') return WF;
  if (camera.walls === 'up') return g ? WG : WH;
  switch (wallRole(side)) {
    case 'N': return z.hN;
    case 'W': return g ? WG : WH;
    default: return g ? WG : WF;
  }
}

function drawPlant(x, y, r) {
  const k = r / 12;
  box(x - 7, y - 7, x + 7, y + 7, 0, 11, '#b7794a');
  const c = pj(x, y, 11);
  for (const [dx, dy, rad, col] of [[-5, -6, 8, '#3f9d5a'], [6, -8, 8, '#4fb36b'], [0, -17, 9, '#2f8a4c'], [0, -9, 9, '#3f9d5a']]) {
    circle(c[0] + dx * k, c[1] + dy * k, rad * k, col);
  }
}
function addPlant(L, x, y, r) { addItem(L, x - 9, y - 9, x + 9, y + 9, () => drawPlant(x, y, r)); }

function addProps(L, z) {
  const x = z.x, y = z.y, w = z.w, h = z.h;
  if (z.key === 'trainer') {
    addPlant(L, x + w - 24, y + 70, 12);
  } else if (z.key === 'product') {
    // whiteboard on the north wall
    const bx = x + w - 210, by = y + T_WALL;
    addItem(L, bx, by, bx + 190, by + 1, () => {
      vface(by + 0.5, bx, bx + 190, 7, 25, '#ffffff');
      // outline follows the wall plane (four projected corners), not a screen-aligned rectangle
      const q = [pj(bx, by + 0.5, 7), pj(bx + 190, by + 0.5, 7), pj(bx + 190, by + 0.5, 25), pj(bx, by + 0.5, 25)];
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
      ctx.closePath();
      ctx.stroke();
      [['#2f6fe0', 14, 60], ['#d23c3c', 70, 40], ['#1f9d55', 118, 56]].forEach(([c, a, len]) => {
        for (const [zz, f] of [[20, 0.6], [14, 1]]) {
          const p0 = pj(bx + a, by + 0.5, zz), p1 = pj(bx + a + len * f, by + 0.5, zz);
          limb(p0[0], p0[1], p1[0], p1[1], 2, c);
        }
      });
    });
    // discussion table
    const tw = 150, th = 34, tx = x + (w - tw) / 2, ty = y + h - th - 14;
    addItem(L, tx, ty, tx + tw, ty + th, () => {
      box(tx, ty, tx + tw, ty + th, 0, 18, '#c9a074');
      flat(tx + 30, ty + 8, tx + 52, ty + 20, 18.3, '#f8fafc');
      box(tx + 96, ty + 13, tx + 104, ty + 21, 18, 24, '#ffffff', { noShadow: true });
    });
  } else if (z.key === 'eng') {
    // small server rack
    const rx = x + w - 72, ry = y + T_WALL + 4;
    addItem(L, rx, ry, rx + 56, ry + 16, () => {
      box(rx, ry, rx + 56, ry + 16, 0, 40, '#374151');
      for (let i = 0; i < 3; i++) {
        vface(ry + 16, rx + 4 + i * 17, rx + 18 + i * 17, 8, 34, '#4b5563');
        const c = pj(rx + 11 + i * 17, ry + 16, 21);
        circle(c[0], c[1], 2.2, i === 1 ? '#38bdf8' : '#4ade80');
      }
    });
  }
}

function addLounge(L) {
  const g = L.lounge, z = g.z, X = z.x, Y = z.y, w = z.w, t = g.table;
  // low things that characters sit on are drawn in the ground pass
  L.ground.push(() => {
    for (let i = 0; i < 3; i++) box(X + 47 + i * 50, Y + 52, X + 95 + i * 50, Y + 80, 0, SEAT, '#e08a78', { noShadow: true });
    g.seats.forEach((s) => box(s[0] - 9, s[1] - 9, s[0] + 9, s[1] + 9, 0, SEAT, '#6b7280', { noShadow: true }));
  });
  for (let i = 0; i < 3; i++) L.obstacles.push({ x0: X + 47 + i * 50, y0: Y + 52, x1: X + 95 + i * 50, y1: Y + 80 }); // sofa cushions
  g.seats.forEach((s) => L.obstacles.push({ x0: s[0] - 9, y0: s[1] - 9, x1: s[0] + 9, y1: s[1] + 9 }));
  addBoxItem(L, X + 46, Y + 40, X + 196, Y + 52, 0, 34, '#d9776a');
  addBoxItem(L, X + 38, Y + 40, X + 46, Y + 80, 0, 22, '#c26a5a');
  addBoxItem(L, X + 196, Y + 40, X + 204, Y + 80, 0, 22, '#c26a5a');
  // coffee counter, machine and cups
  const cx0 = g.counterX;
  addItem(L, cx0, Y + 34, cx0 + 110, Y + 70, () => {
    box(cx0, Y + 34, cx0 + 110, Y + 70, 0, 30, '#8b6b4f');
    box(cx0 + 10, Y + 36, cx0 + 40, Y + 58, 30, 52, '#374151', { noShadow: true });
    const c = pj(cx0 + 25, Y + 58, 44);
    circle(c[0], c[1], 2.6, '#f87171');
    box(cx0 + 62, Y + 52, cx0 + 70, Y + 60, 30, 35, '#ffffff', { noShadow: true });
    box(cx0 + 82, Y + 52, cx0 + 90, Y + 60, 30, 35, '#ffffff', { noShadow: true });
  });
  // meeting table
  addItem(L, t.x0, t.y0, t.x1, t.y1, () => {
    box(t.x0, t.y0, t.x1, t.y1, 0, 20, '#c9a074');
    flat(t.x0 + 12, t.y0 + 10, t.x0 + 40, t.y0 + 26, 20.3, 'rgba(255,255,255,0.35)');
    box(t.x1 - 36, t.y0 + 22, t.x1 - 28, t.y0 + 30, 20, 26, '#ffffff', { noShadow: true });
  });
  g.plants.forEach((p) => addPlant(L, p[0], p[1], 12));
}

function addDesk(L, p) {
  const k = p.k, id = p.id, ox = p.x, oy = p.y;
  const X = (d) => ox + (CX + d) * k, Y = (v) => oy + v * k; // d = offset from the desk centre
  const chairOf = () => { const a = agents.get(id); return a ? a.chair : 0; };
  L.obstacles.push({ x0: X(-18), y0: Y(62), x1: X(18), y1: Y(96), owner: id }); // the chair (the owner's own chair is free for the owner)
  L.ground.push(() => flat(X(-70), Y(20), X(70), Y(CH - 10), 0.3, 'rgba(255,255,255,0.28)'));
  L.ground.push(() => {
    const c = chairOf(), dx = 9 * k * c, dy = 16 * k * c;
    box(X(-18) + dx, Y(62) + dy, X(18) + dx, Y(96) + dy, 0, SEAT, '#6b7280', { noShadow: true });
  });
  // chair back (behind the seated character)
  addItem(L, X(-20), Y(56), X(20), Y(62), () => {
    const c = chairOf(), dx = 9 * k * c, dy = 16 * k * c;
    box(X(-20) + dx, Y(56) + dy, X(20) + dx, Y(62) + dy, 8, 36, '#4b5563', { noShadow: true });
  });
  // The owner's name: flat on the front panel (vertical plane, so the text stays upright) or, when that panel faces away, a pill
  // on screen. Dimmed when the owner is away from the desk.
  const nameplate = (onPanel) => {
    const a = agents.get(id), away = !!a && a.s > 0.5;
    const role = roleOf(id), text = plaqueText(id, role.label);
    let fs = 18;
    ctx.font = '800 ' + fs + 'px ' + FONT;
    let tw = ctx.measureText(text).width;
    if (tw > 124) { fs = Math.max(13, fs * 124 / tw); ctx.font = '800 ' + fs + 'px ' + FONT; tw = ctx.measureText(text).width; }
    const pw = Math.min(146, tw + 26), ph = 25;
    const o = onPanel ? pj(X(0) - pw * k / 2, Y(124) + 0.2, 29) : pj(X(0), Y(112), 0);
    ctx.save();
    if (onPanel) ctx.transform(P.c * P.K * k, P.s * P.K * P.tilt * k, 0, P.zk * k, o[0], o[1]);
    else { ctx.translate(o[0] - pw * k / 2, o[1] + 6 * k); ctx.scale(k, k); }
    ctx.globalAlpha = away ? 0.6 : 1;
    rr(0, 0, pw, ph, 6, '#ffffff');
    rr(0, 0, pw, ph, 6);
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#5b3b22'; ctx.stroke();
    rr(2, 2, 7, ph - 4, 3, away ? '#9ca3af' : role.color);
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + fs + 'px ' + FONT;
    ctx.fillText(text, 14, ph / 2 + 1);
    ctx.restore();
  };
  // desk: legs, full-width front panel carrying the name plaque, top, monitor (back faces the viewer), mug, papers
  addItem(L, X(-75), Y(100), X(75), Y(124), () => {
    const a = agents.get(id), away = !!a && a.s > 0.5;
    const st = (deskMap.get(id) || {}).status || 'idle';
    groundShadow(X(-75), Y(100), X(75), Y(124), 34);
    box(X(-75), Y(100), X(-68), Y(120), 0, 30, '#7d5232', { noShadow: true });
    box(X(68), Y(100), X(75), Y(120), 0, 30, '#7d5232', { noShadow: true });
    box(X(-75), Y(116), X(75), Y(124), 2, 30, '#8a5a38', { noShadow: true });
    box(X(-75), Y(100), X(75), Y(124), 30, 34, '#a8744a', { noShadow: true });
    flat(X(-18), Y(112), X(18), Y(120), 34.2, '#d1d5db');
    flat(X(30), Y(106), X(62), Y(118), 34.2, '#f8fafc');
    box(X(-62), Y(106), X(-54), Y(114), 34, 41, '#ffffff', { noShadow: true });
    box(X(-6), Y(106), X(6), Y(110), 34, 38, '#6b7280', { noShadow: true });
    box(X(-30), Y(106), X(30), Y(110), 38, 48, away ? '#374151' : '#9ca3af', { noShadow: true });
    if (!away) {
      const hp = { working: 0.6, waiting: 0.3, done: 1, idle: 0.1 }[st] ?? 0.1;
      vface(Y(110), X(-24), X(24), 41, 44.5, '#e5e7eb');
      vface(Y(110), X(-24), X(-24) + Math.max(4, 48 * hp) * k, 41, 44.5, STATUS_COLOR[st] || STATUS_COLOR.idle);
    }
    // At camera turn 0 the name plaque lies on the front panel of the desk (see nameplate).
    if (P.rot === 0) nameplate(true);
  });
  // At the other camera turns that panel faces away from the viewer (hidden or mirrored), so the name goes on a pill under the
  // desk instead, drawn after everything else so no desk covers it.
  if (P.rot !== 0) L.tags.push(() => nameplate(false));
}
