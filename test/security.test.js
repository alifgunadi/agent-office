'use strict';
// Security headers, the page CSP, the static files of the page and the font route.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pageCsp } = require('../lib/security');
const { startServer } = require('./helpers');

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);

describe('pageCsp', () => {
  it('allows only the page origin: no inline code, no hashes, no unsafe keywords', () => {
    const csp = pageCsp();
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /style-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /unsafe-|sha256-|nonce-|https?:|\*/);
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /connect-src 'self'/);
  });
});

describe('public/index.html', () => {
  it('has no inline script, inline style, style attribute or event handler (the CSP would block them)', () => {
    for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      assert.match(m[0], /\ssrc="/, 'script without src');
      assert.equal(m[1].trim(), '', 'inline script body');
    }
    assert.doesNotMatch(html, /<style\b/i);
    assert.doesNotMatch(html, /\sstyle\s*=/i);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  });

  it('loads nothing from other origins', () => {
    for (const file of [path.join(PUBLIC, 'index.html'), path.join(PUBLIC, 'app.css'), ...fs.readdirSync(path.join(PUBLIC, 'js')).map((f) => path.join(PUBLIC, 'js', f))]) {
      const text = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /https?:\/\/(?!www\.w3\.org)/, path.basename(file));
    }
  });

  it('references its stylesheet and every script, and each file exists', () => {
    assert.ok(assets.includes('/app.css'));
    assert.ok(assets.filter((a) => a.startsWith('/js/')).length >= 10);
    for (const a of assets) assert.ok(fs.existsSync(path.join(PUBLIC, a.slice(1))), a);
  });

  it('loads every script in public/js exactly once', () => {
    const onDisk = fs.readdirSync(path.join(PUBLIC, 'js')).map((f) => '/js/' + f).sort();
    assert.deepEqual([...assets.filter((a) => a.startsWith('/js/'))].sort(), onDisk);
  });
});

describe('served responses', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await srv.stop(); });

  it('sets the fixed headers on every route, errors included', async () => {
    for (const [method, url] of [['GET', '/'], ['GET', '/state'], ['GET', '/health'], ['GET', '/nope'], ['POST', '/event'], ['GET', '/app.css']]) {
      const res = await srv.request(method, url);
      assert.equal(res.headers['x-content-type-options'], 'nosniff', url);
      assert.equal(res.headers['referrer-policy'], 'no-referrer', url);
      assert.equal(res.headers['x-frame-options'], 'DENY', url);
      assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/, url);
    }
  });

  it('serves the page with the page CSP', async () => {
    const res = await srv.request('GET', '/');
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-security-policy'], pageCsp());
    assert.match(res.headers['content-type'], /text\/html/);
  });

  it('serves the stylesheet and every script of the page with the right type', async () => {
    for (const a of assets) {
      const res = await srv.request('GET', a);
      assert.equal(res.status, 200, a);
      assert.match(res.headers['content-type'], a.endsWith('.css') ? /^text\/css/ : /^text\/javascript/, a);
      assert.equal(res.text, fs.readFileSync(path.join(PUBLIC, a.slice(1)), 'utf8'), a);
    }
  });

  it('serves nothing else from the public folder or beyond it', async () => {
    for (const url of ['/index.html', '/js/', '/js/nope.js', '/js/../server.js', '/js/%2e%2e/server.js', '/../server.js', '/app.css?x=1', '/js/roles.js/x', '/package.json', '/lib/office.js', '/JS/core.js']) {
      assert.equal((await srv.request('GET', url)).status, 404, url);
    }
  });

  it('refuses static files to a foreign Host like every other route', async () => {
    assert.equal((await srv.request('GET', '/js/core.js', { headers: { Host: 'evil.example' } })).status, 403);
    assert.equal((await srv.request('GET', '/', { headers: { Host: 'evil.example' } })).status, 403);
  });

  it('serves the two bundled fonts with long cache and nothing else from /fonts', async () => {
    for (const name of ['nunito-latin.woff2', 'nunito-latin-ext.woff2']) {
      const res = await srv.request('GET', '/fonts/' + name);
      assert.equal(res.status, 200, name);
      assert.equal(res.headers['content-type'], 'font/woff2');
      assert.match(res.headers['cache-control'], /immutable/);
    }
    for (const url of ['/fonts/OFL.txt', '/fonts/../server.js', '/fonts/%2e%2e/server.js', '/fonts/']) {
      assert.equal((await srv.request('GET', url)).status, 404, url);
    }
  });

  it('refuses the font route to a foreign Host like every other route', async () => {
    const res = await srv.request('GET', '/fonts/nunito-latin.woff2', { headers: { Host: 'evil.example' } });
    assert.equal(res.status, 403);
  });
});
