'use strict';
// The page chrome around the canvas: layout mode, top bar, legend, tabs, AlifGunadi card, touch sizes.

const assert = require('node:assert/strict');

const val = (page, expr) => page.evaluate(expr);

module.exports = [
  {
    name: 'wide isometric floorplan at 1440px, like the design; stacked rooms below the threshold',
    async run(page) {
      assert.equal(await val(page, 'layout.cols'), 0, 'cols at 1440');
      const w = await val(page, 'Math.round(availW)');
      assert.ok(w > 1000 && w < 1100, 'stage width ' + w);
      await page.viewport(1280, 800);
      assert.equal(await val(page, 'layout.cols'), 0, 'cols at 1280');
      await page.viewport(1100, 800);
      assert.equal(await val(page, 'layout.cols'), 0, 'cols at 1100: the side panel is below the stage, so the stage is wide');
      await page.viewport(800, 700);
      assert.equal(await val(page, 'layout.cols'), 3, 'cols at 800');
      await page.viewport(600, 700);
      assert.equal(await val(page, 'layout.cols'), 2, 'cols at 600');
    },
  },
  {
    name: 'top bar: title, live pill, Restart and Stop use the 32px control size',
    async run(page) {
      const r = JSON.parse(await val(page, `JSON.stringify({
        title: document.querySelector('.topbar h1').textContent, conn: document.getElementById('conn').textContent,
        restart: document.getElementById('btn-restart').getBoundingClientRect().height,
        stop: document.getElementById('btn-stop').getBoundingClientRect().height,
        stopBorder: getComputedStyle(document.getElementById('btn-stop')).borderTopColor })`));
      assert.equal(r.title, "ALIF'S OFFICE");
      assert.equal(r.conn, 'live');
      assert.equal(r.restart, 32);
      assert.equal(r.stop, 32);
      assert.equal(r.stopBorder, 'rgb(229, 72, 77)');
    },
  },
  {
    name: 'zone legend has the five zones and lets pointer events through to the canvas',
    async run(page) {
      const labels = JSON.parse(await val(page, `JSON.stringify([...document.querySelectorAll('#legend li')].map(li => li.textContent))`));
      assert.deepEqual(labels, ['AlifGunadi Office', 'Product', 'Engineering', 'QA', 'Lounge & Pantry']);
      const hit = await val(page, `(() => { const r = document.querySelector('#legend li').getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el.closest('#legend') === null; })()`);
      assert.equal(hit, true, 'legend must not capture the pointer');
    },
  },
  {
    name: 'tabs: Activity is selected first; arrows, Home and End move the selection with a roving tabindex',
    async run(page) {
      const state = () => val(page, `JSON.stringify({ sel: ['tab-tasks', 'tab-activity'].map(i => document.getElementById(i).getAttribute('aria-selected')), idx: ['tab-tasks', 'tab-activity'].map(i => document.getElementById(i).tabIndex), tasksHidden: document.getElementById('panel-tasks').hidden, actHidden: document.getElementById('panel-activity').hidden, focus: document.activeElement.id })`).then(JSON.parse);
      let s = await state();
      assert.deepEqual([s.sel, s.idx, s.tasksHidden, s.actHidden], [['false', 'true'], [-1, 0], true, false]);
      await val(page, `document.getElementById('tab-activity').focus()`);
      await page.key('ArrowLeft');
      s = await state();
      assert.deepEqual([s.sel, s.idx, s.tasksHidden, s.actHidden, s.focus], [['true', 'false'], [0, -1], false, true, 'tab-tasks']);
      await page.key('ArrowRight');
      s = await state();
      assert.deepEqual([s.sel, s.focus], [['false', 'true'], 'tab-activity']);
      await page.key('Home');
      assert.equal((await state()).focus, 'tab-tasks');
      await page.key('End');
      assert.equal((await state()).focus, 'tab-activity');
    },
  },
  {
    name: 'a hidden Activity panel keeps filling, and the Tasks count badge is hidden at zero',
    async run(page) {
      await val(page, `document.getElementById('tab-tasks').click()`);
      assert.equal(await val(page, `document.getElementById('panel-activity').hidden`), true);
      assert.equal(await val(page, `getComputedStyle(document.getElementById('tasks-count')).display`), 'none');
      const before = await val(page, `document.querySelectorAll('#log li').length`);
      await page.post({ hook_event_name: 'PreToolUse', session_id: 'b-log', tool_name: 'Read', tool_input: { file_path: 'chrome-test.js' } });
      await page.waitFor(`document.querySelectorAll('#log li').length > ${before} || (document.querySelector('#log li') || { textContent: '' }).textContent.includes('chrome-test.js')`);
      await val(page, `document.getElementById('tab-activity').click()`);
    },
  },
  {
    name: 'the AlifGunadi card follows the main desk',
    async run(page) {
      await page.post({ hook_event_name: 'UserPromptSubmit', session_id: 'b-card' });
      await page.waitFor(`document.getElementById('me-state').textContent.startsWith('Berjalan')`);
      assert.equal(await val(page, `document.getElementById('me-load').textContent`), 'Tugas aktif 0 / 0');
      await page.post({ hook_event_name: 'Stop', session_id: 'b-card' });
    },
  },
  {
    name: 'keyboard focus shows the 2px ring in the focus colour',
    async run(page) {
      const r = JSON.parse(await val(page, `(() => { const b = document.getElementById('btn-restart'); b.focus(); const c = getComputedStyle(b); return JSON.stringify({ w: c.outlineWidth, s: c.outlineStyle, c: c.outlineColor, f: document.activeElement === b, vis: b.matches(':focus-visible') }); })()`));
      assert.deepEqual([r.f, r.vis, r.s, r.c], [true, true, 'solid', 'rgb(37, 99, 235)']);
      // the browser rounds outline widths down to whole device pixels (2 CSS px is 1.6 at 125% scaling)
      assert.ok(parseFloat(r.w) >= 1.5, 'ring width ' + r.w);
    },
  },
  {
    name: 'touch screens get 44px controls whatever the width',
    async run(page) {
      await page.viewport(1440, 900, { touch: true });
      const coarse = await val(page, `matchMedia('(any-pointer: coarse)').matches`);
      assert.equal(coarse, true, 'touch emulation should make any-pointer coarse');
      const r = JSON.parse(await val(page, `JSON.stringify({ restart: document.getElementById('btn-restart').getBoundingClientRect().height, tab: document.getElementById('tab-activity').getBoundingClientRect().height })`));
      assert.deepEqual([r.restart, r.tab], [44, 44]);
      await page.viewport(1440, 900, { touch: false });
    },
  },
  {
    name: 'the content security policy blocks an injected inline script and the page has no external requests',
    async run(page) {
      assert.equal(await val(page, `(() => { window.__x = 0; const s = document.createElement('script'); s.textContent = 'window.__x = 1'; document.head.appendChild(s); return window.__x; })()`), 0);
      await page.sleep(400);
      page.expectProblems(/Content Security Policy/i);
      const external = await val(page, `performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith(location.origin))`);
      assert.deepEqual(external, []);
    },
  },
];
