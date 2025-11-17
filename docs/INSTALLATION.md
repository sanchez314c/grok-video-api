# Installation

## Prerequisites

- **Node.js 18+** (uses native `fetch`, which shipped in Node 18)
- **npm** (comes with Node.js)
- **FFmpeg** (optional but recommended)

Check your versions:

```bash
node --version   # needs to be v18.0.0 or higher
npm --version
ffmpeg -version  # optional
```

## Setup

### 1. Clone and install

```bash
git clone https://github.com/sanchez314c/grok-video-api.git
cd grok-video-api
npm install
```

The only packages installed are dev dependencies: `typescript`, `tsx`, and `@types/node`. There are zero runtime dependencies.

### 2. Get an xAI API key

Sign up at [console.x.ai](https://console.x.ai) and create an API key. You need credits loaded for video generation ($0.05/second), image generation ($0.07/image), and chat/vision API access.

### 3. Set the environment variable

```bash
export XAI_API_KEY="xai-your-key-here"
```

Or add it to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.) so it persists:

```bash
echo 'export XAI_API_KEY="xai-your-key-here"' >> ~/.bashrc
source ~/.bashrc
```

The CLI validates the key exists before making any API calls. If it's missing, you'll get a clear error message.

### 4. Install FFmpeg (optional)

FFmpeg enables frame extraction (for drift analysis) and video stitching (combining clips into one file). Without it, the pipeline still works but:

- Drift analysis is skipped (all clips are auto-accepted)
- Clips are saved individually, not stitched together

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows (via chocolatey)
choco install ffmpeg
```

### 5. Verify the setup

```bash
# Should print the CLI help
npx tsx src/cli.ts --help

# Quick test (costs ~$0.40)
npx tsx src/cli.ts director "a cat sitting at a desk" --shots 2 --duration 3 --budget 1
```

If the test completes, check the `output/director-{timestamp}/` directory for your generated video, character bible, and director report.

## Using as an npm Package

If you want to use grok-video-api as a library in your own project:

```bash
npm install grok-video-api
```

Then import from the package:

```typescript
import { runDirectorPipeline, generateImage } from "grok-video-api";
```

The `XAI_API_KEY` environment variable must be set in whatever process runs your code.

## Global CLI Install

To install the `grok-video` command globally:

```bash
npm install -g grok-video-api

# Then use it anywhere
grok-video director "your scene" --shots 4 --budget 3
```

This requires building first (`npm run build` in the repo, or the npm package includes pre-built `dist/`).
