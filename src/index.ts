/**
 * grok-video-api — Grok Video Continuity Pipeline
 *
 * Coherent multi-clip AI video generation via xAI Aurora.
 * Zero external dependencies — uses native Node.js fetch.
 *
 * @packageDocumentation
 */

// ─── Provider Interfaces (shared abstractions for multi-provider systems) ──

export type {
  AspectRatio,
  ProviderInfo,
  ProviderCapability,
  OperationCost,
  ProgressEvent,
  OnProgress,
  ImageGenerationOptions,
  ImageEditOptions,
  ImageResult,
  ImageProvider,
  VideoGenerationOptions,
  VideoEditOptions,
  VideoResult,
  VideoProvider,
  ChatMessage as ProviderChatMessage,
  ChatContentPart,
  ChatCompletionOptions as ProviderChatCompletionOptions,
  ChatResult,
  LLMProvider,
  VisionAnalysisOptions,
  VisionResult,
  VisionProvider,
  VoiceSynthesisOptions,
  VoiceCloneOptions,
  VoiceResult,
  VoiceProvider,
  UnifiedProvider,
  ProviderRegistry,
  DirectorPipelineOptions,
} from "./types.js";

// ─── xAI Client (image, video, chat, vision) ──────────────────────────────

export {
  XaiApiError,
  generateImage,
  editImage,
  submitVideoGeneration,
  getVideoStatus,
  pollVideoStatus,
  submitVideoEdit,
  getVideoModels,
  downloadFile,
  sleep,
  getApiKey,
  chatCompletion,
  visionAnalysis,
  xaiRequest,
  xaiRawFetch,
} from "./xai-client.js";
export type {
  XaiImageResponse,
  XaiVideoSubmitResponse,
  XaiVideoStatusResponse,
  XaiVideoModel,
  ChatMessage,
  ChatMessageContent,
  ChatCompletionOptions,
  ChatCompletionResponse,
} from "./xai-client.js";

// ─── Script Parser ─────────────────────────────────────────────────────────

export { parseScript, buildClipPrompt } from "./script-parser.js";
export type { ContinuityScript, ScriptClip } from "./script-parser.js";

// ─── Continuity Pipeline (script-driven, no LLM) ──────────────────────────

export { runContinuityPipeline } from "./pipeline.js";
export type {
  ClipResult,
  PipelineReport,
  PipelineOptions,
} from "./pipeline.js";

// ─── FFmpeg Utilities ──────────────────────────────────────────────────────

export {
  FfmpegError,
  checkFfmpeg,
  extractLastFrame,
  extractFirstFrame,
  concatVideos,
  getVideoInfo,
} from "./ffmpeg.js";

// ─── Director Pipeline (LLM-directed multi-clip generation) ────────────────

export {
  runDirectorPipeline,
  DEFAULT_DIRECTOR_MODEL,
  DEFAULT_VISION_MODEL,
} from "./director.js";
export type {
  DirectorConfig,
  CharacterBible,
  ShotPlan,
  DriftScore,
  DirectorShotResult,
  DirectorReport,
  DirectorLogEntry,
} from "./director.js";
