// SheetHandler.js
// Shared resource layer: image loading, Cocos2d .plist sprite atlases, and
// BMFont (.fnt) bitmap text. Load this first — IconHandler and MainHandler both
// depend on it.
//
//   getSheet(pngPath, plistPath) -> Sheet   (cached)
//   getImage(pngPath)           -> HTMLImageElement (cached)
//   getFont(fntPath)            -> BitmapFont (cached, reads its page PNG itself)
//   parsePlist(xmlText)         -> plain object tree
//   parseRect / parsePoint / parseValue / parseDict

// -------------------- Images --------------------
const imageCache = new Map(); // src -> Promise<HTMLImageElement>

function getImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });

  imageCache.set(src, promise);
  // A failed load shouldn't poison the cache — let a later call retry
  promise.catch(() => imageCache.delete(src));
  return promise;
}

// Kept as a named alias because IconHandler's original API used this name
function loadImage(src) {
  return getImage(src);
}

// -------------------- Plist parsing --------------------
// These plists are plain XML; the browser's own DOMParser handles them and this
// repo has no XML dependency to add.
function parsePlist(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const rootDict = xml.querySelector('plist > dict');
  return parseDict(rootDict);
}

function parseDict(dictEl) {
  const result = {};
  const children = Array.from(dictEl.children);
  for (let i = 0; i < children.length; i += 2) {
    const key = children[i].textContent;
    result[key] = parseValue(children[i + 1]);
  }
  return result;
}

function parseValue(el) {
  switch (el.tagName) {
    case 'dict':    return parseDict(el);
    case 'array':   return Array.from(el.children).map(parseValue);
    case 'integer': return parseInt(el.textContent, 10);
    case 'real':    return parseFloat(el.textContent);
    case 'true':    return true;
    case 'false':   return false;
    default:        return el.textContent; // string
  }
}

// "{x,y,w,h}" or "{{x,y},{w,h}}" -> { x, y, w, h }
function parseRect(str) {
  const nums = String(str).match(/-?\d+(\.\d+)?/g).map(Number);
  return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
}

// "{x,y}" or "{w, h}" -> { x, y }
function parsePoint(str) {
  const nums = String(str).match(/-?\d+(\.\d+)?/g).map(Number);
  return { x: nums[0], y: nums[1] };
}

function parseSize(str) {
  const p = parsePoint(str);
  return { w: p.x, h: p.y };
}

// -------------------- Sprite atlases --------------------
// A frame in a Cocos2d plist is described by:
//   textureRect      where the (possibly trimmed) pixels live in the sheet
//   spriteSourceSize the artist's intended size, before trimming
//   spriteOffset     how far the trimmed pixels were nudged inside that box
// Honouring all three means trimmed and untrimmed sprites both land correctly.
const sheetCache = new Map(); // plist path -> Promise<Sheet>

class Sheet {
  constructor(image, frames, size) {
    this.image = image;
    this.frames = frames;
    this.width = size.w;
    this.height = size.h;
  }

  has(name) {
    return Object.prototype.hasOwnProperty.call(this.frames, name);
  }

  frame(name) {
    return this.frames[name] || null;
  }

  /** Visual size of a frame's ink at a given scale. */
  size(name, scale = 1) {
    const f = this.frames[name];
    return f ? { w: f.rect.w * scale, h: f.rect.h * scale } : { w: 0, h: 0 };
  }

  /**
   * Draws a named frame. `x`, `y` is the anchor point.
   *
   * Sizing: with `scale`, the ink is drawn at its natural pixel size times the
   * scale (so 1 = the artist's intended size). With `width`/`height`, the frame
   * is fitted inside that box without distorting its aspect ratio.
   *
   * Trim handling: the trimmed ink is centred on the anchor. These sheets store
   * a centred trim for every frame this project draws (verified across all 469
   * frames of GJ_GameSheet03 and all 5 of GJ_LaunchSheet), so applying
   * spriteOffset as well would push sprites off-centre by the trim amount.
   */
  draw(ctx, name, x, y, opts = {}) {
    const frame = this.frames[name];
    if (!frame) {
      console.warn(`Sheet frame not found: ${name}`);
      return false;
    }

    let w;
    let h;
    if (opts.width != null || opts.height != null) {
      const k = Math.min(
        opts.width != null ? opts.width / frame.rect.w : Infinity,
        opts.height != null ? opts.height / frame.rect.h : Infinity
      );
      w = frame.rect.w * k;
      h = frame.rect.h * k;
    } else {
      const scale = opts.scale ?? 1;
      w = frame.rect.w * scale;
      h = frame.rect.h * scale;
    }

    const box = anchorBox(x, y, w, h, opts.anchor || 'center');

    const prevAlpha = ctx.globalAlpha;
    if (opts.alpha != null) ctx.globalAlpha = prevAlpha * opts.alpha;

    if (frame.rotated) {
      // TexturePacker stores this frame's pixels rotated 90deg CW on disk, so
      // the atlas footprint is (h x w). Blit that raw footprint and rotate it
      // back upright around the destination centre.
      const sw = frame.rect.h; // on-disk width
      const sh = frame.rect.w; // on-disk height
      ctx.save();
      ctx.translate(box.x + w / 2, box.y + h / 2);
      if (opts.rotation) ctx.rotate(opts.rotation);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(
        this.image,
        frame.rect.x, frame.rect.y, sw, sh,
        -h / 2, -w / 2, h, w
      );
      ctx.restore();
    } else {
      ctx.save();
      if (opts.rotation) {
        ctx.translate(box.x + w / 2, box.y + h / 2);
        ctx.rotate(opts.rotation);
        ctx.translate(-(box.x + w / 2), -(box.y + h / 2));
      }
      ctx.drawImage(
        this.image,
        frame.rect.x, frame.rect.y, frame.rect.w, frame.rect.h,
        box.x, box.y, w, h
      );
      ctx.restore();
    }

    ctx.globalAlpha = prevAlpha;
    return true;
  }
}

// Top-left corner for a box of `w`x`h` placed at an anchor point.
// Supported: topLeft | topCenter | topRight | centerLeft | center | centerRight
//            bottomLeft | bottomCenter | bottomRight   (plus 'left'/'right')
function anchorBox(x, y, w, h, anchor = 'center') {
  const a = String(anchor).toLowerCase();

  let left = x - w / 2;
  if (a.includes('left')) left = x;
  else if (a.includes('right')) left = x - w;

  let top = y - h / 2;
  if (a.startsWith('top')) top = y;
  else if (a.startsWith('bottom')) top = y - h;

  return { x: left, y: top, w, h };
}

// ============================================================
// Bitmap fonts (BMFont .fnt text format)
// ============================================================
// Line based:
//   info face="Pusab" size=128 ...
//   common lineHeight=130 base=78 scaleW=1024 scaleH=1024 pages=1
//   page id=0 file="bigFont-uhd.png"
//   char id=65 x=413 y=240 width=109 height=104 xoffset=-0 yoffset=23 xadvance=95
//   kerning first=65 second=84 amount=-17
//
// Placement: a glyph's top-left is (penX + xoffset, lineTop + yoffset).
// We deliberately don't use `base`: in these files yoffset is already an
// absolute offset from the top of the line, which is provable because
// (yoffset + height) is a constant 127 across every baseline-sitting glyph.

const fontCache = new Map(); // fnt path -> Promise<BitmapFont>
const tintCache = new Map(); // `${src}|${colour}` -> canvas

function parseFntAttrs(line) {
  const attrs = {};
  const re = /([a-zA-Z]+)=("[^"]*"|\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    let value = m[2];
    if (value.startsWith('"')) value = value.slice(1, -1);
    attrs[m[1]] = value;
  }
  return attrs;
}

function parseFnt(text, fntPath) {
  const dir = fntPath.slice(0, fntPath.lastIndexOf('/') + 1);
  const chars = new Map();
  const kernings = new Map();
  let info = {};
  let common = {};
  let pageFile = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const kind = line.slice(0, line.indexOf(' '));
    const attrs = parseFntAttrs(line);

    switch (kind) {
      case 'info':   info = attrs; break;
      case 'common': common = attrs; break;
      case 'page':   pageFile = attrs.file; break;
      case 'char':
        chars.set(Number(attrs.id), {
          id: Number(attrs.id),
          x: +attrs.x, y: +attrs.y,
          width: +attrs.width, height: +attrs.height,
          xoffset: +attrs.xoffset, yoffset: +attrs.yoffset,
          xadvance: +attrs.xadvance,
        });
        break;
      case 'kerning':
        kernings.set(`${attrs.first},${attrs.second}`, +attrs.amount);
        break;
      default: break; // 'chars count=96', 'kernings count=506', comments
    }
  }

  if (!pageFile) throw new Error(`Font has no "page" entry: ${fntPath}`);
  return { info, common, chars, kernings, pagePath: dir + pageFile };
}

class BitmapFont {
  constructor(def, image) {
    this.info = def.info;
    this.common = def.common;
    this.chars = def.chars;
    this.kernings = def.kernings;
    this.image = image;

    // Guard against a page PNG whose size disagrees with common's scaleW/H
    this.kx = image.width / def.common.scaleW;
    this.ky = image.height / def.common.scaleH;
  }

  get lineHeight() {
    return this.common.lineHeight * this.ky;
  }

  // Cap height, read from 'H' (or 'A'), for sizing text by visual height
  get capHeight() {
    const glyph = this.chars.get(72) || this.chars.get(65);
    return glyph ? glyph.height * this.ky : this.lineHeight;
  }

  // Scale factor that renders capital letters `capPx` pixels tall
  scaleForCap(capPx) {
    return capPx / this.capHeight;
  }

  glyph(ch) {
    return this.chars.get(ch.codePointAt(0)) || null;
  }

  kern(a, b) {
    return this.kernings.get(`${a.codePointAt(0)},${b.codePointAt(0)}`) || 0;
  }

  // Width/height of the text block in pixels at a given scale
  measure(text, scale = 1) {
    const lines = String(text).split('\n');
    let width = 0;

    for (const line of lines) {
      let pen = 0;
      let prev = null;
      for (const ch of line) {
        const glyph = this.glyph(ch);
        if (!glyph) continue;
        if (prev !== null) pen += this.kern(prev, ch);
        pen += glyph.xadvance;
        prev = ch;
      }
      width = Math.max(width, pen);
    }

    return {
      width: width * scale * this.kx,
      height: lines.length * this.lineHeight * scale,
    };
  }

  /**
   * Draws text. `x`,`y` is the anchor point (default top-left of the first
   * line). `align` is horizontal (left|center|right), `anchor` is vertical
   * (top|center|bottom). `color` optionally flattens the glyphs to one colour.
   */
  draw(ctx, text, x, y, opts = {}) {
    const scale = opts.scale ?? 1;
    const align = opts.align || 'left';
    const lines = String(text).split('\n');
    const lineHeight = this.lineHeight * scale;
    const blockHeight = lines.length * lineHeight;

    let top = y;
    if (opts.anchor === 'center') top = y - blockHeight / 2;
    else if (opts.anchor === 'bottom') top = y - blockHeight;

    // Optional flat recolour, via a cached tinted copy of the whole atlas
    const atlas = opts.color ? tintedAtlas(this.image, opts.color) : this.image;

    const prevAlpha = ctx.globalAlpha;
    if (opts.alpha != null) ctx.globalAlpha = prevAlpha * opts.alpha;

    lines.forEach((line, index) => {
      const lineWidth = this.measure(line, scale).width;
      let pen = x;
      if (align === 'center') pen = x - lineWidth / 2;
      else if (align === 'right') pen = x - lineWidth;

      const lineTop = top + index * lineHeight;
      let prev = null;

      for (const ch of line) {
        const glyph = this.glyph(ch);
        if (!glyph) continue;

        // Kerning tightens the gap between the previous glyph and this one
        if (prev !== null) pen += this.kern(prev, ch) * scale * this.kx;

        if (glyph.width > 0 && glyph.height > 0) {
          ctx.drawImage(
            atlas,
            glyph.x, glyph.y, glyph.width, glyph.height,
            pen + glyph.xoffset * scale * this.kx,
            lineTop + glyph.yoffset * scale * this.ky,
            glyph.width * this.kx * scale,
            glyph.height * this.ky * scale
          );
        }

        pen += glyph.xadvance * scale * this.kx;
        prev = ch;
      }
    });

    ctx.globalAlpha = prevAlpha;
  }
}

// Recolours the whole atlas once and caches it, so per-frame text is cheap.
function tintedAtlas(image, color) {
  const key = `${image.src}|${color}`;
  if (tintCache.has(key)) return tintCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  tintCache.set(key, canvas);
  return canvas;
}

function getFont(fntPath) {
  if (fontCache.has(fntPath)) return fontCache.get(fntPath);

  const promise = (async () => {
    const text = await fetch(fntPath).then((res) => {
      if (!res.ok) throw new Error(`Failed to load font: ${fntPath} (${res.status})`);
      return res.text();
    });

    const def = parseFnt(text, fntPath);
    const image = await getImage(def.pagePath); // the .fnt names its own page PNG
    return new BitmapFont(def, image);
  })();

  fontCache.set(fntPath, promise);
  promise.catch(() => fontCache.delete(fntPath));
  return promise;
}

function getSheet(pngPath, plistPath) {
  if (sheetCache.has(plistPath)) return sheetCache.get(plistPath);

  const promise = (async () => {
    const [image, plistText] = await Promise.all([
      getImage(pngPath),
      fetch(plistPath).then((res) => {
        if (!res.ok) throw new Error(`Failed to load plist: ${plistPath} (${res.status})`);
        return res.text();
      }),
    ]);

    const parsed = parsePlist(plistText);
    const frames = {};
    for (const [name, data] of Object.entries(parsed.frames || {})) {
      const raw = parseRect(data.textureRect);
      const rotated = data.textureRotated === true;
      // TexturePacker stores rotated frames sideways: the plist's w/h are the
      // logical (upright) trimmed size, while the pixels on disk occupy the
      // swapped footprint (h x w). Keep the logical size for layout/scaling
      // and remember the flag so draw() can un-rotate at blit time.
      const rect = { x: raw.x, y: raw.y, w: raw.w, h: raw.h };
      const src = data.spriteSourceSize ? parsePoint(data.spriteSourceSize) : { x: rect.w, y: rect.h };
      const size = data.spriteSize ? parsePoint(data.spriteSize) : { x: rect.w, y: rect.h };
      const off = data.spriteOffset ? parsePoint(data.spriteOffset) : { x: 0, y: 0 };

      frames[name] = {
        rect,
        rotated,
        sizeW: size.x,
        sizeH: size.y,
        srcW: src.x,
        srcH: src.y,
        offX: off.x,
        offY: off.y,
      };
    }

    const meta = parseSize(parsed.metadata.size);
    return new Sheet(image, frames, meta);
  })();

  sheetCache.set(plistPath, promise);
  promise.catch(() => sheetCache.delete(plistPath)); // allow a retry after a failure
  return promise;
}

