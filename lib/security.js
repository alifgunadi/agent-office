'use strict';
// Response hardening for the local server: fixed security headers, and the Content-Security-Policy of the
// office page. The page keeps all of its script and style in files served from its own origin (public/),
// so the policy allows 'self' only: no inline code, no hashes, nothing from other sites.

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Every response, including errors and the SSE stream: nothing may be loaded or framed.
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  'img-src data:',
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function pageCsp() {
  return PAGE_CSP;
}

function applyBaseHeaders(res) {
  for (const [name, value] of Object.entries(BASE_HEADERS)) res.setHeader(name, value);
}

module.exports = { BASE_HEADERS, pageCsp, applyBaseHeaders };
