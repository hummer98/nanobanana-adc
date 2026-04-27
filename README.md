# nanobanana-adc

English · [日本語](./README.ja.md)

![nanobanana-adc — Gemini 3 Pro Image CLI with ADC support](docs/generated/readme-hero.png)

> Gemini 3 Pro Image (Nano Banana Pro) CLI with first-class Application Default Credentials support — use Vertex AI from CI, Cloud Run, or any gcloud-authenticated workstation without handing out API keys.

## Why nanobanana-adc?

Most existing Claude Code skills for Gemini image generation (cc-nano-banana, ccskill-nanobanana, skill-nano-banana, and similar) only accept a `GEMINI_API_KEY`. That leaves a gap for enterprise environments, CI/CD pipelines, and Cloud Run deployments where API keys are discouraged and Vertex AI with Application Default Credentials (ADC) is the required authentication path.

**nanobanana-adc exists to fill that gap.** ADC support is its single differentiating axis. If you already have `gcloud auth application-default login` configured, a service account attached to your workload, or `GOOGLE_APPLICATION_CREDENTIALS` pointing at a JSON key, this CLI will pick it up automatically — no key handling required.

## Features

- ADC authentication via `google-auth-library` (default).
- `GEMINI_API_KEY` fallback for lightweight setups.
- 10 aspect ratios: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 9:21, 5:4.
- 3 resolutions: 1K, 2K, 4K.
- AIview / Automatic1111 compatible `tEXt parameters` embedded in generated
  PNGs (opt out with `--no-embed-metadata`). Google's C2PA / SynthID
  provenance chunks are preserved.
- Ships as both an npm binary and a Claude Code plugin from the same repo.
- TypeScript, strict mode, Node.js ≥ 18.

## Installation

### As a Claude Code plugin

```bash
/plugin marketplace add hummer98/nanobanana-adc
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

# 6. Restrict person generation
nanobanana-adc -p "a bustling plaza" --person-generation ALLOW_ADULT
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
| `--person-generation` | — | — | Control person generation. One of `ALLOW_ALL`, `ALLOW_ADULT`, `ALLOW_NONE` (case-insensitive). Omit to use the model default. |
| `--no-embed-metadata` | — | embed | Disable embedding of the AIview-compatible `tEXt parameters` chunk in PNG output. JPEG output is unaffected (metadata is never embedded into JPEG in this release). |

> Note on `--person-generation`: currently accepted on the Vertex AI (ADC) path. The AI Studio v1beta endpoint used by the `--api-key` / `GEMINI_API_KEY` path does not yet recognize this field for `gemini-3-pro-image-preview` and returns `400 Unknown name "personGeneration"`. There are also reports that some AI Studio API-key tiers may reject `ALLOW_ALL` with a 400 error (not yet confirmed for the Gemini API path). If you hit either, fall back to omitting the flag or use the ADC path.

## Metadata

By default, generated PNG files carry an Automatic1111 / AIview-compatible
`tEXt` chunk with keyword `parameters`. The payload is a two-line string
whose first line is the prompt and whose second line is a comma-separated
list of CLI options:

```
<prompt>
Steps: 1, Sampler: gemini, Size: 1024x1024, Model: gemini-3-pro-image-preview, Aspect: 1:1[, Person generation: ALLOW_ADULT]
```

`Steps: 1, Sampler: gemini` are placeholder fields required by AIview's
`parsePrompt` (it splits on `Steps:`). The chunk is inserted immediately
before `IEND`; Google's C2PA (`caBX`), IPTC (`zTXt`), and XMP (`iTXt`)
chunks are preserved byte-for-byte.

To opt out:

```bash
nanobanana-adc -p "private prompt" --no-embed-metadata -o out.png
```

Note: AI Studio (`--api-key` / `GEMINI_API_KEY`) returns `image/jpeg`. In
that case the output extension is auto-corrected to `.jpg` and metadata
embedding is skipped (JPEG APP1/APP13 support is out of scope for v0.3.0).

## Diagnostics (doctor)

Run `nanobanana-adc doctor` to confirm which auth route will fire, whether the
GCP environment variables are coherent, and whether the ADC token can actually
be fetched — all without calling the model (no billable request is made).

```text
$ nanobanana-adc doctor
nanobanana-adc doctor

CLI
  path:                             /usr/local/lib/node_modules/nanobanana-adc/dist/cli.js
  version:                          0.6.0
  install:                          npm-global

Auth route
  selected:                         adc   (GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION set; ADC path)

API key
  present:                          no

ADC
  probed:                           yes
  status:                           ok
  account:                          user@example.com
  project:                          my-gcp-proj

GCP env
  GOOGLE_CLOUD_PROJECT:             my-gcp-proj
  GOOGLE_CLOUD_LOCATION:            global
  GOOGLE_GENAI_USE_VERTEXAI:        true
  GOOGLE_APPLICATION_CREDENTIALS:   (unset)

Gcloud config dir
  resolved:                         /home/user/.config/gcloud
  source:                           default ($HOME/.config/gcloud)
  presence:
    active_config:                  exists
    configurations/:                exists (1 entry)
    credentials.db:                 exists
    access_tokens.db:               exists
    application_default_credentials.json: exists
    legacy_credentials/:            missing

ADC source
  resolved:                         default (effective default)
  env GOOGLE_APPLICATION_CREDENTIALS: (unset)
  effective default:                /home/user/.config/gcloud/application_default_credentials.json   (exists, 2400 B, 2026-04-26T07:00:00.000Z)
  metadata server:                  not probed (no GCE/Cloud Run env detected)
  type:                             authorized_user
  quotaProjectId:                   my-gcp-proj
  clientId:                         32555940559.apps.googleusercontent.com
  account:                          user@example.com

Model
  default:                          gemini-3-pro-image-preview
  note:                             requires GOOGLE_CLOUD_LOCATION=global on the ADC path

Warnings (0)
  (none)
```

<details>
<summary>With <code>CLOUDSDK_CONFIG</code> set (gcloud config dir overridden)</summary>

```text
Gcloud config dir
  resolved:                         /Users/me/git/other-repo/.config/gcloud
  source:                           env CLOUDSDK_CONFIG
  presence:
    active_config:                  exists
    configurations/:                exists (3 entries)
    credentials.db:                 exists
    access_tokens.db:               exists
    application_default_credentials.json: exists
    legacy_credentials/:            missing
  note:                             overrides $HOME/.config/gcloud entirely; gcloud auth list / configurations / ADC are isolated from the OS default

ADC source
  resolved:                         default (effective default)
  env GOOGLE_APPLICATION_CREDENTIALS: (unset)
  effective default:                /Users/me/git/other-repo/.config/gcloud/application_default_credentials.json   (exists, 2400 B, ...)
  ...

Warnings (1)
  ⓘ [CLOUDSDK_CONFIG_OVERRIDE] gcloud config directory is overridden to `/Users/me/git/other-repo/.config/gcloud` via CLOUDSDK_CONFIG; gcloud auth / configurations / ADC are isolated from $HOME/.config/gcloud.
```

</details>

`doctor` reports four additional warnings introduced in v0.5.0 / v0.6.0:

| code | severity | when it fires |
|---|---|---|
| `ADC_QUOTA_PROJECT_MISMATCH` | `warn` | `quota_project_id` in the ADC JSON differs from `GOOGLE_CLOUD_PROJECT`. Run `gcloud auth application-default set-quota-project $GOOGLE_CLOUD_PROJECT` to align them. |
| `ADC_FILE_MISSING` | `warn` | `GOOGLE_APPLICATION_CREDENTIALS` is set but the file does not exist (or is a directory). Fires alongside the existing `CREDS_FILE_MISSING` for backward compatibility. |
| `ADC_TYPE_UNUSUAL` | `info` | The ADC JSON parsed but `type` is not one of `authorized_user` / `service_account` / `external_account` / `impersonated_service_account`. |
| `CLOUDSDK_CONFIG_OVERRIDE` | `info` | `CLOUDSDK_CONFIG` is set; gcloud auth list / configurations / ADC are isolated from `$HOME/.config/gcloud`. |

### Migrating from v0.5

`adcSource.resolved === 'default'` changed meaning in v0.6: in v0.5 it meant
"ADC was found at the OS default path (`$HOME/.config/gcloud/...`)"; in v0.6
it means "ADC was found at the *effective* default — `$CLOUDSDK_CONFIG/...`
when that env is set, otherwise the OS default." The actual path is now in
`adcSource.effectiveDefault.path` (with `adcSource.defaultLocation.path` kept
as an alias for v0.6.x and removed in v1.0). `adcSource.resolved ===
'cloudsdk-config'` is no longer produced — the `'default'` branch covers that
case, and dir-level state has moved to the new top-level `gcloudConfigDir`.

Common flags:

```bash
# Machine-readable JSON — stable schema `nanobanana-adc-doctor/v1`.
# Output uses camelCase throughout (e.g. .adcSource, .quotaProjectId), matching
# the existing .gcpEnv / .authRoute / .apiKey style.
nanobanana-adc doctor --json | jq .

# Inspect just the ADC source resolution section:
nanobanana-adc doctor --json | jq .adcSource

# Inspect the gcloud config directory (resolved path, source, presence):
nanobanana-adc doctor --json | jq .gcloudConfigDir

# Gate a script on no-fatal-state:
nanobanana-adc doctor --json | jq -e '.fatal | not' >/dev/null && echo "ready"

# Include ADC token prefix, gcloud config, and runtime details:
nanobanana-adc doctor --verbose

# Probe the GCE / Cloud Run metadata server (300ms timeout, opt-in only):
nanobanana-adc doctor --probe-metadata-server
```

`doctor` always exits `0` — even when it reports `fatal: true` — because it is
a diagnostic command, not a gate. Use `--json` + `jq` to drive CI. See
[CHANGELOG.md](./CHANGELOG.md) v0.4.0 / v0.5.0 / v0.6.0 for the full rationale.

> **Note**: `--verbose` can include personal email addresses (from
> `gcloud auth list` / `gcloud config get-value account`) and local file
> paths. Avoid pasting verbose output into issues, CI transcripts, or demo
> recordings without review. Secrets in the ADC JSON (`private_key`,
> `private_key_id`, `refresh_token`) are **never** copied to any output —
> the `parseAdcMeta` helper allocates a fresh result object that omits
> them.

## Authentication

### Option A — Application Default Credentials (recommended)

```bash
# 1. Sign in for application-default credentials with one command.
nanobanana-adc auth login

# By default, the login subcommand:
#   - resolves CLOUDSDK_CONFIG from --config-dir / $CLOUDSDK_CONFIG (inherited as-is) /
#     $GOOGLE_APPLICATION_CREDENTIALS dirname / gcloud default
#   - runs `gcloud auth application-default set-quota-project $GOOGLE_CLOUD_PROJECT`
#     if that env is set
# Override with --config-dir <path>, --quota-project <id>, --no-quota-project,
# or --scopes <csv>.

# 2. Point at your Vertex AI project and region.
export GOOGLE_CLOUD_PROJECT=my-project
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_VERTEXAI=true

# 3. Generate an image — no API key needed.
nanobanana-adc --prompt "a cat in space" --output cat.png
```

If you prefer the manual flow:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project "$GOOGLE_CLOUD_PROJECT"
```

In CI or on Cloud Run, skip `gcloud auth application-default login` (and `nanobanana-adc auth login`) and instead set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON file, or attach a service account to the workload so ADC resolves automatically.

#### `auth login` subcommand

`nanobanana-adc auth login` is a thin wrapper around
`gcloud auth application-default login` that resolves `CLOUDSDK_CONFIG` and
quota project the same way `nanobanana-adc doctor` reports them, so the path
the doctor shows after `auth login` matches the path that ADC will read from.

```bash
# See the resolved plan without spawning gcloud (no auth flow, exit 0):
nanobanana-adc auth login --dry-run

# Print argv used for the spawned gcloud invocation:
nanobanana-adc auth login --verbose

# Narrow scopes (defaults to gcloud built-in scopes):
nanobanana-adc auth login --scopes https://www.googleapis.com/auth/cloud-platform

# Full help, including the resolution priority block:
nanobanana-adc auth login --help
```

> **Note**: `--dry-run` works even when the gcloud SDK is not installed (it
> never spawns gcloud and never touches the filesystem). A real
> `auth login` run requires the [gcloud CLI](https://cloud.google.com/sdk/docs/install)
> on `PATH`.

Resolution priority (see `--help` for the canonical block):

- `CLOUDSDK_CONFIG`: `--config-dir` → `$CLOUDSDK_CONFIG` (passed through as-is)
  → `$GOOGLE_APPLICATION_CREDENTIALS` dirname (only when its basename is
  `application_default_credentials.json`) → gcloud OS default
  (`CLOUDSDK_CONFIG` unset for the child).
- Quota project: `--quota-project <id>` → `--no-quota-project` (skip) →
  `$GOOGLE_CLOUD_PROJECT` → skip with notice.

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
npm test
node dist/cli.js --help
# or, after `npm link`:
nanobanana-adc --help
```

End users require Node.js ≥ 18 (`engines.node`). **Development** requires
Node.js ≥ 20 because the test runner uses `node --test --import tsx`, and
the `--import` flag is stable on Node 20+.

## License

MIT — see [LICENSE](./LICENSE).
