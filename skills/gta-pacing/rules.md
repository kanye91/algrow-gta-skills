# Pacing rules

Premium TV never shows ten things on screen at once, and neither do we. The footage carries the video and cuts on the voice. A graphic appears only when the voice says something the viewer needs to *see*. It lands fast and holds still, and then the footage breathes again.

**Cutting on the voice is not the same as cutting fast.** The footage changes every 3 to 4 seconds. Graphics come one at a time, about every 14 to 18 seconds, each on words that earn it. Only the hook cuts faster.

Every rule below is checked by `check_pacing.mjs`, in this folder. The numbers are the defaults; they live in the `RULES` table at the top of the script, so keep both in sync.

| # | Rule | Default | Level |
|---|---|---|---|
| R1 | **One thing at a time.** Footage plus one graphic at most. Two graphics never share the screen. | – | fail |
| R2 | **Earned.** Every graphic has a `reason` and an `anchor`, the words in the voice that earn it. It lands on those words. | from 0.3 s before the word to 0.6 s after | fail |
| R3 | **Breathing room.** Clean footage between two graphics. | 10 s; 5 s inside the hook (the first 30 s) | fail |
| R4 | **Land fast, hold still.** Entry is short, exit shorter. Once landed, nothing moves except a slow push on the footage. | entry 0.5 s or less; exit 0.3 s or less | fail |
| R5 | **Readable, then gone.** A graphic stays long enough to be read: at least 2 s, plus about 0.3 s per word. It shows two text elements at most. An overlay doesn't linger on footage. | at least 2 s (a template validated shorter, like a 1 s list counter, keeps its own length); 2 text elements; an overlay 8 s at most; a line that changes (a struck claim) is read first: 0.5 s + 0.3 s a word, 2 s for the video's last line | fail / warn |
| R6 | **Hard cuts by default.** A transition only on a chapter start, and never the same one twice in a row. | within 0.5 s of a chapter start | fail |
| R7 | **No sound on cuts.** A sound effect only where a graphic lands or a transition plays. | within 0.1 s | fail |
| R8 | **The footage carries the video, the graphics keep it rich.** About half to two thirds of the video is footage with nothing on it, and graphics keep coming. | plain footage 50 to 65 % (over 65 % fails in a video of 60 s or more, under 35 % warns); after the hook, one graphic every 18 s or closer on average (checked when 36 s or more follow the hook) | fail / warn |
| R9 | **Cuts follow the voice.** Shots are long enough to register, never black, and cut between words, not inside one. | 3 to 4 s per shot on average after the hook (under 3 s fails); 2.5 s or more per shot (warn); up to 8 s; 0.6 s inside the hook | fail / warn |
| R10 | **Never invent identity.** A pfp, channel name or logo appears only if the user gave it (the channel kit). No placeholder, no initials. | – | fail |
| R11 | **One theme.** `clean` or `vice` for the whole video. | – | fail |
| R13 | **Another game wears its logo.** A shot from another game (`game` set on the shot) has a game tag over it, and a tag (layer `tag`) sits only on that game's shots and on no graphic. A tag is a label on the footage, not a graphic: R1, R3 and R8 don't count it. | tag over at least 1 s of each such shot | fail |
| R14 | **A change of game is never a hard cut.** Where a shot of one game meets a shot of another (`game` differs; empty = GTA VI), a game switch (`gameswitch`, layer `transition`) plays over that cut, on the way in and on the way back to GTA VI, the same variant both times. A full-screen scene over the cut also bridges it. | – | fail |
| R15 | **Open strong.** The video opens on a designed moment, never on plain footage, and the hook keeps showing things. | the first graphic lands by 2 s (an intro at 0:00, or a graphic on the first line); 3 graphics or more start in the first 30 s (videos of 60 s or more); no intro while the first line names the game warns | fail / warn |
| R12 | **Series stay the same, the rest varies.** A series (list counters, chapter cards: `"series": true` in device.json) keeps one variant for the whole video: a top 10 that opens on `listcounter2-D` uses it for all ten. Any other animation used again takes another variant. | – | fail |

## What each rule means in practice

**R1, one thing at a time.**
- A full-screen scene, such as a map chapter, a card wall or a line-up board, counts as one graphic, even when it builds several pins or cards inside it.
- What is forbidden is a second device on top: a name tag over a stat bar, a keyword over a sourced claim.

**R2, earned.**
- If the voice doesn't say it, the screen doesn't show it.
- A name gets a tag the first time it is said, never again.
- A number gets a graphic when it is the point of the sentence, not every time a figure is mentioned.
- See [what-earns-a-graphic.md](what-earns-a-graphic.md) for what earns what.

**R3, breathing room.**
- Ten seconds is long on purpose. When several facts arrive close together, don't sprinkle overlays: group them into one full-screen scene, or keep only the strongest one.
- The hook may be denser (5 s), because it has to grab attention.

**R4, land fast, hold still.**
- In: a fade and a short rise over 10 to 14 frames, ease-out.
- Out: 6 to 8 frames.
- No bounce, no loops, no glints, no always-moving parts.

**R5, readable, then gone.**
- People read about 200 words a minute while listening.
- An overlay that stays over 8 s on footage starts to feel like a sticker. Cut it shorter, or make it a full-screen scene.

**R6, hard cuts by default.**
- Most cuts are hard cuts, timed on the voice.
- A transition (whip-A, whip-C, trans-D, trans-E, trans-F2) marks a change of chapter, and the next one is a different transition.
- In a list video, each item is a chapter.

**R7, no sound on cuts.**
- A soft hit when a big number lands is fine.
- A whoosh on every cut is not.

**R8, the footage carries the video, the graphics keep it rich.**
- A video with too few graphics feels bare: over 65 % plain footage fails, and so does a gap of more than 18 s on average between graphic starts after the hook. A test video with 20 graphics in 8 minutes (74 % plain) felt empty (owner, 16 Nov 2026). Look for every number, name, quote, place, list, comparison and correction the voice gives.
- Too many is a warning, not a failure: a video built mostly from full-screen scenes, like a map guide, can go under 35 %. Then check that every scene is earned.

**R9, cuts follow the voice.**
- Let each shot breathe: 3 to 4 s on average, and not under 2.5 s after the hook when the library has a longer take. Cuts every 2 s feel rushed.
- Cut at the end of a phrase or on the first word of the next one.
- Never cut in the middle of a word, and never leave a gap with nothing on screen.

**R10, never invent identity.**
- When the voice-over has a call to action, ask the user before building it ([gta-video/channel-kit.md](../gta-video/channel-kit.md)).
- With no pfp, the CTA plays without the avatar circle at all.

**R11, one theme.** The user picks `clean` or `vice` once, at the start.

**R13, another game wears its logo.**
- When the voice names another game, its own footage is on screen (gta-footage), and its logo says whose footage it is: `gametag-A` slides it into the top-left corner, `gametag-B` lands it big in the centre, then glides it there. It spans that game's shots, from the cut on the name to the cut back to GTA VI.
- Because it only labels the footage, it doesn't use up R3's breathing room: a game tag can sit 1.4 s after a number card (video 2, 6:07, owner 16 Nov 2026).
- With a game switch (R14) in front of it, the tag starts as the switch's plate leaves (gameswitch-A), or the switch hands its own logo over as the tag (gameswitch-B docks it in the corner: no separate tag).

**R14, a change of game is never a hard cut.**
- When the voice moves to another game (San Andreas, GTA IV), its footage comes in with a short transition, never a direct cut, because the viewer is clearly changing game. Coming back to GTA VI gets a transition too (owner, 17 Nov 2026).
- `gameswitch` is a series: one variant all video, so the way in and the way back look like one pair. Its plate shows the incoming game's real logo (assets/logos, through `game`) and its year: on the way back, the GTA VI logo and 2026.
- It is not an R6 transition: it sits in `graphics[]` with layer `transition` and reason `switch`, it may come anywhere the footage changes game, and it doesn't use up R3's breathing room.
- A run of another game's shots that sits under a full-screen scene (a game board) needs no switch at the cuts the scene covers.

**R15, open strong.**
- The first Mac test (18 Nov 2026) skipped the intro "to keep the test focused", put 6 graphics in 85 s and passed at 77 % plain footage, because R8 only counted videos over 2 min. The owner found its start empty: "the beginning lacked animation, especially the intro". So R8 now counts from 60 s, and R15 asks for a designed opening and a busy hook.
- The hook is where viewers leave. Plan it first: the opening (an intro, or a graphic on the first line), then the first number, name or promise, 5 s apart.

**The intro: whenever it fits the script.**
- An `intro` scene (intro-A or intro-B, with the game's logo) fits most videos: intro-B when the first line names the game, intro-A for a video about the game, its trailers or what was shown. Skip it only for a reason you can say, never to save time (check_pacing warns). When neither matches, make a new opening animation for that first line (gta-motion/new-animation.md) or open on the hook's own graphics; never force a template that doesn't fit (owner, 17 Nov 2026).
- An intro sits in `graphics[]` with reason `intro` and no anchor, starts at 0:00, and comes once per video. The first shot plays under it (intro-B) or comes out of it (intro-A), and the voice starts with it. It counts as a graphic for R3: the next graphic waits the hook's breathing room after it ends.

**R12, series stay the same, the rest varies.**
- **A series** is an animation that counts through the video: the list counters (#10, #9, #8...) and the chapter cards. Its variant is chosen at its first use and kept to the end, so the countdown looks like one thing. Mixing two counter styles in one top 10 looks broken.
- **Everything else varies.** When the same kind of moment comes back (a second sourced claim, a second name, a second place), use another variant of that animation, or another animation that says the same thing (the same `says` in device.json). The same variant twice in a row fails when the animation has another variant in the video's theme; with only one variant, it is a warning.
- Transitions are listed apart: R6 keeps two in a row from being the same.
