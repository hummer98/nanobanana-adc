# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
