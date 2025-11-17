# Troubleshooting

## API Errors

### `XAI_API_KEY environment variable is not set`

The CLI validates the key before any API calls. Fix:

```bash
export XAI_API_KEY="xai-your-key-here"
```

Or add it to your shell profile (`~/.bashrc`, `~/.zshrc`) for persistence.

---

### `xAI API Authentication (401)`

Your API key is set but invalid or expired. Check:
- The key starts with `xai-`
- You copied it correctly (no trailing spaces)
- The key hasn't been revoked at [console.x.ai](https://console.x.ai)

---

### `xAI API Rate limit (429)`

You've hit the API rate limit. The `XaiApiError.retryable` flag is `true` for 429 errors — you can catch and retry after a delay. The pipeline doesn't auto-retry on rate limits by default.

If this happens mid-pipeline, you'll see an error on a specific shot and the pipeline will continue to the next one (or stop if max retries are exhausted).

---

### `xAI API Server error (5xx)`

xAI API is having issues. These are transient. The `retryable` flag is `true`. Wait a minute and try again.

---

### `Video generation timed out after 450s`

The video job didn't complete within the 7.5-minute timeout (90 polls × 5 seconds). Causes:
- xAI API is under heavy load
- The prompt is complex and generating slowly

Fix: increase the poll timeout in library usage:

```typescript
const result = await pollVideoStatus(requestId, onUpdate, 120, 5000); // 10 minutes
```

Or use `getVideoStatus` in your own loop with custom timeout logic.

---

### `Video generation returned no request_id`

The video submission API returned 200 but without a `request_id` in the response body. This is an xAI API issue. Try again.

---

## FFmpeg Errors

### `FfmpegError: FFmpeg extractLastFrame failed`

Either FFmpeg isn't installed, the video file is corrupted, or ffprobe can't read the duration.

Check FFmpeg is installed:
```bash
ffmpeg -version
ffprobe -version
```

Check the video file exists and is a valid MP4:
```bash
ffprobe -v quiet -print_format json -show_format output/clips/clip-001.mp4
```

If the video file is 0 bytes or corrupted, the download probably failed silently. Re-run the pipeline or re-download manually.

---

### `FfmpegError: concatVideos failed`

Usually means the input clips have different codecs, frame rates, or resolutions. The concat demuxer requires matching formats.

All clips from `grok-imagine-video` should have the same codec and resolution for a given run. If you're manually mixing clips from different runs, re-encode them to a common format first:

```bash
ffmpeg -i clip-001.mp4 -c:v libx264 -preset fast clip-001-reenc.mp4
```

---

### Drift analysis skipped

If you see "FFmpeg not found — drift analysis will be skipped", FFmpeg isn't on your PATH. Install it:

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

The pipeline still runs without FFmpeg; it just auto-accepts every clip without checking for drift.

---

## Build and TypeScript

### `tsc` fails with module resolution errors

Make sure all internal imports use `.js` extensions:

```typescript
// Correct
import { generateImage } from "./xai-client.js";

// Wrong
import { generateImage } from "./xai-client";
```

This is a NodeNext requirement. The `.js` extension refers to the compiled output, not the source file.

---

### `Cannot find module 'tsx'`

Run `npm install` first. `tsx` is a dev dependency.

---

### `ERR_REQUIRE_ESM`

The package is ESM-only (`"type": "module"` in `package.json`). If you're importing it from a CommonJS project:

```javascript
// Use dynamic import in CJS
const { runDirectorPipeline } = await import("grok-video-api");
```

---

## Pipeline Issues

### Character reference image generation fails, pipeline continues

The character ref generation failure is non-fatal. The pipeline logs a warning and continues without a character reference. When there's no character ref:
- Shot 1 has no visual anchor
- Drift analysis is skipped for all shots (no ref to compare against)
- All shots are auto-accepted

This usually happens due to a temporary API error. Re-run the pipeline.

---

### All shots have low drift scores

The vision model is scoring poorly. Possible causes:
- The character reference image doesn't match your style description
- The prompt is too vague for the video model to reproduce consistently
- You're using a style that inherently has high visual variance (e.g., abstract art)

Fixes:
- Lower the `driftThreshold` for abstract or stylized content (try 40-50)
- Make the style description more specific in the director's prompts
- Use photorealistic descriptions for higher drift scores

---

### Final video not created, clips exist individually

Either FFmpeg isn't installed (clips can't be stitched) or fewer than 2 clips completed. Check:

```bash
ffmpeg -version  # is it installed?
ls output/director-{timestamp}/clips/  # how many clips completed?
```

If only 1 clip completed, `report.outputPath` will point to that single clip.

---

### Pipeline stops before completing all shots

Budget was exceeded. The pipeline logs "BUDGET LIMIT — stopping at shot N" and stitches whatever completed.

Increase `--budget` or reduce `--shots` / `--duration`:

```bash
npx tsx src/cli.ts director "scene" --shots 8 --duration 6 --budget 15
```

---

### Output directory already exists

The pipeline uses `mkdirSync({ recursive: true })` and happily writes into existing directories. If you re-run with the same `--output` dir, new files are added and existing files are overwritten. This is intentional for recovery from partial runs.

Use a unique output dir for each run (the default timestamp-based name handles this automatically).

---

## Common Mistakes

**Passing the API key as a CLI argument**

```bash
# Don't do this — shows in shell history and ps output
node dist/cli.js director "scene" --api-key xai-...

# Do this
export XAI_API_KEY="xai-..."
node dist/cli.js director "scene"
```

**Running a large pipeline without a budget cap**

```bash
# This can cost $20+ if there are many retries
npx tsx src/cli.ts director "complex scene" --shots 15 --duration 10

# Always set a budget
npx tsx src/cli.ts director "complex scene" --shots 15 --duration 10 --budget 10
```

**Forgetting .js extensions in internal imports**

See the Build section above. NodeNext requires `.js` extensions in `import` paths even for `.ts` source files.

**Committing `output/` to git**

Generated videos can be hundreds of MB. Add `output/` to your `.gitignore`.
