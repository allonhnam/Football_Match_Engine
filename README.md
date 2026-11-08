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
| `npm run balance -- 200` | Play every tactic option and formation against a balanced side, plus the style match-ups, and show win rates and what each option changes |

`npm run simulate` also takes `--home-strength`, `--away-strength`, `--home-formation`, `--away-formation`, `--neutral` and `--events` (print every event, not just the key ones). `npm run calibrate` takes `--hist` to print the distributions.

## Checking the engine against real football

The engine is calibrated against real results from the top five European leagues (England, Germany, Spain, Italy, France), seasons 2021/22 to 2025/26, from [football-data.co.uk](https://www.football-data.co.uk/data.php): 8,907 matches with goals, shots, shots on target, corners, fouls and cards.

`src/data/reference.json` holds the numbers computed from that data: means, spreads and full distributions for each count per match, plus home/draw/away rates and shot ratios. It is committed, so `npm run calibrate` and the Engine Lab work without downloading anything. The raw CSV files are not committed; `npm run fetch-data` and `npm run build-reference` rebuild the reference from scratch.

Both the real data and the simulated matches go through the same code (`src/lib/metrics.js`), so every statistic is defined and binned identically. A metric passes when the engine's average is within 7% of the real one, or within 2.5 standard errors of its own batch, whichever is larger. The shape gap is the total variation distance between the engine's distribution and the real one (0 identical, 1 unrelated).

The dataset has no offsides or passing data. Those two numbers are rough estimates, marked as such in the Lab and in the calibrate output.

Every simulated match uses a fresh pair of squads, with team quality varying like a real league (`src/lib/league.js`). The spread of quality cannot be read from match results, so it is a calibration setting: a spread of about 1 point reproduces the real draw rate and the real home, draw and away split. Calibrating on two fixed squads gave misleading, squad-dependent results.

Latest result, 6,000 matches: all 14 data-backed metrics are within tolerance, and the distributions closely follow the real ones.

| Metric | Engine | Real |
| --- | --- | --- |
| Goals per match | 2.77 | 2.81 |
| Shots per match | 26.2 | 25.2 |
| Shots on target | 34.8% | 34.9% |
| Goals per shot | 10.6% | 11.2% |
| Corners per match | 9.7 | 9.7 |
| Fouls per match | 23.2 | 23.8 |
| Cards per match | 4.07 | 4.29 |
| Home / draw / away | 45% / 24% / 31% | 44% / 25% / 31% |

Rarer events, per match (no reference in the dataset, checked against published league averages): penalties 0.27, own goals 0.06, red cards 0.19.

The numbers that were adjusted to get there (shot volume, accuracy, finishing, fouls, bookings, offside timing and home advantage) sit together in the `TUNING` block at the top of `src/engine/engine.js`. A regression test fails if a change to the engine pulls the headline statistics away from the real data.

## Tactics, formations and balance

Every option changes how a team plays, and none wins outright. `npm run balance` plays each option against a balanced side on a neutral ground (300 matches each). A balanced side wins about 40% of the time against another balanced side, and every tactic option and formation lands between 34% and 45%.

| Setting | What it buys | What it costs |
| --- | --- | --- |
| Mentality: Attack | about 16 shots instead of 13, more xG | concedes better chances; fewer draws |
| Pressing: High | wins the ball higher | about 17 fouls instead of 6 at Low, more cards, legs gone by full time |
| Line: High | more shots, squeezes the pitch | balls in behind; more chances conceded |
| Width: Wide | more crosses and xG | leaves the middle open |
| Tempo: Fast | more goals for | lower pass completion (78% against 82% at Slow), more conceded, more tiredness |
| Passing: Short | keeps the ball (84% passes complete, more possession) | struggles against a high press |
| Passing: Direct | better chances | gives the ball away more (77% completion) |

Styles also counter each other. Direct passing beats a high line (45% against 37% for mixed passing), short passing loses to a high press (32% against 43%), and patient short passing picks apart a low block.

How it works: the 2D model already produces most of these effects through shape, pressing runs, pass length and risk, decision speed and stamina. It is too coarse to make every option cost something, though, so each setting also scales the quality of the chances a side creates and concedes. The match-ups and a small formation adjustment work the same way. All of these multipliers sit in `TACTIC_EDGE`, `MATCHUPS` and `FORMATION_EDGE` at the top of `src/engine/engine.js`. The match report names a match-up when it decided the game.

Player selection matters too. Playing forwards in defence drops a side's win rate from about 40% to under 20%.

## Laws of the game

Following the IFAB Laws of the Game:

- **Start and restart (Laws 8 to 10, 13 to 17):** kick-off with both teams in their own half; two halves with added time; throw-ins (opponents 2 m away); goal kicks (opponents outside the area); corners and free kicks (opponents 9.15 m away); penalties (everyone else outside the area). A dropped ball restarts play after it is stopped for a serious injury, with opponents 4 m away.
- **Offside (Law 11):** judged when the ball is played, against the second-last opponent. It needs the player to be in the opponents' half and ahead of the ball, and is never given from throw-ins, goal kicks or corners. It gives an indirect free kick.
- **Fouls (Law 12):**
  - Careless, reckless and dangerous challenges give a direct free kick, or a penalty in the area.
  - Playing in a dangerous manner and a keeper handling a deliberate back-pass give an indirect free kick, taken from the goal-area line if inside it.
  - Handball by a defender gives a direct free kick or a penalty. A handball that stops a goal is a red card.
  - A goal scored straight after the scorer's own handball, even an accidental one, is disallowed.
  - A keeper may not be challenged while holding the ball. Holding it for more than 8 seconds gives the opponents a corner.
- **Cards and advantage (Law 5):**
  - The referee plays advantage, then goes back to the free kick if the advantage does not follow within a few seconds. Cards held back for advantage are shown at the next stoppage.
  - Yellow and red cards; a second yellow is a red. Denying an obvious goal-scoring chance is a red card outside the area and a yellow inside it when the challenge was a genuine attempt at the ball.
- **Players (Law 3):**
  - 5 substitutes in 3 windows, plus half-time.
  - Players sent off are not replaced.
  - When the keeper is sent off, an outfield player makes way for the substitute keeper, or an outfield player goes in goal.
  - A match with fewer than 7 players on a side is abandoned.
- **Goals (Law 10):** includes own goals.

Not modelled: VAR, concussion substitutes, goal-line technology, and the extra-time and penalty-shootout rules of cup competitions.

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

For a live view, call `m.step()` (one tick, 0.25 s of game time) or `m.runUntil(...)` from a timer at whatever speed you like, and draw `m.snapshot()`. Listen to events with `m.on(e => ...)`. Background matches run headless with `simulateMatch`: about 100 ms per match on one core. The front end spreads them over Web Workers (`src/lib/batch.ts`), and the Node tools use worker threads. In the browser a 380-match season takes about 13 s.

### Result object

| Field | Contents |
| --- | --- |
| `score` | `[home, away]` |
| `events` | Every event with tick, clock, minute label, side, players, position and extra data (xG, shot result, own goal, kind of offence) |
| `teamStats` | Possession, xG, shots, on target, passes, pass accuracy, box and final-third entries, corners, fouls, offsides, cards, saves |
| `playerStats` | Minutes, rating, goals, own goals, assists, xG, passes, tackles, distance, end condition, cards, why sent off, injury |
| `carryOver` | What the game keeps: minutes played, end condition (fatigue), injuries with days out, cards, suspensions (1 match after a second yellow or denying a goal, 3 after serious foul play) |
| `explanation` | A verdict sentence and ranked factors (stronger XI, tactics that suited the match, chance quality, finishing, keeper, red cards, substitutions, fatigue), each marked as helping or hurting its side |
| `commands` | The manager command log, used for replays |

## How the engine works

- 2D pitch of 105 × 68 m, simulated in fixed ticks of 0.25 s of game time.
- Off-ball players move to formation-based targets that shift with the ball, the phase of play and the tactics. Defenders mark and press.
- The ball carrier chooses between shooting, passing, crossing, carrying and clearing using expected value, pressure and player attributes.
- Laws: see [Laws of the game](#laws-of-the-game) above.
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

Complete first version. All deliverables work: the engine, the library API, the visualizer, the calibration and balance tools, and this README. There are 41 tests covering determinism, save and load, lineup validation, substitutions, a fuzz test, realism, the laws above and tactic effects. On top of that, 2,000 fuzzed matches with random squads, tactics and manager commands finished without a crash, a hang or a broken invariant.

Known limits:

- Squad quality is decisive. At a neutral venue a one-point gap in squad rating lifts the stronger side's win rate from about 37% to about 49%, and a three-point gap to about 82%.
- Offsides and pass completion have no real-data reference; they are checked against rough estimates.
- Suspensions are reported per match. Yellow-card accumulation across matches is left to the game, which gets every player's yellows in `carryOver`.
