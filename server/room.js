/* One online match: up to 4 human WebSocket connections, remaining seats
 * auto-filled with bots (same logic used in local play). The server is the
 * sole source of truth — every action a client sends is re-validated by the
 * shared engine (see engine.js's canDeclareTsumo/canAnkan/resolveReactions
 * guards) before it's allowed to change state, so a compromised or buggy
 * client can, at worst, get its own actions ignored. */

const ROOM_IDLE_TTL_MS = 30 * 60 * 1000; // rooms with no connected player for this long are swept

class Room {
  constructor(code, engineLib) {
    this.code = code;
    this.engineLib = engineLib;
    this.seats = [null, null, null, null]; // {ws, playerId, name} | null
    this.match = null;
    this.started = false;
    this.lastActivityAt = Date.now();
  }

  hasAnyConnection() {
    return this.seats.some((s) => s && s.ws && s.ws.readyState === 1);
  }

  findOpenSeat() {
    return this.seats.findIndex((s) => s === null);
  }

  seatIndexForPlayerId(playerId) {
    return this.seats.findIndex((s) => s && s.playerId === playerId);
  }

  seatIndexForWs(ws) {
    return this.seats.findIndex((s) => s && s.ws === ws);
  }

  /** Adds a new player, or reattaches an existing one's ws on reconnect. */
  addPlayer(ws, playerId, name) {
    this.lastActivityAt = Date.now();
    const existing = this.seatIndexForPlayerId(playerId);
    if (existing !== -1) {
      this.seats[existing].ws = ws;
      return { seatIndex: existing, reconnected: true };
    }
    if (this.started) return { seatIndex: -1, reconnected: false };
    const idx = this.findOpenSeat();
    if (idx === -1) return { seatIndex: -1, reconnected: false };
    this.seats[idx] = { ws, playerId, name: name || `Player ${idx + 1}` };
    return { seatIndex: idx, reconnected: false };
  }

  removeConnection(ws) {
    const idx = this.seatIndexForWs(ws);
    if (idx !== -1) this.seats[idx].ws = null; // seat stays reserved for reconnect
  }

  isEmpty() {
    return this.seats.every((s) => !s);
  }

  start() {
    if (this.started) return false;
    this.started = true;
    const isHuman = this.seats.map((s) => !!s);
    const { LocalMatch } = this.engineLib;
    this.match = new LocalMatch({ isHuman, onChange: (event) => this.onMatchEvent(event) });
    this.match.startHand();
    return true;
  }

  onMatchEvent(event) {
    this.lastActivityAt = Date.now();
    this.broadcastState();
    if (event.type === 'await-human-reaction') {
      this.sendToSeat(event.seatIndex, { type: 'awaitReaction', seat: event.seatIndex, opts: event.opts });
    }
  }

  sendToSeat(seatIndex, payload) {
    const seat = this.seats[seatIndex];
    if (seat && seat.ws && seat.ws.readyState === 1) {
      try { seat.ws.send(JSON.stringify(payload)); } catch (e) { /* dropped connection, ignore */ }
    }
  }

  broadcastState() {
    for (let i = 0; i < 4; i++) {
      if (this.seats[i] && this.seats[i].ws) this.sendToSeat(i, this.buildStateFor(i));
    }
  }

  buildLobbyState() {
    return {
      type: 'lobby',
      code: this.code,
      started: this.started,
      seats: this.seats.map((s) => (s ? { name: s.name, connected: !!s.ws } : null)),
    };
  }

  buildStateFor(seatIndex) {
    const m = this.match;
    const g = m.engine;
    const you = g.seats[seatIndex];
    return {
      type: 'state',
      you: {
        seat: seatIndex,
        hand: you.hand,
        melds: you.melds,
        discards: you.discards,
        riichi: you.riichi,
        points: you.points,
      },
      seats: g.seats.map((s, i) => ({
        seat: i,
        wind: s.wind,
        points: s.points,
        handCount: s.hand.length,
        melds: s.melds,
        discards: s.discards,
        riichi: s.riichi,
        isBot: !this.seats[i],
        isConnected: !!(this.seats[i] && this.seats[i].ws),
        name: this.seats[i] ? this.seats[i].name : null,
      })),
      dealerSeat: g.dealerSeat,
      roundWind: g.roundWind,
      handNumber: m.handNumber,
      dora: g.doraIndicators(),
      wallCount: g.liveWall.length,
      phase: g.phase,
      currentSeat: g.currentSeat,
      turnDrawnTile: seatIndex === g.currentSeat ? g.turnDrawnTile : null,
      lastDiscard: g.lastDiscard,
      matchOver: m.matchOver,
      points: m.points,
      riichiSticksOnTable: m.riichiSticksOnTable,
      result: g.phase === 'ended' ? g.result : null,
      canTsumo: seatIndex === g.currentSeat && g.phase !== 'ended' && g.canDeclareTsumo(),
      canRiichi: seatIndex === g.currentSeat && g.phase !== 'ended' && g.canDeclareRiichi(seatIndex),
      ankanOptions: seatIndex === g.currentSeat && g.phase !== 'ended' ? g.canAnkan(seatIndex) : [],
    };
  }

  /** Routes one message from a connected client. seatIndex is derived from
   *  the ws connection itself — never trust a client-supplied seat number. */
  handleMessage(ws, msg) {
    this.lastActivityAt = Date.now();
    const seatIndex = this.seatIndexForWs(ws);
    if (seatIndex === -1 || !this.match) return;
    const m = this.match;
    const g = m.engine;

    switch (msg.type) {
      case 'discard':
        if (seatIndex === g.currentSeat) m.humanDiscard(msg.tile);
        break;
      case 'react':
        m.humanReact(seatIndex, msg.action);
        break;
      case 'riichi':
        if (seatIndex === g.currentSeat) m.humanDeclareRiichi();
        break;
      case 'tsumo':
        if (seatIndex === g.currentSeat) m.humanDeclareTsumo();
        break;
      case 'ankan':
        if (seatIndex === g.currentSeat) m.humanAnkan(msg.tileType);
        break;
      case 'nextHand':
        if (g.phase === 'ended') m.advanceToNextHand();
        break;
      default:
        break;
    }
  }

  isStale() {
    return !this.hasAnyConnection() && (Date.now() - this.lastActivityAt) > ROOM_IDLE_TTL_MS;
  }

  destroy() {
    if (this.match) this.match.stop();
  }
}

module.exports = { Room, ROOM_IDLE_TTL_MS };
