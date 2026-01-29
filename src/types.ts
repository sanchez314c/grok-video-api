/**
 * Provider Interfaces — shared abstractions for multi-provider AI content generation
 *
 * These interfaces define the contract that any AI provider must implement.
 * grok-video-api implements these for xAI/Grok. CreatorForge consumers
 * (OpenAI, Google, Together, etc.) implement the same interfaces.
 */

// ─── Common Types ─────────────────────────────────────────────────────────

/** Aspect ratio string (e.g., "16:9", "9:16", "1:1") */
export type AspectRatio =
  | "1:1"
  | "16:9"
  | "9:16"
  | "4:3"
  | "3:4"
  | "3:2"
  | "2:3"
  | "2:1"
  | "1:2"
  | string;

/** Provider identification */
export interface ProviderInfo {
  id: string;
  name: string;
  website: string;
  capabilities: ProviderCapability[];
}

export type ProviderCapability =
  | "image-generation"
  | "image-editing"
  | "video-generation"
  | "video-editing"
  | "chat"
  | "vision"
  | "voice-synthesis"
  | "voice-cloning"
  | "transcription";

/** Cost tracking for any operation */
export interface OperationCost {
  /** Total cost in USD */
  totalUsd: number;
  /** Breakdown by category */
  breakdown?: Record<string, number>;
  /** Token usage (for LLM operations) */
  tokens?: {
    input: number;
    output: number;
  };
}

/** Progress update event for real-time streaming */
export interface ProgressEvent {
  /** Event type */
  type:
    | "submitted"
    | "polling"
    | "processing"
    | "complete"
    | "error"
    | "phase"
    | "info";
  /** Human-readable message */
  message: string;
  /** Progress percentage (0-100), if deterministic */
  progress?: number;
  /** Phase name (for multi-phase pipelines) */
  phase?: string;
  /** Arbitrary data payload */
  data?: unknown;
  /** Timestamp */
  timestamp: string;
}

/** Callback for streaming progress updates */
export type OnProgress = (event: ProgressEvent) => void;

// ─── Image Provider ───────────────────────────────────────────────────────

export interface ImageGenerationOptions {
  /** Text prompt describing the desired image */
  prompt: string;
  /** Model identifier (provider-specific) */
  model?: string;
  /** Aspect ratio */
  aspectRatio?: AspectRatio;
  /** Number of images to generate */
  count?: number;
  /** Image quality level */
  quality?: "standard" | "hd";
  /** Style preset */
  style?: string;
  /** Image dimensions (alternative to aspectRatio) */
  size?: { width: number; height: number };
  /** Response format */
  responseFormat?: "url" | "base64";
}

export interface ImageEditOptions {
  /** Text prompt describing the desired edit */
  prompt: string;
  /** Source image URL or base64 */
  sourceUrl: string;
  /** Model identifier */
  model?: string;
  /** Optional mask image for inpainting */
  maskUrl?: string;
}

export interface ImageResult {
  /** Image URL (temporary, provider-hosted) */
  url: string;
  /** Revised prompt (if model rewrote it) */
  revisedPrompt?: string;
  /** Base64-encoded image data */
  base64?: string;
  /** Image dimensions */
  width?: number;
  height?: number;
  /** Cost of this generation */
  cost: OperationCost;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface ImageProvider {
  readonly providerId: string;
  readonly providerName: string;

  /** Generate one or more images from a text prompt */
  generateImage(options: ImageGenerationOptions): Promise<ImageResult[]>;

  /** Edit an existing image with a text prompt */
  editImage(options: ImageEditOptions): Promise<ImageResult>;

  /** List available image generation models */
  listImageModels(): Promise<
    Array<{ id: string; name: string; costPerImage: number }>
  >;
}

// ─── Video Provider ───────────────────────────────────────────────────────

export interface VideoGenerationOptions {
  /** Text prompt describing the desired video */
  prompt: string;
  /** Model identifier */
  model?: string;
  /** Duration in seconds */
  duration?: number;
  /** Aspect ratio */
  aspectRatio?: AspectRatio;
  /** Reference image URL (for image-to-video or anchoring) */
  imageUrl?: string;
  /** Reference video URL (for video-to-video) */
  videoUrl?: string;
  /** Progress callback */
  onProgress?: OnProgress;
}

export interface VideoEditOptions {
  /** Text prompt describing the desired edit */
  prompt: string;
  /** Source video URL */
  videoUrl: string;
  /** Model identifier */
  model?: string;
  /** Progress callback */
  onProgress?: OnProgress;
}

export interface VideoResult {
  /** Video URL (temporary, provider-hosted) */
  url: string;
  /** Duration in seconds */
  duration: number;
  /** Request ID (for polling-based providers) */
  requestId?: string;
  /** Cost of this generation */
  cost: OperationCost;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface VideoProvider {
  readonly providerId: string;
  readonly providerName: string;

  /** Submit a video generation job (may be async/polling-based) */
  generateVideo(options: VideoGenerationOptions): Promise<VideoResult>;

  /** Edit an existing video */
  editVideo(options: VideoEditOptions): Promise<VideoResult>;

  /** List available video generation models */
  listVideoModels(): Promise<
    Array<{
      id: string;
      name: string;
      costPerSecond: number;
      maxDuration: number;
    }>
  >;
}

// ─── LLM Provider ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<ChatContentPart>;
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string; detail?: "auto" | "low" | "high" };
    };

export interface ChatCompletionOptions {
  /** Model identifier */
  model: string;
  /** Conversation messages */
  messages: ChatMessage[];
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Response format constraint */
  responseFormat?: { type: "text" | "json_object" };
  /** Whether to stream the response */
  stream?: boolean;
}

export interface ChatResult {
  /** Generated text content */
  content: string;
  /** Finish reason */
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | string;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Cost of this completion */
  cost: OperationCost;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface LLMProvider {
  readonly providerId: string;
  readonly providerName: string;

  /** Generate a chat completion */
  chatCompletion(options: ChatCompletionOptions): Promise<ChatResult>;

  /** List available chat/LLM models */
  listModels(): Promise<
    Array<{
      id: string;
      name: string;
      contextWindow: number;
      costPerMInput: number;
      costPerMOutput: number;
    }>
  >;
}

// ─── Vision Provider ──────────────────────────────────────────────────────

export interface VisionAnalysisOptions {
  /** Model identifier */
  model: string;
  /** Text prompt / question about the image(s) */
  prompt: string;
  /** Image URLs to analyze */
  imageUrls: string[];
  /** Response format constraint */
  responseFormat?: { type: "text" | "json_object" };
}

export interface VisionResult {
  /** Analysis text content */
  content: string;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Cost of this analysis */
  cost: OperationCost;
}

export interface VisionProvider {
  readonly providerId: string;
  readonly providerName: string;

  /** Analyze one or more images with a text prompt */
  analyzeImages(options: VisionAnalysisOptions): Promise<VisionResult>;
}

// ─── Voice Provider ───────────────────────────────────────────────────────

export interface VoiceSynthesisOptions {
  /** Text to synthesize */
  text: string;
  /** Voice identifier */
  voiceId: string;
  /** Model identifier */
  model?: string;
  /** Output format */
  outputFormat?: "mp3" | "wav" | "ogg" | "pcm";
  /** Speed multiplier (0.5-2.0) */
  speed?: number;
}

export interface VoiceCloneOptions {
  /** Name for the cloned voice */
  name: string;
  /** Audio sample URLs */
  sampleUrls: string[];
  /** Clone type */
  type: "instant" | "professional";
  /** Description of the voice */
  description?: string;
}

export interface VoiceResult {
  /** Audio data URL or base64 */
  audioUrl: string;
  /** Duration in seconds */
  duration: number;
  /** Cost */
  cost: OperationCost;
}

export interface VoiceProvider {
  readonly providerId: string;
  readonly providerName: string;

  /** Synthesize speech from text */
  synthesize(options: VoiceSynthesisOptions): Promise<VoiceResult>;

  /** Clone a voice from audio samples */
  cloneVoice(options: VoiceCloneOptions): Promise<{ voiceId: string }>;

  /** List available voices */
  listVoices(): Promise<
    Array<{ id: string; name: string; previewUrl?: string }>
  >;
}

// ─── Unified Provider ─────────────────────────────────────────────────────

/** A provider that implements one or more capability interfaces */
export interface UnifiedProvider {
  readonly info: ProviderInfo;
  readonly image?: ImageProvider;
  readonly video?: VideoProvider;
  readonly llm?: LLMProvider;
  readonly vision?: VisionProvider;
  readonly voice?: VoiceProvider;
}

// ─── Provider Registry ────────────────────────────────────────────────────

export interface ProviderRegistry {
  /** Register a provider */
  register(provider: UnifiedProvider): void;

  /** Get a provider by ID */
  get(providerId: string): UnifiedProvider | undefined;

  /** Get all registered providers */
  all(): UnifiedProvider[];

  /** Get all providers with a specific capability */
  withCapability(capability: ProviderCapability): UnifiedProvider[];
}

// ─── Director Pipeline Types (xAI-specific, exported for consumers) ──────

export interface DirectorPipelineOptions {
  /** Scene description */
  scene: string;
  /** Number of shots */
  shots: number;
  /** Duration per shot in seconds */
  duration: number;
  /** Visual style directive */
  style?: string;
  /** Drift threshold (0-100) */
  driftThreshold?: number;
  /** Max retries per shot */
  maxRetries?: number;
  /** Budget cap in USD */
  budget?: number;
  /** Output directory */
  outputDir: string;
  /** Aspect ratio */
  aspectRatio?: AspectRatio;
  /** Progress callback for real-time updates */
  onProgress?: OnProgress;
  /** Director LLM model override */
  directorModel?: string;
  /** Vision model override */
  visionModel?: string;
}
