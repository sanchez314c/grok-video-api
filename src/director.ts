/**
 * LLM Director Pipeline — An LLM orchestrates coherent multi-clip video
 *
 * The Director writes prompts, analyzes drift, corrects course, and
 * maintains character/style/scene consistency across all clips.
 */

import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chatCompletion,
  visionAnalysis,
  generateImage,
  submitVideoGeneration,
  pollVideoStatus,
  downloadFile,
  sleep,
} from "./xai-client.js";
import type { ChatMessage, ChatCompletionResponse } from "./xai-client.js";
import { extractLastFrame, concatVideos, checkFfmpeg } from "./ffmpeg.js";
import type { OnProgress, ProgressEvent } from "./types.js";

// ─── Default Model Constants ────────────────────────────────────────────────

/** Default model for the Director LLM (writes prompts, plans shots, analyzes drift) */
export const DEFAULT_DIRECTOR_MODEL = "grok-4-1-fast-non-reasoning";
/** Default model for vision drift analysis */
export const DEFAULT_VISION_MODEL = "grok-4-1-fast-non-reasoning";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DirectorConfig {
  scene: string;
  shots: number;
  duration: number;
  style?: string;
  driftThreshold: number;
  maxRetries: number;
  budget: number;
  outputDir: string;
  aspectRatio?: string;
  directorModel?: string;
  visionModel?: string;
  /** Progress callback for real-time updates (WebSocket integration) */
  onProgress?: OnProgress;
  /** URL to an existing source image — skips character-ref generation, uses this as anchor */
  sourceImageUrl?: string;
}

export interface CharacterBible {
  name: string;
  physicalDescription: string;
  wardrobe: string;
  distinguishingFeatures: string;
  colorPalette: string[];
  artStyle: string;
}

export interface ShotPlan {
  shots: Array<{
    shotNumber: number;
    action: string;
    camera: string;
    lighting: string;
    environment: string;
    transitionFromPrevious: string;
  }>;
}

export interface DriftScore {
  character: number;
  wardrobe: number;
  environment: number;
  style: number;
  continuity: number;
  total: number;
  notes: string;
}

export interface DirectorShotResult {
  shotNumber: number;
  accepted: boolean;
  attempts: number;
  videoUrl?: string;
  localPath?: string;
  lastFramePath?: string;
  prompt: string;
  driftScore?: DriftScore;
  error?: string;
}

export interface DirectorReport {
  scene: string;
  config: DirectorConfig;
  characterBible?: CharacterBible;
  shotPlan?: ShotPlan;
  shots: DirectorShotResult[];
  completedShots: number;
  failedShots: number;
  totalDuration: number;
  totalCost: number;
  outputPath?: string;
  characterRefUrl?: string;
  characterRefPath?: string;
  startTime: string;
  endTime: string;
}

export interface DirectorLogEntry {
  timestamp: string;
  phase: string;
  message: string;
  data?: unknown;
}

// ─── Director Conversation ─────────────────────────────────────────────────

class DirectorConversation {
  private messages: ChatMessage[] = [];
  private model: string;
  private log: DirectorLogEntry[] = [];
  public inputTokens = 0;
  public outputTokens = 0;

  constructor(model: string) {
    this.model = model;
    this.messages.push({
      role: "system",
      content: `You are a film director AI. You write precise, detailed video generation prompts that maintain perfect visual continuity across sequential clips. You are methodical about character appearance, wardrobe, lighting, camera angles, and environment details. When given feedback about visual drift, you adjust your prompts to correct it. You always respond in the exact JSON format requested.`,
    });
  }

  async send(
    userMessage: string,
    jsonMode = true,
  ): Promise<{ content: string; usage: ChatCompletionResponse["usage"] }> {
    this.messages.push({ role: "user", content: userMessage });

    const result = await chatCompletion({
      model: this.model,
      messages: this.messages,
      temperature: 0.7,
      max_tokens: 4096,
      response_format: jsonMode ? { type: "json_object" } : undefined,
    });

    const reply = result.choices[0]?.message?.content || "";
    this.messages.push({ role: "assistant", content: reply });

    this.inputTokens += result.usage.prompt_tokens;
    this.outputTokens += result.usage.completion_tokens;

    return { content: reply, usage: result.usage };
  }

  addLog(phase: string, message: string, data?: unknown): void {
    this.log.push({
      timestamp: new Date().toISOString(),
      phase,
      message,
      data,
    });
  }

  getLog(): DirectorLogEntry[] {
    return this.log;
  }

  getLogText(): string {
    return this.log
      .map((entry) => {
        let line = `[${entry.timestamp}] [${entry.phase}] ${entry.message}`;
        if (entry.data)
          line += `\n  ${JSON.stringify(entry.data, null, 2).split("\n").join("\n  ")}`;
        return line;
      })
      .join("\n\n");
  }

  getCost(): number {
    const directorInputCost = (this.inputTokens / 1_000_000) * 0.2;
    const directorOutputCost = (this.outputTokens / 1_000_000) * 0.5;
    return directorInputCost + directorOutputCost;
  }
}

// ─── Utility ───────────────────────────────────────────────────────────────

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function log(
  msg: string,
  onProgress?: OnProgress,
  progressEvent?: Partial<ProgressEvent>,
): void {
  console.log(msg);
  if (onProgress) {
    onProgress({
      type: progressEvent?.type || "info",
      message: msg.trim(),
      progress: progressEvent?.progress,
      phase: progressEvent?.phase,
      data: progressEvent?.data,
      timestamp: new Date().toISOString(),
    });
  }
}

/** Emit a structured progress event without console logging */
function emitProgress(
  onProgress: OnProgress | undefined,
  type: ProgressEvent["type"],
  message: string,
  phase?: string,
  progress?: number,
  data?: unknown,
): void {
  if (!onProgress) return;
  onProgress({
    type,
    message,
    progress,
    phase,
    data,
    timestamp: new Date().toISOString(),
  });
}

function imageToBase64DataUri(filePath: string): string {
  const buffer = readFileSync(filePath);
  const base64 = buffer.toString("base64");
  return `data:image/jpeg;base64,${base64}`;
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Try to extract JSON from markdown code blocks
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim()) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── Pipeline Phases ───────────────────────────────────────────────────────

async function generateCharacterBible(
  director: DirectorConversation,
  scene: string,
  style?: string,
): Promise<CharacterBible> {
  director.addLog(
    "character-bible",
    "Requesting character bible from Director...",
  );

  const prompt = `Analyze this scene and create a detailed character bible for the main character. The video will be in ${style || "cinematic"} style.

Scene: "${scene}"

Respond with JSON:
{
  "name": "character name or description",
  "physicalDescription": "detailed physical appearance — face shape, skin tone, hair color/style/length, eye color, age range, build",
  "wardrobe": "exact outfit description — every garment, color, texture, accessories",
  "distinguishingFeatures": "tattoos, scars, jewelry, unique features that must stay consistent",
  "colorPalette": ["hex color 1", "hex color 2", "..."],
  "artStyle": "visual style directive for consistent rendering"
}`;

  const { content } = await director.send(prompt);
  const bible = safeJsonParse<CharacterBible>(content);

  if (!bible) {
    throw new Error(
      `Director returned invalid character bible: ${content.slice(0, 200)}`,
    );
  }

  director.addLog("character-bible", "Character bible generated", bible);
  return bible;
}

async function decomposeShotPlan(
  director: DirectorConversation,
  scene: string,
  shotCount: number,
  duration: number,
): Promise<ShotPlan> {
  director.addLog("shot-plan", `Requesting ${shotCount}-shot decomposition...`);

  const prompt = `Decompose this scene into exactly ${shotCount} sequential shots. Each shot will be a ${duration}-second video clip. The clips will be played back-to-back, so ensure smooth visual transitions between them.

Scene: "${scene}"

Respond with JSON:
{
  "shots": [
    {
      "shotNumber": 1,
      "action": "what happens in this shot — be specific about character movement and position",
      "camera": "camera angle, movement, framing (e.g., 'medium close-up, slowly tracking left')",
      "lighting": "lighting conditions (e.g., 'neon blue and pink from above, rain reflections')",
      "environment": "background and setting details visible in this shot",
      "transitionFromPrevious": "how this shot connects to the previous one (empty for shot 1)"
    }
  ]
}`;

  const { content } = await director.send(prompt);
  const plan = safeJsonParse<ShotPlan>(content);

  if (!plan || !plan.shots || plan.shots.length === 0) {
    throw new Error(
      `Director returned invalid shot plan: ${content.slice(0, 200)}`,
    );
  }

  director.addLog("shot-plan", `Shot plan: ${plan.shots.length} shots`, plan);
  return plan;
}

async function writeVideoPrompt(
  director: DirectorConversation,
  bible: CharacterBible,
  shot: ShotPlan["shots"][0],
  driftFeedback?: string,
): Promise<string> {
  let prompt: string;

  if (driftFeedback) {
    prompt = `The previous attempt for shot ${shot.shotNumber} had visual drift issues:

${driftFeedback}

Rewrite the video generation prompt for shot ${shot.shotNumber}, correcting these drift issues while maintaining all continuity requirements. The prompt must be self-contained — the video model has no memory of previous prompts.

IMPORTANT: Keep the video prompt under 300 words. Be dense and specific, not verbose.

Respond with JSON:
{"prompt": "the complete video generation prompt"}`;
  } else {
    prompt = `Write a video generation prompt for shot ${shot.shotNumber}. The prompt must be completely self-contained — the video model has no memory of previous prompts. Include ALL character details, ALL environment details, and ALL style directives in every prompt.

Character reference:
- ${bible.physicalDescription}
- Wardrobe: ${bible.wardrobe}
- Features: ${bible.distinguishingFeatures}
- Style: ${bible.artStyle}

Shot details:
- Action: ${shot.action}
- Camera: ${shot.camera}
- Lighting: ${shot.lighting}
- Environment: ${shot.environment}
${shot.transitionFromPrevious ? `- Transition: ${shot.transitionFromPrevious}` : ""}

IMPORTANT: Keep the video prompt under 300 words. Be dense and specific, not verbose.

Respond with JSON:
{"prompt": "the complete video generation prompt — must be vivid, specific, and include full character description"}`;
  }

  const { content } = await director.send(prompt);
  const result = safeJsonParse<{ prompt: string }>(content);

  if (result?.prompt) {
    return result.prompt;
  }

  // Fallback: try to extract prompt text from partial/malformed response
  const promptMatch = content.match(/"prompt"\s*:\s*"([\s\S]+?)(?:"|$)/);
  if (promptMatch) {
    return promptMatch[1].replace(/\\n/g, " ").replace(/\\"/g, '"');
  }

  throw new Error(
    `Director returned invalid video prompt: ${content.slice(0, 200)}`,
  );
}

async function analyzeDrift(
  visionModel: string,
  characterRefPath: string,
  framePath: string,
  bible: CharacterBible,
  shotDescription: string,
): Promise<{ score: DriftScore; visionCost: number }> {
  const characterRefUri = imageToBase64DataUri(characterRefPath);
  const frameUri = imageToBase64DataUri(framePath);

  const prompt = `Compare these two images. The first is the CHARACTER REFERENCE — the canonical appearance. The second is a FRAME from a generated video clip.

Character should match:
- Physical: ${bible.physicalDescription}
- Wardrobe: ${bible.wardrobe}
- Features: ${bible.distinguishingFeatures}
- Expected scene: ${shotDescription}

Score each dimension 0-20 (20 = perfect match):

Respond with JSON:
{
  "character": <0-20 physical appearance match>,
  "wardrobe": <0-20 clothing/accessories match>,
  "environment": <0-20 scene/setting appropriateness>,
  "style": <0-20 art style consistency>,
  "continuity": <0-20 overall coherence with reference>,
  "total": <sum of all scores, 0-100>,
  "notes": "brief description of any drift issues detected"
}`;

  const { content, usage } = await visionAnalysis(
    visionModel,
    prompt,
    [characterRefUri, frameUri],
    { type: "json_object" },
  );

  const score = safeJsonParse<DriftScore>(content);
  if (!score) {
    // If vision fails to parse, give benefit of the doubt
    return {
      score: {
        character: 15,
        wardrobe: 15,
        environment: 15,
        style: 15,
        continuity: 15,
        total: 75,
        notes: "Vision analysis returned unparseable response — auto-accepting",
      },
      visionCost:
        (usage.prompt_tokens / 1_000_000) * 2.0 +
        (usage.completion_tokens / 1_000_000) * 10.0,
    };
  }

  // Recalculate total to be safe
  score.total =
    score.character +
    score.wardrobe +
    score.environment +
    score.style +
    score.continuity;

  const visionCost =
    (usage.prompt_tokens / 1_000_000) * 2.0 +
    (usage.completion_tokens / 1_000_000) * 10.0;
  return { score, visionCost };
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────

export async function runDirectorPipeline(
  config: DirectorConfig,
): Promise<DirectorReport> {
  const directorModel = config.directorModel || DEFAULT_DIRECTOR_MODEL;
  const visionModel = config.visionModel || DEFAULT_VISION_MODEL;
  const aspectRatio = config.aspectRatio || "16:9";
  const startTime = new Date().toISOString();
  const onProgress = config.onProgress;

  const director = new DirectorConversation(directorModel);
  let totalCost = 0;

  const report: DirectorReport = {
    scene: config.scene,
    config,
    shots: [],
    completedShots: 0,
    failedShots: 0,
    totalDuration: 0,
    totalCost: 0,
    startTime,
    endTime: "",
  };

  // Setup output directories
  mkdirSync(config.outputDir, { recursive: true });
  const clipsDir = join(config.outputDir, "clips");
  const framesDir = join(config.outputDir, "frames");
  const attemptsDir = join(config.outputDir, "attempts");
  mkdirSync(clipsDir, { recursive: true });
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(attemptsDir, { recursive: true });

  const hasFfmpeg = checkFfmpeg();
  if (!hasFfmpeg) {
    log(
      "WARNING: FFmpeg not found — drift analysis via frame extraction will be skipped, clips will not be stitched",
      onProgress,
      { type: "info", phase: "setup" },
    );
  }

  // ─── Phase 1: Character Bible ─────────────────────────────────────

  log("\n═══════════════════════════════════════════════════════", onProgress);
  log("  PHASE 1: CHARACTER BIBLE", onProgress, {
    type: "phase",
    phase: "character-bible",
    progress: 5,
  });
  log("═══════════════════════════════════════════════════════\n", onProgress);

  const bible = await generateCharacterBible(
    director,
    config.scene,
    config.style,
  );
  report.characterBible = bible;
  totalCost += director.getCost();

  log(`  Character: ${bible.name}`, onProgress, {
    type: "info",
    phase: "character-bible",
    data: bible,
  });
  log(`  Look: ${bible.physicalDescription.slice(0, 100)}...`, onProgress);
  log(`  Wardrobe: ${bible.wardrobe.slice(0, 100)}...`, onProgress);

  // Save character bible
  writeFileSync(
    join(config.outputDir, "character-bible.json"),
    JSON.stringify(bible, null, 2),
  );

  // Character reference image — use source image if provided, otherwise generate
  let characterRefPath: string | undefined;

  if (config.sourceImageUrl) {
    log(
      "\n  Using provided source image as character reference...",
      onProgress,
      { type: "processing", phase: "character-ref", progress: 10 },
    );
    try {
      characterRefPath = join(config.outputDir, "character-ref.jpg");
      await downloadFile(config.sourceImageUrl, characterRefPath);
      report.characterRefUrl = config.sourceImageUrl;
      report.characterRefPath = characterRefPath;
      log(
        `  Source image saved as character ref: ${characterRefPath}`,
        onProgress,
        {
          type: "complete",
          phase: "character-ref",
          progress: 15,
          data: { url: config.sourceImageUrl },
        },
      );
      director.addLog("character-ref", "Using provided source image", {
        url: config.sourceImageUrl,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  WARNING: Source image download failed: ${msg}`, onProgress, {
        type: "error",
        phase: "character-ref",
      });
      director.addLog("character-ref", `Source image failed: ${msg}`);
    }
  } else {
    log("\n  Generating character reference image...", onProgress, {
      type: "processing",
      phase: "character-ref",
      progress: 10,
    });
    try {
      const refPrompt = `Character portrait, ${bible.artStyle}: ${bible.physicalDescription}. ${bible.wardrobe}. ${bible.distinguishingFeatures}. ${config.style || ""}. Highly detailed, consistent features, studio quality`;
      const refResult = await generateImage(
        refPrompt,
        "grok-imagine-image-pro",
        aspectRatio,
      );
      const refUrl = refResult.data?.[0]?.url;
      totalCost += 0.07;

      if (refUrl) {
        characterRefPath = join(config.outputDir, "character-ref.jpg");
        await downloadFile(refUrl, characterRefPath);
        report.characterRefUrl = refUrl;
        report.characterRefPath = characterRefPath;
        log(`  Character ref saved: ${characterRefPath}`, onProgress, {
          type: "complete",
          phase: "character-ref",
          progress: 15,
          data: { url: refUrl },
        });
        director.addLog(
          "character-ref",
          "Character reference image generated",
          { url: refUrl },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  WARNING: Character ref generation failed: ${msg}`, onProgress, {
        type: "error",
        phase: "character-ref",
      });
      director.addLog("character-ref", `Failed: ${msg}`);
    }
  }

  if (totalCost > config.budget) {
    log(
      `\n  BUDGET EXCEEDED after character phase ($${totalCost.toFixed(2)} > $${config.budget})`,
      onProgress,
      { type: "error", phase: "budget" },
    );
    report.totalCost = totalCost;
    report.endTime = new Date().toISOString();
    return report;
  }

  // ─── Phase 2: Shot Plan ───────────────────────────────────────────

  log("\n═══════════════════════════════════════════════════════", onProgress);
  log("  PHASE 2: SHOT PLAN DECOMPOSITION", onProgress, {
    type: "phase",
    phase: "shot-plan",
    progress: 20,
  });
  log("═══════════════════════════════════════════════════════\n", onProgress);

  const shotPlan = await decomposeShotPlan(
    director,
    config.scene,
    config.shots,
    config.duration,
  );
  report.shotPlan = shotPlan;
  // 0.07 = grok-imagine-image-pro cost — only applies when we generated the ref,
  // not when the caller provided sourceImageUrl (which is free to download).
  const charRefCost = report.characterRefUrl && !config.sourceImageUrl ? 0.07 : 0;
  totalCost = director.getCost() + charRefCost;

  emitProgress(
    onProgress,
    "complete",
    `Shot plan: ${shotPlan.shots.length} shots decomposed`,
    "shot-plan",
    25,
    shotPlan,
  );

  for (const shot of shotPlan.shots) {
    log(
      `  Shot ${shot.shotNumber}: ${shot.action.slice(0, 80)}...`,
      onProgress,
    );
    log(`    Camera: ${shot.camera}`, onProgress);
  }

  // ─── Phase 3: Per-Shot Generation Loop ────────────────────────────

  log("\n═══════════════════════════════════════════════════════", onProgress);
  log("  PHASE 3: DIRECTED VIDEO GENERATION", onProgress, {
    type: "phase",
    phase: "generation",
    progress: 30,
  });
  log("═══════════════════════════════════════════════════════", onProgress);

  let lastFrameUrl: string | undefined = report.characterRefUrl;
  let attemptCounter = 0;

  for (const shot of shotPlan.shots) {
    const shotProgress =
      30 + Math.round((shot.shotNumber / shotPlan.shots.length) * 55);
    log(
      `\n  ── Shot ${shot.shotNumber}/${shotPlan.shots.length} ──────────────────────────`,
      onProgress,
      {
        type: "phase",
        phase: `shot-${shot.shotNumber}`,
        progress: shotProgress,
        data: {
          shotNumber: shot.shotNumber,
          totalShots: shotPlan.shots.length,
        },
      },
    );

    // Budget check
    const estimatedShotCost = config.duration * 0.05 + 0.02; // video + vision
    if (totalCost + estimatedShotCost > config.budget) {
      log(
        `  BUDGET LIMIT — stopping at shot ${shot.shotNumber} ($${totalCost.toFixed(2)}/$${config.budget})`,
        onProgress,
        { type: "error", phase: "budget" },
      );
      break;
    }

    const shotResult: DirectorShotResult = {
      shotNumber: shot.shotNumber,
      accepted: false,
      attempts: 0,
      prompt: "",
    };

    let driftFeedback: string | undefined;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      shotResult.attempts = attempt + 1;
      attemptCounter++;

      // Budget check per attempt
      if (totalCost + config.duration * 0.05 > config.budget) {
        log(`  Budget exhausted mid-attempt`, onProgress, {
          type: "error",
          phase: "budget",
        });
        shotResult.error = "Budget exceeded";
        break;
      }

      // Director writes the prompt + submits video generation
      try {
        log(
          `  [Attempt ${attempt + 1}] Director writing prompt...`,
          onProgress,
          {
            type: "processing",
            phase: `shot-${shot.shotNumber}`,
            data: { attempt: attempt + 1 },
          },
        );
        director.addLog(
          "prompt-write",
          `Shot ${shot.shotNumber}, attempt ${attempt + 1}`,
        );

        const videoPrompt = await writeVideoPrompt(
          director,
          bible,
          shot,
          driftFeedback,
        );
        shotResult.prompt = videoPrompt;
        // Sync director token cost (getCost() returns cumulative total)
        totalCost =
          director.getCost() +
          charRefCost +
          report.shots.reduce(
            (s, r) => s + r.attempts * config.duration * 0.05,
            0,
          );

        log(
          `  [Attempt ${attempt + 1}] Prompt: "${videoPrompt.slice(0, 120)}..."`,
          onProgress,
        );
        director.addLog("prompt-written", `Shot ${shot.shotNumber}`, {
          prompt: videoPrompt,
        });

        // Submit video generation
        log(
          `  [Attempt ${attempt + 1}] Submitting video generation (${config.duration}s)...`,
          onProgress,
          { type: "submitted", phase: `shot-${shot.shotNumber}` },
        );

        const requestId = await submitVideoGeneration(
          videoPrompt,
          config.duration,
          aspectRatio,
          lastFrameUrl,
        );
        totalCost += config.duration * 0.05;

        log(
          `  [Attempt ${attempt + 1}] Submitted (${requestId.slice(0, 12)}), polling...`,
          onProgress,
          {
            type: "polling",
            phase: `shot-${shot.shotNumber}`,
            data: { requestId },
          },
        );

        const videoResult = await pollVideoStatus(
          requestId,
          (msg) => {
            process.stdout.write(`\r  ${msg}`);
            emitProgress(
              onProgress,
              "polling",
              msg,
              `shot-${shot.shotNumber}`,
              undefined,
              { requestId },
            );
          },
          90,
          5000,
        );
        console.log(""); // newline after polling

        if (!videoResult.video?.url) {
          throw new Error("Video completed but no URL returned");
        }

        // Download to attempts directory (keep ALL attempts)
        const attemptPath = join(
          attemptsDir,
          `shot-${String(shot.shotNumber).padStart(3, "0")}-attempt-${attempt + 1}.mp4`,
        );
        await downloadFile(videoResult.video.url, attemptPath);
        log(
          `  [Attempt ${attempt + 1}] Video generated — ${videoResult.video.url.slice(0, 60)}...`,
          onProgress,
          {
            type: "complete",
            phase: `shot-${shot.shotNumber}`,
            data: { url: videoResult.video.url, attempt: attempt + 1 },
          },
        );
        director.addLog(
          "video-generated",
          `Shot ${shot.shotNumber}, attempt ${attempt + 1}`,
          { url: videoResult.video.url },
        );

        // Extract last frame for drift analysis and anchoring
        let framePath: string | undefined;
        if (hasFfmpeg) {
          framePath = join(
            framesDir,
            `shot-${String(shot.shotNumber).padStart(3, "0")}-attempt-${attempt + 1}.jpg`,
          );
          try {
            extractLastFrame(attemptPath, framePath);
          } catch {
            framePath = undefined;
            log(
              `  [Attempt ${attempt + 1}] WARNING: Frame extraction failed`,
              onProgress,
              { type: "info", phase: `shot-${shot.shotNumber}` },
            );
          }
        }

        // Drift analysis (only if we have character ref + frame)
        if (characterRefPath && framePath) {
          log(
            `  [Attempt ${attempt + 1}] Analyzing visual drift...`,
            onProgress,
            { type: "processing", phase: `shot-${shot.shotNumber}-drift` },
          );
          const { score, visionCost } = await analyzeDrift(
            visionModel,
            characterRefPath,
            framePath,
            bible,
            shot.action,
          );
          totalCost += visionCost;
          shotResult.driftScore = score;

          log(
            `  [Attempt ${attempt + 1}] Drift: ${score.total}/100 [C:${score.character} W:${score.wardrobe} E:${score.environment} S:${score.style} Co:${score.continuity}]`,
            onProgress,
            {
              type: "info",
              phase: `shot-${shot.shotNumber}-drift`,
              data: score,
            },
          );
          log(`  [Attempt ${attempt + 1}] Notes: ${score.notes}`, onProgress);
          director.addLog("drift-analysis", `Shot ${shot.shotNumber}`, score);

          if (score.total >= config.driftThreshold) {
            // ACCEPTED
            shotResult.accepted = true;
            shotResult.videoUrl = videoResult.video.url;
            shotResult.lastFramePath = framePath;

            // Copy to clips directory as final
            const clipPath = join(
              clipsDir,
              `clip-${String(shot.shotNumber).padStart(3, "0")}.mp4`,
            );
            copyFileSync(attemptPath, clipPath);
            shotResult.localPath = clipPath;

            // Use this video's URL as anchor for next shot
            lastFrameUrl = videoResult.video.url;

            log(
              `  ✓ Shot ${shot.shotNumber} ACCEPTED (score ${score.total} ≥ ${config.driftThreshold})`,
              onProgress,
              {
                type: "complete",
                phase: `shot-${shot.shotNumber}`,
                data: {
                  accepted: true,
                  score: score.total,
                  attempts: attempt + 1,
                },
              },
            );
            director.addLog(
              "shot-accepted",
              `Shot ${shot.shotNumber}, score ${score.total}`,
            );
            break;
          } else if (attempt < config.maxRetries) {
            // Build drift feedback for Director
            driftFeedback = `Drift score: ${score.total}/100 (threshold: ${config.driftThreshold})
- Character match: ${score.character}/20
- Wardrobe match: ${score.wardrobe}/20
- Environment match: ${score.environment}/20
- Style match: ${score.style}/20
- Continuity match: ${score.continuity}/20
Analysis: ${score.notes}`;

            log(
              `  ✗ Shot ${shot.shotNumber} REJECTED (score ${score.total} < ${config.driftThreshold}) — retrying with corrections`,
              onProgress,
              {
                type: "info",
                phase: `shot-${shot.shotNumber}`,
                data: { accepted: false, score: score.total, retrying: true },
              },
            );
            director.addLog(
              "shot-rejected",
              `Shot ${shot.shotNumber}, score ${score.total}, retrying`,
            );
          } else {
            // Final attempt failed — accept anyway with low score
            shotResult.accepted = true;
            shotResult.videoUrl = videoResult.video.url;
            shotResult.lastFramePath = framePath;

            const clipPath = join(
              clipsDir,
              `clip-${String(shot.shotNumber).padStart(3, "0")}.mp4`,
            );
            copyFileSync(attemptPath, clipPath);
            shotResult.localPath = clipPath;

            lastFrameUrl = videoResult.video.url;

            log(
              `  ~ Shot ${shot.shotNumber} ACCEPTED (best of ${attempt + 1} attempts, score ${score.total})`,
              onProgress,
              {
                type: "complete",
                phase: `shot-${shot.shotNumber}`,
                data: {
                  accepted: true,
                  fallback: true,
                  score: score.total,
                  attempts: attempt + 1,
                },
              },
            );
            director.addLog(
              "shot-accepted-fallback",
              `Shot ${shot.shotNumber}, best score ${score.total} after ${attempt + 1} attempts`,
            );
            break;
          }
        } else {
          // No drift analysis possible — auto-accept
          shotResult.accepted = true;
          shotResult.videoUrl = videoResult.video.url;

          const clipPath = join(
            clipsDir,
            `clip-${String(shot.shotNumber).padStart(3, "0")}.mp4`,
          );
          copyFileSync(attemptPath, clipPath);
          shotResult.localPath = clipPath;

          lastFrameUrl = videoResult.video.url;

          log(
            `  ✓ Shot ${shot.shotNumber} ACCEPTED (no drift analysis — missing ref or ffmpeg)`,
            onProgress,
            {
              type: "complete",
              phase: `shot-${shot.shotNumber}`,
              data: { accepted: true, noDriftCheck: true },
            },
          );
          director.addLog(
            "shot-accepted-nocheck",
            `Shot ${shot.shotNumber}, no drift check available`,
          );
          break;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`  [Attempt ${attempt + 1}] ERROR: ${msg}`, onProgress, {
          type: "error",
          phase: `shot-${shot.shotNumber}`,
          data: { attempt: attempt + 1, error: msg },
        });
        director.addLog(
          "error",
          `Shot ${shot.shotNumber}, attempt ${attempt + 1}: ${msg}`,
        );

        if (attempt >= config.maxRetries) {
          shotResult.error = msg;
          log(
            `  ✗ Shot ${shot.shotNumber} FAILED after ${attempt + 1} attempts`,
            onProgress,
            {
              type: "error",
              phase: `shot-${shot.shotNumber}`,
              data: { failed: true, attempts: attempt + 1 },
            },
          );
        } else {
          await sleep(3000);
        }
      }
    }

    report.shots.push(shotResult);
    if (shotResult.accepted) {
      report.completedShots++;
      report.totalDuration += config.duration;
    } else {
      report.failedShots++;
    }

    // Pause between shots
    if (shot.shotNumber < shotPlan.shots.length) {
      await sleep(1500);
    }
  }

  // ─── Phase 4: Stitch ──────────────────────────────────────────────

  log("\n═══════════════════════════════════════════════════════", onProgress);
  log("  PHASE 4: FINAL ASSEMBLY", onProgress, {
    type: "phase",
    phase: "stitch",
    progress: 90,
  });
  log("═══════════════════════════════════════════════════════\n", onProgress);

  const completedPaths = report.shots
    .filter((s) => s.accepted && s.localPath)
    .sort((a, b) => a.shotNumber - b.shotNumber)
    .map((s) => s.localPath!);

  if (completedPaths.length >= 2 && hasFfmpeg) {
    const safeName = config.scene
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 50);
    const outputFile = join(config.outputDir, `${safeName}-final.mp4`);

    try {
      concatVideos(completedPaths, outputFile);
      report.outputPath = outputFile;
      log(`  Final video: ${outputFile}`, onProgress, {
        type: "complete",
        phase: "stitch",
        progress: 95,
        data: { outputFile },
      });
      director.addLog(
        "stitch",
        `Stitched ${completedPaths.length} clips → ${outputFile}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(
        `  Stitching failed: ${msg} — individual clips in ${clipsDir}`,
        onProgress,
        { type: "error", phase: "stitch" },
      );
      director.addLog("stitch-error", msg);
    }
  } else if (completedPaths.length === 1) {
    report.outputPath = completedPaths[0];
    log(`  Single clip: ${completedPaths[0]}`, onProgress, {
      type: "complete",
      phase: "stitch",
      progress: 95,
    });
  } else if (!hasFfmpeg) {
    log(
      `  Skipped stitching (FFmpeg not available) — clips in ${clipsDir}`,
      onProgress,
      { type: "info", phase: "stitch" },
    );
  } else {
    log(`  No clips to stitch`, onProgress, { type: "info", phase: "stitch" });
  }

  // ─── Phase 5: Save Reports ────────────────────────────────────────

  // Final cost tally
  totalCost =
    director.getCost() +
    charRefCost +
    report.shots.reduce((s, r) => s + r.attempts * config.duration * 0.05, 0);
  // Add vision costs (approximate: $0.01-0.03 per analysis)
  report.totalCost = totalCost;
  report.endTime = new Date().toISOString();

  // Save report
  writeFileSync(
    join(config.outputDir, "director-report.json"),
    JSON.stringify(report, null, 2),
  );

  // Save director log as human-readable text
  writeFileSync(
    join(config.outputDir, "director-log.txt"),
    director.getLogText(),
  );

  // ─── Summary ──────────────────────────────────────────────────────

  log("\n═══════════════════════════════════════════════════════", onProgress);
  log("  DIRECTOR PIPELINE COMPLETE", onProgress, {
    type: "complete",
    phase: "pipeline",
    progress: 100,
    data: {
      completedShots: report.completedShots,
      failedShots: report.failedShots,
      totalDuration: report.totalDuration,
      totalCost: report.totalCost,
      outputPath: report.outputPath,
    },
  });
  log("═══════════════════════════════════════════════════════", onProgress);
  log(`  Scene: ${config.scene.slice(0, 80)}`, onProgress);
  log(
    `  Shots: ${report.completedShots}/${config.shots} completed, ${report.failedShots} failed`,
    onProgress,
  );
  log(`  Duration: ${report.totalDuration}s total`, onProgress);
  log(`  Cost: ~$${report.totalCost.toFixed(2)}`, onProgress);
  log(
    `  Director tokens: ${director.inputTokens} in / ${director.outputTokens} out`,
    onProgress,
  );
  if (report.outputPath) log(`  Final video: ${report.outputPath}`, onProgress);
  log(
    `  Report: ${join(config.outputDir, "director-report.json")}`,
    onProgress,
  );
  log(
    `  Director log: ${join(config.outputDir, "director-log.txt")}`,
    onProgress,
  );
  log("═══════════════════════════════════════════════════════\n", onProgress);

  return report;
}
