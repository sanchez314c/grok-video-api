# Security Policy

## Reporting a Vulnerability

Don't open a public issue for security bugs. Use GitHub Security Advisories instead:

1. Go to the [Security Advisories page](https://github.com/sanchez314c/grok-video-api/security/advisories) for this repo
2. Click "Report a vulnerability"
3. Fill in the details and submit

You can also reach **J. Michaels** directly on GitHub: [sanchez314c](https://github.com/sanchez314c)

I'll acknowledge reports within 48 hours. Critical issues get patched within 7 days.

## API Key Storage

This tool authenticates against the xAI API with a bearer token loaded from the `XAI_API_KEY` environment variable. There is no config file parser, no `.env` loader library, and no hardcoded credentials in the source.

How the key flows:

- `getApiKey()` in `src/xai-client.ts` reads `process.env.XAI_API_KEY`
- If the key is missing, the CLI exits immediately before any network calls
- Every request to `https://api.x.ai/v1` sends it as `Authorization: Bearer <key>`
- The key is never logged, never written to disk, and never included in output files (reports, director logs, etc.)

If you use a `.env` file for local development, make sure it's in your `.gitignore`. The `.npmignore` already excludes `.env` and `.env.*` from published packages.

## No Keys in Source

The codebase contains zero hardcoded API keys, tokens, or secrets. The only secret this tool needs is `XAI_API_KEY`, and it comes exclusively from the environment. There are no fallback values, no default keys, and no test keys baked into the code.

Best practices:

- Never pass the key as a CLI argument. It shows up in shell history and `ps` output.
- Rotate your key at [console.x.ai](https://console.x.ai) if you suspect exposure.
- Use separate keys for dev and production if you're integrating this as a library.
- Don't commit `.env` files. Ever.

## Output Directory Permissions

The pipeline creates files and directories under the `--output` path (defaults to `./output/`). It writes `.mp4` video clips, `.jpg` frame captures, `.json` reports, and `.txt` director logs.

Things to know:

- Directories are created with `mkdirSync({ recursive: true })`, which inherits your umask
- Director reports and logs contain your scene descriptions, prompts, and cost data
- Character reference images are downloaded and saved locally
- No path traversal sanitization is applied to the `--output` flag

If you're exposing this pipeline through a web API or any context where the output path could come from untrusted input, validate and sanitize that path yourself before passing it to the pipeline. The scene description gets slugified into the final video filename (only alphanumeric characters and hyphens survive), but the output directory is used as-is.

## FFmpeg Command Injection

The `src/ffmpeg.ts` module shells out to `ffmpeg` and `ffprobe` via `execSync`. File paths are passed to these commands using string interpolation with double-quote wrapping. The paths come from:

1. The `--output` directory (user-provided)
2. Internal naming patterns (`clip-001.mp4`, `shot-001-attempt-1.jpg`, etc.)

For CLI usage this is fine. If you're building a web service on top of this library, treat the output directory and scene description as untrusted input and sanitize them before they reach the pipeline.

## Dependency Auditing

This project has **zero runtime dependencies**. All HTTP requests use native Node.js `fetch`. All file operations use `node:fs` and `node:path`. FFmpeg calls use `node:child_process`.

Dev dependencies are just three packages: `typescript`, `tsx`, and `@types/node`.

To audit:

```bash
npm audit
```

The attack surface is minimal by design. No request libraries, no config parsers, no template engines, nothing that adds transitive dependency risk.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
