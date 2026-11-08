# Match Engine

A football (soccer) match engine for a management game, with a browser front end: match setup, squad and tactics board, a live 2D match view with touchline controls, a post-match report, and an Engine Lab for checking realism, tactical balance and performance.

Author: Hyun

## Run it

The front end is a single page with no build step. Serve the folder with any static file server and open it in a browser:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Node users can run `npx serve .` instead.

A server is needed (rather than opening `index.html` directly) so the Engine Lab can load `engine.js` into background Web Workers. Without one, batch simulations fall back to the main thread and still work, only slower.

Works on Windows, macOS and Linux in any current browser.

## Use the engine in code

`engine.js` has no dependencies. In the browser it defines a global `MatchEngine`; in Node it is a CommonJS module.

```js
const { Match, makeTeam, validateLineup, simulateMatch } = require('./engine.js');

const home = makeTeam({ name: 'Northbridge FC', seed: 11, strength: 13 });
const away = makeTeam({ name: 'Harbour City', seed: 22, strength: 12 });
validateLineup(home);                    // [] or a list of typed errors

// Headless: one call, full result
const result = simulateMatch({ home, away, seed: 42 });

// Interactive: run, change, resume
const m = new Match({ home, away, seed: 42, control: 'home' });
m.runUntil({ minute: 60 });              // or { event: 'goal' } / { event: 'key' }
m.substitute(0, outId, inId);            // applied at the next stoppage
m.setTactics(0, { pressing: 2, mentality: 2 });
m.setFormation(0, '4-4-2');
const saved = m.save();                  // inputs + command log
const res = m.runToEnd();                // score, events, stats, carryOver, explanation

// Exact replay from inputs, seed and command log
const again = Match.load(saved).runToEnd();
```

### Result object

| Field | Contents |
| --- | --- |
| `score` | `[home, away]` |
| `events` | Every event with tick, clock, minute label, side, players, position and extra data (xG, result) |
| `teamStats` | Possession, xG, shots, on target, passes, pass accuracy, box and final-third entries, corners, fouls, offsides, cards, saves |
| `playerStats` | Minutes, rating, goals, assists, xG, passes, tackles, distance, end condition, cards, injury |
| `carryOver` | What the game keeps: minutes played, end condition, injuries with days out, cards, suspensions |
| `explanation` | A verdict sentence and ranked key factors explaining the result |
| `commands` | The manager command log used for replays |

## How the engine works

- 2D pitch, 105 × 68 m, simulated in fixed ticks of 0.25 s of game time.
- Off-ball players move to formation-based targets that shift with the ball, phase of play and tactics; defenders mark and press.
- The ball carrier chooses between shooting, passing, crossing, carrying and clearing using expected value, pressure and player attributes.
- Laws covered: kick-off, two halves with added time, throw-ins, goal kicks, corners, offside (not from throw-ins, goal kicks or corners), fouls, direct and indirect free kicks, penalties, yellow and red cards (second yellow = red), sent-off players not replaced, 5 substitutes in 3 windows plus half-time, abandonment below 7 players.
- Fatigue lowers pace and skill; pressing and tempo drain stamina faster; injuries can happen in challenges.
- One seeded random number generator: the same inputs, seed and commands always give the same match.

## Files

| File | Purpose |
| --- | --- |
| `engine.js` | The match engine and its API |
| `index.html` | The front end (React, Tailwind and Babel loaded from CDNs) |

## Status

Working prototype. Planned next: build and test scripts, automated determinism and fuzz tests, calibration against real league data, remaining Laws (advantage, handball, goalkeeper holding time), and tactic balance tuning.
