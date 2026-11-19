---
name: gta-footage
description: Picks the footage for each moment of the user's voice-over - real GTA VI gameplay clips from the Algrow GTA library (the algrow-gta connector, free) for every GTA VI line, and another game's own official videos (downloaded from its publisher's YouTube channel with yt-dlp) when the voice talks about that game. Lines that name something (a place, a character, a vehicle, an action) get a clip that shows it; lines that are just talk get calm gameplay. Use when building the footage track of a GTA 6 video, or when the user says "find a clip for this line", "the footage doesn't match", "show the swamp here", "use gameplay here", "show Red Dead 2 here". Not for animations or pacing.
compatibility: Node.js 22+, FFmpeg, the algrow-gta connector (free, signed in with an Algrow account), and optionally yt-dlp for other games' official videos (see SETUP.md at the repo root). No packages to install.
metadata:
  author: Algrow
  version: 0.3.0
---

# GTA footage

Two sources:
- **GTA VI: gameplay clips** from the Algrow GTA library, through the `algrow-gta` connector (free, signed in with an Algrow account): real GTA VI play, about 3 to 10 s a clip, described one by one (the library's cutscene clips are never used). **Every GTA VI beat gets one** ([Gameplay library](#gameplay-library-algrow-gta-connector)). It is the only source of GTA VI footage: never download or ask for GTA VI videos. Rockstar's official trailers are coming to the connector; until then the trailer index in this folder ([shot-index.json](shot-index.json), `find_shots.mjs search`) is not used.
- **Another game's official videos** (RDR2, GTA 5, GTA IV...), downloaded from its publisher's own YouTube channel with `official_video.mjs`, for the lines about that game ([Another game's footage](#another-games-footage-official-channels)).

`find_shots.mjs` turns the beats into one shot per beat: each beat plays its gameplay clip (`clip`) or its other game's shot (`src`).

## Important

- **Not every line needs a literal match.** A voice-over is half facts, half talk. Show the thing when the voice names it; otherwise use calm gameplay. A forced match is worse than good background: "he grew up far from all this" must not show a random man.
- **Never show something else.** Background is neutral; it never shows a different concrete thing from the one the words name. A burger cartoon under "exercise builds muscle", or trailer shots under "haptics, 3D audio, loading", read as mistakes (owner, 16 Nov 2026). Before you accept a `show` beat, read its shot's description against the words.
- **Another game named, that game on screen.** When the voice talks about another game ("Red Dead 2 was marketed with over 200", "GTA 5 had 55,000"), show that game: its official footage, found and downloaded from the publisher's own YouTube channel ([Another game's footage](#another-games-footage-official-channels)), and its real logo, never GTA VI footage alone. A passing mention needs nothing.
- **GTA VI footage comes only from the connector.** Other games' official videos come only from their publisher's own channel ([official-channels.json](official-channels.json)), downloaded on the user's computer with yt-dlp into the project's `footage/other/`. Never a fan upload, a re-upload or a compilation, and never another way around a refusal. Never ship, commit, upload or share them, or a frame of them. Gameplay clips come from the Algrow GTA library with the user's own sign-in, into the project's `footage/gameplay/`: never commit, share or upload them either.
- **No violence in the first 7.5 s**, and never a mission's name on screen.

## Gameplay library (Algrow GTA connector)

The connector's tools are there when `gta_search_clips` is one of your tools. Every GTA VI beat gets a gameplay clip:

| The line is about... | Footage |
|---|---|
| playing the game: driving, boats, planes, swimming, the police, shootouts, Jason or Lucia, a place | a gameplay clip that shows it |
| talk, with no thing named (the studio, the research, a quote, a number) | calm gameplay carries it: a drive, a boat ride, scenery (`mood: "calm"`), in the chapter's region |
| the trailers, what Rockstar showed | gameplay of the same thing (the trailers themselves come to the connector later) |

**Without the connector there is no GTA VI footage**, so don't start the edit: tell the user it's free and how to add it (SETUP.md, "The footage: the Algrow GTA connector"), and that a new session sees it.

### The flow

1. **Write the beats** (step 1 below) and read each beat's line.
2. **Match.** Call `gta_match_script` with `clip_type: "gameplay"` and the lines of every GTA VI beat, one line per beat, in order (up to 60 lines a call; a long video takes several calls). Pass `region` or `player` when the chapter fixes them. It returns a clip for every line, from different scenes while it can.
3. **Read every pick** against the beat's words: its `description`, `player`, `region`, `time_of_day`, `vehicle` and `wanted` ("Never show something else", above). Swap a weak one with `gta_search_clips` with `clip_type: "gameplay"` and filters (`time_of_day: "night"`, `wanted: true`, `vehicle: "boat"`, `player: "lucia"`, `region`), or `gta_similar_clips(clip_id)` (the same look; skip any cutscene it returns). `gta_list_filters` lists the values.
4. **Write `work/gameplay_picks.json`**: the clips as the connector returned them, each with the beat it is for: `"beat": <index>` (from 0, as the pick report counts) or `"line"` (the beat's words).
5. **Assign and fetch, right away** (the links expire after a few hours):

   ```bash
   node <skills>/skills/gta-footage/gameplay.mjs assign work/beats.json work/gameplay_picks.json --out work/beats.json
   node <skills>/skills/gta-footage/gameplay.mjs fetch work/gameplay_picks.json
   ```

   `assign` puts `"clip"`, `"scene"` and `"in"` (seconds into the clip) on each beat, so the beat plays the middle of its clip. `fetch` downloads each clip to `footage/gameplay/<id>.mp4` and its description to `<id>.json` (no links kept), and skips the clips already there.
6. **Pick** (step 4 below): gameplay beats pass through as `{"src": "gameplay/<id>", "in": ...}`, other games' beats as their `src`. A beat with neither is reported: give it a clip.
7. **Look.** `node <skills>/skills/gta-footage/gameplay.mjs sheet work/shots.json` writes pages of 12 frames, `work/gameplay_01.jpg`, `work/gameplay_02.jpg`..., and prints their paths: one frame per gameplay shot, from the middle of the piece it plays, framed as in the video, labelled with its time, its words and the clip's description. Open every page. For each frame, ask two questions:
   - **Q1.** Do its words name something a viewer expects to see right now: a place or building, an object, a person doing something, weather, a body change? An abstract line (about the studio, the research, a quote, a number, a general idea) is a no, and any gameplay fits it.
   - **Q2.** If yes, is that thing clearly in the picture? Generic driving or a random street doesn't count.

   Swap the clip when Q1 is yes and Q2 is no (3), then run 4 to 7 again. Judge the picture, not the clip's description: the description can be wrong.

### Rules

- **The right person.** A beat about Jason or Lucia gets a clip whose `player` is that person (`both` works for either). `assign` flags a clip that plays someone else.
- **Never a cutscene clip** (owner, 19 Nov 2026), in any video. Every `gta_match_script` and `gta_search_clips` call passes `clip_type: "gameplay"`. `assign`, `fetch`, pick and the build all refuse a clip whose `clip_type` is `cutscene`, naming it: swap it for a gameplay clip.
- **No mission names.** Never a mission's name (`mission`) on screen, in a graphic or in a line you write.
- **The HUD and subtitles are fine** (owner, 19 Nov 2026). A gameplay clip plays its full frame: minimap, wanted stars, health bars, the game's subtitles and prompts all stay. Don't skip a clip for its HUD, and don't move a graphic off one.
- **No repeats.** The same scene never within 6 beats (pick flags it: swap one), and the same moment of a clip never twice.
- **Fetch right after picking, and keep the ids.** `fetch` exits 2 with the ids whose link expired: call `gta_get_clip` for each, put the fresh clip in the picks file, and fetch again. The `clip` ids stay in beats.json and in the plan, so a rebuild on another computer refetches the same clips.

**A beat longer than its clip** (some clips are only 3 s): `assign` leaves it without a clip and says so. Split the beat (2.5 s at least) and give the new beat its own clip, or continue it: `gta_get_scene(scene)` lists the scene's clips in order; add the next one (`scene_pos` + 1) to the picks with the same `beat`, and assign again. The two clips then play as one shot (`"clip": ["gta-001012", "gta-001013"]`), on the scene's own cut.

### How a gameplay clip is cut

`build_video.mjs` cuts every gameplay clip full frame, HUD and subtitles included, scaled from 1280x720 to 1920x1080 (1.5x, lanczos) at 30 fps, without the game's sound. The clips are 720p (about 1 to 6.5 Mbit/s): fine as footage. A graphic that shows a still or a short clip takes it from a gameplay clip too (`@frame gameplay/<id> <seconds>`, `@clip gameplay/<id> <seconds> <length>`, plan-format.md): pick a sharp moment, not one in motion blur.

**Black bars.** About 1 clip in 7 plays in a cinematic camera, with black bars baked in (40 px top and bottom at 720p). `fetch` measures them into the clip's `<id>.json` (`bars`), and the build cuts them off so the picture fills the frame. A shot can set its own `"bars"` (px at 1080p; `0` keeps them).

**Opt-in crop**, only when a beat asks for one: `"crop": "auto"` picks it from the clip's description, or name one. Pick copies `crop` into the shot. Measured on the library's 720p clips (19 Nov 2026):

| `"crop"` | `auto` picks it when | Keeps | Removes | Zoom |
|---|---|---|---|---|
| `"hud"` | neither below | x 9.75-90.25 %, y 0-80.5 % (centred, from the top) | the minimap, subtitles, mission text, prompts | 1.24 |
| `"wanted"` | `wanted: true` | x 10.7-86.7 %, y 0-76 % | also the six star slots, their icons and the stamina bar | 1.32 |
| `"combat"` | `gun: true` | x 13.5-86.5 %, y 7.5-80.5 % | also the health bars, the ammo count, the weapon and the money | 1.37 |

A crop zooms in and softens the picture more (1.86 to 2.06x), and it can't hide a menu, the weapon wheel, a tutorial box or a title card.

## Another game's footage (official channels)

When the voice talks about another game (not a passing mention), that game is on screen: its own official footage, from its publisher's YouTube channel. [official_video.mjs](official_video.mjs) finds it, downloads it with yt-dlp (SETUP.md, "Other games' official videos") and lays its frames out to pick from. Only the channels in [official-channels.json](official-channels.json) are used: Rockstar Games (`@RockstarGames`) for the 20 Rockstar games listed there (`official_video.mjs games`). Run it from the project folder.

1. **Find** the game's official videos:

   ```bash
   node <skills>/skills/gta-footage/official_video.mjs find "Red Dead Redemption 2" [--query "horse camp"]
   ```

   It lists the id, length, year and title of each, from its official channel only (Shorts, live streams and other games' videos left out). `--query` adds words to the search ("gameplay", "hunting", "Saint Denis").
2. **Get** one or two that fit the lines: a trailer for the look and the world, an "Official Gameplay Video" for lines about playing it, short ones first.

   ```bash
   node <skills>/skills/gta-footage/official_video.mjs get HVRzx17WHVk --game "Red Dead Redemption 2"
   ```

   It downloads to `footage/other/<game>/<id>.mp4` (the best picture up to 1080p, no sound: the build mutes footage) with `<id>.json` (title, channel, link, date, game, letterbox), and keeps the files already there. It refuses a video from any other channel, and one YouTube shows only to signed-in users (an age check: these skills never sign in). Then tell the user in one line what was downloaded: "Downloaded Red Dead Redemption 2 Launch Trailer (Rockstar Games, 1:00, 17 MB) into footage/other/rdr2/ for the RDR2 part."
3. **Look** at its shots:

   ```bash
   node <skills>/skills/gta-footage/official_video.mjs sheet footage/other/rdr2/HVRzx17WHVk.mp4
   ```

   It finds the cuts (and the fades through black) and writes `work/sheets/<id>/page-01.jpg`...: 12 frames a page in 3 columns, each labelled with its time in the file and its shot's span ("shot 15.52 - 19.79 s (4.3 s)"). Open the pages. For a long video, look at a part (`--from 120 --to 240`); `--every 3` puts more frames in the long shots.
4. **Pick**, for each beat about that game, a shot that shows what its words say (its horse under "you bond with your horse", its city under "Saint Denis"), long enough for the beat. `in` sits inside that shot, so that `in` plus the beat's length ends before the shot does. Write it on the beat:

   ```json
   {"start": 41.2, "end": 44.6, "type": "show", "src": "footage/other/rdr2/HVRzx17WHVk.mp4", "in": 15.8, "game": "Red Dead Redemption 2"}
   ```

   Pick passes it through as that shot (`game` comes from the file's `<id>.json` when you leave it out), and flags a beat past the end of the file or the same moment twice. A shot written straight into the plan's `shots[]` takes the same fields.
5. **Label it**: that game's shots wear its tag, and a game switch plays where the footage changes game, both ways (`gta-pacing` R13 and R14).

**Rules**
- **The publisher's own channel only.** `get` refuses any other upload, even an official-looking one (PlayStation's copy of a Rockstar trailer, a regional channel). Never get around a refusal: no other channel, no re-upload, no sign-in or cookies.
- **Never an end card**: the game's logo card, a date, "pre-order now", the platforms, the age rating, the publisher's logo. They are on the sheet: skip them.
- **No words on screen** unless the line names them, as for the GTA VI shots.
- **A game that isn't listed** (`find` says so): for a publisher's game, read its channel's real id with `official_video.mjs channel @TheirHandle`, add the channel and the game to official-channels.json (only the publisher's own channel), then find again. Otherwise, ask the user for the file.
- The downloads stay in the project's `footage/`, on the user's computer: never commit, upload or share them.

**Without it.** `official_video.mjs` exits 3 when yt-dlp isn't installed, and 1 when a video is refused or YouTube won't give it. Then ask the user for that game's official video file, put it in `footage/other/<game>/` and give the beats `src`, `in` and `game` the same way (`sheet` works on any video file). Without a file either: calm gameplay, plus the game's logo on screen (`gta-motion`). Suggest yt-dlp once, as an optional install (SETUP.md); install it only after the user says yes.

**How it is cut.** `build_video.mjs` cuts these shots at 1920x1080, 30 fps, x264 CRF 16, without sound. A letterbox measured at download (`bars` in `<id>.json`, px at 1080p) is cut off wherever the piece shows it; a shot's own `"bars"` wins. The build stops on a shot of another game with no `game` (it would pass as GTA VI footage), or one that runs past the end of its file.

## Steps

### 1. Cut the voice-over into beats

A beat is one shot. Take the cut points from the plan (`gta-pacing`), which are always between words. A beat is 3 to 4 s long, never under 2.5 s after the hook; only the hook cuts faster (`check_pacing` fails a video whose shots after the hook average under 3 s). Gameplay clips run about 3 to 10 s; a beat longer than its clip continues into the next clip of its scene (below).

**Draft the beats from the words** instead of by hand: `node <skills>/skills/gta-footage/find_shots.mjs beats work/words.json --duration <voice-over seconds> --out work/beats.json`. It cuts in the gaps between words, about 2.4 s apart in the hook and 3.4 s after it, ending on a full stop or a pause when one is close, and writes each beat's words in `line`. Then read each line and set its `type` and `place` (step 2). Merge or split a beat where the meaning asks for it.

### 2. Decide what each beat is

Read the words spoken during the beat.

| The words... | Type | The clip |
|---|---|---|
| name a place: "Vice City", "the Keys", "the swamps" | `show` | that place (`region`), what's in it: the swamp, an airboat |
| name a character: "Jason", "Lucia" | `show` | that person playing (`player`), plus `"who": ["jason"]` |
| name a thing or an action: a car, a boat, a heist, the beach, a party | `show` | a clip where you see it |
| talk about another game: "Red Dead 2", "GTA 5" | that game | its official video, downloaded from the publisher's channel, and a shot of it that shows what the words say (its animals, its map): the beat gets `src`, `in` and `game` ([Another game's footage](#another-games-footage-official-channels)). Without yt-dlp: ask the user for that file. Without it either: calm gameplay, plus the game's logo on screen (`gta-motion`) |
| are opinion, setup, a joke, a transition: "honestly", "here's the thing" | `broll` | calm gameplay (`mood: "calm"`) |
| describe something no clip shows (a feeling, a statistic, the past) | `broll` | calm gameplay, or a graphic if `gta-pacing` gives one |

The type and the line tell you what clip to ask the connector for (the Gameplay library flow above): a `show` beat needs a clip that shows its thing; a `broll` beat takes calm gameplay.

**Give every beat its chapter's `place`**, and pass it to the connector as `region` when the chapter fixes one. **Talk with no in-game place** (consoles, PC, the price, a date, the studio): calm, wide scenery (a beach at sunset, the skyline at night, a bridge, a marina, the swamp), so the video stays in Leonida while the voice talks about hardware.

Places: `vice_city`, `leonida_keys`, `grassrivers`, `port_gellhorn`, `ambrosia`, `mount_kalaga`.

### 3. Write beats.json

```json
[{"start": 0.0, "end": 2.8, "type": "show", "line": "Vice City is huge", "place": "vice_city"},
 {"start": 2.8, "end": 5.6, "type": "broll", "line": "and honestly,", "place": "vice_city"},
 {"start": 5.6, "end": 8.4, "type": "show", "line": "Jason and Lucia", "who": ["jason", "lucia"], "place": "vice_city"}]
```

`gameplay.mjs assign` then adds each beat's `clip`, `scene` and `in` (the Gameplay library flow above).

### 4. Pick

```bash
node <skills>/skills/gta-footage/find_shots.mjs pick work/beats.json --plan plan.json --out work/shots.json
```

Every beat carries its gameplay clip or its other game's shot, so pick passes them through as shots, checks each fits its clip or file, and flags a scene that comes back within 6 beats. Fix what it reports, run it again, then put `shots.json` into the plan's `shots[]`. Pick exits with 1 if a beat got no shot: give that beat a clip.

## Troubleshooting

| Problem | Fix |
|---|---|
| The same scene keeps coming back | Swap one clip (`gta_similar_clips`, or `gta_search_clips` with other filters), then assign again. |
| `unknown place` | Use one of the six places above. |
| `gameplay clip not used: ... is 4.20 s; from "in" ...` | The beat runs past the end of its clip. Run `gameplay.mjs assign` again (it centres the beat), continue the beat into the next clip of its scene, or split it. |
| `not fetched yet` (pick), `the gameplay clip ... isn't in footage/gameplay/` (build) | Run `gameplay.mjs fetch work/gameplay_picks.json`. An expired link: `gta_get_clip` for that id, then fetch again. |
| `scene ... is also on beat N` | Two gameplay beats close together come from one scene. Swap one (`gta_similar_clips`), then assign again. |
| `REFUSED: ... is a cutscene clip` | Cutscenes are never used. Swap it for a gameplay clip (`gta_search_clips` with `clip_type: "gameplay"`), then assign and fetch again. |
| No `gta_search_clips` tool | The connector isn't added or signed in, or this session started before it was added. It is the GTA VI footage, so the video can't be made without it: tell the user it's free and how to add it (SETUP.md), then to start a new session. |
| `official_video: yt-dlp isn't installed` (exit 3) | Ask the user for that game's official video file ("Another game's footage", Without it), and suggest yt-dlp once (SETUP.md). |
| `REFUSED: ... not an official channel in official-channels.json` | It is someone else's upload. `find` the game on its official channel and get one of those. |
| `YouTube shows this video only to signed-in users (an age check)` | Pick another of its videos, or ask the user for their copy. Never sign in or pass cookies. |
| `other game's footage not used: ... from "in" ...` (pick), `... s long; from "in" ... the shot needs ...` (build) | The beat runs past the end of the file: take an earlier `in` inside the shot (the sheet gives its span), or shorten the beat. |
| `... plays Red Dead Redemption 2 footage ...: set its "game"` | Add `"game"` to that shot, as the message names it, with its tag (R13) and its game switches (R14). |
| `official_video: GTA 6 footage comes from the Algrow GTA connector` | GTA VI videos are never downloaded: use the connector's gameplay clips. |
| The shot has black bars | `build_video.mjs` crops the bars it measured in a gameplay clip or another game's video. For a shot it misses, add `"bars": <px at 1080p>` to that shot in the plan. |
