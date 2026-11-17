// Monte Carlo season simulator for "What are the chances?"
import { mean, sd, seedPlayoffs, teamEntry, pPos } from "./data.js";
import { CONFIG } from "./config.js";

function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
export const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// Scoring model per team: shrunk mean (season + recent form) and shrunk SD
export function teamModels(m, projByRid = null) {
  const all = []; const per = {};
  for (const t of m.teams) {
    const sc = m.completedWeeks.map((w) => teamEntry(m, w, t.rosterId)?.points).filter((x) => x > 0);
    per[t.rosterId] = sc; all.push(...sc);
  }
  const lgMu = mean(all) || 110, lgSd = sd(all) || 22;
  const out = {};
  for (const t of m.teams) {
    const sc = per[t.rosterId], n = sc.length;
    const seasonMu = n ? mean(sc) : lgMu, recent = n ? mean(sc.slice(-CONFIG.TREND_GAMES)) : lgMu;
    const raw = 0.65 * seasonMu + 0.35 * recent;
    const mu = (n * raw + 3 * lgMu) / (n + 3);
    const s = Math.sqrt(((n - 1 > 0 ? (n - 1) * sd(sc) ** 2 : 0) + 4 * lgSd ** 2) / (Math.max(n - 1, 0) + 4));
    out[t.rosterId] = { mu, sd: s, base: mu, n };
  }
  if (projByRid) for (const [rid, p] of Object.entries(projByRid)) if (p > 0 && out[rid]) out[rid].weekMu = 0.6 * p + 0.4 * out[rid].mu;
  return out;
}

export function winProb(models, a, b, useWeek = true) {
  const A = models[a], B = models[b];
  const ma = useWeek && A.weekMu ? A.weekMu : A.mu, mb = useWeek && B.weekMu ? B.weekMu : B.mu;
  return normCdf((ma - mb) / Math.sqrt(A.sd ** 2 + B.sd ** 2));
}

// Projected starter points for a week, using Sleeper projections and each team's current lineup
export function projectedTeamPoints(m, week, proj, fp) {
  if (!proj) return null;
  const out = {};
  for (const e of m.weeks[week] || []) {
    const st = (e.starters?.length ? e.starters : m.rosters.find((r) => r.roster_id === e.roster_id)?.starters) || [];
    out[e.roster_id] = st.filter((p) => p && p !== "0").reduce((s, pid) => s + fp(proj[pid]), 0);
  }
  return out;
}

// Standard bracket order for 8/16 slots; seeds above the field are byes
const ORDER = { 2: [1, 2], 4: [1, 4, 2, 3], 8: [1, 8, 4, 5, 2, 7, 3, 6], 16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11] };

export function simulate(m, { models, bracket = [], runs = CONFIG.SIMULATIONS, live = null } = {}) {
  const rids = m.teams.map((t) => t.rosterId);
  const base = Object.fromEntries(m.standings.map((r) => [r.rid, r]));
  const remaining = m.games.filter((g) => g.week < m.playoffStart && !m.completedWeeks.includes(g.week));
  const nP = m.playoffTeams; const size = 2 ** Math.ceil(Math.log2(nP)); const byes = size - nP;
  const tally = Object.fromEntries(rids.map((r) => [r, { playoffs: 0, bye: 0, final: 0, champ: 0, last: 0, wins: 0, seeds: Array(nP + 1).fill(0), pfSpot: 0 }]));
  const draw = (rid, week) => { if (live && week === m.liveWeek && live[rid]) return live[rid].expected + randn() * live[rid].sd; const M = models[rid]; const mu = week === m.liveWeek && M.weekMu ? M.weekMu : M.mu; return mu + randn() * M.sd; };
  const regDone = remaining.length === 0;

  for (let k = 0; k < runs; k++) {
    const rows = rids.map((r) => ({ rid: r, w: base[r].w, l: base[r].l, t: base[r].t, pf: base[r].pf }));
    const byId = Object.fromEntries(rows.map((r) => [r.rid, r]));
    for (const g of remaining) {
      const a = draw(g.a, g.week), b = draw(g.b, g.week);
      byId[g.a].pf += a; byId[g.b].pf += b;
      if (a > b) { byId[g.a].w++; byId[g.b].l++; } else { byId[g.b].w++; byId[g.a].l++; }
    }
    const seeds = seedPlayoffs(rows, nP);
    const last = [...rows].sort((x, y) => (x.w + x.t / 2) - (y.w + y.t / 2) || x.pf - y.pf)[0];
    tally[last.rid].last++;
    seeds.forEach((r, i) => { const T = tally[r.rid]; T.playoffs++; T.seeds[i + 1]++; if (i < byes) T.bye++; if (nP === 7 && i === 6) {
      const top6 = [...rows].sort((x, y) => (y.w + y.t / 2) - (x.w + x.t / 2) || y.pf - x.pf).slice(0, 6); if (!top6.includes(r)) T.pfSpot++; } });
    for (const r of rows) tally[r.rid].wins += r.w;
    // Playoff bracket
    let champ, runnerUp;
    if (bracket.length) {
      const res = {};
      for (const g of [...bracket].sort((a, b) => a.r - b.r || a.m - b.m)) {
        const t1 = g.t1 ?? (g.t1_from?.w != null ? res[g.t1_from.w]?.w : res[g.t1_from?.l]?.l);
        const t2 = g.t2 ?? (g.t2_from?.w != null ? res[g.t2_from.w]?.w : res[g.t2_from?.l]?.l);
        let w = g.w, l = g.l;
        if (w == null) { if (t1 == null || t2 == null) { res[g.m] = { w: t1 ?? t2, l: null }; continue; }
          const a = draw(t1), b = draw(t2); w = a > b ? t1 : t2; l = w === t1 ? t2 : t1; }
        res[g.m] = { w, l };
        if (g.p === 1) { champ = w; runnerUp = l; }
      }
    } else {
      const slots = ORDER[size] || ORDER[8];
      let round = slots.map((s) => seeds[s - 1]?.rid ?? null);
      while (round.length > 1) {
        const next = [];
        for (let i = 0; i < round.length; i += 2) {
          const a = round[i], b = round[i + 1];
          if (a == null || b == null) { next.push(a ?? b); continue; }
          next.push(draw(a) > draw(b) ? a : b);
          if (round.length === 2) runnerUp = next.at(-1) === a ? b : a;
        }
        round = next;
      }
      champ = round[0];
    }
    if (champ != null) tally[champ].champ++;
    if (runnerUp != null) tally[runnerUp].final++;
  }
  for (const r of rids) { const T = tally[r]; for (const k of ["playoffs", "bye", "final", "champ", "last", "pfSpot"]) T[k] /= runs; T.final += T.champ; T.wins /= runs; T.seeds = T.seeds.map((x) => x / runs); }
  return { tally, byes, regDone, runs };
}
