/* Tile definitions (34 types / 144 instances) and hand-drawn SVG faces.
   No external image assets: every face is built from CJK glyphs (universal
   font fallback in every browser) plus small inline SVG ornaments, so the
   art stays crisp at any zoom level and never depends on emoji-font support. */

const SUIT_LABELS = {
  characters: { kanji: '萬', ink: '#c0392b' },
  bamboo: { kanji: '索', ink: '#1f7a4d' },
  circle: { kanji: '筒', ink: '#1d5fa8' },
};

const NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

// Dot / bamboo grid layouts per rank, shared between the circle and bamboo suits.
const PIP_ROWS = {
  1: [1], 2: [1, 1], 3: [1, 1, 1], 4: [2, 2], 5: [2, 1, 2],
  6: [2, 2, 2], 7: [2, 2, 2, 1], 8: [2, 2, 2, 2], 9: [3, 3, 3],
};

function dotsSVG(rank, colors) {
  const rows = PIP_ROWS[rank];
  const rowH = 100 / rows.length;
  let dots = '';
  rows.forEach((count, ri) => {
    const cy = rowH * ri + rowH / 2;
    const colW = 100 / count;
    for (let ci = 0; ci < count; ci++) {
      const cx = colW * ci + colW / 2;
      const color = colors[(ri + ci) % colors.length];
      dots += `<circle cx="${cx}" cy="${cy}" r="7.5" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="0.8"/>
        <circle cx="${cx - 2.2}" cy="${cy - 2.2}" r="2" fill="rgba(255,255,255,.55)"/>`;
    }
  });
  return `<svg viewBox="0 0 100 100" class="pip-art">${dots}</svg>`;
}

function bambooSVG(rank, gold) {
  const rows = PIP_ROWS[rank];
  const rowH = 100 / rows.length;
  const stick = (cx, cy, h, color) => `
    <rect x="${cx - 4.5}" y="${cy - h / 2}" width="9" height="${h}" rx="3.5" fill="${color}"/>
    <line x1="${cx - 4.5}" y1="${cy - h / 6}" x2="${cx + 4.5}" y2="${cy - h / 6}" stroke="rgba(0,0,0,.3)" stroke-width="1"/>
    <line x1="${cx - 4.5}" y1="${cy + h / 6}" x2="${cx + 4.5}" y2="${cy + h / 6}" stroke="rgba(0,0,0,.3)" stroke-width="1"/>`;
  let sticks = '';
  const color = gold ? '#c9932c' : '#2f9e5c';
  rows.forEach((count, ri) => {
    const cy = rowH * ri + rowH / 2;
    const colW = 100 / count;
    const h = Math.min(rowH * 0.82, 26);
    for (let ci = 0; ci < count; ci++) {
      const cx = colW * ci + colW / 2;
      sticks += stick(cx, cy, h, color);
    }
  });
  return `<svg viewBox="0 0 100 100" class="pip-art">${sticks}</svg>`;
}

const CIRCLE_COLORS = ['#1d5fa8', '#c0392b', '#1f7a4d'];

/** Builds the flat list of 34 tile "types" used across the game. */
function buildTileTypes() {
  const types = [];

  // Standard Mahjong notation (m=man/characters, s=sou/bamboo, p=pin/circle)
  // — using suit[0] here would collide, since "characters" and "circle"
  // both start with "c".
  const SUIT_PREFIX = { characters: 'm', bamboo: 's', circle: 'p' };
  ['characters', 'bamboo', 'circle'].forEach((suit) => {
    for (let rank = 1; rank <= 9; rank++) {
      types.push({
        id: `${SUIT_PREFIX[suit]}${rank}`,
        category: 'suit',
        suit,
        rank,
        count: 4,
        face: () => {
          if (suit === 'characters') {
            const { kanji, ink } = SUIT_LABELS.characters;
            return `<span class="glyph-stack">
              <span class="glyph-num" style="color:${ink}">${NUMERALS[rank]}</span>
              <span class="glyph-suit" style="color:#1a2233">${kanji}</span>
            </span>`;
          }
          if (suit === 'bamboo') return bambooSVG(rank, rank === 1);
          return dotsSVG(rank, CIRCLE_COLORS);
        },
      });
    }
  });

  const winds = [['E', '東'], ['S', '南'], ['W', '西'], ['N', '北']];
  winds.forEach(([code, kanji]) => {
    types.push({
      id: `w${code}`,
      category: 'wind',
      count: 4,
      face: () => `<span class="glyph-solo" style="color:#1a2233">${kanji}</span>`,
    });
  });

  types.push({
    id: 'dR', category: 'dragon', count: 4,
    face: () => `<span class="glyph-solo" style="color:#c0392b">中</span>`,
  });
  types.push({
    id: 'dG', category: 'dragon', count: 4,
    face: () => `<span class="glyph-solo" style="color:#1f7a4d">發</span>`,
  });
  types.push({
    id: 'dW', category: 'dragon', count: 4,
    face: () => `<span class="dragon-blank"></span>`,
  });

  const flowers = ['梅', '蘭', '竹', '菊'];
  flowers.forEach((kanji, i) => {
    types.push({
      id: `fl${i + 1}`, category: 'flower', count: 1,
      face: () => `<span class="glyph-solo bonus" style="color:#d1477a">${kanji}<i>${i + 1}</i></span>`,
    });
  });

  const seasons = ['春', '夏', '秋', '冬'];
  seasons.forEach((kanji, i) => {
    types.push({
      id: `se${i + 1}`, category: 'season', count: 1,
      face: () => `<span class="glyph-solo bonus" style="color:#1d5fa8">${kanji}<i>${i + 1}</i></span>`,
    });
  });

  return types;
}

const TILE_TYPES = buildTileTypes();
const TILE_TYPES_BY_ID = Object.fromEntries(TILE_TYPES.map((t) => [t.id, t]));

if (typeof console !== 'undefined' && console.assert) {
  const total = TILE_TYPES.reduce((sum, t) => sum + t.count, 0);
  const standardTypes = TILE_TYPES.filter((t) => t.category === 'suit' || t.category === 'wind' || t.category === 'dragon').length;
  console.assert(total === 144, `Tile pool must total 144, got ${total}`);
  console.assert(standardTypes === 34, `Expected 34 standard tile types (suits+winds+dragons), got ${standardTypes}`);
}

/** Two tile instances match if they can legally form a pair. */
function tilesMatch(typeIdA, typeIdB) {
  if (typeIdA === typeIdB) {
    const t = TILE_TYPES_BY_ID[typeIdA];
    return t.category !== 'flower' && t.category !== 'season';
  }
  const a = TILE_TYPES_BY_ID[typeIdA];
  const b = TILE_TYPES_BY_ID[typeIdB];
  if (a.category === 'flower' && b.category === 'flower') return true;
  if (a.category === 'season' && b.category === 'season') return true;
  return false;
}

/**
 * Builds 72 shuffled "pair units" (each a matching [typeA, typeB]) covering
 * all 144 tiles. Consumed by engine.js, which assigns each unit to a pair of
 * board positions that are guaranteed to be simultaneously free at some
 * point during a full solve — see computeSolvablePairing().
 */
function buildShuffledPairUnits() {
  const units = [];
  TILE_TYPES.filter((t) => t.category !== 'flower' && t.category !== 'season')
    .forEach((t) => {
      units.push([t.id, t.id]);
      units.push([t.id, t.id]);
    });

  const flowerIds = TILE_TYPES.filter((t) => t.category === 'flower').map((t) => t.id);
  const seasonIds = TILE_TYPES.filter((t) => t.category === 'season').map((t) => t.id);
  shuffleArray(flowerIds);
  shuffleArray(seasonIds);
  units.push([flowerIds[0], flowerIds[1]]);
  units.push([flowerIds[2], flowerIds[3]]);
  units.push([seasonIds[0], seasonIds[1]]);
  units.push([seasonIds[2], seasonIds[3]]);

  shuffleArray(units);
  units.forEach((unit) => { if (Math.random() < 0.5) unit.reverse(); });
  return units;
}

/** Easy mode's pool: numbered suit tiles only (27 types x4 = 108), no
 *  winds/dragons/bonus tiles to memorize the positions of. */
function buildEasyPairUnits() {
  const units = [];
  TILE_TYPES.filter((t) => t.category === 'suit')
    .forEach((t) => {
      units.push([t.id, t.id]);
      units.push([t.id, t.id]);
    });
  shuffleArray(units);
  units.forEach((unit) => { if (Math.random() < 0.5) unit.reverse(); });
  return units;
}

/** Picks the right pair-unit pool for a fresh deal at the given difficulty. */
function buildPairUnitsForDifficulty(difficulty) {
  return difficulty === 'easy' ? buildEasyPairUnits() : buildShuffledPairUnits();
}

/** Builds matching pair-units from whatever type inventory is passed in
 *  (e.g. the types still on the board when reshuffling mid-game). */
function buildPairUnitsFromInventory(typeCounts) {
  const units = [];
  const bonus = { flower: [], season: [] };

  Object.entries(typeCounts).forEach(([id, count]) => {
    const t = TILE_TYPES_BY_ID[id];
    if (t.category === 'flower' || t.category === 'season') {
      for (let i = 0; i < count; i++) bonus[t.category].push(id);
    } else {
      let n = count;
      while (n >= 2) { units.push([id, id]); n -= 2; }
    }
  });

  ['flower', 'season'].forEach((cat) => {
    shuffleArray(bonus[cat]);
    while (bonus[cat].length >= 2) units.push([bonus[cat].pop(), bonus[cat].pop()]);
  });

  shuffleArray(units);
  units.forEach((unit) => { if (Math.random() < 0.5) unit.reverse(); });
  return units;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
