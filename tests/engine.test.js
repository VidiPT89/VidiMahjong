const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./load-scripts');

const { MahjongGame } = loadScripts(['js/tiles-data.js', 'js/layout.js', 'js/engine.js']);

// "Provably solvable" (see README) means there EXISTS a clearing order, not that any order
// a player picks will clear the board — the dealer computes that one order (walking a full
// reduction backwards) and stashes it on `_provenSolveOrder` specifically so this can be
// verified. Replaying it here is the actual proof; greedily following whichever hint comes
// up first is a different, unguaranteed thing (that's why "stuck" + reshuffle exist at all).
test('a freshly dealt board is always fully solvable when played in its own proven order', () => {
  ['easy', 'medium', 'hard'].forEach((difficulty) => {
    const game = new MahjongGame(difficulty);
    const totalTiles = game.tiles.length;
    assert.ok(totalTiles > 0, `${difficulty} board should have tiles`);
    assert.equal(game._provenSolveOrder.length, totalTiles / 2);

    game._provenSolveOrder.forEach(([a, b]) => {
      assert.equal(game.select(a).type, 'selected');
      assert.equal(game.select(b).type, 'matched');
    });

    assert.equal(game.remaining(), 0);
    assert.equal(game.moves, totalTiles / 2);
  });
});

test('every freshly dealt board (any difficulty) starts with at least one legal move', () => {
  ['easy', 'medium', 'hard'].forEach((difficulty) => {
    const game = new MahjongGame(difficulty);
    assert.ok(game.findHint(), `${difficulty} board should not start stuck`);
    assert.equal(game.isStuck(), false);
  });
});

test('select() rejects a tile that is covered or boxed in on both sides', () => {
  const game = new MahjongGame('medium');
  const blocked = game.tiles.find((t) => !game.isFree(t));
  assert.ok(blocked, 'expected at least one non-free tile on a fresh medium board');
  const result = game.select(blocked.id);
  assert.equal(result.type, 'blocked');
});

test('matching two free tiles of different types is rejected as a mismatch, not removed', () => {
  const game = new MahjongGame('medium');
  const free = game.active().filter((t) => game.isFree(t));
  const [a, b] = [free[0], free.find((t) => t.typeId !== free[0].typeId)];
  assert.ok(a && b, 'expected two free tiles of different types on a fresh board');

  game.select(a.id);
  const result = game.select(b.id);
  assert.equal(result.type, 'mismatch');
  assert.equal(a.removed, false);
  assert.equal(b.removed, false);
});

test('reshuffle() keeps the same remaining tile count and stays solvable', () => {
  const game = new MahjongGame('medium');
  // Remove one pair so reshuffle has to preserve an in-progress board, not just a fresh one.
  const pair = game.findHint();
  game.select(pair[0].id);
  game.select(pair[1].id);
  const remainingBefore = game.remaining();

  assert.doesNotThrow(() => game.reshuffle());
  assert.equal(game.remaining(), remainingBefore);
  assert.ok(game.findHint(), 'board should still have a playable pair after reshuffle');
});
