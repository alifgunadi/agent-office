'use strict';

const connEl = document.getElementById('conn');
const noticeEl = document.getElementById('notice');
const restartBtn = document.getElementById('btn-restart');
const stopBtn = document.getElementById('btn-stop');
let restarting = false;

function setStatus(text, live) {
  connEl.textContent = text;
  connEl.className = live ? 'on' : '';
}

function setButtons(enabled) {
  restartBtn.disabled = !enabled;
  stopBtn.disabled = !enabled;
}

function showNotice(text) {
  noticeEl.textContent = text;
  noticeEl.style.display = text ? 'block' : 'none';
}

async function sendControl(action) {
  setButtons(false);
  try {
    const res = await fetch('/control/' + action, { method: 'POST', headers: { 'X-Agent-Office': '1' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } catch (err) {
    console.error('Control request failed', err);
    showNotice('Failed to ' + action + ' the server.');
    setButtons(true);
    return false;
  }
  return true;
}

const RESTART_POLL_MS = 500;
const RESTART_TIMEOUT_MS = 15000;

restartBtn.addEventListener('click', async () => {
  if (!(await sendControl('restart'))) return;
  restarting = true;
  halted = true;
  source.close();
  setStatus('restarting...', false);
  // Poll until the new server answers, then reload to pick up any new index.html.
  const deadline = Date.now() + RESTART_TIMEOUT_MS;
  await new Promise((r) => setTimeout(r, RESTART_POLL_MS));
  while (Date.now() < deadline) {
    try {
      const res = await fetch('/state', { cache: 'no-store' });
      if (res.ok) return location.reload();
    } catch {
      // Server not up yet.
    }
    await new Promise((r) => setTimeout(r, RESTART_POLL_MS));
  }
  setStatus('offline', false);
  showNotice('Restart did not come back. Run start-office.ps1 or open a new Claude Code session, then reload this page.');
});

stopBtn.addEventListener('click', async () => {
  if (!(await sendControl('stop'))) return;
  halted = true;
  source.close();
  setStatus('stopped', false);
  showNotice('Server stopped. It starts again when you open a new Claude Code session or run start-office.ps1. Then reload this page.');
});

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  if (reduced) requestRender();
});
canvas.addEventListener('pointerleave', () => { mouse = null; if (reduced) requestRender(); });

// Messages are kept and applied once per frame, so a burst of events costs one update.
let pendingData = null;
function applyPending() {
  if (pendingData === null) return;
  const data = pendingData;
  pendingData = null;
  try {
    const state = JSON.parse(data);
    renderLog(Array.isArray(state.log) ? state.log : []);
    desks = orderDesks(state.desks || {});
    deskMap = new Map(desks.map((d) => [d.id, d]));
    // Rebuild the layout only when the set of desks changes; status updates just feed the animation.
    const sig = desks.map((d) => d.id).join('|');
    if (sig !== idSig) { idSig = sig; layoutDirty = true; }
    syncAgents(desks);
    syncAgentList(desks);
    queueAnnouncements(desks);
    updateChrome(desks);
    if (!desks.length) { ariaKey = ''; canvas.setAttribute('aria-label', 'Office floorplan. No agents yet.'); }
    dirty = true;
  } catch (err) {
    console.error('Invalid state message', err);
  }
}

// EventSource retries by itself while it is CONNECTING, but gives up for good (CLOSED) after an HTTP error.
// Then reconnect with a growing delay; the server sends the full state on every new connection.
let source = null, retryMs = 1000, retryTimer = 0, halted = false;
function connect() {
  retryTimer = 0;
  if (halted) return;
  source = new EventSource('/events');
  source.onopen = () => {
    retryMs = 1000;
    setStatus('live', true);
    setButtons(true);
    showNotice('');
  };
  source.onerror = () => {
    if (!restarting && !halted) setStatus('reconnecting...', false);
    setButtons(false);
    if (source && source.readyState === EventSource.CLOSED && !halted && !retryTimer) {
      retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    }
  };
  source.onmessage = (msg) => {
    pendingData = msg.data;
    requestRender();
  };
}
connect();

booted = true;
requestRender();
