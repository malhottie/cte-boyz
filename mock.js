// Demo-mode fake league that mimics Sleeper's API responses (used when no LEAGUE_ID is set).
const NFL = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SF","SEA","TB","TEN","WAS"];
const FIRST = ["Jalen","Marcus","Tyler","Devin","Chris","Jordan","Andre","Malik","Cole","Drew","Trey","Darius","Kyle","Isaiah","Bryce","Caleb","Nate","Zay","Elijah","Ty","Rashad","Keenan","Brock","Derek","Javon","Miles","Quinn","Reggie","Terrell","Xavier","Hunter","Owen"];
const LAST = ["Walker","Brooks","Hayes","Coleman","Price","Jennings","Mack","Fuller","Ridley","Sutton","Barnes","Holloway","Pruitt","Dawson","Kirby","Monroe","Fields","Whitaker","Lockett","Gaines","Reed","Moss","Shaw","Booker","Tate","Ellison","Carver","Dunn","Vance","Pittman","Hollins","Steele"];
const OWNERS = [["Alex","Malhotra Mayhem"],["Vishal","Co-Commish Chaos"],["Ben","Bijan Mustard"],["Chris","Tua Legit 2 Quit"],["Dan","Kittle Me This"],["Eric","Saquon Deez"],["Frank","CeeDeez Nuts"],["Greg","Hurts So Good"],["Hank","Lamb Chops"],["Ian","Breece Lightning"],["Jake","Diggs in a Blanket"],["Kev","Mixon It Up"]];

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(seed); return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pois = (r, l) => { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= r(); } while (p > L); return k - 1; };
const norm = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

const SCORING = { pass_yd: 0.04, pass_td: 4, pass_int: -1, rush_yd: 0.1, rush_td: 6, rec: 0.5, rec_yd: 0.1, rec_td: 6, fum_lost: -2,
  fgm: 3, xpm: 1, sack: 1, int: 2, fum_rec: 2, def_td: 6, pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1,
  pts_allow_21_27: 0, pts_allow_28_34: -1, pts_allow_35p: -4 };
const ROSTER_POS = ["QB","RB","RB","WR","WR","TE","FLEX","FLEX","K","DEF","BN","BN","BN","BN","BN","BN"];
const SEASONS = [2026, 2025, 2024];
const CUR = 2026, CUR_WEEK = 11;

// ---------- players ----------
const PLAYERS = {}; const TALENT = {}; const BYE = {};
(() => {
  const r = rng("players"); let id = 10000;
  NFL.forEach((tm, i) => {
    BYE[tm] = 5 + (i % 9);
    const make = (pos, n) => { for (let k = 0; k < n; k++) {
      const pid = String(id++);
      PLAYERS[pid] = { n: `${FIRST[Math.floor(r() * 32)]} ${LAST[Math.floor(r() * 32)]}`, p: pos, fp: [pos], t: tm, a: 22 + Math.floor(r() * 11), x: Math.floor(r() * 9) };
      TALENT[pid] = Math.max(0.35, (k === 0 ? 1.05 : 0.6 - k * 0.08) + norm(r) * 0.22);
    } };
    make("QB", 2); make("RB", 3); make("WR", 4); make("TE", 2); make("K", 1);
    PLAYERS[tm] = { n: `${tm} Defense`, p: "DEF", fp: ["DEF"], t: tm }; TALENT[tm] = 0.7 + r() * 0.6;
  });
})();

function statLine(pid, season, week, proj = false) {
  const P = PLAYERS[pid]; if (!P || BYE[P.t] === week) return null;
  const r = rng(`${pid}|${season}|${week}`); const t = TALENT[pid] * (proj ? 1 : 1 + norm(r) * 0.08);
  const g = proj ? (x) => x : (x) => pois(r, Math.max(0.01, x));
  const s = { gp: 1, tm_off_snp: 64 };
  if (P.p === "QB") { s.pass_att = g(33); s.pass_cmp = Math.round(s.pass_att * 0.65); s.pass_yd = Math.round(225 * t + (proj ? 0 : norm(r) * 45)); s.pass_td = g(1.6 * t); s.pass_int = g(0.8);
    s.pass_lng = proj ? 0 : Math.round(18 + r() * 55); s.rush_att = g(4); s.rush_yd = Math.round(18 * t * (proj ? 1 : r() * 2)); s.rush_td = g(0.15); s.off_snp = 62; }
  if (P.p === "RB") { s.rush_att = g(14 * t); s.rush_yd = Math.round(s.rush_att * (proj ? 4.3 : 3 + r() * 2.8)); s.rush_td = g(0.5 * t); s.rec_tgt = g(4 * t); s.rec = Math.round(s.rec_tgt * 0.75); s.rec_yd = Math.round(s.rec * (proj ? 8 : 4 + r() * 8)); s.rec_td = g(0.12); s.off_snp = Math.round(40 * t); s.rush_lng = proj ? 0 : Math.round(5 + r() * 40); }
  if (P.p === "WR") { s.rec_tgt = g(7.5 * t); s.rec = Math.round(s.rec_tgt * (proj ? 0.65 : 0.45 + r() * 0.35)); s.rec_yd = Math.round(s.rec * (proj ? 12.5 : 8 + r() * 10)); s.rec_td = g(0.45 * t); s.off_snp = Math.round(Math.min(64, 55 * t)); s.rec_lng = proj ? 0 : Math.round(8 + r() * 50); }
  if (P.p === "TE") { s.rec_tgt = g(5.5 * t); s.rec = Math.round(s.rec_tgt * 0.7); s.rec_yd = Math.round(s.rec * (proj ? 10.5 : 7 + r() * 8)); s.rec_td = g(0.35 * t); s.off_snp = Math.round(Math.min(64, 50 * t)); }
  if (P.p === "K") { s.fga = g(2); s.fgm = Math.min(s.fga, g(1.7 * t)); s.xpm = g(2.4); }
  if (P.p === "DEF") { s.sack = g(2.5 * t); s.int = g(0.8 * t); s.fum_rec = g(0.6); s.def_td = g(0.15 * t); s.ff = g(0.8);
    const pa = proj ? 21 : Math.max(0, Math.round(24 - 6 * t + norm(r) * 9)); s.pts_allow = pa;
    const k = pa === 0 ? "pts_allow_0" : pa < 7 ? "pts_allow_1_6" : pa < 14 ? "pts_allow_7_13" : pa < 21 ? "pts_allow_14_20" : pa < 28 ? "pts_allow_21_27" : pa < 35 ? "pts_allow_28_34" : "pts_allow_35p"; s[k] = 1; }
  let pts = 0; for (const [k, v] of Object.entries(SCORING)) if (s[k]) pts += s[k] * v;
  s.pts_half_ppr = Math.round(pts * 100) / 100; s.pts_ppr = Math.round((pts + 0.5 * (s.rec || 0)) * 100) / 100; s.pts_std = Math.round((pts - 0.5 * (s.rec || 0)) * 100) / 100;
  return s;
}
const fpts = (pid, season, week) => statLine(pid, season, week)?.pts_half_ppr || 0;

// ---------- league per season ----------
const userId = (i) => `u${i + 1}`;
const cache = {};
function season(yr) {
  if (cache[yr]) return cache[yr];
  const r = rng("season" + yr);
  // draft
  const order = [...Array(12).keys()].sort(() => r() - 0.5);
  const lim = { QB: 2, RB: 5, WR: 6, TE: 2, K: 1, DEF: 1 };
  const pool = Object.keys(PLAYERS).map((pid) => ({ pid, v: TALENT[pid] * { QB: 0.8, RB: 1.15, WR: 1.1, TE: 0.75, K: 0.25, DEF: 0.3 }[PLAYERS[pid].p] + r() * 0.25 }))
    .sort((a, b) => b.v - a.v);
  const rost = order.map(() => []); const picks = []; let no = 1;
  for (let rd = 1; rd <= 16; rd++) {
    const seq = rd % 2 ? order : [...order].reverse();
    for (const ti of seq) {
      const cnt = (pos) => rost[ti].filter((p) => PLAYERS[p].p === pos).length;
      const need = 16 - rost[ti].length; const missing = ["K", "DEF"].filter((p) => !cnt(p));
      const idx = pool.findIndex((x) => { const pos = PLAYERS[x.pid].p; return cnt(pos) < lim[pos] && (need > missing.length || missing.includes(pos)) && (rd > 12 || !["K", "DEF"].includes(pos)); });
      const [x] = pool.splice(idx, 1); rost[ti].push(x.pid);
      picks.push({ round: rd, pick_no: no++, draft_slot: order.indexOf(ti) + 1, player_id: x.pid, picked_by: userId(ti), roster_id: ti + 1,
        is_keeper: yr === CUR && rd >= 4 && rd <= 9 && r() < 0.12 ? true : null, metadata: { first_name: PLAYERS[x.pid].n.split(" ")[0], last_name: PLAYERS[x.pid].n.split(" ")[1], position: PLAYERS[x.pid].p, team: PLAYERS[x.pid].t } });
    }
  }
  // a few waiver swaps (week 3 & 6) for current season
  const tx = {};
  if (yr === CUR) for (const wk of [2, 3, 5, 6, 8, 9]) {
    tx[wk] = [];
    for (let k = 0; k < 3; k++) {
      const ti = Math.floor(r() * 12); const fa = pool.splice(Math.floor(r() * 30), 1)[0];
      const bench = rost[ti].filter((p) => PLAYERS[p].p === PLAYERS[fa.pid].p && !["K","DEF"].includes(PLAYERS[p].p));
      if (!bench.length) continue; const drop = bench.at(-1);
      rost[ti][rost[ti].indexOf(drop)] = fa.pid;
      tx[wk].push({ transaction_id: `t${wk}${k}`, type: r() < 0.7 ? "waiver" : "free_agent", status: "complete", roster_ids: [ti + 1], adds: { [fa.pid]: ti + 1 }, drops: { [drop]: ti + 1 },
        settings: { waiver_bid: Math.floor(r() * 30) }, created: Date.UTC(yr, 8, 1 + wk * 7), leg: wk, creator: userId(ti) });
    }
  }
  // schedule (circle method)
  const sched = {};
  const ids = [...Array(12).keys()];
  for (let w = 1; w <= 14; w++) {
    const rnd = (w - 1) % 11; const arr = [ids[0], ...ids.slice(1).map((_, i) => ids[1 + ((i + rnd) % 11)])];
    sched[w] = []; for (let i = 0; i < 6; i++) sched[w].push([arr[i], arr[11 - i]]);
  }
  const maxW = yr === CUR ? CUR_WEEK - 1 : 17;
  const weeks = {}; const rec = ids.map(() => ({ w: 0, l: 0, pf: 0, pa: 0 }));
  const lineup = (ti, w) => {
    const players = rost[ti]; const used = new Set(); const st = [];
    const lr = rng(`lu${yr}${ti}${w}`);
    for (const slot of ROSTER_POS.filter((p) => p !== "BN")) {
      const el = slot === "FLEX" ? ["RB", "WR", "TE"] : [slot];
      const c = players.filter((p) => !used.has(p) && el.includes(PLAYERS[p].p) && BYE[PLAYERS[p].t] !== w).sort((a, b) => TALENT[b] * (0.8 + lr() * 0.5) - TALENT[a] * (0.8 + lr() * 0.5))[0];
      if (c) { used.add(c); st.push(c); } else st.push("0");
    }
    return st;
  };
  const entry = (ti, w, mid, scored) => {
    const starters = lineup(ti, w); const pp = {}; for (const p of rost[ti]) pp[p] = scored ? fpts(p, yr, w) : 0;
    const sp = starters.map((p) => (p === "0" ? 0 : pp[p]));
    return { roster_id: ti + 1, matchup_id: mid, starters, starters_points: sp, players: [...rost[ti]], players_points: pp, points: Math.round(sp.reduce((a, b) => a + b, 0) * 100) / 100, custom_points: null };
  };
  for (let w = 1; w <= 14; w++) {
    weeks[w] = [];
    sched[w].forEach(([a, b], k) => {
      const ea = entry(a, w, k + 1, w <= maxW), eb = entry(b, w, k + 1, w <= maxW);
      weeks[w].push(ea, eb);
      if (w <= maxW) { rec[a].pf += ea.points; rec[b].pf += eb.points; rec[a].pa += eb.points; rec[b].pa += ea.points;
        if (ea.points > eb.points) { rec[a].w++; rec[b].l++; } else { rec[b].w++; rec[a].l++; } }
    });
  }
  // playoffs for finished seasons (7 teams, seed 1 bye)
  const wb = [];
  if (yr !== CUR) {
    const seeds = ids.slice().sort((a, b) => rec[b].w - rec[a].w || rec[b].pf - rec[a].pf).slice(0, 7);
    const play = (w, a, b, m, rd, p) => { const ea = entry(a, w, m, true), eb = entry(b, w, m, true); weeks[w].push(ea, eb);
      const win = ea.points >= eb.points ? a : b; wb.push({ r: rd, m, t1: a + 1, t2: b + 1, w: win + 1, l: (win === a ? b : a) + 1, p }); return win; };
    for (const w of [15, 16, 17]) weeks[w] = [];
    const w45 = play(15, seeds[3], seeds[4], 1, 1), w27 = play(15, seeds[1], seeds[6], 2, 1), w36 = play(15, seeds[2], seeds[5], 3, 1);
    const s1 = play(16, seeds[0], w45, 4, 2), s2 = play(16, w27, w36, 5, 2);
    const l1 = s1 === seeds[0] ? w45 : seeds[0], l2 = s2 === w27 ? w36 : w27;
    play(17, s1, s2, 6, 3, 1); play(17, l1, l2, 7, 3, 3);
    for (const w of [15, 16, 17]) for (const ti of ids) if (!weeks[w].some((e) => e.roster_id === ti + 1)) weeks[w].push({ ...entry(ti, w, null, true), matchup_id: null });
  }
  const rosters = ids.map((ti) => ({ roster_id: ti + 1, owner_id: userId(ti), co_owners: ti === 1 ? [userId(0)] : null, players: [...rost[ti]],
    starters: lineup(ti, Math.min(maxW + 1, 14)), reserve: [], taxi: [], keepers: null,
    settings: { wins: rec[ti].w, losses: rec[ti].l, ties: 0, fpts: Math.floor(rec[ti].pf), fpts_decimal: Math.round((rec[ti].pf % 1) * 100),
      fpts_against: Math.floor(rec[ti].pa), fpts_against_decimal: Math.round((rec[ti].pa % 1) * 100), ppts: Math.floor(rec[ti].pf * 1.18), ppts_decimal: 0,
      waiver_budget_used: Math.floor(r() * 80), waiver_position: ti + 1, total_moves: Math.floor(r() * 25), division: 0 },
    metadata: { streak: "", record: "" } }));
  const traded = yr === CUR ? [
    { season: "2027", round: 3, roster_id: 2, previous_owner_id: 2, owner_id: 5 },
    { season: "2027", round: 5, roster_id: 7, previous_owner_id: 7, owner_id: 1 },
    { season: "2027", round: 2, roster_id: 9, previous_owner_id: 9, owner_id: 4 },
    { season: "2027", round: 8, roster_id: 1, previous_owner_id: 1, owner_id: 11 } ] : [];
  return (cache[yr] = { weeks, rosters, picks, tx, wb, traded, order, maxW });
}

const LEAGUE = (yr) => ({ league_id: "MOCK" + yr, name: "The League (demo data)", season: String(yr), status: yr === CUR ? "in_season" : "complete",
  previous_league_id: yr > SEASONS.at(-1) ? "MOCK" + (yr - 1) : null, total_rosters: 12, roster_positions: ROSTER_POS, scoring_settings: SCORING,
  settings: { num_teams: 12, playoff_teams: 7, playoff_week_start: 15, last_scored_leg: yr === CUR ? CUR_WEEK - 1 : 17, leg: yr === CUR ? CUR_WEEK : 17,
    waiver_budget: 100, draft_rounds: 16, trade_deadline: 13, start_week: 1, type: 0, reserve_slots: 2, taxi_slots: 0, playoff_type: 0 },
  draft_id: "D" + yr, avatar: null });

export async function mockGet(path) {
  const p = path.split("/").filter(Boolean);
  if (path === "/state/nfl") return { season: String(CUR), week: CUR_WEEK, display_week: CUR_WEEK, leg: CUR_WEEK, season_type: "regular", previous_season: String(CUR - 1) };
  if (p[0] === "league") {
    const yr = +p[1].replace("MOCK", "") || CUR; const S = season(yr);
    if (p.length === 2) return LEAGUE(yr);
    switch (p[2]) {
      case "users": return OWNERS.map(([n, team], i) => ({ user_id: userId(i), display_name: n, username: n.toLowerCase(), avatar: null, metadata: { team_name: team }, is_owner: i < 2 }));
      case "rosters": return S.rosters;
      case "matchups": return S.weeks[+p[3]] || [];
      case "winners_bracket": return S.wb;
      case "losers_bracket": return [];
      case "traded_picks": return S.traded;
      case "transactions": return S.tx[+p[3]] || [];
      case "drafts": return [{ draft_id: "D" + yr, season: String(yr), status: "complete", type: "snake", settings: { rounds: 16, teams: 12 },
        draft_order: Object.fromEntries(S.order.map((ti, i) => [userId(ti), i + 1])) }];
    }
  }
  if (p[0] === "draft") return season(+p[1].slice(1)).picks;
  if (p[0] === "stats" || p[0] === "projections") {
    const yr = +p[3], wk = +p[4]; const out = {};
    if (p[0] === "stats" && yr === CUR && wk >= CUR_WEEK) return {};
    for (const pid of Object.keys(PLAYERS)) { const s = statLine(pid, yr, wk, p[0] === "projections"); if (s) out[pid] = s; }
    return out;
  }
  throw new Error("mock: no route " + path);
}

export async function mockLocal(file) {
  if (file.includes("players")) return PLAYERS;
  if (file.includes("advanced")) {
    const r = rng("adv"); const out = { season: CUR, updated: new Date().toISOString(), players: {} };
    for (const [pid, P] of Object.entries(PLAYERS)) if (P.p !== "K" && P.p !== "DEF") {
      const t = TALENT[pid];
      out.players[pid] = { epa_per_play: +(t * 0.25 - 0.12 + norm(r) * 0.05).toFixed(3), yptpa: ["WR", "TE", "RB"].includes(P.p) ? +(t * 1.9 + r() * 0.3).toFixed(2) : null,
        snap_pct: +(Math.min(0.98, 0.45 + t * 0.4)).toFixed(2), cpoe: P.p === "QB" ? +(norm(r) * 3 + t * 2).toFixed(1) : null, adot: ["WR", "TE"].includes(P.p) ? +(8 + r() * 6).toFixed(1) : null };
    }
    return out;
  }
  if (file.includes("ecr")) {
    const ranked = Object.keys(PLAYERS).filter((pid) => !["K", "DEF"].includes(PLAYERS[pid].p))
      .sort((a, b) => TALENT[b] * { QB: 0.8, RB: 1.15, WR: 1.1, TE: 0.75 }[PLAYERS[b].p] - TALENT[a] * { QB: 0.8, RB: 1.15, WR: 1.1, TE: 0.75 }[PLAYERS[a].p]);
    return { source: "demo", updated: new Date().toISOString(), players: Object.fromEntries(ranked.map((pid, i) => [pid, { rank: i + 1, tier: 1 + Math.floor(i / 12) }])) };
  }
  return null;
}
