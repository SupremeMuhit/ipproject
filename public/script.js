
// ==========================================
// FLUPPY SNAKE 2.0 ENGINE
// ==========================================

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
const THEMES = ['NEON', 'CLASSIC', 'MINIMAL', 'BIO-HAZARD', 'MATRIX', 'SUNSET', 'CANDY', 'GAMEBOY'];
const MODES = ['CLASSIC', 'SPEED', 'SURVIVAL', 'ZEN', 'CAMPAIGN', 'PORTAL', 'POISON'];
const MAPS = ['BOX', 'INFINITE', 'MAZE', 'OBSTACLES'];
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD', 'EXTREME'];

// STATE
let game = {
  active: false,
  timer: null,
  score: 0,
  snake: [],
  dir: {x:1, y:0}, // Direction
  nextDir: null,   // Buffered Input
  food: null,
  poison: null,    // For POISON mode
  obstacles: [],
  settings: {
    theme: 0,
    mode: 0,
    map: 0,
    diff: 1 // Default Medium
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
    // Reserve space for mobile controls on small screens
    const isMobile = window.innerWidth < 600;
    const maxHeight = window.innerHeight - (isMobile ? 300 : 200); 
    const size = Math.min(window.innerWidth - 40, maxHeight, 500);
    const snap = Math.floor(size / CONFIG.cols) * CONFIG.cols;
    
    canvas.width = snap;
    canvas.height = snap;
    CONFIG.cellSize = snap / CONFIG.cols;
  }

  static generateMap(type) {
    game.obstacles = []; // Reset
    
    if (type === 'MAZE') {
      // Grid Maze
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
        if (x>5 || y>5) game.obstacles.push({x, y});
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
  game.poison = null;
  game.food = spawnFood();
  if (MODES[game.settings.mode] === 'POISON') game.poison = spawnFood(); // Spawn first poison
  
  // Apply Settings
  const mapType = MAPS[game.settings.map];
  Grid.generateMap(mapType);
  
  const modeType = MODES[game.settings.mode];
  modeEl.textContent = `${modeType} (${DIFFICULTIES[game.settings.diff]})`;
  
  updateScore(0);
  
  // Speed Calculation
  let tickRate = CONFIG.baseSpeed[DIFFICULTIES[game.settings.diff]];
  
  if (modeType === 'SPEED') tickRate *= 0.7; // Faster in speed mode
  if (modeType === 'ZEN') tickRate *= 1.5;   // Slower in Zen
  
  if (game.timer) clearInterval(game.timer);
  game.timer = setInterval(update, tickRate);
}

function update() {
  if (!game.active) return;

  // 1. Move Snake
  if (game.nextDir) {
    if (game.dir.x + game.nextDir.x !== 0 || game.dir.y + game.nextDir.y !== 0) {
      game.dir = game.nextDir;
    }
    game.nextDir = null; 
  }

  const head = {x: game.snake[0].x + game.dir.x, y: game.snake[0].y + game.dir.y};
  const mode = MODES[game.settings.mode];
  const map = MAPS[game.settings.map];

  // 2. Logic: Walls vs Wrap
  // PORTAL mode always wraps
  const isInfinite = map === 'INFINITE' || mode === 'PORTAL';
  
  if (isInfinite) {
    if (head.x < 0) head.x = CONFIG.cols - 1;
    if (head.x >= CONFIG.cols) head.x = 0;
    if (head.y < 0) head.y = CONFIG.rows - 1;
    if (head.y >= CONFIG.rows) head.y = 0;
  } else {
    // Wall Death
    if (head.x < 0 || head.x >= CONFIG.cols || head.y < 0 || head.y >= CONFIG.rows) {
      if (mode !== 'ZEN') return gameOver();
      // Zen wrap
      if (head.x < 0) head.x = CONFIG.cols - 1;
      if (head.x >= CONFIG.cols) head.x = 0;
      if (head.y < 0) head.y = CONFIG.rows - 1;
      if (head.y >= CONFIG.rows) head.y = 0;
    }
  }

  // 3. Collision Check
  // Self
  if (game.snake.some(s => s.x === head.x && s.y === head.y)) {
    if (mode !== 'ZEN') return gameOver();
  }
  
  // Obstacles
  if (game.obstacles.some(o => o.x === head.x && o.y === head.y)) {
    return gameOver();
  }
  
  // Poison (Collision with red food)
  if (game.poison && head.x === game.poison.x && head.y === game.poison.y) {
    return gameOver();
  }

  // 4. Move Execution
  game.snake.unshift(head);

  // 5. Eat Food
  if (head.x === game.food.x && head.y === game.food.y) {
    game.score += 10;
    
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

  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const cs = CONFIG.cellSize;
  const pd = 2; 
  
  const style = getComputedStyle(document.body);
  const primary = style.getPropertyValue('--primary-color').trim();
  const accent = style.getPropertyValue('--accent-color').trim();
  const foodColor = style.getPropertyValue('--food-color').trim();
  const poisonColor = style.getPropertyValue('--poison-color').trim();

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
  
  // Draw Poison
  if (game.poison) {
    ctx.fillStyle = poisonColor;
    ctx.shadowBlur = 10;
    ctx.shadowColor = poisonColor;
    ctx.beginPath();
    ctx.moveTo(game.poison.x*cs + cs/2, game.poison.y*cs + pd);
    ctx.lineTo(game.poison.x*cs + cs-pd, game.poison.y*cs + cs-pd);
    ctx.lineTo(game.poison.x*cs + pd, game.poison.y*cs + cs-pd);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

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
    const hitSnake = game.snake.some(s => s.x === pos.x && s.y === pos.y);
    const hitWall = game.obstacles.some(o => o.x === pos.x && o.y === pos.y);
    const hitPoison = game.poison && game.poison.x === pos.x && game.poison.y === pos.x;
    if (!hitSnake && !hitWall && !hitPoison) valid = true;
  }
  return pos;
}

function relocatePoison() {
  // Move poison to new spot occasionally or just keep adding?
  // Let's spawn a NEW poison every 3 foods for challenge
  if (game.score % 30 === 0) {
    let newPoison = spawnFood();
    // In this simple version max 1 poison, so we just move it
    game.poison = newPoison;
  }
}

function addRandomObstacle() {
  const pos = spawnFood();
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
  
  const saved = parseInt(localStorage.getItem('snakeHighScore')) || 0;
  if (game.score > saved) {
    localStorage.setItem('snakeHighScore', game.score);
    document.getElementById('new-high-score').classList.remove('hidden');
    updateMenuHighScore();
  }
}

function pingLogger() {
  fetch('https://fluppy.suprememuhit.workers.dev/ping', {
    mode: 'cors',
    cache: 'no-cache'
  }).catch(e => console.log("Logger ping failed", e));
}
pingLogger();

// ==========================================
// UI & INPUTS
// ==========================================

function updateSettingsUI() {
  document.getElementById('theme-value').textContent = THEMES[game.settings.theme];
  document.getElementById('mode-value').textContent = MODES[game.settings.mode];
  document.getElementById('map-value').textContent = MAPS[game.settings.map];
  document.getElementById('diff-value').textContent = DIFFICULTIES[game.settings.diff];
  
  document.body.setAttribute('data-theme', THEMES[game.settings.theme]);
}

function handleSetting(action, target) {
  const arrays = {
    'theme': THEMES,
    'mode': MODES,
    'map': MAPS,
    'diff': DIFFICULTIES
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

// Arrow Buttons for Settings
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

// KEYBOARD Controls
document.addEventListener('keydown', e => {
  if (!game.active) return;
  const key = e.key;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(key)) e.preventDefault();

  handleInput(key);
});

// D-PAD Controls
document.querySelectorAll('.d-btn').forEach(btn => {
  // Mobile touch support
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleInput(btn.dataset.key);
  });
  // Desktop Click support
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
  if (e.target.classList.contains('d-btn')) return; // Don't swipe if hitting button
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
  
  if (Math.abs(dx) > 30 || Math.abs(dy) > 30) { // Threshold
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) handleInput('ArrowRight');
      else handleInput('ArrowLeft');
    } else {
      if (dy > 0) handleInput('ArrowDown');
      else handleInput('ArrowUp');
    }
  }
});

updateMenuHighScore();
updateSettingsUI();
window.addEventListener('resize', () => { if(game.active) Grid.init(); });
