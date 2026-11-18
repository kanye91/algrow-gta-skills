# What earns a graphic

Read the voice-over transcript and mark the moments the viewer needs to *see*. Each candidate gets a `reason`. Most lines earn one: the target is 20 to 40 % plain footage (rule R8), so a line with a fact the viewer can see gets a graphic unless a rule blocks it.

| `reason` | The voice says… | Device to reach for (`gta-motion`) |
|---|---|---|
| `number` | "over **3,000** NPCs", "**$50 million**" (when the number is the point) | Big number; Stat bars (two or more numbers) |
| `list` | "number **seven**", "the **last** one" in a list video | List counter |
| `comparison` | "GTA 5 **versus** GTA 6", "**twice** as big" | Split screen; Stat bars |
| `name` | a character, a gang or a business, **the first time** it is said | Name tag; Two names (two people on screen, named together); Relationship wall (who is linked to whom) |
| `place` | "in **Vice Beach**", "north of **Port Gellhorn**" | Place marker; Map caption; a map chapter (`gta-map`) |
| `date` | "back in **2002**", "on **November 19**" | Year stamp |
| `source` | "**according to Bloomberg**", "**Rockstar confirmed**" | Sourced claim (the claim with its source) |
| `quote` | a line quoted word for word | Top banner |
| `theory` | "a **leak** says", "fans **think**" (unconfirmed) | Forum post, marked unconfirmed |
| `correction` | "that's **wrong**", "**actually** it's…" | Strike & correct |
| `detail` | "look at the **left**", "notice the **sign**" | Detail callouts on a frozen frame |
| `chapter` | the start of a new part of the video | Chapter card; region title |
| `cta` | "**subscribe**", "**like**", "link in the **description**", "tell me in the **comments**" | Subscribe prompt, or Comment prompt for a question to the viewers, after asking the channel-kit questions |
| `keyword` | one word the whole sentence hangs on | Keyword punch. In the hook, and on a line with no other fact to show. |

## Choosing when there are too many

Mark every candidate first, then keep every one the rules allow:

1. **Rank them.** Sources, numbers that are the point of a sentence, corrections and places come first. Then a name on its first mention. A `keyword` comes last.
2. **Group close facts into one scene.** Facts closer than R3's gap (2 s of clean footage between two graphics) don't make several overlays; they make one full-screen scene, such as a card wall, a line-up or a map chapter, or one overlay for the strongest fact.
3. **Respect the gap.** Walk through the video in time order and keep a candidate only if it starts 2 s or more after the previous graphic ends (1 s in the hook).
4. **Drop repeats.** The same character, place or number gets a graphic once.
5. **Check the strip.** Write the plan, run `check_pacing.mjs`, and look at the screen-time line. Over 40 % plain footage fails: add graphics where the voice earns them. Under 15 % warns: remove the weakest ones.

## When nothing in the database fits

Use the closest animation's grammar to build a new one. See [gta-motion/new-animation.md](../gta-motion/new-animation.md). Mark it `"device": "new:<name>"` in the plan. It follows the same rules.
