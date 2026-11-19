'use strict';
// Agent Office: local server that turns Claude Code hook events into a live pixel office.
// Run: node server.js   (or: bun server.js)   then open http://127.0.0.1:4317
// The office model lives in lib/office.js; this file is the HTTP and process-lifecycle layer.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createOffice } = require('./lib/office');
const { sanitizeEvent } = require('./lib/sanitize');
const { STOPPED_MARKER, LOG_PATH } = require('./lib/paths');
const { rotateIfLarge } = require('./lib/logfile');
const { pageCsp, applyBaseHeaders } = require('./lib/security');

const LISTEN_RETRIES = 10;
const LISTEN_RETRY_MS = 200;

const HOST = '127.0.0.1';
const PORT = Number(process.env.AGENT_OFFICE_PORT) || 4317;
const MAX_BODY_BYTES = 64 * 1024;
const KEEPALIVE_MS = 15000;
const MAX_SSE_CLIENTS = 16;
// Auto stop: shut down after the last Claude Code session ends. Set AGENT_OFFICE_AUTO_STOP=0 to disable.
const AUTO_STOP = process.env.AGENT_OFFICE_AUTO_STOP !== '0';
// AGENT_OFFICE_DEBUG=1 logs one line per event (names and ids only, never tool input).
const DEBUG = process.env.AGENT_OFFICE_DEBUG === '1';
const SHUTDOWN_GRACE_MS = 30 * 1000;
const STALE_CHECK_MS = 5 * 60 * 1000;
const STALE_DESK_CHECK_MS = 60 * 1000;
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

const clients = new Set();
let shutdownTimer = null;

function cancelShutdown() {
  clearTimeout(shutdownTimer);
  shutdownTimer = null;
}

function scheduleShutdown(reason) {
  if (!AUTO_STOP || shutdownTimer) return;
  console.log(`[${new Date().toISOString()}] No active sessions (${reason}). Stopping in ${SHUTDOWN_GRACE_MS / 1000}s.`);
  shutdownTimer = setTimeout(() => shutdown('auto stop'), SHUTDOWN_GRACE_MS);
}

function broadcast() {
  const data = `data: ${JSON.stringify(office.snapshot())}\n\n`;
  for (const res of clients) res.write(data);
}

const office = createOffice({
  onChange: broadcast,
  onSessionActivity: cancelShutdown,
  onSessionsEmpty: scheduleShutdown,
});

setInterval(() => office.sweepSessions(), STALE_CHECK_MS).unref();
setInterval(() => office.sweepDesks(), STALE_DESK_CHECK_MS).unref();

function shutdown(reason) {
  console.log(`[${new Date().toISOString()}] Agent Office stopped (${reason}).`);
  server.close();
  for (const res of clients) res.end();
  setTimeout(() => process.exit(0), 100);
}

function manualStop() {
  try {
    fs.writeFileSync(STOPPED_MARKER, new Date().toISOString());
  } catch (err) {
    console.error('Could not write stop marker:', err.message);
  }
  shutdown('stopped from UI');
}

function restart() {
  console.log(`[${new Date().toISOString()}] Restart requested.`);
  // Release the port first; the new process retries listen until it is free.
  server.close();
  let out = 'ignore';
  rotateIfLarge(LOG_PATH);
  try {
    out = fs.openSync(LOG_PATH, 'a');
  } catch {
    // Logging is optional.
  }
  try {
    spawn(process.execPath, [__filename], {
      cwd: __dirname,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', out, out],
    }).unref();
  } catch (err) {
    console.error('Restart failed:', err.message);
  }
  for (const res of clients) res.end();
  setTimeout(() => process.exit(0), 100);
}

function readBody(req, res, onBody) {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      res.writeHead(413).end();
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    onBody(Buffer.concat(chunks).toString('utf8'));
  });
}

// Blocks DNS rebinding (foreign Host) and cross-origin browser requests. The custom header alone
// does not help once a rebound page is same-origin with this server.
function isTrustedRequest(req) {
  if (!ALLOWED_HOSTS.has(req.headers.host)) return false;
  const origin = req.headers.origin;
  if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  return true;
}

// The page lives in public/: index.html, app.css and classic scripts in public/js. Only file names that match
// STATIC_PATH are ever read (no path from the request is joined to the disk path beyond that pattern).
const publicDir = path.join(__dirname, 'public');
const STATIC_PATH = /^\/(?:[a-z0-9-]+\.(?:css|js)|js\/[a-z0-9-]+\.js)$/;
const STATIC_TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const indexPath = path.join(publicDir, 'index.html');
// Only these files are ever served from fonts/ (no path from the request is used).
const FONTS = { '/fonts/nunito-latin.woff2': 'nunito-latin.woff2', '/fonts/nunito-latin-ext.woff2': 'nunito-latin-ext.woff2' };
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function route(req, res) {
  if (!isTrustedRequest(req)) return res.writeHead(403).end();

  if (req.method === 'GET' && req.url === '/') {
    fs.readFile(indexPath, (err, html) => {
      if (err) return res.writeHead(500).end('public/index.html not found');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': pageCsp(),
      }).end(html);
    });
    return;
  }

  if (req.method === 'GET' && STATIC_PATH.test(req.url)) {
    fs.readFile(path.join(publicDir, req.url.slice(1)), (err, data) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': STATIC_TYPES[path.extname(req.url)], 'Cache-Control': 'no-store' }).end(data);
    });
    return;
  }

  if (req.method === 'GET' && hasOwn(FONTS, req.url)) {
    fs.readFile(path.join(__dirname, 'fonts', FONTS[req.url]), (err, data) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable' }).end(data);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/events') {
    if (clients.size >= MAX_SSE_CLIENTS) return res.writeHead(429).end();
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(office.snapshot())}\n\n`);
    clients.add(res);
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);
    req.on('close', () => {
      clearInterval(keepalive);
      clients.delete(res);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    const snap = office.snapshot();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(
      JSON.stringify({
        ok: true,
        app: snap.app,
        schema: snap.schema,
        uptime_s: Math.round(process.uptime()),
        desks: Object.keys(snap.desks).length,
        sessions: office.sessions.size,
        clients: clients.size,
      }),
    );
    return;
  }

  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(office.snapshot()));
    return;
  }

  if (req.method === 'POST' && req.url === '/event') {
    // Custom header forces a CORS preflight, which this server never approves,
    // so random web pages in the browser cannot inject fake events.
    if (req.headers['x-agent-office'] !== '1') return res.writeHead(403).end();
    readBody(req, res, (body) => {
      let evt;
      try {
        evt = sanitizeEvent(JSON.parse(body));
      } catch {
        return res.writeHead(400).end();
      }
      if (!evt) return res.writeHead(400).end();
      try {
        if (DEBUG) console.log(`[${new Date().toISOString()}] event ${evt.hook_event_name} source=${evt.source} session=${(evt.session_id || '-').slice(0, 8)}`);
        office.handle(evt);
      } catch (err) {
        // Keep the server alive; the event is lost but the next one still works.
        console.error(`[${new Date().toISOString()}] Event handling failed (${evt.hook_event_name}):`, err);
        return res.writeHead(500).end();
      }
      res.writeHead(204).end();
    });
    return;
  }

  if (req.method === 'POST' && (req.url === '/control/stop' || req.url === '/control/restart')) {
    // Same header guard as /event: blocks cross-site requests from other pages in the browser.
    if (req.headers['x-agent-office'] !== '1') return res.writeHead(403).end();
    const action = req.url === '/control/stop' ? manualStop : restart;
    res.writeHead(202).end();
    res.on('finish', () => setImmediate(action));
    return;
  }

  res.writeHead(404).end();
}

const server = http.createServer((req, res) => {
  // A bug while handling one request must never take the whole server down.
  try {
    applyBaseHeaders(res);
    route(req, res);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Request failed:`, err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

let listenAttempts = 0;
server.on('error', (err) => {
  // During a restart the previous process may still hold the port for a moment.
  if (err.code === 'EADDRINUSE' && ++listenAttempts < LISTEN_RETRIES) {
    setTimeout(() => server.listen(PORT, HOST), LISTEN_RETRY_MS);
    return;
  }
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Set AGENT_OFFICE_PORT to another port.`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Agent Office running at http://${HOST}:${PORT}`);
});
