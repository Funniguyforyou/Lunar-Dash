// -------------------- Pause overlay --------------------
// -------------------- Pause menu --------------------
// GD 2.1 authors this screen against a 320-unit-tall view, so every size below is
// a GD unit multiplied by `u`. The layout is then identical at any window shape
// with nothing hardcoded to one resolution. The panel reuses GD's own button art
// (play / replay / menu / practice / options) and draws only the chrome the
// atlases do not ship: the panel, the two progress bars and the volume sliders.
// The layout this build of the pause screen draws. index.html stamps the page with
// window.LUNAR_DASH_BUILD; both are reported at runtime by reportPauseLayout(), so a
// browser still running a stale copy is obvious at a glance instead of being
// mistaken for a styling problem. That probe is data only — it paints nothing, so
// nothing it reports can be mistaken for part of the panel.
const PAUSE_LAYOUT_ID = 'panel-wide';
// The buttons, the Practice Mode sign and the options gear are all blitted from
// GJ_GameSheet03-uhd, so the probe names that too: `gd-atlas` in the console is what
// proves the live tab is running this build rather than a cached copy.
const PAUSE_ART_ID = 'gd-atlas';
let pauseLayoutReported = false;

/**
 * Runtime probe: which build is running, with which pause geometry, drawing which
 * art. Logged once per pause and left on window.__pauseLayout. It is data only and
 * paints nothing: the panel is the player's screen, so the readout lives in the
 * console (and on `window.__pauseLayout`) instead of over the level name. Delete
 * this function and its one call to drop it.
 */
function reportPauseLayout(m, panelW, panelH) {
  const info = {
    page: (typeof window !== 'undefined' && window.LUNAR_DASH_BUILD) || 'unstamped',
    layout: PAUSE_LAYOUT_ID,
    art: PAUSE_ART_ID,
    panel: `${Math.round(panelW)}x${Math.round(panelH)}`,
    u: Number(m.u.toFixed(3)),
    frames: [uiAssets.frames.practice, uiAssets.frames.resume, uiAssets.frames.menu,
      uiAssets.frames.replay, uiAssets.frames.practiceSign, uiAssets.frames.gear],
  };
  if (typeof window !== 'undefined') window.__pauseLayout = info;
  if (!pauseLayoutReported) {
    pauseLayoutReported = true;
    if (typeof console !== 'undefined' && console.info) console.info('[Lunar Dash] pause', info);
  }
}

const PAUSE_UI = {
  panel: 'rgba(0,0,0,0.55)',
  panelEdge: 'transparent',
  panelLift: 'rgba(48,74,170,0.10)',
  dim: 'rgba(3,4,12,0.48)',
  green: '#35d957',
  yellow: '#ffd83d',
  blue: '#59d9ed',
  edge: '#0b1026',
  track: 'rgba(0,0,0,0.35)',
  trackEdge: 'rgba(42,68,168,0.55)',
};

// The sliders keep their geometry here (not just on their hit rects) so a drag
// can be resolved on pointermove without re-rendering the screen. Created once.
const pauseSliders = {
  music: { x: 0, y: 0, w: 0, h: 0 },
  sfx: { x: 0, y: 0, w: 0, h: 0 },
};

// 1.0 is exactly the mix the game shipped with, so the sliders start where the
// audio already was and only move when the player moves them.
function setPauseVolume(channel, value) {
  const v = clamp(value, 0, 1);
  if (channel === 'music') {
    app.musicVolume = v;
    if (app.levelSong) app.levelSong.volume = 0.6 * v;
    if (app.menuMusic) app.menuMusic.volume = AppConfig.menuMusicVolume * v;
  } else {
    app.sfxVolume = v;
    setSfxVolume(v);
  }
}

function applyPauseSlider(channel, pointerX) {
  const s = pauseSliders[channel];
  if (!s || s.w <= 0) return;
  setPauseVolume(channel, (pointerX - s.x) / s.w);
}

// Slider presses are shared actions, so no closure is allocated per frame.
function pauseMusicDown() {
  app.pauseSliderDrag = 'music';
  applyPauseSlider('music', app.pointer.x);
}

function pauseSfxDown() {
  app.pauseSliderDrag = 'sfx';
  applyPauseSlider('sfx', app.pointer.x);
}

function pauseResume() { resumeFromPause(); }
function pauseRestart() { playSFX('play'); restartFromPause(); }
function pauseQuit() { playSFX('quit'); quitFromRun(); }
function pauseToggleOptions() { app.pauseOptionsOpen = !app.pauseOptionsOpen; }

/** Pause-menu text: use Lunar Dash's font exactly as authored.
 * The font asset already contains its own visual edge/shadow; do not add another.
 */
function pauseLabel(font, text, x, y, capPx, opts = {}) {
  if (!font || !text) return;
  const align = opts.align || 'center';
  const anchor = opts.anchor || 'top';
  const color = opts.color || '#ffffff';
  const alpha = opts.alpha == null ? 1 : opts.alpha;

  ctx.save();
  ctx.globalAlpha = alpha;
  font.draw(ctx, text, x, y, {
    scale: font.scaleForCap(capPx),
    align,
    anchor,
    alpha: 1,
   // color,
  });
  ctx.restore();
}

/**
 * GD's "Practice Mode" sign, drawn from the atlas (GJ_practiceTxt_001) to the left
 * of the practice button — the white text and the curved arrow are the shipped
 * art, not a recreation. It is a label only: it registers no hit area, so the
 * button keeps exactly the behaviour it had.
 */
function pausePracticeSign(cx, cy, height) {
  const sheet = app.resources.sheets.game;
  const name = uiAssets.frames.practiceSign;
  if (!sheet || !sheet.has(name)) {
    if (!pauseMissingArt.has(name)) {
      pauseMissingArt.add(name);
      console.warn(`Pause menu: the atlas has no ${name}`);
    }
    return;
  }
  sheet.draw(ctx, name, cx, cy, { height });
}

// Frame names already reported missing, so one warning is logged, not one a frame.
const pauseMissingArt = new Set();

/**
 * A GD pause button: the atlas art for the whole disc, with `hoverScale` applied
 * to the sprite itself. The hit area stays the square around the centre, so the
 * interaction is unchanged and independent of how the frame is trimmed.
 */
function pauseIconButton(id, frameName, cx, cy, size, action, alpha = 1) {
  const r = size / 2;
  const rect = action ? addButton(id, cx - r, cy - r, size, size, action) : null;
  const d = size * (rect && isHovered(rect) ? AppConfig.hoverScale : 1);

  const sheet = app.resources.sheets.game;
  if (!sheet || !sheet.has(frameName)) {
    if (!pauseMissingArt.has(frameName)) {
      pauseMissingArt.add(frameName);
      console.warn(`Pause menu: the atlas has no ${frameName}`);
    }
    return rect;
  }
  sheet.draw(ctx, frameName, cx, cy, { width: d, alpha });
  return rect;
}

function pauseProgressRow(font, label, percent, x, labelY, w, _fill, _dim, metrics) {
  const centerX = x + w / 2;

  pauseLabel(font, label, centerX, labelY + 10, metrics.labelCap * 2, {
    anchor: 'center',
    color: '#ffffff'
  });

  const barY = labelY + metrics.labelToBar;
  const barH = metrics.barH;

  ctx.save();
  roundRect(ctx, x, barY, w, barH, barH / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.restore();

  pauseLabel(
    font,
    `${Math.floor(clamp(percent, 0, 100))}%`,
    centerX,
    barY + barH / 2 - 1,
    metrics.pctCap * 2,
    {
      anchor: 'center',
      color: '#ffffff'
    }
  );
}

function pauseVolumeSlider(font, channel, label, x, labelY, w, _color, metrics) {
  const centerX = x + w / 2;
  pauseLabel(font, label, centerX, labelY, metrics.sliderLabelCap * 2.25, {
    anchor: 'center', color: '#ffffff',
  });

  const trackY = labelY + metrics.sliderToTrack;
  const trackH = metrics.sliderTrackH;
  const knob = metrics.sliderKnob;
  const s = pauseSliders[channel];
  s.x = x;
  s.y = trackY - knob;
  s.w = w;
  s.h = trackH + knob * 2;

  addButton('pause-' + channel, x - knob, s.y, w + knob * 2, s.h,
    channel === 'music' ? pauseMusicDown : pauseSfxDown);

  const value = channel === 'music' ? app.musicVolume : app.sfxVolume;
  const knobX = x + w * value;
  const knobY = trackY + trackH / 2;

  ctx.save();
  roundRect(ctx, x, trackY, w, trackH, trackH / 2);
  const g = ctx.createLinearGradient(x, trackY, x, trackY + trackH);
  g.addColorStop(0, '#c5f8ff');
  g.addColorStop(1, '#59c7e5');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(2, 2 * metrics.u);
  ctx.strokeStyle = '#d4a72c';
  ctx.stroke();

  const kg = ctx.createRadialGradient(
    knobX - knob * 0.25, knobY - knob * 0.30, knob * 0.15,
    knobX, knobY, knob
  );
  kg.addColorStop(0, '#fff0a0');
  kg.addColorStop(0.55, '#f5c94a');
  kg.addColorStop(1, '#b57b14');
  ctx.beginPath();
  ctx.arc(knobX, knobY, knob, 0, Math.PI * 2);
  ctx.fillStyle = kg;
  ctx.fill();
  ctx.lineWidth = Math.max(2, knob * 0.18);
  ctx.strokeStyle = '#7c5510';
  ctx.stroke();
  ctx.restore();
}

const pauseMetrics = {
  u: 1, padX: 0, padY: 0, titleCap: 0, labelCap: 0, pctCap: 0, barH: 0,
  rowPad: 0, pctPad: 0, rowH: 0, resumeSize: 0, sideSize: 0,
  sliderLabelCap: 0, sliderTrackH: 0, sliderKnob: 0, sliderPad: 0, sliderH: 0,
  gearSize: 0,
};

/**
 * The options gear in the panel's top-right: GD's own sprite (a green disc with a
 * gold gear, GJ_optionsBtn_001) blitted at `size`, the same footprint the corner
 * button always had. The hit area is still the 32u square renderPause registers,
 * so only the art changed - the button behaves exactly as before.
 */
function drawPauseGear(cx, cy, size) {
  const sheet = app.resources.sheets.game;
  const name = uiAssets.frames.gear;
  if (!sheet || !sheet.has(name)) {
    if (!pauseMissingArt.has(name)) {
      pauseMissingArt.add(name);
      console.warn(`Pause menu: the atlas has no ${name}`);
    }
    return;
  }
  sheet.draw(ctx, name, cx, cy, { width: size });
}

function renderPause() {
  const game = app.game;
  if (game) renderGame();
  else drawMenuBackdrop();

  const W = app.viewWidth;
  const H = app.viewHeight;
  const u = Math.min(W / 597, H / 335);
  const m = pauseMetrics;
  m.u = u;

  // Reference-frame background treatment.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, H * 0.72, W, H * 0.28);
  ctx.restore();

  // 597x335 reference percentages: x=2%-98%, y=3%-97%.
  const left = W * 0.02;
  const top = H * 0.03;
  const panelW = W * 0.96;
  const panelH = H * 0.94;
  const radius = 25 * u;
  const cx = W * 0.50;

  ctx.save();
  roundRect(ctx, left, top, panelW, panelH, radius);
  ctx.fillStyle = 'rgba(0,0,0,0.70)';
  ctx.fill();
  ctx.restore();

  const big = app.resources.fonts.big;
  const gold = app.resources.fonts.gold || big;
  const title = (game && game.level ? String(game.level.name) : 'Stereo Madness');

  pauseLabel(big, title, cx, H * 0.10, 34 * u, { anchor: 'center', color: '#ffffff' });

  // GD's own options gear, at the reference's top-right spot. The footprint is the
  // 30u the corner button always had; only the art changed, and the hit area below
  // (32u square) is untouched.
  drawPauseGear(W * 0.94, H * 0.11, 30 * u);
  addButton('options', W * 0.94 - 16 * u, H * 0.11 - 16 * u, 32 * u, 32 * u, pauseToggleOptions);

  m.labelCap = 8 * u;
  m.pctCap = 9 * u;
  m.barH = 22 * u;
  m.labelToBar = 22 * u;

  const barX = W * 0.20;
  const barW = W * 0.60;
  pauseProgressRow(big, 'Normal Mode', game ? game.percent : 0,
    barX, H * 0.185, barW, null, false, m);
  pauseProgressRow(big, 'Practice Mode', 0,
    barX, H * 0.345, barW, null, false, m);

// GD's own disc art for all four buttons, at the reference-frame positions.
  // The Practice Mode sign sits just left of the practice disc, level with it,
  // so the arrow in the shipped art points at the button.
  pausePracticeSign(W * 0.28 - 55 * u, H * 0.62 - 6 * u, 30 * u);

  pauseIconButton('practice', uiAssets.frames.practice,
    W * 0.28, H * 0.62, 54 * u, null, 1);

  pauseIconButton('resume', uiAssets.frames.resume,
    W * 0.435, H * 0.62, 68 * u, pauseResume, 1);

  pauseIconButton('menu', uiAssets.frames.menu,
    W * 0.58, H * 0.62, 54 * u, pauseQuit, 1);

  pauseIconButton('restart', uiAssets.frames.replay,
    W * 0.715, H * 0.62, 54 * u, pauseRestart, 1);

  m.sliderLabelCap = 7 * u;
  m.sliderTrackH = 10 * u;
  m.sliderKnob = 11 * u;
  m.sliderToTrack = 20 * u;

  pauseVolumeSlider(big, 'music', 'Music', W * 0.175, H * 0.77, W * 0.305, null, m);
  pauseVolumeSlider(big, 'sfx', 'SFX', W * 0.53, H * 0.77, W * 0.30, null, m);

  reportPauseLayout(m, panelW, panelH);
}