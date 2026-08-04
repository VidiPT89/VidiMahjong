/* Board layout: fixed coordinate table for the 144-tile "Turtle" spread.
   Grid is aligned (no half-cell offset between layers) — free-tile checks
   only ever compare integer (x, y, z), which keeps the covering/open-side
   rules simple and unambiguous. Visual staggering between layers is done
   purely in CSS (a few px nudge per layer), it never touches game logic. */

function buildTurtleLayout() {
  const positions = [];
  const push = (x, y, z) => positions.push({ x, y, z });

  // Layer 0 — base silhouette (widths: 11,13,15,15,15,15,13,11 = 108)
  const baseRows = [
    { y: 0, x0: 2, x1: 12 },
    { y: 1, x0: 1, x1: 13 },
    { y: 2, x0: 0, x1: 14 },
    { y: 3, x0: 0, x1: 14 },
    { y: 4, x0: 0, x1: 14 },
    { y: 5, x0: 0, x1: 14 },
    { y: 6, x0: 1, x1: 13 },
    { y: 7, x0: 2, x1: 12 },
  ];
  baseRows.forEach(({ y, x0, x1 }) => {
    for (let x = x0; x <= x1; x++) push(x, y, 0);
  });

  // Flippers — two single-tile columns left/right at the mid rows (4)
  push(-1, 3, 0);
  push(-1, 4, 0);
  push(15, 3, 0);
  push(15, 4, 0);

  // Layers 2 (bottom of stack, indexes shifted) — every upper layer is at
  // least 2 tiles wide on every row, so a lone unpairable tile can never
  // occur at the peak (see engine.js computeSolvablePairing for why width-1
  // layers are risky: a single isolated tile has no simultaneous partner).

  // Layer 1 — 4 wide x 4 tall, centered (16)
  for (let y = 2; y <= 5; y++) {
    for (let x = 6; x <= 9; x++) push(x, y, 1);
  }

  // Layer 2 — 4 wide x 2 tall (8)
  for (let y = 3; y <= 4; y++) {
    for (let x = 6; x <= 9; x++) push(x, y, 2);
  }

  // Layer 3 — 2 wide x 2 tall (4)
  for (let y = 3; y <= 4; y++) {
    for (let x = 7; x <= 8; x++) push(x, y, 3);
  }

  // Layer 4 — the cap, 2 wide x 2 tall (4)
  for (let y = 3; y <= 4; y++) {
    for (let x = 7; x <= 8; x++) push(x, y, 4);
  }

  return positions;
}

const TURTLE_LAYOUT = buildTurtleLayout();

/* Easy — the turtle's flat base silhouette alone, no flippers, no upper
   layers. Nothing is ever covered, so only the left/right "blocked" rule
   applies; combined with a suits-only tile pool (no honor/bonus tiles to
   memorize), this is a much gentler introduction than the full spread. */
function buildEasyLayout() {
  const positions = [];
  const push = (x, y, z) => positions.push({ x, y, z });
  const baseRows = [
    { y: 0, x0: 2, x1: 12 },
    { y: 1, x0: 1, x1: 13 },
    { y: 2, x0: 0, x1: 14 },
    { y: 3, x0: 0, x1: 14 },
    { y: 4, x0: 0, x1: 14 },
    { y: 5, x0: 0, x1: 14 },
    { y: 6, x0: 1, x1: 13 },
    { y: 7, x0: 2, x1: 12 },
  ];
  baseRows.forEach(({ y, x0, x1 }) => {
    for (let x = x0; x <= x1; x++) push(x, y, 0);
  });
  return positions;
}

/* Hard — the same 144-tile footprint as the default turtle, but the 32
   tiles above the base are stacked into five progressively narrower
   layers instead of four, for a taller peak with more covering to dig
   through. Every layer stays at least 2 tiles wide, so the "simultaneous
   freeness" solvability proof in engine.js still holds. */
function buildHardLayout() {
  const positions = [];
  const push = (x, y, z) => positions.push({ x, y, z });

  const baseRows = [
    { y: 0, x0: 2, x1: 12 },
    { y: 1, x0: 1, x1: 13 },
    { y: 2, x0: 0, x1: 14 },
    { y: 3, x0: 0, x1: 14 },
    { y: 4, x0: 0, x1: 14 },
    { y: 5, x0: 0, x1: 14 },
    { y: 6, x0: 1, x1: 13 },
    { y: 7, x0: 2, x1: 12 },
  ];
  baseRows.forEach(({ y, x0, x1 }) => {
    for (let x = x0; x <= x1; x++) push(x, y, 0);
  });
  push(-1, 3, 0);
  push(-1, 4, 0);
  push(15, 3, 0);
  push(15, 4, 0);

  // Layer 1 — 4 wide x 4 tall, centered (16)
  for (let y = 2; y <= 5; y++) {
    for (let x = 6; x <= 9; x++) push(x, y, 1);
  }
  // Layer 2 — 4 wide x 2 tall (8)
  for (let y = 3; y <= 4; y++) {
    for (let x = 6; x <= 9; x++) push(x, y, 2);
  }
  // Layer 3 — 2 wide x 2 tall (4)
  for (let y = 3; y <= 4; y++) {
    for (let x = 7; x <= 8; x++) push(x, y, 3);
  }
  // Layer 4 — 2 wide x 1 tall (2)
  for (let x = 7; x <= 8; x++) push(x, 3, 4);
  // Layer 5 — the cap, 2 wide x 1 tall (2)
  for (let x = 7; x <= 8; x++) push(x, 3, 5);

  return positions;
}

const EASY_LAYOUT = buildEasyLayout();
const HARD_LAYOUT = buildHardLayout();

const LAYOUTS = { easy: EASY_LAYOUT, medium: TURTLE_LAYOUT, hard: HARD_LAYOUT };
const LAYOUT_TILE_COUNT = { easy: 108, medium: 144, hard: 144 };

if (typeof console !== 'undefined' && console.assert) {
  console.assert(TURTLE_LAYOUT.length === 144, `Layout must have 144 tiles, has ${TURTLE_LAYOUT.length}`);
  console.assert(EASY_LAYOUT.length === 108, `Easy layout must have 108 tiles, has ${EASY_LAYOUT.length}`);
  console.assert(HARD_LAYOUT.length === 144, `Hard layout must have 144 tiles, has ${HARD_LAYOUT.length}`);
}
