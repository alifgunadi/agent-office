// The task model of the prompt dock: tasks per desk, a queue, and a simulated runner. Plain JavaScript usable in the page
// (global OfficeTasks) and in Node (tests). Until the server can run tasks for real, the page runs this model itself:
// the dock says "Mode simulasi" and nothing is executed. A real runner will replace only the simulated steps (`step`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OfficeTasks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_TASKS = 100;       // finished tasks beyond this are dropped, oldest first
  const MAX_DESK_QUEUE = 10;   // waiting tasks per desk
  const RUN_MS = 6000;         // a simulated task runs this long, plus up to RUN_JITTER_MS
  const RUN_JITTER_MS = 5000;
  const ASK_AFTER_MS = 3000;   // a prompt with a question mark stops after this long and asks the user (once)
  const DONE_SHOWN_MS = 8000;  // a desk shows "done" this long after its task finished, then goes back to idle

  const ACTIVE = ['running', 'waiting_input'];
  const FINISHED = ['done', 'failed', 'cancelled'];

  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return Math.abs(h); };

  function createStore() {
    return { tasks: [], nextId: 1, nextBatch: 1 };
  }

  const busy = (store, deskId) => store.tasks.some((t) => t.deskId === deskId && ACTIVE.includes(t.status));
  const queuedFor = (store, deskId) => store.tasks.filter((t) => t.deskId === deskId && t.status === 'queued');

  function start(task, now) {
    task.status = 'running';
    task.startedAt = now;
    task.runMs = RUN_MS + (hash(task.text) % RUN_JITTER_MS);
  }

  // Start queued tasks: one running task per desk (the oldest queued one first), and at most maxRunning in all (oldest first).
  // The simulation has no limit; the server passes its limit on concurrent runners. Returns the tasks that were started.
  function schedule(store, now, maxRunning) {
    const limit = maxRunning === undefined ? Infinity : maxRunning;
    const started = [];
    let running = store.tasks.filter((t) => t.status === 'running').length;
    for (const t of store.tasks) {
      if (running >= limit) break;
      if (t.status !== 'queued' || busy(store, t.deskId)) continue;
      start(t, now);
      started.push(t);
      running++;
    }
    return started;
  }

  // One task per distinct target. A target that is idle starts at once; a busy one queues the task behind its current work.
  // Returns { batchId, tasks, rejected: [{ deskId, reason }] }.
  function enqueue(store, { text, targets, folder, runner, workspaceId }, now, maxRunning) {
    const batchId = 'b' + store.nextBatch++;
    const made = [], rejected = [];
    for (const deskId of [...new Set(targets)]) {
      if (queuedFor(store, deskId).length >= MAX_DESK_QUEUE) { rejected.push({ deskId, reason: 'queue_full' }); continue; }
      const task = { id: 't' + store.nextId++, batchId, deskId, text, folder: folder || '', workspaceId: workspaceId || '', runner: runner || '', status: 'queued', createdAt: now, startedAt: 0, finishedAt: 0, runMs: 0, asked: false, exitCode: null, error: '' };
      store.tasks.push(task);
      made.push(task);
    }
    schedule(store, now, maxRunning);
    prune(store);
    return { batchId, tasks: made, rejected };
  }

  function prune(store) {
    let extra = store.tasks.length - MAX_TASKS;
    for (let i = 0; i < store.tasks.length && extra > 0;) {
      if (FINISHED.includes(store.tasks[i].status)) { store.tasks.splice(i, 1); extra--; } else i++;
    }
  }

  function startNext(store, deskId, now, maxRunning) {
    schedule(store, now, maxRunning);
  }

  // Move the simulation forward. A running task asks a question once if the prompt had a "?", then finishes after its run time.
  function step(store, now) {
    const changed = [];
    for (const t of store.tasks) {
      if (t.status !== 'running') continue;
      const ran = now - t.startedAt;
      if (!t.asked && t.text.includes('?') && ran >= ASK_AFTER_MS) { t.status = 'waiting_input'; t.asked = true; changed.push(t); continue; }
      if (ran >= t.runMs) { t.status = 'done'; t.finishedAt = now; changed.push(t); schedule(store, now); }
    }
    return changed;
  }

  // Cancel a queued, running or waiting task. Returns the previous status, or null if it could not be cancelled.
  function cancel(store, id, now, maxRunning) {
    const t = store.tasks.find((q) => q.id === id);
    if (!t || FINISHED.includes(t.status)) return null;
    const prev = t.status;
    t.status = 'cancelled';
    t.finishedAt = now;
    if (ACTIVE.includes(prev)) schedule(store, now, maxRunning);
    return prev;
  }

  // A real runner reports the end of a task: done or failed (exit code and message are kept), and the next in line starts.
  // Returns the tasks that were started because of it. Does nothing for a task that is already finished (for example cancelled).
  function finish(store, id, status, now, info, maxRunning) {
    const t = store.tasks.find((q) => q.id === id);
    if (!t || FINISHED.includes(t.status) || !FINISHED.includes(status)) return [];
    t.status = status;
    t.finishedAt = now;
    if (info) { if (info.exitCode !== undefined) t.exitCode = info.exitCode; if (info.error) t.error = String(info.error).slice(0, 300); }
    return schedule(store, now, maxRunning);
  }

  // The user answered a task that was waiting for input: it carries on.
  function answer(store, id, now) {
    const t = store.tasks.find((q) => q.id === id);
    if (!t || t.status !== 'waiting_input') return false;
    t.status = 'running';
    t.startedAt = now - Math.min(t.runMs - 1000, ASK_AFTER_MS); // continues from where it asked
    return true;
  }

  function counts(store, deskId) {
    const mine = store.tasks.filter((t) => t.deskId === deskId);
    return {
      running: mine.filter((t) => t.status === 'running').length,
      waiting: mine.filter((t) => t.status === 'waiting_input').length,
      queued: mine.filter((t) => t.status === 'queued').length,
    };
  }

  // The filters of the task list: Aktif = running; Menunggu = queued + waiting for input; Selesai = done + failed + cancelled.
  function filterTasks(store, filter) {
    const pick = {
      all: () => true,
      active: (t) => t.status === 'running',
      waiting: (t) => t.status === 'queued' || t.status === 'waiting_input',
      done: (t) => FINISHED.includes(t.status),
    }[filter] || (() => true);
    return store.tasks.filter(pick);
  }

  // What a desk should show because of the simulated tasks, or null to leave the real status alone.
  // waiting_input beats running beats a recent "done".
  function deskView(store, deskId, now) {
    const mine = store.tasks.filter((t) => t.deskId === deskId);
    const waiting = mine.find((t) => t.status === 'waiting_input');
    if (waiting) return { status: 'waiting', activity: summary(waiting.text) };
    const running = mine.find((t) => t.status === 'running');
    if (running) return { status: 'working', activity: summary(running.text) };
    const done = mine.filter((t) => t.status === 'done' && now - t.finishedAt < DONE_SHOWN_MS).sort((a, b) => b.finishedAt - a.finishedAt)[0];
    if (done) return { status: 'done', activity: summary(done.text) };
    return null;
  }

  function summary(text) {
    const one = String(text).replace(/\s+/g, ' ').trim();
    return one.length > 32 ? one.slice(0, 31) + '…' : one;
  }

  // "Tugas aktif n / m": tasks being worked on (running or waiting) out of all tasks that are not cancelled.
  function load(store) {
    const live = store.tasks.filter((t) => t.status !== 'cancelled');
    return { active: live.filter((t) => ACTIVE.includes(t.status)).length, total: live.length };
  }

  // Place of a queued task in its desk's queue (1-based) and the length of that queue, for "Posisi antrean: 1 dari 2".
  function queuePosition(store, task) {
    const q = queuedFor(store, task.deskId);
    return { place: q.indexOf(task) + 1, of: q.length };
  }

  return Object.freeze({ schedule, finish, MAX_TASKS, MAX_DESK_QUEUE, DONE_SHOWN_MS, ACTIVE, FINISHED, createStore, enqueue, step, cancel, answer, counts, filterTasks, deskView, load, queuePosition, summary });
});
