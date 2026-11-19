# Security

Agent Office is a local tool: the server listens on `127.0.0.1` only and keeps everything in memory.

## Reporting a problem

Open a private security advisory on the GitHub repository (Security tab, "Report a vulnerability"), or contact the maintainer
directly. Please do not post details in a public issue first.

## What the server defends against

- **Other web pages in your browser:** every route rejects a foreign `Host` (DNS rebinding), a foreign `Origin` and
  `Sec-Fetch-Site: cross-site`. `POST` routes also require the header `X-Agent-Office: 1`.
- **Malformed or hostile events:** `/event` bodies are limited to 64 KiB and reduced to a fixed allowlist of fields with type
  and length checks. Unknown fields are never stored. Guest desks (12), SSE clients (16) and tracked ids (256) are capped.
- **Page injection:** the page is served with a Content-Security-Policy that allows only its own inline script and style (by
  hash), its own fonts and its own origin; plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
  `frame-ancestors 'none'`. The page loads nothing from other sites (the Nunito font is bundled in `fonts/`).
- **Privacy:** hooks and adapters send only event names, ids, tool names, file base names, program names and short search
  patterns. Never prompts, file contents or full command lines.
- **Desktop host:** only the office origin may load; downloads, permission requests, new windows, frames, host objects, web
  messages and script dialogs are blocked.

## What it does not defend against

- **Other local users and processes.** There is no authentication: any process on this machine can post events or read the
  state, and the `X-Agent-Office` header is not a secret. Do not expose the port beyond `127.0.0.1`.
- **Write access to the checkout.** Claude Code runs `hook.js` and `ensure-server.js` from this folder with your rights, so
  anyone who can write to the folder can run code as you. On a PC shared between Windows accounts, keep the repo where only
  you can write, for example under your user profile, or remove the broad grant on the parent folder:

  ```powershell
  # Review first: icacls C:\projects
  icacls C:\projects\agent-office /inheritance:d
  icacls C:\projects\agent-office /remove "NT AUTHORITY\Authenticated Users"
  ```

  (Default Windows permissions on `C:\` let every signed-in user modify new top-level folders.)
- **Supply chain.** There are no runtime dependencies. Dev tooling is pinned in CI and kept current by Dependabot.

## Hardening switches

- `AGENT_OFFICE_PORT` changes the port. `AGENT_OFFICE_DATA_DIR` moves the log and the stop marker.
- `GET /health` reports liveness without exposing event content.
