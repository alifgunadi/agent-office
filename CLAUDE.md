# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Agent Office: a live pixel-art office that visualizes Claude Code, Antigravity and OpenCode agents. Each agent role has a fixed desk; characters type/wait/sleep based on hook events. Windows-first (PowerShell scripts, WinForms desktop host). See [README.md](README.md) for integration setup (hook config, Antigravity adapter, OpenCode plugin) and [desktop/README.md](desktop/README.md) for the desktop app.

## Commands

No build step, no runtime dependencies, no lint. Needs Node 22+ (also runs under Bun). The Node side is covered by `npm test` (`node --test`, no install needed).

```powershell
node server.js                         # run server on 127.0.0.1:4317 (AGENT_OFFICE_PORT to change)
node ensure-server.js                  # start server in background only if not running (idempotent)
powershell -File start-office.ps1      # start + open browser; stop-office.ps1 to stop
node install.js [--dry-run]            # wire hooks/adapters into Claude Code, Antigravity, OpenCode (idempotent)

# Desktop app (C# WinForms + WebView2, .NET 10)
dotnet publish desktop\host-dotnet -c Release -o desktop\app
npm test                               # unit + black-box tests (free port, isolated data dir via AGENT_OFFICE_DATA_DIR)
node desktop\tools\test-desktop.js     # 14 e2e tests against real exe, isolated server on port 4399 (Node 22+)
```

Server logs: `%TEMP%\agent-office.log`; desktop host log: `%TEMP%\agent-office-desktop.log`.

## Architecture

Event flow: agent tool hook -> `hook.js` (stdin JSON -> slimmed payload) -> `POST /event` on [server.js](server.js) -> in-memory `state` -> SSE `GET /events` -> [index.html](index.html) draws on a `<canvas>`.

- **lib/office.js** is the office model (desks, log, session tracking, the hook-event state machine) with no HTTP or process code, so tests drive it directly. `lib/sanitize.js` cleans untrusted payloads, `lib/paths.js` holds the shared marker/log paths. A `SessionEnd` only resets desks the ending session wrote to while other sessions are live; with none left (or no session id) it resets everything.
- **server.js** is the dependency-free `http` and process-lifecycle layer around it; all state is in memory. Endpoints: `/` (serves index.html), `/events` (SSE), `/state`, `POST /event`, `POST /control/stop|restart`. Mutating POSTs require the `X-Agent-Office: 1` header (blocks cross-site browser requests); server binds to 127.0.0.1 only. Every route also rejects a foreign `Host` (DNS rebinding), a foreign `Origin` and `Sec-Fetch-Site: cross-site` with 403. `/event` bodies go through `sanitizeEvent` (known fields only, type-checked, length-capped), and guest desks (12), SSE clients (16) and tracked ids (256) are capped. `/state` and SSE carry `app: "agent-office"` and `schema: 1`; `ensure-server.js` uses that to tell the office from another service on the port.
- **Desk mapping**: `ROLE_IDS` in server.js must match the agent `name` frontmatter in `~/.claude/agents/*.md`. Unknown agent types get an auto-created "guest" desk. Tool events go to the subagent desk if `agent_id`/`agent_type` is present, else `main`. Nested ids (`engineering/lead-dba`) are flattened to the basename.
- **Lifecycle**: auto-stops 30 s after the last `SessionEnd` (cancelled by any new event); sessions silent for 6 h are pruned. Manual Stop writes `%TEMP%\agent-office.stopped`, which stops `hook.js` from reviving the server until `ensure-server.js` clears it (new session / start script). Restart spawns a detached new instance that retries `listen` until the port frees.
- **index.html** is a single 1900-line file (inline CSS + JS, canvas rendering, pointer/a11y handling, reduced-motion path). No bundler or modules.
- **Privacy constraint**: `hook.js` must forward only event name, ids, agent type, tool name, file base name (no directory), program name of a shell command (no `VAR=value` prefixes, directories or arguments), and a search pattern (max 40 chars). Never prompts, file contents or full commands. It must always exit 0 with empty stdout so it can never block the host agent.
- **Other agents**: the Antigravity adapter and the OpenCode plugin live in `adapters/` and are copied (with the checkout path filled in) to `~/.gemini/config/plugins/migrated-settings/` and `~/.config/opencode/plugins/` by `node install.js`, which also merges the Claude Code hooks into `~/.claude/settings.json` (idempotent, backs up what it changes, `--dry-run` previews). Copies installed before `adapters/` existed keep working. The `/event` contract is `docs/event-schema.json`: envelope v1 adds optional `v` and `source`, sessions are keyed by `source:session_id`, and changes must stay additive or external senders break. `test/contract.test.js` and `test/fixtures/events.json` guard that.
- **desktop/**: thin C# host that runs `ensure-server.js` then loads `http://127.0.0.1:4317/` in WebView2; it is only a viewer, so server/page changes need no desktop rebuild. Only the office origin may load. Custom repo path via `AGENT_OFFICE_ROOT`; custom port must be a Windows *user* env var for the desktop icon to see it.

## Gotchas

- `hooks-settings-snippet.json`, [README.md](README.md) and the integrations hardcode `C:/projects/agent-office/`.
- `desktop/host-dotnet/bin`, `obj`, `desktop/app` and `desktop/tools/out` are build output: ignored and no longer tracked (CI fails if they are tracked again). The e2e tests need `desktop/app` built locally first.
- Stop marker and log live in `AGENT_OFFICE_DATA_DIR` (default: the OS temp dir); see `lib/paths.js`. Tests set it so they never touch a real office.
- `project/` is gitignored and holds private project materials: `project/docs/` and `project/research/desktop-app/` (design docs for the desktop app, not runtime code). Never commit or reference its contents in tracked files.
