# Version Map

## Current Version

**0.1.1** (2026-03-07)

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 0.1.1 | 2026-03-14 | Full compliance audit: .gitignore, .nvmrc (24), .editorconfig, run scripts (linux/mac/win), AGENTS.md sync, author metadata, resources/icons, tests/, legacy/ dirs |
| 0.1.1 | 2026-03-07 | Documentation overhaul, 10 new docs, README rewrite, CONTRIBUTING fix |
| 0.1.0 | 2026-02-28 | Initial release: Director Pipeline, Continuity Pipeline, CLI, Provider Interfaces |

## Source Locations

| Component | Path |
|-----------|------|
| Source code | `src/` |
| Compiled output | `dist/` |
| npm package | `grok-video-api@0.1.1` |
| Package manifest | `package.json` |
| Tests | `tests/` |
| Legacy/deprecated | `legacy/` |
| Icons/resources | `resources/icons/` |
| Dev specs | `dev/` |
| Docs | `docs/` |

## Release Artifacts

Each release includes:

- `dist/` directory with compiled JS, declaration files, and source maps
- `dist/cli.js` is the global CLI binary (`grok-video` command)
- `dist/index.js` + `dist/index.d.ts` is the library entry point

## Archive Locations

| What | Where |
|------|-------|
| Merged pipeline docs | `archive/merged/PIPELINE.md` |
| Design documents | `dev/LLM-Directed-Video-Generation-With-Grok.md` |
| Style engine spec | `dev/NEXT-PHASE.md` |

## Version Tracking

The version is defined in one place: `package.json` (`"version": "0.1.1"`). The CHANGELOG.md mirrors this with release dates and notes.

When bumping:
1. Update `package.json` version
2. Add a new section to `CHANGELOG.md` with the date
3. Run `npm run build` to compile
4. Tag with `git tag v0.1.x`
