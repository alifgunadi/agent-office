'use strict';

// ---------- 2D helpers ----------

function rr(x, y, w, h, r, fill) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}

function circle(x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

function limb(x0, y0, x1, y1, w, col) {
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// Canvas shadows ignore the transform, so scale them by the effective pixel ratio (overlay pass only).
function soft(blur, dy, alpha) {
  ctx.shadowColor = 'rgba(31,42,55,' + alpha + ')';
  ctx.shadowBlur = blur * shadowK;
  ctx.shadowOffsetY = dy * shadowK;
}
function noShadow() {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function fitText(text, maxChars, maxW) {
  let a = Array.from(String(text ?? ''));
  if (a.length > maxChars) a = a.slice(0, maxChars - 1).concat('…');
  while (a.length > 2 && ctx.measureText(a.join('')).width > maxW) a.splice(a.length - 2, 2, '…');
  return a.join('');
}

const mixCache = new Map();
// Lighten (f > 0) or darken (f < 0) a #rrggbb colour.
function mix(hex, f) {
  const key = hex + '|' + f;
  let r = mixCache.get(key);
  if (r) return r;
  const n = parseInt(hex.slice(1), 16);
  const to = f < 0 ? 0 : 255, a = Math.abs(f);
  const ch = (v) => Math.round(v + (to - v) * a);
  r = 'rgb(' + ch((n >> 16) & 255) + ',' + ch((n >> 8) & 255) + ',' + ch(n & 255) + ')';
  mixCache.set(key, r);
  return r;
}
