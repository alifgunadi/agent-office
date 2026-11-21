'use strict';
// The task list on disk (lib/taskfile.js).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Tasks = require('../public/js/tasks');
const { createTaskFile, cleanTask, MAX_AGE_MS, MAX_FILE_BYTES, MAX_WRITE_BYTES, MAX_TASKS, WRITE_DELAY_MS } = require('../lib/taskfile');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ao-tf-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = () => { const lines = []; return { lines, error: (m) => lines.push(m), log: (m) => lines.push(m) }; };
const fileIn = (dir) => path.join(dir, 'tasks.json');
const mkTask = (n, over = {}) => ({ id: 't' + n, batchId: 'b1', deskId: 'lead-qa', text: 'task ' + n, workspaceId: 'w', folder: 'w', runner: 'claude', status: 'done', createdAt: 1000 + n, startedAt: 1100 + n, finishedAt: 1200 + n, exitCode: 0, error: null, ...over });
const storeWith = (tasks) => ({ tasks, nextId: tasks.length + 1, nextBatch: 2 });
const reload = (file, now, log) => { const store = Tasks.createStore(); const tf = createTaskFile({ file, store, now: () => now, log: log || quiet() }); const n = tf.load(); return { store, tf, n }; };

describe('writing and reading', () => {
  it('a task list comes back as it was written, and nothing else is in the file', () => {
    const file = fileIn(tmp());
    const store = storeWith([mkTask(1), mkTask(2, { status: 'failed', exitCode: 3, error: 'keluar dengan kode 3' })]);
    store.tasks[0].secret = 'not a field';
    const tf = createTaskFile({ file, store, now: () => 5000, log: quiet() });
    assert.equal(tf.flush(), true);
    assert.ok(!fs.readFileSync(file, 'utf8').includes('secret'));
    const back = reload(file, 5000);
    assert.equal(back.n, 2);
    assert.deepEqual(back.store.tasks.map((t) => [t.id, t.status, t.exitCode, t.error, t.text, t.workspaceId, t.runner]), [['t1', 'done', 0, null, 'task 1', 'w', 'claude'], ['t2', 'failed', 3, 'keluar dengan kode 3', 'task 2', 'w', 'claude']]);
    assert.equal(back.store.nextId, 3);
    assert.equal(back.store.nextBatch, 2);
  });

  it('a task that was open comes back "interrupted" with a reason, and counters never reuse an id', () => {
    const file = fileIn(tmp());
    const store = storeWith([mkTask(7, { status: 'running', finishedAt: null }), mkTask(8, { status: 'queued', startedAt: null, finishedAt: null }), mkTask(9, { status: 'waiting_input', finishedAt: null }), mkTask(10)]);
    store.nextId = 3; // a lying counter
    createTaskFile({ file, store, now: () => 1, log: quiet() }).flush();
    const { store: back } = reload(file, 777000);
    assert.deepEqual(back.tasks.map((t) => t.status), ['interrupted', 'interrupted', 'interrupted', 'done']);
    for (const t of back.tasks.slice(0, 3)) { assert.equal(t.error, 'server dimulai ulang'); assert.equal(t.finishedAt, 777000); }
    assert.ok(Tasks.FINISHED.includes('interrupted'), 'the page treats it as finished');
    assert.ok(back.nextId >= 11);
    // the marks are written back too, so a second restart does not interrupt them again with a new time
    const again = reload(file, 999000, quiet());
    assert.equal(again.store.tasks[0].finishedAt, 777000);
  });

  it('writes after a short delay, once for a burst of changes, and a flush writes at once', async () => {
    const file = fileIn(tmp());
    const store = storeWith([mkTask(1)]);
    const tf = createTaskFile({ file, store, log: quiet() });
    tf.touch(); tf.touch(); tf.touch();
    assert.equal(fs.existsSync(file), false);
    await sleep(WRITE_DELAY_MS + 250);
    assert.equal(fs.existsSync(file), true);
    store.tasks.push(mkTask(2));
    tf.touch();
    tf.flush();
    assert.equal(reload(file, 1).n, 2);
  });

  it('does not rewrite a file that has not changed, and leaves no temporary file behind', async () => {
    const dir = tmp(), file = fileIn(dir);
    const tf = createTaskFile({ file, store: storeWith([mkTask(1)]), log: quiet() });
    tf.flush();
    const m1 = fs.statSync(file).mtimeMs;
    await sleep(30);
    tf.flush();
    assert.equal(fs.statSync(file).mtimeMs, m1);
    assert.deepEqual(fs.readdirSync(dir), ['tasks.json']);
  });

  it('the file is for the user only (where the system knows modes)', (t) => {
    if (process.platform === 'win32') return t.skip('modes are not used on Windows');
    const file = fileIn(tmp());
    createTaskFile({ file, store: storeWith([mkTask(1)]), log: quiet() }).flush();
    assert.equal(fs.statSync(file).mode & 0o077, 0);
  });

  it('keeps at most 100 tasks, the newest', () => {
    const file = fileIn(tmp());
    const store = storeWith(Array.from({ length: 130 }, (_, i) => mkTask(i + 1)));
    createTaskFile({ file, store, now: () => 5000, log: quiet() }).flush();
    const { store: back } = reload(file, 5000);
    assert.equal(back.tasks.length, MAX_TASKS);
    assert.equal(back.tasks[back.tasks.length - 1].id, 't130');
  });

  it('finished tasks older than a week are not brought back, but a task that was open is (as interrupted)', () => {
    const file = fileIn(tmp());
    const now = 10 * MAX_AGE_MS;
    const store = storeWith([mkTask(1, { finishedAt: now - MAX_AGE_MS - 1 }), mkTask(2, { finishedAt: now - 1000 }), mkTask(3, { status: 'running', finishedAt: null, createdAt: now - 3 * MAX_AGE_MS })]);
    createTaskFile({ file, store, now: () => now, log: quiet() }).flush();
    assert.deepEqual(reload(file, now).store.tasks.map((t) => t.id), ['t2', 't3']);
  });

  it('the file has a size limit: the oldest finished tasks are dropped first, never an open one', () => {
    const file = fileIn(tmp());
    const big = 'x'.repeat(4000);
    const tasks = Array.from({ length: 100 }, (_, i) => mkTask(i + 1, { text: big }));
    tasks.push(mkTask(101, { status: 'running', finishedAt: null, text: big }));
    // 101 x 4 KB is far below the cap, so make the cap bite with long error fields too
    for (const t of tasks) t.error = 'e'.repeat(80);
    const store = storeWith(tasks);
    createTaskFile({ file, store, now: () => 5000, log: quiet() }).flush();
    assert.ok(fs.statSync(file).size <= MAX_WRITE_BYTES);
    assert.ok(reload(file, 5000).store.tasks.some((t) => t.id === 't101'));
  });
});

describe('a file that cannot be trusted', () => {
  const setAside = (text) => {
    const dir = tmp(), file = fileIn(dir);
    fs.writeFileSync(file, text);
    const log = quiet();
    const { store, n } = reload(file, 1, log);
    return { dir, file, store, n, log };
  };

  it('damaged JSON, the wrong shape or the wrong version: set aside with a warning, the server starts empty', () => {
    for (const text of ['{oops', '[]', '"x"', 'null', '{"v":1}', '{"v":2,"tasks":[]}', '{"v":1,"tasks":"no"}', '']) {
      const r = setAside(text);
      assert.equal(r.n, 0, text);
      assert.equal(r.store.tasks.length, 0);
      assert.ok(r.log.lines.some((l) => /task file/i.test(l)), 'warned: ' + text);
      assert.equal(fs.existsSync(r.file), false, 'moved away: ' + text);
      assert.equal(fs.existsSync(r.file + '.bad'), true, 'kept as .bad: ' + text);
    }
  });

  it('a file over the size limit is not read at all', () => {
    const dir = tmp(), file = fileIn(dir);
    fs.writeFileSync(file, '{"v":1,"tasks":[],"pad":"' + 'x'.repeat(MAX_FILE_BYTES) + '"}');
    const log = quiet();
    const { n } = reload(file, 1, log);
    assert.equal(n, 0);
    assert.equal(fs.existsSync(file + '.bad'), true);
  });

  it('a missing file is simply an empty list, with no warning', () => {
    const log = quiet();
    const { n } = reload(fileIn(tmp()), 1, log);
    assert.equal(n, 0);
    assert.deepEqual(log.lines, []);
  });

  it('every field is checked: bad ids, unknown statuses and fields, huge text, foreign workspace ids, duplicates', () => {
    const good = mkTask(1);
    const file = fileIn(tmp());
    const raw = [
      good,
      { ...good, id: 't1' }, // duplicate
      { ...good, id: '../x' }, { ...good, id: 't1;rm' }, { ...good, id: 't' + '9'.repeat(20) },
      { ...good, id: 't2', batchId: 'x' }, { ...good, id: 't3', deskId: '../../etc' }, { ...good, id: 't4', deskId: '' },
      { ...good, id: 't5', status: 'exploded' }, { ...good, id: 't6', createdAt: -5 }, { ...good, id: 't7', createdAt: 'now' },
      { ...good, id: 't8', text: 5 },
      { ...good, id: 't9', text: 'y'.repeat(9000), workspaceId: 'C:\\Windows', runner: 'r'.repeat(500), exitCode: 'zero', error: 'e'.repeat(500), extra: { a: 1 } },
      null, 5, 'str', [],
    ];
    fs.writeFileSync(file, JSON.stringify({ v: 1, nextId: 'x', tasks: raw }));
    const { store } = reload(file, 5000);
    assert.deepEqual(store.tasks.map((t) => t.id), ['t1', 't9']);
    const t9 = store.tasks[1];
    assert.equal(t9.text.length, 4000);
    assert.equal(t9.workspaceId, '', 'a path is not a workspace id');
    assert.equal(t9.runner.length, 40);
    assert.equal(t9.exitCode, null);
    assert.equal(t9.error.length, 80);
    assert.equal(t9.extra, undefined);
    assert.ok(store.nextId >= 10);
  });

  it('keys that would poison an object are just ignored', () => {
    const file = fileIn(tmp());
    fs.writeFileSync(file, '{"v":1,"tasks":[{"__proto__":{"polluted":1},"id":"t1","batchId":"b1","deskId":"lead-qa","text":"x","status":"done","createdAt":1,"finishedAt":2}],"__proto__":{"polluted":2}}');
    const { store } = reload(file, 5);
    assert.equal(store.tasks.length, 1);
    assert.equal({}.polluted, undefined);
    assert.equal(store.tasks[0].polluted, undefined);
  });

  it('cleanTask refuses what is not an object', () => {
    for (const v of [null, undefined, 5, 'x', []]) assert.equal(cleanTask(v, 1, /^a$/), null);
  });
});

describe('when the disk does not cooperate', () => {
  it('an unwritable place does not throw, warns once, and the next change tries again', () => {
    const dir = tmp();
    const blocker = path.join(dir, 'blocker');
    fs.writeFileSync(blocker, 'x'); // a file where the folder should be
    const log = quiet();
    const store = storeWith([mkTask(1)]);
    let now = 1000;
    const tf = createTaskFile({ file: path.join(blocker, 'tasks.json'), store, now: () => now, log });
    assert.equal(tf.flush(), false);
    assert.equal(tf.flush(), false);
    assert.equal(log.lines.length, 1, 'one warning a minute, not one per attempt');
    now += 61000;
    tf.flush();
    assert.equal(log.lines.length, 2);
    // the problem goes away: the same task list is then written
    fs.rmSync(blocker);
    assert.equal(tf.flush(), true);
    assert.equal(reload(path.join(blocker, 'tasks.json'), 1).n, 1);
  });

  it('a rename that fails leaves the old file in place and no temporary file', () => {
    const dir = tmp(), file = fileIn(dir);
    const store = storeWith([mkTask(1)]);
    const tf = createTaskFile({ file, store, log: quiet() });
    tf.flush();
    store.tasks.push(mkTask(2));
    const real = fs.renameSync;
    fs.renameSync = () => { const e = new Error('disk full'); e.code = 'ENOSPC'; throw e; };
    try { assert.equal(tf.flush(), false); } finally { fs.renameSync = real; }
    assert.equal(reload(file, 1).n, 1, 'the old file is intact');
    assert.deepEqual(fs.readdirSync(dir), ['tasks.json']);
  });

  it('an unreadable file (a folder in its place) is a warning, not a crash', () => {
    const dir = tmp(), file = fileIn(dir);
    fs.mkdirSync(file);
    const log = quiet();
    const { n } = reload(file, 1, log);
    assert.equal(n, 0);
    assert.ok(log.lines.length >= 1);
  });
});
