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
- **One theme per video** (`clean` or `vice`, from `channel.json`), and **variety, except in a series**: a list counter or a chapter card keeps the variant of its first use for the whole video, so a top 10 counts down in one style; any other animation used again takes another variant, or another animation that says the same thing (rule R12 in `gta-pacing`).
- **Never invent identity.** A pfp, a channel name or an outlet's logo comes from the user only ([gta-video/channel-kit.md](../gta-video/channel-kit.md)). Left empty, the template leaves that part out.
- **Show only what the voice says:** the same number, date or name, in its words.
- **A logo never pops in.** A game's or an outlet's logo always arrives with a short, clean move of its own (a slide, a land with a hair of scale, a fade with a rise: 0.5 s or less) and leaves the same way. Never cut a logo onto the screen or off it (owner, 17 Nov 2026). Every template that shows a logo already animates it; a new animation must too.
- **Another game comes in with a switch.** When the footage moves to another game and back, play a `gameswitch` over each of those cuts (rule R14 in `gta-pacing`), then the game tag over that game's shots. To compare two games on the same things (their helicopters, bikes, boats), use a `gameboard`: one still of each thing in each game, taken from that game's own footage. A thing with no clear still in one of the two games is left out, never faked (owner, 17 Nov 2026).
- **Show the real thing the words name.** A quote from a magazine shows its real cover (`magcover-A`); a size compared with another game's map shows the real maps; another game shows its real logo; two or three places or things said in one breath ("the Keys, the swamps or Vice City") are a split screen of those very things (`split2-B`, `split2-C`). Every still, clip and panel inside a graphic shows what its words say: a "people reacting" callout over a frame with nobody in it, or a LOADING panel over a car, reads as a mistake. When no footage can show a name (a feature, a setting), use an icon panel (`split2-C` `icon1` to `icon3`), the icon over a lightly blurred mood shot that fits the word (`iconbg` footage, `| gblur=sigma=9:steps=2`; owner, 17 Nov 2026: never all-black panels), or another animation (owner, 16 Nov 2026).
- A template is the graphic layer only. The footage behind it and any blur or dim on that footage belong to the project, baked with FFmpeg.

## Steps

### 1. Pick the animation for each graphic

`gta-pacing` has given each graphic a `reason` and an `anchor`. Find the animation that says it:

| `reason` | Look at |
|---|---|
| `source`, `quote` | Sourced claim (`caption5`), Top banner (`topbar`) |
| `keyword` | Keyword punch (`keyword`) |
| `number`, `comparison` | Stat bars (`statbars`), Sourced claim when a source backs the number, Split screen (`split2`) for shots side by side |
| `list` | List counter (`listcounter2`); two or three places or things the footage can show, said in one breath: Split screen (`split2-B`, `split2-C`) |
| `date` | Year stamp (`yearstamp`) |
| `place` | Place marker (`cornerbug`), Region title (`titre07`), Map caption (`mapcaption`) |
| `name` | Name tag (`nametag`); two people named together: Two names (`nametag2`); who is linked to whom: Relationship wall (`relwall`) |
| `theory` | Forum post (`forumcard`, theory), Phone app (`phoneapp`) |
| `correction` | Strike & correct (`strike`), Forum post (`forumcard`, debunk) |
| `detail` | Detail callouts (`screenshot2`), Trailer carousel (`carousel`) |
| `chapter` | Chapter card (`chapter2`), with a transition (`trans`, `whip`) on the cut |
| `cta` | Subscribe prompt (`subscribe`); a question for the comments: Comment prompt (`comment`) |

Then pick its variant in [catalogue.md](catalogue.md). Read the variant's `device.json`:
- `when` says what it's for;
- `anchor` says which value lands on the word;
- `vars` lists every value it takes.

Write the variant's id as the graphic's `device` in `plan.json`.

### 2. Work out the values

- **Text:** the voice's words, from `words.json`. Keep within each value's `maxLength`. If it doesn't fit, shorten it the way you'd say it, or pick another variant.
- **Times:** they count from the scene's start, which is the graphic's `start` in the plan. Example: if the scene starts at 61.2 and the voice says "subscribe" at 63.1, then `press` is 1.9. Set `out`, the start of the exit, so the scene ends at the graphic's `end`.
- **Files** (a pfp, a logo, a still, the map) are paths in the project's `assets/`. `make_scene.mjs` copies a file from elsewhere into `assets/channel/`.

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

## When no template fits

Work down the ladder in [new-animation.md](new-animation.md): reuse a template with new values, adapt one, or build a new one from the library's parts with [theme.css](theme.css). Build it on your own, check it against the list there, and report it at the end.

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
| `R12 … Vary it` from `check_pacing.mjs` | Use another variant of that animation, or another animation with the same `says`. |
