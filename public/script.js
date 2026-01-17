
// ==========================================
// SUPER SNAKE ENGINE
// ==========================================

const CONFIG = {
  cols: 25,
  rows: 25,
  cellSize: 20,
  speed: {
    CLASSIC: 100,
    SPEED: 60,
    SURVIVAL: 110,
    ZEN: 120
  }
};

// DATA SETS
const THEMES = ['NEON', 'CLASSIC', 'MINIMAL', 'BIO-HAZARD'];
const MODES = ['CLASSIC', 'SPEED', 'SURVIVAL', 'ZEN'];
const MAPS = ['BOX', 'INFINITE', 'MAZE', 'OBSTACLES'];

// STATE
let game = {
  active: false,
  timer: null,
  score: 0,
  snake: [],
  dir: {x:1, y:0}, // Direction
  nextDir: null,   // Buffered Input
  food: null,
  obstacles: [],   // Walls specifically for Survival/Maze
  settings: {
    theme: 0,
    mode: 0,
    map: 0
  }
};

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
    // Responsive Sizing
    const size = Math.min(window.innerWidth - 40, window.innerHeight - 200, 500);
    const snap = Math.floor(size / CONFIG.cols) * CONFIG.cols; // Snap to grid
    
    canvas.width = snap;
    canvas.height = snap;
    CONFIG.cellSize = snap / CONFIG.cols;
  }

  static generateMap(type) {
    game.obstacles = []; // Reset
    
    // Boundary Walls (For BOX mode - default)
    // INFINITE mode handles walls differently (wrap logic)
    
    if (type === 'MAZE') {
      // Simple Grid Maze Pattern
      for (let x = 4; x < CONFIG.cols - 4; x += 4) {
        for (let y = 4; y < CONFIG.rows - 4; y++) {
          game.obstacles.push({x, y});
        }
      }
    } else if (type === 'OBSTACLES') {
      // Random blocks
      for(let i=0; i<30; i++) {
        const x = Math.floor(Math.random() * CONFIG.cols);
        const y = Math.floor(Math.random() * CONFIG.rows);
        if (x>5 || y>5) // Keep start area clear
          game.obstacles.push({x, y});
      }
    }
  }
}

// ==========================================
// GAME LOOP
// ==========================================

function startGame() {
  document.getElementById('main-menu').classList.add('hidden');
  document.getElementById('game-over').classList.add('hidden');
  document.getElementById('game-ui').classList.remove('hidden');
  
  Grid.init();
  
  // Logic Setup
  game.snake = [{x: 5, y: 10}, {x: 4, y: 10}, {x: 3, y: 10}];
  game.dir = {x: 1, y: 0};
  game.nextDir = {x: 1, y: 0};
  game.score = 0;
  game.active = true;
  game.food = spawnFood();
  
  // Apply Settings
  const mapType = MAPS[game.settings.map];
  Grid.generateMap(mapType);
  
  const modeType = MODES[game.settings.mode];
  modeEl.textContent = modeType;
  
  updateScore(0);
  
  if (game.timer) clearInterval(game.timer);
  game.timer = setInterval(update, CONFIG.speed[modeType] || 100);
}

function update() {
  if (!game.active) return;

  // 1. Move Snake
  if (game.nextDir) {
    if (game.dir.x + game.nextDir.x !== 0 || game.dir.y + game.nextDir.y !== 0) {
      game.dir = game.nextDir;
    }
    game.nextDir = null; // consume buffer
  }

  const head = {x: game.snake[0].x + game.dir.x, y: game.snake[0].y + game.dir.y};

  // 2. Map Coords Logic
  const mapType = MAPS[game.settings.map];
  
  if (mapType === 'INFINITE') {
    // Wrap Around
    if (head.x < 0) head.x = CONFIG.cols - 1;
    if (head.x >= CONFIG.cols) head.x = 0;
    if (head.y < 0) head.y = CONFIG.rows - 1;
    if (head.y >= CONFIG.rows) head.y = 0;
  } else {
    // Walls Kill
    if (head.x < 0 || head.x >= CONFIG.cols || head.y < 0 || head.y >= CONFIG.rows) {
      if (MODES[game.settings.mode] !== 'ZEN') return gameOver();
      // Zen mode wraps on death conditions usually, or just stops logic
      // Let's make Zen wrap too
      if (head.x < 0) head.x = CONFIG.cols - 1;
      if (head.x >= CONFIG.cols) head.x = 0;
      if (head.y < 0) head.y = CONFIG.rows - 1;
      if (head.y >= CONFIG.rows) head.y = 0;
    }
  }

  // 3. Collision Check
  // Self
  if (game.snake.some(s => s.x === head.x && s.y === head.y)) {
    if (MODES[game.settings.mode] !== 'ZEN') return gameOver();
  }
  
  // Obstacles
  if (game.obstacles.some(o => o.x === head.x && o.y === head.y)) {
    return gameOver();
  }

  // 4. Move Execution
  game.snake.unshift(head);

  // 5. Eat Food
  if (head.x === game.food.x && head.y === game.food.y) {
    // Ate Food
    game.score += 10;
    updateScore(game.score);
    game.food = spawnFood();
    
    // Survival Mode: Add Obstacles on eat
    if (MODES[game.settings.mode] === 'SURVIVAL') {
      addRandomObstacle();
    }
  } else {
    // Didn't eat, trim tail
    game.snake.pop();
  }

  draw();
}

function draw() {
  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const cs = CONFIG.cellSize;
  const pd = 2; // padding for localized grid look
  
  // Draw Obstacles
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--grid-color').replace('0.05', '0.5'); // Make it visible
  // Actually get colors dynamically
  const style = getComputedStyle(document.body);
  const accent = style.getPropertyValue('--accent-color').trim();
  const primary = style.getPropertyValue('--primary-color').trim();
  const foodColor = style.getPropertyValue('--food-color').trim();

  // Draw Walls/Obstacles
  ctx.fillStyle = '#555'; // Standard gray wall
  game.obstacles.forEach(o => {
    ctx.fillRect(o.x * cs + pd, o.y * cs + pd, cs - pd*2, cs - pd*2);
  });

  // Draw Food
  ctx.fillStyle = foodColor;
  ctx.shadowBlur = 15;
  ctx.shadowColor = foodColor;
  ctx.beginPath();
  ctx.arc(game.food.x*cs + cs/2, game.food.y*cs + cs/2, cs/3, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Draw Snake
  game.snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? primary : accent;
    ctx.shadowBlur = i === 0 ? 10 : 0;
    ctx.shadowColor = primary;
    
    ctx.fillRect(seg.x * cs + pd, seg.y * cs + pd, cs - pd*2, cs - pd*2);
  });
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
    // Check collision with snake
    const hitSnake = game.snake.some(s => s.x === pos.x && s.y === pos.y);
    const hitWall = game.obstacles.some(o => o.x === pos.x && o.y === pos.y);
    if (!hitSnake && !hitWall) valid = true;
  }
  return pos;
}

function addRandomObstacle() {
  const pos = spawnFood(); // Use food logic to find empty spot
  game.obstacles.push(pos);
}

function updateScore(s) {
  scoreEl.textContent = s;
}

function gameOver() {
  game.active = false;
  clearInterval(game.timer);
  
  document.getElementById('game-over').classList.remove('hidden');
  document.getElementById('final-score').textContent = game.score;
  
  // High Score Logic
  const saved = parseInt(localStorage.getItem('snakeHighScore')) || 0;
  if (game.score > saved) {
    localStorage.setItem('snakeHighScore', game.score);
    document.getElementById('new-high-score').classList.remove('hidden');
    updateMenuHighScore();
  } else {
    document.getElementById('new-high-score').classList.add('hidden');
  }
}

// ==========================================
// UI & INPUTS
// ==========================================

function updateSettingsUI() {
  document.getElementById('theme-value').textContent = THEMES[game.settings.theme];
  document.getElementById('mode-value').textContent = MODES[game.settings.mode];
  document.getElementById('map-value').textContent = MAPS[game.settings.map];
  
  // Apply Theme Instantly
  document.body.setAttribute('data-theme', THEMES[game.settings.theme]);
}

function handleSetting(action, target) {
  const arrays = {
    'theme': THEMES,
    'mode': MODES,
    'map': MAPS
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

function updateMenuHighScore() {
  const s = localStorage.getItem('snakeHighScore') || 0;
  document.getElementById('menu-high-score').textContent = s;
}

// Event Listeners
document.querySelectorAll('.arrow-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    handleSetting(e.target.dataset.action, e.target.dataset.target);
  });
});

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('menu-btn').addEventListener('click', () => {
  document.getElementById('game-over').classList.add('hidden');
  document.getElementById('game-ui').classList.add('hidden');
  document.getElementById('main-menu').classList.remove('hidden');
});

// Controls
document.addEventListener('keydown', e => {
  if (!game.active) return;
  const key = e.key;
  
  // Prevent default scroll
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key)) e.preventDefault();

  const goingUp = game.dir.y === -1;
  const goingDown = game.dir.y === 1;
  const goingRight = game.dir.x === 1;
  const goingLeft = game.dir.x === -1;

  if ((key === 'ArrowUp' || key === 'w') && !goingDown) game.nextDir = {x:0, y:-1};
  if ((key === 'ArrowDown' || key === 's') && !goingUp) game.nextDir = {x:0, y:1};
  if ((key === 'ArrowLeft' || key === 'a') && !goingRight) game.nextDir = {x:-1, y:0};
  if ((key === 'ArrowRight' || key === 'd') && !goingLeft) game.nextDir = {x:1, y:0};
});

// Mobile Swipe
let touchStart = {x:0, y:0};
document.addEventListener('touchstart', e => {
  touchStart.x = e.touches[0].clientX;
  touchStart.y = e.touches[0].clientY;
}, {passive: false});

document.addEventListener('touchmove', e => {
  if(game.active) e.preventDefault();
}, {passive: false});

document.addEventListener('touchend', e => {
  if (!game.active) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal
    if (dx > 0 && game.dir.x !== -1) game.nextDir = {x:1, y:0};
    if (dx < 0 && game.dir.x !== 1) game.nextDir = {x:-1, y:0};
  } else {
    // Vertical
    if (dy > 0 && game.dir.y !== -1) game.nextDir = {x:0, y:1};
    if (dy < 0 && game.dir.y !== 1) game.nextDir = {x:0, y:-1};
  }
});

// Init
updateMenuHighScore();
updateSettingsUI();
window.addEventListener('resize', () => { if(game.active) Grid.init(); });
