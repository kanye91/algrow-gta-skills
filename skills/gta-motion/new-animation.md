# When no animation fits: build one yourself

The templates are a database, not a limit. When a moment needs something no template does, build a new animation **on your own, without stopping to ask the user**. Build it from the database's parts so it looks like it was always in the set. Then check it against the list below and fix it until every line passes.

## 0. Make sure you need it

Work down this ladder, and stop at the first step that works:

1. **Reuse:** a template says this moment with new values. A ranking is Stat bars; a date is Year stamp; a place is Region title. This covers most moments.
2. **Adapt:** a template is close. Copy its composition into the project and change its text, layout or number of items, but keep its motion and parts.
3. **Build:** nothing in [catalogue.md](catalogue.md) can say it. Write a new composition from the family's parts (step 1).

Adapt and Build end the same way: the result is saved in `animations/` and reported to the user (step 4).

If more than two moments in one video need a new animation, stop. Either the plan is too busy (go back to `gta-pacing`), or you're misreading the catalogue.

## 1. Find its family

In [catalogue.md](catalogue.md), find the two or three templates that say the closest thing. Judge them by what they say (a number, a date, a place, a person, a comparison, a list, a source), not by how they look. Open their source and read how they're built: layout, sizes, motion, how they end.

## 2. Build it from their parts

- **Theme:** paste [theme.css](theme.css) at the top of the composition's style, and use only its variables and classes:
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
| ☐ | **An overlay covers 40 % of the frame or less,** and the footage stays the subject. |
| ☐ | **Straight:** 0° roll on every box and mark. A subtle 3D perspective is fine. |
| ☐ | **Point, don't frame:** show a person with an arrow or a small mark aimed at them, never a box around the face (a moving head never fits it). |
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

Put it in the plan as `"device": "new:<short-name>"` and run `check_pacing.mjs`. The checker reads the entry and exit times from that `device.json` and applies the same rules as for every template.

In your final report, add one line per new animation:

> Built 1 new animation: **launch-countdown** at 01:12 (a date countdown, based on Year stamp + List counter). It's saved in `animations/` and can be reused.

The user can ask for a change afterwards. Never stop the edit to ask first.
