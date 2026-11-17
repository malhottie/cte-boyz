// The 17 weekly challenges from the league constitution.
import { CONFIG } from "./config.js";
import { gamesInWeek, teamEntry, pPos, pName, loadStats, FLEX_SLOTS } from "./data.js";

const starters = (m, e) => (e?.starters || []).map((pid, i) => ({ pid, slot: m.starterSlots[i], pts: e.starters_points?.[i] ?? e.players_points?.[pid] ?? 0 })).filter((s) => s.pid && s.pid !== "0");
const entries = (m, w) => (m.weeks[w] || []).filter((e) => e.points > 0 || (e.starters || []).length);
const winners = (m, w) => gamesInWeek(m, w).filter((g) => g.pa !== g.pb).map((g) => (g.pa > g.pb ? { rid: g.a, pts: g.pa, opp: g.pb } : { rid: g.b, pts: g.pb, opp: g.pa }));
const losers = (m, w) => gamesInWeek(m, w).filter((g) => g.pa !== g.pb).map((g) => (g.pa < g.pb ? { rid: g.a, pts: g.pa } : { rid: g.b, pts: g.pb }));
const bestStarter = (m, w, filter, valueFn = (s) => s.pts) => entries(m, w).map((e) => {
  const c = starters(m, e).filter(filter).map((s) => ({ ...s, v: valueFn(s) })).sort((a, b) => b.v - a.v)[0];
  return c ? { rid: e.roster_id, value: c.v, label: `${pName(m, c.pid)} (${pPos(m, c.pid)})`, pid: c.pid } : null;
}).filter(Boolean);

export const CHALLENGES = [
  { week: 1, name: "Hot Start", desc: "Team with the highest score (starters only)", unit: "pts",
    run: (m, w) => entries(m, w).map((e) => ({ rid: e.roster_id, value: e.points })) },
  { week: 2, name: "Zero to Hero", desc: "Biggest positive team points differential from Week 1 to Week 2", unit: "pts",
    run: (m, w) => entries(m, w).map((e) => { const p = teamEntry(m, w - 1, e.roster_id)?.points || 0; return { rid: e.roster_id, value: e.points - p, label: `${p.toFixed(1)} → ${e.points.toFixed(1)}` }; }) },
  { week: 3, name: "Look At These TDs", desc: "Team with the most offensive touchdowns scored", unit: "TDs", stats: true,
    run: (m, w, st) => entries(m, w).map((e) => { let n = 0; const who = [];
      for (const s of starters(m, e)) { const x = st[s.pid] || {}; const k = CONFIG.TD_TYPES.reduce((a, t) => a + (x[t] || 0), 0); if (k) { n += k; who.push(`${pName(m, s.pid)} ${k}`); } }
      return { rid: e.roster_id, value: n, label: who.join(", "), tiebreak: e.points }; }) },
  { week: 4, name: "Blackjack", desc: "Team with a starter closest to 21 points without going over", unit: "pts", lowerBetter: false,
    run: (m, w) => bestStarter(m, w, (s) => s.pts <= 21) },
  { week: 5, name: "Biggest Loser", desc: "Highest scoring losing team", unit: "pts",
    run: (m, w) => losers(m, w).map((l) => ({ rid: l.rid, value: l.pts })) },
  { week: 6, name: "Like A Boss", desc: "Team with the biggest margin of victory", unit: "pts",
    run: (m, w) => winners(m, w).map((x) => ({ rid: x.rid, value: x.pts - x.opp, label: `${x.pts.toFixed(1)}–${x.opp.toFixed(1)}` })) },
  { week: 7, name: "Dead Weight", desc: "Winning team with the lowest scoring starting player", unit: "pts", lowerBetter: true,
    run: (m, w) => winners(m, w).map((x) => { const s = starters(m, teamEntry(m, w, x.rid)).sort((a, b) => a.pts - b.pts)[0];
      return { rid: x.rid, value: s?.pts ?? 0, label: s ? pName(m, s.pid) : "" }; }) },
  { week: 8, name: "Flexual Healing", desc: "Highest FLEX position player score", unit: "pts",
    run: (m, w) => bestStarter(m, w, (s) => FLEX_SLOTS.includes(s.slot)) },
  { week: 9, name: "Sexy Rexy", desc: "Team with the QB with the longest pass", unit: "yds", stats: true,
    run: (m, w, st) => bestStarter(m, w, (s) => pPos(m, s.pid) === "QB", (s) => st[s.pid]?.pass_lng || 0) },
  { week: 10, name: "Coffee's For Closers", desc: "Team that beats its opponent by the smallest margin of victory", unit: "pts", lowerBetter: true,
    run: (m, w) => winners(m, w).map((x) => ({ rid: x.rid, value: x.pts - x.opp, label: `${x.pts.toFixed(1)}–${x.opp.toFixed(1)}` })) },
  { week: 11, name: "MVP", desc: "Highest scoring individual player, team defense included", unit: "pts",
    run: (m, w) => bestStarter(m, w, () => true) },
  { week: 12, name: "Bench Warmer", desc: "Team with highest scoring bench player", unit: "pts",
    run: (m, w) => entries(m, w).map((e) => { const st = new Set(e.starters || []);
      const b = (e.players || []).filter((p) => !st.has(p)).map((p) => ({ p, v: e.players_points?.[p] || 0 })).sort((a, b) => b.v - a.v)[0];
      return b ? { rid: e.roster_id, value: b.v, label: pName(m, b.p) } : null; }).filter(Boolean) },
  { week: 13, name: "Top WR", desc: "Highest scoring WR (in lineup)", unit: "pts", run: (m, w) => bestStarter(m, w, (s) => pPos(m, s.pid) === "WR") },
  { week: 14, name: "Top TE", desc: "Highest scoring TE (in lineup)", unit: "pts", run: (m, w) => bestStarter(m, w, (s) => pPos(m, s.pid) === "TE") },
  { week: 15, name: "Run Forrest Run!", desc: "Team with the RB with the most rushing yards", unit: "yds", stats: true,
    run: (m, w, st) => bestStarter(m, w, (s) => pPos(m, s.pid) === "RB", (s) => st[s.pid]?.rush_yd || 0) },
  { week: 16, name: "Dirty 30", desc: "Team with any starter closest to 30 points (over OR under)", unit: "pts off", lowerBetter: true,
    run: (m, w) => entries(m, w).map((e) => { const s = starters(m, e).sort((a, b) => Math.abs(a.pts - 30) - Math.abs(b.pts - 30))[0];
      return s ? { rid: e.roster_id, value: Math.abs(s.pts - 30), label: `${pName(m, s.pid)} ${s.pts.toFixed(2)}` } : null; }).filter(Boolean) },
  { week: 17, name: "Give 'em the D", desc: "Team with the highest scoring D/ST", unit: "pts", run: (m, w) => bestStarter(m, w, (s) => pPos(m, s.pid) === "DEF") },
];

// Week 4 "closest to 21" is just the highest score ≤ 21, so bestStarter already gives it.

export async function runChallenge(m, c) {
  const w = c.week;
  if (!m.completedWeeks.includes(w)) return { status: m.liveWeek === w ? "live" : "upcoming", board: [] };
  const st = c.stats ? await loadStats(m.season, w) : {};
  let board = c.run(m, w, st).sort((a, b) => (c.lowerBetter ? a.value - b.value : b.value - a.value) || ((b.tiebreak || 0) - (a.tiebreak || 0)));
  const top = board[0]; const tied = board.filter((x) => Math.abs(x.value - top?.value) < 1e-9); // rules name no tiebreaker, so ties are flagged for the commish
  const ov = CONFIG.CHALLENGE_OVERRIDES[w];
  const winnersList = ov ? [ov.rosterId] : tied.map((x) => x.rid);
  return { status: "final", board, winners: winnersList, override: ov, tie: !ov && tied.length > 1 };
}
