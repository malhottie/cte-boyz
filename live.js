// Live scoring for the current week: Sleeper live points + remaining projections + NFL game clocks (ESPN).
import { get, isMock } from "./api.js";
import { loadProjections, loadStats, fantasyPoints } from "./data.js";
import { teamModels, normCdf } from "./sim.js";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const FIX = { WSH: "WAS", JAC: "JAX", LA: "LAR", OAK: "LV", SD: "LAC" };

// { TEAM: { state: "pre" | "in" | "post", frac: share of the game still to play, detail } } or null
async function nflGames(m) {
  if (isMock()) return (await import("./mock.js")).mockLive();
  try {
    const d = await (await fetch(ESPN, { cache: "no-store" })).json();
    if (+d.week?.number !== +m.liveWeek) return null;
    const out = {};
    for (const ev of d.events || []) {
      const c = ev.competitions?.[0], st = c?.status || ev.status, state = st?.type?.state;
      let frac = 1;
      if (state === "post") frac = 0;
      else if (state === "in") { const per = st.period || 1; frac = per > 4 ? 0.03 : Math.max(0.01, ((4 - per) * 900 + (st.clock || 0)) / 3600); }
      for (const k of c?.competitors || []) { const ab = k.team?.abbreviation; out[FIX[ab] || ab] = { state, frac, detail: st?.type?.shortDetail || "" }; }
    }
    for (const t of d.week?.teamsOnBye || []) { const ab = t.abbreviation; if (ab) out[FIX[ab] || ab] = { state: "bye", frac: 0, detail: "Bye" }; }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

/**
 * Live board for m.liveWeek. Returns null when there is no current week.
 * teams[rid] = { points, remaining, expected, sd, toPlay, inPlay, done }
 * games = [{ a, b, pa, pb, p (chance a wins), final }]
 */
export async function liveBoard(m, { fresh = false } = {}) {
  const w = m.liveWeek; if (!w) return null;
  const entries = fresh ? await get(`/league/${m.league.league_id}/matchups/${w}`, { fresh: true }).catch(() => m.weeks[w] || []) : m.weeks[w] || [];
  if (!entries.length) return null;
  const [proj, nfl] = await Promise.all([loadProjections(m.season, w), nflGames(m)]);
  const stats = nfl ? null : await loadStats(m.season, w);
  const models = teamModels(m);
  const fracOf = (pid) => {
    const tm = m.players[pid]?.t || (isNaN(+pid) ? pid : null);
    if (nfl) return tm && nfl[tm] ? nfl[tm] : { state: tm ? "bye" : "post", frac: 0 };
    return stats?.[pid]?.gp ? { state: "post", frac: 0 } : { state: "pre", frac: 1 }; // fallback: no game clocks
  };
  const teams = {};
  for (const e of entries) {
    const st = (e.starters || []).filter((p) => p && p !== "0"); const M = models[e.roster_id] || { mu: 110, sd: 22 };
    let rem = 0, full = 0, toPlay = 0, inPlay = 0, done = 0;
    for (const pid of st) {
      const pj = proj && proj[pid] ? fantasyPoints(m, proj[pid]) : proj ? 0 : M.mu / (st.length || 1);
      const g = fracOf(pid); full += pj; rem += pj * g.frac;
      g.state === "pre" ? toPlay++ : g.state === "in" ? inPlay++ : done++;
    }
    const share = full > 0 ? rem / full : 0;
    teams[e.roster_id] = { points: e.points || 0, remaining: rem, expected: (e.points || 0) + rem, sd: M.sd * Math.sqrt(share), toPlay, inPlay, done, matchupId: e.matchup_id };
  }
  const by = {}; for (const e of entries) if (e.matchup_id != null) (by[e.matchup_id] ||= []).push(e.roster_id);
  const games = Object.values(by).filter((x) => x.length === 2).map(([a, b]) => {
    const A = teams[a], B = teams[b]; const v = Math.sqrt(A.sd ** 2 + B.sd ** 2);
    const p = v < 0.01 ? (A.expected > B.expected ? 1 : A.expected < B.expected ? 0 : 0.5) : normCdf((A.expected - B.expected) / v);
    return { a, b, pa: A.points, pb: B.points, p, final: v < 0.01 };
  });
  return { week: w, teams, games, started: Object.values(teams).some((t) => t.points !== 0 || t.inPlay), allFinal: games.length > 0 && games.every((g) => g.final), hasClock: !!nfl, hasProj: !!proj };
}
