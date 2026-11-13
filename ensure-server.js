'use strict';
// Starts the Agent Office server in the background if it is not already running.
// Used by the Claude Code SessionStart hook and the optional Windows logon task.
// Always exits 0 and prints nothing to stdout (SessionStart stdout is added to Claude's context).

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.AGENT_OFFICE_PORT) || 4317;
const PROBE_TIMEOUT_MS = 500;
const HARD_EXIT_MS = 3000;
const SERVER_PATH = path.join(__dirname, 'server.js');
const LOG_PATH = path.join(os.tmpdir(), 'agent-office.log');

setTimeout(() => process.exit(0), HARD_EXIT_MS).unref();

// An explicit start clears a previous manual Stop from the UI.
try {
  fs.unlinkSync(path.join(os.tmpdir(), 'agent-office.stopped'));
} catch {
  // Marker absent.
}

// Hook payload arrives on stdin; it is not needed here.
process.stdin.on('error', () => {});
process.stdin.resume();

function startServer() {
  let out = 'ignore';
  try {
    out = fs.openSync(LOG_PATH, 'a');
  } catch {
    // Logging is optional; start without it.
  }
  try {
    const child = spawn(process.execPath, [SERVER_PATH], {
      cwd: __dirname,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', out, out],
    });
    child.on('error', () => process.exit(0));
    child.unref();
  } catch {
    // Never fail the caller.
  }
  process.exit(0);
}

const probe = http.get({ host: '127.0.0.1', port: PORT, path: '/state', timeout: PROBE_TIMEOUT_MS }, (res) => {
  res.resume();
  if (res.statusCode === 200) process.exit(0);
  else startServer();
});
probe.on('timeout', () => probe.destroy());
probe.on('error', startServer);
