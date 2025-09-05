# Changelog

## [0.1.1] — 2026-03-22

- Documentation standardization (2026-03-22): Gap analysis of 27 standard documentation files. All files already present and complete from prior audit passes. No files created or modified. PIPELINE_LOG.md updated.

## [0.1.1] — 2026-03-07

- Added 10 project documentation files (2026-03-07 23:55 CST):
  - SECURITY.md: API key handling, output directory safety, FFmpeg command injection, vulnerability reporting via GitHub Security Advisories
  - CLAUDE.md: AI assistant context with architecture, file structure, all CLI commands, cost reference
  - AGENTS.md: AI agent integration guide with entry points, conventions, testing, provider extension
  - .github/ISSUE_TEMPLATE/bug_report.md: Bug report template with environment and pipeline output sections
  - .github/ISSUE_TEMPLATE/feature_request.md: Feature request template
  - .github/PULL_REQUEST_TEMPLATE.md: PR template with checklist
  - docs/README.md: Documentation index linking all project docs
  - docs/ARCHITECTURE.md: 4-phase director pipeline, provider interfaces, data flow, error recovery
  - docs/INSTALLATION.md: Prerequisites, setup steps, API key config, FFmpeg, npm package usage
  - docs/DEVELOPMENT.md: Dev environment, build commands, adding providers, testing, conventions
- Rewrote README.md with full documentation: architecture diagram, all CLI commands and options, library usage examples, cost estimates, project structure, style tips, and configuration details
- Updated CHANGELOG.md with current format
- Documentation cleanup: fixed wrong GitHub URL in CONTRIBUTING.md (sanchez314c -> heathen-admin), removed em dashes, removed dead CODE_OF_CONDUCT.md link, removed empty screenshots placeholder from README, bumped package.json version to match changelog

## [0.1.0] — 2026-02-28

**Initial Release**

- LLM Director Pipeline: AI film director orchestrates coherent multi-clip video generation
  - Character bible generation (appearance, wardrobe, distinguishing features, color palette)
  - Character reference image generation via `grok-imagine-image-pro`
  - Shot plan decomposition (camera, lighting, environment, transitions)
  - Per-shot generation loop with drift analysis and correction
  - FFmpeg stitching of accepted clips into final video
  - Budget tracking and enforcement ($0.05/sec video, $0.07/image, $0.20-0.50/M tokens)
- Continuity Pipeline: Script-driven multi-clip generation (no LLM)
- xAI API Client: Zero-dependency fetch-based client for image, video, chat, and vision APIs
- FFmpeg Utilities: Frame extraction, video concatenation, metadata probing
- Script Parser: JSON and simplified text format support
- CLI: 7 commands (director, pipeline, generate, image, status, edit, models)
- Provider Interfaces: Abstract `ImageProvider`, `VideoProvider`, `LLMProvider`, `VisionProvider`, `VoiceProvider` for multi-provider systems
- `XaiApiError` class with HTTP status, retryability classification, and structured error data
- `FfmpegError` class with command and stderr capture
- `onProgress` callback on Director Pipeline for real-time WebSocket/SSE integration
- TypeScript strict mode, ESM modules, NodeNext resolution
- Zero external runtime dependencies (native fetch)
