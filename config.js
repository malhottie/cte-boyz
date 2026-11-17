// =====================================================================
//  LEAGUE CONFIG — the only file the commissioners need to edit.
// =====================================================================
export const CONFIG = {
  // Your Sleeper league ID (Sleeper app → League → Settings → scroll to bottom,
  // or the number in the URL at sleeper.com/leagues/<ID>).
  LEAGUE_ID: "1389753829288869888", // CTE Boyz

  LEAGUE_NAME: "", // optional override; blank = use the Sleeper league name

  // Rounds in YOUR draft (Sleeper's league setting says 3, the constitution says 16)
  DRAFT_ROUNDS: 16,

  // Set true to run the site on fake data (for previewing / testing).
  // If LEAGUE_ID is not filled in, demo mode turns on automatically.
  MOCK: false,

  // ---------------- Money ----------------
  BUY_IN: 50,
  PAYOUTS: { 1: 400, 2: 150, 3: 50 },
  CHALLENGE_PAYOUT: 0, // $ per weekly challenge win (set once the league votes)

  // Dues ledger. Key = Sleeper username (lowercase) OR display name.
  // paid: amount received so far. Anyone missing here shows as unpaid.
  DUES: {
    // "alexm": { paid: 50, date: "2026-08-20", method: "Venmo", note: "" },
  },

  // ---------------- Headshots for the draft-day race ----------------
  // Key = Sleeper username (lowercase) or display name, value = image path in /headshots.
  // People can also upload a photo directly on the Draft Day page (saved in that browser).
  HEADSHOTS: {
    // "alexm": "headshots/alex.png",
  },

  // ---------------- Weekly challenge fine print ----------------
  // Week 3 "Look At These TDs": which starter TDs count.
  // Default counts rushing + receiving + passing TDs of every starter (a QB-to-WR TD you start both ends of counts twice).
  TD_TYPES: ["pass_td", "rush_td", "rec_td", "def_td", "fum_rec_td", "pr_td", "kr_td"],
  // Manual results that override the automatic calculation, e.g. { 9: { rosterId: 4, note: "ruled by commish" } }
  CHALLENGE_OVERRIDES: {},

  // ---------------- Keepers ----------------
  // Sleeper's public API has no ADP, so waiver-pickup keeper costs (2x ADP) use these.
  // Key = Sleeper player_id, value = ADP round (e.g. 2.4 → round 2). Commish can also enter these on the Keepers page.
  ADP_ROUNDS: {},
  // Players the commish has ruled "season-ending injury" FA pickups: { player_id: originalDraftRound }
  SEASON_ENDING_FA: {},

  // How many recent games the "trend" uses
  TREND_GAMES: 3,
  // Monte Carlo runs for "What are the chances?"
  SIMULATIONS: 10000,
};
