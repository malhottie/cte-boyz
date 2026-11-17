import { teamModels, simulate, winProb, projectedTeamPoints } from "../sim.js";
import { gamesInWeek, loadProjections, fantasyPoints } from "../data.js";
import { get } from "../api.js";
import { team, table, pct, f1, heatColor, esc, rec } from "../ui.js";

export async function render(root, m) {
  root.innerHTML = `<h1>What are the chances?</h1><div class="loading">Simulating the rest of the season ${m.teams.length ? "10,000 times" : ""}…</div>`;
  await new Promise((r) => setTimeout(r, 30));
  const w = m.liveWeek;
  const proj = w ? await loadProjections(m.season, w) : null;
  const pp = w ? projectedTeamPoints(m, w, proj, (s) => fantasyPoints(m, s)) : null;
  const models = teamModels(m, pp);
  const bracket = m.completedWeeks.some((x) => x >= m.playoffStart) || m.completedReg.length >= m.regWeeks
    ? await get(`/league/${m.league.league_id}/winners_bracket`).catch(() => []) : [];
  const res = simulate(m, { models, bracket });
  const T = m.teamById; const tl = res.tally;
  const rows = m.standings.map((r) => ({ ...r, ...tl[r.rid], mu: models[r.rid].mu, sdv: models[r.rid].sd }));
  const fmt = (x) => (x >= 0.9995 ? `<span class="pos"><b>✓ Clinched</b></span>` : x <= 0.0005 ? `<span class="neg">✗ Out</span>` : `<b>${pct(x, x < 0.01 ? 1 : 0)}</b>`);
  const cell = (x) => `<span style="display:inline-block;min-width:54px;padding:2px 6px;border-radius:6px;background:${heatColor(x)}">${fmt(x)}</span>`;
  const games = w ? gamesInWeek(m, w) : [];
  const nP = m.playoffTeams;

  root.innerHTML = `<h1>What are the chances?</h1>
  <p class="mut sm">${res.runs.toLocaleString()} simulated seasons. Each team's weekly score is drawn from its own scoring profile (season average blended with the last 3 weeks, pulled toward the league average early in the year)${pp ? `, with this week shifted toward Sleeper's projections for each current lineup` : ""}. Playoff spots follow league rules: top ${nP === 7 ? "6 by record + the points leader (or 7th record)" : nP} make it, ${res.byes} bye${res.byes === 1 ? "" : "s"}.</p>
  ${games.length && w < m.playoffStart ? `<h2>Week ${w} win chances</h2><div class="grid g2">${games.map((g) => { const p = winProb(models, g.a, g.b);
    return `<div class="card"><div class="mrow">${team(T[g.a])}<span class="s">${pct(p)}</span></div><div class="mrow">${team(T[g.b])}<span class="s">${pct(1 - p)}</span></div>
      <div class="meter" style="margin-top:8px"><i style="left:0;width:${p * 100}%"></i></div><div class="row sm" style="justify-content:space-between"><b>${pct(p)}</b><span class="xs mut">${pp ? `proj ${f1(models[g.a].weekMu)} – ${f1(models[g.b].weekMu)}` : ""}</span><b>${pct(1 - p)}</b></div></div>`; }).join("")}</div>` : ""}
  <h2>Season odds</h2>
  <div class="card">${table([
    { label: "Team", f: (r) => team(T[r.rid]), s: (r) => T[r.rid].name },
    { label: "Now", f: (r) => rec(r), s: (r) => r.w },
    { label: "Proj W", n: 1, f: (r) => f1(r.wins), s: (r) => r.wins },
    { label: "Playoffs", n: 1, f: (r) => cell(r.playoffs), s: (r) => r.playoffs },
    { label: res.byes === 1 ? "Bye (1 seed)" : "Bye", n: 1, f: (r) => cell(r.bye), s: (r) => r.bye },
    ...(nP === 7 ? [{ label: "Via PF spot", n: 1, tip: "Chance of getting in only through the points-leader 7th spot", f: (r) => pct(r.pfSpot, 1), s: (r) => r.pfSpot }] : []),
    { label: "Make final", n: 1, f: (r) => cell(r.final), s: (r) => r.final },
    { label: "Win title", n: 1, f: (r) => cell(r.champ), s: (r) => r.champ },
    { label: "Last place 🚽", n: 1, tip: "Chance of finishing last in the regular season (punishment!)", f: (r) => pct(r.last, 1), s: (r) => r.last },
  ], rows)}</div>
  <h2>Seed probabilities</h2>
  <div class="card"><div class="tbl-wrap"><table class="heat"><thead><tr><th>Team</th>${Array.from({ length: nP }, (_, i) => `<th>${i + 1}</th>`).join("")}<th>Miss</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${team(T[r.rid], false)}</td>${r.seeds.slice(1).map((x) => `<td style="background:${x ? heatColor(x, 0, 0.6) : "transparent"}">${x ? pct(x, x < 0.1 ? 1 : 0) : ""}</td>`).join("")}<td class="mut">${pct(1 - r.playoffs)}</td></tr>`).join("")}
  </tbody></table></div></div>
  <div class="card"><h3>Team scoring profiles used</h3>${table([{ label: "Team", f: (r) => team(T[r.rid]) },
    { label: "Expected score", n: 1, f: (r) => f1(r.mu), s: (r) => r.mu }, { label: "Volatility (SD)", n: 1, f: (r) => f1(r.sdv), s: (r) => r.sdv }], rows)}
    <p class="note">Higher volatility means a team is more likely to both boom and bust. These numbers drive every simulated game.</p></div>`;
}
