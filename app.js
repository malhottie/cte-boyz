import { loadModel } from "./data.js";
import { isMock } from "./api.js";
import { esc } from "./ui.js";

const PAGES = {
  home: () => import("./pages/home.js"), standings: () => import("./pages/standings.js"),
  teams: () => import("./pages/teams.js"), team: () => import("./pages/team.js"),
  chances: () => import("./pages/chances.js"), challenges: () => import("./pages/challenges.js"),
  trade: () => import("./pages/trade.js"), keepers: () => import("./pages/keepers.js"),
  records: () => import("./pages/records.js"), dues: () => import("./pages/dues.js"),
  draft: () => import("./pages/draft.js"), rules: () => import("./pages/rules.js"),
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
