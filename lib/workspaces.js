'use strict';
// The folders a task may run in. The page only ever names a folder by its id; this module is the one place that turns an id into a
// path, and it checks the path again every time. For now the list is fixed by the server's environment:
//   AGENT_OFFICE_WORKSPACES=agent-office=C:\projects\agent-office;design-system=C:\projects\design-system
// (a settings dialog and a scan of a parent folder come later).

const fs = require('node:fs');
const path = require('node:path');

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/;

// Places that are never a workspace: a drive root, and the folders of the system.
function forbiddenRoots(env, platform) {
  if (platform === 'win32') {
    return [env.SystemRoot, env.windir, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, env.ProgramData].filter(Boolean).map((p) => path.resolve(p).toLowerCase());
  }
  return ['/etc', '/usr', '/bin', '/sbin', '/var', '/sys', '/proc', '/dev', '/boot', '/lib', '/root'];
}

// Returns the real path if the folder is acceptable, otherwise null.
function checkFolder(dir, { env = process.env, platform = process.platform } = {}) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) return null;
  let real;
  try {
    real = fs.realpathSync(dir);
    if (!fs.statSync(real).isDirectory()) return null;
  } catch { return null; }
  if (path.parse(real).root === real) return null; // a drive root
  const low = platform === 'win32' ? real.toLowerCase() : real;
  const cmp = platform === 'win32' ? (p) => p.toLowerCase() : (p) => p;
  for (const bad of forbiddenRoots(env, platform)) {
    if (cmp(low) === cmp(bad) || low.startsWith(cmp(bad) + path.sep)) return null;
  }
  return real;
}

function parseList(spec) {
  const out = [];
  for (const part of String(spec || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    out.push([part.slice(0, i).trim(), part.slice(i + 1).trim()]);
  }
  return out;
}

function createWorkspaces(options = {}) {
  const env = options.env || process.env;
  const items = new Map();
  const skipped = [];
  for (const [id, dir] of parseList(env.AGENT_OFFICE_WORKSPACES)) {
    if (!ID_RE.test(id)) { skipped.push(id + ': not a valid id'); continue; }
    if (items.has(id)) { skipped.push(id + ': listed twice'); continue; }
    const real = checkFolder(dir, options);
    if (!real) { skipped.push(id + ': not an acceptable folder'); continue; }
    items.set(id, real);
  }
  return {
    skipped,
    // ids and labels only: the page never sees a path
    list: () => [...items.keys()].map((id) => ({ id, label: id })),
    // the folder for an id, checked again now (it may have been removed or swapped for a link since the server started)
    resolve(id) {
      if (typeof id !== 'string' || !items.has(id)) return null;
      const real = checkFolder(items.get(id), options);
      return real && real === items.get(id) ? real : null;
    },
  };
}

module.exports = { ID_RE, checkFolder, createWorkspaces };
