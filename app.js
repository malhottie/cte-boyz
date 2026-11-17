import { loadModel } from "./data.js";
import { isMock } from "./api.js";
import { esc } from "./ui.js";

const PAGES = {
  home: () => import("./page_home.js"), standings: () => import("./page_standings.js"),
  teams: () => import("./page_teams.js"), team: () => import("./page_team.js"),
  chances: () => import("./page_chances.js"), challenges: () => import("./page_challenges.js"),
  trade: () => import("./page_trade.js"), keepers: () => import("./page_keepers.js"),
  records: () => import("./page_records.js"), dues: () => import("./page_dues.js"),
  draft: () => import("./page_draft.js"), rules: () => import("./page_rules.js"),
};

const app = document.getElementById("app");
document.getElementById("menu-btn").onclick = () => document.getElementById("nav").classList.toggle("open");
if (isMock()) document.getElementById("demo-banner").hidden = false;

async function route() {
  const hash = location.hash.slice(1) || "home";
  const [page, ...rest] = hash.split("-");
  const key = PAGES[page] ? page : "home";
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + (key === "team" ? "teams" : key)));
  document.getElementById("nav").classList.remove("open");
  app.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    const m = await loadModel();
    document.getElementById("league-name").textContent = m.name;
    document.title = `${m.name} · League HQ`;
    const mod = await PAGES[key]();
    await mod.render(app, m, rest.join("-"));
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="err"><b>Couldn't load the league.</b><br>${esc(e.message)}<br><span class="sm mut">Check LEAGUE_ID in js/config.js.</span></div>`;
  }
}
addEventListener("hashchange", route);
route();
