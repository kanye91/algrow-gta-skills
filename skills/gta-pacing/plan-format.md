# The edit plan: `plan.json`

The edit plan is the whole video written as data: footage cuts, graphics, transitions and sounds, each with its time in seconds on the voice-over's clock.
- `gta-video` builds the HyperFrames project from it.
- `check_pacing.mjs` checks it against [rules.md](rules.md) before anything is rendered.

Change the plan, not the rendered project. A plan that passes `check_pacing.mjs` is a plan worth building.

## Example

```json
{
  "version": 1,
  "theme": "clean",
  "fps": 30,
  "duration": 61.2,
  "voiceover": "assets/voiceover.wav",
  "words": "work/words.json",
  "channel": "channel.json",
  "chapters": [
    { "title": "Vice City", "start": 0.0 },
    { "title": "The Keys", "start": 34.8 }
  ],
  "shots": [
    { "start": 0.0, "end": 2.4, "src": "assets/footage/trailer2.mp4", "in": 41.2 },
    { "start": 2.4, "end": 5.1, "src": "assets/footage/trailer2.mp4", "in": 88.0 }
  ],
  "graphics": [
    {
      "id": "g01",
      "device": "nametag-A2",
      "layer": "overlay",
      "start": 6.2,
      "end": 9.27,
      "reason": "name",
      "anchor": "Jason",
      "text": ["Jason", "The first lead"],
      "vars": { "name": "Jason", "role": "The first lead", "headX": 1180, "headY": 380, "side": "right" }
    }
  ],
  "transitions": [ { "at": 34.8, "device": "whip-A" } ],
  "sfx": [ { "at": 6.2, "src": "assets/sfx/soft-hit.wav" } ]
}
```

## Fields

| Field | Required | What it is |
|---|---|---|
| `version` | yes | Always `1` for now. |
| `theme` | yes | `clean` or `vice`. One theme for the whole video. |
| `fps` | no | 30 by default. |
| `duration` | yes | Length of the video in seconds (the voice-over's length plus any tail). |
| `voiceover` | yes | The user's voice-over file. |
| `words` | no | Word timings from the transcription (see below). With it, `check_pacing.mjs` checks that every graphic lands on its word. |
| `channel` | no | The channel kit ([gta-video/channel-kit.md](../gta-video/channel-kit.md)). Required as soon as the video has a CTA. |
| `chapters[]` | no | `title` and `start` of each chapter. Transitions may only sit on a chapter start. |
| `shots[]` | yes | The footage cuts: `start`/`end` on the video clock, the `src` file, and `in`, the time inside that file where the shot starts. Shots never overlap. Where no shot plays, a full-screen graphic must cover the screen. A shot from another game sets `game` (`"Grand Theft Auto IV"`, as logos.json names it); empty means GTA VI. Two shots of different games never meet on a hard cut: a game switch plays over that cut (R14). |
| `graphics[]` | no | Everything drawn on top of the footage, or instead of it. |
| `transitions[]` | no | Transitions other than a hard cut: `at` (seconds) and `device` (`whip-A`, `whip-C`, `trans-D`, `trans-E` or `trans-F2`). `at` is exactly a cut: one shot ends there and the next starts there. The builder bakes the move from those two shots. A hard cut is the default and is not listed. |
| `footage` | no | The folder of the official videos, when no shot comes from it but a graphic takes a still or a clip from it (`@frame`, `@clip`). |
| `sfx[]` | no | Sounds other than the voice-over and music: `at`, `src`. |

### A graphic

| Field | Required | What it is |
|---|---|---|
| `id` | yes | Short and unique (`g01`, `g02`…), used in reports. |
| `device` | yes | A template from `gta-motion`: its folder name in `templates/`, which is the variant (`caption5-A`, `listcounter2-D`). Or `new:<name>` for an animation built for this video ([gta-motion/new-animation.md](../gta-motion/new-animation.md)). A list counter or chapter card keeps one variant all video; anything else used again varies (R12). |
| `layer` | yes | `overlay`: drawn over the footage. `fullscreen`: replaces the footage (a map chapter, a card wall, a line-up board, a game board). A full-screen scene counts as **one** graphic, even when it builds several things inside it. `tag`: a game's logo over that game's shots (`gametag`, R13). `transition`: a plate played over one of the shots' own hard cuts, such as a game switch (`gameswitch`, reason `switch`, R14): it starts its `cut` value before the cut (0.4 s; 0.3 s for gameswitch-B) and doesn't count as a graphic for R1, R3, R5 or R8. |
| `start`, `end` | yes | When it is on screen, in seconds. The entry and exit happen inside this window. |
| `reason` | yes | Why it is earned. One of `number`, `name`, `place`, `source`, `correction`, `comparison`, `list`, `date`, `quote`, `theory`, `detail`, `chapter`, `cta`, `keyword`, `switch` (a game switch), `intro` (the video's opening, at 0:00, once). See [what-earns-a-graphic.md](what-earns-a-graphic.md). |
| `anchor` | yes, except for `chapter`, `switch` and `intro` | The word or words in the voice-over that earn the graphic, exactly as the voice says them (`"3,000"`, `"Jason"`, `"according to Bloomberg"`). |
| `text` | no | The lines of text it shows, one string per text element. Used to check reading time and the two-element limit. Count what reads as separate lines: a word swapped into a line (strike-B3's `right`) belongs to that line, and a logo is not text. |
| `enter`, `exit` | no | Entry and exit length in seconds, when the template doesn't declare them. |
| `vars` | no | The values passed to the template. Identity fields (`avatar`, `channel`) come only from the channel kit; see rule R10. A file value can be taken from an official video (below). |
| `ground` | no | Only on a `fullscreen` graphic that doesn't cover the whole frame by itself: the ground scene under it, `ground-A` (sunset gradient), `ground-B` (deep coral), `ground-F` (night rose, darker), `ground-G` (late night, the darkest), `ground-D` (the shot under it, blurred; the recommended one) or `ground-E` (the trailer sky). Not for a template whose `device.json` has its own `ground`. |

### Stills and clips from the official videos

A template's file value (a thumbnail, a still in a card, a clip in a split screen) can name a moment of an official video instead of a file. The builder cuts it to 1920×1080, with the letterbox removed, into `assets/media/`:

| Value | What it makes |
|---|---|
| `@frame VQRLujxTm3c 31.0` | A still of that video (its YouTube id) at 31.0 s |
| `@clip VQRLujxTm3c 31.0 4` | A 4-second clip from 31.0 s, 30 fps, no sound. The length is what is taken from the video: with `\| setpts=3*PTS` after it (slow motion), the clip lasts 12 s |
| `@frame VQRLujxTm3c 31.0 \| scale=640:360:flags=lanczos,eq=saturation=0.45` | The same, then that FFmpeg filter: the grade or size a template's `vars` description gives |

Times are inside the official video, like a shot's `in`. `find_shots.mjs` gives them.

A clip or a shot holds one shot of the video: never a frame of the shot before or after it (owner, 17 Nov 2026: one frame of a beach flashed between the flamingos and the deer). `build_video.mjs` checks every piece it cuts: a few stray frames at an edge are cut again a few frames over (a note says so), and a flash inside a piece stops the build. A transition reads a few frames past its shot's end: when the footage there is already the next shot, those frames hold the shot's last frame instead. Light changes, flicker and fast moves inside a shot are not flashes. Footage is cut from a quarter frame before its in point, so an in point rounded to 0.01 s still starts on the shot's first frame. To join two shots in one clip, join two takes with ` + ` (the cut is then the video's own).

## `words.json`

The transcription of the voice-over, one entry per word, with start and end times in seconds:

```json
[
  { "w": "Leonida", "s": 12.31, "e": 12.80 },
  { "w": "has", "s": 12.80, "e": 12.95 }
]
```

`gta-video` makes it with `npx -y hyperframes@0.9.53 transcribe` (see [SETUP.md](../../SETUP.md)). Its output, `[{"id": "w0", "text": "Leonida", "start": 12.31, "end": 12.80}]`, works as it is: `check_pacing.mjs` reads both shapes. Keep the words as spoken. `check_pacing.mjs` ignores case, punctuation and the commas in numbers when it matches anchors.
