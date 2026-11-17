import { CONFIG } from "./config.js";
import { playerImg } from "./api.js";
import { pName, pPos } from "./data.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const f1 = (x) => (x == null || isNaN(x) ? "–" : (+x).toFixed(1));
export const f2 = (x) => (x == null || isNaN(x) ? "–" : (+x).toFixed(2));
export const pct = (x, d = 0) => (x == null || isNaN(x) ? "–" : (x * 100).toFixed(d) + "%");
export const sign = (x, d = 1) => (x > 0 ? "+" : "") + (+x).toFixed(d);
export const rec = (r) => `${r.w}-${r.l}${r.t ? "-" + r.t : ""}`;
export const ord = (n) => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th");

const initials = (s) => (s || "?").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
export function headshotFor(t) {
  let up = null; try { up = localStorage.getItem("headshot:" + t.ownerId); } catch {}
  return up || CONFIG.HEADSHOTS[t.username] || CONFIG.HEADSHOTS[t.owner] || null;
}
let crownOwner = null; const CROWN_KEY = "crown:" + CONFIG.LEAGUE_ID;
try { if (!CONFIG.MOCK) crownOwner = localStorage.getItem(CROWN_KEY); } catch {}
// The all-time standings leader wears a crown on every avatar
export function setCrown(ownerId) {
  crownOwner = ownerId || null; try { if (!CONFIG.MOCK && ownerId) localStorage.setItem(CROWN_KEY, ownerId); } catch {}
  document.querySelectorAll(".avw").forEach((el) => el.classList.toggle("crown", !!ownerId && el.dataset.o === String(ownerId)));
}
export function av(t, cls = "") {
  const src = headshotFor(t) || t.avatar;
  const inner = src ? `<img class="av ${cls}" src="${esc(src)}" alt="" onerror="this.outerHTML='<span class=&quot;av ${cls}&quot;>${esc(initials(t.owner))}</span>'">`
    : `<span class="av ${cls}">${esc(initials(t.owner))}</span>`;
  return `<i class="avw ${cls} ${crownOwner && String(t.ownerId) === String(crownOwner) ? "crown" : ""}" data-o="${esc(t.ownerId ?? "")}">${inner}</i>`;
}
// Win-chance bar with each side labelled and colour-keyed
// Tug-of-war win bar: the fill starts at the centre and grows toward the favourite.
// A 100% favourite fills its whole half; a coin flip shows no fill. The colour is fixed to the
// track (red at the centre, orange, warm yellow at the ends), so a bigger edge reveals more yellow.
export function winBar(nameA, nameB, p, mid = "") {
  const edge = Math.abs(p - 0.5) * 100; // % of the full track (max 50 = one whole half)
  const left = p > 0.5 ? edge : 0, right = p < 0.5 ? edge : 0;
  const favA = p > 0.5, favB = p < 0.5;
  const side = (name, q, fav, alignEnd) => `<span class="row" style="gap:5px;flex-wrap:nowrap;min-width:0;${alignEnd ? "justify-content:flex-end" : ""}">${alignEnd ? "" : `<b class="${fav ? "wb-fav" : "mut"}">${pct(q)}</b>`}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${fav ? "font-weight:700" : ""}" class="${fav ? "" : "mut"}">${esc(name)}</span>${alignEnd ? `<b class="${fav ? "wb-fav" : "mut"}">${pct(q)}</b>` : ""}</span>`;
  return `<div class="wbar" title="${esc(nameA)} ${pct(p)} · ${esc(nameB)} ${pct(1 - p)}">
      <i class="wb-cover" style="left:0;right:${50 + left}%"></i><i class="wb-cover" style="left:${50 + right}%;right:0"></i><i class="wb-mid"></i></div>
    <div class="row xs" style="justify-content:space-between;margin-top:4px;flex-wrap:nowrap;gap:6px">
      ${side(nameA, p, favA, false)}
      ${mid ? `<span class="mut" style="white-space:nowrap">${mid}</span>` : ""}
      ${side(nameB, 1 - p, favB, true)}</div>`;
}
export const team = (t, sub = true) => t ? `<a class="tm" href="#team-${t.rosterId}">${av(t)}<span style="min-width:0"><b>${esc(t.name)}</b>${sub ? `<div class="xs mut">${esc(t.owner)}</div>` : ""}</span></a>` : "–";
export const teamName = (t) => (t ? esc(t.name) : "–");
export const player = (m, pid, extra = "") => {
  const pos = pPos(m, pid);
  return `<span class="row" style="gap:8px;flex-wrap:nowrap"><img src="${playerImg(pid, pos)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;background:var(--bg2)" onerror="this.style.visibility='hidden'"><span><b>${esc(pName(m, pid))}</b> <span class="xs pos${pos}">${pos}</span> <span class="xs mut">${esc(m.players[pid]?.t || "")}</span>${extra}</span></span>`;
};
export function table(cols, rows, { id = "", cls = "", sortable = true } = {}) {
  // cols: [{k,label,n:numeric, f:(row)=>html, s:(row)=>sortValue}]
  const tid = id || "t" + Math.random().toString(36).slice(2, 8);
  const html = `<div class="tbl-wrap"><table id="${tid}" class="${cls}"><thead><tr>${cols.map((c, i) => `<th class="${c.n ? "n" : ""} ${sortable && c.s !== false ? "sort" : ""}" data-i="${i}" title="${esc(c.tip || "")}">${c.label}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r) => `<tr class="${r._cls || ""}">${cols.map((c) => `<td class="${c.n ? "n" : ""}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  if (sortable) setTimeout(() => {
    const el = document.getElementById(tid); if (!el) return;
    el.querySelectorAll("th.sort").forEach((th) => th.onclick = () => {
      const c = cols[+th.dataset.i]; const dir = th.dataset.d === "1" ? -1 : 1; th.dataset.d = dir === 1 ? "1" : "0";
      const val = c.s || ((r) => r[c.k]);
      const sorted = [...rows].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "string" ? x.localeCompare(y) : (y ?? -1e9) - (x ?? -1e9)) * dir; });
      el.tBodies[0].innerHTML = sorted.map((r) => `<tr>${cols.map((c) => `<td class="${c.n ? "n" : ""}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join("")}</tr>`).join("");
    });
  });
  return html;
}
export function heatColor(v, lo = 0, hi = 1) {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
  const a = [255, 92, 122], b = [46, 230, 166]; const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return `rgba(${c.join(",")},.28)`;
}
export function chart(canvasId, cfg) {
  setTimeout(() => {
    const el = document.getElementById(canvasId); if (!el || !window.Chart) return;
    Chart.defaults.color = "#8e9ab3"; Chart.defaults.borderColor = "#2a3550"; Chart.defaults.font.family = "Inter";
    cfg.options = { maintainAspectRatio: false, responsive: true, ...(cfg.options || {}) }; new Chart(el, cfg);
  });
}
export const weekSelect = (id, weeks, cur, label = "Week") =>
  `<select id="${id}">${weeks.map((w) => `<option value="${w}" ${w === cur ? "selected" : ""}>${label} ${w}</option>`).join("")}</select>`;
