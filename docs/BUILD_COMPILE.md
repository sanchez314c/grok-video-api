# Build and Compile

## Overview

The project is TypeScript source in `src/` compiled to JavaScript in `dist/`. The build uses `tsc` directly. No bundler.

For day-to-day development you don't need to build at all — just run from source with `tsx`.

---

## Run from Source (Recommended for Dev)

```bash
npx tsx src/cli.ts director "your scene" --shots 3 --budget 2
npx tsx src/cli.ts generate "a cat typing" --duration 6
npx tsx src/cli.ts image "mountain at sunset"
```

`tsx` handles TypeScript compilation on the fly. No build step, no waiting. This is how the npm scripts work too:

```bash
npm start               # tsx src/cli.ts
npm run dev             # tsx src/cli.ts
npm run pipeline        # tsx src/cli.ts pipeline
npm run generate        # tsx src/cli.ts generate
npm run image           # tsx src/cli.ts image
npm run status          # tsx src/cli.ts status
```

---

## TypeScript Compile

To compile to `dist/`:

```bash
npm run build
```

This runs `tsc` with the settings from `tsconfig.json`.

**tsconfig.json settings:**

| Setting | Value | Why |
|---------|-------|-----|
| `target` | ES2022 | Matches Node 18+ capabilities |
| `module` | NodeNext | Full ESM support with `package.json` exports |
| `moduleResolution` | NodeNext | Resolves `.js` extensions in source to `.ts` files |
| `strict` | true | Full type safety |
| `declaration` | true | Generates `.d.ts` files for library consumers |
| `sourceMap` | true | Source maps for debugging compiled output |
| `outDir` | dist | Output directory |
| `rootDir` | src | Source root |

**Output in `dist/`:**
- `*.js` — compiled ES modules
- `*.d.ts` — TypeScript declarations
- `*.js.map` — source maps

---

## Run Compiled Output

After building:

```bash
node dist/cli.js director "your scene" --shots 3 --budget 2
```

Or use the CLI binary (if installed globally or linked):

```bash
grok-video director "your scene" --shots 3 --budget 2
```

The `bin` field in `package.json` maps `grok-video` to `dist/cli.js`.

---

## Watch Mode

TypeScript doesn't have a built-in watch-and-run mode, but since `tsx` runs from source directly, you just re-run the command. For library development where you want to see compile errors in real time:

```bash
npx tsc --watch
```

This recompiles on every save and surfaces type errors immediately.

---

## Publish Build

The `prepublishOnly` script runs `npm run build` automatically before any `npm publish`. The `files` field in `package.json` limits what gets published:

```json
"files": ["dist", "README.md", "LICENSE", "CHANGELOG.md"]
```

Only compiled output, not source TypeScript files, goes to npm.

---

## ESM Import Convention

The project uses `"type": "module"` with NodeNext resolution. All internal imports must use `.js` extensions even though the actual files are `.ts`:

```typescript
// Correct
import { generateImage } from "./xai-client.js";

// Wrong (won't resolve with NodeNext)
import { generateImage } from "./xai-client";
```

This is a TypeScript/NodeNext quirk. The `.js` extension in the import is what the compiled `.js` file will have.

---

## Dependency Footprint

Dev dependencies only:

```json
"devDependencies": {
  "@types/node": "^22.0.0",
  "tsx": "^4.19.0",
  "typescript": "^5.7.0"
}
```

Zero runtime dependencies. Everything uses native Node.js APIs. No bundler, no transpiler in production, no extra packages in the published artifact.

---

## Clean Build

If you hit weird errors after editing `tsconfig.json` or moving files:

```bash
rm -rf dist && npm run build
```

---

## Type Check Only (No Output)

To just check types without generating output:

```bash
npx tsc --noEmit
```

Fast way to validate everything compiles before committing.
