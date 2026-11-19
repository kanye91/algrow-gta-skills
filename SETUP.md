# Setup

What your computer needs before the first video, how to check it with one command, and how to install what's missing. Do this once.

From GitHub instead of a zip: clone with the GitHub account the repo was shared with, naming its owner (`gh repo clone <owner>/algrow-gta-skills`; without the owner, `gh` looks in the account you're logged in with). The outlet logos aren't in git: in the repo folder, run `gh release download logos-2026-11-18 -p logos.tar.gz && tar -xzf logos.tar.gz -C assets/logos && rm logos.tar.gz`.

## What you need

| | What | Why | Check |
|---|---|---|---|
| 1 | **An AI agent with a terminal**: Claude Code (desktop app or CLI) or Codex | The skills run commands. A chat in the browser can't render video. | — |
| 2 | **Node.js 22 or newer** | Runs HyperFrames (the video renderer) and the skills' scripts (`.mjs`, no packages) | `node --version` |
| 3 | **FFmpeg** (with FFprobe) | Cuts the footage and encodes the final video | `ffmpeg -version` |
| 4 | **Chrome for rendering** | HyperFrames draws every frame in it. It downloads its own copy (chrome-headless-shell, about 540 MB), even if Chrome is already installed: a normal Chrome can't capture frame by frame, so rendering would be slower | `npx -y hyperframes@0.9.53 browser ensure` |
| 5 | **The speech model** (Parakeet, about 640 MB) | Gives the word timings of the voice-over: every cut and graphic is placed on them | `npx -y hyperframes@0.9.53 models list` |
| 6 | **The Algrow GTA connector** (`algrow-gta`), free, signed in with your Algrow account | The GTA VI footage: real gameplay clips, matched to your lines. Rockstar's official trailers are coming to it. Nothing to download by hand | see below |
| 7 | *Optional:* the **Algrow MCP** connected | Only if you bring a script without a voice-over: it makes the voice-over, after Claude asks you and you say yes | — |
| 8 | **yt-dlp**, installed by the skills when a video needs it | When the voice talks about another game (RDR2, GTA 5...), the skills download that game's official videos from the publisher's own YouTube channel. Claude installs yt-dlp by itself the first time a video needs it | `node skills/gta-footage/official_video.mjs check` |

**Hardware:** 16 GB of RAM or more (rendering uses a lot of memory) and about 3.5 GB of free disk for Chrome, the speech model and a project (its gameplay clips included).

Chrome and the speech model go into a cache folder, `~/.cache/hyperframes/` (set `HYPERFRAMES_CACHE_DIR` to move it), not into Program Files. They don't touch the browser you use. `npx -y hyperframes@0.9.53 browser clear` removes that Chrome.

You don't need Python or Docker.

## Check everything at once

```bash
npx -y hyperframes@0.9.53 doctor
```

These lines must show ✓: **Node.js, FFmpeg, FFprobe, Chrome, Memory, Disk.**

You can ignore these lines, because the skills don't use them:
- **whisper-cpp**, once Parakeet is installed;
- **TTS (Kokoro)** and **BGM (MusicGen)**: their install commands use Python, and you don't need them;
- **Docker**;
- **Version … available**: the skills are tested on HyperFrames 0.9.53, so stay on it.

## Install what's missing

The skills work the same on Windows, macOS and Linux: the commands, the files and the result.

**Windows** (winget is built into Windows 10 and 11). Open a new terminal afterwards.

```bash
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Gyan.FFmpeg
```

**macOS** (Apple Silicon or Intel), with Homebrew:

```bash
# Homebrew first, if `brew --version` says "command not found" (the official command from brew.sh):
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# then Node.js and FFmpeg:
brew install node ffmpeg
```

- At the end, Homebrew's installer prints "Next steps" with lines that add `brew` to your PATH. Run them, then open a new terminal.
- Parakeet runs on Mac without Python, from the same command as on Windows (below). If `transcribe` ever says `parakeet-mlx not found`, run `npx -y hyperframes@0.9.53 models install parakeet`. Don't install the Python version that message suggests.
- **Agents with a sandbox on macOS** (Codex in `workspace-write` mode): the sandbox stops Chrome from starting. `check` passes, but `render` and `snapshot` fail. Give the agent full access for the render, or run the render command yourself in Terminal.
- A Mac with 8 GB of memory can render, but slowly: add `--workers 2` to the render command.

**Linux:** install Node 22+ from nodejs.org (or with nvm), then `sudo apt install ffmpeg`.

**Then, on every system:**

```bash
npx -y hyperframes@0.9.53 browser ensure
npx -y hyperframes@0.9.53 models install parakeet
```

## The footage: the Algrow GTA connector

The GTA VI footage comes from the Algrow GTA library, free with an Algrow account: clips of real GTA VI gameplay, each described (who plays, where, what happens, vehicle, time of day, police). The skills match a clip to every line of your voice-over. Rockstar's official trailers are coming to the same library: the skills will use them through the connector when they arrive, with nothing to change on your side. Claude reaches the library through a connector; you sign in once with your own Algrow account, and nothing is stored in the repo.

**The skills never download GTA VI videos** (from YouTube or anywhere else), and you don't need any GTA VI video file.

**Claude Code**, in a terminal:

```bash
claude mcp add --scope user --transport http algrow-gta https://mcp.algrow.online/mcp/gta
```

`--scope user` makes it work in every folder. Without it, Claude Code adds it to the folder you ran the command in only, and a video project somewhere else won't see it.

Then sign in: start Claude Code and type `/mcp`, pick `algrow-gta` and log in in the browser. Or run `claude mcp login algrow-gta`, which needs an interactive terminal (it opens the browser), not a script.

**claude.ai** (and the desktop app): Settings → Connectors → Add custom connector, with the URL `https://mcp.algrow.online/mcp/gta`, then Connect and sign in.

- A Claude Code session that was already running when you added the connector doesn't see it: start a new session.
- Check it: in a new session, ask "list the algrow-gta filters". Claude calls `gta_list_filters` and shows the counts (clips, scenes, missions).
- Each clip comes as a link that expires after a few hours. The skills download the clips a video uses into its `footage/gameplay/` folder right after picking them (`gameplay.mjs fetch`). Never commit, share or upload them.
- The clips are 720p, with the game's HUD and subtitles: the build keeps the full frame (that is fine) and scales it to 1080p. The stills and short clips inside graphics come from the same clips. The library's cutscene clips are never used.
- It is needed: without it there is no GTA VI footage, so the skills stop at the start of a video and tell you how to add it.

## Other games' official videos: yt-dlp

When the voice talks about another game ("RDR2 vs GTA 6"), that game's footage goes on screen. The skills find its official videos on the publisher's own YouTube channel (Rockstar Games for every Rockstar game: the list is `skills/gta-footage/official-channels.json`), download the ones they need with **yt-dlp**, and pick the shots that match your words. yt-dlp is a free program, run like FFmpeg; the skills' script stays plain Node.js.

- Only the publisher's own channel: never a fan upload or a re-upload. No sign-in and no cookies are ever used, so a video YouTube shows only to signed-in users (an age check) can't be downloaded: the skills then ask you for your copy.
- The videos go into the video's `footage/other/<game>/`, on your computer. Only other games: GTA VI footage comes from the connector, and `official_video.mjs` refuses GTA VI videos. Never commit, share or upload them.
- **Claude installs it by itself** the first time a video needs another game's footage, without asking (owner, 19 Nov 2026): `node skills/gta-footage/official_video.mjs install` downloads yt-dlp's official standalone program from its GitHub releases into `~/.cache/algrow-gta/bin/`, checks it against the release's SHA-256 list, and uses it right away (no admin rights, no new terminal). Already installed with winget or Homebrew? That copy is used.
- If the install or a download fails, the skills ask you for that game's official video file, and with none they show calm gameplay and the game's logo.

**What yt-dlp needs for YouTube** (checked 19 Nov 2026 in yt-dlp's README and its EJS wiki page, and on Windows with yt-dlp 2026.09.27):
- **yt-dlp-ejs**, the scripts that solve YouTube's JavaScript challenges ("required for full YouTube support"). The official builds bundle it: the Windows `.exe` that winget installs, the standalone macOS and Linux binaries, and Homebrew's formula. A pip copy doesn't, unless installed as `yt-dlp[default]`; don't use pip for these skills.
- **A JavaScript runtime** to run them: Deno 2.3 or newer (recommended, and the only one yt-dlp turns on by default), or Node.js 22 or newer, or QuickJS (Bun is deprecated). The skills' script hands yt-dlp the Node.js it runs on, so Node.js 22+ is enough; Deno is used first when it's installed.
- **FFmpeg**, which you already have: it joins and repackages the downloads.
- Without any JavaScript runtime, yt-dlp 2026.09.27 still downloaded, with this warning: "YouTube extraction without a JS runtime has been deprecated, and some formats may be missing". Don't rely on that.

**Or install it yourself**

```bash
# Windows: on 64-bit Windows it brings Deno with it (and yt-dlp's own FFmpeg build)
winget install -e --id yt-dlp.yt-dlp
# Deno on its own, if `deno --version` says it isn't there:
winget install -e --id DenoLand.Deno

# macOS: Homebrew's yt-dlp brings Deno and yt-dlp-ejs with it
brew install yt-dlp

# Linux (x86_64): the standalone binary (no Python needed), then Deno is optional
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

Open a new terminal afterwards, then check from the repo folder: `node skills/gta-footage/official_video.mjs check` must end with `official videos OK`.

**Keep it current.** YouTube changes often, and an old yt-dlp stops working: `node skills/gta-footage/official_video.mjs install` updates the skills' own copy, or `winget upgrade -e --id yt-dlp.yt-dlp`, `brew upgrade yt-dlp`, or `sudo yt-dlp -U` on Linux.

## Logos

`assets/logos/` holds 96 real logos, each with its names, source page and licence in `logos.json` (`kind`):

| kind | what | used by |
|---|---|---|
| game (30) | every GTA game, GTA Online, the Definitive Edition, Red Dead, Max Payne, Bully, L.A. Noire, Manhunt, Midnight Club, The Warriors | the game tag, game switch, game boards and the intro, through the plan's `game` |
| outlet (6) | IGN, Game Informer, NYT, Edge, Kinda Funny, Rockstar | the source chip of a sourced claim ("according to IGN…") |
| company (7) | Rockstar North, Take-Two, 2K, Social Club, Rockstar Games Launcher, FiveM, Cfx.re | a logo value, by name |
| platform (10) | PS5, PS4, PlayStation, Xbox Series X|S, Xbox, Xbox One, Steam, Epic Games Store, Windows, GTA+ | a logo value, by name |
| brand (43) | in-game brands (Sprunk, eCola, Maze Bank, Vapid, Weazel News…); `game` lists the games they appear in | a logo value, by name |

- The images come with the Algrow download, like the footage. They are transparent PNGs about 1280 px wide.
- `build_video.mjs` matches a name in the plan on each entry's `names` (case, "The" and punctuation ignored).
- A brand's `game` says `GTA VI` only where an official trailer, screenshot or the official website shows it. The pictures are the GTA V versions: GTA VI may redraw a brand (Grotti's GTA VI badge is a hare).
- About 30 logos (mostly brands) only exist small and were scaled up: fine at tag size, soft if shown big. 17 are dark (Take-Two, PlayStation, Xbox, Maze Bank…): they need a light plate behind them on dark footage.
- A game logo also has `cx` (its visual centre, so a year or a line under it centres on the artwork) and `door` (where intro-B dives through it). For a new game logo, add its entry, then `node skills/gta-motion/logo_fit.mjs --write` measures both.
- To add a logo: put its PNG in `assets/logos/` and add an entry to `logos.json`. A file named like the outlet (`dazed.png`) also works without an entry.
- A plan can point at its own folder with `"logos": "<folder>"`; that folder is searched first.
- Never draw or recreate a logo. A missing logo is fine: the name shows as text.

## Test it

From the repo folder:

```bash
node tests/make_fixtures.mjs
node skills/gta-pacing/check_pacing.mjs tests/calm/plan.json
```

The second line must end with `Result: PASS`. `node tests/gameplay_test.mjs` checks the gameplay-clip steps on fake clips (no network): it must end with `all gameplay checks passed`. `node tests/other_game_test.mjs` checks the other-game steps on a fake official video (no network, no yt-dlp needed): it must end with `all other-game checks passed`. With yt-dlp, also run `node skills/gta-footage/official_video.mjs check`. Last, in a new Claude session, ask "list the algrow-gta filters" (the connector, above). Then you're ready.

## For the agent

- At the start of the user's first video, run `npx -y hyperframes@0.9.53 doctor`. Read only the lines listed above.
- If something is missing, tell the user what it is, why it's needed, and the exact command for their system. Install it only after they say yes: it's their computer. yt-dlp is the one exception (below).
- Never install Python packages or Docker for these skills.
- Check the Algrow GTA connector at the start of the first video: it is there when `gta_search_clips` is one of your tools. It is the GTA VI footage, so without it don't start the edit: tell the user it's free, give the command above, and say to sign in with `/mcp` and start a new session. If the user added it but you don't see it, tell them to start a new session; if it asks to sign in, tell them to run `/mcp` (or `claude mcp login algrow-gta` in their own terminal). Never ask for their Algrow password.
- Never download GTA VI videos, and never ask the user for GTA VI video files: GTA VI footage comes only from the connector.
- Download other games' official videos only with `skills/gta-footage/official_video.mjs`: the channels in `official-channels.json`, on the user's computer, into the video's `footage/other/`. Never another channel or a re-upload, never with a sign-in or cookies, and never around a refusal.
- If `official_video.mjs` says yt-dlp isn't installed (exit 3), install it yourself, without asking (owner, 19 Nov 2026): `node skills/gta-footage/official_video.mjs install`, and tell the user in one line what you installed and why ("Installing yt-dlp, free, to download RDR2's official trailer for that part"). Then carry on. Only if the install fails, ask the user for that game's video file.
- Never generate a voice-over on your own: when the user brings a script only, ask first and generate only after a yes (`skills/gta-video/inputs.md`).
