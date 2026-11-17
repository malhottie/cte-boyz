// Trade Analyzer: values players from production, trend, usage, efficiency and expert consensus.
import { loadStats, fantasyPoints, pPos, pName, pFp, mean, sd, slotEligible } from "../data.js";
import { local } from "../api.js";
import { CONFIG } from "../config.js";
import { team, esc, f1, f2, pct, sign, player, table } from "../ui.js";

const POS = ["QB", "RB", "WR", "TE"];
const norm = (s) => String(s || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
let cacheMetrics = null;

async function buildMetrics(m, onProgress) {
  if (cacheMetrics) return cacheMetrics;
  const weeks = m.completedReg.length ? m.completedWeeks : [];
  let done = 0;
  const stats = await Promise.all(weeks.map((w) => loadStats(m.season, w).then((s) => { onProgress?.(++done, weeks.length); return s; })));
  const [adv, ecr] = await Promise.all([local("data/advanced.json"), local("data/ecr.json")]);
  let manual = {}; try { manual = JSON.parse(localStorage.getItem("trade:manual") || "{}"); } catch {}
  const fileManual = await local("data/manual_grades.json"); if (fileManual) manual = { ...fileManual, ...manual };

  const P = {};
  stats.forEach((wk, wi) => { for (const [pid, s] of Object.entries(wk || {})) {
    const pos = pPos(m, pid); if (!POS.includes(pos) || !s.gp) continue;
    const x = (P[pid] ||= { pid, pos, games: [], tgt: 0, rec: 0, recYd: 0, snaps: 0, tmSnaps: 0, pa: 0, pc: 0, py: 0, ptd: 0, pint: 0, ry: 0, ra: 0 });
    x.games.push({ w: weeks[wi], pts: fantasyPoints(m, s) });
    x.tgt += s.rec_tgt || 0; x.rec += s.rec || 0; x.recYd += s.rec_yd || 0; x.snaps += s.off_snp || 0; x.tmSnaps += s.tm_off_snp || 0;
    x.pa += s.pass_att || 0; x.pc += s.pass_cmp || 0; x.py += s.pass_yd || 0; x.ptd += s.pass_td || 0; x.pint += s.pass_int || 0; x.ry += s.rush_yd || 0; x.ra += s.rush_att || 0;
  } });
  const ecrByPid = ecr?.players || {};
  for (const x of Object.values(P)) {
    const g = x.games.length; const pts = x.games.map((y) => y.pts);
    x.gp = g; x.ppg = mean(pts); x.last = mean(pts.slice(-CONFIG.TREND_GAMES)); x.trend = x.last - x.ppg; x.consist = sd(pts);
    x.tpg = x.tgt / g; x.snapPct = x.tmSnaps ? x.snaps / x.tmSnaps : null;
    if (x.pos === "QB") { x.ypa = x.pa ? x.py / x.pa : null; x.tdPct = x.pa ? x.ptd / x.pa : null; x.intPct = x.pa ? x.pint / x.pa : null; x.cmpPct = x.pa ? x.pc / x.pa : null; x.pypg = x.py / g; }
    const a = adv?.players?.[x.pid] || {};
    x.epa = a.epa_per_play ?? null; x.yptpa = a.yptpa ?? null; x.cpoe = a.cpoe ?? null; x.adot = a.adot ?? null;
    const mm = manual[x.pid] || manual[norm(pName(m, x.pid))] || {};
    x.pff = mm.pff ?? null; x.yprr = mm.yprr ?? null;
    x.ecr = ecrByPid[x.pid]?.rank ?? null; x.ecrPos = ecrByPid[x.pid]?.pos_rank ?? null;
  }
  // Positional pools, z-scores, ECR-implied PPG, replacement level
  const teamsN = m.numTeams; const slots = m.starterSlots;
  const need = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const s of slots) { if (need[s] != null) need[s] += teamsN; if (s === "FLEX") { need.RB += 0.45 * teamsN; need.WR += 0.45 * teamsN; need.TE += 0.1 * teamsN; }
    if (s === "SUPER_FLEX") need.QB += 0.8 * teamsN, need.RB += 0.1 * teamsN, need.WR += 0.1 * teamsN; if (s === "WRRB_FLEX") need.RB += 0.5 * teamsN, need.WR += 0.5 * teamsN; if (s === "REC_FLEX") need.WR += 0.75 * teamsN, need.TE += 0.25 * teamsN; }
  const repl = {}; const pools = {};
  for (const pos of POS) {
    const pool = Object.values(P).filter((x) => x.pos === pos && x.gp >= Math.min(2, weeks.length)).sort((a, b) => b.ppg - a.ppg);
    pools[pos] = pool; const n = Math.round(need[pos]) || teamsN;
    repl[pos] = pool[n]?.ppg ?? pool.at(-1)?.ppg ?? 0;
    const rel = pool.slice(0, Math.max(n * 2, 10));
    const z = (k, inv = false) => { const v = rel.map((x) => x[k]).filter((y) => y != null); const mu = mean(v), s = sd(v) || 1;
      for (const x of pool) x["z_" + k] = x[k] == null ? null : ((inv ? -1 : 1) * (x[k] - mu)) / s; };
    ["ppg", "trend", "tpg", "epa", "yptpa", "yprr", "pff", "ypa", "tdPct", "cpoe"].forEach((k) => z(k)); z("intPct", true);
    // ECR → implied PPG: the PPG of the player at that positional rank
    const byEcr = pool.filter((x) => x.ecr != null).sort((a, b) => a.ecr - b.ecr);
    byEcr.forEach((x, i) => (x.ecrPpg = pool[i]?.ppg ?? x.ppg));
  }
  for (const x of Object.values(P)) {
    const parts = [[0.55, x.ppg], [0.2, x.last], [0.25, x.ecrPpg]].filter(([, v]) => v != null && !isNaN(v));
    const wsum = parts.reduce((s, [w]) => s + w, 0); x.proj = parts.reduce((s, [w, v]) => s + w * v, 0) / (wsum || 1);
    const eff = x.pos === "QB" ? [x.z_epa, x.z_cpoe, x.z_pff, mean([x.z_ypa, x.z_tdPct, x.z_intPct].filter((v) => v != null))] : [x.z_tpg, x.z_yprr ?? x.z_yptpa, x.z_epa, x.z_pff];
    const ev = eff.filter((v) => v != null && !isNaN(v)); x.effZ = ev.length ? Math.max(-2, Math.min(2, mean(ev))) : 0;
    x.adj = x.proj * (1 + 0.05 * x.effZ);
    const d = x.adj - (repl[x.pos] || 0); x.vor = d > 8 ? d : Math.log1p(Math.exp(0.6 * d)) / 0.6; // smooth floor: bench depth keeps a little value
  }
  const top = Math.max(...Object.values(P).map((x) => x.vor), 1);
  for (const x of Object.values(P)) { x.value = Math.round((100 * x.vor) / top * 10) / 10; x.posRank = pools[x.pos].indexOf(x) + 1; }
  cacheMetrics = { P, repl, adv, ecr, hasManual: Object.keys(manual).length > 0 };
  return cacheMetrics;
}

// Best lineup by adjusted PPG from a set of players
function lineupValue(m, ids, P) {
  const pool = ids.map((pid) => ({ pid, v: P[pid]?.adj ?? 0, fp: pFp(m, pid) }));
  const sl = m.starterSlots.filter((s) => !["K", "DEF"].includes(s)).map((s) => ({ s, el: slotEligible(s) })).sort((a, b) => a.el.length - b.el.length);
  const used = new Set(); let t = 0;
  for (const s of sl) { const b = pool.filter((p) => !used.has(p.pid) && p.fp.some((f) => s.el.includes(f))).sort((a, b) => b.v - a.v)[0]; if (b) { used.add(b.pid); t += b.v; } }
  return t;
}

export async function render(root, m) {
  root.innerHTML = `<h1>Trade Analyzer</h1><div class="loading" id="ld">Loading weekly stats…</div>`;
  const { P, repl, adv, ecr, hasManual } = await buildMetrics(m, (a, b) => { const el = document.getElementById("ld"); if (el) el.textContent = `Loading weekly stats… ${a}/${b}`; });
  const T = m.teamById; const ownerOf = {}; for (const t of m.teams) for (const p of t.roster.players || []) ownerOf[p] = t.rosterId;
  const st = { a: m.standings[0]?.rid, b: m.standings[1]?.rid, give: [], get: [] };

  root.innerHTML = `<h1>Trade Analyzer</h1>
  <p class="sm mut">Pick two teams and tap players to add them to the deal. Values use this season's production under your league's scoring.</p>
  <div class="grid g2">
    <div class="card side"><select id="ta" style="width:100%">${m.teams.map((t) => `<option value="${t.rosterId}">${esc(t.name)}</option>`).join("")}</select>
      <div class="xs mut" style="margin:8px 0 2px">SENDS</div><div id="ga"></div><div class="xs mut" style="margin:8px 0 2px">TAP TO ADD</div><div id="ra"></div></div>
    <div class="card side"><select id="tb" style="width:100%">${m.teams.map((t) => `<option value="${t.rosterId}">${esc(t.name)}</option>`).join("")}</select>
      <div class="xs mut" style="margin:8px 0 2px">SENDS</div><div id="gb"></div><div class="xs mut" style="margin:8px 0 2px">TAP TO ADD</div><div id="rb"></div></div>
  </div>
  <div id="verdict"></div>
  <div class="card"><details><summary>How values are calculated</summary><div class="sm" style="margin-top:8px;line-height:1.6">
    <b>1. Projected points per game</b> = 55% season PPG + 20% last-${CONFIG.TREND_GAMES}-game average (trend) + 25% expert-consensus-implied PPG (the PPG of the player at that ECR positional rank).<br>
    <b>2. Efficiency adjustment</b>: average z-score within position of targets/game, YPRR (or yards per team pass attempt if no YPRR loaded), EPA/play, PFF grade, and for QBs passing efficiency (Y/A, TD%, INT%) and CPOE. Clamped to ±2 SD and worth up to ±10%.<br>
    <b>3. Value over replacement</b>: adjusted PPG minus the PPG of the first non-starter at that position (replacement: QB ${f1(repl.QB)}, RB ${f1(repl.RB)}, WR ${f1(repl.WR)}, TE ${f1(repl.TE)}), scaled so the league's most valuable player = 100.<br>
    <b>4. Lineup impact</b>: each team's best possible starting lineup (by adjusted PPG) before and after the trade. Depth that won't start adds little.<br>
    <span class="mut">Sources: weekly stats from Sleeper; EPA/CPOE/yards per team attempt from nflverse ${adv ? `(updated ${new Date(adv.updated).toLocaleDateString()})` : "<b class='neg'>(not loaded: run the data workflow)</b>"}; ECR from FantasyPros ${ecr ? `(${new Date(ecr.updated).toLocaleDateString()})` : "<b class='neg'>(not loaded)</b>"}. PFF grades and true YPRR are subscription-only; there's no free, consistent feed, so upload them below if you have them.</span></div></details>
    <details style="margin-top:8px"><summary>Upload PFF grades / YPRR (CSV)</summary><p class="sm mut">CSV with a header row containing <code>name</code> (or <code>sleeper_id</code>) plus <code>pff</code> and/or <code>yprr</code>. Saved in this browser. ${hasManual ? `<span class="pos">Manual grades loaded.</span>` : ""}</p><input type="file" id="csv" accept=".csv,text/csv"></details></div>
  <div class="card"><h3>Player values</h3><div class="tabs" id="pt">${POS.map((p, i) => `<button class="${i === 0 ? "on" : ""}" data-p="${p}">${p}</button>`).join("")}</div><div id="ptbl"></div></div>`;

  const ta = root.querySelector("#ta"), tb = root.querySelector("#tb");
  ta.value = st.a; tb.value = st.b;
  const chipsFor = (rid, side) => (T[rid].roster.players || []).filter((p) => !st.give.includes(p) && !st.get.includes(p))
    .sort((x, y) => (P[y]?.value ?? -1) - (P[x]?.value ?? -1))
    .map((p) => `<span class="chip" data-add="${p}" data-s="${side}" style="cursor:pointer">${esc(pName(m, p))} <span class="xs pos${pPos(m, p)}">${pPos(m, p)}</span> <b class="xs">${P[p] ? f1(P[p].value) : "–"}</b></span>`).join("");
  const sel = (arr, side) => arr.map((p) => `<span class="chip">${esc(pName(m, p))} <b class="xs">${P[p] ? f1(P[p].value) : "–"}</b><button data-rm="${p}" data-s="${side}">×</button></span>`).join("") || `<span class="mut sm">nothing yet</span>`;

  function draw() {
    root.querySelector("#ga").innerHTML = sel(st.give, "a"); root.querySelector("#gb").innerHTML = sel(st.get, "b");
    root.querySelector("#ra").innerHTML = chipsFor(st.a, "a"); root.querySelector("#rb").innerHTML = chipsFor(st.b, "b");
    root.querySelectorAll("[data-add]").forEach((e) => (e.onclick = () => { (e.dataset.s === "a" ? st.give : st.get).push(e.dataset.add); draw(); }));
    root.querySelectorAll("[data-rm]").forEach((e) => (e.onclick = () => { const arr = e.dataset.s === "a" ? st.give : st.get; arr.splice(arr.indexOf(e.dataset.rm), 1); draw(); }));
    verdict();
  }
  function verdict() {
    const v = root.querySelector("#verdict");
    if (!st.give.length && !st.get.length) { v.innerHTML = ""; return; }
    const sum = (arr) => arr.reduce((s, p) => s + (P[p]?.value || 0), 0);
    const va = sum(st.give), vb = sum(st.get);
    const rosA = T[st.a].roster.players || [], rosB = T[st.b].roster.players || [];
    const afterA = rosA.filter((p) => !st.give.includes(p)).concat(st.get), afterB = rosB.filter((p) => !st.get.includes(p)).concat(st.give);
    const dA = lineupValue(m, afterA, P) - lineupValue(m, rosA, P), dB = lineupValue(m, afterB, P) - lineupValue(m, rosB, P);
    const diff = vb - va; const tot = Math.max(va, vb, 1); const gap = Math.abs(diff) / tot;
    const winner = gap < 0.1 ? null : diff > 0 ? st.a : st.b;
    const row = (p) => { const x = P[p]; return x ? x : { pid: p, pos: pPos(m, p) }; };
    v.innerHTML = `<div class="card" style="border-color:${winner ? "var(--warn)" : "var(--acc)"}">
      <h2 style="margin-top:0">${winner ? `Edge: ${esc(T[winner].name)}` : "Fair trade ✅"}</h2>
      <div class="row sm"><span>${esc(T[st.a].name)} gets <b>${f1(vb)}</b> value</span><span class="sp"></span><span>${esc(T[st.b].name)} gets <b>${f1(va)}</b> value</span></div>
      <div class="meter" style="margin:8px 0"><i style="left:0;width:${(vb / (va + vb || 1)) * 100}%"></i></div>
      <div class="grid g2" style="margin-top:8px">
        <div class="stat"><div class="k">${esc(T[st.a].name)} lineup impact</div><div class="v ${dA >= 0 ? "pos" : "neg"}">${sign(dA)} <span class="sm">pts/wk</span></div></div>
        <div class="stat"><div class="k">${esc(T[st.b].name)} lineup impact</div><div class="v ${dB >= 0 ? "pos" : "neg"}">${sign(dB)} <span class="sm">pts/wk</span></div></div></div>
      <p class="sm" style="margin-top:10px">${gap < 0.1 ? "Values are within 10% of each other." : `${esc(T[winner].name)} comes out ${pct(gap)} ahead on raw value.`} ${dA > 0 && dB > 0 ? "Both starting lineups improve, a classic win-win (depth for need)." : dA < 0 && dB < 0 ? "Both starting lineups get worse on paper." : ""}</p>
      ${table([{ label: "Goes to", f: (x) => `<b>${esc(T[x._to].owner)}</b>` }, ...cols(m)], [...st.give.map((p) => ({ ...row(p), _to: st.b })), ...st.get.map((p) => ({ ...row(p), _to: st.a }))], { sortable: false })}
      <p class="note">${m.season >= m.state.season && m.liveWeek > (m.settings.trade_deadline || 13) ? "⚠️ Past the week-13 trade deadline. " : ""}Remember: per league rules, traded players keep their original draft-round keeper value.</p></div>`;
  }
  ta.onchange = () => { st.a = +ta.value; st.give = []; draw(); }; tb.onchange = () => { st.b = +tb.value; st.get = []; draw(); };
  draw();
  const posTable = (pos) => { root.querySelector("#ptbl").innerHTML = table(cols(m, true), Object.values(P).filter((x) => x.pos === pos && x.gp >= 1).sort((a, b) => b.value - a.value).slice(0, 60)); };
  root.querySelectorAll("#pt button").forEach((b) => (b.onclick = () => { root.querySelectorAll("#pt button").forEach((x) => x.classList.toggle("on", x === b)); posTable(b.dataset.p); }));
  posTable("QB");
  function cols(m, withOwner) { return [
    { label: "Player", f: (x) => player(m, x.pid), s: (x) => pName(m, x.pid) },
    ...(withOwner ? [{ label: "Owner", f: (x) => (ownerOf[x.pid] ? esc(T[ownerOf[x.pid]].owner) : `<span class="mut">FA</span>`), s: (x) => (ownerOf[x.pid] ? T[ownerOf[x.pid]].owner : "zz") }] : []),
    { label: "Value", n: 1, f: (x) => `<b>${f1(x.value)}</b>`, s: (x) => x.value },
    { label: "PPG", n: 1, f: (x) => f1(x.ppg), s: (x) => x.ppg },
    { label: `L${CONFIG.TREND_GAMES}`, n: 1, tip: "Last 3 games avg", f: (x) => x.last == null ? "–" : `${f1(x.last)} <span class="xs ${x.trend >= 0 ? "pos" : "neg"}">${x.trend >= 0 ? "▲" : "▼"}</span>`, s: (x) => x.trend },
    { label: "Tgt/G", n: 1, f: (x) => (x.pos === "QB" ? "–" : f1(x.tpg)), s: (x) => x.tpg },
    { label: "Snap%", n: 1, f: (x) => pct(x.snapPct), s: (x) => x.snapPct },
    { label: "YPRR", n: 1, tip: "Uploaded YPRR; otherwise yards per team pass attempt (YPTPA) in grey", f: (x) => (x.yprr != null ? f2(x.yprr) : x.yptpa != null ? `<span class="mut">${f2(x.yptpa)}*</span>` : "–"), s: (x) => x.yprr ?? x.yptpa },
    { label: "EPA/play", n: 1, f: (x) => (x.epa == null ? "–" : f2(x.epa)), s: (x) => x.epa },
    { label: "Pass", tip: "QB: Y/A · TD% · INT% · CPOE", f: (x) => (x.pos === "QB" && x.pa ? `${f1(x.ypa)} Y/A · ${pct(x.tdPct, 1)} TD · ${pct(x.intPct, 1)} INT${x.cpoe != null ? ` · ${sign(x.cpoe)} CPOE` : ""}` : "–"), s: (x) => x.ypa },
    { label: "PFF", n: 1, f: (x) => (x.pff == null ? "–" : f1(x.pff)), s: (x) => x.pff },
    { label: "ECR", n: 1, tip: "FantasyPros expert consensus overall rank", f: (x) => x.ecr ?? "–", s: (x) => -(x.ecr ?? 999) },
    { label: "Pos Rk", n: 1, f: (x) => (x.posRank ? x.pos + x.posRank : "–"), s: (x) => -(x.posRank || 999) },
  ]; }
  root.querySelector("#csv").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return; const lines = (await f.text()).trim().split(/\r?\n/); const hdr = lines[0].toLowerCase().split(",").map((s) => s.trim());
    const ix = (k) => hdr.findIndex((h) => h.includes(k)); const iN = ix("name"), iId = ix("sleeper"), iP = ix("pff"), iY = ix("yprr");
    const out = {}; for (const ln of lines.slice(1)) { const c = ln.split(",").map((s) => s.trim().replace(/^"|"$/g, "")); const key = iId >= 0 && c[iId] ? c[iId] : norm(c[iN]);
      out[key] = { pff: iP >= 0 && c[iP] ? +c[iP] : null, yprr: iY >= 0 && c[iY] ? +c[iY] : null }; }
    try { localStorage.setItem("trade:manual", JSON.stringify(out)); } catch {}
    cacheMetrics = null; render(root, m);
  };
}
