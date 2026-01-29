/**
 * Continuity Video Pipeline — multi-clip coherent AI video generation
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateImage,
  submitVideoGeneration,
  pollVideoStatus,
  downloadFile,
  sleep,
} from "./xai-client.js";
import { extractLastFrame, concatVideos } from "./ffmpeg.js";
import { buildClipPrompt } from "./script-parser.js";
import type { ContinuityScript } from "./script-parser.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ClipResult {
  clipNumber: number;
  requestId: string;
  videoUrl?: string;
  localPath?: string;
  lastFramePath?: string;
  status: "pending" | "generating" | "complete" | "failed";
  error?: string;
  attempts: number;
}

export interface PipelineReport {
  title: string;
  totalClips: number;
  completedClips: number;
  failedClips: number;
  totalDuration: number;
  outputPath?: string;
  clips: ClipResult[];
  characterRefUrl?: string;
  characterRefPath?: string;
  totalCost: number;
}

export interface PipelineOptions {
  outputDir: string;
  maxRetries?: number;
  pollInterval?: number;
  pollMaxAttempts?: number;
  onUpdate?: (msg: string) => void;
}

// ─── Utility ───────────────────────────────────────────────────────────────

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function log(msg: string, onUpdate?: (msg: string) => void): void {
  console.log(msg);
  onUpdate?.(msg);
}

// ─── Pipeline ──────────────────────────────────────────────────────────────

export async function runContinuityPipeline(
  script: ContinuityScript,
  options: PipelineOptions,
): Promise<PipelineReport> {
  if (!script || !Array.isArray(script.clips) || script.clips.length === 0) {
    throw new Error(
      "runContinuityPipeline: script must contain at least one clip",
    );
  }
  if (!options.outputDir) {
    throw new Error("runContinuityPipeline: options.outputDir is required");
  }

  const {
    outputDir,
    maxRetries = 2,
    pollInterval = 5000,
    pollMaxAttempts = 60,
    onUpdate,
  } = options;

  const report: PipelineReport = {
    title: script.title,
    totalClips: script.clips.length,
    completedClips: 0,
    failedClips: 0,
    totalDuration: 0,
    clips: [],
    totalCost: 0,
  };

  mkdirSync(outputDir, { recursive: true });
  const clipsDir = join(outputDir, "clips");
  const framesDir = join(outputDir, "frames");
  mkdirSync(clipsDir, { recursive: true });
  mkdirSync(framesDir, { recursive: true });

  // ─── Phase 1: Character reference ────────────────────────────────

  let characterRefUrl: string | undefined;

  if (script.characterDescription) {
    log("[Phase 1] Generating character reference sheet...", onUpdate);

    try {
      const refPrompt = `Character reference sheet: ${script.characterDescription}. ${script.style || ""}. Front view, consistent features, detailed, high quality`;

      const refResult = await generateImage(
        refPrompt,
        "grok-imagine-image-pro",
        script.aspectRatio,
      );
      characterRefUrl = refResult.data?.[0]?.url;
      report.characterRefUrl = characterRefUrl;
      report.totalCost += 0.07;

      if (characterRefUrl) {
        const refPath = join(outputDir, "character-ref.jpg");
        await downloadFile(characterRefUrl, refPath);
        report.characterRefPath = refPath;
        log(`  Character ref: ${characterRefUrl}`, onUpdate);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(
        `  Warning: Character ref failed (${msg}), continuing without`,
        onUpdate,
      );
    }
  }

  // ─── Phase 2: Sequential clip generation ─────────────────────────

  let lastFrameUrl: string | undefined = characterRefUrl;

  for (const clip of script.clips) {
    log(
      `[Phase 2] Generating clip ${clip.clipNumber}/${script.clips.length}...`,
      onUpdate,
    );

    const clipResult: ClipResult = {
      clipNumber: clip.clipNumber,
      requestId: "",
      status: "generating",
      attempts: 0,
    };

    let success = false;

    for (let attempt = 0; attempt <= maxRetries && !success; attempt++) {
      clipResult.attempts = attempt + 1;

      try {
        const prompt = buildClipPrompt(script, clip, clip.clipNumber === 1);
        log(
          `  Clip ${clip.clipNumber} — submitting (attempt ${attempt + 1})...`,
          onUpdate,
        );

        const requestId = await submitVideoGeneration(
          prompt,
          clip.duration,
          script.aspectRatio,
          lastFrameUrl,
        );
        clipResult.requestId = requestId;
        report.totalCost += clip.duration * 0.05;

        log(
          `  Clip ${clip.clipNumber} — submitted (${requestId.substring(0, 8)}), polling...`,
          onUpdate,
        );

        const videoResult = await pollVideoStatus(
          requestId,
          (msg) => process.stdout.write(`\r  ${msg}`),
          pollMaxAttempts,
          pollInterval,
        );
        console.log(""); // newline after polling

        if (!videoResult.video?.url) {
          throw new Error("Video completed but no URL returned");
        }

        clipResult.videoUrl = videoResult.video.url;
        clipResult.status = "complete";

        const clipPath = join(
          clipsDir,
          `clip-${String(clip.clipNumber).padStart(3, "0")}.mp4`,
        );
        await downloadFile(videoResult.video.url, clipPath);
        clipResult.localPath = clipPath;

        // Extract last frame for anchoring
        try {
          const framePath = join(
            framesDir,
            `frame-${String(clip.clipNumber).padStart(3, "0")}.jpg`,
          );
          extractLastFrame(clipPath, framePath);
          clipResult.lastFramePath = framePath;
        } catch (frameErr) {
          const frameMsg =
            frameErr instanceof Error ? frameErr.message : String(frameErr);
          log(
            `  Warning: frame extraction failed for clip ${clip.clipNumber}: ${frameMsg}`,
            onUpdate,
          );
        }

        // Use video URL as anchor for next clip
        lastFrameUrl = videoResult.video.url;

        report.completedClips++;
        report.totalDuration += videoResult.video.duration || clip.duration;
        success = true;

        log(
          `  Clip ${clip.clipNumber} complete (${videoResult.video.duration}s)`,
          onUpdate,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (attempt >= maxRetries) {
          clipResult.status = "failed";
          clipResult.error = msg;
          report.failedClips++;
          log(
            `  Clip ${clip.clipNumber} FAILED after ${attempt + 1} attempts: ${msg}`,
            onUpdate,
          );
        } else {
          log(
            `  Clip ${clip.clipNumber} attempt ${attempt + 1} failed, retrying...`,
            onUpdate,
          );
          await sleep(3000);
        }
      }
    }

    report.clips.push(clipResult);

    if (clip.clipNumber < script.clips.length) {
      await sleep(1000);
    }
  }

  // ─── Phase 3: Stitch ─────────────────────────────────────────────

  const completedPaths = report.clips
    .filter((c) => c.status === "complete" && c.localPath)
    .sort((a, b) => a.clipNumber - b.clipNumber)
    .map((c) => c.localPath!);

  if (completedPaths.length >= 2) {
    log("[Phase 3] Stitching clips with FFmpeg...", onUpdate);
    const safeName = script.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const outputFile = join(outputDir, `${safeName}-${timestamp()}.mp4`);

    try {
      concatVideos(completedPaths, outputFile);
      report.outputPath = outputFile;
      log(`  Final video: ${outputFile}`, onUpdate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(
        `  Stitching failed: ${msg} — individual clips in ${clipsDir}`,
        onUpdate,
      );
    }
  } else if (completedPaths.length === 1) {
    report.outputPath = completedPaths[0];
    log(`  Single clip: ${completedPaths[0]}`, onUpdate);
  }

  // ─── Phase 4: Report ─────────────────────────────────────────────

  const reportPath = join(outputDir, "pipeline-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`\nReport saved: ${reportPath}`, onUpdate);

  return report;
}
