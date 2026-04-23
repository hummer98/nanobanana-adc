# nanobanana-adc

English · [日本語](./README.ja.md)

> Gemini 3 Pro Image (Nano Banana Pro) CLI with first-class Application Default Credentials support — use Vertex AI from CI, Cloud Run, or any gcloud-authenticated workstation without handing out API keys.

## Why nanobanana-adc?

Most existing Claude Code skills for Gemini image generation (cc-nano-banana, ccskill-nanobanana, skill-nano-banana, and similar) only accept a `GEMINI_API_KEY`. That leaves a gap for enterprise environments, CI/CD pipelines, and Cloud Run deployments where API keys are discouraged and Vertex AI with Application Default Credentials (ADC) is the required authentication path.

**nanobanana-adc exists to fill that gap.** ADC support is its single differentiating axis. If you already have `gcloud auth application-default login` configured, a service account attached to your workload, or `GOOGLE_APPLICATION_CREDENTIALS` pointing at a JSON key, this CLI will pick it up automatically — no key handling required.

## Features

- ADC authentication via `google-auth-library` (default).
- `GEMINI_API_KEY` fallback for lightweight setups.
- 10 aspect ratios: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4.
- 3 resolutions: 1K, 2K, 4K.
- Ships as both an npm binary and a Claude Code plugin from the same repo.
- TypeScript, strict mode, Node.js ≥ 18.

## Installation

### As a Claude Code plugin

```bash
/plugin marketplace add yamamoto/nanobanana-adc
```

The plugin's `SessionStart` hook installs runtime dependencies into `${CLAUDE_PLUGIN_DATA}` by running `npm install --omit=dev` on first use, so no extra setup is required.

### As a standalone CLI (npm install -g)

```bash
npm install -g nanobanana-adc
# or run without installing:
npx nanobanana-adc --prompt "a cat in space"
```

## Quick start

```bash
export GOOGLE_CLOUD_PROJECT=my-project
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_VERTEXAI=true
gcloud auth application-default login

nanobanana-adc --prompt "a cat in space" --output cat.png
```

## Usage

### Examples

```bash
# 1. Basic
nanobanana-adc --prompt "a cat in space" --output cat.png

# 2. Aspect ratio + size
nanobanana-adc -p "neon skyline at dusk" -a 16:9 -s 2K -o skyline.png

# 3. Portrait, 4K
nanobanana-adc -p "a lone lighthouse in a storm" --aspect 9:16 --size 4K

# 4. Override model
nanobanana-adc -p "retro poster art" --model gemini-3-pro-image-preview

# 5. API-key fallback
nanobanana-adc -p "a cat in space" --api-key "$GEMINI_API_KEY"
```

### Options

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `--prompt` | `-p` | — (required) | Prompt text. |
| `--output` | `-o` | `output.png` | Output file path. |
| `--aspect` | `-a` | `1:1` | Aspect ratio. One of 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4. |
| `--size` | `-s` | `1K` | Image size. One of 1K, 2K, 4K. |
| `--model` | `-m` | `gemini-3-pro-image-preview` | Model ID. |
| `--api-key` | — | — | Explicit Gemini API key (overrides env and ADC). |

## Authentication

### Option A — Application Default Credentials (recommended)

```bash
# 1. Sign in for application-default credentials.
gcloud auth application-default login

# 2. Point at your Vertex AI project and region.
export GOOGLE_CLOUD_PROJECT=my-project
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_VERTEXAI=true

# 3. Generate an image — no API key needed.
nanobanana-adc --prompt "a cat in space" --output cat.png
```

In CI or on Cloud Run, skip `gcloud auth application-default login` and instead set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON file, or attach a service account to the workload so ADC resolves automatically.

### Option B — API key (fallback)

```bash
export GEMINI_API_KEY=...
nanobanana-adc --prompt "a cat in space" --output cat.png

# or pass inline:
nanobanana-adc --prompt "a cat in space" --api-key "$GEMINI_API_KEY"
```

### Resolution order

Credentials are resolved in this order; the first match wins:

1. `--api-key` CLI flag.
2. `GEMINI_API_KEY` environment variable.
3. Application Default Credentials via `google-auth-library` (the primary, recommended path).

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GOOGLE_CLOUD_PROJECT` | ADC mode | GCP project ID. |
| `GOOGLE_CLOUD_LOCATION` | ADC mode | Region, e.g. `us-central1`. |
| `GOOGLE_GENAI_USE_VERTEXAI` | ADC mode | Set to `true` to make the Vertex AI mode explicit. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional | Path to a service-account JSON key. Falls back to gcloud user credentials if unset. |
| `GEMINI_API_KEY` | Fallback | Used when ADC environment is not configured. |

## Development

```bash
npm install
npm run build
node dist/cli.js --help
# or, after `npm link`:
nanobanana-adc --help
```

Requires Node.js ≥ 18.

## License

MIT — see [LICENSE](./LICENSE).
