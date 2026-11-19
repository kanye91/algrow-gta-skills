---
name: gta-video
description: Makes a finished GTA 6 YouTube video from the user's own voice-over, start to end. It transcribes the voice with word timings, asks for the channel kit only when needed, plans the edit with gta-pacing, picks the footage with gta-footage (real GTA VI gameplay clips from the Algrow GTA connector, and another game's official videos when the voice talks about it), builds the animations with gta-motion, then assembles and renders the HyperFrames project with build_video.mjs. Use when the user says "make a video from this voice-over", "edit my GTA 6 video", "turn this script into a video", or gives a voice-over or script about GTA 6 and wants the edit. Not for writing scripts.
compatibility: Node.js 22+, FFmpeg, HyperFrames 0.9.53 with its Chrome and the Parakeet model, the Algrow GTA connector (free, signed in with an Algrow account), and yt-dlp for other games' official videos, installed by `official_video.mjs install` when a video needs it (see SETUP.md at the repo root). No packages to install.
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
- **GTA VI footage comes only from the Algrow GTA connector** (gameplay clips; Rockstar's trailers are coming to it). Never download or ask for GTA VI videos. **Other games' official videos** come only from their publisher's own YouTube channel (`gta-footage/official-channels.json`), downloaded on the user's computer with yt-dlp (`gta-footage/official_video.mjs get`). All footage stays in the project's `footage/` and is never uploaded, shared or committed, nor any frame from it. Never a fan upload or a re-upload, and never a way around a refused download.
- **Outlet logos come from `assets/logos/` only** (see SETUP.md). `build_video.mjs` puts them in by itself. Never draw, download or invent one; when the build notes "no logo for …", tell the user that outlet showed as text.
- Ask before installing anything ([SETUP.md](../../SETUP.md)), except yt-dlp: when a video needs another game's official videos and it's missing, install it yourself and say so in one line (step 4).
- **Never generate a voice-over without asking.** A script with no voice-over: ask first, generate only after a yes ([inputs.md](inputs.md)).

## Steps

### 0. The first time only

Run `npx -y hyperframes@0.9.53 doctor`. If something is missing, tell the user what it is and why it's needed, give the command from SETUP.md, and install it only after they say yes.

Then check the **Algrow GTA connector**: it is there when `gta_search_clips` is one of your tools (`mcp__algrow-gta__gta_search_clips` in Claude Code). It is the video's GTA VI footage, so it is needed. If it isn't there, tell the user in a few lines: it's free with an Algrow account, it gives real GTA VI gameplay clips matched to their lines, the command to add it (SETUP.md, "The footage: the Algrow GTA connector"), and that they then sign in with `/mcp` and start a new session. Don't start the edit until it's there.

yt-dlp isn't checked here: it's installed only when a video talks about another game (step 4).

### 1. Set up the project

One folder per video:

```
my-video/
  plan.json          the edit (you write it)
  channel.json       the channel kit (asked once, kept)
  assets/voiceover.mp3   the user's voice-over, copied as it is (wav, mp3 or m4a; keep its extension)
  work/              words.json, beats.json, gameplay_picks.json, shots.json
  footage/gameplay/  the GTA VI gameplay clips from the Algrow GTA connector
  footage/other/     other games' official videos (footage/other/rdr2/...), when the voice talks about another game
```

**Run every command from the project folder.** In the commands below, `<skills>` is the folder of this repo (the one holding `AGENTS.md`); write its full path.

**Footage.** Every GTA VI beat gets a gameplay clip from the connector ([gta-footage](../gta-footage/SKILL.md), "Gameplay library"). Nothing else is needed for GTA VI: no video files, no folder to ask for.

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
   - Call the connector's `gta_match_script` with `clip_type: "gameplay"` (never a cutscene clip) and the lines of every GTA VI beat, read every pick against its words, swap the weak ones, write `work/gameplay_picks.json`, then run `node <skills>/skills/gta-footage/gameplay.mjs assign work/beats.json work/gameplay_picks.json --out work/beats.json` and `node <skills>/skills/gta-footage/gameplay.mjs fetch work/gameplay_picks.json` right away (the links expire). [gta-footage](../gta-footage/SKILL.md), "Gameplay library", has the rules.
   - When the voice talks about another game: find its official videos, get one or two, look at the sheet, and give each of its beats `src`, `in` and `game` (`node <skills>/skills/gta-footage/official_video.mjs find "<game>"`, then `get` and `sheet`). Tell the user in one line what was downloaded. If it says yt-dlp isn't installed (exit 3), install it yourself without asking: `node <skills>/skills/gta-footage/official_video.mjs install`, tell the user in one line ("Installing yt-dlp, free, to download RDR2's official trailer for that part"), and carry on. Only if the install fails, ask the user for that game's official video file. [gta-footage](../gta-footage/SKILL.md), "Another game's footage", has the steps and rules.
   - Then run `node <skills>/skills/gta-footage/find_shots.mjs pick work/beats.json --out work/shots.json`. Fix what it reports (a beat with no clip, a clip too short, a scene twice in 6 beats) and run it again. Copy the result into the plan's `shots[]`.
   - Look: `node <skills>/skills/gta-footage/gameplay.mjs sheet work/shots.json`, and open every page it prints (`work/gameplay_01.jpg`, `work/gameplay_02.jpg`..., 12 frames each). For each frame: Q1, do its words name something a viewer expects to see right now (a place or building, an object, a person doing something, weather, a body change)? An abstract line (the studio, the research, a quote, a number, a general idea) is a no, and any gameplay fits it. Q2, if yes, is that thing clearly in the picture (generic driving or a random street doesn't count)? Swap the clip when Q1 is yes and Q2 is no. Judge the picture, not the clip's description: it can be wrong. The game HUD and subtitles stay in gameplay shots, and that is fine.
3. **Graphics:** `gta-motion`. Give each graphic a template variant from its catalogue, with the voice's words and the times as `vars`, each template once. A repeat of the same kind of moment, or a moment no template fits, gets a new animation in the project's `animations/`, and the video makes at least the target ([new-animation.md](../gta-motion/new-animation.md)). A chapter about a place in the game (a region, a city, a drive between two of them) can be a map chapter: `gta-map` says when one earns its place and how to fill `mapchapter-A`.
   A still or a short clip inside a graphic comes from a gameplay clip: `@frame gameplay/<clip id> <seconds>` or `@clip gameplay/<clip id> <seconds> <length>` ([plan-format.md](../gta-pacing/plan-format.md)); pick a sharp moment that shows the thing. The game HUD under a graphic is fine.
4. **Check:** run `node <skills>/skills/gta-pacing/check_pacing.mjs plan.json --words work/words.json --channel channel.json --templates <skills>/skills/gta-motion/templates`. Fix every `FAIL` and run it again until it passes.

The plan's format is [plan-format.md](../gta-pacing/plan-format.md).

### 5. Build

```bash
node <skills>/skills/gta-video/build_video.mjs plan.json
```

It checks the plan again, then:
- cuts each gameplay shot (`src` `gameplay/<id>`) from `footage/gameplay/`, full frame with its HUD, scaled 1.5x, without the game's sound ([gta-footage](../gta-footage/SKILL.md), "How a gameplay clip is cut");
- cuts each shot of another game's official video (`src` under `footage/other/`) at 1920×1080, its letterbox off where the shot shows one, and stops on one with no `game` or past the end of its file;
- makes one scene per graphic, with the pfp and channel name from the kit;
- cuts the stills and clips the graphics take from gameplay clips (`@frame gameplay/...`, `@clip gameplay/...`) or another game's video into `assets/media/`;
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
| No `gta_search_clips` tool | The connector isn't added, signed in, or seen by this session: the GTA VI footage needs it. Give the user the SETUP.md steps (free), then a new session. |
| `N problems with other games' shots`, `set its "game"` | A shot from `footage/other/` needs its `game` (and its tag and game switches), and must end before its file does ([gta-footage](../gta-footage/SKILL.md), "Another game's footage"). |
| `official_video: yt-dlp isn't installed` | Install it yourself, no question: `node <skills>/skills/gta-footage/official_video.mjs install`, then run the command again. If the install fails, ask the user for that game's official video file. |
| `the gameplay clip … isn't in footage/gameplay/` | Run `gameplay.mjs fetch work/gameplay_picks.json` from the project folder. For a link that expired, call `gta_get_clip` with that id, put the fresh clip in the picks file, and fetch again. |
| `… is 4.20 s long; from "in" … the shot needs …` | The gameplay shot runs past the end of its clip. Run `gameplay.mjs assign` and `find_shots.mjs pick` again, or continue the beat into the next clip of its scene. |
| `<graphic>: <template> has no vice version` | That variant is clean only. Pick another variant of the animation for this video. |
| `make_scene: … fits 14 at most` | Shorten the text the way the voice would say it, or pick a variant with more room. |
| `transition at …: no cut between two shots there` | A transition sits exactly on a cut: one shot's `end` and the next one's `start` equal its `at`. Move it, or move the cut. |
| `transition at …: the incoming shot is shorter than …` | The shot after a transition must last at least the move (7 to 25 frames). Lengthen it, or use a shorter transition. |
| A GTA VI trailer id in `@frame` / `@clip` | GTA VI stills come from gameplay clips: `@frame gameplay/<clip id> <seconds>`. |
| A shot shows black bars | Add `"bars": <px at 1080p>` to that shot in the plan, then build again. |
| The render is slow or runs out of memory | Close other apps. `render --workers 2` uses less memory. |
| `PLAN_TOO_LARGE` on a render with `--start`/`--end` | Only ranged renders have this 2 GB cap, and a long video (about 10 min or more) passes it. Render the whole video without `--start`/`--end`. |
