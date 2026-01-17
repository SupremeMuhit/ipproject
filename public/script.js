import * as THREE from 'three';

// ============================================
// GAME STATE
// ============================================
const game = {
  scene: null,
  camera: null,
  renderer: null,
  player: null,
  enemies: [],
  projectiles: [],
  particles: [],
  stars: [],
  score: 0,
  wave: 1,
  health: 100,
  isPlaying: false,
  enemiesKilled: 0,
  gameOver: false,
  highScore: parseInt(localStorage.getItem('highScore')) || 0,
  keys: {},
  mouse: { x: 0, y: 0 },
  lastShot: 0,
  shootDelay: 200,
  waveInProgress: false
};

// ============================================
// INITIALIZATION
// ============================================
function init() {
  // Create scene
  game.scene = new THREE.Scene();
  game.scene.fog = new THREE.FogExp2(0x000510, 0.00025);

  // Create camera
  game.camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  game.camera.position.set(0, 5, 15);
  game.camera.lookAt(0, 0, 0);

  // Create renderer
  const canvas = document.getElementById('gameCanvas');
  game.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  game.renderer.setSize(window.innerWidth, window.innerHeight);
  game.renderer.setPixelRatio(window.devicePixelRatio);
  game.renderer.shadowMap.enabled = true;

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
  game.scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 10, 10);
  directionalLight.castShadow = true;
  game.scene.add(directionalLight);

  // Create starfield
  createStarfield();

  // Create player ship
  createPlayer();

  // Event listeners
  document.addEventListener('keydown', (e) => game.keys[e.key.toLowerCase()] = true);
  document.addEventListener('keyup', (e) => game.keys[e.key.toLowerCase()] = false);
  document.addEventListener('mousemove', onMouseMove);
  window.addEventListener('resize', onWindowResize);

  // UI Event listeners
  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('restartBtn').addEventListener('click', restartGame);
  document.getElementById('menuBtn').addEventListener('click', showMainMenu);
  document.getElementById('controlsBtn').addEventListener('click', showControls);
  document.getElementById('backBtn').addEventListener('click', hideControls);

  // Update high score display
  document.getElementById('highScore').textContent = game.highScore;

  // Hide loading screen
  setTimeout(() => {
    document.getElementById('loading-screen').style.opacity = '0';
    setTimeout(() => {
      document.getElementById('loading-screen').style.display = 'none';
    }, 500);
  }, 1500);
}

// ============================================
// PLAYER CREATION
// ============================================
function createPlayer() {
  const geometry = new THREE.ConeGeometry(0.5, 2, 4);
  const material = new THREE.MeshPhongMaterial({ 
    color: 0x00ff88,
    emissive: 0x00ff88,
    emissiveIntensity: 0.5,
    shininess: 100
  });
  
  game.player = new THREE.Mesh(geometry, material);
  game.player.rotation.x = Math.PI / 2;
  game.player.position.set(0, 0, 10);
  game.player.castShadow = true;
  game.scene.add(game.player);

  // Add glow effect
  const glowGeometry = new THREE.ConeGeometry(0.7, 2.5, 4);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.3
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.rotation.x = Math.PI / 2;
  game.player.add(glow);
}

// ============================================
// STARFIELD
// ============================================
function createStarfield() {
  const starGeometry = new THREE.BufferGeometry();
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.7,
    transparent: true
  });

  const starVertices = [];
  for (let i = 0; i < 10000; i++) {
    const x = (Math.random() - 0.5) * 2000;
    const y = (Math.random() - 0.5) * 2000;
    const z = (Math.random() - 0.5) * 2000;
    starVertices.push(x, y, z);
  }

  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
  const stars = new THREE.Points(starGeometry, starMaterial);
  game.scene.add(stars);
  game.stars.push(stars);
}

// ============================================
// ENEMY CREATION
// ============================================
function spawnEnemy() {
  const geometry = new THREE.OctahedronGeometry(0.8);
  const material = new THREE.MeshPhongMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    emissiveIntensity: 0.5,
    shininess: 100
  });

  const enemy = new THREE.Mesh(geometry, material);
  
  // Random spawn position around player
  const angle = Math.random() * Math.PI * 2;
  const distance = 30 + Math.random() * 20;
  enemy.position.set(
    Math.cos(angle) * distance,
    (Math.random() - 0.5) * 10,
    Math.sin(angle) * distance - 30
  );

  enemy.velocity = new THREE.Vector3();
  enemy.health = 1 + Math.floor(game.wave / 3);
  enemy.castShadow = true;
  
  game.scene.add(enemy);
  game.enemies.push(enemy);
}

// ============================================
// PROJECTILE CREATION
// ============================================
function shoot() {
  const now = Date.now();
  if (now - game.lastShot < game.shootDelay) return;
  game.lastShot = now;

  const geometry = new THREE.SphereGeometry(0.2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff
  });

  const projectile = new THREE.Mesh(geometry, material);
  projectile.position.copy(game.player.position);
  
  // Direction from player towards mouse
  const direction = new THREE.Vector3(
    game.mouse.x * 0.5,
    game.mouse.y * 0.5,
    -1
  ).normalize();
  
  projectile.velocity = direction.multiplyScalar(1);
  
  game.scene.add(projectile);
  game.projectiles.push(projectile);

  // Visual feedback
  document.getElementById('weaponCooldown').style.width = '0%';
  setTimeout(() => {
    document.getElementById('weaponCooldown').style.width = '100%';
  }, 10);
}

// ============================================
// PARTICLE EFFECTS
// ============================================
function createExplosion(position, color = 0xff6600) {
  for (let i = 0; i < 20; i++) {
    const geometry = new THREE.SphereGeometry(0.1);
    const material = new THREE.MeshBasicMaterial({ color });
    const particle = new THREE.Mesh(geometry, material);
    
    particle.position.copy(position);
    particle.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5
    );
    particle.life = 1;
    
    game.scene.add(particle);
    game.particles.push(particle);
  }
}

// ============================================
// GAME LOOP
// ============================================
function animate() {
  requestAnimationFrame(animate);

  if (!game.isPlaying) {
    // Rotate stars even in menu
    game.stars.forEach(stars => {
      stars.rotation.y += 0.0001;
    });
    game.renderer.render(game.scene, game.camera);
    return;
  }

  // Update player
  updatePlayer();

  // Update enemies
  updateEnemies();

  // Update projectiles
  updateProjectiles();

  // Update particles
  updateParticles();

  // Check collisions
  checkCollisions();

  // Spawn new wave
  if (game.enemies.length === 0 && !game.waveInProgress) {
    game.waveInProgress = true;
    setTimeout(() => {
      startNextWave();
    }, 2000);
  }

  // Update HUD
  updateHUD();

  // Render
  game.renderer.render(game.scene, game.camera);
}

// ============================================
// UPDATE FUNCTIONS
// ============================================
function updatePlayer() {
  const speed = 0.3;
  
  if (game.keys['w'] || game.keys['arrowup']) game.player.position.z -= speed;
  if (game.keys['s'] || game.keys['arrowdown']) game.player.position.z += speed;
  if (game.keys['a'] || game.keys['arrowleft']) game.player.position.x -= speed;
  if (game.keys['d'] || game.keys['arrowright']) game.player.position.x += speed;
  if (game.keys[' ']) shoot();

  // Constrain player position
  game.player.position.x = Math.max(-25, Math.min(25, game.player.position.x));
  game.player.position.z = Math.max(-5, Math.min(15, game.player.position.z));

  // Tilt player based on movement
  game.player.rotation.z = -game.player.position.x * 0.05;
}

function updateEnemies() {
  game.enemies.forEach((enemy, index) => {
    // Move towards player
    const direction = new THREE.Vector3()
      .subVectors(game.player.position, enemy.position)
      .normalize();
    
    enemy.velocity.add(direction.multiplyScalar(0.01));
    enemy.velocity.multiplyScalar(0.95); // Damping
    
    enemy.position.add(enemy.velocity);
    enemy.rotation.x += 0.02;
    enemy.rotation.y += 0.03;

    // Check if enemy reached player
    const dist = enemy.position.distanceTo(game.player.position);
    if (dist < 2) {
      takeDamage(20);
      createExplosion(enemy.position);
      game.scene.remove(enemy);
      game.enemies.splice(index, 1);
    }
  });
}

function updateProjectiles() {
  game.projectiles.forEach((projectile, index) => {
    projectile.position.add(projectile.velocity);

    // Remove if too far
    if (projectile.position.length() > 100) {
      game.scene.remove(projectile);
      game.projectiles.splice(index, 1);
    }
  });
}

function updateParticles() {
  game.particles.forEach((particle, index) => {
    particle.position.add(particle.velocity);
    particle.life -= 0.02;
    particle.material.opacity = particle.life;

    if (particle.life <= 0) {
      game.scene.remove(particle);
      game.particles.splice(index, 1);
    }
  });
}

// ============================================
// COLLISION DETECTION
// ============================================
function checkCollisions() {
  game.projectiles.forEach((projectile, pIndex) => {
    game.enemies.forEach((enemy, eIndex) => {
      const dist = projectile.position.distanceTo(enemy.position);
      if (dist < 1) {
        enemy.health--;
        
        if (enemy.health <= 0) {
          game.score += 100 * game.wave;
          game.enemiesKilled++;
          createExplosion(enemy.position, 0xff6600);
          game.scene.remove(enemy);
          game.enemies.splice(eIndex, 1);
        }

        game.scene.remove(projectile);
        game.projectiles.splice(pIndex, 1);
      }
    });
  });
}

// ============================================
// GAME CONTROL
// ============================================
function startGame() {
  game.isPlaying = true;
  game.gameOver = false;
  game.score = 0;
  game.wave = 1;
  game.health = 100;
  game.enemiesKilled = 0;

  document.getElementById('start-menu').classList.add('hidden');
  document.getElementById('game-hud').classList.remove('hidden');

  startNextWave();
}

function startNextWave() {
  game.wave++;
  document.getElementById('wave').textContent = game.wave;
  
  const enemyCount = 3 + (game.wave * 2);
  for (let i = 0; i < enemyCount; i++) {
    setTimeout(() => spawnEnemy(), i * 500);
  }
  
  game.waveInProgress = false;
}

function takeDamage(amount) {
  game.health = Math.max(0, game.health - amount);
  
  if (game.health <= 0) {
    endGame();
  }
}

function endGame() {
  game.isPlaying = false;
  game.gameOver = true;

  if (game.score > game.highScore) {
    game.highScore = game.score;
    localStorage.setItem('highScore', game.highScore);
  }

  document.getElementById('game-hud').classList.add('hidden');
  document.getElementById('game-over').classList.remove('hidden');
  document.getElementById('finalScore').textContent = game.score;
  document.getElementById('finalWave').textContent = game.wave;
  document.getElementById('enemiesKilled').textContent = game.enemiesKilled;

  // Clean up
  game.enemies.forEach(e => game.scene.remove(e));
  game.projectiles.forEach(p => game.scene.remove(p));
  game.particles.forEach(p => game.scene.remove(p));
  game.enemies = [];
  game.projectiles = [];
  game.particles = [];
}

function restartGame() {
  document.getElementById('game-over').classList.add('hidden');
  startGame();
}

function showMainMenu() {
  document.getElementById('game-over').classList.add('hidden');
  document.getElementById('start-menu').classList.remove('hidden');
  document.getElementById('highScore').textContent = game.highScore;
}

function showControls() {
  document.getElementById('start-menu').classList.add('hidden');
  document.getElementById('controls-screen').classList.remove('hidden');
}

function hideControls() {
  document.getElementById('controls-screen').classList.add('hidden');
  document.getElementById('start-menu').classList.remove('hidden');
}

// ============================================
// HUD UPDATES
// ============================================
function updateHUD() {
  document.getElementById('score').textContent = game.score;
  document.getElementById('enemies').textContent = game.enemies.length;
  
  const healthPercent = (game.health / 100) * 100;
  document.getElementById('healthFill').style.width = healthPercent + '%';
  document.getElementById('healthValue').textContent = game.health + '%';

  // Health bar color
  const healthFill = document.getElementById('healthFill');
  if (game.health > 60) {
    healthFill.style.background = 'linear-gradient(90deg, #00ff88, #00cc66)';
  } else if (game.health > 30) {
    healthFill.style.background = 'linear-gradient(90deg, #ffcc00, #ff9900)';
  } else {
    healthFill.style.background = 'linear-gradient(90deg, #ff3333, #cc0000)';
  }
}

// ============================================
// EVENT HANDLERS
// ============================================
function onMouseMove(event) {
  game.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  game.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onWindowResize() {
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// START
// ============================================
init();
animate();
