/* Rendering + interaction for the traditional 4-player table. */

let currentLang = getStoredLang();
let match = null;
let isHumanArr = [true, false, false, false];
let viewSeat = 0; // which human seat's hand is shown at the bottom right now

const el = (id) => document.getElementById(id);
const WIND_KEY = { wE: 'windE', wS: 'windS', wW: 'windW', wN: 'windN' };

function applyLang() {
  const dict = I18N[currentLang];
  document.documentElement.lang = currentLang === 'pt' ? 'pt-PT' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (dict[key] !== undefined) node.textContent = dict[key];
  });
  const toggle = el('lang-toggle');
  toggle.setAttribute('data-lang', currentLang);
  toggle.querySelectorAll('.lang-opt').forEach((opt) => {
    opt.classList.toggle('active', opt.getAttribute('data-lang-opt') === currentLang);
  });
  if (match) renderAll();
}
function setLang(lang) { currentLang = lang; setStoredLang(lang); applyLang(); }
function t(key) { return I18N[currentLang][key] || key; }

/* ---------------------------------------------------------------------
   Setup screen
   --------------------------------------------------------------------- */

function initSetup() {
  el('seat-picker').querySelectorAll('.seat-toggle').forEach((btn) => {
    const seat = Number(btn.dataset.seat);
    btn.classList.toggle('is-human', isHumanArr[seat]);
    btn.addEventListener('click', () => {
      isHumanArr[seat] = !isHumanArr[seat];
      btn.classList.toggle('is-human', isHumanArr[seat]);
    });
  });

  el('btn-start-match').addEventListener('click', () => {
    if (!isHumanArr.some(Boolean)) { showToast(currentLang === 'pt' ? 'Escolhe pelo menos 1 jogador humano.' : 'Pick at least 1 human player.'); return; }
    viewSeat = isHumanArr.indexOf(true);
    el('setup-screen').classList.add('hidden');
    el('table-screen').classList.remove('hidden');
    match = new LocalMatch({ isHuman: isHumanArr, onChange: onMatchEvent });
    match.startHand();
  });
}

/* ---------------------------------------------------------------------
   Match event handling
   --------------------------------------------------------------------- */

function onMatchEvent(event) {
  if (event.type === 'await-human-discard') viewSeat = match.engine.currentSeat;
  if (event.type === 'await-human-reaction') { handleAwaitHumanReaction(event); return; }
  if (event.type === 'hand-end') { renderAll(); showHandResult(event.result); return; }
  if (event.type === 'match-end') { showMatchEnd(); return; }
  renderAll();
}

/* ---------------------------------------------------------------------
   Rendering
   --------------------------------------------------------------------- */

function tileFaceHTML(typeId) {
  return TILE_TYPES_BY_ID[typeId].face();
}

function renderAll() {
  if (!match) return;
  const g = match.engine;
  el('round-info').textContent = `${t('roundLabel')} ${t(WIND_KEY[g.roundWind])} · ${t('handLabel')} ${match.handNumber}`;
  el('dora-info').textContent = `${t('doraLabel')}: ${g.doraIndicators().map((d) => TILE_TYPES_BY_ID[d].id).join(' ')}`;
  el('wall-count').textContent = g.liveWall.length;
  el('riichi-sticks-indicator').textContent = match.riichiSticksOnTable > 0 ? `${t('riichiSticksLabel')}: ${match.riichiSticksOnTable}` : '';

  renderOpponents();
  renderCenterStatus();
  renderHumanPanel();
}

function renderOpponents() {
  const g = match.engine;
  const row = el('opponents-row');
  row.innerHTML = '';
  for (let offset = 1; offset <= 3; offset++) {
    const seatIndex = (viewSeat + offset) % 4;
    const seat = g.seats[seatIndex];
    const panel = document.createElement('div');
    panel.className = `opponent-panel${g.currentSeat === seatIndex ? ' is-active' : ''}`;

    const head = document.createElement('div');
    head.className = 'opponent-head';
    head.innerHTML = `<span class="opponent-wind">${t(WIND_KEY[seat.wind])}${seatIndex === g.dealerSeat ? ' 🀄' : ''}</span>
      <span class="opponent-points">${seat.points}</span>`;
    panel.appendChild(head);

    const sub = document.createElement('div');
    sub.className = 'opponent-head';
    sub.innerHTML = `<span class="opponent-hand-count">${isHumanArr[seatIndex] ? t('you') : t('bot')}${seat.riichi ? ` · ${t('riichiBtn')}` : ''}</span>
      <span class="opponent-hand-count">${seat.hand.length} 🀫</span>`;
    panel.appendChild(sub);

    const melds = document.createElement('div');
    melds.className = 'opponent-melds';
    seat.melds.forEach((m) => {
      m.tiles.forEach((tl) => melds.appendChild(miniTileChip(tl, true)));
    });
    panel.appendChild(melds);

    const discards = document.createElement('div');
    discards.className = 'opponent-discards';
    seat.discards.forEach((d) => discards.appendChild(miniTileChip(d.tile, false)));
    panel.appendChild(discards);

    row.appendChild(panel);
  }
}

function miniTileChip(typeId, called) {
  const div = document.createElement('div');
  div.className = `mini-tile-chip${called ? ' is-called' : ''}`;
  div.innerHTML = tileFaceHTML(typeId);
  return div;
}

function renderCenterStatus() {
  const g = match.engine;
  const board = el('center-board');
  const isHumanTurn = isHumanArr[g.currentSeat] && (g.phase === 'draw' || g.phase === 'discard');
  board.classList.toggle('is-active', isHumanTurn);
  if (g.phase === 'reaction') board.textContent = t('waitingOthers');
  else if (isHumanArr[g.currentSeat]) board.textContent = viewSeat === g.currentSeat ? '' : t('waitingOthers');
  else board.textContent = `${t(WIND_KEY[g.seats[g.currentSeat].wind])} (${t('bot')})…`;
}

function renderHumanPanel() {
  const g = match.engine;
  const seat = g.seats[viewSeat];
  el('human-wind').textContent = `${t(WIND_KEY[seat.wind])}${viewSeat === g.dealerSeat ? ' 🀄' : ''}`;
  el('human-points').textContent = `${t('pointsLabel')}: ${seat.points}`;
  el('human-riichi-badge').classList.toggle('hidden', !seat.riichi);

  const meldsEl = el('human-melds');
  meldsEl.innerHTML = '';
  seat.melds.forEach((m) => m.tiles.forEach((tl) => meldsEl.appendChild(miniTileChip(tl, true))));

  const discardsEl = el('human-discards');
  discardsEl.innerHTML = '';
  seat.discards.forEach((d) => discardsEl.appendChild(miniTileChip(d.tile, false)));

  const isMyDiscardTurn = g.currentSeat === viewSeat && g.phase === 'discard' && isHumanArr[viewSeat];
  el('turn-hint').textContent = isMyDiscardTurn ? t('yourTurnDiscard') : '';

  const handEl = el('human-hand');
  handEl.innerHTML = '';
  const sorted = [...seat.hand].sort();
  sorted.forEach((tl) => {
    const div = document.createElement('div');
    div.className = `htile${tl === g.turnDrawnTile && g.currentSeat === viewSeat ? ' is-just-drawn' : ''}`;
    div.innerHTML = tileFaceHTML(tl);
    if (isMyDiscardTurn) div.addEventListener('click', () => match.humanDiscard(tl));
    handEl.appendChild(div);
  });

  renderHumanActions(isMyDiscardTurn, seat);
}

function renderHumanActions(isMyDiscardTurn, seat) {
  const actionsEl = el('human-actions');
  actionsEl.innerHTML = '';
  if (!isMyDiscardTurn) return;
  const g = match.engine;

  if (g.canDeclareTsumo()) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = t('tsumoBtn');
    btn.addEventListener('click', () => match.humanDeclareTsumo());
    actionsEl.appendChild(btn);
  }
  if (g.canDeclareRiichi(viewSeat)) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.textContent = t('riichiBtn');
    btn.addEventListener('click', () => match.humanDeclareRiichi());
    actionsEl.appendChild(btn);
  }
  const ankanOpts = g.canAnkan(viewSeat);
  ankanOpts.forEach((type) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost';
    btn.innerHTML = `${t('kanBtn')} ${TILE_TYPES_BY_ID[type].id}`;
    btn.addEventListener('click', () => match.humanAnkan(type));
    actionsEl.appendChild(btn);
  });
}

/* ---------------------------------------------------------------------
   Reaction modal
   --------------------------------------------------------------------- */

function handleAwaitHumanReaction(event) {
  viewSeat = event.seatIndex;
  renderAll();
  const g = match.engine;
  el('reaction-tile-label').innerHTML = `${TILE_TYPES_BY_ID[g.lastDiscard.tile].id} — ${tileFaceHTML(g.lastDiscard.tile)}`;
  const buttonsEl = el('reaction-buttons');
  buttonsEl.innerHTML = '';

  const addBtn = (label, onClick, primary) => {
    const btn = document.createElement('button');
    btn.className = primary ? 'btn btn-primary' : 'btn btn-ghost';
    btn.textContent = label;
    btn.addEventListener('click', () => { closeAllModals(); onClick(); });
    buttonsEl.appendChild(btn);
  };

  if (event.opts.ron) addBtn(t('ronBtn'), () => match.humanReact(event.seatIndex, 'ron'), true);
  if (event.opts.kan) addBtn(t('kanBtn'), () => match.humanReact(event.seatIndex, 'kan'), false);
  if (event.opts.pon) addBtn(t('ponBtn'), () => match.humanReact(event.seatIndex, 'pon'), false);
  event.opts.chi.forEach((pair) => {
    addBtn(`${t('chiBtn')} ${pair.map((p) => TILE_TYPES_BY_ID[p].id).join('+')}`, () => match.humanReact(event.seatIndex, { chi: pair }), false);
  });
  addBtn(t('passBtn'), () => match.humanReact(event.seatIndex, 'pass'), false);

  openModal('modal-reaction');
}

/* ---------------------------------------------------------------------
   Hand result / match end
   --------------------------------------------------------------------- */

function showHandResult(result) {
  const titleEl = el('hand-result-title');
  const bodyEl = el('hand-result-body');
  bodyEl.innerHTML = '';

  if (result.type === 'exhaustive') {
    titleEl.textContent = t('exhaustiveDrawTitle');
    [0, 1, 2, 3].forEach((i) => {
      const row = document.createElement('div');
      row.className = 'yaku-row';
      const isTenpai = result.tenpaiSeats.includes(i);
      row.innerHTML = `<span>${t(WIND_KEY[match.engine.seats[i].wind])} (${isHumanArr[i] ? t('you') : t('bot')})</span><span>${isTenpai ? t('tenpaiLabel') : t('notenLabel')}</span>`;
      bodyEl.appendChild(row);
    });
  } else {
    const winners = result.type === 'tsumo' ? [result] : result.winners;
    titleEl.textContent = result.type === 'tsumo' ? t('tsumoWinTitle') : t('ronWinTitle');
    winners.forEach((w) => {
      const seatLabel = document.createElement('div');
      seatLabel.className = 'yaku-row yaku-total';
      seatLabel.innerHTML = `<span>${t(WIND_KEY[match.engine.seats[w.seat !== undefined ? w.seat : result.seat].wind])}</span><span></span>`;
      bodyEl.appendChild(seatLabel);
      w.yakuList.forEach((y) => {
        const row = document.createElement('div');
        row.className = 'yaku-row';
        row.innerHTML = `<span>${y.name}</span><span>${y.han > 0 ? `${y.han} han` : ''}</span>`;
        bodyEl.appendChild(row);
      });
      const total = document.createElement('div');
      total.className = 'yaku-row yaku-total';
      total.innerHTML = `<span>${t('fuLabel')} ${w.fu} · ${t('hanLabel')} ${w.han}</span><span>${w.total} ${t('totalPoints')}</span>`;
      bodyEl.appendChild(total);
    });
  }

  openModal('modal-hand-result');
}

function showMatchEnd() {
  const g = match.engine;
  const standingsEl = el('final-standings');
  standingsEl.innerHTML = '';
  const order = [0, 1, 2, 3].map((i) => ({ i, points: match.points[i] })).sort((a, b) => b.points - a.points);
  order.forEach((entry, rank) => {
    const row = document.createElement('div');
    row.className = 'standing-row';
    row.innerHTML = `<span>#${rank + 1} — ${isHumanArr[entry.i] ? t('you') : t('bot')} (${t(WIND_KEY[['wE', 'wS', 'wW', 'wN'][entry.i]])})</span><span>${entry.points}</span>`;
    standingsEl.appendChild(row);
  });
  openModal('modal-match-end');
}

/* ---------------------------------------------------------------------
   Modal helpers / toast
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

let toastTimeout = null;
function showToast(msg) {
  const toastEl = el('toast');
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.add('hidden'), 2200);
}

/* ---------------------------------------------------------------------
   Init
   --------------------------------------------------------------------- */

function init() {
  applyLang();
  initSetup();
  el('lang-toggle').addEventListener('click', () => setLang(currentLang === 'pt' ? 'en' : 'pt'));
  el('btn-next-hand').addEventListener('click', () => { closeAllModals(); match.advanceToNextHand(); });
}

document.addEventListener('DOMContentLoaded', init);
