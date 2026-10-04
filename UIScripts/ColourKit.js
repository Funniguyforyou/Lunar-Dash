// -------------------- Colour kit --------------------
// Which of the three channels the swatches write to, then the kit itself.
//
// This file owns the colour half of the PLAYER screen: the channel tabs and the
// paged swatch grid. The icon half (mode row, preview, icon grid, rails) lives
// in UIScripts/PlayerScreen.js. Both are drawn by renderIcons(), which also
// lives there — this file only paints the colour section.
//
// The grid geometry is pinned by verify_pause.js (12 across, 2 rows, 40px cells
// on a 7px gap, page dots beneath, GD's arrows at the sides), so keep the sizes
// below in step with the harness if they ever change.
const COLOUR_COLS = 12;
const COLOUR_ROWS = 2;
const COLOURS_PER_PAGE = COLOUR_COLS * COLOUR_ROWS;

function colourPageCount() {
  return Math.max(1, Math.ceil(getColourPalette().length / COLOURS_PER_PAGE));
}

function setColourPage(page) {
  iconScreen.colourPage = clamp(page, 0, colourPageCount() - 1);
}

// Which of the three channels the swatches write to. Each tab wears GD's own colour
// button as a disc, with the channel's live colour painted inside it, so the loadout
// reads at a glance without a legend.
function renderColourChannels(cx, y) {
  const big = app.resources.fonts.big;
  const sheet = app.resources.sheets.game;
  const disc = uiAssets.frames.colorChannel;
  const channels = ['primary', 'secondary', 'glow'];
  const tabW = 132;
  const tabH = 40;
  const gap = 12;
  const total = channels.length * tabW + (channels.length - 1) * gap;
  let x = cx - total / 2;

  for (const ch of channels) {
    const rect = addButton(`color-tab-${ch}`, x, y, tabW, tabH, () => {
      iconScreen.colorTarget = ch;
    });
    const active = iconScreen.colorTarget === ch;
    const cy = rect.y + rect.h / 2;
    const discX = rect.x + 22;

    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fillStyle = active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.lineWidth = active ? 3 : 2;
    ctx.strokeStyle = active ? '#ffffff' : 'rgba(255,255,255,0.28)';
    ctx.stroke();
    ctx.restore();

    if (sheet && sheet.has(disc)) sheet.draw(ctx, disc, discX, cy, { width: 30 });
    ctx.save();
    ctx.beginPath();
    ctx.arc(discX, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = playerData.colors[ch];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();
    ctx.restore();

    big.draw(ctx, ch.toUpperCase(), rect.x + 86, cy, {
      scale: big.scaleForCap(15), align: 'center', anchor: 'center',
      color: active ? '#ffffff' : 'rgba(255,255,255,0.7)',
    });

    x += tabW + gap;
  }
}

// __COLOUR_GRID__
// The kit itself: two rows of swatches at a time, paged with GD's arrow buttons, so
// every colour in Settings/ColorSettings.json is reachable. The channel's current
// colour keeps a bright ring, so a page holding the loadout shows it straight away.
function renderColourGrid(cx, top) {
  const palette = getColourPalette();
  const pages = colourPageCount();
  setColourPage(iconScreen.colourPage); // re-clamp: the palette or a save can change
  const page = iconScreen.colourPage;
  const first = page * COLOURS_PER_PAGE;

  const sw = 40;
  const gap = 7;
  const gridW = COLOUR_COLS * sw + (COLOUR_COLS - 1) * gap;
  const gridH = COLOUR_ROWS * sw + (COLOUR_ROWS - 1) * gap;
  const gx = cx - gridW / 2;

  for (let i = 0; i < COLOURS_PER_PAGE; i++) {
    const entry = palette[first + i];
    if (!entry) break;

    const x = gx + (i % COLOUR_COLS) * (sw + gap);
    const y = top + Math.floor(i / COLOUR_COLS) * (sw + gap);
    const hex = entry.hex;

    // The button is named by its index in the whole palette rather than its place
    // on the page, so a swatch keeps one identity across paging.
    const rect = addButton(`swatch-${first + i}`, x, y, sw, sw, () => {
      setPlayerColors({ [iconScreen.colorTarget]: hex });
      syncColourInputs();
      if (iconScreen.mode) buildIconScreen(iconScreen.mode);
      refreshGameIcon();
    });

    const current = playerData.colors[iconScreen.colorTarget].toLowerCase() === hex.toLowerCase();
    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fillStyle = hex;
    ctx.fill();
    ctx.lineWidth = current ? 4 : 2;
    ctx.strokeStyle = current ? '#00ffcc' : 'rgba(0,0,0,0.55)';
    ctx.stroke();
    ctx.restore();
  }

  // __COLOUR_ARROWS__
  // GD's page arrows either side of the grid, kept inside the view on narrow
  // windows...
  const arrowCy = top + gridH / 2;
  const prevX = Math.max(28, gx - 34);
  const nextX = Math.min(app.viewWidth - 28, gx + gridW + 34);
  const prev = spriteButton('colour-prev', uiAssets.frames.arrowPrev, prevX, arrowCy, 40,
    () => setColourPage(page - 1));
  const next = spriteButton('colour-next', uiAssets.frames.arrowNext, nextX, arrowCy, 40,
    () => setColourPage(page + 1));
  if (page === 0) dimIconControl(prev);
  if (page >= pages - 1) dimIconControl(next);

  // ...and the page dots beneath them.
  const dotY = top + gridH + 20;
  const dotGap = 16;
  let dx = cx - ((pages - 1) * dotGap) / 2;
  ctx.save();
  for (let i = 0; i < pages; i++) {
    ctx.beginPath();
    ctx.arc(dx, dotY, i === page ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = i === page ? '#00ffcc' : 'rgba(255,255,255,0.35)';
    ctx.fill();
    dx += dotGap;
  }
  ctx.restore();
}

// The hidden DOM colour panel mirrors the canvas kit: a swatch tap writes the
// loadout and the inputs follow, so the two pickers can never disagree.
function syncColourInputs() {
  const ids = { primary: 'color-primary', secondary: 'color-secondary', glow: 'color-glow' };
  for (const [key, id] of Object.entries(ids)) {
    const input = document.getElementById(id);
    if (input) input.value = playerData.colors[key];
  }
}

// The legacy DOM panel stays hidden (the canvas kit is the one picker), but its
// inputs still write the loadout when driven, so nothing that touches them
// silently stops working.
function initColourPanel() {
  const ids = { primary: 'color-primary', secondary: 'color-secondary', glow: 'color-glow' };

  for (const [key, id] of Object.entries(ids)) {
    const input = document.getElementById(id);
    if (!input) continue;

    input.value = playerData.colors[key];
    input.addEventListener('input', () => {
      setPlayerColors({ [key]: input.value });
      if (iconScreen.mode) buildIconScreen(iconScreen.mode);
      refreshGameIcon();
    });
  }
}

