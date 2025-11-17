# FAQ

## General

**What exactly does this do?**

It generates multi-clip AI videos where all the clips actually look like they belong together. You give it a scene description like "a samurai walks across Mars", and it spins up an LLM to act as a film director. The director writes a character bible, breaks the scene into shots, writes a video prompt for each shot, checks each clip for visual drift, and retries if something looks wrong. When all shots pass, FFmpeg stitches them into a final video.

The problem it solves: video generation APIs are stateless. Call the same API 8 times with the same prompt and you get 8 different samurais on 8 different Mars landscapes. This pipeline fixes that by keeping the director LLM in a single growing conversation across all shots.

**Do I need the director pipeline, or is there a simpler option?**

Yes. The `pipeline` command runs a simpler flow with no LLM. You write the clip descriptions yourself in a JSON or text script file, and the pipeline generates them sequentially with image anchoring (each clip gets the previous clip's last frame as its visual starting point). No drift scoring, no automatic retries.

Use `director` when you want the LLM to handle everything. Use `pipeline` when you have a pre-written storyboard and just want to execute it.

**Does it work without FFmpeg?**

Yes, with limitations. FFmpeg handles two things: extracting the last frame from each clip (needed for drift analysis) and stitching clips into a final video. Without FFmpeg, the director pipeline skips drift analysis (every clip is auto-accepted) and saves clips individually instead of stitching them. You still get the clips, just no quality gating and no merged video.

---

## API and Costs

**How much does this cost?**

Depends on configuration. Quick reference:

| Config | Approx cost |
|--------|-------------|
| 3 shots × 5s, no retries | ~$0.82 |
| 6 shots × 6s, no retries | ~$1.88 |
| 8 shots × 6s, no retries | ~$2.48 |
| 8 shots × 6s, ~1 retry per shot | ~$4.50 |

Video generation ($0.05/second) is where most money goes. The director LLM conversation costs about $0.01-$0.03 per full run at current pricing.

Always set `--budget` so the pipeline stops before you spend more than you want.

**Where do I get an xAI API key?**

Sign up at [console.x.ai](https://console.x.ai). You need credits loaded for video generation, image generation, and chat/vision API access. The API is not free.

**Which models does it use?**

| Role | Model | Cost |
|------|-------|------|
| Director LLM | grok-4-1-fast-non-reasoning | $0.20/M input, $0.50/M output |
| Vision scoring | grok-2-vision-latest | $2.00/M input, $10.00/M output |
| Video | grok-imagine-video | $0.05/second |
| Character ref image | grok-imagine-image-pro | $0.07/image |

You can override the director and vision models via `--director-model` and `--vision-model` (API) or the config options when using the library directly.

**Can I use this without the xAI API?**

No. The tool is built specifically around xAI's Grok models. The provider interfaces in `src/types.ts` are designed for future multi-provider support, but right now everything calls xAI directly.

---

## Director Pipeline

**What drift threshold should I use?**

Depends on your content type:

- Photorealistic humans: 65-75
- Animals: 50-60
- Anime/stylized: 50-55
- Abstract or non-character content: 40-50

Lower thresholds are more permissive. Higher thresholds mean more retries. The default is 60.

**Why does the director use a "growing conversation"?**

The director LLM maintains one message thread across all phases: character bible, shot plan, every prompt write, every drift correction. At 8 shots this hits roughly 50K tokens but costs about $0.01-$0.03 total.

The alternative (fresh context for each shot) would mean the director can't remember what it decided previously, making corrections impossible. If shot 3 drifted and the director rewrote it, it needs to remember what shot 2 looked like to maintain the transition.

**Why do video prompts need to be "self-contained"?**

The video model (`grok-imagine-video`) has no conversation history. It receives one prompt string. That's it. So every prompt the director writes has to include the full character description, wardrobe, environment, camera angle, and lighting — even though the director already has all that context.

The director is explicitly instructed to embed everything every time. Prompts are capped at ~300 words to avoid truncation.

**What happens when a shot fails after max retries?**

The pipeline accepts the best attempt with the lowest drift score anyway (fallback acceptance). The report marks it as `accepted: true` with a note that it was accepted as a fallback. The pipeline doesn't stop unless the budget is exceeded.

**What is "image anchoring"?**

When submitting a video generation request, you can pass an `image_url` parameter. This tells the video model what the first frame should look like. The director uses this as:
- Shot 1: character reference image URL
- Shot 2+: previous accepted clip's video URL

Combined with the director's detailed text prompt, this gives the video model both a visual and textual anchor for continuity.

---

## Technical

**Why zero external runtime dependencies?**

Smaller attack surface, no transitive dependency risk, smaller `node_modules`, easier auditing. The project uses native Node.js `fetch` (available since Node 18), `execSync` for FFmpeg, and `node:fs`/`node:path` for file operations.

Dev dependencies (`tsx`, `typescript`, `@types/node`) are fine because they're never in the published package.

**Can I use this from a web server?**

Yes. Set `XAI_API_KEY` as a server environment variable. Use the `onProgress` callback for SSE or WebSocket streaming. Give each request its own `outputDir`. See `docs/DEPLOYMENT.md` for security considerations when user input reaches the pipeline.

**Does TypeScript strict mode matter?**

Yes. No `any` types, no `@ts-ignore`, everything typed. If you're extending the codebase, follow the same standard. The build will fail with type errors, which is intentional.

**The polling takes forever. What's happening?**

Video generation via the xAI API is asynchronous. The API queues the job and you poll for status. Each poll is 5 seconds. The default timeout is 7.5 minutes (90 polls). If generation takes longer than that, `pollVideoStatus` throws a timeout error.

In practice, most clips complete in 30-90 seconds. If you're consistently timing out, check your API quota or try a shorter duration.

**Why does `pipeline.ts` and `director.ts` both exist?**

Two different use cases with different complexity levels:

- `pipeline.ts` is deterministic. You write the prompts, it executes them. Good for storyboards and when you want full control.
- `director.ts` is generative. You give it a scene description and it decides everything. Good for rapid prototyping and when you want the LLM to make creative decisions.

They share the same `xai-client.ts` for API calls and `ffmpeg.ts` for video processing.

---

## Output

**Where do my videos go?**

Default: `output/director-{timestamp}/` (or `output/pipeline-{timestamp}/` for the script pipeline). Override with `--output <dir>`.

The directory structure:
```
output/director-{timestamp}/
  character-ref.jpg           Character reference image
  character-bible.json        Structured character data
  director-report.json        Full pipeline report with costs and drift scores
  director-log.txt            Human-readable director decision log
  clips/                      Accepted final clips
  frames/                     Extracted frames used for drift analysis
  attempts/                   All generation attempts, including rejected ones
  {scene-name}-final.mp4      Stitched final video
```

**The `output/` directory is getting huge. Is it gitignored?**

Yes, via `.npmignore`. But you should also add it to your `.gitignore` if you've cloned the repo, otherwise you might accidentally commit hundreds of MB of video files.

**Can I access the intermediate attempts?**

Yes. The `attempts/` subdirectory inside each output folder keeps every generation attempt, including rejected ones. The `frames/` subdirectory has extracted last frames from each attempt.

The `director-report.json` has per-shot drift scores, attempt counts, and which video URLs were accepted.
