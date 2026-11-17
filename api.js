// Thin Sleeper API client with in-memory + localStorage caching.
import { CONFIG } from "./config.js";

const BASE = "https://api.sleeper.app/v1";
const mem = new Map();
export const isMock = () => CONFIG.MOCK || !CONFIG.LEAGUE_ID || CONFIG.LEAGUE_ID.startsWith("PASTE");
let mockApi = null;

function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota, ignore */ } }

/**
 * get("/league/123/rosters", { persist: true })
 * persist: store in localStorage forever (use only for finished seasons / immutable data)
 * ttl: seconds to keep a localStorage copy (for slow-changing data)
 */
export async function get(path, { persist = false, ttl = 0 } = {}) {
  if (mem.has(path)) return mem.get(path);
  const p = (async () => {
    if (isMock()) {
      if (!mockApi) mockApi = await import("./mock.js");
      return mockApi.mockGet(path);
    }
    const key = "slp:" + path;
    if (persist || ttl) {
      const c = lsGet(key);
      if (c && (persist || Date.now() - c.t < ttl * 1000)) return c.d;
    }
    const url = path.startsWith("http") ? path : BASE + path;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Sleeper ${r.status} on ${path}`);
    const d = await r.json();
    if (persist || ttl) lsSet(key, { t: Date.now(), d });
    return d;
  })();
  mem.set(path, p);
  p.catch(() => mem.delete(path));
  return p;
}

// Local JSON produced by the GitHub Action (players, advanced stats, ECR). Missing files → null.
export async function local(file) {
  const key = "local:" + file;
  if (mem.has(key)) return mem.get(key);
  const p = (async () => {
    if (isMock()) {
      if (!mockApi) mockApi = await import("./mock.js");
      return mockApi.mockLocal(file);
    }
    try { const r = await fetch(file, { cache: "no-cache" }); return r.ok ? r.json() : null; } catch { return null; }
  })();
  mem.set(key, p);
  return p;
}

export const avatarUrl = (id, thumb = true) =>
  !id ? null : id.startsWith("http") ? id : `https://sleepercdn.com/avatars/${thumb ? "thumbs/" : ""}${id}`;
export const playerImg = (pid, pos) =>
  pos === "DEF" ? `https://sleepercdn.com/images/team_logos/nfl/${pid.toLowerCase()}.png`
                : `https://sleepercdn.com/content/nfl/players/thumb/${pid}.jpg`;
