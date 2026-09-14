// ─────────────────────────────────────────────────────────────────
//  CROSSY ROAD  –  game.js
// ─────────────────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────────────────
const TILE        = 2;
const GRID_W      = 40;           // very wide — terrain always bleeds past screen edges
const HALF_W      = 8;            // playable column bound (±8), independent of visual width
const JUMP_DUR    = 185;          // ms
const JUMP_H      = 1.7;
const LOOK_AHEAD  = 20;
const LOOK_BEHIND = 12;           // build rows behind player too
const FENCE_X     = HALF_W * TILE + 0.5;   // world X of each fence line

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
renderer.setClearColor(0x120a24); // deep space purple-black

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
scene.fog   = new THREE.Fog(0x160c2a, 34, 95); // deep space haze

// ── Lighting ─────────────────────────────────────────────────────
// Cool purple ambient for a nighttime-planet feel
scene.add(new THREE.AmbientLight(0x6a5a90, 0.55));

// Main "star" light — a cold white-blue sun
const sun = new THREE.DirectionalLight(0xcfd8ff, 0.9);
sun.position.set(15, 28, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
const sc = sun.shadow.camera;
sc.near = 1; sc.far = 120;
sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
scene.add(sun);

// Green rim glow from below — bounce off the alien liquid/planet
const fill = new THREE.DirectionalLight(0x4faf6a, 0.35);
fill.position.set(-10, 8, -8);
scene.add(fill);

// ── Starfield ─────────────────────────────────────────────────────
// A large sphere of points surrounding the scene for a space backdrop.
(function addStarfield() {
  const starCount = 900;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // Distribute on a large sphere shell
    const r = 120 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 10; // keep mostly above
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: true });
  const stars = new THREE.Points(geo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);
  // Keep stars centred on the camera so they feel infinitely far
  window.__stars = stars;
})();

// ── Helper: material factory ──────────────────────────────────────
function mat(hex, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ color: hex, ...opts });
  return m;
}

// ── Materials ─────────────────────────────────────────────────────
// SPACE THEME — an alien planet: purple-red regolith ground, a green
// alien, UFO "cars", laser-beam "trains", glowing green liquid rivers
// with floating asteroid rocks, and rock-cluster boundaries.
const M = {
  // Planet ground ("grass") — dusty purple-red regolith
  grass:      mat(0x8a4a6a),
  grassDark:  mat(0x743a58),
  grassEdge:  mat(0x5c2d46),
  dirt:       mat(0x6a3a2a),
  // Green alien liquid ("water")
  water:      mat(0x1f8a3a),
  waterDark:  mat(0x156b2c),
  waterFoam:  mat(0x6ff08a),
  // Alien road — dark metallic path / crater rock
  road:       mat(0x3a3450),
  roadDark:   mat(0x2c283e),
  kerb:       mat(0x6a6280),
  // Markings — glowing energy strip
  white:      mat(0x66e0ff),
  yellow:     mat(0xffdd55),
  // Floating rock (was log) — grey asteroid
  log:        mat(0x6a6660),
  logEnd:     mat(0x4e4a44),
  logBark:    mat(0x82807a),
  // Alien body (was chicken) — green
  chickenWht: mat(0x4fd06a),   // main green skin
  cream:      mat(0x3aa050),   // darker green (limbs/accents)
  orange:     mat(0x2a8a3f),   // deep green
  beak:       mat(0x9cf0b0),   // pale green (mouth/feet)
  red:        mat(0x1a5c2a),   // very dark green (antenna base)
  black:      mat(0x0a0a12),
  eyeGlow:    new THREE.MeshBasicMaterial({ color: 0x000000 }),  // big black alien eyes
  antennaTip: new THREE.MeshBasicMaterial({ color: 0xaaffcc }),  // glowing antenna orb
  // UFO (was cars) — metallic saucers with glowing domes
  carRed:     mat(0x9aa0b0),
  carBlue:    mat(0x8890a8),
  carYellow:  mat(0xb0b4c0),
  carGreen:   mat(0x9098a8),
  carWhite:   mat(0xc0c4d0),
  carOrange:  mat(0xa8aec0),
  carPurple:  mat(0x888ea4),
  ufoDome:    mat(0x66ffcc, { transparent: true, opacity: 0.7 }),
  ufoGlow:    new THREE.MeshBasicMaterial({ color: 0x00ffaa }),
  ufoBeam:    new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.28, depthWrite: false }),
  glass:      mat(0x66ffcc, { transparent: true, opacity: 0.55 }),
  tyre:       mat(0x2a2e3a),
  rim:        mat(0xaab0c0),
  // FX
  shadowMat:  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  roadLine:   mat(0x66e0ff),
  // Rock boundary (was fence) — grey/purple boulders
  fencePost:  mat(0x6a6270),
  fenceRail:  mat(0x565060),
  fenceCap:   mat(0x7c7488),
  // Rail bed — cratered planet surface
  railBed:    mat(0x342f42),
  railTie:    mat(0x4a4458),   // energy conduit strip
  railMetal:  mat(0x8890a8),   // emitter rail
  // Laser beam "train"
  trainBody:  new THREE.MeshBasicMaterial({ color: 0xff2266 }),
  trainDark:  new THREE.MeshBasicMaterial({ color: 0xff66aa }),
  trainWin:   new THREE.MeshBasicMaterial({ color: 0xffffff }),
  trainGlow:  new THREE.MeshBasicMaterial({ color: 0xff88bb, transparent: true, opacity: 0.35, depthWrite: false }),
  // Rail warning emitter lights
  signalOff:  mat(0x333044),
  signalOn:   new THREE.MeshBasicMaterial({ color: 0xff2266 }),
  signalPost: mat(0x2a2836),
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
  if (roll < 0.42) return 'grass';
  if (roll < 0.68) return 'road';
  if (roll < 0.85) return 'rail';   // railroad
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

// ── UFO (was Car) ───────────────────────────────────────────────
// A hovering flying saucer. Radially symmetric so it reads the same
// travelling either direction. Three size classes fill the roles the
// sedan/truck/van used to. Keeps userData.halfLen for collision.
function makeCar(colorMat, rng) {
  const g = new THREE.Group();
  const size = Math.floor(rng() * 3); // 0 small, 1 medium, 2 large
  const scale = size === 0 ? 0.8 : size === 1 ? 1.0 : 1.25;
  const hoverY = 0.55;

  // Saucer disc — two cones base-to-base (classic UFO)
  const discR = 0.85 * scale;
  const topCone = new THREE.Mesh(new THREE.ConeGeometry(discR, 0.28 * scale, 20), colorMat);
  topCone.castShadow = true;
  addAt(g, topCone, 0, hoverY + 0.05, 0);
  const botCone = new THREE.Mesh(new THREE.ConeGeometry(discR, 0.34 * scale, 20), colorMat);
  botCone.rotation.x = Math.PI;
  botCone.castShadow = true;
  addAt(g, botCone, 0, hoverY - 0.10, 0);

  // Rim band
  const rim = new THREE.Mesh(new THREE.TorusGeometry(discR * 0.92, 0.06 * scale, 8, 22), M.rim);
  rim.rotation.x = Math.PI / 2;
  addAt(g, rim, 0, hoverY, 0);

  // Glowing dome cockpit
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34 * scale, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.ufoDome);
  addAt(g, dome, 0, hoverY + 0.14, 0);

  // Ring of glowing lights around the rim underside
  const lightCount = 8;
  for (let i = 0; i < lightCount; i++) {
    const a = (i / lightCount) * Math.PI * 2;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.055 * scale, 6, 6), M.ufoGlow);
    addAt(g, orb, Math.cos(a) * discR * 0.7, hoverY - 0.16, Math.sin(a) * discR * 0.7);
  }

  // Faint tractor beam glow underneath
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(discR * 0.55, hoverY, 14, 1, true),
    M.ufoBeam
  );
  beam.rotation.x = Math.PI;
  addAt(g, beam, 0, hoverY / 2 - 0.05, 0);

  // Ground shadow
  const sd = new THREE.Mesh(new THREE.CircleGeometry(discR * 0.9, 16), M.shadowMat);
  sd.rotation.x = -Math.PI / 2;
  addAt(g, sd, 0, 0.02, 0);

  g.userData.halfLen = discR;   // collision half-width
  g.userData.spin = 0;          // for idle rotation
  return g;
}

// ── Floating rock platform (was Log) ───────────────────────────────
// A chunky asteroid the alien hops onto to cross the green liquid.
// Built from several overlapping low-poly boulders along local X so it
// still reads as a jump platform. Keeps userData.length for riding logic.
function makeLog(numTiles) {
  const g   = new THREE.Group();
  const len = numTiles * TILE - 0.15;

  // A base slab so the top is walkable and flat-ish
  const slab = new THREE.Mesh(new THREE.BoxGeometry(len, 0.34, 0.9, 1, 1, 1), M.log);
  slab.castShadow = slab.receiveShadow = true;
  addAt(g, slab, 0, 0.30, 0);

  // Rocky boulders clustered along the slab (deterministic-ish by index)
  const chunks = Math.max(2, Math.round(numTiles * 1.8));
  for (let i = 0; i < chunks; i++) {
    const t   = chunks === 1 ? 0.5 : i / (chunks - 1);
    const bx  = -len / 2 + t * len;
    const rsz = 0.28 + ((i * 7) % 5) * 0.05;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rsz, 0), (i % 2 ? M.logBark : M.logEnd));
    rock.rotation.set(i * 0.7, i * 1.3, i * 0.5);
    rock.castShadow = true;
    addAt(g, rock, bx, 0.34, ((i % 3) - 1) * 0.12);
  }

  // A couple of tiny top pebbles for texture
  for (let i = 0; i < 2; i++) {
    const peb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), M.log);
    addAt(g, peb, (i - 0.5) * len * 0.4, 0.5, (i % 2 ? 0.2 : -0.2));
  }

  // Ground shadow
  const sd = new THREE.Mesh(new THREE.PlaneGeometry(len + 0.2, 1.0), M.shadowMat);
  sd.rotation.x = -Math.PI / 2;
  addAt(g, sd, 0, 0.03, 0);

  g.userData.length = len + 0.3;
  return g;
}

// ── Laser beam (was Train) ─────────────────────────────────────────
// A long glowing energy bolt that streaks across the track. Built along
// local +X, origin at one end (matches how the train was positioned).
// Keeps userData.length so the rail collision logic is unchanged.
function makeTrain() {
  const g = new THREE.Group();
  const totalLen = 14;            // long beam
  const beamY    = 0.7;

  // Bright inner core
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, totalLen, 12),
    M.trainWin  // white-hot centre
  );
  core.rotation.z = Math.PI / 2;
  addAt(g, core, totalLen / 2, beamY, 0);

  // Mid energy layer
  const mid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, totalLen, 14),
    M.trainBody
  );
  mid.rotation.z = Math.PI / 2;
  addAt(g, mid, totalLen / 2, beamY, 0);

  // Outer translucent glow sheath
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, totalLen, 16),
    M.trainGlow
  );
  glow.rotation.z = Math.PI / 2;
  addAt(g, glow, totalLen / 2, beamY, 0);

  // Bright rounded caps at each end
  for (const ex of [0, totalLen]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 12), M.trainDark);
    addAt(g, cap, ex, beamY, 0);
  }

  // Leading energy flare (bigger sphere at the front)
  const flare = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), M.trainGlow);
  addAt(g, flare, 0, beamY, 0);

  // Faint ground scorch shadow under the beam
  const sd = new THREE.Mesh(new THREE.PlaneGeometry(totalLen, 1.2), M.trainGlow);
  sd.rotation.x = -Math.PI / 2;
  addAt(g, sd, totalLen / 2, 0.04, 0);

  g.userData.length = totalLen;
  return g;
}

// ── Rail warning signal (post with a red lamp) ──────────────────────
function makeSignal() {
  const g = new THREE.Group();
  const post = box(0.12, 1.0, 0.12, M.signalPost);
  addAt(g, post, 0, 0.5, 0);
  // Lamp — starts dim; material swapped when a train is coming
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), M.signalOff);
  addAt(g, lamp, 0, 1.0, 0);
  g.userData.lamp = lamp;
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

    // Dashed centre line — spans the full terrain width
    const halfTiles = Math.ceil(GRID_W / 2);
    for (let x = -halfTiles; x <= halfTiles; x++) {
      const mark = box(0.72, 0.01, 0.18, M.roadLine);
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

  // ── Railroad ─────────────────────────────
  } else if (type === 'rail') {
    // Gravel ballast bed
    const bed = box(stripW, 0.26, TILE, M.railBed);
    bed.receiveShadow = true;
    addAt(group, bed, 0, -0.13, 0);

    // Ties (sleepers) across the track — span the full terrain width
    const tieCount = Math.ceil(GRID_W * 2);
    for (let x = -tieCount; x <= tieCount; x++) {
      const tie = box(0.35, 0.08, TILE * 0.82, M.railTie);
      addAt(group, tie, x * TILE * 0.5, 0.02, 0);
    }

    // Two steel rails running along X
    const railA = box(stripW, 0.10, 0.12, M.railMetal);
    addAt(group, railA, 0, 0.08, -0.42);
    const railB = box(stripW, 0.10, 0.12, M.railMetal);
    addAt(group, railB, 0, 0.08,  0.42);

    // Warning signals at both playable edges
    const sigL = makeSignal();
    sigL.position.set(-HALF_W * TILE - 0.6, 0, 0.7);
    group.add(sigL);
    const sigR = makeSignal();
    sigR.position.set( HALF_W * TILE + 0.6, 0, 0.7);
    group.add(sigR);

    // Train: created but parked off-screen; the animate loop drives the cycle
    dir = rng() < 0.5 ? 1 : -1;
    const train = makeTrain();
    train.visible = false;
    train.position.set(0, 0, 0);
    group.add(train);

    // Timing state for the warning→pass cycle (seconds)
    const rd = {
      type, group, cars, logs, speed: 0, dir,
      train,
      signals: [sigL, sigR],
      trainState: 'idle',           // idle → warning → passing → idle
      timer: 1.5 + rng() * 4,       // time until next warning
      warnDuration: 1.6,            // how long lights flash before train
      trainSpeed: (0.20 + rng() * 0.08) * TILE,  // laser — very fast
      trainX: 0,
    };
    rowData[r] = rd;
    return;

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
    // More logs, closer together, so the river is reliably crossable
    const numLogs = Math.floor(rng() * 2) + 3;   // 3-4 logs (was 2-3)
    const spacing = stripW / numLogs;
    for (let i = 0; i < numLogs; i++) {
      const logLen  = Math.floor(rng() * 2) + 2;
      const lx      = -stripW / 2 + spacing * i + (rng() - 0.5) * spacing * 0.25;
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
  const needed  = pRow + LOOK_AHEAD;
  const behind  = pRow - LOOK_BEHIND;
  // Build forward
  for (let r = maxBuiltRow + 1; r <= needed; r++) {
    buildRow(r);
    maxBuiltRow = r;
  }
  // Build backward (handles negative rows too — all treated as grass)
  for (let r = behind; r < maxBuiltRow; r++) {
    buildRow(r);
  }
  // Cleanup rows far outside visible range
  const cutoff = behind - 3;
  for (const key of Object.keys(rowData)) {
    const ri = parseInt(key);
    if (ri < cutoff) {
      scene.remove(rowData[ri].group);
      delete rowData[ri];
    }
  }
}

// Build initial rows (forward and behind)
for (let r = -LOOK_BEHIND; r <= LOOK_AHEAD; r++) { buildRow(r); if (r > maxBuiltRow) maxBuiltRow = r; }

// ─────────────────────────────────────────────────────────────────
//  FENCE  (ring-buffer segments that scroll with the player)
// ─────────────────────────────────────────────────────────────────
// Side barriers: rock clusters running along Z at x = ±FENCE_X
// Back barrier:  rock clusters running along X, one row behind start.

const NUM_FENCE_SEGS = LOOK_AHEAD + LOOK_BEHIND + 8;
const fenceSegments  = { left: [], right: [] };

// A cluster of jagged boulders filling one TILE length. `axis` = 'z' makes
// the cluster run along Z (side barriers); 'x' runs along X (back barrier).
// `seed` varies the shapes so the wall isn't repetitive.
function makeRockCluster(axis, seed) {
  const g = new THREE.Group();
  const rnd = seededRand(seed * 131 + 7);
  const count = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < count; i++) {
    const along = (i / count - 0.5) * TILE + (rnd() - 0.5) * 0.25;
    const rsz   = 0.32 + rnd() * 0.34;
    const rockMat = rnd() < 0.5 ? M.fencePost : (rnd() < 0.5 ? M.fenceRail : M.fenceCap);
    const rock  = new THREE.Mesh(new THREE.DodecahedronGeometry(rsz, 0), rockMat);
    rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    rock.castShadow = rock.receiveShadow = true;
    const off = (rnd() - 0.5) * 0.3;
    if (axis === 'z') rock.position.set(off, rsz * 0.6, along);
    else              rock.position.set(along, rsz * 0.6, off);
    g.add(rock);
  }
  return g;
}

function makeFenceSegment() {
  const g = makeRockCluster('z', Math.floor(Math.random() * 100000));
  scene.add(g);
  return g;
}

// Build side-fence pools
for (let i = 0; i < NUM_FENCE_SEGS; i++) {
  fenceSegments.left.push(makeFenceSegment());
  fenceSegments.right.push(makeFenceSegment());
}

// ── Back fence ───────────────────────────────
// A row of posts + rails running along X, placed at the back boundary.
// We make enough posts to span the full playable width (2*HALF_W columns).
const BACK_FENCE_POSTS = HALF_W * 2 + 2;
const backFenceGroup = new THREE.Group();
scene.add(backFenceGroup);

for (let i = 0; i < BACK_FENCE_POSTS; i++) {
  const px = -FENCE_X + i * TILE;
  const cluster = makeRockCluster('x', i + 1);
  cluster.position.set(px, 0, 0);
  backFenceGroup.add(cluster);
}

// Back fence is a PERMANENT wall one row behind the start (row 0).
// Row 0 is at world Z = 0, so the fence sits at Z = +TILE. It never moves —
// the chicken cannot go behind it.
backFenceGroup.position.set(0, 0, TILE);

// Update side fence positions — call every frame and at startup
function updateFence() {
  // Side fences: one segment per row, spanning from well behind to well ahead
  const base = playerRow - LOOK_BEHIND - 1;
  for (let i = 0; i < NUM_FENCE_SEGS; i++) {
    const worldZ = -(base + i) * TILE;
    fenceSegments.left[i].position.set(-FENCE_X, 0, worldZ);
    fenceSegments.right[i].position.set( FENCE_X, 0, worldZ);
  }
}

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
  forward:  Math.PI,       // local +Z → world -Z  (screen top)
  backward: 0,             // local +Z → world +Z  (screen bottom)
  left:     Math.PI * 1.5, // local +Z → world -X  — 270° so lerp from π goes CCW (+π/2) ✓
  right:    Math.PI * 0.5, // local +Z → world +X  — 90°  so lerp from π goes CW  (-π/2) ✓
};
const IDLE_FACE = Math.PI;

// GREEN ALIEN. Built with local +Z = facing direction (same convention
// as before so all movement/facing logic is unchanged). `body` and `head`
// remain named the same because the jump animation tilts them.
const chicken = new THREE.Group();
scene.add(chicken);

// ── Body ── slim torso ────────────────────────
const body = box(0.62, 0.66, 0.5, M.chickenWht);
addAt(chicken, body, 0, 0.70, 0);

// Belly plate (lighter green)
const breast = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 8), M.beak);
breast.scale.set(0.85, 1.0, 0.6);
breast.castShadow = true;
addAt(chicken, breast, 0, 0.66, 0.20);

// ── Head ── big rounded alien cranium ─────────
const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), M.chickenWht);
head.scale.set(1.05, 1.15, 1.0);   // tall egg-shaped skull
head.castShadow = true;
addAt(chicken, head, 0, 1.42, 0.06);

// Jaw / chin taper
const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), M.chickenWht);
jaw.scale.set(0.9, 0.7, 0.9);
addAt(chicken, jaw, 0, 1.15, 0.14);

// ── Big black almond alien eyes ───────────────
for (const side of [-1, 1]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), M.black);
  eye.scale.set(0.7, 1.25, 0.5);       // tall almond shape
  eye.rotation.z = side * 0.35;        // slant outward
  addAt(chicken, eye, side * 0.19, 1.46, 0.34);
  // tiny glossy highlight
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), M.trainWin);
  addAt(chicken, glint, side * 0.16, 1.52, 0.44);
}

// Small mouth line (pale green)
addAt(chicken, box(0.16, 0.03, 0.05, M.beak), 0, 1.20, 0.42);

// ── Antennae (replace comb) ───────────────────
for (const side of [-1, 1]) {
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.42, 6), M.red);
  stalk.rotation.z = side * 0.28;
  stalk.castShadow = true;
  addAt(chicken, stalk, side * 0.14, 1.86, 0.02);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), M.antennaTip);
  addAt(chicken, orb, side * 0.24, 2.08, 0.02);
}

// ── Arms (replace wings) — slim green limbs ───
for (const side of [-1, 1]) {
  const arm = box(0.12, 0.44, 0.14, M.cream);
  arm.rotation.z = side * 0.12;
  addAt(chicken, arm, side * 0.40, 0.66, 0.04);
  // three-finger hand
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), M.beak);
  addAt(chicken, hand, side * 0.45, 0.42, 0.06);
}

// ── Little back fin (replace tail) ────────────
const tailFeather = box(0.30, 0.28, 0.10, M.cream);
tailFeather.rotation.x = -0.4;
addAt(chicken, tailFeather, 0, 0.86, -0.30);

// ── Legs — green with pale feet ───────────────
for (const side of [-1, 1]) {
  addAt(chicken, box(0.11, 0.30, 0.11, M.orange), side * 0.17, 0.30, 0.00);
  addAt(chicken, box(0.10, 0.10, 0.24, M.beak),   side * 0.17, 0.05, 0.06); // foot
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
updateFence(); // position fences immediately so first frame has no blue gaps
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
  if (newRow < 0) return;   // back fence — can't go behind the start row

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
      if (Math.abs(car.position.x - cx) < hl) {
        // Knocked over in the direction the saucer was travelling
        triggerDeath('ufo', { dir: rd.dir });
        return;
      }
    }
  }

  if (rd.type === 'rail') {
    // Only lethal while the train is actually sweeping through.
    if (rd.trainState === 'passing') {
      const len = rd.train.userData.length;
      // Train spans [trainX, trainX + len] in its travel direction.
      const front = rd.trainX;
      const back  = rd.trainX + (rd.dir > 0 ? len : -len);
      const lo = Math.min(front, back);
      const hi = Math.max(front, back);
      if (cx > lo - 0.3 && cx < hi + 0.3) { triggerDeath('laser'); return; }
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
    if (!onLog) triggerDeath('drown');
  }
}

// ─────────────────────────────────────────────────────────────────
//  DEATH  —  four distinct animations
// ─────────────────────────────────────────────────────────────────
//   'ufo'    → knocked flat in the direction the saucer was travelling
//   'laser'  → disintegrates into glowing fragments
//   'drown'  → sinks into the green liquid with ripples
//   'abduct' → a UFO descends and tractor-beams the alien away
//
// All four are driven per-frame from the main loop via updateDeathAnim()
// so they stay in sync with rendering.

let deathCause = null;
let deathT     = 0;      // seconds since death began
let deathDur   = 1.5;    // total animation length
let deathDone  = false;
const deathProps = new THREE.Group();  // holds particles / ripples / abduction UFO
scene.add(deathProps);

let deathHitDir = 1;     // for 'ufo': direction of the knock
let deathStartY = 0;

function clearDeathProps() {
  while (deathProps.children.length) {
    const c = deathProps.children.pop();
    c.traverse?.((n) => {
      if (n.geometry) n.geometry.dispose?.();
      if (n.material && n.material !== undefined && n.material.dispose && n.material.__isClone) {
        n.material.dispose();
      }
    });
    deathProps.remove(c);
  }
}

// A translucent clone we can fade without touching shared materials
function fadeClone(baseColor) {
  const m = new THREE.MeshBasicMaterial({
    color: baseColor, transparent: true, opacity: 1, depthWrite: false,
  });
  m.__isClone = true;
  return m;
}

function triggerDeath(cause = 'ufo', opts = {}) {
  if (dead) return;
  dead       = true;
  jumping    = false;
  inputQueue = [];
  ridingLog  = null;
  // Stop the landing-bounce tween so it can't fight the death animation
  if (bumpIv) { clearInterval(bumpIv); bumpIv = null; }
  chicken.scale.setScalar(1);

  deathCause  = cause;
  deathT      = 0;
  deathDone   = false;
  deathStartY = chicken.position.y;
  clearDeathProps();

  if (cause === 'ufo') {
    deathDur    = 1.5;
    deathHitDir = opts.dir >= 0 ? 1 : -1;
    // Face forward so the topple axis is well defined (a violent hit —
    // the snap isn't noticeable)
    chicken.rotation.y = Math.PI;

  } else if (cause === 'laser') {
    deathDur = 1.4;
    // Burst of glowing fragments
    for (let i = 0; i < 22; i++) {
      const size = 0.10 + Math.random() * 0.13;
      const frag = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        fadeClone(Math.random() < 0.5 ? 0x4fd06a : 0xff88bb)
      );
      frag.position.set(
        chicken.position.x + (Math.random() - 0.5) * 0.5,
        chicken.position.y + 0.5 + Math.random() * 1.2,
        chicken.position.z + (Math.random() - 0.5) * 0.5
      );
      frag.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6.0,
         Math.random() * 4.5 + 1.0,
        (Math.random() - 0.5) * 6.0
      );
      frag.userData.spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      deathProps.add(frag);
    }
    // Bright flash at the impact point
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 12), fadeClone(0xffffff));
    flash.position.set(chicken.position.x, chicken.position.y + 0.9, chicken.position.z);
    flash.userData.isFlash = true;
    deathProps.add(flash);

  } else if (cause === 'drown') {
    deathDur = 1.9;
    // Expanding ripple rings on the liquid surface
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.38, 20),
        fadeClone(0x6ff08a)
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(chicken.position.x, 0.08, chicken.position.z);
      ring.userData.delay = i * 0.28;
      ring.userData.isRipple = true;
      deathProps.add(ring);
    }
    // A few rising bubbles
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.07 + Math.random() * 0.06, 7, 6),
        fadeClone(0x9cf0b0)
      );
      b.position.set(
        chicken.position.x + (Math.random() - 0.5) * 0.5,
        -0.3 - Math.random() * 0.5,
        chicken.position.z + (Math.random() - 0.5) * 0.5
      );
      b.userData.isBubble = true;
      b.userData.rise = 0.7 + Math.random() * 0.8;
      deathProps.add(b);
    }

  } else if (cause === 'abduct') {
    deathDur = 3.0;
    // The alien is off the bottom of the screen at this point, so pull the
    // camera back onto it (the creep is already halted by `dead`) — this
    // makes the abduction visible instead of happening off-screen.
    camFocusZ = chicken.position.z;
    camTrackX = chicken.position.x;
    // Saucer that descends from above
    const ufo = makeAbductionUFO();
    ufo.position.set(chicken.position.x, 16, chicken.position.z);
    ufo.userData.isAbductor = true;
    deathProps.add(ufo);
  }
}

// A larger, menacing saucer used for the abduction sequence
function makeAbductionUFO() {
  const g = new THREE.Group();
  const R = 1.9;
  const topCone = new THREE.Mesh(new THREE.ConeGeometry(R, 0.6, 24), M.carWhite);
  topCone.position.y = 0.16;
  g.add(topCone);
  const botCone = new THREE.Mesh(new THREE.ConeGeometry(R, 0.75, 24), M.carBlue);
  botCone.rotation.x = Math.PI;
  botCone.position.y = -0.24;
  g.add(botCone);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.93, 0.12, 8, 26), M.rim);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.ufoDome
  );
  dome.position.y = 0.3;
  g.add(dome);
  // Rim lights
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 7), M.ufoGlow);
    orb.position.set(Math.cos(a) * R * 0.72, -0.34, Math.sin(a) * R * 0.72);
    g.add(orb);
  }
  // Tractor beam cone (grows during the lift) — stored for animation
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(1.15, 1, 20, 1, true),
    fadeClone(0x66ffcc)
  );
  beam.material.opacity = 0.0;
  beam.rotation.x = Math.PI;
  g.add(beam);
  g.userData.beam = beam;
  return g;
}

// ── Per-frame death animation ────────────────────────────────────
function updateDeathAnim(dtSec) {
  if (!deathCause || deathDone) return;
  deathT += dtSec;
  const p = Math.min(deathT / deathDur, 1);   // 0..1 progress

  if (deathCause === 'ufo') {
    // Knocked flat in the direction of travel
    const k = Math.min(p / 0.55, 1);              // topple phase
    const ease = 1 - Math.pow(1 - k, 3);
    chicken.rotation.z = deathHitDir * ease * (Math.PI / 2);
    // Shoved along the direction of impact, decelerating
    chicken.position.x += deathHitDir * (1 - k) * 7 * dtSec;
    // Small pop up then settle
    chicken.position.y = Math.max(0, Math.sin(k * Math.PI) * 0.55);
    // Squash flat once down
    if (p > 0.55) {
      const f = (p - 0.55) / 0.45;
      chicken.scale.set(1 + f * 0.25, Math.max(0.18, 1 - f * 0.8), 1 + f * 0.15);
    }

  } else if (deathCause === 'laser') {
    // Alien vanishes almost immediately
    const vanish = Math.min(p / 0.18, 1);
    chicken.scale.setScalar(Math.max(0.001, 1 - vanish));
    // Fragments fly outward with gravity and fade
    for (const c of deathProps.children) {
      if (c.userData.isFlash) {
        const f = Math.min(p / 0.25, 1);
        c.scale.setScalar(1 + f * 2.2);
        c.material.opacity = Math.max(0, 1 - f);
        continue;
      }
      const v = c.userData.vel;
      if (!v) continue;
      v.y -= 11 * dtSec;                       // gravity
      c.position.addScaledVector(v, dtSec);
      if (c.position.y < 0.08) {               // bounce off the ground
        c.position.y = 0.08;
        v.y *= -0.35; v.x *= 0.7; v.z *= 0.7;
      }
      const s = c.userData.spin;
      c.rotation.x += s.x * dtSec;
      c.rotation.y += s.y * dtSec;
      c.rotation.z += s.z * dtSec;
      c.material.opacity = Math.max(0, 1 - p * 1.1);
    }

  } else if (deathCause === 'drown') {
    // Sink below the surface, tipping slightly
    const sink = Math.min(p / 0.7, 1);
    const ease = sink * sink;
    chicken.position.y = deathStartY - ease * 2.4;
    chicken.rotation.z = Math.sin(p * 6) * 0.18;
    chicken.rotation.x = ease * 0.5;
    chicken.scale.setScalar(Math.max(0.25, 1 - ease * 0.35));
    // Ripples expand and fade
    for (const c of deathProps.children) {
      if (c.userData.isRipple) {
        const rt = Math.max(0, deathT - c.userData.delay) / 1.1;
        if (rt <= 0) { c.material.opacity = 0; continue; }
        const g = Math.min(rt, 1);
        c.scale.setScalar(1 + g * 5.5);
        c.material.opacity = Math.max(0, 0.75 * (1 - g));
      } else if (c.userData.isBubble) {
        c.position.y += c.userData.rise * dtSec;
        if (c.position.y > 0.15) c.position.y = 0.15;
        c.material.opacity = Math.max(0, 1 - p * 1.2);
      }
    }

  } else if (deathCause === 'abduct') {
    const ufo = deathProps.children.find((c) => c.userData.isAbductor);
    if (ufo) {
      const beam = ufo.userData.beam;
      ufo.rotation.y += 2.2 * dtSec;

      if (p < 0.30) {
        // Descend from the sky
        const d = p / 0.30;
        ufo.position.y = 16 - d * 11.5;        // down to y ≈ 4.5
        if (beam) beam.material.opacity = 0;
      } else if (p < 0.75) {
        // Hover, beam on, alien rises spinning
        const d = (p - 0.30) / 0.45;
        ufo.position.y = 4.5 + Math.sin(d * Math.PI * 2) * 0.18;
        if (beam) {
          const beamLen = ufo.position.y;
          beam.scale.set(1, beamLen, 1);
          beam.position.y = -beamLen / 2;
          beam.material.opacity = 0.34 + Math.sin(d * 18) * 0.08;
        }
        chicken.position.y = deathStartY + d * (ufo.position.y - 1.0);
        chicken.rotation.y += 7 * dtSec;
        chicken.rotation.z = Math.sin(d * 7) * 0.25;
        chicken.scale.setScalar(Math.max(0.35, 1 - d * 0.45));
      } else {
        // Zip away upward, alien in tow
        const d = (p - 0.75) / 0.25;
        const lift = Math.pow(d, 2) * 26;
        ufo.position.y = 4.5 + lift;
        chicken.position.y = deathStartY + (4.5 - 1.0) + lift;
        chicken.scale.setScalar(Math.max(0.001, 0.55 * (1 - d)));
        if (beam) beam.material.opacity = Math.max(0, 0.34 * (1 - d * 2));
      }
    }
  }

  if (p >= 1) {
    deathDone = true;
    showDeathScreen();
  }
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

  // Clear any death animation state / props
  clearDeathProps();
  deathCause = null;
  deathDone  = false;
  deathT     = 0;

  chicken.scale.setScalar(1);
  chicken.rotation.set(0, IDLE_FACE, 0);
  chicken.position.y = 0;
  body.rotation.x = head.rotation.x = 0;
  jumping = false;
  inputQueue = [];
  ridingLog  = null;
  dead       = false;

  for (let r = -LOOK_BEHIND; r <= LOOK_AHEAD; r++) { buildRow(r); if (r > maxBuiltRow) maxBuiltRow = r; }
  placeChickenAt(0, 0);

  resetCameraCreep();
  camera.position.copy(CAM_OFFSET);
  camLookAt.set(0, 0, 0);
  camera.lookAt(camLookAt);
  updateFence();
}

document.getElementById('restart-btn').addEventListener('click', restartGame);

// ─────────────────────────────────────────────────────────────────
//  CAMERA  (with Crossy-Road-style forward creep / "timer")
// ─────────────────────────────────────────────────────────────────
// Like the original game, the view slowly scrolls forward on its own.
// If you dawdle, the bottom edge catches up to you — fall behind it and
// you're caught (game over). The camera focus tracks a Z value that:
//   • follows the alien when it moves ahead (view chases the player), and
//   • always creeps forward a little each frame (never retreats),
// so standing still eventually pushes the alien off the bottom of screen.

const camLookAt   = new THREE.Vector3();
const _camTarget  = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

// Forward is -Z. camFocusZ is the Z the camera is centred on.
let camFocusZ = 0;
// Camera X tracking is frozen once the alien dies so the view doesn't
// lurch while the death animation plays.
let camTrackX = 0;
// How fast the view creeps forward (world units per frame at 60fps).
// Ramps up slightly with score so it gets tenser the further you go.
const CREEP_BASE = 0.006 * TILE;

// Reusable vector for the off-screen test
const _ndc = new THREE.Vector3();
// Height of the top of the alien's head — we only count it as "overtaken"
// once this point has passed below the bottom edge of the screen.
const ALIEN_TOP_Y = 2.2;

function resetCameraCreep() {
  camFocusZ = 0;
  camTrackX = 0;
}

// True only when the alien is COMPLETELY below the bottom edge of the
// viewport. Uses the real projection matrix rather than a guessed margin,
// so it adapts to any zoom / camera angle / window size.
function alienFullyOffBottom() {
  _ndc.set(chicken.position.x, chicken.position.y + ALIEN_TOP_Y, chicken.position.z);
  _ndc.project(camera);
  return _ndc.y < -1;
}

function updateCamera() {
  if (!dead) {
    // Creep forward over time (Z decreases). Speeds up mildly with score.
    const creep = CREEP_BASE * (1 + Math.min(score, 120) * 0.012);
    camFocusZ -= creep;
    // If the alien is further ahead than the focus, snap the focus up to
    // follow — the player can always outrun the creep by moving forward.
    if (chicken.position.z < camFocusZ) {
      camFocusZ = chicken.position.z;
    }
    camTrackX = chicken.position.x;
  }

  // Camera position follows focus in Z, alien in X.
  _camTarget.set(
    camTrackX + CAM_OFFSET.x,
    CAM_OFFSET.y,
    camFocusZ + CAM_OFFSET.z
  );
  camera.position.lerp(_camTarget, 0.09);

  // Look at a point centred on the focus row, tracking the alien's X.
  _lookTarget.set(camTrackX, 0, camFocusZ);
  camLookAt.lerp(_lookTarget, 0.09);
  camera.lookAt(camLookAt);

  // The projection matrix must be current before the off-screen test.
  camera.updateMatrixWorld();

  // Caught? Only once the alien has fully cleared the bottom of the screen.
  if (!dead && alienFullyOffBottom()) {
    triggerDeath('abduct');
  }

  // Keep the starfield centred on the view so it never runs out
  if (window.__stars) window.__stars.position.set(camTrackX, 0, camFocusZ);
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
//  RAILROAD CYCLE
// ─────────────────────────────────────────────────────────────────
// idle → (timer counts down) → warning (lights flash) → passing (train
// sweeps across at high speed) → idle (reset timer). Mirrors Crossy Road:
// the lights warn you before the train blasts through.
function setSignals(rd, on) {
  for (const sig of rd.signals) {
    sig.userData.lamp.material = on ? M.signalOn : M.signalOff;
  }
}

function updateRail(rd, dtSec) {
  const bound = TILE * GRID_W / 2 + 4;

  if (rd.trainState === 'idle') {
    rd.timer -= dtSec;
    setSignals(rd, false);
    if (rd.timer <= 0) {
      rd.trainState = 'warning';
      rd.timer = rd.warnDuration;
    }

  } else if (rd.trainState === 'warning') {
    rd.timer -= dtSec;
    // Flash the lights (blink ~4Hz)
    setSignals(rd, Math.floor(rd.timer * 8) % 2 === 0);
    if (rd.timer <= 0) {
      rd.trainState = 'passing';
      setSignals(rd, true);
      // Position train just off the entry edge
      rd.train.visible = true;
      rd.train.rotation.y = rd.dir > 0 ? 0 : Math.PI;
      const len = rd.train.userData.length;
      rd.trainX = rd.dir > 0 ? -bound - len : bound + len;
      rd.train.position.x = rd.trainX;
    }

  } else if (rd.trainState === 'passing') {
    rd.trainX += rd.trainSpeed * rd.dir * (dtSec * 60); // frame-rate independent
    rd.train.position.x = rd.trainX;
    // Pulse the beam thickness for an energetic laser feel
    const pulse = 1 + Math.sin(performance.now() * 0.03) * 0.12;
    rd.train.scale.set(1, pulse, pulse);
    const len = rd.train.userData.length;
    // Off the far edge?
    const gone = rd.dir > 0 ? rd.trainX > bound + len : rd.trainX < -bound - len;
    if (gone) {
      rd.train.visible = false;
      rd.trainState = 'idle';
      rd.timer = 2.5 + Math.random() * 4;
      setSignals(rd, false);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
//  MAIN LOOP
// ─────────────────────────────────────────────────────────────────
let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = now - lastTime;
  lastTime  = now;

  shimmerT += dt * 0.001;

  // ── Move cars & logs & lasers ──────────────
  // Runs even while dead so the world stays alive behind the
  // death animation instead of freeze-framing.
  {
    const bound = TILE * GRID_W / 2 + 3.5;
    for (const key of Object.keys(rowData)) {
      const rd = rowData[key];
      if (rd.type === 'road') {
        for (const car of rd.cars) {
          const spd = car.userData.speed || rd.speed;
          car.position.x += spd * rd.dir;
          if (car.position.x >  bound) car.position.x = -bound;
          if (car.position.x < -bound) car.position.x =  bound;
          // UFOs slowly spin and bob rather than flipping direction
          car.userData.spin = (car.userData.spin || 0) + 0.04;
          car.rotation.y = car.userData.spin;
          car.position.y = Math.sin(shimmerT * 2 + car.position.x * 0.3) * 0.06;
        }
      }
      if (rd.type === 'water') {
        for (const log of rd.logs) {
          const spd = log.userData.speed || rd.speed;
          const hl  = (log.userData.length || TILE * 2) / 2 + 0.5;
          log.position.x += spd * rd.dir;
          if (log.position.x >  bound + hl) log.position.x = -bound - hl;
          if (log.position.x < -bound - hl) log.position.x =  bound + hl;
          // Gently bob the rock on the liquid surface
          log.position.y = Math.sin(shimmerT * 1.6 + log.position.x * 0.4) * 0.05;
        }
      }
      if (rd.type === 'rail') {
        updateRail(rd, dt / 1000);
      }
    }
  }

  if (!dead) {
    // ── Ride log ─────────────────────────────
    if (!jumping && ridingLog) {
      const rd = rowData[playerRow];
      if (rd && rd.type === 'water') {
        const spd = ridingLog.userData.speed || rd.speed;
        chicken.position.x += spd * rd.dir;
        playerCol = Math.round(chicken.position.x / TILE);
        if (chicken.position.x >  HALF_W * TILE + 0.6) triggerDeath('drown');
        if (chicken.position.x < -HALF_W * TILE - 0.6) triggerDeath('drown');
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
  } else {
    // Play whichever death animation is active
    updateDeathAnim(Math.min(dt / 1000, 0.05));
  }

  updateFence();
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
