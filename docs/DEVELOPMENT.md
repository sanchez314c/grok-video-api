# Development Guide

## Dev Environment

```bash
git clone https://github.com/sanchez314c/grok-video-api.git
cd grok-video-api
npm install
export XAI_API_KEY="xai-your-key-here"
```

Run from source without building:

```bash
npx tsx src/cli.ts <command> [args]
```

Or use the npm scripts:

```bash
npm start            # same as tsx src/cli.ts
npm run dev          # same as tsx src/cli.ts
npm run pipeline     # tsx src/cli.ts pipeline
npm run generate     # tsx src/cli.ts generate
npm run image        # tsx src/cli.ts image
npm run status       # tsx src/cli.ts status
```

## Build

```bash
# Compile TypeScript to dist/
npm run build

# This runs tsc, outputs to dist/ with declaration files and source maps
```

The `tsconfig.json` settings:
- Target: ES2022
- Module: NodeNext
- Strict mode: on
- Declaration files: yes
- Source maps: yes

## Project Conventions

### Zero runtime dependencies

This is a hard rule. Everything uses native Node.js APIs. HTTP requests use `fetch` (built into Node 18+). Child processes use `execSync` for FFmpeg. No axios, no got, no node-fetch.

### ESM modules

The project uses `"type": "module"` in package.json with NodeNext resolution. All imports use `.js` extensions even though the source files are `.ts`:

```typescript
import { generateImage } from "./xai-client.js";
```

### TypeScript strict mode

No `any` types without good reason. No `@ts-ignore`. All function parameters and returns are typed.

### Public API surface

Everything public goes through `src/index.ts`. If you add a new function or type that should be available to library consumers, export it from the source file and re-export it from index.ts.

### Error handling

Two custom error classes:
- `XaiApiError` - for xAI API failures. Includes HTTP status, endpoint, raw response body, and a `retryable` flag
- `FfmpegError` - for FFmpeg failures. Includes the command that was attempted and stderr output

Don't throw raw strings. Use these classes or create new typed error classes if needed.

### Cost tracking

Every API call that costs money should update the pipeline's cost accumulator. The cost model:
- Video generation: `duration * $0.05`
- Image generation: `$0.07` per image
- Director LLM: `(inputTokens / 1M) * $0.20 + (outputTokens / 1M) * $0.50`
- Vision analysis: `(inputTokens / 1M) * $2.00 + (outputTokens / 1M) * $10.00`

### Progress events

The director pipeline accepts an `onProgress` callback. Any new pipeline phase or significant step should emit progress events:

```typescript
emitProgress(onProgress, "processing", "Analyzing drift...", "shot-3-drift", 65, { score: 78 });
```

Event types: `submitted`, `polling`, `processing`, `complete`, `error`, `phase`, `info`

### FFmpeg is always optional

Never assume FFmpeg is installed. Check with `checkFfmpeg()` and handle the case where it's missing. The pipeline should degrade gracefully: skip frame extraction, skip drift analysis, don't stitch clips.

## Adding a New CLI Command

1. Add the command function in `src/cli.ts` (follow the pattern of `cmdDirector`, `cmdGenerate`, etc.)
2. Add a case in the `switch` statement in `main()`
3. Update the `usage()` function with the new command's help text
4. Update CHANGELOG.md

## Adding a New Provider

The provider interfaces in `src/types.ts` define the contract:

```typescript
interface ImageProvider {
  generateImage(options: ImageGenerationOptions): Promise<ImageResult[]>;
  editImage(options: ImageEditOptions): Promise<ImageResult>;
  listImageModels(): Promise<Array<{ id: string; name: string; costPerImage: number }>>;
}
```

To add a new provider (e.g., OpenAI):

1. Create `src/openai-client.ts`
2. Implement the relevant interfaces (`ImageProvider`, `VideoProvider`, etc.)
3. Export it through `src/index.ts`
4. Optionally implement `UnifiedProvider` to wrap all capabilities

The director pipeline currently calls xAI functions directly from `xai-client.ts`. Making it fully provider-agnostic would require refactoring `director.ts` to accept provider interfaces as parameters.

## Adding a New xAI Endpoint

1. Add the request/response types in `src/xai-client.ts`
2. Add the function using `xaiRequest<T>()` or `xaiRawFetch()`
3. Export it from `src/xai-client.ts`
4. Re-export from `src/index.ts`
5. Add a CLI command in `src/cli.ts` if appropriate

## Testing

There's no test framework. Validation happens through real API calls. Keep test costs low:

```bash
# Type check (free)
npm run build

# Cheapest smoke test (~$0.40)
npx tsx src/cli.ts director "a cat at a desk" --shots 2 --duration 3 --budget 1

# Image generation test (~$0.07)
npx tsx src/cli.ts image "test image" --model grok-imagine-image

# Single video test (~$0.30)
npx tsx src/cli.ts generate "test video" --duration 6
```

After running the director pipeline, check:
- `director-report.json` has `completedShots > 0`
- `totalCost` is within expected range
- Clips directory has the expected number of `.mp4` files
- If FFmpeg is installed, `{scene-name}-final.mp4` should exist

## Changelog

Update `CHANGELOG.md` for every functional change. Use the existing format:

```markdown
## [version] - YYYY-MM-DD

- What changed, in plain language
```
