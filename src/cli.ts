#!/usr/bin/env tsx
/**
 * grok-video-api CLI
 *
 * Usage:
 *   tsx src/cli.ts pipeline <script-file>         Run continuity pipeline from script file
 *   tsx src/cli.ts pipeline --inline '...'         Run continuity pipeline from inline JSON
 *   tsx src/cli.ts generate <prompt> [options]     Generate a single video clip
 *   tsx src/cli.ts image <prompt> [options]         Generate an image
 *   tsx src/cli.ts status <request-id>             Check video generation status
 *   tsx src/cli.ts edit <video-url> <prompt>       Edit a video
 *   tsx src/cli.ts models                          List video generation models
 */

import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateImage,
  submitVideoGeneration,
  pollVideoStatus,
  submitVideoEdit,
  getVideoModels,
  getVideoStatus,
  downloadFile,
  getApiKey,
} from "./xai-client.js";
import { parseScript } from "./script-parser.js";
import { runContinuityPipeline } from "./pipeline.js";
import { runDirectorPipeline } from "./director.js";
import { checkFfmpeg } from "./ffmpeg.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function usage(): void {
  console.log(`
grok-video-api — Grok Video Continuity Pipeline

Commands:
  director <scene> [opts]          LLM-directed coherent video pipeline
  pipeline <script-file>           Run multi-clip continuity pipeline
  pipeline --inline '<json>'       Run pipeline from inline JSON script
  generate <prompt> [opts]         Generate a single video clip
  image <prompt> [opts]            Generate an image
  status <request-id>              Check video status
  edit <video-url> <prompt>        Edit a video
  models                           List video models

Options (director):
  --shots <n>                      Target shot count (default 8)
  --duration <n>                   Per-clip seconds (default 6)
  --drift <n>                      Drift threshold 0-100 (default 60)
  --retries <n>                    Max retries per shot (default 2)
  --style <style>                  Style directive
  --budget <n>                     Max spend in dollars (default 10.0)
  --output <dir>                   Output directory
  --aspect <ratio>                 Aspect ratio (default 16:9)
  --source-image <url>             Use existing image URL as character ref (skips generation)

Options (generate):
  --duration <n>                   Duration in seconds (1-15, default 6)
  --aspect <ratio>                 Aspect ratio (default 16:9)
  --ref <image-url>                Reference image URL for anchoring

Options (image):
  --model <name>                   grok-imagine-image or grok-imagine-image-pro
  --aspect <ratio>                 Aspect ratio
  --count <n>                      Number of images (1-10)

Options (pipeline):
  --output <dir>                   Output directory
  --character <desc>               Character description override
  --style <style>                  Style override

Environment:
  XAI_API_KEY                      Required. Your xAI API key.
`);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function parseArgs(args: string[]): {
  positional: string[];
  flags: Record<string, string>;
} {
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags[key] = args[i + 1];
        i++;
      } else {
        // Boolean flag with no value — treat as empty string
        flags[key] = "";
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, flags };
}

// ─── Commands ──────────────────────────────────────────────────────────────

async function cmdDirector(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const scene = positional.join(" ");

  if (!scene) {
    console.error("Error: Provide a scene description");
    console.error(
      'Example: tsx src/cli.ts director "A woman walks through a rainy city" --shots 3 --style "cyberpunk noir"',
    );
    process.exit(1);
  }

  const shots = Math.max(1, parseInt(flags.shots || "8", 10));
  const duration = Math.min(
    15,
    Math.max(1, parseInt(flags.duration || "6", 10)),
  );
  const driftThreshold = Math.min(
    100,
    Math.max(0, parseInt(flags.drift || "60", 10)),
  );
  const maxRetries = Math.max(0, parseInt(flags.retries || "2", 10));
  const budget = Math.max(0.5, parseFloat(flags.budget || "10.0"));
  const style = flags.style;
  const aspectRatio = flags.aspect || "16:9";
  const outputDir =
    flags.output || resolve("output", `director-${timestamp()}`);

  const estimatedMin = 0.07 + shots * duration * 0.05 + shots * 0.02 + 0.05;
  const estimatedMax =
    estimatedMin + shots * maxRetries * (duration * 0.05 + 0.02);

  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║  GROK VIDEO DIRECTOR — LLM-Orchestrated Pipeline     ║`);
  console.log(`╠═══════════════════════════════════════════════════════╣`);
  console.log(`║  Scene: ${scene.slice(0, 44).padEnd(44)} ║`);
  console.log(`║  Shots: ${String(shots).padEnd(44)} ║`);
  console.log(`║  Duration: ${(duration + "s per clip").padEnd(41)} ║`);
  console.log(`║  Drift threshold: ${(driftThreshold + "/100").padEnd(34)} ║`);
  console.log(`║  Max retries: ${String(maxRetries).padEnd(38)} ║`);
  console.log(`║  Budget: $${budget.toFixed(2).padEnd(42)} ║`);
  console.log(`║  Style: ${(style || "(auto)").slice(0, 44).padEnd(44)} ║`);
  console.log(
    `║  Est. cost: $${estimatedMin.toFixed(2)} - $${estimatedMax.toFixed(2).padEnd(34)} ║`,
  );
  console.log(`║  Output: ${outputDir.slice(-43).padEnd(43)} ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝\n`);

  const sourceImageUrl = flags["source-image"];

  const report = await runDirectorPipeline({
    scene,
    shots,
    duration,
    style,
    driftThreshold,
    maxRetries,
    budget,
    outputDir,
    aspectRatio,
    sourceImageUrl,
  });

  if (report.outputPath) {
    console.log(`\nFinal video: ${report.outputPath}`);
  }
  console.log(`Total cost: ~$${report.totalCost.toFixed(2)}`);
}

async function cmdPipeline(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);

  let scriptRaw: string;

  if (flags.inline) {
    scriptRaw = flags.inline;
  } else if (positional.length > 0) {
    const scriptPath = resolve(positional[0]);
    scriptRaw = readFileSync(scriptPath, "utf-8");
  } else {
    console.error("Error: Provide a script file path or --inline JSON");
    process.exit(1);
  }

  const script = parseScript(scriptRaw);

  if (flags.character && !script.characterDescription) {
    script.characterDescription = flags.character;
  }
  if (flags.style && !script.style) {
    script.style = flags.style;
  }

  if (script.clips.length === 0) {
    console.error("Error: Script contains no clips");
    process.exit(1);
  }

  if (!checkFfmpeg()) {
    console.warn("Warning: FFmpeg not found — clips will not be stitched");
  }

  const outputDir =
    flags.output || resolve("output", `pipeline-${timestamp()}`);

  const estimatedCost =
    (script.characterDescription ? 0.07 : 0) +
    script.clips.reduce((sum, c) => sum + c.duration * 0.05, 0);

  console.log(`\n=== CONTINUITY PIPELINE ===`);
  console.log(`Title: ${script.title}`);
  console.log(`Clips: ${script.clips.length}`);
  console.log(`Character: ${script.characterDescription || "(none)"}`);
  console.log(`Style: ${script.style || "(none)"}`);
  console.log(`Estimated cost: $${estimatedCost.toFixed(2)}`);
  console.log(`Output: ${outputDir}\n`);

  const report = await runContinuityPipeline(script, { outputDir });

  console.log(`\n=== RESULTS ===`);
  console.log(`Completed: ${report.completedClips}/${report.totalClips}`);
  console.log(`Failed: ${report.failedClips}`);
  console.log(`Duration: ${report.totalDuration.toFixed(1)}s`);
  console.log(`Cost: ~$${report.totalCost.toFixed(2)}`);
  if (report.outputPath) console.log(`Final video: ${report.outputPath}`);
  if (report.characterRefUrl)
    console.log(`Character ref: ${report.characterRefUrl}`);

  for (const clip of report.clips) {
    const icon = clip.status === "complete" ? "OK" : "FAIL";
    console.log(
      `  Clip ${clip.clipNumber}: [${icon}] ${clip.attempts} attempt(s)${clip.videoUrl ? ` — ${clip.videoUrl}` : ""}${clip.error ? ` — ${clip.error}` : ""}`,
    );
  }
}

async function cmdGenerate(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const prompt = positional.join(" ");

  if (!prompt) {
    console.error("Error: Provide a prompt");
    process.exit(1);
  }

  const duration = Math.min(
    15,
    Math.max(1, parseInt(flags.duration || "6", 10)),
  );
  const aspectRatio = flags.aspect || "16:9";
  const refImageUrl = flags.ref;

  const cost = duration * 0.05;
  console.log(`Generating video (~$${cost.toFixed(2)})...`);
  console.log(`  Prompt: ${prompt}`);
  console.log(`  Duration: ${duration}s`);
  console.log(`  Aspect: ${aspectRatio}`);
  if (refImageUrl) console.log(`  Ref image: ${refImageUrl}`);

  const requestId = await submitVideoGeneration(
    prompt,
    duration,
    aspectRatio,
    refImageUrl,
  );
  console.log(`  Request ID: ${requestId}`);

  const result = await pollVideoStatus(requestId, (msg) =>
    process.stdout.write(`\r  ${msg}`),
  );
  console.log("");

  if (!result.video?.url) {
    console.error("Error: No video URL returned");
    process.exit(1);
  }

  const outputDir = resolve("output");
  mkdirSync(outputDir, { recursive: true });
  const filePath = resolve(outputDir, `${Date.now()}.mp4`);
  await downloadFile(result.video.url, filePath);

  console.log(`\nDuration: ${result.video.duration}s`);
  console.log(`URL: ${result.video.url}`);
  console.log(`Local: ${filePath}`);
}

async function cmdImage(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const prompt = positional.join(" ");

  if (!prompt) {
    console.error("Error: Provide a prompt");
    process.exit(1);
  }

  const model = (flags.model || "grok-imagine-image") as
    | "grok-imagine-image"
    | "grok-imagine-image-pro";
  const aspectRatio = flags.aspect || "1:1";
  const count = Math.min(10, Math.max(1, parseInt(flags.count || "1", 10)));

  console.log(`Generating ${count} image(s)...`);

  const result = await generateImage(prompt, model, aspectRatio, count);

  const outputDir = resolve("output");
  mkdirSync(outputDir, { recursive: true });

  for (let i = 0; i < (result.data?.length || 0); i++) {
    const url = result.data[i].url;
    if (!url) continue;

    const filePath = resolve(outputDir, `${Date.now()}-${i}.jpg`);
    await downloadFile(url, filePath);
    console.log(`Image ${i + 1}: ${url}`);
    console.log(`  Local: ${filePath}`);
  }
}

async function cmdStatus(args: string[]): Promise<void> {
  const requestId = args[0];
  if (!requestId) {
    console.error("Error: Provide a request ID");
    process.exit(1);
  }

  const { status, data } = await getVideoStatus(requestId);
  console.log(`HTTP Status: ${status}`);
  console.log(JSON.stringify(data, null, 2));
}

async function cmdEdit(args: string[]): Promise<void> {
  const videoUrl = args[0];
  const prompt = args.slice(1).join(" ");

  if (!videoUrl || !prompt) {
    console.error("Error: Provide <video-url> <prompt>");
    process.exit(1);
  }

  console.log(`Submitting video edit...`);
  const requestId = await submitVideoEdit(prompt, videoUrl);
  console.log(`Request ID: ${requestId}`);
  console.log(`Poll with: tsx src/cli.ts status ${requestId}`);
}

async function cmdModels(): Promise<void> {
  const result = await getVideoModels();
  console.log(JSON.stringify(result, null, 2));
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const commandArgs = args.slice(1);

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    usage();
    return;
  }

  try {
    getApiKey(); // validate early
  } catch {
    console.error("Error: XAI_API_KEY environment variable is not set");
    process.exit(1);
  }

  switch (command) {
    case "director":
    case "direct":
      await cmdDirector(commandArgs);
      break;
    case "pipeline":
      await cmdPipeline(commandArgs);
      break;
    case "generate":
    case "gen":
    case "video":
      await cmdGenerate(commandArgs);
      break;
    case "image":
    case "img":
      await cmdImage(commandArgs);
      break;
    case "status":
    case "poll":
      await cmdStatus(commandArgs);
      break;
    case "edit":
      await cmdEdit(commandArgs);
      break;
    case "models":
      await cmdModels();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message || err}`);
  process.exit(1);
});
