---
name: gta-pacing
description: Plans and checks the rhythm of a GTA 6 YouTube edit built on the user's own voice-over. It decides where footage cuts land, which few moments earn a graphic, and how long each one holds, then runs check_pacing.mjs on the edit plan. Use when building or reviewing a plan.json for a GTA video, or when the user says an edit feels busy, flashy, cluttered, too slow, or asks about pacing, rhythm, how often to show graphics or animations, or cut timing. Not for writing scripts or voice-overs.
compatibility: Node.js 22+, FFmpeg and the official videos (see SETUP.md at the repo root). No packages to install. Used by gta-video; works on any plan.json that follows plan-format.md.
metadata:
  author: Algrow
  version: 0.1.0
---

# GTA pacing

The footage carries the video and cuts on the voice. A graphic appears only when the voice says something the viewer needs to *see*. It lands fast and holds still, then the footage breathes again. **Cutting fast is not the same as animating often.**

## Important

- The voice-over is the user's. Never rewrite it, cut words from it, or move it. The edit follows the voice.
- Every graphic needs a `reason` and an `anchor`: the words in the voice that earn it. No anchor means no graphic.
- Run `check_pacing.mjs` after every change to the plan. Never build or render a plan that fails it.

## Steps

### 1. Read the voice-over

You need the word timings, `words.json`, which `gta-video` makes with `npx -y hyperframes@0.9.53 transcribe` ([gta-video/inputs.md](../gta-video/inputs.md)). Read the whole transcript once before placing anything. Note the chapters: the points where the topic changes.

### 2. Cut the footage on the voice

- Plan footage shots of 3 to 4 s on average (2.5 s minimum), faster only in the first 30 s (the hook).
- Plan the hook's graphics first (R15): open on a designed moment by 2 s (the intro when it fits, or a graphic on the first line), then at least one more graphic in the first 30 s, 5 s after it (2 in all; more only when the lines earn them).
- Cut at the end of a phrase or on the first word of the next one, never inside a word.
- Pick each shot for what the voice says at that moment (`gta-footage`).

### 3. Mark the moments that earn a graphic

Go through the transcript and mark every candidate with its `reason`, using [what-earns-a-graphic.md](what-earns-a-graphic.md): a number that is the point of the sentence, a source, a correction, a place, a name the first time it is said, a chapter start, a call to action.

### 4. Keep only the few that fit

Apply [rules.md](rules.md):
- one graphic at a time;
- 10 s of clean footage between graphics (5 s in the hook);
- an entry of 0.5 s or less, then hold still;
- two text elements at most;
- hard cuts, except a transition on a chapter start;
- no sound on cuts;
- variety, except in a series: a list counter or a chapter card keeps the variant of its first use for the whole video; any other animation used again takes another variant, or another animation that says the same thing (R12).

When several facts arrive close together, make one full-screen scene instead of several overlays.

If the voice-over has a call to action, ask the channel-kit questions first ([gta-video/channel-kit.md](../gta-video/channel-kit.md)). With no pfp, the CTA plays with no avatar circle at all.

### 5. Write the plan

Write `plan.json` in the format described in [plan-format.md](plan-format.md).

### 6. Check it

```bash
node <skills>/skills/gta-pacing/check_pacing.mjs plan.json
```

Run it from the project folder (`<skills>` is the folder of this repo). It reads each animation's `device.json` from this repo's `gta-motion/templates` (entry and exit times, series, other variants); `--templates DIR` points it at another folder. Add `--json` for a machine-readable report.

- Each `FAIL` line gives the time, the rule and the fix. Fix it in the plan and run the check again.
- `WARN` lines are judgement calls. Read them, decide, and tell the user if you keep one.
- The last lines show the screen-time split: plain footage, overlays and full-screen. In most videos, keep plain footage at 35 % or more.

When it says `Result: PASS`, hand the plan to `gta-video` to build.

## Example

The voice says: *"GTA 6 has over 3,000 NPC routines… According to Bloomberg, the team doubled the size of the world twice."*

- "3,000" earns a `number` graphic: a big number, landing on the word, on screen for 3 s.
- "Bloomberg" earns a `source` graphic: a sourced claim, but only if it starts 10 s or more after the number graphic ends. If it's closer, keep the stronger of the two, or merge both into one full-screen scene.
- "NPC routines" and "world" earn nothing. The footage shows them.

## Troubleshooting

| You see | Cause | Fix |
|---|---|---|
| `R3 … needs 10 s of clean footage` | Two graphics too close together | Move the second one later, drop the weaker one, or merge them into one full-screen scene. |
| `R2 … lands at X but the voice says … at Y` | The graphic is not on its word | Move `start` to within 0.3 s before to 0.6 s after the word. |
| `R2 … anchor is not in the transcript` | The word was spelled differently (e.g. "three thousand") | Check by ear. Set `anchor` to the words as transcribed. |
| `R10 … needs the channel kit` | A CTA, but no `channel.json` | Ask the user the channel-kit questions, then save the answers. |
| `R12 … A series looks the same` | Two styles of list counter (or chapter card) in one video | Use the variant of its first use everywhere in this video. |
| `R12 … Vary it` | The same variant twice in a row | Use another variant, or another animation that says the same thing. |
| `R9 … nothing on screen from X to Y` | A gap between shots | Extend a shot, or cover the gap with a full-screen scene. |
| Many `R9 … inside the word` warnings | The cuts are on a fixed grid | Snap each cut to the nearest gap between words in `words.json`. |

Why these numbers: [why-these-numbers.md](why-these-numbers.md).
