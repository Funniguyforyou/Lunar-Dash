// verify_camera.js — headless harness for the vertical camera follow.
//
// The contract being tested is the one the README states under "Vertical camera
// follow": it tracks the cube with a follow region, never scales the background
// as it climbs, stays inside its clamp, lands exactly back on its home position
// when the cube is on the ground line, and behaves identically at any frame rate.
//
// On top of that it pins the two velocity terms that kill the "lag" feel:
// cameraVelocityLead (aim where a fast cube is heading, ramped in over the last
// lead pixels) and cameraVelocityGain (let the camera actually cover that lead).
// Both must vanish at zero speed, must be bounded, and must never overshoot.
//
// The real game scripts run in a Node vm with the DOM stubbed out, exactly like
// verify_create.js, and physics comes from PlayerController unchanged — nothing
// here re-implements the jump.
//
// Usage: node verify_camera.js [project-root]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(process.argv[2] || __dirname);
// Mirrors the <script src> order in index.html, subfolders included.
const SCRIPTS = ['Data.js', 'SheetHandler.js', 'Blocks/BlockDefinitions.js', 'Levels.js',
  'IconHandler.js', 'PlayerController.js', 'UIScripts/PauseMenu.js',
  'UIScripts/PlayerScreen.js', 'UIScripts/ColourKit.js', 'MainHandler.js'];

let checks = 0;
const failures = [];

function CHECK(cond, label, extra) {
  checks++;
  if (cond) return true;
  failures.push(extra === undefined ? label : `${label} -> ${JSON.stringify(extra)}`);
  return false;
}
function SECTION(name) { console.log(`-- ${name}`); }
function RUN(name, fn) {
  try { fn(); } catch (err) {
    failures.push(`${name} threw: ${err && err.message ? err.message : err}`);
    console.log(`   (threw) ${name}: ${err && err.message ? err.message : err}`);
  }
}

// -------------------- Canvas / DOM stubs --------------------
// drawImage calls are captured so the background tiling can be measured.
const draws = [];
function makeCtx(context) {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: context,
    measureText: () => ({ width: 8 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    drawImage: (...args) => { draws.push(args); },
  };
  return new Proxy(target, {
    get(t, key) { return key in t ? t[key] : () => {}; },
    set(t, key, value) { t[key] = value; return true; },
    has: () => true,
  });
}

const canvas = {
  width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
  style: {}, addEventListener() {}, removeEventListener() {},
  getContext: () => ctxStub,
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 }),
};
const ctxStub = makeCtx(canvas);

function makeElement(tag) {
  return {
    tagName: tag, style: {}, hidden: false, textContent: '', value: '', files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, removeChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {},
    click() {}, focus() {}, setAttribute() {}, getAttribute: () => null,
    getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 }),
    clientWidth: 1280, clientHeight: 720, width: 1280, height: 720,
  };
}
const elements = new Map();
function elementFor(id) {
  if (!elements.has(id)) elements.set(id, makeElement(id === 'stage-canvas' ? 'canvas' : 'div'));
  return elements.get(id);
}

const store = new Map();
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};
class AudioStub {
  constructor(src) { this.src = src; this.paused = true; this.volume = 1; this.currentTime = 0; this.loop = true; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
  removeEventListener() {}
}


// -------------------- Sandbox + game load --------------------
// Canvases handed out by the stubbed document, so a render path that allocates
// one per frame shows up as a number rather than as a dropped frame.
let canvasAllocs = 0;
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, JSON, Date, Promise, Object, Array, Map, Set, Number, String, Boolean, Error,
  structuredClone,
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  fetch: () => Promise.reject(new Error('offline harness')),
  Image: class { addEventListener() {} },
  Audio: AudioStub,
  Blob: class { constructor(parts) { this.parts = parts; } },
  URL: { createObjectURL: () => 'blob:harness', revokeObjectURL() {} },
  localStorage: localStorageStub,
  navigator: { userAgent: 'node-harness', maxTouchPoints: 0 },
  location: { search: '', href: 'http://localhost/index.html' },
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  document: {
    hidden: false, visibilityState: 'visible',
    body: { appendChild() {}, removeChild() {} },
    documentElement: { style: {} },
    getElementById: (id) => elementFor(id),
    createElement: (tag) => {
      if (tag === 'canvas') {
        // Counted so that a per-frame canvas allocation in the render path is a
        // failure, not a surprise.
        canvasAllocs++;
        return { ...canvas, ...makeElement('canvas'), getContext: () => ctxStub };
      }
      return makeElement(tag);
    },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
  },
  promptValue: null,
  confirmValue: true,
  prompt() { return this.promptValue; },
  confirm() { return this.confirmValue; },
  sheetStub: { has: () => false, size: () => ({ w: 64, h: 64 }), draw: () => {} },
  ctxStub,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const bootProblems = [];
vm.createContext(sandbox);
for (const file of SCRIPTS) {
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  } catch (err) {
    bootProblems.push(`${file}: ${err && err.message ? err.message : err}`);
  }
}
const E = (code) => vm.runInContext(code, sandbox);

// A game object shaped exactly like the one startLevel() builds, minus the level
// content: the camera only ever reads world, player and its own position.
const BOOT = `
  app.canvas = document.getElementById('stage-canvas');
  ctx = ctxStub;
  app.scale = 1;
  app.viewWidth = 480;
  app.viewHeight = AppConfig.playViewHeight;
  const font = { draw() {}, scaleForCap() { return 1; } };
  app.resources.fonts.big = font;
  app.resources.fonts.gold = font;
  for (const key of Object.keys(app.resources.sheets)) app.resources.sheets[key] = sheetStub;
  // Plain square art at the real shipped sizes' ratio, so the baked tile is the
  // level's own scale. The ground strip gets art too, so both blits are measured.
  app.resources.images.background = { width: 256, height: 256 };
  app.resources.images.ground = { width: 128, height: 128 };
  app.game = {
    level: { id: 'harness', name: 'harness', length: 6000, objects: [], speed: 1 },
    world: { groundY: AppConfig.playViewHeight - GROUND_LIFT, ceilingY: 0 },
    player: new Player(EntityTypes.CUBE),
    cameraX: 0,
    cameraY: 0,
    elapsed: 0, lastY: 0, percent: 0,
    alive: true, finished: false,
    padCooldown: 0, bannerTimer: 0,
    particles: [],
  };
  app.game.player.setWorld(app.game.world);
  app.game.player.reset(EntityTypes.CUBE);
  // reset() parks the cube at the world origin — which is the ceiling here — so
  // place it on the ground line the way startLevel() does.
  app.game.player.y = app.game.world.groundY - app.game.player.height / 2;
  app.game.player.onGround = true;
  true;
`;

// -------------------- Measured constants --------------------
let CFG = null;
let HIGHEST = 0;
let LOWEST = 0;
const EPS = 1e-9;
// cameraY is float math, so "lands exactly on target" is compared at 1e-6.
const TOL = 1e-6;
// Positive modulo, matching MainHandler's mod(): the tiling phase is folded into
// [0, size) whatever the sign of the camera.
const posMod = (v, n) => ((v % n) + n) % n;

/** One camera frame, driven exactly like updateGame() does it. */
function camStep(dt) { E(`updateCameraY(app.game, ${dt});`); }
/** One physics + camera frame — the real order from updateGame(). */
function physStep(dt) {
  E(`app.game.player.update(${dt}, app.game.world); updateCameraY(app.game, ${dt});`);
}
function settle(frames = 600, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) camStep(dt);
  return E('app.game.cameraY');
}
// =========================================================================
if (bootProblems.length) {
  console.error('BOOT FAILED:\n  ' + bootProblems.join('\n  '));
  process.exit(1);
}
E(BOOT);

CFG = E(`({
  top: AppConfig.cameraFollowTop,
  bottom: AppConfig.cameraFollowBottom,
  lead: AppConfig.cameraVelocityLead,
  leadMax: AppConfig.cameraLeadMax,
  gain: AppConfig.cameraVelocityGain,
  rate: AppConfig.cameraFollowRate,
  view: AppConfig.playViewHeight,
  groundY: app.game.world.groundY,
  ceilingY: app.game.world.ceilingY,
  lift: GROUND_LIFT,
  // Background tiling: the art is baked at the play-area scale, so these pin
  // the exact on-screen tile the level's own scale asks for.
  bgArt: [app.resources.images.background.width, app.resources.images.background.height],
  bgScale: AppConfig.backgroundScale,
  bgParallax: AppConfig.backgroundParallax,
  bgOffsetY: AppConfig.backgroundOffsetY,
  groundTile: AppConfig.groundTile,
})`);
HIGHEST = CFG.ceilingY - CFG.lift;                  // camera as high as it may go
LOWEST = CFG.groundY - (CFG.view - CFG.lift);       // camera home (ground line = 0)

console.log(`view ${CFG.view} | groundY ${CFG.groundY} | ceilingY ${CFG.ceilingY}`
  + ` | cameraY clamp [${HIGHEST}, ${LOWEST}]`);
console.log(`follow region [${CFG.top}, ${CFG.bottom}] | lead ${CFG.lead}s`
  + ` cap ${CFG.leadMax}px | gain ${CFG.gain} | floor ${CFG.rate}px/s\n`);

CHECK(CFG.top > 0 && CFG.top < CFG.bottom && CFG.bottom < CFG.view,
  'follow region must sit inside the view', CFG);
CHECK(CFG.lead > 0 && CFG.leadMax > 0 && CFG.gain >= 1 && CFG.rate > 0,
  'velocity-lead settings must be usable numbers', CFG);

// =========================================================================
SECTION('background art must keep one constant size whatever the camera does');
RUN('background', () => {
  const viewW = E('app.viewWidth');
  const viewH = E('app.viewHeight');
  const playH = CFG.groundY - CFG.ceilingY;
  const wantTile = playH * CFG.bgScale;

  // The grid is baked once, so warm it up and then measure steady state.
  draws.length = 0;
  E('drawGameBackground(app.game)');
  const baked = E('({ tileW: playAreaTiles.tileW, tileH: playAreaTiles.tileH,'
    + ' w: playAreaTiles.canvas.width, h: playAreaTiles.canvas.height,'
    + ' stripW: groundStrip.canvas.width })');

  // The bake is the level's own scale — never the camera's — and it is a whole
  // period bigger than the view, so the per-frame blit can neither rescale the
  // art nor leave a gap at any parallax phase.
  CHECK(Math.abs(baked.tileW - wantTile) < 1e-6 && Math.abs(baked.tileH - wantTile) < 1e-6,
    'bg: baked tile is not the level\'s own scale', { baked: baked.tileW, wantTile });
  CHECK(baked.w >= viewW + baked.tileW && baked.h >= viewH + baked.tileH,
    'bg: the bake is not a full period bigger than the view', { baked, viewW, viewH });
  CHECK(Math.abs(baked.stripW % CFG.groundTile) < 1e-6 && baked.stripW > viewW,
    'bg: baked ground strip is not a whole number of tiles wide enough', baked.stripW);
  console.log(`   baked once at ${baked.w}x${baked.h}px: tile ${baked.tileW.toFixed(2)}px`
    + ` (${baked.w / baked.tileW}x${baked.h / baked.tileH} tiles), ground strip ${baked.stripW}px`);

  const gridCanvas = E('playAreaTiles.canvas');
  const allocsBefore = canvasAllocs;
  const tiles = new Set();
  const gridTops = new Set();
  const gridLefts = new Set();

  for (const camY of [LOWEST, -1, -20, -45, -81, HIGHEST, -200, 60]) {
    for (const camX of [0, 1234, 9999]) {
      E(`app.game.cameraX = ${camX}; app.game.cameraY = ${camY};`);
      draws.length = 0;
      E('drawGameBackground(app.game)');

      // Two blits for the whole frame: the baked play-area grid, then the strip.
      CHECK(draws.length === 2, `bg: expected 2 blits at cameraY ${camY}`,
        draws.length);
      const [grid, strip] = draws;
      // 3-arg drawImage is a 1:1 blit; a 5-arg one would rescale the art.
      CHECK(grid.length === 3 && strip.length === 3,
        `bg: blits must be 1:1 (3-arg), never rescaled at cameraY ${camY}`,
        [grid.length, strip.length]);

      // Coverage: the grid must start above/left of the view and reach past the
      // ground line — the parallax offset may never open a gap.
      const groundScreen = CFG.groundY - camY;
      const needBottom = Math.min(groundScreen, viewH);
      CHECK(grid[1] <= EPS, `bg: gap at the left of the view at cameraY ${camY}`, grid[1]);
      CHECK(grid[2] <= EPS, `bg: gap at the top of the view at cameraY ${camY}`, grid[2]);
      CHECK(grid[1] + grid[0].width >= viewW - 1,
        `bg: gap at the right of the view at cameraY ${camY}`,
        { right: grid[1] + grid[0].width, viewW });
      CHECK(grid[2] + grid[0].height >= needBottom - 1,
        `bg: gap above the ground line at cameraY ${camY}`,
        { bottom: grid[2] + grid[0].height, needBottom });
      // The ground strip still sits on the ground line, and inside the camera's
      // clamp — where the level actually puts the ground line — it reaches the
      // bottom of the view. (A cameraY past the clamp is a probe, not a frame the
      // game can draw, and it left the same gap before the bake existed.)
      CHECK(Math.abs(strip[2] - groundScreen) < TOL,
        `bg: ground strip left the ground line at cameraY ${camY}`, strip[2]);
      if (camY >= HIGHEST && camY <= LOWEST) {
        CHECK(strip[1] <= EPS && strip[2] + strip[0].height >= viewH - 1,
          `bg: ground strip leaves a gap at cameraY ${camY}`,
          { x: strip[1], bottom: strip[2] + strip[0].height, viewH });
      }

      // The bake must land on exactly the grid phase the per-tile loop used, so
      // the art sits at the identical on-screen position it did before, at the
      // identical scale — this is the visual-equivalence contract. The blit starts
      // exactly one period before the loop's first tile, and the grid is periodic,
      // so every grid line still lands where it did.
      const wantX = posMod(-camX * CFG.bgParallax, baked.tileW);
      const wantY = posMod(-camY * CFG.bgParallax, baked.tileH)
        - (baked.tileH - playH) / 2 + CFG.bgOffsetY;
      CHECK(Math.abs(grid[1] + baked.tileW - wantX) < TOL,
        `bg: horizontal parallax phase moved at cameraX ${camX}`,
        { got: grid[1] + baked.tileW, wantX });
      CHECK(Math.abs(grid[2] + baked.tileH - wantY) < TOL,
        `bg: vertical parallax phase moved at cameraY ${camY}`,
        { got: grid[2] + baked.tileH, wantY });

      tiles.add(E('playAreaTiles.tileW').toFixed(4));
      gridTops.add(Number(grid[2].toFixed(3)));
      gridLefts.add(Number(grid[1].toFixed(3)));
    }
  }

  E('app.game.cameraX = 0; app.game.cameraY = 0;');
  CHECK(tiles.size === 1, 'bg: background art SCALE changes with cameraY', [...tiles]);
  CHECK(gridTops.size > 1, 'bg: parallax offset stopped moving with cameraY', [...gridTops]);
  CHECK(gridLefts.size > 1, 'bg: parallax offset stopped moving with cameraX', [...gridLefts]);

  // Performance contract: the grid is baked once and reused, so a pan costs the
  // same two blits as a still frame and allocates nothing.
  CHECK(E('playAreaTiles.canvas') === gridCanvas,
    'bg: the baked grid was replaced while the camera panned');
  CHECK(canvasAllocs === allocsBefore,
    'bg: the render path allocated a canvas per frame', canvasAllocs - allocsBefore);
});

function resetCam(y = 0) { E(`app.game.cameraY = ${y};`); }
/** Hold the cube at a world Y with no vertical speed and let the camera settle. */
function holdAt(y, velocity = 0) {
  resetCam(0);
  E(`app.game.player.y = ${y}; app.game.player.velocityY = ${velocity};`
    + ' app.game.player.onGround = false;');
  return settle();
}

// =========================================================================
SECTION('clamp: cameraY may never leave its range and must return to home');
RUN('clamp', () => {
  for (const y of [-5000, -800, -200, -50, 0, 60, 96, 150, 215, 300, 900, 5000]) {
    const cam = holdAt(y);
    CHECK(cam >= HIGHEST - EPS && cam <= LOWEST + EPS,
      `camera left its clamp for player.y ${y}`, cam);
  }
  CHECK(Math.abs(holdAt(-5000) - HIGHEST) < TOL, 'camera does not sit on its high clamp',
    holdAt(-5000));
  CHECK(Math.abs(holdAt(5000) - LOWEST) < TOL, 'camera does not sit on its low clamp',
    holdAt(5000));

  // Starting outside the clamp (a level swap can do it) must walk the camera
  // back inside and settle on a legal position, whatever the player is doing.
  resetCam(HIGHEST - 400);
  E('app.game.player.y = 150; app.game.player.velocityY = 0;');
  // From stranded far above the play area, the camera walks back into the clamp
  // and then takes the plain edge target for that player height.
  CHECK(Math.abs(settle() - Math.min(LOWEST, Math.max(HIGHEST, 150 - CFG.bottom))) < TOL,
    'camera stranded above its clamp did not take the edge target', settle());
  resetCam(LOWEST + 400);
  E(`app.game.player.y = ${CFG.bottom + 200}; app.game.player.velocityY = 0;`);
  CHECK(Math.abs(settle() - LOWEST) < TOL, 'camera stranded below its clamp', settle());
  resetCam(LOWEST + 400);
  E('app.game.player.y = 15; app.game.player.velocityY = 0;');
  CHECK(Math.abs(settle() - Math.max(HIGHEST, 15 - CFG.top)) < TOL,
    'camera below its clamp ignored the player above it', settle());
  E('app.game.cameraY = 0;');
});

// =========================================================================
SECTION('dead zone: plain edge target, and total stillness at zero speed');
RUN('dead zone', () => {
  // Standing on the ground line and any hop that stays inside the region must
  // hold the camera PERFECTLY still — the velocity terms must not break that,
  // because they have to vanish at zero speed.
  for (const y of [CFG.bottom, 200, 174, 150, CFG.top]) {
    const cam = holdAt(y);
    CHECK(Math.abs(cam - LOWEST) < TOL, `camera drifted for a held player.y ${y}`, cam);
  }
  // Outside the region with no speed, the target is exactly the edge it crossed.
  for (const [y, want] of [[15, Math.max(HIGHEST, 15 - CFG.top)],
  [80, Math.max(HIGHEST, 80 - CFG.top)],
  [CFG.top - 1, Math.max(HIGHEST, -1)],
  [CFG.bottom + 40, Math.min(LOWEST, 40)]]) {
    const cam = holdAt(y);
    CHECK(Math.abs(cam - want) < TOL, `settle point wrong for held player.y ${y}`,
      { cam, want });
  }
  console.log(`   hold y=${CFG.bottom} -> ${holdAt(CFG.bottom).toFixed(2)}`
    + ` | y=15 -> ${holdAt(15).toFixed(2)}`
    + ` | y=${CFG.top - 1} -> ${holdAt(CFG.top - 1).toFixed(2)}`);

  // A cube sitting still inside the region: not one pixel of camera motion.
  resetCam(0);
  E('app.game.player.y = 174; app.game.player.velocityY = 0;');
  let moved = 0;
  for (let i = 0; i < 240; i++) {
    camStep(1 / 60);
    moved = Math.max(moved, Math.abs(E('app.game.cameraY')));
  }
  CHECK(moved === 0, 'camera creeps while the cube stands still inside the region', moved);

  // Junk input must be inert, and must never poison cameraY.
  resetCam(0);
  E('app.game.player.y = 174; app.game.player.velocityY = NaN;');
  camStep(1 / 60);
  CHECK(E('app.game.cameraY') === 0, 'NaN velocity moved the camera', E('app.game.cameraY'));
  E('app.game.player.velocityY = 0;');
  camStep(0);
  camStep(-1 / 60);
  CHECK(E('app.game.cameraY') === 0, 'dt <= 0 moved the camera', E('app.game.cameraY'));
});


// =========================================================================
SECTION('response: constant rate, no ease-out tail, frame-rate independent');
RUN('response', () => {
  const target = Math.max(HIGHEST, 15 - CFG.top);
  const times = {};
  for (const fps of [24, 30, 60, 144, 240]) {
    const dt = 1 / fps;
    E(`app.game.player.velocityY = 0; app.game.player.y = 15; app.game.cameraY = ${LOWEST};`);
    let t = 0;
    for (let i = 0; i < fps * 3; i++) {
      E('app.game.player.velocityY = 0; app.game.player.y = 15;');
      camStep(dt); t += dt;
      if (Math.abs(E('app.game.cameraY') - target) < TOL) break;
    }
    times[fps] = Number(t.toFixed(4));
  }
  const ms = [24, 30, 60, 144, 240].map((f) => (times[f] * 1000).toFixed(0)).join(' / ');
  console.log(`   full-height pan, ms @24/30/60/144/240fps: ${ms}`);
  CHECK(times[60] < 0.12, 'vertical pan is slow/floaty', times);
  CHECK(Math.abs(times[24] - times[240]) <= 1 / 24 + 1e-9,
    'pan rate depends on the frame rate', times);

  // The first steps must each be exactly rate*dt. An exponential ease opens with
  // a big step that shrinks, which is exactly what reads as "floaty".
  const dt = 1 / 60;
  E(`app.game.player.velocityY = 0; app.game.player.y = 15; app.game.cameraY = ${LOWEST};`);
  const steps = [];
  for (let i = 0; i < 3; i++) {
    const before = E('app.game.cameraY');
    camStep(dt);
    steps.push(Number((E('app.game.cameraY') - before).toFixed(6)));
  }
  const want = -CFG.rate * dt;
  CHECK(steps.every((s) => Math.abs(s - want) < 1e-6),
    'first camera steps are not the constant rate (eased follow)', { steps, want });

  // No overshoot on the way in: every step keeps the same sign until arrival.
  let sign = 0, reversals = 0;
  E(`app.game.player.velocityY = 0; app.game.player.y = 15; app.game.cameraY = ${LOWEST};`);
  for (let i = 0; i < 90; i++) {
    const before = E('app.game.cameraY');
    camStep(dt);
    const step = E('app.game.cameraY') - before;
    if (Math.abs(step) < EPS) continue;
    const s = Math.sign(step);
    if (sign !== 0 && s !== sign) reversals++;
    sign = s;
  }
  CHECK(reversals === 0, 'camera overshoots its target and swings back', reversals);
  E('app.game.cameraY = 0;');
});

// =========================================================================
// Real physics: PlayerController is driven exactly as updateGame() drives it, so
// these numbers are the ones a player sees — no hand-fed velocities.
SECTION('real jump physics: the follow must not lag, lead or overshoot');

const BOOT_LEAD_DEFAULTS = `AppConfig.cameraVelocityLead = ${CFG.lead};`
  + ` AppConfig.cameraVelocityGain = ${CFG.gain};`;

/**
 * Runs fps-based physics + camera frames. `launch` injects a vertical velocity on
 * frame 0 (pad/portal strength), `hold` keeps the jump button down. With
 * `flatLead` the two velocity terms are tuned off, which is the old behaviour and
 * the baseline the responsiveness comparison needs.
 */
function runSim({ fps = 60, frames = 600, hold = false, launch = null, flatLead = false } = {}) {
  const dt = 1 / fps;
  E(`app.game.player.setWorld(app.game.world);`
    + ' app.game.player.reset(EntityTypes.CUBE);'
    + ' app.game.player.y = app.game.world.groundY - app.game.player.height / 2;'
    + ' app.game.player.onGround = true;'
    + ` app.game.cameraY = ${LOWEST};`
    + ' app.game.player.x = 0;');
  if (flatLead) E('AppConfig.cameraVelocityLead = 0; AppConfig.cameraVelocityGain = 1;');
  if (launch != null) E(`app.game.player.velocityY = ${launch};`);
  // A held button is a held button: the cube re-jumps from physicsStep while
  // isHolding stays up, so pressing once is what a player holding the key does.
  if (hold) E('app.game.player.handleInputDown(null)');

  const out = {
    minCam: 0, maxCam: 0, minSy: 1e9, maxSy: -1e9, minY: 1e9,
    endCam: 0, endY: 0, onGround: false,
    firstMove: -1, screenAtFirstMove: null, plainMin: 1e9,
    reversalsWhileRising: 0, maxStep: 0, maxPlayerStep: 0,
  };
  let prevCam = LOWEST, prevY = E('app.game.player.y');
  for (let i = 0; i < frames; i++) {
    physStep(dt);
    const s = E(`({y: app.game.player.y, v: app.game.player.velocityY,`
      + ' cam: app.game.cameraY, ground: app.game.player.onGround })');
    const cam = s.cam, sy = s.y - cam;
    const step = cam - prevCam;

    out.minCam = Math.min(out.minCam, cam);
    out.maxCam = Math.max(out.maxCam, cam);
    out.minSy = Math.min(out.minSy, sy);
    out.maxSy = Math.max(out.maxSy, sy);
    out.minY = Math.min(out.minY, s.y);
    out.plainMin = Math.min(out.plainMin, Math.min(LOWEST, Math.max(HIGHEST, s.y - CFG.top)));
    out.maxStep = Math.max(out.maxStep, Math.abs(step));
    out.maxPlayerStep = Math.max(out.maxPlayerStep, Math.abs(s.y - prevY));
    if (Math.abs(step) > EPS && out.firstMove === -1) {
      out.firstMove = i;
      out.screenAtFirstMove = Number(sy.toFixed(3));
    }
    // While the cube is still going up, the camera must never step back down.
    if (s.v < -EPS && step > EPS) out.reversalsWhileRising++;
    prevCam = cam; prevY = s.y;
    out.endCam = cam; out.endY = s.y; out.onGround = s.ground;
  }
  if (flatLead) E(BOOT_LEAD_DEFAULTS);
  out.firstMoveMs = out.firstMove === -1 ? null
    : Number((out.firstMove * dt * 1000).toFixed(1));
  out.minSy = Number(out.minSy.toFixed(2));
  out.maxSy = Number(out.maxSy.toFixed(2));
  out.minCam = Number(out.minCam.toFixed(2));
  out.plainMin = Number(out.plainMin.toFixed(2));
  out.endCam = Number(out.endCam.toFixed(6));
  return out;
}

RUN('physics', () => {
  // --- 1. ordinary held hops: the camera must be made of stone -------------
  const hops = runSim({ fps: 60, frames: 600, hold: true });
  console.log(`   held cube hops: camera [${hops.minCam}, ${hops.maxCam}]`
    + ` | cube peak screen Y ${hops.minSy}`);
  CHECK(hops.minY < CFG.bottom - 20, 'held hops never actually jumped (test is vacuous)',
    hops.minY);
  CHECK(hops.minCam === 0 && hops.maxCam === 0,
    'camera moves during ordinary hops inside the region', [hops.minCam, hops.maxCam]);

  // --- 2. a hard upward launch -------------------------------------------
  const launch = runSim({ fps: 60, frames: 400, launch: -900 });
  console.log(`   pad-strength launch: camera min ${launch.minCam}`
    + ` | cube screen Y [${launch.minSy}, ${launch.maxSy}]`
    + ` | camera first moves ${launch.firstMoveMs}ms in, cube screen Y`
    + ` ${launch.screenAtFirstMove}`);
  CHECK(launch.minCam < -20, 'camera never rose for a hard launch', launch.minCam);
  CHECK(launch.endCam === 0, 'camera did not land back on exactly its home position',
    launch.endCam);
  CHECK(launch.minSy >= 0 && launch.maxSy <= CFG.view,
    'cube left the screen vertically', [launch.minSy, launch.maxSy]);
  CHECK(launch.minSy >= 60,
    'cube pinned against the top of the view — the follow is lagging', launch.minSy);
  CHECK(launch.reversalsWhileRising === 0,
    'camera reversed direction while the cube was still rising', launch.reversalsWhileRising);

  // The lead is a lean-in: it may look ahead of the plain edge target by at most
  // cameraLeadMax, and it must never end up BEHIND it (that is the lag).
  CHECK(launch.minCam <= launch.plainMin + 0.5,
    'camera trails the plain edge target instead of leading it',
    { minCam: launch.minCam, plainMin: launch.plainMin });
  CHECK(launch.minCam >= launch.plainMin - CFG.leadMax - 2,
    'velocity lead outran its cap', { minCam: launch.minCam, plainMin: launch.plainMin });

  // No teleporting: a camera step can never outrun the rate floor or the cube's
  // own movement scaled by the gain, whatever the frame rate.
  const cap = Math.max(CFG.rate / 60, launch.maxPlayerStep * CFG.gain) + 1e-6;
  CHECK(launch.maxStep <= cap, 'camera took a step larger than its rate allows',
    { maxStep: launch.maxStep, cap });

  // --- 3. responsiveness vs. the tuned-off baseline -----------------------
  const flat = runSim({ fps: 60, frames: 400, launch: -900, flatLead: true });
  console.log(`   same launch with the velocity terms tuned off: camera min ${flat.minCam}`
    + ` | first move ${flat.firstMoveMs}ms | screen Y ${flat.screenAtFirstMove}`);
  CHECK(Math.abs(flat.minCam - flat.plainMin) < 1.5,
    'baseline (lead tuned off) should sit on the plain target', flat);
  CHECK(launch.firstMove !== -1 && flat.firstMove !== -1
    && launch.firstMove < flat.firstMove,
    'velocity lead does not make the camera engage any earlier',
    { withLead: launch.firstMoveMs, withoutLead: flat.firstMoveMs });
  CHECK(launch.screenAtFirstMove > CFG.top,
    'camera only starts after the cube has already crossed the region edge',
    { screenAtFirstMove: launch.screenAtFirstMove, edge: CFG.top });

  // --- 4. stronger launches must still respect every bound ----------------
  for (const v of [-1200, -1400, -2000]) {
    const s = runSim({ fps: 60, frames: 400, launch: v });
    const base = runSim({ fps: 60, frames: 400, launch: v, flatLead: true });
    CHECK(s.minCam >= HIGHEST - EPS, `launch ${v} pushed the camera past its clamp`,
      s.minCam);
    CHECK(s.endCam === 0, `camera did not return home after launch ${v}`, s.endCam);
    CHECK(s.minCam >= s.plainMin - CFG.leadMax - 2, `velocity lead uncapped for launch ${v}`,
      { minCam: s.minCam, plainMin: s.plainMin });
    // Leading may never leave the cube sitting HIGHER on screen than a plain
    // follow does — that would be the lag this whole change is meant to remove.
    CHECK(s.minSy >= base.minSy - 0.5,
      `lead left the cube higher on screen than a plain follow for launch ${v}`,
      { withLead: s.minSy, plain: base.minSy });
    // The cube may only poke off the top once the camera is pinned at its high
    // clamp (the view tops out 90px above the level ceiling — beyond that is the
    // level's own limit, not the follow's).
    CHECK(s.minSy >= 0 || s.minCam <= HIGHEST + EPS,
      `cube left the top of the view for launch ${v} while the camera still had room`,
      { minSy: s.minSy, minCam: s.minCam });
  }

  // --- 5. frame-rate independence of the real thing ------------------------
  const slow = runSim({ fps: 30, frames: 400, launch: -900 });
  const fast = runSim({ fps: 144, frames: 900, launch: -900 });
  console.log(`   same launch @30/60/144fps: camera min ${slow.minCam} / ${launch.minCam}`
    + ` / ${fast.minCam}`);
  const tol = Math.abs(launch.minCam) * 0.2 + 6;
  CHECK(Math.abs(slow.minCam - launch.minCam) < tol,
    'camera rise depends on the frame rate', { at30: slow.minCam, at60: launch.minCam });
  CHECK(Math.abs(fast.minCam - launch.minCam) < tol,
    'camera rise depends on the frame rate', { at144: fast.minCam, at60: launch.minCam });
  CHECK(slow.endCam === 0 && fast.endCam === 0,
    'camera did not settle home at every frame rate', [slow.endCam, fast.endCam]);
});

// =========================================================================
SECTION('structure: physics file untouched, follow reads the config');
RUN('structure', () => {
  const player = fs.readFileSync(path.join(ROOT, 'PlayerController.js'), 'utf8');
  CHECK(!/camera/i.test(player),
    'PlayerController.js (physics) now knows about the camera — physics must stay put',
    String(player.match(/camera/i)));
  const src = fs.readFileSync(path.join(ROOT, 'MainHandler.js'), 'utf8');
  const start = src.indexOf('function updateCameraY');
  const body = src.slice(start, src.indexOf('\n}', start));
  CHECK(start > -1 && /AppConfig\.cameraVelocityLead/.test(body)
    && /AppConfig\.cameraVelocityGain/.test(body)
    && /AppConfig\.cameraFollowRate/.test(body),
    'updateCameraY no longer reads its tuning from AppConfig');
  CHECK(/game\.player\.velocityY/.test(body),
    "updateCameraY no longer looks at the player's vertical speed");
  // The follow must stay a pure function of game state: no clock, no easing.
  CHECK(!/Date\.now|performance\.now|Math\.exp\(/.test(body),
    'updateCameraY grew a clock or an easing curve — it must stay frame-rate agnostic');
});

// =========================================================================
// Report
console.log('');
if (failures.length === 0) {
  console.log(`CAMERA HARNESS OK — ${checks} checks passed`);
  process.exit(0);
}
console.log(`${checks - failures.length} / ${checks} checks passed — ${failures.length} failed:`);
for (const f of failures.slice(0, 60)) console.log(`  x ${f}`);
if (failures.length > 60) console.log(`  ... and ${failures.length - 60} more`);
process.exit(1);

