# Agent Office

Live pixel-art office for Claude Code agents. Each role in `~/.claude/agents` has a fixed desk;
characters type, wait, or sleep based on Claude Code hook events.

## Files
- `server.js`  - local server (127.0.0.1:4317), no dependencies. Runs with `node` or `bun`.
- `hook.js`    - Claude Code hook. Forwards a minimal event to the server. Always exits 0, prints nothing.
- `index.html` - the office page.
- `hooks-settings-snippet.json` - hooks config to merge into `~/.claude/settings.json`.

## Privacy
`hook.js` forwards only: event name, session/agent ids, agent type, tool name, file name,
first word of a shell command, search pattern (max 40 chars). Never prompts, file contents,
or full commands. The server binds to 127.0.0.1 only and rejects requests without the
`X-Agent-Office` header, so web pages in your browser cannot inject events.

## Behavior if the server is not running
The hook fails silently in a few milliseconds. Claude Code is not affected.

## Desk mapping
- Subagent events (`SubagentStart`/`SubagentStop`) use `agent_type` = the agent's `name` frontmatter.
- Tool events go to the subagent desk when Claude Code includes `agent_id`/`agent_type`, otherwise to "Main Session".
- Unknown agent types (e.g. `Explore`, `general-purpose`, teammates) get a guest desk automatically.

## Change port
Set `AGENT_OFFICE_PORT` in both the server environment and the `env` section of `settings.json`.
