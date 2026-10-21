---
name: popup-carta
description: Builds a paper pop-up book as one self-contained HTML file (no dependencies) from a description in words. Pieces fold up from the gutter as the book opens, pages turn, and the reader can pull tabs, lift flaps and turn paper wheels. Fixed style and engine; you only write a scene JSON. Use it for places, buildings, cities, towns, hotels, shops, events or stories told across several spreads ("un libro pop-up di Roma", "fai un pop-up del nostro hotel sul lago", "racconta l'evento come un libro che si apre", "scena di carta che si alza", "pop-up book of the venue"), also when the user just says "pop-up", "libro animato di carta" or wants an interactive paper illustration for a web page. Not for objects with an interior to explain (use iso-glow), not for video (use hyperframes), not for flat illustrations.
---

# Pop-up di carta

A fixed engine renders a paper pop-up book from a scene description in JSON. You never write rendering code: you write the scene, the validator checks it like a paper engineer would, and the build produces a single HTML file. That is what keeps every book consistent and recognisable.

`SKILL` below means this skill's folder (where this file is). Everything needed is there:

- `schema/scene.schema.json`: the format, with a description of every mechanism. Read it before writing a scene.
- `examples/`: complete, approved books. Copy their density and style.
  - `borgo-ligure.json`: terraced houses (box + nested steps), V-folds, a slider.
  - `roma.json`, `venezia.json`, `firenze.json`: one interaction per spread (flap, wheel, slider), domes and towers rising above the crease, bridge arches cut from the bottom of a wall, a windowed day/night wheel (Firenze, spread 3).
  - `genova.json`: a tall lighthouse as a V-fold (angle 12, height 160), a door flap lying on the pavement under the painted door with the courtyard painted beneath, a day/sunset/night wheel set into the sea.
  - `torino.json`: the tallest V-fold (the Mole, 160), a statue and a bridge as steps nested in a box instead of separate pieces, a four-seasons wheel with a fan window, a near page painted as a city plan.
  - `parigi.json`: a lattice tower V-fold with an arch cut from the bottom, a large fan-window wheel on the lawn, a Montmartre box with two nested steps and a flap opened to 110° to clear them.
  - `londra.json`: a 12-step clock wheel with the hours painted around it, a bridge built from three coplanar boxes, a pavement flap that reveals the Underground.
  - `tokio.json`: a pagoda V-fold, a skyline with two nested steps, a windowed wheel shaped as a city screen, a train slider on a viaduct.
  - `prova-interazioni.json`: the smallest example of flap and wheel.
- `build/build.sh`: validates and assembles the HTML (engine, fonts, CSS, scene inlined).
- `tests/kinematics.test.mjs`: sweeps the opening and checks every fold like real paper.
- `build/site.mjs`: rebuilds the showcase in `docs/` (served by GitHub Pages) (every example book on one page, one engine copy). Only for this repository, not for the user's books.

Needs Node.js. Works in Claude Code.

## Workflow

1. **Plan the spreads before any JSON.** Default 3 spreads. For each: what stands up (the subject), what is painted flat (context), which interaction tells something (a trapdoor that reveals what is underneath, a wheel that changes time of day, a boat that crosses). An interaction that means nothing is decoration: pick the one that adds a second reading. If the user's subject is an object with an interior (a machine, an engine), say the pop-up won't show it and suggest iso-glow.
2. **Write the scene** to `./<name>.json` in the working directory (outputs go in the user's project, not in the skill folder).
3. **Check and build** from anywhere:
   ```bash
   node SKILL/tests/kinematics.test.mjs ./<name>.json
   SKILL/build/build.sh ./<name>.json ./<name>.html
   ```
   Both must say ok. Errors name the piece and the problem in mm ("sticks out of the closed book past the page edge by 6.1 mm", "chiesa and campanile pass through each other at 3° of opening"): fix the scene, not the engine. If you think the validator is wrong, stop and tell the user instead of working around it. The build log goes next to the output (`popup-build.log`).
4. **Look at it.** Open the HTML in a browser (preview pane if available, otherwise `open ./<name>.html`), click to open, turn every spread, use every tab, flap and wheel. `?debug=1` shows each piece's fold angle (walls 90° when open) and FPS. What the validator cannot judge:
   - the far page hidden by deep box roofs (the camera looks down at 40°: a box roof `near + far` deep covers that much of the far page, titles included);
   - text too small: below ~5 mm it is unreadable on a phone;
   - art that reads wrong at the real angle, a flap whose back is upside down.
5. **Deliver.**
   - Standalone page: the HTML from step 3.
   - Book inside an existing page (a CMS, a site section, "insieme al testo"): build a fragment and give that to paste where the book goes. It brings its own styles, fonts and scripts and takes the width of its container; the page keeps its own fonts and background.
     ```bash
     SKILL/build/build.sh ./<name>.json ./<name>-fragment.html --fragment
     ```
   Say what is interactive in each spread, and what you could not check (real phone performance cannot be measured on a desktop).

## Coordinates

Millimetres. The book lies open on a table, spine horizontal: a **near** page toward the reader and a **far** page beyond the spine. Page `[300, 210]` is the tested size.

- `x`: along the spine, 0..300, left to right as the reader sees it.
- Near page `y`: 0 at the spine, 210 at the reader's edge.
- Far page `y`: 0 at the far edge, 210 at the spine (so page art reads upright).
- Face art: origin top-left of the face as seen from its front, y down.

Face sizes (art box `width × height`, as the reader sees each face):

| Piece | Face | Size | Where the folds are |
|---|---|---|---|
| box | `front` | (x1−x0) × `height` | crease at y=0 (top), glue at y=height (bottom) |
| box | `top` | (x1−x0) × `near` | roof seen from above; y=near is the front crease |
| box | `topBack`, `back` | (x1−x0) × `far`, × `height` | mostly hidden from the reader: keep them simple |
| step | `wall` | (x1−x0) × `up` | crease at top, glue at bottom |
| step | `top` | (x1−x0) × `out` | roof seen from above |
| vfold | `near`, `far` | `width` × `height` | glue along the bottom; crease on the left edge for `dir: right`, right edge for `dir: left`. `near` is the face the reader sees; `far` is the inner face of the other half and repeats the near outline unless it has its own |
| flap | `front`, `back` | (x1−x0) × `length` | hinge at the top edge (`side: down`) |
| wheel | `face` | 2r × 2r | centre (r, r); grip on the rim at 12 o'clock |
| slider | `face` | `size` | flat on the page |

## Mechanisms and when to use them

| Type | Paper equivalent | Use for |
|---|---|---|
| `box` | parallel fold across the gutter | a facade facing the reader: a row of houses, a palace, a bridge |
| `step` | parallel fold nested in a box/step corner | terraces in front of a facade, stepping down toward the reader |
| `vfold` | V-fold on the spine | a free-standing figure seen slightly at an angle: tower, statue, small house |
| `slider` | pull tab in a slot | something that travels: boat, vehicle, person |
| `flap` | lift-the-flap | reveal what is under / behind / inside |
| `wheel` | volvelle | change state: time, season, day/night, a clock |

Rules that come from real paper (the validator enforces them, knowing them saves iterations):

- **Closed fit.** Everything lies flat inside the closed book. Box: `near + height (+ how far the outline rises above the crease) ≤ page depth`. Same for `far`. V-fold: `width·sin(angle) + height·cos(angle) ≤ page depth`.
- **Above the crease.** A wall outline may rise above its crease (y < 0), for domes, gables, towers and chimneys, up to the length of the top panel next to it (`near` for a box front, `out` for a step). That area is cut out of the top panel, as in real paper. Want a tall dome? Use a deep `near`.
- **Bottom notches.** A wall outline may have notches from its bottom edge (bridge arches) as long as it still touches its glue line.
- **V-folds lean when the book closes**: a `dir: right` crease tips toward lower x by about `height·sin(angle)`, a `dir: left` crease toward higher x by the same amount. So `dir: right` needs `x ≥ height·sin(angle)` and `dir: left` needs `x ≤ 300 − height·sin(angle)` (angle 16°: 0.28 × height). Near the left edge open right, near the right edge open left. Neighbouring V-folds opening toward each other collide; open them the same way or keep them far apart. A V-fold on the spine collides with a box spanning the same x.
- **Outlines stay above their glue line.** Nothing below the bottom edge of a wall or half (y > height): it would go through the page.
- **Flaps** lie on a page. When opened they must not hit standing pieces: put them well in front of walls on the near page (y ≥ ~110 in front of a box with `near` ≤ 40).
- **Wheels.** The grip sits at 12 o'clock and covers whatever is painted there; `steps` positions start from `start` and divide 360°. To make a state really change (day/night, seasons), give the wheel a `window`: the disc turns under the page and only the window shows it (see the day/night wheel in `firenze.json`). Without a window the whole disc is visible, so it works as a pointer over labels painted on the page.
- **Steps** must lie inside the parent's x range and `up` ≤ the parent wall height.
- **Deep roofs hide the back.** A tall dome needs a deep `near`, but a deep box roof covers the far page. Keep `near + far` as small as the subject allows.
- **Two boxes cannot share the spine.** Boxes spanning the same x pass through each other. A bridge in front of a church or a statue in a square is a `step` nested in the box, not a second box or a V-fold.
- **Tall towers are V-folds with a small angle.** Angle 12 fits a height up to about 160 (lighthouse, Mole, clock tower). Put them near the left or right edge so they do not cover the heading.

## What the validator cannot see (learned building the city books)

The validator checks paper, not the view. These rules come from books that passed every check and still read wrong on screen:

- **Keep every interaction in view.** The camera looks down at 40°: anything standing hides the far page behind it, roughly from far y 40 down to the spine behind a box 80 tall. A wheel, flap or slider painted there is invisible. Put interactions on the near page, past y ~110, where nothing stands between them and the reader.
- **Flaps hinge on pages only.** A door cannot open in a wall. To open a door, lay the flap on the pavement under the painted door and paint what is behind it on the page beneath the flap.
- **Wheels must be big enough to read.** A window of radius 16 is a dot on screen. Use a wheel radius of 40 to 56 with a fan window of about ±45°. Labels painted around a small wheel collide with it; text cannot turn with the disc, so let the caption name the states.
- **No empty pages.** A spread with one tall V-fold still needs its near page painted at the same density as the others (streets in plan, water, gardens); plain paper reads unfinished.

## Style (fixed: this is what makes the books recognisable)

- **Palette only by name** (`paper cream ink terracotta brick ochre saffron rose peach sage olive pine sea deep sky slate stone`). Hex is rejected: the palette is the style.
- **Type.** Headings: `"font": "display"` (condensed capitals, embedded), uppercase, size ~17, tracking 0.06, on the far page at y ~26, e.g. `"I · IL COLOSSEO"`. Captions: default text font, uppercase, size ~6.4, weight 600, tracking 0.18, near the reader's edge of the near page. No italic, no serif: they read as generic.
- **Density.** Facades carry detail: `windows` (with `shutters`), arches, cornices in `paper`, roofs as triangles. Top panels of boxes and steps are roofs seen from above: `tiles`. Pages are painted (sky, hills, water with `waves`, pavement) and make sense under and around the pop-ups.
- **Interactions.** If the user asks for interactivity, one per spread. Paint what a flap reveals on the page under it; draw the slider's slot as a thin line; give wheels `steps` when positions mean something.
- **Generating the JSON.** Scenes are long (a rich spread is hundreds of layers). Writing a small throwaway script that emits the JSON (repeated windows, arches, tiles) is fine; the JSON is the deliverable, keep the script out of the user's project unless they want it.
- **Book.** `book.title`, a short `subtitle`, `cover` colour, `view: { "pitch": 40, "yaw": 0 }`.

## Limits (say so if asked)

Not supported yet: pieces folding on other pieces' faces except steps, V-folds that lean (crease always vertical when open), rotating pop-ups, sound, video export, 3D models. Shadows are cast on pages only. Phone performance has not been measured on a real mid-range device.
