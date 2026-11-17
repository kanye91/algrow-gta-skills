# Setup

What your computer needs before the first video, how to check it with one command, and how to install what's missing. Do this once.

## What you need

| | What | Why | Check |
|---|---|---|---|
| 1 | **An AI agent with a terminal**: Claude Code (desktop app or CLI) or Codex | The skills run commands. A chat in the browser can't render video. | — |
| 2 | **Node.js 22 or newer** | Runs HyperFrames (the video renderer) and the skills' scripts (`.mjs`, no packages) | `node --version` |
| 3 | **FFmpeg** (with FFprobe) | Cuts the footage and encodes the final video | `ffmpeg -version` |
| 4 | **Chrome for rendering** | HyperFrames draws every frame in it. It downloads its own copy (chrome-headless-shell, about 540 MB), even if Chrome is already installed: a normal Chrome can't capture frame by frame, so rendering would be slower | `npx -y hyperframes@0.9.53 browser ensure` |
| 5 | **The speech model** (Parakeet, about 640 MB) | Gives the word timings of the voice-over: every cut and graphic is placed on them | `npx -y hyperframes@0.9.53 models list` |
| 6 | **The footage**: your own copies of the official GTA VI videos (5 files, about 1.5 GB), or a key to the Algrow footage library (no download) | The shots of the video. The videos are Rockstar's and never part of this repo | see below |
| 7 | *Optional:* the **Algrow MCP** connected | Only if you bring a script without a voice-over: it makes the voice-over | — |

**Hardware:** 16 GB of RAM or more (rendering uses a lot of memory) and about 5 GB of free disk for the videos, Chrome, the speech model and a project (about 3.5 GB with the footage library).

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

## The footage: two ways

### A. Your own copies of the official videos

Put the five official videos in one folder, for example `footage/`. Every file name must contain the video's YouTube id. The id finds the right file; the rest of the name doesn't matter.

| Video | YouTube id |
|---|---|
| Grand Theft Auto VI Trailer 1 | `QdBZY2fkU-0` |
| Grand Theft Auto VI Trailer 2 | `VQRLujxTm3c` |
| Grand Theft Auto VI Launch Trailer | `rz1B4B2yBZY` |
| Grand Theft Auto VI: An Extended Look | `tJbzMqJGH4k` |
| Grand Theft Auto VI: Official Cover Art Reveal | `EiQEBYDox_k` |

Example: `footage/Grand Theft Auto VI Trailer 2 [VQRLujxTm3c].mp4`. Use the best quality you have (1080p or more).

Footage and images belong to Rockstar Games. Never commit them, share them or upload them anywhere.

### B. The Algrow footage library, with your key

The official videos stay on Algrow's server. Your skills ask it for exactly the shots, stills and clips your video needs, already cut, with your personal key. There is no 1.5 GB download and no footage folder.

Use the library version of the skills: it has `library.json` at the repo root. Put your key in it:

```json
{"url": "https://gta-footage.13.140.129.97.sslip.io", "key": "your key"}
```

Or leave `"key"` empty and set the environment variable `ALGROW_FOOTAGE_KEY` (it wins over the file):
- Windows (PowerShell): `setx ALGROW_FOOTAGE_KEY "your key"`, then open a new terminal;
- macOS and Linux: add `export ALGROW_FOOTAGE_KEY="your key"` to `~/.zshrc` (macOS) or `~/.bashrc` (Linux), then open a new terminal.

Check it from the repo folder: `node skills/gta-footage/library.mjs check` must say `footage library OK`.

- **Limits per key:** 120 requests a minute (the build waits and carries on) and 45 minutes of footage a day, reset at 00:00 UTC. A 3-minute video uses about 3.5 minutes. The pieces already fetched stay in the project, so building again costs nothing.
- **Your key is yours.** Never share it or commit `library.json` (it's in `.gitignore`). The skills never print it: errors show only its last 4 characters.
- A plan can mix both ways: a shot whose video is on your computer (its `src` file, or the plan's `footage` folder) is cut there, and only the others come from the library.

## Outlet logos

A sourced claim ("according to IGN…") shows the outlet's logo in its source chip when the logo is in `assets/logos/`. Otherwise it shows the outlet's name as text.

- The images come with the Algrow download, like the footage. They are transparent PNGs about 1280 px wide.
- `assets/logos/logos.json` lists each outlet's names, file and size in the chip. `build_video.mjs` matches the plan's outlet on those names (case, "The" and punctuation ignored).
- To add an outlet: put its PNG in `assets/logos/` and add an entry to `logos.json`. A file named like the outlet (`dazed.png`) also works without an entry.
- A plan can point at its own folder with `"logos": "<folder>"`; that folder is searched first.
- Never draw or recreate a logo. A missing logo is fine: the name shows as text.

## Test it

From the repo folder:

```bash
node tests/make_fixtures.mjs
node skills/gta-pacing/check_pacing.mjs tests/calm/plan.json
node skills/gta-footage/find_shots.mjs search "swamp airboat" --place grassrivers
```

The second line must end with `Result: PASS`, and the third must list a few swamp shots. With the footage library (B), also run `node skills/gta-footage/library.mjs check`. Then you're ready.

## For the agent

- At the start of the user's first video, run `npx -y hyperframes@0.9.53 doctor`. Read only the lines listed above.
- If something is missing, tell the user what it is, why it's needed, and the exact command for their system. Install it only after they say yes: it's their computer.
- Never install Python packages or Docker for these skills.
- If the footage folder is missing a video, `find_shots.mjs` names it. Ask the user for that file; never download it yourself.
- With the footage library (B), there's no footage folder: don't ask for one. If a build says the key is missing or wrong, or the day's footage is used up, tell the user that, word for word; never fetch the footage another way.
