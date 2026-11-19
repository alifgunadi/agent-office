'use strict';

// ---------- characters (screen space, origin = contact point with floor or seat) ----------

function outline() {
  ctx.lineWidth = 0.9;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(31,42,55,0.3)';
  ctx.stroke();
}

function polyFill(pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function hairShine(hair, cx, cy, r) {
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = mix(hair, 0.4);
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 1.15, Math.PI * 1.5); ctx.stroke();
  ctx.globalAlpha = 1;
}

// hair behind the body (front view)
function hairBackFront(role, hy) {
  const hair = role.hair, hs = role.hs;
  if (hs === 'long' || hs === 'wavy') {
    rr(-10.8, hy - 6, 21.6, 28, 9, hair);
    if (hs === 'wavy') { circle(-10.4, hy + 11, 2.7, hair); circle(10.4, hy + 13, 2.7, hair); circle(-9.6, hy + 17, 2.4, hair); }
  } else if (hs === 'bob') {
    rr(-10.8, hy - 6, 21.6, 17, 8, hair);
  } else if (hs === 'pony') {
    ctx.beginPath(); ctx.ellipse(10.8, hy + 5, 3.3, 8.5, 0.25, 0, TAU); ctx.fillStyle = hair; ctx.fill();
  }
}

// head front: shape, hair, face. hy = head centre.
function headFront(role, hy, o, live, t) {
  const f = role.g === 'f', skin = role.skin, hair = role.hair, hs = role.hs, st = o.status;
  const look = o.look || 0, ex = look * 1.8, ink = '#1f2937';
  rr(-3.2, hy + 6.5, 6.4, 7, 2, mix(skin, -0.12)); // neck
  circle(-8.5, hy + 1.6, 1.8, mix(skin, -0.06)); circle(8.5, hy + 1.6, 1.8, mix(skin, -0.06));
  if (f) { ctx.beginPath(); ctx.ellipse(0, hy + 0.3, 8.2, 9.7, 0, 0, TAU); ctx.fillStyle = skin; ctx.fill(); }
  else rr(-8.7, hy - 9, 17.4, 19, 7.6, skin);
  outline();
  if (role.stubble) {
    ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.ellipse(0, hy + 0.5, 8.3, 9.2, 0, 0.12 * Math.PI, 0.88 * Math.PI); ctx.closePath();
    ctx.fillStyle = '#3b2a20'; ctx.fill();
    ctx.globalAlpha = 1;
  }
  // hair cap with hairline
  ctx.beginPath();
  ctx.moveTo(-10.4, hy + 0.5);
  ctx.arc(0, hy, 10.4, Math.PI, TAU);
  ctx.lineTo(10.4, hy + 0.5);
  ctx.quadraticCurveTo(7.5, hy - 4.5, hs === 'side' ? 3 : 0, hy - 6.4);
  ctx.quadraticCurveTo(-7.5, hy - 4.5, -10.4, hy + 0.5);
  ctx.closePath();
  ctx.fillStyle = hair; ctx.fill();
  const sweep = () => {
    ctx.beginPath();
    ctx.moveTo(-5, hy - 9.8); ctx.quadraticCurveTo(4, hy - 10, 10, hy - 2); ctx.lineTo(10.2, hy + 0.5);
    ctx.quadraticCurveTo(6, hy - 4, -1, hy - 5.6); ctx.closePath();
    ctx.fillStyle = hair; ctx.fill();
  };
  if (hs === 'side') {
    sweep();
    ctx.strokeStyle = mix(hair, 0.4); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-4, hy - 10); ctx.lineTo(-2.6, hy - 6.8); ctx.stroke();
  } else if (hs === 'quiff') {
    ctx.beginPath(); ctx.ellipse(2, hy - 10.8, 7, 3.8, -0.15, 0, TAU); ctx.fillStyle = hair; ctx.fill();
  } else if (hs === 'undercut') {
    ctx.beginPath(); ctx.ellipse(0, hy - 9.2, 8.4, 4.2, 0, 0, TAU); ctx.fillStyle = hair; ctx.fill();
    rr(-10.4, hy - 3, 3, 7, 1.5, mix(hair, 0.25)); rr(7.4, hy - 3, 3, 7, 1.5, mix(hair, 0.25));
  } else if (hs === 'wave') {
    circle(-4.6, hy - 7, 2.7, hair); circle(0.6, hy - 7.8, 2.9, hair); circle(5.6, hy - 6.2, 2.5, hair);
  } else if (hs === 'long' || hs === 'wavy') {
    rr(-10.8, hy - 5.5, 4.6, 17, 2.3, hair); rr(6.2, hy - 5.5, 4.6, 17, 2.3, hair);
    if (hs === 'wavy') { circle(-8.6, hy + 11.5, 2.5, hair); circle(8.6, hy + 11.5, 2.5, hair); }
    ctx.strokeStyle = mix(hair, 0.35); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, hy - 10); ctx.lineTo(0, hy - 6.4); ctx.stroke();
  } else if (hs === 'bob') {
    rr(-11, hy - 5.5, 5, 13.5, 3, hair); rr(6, hy - 5.5, 5, 13.5, 3, hair);
    sweep();
  } else if (hs === 'pony') {
    circle(8.8, hy - 3.4, 1.7, role.color);
  } else if (hs === 'bun') {
    circle(0, hy - 12.2, 4.4, hair);
    ctx.globalAlpha = 0.5; circle(-1, hy - 13.4, 1.5, mix(hair, 0.45)); ctx.globalAlpha = 1;
  }
  hairShine(hair, 0, hy, 8.2);
  // brows
  ctx.strokeStyle = mix(hair, -0.15); ctx.lineCap = 'round'; ctx.lineWidth = f ? 1 : 1.7;
  const bx = ex * 0.5;
  ctx.beginPath();
  if (f) {
    ctx.moveTo(-6.6 + bx, hy - 2.6); ctx.quadraticCurveTo(-4.4 + bx, hy - 4.4, -2.2 + bx, hy - 3);
    ctx.moveTo(2.2 + bx, hy - 3); ctx.quadraticCurveTo(4.4 + bx, hy - 4.4, 6.6 + bx, hy - 2.6);
  } else {
    ctx.moveTo(-6.8 + bx, hy - 2.8); ctx.lineTo(-2.2 + bx, hy - 3.7);
    ctx.moveTo(2.2 + bx, hy - 3.7); ctx.lineTo(6.8 + bx, hy - 2.8);
  }
  ctx.stroke();
  // eyes
  if (o.sleepy) {
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-6, hy + 1.5); ctx.lineTo(-2, hy + 1.5); ctx.moveTo(2, hy + 1.5); ctx.lineTo(6, hy + 1.5); ctx.stroke();
  } else if (o.laugh && live) {
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-3.9 + ex, hy + 1.6, 2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(3.9 + ex, hy + 1.6, 2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  } else {
    for (const sx of [-1, 1]) {
      const x = sx * 3.9 + ex;
      ctx.beginPath(); ctx.ellipse(x, hy + 1.1, f ? 2.1 : 1.9, f ? 2.4 : 2.1, 0, 0, TAU); ctx.fillStyle = ink; ctx.fill();
      circle(x + 0.7, hy + 0.3, 0.8, '#ffffff');
      if (f) { ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x + sx * 1.8, hy - 0.4); ctx.lineTo(x + sx * 3.3, hy - 1.7); ctx.stroke(); }
    }
  }
  if (role.glasses) {
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1.1;
    rr(-7.6 + ex, hy - 1.5, 6.8, 5.2, 2); ctx.stroke();
    rr(0.8 + ex, hy - 1.5, 6.8, 5.2, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.8 + ex, hy + 0.8); ctx.lineTo(0.8 + ex, hy + 0.8); ctx.stroke();
  }
  // nose, blush
  ctx.strokeStyle = mix(skin, -0.25); ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(0.3, hy + 2.6); ctx.lineTo(0.9, hy + 4.4); ctx.lineTo(-0.2, hy + 4.6); ctx.stroke();
  if (f) { circle(-5.8 + bx, hy + 4.8, 2, 'rgba(240,100,125,0.28)'); circle(5.8 + bx, hy + 4.8, 2, 'rgba(240,100,125,0.28)'); }
  // mouth
  const lip = f ? '#d4506b' : '#8a4b3a';
  if (st === 'waiting') {
    ctx.beginPath(); ctx.ellipse(0, hy + 6.7, 2, 1.7, 0, 0, TAU); ctx.fillStyle = '#9b2c2c'; ctx.fill();
  } else if (o.laugh && live) {
    ctx.beginPath(); ctx.ellipse(bx, hy + 6.4, 2.8, 2.4, 0, 0, TAU); ctx.fillStyle = '#7c2d12'; ctx.fill();
  } else if (o.speak && live && Math.sin(t / 180 + o.seed) > 0.2) {
    ctx.beginPath(); ctx.ellipse(bx, hy + 6.3, 2.2, 1.8, 0, 0, TAU); ctx.fillStyle = f ? '#a8324d' : '#7c2d12'; ctx.fill();
  } else {
    ctx.strokeStyle = lip; ctx.lineWidth = f ? 1.9 : 1.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(bx, hy + 4.4, 3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  if (st === 'working') {
    ctx.globalAlpha = 0.14 + (live ? 0.07 * Math.sin(t / 120) : 0);
    ctx.beginPath(); ctx.ellipse(0, hy + 0.3, 8.4, 9.7, 0, 0, TAU); ctx.fillStyle = STATUS_COLOR.working; ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// head seen from behind: hair covers everything
function headBack(role, hy) {
  const f = role.g === 'f', hair = role.hair, hs = role.hs;
  rr(-3.2, hy + 6.5, 6.4, 7, 2, mix(role.skin, -0.12));
  circle(-8.5, hy + 1.6, 1.8, role.skin); circle(8.5, hy + 1.6, 1.8, role.skin);
  if (f) { ctx.beginPath(); ctx.ellipse(0, hy + 0.3, 8.8, 9.9, 0, 0, TAU); ctx.fillStyle = hair; ctx.fill(); }
  else rr(-9, hy - 9.4, 18, 19.4, 8, hair);
  if (hs === 'undercut') { rr(-9, hy + 1, 18, 8, 4, mix(hair, 0.25)); ctx.beginPath(); ctx.ellipse(0, hy - 6.5, 8.6, 4.6, 0, 0, TAU); ctx.fillStyle = hair; ctx.fill(); }
  else if (hs === 'quiff') { ctx.beginPath(); ctx.ellipse(1.5, hy - 10.4, 7, 3.4, 0, 0, TAU); ctx.fillStyle = hair; ctx.fill(); }
  else if (hs === 'wave') { circle(-4.6, hy - 9, 2.6, hair); circle(0.6, hy - 9.8, 2.8, hair); circle(5.6, hy - 8.4, 2.4, hair); }
  else if (hs === 'bun') { circle(0, hy - 11.8, 4.4, hair); }
  else if (hs === 'pony') { ctx.beginPath(); ctx.ellipse(0, hy + 11, 3.4, 9, 0, 0, TAU); ctx.fillStyle = hair; ctx.fill(); circle(0, hy + 2.5, 1.8, role.color); }
  hairShine(hair, 0, hy, 8.4);
}

// long hair falling over the back when seen from behind (drawn after the torso)
function hairOverBack(role, hy) {
  const hs = role.hs, hair = role.hair;
  if (hs === 'long' || hs === 'wavy') {
    rr(-10.8, hy - 6, 21.6, 28, 9, hair);
    if (hs === 'wavy') { circle(-8.4, hy + 21, 2.6, hair); circle(8.4, hy + 21, 2.6, hair); }
    hairShine(hair, 0, hy + 4, 8.4);
  } else if (hs === 'bob') {
    rr(-10.8, hy - 6, 21.6, 17, 8, hair);
  }
}

function torsoFront(role, tt) {
  const f = role.g === 'f', col = role.color, dk = mix(col, -0.3), oc = role.outfit;
  if (f) {
    ctx.beginPath();
    ctx.moveTo(-10.5, tt + 4); ctx.quadraticCurveTo(-10.9, tt, -7, tt); ctx.lineTo(7, tt); ctx.quadraticCurveTo(10.9, tt, 10.5, tt + 4);
    ctx.lineTo(8.7, tt + 21); ctx.lineTo(-8.7, tt + 21); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  } else {
    rr(-11, tt, 22, 21, 6, col);
  }
  outline();
  if (oc === 'tie') {
    polyFill([[-5.2, tt - 0.5], [0, tt + 6.8], [5.2, tt - 0.5]], '#f8fafc');
    polyFill([[-1.6, tt + 3.2], [1.6, tt + 3.2], [2.2, tt + 13], [0, tt + 15.4], [-2.2, tt + 13]], mix(col, -0.5));
  } else if (oc === 'polo') {
    rr(-5.6, tt - 1, 5.2, 3.6, 1.2, mix(col, 0.3)); rr(0.4, tt - 1, 5.2, 3.6, 1.2, mix(col, 0.3));
    ctx.strokeStyle = dk; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, tt + 2), ctx.lineTo(0, tt + 9); ctx.stroke();
    circle(0, tt + 4.5, 0.7, dk); circle(0, tt + 7.2, 0.7, dk);
  } else if (oc === 'blazer') {
    polyFill([[-4.4, tt], [4.4, tt], [0, tt + 9.5]], f ? mix(role.skin, -0.02) : '#f8fafc');
    if (f) polyFill([[-3, tt + 4], [3, tt + 4], [0, tt + 9.5]], '#f8fafc');
    polyFill([[-4.6, tt], [0, tt + 9.5], [-4.8, tt + 15.5], [-8.2, tt + 3.6]], dk);
    polyFill([[4.6, tt], [0, tt + 9.5], [4.8, tt + 15.5], [8.2, tt + 3.6]], dk);
    circle(0, tt + 14, 0.8, '#f8fafc');
  } else if (oc === 'blouse') {
    ctx.beginPath(); ctx.ellipse(0, tt + 0.4, 4.6, 3.8, 0, 0, Math.PI); ctx.fillStyle = role.skin; ctx.fill();
    ctx.strokeStyle = mix(col, 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, tt + 0.4, 4.6, 3.8, 0, 0, Math.PI); ctx.stroke();
  } else if (oc === 'dress') {
    ctx.beginPath(); ctx.ellipse(0, tt + 0.4, 5.2, 4.4, 0, 0, Math.PI); ctx.fillStyle = role.skin; ctx.fill();
    rr(-9, tt + 13, 18, 2.6, 1, dk);
  }
}

function drawChar(role, X, Y, o, a) {
  const k = o.k, t = o.t, live = !reduced, skin = role.skin, hair = role.hair, col = role.color;
  const f = role.g === 'f';
  const pants = f ? (role.outfit === 'blazer' ? '#4b5563' : mix(skin, -0.04)) : (role.pants || '#374151');
  const skirt = mix(col, -0.28), shoe = f ? '#3f1d2b' : '#1f2937';
  const armW = f ? 4.2 : 5;
  let top;
  ctx.save();
  ctx.translate(X, Y);
  ctx.scale(o.flip ? -k : k, k);
  if (o.pose === 'walk' || o.side) {
    // profile view: walking, or standing still while talking face to face
    const still = o.pose !== 'walk';
    const sw = still ? 0 : Math.sin(o.ph), cw = still ? 0 : Math.cos(o.ph), sp = still ? 3 : 0;
    const lb = o.laugh && live ? Math.sin(t / 55) * 1.2 : 0;
    const bob = -Math.abs(cw) * 2.4 + lb + (still && live ? Math.sin(t / 700 + o.seed) * 0.6 : 0);
    const hip = -13 + bob, sh = -30 + bob, hs = role.hs;
    const nfx = sw * 7 + sp, nfy = -Math.max(0, cw) * 3.5, ffx = -sw * 7 - sp, ffy = -Math.max(0, -cw) * 3.5;
    const hyc = -43 + bob;
    ctx.fillStyle = 'rgba(31,42,55,0.18)';
    ctx.beginPath(); ctx.ellipse(0, 1, 11, 4, 0, 0, TAU); ctx.fill();
    limb(0, sh, sw * 6, sh + 11, armW, mix(col, -0.3));
    circle(sw * 6, sh + 11.5, 2.6, skin);
    limb(0, hip, ffx, ffy, 6, f ? mix(pants, -0.15) : '#2b3441');
    circle(ffx + 1.5, ffy, 3.2, shoe);
    // hair behind the head
    if (f) {
      if (hs === 'long' || hs === 'wavy') { rr(-11.5, hyc - 9, 13, 27, 6, hair); if (hs === 'wavy') { circle(-10, hyc + 16, 2.6, hair); circle(-5, hyc + 18, 2.4, hair); } }
      else if (hs === 'bob') rr(-11.5, hyc - 9, 13, 17, 6, hair);
      else if (hs === 'pony') {
        const swing = still ? 0 : sw * 2;
        ctx.beginPath(); ctx.ellipse(-11 + swing, hyc + 1, 3.3, 8.4, 0.35 + sw * 0.15, 0, TAU); ctx.fillStyle = hair; ctx.fill();
      } else if (hs === 'bun') circle(-5, hyc - 9.6, 4.4, hair);
    } else {
      rr(-9.5, hyc - 7, 6, 10, 3, hair);
    }
    torsoSide: {
      rr(-7, -33 + bob, 14, 21, 6, col);
      outline();
      const tt = -33 + bob;
      if (role.outfit === 'tie') polyFill([[5, tt + 3], [7, tt + 3.5], [6.6, tt + 14], [5.2, tt + 15]], mix(col, -0.5));
      else if (role.outfit === 'blazer') polyFill([[3.2, tt], [7, tt + 2], [7, tt + 17], [4.4, tt + 12]], mix(col, -0.3));
      else if (role.outfit === 'polo') rr(2.4, tt - 1, 5, 3.2, 1.2, mix(col, 0.3));
      else if (role.outfit === 'dress') rr(-7, tt + 13, 14, 2.4, 1, mix(col, -0.3));
    }
    if (f) polyFill([[-7.2, hip - 2], [7.2, hip - 2], [9.2, hip + 7], [-9.2, hip + 7]], skirt);
    // neck and head
    rr(-2, hyc + 7, 5, 6, 2, mix(skin, -0.12));
    ctx.beginPath(); ctx.ellipse(1.5, hyc, 8.6, 9.7, 0, 0, TAU); ctx.fillStyle = skin; ctx.fill(); outline();
    circle(10.1, hyc + 1.6, 1.5, skin);
    circle(0.4, hyc + 0.8, 1.6, mix(skin, -0.12));
    if (role.stubble) {
      ctx.globalAlpha = 0.22; ctx.beginPath(); ctx.ellipse(1.5, hyc + 0.5, 8.6, 9.3, 0, 0.1 * Math.PI, 0.75 * Math.PI); ctx.closePath(); ctx.fillStyle = '#3b2a20'; ctx.fill(); ctx.globalAlpha = 1;
    }
    // hair on top
    ctx.beginPath(); ctx.moveTo(-8.4, hyc + 0.5); ctx.arc(1.5, hyc - 1.5, 10.2, Math.PI * 0.97, TAU); ctx.lineTo(11.4, hyc - 2); ctx.quadraticCurveTo(7, hyc - 5.4, 2, hyc - 4.8); ctx.quadraticCurveTo(-3, hyc - 3, -4.5, hyc + 1.5); ctx.closePath();
    ctx.fillStyle = hair; ctx.fill();
    if (hs === 'quiff') { ctx.beginPath(); ctx.ellipse(6.6, hyc - 10.6, 5.2, 3, -0.3, 0, TAU); ctx.fill(); }
    else if (hs === 'undercut') { ctx.beginPath(); ctx.ellipse(2.6, hyc - 9.6, 7, 3.2, 0, 0, TAU); ctx.fill(); }
    else if (hs === 'wave') { circle(6.2, hyc - 6.8, 2.5, hair); circle(2, hyc - 9, 2.7, hair); }
    else if (hs === 'side') { ctx.beginPath(); ctx.ellipse(7, hyc - 7.2, 4.4, 2.3, -0.3, 0, TAU); ctx.fill(); }
    else if (f && hs !== 'bun' && hs !== 'pony') { rr(-5.4, hyc - 5.5, 6, 13, 3, hair); ctx.beginPath(); ctx.ellipse(6.4, hyc - 7, 4.4, 2.2, -0.25, 0, TAU); ctx.fill(); }
    else if (f) { rr(-5.4, hyc - 5.5, 5, 8, 2.5, hair); ctx.beginPath(); ctx.ellipse(6.4, hyc - 7, 4.2, 2.1, -0.25, 0, TAU); ctx.fill(); }
    hairShine(hair, 1.5, hyc - 1.5, 8.4);
    // face
    const ey = hyc + 0.2;
    ctx.strokeStyle = mix(hair, -0.15); ctx.lineWidth = f ? 1 : 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(3.8, ey - 3.2); ctx.lineTo(8, ey - 3); ctx.stroke();
    if (o.laugh && live) {
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(6.2, ey + 0.4, 1.9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(6.2, ey, f ? 1.6 : 1.5, f ? 2.1 : 1.9, 0, 0, TAU); ctx.fillStyle = '#1f2937'; ctx.fill();
      circle(6.7, ey - 0.7, 0.7, '#ffffff');
      if (f) { ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(7.6, ey - 1.4); ctx.lineTo(9, ey - 2.6); ctx.stroke(); }
    }
    if (f) circle(5.2, ey + 4.2, 1.9, 'rgba(240,100,125,0.28)');
    if (role.glasses) { ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(6.4, ey + 0.2, 3, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(3.4, ey); ctx.lineTo(-0.5, ey - 0.4); ctx.stroke(); }
    if ((o.speak || o.laugh) && live && Math.sin(t / 180 + o.seed) > 0.1) {
      ctx.beginPath(); ctx.ellipse(8.4, ey + 5.6, 1.6, 1.5, 0, 0, TAU); ctx.fillStyle = f ? '#a8324d' : '#7c2d12'; ctx.fill();
    } else {
      ctx.strokeStyle = f ? '#d4506b' : '#8a4b3a'; ctx.lineWidth = f ? 1.6 : 1.2; ctx.beginPath(); ctx.arc(7.2, ey + 4.4, 2, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }
    // legs (near), then arm
    limb(0, hip, nfx, nfy, 6, f ? pants : pants);
    circle(nfx + 1.5, nfy, 3.2, shoe);
    let nx = -sw * 6, ny = sh + 11;
    if (still && o.speak && live) { const g = Math.sin(t / 230 + o.seed) * 3; nx = 7 + g; ny = sh + 6 - Math.abs(g); }
    limb(0, sh, nx, ny, armW, col);
    circle(nx, ny + 0.5, 2.6, skin);
    top = -54 + bob;
  } else {
    const sit = o.pose === 'sit', back = o.face === 'back';
    const lb = o.laugh && live ? Math.sin(t / 55) * 1.3 : 0;
    const nod = o.nod && live ? Math.max(0, Math.sin(t / 150)) * 1.6 : 0;
    const br = (live ? Math.sin(t / 650 + o.seed) * 0.9 : 0) + lb;
    const b = sit ? 0 : -13;
    const tt = b - 22 + br, hy = b - 32 + br + nod;
    if (!sit) {
      ctx.fillStyle = 'rgba(31,42,55,0.18)';
      ctx.beginPath(); ctx.ellipse(0, 1, 12, 4.5, 0, 0, TAU); ctx.fill();
    }
    const thigh = f ? skirt : pants;
    if (sit) {
      rr(-10, -3, 8, 8, 3, thigh); rr(2, -3, 8, 8, 3, thigh);
      rr(-10, 4, 7, 8, 3, pants); rr(3, 4, 7, 8, 3, pants);
      rr(-11, 11, 9, 3.5, 1.7, shoe); rr(2, 11, 9, 3.5, 1.7, shoe);
    } else {
      rr(-9, -13, 7, 11, 3, pants); rr(2, -13, 7, 11, 3, pants);
      rr(-10, -3, 9, 3.5, 1.7, shoe); rr(1, -3, 9, 3.5, 1.7, shoe);
      if (f) polyFill([[-9.6, b - 4], [9.6, b - 4], [11.8, b + 6], [-11.8, b + 6]], skirt);
    }
    if (o.speak && o.look) ctx.translate(o.look * 1.6, 0); // speaker leans toward the listener
    if (!back) hairBackFront(role, hy);
    torsoFront(role, tt);
    // arms
    let lh = sit ? [-12, -6] : [-14, b - 3], rh = sit ? [12, -6] : [14, b - 3], mug = null, sip = 0;
    if (o.anim === 'type') {
      const ty = live ? Math.floor(t / 140 + o.seed) % 2 : 0;
      lh = [-8, -8 + (ty ? 1.5 : 0)]; rh = [8, -8 + (ty ? 0 : 1.5)];
    } else if (o.anim === 'coffee') {
      const c = live ? (t / 1000 + o.seed) % 12 : 9;
      if (c < 2.4) {
        rh = [10, tt + 3 + (live ? Math.sin(t / 120) * 0.8 : 0)]; // pressing the machine button
      } else {
        sip = (c > 5 && c < 7) ? Math.sin((c - 5) / 2 * Math.PI) : 0;
        rh = [9 - 3 * sip, tt + 16 - 13 * sip];
        mug = rh;
      }
    } else if (o.anim === 'stretch') {
      const c = live ? (t / 1000 + o.seed * 1.3) % 12 : 99;
      const u = c < 1.8 ? Math.sin(c / 1.8 * Math.PI) : 0;
      lh = [-14 + 5 * u, b - 3 + (tt - 17 - (b - 3)) * u];
      rh = [14 - 5 * u, lh[1]];
    } else if (o.anim === 'chat') {
      const g = live ? Math.sin(t / 260 + o.seed) * 3 : 0;
      rh = [14 + g, tt + 13 - Math.abs(g)];
    }
    limb(-11, tt + 5, lh[0], lh[1], armW, col); circle(lh[0], lh[1], 2.8, skin);
    limb(11, tt + 5, rh[0], rh[1], armW, col); circle(rh[0], rh[1], 2.8, skin);
    if (mug) {
      rr(mug[0] - 3.5, mug[1] - 8, 7, 8, 2, '#ffffff');
      rr(mug[0] - 3.5, mug[1] - 8, 7, 2.5, 1, '#6b4a35');
      if (live && !sip) {
        ctx.strokeStyle = 'rgba(100,116,139,0.55)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
          const ph = (t / 900 + i * 0.5 + o.seed) % 1;
          ctx.globalAlpha = 1 - ph;
          ctx.beginPath(); ctx.moveTo(mug[0] - 1.5 + i * 3, mug[1] - 10 - ph * 8); ctx.lineTo(mug[0] - 0.5 + i * 3, mug[1] - 13 - ph * 8); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    if (back) { headBack(role, hy); hairOverBack(role, hy); }
    else headFront(role, hy, o, live, t);
    top = hy - 11;
  }
  ctx.restore();
  a.hx = X;
  a.hy = Y + top * k;
  a.fy = Y;
  const hw = Math.max(14, 16 * k * sc);
  a.hitR = { x: X * sc - hw, y: a.hy * sc - 3, w: hw * 2, h: Math.max(20, (Y - a.hy) * sc + 8) };
}
