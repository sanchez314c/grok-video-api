# Product Requirements Document — grok-video-api

**Version**: 0.1.1
**Generated**: 2026-03-22
**Source**: Full X-ray of all source files + development docs

---

## Executive Summary

`grok-video-api` solves the fundamental statefulness problem in AI video generation. Every call to a video model is stateless — each clip is generated in isolation with no memory of what came before. Generate 8 clips of the same character and you get 8 different-looking people in 8 different environments.

The solution is the **Director Pipeline**: an LLM acts as a film director that maintains a single growing conversation across all phases of production. It writes a structured character bible, decomposes the scene into sequential shots, generates a self-contained video prompt for each shot (embedding the full character description since the video model is stateless), analyzes each generated clip for visual drift, and rewrites prompts with specific corrections when clips diverge. The video model never learns. The director never forgets.

Built as both a CLI tool (7 commands, zero setup beyond an API key) and a TypeScript library (19 exported functions, 14+ types) for embedding in larger pipelines. Zero external runtime dependencies — all HTTP uses native Node.js `fetch`.

Validated across 11 production runs totaling ~$23.65 in API spend, 67 shots generated, with drift scores typically 72-88 on photorealistic content.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Language | TypeScript 5.7, strict mode | ES2022 target, NodeNext module resolution |
| Runtime | Node.js 18+ | Required for native `fetch` |
| AI: Video | `grok-imagine-video` (xAI Aurora) | $0.05/sec, 1-15s clips, 848x480 H.264 24fps |
| AI: Image | `grok-imagine-image-pro` | $0.07/image, character reference generation |
| AI: Director LLM | `grok-4-1-fast-non-reasoning` | $0.20/M input, $0.50/M output |
| AI: Vision | `grok-2-vision-latest` | $2.00/M input, $10.00/M output, drift scoring |
| Video Processing | FFmpeg + FFprobe (optional) | Frame extraction, clip concatenation, metadata probing |
| HTTP | Native Node.js `fetch` | Zero external HTTP dependencies |
| Build | TypeScript compiler (`tsc`) | `src/` → `dist/`, declaration files generated |
| Dev Runner | `tsx` 4.19+ | Run from source without build step |
| Package | npm (ESM-only, `"type": "module"`) | Publishable with `grok-video` CLI binary |

---

## Architecture Overview

The codebase is organized as a flat module structure under `src/` with clear separation of concerns:

```
src/
  index.ts          Public API surface — re-exports all 19 functions and 14+ types
  xai-client.ts     xAI API client — all fetch calls, zero external dependencies
  director.ts       LLM Director Pipeline — the main feature (~806 LOC)
  pipeline.ts       Script-driven Continuity Pipeline — no LLM (~248 LOC)
  script-parser.ts  JSON and text script parsing (~129 LOC)
  ffmpeg.ts         FFmpeg/FFprobe wrappers (~181 LOC)
  cli.ts            CLI entry point — 7 commands (~391 LOC)
  types.ts          Abstract provider interfaces (~368 LOC)
```

### Director Pipeline (4-Phase Sequence)

```
User Input: scene + shots + duration + style + budget
                       |
          ┌────────────v─────────────┐
          │   Phase 1: CHARACTER BIBLE│
          │   Director LLM (JSON mode)│
          │   → physicalDescription  │
          │   → wardrobe             │
          │   → distinguishingFeatures│
          │   → colorPalette[]       │
          │   → artStyle             │
          │   + grok-imagine-image-pro│
          │   → character-ref.jpg    │
          └────────────+─────────────┘
                       |
          ┌────────────v─────────────┐
          │   Phase 2: SHOT PLAN     │
          │   Director decomposes    │
          │   scene into N shots:    │
          │   → action               │
          │   → camera angle         │
          │   → lighting             │
          │   → environment          │
          │   → transition notes     │
          └────────────+─────────────┘
                       |
          ┌────────────v─────────────┐
          │   Phase 3: GENERATION    │
          │   For each shot:         │
          │   1. Director writes     │
          │      self-contained      │
          │      video prompt        │
          │   2. Submit to Aurora    │
          │      (with prev clip URL │
          │      as image anchor)    │
          │   3. Poll until complete │
          │   4. FFmpeg: last frame  │
          │   5. Vision scores drift │
          │      (0-100, 5 dims)     │
          │   6. Accept or retry     │
          │      with corrections    │
          └────────────+─────────────┘
                       |
          ┌────────────v─────────────┐
          │   Phase 4: ASSEMBLY      │
          │   FFmpeg concat demuxer  │
          │   → {scene}-final.mp4    │
          │   + director-report.json │
          │   + director-log.txt     │
          └──────────────────────────┘
```

### Key Architectural Decisions

**Single growing conversation**: `DirectorConversation` maintains one `ChatMessage[]` array across the entire pipeline. Every character bible, shot plan, prompt write, and drift correction stays in context. At 8 shots this is ~50K tokens but costs ~$0.01-0.03 total.

**Self-contained video prompts**: Despite the Director having full context, every video prompt it writes must embed the complete character description from scratch. The Aurora video model has no memory between calls.

**Image anchoring**: Each clip submission passes the previous clip's video URL (or character reference image for shot 1) as the `image_url` parameter. This gives Aurora a visual first-frame anchor for continuity.

**Budget enforcement**: Cumulative USD cost is tracked across all API calls (video gen + image gen + LLM tokens + vision analysis) with a configurable cap. Pipeline stops early if the cap is exceeded.

**Graceful FFmpeg degradation**: If FFmpeg is absent, drift analysis is skipped (clips are auto-accepted) and stitching is skipped (individual clips still saved). The pipeline completes in a degraded but functional state.

**Zero runtime deps**: No axios, no node-fetch, no dotenv. The only runtime requirement beyond Node.js built-ins is an xAI API key.

---

## Data Models

### Provider Interfaces (`src/types.ts`)

Abstract interfaces designed for multi-provider systems. xAI implements these; other providers can be swapped in behind the same contract.

```typescript
// Identity
interface ProviderInfo {
  id: string; name: string; website: string; capabilities: ProviderCapability[];
}
type ProviderCapability = "image-generation" | "image-editing" | "video-generation" |
  "video-editing" | "chat" | "vision" | "voice-synthesis" | "voice-cloning" | "transcription";

// Cost tracking
interface OperationCost {
  totalUsd: number;
  breakdown?: Record<string, number>;
  tokens?: { input: number; output: number };
}

// Progress events (for WebSocket/SSE integration)
interface ProgressEvent {
  type: "submitted" | "polling" | "processing" | "complete" | "error" | "phase" | "info";
  message: string;
  progress?: number;   // 0-100
  phase?: string;
  data?: unknown;
  timestamp: string;   // ISO 8601
}
type OnProgress = (event: ProgressEvent) => void;

// Image
interface ImageGenerationOptions {
  prompt: string; model?: string; aspectRatio?: AspectRatio;
  count?: number; quality?: "standard" | "hd"; style?: string;
  size?: { width: number; height: number }; responseFormat?: "url" | "base64";
}
interface ImageResult {
  url: string; revisedPrompt?: string; base64?: string;
  width?: number; height?: number; cost: OperationCost;
  metadata?: Record<string, unknown>;
}
interface ImageProvider {
  readonly providerId: string; readonly providerName: string;
  generateImage(options: ImageGenerationOptions): Promise<ImageResult[]>;
  editImage(options: ImageEditOptions): Promise<ImageResult>;
  listImageModels(): Promise<Array<{ id: string; name: string; costPerImage: number }>>;
}

// Video
interface VideoGenerationOptions {
  prompt: string; model?: string; duration?: number; aspectRatio?: AspectRatio;
  imageUrl?: string; videoUrl?: string; onProgress?: OnProgress;
}
interface VideoResult {
  url: string; duration: number; requestId?: string;
  cost: OperationCost; metadata?: Record<string, unknown>;
}
interface VideoProvider {
  readonly providerId: string; readonly providerName: string;
  generateVideo(options: VideoGenerationOptions): Promise<VideoResult>;
  editVideo(options: VideoEditOptions): Promise<VideoResult>;
  listVideoModels(): Promise<Array<{ id: string; name: string; costPerSecond: number; maxDuration: number }>>;
}

// LLM
interface ChatCompletionOptions {
  model: string; messages: ChatMessage[]; temperature?: number;
  maxTokens?: number; responseFormat?: { type: "text" | "json_object" }; stream?: boolean;
}
interface ChatResult {
  content: string; finishReason: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  cost: OperationCost; metadata?: Record<string, unknown>;
}

// Vision
interface VisionAnalysisOptions {
  model: string; prompt: string; imageUrls: string[];
  responseFormat?: { type: "text" | "json_object" };
}

// Unified (compose multiple capabilities)
interface UnifiedProvider {
  readonly info: ProviderInfo;
  readonly image?: ImageProvider;
  readonly video?: VideoProvider;
  readonly llm?: LLMProvider;
  readonly vision?: VisionProvider;
  readonly voice?: VoiceProvider;
}
```

### Director Pipeline Types (`src/director.ts`)

```typescript
interface DirectorConfig {
  scene: string;           // Scene description (user input)
  shots: number;           // Target shot count (default: 8)
  duration: number;        // Seconds per clip (1-15, default: 6)
  style?: string;          // Visual style directive
  driftThreshold: number;  // Acceptance score 0-100 (default: 60)
  maxRetries: number;      // Max retries per shot (default: 2)
  budget: number;          // USD cap (default: 10.00)
  outputDir: string;       // Output directory path
  aspectRatio?: string;    // "16:9", "9:16", "1:1", etc.
  directorModel?: string;  // Override director LLM
  visionModel?: string;    // Override vision model
  onProgress?: OnProgress; // WebSocket/SSE callback
  sourceImageUrl?: string; // Skip character-ref generation, use this URL
}

interface CharacterBible {
  name: string;
  physicalDescription: string;    // Face, build, skin, hair, eyes
  wardrobe: string;               // Every garment, color, texture, accessories
  distinguishingFeatures: string; // Tattoos, scars, jewelry — must stay consistent
  colorPalette: string[];         // Hex color values
  artStyle: string;               // Visual style directive for rendering
}

interface ShotPlan {
  shots: Array<{
    shotNumber: number;
    action: string;               // What happens in this shot
    camera: string;               // Angle, movement, framing
    lighting: string;             // Light sources, mood
    environment: string;          // Background and setting
    transitionFromPrevious: string;
  }>;
}

interface DriftScore {
  character: number;   // 0-20: physical appearance match
  wardrobe: number;    // 0-20: clothing/accessories match
  environment: number; // 0-20: scene/setting appropriateness
  style: number;       // 0-20: art style consistency
  continuity: number;  // 0-20: overall coherence with reference
  total: number;       // 0-100: sum
  notes: string;       // Drift issues detected
}

interface DirectorShotResult {
  shotNumber: number; accepted: boolean; attempts: number;
  videoUrl?: string; localPath?: string; lastFramePath?: string;
  prompt: string; driftScore?: DriftScore; error?: string;
}

interface DirectorReport {
  scene: string; config: DirectorConfig;
  characterBible?: CharacterBible; shotPlan?: ShotPlan;
  shots: DirectorShotResult[];
  completedShots: number; failedShots: number;
  totalDuration: number; totalCost: number;
  outputPath?: string; characterRefUrl?: string; characterRefPath?: string;
  startTime: string; endTime: string;
}

interface DirectorLogEntry {
  timestamp: string; phase: string; message: string; data?: unknown;
}
```

### Continuity Pipeline Types (`src/pipeline.ts`)

```typescript
interface ClipResult {
  clipNumber: number; requestId: string;
  videoUrl?: string; localPath?: string; lastFramePath?: string;
  status: "pending" | "generating" | "complete" | "failed";
  error?: string; attempts: number;
}

interface PipelineReport {
  title: string; totalClips: number;
  completedClips: number; failedClips: number;
  totalDuration: number; outputPath?: string;
  clips: ClipResult[];
  characterRefUrl?: string; characterRefPath?: string;
  totalCost: number;
}

interface PipelineOptions {
  outputDir: string; maxRetries?: number;
  pollInterval?: number; pollMaxAttempts?: number;
  onUpdate?: (msg: string) => void;
}
```

### Script Types (`src/script-parser.ts`)

```typescript
interface ScriptClip {
  clipNumber: number; action: string;
  camera: string; lighting: string;
  dialogue?: string; duration: number;
}

interface ContinuityScript {
  title: string; characterDescription: string;
  style: string; aspectRatio: string;
  clips: ScriptClip[];
}
```

### xAI API Response Types (`src/xai-client.ts`)

```typescript
interface XaiImageResponse {
  data: Array<{ url?: string; revised_prompt?: string; b64_json?: string }>;
}
interface XaiVideoSubmitResponse { request_id: string; }
interface XaiVideoStatusResponse {
  status?: "pending";
  video?: { url: string; duration: number; respect_moderation: boolean };
  model?: string;
}
interface ChatCompletionOptions {
  model: string; messages: ChatMessage[]; temperature?: number;
  max_tokens?: number; response_format?: { type: "text" | "json_object" };
}
interface ChatCompletionResponse {
  id: string;
  choices: Array<{ index: number; message: { role: "assistant"; content: string }; finish_reason: string }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
```

---

## API Specification

### CLI Commands

Binary: `grok-video` (compiled) or `tsx src/cli.ts` (source)

| Command | Aliases | Description |
|---------|---------|-------------|
| `director <scene> [opts]` | `direct` | LLM-directed multi-clip video pipeline (main feature) |
| `pipeline <script-file>` | — | Script-driven continuity pipeline, no LLM |
| `pipeline --inline '<json>'` | — | Run pipeline from inline JSON string |
| `generate <prompt> [opts]` | `gen`, `video` | Single video clip generation |
| `image <prompt> [opts]` | `img` | Single or batch image generation |
| `status <request-id>` | `poll` | Check video generation status by request ID |
| `edit <video-url> <prompt>` | — | Submit video edit job |
| `models` | — | List available video generation models |

**Director options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--shots <n>` | int | 8 | Number of shots to generate |
| `--duration <n>` | int (1-15) | 6 | Seconds per shot |
| `--drift <n>` | int (0-100) | 60 | Drift acceptance threshold |
| `--retries <n>` | int | 2 | Max retries per shot |
| `--style <text>` | string | — | Visual style directive |
| `--budget <n>` | float | 10.00 | Max spend in USD |
| `--output <dir>` | path | `output/director-{ts}` | Output directory |
| `--aspect <ratio>` | string | 16:9 | Aspect ratio |
| `--source-image <url>` | URL | — | Skip char-ref generation, use existing image |

**Generate options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--duration <n>` | int (1-15) | 6 | Duration in seconds |
| `--aspect <ratio>` | string | 16:9 | Aspect ratio |
| `--ref <url>` | URL | — | Reference image URL for anchoring |

**Image options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--model <name>` | string | `grok-imagine-image` | Model: standard or pro |
| `--aspect <ratio>` | string | 1:1 | Aspect ratio |
| `--count <n>` | int (1-10) | 1 | Number of images |

**Pipeline options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--output <dir>` | path | `output/pipeline-{ts}` | Output directory |
| `--character <desc>` | string | — | Character description override |
| `--style <style>` | string | — | Style override |

### Library Exports

All exported from package root (`import { ... } from "grok-video-api"`):

**Director Pipeline**
```typescript
runDirectorPipeline(config: DirectorConfig): Promise<DirectorReport>
```

**Continuity Pipeline**
```typescript
runContinuityPipeline(script: ContinuityScript, options: PipelineOptions): Promise<PipelineReport>
```

**Script Parser**
```typescript
parseScript(raw: string): ContinuityScript
buildClipPrompt(script: ContinuityScript, clip: ScriptClip, isFirstClip: boolean): string
```

**xAI Client**
```typescript
generateImage(prompt, model?, aspectRatio?, count?): Promise<XaiImageResponse>
editImage(prompt, imageUrl, model?): Promise<XaiImageResponse>
submitVideoGeneration(prompt, duration?, aspectRatio?, imageUrl?): Promise<string>
getVideoStatus(requestId): Promise<{ status: number; data: XaiVideoStatusResponse }>
pollVideoStatus(requestId, onUpdate?, maxPolls?, intervalMs?): Promise<XaiVideoStatusResponse>
submitVideoEdit(prompt, videoUrl): Promise<string>
getVideoModels(): Promise<{ models: XaiVideoModel[] }>
downloadFile(url, filePath): Promise<void>
chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse>
visionAnalysis(model, prompt, imageUrls[], responseFormat?): Promise<{ content: string; usage }>
xaiRequest<T>(path, method?, body?): Promise<T>
xaiRawFetch(path, method?, body?): Promise<Response>
getApiKey(): string
sleep(ms): Promise<void>
```

**FFmpeg Utilities**
```typescript
checkFfmpeg(): boolean
extractLastFrame(videoPath, outputPath): void
extractFirstFrame(videoPath, outputPath): void
concatVideos(videoPaths[], outputPath): void
getVideoInfo(videoPath): { width, height, duration, codec, fps }
```

**Error Classes**
```typescript
class XaiApiError extends Error {
  statusCode: number; method: string; endpoint: string;
  responseBody: string; retryable: boolean;
}
class FfmpegError extends Error {
  command: string; stderr: string;
}
```

### xAI REST Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v1/videos/generations` | Submit video generation job |
| GET | `/v1/videos/{request_id}` | Poll job status (202=pending, 200=complete) |
| POST | `/v1/videos/edits` | Submit video edit job |
| GET | `/v1/video-generation-models` | List available video models |
| POST | `/v1/images/generations` | Generate image(s) |
| POST | `/v1/images/edits` | Edit an image |
| POST | `/v1/chat/completions` | Chat/LLM completions (Director, Vision) |

---

## Feature Catalog

### F-1: Director Pipeline

**User Story**: As a developer, I want to give a one-line scene description and have an LLM orchestrate the full multi-clip video production so I don't have to manually write consistent video prompts.

**Acceptance Criteria**:
- Accepts a scene description string and returns a `DirectorReport` with all shot results
- Generates a `CharacterBible` via LLM JSON mode before any video generation
- Creates a character reference image with `grok-imagine-image-pro`
- Decomposes the scene into exactly `config.shots` sequential shots via LLM
- Writes a self-contained video prompt for each shot (embeds full character description)
- Submits each shot to Aurora with the previous clip's URL as `image_url` anchor
- Extracts last frame via FFmpeg and scores drift (0-100) via vision model
- Accepts clips with score >= `driftThreshold`, rejects and retries below threshold
- On final retry failure, accepts best-effort result rather than marking shot as failed
- Stops early if `totalCost` exceeds `config.budget`
- Stitches accepted clips into `{scene-name}-final.mp4` via FFmpeg
- Saves `character-bible.json`, `director-report.json`, `director-log.txt` to `outputDir`
- Emits structured `ProgressEvent` objects via `onProgress` callback throughout

**Drift Score Dimensions** (each 0-20, total 0-100):
- `character`: physical appearance match (face, build, skin, hair)
- `wardrobe`: clothing/accessories match
- `environment`: scene/setting match to shot plan
- `style`: art style consistency
- `continuity`: overall coherence with reference image

### F-2: Continuity Pipeline (Script-Driven)

**User Story**: As a developer with pre-written prompts, I want to run a multi-clip pipeline without LLM involvement so I have full control over every prompt.

**Acceptance Criteria**:
- Accepts a `ContinuityScript` (JSON or text format) and `PipelineOptions`
- Parses both JSON and simplified text format scripts
- Optionally generates a character reference image if `characterDescription` is set
- Sequentially generates each clip, passing previous clip URL as anchor
- Retries failed clips up to `maxRetries` times (default: 2)
- Extracts last frame per clip for anchoring (no drift scoring in this mode)
- Stitches all completed clips into a final video
- Saves `pipeline-report.json` to `outputDir`
- Validates script has at least one clip and `outputDir` is set before starting

### F-3: Single Video Generation

**User Story**: As a developer, I want to generate a single video clip from a prompt with optional image anchoring.

**Acceptance Criteria**:
- Accepts a prompt, optional duration (1-15s), aspect ratio, and reference image URL
- Submits to Aurora, polls until complete, downloads to `output/{timestamp}.mp4`
- Displays real-time polling progress to stdout
- Reports video URL, local path, and duration on completion

### F-4: Image Generation

**User Story**: As a developer, I want to generate one or more images from a text prompt.

**Acceptance Criteria**:
- Accepts a prompt, model (`grok-imagine-image` or `grok-imagine-image-pro`), aspect ratio, and count (1-10)
- Downloads all generated images to `output/{timestamp}-{n}.jpg`
- Reports URLs and local paths for each image

### F-5: Video Edit

**User Story**: As a developer, I want to apply a text edit to an existing video.

**Acceptance Criteria**:
- Accepts a video URL and prompt
- Submits edit job to xAI, returns request ID immediately
- Instructs user to poll with `status <request-id>` to retrieve result

### F-6: FFmpeg Utilities

**User Story**: As a developer embedding this library, I want frame extraction and concatenation utilities.

**Acceptance Criteria**:
- `extractLastFrame`: extracts frame at `duration - 0.1s` as JPEG
- `extractFirstFrame`: extracts first frame as JPEG
- `concatVideos`: concatenates N MP4 files via FFmpeg concat demuxer (no re-encoding)
- `getVideoInfo`: returns width, height, duration, codec, fps via ffprobe
- All functions throw `FfmpegError` with command and stderr on failure
- Input file existence is validated before any FFmpeg call
- Paths with special characters (spaces, single quotes, backslashes) are handled safely

### F-7: Provider Interface Exports

**User Story**: As a developer building a multi-provider system, I want abstract TypeScript interfaces I can implement for any AI provider.

**Acceptance Criteria**:
- Exports `ImageProvider`, `VideoProvider`, `LLMProvider`, `VisionProvider`, `VoiceProvider`
- Exports `UnifiedProvider` (composes multiple capabilities)
- Exports `ProviderRegistry` interface for provider registration and discovery
- All interfaces are pure TypeScript (no runtime coupling to xAI)
- xAI client functions align with these interface contracts

### F-8: Progress Streaming

**User Story**: As a developer building a web app, I want structured progress events I can forward to WebSocket or SSE clients.

**Acceptance Criteria**:
- `DirectorConfig.onProgress` callback receives `ProgressEvent` at each pipeline phase transition
- Event types cover: `submitted`, `polling`, `processing`, `complete`, `error`, `phase`, `info`
- Events include `phase` label, `progress` percentage (0-100 where deterministic), and `data` payload
- Callback is optional — pipeline works without it
- CLI commands write to stdout; library consumers receive events via callback

---

## Behavioral Specification

### Startup Behavior

1. CLI validates `XAI_API_KEY` environment variable is set before executing any command. Exits with code 1 and error message if missing.
2. Director command prints an ASCII summary box with all parameters and estimated cost range before starting.
3. Pipeline command prints title, clip count, character, style, and estimated cost before starting.
4. FFmpeg presence is checked at pipeline start. Warning is logged if absent but pipeline continues.

### Video Generation Polling

1. `submitVideoGeneration` returns a `request_id` synchronously.
2. `pollVideoStatus` polls `GET /v1/videos/{request_id}` every `intervalMs` (default: 5000ms).
3. HTTP 202 = still generating, continue polling.
4. HTTP 200 = complete, return response.
5. Any other status = throw `XaiApiError` with the status code.
6. Transient network errors during polling are caught and retried (not re-thrown) unless it is the final attempt.
7. Timeout after `maxPolls * intervalMs` (default: 90 * 5000 = 7.5 minutes) throws an `Error`.
8. Director pipeline uses `maxPolls=90`, `intervalMs=5000` per shot.

### Drift Analysis Behavior

1. Both the character reference image and the extracted last frame are read from disk and converted to base64 JPEG data URIs.
2. Both images are sent to the vision model in a single multimodal message with a 5-dimension scoring prompt.
3. Vision model responds in JSON mode with scores per dimension (0-20 each) and `notes`.
4. Total is recalculated from the 5 scores to prevent LLM arithmetic errors.
5. If vision response is unparseable JSON, a default score of 75 is assigned and the clip is auto-accepted (benefit of the doubt).
6. Score >= `driftThreshold`: clip accepted, copied to `clips/` directory.
7. Score < `driftThreshold` AND retries remaining: Director receives structured drift feedback message and rewrites the prompt.
8. Final attempt (retries exhausted): clip accepted regardless of score (best-effort).

### Budget Enforcement

1. `totalCost` is computed as: `director.getCost() + (characterRef ? 0.07 : 0) + sum(attempts * duration * 0.05)`.
2. Budget is checked before each shot starts and before each attempt within a shot.
3. If `totalCost + estimatedShotCost > budget`, the pipeline stops and stitches whatever clips completed.
4. Cost is reported in `DirectorReport.totalCost` on pipeline completion.

### Error Handling

| Scenario | Behavior |
|----------|----------|
| `XAI_API_KEY` missing | Exit 1 with message before any API call |
| Video generation timeout (7.5 min) | Shot marked as failed, `error` set, pipeline continues |
| Video URL absent after completion | Error thrown, caught by shot retry loop |
| Director JSON truncated/malformed | Fallback regex extraction; if still fails, error propagates to retry |
| Vision response unparseable | Auto-accept with score 75, logged as warning |
| FFmpeg not found | Drift analysis skipped, stitching skipped, individual clips saved |
| Frame extraction failure | Error logged via `onProgress`/console, shot continues without drift check |
| Budget exceeded | Pipeline stops gracefully at next shot boundary, partial results saved |
| `downloadFile` network error | Error thrown with URL in message |
| `xaiRequest` non-2xx response | `XaiApiError` thrown with status, method, endpoint, body |
| Stitching failure | Error logged, individual clips remain in `clips/` directory |

### Output File Structure

Director pipeline output:
```
output/director-{timestamp}/
  character-ref.jpg           # Character reference image (downloaded)
  character-bible.json        # Structured character description from LLM
  director-report.json        # Full pipeline metrics, costs, drift scores
  director-log.txt            # Human-readable log of every Director decision
  clips/
    clip-001.mp4              # Accepted final clip (zero-padded 3 digits)
    clip-002.mp4
    ...
  frames/
    shot-001-attempt-1.jpg    # Extracted last frames (drift analysis inputs)
    ...
  attempts/
    shot-001-attempt-1.mp4    # ALL generation attempts including rejected
    shot-001-attempt-2.mp4
    ...
  {scene-name}-final.mp4      # FFmpeg-stitched final video
```

Continuity pipeline output:
```
output/pipeline-{timestamp}/
  character-ref.jpg           # Character reference image (if generated)
  pipeline-report.json        # Pipeline metrics
  clips/
    clip-001.mp4
    ...
  frames/
    frame-001.jpg
    ...
  {title}-{timestamp}.mp4     # Stitched final video
```

---

## Configuration & Environment

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XAI_API_KEY` | Yes | xAI API key from console.x.ai |

No `.env` file loading is built in. Load `.env` externally (e.g., with `dotenv`) before invoking the library, or export the variable directly.

### Shell Script Safety (`.env` Loading)

`run-source-linux.sh` and `run-source-mac.sh` use a safe `while read` loop (not `xargs`) to load `.env` values. This handles values with spaces and avoids shell injection through `xargs` word-splitting.

### Model Defaults

| Parameter | Default Value | Override |
|-----------|---------------|----------|
| Director LLM | `grok-4-1-fast-non-reasoning` | `DirectorConfig.directorModel` or `--director-model` |
| Vision model | `grok-4-1-fast-non-reasoning` | `DirectorConfig.visionModel` or `--vision-model` |
| Video model | `grok-imagine-video` | Hardcoded (not overridable in v0.1.1) |
| Image model (char ref) | `grok-imagine-image-pro` | Hardcoded |
| Image model (CLI) | `grok-imagine-image` | `--model` flag |

**Note**: The default vision model in code is `grok-4-1-fast-non-reasoning` (set in `runDirectorPipeline`), not `grok-2-vision-latest` as documented in README/CLAUDE.md. This is a documentation/code discrepancy.

### Build Configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  }
}
```

### npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `start` | `tsx src/cli.ts` | Run CLI from source |
| `dev` | `tsx src/cli.ts` | Alias for `start` |
| `pipeline` | `tsx src/cli.ts pipeline` | Run pipeline command directly |
| `generate` | `tsx src/cli.ts generate` | Run generate command |
| `image` | `tsx src/cli.ts image` | Run image command |
| `status` | `tsx src/cli.ts status` | Run status command |
| `prepublishOnly` | `npm run build` | Auto-build before publishing |

---

## Infrastructure Requirements

### Runtime Requirements

- Node.js >= 18 (for native `fetch`)
- `XAI_API_KEY` environment variable
- Network access to `api.x.ai`

### Optional Requirements

- FFmpeg + FFprobe on PATH: enables frame extraction, drift analysis, and video stitching
- Without FFmpeg: clips are generated and downloaded but not stitched; drift analysis is skipped and all clips are auto-accepted

### Storage

- Output videos: ~5-10 MB per 6-second clip (H.264 848x480)
- A full 8-shot run generates: 8 final clips + up to 16 rejected attempts + 8 frames + 1 character ref + reports
- Estimated storage per run: 100-300 MB (including all attempts)
- The `output/` directory is not git-ignored by default — large runs can fill repos quickly

### xAI API Limits

Video generation is async with a typical completion time of 30-90 seconds per clip. The polling loop defaults to a 7.5-minute timeout. No rate limit handling beyond the `XaiApiError.retryable` flag (exposed to callers but not auto-retried).

---

## Security Requirements

### Implemented Security Controls

1. **Command injection prevention**: All FFmpeg calls use `execFileSync` with arguments as arrays (not `execSync` with template literals). The shell is never invoked for FFmpeg operations.

2. **FFmpeg concat path escaping**: Paths written to FFmpeg concat list files have backslashes and single quotes properly escaped to prevent malformed concat lists.

3. **Structured API error handling**: `XaiApiError` captures full HTTP context (status, method, endpoint, body) without leaking raw credentials in error messages.

4. **API key isolation**: `getApiKey()` reads from `process.env.XAI_API_KEY` only. Key is never written to disk or logs.

5. **Safe shell script `.env` loading**: `run-source-linux.sh` and `run-source-mac.sh` use `while read` loops, not `xargs`, preventing word-split injection.

### Known Security Considerations

1. **Path traversal via `outputDir`**: The `outputDir` parameter in `DirectorConfig` and `PipelineOptions` is written directly to `mkdirSync`. If this library is exposed via a web API, `outputDir` must be validated/sanitized by the caller.

2. **No dotenv loading**: There is no built-in `.env` file loader. API keys must be set via environment before process start. This is a security feature (no accidental `.env` inclusion in process environments) but requires callers to handle key injection.

3. **Temporary xAI URLs**: Generated video and image URLs are temporary, provider-hosted URLs. They expire. Downloaded local copies are permanent.

4. **No rate limit retry**: `XaiApiError.retryable` is set for 429 and 5xx responses but the library does not auto-retry. Callers are responsible for implementing exponential backoff.

5. **Base64 image data in API calls**: Drift analysis sends full JPEG frames as base64 data URIs. Image size directly affects vision API token consumption and cost.

---

## Reconstruction Notes

These notes capture what a developer needs to know to reconstruct, extend, or port this codebase.

### Core Loop Pattern

The entire Director Pipeline is a sequential async loop. It cannot be parallelized because each shot requires the previous shot's video URL as the `image_url` anchor. The only parallel operation possible would be pre-computing multiple shot plan variations, but this isn't implemented.

### DirectorConversation Class

Lives entirely in `director.ts` (not exported). Wraps a `ChatMessage[]` array. Every LLM call adds a user message, sends the full conversation, then appends the assistant reply. The conversation grows indefinitely through the pipeline. `getCost()` returns cumulative LLM token costs at current token prices.

### safeJsonParse Utility

Also in `director.ts` (not exported). First attempts `JSON.parse`. If that fails, tries to extract JSON from markdown code blocks (` ```json ... ``` `). Returns `null` if both fail. Used for all Director LLM responses.

### Video API Pattern (Async Polling)

The xAI video API is not synchronous. The submit endpoint returns immediately with a `request_id`. The status endpoint returns HTTP 202 while generating and HTTP 200 when complete. Polling is the only way to retrieve the result. This means `pollVideoStatus` can block for 30-90 seconds per shot. In the context of a Node.js event loop, this is fine (Promise-based), but it means the total pipeline can run for 10-20 minutes for a large shoot.

### Vision Analysis Input Format

The vision model receives images as base64 JPEG data URIs, not as URLs. This is because the extracted frames are local files with no public URL. The conversion is: `readFileSync(path).toString("base64")` → `data:image/jpeg;base64,${base64}`. Each image adds approximately 30-50K tokens to the vision API call.

### FFmpeg Integration Notes

All FFmpeg operations use `execFileSync` (not `execSync`) to avoid shell injection. The concat demuxer uses `-c copy` to avoid re-encoding (fast, lossless). FFmpeg is detected via `execFileSync("ffmpeg", ["-version"])` — if it throws, FFmpeg is absent. The `getVideoInfo` function is exported but not used internally — it's a utility for library consumers.

### Prompt Length Problem

The Director's video prompts must stay under ~300 words. As the conversation grows (more shots = more context = more verbose Director responses), prompts bloat. The system prompt instructs the Director to stay concise. A fallback regex (`/"prompt"\s*:\s*"([\s\S]+?)(?:"|$)/`) recovers truncated JSON responses.

### Cost Accounting

Three categories of cost:
1. `director.getCost()` — cumulative LLM token cost (input at $0.20/M, output at $0.50/M)
2. Character reference image: fixed $0.07 if generated
3. Video generation: `attempts * duration * 0.05` per shot

Vision costs are not precisely tracked — approximated as included in the video cost estimate. The `DirectorReport.totalCost` reflects the LLM + video + image components but underestimates vision slightly.

### Provider Interface Design Intent

`src/types.ts` was written as a shared abstraction layer for a multi-provider system called "CreatorForge" (mentioned in file header comments). The interfaces define contracts that any AI provider can implement. The xAI client implements these contracts functionally (the return types match) but doesn't explicitly implement the interfaces via TypeScript `implements` keyword — they're structurally compatible.

### Known Remaining Issue (Audit L-3)

Hardcoded model name `"grok-4-1-fast-non-reasoning"` appears twice in `director.ts` (default director and vision model). Should be extracted to named constants. Not fixed in v0.1.1 audit — flagged for next pass.

### Documentation/Code Discrepancy

README and CLAUDE.md list the default vision model as `grok-2-vision-latest`. The actual code in `runDirectorPipeline` defaults both `directorModel` and `visionModel` to `"grok-4-1-fast-non-reasoning"`. The documentation is stale relative to the implementation.

### Future Extension Points

1. **Style presets** (`dev/NEXT-PHASE.md`): 14 director presets defined (wes-anderson, fincher, kubrick, etc.) as a style library. Would require a new `src/styles.ts` and a Phase 0 "style advisor" in the Director pipeline.

2. **Multi-provider video**: The `VideoProvider` interface in `types.ts` is already defined. A provider registry pattern would allow swapping Aurora for Runway, Kling, or Sora without changing pipeline logic.

3. **Web portal**: The `onProgress` callback pattern was specifically designed for WebSocket/SSE integration. The structured event types and phase labels provide everything needed to drive a real-time progress UI.

4. **Parallel shot generation**: Would require removing the sequential image-anchoring constraint, or batching shots by anchor dependency. Currently impossible with the current anchoring design.
