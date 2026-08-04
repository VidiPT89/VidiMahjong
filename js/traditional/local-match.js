/* Orchestrates a full local match (bots + humans on one device): chains
   RiichiEngine hands together with dealer rotation and running points, and
   drives bot turns automatically. UI layer subscribes via onChange(event)
   and calls the human* methods in response to taps.

   Scope simplification: plays a single East round (4 hands, one dealer
   turn each) — a common casual/"tonpuusen" format — rather than a full
   East+South hanchan, documented in the README. */

const BOT_DELAY_MS = 550;

class LocalMatch {
  constructor({ isHuman, onChange }) {
    this.isHuman = isHuman; // [bool,bool,bool,bool] by absolute seat 0..3
    this.onChange = onChange;
    this.points = [25000, 25000, 25000, 25000];
    this.riichiSticksOnTable = 0;
    this.roundWind = 'wE';
    this.handNumber = 1;
    this.dealerSeat = 0;
    this.matchOver = false;
    this._pendingReactionResponses = {};
    this._pendingHumanSeats = [];
    this._awaitingHumanReaction = false;
    this._gen = 0;
    this._lastProgressAt = Date.now();
    // Deliberately NOT calling startHand() here: it can synchronously emit
    // (e.g. dealer is human -> immediate 'await-human-discard'), and if that
    // happened during construction the caller's `match = new LocalMatch(...)`
    // assignment wouldn't have completed yet, so a render triggered by that
    // event would see a stale `match` reference. Callers must call
    // match.startHand() themselves right after construction.

    // Watchdog: browsers throttle setTimeout heavily in backgrounded/inactive
    // tabs, which can stall a scheduled bot action indefinitely. If no
    // progress has happened for a while and it's a bot's turn to act (not
    // waiting on a human), nudge the state machine forward. The generation
    // counter (_gen) invalidates whichever originally-scheduled timeout this
    // preempts, so if it eventually fires late it safely no-ops instead of
    // double-acting.
    this._watchdog = setInterval(() => {
      if (this.matchOver || !this.engine) return;
      if (Date.now() - this._lastProgressAt < 2500) return;
      if (this.engine.phase === 'ended') return;
      if (this.currentSeatIsHuman() && (this.engine.phase === 'draw' || this.engine.phase === 'discard')) return;
      if (this._awaitingHumanReaction) return;
      this._gen++;
      this._lastProgressAt = Date.now();
      if (this.engine.phase === 'reaction') this.resolveReactionPhase();
      else this.tick();
    }, 1000);
  }

  emit(event) {
    this._lastProgressAt = Date.now();
    this.onChange(event, this);
  }

  /** Schedules fn after delay, tagged with the current generation — if the
   *  watchdog invalidates that generation before it fires, it's a no-op. */
  scheduleAfter(delay, fn) {
    const gen = this._gen;
    setTimeout(() => { if (this._gen === gen) fn(); }, delay);
  }

  startHand() {
    this.engine = new RiichiEngine({
      dealerSeat: this.dealerSeat,
      roundWind: this.roundWind,
      isBot: this.isHuman.map((h) => !h),
      points: this.points,
    });
    this.emit({ type: 'hand-start' });
    this.tick();
  }

  currentSeatIsHuman() { return this.isHuman[this.engine.currentSeat]; }

  /** Advances the state machine until it needs human input or the hand ends. */
  tick() {
    try {
      const g = this.engine;
      if (g.phase === 'ended') { this.finishHand(); return; }

      if (g.phase === 'draw') {
        const isHuman = this.currentSeatIsHuman();
        const r = g.draw();
        if (r.type === 'exhaustive') { this.finishHand(); return; }
        this.emit({ type: 'drawn', seat: g.currentSeat, rinshan: r.rinshan });

        if (isHuman) {
          this.emit({ type: 'await-human-discard' });
          return;
        }
        this.scheduleAfter(BOT_DELAY_MS, () => this.runBotTurn());
        return;
      }

      if (g.phase === 'reaction') {
        this.resolveReactionPhase();
        return;
      }

      if (g.phase === 'discard') {
        // Reached right after a pon/chi call (not a draw) — the caller still
        // owes an immediate discard. canDeclareTsumo/canAnkan/canDeclareRiichi
        // all correctly no-op here (they require a self-draw / closed hand).
        if (this.currentSeatIsHuman()) { this.emit({ type: 'await-human-discard' }); return; }
        this.scheduleAfter(BOT_DELAY_MS, () => this.runBotTurn());
      }
    } catch (err) {
      console.error('tick failed:', err);
      throw err;
    }
  }

  runBotTurn() {
    try {
      const g = this.engine;
      if (g.canDeclareTsumo()) { g.declareTsumo(); this.emit({ type: 'log', text: 'bot-tsumo' }); this.finishHand(); return; }
      const ankan = chooseBotAnkan(g, g.currentSeat);
      if (ankan) { g.callAnkan(g.currentSeat, ankan); this.emit({ type: 'kan', seat: g.currentSeat }); this.scheduleAfter(BOT_DELAY_MS, () => this.tick()); return; }
      if (chooseBotRiichi(g, g.currentSeat)) { g.declareRiichi(g.currentSeat); this.emit({ type: 'riichi', seat: g.currentSeat }); }
      const seat = g.activeSeat();
      const tile = seat.riichi ? g.turnDrawnTile : chooseBotDiscard(seat.hand, seat.melds);
      g.discard(tile);
      this.emit({ type: 'discarded', seat: g.currentSeat === seat.seatIndex ? seat.seatIndex : g.lastDiscard.seat, tile });
      this.scheduleAfter(BOT_DELAY_MS, () => this.tick());
    } catch (err) {
      console.error('runBotTurn failed:', err);
      throw err;
    }
  }

  resolveReactionPhase() {
   try {
    const g = this.engine;
    const summary = g.getReactionSummary();
    const responses = {};
    const humanPending = []; // multiple human seats can simultaneously have a valid reaction (e.g. double ron) — all must be asked, not just one

    Object.keys(summary).forEach((i) => {
      const seatIndex = Number(i);
      const opts = summary[i];
      if (this.isHuman[seatIndex]) {
        const hasAny = opts.ron || opts.pon || opts.kan || opts.chi.length > 0;
        if (hasAny) { humanPending.push({ seatIndex, opts }); return; }
        responses[i] = 'pass';
        return;
      }
      const decision = chooseBotReaction(g, seatIndex, opts);
      if (decision === 'ron') { responses[i] = 'ron'; return; }
      if (opts.ron) g.markPassedRon(seatIndex);
      responses[i] = decision;
    });

    if (humanPending.length > 0) {
      this._pendingReactionResponses = responses;
      this._pendingHumanSeats = humanPending.map((h) => h.seatIndex);
      this._awaitingHumanReaction = true;
      humanPending.forEach((h) => this.emit({ type: 'await-human-reaction', seatIndex: h.seatIndex, opts: h.opts }));
      return;
    }

    this.applyReactions(responses);
   } catch (err) {
     console.error('resolveReactionPhase failed:', err);
     throw err;
   }
  }

  applyReactions(responses) {
    try {
      const g = this.engine;
      const r = g.resolveReactions(responses);
      if (r.type === 'ron') { this.finishHand(); return; }
      if (r.type === 'called') { this.emit({ type: 'called', kind: r.kind, seat: r.seat }); this.scheduleAfter(BOT_DELAY_MS, () => this.tick()); return; }
      this.scheduleAfter(80, () => this.tick());
    } catch (err) {
      console.error('applyReactions failed:', err, 'responses=', responses);
      throw err;
    }
  }

  /* ---- Human actions (called by the UI) ---- */

  humanDiscard(tile) {
    if (this.engine.phase !== 'discard' || !this.currentSeatIsHuman()) {
      console.warn('humanDiscard ignored: not this human\'s discard turn', { phase: this.engine.phase, currentSeat: this.engine.currentSeat });
      return;
    }
    const g = this.engine;
    g.discard(tile);
    this.emit({ type: 'discarded', seat: g.lastDiscard.seat, tile });
    this.scheduleAfter(80, () => this.tick());
  }

  humanDeclareTsumo() {
    if (!this.currentSeatIsHuman() || !this.engine.declareTsumo()) {
      console.warn('humanDeclareTsumo ignored: not a valid tsumo right now');
      return;
    }
    this.finishHand();
  }

  humanDeclareRiichi() {
    this.engine.declareRiichi(this.engine.currentSeat);
    this.emit({ type: 'riichi', seat: this.engine.currentSeat });
  }

  humanAnkan(type) {
    if (!this.currentSeatIsHuman() || !this.engine.callAnkan(this.engine.currentSeat, type)) {
      console.warn('humanAnkan ignored: not a valid ankan right now');
      return;
    }
    this.emit({ type: 'kan', seat: this.engine.currentSeat });
    this.scheduleAfter(BOT_DELAY_MS, () => this.tick());
  }

  humanReact(seatIndex, action) {
    if (!this._pendingHumanSeats || !this._pendingHumanSeats.includes(seatIndex)) {
      console.warn('humanReact ignored: seat is not currently awaited', { seatIndex, pending: this._pendingHumanSeats });
      return;
    }
    if (action === 'pass' && this.engine.canRon(seatIndex)) this.engine.markPassedRon(seatIndex);
    this._pendingReactionResponses[seatIndex] = action;
    this._pendingHumanSeats = this._pendingHumanSeats.filter((s) => s !== seatIndex);
    if (this._pendingHumanSeats.length > 0) return; // still waiting on other human seats

    const responses = this._pendingReactionResponses;
    this._pendingReactionResponses = {};
    this._awaitingHumanReaction = false;
    this.applyReactions(responses);
  }

  /* ---- Hand / match lifecycle ---- */

  finishHand() {
    const g = this.engine;
    const result = g.result;
    this.applyResultToPoints(result);
    this.emit({ type: 'hand-end', result });
  }

  /**
   * The engine's own seat.points are the live source of truth during a hand
   * (riichi-stick deductions already happened there via declareRiichi). We
   * apply win/loss payments onto that SAME array — never a separate one —
   * then copy the final values back into this.points for the next hand.
   */
  applyResultToPoints(result) {
    const g = this.engine;
    const seatPoints = g.seats.map((s) => s.points);

    if (result.type === 'tsumo') {
      const winnerSeat = result.seat;
      const isDealerWin = winnerSeat === g.dealerSeat;
      [0, 1, 2, 3].forEach((i) => {
        if (i === winnerSeat) return;
        const pay = isDealerWin ? result.payments.fromEachNonDealer : (i === g.dealerSeat ? result.payments.fromDealer : result.payments.fromEachNonDealer);
        seatPoints[i] -= pay;
        seatPoints[winnerSeat] += pay;
      });
      seatPoints[winnerSeat] += this.riichiSticksOnTable * 1000;
      this.riichiSticksOnTable = 0;
    } else if (result.type === 'ron') {
      result.winners.forEach((w) => { seatPoints[result.discarder] -= w.total; seatPoints[w.seat] += w.total; });
      seatPoints[result.winners[0].seat] += this.riichiSticksOnTable * 1000;
      this.riichiSticksOnTable = 0;
    } else if (result.type === 'exhaustive') {
      Object.keys(result.payments).forEach((i) => { seatPoints[Number(i)] += result.payments[i]; });
      // riichi sticks placed this hand (if any) carry over to the next hand's pot
    }

    // Count any riichi declared this hand toward the carrying pot (sticks
    // already left each declarer's own points via declareRiichi).
    g.seats.forEach((s) => { if (s.riichi) this.riichiSticksOnTable += 1; });

    this.points = seatPoints;
  }

  advanceToNextHand() {
    const g = this.engine;
    const dealerWon = g.result.type === 'tsumo' ? g.result.seat === g.dealerSeat
      : g.result.type === 'ron' ? g.result.winners.some((w) => w.seat === g.dealerSeat)
        : g.result.dealerTenpai;

    if (!dealerWon) {
      this.dealerSeat = (this.dealerSeat + 1) % 4;
      this.handNumber += 1;
    }

    if (this.handNumber > 4) { this.matchOver = true; this.stop(); this.emit({ type: 'match-end' }); return; }
    this.startHand();
  }

  /** Clears the watchdog interval and invalidates any pending scheduled
   *  action (via the generation counter), so the match stops auto-advancing.
   *  Call when a match ends normally or is abandoned early (e.g. a server
   *  room closes with players still mid-hand) — otherwise an uncleared
   *  watchdog interval, or a bot's next chained action, keeps a Node
   *  process (or, in principle, the page) busy/leaking indefinitely. */
  stop() {
    if (this._watchdog) { clearInterval(this._watchdog); this._watchdog = null; }
    this._gen++;
  }
}
