'use strict';
// Agent Office: local server that turns Claude Code hook events into a live pixel office.
// Run: node server.js   (or: bun server.js)   then open http://127.0.0.1:4317

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Written on a manual Stop; hook.js will not auto-revive the server while it exists.
// ensure-server.js removes it (new Claude Code session, start-office.ps1, logon task).
const STOPPED_MARKER = path.join(os.tmpdir(), 'agent-office.stopped');
const LOG_PATH = path.join(os.tmpdir(), 'agent-office.log');
const LISTEN_RETRIES = 10;
const LISTEN_RETRY_MS = 200;

const HOST = '127.0.0.1';
const PORT = Number(process.env.AGENT_OFFICE_PORT) || 4317;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_LOG_ENTRIES = 100;
const DONE_TO_IDLE_MS = 8000;
const KEEPALIVE_MS = 15000;
const MAIN_DESK = 'main';
// Auto stop: shut down after the last Claude Code session ends. Set AGENT_OFFICE_AUTO_STOP=0 to disable.
const AUTO_STOP = process.env.AGENT_OFFICE_AUTO_STOP !== '0';
const SHUTDOWN_GRACE_MS = 30 * 1000;
const STALE_SESSION_MS = 6 * 60 * 60 * 1000;
const STALE_CHECK_MS = 5 * 60 * 1000;
const STALE_DESK_MS = 10 * 60 * 1000;
const STALE_DESK_CHECK_MS = 60 * 1000;

// Desk ids must match the `name` field in ~/.claude/agents/*.md frontmatter.
const ROLE_IDS = [
  MAIN_DESK,
  'product-manager',
  'lead-business-analyst',
  'lead-solution-engineer',
  'lead-ux',
  'lead-system-analyst',
  'lead-software-engineer',
  'lead-ui',
  'lead-qa',
  'lead-security',
  'lead-dba',
  'lead-devops',
];

const state = { desks: {}, log: [] };
const activeSubagents = new Map(); // agent_id -> agent_type
const idleTimers = new Map(); // deskId -> timeout
const clients = new Set();
const sessions = new Map(); // session_id -> lastSeen timestamp
let shutdownTimer = null;

for (const id of ROLE_IDS) ensureDesk(id);

function cancelShutdown() {
  clearTimeout(shutdownTimer);
  shutdownTimer = null;
}

function scheduleShutdown(reason) {
  if (!AUTO_STOP || shutdownTimer) return;
  console.log(`[${new Date().toISOString()}] No active sessions (${reason}). Stopping in ${SHUTDOWN_GRACE_MS / 1000}s.`);
  shutdownTimer = setTimeout(() => shutdown('auto stop'), SHUTDOWN_GRACE_MS);
}

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

function trackSession(evt) {
  if (evt.hook_event_name === 'SessionEnd') {
    if (evt.session_id) sessions.delete(evt.session_id);
    if (sessions.size === 0) scheduleShutdown('last session ended');
    return;
  }
  cancelShutdown();
  if (evt.session_id) sessions.set(evt.session_id, Date.now());
}

setInterval(() => {
  const now = Date.now();
  let pruned = false;
  for (const [id, lastSeen] of sessions) {
    if (now - lastSeen > STALE_SESSION_MS) {
      sessions.delete(id);
      pruned = true;
    }
  }
  if (pruned && sessions.size === 0) scheduleShutdown('stale sessions');
}, STALE_CHECK_MS).unref();

function ensureDesk(id) {
  if (!state.desks[id]) {
    state.desks[id] = { id, status: 'idle', activity: '', updatedAt: Date.now(), guest: !ROLE_IDS.includes(id) };
  }
  return state.desks[id];
}

function setDesk(id, status, activity) {
  const desk = ensureDesk(id);
  desk.status = status;
  desk.activity = activity || '';
  desk.updatedAt = Date.now();

  clearTimeout(idleTimers.get(id));
  idleTimers.delete(id);
  if (status === 'done') {
    idleTimers.set(
      id,
      setTimeout(() => {
        idleTimers.delete(id);
        if (!state.desks[id] || state.desks[id].status !== 'done') return;
        if (state.desks[id].guest) removeDesk(id);
        else setDesk(id, 'idle', '');
      }, DONE_TO_IDLE_MS),
    );
  }

  if (activity) {
    state.log.push({ t: desk.updatedAt, desk: id, status, text: activity });
    if (state.log.length > MAX_LOG_ENTRIES) state.log.shift();
  }
  broadcast();
}

function removeDesk(id) {
  clearTimeout(idleTimers.get(id));
  idleTimers.delete(id);
  delete state.desks[id];
  broadcast();
}

// Safety net for missed events: a desk stuck in working/waiting returns to idle,
// and guest desks disappear once they have been quiet for a while.
setInterval(() => {
  const now = Date.now();
  for (const desk of Object.values(state.desks)) {
    if (now - desk.updatedAt < STALE_DESK_MS) continue;
    if (desk.guest) removeDesk(desk.id);
    else if (desk.status === 'working' || desk.status === 'waiting') setDesk(desk.id, 'idle', '');
  }
}, STALE_DESK_CHECK_MS).unref();

function shortToolName(name) {
  if (!name) return 'tool';
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    return `${parts[1] || 'mcp'}:${parts[parts.length - 1]}`;
  }
  return name;
}

// Internal Claude Code tools that are not meaningful as "work" on a desk.
const INTERNAL_TOOL_LABELS = { SubagentHandback: 'reporting back' };

function describeTool(name, input) {
  if (INTERNAL_TOOL_LABELS[name]) return INTERNAL_TOOL_LABELS[name];
  const tool = shortToolName(name);
  if (!input) return tool;
  if (input.subagent_type) return `delegate -> ${input.subagent_type}`;
  if (input.file_path) return `${tool} ${path.basename(input.file_path)}`;
  if (input.command) return `${tool} ${input.command}`;
  if (input.pattern) return `${tool} "${input.pattern}"`;
  return tool;
}

function isActiveSubagentType(type) {
  for (const t of activeSubagents.values()) if (t === type) return true;
  return false;
}

function resolveDesk(evt) {
  const type = typeof evt.agent_type === 'string' ? evt.agent_type : '';
  if (evt.agent_id) {
    if (activeSubagents.has(evt.agent_id)) return activeSubagents.get(evt.agent_id);
    if (type) return type;
  }
  // agent_type without agent_id is the main thread running as an agent (e.g. a plugin's default agent),
  // unless that type is currently running as a subagent.
  if (type && isActiveSubagentType(type)) return type;
  if (typeof evt.teammate_name === 'string' && evt.teammate_name) return evt.teammate_name;
  return MAIN_DESK;
}

function handleEvent(evt) {
  const desk = resolveDesk(evt);
  switch (evt.hook_event_name) {
    case 'SessionStart':
      setDesk(MAIN_DESK, 'idle', 'session started');
      break;
    case 'UserPromptSubmit':
      setDesk(MAIN_DESK, 'working', 'thinking...');
      break;
    case 'SubagentStart': {
      const type = evt.agent_type || 'subagent';
      if (evt.agent_id) activeSubagents.set(evt.agent_id, type);
      setDesk(type, 'working', 'starting task');
      break;
    }
    case 'SubagentStop': {
      const type = evt.agent_type || activeSubagents.get(evt.agent_id) || 'subagent';
      if (evt.agent_id) activeSubagents.delete(evt.agent_id);
      setDesk(type, 'done', 'task finished');
      break;
    }
    case 'PreToolUse':
      setDesk(desk, 'working', describeTool(evt.tool_name, evt.tool_input));
      break;
    case 'PostToolUseFailure':
      setDesk(desk, 'working', `${shortToolName(evt.tool_name)} failed`);
      break;
    case 'Notification':
      if (evt.notification_type === 'permission_prompt') setDesk(MAIN_DESK, 'waiting', 'needs your approval');
      else if (evt.notification_type === 'idle_prompt') setDesk(MAIN_DESK, 'waiting', 'waiting for your input');
      break;
    case 'TeammateIdle':
      setDesk(desk, 'idle', 'idle');
      break;
    case 'Stop':
      setDesk(MAIN_DESK, 'done', 'turn finished');
      break;
    case 'SessionEnd':
      activeSubagents.clear();
      for (const id of Object.keys(state.desks)) setDesk(id, 'idle', '');
      break;
    default:
      break;
  }
}

function broadcast() {
  const data = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) res.write(data);
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

const indexPath = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    fs.readFile(indexPath, (err, html) => {
      if (err) return res.writeHead(500).end('index.html not found');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(html);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);
    req.on('close', () => {
      clearInterval(keepalive);
      clients.delete(res);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(state));
    return;
  }

  if (req.method === 'POST' && req.url === '/event') {
    // Custom header forces a CORS preflight, which this server never approves,
    // so random web pages in the browser cannot inject fake events.
    if (req.headers['x-agent-office'] !== '1') return res.writeHead(403).end();
    readBody(req, res, (body) => {
      let evt;
      try {
        evt = JSON.parse(body);
      } catch {
        return res.writeHead(400).end();
      }
      if (!evt || typeof evt !== 'object' || typeof evt.hook_event_name !== 'string') return res.writeHead(400).end();
      trackSession(evt);
      handleEvent(evt);
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
