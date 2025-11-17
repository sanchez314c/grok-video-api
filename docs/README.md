# Documentation Index

This is the documentation hub for `grok-video-api`. Start here and follow the links to whatever you need.

## Getting Started

- [Quick Start](./QUICK_START.md) -- Clone to running video in 5 minutes
- [Installation](./INSTALLATION.md) -- Prerequisites, setup, API keys, FFmpeg, npm package usage
- [FAQ](./FAQ.md) -- Common questions about costs, drift thresholds, FFmpeg, and how the pipeline works

## Reference

- [API Reference](./API.md) -- Every exported function and type with signatures and examples
- [Architecture](./ARCHITECTURE.md) -- 4-phase director pipeline, provider interfaces, data flow, key design decisions
- [Tech Stack](./TECHSTACK.md) -- Full dependency list with versions and rationale for each choice

## Development

- [Development Guide](./DEVELOPMENT.md) -- Dev environment, build, adding providers, project conventions
- [Build & Compile](./BUILD_COMPILE.md) -- TypeScript compiler settings, ESM module system, watch mode, publish build
- [Workflow](./WORKFLOW.md) -- Git workflow, commit format, testing, release checklist

## Operations

- [Deployment](./DEPLOYMENT.md) -- Publishing to npm, global CLI install, library integration, server-side usage
- [Troubleshooting](./TROUBLESHOOTING.md) -- API errors, FFmpeg issues, build problems, common mistakes
- [FAQ](./FAQ.md) -- General questions, costs, pipeline behavior

## Project Context

- [PRD](./PRD.md) -- Product requirements, goals, non-goals, success criteria
- [Learnings](./LEARNINGS.md) -- Discoveries from 11+ production runs: prompting tips, drift thresholds, gotchas
- [TODO](./TODO.md) -- Known issues, planned features, tech debt

## Root-Level References

These live in the project root, not in `docs/`:

- [README](../README.md) -- Project overview, features, CLI usage, library examples, cost estimates
- [CONTRIBUTING](../CONTRIBUTING.md) -- How to contribute: branching, PR requirements, bug reports
- [SECURITY](../SECURITY.md) -- API key handling, output directory safety, FFmpeg execution, vulnerability reporting
- [CHANGELOG](../CHANGELOG.md) -- Version history and release notes
- [VERSION_MAP](../VERSION_MAP.md) -- Active version, history, archive locations
- [LICENSE](../LICENSE) -- MIT license

## AI Agent Docs

- [CLAUDE.md](../CLAUDE.md) -- AI assistant context for Claude Code and similar tools
- [AGENTS.md](../AGENTS.md) -- How AI agents should interact with this codebase

## Design Docs

These live in `dev/` and cover the initial build and future plans:

- [LLM-Directed Video Generation with Grok](../dev/LLM-Directed-Video-Generation-With-Grok.md) -- Full technical writeup from the initial build session (architecture, 11 production runs, learnings, API reference)
- [Next Phase: Smart Style Engine](../dev/NEXT-PHASE.md) -- Director presets, lens library, character archetypes, auto-style matching
