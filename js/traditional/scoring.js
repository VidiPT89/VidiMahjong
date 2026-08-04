/* Han/fu → points conversion and ron/tsumo payment split, standard table. */

function baseScoreFromHanFu(han, fu, yakuman, yakumanCount) {
  if (yakuman) return 8000 * yakumanCount;
  if (han >= 13) return 8000; // kazoe yakuman (counted yakuman by han)
  if (han >= 11) return 6000; // sanbaiman
  if (han >= 8) return 4000; // baiman
  if (han >= 6) return 3000; // haneman
  if (han >= 5) return 2000; // mangan
  let base = fu * (2 ** (2 + han));
  if (base > 2000) base = 2000; // kiriage mangan
  return base;
}

function roundUpTo100(n) {
  return Math.ceil(n / 100) * 100;
}

/**
 * result: { han, fu, yakuman, yakumanCount } from bestYakuResult().
 * seat: { isDealer }. winType: 'ron' | 'tsumo'.
 * Returns { base, total, payments } where payments describes who pays what.
 */
function scorePoints(result, { isDealer, winType }) {
  const base = baseScoreFromHanFu(result.han, result.fu, result.yakuman, result.yakumanCount);

  if (winType === 'ron') {
    const payment = roundUpTo100(base * (isDealer ? 6 : 4));
    return { base, total: payment, payments: { fromDiscarder: payment } };
  }

  if (isDealer) {
    const each = roundUpTo100(base * 2);
    return { base, total: each * 3, payments: { fromEachNonDealer: each } };
  }

  const fromDealer = roundUpTo100(base * 2);
  const fromNonDealer = roundUpTo100(base * 1);
  return { base, total: fromDealer + fromNonDealer * 2, payments: { fromDealer, fromEachNonDealer: fromNonDealer } };
}
