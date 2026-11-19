---
name: gta-motion
description: The validated animation library for GTA 6 YouTube videos, as ready-made HyperFrames templates in two themes (clean white, or Vice City sunset colours). Sourced claims, list counters, stat bars, name tags, map captions, chapter cards, detail callouts, subscribe and comment prompts, transitions and more. make_scene.mjs drops one into the video's project with the voice's words, the channel kit and the timing. Use when a plan.json needs its graphics built, when the user asks for an animation, a lower third, a title, a counter or a transition in a GTA video, or when no template fits and a new animation must be made in the same style. Not for picking footage or deciding where graphics go.
compatibility: Node.js 22+ and HyperFrames 0.9.53 (see SETUP.md at the repo root). No packages to install. Used by gta-video after gta-pacing has placed the graphics.
metadata:
  author: Algrow
  version: 0.1.0
---

# GTA motion

Every animation here was designed, then validated by eye in both themes before it joined the library. Each validated variant is a template in `templates/<variant>/`. You never redraw one: you give it the voice's words and the right times, and it plays exactly as validated.

## Important

- **Values only.** Change a template through its values (`--set`), never by editing its look or motion. If a moment needs something no template does, follow [new-animation.md](new-animation.md).
- **One theme per video** (`clean` or `vice`, from `channel.json`), and **variety, except in a series**: a list counter, a chapter card, a game switch or a game tag keeps the variant of its first use for the whole video, so a top 10 counts down in one style (rule R12 in `gta-pacing`).
- **Templates once each, new animations every video.** Each template is used once per video. A repeat of the same kind of moment takes another variant; when the family has none left, or no template fits, it gets a new animation made for this video ([new-animation.md](new-animation.md)). Every video makes at least the target: 3 up to 5 min, 1 more for each 2 min started after that (owner, 18 Nov 2026).
- **Never invent identity.** A pfp, a channel name or an outlet's logo comes from the user only ([gta-video/channel-kit.md](../gta-video/channel-kit.md)). Left empty, the template leaves that part out.
- **Show only what the voice says:** the same number, date or name, in its words.
- **A logo never pops in.** A game's or an outlet's logo always arrives with a short, clean move of its own (a slide, a land with a hair of scale, a fade with a rise: 0.5 s or less) and leaves the same way. Never cut a logo onto the screen or off it (owner, 17 Nov 2026). Every template that shows a logo already animates it; a new animation must too. Text under or over a logo (a year, a line) centres on the logo's artwork, not on its image box: many logos lean to one side (GTA VI's leans right). Its visual centre is `cx` in `assets/logos/logos.json`, passed as the template's `logo_cx` (owner, 17 Nov 2026).
- **An intro only when it fits the script.** The intro templates are not obligatory (owner, 17 Nov 2026). **`intro-A` waits for the trailers:** its shelf shows Rockstar's trailers (Trailer 1, Trailer 2, An Extended Look), which aren't on the Algrow GTA connector yet, so don't use it until they are (owner, 19 Nov 2026); `intro-B` works with gameplay. Use one only when it matches how the script opens: `intro-A` (the trailer shelf opens, the logo lands in the corner, the picked card flies into the first shot) when the first lines are about the game, its trailers or what was shown; `intro-B` (the logo lands, turns into a window onto the first shot, the camera dives through it) when the first line names the game itself. When neither matches, don't force one: make a new opening animation for this script's first line ([new-animation.md](new-animation.md)), in the same style, or open on the hook's own graphics. An intro starts at 0:00 with reason `intro` and no anchor, once per video, over or into the video's first shot: a calm, readable one (a skyline, a beach, a drive). intro-B cuts its window with the logo's silhouette, solid inside, which make_scene makes from the logo (`logo_shape.mjs`), so no sliver of the ground floats in the window where the artwork has gaps (owner, 17 Nov 2026).
- **Another game comes in with a switch.** When the footage moves to another game and back, play a `gameswitch` over each of those cuts (rule R14 in `gta-pacing`), then the game tag over that game's shots. To compare two games on the same things (their helicopters, bikes, boats), use a `gameboard`: one still of each thing in each game, taken from that game's own footage. A thing with no clear still in one of the two games is left out, never faked (owner, 17 Nov 2026).
- **Show the real thing the words name.** A quote from a magazine shows its real cover (`magcover-A`); a size compared with another game's map shows the real maps; another game shows its real logo; two or three places or things said in one breath ("the Keys, the swamps or Vice City") are a split screen of those very things (`split2-B`, `split2-C`). Every still, clip and panel inside a graphic shows what its words say: a "people reacting" callout over a frame with nobody in it, or a LOADING panel over a car, reads as a mistake. When no footage can show a name (a feature, a setting), use an icon panel (`split2-C` `icon1` to `icon3`), the icon over a lightly blurred mood shot that fits the word (`iconbg` footage, `| gblur=sigma=9:steps=2`; owner, 17 Nov 2026: never all-black panels), or another animation (owner, 16 Nov 2026).
- **The thing is the subject of its picture.** A still or clip in a graphic shows the thing its words name big, whole and sharp: it fills a good part of the card (a third of the frame or more), it is lit and in focus, and nothing covers it. These don't count: a character in the foreground with the thing behind, the thing cut off by the edge or small in a corner, a dark or blurred frame, trailer text over it ("AND MUCH MORE", a title, a date card). To find the frame, make a contact sheet of the source around the moment (`ffmpeg -ss A -to B -i <video> -vf "fps=2,scale=320:-1,tile=6x5" sheet.jpg`), look at it, take the frame where the thing is biggest and clearest, and crop to it. With no such frame, leave that thing out (owner, 17 Nov 2026: a GTA IV "boat" that showed Niko's shoulders and a slice of the boat). `build_video.mjs` puts every picture on `work/stills.jpg` for a last look ([gta-video](../gta-video/SKILL.md), step 6).
- **A box sits on the thing it names.** A detail box, a cut-out, a lens or an arrow (`screenshot2-A/B/C`) goes on a frozen still where the thing the voice names is clearly visible, and sits on that thing, whole. Boxes around the wrong thing are why they were taken out of our videos (owner, 17 Nov 2026), so never write their pixel values from a glance at the frame:
  1. `node find_box.mjs grid <still>`: read the thing's left, top, right and bottom edges off the rulers, roughly.
  2. `node find_box.mjs zoom <still> --near x1,y1,x2,y2`: read them again on the magnified rulers, tight around the whole thing.
  3. `node find_box.mjs check <still> --box x1,y1,x2,y2 --label "<the words>"`: look at `check.jpg` (the box on the still) and heed its warnings (too small, too big, touching the edge).
  4. The blind check: a fresh subagent that knows nothing of the video sees only `crop.jpg` and says what its main thing is and whether the frame cuts it off (the tool prints the question). Keep the box only when it names the thing the voice names. "Cut off": look at `check.jpg`, widen the box if the thing goes on, keep it if it only goes behind something in the scene. "Too blurry to tell": the detail is too small for a box; use the magnifier (`screenshot2-B`), a still where it is bigger, or drop it.
  A lens or an arrow takes the box's centre (`cx`, `cy`). `build_video.mjs` draws every box, lens and arrow on `work/boxes.jpg` for a last look ([gta-video](../gta-video/SKILL.md), step 6).
- A template is the graphic layer only. The footage behind it and any blur or dim on that footage belong to the project, baked with FFmpeg.

## Steps

### 1. Pick the animation for each graphic

`gta-pacing` has given each graphic a `reason` and an `anchor`. Find the animation that says it:

| `reason` | Look at |
|---|---|
| `source`, `quote` | Sourced claim (`caption5`), Top banner (`topbar`) |
| `keyword` | Keyword punch (`keyword`) |
| `number`, `comparison` | Stat bars (`statbars`), Sourced claim when a source backs the number, Big number (`bignumber2`) for one figure said on its own, Split screen (`split2`) for shots side by side, Before / after slider (`slider`) for two versions of the same spot, Map size (`mapsize`) for two maps, Game board (`gameboard`) for two games on the same things |
| `list` | List counter (`listcounter2`); two or three places or things the footage can show, said in one breath: Split screen (`split2-B`, `split2-C`); 2 to 4 short things over footage that keeps cutting: Spoken-list tags (`listtags`) |
| `date` | Year stamp (`yearstamp`); several dates in a row: Timeline (`timeline`) |
| `place` | Place marker (`cornerbug`), Region title (`titre07`), Map caption (`mapcaption`), Map locator (`maplocator`) over a run of shots; a place based on a real one: Real-world twin (`realcard`) |
| `name` | Name tag (`nametag`); two people named together: Two names (`nametag2`); who is linked to whom: Relationship wall (`relwall`) |
| `theory` | Forum post (`forumcard`, theory), Phone app (`phoneapp`) |
| `correction` | Strike & correct (`strike`), Forum post (`forumcard`, debunk) |
| `detail` | Detail callouts (`screenshot2`), Trailer carousel (`carousel`) |
| `chapter` | Chapter card (`chapter2`), with a transition (`trans`, `whip`) on the cut |
| `cta` | Subscribe prompt (`subscribe`); a question for the comments: Comment prompt (`comment`) |
| `switch` | Game switch (`gameswitch`) on each cut to another game and back; Game tag (`gametag`) over that game's shots |
| `intro` | Intro (`intro-B`; `intro-A` once the trailers are on the connector), only when it matches how the script opens (above) |

Then pick its variant in [catalogue.md](catalogue.md), one the video hasn't used yet (each template plays once per video). Read the variant's `device.json`:
- `when` says what it's for;
- `anchor` says which value lands on the word;
- `vars` lists every value it takes.

Write the variant's id as the graphic's `device` in `plan.json`.

### 2. Work out the values

- **Text:** the voice's words, from `words.json`. Keep within each value's `maxLength` (`check_pacing.mjs` checks every value of the plan against its template, all at once, before the build). If it doesn't fit, shorten it the way you'd say it, or pick another variant.
- **Times:** they count from the scene's start, which is the graphic's `start` in the plan. Example: if the scene starts at 61.2 and the voice says "subscribe" at 63.1, then `press` is 1.9. Set `out`, the start of the exit, so the scene ends at the graphic's `end`.
- **Files** (a pfp, a logo, a still, the map) are paths in the project's `assets/`. `make_scene.mjs` copies a file from elsewhere into `assets/channel/`. A GTA VI still or clip is a frame of a gameplay clip from the Algrow GTA connector, never a GTA VI video file: `@frame gameplay/<clip id> <seconds>` or `@clip gameplay/<clip id> <seconds> <length>` in the plan, cut by `build_video.mjs` ([plan-format.md](../gta-pacing/plan-format.md)).

### 3. Make the scene

```bash
node <skills>/skills/gta-motion/make_scene.mjs subscribe-B --project . --as cta1 --theme vice \
  --set channel="Leonida Files" --set avatar=kit/pfp.png --set press=1.9 --start 61.2
```

It writes `compositions/cta1.html`, copies the fonts, and prints the host tag. Paste the host tag inside the root of `index.html`, above the footage. Each use gets its own `--as` id. The project's `index.html` loads GSAP 3.15.0 once.

### 4. Check it

```bash
npx -y hyperframes@0.9.53 check --json
npx -y hyperframes@0.9.53 snapshot --at 62.5
```

The check must pass. Look at the landed frame: is the text readable on that shot? If it isn't, move the graphic onto a calmer shot. Never darken the whole frame or shrink the text.

## New animations for this video

A moment whose family has no unused variant left, or that no template fits, gets a new animation made for it, and every video makes at least the target (3 up to 5 min, 1 more for each 2 min started after that). Follow [new-animation.md](new-animation.md): adapt the closest template, or build one from the library's parts with [theme.css](theme.css). Make it on your own, check it against the list there, and report it at the end.

How the templates are built (to add or change one): [template-format.md](template-format.md).

## Troubleshooting

| You see | Fix |
|---|---|
| `make_scene: ask is 20 characters; this template fits 14 at most` | Shorten the text the way the voice would, or pick a variant with more room. |
| `make_scene: … needs map` (or another required value) | That template can't play without it. Give the file, or pick another animation. |
| `avatar is empty: the template leaves it out` | Expected with no pfp in the channel kit. Never make one up. |
| `index.html doesn't load GSAP` | Add the GSAP script tag it prints to the head of `index.html`. |
| The scene is blank in the render | Its host tag's `data-composition-id` must equal its `--as` id, and `data-start`/`data-duration` must cover the moment. Run `check` and read the errors. |
| `R12 … A series looks the same` from `check_pacing.mjs` | Use the list counter or chapter card variant of its first use everywhere in this video. |
| `R12 … Each template plays once per video` from `check_pacing.mjs` | Use an unused variant it lists, another template with the same `says`, or a new animation made for this moment ([new-animation.md](new-animation.md)). |
| `R12 … new animation(s) in this video; aim for` from `check_pacing.mjs` | Give the strongest moments their own new animation instead of a template, up to the target. |
| Text looks wrong in one scene (missing spaces, a word in the wrong place) | Look at it alone: `npx -y hyperframes@0.9.53 snapshot --at <s> --zoom "#<scene-id>-<part>"`, then compare with the same scene starting at 0 s. A template that builds its words by script keeps each space in its own `span`: in a scene that starts after 0 s, HyperFrames moves the elements and leaves bare text-node spaces behind (fixed in strike-B3, 18 Nov). |
| `--duration … cuts the exit` | build_video moves `out` back by up to 3 frames by itself. More than that: end the graphic later or set an earlier `out`. |
