# 🀄 VidiMahjong — Mahjong Solitaire

> A polished, animated Mahjong Solitaire — clear a 144-tile turtle spread of hand-drawn tiles, with a provably solvable deal every time.

**🎮 [Live Demo](https://vidipt89.github.io/VidiMahjong/)**

"VidiMahjong" is a browser-based Mahjong Solitaire built with vanilla HTML, CSS and JavaScript — no frameworks, no build step. 144 tiles are stacked into a five-layer pyramid; clear the board by matching two free tiles of the same kind at a time. Every deal is generated from a solved state working backwards, so a full clear is always mathematically possible, no matter how the shuffle lands. The interface opens with a short animated intro before dropping into the game, and is fully bilingual, switching instantly between European Portuguese and English.

## 📦 What's Inside

- 🐢 Full 144-tile "turtle" pyramid spread across 5 layers, with proper covered / blocked / free tile rules
- ✅ Provably solvable deals — tiles are assigned by walking the board's own removal order backwards, so a complete solve always exists
- 🀫 34 hand-drawn tile faces (Characters, Bamboos, Circles, Winds, Dragons, Flowers, Seasons) built from CJK glyphs and inline SVG — no image assets
- 💡 Limited hints that highlight a real playable pair, 🔀 a shuffle that keeps the remaining board solvable, and ↩️ unlimited undo
- 🎬 Smooth tile animations — lift on select, shake on mismatch, fly-away on match, staggered deal-in, and a confetti burst on winning
- 📊 Live stats — timer, move counter, running score and tiles remaining
- 💾 Autosaves mid-game to `localStorage`, with a "Continue Game" option from the main menu
- 📖 An in-app "How to Play" guide with a visual diagram of the covered / blocked / free tile rule
- 🎞️ Animated splash intro with the developer credit, that hands off into the main menu
- 🇵🇹 🇬🇧 One-click language toggle between European Portuguese and English, remembered between visits
- 📱 Fully responsive — the board rescales to fit any screen, from desktop down to mobile, without cropping

## 🛠️ Tech Stack

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)

## 🏗️ Project Structure

```
VidiMahjong/
├── index.html         # Screens: splash, menu, how-to-play, game, modals
├── css/
│   └── style.css      # Theme, tile rendering, layout, animations
├── js/
│   ├── i18n.js         # PT/EN strings and language persistence
│   ├── tiles-data.js   # 34 tile types, SVG/glyph faces, pair-pool shuffling
│   ├── layout.js       # Fixed 144-position turtle pyramid layout
│   ├── engine.js        # Board state, free-tile rules, solvable dealing
│   └── ui.js             # Rendering, screen navigation, save/load, animation
├── LICENSE
└── README.md
```

## ⚙️ Game Mechanics

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

Reshuffle (when stuck):
  same pairing process, run again on whichever tiles are still on the
  board, so the remaining game stays solvable
```

## 🚀 How to Run

```bash
# 1. Clone the repository
git clone https://github.com/VidiPT89/VidiMahjong.git

# 2. Open index.html in your browser
cd VidiMahjong
open index.html    # macOS
# or: start index.html (Windows) / xdg-open index.html (Linux)

# 3. Play — tap two free matching tiles to clear them
```

No build step, no dependencies — it's static HTML/CSS/JS and can also be served with any static file server (e.g. `python3 -m http.server`).

## 📝 Notes

- Flowers and Seasons are special: any Flower matches any other Flower, and any Season matches any other Season, without needing to be identical — matching real Mahjong rules
- Language, hints used and in-progress games are stored in `localStorage`, so they persist between visits
- The 144-tile layout and tile-pairing logic are pure, DOM-free functions, kept separate from rendering

---

Developed by **David Arsénio Martins** — *"Vidi"*
