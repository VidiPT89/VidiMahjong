/* Local, backend-free leaderboard for Solitaire: best (lowest) elapsed time and best (fewest)
 * moves, tracked independently per difficulty in localStorage. Mirrors the same storage
 * pattern (and the same "keep whichever is better per metric" logic) as the DroidMahjong/
 * iMahjong ports. */
const LEADERBOARD_KEY = 'vidimahjong-leaderboard';

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveLeaderboard(all) {
  try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
}

function getLeaderboardEntry(difficulty) {
  return loadLeaderboard()[difficulty] || { bestTimeSeconds: null, bestMoves: null };
}

/**
 * Records a completed game, keeping whichever of the previous best / new result is better for
 * each metric independently. Returns the entry after the update plus which metrics were new
 * records, so the UI can show "New Best!" badges.
 */
function recordLeaderboardWin(difficulty, timeSeconds, moves) {
  const all = loadLeaderboard();
  const current = all[difficulty] || { bestTimeSeconds: null, bestMoves: null };

  const newBestTime = current.bestTimeSeconds == null || timeSeconds < current.bestTimeSeconds;
  if (newBestTime) current.bestTimeSeconds = timeSeconds;

  const newBestMoves = current.bestMoves == null || moves < current.bestMoves;
  if (newBestMoves) current.bestMoves = moves;

  all[difficulty] = current;
  saveLeaderboard(all);
  return { entry: current, newBestTime, newBestMoves };
}
