---
name: gta-video
description: Makes a finished GTA 6 YouTube video from the user's own voice-over, start to end. It transcribes the voice with word timings, asks for the channel kit only when needed, plans the edit with gta-pacing, picks the footage with gta-footage (real gameplay clips from the Algrow GTA connector when it is connected, and the official trailers), builds the animations with gta-motion, then assembles and renders the HyperFrames project with build_video.mjs. Use when the user says "make a video from this voice-over", "edit my GTA 6 video", "turn this script into a video", or gives a voice-over or script about GTA 6 and wants the edit. Not for writing scripts.
compatibility: Node.js 22+, FFmpeg, HyperFrames 0.9.53 with its Chrome and the Parakeet model, and the official videos or a key to the Algrow footage library (see SETUP.md at the repo root). No packages to install.
metadata:
  author: Algrow
  version: 0.1.0
---

# GTA video

The user brings the words; the skills make the edit. The voice-over sets the clock, and everything else is placed on its words: the footage cuts, the few graphics, the transitions. The whole edit is one file, `plan.json`. You build from it, and you change the plan, never the built project.

## Important

- **The voice-over is the user's.** Never rewrite, cut, speed up or re-time it ([inputs.md](inputs.md)).
- **Never invent identity.** Ask for the channel kit when the video needs it; a missing pfp or name is left out ([channel-kit.md](channel-kit.md)).
- **One theme per video, and variety except in a series.** The theme comes from `channel.json`. A list counter, a chapter card, a game switch or a game tag keeps the variant of its first use for the whole video (R12).
- **Templates once each, new animations every video.** Each template is used once per video. Repeats and moments with no template get a new animation made for this video ([new-animation.md](../gta-motion/new-animation.md)), and every video makes at least the target: 3 up to 5 min, 1 more for each 2 min started after that (owner, 18 Nov 2026).
- **Never build a plan that fails `check_pacing.mjs`.** `build_video.mjs` refuses one anyway.
- **The official videos are the user's own files.** Never download, upload or share them, or any frame from them. The gameplay clips the Algrow GTA connector gives stay in the project's `footage/gameplay/`, the same way.
- **Outlet logos come from `assets/logos/` only** (see SETUP.md). `build_video.mjs` puts them in by itself. Never draw, download or invent one; when the build notes "no logo for …", tell the user that outlet showed as text.
- Ask before installing anything ([SETUP.md](../../SETUP.md)).

## Steps

### 0. The first time only

Run `npx -y hyperframes@0.9.53 doctor`. If something is missing, tell the user what it is and why it's needed, give the command from SETUP.md, and install it only after they say yes.

### 1. Set up the project

One folder per video:

```
my-video/
  plan.json          the edit (you write it)
  channel.json       the channel kit (asked once, kept)
  assets/voiceover.mp3   the user's voice-over, copied as it is (wav, mp3 or m4a; keep its extension)
  work/              words.json, beats.json, gameplay_picks.json, shots.json
  footage/gameplay/  the gameplay clips, when the video uses the Algrow GTA connector
```

**Run every command from the project folder.** In the commands below, `<skills>` is the folder of this repo (the one holding `AGENTS.md`); write its full path.

**Footage.** If `library.json` at the repo root has a url, run `node <skills>/skills/gta-footage/library.mjs check`. If it says `footage library OK`, the footage comes from the Algrow footage library: don't ask for a folder, and leave out `--footage` in step 4. If it says the key is missing or wrong, ask the user for their key (SETUP.md, B), or for their footage folder if they have none.

Only without a library key: ask where the official videos are, and check that `node <skills>/skills/gta-footage/find_shots.mjs search "skyline" --place vice_city` finds shots.

**Gameplay clips.** If the Algrow GTA connector's tools are available to you (`gta_search_clips` is one of your tools, `mcp__algrow-gta__gta_search_clips` in Claude Code), the video uses real gameplay for every line about playing the game, and the trailer footage above for the rest ([gta-footage](../gta-footage/SKILL.md), "Gameplay library"). The connector is optional, never a requirement: without it the trailer footage covers every line. When it isn't there, suggest it once, at the start of the video, in one or two lines: it's free and opt-in, it puts real GTA VI gameplay on the lines about playing the game, and SETUP.md ("Gameplay clips") says how to add it (then a new session). Then carry on at once with the trailers: don't wait for an answer, and don't ask again later in the video.

### 2. Transcribe

Follow [inputs.md](inputs.md): `npx -y hyperframes@0.9.53 transcribe assets/voiceover.mp3 --engine parakeet --json`. It prints every word as JSON lines, then a summary line (add `| tail -1` to see only the summary). The words are also written to the file named in its `transcriptPath` (`assets/transcript.json`). Move that file to `work/words.json`. Read the whole transcript once. Note:
- the chapters;
- the calls to action;
- the moments that earn a graphic.

### 3. Ask, only if needed

Ask the theme the first time, and the channel-kit questions if there's a call to action ([channel-kit.md](channel-kit.md)). Use one message. Save the answers in `channel.json`.

### 4. Plan the edit

1. **Cuts and graphics:** `gta-pacing`. It places the cuts on the voice, then puts a graphic on every moment that earns one (20 to 40 % plain footage, Roddy Games density).
2. **Footage:** `gta-footage`. Write `work/beats.json` from the cuts.
   - With the Algrow GTA connector: call `gta_match_script` with `clip_type: "gameplay"` (never a cutscene clip) and the lines of the beats about playing the game, read every pick against its words, swap the weak ones, write `work/gameplay_picks.json`, then run `node <skills>/skills/gta-footage/gameplay.mjs assign work/beats.json work/gameplay_picks.json --out work/beats.json` and `node <skills>/skills/gta-footage/gameplay.mjs fetch work/gameplay_picks.json` right away (the links expire). [gta-footage](../gta-footage/SKILL.md), "Gameplay library", has the rules.
   - Then run `node <skills>/skills/gta-footage/find_shots.mjs pick work/beats.json --footage <folder> --out work/shots.json` (no `--footage <folder>` with the footage library, or when every beat has a gameplay clip). Fix the beats on the report's `CHECK` line (split, give a place, name a shot, or swap a clip) and run it again. Copy the result into the plan's `shots[]`.
   - With gameplay clips: `node <skills>/skills/gta-footage/gameplay.mjs sheet work/shots.json`, and look at `work/gameplay.jpg`: each frame shows what its words say. The game HUD and subtitles stay in gameplay shots, and that is fine.
3. **Graphics:** `gta-motion`. Give each graphic a template variant from its catalogue, with the voice's words and the times as `vars`, each template once. A repeat of the same kind of moment, or a moment no template fits, gets a new animation in the project's `animations/`, and the video makes at least the target ([new-animation.md](../gta-motion/new-animation.md)). A chapter about a place in the game (a region, a city, a drive between two of them) can be a map chapter: `gta-map` says when one earns its place and how to fill `mapchapter-A`.
   Then run the pick again with the plan: `node <skills>/skills/gta-footage/find_shots.mjs pick work/beats.json --plan plan.json --out work/shots.json` (plus `--footage <folder>` without the library). It keeps the trailers' game HUD (minimap, prompts, wanted stars) out from under each graphic (a gameplay clip's HUD is fine there) and doesn't reuse footage the plan already shows. Copy the new shots into the plan.
4. **Check:** run `node <skills>/skills/gta-pacing/check_pacing.mjs plan.json --words work/words.json --channel channel.json --templates <skills>/skills/gta-motion/templates`. Fix every `FAIL` and run it again until it passes.

The plan's format is [plan-format.md](../gta-pacing/plan-format.md).

### 5. Build

```bash
node <skills>/skills/gta-video/build_video.mjs plan.json
```

It checks the plan again, then:
- cuts each shot to 1920×1080 at 30 fps, with the letterbox bars removed (shots already cut are reused); with the footage library, it fetches them already cut;
- cuts each gameplay shot (`src` `gameplay/<id>`) from `footage/gameplay/`, full frame with its HUD, scaled 1.5x, without the game's sound ([gta-footage](../gta-footage/SKILL.md), "How a gameplay clip is cut");
- makes one scene per graphic, with the pfp and channel name from the kit;
- cuts the stills and clips the graphics take from the official videos (`@frame`, `@clip`) into `assets/media/`;
- bakes the blurred or graded footage that some templates sit on (their `ground`), and the ground scenes under full-screen graphics, into `assets/grounds/`;
- bakes the ground of each new animation that has one (`"ground_vf"` in its `device.json`) from the shots under it into `assets/newgrounds/<name>.mp4`, the file its HTML plays ([new-animation.md](../gta-motion/new-animation.md), Ground);
- bakes each transition from the two shots around its cut into `assets/transitions/`;
- writes `index.html`. If a file the video plays isn't there (an `assets/...` file named in the page or in a scene), it stops first and names it: the render would fail on it.

Every step keeps what it already made: change one graphic and build again, and only that graphic is remade. Add or remove a shot and the later shot files (named by their place, `s001`...) are renamed, not cut again.

Read its notes.

### 6. Look before you render

From the project folder:

```bash
npx -y hyperframes@0.9.53 check --json
npx -y hyperframes@0.9.53 snapshot --at 6.5,20.1,34.9
```

- `check` must pass.
- Snapshot each graphic once it has landed, plus each chapter start, and look at every frame:
  - Is the text readable on its shot, and does every box end cleanly after its text?
  - Is the footage what the voice says? Nothing on screen may show a different thing from the words (no food under a workout line, no empty street under "people reacting").
  - When the voice names another game, a magazine or a map, is the real one on screen (its footage, logo, cover, map)?
- Open `work/stills.jpg` (the build writes it and says so in its notes): every still and clip the graphics show, each labelled with the words it illustrates. In each one, is the named thing the subject: big, whole, sharp, not behind a character, not under trailer text? Replace any picture that isn't (another `@frame` time, a tighter crop, another source), or drop that item ([gta-motion](../gta-motion/SKILL.md), "The thing is the subject of its picture").
- Open `work/boxes.jpg` when the video has detail callouts: every box, lens and arrow numbered on its frozen still. Each must sit on the thing the voice names, whole. One that doesn't: place it again with `find_box.mjs` and its blind check, or drop that detail ([gta-motion](../gta-motion/SKILL.md), "A box sits on the thing it names").
- To fix something, change `plan.json` and build again.

### 7. Render

```bash
npx -y hyperframes@0.9.53 render -o out/video.mp4 --crf 16
```

It takes several minutes; tell the user before you start. Then give them the file's path, the number of new animations against the target, and one line per new animation you built ([new-animation.md](../gta-motion/new-animation.md), step 4).

## Troubleshooting

| You see | Fix |
|---|---|
| `build_video: the plan fails gta-pacing` | Fix the listed rules in `plan.json` (see `gta-pacing`), then build again. |
| `footage not found` | The official video isn't at that path. Ask the user for the folder; never download it. |
| `the gameplay clip … isn't in footage/gameplay/` | Run `gameplay.mjs fetch work/gameplay_picks.json` from the project folder. For a link that expired, call `gta_get_clip` with that id, put the fresh clip in the picks file, and fetch again. |
| `… is 4.20 s long; from "in" … the shot needs …` | The gameplay shot runs past the end of its clip. Run `gameplay.mjs assign` and `find_shots.mjs pick` again, or continue the beat into the next clip of its scene. |
| `<graphic>: <template> has no vice version` | That variant is clean only. Pick another variant of the animation for this video. |
| `make_scene: … fits 14 at most` | Shorten the text the way the voice would say it, or pick a variant with more room. |
| `transition at …: no cut between two shots there` | A transition sits exactly on a cut: one shot's `end` and the next one's `start` equal its `at`. Move it, or move the cut. |
| `transition at …: the incoming shot is shorter than …` | The shot after a transition must last at least the move (7 to 25 frames). Lengthen it, or use a shorter transition. |
| `"@frame …": no official video with the id …` | That official video isn't in the footage folder. Ask the user for it, or add `"footage": "<folder>"` to the plan if no shot uses that folder. |
| A shot shows black bars | Add `"bars": <px at 1080p>` to that shot in the plan, then build again. |
| `the footage library has no key` / `refused your key (…abcd)` | Ask the user for their key (SETUP.md, B). Never print it or write it anywhere but `library.json`. |
| `Daily footage cap reached for this key` | The key's 45 minutes of footage for today are used. Build again after 00:00 UTC: the pieces already fetched are kept. |
| `the footage library ... isn't answering` | Check the internet connection and build again in a minute. If it keeps failing, tell the user to contact Algrow. |
| The render is slow or runs out of memory | Close other apps. `render --workers 2` uses less memory. |
| `PLAN_TOO_LARGE` on a render with `--start`/`--end` | Only ranged renders have this 2 GB cap, and a long video (about 10 min or more) passes it. Render the whole video without `--start`/`--end`. |
