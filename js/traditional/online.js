/* Online mode client — connects to the authoritative WebSocket server,
 * renders the same table-screen DOM used by local play, and sends the
 * player's actions as messages instead of calling LocalMatch directly.
 * Reuses helpers already defined by ui.js (same page, shared script scope):
 * el(), t(), tileFaceHTML(), miniTileChip(), openModal(), closeAllModals(),
 * showToast(), WIND_KEY, currentLang. */

let onlineSocket = null;
let onlineSeat = null;
let onlineRoomCode = null;
let onlineLastState = null;
let onlinePlayerId = null;

function getOrCreatePlayerId() {
  try {
    let id = localStorage.getItem('vidimahjong-player-id');
    if (!id) {
      id = 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('vidimahjong-player-id', id);
    }
    return id;
  } catch (e) {
    return 'p-' + Math.random().toString(36).slice(2);
  }
}

function getStoredServerUrl() {
  try { return localStorage.getItem('vidimahjong-server-url') || ''; } catch (e) { return ''; }
}
function storeServerUrl(url) {
  try { localStorage.setItem('vidimahjong-server-url', url); } catch (e) { /* ignore */ }
}

function onlineConnect(url) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      reject(e);
      return;
    }
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; socket.close(); reject(new Error('timeout')); }
    }, 8000);

    socket.addEventListener('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      onlineSocket = socket;
      wireSocketHandlers(socket);
      resolve(socket);
    });
    socket.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error('connection-failed'));
    });
  });
}

function wireSocketHandlers(socket) {
  socket.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    handleServerMessage(msg);
  });
  socket.addEventListener('close', () => {
    showToast(currentLang === 'pt' ? 'Ligação ao servidor perdida.' : 'Connection to server lost.');
  });
}

function onlineSend(payload) {
  if (onlineSocket && onlineSocket.readyState === 1) onlineSocket.send(JSON.stringify(payload));
}

function handleServerMessage(msg) {
  if (msg.type === 'joined') {
    onlineSeat = msg.seat;
    onlineRoomCode = msg.code;
    showOnlineRoomCard();
    return;
  }
  if (msg.type === 'error') {
    const map = {
      'room-not-found': t('roomNotFound'),
      'room-full-or-started': t('roomFull'),
    };
    el('online-status').textContent = map[msg.message] || msg.message;
    return;
  }
  if (msg.type === 'lobby') {
    renderLobbySeats(msg);
    return;
  }
  if (msg.type === 'state') {
    onlineLastState = msg;
    if (el('table-screen').classList.contains('hidden')) {
      el('online-lobby-screen').classList.add('hidden');
      el('table-screen').classList.remove('hidden');
    }
    renderOnlineTable(msg);
    if (msg.phase === 'ended') showOnlineHandResult(msg);
    if (msg.matchOver) showOnlineMatchEnd(msg);
    return;
  }
  if (msg.type === 'awaitReaction') {
    if (msg.seat === onlineSeat) showOnlineReactionPrompt(msg.opts);
    return;
  }
}

/* ---------------------------------------------------------------------
   Lobby UI
   --------------------------------------------------------------------- */

function renderLobbySeats(lobby) {
  const container = el('lobby-seats');
  container.innerHTML = '';
  lobby.seats.forEach((seat, i) => {
    const row = document.createElement('div');
    row.className = 'lobby-seat-row';
    if (!seat) {
      row.innerHTML = `<span>${t(WIND_KEY[['wE', 'wS', 'wW', 'wN'][i]])}</span><span class="lobby-seat-empty">${t('bot')}</span>`;
    } else {
      row.innerHTML = `<span>${t(WIND_KEY[['wE', 'wS', 'wW', 'wN'][i]])} — ${seat.name}</span><span class="${seat.connected ? 'lobby-seat-ok' : ''}">${seat.connected ? t('playerConnected') : t('playerWaiting')}</span>`;
    }
    container.appendChild(row);
  });
  el('btn-start-online').classList.toggle('hidden', !(onlineSeat === 0));
}

function showOnlineRoomCard() {
  el('online-connect-card').classList.add('hidden');
  el('online-room-card').classList.remove('hidden');
  el('room-code-display').textContent = onlineRoomCode;
}

/* ---------------------------------------------------------------------
   Table rendering (online) — mirrors ui.js's local renderer but reads from
   server-pushed state instead of a local LocalMatch instance.
   --------------------------------------------------------------------- */

function renderOnlineTable(st) {
  el('round-info').textContent = `${t('roundLabel')} ${t(WIND_KEY[st.roundWind])} · ${t('handLabel')} ${st.handNumber}`;
  el('dora-info').textContent = `${t('doraLabel')}: ${st.dora.map((d) => TILE_TYPES_BY_ID[d].id).join(' ')}`;
  el('wall-count').textContent = st.wallCount;
  el('riichi-sticks-indicator').textContent = st.riichiSticksOnTable > 0 ? `${t('riichiSticksLabel')}: ${st.riichiSticksOnTable}` : '';

  const row = el('opponents-row');
  row.innerHTML = '';
  for (let offset = 1; offset <= 3; offset++) {
    const seatIndex = (onlineSeat + offset) % 4;
    const seat = st.seats[seatIndex];
    const panel = document.createElement('div');
    panel.className = `opponent-panel${st.currentSeat === seatIndex ? ' is-active' : ''}`;

    const head = document.createElement('div');
    head.className = 'opponent-head';
    head.innerHTML = `<span class="opponent-wind">${t(WIND_KEY[seat.wind])}${seatIndex === st.dealerSeat ? ' 🀄' : ''}</span><span class="opponent-points">${seat.points}</span>`;
    panel.appendChild(head);

    const sub = document.createElement('div');
    sub.className = 'opponent-head';
    const label = seat.isBot ? t('bot') : (seat.isConnected ? seat.name : `${seat.name} (${t('playerWaiting')})`);
    sub.innerHTML = `<span class="opponent-hand-count">${label}${seat.riichi ? ` · ${t('riichiBtn')}` : ''}</span><span class="opponent-hand-count">${seat.handCount} 🀫</span>`;
    panel.appendChild(sub);

    const melds = document.createElement('div');
    melds.className = 'opponent-melds';
    seat.melds.forEach((m) => m.tiles.forEach((tl) => melds.appendChild(miniTileChip(tl, true))));
    panel.appendChild(melds);

    const discards = document.createElement('div');
    discards.className = 'opponent-discards';
    seat.discards.forEach((d) => discards.appendChild(miniTileChip(d.tile, false)));
    panel.appendChild(discards);

    row.appendChild(panel);
  }

  const board = el('center-board');
  const isMyTurn = st.currentSeat === onlineSeat && (st.phase === 'draw' || st.phase === 'discard');
  board.classList.toggle('is-active', isMyTurn);
  board.textContent = st.phase === 'reaction' ? t('waitingOthers') : (isMyTurn ? '' : t('waitingOthers'));

  const you = st.you;
  el('human-wind').textContent = `${t(WIND_KEY[st.seats[onlineSeat].wind])}${onlineSeat === st.dealerSeat ? ' 🀄' : ''}`;
  el('human-points').textContent = `${t('pointsLabel')}: ${you.points}`;
  el('human-riichi-badge').classList.toggle('hidden', !you.riichi);

  const meldsEl = el('human-melds');
  meldsEl.innerHTML = '';
  you.melds.forEach((m) => m.tiles.forEach((tl) => meldsEl.appendChild(miniTileChip(tl, true))));

  const discardsEl = el('human-discards');
  discardsEl.innerHTML = '';
  you.discards.forEach((d) => discardsEl.appendChild(miniTileChip(d.tile, false)));

  const isMyDiscardTurn = st.currentSeat === onlineSeat && st.phase === 'discard';
  el('turn-hint').textContent = isMyDiscardTurn ? t('yourTurnDiscard') : '';

  const handEl = el('human-hand');
  handEl.innerHTML = '';
  [...you.hand].sort().forEach((tl) => {
    const div = document.createElement('div');
    div.className = `htile${tl === st.turnDrawnTile ? ' is-just-drawn' : ''}`;
    div.innerHTML = tileFaceHTML(tl);
    if (isMyDiscardTurn) div.addEventListener('click', () => onlineSend({ type: 'discard', tile: tl }));
    handEl.appendChild(div);
  });

  const actionsEl = el('human-actions');
  actionsEl.innerHTML = '';
  if (isMyDiscardTurn) {
    if (st.canTsumo) actionsEl.appendChild(makeActionButton(t('tsumoBtn'), 'btn-primary', () => onlineSend({ type: 'tsumo' })));
    if (st.canRiichi) actionsEl.appendChild(makeActionButton(t('riichiBtn'), 'btn-secondary', () => onlineSend({ type: 'riichi' })));
    st.ankanOptions.forEach((type) => {
      actionsEl.appendChild(makeActionButton(`${t('kanBtn')} ${TILE_TYPES_BY_ID[type].id}`, 'btn-ghost', () => onlineSend({ type: 'ankan', tileType: type })));
    });
  }
}

function makeActionButton(label, cls, onClick) {
  const btn = document.createElement('button');
  btn.className = `btn ${cls}`;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function showOnlineReactionPrompt(opts) {
  const st = onlineLastState;
  el('reaction-tile-label').innerHTML = `${TILE_TYPES_BY_ID[st.lastDiscard.tile].id} — ${tileFaceHTML(st.lastDiscard.tile)}`;
  const buttonsEl = el('reaction-buttons');
  buttonsEl.innerHTML = '';

  const addBtn = (label, action, primary) => {
    const btn = document.createElement('button');
    btn.className = primary ? 'btn btn-primary' : 'btn btn-ghost';
    btn.textContent = label;
    btn.addEventListener('click', () => { closeAllModals(); onlineSend({ type: 'react', action }); });
    buttonsEl.appendChild(btn);
  };

  if (opts.ron) addBtn(t('ronBtn'), 'ron', true);
  if (opts.kan) addBtn(t('kanBtn'), 'kan', false);
  if (opts.pon) addBtn(t('ponBtn'), 'pon', false);
  opts.chi.forEach((pair) => addBtn(`${t('chiBtn')} ${pair.map((p) => TILE_TYPES_BY_ID[p].id).join('+')}`, { chi: pair }, false));
  addBtn(t('passBtn'), 'pass', false);

  openModal('modal-reaction');
}

function showOnlineHandResult(st) {
  const result = st.result;
  if (!result) return;
  const titleEl = el('hand-result-title');
  const bodyEl = el('hand-result-body');
  bodyEl.innerHTML = '';

  if (result.type === 'exhaustive') {
    titleEl.textContent = t('exhaustiveDrawTitle');
    [0, 1, 2, 3].forEach((i) => {
      const row = document.createElement('div');
      row.className = 'yaku-row';
      const isTenpai = result.tenpaiSeats.includes(i);
      row.innerHTML = `<span>${t(WIND_KEY[st.seats[i].wind])}</span><span>${isTenpai ? t('tenpaiLabel') : t('notenLabel')}</span>`;
      bodyEl.appendChild(row);
    });
  } else {
    const winners = result.type === 'tsumo' ? [result] : result.winners;
    titleEl.textContent = result.type === 'tsumo' ? t('tsumoWinTitle') : t('ronWinTitle');
    winners.forEach((w) => {
      const seatLabel = document.createElement('div');
      seatLabel.className = 'yaku-row yaku-total';
      seatLabel.innerHTML = `<span>${t(WIND_KEY[st.seats[w.seat !== undefined ? w.seat : result.seat].wind])}</span><span></span>`;
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

  el('btn-next-hand').onclick = () => { closeAllModals(); onlineSend({ type: 'nextHand' }); };
  openModal('modal-hand-result');
}

function showOnlineMatchEnd(st) {
  const standingsEl = el('final-standings');
  standingsEl.innerHTML = '';
  const order = [0, 1, 2, 3].map((i) => ({ i, points: st.points[i] })).sort((a, b) => b.points - a.points);
  order.forEach((entry, rank) => {
    const row = document.createElement('div');
    row.className = 'standing-row';
    const seat = st.seats[entry.i];
    row.innerHTML = `<span>#${rank + 1} — ${seat.isBot ? t('bot') : seat.name}</span><span>${entry.points}</span>`;
    standingsEl.appendChild(row);
  });
  openModal('modal-match-end');
}

/* ---------------------------------------------------------------------
   Wiring
   --------------------------------------------------------------------- */

function initOnline() {
  onlinePlayerId = getOrCreatePlayerId();
  el('server-url-input').value = getStoredServerUrl();

  el('btn-mode-online').addEventListener('click', () => {
    el('mode-select-screen').classList.add('hidden');
    el('online-lobby-screen').classList.remove('hidden');
  });
  el('btn-back-mode-2').addEventListener('click', () => {
    el('online-lobby-screen').classList.add('hidden');
    el('mode-select-screen').classList.remove('hidden');
  });

  el('btn-create-room').addEventListener('click', async () => {
    const url = el('server-url-input').value.trim();
    if (!url) return;
    storeServerUrl(url);
    el('online-status').textContent = t('connecting');
    try {
      await onlineConnect(url);
      onlineSend({ type: 'create', playerId: onlinePlayerId });
      el('online-status').textContent = '';
    } catch (e) {
      el('online-status').textContent = t('connectionError');
    }
  });

  el('btn-join-room').addEventListener('click', async () => {
    const url = el('server-url-input').value.trim();
    const code = el('room-code-input').value.trim().toUpperCase();
    if (!url || !code) return;
    storeServerUrl(url);
    el('online-status').textContent = t('connecting');
    try {
      await onlineConnect(url);
      onlineSend({ type: 'join', code, playerId: onlinePlayerId });
      el('online-status').textContent = '';
    } catch (e) {
      el('online-status').textContent = t('connectionError');
    }
  });

  el('btn-start-online').addEventListener('click', () => onlineSend({ type: 'start' }));
}

document.addEventListener('DOMContentLoaded', initOnline);
