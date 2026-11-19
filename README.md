# Algrow GTA Skills

> `gta-pacing`, `gta-footage`, `gta-motion`, `gta-video` and `gta-map` are written and tested, and every validated animation is in `gta-motion/templates`. Now being tested on full videos.

Claude skills that turn your GTA 6 voice-over into a cleanly edited YouTube video. The footage is cut on your voice, and a few precise graphics appear only when your words earn them. Nothing fights for attention.

You bring the voice-over, or a script plus the Algrow MCP to generate it. The skills do the edit.

**Before the first video, follow [SETUP.md](SETUP.md)**: Node.js 22+, FFmpeg, the speech model and the official videos, checked with one command.

```
algrow-gta-skills/
├── README.md                    this page
├── SETUP.md                     what to install before the first video, and how to check it
├── AGENTS.md                    where the skills are, for other AI agents
├── library.example.json         the Algrow footage library's settings (as library.json, with your key)
├── assets/logos/                96 real logos (games, outlets, companies, platforms, in-game brands) and logos.json (the images come with the Algrow download)
├── .claude-plugin/              install in Claude Code with one command
├── skills/
│   ├── gta-video/               1. Start here: voice-over in, finished video out
│   │   ├── SKILL.md
│   │   ├── inputs.md            what the user brings (voice-over, or script + Algrow MCP)
│   │   ├── channel-kit.md       ask, never invent: pfp, channel name, theme
│   │   └── build_video.mjs      plan.json in, HyperFrames project out (footage cut, scenes made)
│   ├── gta-pacing/              2. The rhythm
│   │   ├── SKILL.md
│   │   ├── rules.md             the 12 pacing rules
│   │   ├── what-earns-a-graphic.md
│   │   ├── plan-format.md       the edit plan (plan.json)
│   │   ├── why-these-numbers.md
│   │   └── check_pacing.mjs     fails a busy edit before it's rendered
│   ├── gta-motion/              3. The animations
│   │   ├── SKILL.md
│   │   ├── catalogue.md         every animation: what it says, when to use it
│   │   ├── new-animation.md     the new animations each video makes, from the database
│   │   ├── template-format.md   how a template is built and tested
│   │   ├── make_scene.mjs       puts one template into the project with the video's values
│   │   ├── find_box.mjs         puts a detail box exactly on its thing: rulers, zoom, check, blind check
│   │   ├── logo_fit.mjs         measures a new game logo for logos.json (its visual centre, its dive point)
│   │   ├── logo_shape.mjs       a logo's silhouette, solid inside (intro-B's window; make_scene calls it)
│   │   ├── theme.css            clean + vice: fonts, colours, motion
│   │   ├── fonts/
│   │   └── templates/           one folder per validated animation
│   ├── gta-map/                 4. Map chapters: the drive in, the region's title, the pins
│   │   ├── SKILL.md
│   │   ├── maps/                our census maps of Leonida, the regions, routes and places (regions.json)
│   │   ├── places.mjs           lists them; turns lat,lon into map pixels and a region
│   │   └── embed_regions.mjs    for maintainers: puts regions.json into the mapchapter-A template
│   └── gta-footage/             5. The right clip for each line of the voice-over
│       ├── SKILL.md
│       ├── shot-index.json      every official shot, described and tagged
│       ├── find_shots.mjs       picks a shot per line: a match, or background
│       ├── library.mjs          the Algrow footage library: shots fetched already cut, with your key
│       ├── gameplay.mjs         gameplay clips from the Algrow GTA connector: on the beats, fetched, contact-sheet pages
│       ├── official_video.mjs   another game's official videos: found on its publisher's channel, downloaded with yt-dlp, a contact sheet
│       └── official-channels.json  the official YouTube channels it may download from, and their games
└── tests/                       test plans for check_pacing.mjs, the gameplay-clip test and the other-game test (fake videos, no network)
```

## Test

```bash
node tests/make_fixtures.mjs
node skills/gta-pacing/check_pacing.mjs tests/calm/plan.json   # PASS
node skills/gta-pacing/check_pacing.mjs tests/busy/plan.json   # FAIL on every rule
node tests/gameplay_test.mjs                                    # all gameplay checks passed
node tests/other_game_test.mjs                                  # all other-game checks passed
```

Footage and images of GTA VI belong to Rockstar Games. This repo ships no footage: you use your own copies of the official trailers, or the Algrow footage library with your key, gameplay clips from the Algrow GTA connector with your Algrow sign-in, and other games' official videos downloaded on your computer from the publisher's own YouTube channel with yt-dlp (SETUP.md).
