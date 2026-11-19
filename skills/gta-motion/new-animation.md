# New animations for each video

Every video gets animations made for it, so a video never repeats itself and never plays templates only. The owner, 18 Nov 2026: "claude needs to invent new animations specifically for each video, even if there's nothing in library for that moment, that way we avoid repetitions, there's tons of reference/inspo from our premade ones, so shouldn't be hard to make good ones that way."

The templates are a database of parts and ideas, not a limit. Make new animations **on your own, without stopping to ask the user**. Build each one from the database's parts so it looks like it was always in the set. Then check it against the list below and fix it until every line passes.

## 0. Which moments get a new animation

Go through the plan's graphics in time order:

1. **The first time a kind of moment comes** (a number, a quote, a place, a name...): use the template that says it, with this moment's values.
2. **The same kind of moment again:** each template (one id, like `caption5-C`) plays **once per video**. Use another variant of its family (`caption5-A`, `caption5-D`), or another template that says the same thing. When the family has no variant left, **adapt**: make a new animation for this moment from the family's parts and the theme, with a new layout, a new motion idea or a new way of saying it. The same template with new text is not a new animation.
3. **No template fits the moment:** **build** a new one.

**The target.** Every video makes new animations: at least 3 for a video up to 5 min, then 1 more for each 2 min started after that (4 up to 7 min, 5 up to 9 min, 6 up to 11 min). If the repeats and the moments with no template give fewer, give the strongest moments their own (the hook's promise, the biggest number, a chapter's key fact) instead of a template. `check_pacing.mjs` counts them and warns under the target. Make each one for its moment, never a generic one.

**One moment each.** A new animation plays once. A second similar moment gets its own (`check_pacing.mjs` fails a `new:` device used twice, rule R12).

**Series repeat on purpose.** These are left out of the once-per-video rule: the list counters (`listcounter2`), chapter cards (`chapter2`), the game switch (`gameswitch`), the game tag (`gametag`), the intro, the grounds (`ground-*`) and the transitions (`trans-*`, `whip-*`). A list counter, a chapter card, a game switch or a game tag keeps the variant of its first use (R12).

### Fast: never stall the edit

- **Adapt first.** Start from the closest template: `node <skills>/skills/gta-motion/make_scene.mjs <template> --project . --as <short-name> --theme <theme> --set ...` with this moment's values. It pastes the theme, renames the ids and writes the values. Move the file it writes, `compositions/<short-name>.html`, to `animations/<short-name>/<short-name>.html`, then change its layout and motion. Build from scratch only when nothing is close.
- **Check, fix, move on.** Snapshot the 3 frames (step 3), fix what fails, and go on with the edit once every line passes. Don't polish past the checklist.
- **No approval needed.** Make it, use it, and list it in the final report (step 4).

## 1. Find its family, and look at it

In [catalogue.md](catalogue.md), find the two or three templates that say the closest thing. Judge them by what they say (a number, a date, a place, a person, a comparison, a list, a source), not by how they look. Then read how they're built, as reference: their HTML in `templates/<id>/<id>.html` (layout, sizes, motion, how they end) and their `device.json`. When the lab demo a template came from is on this computer (its `device.json` names it under `source`, in `algrow-gta-pipeline/lab/`), look at it too. Make something that looks like it was always in the set.

## 2. Build it from their parts

- **Theme:** paste [theme.css](theme.css) at the top of the composition's style (`make_scene.mjs` already did it when you adapted a template), and use only its variables and classes:
  - `.g-head` for the headline;
  - `.g-body` for a supporting line;
  - `.g-source` for the source box;
  - `.g-border` for an outline or ring;
  - `.g-ramp` for lines and marks;
  - `.g-scrim` for contrast.

  Never type a colour, font, size or shadow by hand.
- **Motion:**
  - every part lands within `--t-in` (0.4 s): text fades in with a 20 px rise, while lines draw, rings lock on and numbers roll in the same 0.4 s;
  - everything leaves together within `--t-out` (0.23 s);
  - in between, **hold still**: nothing loops, pulses, floats or drifts. A slow push on the footage behind is fine.
- **Several steps in one scene** (a timeline, values said one after the other): each step lands on its own word, following the same entry rule. The scene counts as one graphic. When a new step lands, it replaces the previous step's text. Past steps stay as marks with no text.
- **Layout:**
  - left-aligned or centred. Headlines and full-screen scenes align on `--edge` (192 px, the title-safe line). A lower third or a corner mark aligns on `--edge-low` (120 px), like the validated ones;
  - nothing goes outside action-safe (x 96 to 1824, y 54 to 1026), and headlines stay inside title-safe (x 192 to 1728, y 108 to 972);
  - the sizes from the theme: headline 72 to 120 px, supporting line 34 to 44 px, source box 32 px.
- **Ground:**
  - an overlay sits on the footage, which stays visible and stays the subject;
  - a full-screen scene sits on the shot itself, blurred and dimmed to 60 % with ffmpeg (the recipe is at the end of `theme.css`), with **no colour tint**;
  - never a flat purple, navy or reddish ground.
  - **The build bakes that ground for you.** Put the FFmpeg filter in the animation's `device.json` as `"ground_vf"` (the usual one: `"scale=2112:1188,gblur=sigma=10:steps=3,crop=1920:1080,colorchannelmixer=rr=0.6:gg=0.6:bb=0.6"`), and play `assets/newgrounds/<short-name>.mp4` in its HTML as a full-frame `<video>` from `data-start="0"` for the scene's whole length. `build_video.mjs` makes that file from the shots under the graphic (1920×1080, 30 fps, CRF 16), and makes it again when those shots change. Never bake it by hand: a ground the build doesn't know about goes stale or missing, and a missing file the video plays stops the build (a render would fail on it).
- **Contrast:** every text element needs 3:1 or more against what's behind it in the landed frame. If it falls short, add a `.g-scrim` on the text's side. Never darken the whole ground below 60 %, and never make the text smaller.
- **Both themes:** build it in the video's theme, with `data-theme` on the root, so the other theme works by changing one constant.
- **Real things:**
  - draw no brand logo and no game UI (HUD, map, wanted stars, phone menus);
  - an outlet's logo appears only inside the source box, and only from the repo's `assets/logos/` or a file the user supplied; otherwise write the outlet's name as text;
  - use simple shapes, type and the footage itself.

### What counts as a text element

A text element is one block you read as one unit: a headline, a supporting line, or the source box. Several values on one headline line, like `1440p → 4K · 30 fps`, count as one element. Labels on marks count too, so show labels for the current step only.

### Writing what the voice says

- Show the voice's value and nothing else. Never show a number, date or name the voice doesn't say, even for one frame (a countdown that ticks through "4 days" when the voice says "three").
- Digits are fine for spoken numbers ("three" → 3), and so are standard short forms ("frames per second" → fps, "PlayStation 5" → PS5).
- Use sentence case, as spoken. No letter-spaced capitals.

## 3. Check it yourself

Snapshot three frames: mid-entry, landed (about 1 s after the last part lands) and the last held frame before the exit. Look at each one at full size, and go through every line below. Fix and re-check until every line passes.

| ✓ | Check |
|---|---|
| ☐ | **One idea.** Someone who reads it for 2 seconds gets the point the voice is making. |
| ☐ | **It shows the voice's words:** the same number, date or name, and nothing the voice doesn't say. |
| ☐ | **Two text elements at most** on screen at any moment. |
| ☐ | **Theme fonts and colours only.** In `clean`, everything is full white with no colour, and nothing is grey or see-through. In `vice`, everything is full colour, with no white, cream or grey; one ramp runs across each line or group. |
| ☐ | **Readable on a phone:** headline 72 px or more, supporting line 34 px or more, contrast 3:1 or more. |
| ☐ | **Lands in 0.5 s or less, then holds dead still.** It leaves in 0.3 s or less. |
| ☐ | **Inside the safe area:** nothing outside action-safe and headlines inside title-safe. Everything is aligned on `--edge` or `--edge-low`, or centred, with nothing touching the frame edge. |
| ☐ | **Centred or bottom-left, nowhere else:** a new animation sits in the centre of the frame or in its bottom-left corner, never at the top-left, along the top, or on the right side, and the opening's graphics are centred (owner, 19 Nov 2026: "avoid animations on the side at the top-left, centre them instead, it's cleaner; keep this rule: bottom-left or the middle"). A full-screen card scene centres its content too. The library templates the owner already validated keep their own place. |
| ☐ | **An overlay covers 40 % of the frame or less,** and the footage stays the subject. |
| ☐ | **Straight:** 0° roll on every box and mark. A subtle 3D perspective is fine. |
| ☐ | **Point, don't frame:** show a person with an arrow or a small mark aimed at them, never a box around the face (a moving head never fits it). |
| ☐ | **A photo of a real person or group is a large straight card:** a rectangle about 40-45 % of the frame width, never a small round medallion or circle crop over the footage (owner, 19 Nov 2026: "a bit weird to have a circle that small, and a circle at all"). |
| ☐ | **Zoom circles and loupes sit fully inside the frame** (inside action-safe), every frame of their move. Shrink the circle or set it beside its target rather than let the frame edge cut it. |
| ☐ | **No banned clichés:** an accent bar under a title, letter-spaced capitals, an uppercase pill, an always-on chip or counter, glow on everything, bounce, yellow or orange accents, tilted cards. |
| ☐ | **The removal test:** remove any element whose absence wouldn't make it worse. |

## 4. Use it and tell the user

Don't wait for approval. Save it in the user's project:

```
animations/<short-name>/<short-name>.html
animations/<short-name>/device.json
```

```json
{ "id": "new:launch-countdown", "says": "date", "enter": 0.4, "exit": 0.23, "themes": ["clean", "vice"],
  "family": ["yearstamp-A", "listcounter2-A"] }
```

A scene on its own blurred ground adds `"ground_vf"` to it (step 2, Ground). Put it in the plan as `"device": "new:<short-name>"` and run `check_pacing.mjs`. The checker reads the entry and exit times from that `device.json` (a missing file, `enter` or `exit` fails), applies the same rules as for every template, and counts it toward the video's target.

In your final report, give the count against the target (`check_pacing.mjs` prints both on its screen-time line), then one line per new animation:

> New animations: 4 (target 4 for this 6-min video).
>
> Built 1 new animation: **launch-countdown** at 01:12 (a date countdown, based on Year stamp + List counter). It's saved in `animations/`.

The user can ask for a change afterwards. Never stop the edit to ask first.
