/* Loads the exact same browser game logic used by traditional.html (engine,
 * yaku/scoring, hand evaluation, bot AI, and the LocalMatch orchestration)
 * into a Node vm context, and re-exports what the server needs.
 *
 * Why vm instead of require(): those files are plain browser <script>s that
 * share an implicit global scope by concatenation order (TILE_TYPES,
 * checkWin, RiichiEngine, etc. all reference each other as bare globals).
 * Loading them into one vm context reproduces that same shared scope
 * without touching (or forking) the client files at all — the server runs
 * byte-for-byte the same logic that's already tested in the browser.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CLIENT_JS = path.join(__dirname, '..', 'js');

const files = [
  'tiles-data.js',
  'traditional/tiles.js',
  'traditional/hand-eval.js',
  'traditional/scoring.js',
  'traditional/yaku.js',
  'traditional/engine.js',
  'traditional/bot.js',
  'traditional/local-match.js',
];

const code = files.map((f) => fs.readFileSync(path.join(CLIENT_JS, f), 'utf8')).join('\n;\n');

const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval, Date };
vm.createContext(sandbox);
// `class` declarations (unlike `function` declarations) don't attach to the
// vm context's global object on their own — export them explicitly.
const exposeTail = `
;
this.RiichiEngine = RiichiEngine;
this.LocalMatch = LocalMatch;
this.chooseBotDiscard = chooseBotDiscard;
this.chooseBotReaction = chooseBotReaction;
this.chooseBotRiichi = chooseBotRiichi;
this.chooseBotAnkan = chooseBotAnkan;
this.TILE_TYPES_BY_ID = TILE_TYPES_BY_ID;
this.STANDARD_TYPE_IDS = STANDARD_TYPE_IDS;
`;
vm.runInContext(code + exposeTail, sandbox, { filename: 'shared-client-engine.js' });

module.exports = {
  RiichiEngine: sandbox.RiichiEngine,
  LocalMatch: sandbox.LocalMatch,
  chooseBotDiscard: sandbox.chooseBotDiscard,
  chooseBotReaction: sandbox.chooseBotReaction,
  chooseBotRiichi: sandbox.chooseBotRiichi,
  chooseBotAnkan: sandbox.chooseBotAnkan,
  TILE_TYPES_BY_ID: sandbox.TILE_TYPES_BY_ID,
  STANDARD_TYPE_IDS: sandbox.STANDARD_TYPE_IDS,
};
