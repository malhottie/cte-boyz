import { RULES_TEXT } from "../rules_text.js";
import { CHALLENGES } from "../challenges.js";
import { esc } from "../ui.js";

export async function render(root, m) {
  const paras = RULES_TEXT.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const isHead = (p) => /^(\d+\.\s|ABSENTEE|QB KNEEL|Playoffs$|Drafting\/Picks$)/.test(p);
  const html = paras.map((p) => {
    const [first, ...rest] = p.split("\n");
    if (isHead(first)) { const m2 = first.match(/^(QB KNEEL RULE:)(.*)$/); if (m2) return `<h3>${esc(m2[1])}</h3><p>${esc(m2[2])}</p>`;
      return `<h3>${esc(first)}</h3>${rest.map((r) => `<p>${esc(r)}</p>`).join("")}`; }
    return p.split("\n").map((r) => `<p>${esc(r)}</p>`).join("");
  }).join("");
  root.innerHTML = `<h1>Rules</h1>
  <div class="card"><h2>Weekly challenges</h2>${CHALLENGES.map((c) => `<div class="row sm" style="padding:4px 0;flex-wrap:nowrap"><span class="pill" style="width:48px;text-align:center">W${c.week}</span><span><b>${esc(c.name)}</b> <span class="mut">${esc(c.desc)}</span></span></div>`).join("")}</div>
  <div class="card"><h2>Constitution</h2><div class="sm" style="line-height:1.6">${html}</div></div>`;
}
