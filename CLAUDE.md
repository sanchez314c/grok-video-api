# CLAUDE.md - AI Assistant Context

## What This Project Is

`grok-video-api` is a TypeScript library and CLI for generating coherent multi-clip AI videos using xAI's Grok models (Aurora). The core feature is the "Director Pipeline": an LLM acts as a film director, writing prompts, maintaining character consistency across clips, and scoring visual drift. The video model itself is stateless (no memory between clips), but the director LLM keeps a single growing conversation that never forgets.

It also works as a simpler tool for one-off image generation, single video clips, and script-driven pipelines without any LLM involvement.

## Tech Stack

- **Node.js 18+** with native `fetch` (no HTTP libraries)
- **TypeScript** in strict mode, ESM modules, NodeNext resolution
- **Zero runtime dependencies**. Dev deps are just `typescript`, `tsx`, and `@types/node`
- **xAI API models**: `grok-imagine-video` (video), `grok-imagine-image-pro` (images), `grok-4-1-fast-non-reasoning` (director LLM), `grok-2-vision-latest` (drift analysis)
- **FFmpeg** (optional) for frame extraction and clip stitching
- **Build**: `tsc` compiles `src/` to `dist/`. Run from source with `tsx`

## File Structure

```
src/
  index.ts           Public API surface. Re-exports everything consumers need (19 functions, 14+ types)
  xai-client.ts      Raw xAI API client. All fetch calls go through xaiRequest(). ~330 LOC
  director.ts        The Director Pipeline. 4-phase LLM-orchestrated video generation. ~790 LOC. This is the main feature.
  pipeline.ts        Script-driven pipeline. No LLM, uses pre-written prompts from a script file. ~240 LOC
  script-parser.ts   Parses JSON or simplified text format into ContinuityScript objects. ~120 LOC
  ffmpeg.ts          FFmpeg/FFprobe wrappers: frame extraction, concat, video info. ~170 LOC
  cli.ts             CLI entry point. 7 commands: director, pipeline, generate, image, status, edit, models. ~380 LOC
  types.ts           Provider interfaces (ImageProvider, VideoProvider, LLMProvider, VisionProvider, VoiceProvider). Designed for multi-provider systems.
```

Other directories:
- `dist/` - compiled JS output (don't edit these)
- `output/` - default location for generated videos, frames, reports
- `dev/` - development utilities
- `archive/` - backups
- `docs/` - documentation
- `.github/` - GitHub templates and workflows

## Key Commands

```bash
# Build TypeScript to dist/
npm run build

# Run the compiled CLI
node dist/cli.js director "a woman walks through rain" --shots 3 --budget 2

# Run from source (no build needed)
npx tsx src/cli.ts director "a woman walks through rain" --shots 3 --budget 2
npx tsx src/cli.ts generate "a cat sleeping on a keyboard" --duration 6
npx tsx src/cli.ts image "mountain sunset" --model grok-imagine-image-pro --count 2
npx tsx src/cli.ts pipeline script.json --output ./my-video
npx tsx src/cli.ts status <request-id>
npx tsx src/cli.ts edit <video-url> "make it rain"
npx tsx src/cli.ts models

# npm script shortcuts
npm run pipeline -- script.json
npm run generate -- "prompt here"
npm run image -- "prompt here"
```

## Environment

One environment variable is required: `XAI_API_KEY`. Get one at https://console.x.ai

The CLI validates the key exists before making any API calls. If it's missing, the process exits immediately with an error.

## Architecture: Director Pipeline (4 Phases)

This is the main feature. It lives in `src/director.ts`.

**Phase 1 - Character Bible**: The Director LLM generates a structured JSON describing the main character (appearance, wardrobe, features, color palette, art style). Then it generates a reference image using `grok-imagine-image-pro`.

**Phase 2 - Shot Plan**: The Director decomposes the scene into N sequential shots. Each shot gets action, camera angle, lighting, environment, and transition notes.

**Phase 3 - Generation Loop**: For each shot:
1. Director writes a self-contained video prompt (must include full character description since the video model has no memory)
2. Submits to `grok-imagine-video` with the previous clip's URL as `image_url` anchor
3. FFmpeg extracts the last frame
4. Vision model (`grok-2-vision-latest`) compares the frame against the character reference, scores drift 0-100
5. If score >= threshold, accept. If not, feed drift feedback back to the Director and retry.

**Phase 4 - Assembly**: FFmpeg concatenates all accepted clips into one video. Saves the report JSON and director log.

## Important Architectural Decisions

**Single growing conversation**: The `DirectorConversation` class keeps one message thread across the entire pipeline. Every prompt write, every drift correction, every shot plan revision stays in context. At 8 shots this hits ~50K tokens but costs only $0.01-0.03 in LLM fees.

**Self-contained prompts**: Every video generation prompt must include the full character description because the video model is stateless. The Director LLM is instructed to do this explicitly.

**Image anchoring**: Each clip passes the previous clip's video URL as the `image_url` parameter. This gives the video model a visual starting point for continuity.

**Budget enforcement**: The pipeline tracks cumulative cost in USD and stops early if the budget cap is hit. Cost estimates appear in the CLI output before generation starts.

**Zero runtime deps**: All HTTP goes through native `fetch`. No axios, no node-fetch, no got. This keeps the dependency tree empty and the attack surface small.

**Graceful FFmpeg degradation**: If FFmpeg isn't installed, the pipeline still works. It just can't extract frames (so no drift analysis) and can't stitch clips together. Individual clips are still saved.

**Provider interfaces**: `types.ts` defines abstract interfaces (ImageProvider, VideoProvider, LLMProvider, etc.) so this library can be swapped into multi-provider systems. The xAI client implements these contracts, but consumers could add OpenAI, Runway, or other backends.

## Things to Watch Out For

- **FFmpeg execSync**: `src/ffmpeg.ts` shells out with `execSync`. File paths are interpolated into the command string. Safe for CLI use, but if you expose this via a web API, sanitize paths.
- **No .env loader**: The project reads `process.env` directly. If you want `.env` file support, you need to load it yourself (e.g., `dotenv`) before calling the library.
- **Polling loops**: Video generation is async. `pollVideoStatus()` polls every 5 seconds, up to 90 times (7.5 minutes). Long-running generation can block for a while.
- **Cost adds up fast**: Video is $0.05/second. A 10-shot, 6-second pipeline with retries can easily cost $5+. Always set `--budget`.
- **Vision model costs**: Drift analysis sends two base64-encoded images per check. At ~$0.02 per analysis, this is cheap per-shot but adds up with retries.
- **The `output/` directory** is not gitignored by default in all setups. Generated content can be large. Don't accidentally commit hundreds of MB of video.
- **No test framework**: Testing is done with real API calls. A minimal 2-shot test costs about $0.40.

## Cost Reference

| Operation | Price |
|-----------|-------|
| Video generation | $0.05/second |
| Image generation | $0.07/image |
| Director LLM (grok-4-1-fast) | $0.20/M input, $0.50/M output |
| Vision (grok-2-vision) | $2.00/M input, $10.00/M output |

A typical 8-shot, 6-second Director Pipeline run costs $2.50-$5.00 depending on retries.
