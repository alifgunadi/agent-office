'use strict';

// ---------- accessibility: agent list and rate-limited announcements ----------

const listEl = document.getElementById('agent-list');
const announceEl = document.getElementById('announce');
const listItems = new Map();
const lastStatus = new Map();
let announceQueue = [], announceTimer = 0, firstState = true;
const ANNOUNCE_MS = 2500;

// Say something once, now (camera changes, and anything else that is not a status change).
function announce(text) {
  announceEl.textContent = text;
}

function agentText(d) {
  const a = agents.get(d.id);
  return roleOf(d.id).label + ': ' + (d.status || 'unknown') + (a && a.loc !== 'at desk' ? ', ' + a.loc : '') + (d.activity ? ' - ' + d.activity : '');
}

function syncAgentList(list) {
  const keep = new Set();
  let prev = null;
  for (const d of list) {
    keep.add(d.id);
    let li = listItems.get(d.id);
    if (!li) {
      li = document.createElement('li');
      li.tabIndex = 0;
      li.dataset.id = d.id;
      li.addEventListener('focus', () => { focusId = li.dataset.id; requestRender(); });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commandForDesk(li.dataset.id); } // the same as clicking that desk
      });
      li.addEventListener('blur', () => { if (focusId === li.dataset.id) focusId = null; requestRender(); });
      listItems.set(d.id, li);
    }
    const txt = agentText(d);
    if (li.textContent !== txt) li.textContent = txt;
    // only move an item when it is out of order, so a focused item keeps focus
    const expected = prev ? prev.nextElementSibling : listEl.firstElementChild;
    if (expected !== li) listEl.insertBefore(li, expected);
    prev = li;
  }
  for (const [id, li] of listItems) {
    if (!keep.has(id)) { li.remove(); listItems.delete(id); if (focusId === id) focusId = null; }
  }
}

function queueAnnouncements(list) {
  const seen = new Set();
  for (const d of list) {
    seen.add(d.id);
    const st = d.status || 'unknown';
    const was = lastStatus.get(d.id);
    lastStatus.set(d.id, st);
    if (!firstState && was !== undefined && was !== st) announceQueue.push(roleOf(d.id).label + ' is ' + st);
  }
  for (const id of lastStatus.keys()) if (!seen.has(id)) lastStatus.delete(id);
  firstState = false;
  if (announceQueue.length && !announceTimer) flushAnnouncements();
}

function flushAnnouncements() {
  announceTimer = 0;
  if (!announceQueue.length) return;
  announceEl.textContent = announceQueue.slice(-3).join('. ');
  announceQueue = [];
  announceTimer = setTimeout(flushAnnouncements, ANNOUNCE_MS);
}
