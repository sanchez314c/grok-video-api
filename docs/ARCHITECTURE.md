# Architecture

## The Problem

Every API call to an AI video model is stateless. Generate 8 clips of "a samurai walking across Mars" and you get 8 different samurais on 8 different landscapes. There's no continuity.

## The Solution

Put an LLM in the director's chair. The video model never learns, but the director never forgets. A single growing conversation thread maintains full context of every character detail, every shot plan, every drift correction across the entire pipeline.

## The 4-Phase Director Pipeline

```
Scene Description
       |
       v
+----------------------------------------------+
|  Phase 1: CHARACTER BIBLE                     |
|  Director LLM outputs structured JSON:        |
|  - Physical appearance, wardrobe, features    |
|  - Color palette (hex values)                 |
|  - Art style directive                        |
|  Then generates a reference image             |
+-------------------+--------------------------+
                    |
                    v
+----------------------------------------------+
|  Phase 2: SHOT PLAN DECOMPOSITION             |
|  Director breaks scene into N shots:          |
|  - Action, camera angle, lighting             |
|  - Environment details                        |
|  - Transition from previous shot              |
+-------------------+--------------------------+
                    |
                    v
+----------------------------------------------+
|  Phase 3: PER-SHOT GENERATION LOOP            |
|  For each shot:                               |
|    1. Director writes self-contained prompt   |
|    2. Submit to grok-imagine-video            |
|    3. Poll until complete (30-60s)            |
|    4. Download clip, extract last frame       |
|    5. Vision model scores drift (0-100)       |
|    6. Score >= threshold? Accept              |
|       Score < threshold? Director rewrites    |
|       prompt with drift feedback, retry       |
+-------------------+--------------------------+
                    |
                    v
+----------------------------------------------+
|  Phase 4: FINAL ASSEMBLY                      |
|  FFmpeg stitches accepted clips (no re-encode)|
|  Save: report, director log, all artifacts    |
+----------------------------------------------+
```

## Four Models, Four Roles

| Role | Model | What It Does |
|------|-------|-------------|
| Director | `grok-4-1-fast-non-reasoning` | Writes character bibles, shot plans, video prompts. Maintains the conversation. The brain of the operation. |
| Video | `grok-imagine-video` | Generates 1-15 second video clips from text prompts. Stateless. The hands. |
| Image | `grok-imagine-image-pro` | Creates the character reference image used for drift analysis. The casting agent. |
| Vision | `grok-2-vision-latest` | Compares generated frames against the character reference. Scores drift on 5 dimensions. The quality inspector. |

## Image Anchoring

The key to visual continuity between clips. When submitting a video generation request, the `image_url` parameter tells the video model what the first frame should look like:

- **Shot 1**: `image_url` = character reference image URL
- **Shot 2+**: `image_url` = previous clip's video URL

Combined with the Director's detailed prompt (which embeds the full character description every time), this gives the video model both a visual and textual anchor.

## Drift Analysis

After each clip is generated, FFmpeg extracts the last frame and sends it to the vision model alongside the character reference image. The vision model scores 5 dimensions, each 0-20:

| Dimension | What It Measures |
|-----------|-----------------|
| Character | Face, build, skin, hair match |
| Wardrobe | Clothing, colors, accessories |
| Environment | Setting matches the shot plan |
| Style | Visual style consistency |
| Continuity | Does this follow naturally from the previous clip |

**Total: 0-100.** Default acceptance threshold: 60.

If a clip scores below threshold, the Director receives specific drift feedback and rewrites the prompt with corrections. After max retries, the best attempt is accepted anyway.

## The Single Growing Conversation

The Director maintains one `messages[]` array across the entire pipeline. At 8 shots, this is roughly 50K tokens. At $0.20/M input, that costs about $0.01 per run.

This matters because when the Director needs to correct for drift, it has full context of every decision it's made. It knows the character bible, the shot plan, what each previous prompt said, and what drift issues were flagged. Corrections are precise, not guesses.

## Self-Contained Prompts

Despite the Director having full conversation context, every video prompt it writes must be completely self-contained. The video model receives only the prompt text. No conversation history, no character bible, no previous clips.

The Director embeds everything into a single paragraph: full character description, wardrobe, environment, camera, lighting, action. This is why prompt length management matters. Prompts are capped at ~300 words to prevent truncation.

## Script-Driven Pipeline (Alternative)

`pipeline.ts` offers a simpler alternative that skips the LLM entirely. You provide a JSON or text script with pre-written clip descriptions, and the pipeline generates them sequentially with image anchoring but no drift analysis.

Good for: pre-written storyboards where you don't need the Director's creative input.

## Provider Interfaces

`types.ts` defines abstract interfaces that any AI provider can implement:

- `ImageProvider` - generate and edit images
- `VideoProvider` - generate and edit videos
- `LLMProvider` - chat completions
- `VisionProvider` - image analysis
- `VoiceProvider` - speech synthesis and voice cloning
- `UnifiedProvider` - wraps all capabilities
- `ProviderRegistry` - manages multiple providers

The director pipeline currently calls xAI functions directly. These interfaces are designed for a future where the pipeline is provider-agnostic and you can swap xAI for OpenAI, Google, Runway, etc.

## Output Structure

```
output/director-{timestamp}/
  character-ref.jpg           Character reference image
  character-bible.json        Structured character description
  director-report.json        Full pipeline metrics, costs, drift scores
  director-log.txt            Human-readable decision log
  clips/
    clip-001.mp4 ...          Accepted final clips
  frames/
    shot-001-attempt-1.jpg    Extracted last frames
  attempts/
    shot-001-attempt-1.mp4    All attempts including rejected ones
  {scene-name}-final.mp4      Stitched final video
```

## Error Recovery

The pipeline handles failures at every level:

- **Video timeout** (7.5 minutes): Skip shot, log failure, continue
- **Vision parse failure**: Accept clip without drift scoring
- **Director JSON truncation**: Fallback regex extraction
- **Budget exceeded**: Stop gracefully, stitch whatever completed
- **FFmpeg missing**: Skip frame extraction and drift analysis, auto-accept all clips
