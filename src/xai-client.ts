/**
 * xAI Grok API Client — video, image, chat & vision
 * Zero external dependencies — uses native fetch
 */

import { writeFileSync } from "node:fs";

const XAI_BASE = "https://api.x.ai/v1";

// ─── Error Class ──────────────────────────────────────────────────────────

/**
 * Structured error for xAI API failures.
 * Captures HTTP status, endpoint, and raw response for debugging.
 */
export class XaiApiError extends Error {
  /** HTTP status code (e.g., 401, 429, 500) */
  readonly statusCode: number;
  /** HTTP method used */
  readonly method: string;
  /** API endpoint path */
  readonly endpoint: string;
  /** Raw response body from xAI */
  readonly responseBody: string;
  /** Whether this error is retryable (rate limit, server error) */
  readonly retryable: boolean;

  constructor(
    statusCode: number,
    method: string,
    endpoint: string,
    responseBody: string,
  ) {
    const retryable = statusCode === 429 || statusCode >= 500;
    const category =
      statusCode === 401
        ? "Authentication"
        : statusCode === 403
          ? "Authorization"
          : statusCode === 429
            ? "Rate limit"
            : statusCode >= 500
              ? "Server error"
              : "Client error";

    super(
      `xAI API ${category} (${statusCode}) on ${method} ${endpoint}: ${responseBody.slice(0, 500)}`,
    );
    this.name = "XaiApiError";
    this.statusCode = statusCode;
    this.method = method;
    this.endpoint = endpoint;
    this.responseBody = responseBody;
    this.retryable = retryable;
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface XaiImageResponse {
  data: Array<{
    url?: string;
    revised_prompt?: string;
    b64_json?: string;
  }>;
}

export interface XaiVideoSubmitResponse {
  request_id: string;
}

export interface XaiVideoStatusResponse {
  status?: "pending";
  video?: {
    url: string;
    duration: number;
    respect_moderation: boolean;
  };
  model?: string;
}

export interface XaiVideoModel {
  id: string;
  fingerprint: string;
  created: number;
  object: string;
  owned_by: string;
  version: string;
  input_modalities: string[];
  output_modalities: string[];
  aliases: string[];
}

// ─── Client ────────────────────────────────────────────────────────────────

export function getApiKey(): string {
  const key = process.env.XAI_API_KEY;
  if (!key)
    throw new Error(
      "XAI_API_KEY environment variable is not set. Export it or add to .env",
    );
  return key;
}

/** Default timeout for xAI API requests in milliseconds (30 seconds) */
const XAI_REQUEST_TIMEOUT_MS = 30_000;

export async function xaiRequest<T>(
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: Record<string, unknown>,
): Promise<T> {
  const apiKey = getApiKey();
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    XAI_REQUEST_TIMEOUT_MS,
  );

  const opts: RequestInit = {
    method,
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const response = await fetch(`${XAI_BASE}${path}`, opts);
    if (!response.ok) {
      const text = await response.text();
      throw new XaiApiError(response.status, method, path, text);
    }
    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `xAI API request timed out after ${XAI_REQUEST_TIMEOUT_MS / 1000}s: ${method} ${path}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function xaiRawFetch(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
): Promise<Response> {
  const apiKey = getApiKey();
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    XAI_REQUEST_TIMEOUT_MS,
  );
  const opts: RequestInit = {
    method,
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    return await fetch(`${XAI_BASE}${path}`, opts);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `xAI API request timed out after ${XAI_REQUEST_TIMEOUT_MS / 1000}s: ${method} ${path}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Image Generation ──────────────────────────────────────────────────────

export async function generateImage(
  prompt: string,
  model:
    | "grok-imagine-image"
    | "grok-imagine-image-pro" = "grok-imagine-image-pro",
  aspectRatio = "16:9",
  count = 1,
): Promise<XaiImageResponse> {
  return xaiRequest<XaiImageResponse>("/images/generations", "POST", {
    model,
    prompt,
    n: count,
    aspect_ratio: aspectRatio,
    response_format: "url",
  });
}

export async function editImage(
  prompt: string,
  imageUrl: string,
  model: "grok-imagine-image" | "grok-imagine-image-pro" = "grok-imagine-image",
): Promise<XaiImageResponse> {
  return xaiRequest<XaiImageResponse>("/images/edits", "POST", {
    model,
    prompt,
    image_url: imageUrl,
  });
}

// ─── Video Generation (Async) ──────────────────────────────────────────────

export async function submitVideoGeneration(
  prompt: string,
  duration = 6,
  aspectRatio = "16:9",
  imageUrl?: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "grok-imagine-video",
    prompt,
    duration,
    aspect_ratio: aspectRatio,
  };
  if (imageUrl) {
    body.image_url = imageUrl;
  }

  const result = await xaiRequest<XaiVideoSubmitResponse>(
    "/videos/generations",
    "POST",
    body,
  );
  if (!result.request_id) {
    throw new Error("Video generation returned no request_id");
  }
  return result.request_id;
}

export async function getVideoStatus(
  requestId: string,
): Promise<{ status: number; data: XaiVideoStatusResponse }> {
  const response = await xaiRawFetch(`/videos/${requestId}`);
  let data: XaiVideoStatusResponse;
  try {
    data = (await response.json()) as XaiVideoStatusResponse;
  } catch {
    throw new Error(
      `Video status response was not valid JSON (HTTP ${response.status})`,
    );
  }
  return { status: response.status, data };
}

export async function pollVideoStatus(
  requestId: string,
  onUpdate?: (msg: string) => void,
  maxPolls = 60,
  intervalMs = 5000,
): Promise<XaiVideoStatusResponse> {
  for (let i = 0; i < maxPolls; i++) {
    onUpdate?.(
      `Polling video ${requestId.substring(0, 8)}... (${i + 1}/${maxPolls})`,
    );

    let status: number;
    let data: XaiVideoStatusResponse;
    try {
      ({ status, data } = await getVideoStatus(requestId));
    } catch (err) {
      // Transient network error — log and retry unless last attempt
      if (i + 1 >= maxPolls) {
        throw new Error(
          `Polling failed on final attempt: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      onUpdate?.(
        `  Transient poll error (attempt ${i + 1}): ${err instanceof Error ? err.message : String(err)} — retrying...`,
      );
      await sleep(intervalMs);
      continue;
    }

    if (status === 202) {
      await sleep(intervalMs);
      continue;
    }

    if (status === 200) {
      return data;
    }

    throw new XaiApiError(
      status,
      "GET",
      `/videos/${requestId}`,
      JSON.stringify(data),
    );
  }

  throw new Error(
    `Video generation timed out after ${(maxPolls * intervalMs) / 1000}s`,
  );
}

// ─── Video Editing ─────────────────────────────────────────────────────────

export async function submitVideoEdit(
  prompt: string,
  videoUrl: string,
): Promise<string> {
  const result = await xaiRequest<XaiVideoSubmitResponse>(
    "/videos/edits",
    "POST",
    {
      model: "grok-imagine-video",
      prompt,
      video: { url: videoUrl },
    },
  );
  if (!result.request_id) {
    throw new Error("Video edit returned no request_id");
  }
  return result.request_id;
}

// ─── Model Info ────────────────────────────────────────────────────────────

export async function getVideoModels(): Promise<{ models: XaiVideoModel[] }> {
  return xaiRequest<{ models: XaiVideoModel[] }>("/video-generation-models");
}

// ─── Utility ───────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function downloadFile(
  url: string,
  filePath: string,
): Promise<void> {
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    throw new Error(
      `downloadFile: URL must start with http:// or https://, got: ${url.slice(0, 40)}`,
    );
  }
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(
      `Download network error for ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Download failed (${response.status} ${response.statusText}): ${url}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(filePath, buffer);
}

// ─── Chat Completion ──────────────────────────────────────────────────────

export type ChatMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image_url";
          image_url: { url: string; detail?: "auto" | "low" | "high" };
        }
    >;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatMessageContent;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "text" | "json_object" };
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function chatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResponse> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
  if (options.response_format) body.response_format = options.response_format;

  return xaiRequest<ChatCompletionResponse>("/chat/completions", "POST", body);
}

// ─── Vision Analysis (Convenience Wrapper) ────────────────────────────────

export async function visionAnalysis(
  model: string,
  prompt: string,
  imageUrls: string[],
  responseFormat?: { type: "text" | "json_object" },
): Promise<{ content: string; usage: ChatCompletionResponse["usage"] }> {
  const content: ChatMessageContent = [
    { type: "text", text: prompt },
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "auto" as const },
    })),
  ];

  const result = await chatCompletion({
    model,
    messages: [{ role: "user", content }],
    max_tokens: 2048,
    response_format: responseFormat,
  });

  return {
    content: result.choices[0]?.message?.content || "",
    usage: result.usage,
  };
}
