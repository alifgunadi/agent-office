# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Agent Office: a live pixel-art office that visualizes Claude Code, Antigravity and OpenCode agents. Each agent role has a fixed desk; characters type/wait/sleep based on hook events. Windows-first (PowerShell scripts, WinForms desktop host). See [README.md](README.md) for integration setup (hook config, Antigravity adapter, OpenCode plugin) and [desktop/README.md](desktop/README.md) for the desktop app.

## Commands

No build step, no dependencies, no lint, and no unit tests for the Node side. Needs Node (also runs under Bun).

```powershell
node server.js                         # run server on 127.0.0.1:4317 (AGENT_OFFICE_PORT to change)
node ensure-server.js                  # start server in background only if not running (idempotent)
powershell -File start-office.ps1      # start + open browser; stop-office.ps1 to stop

# Desktop app (C# WinForms + WebView2, .NET 9)
dotnet publish desktop\host-dotnet -c Release -o desktop\app
node desktop\tools\test-desktop.js     # 14 e2e tests against real exe, isolated server on port 4399 (Node 22+)
```

Server logs: `%TEMP%\agent-office.log`; desktop host log: `%TEMP%\agent-office-desktop.log`.

## Architecture

Event flow: agent tool hook -> `hook.js` (stdin JSON -> slimmed payload) -> `POST /event` on [server.js](server.js) -> in-memory `state` -> SSE `GET /events` -> [index.html](index.html) draws on a `<canvas>`.

- **server.js** is a dependency-free `http` server holding all state in memory (`state.desks`, `state.log`, `sessions`, `activeSubagents`). Endpoints: `/` (serves index.html), `/events` (SSE), `/state`, `POST /event`, `POST /control/stop|restart`. Mutating POSTs require the `X-Agent-Office: 1` header (blocks cross-site browser requests); server binds to 127.0.0.1 only.
- **Desk mapping**: `ROLE_IDS` in server.js must match the agent `name` frontmatter in `~/.claude/agents/*.md`. Unknown agent types get an auto-created "guest" desk. Tool events go to the subagent desk if `agent_id`/`agent_type` is present, else `main`. Nested ids (`engineering/lead-dba`) are flattened to the basename.
- **Lifecycle**: auto-stops 30 s after the last `SessionEnd` (cancelled by any new event); sessions silent for 6 h are pruned. Manual Stop writes `%TEMP%\agent-office.stopped`, which stops `hook.js` from reviving the server until `ensure-server.js` clears it (new session / start script). Restart spawns a detached new instance that retries `listen` until the port frees.
- **index.html** is a single 1900-line file (inline CSS + JS, canvas rendering, pointer/a11y handling, reduced-motion path). No bundler or modules.
- **Privacy constraint**: `hook.js` must forward only event name, ids, agent type, tool name, file name, first word of a shell command, and a search pattern (max 40 chars). Never prompts, file contents or full commands. It must always exit 0 with empty stdout so it can never block the host agent.
- **Other agents**: Antigravity and OpenCode adapters live *outside* this repo (`~/.gemini/...`, `~/.config/opencode/plugins/agent-office.js`) and translate to the same `/event` payload; changing the event schema breaks them.
- **desktop/**: thin C# host that runs `ensure-server.js` then loads `http://127.0.0.1:4317/` in WebView2; it is only a viewer, so server/page changes need no desktop rebuild. Only the office origin may load. Custom repo path via `AGENT_OFFICE_ROOT`; custom port must be a Windows *user* env var for the desktop icon to see it.

## Gotchas

- `hooks-settings-snippet.json`, [README.md](README.md) and the integrations hardcode `C:/projects/agent-office/`.
- `desktop/host-dotnet/bin`, `obj` and `desktop/app` are listed in `desktop/.gitignore` but are currently tracked in git; avoid committing rebuilt binaries unintentionally.
- `project/` is gitignored and holds private project materials: `project/docs/` and `project/research/desktop-app/` (design docs for the desktop app, not runtime code). Never commit or reference its contents in tracked files.
