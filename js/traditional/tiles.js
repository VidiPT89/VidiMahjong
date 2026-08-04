/* Standard 136-tile Riichi set — reuses the 34 "standard" tile types (suits,
   winds, dragons) already defined in ../tiles-data.js for rendering, so tile
   faces stay pixel-identical between Solitaire and the traditional mode.
   Flowers/Seasons are intentionally excluded (not part of the base 136-tile
   Riichi wall). */

const STANDARD_TYPE_IDS = TILE_TYPES.filter(
  (t) => t.category === 'suit' || t.category === 'wind' || t.category === 'dragon',
).map((t) => t.id);

const SUIT_OF = {};
const RANK_OF = {};
STANDARD_TYPE_IDS.forEach((id) => {
  const t = TILE_TYPES_BY_ID[id];
  if (t.category === 'suit') { SUIT_OF[id] = t.suit; RANK_OF[id] = t.rank; }
  else { SUIT_OF[id] = t.category; RANK_OF[id] = null; }
});

const TYPE_INDEX = Object.fromEntries(STANDARD_TYPE_IDS.map((id, i) => [id, i]));

function isHonor(typeId) {
  const cat = TILE_TYPES_BY_ID[typeId].category;
  return cat === 'wind' || cat === 'dragon';
}
function isTerminal(typeId) {
  const t = TILE_TYPES_BY_ID[typeId];
  return t.category === 'suit' && (t.rank === 1 || t.rank === 9);
}
function isTerminalOrHonor(typeId) {
  return isHonor(typeId) || isTerminal(typeId);
}

/** Builds one shuffled 136-tile wall: [{id, typeId}]. */
function buildWall() {
  const tiles = [];
  let uid = 0;
  STANDARD_TYPE_IDS.forEach((typeId) => {
    for (let i = 0; i < 4; i++) tiles.push({ id: uid++, typeId });
  });
  shuffleArray(tiles);
  return tiles;
}

/**
 * Deals a fresh hand: 13 tiles to each of 4 seats (E/S/W/N), a 14-tile dead
 * wall (dora indicator = its first tile), and the remaining live wall to
 * draw from. Seat 0 is always the dealer (East).
 */
function dealWall() {
  const wall = buildWall();
  const hands = [[], [], [], []];
  for (let round = 0; round < 13; round++) {
    for (let seat = 0; seat < 4; seat++) hands[seat].push(wall.pop());
  }
  const deadWall = [];
  for (let i = 0; i < 14; i++) deadWall.push(wall.pop());
  return { liveWall: wall, deadWall, hands };
}
