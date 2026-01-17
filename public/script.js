import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ================= CONSTANTS & CONFIG =================
const CONFIG = {
  worldSize: 1000,
  playerSpeed: 30,
  playerTurnSpeed: 4.0,
  drag: 0.95, // Space friction
  asteroidCount: 200,
  colors: {
    hero: 0x00f3ff,
    enemy: 0xff003c,
    star: 0xffffff,
    void: 0x050505
  }
};

// ================= GLOBAL STATE =================
const state = {
  isPlaying: false,
  score: 0,
  health: 100,
  energy: 100,
  mouse: new THREE.Vector2(),
  keys: { w: false, a: false, s: false, d: false, space: false },
  lastTime: 0
};

// ================= ENGINE COMPONENTS =================
const engine = {
  scene: null,
  camera: null,
  renderer: null,
  composer: null,
  world: null, // Physics world
  clock: new THREE.Clock(),
  bodies: [], // Physics bodies to sync
  meshes: [], // Visual meshes to sync
  removables: [], // Objects to cleanup
  particles: []
};

// ================= GAME OBJECTS =================
let player = {
  mesh: null,
  body: null,
  weaponCooldown: 0
};

// ================= INITIALIZATION =================
function init() {
  // 1. Setup Three.js Scene
  engine.scene = new THREE.Scene();
  engine.scene.fog = new THREE.FogExp2(CONFIG.colors.void, 0.002);
  
  engine.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  engine.camera.position.set(0, 40, 20);
  engine.camera.lookAt(0, 0, 0);

  engine.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: false });
  engine.renderer.setSize(window.innerWidth, window.innerHeight);
  engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
  engine.renderer.toneMapping = THREE.ReinhardToneMapping;

  // 2. Setup Cannon.js (Physics)
  engine.world = new CANNON.World();
  engine.world.gravity.set(0, 0, 0); // Open space, no gravity
  engine.world.broadphase = new CANNON.SAPBroadphase(engine.world);

  // 3. Post-Processing (Bloom)
  const renderScene = new RenderPass(engine.scene, engine.camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
  bloomPass.threshold = 0.1;
  bloomPass.strength = 1.2; // High bloom for neon look
  bloomPass.radius = 0.5;

  engine.composer = new EffectComposer(engine.renderer);
  engine.composer.addPass(renderScene);
  engine.composer.addPass(bloomPass);

  // 4. Lighting
  const ambientLight = new THREE.AmbientLight(0x404040);
  engine.scene.add(ambientLight);
  
  // Dynamic sun
  const sunLight = new THREE.DirectionalLight(0xffffff, 2);
  sunLight.position.set(-100, 100, -50);
  sunLight.castShadow = true;
  engine.scene.add(sunLight);

  // 5. Environment
  createStarfield();
  createPlayer();
  createAsteroidField();

  // 6. Listeners
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);

  // UI Listeners
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  // Start Loop
  update(0);
}

// ================= CREATION FUNCTIONS =================
function createPlayer() {
  // Visuals
  const geometry = new THREE.ConeGeometry(1, 4, 8);
  const material = new THREE.MeshStandardMaterial({ 
    color: CONFIG.colors.hero, 
    emissive: CONFIG.colors.hero,
    emissiveIntensity: 0.5,
    roughness: 0.4,
    metalness: 0.8
  });
  player.mesh = new THREE.Mesh(geometry, material);
  player.mesh.rotation.x = -Math.PI / 2; // Point forward
  
  // Engine glow
  const engineGeom = new THREE.ConeGeometry(0.5, 2, 8);
  const engineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
  const engineMesh = new THREE.Mesh(engineGeom, engineMat);
  engineMesh.position.y = -2;
  engineMesh.rotation.x = Math.PI;
  player.mesh.add(engineMesh);
  
  engine.scene.add(player.mesh);

  // Physics
  const shape = new CANNON.Box(new CANNON.Vec3(1, 1, 2));
  player.body = new CANNON.Body({
    mass: 5, // Heavy ship
    position: new CANNON.Vec3(0, 0, 0),
    shape: shape,
    linearDamping: 0.5,
    angularDamping: 0.5
  });
  engine.world.addBody(player.body);
}

function createAsteroidField() {
  const asteroidGeom = new THREE.IcosahedronGeometry(1, 0);
  const asteroidMat = new THREE.MeshStandardMaterial({ 
    color: 0x555555, 
    roughness: 0.8,
    metalness: 0.2,
    flatShading: true
  });

  for (let i = 0; i < CONFIG.asteroidCount; i++) {
    const size = 2 + Math.random() * 8; // HUGE asteroids
    const mesh = new THREE.Mesh(asteroidGeom, asteroidMat);
    mesh.scale.set(size, size, size);
    
    // Random position
    const x = (Math.random() - 0.5) * CONFIG.worldSize;
    const z = (Math.random() - 0.5) * CONFIG.worldSize;
    const y = (Math.random() - 0.5) * 50; // Some verticality
    
    mesh.position.set(x, y, z);
    mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
    
    engine.scene.add(mesh);
    
    // Physics body
    const shape = new CANNON.Sphere(size); // Approx collider
    const body = new CANNON.Body({
      mass: size * 10,
      position: new CANNON.Vec3(x, y, z),
      shape: shape
    });
    
    // Random drift
    body.velocity.set(
      (Math.random()-0.5) * 5,
      (Math.random()-0.5) * 1,
      (Math.random()-0.5) * 5
    );
    
    body.angularVelocity.set(
      Math.random() * 0.5,
      Math.random() * 0.5,
      Math.random() * 0.5
    );

    engine.world.addBody(body);
    engine.meshes.push(mesh);
    engine.bodies.push(body);
    
    // Add User Data for collision logic
    body.userData = { type: 'asteroid', meshIndex: engine.meshes.length - 1, size: size };
  }
}

function createStarfield() {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  
  for (let i = 0; i < 5000; i++) {
    vertices.push(
      (Math.random() - 0.5) * 2000,
      (Math.random() - 0.5) * 2000,
      (Math.random() - 0.5) * 2000
    );
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.PointsMaterial({ color: 0x888888, size: 2, sizeAttenuation: false });
  const stars = new THREE.Points(geometry, material);
  engine.scene.add(stars);
}

function fireWeapon() {
  if (state.energy < 10) return; // Need energy
  
  state.energy -= 10;
  updateHUD();

  // Create projectile
  const geometry = new THREE.BoxGeometry(0.5, 0.5, 4);
  const material = new THREE.MeshBasicMaterial({ color: CONFIG.colors.hero });
  const mesh = new THREE.Mesh(geometry, material);
  
  // Start at player position
  mesh.position.copy(player.mesh.position);
  mesh.quaternion.copy(player.mesh.quaternion);
  engine.scene.add(mesh);

  // Physics
  const shape = new CANNON.Box(new CANNON.Vec3(0.25, 0.25, 2));
  const body = new CANNON.Body({
    mass: 1, // Light projectile
    position: new CANNON.Vec3(player.body.position.x, player.body.position.y, player.body.position.z),
    shape: shape
  });
  
  // Set quaternion
  body.quaternion.copy(player.body.quaternion);

  // Calculate forward velocity
  const forward = new CANNON.Vec3(0, 0, -1);
  const velocity = new CANNON.Vec3();
  body.quaternion.vmult(forward, velocity);
  velocity.scale(150, velocity); // High speed
  body.velocity.copy(velocity);

  engine.world.addBody(body);
  
  // Add to management system
  const bulletObj = { mesh, body, life: 2.0 }; // 2 seconds life
  engine.removables.push(bulletObj);
  
  // Attach collision listener
  body.addEventListener("collide", (e) => {
    // If we hit an asteroid
    if (e.body.userData && e.body.userData.type === 'asteroid') {
      explodeAsteroid(e.body);
      // Remove bullet
      bulletObj.life = 0; 
    }
  });
  
  // Recoil
  const recoilForce = velocity.clone();
  recoilForce.scale(-0.5, recoilForce);
  player.body.applyLocalImpulse(recoilForce, new CANNON.Vec3(0,0,0));
}

function explodeAsteroid(asteroidBody) {
  // Visual explosion
  createParticles(asteroidBody.position, 20, 0xffaa00);
  
  // Update Score
  state.score += Math.floor(asteroidBody.userData.size * 100);
  document.getElementById('score-display').innerText = state.score;

  // Remove asteroid (physical simulation of destruction would be to split it, 
  // but for now we just destroy it to save frames)
  
  // We need to match body to mesh
  const index = asteroidBody.userData.meshIndex;
  // This is a weak reference system, but good enough for simple game
  // In robust engine we'd use UUID mapping
  
  // Instead of removing from array (which breaks indices), we just move it far away
  // effectively "pooling" it or marking inactive.
  asteroidBody.position.set(10000, 10000, 10000);
  engine.meshes[index].position.set(10000, 10000, 10000);
}

function createParticles(pos, count, color) {
  for (let i = 0; i < count; i++) {
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshBasicMaterial({ color: color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos);
    engine.scene.add(mesh);
    
    // Simple physics for particles without Cannon (too expensive for 1000s)
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20
    );
    
    engine.particles.push({ mesh, velocity, life: 1.0 });
  }
}

// ================= INPUT HANDLERS =================
function onKeyDown(e) {
  const k = e.key.toLowerCase();
  if (state.keys.hasOwnProperty(k)) state.keys[k] = true;
  if(k === ' ') state.keys.space = true;
}

function onKeyUp(e) {
  const k = e.key.toLowerCase();
  if (state.keys.hasOwnProperty(k)) state.keys[k] = false;
  if(k === ' ') state.keys.space = false;
}

function onMouseMove(e) {
  // Normalize mouse position -1 to 1
  state.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  state.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

function onMouseDown(e) {
  if (state.isPlaying) fireWeapon();
}

function onResize() {
  engine.camera.aspect = window.innerWidth / window.innerHeight;
  engine.camera.updateProjectionMatrix();
  engine.renderer.setSize(window.innerWidth, window.innerHeight);
  engine.composer.setSize(window.innerWidth, window.innerHeight);
}

// ================= GAME LOGIC =================
function updatePlayerMovement(dt) {
  if (!player.body) return;

  // Rotation (Turning) based on WASD
  // If W key down, pitch down not move forward (space style)
  // Actually, standard arcade control:
  // W = Thrust Forward
  // S = Reverse
  // A = Turn Left
  // D = Turn Right
  
  // Torque for turning
  const turn = CONFIG.playerTurnSpeed * player.body.mass;
  if (state.keys.a) player.body.angularVelocity.y += turn * dt;
  if (state.keys.d) player.body.angularVelocity.y -= turn * dt;
  
  // Thrust
  const thrust = CONFIG.playerSpeed * player.body.mass;
  const forward = new CANNON.Vec3(0, 0, -1);
  const force = new CANNON.Vec3();
  
  // Calculate forward direction in world space
  player.body.quaternion.vmult(forward, force);
  
  if (state.keys.w) {
    force.scale(thrust, force);
    player.body.applyForce(force, player.body.position);
    
    // Regenerate energy
    if (state.energy < 100) state.energy += 0.1;
  } else if (state.keys.s) {
    force.scale(-thrust * 0.5, force); // Weak reverse
    player.body.applyForce(force, player.body.position);
  } else if (state.keys.space) {
    // Brake / Airbrake
    player.body.velocity.scale(0.9, player.body.velocity);
    player.body.angularVelocity.scale(0.9, player.body.angularVelocity);
  }

  // Camera Follow
  // Smoothly interpolate camera behind player
  const relOffset = new THREE.Vector3(0, 20, 30); // Offset relative to player
  const cameraOffset = relOffset.applyMatrix4(player.mesh.matrixWorld);
  engine.camera.position.lerp(cameraOffset, 0.1);
  engine.camera.lookAt(player.mesh.position);
}

function update(time) {
  requestAnimationFrame(update);
  const dt = engine.clock.getDelta();

  if (state.isPlaying) {
    // 1. Physics Step
    engine.world.step(1/60, dt, 3);
    
    // 2. Game Logic
    updatePlayerMovement(dt);
    
    // 3. Sync Visuals to Physics
    player.mesh.position.copy(player.body.position);
    player.mesh.quaternion.copy(player.body.quaternion);
    
    // Sync objects
    for (let i = 0; i < engine.bodies.length; i++) {
        engine.meshes[i].position.copy(engine.bodies[i].position);
        engine.meshes[i].quaternion.copy(engine.bodies[i].quaternion);
    }
    
    // 4. Update Projectiles & Particles
    for (let i = engine.removables.length - 1; i >= 0; i--) {
      const obj = engine.removables[i];
      obj.life -= dt;
      if (obj.life <= 0) {
        // Remove from physics and scene
        engine.world.removeBody(obj.body);
        engine.scene.remove(obj.mesh);
        engine.removables.splice(i, 1);
      } else {
        // Sync bullet visual
        obj.mesh.position.copy(obj.body.position);
        obj.mesh.quaternion.copy(obj.body.quaternion);
      }
    }
    
    // Particles
    for (let i = engine.particles.length - 1; i >= 0; i--) {
      const p = engine.particles[i];
      p.life -= dt;
      p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
      p.mesh.material.opacity = p.life;
      p.mesh.scale.setScalar(p.life);
      
      if (p.life <= 0) {
        engine.scene.remove(p.mesh);
        engine.particles.splice(i, 1);
      }
    }
    
    // Update Score / Energy UI
    document.getElementById('energy-display').innerText = `REACTOR: ${Math.floor(state.energy)}%`;
  } else {
    // Menu Mode: Rotate camera around scene
    const t = Date.now() * 0.0002;
    engine.camera.position.x = Math.sin(t) * 100;
    engine.camera.position.z = Math.cos(t) * 100;
    engine.camera.lookAt(0,0,0);
  }

  // Render Composer (Bloom etc)
  engine.composer.render();
}

// ================= UI FUNCTIONS =================
function startGame() {
  document.getElementById('main-menu').classList.add('hidden');
  document.querySelector('.header').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  state.isPlaying = true;
  state.score = 0;
  state.energy = 100;
  
  // Reset player
  player.body.position.set(0,0,0);
  player.body.velocity.set(0,0,0);
  player.body.angularVelocity.set(0,0,0);
}

function restartGame() {
  document.getElementById('game-over').classList.add('hidden');
  startGame();
}

function updateHUD() {
  document.getElementById('health-bar').style.width = `${state.health}%`;
}

// ================= BOOTSTRAP =================
init();
