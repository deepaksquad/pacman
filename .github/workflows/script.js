/* ============================================================
   ICE CREAM COLLECTOR (Pac-Man style) — game logic
   ============================================================
   HOW TO ADD REAL ASSETS
   -----------------------------------------------------------
   Everything customizable lives in CONFIG below.
     - Image assets: put files in "assets/" and set the matching
       CONFIG.images.* path (e.g. "assets/ghost.png"). Leave null
       to keep the current emoji placeholder.
     - Sound effects: put files in "assets/sfx/" and set the
       matching CONFIG.sounds.* path. Leave null to skip.
   Nothing breaks if any path is missing — placeholders are used.
   ============================================================ */

const CONFIG = {
  gameSeconds: 30,
  winTarget: 15,
  pickupCount: 24,
  ghostTickEvery: 12, // lower = faster ghost (in render-frame units)

  images: {
    player: null,   // e.g. "assets/player.png"
    ghost: null,    // e.g. "assets/ghost.png"
    pickup: null,   // e.g. "assets/pickup.png"
    wall: null,     // optional texture/color image for wall tiles
    path: null      // optional texture/color image for path tiles
  },

  sounds: {
    move: null,     // e.g. "assets/sfx/move.mp3"
    pickup: null,
    win: null,
    lose: null
  }
};

const COLS = 15, ROWS = 11;

const MAZE = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const TILE = 27;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/* ------------------------------------------------------------
   Preload optional images once. Any that fail to load or are
   null just fall back to the emoji drawn in draw().
------------------------------------------------------------ */
const _images = {};
function preloadImage(key, path) {
  if (!path) return;
  const img = new Image();
  img.onload = () => { _images[key] = img; };
  img.onerror = () => { /* keep emoji fallback silently */ };
  img.src = path;
}
preloadImage('player', CONFIG.images.player);
preloadImage('ghost', CONFIG.images.ghost);
preloadImage('pickup', CONFIG.images.pickup);

const _audioCache = {};
function playSfx(name) {
  const path = CONFIG.sounds[name];
  if (!path) return;
  try {
    if (!_audioCache[name]) _audioCache[name] = new Audio(path);
    const a = _audioCache[name].cloneNode();
    a.play().catch(() => { });
  } catch (e) { /* no-op */ }
}

// Render at native device resolution (crisp on retina/mobile) while keeping
// the same COLS*TILE coordinate system for all game logic below.
function setupCrispCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // capped so weak GPUs aren't overdrawn
  const cssW = COLS * TILE, cssH = ROWS * TILE;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}
setupCrispCanvas();
window.addEventListener('resize', setupCrispCanvas);
window.addEventListener('orientationchange', setupCrispCanvas);

let state = {
  player: { col: 1, row: 1 },
  ghost: { col: 13, row: 9, dir: { c: -1, r: 0 } },
  pickups: [],
  collected: 0,
  secondsLeft: CONFIG.gameSeconds,
  phase: 'playing',
  timerHandle: null,
};

function isOpen(col, row) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  return MAZE[row][col] === 0;
}

function scatterPickups(count) {
  const openTiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAZE[r][c] === 0 && !(c === 1 && r === 1)) openTiles.push({ col: c, row: r });
    }
  }
  for (let i = openTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [openTiles[i], openTiles[j]] = [openTiles[j], openTiles[i]];
  }
  return openTiles.slice(0, count);
}

function startGame() {
  state.player = { col: 1, row: 1 };
  state.ghost = { col: 13, row: 9, dir: { c: -1, r: 0 } };
  state.pickups = scatterPickups(CONFIG.pickupCount);
  state.collected = 0;
  state.secondsLeft = CONFIG.gameSeconds;
  state.phase = 'playing';

  document.getElementById('collected').textContent = '0';
  document.getElementById('timer').textContent = CONFIG.gameSeconds;
  document.getElementById('message').textContent = '';
  document.getElementById('message').className = '';
  document.getElementById('restart-btn').style.display = 'none';

  clearInterval(state.timerHandle);
  state.timerHandle = setInterval(tickTimer, 1000);

  requestAnimationFrame(draw);
}

function tickTimer() {
  if (state.phase !== 'playing') return;
  state.secondsLeft--;
  document.getElementById('timer').textContent = Math.max(state.secondsLeft, 0);
  if (state.secondsLeft <= 0) {
    endGame(state.collected >= CONFIG.winTarget);
  }
}

function endGame(won) {
  state.phase = won ? 'won' : 'lost';
  clearInterval(state.timerHandle);
  const msg = document.getElementById('message');
  if (won) {
    msg.textContent = '🎉 Challenge complete! Goodie bag unlocked!';
    msg.className = 'win';
    playSfx('win');
    // Hook point: fire your goodie-bag / reward trigger here.
  } else {
    msg.textContent = `⏰ Time's up! You collected ${state.collected}/${CONFIG.winTarget}.`;
    msg.className = 'lose';
    playSfx('lose');
  }
  document.getElementById('restart-btn').style.display = 'inline-block';
}

function tryMove(entity, dCol, dRow) {
  const newCol = entity.col + dCol;
  const newRow = entity.row + dRow;
  if (isOpen(newCol, newRow)) {
    entity.col = newCol;
    entity.row = newRow;
    return true;
  }
  return false;
}

// Small cooldown guards against a single tap firing twice on hybrid
// touch+mouse devices (some tablets/touch-laptops do this).
let _lastMoveAt = 0;
function movePlayer(dir) {
  if (state.phase !== 'playing') return;
  const now = Date.now();
  if (now - _lastMoveAt < 60) return;
  _lastMoveAt = now;

  const deltas = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const [dc, dr] = deltas[dir];
  const moved = tryMove(state.player, dc, dr);
  if (moved) playSfx('move');
  checkPickup();
}

function checkPickup() {
  const idx = state.pickups.findIndex(p => p.col === state.player.col && p.row === state.player.row);
  if (idx !== -1) {
    state.pickups.splice(idx, 1);
    state.collected++;
    playSfx('pickup');
    document.getElementById('collected').textContent = state.collected;
    if (state.collected >= CONFIG.winTarget) {
      endGame(true);
    }
  }
}

function updateGhost() {
  if (state.phase !== 'playing') return;
  const options = [{ c: 1, r: 0 }, { c: -1, r: 0 }, { c: 0, r: 1 }, { c: 0, r: -1 }];
  if (!isOpen(state.ghost.col + state.ghost.dir.c, state.ghost.row + state.ghost.dir.r) || Math.random() < 0.15) {
    const valid = options.filter(o => isOpen(state.ghost.col + o.c, state.ghost.row + o.r));
    if (valid.length) state.ghost.dir = valid[Math.floor(Math.random() * valid.length)];
  }
  tryMove(state.ghost, state.ghost.dir.c, state.ghost.dir.r);
}

function drawEntity(imgKey, fallbackEmoji, col, row) {
  const cx = col * TILE + TILE / 2, cy = row * TILE + TILE / 2;
  const img = _images[imgKey];
  if (img) {
    const s = TILE * 0.85;
    ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
  } else {
    ctx.font = `${TILE * 0.6}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallbackEmoji, cx, cy);
  }
}

let ghostTickCounter = 0;
function draw() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = MAZE[r][c] === 1 ? '#3D2817' : '#FFE8D6';
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
  }

  state.pickups.forEach(p => drawEntity('pickup', '🍦', p.col, p.row));
  drawEntity('ghost', '👻', state.ghost.col, state.ghost.row);
  drawEntity('player', '😋', state.player.col, state.player.row);

  ghostTickCounter++;
  if (ghostTickCounter % CONFIG.ghostTickEvery === 0) updateGhost();

  if (state.phase === 'playing') requestAnimationFrame(draw);
}

// ---- input ----
window.addEventListener('keydown', (e) => {
  const map = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right'
  };
  if (map[e.key]) {
    e.preventDefault();
    movePlayer(map[e.key]);
  }
});

document.querySelectorAll('.pad-btn').forEach(btn => {
  btn.addEventListener('click', () => movePlayer(btn.dataset.dir));
});

document.getElementById('restart-btn').addEventListener('click', startGame);

startGame();
