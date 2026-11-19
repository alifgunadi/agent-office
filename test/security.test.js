'use strict';
// Security headers, the page CSP and the font route.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pageCsp } = require('../lib/security');
const { startServer } = require('./helpers');

describe('pageCsp', () => {
  it('allows inline script and style only by hash', () => {
    const csp = pageCsp('<style>a{}</style><script>var x=1</script><script src="/x.js"></script>');
    assert.match(csp, /script-src 'sha256-[A-Za-z0-9+/=]+'(;|$)/);
    assert.match(csp, /style-src 'sha256-[A-Za-z0-9+/=]+'(;|$)/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /connect-src 'self'/);
  });

  it('changes when the inline script changes', () => {
    assert.notEqual(pageCsp('<script>a</script>'), pageCsp('<script>b</script>'));
  });

  it('allows no script at all when the page has none', () => {
    assert.match(pageCsp('<p>x</p>'), /script-src 'none'/);
  });
});

describe('served responses', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await srv.stop(); });

  it('sets the fixed headers on every route, errors included', async () => {
    for (const [method, url] of [['GET', '/'], ['GET', '/state'], ['GET', '/health'], ['GET', '/nope'], ['POST', '/event']]) {
      const res = await srv.request(method, url);
      assert.equal(res.headers['x-content-type-options'], 'nosniff', url);
      assert.equal(res.headers['referrer-policy'], 'no-referrer', url);
      assert.equal(res.headers['x-frame-options'], 'DENY', url);
      assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/, url);
    }
  });

  it('the page CSP hashes match the page the server sends', async () => {
    const res = await srv.request('GET', '/');
    const crypto = require('node:crypto');
    const m = res.text.match(/<script>([\s\S]*?)<\/script>/);
    const h = crypto.createHash('sha256').update(m[1], 'utf8').digest('base64');
    assert.ok(res.headers['content-security-policy'].includes(`'sha256-${h}'`));
  });

  it('the page loads nothing from other origins', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/);
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
