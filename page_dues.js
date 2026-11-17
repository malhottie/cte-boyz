import { CONFIG } from "./config.js";
import { CHALLENGES, runChallenge } from "./challenges.js";
import { team, esc, table } from "./ui.js";

export async function render(root, m) {
  const T = m.teamById; const buy = CONFIG.BUY_IN;
  const due = (t) => CONFIG.DUES[t.username] || CONFIG.DUES[t.owner] || CONFIG.DUES[t.owner.toLowerCase()] || CONFIG.DUES["*"] || null;
  const usd = (x) => "$" + (Math.abs(x - Math.round(x)) < 0.005 ? Math.round(x) : x.toFixed(2));
  const rows = m.teams.map((t) => { const d = due(t); const paid = d?.paid || 0; return { t, paid, owed: Math.max(0, Math.round((buy - paid) * 100) / 100), d }; });
  const collected = rows.reduce((s, r) => s + r.paid, 0), pot = buy * m.teams.length;
  const payTotal = Object.values(CONFIG.PAYOUTS).reduce((a, b) => a + b, 0);
  const results = await Promise.all(CHALLENGES.map((c) => runChallenge(m, c)));
  const chEarn = {}; results.forEach((r) => r.status === "final" && r.winners.forEach((rid) => (chEarn[rid] = (chEarn[rid] || 0) + CONFIG.CHALLENGE_PAYOUT / r.winners.length)));
  const chTotal = 17 * CONFIG.CHALLENGE_PAYOUT;

  root.innerHTML = `<h1>Dues & Money</h1>
  <div class="grid g4" style="margin-bottom:14px">
    <div class="stat"><div class="k">Collected</div><div class="v">${usd(collected)}</div><div class="xs mut">of ${usd(pot)}</div></div>
    <div class="stat"><div class="k">Paid up</div><div class="v">${rows.filter((r) => !r.owed).length}/${rows.length}</div></div>
    <div class="stat"><div class="k">Prize pool</div><div class="v">$${payTotal}</div><div class="xs mut">1st $${CONFIG.PAYOUTS[1]} · 2nd $${CONFIG.PAYOUTS[2]} · 3rd $${CONFIG.PAYOUTS[3]}</div></div>
    <div class="stat"><div class="k">Challenges</div><div class="v">${CONFIG.CHALLENGE_PAYOUT ? "$" + chTotal : "TBD"}</div><div class="xs mut">${CONFIG.CHALLENGE_PAYOUT ? `$${CONFIG.CHALLENGE_PAYOUT} × 17 weeks` : "awaiting league vote"}</div></div>
  </div>
  ${payTotal + chTotal > pot + 0.005 ? `<div class="card" style="border-color:var(--warn)"><b class="gold">Heads up:</b> payouts (${usd(payTotal + chTotal)}) exceed the pot (${usd(pot)}). Weekly challenges need extra money or a payout change.</div>` : ""}
  <div class="card">${table([
    { label: "Team", f: (r) => team(r.t), s: (r) => r.t.name },
    { label: "Status", f: (r) => (r.owed ? `<span class="pill r">Owes ${usd(r.owed)}</span>` : `<span class="pill g">Paid ✓</span>`), s: (r) => -r.owed },
    { label: "Paid", n: 1, f: (r) => usd(r.paid), s: (r) => r.paid },
    { label: "Date / method", f: (r) => esc([r.d?.date, r.d?.method].filter(Boolean).join(" · ") || "–"), s: false },
    { label: "Challenge $", n: 1, f: (r) => (chEarn[r.t.rosterId] ? `$${chEarn[r.t.rosterId].toFixed(2)}` : "–"), s: (r) => chEarn[r.t.rosterId] || 0 },
    { label: "Note", f: (r) => esc(r.d?.note || ""), s: false },
  ], rows)}</div>
  <div class="card"><details><summary>Commish: update the ledger</summary>
    <p class="sm mut">Enter amounts, then copy the generated block into <code>DUES</code> in <code>js/config.js</code> and commit. (A static site can't save edits for everyone by itself.)</p>
    ${rows.map((r) => `<div class="row" style="margin:4px 0"><span class="sp sm">${esc(r.t.owner)} <span class="mut">(${esc(r.t.username)})</span></span><input data-u="${esc(r.t.username)}" type="number" value="${r.paid}" style="width:90px"><input data-m="${esc(r.t.username)}" placeholder="method" value="${esc(r.d?.method || "")}" style="width:110px"></div>`).join("")}
    <button class="btn pri" id="gen">Generate config</button> <button class="btn" id="cp">Copy</button>
    <pre id="out" style="white-space:pre-wrap;background:var(--bg2);padding:10px;border-radius:10px;font-size:12px"></pre></details></div>`;
  const gen = () => { const o = {}; root.querySelectorAll("input[data-u]").forEach((i) => { const u = i.dataset.u; const mth = root.querySelector(`input[data-m="${u}"]`).value;
    if (+i.value) o[u] = { paid: +i.value, date: CONFIG.DUES[u]?.date || new Date().toISOString().slice(0, 10), method: mth, note: CONFIG.DUES[u]?.note || "" }; });
    document.getElementById("out").textContent = "DUES: " + JSON.stringify(o, null, 2) + ","; };
  document.getElementById("gen").onclick = gen;
  document.getElementById("cp").onclick = async (e) => { gen(); try { await navigator.clipboard.writeText(document.getElementById("out").textContent); e.target.textContent = "Copied!"; } catch { e.target.textContent = "Select & copy manually"; } };
}
