/* Yaku (winning-hand pattern) detection and fu calculation for Riichi
   scoring. Evaluated per-decomposition (see hand-eval.js) — the turn engine
   tries every decomposition of a winning hand and keeps the highest score.

   Scope note: this covers the common competitive yaku set plus all
   yakuman. It intentionally simplifies a few rare edge cases (e.g. double
   yakuman variants like suuankou tanki count as a single yakuman here,
   and kiriage-mangan rounding is applied) rather than chasing every
   tournament-rule nuance — documented in the README. */

const GREEN_TILES = ['s2', 's3', 's4', 's6', 's8', 'dG'];

function isYakuhaiTile(typeId, seatWind, roundWind) {
  const t = TILE_TYPES_BY_ID[typeId];
  if (t.category === 'dragon') return true;
  if (t.category === 'wind') return typeId === seatWind || typeId === roundWind;
  return false;
}

function yakuhaiHanForTile(typeId, seatWind, roundWind) {
  const t = TILE_TYPES_BY_ID[typeId];
  let han = 0;
  if (t.category === 'dragon') han += 1;
  if (t.category === 'wind' && typeId === seatWind) han += 1;
  if (t.category === 'wind' && typeId === roundWind) han += 1;
  return han;
}

function findWinningGroup(groups, winTile) {
  return groups.find((g) => g.tiles.includes(winTile) && !g.consumed);
}

/** Ryanmen (two-sided) wait check for a sequence group containing winTile. */
function isRyanmenWait(group, winTile) {
  if (group.kind !== 'sequence') return false;
  const ranks = group.tiles.map((t) => RANK_OF[t]).sort((a, b) => a - b);
  const winRank = RANK_OF[winTile];
  const isEdge = (ranks[0] === 1 && winRank === 3) || (ranks[0] === 7 && winRank === 9);
  if (isEdge) return false;
  const isMiddle = winRank === ranks[1];
  return !isMiddle;
}

/**
 * Evaluates one decomposition of a winning hand and returns
 * { yakuList: [{name, han}], han, fu, yakuman, yakumanCount }.
 * Returns null (no yaku) if the hand has zero yaku — required to win.
 */
function evaluateDecomposition(decomp, ctx) {
  const { pair, groups } = decomp;
  const yakuList = [];
  let yakumanCount = 0;

  const allSimples = (ctx.handKind === 'chiitoitsu' || ctx.handKind === 'kokushi')
    ? ctx.concealedTiles
    : [pair, ...groups.flatMap((g) => g.tiles)];
  const suitsUsed = new Set(allSimples.filter((t) => TILE_TYPES_BY_ID[t].category === 'suit').map((t) => SUIT_OF[t]));
  const hasHonor = allSimples.some((t) => isHonor(t));
  const hasTerminal = allSimples.some((t) => isTerminal(t));
  const allTerminalOrHonor = allSimples.every((t) => isTerminalOrHonor(t));
  const allSequences = groups.every((g) => g.kind === 'sequence');
  const allTriplets = groups.every((g) => g.kind === 'triplet');
  const concealedTripletCount = groups.filter((g) => g.kind === 'triplet' && (!g.meld || g.meld.concealed)).length;

  // ---- Yakuman (checked first; if any apply, regular yaku are ignored) ----
  if (ctx.handKind === 'kokushi') {
    yakuList.push({ name: 'Kokushi Musou', han: 13 });
    yakumanCount += 1;
  }
  if (ctx.concealed && allTriplets && concealedTripletCount === 4) {
    yakuList.push({ name: 'Suuankou', han: 13 });
    yakumanCount += 1;
  }
  if (allTerminalOrHonor && hasHonor && !hasTerminal && suitsUsed.size === 0) {
    yakuList.push({ name: 'Tsuuiisou', han: 13 });
    yakumanCount += 1;
  }
  if (allTerminalOrHonor && !hasHonor) {
    yakuList.push({ name: 'Chinroutou', han: 13 });
    yakumanCount += 1;
  }
  if (allSimples.every((t) => GREEN_TILES.includes(t))) {
    yakuList.push({ name: 'Ryuuiisou', han: 13 });
    yakumanCount += 1;
  }
  {
    const dragonTriplets = groups.filter((g) => g.kind === 'triplet' && TILE_TYPES_BY_ID[g.tiles[0]].category === 'dragon');
    if (dragonTriplets.length === 3) { yakuList.push({ name: 'Daisangen', han: 13 }); yakumanCount += 1; }
  }
  if (ctx.openMelds && ctx.openMelds.filter((m) => m.kind === 'kan').length >= 4) {
    yakuList.push({ name: 'Suukantsu', han: 13 });
    yakumanCount += 1;
  }

  if (yakumanCount > 0) {
    const han = yakuList.reduce((s, y) => s + y.han, 0);
    return { yakuList, han, fu: 20, yakuman: true, yakumanCount };
  }

  // ---- Regular yaku ----
  if (ctx.handKind === 'chiitoitsu') {
    yakuList.push({ name: 'Chiitoitsu', han: 2 });
  }

  if (ctx.doubleRiichi) yakuList.push({ name: 'Double Riichi', han: 2 });
  else if (ctx.riichi) yakuList.push({ name: 'Riichi', han: 1 });
  if (ctx.riichi && ctx.ippatsu) yakuList.push({ name: 'Ippatsu', han: 1 });
  if (ctx.concealed && ctx.winType === 'tsumo' && ctx.handKind !== 'chiitoitsu') yakuList.push({ name: 'Menzen Tsumo', han: 1 });
  if (ctx.haitei) yakuList.push({ name: 'Haitei Raoyue', han: 1 });
  if (ctx.houtei) yakuList.push({ name: 'Houtei Raoyui', han: 1 });
  if (ctx.rinshan) yakuList.push({ name: 'Rinshan Kaihou', han: 1 });
  if (ctx.chankan) yakuList.push({ name: 'Chankan', han: 1 });

  if (ctx.handKind === 'standard') {
    if (!hasHonor && !hasTerminal) yakuList.push({ name: 'Tanyao', han: 1 });

    groups.forEach((g) => {
      if (g.kind === 'triplet') {
        const han = yakuhaiHanForTile(g.tiles[0], ctx.seatWind, ctx.roundWind);
        if (han > 0) yakuList.push({ name: `Yakuhai (${TILE_TYPES_BY_ID[g.tiles[0]].id})`, han });
      }
    });

    if (ctx.concealed && allSequences) {
      const winGroup = findWinningGroup(groups, ctx.winTile);
      const pairIsYakuhai = isYakuhaiTile(pair, ctx.seatWind, ctx.roundWind);
      if (winGroup && !pairIsYakuhai && isRyanmenWait(winGroup, ctx.winTile)) {
        yakuList.push({ name: 'Pinfu', han: 1 });
      }
    }

    if (allSequences) {
      const seqKeys = groups.map((g) => `${SUIT_OF[g.tiles[0]]}-${RANK_OF[g.tiles[0]]}`);
      const counts = {};
      seqKeys.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
      if (Object.values(counts).some((c) => c >= 2)) yakuList.push({ name: 'Iipeiko', han: ctx.concealed ? 1 : 0 });

      const startRanks = ['characters', 'bamboo', 'circle'].map((suit) => {
        const g = groups.find((gg) => SUIT_OF[gg.tiles[0]] === suit);
        return g ? RANK_OF[g.tiles[0]] : null;
      });
      if (startRanks.every((r) => r !== null) && startRanks[0] === startRanks[1] && startRanks[1] === startRanks[2]) {
        yakuList.push({ name: 'Sanshoku Doujun', han: ctx.concealed ? 2 : 1 });
      }

      ['characters', 'bamboo', 'circle'].forEach((suit) => {
        const ranksInSuit = groups.filter((g) => SUIT_OF[g.tiles[0]] === suit).map((g) => RANK_OF[g.tiles[0]]);
        if ([1, 4, 7].every((r) => ranksInSuit.includes(r))) yakuList.push({ name: 'Ittsu', han: ctx.concealed ? 2 : 1 });
      });
    }

    if (allTriplets) {
      yakuList.push({ name: 'Toitoi', han: 2 });
      const suitTripletRanks = {};
      groups.forEach((g) => {
        if (TILE_TYPES_BY_ID[g.tiles[0]].category === 'suit' && RANK_OF[g.tiles[0]] !== null) {
          const key = RANK_OF[g.tiles[0]];
          suitTripletRanks[key] = (suitTripletRanks[key] || new Set());
          suitTripletRanks[key].add(SUIT_OF[g.tiles[0]]);
        }
      });
      if (Object.values(suitTripletRanks).some((s) => s.size === 3)) yakuList.push({ name: 'Sanshoku Doukou', han: 2 });
    }
    if (concealedTripletCount === 3) yakuList.push({ name: 'Sanankou', han: 2 });

    const allGroupsTermHonor = groups.every((g) => g.tiles.some((t) => isTerminalOrHonor(t)) && g.tiles.every((t) => isTerminalOrHonor(t) || (g.kind === 'sequence')));
    const chantaShape = [pair, ...groups.map((g) => g.tiles)].every((grp) => {
      const arr = Array.isArray(grp) ? grp : [grp];
      return arr.some((t) => isTerminalOrHonor(t));
    });
    if (chantaShape) {
      if (!hasHonor) yakuList.push({ name: 'Junchan', han: ctx.concealed ? 3 : 2 });
      else yakuList.push({ name: 'Chanta', han: ctx.concealed ? 2 : 1 });
    }
  }

  if (hasHonor && suitsUsed.size === 1) yakuList.push({ name: 'Honitsu', han: ctx.concealed ? 3 : 2 });
  else if (!hasHonor && suitsUsed.size === 1) yakuList.push({ name: 'Chinitsu', han: ctx.concealed ? 6 : 5 });

  {
    const dragonTriplets = groups.filter((g) => g.kind === 'triplet' && TILE_TYPES_BY_ID[g.tiles[0]].category === 'dragon').length;
    const dragonPair = TILE_TYPES_BY_ID[pair] && TILE_TYPES_BY_ID[pair].category === 'dragon';
    if (dragonTriplets === 2 && dragonPair) yakuList.push({ name: 'Shousangen', han: 2 });
  }

  if (yakuList.length === 0) return null;

  const han = yakuList.reduce((s, y) => s + y.han, 0) + (ctx.doraCount || 0) + (ctx.uraDoraCount || 0);
  const fu = calculateFu(decomp, ctx);
  return { yakuList, han, fu, yakuman: false, yakumanCount: 0 };
}

function calculateFu(decomp, ctx) {
  if (ctx.handKind === 'chiitoitsu') return 25;

  const { pair, groups } = decomp;
  const isPinfu = ctx.concealed && groups.every((g) => g.kind === 'sequence');

  if (isPinfu) return ctx.winType === 'ron' ? 30 : 20;

  let fu = 20;
  if (ctx.concealed && ctx.winType === 'ron') fu += 10;
  if (ctx.winType === 'tsumo') fu += 2;

  groups.forEach((g) => {
    if (g.kind !== 'triplet') return;
    const termHonor = isTerminalOrHonor(g.tiles[0]);
    const concealedGroup = !g.meld || g.meld.concealed;
    if (g.meld && g.meld.kind === 'kan') fu += termHonor ? (concealedGroup ? 32 : 16) : (concealedGroup ? 16 : 8);
    else fu += termHonor ? (concealedGroup ? 8 : 4) : (concealedGroup ? 4 : 2);
  });

  if (isYakuhaiTile(pair, ctx.seatWind, ctx.roundWind)) {
    fu += 2 * yakuhaiHanForTile(pair, ctx.seatWind, ctx.roundWind);
  }

  const winGroup = findWinningGroup(groups, ctx.winTile) || (pair === ctx.winTile ? { kind: 'pair-wait' } : null);
  if (winGroup) {
    if (pair === ctx.winTile && groups.every((g) => !g.tiles.includes(ctx.winTile))) fu += 2; // tanki
    else if (winGroup.kind === 'sequence' && !isRyanmenWait(winGroup, ctx.winTile)) fu += 2; // kanchan/penchan
    else if (winGroup.kind === 'triplet' && ctx.winType === 'ron') fu += 0; // shanpon handled via triplet fu itself (open on ron)
  }

  return Math.ceil(fu / 10) * 10;
}

/** Tries every decomposition and returns the highest-scoring valid result. */
function bestYakuResult(winCheck, concealedTiles, ctx) {
  if (winCheck.kind === 'chiitoitsu' || winCheck.kind === 'kokushi') {
    return evaluateDecomposition({ pair: null, groups: [] }, { ...ctx, handKind: winCheck.kind, concealedTiles });
  }
  let best = null;
  winCheck.decompositions.forEach((decomp) => {
    const result = evaluateDecomposition(decomp, { ...ctx, handKind: 'standard' });
    if (result && (!best || compareResults(result, best) > 0)) best = result;
  });
  return best;
}

function compareResults(a, b) {
  if (a.yakuman !== b.yakuman) return a.yakuman ? 1 : -1;
  if (a.yakuman) return a.yakumanCount - b.yakumanCount;
  // Higher han always scores at least as many points as lower han (the
  // han/fu table is monotonic in han), so comparing han then fu picks the
  // best-scoring decomposition without needing dealer/win-type context here.
  if (a.han !== b.han) return a.han - b.han;
  return a.fu - b.fu;
}
