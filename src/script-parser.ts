/**
 * Continuity script parser — JSON and simplified text format
 */

export interface ScriptClip {
  clipNumber: number;
  action: string;
  camera: string;
  lighting: string;
  dialogue?: string;
  duration: number;
}

export interface ContinuityScript {
  title: string;
  characterDescription: string;
  style: string;
  aspectRatio: string;
  clips: ScriptClip[];
}

/** Minimal validation that a parsed JSON value looks like a ContinuityScript */
function isValidScript(v: unknown): v is ContinuityScript {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return typeof s.title === "string" && Array.isArray(s.clips);
}

export function parseScript(raw: string): ContinuityScript {
  // Try JSON first
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isValidScript(parsed)) return parsed;
    // Parsed fine but missing required fields — fall through to text parser
  } catch {
    // Not JSON — parse as simplified text
  }

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const script: ContinuityScript = {
    title: "Untitled",
    characterDescription: "",
    style: "",
    aspectRatio: "16:9",
    clips: [],
  };

  let currentClip: Partial<ScriptClip> | null = null;
  let clipCount = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith("title:")) {
      script.title = line.slice(6).trim();
    } else if (lower.startsWith("character:")) {
      script.characterDescription = line.slice(10).trim();
    } else if (lower.startsWith("style:")) {
      script.style = line.slice(6).trim();
    } else if (
      lower.startsWith("aspect:") ||
      lower.startsWith("aspect_ratio:")
    ) {
      script.aspectRatio = line.split(":").slice(1).join(":").trim();
    } else if (
      lower.startsWith("clip") ||
      lower.startsWith("scene") ||
      lower.startsWith("shot")
    ) {
      if (currentClip?.action) {
        clipCount++;
        script.clips.push({
          clipNumber: clipCount,
          action: currentClip.action || "",
          camera: currentClip.camera || "medium shot, eye level",
          lighting: currentClip.lighting || "natural lighting",
          dialogue: currentClip.dialogue,
          duration: currentClip.duration || 6,
        });
      }
      currentClip = {};
    } else if (lower.startsWith("action:")) {
      if (currentClip) currentClip.action = line.slice(7).trim();
    } else if (lower.startsWith("camera:")) {
      if (currentClip) currentClip.camera = line.slice(7).trim();
    } else if (lower.startsWith("lighting:") || lower.startsWith("light:")) {
      if (currentClip)
        currentClip.lighting = line.split(":").slice(1).join(":").trim();
    } else if (lower.startsWith("dialogue:") || lower.startsWith("dialog:")) {
      if (currentClip)
        currentClip.dialogue = line.split(":").slice(1).join(":").trim();
    } else if (lower.startsWith("duration:")) {
      if (currentClip) {
        const durVal = parseInt(line.slice(9).trim(), 10);
        currentClip.duration = isNaN(durVal) || durVal <= 0 ? 6 : durVal;
      }
    } else {
      if (currentClip && !currentClip.action) {
        currentClip.action = line;
      } else if (currentClip) {
        currentClip.action += " " + line;
      }
    }
  }

  // Save last clip
  if (currentClip?.action) {
    clipCount++;
    script.clips.push({
      clipNumber: clipCount,
      action: currentClip.action || "",
      camera: currentClip.camera || "medium shot, eye level",
      lighting: currentClip.lighting || "natural lighting",
      dialogue: currentClip.dialogue,
      duration: currentClip.duration || 6,
    });
  }

  return script;
}

export function buildClipPrompt(
  script: ContinuityScript,
  clip: ScriptClip,
  isFirstClip: boolean,
): string {
  const parts: string[] = [];

  if (script.style) parts.push(script.style);
  if (script.characterDescription) parts.push(script.characterDescription);
  parts.push(clip.action);
  if (clip.camera) parts.push(`Camera: ${clip.camera}`);
  if (clip.lighting) parts.push(`Lighting: ${clip.lighting}`);
  if (!isFirstClip)
    parts.push("Continuation of previous scene, maintain visual consistency");

  return parts.join(". ") + ".";
}
