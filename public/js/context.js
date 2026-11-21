'use strict';

// ---------- context from links (Jira, Figma, Penpot) ----------
// Only in real mode: the server reads the links (it holds the tokens, and only talks to the providers' own hosts), the page shows what it
// found as chips under the input and in the "Konteks" tab. A link can be taken off ("Gunakan sebagai URL": it stays in the text and
// nothing is attached). What is attached to a prompt is decided by the server again from the links themselves, not from these chips.

const ctxChipsEl = document.getElementById('context-chips');
const ctxListEl = document.getElementById('context-list');
const ctxEmptyEl = document.getElementById('context-empty');
const ctxTab = document.getElementById('tab-context');
const ctxCountEl = document.getElementById('context-count');
const linkCtx = { items: new Map(), excluded: new Set(), timer: 0, seq: 0 };

const CTX_PROVIDER = { jira: 'Jira', figma: 'Figma', penpot: 'Penpot' };
const CTX_REASON = {
  missing_credentials: 'token belum diatur di server',
  unauthorized: 'token ditolak',
  not_found: 'tidak ditemukan',
  timeout: 'waktu habis',
  too_large: 'jawaban terlalu besar',
  redirect: 'dialihkan (tidak diikuti)',
  blocked_host: 'alamat tidak diizinkan',
  error: 'gagal dibaca',
};

// Links in a text: at most 10, without the punctuation that follows them in a sentence.
function extractUrls(text) {
  const found = [];
  for (const m of String(text).matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
    const url = m[0].replace(/[.,;:!?)\]}]+$/, '');
    if (url.length <= 2000 && !found.includes(url)) found.push(url);
    if (found.length >= 10) break;
  }
  return found;
}

const ctxShown = () => [...linkCtx.items.values()].filter((x) => x.state !== 'unsupported' && !linkCtx.excluded.has(x.url));

function renderContext() {
  const real = realMode();
  ctxTab.hidden = !real;
  const shown = real ? ctxShown() : [];
  ctxChipsEl.hidden = shown.length === 0;
  ctxChipsEl.textContent = '';
  for (const x of shown) {
    const li = document.createElement('li');
    li.className = 'context-chip is-' + x.state;
    const label = document.createElement('span');
    label.className = 'context-label';
    const name = CTX_PROVIDER[x.provider] || x.provider;
    label.textContent = x.state === 'loading' ? name + ' · memuat…' : x.state === 'ok' ? name + ' · ' + (x.title || x.label) : name + ' · ' + (CTX_REASON[x.reason] || 'gagal');
    li.append(label);
    const off = document.createElement('button');
    off.type = 'button';
    off.className = 'context-off';
    off.textContent = 'Gunakan sebagai URL';
    off.setAttribute('aria-label', 'Gunakan sebagai URL saja: ' + name + ' ' + (x.label || ''));
    off.addEventListener('click', () => { linkCtx.excluded.add(x.url); renderContext(); dockInput.focus(); });
    li.append(off);
    ctxChipsEl.append(li);
  }
  // the tab: everything that was recognised in the text, with its details
  ctxListEl.textContent = '';
  for (const x of shown) {
    const li = document.createElement('li');
    li.className = 'context-item is-' + x.state;
    const head = document.createElement('strong');
    head.textContent = (CTX_PROVIDER[x.provider] || x.provider) + ' ' + (x.label || '');
    const line = document.createElement('div');
    line.textContent = x.state === 'ok' ? x.title : x.state === 'loading' ? 'memuat…' : CTX_REASON[x.reason] || 'gagal';
    const meta = document.createElement('small');
    meta.textContent = [x.kind, x.status, x.detail].filter(Boolean).join(' · ');
    const link = document.createElement('small');
    link.className = 'context-url';
    link.textContent = x.url;
    li.append(head, line);
    if (meta.textContent) li.append(meta);
    li.append(link);
    ctxListEl.append(li);
  }
  ctxEmptyEl.hidden = shown.length > 0;
  ctxCountEl.hidden = shown.length === 0;
  ctxCountEl.textContent = String(shown.length);
}

async function refreshContext() {
  if (!realMode()) { linkCtx.items.clear(); linkCtx.excluded.clear(); renderContext(); return; }
  const urls = extractUrls(dockInput.value);
  for (const u of [...linkCtx.items.keys()]) if (!urls.includes(u)) { linkCtx.items.delete(u); linkCtx.excluded.delete(u); } // a link taken out of the text is gone
  const fresh = urls.filter((u) => !linkCtx.items.has(u));
  if (!fresh.length) { renderContext(); return; }
  for (const u of fresh) linkCtx.items.set(u, { url: u, state: 'loading', provider: '', label: '' });
  renderContext();
  const mine = ++linkCtx.seq;
  const r = await api('POST', '/integrations/resolve', { urls: fresh });
  if (mine !== linkCtx.seq) return; // the text changed again: a newer answer is on its way
  const results = r.status === 200 && r.data && Array.isArray(r.data.results) ? r.data.results : null;
  for (const u of fresh) {
    if (!linkCtx.items.has(u)) continue;
    const x = results && results.find((q) => q.url === u);
    if (!x) linkCtx.items.set(u, { url: u, state: 'error', provider: '', label: '', reason: 'error' });
    else if (x.reason === 'unsupported') linkCtx.items.set(u, { url: u, state: 'unsupported' });
    else linkCtx.items.set(u, { ...x, state: x.resolved ? 'ok' : 'error' });
  }
  renderContext();
}

function scheduleContext() {
  clearTimeout(linkCtx.timer);
  if (!realMode()) { if (linkCtx.items.size) refreshContext(); return; }
  linkCtx.timer = setTimeout(refreshContext, 600);
}

// the links the server should attach to the prompt being sent: recognised ones the user did not take off
function contextUrlsToSend() {
  if (!realMode()) return [];
  return extractUrls(dockInput.value).filter((u) => !linkCtx.excluded.has(u) && linkCtx.items.has(u) && linkCtx.items.get(u).state !== 'unsupported');
}

function contextAfterSend() {
  linkCtx.items.clear();
  linkCtx.excluded.clear();
  renderContext();
}

function onContextMode() {
  if (!realMode()) { linkCtx.items.clear(); linkCtx.excluded.clear(); }
  renderContext();
  if (realMode() && extractUrls(dockInput.value).length) scheduleContext();
}
renderContext();
