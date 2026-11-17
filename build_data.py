"""
Nightly data refresh for the league site (run by .github/workflows/update-data.yml).

Writes:
  data/players.json   slim Sleeper player DB (so browsers don't download Sleeper's 5 MB file)
  data/advanced.json  EPA/play, CPOE, aDOT, yards per team pass attempt (nflverse play-by-play)
  data/schedule.json  NFL regular-season schedule: week -> team -> opponent (nflverse)
  data/ecr.json       FantasyPros rest-of-season expert consensus rankings
  data/adp.json       Sleeper ADP for the season (used for waiver-pickup keeper costs)

Each part fails independently; the site falls back gracefully when a file is missing.
"""
import json, os, re, sys, datetime as dt
import requests

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (league-site data bot)"}
SCORING = os.environ.get("SCORING", "half")  # ppr | half | std
now = dt.datetime.utcnow().isoformat() + "Z"


def write(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"wrote {name}")


def season_now():
    st = requests.get("https://api.sleeper.app/v1/state/nfl", timeout=30).json()
    return int(st["season"]), st


# ---------------------------------------------------------------- players
def build_players():
    full = requests.get("https://api.sleeper.app/v1/players/nfl", timeout=120, headers=UA).json()
    out = {}
    for pid, p in full.items():
        if not p or p.get("position") not in {"QB", "RB", "WR", "TE", "K", "DEF", "FB"}:
            continue
        if not p.get("active") and not p.get("team") and p.get("position") != "DEF":
            continue
        out[pid] = {"n": p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}".strip(),
                    "p": p.get("position"), "fp": p.get("fantasy_positions") or [p.get("position")],
                    "t": p.get("team"), "a": p.get("age"), "inj": p.get("injury_status"), "x": p.get("years_exp"),
                    "num": p.get("number")}
    write("players.json", out)


# ---------------------------------------------------------------- advanced (nflverse)
def build_advanced(season):
    import nflreadpy as nfl
    import polars as pl

    pbp = nfl.load_pbp([season])
    ids = nfl.load_ff_playerids().select(["gsis_id", "sleeper_id"]).drop_nulls()
    gs2sl = {r["gsis_id"]: str(int(float(r["sleeper_id"]))) for r in ids.iter_rows(named=True) if r["sleeper_id"]}
    pbp = pbp.filter(pl.col("season_type") == "REG")

    res = {}
    def put(gid, **kw):
        sl = gs2sl.get(gid)
        if not sl:
            return
        d = res.setdefault(sl, {})
        for k, v in kw.items():
            if v is not None:
                d[k] = round(float(v), 3)

    # QBs: EPA per dropback, CPOE
    qb = (pbp.filter(pl.col("qb_dropback") == 1).group_by("passer_player_id")
          .agg(pl.col("epa").mean().alias("epa"), pl.col("cpoe").mean().alias("cpoe"), pl.len().alias("n")))
    for r in qb.filter(pl.col("n") >= 30).iter_rows(named=True):
        put(r["passer_player_id"], epa_per_play=r["epa"], cpoe=r["cpoe"])

    # Skill players: EPA per touch opportunity (rushes + targets), aDOT
    rushes = pbp.filter((pl.col("rush") == 1) & pl.col("rusher_player_id").is_not_null()).select(
        pl.col("rusher_player_id").alias("pid"), "epa", "game_id", "posteam")
    tgts = pbp.filter((pl.col("pass_attempt") == 1) & pl.col("receiver_player_id").is_not_null()).select(
        pl.col("receiver_player_id").alias("pid"), "epa", "air_yards", "game_id", "posteam",
        pl.when(pl.col("complete_pass") == 1).then(pl.col("receiving_yards")).otherwise(0).alias("ryd"))
    both = pl.concat([rushes.select("pid", "epa"), tgts.select("pid", "epa")])
    eppg = both.group_by("pid").agg(pl.col("epa").mean().alias("epa"), pl.len().alias("n"))
    adot = tgts.group_by("pid").agg(pl.col("air_yards").mean().alias("adot"), pl.len().alias("t"))

    # Yards per team pass attempt (free proxy for YPRR): receiving yards / team dropbacks in games the player was involved
    team_att = pbp.filter(pl.col("pass_attempt") == 1).group_by(["game_id", "posteam"]).agg(pl.len().alias("team_att"))
    games = pl.concat([rushes.select("pid", "game_id", "posteam"), tgts.select("pid", "game_id", "posteam")]).unique()
    yds = tgts.group_by(["pid", "game_id"]).agg(pl.col("ryd").sum().alias("ryd"))
    g = games.join(team_att, on=["game_id", "posteam"], how="left").join(yds, on=["pid", "game_id"], how="left").fill_null(0)
    yptpa = g.group_by("pid").agg((pl.col("ryd").sum() / pl.col("team_att").sum()).alias("yptpa"))

    for r in eppg.filter(pl.col("n") >= 15).iter_rows(named=True):
        if gs2sl.get(r["pid"]) in res and "cpoe" in res[gs2sl[r["pid"]]]:
            continue  # keep QB dropback EPA
        put(r["pid"], epa_per_play=r["epa"])
    for r in adot.filter(pl.col("t") >= 10).iter_rows(named=True):
        put(r["pid"], adot=r["adot"])
    for r in yptpa.iter_rows(named=True):
        put(r["pid"], yptpa=r["yptpa"])
    write("advanced.json", {"season": season, "updated": now, "source": "nflverse play-by-play", "players": res})


# ---------------------------------------------------------------- NFL schedule (for strength of schedule)
def build_schedule(season):
    import nflreadpy as nfl
    import polars as pl
    fix = {"LA": "LAR", "OAK": "LV", "SD": "LAC", "STL": "LAR", "WSH": "WAS"}
    sc = nfl.load_schedules([season]).filter(pl.col("game_type") == "REG")
    weeks = {}
    for r in sc.select(["week", "home_team", "away_team"]).iter_rows(named=True):
        h, a = fix.get(r["home_team"], r["home_team"]), fix.get(r["away_team"], r["away_team"])
        w = weeks.setdefault(str(int(r["week"])), {})
        w[h], w[a] = a, h
    if len(weeks) < 17:
        raise RuntimeError(f"schedule has only {len(weeks)} weeks")
    write("schedule.json", {"season": season, "updated": now, "weeks": weeks})


# ---------------------------------------------------------------- ECR (FantasyPros)
def build_ecr():
    slug = {"ppr": "ppr-", "half": "half-point-ppr-", "std": ""}[SCORING]
    url = f"https://www.fantasypros.com/nfl/rankings/ros-{slug}overall.php"
    html = requests.get(url, headers=UA, timeout=60).text
    m = re.search(r"var ecrData = (\{.*?\});", html, re.S)
    if not m:
        raise RuntimeError("ecrData not found on FantasyPros page (layout changed?)")
    data = json.loads(m.group(1))
    fp2sl, name2sl = id_maps()
    out = {}
    for p in data.get("players", []):
        sl = fp2sl.get(str(p.get("player_id"))) or name2sl.get((norm(p.get("player_name")), p.get("player_position_id")))
        if sl:
            out[sl] = {"rank": p.get("rank_ecr"), "pos_rank": p.get("pos_rank"), "tier": p.get("tier"), "name": p.get("player_name")}
    write("ecr.json", {"source": url, "updated": now, "players": out})


_MAPS = None
def id_maps():
    """FantasyPros id → Sleeper id, and (normalized name, position) → Sleeper id."""
    global _MAPS
    if _MAPS is None:
        fp2sl, name2sl = {}, {}
        try:
            import nflreadpy as nfl
            for r in nfl.load_ff_playerids().select(["fantasypros_id", "sleeper_id", "name", "position"]).iter_rows(named=True):
                if r["sleeper_id"]:
                    sl = str(int(float(r["sleeper_id"])))
                    if r["fantasypros_id"]:
                        fp2sl[str(int(float(r["fantasypros_id"])))] = sl
                    name2sl[(norm(r["name"]), r["position"])] = sl
        except Exception as e:
            print("id map unavailable:", e)
        _MAPS = (fp2sl, name2sl)
    return _MAPS


# ---------------------------------------------------------------- ADP (FantasyPros consensus + per-platform)
def build_adp(season):
    """Sleeper's own ADP (the league's keeper rule is written against Sleeper ADP).
    FantasyPros' cross-platform consensus table only exposes its first 5 rows without an account, so it can't be used."""
    key = {"ppr": "adp_ppr", "half": "adp_half_ppr", "std": "adp_std"}[SCORING]
    url = (f"https://api.sleeper.com/projections/nfl/{season}?season_type=regular"
           "&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF&order_by=" + key)
    data = requests.get(url, headers=UA, timeout=60).json()
    out, keys = {}, set()
    for r in data:
        st = r.get("stats") or {}
        keys.update(k for k in st if k.startswith("adp"))
        v = num(st.get(key))
        if v is not None and 0 < v < 900:
            pl = r.get("player") or {}
            out[str(r.get("player_id"))] = {"sleeper": v, "name": f"{pl.get('first_name', '')} {pl.get('last_name', '')}".strip()}
    print(f"ADP: {len(data)} rows, {len(out)} with {key}; adp keys: {sorted(keys)}")
    if len(out) < 100:
        raise RuntimeError(f"only {len(out)} of {len(data)} rows had {key}; adp keys seen: {sorted(keys)}")
    write("adp.json", {"source": "Sleeper", "field": key, "updated": now, "season": season, "platforms": ["Sleeper"], "players": out})


def num(v):
    try:
        return round(float(str(v).replace(",", "")), 1)
    except (TypeError, ValueError):
        return None


def norm(s):
    s = (s or "").lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", s)
    return re.sub(r"[^a-z]", "", s)


if __name__ == "__main__":
    import traceback
    season, _ = season_now()
    status = {"updated": now}
    for name, fn in [("players", build_players), ("advanced", lambda: build_advanced(season)), ("schedule", lambda: build_schedule(season)), ("ecr", build_ecr), ("adp", lambda: build_adp(season))]:
        try:
            fn()
            status[name] = "ok"
        except Exception as e:  # keep going; site handles missing files
            status[name] = "FAILED: " + "".join(traceback.format_exception_only(type(e), e)).strip()[:4000]
            print(f"[{name}] {status[name]}", file=sys.stderr)
    write("build_status.json", status)
    sys.exit(0)
