# Grok Video Director — Next Phase: Smart Style Engine

## The Vision

The pipeline currently takes a raw style string. The next evolution is a **smart style system** that:
1. Maps content/tone to visual language automatically
2. Maintains a library of cinematic presets with real camera/lens/film science
3. Defines character archetypes that pair naturally with styles
4. Makes it so the user can say "cats setting up OpenClaw, funny" and the system picks Wes Anderson on its own

## Style Library (Director Presets)

Each preset defines: color grade, camera behavior, lens choice, lighting rig, film stock, and editing rhythm.

### Director Styles

| Preset | Color | Camera | Lens | Light | Film | Best For |
|--------|-------|--------|------|-------|------|----------|
| `wes-anderson` | Pastel (mustard, pink, mint, cream) | Perfectly symmetrical, flat frontal, planimetric | 35mm, straight-on | Soft diffused, overcast golden hour | 35mm Kodak with faded vintage | Whimsical, absurd, deadpan humor |
| `guy-ritchie` | Desaturated, crushed blacks, cold blue-green | Handheld, snap zooms, Dutch angles | Wide angle with distortion | Bare bulbs, practical, cold | 35mm Kodak Vision3 500T, heavy grain | Crime, hustle, fast-talking energy |
| `david-fincher` | Dark, green-tinted, clinical | Precise slow dolly, locked tripod | 27-40mm, methodical | Low-key, single source, motivated | Digital RED, clean | Thriller, corporate menace, paranoia |
| `wkw` (Wong Kar-wai) | Oversaturated neon, smeared color | Step-printed slow-mo, handheld | Wide aperture, extreme bokeh | Neon, street light, night | Pushed film stock, motion blur | Melancholy, beauty, longing |
| `spielberg` | Warm golden, lens flare | Push-in on faces, crane for scale | Anamorphic, flared | Magic hour, backlit | 35mm Panavision look | Wonder, emotion, spectacle |
| `kubrick` | Cool symmetric, neutral | Tracking, one-point perspective | Wide angle, deep focus | Even, controlled, clinical | Sharp, low grain | Unease, precision, dark comedy |
| `tarantino` | Saturated 70s palette, warm | Trunk shots, low angles, long takes | Wide, some fisheye | Practical, bold | Grainy exploitation film look | Violence, dialogue, cool |
| `a24-horror` | Muted, desaturated natural | Static wide, uncomfortably long holds | Normal lens, no tricks | Natural/ambient only | Clean digital, organic | Dread, slow burn, psychological |
| `youtube-native` | Bright, slightly overexposed | Static webcam/selfie, jump cuts | Phone/webcam lens | Ring light, overhead LED | Digital compression artifacts | Tech reviews, vlogs, casual |
| `documentary` | Neutral, ungraded | Handheld verite, reactive | Standard zoom, practical | Available light only | 16mm or digital, honest grain | Realism, truth, intimacy |
| `soviet-propaganda` | High contrast B&W | Low heroic angles, static | Wide angle, deep focus | Hard dramatic side-light | B&W film, heavy contrast | Satire, power, authority |
| `vhs-home-video` | Warm, oversaturated, analog bleed | Shaky amateur, auto-focus hunting | Consumer camcorder | Whatever's available | VHS scan lines, tracking errors, date stamp | Nostalgia, found footage, cringe |
| `michael-mann` | Cool digital blue, city nights | Steady, precise, nocturnal | Digital sheen, deep focus | City light, neon, ambient | Digital (Collateral/Heat look) | Urban, professional, night |
| `anime-cel` | Flat bold colors, limited palette | Dynamic angles, speed lines | N/A (drawn) | Dramatic, hard shadows | Clean cel-shaded, bold outlines | Action, drama, stylized |

### Lens Library

| Lens | Effect | When to Use |
|------|--------|-------------|
| `wide-14mm` | Extreme distortion, dramatic | Intimidation, comedy, Guy Ritchie |
| `wide-24mm` | Moderate distortion, environmental | Establishing shots, interiors |
| `standard-35mm` | Natural, versatile | Default, documentary |
| `normal-50mm` | Human eye perspective, honest | Dialogue, portraits |
| `portrait-85mm` | Shallow DOF, face isolation | Close-ups, emotional beats |
| `tele-135mm` | Compressed background, voyeuristic | Surveillance, distance |
| `anamorphic` | Oval bokeh, horizontal flare | Cinematic, epic, Spielberg |
| `macro` | Extreme detail | Product shots, texture |

### Lighting Rigs

| Rig | Description | Mood |
|-----|-------------|------|
| `ring-light` | Even frontal fill, catch lights in eyes | YouTube, beauty, modern |
| `single-source` | One hard light, deep shadows | Noir, thriller, Fincher |
| `practical` | Only lights visible in scene (lamps, monitors) | Naturalistic, intimate |
| `golden-hour` | Warm backlit, lens flare | Romantic, hopeful, Spielberg |
| `neon` | Colored light sources, saturation | Cyberpunk, nightlife, WKW |
| `overhead-fluorescent` | Flat, unflattering, green tint | Office, institutional, horror |
| `bare-bulb` | Harsh, industrial | Gritty, crime, interrogation |

## Character Archetypes

| Archetype | Default Style | Description |
|-----------|--------------|-------------|
| `tech-bro` | `youtube-native` | Hoodie, gaming chair, RGB room, manic energy |
| `corporate-exec` | `fincher` | Suit, glass office, measured, sinister calm |
| `geezer` | `guy-ritchie` | Frayed clothes, dingy flat, cockney energy |
| `confused-boomer` | `documentary` | Reading glasses, messy desk, bewildered |
| `cats` | `wes-anderson` | Perfectly composed cats doing human things |
| `influencer` | `youtube-native` | Ring light, perfect setup, performative |
| `whistleblower` | `fincher` | Parking garage, shadows, nervous |
| `propaganda-host` | `soviet-propaganda` | Heroic framing, dead serious about nonsense |
| `retro-dad` | `vhs-home-video` | VHS camcorder, living room, pure cringe |

## Auto-Style Matching (Future)

The Director LLM could analyze the scene description and automatically select the best style:

```
User: "cats setting up AI, funny"
Director thinks: animals + tech + humor → wes-anderson
Director thinks: cats → symmetrical, deadpan → planimetric framing
Auto-selects: wes-anderson preset + standard-35mm + practical lighting
```

This would be a Phase 0 before the current pipeline — a "style advisor" that picks the visual language before the character bible and shot plan are created.

## Implementation Ideas

1. `src/styles.ts` — Style preset definitions as typed objects
2. Extend `DirectorConfig` with optional `preset` field
3. Style advisor phase in Director that selects preset from scene analysis
4. CLI flag: `--preset wes-anderson` or `--auto-style`
5. Each preset injects its full style directive into every Director prompt

## Content Plays

The real unlock: pair archetypes + styles + trending topics = content engine.

- OpenClaw security disaster → `whistleblower` + `fincher`
- AI replacing jobs → `corporate-exec` + `fincher` doing a "restructuring" announcement
- Tech hype cycle → `tech-bro` + `youtube-native` unboxing their 47th AI tool
- Government AI regulation → `propaganda-host` + `soviet-propaganda`
- Parents discovering AI → `retro-dad` + `vhs-home-video` trying to set up ChatGPT
- Pets using AI → `cats` + `wes-anderson`
