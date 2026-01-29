/**
 * FFmpeg utilities for video stitching and frame extraction
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";

/**
 * Error thrown when FFmpeg operations fail.
 * Includes the FFmpeg command that was attempted and stderr output.
 */
export class FfmpegError extends Error {
  /** The FFmpeg command that failed */
  readonly command: string;
  /** stderr output from FFmpeg */
  readonly stderr: string;

  constructor(operation: string, command: string, stderr: string) {
    super(`FFmpeg ${operation} failed: ${stderr.slice(0, 500)}`);
    this.name = "FfmpegError";
    this.command = command;
    this.stderr = stderr;
  }
}

/**
 * Check if FFmpeg is installed and accessible on PATH.
 * @returns true if ffmpeg is available
 */
export function checkFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract the last frame from a video file as a JPEG image.
 * Seeks to duration minus 0.1s and captures a single frame.
 *
 * @param videoPath - Path to the source video file
 * @param outputPath - Path where the JPEG frame will be saved
 * @throws {FfmpegError} If frame extraction fails
 */
export function extractLastFrame(videoPath: string, outputPath: string): void {
  if (!existsSync(videoPath)) {
    throw new FfmpegError(
      "extractLastFrame",
      "",
      `Source video not found: ${videoPath}`,
    );
  }

  try {
    const durationStr = execFileSync(
      "ffprobe",
      [
        "-v",
        "quiet",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        videoPath,
      ],
      { encoding: "utf-8" },
    ).trim();
    const duration = parseFloat(durationStr);

    if (isNaN(duration) || duration <= 0) {
      throw new FfmpegError(
        "extractLastFrame",
        "ffprobe",
        `Invalid duration: ${durationStr}`,
      );
    }

    const seekTime = Math.max(0, duration - 0.1).toString();
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-ss",
        seekTime,
        "-i",
        videoPath,
        "-vframes",
        "1",
        "-q:v",
        "2",
        outputPath,
      ],
      { encoding: "utf-8", stdio: "pipe" },
    );
  } catch (err) {
    if (err instanceof FfmpegError) throw err;
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as { stderr: unknown }).stderr)
        : String(err);
    throw new FfmpegError(
      "extractLastFrame",
      `extract from ${videoPath}`,
      stderr,
    );
  }
}

/**
 * Extract the first frame from a video file as a JPEG image.
 *
 * @param videoPath - Path to the source video file
 * @param outputPath - Path where the JPEG frame will be saved
 * @throws {FfmpegError} If frame extraction fails
 */
export function extractFirstFrame(videoPath: string, outputPath: string): void {
  if (!existsSync(videoPath)) {
    throw new FfmpegError(
      "extractFirstFrame",
      "",
      `Source video not found: ${videoPath}`,
    );
  }

  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-i", videoPath, "-vframes", "1", "-q:v", "2", outputPath],
      { encoding: "utf-8", stdio: "pipe" },
    );
  } catch (err) {
    if (err instanceof FfmpegError) throw err;
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as { stderr: unknown }).stderr)
        : String(err);
    throw new FfmpegError(
      "extractFirstFrame",
      `extract from ${videoPath}`,
      stderr,
    );
  }
}

/**
 * Concatenate multiple video files into a single output using FFmpeg concat demuxer.
 * All videos must have matching codecs and dimensions.
 *
 * @param videoPaths - Array of video file paths to concatenate (in order)
 * @param outputPath - Path for the concatenated output video
 * @throws {FfmpegError} If concatenation fails
 */
export function concatVideos(videoPaths: string[], outputPath: string): void {
  if (videoPaths.length === 0) {
    throw new FfmpegError("concatVideos", "", "No video paths provided");
  }

  // Verify all input files exist
  for (const p of videoPaths) {
    if (!existsSync(p)) {
      throw new FfmpegError("concatVideos", "", `Input video not found: ${p}`);
    }
  }

  const listPath = outputPath.replace(/\.mp4$/, "-concat-list.txt");
  // FFmpeg concat list format: escape backslashes then single quotes within paths
  const listContent = videoPaths
    .map((p) => `file '${p.replace(/\\/g, "\\\\").replace(/'/g, "'\\''")}'`)
    .join("\n");
  writeFileSync(listPath, listContent);

  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c",
        "copy",
        outputPath,
      ],
      { encoding: "utf-8", stdio: "pipe" },
    );
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as { stderr: unknown }).stderr)
        : String(err);
    throw new FfmpegError(
      "concatVideos",
      `concat ${videoPaths.length} files`,
      stderr,
    );
  } finally {
    try {
      unlinkSync(listPath);
    } catch {
      /* non-critical cleanup */
    }
  }
}

/**
 * Get video metadata using ffprobe.
 *
 * @param videoPath - Path to the video file
 * @returns Video metadata (dimensions, duration, codec, fps)
 * @throws {FfmpegError} If probe fails
 */
export function getVideoInfo(videoPath: string): {
  width: number;
  height: number;
  duration: number;
  codec: string;
  fps: string;
} {
  if (!existsSync(videoPath)) {
    throw new FfmpegError("getVideoInfo", "", `Video not found: ${videoPath}`);
  }

  try {
    const json = execFileSync(
      "ffprobe",
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        videoPath,
      ],
      { encoding: "utf-8" },
    );
    const data = JSON.parse(json) as {
      streams?: Array<{
        width: number;
        height: number;
        codec_name: string;
        r_frame_rate: string;
      }>;
      format?: { duration?: string };
    };
    const stream = data.streams?.[0];

    if (!stream) {
      throw new FfmpegError(
        "getVideoInfo",
        "ffprobe",
        "No streams found in video",
      );
    }

    return {
      width: stream.width,
      height: stream.height,
      duration: parseFloat(data.format?.duration || "0"),
      codec: stream.codec_name,
      fps: stream.r_frame_rate,
    };
  } catch (err) {
    if (err instanceof FfmpegError) throw err;
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as { stderr: unknown }).stderr)
        : String(err);
    throw new FfmpegError("getVideoInfo", `probe ${videoPath}`, stderr);
  }
}
