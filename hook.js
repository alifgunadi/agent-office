'use strict';
// Forwards a Claude Code hook payload to the local Agent Office server.
// Design constraints:
// - Never blocks or fails Claude Code: always exits 0, prints nothing to stdout.
// - Sends only the minimum fields the office needs (no prompts, file contents, or full commands).

const http = require('node:http');

const PORT = Number(process.env.AGENT_OFFICE_PORT) || 4317;
const MAX_STDIN_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 800;
const HARD_EXIT_MS = 1500;

setTimeout(() => process.exit(0), HARD_EXIT_MS).unref();

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
  if (raw.length > MAX_STDIN_BYTES) process.exit(0);
});
process.stdin.on('end', forward);
process.stdin.on('error', () => process.exit(0));

function slimToolInput(input) {
  if (!input || typeof input !== 'object') return undefined;
  const slim = {};
  const file = input.file_path || input.path || input.notebook_path;
  if (file) slim.file_path = String(file).slice(0, 300);
  // ponytail: Only the first token of a shell command is forwarded, to avoid leaking secrets passed as arguments.
  if (typeof input.command === 'string') slim.command = input.command.trim().split(/\s+/)[0].slice(0, 40);
  if (typeof input.pattern === 'string') slim.pattern = input.pattern.slice(0, 40);
  if (typeof input.subagent_type === 'string') slim.subagent_type = input.subagent_type.slice(0, 80);
  return slim;
}

function forward() {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const event = {
    hook_event_name: payload.hook_event_name,
    session_id: payload.session_id,
    agent_id: payload.agent_id,
    agent_type: payload.agent_type,
    teammate_name: payload.teammate_name,
    tool_name: payload.tool_name,
    notification_type: payload.notification_type,
    tool_input: slimToolInput(payload.tool_input),
  };
  const body = JSON.stringify(event);

  const req = http.request(
    {
      host: '127.0.0.1',
      port: PORT,
      method: 'POST',
      path: '/event',
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Agent-Office': '1',
      },
    },
    (res) => {
      res.resume();
      res.on('end', () => process.exit(0));
    },
  );
  req.on('timeout', () => {
    req.destroy();
    process.exit(0);
  });
  req.on('error', () => {
    // Server is down (e.g. auto-stopped). Revive it when the user is active again.
    if (event.hook_event_name === 'UserPromptSubmit') reviveServer();
    process.exit(0);
  });
  req.end(body);
}

function reviveServer() {
  try {
    const { spawn } = require('node:child_process');
    const path = require('node:path');
    spawn(process.execPath, [path.join(__dirname, 'ensure-server.js')], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    }).unref();
  } catch {
    // Never fail Claude Code.
  }
}
