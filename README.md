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
| `npm run fetch-data` | Download real league results (about 8,900 matches) into `data/football-data/` |
| `npm run build-reference` | Turn the downloaded results into `src/data/reference.json` |
| `npm run calibrate -- 500` | Simulate 500 matches and compare them with the real data |

`npm run simulate` also takes `--home-strength`, `--away-strength`, `--home-formation`, `--away-formation`, `--neutral` and `--events` (print every event, not just the key ones). `npm run calibrate` takes `--hist` to print the distributions.

## Checking the engine against real football

The engine is calibrated against real results from the top five European leagues (England, Germany, Spain, Italy, France), seasons 2021/22 to 2025/26, from [football-data.co.uk](https://www.football-data.co.uk/data.php): 8,907 matches with goals, shots, shots on target, corners, fouls and cards.

`src/data/reference.json` holds the numbers computed from that data: means, spreads and full distributions for each count per match, plus home/draw/away rates and shot ratios. It is committed, so `npm run calibrate` and the Engine Lab work without downloading anything. The raw CSV files are not committed; `npm run fetch-data` and `npm run build-reference` rebuild the reference from scratch.

Both the real data and the simulated matches go through the same code (`src/lib/metrics.js`), so every statistic is defined and binned identically. A metric passes when the engine's average is within 7% of the real one, or within 2.5 standard errors of its own batch, whichever is larger. The shape gap is the total variation distance between the engine's distribution and the real one (0 identical, 1 unrelated).

The dataset has no offsides or passing data. Those two numbers are rough estimates, marked as such in the Lab and in the calibrate output.

Latest result with 600 matches between freshly generated equal squads: 7 of 14 data-backed metrics within tolerance. The engine runs low on goals (2.5 against 2.8), fouls (21.5 against 23.8), cards (3.6 against 4.3) and goals per shot, and it draws too often (30% against 25%). Shots, shots on target, corners, red cards and home win rate are in range.

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
| `src/lib/` | Shared helpers, pitch drawing, the statistics shared by all calibration tools (`metrics.js`), and the background batch runner (Web Workers) |
| `src/data/` | `reference.json`: real-football numbers built from the league data |
| `tests/` | Determinism, save/load, validation, substitution, fuzz, realism and metrics tests |
| `tools/` | Command-line scripts for headless play, downloading data and calibration |

## Status

Working prototype. Not done yet:

- Tuning the engine to the real-data gaps listed above (goals, fouls, cards, draw rate, offsides).
- Laws still to add: advantage, handball, the goalkeeper holding-time rule, indirect free kicks beyond offsides.
- Tactic balance: low pressing, cautious mentality and wide play are weaker than the other options.
- Speed: about 100 ms per match, which is fine for a season but slow for thousands of clubs.
- Suspensions are a flat one match after a red card; yellow-card accumulation is left to the game.
