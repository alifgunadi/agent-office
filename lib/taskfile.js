'use strict';
// The task list on disk, so a restart or a crash does not make the Tasks tab forget what was asked.
//   - one small JSON file in the data folder, written atomically (a temporary file, then a rename), at most twice a second, and
//     synchronously when the server stops;
//   - what is read back is checked field by field (the file is not trusted: it may be damaged or edited), and a task that was
//     queued or running when the server went away comes back as "interrupted" because nothing is running it any more;
//   - a file that cannot be read or understood is set aside (.bad) with a warning, never a crash, and the server starts empty;
//   - old finished tasks are dropped, and the file has a size limit.
// The output of a task is not kept (it is in memory only), and the file may hold prompts, so it is created readable by the user only.

const fs = require('node:fs');
const path = require('node:path');

const FILE_VERSION = 1;
const MAX_FILE_BYTES = 2 * 1024 * 1024;   // a bigger file is not read (and is set aside)
const MAX_WRITE_BYTES = 1024 * 1024;      // finished tasks are dropped, oldest first, until the snapshot fits
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // finished tasks older than this are not brought back
const MAX_TASKS = 100;
const WRITE_DELAY_MS = 500;
const STATUSES = ['queued', 'running', 'waiting_input', 'done', 'failed', 'cancelled', 'interrupted'];
const UNFINISHED = ['queued', 'running', 'waiting_input'];

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

// One task as read from the file, or null if it is not usable. Only known fields survive.
function cleanTask(raw, now, ID_RE) {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id, 12), batchId = str(raw.batchId, 12), deskId = str(raw.deskId, 80), text = str(raw.text, 4000);
  if (!id || !/^t\d{1,9}$/.test(id) || !batchId || !/^b\d{1,9}$/.test(batchId) || !deskId || !/^[A-Za-z0-9][A-Za-z0-9._@-]{0,79}$/.test(deskId) || text === null) return null;
  if (!STATUSES.includes(raw.status)) return null;
  const createdAt = num(raw.createdAt);
  if (createdAt === null) return null;
  const wsRaw = str(raw.workspaceId, 40);
  const workspaceId = wsRaw && ID_RE.test(wsRaw) ? wsRaw : '';
  const task = {
    id, batchId, deskId, text, workspaceId, folder: workspaceId,
    runner: str(raw.runner, 40) || '', status: raw.status, createdAt,
    startedAt: num(raw.startedAt), finishedAt: num(raw.finishedAt),
    exitCode: Number.isInteger(raw.exitCode) ? raw.exitCode : null,
    error: str(raw.error, 80),
  };
  if (UNFINISHED.includes(task.status)) {
    task.status = 'interrupted';
    task.error = 'server dimulai ulang';
    task.finishedAt = now;
  } else if (task.finishedAt === null) task.finishedAt = createdAt;
  return task;
}

function createTaskFile({ file, store, now = () => Date.now(), log = console, workspaceIdRe = /^[a-z0-9][a-z0-9._-]{0,39}$/ }) {
  let timer = null, lastWritten = '', lastWarn = -Infinity;

  const warn = (msg) => { const t = now(); if (t - lastWarn > 60000) { lastWarn = t; log.error('Task file: ' + msg); } };

  function snapshot() {
    const keep = store.tasks.map((t) => ({
      id: t.id, batchId: t.batchId, deskId: t.deskId, text: t.text, workspaceId: t.workspaceId || '', runner: t.runner || '',
      status: t.status, createdAt: t.createdAt, startedAt: t.startedAt ?? null, finishedAt: t.finishedAt ?? null,
      exitCode: t.exitCode ?? null, error: t.error ?? null,
    }));
    let body = JSON.stringify({ v: FILE_VERSION, nextId: store.nextId, nextBatch: store.nextBatch, tasks: keep });
    // over the limit: the oldest finished tasks go first, never one that is still open
    while (Buffer.byteLength(body) > MAX_WRITE_BYTES && keep.some((t) => !UNFINISHED.includes(t.status))) {
      keep.splice(keep.findIndex((t) => !UNFINISHED.includes(t.status)), 1);
      body = JSON.stringify({ v: FILE_VERSION, nextId: store.nextId, nextBatch: store.nextBatch, tasks: keep });
    }
    return body;
  }

  // Write now (nothing is written if nothing changed since the last write). Never throws.
  function flush() {
    clearTimeout(timer);
    timer = null;
    let body;
    try { body = snapshot(); } catch (err) { warn('could not prepare: ' + err.message); return false; }
    if (body === lastWritten) return true;
    const tmp = file + '.' + process.pid + '.tmp';
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, body, { mode: 0o600 });
      fs.renameSync(tmp, file);
      lastWritten = body;
      return true;
    } catch (err) { // a full disk, a locked file, no rights: the server carries on and tries again at the next change
      try { fs.unlinkSync(tmp); } catch { /* nothing to remove */ }
      warn('could not write: ' + (err.code || err.message));
      return false;
    }
  }

  // Called after any change; the write is delayed so a burst of changes is one write.
  function touch() {
    if (timer) return;
    timer = setTimeout(flush, WRITE_DELAY_MS);
    if (timer.unref) timer.unref();
  }

  function setAside(why) {
    warn(why + '; the file is kept as ' + path.basename(file) + '.bad and the task list starts empty');
    try { fs.renameSync(file, file + '.bad'); } catch { /* cannot move it: it will be overwritten */ }
  }

  // Fill the store from the file. Returns how many tasks came back.
  function load() {
    let text;
    try {
      const st = fs.statSync(file);
      if (st.size > MAX_FILE_BYTES) { setAside('file too large'); return 0; }
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') warn('cannot read: ' + err.code);
      return 0;
    }
    let data;
    try { data = JSON.parse(text); } catch { setAside('not valid JSON'); return 0; }
    if (!data || typeof data !== 'object' || !Array.isArray(data.tasks) || data.v !== FILE_VERSION) { setAside('not a task file of this version'); return 0; }
    const t0 = now();
    const out = [];
    const seen = new Set();
    for (const raw of data.tasks) {
      const t = cleanTask(raw, t0, workspaceIdRe);
      if (!t || seen.has(t.id)) continue;
      if (t.finishedAt !== null && t0 - t.finishedAt > MAX_AGE_MS) continue;
      seen.add(t.id);
      out.push(t);
    }
    store.tasks = out.slice(-MAX_TASKS);
    const idNum = (id) => Number(id.slice(1));
    const maxId = store.tasks.reduce((m, t) => Math.max(m, idNum(t.id)), 0);
    const maxBatch = store.tasks.reduce((m, t) => Math.max(m, idNum(t.batchId)), 0);
    const given = (v) => (Number.isInteger(v) && v > 0 && v < 1e9 ? v : 1);
    store.nextId = Math.max(maxId + 1, given(data.nextId));
    store.nextBatch = Math.max(maxBatch + 1, given(data.nextBatch));
    lastWritten = ''; // the interrupted marks are new: write them
    if (store.tasks.some((t) => t.status === 'interrupted')) flush();
    return store.tasks.length;
  }

  return { load, touch, flush, file };
}

module.exports = { createTaskFile, cleanTask, MAX_AGE_MS, MAX_FILE_BYTES, MAX_WRITE_BYTES, MAX_TASKS, WRITE_DELAY_MS };
