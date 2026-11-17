---
name: gta-footage
description: Picks the official GTA VI trailer and Extended Look shots for each moment of the user's voice-over. Lines that name something (a place, a character, a vehicle, an action) get a shot that shows it; lines that are just talk get calm background footage from the chapter's region. Use when building the footage track of a GTA 6 video, or when the user says "find a clip for this line", "the footage doesn't match", "show the swamp here", "use this shot here". Not for animations or pacing.
compatibility: Node.js 22+, FFmpeg and the official videos (see SETUP.md at the repo root). No packages to install.
metadata:
  author: Algrow
  version: 0.2.0
---

# GTA footage

Every shot in Rockstar's official GTA VI videos is described in [shot-index.json](shot-index.json): 458 shots from 5 videos, each checked by eye for its region, its scene, who is in it and the words on screen. `find_shots.mjs` turns the voice-over into one shot per beat.

## Important

- **Not every line needs a literal match.** A voice-over is half facts, half talk. Show the thing when the voice names it; otherwise use good background footage. A forced match is worse than good background: "he grew up far from all this" must not show a random man.
- **Never show something else.** Background is neutral; it never shows a different concrete thing from the one the words name. A burger cartoon under "exercise builds muscle", or trailer shots under "haptics, 3D audio, loading", read as mistakes (owner, 16 Nov 2026). Before you accept a `show` beat, read its shot's description against the words.
- **Another game named, that game on screen.** When the voice talks about another game ("Red Dead 2 was marketed with over 200", "GTA 5 had 55,000"), show that game: its official footage (the user's own download, like the GTA VI videos: ask for it) and its real logo, never GTA VI footage alone. A passing mention needs nothing.
- The footage is the user's: their own downloads of the official videos. Never download, ship or upload it.
- The marketing end cards (pre-order, PS5/Xbox lines and logos, ESRB/PEGI, legal print, release-date cards, Rockstar's logo card) are not in the index, so pick can never use them. Clean GTA VI logo shots are kept.

## What pick guarantees

- **The right person.** A beat about Jason, Lucia or Raul only gets a shot where that person is confirmed (`who`). A shot marked `unsure_who` (a lead may be in it) never counts as them, and a shot showing a lead is never background.
- **No repeats.** A scene never comes back within 6 picks, and reusing a scene anywhere costs score. A moment comes back only when the library has nothing unused that long left, and the report says so.
- **Background stays in its region.** The order is the beat's `place`, then shots only guessed to be there (`place_guess`), then the neighbouring regions. The report notes every time it leaves the place.
- **No game HUD under a graphic.** With `--plan plan.json`, a beat under an overlay graphic never gets a shot whose HUD (`hud`: minimap, prompts, stars...) sits in a corner the graphic covers, and the footage the plan already uses elsewhere is kept out.
- **Never:**
  - a shot with an old release date on screen (`dated`);
  - words on screen unless the query asks for them;
  - a violent shot in the first 7.5 s or as background;
  - a graphic one unless you name it.

## Steps

### 1. Cut the voice-over into beats

A beat is one shot. Take the cut points from the plan (`gta-pacing`), which are always between words. A beat is 3 to 4 s long, never under 2.5 s after the hook; only the hook cuts faster (`check_pacing` fails a video whose shots after the hook average under 3 s). Many trailer shots are 1 to 3 s long, but 111 shots run 4 s or more (151 run 3 s or more) (the Extended Look videos and long trailer takes): lean on them, and when nothing that long shows a `show` beat, make it a background beat on a long take rather than splitting it. The regions outside Vice City have few long shots: name their longest ones (`search ... --place <region> --need 2.5`) and let a long Vice City background take carry the rest.

### 2. Decide what each beat is

Read the words spoken during the beat.

| The words... | Type | Query |
|---|---|---|
| name a place: "Vice City", "the Keys", "the swamps" | `show` | the place and what's in it: `swamp airboat sawgrass` |
| name a character: "Jason", "Lucia" | `show` | their name, plus `"who": ["jason"]` |
| name a thing or an action: a car, a boat, a heist, the beach, a party | `show` | the concrete nouns you'd see: `beach crowd umbrellas` |
| talk about another game: "Red Dead 2", "GTA 5" | that game | not in the index: ask the user for that game's official video, and give the beat a shot of that file (`src`, `in`) showing what the words say (its animals, its map). Without it: background, plus the game's logo on screen (`gta-motion`) |
| are opinion, setup, a joke, a transition: "honestly", "here's the thing" | `broll` | optional mood words: `sunset calm`, `night neon` |
| describe something no shot shows (a feeling, a statistic, the past) | `broll` | mood words, or a graphic if `gta-pacing` gives one |

**Query words are what would be on screen**, never the words of the line. Write "palm trees beach sunset", not "the vibe is incredible". Add `night` or `sunny` when the time of day matters.

**Give every beat its chapter's `place`**, `show` beats too. A `show` beat with nothing to show falls back to background, and without a place that background can come from anywhere.

Places: `vice_city`, `leonida_keys`, `grassrivers`, `port_gellhorn`, `ambrosia`, `mount_kalaga`. A shot whose region can't be told from its frame has `place: null`, with a `place_guess` when something points to one. Pick uses guessed shots after the sure ones.

**To use a shot you chose**, add `"shot": "<id>"` (from `search` or the index). Add `"in": <seconds>` to start at a given point. `in` counts from the start of the source video, like `in` in shots.json, and must fall inside the shot's `a` to `b`. Pick takes a named shot as given if it is long enough. Otherwise it says why, picks another one and adds the beat to the `CHECK` line.

### 3. Write beats.json

```json
[{"start": 0.0, "end": 2.8, "type": "show", "query": "vice city skyline aerial", "place": "vice_city"},
 {"start": 2.8, "end": 5.6, "type": "broll", "query": "", "place": "vice_city"},
 {"start": 5.6, "end": 8.4, "type": "show", "query": "jason lucia", "who": ["jason", "lucia"], "place": "vice_city"},
 {"start": 8.4, "end": 9.5, "type": "show", "shot": "t1-014", "place": "grassrivers"}]
```

### 4. Pick

```bash
node <skills>/skills/gta-footage/find_shots.mjs pick beats.json --footage path/to/official-videos --plan plan.json --out shots.json
```

With the Algrow footage library (`library.json` at the repo root, SETUP.md), leave out `--footage`: each `src` stays the YouTube id, and `build_video.mjs` fetches the shot already cut.

Each line of the report gives the beat, its time, `named`/`show`/`broll`, the shot, its scene and score, the shot's description, and notes in brackets. The summary at the end gives:

- the counts;
- how many different scenes were used;
- how many `show` beats got background, and how many background shots left their place;
- a `CHECK` line listing the beats to fix.

Fix the `CHECK` beats, run pick again, then put `shots.json` into the plan's `shots[]`. Pick exits with 1 only if a beat got no shot at all.

| Note | Meaning | Do |
|---|---|---|
| `no real match, background instead` | nothing really shows this `show` beat | Usually fine. Reword the query, or name a shot. |
| `no confirmed shot of lucia ... background instead` | every confirmed shot of her is used or too short | Shorten the beat, or name a shot of her. |
| `background from a neighbouring region of grassrivers ...: split the beat to stay there` | nothing in the place is that long | Name a long shot of the place (`search ... --place <place> --need 3`), or accept the neighbouring region. Split only down to 2.5 s. |
| `no place given: background from anywhere` | the beat has no `place` | Add the chapter's place. |
| `game HUD on screen` / `a shot not marked as good background` | the clean background ran out | Fine once or twice. Many: shorten the video's background beats. |
| `LAST RESORT ...` | any calm shot, not real background | Split, merge or name. |
| `REPEATS the moment of ...` | the library has no unused footage that long left | Use another moment of a long take (`in`), or split, never under 2.5 s. |
| `named shot not used: ...` | the named shot is too short or `in` is wrong | The note gives the latest valid `in`. |
| `scene ... also at beat N` | the scene comes back further away | Information only. |

To look at the options for one beat yourself:

```bash
node <skills>/skills/gta-footage/find_shots.mjs search "swamp airboat" --place grassrivers --need 1.5
node <skills>/skills/gta-footage/find_shots.mjs search "lucia car" --who lucia --need 2
node <skills>/skills/gta-footage/find_shots.mjs search "night" --broll --place vice_city --need 2.5
```

Add `--json` for the full index entries.

## Troubleshooting

| Problem | Fix |
|---|---|
| `no shot is 4.0 s long` / `no match is 3 s long` | Make it a background beat on a long take, or merge it with its neighbour. Split only down to 2.5 s. |
| A region chapter (Keys, Grass Rivers, Ambrosia...) cuts to Vice City | Its shots are short: name its longest shots from `search ... --place <region> --need 2.5`, and let a long Vice City background take carry the rest. |
| A line about a lead shows background | Every confirmed shot of them that fits is used. Shorten the beat, or name a shot. Never name an `unsure_who` shot for them. |
| The same scene keeps coming back | Write a more specific query, or turn some beats into `broll`. |
| `named shot X is not in the index` | It was a marketing card or unusable footage, and it was removed. Pick another one with `search`. |
| `unknown place` | Use one of the six places above. |
| `Missing footage` | The user needs that official video in the footage folder, with the YouTube id in the file name. The report lists the title. |
| The shot has black bars | `gta-video`'s `build_video.mjs` crops each official video's letterbox (Trailer 2, Launch Trailer) when it cuts the shot. For a shot it misses, add `"bars": <px at 1080p>` to that shot in the plan. |
