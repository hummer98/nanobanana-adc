---
name: nanobanana-adc
description: Generate images with Google's Nano Banana Pro (Gemini 3 Pro Image) using Application Default Credentials (ADC) or a GEMINI_API_KEY. Use this when the user asks to create, generate, draw, or render an image via Google / Vertex AI / Gemini.
---

# nanobanana-adc

Image generation CLI built on Gemini 3 Pro Image (Nano Banana Pro). Unlike other
Claude Code image skills, this one works with **Application Default Credentials
(ADC)** on Vertex AI — required in enterprise / CI / Cloud Run / Cloud Build
environments where `GEMINI_API_KEY` is not available.

## When to use

Trigger this skill when the user wants to:
- Create / generate / draw / render an image via Google or Vertex AI.
- Use Gemini 3 Pro Image (`gemini-3-pro-image-preview`) from a corporate GCP
  project that uses ADC instead of a bare API key.
- Fall back to `GEMINI_API_KEY` when ADC is not set up.

## Quick examples

```bash
# ADC mode (default — uses gcloud / metadata server)
nanobanana-adc --prompt "a cat astronaut on mars, cinematic" --output cat.png

# 16:9 2K
nanobanana-adc --prompt "futuristic tokyo skyline" --aspect 16:9 --size 2K -o tokyo.png

# API key mode (explicit override)
nanobanana-adc --prompt "..." --api-key "$GEMINI_API_KEY" -o out.png
```

## Options

| Flag            | Default                      | Notes                                                                             |
|-----------------|------------------------------|-----------------------------------------------------------------------------------|
| `-p, --prompt`  | (required)                   | Prompt text.                                                                      |
| `-o, --output`  | `output.png`                 | Output file path.                                                                 |
| `-a, --aspect`  | `1:1`                        | `1:1` / `16:9` / `9:16` / `4:3` / `3:4` / `3:2` / `2:3` / `21:9` / `9:21` / `5:4`. |
| `-s, --size`    | `1K`                         | `1K` / `2K` / `4K`.                                                               |
| `-m, --model`   | `gemini-3-pro-image-preview` | Override model id.                                                                |
| `--api-key`     | —                            | Gemini API key. Falls back to `GEMINI_API_KEY` then ADC when omitted.             |

## Environment variables

| Variable                         | Required (ADC) | Purpose                                          |
|----------------------------------|----------------|--------------------------------------------------|
| `GOOGLE_CLOUD_PROJECT`           | ✓              | GCP project id.                                  |
| `GOOGLE_CLOUD_LOCATION`          | ✓              | Region (e.g. `us-central1`).                     |
| `GOOGLE_GENAI_USE_VERTEXAI`      | ✓              | Must be `true`.                                  |
| `GOOGLE_APPLICATION_CREDENTIALS` | optional       | Path to ADC key file (else falls back to gcloud).|
| `GEMINI_API_KEY`                 | fallback       | Used when ADC is not configured.                 |

## Authentication priority

1. `--api-key` flag
2. `GEMINI_API_KEY` env var
3. ADC (`google-auth-library`)

## Troubleshooting

- **`Could not load the default credentials`** — run `gcloud auth application-default login` and ensure `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` / `GOOGLE_GENAI_USE_VERTEXAI=true` are set.
- **`PERMISSION_DENIED`** — ensure the ADC principal has `roles/aiplatform.user` on the project, and that Vertex AI image generation is enabled.
- **No image returned / unexpected model error** — confirm the model id (`--model gemini-3-pro-image-preview`) is available in your region, or explicitly fall back to an API key with `--api-key "$GEMINI_API_KEY"`.
