const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./load-scripts');

const { MahjongGame, buildInfiniteLayout } = loadScripts(['js/tiles-data.js', 'js/layout.js', 'js/engine.js']);

test('the infinite layout always has an even tile count that grows with level', () => {
  let previousCount = 0;
  for (let level = 1; level <= 12; level++) {
    const layout = buildInfiniteLayout(level);
    assert.equal(layout.length % 2, 0, `level ${level} produced an odd tile count`);
    assert.ok(layout.length >= previousCount, `level ${level} should not be smaller than the previous level`);
    previousCount = layout.length;
  }
});

test('an infinite-mode board is solvable in its own proven order, same as the fixed difficulties', () => {
  [1, 3, 8].forEach((level) => {
    const game = new MahjongGame('infinite', level);
    const totalTiles = game.tiles.length;
    assert.equal(game._provenSolveOrder.length, totalTiles / 2);

    game._provenSolveOrder.forEach(([a, b]) => {
      assert.equal(game.select(a).type, 'selected');
      assert.equal(game.select(b).type, 'matched');
    });

    assert.equal(game.remaining(), 0);
  });
});

test('dealNextInfiniteLevel() advances the level and grows the board, without resetting moves', () => {
  const game = new MahjongGame('infinite', 1);
  const level1Size = game.tiles.length;
  game.moves = 7; // pretend a level was already played through

  game.dealNextInfiniteLevel();

  assert.equal(game.level, 2);
  assert.ok(game.tiles.length >= level1Size);
  assert.equal(game.moves, 7, 'moves should carry over across levels within the same run');
  assert.equal(game.remaining(), game.tiles.length);
});
