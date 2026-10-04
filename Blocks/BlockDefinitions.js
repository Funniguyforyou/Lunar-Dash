/*
 * BlockDefinitions.js
 * ------------------------------------------------------------
 * Central registry for Geometry Dash 2.1 level assets.
 *
 * Source atlases:
 *   Images/MenuImgs/GJ_GameSheet-uhd.png/.plist
 *   Images/MenuImgs/GJ_GameSheet02-uhd.png/.plist
 *
 * The plist files are the source of truth for available artwork.
 * Every frame is registered automatically; this file only determines
 * the gameplay family/type of each frame.
 *
 * Load order:
 *   Data.js
 *   SheetHandler.js
 *   BlockDefinitions.js
 *   Levels.js
 *
 * UHD artwork is 4x the game's logical 30px tile scale.
 */

const BLOCK_ASSET_SCALE = 4;
const BLOCK_TILE_SIZE = 30;

const blockAssetSheets = {
  blocks: {
    key: 'blocks',
    png: 'Images/MenuImgs/GJ_GameSheet-uhd.png',
    plist: 'Images/MenuImgs/GJ_GameSheet-uhd.plist',
  },

  objects: {
    key: 'objects',
    png: 'Images/MenuImgs/GJ_GameSheet02-uhd.png',
    plist: 'Images/MenuImgs/GJ_GameSheet02-uhd.plist',
  },
};

/*
 * Gameplay families for the main GameSheet.
 *
 * The actual plist contains many specific families such as:
 * block001, block002, block003, block004, block005, etc.
 *
 * We classify families by their actual sprite-name structure instead
 * of requiring every individual plist frame to be manually listed.
 */
const blockFamilyDefinitions = {
  // Solid geometry
  block:         { type: 'block', collision: 'solid' },
  square:        { type: 'block', collision: 'solid' },
  plank:         { type: 'block', collision: 'solid' },
  colorPlank:    { type: 'block', collision: 'solid' },
  brick:         { type: 'block', collision: 'solid' },
  colorSquare:   { type: 'block', collision: 'solid' },

  // Hazards
  spike:         { type: 'spike', collision: 'hazard' },
  colorSpike:    { type: 'spike', collision: 'hazard' },
  fakeSpike:     { type: 'spike', collision: 'none' },
  iceSpike:      { type: 'spike', collision: 'hazard' },

  // Saws / rotating hazards
  sawblade:      { type: 'saw', collision: 'hazard' },
  blade:         { type: 'saw', collision: 'hazard' },
  darkblade:     { type: 'saw', collision: 'hazard' },
  lightBlade:    { type: 'saw', collision: 'hazard' },
  blackCogwheel: { type: 'saw', collision: 'hazard' },
  bladeTrap01:   { type: 'saw', collision: 'hazard' },
  bladeTrap02:   { type: 'saw', collision: 'hazard' },
  bladeTrap03:   { type: 'saw', collision: 'hazard' },
  spinBlade01:   { type: 'saw', collision: 'hazard' },
  spinBlade02:   { type: 'saw', collision: 'hazard' },

  // Rings / triggers
  dashRing:      { type: 'ring', collision: 'trigger' },
  dropRing:      { type: 'ring', collision: 'trigger' },
  ring:          { type: 'ring', collision: 'trigger' },
  gravRing:      { type: 'ring', collision: 'trigger' },
  gravJumpRing:  { type: 'ring', collision: 'trigger' },

  // Boosts
  boost:         { type: 'boost', collision: 'trigger' },

  // Portals
  portal:        { type: 'portal', collision: 'trigger' },

  // Decoration
  blockDesign01:      { type: 'decoration', collision: 'none' },
  blockDesign02:      { type: 'decoration', collision: 'none' },
  blockDesign03:      { type: 'decoration', collision: 'none' },
  blockDesign04:      { type: 'decoration', collision: 'none' },
  blockDesign05:      { type: 'decoration', collision: 'none' },
  blockDesign06:      { type: 'decoration', collision: 'none' },
  blockDesign07:      { type: 'decoration', collision: 'none' },
  blockOutline:       { type: 'decoration', collision: 'none' },
  blockOutlineThick:  { type: 'decoration', collision: 'none' },
  blockOutlineThickb: { type: 'decoration', collision: 'none' },
  blockOutlineOuter1: { type: 'decoration', collision: 'none' },
  blockOutlineOuter2: { type: 'decoration', collision: 'none' },
  blockOutlineOuter3: { type: 'decoration', collision: 'none' },

  fireball:      { type: 'decoration', collision: 'none' },
  lava:          { type: 'decoration', collision: 'none' },
  waterfallAnim: { type: 'decoration', collision: 'none' },
  waterSplash:   { type: 'decoration', collision: 'none' },
  starAnim:      { type: 'decoration', collision: 'none' },
  lightsquare:   { type: 'decoration', collision: 'none' },
  lighttriangle: { type: 'decoration', collision: 'none' },
  puzzle:        { type: 'decoration', collision: 'none' },
  triangle:      { type: 'decoration', collision: 'none' },
  persp:         { type: 'decoration', collision: 'none' },
  pit:           { type: 'decoration', collision: 'none' },
  invis:         { type: 'decoration', collision: 'none' },
  invisibleOutline: { type: 'decoration', collision: 'none' },

  // Non-solid decorative props. GD's whole `d_*` namespace (d_sign, d_ball,
  // d_gradient, d_animWave, …) is covered by a rule in classifyAsset so every
  // real sub-family is handled without hard-coding a list of names.
  dA:            { type: 'decoration', collision: 'none' },
  bump:          { type: 'decoration', collision: 'none' },
  gravbump:      { type: 'decoration', collision: 'none' },
  chain:         { type: 'decoration', collision: 'none' },
  rod:           { type: 'decoration', collision: 'none' },
  smallOutline:  { type: 'decoration', collision: 'none' },

  // Invisible hazards. They get their own family so a lookup for a plain
  // `spike` can never resolve to invisible art, but they ARE hazards.
  invisSpike:    { type: 'spike',      collision: 'hazard' },
};

/*
 * GameSheet02 families.
 */
const secondaryFamilyDefinitions = {
  portal:     { type: 'portal',     collision: 'trigger' },
  boost:      { type: 'boost',      collision: 'trigger' },

  player:     { type: 'player',     collision: 'none' },
  ship:       { type: 'player',     collision: 'none' },
  robot:      { type: 'player',     collision: 'none' },
  spider:     { type: 'player',     collision: 'none' },
  bird:       { type: 'player',     collision: 'none' },
  dart:       { type: 'player',     collision: 'none' },

  fireBoost:  { type: 'boost',      collision: 'trigger' },
  checkpoint: { type: 'checkpoint', collision: 'trigger' },
};

/*
 * Extract the base family from an actual GD sprite name.
 *
 * Examples:
 *
 *   block001_01_001.png
 *       -> block001
 *
 *   block001_slope_01_001.png
 *       -> block001
 *
 *   spike_01_001.png
 *       -> spike
 *
 *   portal_01_front_001.png
 *       -> portal
 *
 *   d_sign_01_001.png
 *       -> d_sign
 */
function getBaseFamily(frameName) {
  const name = String(frameName)
    .replace(/\.(png|webp)$/i, '');

  if (name.startsWith('block')) {
    const match = name.match(/^(block\d+[a-z]*)/i);
    if (match) return match[1];
  }

  /*
   * GD's decoration namespace keeps a real sub-family behind the `d_` prefix
   * (d_sign, d_ball, d_square, d_gradient, d_animWave, d_block04, d_cloud,
   * d_grass, d_cogwheel, ...). Without this rule every one of those frames
   * collapses into a single opaque family called `d`.
   */
  if (/^d_/i.test(name)) {
    const parts = name.split('_');

    /*
     * `d_02_chain_01_001.png` is one sub-family called `d_02_chain`, not a
     * generic `d_02`, so a purely numeric bucket name is not the whole family.
     */
    if (
      parts[1] &&
      /^\d+$/.test(parts[1]) &&
      parts[2]
    ) {
      return `${parts[0]}_${parts[1]}_${parts[2]}`;
    }

    return parts[1]
      ? `${parts[0]}_${parts[1]}`
      : parts[0];
  }

  return name.split('_')[0];
}

/*
 * Determine the actual structural family of a frame.
 *
 * This is intentionally more specific than simply splitting at "_".
 */
function getAssetFamily(frameName) {
  const name = String(frameName)
    .replace(/\.(png|webp)$/i, '');

  // Slopes are a separate gameplay family.
  if (/_slope_/i.test(name)) {
    return 'slope';
  }

  /*
   * Decoration sub-families (d_sign, d_ball, d_gradient, ...) each keep their
   * own name instead of sharing one `d` bucket.
   */
  if (/^d_/i.test(name)) {
    return getBaseFamily(name);
  }

  /*
   * Invisible spikes are spikes with the visible art removed, so they are
   * hazards - but they keep their own family so a lookup for a normal `spike`
   * can never resolve to invisible art. Checked before the generic `invis_*`
   * decoration rule further down.
   */
  if (/^invis_spike/i.test(name)) {
    return 'invisSpike';
  }

  // Fake spikes must be checked before normal spikes.
  if (/^fakeSpike/i.test(name)) {
    return 'fakeSpike';
  }

  if (/^iceSpike/i.test(name)) {
    return 'iceSpike';
  }

  if (/^colorSpike/i.test(name)) {
    return 'colorSpike';
  }

  if (/^spike/i.test(name)) {
    return 'spike';
  }

  if (/^blackCogwheel/i.test(name)) {
    return 'blackCogwheel';
  }

  if (/^bladeTrap01/i.test(name)) {
    return 'bladeTrap01';
  }

  if (/^bladeTrap02/i.test(name)) {
    return 'bladeTrap02';
  }

  if (/^bladeTrap03/i.test(name)) {
    return 'bladeTrap03';
  }

  if (/^spinBlade01/i.test(name)) {
    return 'spinBlade01';
  }

  if (/^spinBlade02/i.test(name)) {
    return 'spinBlade02';
  }

  if (/^darkblade/i.test(name)) {
    return 'darkblade';
  }

  if (/^lightBlade/i.test(name)) {
    return 'lightBlade';
  }

  if (/^sawblade/i.test(name)) {
    return 'sawblade';
  }

  if (/^blade/i.test(name)) {
    return 'blade';
  }

  if (/^dashRing/i.test(name)) {
    return 'dashRing';
  }

  if (/^dropRing/i.test(name)) {
    return 'dropRing';
  }

  if (/^gravJumpRing/i.test(name)) {
    return 'gravJumpRing';
  }

  if (/^gravRing/i.test(name)) {
    return 'gravRing';
  }

  if (/^ring/i.test(name)) {
    return 'ring';
  }

  if (/^portal/i.test(name)) {
    return 'portal';
  }

  if (/^fireBoost/i.test(name)) {
    return 'fireBoost';
  }

  if (/^checkpoint/i.test(name)) {
    return 'checkpoint';
  }

  if (/^ship/i.test(name)) {
    return 'ship';
  }

  if (/^robot/i.test(name)) {
    return 'robot';
  }

  if (/^spider/i.test(name)) {
    return 'spider';
  }

  if (/^bird/i.test(name)) {
    return 'bird';
  }

  if (/^dart/i.test(name)) {
    return 'dart';
  }

  return getBaseFamily(name);
}

/*
 * Classify one actual plist frame.
 */
function classifyAsset(frameName, sheetKey) {
  const name = String(frameName)
    .replace(/\.(png|webp)$/i, '');

  const family = getAssetFamily(name);
  const baseFamily = getBaseFamily(name);

  /*
   * Editor-only artwork. The `edit_*` frames are the level editor's own
   * buttons/widgets and the `gridLine*` frames are its grid overlay, so they
   * are never level geometry and get their own type.
   */
  if (
    /^edit_/i.test(name) ||
    /^gridLine/i.test(baseFamily)
  ) {
    return {
      family,
      baseFamily,
      type: 'editor',
      collision: 'none',
    };
  }

  /*
   * Invisible spikes: a hazard (see getAssetFamily), resolved before the
   * generic `invis` decoration entry so it can never be filed as decoration.
   */
  if (family === 'invisSpike') {
    return {
      family,
      baseFamily,
      type: 'spike',
      collision: 'hazard',
    };
  }

  /*
   * Slopes are solid geometry. They stay in the shared `slope` family for
   * compatibility, and every slope also records the block family it was cut
   * from (see `slopeFamily` in registerSheet).
   */
  if (family === 'slope') {
    return {
      family,
      baseFamily,
      type: 'slope',
      collision: 'solid',
    };
  }

  /*
   * Actual block families:
   *
   * block001_...
   * block002_...
   * block003_...
   * etc.
   *
   * The artwork family is retained instead of collapsing every
   * block into one generic sprite.
   */
  if (
    sheetKey === 'blocks' &&
    /^block\d+[a-z]*$/i.test(baseFamily)
  ) {
    return {
      family: baseFamily,
      baseFamily,
      type: 'block',
      collision: 'solid',
    };
  }

  const definitions =
    sheetKey === 'objects'
      ? secondaryFamilyDefinitions
      : blockFamilyDefinitions;

  const known = definitions[family] || definitions[baseFamily];

  if (known) {
    return {
      family,
      baseFamily,
      type: known.type,
      collision: known.collision,
    };
  }

  /*
   * `plank005`, `plank005b` and `plank007` are styles of the same solid plank
   * geometry the catalog already registers as a block, so they are classified
   * as blocks rather than left as unknown artwork.
   */
  if (
    sheetKey === 'blocks' &&
    /^plank\d+[a-z]*$/i.test(baseFamily)
  ) {
    return {
      family,
      baseFamily,
      type: 'block',
      collision: 'solid',
    };
  }

  /*
   * GD's `d_*` decoration namespace (d_sign, d_ball, d_square, d_gradient,
   * d_animLoading, d_animWave, d_block04, d_cloud, d_grass, d_cogwheel,
   * d_02_chain, ...) is non-solid prop art. The rule matches the namespace
   * itself instead of a hard-coded list, so every real sub-family present in
   * the plist is covered.
   *
   * This deliberately does not assert any gameplay behavior: chains and links
   * stay non-colliding until a later pass knows what they do.
   */
  if (/^d_/i.test(family)) {
    return {
      family,
      baseFamily,
      type: 'decoration',
      collision: 'none',
    };
  }

  /*
   * Anything unknown stays available.
   * Unknown artwork must never become a gameplay hazard accidentally.
   */
  return {
    family,
    baseFamily,
    type: 'unknown',
    collision: 'none',
  };
}

/*
 * Extract useful variant information from actual GD names.
 *
 * This is the historical, backward-compatible extraction and MUST NOT change:
 * callers (and level JSON) may ask for the literal remainder of the frame name,
 * e.g. find('block001', '01_001') or find('spike', '02_001').
 *
 * Examples:
 *
 * block001_01_001.png
 *   -> "01"
 *
 * block001_slope_01_001.png  (family 'slope' does not prefix-match)
 *   -> "block001_slope_01"
 *
 * portal_01_front_001.png
 *   -> "01_front"
 *
 * Only the atlas' leading `_001` frame counter is dropped, and only when it
 * really is the trailing token: animation frames 002/003/... keep their
 * counter (`d_animLoading_01_002.png` stays "animLoading_01_002"), so animated
 * families keep distinct variants exactly as before.
 */
function frameVariant(frameName, family) {
  const stem = String(frameName)
    .replace(/\.(png|webp)$/i, '');

  const base = String(family || '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return stem
    .replace(
      new RegExp(`^${base}_?`, 'i'),
      ''
    )
    .replace(/_001$/i, '');
}

/*
 * The variant before the leading `_001` frame counter is removed, exposed as
 * `variantFull` on every definition. This is purely additive: `variant` above
 * keeps its original value, and matchVariant() always tries the legacy value
 * first, so a new lookup can never win over an existing one.
 *
 * block001_01_001.png       -> "01_001"
 * block001_slope_01_001.png -> "block001_slope_01_001"
 * portal_01_front_001.png   -> "01_front_001"
 */
function frameVariantFull(frameName, family) {
  const stem = String(frameName)
    .replace(/\.(png|webp)$/i, '');

  const base = String(family || '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return stem.replace(
    new RegExp(`^${base}_?`, 'i'),
    ''
  );
}

/*
 * Shared variant matcher behind find() / findBase() / findSlope().
 *
 * Passes 1 and 2 are byte-for-byte the original lookup order, so every
 * family/variant pair that resolved before still resolves to the same frame.
 * The later passes are strictly additive: they only reach a frame the original
 * matcher missed, and they only run after the original passes have failed.
 */
function matchVariant(list, variant) {
  if (!list.length) return null;

  if (!variant) return list[0] || null;

  const wanted = String(variant);

  return (
    // 1. Legacy exact match on the variant.
    list.find(
      entry => entry.variant === wanted
    ) ||

    // 2. Legacy containment test against the frame id.
    list.find(
      entry =>
        entry.id.includes(`_${wanted}_`)
    ) ||

    // 3. Exact match when the caller spells the variant WITH the atlas
    //    counter ("01_001" for block001_01_001.png).
    list.find(
      entry => entry.variantFull === wanted
    ) ||

    // 4. Exact match on the frame id itself.
    list.find(
      entry => entry.id === wanted
    ) ||

    // 5. Containment against the id, so a trailing token still matches
    //    (the wanted token at the end of a frame id).
    list.find(
      entry =>
        entry.id.includes(`_${wanted}`)
    ) ||

    null
  );
}

const BlockDefinitions = {
  scale: BLOCK_ASSET_SCALE,
  tileSize: BLOCK_TILE_SIZE,

  sheets: blockAssetSheets,

  families: {
    ...blockFamilyDefinitions,
    ...secondaryFamilyDefinitions,

    slope: {
      type: 'slope',
      collision: 'solid',
    },
  },

  frames: {},
  byFamily: {},
  byBaseFamily: {},
  byType: {},

  /*
   * Slopes are registered in the shared `slope` family (so existing
   * `find('slope', ...)` lookups are untouched) AND indexed again by the block
   * family each slope was cut from, so a slope inside one block style resolves
   * deterministically.
   */
  bySlopeFamily: {},

  sheetObjects: {},

  loaded: false,

  async load() {
    if (this.loaded) return this;

    if (typeof getSheet !== 'function') {
      throw new Error(
        'BlockDefinitions requires SheetHandler.js to be loaded first.'
      );
    }

    const [blocksSheet, objectsSheet] = await Promise.all([
      getSheet(
        blockAssetSheets.blocks.png,
        blockAssetSheets.blocks.plist
      ),

      getSheet(
        blockAssetSheets.objects.png,
        blockAssetSheets.objects.plist
      ),
    ]);

    this.registerSheet('blocks', blocksSheet);
    this.registerSheet('objects', objectsSheet);

    this.sheetObjects = {
      blocks: blocksSheet,
      objects: objectsSheet,
    };

    this.loaded = true;

    return this;
  },

  registerSheet(sheetKey, sheet) {
    if (!sheet || !sheet.frames) return;

    for (const [frameName, frame] of Object.entries(sheet.frames)) {
      const classification = classifyAsset(
        frameName,
        sheetKey
      );

      const family = classification.family;
      const baseFamily = classification.baseFamily;

      const logicalWidth =
        (
          frame.srcW ??
          frame.sizeW ??
          frame.rect?.w ??
          0
        ) / BLOCK_ASSET_SCALE;

      const logicalHeight =
        (
          frame.srcH ??
          frame.sizeH ??
          frame.rect?.h ??
          0
        ) / BLOCK_ASSET_SCALE;

      const definition = {
        id: frameName,
        frame: frameName,
        sheet: sheetKey,

        family,
        baseFamily,

        type: classification.type,
        collision: classification.collision,

        atlas: {
          rect: frame.rect || null,

          source: {
            w:
              frame.srcW ??
              frame.sizeW ??
              frame.rect?.w ??
              0,

            h:
              frame.srcH ??
              frame.sizeH ??
              frame.rect?.h ??
              0,
          },

          offset: {
            x: frame.offX ?? 0,
            y: frame.offY ?? 0,
          },

          rotated: !!frame.rotated,
        },

        size: {
          width: logicalWidth,
          height: logicalHeight,
        },

        // Historical value, unchanged from before: the literal remainder of
        // the frame name after its family prefix.
        variant: frameVariant(
          frameName,
          family
        ),

        // The variant with the atlas' trailing `_001` counter removed, so a
        // caller may spell it either way ("01" or "01_001"). Purely additive -
        // `variant` above keeps its exact legacy value, and matchVariant()
        // always tries that legacy value first.
        variantFull: frameVariantFull(
          frameName,
          family
        ),
      };

      this.frames[frameName] = definition;

      /*
       * A slope keeps the shared `slope` family for compatibility, but it also
       * remembers the block family it belongs to (block001_slope_01 -> block001)
       * so `findSlope('block001', ...)` is deterministic.
       */
      if (classification.type === 'slope') {
        definition.slopeFamily = baseFamily;

        if (!this.bySlopeFamily[baseFamily]) {
          this.bySlopeFamily[baseFamily] = [];
        }

        this.bySlopeFamily[baseFamily].push(definition);
      }

      if (!this.byFamily[family]) {
        this.byFamily[family] = [];
      }

      this.byFamily[family].push(definition);

      if (!this.byBaseFamily[baseFamily]) {
        this.byBaseFamily[baseFamily] = [];
      }

      this.byBaseFamily[baseFamily].push(definition);

      if (!this.byType[classification.type]) {
        this.byType[classification.type] = [];
      }

      this.byType[classification.type].push(definition);
    }
  },

  get(frameName) {
    return this.frames[frameName] || null;
  },

  sheetFor(definition) {
    const key =
      typeof definition === 'string'
        ? definition
        : definition?.sheet;

    return this.sheetObjects[key] || null;
  },

  getFamily(family) {
    return this.byFamily[family] || [];
  },

  getBaseFamily(baseFamily) {
    return this.byBaseFamily[baseFamily] || [];
  },

  getType(type) {
    return this.byType[type] || [];
  },

  has(frameName) {
    return !!this.frames[frameName];
  },

  find(family, variant = '') {
    return matchVariant(
      this.getFamily(family),
      variant
    );
  },

  findBase(baseFamily, variant = '') {
    return matchVariant(
      this.getBaseFamily(baseFamily),
      variant
    );
  },

  /*
   * Every slope is registered under the shared `slope` family so existing
   * `find('slope', ...)` lookups keep working, but each one also knows the block
   * family it was cut from. This resolves a slope inside that one block family,
   * so `findSlope('block001', 'slope_01')` is deterministic instead of
   * returning whichever slope happened to be packed first in the atlas.
   */
  getSlopeFamily(baseFamily) {
    return this.bySlopeFamily[baseFamily] || [];
  },

  findSlope(baseFamily, variant = '') {
    return matchVariant(
      this.getSlopeFamily(baseFamily),
      variant
    );
  },

  frameName(frameName) {
    const definition = this.get(frameName);

    return definition
      ? definition.frame
      : null;
  },

  stats() {
    const familyCount =
      Object.keys(this.byFamily).length;

    const baseFamilyCount =
      Object.keys(this.byBaseFamily).length;

    const typeCount =
      Object.keys(this.byType).length;

    return {
      totalFrames:
        Object.keys(this.frames).length,

      families: familyCount,

      baseFamilies:
        baseFamilyCount,

      types: typeCount,

      byType:
        Object.fromEntries(
          Object.entries(this.byType).map(
            ([type, list]) => [
              type,
              list.length,
            ]
          )
        ),
    };
  },
};

async function loadBlockDefinitions() {
  return BlockDefinitions.load();
}