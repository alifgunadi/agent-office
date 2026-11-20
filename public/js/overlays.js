'use strict';

// ---------- overlays (screen space, crisp css px) ----------

function bubble(text, cx, y, accent, prefix, prefixAlpha, prefixColor) {
  ctx.font = '700 13px ' + FONT;
  const pre = prefix ? prefix + ' ' : '';
  const preW = pre ? ctx.measureText(pre).width : 0;
  const t = fitText(text, MAX_BUBBLE_CHARS, BUBBLE_MAX - 24 - preW);
  const w = Math.ceil(preW + ctx.measureText(t).width) + 24, h = 28;
  const x = cx - w / 2;
  soft(10, 3, 0.22);
  rr(x, y, w, h, 14, '#ffffff');
  ctx.beginPath();
  ctx.moveTo(cx - 6, y + h - 1);
  ctx.lineTo(cx, y + h + 7);
  ctx.lineTo(cx + 6, y + h - 1);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  noShadow();
  rr(x, y, w, h, 14);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const ty = y + h / 2 + 1;
  if (pre) {
    ctx.globalAlpha = prefixAlpha;
    ctx.fillStyle = prefixColor || accent;
    ctx.fillText(pre, x + 12, ty);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#1f2a37';
  ctx.fillText(t, x + 12 + preW, ty);
  return w;
}

// "+N": how many tasks wait behind the one a desk is running, drawn on the corner of its bubble.
function queueBadge(cx, y, bubbleW, deskId) {
  const n = OfficeTasks.counts(taskStore, deskId).queued;
  if (!n) return;
  ctx.font = '800 12px ' + FONT;
  const text = '+' + n, w = Math.ceil(ctx.measureText(text).width) + 14, h = 20;
  const x = cx + bubbleW / 2 - 10, by = y - 9;
  rr(x, by, w, h, 10, '#1f2937');
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, by + h / 2 + 1);
}

// Small label floating above a walking or lounging agent; `by` is the bottom edge.
const overlapsRect = (r, q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y;

function tagRect(role, cx, by) {
  ctx.font = '800 12px ' + FONT;
  const w = Math.ceil(ctx.measureText(role.label).width) + 26, h = 20;
  return { x: cx - w / 2, y: by - h, w, h };
}

function tag(role, cx, by) {
  ctx.font = '800 12px ' + FONT;
  const w = Math.ceil(ctx.measureText(role.label).width) + 26, h = 20;
  soft(6, 2, 0.18);
  rr(cx - w / 2, by - h, w, h, 10, '#ffffff');
  noShadow();
  circle(cx - w / 2 + 10, by - h / 2, 4, role.color);
  ctx.fillStyle = '#1f2a37';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(role.label, cx - w / 2 + 18, by - h / 2 + 1);
}

// Small speech icon above a talking agent.
function speechIcon(cx, y, glyph) {
  ctx.font = '700 14px ' + FONT + FONT_E;
  const w = Math.max(28, Math.ceil(ctx.measureText(glyph).width) + 14), h = 22;
  soft(6, 2, 0.2);
  rr(cx - w / 2, y, w, h, 11, '#ffffff');
  ctx.beginPath();
  ctx.moveTo(cx - 4, y + h - 1); ctx.lineTo(cx, y + h + 5); ctx.lineTo(cx + 4, y + h - 1);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  noShadow();
  ctx.fillStyle = '#1f2a37';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, cx, y + h / 2 + 1);
}
