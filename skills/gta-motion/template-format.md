# How a template is built

Every animation in [catalogue.md](catalogue.md) is a template in `templates/<variant>/`. You never edit a template to use it: `make_scene.mjs` copies it into the project with the video's values. This page is for whoever adds or changes a template. The reference is `templates/subscribe-B/`.

## The folder

```
templates/<variant>/<variant>.html     the scene: one file, both themes
templates/<variant>/device.json        what it says, when to use it, its timings and values
```

`<variant>` is the catalogue's id, as written there (`caption5-A`, `relwall-A3`).

## The scene file

- **One scene, one layer.** It's the graphic only. The footage, a full-screen ground and the music belong to the project. If the graphic needs a dim to stay readable, it gets a soft black gradient layer of its own (never a tint) that fades in and out with it, like `#subscribe-b-dim`.
- **A box hugs its text.** A card, plate or box around text takes its text's width (`width: max-content` with a `max-width`), centred where the layout is centred. A fixed width leaves an empty side on a short line (owner, 16 Nov 2026: `forumcard-B2` with a one-line claim).
- **Wrapped in `<template>`.** The first line of its style block is the marker `/*GTA-THEME*/`; `make_scene.mjs` pastes `theme.css` there. Write no HTML tag in the style block, not even in a comment.
- **Ids.** The root id is the variant in lower case (`subscribe-b`), and so is its `data-composition-id`. Every other id starts with it (`subscribe-b-row`). Every selector starts from `#<root id>`. `make_scene.mjs` renames them all for each use, so two uses never collide.
- **Both themes in one file.** The root's `data-theme` comes from the `theme` variable. What changes between themes is `#root[data-theme="vice"]` rules or theme tokens. The layout, timing and motion are the same.
- **Theme first, but the validated look wins.** Use `theme.css` tokens and classes where they give the same result. Where the validated variant differs (a size, a shadow, a colour of its own), keep its exact value as a custom property on the root, named for what it is (`--sb-glass`).
- **Values are variables.** Declare them on the root in `data-composition-variables` (single-quoted JSON; no apostrophes in labels). The first one is `theme` (`enum`: clean, vice). After it:
  - every text the voice says, `string` with a `maxLength` the layout holds;
  - every time that lands on a word, `number` in seconds from the scene's start (`press`);
  - `out`, the time the exit starts;
  - identity (`channel`, `avatar`, an outlet's logo): empty by default, and empty means left out (no circle, no name, the outlet's name as text);
  - any image or clip the graphic shows inside itself (a still in a card, the map): a file path in the project's `assets/`, listed in `files`. A template never ships an image of the game.

  Lists are numbered values (`name1`, `name2`, `name3`), as many as the validated variant shows. Say in `vars` whether an empty one drops out.
- **The script reads its values once,** through `window.__hyperframes.getVariables()`, with fallbacks equal to the declared defaults. The declaration attribute is gone once the scene is mounted, so never parse it. Set `data-theme` from `theme`, show or hide the optional parts, then build **one** paused GSAP timeline from the values and register it: `window.__timelines["<root id>"] = tl`. It ends with `tl.set({}, {}, out + <exit total>)`.
- **Gotchas found while converting the library:**
  - A scene that starts later in the video is still hidden when its script runs, so text measured in place comes back as zero. Measure on an off-screen copy (a clone in a `position: fixed; left: -9999px; visibility: hidden` box), then throw the copy away. The scene's style rules don't reach a copy outside the scene, so copy each element's computed type and box styles onto it inline first (`getComputedStyle` → `style`), or it measures unstyled.
  - Don't put `data-var-text` on an element whose script fills it with word or letter spans: HyperFrames writes the text first, and it shows twice.
  - Make optional images in the script, not as empty `img` tags in the markup: two empty images trip the duplicate-media lint.
  - Never build into `document.getElementById("<root id>")`: the host `div` in index.html has that same id and comes first, so the parts land outside the scene and none of its styles reach them (the game boards rendered unstyled, 17 Nov 2026). Put an empty `<div id="<root id>-stage">` inside the root and build into that: make_scene renames it with the root, so it stays unique.
  - No template literal in a selector (`` querySelector(`#x-${half}`) ``): the bundler's CSS parser crashes on it (lint `template_literal_selector`). Write each selector out in full.
- **The validated motion, frame for frame:** the same frames, eases and order. Change it only where a rule needs it: each part lands in 0.5 s or less and leaves in 0.3 s or less. Write what you changed in `device.json` under `changed`.

## device.json

```json
{
  "id": "subscribe-B", "animation": "subscribe", "name": "Subscribe prompt: lower-left signature",
  "says": "cta", "layer": "overlay", "themes": ["clean", "vice"],
  "when": "The voice asks to subscribe. Put it on a calm, good-looking shot.",
  "anchor": "The press (`press`) lands on the word \"subscribe\".",
  "duration": { "default": 4.73, "min": 3.4 },
  "enter": 0.5, "enter_total": 0.7, "exit": 0.27, "exit_total": 0.4,
  "text": ["channel", "ask"], "identity": ["avatar", "channel"], "files": ["avatar"], "required": [],
  "vars": { "press": "seconds after the start: when the voice says \"subscribe\"" },
  "source": "algrow-gta-pipeline/lab/cards/compositions/sbb.html (validated as subscribe-B)"
}
```

| Field | Meaning |
|---|---|
| `says` | What it says: `claim`, `number`, `ranking`, `date`, `place`, `person`, `relation`, `post`, `correction`, `cta`, `chapter`, `detail`, `compare`, `transition`, `ground` |
| `layer` | `overlay` (on the footage), `fullscreen` (on its own ground), `transition` (between two shots) or `ground` |
| `series` | `true` for an animation that counts through a video (list counters, chapter cards): every use in one video is the same variant (R12). Leave it out otherwise. |
| `enter` / `exit` | The longest entry / exit of one part, in seconds. `check_pacing.mjs` reads them |
| `enter_total` / `exit_total` | From the first part moving to the last part still, in and out |
| `text` | The values that are text on screen (to count the reading time) |
| `identity` | The values that come only from the channel kit and are never invented |
| `files` | The values that are files in the project's `assets/` |
| `required` | The values `make_scene.mjs` refuses to leave empty (the map, a shot to show) |
| `bundled` | Files the template ships for values left empty: `{"storm": "files/storm.png"}`, paths from the template's folder. Only our own pictures (the census maps, a procedural storm), never game art. `make_scene.mjs` copies them to `assets/templates/<variant>/` |
| `ground` | Optional: what the footage under the scene must look like, when the validated clip changed it (below) |
| `changed` | Optional: what differs from the validated variant, and why |

### `ground`: a treated shot under the scene

Some validated scenes sit on the footage under them, blurred, dimmed or graded: a big centred claim, a year stamp's memory look. That treatment is baked with FFmpeg by `gta-video/build_video.mjs`, never drawn in CSS:

```json
"ground": {
  "vf": "scale=2112:1188,gblur=sigma=10:steps=3,crop=1920:1080,colorchannelmixer=rr=0.6:gg=0.6:bb=0.6",
  "sharp_at": "dock",
  "sharp_fade": 0.5
}
```

| Field | Meaning |
|---|---|
| `vf` | The exact FFmpeg filter of the validated clip, applied to the 1920×1080 footage under the scene, for the scene's whole length |
| `soft_at` | Optional: when the treatment fades in over the sharp shot, in seconds from the scene's start (a number, or a variable's name). Left out: treated from the first frame |
| `soft_fade` | Optional: that fade's length, in seconds |
| `sharp_at` | Optional: when the treated footage crossfades back to the sharp shot (a variable's name such as `"dock"`, a variable plus or minus seconds such as `"out+0.0667"`, or a number) |
| `sharp_fade` | Optional: that crossfade's length, in seconds. `0` is a cut back to the sharp shot |
| `push` | Optional: the slow camera push of the validated clip, as the scale it reaches (`1.03`). The treated footage then lasts the whole scene |
| `push_time` | Optional: the seconds it takes to reach `push` (linear, from the scene's start). Left out: the scene's length |

The built project places the treated footage above the shots and below the scene, over the shots that play under it (across their cuts). The fades are linear. A template with a `ground` draws no footage and no dim of its own for it.

### Transitions and grounds

Two layers are not graphics: `gta-video/build_video.mjs` places them itself.

| Field | Layer | Meaning |
|---|---|---|
| `recipe` | both | The FFmpeg command that bakes the template's picture, with `{name}` slots. The builder runs it without a shell (only `ffmpeg`, commands joined by `&&`), so the same command works on Windows, macOS and Linux |
| `recipe_vars` | both | What each slot is, in words |
| `recipe_defaults` | ground | Values for the slots the builder doesn't fill (`{sigma}`, `{tint}`…): the validated ones |
| `cut` | transition | Seconds of the move before the cut: the scene starts at `at − cut` |
| `tail` | transition | Frames of the outgoing shot the move reads past the cut. The builder cuts that shot longer |
| `window` | transition | Where the baked move goes: `assets/transitions/SCENE_ID.mp4`. It's written in the scene file, not a variable, so the renamed scene points to its own file |
| `placement` | both | How it's mounted, in words |

A transition fills `{from}` / `{from_in}` (the outgoing shot, from the scene's first frame) and `{to}` / `{to_in}` (the incoming shot, from the cut). A ground fills `{shot}` / `{time}` / `{plate}` (ground-D) or `{trailer1}` / `{tmp}` / `{sky}` (ground-E).

### Files in the scene

- **Write a file value into a `src`.** HyperFrames 0.9.53 plays a `<video>` only from a `src` written in the file once its scene starts after 0 s; a `src` set by `data-var-src` or by the script renders blank. `make_scene.mjs` writes each file value into the `src` of the elements bound to it (`<video data-var-src="after">`), so bind every video to its variable that way, and never create a video in the script.
- **A clip's timing is written, never set by the script.** HyperFrames reads `data-start`, `data-duration` and `data-media-start` from the file before the script runs. When they depend on the values, write them as formulas of the number variables and `duration` (the scene's length): `data-start-expr="out - 0.05"`, `data-duration-expr="duration - out + 0.05"`. `make_scene.mjs` computes them (on the 30 fps grid) and writes the real attributes. Only numbers, number variables and `+ - * / ( )`.
- **Apostrophes** in the variable declarations (a label, a default) are written `&#39;`: the declaration is a single-quoted attribute.

File values given from outside the project are copied in: the channel kit to `assets/channel/`, any other file to `assets/<variable>/` (an outlet's `logo` to `assets/logo/`).

## Test it against the validated clip

1. A test project in `algrow-gta-pipeline/lab/tpl-test/<group>/`: the same footage as the validated clip, behind one scene per variant and per theme, all made with `make_scene.mjs`, never by hand. Place them so their frames line up with the validated clip.
2. `npx -y hyperframes@0.9.53 check --json` passes.
3. Render it, then put the validated frame and the template's frame side by side at four moments: mid-entry, landed, held, and mid-exit. Look at each one at full size.
4. Fix until they match. The only accepted differences are the channel's real picture in place of the lab's monogram, and the timing changes written under `changed`.
