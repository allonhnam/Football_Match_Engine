// Public API of the match engine. The implementation is plain JavaScript (engine.js);
// these declarations describe what a management game can rely on.

export type Side = 0 | 1;
export type Role = 'GK' | 'DF' | 'MF' | 'FW';
export type FlankSide = 'L' | 'C' | 'R';
export type TacticKey = 'mentality' | 'pressing' | 'line' | 'width' | 'tempo' | 'passing';
/** Each tactic is an index into TACTIC_LABELS[key]: 0, 1 or 2. */
export type Tactics = Record<TacticKey, number>;
export type AttributeKey =
  | 'pace' | 'stamina' | 'passing' | 'vision' | 'dribbling'
  | 'shooting' | 'heading' | 'tackling' | 'positioning' | 'keeping';
export type Attributes = Record<AttributeKey, number>;
export type FormationName = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2' | '5-3-2';

export interface Player {
  id: string;
  name: string;
  num: number;
  role: Role;
  side: FlankSide;
  attrs: Attributes;
  /** Fitness carried into the match, 0 to 1. */
  condition: number;
  /** Reason the player cannot play (for example "suspended"), or null. */
  unavailable: string | null;
}

export interface TeamSheet {
  name: string;
  short: string;
  seed: number;
  strength: number;
  color: string;
  color2: string;
  players: Player[];
  formation: FormationName;
  /** Player ids for the starting eleven, in formation slot order (slot 0 is the goalkeeper). */
  xi: string[];
  bench: string[];
  tactics: Tactics;
}

export interface MakeTeamOptions {
  name: string;
  short?: string;
  seed?: number;
  strength?: number;
  color?: string;
  color2?: string;
  players?: Player[];
  formation?: FormationName;
  tactics?: Partial<Tactics>;
}

export interface ValidationError {
  code:
    | 'NO_SQUAD' | 'BAD_FORMATION' | 'XI_SIZE' | 'EMPTY_SLOT' | 'DUPLICATE'
    | 'UNAVAILABLE' | 'NO_GK' | 'BENCH_SIZE' | 'BENCH_DUP';
  message: string;
  side?: 'home' | 'away';
}

export interface MatchConfig {
  home: TeamSheet;
  away: TeamSheet;
  seed: number;
  /** Which side(s) a human manages; the AI manager runs the others. */
  control?: 'home' | 'away' | 'both' | 'none';
  neutral?: boolean;
  /** A knockout tie: if level after 90 minutes, two halves of 15 minutes of extra time (a sixth substitute and a
   * fourth window), then a penalty shootout. For the second leg of a two-legged tie pass the goals each side
   * scored in earlier legs; the tie is then decided on aggregate. */
  knockout?: boolean | { aggregate: [number, number] };
  /** Move the referee and assistants (default true for a Match, false for simulateMatch, which nobody watches). */
  officials?: boolean;
}

export type EventType =
  | 'kickoff' | 'goal' | 'shot' | 'corner' | 'offside' | 'foul' | 'yellow' | 'red'
  | 'penalty' | 'sub' | 'injury' | 'tactic' | 'addedtime' | 'halftime' | 'fulltime' | 'abandoned'
  /** Referee plays on after a foul; a second event with "No advantage" means the free kick was given after all. */
  | 'advantage'
  /** Play stopped for a serious injury; restarts with a dropped ball. */
  | 'stoppage'
  /** Goalkeeper held the ball in his hands for more than 8 seconds: corner to the opponents. */
  | 'keeperholding'
  /** A goal ruled out (handball by the scorer). */
  | 'disallowed'
  /** The match goes to extra time, or (after extra time) to penalties. */
  | 'extratime'
  /** One kick of a penalty shootout: scored, and the shootout score so far. */
  | 'shootoutkick';

/** What kind of offence a 'foul' event is: 'challenge' and 'handball' give a direct free kick or penalty,
 * 'dangerous' (playing in a dangerous manner) and 'backpass' (keeper handles a back-pass) an indirect free kick. */
export type Offence = 'challenge' | 'handball' | 'dangerous' | 'backpass';

export interface MatchEvent {
  type: EventType;
  /** Seconds of game time since kick-off. */
  t: number;
  tick: number;
  minute: string;
  half: 1 | 2 | 3 | 4;
  /** True for events worth stopping at: goals, cards, subs, injuries, half-time and so on. */
  key: boolean;
  side?: Side;
  player?: string;
  assist?: string;
  off?: string;
  xg?: number;
  result?: 'saved' | 'blocked' | 'off';
  x: number;
  y: number;
  text: string;
  score?: [number, number];
  /** On 'goal' events: the goal was an own goal; player is the defender, side is the team credited. */
  ownGoal?: boolean;
  /** On 'foul' events. */
  offence?: Offence;
  victim?: string;
  [extra: string]: unknown;
}

export interface TeamStats {
  possession: number; possessionPct: number;
  shots: number; onTarget: number; xg: number;
  passes: number; passesOk: number; passPct: number;
  boxEntries: number; f3Entries: number;
  corners: number; fouls: number; yellows: number; reds: number;
  offsides: number; tackles: number; finalThirdWins: number; saves: number;
}

export interface PlayerStats {
  id: string; name: string; num: number; role: Role; side: Side;
  minutes: number; rating: number; goals: number; ownGoals: number; assists: number; shots: number;
  xg: number; passes: number; passPct: number | null; tackles: number; saves: number;
  distKm: number; endCondition: number; yellow: number; red: boolean;
  /** Why the player was sent off, or null. */
  redReason: string | null;
  injury: { type: string; days: number } | null;
}

export interface CarryOver {
  playerId: string; name: string; side: Side;
  minutesPlayed: number; endCondition: number;
  injury: { type: string; days: number } | null;
  yellow: number; red: boolean;
  /** Matches banned: 1 after a second yellow or denying a goal, 3 after serious foul play. */
  suspension: number;
}

export interface MatchExplanation {
  verdict: string;
  /** Ranked reasons. good: the factor helped `side` (false: it hurt them). */
  factors: { title: string; body: string; weight: number; side: Side; good: boolean; t?: number }[];
}

export type ManagerCommand =
  | { tick: number; kind: 'sub'; side: Side; outId: string; inId: string }
  | { tick: number; kind: 'tactics'; side: Side; tactics: Partial<Tactics> }
  | { tick: number; kind: 'formation'; side: Side; formation: FormationName }
  | { tick: number; kind: 'cancel'; side: Side; idx: number };

export interface MatchResult {
  engineVersion: string;
  seed: number;
  /** Goals in this match, including extra time but not the shootout. */
  score: [number, number];
  /** Score at the end of the first half, or null if the match was abandoned before it. */
  halftimeScore: [number, number] | null;
  /** Who won: 0 home, 1 away, null for a draw (never null in a knockout tie). */
  winner: Side | null;
  extraTime: boolean;
  shootout: { score: [number, number]; first: Side; kicks: { side: Side; player: string; scored: boolean }[] } | null;
  abandoned: { reason: string; minute: number } | null;
  events: MatchEvent[];
  teamStats: TeamStats[];
  playerStats: PlayerStats[];
  carryOver: CarryOver[];
  explanation: MatchExplanation;
  momentum: [number, number][];
  /** Cumulative xG over time: [seconds, homeXg, awayXg]. */
  xgTimeline: [number, number, number][];
  commands: ManagerCommand[];
}

export type CommandAck = { ok: true; queued: boolean } | { ok: false; error: string };

export interface StopCondition {
  /** Stop once the clock reaches this minute. */
  minute?: number;
  /** Stop at the next event of this type ('key' means any key event). */
  event?: EventType | 'key' | (EventType | 'key')[];
  /** Run at most this many ticks (one tick is 0.25 s of game time). */
  ticks?: number;
  pauseAtHalftime?: boolean;
}

export class Match {
  constructor(config: MatchConfig);
  /** Set instead of a running match when the lineups are illegal. */
  errors?: ValidationError[];
  config: MatchConfig;
  seed: number;
  tick: number;
  /** 1 and 2 are the halves, 3 and 4 the halves of extra time. */
  half: 1 | 2 | 3 | 4;
  phase: 'dead' | 'play' | 'halftime' | 'shootout' | 'fulltime';
  winner: Side | null;
  shootout: { score: [number, number]; first: Side; kicks: { side: Side; player: string; scored: boolean }[] } | null;
  finished: boolean;
  abandoned: { reason: string; minute: number } | null;
  events: MatchEvent[];
  commands: ManagerCommand[];
  teams: any[];
  players: any[];
  ball: any;
  momentum: [number, number][];
  possMin: [number, number][];
  boxMin: [number, number][];
  f3Min: [number, number][];
  added: [number, number];
  restart: any;

  step(): void;
  runUntil(stop?: StopCondition): MatchEvent[];
  runToEnd(): MatchResult;
  result(): MatchResult;
  explain(): MatchExplanation;
  /** A frame for drawing: clock, score, ball (x, y, height z), players, the referee and two assistants, and the
   * keeper holding the ball (with seconds held, for the 8-second rule). px/py are positions one tick earlier. */
  snapshot(): any;
  /** Referee and assistant referees: [referee, assistant (top touchline, left half), assistant (bottom, right half)]. */
  officials: { role: 'referee' | 'assistant'; x: number; y: number; px: number; py: number }[];
  onPitch(side?: Side): any[];
  clockSec(): number;
  clockLabel(): string;
  minute(): number;
  minuteLabel(): string;
  on(listener: (e: MatchEvent) => void): () => void;

  /** Queued until the next stoppage (applied at once at half-time). Max 5 subs in 3 windows. */
  substitute(side: Side, outId: string, inId: string, replay?: boolean): CommandAck;
  setTactics(side: Side, tactics: Partial<Tactics>, replay?: boolean): CommandAck;
  setFormation(side: Side, formation: FormationName, replay?: boolean): CommandAck;
  cancelPending(side: Side, index: number): void;

  /** JSON of the inputs plus the manager command log. */
  save(): string;
  static load(saved: string): Match;
  /** Rebuild a match from its inputs and command log, optionally up to a tick. */
  static replay(config: MatchConfig, commands: ManagerCommand[], untilTick?: number): Match;
}

export function simulateMatch(config: MatchConfig): MatchResult | { errors: ValidationError[] };
export function validateLineup(team: TeamSheet): ValidationError[];
export function generateSquad(seed: number, name: string, strength: number): Player[];
export function makeTeam(options: MakeTeamOptions): TeamSheet;
export function autoPick(players: Player[], formation: FormationName): { xi: string[]; bench: string[] };
export function positionFit(player: Player, formation: FormationName, slotIndex: number): number;
export function roleRating(player: Player): number;
export function makeRng(seed: number): (() => number) & { getState(): number; setState(value: number): void };

/** Formation slots: [role, depth 0..1, width 0..1]. */
export const FORMATIONS: Record<FormationName, [Role, number, number][]>;
export const TACTIC_KEYS: TacticKey[];
export const TACTIC_LABELS: Record<TacticKey, [string, string, string]>;
export const DEFAULT_TACTICS: Tactics;
export const ATTRS: AttributeKey[];
export const PITCH: { L: number; W: number };
export const ENGINE_VERSION: string;
/** Tactic trade-offs as multipliers on chance quality (see engine.js). */
export const TACTIC_EDGE: {
  concede: Record<TacticKey, [number, number, number]>;
  create: Record<TacticKey, [number, number, number]>;
  centralConcede: [number, number, number];
  crossConcede: [number, number, number];
};
/** Style match-ups: [our tactic, option, their tactic, option, multiplier on our chances, description]. */
export const MATCHUPS: [TacticKey, number, TacticKey, number, number, string][];
/** Per formation: [chances created, chances conceded] multipliers. */
export const FORMATION_EDGE: Record<FormationName, [number, number]>;
