# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
