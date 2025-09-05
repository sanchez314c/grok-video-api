# Contributing to grok-video-api

Thanks for your interest in contributing. Here's how to get set up and what to expect.

## Dev Setup

You need Node.js 18+ and an xAI API key.

```bash
git clone https://github.com/sanchez314c/grok-video-api.git
cd grok-video-api
npm install
export XAI_API_KEY="xai-your-key-here"
```

Run directly from source (no build required):

```bash
npx tsx src/cli.ts director "your scene here" --shots 3 --budget 2
```

Build to `dist/`:

```bash
npm run build
```

FFmpeg is optional but enables frame extraction and video stitching:

```bash
sudo apt install ffmpeg   # Ubuntu/Debian
brew install ffmpeg       # macOS
```

## Code Conventions

- TypeScript strict mode (`"strict": true` in tsconfig.json)
- ESM modules (`"type": "module"` in package.json)
- NodeNext module resolution
- Zero external runtime dependencies, native `fetch` only
- All source files live in `src/`, compiled output in `dist/`
- Export everything public through `src/index.ts`

**File structure:**

```
src/
├── xai-client.ts    # xAI API client, no business logic here
├── director.ts      # LLM Director pipeline
├── pipeline.ts      # Script-driven pipeline (no LLM)
├── script-parser.ts # Script parsing utilities
├── ffmpeg.ts        # FFmpeg wrappers
├── cli.ts           # CLI entry point only
├── index.ts         # Public exports
└── types.ts         # Provider interfaces
```

## Making Changes

1. Branch from `main`
2. Keep changes focused, one thing per PR
3. Update `CHANGELOG.md` under `[Unreleased]`
4. Test with a real API call if you're touching pipeline or client code (the `--budget 1 --shots 2 --duration 3` config keeps test costs low)

## PR Requirements

- No new external runtime dependencies
- TypeScript must compile clean (`npm run build`)
- CHANGELOG.md updated
- PR description explains what changed and why

## Reporting Bugs

Use the GitHub issue template. Include:
- The exact CLI command or code that failed
- The error message
- Your Node.js version (`node --version`)
- Whether FFmpeg is installed

## Code of Conduct

Be respectful and constructive. That's it.
