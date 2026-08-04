/* VidiMahjong online server — authoritative WebSocket server for the
 * traditional 4-player Riichi mode. Static-hosts nothing (the game itself
 * stays on GitHub Pages); this process only needs to be reachable over
 * WebSocket from traditional.html's online screens.
 *
 * Protocol (JSON messages over one WebSocket per client):
 *   client -> server, first message:
 *     {type:'create', playerId, name}
 *     {type:'join', code, playerId, name}
 *   client -> server, once in a room:
 *     {type:'start'}                          (any seated player can start once ready)
 *     {type:'discard', tile}
 *     {type:'react', action}                  action: 'ron'|'pon'|'kan'|{chi:[a,b]}|'pass'
 *     {type:'riichi'} | {type:'tsumo'} | {type:'ankan', tileType} | {type:'nextHand'}
 *   server -> client:
 *     {type:'joined', code, seat, reconnected}
 *     {type:'error', message}
 *     {type:'lobby', code, started, seats}    (broadcast while waiting for players)
 *     {type:'state', ...}                     (full per-seat sanitized game state)
 *     {type:'awaitReaction', seat, opts}       (sent only to the seat that must respond)
 */
const { WebSocketServer } = require('ws');
const { Room } = require('./room');
const engineLib = require('./shared-engine');

const PORT = process.env.PORT || 8080;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

const rooms = new Map(); // code -> Room

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  let room = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

    if (!room) {
      if (msg.type === 'create') {
        const code = generateRoomCode();
        room = new Room(code, engineLib);
        rooms.set(code, room);
        const { seatIndex } = room.addPlayer(ws, msg.playerId, msg.name);
        send(ws, { type: 'joined', code, seat: seatIndex, reconnected: false });
        broadcastLobby(room);
        return;
      }
      if (msg.type === 'join') {
        const target = rooms.get((msg.code || '').toUpperCase());
        if (!target) { send(ws, { type: 'error', message: 'room-not-found' }); return; }
        const { seatIndex, reconnected } = target.addPlayer(ws, msg.playerId, msg.name);
        if (seatIndex === -1) { send(ws, { type: 'error', message: 'room-full-or-started' }); return; }
        room = target;
        send(ws, { type: 'joined', code: room.code, seat: seatIndex, reconnected });
        if (reconnected && room.started) send(ws, room.buildStateFor(seatIndex));
        broadcastLobby(room);
        return;
      }
      send(ws, { type: 'error', message: 'unknown-message-before-join' });
      return;
    }

    if (msg.type === 'start') {
      if (room.start()) room.broadcastState();
      else broadcastLobby(room);
      return;
    }

    room.handleMessage(ws, msg);
  });

  ws.on('close', () => {
    if (room) room.removeConnection(ws);
  });
});

function broadcastLobby(room) {
  const payload = room.buildLobbyState();
  room.seats.forEach((s) => { if (s && s.ws) send(s.ws, payload); });
}

// Periodically sweep rooms nobody is connected to anymore.
setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.isStale()) {
      room.destroy();
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

console.log(`VidiMahjong online server listening on ws://localhost:${PORT}`);

module.exports = { wss, rooms };
