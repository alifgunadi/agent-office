'use strict';
// Agent Office: local server that turns Claude Code hook events into a live pixel office.
// Run: node server.js   (or: bun server.js)   then open http://127.0.0.1:4317

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.AGENT_OFFICE_PORT) || 4317;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_LOG_ENTRIES = 100;
const DONE_TO_IDLE_MS = 8000;
const KEEPALIVE_MS = 15000;
const MAIN_DESK = 'main';

// Desk ids must match the `name` field in ~/.claude/agents/*.md frontmatter.
const ROLE_IDS = [
  MAIN_DESK,
  'product-manager',
  'lead-business-analyst',
  'lead-solution-engineer',
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

for (const id of ROLE_IDS) ensureDesk(id);

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
        if (state.desks[id] && state.desks[id].status === 'done') setDesk(id, 'idle', '');
      }, DONE_TO_IDLE_MS),
    );
  }

  if (activity) {
    state.log.push({ t: desk.updatedAt, desk: id, status, text: activity });
    if (state.log.length > MAX_LOG_ENTRIES) state.log.shift();
  }
  broadcast();
}

function shortToolName(name) {
  if (!name) return 'tool';
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    return `${parts[1] || 'mcp'}:${parts[parts.length - 1]}`;
  }
  return name;
}

function describeTool(name, input) {
  const tool = shortToolName(name);
  if (!input) return tool;
  if (input.subagent_type) return `delegate -> ${input.subagent_type}`;
  if (input.file_path) return `${tool} ${path.basename(input.file_path)}`;
  if (input.command) return `${tool} ${input.command}`;
  if (input.pattern) return `${tool} "${input.pattern}"`;
  return tool;
}

function resolveDesk(evt) {
  if (typeof evt.agent_type === 'string' && evt.agent_type) return evt.agent_type;
  if (evt.agent_id && activeSubagents.has(evt.agent_id)) return activeSubagents.get(evt.agent_id);
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
      handleEvent(evt);
      res.writeHead(204).end();
    });
    return;
  }

  res.writeHead(404).end();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Set AGENT_OFFICE_PORT to another port.`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Agent Office running at http://${HOST}:${PORT}`);
});
