# Agent Office

Live pixel-art office for Claude Code and Antigravity agents. Each role in `~/.claude/agents` (or Antigravity `team-*` plugins) has a fixed desk;
characters type, wait, or sleep based on hook events.

## Files
- `server.js`  - local server (127.0.0.1:4317), no dependencies. Runs with `node` or `bun`.
- `hook.js`    - Claude Code hook. Forwards a minimal event to the server. Always exits 0, prints nothing.
- `index.html` - the office page.
- `ensure-server.js` - starts the server in the background if it is not running (silent, idempotent).
- `hooks-settings-snippet.json` - hooks config to merge into `~/.claude/settings.json`.
- `start-office.ps1` / `stop-office.ps1` - start in the background and open the browser / stop.
- `install-autostart.ps1` / `uninstall-autostart.ps1` - optional Windows logon task.

## Connecting to Claude Code and Antigravity

### Claude Code
1. Merge the `hooks` object from `hooks-settings-snippet.json` into `~/.claude/settings.json`.
2. On `SessionStart`, `ensure-server.js` starts `server.js` if not already running, and `hook.js` forwards Claude Code lifecycle events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`, `SubagentStop`, `TeammateIdle`, `Stop`, `SessionEnd`) to `http://127.0.0.1:4317/event`.

### Antigravity
Antigravity uses plugin-scoped `hooks.json` with camelCase stdin payloads (`hookEventName`, `conversationId`, `toolCall`) and expects JSON on stdout:
1. In an active Antigravity plugin (for example `~/.gemini/config/plugins/migrated-settings/`), add `hooks.json` and a small Node adapter script (e.g. `agy-office-hook.js`).
2. Subscribe to `SessionStart`, `PreInvocation`, `PostToolUse` (matcher `".*"`), and `Stop` in `hooks.json` pointing to `node ./agy-office-hook.js`:
   - `SessionStart`: spawn `C:/projects/agent-office/ensure-server.js` (detached) and post `SessionStart`; print `{}`.
   - `PreInvocation`: post `UserPromptSubmit` for `main`; print `{}`.
   - `PostToolUse`: post `PreToolUse` / `PostToolUseFailure` for `main` (never `PreToolUse` in `hooks.json`, so tool permission prompts are not altered). When `toolCall.name === "invoke_subagent"`, also emit `SubagentStart` with `agent_type: toolCall.args.TypeName`; print `{}`.
   - `Stop`: emit `SubagentStop` for any active subagents tracked in that `conversationId`, then emit `Stop` for `main`; print `{"decision":"stop"}`.
3. Every `POST /event` request must include `X-Agent-Office: 1`. Both Claude Code and Antigravity can run against the same `127.0.0.1:4317` server without interfering with each other.

## Privacy
`hook.js` forwards only: event name, session/agent ids, agent type, tool name, file name,
first word of a shell command, search pattern (max 40 chars). Never prompts, file contents,
or full commands. The server binds to 127.0.0.1 only and rejects requests without the
`X-Agent-Office` header, so web pages in your browser cannot inject events.

## Behavior if the server is not running
The hook fails silently in a few milliseconds. Claude Code is not affected.

## Desk mapping
- Subagent events (`SubagentStart`/`SubagentStop`) use `agent_type` = the agent's `name` frontmatter.
- Tool events go to the subagent desk when Claude Code includes `agent_id`/`agent_type`, otherwise to "Trainer".
- Unknown agent types (e.g. `Explore`, `general-purpose`, teammates) get a guest desk automatically.

## Change port
Set `AGENT_OFFICE_PORT` in both the server environment and the `env` section of `settings.json`.

## Auto start
- With Claude Code (recommended): `ensure-server.js` runs on `SessionStart` (already in the hooks snippet).
  It starts the server in the background only if it is not running, and opens the browser once.
  Set `AGENT_OFFICE_OPEN_BROWSER=0` in the `env` section of settings.json to skip opening the browser.
- At Windows logon: put a shortcut to `start-office-hidden.vbs` in the Startup folder (`shell:startup`).
- Stop the server: `Get-NetTCPConnection -LocalPort 4317 -State Listen | % { Stop-Process -Id $_.OwningProcess }`

## Auto start
1. On Claude Code start (recommended): the `SessionStart` hook runs `ensure-server.js`, which starts
   the server hidden in the background if it is not already running. Nothing else to install.
2. On Windows logon (optional): run `install-autostart.ps1` once. Remove with `uninstall-autostart.ps1`.

## Auto stop
The server stops 30 seconds after the last Claude Code session ends (`SessionEnd`).
Any new session or event within that window cancels the stop. Sessions with no events for 6 hours
are treated as ended (covers crashed sessions). If the server is down when you submit a prompt,
`hook.js` starts it again. Disable auto stop with environment variable `AGENT_OFFICE_AUTO_STOP=0`.

Server output is written to `%TEMP%\agent-office.log`.

## Restart / Stop from the page
- **Restart**: the server starts a fresh instance (new code) and the page reloads automatically.
- **Stop**: the server stops and stays stopped (prompts in an open session will not revive it)
  until a new Claude Code session starts or you run `start-office.ps1`.
  A marker file `%TEMP%\agent-office.stopped` records the manual stop.
- Start cannot be a button: the page itself is served by the server.
