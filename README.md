# grok-video-api

An LLM film director that orchestrates coherent multi-clip AI video generation using xAI's Aurora video model. It writes prompts, analyzes visual drift between clips, corrects course, and maintains character/style/scene consistency across sequential shots -- all through a single growing conversation with a director LLM.

The core problem: every API call to a video model is stateless. Generate 8 clips of "a samurai walking across Mars" and you'll get 8 different-looking samurais on 8 different landscapes. This pipeline fixes that by putting an LLM in the director's chair. The video model never learns, but the director never forgets.

## Features

- **Director Pipeline** -- LLM writes all video prompts, maintains a character bible, decomposes scenes into shot plans, and scores each clip for visual drift before accepting it
- **Character Bible Generation** -- structured JSON output with physical description, wardrobe, distinguishing features, color palette, and art style
- **Visual Drift Detection** -- vision model compares each generated frame against the character reference across 5 dimensions (character, wardrobe, environment, style, continuity) scored 0-100
- **Automatic Retry with Corrections** -- when a clip drifts too far, the director rewrites the prompt incorporating specific drift feedback
- **Image Anchoring** -- each clip uses the previous clip's video URL as a visual anchor for the first frame
- **Budget Tracking** -- real-time cost tracking with automatic cutoff when budget is exceeded
- **Script-Driven Pipeline** -- alternative non-LLM pipeline that takes a JSON or text script with pre-written clip descriptions
- **FFmpeg Integration** -- frame extraction, video concatenation, and metadata probing
- **Progress Callbacks** -- `onProgress` events for WebSocket/SSE integration in web apps
- **Provider Interfaces** -- abstract TypeScript interfaces (`ImageProvider`, `VideoProvider`, `LLMProvider`, `VisionProvider`, `VoiceProvider`) for building multi-provider systems
- **Zero Runtime Dependencies** -- uses native Node.js `fetch`, no external packages needed at runtime

## Tech Stack

- **Language**: TypeScript (strict mode, ESM modules, NodeNext resolution)
- **Runtime**: Node.js 18+
- **AI Models**: xAI Grok (video, image, chat, vision)
- **Video Processing**: FFmpeg (optional)
- **Build**: `tsc` to `dist/`, run from source with `tsx`
- **Package**: npm-publishable with CLI binary (`grok-video`)

## How It Works

```
Scene Description ("A samurai walks across Mars")
       |
       v
+---------------------------------------------+
|  Phase 1: CHARACTER BIBLE                    |
|  Director LLM builds a JSON character bible  |
|  (appearance, wardrobe, features, palette)   |
|  + generates a reference image               |
+----------------------+-----------------------+
                       |
                       v
+---------------------------------------------+
|  Phase 2: SHOT PLAN DECOMPOSITION            |
|  Director breaks the scene into N shots      |
|  (action, camera, lighting, environment,     |
|  transitions between shots)                  |
+----------------------+-----------------------+
                       |
                       v
+---------------------------------------------+
|  Phase 3: PER-SHOT GENERATION LOOP           |
|  For each shot:                              |
|    1. Director writes a self-contained prompt|
|    2. Submit to grok-imagine-video           |
|    3. Extract last frame via FFmpeg          |
|    4. Vision model scores drift (0-100)      |
|    5. Accept or retry with drift corrections |
+----------------------+-----------------------+
                       |
                       v
+---------------------------------------------+
|  Phase 4: FINAL ASSEMBLY                     |
|  FFmpeg stitches accepted clips into one     |
|  video. Saves report, director log, and all  |
|  artifacts (attempts, frames, bible)         |
+---------------------------------------------+
```

## Installation

```bash
# Clone the repo
git clone https://github.com/sanchez314c/grok-video-api.git
cd grok-video-api

# Install dev dependencies (tsx, typescript, @types/node)
npm install
```

**Optional but recommended**: install FFmpeg for frame extraction and video stitching.

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

Without FFmpeg, the pipeline still works but skips drift analysis and won't stitch clips together.

## Configuration

The only required config is your xAI API key:

```bash
export XAI_API_KEY="xai-your-key-here"
```

Get one at [console.x.ai](https://console.x.ai).

### Models Used

| Role | Model | Cost |
|------|-------|------|
| Director LLM | `grok-4-1-fast-non-reasoning` | $0.20/M input, $0.50/M output |
| Vision (drift) | `grok-2-vision-latest` | $2.00/M input, $10.00/M output |
| Video Generation | `grok-imagine-video` | $0.05/second |
| Character Ref Image | `grok-imagine-image-pro` | $0.07/image |

You can override the director and vision models via `--director-model` and `--vision-model` flags or the corresponding config options in the API.

## Usage

### CLI -- Director Pipeline

The main feature. Give it a scene description and it handles everything.

```bash
# Quick test (~$0.82)
npx tsx src/cli.ts director \
  "A cat sits at a desk, looks at a laptop, then looks at the camera" \
  --shots 3 --duration 5 --budget 2 \
  --style "photorealistic, iPhone camera, natural lighting"

# Full production (~$2.50)
npx tsx src/cli.ts director \
  "A samurai in white armor walks across a red Martian desert, discovers an alien temple, enters, finds a glowing sword" \
  --shots 8 --duration 6 --budget 10 --drift 55 \
  --style "Samurai Jack cel-shaded, bold outlines, flat color fills"
```

#### Director Options

```
--shots <n>        Number of shots to generate (default: 8)
--duration <n>     Seconds per shot, 1-15 (default: 6)
--drift <n>        Drift acceptance threshold, 0-100 (default: 60)
--retries <n>      Max retries per shot on drift failure (default: 2)
--style <text>     Visual style directive passed to the director
--budget <n>       Max spend in USD (default: 10.00)
--output <dir>     Output directory (default: output/director-{timestamp})
--aspect <ratio>   Aspect ratio (default: 16:9)
```

#### Output Structure

```
output/director-{timestamp}/
  character-ref.jpg           # Character reference image
  character-bible.json        # Structured character description
  director-report.json        # Full pipeline metrics, costs, drift scores
  director-log.txt            # Human-readable log of every director decision
  clips/clip-001.mp4 ...      # Accepted final clips
  frames/                     # Extracted last frames (used for drift analysis)
  attempts/                   # All generation attempts including rejected ones
  {scene-name}-final.mp4      # Stitched final video
```

### CLI -- Other Commands

```bash
# Generate a single video clip
npx tsx src/cli.ts generate "a cat typing at a computer" --duration 6 --aspect 16:9

# Generate an image
npx tsx src/cli.ts image "cyberpunk cityscape at night" --model grok-imagine-image-pro

# Run a script-driven pipeline (no LLM, pre-written prompts)
npx tsx src/cli.ts pipeline script.json --output ./output/my-video

# Check video generation status
npx tsx src/cli.ts status <request-id>

# Edit an existing video
npx tsx src/cli.ts edit <video-url> "add rain and neon reflections"

# List available video models
npx tsx src/cli.ts models
```

### CLI Command Reference

| Command | Aliases | Description |
|---------|---------|-------------|
| `director <scene>` | `direct` | LLM-directed multi-clip video pipeline |
| `pipeline <script>` | -- | Script-driven continuity pipeline (no LLM) |
| `generate <prompt>` | `gen`, `video` | Single video clip generation |
| `image <prompt>` | `img` | Image generation |
| `status <id>` | `poll` | Check video generation status |
| `edit <url> <prompt>` | -- | Edit an existing video |
| `models` | -- | List available video generation models |

### Library Usage

Everything is exported from the package root for use as a library:

```typescript
import {
  runDirectorPipeline,
  generateImage,
  submitVideoGeneration,
  pollVideoStatus,
  chatCompletion,
  visionAnalysis,
} from "grok-video-api";

// Director Pipeline -- LLM-directed multi-clip video
const report = await runDirectorPipeline({
  scene: "A samurai meditates under cherry blossoms, then draws his sword as enemies approach",
  shots: 5,
  duration: 6,
  style: "anime, Samurai Jack inspired",
  driftThreshold: 60,
  maxRetries: 2,
  budget: 5.00,
  outputDir: "./output/samurai-scene",
  onProgress: (event) => {
    console.log(`[${event.phase}] ${event.message} (${event.progress}%)`);
  },
});

console.log(`Final video: ${report.outputPath}`);
console.log(`Cost: $${report.totalCost.toFixed(2)}`);

// Single image
const image = await generateImage("portrait of a hacker", "grok-imagine-image-pro", "16:9");
console.log(image.data[0].url);

// Single video (async polling)
const requestId = await submitVideoGeneration("a cat at a desk, typing", 6);
const result = await pollVideoStatus(requestId, (msg) => console.log(msg));
console.log(result.video?.url);
```

### Provider Interfaces

The package exports abstract provider interfaces for building multi-provider AI systems:

```typescript
import type {
  ImageProvider,
  VideoProvider,
  LLMProvider,
  VisionProvider,
  VoiceProvider,
  UnifiedProvider,
  ProviderRegistry,
} from "grok-video-api";
```

These define a common contract so you can swap xAI for OpenAI, Google, Runway, etc. behind the same interface.

## Cost Estimates

| Scenario | Config | Estimated Cost |
|----------|--------|---------------|
| Quick test | 3 shots x 5s, no retries | ~$0.82 |
| Standard scene | 6 shots x 6s, no retries | ~$1.88 |
| Full production | 8 shots x 6s, no retries | ~$2.48 |
| Full with retries | 8 shots x 6s, ~1 retry/shot | ~$4.50 |
| Worst case | 8 shots x 6s, 2 retries each | ~$7.50 |

The director LLM conversation is basically free (~$0.01-0.03 per run). Video generation ($0.05/sec) is where the money goes.

## Project Structure

```
src/
  index.ts           # Public exports (19 functions, 14+ types)
  xai-client.ts      # xAI API client -- fetch-based, no dependencies
  director.ts        # LLM Director pipeline (~760 LOC)
  pipeline.ts        # Script-driven pipeline (no LLM)
  script-parser.ts   # JSON and text script parsing
  ffmpeg.ts          # FFmpeg wrappers (frame extraction, concat, probe)
  cli.ts             # CLI entry point
  types.ts           # Provider interfaces
```

## Building

```bash
# Compile TypeScript to dist/
npm run build

# Run from source (no build needed)
npx tsx src/cli.ts <command>
```

## Style Tips

Some things learned from 11+ production runs:

- **"Real" prompting beats stylized prompting.** Describe what something IS ("real fur, whiskers, real cat eyes, someone filming with their phone") rather than what it LOOKS LIKE. Highest drift scores came from photorealistic runs.
- **Light style touches work better than heavy ones.** "Handheld camera, natural lighting" outperforms a 50-word cinematic prescription. The video model over-processes when given too many competing directives.
- **Drift threshold should match content type.** Photorealistic humans need 65-75. Animals and anime can go 50-55. Abstract content works at 40-50.

## License

MIT -- see [LICENSE](LICENSE) for details.

Copyright (c) 2026 Jason Paul Michaels
