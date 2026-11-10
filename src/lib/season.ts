import { findLeague, realTeam, pickXI, clone } from '@/lib/util';
import type { PlayerLine } from '@/lib/summarise';

// Between matchdays, as a club would manage its squad:
const RECOVERY = 0.2;            // condition regained in the week between matches (1 = fully fit)
const DAYS_PER_MATCHDAY = 7;     // an injury of 10 days misses the next 2 matches
const YELLOW_BANS = [[5, 1], [10, 2], [15, 3]]; // Premier League rule: 5 yellows, a 1-match ban; 10, 2; 15, 3

/**
 * The fixture list: every club plays every other club once at home and once away, in matchdays where each club
 * plays once (the circle method). The second half of the season repeats the first with home and away swapped.
 */
export function seasonSchedule(n: number) {
  const ids = Array.from({ length: n }, (_, i) => i), rounds: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [number, number][] = [];
    for (let k = 0; k < n / 2; k++) {
      const a = ids[k], b = ids[n - 1 - k];
      round.push((r + k) % 2 ? [b, a] : [a, b]); // alternate home and away
    }
    rounds.push(round);
    ids.splice(1, 0, ids.pop()!); // keep the first club fixed, rotate the rest
  }
  return [...rounds, ...rounds.map(rd => rd.map(([h, a]) => [a, h] as [number, number]))];
}

type Status = { cond: number; injuredFor: number; bannedFor: number; yellows: number; missedInjured: number; missedBanned: number };

/** The team sheet a club sends out this matchday: injured and banned players unavailable, tired players' condition. */
function sheetFor(base: any, status: Map<string, Status>) {
  const t = clone(base);
  for (const p of t.players) {
    const s = status.get(p.id)!;
    p.condition = s.cond;
    p.unavailable = s.injuredFor > 0 ? 'injured' : s.bannedFor > 0 ? 'suspended' : null;
  }
  // Never field fewer than a keeper and 13 others: the players closest to returning are rushed back.
  const back = (keep: (p: any) => boolean, need: number) => {
    const out = t.players.filter((p: any) => p.unavailable && keep(p)).sort((a: any, b: any) => {
      const sa = status.get(a.id)!, sb = status.get(b.id)!;
      return Math.max(sa.injuredFor, sa.bannedFor) - Math.max(sb.injuredFor, sb.bannedFor);
    });
    for (const p of out.slice(0, Math.max(0, need))) p.unavailable = null;
  };
  back((p: any) => p.role === 'GK', 1 - t.players.filter((p: any) => p.role === 'GK' && !p.unavailable).length);
  back(() => true, 14 - t.players.filter((p: any) => !p.unavailable).length);
  return { ...t, ...pickXI(t, t.formation) };
}

/**
 * Play a real league's whole season matchday by matchday. After each matchday every player's condition, injuries,
 * bans and yellow cards carry into the next: injured and banned players miss matches, tired players can be rested.
 * `run` plays a list of matches and returns their summaries (runBatch in the browser).
 */
export async function playSeason(leagueCode: string, seed: number, run: (jobs: any[]) => Promise<any[]>, onProgress?: (f: number) => void, maxRounds = Infinity) {
  const l = findLeague(leagueCode);
  if (!l) return null;
  const bases = l.teams.map(t => realTeam(l.code, t.name) as any);
  const status = new Map<string, Status>();
  for (const b of bases) for (const p of b.players) status.set(p.id, { cond: 1, injuredFor: 0, bannedFor: 0, yellows: 0, missedInjured: 0, missedBanned: 0 });
  const schedule = seasonSchedule(l.teams.length), jobs: any[] = [], results: any[] = [];
  for (let r = 0; r < Math.min(schedule.length, maxRounds); r++) {
    const round = schedule[r].map(([h, a], k) => ({ home: sheetFor(bases[h], status), away: sheetFor(bases[a], status), seed: seed + jobs.length + k, control: 'none' }));
    const out = await run(round);
    round.forEach((job, k) => {
      const res = out[k], played = new Map<string, PlayerLine>();
      for (const line of (res && !res.errors ? res.players : []) as PlayerLine[]) played.set(line[0], line);
      for (const sheet of [job.home, job.away]) for (const p of sheet.players) {
        const s = status.get(p.id)!, line = played.get(p.id);
        // a matchday served by an unavailable player counts off his injury or ban
        if (p.unavailable === 'injured') { s.injuredFor--; s.missedInjured++; }
        else if (p.unavailable === 'suspended') { s.bannedFor--; s.missedBanned++; }
        if (line) {
          const [, , , , , yellows, red, , , endCond, injuryDays, ban] = line;
          s.cond = endCond;
          if (injuryDays > 0) s.injuredFor = Math.max(s.injuredFor, Math.ceil(injuryDays / DAYS_PER_MATCHDAY));
          // a red card's ban comes from the referee's report; yellows add up over the season
          const before = s.yellows; s.yellows += red ? 0 : yellows;
          let bans = ban;
          for (const [at, len] of YELLOW_BANS) if (before < at && s.yellows >= at) bans += len;
          s.bannedFor += bans;
        }
        s.cond = Math.min(1, s.cond + RECOVERY);
      }
      jobs.push(job); results.push(res);
    });
    onProgress?.((r + 1) / schedule.length);
  }
  return { jobs, results, status };
}

export type TableRow = {
  name: string; short: string; color: string; crest?: number;
  p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number;
  realPts: number; realPos: number;
};
export type PlayerTotal = {
  id: string; name: string; club: string; flag?: string | null; nation?: string; role: string;
  apps: number; minutes: number; goals: number; assists: number; yellows: number; reds: number; injuries: number; rating: number;
  missedInjured: number; missedBanned: number;
};

/** Add up a season's results into the league table and every player's totals. */
export function tallySeason(leagueCode: string, jobs: any[], results: any[], status?: Map<string, Status>) {
  const l = findLeague(leagueCode)!;
  const realOrder = l.teams.map(t => t.name); // teams.json lists each league in its real final order
  const rows = new Map<string, TableRow>(l.teams.map(t => [t.name, { name: t.name, short: t.short, color: t.color, crest: t.crest, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, realPts: t.points, realPos: realOrder.indexOf(t.name) + 1 }]));
  const players = new Map<string, PlayerTotal>();
  // every squad player is listed, including those who never got on
  for (const t of l.teams) { const sheet: any = realTeam(l.code, t.name); for (const p of sheet.players) players.set(p.id, { id: p.id, name: p.name, club: t.name, flag: p.flag, nation: p.nation, role: p.role, apps: 0, minutes: 0, goals: 0, assists: 0, yellows: 0, reds: 0, injuries: 0, rating: 0, missedInjured: 0, missedBanned: 0 }); }
  let played = 0;
  results.forEach((r, i) => {
    if (!r || r.errors) return;
    played++;
    const job = jobs[i];
    const [gh, ga] = r.score, home = rows.get(job.home.name)!, away = rows.get(job.away.name)!;
    home.p++; away.p++; home.gf += gh; home.ga += ga; away.gf += ga; away.ga += gh;
    if (gh > ga) { home.w++; away.l++; home.pts += 3; } else if (gh < ga) { away.w++; home.l++; away.pts += 3; } else { home.d++; away.d++; home.pts++; away.pts++; }
    for (const [id, , minutes, goals, assists, yellows, red, injured, rating] of (r.players || []) as PlayerLine[]) {
      const t = players.get(id);
      if (!t) continue;
      t.apps++; t.minutes += minutes; t.goals += goals; t.assists += assists; t.yellows += yellows; t.reds += red; t.injuries += injured; t.rating += rating;
    }
  });
  if (status) for (const [id, s] of status) { const t = players.get(id); if (t) { t.missedInjured = s.missedInjured; t.missedBanned = s.missedBanned; } }
  const table = [...rows.values()].map(r => ({ ...r, gd: r.gf - r.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
  const list = [...players.values()].map(p => ({ ...p, rating: p.apps ? p.rating / p.apps : 0 }));
  return { table, players: list, played };
}

/** All fixtures at once, every squad at full strength (no carry-over); kept for quick checks. */
export function seasonFixtures(leagueCode: string, seed: number) {
  const l = findLeague(leagueCode);
  if (!l) return [];
  const sheets = new Map(l.teams.map(t => [t.name, realTeam(l.code, t.name)]));
  const jobs: any[] = [];
  for (const h of l.teams) for (const a of l.teams) {
    if (h === a) continue;
    jobs.push({ home: sheets.get(h.name), away: sheets.get(a.name), seed: seed + jobs.length, control: 'none' });
  }
  return jobs;
}
