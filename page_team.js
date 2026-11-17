import { CONFIG } from "./config.js";
import { startSit, teamEntry, median, futurePicks, loadHistory, pName, pPos, mean, opponentOf } from "./data.js";
import { get } from "./api.js";
import { team, av, esc, f1, f2, pct, rec, ord, player, chart, table } from "./ui.js";

export async function render(root, m, arg) {
  const rid = +arg; const t = m.teamById[rid];
  if (!t) { root.innerHTML = `<div class="err">Team not found.</div>`; return; }
  const r = m.standings.find((x) => x.rid === rid); const rank = m.standings.indexOf(r) + 1;
  const rs = t.roster.settings || {}; const T = m.teamById;
  const budget = m.settings.waiver_budget ?? 100;

  // Player PPG while on any roster this season (from league matchup data, league scoring)
  const ppg = {};
  for (const w of m.completedWeeks) for (const e of m.weeks[w]) for (const [pid, p] of Object.entries(e.players_points || {})) (ppg[pid] ||= []).push(p);
  const avg = (pid) => (ppg[pid] ? mean(ppg[pid]) : null);

  // Start/sit
  const weekly = m.completedWeeks.map((w) => { const e = teamEntry(m, w, rid); return e && e.points > 0 ? { w, ...startSit(m, e) } : null; }).filter(Boolean);
  const totA = weekly.reduce((s, x) => s + x.actual, 0), totO = weekly.reduce((s, x) => s + x.optimal, 0);
  const corr = weekly.reduce((s, x) => s + x.correct, 0), tot = weekly.reduce((s, x) => s + x.total, 0);
  const misses = weekly.flatMap((x) => x.misses.map((mm) => ({ ...mm, w: x.w }))).sort((a, b) => b.diff - a.diff).slice(0, 6);
  const lgPct = m.teams.map((tt) => { let a = 0, o = 0; for (const w of m.completedWeeks) { const e = teamEntry(m, w, tt.rosterId); if (e?.points) { const s = startSit(m, e); a += s.actual; o += s.optimal; } } return o ? a / o : 0; });
  const ssRank = [...lgPct].sort((a, b) => b - a).indexOf(totO ? totA / totO : 0) + 1;
  const lostWeeks = weekly.filter((x) => { const opp = opponentOf(m, x.w, rid); const op = teamEntry(m, x.w, opp)?.points ?? 0; return x.actual < op && x.optimal > op && x.w < m.playoffStart; });

  // Roster
  const ro = t.roster; const starters = ro.starters || []; const reserve = ro.reserve || [], taxi = ro.taxi || [];
  const bench = (ro.players || []).filter((p) => !starters.includes(p) && !reserve.includes(p) && !taxi.includes(p))
    .sort((a, b) => "QBRBWRTEKDEF".indexOf(pPos(m, a)) - "QBRBWRTEKDEF".indexOf(pPos(m, b)));
  const plRow = (pid, slot) => { if (!pid || pid === "0") return `<div class="plr"><span class="slot">${slot}</span><span class="mut">Empty</span></div>`;
    const inj = m.players[pid]?.inj; return `<div class="plr"><span class="slot">${slot}</span><span class="sp">${player(m, pid, inj ? ` <span class="pill r">${esc(inj)}</span>` : "")}</span><span class="sm"><b>${f1(avg(pid))}</b> <span class="xs mut">ppg</span></span></div>`; };

  // Picks
  const nextSeason = m.season + 1;
  const picks = futurePicks(m, nextSeason)[rid] || [];
  const tradedAway = (futurePicks(m, nextSeason)); const gone = [];
  for (const [holder, list] of Object.entries(tradedAway)) for (const p of list) if (p.original === rid && +holder !== rid) gone.push({ ...p, holder: +holder });

  // History
  const hist = await loadHistory(m);
  const mine = hist.map((s) => { const ro2 = s.rosters.find((x) => x.owner_id === t.ownerId); if (!ro2) return null;
    const st = ro2.settings || {}; const sorted = [...s.rosters].sort((a, b) => (b.settings?.wins || 0) - (a.settings?.wins || 0) || (b.settings?.fpts || 0) - (a.settings?.fpts || 0));
    return { season: s.season, w: st.wins || 0, l: st.losses || 0, t: st.ties || 0, pf: (st.fpts || 0) + (st.fpts_decimal || 0) / 100, finish: sorted.indexOf(ro2) + 1,
      champ: s.champion === t.ownerId, second: s.runnerUp === t.ownerId, third: s.third === t.ownerId, current: s.season === m.season }; }).filter(Boolean);
  // Current season uses computed standings (Sleeper's roster settings include playoff weeks only once finished)
  const cur = mine.find((x) => x.current); if (cur) Object.assign(cur, { w: r.w, l: r.l, t: r.t, pf: r.pf, finish: rank });
  const at = mine.reduce((a, x) => ({ w: a.w + x.w, l: a.l + x.l, t: a.t + x.t, pf: a.pf + x.pf }), { w: 0, l: 0, t: 0, pf: 0 });

  // Transactions
  const txWeeks = Array.from({ length: Math.max(1, (m.liveWeek || m.maxWeek) ) }, (_, i) => i + 1);
  const txAll = (await Promise.all(txWeeks.map((w) => get(`/league/${m.league.league_id}/transactions/${w}`).catch(() => [])))).flat()
    .filter((x) => x.status === "complete" && (x.roster_ids || []).includes(rid)).sort((a, b) => b.created - a.created);

  const scores = m.completedWeeks.map((w) => teamEntry(m, w, rid)?.points || 0);
  const meds = m.completedWeeks.map((w) => median(m.weeks[w].map((e) => e.points).filter(Boolean)));
  const results = m.completedWeeks.map((w) => { const o = opponentOf(m, w, rid); return o == null ? null : (teamEntry(m, w, rid)?.points || 0) > (teamEntry(m, w, o)?.points || 0); });

  root.innerHTML = `
  <div class="hero row">${av(t, "lg")}<div class="sp" style="min-width:0"><h1 style="margin:0">${esc(t.name)}</h1>
    <div class="mut">${esc(t.owner)}${t.coOwners.length ? " · co-owner " + t.coOwners.map(esc).join(", ") : ""}${t.user.is_owner ? ` · <span class="gold">Commish</span>` : ""}</div>
    <div class="row" style="margin-top:8px"><span class="pill g">${rec(r)} · ${ord(rank)}</span><span class="pill">Streak ${r.streak || "–"}</span><span class="pill">All-time ${rec(at)}</span>${mine.filter((x) => x.champ).map((x) => `<span class="pill y">🏆 ${x.season}</span>`).join("")}</div></div></div>
  <div class="grid g4" style="margin-bottom:14px">
    <div class="stat"><div class="k">Points for</div><div class="v">${f1(r.pf)}</div><div class="xs mut">${r.pfVsMed >= 0 ? "+" : ""}${f1(r.pfVsMed)} vs median</div></div>
    <div class="stat"><div class="k">Points against</div><div class="v">${f1(r.pa)}</div><div class="xs mut">${r.paVsMed >= 0 ? "+" : ""}${f1(r.paVsMed)} vs median</div></div>
    <div class="stat"><div class="k">Max PF</div><div class="v">${f1(r.maxPf)}</div></div>
    <div class="stat"><div class="k">Start/sit accuracy</div><div class="v">${pct(totO ? totA / totO : 0, 1)}</div><div class="xs mut">${ord(ssRank)} in league</div></div>
    <div class="stat"><div class="k">FAAB left</div><div class="v">$${budget - (rs.waiver_budget_used || 0)}</div><div class="xs mut">of $${budget} · waiver #${rs.waiver_position ?? "–"}</div></div>
    <div class="stat"><div class="k">Moves</div><div class="v">${rs.total_moves ?? txAll.length}</div></div>
    <div class="stat"><div class="k">vs Median</div><div class="v">${r.mw}-${r.ml}</div></div>
    <div class="stat"><div class="k">All-play</div><div class="v">${r.apw}-${r.apl}</div><div class="xs mut">luck ${r.luck >= 0 ? "+" : ""}${f1(r.luck)} W</div></div>
  </div>
  <div class="card"><h3>Weekly scores</h3><div style="height:240px"><canvas id="wk"></canvas></div></div>
  <div class="grid g2">
    <div class="card"><h3>Roster</h3>
      ${m.starterSlots.map((s, i) => plRow(starters[i], s.replace("SUPER_FLEX", "SF").replace("_FLEX", "FX"))).join("")}
      <div class="xs mut" style="margin:10px 0 2px">BENCH</div>${bench.map((p) => plRow(p, "BN")).join("") || `<div class="mut sm">–</div>`}
      ${reserve.length ? `<div class="xs mut" style="margin:10px 0 2px">IR</div>${reserve.map((p) => plRow(p, "IR")).join("")}` : ""}
      ${taxi.length ? `<div class="xs mut" style="margin:10px 0 2px">TAXI</div>${taxi.map((p) => plRow(p, "TX")).join("")}` : ""}
      <p class="note">PPG = average points per week while on a roster in this league (league scoring).</p></div>
    <div>
      <div class="card"><h3>${nextSeason} draft picks</h3>
        <div class="row" style="gap:6px">${picks.map((p) => `<span class="pill ${p.traded ? "y" : ""}" title="${p.traded ? "from " + esc(T[p.original]?.name) : "own"}">R${p.round}${p.traded ? " · via " + esc(T[p.original]?.owner) : ""}</span>`).join("")}</div>
        ${gone.length ? `<p class="sm mut" style="margin-top:8px">Traded away: ${gone.map((p) => `R${p.round} → ${esc(T[p.holder]?.owner)}`).join(", ")}</p>` : ""}
        <p class="note">${picks.length} picks for ${CONFIG.DRAFT_ROUNDS || m.settings.draft_rounds || 16} rounds. Keeper costs come out of these; see <a href="#keepers">Keepers</a>.</p></div>
      <div class="card"><h3>Start/sit report</h3>
        <div class="row sm"><span>Points captured <b>${pct(totO ? totA / totO : 0, 1)}</b></span><span>Correct starters <b>${pct(tot ? corr / tot : 0)}</b></span><span>Pts left on bench <b>${f1(totO - totA)}</b></span></div>
        ${lostWeeks.length ? `<p class="sm" style="margin:8px 0"><span class="neg">Lineup-cost losses: ${lostWeeks.length}</span> <span class="mut">(weeks your best lineup would have won: ${lostWeeks.map((x) => "W" + x.w).join(", ")})</span></p>` : ""}
        <div style="margin-top:8px">${weekly.map((x) => `<div class="row xs" style="gap:6px;flex-wrap:nowrap"><span style="width:28px">W${x.w}</span><div class="bar sp"><i style="width:${x.pct * 100}%"></i></div><span style="width:42px;text-align:right">${pct(x.pct)}</span></div>`).join("")}</div>
        ${misses.length ? `<h3 style="margin-top:12px">Biggest misses</h3>${misses.map((x) => `<div class="sm" style="padding:3px 0">W${x.w}: started <b>${esc(pName(m, x.started))}</b> (${f1(x.startedPts)}) over <b>${esc(pName(m, x.benched))}</b> (${f1(x.benchedPts)}) <span class="neg">−${f1(x.diff)}</span></div>`).join("")}` : ""}</div>
    </div></div>
  <div class="card"><h3>All-time record</h3>${table([
    { label: "Season", k: "season" }, { label: "Record", f: (x) => rec(x), s: (x) => x.w }, { label: "PF", n: 1, f: (x) => f1(x.pf), s: (x) => x.pf },
    { label: "Reg. season finish", f: (x) => ord(x.finish), s: (x) => -x.finish },
    { label: "Playoffs", f: (x) => (x.champ ? "🏆 Champion" : x.second ? "🥈 Runner-up" : x.third ? "🥉 Third" : x.current ? "In progress" : "–"), s: false },
  ], mine)}<p class="sm"><b>All-time:</b> ${rec(at)} · ${f1(at.pf)} PF · ${mine.filter((x) => x.champ).length} title${mine.filter((x) => x.champ).length === 1 ? "" : "s"}</p></div>
  <div class="card"><h3>Transactions</h3>${txAll.length ? txAll.slice(0, 40).map((x) => `<div class="sm" style="padding:5px 0;border-bottom:1px solid var(--line)"><span class="pill">${x.type.replace("_", " ")}</span> <span class="xs mut">W${x.leg} ${x.settings?.waiver_bid != null && x.type === "waiver" ? "· $" + x.settings.waiver_bid : ""}</span><br>
    ${Object.entries(x.adds || {}).filter(([, r2]) => r2 === rid).map(([p]) => `<span class="pos">+ ${esc(pName(m, p))}</span>`).join(" ")} ${Object.entries(x.drops || {}).filter(([, r2]) => r2 === rid).map(([p]) => `<span class="neg">− ${esc(pName(m, p))}</span>`).join(" ")}
    ${x.type === "trade" ? `<span class="mut">with ${x.roster_ids.filter((y) => y !== rid).map((y) => esc(T[y]?.name)).join(", ")}</span>${(x.draft_picks || []).filter((p) => p.owner_id === rid).map((p) => ` <span class="pos">+ ${p.season} R${p.round}</span>`).join("")}` : ""}</div>`).join("") : `<p class="mut">None yet.</p>`}</div>
  <div class="card"><details><summary>Everything Sleeper reports for this team</summary>
    <div class="grid g2" style="margin-top:10px">${kv("Roster settings", rs)}${kv("Roster metadata", ro.metadata || {})}${kv("Owner", { user_id: t.user.user_id, username: t.user.username, display_name: t.user.display_name, is_owner: t.user.is_owner, is_bot: t.user.is_bot, avatar: t.user.avatar })}${kv("Owner metadata", t.user.metadata || {})}${kv("Roster", { roster_id: ro.roster_id, players: (ro.players || []).length, starters: starters.length, reserve: reserve.length, taxi: taxi.length, keepers: JSON.stringify(ro.keepers), co_owners: JSON.stringify(ro.co_owners) })}</div></details></div>`;

  chart("wk", { data: { labels: m.completedWeeks.map((w) => "W" + w), datasets: [
    { type: "bar", label: "Score", data: scores, backgroundColor: results.map((x) => (x === null ? "#3fb6ff" : x ? "#00f0ff" : "#ff2e88")), borderRadius: 5 },
    { type: "line", label: "League median", data: meds, borderColor: "#f5c542", borderDash: [5, 4], pointRadius: 0, tension: 0.3 },
    { type: "line", label: "Max possible", data: m.completedWeeks.map((w) => weekly.find((x) => x.w === w)?.optimal ?? null), borderColor: "#8e9ab3", pointRadius: 2, tension: 0.3 },
  ] }, options: { plugins: { legend: { labels: { boxWidth: 12 } } } } });
}

function kv(title, o) {
  return `<div><div class="xs mut" style="margin-bottom:4px">${title.toUpperCase()}</div><table>${Object.entries(o).map(([k, v]) => `<tr><td class="mut sm">${esc(k)}</td><td class="sm">${esc(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`).join("")}</table></div>`;
}
