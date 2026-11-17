// Draft Day: a 100-yard dash where every owner's bobblehead races for draft position.
import { headshotFor, esc, av } from "./ui.js";

const COLORS = ["#00f0ff", "#ff2e88", "#f5c542", "#39ff88", "#b26bff", "#ff7a2e", "#3fb6ff", "#ff4f6d", "#c8ff3f", "#ff5ce1", "#2effd5", "#ffd02e", "#8c9bff", "#ff9a3f"];
function rng(seed) { let a = parseInt(seed, 16) >>> 0 || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const newSeed = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0].toString(16).padStart(8, "0"); };
const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

export async function render(root, m) {
  const teams = [...m.teams];
  let last = null; try { last = JSON.parse(localStorage.getItem("draftRace:last")); } catch {}
  root.innerHTML = `<h1>Draft Day</h1>
  <p class="mut sm">Every owner's bobblehead lines up on the goal line. First to the far end zone gets the earliest pick (or flip it below). The race is driven by a random seed, so anyone can replay the exact same race to verify it.</p>
  <div class="card"><div class="row">
    <label class="sm">Order: <select id="mode"><option value="fwd">1st across = pick 1</option><option value="rev">Last across = pick 1</option></select></label>
    <label class="sm">Seed: <input id="seed" value="${newSeed()}" style="width:110px"></label>
    <button class="btn" id="reseed">🎲 New seed</button><span class="sp"></span>
    <button class="btn pri" id="go">🏈 Hike!</button></div></div>
  <div class="ticker" id="tick"></div>
  <canvas id="race"></canvas>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>Draft order</h3><ol class="res" id="res">${last ? last.order.map((x) => `<li>${esc(x)}</li>`).join("") : `<li class="mut">Run the race!</li>`}</ol>
      <div class="xs mut" id="resmeta">${last ? `Last race: seed ${last.seed}, ${new Date(last.at).toLocaleString()}` : ""}</div>
      <button class="btn" id="copy" style="margin-top:8px">Copy results</button></div>
    <div class="card"><h3>Bobblehead photos</h3><p class="sm mut">Upload a face pic for each owner (cropped to a circle; saved in this browser). For everyone, add photos to <code>/headshots</code> and list them in <code>config.js</code>.</p>
      ${teams.map((t) => `<div class="row" style="margin:6px 0">${av(t)}<span class="sp sm">${esc(t.owner)}</span><label class="btn" style="font-size:12px">Upload<input type="file" accept="image/*" data-o="${t.ownerId}" hidden></label></div>`).join("")}</div></div>`;

  const cv = document.getElementById("race"), ctx = cv.getContext("2d");
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = cv.clientWidth, laneH = Math.max(34, Math.min(56, 600 / teams.length)), TOP = Math.round(laneH * 0.4), H = teams.length * laneH + 30 + TOP;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px"; ctx.scale(dpr, dpr);
  const EZ = Math.max(26, W * 0.07); const start = EZ, goal = W - EZ;
  try { await Promise.all([document.fonts.load("700 20px Rajdhani"), document.fonts.load("500 11px \"JetBrains Mono\"")]); } catch {}
  let imgs = await Promise.all(teams.map((t) => loadImg(headshotFor(t) || t.avatar)));
  let runners = [], running = false, raf = 0;

  const reset = () => { runners = teams.map((t, i) => ({ t, i, x: 0, v: 0, done: null, state: "", stateT: 0, phase: Math.random() * 6, color: COLORS[i % COLORS.length] })); };
  reset();
  // Neon field: dark turf, glowing yard lines, cyan home end zone, magenta "DRAFT DAY" end zone
  function field() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#051410"); g.addColorStop(1, "#030b0a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 10; k++) if (k % 2) { ctx.fillStyle = "rgba(57,255,136,.025)"; ctx.fillRect(start + (goal - start) * k / 10, 0, (goal - start) / 10, H); }
    const ezL = ctx.createLinearGradient(0, 0, EZ, 0); ezL.addColorStop(0, "rgba(0,240,255,.28)"); ezL.addColorStop(1, "rgba(0,240,255,.05)");
    ctx.fillStyle = ezL; ctx.fillRect(0, 0, EZ, H);
    const ezR = ctx.createLinearGradient(goal, 0, W, 0); ezR.addColorStop(0, "rgba(255,46,136,.08)"); ezR.addColorStop(1, "rgba(255,46,136,.38)");
    ctx.fillStyle = ezR; ctx.fillRect(goal, 0, EZ, H);
    // diagonal hatch in the end zones
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, EZ, H); ctx.rect(goal, 0, EZ, H); ctx.clip(); ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    for (let x = -H; x < W; x += 10) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); } ctx.restore();
    ctx.save(); ctx.fillStyle = "#ff8fc0"; ctx.shadowColor = "#ff2e88"; ctx.shadowBlur = 14; ctx.font = `700 ${Math.min(20, EZ * 0.6)}px Rajdhani, sans-serif`; ctx.textAlign = "center";
    ctx.translate(W - EZ / 2, H / 2); ctx.rotate(Math.PI / 2); ctx.fillText("D R A F T   D A Y", 0, 6); ctx.restore();
    // yard lines (glow), goal lines brighter
    ctx.save(); ctx.shadowBlur = 8;
    for (let k = 0; k <= 10; k++) { const x = start + (goal - start) * k / 10; const goalLine = k === 0 || k === 10;
      ctx.strokeStyle = goalLine ? (k ? "#ff2e88" : "#00f0ff") : "rgba(0,240,255,.45)"; ctx.shadowColor = goalLine ? ctx.strokeStyle : "#00f0ff"; ctx.lineWidth = goalLine ? 2.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      if (k && k < 10) { ctx.shadowBlur = 0; ctx.fillStyle = "rgba(122,248,255,.55)"; ctx.font = "500 10px JetBrains Mono, monospace"; ctx.textAlign = "center";
        const n = String(k <= 5 ? k * 10 : 100 - k * 10); ctx.fillText(n, x, 11); ctx.fillText(n, x, H - 5); ctx.shadowBlur = 8; } }
    ctx.restore();
    // hash marks + lane lines
    ctx.strokeStyle = "rgba(0,240,255,.18)"; ctx.lineWidth = 1;
    for (let k = 0; k < 50; k++) { const x = start + (goal - start) * k / 50; if (k % 5) for (const y of [H * 0.33, H * 0.67]) { ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke(); } }
    ctx.setLineDash([2, 6]); ctx.strokeStyle = "rgba(0,240,255,.10)";
    for (let i = 1; i < teams.length; i++) { ctx.beginPath(); ctx.moveTo(0, TOP + i * laneH + 6); ctx.lineTo(W, TOP + i * laneH + 6); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  function sprite(r, now) {
    const cx = start + (goal - start) * Math.min(1, r.x), base = TOP + r.i * laneH + laneH * 0.92 + 4;
    const s = laneH / 44; const moving = running && r.done == null && r.state !== "down";
    const sw = moving ? Math.sin(now / 70 + r.phase) : 0;
    if (r.x > 0.003) { // light trail
      const len = Math.min(cx - start, (moving ? 70 + r.v * 500 : 26) * s); const tg = ctx.createLinearGradient(cx - len, 0, cx, 0);
      tg.addColorStop(0, "rgba(0,0,0,0)"); tg.addColorStop(1, r.color + (r.state === "burst" ? "cc" : "66"));
      ctx.fillStyle = tg; ctx.fillRect(cx - len, base - 22 * s, len, (r.state === "burst" ? 10 : 6) * s);
    }
    ctx.save(); ctx.translate(cx, base); ctx.lineCap = "round";
    if (r.state === "down") ctx.rotate(Math.PI / 2.4);
    // shadow
    ctx.save(); ctx.fillStyle = r.color + "55"; ctx.shadowColor = r.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.ellipse(0, 0, 11 * s, 2.6 * s, 0, 0, 7); ctx.fill(); ctx.restore();
    // legs
    ctx.strokeStyle = "#cfe9ff"; ctx.lineWidth = 3.2 * s;
    ctx.beginPath(); ctx.moveTo(0, -13 * s); ctx.lineTo(sw * 7 * s, -1 * s); ctx.moveTo(0, -13 * s); ctx.lineTo(-sw * 7 * s, -1 * s); ctx.stroke();
    ctx.strokeStyle = r.color; ctx.lineWidth = 3.4 * s; ctx.beginPath(); ctx.moveTo(sw * 7 * s - 1, -1 * s); ctx.lineTo(sw * 7 * s + 3 * s, -1 * s); ctx.moveTo(-sw * 7 * s - 1, -1 * s); ctx.lineTo(-sw * 7 * s + 3 * s, -1 * s); ctx.stroke();
    // body / jersey
    ctx.save(); ctx.shadowColor = r.color; ctx.shadowBlur = 10; ctx.fillStyle = r.color; ctx.beginPath(); ctx.roundRect(-6 * s, -27 * s, 12 * s, 15 * s, 2 * s); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#03080c"; ctx.font = `800 ${8 * s}px Rajdhani, sans-serif`; ctx.textAlign = "center"; ctx.fillText(String(r.i + 1), 0, -16 * s);
    // arms (one carries the ball)
    ctx.strokeStyle = r.color; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(-4 * s, -24 * s); ctx.lineTo(-4 * s - sw * 6 * s, -16 * s); ctx.moveTo(4 * s, -24 * s); ctx.lineTo(9 * s, -19 * s); ctx.stroke();
    ctx.fillStyle = "#8b4513"; ctx.beginPath(); ctx.ellipse(10 * s, -19 * s, 3.4 * s, 2.2 * s, -0.5, 0, 7); ctx.fill();
    // bobble head (big!)
    const R = 14 * s; const bob = moving ? Math.sin(now / 55 + r.phase) * 2.4 * s : Math.sin(now / 300 + r.phase) * 0.8 * s;
    const tilt = moving ? Math.sin(now / 90 + r.phase) * 0.18 : 0;
    ctx.translate(0, -27 * s - R + 3 * s + bob); ctx.rotate(tilt);
    ctx.fillStyle = "#9fb1c6"; ctx.fillRect(-1.5 * s, R - 2, 3 * s, 4 * s); // spring neck
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.save(); ctx.clip();
    const img = imgs[r.i];
    if (img) { const k = Math.max((2 * R) / img.width, (2 * R) / img.height); ctx.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k); }
    else { ctx.fillStyle = "#0d1826"; ctx.fillRect(-R, -R, 2 * R, 2 * R); ctx.fillStyle = r.color; ctx.font = `700 ${R * 0.95}px Rajdhani, sans-serif`; ctx.textAlign = "center"; ctx.fillText((r.t.owner || "?").slice(0, 2).toUpperCase(), 0, R * 0.32); }
    ctx.restore(); ctx.save(); ctx.shadowColor = r.color; ctx.shadowBlur = 12; ctx.strokeStyle = r.color; ctx.lineWidth = 2.2 * s; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke(); ctx.restore();
    ctx.restore();
    // name tag + effects
    ctx.font = `500 ${Math.max(10, 10.5 * s)}px JetBrains Mono, monospace`; ctx.textAlign = "left";
    ctx.fillStyle = "rgba(207,233,255,.6)"; ctx.fillText(r.t.owner.toUpperCase(), 4, TOP + r.i * laneH + 14);
    if (r.done != null) { const wName = ctx.measureText(r.t.owner.toUpperCase() + "  ").width; ctx.save(); ctx.fillStyle = r.done === 1 ? "#f5c542" : r.color; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8; ctx.fillText(`#${r.done}`, 4 + wName, TOP + r.i * laneH + 14); ctx.restore(); }
    if (r.state === "burst") { ctx.fillStyle = "#f5c542"; ctx.font = `800 ${12 * s}px Rajdhani, sans-serif`; ctx.fillText("⚡", cx - 22 * s, base - 30 * s); }
  }
  const draw = (now) => { field(); runners.forEach((r) => sprite(r, now)); };
  const idle = (now) => { if (!running) { draw(now); raf = requestAnimationFrame(idle); } };
  raf = requestAnimationFrame(idle);

  const tick = document.getElementById("tick");
  const say = (s) => (tick.textContent = s);
  async function race() {
    if (running) return; cancelAnimationFrame(raf);
    const seed = document.getElementById("seed").value.trim() || newSeed(); const R = rng(seed);
    reset(); running = true; let place = 0; let lastEvt = 0;
    runners.forEach((r) => { r.base = 0.085 + R() * 0.02; r.v = 0; });
    for (const c of ["3", "2", "1", "HIKE! 🏈"]) { say(c); draw(performance.now()); await new Promise((res) => setTimeout(res, 550)); }
    let t0 = performance.now(), prev = t0, simT = 0; const order = [];
    const step = (now) => {
      const dtReal = Math.min(50, now - prev); prev = now;
      // fixed-step simulation so the seed fully determines the race
      simT += dtReal;
      while (simT >= 16) { simT -= 16;
        for (const r of runners) { if (r.done != null) continue;
          if (r.stateT > 0) { r.stateT--; if (!r.stateT) r.state = ""; }
          else { const e = R();
            if (e < 0.0035) { r.state = "burst"; r.stateT = 40; if (now - lastEvt > 900) { say(`⚡ ${r.t.owner} hits another gear!`); lastEvt = now; } }
            else if (e < 0.0055) { r.state = "down"; r.stateT = 45; if (now - lastEvt > 900) { say(`😵 ${r.t.owner} trips over the ${R() < 0.5 ? "pylon" : "20-yard line"}!`); lastEvt = now; } }
            else if (e < 0.008) { r.state = "juke"; r.stateT = 25; } }
          const mult = r.state === "burst" ? 1.75 : r.state === "down" ? 0 : r.state === "juke" ? 0.6 : 1;
          const target = r.base * mult * (0.85 + R() * 0.3);
          r.v += (target - r.v) * 0.08; r.x += r.v / 60;
          if (r.x >= 1) { r.x = 1; r.state = ""; r.stateT = 0; r.done = ++place; order.push(r); if (place === 1) say(`🏆 ${r.t.owner} crosses first!`); }
        }
      }
      draw(now);
      if (place < runners.length) raf = requestAnimationFrame(step);
      else finish(order, seed);
    };
    raf = requestAnimationFrame(step);
  }
  function finish(order, seed) {
    running = false;
    const mode = document.getElementById("mode").value;
    const final = mode === "rev" ? [...order].reverse() : order;
    const names = final.map((r) => `${r.t.owner} (${r.t.name})`);
    document.getElementById("res").innerHTML = names.map((n) => `<li>${esc(n)}</li>`).join("");
    document.getElementById("resmeta").textContent = `Seed ${seed} · ${mode === "rev" ? "last across picks first" : "first across picks first"} · ${new Date().toLocaleString()}`;
    say(`📋 ${final[0].t.owner} is on the clock with pick 1!`);
    try { localStorage.setItem("draftRace:last", JSON.stringify({ seed, order: names, at: Date.now() })); } catch {}
    raf = requestAnimationFrame(idle);
  }
  document.getElementById("go").onclick = race;
  document.getElementById("reseed").onclick = () => (document.getElementById("seed").value = newSeed());
  document.getElementById("copy").onclick = async (e) => { const txt = [...document.querySelectorAll("#res li")].map((li, i) => `${i + 1}. ${li.textContent}`).join("\n") + "\n" + document.getElementById("resmeta").textContent;
    try { await navigator.clipboard.writeText(txt); e.target.textContent = "Copied!"; } catch { e.target.textContent = "Copy failed"; } };
  root.querySelectorAll("input[type=file]").forEach((inp) => inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return; const url = URL.createObjectURL(f); const img = await loadImg(url);
    const c = document.createElement("canvas"); c.width = c.height = 160; const k = Math.max(160 / img.width, 160 / img.height);
    c.getContext("2d").drawImage(img, (160 - img.width * k) / 2, (160 - img.height * k) / 2, img.width * k, img.height * k);
    try { localStorage.setItem("headshot:" + inp.dataset.o, c.toDataURL("image/jpeg", 0.85)); } catch {}
    imgs = await Promise.all(teams.map((t) => loadImg(headshotFor(t) || t.avatar)));
    inp.closest(".row").querySelector(".avw").outerHTML = av(teams.find((t) => t.ownerId === inp.dataset.o));
  });
  addEventListener("hashchange", () => cancelAnimationFrame(raf), { once: true });
}
