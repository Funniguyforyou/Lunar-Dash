 // verify_pause.js — headless harness for the Geometry Dash-style pause menu.
//
// The contract: GD 2.1's pause panel (wide, compact, dark navy, rounded, no neon
// border), the level name across the top, a small green gear in its top-right, a
// NORMAL MODE and a PRACTICE MODE row each with a real percentage, four icon-only
     // MUSIC / SFX sliders that really drive the mix. Every layout size is a GD unit
// scaled by the view height, so the panel has to keep its shape and its content at
// any window shape.
//
// It loads the real scripts in a Node vm with the DOM stubbed out, pauses a real
// run built by the real level builder, and then checks the panel's colour and
// geometry, the registered hit areas, the text the frame drew, and what each
// control actually does.
//
// Usage: node verify_pause.js [project-root]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(process.argv[2] || __dirname);
// Same order as index.html: the pause screen lives in its own script (under
// UIScripts/, the folder index.html loads it from) and is loaded before MainHandler.js.
// The PLAYER screen is split the same way — PlayerScreen.js owns the icon kit
// and rails, ColourKit.js owns the channel tabs and the swatch grid — both
// before MainHandler.js, which keeps the data flow but no longer the renderer.
// BlockDefinitions.js sits in Blocks/ for the same reason — these paths mirror the
// <script src> list in index.html, not the repository root.
const PAUSE_SCRIPT = 'UIScripts/PauseMenu.js';
const PLAYER_SCRIPT = 'UIScripts/PlayerScreen.js';
const COLOUR_SCRIPT = 'UIScripts/ColourKit.js';
const SCRIPTS = ['Data.js', 'SheetHandler.js', 'Blocks/BlockDefinitions.js', 'Levels.js',
  'IconHandler.js', 'PlayerController.js', PAUSE_SCRIPT, PLAYER_SCRIPT, COLOUR_SCRIPT,
  'MainHandler.js'];

// The real UI atlas this menu draws from: the shipped plist is parsed by the
// game's own parser and wrapped in the game's own Sheet class, so the harness
// exercises the real loader rather than a stand-in.
const PLIST_FILE = path.join(ROOT, 'Images/MenuImgs/GJ_GameSheet03-uhd.plist');
const PNG_FILE = path.join(ROOT, 'Images/MenuImgs/GJ_GameSheet03-uhd.png');
const PLIST_TEXT = fs.readFileSync(PLIST_FILE, 'utf8');
// GameSheet04 carries the PLAYER rail's menu shortcuts; the real file is parsed
// the same way so a renamed frame there fails loudly instead of silently
// falling back to a colour disc.
const MENU_PLIST_FILE = path.join(ROOT, 'Images/MenuImgs/GJ_GameSheet04-uhd.plist');
const MENU_PNG_FILE = path.join(ROOT, 'Images/MenuImgs/GJ_GameSheet04-uhd.png');
const MENU_PLIST_TEXT = fs.readFileSync(MENU_PLIST_FILE, 'utf8');
const MENU_PNG_SIZE = (() => {
  const b = fs.readFileSync(MENU_PNG_FILE);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
})();
const PNG_SIZE = (() => {
  const b = fs.readFileSync(PNG_FILE);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
})();

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
    if (process.env.PAUSE_TRACE) console.log(err && err.stack);
  }
}

// -------------------- Canvas / DOM stubs --------------------
// Every filled and stroked rect is recorded, so the panel's colour and geometry
// can be inspected rather than guessed at.
let ctxStub = null;
let frame = newFrame();
function newFrame() {
  if (ctxStub) ctxStub.resetTransform();
  return { rects: [], strokes: [], texts: [], sprites: [], arcs: 0, arcList: [], gradients: 0 };
}

// -------------------- Window events --------------------
// The audio handling hangs off window/document listeners (visibilitychange, blur,
// focus, the one-shot unlock gestures), so those two objects record their listeners
// and can replay them. `fire` calls the listeners in the order they were registered,
// which is the order the real page calls them in.
const docListeners = new Map();
const winListeners = new Map();
function addTo(map, type, fn) {
  if (typeof fn !== 'function') return;
  if (!map.has(type)) map.set(type, []);
  if (!map.get(type).includes(fn)) map.get(type).push(fn);
}
function removeFrom(map, type, fn) {
  const list = map.get(type);
  if (list) map.set(type, list.filter((f) => f !== fn));
}
function fire(map, type, event) {
  for (const fn of (map.get(type) || []).slice()) fn(event);
}

function makeCtx(context) {
  const gradient = { addColorStop() {} };
  let path = null;
  // Real transform tracking, so a sprite the loader blits rotated (the loader
  // translates, rotates, then blits) is recorded where it actually lands rather
  // than in the rotated frame's own coordinates.
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack = [];
  const mul = (p, q) => ({
    a: p.a * q.a + p.c * q.b,
    b: p.b * q.a + p.d * q.b,
    c: p.a * q.c + p.c * q.d,
    d: p.b * q.c + p.d * q.d,
    e: p.a * q.e + p.c * q.f + p.e,
    f: p.b * q.e + p.d * q.f + p.f,
  });
  const at = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
  // On-screen bounds of a box drawn in the current space.
  const world = (x, y, w, h) => {
    const pts = [at(x, y), at(x + w, y), at(x, y + h), at(x + w, y + h)];
    return {
      x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)),
      w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)),
      h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)),
    };
  };
  function track() {
    if (!path) path = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  }
  function grow(x, y) {
    path.x0 = Math.min(path.x0, x); path.y0 = Math.min(path.y0, y);
    path.x1 = Math.max(path.x1, x); path.y1 = Math.max(path.y1, y);
  }
  const target = {
    canvas: context,
    measureText: () => ({ width: 8 }),
    createLinearGradient: () => { frame.gradients++; return gradient; },
    createRadialGradient: () => { frame.gradients++; return gradient; },
    createPattern: () => null,
    drawImage: (...args) => {
      // The real Sheet blits (image, sx, sy, sw, sh, dx, dy, dw, dh); record the
      // source rect so the harness can name the frame from the sheet's own data,
      // and the destination in on-screen coordinates.
      if (args.length === 9) {
        frame.sprites.push({
          src: [args[1], args[2], args[3], args[4]],
          dst: world(args[5], args[6], args[7], args[8]),
        });
      } else if (args.length === 5) {
        frame.sprites.push({ src: null, dst: world(args[1], args[2], args[3], args[4]) });
      } else {
        frame.sprites.push({ src: null, dst: null, args });
      }
    },
    beginPath() { path = null; },
    closePath() {},
    moveTo(x, y) { const p = at(x, y); track(); grow(p.x, p.y); },
    lineTo(x, y) { const p = at(x, y); track(); grow(p.x, p.y); },
    quadraticCurveTo(cx, cy, x, y) {
      const a = at(cx, cy); const b = at(x, y);
      track(); grow(a.x, a.y); grow(b.x, b.y);
    },
    arc(x, y, r) {
      const p = at(x, y);
      track(); grow(p.x - r, p.y - r); grow(p.x + r, p.y + r);
      frame.arcs++;
      frame.arcList.push({ x: p.x, y: p.y, r });
    },
    rect(x, y, w, h) { const p = world(x, y, w, h); track(); grow(p.x, p.y); grow(p.x + p.w, p.y + p.h); },
    fill() {
      if (!path) return;
      frame.rects.push({
        x: path.x0, y: path.y0, w: path.x1 - path.x0, h: path.y1 - path.y0,
        fill: target.fillStyle,
      });
    },
    stroke() {
      if (!path) return;
      frame.strokes.push({
        x: path.x0, y: path.y0, w: path.x1 - path.x0, h: path.y1 - path.y0,
        stroke: target.strokeStyle, lineWidth: target.lineWidth,
      });
    },
    fillRect(x, y, w, h) {
      const p = world(x, y, w, h);
      frame.rects.push({ x: p.x, y: p.y, w: p.w, h: p.h, fill: target.fillStyle, rect: true });
    },
    strokeRect() {},
    clip() {},
    save() { stack.push({ ...m }); },
    restore() { if (stack.length) m = stack.pop(); },
    resetTransform() { m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; stack.length = 0; },
    // Deliberately inert: the renderer scales by the device pixel ratio, and every
    // check here wants logical units. Translations and rotations are tracked
    // because that is how the loader un-rotates a stored-rotated frame.
    setTransform() {},
    scale() {},
    translate(x, y) { m = mul(m, { a: 1, b: 0, c: 0, d: 1, e: x, f: y }); },
    rotate(a) { m = mul(m, { a: Math.cos(a), b: Math.sin(a), c: -Math.sin(a), d: Math.cos(a), e: 0, f: 0 }); },
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
  getBoundingClientRect: () => ({
    left: 0, top: 0, right: canvas.clientWidth, bottom: canvas.clientHeight,
    width: canvas.clientWidth, height: canvas.clientHeight,
  }),
};
ctxStub = makeCtx(canvas);
function makeElement() {
  return {
    tagName: 'div', style: {}, hidden: false, textContent: '', value: '', files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, removeChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {},
    click() {}, focus() {}, setAttribute() {}, getAttribute: () => null,
    getContext: () => ctxStub,
    getBoundingClientRect: () => canvas.getBoundingClientRect(),
    clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight,
    width: 1280, height: 720,
  };
}
const elements = new Map();
function elementFor(id) {
  if (!elements.has(id)) elements.set(id, makeElement());
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
  // `refuse` stands in for a browser that blocks playback until a real gesture, so
  // the unlock path can be exercised: play() reports the refusal instead of starting.
  play() {
    if (AudioStub.refuse) return Promise.reject(new Error('blocked by autoplay policy'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  addEventListener() {}
}
AudioStub.refuse = false;

// Fonts record what they drew, so the harness can check the labels and the
// percentages the panel actually put on screen.
function makeFont() {
  return {
    capHeight: 100,
    lineHeight: 120,
    scaleForCap(px) { return px / 100; },
    measure(text, scale = 1) {
      return { width: String(text).length * 60 * scale, height: 100 * scale };
    },
    draw(ctx, text, x, y, opts = {}) {
      frame.texts.push({
        text: String(text), x, y,
        scale: opts.scale == null ? 1 : opts.scale,
        align: opts.align || 'left',
        alpha: opts.alpha == null ? 1 : opts.alpha,
        color: opts.color || null,
      });
    },
  };
}

// Sheets record the frame they drew and the size, so the button row can be
// checked for the atlas art and the icon hierarchy.
const sheetStub = {
  has: () => true,
  size: () => ({ w: 120, h: 120 }),
  draw: (ctx, frameName, x, y, opts) => {
    const w = (opts && opts.width) || 120;
    frame.sprites.push({ name: String(frameName), x, y, w, h: w });
  },
};

// A minimal XML tree so the game's own parsePlist() can run headlessly. It only
// needs tagName, children and textContent, plus the one selector it uses; the
// plist itself is still parsed by the game's parseDict/parseValue.
function parseXmlTree(xml) {
  const clean = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const root = { tagName: '#root', children: [], textContent: '' };
  root.querySelector = (sel) => {
    const tag = sel.split('>')[1].trim();
    const find = (el) => {
      for (const c of el.children) {
        if (c.tagName === tag) return c;
        const hit = find(c);
        if (hit) return hit;
      }
      return null;
    };
    return find(root);
  };
  const stack = [root];
  const re = /<\/?([A-Za-z0-9_]+)[^>]*>|([^<]+)/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    if (m[1] !== undefined) {
      if (m[0].startsWith('</')) {
        stack.pop();
      } else {
        const el = { tagName: m[1], children: [], textContent: '' };
        stack[stack.length - 1].children.push(el);
        // <true/> and <false/> are self-closing and hold no content.
        if (!/\/>$/.test(m[0])) stack.push(el);
      }
    } else if (m[2].trim()) {
      stack[stack.length - 1].textContent += m[2].trim();
    }
  }
  return root;
}

const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, JSON, Date, Promise, Object, Array, Map, Set, Number, String, Boolean, Error,
  structuredClone,
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  addEventListener: (type, fn) => addTo(winListeners, type, fn),
  removeEventListener: (type, fn) => removeFrom(winListeners, type, fn),
  dispatchEvent: () => true,
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  fetch: () => Promise.reject(new Error('offline harness')),
  Image: class { addEventListener() {} },
  Audio: AudioStub,
  Blob: class { constructor(parts) { this.parts = parts; } },
  URL: { createObjectURL: () => 'blob:harness', revokeObjectURL() {} },
  DOMParser: class {
    parseFromString(xml) { return parseXmlTree(xml); }
  },
  localStorage: localStorageStub,
  navigator: { userAgent: 'node-harness', maxTouchPoints: 0 },
  location: { search: '', href: 'http://localhost/index.html' },
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  document: {
    hidden: false, visibilityState: 'visible',
    hasFocus: () => true,
    body: { appendChild() {}, removeChild() {} },
    documentElement: { style: {} },
    getElementById: (id) => elementFor(id),
    createElement: (tag) => (tag === 'canvas'
      ? { ...canvas, ...makeElement(), getContext: () => ctxStub }
      : makeElement()),
    addEventListener: (type, fn) => addTo(docListeners, type, fn),
    removeEventListener: (type, fn) => removeFrom(docListeners, type, fn),
    querySelector: () => null, querySelectorAll: () => [],
  },
  fontStub: makeFont(),
  sheetStub,
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

if (bootProblems.length) {
  console.error('BOOT FAILED:\n  ' + bootProblems.join('\n  '));
  process.exit(1);
}

// The page boots on DOMContentLoaded, which is where the audio plumbing (initAudio,
// tryStartMenuMusic, armAudioUnlock) and the listener wiring are installed. Fire it
// here so the audio lifecycle can be checked against the real boot rather than a
// hand-rolled copy of it; boot() then awaits the resource loader, and the rest of this
// harness replaces the resources it loads with stubs.
fire(docListeners, 'DOMContentLoaded');

// -------------------- Boot a real run --------------------
sandbox.__plistText = PLIST_TEXT;
sandbox.__pngImage = { width: PNG_SIZE.w, height: PNG_SIZE.h, src: 'GJ_GameSheet03-uhd.png' };
// The UI atlas is built with the game's own parsePlist/Sheet, from the real plist
// and a stand-in image of the real PNG's size.
const realSheet = E(`(function (text, image) {
  const parsed = parsePlist(text);
  const frames = {};
  for (const [name, data] of Object.entries(parsed.frames || {})) {
    const raw = parseRect(data.textureRect);
    const src = data.spriteSourceSize ? parsePoint(data.spriteSourceSize) : { x: raw.w, y: raw.h };
    const size = data.spriteSize ? parsePoint(data.spriteSize) : { x: raw.w, y: raw.h };
    const off = data.spriteOffset ? parsePoint(data.spriteOffset) : { x: 0, y: 0 };
    frames[name] = {
      rect: { x: raw.x, y: raw.y, w: raw.w, h: raw.h },
      rotated: data.textureRotated === true,
      sizeW: size.x, sizeH: size.y, srcW: src.x, srcH: src.y, offX: off.x, offY: off.y,
    };
  }
  return new Sheet(image, frames, parseSize(parsed.metadata.size));
})(__plistText, __pngImage)`);
sandbox.__realSheet = realSheet;
sandbox.__menuPlistText = MENU_PLIST_TEXT;
sandbox.__menuPngImage = {
  width: MENU_PNG_SIZE.w, height: MENU_PNG_SIZE.h, src: 'GJ_GameSheet04-uhd.png',
};
const realMenuSheet = E(`(function (text, image) {
  const parsed = parsePlist(text);
  const frames = {};
  for (const [name, data] of Object.entries(parsed.frames || {})) {
    const raw = parseRect(data.textureRect);
    const src = data.spriteSourceSize ? parsePoint(data.spriteSourceSize) : { x: raw.w, y: raw.h };
    const size = data.spriteSize ? parsePoint(data.spriteSize) : { x: raw.w, y: raw.h };
    const off = data.spriteOffset ? parsePoint(data.spriteOffset) : { x: 0, y: 0 };
    frames[name] = {
      rect: { x: raw.x, y: raw.y, w: raw.w, h: raw.h },
      rotated: data.textureRotated === true,
      sizeW: size.x, sizeH: size.y, srcW: src.x, srcH: src.y, offX: off.x, offY: off.y,
    };
  }
  return new Sheet(image, frames, parseSize(parsed.metadata.size));
})(__menuPlistText, __menuPngImage)`);
sandbox.__realMenuSheet = realMenuSheet;

E(`
  app.canvas = document.getElementById('stage-canvas');
  ctx = ctxStub;
  app.resources.fonts.big = fontStub;
  app.resources.fonts.gold = fontStub;
  // The UI atlas is the real one; the level-art atlases stay stubs, they are not
  // what this harness is about. The menu atlas (GameSheet04) is real too: the
  // PLAYER rail draws its shortcuts from it.
  app.resources.sheets.game = __realSheet;
  app.resources.sheets.menu = __realMenuSheet;
  for (const key of Object.keys(app.resources.sheets)) {
    if (key !== 'game' && key !== 'menu') app.resources.sheets[key] = sheetStub;
  }
  app.resources.images.background = { width: 256, height: 256 };
  app.resources.images.ground = { width: 128, height: 128 };
  app.resources.images.progressBar = { width: 200, height: 40 };
  app.menuMusic = new Audio('menu');
  app.levelSong = new Audio('level');
  app.audioUnlocked = true;
  beginGameplay(buildLevel(Object.keys(mainLevels)[0]));
  true;
`);

// The percentage the fake run reports, so the panel can be checked against a
// known value instead of 0.
let gamePercent = 0;

/** Renders one paused frame and returns what it drew. */
function pausedFrame(camX = 3000) {
  E(`app.game.cameraX = ${camX}; app.game.percent = ${gamePercent}; enterPause();`);
  frame = newFrame();
  E('render()');
  return {
    screen: E('app.screen'),
    buttons: E('app.buttons.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }))'),
    view: E('({ w: app.viewWidth, h: app.viewHeight })'),
    levelName: E('app.game.level.name'),
    gameplayObjects: E('app.game.level.objects.length'),
  };
}

/** Taps a logical point through the real pointer path (hit test + action). */
function tap(x, y) {
  const s = E('app.canvas.getBoundingClientRect().height / app.viewHeight');
  E(`onPointerDown({ clientX: ${x * s}, clientY: ${y * s} });`);
}
function drag(x, y) {
  const s = E('app.canvas.getBoundingClientRect().height / app.viewHeight');
  E(`onPointerMove({ clientX: ${x * s}, clientY: ${y * s} });`);
}
/** Same as drag, named for hover: moves the pointer without pressing. */
function move(x, y) { drag(x, y); }
function release() { E('onPointerUp()'); }
function buttonById(id) {
  return E(`app.buttons.find((b) => b.id === ${JSON.stringify(id)}) || null`);
}
function texts() { return frame.texts.map((t) => t.text); }

// Helpers the atlas section asks for inside the sandbox, so the checks read the
// parsed plist through the game's own data rather than a copy of it.
E(`
  function __plistFrameNames() { return Object.keys(app.resources.sheets.game.frames); }
  function __frame(name) { return app.resources.sheets.game.frames[name] || null; }
  true;
`);

// Every frame name the real plist parsed to, for the atlas and probe checks.
const parsedNames = new Set(E('__plistFrameNames()'));

// Source rect -> frame name, straight from the real sheet's parsed data. A
// rotated frame's on-disk footprint is the swapped rect, which is what Sheet.draw
// reads, so the lookup swaps it back the same way.
const FRAME_BY_SRC = (() => {
  const frames = E('Object.entries(app.resources.sheets.game.frames)'
    + '.map(([n, f]) => [n, f.rect.x, f.rect.y, f.rotated, f.rect.w, f.rect.h, f.srcW, f.srcH])');
  const map = new Map();
  for (const [name, x, y, rotated, w, h, srcW, srcH] of frames) {
    map.set(`${x},${y},${rotated ? h : w},${rotated ? w : h}`, { name, rotated, srcW, srcH, w, h });
  }
  return map;
})();

/** Every atlas frame the frame drew, with its destination rect. */
function drawnFrames() {
  const out = [];
  for (const s of frame.sprites) {
    if (!s.src) continue;
    const hit = FRAME_BY_SRC.get(s.src.join(','));
    if (hit) out.push({ name: hit.name, rotated: hit.rotated, dst: s.dst, srcW: hit.srcW, srcH: hit.srcH });
  }
  return out;
}
function spriteCount(name) { return drawnFrames().filter((d) => d.name === name).length; }
function spriteOnce(name) { return drawnFrames().find((d) => d.name === name) || null; }

// The panel is the biggest filled shape on the screen by a wide margin (the
// progress tracks, the slider tracks and the dim band are all much smaller), so
// pick it by size rather than by hardcoding its colour.
function panel() {
  const hit = frame.rects
    .filter((r) => r.fill)
    .sort((a, b) => b.w * b.h - a.w * a.h)[0];
  return hit ? { x: hit.x, y: hit.y, w: hit.w, h: hit.h } : null;
}

// The two progress-bar tracks, which share the row fill colour.
function progressTracks() { return frame.rects.filter((r) => r.fill === 'rgba(0,0,0,0.55)'); }

// The reference frame the menu is authored against (597x335), and the fractions
// the panel and its rows use inside it.
const REF = { w: 597, h: 335 };
const REF_PANEL = { x: 0.02, y: 0.03, w: 0.96, h: 0.94 };
const REF_ROW = [
  ['practice', 0.28, 54],
  ['resume', 0.435, 68],
  ['menu', 0.58, 54],
  ['replay', 0.715, 54],
];

// =========================================================================
console.log(`level "${E('app.game.level.name')}" | view ${E('app.viewWidth').toFixed(1)}x${E('app.viewHeight')}\n`);

SECTION('the atlas: the real GD sheets, parsed by the real loader');
RUN('atlas', () => {
  const sheet = E('app.resources.sheets.game');
  const parsed = [...parsedNames];
  CHECK(sheet && typeof sheet.has === 'function' && typeof sheet.draw === 'function',
    'the UI atlas is not a real Sheet', sheet && Object.keys(sheet));

  // The PNG and its plist are one pair: the sheet is as big as the texture it
  // reads, so a renamed or swapped-in PNG would show up here.
  CHECK(PNG_SIZE.w === 4080 && PNG_SIZE.h === 3526,
    'this is not the UHD texture', PNG_SIZE);
  CHECK(sheet.width === PNG_SIZE.w && sheet.height === PNG_SIZE.h,
    'the sheet does not match the PNG it is cut from',
    { sheet: [sheet.width, sheet.height], png: [PNG_SIZE.w, PNG_SIZE.h] });

  // Every frame the menu names has to exist in the shipped plist.
  const wanted = ['resume', 'practice', 'menu', 'replay', 'practiceSign', 'gear'];
  for (const key of wanted) {
    const name = E(`uiAssets.frames.${key}`);
    CHECK(!!name, `uiAssets.frames.${key} is not set`);
    CHECK(parsed.includes(name), `${name} is not in GJ_GameSheet03-uhd.plist`);
    CHECK(sheet.has(name), `${name} did not parse into the sheet`);
  }
  CHECK(parsed.length === 469, 'the plist frame count changed', parsed.length);

  // The menu atlas ships alongside it: GameSheet04 holds the PLAYER rail's
  // shortcuts, parsed by the same loader into a real Sheet of its own.
  const menuSheet = E('app.resources.sheets.menu');
  CHECK(menuSheet && typeof menuSheet.has === 'function'
    && typeof menuSheet.draw === 'function',
    'the menu atlas is not a real Sheet', menuSheet && Object.keys(menuSheet));
  CHECK(menuSheet.width === MENU_PNG_SIZE.w && menuSheet.height === MENU_PNG_SIZE.h,
    'the menu sheet does not match the PNG it is cut from',
    { sheet: [menuSheet.width, menuSheet.height], png: [MENU_PNG_SIZE.w, MENU_PNG_SIZE.h] });
  for (const key of ['menuDaily', 'menuCreate']) {
    const name = E(`uiAssets.frames.${key}`);
    CHECK(!!name, `uiAssets.frames.${key} is not set`);
    CHECK(menuSheet.has(name), `${name} is not in GJ_GameSheet04-uhd.plist`);
  }
  // The gear is the same kind of shipped disc as the four in the button row: a
  // round green options sprite with a gold gear, not a drawn stand-in. The paused
  // screen blits this frame into the panel's top-right corner.
  const gearName = E('uiAssets.frames.gear');
  const gearInk = E(`__frame(${JSON.stringify(gearName)})`);
  CHECK(parsed.includes(gearName), `${gearName} is not in the plist`, gearName);
  CHECK(gearInk && Math.abs(gearInk.srcW - gearInk.srcH) < 16
    && gearInk.srcW < 360, 'the gear frame is not the round corner disc',
  gearInk && { w: gearInk.srcW, h: gearInk.srcH });

  // The pause Resume is the round play disc that sits directly below the big
  // plus-shaped play button in the sheet — not the plus button itself. The plus
  // stays as frames.play for the main menu and level select.
  const bigPlay = E(`__frame(${JSON.stringify(E('uiAssets.frames.play'))})`);
  const resumeInk = E(`__frame(${JSON.stringify(E('uiAssets.frames.resume'))})`);
  CHECK(bigPlay && resumeInk
    && Math.abs(resumeInk.rect.y - (bigPlay.rect.y + bigPlay.rect.h)) <= 4,
    'uiAssets.frames.resume is not the frame directly below the big play button',
    { play: bigPlay && bigPlay.rect, resume: resumeInk && resumeInk.rect });
  CHECK(resumeInk && resumeInk.srcW < 360 && Math.abs(resumeInk.srcW - resumeInk.srcH) < 24,
    'uiAssets.frames.resume is not the small round disc',
    resumeInk && { w: resumeInk.srcW, h: resumeInk.srcH });

  // The frames are real artwork, not placeholders: each one has its own box in
  // the sheet, inside the texture, with a sensible untrimmed size.
  const seen = new Set();
  for (const key of wanted) {
    const f = E(`__frame(${JSON.stringify(E(`uiAssets.frames.${key}`))})`);
    CHECK(f && f.rect.w > 8 && f.rect.h > 8, `${key} has no usable box`, f);
    CHECK(f.rect.x >= 0 && f.rect.y >= 0
      && f.rect.x + f.rect.w <= PNG_SIZE.w && f.rect.y + f.rect.h <= PNG_SIZE.h,
      `${key} is cut from outside the texture`, f);
    CHECK(f.srcW >= f.rect.w && f.srcH >= f.rect.h,
      `${key} claims to be smaller than its own pixels`, f);
    CHECK(!seen.has(`${f.rect.x},${f.rect.y}`), `${key} reuses another frame's pixels`, f);
    seen.add(`${f.rect.x},${f.rect.y}`);
  }

  // GD ships the Practice Mode sign rotated in the texture. The loader has to know
  // that, and it has to hand back the upright size, or the sign lands sideways.
  const sign = E(`__frame(${JSON.stringify(E('uiAssets.frames.practiceSign'))})`);
  CHECK(sign.rotated, 'the sign is no longer flagged as stored rotated', sign);
  CHECK(sign.rect.w > sign.rect.h, 'the sign should be a wide label, not a square', sign);
  console.log(`   GJ_GameSheet03-uhd ${PNG_SIZE.w}x${PNG_SIZE.h}, ${parsed.length} frames`);
  console.log('   sign: upright ' + `${sign.rect.w}x${sign.rect.h}, source ${sign.srcW}x${sign.srcH}`
    + `, stored rotated, offset ${sign.offX},${sign.offY}`);
});

SECTION('the panel sits in the reference frame, and the run stays dimmed behind it');
RUN('panel', () => {
  const shot = pausedFrame();
  CHECK(shot.screen === 'paused', 'pausing did not reach the paused screen', shot.screen);

  const p = panel();
  CHECK(p, 'the panel was never filled', frame.rects.length);
  if (!p) return;

  // 597x335 reference: the panel spans 2%..98% across and 3%..97% down.
  const near = (got, want) => Math.abs(got - want) < 1;
  CHECK(near(p.w / shot.view.w, REF_PANEL.w), 'the panel is not 96% of the view width',
    { got: p.w / shot.view.w, want: REF_PANEL.w });
  CHECK(near(p.h / shot.view.h, REF_PANEL.h), 'the panel is not 94% of the view height',
    { got: p.h / shot.view.h, want: REF_PANEL.h });
  CHECK(near(p.x / shot.view.w, REF_PANEL.x), 'the panel does not start at 2% from the left', p.x);
  CHECK(near(p.y / shot.view.h, REF_PANEL.y), 'the panel does not start at 3% from the top', p.y);
  CHECK(near((p.x + p.w / 2) - shot.view.w / 2, 0) && near((p.y + p.h / 2) - shot.view.h / 2, 0),
    'the panel is not centred', p);

  // The reference dims the run rather than hiding it: the run still draws behind.
  const band = frame.rects.find((r) => r.fill === 'rgba(0,0,0,0.35)' && !r.r);
  CHECK(band && near(band.w, shot.view.w) && band.h > 0,
    'the gameplay is not dimmed behind the panel', band);
  CHECK(shot.gameplayObjects > 0, 'the level did not draw behind the pause', shot.gameplayObjects);
  CHECK(!texts().includes('PAUSED'), 'the giant PAUSED title is still there', texts());

  console.log(`   panel ${p.w.toFixed(0)}x${p.h.toFixed(0)}`
    + ` (${(p.w / shot.view.w * 100).toFixed(0)}% x ${(p.h / shot.view.h * 100).toFixed(0)}% of the view)`);
});

SECTION('level name, gear, and the two progress rows');
RUN('content', () => {
  gamePercent = 42;
  const shot = pausedFrame();
  const drawn = texts();
  const name = String(shot.levelName);

  CHECK(drawn.includes(name), 'the level name is not on the panel', { name, drawn });
  // The font carries its own edge, so the title is drawn untinted: no colour
  // override is what keeps GD's white lettering white.
  const titleDraws = frame.texts.filter((t) => t.text === name);
  CHECK(titleDraws.length > 0 && titleDraws.every((t) => !t.color),
    'the level title is being recoloured', titleDraws);
  CHECK(drawn.includes('Normal Mode'), 'the NORMAL MODE label is missing', drawn);
  CHECK(drawn.includes('Practice Mode'), 'the PRACTICE MODE label is missing', drawn);
  CHECK(drawn.includes('42%'), 'the panel does not show the real progress', drawn);
  CHECK(drawn.includes('0%'), 'the practice row does not read 0%', drawn);
  for (const label of ['RESUME', 'RESTART', 'MENU', 'EDITOR']) {
    CHECK(!drawn.includes(label), `the text label ${label} is back under a button`, drawn);
  }

  // Two progress rows, stacked, both with a track.
  const tracks = progressTracks();
  CHECK(tracks.length === 2, 'the panel does not have two progress tracks', tracks);
  if (tracks.length === 2) {
    const [a, b] = tracks.sort((p, q) => p.y - q.y);
    CHECK(b.y >= a.y + a.h - 0.01, 'the two progress rows overlap', tracks);
    CHECK(Math.abs(a.w - b.w) < 0.01 && Math.abs(a.x - b.x) < 0.01,
      'the two progress rows are not the same width', tracks);
  }

  // The gear is GD's own corner sprite, blitted once: the panel shows the shipped
  // options art (a green disc with a gold gear) rather than a drawn stand-in.
  const gearName = E('uiAssets.frames.gear');
  const gearArt = spriteOnce(gearName);
  CHECK(gearArt, 'the options gear is not blitted from the atlas',
    drawnFrames().map((d) => d.name));
  CHECK(spriteCount(gearName) === 1, 'the options gear is blitted more than once');

  // The gear is the reference's little corner button, and it still lives there.
  const gear = buttonById('options');
  const p = panel();
  CHECK(gear, 'the options gear is not a button');
  if (gear && p) {
    CHECK(gear.w === gear.h, 'the gear is not circular', gear);
    CHECK(gear.x > p.x && gear.x + gear.w < p.x + p.w && gear.y > p.y && gear.y + gear.h < p.y + p.h,
      'the gear is not inside the panel', { gear, p });
    CHECK(Math.abs((gear.x + gear.w / 2) / shot.view.w - 0.94) < 0.01,
      'the gear is not in the top-right corner', { gear, view: shot.view.w });
    CHECK(gear.w < p.w * 0.2, 'the gear is not the small corner button', gear);
    // The art sits exactly on the hit area, keeps the sheet's own aspect (GD's gear
    // box is 196x203, a shade taller than wide) and keeps the reference size: this
    // build has always drawn the corner button 30u across.
    if (gearArt) {
      const gc = { x: gearArt.dst.x + gearArt.dst.w / 2, y: gearArt.dst.y + gearArt.dst.h / 2 };
      CHECK(Math.abs(gc.x - (gear.x + gear.w / 2)) < 0.5
        && Math.abs(gc.y - (gear.y + gear.h / 2)) < 0.5,
      'the gear hitbox is not centred on its sprite', { sprite: gearArt.dst, box: gear });
      const gink = E(`__frame(${JSON.stringify(gearName)})`);
      CHECK(Math.abs(gearArt.dst.w / gearArt.dst.h - gink.rect.w / gink.rect.h) < 0.01,
        'the gear sprite is stretched', { dst: gearArt.dst, ink: gink.rect });
      CHECK(Math.abs(gearArt.dst.w - 30 * E('pauseMetrics.u')) < 1,
        'the gear is not the reference size', { got: gearArt.dst.w, view: shot.view.w });
    }
  }
  gamePercent = 0;

  // Nothing is painted over the panel any more: the build readout is console/window
  // data, so the black bar it used to draw (and the level name it covered) is gone.
  CHECK(!frame.rects.some((r) => r.fill === 'rgba(0, 0, 0, 0.85)'),
    'the probe black bar is still painted over the panel',
    frame.rects.filter((r) => r.fill === 'rgba(0, 0, 0, 0.85)'));
});

SECTION('the four buttons are the GD atlas discs, not drawn circles');
RUN('buttons', () => {
  pausedFrame();
  const p = panel();
  const u = E('pauseMetrics.u');
  const view = E('({ w: app.viewWidth, h: app.viewHeight })');
  const rowY = view.h * 0.62;

  // Practice mode is not implemented, so its disc is drawn but not pressable.
  CHECK(buttonById('practice') === null,
    'the practice button is pressable even though practice mode does not exist');

  // Every disc is blitted from its own atlas frame, once, at the reference spot.
  const discs = [];
  for (const [key, xFrac, gdWidth] of REF_ROW) {
    const name = E(`uiAssets.frames.${key}`);
    const hits = drawnFrames().filter((d) => d.name === name);
    CHECK(hits.length === 1, `${name} was blitted ${hits.length} times, expected once`);
    if (!hits.length) continue;
    const { x: dx, y: dy, w, h } = hits[0].dst;
    const cx = dx + w / 2;
    const cy = dy + h / 2;
    CHECK(Math.abs(cx - view.w * xFrac) < 1,
      `${name} is not at the reference x (${xFrac})`, { cx, want: view.w * xFrac });
    CHECK(Math.abs(cy - rowY) < 1, `${name} is not on the reference row`, { cy, rowY });
    CHECK(Math.abs(w - gdWidth * u) < 1, `${name} is not the reference width`,
      { w, want: gdWidth * u });
    // Aspect: the loader fits the frame inside the box, so a stretch shows up as a
    // destination ratio that disagrees with the plist's own ink.
    const ink = E(`__frame(${JSON.stringify(name)})`);
    CHECK(Math.abs(w / h - ink.rect.w / ink.rect.h) < 0.01,
      `${name} is stretched`, { got: w / h, want: ink.rect.w / ink.rect.h });
    discs.push({ key, name, cx, cy, w, h, left: dx, right: dx + w });
  }
  CHECK(discs.length === 4, 'the row is not four discs', discs.length);
  for (let i = 1; i < discs.length; i++) {
    CHECK(discs[i].left >= discs[i - 1].right - 0.01, 'the discs overlap', discs);
  }

  // The hit areas are the reference squares, independent of the art, and resume is
  // the big one.
  const menu = buttonById('menu');
  const resume = buttonById('resume');
  const restart = buttonById('restart');
  CHECK(menu && resume && restart, 'the panel is missing one of its three live buttons',
    { menu, resume, restart });
  if (menu && resume && restart && p) {
    const centres = [menu, resume, restart].map((b) => b.y + b.h / 2);
    CHECK(Math.max(...centres) - Math.min(...centres) < 1,
      'the buttons are not in one horizontal row', centres);
    CHECK(resume.x < menu.x && menu.x < restart.x, 'the buttons are not in the reference order',
      { resume: resume.x, menu: menu.x, restart: restart.x });
    CHECK(resume.w > menu.w && resume.w > restart.w, 'resume is not the largest button',
      { resume, menu, restart });
    CHECK(Math.abs(menu.w - restart.w) < 0.01, 'the side buttons are not the same size',
      { menu, restart });
    for (const [id, b] of [['menu', menu], ['resume', resume], ['restart', restart]]) {
      CHECK(b.x > p.x && b.x + b.w < p.x + p.w && b.y > p.y && b.y + b.h < p.y + p.h,
        `the ${id} button hangs outside the panel`, { id, b, p });
      // Each live hitbox is centred on the sprite it stands in for.
      const disc = discs.find((d) => ['menu', 'resume', 'restart'].includes(d.key)
        && d.name === E(`uiAssets.frames.${id === 'restart' ? 'replay' : id}`));
      if (disc) {
        CHECK(Math.abs((b.x + b.w / 2) - disc.cx) < 1 && Math.abs((b.y + b.h / 2) - disc.cy) < 1,
          `the ${id} hitbox is not centred on its sprite`, { disc, box: b });
      }
    }
  }
  // The row sits clear of the progress bars above it.
  const bars = progressTracks();
  CHECK(bars.length === 2 && bars.every((r) => r.y + r.h < rowY - 34 * u),
    'the button row overlaps the progress bars', { rowY, bars });

  // GD's "Practice Mode" sign is the atlas art, level with the disc and to its
  // left, with the arrow that is part of the same frame.
  const signName = E('uiAssets.frames.practiceSign');
  const sign = spriteOnce(signName);
  CHECK(sign, 'the Practice Mode sign is not drawn from the atlas',
    drawnFrames().map((d) => d.name));
  const practice = discs.find((d) => d.key === 'practice');
  if (sign && practice && p) {
    const { x: sx, y: sy, w: sw, h: sh } = sign.dst;
    const signCx = sx + sw / 2;
    const signCy = sy + sh / 2;
    CHECK(sx + sw <= practice.left, 'the sign is not to the left of the practice disc',
      { signRight: sx + sw, discLeft: practice.left });
    CHECK(Math.abs(signCy - practice.cy) < 12 * u, 'the sign is not level with the practice disc',
      { signCy, discCy: practice.cy });
    CHECK(sx > p.x && sx + sw < p.x + p.w, 'the sign hangs outside the panel', { sign: sign.dst, p });
    // Sized off its own art, not a text box: the wide label keeps its aspect.
    const ink = E(`__frame(${JSON.stringify(signName)})`);
    CHECK(Math.abs(sw / sh - ink.rect.w / ink.rect.h) < 0.01, 'the sign is stretched',
      { got: sw / sh, want: ink.rect.w / ink.rect.h });
    CHECK(sign.rotated === true, 'the rotated sign lost its rotation flag', sign);
    CHECK(!frame.texts.some((t) => /practice mode/i.test(t.text) && t.x < practice.left + practice.w),
      'a hand-drawn Practice Mode label is still being drawn',
      frame.texts.map((t) => t.text));
  }

  // Hover scales the sprite, not a hand-drawn shape, and the hitbox stays put.
  const base = spriteOnce(E('uiAssets.frames.resume'));
  if (resume && base) {
    move(resume.x + resume.w / 2, resume.y + resume.h / 2);
    frame = newFrame();
    E('render()');
    const hovered = spriteOnce(E('uiAssets.frames.resume'));
    const expected = base.dst.w * E('AppConfig.hoverScale');
    CHECK(hovered && Math.abs(hovered.dst.w - expected) < 0.5,
      'hover does not scale the sprite', { got: hovered && hovered.dst.w, expected });
    const box = buttonById('resume');
    CHECK(Math.abs(box.w - resume.w) < 0.01 && Math.abs(box.x - resume.x) < 0.01,
      'hovering moved the hitbox', { before: resume, after: box });
  }

  console.log('   row: ' + discs.map((d) => `${d.key} ${d.w.toFixed(0)}px`).join(' | ')
    + ` at y=${rowY.toFixed(0)}`);

  // The probe is how the live build gets confirmed from a browser, so it has to
  // name the atlas rather than just the layout. It reports the six frames the panel
  // blits (four discs, the Practice Mode sign, the options gear) and paints none of
  // them itself: the readout is console/window data, not an overlay on the panel.
  const probe = E('window.__pauseLayout || null');
  CHECK(probe && probe.art === 'gd-atlas', 'the probe does not report the atlas art', probe);
  CHECK(probe && probe.frames.length === 6 && probe.frames.every((f) => parsedNames.has(f)),
    'the probe names frames the plist does not have', probe && probe.frames);
  CHECK(probe && probe.frames.includes(E('uiAssets.frames.gear')),
    'the probe does not report the gear sprite', probe && probe.frames);
  CHECK(probe && Math.abs(probe.u - u) < 0.001, 'the probe reports the wrong scale', probe);
});

SECTION('every control still does what it did');
RUN('actions', () => {
  // Resume
  pausedFrame();
  const resume = buttonById('resume');
  tap(resume.x + resume.w / 2, resume.y + resume.h / 2);
  CHECK(E('app.screen') === 'playing', 'resume did not return to the run', E('app.screen'));

  // Restart
  E('app.game.player.x = 4000;');
  pausedFrame();
  const restart = buttonById('restart');
  tap(restart.x + restart.w / 2, restart.y + restart.h / 2);
  CHECK(E('app.screen') === 'playing', 'restart did not return to the run', E('app.screen'));
  CHECK(E('app.game.player.x') === 60 && E('app.game.percent') === 0,
    'restart did not reset the run', { x: E('app.game.player.x'), percent: E('app.game.percent') });

  // Menu: a main level quits to the level list.
  pausedFrame();
  const menu = buttonById('menu');
  tap(menu.x + menu.w / 2, menu.y + menu.h / 2);
  CHECK(E('app.screen') === 'levels', 'the menu button did not leave the run', E('app.screen'));
  CHECK(E('app.game') === null, 'quitting left the run object behind', E('app.game'));

  // A draft playtest goes back to the editor instead — the old behaviour.
  E('beginGameplay(buildLevel(Object.keys(mainLevels)[0])); app.game.level.draft = true;');
  pausedFrame();
  const menu2 = buttonById('menu');
  tap(menu2.x + menu2.w / 2, menu2.y + menu2.h / 2);
  CHECK(E('app.screen') === 'create', 'a draft playtest did not return to the editor', E('app.screen'));

  // The gear toggles the options state, like GD's own.
  E('beginGameplay(buildLevel(Object.keys(mainLevels)[0]));');
  pausedFrame();
  CHECK(buttonById('pause-music') !== null, 'the music slider is missing');
  const gear = buttonById('options');
  const wasOpen = E('!!app.pauseOptionsOpen');
  tap(gear.x + gear.w / 2, gear.y + gear.h / 2);
  frame = newFrame();
  E('render()');
  CHECK(E('!!app.pauseOptionsOpen') !== wasOpen, 'the gear did not toggle the options',
    E('app.pauseOptionsOpen'));
  const gear2 = buttonById('options');
  tap(gear2.x + gear2.w / 2, gear2.y + gear2.h / 2);
  frame = newFrame();
  E('render()');
  CHECK(E('!!app.pauseOptionsOpen') === wasOpen, 'the gear did not toggle back', E('app.pauseOptionsOpen'));

  // The keyboard paths are untouched.
  E("app.screen = 'playing';");
  E('onKeyDown({ code: "Escape", preventDefault() {} })');
  CHECK(E('app.screen') === 'paused', 'Escape no longer pauses', E('app.screen'));
  E('onKeyDown({ code: "Space", preventDefault() {} })');
  CHECK(E('app.screen') === 'playing', 'Space no longer resumes', E('app.screen'));
});

SECTION('the volume sliders really drive the mix');
RUN('volume', () => {
  E('app.musicVolume = 1; app.sfxVolume = 1; setSfxVolume(1);');
  pausedFrame();
  const drawn = texts();
  CHECK(drawn.includes('Music'), 'the MUSIC label is missing', drawn);
  CHECK(drawn.includes('SFX'), 'the SFX label is missing', drawn);

  const music = buttonById('pause-music');
  const sfx = buttonById('pause-sfx');
  CHECK(music && sfx, 'the two sliders are not both registered');
  if (!music || !sfx) return;
  const p = panel();
  CHECK(sfx.x > music.x, 'SFX is not to the right of MUSIC', { music, sfx });
  CHECK(Math.abs(music.y - sfx.y) < 1, 'the two sliders are not on one row');
  CHECK(music.h < music.w * 0.5, 'the slider is not a thin track', music);
  CHECK(music.x > p.x && sfx.x + sfx.w < p.x + p.w && music.y + music.h < p.y + p.h,
    'the sliders do not fit inside the panel', { music, sfx, p });

  // The track starts full, because 1.0 is the mix the game shipped with.
  CHECK(E('app.musicVolume') === 1 && Math.abs(E('app.levelSong.volume') - 0.6) < 1e-6,
    'the music slider did not start at the shipped level',
    { music: E('app.musicVolume'), song: E('app.levelSong.volume') });

  // A tap a quarter along the music track sets the level there.
  const trackX = E('pauseSliders.music.x');
  const trackW = E('pauseSliders.music.w');
  tap(trackX + trackW * 0.25, music.y + music.h / 2);
  CHECK(Math.abs(E('app.musicVolume') - 0.25) < 0.02,
    'tapping the music slider did not set the volume', E('app.musicVolume'));
  CHECK(Math.abs(E('app.levelSong.volume') - 0.6 * 0.25) < 0.02,
    'the level song did not follow the music slider', E('app.levelSong.volume'));
  CHECK(E('app.pauseSliderDrag') === 'music', 'the drag was not recorded', E('app.pauseSliderDrag'));

  // Dragging keeps tracking the pointer; releasing stops it.
  drag(trackX + trackW * 0.75, music.y + music.h / 2);
  CHECK(Math.abs(E('app.musicVolume') - 0.75) < 0.02,
    'dragging the music slider did not track the pointer', E('app.musicVolume'));
  release();
  CHECK(E('app.pauseSliderDrag') === null, 'the drag outlived the release', E('app.pauseSliderDrag'));
  const held = E('app.musicVolume');
  drag(trackX + trackW * 0.1, music.y + music.h / 2);
  CHECK(E('app.musicVolume') === held, 'the slider kept moving after the release', E('app.musicVolume'));

  // SFX drives its own channel, independently.
  const sfxX = E('pauseSliders.sfx.x');
  const sfxW = E('pauseSliders.sfx.w');
  tap(sfxX + sfxW * 0.5, sfx.y + sfx.h / 2);
  release();
  CHECK(Math.abs(E('app.sfxVolume') - 0.5) < 0.02,
    'the SFX slider did not set its volume', E('app.sfxVolume'));
  CHECK(Math.abs(E('sfxVolume') - 0.5) < 0.02,
    'the SFX slider did not reach the sound player', E('sfxVolume'));
  CHECK(Math.abs(E('app.musicVolume') - 0.75) < 0.02,
    'the two sliders are not independent', { music: E('app.musicVolume'), sfx: E('sfxVolume') });

  // The knob sits at the value: the slider knob is the one circle the size of
  // sliderKnob on the panel.
  frame = newFrame();
  E('render()');
  const knobX = E('pauseSliders.music.x') + E('pauseSliders.music.w') * 0.75;
  const knobR = E('pauseMetrics.sliderKnob');
  const knob = frame.arcList.find((a) => Math.abs(a.r - knobR) < 0.01 && a.x > E('pauseSliders.music.x') - 1);
  CHECK(knob && Math.abs(knob.x - knobX) < 2, 'the knob does not sit at the value', { knob, knobX });

  E('app.musicVolume = 1; app.sfxVolume = 1; setSfxVolume(1);');
});

SECTION('the menu loop survives a tab switch, and starts on the first gesture');
RUN('audio', () => {
  // The audio lifecycle hangs off window/document events, so replay the ones the real
  // page fires instead of calling the handlers behind their own wiring.
  const hide = (hidden) => { sandbox.document.hidden = hidden; fire(docListeners, 'visibilitychange'); };
  const blur = () => fire(winListeners, 'blur');
  const focus = () => fire(winListeners, 'focus');

  // Leaving the app is two different events — a tab switch fires visibilitychange,
  // while losing the window's focus with the tab still visible fires blur alone — so
  // each needs its own way back, or the loop stays paused until the player presses
  // something.
  CHECK((docListeners.get('visibilitychange') || []).length === 1,
    'nothing listens for the tab being hidden');
  CHECK((winListeners.get('blur') || []).length === 1, 'nothing silences the audio on blur');
  CHECK((winListeners.get('focus') || []).length === 1,
    'nothing restarts the music when the window gets focus back');

  // The first gesture is watched for the same reason: it is what starts the loop at
  // all, and it must not be tied to the canvas. Ask the arming call what it registers
  // rather than counting everything on window — the canvas input listens for keydown
  // there too.
  const gestures = E('AUDIO_GESTURES');
  const armed = new Map([...winListeners].map(([type, list]) => [type, list.length]));
  E('armAudioUnlock()');
  for (const type of gestures) {
    CHECK((winListeners.get(type) || []).length === (armed.get(type) || 0) + 1,
      `arming does not watch the first ${type}`);
  }

  // Home menu, loop going.
  E("app.game = null; app.audioUnlocked = true; setScreen('menu');");
  E('app.menuMusic.currentTime = 12; playMenuMusic();');
  CHECK(!E('app.menuMusic.paused'), 'the menu loop is not playing on the home menu');

  // The loop belongs to the browser window, not to the run, so leaving the tab does not
  // stop it: no pause, no restart, and the playhead keeps its place. This is the bug —
  // hiding the tab used to silence the menu music until the player pressed something.
  hide(true);
  CHECK(!E('app.menuMusic.paused'), 'hiding the tab stopped the menu music');
  CHECK(Math.abs(E('app.menuMusic.currentTime') - 12) < 0.001,
    'the loop was restarted instead of left alone', E('app.menuMusic.currentTime'));
  hide(false);
  CHECK(!E('app.menuMusic.paused'), 'coming back to the tab left the menu music stopped');

  // Same for a bare focus change, with the tab never hidden.
  blur();
  CHECK(!E('app.menuMusic.paused'), 'losing focus stopped the menu music');
  focus();
  CHECK(!E('app.menuMusic.paused'), 'regaining focus left the menu music stopped');

  // A page put into the back/forward cache fires pagehide and is then restored as-is,
  // so that event must not silence the loop either. Only the run's own track is dropped.
  fire(winListeners, 'pagehide');
  CHECK(!E('app.menuMusic.paused'), 'pagehide stopped the menu music');

  // In a run, leaving freezes the song instead of dropping it, so Resume picks the
  // track back up rather than leaving the rest of the level silent.
  E('beginGameplay(buildLevel(Object.keys(mainLevels)[0]));');
  const song = E('app.levelSong');
  CHECK(song && !E('app.levelSong.paused'), 'the level song is not playing');
  blur();
  CHECK(E('app.screen') === 'paused', 'leaving during a run did not pause it', E('app.screen'));
  CHECK(E('app.levelSong') === song && E('app.levelSong.paused'),
    'leaving during a run dropped or restarted the song');
  focus();
  CHECK(E('app.screen') === 'paused', 'a return resumed a paused run on its own', E('app.screen'));
  CHECK(E('app.menuMusic.paused'), 'the menu loop started while a run was paused');
  frame = newFrame();
  E('render()');
  const resumeBtn = buttonById('resume');
  tap(resumeBtn.x + resumeBtn.w / 2, resumeBtn.y + resumeBtn.h / 2);
  CHECK(E('app.screen') === 'playing', 'Resume did not return to the run', E('app.screen'));
  CHECK(E('app.levelSong') === song && !E('app.levelSong.paused'),
    'Resume did not pick the frozen song back up');

  // The first gesture anywhere starts the loop — a key press counts, not just a click
  // on a button — and the listeners go after one shot.
  E("app.game = null; setScreen('menu'); app.audioUnlocked = false; pauseMenuMusic();");
  CHECK(E('app.menuMusic.paused'), 'the loop was already playing before the first gesture');
  if (process.env.PAUSE_AUDIO_TRACE) {
    console.log('   BEFORE ' + [...winListeners].map(([t, l]) => `${t}:[${l.map((f) => f.name)}]`).join(' '));
  }
  fire(winListeners, 'keydown', { code: 'KeyW', repeat: false, preventDefault() {} });
  CHECK(E('app.audioUnlocked'), 'the first gesture did not unlock the audio');
  CHECK(!E('app.menuMusic.paused'), 'the first gesture did not start the menu loop');
  // The unlock listeners are one-shot: the gesture that consumes them leaves nothing of
  // itself behind, whichever of them happened to fire. Check for onFirstGesture by name
  // rather than for a count of zero — keydown also carries the game's own onKeyDown
  // handler, which is meant to stay — and confirm that permanent listener survived.
  for (const type of gestures) {
    const left = (winListeners.get(type) || []).map((f) => f.name);
    CHECK(!left.includes('onFirstGesture'), `an unlock listener on ${type} stayed armed`, left);
  }
  CHECK((winListeners.get('keydown') || []).map((f) => f.name).includes('onKeyDown'),
    'the gesture also removed the game\'s own keydown handler');

  // The unlock is not a keyboard thing: a plain pointer press starts the loop just as
  // well, which is what a player who only ever clicks has to rely on.
  E("app.audioUnlocked = false; pauseMenuMusic(); armAudioUnlock();");
  CHECK(E('app.menuMusic.paused'), 'the loop was already playing before the pointer press');
  fire(winListeners, 'pointerdown', { clientX: 10, clientY: 10 });
  CHECK(E('app.audioUnlocked'), 'a pointer press did not unlock the audio');
  CHECK(!E('app.menuMusic.paused'), 'a pointer press did not start the menu loop');

  // And boot tries by itself before any gesture: on an origin the browser trusts, the
  // loop needs no click at all — which is what the player was missing.
  E("app.screen = 'menu'; app.audioUnlocked = false; pauseMenuMusic(); tryStartMenuMusic();");
  CHECK(!E('app.menuMusic.paused'), 'the boot attempt did not start the loop');
  AudioStub.refuse = true;
  E('pauseMenuMusic(); app.audioUnlocked = false; tryStartMenuMusic();');
  CHECK(E('app.menuMusic.paused') && !E('app.audioUnlocked'),
    'a refused boot attempt still counted as an unlock');
  AudioStub.refuse = false;

  // Leave the harness on a live run, the way the sections after this one expect.
  E('app.audioUnlocked = true; beginGameplay(buildLevel(Object.keys(mainLevels)[0]));');
});

SECTION('the colour kit: the picker carries every colour ColorSettings.json ships');
RUN('palette-parity', () => {
  // The picker keeps its own copy of the kit in Data.js so the menus draw without
  // fetch() — the headless harness boots offline, and so does a cold page load. That
  // copy is only trustworthy while it still matches the file it was copied from, so
  // this reads the shipped JSON off disk and compares the two byte for byte.
  const json = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'Settings', 'ColorSettings.json'), 'utf8'));
  const fromDisk = json.Colors;
  const embedded = E('JSON.parse(JSON.stringify(playerColourGroups))');

  CHECK(JSON.stringify(embedded) === JSON.stringify(fromDisk),
    'Data.js has drifted from Settings/ColorSettings.json',
    `${Object.keys(embedded).length} vs ${Object.keys(fromDisk).length} families`);

  const families = Object.keys(fromDisk);
  CHECK(families.length === 9, 'the kit is not nine families', families);

  // Flattened in file order, so page 3 holds the same colours on every machine.
  const expected = [];
  for (const group of families) {
    for (const [name, hex] of Object.entries(fromDisk[group])) {
      expected.push({ name, hex, group });
    }
  }
  CHECK(expected.length === 107, 'the kit is not the 107 colours this pins', expected.length);

  const palette = E('getColourPalette()');
  CHECK(palette.length === expected.length, 'the picker does not expose every colour',
    palette.length);
  CHECK(JSON.stringify(palette) === JSON.stringify(expected),
    'the picker list does not match the file order');

  // A hex is a hex: six digits, so a typo shows up here instead of painting whatever
  // the canvas made of it.
  const bad = palette.filter((c) => !/^#[0-9a-f]{6}$/i.test(c.hex));
  CHECK(bad.length === 0, 'a swatch is not a #rrggbb colour', bad.slice(0, 4));

  // No family quietly dropped, and no colour pasted in twice.
  const groups = E('Object.keys(playerColourGroups)');
  for (const family of families) {
    CHECK(groups.includes(family), `${family} is missing from the picker`, groups);
  }
  const keys = expected.map((c) => `${c.group}.${c.name}`);
  CHECK(new Set(keys).size === keys.length,
    'a colour was pasted twice', keys.length - new Set(keys).size);

  // The reverse lookup a saved loadout needs: a hex in the file resolves to its own
  // name and family, and the old free-picker defaults are not in the kit at all.
  const first = expected[0];
  const hit = E(`findColour(${JSON.stringify(first.hex)})`);
  CHECK(hit && hit.name === first.name && hit.group === first.group,
    'findColour returned the wrong colour', hit);
  CHECK(!E("findColour('#00ffcc')"), 'findColour claims a colour outside the kit');

  // 12 across, 2 rows: five pages for 107 colours, the last one holding the remainder.
  CHECK(E('COLOUR_COLS') === 12 && E('COLOUR_ROWS') === 2, 'the grid is no longer 12 x 2');
  CHECK(E('COLOURS_PER_PAGE') === 24, 'the page size changed', E('COLOURS_PER_PAGE'));
  CHECK(E('colourPageCount()') === 5, 'the kit is not five pages', E('colourPageCount()'));
  const per = E('COLOURS_PER_PAGE');
  CHECK(4 * per < expected.length && expected.length <= 5 * per,
    'the last page does not line up with the palette', expected.length);
});

SECTION('the PLAYER screen: GD chrome, a paged grid, swatches that really apply');
RUN('player-screen', () => {
  const keepScreen = E('app.screen');
  const keepTarget = E('iconScreen.colorTarget');
  const keepPage = E('iconScreen.colourPage');
  const keepColors = E('JSON.parse(JSON.stringify(playerData.colors))');
  const keepHeight = E('app.viewHeight');

  E("setScreen('icons')");
  // Pin the mode so the row has an "active" button to light: buildIconScreen is async
  // and this harness is not, so the row is checked off iconScreen's own state.
  E('iconScreen.mode = availableIconModes()[0]');
  E("iconScreen.colorTarget = 'primary'; setColourPage(0);");

  frame = newFrame();
  E('renderIcons()');

  // ---- GD's art, not drawn stand-ins ----
  CHECK(spriteOnce(E('uiAssets.frames.topBar')), "GD's top bar is missing");
  CHECK(spriteOnce(E('uiAssets.frames.characterSelect')), 'the character-select frame is missing');
  CHECK(spriteOnce(E('uiAssets.frames.starsIcon')), 'the star counter icon is missing');
  CHECK(spriteOnce(E('uiAssets.frames.back')), 'the back arrow is missing');
  CHECK(spriteCount(E('uiAssets.frames.colorChannel')) === 3,
    'the three channel discs are not GD colour buttons',
    spriteCount(E('uiAssets.frames.colorChannel')));

  // The reference's extra chrome: the hanging shop sign (rope + board), the
  // lock in the locked icon slots and again in the hint, and both rails —
  // the currency icons down the right and the palette shortcuts down the
  // left (GameSheet03's hue wheel + colour disc, GameSheet04's menu art).
  CHECK(spriteOnce(E('uiAssets.frames.shopRope')), 'the shop sign rope is missing');
  CHECK(spriteOnce(E('uiAssets.frames.shopSign')), 'the shop sign board is missing');
  CHECK(buttonById('shop-sign'), 'the shop sign has no hit area');
  CHECK(spriteCount(E('uiAssets.frames.lock')) >= 2,
    'the locks (grid slots + hint) are missing',
    spriteCount(E('uiAssets.frames.lock')));
  for (const key of ['currencyStar', 'currencyCoin', 'currencyUserCoin',
    'currencyDiamond', 'currencyCoinEpic']) {
    CHECK(spriteOnce(E(`uiAssets.frames.${key}`)), `the rail has no ${key} row`);
  }
  CHECK(buttonById('palette-primary'), 'the palette rail lost its primary shortcut');
  CHECK(buttonById('palette-secondary'), 'the palette rail lost its secondary shortcut');
  const menuRail = E(`(app.resources.sheets.menu && app.resources.sheets.menu.has
    && uiAssets.frames.menuDaily && uiAssets.frames.menuCreate)
    ? [app.resources.sheets.menu.has(uiAssets.frames.menuDaily),
       app.resources.sheets.menu.has(uiAssets.frames.menuCreate)] : null`);
  if (menuRail) {
    CHECK(menuRail[0] && menuRail[1], 'GameSheet04 is missing the rail shortcuts', menuRail);
  }

  // The mode row is the icon kit's own off/on buttons: the active mode lit, the rest
  // dark. Seven drawn pills would pass a "something is here" check; these do not.
  const modes = E('availableIconModes()');
  CHECK(modes.length === 7, 'the kit does not offer all seven modes', modes);
  const activeMode = E('iconScreen.mode');
  for (const mode of modes) {
    const pair = E(`ICON_MODE_FRAMES[${JSON.stringify(mode)}]`);
    if (!CHECK(Array.isArray(pair) && pair.length === 2, `no GD art for mode ${mode}`, pair)) continue;
    const want = mode === activeMode ? pair[1] : pair[0];
    CHECK(spriteCount(want) === 1,
      `${mode} drew ${spriteCount(want)} copies of ${want}, wanted exactly 1`);
  }

  // ---- One page of the grid: 12 across, 2 rows, 40px cells ----
  const palette = E('getColourPalette()');
  const per = E('COLOURS_PER_PAGE');
  let present = 0;
  for (let i = 0; i < per; i++) {
    const b = buttonById(`swatch-${i}`);
    if (b) present++;
  }
  CHECK(present === per, `page 0 shows ${present} of ${per} swatches`, present);
  CHECK(!buttonById(`swatch-${per}`), 'page 0 drew past its own colours');

  const s0 = buttonById('swatch-0');
  const s1 = buttonById('swatch-1');
  const s12 = buttonById('swatch-12');
  if (s0 && s1) {
    CHECK(Math.round(s1.x - s0.x) === 47, 'the grid is not 12 across with a 7px gap',
      s1.x - s0.x);
    CHECK(Math.round(s1.y - s0.y) === 0, 'the first row is not level', s1.y - s0.y);
  }
  if (s0 && s12) {
    CHECK(Math.round(s12.y - s0.y) === 47, 'the second row is not under the first',
      s12.y - s0.y);
    CHECK(Math.round(s12.x - s0.x) === 0, 'the second row does not restart at the left',
      s12.x - s0.x);
  }

  // ---- Tapping a swatch paints the channel the tabs select ----
  const pick = palette[5];
  const sw5 = buttonById('swatch-5');
  if (CHECK(sw5, 'swatch 5 is missing')) {
    tap(sw5.x + sw5.w / 2, sw5.y + sw5.h / 2);
    CHECK(E('playerData.colors.primary').toLowerCase() === pick.hex.toLowerCase(),
      'a swatch did not paint the primary channel',
      { got: E('playerData.colors.primary'), want: pick.hex });
  }

  // The channel tabs reroute the grid, and only the selected channel moves.
  frame = newFrame();
  E('renderIcons()');
  const tab = buttonById('color-tab-secondary');
  if (CHECK(tab, 'the secondary channel tab is missing')) {
    tap(tab.x + tab.w / 2, tab.y + tab.h / 2);
    CHECK(E('iconScreen.colorTarget') === 'secondary', 'the channel tab did not switch',
      E('iconScreen.colorTarget'));
  }
  const pick2 = palette[6];
  frame = newFrame();
  E('renderIcons()');
  const sw6 = buttonById('swatch-6');
  if (sw6) {
    tap(sw6.x + sw6.w / 2, sw6.y + sw6.h / 2);
    CHECK(E('playerData.colors.secondary').toLowerCase() === pick2.hex.toLowerCase(),
      'the grid kept painting the old channel',
      { got: E('playerData.colors.secondary'), want: pick2.hex });
    CHECK(E('playerData.colors.primary').toLowerCase() === pick.hex.toLowerCase(),
      'the other channel was clobbered too', E('playerData.colors.primary'));
  }

  // ---- Paging: five pages, the last colour reachable, clamped at both ends ----
  E("iconScreen.colorTarget = 'primary'; setColourPage(0)");
  frame = newFrame();
  E('renderIcons()');
  const next = buttonById('colour-next');
  if (CHECK(next, 'there is no way to turn the page')) {
    tap(next.x + next.w / 2, next.y + next.h / 2);
    CHECK(E('iconScreen.colourPage') === 1, 'the next arrow did not turn the page',
      E('iconScreen.colourPage'));
  }

  E('setColourPage(colourPageCount() - 1)');
  frame = newFrame();
  E('renderIcons()');
  const last = palette.length - 1;
  CHECK(buttonById(`swatch-${last}`), 'the last colour is not on the last page');
  CHECK(!buttonById(`swatch-${last + 1}`), 'the last page drew past the palette');

  const prev = buttonById('colour-prev');
  if (prev) {
    tap(prev.x + prev.w / 2, prev.y + prev.h / 2);
    CHECK(E('iconScreen.colourPage') === E('colourPageCount()') - 2,
      'the previous arrow did not turn back', E('iconScreen.colourPage'));
  }
  E('setColourPage(-3)');
  CHECK(E('iconScreen.colourPage') === 0, 'the page does not clamp at the start');
  E('setColourPage(999)');
  CHECK(E('iconScreen.colourPage') === E('colourPageCount()') - 1,
    'the page does not clamp at the end');

  // Put back what the sections after this one were relying on. setScreen() moves
  // app.viewHeight as well as app.screen, so restoring only the screen would leave
  // the responsive section sizing the pause panel against the menu's height.
  E(`app.screen = ${JSON.stringify(keepScreen)};`
    + ` app.viewHeight = ${keepHeight}; AppConfig.viewHeight = ${keepHeight};`);
  E(`iconScreen.colorTarget = ${JSON.stringify(keepTarget)}; iconScreen.colourPage = ${keepPage};`);
  E(`playerData.colors = ${JSON.stringify(keepColors)};`);
});

SECTION('the panel scales with the viewport instead of one resolution');
RUN('responsive', () => {
  const shapes = [[1280, 720], [800, 600], [1920, 480], [600, 900], [2560, 720]];
  const seen = [];
  for (const [w, h] of shapes) {
    E(`app.canvas.clientWidth = ${w}; app.canvas.clientHeight = ${h};`);
    sandbox.innerWidth = w;
    sandbox.innerHeight = h;
    E('resize()');
    E("app.screen = 'paused';");
    frame = newFrame();
    E('render()');

    const p = panel();
    const view = E('({ w: app.viewWidth, h: app.viewHeight })');
    const u = E('pauseMetrics.u');
    CHECK(p, `no panel at ${w}x${h}`);
    if (!p) continue;
    CHECK(view.h === 320, `the paused view height changed at ${w}x${h}`, view);
    CHECK(Math.abs(p.w / view.w - REF_PANEL.w) < 0.005 && Math.abs(p.h / view.h - REF_PANEL.h) < 0.005,
      `the panel leaves the reference frame at ${w}x${h}`, { p, view });
    CHECK(p.x > 0 && p.y > 0 && p.x + p.w < view.w && p.y + p.h < view.h,
      `the panel runs off the view at ${w}x${h}`, { p, view });
    CHECK(Math.abs((p.x + p.w / 2) - view.w / 2) < 1
      && Math.abs((p.y + p.h / 2) - view.h / 2) < 1,
      `the panel is off centre at ${w}x${h}`, { p, view });

    // Every control still lands inside the panel.
    for (const id of ['options', 'resume', 'menu', 'restart', 'pause-music', 'pause-sfx']) {
      const b = buttonById(id);
      CHECK(b && b.x > p.x && b.x + b.w < p.x + p.w && b.y > p.y && b.y + b.h < p.y + p.h,
        `the ${id} control is outside the panel at ${w}x${h}`, { id, b, p });
    }
    // The four discs must never touch, must stay inside the panel, and must keep
    // scaling with the reference unit at every window shape.
    const discs = REF_ROW
      .map(([key, xFrac, gdWidth]) => {
        const hit = spriteOnce(E(`uiAssets.frames.${key}`));
        if (!hit) return null;
        const { x: dx, y: dy, w: dw, h: dh } = hit.dst;
        return { key, left: dx, right: dx + dw, cx: dx + dw / 2, cy: dy + dh / 2, w: dw, h: dh };
      })
      .filter(Boolean);
    CHECK(discs.length === 4, `the four discs are not all drawn at ${w}x${h}`, discs.length);
    for (let i = 1; i < discs.length; i++) {
      CHECK(discs[i].left >= discs[i - 1].right - 0.01, `the button discs overlap at ${w}x${h}`, discs);
    }
    if (discs.length === 4) {
      CHECK(discs[0].left >= p.x && discs[3].right <= p.x + p.w,
        `the discs spill out of the panel at ${w}x${h}`, { discs, p });
      for (const [key, xFrac, gdWidth] of REF_ROW) {
        const disc = discs.find((d) => d.key === key);
        CHECK(disc && Math.abs(disc.w - gdWidth * u) < 1,
          `the ${key} disc is not the reference size at ${w}x${h}`, { disc, want: gdWidth * u });
        CHECK(disc && Math.abs(disc.cx - view.w * xFrac) < 1,
          `the ${key} disc is not at its reference x at ${w}x${h}`, { disc, xFrac });
      }
    }
    // The sign rides along with the practice disc instead of drifting.
    const signHit = spriteOnce(E('uiAssets.frames.practiceSign'));
    if (signHit && discs.length === 4) {
      const practice = discs[0];
      CHECK(signHit.dst.x + signHit.dst.w <= practice.left
        && signHit.dst.x > p.x && signHit.dst.x + signHit.dst.w < p.x + p.w,
        `the practice sign is misplaced at ${w}x${h}`, { sign: signHit.dst, practice, p });
    }

    // Nothing overlaps: the two progress bars stack down the panel, and the two
    // slider tracks share one row without touching each other. The slider tracks
    // are gradient-filled and gold-stroked, the progress tracks are flat. The gear
    // is gold-stroked too, so match on width: a slider track is a wide part of the
    // panel, the gear is a small corner button.
    const bars = progressTracks();
    const sliderTracks = frame.strokes.filter((s) => s.stroke === '#d4a72c' && s.w > p.w * 0.15);
    CHECK(bars.length === 2 && sliderTracks.length === 2,
      `expected 2 progress bars + 2 slider tracks at ${w}x${h}`,
      { bars: bars.length, sliders: sliderTracks.length });
    if (bars.length === 2 && sliderTracks.length === 2) {
      const sorted = bars.slice().sort((a, b) => a.y - b.y);
      CHECK(sorted[1].y >= sorted[0].y + sorted[0].h - 0.01,
        `the two progress bars overlap at ${w}x${h}`, sorted);
      CHECK(Math.abs(sliderTracks[0].y - sliderTracks[1].y) < 1,
        `the two slider tracks are not on one row at ${w}x${h}`, sliderTracks);
      const [left, right] = sliderTracks.slice().sort((a, b) => a.x - b.x);
      CHECK(left.x + left.w <= right.x + 0.01,
        `the two sliders overlap at ${w}x${h}`, { left, right });
    }
    seen.push({ shape: `${w}x${h}`, panel: `${p.w.toFixed(0)}x${p.h.toFixed(0)}` });
  }
  // Same proportions everywhere: the panel is sized off the view height only.
  const heights = new Set(seen.map((s) => s.panel.split('x')[1]));
  CHECK(heights.size === 1, 'the panel height changes with the window shape', seen);
  console.log('   ' + seen.map((s) => `${s.shape} -> panel ${s.panel}`).join('  '));
});

SECTION('structure: the atlas art replaced the hand-drawn buttons, and nothing else moved');
RUN('structure', () => {
  const player = fs.readFileSync(path.join(ROOT, 'PlayerController.js'), 'utf8');
  CHECK(!/pause/i.test(player), 'PlayerController.js now knows about the pause menu');
  const menu = fs.readFileSync(path.join(ROOT, PAUSE_SCRIPT), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'MainHandler.js'), 'utf8');
  const start = menu.indexOf('function renderPause');
  const body = menu.slice(start, menu.indexOf('\n}\n', start));
  CHECK(start > -1, 'renderPause is gone');
  CHECK(!/app\.game\.[a-zA-Z]+ ?=/.test(body), 'the pause screen writes to the run',
    body.match(/app\.game\.[a-zA-Z]+ ?=/g));
  CHECK(!/updateCameraY|updateGame|physicsStep|resolveGameCollisions/.test(body),
    'the pause screen drives gameplay or the camera');
  // The camera follow is still the config-driven one verify_camera.js pins.
  const camStart = src.indexOf('function updateCameraY');
  const camera = src.slice(camStart, src.indexOf('\n}\n', camStart));
  CHECK(/AppConfig\.cameraVelocityLead/.test(camera) && /AppConfig\.cameraFollowRate/.test(camera),
    'the camera follow lost its AppConfig tuning');

  // No hand-drawn stand-in survives underneath the real sprites.
  const icon = menu.slice(menu.indexOf('function pauseIconButton'), menu.indexOf('function pauseProgressRow'));
  CHECK(!/pauseGlyph/.test(menu), 'the hand-drawn button glyphs are still in the file');
  CHECK(!/createLinearGradient|createRadialGradient|\.arc\(/.test(icon),
    'pauseIconButton still paints a button by hand', icon);
  CHECK(!/bezierCurveTo/.test(menu), 'the hand-drawn practice arrow is still there');
  // The gear is a shipped sprite too: the corner button blits GJ_optionsBtn instead
  // of stroking a cog by hand.
  const gearStart = menu.indexOf('function drawPauseGear');
  const gearFn = menu.slice(gearStart, menu.indexOf('\n}\n', gearStart));
  CHECK(gearFn.includes('uiAssets.frames.gear'), 'the gear is not bound to the atlas sprite');
  CHECK(!/\.arc\(|#55d95b|teeth/.test(gearFn), 'the gear is still painted by hand', gearFn);
  // The build readout is a probe, not an overlay: it reports to the console and
  // window.__pauseLayout, and paints nothing over the panel.
  const probeStart = menu.indexOf('function reportPauseLayout');
  const probeFn = menu.slice(probeStart, menu.indexOf('\n}\n', probeStart));
  CHECK(!/ctx\.|fillRect|fillText/.test(probeFn), 'the readout bar is painted again', probeFn);
  CHECK(/window\.__pauseLayout = info/.test(probeFn),
    'the probe stopped reporting the build on window.__pauseLayout');
  for (const key of ['resume', 'practice', 'menu', 'replay']) {
    CHECK(body.includes(`uiAssets.frames.${key}`), `renderPause no longer uses the ${key} sprite`);
  }
  CHECK(body.includes('drawPauseGear('), 'renderPause no longer draws the gear sprite');
  CHECK(body.includes('pausePracticeSign('), 'renderPause no longer draws the sign sprite');
  CHECK(menu.includes('uiAssets.frames.practiceSign'),
    'the sign is not bound to the Practice Mode sprite');
  // The old giant layout is gone for good.
  for (const gone of ["'PAUSED'", "'RESUME'", "'RESTART'", "'MENU'"]) {
    CHECK(!body.includes(gone), `the old ${gone} layout is back in renderPause`, gone);
  }
});

// =========================================================================
// One audio path settles on a promise: when the browser refuses play(), the code
// re-arms the first-gesture listeners from the promise's catch. Node runs queued
// microtasks as soon as the synchronous pass lets go, so the last section waits for
// them before it looks.
async function finish() {
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  await flush();

  SECTION('a refused play() re-arms the unlock instead of giving up');
  try {
    const count = (type) => (winListeners.get(type) || []).length;
    E("app.game = null; setScreen('menu'); app.audioUnlocked = false; pauseMenuMusic();");
    E('armAudioUnlock()');
    const armedCount = count('pointerdown');

    // A browser that blocks playback refuses the loop, but the gesture still counts as
    // the unlock, and the refusal is swallowed rather than thrown at the console.
    AudioStub.refuse = true;
    fire(winListeners, 'pointerdown', {});
    CHECK(E('app.audioUnlocked'), 'the first gesture did not unlock the audio');
    CHECK(E('app.menuMusic.paused'), 'the loop started even though playback was refused');
    CHECK(count('pointerdown') === armedCount - 1,
      'the one-shot listener stayed armed', count('pointerdown'));

    // The refusal has settled by now, so the catch has re-armed: the next gesture is
    // what actually brings the loop in.
    await flush();
    CHECK(count('pointerdown') === armedCount,
      'a refused unlock was not re-armed for the next gesture', count('pointerdown'));
    AudioStub.refuse = false;
    fire(winListeners, 'pointerdown', {});
    CHECK(!E('app.menuMusic.paused'), 'the next gesture did not start the refused loop');
  } catch (err) {
    failures.push(`refused threw: ${err && err.message ? err.message : err}`);
    if (process.env.PAUSE_TRACE) console.log(err && err.stack);
  }

  console.log('');
  if (failures.length === 0) {
    console.log(`PAUSE HARNESS OK — ${checks} checks passed`);
    process.exit(0);
  }
  console.log(`${checks - failures.length} / ${checks} checks passed — ${failures.length} failed:`);
  for (const f of failures.slice(0, 60)) console.log(`  x ${f}`);
  if (failures.length > 60) console.log(`  ... and ${failures.length - 60} more`);
  process.exit(1);
}

finish();

