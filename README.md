# Match Engine

A football (soccer) match engine for a management game, with a Next.js front end: match setup, a squad and tactics board, a live 2D match view with touchline controls, a post-match report, and an Engine Lab for checking realism, tactical balance and performance.

Author: Hyun

## Quick start

Requires Node 20 or newer. Works the same on Windows, macOS and Linux: CI runs the typecheck, the tests, a headless match and the production build on all three, with Node 20 and 22 (`.github/workflows/ci.yml`).

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
| `npm run calibrate -- 500` | Simulate 500 matches and compare them with the real data, including how predictable results are against bookmaker odds |
| `npm run attributes -- 300` | Give one side +3 in a single attribute (same squads otherwise) and show what it changes |
| `npm run balance -- 200` | Play every tactic option and formation against a balanced side, plus the style match-ups, and show win rates and what each option changes |

`npm run simulate` also takes `--home-strength`, `--away-strength`, `--home-formation`, `--away-formation`, `--neutral` and `--events` (print every event, not just the key ones). `npm run calibrate` takes `--hist` to print the distributions.

## Checking the engine against real football

The engine is calibrated against real results from the top five European leagues (England, Germany, Spain, Italy, France), seasons 2021/22 to 2025/26, from [football-data.co.uk](https://www.football-data.co.uk/data.php): 8,907 matches with full-time and half-time scores, shots, shots on target, corners, fouls and cards.

`src/data/reference.json` holds the numbers computed from that data: means, spreads and full distributions for each count per match, home/draw/away rates, shot ratios, the distribution of final scores, and how matches unfold from half-time to full time. It is committed, so `npm run calibrate` and the Engine Lab work without downloading anything. The raw CSV files are not committed; `npm run fetch-data` and `npm run build-reference` rebuild the reference from scratch.

Both the real data and the simulated matches go through the same code (`src/lib/metrics.js`), so every statistic is defined and binned identically. A metric passes when the engine's average is within 7% of the real one, or within 2.5 standard errors of its own batch, whichever is larger. The shape gap is the total variation distance between the engine's distribution and the real one (0 identical, 1 unrelated).

The dataset has no offsides or passing data. Those two numbers are rough estimates, marked as such in the Lab and in the calibrate output.

Every simulated match uses a fresh pair of squads, with team quality varying like a real league (`src/lib/league.js`). Calibrating on two fixed squads gave misleading, squad-dependent results.

How much squad quality decides results is checked against bookmaker odds for the same real matches. The odds (market average, margin removed) give every match's home-win and away-win probability. The spread of their difference over a league measures how predictable football is: 0.337 in the real data, where the favourite wins 53.8%. The engine fits how its results depend on the squad-strength gap, using matches at fixed gaps (`src/lib/predictability.js`), then reads the same spread off the league matchups. The quality spread in `league.js` is set so the two agree: the engine gives 0.344, and the favourite wins 52.4%. On that scale, a one-point stronger squad at home wins 66% of the time instead of 42%.

Latest result, 6,000 matches: all 24 data-backed metrics are within tolerance (15 match statistics, 7 checks on halves and scorelines, and the two odds checks), and the distributions closely follow the real ones.

| Metric | Engine | Real |
| --- | --- | --- |
| Goals per match | 2.84 | 2.81 |
| Shots per match | 25.2 | 25.2 |
| Shots on target | 35.4% | 34.9% |
| Goals per shot | 11.3% | 11.2% |
| Corners per match | 9.7 | 9.7 |
| Fouls per match | 23.2 | 23.8 |
| Cards per match | 4.35 | 4.29 |
| Home / draw / away | 44% / 26% / 30% | 44% / 25% / 31% |
| Goal margin | 1.32 | 1.36 |
| Spread of win chances (odds) | 0.344 | 0.337 |
| Favourite wins | 52.4% | 53.8% |

### Scorelines and the two halves

Matching the average goals is not enough: a management game's player sees every final score and every collapse. So the engine is also checked on how often each final score happens and on how matches unfold from half-time, using the half-time scores in the same dataset:

| Metric | Engine | Real |
| --- | --- | --- |
| Goals scored after the break | 54.2% | 55.3% |
| Level at half-time | 41.3% | 39.9% |
| 0-0 at half-time | 28.6% | 28.2% |
| Half-time leader wins | 75.1% | 73.1% |
| Half-time leader draws | 17.3% | 17.9% |
| Half-time leader loses | 7.6% | 9.1% |
| Final scores (shape gap over 16 scorelines) | 0.033 | allowed 0.050 |

A half-time metric passes within 2.5 percentage points (or 2.5 standard errors of the batch). The scoreline check compares the share of matches ending 0-0, 1-0, 0-1 and so on up to 2-3, plus everything else, and passes when the total variation distance is under 0.05 (or twice what sampling noise alone would give). `npm run calibrate -- 3000 --hist` prints the scorelines side by side.

These checks found a real gap that the per-match totals hid. Goals were spread evenly over the two halves (48% after the break against 55% in real football), leads were too safe (a half-time leader won 82% of the time and lost only 5%), and there were too many 3-0s and too few 1-1s. Real matches open up as legs tire, and the side behind commits players forward while the leader drops off. The engine now models that game state for every side, whatever its tactics, in the `TUNING` block: chances improve through the match (`lateOpenness`), the trailing side creates more per goal behind (`chasing`), and the leading side slightly less (`sittingOn`). Home advantage was lowered from 0.45 to 0.38 attribute points to keep the home/away split right with these in place.

Goal minutes are not in the dataset, so timing is checked by half only; the Engine Lab shows goals per 15-minute block from the engine alone.

Rarer events, per match (no reference in the dataset, checked against published league averages): penalties 0.25, own goals 0.05, red cards 0.20.

The numbers that were adjusted to get there (shot volume, accuracy, finishing, fouls, bookings, offside timing, home advantage and game state) sit together in the `TUNING` block at the top of `src/engine/engine.js`. A regression test fails if a change to the engine pulls the headline statistics away from the real data.

## Tactics, formations and balance

Every option changes how a team plays, and none wins outright. `npm run balance` plays each option against a balanced side on a neutral ground (400 matches each). A balanced side wins about 36% of the time against another balanced side (28% are draws), and every tactic option and formation lands between 29% and 42%.

| Setting | What it buys | What it costs |
| --- | --- | --- |
| Mentality: Attack | about 15 shots instead of 12.5, more xG | concedes better chances; fewer draws |
| Pressing: High | wins the ball higher | about 17 fouls instead of 6 at Low, more cards, legs gone by full time |
| Line: High | more shots, squeezes the pitch | balls in behind; more chances conceded |
| Width: Wide | more crosses and xG | leaves the middle open |
| Tempo: Fast | more goals for | lower pass completion (79% against 83% at Slow), more conceded, more tiredness |
| Passing: Short | keeps the ball (85% passes complete, more possession) | struggles against a high press |
| Passing: Direct | better chances | gives the ball away more (78% completion) |

Styles also counter each other. Direct passing beats a high line (45% against 35% for mixed passing), short passing loses to a high press (27% against 38%), and patient short passing picks apart a low block (44% against 39%).

How it works: the 2D model already produces most of these effects through shape, pressing runs, pass length and risk, decision speed and stamina. It is too coarse to make every option cost something, though, so each setting also scales the quality of the chances a side creates and concedes. The match-ups and a small formation adjustment work the same way. All of these multipliers sit in `TACTIC_EDGE`, `MATCHUPS` and `FORMATION_EDGE` at the top of `src/engine/engine.js`. The match report names a match-up when it decided the game.

Player selection matters too. Playing forwards in defence drops a side's win rate from about 40% to under 20%.

## Player attributes

Every attribute changes the thing it stands for, and every one moves results. `npm run attributes` gives both sides the same squad at a neutral ground, then gives one side +3 in a single attribute (every player; keeping for the keeper only), over 1,000 matches each:

| +3 in | Wins (about 35% without) | Goal difference | What it changes |
| --- | --- | --- | --- |
| Pace | 45% | +0.35 | 14.1 shots against 10.8 |
| Dribbling | 48% | +0.53 | gets into the box far more often |
| Tackling | 44% | +0.32 | wins the ball more |
| Heading | 43% | +0.27 | nearly twice the headed goals |
| Shooting | 39% | +0.23 | more of the same chances scored |
| Vision | 39% | +0.18 | better chances from key passes, far fewer offsides |
| Stamina | 38% | +0.15 | fresher at full time (85% condition against 81%) |
| Positioning | 39% | +0.11 | keeps the opponent out of the box: 1.32 goals against instead of 1.44 |
| Passing | 39% | +0.12 | 83% of passes complete against 81% |
| Keeping (one player) | 37% | +0.09 | 1.26 goals against instead of 1.35 |
| Everything | 90% | +2.77 | (a much stronger squad) |

Measuring this found real problems, now fixed: passing and vision had no effect on results at all, and shooting barely did. A test for each attribute (`tests/attributes.test.ts`) now fails if any of them stops doing its job.

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
  - 5 substitutes in 3 windows, plus half-time. In extra time a sixth substitute and a fourth window, and the breaks before and during extra time are free.
  - Players sent off are not replaced.
  - When the keeper is sent off, an outfield player makes way for the substitute keeper, or an outfield player goes in goal.
  - A match with fewer than 7 players on a side is abandoned.
- **Goals (Law 10):** includes own goals.

- **Knockout ties (Law 10.3):**
  - A level tie goes to two halves of 15 minutes of extra time, with ends changed and a new toss, then a penalty shootout.
  - The shootout uses only players on the pitch at the end, with both teams reduced to the same number. Kicks alternate, five each, and stop as soon as one side cannot catch up; then sudden death. Nobody kicks twice until every eligible team-mate has kicked.
  - Second legs are decided on aggregate.

Not modelled: VAR, concussion substitutes and goal-line technology.

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

Cup ties: pass `knockout: true` in the match config, or `knockout: { aggregate: [2, 1] }` for a second leg where the home side scored 2 and the away side 1 in earlier legs. The result then always has a `winner`, plus `extraTime` and `shootout` (score and every kick).

For a live view, call `m.step()` (one tick, 0.25 s of game time) or `m.runUntil(...)` from a timer at whatever speed you like, and draw `m.snapshot()`. Listen to events with `m.on(e => ...)`. Background matches run headless with `simulateMatch`: about 100 ms per match on one core. The front end spreads them over Web Workers (`src/lib/batch.ts`), and the Node tools use worker threads. In the browser a 380-match season takes about 13 s.

### Result object

| Field | Contents |
| --- | --- |
| `score` | `[home, away]`, including extra time but not a shootout |
| `halftimeScore` | `[home, away]` at the end of the first half (null if abandoned before it) |
| `winner`, `extraTime`, `shootout` | Who won (null for a league draw), whether extra time was played, and the shootout score and kicks |
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
- The live view shows the referee working the diagonal and the two assistants level with the second-last defender (flag up after an offside), lines for shots and passes in flight, the ball's height, and a countdown ring when a keeper holds the ball (the 8-second rule). The officials come from the engine (`snapshot().officials`) but never touch the random numbers, so they cannot change a result, and headless runs skip them.
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

Complete first version. All deliverables work: the engine, the library API, the visualizer, the calibration and balance tools, and this README. There are 66 tests covering determinism, save and load, lineup validation, substitutions, a fuzz test, realism (including scorelines and half-time leads), the laws above, knockout ties, tactic effects, every player attribute and the pitch view. On top of that, 2,000 fuzzed matches with random squads, tactics and manager commands finished without a crash, a hang or a broken invariant.

Known limits:

- Offsides and pass completion have no real-data reference; they are checked against rough estimates.
- Suspensions are reported per match. Yellow-card accumulation across matches is left to the game, which gets every player's yellows in `carryOver`.
