# Match Engine

A football match engine for a management game. It simulates a full 11 v 11 match with added time (and extra time and penalties in cup ties), returns the result, an event log, team and player statistics and what the game needs to carry on. It comes with a library API, a 2D visualizer (Next.js) with the real clubs and players of the five top European leagues, and command-line tools that check its numbers against 8,907 real matches.

**Live demo:** https://mainline-markets-interview.vercel.app (deployed from `main` on Vercel)

Author: Hyun

## Build and run

Requires Node 20 or newer. Works the same on Windows, macOS and Linux (CI runs the typecheck, the tests, a headless match and the production build on all three, with Node 20 and 22).

```bash
npm install
npm run dev        # visualizer at http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the visualizer in development mode |
| `npm run build` then `npm start` | Production build and serve it |
| `npm test` | Run the tests (Vitest) |
| `npm run typecheck` | Type-check the project |
| `npm run simulate -- --seed 42` | Play one match headless and print it (`--events` for every event, `--home-strength`, `--away-strength`, `--home-formation`, `--away-formation`, `--neutral`) |
| `npm run calibrate -- 3000` | Simulate 3,000 league matches and compare them with the real data (`--hist` prints the distributions) |
| `npm run balance -- 200` | Play every tactic, formation and style match-up against a balanced side and show win rates |
| `npm run attributes -- 300` | Give one side +3 in a single attribute and show what it changes |
| `npm run fetch-data`, `npm run build-reference` | Download the real league results and squads, and rebuild `src/data/reference.json` (already committed, so not needed to run anything) |
| `npm run build-teams` | Rebuild the real clubs and squads in `src/data/teams.json` from the downloaded data (already committed) |
| `npm run fit-pass-odds -- 40` | Refit the pass-completion model players use to judge passes (`--write` stores it in the engine) |

The visualizer has four screens: matchday setup (pick any real club, or make your own squad), a tactics board where you can click any player and set each of his ten ratings, the live match (pitch view, four playback speeds, step to the next event, skip to full time, substitutions and tactic changes from the touchline) with a post-match report, and an Engine Lab that runs the realism, balance and performance checks in the browser (each run uses a new random seed, shown with its results; type a seed to repeat a run), with every simulated match and scoreline, and plays a full season of a real league matchday by matchday, with injuries and bans carried over (league table and every player's goals, assists, cards, injuries and matches missed).

## Using the engine

The engine is one dependency-free file, `src/engine/engine.js`, typed by `src/engine/engine.d.ts`.

```ts
import { Match, makeTeam, validateLineup, simulateMatch } from '@/engine/engine';
import { realTeam } from '@/lib/util';     // the real clubs, from src/data/teams.json

const home = realTeam('E0', 'Arsenal');    // a real club and its 2025/26 squad (league code, club name)
const away = realTeam('E0', 'Man City');
// or a generated squad: makeTeam({ name: 'Northbridge FC', seed: 11, strength: 13 }), or pass your own players, formation, tactics
validateLineup(home);                      // [] or a list of typed errors

// Headless: one call, full result
const result = simulateMatch({ home, away, seed: 42 });

// Interactive: run, pause, change something, resume
const m = new Match({ home, away, seed: 42, control: 'home' });
m.runUntil({ minute: 60 });                // or { event: 'goal' }, { event: 'key' }, { ticks: 40 }
m.substitute(0, outId, inId);              // applied at the next stoppage
m.setTactics(0, { pressing: 2, mentality: 2 });
m.setFormation(0, '4-4-2');
const saved = m.save();                    // engine version, inputs + manager command log
const final = m.runToEnd();

// Exact replay from the saved inputs, seed and commands
const again = Match.load(saved).runToEnd();  // replayExact is false if saved on another engine version
```

- **Teams.** A `TeamSheet` holds the squad (each player with ten attributes from 1 to 20: pace, stamina, passing, vision, dribbling, shooting, heading, tackling, positioning, keeping), the starting XI in formation order, the bench, the formation (4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2) and six tactics (mentality, pressing, defensive line, width, tempo, passing), each with three settings. Each player's `condition` (fitness carried in) and `unavailable` (injured, suspended) come from the game; `flag`, `nation`, `born`, `height` and `foot` are optional details the engine ignores.
- **Errors.** Illegal lineups come back as typed errors (`validateLineup`, and `errors` on a `Match` or `simulateMatch` result), never thrown. Illegal manager commands return `{ ok: false, error }`.
- **Live view.** Call `m.step()` (one tick, 0.25 s of game time) or `m.runUntil(...)` from a timer at any speed, draw `m.snapshot()`, and listen to events with `m.on(e => ...)`.
- **Cup ties.** Pass `knockout: true`, or `knockout: { aggregate: [2, 1] }` for a second leg. The result then always has a `winner`, plus `extraTime` and `shootout`.
- **Background matches.** `simulateMatch` takes about 250 ms per match on one core (about 235 ms in Node, 275 ms in a browser tab, on a recent laptop). The visualizer spreads batches over Web Workers (`src/lib/batch.ts`): about 18 matches a second, so a 380-match season takes about 21 s. The Engine Lab's Performance tab measures this on your own machine. A hard tick cap means a match can never hang.

The result:

| Field | Contents |
| --- | --- |
| `score`, `halftimeScore`, `winner` | Final and half-time score, and who won (null for a league draw) |
| `extraTime`, `shootout`, `abandoned` | Cup-tie details, and why a match was abandoned (fewer than 7 players) |
| `events` | Every event with clock, minute label, side, players, position and details (xG, shot result, header, penalty, own goal, kind of offence) |
| `teamStats` | Possession, xG, shots, on target, passes, pass accuracy, box entries, corners, throw-ins, goal kicks, fouls, offsides, cards, tackles, interceptions, saves |
| `playerStats` | Minutes, rating, goals, assists, xG, passes, tackles, interceptions, distance, end condition, cards, injury |
| `carryOver` | What the game keeps: minutes played, end condition (fatigue), injuries with days out, cards, suspensions |
| `explanation` | Why the match went the way it did: a verdict and ranked factors (stronger XI, tactics, chance quality, finishing, keeper, red cards, substitutions, fatigue) |
| `momentum`, `xgTimeline`, `ballInPlay`, `commands` | For charts, and the command log used for replays |

## What it models

- **The match.** A 105 × 68 m pitch simulated in ticks of 0.25 s. Players hold a shape from the formation and tactics, make runs, mark and press. On the ball each player weighs shooting, carrying, passing, crossing and clearing by the chance each works and what it gains or risks (a shot gives the ball away, so long shots need a reason). Passes, interceptions, aerial duels, tackles, shots, blocks and saves are resolved from positions and attributes, and loose balls roll on until someone wins them or they go out of play. Corners and wide free kicks are crossed into a box loaded with the tallest players. Fatigue builds over the match, and injuries happen in challenges.
- **The laws** (IFAB Laws of the Game 2026/27): kick-offs, throw-ins, goal kicks, corners, free kicks and penalties with opponents at the right distance; offside; direct and indirect free kicks (handball, dangerous play, back-passes); advantage; yellow and red cards (denying an obvious goal-scoring chance judged on distance, direction, defenders and the attackers in support; a caution instead of a red when advantage is played for it, and no card if the goal follows; no caution for stopping a promising attack once advantage is played; cautions for delaying a restart); the 8-second rule for keepers; a 5-second countdown on delayed throw-ins and goal kicks (the throw-in goes to the opponents, a goal kick becomes their corner); a player treated on the field stays off until a minute after the restart; dropped balls to the defending keeper in his area, else to the team that would have kept or won the ball; a substituted player leaves within 10 seconds at the nearest boundary; 5 substitutes in 3 windows; abandonment below 7 players; extra time and shootouts. Not modelled: VAR, concussion substitutes, goal-line technology.
- **Realism.** `npm run calibrate` plays thousands of league matches with squads of varying quality and compares them with five top European leagues over five seasons (football-data.co.uk): goals, shots, accuracy, corners, fouls, cards, results, margins, final scorelines, half-time against full-time, and how predictable results are against bookmaker odds. All 24 checks pass, on full distributions as well as averages. Twelve numbers the dataset lacks are checked against published top-league averages, and all are in range: passes (472 per team), ball in play (60 min), throw-ins (40) and goal kicks (14), headers (15% of shots) and shots from outside the box (36%), who takes the shots (forwards 56%, midfielders 30%, defenders 14%), the leading shooter's share (39%), hat-tricks and distance run (9.7 km).
- **Decisions matter.** Every tactic setting and formation has a cost and a benefit, and none wins outright (`npm run balance -- 200`: every option wins between about 32% and 44% against a balanced side, which itself wins 37-40%; with 200 matches per option each figure varies by about ±3-4% from run to run). Every attribute changes results (`npm run attributes`). Tests fail if any option or attribute stops doing its job.
- **Real clubs and players.** All 96 clubs of the 2025/26 Premier League, La Liga, Bundesliga, Serie A and Ligue 1, each with its real squad of 20 (name, position, nationality, age, height, stronger foot; from the CC0 [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets), current to July 2026), its national flags, kit colours and crest. Nobody publishes 1-20 ratings, so `npm run build-teams` derives them: the club's strength comes from its real results, put on the spread the engine is calibrated on; a player's level within the squad from his market value against his own position group, corrected for age; his profile from his exact position, height and age. League matches between real squads average 2.7 goals and 23 shots, as generated squads do. When two kits look alike, the away side changes to its second colour.
- **Deterministic.** One seeded random number generator: the same inputs, seed and commands always give the same match, including after saving and loading mid-match.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/engine/` | The match engine and its types |
| `src/app/`, `src/components/` | The visualizer: matchday and live match, tactics board, report, Engine Lab |
| `src/lib/` | Pitch drawing, the statistics shared by the calibration tools, league squads, the Web Worker batch runner |
| `src/data/reference.json` | Real-football numbers built from the league data |
| `src/data/teams.json` | The real clubs and squads, with derived ratings |
| `tests/` | 103 tests: determinism, save and load, lineups, substitutions, a fuzz test, realism, the laws (including offside), cup ties, tactics, attributes, the pitch view, real squads and kits, seasons |
| `tools/` | Headless play, data download, calibration, balance and attribute tools |

## Known limits

- Some numbers sit at the edge of their real range: the leading shooter takes 39% of his team's shots (about 32% in real football), and hat-tricks and goal kicks are near the ends of theirs.
- Offsides, passing and player-level numbers have no real-data reference; `npm run calibrate` checks them against published averages and would show CHECK if they drifted.
- Yellow-card accumulation across a season is left to the game, which gets every player's cards in `carryOver`.
- Player ratings are derived, not published (see Real clubs and players), and can be edited in the app. Each league is rated on its own: the best clubs of every league are about equally strong. Squad numbers are not in the data, so they are assigned.
- Crests are the clubs' trademarks, so they are not in this repository: the browser loads them from transfermarkt and shows a kit-colour badge when offline.
- A season in the Engine Lab is played matchday by matchday: injured players miss matches, bans are served (red cards, and 5, 10 and 15 yellows for 1, 2 and 3 matches) and tired players can lose their place, which keeps cards and appearances realistic (most yellows in one Premier League season: 14). The best clubs and players still finish too far ahead: in that season the champions took 97 points and the top scorer 42 goals, against about 85-95 and a record of 36. That follows from the top-shooter limit above and how far apart the derived ratings put the best and worst squads.
