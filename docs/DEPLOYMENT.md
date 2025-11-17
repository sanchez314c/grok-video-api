# Deployment

## What "Deployment" Means Here

`grok-video-api` is a CLI tool and TypeScript library, not a web service. "Deployment" means either:

1. Publishing a new version to npm
2. Installing the CLI globally on a machine
3. Integrating as a library into another project
4. Running the director pipeline in a server-side context (e.g., as part of a web app)

---

## Publishing to npm

### Pre-publish checklist

- [ ] Bump version in `package.json`
- [ ] Add changelog entry in `CHANGELOG.md`
- [ ] Run `npm run build` — confirm zero TypeScript errors
- [ ] Verify `dist/` exists and has `index.js`, `index.d.ts`, `cli.js`
- [ ] Test the CLI from `dist/`: `node dist/cli.js --help`
- [ ] Check what will be published: `npm pack --dry-run`

### Publish

```bash
# Confirm you're logged in
npm whoami

# Dry run to see exactly what gets published
npm pack --dry-run

# Publish
npm publish
```

The `prepublishOnly` script in `package.json` runs `npm run build` automatically, so the compiled `dist/` is always fresh.

### What gets published

The `files` field in `package.json` limits the package to:
- `dist/` — compiled JS, declarations, source maps
- `README.md`
- `LICENSE`
- `CHANGELOG.md`

Source TypeScript files, output videos, dev docs, and GitHub templates are excluded.

### Post-publish

```bash
# Tag the release
git tag v0.1.2
git push origin v0.1.2

# Verify the package is live
npm info grok-video-api version
```

---

## Global CLI Install

To install the `grok-video` CLI command globally from npm:

```bash
npm install -g grok-video-api
grok-video director "a cat at a desk" --shots 3 --budget 2
```

Or from the local repo (useful for testing before publishing):

```bash
npm link
grok-video director "test scene" --shots 2 --budget 1
```

Unlink when done:

```bash
npm unlink grok-video-api
```

---

## Library Integration in Another Project

Install as a dependency:

```bash
npm install grok-video-api
```

Set the API key in the environment before running any pipeline code:

```bash
export XAI_API_KEY="xai-your-key-here"
```

Import and use:

```typescript
import { runDirectorPipeline } from "grok-video-api";

const report = await runDirectorPipeline({
  scene: "your scene",
  shots: 4,
  duration: 6,
  budget: 5,
  outputDir: "./output",
});
```

The library is pure ESM. Your project must either use `"type": "module"` or import it dynamically:

```typescript
// Dynamic import in a CJS context
const { runDirectorPipeline } = await import("grok-video-api");
```

---

## Server-Side (Web App) Integration

If you're running the director pipeline from a web server:

### Environment

Set `XAI_API_KEY` as a server environment variable. Never pass it from the client.

```bash
# On your server / in your deployment config
export XAI_API_KEY="xai-your-key-here"
```

### Output Directory

The pipeline writes files to disk. Use a dedicated directory per request to avoid collisions:

```typescript
import { randomUUID } from "crypto";

const outputDir = `/tmp/grok-output/${randomUUID()}`;
const report = await runDirectorPipeline({ ..., outputDir });
```

Clean up after the request or use a background job for cleanup.

### Progress Streaming

The `onProgress` callback is designed for SSE or WebSocket integration:

```typescript
// Express SSE example
app.get("/generate", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });

  runDirectorPipeline({
    scene: req.query.scene,
    shots: 4,
    duration: 6,
    budget: 5,
    outputDir: `/tmp/gen-${Date.now()}`,
    onProgress: (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
  }).then((report) => {
    res.write(`data: ${JSON.stringify({ type: "done", report })}\n\n`);
    res.end();
  });
});
```

### Security Notes

- Sanitize the `scene` input if it comes from users. The scene is slugified for the output filename, but it's also passed verbatim to the director LLM.
- Sanitize or whitelist the `outputDir` if it comes from user input. The pipeline uses it as-is with `mkdirSync`.
- The FFmpeg shell calls in `src/ffmpeg.ts` interpolate file paths into commands. Keep paths within your controlled output directory.
- Set a `budget` cap. If a user can trigger unlimited generation, you'll burn through API credits fast.

See `SECURITY.md` for full details.

### Concurrency

The pipeline is async but generates clips sequentially (the next clip uses the previous clip's URL as its visual anchor). Parallel pipeline runs are fine; they don't share state. Each run gets its own `DirectorConversation` instance and output directory.

---

## Version Bumping

1. Update `package.json` version field
2. Add section to `CHANGELOG.md` with date
3. Run `npm run build`
4. Commit, tag, publish

```bash
# Bump patch version
npm version patch

# This updates package.json and creates a git tag automatically
# Then publish
npm publish
```
