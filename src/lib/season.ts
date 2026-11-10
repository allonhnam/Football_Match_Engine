import { LEAGUES, realTeam } from '@/lib/util';
import type { PlayerLine } from '@/lib/summarise';

/** A league's full season: every club plays every other club once at home and once away. */
export function seasonFixtures(leagueCode: string, seed: number) {
  const l = LEAGUES.find(x => x.code === leagueCode);
  if (!l) return [];
  const sheets = new Map(l.teams.map(t => [t.name, realTeam(l.code, t.name)]));
  const jobs: any[] = [];
  for (const h of l.teams) for (const a of l.teams) {
    if (h === a) continue;
    jobs.push({ home: sheets.get(h.name), away: sheets.get(a.name), seed: seed + jobs.length, control: 'none' });
  }
  return jobs;
}

export type TableRow = {
  name: string; short: string; color: string; crest?: number;
  p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number;
  realPts: number; realPos: number;
};
export type PlayerTotal = {
  id: string; name: string; club: string; flag?: string | null; nation?: string; role: string;
  apps: number; minutes: number; goals: number; assists: number; yellows: number; reds: number; injuries: number; rating: number;
};

/** Add up a season's results into the league table and every player's totals. */
export function tallySeason(leagueCode: string, jobs: any[], results: any[]) {
  const l = LEAGUES.find(x => x.code === leagueCode)!;
  const realOrder = l.teams.map(t => t.name); // teams.json lists each league in its real final order
  const rows = new Map<string, TableRow>(l.teams.map((t, i) => [t.name, { name: t.name, short: t.short, color: t.color, crest: t.crest, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, realPts: t.points, realPos: realOrder.indexOf(t.name) + 1 }]));
  const players = new Map<string, PlayerTotal>();
  let played = 0;
  results.forEach((r, i) => {
    if (!r || r.errors) return;
    played++;
    const job = jobs[i], sides = [job.home, job.away];
    const [gh, ga] = r.score, home = rows.get(job.home.name)!, away = rows.get(job.away.name)!;
    home.p++; away.p++; home.gf += gh; home.ga += ga; away.gf += ga; away.ga += gh;
    if (gh > ga) { home.w++; away.l++; home.pts += 3; } else if (gh < ga) { away.w++; home.l++; away.pts += 3; } else { home.d++; away.d++; home.pts++; away.pts++; }
    for (const [id, side, minutes, goals, assists, yellows, red, injured, rating] of (r.players || []) as PlayerLine[]) {
      let t = players.get(id);
      if (!t) {
        const sheet = sides[side], p = sheet.players.find((q: any) => q.id === id) || {};
        t = { id, name: p.name || id, club: sheet.name, flag: p.flag, nation: p.nation, role: p.role, apps: 0, minutes: 0, goals: 0, assists: 0, yellows: 0, reds: 0, injuries: 0, rating: 0 };
        players.set(id, t);
      }
      t.apps++; t.minutes += minutes; t.goals += goals; t.assists += assists; t.yellows += yellows; t.reds += red; t.injuries += injured; t.rating += rating;
    }
  });
  const table = [...rows.values()].map(r => ({ ...r, gd: r.gf - r.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
  const list = [...players.values()].map(p => ({ ...p, rating: p.apps ? p.rating / p.apps : 0 }));
  return { table, players: list, played };
}
