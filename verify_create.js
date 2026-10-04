// verify_create.js — headless harness for the Lunar-Dash level editor.
//
// The editor's contract is "what you draw is what exports": palette -> place ->
// export -> import -> playtest -> autosave, driven entirely by the buttons each
// frame registers and the keyboard shortcuts the README documents.
//
// It runs the real game scripts in a Node vm with the DOM stubbed out, and it
// reads the shipped .plist atlases so every sprite name the UI asks for is
// checked against the art that actually ships.
//
// Usage: node verify_create.js [project-root]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// The harness lives in the project root, next to the scripts it loads; pass a
// path argument to run it against a checkout somewhere else. Subfolders mirror the
// <script src> order in index.html.
const ROOT = path.resolve(process.argv[2] || __dirname);
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
  }
}
// Async sections are chained so they run in order, after every synchronous
// section has finished (the harness is otherwise single-turn).
let asyncChain = Promise.resolve();
function RUNASYNC(name, fn) {
  asyncChain = asyncChain.then(() => fn()).catch((err) => {
    failures.push(`${name} threw: ${err && err.message ? err.message : err}`);
  });
  return asyncChain;
}

// -------------------- Shipped atlas frames --------------------
// frame name -> its real spriteSize, read straight out of the .plist files, so
// the stubbed Sheet answers exactly like the browser one about the art.
const frameSizes = new Map();
(function readAtlases() {
  const dir = path.join(ROOT, 'Images/MenuImgs');
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.plist')) continue;
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const match of text.matchAll(/<key>([^<]+\.png)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g)) {
      const size = /<key>spriteSize<\/key>\s*<string>\{(\d+),(\d+)\}<\/string>/.exec(match[2]);
      if (size) frameSizes.set(match[1], { w: Number(size[1]), h: Number(size[2]) });
    }
  }
})();

// -------------------- Canvas / DOM stubs --------------------
function makeCtx(context) {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: context,
    measureText: () => ({ width: 8 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  };
  return new Proxy(target, {
    get(t, key) { return key in t ? t[key] : () => {}; },
    set(t, key, value) { t[key] = value; return true; },
    has: () => true,
  });
}

const canvas = {
  width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
  style: {},
  addEventListener() {}, removeEventListener() {},
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
    createElement: (tag) => (tag === 'canvas'
      ? { ...canvas, ...makeElement('canvas'), getContext: () => ctxStub }
      : makeElement(tag)),
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
  },
  promptValue: null,
  confirmValue: true,
  prompt() { return this.promptValue; },
  confirm() { return this.confirmValue; },
  // The stubbed atlas: it knows every frame the real .plists ship, and nothing
  // else — so a typo'd sprite name in Data.js shows up as a placeholder button.
  sheetStub: {
    has: (frame) => frameSizes.has(frame),
    size: (frame, scale = 1) => {
      const s = frameSizes.get(frame) || { w: 64, h: 64 };
      return { w: s.w * scale, h: s.h * scale };
    },
    draw: () => {},
  },
  ctxStub,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const problems = [];
vm.createContext(sandbox);
for (const file of SCRIPTS) {
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  } catch (err) {
    problems.push(`${file}: ${err && err.message ? err.message : err}`);
  }
}

const E = (code) => vm.runInContext(code, sandbox);

if (problems.length === 0) {
  // Wire the aliases boot() would normally set up, and hand the editor a frame.
  E(`
    app.canvas = document.getElementById('stage-canvas');
    app.scale = 1;
    ctx = ctxStub;
    app.viewWidth = 1280;
    app.viewHeight = 720;
    AppConfig.menuViewHeight = 720;
    AppConfig.viewHeight = 720;
    const __font = { draw() {}, scaleForCap() { return 1; } };
    app.resources.fonts.big = __font;
    app.resources.fonts.gold = __font;
    app.resources.sheets.game = sheetStub;
    app.resources.sheets.launch = sheetStub;
    app.resources.sheets.blocks = sheetStub;
    app.resources.sheets.blocks2 = sheetStub;
    app.resources.images.background = null;
    this.__lastLevel = null;
    this.__realBeginGameplay = beginGameplay;
    beginGameplay = (level) => { this.__lastLevel = level; };
    true;
  `);
}
// -------------------- Bridge helpers --------------------
function frame() { E('render()'); }
function openEditor() { E('openCreateScreen()'); frame(); }
function buttonIds() { return E('app.buttons.map((b) => b.id)'); }
function has(id) { return buttonIds().indexOf(id) !== -1; }
function buttonRect(id) {
  const rects = E(`app.buttons.filter((b) => b.id === ${JSON.stringify(id)})
    .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))`);
  return rects.length ? rects[rects.length - 1] : null;
}
function click(id) {
  const ok = E(`(() => {
    for (let i = app.buttons.length - 1; i >= 0; i--) {
      if (app.buttons[i].id === ${JSON.stringify(id)}) { app.buttons[i].action(); return true; }
    }
    return false;
  })()`);
  if (!ok) throw new Error(`no button on screen with id ${id}`);
  frame();
  return true;
}
function tapTile(tx, ty) {
  const rect = E(`createCellRect(${tx}, ${ty})`);
  E(`(() => {
    app.pointer.x = ${rect.x + rect.w / 2};
    app.pointer.y = ${rect.y + rect.h / 2};
    onPointerDown({ clientX: app.pointer.x, clientY: app.pointer.y });
  })()`);
}
function dragTo(tx, ty) {
  const rect = E(`createCellRect(${tx}, ${ty})`);
  E(`onPointerMove({ clientX: ${rect.x + rect.w / 2}, clientY: ${rect.y + rect.h / 2} })`);
}
function resetEditor() {
  E(`
    createScreen.cells = new Map();
    createScreen.undo.length = 0;
    createScreen.redo.length = 0;
    createScreen.page = 0;
    createScreen.panel = null;
    createScreen.overlay = null;
    createScreen.eraseMode = false;
    createScreen.swipe = true;
    createScreen.lastKey = null;
    createScreen.dragging = false;
    createScreen.camX = 0;
    createScreen.name = 'My Level';
    createScreen.header = null;
    createScreen.sizeW = 1;
    createScreen.sizeH = 1;
    createScreen.rows = CREATE_ROWS;
    app.pointer.x = -1;
    app.pointer.y = -1;
    localStorage.removeItem('lunardash.create.draft.v1');
    true;
  `);
}
function setView(w, h) { E(`app.viewWidth = ${w}; app.viewHeight = ${h}; AppConfig.viewHeight = ${h}; true;`); }
function layout() { return E('createEditorLayout()'); }
function palette() { return E('createPalette().map((e) => ({ type: e.type, kind: e.kind, label: e.label }))'); }
function entryId(entry) { return `${entry.type}|${entry.kind || ''}`; }
function cells() { return E('Array.from(createScreen.cells.entries())'); }
function cellCount() { return E('createScreen.cells.size'); }
function key(code, extra = '') {
  const prevented = E(`(() => {
    const event = { code: ${JSON.stringify(code)}, repeat: false, ctrlKey: false, metaKey: false,
                    shiftKey: false, altKey: false, defaultPrevented: false,
                    preventDefault() { event.defaultPrevented = true; }${extra} };
    onKeyDown(event);
    return event.defaultPrevented;
  })()`);
  // The game loop renders straight after a key, so the buttons a shortcut opens
  // (the SIZE panel, a sheet) are registered by the next frame.
  frame();
  return prevented;
}
function exported() { return JSON.parse(E('JSON.stringify(createExportData())')); }
function message() { return E('createScreen.message'); }
function state() {
  return E(`({
    screen: app.screen, eraseMode: createScreen.eraseMode, swipe: createScreen.swipe,
    panel: createScreen.panel, overlay: createScreen.overlay, page: createScreen.page,
    camX: createScreen.camX, name: createScreen.name, parts: createScreen.cells.size,
    sizeW: createScreen.sizeW, sizeH: createScreen.sizeH,
    undo: createScreen.undo.length, redo: createScreen.redo.length,
  })`);
}
function draft() {
  const raw = store.get('lunardash.create.draft.v1');
  return raw ? JSON.parse(raw) : null;
}
// ============================================================
SECTION('harness bootstrap');
CHECK(problems.length === 0, 'every game script loads in the sandbox', problems);
CHECK(frameSizes.size > 3000, 'shipped atlases parsed for frame sizes', frameSizes.size);

SECTION('GD 2.1 chrome sprites resolve to real art');
RUN('uiAssets.frames all exist in the atlases', () => {
  const map = JSON.parse(E('JSON.stringify(uiAssets.frames)'));
  for (const [key, frame] of Object.entries(map)) {
    CHECK(frameSizes.has(frame), `uiAssets.frames.${key} -> ${frame}`, frame);
  }
  for (const key of ['editBuild', 'editBuildOn', 'editDelete', 'editDeleteOn', 'editEdit',
    'editEditOn', 'editSwipe', 'editLeft', 'editRight', 'undo', 'redo', 'pauseEditor',
    'playEditor', 'gear', 'topBar']) {
    CHECK(typeof map[key] === 'string' && frameSizes.has(map[key]), `editor frame "${key}" is wired to real art`, map[key]);
  }
});

// ============================================================
SECTION('editor layout fits every window shape');
const WINDOWS = [
  [1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [1600, 900], [1440, 900],
  [1366, 768], [1120, 630], [1024, 768], [960, 540], [800, 600], [640, 480],
  [1280, 1024], [1080, 1920],
];
RUN('top bar / grid / bottom bar never overlap or clip', () => {
  for (const [w, h] of WINDOWS) {
    setView(w, h);
    const L = layout();
    const tag = `${w}x${h}`;
    CHECK(L.topH > 0 && L.topH + 4 < L.barY, `${tag}: top bar above bottom bar`, [L.topH, L.barY]);
    CHECK(L.barY + L.bottomH === h, `${tag}: bottom bar ends at the screen edge`, [L.barY, L.bottomH, h]);
    CHECK(L.cell >= 12 && L.gridH > 0, `${tag}: tiles stay legible`, [L.cell, L.gridH]);
    CHECK(L.gridX >= 0 && L.gridX + L.gridW <= w, `${tag}: grid fits the width`, [L.gridX, L.gridW, w]);
    CHECK(L.gridY >= L.bandY && L.gridY + L.gridH <= L.bandY + L.bandH + 1,
      `${tag}: grid inside its band`, [L.gridY, L.gridH, L.bandY, L.bandH]);
    CHECK(L.tabsX >= 0 && L.tabsX + L.tabW <= w, `${tag}: tab stack fits`, [L.tabsX, L.tabW, w]);
    CHECK(L.tabsY >= L.barY && L.tabsY + L.tabH * 4 + L.gap * 3 <= h + 1,
      `${tag}: tabs inside the bottom bar`, [L.tabsY, L.tabH]);
    CHECK(L.palLeft > L.tabsX + L.tabW, `${tag}: palette clears the tabs`, [L.palLeft, L.tabsX + L.tabW]);
    CHECK(L.palLeft < L.palRight, `${tag}: palette has width`, [L.palLeft, L.palRight]);
    CHECK(L.palRight + L.arrowW + 4 <= L.playX - L.playW / 2 + 1,
      `${tag}: palette clears the play button`, [L.palRight, L.playX]);
    CHECK(L.chipW > 0 && L.chipH > 0 && L.perRow >= 1 && L.capacity >= 1,
      `${tag}: a page holds a workable number of chips`, [L.chipW, L.chipH, L.perRow]);
    CHECK(L.palY >= L.barY && L.palY + L.rowsH <= h, `${tag}: chip rows inside the bar`, [L.palY, L.rowsH, h]);
  }
  setView(1280, 720);
});
// ============================================================
SECTION('paged palette');
RUN('every chip on every page stays inside the strip', () => {
  for (const [w, h] of [[1280, 720], [800, 600], [1920, 1080], [640, 480]]) {
    setView(w, h);
    resetEditor();
    const L = layout();
    const pages = E('createPaletteLayout().pages');
    CHECK(pages >= 1, `${w}x${h}: at least one page`, pages);
    for (let page = 0; page < pages; page++) {
      E(`createScreen.page = ${page}; true;`);
      const rects = E(`(() => {
        const L = createEditorLayout();
        const info = createPaletteLayout();
        const palette = createPalette();
        const out = [];
        for (let i = info.pageStart; i < info.pageEnd; i++) {
          const slot = i - info.pageStart;
          out.push({
            x: L.palLeft + (slot % L.perRow) * (L.chipW + L.gap),
            y: L.palY + Math.max(0, Math.round((L.palH - L.rowsH) / 2)) + Math.floor(slot / L.perRow) * (L.chipH + L.gap),
            w: L.chipW, h: L.chipH,
            id: palette[i].type + '|' + (palette[i].kind || ''),
          });
        }
        return out;
      })()`);
      for (const r of rects) {
        CHECK(r.x >= L.palLeft - 1 && r.x + r.w <= L.palRight + 1,
          `${w}x${h} p${page + 1}: chip ${r.id} inside the strip`, r);
        CHECK(r.y >= L.barY && r.y + r.h <= h,
          `${w}x${h} p${page + 1}: chip ${r.id} inside the bottom bar`, r);
      }
    }
  }
  setView(1280, 720);
});

RUN('every catalog part is reachable through the strip', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();
  const parts = palette();
  const seen = new Set();
  const pages = E('createPaletteLayout().pages');
  for (let page = 0; page < pages; page++) {
    E(`createScreen.page = ${page}; true;`);
    frame();
    for (const id of buttonIds()) {
      const text = String(id);
      if (text.startsWith('create-part-')) seen.add(text.slice('create-part-'.length));
    }
  }
  for (const entry of parts) {
    CHECK(seen.has(entryId(entry)), `chip drawn for ${entryId(entry)}`, entryId(entry));
  }
  CHECK(seen.size === parts.length, 'no stray or duplicated chips across pages', [seen.size, parts.length]);
  CHECK(pages >= 2, 'the strip really does page', pages);
  resetEditor();
});

// ============================================================
SECTION('2.1 chrome is on screen');
RUN('top bar and bottom bar controls register', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();
  for (const id of ['create-pause', 'create-undo', 'create-redo', 'create-name', 'create-gear',
    'create-build', 'create-erase', 'create-edit', 'create-swipe',
    'create-page-prev', 'create-page-next', 'create-play', 'create-left', 'create-right']) {
    CHECK(has(id), `button ${id} is drawn`, has(id));
  }
  const cellIds = buttonIds().filter((id) => String(id).startsWith('create-cell-'));
  CHECK(cellIds.length > 100, 'the grid registers a tap target per tile', cellIds.length);
  CHECK(!has('create-back'), 'the old toolbar back button is gone', has('create-back'));
});

RUN('grid tap targets line up with their tiles', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();
  for (const [tx, ty] of [[0, 0], [3, 7], [10, 13]]) {
    const rect = buttonRect(`create-cell-${tx},${ty}`);
    const tile = E(`createCellRect(${tx}, ${ty})`);
    CHECK(Boolean(rect), `tap target for tile ${tx},${ty} exists`);
    if (rect) {
      CHECK(Math.abs(rect.x - tile.x) < 0.01 && Math.abs(rect.y - tile.y) < 0.01,
        `tap target ${tx},${ty} matches the drawn tile`, [rect, tile]);
      CHECK(Math.abs(rect.w - tile.w) < 0.01, `tap target ${tx},${ty} is one tile wide`, rect.w);
    }
  }
});
// ============================================================
SECTION('build: every catalog part chips in and places');
RUN('each chip selects its part and the tap places it', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();
  const parts = palette();
  const capacity = E('createEditorLayout().capacity');
  parts.forEach((entry, i) => {
    const id = entryId(entry);
    E(`createScreen.page = ${Math.floor(i / capacity)}; createScreen.cells.clear();
       createScreen.lastKey = null; createScreen.dragging = false; true;`);
    frame();
    click(`create-part-${id}`);
    CHECK(state().eraseMode === false, `${id}: chip selection leaves delete mode`);
    CHECK(E('createEntryId(createScreen)') === id, `${id}: chip selects that part`,
      E('createEntryId(createScreen)'));

    tapTile(4, 3);
    E('createScreen.dragging = false; true;');
    const placed = E('createScreen.cells.get("4,3")');
    CHECK(Boolean(placed), `${id}: tap places a part`);
    if (placed) {
      CHECK(placed.t === entry.type, `${id}: right part type`, placed.t);
      if (entry.type === 'portal') {
        CHECK((placed.mode || null) === entry.kind, `${id}: portal mode stored`, placed.mode);
      } else if (entry.kind) {
        CHECK(placed.kind === entry.kind, `${id}: kind stored`, placed.kind);
      }
    }
    const object = exported().objects.find((o) => o.x === 4 && o.y === 3);
    CHECK(Boolean(object), `${id}: the placed part exports`);
  });
  resetEditor();
});

RUN('SIZE only rides on the types that read w/h', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();
  E('createScreen.sizeW = 3; createScreen.sizeH = 2; true;');
  const sized = ['block', 'spike', 'platform'];
  const capacity = E('createEditorLayout().capacity');
  palette().forEach((entry, i) => {
    const id = entryId(entry);
    E(`createScreen.page = ${Math.floor(i / capacity)}; createScreen.cells.clear(); true;`);
    frame();
    click(`create-part-${id}`);
    tapTile(6, 4);
    E('createScreen.dragging = false; true;');
    const placed = E('createScreen.cells.get("6,4")');
    if (placed) {
      if (sized.includes(entry.type)) {
        CHECK(placed.w === 3 && placed.h === 2, `${id}: sized part keeps the footprint`, placed);
      } else {
        CHECK(placed.w === undefined && placed.h === undefined, `${id}: unsized part drops w/h`, placed);
      }
    }
  });
  resetEditor();
});
// ============================================================
SECTION('delete tab, swipe gating and undo/redo');
RUN('BUILD / DELETE / SWIPE behave like 2.1 tabs', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();

  click('create-build');
  tapTile(2, 2);
  E('createScreen.dragging = false; true;');
  dragTo(3, 2);                                   // a drag with no press first
  CHECK(cellCount() === 1, 'a stray drag paints nothing', cellCount());

  tapTile(5, 2);                                  // press starts a stroke…
  dragTo(6, 2);
  dragTo(7, 2);                                   // …and the drags continue it
  E('createScreen.dragging = false; true;');
  CHECK(cellCount() === 4, 'swipe on: press + drag paints a whole stroke', cellCount());

  click('create-swipe');
  CHECK(state().swipe === false, 'SWIPE tab switches swipe off');
  tapTile(2, 4);
  E('createScreen.dragging = false; true;');
  dragTo(3, 4);
  dragTo(4, 4);
  E('createScreen.dragging = false; true;');
  CHECK(cellCount() === 5, 'swipe off: only the tap places a part', cellCount());
  click('create-swipe');
  CHECK(state().swipe === true, 'SWIPE tab switches swipe back on');

  click('create-undo');                           // the (2,4) tap is one stroke
  CHECK(cellCount() === 4, 'UNDO removes the last stroke', cellCount());
  click('create-redo');
  CHECK(cellCount() === 5, 'REDO puts it back', cellCount());
  click('create-undo');
  CHECK(cellCount() === 4, 'UNDO again', cellCount());

  click('create-erase');
  CHECK(state().eraseMode === true, 'DELETE tab arms erase mode');
  tapTile(5, 2);
  E('createScreen.dragging = false; true;');
  CHECK(!E('createScreen.cells.has("5,2")'), 'DELETE removes the part under the tap');
  click('create-undo');
  CHECK(E('createScreen.cells.has("5,2")'), 'UNDO brings a deleted part back');
  click('create-build');
  CHECK(state().eraseMode === false, 'BUILD tab leaves erase mode');

  const parts = cellCount();
  click('create-gear');
  click('create-clear');
  CHECK(cellCount() === 0, 'CLEAR empties the grid', cellCount());
  click('create-settings-close');
  click('create-undo');
  CHECK(cellCount() === parts, 'CLEAR is a single undo step', [parts, cellCount()]);
  resetEditor();
});

RUN('undo/redo stacks behave like an editor', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();
  E(`for (let i = 0; i < 60; i++) { createScreen.cells.set(i + ',0', { t: 'block' }); createPushUndo(); } true;`);
  CHECK(E('createScreen.undo.length') === 48, 'undo stack capped at 48', E('createScreen.undo.length'));
  click('create-undo');
  CHECK(state().redo === 1, 'UNDO feeds the redo stack', state().redo);
  click('create-build');
  tapTile(1, 1);
  E('createScreen.dragging = false; true;');
  CHECK(state().redo === 0, 'a new edit clears the redo trail', state().redo);
  click('create-redo');
  CHECK(/Nothing to redo/.test(message()), 'REDO reports an empty redo stack', message());
  resetEditor();
  openEditor();
  click('create-undo');
  CHECK(/Nothing to undo/.test(message()), 'UNDO reports an empty undo stack', message());
  resetEditor();
});
// ============================================================
SECTION('sheets, names and the parts panel');
RUN('pause and settings sheets', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();

  click('create-pause');
  CHECK(state().overlay === 'pause', 'the pause button opens the pause sheet', state().overlay);
  CHECK(has('create-resume') && has('create-exit'), 'pause offers RESUME and SAVE & EXIT');
  CHECK(!buttonIds().some((id) => String(id).startsWith('create-cell-')), 'a sheet swallows grid taps');
  click('create-resume');
  CHECK(state().overlay === null, 'RESUME closes the sheet', state().overlay);

  click('create-gear');
  CHECK(state().overlay === 'settings', 'the gear opens level settings', state().overlay);
  for (const id of ['create-set-name', 'create-set-size', 'create-import', 'create-export',
    'create-clear', 'create-settings-close']) {
    CHECK(has(id), `settings offers ${id}`, has(id));
  }
  CHECK(!buttonIds().some((id) => String(id).startsWith('create-cell-')), 'settings swallows grid taps');
  const before = E('createSizeLabel()');
  click('create-set-size');
  CHECK(E('createSizeLabel()') !== before, 'settings SIZE cycles the footprint', E('createSizeLabel()'));

  // Nothing under the sheet is reachable, but the sheet's own buttons are.
  const under = E(`(() => {
    const b = buttonAt(120, 40);
    return b ? b.id : null;
  })()`);
  CHECK(under === 'create-sheet-shield', 'the sheet blocks the bars underneath', under);
  CHECK(has('create-settings-close'), 'the sheet keeps its own buttons live');
  click('create-settings-close');
  CHECK(state().overlay === null, 'CLOSE shuts the sheet', state().overlay);
  CHECK(buttonIds().some((id) => String(id).startsWith('create-cell-')), 'the grid comes back after CLOSE');

  sandbox.promptValue = 'Sky High';
  click('create-name');
  CHECK(state().name === 'Sky High', 'the top-bar name button renames the level', state().name);
  sandbox.promptValue = null;

  key('KeyE');
  CHECK(has('create-size') && has('create-size-prev') && has('create-size-next'),
    'the SIZE panel draws its controls', buttonIds().filter((id) => String(id).startsWith('create-size')));
  resetEditor();
});

RUN('EXPORT downloads MainLevelSetup-shaped JSON', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();
  E('createScreen.name = "My Cool Level!"; true;');
  CHECK(E('createExportFilename()') === 'MyCoolLevel.json', 'the file is named after the level', E('createExportFilename()'));

  click('create-build');
  tapTile(4, 2);
  tapTile(6, 2);
  E('createScreen.dragging = false; true;');
  const data = exported();
  const keys = Object.keys(data);
  for (const key of ['name', 'difficulty', 'modes', 'song', 'lengthPx', 'backgroundCol',
    'ground1Col', 'ground2Col', 'lineCol', 'objects', 'triggers', 'partTheme']) {
    CHECK(keys.includes(key), `export carries ${key}`, keys);
  }
  CHECK(data.modes[0] === 'Cube', 'the Cube always opens the level', data.modes);
  CHECK(data.objects.length === 2, 'both parts export', data.objects.length);
  CHECK(data.objects[0].x <= data.objects[1].x, 'objects export left to right', data.objects);
  CHECK(data.lengthPx > 0, 'the level gets a length', data.lengthPx);
  resetEditor();
});

// ============================================================
SECTION('import round-trips the shipped levels');
RUNASYNC('every MainLevelSetup file survives import -> export', async () => {
  const dir = path.join(ROOT, 'MainLevelSetup');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  CHECK(files.length >= 5, 'the shipped levels are on disk', files.length);
  const keyOf = (o) => [o.t, o.x, o.y, o.kind || '', o.mode || '', o.w || 1, o.h || 1].join('|');

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    resetEditor();
    sandbox.importText = fs.readFileSync(path.join(dir, file), 'utf8');
    if (file === files[0]) {
      // A broken file must be reported, never silently half-imported.
      sandbox.importText = 'not json at all';
      await E(`createImportJsonFile({ name: 'broken.json', text: async () => importText })`);
      CHECK(/valid JSON/.test(message()), 'invalid JSON is reported', message());
      sandbox.importText = JSON.stringify({ nope: true });
      await E(`createImportJsonFile({ name: 'noObjects.json', text: async () => importText })`);
      CHECK(/objects/.test(message()), 'a file with no objects array is reported', message());
      CHECK(cellCount() === 0, 'a bad file never lands on the grid', cellCount());
      sandbox.importText = fs.readFileSync(path.join(dir, file), 'utf8');
    }

    await E(`createImportJsonFile({ name: ${JSON.stringify(file)}, text: async () => importText })`);
    const st = state();
    CHECK(st.parts === raw.objects.length, `${file}: every object lands on the grid`, [st.parts, raw.objects.length]);
    CHECK(st.name === raw.name, `${file}: the level name is adopted`, st.name);
    CHECK(E('createScreen.header.song') === raw.song, `${file}: the header is adopted`, E('createScreen.header.song'));

    const out = exported();
    CHECK(out.objects.length === raw.objects.length, `${file}: export keeps every object`, out.objects.length);
    CHECK(out.song === raw.song, `${file}: export keeps the song`, out.song);
    CHECK(Math.abs(out.lengthPx - raw.lengthPx) < 0.001, `${file}: export keeps the length`, [out.lengthPx, raw.lengthPx]);
    CHECK(out.difficulty === raw.difficulty, `${file}: export keeps the difficulty`, [out.difficulty, raw.difficulty]);
    const a = raw.objects.map(keyOf).sort();
    const b = out.objects.map(keyOf).sort();
    let same = a.length === b.length;
    if (same) for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { same = false; break; }
    CHECK(same, `${file}: every object survives the round trip (type, tile, kind, footprint)`, [a.length, b.length]);
  }
  resetEditor();
});
// ============================================================
SECTION('playtest and autosave');
RUN('TEST plays the grid through the real pipeline', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();
  E('this.__lastLevel = null; true;');
  click('create-play');
  CHECK(/Place some parts first/.test(message()), 'an empty grid refuses to playtest', message());

  click('create-build');
  tapTile(3, 2);
  E('createScreen.dragging = false; true;');
  tapTile(4, 2);
  E('createScreen.dragging = false; true;');
  click('create-play');
  const info = JSON.parse(E(`this.__lastLevel ? JSON.stringify({
    id: __lastLevel.id, draft: __lastLevel.draft, name: __lastLevel.name,
    objects: __lastLevel.objects.length, modes: __lastLevel.modes,
    length: __lastLevel.length,
  }) : 'null'`));
  CHECK(Boolean(info), 'playtest hands a level to beginGameplay', info);
  if (info) {
    CHECK(info.id === 'draft', 'the playtest level is a draft', info.id);
    CHECK(info.draft === true, 'the draft flag keeps the run out of the level select', info.draft);
    CHECK(info.objects === 2, 'the grid objects reach gameplay', info.objects);
    CHECK(info.modes[0] === 'Cube', 'the Cube always opens a playtest', info.modes);
    CHECK(info.length > 0, 'the playtest gets a length', info.length);
  }
  resetEditor();
});

RUN('the draft autosaves, restores and flushes on Escape', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();
  click('create-build');
  tapTile(3, 3);
  E('createScreen.dragging = false; createSaveDraft(); true;');
  const saved = draft();
  CHECK(Boolean(saved), 'SAVE writes the draft key', saved);
  CHECK(saved && saved.cells.length === 1, 'the draft carries the grid', saved && saved.cells.length);
  CHECK(saved && saved.name === 'My Level', 'the draft carries the name', saved && saved.name);
  CHECK(saved && Array.isArray(saved.size) && saved.size.join('x') === '1x1', 'the draft carries the size', saved && saved.size);

  E(`
    createScreen.cells = new Map();
    createScreen.name = 'Discarded';
    createScreen.restored = false;
    openCreateScreen();
    true;
  `);
  CHECK(cellCount() === 1, 'reopening the editor restores the draft', cellCount());
  CHECK(E('createScreen.cells.has("3,3")'), 'the restored part is where it was saved');

  E('localStorage.removeItem("lunardash.create.draft.v1"); true;');
  key('Escape');
  CHECK(E('app.screen') === 'menu', 'Escape leaves the editor', E('app.screen'));
  CHECK(Boolean(draft()), 'Escape flushed the autosave', draft());
  CHECK(draft().cells.length === 1, 'the flushed draft matches the grid', draft().cells.length);

  openEditor();
  click('create-pause');
  key('Escape');
  CHECK(state().overlay === null && E('app.screen') === 'create', 'Escape closes the sheet before leaving', state());
  key('Escape');
  CHECK(E('app.screen') === 'menu', 'a second Escape leaves the editor', E('app.screen'));
  resetEditor();
});
// ============================================================
SECTION('keyboard shortcuts');
RUN('every documented editor shortcut works', () => {
  setView(1280, 720);
  resetEditor();
  openEditor();

  click('create-build');
  tapTile(3, 3);
  E('createScreen.dragging = false; true;');
  const withOne = cellCount();
  CHECK(key('KeyZ') === true, 'Z is consumed by the editor');
  CHECK(cellCount() === withOne - 1, 'Z undoes', cellCount());
  key('KeyY');
  CHECK(cellCount() === withOne, 'Y redoes', cellCount());
  CHECK(key('KeyZ', ', ctrlKey: true') === true, 'Ctrl+Z is consumed');
  CHECK(cellCount() === withOne - 1, 'Ctrl+Z undoes', cellCount());
  key('KeyZ', ', ctrlKey: true, shiftKey: true');
  CHECK(cellCount() === withOne, 'Ctrl+Shift+Z redoes', cellCount());

  key('KeyD');
  CHECK(state().eraseMode === true, 'D arms delete mode', state().eraseMode);
  key('Delete');
  CHECK(state().eraseMode === true, 'Delete arms delete mode', state().eraseMode);
  key('KeyB');
  CHECK(state().eraseMode === false, 'B goes back to build', state().eraseMode);
  const swipe = state().swipe;
  key('KeyS');
  CHECK(state().swipe === !swipe, 'S toggles swipe', state().swipe);
  key('KeyS');
  key('KeyE');
  CHECK(state().panel === 'parts', 'E opens the SIZE panel', state().panel);
  CHECK(has('create-size'), 'the SIZE panel registers its controls', has('create-size'));
  key('KeyE');
  CHECK(state().panel === null, 'E closes the SIZE panel', state().panel);

  key('ArrowRight');
  CHECK(state().camX === 4, 'ArrowRight pans 4 tiles', state().camX);
  key('ArrowLeft');
  key('ArrowLeft');
  CHECK(state().camX === 0, 'the camera stops at x = 0', state().camX);
  key('ArrowRight', ', shiftKey: true');
  CHECK(state().camX === 1, 'Shift+ArrowRight nudge-pans one tile', state().camX);

  const first = E('createEntryId(createScreen)');
  key('ArrowDown');
  CHECK(E('createEntryId(createScreen)') !== first, 'ArrowDown cycles the part', E('createEntryId(createScreen)'));
  key('ArrowUp');
  CHECK(E('createEntryId(createScreen)') === first, 'ArrowUp cycles back', E('createEntryId(createScreen)'));

  key('Period');
  CHECK(state().page >= 1, 'Period turns the palette page', state().page);
  key('Comma');
  CHECK(state().page === 0, 'Comma turns it back', state().page);
  key('Digit2');
  CHECK(state().page >= 1, '2 jumps to the second page', state().page);
  key('Digit1');
  CHECK(state().page === 0, '1 jumps back to the first page', state().page);

  const size = E('createSizeLabel()');
  key('Equal');
  CHECK(E('createSizeLabel()') !== size, '+ cycles the footprint', E('createSizeLabel()'));
  key('Minus');
  CHECK(E('createSizeLabel()') === size, '- cycles it back', E('createSizeLabel()'));

  key('KeyG');
  CHECK(state().overlay === 'settings', 'G opens level settings', state().overlay);
  key('KeyG');
  CHECK(state().overlay === null, 'G closes them again', state().overlay);

  E('this.__lastLevel = null; true;');
  key('Space');
  CHECK(Boolean(E('this.__lastLevel')), 'Space playtests the grid');
  E('this.__lastLevel = null; true;');
  key('KeyT');
  CHECK(Boolean(E('this.__lastLevel')), 'T playtests the grid');
  E('this.__lastLevel = null; true;');
  key('Enter');
  CHECK(Boolean(E('this.__lastLevel')), 'Enter playtests the grid');

  sandbox.promptValue = 'Renamed';
  key('KeyN');
  CHECK(state().name === 'Renamed', 'N renames the level', state().name);
  sandbox.promptValue = null;
  resetEditor();
});

RUN('the editor shortcuts never leak into the menus', () => {
  setView(1280, 720);
  resetEditor();
  E('app.screen = "menu"; true;');
  CHECK(key('KeyZ') === false, 'Z is not consumed on the menu');
  CHECK(key('ArrowRight') === false, 'arrows are not consumed on the menu');
  CHECK(key('KeyD') === false, 'D is not consumed on the menu');
  key('Space');
  CHECK(E('app.screen') === 'levels', 'Space still opens the level select', E('app.screen'));
  E('app.screen = "create"; true;');
});
// ============================================================
// Report — the async sections have all run by now, so the totals are final.
asyncChain.then(() => {
  console.log('');
  if (failures.length === 0) {
    console.log(`CREATE HARNESS OK — ${checks} checks passed`);
    process.exit(0);
    return;
  }
  console.log(`${checks - failures.length} / ${checks} checks passed — ${failures.length} failed:`);
  for (const failure of failures.slice(0, 60)) console.log(`  x ${failure}`);
  if (failures.length > 60) console.log(`  ... and ${failures.length - 60} more`);
  process.exit(1);
});
