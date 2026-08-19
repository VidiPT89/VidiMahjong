/* Core Mahjong Solitaire engine — no DOM access here, purely game state,
   so it can be reasoned about (and unit-tested) independently of rendering. */

/**
 * Given a list of {refId, x, y, z} positions, returns an ordered list of
 * [refIdA, refIdB] pairs such that each pair was mutually free — not
 * covered, and open on at least one side — at the moment it was paired,
 * considering only the positions not yet paired earlier in the list.
 *
 * Why this guarantees a solvable board: geometric freeness (covered /
 * open-side) depends only on which POSITIONS are still occupied, never on
 * tile type. So once a matching tile type is assigned to each pair here,
 * playing the pairs back in this exact order reproduces this same
 * legal removal sequence on the real board.
 *
 * Each round collects every currently-free position and pairs them off two
 * at a time; a leftover odd one just stays free (freeness only grows as
 * other tiles are removed) and joins next round's pairing.
 */
function computeSolvablePairing(positions) {
  const remaining = new Map(positions.map((p) => [p.refId, p]));
  const pairs = [];

  const isCoveredIn = (p) => {
    for (const o of remaining.values()) {
      if (o.refId !== p.refId && o.x === p.x && o.y === p.y && o.z > p.z) return true;
    }
    return false;
  };
  const isOpenSideIn = (p, dx) => {
    for (const o of remaining.values()) {
      if (o.refId !== p.refId && o.z === p.z && o.y === p.y && o.x === p.x + dx) return false;
    }
    return true;
  };
  const isFreeIn = (p) => !isCoveredIn(p) && (isOpenSideIn(p, -1) || isOpenSideIn(p, 1));

  while (remaining.size > 0) {
    const free = [...remaining.values()].filter(isFreeIn);
    if (free.length < 2) {
      throw new Error('Unpairable board remainder — layout needs at least 2 simultaneously free tiles per round.');
    }
    shuffleArray(free); // which tiles get paired (not just which are free) affects future rounds
    for (let i = 0; i + 1 < free.length; i += 2) {
      pairs.push([free[i].refId, free[i + 1].refId]);
      remaining.delete(free[i].refId);
      remaining.delete(free[i + 1].refId);
    }
    // An odd one out (if any) simply stays in `remaining` — it's still free
    // next round by construction, so the loop always makes progress.
  }
  return pairs;
}

/** computeSolvablePairing occasionally paints itself into a corner depending
 *  on which free tiles get grouped together early on; retrying re-rolls
 *  that choice (shuffleArray above) until a full reduction succeeds. */
function computeSolvablePairingWithRetry(positions, maxAttempts = 200) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return computeSolvablePairing(positions);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

class MahjongGame {
  /**
   * `level` only matters for difficulty 'infinite': it drives the board size via
   * buildInfiniteLayout(level) (see layout.js). It's ignored for the three fixed
   * difficulties, which always deal the same hand-authored layout.
   */
  constructor(difficulty = 'medium', level = 1) {
    this.difficulty = difficulty === 'infinite' || LAYOUTS[difficulty] ? difficulty : 'medium';
    this.level = level;
    this.tiles = [];
    this.selectedId = null;
    this.history = [];
    this.moves = 0;
    this.hintsUsed = 0;
    this.startedAt = 0;
    this.reset();
  }

  reset() {
    const layout = this.difficulty === 'infinite' ? buildInfiniteLayout(this.level) : (LAYOUTS[this.difficulty] || TURTLE_LAYOUT);
    this.tiles = layout.map((pos, i) => ({
      id: i, x: pos.x, y: pos.y, z: pos.z, removed: false, typeId: null,
    }));

    const pairing = computeSolvablePairingWithRetry(this.tiles.map((t) => ({ refId: t.id, x: t.x, y: t.y, z: t.z })));
    const units = this.difficulty === 'infinite' ? buildInfinitePairUnits(this.tiles.length) : buildPairUnitsForDifficulty(this.difficulty);
    const byId = new Map(this.tiles.map((t) => [t.id, t]));
    pairing.forEach(([a, b], idx) => {
      const [typeA, typeB] = units[idx];
      byId.get(a).typeId = typeA;
      byId.get(b).typeId = typeB;
    });

    // Kept for solvability testing (see test_engine.js) — a verified proof-of-solve
    // order for the exact deal just dealt, not used by normal gameplay.
    this._provenSolveOrder = pairing;

    this.selectedId = null;
    this.history = [];
    this.moves = 0;
    this.hintsUsed = 0;
    this.startedAt = Date.now();
  }

  /**
   * Infinite mode only: deals the next (bigger) level's board in place, keeping the run's
   * cumulative moves/score/timer going rather than resetting them like reset() does for a
   * brand new game. The undo history does reset -- undoing across a level boundary back
   * into an already-cleared board doesn't make sense.
   */
  dealNextInfiniteLevel() {
    this.level += 1;
    const layout = buildInfiniteLayout(this.level);
    this.tiles = layout.map((pos, i) => ({
      id: i, x: pos.x, y: pos.y, z: pos.z, removed: false, typeId: null,
    }));

    const pairing = computeSolvablePairingWithRetry(this.tiles.map((t) => ({ refId: t.id, x: t.x, y: t.y, z: t.z })));
    const units = buildInfinitePairUnits(this.tiles.length);
    const byId = new Map(this.tiles.map((t) => [t.id, t]));
    pairing.forEach(([a, b], idx) => {
      const [typeA, typeB] = units[idx];
      byId.get(a).typeId = typeA;
      byId.get(b).typeId = typeB;
    });

    this._provenSolveOrder = pairing;
    this.selectedId = null;
    this.history = [];
  }

  getTile(id) {
    return this.tiles.find((t) => t.id === id) || null;
  }

  active() {
    return this.tiles.filter((t) => !t.removed);
  }

  remaining() {
    return this.active().length;
  }

  isCovered(tile) {
    return this.tiles.some((o) => !o.removed && o.x === tile.x && o.y === tile.y && o.z > tile.z);
  }

  isOpenLeft(tile) {
    return !this.tiles.some((o) => !o.removed && o.z === tile.z && o.y === tile.y && o.x === tile.x - 1);
  }

  isOpenRight(tile) {
    return !this.tiles.some((o) => !o.removed && o.z === tile.z && o.y === tile.y && o.x === tile.x + 1);
  }

  isFree(tile) {
    if (tile.removed) return false;
    if (this.isCovered(tile)) return false;
    return this.isOpenLeft(tile) || this.isOpenRight(tile);
  }

  freeTiles() {
    return this.active().filter((t) => this.isFree(t));
  }

  /** Attempts to select a tile; returns what happened so the UI can animate/react. */
  select(id) {
    const tile = this.getTile(id);
    if (!tile || tile.removed) return { type: 'ignored' };
    if (!this.isFree(tile)) return { type: 'blocked', tile };

    if (this.selectedId === id) {
      this.selectedId = null;
      return { type: 'deselected', tile };
    }

    if (this.selectedId === null) {
      this.selectedId = id;
      return { type: 'selected', tile };
    }

    const first = this.getTile(this.selectedId);
    if (tilesMatch(first.typeId, tile.typeId)) {
      first.removed = true;
      tile.removed = true;
      this.selectedId = null;
      this.moves++;
      this.history.push({ a: first.id, b: tile.id });
      return { type: 'matched', a: first, b: tile, won: this.remaining() === 0 };
    }

    // No match: swap selection to the newly clicked tile.
    this.selectedId = id;
    return { type: 'mismatch', previous: first, tile };
  }

  undo() {
    const last = this.history.pop();
    if (!last) return null;
    const a = this.getTile(last.a);
    const b = this.getTile(last.b);
    a.removed = false;
    b.removed = false;
    this.selectedId = null;
    this.moves++;
    return { a, b };
  }

  /** Finds one legal matching pair among currently free tiles, for the hint button. */
  findHint() {
    const free = this.freeTiles();
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        if (tilesMatch(free[i].typeId, free[j].typeId)) {
          return [free[i], free[j]];
        }
      }
    }
    return null;
  }

  hasAvailableMove() {
    return this.findHint() !== null;
  }

  isWon() {
    return this.remaining() === 0;
  }

  isStuck() {
    return !this.isWon() && !this.hasAvailableMove();
  }

  /**
   * Reassigns tile types on the tiles still on the board (same positions),
   * using the same simultaneous-freeness pairing as the initial deal, so the
   * remaining board is always solvable again after a reshuffle.
   */
  reshuffle() {
    const remainingTiles = this.active();
    const pairing = computeSolvablePairingWithRetry(remainingTiles.map((t) => ({ refId: t.id, x: t.x, y: t.y, z: t.z })));

    const typeCounts = {};
    remainingTiles.forEach((t) => { typeCounts[t.typeId] = (typeCounts[t.typeId] || 0) + 1; });
    const units = buildPairUnitsFromInventory(typeCounts);

    const byId = new Map(remainingTiles.map((t) => [t.id, t]));
    pairing.forEach(([a, b], idx) => {
      const [typeA, typeB] = units[idx];
      byId.get(a).typeId = typeA;
      byId.get(b).typeId = typeB;
    });

    this._provenSolveOrder = pairing;
    this.selectedId = null;
  }
}
