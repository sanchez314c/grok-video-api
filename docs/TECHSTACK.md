# Tech Stack

## Language and Runtime

| Component | Version | Notes |
|-----------|---------|-------|
| TypeScript | ^5.7.0 | Strict mode, no `any` without justification |
| Node.js | >=18 | Required for native `fetch` and `node:` prefix imports |
| ESM | - | `"type": "module"` in package.json, NodeNext resolution |

TypeScript strict mode is mandatory. Every parameter and return type is explicit. The project compiles to ES2022 targeting Node 18+.

---

## Build Tooling

| Tool | Version | Role |
|------|---------|------|
| `tsc` | (via typescript ^5.7.0) | TypeScript compiler, outputs to `dist/` |
| `tsx` | ^4.19.0 | TypeScript execution for dev/source runs — no build step needed |
| `@types/node` | ^22.0.0 | Node.js type definitions |

There is no bundler (no webpack, no esbuild, no rollup). Source is compiled directly with `tsc`. The published package ships compiled `.js` + `.d.ts` files.

---

## xAI Models

| Model | Role | Cost |
|-------|------|------|
| `grok-imagine-video` | Video generation (1-15s clips) | $0.05/second |
| `grok-imagine-image-pro` | Character reference image | $0.07/image |
| `grok-4-1-fast-non-reasoning` | Director LLM (character bibles, shot plans, prompts) | $0.20/M input, $0.50/M output |
| `grok-2-vision-latest` | Drift analysis (compares frames to reference) | $2.00/M input, $10.00/M output |

All models accessed via `https://api.x.ai/v1`. The director and vision models are configurable overrides; the video and image models are fixed to the above.

---

## HTTP Client

Native Node.js `fetch` (built into Node 18+). No axios, no got, no node-fetch.

All API calls go through `xaiRequest<T>()` in `src/xai-client.ts`. This function handles authentication (`Authorization: Bearer`), JSON serialization, and error conversion to `XaiApiError`.

---

## Video Processing

**FFmpeg** (optional, external binary). Used for:
- Frame extraction: `ffprobe` to get duration + `ffmpeg -vframes 1` to extract last frame as JPEG
- Video concatenation: `ffmpeg -f concat` with a generated list file
- Video metadata: `ffprobe -print_format json` to get width, height, duration, codec, fps

FFmpeg is invoked via `execSync` (synchronous child process). The pipeline checks for FFmpeg with `checkFfmpeg()` and degrades gracefully when it's missing.

---

## File System

Standard Node.js `node:fs` (synchronous API) and `node:path`. Operations used:
- `mkdirSync({ recursive: true })` — create output directories
- `writeFileSync` — save reports, logs, clips, frames
- `readFileSync` — read clip files for copy, read local images for base64 encoding
- `existsSync` — check input files before FFmpeg operations

---

## Dependencies

**Runtime dependencies: zero.** The published package has no `dependencies` in `package.json`.

**Dev dependencies:**

| Package | Purpose |
|---------|---------|
| `typescript@^5.7.0` | TypeScript compiler |
| `tsx@^4.19.0` | Source execution (dev workflow) |
| `@types/node@^22.0.0` | Node.js type definitions |

This is intentional. An empty runtime dependency tree means:
- No transitive vulnerability risk
- No version conflicts in consumer projects
- Smaller `node_modules` for library consumers
- Easy `npm audit` — only dev deps to check

---

## Module System

ESM with NodeNext resolution. Key implications:
- All internal imports use `.js` extensions: `import { fn } from "./module.js"`
- Package exports defined via `"exports"` field in `package.json`
- `"type": "module"` means `.js` files are treated as ESM by default
- CJS consumers must use dynamic `import()` to load the package

---

## CLI

Built into the package. Entry point: `src/cli.ts` / `dist/cli.js`. No commander, no yargs — argument parsing is a simple custom `parseArgs()` function that splits positional args from `--flag value` pairs.

The `bin` field in `package.json` maps the `grok-video` command to `dist/cli.js` for global installs.

---

## Rationale for Key Choices

**Why TypeScript?**

The provider interfaces in `src/types.ts` define contracts that external projects consume. Without strict typing, those contracts are unenforceable. TypeScript strict mode surfaces bugs at compile time that would otherwise surface at runtime during expensive API calls.

**Why zero runtime deps?**

Every dependency is a maintenance burden, a vulnerability surface, and a potential version conflict. Native `fetch` handles HTTP. Native `fs` handles files. FFmpeg handles video. There's no need for more.

**Why ESM?**

Node.js ESM is the future. The `import()` interop works both ways. Starting ESM-first avoids a migration later.

**Why `tsx` for dev?**

Running from source is faster than compile-then-run. `tsx` handles TypeScript transpilation on the fly. No watch daemon, no build step between edits and runs.

**Why `execSync` for FFmpeg?**

Video operations are sequential and blocking by design (you need the frame before you can do drift analysis). `execSync` is simpler and correct here. If FFmpeg were being used for concurrent operations, `spawn` with stream handling would be better.
