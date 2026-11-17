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
export function av(t, cls = "") {
  const src = headshotFor(t) || t.avatar;
  return src ? `<img class="av ${cls}" src="${esc(src)}" alt="" onerror="this.outerHTML='<span class=&quot;av ${cls}&quot;>${esc(initials(t.owner))}</span>'">`
    : `<span class="av ${cls}">${esc(initials(t.owner))}</span>`;
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
