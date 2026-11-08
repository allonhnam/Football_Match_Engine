/* Match Engine — a compact, deterministic 2D tick engine.
 Pitch: x 0..105 (length), y 0..68 (width), metres. One tick = 0.25 s of game time.
 Same inputs + seed + command log => identical match. */
const L = 105, W = 68, DT = 0.25, HALF = 2700;
const GOAL_HALF = 3.66, BOX_D = 16.5, BOX_HALF = 20.16;

// Numbers adjusted by tools/calibrate.mjs so the engine matches real league data (see README).
const TUNING = {
  shotBase: 0.0115,      // chance a carrier shoots from a position of almost no value
  shotSlope: 0.88,      // how quickly that chance rises with shot quality (xG)
  finishing: 1.62,      // multiplier on the chance an on-target shot scores
  foulBase: 0.064,      // chance a tackle attempt is a foul
  foulPress: 0.02,     // extra foul chance per level of pressing
  yellowBase: 0.177,     // chance a foul is booked
  homeAdvantage: 0.45,   // attribute points the home side gains on every skill
  offsideTiming: 8.3,   // how badly forwards mistime runs (bigger means more offsides)
};
const FORMATIONS = {
  '4-3-3': [['GK', 0, .5], ['DF', .03, .1], ['DF', 0, .37], ['DF', 0, .63], ['DF', .03, .9], ['MF', .42, .28], ['MF', .34, .5], ['MF', .42, .72], ['FW', .9, .14], ['FW', 1, .5], ['FW', .9, .86]],
  '4-4-2': [['GK', 0, .5], ['DF', .03, .1], ['DF', 0, .37], ['DF', 0, .63], ['DF', .03, .9], ['MF', .46, .1], ['MF', .4, .38], ['MF', .4, .62], ['MF', .46, .9], ['FW', .95, .38], ['FW', .95, .62]],
  '4-2-3-1': [['GK', 0, .5], ['DF', .03, .1], ['DF', 0, .37], ['DF', 0, .63], ['DF', .03, .9], ['MF', .3, .38], ['MF', .3, .62], ['MF', .7, .14], ['MF', .66, .5], ['MF', .7, .86], ['FW', 1, .5]],
  '3-5-2': [['GK', 0, .5], ['DF', 0, .24], ['DF', 0, .5], ['DF', 0, .76], ['MF', .52, .07], ['MF', .38, .3], ['MF', .32, .5], ['MF', .38, .7], ['MF', .52, .93], ['FW', .95, .38], ['FW', .95, .62]],
  '5-3-2': [['GK', 0, .5], ['DF', .12, .06], ['DF', 0, .28], ['DF', 0, .5], ['DF', 0, .72], ['DF', .12, .94], ['MF', .45, .28], ['MF', .4, .5], ['MF', .45, .72], ['FW', .95, .38], ['FW', .95, .62]],
};
const TACTIC_KEYS = ['mentality', 'pressing', 'line', 'width', 'tempo', 'passing'];
const TACTIC_LABELS = {
  mentality: ['Defend', 'Balanced', 'Attack'], pressing: ['Low', 'Mid', 'High'], line: ['Deep', 'Normal', 'High'],
  width: ['Narrow', 'Normal', 'Wide'], tempo: ['Slow', 'Normal', 'Fast'], passing: ['Short', 'Mixed', 'Direct'],
};
const DEFAULT_TACTICS = { mentality: 1, pressing: 1, line: 1, width: 1, tempo: 1, passing: 1 };
const ATTRS = ['pace', 'stamina', 'passing', 'vision', 'dribbling', 'shooting', 'heading', 'tackling', 'positioning', 'keeping'];
const KEY_EVENTS = { goal: 1, yellow: 1, red: 1, sub: 1, injury: 1, halftime: 1, fulltime: 1, penalty: 1, abandoned: 1 };

// ---------- RNG (mulberry32, serialisable) ----------
function makeRng(seed) {
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.getState = () => s; r.setState = v => { s = v >>> 0; };
  return r;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; u = clamp(u, 0, 1);
  return dist(px, py, ax + u * dx, ay + u * dy);
}

// ---------- Squads ----------
const FIRST = ['Leo', 'Mateo', 'Noah', 'Kai', 'Elias', 'Tomas', 'Rafa', 'Ilya', 'Jonas', 'Sami', 'Oscar', 'Theo', 'Luca', 'Andre', 'Felix', 'Hugo', 'Milan', 'Enzo', 'Bruno', 'Arlo', 'Dario', 'Nils', 'Joao', 'Kofi', 'Yuki', 'Emil', 'Tariq', 'Ivo', 'Marek', 'Cian'];
const LAST = ['Silva', 'Okafor', 'Novak', 'Haas', 'Lindqvist', 'Moreau', 'Tanaka', 'Costa', 'Bennett', 'Duarte', 'Kowalski', 'Mensah', 'Ferreira', 'Holm', 'Petrov', 'Garcia', 'Nakamura', 'Van Dijk', 'Romero', 'Adeyemi', 'Larsen', 'Brandt', 'Ortega', 'Keane', 'Rossi', 'Dubois', 'Sato', 'Varga', 'Quinn', 'Moretti'];
const SQUAD_ROLES = [['GK', 'C'], ['DF', 'R'], ['DF', 'C'], ['DF', 'C'], ['DF', 'L'], ['MF', 'C'], ['MF', 'C'], ['MF', 'C'], ['FW', 'R'], ['FW', 'C'], ['FW', 'L'],
  ['GK', 'C'], ['DF', 'C'], ['DF', 'R'], ['MF', 'L'], ['MF', 'C'], ['MF', 'R'], ['FW', 'C']];
const ROLE_BIAS = {
  GK: { keeping: 6, positioning: 2, shooting: -8, dribbling: -6, tackling: -6, heading: -2, pace: -3 },
  DF: { tackling: 4, positioning: 3, heading: 3, shooting: -4, dribbling: -2 },
  MF: { passing: 4, vision: 3, stamina: 2, keeping: -12 },
  FW: { shooting: 4, dribbling: 3, pace: 2, tackling: -4, positioning: -1, keeping: -12 },
};
function generateSquad(seed, name, strength) {
  const r = makeRng(seed * 7919 + 13);
  const players = SQUAD_ROLES.map(([role, side], i) => {
    const a = {};
    for (const k of ATTRS) {
      let v = strength + (r() - 0.5) * 6 + ((ROLE_BIAS[role][k]) || 0);
      if (k === 'keeping' && role !== 'GK') v = 2 + r() * 3;
      a[k] = Math.round(clamp(v, 1, 20));
    }
    const pname = FIRST[Math.floor(r() * FIRST.length)][0] + '. ' + LAST[Math.floor(r() * LAST.length)];
    return { id: name.slice(0, 3).toUpperCase() + '-' + (i + 1), name: pname, num: i < 11 ? [1, 2, 4, 5, 3, 6, 8, 10, 7, 9, 11][i] : 12 + i - 11, role, side, attrs: a, condition: 1, unavailable: null };
  });
  return players;
}
const ROLE_KEYS = { GK: ['keeping', 'positioning', 'passing'], DF: ['tackling', 'positioning', 'heading', 'pace'], MF: ['passing', 'vision', 'stamina', 'dribbling'], FW: ['shooting', 'dribbling', 'pace', 'heading'] };
function roleRating(p) { const ks = ROLE_KEYS[p.role]; return ks.reduce((s, k) => s + p.attrs[k], 0) / ks.length; }
function slotSide(sy) { return sy < 0.3 ? 'L' : sy > 0.7 ? 'R' : 'C'; }
function positionFit(player, formation, slotIdx) {
  const [role, , sy] = FORMATIONS[formation][slotIdx];
  if (role === 'GK') return player.role === 'GK' ? 1 : 0.15;
  if (player.role === 'GK') return 0.15;
  const order = { DF: 0, MF: 1, FW: 2 };
  const d = Math.abs(order[role] - order[player.role]);
  let f = d === 0 ? 1 : d === 1 ? 0.75 : 0.45;
  const ss = slotSide(sy);
  if (ss !== 'C' && player.side !== ss && player.side !== 'C') f *= 0.85;
  return f;
}
function autoPick(players, formation) {
  const used = new Set(), xi = [];
  FORMATIONS[formation].forEach((_, i) => {
    let best = null, bs = -1;
    for (const p of players) {
      if (used.has(p.id) || p.unavailable) continue;
      const ov = roleRating(p);
      const sc = positionFit(p, formation, i) * 100 + ov;
      if (sc > bs) { bs = sc; best = p; }
    }
    used.add(best.id); xi.push(best.id);
  });
  const bench = players.filter(p => !used.has(p.id)).slice(0, 9).map(p => p.id);
  return { xi, bench };
}
function makeTeam(opts) {
  const players = opts.players || generateSquad(opts.seed || 1, opts.name, opts.strength || 12);
  const formation = opts.formation || '4-3-3';
  const pick = autoPick(players, formation);
  return { name: opts.name, seed: opts.seed || 1, strength: opts.strength || 12, short: opts.short || opts.name.slice(0, 3).toUpperCase(), color: opts.color || '#3b82f6', color2: opts.color2 || '#ffffff', players, formation, xi: pick.xi, bench: pick.bench, tactics: Object.assign({}, DEFAULT_TACTICS, opts.tactics || {}) };
}

// ---------- Lineup validation (never throws) ----------
function validateLineup(team) {
  const errs = [];
  if (!team || !Array.isArray(team.players)) return [{ code: 'NO_SQUAD', message: 'Team has no squad' }];
  if (!FORMATIONS[team.formation]) errs.push({ code: 'BAD_FORMATION', message: 'Unknown formation ' + team.formation });
  const byId = new Map(team.players.map(p => [p.id, p]));
  if (!Array.isArray(team.xi) || team.xi.length !== 11) errs.push({ code: 'XI_SIZE', message: 'Starting XI must have exactly 11 players' });
  const seen = new Set();
  (team.xi || []).forEach((id, i) => {
    const p = byId.get(id);
    if (!id || !p) { errs.push({ code: 'EMPTY_SLOT', message: 'Slot ' + (i + 1) + ' is empty' }); return; }
    if (seen.has(id)) errs.push({ code: 'DUPLICATE', message: p.name + ' is picked twice' });
    seen.add(id);
    if (p.unavailable) errs.push({ code: 'UNAVAILABLE', message: '#' + p.num + ' ' + p.name + ' is ' + p.unavailable });
  });
  const gk = byId.get((team.xi || [])[0]);
  if (gk && gk.role !== 'GK') errs.push({ code: 'NO_GK', message: 'Goalkeeper slot has an outfield player (' + gk.name + ')' });
  if ((team.bench || []).length > 9) errs.push({ code: 'BENCH_SIZE', message: 'Bench can have at most 9 players' });
  (team.bench || []).forEach(id => { if (seen.has(id)) errs.push({ code: 'BENCH_DUP', message: (byId.get(id) || {}).name + ' is in the XI and on the bench' }); });
  return errs;
}

// ---------- Match ----------
function Match(config) {
  const errs = [].concat(validateLineup(config.home).map(e => Object.assign({ side: 'home' }, e)), validateLineup(config.away).map(e => Object.assign({ side: 'away' }, e)));
  if (errs.length) { this.errors = errs; return; }
  this.config = config;
  this.seed = config.seed >>> 0;
  this.rng = makeRng(this.seed);
  this.control = config.control || 'home'; // which side(s) the human manages; others use the AI manager
  this.tick = 0; this.half = 1; this.t = 0; this.added = [0, 0];
  this.phase = 'dead'; this.finished = false; this.abandoned = null;
  this.events = []; this.commands = []; this.listeners = [];
  this.momentum = []; // per minute [homeThreat, awayThreat]
  this.possMin = []; this.boxMin = []; this.f3Min = []; this._zone = [0, 0];
  this.xgTimeline = [[0, 0, 0]];
  this.firstKick = this.rng() < 0.5 ? 0 : 1;
  this.teams = [config.home, config.away].map((sheet, s) => ({
    side: s, sheet, name: sheet.name, short: sheet.short, color: sheet.color, formation: sheet.formation,
    tactics: Object.assign({}, sheet.tactics), score: 0, subsUsed: 0, windowsUsed: 0, pending: [],
    stats: { boxEntries: 0, f3Entries: 0, possession: 0, shots: 0, onTarget: 0, xg: 0, passes: 0, passesOk: 0, corners: 0, fouls: 0, yellows: 0, reds: 0, offsides: 0, tackles: 0, finalThirdWins: 0, saves: 0 },
  }));
  this.players = [];
  this.teams.forEach((tm, s) => {
    const byId = new Map(tm.sheet.players.map(p => [p.id, p]));
    tm.sheet.xi.forEach((id, slot) => this.players.push(this._mkRuntime(byId.get(id), s, slot, true)));
    tm.bench = tm.sheet.bench.map(id => byId.get(id)).filter(Boolean);
  });
  this.ball = { x: L / 2, y: W / 2, z: 0, px: L / 2, py: W / 2, pz: 0, owner: -1, lastSide: 0, lastIdx: -1, flight: null, vx: 0, vy: 0 };
  this.restart = null; this.decisionT = 0; this.lastPasser = -1; this.lastPasserT = -99;
  this._emit({ type: 'kickoff', side: this.firstKick, text: 'Kick-off. ' + this.teams[0].name + ' v ' + this.teams[1].name });
  this._setRestart('kickoff', this.firstKick, L / 2, W / 2, 3);
  this._targets(); this._restartTargets();
  for (const q of this.players) { q.x = q.px = q.tx; q.y = q.py = q.ty; }
}
const P = Match.prototype;

P._mkRuntime = function (p, side, slot, onPitch) {
  return { id: p.id, p, side, slot, onPitch, x: 0, y: 0, px: 0, py: 0, tx: 0, ty: 0, urgent: 0, chased: -1, marking: -1, carry: null, fit: 1, fitSlot: -1, fitForm: null, tackleImmune: 0, ePace: 0, eStam: 0, cond: p.condition == null ? 1 : p.condition, speed: 0, yellow: 0, red: false, injured: null, subOff: false, tackleCd: 0, runOff: 0,
    st: { minutes: 0, passes: 0, passesOk: 0, shots: 0, goals: 0, assists: 0, xg: 0, tackles: 0, fouls: 0, saves: 0, dist: 0, onAt: onPitch ? 0 : null, offAt: null } };
};
P.dir = function (side) { return (side === 0) === (this.half === 1) ? 1 : -1; };
P.clockSec = function () { return (this.half - 1) * HALF + this.t; };
P.minute = function () { return Math.min(this.half * 45, Math.floor(this.clockSec() / 60) + 1); };
P.clockLabel = function () {
  if (this.t >= HALF) { const ex = Math.floor((this.t - HALF) / 60) + 1; return (this.half * 45) + '+' + ex; }
  const s = Math.floor(this.clockSec()); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
P.minuteLabel = function () { return this.t >= HALF ? (this.half * 45) + '+' + (Math.floor((this.t - HALF) / 60) + 1) + '′' : this.minute() + '′'; };
P.on = function (fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; };
P._emit = function (e) {
  e.t = this.clockSec(); e.tick = this.tick; e.minute = this.minuteLabel(); e.half = this.half; e.key = !!KEY_EVENTS[e.type];
  if (e.x == null) { e.x = this.ball ? this.ball.x : L / 2; e.y = this.ball ? this.ball.y : W / 2; }
  this.events.push(e); for (const f of this.listeners) f(e);
};
P.onPitch = function (side) { return this.players.filter(q => q.onPitch && (side == null || q.side === side)); };
P.eff = function (q, k) {
  const f = Math.min(1, 0.5 + 0.65 * q.cond);
  const home = q.side === 0 && !this.config.neutral ? TUNING.homeAdvantage : 0;
  const fm = this.teams[q.side].formation;
  if (q.fitSlot !== q.slot || q.fitForm !== fm) { q.fitSlot = q.slot; q.fitForm = fm; q.fit = positionFit(q.p, fm, q.slot); }
  const fit = q.fit;
  return (q.p.attrs[k] + home) * f * (k === 'keeping' ? 1 : 0.82 + 0.18 * fit);
};

// ----- restarts -----
P._setRestart = function (type, side, x, y, delay, extra) {
  this.stoppage = (this.stoppage || 0) + 1;
  this.phase = 'dead'; this.ball.owner = -1; this.ball.flight = null; this.ball.z = 0;
  this.ball.x = clamp(x, 0, L); this.ball.y = clamp(y, 0, W);
  let taker = -1, best = 1e9;
  this.players.forEach((q, i) => {
    if (!q.onPitch || q.side !== side) return;
    const gk = q.slot === 0;
    if (type === 'goalkick') { if (gk) taker = i; return; }
    if (gk && type !== 'freekick') return;
    let d = dist(q.x, q.y, x, y);
    if (type === 'penalty') d = -this.eff(q, 'shooting');
    if (type === 'kickoff') d = q.p.role === 'FW' || q.p.role === 'MF' ? dist(q.x, q.y, x, y) : 1e6 + d;
    if (d < best) { best = d; taker = i; }
  });
  this.restart = Object.assign({ type, side, x: this.ball.x, y: this.ball.y, timer: delay, taker }, extra || {});
  this._applyPending();
};
P._resume = function () {
  const r = this.restart; this.restart = null; this.phase = 'play';
  const q = this.players[r.taker];
  if (!q || !q.onPitch) { this.phase = 'play'; return; }
  q.x = r.x; q.y = r.y;
  this._give(r.taker);
  const d = this.dir(r.side);
  if (r.type === 'penalty') { this._shoot(r.taker, { xg: 0.76, penalty: true }); return; }
  if (r.type === 'corner') { this._cross(r.taker); return; }
  if (r.type === 'freekick' && r.direct) {
    const gx = d > 0 ? L : 0, dd = dist(r.x, r.y, gx, W / 2);
    if (dd < 30 && this.rng() < 0.45) { this._shoot(r.taker, { xg: clamp(0.11 - (dd - 18) * 0.006, 0.03, 0.12), freekick: true }); return; }
  }
  this.restart = null; this.decisionT = r.type === 'kickoff' ? 0.3 : 0.6;
  this.restartType = r.type;
};

// ----- possession helpers -----
P._give = function (i) {
  const q = this.players[i], b = this.ball;
  if (b.owner >= 0 && this.players[b.owner].side !== q.side) this.restartType = null;
  b.owner = i; b.flight = null; b.z = 0; b.lastSide = q.side; b.lastIdx = i; b.x = q.x; b.y = q.y;
  this.decisionT = 1.1 + this.rng() * 1.5;
};

// ----- shooting -----
P._xg = function (x, y, side, pressure) {
  const d = this.dir(side), gx = d > 0 ? L : 0;
  const dd = dist(x, y, gx, W / 2);
  const a1 = Math.atan2(W / 2 + GOAL_HALF - y, Math.abs(gx - x)), a2 = Math.atan2(W / 2 - GOAL_HALF - y, Math.abs(gx - x));
  const ang = Math.abs(a1 - a2);
  let xg = 0.95 * Math.exp(-dd / 7.2) * Math.min(1, ang / 0.5);
  if (pressure < 1.5) xg *= 0.6; else if (pressure < 3) xg *= 0.82;
  return clamp(xg, 0.005, 0.85);
};
P._shoot = function (i, o) {
  o = o || {};
  const q = this.players[i], tm = this.teams[q.side], opp = this.teams[1 - q.side], d = this.dir(q.side), r = this.rng;
  const gx = d > 0 ? L : 0;
  const press = this._nearestOpp(q).d;
  const xg = o.xg != null ? o.xg : this._xg(q.x, q.y, q.side, press) * (o.header ? 0.75 : 1);
  const shoot = (o.header ? this.eff(q, 'heading') : this.eff(q, 'shooting')) / 20;
  tm.stats.shots++; tm.stats.xg += xg; q.st.shots++; q.st.xg += xg;
  this._addThreat(q.side, xg);
  this.xgTimeline.push([this.clockSec(), this.teams[0].stats.xg, this.teams[1].stats.xg]);
  // blocked?
  let outcome, ty = W / 2;
  const blockers = o.penalty || o.freekick ? 0 : this.players.filter(p => p.onPitch && p.side !== q.side && p.slot !== 0 && segDist(p.x, p.y, q.x, q.y, gx, W / 2) < 1.2 && (p.x - q.x) * d > 0).length;
  if (blockers && r() < 0.45) outcome = 'blocked';
  else {
    const onT = o.penalty ? 0.82 : clamp(0.28 + shoot * 0.22 + xg * 0.5 - (press < 1.5 ? 0.08 : 0), 0.15, 0.85);
    if (r() < onT) {
      const gk = this.players.find(p => p.onPitch && p.side !== q.side && p.slot === 0);
      const keep = gk ? this.eff(gk, 'keeping') / 20 : 0;
      let pg = clamp((xg / onT) * (TUNING.finishing + (shoot - 0.55) * 0.6) * (1.2 - keep * 0.45), 0.02, 0.97);
      if (o.penalty) pg = clamp(0.93 - keep * 0.12, 0.6, 0.95);
      outcome = r() < pg ? 'goal' : 'saved';
      ty = W / 2 + (r() * 2 - 1) * (GOAL_HALF - 0.4);
    } else { outcome = 'off'; ty = W / 2 + (r() < 0.5 ? -1 : 1) * (GOAL_HALF + 0.5 + r() * 5); }
  }
  if (outcome === 'goal' || outcome === 'saved') { tm.stats.onTarget++; }
  const b = this.ball; b.owner = -1; b.lastSide = q.side; b.lastIdx = i;
  const tx = outcome === 'blocked' ? q.x + d * 2 : gx;
  const tyy = outcome === 'blocked' ? q.y : ty;
  const D = dist(q.x, q.y, tx, tyy);
  b.flight = { kind: 'shot', sx: q.x, sy: q.y, tx, ty: tyy, dur: Math.max(0.15, D / 26), el: 0, h: outcome === 'off' ? 1.5 + r() * 2 : 0.6, shooter: i, outcome, xg, header: !!o.header, penalty: !!o.penalty, freekick: !!o.freekick };
  this.phase = 'play';
  if (o.penalty) this._emit({ type: 'penalty', side: q.side, player: q.id, text: 'Penalty taken by ' + q.p.name });
};
P._resolveShot = function (f) {
  const q = this.players[f.shooter], tm = this.teams[q.side], opp = 1 - q.side, r = this.rng, d = this.dir(q.side);
  const name = q.p.name, xgs = f.xg.toFixed(2);
  if (f.outcome === 'goal') {
    tm.score++; q.st.goals++;
    let assist = null;
    if (this.lastPasser >= 0 && this.lastPasser !== f.shooter && this.players[this.lastPasser].side === q.side && this.clockSec() - this.lastPasserT < 12) { assist = this.players[this.lastPasser]; assist.st.assists++; }
    this.goalsThisHalf = (this.goalsThisHalf || 0) + 1;
    this._emit({ type: 'goal', side: q.side, player: q.id, assist: assist && assist.id, xg: f.xg, x: f.sx, y: f.sy, text: 'GOAL! ' + name + (f.penalty ? ' (pen)' : f.header ? ' (header)' : '') + (assist ? ', assisted by ' + assist.p.name : '') + ' · ' + xgs + ' xG', score: [this.teams[0].score, this.teams[1].score] });
    this._setRestart('kickoff', opp, L / 2, W / 2, 6);
    return;
  }
  if (f.outcome === 'blocked') {
    this._emit({ type: 'shot', side: q.side, player: q.id, result: 'blocked', xg: f.xg, x: f.sx, y: f.sy, text: name + "'s shot is blocked" });
    if (r() < 0.55) { this.teams[q.side].stats.corners++; this._emit({ type: 'corner', side: q.side, text: 'Corner to ' + tm.name }); this._setRestart('corner', q.side, d > 0 ? L - 0.3 : 0.3, r() < 0.5 ? 0.3 : W - 0.3, 6); }
    else this._loose(this.ball.x, this.ball.y, (r() - 0.5) * 8, (r() - 0.5) * 8);
    return;
  }
  if (f.outcome === 'saved') {
    const gk = this.players.findIndex(p => p.onPitch && p.side === opp && p.slot === 0);
    if (gk >= 0) { this.players[gk].st.saves++; this.teams[opp].stats.saves++; }
    this._emit({ type: 'shot', side: q.side, player: q.id, result: 'saved', xg: f.xg, x: f.sx, y: f.sy, text: name + ' forces a save · ' + xgs + ' xG' });
    const u = r();
    if (u < 0.5 && gk >= 0) { this.players[gk].x = this.ball.x - d * 1; this.players[gk].y = this.ball.y; this._give(gk); this.decisionT = 2 + r() * 2.5; }
    else if (u < 0.74) { this.teams[q.side].stats.corners++; this._emit({ type: 'corner', side: q.side, text: 'Corner to ' + tm.name }); this._setRestart('corner', q.side, d > 0 ? L - 0.3 : 0.3, this.ball.y < W / 2 ? 0.3 : W - 0.3, 6); }
    else this._loose(this.ball.x - d * 3, this.ball.y + (r() - 0.5) * 10, -d * (4 + r() * 4), (r() - 0.5) * 6);
    return;
  }
  this._emit({ type: 'shot', side: q.side, player: q.id, result: 'off', xg: f.xg, x: f.sx, y: f.sy, text: name + (f.header ? ' heads' : ' shoots') + ' wide · ' + xgs + ' xG' });
  this._setRestart('goalkick', opp, d > 0 ? L - 5.5 : 5.5, W / 2 + (r() - 0.5) * 12, 5);
};

// ----- passing -----
P._nearestOpp = function (q, x, y) {
  x = x == null ? q.x : x; y = y == null ? q.y : y;
  let best = 1e9, bi = -1;
  for (let i = 0; i < this.players.length; i++) { const o = this.players[i]; if (!o.onPitch || o.side === q.side) continue; const dd = dist(o.x, o.y, x, y); if (dd < best) { best = dd; bi = i; } }
  return { d: best, i: bi };
};
P._value = function (side, x, y) {
  const d = this.dir(side), fx = d > 0 ? x : L - x;
  const u = fx / L;
  return 0.02 + 0.32 * Math.pow(u, 2.6) * (1 - 0.45 * Math.abs(y - W / 2) / (W / 2) * u);
};
P._lossCost = function (side, x) { const d = this.dir(side), fx = d > 0 ? x : L - x; const u = 1 - fx / L; return 0.03 + 0.28 * u * u * u; };
P._offsideLine = function (side) { // x of second-last opponent (incl. GK) of `side`'s opponents
  const d = this.dir(side);
  let a = -1e9, b2 = -1e9;
  for (const o of this.players) { if (!o.onPitch || o.side === side) continue; const v = o.x * d; if (v > a) { b2 = a; a = v; } else if (v > b2) b2 = v; }
  return (b2 > -1e9 ? b2 : a) * d;
};
P._passRisk = function (q, tx, ty) {
  const D = dist(q.x, q.y, tx, ty); let risk = 0;
  for (const o of this.players) {
    if (!o.onPitch || o.side === q.side) continue;
    const sd = segDist(o.x, o.y, q.x, q.y, tx, ty);
    const reach = 1.0 + D * 0.045;
    if (sd < reach + 2.5) risk = Math.max(risk, clamp(1 - (sd - 0.4) / (reach + 2.1), 0, 1) * 0.85);
  }
  return risk;
};
P._decide = function (i) {
  const q = this.players[i], tm = this.teams[q.side], T = tm.tactics, r = this.rng, d = this.dir(q.side);
  const gx = d > 0 ? L : 0;
  const press = this._nearestOpp(q).d;
  const xg = this._xg(q.x, q.y, q.side, press);
  const ment = [0.75, 1, 1.3][T.mentality];
  // shoot?
  if (xg > 0.025 && q.slot !== 0) {
    const p = clamp(TUNING.shotBase + (xg - 0.02) * TUNING.shotSlope, 0, 0.7) * ment * (0.75 + this.eff(q, 'shooting') / 50);
    if (r() < p) { this._shoot(i, { header: this.ball.z > 1.2 }); return; }
  }
  const vis = this.eff(q, 'vision'), pas = this.eff(q, 'passing');
  const noise = 0.03 + (20 - vis) * 0.004;
  const directW = [0.85, 1, 1.25][T.passing], maxLen = [32, 40, 55][T.passing];
  const curV = this._value(q.side, q.x, q.y), loss = this._lossCost(q.side, q.x);
  let best = { u: -1e9 };
  // hold / carry
  const cx = clamp(q.x + d * 7, 1, L - 1), cy = clamp(q.y + (W / 2 - q.y) * 0.15, 2, W - 2);
  const carryRisk = clamp(Math.max(1.1 - press / 5.5, this._passRisk(q, cx, cy) * 1.15) + 0.06, 0.06, 0.95) * (1.2 - this.eff(q, 'dribbling') / 30);
  const carryU = (1 - carryRisk) * this._value(q.side, cx, cy) - carryRisk * loss * 0.9 + (r() - 0.5) * noise;
  best = { u: carryU, kind: 'carry', tx: cx, ty: cy };
  const lineX = this._offsideLine(q.side);
  for (let j = 0; j < this.players.length; j++) {
    const m = this.players[j];
    if (j === i || !m.onPitch || m.side !== q.side) continue;
    if (m.slot === 0 && (q.x - (d > 0 ? 0 : L)) * d > 45) continue;
    // lead the receiver toward goal when he has space
    const lead = (m.slot >= 7 || m.p.role === 'FW') ? 3 + r() * 5 : 1.5;
    let tx = clamp(m.x + d * lead, 1, L - 1), ty = m.y;
    const D = dist(q.x, q.y, tx, ty);
    if (D < 6 || D > maxLen) continue;
    const risk = this._passRisk(q, tx, ty) * (1.25 - pas / 40) + (D > 30 ? 0.08 : 0);
    const rp = this._nearestOpp(m, tx, ty).d;
    const vt = this._value(q.side, tx, ty) * (rp < 2.5 ? 0.75 : 1);
    const prog = (vt - curV);
    const offs = (m.x - lineX) * d > 0 && (m.x - q.x) * d > 0 && (d > 0 ? m.x > L / 2 : m.x < L / 2);
    let u = curV + prog * directW - risk * loss - (offs && r() < 0.3 + vis / 60 ? 0.25 : 0) + (r() - 0.5) * noise + 0.012;
    u *= (1 - risk);
    if (u > best.u) best = { u, kind: 'pass', j, tx, ty, D };
  }
  // cross from wide in the final third
  const fxq = d > 0 ? q.x : L - q.x;
  if (fxq > 76 && Math.abs(q.y - W / 2) > 13 && q.slot !== 0) {
    const cu = 0.075 + T.width * 0.012 + (r() - 0.5) * noise;
    if (cu > best.u) best = { u: cu, kind: 'cross' };
  }
  // clearance under pressure deep in own half
  const ownGoalDist = Math.abs(q.x - (d > 0 ? 0 : L));
  if (ownGoalDist < 22 && press < 2 && best.u < 0.03) best = { kind: 'clear' };
  if (best.kind === 'pass') this._pass(i, best.j, best.tx, best.ty, false);
  else if (best.kind === 'cross') this._cross(i, true);
  else if (best.kind === 'clear') { const tx = clamp(q.x + d * (35 + r() * 20), 2, L - 2), ty = clamp(q.y + (r() - 0.5) * 40, 2, W - 2); this._kick(i, tx, ty, 'clear', -1, 4 + r() * 6); }
  else { q.carry = { tx: best.tx, ty: best.ty }; this.decisionT = 0.6 + r() * 0.8; }
};
P._pass = function (i, j, tx, ty, isThrow) {
  const q = this.players[i], m = this.players[j], tm = this.teams[q.side], r = this.rng, d = this.dir(q.side);
  // offside at the moment the ball is played
  const rt = this.restartType;
  if (!(rt === 'throwin' || rt === 'goalkick' || rt === 'corner')) {
    const lineX = this._offsideLine(q.side);
    const inOppHalf = d > 0 ? m.x > L / 2 : m.x < L / 2;
    const gap = (m.x - lineX) * d, timing = (m.p.role === 'FW' || m.slot >= 7) && gap > -7 ? (r() - 0.05) * TUNING.offsideTiming : 0; // mistimed runs
    if (inOppHalf && gap + timing > 0.3 && (m.x - this.ball.x) * d > 0) {
      tm.stats.offsides++;
      this._emit({ type: 'offside', side: q.side, player: m.id, text: m.p.name + ' is caught offside', x: m.x, y: m.y });
      this._setRestart('freekick', 1 - q.side, m.x, m.y, 4, { direct: false });
      return;
    }
  }
  this.restartType = null;
  const D = dist(q.x, q.y, tx, ty);
  const pas = this.eff(q, 'passing'), press = this._nearestOpp(q).d;
  const err = (0.04 + (20 - pas) * 0.006 + (press < 2 ? 0.05 : 0)) * D * (isThrow ? 0.5 : 1);
  tx = clamp(tx + (r() - 0.5) * 2 * err, -2, L + 2); ty = clamp(ty + (r() - 0.5) * 2 * err, -2, W + 2);
  const lofted = D > 28 || isThrow;
  tm.stats.passes++; q.st.passes++;
  this._kick(i, tx, ty, 'pass', j, lofted ? 2 + D * 0.08 : 0.15);
};
P._kick = function (i, tx, ty, kind, j, h) {
  const q = this.players[i], b = this.ball, D = dist(q.x, q.y, tx, ty);
  const speed = kind === 'clear' ? 22 : clamp(9 + D * 0.45, 10, 24);
  b.owner = -1; b.lastSide = q.side; b.lastIdx = i; this.lastPasser = i; this.lastPasserT = this.clockSec();
  b.flight = { kind, sx: q.x, sy: q.y, tx, ty, dur: Math.max(0.2, D / speed), el: 0, h, passer: i, recv: j, speed };
  q.carry = null; this.kickT = this.clockSec();
};
P._cross = function (i, open) {
  const q = this.players[i], d = this.dir(q.side), r = this.rng;
  const gx = d > 0 ? L : 0;
  const tx = gx - d * (6 + r() * 7), ty = W / 2 + (r() - 0.5) * 14;
  // best attacker for the header
  let j = -1, bd = 1e9;
  this.players.forEach((m, k) => { if (m.onPitch && m.side === q.side && k !== i && m.slot !== 0) { const dd = dist(m.x, m.y, tx, ty) - this.eff(m, 'heading') * 0.2; if (dd < bd) { bd = dd; j = k; } } });
  this.restartType = open ? null : 'corner';
  this.teams[q.side].stats.passes++; q.st.passes++;
  this._kick(i, tx, ty, 'cross', j, 4.5);
};
P._loose = function (x, y, vx, vy) {
  const b = this.ball; b.owner = -1; b.flight = null; b.x = x; b.y = y; b.z = 0; b.vx = vx; b.vy = vy;
};

// ----- fouls, cards, injuries -----
P._foul = function (ti, oi) {
  const t = this.players[ti], o = this.players[oi], r = this.rng, d = this.dir(o.side);
  const tt = this.teams[t.side]; tt.stats.fouls++; t.st.fouls++;
  const inBox = Math.abs(o.y - W / 2) < BOX_HALF && (d > 0 ? o.x > L - BOX_D : o.x < BOX_D);
  let goalSide = 0; for (const q of this.players) if (q.onPitch && q.side === t.side && q.slot !== 0 && q !== t && (q.x - o.x) * d > 0) goalSide++;
  const lastMan = goalSide === 0 && Math.abs(o.x - (d > 0 ? L : 0)) < 22 && Math.abs(o.y - W / 2) < 15;
  this._emit({ type: 'foul', side: t.side, player: t.id, victim: o.id, text: 'Foul by ' + t.p.name + ' on ' + o.p.name, x: o.x, y: o.y });
  let card = null;
  const agg = [0.85, 1, 1.25][tt.tactics.pressing];
  if (lastMan && r() < 0.08) card = 'red';
  else if (r() < 0.003) card = 'red';
  else if (r() < (TUNING.yellowBase * agg + (lastMan ? 0.4 : 0)) * (t.yellow ? 0.55 : 1)) card = 'yellow';
  if (card === 'yellow') { t.yellow++; tt.stats.yellows++; if (t.yellow >= 2) card = 'red2'; else this._emit({ type: 'yellow', side: t.side, player: t.id, text: 'Yellow card: ' + t.p.name + (lastMan ? ' (stopped a promising attack)' : '') }); }
  if (card === 'red' || card === 'red2') this._sendOff(ti, card === 'red2' ? 'second yellow' : lastMan ? 'denied an obvious goal-scoring opportunity' : 'serious foul play');
  if (r() < 0.015) this._injure(oi);
  if (this.abandoned) return;
  if (inBox) { this._setRestart('penalty', o.side, d > 0 ? L - 11 : 11, W / 2, 7); }
  else this._setRestart('freekick', o.side, o.x, o.y, 4, { direct: true });
};
P._sendOff = function (ti, why) {
  const t = this.players[ti], tt = this.teams[t.side];
  t.red = true; t.onPitch = false; t.st.offAt = this.clockSec(); tt.stats.reds++;
  if (this.ball.owner === ti) this.ball.owner = -1;
  this._emit({ type: 'red', side: t.side, player: t.id, text: 'RED CARD: ' + t.p.name + ' (' + why + ')' });
  this._checkAbandon();
};
P._injure = function (i) {
  const q = this.players[i]; if (q.injured || !q.onPitch) return;
  const r = this.rng, kinds = ['hamstring strain', 'ankle knock', 'calf strain', 'knee sprain', 'groin strain', 'dead leg'];
  const days = Math.round(r() < 0.6 ? 2 + r() * 10 : 10 + r() * 45);
  q.injured = { type: kinds[Math.floor(r() * kinds.length)], days };
  this.injuries = (this.injuries || 0) + 1;
  this._emit({ type: 'injury', side: q.side, player: q.id, text: q.p.name + ' is injured (' + q.injured.type + ', about ' + days + ' days)' });
};
P._checkAbandon = function () {
  for (const s of [0, 1]) if (this.onPitch(s).length < 7) {
    this.abandoned = { reason: this.teams[s].name + ' have fewer than 7 players', minute: this.minute() };
    this._emit({ type: 'abandoned', side: s, text: 'Match abandoned: ' + this.abandoned.reason });
    this.finished = true; this.phase = 'fulltime';
  }
};

// ----- manager commands (queued until the next stoppage) -----
P._cmd = function (c, fromReplay) { if (!fromReplay) this.commands.push(Object.assign({ tick: this.tick }, c)); };
P.substitute = function (side, outId, inId, _replay) {
  const tm = this.teams[side];
  const out = this.players.find(q => q.id === outId && q.side === side);
  const inn = tm.bench.find(p => p.id === inId);
  const queuedOut = tm.pending.filter(c => c.kind === 'sub').length;
  if (this.finished) return { ok: false, error: 'The match has finished' };
  if (!out) return { ok: false, error: 'That player is not in this team' };
  if (out.red) return { ok: false, error: 'Sent-off players cannot be replaced' };
  if (!out.onPitch) return { ok: false, error: out.p.name + ' is not on the pitch' };
  if (!inn) return { ok: false, error: 'That player is not on the bench' };
  if (tm.subsUsed + queuedOut >= 5) return { ok: false, error: 'No substitutions left (5 used)' };
  if (tm.pending.some(c => c.kind === 'sub' && (c.outId === outId || c.inId === inId))) return { ok: false, error: 'Already queued' };
  // Substitutions made during the same stoppage share one window.
  const sameStoppage = this.phase === 'dead' && tm.windowStoppage === this.stoppage;
  const newWindow = !tm.pending.some(c => c.kind === 'sub') && this.phase !== 'halftime' && !sameStoppage;
  if (newWindow && tm.windowsUsed >= 3) return { ok: false, error: 'All 3 substitution windows used' };
  tm.pending.push({ kind: 'sub', outId, inId });
  this._cmd({ kind: 'sub', side, outId, inId }, _replay);
  if (this.phase === 'halftime' || this.phase === 'dead') this._applyPending();
  return { ok: true, queued: this.phase === 'play' };
};
P.cancelPending = function (side, idx) { this.teams[side].pending.splice(idx, 1); this._cmd({ kind: 'cancel', side, idx }); };
P.setTactics = function (side, t, _replay) {
  const tm = this.teams[side];
  tm.pending = tm.pending.filter(c => c.kind !== 'tactics');
  tm.pending.push({ kind: 'tactics', tactics: Object.assign({}, t) });
  this._cmd({ kind: 'tactics', side, tactics: t }, _replay);
  if (this.phase !== 'play') this._applyPending();
  return { ok: true, queued: this.phase === 'play' };
};
P.setFormation = function (side, f, _replay) {
  if (!FORMATIONS[f]) return { ok: false, error: 'Unknown formation' };
  const tm = this.teams[side];
  tm.pending = tm.pending.filter(c => c.kind !== 'formation');
  tm.pending.push({ kind: 'formation', formation: f });
  this._cmd({ kind: 'formation', side, formation: f }, _replay);
  if (this.phase !== 'play') this._applyPending();
  return { ok: true, queued: this.phase === 'play' };
};
P._applyPending = function () {
  for (const tm of this.teams) {
    if (!tm.pending.length) continue;
    const subs = tm.pending.filter(c => c.kind === 'sub');
    if (subs.length && this.phase !== 'halftime' && !(this.t === 0 && this.half === 2) && tm.windowStoppage !== this.stoppage) {
      tm.windowsUsed++;
      tm.windowStoppage = this.stoppage;
    }
    for (const c of tm.pending) {
      if (c.kind === 'sub') {
        const oi = this.players.findIndex(q => q.id === c.outId && q.onPitch);
        const inn = tm.bench.find(p => p.id === c.inId);
        if (oi < 0 || !inn) continue;
        const out = this.players[oi];
        out.onPitch = false; out.subOff = true; out.st.offAt = this.clockSec();
        const nq = this._mkRuntime(inn, tm.side, out.slot, true); nq.st.onAt = this.clockSec();
        nq.x = out.x < L / 2 ? out.x : out.x; nq.y = out.y < W / 2 ? 0 : W; nq.px = nq.x; nq.py = nq.y;
        this.players.push(nq);
        tm.bench = tm.bench.filter(p => p.id !== c.inId);
        tm.subsUsed++;
        if (this.ball.owner === oi) this.ball.owner = -1;
        if (this.restart && this.restart.taker === oi) this.restart.taker = this.players.length - 1;
        this._emit({ type: 'sub', side: tm.side, player: inn.id, off: out.p.id, text: 'Substitution ' + tm.name + ': ' + inn.name + ' on, ' + out.p.name + ' off' + (out.injured ? ' (injured)' : ''), cond: out.cond });
        this.subTimes = (this.subTimes || []); this.subTimes.push({ side: tm.side, t: this.clockSec() });
      } else if (c.kind === 'tactics') {
        Object.assign(tm.tactics, c.tactics);
        this._emit({ type: 'tactic', side: tm.side, text: tm.name + ' change tactics: ' + TACTIC_KEYS.filter(k => c.tactics[k] != null).map(k => k + ' ' + TACTIC_LABELS[k][c.tactics[k]]).join(', ') });
        this.subTimes = (this.subTimes || []); this.subTimes.push({ side: tm.side, t: this.clockSec(), tactic: true });
      } else if (c.kind === 'formation') {
        tm.formation = c.formation;
        this._reslot(tm.side);
        this._emit({ type: 'tactic', side: tm.side, text: tm.name + ' switch to ' + c.formation });
      }
    }
    tm.pending = [];
  }
};
P._reslot = function (side) {
  const tm = this.teams[side], f = FORMATIONS[tm.formation];
  const ps = this.onPitch(side);
  const free = new Set(f.map((_, i) => i));
  const gk = ps.find(q => q.p.role === 'GK') || ps[0];
  gk.slot = 0; free.delete(0);
  ps.filter(q => q !== gk).sort((a, b) => ({ DF: 0, MF: 1, FW: 2 }[a.p.role] - { DF: 0, MF: 1, FW: 2 }[b.p.role])).forEach(q => {
    let bs = -1, bi = -1; for (const i of free) { const s = positionFit(q.p, tm.formation, i) - Math.abs(f[i][2] - ({ L: .1, C: .5, R: .9 }[q.p.side])) * 0.3; if (s > bs) { bs = s; bi = i; } }
    if (bi >= 0) { q.slot = bi; free.delete(bi); }
  });
};

// ----- AI manager -----
P._ai = function (side) {
  const tm = this.teams[side], m = this.clockSec() / 60;
  const diff = tm.score - this.teams[1 - side].score;
  if (m > 70 && diff < 0 && tm.tactics.mentality < 2 && !tm.aiChased) { tm.aiChased = true; this.setTactics(side, { mentality: 2, tempo: 2 }, true); }
  if (m > 80 && diff > 0 && tm.tactics.mentality > 0 && !tm.aiProtect) { tm.aiProtect = true; this.setTactics(side, { mentality: 0 }, true); }
  // injured player first
  const inj = this.onPitch(side).find(q => q.injured);
  if (inj && tm.subsUsed < 5) this._aiSub(side, inj);
  if (m < 57 || tm.subsUsed >= 5 || tm.pending.length) return;
  const windowAt = [58, 68, 79][tm.windowsUsed];
  if (windowAt == null || m < windowAt) return;
  const tired = this.onPitch(side).filter(q => q.slot !== 0 && q.cond < 0.84).sort((a, b) => a.cond - b.cond);
  const n = Math.min(5 - tm.subsUsed, tm.windowsUsed === 2 ? 5 : 2);
  tired.slice(0, n).forEach(q => this._aiSub(side, q));
};
P._aiSub = function (side, out) {
  const tm = this.teams[side];
  if (tm.pending.some(c => c.outId === out.id)) return;
  const role = out.p.role;
  const cand = tm.bench.filter(p => !tm.pending.some(c => c.inId === p.id) && (out.slot === 0 ? p.role === 'GK' : p.role !== 'GK'))
    .sort((a, b) => (b.role === role) - (a.role === role));
  if (cand.length) this.substitute(side, out.id, cand[0].id, true);
};

// ----- positioning -----
P._targets = function () {
  const b = this.ball, ownerSide = b.owner >= 0 ? this.players[b.owner].side : (b.flight ? b.lastSide : -1);
  const olines = [this._offsideLine(0), this._offsideLine(1)];
  for (const s of [0, 1]) {
    const tm = this.teams[s], T = tm.tactics, d = this.dir(s), f = FORMATIONS[tm.formation];
    const attacking = ownerSide === s;
    const bx = d > 0 ? b.x : L - b.x; // ball progress in team frame
    let back, len, wf;
    if (attacking) { back = clamp(bx - 38 + T.mentality * 4 + T.line * 2, 14, 52); len = 40 + T.mentality * 4; wf = 0.72 + T.width * 0.1; }
    else { back = clamp(bx - 30, 8, [18, 26, 36][T.line] - (1 - T.mentality) * 3); len = [26, 30, 34][T.line] - (2 - T.pressing) - (1 - T.mentality) * 3; wf = 0.5 + T.width * 0.04; }
    const shiftY = (b.y - W / 2) * (attacking ? 0.25 : 0.42);
    for (const q of this.players) {
      if (!q.onPitch || q.side !== s) continue;
      const sl = f[q.slot] || f[1];
      let tx, ty;
      if (q.slot === 0) { tx = attacking ? clamp(bx - 50, 4, 18) : clamp(2 + bx * 0.04, 2, 7); ty = W / 2 + (b.y - W / 2) * 0.12; }
      else {
        tx = back + sl[1] * len + (attacking && sl[0] === 'FW' ? 6 : 0); ty = W / 2 + (sl[2] - 0.5) * W * wf + shiftY;
      }
      // convert to absolute
      let ax = d > 0 ? tx : L - tx;
      if (attacking && sl[0] === 'FW') { const ol = olines[s]; ax = d > 0 ? Math.min(ax, ol - 0.6 + q.runOff) : Math.max(ax, ol + 0.6 - q.runOff); }
      q.tx = clamp(ax, 0.5, L - 0.5); q.ty = clamp(ty, 1, W - 1); q.urgent = 0;
    }
  }
  // marking: defenders pick up attackers in their own third, staying goal-side
  for (const s of [0, 1]) {
    if (ownerSide === s) continue;
    const d = this.dir(s), ownGoal = d > 0 ? 0 : L;
    for (const a of this.players) {
      if (!a.onPitch || a.side === s || a.slot === 0) continue;
      if (Math.abs(a.x - ownGoal) > 36) continue;
      let best = null, bd = [15, 12, 9][this.teams[s].tactics.mentality];
      for (const q of this.players) { if (!q.onPitch || q.side !== s || q.slot === 0 || q.marking === this.tick) continue; const dd = dist(q.tx, q.ty, a.x, a.y); if (dd < bd) { bd = dd; best = q; } }
      if (best) { best.marking = this.tick; best.tx = a.x - d * 1.6; best.ty = a.y + (W / 2 - a.y) * 0.08; best.urgent = dist(a.x, a.y, b.x, b.y) < 22 ? 0.7 : 0; }
    }
  }
  // pressing and ball chasing
  const chase = (side, n, x, y, urg) => {
    for (let k = 0; k < n; k++) {
      let best = null, bd = 1e9;
      for (const q of this.players) { if (!q.onPitch || q.side !== side || q.slot === 0 || q.injured || q.chased === this.tick) continue; const dd = dist(q.x, q.y, x, y); if (dd < bd) { bd = dd; best = q; } }
      if (!best) return; best.tx = x; best.ty = y; best.urgent = urg; best.chased = this.tick;
    }
  };
  if (b.owner >= 0) {
    const o = this.players[b.owner], tm = this.teams[1 - o.side];
    const ownHalf = (o.x - L / 2) * this.dir(o.side) < 0;
    const pr = tm.tactics.pressing;
    const n = pr === 2 ? 2 : pr === 1 ? (ownHalf ? 1 : 2) : 1;
    chase(1 - o.side, n, o.x, o.y, pr === 0 && ownHalf ? 0.6 : 1);
    if (o.carry) { o.tx = o.carry.tx; o.ty = o.carry.ty; o.urgent = 0.85; } else { o.tx = o.x; o.ty = o.y; }
    // defending side: nearest defenders goal-side track the carrier in their own third; keeper rushes out in the box
    const dd = this.dir(1 - o.side), fx = dd > 0 ? o.x : L - o.x;
    if (fx < 38) chase(1 - o.side, fx < 20 ? 2 : 1, o.x - dd * 1.2, o.y, 1);
    const gk = this.players.find(q => q.onPitch && q.side !== o.side && q.slot === 0);
    if (gk && fx < 14 && Math.abs(o.y - W / 2) < 12) { gk.tx = o.x - dd * 1; gk.ty = o.y; gk.urgent = 1; }
  } else if (b.flight && (b.flight.kind === 'pass' || b.flight.kind === 'cross' || b.flight.kind === 'clear')) {
    const f = b.flight;
    if (f.recv >= 0) { const m = this.players[f.recv]; m.tx = f.tx; m.ty = f.ty; m.urgent = 1; }
    else chase(f.kind === 'clear' ? this.players[f.passer].side : 0, 1, f.tx, f.ty, 1);
    chase(1 - this.players[f.passer].side, 1, f.tx, f.ty, 1);
  } else if (!b.flight) { chase(0, 1, b.x, b.y, 1); chase(1, 1, b.x, b.y, 1); }
};
P._restartTargets = function () {
  const r = this.restart, b = this.ball;
  for (const q of this.players) {
    if (!q.onPitch) continue;
    if (r.type === 'kickoff') { const d = this.dir(q.side), own = d > 0 ? Math.min(q.tx, L / 2 - 1) : Math.max(q.tx, L / 2 + 1); q.tx = own; }
    if (r.type === 'penalty' && q.slot !== 0) { const inBox = Math.abs(q.ty - W / 2) < BOX_HALF + 1 && Math.abs(q.tx - b.x) < 9; if (inBox) q.tx = b.x + (b.x > L / 2 ? -11 : 11); }
    if (q.side !== r.side) { const dd = dist(q.tx, q.ty, b.x, b.y); if (dd < 9.5 && q.slot !== 0) { const a = Math.atan2(q.ty - b.y, q.tx - b.x); q.tx = b.x + Math.cos(a) * 9.6; q.ty = b.y + Math.sin(a) * 9.6; } }
    if (r.type === 'corner') {
      const d = this.dir(r.side), gx = d > 0 ? L : 0;
      if (q.slot !== 0 && (q.side === r.side ? q.p.role !== 'MF' || q.slot % 2 : true)) { if (Math.abs(q.tx - gx) > 18 && q.side !== r.side || q.side === r.side && q.p.role !== 'MF') { q.tx = gx - d * (5 + (q.slot % 4) * 3); q.ty = W / 2 + ((q.slot * 7) % 13 - 6); } }
    }
    q.urgent = 0;
  }
  const t = this.players[r.taker]; if (t) { t.tx = b.x; t.ty = b.y; t.urgent = 1; }
};
P._move = function () {
  for (const q of this.players) { q.px = q.x; q.py = q.y; }
  for (const q of this.players) {
    if (!q.onPitch) continue;
    if (q.tackleCd > 0) q.tackleCd -= DT;
    const dx = q.tx - q.x, dy = q.ty - q.y, dd = Math.sqrt(dx * dx + dy * dy);
    if (!q.ePace || (this.tick + q.slot) % 20 === 0) { q.ePace = this.eff(q, 'pace'); q.eStam = this.eff(q, 'stamina'); }
    const top = (5.2 + q.ePace * 0.17) * (q.injured ? 0.6 : 1);
    if (!q.urgent && dd < 1.6) { q.speed = 0; continue; }
    let sp = q.urgent ? top * Math.max(0.55, q.urgent) : Math.min(top * 0.38, 0.3 + dd * 0.2);
    if (this.ball.owner >= 0 && this.players[this.ball.owner] === q) {
      sp *= 0.86;
      const d = this.dir(q.side);
      for (const o of this.players) { if (o.onPitch && o.side !== q.side && (o.px - q.px) * d > -0.3 && dist(o.px, o.py, q.px, q.py) < 2.2) { sp *= 0.3; break; } }
    }
    const step = Math.min(dd, sp * DT);
    if (dd > 0.01) { q.x += dx / dd * step; q.y += dy / dd * step; }
    q.speed = step / DT; q.st.dist += step;
    const stam = q.eStam;
    const press = this.teams[q.side].tactics.pressing, tempo = this.teams[q.side].tactics.tempo;
    q.cond = Math.max(0.2, q.cond - DT * (3.6e-5 + 1.7e-6 * q.speed * q.speed) * (1.55 - stam / 20) * (0.8 + 0.2 * press + 0.05 * tempo) * (q.side === this.ball.lastSide ? 1 : 0.9 + 0.12 * press));
  }
};

// ----- the tick -----
P.step = function () {
  if (this.finished) return;
  this.tick++;
  const b = this.ball; b.px = b.x; b.py = b.y; b.pz = b.z;
  if (this.phase === 'halftime') { this._startSecondHalf(); return; }
  this.t += DT;
  // added time + half end
  if (this.t >= HALF && !this.addedAnnounced) {
    this.addedAnnounced = true;
    const base = this.half === 1 ? 1 : 3;
    const extra = (this.goalsThisHalf || 0) * 0.5 + this.teams.reduce((s, tm) => s + tm.stats.reds, 0) * 0.5 + (this.injuries || 0) * 0.8 + (this.half === 2 ? 0.4 * this.teams.reduce((s, tm) => s + tm.subsUsed, 0) : 0);
    this.added[this.half - 1] = clamp(Math.round(base + extra + this.rng() * 2), 1, this.half === 1 ? 6 : 12);
    this._emit({ type: 'addedtime', text: '+' + this.added[this.half - 1] + ' minutes added' });
  }
  if (this.t >= HALF + this.added[this.half - 1] * 60 && !(b.flight && b.flight.kind === 'shot')) { this._endHalf(); return; }
  // possession time + minutes
  const os = b.owner >= 0 ? this.players[b.owner].side : b.lastSide;
  if (this.phase === 'play') this.teams[os].stats.possession += DT;
  const mi = Math.floor(this.clockSec() / 60);
  while (this.momentum.length <= mi) this.momentum.push([0, 0]);
  while (this.possMin.length <= mi) { this.possMin.push([0, 0]); this.boxMin.push([0, 0]); this.f3Min.push([0, 0]); }
  if (this.phase === 'play') this.possMin[mi][os] += DT;
  if (b.owner >= 0) {
    const o = this.players[b.owner], d = this.dir(o.side); const fx = d > 0 ? o.x : L - o.x;
    if (fx > 70) this.momentum[mi][o.side] += 0.0035 * (fx - 70) / 35;
    // entries are counted once per possession: a possession that reaches the final third / the box
    const zone = fx > L - BOX_D && Math.abs(o.y - W / 2) < BOX_HALF ? 2 : fx > 70 ? 1 : 0;
    if (this._possSide !== o.side) { this._possSide = o.side; this._zone = [0, 0]; this._zone[o.side] = zone; }
    const prev = this._zone[o.side];
    if (zone >= 1 && prev < 1) { this.f3Min[mi][o.side]++; this.teams[o.side].stats.f3Entries++; }
    if (zone === 2 && prev < 2) { this.boxMin[mi][o.side]++; this.teams[o.side].stats.boxEntries++; }
    if (zone > prev) this._zone[o.side] = zone;
  }

  if (this.phase === 'dead') {
    this._targets(); this._restartTargets(); this._move();
    const r = this.restart; if (!r) { this.phase = 'play'; return; }
    r.timer -= DT;
    const t = this.players[r.taker];
    if (r.timer <= 0 && (!t || dist(t.x, t.y, r.x, r.y) < 1.5 || r.timer < -6)) this._resume();
    b.x = this.restart ? this.restart.x : b.x; b.y = this.restart ? this.restart.y : b.y;
    if (this.tick % 40 === 0) this._aiAll();
    return;
  }
  this._targets(); this._move();
  // ball
  if (b.owner >= 0) {
    const o = this.players[b.owner];
    if (!o.onPitch) { b.owner = -1; }
    else {
      const d = this.dir(o.side); b.x = o.x + d * 0.5; b.y = o.y; b.z = 0;
      this.decisionT -= DT;
      if (this.decisionT <= 0) {
        if (o.carry && o.slot !== 0) o.carry = null;
        const T = this.teams[o.side].tactics;
        this._decide(b.owner);
        const pr = this._nearestOpp(o).d;
        this.decisionT = ([2.4, 1.9, 1.5][T.tempo] + this.rng() * 1.1) * (pr < 3 ? 0.6 : 1);
        if (!this.ball.flight && this.ball.owner >= 0 && o.carry == null && o.slot === 0) this.decisionT = 0.5;
      }
      if (this.ball.owner >= 0 && this.phase === 'play') this._tackles();
    }
  } else if (b.flight) this._flight();
  else this._looseBall();
  // out of play from loose ball
  if (this.phase === 'play' && b.owner < 0 && !b.flight) this._checkOut();
  if (this.tick % 40 === 0) this._aiAll();
  if (this.tick % 8 === 0) for (const q of this.players) if (q.onPitch && q.p.role === 'FW') q.runOff = this.rng() < 0.18 ? 1.5 + this.rng() * 3 : q.runOff * 0.6 + (this.rng() - 0.5) * 1.6;
};
P._aiAll = function () {
  for (const s of [0, 1]) {
    const human = this.control === 'both' || (this.control === 'home' && s === 0) || (this.control === 'away' && s === 1);
    if (!human) this._ai(s);
    else { const inj = this.onPitch(s).find(q => q.injured && !this.teams[s].pending.some(c => c.outId === q.id)); if (inj && this.teams[s].subsUsed < 5 && this.teams[s].windowsUsed < 3) this._aiSub(s, inj); }
  }
};
P._tackles = function () {
  const b = this.ball, oi = b.owner, o = this.players[oi], r = this.rng;
  const press = this.teams[1 - o.side].tactics.pressing;
  for (let i = 0; i < this.players.length; i++) {
    const t = this.players[i];
    if (!t.onPitch || t.side === o.side || t.tackleCd > 0) continue;
    if (dist(t.x, t.y, o.x, o.y) > 1.4) continue;
    if (t.slot === 0) { t.tackleCd = 1.5; if (r() < 0.35 + this.eff(t, 'keeping') / 60) { t.st.claims = (t.st.claims || 0) + 1; this._give(i); this.decisionT = 1.5; return; } continue; }
    const td = this.dir(t.side), ownThird = (td > 0 ? o.x : L - o.x) < 35;
    if (r() > [0.018, 0.025, 0.034][press] * (ownThird ? 2.3 : 1)) continue;
    t.tackleCd = 2.4;
    const pw = clamp(0.42 + (this.eff(t, 'tackling') - this.eff(o, 'dribbling')) / 45, 0.12, 0.8);
    if (r() < pw) {
      t.st.tackles++; this.teams[t.side].stats.tackles++;
      const d = this.dir(t.side), fx = d > 0 ? t.x : L - t.x; if (fx > 70) this.teams[t.side].stats.finalThirdWins++;
      if (r() < 0.0015) this._injure(oi);
      if (r() < 0.7) this._give(i); else this._loose(b.x, b.y, (r() - 0.5) * 10, (r() - 0.5) * 10);
      return;
    }
    const dd = this.dir(o.side), inBox = Math.abs(o.y - W / 2) < BOX_HALF && (dd > 0 ? o.x > L - BOX_D : o.x < BOX_D);
    if (r() < (TUNING.foulBase + TUNING.foulPress * press + (this.eff(t, 'tackling') < 9 ? 0.015 : 0)) * (inBox ? 0.06 : ownThird ? 0.5 : 1) * (t.yellow ? 0.35 : 1)) { this._foul(i, oi); return; }
    o.tackleImmune = 0.6;
  }
};
P._flight = function () {
  const b = this.ball, f = b.flight, r = this.rng;
  f.el += DT; const u = Math.min(1, f.el / f.dur);
  b.x = f.sx + (f.tx - f.sx) * u; b.y = f.sy + (f.ty - f.sy) * u; b.z = 4 * f.h * u * (1 - u);
  if (f.kind === 'shot') { if (u >= 1) { b.flight = null; this._resolveShot(f); } return; }
  // interception
  if (b.z < 2.2 && f.el > 0.15) {
    for (let i = 0; i < this.players.length; i++) {
      const q = this.players[i];
      if (!q.onPitch || q.side === this.players[f.passer].side) continue;
      const dd = dist(q.x, q.y, b.x, b.y);
      if (dd < 1.5 && r() < (q.slot === 0 ? 0.7 : 0.13 * (this.eff(q, 'tackling') + this.eff(q, 'positioning')) / 22)) { this._give(i); return; }
    }
  }
  if (u >= 1) {
    const passer = this.players[f.passer], tm = this.teams[passer.side];
    // receiver first, then anyone close
    let take = -1, bd = 2.2;
    for (let i = 0; i < this.players.length; i++) { const q = this.players[i]; if (!q.onPitch) continue; const dd = dist(q.x, q.y, b.x, b.y) - (i === f.recv ? 0.6 : 0) + (q.side !== passer.side ? 0.3 : 0) + this.rng() * 0.5; if (dd < bd) { bd = dd; take = i; } }
    if (b.x < 0 || b.x > L || b.y < 0 || b.y > W) { b.flight = null; b.vx = 0; b.vy = 0; this._checkOut(); return; }
    if (take >= 0) {
      const q = this.players[take];
      if (q.side === passer.side && f.kind !== 'clear') { tm.stats.passesOk++; passer.st.passesOk++; }
      if (f.kind === 'cross' && q.side === passer.side && Math.abs(q.x - (this.dir(q.side) > 0 ? L : 0)) < 17) {
        // contested header
        const opp = this._nearestOpp(q);
        const win = opp.d > 2 ? 0.8 : clamp(0.42 + (this.eff(q, 'heading') - this.eff(this.players[opp.i], 'heading')) / 30, 0.15, 0.75);
        if (r() < win) { this.ball.owner = -1; this.ball.lastSide = q.side; q.x = b.x; q.y = b.y; this.ball.z = 1.8; this._shoot(take, { header: true }); return; }
        take = opp.i;
        if (r() < 0.32) { const ad = this.dir(q.side); this.teams[q.side].stats.corners++; this._emit({ type: 'corner', side: q.side, text: 'Headed behind. Corner to ' + this.teams[q.side].name }); this._setRestart('corner', q.side, ad > 0 ? L - 0.3 : 0.3, b.y < W / 2 ? 0.3 : W - 0.3, 6); return; }
        const c = this.players[take]; const d = this.dir(c.side);
        this._give(take); this._kick(take, clamp(c.x + d * 30, 2, L - 2), clamp(c.y + (r() - 0.5) * 30, 2, W - 2), 'clear', -1, 5); return;
      }
      this._give(take);
    } else { const dx = f.tx - f.sx, dy = f.ty - f.sy, D = Math.sqrt(dx * dx + dy * dy) || 1; this._loose(b.x, b.y, dx / D * 4, dy / D * 4); }
  }
};
P._looseBall = function () {
  const b = this.ball, fr = Math.pow(0.5, DT);
  b.x += b.vx * DT; b.y += b.vy * DT; b.vx *= fr; b.vy *= fr;
  let take = -1, bd = 1e9;
  for (let i = 0; i < this.players.length; i++) { const q = this.players[i]; if (!q.onPitch || q.injured) continue; const dd = dist(q.x, q.y, b.x, b.y); if (dd >= 1.1) continue; const sc = dd + this.rng() * 0.8 - this.eff(q, 'pace') * 0.01; if (sc < bd) { bd = sc; take = i; } }
  if (take >= 0 && b.x >= 0 && b.x <= L && b.y >= 0 && b.y <= W) this._give(take);
};
P._checkOut = function () {
  const b = this.ball, r = this.rng;
  if (b.y < 0 || b.y > W) {
    const side = 1 - b.lastSide;
    this._setRestart('throwin', side, clamp(b.x, 1, L - 1), b.y < 0 ? 0 : W, 3);
    this.restart.isThrow = true;
    return true;
  }
  if (b.x < 0 || b.x > L) {
    const goalEnd = b.x < 0 ? 0 : L;
    // which team defends this end?
    const defSide = this.dir(0) > 0 ? (goalEnd === 0 ? 0 : 1) : (goalEnd === 0 ? 1 : 0);
    if (b.lastSide === defSide) { this.teams[1 - defSide].stats.corners++; this._emit({ type: 'corner', side: 1 - defSide, text: 'Corner to ' + this.teams[1 - defSide].name }); this._setRestart('corner', 1 - defSide, goalEnd === 0 ? 0.3 : L - 0.3, b.y < W / 2 ? 0.3 : W - 0.3, 6); }
    else this._setRestart('goalkick', defSide, goalEnd === 0 ? 5.5 : L - 5.5, W / 2 + (r() - 0.5) * 12, 5);
    return true;
  }
  return false;
};
// restarts that are not shots/crosses: taker plays a short or long pass
const _origResume = P._resume;
P._resume = function () {
  const r = this.restart;
  _origResume.call(this);
  if (!r || this.phase !== 'play') return;
  const rt = r.type;
  if (rt === 'throwin' || rt === 'goalkick') {
    this.restartType = rt;
    const q = this.players[r.taker]; if (!q) return;
    const d = this.dir(q.side);
    let best = -1, bs = -1e9;
    this.players.forEach((m, j) => {
      if (!m.onPitch || m.side !== q.side || j === r.taker) return;
      const D = dist(q.x, q.y, m.x, m.y);
      const maxD = rt === 'throwin' ? 22 : (this.teams[q.side].tactics.passing === 2 ? 60 : 40);
      if (D > maxD || D < 5) return;
      const s = (m.x - q.x) * d * 0.05 - this._passRisk(q, m.x, m.y) * 2 + this.rng() * 0.6 - (rt === 'goalkick' && m.p.role === 'DF' && this.teams[q.side].tactics.passing === 2 ? 0.5 : 0);
      if (s > bs) { bs = s; best = j; }
    });
    if (best >= 0) { const m = this.players[best]; this._pass(r.taker, best, m.x, m.y, rt === 'throwin'); }
  }
};
P._endHalf = function () {
  if (this.half === 1) {
    this.phase = 'halftime';
    this.ball.flight = null; this.ball.owner = -1;
    this._emit({ type: 'halftime', text: 'Half-time: ' + this.teams[0].name + ' ' + this.teams[0].score + '–' + this.teams[1].score + ' ' + this.teams[1].name });
    return;
  }
  this.finished = true; this.phase = 'fulltime';
  for (const q of this.players) if (q.onPitch) q.st.offAt = this.clockSec();
  this._emit({ type: 'fulltime', text: 'Full time: ' + this.teams[0].name + ' ' + this.teams[0].score + '–' + this.teams[1].score + ' ' + this.teams[1].name });
};
P._startSecondHalf = function () {
  this._applyPending();
  this.half = 2; this.t = 0; this.addedAnnounced = false; this.goalsThisHalf = 0; this.injuries = 0;
  for (const q of this.players) { if (q.onPitch) { q.cond = Math.min(1, q.cond + 0.07); q.x = L - q.x; q.y = W - q.y; q.px = q.x; q.py = q.y; } }
  this._emit({ type: 'kickoff', side: 1 - this.firstKick, text: 'Second half under way' });
  this._setRestart('kickoff', 1 - this.firstKick, L / 2, W / 2, 2);
};

// ---------- running ----------
P.runUntil = function (stop) {
  stop = stop || {};
  const out = [], start = this.events.length, maxTicks = stop.ticks || 1e6;
  let n = 0;
  const want = stop.event ? [].concat(stop.event) : null;
  while (!this.finished && n < maxTicks) {
    const wasHT = this.phase === 'halftime';
    this.step(); n++;
    if (stop.minute != null && this.clockSec() >= stop.minute * 60) break;
    if (want) {
      let hit = false;
      for (let k = start + out.length; k < this.events.length; k++) { const e = this.events[k]; out.push(e); if (want.includes(e.type) || (want.includes('key') && e.key)) hit = true; }
      if (hit) break;
    }
    if (stop.pauseAtHalftime && this.phase === 'halftime' && !wasHT) break;
    if (n > 40000) break; // hard cap: never hang
  }
  return this.events.slice(start);
};
P.runToEnd = function () { let guard = 0; while (!this.finished && guard++ < 60000) this.step(); return this.result(); };

P.snapshot = function () {
  return { tick: this.tick, half: this.half, clock: this.clockLabel(), minute: this.minute(), phase: this.phase, score: [this.teams[0].score, this.teams[1].score],
    ball: Object.assign({}, this.ball), players: this.players.filter(q => q.onPitch).map(q => ({ id: q.id, side: q.side, num: q.p.num, x: q.x, y: q.y, px: q.px, py: q.py, cond: q.cond })) };
};

// ---------- results ----------
P.result = function () {
  const tsec = this.clockSec();
  const playerStats = this.players.map(q => {
    const on = q.st.onAt == null ? null : q.st.onAt, off = q.st.offAt == null ? tsec : q.st.offAt;
    const mins = on == null ? 0 : Math.max(0, Math.round((off - on) / 60));
    const tm = this.teams[q.side], opp = this.teams[1 - q.side];
    const pc = q.st.passes ? q.st.passesOk / q.st.passes : 0.8;
    let rating = 6.2 + q.st.goals * 1.0 + q.st.assists * 0.6 + q.st.xg * 0.6 + (pc - 0.78) * 2.5 + Math.min(1, q.st.tackles * 0.04) + q.st.saves * 0.18 - q.yellow * 0.3 - (q.red ? 1.5 : 0) + (tm.score > opp.score ? 0.3 : tm.score < opp.score ? -0.3 : 0);
    if (q.slot === 0) rating -= opp.score * 0.35;
    return { id: q.id, name: q.p.name, num: q.p.num, role: q.p.role, side: q.side, minutes: mins, rating: Math.round(clamp(rating, 3, 10) * 10) / 10,
      goals: q.st.goals, assists: q.st.assists, shots: q.st.shots, xg: q.st.xg, passes: q.st.passes, passPct: q.st.passes ? Math.round(100 * pc) : null, tackles: q.st.tackles, saves: q.st.saves, distKm: q.st.dist / 1000, endCondition: q.cond, yellow: q.yellow, red: q.red, injury: q.injured };
  }).filter(p => p.minutes > 0 || p.red);
  const pos = this.teams[0].stats.possession + this.teams[1].stats.possession || 1;
  const teamStats = this.teams.map(tm => Object.assign({}, tm.stats, { possessionPct: Math.round(100 * tm.stats.possession / pos), passPct: tm.stats.passes ? Math.round(100 * tm.stats.passesOk / tm.stats.passes) : 0 }));
  return {
    engineVersion: '0.1.0', seed: this.seed, score: [this.teams[0].score, this.teams[1].score], abandoned: this.abandoned, events: this.events, teamStats, playerStats,
    carryOver: playerStats.map(p => ({ playerId: p.id, name: p.name, side: p.side, minutesPlayed: p.minutes, endCondition: Math.round(p.endCondition * 100) / 100, injury: p.injury, yellow: p.yellow, red: p.red, suspension: p.red ? 1 : 0 })),
    explanation: this.explain(), momentum: this.momentum, xgTimeline: this.xgTimeline.concat([[tsec, this.teams[0].stats.xg, this.teams[1].stats.xg]]), commands: this.commands,
  };
};
P.explain = function () {
  const ev = this.events, names = this.teams.map(t => t.name), out = [];
  const xgAt = (t0, t1, s) => ev.filter(e => (e.type === 'shot' || e.type === 'goal') && e.side === s && e.t >= t0 && e.t < t1).reduce((a, e) => a + (e.xg || 0), 0);
  const end = this.clockSec();
  for (const e of ev.filter(e => e.type === 'red')) {
    const b0 = xgAt(Math.max(0, e.t - 1800), e.t, e.side), b1 = xgAt(Math.max(0, e.t - 1800), e.t, 1 - e.side);
    const a0 = xgAt(e.t, end, e.side), a1 = xgAt(e.t, end, 1 - e.side);
    const sb = b0 + b1 > 0 ? b0 / (b0 + b1) : 0.5, sa = a0 + a1 > 0 ? a0 / (a0 + a1) : 0.5;
    out.push({ title: 'Red card ' + e.minute + ' (' + names[e.side] + ')', body: 'xG share ' + Math.round(sb * 100) + '% → ' + Math.round(sa * 100) + '%', weight: 3, side: e.side, t: e.t });
  }
  for (const s of [0, 1]) {
    const subs = ev.filter(e => e.type === 'sub' && e.side === s && e.t > 55 * 60);
    if (subs.length) {
      const t0 = subs[0].t; const xa = xgAt(t0, end, s), xb = xgAt(Math.max(0, 2 * t0 - end), t0, s);
      out.push({ title: 'Changes from ' + subs[0].minute + ' (' + names[s] + ')', body: (xa - xb >= 0 ? '+' : '') + (xa - xb).toFixed(2) + ' xG vs the same span before', weight: Math.abs(xa - xb) * 3, side: s, t: t0 });
    }
    const tm = this.teams[s], d = tm.score - tm.stats.xg;
    if (Math.abs(d) > 0.7) out.push({ title: (d > 0 ? 'Clinical finishing' : 'Wasteful finishing') + ' (' + names[s] + ')', body: tm.score + ' goal' + (tm.score === 1 ? '' : 's') + ' from ' + tm.stats.xg.toFixed(2) + ' xG', weight: Math.abs(d) * 1.5, side: s });
    if (tm.stats.finalThirdWins >= 4) out.push({ title: 'Winning the ball high (' + names[s] + ')', body: tm.stats.finalThirdWins + ' balls won in the final third', weight: tm.stats.finalThirdWins / 4, side: s });
    const gk = this.players.find(q => q.side === s && q.slot === 0 && q.st.saves >= 4);
    if (gk) out.push({ title: 'Keeper stood tall (' + names[s] + ')', body: gk.p.name + ' made ' + gk.st.saves + ' saves', weight: gk.st.saves / 3, side: s });
  }
  out.sort((a, b) => b.weight - a.weight);
  const [h, a] = this.teams, xh = h.stats.xg, xa = a.stats.xg;
  let verdict;
  const w = h.score > a.score ? 0 : a.score > h.score ? 1 : -1;
  if (w < 0) verdict = 'A ' + h.score + '–' + a.score + ' draw; ' + (Math.abs(xh - xa) < 0.4 ? 'chances were even (' : (xh > xa ? names[0] : names[1]) + ' created the better chances (') + xh.toFixed(1) + ' to ' + xa.toFixed(1) + ' xG).';
  else {
    const wx = w === 0 ? xh : xa, lx = w === 0 ? xa : xh;
    verdict = names[w] + ' won ' + Math.max(h.score, a.score) + '–' + Math.min(h.score, a.score) + (wx >= lx ? ' and deserved it on xG (' : ' despite losing the xG battle (') + wx.toFixed(1) + ' to ' + lx.toFixed(1) + ')' + (out[0] ? '; key factor: ' + out[0].title.charAt(0).toLowerCase() + out[0].title.slice(1) + '.' : '.');
  }
  return { verdict, factors: out.slice(0, 4) };
};

// ---------- save / load / replay ----------
P.save = function () { return JSON.stringify({ config: this.config, commands: this.commands, tick: this.tick }); };
Match.load = function (s) { const o = JSON.parse(s); return Match.replay(o.config, o.commands, o.tick); };
Match.replay = function (config, commands, untilTick) {
  const m = new Match(config); if (m.errors) return m;
  const cmds = (commands || []).slice().sort((a, b) => a.tick - b.tick);
  let k = 0;
  const apply = () => { while (k < cmds.length && cmds[k].tick <= m.tick) { const c = cmds[k++]; if (c.kind === 'sub') m.substitute(c.side, c.outId, c.inId); else if (c.kind === 'tactics') m.setTactics(c.side, c.tactics); else if (c.kind === 'formation') m.setFormation(c.side, c.formation); else if (c.kind === 'cancel') m.cancelPending(c.side, c.idx); } };
  while (!m.finished && (untilTick == null || m.tick < untilTick)) { apply(); m.step(); }
  return m;
};
P._addThreat = function (s, xg) { const mi = Math.floor(this.clockSec() / 60); while (this.momentum.length <= mi) this.momentum.push([0, 0]); this.momentum[mi][s] += xg; };

function simulateMatch(config) { const m = new Match(config); if (m.errors) return { errors: m.errors }; return m.runToEnd(); }

export {
  Match, simulateMatch, validateLineup, generateSquad, makeTeam, autoPick, positionFit, roleRating,
  FORMATIONS, TACTIC_KEYS, TACTIC_LABELS, DEFAULT_TACTICS, ATTRS, makeRng,
};
export const PITCH = { L, W };
