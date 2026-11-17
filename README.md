# League HQ: a Sleeper-powered fantasy football site

A static website (plain HTML/JS, no build step) that reads your league live from the Sleeper API.
Hosting is free on GitHub Pages, and a nightly GitHub Action refreshes the advanced stats.

## Setup (about 10 minutes)

1. **Create a GitHub repo** (e.g. `league-hq`) and upload everything in this folder, including the hidden `.github` folder.
2. **Add your league ID**: open `config.js` and replace `PASTE_YOUR_LEAGUE_ID_HERE`.
   To find it, open your league at sleeper.com; the long number in the URL is the ID.
   Until you do this, the site runs in **demo mode** with fake data.
3. **Turn on Pages**: in the repo go to Settings → Pages → "Deploy from a branch" → `main` / `(root)`. Your site will be at `https://<you>.github.io/league-hq/`.
4. **Turn on the data job**: go to Settings → Actions → General → Workflow permissions → "Read and write". Then open the Actions tab → "Update data" → **Run workflow** once.
   After that it runs daily, plus Tuesday mornings after Monday Night Football.
5. Set `SCORING` in `.github/workflows/update-data.yml` to `ppr`, `half` or `std` to match your league (used for the FantasyPros rankings).

Running it locally: `python3 -m http.server` in this folder, then open http://localhost:8000. Opening `index.html` directly from disk won't work, because browsers block JS modules from `file://`.

## Commissioner upkeep (all in `config.js`)

| What | Where |
|---|---|
| Dues received | `DUES`. The Dues page has a form that generates this block for you to paste in |
| Weekly challenge $ per win | `CHALLENGE_PAYOUT` (0 until the league votes) |
| Challenge rulings / ties | `CHALLENGE_OVERRIDES: { 9: { rosterId: 4, note: "..." } }` |
| Bobblehead photos | Drop images in `/headshots/` and map them in `HEADSHOTS`. Anyone can also upload a photo on the Draft Day page (saved in their own browser) |
| Waiver-pickup keeper costs | `ADP_ROUNDS` (Sleeper's public API has no ADP), or type ADP on the Keepers page |
| Season-ending-injury FA rule | `SEASON_ENDING_FA: { player_id: originalDraftRound }` |

## Pages

- **Recap (home)**: Sleeper-style weekly recap with a headline, awards (top/low score, blowout, nail-biter, luckiest win, toughest loss, best manager, most points left on the bench, player of the week, bench hero, biggest FAAB splash, trades), the week's challenge winner, matchup write-ups, and next week's win chances.
- **Standings**: record, PF/PA, max PF, manager %, streak, playoff seeds under *your* 7th-spot rule. Also: vs Median (median record, all-play record, PF/PA vs league median, luck), **Schedule Swap** (every team's record with every other team's schedule), Power Rankings, and a weekly score heatmap.
- **Teams → team profile**: roster with PPG and injuries, next year's picks (including traded picks), start/sit accuracy (weekly, league rank, biggest misses, losses your best lineup would have won), all-time record and titles, transactions, FAAB, and everything else Sleeper returns for the team.
- **What are the chances?**: 10,000-season Monte Carlo giving this week's win %, playoff %, bye %, chance of getting in through the points-leader spot, finals %, title %, last-place risk, and full seed probabilities. During the playoffs it uses the real bracket.
- **Challenges**: all 17 weekly challenges scored automatically, with leaderboards, ties flagged, and a running payout table.
- **Trade Analyzer**: see "How the values work" below.
- **Keepers** *(suggested page)*: keeper cost for every rostered player under the league's keeper rules. It flags same-position conflicts, the max-2 limit, and picks you no longer own.
- **Record Book** *(suggested page)*: champions, all-time standings, an all-time head-to-head grid, and single-game records. It follows Sleeper's previous-league chain.
- **Dues & $**: who has paid, the pot vs payouts (it warns that challenge payouts don't fit inside a $600 pot), and challenge earnings.
- **Draft Day**: a 100-yard dash of bobblehead sprites using owners' faces. The race is driven by a shareable random seed, so anyone can replay it and confirm the order.
- **Rules**: the constitution and challenge list.

## How the trade values work

1. **Projected PPG** = 55% season PPG + 20% last-3-games average + 25% ECR-implied PPG (the PPG of the player at that positional ECR rank). All points use your league's exact scoring settings.
2. **Efficiency adjustment** (±10% max): z-scores within position for targets/game, YPRR, EPA/play and PFF grade, plus Y/A, TD%, INT% and CPOE for QBs.
3. **Value over replacement**, scaled so the league's best asset = 100.
4. **Lineup impact**: each team's best starting lineup before vs after the trade, in points per week.

**Data honesty:**
- PFF grades and true YPRR are subscription-only, and there is no free, consistent source. The analyzer accepts a CSV upload (`name`/`sleeper_id`, `pff`, `yprr`). Until you upload one, it uses *yards per team pass attempt* from nflverse as a YPRR stand-in, marked with `*`.
- EPA, CPOE and aDOT come from nflverse play-by-play.
- ECR comes from FantasyPros, which is the same consensus borischen.co's tiers are built on. If FantasyPros changes its page layout, the ECR step fails without breaking anything else.

## More page ideas
- Draft board recap and "draft grades in hindsight" (points scored by each pick vs ADP)
- Waiver/FAAB report: best pickups by points scored after the add, dollars per point
- Trade history with winners judged in hindsight
- Rivalry pages for any two owners
- Last-place punishment tracker / "Toilet Bowl" bracket
