# Development Workflow

## Day-to-Day Development

No build step required for most work. Run from source:

```bash
npx tsx src/cli.ts director "test scene" --shots 2 --duration 3 --budget 1
```

Edits to `.ts` files are reflected immediately on the next run. The only time you need `npm run build` is when testing the compiled output or preparing to publish.

---

## Git Workflow

### Branching

Always branch from `main`. Keep branches focused on one change.

```bash
git checkout -b feat/add-video-edit-support
# or
git checkout -b fix/polling-timeout-handling
# or
git checkout -b docs/add-api-reference
```

### Commit Format

Use conventional commits:

```
feat: add support for custom vision model per shot
fix: handle empty response body in pollVideoStatus
docs: add API reference for all exported functions
refactor: extract cost calculation to shared utility
test: add smoke test for image generation command
chore: bump tsx to 4.19.0
```

### Before Committing

1. Run `npm run build` to confirm TypeScript compiles clean
2. Run a cheap test if you touched generation logic: `--shots 2 --duration 3 --budget 1`
3. Update `CHANGELOG.md` if it's a functional change

### PR Requirements

- `npm run build` passes with zero errors
- No new runtime dependencies
- `CHANGELOG.md` updated under the relevant version
- PR description explains what changed and why

See `.github/PULL_REQUEST_TEMPLATE.md` for the checklist.

---

## Testing

No test framework. Validation uses real API calls. Keep costs low with minimal config:

```bash
# Type check only (free)
npx tsc --noEmit

# Cheapest functional test (~$0.40)
npx tsx src/cli.ts director "a cat sitting at a desk" --shots 2 --duration 3 --budget 1

# Image only (~$0.07)
npx tsx src/cli.ts image "test portrait" --model grok-imagine-image

# Single video clip (~$0.30)
npx tsx src/cli.ts generate "a red ball bouncing" --duration 6

# Script pipeline test (no LLM, ~$0.15)
# Create a minimal script.json first
npx tsx src/cli.ts pipeline script.json --output ./test-output
```

After a director pipeline test, verify:
- `director-report.json` has `completedShots > 0`
- `totalCost` is within expected range (< $1 for a 2-shot test)
- `clips/` has the expected number of `.mp4` files
- If FFmpeg is installed, `{scene-name}-final.mp4` exists

---

## Adding a New Feature

### New CLI Command

1. Add the command function in `src/cli.ts` (follow the pattern of `cmdDirector`, `cmdGenerate`, etc.)
2. Add a case in the `switch` statement in `main()`
3. Update the `usage()` function
4. Add a row to the command reference table in `README.md`
5. Update `CHANGELOG.md`

### New xAI Endpoint

1. Add request/response types in `src/xai-client.ts`
2. Add the function using `xaiRequest<T>()` or `xaiRawFetch()`
3. Export from `src/xai-client.ts`
4. Re-export from `src/index.ts`
5. Add a CLI command in `src/cli.ts` if appropriate

### New Provider Interface

The provider interfaces in `src/types.ts` are shared abstractions. Changes here affect downstream consumers.

1. Add the new interface to `src/types.ts`
2. Export it from `src/index.ts`
3. If breaking an existing interface, bump the major version

---

## Cost Tracking Convention

Every API call that costs money should update the pipeline's cost accumulator. The cost model:

| Operation | Cost |
|-----------|------|
| Video generation | `duration * $0.05` |
| Image generation | `$0.07` per image |
| Director LLM input | `(inputTokens / 1_000_000) * $0.20` |
| Director LLM output | `(outputTokens / 1_000_000) * $0.50` |
| Vision input | `(inputTokens / 1_000_000) * $2.00` |
| Vision output | `(outputTokens / 1_000_000) * $10.00` |

---

## Progress Event Convention

Any new pipeline phase should emit a `phase` progress event at the start and a `complete` event when done:

```typescript
emitProgress(onProgress, "phase", "Starting new phase", "phase-name", progressPercent);
// ... do work ...
emitProgress(onProgress, "complete", "Phase complete", "phase-name", progressPercent, { data });
```

Event types: `submitted`, `polling`, `processing`, `complete`, `error`, `phase`, `info`

---

## Changelog Format

The project uses a simplified version of Keep a Changelog:

```markdown
## [0.1.2] — 2026-03-14

- Added X feature
- Fixed Y bug in Z component
- Updated A to do B

## [0.1.1] — 2026-03-07

- ...
```

Add new entries under the `[Unreleased]` section if you want, or directly under a new version heading. Keep it plain English — no bullet-point marketing.

---

## Release Checklist

- [ ] All changes committed and pushed
- [ ] `npm run build` passes
- [ ] Smoke test passes (cheap 2-shot test)
- [ ] Version bumped in `package.json`
- [ ] `CHANGELOG.md` updated with new version and date
- [ ] `VERSION_MAP.md` updated
- [ ] `git tag v{version}` created
- [ ] `npm publish`
