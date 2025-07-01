# LLM-Directed Continuous Video Generation with Grok

## A Technical Reference on Leveraging AI-to-AI Orchestration for Multi-Clip Video Production

**Date**: February 28, 2026
**Pipeline Location**: `~/Desktop/grok-video-api/`
**Total Development Time**: ~4 hours (concept to 10+ successful productions)
**Total API Spend**: ~$23.65 across 12 pipeline runs

---

## 1. The Core Insight

A human can't write 10 perfectly consistent video generation prompts. But an LLM can.

The fundamental problem with AI video generation is **continuity**. Each API call to a video model is stateless — it has zero memory of what it generated before. If you generate 8 sequential clips of "a samurai walking across Mars," each clip will produce a different-looking samurai, different Mars landscape, different art style. The result looks like a slideshow, not a video.

The solution: put an **LLM in the director's chair**. The LLM maintains a character bible, tracks what the last frame looked like, and composes each subsequent video prompt with surgical precision — embedding the full character description, continuity notes from the previous clip, and style enforcement into every single prompt.

The video model never learns. But the director never forgets.

---

## 2. Architecture Overview

```
User: "A samurai walks across Mars and finds an alien sword"
                         |
              +----------v----------+
              |   DIRECTOR LLM      |
              |  (grok-4-1-fast)    |
              |  Writes all prompts |
              |  Maintains context  |
              +----------+----------+
                         |
    +--------------------+--------------------+
    v                    v                    v
 Phase 1:           Phase 2:            Phase 3:
 Character Bible    Shot Plan           Per-Shot Loop
 (JSON structured)  (N sequential       +-------------------+
                     shots with         | Director writes   |
                     camera, action,    | video prompt      |
                     lighting)          |       |           |
                                        | Grok Aurora       |
                                        | generates video   |
                                        | + image anchor    |
                                        |       |           |
                                        | FFmpeg extracts   |
                                        | last frame        |
                                        |       |           |
                                        | Grok Vision       |
                                        | scores drift      |
                                        | (5 dims x 20)     |
                                        |       |           |
                                        | Score >= thresh?   |
                                        |  YES -> next shot  |
                                        |  NO  -> retry      |
                                        +-------------------+
                                                |
                                        Phase 4: FFmpeg stitch
```

### The Four Models

| Role | Model | Cost | Purpose |
|------|-------|------|---------|
| Director | `grok-4-1-fast-non-reasoning` | $0.20/M in, $0.50/M out | Writes character bibles, shot plans, video prompts. The brain. |
| Video Gen | `grok-imagine-video` | $0.05/second | Generates 1-15 second video clips. The hands. |
| Image Gen | `grok-imagine-image-pro` | $0.07/image | Creates character reference image. The casting agent. |
| Vision | `grok-2-vision-latest` | $2.00/M in, $10.00/M out | Analyzes frames for visual drift. The quality inspector. |

### Why This Combination Works

- The Director LLM ($0.20/M) is 10x cheaper than the vision model, so maintaining a massive growing conversation is practically free
- The video model is the expensive part ($0.30 per 6-second clip), so every prompt needs to be precise to avoid retries
- The vision model acts as an objective third party — the Director wrote the prompt, the video model interpreted it, and the vision model grades whether the interpretation matches the intent
- Image anchoring (sending the previous clip's last frame as `image_url`) gives the video model a visual starting point, which the Director's precise prompt then guides

---

## 3. The Pipeline in Detail

### Phase 1: Character Bible Generation

The Director LLM receives the user's scene description and outputs a structured JSON character bible via JSON mode (`response_format: { type: "json_object" }`).

**What the Director produces:**
```json
{
  "name": "The Last Ronin",
  "physicalDescription": "Tall lean warrior, weathered bronze skin, sharp angular face with deep-set dark eyes, long white hair pulled into topknot, prominent scar across left cheek",
  "wardrobe": "White ceramic-plate samurai armor over black undersuit, crimson obi sash, sandals wrapped with dark cloth, katana in ornate scabbard on left hip",
  "distinguishingFeatures": "Glowing blue energy lines trace through armor cracks, eyes emit faint blue luminescence",
  "colorPalette": ["#F5F5DC", "#8B0000", "#1a1a2e", "#00BFFF"],
  "artStyle": "Samurai Jack inspired cel-shaded animation with bold outlines and flat color fills"
}
```

**Key insight**: The more specific the character bible, the more consistent the output. Hex color values, specific garment descriptions ("crimson obi sash" not "red belt"), and art style references all contribute to consistency.

A character reference image is then generated using `grok-imagine-image-pro` from this bible. This image becomes the anchor for drift analysis throughout the pipeline.

### Phase 2: Shot Decomposition

The Director decomposes the scene into N sequential shots, each a JSON object specifying:

```json
{
  "shotNumber": 3,
  "action": "Samurai discovers the alien temple entrance partially buried in red sand",
  "camera": "Slow push-in from medium wide to medium shot, low angle looking up at temple",
  "lighting": "Dual light sources: red Martian sun from right, blue alien glow from temple entrance",
  "environment": "Massive obsidian structure with geometric alien carvings, half-buried in crimson dunes",
  "transition": "Continues samurai's walking path from shot 2, he stops and looks up"
}
```

**Key insight**: The shot plan is where the narrative arc lives. Even a 30-second video needs a beginning (establishing), middle (discovery/conflict), and end (resolution/punchline). The Director naturally creates this arc when given a scene with any progression.

### Phase 3: The Directed Generation Loop

This is where the magic happens. For each shot:

**Step 1: Director Writes Video Prompt**

The Director takes the character bible + shot plan + previous frame context and writes a **self-contained** video generation prompt. Self-contained is critical — the video model has no memory. Every prompt must describe the character from scratch.

Example prompt the Director writes:
```
6-second video clip. Samurai Jack cel-shaded animation style with bold outlines and flat color fills.
A tall lean warrior with weathered bronze skin, sharp angular face, deep-set dark eyes, long white
hair in topknot, prominent scar across left cheek, wearing white ceramic-plate samurai armor over
black undersuit with crimson obi sash, glowing blue energy lines through armor cracks — discovers
a massive obsidian alien temple half-buried in crimson Martian sand. Slow push-in from medium wide
to medium shot, low angle. Dual lighting: red sun from right, blue alien glow from temple entrance.
He stops walking and looks up in awe. Wind ripples his hair and sash.
```

**Critical learning**: Prompts must stay under ~300 words. When the growing conversation makes the Director verbose, the LLM response gets truncated mid-JSON, crashing the pipeline. We enforced word limits and added fallback regex extraction for truncated responses.

**Step 2: Video Generation with Image Anchoring**

```typescript
submitVideoGeneration(prompt, duration, aspectRatio, imageUrl)
```

The `imageUrl` parameter is the key to continuity. For shot 1, it's the character reference image. For subsequent shots, it's the URL of the previous clip's generated video. The video model uses this as a visual anchor for the first frame.

The API is async: submit returns a `request_id`, then poll until complete (typically 30-60 seconds per clip).

**Step 3: Frame Extraction**

FFmpeg extracts the last frame of each generated clip:
```bash
ffmpeg -sseof -0.1 -i clip.mp4 -frames:v 1 -q:v 2 frame.jpg
```

This frame serves two purposes:
1. Input to the vision model for drift analysis
2. Visual context for the Director when writing the next prompt

**Step 4: Drift Analysis**

The vision model (`grok-2-vision-latest`) receives the extracted frame and the character reference image as base64 data URIs, then scores visual consistency on 5 dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Character appearance | 0-20 | Face, build, skin, hair match |
| Wardrobe accuracy | 0-20 | Clothing, colors, accessories match |
| Environment match | 0-20 | Setting matches shot plan description |
| Art style consistency | 0-20 | Visual style matches the established look |
| Overall continuity | 0-20 | Does this look like it follows the previous clip? |

**Total score: 0-100.** Default acceptance threshold: 60.

**Step 5: Accept or Retry**

- Score >= threshold: Accept the clip, move to next shot
- Score < threshold AND retries remaining: Director rewrites the prompt incorporating the drift feedback (e.g., "the previous attempt had the wrong hair color, ensure white topknot is prominent"), retry generation
- Final attempt: Accept regardless (best effort, budget preservation)

### Phase 4: Assembly

FFmpeg concatenates all accepted clips using the concat demuxer (no re-encoding):
```bash
ffmpeg -f concat -safe 0 -i filelist.txt -c copy final.mp4
```

All artifacts are preserved: character bible, director log (human-readable text of every decision), individual clips, extracted frames, rejected attempts, and the stitched final.

---

## 4. What We Built

### The Codebase (`~/Desktop/grok-video-api/`)

```
src/
  xai-client.ts    # xAI API wrapper — video, image, chat, vision endpoints
  director.ts      # LLM Director engine — the entire pipeline (~760 LOC)
  pipeline.ts      # Simpler script-driven pipeline (no LLM)
  script-parser.ts # JSON/text script parser
  ffmpeg.ts        # Frame extraction + video stitching
  cli.ts           # CLI entry point (7 commands)
  index.ts         # Library exports (19 functions, 14 types)
```

### xAI API Integration

**Video Generation** (async polling pattern):
```
POST /v1/videos/generations → { request_id }
GET /v1/videos/{request_id} → { status, video_url }
```
- Duration: 1-15 seconds per clip
- Resolution: 848x480 H.264 24fps MP4
- Cost: $0.05/second
- `image_url` parameter: anchors first frame to a reference image (critical for continuity)

**Image Generation**:
```
POST /v1/images/generations → { url }
```
- Models: `grok-imagine-image` (standard) and `grok-imagine-image-pro` (higher quality)
- Cost: $0.07/image
- Used for character reference generation

**Chat Completion** (Director LLM):
```
POST /v1/chat/completions → { choices, usage }
```
- Model: `grok-4-1-fast-non-reasoning`
- JSON mode via `response_format: { type: "json_object" }`
- Single growing conversation maintained across entire pipeline (~50K tokens for 8 shots)

**Vision Analysis** (drift detection):
```
POST /v1/chat/completions (multimodal) → { choices, usage }
```
- Model: `grok-2-vision-latest`
- Content array: `[{ type: "text", text: prompt }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }]`
- Local frames converted to base64 data URIs for the vision model

---

## 5. Production Runs — Results and Learnings

### Run Log

| # | Scene | Style | Shots | Cost | Result |
|---|-------|-------|-------|------|--------|
| 1 | Cyberpunk woman in neon city | Cyberpunk noir | 3/3 | $0.82 | First successful test. All accepted first attempt. Drift scores 85-88. |
| 2 | Last Ronin samurai on Mars | Samurai Jack cel-shaded | 5/8 | ~$2.00 | **CRASHED** at shot 6. Director response truncated, JSON parse failed. |
| 3 | Last Ronin (fixed) | Samurai Jack cel-shaded | 8/8 | $2.48 | Full success after bugfix. Zero retries. |
| 4 | Sam Altman OpenAI Security Camera | iPhone selfie POV | 8/8 | $2.48 | Satirical content. Remarkable scene coherence. |
| 5 | Dave shows off OpenClaw | YouTube tech review | 8/8 | $2.48 | Tech bro character. Good likeness consistency. |
| 6 | Dave OpenClaw (Guy Ritchie) | Guy Ritchie gritty | 8/8 | $2.48 | Same character, radically different style. Over-processed look. |
| 7 | Dave OpenClaw (natural) | Clean, minimal | 6/6 | ~$1.88 | Clean generation without heavy style directives. Better results. |
| 8 | Cats setting up OpenClaw | Wes Anderson | 6/6 | $1.88 | Animals + symmetrical framing. Drift scores 72-88. |
| 9 | Sam Altman Dept of War | The Office mockumentary | 8/8 | $3.09 | Shot 8 needed 3 attempts (dimming lights effect). |
| 10 | Cats at desk (photorealistic) | Viral iPhone footage | 6/6 | $1.88 | Best drift scores (82-86). "Real cats" prompting very effective. |
| 11 | Cats through screen portal | Mixed-reality screen-break | 6/6 | $2.18 | Animated-to-real transition. Complex concept executed well. |

**Totals**: ~$23.65 spent, 67 shots generated across 11 completed runs, 1 crash (fixed).

### Key Learnings

**1. Prompt Length Kills**

When the growing conversation context makes the Director increasingly verbose, its video prompts bloat beyond the response limit. The JSON gets truncated mid-string, crashing the pipeline.

**Fix**: Added "IMPORTANT: Keep the video prompt under 300 words. Be dense and specific, not verbose." to the Director's instructions. Also added fallback regex extraction for truncated JSON:
```typescript
const promptMatch = content.match(/"prompt"\s*:\s*"([\s\S]+?)(?:"|$)/);
```

**2. Style Directives Can Over-Constrain**

Heavy style directives like the Guy Ritchie run ("desaturated, crushed blacks, cold blue-green, handheld, snap zooms, Dutch angles, wide angle with distortion...") cause the video model to over-process the output. The result looks "embossed" or "glossy" — too processed.

**Better approach**: Generate clean first, iterate with style in post-processing. Or use lighter style touches ("handheld camera, natural lighting") rather than comprehensive cinematic prescriptions.

**3. "Real" Prompting Beats "Stylized" Prompting**

The photorealistic cat run scored the highest drift consistency (82-86) across all runs. The prompt strategy: describe real physical objects ("real fur texture, whiskers, real cat eyes") and real-world filming ("like someone pulled out their phone and filmed two actual cats").

Telling the model what something IS works better than telling it what something LOOKS LIKE.

**4. Image Anchoring Is the Continuity Secret**

Without `image_url`, each clip is completely independent. With it, the video model starts from a visual reference that grounds the first frame. Combined with the Director's precise character description in the prompt, this creates remarkable shot-to-shot consistency.

**5. The Director Makes Surprisingly Good Creative Decisions**

When given creative latitude, the Director LLM makes interesting choices. "Tabitha 'Tabs' Whiskers" and "Milton Paws" as cat names. A "nervous eye twitch" for the Sam Altman character. The shot plans often include dramatic camera movements and lighting shifts that elevate the simple scene description.

**6. Drift Threshold Should Match Content Type**

| Content Type | Recommended Drift Threshold |
|-------------|---------------------------|
| Photorealistic humans | 65-75 (strict — faces must match) |
| Photorealistic animals | 50-55 (more permissive — fur varies) |
| Stylized/anime | 50-55 (style variation is acceptable) |
| Abstract/artistic | 40-50 (maximum creative freedom) |

**7. Budget Safety Works**

The pipeline tracks cumulative cost (video gen + image gen + LLM tokens + vision analysis) and stops if it exceeds the budget. A typical 8-shot run costs $2.50-3.00. Worst case with retries: ~$7.50. The $10 default budget provides comfortable headroom.

**8. The "Screen Break" Effect Works**

The mixed-reality concept (characters stepping from a screen into the real world) works because the video model handles transitions well. The key is describing the dimensional boundary explicitly: "steps THROUGH the glass of the monitor into the real office — crossing from the animated screen world into photorealistic reality."

---

## 6. The Style System

### Proven Styles (Tested in Production)

| Style | Visual Result | Effectiveness |
|-------|-------------|--------------|
| Cyberpunk noir | Neon-lit, rain, dark atmosphere | Excellent — model loves neon |
| Samurai Jack cel-shaded | Bold outlines, flat colors, anime | Very good — distinctive look |
| iPhone selfie POV | Handheld, slightly overexposed, casual | Excellent — very believable |
| YouTube tech review | Webcam quality, ring light, bedroom setup | Good — recognizable format |
| Guy Ritchie | Desaturated, handheld, gritty | Over-processed — too many competing directives |
| Wes Anderson | Symmetrical, pastel, planimetric | Excellent — model nails the aesthetic |
| The Office mockumentary | Fluorescent lighting, shallow DOF, jump cuts | Good — office setting is well-rendered |
| Viral phone footage | Photorealistic, natural, handheld | Best results — highest consistency |
| Mixed-reality screen-break | Animated-to-real transition | Surprisingly effective |

### Director Preset Library (Designed, Not All Tested)

14 director presets with full cinematic specifications: color grade, camera behavior, lens choice, lighting rig, film stock, and content affinity. See `~/Desktop/grok-video-api/NEXT-PHASE.md` for the complete library.

### Character Archetypes

9 pre-defined character types with default style pairings:
- `tech-bro` + `youtube-native`
- `corporate-exec` + `david-fincher`
- `cats` + `wes-anderson`
- `whistleblower` + `david-fincher`
- `propaganda-host` + `soviet-propaganda`
- And more...

### Content Plays (Archetype + Style + Topic)

The real unlock: pairing archetypes with styles and trending topics creates a content formula engine.

Examples:
- OpenClaw security disaster → `whistleblower` + `fincher`
- Tech hype cycle → `tech-bro` + `youtube-native`
- Government AI regulation → `propaganda-host` + `soviet-propaganda`
- Pets using AI → `cats` + `wes-anderson`

---

## 7. Technical Implementation Notes

### The Single Growing Conversation

The Director maintains one conversation thread across the entire pipeline. Every phase adds to the same `messages[]` array. At 8 shots, the conversation is ~50K tokens total. At $0.20/M input, that's about $0.01 — essentially free.

This means the Director has full context of every decision it's made, every drift score it's received, every retry it's been asked to do. When rewriting a prompt after drift failure, it knows exactly what went wrong and can make precise corrections.

### Self-Contained Prompts

Despite the Director having full conversation context, every video generation prompt it writes must be **completely self-contained**. The video model receives only the prompt text — no conversation history, no character bible, no previous clips. The Director must embed everything in a single dense paragraph.

This is why prompt length management matters. The Director naturally wants to include every detail from the character bible, every shot plan note, and every drift correction. Left unchecked, prompts balloon to 500+ words and get truncated.

### Base64 Data URIs for Vision

The vision model needs to see the extracted frame AND the character reference. Since these are local files, they're converted to base64 data URIs:

```typescript
const buffer = readFileSync(imagePath);
const base64 = buffer.toString("base64");
const dataUri = `data:image/jpeg;base64,${base64}`;
```

These are sent as `image_url` content in the multimodal message. Each image adds ~30-50K tokens to the vision API call, which is why vision analysis ($2.00/M) is one of the more expensive per-call operations.

### FFmpeg Integration

Three critical operations:

1. **Extract last frame**: `ffmpeg -sseof -0.1 -i clip.mp4 -frames:v 1 frame.jpg`
   - Seeks to 100ms before end, grabs one frame
   - Used for drift analysis and as visual context for the Director

2. **Extract first frame**: `ffmpeg -i clip.mp4 -frames:v 1 frame.jpg`
   - Used for thumbnail generation

3. **Concatenate clips**: `ffmpeg -f concat -safe 0 -i filelist.txt -c copy final.mp4`
   - No re-encoding (fast, lossless)
   - File list format: `file '/path/to/clip-001.mp4'`

### Error Recovery

The pipeline handles failures at every level:
- Video generation timeout (90 polls x 5 seconds) → skip shot, log failure
- Vision analysis parse failure → accept clip without drift scoring
- Director JSON truncation → fallback regex extraction
- Budget exceeded → stop pipeline gracefully, stitch whatever completed
- FFmpeg not installed → skip frame extraction and drift analysis, auto-accept all clips

---

## 8. Costs Breakdown

### Per-Component Costs

| Component | Typical Cost | Notes |
|-----------|-------------|-------|
| Character reference image | $0.07 | One-time per pipeline run |
| Director LLM (full run, 8 shots) | $0.01-0.03 | Dirt cheap — single growing conversation |
| Video generation per clip (6s) | $0.30 | The expensive part: $0.05/second |
| Vision drift analysis per check | $0.01-0.03 | Depends on image size |
| FFmpeg operations | $0.00 | Local, free |

### Per-Run Cost Formula

```
Total = $0.07 (ref image)
      + shots * duration * $0.05 (video gen)
      + shots * $0.02 (avg drift analysis)
      + $0.02 (director LLM)
      + retries * duration * $0.05 (retry video gen)
      + retries * $0.02 (retry drift analysis)
```

### Typical Scenarios

| Scenario | Config | Cost |
|----------|--------|------|
| Quick test | 3 shots x 5s, 0 retries | $0.82 |
| Standard scene | 6 shots x 6s, 0 retries | $1.88 |
| Full production | 8 shots x 6s, 0 retries | $2.48 |
| Full with retries | 8 shots x 6s, avg 1 retry/shot | $4.50 |
| Worst case | 8 shots x 6s, 2 retries each | $7.50 |

---

## 9. Bugs Found and Fixed

### Bug 1: Director Response Truncation (Critical)

**Symptom**: Pipeline crashes at shot 5-6 with "Director returned invalid video prompt" error. The JSON response is truncated mid-string.

**Root cause**: As the conversation grows (more shots = more context), the Director's response gets longer. The LLM's output exceeds the response token limit, and the JSON is cut off mid-field.

**Fix**:
1. Added word limit instruction: "Keep the video prompt under 300 words"
2. Added fallback regex extraction for truncated JSON
3. Moved `writeVideoPrompt()` inside the try/catch block so failures trigger retries instead of crashes

### Bug 2: API Key Not Found

**Symptom**: First background run fails with "bash: .env: No such file or directory"

**Root cause**: The `.env` file is in `~/Desktop/Projects/betterclaw/`, not in the grok-video-api directory. The launch command tried to `source .env` from the wrong location.

**Fix**: Use explicit environment variable export with grep:
```bash
export XAI_API_KEY="$(grep '^XAI_API_KEY' ~/Desktop/Projects/betterclaw/.env | cut -d= -f2)"
```

### Bug 3: Over-Constrained Style Directives

**Symptom**: Video output looks "embossed" or over-processed, especially with complex style directives (Guy Ritchie run).

**Root cause**: Too many competing visual instructions. When the style directive specifies color grade AND camera movement AND lens distortion AND film grain AND lighting rig, the video model tries to apply all of them and produces an over-processed result.

**Fix**: Use lighter style touches. "Photorealistic, iPhone camera, natural lighting" produces better results than a 50-word cinematic prescription. The lesson: generate clean, iterate with post-processing.

---

## 10. API Reference Quick Card

### Video Generation

```bash
# Submit
curl -X POST https://api.x.ai/v1/videos/generations \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-imagine-video",
    "prompt": "...",
    "duration": 6,
    "aspect_ratio": "16:9",
    "image_url": "https://..."  # Optional: anchor first frame
  }'
# Returns: { "request_id": "..." }

# Poll
curl https://api.x.ai/v1/videos/generations/{request_id} \
  -H "Authorization: Bearer $XAI_API_KEY"
# Returns: { "status": "InProgress" | "Complete", "video_url": "..." }
```

### Image Generation

```bash
curl -X POST https://api.x.ai/v1/images/generations \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-imagine-image-pro",
    "prompt": "...",
    "n": 1
  }'
# Returns: { "data": [{ "url": "..." }] }
```

### Chat Completion (Director LLM)

```bash
curl -X POST https://api.x.ai/v1/chat/completions \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4-1-fast-non-reasoning",
    "messages": [...],
    "response_format": { "type": "json_object" },
    "temperature": 0.7
  }'
```

### Vision Analysis (Multimodal)

```bash
curl -X POST https://api.x.ai/v1/chat/completions \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-2-vision-latest",
    "messages": [{
      "role": "user",
      "content": [
        { "type": "text", "text": "Score this frame..." },
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
      ]
    }],
    "max_tokens": 2048
  }'
```

---

## 11. Future Directions

### Smart Style Engine

Auto-match content to visual language. User says "cats setting up AI, funny" → system selects Wes Anderson preset + standard-35mm lens + practical lighting. Implemented as a "style advisor" phase before the Director pipeline begins.

### Multi-Provider Support

The pipeline architecture is provider-agnostic in concept. The Director pattern (LLM writes prompts → video model generates → vision model verifies) works with any video generation API. Replace Grok with Google Veo 2, Runway Gen-4, Sora, etc. — the orchestration logic stays the same.

### Web Portal (CreatorForge)

Productize the pipeline into a SaaS platform: web UI, job queuing (BullMQ), real-time progress (WebSocket), media gallery, social publishing, multi-model comparison ("blast mode" — same prompt to all models simultaneously), and white-label branding.

### Progress Callbacks

Add `onUpdate` callback to `runDirectorPipeline()` for WebSocket integration. Currently the pipeline logs to console only — needs structured progress events for real-time UI updates.

---

## 12. Reproduction Guide

### Prerequisites

```bash
# Node.js 18+
node --version

# FFmpeg
sudo apt install ffmpeg

# xAI API key (https://console.x.ai)
export XAI_API_KEY="xai-..."
```

### Quick Start

```bash
cd ~/Desktop/grok-video-api

# Simple test (3 shots, ~$0.82)
npx tsx src/cli.ts director \
  "A cat sits at a desk in an office, looks at a laptop, then looks directly at the camera" \
  --shots 3 --duration 5 --budget 2 \
  --style "photorealistic, iPhone camera, natural office lighting"

# Full production (8 shots, ~$2.50)
npx tsx src/cli.ts director \
  "A lone samurai in white armor walks across a crimson Martian desert, discovers an alien temple, enters it, finds a glowing sword" \
  --shots 8 --duration 6 --budget 10 --drift 55 \
  --style "Samurai Jack cel-shaded, bold outlines, flat color fills"

# Satirical content (The Office style, ~$3.00)
npx tsx src/cli.ts director \
  "A tech CEO in a grey t-shirt sits in a conference room doing a mockumentary interview, explaining with complete sincerity why deploying AI weapons is actually about safety" \
  --shots 8 --duration 6 --budget 5 --drift 55 \
  --style "The Office mockumentary, fluorescent lighting, shallow DOF, handheld, jump cuts"
```

### Output

```
output/director-{timestamp}/
  character-ref.jpg           # Character reference image
  character-bible.json        # Full character description
  director-report.json        # Pipeline metrics (costs, scores, timing)
  director-log.txt            # Human-readable Director decision log
  clips/clip-001.mp4 ...      # Accepted final clips
  frames/                     # Extracted last frames
  attempts/                   # All attempts including rejected
  {scene-name}-final.mp4      # Stitched final video
```

---

## 13. Claude Code Integration

The pipeline is invokable as a Claude Code skill via `/video-director`:

```
/video-director A woman walks through a neon city --shots 6 --style "cyberpunk noir"
```

The skill handles scene refinement, parameter selection, pipeline execution, progress monitoring, and result delivery — all within a Claude Code conversation.

Skill location: `~/.claude/commands/video-director.md`

---

*Built in a single session. Concept to 11 completed productions in ~4 hours. The LLM-as-director pattern is generalizable to any AI generation pipeline where consistency across sequential outputs matters.*
