# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0] - 2026-04-25

### Added
- `nanobanana-adc doctor` subcommand: diagnose the active auth route, GCP
  environment variables, ADC reachability, and known foot-guns
  (`GOOGLE_CLOUD_LOCATION=global` required, `GOOGLE_GENAI_USE_VERTEXAI=true`,
  `GOOGLE_APPLICATION_CREDENTIALS` file existence, API key format) in one
  command. Masks secrets by default: `GEMINI_API_KEY` is shown as prefix 6 +
  length only, the ADC access token is not emitted, and
  `GOOGLE_APPLICATION_CREDENTIALS` is reported as a path only (the JSON is
  never opened).
- `nanobanana-adc doctor --json` emits a machine-readable report with the
  `nanobanana-adc-doctor/v1` schema for pipelines and CI. Shell users who
  want to gate on fatal state can use `doctor --json | jq -e '.fatal | not'`.
- `nanobanana-adc doctor --verbose` / `-v` surfaces the ADC token prefix
  (first 8 characters), `gcloud config get-value account/project`, the
  `application_default_credentials.json` path, Node.js version, and platform.
  Intended for local debugging only — not for CI transcripts or demo
  recordings, since `gcloudAccount` may contain a personal email.
- CLI is now a proper subcommand tree. `nanobanana-adc --help` shows
  `generate` and `doctor`. The previous invocation
  `nanobanana-adc --prompt ...` still works (`generate` is the default
  subcommand), so existing scripts and the Claude Code skill are
  backward-compatible.

### Changed
- `src/cli.ts` is now structured around `program.command('generate', { isDefault: true })`
  + `program.command('doctor')`. The image-generation logic in `src/generate.ts`
  and the auth logic in `src/auth.ts` are untouched.

### Notes
- `doctor` is always exit code `0` — even when `fatal: true` in the report —
  because the tool is diagnostic, not a gate. Shell users who want a hard
  failure can do `doctor --json | jq -e '.fatal | not' >/dev/null` or similar.
  This mirrors `brew doctor` and `gcloud info`, which exit 0 regardless of
  findings. Only an unexpected internal crash (module load failure, etc.)
  returns exit 1 from the Node process.
- `doctor --verbose` is designed for local debugging. It can include personal
  email addresses (`gcloud config get-value account`) and local file paths.
  Do not paste verbose output into issues, CI logs, or demo recordings
  without review.
- `doctor` does **not** call the model — it never issues a billable request.
  ADC is probed only via `google-auth-library` for an access token; no image
  generation happens. A 5s `setTimeout().unref()` timeout prevents the
  command from hanging when ADC is unreachable (e.g., metadata server DNS
  wait on non-GCE networks).
- `CLI_VERSION_STALE` (`npm view nanobanana-adc version` vs the local build)
  is deferred to v0.5.0 or later. v0.4.0 intentionally avoids network calls
  to the npm registry to keep `doctor` fast, offline-friendly, and free of
  corporate-proxy interactions.

## [0.3.0] - 2026-04-24

### Added
- PNG `tEXt` metadata embedding: generated PNGs now carry an Automatic1111 /
  AIview compatible `tEXt` chunk with key `parameters`, containing the original
  prompt and CLI options. Readable by `~/git/AIview`, `exiftool`, and any
  A1111-aware viewer. Google's C2PA (`caBX`), IPTC (`zTXt`), and XMP (`iTXt`)
  chunks are preserved byte-for-byte — the new chunk is inserted just before
  `IEND`.
- `--no-embed-metadata` opt-out flag for privacy-sensitive deployments where
  prompt text should not be persisted to the image. Honored on both the ADC
  and AI Studio paths.

### Fixed
- AI Studio (`--api-key` / `GEMINI_API_KEY`) path: when the response mime type
  is `image/jpeg`, the output path extension is now auto-corrected
  (`output.png` → `output.jpg`) and a warning is printed to stderr. Previously
  the JPEG bytes were silently saved under `.png`, confusing viewers and
  `file(1)`.

### Notes
- JPEG metadata embedding is out of scope for this release. The AI Studio
  path returns JPEG, and since ADC/PNG is the differentiating axis of this
  CLI, investing in a JPEG (APP1/APP13) metadata writer was deprioritized in
  favor of shipping the ADC/PNG path robustly. Use the ADC path for
  PNG + metadata.
- `engines.node` remains `>=18` for end users; CRC32 is computed in-process
  rather than via `zlib.crc32` (Node >=22.2) to preserve Node 18 / 20
  compatibility. **Development** requires Node 20+ because the test runner
  uses `node --test --import tsx`, and `--import` is stable on Node 20+.

## [0.2.0] - 2026-04-24

After verifying against the Vertex AI REST spec, the `@google/genai` SDK's `ImageConfig` interface, and the `gemini-3-pro-image-preview` runtime, only `personGeneration` could be added with both auth paths in mind. Multiple-candidate generation, `seed`, output MIME type, and negative prompts were investigated but deferred (server-side rejection on `gemini-3-pro-image-preview`, missing fields in `ImageConfig`, or AI-Studio-side incompatibility).

### Added
- `--person-generation <mode>` CLI option (`ALLOW_ALL` / `ALLOW_ADULT` / `ALLOW_NONE`, case-insensitive on input) mapped to `generationConfig.imageConfig.personGeneration`. Omit to use the model default. Currently accepted on the Vertex AI (ADC) path; the AI Studio v1beta endpoint used by `--api-key` returns `400 Unknown name "personGeneration"` for `gemini-3-pro-image-preview` at the time of this release.

## [0.1.1] - 2026-04-24

### Changed
- Supply chain hardening: add `.npmrc` with `ignore-scripts=true` (postinstall defense), `audit-level=moderate`, `save-exact=true`. Pin all `dependencies` / `devDependencies` to exact versions so the lockfile and manifest agree on a single resolved version.
- CI (`ci.yml` / `release.yml`): run `npm audit --audit-level=moderate` and `npm audit signatures` before typecheck / build / publish.
- `release.yml`: publish via OIDC Trusted Publishing (first CI-driven release for this package).
- `src/generate.ts`: pick the region-less host `aiplatform.googleapis.com` when `GOOGLE_CLOUD_LOCATION=global`, since Gemini 3 Pro Image is only served at `global`. (Fixes 404 on the ADC path.)

### Added
- `.github/workflows/ci.yml`: typecheck / build / bin smoke test matrixed across Node 20 / 22 / 24.
- `.github/workflows/release.yml`: `v*` tag push → `npm publish --provenance` + GitHub Release from the matching CHANGELOG section.
- `.github/dependabot.yml`: weekly npm + github-actions updates with grouped `google-apis` and `dev-deps` PRs.
- `CONTRIBUTING.md`: repo layout, dev setup, ADC / API-key testing, commit conventions, release flow.
- `CLAUDE.md`: scoped editor guidance for this repo (ADC-first priority, region-less host invariant, file responsibilities).

### Dependencies
- Bump `@google/generative-ai` 0.21.0 → 0.24.1.
- Bump `google-auth-library` 9.15.1 → 10.6.2 (major; ADC path re-verified).
- Bump `actions/checkout` v4 → v6, `actions/setup-node` v4 → v6 (partial).

## [0.1.0] - 2026-04-24

### Added
- Initial release of `nanobanana-adc`.
- Gemini 3 Pro Image (Nano Banana Pro) CLI with first-class **Application Default Credentials (ADC)** support for Vertex AI, enabling use in enterprise / CI / Cloud Run / Cloud Build environments where `GEMINI_API_KEY` is not available.
- Fallback authentication via `--api-key` flag and `GEMINI_API_KEY` env var (AI Studio path).
- CLI options: `--prompt`, `--output`, `--aspect` (10 ratios), `--size` (1K/2K/4K), `--model`, `--api-key`.
- Claude Code plugin distribution: `.claude-plugin/plugin.json` + `marketplace.json`, installable via `/plugin marketplace add hummer98/nanobanana-adc`.
- Standalone CLI distribution: `npm install -g nanobanana-adc`.
- `SessionStart` hooks for zero-setup plugin installation (deps sync, node_modules symlink, dist build fallback).
- Bilingual documentation (English README + Japanese README.ja.md).
