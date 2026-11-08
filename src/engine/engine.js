/* Match Engine — a compact, deterministic 2D tick engine.
 Pitch: x 0..105 (length), y 0..68 (width), metres. One tick = 0.25 s of game time.
 Same inputs + seed + command log => identical match. */
const L = 105, W = 68, DT = 0.25, HALF = 2700;
// Periods: two halves of 45 minutes, then (knockout matches only) two halves of 15 minutes of extra time.
const PERIOD_LEN = [0, 2700, 2700, 900, 900], PERIOD_START = [0, 0, 2700, 5400, 6300], PERIOD_END_MIN = [0, 45, 90, 105, 120];
const GOAL_HALF = 3.66, BOX_D = 16.5, BOX_HALF = 20.16;

// Numbers adjusted by tools/calibrate.mjs so the engine matches real league data (see README).
const TUNING = {
  shotBase: 0.0088,      // chance a carrier shoots from a position of almost no value
  shotSlope: 0.68,      // how quickly that chance rises with shot quality (xG)
  finishing: 1.09,      // multiplier on the chance an on-target shot scores
  foulBase: 0.08,      // chance a tackle attempt is a foul
  foulPress: 0.02,     // extra foul chance per level of pressing
  yellowBase: 0.186,     // chance a foul is booked
  homeAdvantage: 0.55,   // attribute points the home side gains on every skill
  onTarget: 0.25,        // base chance a shot is on target, before skill and shot quality
  offsideTiming: 7.8,   // how badly forwards mistime runs (bigger means more offsides)
};
// Tactical trade-offs. The 2D model produces most effects of a tactic by itself (shape, pressing runs, pass
// length, decision speed, stamina), but it is too coarse to make every option cost something, so each setting
// also scales the quality of the chances a side creates or concedes (1 = no effect). Tuned with npm run balance.
const TACTIC_EDGE = {
  // our setting -> multiplier on the chances the opponent creates against us
  concede: { mentality: [0.82, 1, 1.18], pressing: [0.93, 1, 1.06], line: [0.92, 1, 1.12], tempo: [0.97, 1, 1.12], width: [1, 1, 1], passing: [1, 1, 1] },
  // our setting -> multiplier on the chances we create
  create: { mentality: [1, 1, 1], pressing: [1, 1, 1], line: [1, 1, 1], tempo: [0.97, 1, 0.96], width: [0.97, 1, 1.03], passing: [0.95, 1, 1.07] },
  // our width -> multiplier on central chances against us (a narrow block protects the middle, a wide one leaves gaps)
  centralConcede: [0.88, 1, 1.06],
  // our width -> multiplier on headed chances against us from crosses (a narrow block lets the opponent cross)
  crossConcede: [1.15, 1, 0.9],
};
// Formation trade-offs on the same scale: [chances created, chances conceded]
const FORMATION_EDGE = { '4-3-3': [1, 1], '4-4-2': [1.09, 0.95], '4-2-3-1': [0.93, 1.03], '3-5-2': [1.03, 0.98], '5-3-2': [1.02, 0.94] };
// Rock-paper-scissors between styles: [our tactic, option, their tactic, option, multiplier on our chances]
const MATCHUPS = [
  ['passing', 2, 'line', 2, 1.18, 'direct balls in behind a high line'],
  ['passing', 0, 'pressing', 2, 0.86, 'playing out from the back into a high press'],
  ['passing', 0, 'pressing', 0, 1.1, 'patient passing against a passive block'],
  ['passing', 2, 'line', 0, 0.88, 'long balls into a deep, crowded box'],
  ['tempo', 2, 'line', 0, 0.92, 'rushing against a set deep defence'],
  ['tempo', 0, 'pressing', 2, 0.9, 'slow build-up against a high press'],
  ['width', 2, 'width', 0, 1.08, 'wide play stretching a narrow block'],
  ['width', 0, 'pressing', 0, 0.9, 'a narrow attack into a compact low block'],
];
const FORMATIONS = {
  '4-3-3': [['GK', 0, .5], ['DF', .03, .1], ['DF', 0, .37], ['DF', 0, .63], ['DF', .03, .9], ['MF', .42, .28], ['MF', .34, .5], ['MF', .42, .72], ['FW', .9, .14], ['FW', 1, .5], ['FW', .9, .86]],
  '4-4-2': [['GK', 0, .5], ['DF', .03, .1], ['DF', 0, .37], ['DF', 0, .63], ['DF', .03, .9], ['MF', .56, .1], ['MF', .38, .38], ['MF', .38, .62], ['MF', .56, .9], ['FW', .98, .36], ['FW', .95, .62]],
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
const ENGINE_VERSION = '0.3.0';
const KEY_EVENTS = { shootoutkick: 1, extratime: 1, goal: 1, yellow: 1, red: 1, sub: 1, injury: 1, halftime: 1, fulltime: 1, penalty: 1, abandoned: 1, disallowed: 1 };

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
  this.tick = 0; this.half = 1; this.t = 0; this.added = [0, 0, 0, 0];
  // Knockout ties: true, or { aggregate: [home, away] } with the goals each side scored in earlier legs.
  this.knockout = config.knockout ? { aggregate: (config.knockout.aggregate || [0, 0]).slice(0, 2) } : null;
  this.shootout = null; this.winner = null;
  this.phase = 'dead'; this.finished = false; this.abandoned = null;
  // Every field the match uses is created here, so the object keeps one shape (much faster in V8).
  this.stoppage = 0; this.goalsThisHalf = 0; this.injuries = 0; this.addedAnnounced = false; this.restartType = null;
  this.kickT = 0; this.subTimes = []; this._possSide = -1; this._ballKey = -99; this.restart = null; this.decisionT = 0;
  this.lastPasser = -1; this.lastPasserT = -99; this._edge = [1, 1]; this._central = [1, 1]; this._crossEdge = [1, 1]; this._cutOut = [1, 1]; this._edgeSum = [0, 0]; this._edgeN = 0; this._side = [[], []];
  this.gkHands = -1; this.gkHandsT = 0; this.advantage = null; this.pendingCards = [];
  this.events = []; this.commands = []; this.listeners = [];
  this.momentum = []; // per minute [homeThreat, awayThreat]
  this.possMin = []; this.boxMin = []; this.f3Min = []; this._zone = [0, 0];
  this.xgTimeline = [[0, 0, 0]];
  this.firstKick = this.rng() < 0.5 ? 0 : 1;
  this.teams = [config.home, config.away].map((sheet, s) => ({
    side: s, sheet, name: sheet.name, short: sheet.short, color: sheet.color, formation: sheet.formation,
    tactics: Object.assign({}, sheet.tactics), score: 0, subsUsed: 0, windowsUsed: 0, pending: [], windowStoppage: -1, aiChased: false, aiProtect: false, bench: null,
    stats: { boxEntries: 0, f3Entries: 0, possession: 0, shots: 0, onTarget: 0, xg: 0, passes: 0, passesOk: 0, corners: 0, fouls: 0, yellows: 0, reds: 0, offsides: 0, tackles: 0, finalThirdWins: 0, saves: 0 },
  }));
  this._updateEdges();
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
  this._sides(); this._targets(); this._restartTargets();
  for (const q of this.players) { q.x = q.px = q.tx; q.y = q.py = q.ty; }
}
const P = Match.prototype;

P._mkRuntime = function (p, side, slot, onPitch) {
  return { id: p.id, p, side, slot, onPitch, x: 0, y: 0, px: 0, py: 0, tx: 0, ty: 0, urgent: 0, chased: -1, marking: -1, carry: null, fit: 1, fitSlot: -1, fitForm: null, tackleImmune: 0, ePace: 0, eStam: 0, cond: p.condition == null ? 1 : p.condition, speed: 0, yellow: 0, red: false, redReason: null, injured: null, subOff: false, tackleCd: 0, runOff: 0,
    st: { ownGoals: 0, claims: 0, minutes: 0, passes: 0, passesOk: 0, shots: 0, goals: 0, assists: 0, xg: 0, tackles: 0, fouls: 0, saves: 0, dist: 0, onAt: onPitch ? 0 : null, offAt: null } };
};
P.dir = function (side) { return (side === 0) === (this.half % 2 === 1) ? 1 : -1; }; // teams change ends every period
P.clockSec = function () { return PERIOD_START[this.half] + this.t; };
P.minute = function () { return Math.min(PERIOD_END_MIN[this.half], Math.floor(this.clockSec() / 60) + 1); };
P.clockLabel = function () {
  if (this.t >= PERIOD_LEN[this.half]) { const ex = Math.floor((this.t - PERIOD_LEN[this.half]) / 60) + 1; return PERIOD_END_MIN[this.half] + '+' + ex; }
  const s = Math.floor(this.clockSec()); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
P.minuteLabel = function () { const len = PERIOD_LEN[this.half]; return this.t >= len ? PERIOD_END_MIN[this.half] + '+' + (Math.floor((this.t - len) / 60) + 1) + '′' : this.minute() + '′'; };
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
  this.advantage = null; this.gkHands = -1;
  // cards held back while the referee played advantage are shown at the next stoppage (Law 5)
  if (this.pendingCards.length) { const pc = this.pendingCards; this.pendingCards = []; for (const c of pc) this._card(c.ti, c.card, c.why); }
  this.phase = 'dead'; this.ball.owner = -1; this.ball.flight = null; this.ball.z = 0;
  this.ball.x = clamp(x, 0, L); this.ball.y = clamp(y, 0, W);
  let taker = -1, best = 1e9;
  this.players.forEach((q, i) => {
    if (!q.onPitch || q.side !== side) return;
    const gk = q.slot === 0;
    if (type === 'goalkick') { if (gk) taker = i; return; }
    if (gk && type !== 'freekick' && !(type === 'dropball' && this._inOwnBox(side, x, y))) return;
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
  this.gkHands = -1;
};
// Goalkeeper gains control of the ball. In his own penalty area he may use his hands unless the ball was
// deliberately kicked to him by a team-mate (Law 12.2). Holding it for more than 8 seconds gives a corner.
P._giveKeeper = function (i, fromTeammate) {
  const q = this.players[i];
  this._give(i);
  if (!this._inOwnBox(q.side, q.x, q.y)) return;
  if (fromTeammate) {
    if (this.rng() < 0.002) this._foul(i, -1, 'backpass'); // picks up a deliberate back-pass
    return;
  }
  this.gkHands = i; this.gkHandsT = this.clockSec();
  const lead = this.teams[q.side].score - this.teams[1 - q.side].score, late = this.clockSec() > 75 * 60;
  this.decisionT = lead > 0 && late ? 2.5 + this.rng() * 5.58 : 1.6 + this.rng() * 3.4; // time-wasting when protecting a lead
};
P._inOwnBox = function (side, x, y) { const d = this.dir(side); return Math.abs(y - W / 2) < BOX_HALF && (d > 0 ? x < BOX_D : x > L - BOX_D); };
P._inBox = function (attSide, x, y) { return this._inOwnBox(1 - attSide, x, y); };

// ----- shooting -----
P._xg = function (x, y, side, pressure) {
  const d = this.dir(side), gx = d > 0 ? L : 0;
  const dd = dist(x, y, gx, W / 2);
  const a1 = Math.atan2(W / 2 + GOAL_HALF - y, Math.abs(gx - x)), a2 = Math.atan2(W / 2 - GOAL_HALF - y, Math.abs(gx - x));
  const ang = Math.abs(a1 - a2);
  let xg = 0.95 * Math.exp(-dd / 7.2) * Math.min(1, ang / 0.5);
  if (pressure < 1.5) xg *= 0.6; else if (pressure < 3) xg *= 0.82;
  xg *= this._edge[side] * (Math.abs(y - W / 2) < 9 ? this._central[1 - side] : 1);
  return clamp(xg, 0.005, 0.85);
};
P._shoot = function (i, o) {
  o = o || {};
  const q = this.players[i], tm = this.teams[q.side], opp = this.teams[1 - q.side], d = this.dir(q.side), r = this.rng;
  const gx = d > 0 ? L : 0;
  const press = this._nearestOpp(q).d;
  const xg = o.xg != null ? o.xg : this._xg(q.x, q.y, q.side, press) * (o.header ? 0.75 * this._crossEdge[1 - q.side] : 1);
  const shoot = (o.header ? this.eff(q, 'heading') : this.eff(q, 'shooting')) / 20;
  tm.stats.shots++; tm.stats.xg += xg; q.st.shots++; q.st.xg += xg;
  this._addThreat(q.side, xg);
  this.xgTimeline.push([this.clockSec(), this.teams[0].stats.xg, this.teams[1].stats.xg]);
  // blocked?
  let outcome, ty = W / 2;
  const blockers = o.penalty || o.freekick ? 0 : this.players.filter(p => p.onPitch && p.side !== q.side && p.slot !== 0 && segDist(p.x, p.y, q.x, q.y, gx, W / 2) < 1.2 && (p.x - q.x) * d > 0).length;
  if (blockers && r() < 0.45) outcome = 'blocked';
  else {
    const onT = o.penalty ? 0.82 : clamp(TUNING.onTarget + shoot * 0.22 + xg * 0.5 - (press < 1.5 ? 0.08 : 0), 0.15, 0.85);
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
    // Law 12: a goal scored straight after the scorer's own handball (even accidental) is disallowed
    if (!f.penalty && r() < 0.006) {
      this._emit({ type: 'disallowed', side: q.side, player: q.id, x: f.sx, y: f.sy, text: 'Goal disallowed: handball by ' + name });
      this._setRestart('freekick', opp, f.sx, f.sy, 5, { direct: true });
      return;
    }
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
    const blk = this._nearestOpp(q, this.ball.x, this.ball.y).i;
    if (blk >= 0) {
      const u = r();
      if (u < 0.013) { this._ownGoal(blk); return; }                       // deflected into his own net
      if (u < 0.027) { this._foul(blk, -1, 'handball', { denyGoal: f.xg > 0.25 && r() < 0.5 }); return; } // blocked with an arm
    }
    if (r() < 0.62) { this.teams[q.side].stats.corners++; this._emit({ type: 'corner', side: q.side, text: 'Corner to ' + tm.name }); this._setRestart('corner', q.side, d > 0 ? L - 0.3 : 0.3, r() < 0.5 ? 0.3 : W - 0.3, 6); }
    else this._loose(this.ball.x, this.ball.y, (r() - 0.5) * 8, (r() - 0.5) * 8);
    return;
  }
  if (f.outcome === 'saved') {
    const gk = this.players.findIndex(p => p.onPitch && p.side === opp && p.slot === 0);
    if (gk >= 0) { this.players[gk].st.saves++; this.teams[opp].stats.saves++; }
    this._emit({ type: 'shot', side: q.side, player: q.id, result: 'saved', xg: f.xg, x: f.sx, y: f.sy, text: name + ' forces a save · ' + xgs + ' xG' });
    const u = r();
    if (u < 0.5 && gk >= 0) { this.players[gk].x = this.ball.x - d * 1; this.players[gk].y = this.ball.y; this._giveKeeper(gk, false); }
    else if (u < 0.79) { this.teams[q.side].stats.corners++; this._emit({ type: 'corner', side: q.side, text: 'Corner to ' + tm.name }); this._setRestart('corner', q.side, d > 0 ? L - 0.3 : 0.3, this.ball.y < W / 2 ? 0.3 : W - 0.3, 6); }
    else this._loose(this.ball.x - d * 3, this.ball.y + (r() - 0.5) * 10, -d * (4 + r() * 4), (r() - 0.5) * 6);
    return;
  }
  this._emit({ type: 'shot', side: q.side, player: q.id, result: 'off', xg: f.xg, x: f.sx, y: f.sy, text: name + (f.header ? ' heads' : ' shoots') + ' wide · ' + xgs + ' xG' });
  this._setRestart('goalkick', opp, d > 0 ? L - 5.5 : 5.5, W / 2 + (r() - 0.5) * 12, 5);
};

P._ownGoal = function (di) {
  const q = this.players[di], scorer = 1 - q.side, tm = this.teams[scorer];
  tm.score++; q.st.ownGoals++; this.goalsThisHalf++;
  this._emit({ type: 'goal', side: scorer, player: q.id, ownGoal: true, xg: 0, text: 'OWN GOAL! ' + q.p.name + ' turns it into his own net', score: [this.teams[0].score, this.teams[1].score] });
  this._setRestart('kickoff', q.side, L / 2, W / 2, 6);
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
  const directW = [0.85, 1, 1.25][T.passing], maxLen = [32, 40, 55][T.passing], caution = [1.35, 1, 0.8][T.passing] * [1.15, 1, 0.9][T.tempo];
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
    let u = curV + prog * directW - risk * loss * caution - (offs && r() < 0.3 + vis / 60 ? 0.25 : 0) + (r() - 0.5) * noise + 0.012;
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
  if (this.gkHands === i && best.kind !== 'pass') best = { kind: 'clear' }; // ball in hands: throw or kick it, never dribble
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
  const err = (0.04 + (20 - pas) * 0.006 + (press < 2 ? 0.05 : 0)) * D * (isThrow ? 0.5 : 1) * [0.85, 1, 1.2][tm.tactics.tempo] * [0.8, 1, 1.2][tm.tactics.passing];
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
// Law 12. kind: 'challenge' (direct free kick or penalty), 'dangerous' (playing in a dangerous manner,
// indirect free kick), 'handball' (direct free kick or penalty), 'backpass' (keeper handles a back-pass, indirect).
P._foul = function (ti, oi, kind, o2) {
  kind = kind || 'challenge'; o2 = o2 || {};
  const t = this.players[ti], o = oi >= 0 ? this.players[oi] : null, r = this.rng, att = 1 - t.side, d = this.dir(att);
  const fx = o ? o.x : this.ball.x, fy = o ? o.y : this.ball.y;
  const tt = this.teams[t.side];
  if (kind !== 'backpass') { tt.stats.fouls++; t.st.fouls++; }
  const inBox = this._inBox(att, fx, fy);
  let goalSide = 0; for (const q of this._side[t.side]) if (q.slot !== 0 && q !== t && (q.x - fx) * d > 0) goalSide++;
  const lastMan = kind === 'challenge' && goalSide === 0 && Math.abs(fx - (d > 0 ? L : 0)) < 22 && Math.abs(fy - W / 2) < 15;
  const what = kind === 'handball' ? 'Handball by ' + t.p.name : kind === 'dangerous' ? 'Dangerous play by ' + t.p.name : kind === 'backpass' ? t.p.name + ' handles a back-pass' : 'Foul by ' + t.p.name + ' on ' + o.p.name;
  this._emit({ type: 'foul', offence: kind, side: t.side, player: t.id, victim: o ? o.id : undefined, text: what, x: fx, y: fy });
  // misconduct
  let card = null, why = '';
  const agg = [0.85, 1, 1.25][tt.tactics.pressing];
  if (kind === 'challenge') {
    if (lastMan && !inBox && r() < 0.08) { card = 'red'; why = 'denied an obvious goal-scoring opportunity'; }
    else if (r() < 0.0038) { card = 'red'; why = 'serious foul play'; }
    else if (r() < (TUNING.yellowBase * agg + (lastMan ? 0.4 : 0)) * (t.yellow ? 0.55 : 1)) { card = 'yellow'; why = lastMan ? (inBox ? 'penalty, denied a goal-scoring chance' : 'stopped a promising attack') : ''; }
  } else if (kind === 'handball') {
    if (o2.denyGoal) { card = 'red'; why = 'handball denied a goal'; }
    else if (r() < 0.3) { card = 'yellow'; why = 'handball stopped a promising attack'; }
  } else if (kind === 'dangerous' && r() < 0.12 * (t.yellow ? 0.5 : 1)) { card = 'yellow'; why = 'reckless play'; }
  if (kind === 'challenge' && o && r() < 0.015) this._injure(oi, false);
  // advantage: play on when the fouled side keeps the ball in a useful position (Law 5)
  const keeps = o && this.ball.owner === oi && this.phase === 'play';
  const fxa = d > 0 ? fx : L - fx;
  if ((kind === 'challenge' || kind === 'dangerous') && keeps && !inBox && fxa > 45 && r() < 0.4) {
    if (card) this.pendingCards.push({ ti, card, why });
    this.advantage = { side: att, x: fx, y: fy, until: this.clockSec() + 3, direct: kind === 'challenge' };
    this._emit({ type: 'advantage', side: att, player: o.id, text: 'Advantage played to ' + this.teams[att].name, x: fx, y: fy });
    for (const q of this._side[t.side]) if (dist(q.x, q.y, o.x, o.y) < 4) q.tackleCd = Math.max(q.tackleCd, 1.5); // let the advantage develop
    return;
  }
  if (card) this._card(ti, card, why);
  if (this.abandoned) return;
  const direct = kind === 'challenge' || kind === 'handball';
  if (inBox && direct) this._setRestart('penalty', att, d > 0 ? L - 11 : 11, W / 2, 7);
  else if (inBox) {
    // indirect free kick in the area: from the spot, or from the goal-area line if inside it
    const gx = d > 0 ? L : 0, ix = Math.abs(fx - gx) < 5.5 ? gx - d * 5.5 : fx;
    this._setRestart('freekick', att, ix, fy, 5, { direct: false });
  } else this._setRestart('freekick', att, fx, fy, 4, { direct });
};
P._card = function (ti, card, why) {
  const t = this.players[ti], tt = this.teams[t.side];
  if (!t.onPitch) return;
  if (card === 'yellow') {
    t.yellow++; tt.stats.yellows++;
    if (t.yellow >= 2) this._sendOff(ti, 'second yellow');
    else this._emit({ type: 'yellow', side: t.side, player: t.id, text: 'Yellow card: ' + t.p.name + (why ? ' (' + why + ')' : '') });
  } else this._sendOff(ti, why || 'serious foul play');
};
P._sendOff = function (ti, why) {
  const t = this.players[ti], tt = this.teams[t.side];
  t.red = true; t.redReason = why; t.onPitch = false; t.st.offAt = this.clockSec(); tt.stats.reds++;
  if (this.ball.owner === ti) this.ball.owner = -1;
  this._emit({ type: 'red', side: t.side, player: t.id, text: 'RED CARD: ' + t.p.name + ' (' + why + ')' });
  this._checkAbandon();
  if (t.slot === 0 && !this.finished) this._replaceKeeper(t.side);
};
// Law 3: a team must have a goalkeeper. After the keeper is sent off, an outfield player makes way for the
// substitute keeper; with no keeper or substitutions left, an outfield player goes in goal.
P._replaceKeeper = function (side) {
  const tm = this.teams[side];
  const gk = tm.bench.find(p => p.role === 'GK' && !tm.pending.some(c => c.inId === p.id));
  const out = this.onPitch(side).filter(q => q.slot !== 0 && !tm.pending.some(c => c.outId === q.id)).sort((a, b) => (b.p.role === 'FW') - (a.p.role === 'FW') || a.cond - b.cond)[0];
  if (gk && out && this.substitute(side, out.id, gk.id, true).ok) return;
  this._reslot(side);
};
P._injure = function (i, canStop) {
  const q = this.players[i]; if (q.injured || !q.onPitch) return false;
  const r = this.rng, kinds = ['hamstring strain', 'ankle knock', 'calf strain', 'knee sprain', 'groin strain', 'dead leg'];
  const days = Math.round(r() < 0.6 ? 2 + r() * 10 : 10 + r() * 45);
  q.injured = { type: kinds[Math.floor(r() * kinds.length)], days };
  this.injuries = (this.injuries || 0) + 1;
  this._emit({ type: 'injury', side: q.side, player: q.id, text: q.p.name + ' is injured (' + q.injured.type + ', about ' + days + ' days)' });
  if (canStop && days >= 10 && this.phase === 'play') {
    const b = this.ball, side = b.owner >= 0 ? this.players[b.owner].side : b.lastSide;
    this._emit({ type: 'stoppage', side, text: 'Play stopped for treatment; dropped ball to ' + this.teams[side].name });
    this._setRestart('dropball', side, b.x, b.y, 8);
    return true;
  }
  return false;
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
  const maxSubs = this._maxSubs();
  if (tm.subsUsed + queuedOut >= maxSubs) return { ok: false, error: 'No substitutions left (' + maxSubs + ' used)' };
  if (tm.pending.some(c => c.kind === 'sub' && (c.outId === outId || c.inId === inId))) return { ok: false, error: 'Already queued' };
  // Substitutions made during the same stoppage share one window.
  const sameStoppage = this.phase === 'dead' && tm.windowStoppage === this.stoppage;
  const newWindow = !tm.pending.some(c => c.kind === 'sub') && this.phase !== 'halftime' && !sameStoppage;
  if (newWindow && tm.windowsUsed >= this._maxWindows()) return { ok: false, error: 'All ' + this._maxWindows() + ' substitution windows used' };
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
    if (subs.length && this.phase !== 'halftime' && !(this.t === 0 && this.half > 1) && tm.windowStoppage !== this.stoppage) {
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
        if (inn.role === 'GK' && !this.onPitch(tm.side).some(q => q.slot === 0)) this._reslot(tm.side);
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
  this._updateEdges();
};
P._updateEdges = function () {
  for (let s = 0; s < 2; s++) {
    const T = this.teams[s].tactics, O = this.teams[1 - s].tactics;
    let m = 1;
    for (const k of TACTIC_KEYS) m *= TACTIC_EDGE.create[k][T[k]] * TACTIC_EDGE.concede[k][O[k]];
    for (const [k, v, ok, ov, mult] of MATCHUPS) if (T[k] === v && O[ok] === ov) m *= mult;
    m *= FORMATION_EDGE[this.teams[s].formation][0] * FORMATION_EDGE[this.teams[1 - s].formation][1];
    this._edge[s] = m;
    this._central[s] = TACTIC_EDGE.centralConcede[T.width];
    this._crossEdge[s] = TACTIC_EDGE.crossConcede[T.width];
    this._cutOut[s] = [0.8, 1, 1.15][T.passing] * [0.85, 1, 1.15][T.tempo]; // how often our passes are intercepted
  }
};
P._reslot = function (side) {
  const tm = this.teams[side], f = FORMATIONS[tm.formation];
  const ps = this.onPitch(side);
  const free = new Set(f.map((_, i) => i));
  const gk = ps.find(q => q.p.role === 'GK') || ps.slice().sort((a, b) => b.p.attrs.keeping - a.p.attrs.keeping)[0];
  if (!gk) return;
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
  const maxSubs = this._maxSubs();
  if (inj && tm.subsUsed < maxSubs) this._aiSub(side, inj);
  if (m < 57 || tm.subsUsed >= maxSubs || tm.pending.length) return;
  const windowAt = [58, 68, 79, 96][tm.windowsUsed];
  if (windowAt == null || m < windowAt) return;
  const tired = this.onPitch(side).filter(q => q.slot !== 0 && q.cond < 0.84).sort((a, b) => a.cond - b.cond);
  const n = Math.min(maxSubs - tm.subsUsed, tm.windowsUsed >= 2 && this.half <= 2 ? 5 : 2);
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
const LINE_BACK = [18, 26, 36], LINE_LEN = [26, 30, 34], MARK_RANGE = [15, 12, 9];
P._sides = function () { // on-pitch players per side, rebuilt each tick without allocating
  const s0 = this._side[0], s1 = this._side[1]; s0.length = 0; s1.length = 0;
  for (let i = 0; i < this.players.length; i++) { const q = this.players[i]; if (q.onPitch) (q.side === 0 ? s0 : s1).push(q); }
};
P._chase = function (side, n, x, y, urg) {
  const list = this._side[side], tick = this.tick;
  for (let k = 0; k < n; k++) {
    let best = null, bd = 1e18;
    for (let i = 0; i < list.length; i++) { const q = list[i]; if (q.slot === 0 || q.injured || q.chased === tick) continue; const dx = q.x - x, dy = q.y - y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = q; } }
    if (!best) return; best.tx = x; best.ty = y; best.urgent = urg; best.chased = tick;
  }
};
P._targets = function () {
  const b = this.ball, ownerSide = b.owner >= 0 ? this.players[b.owner].side : (b.flight ? b.lastSide : -1);
  for (let s = 0; s < 2; s++) {
    const tm = this.teams[s], T = tm.tactics, d = this.dir(s), f = FORMATIONS[tm.formation];
    const attacking = ownerSide === s;
    const ol = attacking ? this._offsideLine(s) : 0;
    const bx = d > 0 ? b.x : L - b.x; // ball progress in team frame
    let back, len, wf;
    if (attacking) { back = clamp(bx - 38 + T.mentality * 4 + T.line * 2, 14, 52); len = 40 + T.mentality * 4; wf = 0.72 + T.width * 0.1; }
    else { back = clamp(bx - 30, 8, LINE_BACK[T.line] - (1 - T.mentality) * 3); len = LINE_LEN[T.line] - (2 - T.pressing) - (1 - T.mentality) * 3; wf = 0.5 + T.width * 0.04; }
    const shiftY = (b.y - W / 2) * (attacking ? 0.25 : 0.42);
    const list = this._side[s];
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      const sl = f[q.slot] || f[1];
      let tx, ty;
      if (q.slot === 0) { tx = attacking ? clamp(bx - 50, 4, 18) : clamp(2 + bx * 0.04, 2, 7); ty = W / 2 + (b.y - W / 2) * 0.12; }
      else { tx = back + sl[1] * len + (attacking && sl[0] === 'FW' ? 6 : 0); ty = W / 2 + (sl[2] - 0.5) * W * wf + shiftY; }
      let ax = d > 0 ? tx : L - tx;
      if (attacking && sl[0] === 'FW') ax = d > 0 ? Math.min(ax, ol - 0.6 + q.runOff) : Math.max(ax, ol + 0.6 - q.runOff);
      q.tx = clamp(ax, 0.5, L - 0.5); q.ty = clamp(ty, 1, W - 1); q.urgent = 0;
    }
  }
  // marking: defenders pick up attackers in their own third, staying goal-side
  const tick = this.tick;
  for (let s = 0; s < 2; s++) {
    if (ownerSide === s) continue;
    const d = this.dir(s), ownGoal = d > 0 ? 0 : L, mine = this._side[s], theirs = this._side[1 - s];
    const range = MARK_RANGE[this.teams[s].tactics.mentality];
    for (let k = 0; k < theirs.length; k++) {
      const a = theirs[k];
      if (a.slot === 0 || Math.abs(a.x - ownGoal) > 36) continue;
      let best = null, bd = range * range;
      for (let i = 0; i < mine.length; i++) { const q = mine[i]; if (q.slot === 0 || q.marking === tick) continue; const dx = q.tx - a.x, dy = q.ty - a.y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = q; } }
      if (best) { best.marking = tick; best.tx = a.x - d * 1.6; best.ty = a.y + (W / 2 - a.y) * 0.08; best.urgent = dist(a.x, a.y, b.x, b.y) < 22 ? 0.7 : 0; }
    }
  }
  // pressing and ball chasing
  if (b.owner >= 0) {
    const o = this.players[b.owner], ds = 1 - o.side, tm = this.teams[ds];
    const ownHalf = (o.x - L / 2) * this.dir(o.side) < 0;
    const pr = tm.tactics.pressing;
    const n = pr === 2 ? 2 : pr === 1 ? (ownHalf ? 1 : 2) : 1;
    this._chase(ds, n, o.x, o.y, pr === 0 && ownHalf ? 0.6 : 1);
    this._carrierTarget();
    // defending side: nearest defenders goal-side track the carrier in their own third; keeper rushes out in the box
    const dd = this.dir(ds), fx = dd > 0 ? o.x : L - o.x;
    if (fx < 38) this._chase(ds, fx < 20 ? 2 : 1, o.x - dd * 1.2, o.y, 1);
    const gk = this._keeper(ds);
    if (gk && fx < 14 && Math.abs(o.y - W / 2) < 12) { gk.tx = o.x - dd * 1; gk.ty = o.y; gk.urgent = 1; }
  } else if (b.flight && (b.flight.kind === 'pass' || b.flight.kind === 'cross' || b.flight.kind === 'clear')) {
    const f = b.flight;
    if (f.recv >= 0) { const m = this.players[f.recv]; m.tx = f.tx; m.ty = f.ty; m.urgent = 1; }
    else this._chase(f.kind === 'clear' ? this.players[f.passer].side : 0, 1, f.tx, f.ty, 1);
    this._chase(1 - this.players[f.passer].side, 1, f.tx, f.ty, 1);
  } else if (!b.flight) { this._chase(0, 1, b.x, b.y, 1); this._chase(1, 1, b.x, b.y, 1); }
};
P._keeper = function (side) { const l = this._side[side]; for (let i = 0; i < l.length; i++) if (l[i].slot === 0) return l[i]; return null; };
// The ball carrier follows the ball every tick, even on ticks where the rest of the team keeps its plan.
P._carrierTarget = function () {
  const b = this.ball; if (b.owner < 0) return;
  const o = this.players[b.owner];
  if (o.carry) { o.tx = o.carry.tx; o.ty = o.carry.ty; o.urgent = 0.85; } else { o.tx = o.x; o.ty = o.y; }
};
P._restartTargets = function () {
  const r = this.restart, b = this.ball;
  for (const q of this.players) {
    if (!q.onPitch) continue;
    if (r.type === 'kickoff') { const d = this.dir(q.side), own = d > 0 ? Math.min(q.tx, L / 2 - 1) : Math.max(q.tx, L / 2 + 1); q.tx = own; }
    if (r.type === 'penalty' && q.slot !== 0) { const inBox = Math.abs(q.ty - W / 2) < BOX_HALF + 1 && Math.abs(q.tx - b.x) < 9; if (inBox) q.tx = b.x + (b.x > L / 2 ? -11 : 11); }
    if (q.side !== r.side) {
      const keep = r.type === 'throwin' ? 2.2 : r.type === 'dropball' ? 4.2 : 9.6; // Laws 15, 8 and 13
      const dd = dist(q.tx, q.ty, b.x, b.y); if (dd < keep && q.slot !== 0) { const a = Math.atan2(q.ty - b.y, q.tx - b.x); q.tx = b.x + Math.cos(a) * keep; q.ty = b.y + Math.sin(a) * keep; }
      if (r.type === 'goalkick' && this._inOwnBox(r.side, q.tx, q.ty)) q.tx = this.dir(r.side) > 0 ? BOX_D + 1 : L - BOX_D - 1;
    }
    if (r.type === 'corner') {
      const d = this.dir(r.side), gx = d > 0 ? L : 0;
      if (q.slot !== 0 && (q.side === r.side ? q.p.role !== 'MF' || q.slot % 2 : true)) { if (Math.abs(q.tx - gx) > 18 && q.side !== r.side || q.side === r.side && q.p.role !== 'MF') { q.tx = gx - d * (5 + (q.slot % 4) * 3); q.ty = W / 2 + ((q.slot * 7) % 13 - 6); } }
    }
    q.tx = clamp(q.tx, -0.5, L + 0.5); q.ty = clamp(q.ty, -0.5, W + 0.5); // never send anyone off the field
    q.urgent = 0;
  }
  const t = this.players[r.taker]; if (t) { t.tx = b.x; t.ty = b.y; t.urgent = 1; }
};
P._move = function () {
  const ps = this.players, n = ps.length, owner = this.ball.owner >= 0 ? ps[this.ball.owner] : null, lastSide = this.ball.lastSide;
  const T0 = this.teams[0].tactics, T1 = this.teams[1].tactics;
  for (let i = 0; i < n; i++) { const q = ps[i]; q.px = q.x; q.py = q.y; }
  for (let i = 0; i < n; i++) {
    const q = ps[i];
    if (!q.onPitch) continue;
    if (q.tackleCd > 0) q.tackleCd -= DT;
    const dx = q.tx - q.x, dy = q.ty - q.y, dd = Math.sqrt(dx * dx + dy * dy);
    if (!q.ePace || (this.tick + q.slot) % 20 === 0) { q.ePace = this.eff(q, 'pace'); q.eStam = this.eff(q, 'stamina'); }
    const top = (5.2 + q.ePace * 0.17) * (q.injured ? 0.6 : 1);
    if (!q.urgent && dd < 1.6) { q.speed = 0; continue; }
    let sp = q.urgent ? top * Math.max(0.55, q.urgent) : Math.min(top * 0.38, 0.3 + dd * 0.2);
    if (owner === q) {
      sp *= 0.86;
      const d = this.dir(q.side), opp = this._side[1 - q.side];
      for (let k = 0; k < opp.length; k++) { const o = opp[k]; if ((o.px - q.px) * d > -0.3 && dist(o.px, o.py, q.px, q.py) < 2.2) { sp *= 0.3; break; } }
    }
    const step = Math.min(dd, sp * DT);
    if (dd > 0.01) { q.x += dx / dd * step; q.y += dy / dd * step; }
    q.speed = step / DT; q.st.dist += step;
    const T = q.side === 0 ? T0 : T1, press = T.pressing;
    q.cond = Math.max(0.2, q.cond - DT * (3.6e-5 + 1.7e-6 * q.speed * q.speed) * (1.55 - q.eStam / 20) * (0.8 + 0.2 * press + 0.09 * T.tempo) * (q.side === lastSide ? 1 : 0.9 + 0.12 * press));
  }
};

// ----- the tick -----
P.step = function () {
  if (this.finished) return;
  this.tick++;
  const b = this.ball; b.px = b.x; b.py = b.y; b.pz = b.z;
  if (this.phase === 'halftime') { this._startSecondHalf(); return; }
  if (this.phase === 'shootout') { this._shootoutTick(); return; }
  const plen = PERIOD_LEN[this.half];
  this.t += DT;
  this._sides();
  // added time + half end
  if (this.t >= plen && !this.addedAnnounced) {
    this.addedAnnounced = true;
    const base = [0, 1, 3, 0, 1][this.half];
    const extra = (this.goalsThisHalf || 0) * 0.5 + this.teams.reduce((s, tm) => s + tm.stats.reds, 0) * 0.5 + (this.injuries || 0) * 0.8 + (this.half === 2 ? 0.4 * this.teams.reduce((s, tm) => s + tm.subsUsed, 0) : 0);
    this.added[this.half - 1] = clamp(Math.round(base + extra * (this.half > 2 ? 0.5 : 1) + this.rng() * 2), this.half > 2 ? 0 : 1, [0, 6, 12, 3, 4][this.half]);
    this._emit({ type: 'addedtime', text: '+' + this.added[this.half - 1] + ' minutes added' });
  }
  if (this.t >= plen + this.added[this.half - 1] * 60 && !(b.flight && b.flight.kind === 'shot')) { this._endHalf(); return; }
  // possession time + minutes
  const os = b.owner >= 0 ? this.players[b.owner].side : b.lastSide;
  if (this.phase === 'play') { this.teams[os].stats.possession += DT; this._edgeSum[0] += this._edge[0]; this._edgeSum[1] += this._edge[1]; this._edgeN++; }
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
  if (this.advantage) {
    const a = this.advantage;
    if (b.owner >= 0 && this.players[b.owner].side !== a.side && this.clockSec() <= a.until) {
      // the expected advantage did not follow: go back and penalise the original offence
      this.advantage = null;
      this._emit({ type: 'advantage', side: a.side, text: 'No advantage; free kick to ' + this.teams[a.side].name, x: a.x, y: a.y });
      this._setRestart('freekick', a.side, a.x, a.y, 4, { direct: a.direct });
      return;
    }
    if (this.clockSec() > a.until) this.advantage = null;
  }
  if (this.gkHands >= 0 && b.owner === this.gkHands && this.clockSec() - this.gkHandsT > 8) {
    const g = this.players[this.gkHands], opp = 1 - g.side, gd = this.dir(g.side);
    this._emit({ type: 'keeperholding', side: g.side, player: g.id, text: g.p.name + ' holds the ball for more than 8 seconds: corner to ' + this.teams[opp].name });
    this.teams[opp].stats.corners++;
    this._setRestart('corner', opp, gd > 0 ? 0.3 : L - 0.3, g.y < W / 2 ? 0.3 : W - 0.3, 6);
    return;
  }
  // Off-ball targets are re-planned every other tick (0.5 s), or at once when the ball changes hands or is kicked.
  const ballKey = b.owner * 4 + (b.flight ? 1 : 0) + (b.flight ? 2 * (b.flight.passer || 0) : 0);
  if ((this.tick & 1) === 0 || ballKey !== this._ballKey) { this._ballKey = ballKey; this._targets(); }
  else this._carrierTarget();
  this._move();
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
    else { const inj = this.onPitch(s).find(q => q.injured && !this.teams[s].pending.some(c => c.outId === q.id)); if (inj && this.teams[s].subsUsed < this._maxSubs() && this.teams[s].windowsUsed < this._maxWindows()) this._aiSub(s, inj); }
  }
};
P._tackles = function () {
  const b = this.ball, oi = b.owner, o = this.players[oi], r = this.rng;
  if (this.gkHands === oi) return; // a keeper holding the ball cannot be challenged
  const press = this.teams[1 - o.side].tactics.pressing;
  for (let i = 0; i < this.players.length; i++) {
    const t = this.players[i];
    if (!t.onPitch || t.side === o.side || t.tackleCd > 0) continue;
    if (dist(t.x, t.y, o.x, o.y) > 1.4) continue;
    if (t.slot === 0) { t.tackleCd = 1.5; if (r() < 0.35 + this.eff(t, 'keeping') / 60) { t.st.claims++; this._giveKeeper(i, false); return; } continue; }
    const td = this.dir(t.side), ownThird = (td > 0 ? o.x : L - o.x) < 35;
    if (r() > [0.018, 0.025, 0.034][press] * (ownThird ? 2.3 : 1)) continue;
    t.tackleCd = 2.4;
    const pw = clamp(0.42 + (this.eff(t, 'tackling') - this.eff(o, 'dribbling')) / 45, 0.12, 0.8);
    if (r() < pw) {
      t.st.tackles++; this.teams[t.side].stats.tackles++;
      const d = this.dir(t.side), fx = d > 0 ? t.x : L - t.x; if (fx > 70) this.teams[t.side].stats.finalThirdWins++;
      if (r() < 0.0015 && this._injure(oi, true)) return;
      if (r() < 0.7) this._give(i); else this._loose(b.x, b.y, (r() - 0.5) * 10, (r() - 0.5) * 10);
      return;
    }
    const dd = this.dir(o.side), inBox = Math.abs(o.y - W / 2) < BOX_HALF && (dd > 0 ? o.x > L - BOX_D : o.x < BOX_D);
    if (r() < (TUNING.foulBase + TUNING.foulPress * press + (this.eff(t, 'tackling') < 9 ? 0.015 : 0)) * (inBox ? 0.028 : ownThird ? 0.5 : 1) * (t.yellow ? 0.35 : 1)) { this._foul(i, oi, r() < 0.06 ? 'dangerous' : 'challenge'); return; }
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
      if (dd < 1.5 && r() < (q.slot === 0 ? 0.7 : 0.13 * (this.eff(q, 'tackling') + this.eff(q, 'positioning')) / 22 * this._cutOut[1 - q.side])) {
        if (q.slot === 0) { this._giveKeeper(i, false); return; }
        if (b.z > 1 && r() < (f.kind === 'cross' ? 0.008 : 0.003)) { this._foul(i, -1, 'handball'); return; } // arm in an unnatural position
        this._give(i); return;
      }
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
      if (q.slot === 0 && !(f.kind === 'cross' && q.side === passer.side)) { this._giveKeeper(take, q.side === passer.side); return; }
      if (f.kind === 'cross' && q.side === passer.side && Math.abs(q.x - (this.dir(q.side) > 0 ? L : 0)) < 17) {
        // contested header
        const opp = this._nearestOpp(q);
        const win = opp.d > 2 ? 0.8 : clamp(0.42 + (this.eff(q, 'heading') - this.eff(this.players[opp.i], 'heading')) / 30, 0.15, 0.75);
        if (r() < win) { this.ball.owner = -1; this.ball.lastSide = q.side; q.x = b.x; q.y = b.y; this.ball.z = 1.8; this._shoot(take, { header: true }); return; }
        take = opp.i;
        { const c0 = this.players[take]; if (c0.slot !== 0 && Math.abs(c0.x - (this.dir(c0.side) > 0 ? 0 : L)) < 6 && Math.abs(c0.y - W / 2) < 9 && r() < 0.06) { this._ownGoal(take); return; } }
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
  if (take >= 0 && b.x >= 0 && b.x <= L && b.y >= 0 && b.y <= W) { if (this.players[take].slot === 0) this._giveKeeper(take, b.lastSide === this.players[take].side); else this._give(take); }
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
P._maxSubs = function () { return this.half > 2 ? 6 : 5; };
P._maxWindows = function () { return this.half > 2 ? 4 : 3; };
// Is a knockout tie still level (on aggregate over both legs, if there were two)?
P._tieLevel = function () { const a = this.knockout.aggregate; return this.teams[0].score + a[0] === this.teams[1].score + a[1]; };
P._endHalf = function () {
  const sc = this.teams[0].name + ' ' + this.teams[0].score + '–' + this.teams[1].score + ' ' + this.teams[1].name;
  this.ball.flight = null; this.ball.owner = -1;
  if (this.half === 1 || this.half === 3) {
    this.phase = 'halftime';
    this._emit({ type: 'halftime', text: (this.half === 3 ? 'Half-time in extra time: ' : 'Half-time: ') + sc });
    return;
  }
  if (this.half === 2 && this.knockout && this._tieLevel()) {
    this.phase = 'halftime';
    this._emit({ type: 'extratime', text: 'Level after 90 minutes (' + sc + '): extra time' });
    return;
  }
  if (this.half === 4 && this._tieLevel()) { this._startShootout(sc); return; }
  this._finish('Full time' + (this.half === 4 ? ' after extra time' : '') + ': ' + sc);
};
P._finish = function (text) {
  this.finished = true; this.phase = 'fulltime';
  for (const q of this.players) if (q.onPitch && q.st.offAt == null) q.st.offAt = this.clockSec();
  if (this.knockout) {
    const a = this.knockout.aggregate, t0 = this.teams[0].score + a[0], t1 = this.teams[1].score + a[1];
    this.winner = this.shootout ? (this.shootout.score[0] > this.shootout.score[1] ? 0 : 1) : t0 > t1 ? 0 : 1;
  } else this.winner = this.teams[0].score > this.teams[1].score ? 0 : this.teams[1].score > this.teams[0].score ? 1 : null;
  this._emit({ type: 'fulltime', text });
};
P._startSecondHalf = function () { // starts the next period: second half, or either half of extra time
  this._applyPending();
  const next = this.half + 1;
  const recover = next === 2 ? 0.07 : next === 3 ? 0.03 : 0.01;
  this.half = next; this.t = 0; this.addedAnnounced = false; this.goalsThisHalf = 0; this.injuries = 0;
  for (const q of this.players) { if (q.onPitch) { q.cond = Math.min(1, q.cond + recover); q.x = L - q.x; q.y = W - q.y; q.px = q.x; q.py = q.y; } }
  if (next === 3) this.etFirstKick = this.rng() < 0.5 ? 0 : 1; // a new toss of the coin for extra time
  const side = next === 2 ? 1 - this.firstKick : next === 3 ? this.etFirstKick : 1 - this.etFirstKick;
  this._emit({ type: 'kickoff', side, text: ['', '', 'Second half under way', 'Extra time under way', 'Second half of extra time under way'][next] });
  this._setRestart('kickoff', side, L / 2, W / 2, 2);
};

// ---------- penalty shootout (Law 10.3) ----------
// Only players on the pitch at the end of extra time take part, both teams with the same number. Kicks alternate,
// five each, stopping as soon as one side cannot catch up, then sudden death; nobody kicks twice before every
// eligible team-mate (keeper included) has kicked once. One kick every 6 seconds so a live view can show it.
P._startShootout = function (sc) {
  this.phase = 'shootout'; this.restart = null;
  const takers = [0, 1].map(s => this.onPitch(s).slice().sort((a, b) => (a.slot === 0) - (b.slot === 0) || this.eff(b, 'shooting') - this.eff(a, 'shooting')));
  const n = Math.min(takers[0].length, takers[1].length);
  // the side with more players leaves out its weakest outfield takers (the list is best first, keeper last)
  for (const s of [0, 1]) while (takers[s].length > n) { let j = takers[s].length - 1; while (j > 0 && takers[s][j].slot === 0) j--; takers[s].splice(j, 1); }
  const first = this.rng() < 0.5 ? 0 : 1;
  this.shootout = { first, order: takers.map(l => l.map(q => q.id)), score: [0, 0], taken: [0, 0], kicks: [], timer: 4 };
  this._emit({ type: 'extratime', text: 'Level after extra time (' + sc + '): penalties. ' + this.teams[first].name + ' go first' });
  this.ball.x = L - 11; this.ball.y = W / 2;
  // everyone except the two keepers lines up in the centre circle (they walk there during the break)
  for (const q of this.players) if (q.onPitch) {
    const k = q.side * 11 + q.slot, ang = (k / 22) * Math.PI * 2;
    if (q.slot === 0) { q.tx = q.side === 0 ? L - 0.5 : L - 14; q.ty = q.side === 0 ? W / 2 : W / 2 - 12; }
    else { q.tx = L / 2 + Math.cos(ang) * 6; q.ty = W / 2 + Math.sin(ang) * 6; }
    q.x = q.px = q.tx; q.y = q.py = q.ty; q.urgent = 0;
  }
};
P._shootoutTick = function () {
  this._sides(); this._move();
  const so = this.shootout; so.timer -= DT;
  if (so.timer > 0) return;
  so.timer = 6;
  const k = so.taken[0] + so.taken[1], side = k % 2 === 0 ? so.first : 1 - so.first;
  const ids = so.order[side], q = this.players.find(p => p.id === ids[so.taken[side] % ids.length]);
  const gk = this.players.find(p => p.onPitch && p.side !== side && p.slot === 0) || this.onPitch(1 - side)[0];
  const sudden = so.taken[0] >= 5 && so.taken[1] >= 5;
  const shoot = this.eff(q, 'shooting') / 20, keep = gk ? this.eff(gk, 'keeping') / 20 : 0.2;
  const p = clamp(0.86 + (shoot - 0.6) * 0.3 - (keep - 0.55) * 0.25 - (q.slot === 0 ? 0.12 : 0) - (sudden ? 0.03 : 0), 0.45, 0.93);
  const scored = this.rng() < p;
  so.taken[side]++; if (scored) so.score[side]++;
  so.kicks.push({ side, player: q.id, scored });
  q.x = L - 12; q.y = W / 2; // the kicker steps up, then walks back to the circle
  for (const k of this.players) if (k.onPitch && k.slot === 0) { // the defending keeper on the line, the other waits by the area
    if (k === gk) { k.x = k.tx = L - 0.5; k.y = k.ty = W / 2; } else { k.tx = L - 14; k.ty = W / 2 - 12; }
  }
  this.ball.x = scored ? L + 0.5 : L - 1; this.ball.y = W / 2 + (this.rng() - 0.5) * 6;
  this._emit({ type: 'shootoutkick', side, player: q.id, scored, score: so.score.slice(), text: q.p.name + (scored ? ' scores' : this.rng() < 0.6 ? "'s penalty is saved" : ' misses') + ' (' + so.score[0] + '–' + so.score[1] + ' on penalties)' });
  // decided? within the first five each: when one side cannot catch up; then after every pair in sudden death
  const left = s => Math.max(0, 5 - so.taken[s]);
  let done;
  if (so.taken[0] < 5 || so.taken[1] < 5) done = so.score[0] + left(0) < so.score[1] || so.score[1] + left(1) < so.score[0];
  else done = so.taken[0] === so.taken[1] && so.score[0] !== so.score[1]; // sudden death: decided only after each pair
  if (done) {
    const w = so.score[0] > so.score[1] ? 0 : 1, sc = this.teams[0].name + ' ' + this.teams[0].score + '–' + this.teams[1].score + ' ' + this.teams[1].name;
    this._finish('Full time after extra time: ' + sc + '. ' + this.teams[w].name + ' win ' + Math.max(...so.score) + '–' + Math.min(...so.score) + ' on penalties');
  }
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
P.runToEnd = function () { let guard = 0; while (!this.finished && guard++ < 80000) this.step(); return this.result(); };

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
    let rating = 6.2 - q.st.ownGoals * 0.8 + q.st.goals * 1.0 + q.st.assists * 0.6 + q.st.xg * 0.6 + (pc - 0.78) * 2.5 + Math.min(1, q.st.tackles * 0.04) + q.st.saves * 0.18 - q.yellow * 0.3 - (q.red ? 1.5 : 0) + (tm.score > opp.score ? 0.3 : tm.score < opp.score ? -0.3 : 0);
    if (q.slot === 0) rating -= opp.score * 0.35;
    return { id: q.id, name: q.p.name, num: q.p.num, role: q.p.role, side: q.side, minutes: mins, rating: Math.round(clamp(rating, 3, 10) * 10) / 10,
      goals: q.st.goals, ownGoals: q.st.ownGoals, assists: q.st.assists, shots: q.st.shots, xg: q.st.xg, passes: q.st.passes, passPct: q.st.passes ? Math.round(100 * pc) : null, tackles: q.st.tackles, saves: q.st.saves, distKm: q.st.dist / 1000, endCondition: q.cond, yellow: q.yellow, red: q.red, redReason: q.redReason, injury: q.injured };
  }).filter(p => p.minutes > 0 || p.red);
  const pos = this.teams[0].stats.possession + this.teams[1].stats.possession || 1;
  const teamStats = this.teams.map(tm => Object.assign({}, tm.stats, { possessionPct: Math.round(100 * tm.stats.possession / pos), passPct: tm.stats.passes ? Math.round(100 * tm.stats.passesOk / tm.stats.passes) : 0 }));
  return {
    engineVersion: ENGINE_VERSION, seed: this.seed, score: [this.teams[0].score, this.teams[1].score], winner: this.winner, extraTime: this.half > 2,
    shootout: this.shootout && { score: this.shootout.score.slice(), first: this.shootout.first, kicks: this.shootout.kicks.slice() }, abandoned: this.abandoned, events: this.events, teamStats, playerStats,
    carryOver: playerStats.map(p => ({ playerId: p.id, name: p.name, side: p.side, minutesPlayed: p.minutes, endCondition: Math.round(p.endCondition * 100) / 100, injury: p.injury, yellow: p.yellow, red: p.red, suspension: suspensionFor(p.redReason) })),
    explanation: this.explain(), momentum: this.momentum, xgTimeline: this.xgTimeline.concat([[tsec, this.teams[0].stats.xg, this.teams[1].stats.xg]]), commands: this.commands,
  };
};
// Why the match went the way it did. Every factor says which side it concerns and whether it helped (good)
// or hurt that side, so the verdict can name a factor that actually favoured the winner.
P.explain = function () {
  const ev = this.events, names = this.teams.map(t => t.name), out = [];
  const xgAt = (t0, t1, s) => ev.filter(e => (e.type === 'shot' || e.type === 'goal') && e.side === s && e.t >= t0 && e.t < t1).reduce((a, e) => a + (e.xg || 0), 0);
  const end = this.clockSec();
  for (const e of ev.filter(e => e.type === 'red')) {
    const b0 = xgAt(Math.max(0, e.t - 1800), e.t, e.side), b1 = xgAt(Math.max(0, e.t - 1800), e.t, 1 - e.side);
    const a0 = xgAt(e.t, end, e.side), a1 = xgAt(e.t, end, 1 - e.side);
    const sb = b0 + b1 > 0 ? b0 / (b0 + b1) : 0.5, sa = a0 + a1 > 0 ? a0 / (a0 + a1) : 0.5;
    out.push({ title: 'Red card ' + e.minute + ' (' + names[e.side] + ')', body: 'xG share ' + Math.round(sb * 100) + '% → ' + Math.round(sa * 100) + '%', weight: 3, side: e.side, good: false, t: e.t });
  }
  const xiRating = s => { const xi = this.players.filter(q => q.side === s && q.st.onAt === 0); return xi.reduce((a, q) => a + roleRating(q.p), 0) / (xi.length || 1); };
  const gap = xiRating(0) - xiRating(1);
  if (Math.abs(gap) > 0.7) { const s = gap > 0 ? 0 : 1; out.push({ title: 'Stronger starting XI (' + names[s] + ')', body: 'Average rating ' + xiRating(s).toFixed(1) + ' against ' + xiRating(1 - s).toFixed(1), weight: Math.abs(gap) * 1.3, side: s, good: true }); }
  for (const s of [0, 1]) {
    const T = this.teams[s].tactics, O = this.teams[1 - s].tactics;
    const ups = MATCHUPS.filter(([k, v, ok, ov]) => T[k] === v && O[ok] === ov);
    // time-averaged, because managers (and the AI) change tactics as the score changes
    const ratio = this._edgeN ? this._edgeSum[s] / this._edgeSum[1 - s] : this._edge[s] / this._edge[1 - s];
    if (ratio > 1.15) {
      const good = true;
      const best = ups.slice().sort((x, y) => (good ? y[4] - x[4] : x[4] - y[4]))[0];
      out.push({ title: 'Tactics suited the match (' + names[s] + ')', body: (best && (good ? best[4] > 1 : best[4] < 1) ? best[5].charAt(0).toUpperCase() + best[5].slice(1) + '; ' : '') + 'chance quality ×' + ratio.toFixed(2) + ' against the opponent\'s set-up', weight: Math.abs(Math.log(ratio)) * 6, side: s, good });
    }
    const subs = ev.filter(e => e.type === 'sub' && e.side === s && e.t > 55 * 60);
    if (subs.length) {
      const t0 = subs[0].t; const xa = xgAt(t0, end, s), xb = xgAt(Math.max(0, 2 * t0 - end), t0, s);
      out.push({ title: 'Changes from ' + subs[0].minute + ' (' + names[s] + ')', body: (xa - xb >= 0 ? '+' : '') + (xa - xb).toFixed(2) + ' xG vs the same span before', weight: Math.abs(xa - xb) * 3, side: s, good: xa >= xb, t: t0 });
    }
    const tm = this.teams[s], d = tm.score - tm.stats.xg;
    if (Math.abs(d) > 0.7) out.push({ title: (d > 0 ? 'Clinical finishing' : 'Wasteful finishing') + ' (' + names[s] + ')', body: tm.score + ' goal' + (tm.score === 1 ? '' : 's') + ' from ' + tm.stats.xg.toFixed(2) + ' xG', weight: Math.abs(d) * 1.5, side: s, good: d > 0 });
    const dx = tm.stats.xg - this.teams[1 - s].stats.xg;
    if (dx > 0.8) out.push({ title: 'Created the better chances (' + names[s] + ')', body: tm.stats.xg.toFixed(2) + ' xG against ' + this.teams[1 - s].stats.xg.toFixed(2), weight: dx * 1.2, side: s, good: true });
    if (tm.stats.finalThirdWins >= 4) out.push({ title: 'Winning the ball high (' + names[s] + ')', body: tm.stats.finalThirdWins + ' balls won in the final third', weight: tm.stats.finalThirdWins / 4, side: s, good: true });
    const gk = this.players.find(q => q.side === s && q.slot === 0 && q.st.saves >= 4);
    if (gk) out.push({ title: 'Keeper stood tall (' + names[s] + ')', body: gk.p.name + ' made ' + gk.st.saves + ' saves', weight: gk.st.saves / 3, side: s, good: true });
    const legs = q => q.onPitch && q.slot !== 0;
    const cond = side => { const l = this.players.filter(q => q.side === side && legs(q)); return l.reduce((a, q) => a + q.cond, 0) / (l.length || 1); };
    if (cond(s) < 0.68 && cond(1 - s) - cond(s) > 0.06) out.push({ title: 'Ran out of legs (' + names[s] + ')', body: 'Average condition ' + Math.round(cond(s) * 100) + '% at the end against ' + Math.round(cond(1 - s) * 100) + '%', weight: (cond(1 - s) - cond(s)) * 12, side: s, good: false });
  }
  out.sort((a, b) => b.weight - a.weight);
  const [h, a] = this.teams, xh = h.stats.xg, xa = a.stats.xg;
  let verdict;
  const w = h.score > a.score ? 0 : a.score > h.score ? 1 : -1;
  if (w < 0 && this.shootout) { const so = this.shootout.score, sw = so[0] > so[1] ? 0 : 1; verdict = names[sw] + ' won ' + Math.max(...so) + '–' + Math.min(...so) + ' on penalties after a ' + h.score + '–' + a.score + ' draw; ' + (Math.abs(xh - xa) < 0.4 ? 'chances were even (' : (xh > xa ? names[0] : names[1]) + ' created the better chances (') + xh.toFixed(1) + ' to ' + xa.toFixed(1) + ' xG).'; }
  else if (w < 0) verdict = 'A ' + h.score + '–' + a.score + ' draw; ' + (Math.abs(xh - xa) < 0.4 ? 'chances were even (' : (xh > xa ? names[0] : names[1]) + ' created the better chances (') + xh.toFixed(1) + ' to ' + xa.toFixed(1) + ' xG).';
  else {
    const wx = w === 0 ? xh : xa, lx = w === 0 ? xa : xh;
    const key = out.find(f => (f.side === w) === f.good);
    verdict = names[w] + ' won ' + Math.max(h.score, a.score) + '–' + Math.min(h.score, a.score) + (wx >= lx ? ' and deserved it on xG (' : ' despite losing the xG battle (') + wx.toFixed(1) + ' to ' + lx.toFixed(1) + ')' + (key ? '; key factor: ' + key.title.charAt(0).toLowerCase() + key.title.slice(1) + '.' : '.');
  }
  return { verdict, factors: out.slice(0, 5) };
};

// Matches banned after a sending-off. Competitions set their own rules; these are common league defaults.
// Yellow-card accumulation across matches is left to the game (each result reports every player's yellows).
function suspensionFor(reason) {
  if (!reason) return 0;
  if (reason === 'second yellow' || /goal-scoring|denied a goal/.test(reason)) return 1;
  return 3; // serious foul play, violent conduct
}

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
  ENGINE_VERSION, Match, simulateMatch, validateLineup, generateSquad, makeTeam, autoPick, positionFit, roleRating,
  FORMATIONS, TACTIC_KEYS, TACTIC_EDGE, MATCHUPS, FORMATION_EDGE, TACTIC_LABELS, DEFAULT_TACTICS, ATTRS, makeRng,
};
export const PITCH = { L, W };
