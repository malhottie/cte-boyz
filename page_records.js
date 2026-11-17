// Record Book: champions, all-time standings, head-to-head, single-game records.
import { allTimeStandings, loadHistory, loadHistoryGames, mean } from "./data.js";
import { team, esc, f1, f2, pct, rec, table, heatColor } from "./ui.js";

export async function render(root, m) {
  root.innerHTML = `<h1>Record Book</h1><div class="loading">Digging through the archives…</div>`;
  const hist = await loadHistory(m); const games = await loadHistoryGames(m);
  const tByOwner = Object.fromEntries(m.teams.map((t) => [t.ownerId, t]));
  const nameOf = (o) => { if (tByOwner[o]) return tByOwner[o]; for (const s of hist) { const u = s.users.find((x) => x.user_id === o); if (u) return { name: u.metadata?.team_name || u.display_name, owner: u.display_name, ownerId: o, rosterId: null, avatar: null, username: "" }; } return { name: "Unknown", owner: "?", ownerId: o }; };
  const tm = (o) => { const t = nameOf(o); return t.rosterId ? team(t) : `<b>${esc(t.owner)}</b>`; };

  const rows = await allTimeStandings(m);

  // H2H matrix (owners in current league)
  const owners = m.standings.map((r) => m.teamById[r.rid].ownerId);
  const h2h = {}; for (const g of games) { const k = g.oa + "|" + g.ob, k2 = g.ob + "|" + g.oa; (h2h[k] ||= { w: 0, l: 0 }); (h2h[k2] ||= { w: 0, l: 0 }); if (g.pa > g.pb) { h2h[k].w++; h2h[k2].l++; } else if (g.pb > g.pa) { h2h[k].l++; h2h[k2].w++; } }

  // Single-game records
  const flat = games.flatMap((g) => [{ o: g.oa, opp: g.ob, p: g.pa, q: g.pb, ...g }, { o: g.ob, opp: g.oa, p: g.pb, q: g.pa, ...g }]);
  const top = (arr, f, n = 5) => [...arr].sort((a, b) => f(b) - f(a)).slice(0, n);
  const recList = (title, list, val) => `<div class="card"><h3>${title}</h3>${list.map((x, i) => `<div class="row sm" style="padding:4px 0;flex-wrap:nowrap"><span class="mut" style="width:16px">${i + 1}</span><span class="sp">${tm(x.o)}</span><span class="xs mut">${x.season} W${x.week}</span><b style="width:70px;text-align:right">${val(x)}</b></div>`).join("")}</div>`;

  root.innerHTML = `<h1>Record Book</h1>
  <div class="card"><h3>🏆 Champions</h3>${table([{ label: "Season", k: "season" }, { label: "Champion", f: (s) => (s.champion ? tm(s.champion) : s.season === m.season && !m.finished ? `<span class="mut">TBD</span>` : "–") },
    { label: "Runner-up", f: (s) => (s.runnerUp ? tm(s.runnerUp) : "–") }, { label: "Third", f: (s) => (s.third ? tm(s.third) : "–") }], hist, { sortable: false })}</div>
  <div class="card"><h3>All-time standings</h3><p class="xs mut">👑 goes to the leader: most titles, then best regular-season win %.</p>${table([{ label: "Owner", f: (r) => tm(r.o), s: (r) => nameOf(r.o).owner },
    { label: "🏆", n: 1, f: (r) => r.champion || "", s: (r) => r.champion || 0 }, { label: "Reg. season", f: (r) => rec(r), s: (r) => r.w / (r.g || 1) }, { label: "Win %", n: 1, f: (r) => pct(r.w / (r.g || 1), 1), s: (r) => r.w / (r.g || 1) },
    { label: "Playoffs", f: (r) => `${r.pw}-${r.pl}`, s: (r) => r.pw }, { label: "PF/G", n: 1, f: (r) => f1(r.pf / (r.g || 1)), s: (r) => r.pf / (r.g || 1) }, { label: "Total PF", n: 1, f: (r) => f1(r.pf), s: (r) => r.pf }], rows)}</div>
  <div class="card"><h3>Head-to-head (all-time, incl. playoffs)</h3><p class="xs mut">Row owner's record vs column owner.</p><div class="tbl-wrap"><table class="heat"><thead><tr><th></th>${owners.map((o) => `<th>${esc(nameOf(o).owner)}</th>`).join("")}</tr></thead><tbody>
    ${owners.map((a) => `<tr><td>${esc(nameOf(a).owner)}</td>${owners.map((b) => { if (a === b) return `<td class="mut">–</td>`; const r = h2h[a + "|" + b] || { w: 0, l: 0 }; const n = r.w + r.l; return `<td style="background:${n ? heatColor(r.w / n) : "transparent"}">${n ? `${r.w}-${r.l}` : ""}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div></div>
  <div class="grid g2">
    ${recList("Highest scores", top(flat, (x) => x.p), (x) => f2(x.p))}
    ${recList("Lowest scores", top(flat.filter((x) => x.p > 0), (x) => -x.p), (x) => f2(x.p))}
    ${recList("Biggest blowouts", top(flat.filter((x) => x.p > x.q), (x) => x.p - x.q), (x) => "+" + f2(x.p - x.q))}
    ${recList("Closest wins", top(flat.filter((x) => x.p > x.q), (x) => -(x.p - x.q)), (x) => "+" + f2(x.p - x.q))}
    ${recList("Highest-scoring losses", top(flat.filter((x) => x.p < x.q), (x) => x.p), (x) => f2(x.p))}
    ${recList("Lowest-scoring wins", top(flat.filter((x) => x.p > x.q), (x) => -x.p), (x) => f2(x.p))}
  </div>
  <p class="note">History follows Sleeper's "previous league" link each season (${hist.length} season${hist.length === 1 ? "" : "s"} found). Owners are tracked by Sleeper account, so team renames don't split records.</p>`;
}
