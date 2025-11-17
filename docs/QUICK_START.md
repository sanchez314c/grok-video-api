# Quick Start

Clone to running video in 5 minutes.

## 1. Clone

```bash
git clone https://github.com/sanchez314c/grok-video-api.git
cd grok-video-api
```

## 2. Install

```bash
npm install
```

Installs only dev tools (TypeScript, tsx, @types/node). No runtime dependencies.

## 3. Get an xAI API Key

Sign up at [console.x.ai](https://console.x.ai), create an API key, and load credits. You'll need at least a few dollars for the test below.

## 4. Set the Key

```bash
export XAI_API_KEY="xai-your-key-here"
```

## 5. Run the Director Pipeline

```bash
npx tsx src/cli.ts director \
  "A cat sits at a desk, looks at the laptop screen, then slowly turns to look at the camera" \
  --shots 3 --duration 5 --budget 2 \
  --style "photorealistic, iPhone camera footage, natural home lighting"
```

This costs about $0.85 and takes 3-5 minutes.

## 6. Check Your Output

```
output/director-{timestamp}/
  character-ref.jpg       <- Character reference image
  character-bible.json    <- Structured character description
  director-report.json    <- Full pipeline report with costs and drift scores
  clips/                  <- Accepted clips
  {scene-name}-final.mp4  <- Stitched final video (if FFmpeg is installed)
```

That's it. You have a multi-clip AI video where all shots look like the same cat.

---

## Optional: Install FFmpeg

FFmpeg enables frame extraction (for drift scoring) and clip stitching (final merged video). Without it, you still get clips but no merged video and no quality gating.

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

---

## Optional: Use as a Library

```bash
npm install grok-video-api
```

```typescript
import { runDirectorPipeline } from "grok-video-api";

const report = await runDirectorPipeline({
  scene: "A samurai walks through falling cherry blossoms",
  shots: 4,
  duration: 6,
  style: "anime, cel-shaded",
  driftThreshold: 55,
  maxRetries: 2,
  budget: 4.00,
  outputDir: "./output/samurai",
});

console.log(`Final video: ${report.outputPath}`);
console.log(`Cost: $${report.totalCost.toFixed(2)}`);
```

---

## Style Tips

These produce the most consistent results based on 11+ production runs:

**Best results:** Photorealistic descriptions. "A real tabby cat with amber eyes and white chest markings, shot on iPhone" scores higher on drift than "a cute anime cat character with blue eyes."

**Light style touches:** "Handheld camera, natural lighting" beats a 50-word cinematic prescription. The video model over-processes competing directives.

**Drift threshold by content:**
- Photorealistic humans: 65-75
- Animals: 50-60
- Anime/stylized: 50-55
- Abstract: 40-50
