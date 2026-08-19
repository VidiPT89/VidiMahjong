/* Rendering, screen navigation, animation and persistence glue. */

const SAVE_KEY = 'vidimahjong-save';
const DIFFICULTY_KEY = 'vidimahjong-difficulty';

let currentLang = getStoredLang();
let game = null;
let timerInterval = null;
let hintTimeout = null;

function getStoredDifficulty() {
  try {
    const stored = localStorage.getItem(DIFFICULTY_KEY);
    if (stored && (stored === 'infinite' || LAYOUTS[stored])) return stored;
  } catch (e) { /* localStorage unavailable */ }
  return 'easy';
}
function setStoredDifficulty(difficulty) {
  try { localStorage.setItem(DIFFICULTY_KEY, difficulty); } catch (e) { /* ignore */ }
}
let selectedDifficulty = getStoredDifficulty();

function applyDifficultyUI() {
  document.querySelectorAll('.difficulty-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.difficulty === selectedDifficulty);
  });
  const bestLevel = getInfiniteBestLevel();
  const label = el('infinite-best-label');
  if (bestLevel > 0) {
    label.textContent = I18N[currentLang].infiniteBestLabel.replace('{level}', bestLevel);
    label.classList.remove('hidden');
  } else {
    label.classList.add('hidden');
  }
}

const el = (id) => document.getElementById(id);
const boardEl = () => el('board');

/* ---------------------------------------------------------------------
   i18n
   --------------------------------------------------------------------- */

function applyLang() {
  const dict = I18N[currentLang];
  document.documentElement.lang = currentLang === 'pt' ? 'pt-PT' : 'en';
  document.title = dict.metaTitle;

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (dict[key] !== undefined) node.textContent = dict[key];
  });

  const toggle = el('lang-toggle');
  toggle.setAttribute('data-lang', currentLang);
  toggle.querySelectorAll('.lang-opt').forEach((opt) => {
    opt.classList.toggle('active', opt.getAttribute('data-lang-opt') === currentLang);
  });

}

function setLang(lang) {
  currentLang = lang;
  setStoredLang(lang);
  applyLang();
}

/* ---------------------------------------------------------------------
   Screen navigation
   --------------------------------------------------------------------- */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  el(id).classList.remove('hidden');
}

function setHtpTab(mode) {
  const isRiichi = mode === 'riichi';
  el('htp-tab-solitaire').classList.toggle('active', !isRiichi);
  el('htp-tab-riichi').classList.toggle('active', isRiichi);
  el('htp-panel-solitaire').classList.toggle('hidden', isRiichi);
  el('htp-panel-riichi').classList.toggle('hidden', !isRiichi);
}

// Lets traditional.html's own "How to Play" link jump straight past the splash into the
// Riichi tab (index.html?htp=riichi) instead of always landing on the menu first.
let pendingHtpTab = new URLSearchParams(location.search).get('htp');

function goToMenu() {
  stopTimer();
  if (pendingHtpTab) {
    const tab = pendingHtpTab;
    pendingHtpTab = null;
    setHtpTab(tab);
    showScreen('htp-screen');
    return;
  }
  showScreen('menu-screen');
  el('btn-continue').classList.toggle('hidden', !hasSavedGame());
}

/* ---------------------------------------------------------------------
   Splash sequence
   --------------------------------------------------------------------- */

function initSplash() {
  const container = el('splash-tiles');
  const count = 9;
  for (let i = 0; i < count; i++) {
    const t = document.createElement('div');
    t.className = 'splash-flying-tile';
    const angle = (i / count) * Math.PI * 2;
    const dist = 260 + Math.random() * 140;
    t.style.setProperty('--fx', `${Math.cos(angle) * dist}px`);
    t.style.setProperty('--fy', `${Math.sin(angle) * dist}px`);
    t.style.setProperty('--fr', `${(Math.random() * 80 - 40)}deg`);
    t.style.left = `calc(50% - var(--tile-w) / 2)`;
    t.style.top = `calc(50% - var(--tile-h) / 2)`;
    t.style.animationDelay = `${Math.random() * 300}ms`;
    container.appendChild(t);
  }

  let left = false;
  const leave = () => {
    if (left) return;
    left = true;
    const splash = el('splash-screen');
    splash.classList.add('leaving');
    setTimeout(() => { goToMenu(); }, 550);
  };

  el('splash-skip').addEventListener('click', leave);
  el('splash-screen').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    leave();
  });
  setTimeout(leave, 4600);
}

/* ---------------------------------------------------------------------
   Board rendering / tile sizing
   --------------------------------------------------------------------- */

// Extents depend on which difficulty's layout is active (Easy drops the
// flippers and every upper layer; Hard adds a 5th one) — computed from the
// game's own tiles rather than a single fixed layout, so board sizing and
// tile placement stay correct no matter which one is in play.
let EXTENTS = { minX: -1, maxX: 15, minY: 0, maxY: 7, maxZ: 4 };

function layoutExtentsFor(positions) {
  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  const zs = positions.map((p) => p.z);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    maxZ: Math.max(...zs),
  };
}

// A comfortably tappable floor — the board-wrap scrolls when the full
// spread doesn't fit, so tiles never need to shrink below this just to
// avoid overflow (mobile tiles were previously getting crushed to 24px).
const MIN_TILE_W = 34;

function computeTileSize() {
  const wrap = document.querySelector('.board-wrap');
  const spanX = EXTENTS.maxX - EXTENTS.minX;
  const availW = Math.max(wrap.clientWidth - 40, 280);
  const availH = Math.max(window.innerHeight - 220, 320);

  let tileW = availW / (spanX * 0.86 + 1);
  const spanY = EXTENTS.maxY - EXTENTS.minY;
  const tileWFromH = availH / ((spanY * 0.82 + 1) * 1.37 + EXTENTS.maxZ * 0.18);
  tileW = Math.min(tileW, tileWFromH);
  tileW = Math.max(MIN_TILE_W, Math.min(62, tileW));

  const tileH = tileW * 1.37;
  const stepX = tileW * 0.86;
  const stepY = tileH * 0.82;
  const nudge = tileW * 0.13;

  const root = document.documentElement.style;
  root.setProperty('--tile-w', `${tileW}px`);
  root.setProperty('--tile-h', `${tileH}px`);
  root.setProperty('--tile-step-x', `${stepX}px`);
  root.setProperty('--tile-step-y', `${stepY}px`);
  root.setProperty('--layer-nudge', `${nudge}px`);

  const board = boardEl();
  board.style.width = `${spanX * stepX + tileW + EXTENTS.maxZ * nudge}px`;
  board.style.height = `${spanY * stepY + tileH + EXTENTS.maxZ * nudge}px`;
}

function tilePosition(tile) {
  const stepX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-step-x'));
  const stepY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-step-y'));
  const nudge = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--layer-nudge'));
  const left = (tile.x - EXTENTS.minX) * stepX + tile.z * nudge * 0.5;
  const top = (tile.y - EXTENTS.minY) * stepY - tile.z * nudge + EXTENTS.maxZ * nudge;
  return { left, top };
}

function tileZIndex(tile) {
  return tile.z * 1000 + tile.y * 10 + (tile.x + 2);
}

/**
 * `is-dealing` and other animation classes (`is-mismatch`, `is-matched`)
 * all set the `animation` shorthand at the same specificity — whichever
 * rule is declared later in style.css wins the cascade regardless of which
 * class was added most recently. If `is-dealing` is left on a tile forever,
 * it permanently shadows every later animation (mismatch never shakes,
 * matched tiles never fly away — they just snap away instead), and
 * *restarting* it via a reflow trick (e.g. to replay the mismatch shake)
 * replays dealIn's `opacity: 0` starting frame, which is what looked like
 * tiles vanishing and reappearing. So: always strip it once its own
 * entrance animation finishes.
 */
function armDealingCleanup(div) {
  div.addEventListener('animationend', () => div.classList.remove('is-dealing'), { once: true });
}

/* Deals tiles from the center of the board outward, so the pyramid visibly builds up from
 * the middle instead of appearing in a random order. Distance is normalized against the
 * board's own extents so the spread of delays looks consistent across difficulties/board
 * sizes. */
function dealDelayMs(tile) {
  const centerX = (EXTENTS.minX + EXTENTS.maxX) / 2;
  const centerY = (EXTENTS.minY + EXTENTS.maxY) / 2;
  const maxDist = Math.hypot(EXTENTS.maxX - centerX, EXTENTS.maxY - centerY) || 1;
  const dist = Math.hypot(tile.x - centerX, tile.y - centerY);
  return (dist / maxDist) * 260;
}

function renderTileEl(tile, { dealing } = {}) {
  const div = document.createElement('div');
  div.className = 'tile';
  div.dataset.id = tile.id;
  const { left, top } = tilePosition(tile);
  div.style.left = `${left}px`;
  div.style.top = `${top}px`;
  div.style.zIndex = tileZIndex(tile);
  if (dealing) {
    div.classList.add('is-dealing');
    div.style.animationDelay = `${dealDelayMs(tile)}ms`;
    armDealingCleanup(div);
  }

  const face = document.createElement('div');
  face.className = 'tile-face';
  face.innerHTML = TILE_TYPES_BY_ID[tile.typeId].face();
  div.appendChild(face);

  div.addEventListener('click', () => onTileClick(tile.id));
  return div;
}

function renderBoard({ dealing } = {}) {
  computeTileSize();
  const board = boardEl();
  board.innerHTML = '';
  game.active().forEach((tile) => board.appendChild(renderTileEl(tile, { dealing })));
  refreshTileStates();
}

function refreshTileStates() {
  const board = boardEl();
  board.querySelectorAll('.tile').forEach((div) => {
    const id = Number(div.dataset.id);
    const tile = game.getTile(id);
    if (!tile || tile.removed) return;
    const free = game.isFree(tile);
    div.classList.toggle('is-free', free);
    div.classList.toggle('is-blocked', !free);
    div.classList.toggle('is-covered-visual', game.isCovered(tile));
    div.classList.toggle('is-blocked-visual', !free && !game.isCovered(tile));
    div.classList.toggle('is-selected', game.selectedId === id);
  });
}

/* ---------------------------------------------------------------------
   Gameplay
   --------------------------------------------------------------------- */

function startNewGame() {
  game = new MahjongGame(selectedDifficulty, 1);
  EXTENTS = layoutExtentsFor(game.tiles);
  clearSavedGame();
  showScreen('game-screen');
  renderBoard({ dealing: true });
  updateStats();
  startTimer();
  el('btn-undo').disabled = true;
  saveGame();
}

function resumeGame() {
  const loaded = loadGame();
  if (!loaded) { startNewGame(); return; }
  game = loaded.game;
  EXTENTS = layoutExtentsFor(game.tiles);
  showScreen('game-screen');
  renderBoard({ dealing: false });
  updateStats();
  startTimer();
  el('btn-undo').disabled = game.history.length === 0;
}

function onTileClick(id) {
  if (document.querySelector('.modal:not(.hidden)')) return;
  const result = game.select(id);
  handleSelectResult(result);
}

function handleSelectResult(result) {
  const board = boardEl();

  if (result.type === 'ignored' || result.type === 'blocked') {
    if (result.type === 'blocked') {
      Sound.mismatch();
      const div = board.querySelector(`.tile[data-id="${result.tile.id}"]`);
      if (div) {
        div.classList.remove('is-mismatch');
        void div.offsetWidth;
        div.classList.add('is-mismatch');
        div.addEventListener('animationend', () => div.classList.remove('is-mismatch'), { once: true });
      }
    }
    return;
  }

  if (result.type === 'selected' || result.type === 'deselected') {
    if (result.type === 'selected') Sound.tilePick();
    refreshTileStates();
    return;
  }

  if (result.type === 'mismatch') {
    Sound.mismatch();
    // Only the rejected (previously-selected) tile shakes and deselects.
    // The newly-clicked tile becomes the new selection — it must show the
    // selected glow immediately, not shake: is-mismatch's keyframe
    // animation and is-selected's static transform both target `transform`,
    // so having both classes on the same tile at once let the shake
    // silently override the glow until the animation finished, then the
    // tile would suddenly snap into its lifted position — the "flicker"
    // this was reported as.
    const prevDiv = board.querySelector(`.tile[data-id="${result.previous.id}"]`);
    if (prevDiv) {
      prevDiv.classList.remove('is-selected', 'is-mismatch');
      void prevDiv.offsetWidth; // force reflow so the shake animation restarts even if it just played
      prevDiv.classList.add('is-mismatch');
      prevDiv.addEventListener('animationend', () => prevDiv.classList.remove('is-mismatch'), { once: true });
    }
    refreshTileStates();
    return;
  }

  if (result.type === 'matched') {
    Sound.match();
    [result.a, result.b].forEach((t) => {
      const div = board.querySelector(`.tile[data-id="${t.id}"]`);
      if (div) div.classList.add('is-matched');
    });
    game.moves; // noop, keeps intent clear
    updateScore(10);
    setTimeout(() => {
      [result.a, result.b].forEach((t) => {
        const div = board.querySelector(`.tile[data-id="${t.id}"]`);
        if (div) div.remove();
      });
      refreshTileStates();
      updateStats();
      el('btn-undo').disabled = false;
      saveGame();

      if (result.won) {
        if (game.difficulty === 'infinite') {
          onInfiniteLevelCleared();
        } else {
          onWin();
        }
      } else if (game.isStuck()) {
        onStuck();
      }
    }, 460);
  }
}

let score = 0;
function updateScore(delta) {
  score = Math.max(0, score + delta);
  el('stat-score').textContent = score;
}

function updateStats() {
  el('stat-moves').textContent = game.moves;
  el('stat-left').textContent = game.remaining();
  el('stat-score').textContent = score;
  const levelGroup = el('stat-level-group');
  if (game.difficulty === 'infinite') {
    el('stat-level').textContent = game.level;
    levelGroup.classList.remove('hidden');
  } else {
    levelGroup.classList.add('hidden');
  }
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - game.startedAt) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    el('stat-time').textContent = `${m}:${s}`;
  }, 250);
}
function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

function useHint() {
  const pair = game.findHint();
  if (!pair) { showToast(I18N[currentLang].noHintsLeft); return; }
  updateScore(-3);
  saveGame();

  const board = boardEl();
  clearTimeout(hintTimeout);
  board.querySelectorAll('.is-hint').forEach((d) => d.classList.remove('is-hint'));
  pair.forEach((t) => {
    const div = board.querySelector(`.tile[data-id="${t.id}"]`);
    if (div) div.classList.add('is-hint');
  });
  hintTimeout = setTimeout(() => {
    pair.forEach((t) => {
      const div = board.querySelector(`.tile[data-id="${t.id}"]`);
      if (div) div.classList.remove('is-hint');
    });
  }, 1700);
}

function doShuffle() {
  try {
    game.reshuffle();
  } catch (e) {
    // Extremely rare: the tiles still on the board are geometrically stuck
    // (e.g. one is permanently trapped under another) regardless of which
    // faces we assign them, so no shuffle can restore a solvable board.
    showToast(I18N[currentLang].shuffleImpossible);
    return;
  }
  updateScore(-2);
  renderBoard({ dealing: false });
  boardEl().querySelectorAll('.tile').forEach((d, i) => {
    d.style.animation = 'none';
    void d.offsetWidth;
    d.style.animation = '';
    d.classList.add('is-dealing');
    d.style.animationDelay = `${(i % 12) * 15}ms`;
    armDealingCleanup(d);
  });
  saveGame();
  closeAllModals();
  if (game.isStuck()) onStuck();
}

function doUndo() {
  const restored = game.undo();
  if (!restored) { showToast(I18N[currentLang].noMoreUndo); return; }
  renderBoard({ dealing: false });
  const board = boardEl();
  [restored.a, restored.b].forEach((t) => {
    const div = board.querySelector(`.tile[data-id="${t.id}"]`);
    if (div) { div.classList.add('is-dealing'); armDealingCleanup(div); }
  });
  updateStats();
  el('btn-undo').disabled = game.history.length === 0;
  saveGame();
  closeAllModals();
}

function requestRestart() {
  openModal('modal-confirm');
}

/* ---------------------------------------------------------------------
   Win / stuck
   --------------------------------------------------------------------- */

function onWin() {
  stopTimer();
  clearSavedGame();
  Sound.win();
  const elapsed = Math.floor((Date.now() - game.startedAt) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  el('win-time').textContent = `${m}:${s}`;
  el('win-moves').textContent = game.moves;
  el('win-score').textContent = score;
  renderLeaderboardBlock(recordLeaderboardWin(selectedDifficulty, elapsed, game.moves));
  openModal('modal-win');
  launchConfetti();
}

/**
 * Infinite mode never shows the "You Win" modal -- clearing a level just chains straight
 * into the next (bigger) one, so the run keeps going instead of stopping. Progress (the
 * highest level reached) is saved after every level, not just when the player eventually
 * quits, so it survives an accidental tab close mid-run.
 */
function onInfiniteLevelCleared() {
  const clearedLevel = game.level;
  const isNewRecord = recordInfiniteLevel(clearedLevel);
  Sound.win();
  showToast(
    (isNewRecord ? I18N[currentLang].newRecordLevel : I18N[currentLang].levelCleared)
      .replace('{level}', clearedLevel)
  );

  setTimeout(() => {
    game.dealNextInfiniteLevel();
    EXTENTS = layoutExtentsFor(game.tiles);
    renderBoard({ dealing: true });
    updateStats();
    el('btn-undo').disabled = true;
    saveGame();
  }, 900);
}

/* Fills in the "best time / best moves" block shown in the win modal, marking whichever
 * metric was just improved with the "New Best!" label (mirrors the leaderboard UI in the
 * DroidMahjong/iMahjong ports). */
function renderLeaderboardBlock({ entry, newBestTime, newBestMoves }) {
  const t = I18N[currentLang];
  const block = el('win-leaderboard');
  if (entry.bestTimeSeconds == null && entry.bestMoves == null) {
    block.classList.add('hidden');
    return;
  }
  block.classList.remove('hidden');

  if (entry.bestTimeSeconds != null) {
    const m = String(Math.floor(entry.bestTimeSeconds / 60)).padStart(2, '0');
    const s = String(entry.bestTimeSeconds % 60).padStart(2, '0');
    el('win-best-time-label').textContent = newBestTime ? t.newRecordTime : t.bestTime;
    el('win-best-time').textContent = `${m}:${s}`;
    el('win-best-time-block').classList.remove('hidden');
  } else {
    el('win-best-time-block').classList.add('hidden');
  }

  if (entry.bestMoves != null) {
    el('win-best-moves-label').textContent = newBestMoves ? t.newRecordMoves : t.bestMoves;
    el('win-best-moves').textContent = entry.bestMoves;
    el('win-best-moves-block').classList.remove('hidden');
  } else {
    el('win-best-moves-block').classList.add('hidden');
  }
}

function onStuck() {
  el('btn-stuck-undo').disabled = game.history.length === 0;
  openModal('modal-stuck');
}

/* ---------------------------------------------------------------------
   Modals
   --------------------------------------------------------------------- */

function openModal(id) {
  el('modal-overlay').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
  el(id).classList.remove('hidden');
}
function closeAllModals() {
  el('modal-overlay').classList.add('hidden');
  document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
}

/* ---------------------------------------------------------------------
   Confetti (win modal)
   --------------------------------------------------------------------- */

function launchConfetti() {
  const canvas = el('confetti-canvas');
  const modal = canvas.closest('.modal');
  canvas.width = modal.clientWidth;
  canvas.height = modal.clientHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#f59e0b', '#fbbf24', '#e2e8f0', '#3b82f6', '#22c55e'];
  const particles = Array.from({ length: 70 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    r: 3 + Math.random() * 4,
    c: colors[Math.floor(Math.random() * colors.length)],
    vy: 2 + Math.random() * 3,
    vx: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI,
    vr: -0.2 + Math.random() * 0.4,
  }));
  let frames = 0;
  function tick() {
    frames++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
      ctx.restore();
    });
    if (frames < 220) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  tick();
}

/* ---------------------------------------------------------------------
   Toast
   --------------------------------------------------------------------- */

let toastTimeout = null;
function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ---------------------------------------------------------------------
   Persistence
   --------------------------------------------------------------------- */

function saveGame() {
  if (!game) return;
  try {
    const data = {
      difficulty: game.difficulty,
      level: game.level,
      typeIds: game.tiles.map((t) => t.typeId),
      removed: game.tiles.map((t) => t.removed),
      moves: game.moves,
      history: game.history,
      elapsedMs: Date.now() - game.startedAt,
      score,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable — silently skip autosave */ }
}

function hasSavedGame() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

function clearSavedGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const g = new MahjongGame(data.difficulty || 'medium', data.level || 1);
    if (!data.typeIds || data.typeIds.length !== g.tiles.length) return null;
    g.tiles.forEach((t, i) => {
      t.typeId = data.typeIds[i];
      t.removed = data.removed[i];
    });
    g.moves = data.moves || 0;
    g.history = data.history || [];
    g.startedAt = Date.now() - (data.elapsedMs || 0);
    score = data.score || 0;
    return { game: g };
  } catch (e) {
    return null;
  }
}

/* ---------------------------------------------------------------------
   Wiring
   --------------------------------------------------------------------- */

function init() {
  applyLang();
  applyDifficultyUI();
  initSplash();

  el('lang-toggle').addEventListener('click', () => setLang(currentLang === 'pt' ? 'en' : 'pt'));

  document.querySelectorAll('.difficulty-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDifficulty = btn.dataset.difficulty;
      setStoredDifficulty(selectedDifficulty);
      applyDifficultyUI();
    });
  });

  el('btn-play').addEventListener('click', () => { score = 0; startNewGame(); });
  el('btn-continue').addEventListener('click', resumeGame);
  el('btn-how-to-play').addEventListener('click', () => showScreen('htp-screen'));
  el('btn-htp-back').addEventListener('click', goToMenu);
  el('btn-htp-close').addEventListener('click', goToMenu);

  el('htp-tab-solitaire').addEventListener('click', () => setHtpTab('solitaire'));
  el('htp-tab-riichi').addEventListener('click', () => setHtpTab('riichi'));

  el('btn-back-menu').addEventListener('click', () => { saveGame(); goToMenu(); });
  el('btn-hint').addEventListener('click', useHint);
  el('btn-shuffle').addEventListener('click', doShuffle);
  el('btn-undo').addEventListener('click', doUndo);
  el('btn-restart').addEventListener('click', requestRestart);

  el('btn-confirm-yes').addEventListener('click', () => { closeAllModals(); score = 0; startNewGame(); });
  el('btn-confirm-no').addEventListener('click', closeAllModals);

  el('btn-win-again').addEventListener('click', () => { closeAllModals(); score = 0; startNewGame(); });
  el('btn-win-menu').addEventListener('click', () => { closeAllModals(); goToMenu(); });

  el('btn-stuck-shuffle').addEventListener('click', doShuffle);
  el('btn-stuck-undo').addEventListener('click', doUndo);
  el('btn-stuck-menu').addEventListener('click', () => { closeAllModals(); saveGame(); goToMenu(); });

  window.addEventListener('resize', () => { if (game && !el('game-screen').classList.contains('hidden')) renderBoard({ dealing: false }); });
}

document.addEventListener('DOMContentLoaded', init);
