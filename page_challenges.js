import { CHALLENGES, runChallenge } from "./challenges.js";
import { CONFIG } from "./config.js";
import { team, esc, f2, table } from "./ui.js";

export async function render(root, m) {
  const T = m.teamById;
  const results = await Promise.all(CHALLENGES.map((c) => runChallenge(m, c)));
  const pay = CONFIG.CHALLENGE_PAYOUT;
  const wins = {};
  results.forEach((r) => r.status === "final" && r.winners.forEach((rid) => (wins[rid] = (wins[rid] || 0) + 1 / r.winners.length)));
  const board = Object.entries(wins).map(([rid, n]) => ({ rid: +rid, n })).sort((a, b) => b.n - a.n);

  root.innerHTML = `<h1>Weekly Challenges</h1>
  <p class="mut sm">Scored automatically from Sleeper every week${pay ? `. Each win pays <b>$${pay}</b>, paid out with the championship` : ". Payout per win isn't set yet (set CHALLENGE_PAYOUT in config once the league votes)"}. Ties are flagged for the commissioners to rule on.</p>
  ${board.length ? `<div class="card"><h3>Challenge leaderboard</h3>${table([{ label: "Team", f: (r) => team(T[r.rid]) }, { label: "Wins", n: 1, f: (r) => (r.n % 1 ? r.n.toFixed(2) : r.n), s: (r) => r.n },
    ...(pay ? [{ label: "Earned", n: 1, f: (r) => `$${(r.n * pay).toFixed(2)}`, s: (r) => r.n }] : [])], board)}</div>` : ""}
  <div class="grid g2">${CHALLENGES.map((c, i) => { const r = results[i];
    return `<div class="card" ${r.status === "final" ? "" : `style="opacity:${r.status === "live" ? 1 : 0.7}"`}>
      <div class="row"><span class="pill ${r.status === "final" ? "g" : r.status === "live" ? "y" : ""}">W${c.week} · ${r.status === "final" ? "Final" : r.status === "live" ? "This week" : "Upcoming"}</span><h3 style="margin:0" class="sp">${esc(c.name)}</h3></div>
      <div class="sm mut" style="margin:4px 0 8px">${esc(c.desc)}</div>
      ${r.status === "final" ? `<div class="row">🏆 ${r.winners.map((rid) => team(T[rid])).join(" ")} <span class="pill y">${f2(r.board[0]?.value)} ${c.unit}</span>${r.tie ? `<span class="pill r">TIE</span>` : ""}${r.override ? `<span class="pill">commish ruling${r.override.note ? ": " + esc(r.override.note) : ""}</span>` : ""}</div>
        ${r.board[0]?.label ? `<div class="sm" style="margin-top:4px">${esc(r.board[0].label)}</div>` : ""}
        <details style="margin-top:8px"><summary>Full leaderboard</summary>${r.board.map((x, k) => `<div class="row sm" style="padding:3px 0;flex-wrap:nowrap"><span style="width:20px" class="mut">${k + 1}</span><span class="sp">${esc(T[x.rid]?.name)}${x.label ? ` <span class="xs mut">${esc(x.label)}</span>` : ""}</span><b>${f2(x.value)}</b></div>`).join("")}</details>` : ""}
      ${c.week >= m.playoffStart ? `<p class="note">Playoff week: only teams that play a game that week are counted.</p>` : ""}
      ${c.week === 3 ? `<p class="note">Counts every starter's passing, rushing, receiving and return/defensive TDs (editable in config).</p>` : ""}
    </div>`; }).join("")}</div>`;
}
