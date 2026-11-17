import { gamesInWeek, startSit, pName, pPos, teamEntry, median, loadProjections, fantasyPoints } from "./data.js";
import { get } from "./api.js";
import { CONFIG } from "./config.js";
import { CHALLENGES, runChallenge } from "./challenges.js";
import { teamModels, winProb, projectedTeamPoints } from "./sim.js";
import { liveBoard } from "./live.js";
import { team, av, esc, f1, f2, pct, rec, weekSelect, player } from "./ui.js";

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

export async function render(root, m, arg) {
  const weeks = m.completedWeeks;
  if (!weeks.length) { root.innerHTML = `<div id="live"></div><div class="card"><h2>No recap yet</h2><p class="mut">The recap shows up once Week 1 is final.</p></div>${await nextWeek(m)}`; startLive(root, m); return; }
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
  <div id="live"></div>
  <div class="row" style="margin:18px 0 8px"><h1 class="sp" style="margin:0">Week ${w} Recap</h1>${weekSelect("wk", weeks, w)}</div>
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
  ${await nextWeek(m)}`;
  startLive(root, m);
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

// ---------- Current week: live scores + live win chances ----------
function startLive(root, m) {
  const box = root.querySelector("#live"); if (!box || !m.liveWeek) return;
  let timer = null;
  const draw = async (fresh) => {
    if (!document.body.contains(box)) { clearInterval(timer); return; }
    const lb = await liveBoard(m, { fresh }).catch(() => null);
    if (!lb || !lb.games.length) { box.innerHTML = ""; return; }
    const T = m.teamById;
    const status = lb.allFinal ? `<span class="pill">All games final</span>` : lb.started ? `<span class="pill r">● LIVE</span>` : `<span class="pill y">Kicks off soon</span>`;
    const side = (rid, pts, p, lead) => { const t = lb.teams[rid]; const left = t.toPlay + t.inPlay;
      return `<div class="mrow">${team(T[rid])}<span class="xs mut" style="text-align:right">${left ? `${t.inPlay ? `${t.inPlay} playing · ` : ""}${t.toPlay} to play<br>proj ${f1(t.expected)}` : "done"}</span><span class="s ${lead ? "w" : ""}">${f2(pts)}</span></div>`; };
    box.innerHTML = `<div class="row" style="margin-bottom:8px"><h1 class="sp" style="margin:0">Week ${lb.week} ${lb.started ? "Scores" : "Matchups"}</h1>${status}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))">${lb.games.map((g) => `<div class="card">${side(g.a, g.pa, g.p, g.pa > g.pb)}${side(g.b, g.pb, 1 - g.p, g.pb > g.pa)}
        <div class="meter" style="margin-top:8px"><i style="left:0;width:${g.p * 100}%"></i></div>
        <div class="row xs" style="justify-content:space-between;margin-top:3px"><b>${pct(g.p)}</b><span class="mut">${g.final ? "final" : "win chance"}</span><b>${pct(1 - g.p)}</b></div></div>`).join("")}</div>
      <p class="note">Win chances use each lineup's points so far plus Sleeper projections for players still to play${lb.hasClock ? ", scaled by time left in their NFL games" : ""}. Updates every minute.</p>`;
    if (lb.allFinal) clearInterval(timer);
  };
  draw(false);
  timer = setInterval(() => draw(true), 60000);
  addEventListener("hashchange", () => clearInterval(timer), { once: true });
}

// ---------- Next week: minimalist preview ----------
async function nextWeek(m) {
  const w = (m.liveWeek || 0) + 1; if (!m.liveWeek || w >= m.playoffStart) return "";
  const gs = gamesInWeek(m, w); if (!gs.length) return "";
  const proj = await loadProjections(m.season, w);
  const pp = projectedTeamPoints(m, w, proj, (s) => fantasyPoints(m, s));
  const models = teamModels(m, pp);
  return `<h1 style="margin-top:18px">Week ${w} Preview</h1><div class="card">${gs.map((g) => { const p = winProb(models, g.a, g.b); const A = m.teamById[g.a], B = m.teamById[g.b];
    return `<div class="row sm" style="padding:7px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap"><a href="#team-${A.rosterId}" style="flex:1;text-align:right;color:inherit;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${esc(A.name)}</b></a><span class="${p >= 0.5 ? "pos" : "mut"}" style="width:38px;text-align:right">${pct(p)}</span><span class="mut xs">vs</span><span class="${p < 0.5 ? "pos" : "mut"}" style="width:38px">${pct(1 - p)}</span><a href="#team-${B.rosterId}" style="flex:1;color:inherit;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${esc(B.name)}</b></a></div>`; }).join("")}
    <p class="note">Early win chances from each team's scoring profile${pp ? " and Sleeper's projections for current lineups" : ""}.</p></div>`;
}
