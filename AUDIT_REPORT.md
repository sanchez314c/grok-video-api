# Forensic Code Quality Audit — grok-video-api

**Date:** 2026-03-22
**Auditor:** Master Control
**Scope:** All 8 source files in `src/`, shell scripts, `package.json`, `tsconfig.json`, `.gitignore`, `.npmignore`
**Status:** ALL FINDINGS FIXED. TypeScript build passes clean. Shellcheck passes clean.

---

## Summary

### This Audit (Step 5 — 2026-03-22)

| Severity | Found | Fixed |
|----------|-------|-------|
| HIGH     | 1     | 1     |
| MEDIUM   | 2     | 2     |
| LOW      | 3     | 3     |
| **Total** | **6** | **6** |

### Prior Audit (2026-03-14) — All Previously Fixed

| Severity | Found | Fixed |
|----------|-------|-------|
| CRITICAL | 1     | 1     |
| HIGH     | 4     | 4     |
| MEDIUM   | 5     | 5     |
| LOW      | 4     | 4     |
| **Total** | **14** | **14** |

---

## This Audit — Findings and Fixes

### HIGH

#### H-1 — `downloadFile` dynamic import never fixed + no URL validation
**File:** `src/xai-client.ts`
**Issue (regression from prior audit):** The prior audit (H-4) documented replacing `const { writeFileSync } = await import("node:fs")` with a static import. The fix was applied to the error handling but the dynamic `await import("node:fs")` inside `downloadFile` persisted unchanged. Every call to `downloadFile` (called dozens of times per pipeline run) triggered a dynamic module resolution on each invocation.

Additionally, `downloadFile` accepted any string as `url` with no validation. A caller passing a `file://` path or non-URL string would either silently read the local filesystem or produce a confusing fetch error.

**Fix:**
1. Added `import { writeFileSync } from "node:fs"` as a static top-level import.
2. Removed `const { writeFileSync } = await import("node:fs")` from the function body.
3. Added URL protocol guard at function entry: throws `Error` if URL does not start with `http://` or `https://`.

---

### MEDIUM

#### M-1 — Unused `execSync` import in `ffmpeg.ts`
**File:** `src/ffmpeg.ts`
**Issue:** `import { execSync, execFileSync } from "node:child_process"` — `execSync` was imported but never called. The prior audit (C-1) replaced all `execSync` usage with `execFileSync` but left `execSync` in the import. Dead imports make TypeScript stricter configurations (e.g., `noUnusedLocals`) fail and confuse future readers about what APIs are in use.
**Fix:** Removed `execSync` from the import, keeping only `execFileSync`.

#### M-2 — Cost accounting incorrect when `sourceImageUrl` is provided
**File:** `src/director.ts`
**Issue:** Three locations in `runDirectorPipeline` computed `totalCost` using hardcoded `0.07` (the `grok-imagine-image-pro` generation cost) regardless of whether the character reference image was generated or provided via `--source-image`. When `sourceImageUrl` is used, no image generation API call is made and $0.07 is not spent. The inflated cost affected:
- The budget check after Phase 2 (shot plan)
- The per-attempt cost sync inside the shot loop
- The final cost tally saved in `director-report.json`

**Fix:**
- Computed `charRefCost` once after the shot plan phase: `report.characterRefUrl && !config.sourceImageUrl ? 0.07 : 0`
- Replaced all three `(report.characterRefUrl ? 0.07 : 0)` references with `charRefCost`

---

### LOW

#### L-1 — Missing `set -o pipefail` in shell scripts
**Files:** `run-source-linux.sh`, `run-source-mac.sh`
**Issue:** Both scripts used `set -e` (abort on error) but lacked `set -o pipefail`. Without `pipefail`, a failure in the left side of a pipe (`cmd1 | cmd2`) exits with the status of `cmd2`, masking the failure of `cmd1`. The scripts don't currently have pipe expressions, but the pattern is a shell hygiene risk and omitting it is considered incomplete safety coverage.
**Fix:** Changed `set -e` to `set -euo pipefail` in both scripts (`-u` for undefined variable detection, `pipefail` for pipe error propagation).

#### L-2 — Hardcoded model name strings in `director.ts` (deferred from prior audit)
**File:** `src/director.ts`
**Issue:** The prior audit noted this as L-3 and explicitly deferred it: `"grok-4-1-fast-non-reasoning"` appeared as a bare string literal at two locations in `runDirectorPipeline`. Model strings duplicated across multiple locations cause silent drift when one is updated and the other is not.
**Fix:**
- Defined `export const DEFAULT_DIRECTOR_MODEL = "grok-4-1-fast-non-reasoning"` and `export const DEFAULT_VISION_MODEL = "grok-4-1-fast-non-reasoning"` as named exported constants at the module level.
- Replaced both string literals in `runDirectorPipeline` with the constants.
- Exported both constants via `src/index.ts` so library consumers can inspect/override the defaults.

#### L-3 — `xaiRequest` and `xaiRawFetch` have no request timeout
**File:** `src/xai-client.ts`
**Issue:** Both `xaiRequest` and `xaiRawFetch` called `fetch()` with no `AbortSignal` or timeout. A hung TCP connection or a non-responsive xAI endpoint would stall the pipeline indefinitely with no error, killing the process with a silent hang. For multi-hour pipeline runs this is a real operational risk.
**Fix:**
- Added `XAI_REQUEST_TIMEOUT_MS = 30_000` constant.
- Both functions now create an `AbortController`, schedule `controller.abort()` after the timeout, pass `signal: controller.signal` to `fetch()`, and wrap the call in try/finally to `clearTimeout`. AbortErrors are caught and re-thrown with a descriptive timeout message.

---

## Architecture Notes (Unchanged)

- **Zero external runtime dependencies** — correct and intentional. Native fetch, no axios/node-fetch.
- **ESM-only module** — correct for Node 18+ with `"type": "module"`.
- **`tsconfig.json`** — `strict: true`, `NodeNext` resolution, `ES2022` target — all appropriate.
- **`package.json`** — `engines: { node: ">=18" }` enforced. `prepublishOnly: build` correct.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/xai-client.ts` | H-1 (static writeFileSync import, remove dynamic import, URL guard), L-3 (request timeouts on xaiRequest + xaiRawFetch) |
| `src/ffmpeg.ts` | M-1 (remove unused execSync import) |
| `src/director.ts` | M-2 (charRefCost variable, fix 3 cost accounting locations), L-2 (model name constants) |
| `src/index.ts` | L-2 (export new model constants) |
| `run-source-linux.sh` | L-1 (set -euo pipefail) |
| `run-source-mac.sh` | L-1 (set -euo pipefail) |

**Backup:** `archive/pre-audit5-20260322_174020.zip`

---

## Prior Audit Record (2026-03-14)

### CRITICAL

#### C-1 — Command injection via shell interpolation in `ffmpeg.ts`
**Fixed:** All `execSync` calls replaced with `execFileSync`, arguments passed as arrays. Shell bypassed entirely.

### HIGH (Prior Audit)

#### H-1 — `.env` loader vulnerable to word-splitting in shell scripts
**Fixed:** Replaced `export $(grep ... | xargs)` with safe `while IFS= read` loop.

#### H-2 — `getVideoStatus` JSON parse error unhandled
**Fixed:** Wrapped `response.json()` in try/catch, re-throws with HTTP status context.

#### H-3 — `pollVideoStatus` crashes on transient network error
**Fixed:** Added try/catch around `getVideoStatus`, transient errors logged and retried. Final attempt propagates. Non-200/202 throws `XaiApiError`.

#### H-4 — `downloadFile` dynamic import (partially fixed — regression found in this audit)
**Original issue:** `await import("node:fs")` on every call. Partially addressed in prior audit (error handling added). The dynamic import itself remained — fully resolved in this audit as H-1.

### MEDIUM (Prior Audit)

#### M-1 — File copy via readFileSync+writeFileSync in director.ts
**Fixed:** Replaced with `copyFileSync` (OS-level copy, no buffer allocation).

#### M-2 — Cost accumulation bug in director shot loop
**Fixed:** Consistent cumulative cost formula.

#### M-3 — Silent frame extraction errors in pipeline.ts
**Fixed:** Errors now logged via `onUpdate` callback.

#### M-4 — No input validation on `runContinuityPipeline`
**Fixed:** Guards added for empty clips and missing outputDir.

#### M-5 — JSON parse in `parseScript` has no structural validation
**Fixed:** `isValidScript()` guard added, falls through to text parser on invalid structure.

### LOW (Prior Audit)

#### L-1 — `parseInt` fragile slice in script-parser.ts
**Fixed:** `line.slice(9).trim()` + explicit `isNaN` check.

#### L-2 — `parseArgs` silently drops boolean/trailing flags
**Fixed:** Boolean flag detection added, sets value to empty string.

#### L-3 — Hardcoded model names in director.ts
**Deferred in prior audit — fully resolved in this audit as L-2.**

#### L-4 — `concatVideos` unescaped single quotes in FFmpeg concat list
**Fixed:** Proper escaping of backslashes and single quotes in path values.
