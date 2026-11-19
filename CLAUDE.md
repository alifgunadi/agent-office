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
npm run test:browser                   # page tests in a real Edge window over CDP (test/browser/*.browser.js), isolated server
node desktop\tools\test-desktop.js     # 14 e2e tests against real exe, isolated server on port 4399 (Node 22+)
```

Server logs: `%TEMP%\agent-office.log`; desktop host log: `%TEMP%\agent-office-desktop.log`.

## Architecture

Event flow: agent tool hook -> `hook.js` (stdin JSON -> slimmed payload) -> `POST /event` on [server.js](server.js) -> in-memory `state` -> SSE `GET /events` -> the page in [public/](public/) draws on a `<canvas>`.

- **lib/office.js** is the office model (desks, log, session tracking, the hook-event state machine) with no HTTP or process code, so tests drive it directly. `lib/sanitize.js` cleans untrusted payloads, `lib/paths.js` holds the shared marker/log paths. A `SessionEnd` only resets desks the ending session wrote to while other sessions are live; with none left (or no session id) it resets everything.
- **server.js** is the dependency-free `http` and process-lifecycle layer around it; all state is in memory. Endpoints: `/` (serves public/index.html), `/events` (SSE), `/state`, `POST /event`, `POST /control/stop|restart`. Mutating POSTs require the `X-Agent-Office: 1` header (blocks cross-site browser requests); server binds to 127.0.0.1 only. Every route also rejects a foreign `Host` (DNS rebinding), a foreign `Origin` and `Sec-Fetch-Site: cross-site` with 403. `/event` bodies go through `sanitizeEvent` (known fields only, type-checked, length-capped), and guest desks (12), SSE clients (16) and tracked ids (256) are capped. `/state` and SSE carry `app: "agent-office"` and `schema: 1`; `ensure-server.js` uses that to tell the office from another service on the port.
- **Desk mapping**: `ROLE_IDS` in server.js must match the agent `name` frontmatter in `~/.claude/agents/*.md`. Unknown agent types get an auto-created "guest" desk. Tool events go to the subagent desk if `agent_id`/`agent_type` is present, else `main`. Nested ids (`engineering/lead-dba`) are flattened to the basename.
- **Lifecycle**: auto-stops 30 s after the last `SessionEnd` (cancelled by any new event); sessions silent for 6 h are pruned. Manual Stop writes `%TEMP%\agent-office.stopped`, which stops `hook.js` from reviving the server until `ensure-server.js` clears it (new session / start script). Restart spawns a detached new instance that retries `listen` until the port frees.
- **public/** is the page: `index.html`, three stylesheets (`tokens.css` = design tokens from the Penpot UI kit, `components.css` = Button/Badge/Chip/Tabs and the focus ring, `app.css` = page layout) and classic scripts in `public/js/` (roles, core, draw2d, projection, overlays, characters, agents, layout, scene, log, a11y, chrome, camera, net). The camera (`camera.js`, state in `camera` in core.js) turns the world a quarter turn at a time around the middle of the floor: `pj` rotates before projecting (`setView`, `viewXY`, `viewRect` in projection.js), `box()` picks the faces that face the viewer, depth sorting uses view-space rectangles, walls get their height from their role in the view (`wallRole`/`wallHeight`), and at turn 0 every formula is the original one (the canvas is byte-identical). Turning only exists in the wide layout; the stacked rooms stay oblique. Zoom is a multiple of the fit-to-window size; choices are saved in `localStorage`. Use the tokens (`var(--space-*)`, `--ctl-*`, `--color-*`); `test/tokens.test.js` checks their contrast and scale. The wide isometric layout starts at a stage width of `WIDE_MIN_W` (core.js). They share one global scope and load in that order from `index.html`; async work must wait for `booted` (set at the end of `net.js`) because it can fire between two scripts. No bundler or modules. `roles-shared.js` is plain JS usable in both the page and Node: it is the single list of desk ids and divisions (the server's `lib/office.js` requires it; `test/roles.test.js` checks the page's `ROLES` against it). The render loop pauses while `document.hidden`, draws at about 30 fps when no agent is working or walking and at most about 60 fps otherwise (even on 120 Hz displays), and draws on demand with reduced motion (a resize or motion change redraws immediately); SSE messages are applied once per frame, the log is updated incrementally, and `#agent-list` (visually hidden, focusable) plus `#announce` carry the screen-reader view.
- **Privacy constraint**: `hook.js` must forward only event name, ids, agent type, tool name, file base name (no directory), program name of a shell command (no `VAR=value` prefixes, directories or arguments), and a search pattern (max 40 chars). Never prompts, file contents or full commands. It must always exit 0 with empty stdout so it can never block the host agent.
- **Other agents**: the Antigravity adapter and the OpenCode plugin live in `adapters/` and are copied (with the checkout path filled in) to `~/.gemini/config/plugins/migrated-settings/` and `~/.config/opencode/plugins/` by `node install.js`, which also merges the Claude Code hooks into `~/.claude/settings.json` (idempotent, backs up what it changes, `--dry-run` previews). Copies installed before `adapters/` existed keep working. The `/event` contract is `docs/event-schema.json`: envelope v1 adds optional `v` and `source`, sessions are keyed by `source:session_id`, and changes must stay additive or external senders break. `test/contract.test.js` and `test/fixtures/events.json` guard that.
- **desktop/**: thin C# host that runs `ensure-server.js` then loads `http://127.0.0.1:4317/` in WebView2; it is only a viewer, so server/page changes need no desktop rebuild. Only the office origin may load. Custom repo path via `AGENT_OFFICE_ROOT`; custom port must be a Windows *user* env var for the desktop icon to see it.

## Gotchas

- The hooks template and adapters carry no fixed repo path: `node install.js` fills in this checkout's path (the desktop host finds the repo from its exe location or `AGENT_OFFICE_ROOT`).
- Security headers and the page CSP come from `lib/security.js`: `script-src 'self'; style-src 'self'`, so the page may not contain inline `<script>`, `<style>`, `style=` attributes or `on*=` handlers (`test/security.test.js` fails if it does; set styles through CSSOM or classes). `server.js` serves only `public/index.html`, `public/app.css` and `public/js/<name>.js` (a fixed name pattern, no other path is read). The page must not load anything from another origin; the Nunito font is served from `fonts/` by an allowlist in `server.js`. See [SECURITY.md](SECURITY.md).
- `desktop/host-dotnet/bin`, `obj`, `desktop/app` and `desktop/tools/out` are build output: ignored and no longer tracked (CI fails if they are tracked again). The e2e tests need `desktop/app` built locally first.
- Stop marker and log live in `AGENT_OFFICE_DATA_DIR` (default: the OS temp dir); see `lib/paths.js`. Tests set it so they never touch a real office.
- `project/` is gitignored and holds private project materials: `project/docs/` and `project/research/desktop-app/` (design docs for the desktop app, not runtime code). Never commit or reference its contents in tracked files.
