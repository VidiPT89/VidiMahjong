# 🀄 VidiMahjong — Mahjong Solitaire & 4-Player Riichi

> Two games in one: a polished Mahjong Solitaire with provably solvable deals, and a full traditional 4-player Riichi table — bots, local pass-and-play, or online with friends.

**🎮 [Live Demo](https://vidipt89.github.io/VidiMahjong/)**

"VidiMahjong" is a browser-based Mahjong built with vanilla HTML, CSS and JavaScript — no frameworks, no build step for the game itself. It ships two independent modes that only share their tile-rendering code:

- **Solitaire** — clear a 144-tile turtle pyramid by matching two free tiles at a time. Every deal is generated from a solved state working backwards, so a full clear is always mathematically possible.
- **4 Players (Riichi)** — the real thing: wall, hands, chi/pon/kan, riichi, yaku scoring and han/fu payouts. Play against bots, pass-and-play locally with friends on one device, or start an online room with a small Node.js server.

The interface opens with a short animated intro, and is fully bilingual, switching instantly between European Portuguese and English.

## 📦 What's Inside

### Solitaire
- 🎚️ Three difficulty levels — **Easy** (a flat 108-tile suits-only spread, nothing ever covered), **Medium** (the classic 144-tile turtle), and **Hard** (the same 144 tiles stacked into a taller, 5-layer peak)
- 🐢 Full turtle-pyramid spreads with proper covered / blocked / free tile rules
- ✅ Provably solvable deals — tiles are assigned by walking the board's own removal order backwards, so a complete solve always exists
- 💡 Limited hints that highlight a real playable pair, 🔀 a shuffle that keeps the remaining board solvable, and ↩️ unlimited undo
- 🎬 Smooth tile animations — lift on select, shake on mismatch, fly-away on match, staggered deal-in, and a confetti burst on winning
- 💾 Autosaves mid-game to `localStorage`, with a "Continue Game" option from the main menu
- 📖 An in-app "How to Play" guide with a visual diagram of the covered / blocked / free tile rule

### 4 Players (Riichi)
- 🀫 34 hand-drawn tile faces (Characters, Bamboos, Circles, Winds, Dragons, Flowers, Seasons) built from CJK glyphs and inline SVG — no image assets, shared with Solitaire
- 🎴 Real winning-hand detection (standard shapes, Chiitoitsu, Kokushi Musou) and a wide yaku set — Riichi, Tanyao, Yakuhai, Pinfu, Sanshoku, Ittsu, Toitoi, Honitsu/Chinitsu, Chanta/Junchan, Sanankou, Suuankou, all yakuman, and more — with proper han/fu scoring and dora
- 🤖 A discard/reaction bot AI, auto-filling any empty seats (1–4 human players per table)
- 👥 Local pass-and-play for 1–4 people on one device, correctly handling simultaneous multi-player reactions (e.g. a double ron)
- 🌐 Online rooms over WebSockets — create a room, share the 5-letter code, the server is the sole source of truth (every action is re-validated server-side, never trusted from the client)
- 📊 Riichi sticks, dealer rotation, exhaustive-draw tenpai/noten payments, and a full-match points recap

### Shared
- 🎞️ Animated splash intro with the developer credit, that hands off into the main menu
- 🇵🇹 🇬🇧 One-click language toggle between European Portuguese and English, remembered between visits
- 📱 Fully responsive — layouts rescale from desktop down to mobile

## 🛠️ Tech Stack

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-ws-black?style=flat)

## 🏗️ Project Structure

```
VidiMahjong/
├── index.html              # Solitaire: splash, menu, how-to-play, game, modals
├── traditional.html        # 4-Player: mode select, local setup, online lobby, table
├── css/
│   ├── style.css           # Shared theme, Solitaire layout/animations
│   └── traditional.css     # 4-Player table layout
├── js/
│   ├── i18n.js              # PT/EN strings (both modes) and language persistence
│   ├── tiles-data.js        # 34+8 tile types, SVG/glyph faces — shared by both modes
│   ├── layout.js            # Solitaire's fixed 144-position turtle layout
│   ├── engine.js            # Solitaire board state, free-tile rules, solvable dealing
│   ├── ui.js                 # Solitaire rendering, screen navigation, save/load
│   └── traditional/
│       ├── tiles.js          # Standard 136-tile Riichi wall (reuses tiles-data.js)
│       ├── hand-eval.js      # Winning-hand decomposition (standard/chiitoitsu/kokushi)
│       ├── yaku.js           # Yaku detection + fu calculation
│       ├── scoring.js        # Han/fu → points, ron/tsumo payment split
│       ├── engine.js         # Turn engine: draw/discard/chi/pon/kan/riichi, authoritative validation
│       ├── bot.js            # Discard/reaction bot heuristics
│       ├── local-match.js    # Chains hands together, drives bots, local pass-and-play
│       ├── ui.js              # Local-mode table rendering
│       └── online.js          # Online client: WebSocket, room lobby, table rendering
├── server/                  # Node.js WebSocket server for online play (see below)
│   ├── index.js              # Room create/join, message routing
│   ├── room.js                # One online match: seats, sanitized per-player state
│   └── shared-engine.js       # Loads the exact same client engine/bot code for the server
├── LICENSE
└── README.md
```

## ⚙️ Game Mechanics

### Solitaire — solvable dealing
```
Free tile rule:
  a tile is FREE only if:
    - no other tile occupies the same (x, y) at a higher layer, AND
    - its left OR right neighbour (same layer, same row) is empty

Dealing a solvable board:
  1. walk every board position, repeatedly pairing up whichever tiles are
     currently free (given only the positions not yet paired)
  2. assign each matching pair-unit of tile types to one such pair
  3. because freeness only depends on position — never on tile type —
     replaying that same pairing order back is always a valid full solve
```

### 4 Players — turn engine
```
Draw → (tsumo? / kan?) → discard → reaction window (ron > pon/kan > chi) → next draw

Winning-hand check: recursive decomposition into 4 sets + 1 pair (plus the
special Chiitoitsu / Kokushi Musou shapes), tried against every possible
split so the highest-scoring yaku combination is used.

Server authority: every client action (discard, riichi, tsumo, kan, chi/pon
claims) is re-validated against the current game state before it's allowed
to change anything — a compromised or buggy client can, at worst, get its
own action ignored.
```

## 🚀 How to Run

```bash
# 1. Clone the repository
git clone https://github.com/VidiPT89/VidiMahjong.git
cd VidiMahjong

# 2. Open either game in your browser — no build step, no dependencies
open index.html          # Solitaire
open traditional.html    # 4-Player Riichi (bots / local pass-and-play)
```

Both pages are static and can also be served with any static file server (e.g. `python3 -m http.server`).

### Online multiplayer server (optional)

The "Play Online" screen in `traditional.html` needs a running WebSocket server:

```bash
cd server
npm install
npm start                # listens on ws://localhost:8080 by default (set PORT to change)
```

Then, in the app's online lobby, enter the server's address (e.g. `ws://localhost:8080`, or `wss://your-domain` once deployed) and create or join a room. The server keeps rooms in memory only — no database required — and sweeps rooms with no connected players after 30 minutes.

## 📝 Notes

- Flowers and Seasons in Solitaire are special: any Flower matches any other Flower, and any Season matches any other Season, without needing to be identical — matching real Mahjong rules
- The 4-Player mode plays a single East round (4 hands, one dealer turn each) — a common casual "tonpuusen" format — rather than a full East+South hanchan
- Yaku scope covers the common competitive set plus all yakuman; a few rare edge cases (abortive draws like four-riichi/four-kan, double-yakuman variants) are intentionally simplified
- Language, hints used and in-progress games are stored in `localStorage`, so they persist between visits
- All game logic (Solitaire dealing, hand evaluation, yaku/scoring, the turn engine) is pure, DOM-free code, kept separate from rendering — the online server runs the exact same client code, not a reimplementation

---

Developed by **David Arsénio Martins** — *"Vidi"*
