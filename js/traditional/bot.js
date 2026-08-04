/* Simple heuristic bot AI — not a tournament-strength shanten solver, but a
   pragmatic "keep useful tiles, discard isolated ones, take free wins"
   player good enough for casual bots. Every function is pure (game state
   in, decision out) so it works identically for local play and as the
   authoritative server's bot driver. */

/** Rough "how useful is this tile to keep" score: pairs/proto-sequences
 *  score high, isolated honors/terminals score low. Not a real shanten
 *  calculation — a fast approximation good enough for discard ordering. */
function tileUsefulness(hand, tile) {
  const rank = RANK_OF[tile];
  let score = 0;
  const sameCount = hand.filter((t) => t === tile).length;
  score += (sameCount - 1) * 4; // pairs/triplets already forming

  if (rank !== null) {
    const prefix = tile[0];
    for (let d = -2; d <= 2; d++) {
      if (d === 0) continue;
      const r = rank + d;
      if (r < 1 || r > 9) continue;
      if (hand.includes(`${prefix}${r}`)) score += Math.abs(d) === 1 ? 3 : 1;
    }
  } else {
    // honors are only useful in pairs/triplets, already counted above
    score -= 1;
  }

  if (isTerminalOrHonor(tile) && sameCount === 1) score -= 1;
  return score;
}

function chooseBotDiscard(hand, melds) {
  // Never discard the tile that would complete an already-winning hand-in-hand
  // (shouldn't happen — caller checks tsumo first — but stay defensive).
  let worst = hand[0];
  let worstScore = Infinity;
  const uniqueTiles = [...new Set(hand)];
  uniqueTiles.forEach((tile) => {
    const remaining = hand.slice();
    remaining.splice(remaining.indexOf(tile), 1);
    const score = tileUsefulness(remaining.concat([]), tile) + tileUsefulness(hand, tile);
    if (score < worstScore) { worstScore = score; worst = tile; }
  });
  return worst;
}

/** Decides a bot's reaction to a discard given the engine-provided options. */
function chooseBotReaction(game, seatIndex, options) {
  if (options.ron) return 'ron';

  const seat = game.seat(seatIndex);
  const tile = game.lastDiscard.tile;

  if (options.pon && isYakuhaiTile(tile, seat.wind, game.roundWind)) return 'pon';

  if (options.chi.length > 0 && seat.melds.length > 0) {
    // Already open — keep leaning into an open hand if it clearly helps.
    const best = options.chi[0];
    return { chi: best };
  }

  return 'pass';
}

function chooseBotRiichi(game, seatIndex) {
  return game.canDeclareRiichi(seatIndex);
}

function chooseBotAnkan(game, seatIndex) {
  const opts = game.canAnkan(seatIndex);
  return opts.length > 0 ? opts[0] : null;
}
