'use strict';
// The camera maths of the page (public/js/projection.js and the wall roles in layout.js), run in a vm without a browser.
// P and camera are taken from core.js so the test uses the real starting values.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const core = read('core.js');
const declaration = (name) => {
  const m = core.match(new RegExp('const ' + name + ' = \\{[^}]*\\};'));
  assert.ok(m, name + ' declaration found in core.js');
  return m[0];
};

function pageContext() {
  const ctx = vm.createContext({ Math });
  vm.runInContext(declaration('P') + '\n' + declaration('camera'), ctx);
  vm.runInContext(read('projection.js'), ctx, { filename: 'projection.js' });
  vm.runInContext(read('layout.js'), ctx, { filename: 'layout.js' });
  return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// a small deterministic generator so the cases are repeatable
function points(n) {
  let s = 12345;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return Array.from({ length: n }, () => [rnd() * 1800 - 100, rnd() * 900 - 100]);
}

describe('camera: turning the world', () => {
  it('turn 0 is exactly the original projection', () => {
    const ctx = pageContext();
    run(ctx, 'setProj(0); P.ox = 12; P.oy = 34; setView(0, 900, 450)');
    for (const [x, y] of points(50)) {
      const got = run(ctx, `pj(${x}, ${y}, 7)`);
      const wantX = (x * 0.883 - y * 0.469) * 1 + 12;
      const wantY = (x * 0.469 + y * 0.883) * 1 * 0.52 - 7 * 0.95 + 34;
      assert.equal(got[0], wantX);
      assert.equal(got[1], wantY);
    }
  });

  it('unproject undoes pj for every turn, in both layouts, with scene offsets', () => {
    const ctx = pageContext();
    for (const cols of [0, 3]) {
      for (let rot = 0; rot < 4; rot++) {
        run(ctx, `camera.rot = ${rot}; setProj(${cols}); setView(P.rot, 700, 320); P.ox = 55; P.oy = 21`);
        for (const [x, y] of points(40)) {
          const back = run(ctx, `unproject(...pj(${x}, ${y}, 0))`);
          near(back[0], x, 1e-6);
          near(back[1], y, 1e-6);
        }
      }
    }
  });

  it('a turn keeps the middle of the floor where it is and keeps distances', () => {
    const ctx = pageContext();
    for (let rot = 0; rot < 4; rot++) {
      run(ctx, `camera.rot = ${rot}; setProj(0); setView(${rot}, 640, 360)`);
      const c = run(ctx, 'viewXY(640, 360)');
      near(c[0], 640); near(c[1], 360);
      for (const [x, y] of points(20)) {
        const v = run(ctx, `viewXY(${x}, ${y})`);
        near(Math.hypot(v[0] - 640, v[1] - 360), Math.hypot(x - 640, y - 360), 1e-9);
      }
    }
  });

  it('four quarter turns are the identity and turn k is turn 1 applied k times', () => {
    const ctx = pageContext();
    const m = JSON.parse(JSON.stringify(run(ctx, 'TURNS')));
    const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];
    let acc = [1, 0, 0, 1];
    for (let k = 0; k < 4; k++) {
      assert.deepEqual(acc.map((v) => v + 0), m[k].map((v) => v + 0), 'turn ' + k);
      acc = mul(acc, m[1]);
    }
    assert.deepEqual(acc.map((v) => v + 0), [1, 0, 0, 1]); // + 0 turns -0 into 0
  });

  it('turning is only applied in the wide layout', () => {
    const ctx = pageContext();
    run(ctx, 'camera.rot = 2; setProj(3)');
    assert.equal(run(ctx, 'P.rot'), 0);
    run(ctx, 'setProj(0)');
    assert.equal(run(ctx, 'P.rot'), 2);
  });
});

describe('camera: faces, walls, shadows, depth', () => {
  it('the front face of a box faces the viewer and the flank face shows its right side, at every turn', () => {
    const ctx = pageContext();
    const normal = { '+y': [0, 1], '-y': [0, -1], '+x': [1, 0], '-x': [-1, 0] };
    for (let rot = 0; rot < 4; rot++) {
      run(ctx, `camera.rot = ${rot}; setProj(0); setView(${rot}, 100, 100)`);
      const front = normal[run(ctx, `FRONT_SIDE[${rot}]`)], flank = normal[run(ctx, `FLANK_SIDE[${rot}]`)];
      const f = run(ctx, `viewDir(${front[0]}, ${front[1]})`), k = run(ctx, `viewDir(${flank[0]}, ${flank[1]})`);
      assert.deepEqual([f[0] + 0, f[1] + 0], [0, 1], 'front at turn ' + rot);
      assert.deepEqual([k[0] + 0, k[1] + 0], [1, 0], 'flank at turn ' + rot);
    }
  });

  it('each room has one wall in each role (N and W tall, S and E low) at every turn, and turn 0 matches the original', () => {
    const ctx = pageContext();
    for (let rot = 0; rot < 4; rot++) {
      run(ctx, `camera.rot = ${rot}; setProj(0); setView(${rot}, 100, 100)`);
      const roles = ['top', 'left', 'bottom', 'right'].map((s) => run(ctx, `wallRole('${s}')`));
      assert.deepEqual([...roles].sort(), ['E', 'N', 'S', 'W']);
      if (rot === 0) assert.deepEqual(roles, ['N', 'W', 'S', 'E']);
    }
  });

  it('wall heights follow the mode: up = all tall, down = all low, cut = back walls tall', () => {
    const ctx = pageContext();
    run(ctx, 'const WH = 22, WL = 8, WF = 6, WG = 24; camera.rot = 0; setProj(0); setView(0, 100, 100)');
    const zone = { glass: false, hN: 22 };
    const heights = (mode) => ['top', 'left', 'bottom', 'right'].map((s) => run(ctx, `camera.walls = '${mode}'; wallHeight(${JSON.stringify(zone)}, '${s}')`));
    assert.deepEqual(heights('up'), [22, 22, 22, 22]);
    assert.deepEqual(heights('down'), [6, 6, 6, 6]);
    assert.deepEqual(heights('cut'), [22, 22, 6, 6]);
    run(ctx, 'camera.rot = 2; setProj(0); setView(2, 100, 100)');
    assert.deepEqual(heights('cut'), [6, 6, 22, 22], 'after a half turn the old front walls are the back walls');
  });

  it('a shadow always falls the same way on screen: the view (+d, +d) maps back to the world offset', () => {
    const ctx = pageContext();
    for (let rot = 0; rot < 4; rot++) {
      run(ctx, `camera.rot = ${rot}; setProj(0); setView(${rot}, 100, 100)`);
      const off = run(ctx, 'shadowOffset(10)');
      const v = run(ctx, `viewDir(${off[0]}, ${off[1]})`);
      assert.deepEqual([v[0] + 0, v[1] + 0], [10, 10], 'turn ' + rot);
    }
  });

  it('depth rectangles stay well ordered (x0 <= x1, y0 <= y1) at every turn', () => {
    const ctx = pageContext();
    for (let rot = 0; rot < 4; rot++) {
      run(ctx, `camera.rot = ${rot}; setProj(0); setView(${rot}, 400, 250)`);
      for (const [x, y] of points(20)) {
        const r = run(ctx, `viewRect(${x}, ${y}, ${x + 30}, ${y + 12})`);
        assert.ok(r[0] <= r[2] && r[1] <= r[3]);
        near(r[2] - r[0], rot % 2 ? 12 : 30); near(r[3] - r[1], rot % 2 ? 30 : 12);
      }
    }
  });

  it('screen direction of a world direction turns with the camera', () => {
    const ctx = pageContext();
    run(ctx, 'camera.rot = 0; setProj(0); setView(0, 0, 0)');
    const du0 = run(ctx, 'screenDu(1, 0)'); // east in the world: to the right on screen
    assert.ok(du0 > 0);
    run(ctx, 'camera.rot = 2; setProj(0); setView(2, 0, 0)');
    assert.ok(run(ctx, 'screenDu(1, 0)') < 0, 'after a half turn it points left');
    near(run(ctx, 'screenDu(1, 0)'), -du0);
  });
});
