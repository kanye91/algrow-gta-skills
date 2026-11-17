# The channel kit: ask, never invent

Some animations show the user's identity: their pfp, their channel name. **Claude never invents an identity element.** That means no logo, no initials or monogram, no made-up channel name, and no placeholder circle. The user gives it, or it is left out.

The answers are saved once in `channel.json`, at the project root, so the user is never asked twice.

## When to ask

- **At the start of a video,** ask only for what this video needs:
  - the theme (`clean` or `vice`) if `channel.json` doesn't have it yet;
  - the questions below when the voice-over has a call to action.
- **When the transcript contains a call to action:** "subscribe", "like", "hit the bell", "tell me in the comments", "link in the description", "join the Discord", "follow me on…". Find it while reading the transcript, before planning.

## The questions

Ask them in one message, short and plain:

> Your voice-over has a call to action at 9:42 ("subscribe so you don't miss it").
> 1. Do you want your profile picture on the subscribe animation (and the comment one)? If yes, send the image (square, at least 400 × 400).
> 2. Should it show your channel name? If yes, how is it written exactly?

Ask about the theme the first time only:

> 3. Which style for this channel: **clean** (white text, no colour) or **vice** (Vice City sunset colours)?

## What each answer does

| Answer | The animation |
|---|---|
| pfp given | The pfp sits in the avatar circle. |
| **no pfp** | **No avatar circle at all.** The name and button slide over to take its place. No initials, no logo, no grey circle. |
| channel name given | The name shows, exactly as written. |
| no channel name | Only the call to action ("Subscribe"), with no name line. |

The comment prompt never shows a channel name. `comment-A` takes the pfp the same way (no pfp, no circle); `comment-B` shows no identity at all.

## `channel.json`

```json
{
  "name": "Vice Weekly",
  "avatar": "brand/pfp.png",
  "theme": "clean",
  "asked": ["name", "avatar", "theme"]
}
```

- `avatar` and `name` are `null` when the user said no.
- `asked` lists what has already been asked, so you never ask again.
- If the user wants to change an answer later, update the file.
- `check_pacing.mjs` (rule R10) fails any plan that shows an avatar or a name the kit doesn't have, and any `monogram` or `initials` field.
