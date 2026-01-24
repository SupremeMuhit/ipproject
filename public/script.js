
// --- FIREBASE CONFIG (PLACEHOLDER) ---

// --- IP LOGGING ---
// Ping the worker to log the visit
// IMPORTANT: Update this URL to match your deployed Worker URL
const LOG_URL = "https://fluppy.suprememuhit.workers.dev/ping"; 
fetch(LOG_URL).catch(e => {
  // Silent fail or console warn
  // console.warn("Logging disabled or failed", e);
});

// --- FIREBASE CONFIG (PLACEHOLDER) ---
// REPLACE THIS WITH YOUR OWN FIREBASE CONFIG FROM CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyDCIKT3APSp-vDSoht0pdCHExitPf0KrjE", // Please Dont Steal My API
  authDomain: "fluppy-snake.firebaseapp.com", // Please Dont Steal My API
  projectId: "fluppy-snake", // Please Dont Steal My API
  storageBucket: "fluppy-snake.firebasestorage.app", // Please Dont Steal My API
  messagingSenderId: "1050595465276", // Please Dont Steal My API
  appId: "1:1050595465276:web:a9f3d53b2d639d287c8b39" // Please Dont Steal My API
};

let app, db;
try {
  app = firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  console.log("Firebase initialized (Compat mode)");
} catch(e) {
  console.error("Firebase init error (Did you set config?):", e);
}

const CONFIG = {
  cols: 25,
  rows: 25,
  cellSize: 20,
  // Base speeds (ms per tick) - lower is faster
  baseSpeed: {
    EASY: 130,
    MEDIUM: 100,
    HARD: 70,
    EXTREME: 40
  }
};

// DATA SETS
const THEMES = ['NEON', 'CLASSIC', 'MINIMAL', 'BIO-HAZARD', 'MATRIX', 'SUNSET', 'CANDY', 'GAMEBOY', 'OCEAN', 'HELL', 'FOREST', 'VOID', 'SPACE'];
const MODES = ['CLASSIC', 'SPEED', 'SURVIVAL', 'CAMPAIGN', 'PORTAL', 'POISON'];
const MAPS = ['BOX', 'INFINITE', 'MAZE', 'OBSTACLES'];
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD', 'EXTREME'];
const SIZES = [
  { w: 10, h: 10, label: '10x10' },
  { w: 15, h: 15, label: '15x15' },
  { w: 20, h: 20, label: '20x20' },
  { w: 25, h: 25, label: '25x25' },
  { w: 30, h: 30, label: '30x30' },
  { w: 40, h: 40, label: '40x40' }
];

const TIMES = [
  { val: Infinity, label: '∞' },
  { val: 60, label: '1 MIN' },
  { val: 120, label: '2 MIN' },
  { val: 180, label: '3 MIN' },
  { val: 300, label: '5 MIN' }
];

// STATE
let game = {
  active: false,
  timer: null,
  clockTimer: null,
  score: 0,
  snake: [],
  dir: {x:1, y:0}, // Direction
  nextDir: null,   // Buffered Input
  food: null,
  poison: null,    // For POISON mode
  obstacles: [],
  timeRemaining: 0, 
  settings: {
    theme: 0,
    mode: 0,
    map: 0,
    time: 0, // Default Infinity
    diff: 1, // Default Medium
    size: 2  // Default 20x20 (Index 2 for array)
  }
};

// MULTIPLAYER STATE
let mp = {
  isActive: false,
  roomCode: null,
  playerId: null, // 'p1' or 'p2'
  remoteSnake: [],
  remoteDir: {x:0,y:0},
  isWaiting: false,
  connected: false
};


// Set initial default size
game.settings.size = 3; // 25x25

// CACHE
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('current-score');
const modeEl = document.getElementById('current-mode');

// ==========================================
// GRID & MAP LOGIC
// ==========================================

class Grid {
  static init() {
    // Determine size based on settings
    const sizeConfig = SIZES[game.settings.size];
    CONFIG.cols = sizeConfig.w;
    CONFIG.rows = sizeConfig.h;
    
    // Responsive Sizing
    // Fit canvas into the game-left area
    const container = document.getElementById('game-left');
    // available space (fallback to 400x400 if clientWidth is 0)
    const maxWidth = (container.clientWidth || 400) - 40;
    const maxHeight = (container.clientHeight || 400) - 100; // room for HUD
    
    const maxDimension = Math.min(maxWidth, maxHeight, 800);
    
    // Calculate cell size to best fit the grid into the box
    CONFIG.cellSize = Math.floor(maxDimension / Math.max(CONFIG.cols, CONFIG.rows)) || 20;
    
    canvas.width = CONFIG.cols * CONFIG.cellSize;
    canvas.height = CONFIG.rows * CONFIG.cellSize;
    
    // JS Grid drawing handles this now
  }

  static generateMap(type) {
    game.obstacles = []; // Reset
    
    // SAFE ZONE: Center of the map where snake spawns
    const cx = Math.floor(CONFIG.cols / 2);
    const cy = Math.floor(CONFIG.rows / 2);
    const safeZone = (x, y) => Math.abs(x - cx) < 3 && Math.abs(y - cy) < 3;

    if (type === 'MAZE') {
      // Grid Maze
      for (let x = 4; x < CONFIG.cols - 4; x += 4) {
        for (let y = 4; y < CONFIG.rows - 4; y++) {
          if (!safeZone(x, y)) game.obstacles.push({x, y});
        }
      }
    } else if (type === 'OBSTACLES') {
      // Random blocks
      const count = Math.floor((CONFIG.cols * CONFIG.rows) * 0.05); // 5% coverage
      for(let i=0; i<count; i++) {
        const x = Math.floor(Math.random() * CONFIG.cols);
        const y = Math.floor(Math.random() * CONFIG.rows);
        // Ensure not in safe zone
        if (!safeZone(x, y)) game.obstacles.push({x, y});
      }
    }
  }
}

// ==========================================
// GAME LOOP
// ==========================================

function toggleSidebar(mode) {
  const menu = document.getElementById('sidebar-menu');
  const hud = document.getElementById('sidebar-game');
  if (mode === 'GAME') {
    menu.style.display = 'none';
    hud.style.display = 'flex';
    hud.classList.remove('hidden');
  } else {
    menu.style.display = 'block';
    hud.style.display = 'none';
    hud.classList.add('hidden');
  }
}

function updateClock() {
  if (!game.active || game.timeRemaining === Infinity) return;
  
  const minutes = Math.floor(game.timeRemaining / 60);
  const seconds = game.timeRemaining % 60;
  const str = `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
  
  document.getElementById('game-time-large').textContent = str;
  // Also existing tiny mode text if needed, but we hide sidebar settings now
  
  if (game.timeRemaining <= 0) {
    gameOver();
    return;
  }
  
  game.timeRemaining--;
}

function startGame() {
  document.getElementById('preview-overlay').style.opacity = '0';
  document.getElementById('game-over').classList.add('hidden');
  document.getElementById('mp-popup').classList.add('hidden'); // Ensure mp popup is gone
  
  if (mp.isActive) {
    toggleSidebar('GAME');
    document.getElementById('mp-room-display').textContent = mp.roomCode;
  } else {
    toggleSidebar('MENU'); // Ensure standard sidebar for Single Player
  }
  Grid.init();
  
  // Logic Setup
  const centerX = Math.floor(CONFIG.cols / 2);
  const centerY = Math.floor(CONFIG.rows / 2);
  
  // DIFFERENT SPAWNS FOR MP
  if (mp.isActive) {
    if (mp.playerId === 'p1') {
      game.snake = [{x: 5, y: centerY}, {x: 4, y: centerY}, {x: 3, y: centerY}];
      game.dir = {x: 1, y: 0};
      game.nextDir = {x: 1, y: 0};
    } else {
      game.snake = [{x: CONFIG.cols - 6, y: centerY}, {x: CONFIG.cols - 5, y: centerY}, {x: CONFIG.cols - 4, y: centerY}];
      game.dir = {x: -1, y: 0};
      game.nextDir = {x: -1, y: 0};
    }
  } else {
    game.snake = [{x: centerX, y: centerY}, {x: centerX-1, y: centerY}, {x: centerX-2, y: centerY}];
    game.dir = {x: 1, y: 0};
    game.nextDir = {x: 1, y: 0};
  }
  
  game.score = 0;
  game.active = true;
  game.poison = null;
  game.food = spawnFood();
  
  // Timer Setup
  const timeSetting = TIMES[game.settings.time];
  game.timeRemaining = timeSetting.val;
  // Initial clock Render
  if(game.timeRemaining === Infinity) document.getElementById('game-time-large').textContent = "--:--";
  else updateClock(); // Render start immediately
  
  if (game.clockTimer) clearInterval(game.clockTimer);
  if (game.timeRemaining !== Infinity) {
      game.clockTimer = setInterval(updateClock, 1000);
  }

  if (MODES[game.settings.mode] === 'POISON') game.poison = spawnFood();
  if (MODES[game.settings.mode] === 'SURVIVAL') game.obstacles = []; // Clear obstacles for new survival run
  
  // Apply Settings
  const mapType = MAPS[game.settings.map];
  // Only regenerate map if NOT survival (survival builds map as you go)
  if (MODES[game.settings.mode] !== 'SURVIVAL') Grid.generateMap(mapType);
  else Grid.generateMap('BOX'); // Survival starts clean usually
  
  // SAFETY NET: NUKE OBSTACLES NEAR SPAWN
  const cx = Math.floor(CONFIG.cols / 2);
  const cy = Math.floor(CONFIG.rows / 2);
  game.obstacles = game.obstacles.filter(o => Math.abs(o.x - cx) > 4 || Math.abs(o.y - cy) > 4);

  const modeType = MODES[game.settings.mode];
  modeEl.textContent = mp.isActive ? `MULTIPLAYER (${mp.roomCode})` : `${modeType} (${DIFFICULTIES[game.settings.diff]})`;
  
  updateScore(0);
  
  // RESET STEPS (Invisible Spawn Protection)
  game.steps = 0;

  // Speed Calculation
  let tickRate = CONFIG.baseSpeed[DIFFICULTIES[game.settings.diff]];
  
  if (modeType === 'SPEED') tickRate *= 0.7; // Faster in speed mode
  
  if (game.timer) clearInterval(game.timer);
  game.timer = setInterval(update, tickRate);
}

function update() {
  if (!game.active) return;
  game.steps++;

  // 1. Move Snake
  if (game.nextDir) {
    if ( game.dir.x + game.nextDir.x !== 0 || game.dir.y + game.nextDir.y !== 0) {
       game.dir = game.nextDir;
    }
    game.nextDir = null; 
  }

  const head = {x: game.snake[0].x + game.dir.x, y: game.snake[0].y + game.dir.y};
  const mode = MODES[game.settings.mode];
  const map = MAPS[game.settings.map];

  // 2. Logic: Walls vs Wrap
  const isInfinite = map === 'INFINITE' || mode === 'PORTAL';
  
  if (isInfinite) {
    if (head.x < 0) head.x = CONFIG.cols - 1;
    if (head.x >= CONFIG.cols) head.x = 0;
    if (head.y < 0) head.y = CONFIG.rows - 1;
    if (head.y >= CONFIG.rows) head.y = 0;
  } else {
    // Wall Death
    if (head.x < 0 || head.x >= CONFIG.cols || head.y < 0 || head.y >= CONFIG.rows) {
      // Spawn Protection: If < 5 steps, just wrap/bounce instead of dying to fix "Instant Death" bug
      if (game.steps < 5) {
         if (head.x < 0) head.x = CONFIG.cols - 1;
         if (head.x >= CONFIG.cols) head.x = 0;
         if (head.y < 0) head.y = CONFIG.rows - 1;
         if (head.y >= CONFIG.rows) head.y = 0;
      } else {
        return gameOver();
      }
    }
  }

  // 3. Collision Check
  // Self
  if (game.snake.some(s => s.x === head.x && s.y === head.y)) {
    if (game.steps > 5) return gameOver();
  }
  
  // Obstacles
  if (game.obstacles.some(o => o.x === head.x && o.y === head.y)) {
    if (game.steps > 5) return gameOver();
  }
  
  // Poison (Collision with red food)
  if (game.poison && head.x === game.poison.x && head.y === game.poison.y) {
    // POISON PENALTY REWORK: -25 Points, Don't die
    game.score -= 25;
    if (game.score < 0) game.score = 0; // Floor at 0?
    updateScore(game.score);
    
    // Text feedback?
    showFloatingText("-25", head);
    
    relocatePoison();
    // Maybe shrink snake?
    if (game.snake.length > 3) game.snake.pop(); 
    return; // Don't process move this tick properly
  }

  // 4. Move Execution
  game.snake.unshift(head);


  // 5. Eat Food
  if (head.x === game.food.x && head.y === game.food.y) {
    // SCORING: 10/20/30/40 based on difficulty
    const points = (game.settings.diff + 1) * 10; 
    game.score += points;
    
    // Campaign Mode: Speed up every 50 points
    if (mode === 'CAMPAIGN' && game.score % 50 === 0) {
      clearInterval(game.timer);
      const currentSpeed = CONFIG.baseSpeed[DIFFICULTIES[game.settings.diff]];
      // Increase speed by 5ms per milestone
      const newSpeed = Math.max(30, currentSpeed - (game.score/50)*5);
      game.timer = setInterval(update, newSpeed);
    }
    
    updateScore(game.score);
    game.food = spawnFood();
    
    if (mode === 'SURVIVAL') addRandomObstacle();
    if (mode === 'POISON') relocatePoison();
    
  } else {
    // Didn't eat
    game.snake.pop();
  }
  
  // --- SYNC MULTIPLAYER ---
  if (mp.isActive && mp.roomCode && db) {
     // Write local state
     const playerRef = db.ref(`rooms/${mp.roomCode}/players/${mp.playerId}`);
     playerRef.set({
       snake: game.snake,
       score: game.score,
       active: game.active
     });
  }

  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const cs = CONFIG.cellSize;
  const pd = 1; // Minimal padding for a professional "aligned" look
  
  const style = getComputedStyle(document.body);
  const primary = style.getPropertyValue('--primary-color').trim();
  const accent = style.getPropertyValue('--accent-color').trim();
  const foodColor = style.getPropertyValue('--food-color').trim();
  const poisonColor = style.getPropertyValue('--poison-color').trim();
  const wallColor = style.getPropertyValue('--wall-color').trim();
  const gridColor = style.getPropertyValue('--grid-color').trim();

  // 1. Draw Grid (JS based for perfect alignment)
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let x = 0; x <= CONFIG.cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cs, 0);
    ctx.lineTo(x * cs, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= CONFIG.rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cs);
    ctx.lineTo(canvas.width, y * cs);
    ctx.stroke();
  }

  // 2. Draw WALL Border
  ctx.strokeStyle = wallColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // Draw Obstacles
  ctx.fillStyle = '#555';
  game.obstacles.forEach(o => {
    ctx.fillRect(o.x * cs + pd, o.y * cs + pd, cs - pd*2, cs - pd*2);
  });

  // Draw Food
  ctx.fillStyle = foodColor;
  ctx.shadowBlur = 10;
  ctx.shadowColor = foodColor;
  ctx.beginPath();
  ctx.arc(game.food.x*cs + cs/2, game.food.y*cs + cs/2, cs/3, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // Draw Poison (BIGGER)
  if (game.poison) {
    ctx.fillStyle = poisonColor;
    ctx.shadowBlur = 15;
    ctx.shadowColor = poisonColor;
    ctx.beginPath();
    // Regular radius is cs/3. Make this cs/2 (full cell width essentially)
    ctx.arc(game.poison.x*cs + cs/2, game.poison.y*cs + cs/2, cs/1.8, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Draw skull or X?
    ctx.fillStyle = '#fff';
    ctx.font = `${cs/2}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', game.poison.x*cs + cs/2, game.poison.y*cs + cs/2);
  }

  // Draw LOCAL Snake
  game.snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? primary : accent; // Head vs Body
    ctx.shadowBlur = i === 0 ? 10 : 0;
    ctx.shadowColor = primary;
    ctx.fillRect(seg.x * cs + pd, seg.y * cs + pd, cs - pd*2, cs - pd*2);
    
    // Eyes for head
    if (i === 0) {
      ctx.fillStyle = '#000';
      const eyeSize = cs/5;
      // Simple offset eyes
      ctx.fillRect(seg.x*cs+cs*0.2, seg.y*cs+cs*0.2, eyeSize, eyeSize);
      ctx.fillRect(seg.x*cs+cs*0.6, seg.y*cs+cs*0.2, eyeSize, eyeSize);
    }
  });

  // Draw REMOTE Snake
  if (mp.isActive && mp.remoteSnake && mp.remoteSnake.length > 0) {
    // Use a distinct color for P2/Opponent (e.g., Red or opposite of theme)
    // For now, use a fixed color or variation of accent
    const remoteColor = '#ff5555'; // Reddish for opponent
    
    mp.remoteSnake.forEach((seg, i) => {
      ctx.fillStyle = remoteColor;
      ctx.shadowBlur = i === 0 ? 10 : 0;
      ctx.shadowColor = remoteColor;
      ctx.fillRect(seg.x * cs + pd, seg.y * cs + pd, cs - pd*2, cs - pd*2);
      
      if (i === 0) {
          ctx.fillStyle = '#fff';
          const eyeSize = cs/5;
          ctx.fillRect(seg.x*cs+cs*0.2, seg.y*cs+cs*0.2, eyeSize, eyeSize);
          ctx.fillRect(seg.x*cs+cs*0.6, seg.y*cs+cs*0.2, eyeSize, eyeSize);
      }
    });
  }

  ctx.shadowBlur = 0;
}

// ==========================================
// HELPERS
// ==========================================

function spawnFood() {
  let valid = false;
  let pos = {};
  while(!valid) {
    pos = {
      x: Math.floor(Math.random() * CONFIG.cols),
      y: Math.floor(Math.random() * CONFIG.rows)
    };
    const hitSnake = game.snake.some(s => s.x === pos.x && s.y === pos.y);
    const hitWall = game.obstacles.some(o => o.x === pos.x && o.y === pos.y);
    const hitPoison = game.poison && game.poison.x === pos.x && game.poison.y === pos.y;
    if (!hitSnake && !hitWall && !hitPoison) valid = true;
  }
  return pos;
}

function relocatePoison() {
  if (game.poison) {
    game.poison = spawnFood();
  }
}

function addRandomObstacle() {
  const pos = spawnFood();
  game.obstacles.push(pos);
}

function updateScore(s) {
  scoreEl.textContent = s;
  
  // In MP, update specific labels
  if (mp.isActive && mp.playerId) {
    document.getElementById('score-p1').textContent = mp.playerId === 'p1' ? s : (mp.remoteScore || 0);
    document.getElementById('score-p2').textContent = mp.playerId === 'p2' ? s : (mp.remoteScore || 0);
  }
}

function showFloatingText(text, pos) {
  // Advanced feature: Canvas overlay text?
  // For now simple console log or visual flash
  const wrapper = document.querySelector('.canvas-wrapper');
  const el = document.createElement('div');
  el.textContent = text;
  el.style.position = 'absolute';
  el.style.color = 'red';
  el.style.fontWeight = 'bold';
  el.style.left = '50%';
  el.style.top = '50%';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.fontSize = '2rem';
  el.style.textShadow = '0 0 5px red';
  el.style.transition = '1s';
  el.style.pointerEvents = 'none';
  wrapper.appendChild(el);
  
  // Animate up
  requestAnimationFrame(() => {
    el.style.transform = 'translate(-50%, -150%)';
    el.style.opacity = '0';
  });
  
  setTimeout(() => el.remove(), 1000);
}

function gameOver() {
  game.active = false;
  clearInterval(game.timer);
  if(game.clockTimer) clearInterval(game.clockTimer);
  
  const popup = document.getElementById('game-over');
  const newHighScoreEl = document.getElementById('new-high-score');
  
  popup.classList.remove('hidden');
  popup.style.display = 'block'; // Force show
  
  document.getElementById('final-score').textContent = game.score;
  
  // Hide High Score message initially
  newHighScoreEl.classList.add('hidden');

  if (!mp.isActive) { // Only track high score in Single Player
    const saved = parseInt(localStorage.getItem('snakeHighScore')) || 0;
    if (game.score > saved) {
        localStorage.setItem('snakeHighScore', game.score);
        newHighScoreEl.classList.remove('hidden');
        updateMenuHighScore(); // Ensure this exists or is removed if redundant
    }
    
    // Generate Details String: "Medium - 20x20"
    const diff = DIFFICULTIES[game.settings.diff];
    const size = SIZES[game.settings.size].label;
    const details = `${diff} - ${size}`;
    
    updateLeaderboard(game.score, details);
  } else {
    // Multiplayer Game Over logic?
    // cleanup
  }
}


function updateLeaderboard(newScore, details) {
  let entries = JSON.parse(localStorage.getItem('fluppyLeaderboard') || '[]');
  
  // Convert old simple number format to object if needed
  entries = entries.map(e => (typeof e === 'number') ? {score: e, details: 'Classic'} : e);

  // Add new score
  if(newScore > 0) {
    entries.push({score: newScore, details: details});
    entries.sort((a,b) => b.score - a.score); // Descending by score
    entries = entries.slice(0, 10); // Keep Top 10 but display limited
    localStorage.setItem('fluppyLeaderboard', JSON.stringify(entries));
  }
  
  renderLeaderboard(entries);
}

function renderLeaderboard(entries) {
  if(!entries) {
     entries = JSON.parse(localStorage.getItem('fluppyLeaderboard') || '[]');
     // normalize on load too
     entries = entries.map(e => (typeof e === 'number') ? {score: e, details: 'Classic'} : e);
  }
  
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = '';
  
  // Fill up to 10 slots
  const count = Math.max(entries.length, 5); 
  
  for(let i=0; i<count; i++) {
    const entry = entries[i];
    const itemScore = entry ? entry.score : '-';
    // Format: "Medium - 20x10 = 200"
    // My list item structure: Rank | Details = Score
    const itemDetails = entry ? entry.details : '';
    
    const li = document.createElement('li');
    if (entry) {
        li.innerHTML = `
          <div style="display:flex; width:100%; align-items:center;">
             <span class="rank" style="width:20px; color:var(--primary-color)">${i+1}.</span> 
             <span style="font-size:0.7rem; color:#aaa; margin-right:5px;">${itemDetails}</span>
             <span style="text-align:right; flex-grow:1; color:#fff;">= ${itemScore}</span>
          </div>`;
    } else {
        // Placeholder
        li.innerHTML = `<span class="rank">${i+1}.</span> -`;
    }
    list.appendChild(li);
  }
}

// CREATE ROOM LOCAL STATE
const createSettings = {
  mode: 'PVP',
  map: 'BOX',
  diff: 1
};

const MP_MODES = ['PVP', 'FRIENDLY'];
const MP_MAPS = ['BOX', 'INFINITE'];

function updateCreateUI() {
  document.getElementById('mp-create-mode-val').textContent = createSettings.mode;
  document.getElementById('mp-create-map-val').textContent = createSettings.map === 'BOX' ? 'WALLED' : 'INFINITE';
  document.getElementById('mp-create-diff-val').textContent = DIFFICULTIES[createSettings.diff];
}

function handleCreateSetting(type, dir) {
   if (type === 'mode') {
     let idx = MP_MODES.indexOf(createSettings.mode);
     if (dir === 'next') idx = (idx + 1) % MP_MODES.length;
     else idx = (idx - 1 + MP_MODES.length) % MP_MODES.length;
     createSettings.mode = MP_MODES[idx];
   }
   if (type === 'map') {
     let idx = MP_MAPS.indexOf(createSettings.map);
     if (dir === 'next') idx = (idx + 1) % MP_MAPS.length;
     else idx = (idx - 1 + MP_MAPS.length) % MP_MAPS.length;
     createSettings.map = MP_MAPS[idx];
   }
   if (type === 'diff') {
     let idx = createSettings.diff;
     if (dir === 'next') idx = (idx + 1) % DIFFICULTIES.length;
     else idx = (idx - 1 + DIFFICULTIES.length) % DIFFICULTIES.length;
     createSettings.diff = idx;
   }
   updateCreateUI();
}

// Bind Create Room Selectors
document.getElementById('btn-create-mode-prev').addEventListener('click', () => handleCreateSetting('mode', 'prev'));
document.getElementById('btn-create-mode-next').addEventListener('click', () => handleCreateSetting('mode', 'next'));
document.getElementById('btn-create-map-prev').addEventListener('click', () => handleCreateSetting('map', 'prev'));
document.getElementById('btn-create-map-next').addEventListener('click', () => handleCreateSetting('map', 'next'));
document.getElementById('btn-create-diff-prev').addEventListener('click', () => handleCreateSetting('diff', 'prev'));
document.getElementById('btn-create-diff-next').addEventListener('click', () => handleCreateSetting('diff', 'next'));

function switchMpView(viewId) {
  ['mp-view-select', 'mp-view-create', 'mp-view-join', 'mp-status'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');
}

function initMultiplayer() {
  const mpBtn = document.getElementById('mp-btn');
  const mpPopup = document.getElementById('mp-popup');
  
  // Main Menu Buttons
  document.getElementById('btn-select-create').addEventListener('click', () => {
    updateCreateUI();
    switchMpView('mp-view-create');
  });
  document.getElementById('btn-select-join').addEventListener('click', () => switchMpView('mp-view-join'));
  document.getElementById('btn-mp-close').addEventListener('click', () => {
    mpPopup.classList.add('hidden');
    mpPopup.style.display = 'none';
  });

  // Back Buttons
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => switchMpView('mp-view-select'));
  });

  // CREATE Action
  document.getElementById('btn-do-create').addEventListener('click', () => {
    const code = document.getElementById('mp-create-code').value;
    if(code.length !== 5) return alert("Enter 5-digit code");
    
    // Use local createSettings
    startMpAction('CREATE', code, createSettings);
  });

  // JOIN Action
  document.getElementById('join-room-btn').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value;
    if(code.length !== 5) return alert("Enter 5-digit code");
    startMpAction('JOIN', code);
  });

  // Cancel Wait
  document.getElementById('cancel-wait-btn').addEventListener('click', () => {
     mpPopup.style.display = 'none'; 
     mpPopup.classList.add('hidden');
     window.location.reload(); 
  });
  
  // Open Popup
  mpBtn.addEventListener('click', () => {
    mpPopup.classList.remove('hidden');
    mpPopup.style.display = 'block';
    switchMpView('mp-view-select');
  });
}

async function startMpAction(action, code, settings = null) {
  if (!db) return alert("DB Error");

  switchMpView('mp-status');
  document.getElementById('mp-status-text').textContent = action === 'CREATE' ? "CREATING ROOM..." : "CONNECTING...";
  
  mp.roomCode = code;
  mp.isActive = true;

  try {
     const roomBase = `rooms/${code}`;
     const dbRef = db.ref();
     
     if (action === 'CREATE') {
         // Check if exists
         const snap = await dbRef.child(roomBase + '/players/p1').get();
         if (snap.exists()) {
             alert("Room already exists! Try another code.");
             return switchMpView('mp-view-create');
         }
         
         // Set Settings
         await db.ref(roomBase + '/settings').set(settings);
         
         // Join as P1
         mp.playerId = 'p1';
         const p1Ref = db.ref(roomBase + '/players/p1');
         await p1Ref.set({ active: true, snake: [] });
         p1Ref.onDisconnect().remove();
         
         // Apply Local Settings
         game.settings.map = MAPS.indexOf(settings.map);
         game.settings.diff = settings.diff;
         
         document.getElementById('mp-status-text').textContent = "WAITING FOR P2...";

     } else {
         // JOIN
         const snap = await dbRef.child(roomBase + '/settings').get();
         if (!snap.exists()) {
             alert("Room does not exist!");
             return switchMpView('mp-view-join');
         }
         
         const hostSettings = snap.val();
         
         // Check P2 slot
         const p2Snap = await dbRef.child(roomBase + '/players/p2').get();
         if (p2Snap.exists()) {
             alert("Room full!");
             return switchMpView('mp-view-join');
         }
         
         mp.playerId = 'p2';
         const p2Ref = db.ref(roomBase + '/players/p2');
         await p2Ref.set({ active: true, snake: [] });
         p2Ref.onDisconnect().remove();
         
         // Sync Local Settings
         game.settings.map = MAPS.indexOf(hostSettings.map);
         game.settings.diff = hostSettings.diff;
         
         // Store MP specific settings for logic
         mp.settings = hostSettings; 
         
         document.getElementById('mp-status-text').textContent = "CONNECTED! WAITING FOR HOST...";
     }
     
     mp.connected = true;
     
     // LISTEN FOR OPPONENT
     const otherId = mp.playerId === 'p1' ? 'p2' : 'p1';
     db.ref(`rooms/${code}/players/${otherId}`).on('value', (snap) => {
         const data = snap.val();
         if (data && data.active) {
             mp.remoteSnake = data.snake || [];
             if (data.score !== undefined) mp.remoteScore = data.score;
             
             if (!game.active && document.getElementById('mp-popup').style.display !== 'none') {
                 startGame();
             }
         } else {
             mp.remoteSnake = [];
             mp.remoteScore = 0;
         }
     });

  } catch(e) {
      console.error(e);
      alert("Connection Failed: " + (e.code || e.message));
      switchMpView('mp-view-select');
  }
}

initMultiplayer();

// ==========================================
// UI & INPUTS
// ==========================================

function updateSettingsUI() {
  document.getElementById('theme-value').textContent = THEMES[game.settings.theme];
  document.getElementById('mode-value').textContent = MODES[game.settings.mode];
  document.getElementById('map-value').textContent = MAPS[game.settings.map];
  document.getElementById('diff-value').textContent = DIFFICULTIES[game.settings.diff];
  document.getElementById('size-value').textContent = SIZES[game.settings.size].label;
  document.getElementById('time-value').textContent = TIMES[game.settings.time].label;
  
  document.body.setAttribute('data-theme', THEMES[game.settings.theme]);
  
  // Show Preview Grid Logic
  if (!game.active) {
    Grid.init();
    drawPreview();
  }
}

function drawPreview() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const cs = CONFIG.cellSize;
  const style = getComputedStyle(document.body);
  const gridColor = style.getPropertyValue('--grid-color').trim();
  const wallColor = style.getPropertyValue('--wall-color').trim();

  // Draw Grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let x = 0; x <= CONFIG.cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cs, 0);
    ctx.lineTo(x * cs, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= CONFIG.rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cs);
    ctx.lineTo(canvas.width, y * cs);
    ctx.stroke();
  }

  // Draw Wall
  ctx.strokeStyle = wallColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  document.getElementById('preview-overlay').style.opacity = '1';
}

function handleSetting(action, target) {
  const arrays = {
    'theme': THEMES,
    'mode': MODES,
    'map': MAPS,
    'diff': DIFFICULTIES,
    'size': SIZES,
    'time': TIMES
  };
  const list = arrays[target];
  let current = game.settings[target];
  
  if (action === 'next') current++;
  else current--;
  
  if (current < 0) current = list.length - 1;
  if (current >= list.length) current = 0;
  
  game.settings[target] = current;
  updateSettingsUI();
}

// Arrow Buttons for Settings
document.querySelectorAll('.arrow-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    handleSetting(e.target.dataset.action, e.target.dataset.target);
  });
});

function exitGame() {
  game.active = false;
  mp.isActive = false; // Disable MP if valid
  mp.connected = false;
  if (game.timer) clearInterval(game.timer);
  if (game.clockTimer) clearInterval(game.clockTimer);
  
  // Return to menu
  toggleSidebar('MENU');
  document.getElementById('game-over').classList.add('hidden');
  document.getElementById('game-over').style.display = 'none'; // Ensure hidden
  
  drawPreview(); // Show start
}

document.getElementById('exit-btn').addEventListener('click', exitGame);

// About Btn in MP
document.getElementById('about-btn-mp').addEventListener('click', () => {
    document.getElementById('about-panel').classList.add('open');
});

// Mobile Bottom Bar Logic
document.getElementById('mob-start-btn').addEventListener('click', startGame);

document.getElementById('mob-settings-btn').addEventListener('click', () => {
  const panel = document.getElementById('game-right');
  panel.classList.toggle('open');
  // Add a close tap handler? 
});

// Close Settings Panel when clicking outside (on canvas) if open?
document.getElementById('game-left').addEventListener('click', () => {
   document.getElementById('game-right').classList.remove('open');
});

document.getElementById('start-btn').addEventListener('click', () => {
  mp.isActive = false; // Force single player
  startGame();
});

document.getElementById('restart-btn').addEventListener('click', () => {
   // Reset inline style for safety
   document.getElementById('game-over').style.display = 'none';
   if (mp.isActive) {
     // Mp restart logic?
   }
   startGame();
});

document.getElementById('about-btn').addEventListener('click', () => {
  document.getElementById('about-panel').classList.add('open');
});

document.getElementById('close-about').addEventListener('click', () => {
  document.getElementById('about-panel').classList.remove('open');
});

document.getElementById('help-btn').addEventListener('click', () => {
  document.getElementById('help-panel').classList.add('open');
});

document.getElementById('close-help').addEventListener('click', () => {
  document.getElementById('help-panel').classList.remove('open');
});

// Custom Discord Button Logic
document.querySelector('.social-btn.discord').addEventListener('click', (e) => {
  e.preventDefault();
  const text = "suprememuhit";
  navigator.clipboard.writeText(text).then(() => {
    alert("Copied 'suprememuhit' to clipboard!");
  }).catch(err => {
    console.error('Failed to copy: ', err);
  });
});

// KEYBOARD Controls
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('about-panel').classList.remove('open');
    document.getElementById('help-panel').classList.remove('open');
    return;
  }
  if (!game.active && e.key === 'Enter') {
     if (document.getElementById('game-over').classList.contains('hidden')) startGame();
     return;
  }

  if (!game.active) return;
  const key = e.key;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(key)) e.preventDefault();

  handleInput(key);
});

// D-PAD Controls
document.querySelectorAll('.d-btn').forEach(btn => {
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleInput(btn.dataset.key);
  });
  btn.addEventListener('mousedown', (e) => {
     handleInput(btn.dataset.key);
  });
});

function handleInput(key) {
  const goingUp = game.dir.y === -1;
  const goingDown = game.dir.y === 1;
  const goingRight = game.dir.x === 1;
  const goingLeft = game.dir.x === -1;

  if ((key === 'ArrowUp' || key === 'w') && !goingDown) game.nextDir = {x:0, y:-1};
  if ((key === 'ArrowDown' || key === 's') && !goingUp) game.nextDir = {x:0, y:1};
  if ((key === 'ArrowLeft' || key === 'a') && !goingRight) game.nextDir = {x:-1, y:0};
  if ((key === 'ArrowRight' || key === 'd') && !goingLeft) game.nextDir = {x:1, y:0};
}

// SWIPE Controls
let touchStart = {x:0, y:0};
document.addEventListener('touchstart', e => {
  if (e.target.classList.contains('d-btn')) return; 
  touchStart.x = e.touches[0].clientX;
  touchStart.y = e.touches[0].clientY;
}, {passive: false});

document.addEventListener('touchmove', e => {
  if(game.active) e.preventDefault();
}, {passive: false});

document.addEventListener('touchend', e => {
  if (!game.active) return;
  if (e.target.classList.contains('d-btn')) return; 

  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  
  if (Math.abs(dx) > 30 || Math.abs(dy) > 30) { 
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) handleInput('ArrowRight');
      else handleInput('ArrowLeft');
    } else {
      if (dy > 0) handleInput('ArrowDown');
      else handleInput('ArrowUp');
    }
  }
});

// Force Hide Game Over on Init
document.getElementById('game-over').classList.add('hidden');
renderLeaderboard();
updateSettingsUI();
window.addEventListener('resize', () => { 
  Grid.init(); 
  if(!game.active) drawPreview();
  else draw();
});