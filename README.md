# Match Engine

This is a football match engine for a management game. Give it two squads and it plays a full match, following the Laws of the Game, and tells you everything that happened: the score, every event, the statistics for each team and player, and what carries over to the next match. You can watch a match live in your browser, or play thousands of matches in the background.

**Try it online:** https://football-match-engine.vercel.app

Made by Hyun.

## What you need

Node 20 or newer. The project works the same on Windows, macOS and Linux.

## Build and run

```bash
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

To build and serve the production version, run `npm run build` and then `npm start`. To run the tests, run `npm test`.

## Using the app

The app has four screens.

1. **Matchday.** Pick two clubs from the five top European leagues, each with its real 2025/26 squad, or make up your own squad. Then kick off a live match or simulate it instantly.
2. **Squad and Tactics.** Choose your starting eleven, your formation and six tactics. Click any player to change his ratings.
3. **Live match.** Watch the match on a 2D pitch at four speeds, make substitutions and tactical changes as it goes, and read the match report at the end.
4. **Engine Lab.** Check the engine against real football, compare tactics, and play a whole league season with a table and every player's goals, assists, cards and injuries.

If you see a short label such as RTG or GD, hover over it to see what it means.

## Using the engine in your own game

The engine is a single file with no dependencies, `src/engine/engine.js`, with its types in `src/engine/engine.d.ts`.

```ts
import { Match, simulateMatch, validateLineup } from '@/engine/engine';
import { realTeam } from '@/lib/util';

const home = realTeam('E0', 'Arsenal');      // a real club and its squad
const away = realTeam('E0', 'Man City');
validateLineup(home);                        // an empty list means the lineup is legal

// Play a whole match in one call
const result = simulateMatch({ home, away, seed: 42 });

// Or play it step by step and manage the team along the way
const match = new Match({ home, away, seed: 42 });
match.runUntil({ minute: 60 });              // or stop at the next goal: { event: 'goal' }
match.substitute(0, home.xi[9], home.bench[8]);
match.setTactics(0, { pressing: 2 });
const saved = match.save();                  // everything needed to replay the match
const final = match.runToEnd();
```

The result gives you the score, every event with its minute, the statistics for both teams and every player, what carries over to the next match (fatigue, injuries, cards and bans), and a short explanation of why the match went the way it did. The same squads, seed and decisions always give the same match, so a saved match replays exactly. A lineup or command that breaks the rules comes back as a clear error instead of crashing.

To use squads of your own, pass your own players to `makeTeam`, or let it generate a squad with `makeTeam({ name: 'Northbridge FC', seed: 11, strength: 13 })`.

## How we know it plays like real football

The engine follows the IFAB Laws of the Game 2026/27, including offside, fouls and cards, advantage, every kind of restart, substitutions, extra time and penalty shootouts. VAR, concussion substitutes and goal line technology are not included.

Its numbers are compared with 8,907 real matches from the top five European leagues over five seasons: goals, shots, corners, fouls, cards, results, scorelines and more. All 24 checks pass, on the full spread of each number and not only the average. You can run these checks yourself:

```bash
npm run calibrate 3000
npm run balance
npm run attributes
npm run simulate
```

The first compares 3,000 simulated matches with the real ones. The second shows that every tactic and formation has a cost as well as a benefit, so none of them wins outright. The third shows that every player rating makes a difference. The last plays one match and prints it in the terminal.

## Good to know

Player ratings are estimated from real data such as position, age and market value, because no public source publishes them. You can change any rating in the app.

Club crests load from transfermarkt while you are online. Offline, each club shows a badge in its own colours.

Over a full season, the very best clubs and players still finish further ahead than they usually do in real football. For example, a top striker can score a few more goals than any real player has managed in one season.

A saved match replays exactly on the engine version it was saved with, which is now 0.6.1.

The real match data comes from [Football Data](https://www.football-data.co.uk), and the real squads from the open [transfermarkt datasets](https://github.com/dcaribou/transfermarkt-datasets).
