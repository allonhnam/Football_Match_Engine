import * as E from '@/engine/engine';
import { lastName, textOn } from '@/lib/util';


export function drawPitch(ctx, Wc, Hc, m, alpha, opts, col, flash, cam) {
  const M = 4, s0 = Math.min(Wc / (105 + 2 * M), Hc / (68 + 2 * M));
  let s = s0, X, Y;
  const lerp = (a, b) => a + (b - a) * alpha;
  if (opts.follow && m) {
    s = s0 * 1.75; const hw = Wc / 2 / s, hh = Hc / 2 / s;
    const tx = Math.max(-M + hw, Math.min(105 + M - hw, lerp(m.ball.px, m.ball.x))), ty = Math.max(-M + hh, Math.min(68 + M - hh, lerp(m.ball.py, m.ball.y)));
    cam.cx = cam.cx == null ? tx : cam.cx + (tx - cam.cx) * 0.08; cam.cy = cam.cy == null ? ty : cam.cy + (ty - cam.cy) * 0.08;
    X = x => Wc / 2 + (x - cam.cx) * s; Y = y => Hc / 2 + (y - cam.cy) * s;
  } else { cam.cx = null; cam.cy = null; const ox = (Wc - (105 + 2 * M) * s) / 2, oy = (Hc - (68 + 2 * M) * s) / 2; X = x => ox + (x + M) * s; Y = y => oy + (y + M) * s; }
  ctx.clearRect(0, 0, Wc, Hc);
  ctx.fillStyle = col.pa; ctx.fillRect(0, 0, Wc, Hc);
  const bands = 18, bw = (105 + 2 * M) / bands; ctx.fillStyle = col.pb;
  for (let i = -6; i < bands + 6; i += 2) ctx.fillRect(X(-M + i * bw), 0, bw * s, Hc);
  ctx.strokeStyle = col.line; ctx.lineWidth = Math.max(1.3, s * 0.13);
  ctx.strokeRect(X(0), Y(0), 105 * s, 68 * s);
  ctx.beginPath(); ctx.moveTo(X(52.5), Y(0)); ctx.lineTo(X(52.5), Y(68)); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(52.5), Y(34), 9.15 * s, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = col.line; const spot = (x, y) => { ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(1.6, s * 0.22), 0, Math.PI * 2); ctx.fill(); };
  spot(52.5, 34); spot(11, 34); spot(94, 34);
  for (const e of [0, 1]) {
    ctx.strokeRect(X(e ? 105 - 16.5 : 0), Y(34 - 20.16), 16.5 * s, 40.32 * s);
    ctx.strokeRect(X(e ? 105 - 5.5 : 0), Y(34 - 9.16), 5.5 * s, 18.32 * s);
    const a = Math.acos((16.5 - 11) / 9.15); ctx.beginPath(); if (e) ctx.arc(X(94), Y(34), 9.15 * s, Math.PI - a, Math.PI + a); else ctx.arc(X(11), Y(34), 9.15 * s, -a, a); ctx.stroke();
    const gx = e ? X(105) : X(-2); ctx.save(); ctx.strokeRect(gx, Y(34 - 3.66), 2 * s, 7.32 * s); ctx.globalAlpha = 0.3; ctx.lineWidth = 0.8;
    for (let k = 1; k < 7; k++) { const yy = Y(34 - 3.66) + k * 7.32 * s / 7; ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx + 2 * s, yy); ctx.stroke(); }
    for (let k = 1; k < 3; k++) { const xx = gx + k * 2 * s / 3; ctx.beginPath(); ctx.moveTo(xx, Y(34 - 3.66)); ctx.lineTo(xx, Y(34 + 3.66)); ctx.stroke(); }
    ctx.restore(); ctx.lineWidth = Math.max(1.3, s * 0.13);
  }
  for (const [cx, cy, a0] of [[0, 0, 0], [105, 0, Math.PI / 2], [105, 68, Math.PI], [0, 68, Math.PI * 1.5]]) { ctx.beginPath(); ctx.arc(X(cx), Y(cy), s, a0, a0 + Math.PI / 2); ctx.stroke(); }
  if (!m) return;
  if (opts.shape) {
    for (const side of [0, 1]) { const f = E.FORMATIONS[m.teams[side].formation];
      for (const role of ['DF', 'MF', 'FW']) {
        const ps = m.players.filter(q => q.onPitch && q.side === side && f[q.slot] && f[q.slot][0] === role).sort((a, b) => a.y - b.y); if (ps.length < 2) continue;
        ctx.beginPath(); ps.forEach((q, i) => { const x = X(lerp(q.px, q.x)), y = Y(lerp(q.py, q.y)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.strokeStyle = m.teams[side].color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      } }
  }
  const b = m.ball, owner = b.owner >= 0 ? m.players[b.owner] : null;
  const r = Math.max(8, s * 0.95);
  const now = m.clockSec();

  // Ball in flight: a shot traces a line in the shooter's colour; a pass or cross shows where it is meant to land.
  if (b.flight) {
    const f = b.flight, cx = lerp(b.px, b.x), cy = lerp(b.py, b.y);
    const shooter = m.players[f.shooter ?? f.passer], tc = shooter ? m.teams[shooter.side].color : '#fff';
    ctx.save(); ctx.lineCap = 'round';
    if (f.kind === 'shot') {
      const g = ctx.createLinearGradient(X(f.sx), Y(f.sy), X(cx), Y(cy)); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, tc);
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(2, s * 0.3); ctx.beginPath(); ctx.moveTo(X(f.sx), Y(f.sy)); ctx.lineTo(X(cx), Y(cy)); ctx.stroke();
    } else if (f.kind === 'pass' || f.kind === 'cross') {
      ctx.globalAlpha = 0.55; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(X(cx), Y(cy)); ctx.lineTo(X(f.tx), Y(f.ty)); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(X(f.tx), Y(f.ty), Math.max(3, s * 0.5), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // Officials: the referee in black, the assistants on the touchlines with their flag up just after an offside.
  if (m.officials) {
    let offsideX = null;
    for (let k = m.events.length - 1; k >= 0 && m.events[k].t > now - 4; k--) if (m.events[k].type === 'offside') { offsideX = m.events[k].x; break; }
    m.officials.forEach((o, k) => {
      const x = X(lerp(o.px, o.x)), y = Y(lerp(o.py, o.y)), ro = r * (o.role === 'referee' ? 0.62 : 0.5);
      if (o.role === 'assistant') {
        const up = offsideX != null && (k === 1 ? offsideX < 52.5 : offsideX >= 52.5);
        const dir = k === 1 ? 1 : -1; // flag points onto the field
        ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y);
        const fx = x + (up ? 0 : ro * 1.2), fy = y + dir * (up ? ro * 2.6 : ro * 1.4); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.fillStyle = up ? '#FF5A36' : '#F5D90A'; ctx.fillRect(fx - (up ? 0 : 0), fy - (dir > 0 ? 0 : ro * 0.9), ro * 1.2, ro * 0.9);
      }
      ctx.beginPath(); ctx.arc(x, y, ro, 0, Math.PI * 2); ctx.fillStyle = '#16181a'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#F5D90A'; ctx.stroke();
    });
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const labels = [];
  for (const q of m.players) {
    const offField = !q.onPitch && (q.treat || q.leaving); // off for treatment, or walking off after a substitution
    if (!q.onPitch && !offField) continue;
    ctx.globalAlpha = offField ? 0.5 : 1;
    const x = X(lerp(q.px, q.x)), y = Y(lerp(q.py, q.y));
    const gk = q.slot === 0, c = gk ? (q.side === 0 ? '#FFD23C' : '#3DDC97') : m.teams[q.side].color;
    if (owner === q && m.gkHands === b.owner) {
      const held = Math.min(8, now - m.gkHandsT), frac = held / 8, late = held > 3; // the referee counts down the last 5 seconds
      ctx.save(); ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = late ? col.bad : '#fff'; ctx.beginPath(); ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke(); ctx.restore();
    } else if (m.restart && m.restart.countdown && m.players[m.restart.taker] === q) {
      // the referee's 5-second countdown at a delayed throw-in or goal kick (Laws 15 and 16)
      const frac = Math.min(1, (now - m.restart.countdown.start) / 5);
      ctx.save(); ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = frac > 0.6 ? col.bad : '#fff'; ctx.beginPath(); ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke(); ctx.restore();
    } else if (owner === q) { ctx.save(); ctx.shadowColor = col.accent; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.strokeStyle = col.accent; ctx.lineWidth = 2.2; ctx.stroke(); ctx.restore(); }
    const vx = q.x - q.px, vy = q.y - q.py, vl = Math.hypot(vx, vy);
    if (vl > 0.04) { const a = Math.atan2(vy, vx); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5)); ctx.lineTo(x + Math.cos(a + 0.5) * (r + 0.5), y + Math.sin(a + 0.5) * (r + 0.5)); ctx.lineTo(x + Math.cos(a - 0.5) * (r + 0.5), y + Math.sin(a - 0.5) * (r + 0.5)); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(11,15,14,.8)'; ctx.stroke();
    if (q.injured) { ctx.fillStyle = col.bad; ctx.fillRect(x + r * 0.45, y - r - 3, 5, 5); }
    ctx.fillStyle = textOn(c); ctx.font = `700 ${Math.round(r * 0.95)}px Inter, sans-serif`; ctx.fillText(q.p.num, x, y + 0.5);
    if (opts.names) labels.push([lastName(q.p.name), x, y + r + 9]);
  }
  ctx.globalAlpha = 1;
  if (labels.length) {
    ctx.font = `500 ${Math.max(9.5, Math.round(r * 0.8))}px Inter, sans-serif`;
    for (const [t, x, y] of labels) { const w = ctx.measureText(t).width + 8, h = Math.max(13, r * 1.1); ctx.fillStyle = col.chip; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 3); else ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(t, x, y + 0.5); }
  }
  const inHands = owner && m.gkHands === b.owner;
  const bx = inHands ? X(lerp(owner.px, owner.x)) + r * 0.55 : X(lerp(b.px, b.x)), by = inHands ? Y(lerp(owner.py, owner.y)) - r * 0.55 : Y(lerp(b.py, b.y)), bz = inHands ? 1 : lerp(b.pz || 0, b.z || 0);
  ctx.beginPath(); ctx.ellipse(bx + 1, by + 1.5, Math.max(3, s * 0.42) * (1 - Math.min(0.5, bz * 0.06)), Math.max(2, s * 0.28), 0, 0, Math.PI * 2); ctx.fillStyle = `rgba(0,0,0,${0.42 - Math.min(0.25, bz * 0.03)})`; ctx.fill();
  ctx.beginPath(); ctx.arc(bx, by - bz * s * 0.55, Math.max(3.6, s * 0.45) * (1 + Math.min(0.35, bz * 0.035)), 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.stroke();
  if (flash > 0) { ctx.fillStyle = `rgba(0,0,0,${0.4 * flash})`; ctx.fillRect(0, 0, Wc, Hc); }
}

