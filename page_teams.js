import { seedPlayoffs } from "./data.js";
import { av, esc, f1, rec, ord } from "./ui.js";

export async function render(root, m) {
  const S = m.standings; const seeds = seedPlayoffs(S, m.playoffTeams);
  root.innerHTML = `<h1>Teams</h1><div class="grid g3">${S.map((r, i) => { const t = m.teamById[r.rid]; const sd = seeds.findIndex((x) => x.rid === r.rid) + 1;
    return `<a class="card row" href="#team-${t.rosterId}" style="color:inherit">${av(t, "lg")}<div class="sp" style="min-width:0"><h3 style="margin:0">${esc(t.name)}</h3><div class="sm mut">${esc(t.owner)}${t.coOwners.length ? " + " + t.coOwners.map(esc).join(", ") : ""}</div>
      <div class="row sm" style="margin-top:6px"><span class="pill">${rec(r)}</span><span class="pill">${f1(r.pf)} PF</span><span class="pill ${sd ? "g" : ""}">${ord(i + 1)}${sd ? " · seed " + sd : ""}</span></div></div></a>`; }).join("")}</div>`;
}
