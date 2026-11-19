'use strict';
// The navigation grid and A* (public/js/nav.js), run in a vm without a browser.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({ Math, Float32Array, Int32Array, Uint8Array, Infinity });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'nav.js'), 'utf8'), ctx, { filename: 'nav.js' });
const run = (code) => vm.runInContext(code, ctx);

const wallWithDoor = (doorY0, doorY1) => [{ x0: 100, y0: 0, x1: 108, y1: doorY0 }, { x0: 100, y0: doorY1, x1: 108, y1: 300 }];
const grid = (obstacles, w = 300, h = 300) => { ctx.__obs = obstacles; return run(`buildNavGrid({ w: ${w}, h: ${h} }, __obs)`); };
const pathFor = (g, a, b) => { ctx.__g = g; return run(`navFindPath(__g, ${a[0]}, ${a[1]}, ${b[0]}, ${b[1]})`); };

// walk the path every unit and check each sample stands on a free cell
function pathIsFree(g, p) {
  ctx.__g = g;
  for (let i = 1; i < p.pts.length; i++) {
    const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0;
      if (!run(`navFree(__g, ${ax + (bx - ax) * t}, ${ay + (by - ay) * t})`)) return false;
    }
  }
  return true;
}

describe('navigation grid', () => {
  it('blocks the cells around an obstacle by the walker radius and leaves the rest free', () => {
    const g = grid([{ x0: 100, y0: 100, x1: 140, y1: 140 }]);
    ctx.__g = g;
    assert.equal(run('navFree(__g, 120, 120)'), false);
    assert.equal(run('navFree(__g, 96, 120)'), false, 'within the radius of the obstacle');
    assert.equal(run('navFree(__g, 80, 120)'), true);
    assert.equal(run('navFree(__g, 200, 200)'), true);
  });

  it('treats anything outside the floor as blocked', () => {
    const g = grid([]);
    ctx.__g = g;
    for (const [x, y] of [[-1, 10], [10, -1], [300, 10], [10, 300], [1000, 1000]]) assert.equal(run(`navFree(__g, ${x}, ${y})`), false, `${x},${y}`);
    assert.equal(run('navFree(__g, 150, 150)'), true);
  });

  it('a nearest free point is found next to a blocked one', () => {
    const g = grid([{ x0: 100, y0: 100, x1: 140, y1: 140 }]);
    ctx.__g = g;
    const p = run('navNearestFree(__g, 120, 120, 10)');
    assert.ok(p, 'found');
    assert.equal(run(`navFree(__g, ${p[0]}, ${p[1]})`), true);
    assert.equal(run('navNearestFree(__g, 120, 120, 1)'), null, 'nothing free within one cell of the middle of a big obstacle');
  });
});

describe('navigation paths', () => {
  it('is a straight line when nothing is in the way', () => {
    const g = grid([]);
    const p = pathFor(g, [20, 20], [250, 200]);
    assert.equal(p.pts.length, 2);
    near(p.length, Math.hypot(230, 180), 1e-6);
  });

  it('goes through the door in a wall and never touches the wall', () => {
    const g = grid(wallWithDoor(130, 170));
    const p = pathFor(g, [40, 40], [250, 40]);
    assert.ok(p, 'a path exists');
    assert.ok(pathIsFree(g, p), 'every step is on free ground');
    const crossing = p.pts.find((q, i) => i && (p.pts[i - 1][0] < 104) !== (q[0] < 104));
    assert.ok(crossing, 'it crosses the wall line');
    const ys = []; for (let i = 1; i < p.pts.length; i++) { const [a, b] = [p.pts[i - 1], p.pts[i]]; if ((a[0] < 104) !== (b[0] < 104)) ys.push(a[1] + (b[1] - a[1]) * ((104 - a[0]) / (b[0] - a[0]))); }
    assert.ok(ys.every((y) => y > 130 && y < 170), 'it crosses inside the door gap: ' + ys.join(','));
  });

  it('a door gap of 30 units is passable, a gap of 8 is not (the walker has a radius)', () => {
    assert.ok(pathFor(grid(wallWithDoor(135, 165)), [40, 150], [250, 150]));
    assert.equal(pathFor(grid(wallWithDoor(146, 154)), [40, 150], [250, 150]), null);
  });

  it('there is no path into a sealed room or onto an obstacle', () => {
    const room = [{ x0: 100, y0: 100, x1: 110, y1: 200 }, { x0: 190, y0: 100, x1: 200, y1: 200 }, { x0: 100, y0: 100, x1: 200, y1: 110 }, { x0: 100, y0: 190, x1: 200, y1: 200 }];
    const g = grid(room);
    assert.equal(pathFor(g, [20, 20], [150, 150]), null, 'sealed');
    assert.equal(pathFor(g, [20, 20], [105, 150]), null, 'onto the wall');
  });

  it('a start inside a blocked cell can still leave it', () => {
    const g = grid([{ x0: 100, y0: 100, x1: 140, y1: 140 }]);
    const p = pathFor(g, [98, 120], [250, 250]);
    assert.ok(p && p.pts.length >= 2);
  });

  it('does not cut the corner of an obstacle on a diagonal', () => {
    const g = grid([{ x0: 100, y0: 0, x1: 108, y1: 140 }, { x0: 100, y0: 160, x1: 108, y1: 300 }]);
    const p = pathFor(g, [60, 100], [160, 200]);
    assert.ok(p && pathIsFree(g, p));
  });

  it('keeps every path a little longer than the straight line but not wildly so', () => {
    const g = grid(wallWithDoor(130, 170));
    const p = pathFor(g, [40, 40], [250, 250]);
    const straight = Math.hypot(210, 210);
    assert.ok(p.length >= straight && p.length < straight * 1.6, `${p.length} vs ${straight}`);
  });

  it('finds a path across a floor the size of the office in a few milliseconds', () => {
    const obstacles = [];
    for (let i = 0; i < 200; i++) obstacles.push({ x0: (i * 37) % 1600, y0: (i * 53) % 640, x1: ((i * 37) % 1600) + 24, y1: ((i * 53) % 640) + 20 });
    const g = grid(obstacles, 1700, 700);
    const t0 = process.hrtime.bigint();
    pathFor(g, [8, 8], [1690, 690]);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 150, `took ${ms.toFixed(1)} ms`);
  });
});

function near(a, b, eps) {
  assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
}
