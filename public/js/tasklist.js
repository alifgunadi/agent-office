'use strict';

// ---------- the Tasks tab: cards for the tasks of the dock, the filters, and the clock of the simulated runner ----------
// Without a login the tasks are the "Mode simulasi" of the dock: they live only in this page and nothing is executed anywhere.
// In real mode (session.js) the tasks come from the server and this list only shows them; cancel and output go through the server.

const taskStore = OfficeTasks.createStore();
let taskFilter = 'all';
let confirmingCancel = null; // id of the running task whose cancel is being confirmed
let taskSig = '';
const openOutputs = new Set();   // ids of the cards whose output is shown (real mode)
const outputText = new Map();    // id -> the last text fetched

const taskListEl = document.getElementById('task-list');
const tasksEmptyEl = document.getElementById('tasks-empty');
const STATUS_BADGE = {
  queued: ['Antre', 'queued'], running: ['Berjalan', 'running'], waiting_input: ['Butuh Input', 'waiting'],
  done: ['Selesai', 'done'], failed: ['Gagal', 'failed'], cancelled: ['Dibatalkan', 'queued'], interrupted: ['Terputus', 'failed'],
};
const EMPTY_TEXT = {
  all: 'Belum ada tugas aktif. Klik meja agent atau ketik @mention di bawah untuk mulai.',
  active: 'Tidak ada tugas yang sedang berjalan.',
  waiting: 'Tidak ada tugas yang menunggu.',
  done: 'Belum ada tugas yang selesai.',
};

function agoText(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'baru saja';
  const m = Math.floor(s / 60);
  return m < 60 ? m + ' menit lalu' : Math.floor(m / 60) + ' jam lalu';
}

function taskButton(label, action, id, cls) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn--sm ' + (cls || '');
  b.textContent = label;
  b.dataset.action = action;
  b.dataset.id = id;
  return b;
}

function taskCard(t, now) {
  const role = roleOf(t.deskId);
  const li = document.createElement('li');
  li.className = 'task-card';
  li.dataset.id = t.id;
  li.dataset.desk = t.deskId;
  li.dataset.status = t.status;
  li.style.setProperty('--role', role.color);
  const head = document.createElement('div');
  head.className = 'task-head';
  const who = document.createElement('span');
  who.className = 'task-who';
  who.textContent = role.label;
  const [label, kind] = STATUS_BADGE[t.status];
  const badge = document.createElement('span');
  badge.className = 'badge badge--' + kind;
  badge.textContent = label;
  head.append(who, badge);
  const text = document.createElement('p');
  text.className = 'task-text';
  text.textContent = t.text;
  li.append(head, text);
  const meta = document.createElement('p');
  meta.className = 'task-meta';
  if (t.status === 'queued') { const q = OfficeTasks.queuePosition(taskStore, t); meta.textContent = 'Posisi antrean: ' + q.place + ' dari ' + q.of; }
  else if (OfficeTasks.FINISHED.includes(t.status)) meta.textContent = label + ' ' + agoText(now - t.finishedAt) + (t.error ? ' · ' + t.error : '');
  else meta.textContent = t.folder + ' · ' + t.runner;
  li.append(meta);
  if (realMode() && openOutputs.has(t.id)) {
    const pre = document.createElement('pre');
    pre.className = 'task-output';
    pre.tabIndex = 0; // scrollable by keyboard
    pre.setAttribute('aria-label', 'Output tugas');
    pre.textContent = outputText.has(t.id) ? outputText.get(t.id) || '(belum ada output)' : 'Memuat…';
    li.append(pre);
  }
  const actions = document.createElement('div');
  actions.className = 'task-actions';
  if (confirmingCancel === t.id) {
    const ask = document.createElement('span');
    ask.className = 'ask';
    ask.textContent = 'Batalkan tugas yang berjalan?';
    actions.append(ask, taskButton('Tidak', 'keep', t.id, 'btn--secondary'), taskButton('Ya, batalkan', 'confirm-cancel', t.id, 'btn--danger'));
  } else if (t.status === 'waiting_input') {
    actions.append(taskButton('Buka', 'open', t.id, 'btn--secondary'), taskButton('Jawab', 'answer', t.id, 'btn--primary'));
  } else if (t.status === 'queued' || t.status === 'running') {
    if (realMode() && t.status === 'running') actions.append(taskButton(openOutputs.has(t.id) ? 'Sembunyikan output' : 'Output', 'output', t.id, 'btn--secondary'));
    actions.append(taskButton('Batal', 'cancel', t.id, 'btn--cancel'));
  } else if (realMode()) {
    actions.append(taskButton(openOutputs.has(t.id) ? 'Sembunyikan output' : 'Output', 'output', t.id, 'btn--secondary'));
  }
  if (actions.childElementCount) li.append(actions);
  // the desk of a task is highlighted on the floor while the card is pointed at or focused, and the other way round is the desk tooltip
  li.addEventListener('mouseenter', () => { focusId = t.deskId; requestRender(); });
  li.addEventListener('mouseleave', () => { if (focusId === t.deskId) focusId = null; requestRender(); });
  li.addEventListener('focusin', () => { focusId = t.deskId; requestRender(); });
  li.addEventListener('focusout', () => { if (focusId === t.deskId) focusId = null; requestRender(); });
  return li;
}

function renderTasks(force) {
  const now = Date.now();
  const list = OfficeTasks.filterTasks(taskStore, taskFilter);
  // newest first; finished tasks sink below the live ones
  const rank = (t) => (OfficeTasks.FINISHED.includes(t.status) ? 1 : 0);
  const ordered = list.slice().sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt || Number(b.id.slice(1)) - Number(a.id.slice(1)));
  const sig = taskFilter + '|' + confirmingCancel + '|' + [...openOutputs].map((id) => id + ':' + (outputText.get(id) || '').length).join(',') + '|' + ordered.map((t) => t.id + ':' + t.status + ':' + (t.status === 'queued' ? OfficeTasks.queuePosition(taskStore, t).place : '') + ':' + (t.finishedAt ? Math.floor((now - t.finishedAt) / 60000) : '')).join(',');
  if (!force && sig === taskSig) return;
  taskSig = sig;
  // keep the keyboard focus on the same button across the rebuild
  const active = document.activeElement;
  const keep = active && taskListEl.contains(active) && active.dataset.action ? active.dataset.action + '|' + active.dataset.id : null;
  taskListEl.textContent = '';
  for (const t of ordered) taskListEl.append(taskCard(t, now));
  tasksEmptyEl.hidden = ordered.length > 0;
  tasksEmptyEl.textContent = EMPTY_TEXT[taskFilter] || EMPTY_TEXT.all;
  if (keep) {
    const [action, id] = keep.split('|');
    const again = taskListEl.querySelector('[data-action="' + action + '"][data-id="' + id + '"]') || taskListEl.querySelector('.task-card[data-id="' + id + '"] button');
    if (again) again.focus();
  }
  updateChrome(desks);
}

// Something changed in the tasks: redraw the list, the desks (a running task makes its desk work) and the AlifGunadi card.
function tasksChanged() {
  renderTasks(true);
  rebuildDesks();
  requestRender();
}

// Real mode: the output a program printed so far (the server keeps the last 64 KiB). Shown as text, never as markup.
async function fetchOutput(id) {
  try {
    const res = await fetch('/tasks/' + encodeURIComponent(id) + '/output', { cache: 'no-store' });
    outputText.set(id, res.ok ? await res.text() : '(output tidak tersedia)');
  } catch { outputText.set(id, '(server tidak terjangkau)'); }
  renderTasks(false);
}

// An open card follows its task: when the status changed, read the output again.
function refreshOpenOutputs(before) {
  for (const id of openOutputs) {
    const t = taskStore.tasks.find((q) => q.id === id);
    if (!t) { openOutputs.delete(id); outputText.delete(id); } else if (before.get(id) !== t.status) fetchOutput(id);
  }
}

async function cancelReal(t) {
  const r = await api('POST', '/tasks/' + encodeURIComponent(t.id) + '/cancel');
  if (r.status === 401) leaveRealMode();
  else if (r.status === 200) announce('Tugas untuk ' + roleOf(t.deskId).label + ' dibatalkan'); // the card itself changes when the server reports it
  else announce('Tugas tidak bisa dibatalkan');
}

taskListEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-action]');
  if (!b) return;
  const id = b.dataset.id, t = taskStore.tasks.find((q) => q.id === id);
  if (!t) return;
  if (realMode() && ['cancel', 'confirm-cancel', 'output'].includes(b.dataset.action)) {
    if (b.dataset.action === 'output') {
      if (openOutputs.has(id)) { openOutputs.delete(id); outputText.delete(id); renderTasks(true); } else { openOutputs.add(id); renderTasks(true); fetchOutput(id); }
    } else if (b.dataset.action === 'cancel' && t.status === 'running') { confirmingCancel = id; renderTasks(true); }
    else { confirmingCancel = null; cancelReal(t); renderTasks(true); }
    return;
  }
  switch (b.dataset.action) {
    case 'cancel':
      if (t.status === 'queued') { OfficeTasks.cancel(taskStore, id, Date.now()); announce('Tugas untuk ' + roleOf(t.deskId).label + ' dibatalkan'); }
      else confirmingCancel = id; // a running task asks first
      break;
    case 'keep': confirmingCancel = null; break;
    case 'confirm-cancel':
      confirmingCancel = null;
      OfficeTasks.cancel(taskStore, id, Date.now());
      announce('Tugas untuk ' + roleOf(t.deskId).label + ' dibatalkan');
      break;
    case 'answer': if (typeof openDockFor === 'function') openDockFor(t.deskId, id); break;
    case 'open': commandForDesk(t.deskId); break;
    default: break;
  }
  tasksChanged();
});

for (const chip of document.querySelectorAll('.filters .chip')) {
  chip.addEventListener('click', () => { taskFilter = chip.dataset.filter; renderTasks(true); });
}

// The clock of the simulated runner: every half second tasks move on, and the desks follow.
let outputTick = 0;
const STATUS_ANNOUNCE = { done: 'selesai mengerjakan tugasnya', waiting_input: 'butuh input dari Anda' };
setInterval(() => {
  if (document.hidden || !taskStore.tasks.length) return;
  const changed = realMode() ? [] : OfficeTasks.step(taskStore, Date.now()); // the clock is the simulation's; a real task ends when the server says so
  if (realMode() && ++outputTick % 4 === 0) for (const id of openOutputs) { const t = taskStore.tasks.find((q) => q.id === id); if (t && t.status === 'running') fetchOutput(id); }
  for (const t of changed) announce(roleOf(t.deskId).label + ' ' + STATUS_ANNOUNCE[t.status]);
  renderTasks(false);
  rebuildDesks(); // also lets a "done" desk go back to idle
  requestRender();
}, 500);

renderTasks(true);
