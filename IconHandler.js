// IconHandler.js
// Depends on EntityTypes from Data.js — load Data.js first
//
// Icons are Cocos2d-style sprite sheets: one PNG (all layers packed together)
// + a .plist saying where each layer's rectangle lives in that PNG.
// File naming convention: Images/Icons/<Mode>/Icon<number>-uhd.png / .plist
//
// We don't need to know the internal frame name prefix used inside the plist -
// we detect which frame is which layer by suffix pattern instead:
//   *_2_###.png         -> secondary shape
//   *_glow_###.png      -> outer glow outline
//   *_innerGlow_###.png -> further glow rings (a shape's inner glow, the ring
//                          around the secondary). Same colour as the outer glow,
//                          but a separate frame so it can be tinted too.
//   *_extra_###.png     -> optional detail layer, not recolored
//   anything else       -> base/primary shape

// -------------------- Manifest --------------------
// Just the available icon numbers per mode. Lowest number = starter icon.
// Modes with no shipped art yet still list a number so the icons screen and
// gameplay can show the vector fallback instead of hiding the mode.
const iconManifest = {
  [EntityTypes.CUBE]:   [1],   // add 2, 3, etc. here as you make more
  [EntityTypes.SHIP]:   [1],
  [EntityTypes.BALL]:   [1],
  [EntityTypes.UFO]:    [1],
  [EntityTypes.WAVE]:   [1],
  [EntityTypes.ROBOT]:  [1],
  [EntityTypes.SPIDER]: [1],
};

function getAvailableIcons(mode) {
  return iconManifest[mode] || [];
}

function getStarterIcon(mode) {
  const list = getAvailableIcons(mode);
  return list.length > 0 ? Math.min(...list) : null;
}

// Art does not have to be named Icon<number>-uhd.*. Anything dropped into
// Images/Icons/<Mode>/<Mode><number>/ can be registered here by its own file
// names, which is how the shipped Cube 1 art (player_00-uhd.*) is found.
const iconFiles = {
  'Cube/1': {
    sheet: 'Images/Icons/Cube/Cube1/player_00-uhd.png',
    plist: 'Images/Icons/Cube/Cube1/player_00-uhd.plist',
  },
};

function getIconPaths(mode, number) {
  // Layout on disk is Images/Icons/<Mode>/<Mode><number>/Icon<number>-uhd.<ext>
  // e.g. Images/Icons/Cube/Cube1/Icon1-uhd.png — one folder per icon.
  const folder = `${mode}/${mode}${number}`; // matches EntityTypes values: 'Cube/Cube1', etc.
  const override = iconFiles[`${mode}/${number}`];
  if (override) return { ...override };
  return {
    sheet: `Images/Icons/${folder}/Icon${number}-uhd.png`,
    plist: `Images/Icons/${folder}/Icon${number}-uhd.plist`,
  };
}

// How large the middle (secondary) detail sits inside the icon's hollow centre.
// Below 1 the base layer's hole shows through around it, which is the gap
// between the middle square and the outer one. 1 (the default) fills the hole
// exactly, which is right for art authored to fill it.
const iconDetailScale = {
  'Cube/1': 0.68,
};

function getDetailScale(mode, number) {
  const scale = iconDetailScale[`${mode}/${number}`];
  return typeof scale === 'number' && scale > 0 ? scale : 1;
}

// How much to shave off the glow layer's outer edge, in pixels. The sheet draws a
// chunky outline; taking N pixels off the outside thins it without re-cutting the
// art, and leaves the band flush against the body. Shaving the *inner* edge
// instead would leave a transparent notch between the glow and the base, because
// the glow layer is wider than the base and only its outer band overlaps it.
const iconGlowTrim = {
  'Cube/1': 4,
};

function getGlowTrim(mode, number) {
  const px = iconGlowTrim[`${mode}/${number}`];
  return typeof px === 'number' && px > 0 ? px : 0;
}

// Clears the outermost `px` pixels of the layer, thinning any outline it draws
// while keeping what remains against the body. Transparent pixels are left alone.
function shaveLayerEdge(layerCanvas, px) {
  if (px <= 0) return layerCanvas;
  const ctx = layerCanvas.getContext('2d');
  const w = layerCanvas.width;
  const h = layerCanvas.height;
  const p = Math.min(px, Math.floor(Math.min(w, h) / 2) - 1);
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.min(x, y, w - 1 - x, h - 1 - y) >= p) continue;
      d[(y * w + x) * 4 + 3] = 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  return layerCanvas;
}

// Some art bakes its own outline into the base frame: the body and its border
// share one layer, so that border shows up as a second outline on top of the
// one the glow layer already draws. Absorbing the outermost N pixels into the
// body colour removes the extra outline. Erasing them instead would be wrong —
// a rounded art's corners are *made of* that border, so deleting it would square
// the icon off. Folding it into the body keeps the silhouette and loses the
// outline. Art that has no baked-in border needs no entry.
const iconBaseBorderFill = {};

function getBaseBorderFill(mode, number) {
  const px = iconBaseBorderFill[`${mode}/${number}`];
  return typeof px === 'number' && px > 0 ? px : 0;
}

// Floods a square border of the layer with one colour, leaving the interior and
// every transparent pixel untouched.
function fillLayerBorder(layerCanvas, px, color) {
  if (px <= 0) return layerCanvas;
  const ctx = layerCanvas.getContext('2d');
  const w = layerCanvas.width;
  const h = layerCanvas.height;
  const p = Math.min(px, Math.floor(Math.min(w, h) / 2));
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const { r, g, b } = parseHexColor(color);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= p && x < w - p && y >= p && y < h - p) continue;
      const o = (y * w + x) * 4;
      if (d[o + 3] === 0) continue; // don't paint into transparent corners
      d[o] = r; d[o + 1] = g; d[o + 2] = b;
    }
  }
  ctx.putImageData(image, 0, 0);
  return layerCanvas;
}

// -------------------- Plist parsing --------------------
// parsePlist / parseDict / parseValue / parseRect / parsePoint / loadImage all
// live in SheetHandler.js, which is loaded before this file. They are shared
// with the menu/UI atlas code so there is exactly one implementation.

// -------------------- Frame categorization --------------------
// Figures out which parsed frame is base/secondary/glow/innerGlow/extra by
// suffix, without needing to know the internal name prefix ahead of time.
function categorizeFrames(frames) {
  const result = { base: null, secondary: null, glow: null, innerGlow: null, extra: null };

  for (const [key, frame] of Object.entries(frames)) {
    if (/_2_\d+\.png$/i.test(key)) {
      result.secondary = frame;
    } else if (/_innerGlow_\d+\.png$/i.test(key)) {
      // Checked before _glow_ so a future "_innerGlow_" style name cannot be
      // mistaken for the outer ring.
      result.innerGlow = frame;
    } else if (/_glow_\d+\.png$/i.test(key)) {
      result.glow = frame;
    } else if (/_extra_\d+\.png$/i.test(key)) {
      result.extra = frame;
    } else {
      result.base = frame; // anything left over is treated as the base layer
    }
  }

  return result;
}

// -------------------- Sheet loading --------------------
// Uses the shared atlas loader (which already caches by plist path) and
// re-shapes its frames into the icon layer model this file renders from.
async function loadSheet(sheetPath, plistPath) {
  const sheet = await getSheet(sheetPath, plistPath);

  const frames = {};
  for (const [name, f] of Object.entries(sheet.frames)) {
    frames[name] = {
      textureRect: f.rect,
      rotated: !!f.rotated,
      spriteOffset: { x: f.offX, y: f.offY },
      spriteSize: { x: f.sizeW, y: f.sizeH },
      spriteSourceSize: { x: f.srcW, y: f.srcH },
    };
  }

  return { image: sheet.image, layers: categorizeFrames(frames) };
}

// -------------------- The Geometry Dash cube --------------------
// The shipped sheet is the real GD cube art, and the reference look is built from
// its own geometry rather than approximated. Two things make that possible:
//
//   * the base frame is a RING whose body and its dark outlines live in the SAME
//     image, so it is split by brightness — light becomes the Primary body, dark
//     becomes the Secondary outline and inner frame. That keeps the sheet's exact
//     corner radii, band widths and antialiasing, and drops its white entirely.
//   * `measureBaseBands` reads the real band boundaries off the middle scanline,
//     so the outline / body / frame / hole geometry is measured, never typed.
//
//   glow frame  -> the outer silhouette, reused as the soft outer glow
//   base light  -> Primary body
//   base dark   -> Secondary outer outline + Secondary inner frame
//   2nd frame   -> the eye (Primary), with its own Secondary outline
//
// Only the glow layers are blurred; the cube, frame and eye are drawn hard-edged.

// Room for the soft glows to spill into. The art is drawn in its own coordinates
// and the whole thing is offset by this much, so the cube itself keeps its size.
const ICON_GLOW_PAD = 8;

// Splits one layer into its light and dark parts, each keeping the original
// alpha, so a single frame can drive two different colours.
function splitByLuminance(layerCanvas, threshold = 0.5) {
  const w = layerCanvas.width;
  const h = layerCanvas.height;
  // Read the SOURCE. Reading from a destination canvas here silently yields an
  // empty image, because nothing has been drawn to it yet.
  const src = layerCanvas.getContext('2d').getImageData(0, 0, w, h);
  const light = makeLayerCanvas(w, h);
  const dark = makeLayerCanvas(w, h);
  const lc = light.getContext('2d');
  const dc = dark.getContext('2d');
  const li = lc.getImageData(0, 0, w, h);
  const di = dc.getImageData(0, 0, w, h);
  for (let i = 0; i < src.data.length; i += 4) {
    const a = src.data[i + 3];
    if (a === 0) continue;
    const lum = (0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]) / 255;
    const dst = lum >= threshold ? li.data : di.data;
    dst[i] = src.data[i];
    dst[i + 1] = src.data[i + 1];
    dst[i + 2] = src.data[i + 2];
    dst[i + 3] = a;
  }
  lc.putImageData(li, 0, 0);
  dc.putImageData(di, 0, 0);
  return { light, dark };
}

// Classifies the layer's middle scanline into dark / light / gap runs. Opacity
// alone is not enough: the cube's outline, body and inner frame are all fully
// opaque, so they read as one run unless brightness separates them too. This is
// where the real band boundaries come from — outline (dark), body (light), inner
// frame (dark), hole (gap).
function measureBaseBands(layerCanvas) {
  const w = layerCanvas.width;
  const h = layerCanvas.height;
  const row = layerCanvas.getContext('2d').getImageData(0, Math.floor(h / 2), w, 1).data;
  const kindAt = (x) => {
    if (row[x * 4 + 3] <= 8) return 'gap';
    const lum = (0.299 * row[x * 4] + 0.587 * row[x * 4 + 1] + 0.114 * row[x * 4 + 2]) / 255;
    return lum >= 0.5 ? 'light' : 'dark';
  };
  const runs = [];
  let x = 0;
  while (x < w) {
    const kind = kindAt(x);
    const lo = x;
    while (x < w && kindAt(x) === kind) x++;
    runs.push({ kind, lo, hi: x - 1 });
  }
  return runs;
}

// A hollow square ring, used for the eye's outline. Plain squares to match the
// eye frame in the sheet, which is itself a square.
function squareRingCanvas(size, thickness) {
  const c = makeLayerCanvas(size, size);
  const ctx = c.getContext('2d');
  const t = Math.max(1, Math.round(thickness));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, t);
  ctx.fillRect(0, size - t, size, t);
  ctx.fillRect(0, 0, t, size);
  ctx.fillRect(size - t, 0, t, size);
  return c;
}

// Crops a horizontal slice out of a layer.
function sliceLayer(layerCanvas, lo, hi) {
  const w = hi - lo + 1;
  const c = makeLayerCanvas(w, layerCanvas.height);
  c.getContext('2d').drawImage(layerCanvas, lo, 0, w, layerCanvas.height, 0, 0, w, layerCanvas.height);
  return c;
}

// Keeps only the pixels whose Chebyshev distance from the layer's centre falls
// in [dMin, dMax]. The cube's rings are concentric, so distance separates them.
//
// Column ranges do NOT work here: the outer outline and the inner frame both run
// across every column in the top and bottom bands, so masking columns drags the
// outline into the "frame" mask and the glow balloons over the body.
function maskLayerByRadius(layerCanvas, dMin, dMax) {
  const w = layerCanvas.width;
  const h = layerCanvas.height;
  const out = makeLayerCanvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.getImageData(0, 0, w, h);
  const src = layerCanvas.getContext('2d').getImageData(0, 0, w, h);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (src.data[o + 3] === 0) continue;
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (d < dMin || d > dMax) continue;
      img.data[o] = src.data[o];
      img.data[o + 1] = src.data[o + 1];
      img.data[o + 2] = src.data[o + 2];
      img.data[o + 3] = src.data[o + 3];
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// Draws a shape as a soft halo. This is the ONLY place a blur is used, and it is
// applied to glow layers alone so the cube itself stays hard-edged.
function drawSoftGlow(destCtx, shape, x, y, blurPx, alpha) {
  destCtx.save();
  destCtx.globalAlpha = alpha;
  const prev = destCtx.filter;
  destCtx.filter = `blur(${blurPx}px)`;
  destCtx.drawImage(shape, Math.round(x), Math.round(y));
  destCtx.filter = prev;
  destCtx.restore();
}

// A soft halo in `color`, shaped by `mask` (a layer used purely as an alpha
// stencil), sitting at (x, y). Used for the inner frame and the eye, whose glows
// go behind them and must be smaller and more concentrated than the outer one.
//
// The halo is filled with the colour and the mask applied afterwards, because
// `destination-in` only affects ALPHA — masking a white fill would leave a white
// glow no matter what colour was asked for.
function drawHaloBehind(destCtx, mask, color, x, y, spread, alpha) {
  // Grow by one blur radius, not two: blurring already feathers outward, so
  // doubling it here is what makes a glow read as huge instead of subtle.
  const grow = Math.max(1, Math.round(spread));
  const big = makeLayerCanvas(mask.width + grow * 2, mask.height + grow * 2);
  const bctx = big.getContext('2d');
  bctx.fillStyle = color;
  bctx.fillRect(0, 0, big.width, big.height);
  bctx.globalCompositeOperation = 'destination-in';
  bctx.drawImage(mask, grow, grow);
  destCtx.save();
  destCtx.globalAlpha = alpha;
  const prev = destCtx.filter;
  destCtx.filter = `blur(${spread}px)`;
  destCtx.drawImage(big, Math.round(x - grow), Math.round(y - grow));
  destCtx.filter = prev;
  destCtx.restore();
}

function makeLayerCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// -------------------- Rendering --------------------
// Icons are recoloured by the artwork's own brightness rather than flattened to
// a single fill. A flat `source-in` fill would erase everything inside a layer —
// the cube art is a ring whose body and black outlines live in the SAME frame,
// so flattening collapses it to "solid square + centre square" and the nested
// squares vanish. Scaling the artwork's luminance by the player's colour keeps
// that structure while still handing the player their chosen colours.
function parseHexColor(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function tintByLuminance(layerCanvas, color) {
  const ctx = layerCanvas.getContext('2d');
  const image = ctx.getImageData(0, 0, layerCanvas.width, layerCanvas.height);
  const data = image.data;

  // Scale the artwork's brightness by the colour directly. Scaling all three
  // channels by one factor leaves the hue alone, and the artwork's fully-lit
  // pixels land on exactly the requested colour. (Normalising the colour first
  // looks tempting but overshoots: a colour like #22cc11 has no channel at 255,
  // so normalising it to a peak of 1 would push the green channel past 255 and
  // clamp to a lighter, wrong colour.)
  const { r, g, b } = parseHexColor(color);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // fully transparent: leave it alone
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    // ImageData is a Uint8ClampedArray, so these clamp and round for us.
    data[i] = r * lum;
    data[i + 1] = g * lum;
    data[i + 2] = b * lum;
  }

  ctx.putImageData(image, 0, 0);
  return layerCanvas;
}

function extractLayer(sheetImage, frame, color, skipTint) {
  const { textureRect: r, spriteSize: size, rotated } = frame;

  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = size.x;
  layerCanvas.height = size.y;
  const ctx = layerCanvas.getContext('2d');

  if (rotated) {
    // Stored sideways (footprint h x w): un-rotate back to upright.
    ctx.save();
    ctx.translate(size.x / 2, size.y / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(sheetImage, r.x, r.y, r.h, r.w, -size.y / 2, -size.x / 2, size.y, size.x);
    ctx.restore();
  } else {
    ctx.drawImage(sheetImage, r.x, r.y, r.w, r.h, 0, 0, size.x, size.y);
  }

  if (!skipTint) tintByLuminance(layerCanvas, color);

  return layerCanvas;
}

function drawLayer(destCtx, layerCanvas, frame, originW, originH, scale = 1) {
  const { spriteOffset: off, spriteSize: size, spriteSourceSize: srcSize } = frame;

  // `scale` shrinks the layer about the centre of its own source box, so the
  // trim offsets and the source-size centring still line up afterwards.
  const w = size.x * scale;
  const h = size.y * scale;

  const dx = (originW - srcSize.x) / 2 + (srcSize.x - w) / 2 + off.x;
  const dy = (originH - srcSize.y) / 2 + (srcSize.y - h) / 2 - off.y;

  if (scale === 1) {
    destCtx.drawImage(layerCanvas, dx, dy);
  } else {
    // Let the browser resample this one. Disabling smoothing to keep a scaled
    // layer "crisp" switches it to nearest-neighbour, which makes the icon
    // visibly blocky — and a shrink like this is exactly the case where plain
    // bilinear filtering looks better, not worse.
    destCtx.drawImage(layerCanvas, dx, dy, w, h);
  }
}

// Composes the Geometry Dash cube look. Every layer is derived from the shipped
// sheet: the outer silhouette from the glow frame, the body and outlines from the
// base frame's own brightness split and measured band boundaries, and the eye from
// the secondary frame. Nothing is approximated and no colour is hardcoded — all
// three come from the caller's `colors`, which is playerData.colors.
//
//   OUTER GLOW -> OUTER CUBE -> INNER FRAME GLOW -> INNER FRAME
//   -> EYE GLOW -> EYE -> EYE OUTLINE
// Glow tuning, in art pixels. Kept subtle and Geometry Dash-like: the outer one
// is the widest and faintest, the eye's is the tightest and most concentrated.
// These are the ONLY blurred layers in the icon.
const CUBE_GLOW = {
  outer: { blur: 3.0, alpha: 0.40 },   // around the whole cube
  frame: { blur: 1.8, alpha: 0.34 },   // behind the inner frame
  eye:   { blur: 1.2, alpha: 0.42 },   // behind the eye, tighter than the rest
};

function renderCubeIcon(canvas, image, layers, colors, options) {
  const { base, secondary, glow } = layers;
  const detailScale = options.detailScale ?? 1;
  const glowTrim = options.glowTrim ?? 0;

  const originW = Math.max(base.spriteSourceSize.x, secondary.spriteSourceSize.x, glow ? glow.spriteSourceSize.x : 0);
  const originH = Math.max(base.spriteSourceSize.y, secondary.spriteSourceSize.y, glow ? glow.spriteSourceSize.y : 0);

  const pad = ICON_GLOW_PAD;
  canvas.width = originW + pad * 2;
  canvas.height = originH + pad * 2;
  // Recorded so the caller can scale the blit to the art rather than to the
  // padded canvas — otherwise the cube would shrink when the glows are added.
  canvas.iconPad = pad;
  canvas.iconArtSize = originW;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Everything below works in the sheet's own coordinates; the pad only gives the
  // soft glows somewhere to go, so the cube keeps its measured size.
  ctx.save();
  ctx.translate(pad, pad);

  const { spriteSourceSize: srcSize, spriteSize: size, spriteOffset: off } = base;
  const baseDx = (originW - srcSize.x) / 2 + off.x;
  const baseDy = (originH - srcSize.y) / 2 - off.y;

  // The base frame, read raw: its light body and dark outlines are separated by
  // brightness, not by guessing at a second source image.
  const baseRaw = extractLayer(image, base, null, true);
  const { light, dark } = splitByLuminance(baseRaw);
  const runs = measureBaseBands(baseRaw);

  // The scanline is symmetric, so every band appears twice. Classify by
  // position rather than taking the first of each kind:
  //   dark run touching a gap -> the inner frame (it rings the hole)
  //   any other dark run      -> the outer outline
  //   light run               -> the Primary body
  const isFrameRun = (i) => runs[i].kind === 'dark'
    && ((runs[i - 1] && runs[i - 1].kind === 'gap') || (runs[i + 1] && runs[i + 1].kind === 'gap'));

  const outlineBands = runs.filter((r, i) => r.kind === 'dark' && !isFrameRun(i));
  const frameBands = runs.filter((r, i) => isFrameRun(i));
  const bodyBands = runs.filter((r) => r.kind === 'light');
  const holeBand = runs.find((r) => r.kind === 'gap') || null;
  const frameThickness = frameBands.length ? frameBands[0].hi - frameBands[0].lo + 1 : 0;

  // The hole: the transparent run at the centre.
  const holeLo = holeBand ? holeBand.lo : 0;
  const holeHi = holeBand ? holeBand.hi : size.x - 1;
  const holeSize = Math.max(0, holeHi - holeLo + 1);

  // Bands are placed at the base frame's own offset. The body and the outlines
  // are drawn whole — they are rings, and their top/bottom bands run across every
  // column, which a middle-scanline slice would throw away.
  const baseX = Math.round(baseDx);
  const baseY = Math.round(baseDy);

  // The inner frame's radius band, measured off the scanline, so its glow can be
  // drawn behind the frame alone rather than behind the whole outline.
  const layerCx = (size.x - 1) / 2;
  const frameOuter = frameBands.length ? layerCx - frameBands[0].lo : 0;
  const frameInner = frameBands.length ? layerCx - frameBands[0].hi : 0;

  // ---- 1. OUTER CUBE GLOW -------------------------------------------------
  // A soft version of the sheet's outer silhouette, in the glow colour. Drawn
  // first so everything else sits on top of it.
  if (glow) {
    const halo = shaveLayerEdge(extractLayer(image, glow, colors.glow), glowTrim);
    drawSoftGlow(ctx, halo, 0, 0, CUBE_GLOW.outer.blur, CUBE_GLOW.outer.alpha);
  }

  // ---- 2. OUTER CUBE -------------------------------------------------------
  // Secondary for every outline (the outer border and the inner frame), Primary
  // for the body between them. Both are rings, drawn whole.
  ctx.drawImage(tintByLuminance(dark, colors.secondary), baseX, baseY);
  ctx.drawImage(tintByLuminance(light, colors.primary), baseX, baseY);

  // ---- 3/4. INNER FRAME GLOW, then the Secondary inner frame ---------------
  // The frame's glow sits BEHIND the frame, so it is drawn first and then the
  // frame on top of it. It is kept INSIDE the hole (a thin band hugging the
  // frame's inner edge) rather than centred on the frame: a halo centred on the
  // frame spills outward over the body, and the body here is only ~20px wide, so
  // that swamps it instead of reading as a subtle glow.
  if (frameBands.length && frameInner > 0) {
    const filled = makeLayerCanvas(size.x, size.y);
    filled.getContext('2d').fillStyle = '#ffffff';
    filled.getContext('2d').fillRect(0, 0, size.x, size.y);
    const glowBand = maskLayerByRadius(filled, Math.max(0, frameInner - 3), frameInner);
    drawHaloBehind(ctx, glowBand, colors.glow, baseX, baseY, CUBE_GLOW.frame.blur, CUBE_GLOW.frame.alpha);
  }
  if (frameBands.length) {
    const frameLayer = maskLayerByRadius(dark, frameInner, frameOuter);
    ctx.drawImage(tintByLuminance(frameLayer, colors.secondary), baseX, baseY);
  }

  // ---- 5/6/7. EYE GLOW, EYE, EYE OUTLINE -----------------------------------
  // The eye is the sheet's secondary frame, sized from the hole and given its own
  // outline, centred in the hole. `eye` is the WHOLE footprint; the fill is
  // inset by the outline thickness so the outline always frames the fill.
  if (secondary && holeSize > 0) {
    const eye = Math.max(8, Math.round(holeSize * detailScale));
    const ratio = frameThickness / Math.max(1, holeSize);
    const eyeThickness = Math.max(1, Math.min(Math.floor(eye / 3), Math.round(eye * ratio)));
    const fill = eye - eyeThickness * 2;
    const cx = Math.round(baseDx + (holeLo + holeHi + 1) / 2);
    const cy = Math.round(baseDy + (holeLo + holeHi + 1) / 2);
    const top = Math.round(cy - eye / 2);
    const left = Math.round(cx - eye / 2);

    // The eye's glow sits BEHIND the eye and its outline, and is deliberately
    // tighter than the outer cube glow.
    const eyeMask = makeLayerCanvas(eye, eye);
    const ectx = eyeMask.getContext('2d');
    ectx.fillStyle = '#ffffff';
    ectx.fillRect(0, 0, eye, eye);
    drawHaloBehind(ctx, eyeMask, colors.glow, left, top, CUBE_GLOW.eye.blur, CUBE_GLOW.eye.alpha);

    // Eye, then its Secondary outline on top.
    if (fill > 0) {
      const eyeLayer = extractLayer(image, secondary, null, true);
      ctx.drawImage(tintByLuminance(eyeLayer, colors.primary),
        Math.round(cx - fill / 2), Math.round(cy - fill / 2), fill, fill);
    }
    const outline = squareRingCanvas(eye, eyeThickness);
    ctx.drawImage(tintByLuminance(outline, colors.secondary), left, top);
  }

  ctx.restore();
}

async function renderIcon(canvas, mode, number, colors) {
  const { sheet, plist } = getIconPaths(mode, number);
  let image;
  let layers;
  try {
    ({ image, layers } = await loadSheet(sheet, plist));
  } catch (err) {
    // A mode with no art yet (or a failed download) falls back to a simple
    // vector cube so the player is never invisible.
    drawFallbackIcon(canvas, mode, number, colors);
    return;
  }
  const { base, secondary, glow, innerGlow, extra } = layers;

  const candidates = [base, secondary, glow, innerGlow, extra].filter(Boolean);
  if (candidates.length === 0) {
    drawFallbackIcon(canvas, mode, number, colors);
    return;
  }

  // The GD cube is the one shape with a full outline/body/frame/eye structure, so
  // it gets the layered renderer. Anything else keeps the generic compositing
  // path below.
  if (base && secondary && glow) {
    renderCubeIcon(canvas, image, layers, colors, {
      detailScale: getDetailScale(mode, number),
      glowTrim: getGlowTrim(mode, number),
    });
    return;
  }
  const originW = Math.max(...candidates.map((f) => f.spriteSourceSize.x));
  const originH = Math.max(...candidates.map((f) => f.spriteSourceSize.y));

  canvas.width = originW;
  canvas.height = originH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, originW, originH);

  // Draw order: glow behind, then innerGlow, then secondary, then base on top,
  // extra last. The base is drawn after the secondary on purpose: the base
  // carries the hollow centre, so it is what cuts the transparent gap around the
  // middle. Both glow frames take the same colour, so every ring round every
  // square follows the player's glow choice.
  const detailScale = getDetailScale(mode, number);
  const borderFill = getBaseBorderFill(mode, number);
  const glowTrim = getGlowTrim(mode, number);
  if (glow) {
    const glowLayer = shaveLayerEdge(extractLayer(image, glow, colors.glow), glowTrim);
    drawLayer(ctx, glowLayer, glow, originW, originH);
  }
  if (innerGlow) drawLayer(ctx, extractLayer(image, innerGlow, colors.glow), innerGlow, originW, originH);
  if (secondary) drawLayer(ctx, extractLayer(image, secondary, colors.secondary), secondary, originW, originH, detailScale);
  if (base) {
    const baseLayer = fillLayerBorder(extractLayer(image, base, colors.primary), borderFill, colors.primary);
    drawLayer(ctx, baseLayer, base, originW, originH);
  }
  if (extra) drawLayer(ctx, extractLayer(image, extra, null, true), extra, originW, originH);
}

// -------------------- Fallback rendering --------------------
// Modes with no sprite art yet get a simple vector icon in the player's
// colours, so every mode is playable and visible even before its art lands.
function drawFallbackIcon(canvas, mode, number, colors) {
  const size = 120;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const primary = (colors && colors.primary) || '#00ffcc';
  const secondary = (colors && colors.secondary) || '#ff00aa';
  const glow = (colors && colors.glow) || '#ffffff';

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 14;

  if (mode === EntityTypes.SHIP) {
    // Simple triangular ship hull with a cockpit dot.
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.moveTo(12, 84);
    ctx.lineTo(66, 84);
    ctx.lineTo(104, 60);
    ctx.lineTo(66, 36);
    ctx.lineTo(12, 36);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.arc(56, 60, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (mode === EntityTypes.BALL) {
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(60, 60, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(60, 60, 26, 0, Math.PI * 2);
    ctx.stroke();
  } else if (mode === EntityTypes.WAVE) {
    ctx.strokeStyle = primary;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(14, 88);
    ctx.lineTo(44, 88);
    ctx.lineTo(60, 32);
    ctx.lineTo(76, 88);
    ctx.lineTo(106, 88);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.arc(60 + ((number || 1) % 3) * 4, 60, 8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Default: rounded cube with a secondary inset, like the real GD icons.
    ctx.fillStyle = primary;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(14, 14, 92, 92, 18);
    else ctx.rect(14, 14, 92, 92);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = secondary;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(32, 32, 56, 56, 10);
    else ctx.rect(32, 32, 56, 56);
    ctx.fill();
    ctx.fillStyle = glow;
    ctx.fillRect(52, 40, 16, 16);
  }
  ctx.restore();
}

// -------------------- Public handler --------------------
class IconHandler {
  constructor(canvasElement, playerColors) {
    this.canvas = canvasElement; // a <canvas> element
    this.colors = playerColors;  // { primary, secondary, glow }
    this.mode = null;
    this.number = null;
  }

  async setMode(mode) {
    const starter = getStarterIcon(mode);
    if (starter === null) {
      console.warn(`No icons available yet for mode: ${mode}`);
      return;
    }
    await this.setIconByNumber(mode, starter);
  }

  async setIconByNumber(mode, number) {
    this.mode = mode;
    this.number = number;
    await renderIcon(this.canvas, mode, number, this.colors);
  }

  async setColors(playerColors) {
    this.colors = playerColors;
    if (this.mode && this.number !== null) {
      await renderIcon(this.canvas, this.mode, this.number, this.colors);
    }
  }

  // Builds a clickable thumbnail canvas for every icon available in a mode
  async renderSelectList(listElement) {
    if (!this.mode) return;
    listElement.innerHTML = '';

    for (const number of getAvailableIcons(this.mode)) {
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.className = 'icon-thumb';
      await renderIcon(thumbCanvas, this.mode, number, this.colors);
      thumbCanvas.addEventListener('click', () => this.setIconByNumber(this.mode, number));
      listElement.appendChild(thumbCanvas);
    }
  }
}