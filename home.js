import { gamesInWeek, startSit, pName, pPos, teamEntry, median, loadProjections, fantasyPoints } from "../data.js";
import { get } from "../api.js";
import { CONFIG } from "../config.js";
import { CHALLENGES, runChallenge } from "../challenges.js";
import { teamModels, winProb, projectedTeamPoints } from "../sim.js";
import { team, av, esc, f1, f2, pct, rec, weekSelect, player } from "../ui.js";

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

export async function render(root, m, arg) {
  const weeks = m.completedWeeks;
  if (!weeks.length) { root.innerHTML = `<div class="card"><h2>No games yet</h2><p class="mut">The recap shows up once Week 1 is final.</p></div>${await upcoming(m)}`; return; }
  const w = +arg || weeks.at(-1);
  const T = m.teamById;
  const gs = gamesInWeek(m, w);
  const ents = (m.weeks[w] || []).filter((e) => e.points > 0);
  const ss = Object.fromEntries(ents.map((e) => [e.roster_id, startSit(m, e)]));
  const by = (f, dir = -1) => [...ents].sort((a, b) => dir * (f(a) - f(b)))[0];
  const top = by((e) => e.points), low = by((e) => e.points, 1);
  const margins = gs.map((g) => ({ ...g, mg: Math.abs(g.pa - g.pb), win: g.pa >= g.pb ? g.a : g.b, lose: g.pa >= g.pb ? g.b : g.a, ws: Math.max(g.pa, g.pb), ls: Math.min(g.pa, g.pb) }));
  const blow = [...margins].sort((a, b) => b.mg - a.mg)[0], close = [...margins].sort((a, b) => a.mg - b.mg)[0];
  const lucky = [...margins].sort((a, b) => a.ws - b.ws)[0], unlucky = [...margins].sort((a, b) => b.ls - a.ls)[0];
  const bestMgr = by((e) => ss[e.roster_id].pct), worstMgr = by((e) => ss[e.roster_id].optimal - ss[e.roster_id].actual);
  let pow = null, bench = null;
  for (const e of ents) {
    const st = new Set(e.starters);
    for (const [pid, p] of Object.entries(e.players_points || {})) {
      if (st.has(pid) && (!pow || p > pow.p)) pow = { pid, p, rid: e.roster_id };
      if (!st.has(pid) && (!bench || p > bench.p)) bench = { pid, p, rid: e.roster_id };
    }
  }
  const med = median(ents.map((e) => e.points));
  const tx = await get(`/league/${m.league.league_id}/transactions/${w}`).catch(() => []);
  const faab = (tx || []).filter((t) => t.type === "waiver" && t.status === "complete" && t.settings?.waiver_bid).sort((a, b) => b.settings.waiver_bid - a.settings.waiver_bid)[0];
  const trades = (tx || []).filter((t) => t.type === "trade" && t.status === "complete");
  const ch = CHALLENGES.find((c) => c.week === w);
  const chRes = ch ? await runChallenge(m, ch) : null;

  const award = (ic, title, t, body) => `<div class="card award"><div class="ic">${ic}</div><div style="min-width:0"><div class="t">${title}</div>${t ? team(T[t]) : ""}<div class="sm" style="margin-top:4px">${body}</div></div></div>`;
  const headline = pick([
    `${esc(T[top.roster_id].name)} dropped ${f1(top.points)} and nobody else came close.`,
    `${esc(T[blow.win].name)} ran up the score, while ${esc(T[close.win].name)} survived by ${f2(close.mg)}.`,
    `Week ${w}: ${esc(T[top.roster_id].name)} on top, ${esc(T[low.roster_id].name)} in the basement.`,
  ], w);

  root.innerHTML = `
  <div class="row" style="margin-bottom:8px"><h1 class="sp" style="margin:0">Week ${w} Recap</h1>${weekSelect("wk", weeks, w)}</div>
  <div class="hero"><div class="sm mut">THE HEADLINE</div><div style="font:700 22px var(--f-d)">${headline}</div>
    <div class="sm mut" style="margin-top:6px">League median: <b>${f1(med)}</b> · ${gs.length} games · ${trades.length} trade${trades.length === 1 ? "" : "s"} · ${(tx || []).filter((t) => t.status === "complete" && t.type !== "trade").length} waiver/FA moves</div></div>
  ${chRes && chRes.status === "final" ? `<div class="card" style="border-color:var(--gold)"><div class="row"><span style="font-size:24px">🏆</span><div class="sp"><div class="t sm mut">WEEKLY CHALLENGE · ${esc(ch.name)}</div><div class="sm">${esc(ch.desc)}</div></div>
     ${chRes.winners.map((r) => team(T[r])).join(" ")}<span class="pill y">${f2(chRes.board[0]?.value)} ${ch.unit}${chRes.tie ? " · TIE" : ""}</span></div></div>` : ""}
  <div class="grid g3">
    ${award("🔥", "Top Score", top.roster_id, `<b>${f2(top.points)}</b> pts`)}
    ${award("🧊", "Lowest Score", low.roster_id, `<b>${f2(low.points)}</b> pts`)}
    ${award("💥", "Biggest Blowout", blow.win, `Beat ${esc(T[blow.lose].name)} by <b>${f2(blow.mg)}</b>`)}
    ${award("😬", "Nail-biter", close.win, `Edged ${esc(T[close.lose].name)} by <b>${f2(close.mg)}</b>`)}
    ${award("🍀", "Luckiest Win", lucky.win, `Won with only <b>${f2(lucky.ws)}</b>`)}
    ${award("💔", "Toughest Loss", unlucky.lose, `Lost with <b>${f2(unlucky.ls)}</b> (${unlucky.ls > med ? "above" : "below"} median)`)}
    ${award("🧠", "Best Manager", bestMgr.roster_id, `${pct(ss[bestMgr.roster_id].pct)} of max possible points`)}
    ${award("🤡", "Left It on the Bench", worstMgr.roster_id, `<b>${f2(ss[worstMgr.roster_id].optimal - ss[worstMgr.roster_id].actual)}</b> pts left on the bench${ss[worstMgr.roster_id].misses[0] ? `: started ${esc(pName(m, ss[worstMgr.roster_id].misses[0].started))} over ${esc(pName(m, ss[worstMgr.roster_id].misses[0].benched))}` : ""}`)}
    ${pow ? award("⭐", "Player of the Week", pow.rid, `${esc(pName(m, pow.pid))} <span class="pos${pPos(m, pow.pid)}">${pPos(m, pow.pid)}</span> · <b>${f2(pow.p)}</b>`) : ""}
    ${bench ? award("🪑", "Bench Hero", bench.rid, `${esc(pName(m, bench.pid))} scored <b>${f2(bench.p)}</b> on the bench`) : ""}
    ${faab ? award("💸", "Biggest FAAB Splash", faab.roster_ids[0], `$${faab.settings.waiver_bid} on ${Object.keys(faab.adds || {}).map((p) => esc(pName(m, p))).join(", ")}`) : ""}
    ${trades.length ? award("🤝", "Trade Alert", null, trades.map((t) => t.roster_ids.map((r) => esc(T[r]?.name)).join(" ⇄ ")).join("<br>")) : ""}
  </div>
  <h2>Matchups</h2>
  <div class="grid g2">${margins.map((g) => matchupCard(m, g, ss, w)).join("")}</div>
  ${await upcoming(m)}`;
  document.getElementById("wk").onchange = (e) => (location.hash = "home-" + e.target.value);
}

function matchupCard(m, g, ss, w) {
  const T = m.teamById; const A = T[g.a], B = T[g.b];
  const topOf = (rid) => { const e = teamEntry(m, w, rid); let best = null; (e.starters || []).forEach((pid, i) => { const p = e.starters_points?.[i] || 0; if (!best || p > best.p) best = { pid, p }; }); return best; };
  const ta = topOf(g.win), tl = topOf(g.lose);
  const W = T[g.win], L = T[g.lose]; const s = ss[g.lose];
  const tone = g.mg > 40 ? ["absolutely flattened", "put on a clinic against", "embarrassed"] : g.mg > 15 ? ["handled", "took care of business against", "comfortably beat"] : g.mg > 5 ? ["got past", "held off", "outlasted"] : ["squeaked by", "survived", "stole one from"];
  const blurb = `${esc(W.name)} ${pick(tone, g.week + g.matchupId)} ${esc(L.name)} ${f2(g.ws)}–${f2(g.ls)}. ${ta ? `${esc(pName(m, ta.pid))} led the way with ${f1(ta.p)}.` : ""} ${tl ? `${esc(pName(m, tl.pid))} (${f1(tl.p)}) wasn't enough.` : ""}${s.optimal - s.actual > g.mg ? ` Ouch: ${esc(L.owner)} left ${f1(s.optimal - s.actual)} on the bench, more than the margin.` : ""}`;
  const side = (rid, pts, won) => `<div class="mrow">${team(T[rid])}<span class="xs mut">start/sit ${pct(ss[rid].pct)}</span><span class="s ${won ? "w" : "mut"}">${f2(pts)}</span></div>`;
  return `<div class="card">${side(g.a, g.pa, g.pa > g.pb)}${side(g.b, g.pb, g.pb > g.pa)}
    <div class="blurb">${blurb}</div></div>`;
}

async function upcoming(m) {
  const w = m.liveWeek; if (!w || w >= m.playoffStart) return "";
  const gs = gamesInWeek(m, w); if (!gs.length) return "";
  const proj = await loadProjections(m.season, w);
  const pp = projectedTeamPoints(m, w, proj, (s) => fantasyPoints(m, s));
  const models = teamModels(m, pp);
  return `<h2>Week ${w} Preview</h2><div class="grid g2">${gs.map((g) => { const p = winProb(models, g.a, g.b);
    return `<div class="card"><div class="mrow">${team(m.teamById[g.a])}<span class="s">${pct(p)}</span></div><div class="mrow">${team(m.teamById[g.b])}<span class="s">${pct(1 - p)}</span></div>
      <div class="meter" style="margin-top:8px"><i style="left:0;width:${p * 100}%"></i></div>
      <div class="row xs" style="justify-content:space-between;margin-top:3px"><b>${pct(p)}</b><span class="mut">${pp ? `proj ${f1(pp[g.a])} – ${f1(pp[g.b])}` : "win chance"}</span><b>${pct(1 - p)}</b></div></div>`; }).join("")}</div>`;
}
