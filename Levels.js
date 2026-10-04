// Levels.js
// Depends on Data.js (mainLevels, getMainLevel, EntityTypes) — load Data.js first
//
// Coordinate convention used by every level file:
//   x = distance from the level start, in px
//   y = distance ABOVE the ground line, in px (0 = resting on the ground)
// MainHandler converts y into canvas space when it draws and collides.
//
// ============================ JSON levels ============================
// The five main levels are hand-authored in MainLevelSetup/*.json using a
// TILE grid (all coordinates in tiles — one tile is TILE px, just like GD's
// 30px grid). Levels.js fetches those files and converts them to px objects.
// Anything that fails to load falls back to the seeded procedural builder
// below, so the game never hard-crashes on a broken level file.
//
// JSON object schema (all numbers in TILES):
//   { "t": "block",    "x": 24, "y": 0, "w": 3, "h": 2 }
//   { "t": "spike",    "x": 40, "y": 0 }             (y = tiles above ground)
//   { "t": "platform", "x": 60, "y": 3, "w": 5 }     (land-on-top only)
//   { "t": "pad",      "x": 80, "y": 0 }
//   { "t": "orb",      "x": 90, "y": 3 }
//   { "t": "portal",   "x": 100, "y": 0, "mode": "Ship" }
//   { "t": "finish",   "x": 420 }
//
// Sprite selection (optional, per object) — resolved through BlockDefinitions:
//   "kind"    a catalog variant, e.g. "ice" spike, "brick" block, "red" orb
//   "variant" a family variant by number, e.g. 4 -> spike_04
//   "frame"   an exact atlas frame, e.g. "ring_02_001.png"
//   "sheet"   which atlas that frame lives in: "blocks" | "objects"
// See LEVEL_PARTS below for every part's default family/frame.
// JSON trigger schema (invisible in gameplay; the creation tab will show them):
//   { "t": "color", "x": 120, "channel": "bg", "color": "#287dff", "duration": 0.5 }
//   { "t": "move",  "x": 200, "dx": 10, "dy": 0, "duration": 2 }
//   { "t": "pulse", "x": 300, "color": "#ff66ff", "strength": 0.5 }
//
// Levels are still built with the same physics envelope in mind:
//   forward speed 380 px/s  -> 1 tile (30px) takes ~0.079s
//   cube jump 600 / gravity 2330 -> ~77px high (~2.6 tiles), ~196px long (~6.5 tiles)
// So: never put a wall higher than 2 tiles, and leave >= 10 tiles between hazards.

const TILE = 30;               // one grid cell — the cube is 30x30, so are blocks
const LEVEL_VIEW_HEIGHT = 320; // GD-exact: 480x320 design at 30px/unit = 10.67 tiles visible
const GROUND_LIFT = 90;        // px of ground strip below the ground line (GD ground strip)
const LEVEL_MIN_GAP = 300;     // never place two hazards closer than this

const BlockType = {
  BLOCK: 'block',       // solid; deadly from the sides, safe to land on top
  SPIKE: 'spike',       // deadly on any contact
  PLATFORM: 'platform', // solid, land on top only (never kills)
  PAD: 'pad',           // yellow boost pad — launches the player upward
  ORB: 'orb',           // tap while touching it for a mid-air boost
  PORTAL: 'portal',     // switches the player's mode
  FINISH: 'finish',     // end-of-level marker
};

const FIELD_HEIGHT = LEVEL_VIEW_HEIGHT - GROUND_LIFT; // px of playable height above the ground

// -------------------- Object builders --------------------
// Each returns a plain object so levels stay declarative and easy to diff.
// Every one of them runs through withPart(), so the sprite a builder needs comes
// from the catalog above rather than from a name written at the call site.
function block(x, y = 0, w = TILE, h = TILE, kind = null) {
  return withPart({ type: BlockType.BLOCK, x, y, w, h, kind });
}

function spike(x, y = 0, size = TILE, flip = false, kind = null) {
  return withPart({ type: BlockType.SPIKE, x, y, w: size, h: size, flip, kind });
}

function platform(x, y, w = TILE * 3, h = TILE / 2, kind = null) {
  return withPart({ type: BlockType.PLATFORM, x, y, w, h, kind });
}

// Transporter kinds (GD 2.1): yellow = medium jump, pink = small jump,
// red = big jump, blue = gravity flip. Orbs additionally: green = flip + jump.
const PAD_KINDS = {
  yellow: { boost: 900,  color: '#ffe66d' },
  pink:   { boost: 620,  color: '#ff9ee6' },
  red:    { boost: 1500, color: '#ff5a5a' },
  blue:   { flip: true,  color: '#5ce1ff' },
};
const ORB_KINDS = {
  yellow: { boost: 720,  color: '#ffe66d' },
  pink:   { boost: 480,  color: '#ff9ee6' },
  red:    { boost: 1150, color: '#ff5a5a' },
  blue:   { flip: true, boost: 480, color: '#5ce1ff' },
  green:  { flip: true, boost: 720, color: '#7bff8a' },
};

function pad(x, y = 0, kind = 'yellow') {
  return withPart({ type: BlockType.PAD, x, y, w: TILE * 2, h: TILE / 2, kind });
}

function orb(x, y, kind = 'yellow') {
  return withPart({ type: BlockType.ORB, x, y, w: TILE * 1.5, h: TILE * 1.5, kind });
}

// Form portals carry a mode; gravity portals flip the pull without changing it.
// The mode doubles as the catalog kind, so the portal sprite comes from
// LEVEL_PARTS just like every other part.
function portal(x, mode, y = 0) {
  return withPart({ type: BlockType.PORTAL, x, y, w: TILE, h: TILE * 3, mode });
}

const GRAVITY_PORTALS = new Set(['GravityUp', 'GravityDown']);

function finish(x) {
  // Tall enough to cover the whole playable field, so flying high over it
  // still counts as finishing the level.
  return withPart({ type: BlockType.FINISH, x, y: 0, w: TILE, h: FIELD_HEIGHT });
}

// -------------------- Part catalog --------------------
// Every object a level can place resolves to a sprite through this catalog.
// The catalog only says WHAT each part is (square / spike / ring / portal…);
// where that part actually lives is answered by BlockDefinitions.js, which has
// already classified every frame of both UHD atlases by family:
//
//   LEVEL_PARTS      -> { family, variant, frame, sheet, fit, anchor }
//   BlockDefinitions -> the real frame id + its atlas + its logical size
//
// `frame`/`sheet` double as the offline fallback: if BlockDefinitions never
// loads (or an atlas 404s) the renderer still blits the same frame from the
// same atlas, and if even that is missing it drops to the vector fallback
// every part already has. So the art is data-driven, and the game still runs
// with no art at all.
//
// `fit` tells the renderer how to scale a sprite inside its collision box:
//   tile    repeat the frame on the 30px grid (blocks, platforms)
//   contain fit the whole frame inside the box, aspect preserved (spikes, orbs)
//   height  fit by height and centre horizontally (portals)
// `anchor` is the point of the sprite that sticks to the box.
const PART_FIT = { TILE: 'tile', CONTAIN: 'contain', HEIGHT: 'height' };
const PART_ANCHOR = { CENTER: 'center', BOTTOM: 'bottomCenter' };

const LEVEL_PARTS = {
  // square_01 is GD's plain 30x30 block (120x120 UHD / 4). `kind` swaps the
  // texture without touching the solid collision.
  [BlockType.BLOCK]: {
    sheet: 'blocks', family: 'square', variant: '01', frame: 'square_01_001.png',
    fit: PART_FIT.TILE, collision: 'solid',
    kind: {
      brick:   { family: 'brick',        variant: '02', frame: 'brick_02_001.png' },
      plank:   { family: 'plank',        variant: '01', frame: 'plank_01_001.png' },
      outline: { family: 'blockOutline', variant: '01', frame: 'blockOutline_01_001.png' },
      design:  { family: 'blockDesign01', variant: '01', frame: 'blockDesign01_01_001.png' },
    },
  },

  // Spikes anchor at their base so the short variants (spike_02/03/04) stand ON
  // the surface instead of floating in the middle of their box.
  [BlockType.SPIKE]: {
    sheet: 'blocks', family: 'spike', variant: '01', frame: 'spike_01_001.png',
    fit: PART_FIT.CONTAIN, anchor: PART_ANCHOR.BOTTOM, collision: 'hazard',
    kind: {
      color: { family: 'colorSpike', variant: '01', frame: 'colorSpike_01_001.png' },
      ice:   { family: 'iceSpike',   variant: '01', frame: 'iceSpike_01_001.png' },
      fake:  { family: 'fakeSpike',  variant: '01', frame: 'fakeSpike_01_001.png' },
    },
  },

  // A platform is one thin plank (120x54 UHD = 30x13.5 logical); tiling it
  // across the box reads as a single long plank instead of a stretched one.
  [BlockType.PLATFORM]: {
    sheet: 'blocks', family: 'plank', variant: '01', frame: 'plank_01_001.png',
    fit: PART_FIT.TILE, collision: 'solid',
  },

  // Boost pads keep the vector renderer: the atlas' boost_* frames are
  // authored at GD's own scale and colour order (sampled: gold, cyan, green,
  // purple, red), and none of them fit this project's 2x0.5-tile pad box. So
  // `art: false` means "no default sprite for this part" and MainHandler draws
  // PAD_KINDS instead. A level file can still opt in per object with
  // { "t": "pad", "frame": "boost_02_001.png" }.
  [BlockType.PAD]: {
    sheet: 'objects', family: 'boost', variant: '01', frame: 'boost_01_001.png',
    fit: PART_FIT.CONTAIN, anchor: PART_ANCHOR.BOTTOM, art: false, collision: 'trigger',
  },

  // Orb frames by colour, matched to ORB_KINDS by sampling the atlas:
  //   yellow ring_01 (#fffaa7)   pink ring_03 (#ffadff)   red ring_02 (#ff9981)
  //   blue gravring_01 (#9cffff) green dashRing_01 (#77fa77)
  [BlockType.ORB]: {
    sheet: 'blocks', family: 'ring', variant: '01', frame: 'ring_01_001.png',
    fit: PART_FIT.CONTAIN, collision: 'trigger',
    kind: {
      yellow: { family: 'ring',     variant: '01', frame: 'ring_01_001.png' },
      pink:   { family: 'ring',     variant: '03', frame: 'ring_03_001.png' },
      red:    { family: 'ring',     variant: '02', frame: 'ring_02_001.png' },
      blue:   { family: 'gravring', variant: '01', frame: 'gravring_01_001.png' },
      green:  { family: 'dashRing', variant: '01', frame: 'dashRing_01_001.png' },
    },
  },

  // Portals live in GJ_GameSheet02 (the 'objects' atlas) and ship as a FRONT
  // gate plus a BACK glow, both fitted by height. One frame per mode, using the
  // wiki's portal colours.
  [BlockType.PORTAL]: {
    sheet: 'objects', family: 'portal', variant: '01', frame: 'portal_01_front_001.png',
    fit: PART_FIT.HEIGHT, collision: 'trigger',
    kind: {
      [EntityTypes.CUBE]:   { frame: 'portal_01_front_001.png' },
      [EntityTypes.SHIP]:   { frame: 'portal_09_front_001.png' },
      [EntityTypes.BALL]:   { frame: 'portal_07_front_001.png' },
      [EntityTypes.UFO]:    { frame: 'portal_11_front_001.png' },
      [EntityTypes.WAVE]:   { frame: 'portal_13_front_001.png' },
      [EntityTypes.ROBOT]:  { frame: 'portal_14_front_001.png' },
      [EntityTypes.SPIDER]: { frame: 'portal_17_front_001.png' },
      GravityUp:            { frame: 'portal_02_front_001.png' },
      GravityDown:          { frame: 'portal_12_front_001.png' },
    },
  },

  // The finish line is a drawn checkerboard, never an atlas frame.
  [BlockType.FINISH]: { art: false },
};

// GD variant numbers are two digits (spike_03, square_04), so "variant": 3 and
// "variant": "03" both mean the same frame.
function normaliseVariant(variant) {
  const text = String(variant).trim();
  return /^\d+$/.test(text) ? text.padStart(2, '0') : text;
}

// Picks the catalog entry for one object: the per-kind entry wins, then the
// type default. A level file may also name its own sprite, which beats both.
// Returns null when the part has no sprite at all (pads, finish line).
function partFor(obj) {
  const base = LEVEL_PARTS[obj.type];
  if (!base) return null;

  const kinds = base.kind || {};
  const key = obj.kind != null ? obj.kind : (obj.mode != null ? obj.mode : null);
  const hasKind = key != null && Object.prototype.hasOwnProperty.call(kinds, key);
  const entry = hasKind ? kinds[key] : null;

  // "No sprite for this part" — unless the level file names one explicitly.
  if (obj.frame == null && base.art === false) return null;
  if (obj.frame == null && entry && entry.art === false) return null;

  const part = {
    type: obj.type,
    kind: hasKind ? key : null,
    sheet: base.sheet || 'blocks',
    family: base.family || null,
    variant: base.variant || null,
    frame: base.frame || null,
    fit: base.fit || PART_FIT.CONTAIN,
    anchor: base.anchor || PART_ANCHOR.CENTER,
    collision: base.collision || null,
  };

  if (entry) {
    for (const field of ['sheet', 'family', 'variant', 'frame', 'fit', 'anchor']) {
      if (entry[field] != null) part[field] = entry[field];
    }
  }

  // Per-object overrides from the level file beat the catalog. An explicit
  // frame is taken literally — if it isn't in the atlas we'd rather draw the
  // vector fallback and warn than silently swap in a different sprite.
  if (obj.frame) {
    part.frame = obj.frame;
    part.explicitFrame = true;
  }
  if (obj.variant != null) {
    part.variant = normaliseVariant(obj.variant);
    // A variant the author asked for by number must win over the catalog's
    // default frame — but an explicit frame still beats an explicit variant.
    part.explicitVariant = !obj.frame;
  }
  if (obj.sheet) part.sheet = obj.sheet;

  return part;
}

// Stamps an object with its catalog part, so every level object carries what it
// is and the renderer never has to infer a sprite from the object's type alone.
function withPart(obj) {
  obj.part = partFor(obj);
  return obj;
}

// -------------------- Sprite resolution (BlockDefinitions) --------------------
// This is where Levels.js consults BlockDefinitions.js: the catalog says which
// family/variant a part wants, BlockDefinitions says which frame that actually
// is, which atlas holds it, and how big it is.
function lookupPartDefinition(part) {
  const defs = (typeof BlockDefinitions === 'undefined') ? null : BlockDefinitions;
  if (!defs || !defs.loaded) return null;

  // A frame the level file named must match exactly — no family fallback, so a
  // typo shows up as missing art (plus one warning) instead of wrong art.
  if (part.explicitFrame) return defs.get(part.frame);

  // A variant the level file asked for by number is the strongest intent.
  if (part.explicitVariant && part.family) {
    const byVariant = defs.find(part.family, part.variant || '');
    if (byVariant) return byVariant;
  }
  // An exact frame id is deterministic, so try it before the family lookup.
  if (part.frame && defs.has(part.frame)) return defs.get(part.frame);
  // Family + variant, which also recovers if the atlas ever renames a frame.
  if (part.family) return defs.find(part.family, part.variant || '');
  return null;
}

// Resolves one catalog part to the sprite the renderer should blit. Returns
// null when the part is drawn procedurally (pads, finish line) or when the
// catalog has no frame to offer at all.
function resolvePartAsset(part) {
  if (!part || part.frame == null) return null;

  const definition = lookupPartDefinition(part);
  if (definition) {
    return {
      type: part.type,
      kind: part.kind,
      frame: definition.frame,
      sheet: definition.sheet,          // the atlas BlockDefinitions found it in
      family: definition.family,
      variant: definition.variant,
      width: definition.size ? definition.size.width : null,
      height: definition.size ? definition.size.height : null,
      collision: definition.collision,
      fit: part.fit,
      anchor: part.anchor,
      source: 'BlockDefinitions',
    };
  }

  // BlockDefinitions hasn't classified this frame (or hasn't loaded at all):
  // keep the catalog's own frame + atlas so the art still lands on the right
  // pixels. `retry` marks it as re-resolvable the moment the atlases arrive,
  // and stays false once they have — so a level file pointing at a frame that
  // simply doesn't exist is remembered instead of re-resolved every frame.
  const defsLoaded = typeof BlockDefinitions !== 'undefined' && BlockDefinitions.loaded;
  return {
    type: part.type,
    kind: part.kind,
    frame: part.frame,
    sheet: part.sheet,
    family: part.family,
    variant: part.variant,
    width: null,
    height: null,
    collision: part.collision,
    fit: part.fit,
    anchor: part.anchor,
    source: 'catalog',
    retry: !defsLoaded,
  };
}

// The sprite for one object, memoised on the object because level layouts are
// cached and drawn every frame. A sprite resolved before the atlases finished
// loading (retry) is re-resolved once they are, so nothing gets stuck on the
// catalog fallback just because a layout was built early.
function objectSprite(obj) {
  if (!obj || obj.type === BlockType.FINISH) return null;

  const defsLoaded = typeof BlockDefinitions !== 'undefined' && BlockDefinitions.loaded;
  const stale = obj.sprite === undefined || obj.sprite === null ||
    (obj.sprite.retry === true && defsLoaded);

  if (stale) obj.sprite = resolvePartAsset(obj.part || partFor(obj));
  return obj.sprite;
}

// GD portals are two sprites: a wide glow BACK piece drawn behind the FRONT
// gate. The partner frame is confirmed through BlockDefinitions rather than
// string-patched blindly.
function portalBackFrame(sprite) {
  if (!sprite || !sprite.frame || !String(sprite.frame).includes('_front_')) return null;

  const back = sprite.frame.replace('_front_', '_back_');
  const defs = (typeof BlockDefinitions === 'undefined') ? null : BlockDefinitions;
  if (defs && defs.loaded) {
    const definition = defs.get(back);
    return definition ? definition.frame : null;
  }
  return back;
}

// Warms every object's sprite in one pass and warns once per level about frames
// the atlases don't have — a typo in a level file's "frame" is much easier to
// spot from one warning than from silently missing art.
function resolveLevelSprites(objects, levelId = '') {
  const defsLoaded = typeof BlockDefinitions !== 'undefined' && BlockDefinitions.loaded;
  let unresolved = 0;

  for (const obj of objects) {
    const sprite = objectSprite(obj);
    // With the atlases loaded, 'catalog' means the level file named a frame
    // that isn't in the plist.
    if (defsLoaded && sprite && sprite.source === 'catalog') unresolved++;
  }

  if (unresolved > 0) {
    console.warn(`${unresolved} object(s) in ${levelId || 'this level'} name a sprite frame that is not in BlockDefinitions — drawing the catalog fallback instead.`);
  }
  return objects;
}

// -------------------- MainLevelSetup JSON loader --------------------
// Main levels are authored in tile coordinates and fetched from disk. This is
// the only IO in Levels.js; everything else stays pure so the procedural
// builder keeps working as the fallback.
const jsonLevelCache = new Map(); // level id -> Promise<layout | null>

// { t, x, y, w, h, mode } in tiles -> a px object MainHandler understands.
// Every type keeps the exact footprint the procedural builders produce, so
// drawing and collision treat both level sources identically.
//
// Optional sprite fields (kind / variant / frame / sheet) are copied straight
// onto the object; withPart() then turns them into a catalog part, and the
// frame is verified against BlockDefinitions when the layout is resolved.
function jsonSpriteFields(raw) {
  const fields = {};
  if (raw.kind) fields.kind = raw.kind;
  if (raw.variant != null) fields.variant = String(raw.variant);
  if (raw.frame) fields.frame = raw.frame;
  if (raw.sheet) fields.sheet = raw.sheet;
  return fields;
}

function convertJsonObject(raw) {
  const t = String(raw.t || raw.type || '').toLowerCase();
  const tx = Number(raw.x) || 0;                 // tiles from the start
  const ty = Number(raw.y) || 0;                 // tiles above the ground line
  const x = tx * TILE;
  const y = ty * TILE;
  const sprite = jsonSpriteFields(raw);

  switch (t) {
    case 'block':
      return withPart({ type: BlockType.BLOCK, x, y, w: (Number(raw.w) || 1) * TILE, h: (Number(raw.h) || 1) * TILE, ...sprite });
    case 'spike': {
      const size = (Number(raw.w) || 1) * TILE; // spikes are one tile by default
      return withPart({ type: BlockType.SPIKE, x, y, w: size, h: (Number(raw.h) || 1) * TILE, flip: !!raw.flip, ...sprite });
    }
    case 'platform':
      return withPart({ type: BlockType.PLATFORM, x, y, w: (Number(raw.w) || 3) * TILE, h: (Number(raw.h) || 0.5) * TILE, ...sprite });
    case 'pad':
      return withPart({ type: BlockType.PAD, x, y, w: 2 * TILE, h: TILE / 2, kind: raw.kind || 'yellow', ...sprite });
    case 'orb':
      return withPart({ type: BlockType.ORB, x, y, w: TILE * 1.5, h: TILE * 1.5, kind: raw.kind || 'yellow', ...sprite });
    case 'portal':
      return withPart({ type: BlockType.PORTAL, x, y, w: TILE, h: (Number(raw.h) || 3) * TILE, mode: raw.mode, ...sprite });
    case 'finish':
      return withPart({ type: BlockType.FINISH, x, y: 0, w: TILE, h: FIELD_HEIGHT });
    default:
      console.warn(`Unknown MainLevelSetup object type "${t}" — skipping`);
      return null;
  }
}

// Triggers are parsed but never drawn or collided with in gameplay — they sit
// in level.triggers for the future creation tab to show. `color` triggers DO
// act in-game (MainHandler tints the background with them).
function convertJsonTrigger(raw) {
  return {
    type: 'trigger',
    triggerType: String(raw.t || raw.type || 'color').toLowerCase(),
    x: (Number(raw.x) || 0) * TILE,
    channel: raw.channel || 'bg',        // 'bg' | 'ground' (bg is implemented today)
    color: raw.color || null,
    duration: Number.isFinite(raw.duration) ? Number(raw.duration) : 0.5,
    strength: Number.isFinite(raw.strength) ? Number(raw.strength) : 1,
    dx: (Number(raw.dx) || 0) * TILE,
    dy: (Number(raw.dy) || 0) * TILE,
    visible: false,                      // invisible in-game by definition
  };
}

function levelJsonPath(levelId) {
  const info = mainLevels[levelId];
  return info && info.file ? info.file : null;
}

// Fetch + convert one level's JSON. Resolves null when the file is missing or
// invalid, letting the caller fall back to the procedural builder.
async function loadJsonLevel(levelId) {
  const file = levelJsonPath(levelId);
  if (!file) return null;

  if (jsonLevelCache.has(levelId)) return jsonLevelCache.get(levelId);

  const promise = (async () => {
    let raw;
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = await res.json();
    } catch (err) {
      console.warn(`MainLevelSetup JSON for ${levelId} unavailable (${err.message}) — using the procedural fallback`);
      return null;
    }

    const info = getMainLevel(levelId) || {};
    const objects = [];
    for (const rawObj of raw.objects || []) {
      const obj = convertJsonObject(rawObj);
      if (obj) objects.push(obj);
    }
    objects.sort((a, b) => a.x - b.x);
    resolveLevelSprites(objects, levelId); // resolve frames through BlockDefinitions

    const triggers = (raw.triggers || []).map(convertJsonTrigger).sort((a, b) => a.x - b.x);

    // Level length runs to the finish line, so the percent bar reads 100 there
    const finishObj = objects.find((o) => o.type === BlockType.FINISH);
    const length = raw.length ? Number(raw.length) * TILE
      : (Number.isFinite(raw.lengthPx) ? Number(raw.lengthPx)
      : (finishObj ? finishObj.x : 12000));

    // The JSON is the source of truth — sync the registry so the level select,
    // pause menu and music all reflect what the file says without a restart.
    info.name = raw.name || info.name;
    info.difficulty = Number.isFinite(raw.difficulty) ? Number(raw.difficulty) : info.difficulty;
    info.modes = raw.modes || info.modes;
    info.song = raw.song || info.song;

    return {
      id: levelId,
      name: info.name,
      song: info.song,
      modes: info.modes,
      length,
      objects,
      triggers,
      // Starting colors from the JSON — used to tint the level at start.
      // ground2Col is reserved for future gradient grounds and ignored for now.
      backgroundCol: raw.backgroundCol || info.backgroundCol || null,
      ground1Col: raw.ground1Col || info.ground1Col || null,
      ground2Col: raw.ground2Col || info.ground2Col || null, // reserved, not used yet
      lineCol: raw.lineCol || info.lineCol || null,
    };
  })();

  jsonLevelCache.set(levelId, promise);
  promise.catch(() => jsonLevelCache.delete(levelId)); // allow a retry after a failure
  return promise;
}

// -------------------- Deterministic RNG --------------------
// Same seed => same level, every single run. Needed because a level you can't
// memorise isn't a level, it's a lottery.
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function range(rng, min, max) {
  return min + rng() * (max - min);
}

// -------------------- Hazard patterns --------------------
// build(objects, x) stamps its objects at x and returns the width it occupied,
// so the caller can add a fair gap after it. Everything here stays inside the
// tuning envelope described at the top of the file (max 2-3 tiles tall).
function stamp(...items) {
  return (objects, x) => {
    let width = 0;
    for (const item of items) {
      objects.push({ ...item, x: item.x + x });
      width = Math.max(width, item.x + item.w);
    }
    return width;
  };
}

const groundPatterns = [
  { weight: 4, minLevel: 1, build: stamp(spike(0)) },
  { weight: 2, minLevel: 1, build: stamp(spike(0), spike(TILE)) },
  { weight: 2, minLevel: 1, build: stamp(block(0, 0), block(0, TILE)) },
  { weight: 2, minLevel: 2, build: stamp(block(0, 0), spike(TILE * 2)) },
  { weight: 1, minLevel: 3, build: stamp(spike(0), spike(TILE), spike(TILE * 2)) },
  { weight: 1, minLevel: 1, build: stamp(pad(0)) },
  { weight: 1, minLevel: 4, build: stamp(block(0, 0), block(TILE, 0), spike(TILE * 3)) },
];

const airPatterns = [
  // Pillar hanging from the ceiling, and the mirrored one rising from the floor
  { weight: 3, minLevel: 1, build: stamp(block(0, FIELD_HEIGHT - TILE * 3, TILE, TILE * 3)) },
  { weight: 3, minLevel: 1, build: stamp(block(0, 0, TILE, TILE * 3)) },
  // Floor-to-ceiling pinch: squeeze through the middle
  { weight: 2, minLevel: 3, build: stamp(block(0, 0, TILE, TILE * 2), block(0, FIELD_HEIGHT - TILE * 2, TILE, TILE * 2)) },
  { weight: 2, minLevel: 2, build: stamp(orb(0, TILE * 4)) },
  { weight: 1, minLevel: 4, build: stamp(spike(0), spike(TILE), spike(TILE * 2)) },
];

// -------------------- Section filling --------------------
// Ship / Wave cover vertical space far too fast for ground-style hazards (2.1 mode set — no Swing),
// so they get their own pattern list and a wider minimum gap.
const AIR_MODES = new Set([EntityTypes.SHIP, EntityTypes.WAVE]);

function pickWeighted(rng, list) {
  const total = list.reduce((sum, p) => sum + (p.weight || 1), 0);
  let roll = rng() * total;
  for (const p of list) {
    roll -= p.weight || 1;
    if (roll <= 0) return p;
  }
  return list[list.length - 1];
}

function addSection(objects, startX, endX, mode, rng, levelNumber = 1) {
  const isAir = AIR_MODES.has(mode);
  const full = isAir ? airPatterns : groundPatterns;
  // Harder levels unlock the nastier patterns; level 1 only sees the basics.
  const list = full.filter((p) => levelNumber >= (p.minLevel || 1));
  const usable = list.length ? list : full;
  const gapBase = isAir ? LEVEL_MIN_GAP * 1.2 : LEVEL_MIN_GAP;

  let x = startX + 240; // breathing room right after a portal

  while (x < endX - 240) {
    const pattern = pickWeighted(rng, usable);
    x += pattern.build(objects, x);
    x += gapBase * range(rng, 0.85, 1.6);
  }
}

// -------------------- Level assembly --------------------
const levelCache = new Map(); // key: level id -> built layout

function getDefaultLevelId() {
  return Object.keys(mainLevels)[0];
}

function buildLevel(levelId) {
  const id = mainLevels[levelId] ? levelId : getDefaultLevelId();
  const info = mainLevels[id];
  const rng = makeRng(hashString(id));
  const objects = [];

  // Every level opens on the Cube regardless of what its mode list says,
  // which is how GD's own levels behave too.
  const modes = [EntityTypes.CUBE, ...(info.modes || []).filter((m) => m !== EntityTypes.CUBE)];
  const levelNumber = Number(info.difficulty) || 1;
  const length = 8000 + levelNumber * 2000; // later levels run longer (~26s-47s at 380px/s)
  const sectionWidth = (length - 1000) / modes.length;

  modes.forEach((mode, index) => {
    const startX = 500 + index * sectionWidth;

    // Sit the portal in open space just before the section it introduces
    if (index > 0) objects.push(portal(startX - 130, mode));

    addSection(objects, startX, startX + sectionWidth, mode, rng, levelNumber);
  });

  objects.push(finish(length));
  objects.sort((a, b) => a.x - b.x); // MainHandler walks this with a moving window
  resolveLevelSprites(objects, id);  // resolve frames through BlockDefinitions

  return { id, name: info.name, song: info.song, modes, length, objects };
}

// Async because the JSON level files are fetched. JSON levels win when they
// exist; the seeded procedural builder is the fallback for every id without a
// MainLevelSetup file.
async function getLevelLayout(levelId) {
  const jsonLayout = await loadJsonLevel(levelId);
  if (jsonLayout) return jsonLayout;

  if (levelCache.has(levelId)) return levelCache.get(levelId);
  const layout = buildLevel(levelId);
  levelCache.set(layout.id, layout);
  return layout;
}