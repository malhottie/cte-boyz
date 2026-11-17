// Builds one "league model" from Sleeper data that every page uses.
import { get, local, avatarUrl, isMock } from "./api.js";
import { CONFIG } from "./config.js";

let modelPromise = null;
export function loadModel() { return (modelPromise ??= buildModel()); }

const SLOT_ELIG = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"], WRRB_FLEX: ["WR", "RB"], REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"], DL: ["DL", "DE", "DT"], LB: ["LB"], DB: ["DB", "CB", "S"],
  IDP_FLEX: ["DL", "DE", "DT", "LB", "DB", "CB", "S"],
};
export const FLEX_SLOTS = ["FLEX", "WRRB_FLEX", "REC_FLEX", "SUPER_FLEX", "IDP_FLEX"];
export const slotEligible = (slot) => SLOT_ELIG[slot] || [slot];

async function buildModel() {
  const id = CONFIG.LEAGUE_ID;
  const [state, league, users, rosters, tradedPicks, drafts] = await Promise.all([
    get("/state/nfl"), get(`/league/${id}`), get(`/league/${id}/users`), get(`/league/${id}/rosters`),
    get(`/league/${id}/traded_picks`), get(`/league/${id}/drafts`),
  ]);
  const s = league.settings || {};
  const season = +league.season;
  const playoffStart = s.playoff_week_start || 15;
  const lastWeek = s.last_scored_leg ?? 0;
  const finished = league.status === "complete" || season < +state.season;
  // Weeks whose scores are final
  const liveWeek = finished ? null : (state.season_type === "regular" || state.season_type === "post") ? +state.display_week || +state.week : null;
  const maxWeek = finished ? Math.max(lastWeek, playoffStart + 2) : Math.max(0, (liveWeek ?? 1) - 1);

  const userById = Object.fromEntries(users.map((u) => [u.user_id, u]));
  const teams = rosters.map((r) => {
    const u = userById[r.owner_id] || {};
    return {
      rosterId: r.roster_id, ownerId: r.owner_id, user: u, roster: r,
      name: u.metadata?.team_name || u.display_name || `Team ${r.roster_id}`,
      owner: u.display_name || "Open slot", username: (u.username || u.display_name || "").toLowerCase(),
      avatar: avatarUrl(u.metadata?.avatar || u.avatar),
      coOwners: (r.co_owners || []).map((c) => userById[c]?.display_name).filter(Boolean),
    };
  });
  const teamById = Object.fromEntries(teams.map((t) => [t.rosterId, t]));

  const model = {
    state, league, season, users, rosters, teams, teamById, tradedPicks, drafts,
    name: CONFIG.LEAGUE_NAME || league.name, settings: s,
    rosterPositions: league.roster_positions || [],
    scoring: league.scoring_settings || {},
    playoffStart, regWeeks: playoffStart - 1, liveWeek, maxWeek, finished,
    numTeams: s.num_teams || rosters.length, playoffTeams: s.playoff_teams || 6,
    weeks: {}, players: await loadPlayers(),
  };
  model.starterSlots = model.rosterPositions.filter((p) => p !== "BN" && p !== "IR" && p !== "TAXI");
  // Load every week that has (or is about to have) scores, plus future regular-season weeks for the schedule
  const weekList = [];
  for (let w = 1; w <= Math.max(model.regWeeks, maxWeek, liveWeek ?? 0); w++) weekList.push(w);
  const all = await Promise.all(weekList.map((w) => get(`/league/${id}/matchups/${w}`, { persist: finished }).catch(() => [])));
  weekList.forEach((w, i) => (model.weeks[w] = all[i] || []));
  model.completedWeeks = weekList.filter((w) => w <= maxWeek && model.weeks[w].some((m) => m.points > 0));
  model.completedReg = model.completedWeeks.filter((w) => w < playoffStart);
  model.games = buildGames(model);
  model.standings = computeStandings(model);
  return model;
}

export async function loadPlayers() {
  const slim = await local("data/players.json");
  if (slim) return slim;
  // Fallback: Sleeper's full player DB (~5 MB). Sleeper asks for at most one call per day.
  const full = await get("/players/nfl");
  const out = {};
  for (const [id, p] of Object.entries(full)) {
    if (!p) continue;
    out[id] = { n: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || id, p: p.position,
      fp: p.fantasy_positions || [p.position], t: p.team, a: p.age, inj: p.injury_status, x: p.years_exp, num: p.number };
  }
  return out;
}

export const pName = (m, pid) => m.players[pid]?.n || pid;
export const pPos = (m, pid) => m.players[pid]?.p || (isNaN(+pid) ? "DEF" : "?");
export const pFp = (m, pid) => m.players[pid]?.fp || [pPos(m, pid)];

// One record per head-to-head game
function buildGames(m) {
  const games = [];
  for (const [w, ms] of Object.entries(m.weeks)) {
    const byM = {};
    for (const x of ms) if (x.matchup_id != null) (byM[x.matchup_id] ||= []).push(x);
    for (const [mid, pair] of Object.entries(byM)) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      games.push({ week: +w, matchupId: +mid, a: a.roster_id, b: b.roster_id, pa: a.points || 0, pb: b.points || 0,
        final: m.completedWeeks.includes(+w), ma: a, mb: b });
    }
  }
  return games;
}
export const gamesInWeek = (m, w) => m.games.filter((g) => g.week === w);
export const teamEntry = (m, w, rid) => (m.weeks[w] || []).find((x) => x.roster_id === rid);
export function opponentOf(m, w, rid) {
  const g = m.games.find((g) => g.week === w && (g.a === rid || g.b === rid));
  return g ? (g.a === rid ? g.b : g.a) : null;
}
export const median = (arr) => { const a = [...arr].sort((x, y) => x - y); const n = a.length; return !n ? 0 : n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const sd = (a) => { if (a.length < 2) return 0; const mu = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - mu) ** 2, 0) / (a.length - 1)); };

export function computeStandings(m) {
  const rows = Object.fromEntries(m.teams.map((t) => [t.rosterId, {
    rid: t.rosterId, w: 0, l: 0, t: 0, pf: 0, pa: 0, mw: 0, ml: 0, apw: 0, apl: 0, scores: [], streak: "",
    results: [], maxPf: 0 }]));
  for (const w of m.completedReg) {
    const gs = gamesInWeek(m, w);
    const scores = (m.weeks[w] || []).map((x) => x.points || 0);
    const med = median(scores);
    for (const x of m.weeks[w]) {
      const r = rows[x.roster_id]; if (!r) continue;
      const p = x.points || 0;
      r.scores.push(p);
      if (p > med) r.mw++; else if (p < med) r.ml++;
      for (const y of scores) { if (p > y) r.apw++; else if (p < y) r.apl++; }
      r.apl -= 0; // self compare never counts
      const opt = optimalLineup(m, x);
      r.maxPf += opt.points;
    }
    for (const g of gs) {
      const A = rows[g.a], B = rows[g.b];
      A.pf += g.pa; A.pa += g.pb; B.pf += g.pb; B.pa += g.pa;
      const res = g.pa > g.pb ? ["W", "L"] : g.pa < g.pb ? ["L", "W"] : ["T", "T"];
      A.results.push(res[0]); B.results.push(res[1]);
      for (const [R, s] of [[A, res[0]], [B, res[1]]]) s === "W" ? R.w++ : s === "L" ? R.l++ : R.t++;
    }
  }
  const out = Object.values(rows);
  for (const r of out) {
    const rs = r.results; let k = rs.length - 1; let n = 0;
    while (k >= 0 && rs[k] === rs.at(-1)) { n++; k--; }
    r.streak = rs.length ? rs.at(-1) + n : "";
    r.pct = r.w + r.l + r.t ? (r.w + r.t / 2) / (r.w + r.l + r.t) : 0;
    r.avg = mean(r.scores);
    r.expW = r.apw + r.apl ? (r.apw / (r.apw + r.apl)) * r.scores.length : 0; // all-play expected wins
    r.luck = r.w - r.expW;
  }
  const lgPf = out.map((r) => r.pf), lgPa = out.map((r) => r.pa);
  for (const r of out) { r.pfVsMed = r.pf - median(lgPf); r.paVsMed = r.pa - median(lgPa); }
  return sortStandings(out);
}
export const sortStandings = (rows) => [...rows].sort((a, b) => (b.w + b.t / 2) - (a.w + a.t / 2) || b.pf - a.pf);

// League rule: top 6 by record; 7th spot to the highest-PF team if it isn't already in, otherwise 7th by record.
export function seedPlayoffs(rows, nTeams) {
  const sorted = sortStandings(rows);
  if (nTeams !== 7) return sorted.slice(0, nTeams);
  const top6 = sorted.slice(0, 6);
  const pfLeader = [...rows].sort((a, b) => b.pf - a.pf)[0];
  if (top6.includes(pfLeader)) return sorted.slice(0, 7);
  return [...top6, pfLeader];
}

// Best possible lineup from the players a team had that week
export function optimalLineup(m, entry) {
  const pts = entry.players_points || {};
  const pool = (entry.players || []).map((pid) => ({ pid, pts: pts[pid] || 0, fp: pFp(m, pid) }));
  const slots = m.starterSlots.map((s, i) => ({ s, i, elig: slotEligible(s) })).sort((a, b) => a.elig.length - b.elig.length);
  const used = new Set(); const lineup = []; let total = 0;
  for (const sl of slots) {
    const best = pool.filter((p) => !used.has(p.pid) && p.fp.some((f) => sl.elig.includes(f))).sort((a, b) => b.pts - a.pts)[0];
    if (best) { used.add(best.pid); total += best.pts; lineup.push({ slot: sl.s, ...best }); }
  }
  return { points: Math.round(total * 100) / 100, lineup, ids: used };
}

// Start/sit review for one team-week
export function startSit(m, entry) {
  const opt = optimalLineup(m, entry);
  const pts = entry.players_points || {};
  const starters = (entry.starters || []).filter((p) => p && p !== "0");
  const bench = (entry.players || []).filter((p) => !starters.includes(p) && !(entry.reserve || []).includes(p));
  const misses = [];
  (entry.starters || []).forEach((pid, i) => {
    const slot = m.starterSlots[i]; if (!slot) return;
    const sp = pid && pid !== "0" ? pts[pid] || 0 : 0;
    const better = bench.filter((b) => pFp(m, b).some((f) => slotEligible(slot).includes(f)) && (pts[b] || 0) > sp)
      .sort((a, b) => (pts[b] || 0) - (pts[a] || 0))[0];
    if (better) misses.push({ slot, started: pid, startedPts: sp, benched: better, benchedPts: pts[better] || 0, diff: (pts[better] || 0) - sp });
  });
  const correct = starters.filter((p) => opt.ids.has(p)).length;
  return { actual: entry.points || 0, optimal: opt.points, pct: opt.points ? (entry.points || 0) / opt.points : 1,
    correct, total: m.starterSlots.length, misses: misses.sort((a, b) => b.diff - a.diff) };
}

// Fantasy points for one player's stat line under this league's scoring
export function fantasyPoints(m, stats) {
  if (!stats) return 0;
  let t = 0;
  for (const [k, v] of Object.entries(m.scoring)) if (stats[k] != null) t += stats[k] * v;
  if (t === 0 && stats.pts_ppr != null) { const rec = m.scoring.rec ?? 1; t = rec >= 1 ? stats.pts_ppr : rec >= 0.5 ? stats.pts_half_ppr : stats.pts_std; }
  return Math.round(t * 100) / 100;
}

export const loadStats = (season, week) => get(`/stats/nfl/regular/${season}/${week}`).catch(() => ({}));
export const loadProjections = (season, week) => get(`/projections/nfl/regular/${season}/${week}`).catch(() => null);

// ---------- History (previous seasons via previous_league_id) ----------
let histPromise = null;
export function loadHistory(m) { return (histPromise ??= buildHistory(m)); }
async function buildHistory(m) {
  const seasons = [];
  let id = m.league.league_id || CONFIG.LEAGUE_ID;
  let league = m.league;
  for (let guard = 0; id && guard < 25; guard++) {
    const done = league.status === "complete";
    const [users, rosters, wb] = await Promise.all([
      get(`/league/${id}/users`, { persist: done }), get(`/league/${id}/rosters`, { persist: done }),
      get(`/league/${id}/winners_bracket`, { persist: done }).catch(() => []),
    ]);
    seasons.push({ id, league, season: +league.season, users, rosters, wb: wb || [], done });
    id = league.previous_league_id;
    if (!id || id === "0") break;
    league = await get(`/league/${id}`, { persist: true }).catch(() => null);
    if (!league) break;
  }
  for (const s of seasons) {
    const final = s.wb.find((g) => g.p === 1), third = s.wb.find((g) => g.p === 3);
    const ownerOf = (rid) => s.rosters.find((r) => r.roster_id === rid)?.owner_id;
    s.champion = final?.w ? ownerOf(final.w) : null;
    s.runnerUp = final?.l ? ownerOf(final.l) : null;
    s.third = third?.w ? ownerOf(third.w) : null;
    s.ownerOf = ownerOf;
  }
  return seasons;
}
// Head-to-head games for every season (lazy; heavy-ish)
export async function loadHistoryGames(m) {
  const seasons = await loadHistory(m);
  const games = [];
  for (const s of seasons) {
    const ps = s.league.settings?.playoff_week_start || 15;
    const last = s.season === m.season ? m.maxWeek : Math.max(s.league.settings?.last_scored_leg || 0, ps + 2);
    const weeks = await Promise.all(Array.from({ length: last }, (_, i) =>
      s.season === m.season ? Promise.resolve(m.weeks[i + 1] || []) : get(`/league/${s.id}/matchups/${i + 1}`, { persist: s.done }).catch(() => [])));
    weeks.forEach((ms, i) => {
      const byM = {};
      for (const x of ms) if (x.matchup_id != null) (byM[x.matchup_id] ||= []).push(x);
      for (const pr of Object.values(byM)) if (pr.length === 2 && (pr[0].points || pr[1].points)) {
        games.push({ season: s.season, week: i + 1, playoff: i + 1 >= ps,
          oa: s.ownerOf(pr[0].roster_id), ob: s.ownerOf(pr[1].roster_id), pa: pr[0].points, pb: pr[1].points });
      }
    });
  }
  return games;
}

// Next season's picks owned by each roster
export function futurePicks(m, season = m.season + 1) {
  const rounds = CONFIG.DRAFT_ROUNDS || m.settings.draft_rounds || 16;
  const own = Object.fromEntries(m.teams.map((t) => [t.rosterId, []]));
  for (const t of m.teams) for (let r = 1; r <= rounds; r++) {
    const tr = m.tradedPicks.find((p) => +p.season === season && p.round === r && p.roster_id === t.rosterId);
    const holder = tr ? tr.owner_id : t.rosterId;
    (own[holder] ||= []).push({ round: r, original: t.rosterId, traded: !!tr && holder !== t.rosterId });
  }
  for (const k in own) own[k].sort((a, b) => a.round - b.round);
  return own;
}
