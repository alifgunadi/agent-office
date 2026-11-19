'use strict';
// Response hardening for the local server: fixed security headers, and a Content-Security-Policy for the
// office page that allows only its own inline script and style (by hash), its own fonts and its own origin.

const crypto = require('node:crypto');

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Every response, including errors and the SSE stream: nothing may be loaded or framed.
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

const hash = (text) => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;

function inlineBlocks(html, tag) {
  const out = [];
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'gi');
  for (const m of html.matchAll(re)) {
    // a script with src has no inline code to allow
    if (tag === 'script' && /^<script[^>]*\ssrc=/i.test(m[0])) continue;
    out.push(m[1]);
  }
  return out;
}

// CSP for index.html. The hashes are computed from the page itself, so editing the page needs no second edit here.
function pageCsp(html) {
  const text = String(html);
  const scripts = inlineBlocks(text, 'script').map(hash);
  const styles = inlineBlocks(text, 'style').map(hash);
  return [
    "default-src 'none'",
    `script-src ${scripts.join(' ') || "'none'"}`,
    `style-src ${styles.join(' ') || "'none'"}`,
    "font-src 'self'",
    'img-src data:',
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function applyBaseHeaders(res) {
  for (const [name, value] of Object.entries(BASE_HEADERS)) res.setHeader(name, value);
}

module.exports = { BASE_HEADERS, pageCsp, applyBaseHeaders };
