// ─────────────────────────────────────────────────────────────────
//  CROSSY ROAD  –  game.js
// ─────────────────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────────────────
const TILE        = 2;
const GRID_W      = 40;           // very wide — terrain always bleeds past screen edges
const HALF_W      = 8;            // playable column bound (±8), independent of visual width
const JUMP_DUR    = 185;          // ms
const JUMP_H      = 1.7;
const LOOK_AHEAD  = 22;
const LOOK_BEHIND = 8;

// Camera angle: ~30° from the Z-axis horizontally (shallower than 45°).
// atan(X/Z) = 30°  →  X = Z * tan(30°) ≈ Z * 0.577
// Keep Y high enough for a clear top-down view.
const CAM_OFFSET = new THREE.Vector3(8, 22, 20);

// Orthographic half-height — controls zoom level.
// Larger = zoomed out, smaller = zoomed in.
const CAM_SIZE = 12;

// ── Renderer ─────────────────────────────────────────────────────
const canvas   = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x5a8fa8);

// ── Camera ───────────────────────────────────────────────────────
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
camera.position.copy(CAM_OFFSET);
camera.lookAt(0, 0, 0);

function updateCameraFrustum() {
  const a = window.innerWidth / window.innerHeight;
  camera.left   = -CAM_SIZE * a;
  camera.right  =  CAM_SIZE * a;
  camera.top    =  CAM_SIZE;
  camera.bottom = -CAM_SIZE;
  camera.updateProjectionMatrix();
}
updateCameraFrustum();

// ── Scene ────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog   = new THREE.Fog(0x5a8fa8, 30, 90);

// ── Lighting ─────────────────────────────────────────────────────
// Muted ambient — keeps shadows visible and stops everything looking washed out
scene.add(new THREE.AmbientLight(0x8899aa, 0.5));

// Main sun — warm afternoon angle, moderate intensity
const sun = new THREE.DirectionalLight(0xffe8b0, 0.85);
sun.position.set(15, 28, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
const sc = sun.shadow.camera;
sc.near = 1; sc.far = 120;
sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
scene.add(sun);

// Cool blue fill from opposite side
const fill = new THREE.DirectionalLight(0x6688bb, 0.3);
fill.position.set(-10, 12, -8);
scene.add(fill);

// ── Helper: material factory ──────────────────────────────────────
function mat(hex, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ color: hex, ...opts });
  return m;
}

// ── Materials ────────────────────────────────────────────────────
const M = {
  // Terrain — muted, earthy tones
  grass:      mat(0x4a8f32),
  grassDark:  mat(0x3a7226),
  grassEdge:  mat(0x2d5c1e),
  dirt:       mat(0x8a6840),
  water:      mat(0x1a6090),
  waterDark:  mat(0x145278),
  waterFoam:  mat(0x5a9ec0),
  road:       mat(0x444444),
  roadDark:   mat(0x363636),
  kerb:       mat(0x999999),
  // Markings
  white:      mat(0xdddddd),
  yellow:     mat(0xd4a800),
  // Log — darker wood
  log:        mat(0x7a4e22),
  logEnd:     mat(0x5c3a18),
  logBark:    mat(0x9a6030),
  // Chicken
  chickenWht: mat(0xeeeeee),
  cream:      mat(0xd8c090),
  orange:     mat(0xcc6600),
  beak:       mat(0xe08800),
  red:        mat(0xaa0e0e),
  black:      mat(0x0d0d0d),
  // Cars — slightly desaturated
  carRed:     mat(0xb81818),
  carBlue:    mat(0x163ea8),
  carYellow:  mat(0xc8a200),
  carGreen:   mat(0x1a8835),
  carWhite:   mat(0xcccccc),
  carOrange:  mat(0xcc5500),
  carPurple:  mat(0x5c1aaa),
  glass:      mat(0x6aaabb, { transparent: true, opacity: 0.5 }),
  tyre:       mat(0x141414),
  rim:        mat(0x888888),
  // FX
  shadowMat:  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  roadLine:   mat(0xdddddd),
};
const CAR_COLORS = [M.carRed, M.carBlue, M.carYellow, M.carGreen, M.carWhite, M.carOrange, M.carPurple];

// ── Geometry helpers ─────────────────────────────────────────────
function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function addAt(parent, child, x, y, z) {
  child.position.set(x, y, z);
  parent.add(child);
  return child;
}

// ─────────────────────────────────────────────────────────────────
//  SEEDED RNG
// ─────────────────────────────────────────────────────────────────
function seededRand(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = (s ^ (s >>> 16)) >>> 0;
    return s / 0x100000000;
  };
}

// ─────────────────────────────────────────────────────────────────
//  TERRAIN
// ─────────────────────────────────────────────────────────────────
const rowData = {};
let maxBuiltRow = 0;

function rowType(r) {
  if (r <= 2) return 'grass';
  const rng  = seededRand(r * 997 + 17);
  const roll = rng();
  if (roll < 0.35) return 'grass';
  if (roll < 0.68) return 'road';
  return 'water';
}

// ── Bush ──────────────────────────────────────────────────────────
function makeBush(rng) {
  const g = new THREE.Group();
  const h = 0.3 + rng() * 0.5;
  // Trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.09, h * 0.55, 6),
    M.dirt
  );
  trunk.castShadow = true;
  addAt(g, trunk, 0, h * 0.28, 0);
  // Foliage sphere (slightly flat)
  const fCol = rng() < 0.5 ? M.grassDark : M.grassEdge;
  const fol  = new THREE.Mesh(new THREE.SphereGeometry(0.2 + rng() * 0.22, 7, 6), fCol);
  fol.scale.set(1 + rng() * 0.3, 0.85 + rng() * 0.15, 1 + rng() * 0.3);
  fol.castShadow = true;
  addAt(g, fol, (rng() - 0.5) * 0.06, h * 0.72, (rng() - 0.5) * 0.06);
  // Tiny shadow disc under bush
  const sd = new THREE.Mesh(new THREE.CircleGeometry(0.28, 8), M.shadowMat);
  sd.rotation.x = -Math.PI / 2;
  addAt(g, sd, 0, 0.02, 0);
  return g;
}

// ── Car ───────────────────────────────────────────────────────────
function makeCar(colorMat, rng) {
  const g = new THREE.Group();
  // Style: 0=sedan, 1=truck, 2=van
  const style = Math.floor(rng() * 3);

  if (style === 1) {
    // Truck
    const cab  = box(0.9, 0.58, 0.84, colorMat);
    addAt(g, cab, 0.28, 0.29, 0);
    const trailer = box(1.1, 0.48, 0.80, M.carWhite);
    addAt(g, trailer, -0.62, 0.24, 0);
    addAt(g, box(0.04, 0.44, 0.70, M.glass), 0.73, 0.46, 0);
    g.userData.halfLen = 1.05;
  } else if (style === 2) {
    // Van
    const bod = box(1.5, 0.62, 0.84, colorMat);
    addAt(g, bod, 0, 0.31, 0);
    const top = box(1.2, 0.38, 0.80, colorMat);
    addAt(g, top, -0.1, 0.74, 0);
    addAt(g, box(0.04, 0.34, 0.66, M.glass), 0.60, 0.70, 0);
    g.userData.halfLen = 0.85;
  } else {
    // Sedan
    const bod = box(1.4, 0.40, 0.82, colorMat);
    addAt(g, bod, 0, 0.20, 0);
    const roof = box(0.85, 0.33, 0.74, colorMat);
    addAt(g, roof, -0.08, 0.53, 0);
    addAt(g, box(0.04, 0.28, 0.62, M.glass), 0.33, 0.48, 0);  // windshield
    addAt(g, box(0.04, 0.26, 0.62, M.glass), -0.48, 0.48, 0); // rear
    g.userData.halfLen = 0.75;
  }

  // Wheels (shared across styles)
  for (const wx of [0.52, -0.52]) for (const wz of [0.36, -0.36]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.14, 9), M.tyre);
    rim.rotation.z = Math.PI / 2;
    addAt(g, rim, wx, 0.19, wz);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.15, 6), M.rim);
    hub.rotation.z = Math.PI / 2;
    addAt(g, hub, wx, 0.19, wz);
  }

  // Headlights
  addAt(g, box(0.06, 0.10, 0.18, M.yellow), 0.72, 0.22,  0.26);
  addAt(g, box(0.06, 0.10, 0.18, M.yellow), 0.72, 0.22, -0.26);
  // Tail lights
  addAt(g, box(0.06, 0.10, 0.18, M.red),   -0.72, 0.22,  0.26);
  addAt(g, box(0.06, 0.10, 0.18, M.red),   -0.72, 0.22, -0.26);

  // Shadow under car
  const sd = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), M.shadowMat);
  sd.rotation.x = -Math.PI / 2;
  addAt(g, sd, 0, 0.02, 0);

  g.userData.halfLen = g.userData.halfLen || 0.75;
  return g;
}

// ── Log ───────────────────────────────────────────────────────────
function makeLog(numTiles) {
  const g   = new THREE.Group();
  const len = numTiles * TILE - 0.15;
  // Main cylinder body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.38, len, 10, 1, false),
    M.log
  );
  body.rotation.z = Math.PI / 2;
  body.castShadow = body.receiveShadow = true;
  addAt(g, body, 0, 0.36, 0);
  // Bark stripe
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.385, 0.385, len * 0.3, 10),
    M.logBark
  );
  stripe.rotation.z = Math.PI / 2;
  addAt(g, stripe, len * 0.12, 0.36, 0);
  // End caps
  for (const sx of [len / 2, -len / 2]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.37, 10), M.logEnd);
    cap.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    addAt(g, cap, sx, 0.36, 0);
  }
  g.userData.length = len + 0.3;
  return g;
}

// ── Row builder ───────────────────────────────────────────────────
function buildRow(r) {
  if (rowData[r]) return;
  const type   = rowType(r);
  const rng    = seededRand(r * 2971 + 53);
  const worldZ = -r * TILE;
  const group  = new THREE.Group();
  group.position.set(0, 0, worldZ);
  scene.add(group);

  const cars = [], logs = [];
  let speed = 0, dir = 1;

  const stripW = TILE * GRID_W;

  // ── Grass ────────────────────────────────
  if (type === 'grass') {
    const tileMat = r % 2 === 0 ? M.grass : M.grassDark;
    const strip   = box(stripW, 0.3, TILE, tileMat);
    strip.receiveShadow = true;
    addAt(group, strip, 0, -0.15, 0);

    // Thin edge strips for depth feel
    const edgeF = box(stripW, 0.06, 0.12, M.grassEdge);
    addAt(group, edgeF, 0, 0.0, -TILE / 2 + 0.06);
    const edgeB = box(stripW, 0.06, 0.12, M.grassEdge);
    addAt(group, edgeB, 0, 0.0,  TILE / 2 - 0.06);

    // Bushes/trees — skip row 0 so start is clear
    if (r !== 0) {
      const count = Math.floor(rng() * 4) + 1;
      for (let i = 0; i < count; i++) {
        const bx = (rng() - 0.5) * stripW * 0.88;
        addAt(group, makeBush(rng), bx, 0, (rng() - 0.5) * 0.6);
      }
    }

  // ── Road ─────────────────────────────────
  } else if (type === 'road') {
    const tileMat = r % 2 === 0 ? M.road : M.roadDark;
    const strip   = box(stripW, 0.28, TILE, tileMat);
    strip.receiveShadow = true;
    addAt(group, strip, 0, -0.14, 0);

    // Kerb edges
    const kerbF = box(stripW, 0.18, 0.2, M.kerb);
    addAt(group, kerbF, 0, 0.04, -TILE / 2 + 0.1);
    const kerbB = box(stripW, 0.18, 0.2, M.kerb);
    addAt(group, kerbB, 0, 0.04,  TILE / 2 - 0.1);

    // Dashed centre line
    for (let x = -HALF_W + 1; x <= HALF_W - 1; x++) {
      const mark = box(0.72, 0.01, 0.18, M.white);
      addAt(group, mark, x * TILE - TILE / 2, 0.01, 0);
    }

    // ── Car pattern (varied) ─────────────
    dir   = rng() < 0.5 ? 1 : -1;
    // Base speed: slower than before, with random variation
    const baseSpeed = (rng() * 0.018 + 0.008) * TILE;  // ~0.016–0.052 world/frame at 60fps

    // Pattern types: 0=convoy, 1=spread, 2=two-groups, 3=single fast
    const pattern = Math.floor(rng() * 4);

    if (pattern === 0) {
      // Convoy: 2-4 cars close together
      const count = Math.floor(rng() * 3) + 2;
      const colorMat = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      let cx = (rng() - 0.5) * stripW * 0.5;
      for (let i = 0; i < count; i++) {
        const car = makeCar(colorMat, rng);
        car.position.set(cx, 0.15, 0);
        car.userData.speed = baseSpeed * (0.9 + rng() * 0.2);
        group.add(car);
        cars.push(car);
        cx -= (2.0 + rng() * 0.8) * dir; // pack tightly
      }
    } else if (pattern === 1) {
      // Spread: 3-5 cars evenly spaced
      const count   = Math.floor(rng() * 3) + 3;
      const spacing = stripW / count;
      for (let i = 0; i < count; i++) {
        const colorMat = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
        const car = makeCar(colorMat, rng);
        const cx  = -stripW / 2 + spacing * i + (rng() - 0.5) * spacing * 0.4;
        car.position.set(cx, 0.15, 0);
        car.userData.speed = baseSpeed * (0.85 + rng() * 0.3);
        group.add(car);
        cars.push(car);
      }
    } else if (pattern === 2) {
      // Two groups with a big gap
      for (let g = 0; g < 2; g++) {
        const colorMat = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
        const count    = Math.floor(rng() * 2) + 1;
        let cx = (g === 0 ? -1 : 1) * (stripW * 0.3 + rng() * stripW * 0.1);
        for (let i = 0; i < count; i++) {
          const car = makeCar(colorMat, rng);
          car.position.set(cx, 0.15, 0);
          car.userData.speed = baseSpeed * (0.9 + rng() * 0.2);
          group.add(car);
          cars.push(car);
          cx += 2.5 * dir;
        }
      }
    } else {
      // Single fast car
      const colorMat = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      const car = makeCar(colorMat, rng);
      car.position.set((rng() - 0.5) * stripW * 0.6, 0.15, 0);
      car.userData.speed = baseSpeed * 1.8;
      group.add(car);
      cars.push(car);
    }

    speed = baseSpeed; // stored for reference, per-car speed is in userData

  // ── Water ────────────────────────────────
  } else {
    const tileMat = r % 2 === 0 ? M.water : M.waterDark;
    const strip   = box(stripW, 0.22, TILE, tileMat);
    strip.receiveShadow = true;
    addAt(group, strip, 0, -0.11, 0);

    // Foam edges
    const foamF = box(stripW, 0.06, 0.18, M.waterFoam);
    addAt(group, foamF, 0, 0.05, -TILE / 2 + 0.09);
    const foamB = box(stripW, 0.06, 0.18, M.waterFoam);
    addAt(group, foamB, 0, 0.05,  TILE / 2 - 0.09);

    dir   = rng() < 0.5 ? 1 : -1;
    speed = (rng() * 0.016 + 0.008) * TILE;
    const numLogs = Math.floor(rng() * 2) + 2;
    const spacing = stripW / numLogs;
    for (let i = 0; i < numLogs; i++) {
      const logLen  = Math.floor(rng() * 2) + 2;
      const lx      = -stripW / 2 + spacing * i + (rng() - 0.5) * spacing * 0.35;
      const logMesh = makeLog(logLen);
      logMesh.position.set(lx, 0, 0);
      logMesh.userData.dir    = dir;
      logMesh.userData.speed  = speed;
      group.add(logMesh);
      logs.push(logMesh);
    }
  }

  rowData[r] = { type, group, cars, logs, speed, dir };
}

function ensureTerrain(pRow) {
  const needed = pRow + LOOK_AHEAD;
  for (let r = maxBuiltRow + 1; r <= needed; r++) {
    buildRow(r);
    maxBuiltRow = r;
  }
  const cutoff = pRow - LOOK_BEHIND - 2;
  for (const key of Object.keys(rowData)) {
    const ri = parseInt(key);
    if (ri < cutoff) {
      scene.remove(rowData[ri].group);
      delete rowData[ri];
    }
  }
}

// Build initial rows
for (let r = 0; r <= LOOK_AHEAD; r++) { buildRow(r); maxBuiltRow = r; }

// ─────────────────────────────────────────────────────────────────
//  CHICKEN
// ─────────────────────────────────────────────────────────────────
// The chicken model is built so that:
//   local +Z = the chicken's "chest" / face direction
//   local -Z = its back/tail
//
// The camera looks from (+X, +Y, +Z) toward origin, so
//   screen-UP  (forward in game) = world -Z  → chicken must face world -Z  → rotation.y = 0     (local +Z → world +Z … wrong)
//
// With camera at 45° (equal X & Z offset):
//   game-forward (world -Z) appears as screen-up-left
//   We want the chicken facing the camera when idle, i.e. facing world (-Z,-X) diagonal.
//   That's 225° = Math.PI * 1.25 in world space.
// The FACE table maps each move direction to the correct world-space Y rotation.

const FACE = {
  forward:  Math.PI,           // local +Z → world -Z  (screen top)
  backward: 0,                 // local +Z → world +Z  (screen bottom)
  left:     Math.PI / 2,       // local +Z → world -X  (screen left)
  right:    Math.PI * 1.5,     // local +Z → world +X  (screen right) — use 270° not -90° so lerp always takes short path from π
};
const IDLE_FACE = Math.PI;

const chicken = new THREE.Group();
scene.add(chicken);

// ── Body ──────────────────────────────────────
const body = box(0.72, 0.65, 0.60, M.chickenWht);
addAt(chicken, body, 0, 0.72, 0);

// Breast bump
const breast = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 7), M.chickenWht);
breast.scale.set(1, 0.9, 0.85);
breast.castShadow = true;
addAt(chicken, breast, 0, 0.70, 0.22);

// ── Head ──────────────────────────────────────
const head = box(0.52, 0.48, 0.50, M.chickenWht);
addAt(chicken, head, 0, 1.31, 0.10);

// Comb (3 bumps)
addAt(chicken, box(0.14, 0.22, 0.12, M.red),  0, 1.64, -0.02);
addAt(chicken, box(0.12, 0.28, 0.11, M.red),  0, 1.70,  0.06);
addAt(chicken, box(0.10, 0.20, 0.10, M.red),  0, 1.63,  0.15);

// Wattle
const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), M.red);
wattle.scale.y = 1.3;
addAt(chicken, wattle, 0, 1.10, 0.27);

// Beak
addAt(chicken, box(0.18, 0.10, 0.22, M.beak), 0, 1.26, 0.34);

// Eyes
for (const side of [-1, 1]) {
  addAt(chicken, new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 7), M.chickenWht),
        side * 0.21, 1.36, 0.27);
  addAt(chicken, new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), M.black),
        side * 0.235, 1.36, 0.31);
}

// Wings
for (const side of [-1, 1]) {
  const wing = box(0.12, 0.42, 0.50, M.cream);
  wing.rotation.z = side * 0.18;
  addAt(chicken, wing, side * 0.43, 0.75, 0.02);
}

// Tail feathers
const tailFeather = box(0.38, 0.32, 0.14, M.cream);
tailFeather.rotation.x = -0.5;
addAt(chicken, tailFeather, 0, 0.95, -0.36);

// Legs
for (const side of [-1, 1]) {
  addAt(chicken, box(0.10, 0.28, 0.10, M.orange), side * 0.18, 0.30, 0.00);
  addAt(chicken, box(0.08, 0.22, 0.08, M.beak),   side * 0.18, 0.10, 0.04);
  addAt(chicken, box(0.08, 0.05, 0.22, M.beak),   side * 0.18, 0.01, 0.08);
}

// ── Drop shadow (blob on ground) ─────────────
const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), M.shadowMat.clone());
shadowBlob.rotation.x = -Math.PI / 2;
shadowBlob.position.y = 0.015;
chicken.add(shadowBlob);

// ── Car shadow blob helper ────────────────────
// We add a persistent ground shadow under each car group at build time (already done in makeCar).

// Set initial facing
chicken.rotation.y = IDLE_FACE;

// ─────────────────────────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────────────────────────
let playerRow = 0;
let playerCol = 0;
let score     = 0;
let dead      = false;
let ridingLog = null;

function placeChickenAt(row, col) {
  playerRow = row;
  playerCol = col;
  chicken.position.set(col * TILE, 0, -row * TILE);
  chicken.rotation.y = IDLE_FACE;
}
placeChickenAt(0, 0);

// ── Jump state ────────────────────────────────
let jumping   = false;
let jumpStart = 0;
let jumpFrom  = new THREE.Vector3();
let jumpTo    = new THREE.Vector3();
let jumpFaceY = IDLE_FACE;
let inputQueue = [];

function enqueue(dir) {
  if (!dead && inputQueue.length < 2) inputQueue.push(dir);
}

function startJump(dir) {
  if (jumping || dead) return;
  let dRow = 0, dCol = 0;
  if (dir === 'forward')  dRow =  1;
  if (dir === 'backward') dRow = -1;
  if (dir === 'left')     dCol = -1;
  if (dir === 'right')    dCol =  1;

  const newRow = playerRow + dRow;
  const newCol = Math.max(-HALF_W, Math.min(HALF_W, playerCol + dCol));

  if (dir === 'left'  && newCol === playerCol) return;
  if (dir === 'right' && newCol === playerCol) return;
  if (newRow < 0) return;

  playerRow = newRow;
  playerCol = newCol;

  if (dRow > 0 && playerRow > score) {
    score = playerRow;
    document.getElementById('score').textContent = score;
  }

  ridingLog = null;
  jumpFrom.copy(chicken.position);
  jumpTo.set(newCol * TILE, 0, -newRow * TILE);
  jumpFaceY = FACE[dir];
  jumpStart = performance.now();
  jumping   = true;

  ensureTerrain(playerRow);
}

// ─────────────────────────────────────────────────────────────────
//  COLLISION
// ─────────────────────────────────────────────────────────────────
function checkCollisions() {
  if (dead || jumping) return;
  const rd = rowData[playerRow];
  if (!rd) return;
  const cx = chicken.position.x;

  if (rd.type === 'road') {
    for (const car of rd.cars) {
      const hl = (car.userData.halfLen || 0.75) + 0.15;
      if (Math.abs(car.position.x - cx) < hl) { triggerDeath(); return; }
    }
  }

  if (rd.type === 'water') {
    let onLog = false;
    for (const log of rd.logs) {
      if (Math.abs(log.position.x - cx) < log.userData.length / 2 + 0.2) {
        onLog = true;
        ridingLog = log;
        break;
      }
    }
    if (!onLog) triggerDeath();
  }
}

// ─────────────────────────────────────────────────────────────────
//  DEATH
// ─────────────────────────────────────────────────────────────────
function triggerDeath() {
  if (dead) return;
  dead    = true;
  jumping = false;
  inputQueue = [];

  let t = 0;
  const startY = chicken.position.y;
  const iv = setInterval(() => {
    t += 0.055;
    chicken.rotation.y += 0.22;
    chicken.position.y  = Math.max(startY - t * 0.5, startY - 1.5);
    chicken.scale.setScalar(Math.max(0.01, 1 - t * 0.55));
    if (t >= 1.9) { clearInterval(iv); showDeathScreen(); }
  }, 16);
}

function showDeathScreen() {
  document.getElementById('death-score').textContent = score;
  document.getElementById('death-screen').classList.add('visible');
}

function restartGame() {
  for (const key of Object.keys(rowData)) {
    scene.remove(rowData[key].group);
    delete rowData[key];
  }
  maxBuiltRow = 0;
  score = 0;
  document.getElementById('score').textContent = '0';
  document.getElementById('death-screen').classList.remove('visible');

  chicken.scale.setScalar(1);
  body.rotation.x = head.rotation.x = 0;
  jumping = false;
  inputQueue = [];
  ridingLog  = null;
  dead       = false;

  for (let r = 0; r <= LOOK_AHEAD; r++) { buildRow(r); maxBuiltRow = r; }
  placeChickenAt(0, 0);

  camera.position.copy(CAM_OFFSET);
  camLookAt.set(0, 0, 0);
  camera.lookAt(camLookAt);
}

document.getElementById('restart-btn').addEventListener('click', restartGame);

// ─────────────────────────────────────────────────────────────────
//  CAMERA
// ─────────────────────────────────────────────────────────────────
const camLookAt = new THREE.Vector3();
const _camTarget = new THREE.Vector3();

function updateCamera() {
  _camTarget.set(
    chicken.position.x + CAM_OFFSET.x,
    CAM_OFFSET.y,
    chicken.position.z + CAM_OFFSET.z
  );
  camera.position.lerp(_camTarget, 0.09);
  camLookAt.lerp(chicken.position, 0.09);
  camera.lookAt(camLookAt);
}

// ─────────────────────────────────────────────────────────────────
//  INPUT
// ─────────────────────────────────────────────────────────────────
const held = {};
window.addEventListener('keydown', (e) => {
  if (held[e.code]) return;
  held[e.code] = true;
  switch (e.code) {
    case 'ArrowUp':    case 'KeyW': enqueue('forward');  break;
    case 'ArrowDown':  case 'KeyS': enqueue('backward'); break;
    case 'ArrowLeft':  case 'KeyA': enqueue('left');     break;
    case 'ArrowRight': case 'KeyD': enqueue('right');    break;
  }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => { held[e.code] = false; });

// ─────────────────────────────────────────────────────────────────
//  LAND BUMP
// ─────────────────────────────────────────────────────────────────
let bumpIv = null;
function landBump() {
  if (bumpIv) clearInterval(bumpIv);
  let t = 0;
  bumpIv = setInterval(() => {
    t += 0.14;
    if (t >= 1) { chicken.scale.setScalar(1); clearInterval(bumpIv); bumpIv = null; return; }
    const b = Math.sin(t * Math.PI);
    chicken.scale.set(1 + b * 0.12, 1 - b * 0.15, 1 + b * 0.12);
  }, 16);
}

// ─────────────────────────────────────────────────────────────────
//  WATER SHIMMER (simple UV scroll via time-based opacity pulse)
// ─────────────────────────────────────────────────────────────────
// We pulse the water foam opacity to simulate light ripples
let shimmerT = 0;

// ─────────────────────────────────────────────────────────────────
//  MAIN LOOP
// ─────────────────────────────────────────────────────────────────
let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = now - lastTime;
  lastTime  = now;

  shimmerT += dt * 0.001;

  if (!dead) {
    // ── Move cars & logs ─────────────────────
    const bound = TILE * GRID_W / 2 + 3.5;
    for (const key of Object.keys(rowData)) {
      const rd = rowData[key];
      if (rd.type === 'road') {
        for (const car of rd.cars) {
          const spd = car.userData.speed || rd.speed;
          car.position.x += spd * rd.dir;
          if (car.position.x >  bound) car.position.x = -bound;
          if (car.position.x < -bound) car.position.x =  bound;
          car.rotation.y = rd.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      }
      if (rd.type === 'water') {
        for (const log of rd.logs) {
          const spd = log.userData.speed || rd.speed;
          const hl  = (log.userData.length || TILE * 2) / 2 + 0.5;
          log.position.x += spd * rd.dir;
          if (log.position.x >  bound + hl) log.position.x = -bound - hl;
          if (log.position.x < -bound - hl) log.position.x =  bound + hl;
        }
      }
    }

    // ── Ride log ─────────────────────────────
    if (!jumping && ridingLog) {
      const rd = rowData[playerRow];
      if (rd && rd.type === 'water') {
        const spd = ridingLog.userData.speed || rd.speed;
        chicken.position.x += spd * rd.dir;
        playerCol = Math.round(chicken.position.x / TILE);
        if (chicken.position.x > HALF_W * TILE + 0.6) triggerDeath();
        if (chicken.position.x < -HALF_W * TILE - 0.6) triggerDeath();
      }
    }

    // ── Process queued input ──────────────────
    if (!jumping && inputQueue.length > 0) startJump(inputQueue.shift());

    // ── Jump arc ──────────────────────────────
    if (jumping) {
      const t    = Math.min((now - jumpStart) / JUMP_DUR, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      chicken.position.x = jumpFrom.x + (jumpTo.x - jumpFrom.x) * ease;
      chicken.position.z = jumpFrom.z + (jumpTo.z - jumpFrom.z) * ease;
      chicken.position.y = Math.sin(t * Math.PI) * JUMP_H;

      // Tilt during flight
      const tilt = Math.sin(t * Math.PI) * 0.24;
      body.rotation.x  = -tilt * 0.55;
      head.rotation.x  = -tilt;

      // Stretch / squash
      if (t < 0.15) {
        const s = 1 + (t / 0.15) * 0.22;
        chicken.scale.set(1 / s, s, 1 / s);
      } else if (t > 0.82) {
        const s = 1 - ((t - 0.82) / 0.18) * 0.28;
        chicken.scale.set(1 / s, s, 1 / s);
      } else {
        chicken.scale.set(1, 1, 1);
      }

      // Rotate to face jump direction immediately
      let delta = jumpFaceY - chicken.rotation.y;
      while (delta >  Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      chicken.rotation.y += delta * Math.min(t * 5, 1);

      if (t >= 1) {
        jumping = false;
        chicken.position.set(jumpTo.x, 0, jumpTo.z);
        chicken.scale.setScalar(1);
        body.rotation.x = head.rotation.x = 0;
        chicken.rotation.y = jumpFaceY;
        landBump();
        checkCollisions();
      }
    } else {
      checkCollisions();
    }

    // ── Shadow blob ───────────────────────────
    const h = chicken.position.y;
    const s = Math.max(0.3, 1 - h * 0.28);
    shadowBlob.scale.set(s, s, s);
    shadowBlob.material.opacity = 0.22 * s;
  }

  updateCamera();
  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────────────────────────
//  RESIZE
// ─────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCameraFrustum();
});

renderer.setSize(window.innerWidth, window.innerHeight);
animate(performance.now());
