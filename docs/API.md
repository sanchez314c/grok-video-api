# API Reference

Full reference for every exported function and type in `grok-video-api`.

Everything is re-exported from `src/index.ts`. Import from the package root:

```typescript
import { runDirectorPipeline, generateImage, submitVideoGeneration } from "grok-video-api";
```

---

## Director Pipeline

### `runDirectorPipeline(config: DirectorConfig): Promise<DirectorReport>`

The main feature. An LLM film director orchestrates coherent multi-clip video generation across 4 phases: character bible, shot plan, generation loop with drift correction, and final assembly.

**Config:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `scene` | `string` | required | Scene description passed to the director LLM |
| `shots` | `number` | required | Number of shots to generate |
| `duration` | `number` | required | Duration per shot in seconds (1-15) |
| `outputDir` | `string` | required | Directory where all artifacts are saved |
| `style` | `string` | undefined | Visual style directive (e.g., "cyberpunk noir, neon lighting") |
| `driftThreshold` | `number` | 60 | Minimum drift score (0-100) to accept a clip |
| `maxRetries` | `number` | 2 | Max retry attempts per shot before force-accepting |
| `budget` | `number` | 10.0 | Max spend in USD, pipeline stops early if exceeded |
| `aspectRatio` | `AspectRatio` | "16:9" | Video aspect ratio |
| `directorModel` | `string` | "grok-4-1-fast-non-reasoning" | Director LLM model override |
| `visionModel` | `string` | "grok-2-vision-latest" | Vision analysis model override |
| `onProgress` | `OnProgress` | undefined | Callback for real-time progress events |

**Returns: `DirectorReport`**

```typescript
interface DirectorReport {
  scene: string;
  config: DirectorConfig;
  characterBible?: CharacterBible;
  shotPlan?: ShotPlan;
  shots: DirectorShotResult[];
  completedShots: number;
  failedShots: number;
  totalDuration: number;
  totalCost: number;
  outputPath?: string;          // Path to the stitched final video
  characterRefUrl?: string;
  characterRefPath?: string;
  startTime: string;
  endTime: string;
}
```

**Example:**

```typescript
const report = await runDirectorPipeline({
  scene: "A samurai meditates under cherry blossoms, then draws his sword",
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
```

---

## Continuity Pipeline

### `runContinuityPipeline(script: ContinuityScript, options: PipelineOptions): Promise<PipelineReport>`

Script-driven pipeline. No LLM. Takes pre-written clip descriptions and generates them sequentially with image anchoring.

**`PipelineOptions`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `outputDir` | `string` | required | Output directory |
| `maxRetries` | `number` | 2 | Max retries per clip on failure |
| `pollInterval` | `number` | 5000 | Polling interval in ms |
| `pollMaxAttempts` | `number` | 60 | Max polling attempts (timeout = interval * attempts) |
| `onUpdate` | `(msg: string) => void` | undefined | Log callback |

**Returns: `PipelineReport`**

```typescript
interface PipelineReport {
  title: string;
  totalClips: number;
  completedClips: number;
  failedClips: number;
  totalDuration: number;
  outputPath?: string;
  clips: ClipResult[];
  characterRefUrl?: string;
  characterRefPath?: string;
  totalCost: number;
}
```

---

## Video Generation

### `submitVideoGeneration(prompt, duration?, aspectRatio?, imageUrl?): Promise<string>`

Submits a video generation job. Returns the `request_id` for polling.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `string` | required | Text description of the video |
| `duration` | `number` | 6 | Duration in seconds (1-15) |
| `aspectRatio` | `string` | "16:9" | Aspect ratio |
| `imageUrl` | `string` | undefined | Reference image URL for visual anchoring |

### `pollVideoStatus(requestId, onUpdate?, maxPolls?, intervalMs?): Promise<XaiVideoStatusResponse>`

Polls until the video is complete or timeout is hit. Default timeout is 7.5 minutes (90 polls × 5s).

```typescript
const requestId = await submitVideoGeneration("a cat typing", 6);
const result = await pollVideoStatus(requestId, (msg) => console.log(msg));
console.log(result.video?.url);  // temporary hosted URL
```

### `getVideoStatus(requestId): Promise<{ status: number; data: XaiVideoStatusResponse }>`

Single status check. Returns HTTP status 202 (still processing) or 200 (complete).

### `submitVideoEdit(prompt, videoUrl): Promise<string>`

Submit a video editing job. Returns `request_id`.

### `getVideoModels(): Promise<{ models: XaiVideoModel[] }>`

List all available video generation models.

---

## Image Generation

### `generateImage(prompt, model?, aspectRatio?, count?): Promise<XaiImageResponse>`

Generate one or more images.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `string` | required | Text description |
| `model` | `string` | "grok-imagine-image-pro" | Model: `grok-imagine-image` or `grok-imagine-image-pro` |
| `aspectRatio` | `string` | "16:9" | Aspect ratio |
| `count` | `number` | 1 | Number of images (1-10) |

Returns `XaiImageResponse` with a `data` array. Each item has a `url` field.

### `editImage(prompt, imageUrl, model?): Promise<XaiImageResponse>`

Edit an existing image with a text prompt.

---

## Chat and Vision

### `chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse>`

OpenAI-compatible chat completion endpoint.

```typescript
const result = await chatCompletion({
  model: "grok-4-1-fast-non-reasoning",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is the capital of France?" },
  ],
  temperature: 0.7,
  max_tokens: 512,
  response_format: { type: "json_object" },
});

console.log(result.choices[0].message.content);
```

### `visionAnalysis(model, prompt, imageUrls, responseFormat?): Promise<{ content: string; usage }>`

Analyze images with a text prompt. Wraps `chatCompletion` with multi-modal content.

```typescript
const { content } = await visionAnalysis(
  "grok-2-vision-latest",
  "Describe what you see in this image",
  ["https://example.com/image.jpg"],
);
```

---

## FFmpeg Utilities

### `checkFfmpeg(): boolean`

Returns `true` if `ffmpeg` is on PATH.

### `extractLastFrame(videoPath, outputPath): void`

Extracts the last frame of a video as JPEG. Throws `FfmpegError` on failure.

### `extractFirstFrame(videoPath, outputPath): void`

Extracts the first frame of a video as JPEG.

### `concatVideos(videoPaths: string[], outputPath): void`

Concatenates multiple MP4 files into one using FFmpeg concat demuxer. All inputs must have matching codecs and dimensions. Throws `FfmpegError` on failure.

### `getVideoInfo(videoPath): { width, height, duration, codec, fps }`

Returns video metadata via ffprobe.

---

## Script Parser

### `parseScript(raw: string): ContinuityScript`

Parses a JSON or text script into a `ContinuityScript` object.

**JSON format:**
```json
{
  "title": "My Video",
  "characterDescription": "A woman with blue hair in a trench coat",
  "style": "cyberpunk noir",
  "aspectRatio": "16:9",
  "clips": [
    {
      "clipNumber": 1,
      "action": "She walks through the rain toward a glowing door",
      "camera": "wide shot, low angle",
      "lighting": "neon blue and pink reflections",
      "duration": 6
    }
  ]
}
```

**Text format:**
```
Title: My Video
Character: A woman with blue hair in a trench coat
Style: cyberpunk noir

Clip 1
Action: She walks through the rain toward a glowing door
Camera: wide shot, low angle
Lighting: neon blue and pink reflections
Duration: 6
```

### `buildClipPrompt(script, clip, isFirstClip): string`

Builds a video generation prompt string from a script and clip.

---

## Low-Level HTTP

### `xaiRequest<T>(path, method?, body?): Promise<T>`

Authenticated request to `https://api.x.ai/v1{path}`. Throws `XaiApiError` on non-2xx response.

### `xaiRawFetch(path, method?, body?): Promise<Response>`

Same as `xaiRequest` but returns the raw `Response` for status-code-dependent handling (used for video polling where 202 = still pending).

### `getApiKey(): string`

Reads `process.env.XAI_API_KEY`. Throws if missing.

---

## Utilities

### `downloadFile(url, filePath): Promise<void>`

Downloads a URL to a local file path using native fetch.

### `sleep(ms: number): Promise<void>`

Simple Promise-based sleep.

---

## Error Classes

### `XaiApiError`

Thrown by any xAI API call that returns a non-2xx status.

```typescript
try {
  await submitVideoGeneration("prompt");
} catch (err) {
  if (err instanceof XaiApiError) {
    console.log(err.statusCode);   // 429
    console.log(err.retryable);    // true (rate limit or server error)
    console.log(err.responseBody); // raw xAI error response
  }
}
```

Fields: `statusCode`, `method`, `endpoint`, `responseBody`, `retryable`

### `FfmpegError`

Thrown by FFmpeg operations.

Fields: `command`, `stderr`

---

## Progress Events

The `onProgress` callback on `runDirectorPipeline` receives `ProgressEvent` objects:

```typescript
interface ProgressEvent {
  type: "submitted" | "polling" | "processing" | "complete" | "error" | "phase" | "info";
  message: string;
  progress?: number;  // 0-100 when deterministic
  phase?: string;     // e.g. "character-bible", "shot-3", "stitch"
  data?: unknown;
  timestamp: string;
}
```

Useful for WebSocket or SSE integration in web applications.

---

## Provider Interfaces

Abstract interfaces for building multi-provider AI systems. The xAI client implements these contracts.

- `ImageProvider` - `generateImage()`, `editImage()`, `listImageModels()`
- `VideoProvider` - `generateVideo()`, `editVideo()`, `listVideoModels()`
- `LLMProvider` - `chatCompletion()`, `listModels()`
- `VisionProvider` - `analyzeImages()`
- `VoiceProvider` - `synthesize()`, `cloneVoice()`, `listVoices()`
- `UnifiedProvider` - wraps all capability interfaces
- `ProviderRegistry` - manages and queries registered providers

See `src/types.ts` for the full interface definitions.

---

## Type Index

Key exported types:

| Type | Description |
|------|-------------|
| `DirectorConfig` | Config for `runDirectorPipeline` |
| `DirectorReport` | Result from `runDirectorPipeline` |
| `DirectorShotResult` | Per-shot result with drift score and path |
| `CharacterBible` | Structured character description (name, appearance, wardrobe) |
| `ShotPlan` | Array of shot descriptions from the director |
| `DriftScore` | 5-dimension visual drift score (character, wardrobe, environment, style, continuity) |
| `ContinuityScript` | Parsed script for `runContinuityPipeline` |
| `PipelineOptions` | Config for `runContinuityPipeline` |
| `PipelineReport` | Result from `runContinuityPipeline` |
| `ClipResult` | Per-clip result for the continuity pipeline |
| `ProgressEvent` | Event shape for `onProgress` callbacks |
| `AspectRatio` | String union of supported ratios ("16:9", "9:16", "1:1", etc.) |
| `XaiApiError` | Error class for xAI API failures |
| `FfmpegError` | Error class for FFmpeg failures |
