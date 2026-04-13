# Grok Video Director Pipeline

## What It Is

An LLM-directed video generation pipeline that produces coherent multi-clip AI video. An LLM acts as a **film director** — writing precise prompts, analyzing each generated frame for visual drift, correcting course, and stitching the result into a single continuous video.

The key insight: a human can't write 10 perfectly consistent video generation prompts, but an LLM can maintain a character bible, track what happened in the last frame, and compose each subsequent prompt with surgical precision.

## How It Works

```
User: "A samurai walks across Mars and finds an alien sword"
                         |
              ┌──────────▼──────────┐
              │   DIRECTOR LLM      │
              │  (grok-4-1-fast)    │
              │  Writes all prompts │
              │  Maintains context  │
              └──────────┬──────────┘
                         |
    ┌────────────────────┼────────────────────┐
    ▼                    ▼                    ▼
 Phase 1:           Phase 2:            Phase 3:
 Character Bible    Shot Plan           Per-Shot Loop
 (JSON structured)  (N sequential       ┌─────────────────┐
                     shots with         │ Director writes  │
                     camera, action,    │ video prompt     │
                     lighting)          │       ↓          │
                                        │ Grok Aurora      │
                                        │ generates video  │
                                        │ + image anchor   │
                                        │       ↓          │
                                        │ FFmpeg extracts  │
                                        │ last frame       │
                                        │       ↓          │
                                        │ Grok Vision      │
                                        │ scores drift     │
                                        │ (5 dims × 20)   │
                                        │       ↓          │
                                        │ Score ≥ thresh?  │
                                        │  YES → next shot │
                                        │  NO  → retry     │
                                        └─────────────────┘
                                                ↓
                                        Phase 4: FFmpeg stitch
```

## Pipeline Phases

### Phase 1: Character Bible
The Director LLM analyzes the scene description and creates a structured character bible:
- Physical description (face, build, skin, hair, eyes)
- Wardrobe (every garment, color, texture)
- Distinguishing features (scars, tattoos, accessories)
- Color palette (hex values)
- Art style directive

A character reference image is then generated using `grok-imagine-image-pro`.

### Phase 2: Shot Decomposition
The Director breaks the scene into N sequential shots, each specifying:
- Action (what happens)
- Camera (angle, movement, framing)
- Lighting conditions
- Environment details
- Transition from previous shot

### Phase 3: Directed Generation Loop
For each shot:
1. **Director writes prompt** — self-contained, incorporating full character bible + shot plan + any drift corrections from previous attempts
2. **Video generation** — `grok-imagine-video` with image anchoring to the previous clip's last frame (or character ref for shot 1)
3. **Frame extraction** — FFmpeg pulls the last frame from the generated clip
4. **Drift analysis** — `grok-2-vision` compares the frame against the character reference on 5 dimensions:
   - Character appearance (0-20)
   - Wardrobe accuracy (0-20)
   - Environment match (0-20)
   - Art style consistency (0-20)
   - Overall continuity (0-20)
5. **Accept/Reject** — if score ≥ threshold, accept and move to next shot. If below, Director rewrites the prompt with drift corrections and retries.

### Phase 4: Assembly
FFmpeg concatenates all accepted clips into a single video. All artifacts (character bible, director log, individual clips, frames, rejected attempts) are saved.

## Models & Costs

| Role | Model | Cost |
|------|-------|------|
| Director LLM | `grok-4-1-fast-non-reasoning` | $0.20/M in, $0.50/M out |
| Vision Analyst | `grok-2-vision-latest` | $2.00/M in, $10.00/M out |
| Video Generator | `grok-imagine-video` | $0.05/second |
| Character Ref | `grok-imagine-image-pro` | $0.07/image |

### Cost Examples

| Config | Shots | Duration | Est. Cost | Actual Cost |
|--------|-------|----------|-----------|-------------|
| Quick test | 3 × 5s | 15s | $0.93 | $0.82 |
| Full scene | 8 × 6s | 48s | $2.68 | $2.48 |
| With retries | 8 × 6s | 48s | Up to $7.80 | — |

## CLI Usage

```bash
# Basic usage
npx tsx src/cli.ts director "scene description" [options]

# Options
--shots <n>       Target shot count (default 8)
--duration <n>    Per-clip seconds, 1-15 (default 6)
--drift <n>       Drift acceptance threshold 0-100 (default 60)
--retries <n>     Max retries per shot (default 2)
--style <style>   Visual style directive
--budget <n>      Max spend in dollars (default 10.0)
--output <dir>    Output directory
--aspect <ratio>  Aspect ratio (default 16:9)

# Examples
npx tsx src/cli.ts director "A woman walks through a neon city" \
  --shots 3 --duration 5 --budget 5 --style "cyberpunk noir"

npx tsx src/cli.ts director "A samurai finds an alien sword on Mars" \
  --shots 8 --duration 6 --budget 10 --drift 55 \
  --style "Samurai Jack, cel-shaded, bold silhouettes"
```

## Output Structure

```
output/director-{timestamp}/
├── character-ref.jpg           # Reference image for drift comparison
├── character-bible.json        # Full character description
├── director-report.json        # Complete pipeline metrics
├── director-log.txt            # Human-readable Director decision log
├── clips/
│   ├── clip-001.mp4           # Accepted final clips
│   ├── clip-002.mp4
│   └── ...
├── frames/
│   ├── shot-001-attempt-1.jpg # Extracted last frames
│   └── ...
├── attempts/
│   ├── shot-001-attempt-1.mp4 # ALL attempts (including rejected)
│   └── ...
└── {scene-name}-final.mp4     # Stitched final video
```

## Architecture

```
src/
├── xai-client.ts    # xAI API client (video, image, chat, vision)
├── director.ts      # LLM Director engine (character bible, shot plan, drift loop)
├── pipeline.ts      # Original "dumb" pipeline (no LLM, script-driven)
├── script-parser.ts # JSON/text script parser for dumb pipeline
├── ffmpeg.ts        # FFmpeg utilities (frame extraction, stitching)
├── cli.ts           # CLI entry point
└── index.ts         # Library exports
```

## Key Design Decisions

- **Single growing conversation**: The Director maintains one conversation thread across the entire pipeline. At 8 shots this is ~50K tokens — cheap at $0.20/M.
- **Self-contained prompts**: Every video generation prompt includes the FULL character description because the video model has no memory between calls.
- **Image anchoring**: Each clip's generation uses the previous clip's URL as `image_url`, anchoring the first frame to maintain visual continuity.
- **Drift tolerance**: Default threshold is 60/100. Lower values (50-55) are more permissive for stylized content. Higher values (70+) enforce strict realism.
- **Budget safety**: Pipeline stops generating if accumulated cost exceeds the budget limit.
- **All attempts preserved**: Even rejected clips are saved in `attempts/` for review.

## Environment

```bash
# Required
export XAI_API_KEY="xai-..."

# Optional: FFmpeg for frame extraction and stitching
sudo apt install ffmpeg
```
