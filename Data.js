// Data.js
// Entity datastore for player modes in the Geometry Dash clone

const EntityTypes = {
  CUBE:   'Cube',
  SHIP:   'Ship',
  BALL:   'Ball',
  UFO:    'UFO',
  WAVE:   'Wave',
  ROBOT:  'Robot',
  SPIDER: 'Spider',
};

// Hitbox model — every mode owns THREE hitboxes, mirroring GD:
//   hitbox         (BLUE)  solid collision: blocks / platforms, full size
//   hazardHitbox   (RED)   hazards: spikes. Small inner box (~1/3 of the body),
//                          centered — grazing a spike's edge survives, like GD
//   rotationHitbox (GREEN) the box used for landing / ground snapping. It never
//                          rotates and never changes size, so a spinning sprite
//                          can never shift where collision actually happens.
const entityStore = {
  [EntityTypes.CUBE]: {
    name: 'Cube',
    gravity: true,
    input: 'jump',
    hitbox: { w: 30, h: 30 },          // BLUE — full body, drives visual size + solid collision
    hazardHitbox: { w: 18, h: 18 },    // RED — small inner box, centered, forgiving spike hits
    rotationHitbox: { w: 30, h: 30 },  // GREEN — matches hitbox, so ground-snap = visual bottom
    rotates: true,
    rotationStep: Math.PI / 2,
    flipGravityOnPad: true,
  },
  [EntityTypes.SHIP]: {
    name: 'Ship',
    gravity: true,
    input: 'hold',         // hold = fly up, release = fall
    hitbox: { w: 30, h: 20 },
    hazardHitbox: { w: 18, h: 12 },
    rotationHitbox: { w: 30, h: 20 },
    rotates: true,          // tilts based on velocity
    maxTilt: 65,
  },
  [EntityTypes.BALL]: {
    name: 'Ball',
    gravity: true,
    input: 'tap',           // tap = flip gravity instantly
    hitbox: { w: 30, h: 30 },
    hazardHitbox: { w: 18, h: 18 },
    rotationHitbox: { w: 30, h: 30 },
    rotates: true,           // rolls continuously
    flipGravityOnTap: true,
  },
  [EntityTypes.UFO]: {
    name: 'UFO',
    gravity: true,
    input: 'tap',            // tap = single small hop, can chain
    hitbox: { w: 30, h: 26 },
    hazardHitbox: { w: 18, h: 16 },
    rotationHitbox: { w: 30, h: 26 },
    rotates: false,
    hopHeight: 'fixed',
  },
  [EntityTypes.WAVE]: {
    name: 'Wave',
    gravity: false,
    input: 'hold',            // hold = diagonal up, release = diagonal down
    hitbox: { w: 16, h: 16 },  // BLUE — full sprite, no rotation
    hazardHitbox: { w: 10, h: 10 },
    rotationHitbox: { w: 16, h: 16 },
    rotates: false,
    diagonalAngle: Math.PI / 4, // 45°, in radians
  },
  [EntityTypes.ROBOT]: {
    name: 'Robot',
    gravity: true,
    input: 'hold',              // hold = variable jump height (charge jump)
    hitbox: { w: 30, h: 30 },
    hazardHitbox: { w: 18, h: 18 },
    rotationHitbox: { w: 30, h: 30 },
    rotates: false,
    chargeJump: true,
  },
  [EntityTypes.SPIDER]: {
    name: 'Spider',
    gravity: true,
    input: 'tap',                // tap = instant teleport to nearest surface
    hitbox: { w: 30, h: 30 },
    hazardHitbox: { w: 18, h: 18 },
    rotationHitbox: { w: 30, h: 30 },
    rotates: false,
    teleportOnTap: true,
  },
};

function getEntity(type) {
  return entityStore[type];
}

// ============================================================
// Player colour palette — every colour the icon kit offers.
//
// This mirrors Settings/ColorSettings.json exactly: the same families, the same
// order, the same hexes. The picker reads this copy from memory so the menus draw
// even when the page boots without fetch() (the headless harnesses do), and
// verify_pause.js re-reads the JSON from disk and fails if the two ever drift —
// so the shipped data file stays the source of truth without the game depending
// on a round trip to render its own customiser.
// ============================================================

const playerColourGroups = {
  Reds: {
    LightestRed: '#FDD4CE',
    LightRed: '#FF7D7F',
    Red: '#FE3A3B',
    BrightRed: '#FE0000',
    DarkRed: '#970102',
    DarkerRed: '#6E0000',
    DeepRed: '#520201',
    DeepestRed: '#380106',
    MagentaRed: '#AF004B',
    MutedRed: '#805050',
    BrownRed: '#7A3635',
    DarkBrownRed: '#502423',
  },

  Oranges: {
    LightestOrange: '#FFB973',
    LightOrange: '#FEA040',
    Orange: '#FF7D01',
    BrightOrange: '#FF4B00',
    DarkOrange: '#AF4A02',
    MutedOrange: '#A36246',
    BrownOrange: '#764936',
    DeepOrange: '#563428',
    DarkOrangeRed: '#963201',
    DeepBrownOrange: '#68301F',
    DarkBrownOrange: '#592800',
    DeepestOrange: '#472000',
  },

  Yellows: {
    LightestYellow: '#FFFFB1',
    LightYellow: '#FFF97F',
    Yellow: '#FFFF00',
    DarkYellow: '#7D7E00',
    MutedYellow: '#FDDC9F',
    GoldenYellow: '#FFB901',
    DarkGold: '#966401',
    BrownYellow: '#50302E',
    MutedGold: '#CEAE77',
    Gold: '#A97A4E',
    DarkGoldBrown: '#6D533A',
    DeepestYellow: '#503E2A',
  },

  Greens: {
    LightestGreen: '#BFFF9F',
    LightGreen: '#B1FF6D',
    Green: '#7DFF00',
    BrightGreen: '#00FF01',
    YellowGreen: '#D2FF32',
    DarkGreen: '#4BAF01',
    OliveGreen: '#649600',
    TealGreen: '#00AE4C',
    BrightTeal: '#00FF7D',
    DeepGreen: '#009600',
    DarkerGreen: '#006000',
    DeepestGreen: '#004100',
  },

  LightBlueCyan: {
    LightestCyan: '#C0FEE2',
    LightCyan: '#94FFE5',
    Cyan: '#02FEC1',
    BrightCyan: '#00FFFF',
    MintCyan: '#7EFFAF',
    Teal: '#43A189',
    DarkTeal: '#306D5E',
    DeepTeal: '#265449',
    DarkCyan: '#009663',
    DeepCyan: '#007E7D',
    DarkerCyan: '#00605F',
    DeepestCyan: '#004042',
  },

  Blues: {
    LightestBlue: '#A0FFFF',
    LightBlue: '#00C7FE',
    Blue: '#007DFE',
    BrightBlue: '#0000FE',
    DarkBlue: '#004BB0',
    DeepBlue: '#000096',
    DarkerBlue: '#000071',
    DeepestBlue: '#010A4B',
    TealBlue: '#006496',
    DarkTealBlue: '#00496C',
    DeepTealBlue: '#00324B',
    DarkestBlue: '#012638',
    MutedLightBlue: '#76BCFF',
    MutedBlue: '#5080AE',
    MutedDarkBlue: '#325374',
    DeepMutedBlue: '#223C57',
  },

  Purples: {
    LightestPurple: '#BDB5FE',
    LightPurple: '#7D7DFF',
    Purple: '#7D00FE',
    BrightPurple: '#640096',
    LightViolet: '#B780FF',
    Violet: '#4A00AF',
    DarkViolet: '#3E068D',
    DeepPurple: '#36095E',
    MutedPurple: '#4E4D91',
    MutedViolet: '#7049A4',
    DarkMutedPurple: '#54367E',
    DeepestPurple: '#422B63',
  },

  Pinks: {
    LightestPink: '#FCB5FF',
    LightPink: '#FE007C',
    Pink: '#950064',
    DarkPink: '#66033C',
    BrightPink: '#FF00FE',
    Magenta: '#B900FE',
    DarkMagenta: '#7D0017',
    DeepPink: '#470135',
    LightMutedPink: '#FA7FFE',
    MutedPink: '#AF57AE',
    DarkMutedPink: '#814382',
    DeepestPink: '#5F315F',
  },

  Greyscale: {
    White: '#FFFFFF',
    LightGrey: '#E0E0E0',
    Grey: '#AEAEAE',
    DarkGrey: '#808080',
    DarkerGrey: '#5A5A5A',
    DeepGrey: '#404040',
    Black: '#000000',
  },
};

// The palette flattened in file order, so the picker can page through it as one
// list. Each entry keeps its family and its JSON name, which is what a tooltip or
// a saved loadout can show without re-parsing the file.
function getColourPalette() {
  const out = [];
  for (const [group, colours] of Object.entries(playerColourGroups)) {
    for (const [name, hex] of Object.entries(colours)) out.push({ name, hex, group });
  }
  return out;
}

// The palette entry a stored hex belongs to, or null when the save holds a colour
// outside the kit (the old free-picker defaults `#00ffcc` / `#ff00aa` are).
function findColour(hex) {
  const want = String(hex || '').toLowerCase();
  return getColourPalette().find((c) => c.hex.toLowerCase() === want) || null;
}

// ============================================================
// Player save data — mutable, persisted to localStorage.
// Unlike entityStore above (static config), this changes at runtime.
// ============================================================

const SAVE_KEY = 'lunarDash_saveData';

const defaultPlayerData = {
  colors: {
    primary: '#00ffcc',
    secondary: '#ff00aa',
    glow: '#ffffff',
  },
  selectedIcons: {
    [EntityTypes.CUBE]: 1,
    [EntityTypes.SHIP]: 1,
    [EntityTypes.BALL]: 1,
    [EntityTypes.UFO]: 1,
    [EntityTypes.WAVE]: 1,
    [EntityTypes.ROBOT]: 1,
    [EntityTypes.SPIDER]: 1,
  },
  levelsCompleted: {
    // populated as: 'levelId': { completed: true, bestPercent: 100, attempts: 12 }
  },
};

let playerData = loadPlayerData();

// ============================================================
// Level registry — main/official levels only for now.
// IDs are prefixed ('main-N') so user-created levels (later: 'user-N')
// can never collide with these, no matter how many of either exist.
// ============================================================

const mainLevels = {
  // `file` points at the hand-authored MainLevelSetup JSON (tile-grid layout).
  // name/difficulty/modes/song below are the registry fallbacks — when the JSON
  // loads, its values win (so configuring the music in the JSON just works).
  'main-1': { name: 'Stereo Madness',  difficulty: 1, modes: [EntityTypes.CUBE, EntityTypes.SHIP], song: 'Music/StereoMadness.mp3', file: 'MainLevelSetup/StereoMadness.json' },
  'main-2': { name: 'Back On Track',   difficulty: 2, modes: [EntityTypes.CUBE, EntityTypes.SHIP], song: 'Music/BackOnTrack.mp3', file: 'MainLevelSetup/BackOnTrack.json' },
  'main-3': { name: 'Polargeist',      difficulty: 3, modes: [EntityTypes.CUBE, EntityTypes.SHIP, EntityTypes.BALL], song: 'Music/Polargeist.mp3', file: 'MainLevelSetup/Polargeist.json' },
  'main-4': { name: 'Dry Out',         difficulty: 4, modes: [EntityTypes.CUBE, EntityTypes.SHIP, EntityTypes.BALL], song: 'Music/DryOut.mp3', file: 'MainLevelSetup/DryOut.json' },
  'main-5': { name: 'Base After Base', difficulty: 5, modes: [EntityTypes.CUBE, EntityTypes.SHIP, EntityTypes.BALL], song: 'Music/BaseAfterBase.mp3', file: 'MainLevelSetup/BaseAfterBase.json' },
  // add more as you build them out — order matches GD's own level list
};

// Level ids in registry order, which is the order the level select shows them
function getLevelIds() {
  return Object.keys(mainLevels);
}

function getMainLevel(levelId) {
  return mainLevels[levelId];
}

// ============================================================
// UI assets — every sprite and font the menus draw.
// Atlases are (png, plist) pairs; `frames` names the ones we actually use, so
// renaming art in the sheet is a one-line change here instead of a hunt.
// ============================================================
const uiAssets = {
  fonts: {
    big: 'Images/Fonts/bigFont-uhd.fnt',   // Pusab 128px — headings, buttons
    gold: 'Images/Fonts/goldFont-uhd.fnt', // Pusab 96px — level names, scores
  },
  sheets: {
    // Main UI atlas: buttons, arrows and difficulty faces all live here
    game: {
      png: 'Images/MenuImgs/GJ_GameSheet03-uhd.png',
      plist: 'Images/MenuImgs/GJ_GameSheet03-uhd.plist',
    },
    // Only the logo lives here, and it's a far smaller download
    launch: {
      png: 'Images/MenuImgs/GJ_LaunchSheet-uhd.png',
      plist: 'Images/MenuImgs/GJ_LaunchSheet-uhd.plist',
    },
    // Level blocks + spikes live here (square_XX / spike_XX frames).
    // BlockDefinitions.js registers this atlas as the 'blocks' sheet.
    blocks: {
      png: 'Images/MenuImgs/GJ_GameSheet-uhd.png',
      plist: 'Images/MenuImgs/GJ_GameSheet-uhd.plist',
    },
    // Menu-side shortcuts (create / daily / weekly / …) live here. The PLAYER
    // screen's left rail shortcuts draw two of them; everything else on that
    // screen is GameSheet03. Loaded optionally like the level atlases — the
    // rail falls back to a colour disc when it is missing.
    menu: {
      png: 'Images/MenuImgs/GJ_GameSheet04-uhd.png',
      plist: 'Images/MenuImgs/GJ_GameSheet04-uhd.plist',
    },
    // Portals (portal_XX_front/back) + extra object art live here.
    // BlockDefinitions.js registers this atlas as the 'objects' sheet, which is
    // the key LEVEL_PARTS records on portal / boost parts.
    blocks2: {
      png: 'Images/MenuImgs/GJ_GameSheet02-uhd.png',
      plist: 'Images/MenuImgs/GJ_GameSheet02-uhd.plist',
    },
  },
  images: {
    background: 'Images/LevelImg/game_bg_01_001-uhd.png',
    ground: 'Images/LevelImg/groundSquare_01_001-uhd.png',
    progressBar: 'Images/MenuImgs/GJ_progressBar_001-uhd.png',
    loading: 'Images/MenuImgs/loadingCircle-uhd.png',
  },
  frames: {
    // Gameplay parts (blocks / spikes / portals / orbs) are NOT named here any
    // more — they come from the LEVEL_PARTS catalog in Levels.js, which resolves
    // every part through BlockDefinitions.js. Only menu artwork lives below.
    logo: 'GJ_logo_001.png',
    play: 'GJ_playBtn_001.png',          // main menu / level-select play (plus shape)
    resume: 'GJ_playBtn2_001.png',       // pause menu: Resume (round disc, sits below play in the sheet)
    replay: 'GJ_replayBtn_001.png',      // pause menu: Restart
    menu: 'GJ_menuBtn_001.png',          // pause menu: Quit to menu
    pause: 'GJ_pauseBtn_001.png',        // in-game HUD pause button
    pauseClean: 'GJ_pauseBtn_clean_001.png',
    arrowPrev: 'GJ_arrow_01_001.png',
    arrowNext: 'GJ_arrow_02_001.png',
    complete: 'GJ_levelComplete_001.png',
    bigStar: 'GJ_bigStar_001.png',
    starsIcon: 'GJ_starsIcon_001.png',
    // Extra frames for the GD-identical menu / level-select chrome
    garage: 'GJ_garageBtn_001.png',      // main menu: icon kit (left button)
    creator: 'GJ_creatorBtn_001.png',    // main menu: creator (right button)
    back: 'GJ_backBtn_001.png',          // top-left back arrow button
    myLevels: 'accountBtn_myLevels_001.png', // level-select header art
    note: 'GJ_noteIcon_001.png',         // song box note icon
    selectSong: 'GJ_selectSongBtn_001.png',
    starSmall: 'star_small01_001.png',   // star reward counter on the card
    dot: 'uiDot_001.png',                // level-select page dots
    close: 'GJ_closeBtn_001.png',
    practice: 'GJ_practiceBtn_001.png',  // pause menu practice button
    practiceSign: 'GJ_practiceTxt_001.png', // pause menu: the "Practice Mode" sign beside it
    topBar: 'GJ_topBar_001.png',         // GD's top bar strip

    // ---- Icon kit (the PLAYER screen) — GD's own garage chrome --------------
    // The mode row's off/on pairs are named in ICON_MODE_FRAMES
    // (UIScripts/PlayerScreen.js) because they are looked up per mode rather
    // than one at a time.
    characterSelect: 'GJ_chrSel_001.png', // the frame around the selected icon
    colorChannel: 'GJ_colorBtn_001.png',  // the disc behind each channel's colour
    lock: 'GJ_lock_001.png',              // locked icon-grid slots + the hint
    shopRope: 'shopRope_001.png',         // the string the shop sign hangs from
    shopSign: 'GJ_longBtn01_001.png',     // the hanging THE SHOP board (long wooden button)
    currencyStar: 'GJ_starsIcon_001.png', // the rail's star row (moon reuses it, ghosted)
    currencyCoin: 'GJ_coinsIcon_001.png', // the rail's coin row
    currencyUserCoin: 'secretCoinUI_001.png', // the rail's silver user-coin row
    currencyDiamond: 'GJ_diamondsIcon_001.png', // the rail's diamond row
    currencyCoinEpic: 'currencyOrb_001.png', // the rail's orb row
    currencyMoon: 'GJ_starsIcon_001.png', // moon art is not in the kit atlas: ghosted star
    paletteWheel: 'GJ_hsvBtn_001.png',    // the left rail's hue-wheel shortcut
    paletteSwatches: 'GJ_colorBtn_001.png', // the left rail's channel shortcut (the colour disc)
    menuDaily: 'GJ_dailyBtn_001.png',     // GameSheet04: left-rail shortcut (glow, page 1)
    menuCreate: 'GJ_createBtn_001.png',   // GameSheet04: left-rail shortcut (glow, page 2)

    // ---- Create (level editor) chrome — GD 2.1's own editor buttons --------
    // All of these live in the main UI atlas (sheets.game). The Build / Delete /
    // Edit tabs ship in two states, so the selected tab is GD's own art (`*On`)
    // rather than a drawn highlight; Swipe only has one frame (see renderCreate).
    editBuild: 'edit_buildBtn_001.png',     // bottom bar tab: build (palette)
    editBuildOn: 'edit_buildSBtn_001.png',  // ...the same tab, selected
    editDelete: 'edit_deleteBtn_001.png',   // bottom bar tab: delete parts
    editDeleteOn: 'edit_deleteSBtn_001.png',
    editEdit: 'edit_editBtn_001.png',       // bottom bar tab: part options (SIZE)
    editEditOn: 'edit_editSBtn_001.png',
    editSwipe: 'edit_swipeBtn_001.png',     // bottom bar tab: swipe (drag) on/off
    editLeft: 'edit_leftBtn_001.png',       // palette page arrows
    editRight: 'edit_rightBtn_001.png',
    undo: 'GJ_undoBtn_001.png',             // top bar: undo
    redo: 'GJ_redoBtn_001.png',             // top bar: redo
    pauseEditor: 'GJ_pauseEditorBtn_001.png', // top bar: editor pause sheet
    playEditor: 'GJ_playEditorBtn_001.png',   // bottom bar: playtest the grid
    gear: 'GJ_optionsBtn_001.png',            // top bar: level settings
  },
};

// Debug hitbox colours (press H in a level). Matches GD's own editor debug
// colours: blue = solid collision, red = hazards, green = rotation box.
const HitboxDebug = {
  enabled: false,
  colors: {
    blue: 'rgba(64, 128, 255, 0.9)',
    red: 'rgba(255, 48, 48, 0.9)',
    rotation: 'rgba(48, 220, 96, 0.9)',
  },
};

// GD's difficulty faces: 01 Easy, 02 Normal, 03 Hard, 04 Harder, 05 Insane,
// 06-10 Demon tiers. Levels store a plain 1-10 index.
function difficultyFrame(index) {
  const n = Math.max(0, Math.min(10, Number(index) || 0));
  return `difficulty_${String(n).padStart(2, '0')}_btn_001.png`;
}

// ============================================================
// Sound effects — global, not tied to a specific level
// ============================================================

const sfx = {
  death: 'Music/SFX/PlayerExplode.mp3', // player shatters on a hazard
  complete: 'Music/SFX/EndStart.mp3',   // level finished
  // PlaySound fires once when a level STARTS (entering gameplay / restarting).
  play: 'Music/SFX/PlaySound.mp3',
  // QuitSound fires once when LEAVING a level (quit to menu / level select).
  quit: 'Music/SFX/QuitSound.mp3',
  // Backwards-compat aliases so old playSFX('click') calls stay silent-safe.
  click: 'Music/SFX/PlaySound.mp3',
};

// Menu music loops for as long as index.html is open, so it's kept separate
// from the one-shot sfx above (which are re-created per play).
const menuMusic = 'Music/SFX/MenuLoop.mp3';

// SFX volume, driven by the pause menu's slider. 1.0 is the level the game
// shipped with, so adding the control changed nothing until it was moved.
let sfxVolume = 1;

function setSfxVolume(value) {
  sfxVolume = Math.max(0, Math.min(1, Number(value) || 0));
}

function playSFX(name) {
  const path = sfx[name];
  if (!path) {
    console.warn(`No SFX registered for: ${name}`);
    return;
  }
  const audio = new Audio(path);
  audio.volume = 0.6 * sfxVolume;
  // A missing file must never break the game loop — swallow both the rejected
  // promise and the element's own error event.
  audio.addEventListener('error', () => {});
  audio.play().catch(() => {});
}

function loadPlayerData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(defaultPlayerData);

    const saved = JSON.parse(raw);
    // Merge with defaults so new fields (added later, e.g. after an update)
    // don't break old save files that don't have them yet
    return {
      ...structuredClone(defaultPlayerData),
      ...saved,
      colors: { ...defaultPlayerData.colors, ...saved.colors },
      selectedIcons: { ...defaultPlayerData.selectedIcons, ...saved.selectedIcons },
      levelsCompleted: { ...saved.levelsCompleted },
    };
  } catch (err) {
    console.warn('Failed to load save data, using defaults:', err);
    return structuredClone(defaultPlayerData);
  }
}

function savePlayerData() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(playerData));
  } catch (err) {
    console.warn('Failed to save data:', err);
  }
}

function setPlayerColors(colors) {
  playerData.colors = { ...playerData.colors, ...colors };
  savePlayerData();
}

function setSelectedIcon(mode, number) {
  playerData.selectedIcons[mode] = number;
  savePlayerData();
}

function markLevelComplete(levelId, { percent = 100 } = {}) {
  const existing = playerData.levelsCompleted[levelId];
  playerData.levelsCompleted[levelId] = {
    completed: true,
    bestPercent: Math.max(existing?.bestPercent || 0, percent),
    attempts: (existing?.attempts || 0) + 1,
  };
  savePlayerData();
}

function recordLevelAttempt(levelId) {
  // Call this even on a failed attempt, so attempt counts stay accurate
  const existing = playerData.levelsCompleted[levelId];
  playerData.levelsCompleted[levelId] = {
    completed: existing?.completed || false,
    bestPercent: existing?.bestPercent || 0,
    attempts: (existing?.attempts || 0) + 1,
  };
  savePlayerData();
}