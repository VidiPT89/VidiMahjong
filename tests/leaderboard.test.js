const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./load-scripts');

// leaderboard.js reads/writes `localStorage` -- give the vm sandbox a minimal in-memory
// stand-in for it (Node has no global localStorage), independent per test so games don't
// leak state between assertions.
function loadLeaderboardModule() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const sandbox = loadScripts(['js/leaderboard.js']);
  sandbox.localStorage = localStorage;
  // localStorage is referenced as a bare global inside leaderboard.js's functions; since
  // those already ran once in loadScripts's vm context, re-run just the assignment target
  // by exposing it directly on the sandbox object (vm contexts treat plain object
  // properties as globals for scripts executed against them).
  return sandbox;
}

test('a difficulty with no recorded games has an empty leaderboard entry', () => {
  const { getLeaderboardEntry } = loadLeaderboardModule();
  const entry = getLeaderboardEntry('medium');
  assert.equal(entry.bestTimeSeconds, null);
  assert.equal(entry.bestMoves, null);
});

test('the first recorded win always counts as a new best on both metrics', () => {
  const { recordLeaderboardWin } = loadLeaderboardModule();
  const { entry, newBestTime, newBestMoves } = recordLeaderboardWin('medium', 120, 40);
  assert.equal(entry.bestTimeSeconds, 120);
  assert.equal(entry.bestMoves, 40);
  assert.equal(newBestTime, true);
  assert.equal(newBestMoves, true);
});

test('time and moves records are tracked independently across separate wins', () => {
  const { recordLeaderboardWin } = loadLeaderboardModule();
  recordLeaderboardWin('medium', 120, 40);

  // Faster but sloppier: only the time record improves.
  const second = recordLeaderboardWin('medium', 90, 55);
  assert.equal(second.newBestTime, true);
  assert.equal(second.newBestMoves, false);
  assert.equal(second.entry.bestTimeSeconds, 90);
  assert.equal(second.entry.bestMoves, 40); // unchanged -- 40 was still fewer than 55

  // Slower but more efficient: only the moves record improves.
  const third = recordLeaderboardWin('medium', 200, 30);
  assert.equal(third.newBestTime, false);
  assert.equal(third.newBestMoves, true);
  assert.equal(third.entry.bestTimeSeconds, 90); // unchanged -- 90 was still faster than 200
  assert.equal(third.entry.bestMoves, 30);
});

test('leaderboard entries for different difficulties do not interfere with each other', () => {
  const { recordLeaderboardWin, getLeaderboardEntry } = loadLeaderboardModule();
  recordLeaderboardWin('easy', 60, 20);
  recordLeaderboardWin('hard', 300, 80);

  assert.equal(getLeaderboardEntry('easy').bestTimeSeconds, 60);
  assert.equal(getLeaderboardEntry('hard').bestTimeSeconds, 300);
  assert.equal(getLeaderboardEntry('medium').bestTimeSeconds, null);
});
