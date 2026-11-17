// Keeper cost calculator implementing the league's keeper rules.
import { get, local } from "./api.js";
import { CONFIG } from "./config.js";
import { loadHistory, pName, pPos, futurePicks } from "./data.js";
import { team, esc, player, table } from "./ui.js";

async function draftPicks(leagueId) {
  const ds = await get(`/league/${leagueId}/drafts`, { persist: false }).catch(() => []);
  const d = (ds || []).find((x) => x.status === "complete") || ds?.[0]; if (!d) return [];
  return get(`/draft/${d.draft_id}/picks`).catch(() => []);
}

export async function render(root, m) {
  root.innerHTML = `<h1>Keepers</h1><div class="loading">Working out keeper costs…</div>`;
  const T = m.teamById; const rounds = CONFIG.DRAFT_ROUNDS || m.settings.draft_rounds || 16;
  const hist = await loadHistory(m);
  const picksBySeason = await Promise.all(hist.map((s) => draftPicks(s.id)));
  const cur = picksBySeason[0] || [];
  const ownerByRid = Object.fromEntries(m.teams.map((t) => [t.rosterId, t.ownerId]));
  // all transactions this season
  const wks = Array.from({ length: Math.max(m.liveWeek || 0, m.maxWeek, 1) }, (_, i) => i + 1);
  const tx = (await Promise.all(wks.map((w) => get(`/league/${m.league.league_id}/transactions/${w}`).catch(() => [])))).flat().filter((x) => x.status === "complete").sort((a, b) => a.created - b.created);
  let adp = {}; try { adp = JSON.parse(localStorage.getItem("keepers:adp") || "{}"); } catch {}
  adp = { ...CONFIG.ADP_ROUNDS, ...adp };
  // Consensus ADP (FantasyPros) with per-platform columns; the league rule keys off Sleeper's ADP
  const adpData = await local("data/adp.json"); const AP = adpData?.players || null; const nT = m.numTeams || 12;
  const pickOf = (pid) => (AP?.[pid] ? AP[pid].sleeper ?? AP[pid].avg : null);
  const adpNote = (pid) => { const x = AP?.[pid]; if (!x) return ""; const src = x.sleeper != null ? `Sleeper ADP pick ${x.sleeper}` : `consensus ADP pick ${x.avg} (no Sleeper ADP)`;
    const others = [["consensus", x.sleeper != null ? x.avg : null], ["ESPN", x.espn], ["CBS", x.cbs], ["RTSports", x.rtsports], ["Fantrax", x.fantrax]].filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(", ");
    return `${src}${others ? "; " + others : ""}`; };

  const yearsKept = (pid, ownerId) => { let n = 0; for (let i = 0; i < hist.length; i++) { const p = (picksBySeason[i] || []).find((x) => x.player_id === pid);
      const pOwner = p && (p.picked_by || hist[i].ownerOf(p.roster_id)); if (p && p.is_keeper && pOwner === ownerId) n++; else break; } return n; };
  const origRound = (pid) => { for (let i = 0; i < hist.length; i++) { const p = (picksBySeason[i] || []).find((x) => x.player_id === pid); if (!p) break; if (!p.is_keeper) return p.round; } return null; };

  function costFor(pid, rid) {
    const ownerId = ownerByRid[rid]; const pick = cur.find((x) => x.player_id === pid);
    const lastAdd = [...tx].reverse().find((x) => x.adds && x.adds[pid] === rid);
    const draftedBy = pick ? (pick.picked_by || ownerByRid[pick.roster_id]) : null;
    const how = lastAdd ? lastAdd.type : pick && draftedBy === ownerId ? "drafted" : pick ? "trade" : "waiver";
    const manual = adp[pid] != null; const pk = pickOf(pid);
    const adpR = manual ? Math.ceil(+adp[pid]) : pk != null ? Math.ceil(pk / nT) : null;
    if (CONFIG.SEASON_ENDING_FA[pid] != null) {
      const dr = CONFIG.SEASON_ENDING_FA[pid]; let c = dr >= 10 ? 10 : dr >= 6 ? 7 : 4; let note = `Season-ending-injury FA (drafted R${dr})`;
      if (adpR && adpR > c) { c = Math.ceil(1.5 * adpR); note += `; ADP R${adpR} is later than bracket → 1.5× ADP`; }
      return { ok: true, cost: Math.min(rounds, c), how: "IR pickup", note };
    }
    if (how === "waiver" || how === "free_agent" || !pick) {
      const hw = how === "free_agent" ? "free agent" : "waiver";
      if (!adpR && AP) return { ok: true, cost: rounds, how: hw, note: `Not in the ADP list (undrafted) → last round` };
      if (!adpR) return { ok: null, cost: null, how: hw, note: "Needs Sleeper ADP (2× ADP round)" };
      const c = 2 * adpR; return { ok: true, cost: Math.min(rounds, c), how: hw, note: `2 × ADP round ${adpR}${c > rounds ? " → capped at the last round" : ""} · ${manual ? "ADP entered by hand" : adpNote(pid)}` };
    }
    // drafted or traded-for
    const kept = yearsKept(pid, draftedBy || ownerId);
    const thisYearCost = pick.round; const orig = pick.is_keeper ? origRound(pid) ?? pick.round + kept : pick.round;
    if (!pick.is_keeper && pick.round <= 2) return { ok: false, cost: null, how, note: `Drafted R${pick.round}; 1st & 2nd rounders go back in the pool` };
    if (how === "drafted" && kept >= 2) return { ok: false, cost: null, how: "drafted", note: `Already kept ${kept} years (max 2)` };
    const next = thisYearCost - 1;
    if (how === "trade") return { ok: next >= 1, cost: Math.max(1, next), how: "traded for", note: pick.is_keeper ? `Was a keeper at R${thisYearCost}; previous owner's next cost, clock resets` : `Original draft position R${pick.round}` };
    return { ok: next >= 1, cost: Math.max(1, next), how: "drafted", note: pick.is_keeper ? `Kept ${kept} yr${kept === 1 ? "" : "s"} (orig. R${orig})${kept === 1 ? "; final eligible year" : ""}` : `Drafted R${pick.round}` };
  }

  const nextPicks = futurePicks(m, m.season + 1);
  const data = m.teams.map((t) => ({ t, rows: (t.roster.players || []).map((pid) => ({ pid, pos: pPos(m, pid), ...costFor(pid, t.rosterId) }))
    .filter((r) => !["K", "DEF"].includes(r.pos) || r.ok).sort((a, b) => (b.ok === true) - (a.ok === true) || (a.cost ?? 99) - (b.cost ?? 99)) }));
  let sel = {}; try { sel = JSON.parse(localStorage.getItem("keepers:sel") || "{}"); } catch {}

  root.innerHTML = `<h1>Keepers</h1>
  <div class="card sm"><b>Rules applied:</b> max 2 keepers (3 for the Consolation Bowl winner), never 2 at the same position · cost = 1 round earlier than last year's cost · kept at most 2 seasons · players drafted in rounds 1–2 can't be kept · waiver pickups cost 2× next season's Sleeper ADP · traded players carry their original draft value · season-ending-injury FA pickups use the 4th/7th/10th brackets. Your pick in the cost round is skipped at the draft.
  <p class="note">${adpData ? `ADP comes straight from Sleeper (${adpData.season || ""} drafts, updated ${new Date(adpData.updated).toLocaleDateString()}), the source the rule names. ADP pick ÷ ${nT} teams = round, and the cost is capped at the last round. The rule uses <i>next</i> season's ADP, so these waiver costs are a preview until ${m.season + 1} ADP exists; the nightly update switches over by itself.` : "ADP data hasn't loaded yet, so enter ADP rounds for waiver pickups below (or in config)."} Estimates only. Commissioners have the final say.</p></div>
  <label class="sm"><input type="checkbox" id="cons"> Consolation Bowl winner gets a 3rd keeper:</label> <select id="consT"><option value="">–</option>${m.teams.map((t) => `<option value="${t.rosterId}">${esc(t.name)}</option>`).join("")}</select>
  <div class="grid g2" style="margin-top:12px">${data.map(({ t, rows }) => `<div class="card" data-rid="${t.rosterId}"><div class="row">${team(t)}<span class="sp"></span><span class="sm" id="sum-${t.rosterId}"></span></div>
    ${rows.map((r) => `<div class="plr"><input type="checkbox" data-k="${t.rosterId}" value="${r.pid}" ${r.ok === false ? "disabled" : ""} ${(sel[t.rosterId] || []).includes(r.pid) ? "checked" : ""}>
      <span class="sp">${player(m, r.pid)}<div class="xs mut">${esc(r.how)} · ${esc(r.note)}</div></span>
      ${r.ok === false ? `<span class="pill r">✗</span>` : r.cost ? `<span class="pill ${r.ok ? "g" : ""}">R${r.cost}</span>` : `<input class="adp" data-p="${r.pid}" placeholder="ADP rd" style="width:70px" inputmode="decimal">`}</div>`).join("")}</div>`).join("")}</div>`;

  const update = () => {
    const consT = root.querySelector("#cons").checked ? +root.querySelector("#consT").value : null;
    for (const { t, rows } of data) {
      const picked = [...root.querySelectorAll(`input[data-k="${t.rosterId}"]:checked`)].map((i) => rows.find((r) => r.pid === i.value));
      sel[t.rosterId] = picked.map((r) => r.pid);
      const max = consT === t.rosterId ? 3 : 2; const pos = picked.map((r) => r.pos); const dupe = pos.length !== new Set(pos).size;
      const costs = picked.map((r) => r.cost).filter(Boolean); const dupeRound = costs.length !== new Set(costs).size;
      const own = (nextPicks[t.rosterId] || []).map((p) => p.round); const missing = costs.filter((c) => !own.includes(c));
      const el = root.querySelector(`#sum-${t.rosterId}`);
      el.innerHTML = picked.length ? `${picked.length > max ? `<span class="neg">Max ${max}!</span> ` : ""}${dupe ? `<span class="neg">Same position!</span> ` : ""}${dupeRound ? `<span class="neg">Two keepers cost the same round</span> ` : ""}${missing.length ? `<span class="gold">Doesn't own R${missing.join(", R")} pick</span> ` : ""}Skips ${costs.map((c) => "R" + c).join(", ") || "–"}` : "";
    }
    try { localStorage.setItem("keepers:sel", JSON.stringify(sel)); } catch {}
  };
  root.querySelectorAll("input[type=checkbox], #consT").forEach((i) => (i.onchange = update));
  root.querySelectorAll("input.adp").forEach((i) => (i.onchange = () => { adp[i.dataset.p] = +i.value; try { localStorage.setItem("keepers:adp", JSON.stringify(adp)); } catch {} render(root, m); }));
  update();
}
