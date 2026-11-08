# Match Engine

A football (soccer) match engine for a management game, with a Next.js front end: match setup, a squad and tactics board, a live 2D match view with touchline controls, a post-match report, and an Engine Lab for checking realism, tactical balance and performance.

Author: Hyun

## Quick start

Requires Node 20 or newer. Works the same on Windows, macOS and Linux.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the front end in development mode |
| `npm run build` | Production build |
| `npm start` | Serve the production build (run `npm run build` first) |
| `npm test` | Run the test suite (Vitest) |
| `npm run typecheck` | Type-check the project |
| `npm run simulate -- --seed 42` | Play one match headless and print the result |
| `npm run calibrate -- 500` | Run 500 matches and compare the numbers with reference ranges |

`npm run simulate` also takes `--home-strength`, `--away-strength`, `--home-formation`, `--away-formation`, `--neutral` and `--events` (print every event, not just the key ones).

## Using the engine in code

The engine has no dependencies and no browser requirements. It lives in `src/engine/engine.js` and is typed by `src/engine/engine.d.ts`.

```ts
import { Match, makeTeam, validateLineup, simulateMatch } from '@/engine/engine';

const home = makeTeam({ name: 'Northbridge FC', seed: 11, strength: 13 });
const away = makeTeam({ name: 'Harbour City', seed: 22, strength: 12 });
validateLineup(home);                      // [] or a list of typed errors

// Headless: one call, full result
const result = simulateMatch({ home, away, seed: 42 });

// Interactive: run, change something, resume
const m = new Match({ home, away, seed: 42, control: 'home' });
m.runUntil({ minute: 60 });                // or { event: 'goal' } or { event: 'key' }
m.substitute(0, outId, inId);              // applied at the next stoppage
m.setTactics(0, { pressing: 2, mentality: 2 });
m.setFormation(0, '4-4-2');
const saved = m.save();                    // inputs + manager command log
const final = m.runToEnd();                // score, events, stats, carryOver, explanation

// Exact replay from the saved inputs, seed and commands
const again = Match.load(saved).runToEnd();
```

Illegal lineups are reported as typed errors (`validateLineup`, and `errors` on a `Match` or `simulateMatch` result) rather than thrown. Illegal manager commands return `{ ok: false, error }`.

### Result object

| Field | Contents |
| --- | --- |
| `score` | `[home, away]` |
| `events` | Every event with tick, clock, minute label, side, players, position and extra data (xG, shot result) |
| `teamStats` | Possession, xG, shots, on target, passes, pass accuracy, box and final-third entries, corners, fouls, offsides, cards, saves |
| `playerStats` | Minutes, rating, goals, assists, xG, passes, tackles, distance, end condition, cards, injury |
| `carryOver` | What the game keeps: minutes played, end condition, injuries with days out, cards, suspensions |
| `explanation` | A verdict sentence and ranked key factors explaining the result |
| `commands` | The manager command log, used for replays |

## How the engine works

- 2D pitch of 105 × 68 m, simulated in fixed ticks of 0.25 s of game time.
- Off-ball players move to formation-based targets that shift with the ball, the phase of play and the tactics. Defenders mark and press.
- The ball carrier chooses between shooting, passing, crossing, carrying and clearing using expected value, pressure and player attributes.
- Laws covered: kick-off, two halves with added time, throw-ins, goal kicks, corners, offside (not from throw-ins, goal kicks or corners), fouls, direct and indirect free kicks, penalties, yellow and red cards (a second yellow is a red), sent-off players not replaced, 5 substitutes in 3 windows plus half-time, abandonment below 7 players.
- Fatigue lowers pace and skill. Pressing and tempo drain stamina faster. Injuries can happen in challenges.
- One seeded random number generator: the same inputs, seed and commands always give the same match.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/engine/` | The match engine and its type declarations |
| `src/app/` | Next.js routes: `/` matchday and live match, `/tactics`, `/report`, `/lab` |
| `src/components/` | Screens and UI components |
| `src/lib/` | Shared helpers, pitch drawing, and the background batch runner (Web Workers) |
| `tests/` | Determinism, save/load, validation, substitution, fuzz and realism tests |
| `tools/` | Command-line scripts for headless play and calibration |

## Status

Working prototype. Not done yet:

- Reference ranges in the Engine Lab and `calibrate` are approximate top-league figures, not yet computed from real league data.
- Laws still to add: advantage, handball, the goalkeeper holding-time rule, indirect free kicks beyond offsides.
- Tactic balance: low pressing, cautious mentality and wide play are weaker than the other options.
- Speed: about 100 ms per match, which is fine for a season but slow for thousands of clubs.
- Suspensions are a flat one match after a red card; yellow-card accumulation is left to the game.
