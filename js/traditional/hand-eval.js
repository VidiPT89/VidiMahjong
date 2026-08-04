/* Winning-hand decomposition — the highest bug-risk component (per the
   project's own design notes). Pure functions, no UI/network dependencies,
   so they can be (and are — see test scripts) exhaustively unit tested in
   isolation before ever being wired into the turn engine. */

function countsFromTiles(tiles) {
  const counts = {};
  STANDARD_TYPE_IDS.forEach((id) => { counts[id] = 0; });
  tiles.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  return counts;
}

function firstNonZero(counts) {
  for (const id of STANDARD_TYPE_IDS) if (counts[id] > 0) return id;
  return null;
}

/** All ways to split `counts` into exactly `groupsNeeded` triplets/sequences. */
function decomposeIntoGroups(counts, groupsNeeded) {
  if (groupsNeeded === 0) {
    return Object.values(counts).every((c) => c === 0) ? [[]] : [];
  }
  const type = firstNonZero(counts);
  if (type === null) return [];

  const results = [];
  const suit = SUIT_OF[type];
  const rank = RANK_OF[type];

  if (counts[type] >= 3) {
    const next = { ...counts, [type]: counts[type] - 3 };
    decomposeIntoGroups(next, groupsNeeded - 1).forEach((sub) => {
      results.push([{ kind: 'triplet', tiles: [type, type, type] }, ...sub]);
    });
  }

  if (rank !== null && rank <= 7) {
    const t2 = `${type[0]}${rank + 1}`;
    const t3 = `${type[0]}${rank + 2}`;
    if ((counts[t2] || 0) > 0 && (counts[t3] || 0) > 0) {
      const next = { ...counts, [type]: counts[type] - 1, [t2]: counts[t2] - 1, [t3]: counts[t3] - 1 };
      decomposeIntoGroups(next, groupsNeeded - 1).forEach((sub) => {
        results.push([{ kind: 'sequence', tiles: [type, t2, t3] }, ...sub]);
      });
    }
  }

  return results;
}

/**
 * All valid {pair, groups} decompositions of a concealed tile list into
 * `groupsNeeded` sets (3 tiles each) plus one pair. Empty array = no valid
 * standard decomposition exists.
 */
function findDecompositions(concealedTiles, groupsNeeded) {
  const counts = countsFromTiles(concealedTiles);
  const results = [];
  for (const type of STANDARD_TYPE_IDS) {
    if (counts[type] >= 2) {
      const withoutPair = { ...counts, [type]: counts[type] - 2 };
      decomposeIntoGroups(withoutPair, groupsNeeded).forEach((groups) => {
        results.push({ pair: type, groups });
      });
    }
  }
  return results;
}

function isChiitoitsu(concealedTiles) {
  if (concealedTiles.length !== 14) return false;
  const counts = countsFromTiles(concealedTiles);
  const pairs = Object.values(counts).filter((c) => c === 2).length;
  const others = Object.values(counts).filter((c) => c !== 0 && c !== 2).length;
  return pairs === 7 && others === 0;
}

const KOKUSHI_TYPES = ['m1', 'm9', 's1', 's9', 'p1', 'p9', 'wE', 'wS', 'wW', 'wN', 'dR', 'dG', 'dW'];

function isKokushiMusou(concealedTiles) {
  if (concealedTiles.length !== 14) return false;
  const counts = countsFromTiles(concealedTiles);
  let hasPair = false;
  for (const type of STANDARD_TYPE_IDS) {
    const c = counts[type];
    if (c === 0) continue;
    if (!KOKUSHI_TYPES.includes(type)) return false;
    if (c >= 2) hasPair = true;
  }
  return hasPair;
}

/**
 * Checks whether concealedTiles (length 14 - 3*melds.length) plus the fixed
 * `melds` (already-complete triplet/sequence/quad groups) forms a winning
 * hand. Returns { win: false } or { win: true, kind, decompositions }
 * where decompositions (standard hands only) list every valid {pair,
 * groups} split, needed later for yaku/fu evaluation (different splits can
 * yield different yaku, e.g. pinfu only applies under specific splits).
 */
function checkWin(concealedTiles, melds) {
  const meldGroups = melds.map((m) => ({
    kind: m.kind === 'kan' ? 'triplet' : m.kind, // a kan counts as a triplet for shape purposes
    tiles: m.tiles.slice(0, 3),
    meld: m,
  }));

  if (melds.length === 0) {
    if (isChiitoitsu(concealedTiles)) return { win: true, kind: 'chiitoitsu', decompositions: [] };
    if (isKokushiMusou(concealedTiles)) return { win: true, kind: 'kokushi', decompositions: [] };
  }

  const groupsNeeded = 4 - melds.length;
  const decompositions = findDecompositions(concealedTiles, groupsNeeded).map((d) => ({
    pair: d.pair,
    groups: [...meldGroups, ...d.groups],
  }));

  if (decompositions.length > 0) return { win: true, kind: 'standard', decompositions };
  return { win: false };
}
