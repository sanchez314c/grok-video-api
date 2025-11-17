# Learnings

Things discovered during 11+ production runs. Raw notes on what worked, what didn't, and what was surprising.

---

## Prompting

### "Real" beats "stylized"

Describing what something IS produces higher drift scores than describing what it LOOKS LIKE.

**Higher scores:**
> "A real tabby cat with short orange and white fur, amber eyes, filmed on iPhone, natural kitchen lighting"

**Lower scores:**
> "A stylized cinematic cat character with glowing fur and dramatic rim lighting in neo-noir style"

The video model handles photorealism best. Heavy style directives compete with each other and produce inconsistent outputs.

### Light style guidance outperforms heavy prescriptions

"Handheld iPhone footage, natural lighting" is more effective than a 50-word cinematography prescription. When you overload the model with style parameters, it can't decide which to prioritize and produces varying results.

Best approach: one or two style anchors, then let the model fill in the details.

### Self-contained prompts are non-negotiable

The video model receives one prompt string. No history. No character bible. No previous clips. Every prompt the director writes must include the full character description, wardrobe, environment, camera angle, and lighting -- even when it feels redundant.

When the director wrote prompts that referenced the character by name without describing them ("continue the shot with the samurai"), drift scores dropped significantly.

### 300 words is the sweet spot for prompt length

Shorter than 200 words: not enough detail for consistent character rendering.
Longer than 400 words: the model seems to truncate or deprioritize some directives.

The `writeVideoPrompt()` function explicitly instructs the director to stay under 300 words.

---

## Drift Thresholds by Content Type

Data from 11 production runs:

| Content Type | Recommended Threshold | Notes |
|-------------|----------------------|-------|
| Photorealistic human | 65-75 | Human faces drift most. High threshold needed. |
| Photorealistic animal | 55-65 | More consistent than humans. Cats performed very well. |
| Anime/cel-shaded | 50-55 | Style consistency is decent but character features drift. |
| Abstract/non-character | 40-50 | Content drift doesn't matter as much for abstract scenes. |

The default threshold of 60 is a reasonable middle ground.

---

## Image Anchoring Works

Passing the previous clip's video URL as `image_url` (not the last extracted frame, but the URL of the video itself) noticeably improves visual continuity. The video model uses it as a first-frame reference.

Without anchoring: each clip is essentially a fresh generation that happens to share the same prompt.
With anchoring: the visual starting state carries over, providing additional continuity on top of the text prompt.

---

## Vision Model Scoring is Directionally Correct

The vision model (`grok-2-vision-latest`) was surprisingly good at identifying drift issues. When it flagged "wardrobe: 8/20 -- subject is now wearing a white shirt but reference shows black jacket," the feedback was accurate and the director's corrected prompt fixed the issue.

Where it struggled:
- Very abstract or stylized content (the model would sometimes give high scores to visually inconsistent clips because it couldn't identify specific details to compare)
- Background consistency in complex environments

---

## JSON Mode is Reliable but Has Edge Cases

The director LLM uses JSON mode (`response_format: { type: "json_object" }`). The vast majority of responses parse correctly. But there are edge cases:
- Occasionally the model wraps JSON in markdown code blocks despite JSON mode
- Very long character descriptions can cause the response to be truncated, leaving incomplete JSON

The `safeJsonParse()` utility handles both: tries direct parse, then extracts JSON from code blocks. If both fail, the pipeline throws with the raw content for debugging.

---

## Budget Tracking is Approximate

The pipeline tracks costs based on known pricing ($0.05/sec video, $0.07/image, etc.), but this is approximate. Actual xAI billing may differ slightly. The `totalCost` in the report should be treated as an estimate, not a precise figure.

Vision costs in particular are harder to track precisely because the token counts depend on image resolution.

---

## FFmpeg concat is Finicky

Video clips from xAI all use the same codec, but clip-to-clip duration differences can sometimes cause issues with the concat demuxer. The `-c copy` flag (no re-encoding) is fast but requires perfectly matching stream parameters.

If stitching fails, the error message usually identifies the problematic clip. Re-encoding to a common format (`-c:v libx264`) solves most concat issues at the cost of a quality loss.

---

## The Growing Conversation is Cheap

Skepticism about the token costs of maintaining a 50K+ token conversation were unfounded. At 8 shots, the director conversation is roughly 50K tokens. At $0.20/M input, that's about $0.01. Even with multiple retries pushing the conversation to 80-100K tokens, the director LLM contribution to total cost is basically noise compared to video generation.

---

## Race Conditions in Parallel Don't Apply Here

The pipeline is intentionally sequential. Clip N depends on clip N-1's video URL for anchoring. You can't parallelize shot generation without losing the anchoring benefit. The sequential design is correct.

---

## Output Directories Fill Up Fast

A full 8-shot run with retries can produce 20-30 video files (all attempts, all clips, all frames). At ~5-15MB per clip, that's 150-450MB per run. If you're running many tests, the `output/` directory can balloon to several gigabytes quickly.

The `output/` directory should be in `.gitignore`. Clean it manually or use a script.

---

## API Latency is Predictable

Average generation time per clip was 30-90 seconds in testing. Complex prompts or periods of high API load pushed toward 90 seconds. Planning on 60 seconds per clip is a safe estimate for time calculations.

Drift analysis (vision API call) adds 5-10 seconds per shot. Image reference generation adds ~30 seconds at the start.

A typical 8-shot run takes 8-12 minutes wall-clock time.
