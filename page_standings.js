import { seedPlayoffs, median, mean, sd, opponentOf, teamEntry } from "./data.js";
import { team, table, f1, f2, sign, pct, rec, heatColor, esc, chart } from "./ui.js";

export async function render(root, m, tab = "table") {
  const T = m.teamById; const S = m.standings;
  const seeds = seedPlayoffs(S, m.playoffTeams); const seedOf = (rid) => seeds.findIndex((r) => r.rid === rid) + 1;
  const tabs = [["table", "Standings"], ["median", "vs Median"], ["swap", "Schedule Swap"], ["power", "Power Rankings"], ["weekly", "Weekly Scores"]];
  const nav = `<div class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? "on" : ""}" onclick="location.hash='standings-${k}'">${l}</button>`).join("")}</div>`;
  let body = "";
  const weeksPlayed = m.completedReg.length;

  if (tab === "table") {
    const rows = S.map((r, i) => ({ ...r, i: i + 1, seed: seedOf(r.rid), _cls: i === m.playoffTeams - 1 ? "cut" : "" }));
    body = `<div class="card">${table([
      { label: "#", f: (r) => r.i, s: (r) => -r.i },
      { label: "Team", f: (r) => team(T[r.rid]), s: (r) => T[r.rid].name },
      { label: "W-L", f: (r) => rec(r), s: (r) => r.w + r.t / 2 },
      { label: "PF", n: 1, f: (r) => f2(r.pf), s: (r) => r.pf },
      { label: "PA", n: 1, f: (r) => f2(r.pa), s: (r) => r.pa },
      { label: "Max PF", n: 1, tip: "Points if you'd started your best lineup every week", f: (r) => f1(r.maxPf), s: (r) => r.maxPf },
      { label: "Mgr %", n: 1, tip: "PF ÷ Max PF", f: (r) => pct(r.pf / r.maxPf, 1), s: (r) => r.pf / r.maxPf },
      { label: "Avg", n: 1, f: (r) => f1(r.avg), s: (r) => r.avg },
      { label: "Strk", f: (r) => `<span class="${r.streak[0] === "W" ? "pos" : "neg"}">${r.streak}</span>`, s: (r) => (r.streak[0] === "W" ? 1 : -1) * +r.streak.slice(1) },
      { label: "Seed", f: (r) => r.seed ? `<span class="pill ${r.seed === 1 ? "y" : "g"}">${r.seed}${seeds.length === 7 && r.seed === 7 && S.indexOf(S.find((x) => x.rid === r.rid)) > 6 ? " PF" : ""}</span>` : "", s: (r) => -(r.seed || 99) },
    ], rows)}
    <p class="note">Dashed line = playoff cut (${m.playoffTeams} teams). Per league rules, the top ${m.playoffTeams === 7 ? "6 by record" : m.playoffTeams + " by record"} get in${m.playoffTeams === 7 ? " and the 7th spot goes to the overall points leader if they aren't already in; otherwise to the 7th-best record" : ""}. Ties are broken by points for.</p></div>`;
  }

  if (tab === "median") {
    const medPf = median(S.map((r) => r.pf)), medPa = median(S.map((r) => r.pa));
    body = `<div class="grid g4" style="margin-bottom:14px">
      <div class="stat"><div class="k">League median PF</div><div class="v">${f1(medPf)}</div></div>
      <div class="stat"><div class="k">League median PA</div><div class="v">${f1(medPa)}</div></div>
      <div class="stat"><div class="k">Median weekly score</div><div class="v">${f1(median(m.completedReg.flatMap((w) => m.weeks[w].map((e) => e.points))))}</div></div>
      <div class="stat"><div class="k">Weeks final</div><div class="v">${weeksPlayed}</div></div></div>
    <div class="card">${table([
      { label: "Team", f: (r) => team(T[r.rid]), s: (r) => T[r.rid].name },
      { label: "Record", f: (r) => rec(r), s: (r) => r.w },
      { label: "vs Median", tip: "Record if you played the league median every week", f: (r) => `${r.mw}-${r.ml}`, s: (r) => r.mw },
      { label: "Combined", tip: "H2H + median record together", f: (r) => `${r.w + r.mw}-${r.l + r.ml}`, s: (r) => r.w + r.mw },
      { label: "All-Play", tip: "Record vs every team every week", f: (r) => `${r.apw}-${r.apl}`, s: (r) => r.apw },
      { label: "PF vs Med", n: 1, f: (r) => `<span class="${r.pfVsMed >= 0 ? "pos" : "neg"}">${sign(r.pfVsMed)}</span>`, s: (r) => r.pfVsMed },
      { label: "PA vs Med", n: 1, tip: "Positive = opponents scored more than typical against you", f: (r) => `<span class="${r.paVsMed <= 0 ? "pos" : "neg"}">${sign(r.paVsMed)}</span>`, s: (r) => r.paVsMed },
      { label: "Exp W", n: 1, tip: "Expected wins from all-play %", f: (r) => f1(r.expW), s: (r) => r.expW },
      { label: "Luck", n: 1, tip: "Actual wins − expected wins", f: (r) => `<span class="${r.luck >= 0 ? "pos" : "neg"}">${sign(r.luck)}</span>`, s: (r) => r.luck },
    ], S)}</div>
    <div class="card"><h3>PF vs PA (crosshairs at league median)</h3><div style="height:320px"><canvas id="sc"></canvas></div></div>`;
    chart("sc", { type: "scatter", data: { datasets: [{ data: S.map((r) => ({ x: r.pf, y: r.pa, n: T[r.rid].name })), pointRadius: 6, backgroundColor: "#2ee6a6" },
      { type: "line", data: [{ x: medPf, y: Math.min(...S.map((r) => r.pa)) }, { x: medPf, y: Math.max(...S.map((r) => r.pa)) }], borderColor: "#8e9ab3", borderDash: [4, 4], pointRadius: 0 },
      { type: "line", data: [{ x: Math.min(...S.map((r) => r.pf)), y: medPa }, { x: Math.max(...S.map((r) => r.pf)), y: medPa }], borderColor: "#8e9ab3", borderDash: [4, 4], pointRadius: 0 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw.n ?? ""} PF ${f1(c.raw.x)} PA ${f1(c.raw.y)}` } } }, scales: { x: { title: { display: true, text: "Points For →" } }, y: { title: { display: true, text: "Points Against →" } } } } });
  }

  if (tab === "swap") {
    // Row team's record if it had column team's schedule
    const ids = S.map((r) => r.rid);
    const recWith = (me, sched) => { let w = 0, l = 0, t = 0;
      for (const wk of m.completedReg) {
        let opp = opponentOf(m, wk, sched); if (opp == null) continue;
        if (opp === me) opp = sched;
        const a = teamEntry(m, wk, me)?.points || 0, b = teamEntry(m, wk, opp)?.points || 0;
        a > b ? w++ : a < b ? l++ : t++;
      } return { w, l, t }; };
    const M = ids.map((me) => ids.map((sc) => recWith(me, sc)));
    const n = weeksPlayed || 1;
    body = `<div class="card"><p class="sm mut">Each row is a team; each column is whose schedule they play. Read across to see a team's record under every schedule. Diagonal = actual record.</p>
      <div class="tbl-wrap"><table class="heat"><thead><tr><th>Team ↓ / Schedule →</th>${ids.map((c) => `<th title="${esc(T[c].name)}">${esc(T[c].owner)}</th>`).join("")}<th>Best</th><th>Worst</th></tr></thead><tbody>
      ${ids.map((me, i) => { const ws = M[i].map((r) => r.w);
        return `<tr><td>${team(T[me], false)}</td>${M[i].map((r, j) => `<td style="background:${heatColor(r.w / n)};${i === j ? "outline:2px solid #fff;outline-offset:-2px;font-weight:700" : ""}">${r.w}-${r.l}</td>`).join("")}<td class="pos">${Math.max(...ws)}-${n - Math.max(...ws)}</td><td class="neg">${Math.min(...ws)}-${n - Math.min(...ws)}</td></tr>`; }).join("")}
      </tbody></table></div>
      <h3 style="margin-top:16px">Schedule luck</h3>
      ${table([{ label: "Team", f: (r) => team(T[r.rid]) }, { label: "Actual W", n: 1, f: (r) => r.act, s: (r) => r.act },
        { label: "Avg W across all schedules", n: 1, f: (r) => f2(r.avg), s: (r) => r.avg }, { label: "Schedule luck", n: 1, f: (r) => `<span class="${r.act - r.avg >= 0 ? "pos" : "neg"}">${sign(r.act - r.avg, 2)}</span>`, s: (r) => r.act - r.avg }],
        ids.map((me, i) => ({ rid: me, act: M[i][i].w, avg: mean(M[i].map((r) => r.w)) })))}</div>`;
  }

  if (tab === "power") {
    const rows = S.map((r) => {
      const recent = mean(r.scores.slice(-3));
      return { ...r, recent, ap: r.apw / (r.apw + r.apl || 1) };
    });
    const mu = mean(rows.map((r) => r.recent)), s = sd(rows.map((r) => r.recent)) || 1;
    rows.forEach((r) => (r.power = 100 * (0.5 * r.ap + 0.3 * (0.5 + (r.recent - mu) / s / 4) + 0.2 * r.pct)));
    rows.sort((a, b) => b.power - a.power);
    body = `<div class="card"><p class="sm mut">Power score = 50% all-play win rate (how you'd do vs everyone, every week) + 30% last-3-weeks scoring + 20% actual record.</p>${table([
      { label: "Rk", f: (r) => rows.indexOf(r) + 1, s: false }, { label: "Team", f: (r) => team(T[r.rid]) },
      { label: "Power", n: 1, f: (r) => `<b>${f1(r.power)}</b>`, s: (r) => r.power }, { label: "All-play %", n: 1, f: (r) => pct(r.ap, 1), s: (r) => r.ap },
      { label: "Last 3 avg", n: 1, f: (r) => f1(r.recent), s: (r) => r.recent }, { label: "Record", f: (r) => rec(r), s: (r) => r.w },
      { label: "vs standings", n: 1, f: (r) => { const d = S.findIndex((x) => x.rid === r.rid) - rows.indexOf(r); return `<span class="${d > 0 ? "pos" : d < 0 ? "neg" : "mut"}">${d > 0 ? "▲" + d : d < 0 ? "▼" + -d : "–"}</span>`; }, s: false },
    ], rows)}</div>`;
  }

  if (tab === "weekly") {
    const wk = m.completedWeeks;
    const allScores = wk.flatMap((w) => m.weeks[w].map((e) => e.points).filter((x) => x > 0));
    const lo = Math.min(...allScores), hi = Math.max(...allScores);
    body = `<div class="card"><div class="tbl-wrap"><table class="heat"><thead><tr><th>Team</th>${wk.map((w) => `<th>W${w}</th>`).join("")}<th>Avg</th><th>SD</th></tr></thead><tbody>
      ${S.map((r) => { const sc = wk.map((w) => teamEntry(m, w, r.rid)?.points || 0);
        return `<tr><td>${team(T[r.rid], false)}</td>${sc.map((p, i) => { const g = m.games.find((g) => g.week === wk[i] && (g.a === r.rid || g.b === r.rid)); const won = g && (g.a === r.rid ? g.pa > g.pb : g.pb > g.pa);
          return `<td style="background:${p ? heatColor(p, lo, hi) : "transparent"}">${p ? f1(p) : "–"}${g ? `<div class="xs ${won ? "pos" : "neg"}">${won ? "W" : "L"}</div>` : ""}</td>`; }).join("")}<td><b>${f1(mean(sc.filter(Boolean)))}</b></td><td>${f1(sd(sc.filter(Boolean)))}</td></tr>`; }).join("")}
      <tr><td class="mut">Median</td>${wk.map((w) => `<td class="mut">${f1(median(m.weeks[w].map((e) => e.points).filter(Boolean)))}</td>`).join("")}<td></td><td></td></tr>
      </tbody></table></div></div>`;
  }
  root.innerHTML = `<h1>Standings</h1>${nav}${body}`;
}
