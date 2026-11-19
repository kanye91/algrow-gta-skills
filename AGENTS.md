# For AI agents

This repository is a set of Agent Skills for editing GTA 6 YouTube videos from a user's voice-over. Each skill is a folder in `skills/` with a `SKILL.md`: YAML frontmatter (`name`, `description`), then the instructions. Read a skill's `SKILL.md` when its description matches the task, and open the other files it links to only when you need them.

Before the user's first video, check the computer with [SETUP.md](SETUP.md) (one command, `npx -y hyperframes@0.9.53 doctor`).

**GTA VI footage comes only from the Algrow GTA connector** (free, signed in with an Algrow account; its `gta_search_clips` tool is then available): real gameplay clips matched to every GTA VI line (`skills/gta-footage/SKILL.md`, "Gameplay library"). Rockstar's official trailers are coming to the connector. Check it before the first video: without it there is no GTA VI footage, so tell the user how to add it (SETUP.md) and don't start the edit. Never download GTA VI videos or ask for GTA VI files. When the voice talks about another game (RDR2, GTA 5...), that game's official videos are found on its publisher's own YouTube channel and downloaded on the user's computer with yt-dlp (`skills/gta-footage/official_video.mjs`, "Another game's footage" in `skills/gta-footage/SKILL.md`). yt-dlp is optional: without it, ask the user for the file.

Then start with `skills/gta-video/SKILL.md`. It runs the whole workflow and calls the other skills:
- `gta-pacing`: the rhythm, and the `check_pacing.mjs` gate;
- `gta-motion`: the animations;
- `gta-map`: map chapters (a region, the drive into it, its places), and the map data behind them;
- `gta-footage`: picking the clips.

Rules that apply everywhere:
- The voice-over and script are the user's. Never rewrite them.
- Never invent identity elements: no pfp, logo, initials or channel name the user didn't give. See `skills/gta-video/channel-kit.md`.
- Never render a plan that fails `skills/gta-pacing/check_pacing.mjs`.
- Never commit or redistribute Rockstar footage or images. Download other games' official videos only with `official_video.mjs`, from the channels in `skills/gta-footage/official-channels.json`: never a fan upload or a re-upload, never with a sign-in or cookies.
