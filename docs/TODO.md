# TODO

Known issues, planned features, and tech debt.

---

## Known Issues

**No test framework.** All validation requires real API calls that cost money. A test harness with mocked xAI responses would allow free unit testing of pipeline logic, error handling, prompt construction, and script parsing.

**FFmpeg `execSync` with path interpolation.** `src/ffmpeg.ts` interpolates file paths into shell commands with string template literals and double-quote wrapping. This is safe for CLI use but is a command injection risk if the library is used in a web service where output paths come from untrusted user input. See `SECURITY.md`.

**Approximate cost tracking.** The `totalCost` in `DirectorReport` is estimated based on known pricing constants. Actual billing from xAI may differ. Token counts for vision analysis depend on image resolution and aren't precisely tracked.

**No `.env` file support.** The project reads `process.env.XAI_API_KEY` directly. Users who want `.env` file support need to set it up themselves (e.g., with `dotenv` before importing the library). Adding a `.env` loader would be a dev dependency addition.

**`output/` not universally gitignored.** The `.npmignore` excludes `output/` from npm packages but there's no `.gitignore` in the repo. Users can accidentally commit hundreds of MB of generated video files.

**Vision model scoring degrades on abstract content.** The drift analysis via `grok-2-vision-latest` works best for photorealistic content with identifiable character features. Abstract, stylized, or non-character content gets less useful scoring.

---

## Planned Features

**Director presets (genre templates).** Pre-configured director styles for common video genres: documentary, film noir, anime, horror, corporate. A preset bundles style directives, shot pattern preferences, drift thresholds, and prompt modifiers. Reduces the "blank page" problem for users who don't know how to write style descriptions.

**Lens library.** A cinematography reference bank with named camera setups (e.g., "dutch angle", "birds-eye tracking shot", "handheld intimate close-up"). The director can reference these by name rather than describing them from scratch each shot, improving camera consistency across clips.

**Character archetype bank.** Reusable starting characters (noir detective, sci-fi soldier, anime protagonist) with pre-written character bibles. Users can start from a known-good base and modify it rather than generating a new character bible from scratch.

**Auto-style matching from reference images.** Upload a reference image (a movie still, artwork, photo) and the pipeline extracts a style description from it via vision analysis, then uses that as the style directive. Removes the need to articulate style in words.

**Multi-provider video support.** The `VideoProvider` interface in `types.ts` is designed for this but not yet wired up. Runway ML, Kling, and Sora (when APIs are public) could be plugged in. Would require refactoring `director.ts` to accept a `VideoProvider` interface instead of calling xAI functions directly.

**Web UI.** A simple React or Next.js frontend that wraps the director pipeline with a form for scene input, real-time progress display (using the existing `onProgress` SSE events), and video playback of the final result.

**Retry budget tracking.** Currently the pipeline estimates retry costs as `attempts * duration * 0.05` but doesn't precisely track which attempts actually incurred video generation costs (some might have failed before the job was submitted). Improve cost accuracy.

---

## Tech Debt

**`director.ts` is large (~790 LOC).** The file handles 4 pipeline phases, a `DirectorConversation` class, drift analysis, and output reporting. Consider splitting into `director-phases.ts`, `drift-analysis.ts`, and `director-report.ts` when adding features.

**Duplicate `timestamp()` utility.** The same `timestamp()` function exists in both `pipeline.ts` and `director.ts`. Should be extracted to a shared utility module.

**`cli.ts` has no unit tests.** Argument parsing logic in `parseArgs()` and command dispatch in `main()` have no coverage. At minimum, test that invalid command combinations exit with the right error codes.

**Vision analysis token cost tracking.** The `analyzeDrift()` function estimates vision cost as `(usage.prompt_tokens / 1M) * $2.00 + (usage.completion_tokens / 1M) * $10.00` but this is an estimate. The actual cost also depends on image resolution (higher resolution = more tokens). A more accurate tracker would use the actual image dimensions.

**Character reference image uses the same aspect ratio as the video.** The character ref is generated with the same `aspectRatio` as the video clips (e.g., 16:9 for landscape). For character reference purposes, a square or portrait ratio would often produce a better reference image. Should probably be hardcoded to "1:1" for the character ref generation.

**No validation on `DirectorConfig` inputs.** `shots` could be 0, `duration` could be negative, `budget` could be 0.01. Input validation at the start of `runDirectorPipeline` would catch these before the pipeline burns API credits on an invalid run.
