'use strict';
// The design tokens (public/tokens.css) and how the page uses them.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');
const tokensCss = read('tokens.css');

const tokens = new Map([...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

function luminance(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const color = (name) => {
  const v = tokens.get('--color-' + name);
  assert.match(v || '', /^#[0-9a-f]{6}$/i, name);
  return v;
};

describe('colour contrast of the token pairs', () => {
  // [foreground, background, minimum ratio, why]
  const text = [
    ['ink', 'paper', 4.5], ['muted', 'paper', 4.5], ['muted', 'stage', 4.5], ['ink', 'stage', 4.5],
    ['primary-fg', 'primary', 4.5],
    ['running-fg', 'running-bg', 4.5], ['queued-fg', 'queued-bg', 4.5], ['waiting-fg', 'waiting-bg', 4.5],
    ['done-fg', 'done-bg', 4.5], ['danger-fg', 'danger-bg', 4.5], ['danger-fg', 'paper', 4.5],
    ['waiting-solid-fg', 'waiting-solid', 4.5], ['paper', 'running-solid', 4.5], ['paper', 'done-solid', 4.5],
    ['disabled-fg', 'disabled-bg', 4.5], ['paper', 'danger-fg', 4.5],
  ];
  for (const [fg, bg, min] of text) {
    it(`text ${fg} on ${bg} is at least ${min}:1`, () => {
      const ratio = contrast(color(fg), color(bg));
      assert.ok(ratio >= min, `${fg}/${bg} = ${ratio.toFixed(2)}`);
    });
  }

  // WCAG 1.4.11: borders of controls and the focus ring need 3:1 against what they sit on.
  // Controls sit on white surfaces (top bar, side panel, cards). The focus ring has a white halo, so it is checked against white and the stage.
  const nonText = [['control-border', 'paper'], ['danger-border', 'paper'], ['focus', 'paper'], ['focus', 'stage']];
  for (const [fg, bg] of nonText) {
    it(`non-text ${fg} against ${bg} is at least 3:1`, () => {
      const ratio = contrast(color(fg), color(bg));
      assert.ok(ratio >= 3, `${fg}/${bg} = ${ratio.toFixed(2)}`);
    });
  }
});

describe('scale', () => {
  const px = (name) => parseInt(tokens.get(name), 10);

  it('spacing, control heights and radii are multiples of 4 (the 20px badge and 16px line are the listed exceptions)', () => {
    for (const [name, value] of tokens) {
      if (!/^--(space|ctl|radius)-/.test(name) || value === '999px') continue;
      assert.match(value, /^\d+px$/, name);
      assert.equal(parseInt(value, 10) % 4, 0, name);
    }
  });

  it('has the control sizes of the design: 24, 28, 32, 36 and the 44 touch size', () => {
    for (const size of [24, 28, 32, 36, 44]) assert.equal(px('--ctl-' + size), size);
  });

  it('has the type scale of the design', () => {
    assert.deepEqual([px('--fs-11'), px('--lh-14'), px('--fs-12'), px('--lh-16'), px('--fs-13'), px('--fs-18'), px('--lh-24')], [11, 14, 12, 16, 13, 18, 24]);
  });
});

describe('use of the tokens', () => {
  const files = ['components.css', 'app.css'];
  // --zone is set from the script (the colour of each legend chip)
  const declared = new Set([...tokens.keys(), '--zone']);
  for (const f of files) for (const m of read(f).matchAll(/(--[a-z0-9-]+)\s*:/g)) declared.add(m[1]);

  it('every var(--x) in the stylesheets is defined somewhere', () => {
    for (const f of files) for (const m of read(f).matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(declared.has(m[1]), `${f}: ${m[1]}`);
  });

  it('touch screens get the 44px controls whatever the width', () => {
    const css = read('components.css');
    assert.match(css, /@media \(pointer: coarse\), \(any-pointer: coarse\)/);
    assert.match(css, /--btn-h: var\(--ctl-44\)/);
  });

  it('the focus ring is one rule with the contrast-checked colour', () => {
    assert.match(read('components.css'), /:focus-visible\s*\{[^}]*var\(--color-focus\)/);
  });
});

describe('page structure', () => {
  const html = read('index.html');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const jsFiles = fs.readdirSync(path.join(PUBLIC, 'js')).filter((f) => f.endsWith('.js'));

  it('every id the scripts look up with getElementById exists in the page', () => {
    for (const f of jsFiles) {
      for (const m of fs.readFileSync(path.join(PUBLIC, 'js', f), 'utf8').matchAll(/getElementById\('([^']+)'\)/g)) assert.ok(ids.has(m[1]), `${f}: #${m[1]}`);
    }
  });

  it('keeps the ids the end-to-end tests and the host rely on', () => {
    for (const id of ['conn', 'notice', 'btn-restart', 'btn-stop', 'office', 'log', 'agent-list', 'announce']) assert.ok(ids.has(id), id);
  });

  it('the side panel is a proper tab set: each tab controls an existing panel', () => {
    for (const m of html.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
    assert.equal([...html.matchAll(/role="tab"\s/g)].length, 2);
    assert.equal([...html.matchAll(/role="tabpanel"/g)].length, 2);
  });
});
