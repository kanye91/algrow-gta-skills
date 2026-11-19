---
name: gta-map
description: Map chapters for GTA 6 YouTube videos. On our own census map of Leonida (the real South Florida), a car drives a real road into one of the game's regions with a mileage counter, the region's outline draws in its colour under its title, then the camera dives into the city and up to three places the game has named pin in with their real-world twins ("VC PORT", "REAL: PORT MIAMI"). The regions, routes and places ship as data, and the scene is the gta-motion template mapchapter-A, planned in plan.json like any graphic. Use when a chapter of the video moves to a region (Vice City, the Keys, Grassrivers, Ambrosia), or when the user asks for "a map", "show where it is", "the drive from the Keys" or a place's real-world twin. Not for a quick place label (gta-motion's cornerbug or mapcaption) or for footage.
compatibility: Node.js 22+ and HyperFrames 0.9.53 (see SETUP.md at the repo root). No packages to install. Used by gta-video when it plans the graphics.
metadata:
  author: Algrow
  version: 0.1.0
---

# GTA map

A map chapter tells the viewer where the next part of the video happens, and makes it feel like a trip. Plan it in `plan.json` like any other graphic. `build_video.mjs` builds it through `gta-motion/make_scene.mjs`. The region data is already in the template, so there is nothing to fetch or draw.

## Important

- **Never invent a place.** A pin is a place the game has shown or named: the list in `maps/regions.json` (`node places.mjs`) or a `[CONFIRMED]` / `[REPORTED]` line in the user's fact sheet. Its position is the `lat,lon` of its real-world twin. No twin, no pin.
- **Say what fans matched.** Rockstar named VC Port, Little Cuba and Ocean Beach, and their twins are clear, so their line is `REAL: PORT MIAMI`. Sahara Arena, Fleeca Field and VCIA are fan matches (`basis: "fan match"`): write `FANS SAY: KASEYA CENTER`, never `REAL:`.
- **Six regions, four on the map.** Port Gellhorn (the Panhandle) and Mount Kalaga (the north) are north of our map, so they get no map chapter. Use a `chapter2` card instead, or in clean `titre07-E` over a calm shot of the region.
- **The maps are ours, and the stills are the user's.** `leonida.jpg` and `vice-city.jpg` are drawn from public-domain census data and ship with the skill. The postcard and pin photos are frames of gameplay clips from the Algrow GTA connector (`@frame gameplay/<clip id> <seconds>`), cut at build time and never shipped. Never a GTA VI video file.
- **The credit goes in the video description:** `Map data: US Census Bureau TIGER/Line (public domain).` Add it whenever the video has a map scene, this one or a `mapcaption`.

## When a video earns a map chapter

- A chapter starts in a region, and the voice names it ("Welcome to Vice City", "Down in the Keys...").
- The voice travels ("from the Keys up to Vice City"): that's the route.
- The voice names places in that region, one after another: those are the pins.

Use it at every chapter that moves to a region, for 9 to 15 seconds. It is a series, like chapter cards (R12): every region gets the same package, as in Roddy Games' MAP GUIDE (one per region, 6 in the video), so `mapchapter-A` repeats on purpose and keeps one variant all through the video. A full-screen scene counts as one graphic (rule R1), so nothing else sits on top of it. For a passing mention, use a `cornerbug` or a `mapcaption` (gta-motion).

## Pick the region, the route and the pins

`node <skills>/skills/gta-map/places.mjs` lists all of them (`<skills>` is the folder of this repo). `node <skills>/skills/gta-map/places.mjs 25.7745,-80.1700` tells you where a point falls: its pixels, its region, and whether it gets the close-up.

| `region` | The game's region | Real-world area |
|---|---|---|
| `vice-city` | Vice City | Miami: downtown, Little Havana, Miami Beach |
| `leonida-keys` | Leonida Keys | The Florida Keys |
| `grassrivers` | Grassrivers | The Everglades and Big Cypress |
| `ambrosia` | Ambrosia | The sugar towns south of Lake Okeechobee (a fan match) |

**Route** (optional): `<from>-to-<to>`, in either direction. It ends in the chapter's region.

| Route | Miles | Road |
|---|---|---|
| `leonida-keys-to-vice-city` (validated) | 67.2 | US 1, the Overseas Highway |
| `vice-city-to-grassrivers` | 36.8 | US 41, the Tamiami Trail |
| `vice-city-to-ambrosia` | 93.4 | US 27 |
| `grassrivers-to-ambrosia` | 103.4 | US 41, Krome Avenue and US 27 |

Use a route when the voice travels, or when the last chapter was the neighbouring region. Leave it empty otherwise: the scene then opens straight on the push into the region.

**Pins** (optional, up to three, in this region only):
- `pinN` is the game's name, in capitals.
- `pinN_real` is the twin line.
- `pinN_icon` is `anchor`, `cup`, `palm`, `star`, `plane` or `car`.
- `pinN_at` is the twin's `lat,lon`.
- `pinN_photo` is optional: a frame of a gameplay clip that shows the place, `@frame gameplay/<clip id> <seconds>` (`gta-footage` finds the clip; `gameplay.mjs sheet` shows its frames).
- `pinN_low: true` puts a label under its pin, when two labels would touch.

If every pin is inside Vice City's close-up (`places.mjs` says so), the camera dives into the sharp `vice-city.jpg`. Otherwise it frames them on the state map.

## Timing on the words

| Value | Put it on | Validated |
|---|---|---|
| `title_at` | The region's name. With a route, 4.12 s or more: the drive takes the first 3.4 s, while the voice leads in. Without one, 0.6 s or more | 4.12 |
| `title_out` | About 4 s later, before the voice moves on to the places | 8.15 |
| `pinN_time` | Each place's name, at least 1.2 s apart, and 1.65 s or more after `title_out`, once the camera has dived in | 9.95, 11.15, 12.35 |

The scene ends at the graphic's `end`; the builder sets `out` from it. As validated, the chapter cuts to the next shot while the pins are still on screen. Without pins, end the graphic about 0.45 s after `title_out`.

## The plan entry

The validated Vice City chapter (the clip ids and times are examples: take frames of your own gameplay clips):

```json
{
  "id": "g04", "device": "mapchapter-A", "layer": "fullscreen", "start": 61.3, "end": 75.9, "reason": "chapter",
  "text": ["VICE CITY", "THE SUN AND FUN CAPITAL OF AMERICA"],
  "vars": {
    "region": "vice-city", "route": "leonida-keys-to-vice-city",
    "sub": "THE SUN AND FUN CAPITAL OF AMERICA", "postcard": "@frame gameplay/gta-000123 2.4",
    "title_at": 4.12, "title_out": 8.15,
    "pin1": "VC PORT", "pin1_real": "REAL: PORT MIAMI", "pin1_icon": "anchor", "pin1_at": "25.7745,-80.1700",
    "pin1_time": 9.95, "pin1_photo": "@frame gameplay/gta-000187 1.5", "pin1_low": true,
    "pin2": "LITTLE CUBA", "pin2_real": "REAL: LITTLE HAVANA", "pin2_icon": "cup", "pin2_at": "25.7655,-80.2185",
    "pin2_time": 11.15, "pin2_photo": "@frame gameplay/gta-000204 3.0",
    "pin3": "OCEAN BEACH", "pin3_real": "REAL: SOUTH BEACH", "pin3_icon": "palm", "pin3_at": "25.7805,-80.1305",
    "pin3_time": 12.35, "pin3_photo": "@frame gameplay/gta-000231 0.8"
  }
}
```

- Times in `vars` count from the graphic's `start`.
- `text` holds the title and the line under it: two elements (rule R5). The pins are labels on the map, each on its own word.
- `title` empty = the region's name.
- `sub` empty = no line. Take it from Rockstar's own words about the region (`official` in `regions.json`), in spaced capitals, 38 characters at most.
- `caption` empty = "Greetings from <region>".
- No `postcard` = no postcard.
- Both themes. In vice the title, labels and frames take the sunset ramp and the dims turn plum.
- The region's colour is the same in both themes.

The region title alone (`titre07-C`, `-D`, `-E`) is a clean-only overlay. It can't sit on top of this scene, because rule R1 refuses two graphics at once. `mapchapter-A` has titre07-E's title built in.

## Files

| File | What it is |
|---|---|
| `maps/leonida.jpg`, `maps/vice-city.jpg` | The state map (3322×5040) and the Vice City close-up (2917×2340): our renders of TIGER/Line census data |
| `maps/maps.json` | Their bounds and the pixel formula: `x = (lon - lon0) * ppd * cos`, `y = (lat1 - lat) * ppd` |
| `maps/regions.json` | For each region: its real-world area, Rockstar's line about it, its colour, its outline (`leonida.jpg` pixels; `paths_vc` in `vice-city.jpg` pixels) and its cameras. Also the routes (pixel polylines on real roads, with miles) and the named places. Made in the lab from census data; the skill only reads it |
| `places.mjs` | Lists the regions, routes and places; turns `lat,lon` into pixels and a region |
| `places.mjs --cornerbug [lat,lon]` | `cornerbug-A`'s `dot_x` / `dot_y` for a point on its Florida outline (or "off the outline"); with no point, for every region's centre and named place. The outline's formula is `marks` in `maps/maps.json` |
| `embed_regions.mjs` | For maintainers: after `regions.json` changes, writes its data into the template (`--check` tells if it's stale) |

The scene itself is `gta-motion/templates/mapchapter-A/`. Its `device.json` describes every value.
