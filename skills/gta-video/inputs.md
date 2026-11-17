# What the user brings

We don't write scripts. The user brings their words, and the skills turn them into the edit.

| The user has | What to do |
|---|---|
| **A voice-over** (wav, mp3, m4a) | Use it as it is. It sets the length and the clock of the whole video. Never cut, speed up or re-time it. |
| **A script only** | If the Algrow MCP is connected, generate the voice-over with it, then continue as above. If it isn't connected, ask the user to connect it or to record the voice-over. Never invent or edit the script's words. Before generating, read the script against the footage it describes: if a line contradicts a clip ("the guy twerking" over a clip of a woman), tell the user, who fixes the words; a voice is paid for (owner, 16 Nov 2026). |
| **A voice-over and its script** | Use the voice-over. Use the script only to fix the spelling of names in the transcription. |

## Then

1. **Transcribe with word timings**, on the user's computer, with `npx -y hyperframes@0.9.53 transcribe <voice-over> --engine parakeet --json` (the model is installed in [SETUP.md](../../SETUP.md)). It prints a summary; the word list is the file named by `transcriptPath` (`transcript.json` next to the voice-over). Move it to `work/words.json`, as it is (format in [gta-pacing/plan-format.md](../gta-pacing/plan-format.md)). Check names against the script, if there is one, so that "Jason Duval" isn't "Jason Do Val".
2. **Read the transcript once, completely,** before planning:
   - the chapters (where the topic changes);
   - the calls to action (see [channel-kit.md](channel-kit.md));
   - the moments that earn a graphic.
3. **Plan the edit** with `gta-pacing`, choose the footage with `gta-footage`, then build.

The voice-over is the user's work. If something in it sounds wrong (a fact, a name), tell the user; don't change it.
