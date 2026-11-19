# For AI agents

This repository is a set of Agent Skills for editing GTA 6 YouTube videos from a user's voice-over. Each skill is a folder in `skills/` with a `SKILL.md`: YAML frontmatter (`name`, `description`), then the instructions. Read a skill's `SKILL.md` when its description matches the task, and open the other files it links to only when you need them.

Before the user's first video, check the computer with [SETUP.md](SETUP.md) (one command, `npx -y hyperframes@0.9.53 doctor`).

The footage is the user's own copies of the official videos, or the Algrow footage library when `library.json` at the repo root has a url (SETUP.md); never print its key. When the Algrow GTA connector is connected (its `gta_search_clips` tool is available), real gameplay clips come first for the lines about playing the game (`skills/gta-footage/SKILL.md`, "Gameplay library"). The connector is optional and free: without it, suggest it once at the start of a video and carry on with the official videos (`skills/gta-video/SKILL.md`, step 1).

Then start with `skills/gta-video/SKILL.md`. It runs the whole workflow and calls the other skills:
- `gta-pacing`: the rhythm, and the `check_pacing.mjs` gate;
- `gta-motion`: the animations;
- `gta-map`: map chapters (a region, the drive into it, its places), and the map data behind them;
- `gta-footage`: picking the clips.

Rules that apply everywhere:
- The voice-over and script are the user's. Never rewrite them.
- Never invent identity elements: no pfp, logo, initials or channel name the user didn't give. See `skills/gta-video/channel-kit.md`.
- Never render a plan that fails `skills/gta-pacing/check_pacing.mjs`.
- Never commit or redistribute Rockstar footage or images.
