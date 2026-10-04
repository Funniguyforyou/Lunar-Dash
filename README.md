# Lunar Dash

A remix of Geometry Dash for schools. This is a better version of Geometry Dash Lite from someone else.

Created by Lunar Eclipse. An unblocked game site.

---

## MainLevelSetup — The Main Levels

Each main level's layout is hand-authored in `MainLevelSetup/<Name>.json` on the
same 30px tile grid GD uses (the cube is 30x30, so every block is 30x30). The
game fetches the JSON at level start; if a file is missing or empty it falls
back to the seeded procedural builder, so nothing hard-crashes.

```json
{
  "name": "Example Level",
  "difficulty": 1,
  "modes": ["Cube", "Ship"],
  "song": "Music/StereoMadness.mp3",
  "objects": [
    { "t": "block",  "x": 24, "y": 0, "w": 3, "h": 2 },
    { "t": "spike",  "x": 40, "y": 0 },
    { "t": "spike",  "x": 48, "y": 0, "kind": "ice" },
    { "t": "orb",    "x": 70, "y": 4, "kind": "red" },
    { "t": "portal", "x": 100, "y": 0, "mode": "Ship" },
    { "t": "finish", "x": 420 }
  ],
  "triggers": [
    { "t": "color", "x": 120, "channel": "bg", "color": "#287dff", "duration": 0.5 },
    { "t": "move",  "x": 200, "dx": 10, "dy": 0, "duration": 2 },
    { "t": "pulse", "x": 300, "color": "#ff66ff", "strength": 0.5 }
  ]
}
```

* `x`/`y`/`w`/`h` are **tiles** — multiply by 30 for px. `y` is height above the ground.
* `song` in the JSON wins over the registry, so music is configured per level file.
* Any object may also pick its own sprite: `"kind"` (a catalog variant such as an
  `ice` spike or a `red` orb), `"variant"` (a family variant by number, `4` → `spike_04`),
  `"frame"` (an exact atlas frame) and `"sheet"` (`blocks` or `objects`). See
  [Parts and sprites](#parts-and-sprites).
* **Triggers** are invisible in gameplay (`color` triggers tint the bg/ground
  channels; `move`/`pulse` are parsed and stored but not simulated yet). The
  [editor](#create--the-level-editor) exports an empty `triggers` list.

## Create — Level Editor

The home menu's **CREATE** button opens a tile-grid editor laid out like Geometry
Dash 2.1's own editor: a top bar, the level grid, and a palette band along the
bottom. It is driven by the same `LEVEL_PARTS` catalog the gameplay renderer
blits, so the palette can never offer a part the game is unable to draw.

```text
┌ [pause] [undo] [redo] ──── "My Level" · 128 PARTS ──── [gear] ┐  top bar
│                          the level grid                       │  tap or drag to build
│  ◀                                                         ▶  │  camera scroll
├───────────────────────────────────────────────────────────────┤
│ [BUILD]   ◀   chip chip chip chip chip chip chip   ▶  1/2     │  paged palette
│ [DELETE]      chip chip chip chip chip chip chip              │
│ [SIZE]                                                [TEST]  │
│ [SWIPE]                                                       │
└───────────────────────────────────────────────────────────────┘
```

| Piece | What it does |
| --- | --- |
| Grid | Tap a tile to place the selected part, one tile at a time; wide/tall parts draw at their real footprint. A ghost under the pointer previews the size about to be stamped. `x = 0` is the level's start line, marked on the grid. |
| BUILD | The default tab: taps and drags place the selected part. |
| DELETE | Deletes parts under the tap, or under a drag. |
| SIZE | Opens the part popover: cycles the footprint stamped on new blocks, spikes and platforms through the sizes the shipped levels use — `1x1`, `2x1`, `2x2`, `2x3`, `2x4`, `3x1`, `3x2` and `3x3`. |
| SWIPE | Turns drag-painting on or off. With swipe off, a tap still places a single part — that is how you build precisely without a mouse. |
| Palette | One chip per catalog part — every block/spike kind, the platform, each pad and orb colour, every portal (the two gravity portals included) and the finish line. Two rows per page with `◀` / `▶` paging, so a narrow window shows fewer chips per page instead of hiding them. Chips show the real atlas frame. |
| pause | Opens the editor sheet: **RESUME**, or **SAVE & EXIT** back to the home menu. |
| UNDO / REDO | One step per stroke — a whole drag counts as one. A new edit clears the redo trail. |
| gear | Level settings: **NAME**, **SIZE**, **IMPORT**, **EXPORT**, **CLEAR** (undoable) and **CLOSE**. |
| TEST | Plays the grid through the real gameplay pipeline (`convertJsonObject` → parts → sprites). Finishing or quitting returns to the editor with the grid intact. |
| EXPORT | Downloads the grid as `MainLevelSetup`-shaped JSON. |
| IMPORT | Loads a `MainLevelSetup/*.json` file back onto the grid, header and all, so a shipped level can be opened, edited and exported again. |

### Editor keybinds

| Key | Action |
| --- | --- |
| `Esc` | Close the open sheet — or, with none open, save the draft and return to the menu |
| `Z` / `Ctrl+Z` | Undo |
| `Y` / `Ctrl+Shift+Z` | Redo |
| `B` | Build tab |
| `D` / `Delete` / `Backspace` | Delete tab |
| `E` | Open or close the part-size popover |
| `S` | Toggle swipe (drag-painting) |
| `←` / `→` | Scroll the camera 4 tiles (`Shift` = 1 tile) |
| `↑` / `↓` | Previous / next part in the palette |
| `,` `.` / `PageUp` `PageDown` | Previous / next palette page |
| `1`–`9` | Jump to palette page N |
| `+` / `-` | Next / previous part size |
| `Space` / `Enter` / `T` | Playtest the grid |
| `N` | Rename the level |
| `G` | Open level settings |

The draft autosaves to `localStorage` (`lunardash.create.draft.v1`) as you work, so a
refresh never loses a level; `Escape`, the pause sheet's **SAVE & EXIT**, or the
**CLOSE** button on the settings sheet all leave the editor with the draft flushed.

Every behaviour above is covered by `verify_create.js`, a headless harness that loads
the real scripts in a Node `vm` with the DOM stubbed out and drives the buttons each
frame registers (plus every keybind):

```bash
node verify_create.js
```

It prints the check count and exits non-zero on a regression. It also reads the shipped
`.plist` atlases, so an editor sprite name that doesn't exist fails the run too.

### Getting an exported level into the game

1. `EXPORT` writes `<LevelName>.json` to your downloads.
2. Move that file into `MainLevelSetup/`.
3. Register it in `mainLevels` (`Data.js`) so it appears in the level select:

```js
'main-6': {
  name: 'My Level', difficulty: 3,
  modes: [EntityTypes.CUBE, EntityTypes.SHIP],
  song: 'Music/MySong.mp3',
  file: 'MainLevelSetup/MyLevel.json',
},
```

A level whose `file` is missing or malformed falls back to the seeded procedural
builder, so a bad export can never break the game — it just logs why.

## Hitboxes

Every mode owns three axis-aligned hitboxes (see `Data.js`), mirroring GD:

| Box | Used for | Cube size |
| --- | --- | --- |
| **Blue** (`hitbox`) | solid collision: blocks, platforms, portals (half the sprite) | 15x15 |
| **Red** (`hazardHitbox`) | hazards: spikes (full sprite size) | 30x30 |
| **Rotation** (`rotationHitbox`) | ground/ceiling snap — never rotates or resizes, so a spinning sprite can never shift collision | 30x30 |

---

## Running it

The game loads its icon sprite data with `fetch()`, so **it must be served over HTTP** —
opening `index.html` directly from disk (`file://`) will fail to load any icons.

```bash
cd Lunar-Dash
python3 -m http.server 8000
```

Then open <http://localhost:8000/index.html>.

Any static server works (`npx serve`, `php -S localhost:8000`, VS Code Live Server, GitHub Pages, …).
There is no build step and no dependencies — everything is plain ES + `<script>` tags.

### Bump the build stamp when you change a script

Because there is no build step, an edited file keeps the same URL, so the browser — or
a proxy or port-forwarding tunnel in front of it — is free to keep serving the **old**
copy. That is not hypothetical: the pause-menu rewrite looked "not applied" for exactly
this reason, while a headless harness reading the file from disk reported the new layout.

`index.html` therefore stamps the page and version-queries every asset:

```html
<script>window.LUNAR_DASH_BUILD = '20261003-player-kit';</script>
<script src="MainHandler.js?v=20261003-player-kit" defer></script>
```

Change that stamp whenever you edit one of those files; the URL changes, so a stale copy
can never be served again. `UIScripts/PauseMenu.js` is version-queried the same way. To see
which build a running tab actually has, pause a level: the pause screen reports the page
stamp, the layout id, the art source (`gd-atlas`) and the live geometry to the console as
`[Lunar Dash] pause {…}` and leaves the same object on `window.__pauseLayout`, whose `frames`
lists the six atlas frames the panel blits (four discs, the Practice Mode sign, the options
gear). The readout is a probe and nothing more — it is **data only**, so it paints nothing
over the panel (an earlier build drew it as a bar across the top-left; that is gone). Delete
`reportPauseLayout()` and its single call in `renderPause()` when you no longer want it.
**A hard reload (Ctrl+Shift+R) is still
required once**, because a tab that is already running the old document keeps it until
it reloads.

### Controls

| Input | Action |
| --- | --- |
| `Space` / `↑` / `W` / click / tap | Jump / fly / flip, depending on the current mode |
| Hold | Ship thrust, Wave diagonal, Robot charge jump, Cube auto-jump on landing |
| `R` | Restart the level |

---

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | The whole game: menu, icons, level select, gameplay, pause (single canvas) |
| `Game.html` | Legacy redirect — forwards old links (with `?level=`) to `index.html` |
| `Data.js` | Entity/mode config, save data (`localStorage`), level registry, sound effects |
| `SheetHandler.js` | Shared images, `.plist` atlases, bitmap fonts |
| `BlockDefinitions.js` | Reads every frame of the two gameplay atlases and classifies it (block / spike / portal / ring…), so parts are looked up by family instead of by hard-coded name |
| `Levels.js` | The `LEVEL_PARTS` part catalog + level geometry (hazards, portals, finish line) and the deterministic builder |
| `IconHandler.js` | Cocos2d-style sprite-sheet icon compositing (base / secondary / glow / extra) |
| `PlayerController.js` | `Player` class + the `Physics` tuning constants |
| `MainHandler.js` | Entry point. Screen machine + game loop for `index.html` |
| `verify_create.js` | Headless harness for the level editor (`node verify_create.js`) |
| `verify_camera.js` | Headless harness for the vertical camera follow (`node verify_camera.js`) |
| `verify_pause.js` | Headless harness for the pause menu (`node verify_pause.js`) |
| `MainMenu.css`, `Game.css` | Styling |

### Load order matters

Scripts are loaded in dependency order in `index.html`:

```
Data.js → SheetHandler.js → BlockDefinitions.js → Levels.js → IconHandler.js
        → PlayerController.js → MainHandler.js
```

### Parts and sprites

Nothing in the renderer names a sprite. Every level object carries a **catalog part**
(`LEVEL_PARTS` in `Levels.js`), and the catalog is resolved through
`BlockDefinitions.js`, which classifies all ~2,980 frames of
`GJ_GameSheet(-uhd)` and `GJ_GameSheet02(-uhd)` by family:

| Part | Family / default frame | Atlas (`sheet`) |
| --- | --- | --- |
| block | `square` → `square_01_001.png` (kinds: `brick`, `plank`, `outline`, `design`) | `blocks` |
| spike | `spike` → `spike_01_001.png` (kinds: `color`, `ice`, `fake`) | `blocks` |
| platform | `plank` → `plank_01_001.png` | `blocks` |
| orb | `ring` → `ring_01_001.png` (yellow/pink/red/blue/green) | `blocks` |
| portal | `portal` → one frame per mode (`portal_01/07/09/11/13/14/17`, `portal_02/12` for gravity) | `objects` |
| pad | `boost` → **vector by default**, see below | `objects` |
| finish | drawn checkerboard, never an atlas frame | — |

So the atlas answers *which frame, which atlas, how big* — a part only has to say what it
is. Orb frames were matched to `ORB_KINDS` colours by sampling the atlas
(yellow `ring_01` #fffaa7, pink `ring_03` #ffadff, red `ring_02` #ff9981,
blue `gravring_01` #9cffff, green `dashRing_01` #77fa77).

A part can also carry a per-kind variant and a `fit` mode — `tile` (blocks and
platforms repeat on the 30px grid), `contain` (spikes, orbs) or `height` (portals) — plus
an `anchor` so a short spike `spike_02/03/04` stands *on* the surface rather than floating
mid-box. Ceiling spikes are the same frame mirrored with `ctx.scale(1, -1)`, because the
atlas ships no upside-down spike.

Pads deliberately stay vector-drawn: the atlas' `boost_*` frames are authored at GD's own
scale and colour order (gold, cyan, green, purple, red) and none of them fit this
project's 2×0.5-tile pad box, so `LEVEL_PARTS` marks them `art: false`. A level file can
opt into real pad art per object with an explicit `frame`.

Everything degrades: if `BlockDefinitions.js` never loads, each part falls back to the
frame name written in the catalog; if that frame is missing too, the object draws the
vector shape it always had.

### Coordinate convention

`Levels.js` authors `y` as **height above the ground line** (so `y: 0` rests on the floor),
while `PlayerController.js` works in canvas space where `y` grows downward and is the
hitbox **centre**. `MainHandler.objectBox()` does the conversion.

### Physics tuning envelope

Everything in `Physics` (`PlayerController.js`) was tuned together. The two numbers that
matter when authoring a level:

* forward speed `380 px/s`, cube jump `560`, gravity `2330`
* → a cube jump is **~67px high and ~183px long** (about 2.1 tiles, spins 180° per arc)

So never author a ground wall taller than ~3 tiles, never author a hazard cluster wider
than ~180px, and leave ≥6 tiles between clusters.

## Vertical camera follow

The camera is **not** glued to the cube. `updateCameraY()` in `MainHandler.js` runs a follow
region inside the fixed 320-unit-tall view: while the cube's screen Y stays between
`cameraFollowTop` (96) and `cameraFollowBottom` (215) the camera does not move at all, and
once the cube leaves the region the camera slides just far enough to put the region edge back
on it. `cameraFollowBottom` is deliberately the cube's screen Y when standing on the ground
line, so sinking always walks the camera back to **exactly** its home position
(`cameraY = 0`) — home is derived from the level, not hand-picked.

Two velocity terms keep that hand-off from reading as lag. Both are in `AppConfig`:

| Key | Value | What it does |
| --- | --- | --- |
| `cameraVelocityLead` | `0.06` | seconds of the cube's vertical speed added to the target while he is outside the region, so the camera aims *ahead* of him instead of at him. Each edge only sees the half of the velocity heading towards it, so a descending cube never delays the camera. |
| `cameraLeadMax` | `24` | px cap on that lead — a lean-in, not a teleport. |
| `cameraVelocityGain` | `1.25` | while the cube runs away from the region the camera travels at his own vertical speed × this, so it covers the lead instead of trailing it. |
| `cameraFollowRate` | `1600` | px/s floor for that travel, and the constant rate for slow moves and the settle back home. |

Both velocity terms vanish at zero speed, are capped, and cannot overshoot — the last step is
clamped to the remaining gap, so the camera lands exactly on target. The follow is a pure
function of game state: no clock, no easing curve, so it behaves identically at 24 fps and at
240 fps. `cameraY` is simply the world-space Y of the top edge of the view.

### The background is baked, not re-tiled

`drawGameBackground()` draws the play area at one constant scale (the level's play-area
height × `backgroundScale`), and parallax is nothing but a position offset. It used to
re-tile that art per frame — and the art is `game_bg_01_001-uhd.png`, a **2048×2048**
sheet drawn at ~610px, so each tile was a filtered 4-megapixel downscale. Four to six of
those ran every frame (~18M source pixels) to cover a ~180k-pixel view, and a **whole extra
row** appeared the moment the camera climbed high enough to need one, which is why a
vertical pan stuttered the entire game.

The grid is periodic and its scale comes from the level, never from the camera, so
`playAreaTiles` bakes it **once** into an offscreen canvas (one whole period bigger than the
view, so no phase can open a gap) and each frame is a single 1:1 `drawImage` of that bake at
the parallax phase. The ground strip is cached the same way. The blit is dropped exactly one
period before the phase the old tile loop used, so every grid line — and the art's on-screen
size — lands exactly where it did before. A pan now costs the same two blits as a still
frame, and neither allocates anything per frame. The bake is rebuilt only when the art, the
play-area height or the window changes (`invalidateTileCaches()`, called from `resize()`).

Every clause above is pinned by `verify_camera.js`, a headless harness that loads the real
scripts in a Node `vm` with the DOM stubbed out and drives the camera with the **real** jump
physics out of `PlayerController.js` — nothing in it re-implements the jump. It also checks
that the bake lands on the same grid phase, keeps one scale, leaves no gap at any camera
position, and is neither rebuilt nor re-allocated while the camera pans:

```bash
node verify_camera.js
```

It prints the check count and exits non-zero on a regression.

## Pause menu

`renderPause()` draws GD 2.1's pause panel: a wide, compact, rounded dark-navy panel
centred on the frozen run, which stays faintly visible behind it. Inside it, top to
bottom: the level name in the chunky Pusab font, GD's own green-and-gold **gear** sprite
(`GJ_optionsBtn`) in the panel's top-right, a **NORMAL MODE** and a **PRACTICE MODE** row
(label, long thin rounded track, percentage), one row of four **icon-only circular
buttons**, and the **MUSIC** / **SFX** sliders.

| Control | What it does |
| --- | --- |
| gear (top-right) | shows / hides the options row below it, like GD's own gear |
| practice disc | GD's practice button. Practice mode is not implemented, so the disc is dimmed and not pressable — it is here so the panel matches and wiring it is one line |
| resume (largest) | `resumeFromPause()` — the level keeps running from exactly where it stopped |
| menu | `quitFromRun()` — back to the level select, or to the editor for a draft playtest |
| restart | `restartFromPause()` — same as `R` |
| MUSIC / SFX | real volume sliders: press anywhere on a track to set it, then drag |

Every size is a GD unit multiplied by `app.viewHeight / 320`, so the panel keeps the
reference's proportions at any window shape, and the button discs shrink on a narrow
(portrait) window rather than overlapping. The panel is sized from its own content, so
the rows can never collide or leave dead space. The buttons and the top-right gear are
GD's own atlas art (`GJ_playBtn2`, `GJ_replayBtn`, `GJ_menuBtn`, `GJ_practiceBtn`,
`GJ_optionsBtn`), so there is no text label under any of them; if a frame is ever missing
from the atlas, that button draws nothing and says so once in the console — never a text
pill, and never a drawn stand-in.

The proportions come from the 2.1 reference, not from taste — in GD units (× `u`, where
a 320-unit-tall view is 1:1):

| | GD units | |
| --- | --- | --- |
| panel | **2.8 : 1**, ~61% of the view height, ~96% of its width | wide, spanning the viewport with small side margins |
| panel padding | 11 top / 18 bottom | a little more room under the sliders than above the title |
| level title | 15 cap, **white** + dark shadow | small — the panel's widest element is its title, not its buttons |
| mode label / bar / percentage | 8 / 5 / 9 | hairline bars |
| discs (resume / side) | **42 / 30** | resume is the largest, not dominant |
| gear (options) | **30**, GD's own `GJ_optionsBtn` sprite | the shipped green-and-gold disc, smaller than a side disc |
| gaps: title→NORMAL, NORMAL→PRACTICE, bars→row, row→sliders | 8 / 7 / **6** / 13 | the row sits close under the practice percentage |
| practice hint | white "PRACTICE MODE" + drawn arrow, level with the disc, to its **left** | a label only — it registers no hit area |
| button row | gap = 1.15 × disc, centred | a compact cluster, not stretched to the panel edges |
| slider label / track / knob | 7 / 5 / 6 | tracks capped at 190 and centred, so a wider panel never stretches them |

Change these numbers, not the code around them, if the panel ever needs to look
different; `verify_pause.js` re-checks the resulting proportions, the no-overlap
invariant and the whole control set after any edit.

`verify_pause.js` pins all of it: the panel's colour and proportions, the registered
hit areas, the labels and percentages actually drawn, what each control does, that the
sliders really move the mix, and that nothing overlaps at five window shapes.

```bash
node verify_pause.js
```

---

## Adding icons

Icons are one folder per icon, named after the mode plus the icon number.
`IconHandler.js` builds these paths automatically:

```
Images/Icons/<Mode>/<Mode><number>/Icon<number>-uhd.png
Images/Icons/<Mode>/<Mode><number>/Icon<number>-uhd.plist
```

For example `Images/Icons/Cube/Cube1/Icon1-uhd.png`.

Then register the number in the manifest at the top of `IconHandler.js`:

```js
const iconManifest = {
  [EntityTypes.CUBE]: [1], // add 2, 3, ... as you add folders
  [EntityTypes.SHIP]: [],
  // ...
};
```

The lowest number in a mode's list is that mode's starter icon. Modes with an empty list
are hidden from the menu, and the player falls back to the Cube icon in-game.

**Layers are detected by filename suffix**, so the frames inside the plist can use any
internal name prefix:

| Suffix | Layer |
| --- | --- |
| `_2_###.png` | secondary shape (recoloured with `secondary`) |
| `_glow_###.png` | outer glow outline (recoloured with `glow`) |
| `_innerGlow_###.png` | any further glow rings — a shape's inner glow, the ring round the secondary (recoloured with `glow`) |
| `_extra_###.png` | detail layer (drawn last, **not** recoloured) |
| anything else | base shape (recoloured with `primary`) |

Glow rings belong in their **own** frame rather than baked into the base or
secondary frame. A black pixel has zero luminance, so under a brightness-based tint
it stays black no matter what colour the player picks — the glow picker would do
nothing. Keeping the rings separate means they are white art, and white takes the
glow colour like any other layer.

The plist's `metadata.size` must match the real PNG dimensions, and every `textureRect`
must sit inside the sheet — otherwise `drawImage` reads the wrong pixels.

### Recolouring, and the middle square

Layers are recoloured **by their own brightness**, not flattened to one fill. A flat
`source-in` fill would erase everything inside a layer — the shipped Cube art puts
the body *and* its outlines in the *same* frame, so flattening collapses it to
"solid square + centre square" and the nested squares disappear. Scaling each layer's
luminance by the player's colour keeps that structure: the artwork's brightest pixels
land on exactly the chosen colour and its transparent areas stay transparent.

Do not normalise the colour to a peak channel first. That looks correct for the
default palette (every channel of `#00ffcc` reaches 255) but silently *lightens*
any darker colour — `#22cc11` came out as `(42,255,21)` because the green channel
was pushed past 255 and clamped. Scaling all three channels by one factor preserves
the hue and needs no normalisation.

The base is drawn **after** the secondary, so the base's hollow centre is what shows
through around the middle square. The sheet's 44x44 secondary fills that hole exactly,
which leaves no gap at all, so the shipped Cube 1 shrinks it via `iconDetailScale`
(`IconHandler.js`):

```js
const iconDetailScale = {
  'Cube/1': 0.68, // mode/number -> middle square drawn at 68% of its frame
};
```

The base's hole is what you then see as the gap between the middle square and the outer
one. `1` (the default) fills the hole exactly, which is right for art authored to fill it.

The glow layer is wider than the base, and only its outer band overlaps the body, so the
glow is thinned by shaving its **outer** edge — `iconGlowTrim` in the same file:

```js
const iconGlowTrim = {
  'Cube/1': 4, // take 4px off the outside, leaving a 2px outline flush with the body
};
```

Shave the inner edge instead and you get a transparent notch between the glow and the
base, because everything inside that outer band is covered by the body anyway.

### The shipped Cube 1 art

`Images/Icons/Cube/Cube1` holds **`player_00-uhd.png` + `player_00-uhd.plist`** — the
original Geometry Dash cube sheet, not an `Icon<number>-uhd.*` pair. It is registered
by name in `iconFiles` at the top of `IconHandler.js`, so art can keep whatever file
name it shipped with:

```js
const iconFiles = {
  'Cube/1': {
    sheet: 'Images/Icons/Cube/Cube1/player_00-uhd.png',
    plist: 'Images/Icons/Cube/Cube1/player_00-uhd.plist',
  },
};
```

It is a **305x136 sheet with three frames**, composited onto a 133x132 canvas:

| Frame | Size | Art | Used for |
| --- | --- | --- | --- |
| `player_00_glow_001.png` | 133x132 | white ring, rounded | the soft outer glow |
| `player_00_001.png` | 121x120, **stored rotated 90°** | black outline, white body, black inner ring, hollow centre | outline + frame (`secondary`), body (`primary`) |
| `player_00_2_001.png` | 44x44 | plain square | the eye (`primary`) |

### How the GD cube is built

`renderCubeIcon` (`IconHandler.js`) is used whenever a sheet supplies a base, a
secondary *and* a glow frame. It layers, back to front:

```
OUTER CUBE GLOW -> OUTER CUBE -> INNER FRAME GLOW -> INNER FRAME
                -> EYE GLOW -> EYE -> EYE OUTLINE
```

Everything is derived from the sheet, and no colour is hardcoded — the three
colours all come from the `colors` argument, which is `playerData.colors`:

- **Split, don't repaint.** The base frame is a ring whose body and outlines live in
  the *same* image, so `splitByLuminance` separates it by brightness: light becomes
  the Primary body, dark becomes the Secondary outline and inner frame. That keeps
  the sheet's exact corner radii, band widths and antialiasing, and drops its white.
- **Measure, don't type.** `measureBaseBands` reads dark/light/gap runs off the
  middle scanline. Classifying by *opacity* alone does not work — the outline, body
  and frame are all fully opaque, so they read as one run. Each band appears twice
  (the cube is symmetric), and a dark run touching the gap is the inner frame; every
  other dark run is the outer outline.
- **Draw rings whole.** The body and outlines are rings, so their top and bottom
  bands run across every column. Slicing by the middle scanline's columns drops
  them, which is why the body is drawn as a full layer rather than as slices.
- **Isolate the frame by radius, not columns.** The outline and the frame share
  every column in the top and bottom bands, so a column mask drags the outline into
  the frame's glow. `maskLayerByRadius` separates the concentric rings instead.
- **Only the glows are blurred.** `CUBE_GLOW` holds the three radii/alphas; the
  outer one is widest and faintest, the eye's tightest. The frame's glow is kept
  *inside* the hole, hugging the frame's inner edge — a halo centred on the frame
  spills over the ~20px body and swamps it.

The eye is sized from the hole (`iconDetailScale`) and given its own outline whose
thickness comes from the sheet's own inner-frame band.

### Colours

The Icon Editor writes to `playerData.colors` via `setPlayerColors`, and
`renderIcon` reads the same object, so the editor preview and the gameplay cube
cannot drift apart. `refreshGameIcon()` re-composites the in-game icon when a
colour changes, so a live cube updates immediately instead of waiting for the next
level. Nothing about colour selection is duplicated.

### The padding

`ICON_GLOW_PAD` (8px) is added to the icon canvas so the soft glows have room to
spill; the art itself is drawn in its own coordinates and the pad recorded on
`canvas.iconPad`, so `drawGamePlayer` can scale the blit to the *art* and the cube
keeps its on-screen size. The vector fallback and any other art set no pad and are
unaffected.

**Smoothing.** Compositing uses the browser's default bilinear filtering, and the
final in-game blit uses nearest-neighbour so the cube stays crisp — the glows were
already blurred when the icon was composited, so this never softens the artwork.
Never disable smoothing around scaled icon layers to "keep rings crisp": that
switches to nearest-neighbour and makes the cube visibly blocky.

**Mind the in-game downscale.** The cube hitbox is 30px and `AppConfig.iconScale` is
1.15, so gameplay draws the 133px art at about 34.5px — a 3.9x reduction, where the 9px
black bands land near 2px. The icons screen (148px preview, 64px thumbnails) is far
more forgiving. If in-game detail reads as mush, raise `iconScale` rather than
thinning the art.

### A baked-in border becomes a second outline

Some art draws its body *and* its outline in the same base frame. The glow layer
already draws an outline, so that baked-in one shows up as a **second** outline.
Absorb it by listing a border width in `iconBaseBorderFill` (`IconHandler.js`):

```js
const iconBaseBorderFill = {
  'SomeMode/3': 11, // fold the base frame's outer 11px into the body colour
};
```

The border is **filled with the body colour, not erased**. A rounded art's corners
are *made of* that border, so deleting it would square the icon off; folding it into
the body keeps the silhouette and loses the outline. The shipped Cube 1 art has no
baked-in border, so the table is empty.

### Highlights on a scaled layer

Shrinking a layer with the browser's default bilinear smoothing turns its edge into
a soft semi-transparent fringe, which reads as a highlight once it sits over the base
layer's transparent hole. `drawLayer` turns `imageSmoothingEnabled` off for scaled
blits, so these icons stay crisp — they are pixel art, and smoothing only ever hurt.

## Adding levels

Add an entry to `mainLevels` in `Data.js`, then extend the builder in `Levels.js`
(`groundPatterns` / `airPatterns`) or hand-author objects with the `block()`, `spike()`,
`pad()`, `orb()` and `portal()` helpers. Levels are generated from a seeded RNG, so the
same level id always produces the same layout — a level stays learnable.

---

## Sound

One-shot effects live in the `sfx` map in `Data.js`; `playSFX(name)` plays one.

| Name | File | Fires when |
| --- | --- | --- |
| `death` | `Music/SFX/PlayerExplode.mp3` | the player hits a hazard |
| `complete` | `Music/SFX/EndStart.mp3` | the level is finished |
| `play` | `Music/SFX/PlaySound.mp3` | a level starts (level-select Play, pause Restart, `R`) |
| `quit` | `Music/SFX/QuitSound.mp3` | leaving a level (pause-menu quit) |

`Music/SFX/MenuLoop.mp3` loops on `index.html`, and each level's own song plays during
gameplay.

Boot tries the menu loop outright, before any click: browsers remember an origin the
player has already interacted with, and there the music starts on its own. Where the
browser refuses, `armAudioUnlock()` catches the first gesture of **any** kind — pointer,
mouse, touch, key or click, anywhere on the page, not only on a canvas button — and a
refused `play()` re-arms so the next gesture retries instead of the audio being lost.

The menu loop belongs to the browser window rather than to the run, so leaving the tab
does **not** stop it: switching away and back leaves `MenuLoop.mp3` playing where it was,
with no rewind. "Leaving" is two different browser events and both are handled: a tab
switch fires `visibilitychange`, while clicking another application with the browser still
visible fires `blur` on its own — so `focus` is watched as well. Leaving also does not
break a run: a tab switch or focus loss during gameplay freezes the level song where it is
and raises the pause menu, and neither the song nor the menu loop restarts on its own.
Returning to a paused run does **not** resume it either; the pause menu stays up, as GD
does. Only the run's own track is dropped when the page is genuinely unloaded, which is why
`pagehide` (a back/forward-cache store, not an end) is handled separately from
`beforeunload`.

The [pause menu](#pause-menu) carries the volume controls: **MUSIC** scales the level
song (and the menu loop) and **SFX** scales the one-shots above, both from 1.0 — the mix
the game shipped with — downwards. They are per-session, not saved.

---

## Known gaps

These are content gaps, not bugs — the game runs and degrades gracefully without them:

* **Only Cube icons have sprite art.** Ship, Ball, UFO, Wave, Robot, Spider and
  Swing use a vector fallback drawn in your colours until their art lands.
* All 7 modes (2.1 set — no Swing) have working physics, but the main levels only use
  `Cube` and `Ship`.
* **Practice mode.** The pause menu shows GD's practice disc and its PRACTICE MODE row so
  the panel matches 2.1, but there is no practice mode to run yet: the disc is dimmed and
  inert and the row reads 0%.
* The Spider teleports to the nearest **world** surface (floor or ceiling) — it does not
  yet consider blocks or platforms as teleport targets.
* The [editor](#create--the-level-editor) authors parts only: triggers, per-object
  rotation and free (non-tile) placement aren't editable yet, and a level it exports
  keeps whatever header the imported file had.