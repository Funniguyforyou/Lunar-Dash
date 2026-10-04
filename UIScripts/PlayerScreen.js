// -------------------- PLAYER screen (the icon kit) --------------------
// GD's garage, authored against the reference screenshot: the back arrow and the
// hanging shop sign top-left, the PLAYER heading, the big preview on its
// character-select frame, the mode-button row, the "Tap [lock] for more info!"
// hint, the icon grid with its green page arrows and page dots, the currency
// rail down the right edge and the palette shortcuts down the left.
//
// This file owns everything on the PLAYER screen EXCEPT the colour section —
// the channel tabs and the paged swatch grid live in UIScripts/ColourKit.js and
// are drawn from renderIcons() below. The state object and the async builders
// live here too, since the grid they feed is here; MainHandler.js only calls
// openIconsScreen() and renderIcons(), it no longer owns any of it.
//
// All of the art comes from the shipped atlases: the chrome (back, top bar,
// locks, coins, character-select frame, colour discs, hue wheel, shop rope and
// the long-button shop board) from GJ_GameSheet03 (`sheets.game`, reached
// through spriteButton's default sheet), and the menu-side shortcuts
// (GJ_createBtn_001, GJ_dailyBtn_001) from GJ_GameSheet04 (`sheets.menu`).
// Anything the atlases do not ship is drawn, never faked with a sprite from
// elsewhere.

// Icon art is composited by IconHandler into offscreen canvases; this screen
// just blits them, so all the layer/tint logic stays in one place.
const iconScreen = {
  mode: null,
  selected: null,
  preview: null,
  thumbs: [],     // [{ number, canvas }]
  note: '',
  requestId: 0,   // guards against an older async render finishing last
  colorTarget: 'primary', // which channel the swatch grid edits
  colourPage: 0,  // which page of the colour kit is showing
};

// GD's own icon-kit mode row: one frame per mode, in the off/on pair the desktop
// build ships (GJ_GameSheet03). The art is the real thing, so the row is GD's
// seven buttons rather than seven drawn pills.
const ICON_MODE_FRAMES = {
  [EntityTypes.CUBE]:   ['gj_iconBtn_off_001.png',   'gj_iconBtn_on_001.png'],
  [EntityTypes.SHIP]:   ['gj_shipBtn_off_001.png',   'gj_shipBtn_on_001.png'],
  [EntityTypes.BALL]:   ['gj_ballBtn_off_001.png',   'gj_ballBtn_on_001.png'],
  [EntityTypes.UFO]:    ['gj_birdBtn_off_001.png',   'gj_birdBtn_on_001.png'],
  [EntityTypes.WAVE]:   ['gj_dartBtn_off_001.png',   'gj_dartBtn_on_001.png'],
  [EntityTypes.ROBOT]:  ['gj_robotBtn_off_001.png',  'gj_robotBtn_on_001.png'],
  [EntityTypes.SPIDER]: ['gj_spiderBtn_off_001.png', 'gj_spiderBtn_on_001.png'],
};

// Stars are earned by completing levels — the same count the level cards show.
function earnedStars() {
  return Object.values(playerData.levelsCompleted || {})
    .filter((record) => record && record.completed).length;
}

// Coins, user coins, diamonds and orbs are tracked here for the rail when save
// data grows them; GD's moon (daily progress) is not tracked, so it reads 0.
function earnedCurrencies() {
  const completed = Object.values(playerData.levelsCompleted || {})
    .filter((record) => record && record.completed);
  const coins = (playerData.coins == null)
    ? completed.length : Number(playerData.coins) || 0;
  const userCoins = (playerData.userCoins == null)
    ? 0 : Number(playerData.userCoins) || 0;
  const diamonds = (playerData.diamonds == null)
    ? completed.length * 5 : Number(playerData.diamonds) || 0;
  return {
    stars: earnedStars(),
    moons: 0,
    coins,
    userCoins,
    diamonds,
    orbs: Number(playerData.orbs) || 0,
  };
}

function availableIconModes() {
  return Object.values(EntityTypes).filter((mode) => getAvailableIcons(mode).length > 0);
}

async function openIconsScreen() {
  const modes = availableIconModes();
  const preferred = modes.includes(iconScreen.mode)
    ? iconScreen.mode
    : (modes.includes(EntityTypes.CUBE) ? EntityTypes.CUBE : modes[0]);

  setScreen('icons');
  if (preferred) await buildIconScreen(preferred);
}

async function buildIconScreen(mode) {
  const myId = ++iconScreen.requestId;
  iconScreen.mode = mode;
  iconScreen.note = '';

  const numbers = getAvailableIcons(mode);
  if (numbers.length === 0) {
    iconScreen.preview = null;
    iconScreen.thumbs = [];
    iconScreen.note = 'No icons for this mode yet.';
    return;
  }

  const saved = playerData.selectedIcons[mode];
  const selected = numbers.includes(saved) ? saved : getStarterIcon(mode);

  const preview = document.createElement('canvas');
  const thumbs = [];

  try {
    await renderIcon(preview, mode, selected, playerData.colors);
    for (const number of numbers) {
      const canvas = document.createElement('canvas');
      await renderIcon(canvas, mode, number, playerData.colors);
      thumbs.push({ number, canvas });
    }
  } catch (err) {
    console.warn(`Could not render ${mode} icons:`, err);
    if (myId !== iconScreen.requestId) return;
    iconScreen.preview = null;
    iconScreen.thumbs = [];
    iconScreen.note = 'Icon art could not be loaded.';
    return;
  }

  if (myId !== iconScreen.requestId) return; // a newer request already landed

  iconScreen.preview = preview;
  iconScreen.thumbs = thumbs;
  iconScreen.selected = selected;
}

// __PLAYER_RENDER__
function renderIcons() {
  drawMenuBackdrop();

  const cx = app.viewWidth / 2;
  const big = app.resources.fonts.big;

  // ---- Top bar: GD's strip, the heading, the back arrow and the star count ----
  drawTopBar(app.viewWidth, 54);

  big.draw(ctx, 'PLAYER', cx, 27, {
    scale: big.scaleForCap(30), align: 'center', anchor: 'center',
  });

  spriteButton('back', uiAssets.frames.back, 40, 27, 44, () => {
    setScreen('menu');
  });

  drawStarCount(app.viewWidth - 26, 27);

  // ---- The shop sign: GD's rope + hanging sign, top-left under the bar ----
  drawShopSign(150, 62);

  // ---- Mode row: GD's seven icon-kit buttons, the active one lit ----
  drawModeRow(cx);

  // ---- The selected icon, inside GD's character-select frame ----
  drawIconPreview(cx);

  // ---- The icons this mode ships, as a GD-style grid ----
  renderIconGrid(cx);

  // ---- Which channel the swatches write to, then the kit itself ----
  renderColourChannels(cx, 378);
  renderColourGrid(cx, 436);

  big.draw(ctx, 'Tap a colour to apply it', cx, 612, {
    scale: big.scaleForCap(14), align: 'center', anchor: 'center', alpha: 0.7,
  });

  // ---- The rails: currencies down the right, palette shortcuts down the left ----
  drawCurrencyRail();
  drawPaletteRail();
}

// __PLAYER_CHROME__
// -------------------- PLAYER chrome --------------------
// GD's top-bar strip across the window, with a plain dark bar as the fallback when
// the atlas did not load (a failed fetch, or the headless harness).
function drawTopBar(width, height) {
  const sheet = app.resources.sheets.game;
  const frame = uiAssets.frames.topBar;
  if (sheet && sheet.has(frame)) {
    sheet.draw(ctx, frame, width / 2, height / 2, { width, height });
    return;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(12, 14, 26, 0.92)';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// The star counter in the top-right corner: the stars the loadout has earned (one
// per completed level), sitting where GD puts it.
function drawStarCount(x, cy) {
  const sheet = app.resources.sheets.game;
  const big = app.resources.fonts.big;
  const icon = uiAssets.frames.starsIcon;
  const size = 30;
  const label = String(earnedStars());

  if (!sheet || !sheet.has(icon)) {
    big.draw(ctx, label, x, cy, {
      scale: big.scaleForCap(17), align: 'right', anchor: 'center',
    });
    return;
  }
  sheet.draw(ctx, icon, x - size / 2, cy, { width: size });
  big.draw(ctx, label, x - size - 6, cy, {
    scale: big.scaleForCap(17), align: 'right', anchor: 'center',
  });
}

// __PLAYER_ROWS__
// The hanging shop sign: GD's rope dropping from the top of the screen with the
// wooden sign blitted below it, and the "THE SHOP" label over the wood. The sign
// is a shortcut: tapping it jumps the colour kit back to page 0 of primary.
function drawShopSign(cx, ropeTopY) {
  const sheet = app.resources.sheets.game;
  const big = app.resources.fonts.big;
  const rope = uiAssets.frames.shopRope;
  const sign = uiAssets.frames.shopSign;
  const signW = 118;

  let signCy = ropeTopY + 30;
  if (sheet && sheet.has(rope)) {
    sheet.draw(ctx, rope, cx, ropeTopY, { width: 14, anchor: 'top' });
    signCy = ropeTopY + 52;
  }
  addButton('shop-sign', cx - signW / 2, signCy - 34, signW, 68, () => {
    iconScreen.colorTarget = 'primary';
    setColourPage(0);
  });
  if (sheet && sheet.has(sign)) {
    sheet.draw(ctx, sign, cx, signCy, { width: signW });
  } else {
    ctx.save();
    roundRect(ctx, cx - signW / 2, signCy - 30, signW, 60, 10);
    ctx.fillStyle = 'rgba(146, 74, 18, 0.95)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#4d2708';
    ctx.stroke();
    ctx.restore();
  }
  big.draw(ctx, 'THE', cx, signCy - 16, {
    scale: big.scaleForCap(13), align: 'center', anchor: 'center',
  });
  big.draw(ctx, 'SHOP', cx, signCy + 4, {
    scale: big.scaleForCap(18), align: 'center', anchor: 'center',
  });
}

// GD's seven icon-kit buttons, the active one lit: each mode's own off/on art,
// drawn left to right in EntityTypes order.
function drawModeRow(cx) {
  const sheet = app.resources.sheets.game;
  const modes = availableIconModes();
  const modeW = 52;
  const modeGap = 10;
  const rowW = modes.length * modeW + Math.max(0, modes.length - 1) * modeGap;
  let mx = cx - rowW / 2;
  const modeY = 62;

  for (const mode of modes) {
    const rect = addButton(`mode-${mode}`, mx, modeY, modeW, modeW, () => {
      buildIconScreen(mode);
    });

    const active = mode === iconScreen.mode;
    const pair = ICON_MODE_FRAMES[mode];
    const frame = pair ? (active ? pair[1] : pair[0]) : null;
    if (frame && sheet && sheet.has(frame)) {
      sheet.draw(ctx, frame, rect.x + rect.w / 2, rect.y + rect.h / 2,
        { width: rect.w * (active || isHovered(rect) ? AppConfig.hoverScale : 1) });
    } else {
      drawPlaceholderButton(rect, mode.slice(0, 3).toUpperCase());
    }

    mx += modeW + modeGap;
  }
}

// The selected icon, large, inside GD's character-select frame.
function drawIconPreview(cx) {
  const sheet = app.resources.sheets.game;
  const previewCy = 204;
  const previewSize = 116;
  const selectFrame = uiAssets.frames.characterSelect;
  if (sheet && sheet.has(selectFrame)) {
    sheet.draw(ctx, selectFrame, cx, previewCy, { width: previewSize * 1.34 });
  }
  if (iconScreen.preview && iconScreen.preview.width > 0) {
    ctx.drawImage(iconScreen.preview,
      cx - previewSize / 2, previewCy - previewSize / 2, previewSize, previewSize);
  }
}

// __PLAYER_ICONS__
// The icon strip, reframed as the reference's GD-style grid: the thumbs the mode
// ships, each in a rounded well, on the panel's 12-wide page. Slots past the
// mode's shipped icons wear GD's lock, so the grid always reads full like the
// reference even while only the starter art has landed. The chosen icon keeps
// the selection-colour ring, and the note (if any) sits where the hint was.
function renderIconGrid(cx) {
  const thumbs = iconScreen.thumbs;
  const perRow = 12;
  const thumbSize = 54;
  const thumbGap = 14;
  const slotRowH = thumbSize + 14;
  const panelPad = 18;
  const gridW = perRow * thumbSize + (perRow - 1) * thumbGap;
  const panelW = gridW + panelPad * 2;

  const rows = Math.max(1, Math.ceil(Math.max(thumbs.length, 1) / perRow));
  const slots = perRow * rows;
  const panelH = rows * slotRowH + panelPad * 2 - 14;
  const panelTop = 262;
  const panelX = cx - panelW / 2;

  // The dark rounded panel behind the grid, like the reference's icon sheet.
  ctx.save();
  roundRect(ctx, panelX, panelTop, panelW, panelH, 16);
  ctx.fillStyle = 'rgba(8, 10, 22, 0.72)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.stroke();
  ctx.restore();

  for (let slot = 0; slot < slots; slot++) {
    const thumb = thumbs[slot];
    const col = slot % perRow;
    const row = Math.floor(slot / perRow);
    const x = panelX + panelPad + col * (thumbSize + thumbGap);
    const y = panelTop + panelPad + row * slotRowH;

    if (!thumb) {
      drawLockedIconSlot(x, y, thumbSize);
      continue;
    }

    const rect = addButton(`icon-${thumb.number}`, x, y, thumbSize, thumbSize, () => {
      selectIcon(thumb.number);
    });

    drawIconSlot(rect, thumb.number === iconScreen.selected);
    if (thumb.canvas && thumb.canvas.width > 0) {
      ctx.drawImage(thumb.canvas, rect.x, rect.y, rect.w, rect.h);
    }
  }

  // The hint under the grid: "Tap [lock] for more info!", with GD's own lock
  // for the bracketed word.
  drawIconHint(cx, panelTop + panelH + 8);

  if (iconScreen.note) {
    const big = app.resources.fonts.big;
    big.draw(ctx, iconScreen.note, cx, panelTop + panelH + 34, {
      scale: big.scaleForCap(15), align: 'center', anchor: 'center', alpha: 0.75,
    });
  }
}

// One slot in the icon grid: a rounded well the thumbnail is blitted into,
// ringed in GD's selection colour when it is the chosen icon.
function drawIconSlot(rect, chosen) {
  ctx.save();
  roundRect(ctx, rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, 10);
  ctx.fillStyle = chosen ? 'rgba(0, 255, 204, 0.16)' : 'rgba(255, 255, 255, 0.06)';
  ctx.fill();
  ctx.lineWidth = chosen ? 4 : 2;
  ctx.strokeStyle = chosen ? '#00ffcc' : 'rgba(255, 255, 255, 0.25)';
  ctx.stroke();
  ctx.restore();
}

// A grid slot past the mode's shipped icons: the same rounded well, dimmed, with
// GD's own lock centred in it. Registered with no button — it is filler, not a
// control — so the harness button list keeps exactly the mode's icons.
function drawLockedIconSlot(x, y, size) {
  const sheet = app.resources.sheets.game;
  drawIconSlot({ x, y, w: size, h: size }, false);
  const lock = uiAssets.frames.lock;
  if (sheet && sheet.has(lock)) {
    sheet.draw(ctx, lock, x + size / 2, y + size / 2, { width: size * 0.62 });
    return;
  }
  const big = app.resources.fonts.big;
  big.draw(ctx, 'x', x + size / 2, y + size / 2, {
    scale: big.scaleForCap(20), align: 'center', anchor: 'center', alpha: 0.7,
  });
}

// The hint under the icon grid: "Tap [lock] for more info!", with GD's own lock
// blitted inline where the reference brackets the word.
function drawIconHint(cx, y) {
  const sheet = app.resources.sheets.game;
  const big = app.resources.fonts.big;
  const lock = uiAssets.frames.lock;
  const cap = 15;

  big.draw(ctx, 'Tap', cx - 92, y, {
    scale: big.scaleForCap(cap), align: 'center', anchor: 'center', alpha: 0.9,
  });
  if (sheet && sheet.has(lock)) {
    sheet.draw(ctx, lock, cx - 48, y, { width: 26 });
  } else {
    big.draw(ctx, '[x]', cx - 48, y, {
      scale: big.scaleForCap(cap), align: 'center', anchor: 'center', alpha: 0.9,
    });
  }
  big.draw(ctx, 'for more info!', cx + 42, y, {
    scale: big.scaleForCap(cap), align: 'center', anchor: 'center', alpha: 0.9,
  });
}

// __PLAYER_RAILS__
// The currency rail down the right edge: star, moon, coin, user coin, diamond
// and orb rows like the reference, each GD's own icon with the earned count
// beside it. The moon art does not ship in the icon-kit atlas, so the moon row
// reuses the small star at half alpha rather than drawing a stand-in from
// elsewhere; every other row is real art.
function drawCurrencyRail() {
  const sheet = app.resources.sheets.game;
  const big = app.resources.fonts.big;
  const earned = earnedCurrencies();
  const x = app.viewWidth - 30;
  let y = 66;

  const rows = [
    { frame: uiAssets.frames.currencyStar, value: earned.stars },
    { frame: uiAssets.frames.currencyMoon, value: earned.moons, ghost: true },
    { frame: uiAssets.frames.currencyCoin, value: earned.coins },
    { frame: uiAssets.frames.currencyUserCoin, value: earned.userCoins },
    { frame: uiAssets.frames.currencyDiamond, value: earned.diamonds },
    { frame: uiAssets.frames.currencyCoinEpic, value: earned.orbs },
  ];

  for (const row of rows) {
    if (sheet && sheet.has(row.frame)) {
      sheet.draw(ctx, row.frame, x - 8, y, { width: 24, alpha: row.ghost ? 0.5 : 1 });
    }
    big.draw(ctx, String(row.value), x - 24, y, {
      scale: big.scaleForCap(15), align: 'right', anchor: 'center', alpha: 0.9,
    });
    y += 30;
  }
}

// The palette shortcuts down the left edge: the hue wheel (reselects the primary
// channel) and the SHOP-side extras from the menu atlas (GJ_GameSheet04), which
// jump the colour kit to a family page — secondaries, then glow. Everything is
// GD's own art: the two palette buttons from GameSheet03 and the two menu
// shortcuts from GameSheet04.
function drawPaletteRail() {
  const sheet = app.resources.sheets.game;
  const x = 44;
  let y = 128;

  const disc = uiAssets.frames.paletteWheel;
  addButton('palette-primary', x - 26, y - 26, 52, 52, () => {
    iconScreen.colorTarget = 'primary';
  });
  if (sheet && sheet.has(disc)) {
    sheet.draw(ctx, disc, x, y, { width: 52 });
  }
  y += 66;

  const artist = uiAssets.frames.paletteSwatches;
  addButton('palette-secondary', x - 26, y - 26, 52, 52, () => {
    iconScreen.colorTarget = 'secondary';
  });
  if (sheet && sheet.has(artist)) {
    sheet.draw(ctx, artist, x, y, { width: 52 });
  }
  y += 72;

  for (const [id, frame, page] of [
    ['palette-menu-daily', uiAssets.frames.menuDaily, 1],
    ['palette-menu-create', uiAssets.frames.menuCreate, 2],
  ]) {
    addButton(id, x - 26, y - 26, 52, 52, () => {
      iconScreen.colorTarget = 'glow';
      setColourPage(page);
    });
    const menu = app.resources.sheets.menu;
    if (menu && menu.has(frame)) {
      menu.draw(ctx, frame, x, y, { width: 52 });
    } else if (sheet && sheet.has(uiAssets.frames.colorChannel)) {
      sheet.draw(ctx, uiAssets.frames.colorChannel, x, y, { width: 52 });
    }
    y += 64;
  }
}

async function selectIcon(number) {
  const mode = iconScreen.mode;
  if (!mode) return;

  setSelectedIcon(mode, number);
  iconScreen.selected = number;

  // Only the preview needs re-compositing; the thumbnails are already right
  const preview = document.createElement('canvas');
  try {
    await renderIcon(preview, mode, number, playerData.colors);
    iconScreen.preview = preview;
  } catch (err) {
    console.warn('Could not render the selected icon:', err);
  }
}

// A control with nothing left to do is veiled rather than removed, so the grid
// never re-flows under the pointer on the first or last page.
function dimIconControl(rect) {
  if (!rect) return;
  ctx.save();
  ctx.fillStyle = 'rgba(6, 8, 16, 0.55)';
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
  ctx.fill();
  ctx.restore();
}





