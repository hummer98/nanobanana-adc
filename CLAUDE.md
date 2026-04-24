# nanobanana-adc

Gemini 3 Pro Image (Nano Banana Pro) CLI whose single differentiating axis is
**Application Default Credentials (ADC) support on Vertex AI**. Every other
Claude Code image skill on the market requires `GEMINI_API_KEY`; this one
covers the enterprise / CI / Cloud Run / Cloud Build blind spot.

## プロジェクトミッション

Provide a zero-friction image generation CLI that works in both:

1. **AI Studio path** — `GEMINI_API_KEY` set. Lowest-friction for individuals.
2. **Vertex AI path (ADC)** — `gcloud auth application-default login` + a GCP
   project with Gemini 3 Pro Image access. Required in enterprise pipelines
   where baking long-lived API keys into CI is forbidden.

## 設計原則

| 原則 | 意味 |
|------|------|
| **ADC is the primary axis** | Any change that degrades the ADC path is a regression. The API-key path is a fallback for casual users. |
| **One binary, two distributions** | Ship via `npm install -g` **and** `/plugin marketplace add`. Same `dist/cli.js`, same `bin/nanobanana-adc` dispatcher. Do not fork the codebase. |
| **No hidden coupling to Claude Code** | The CLI must run standalone in any shell. Claude Code plugin wiring (SessionStart hooks, SKILL.md) lives at the edges, not in `src/`. |
| **Fail loudly on auth ambiguity** | `[auth] using: adc` / `[auth] using: api-key` is always printed. Users must be able to tell which path fired without reading the code. |
| **Region-less host for `location=global`** | Gemini 3 Pro Image is only served from `aiplatform.googleapis.com` (no region prefix). `src/generate.ts` has a branch for this — do not remove it. |

## 優先順位（高→低）

1. **ADC 経路のバグ修正** — main の差別化軸を壊すバグは最優先。
2. **モデル互換性** — 新しい Gemini image モデル ID / region が出たら追従。
3. **配布経路の整備** — npm / Claude Code plugin / marketplace のどちらか一方でも壊れたら修正。
4. **ドキュメント** — README / README.ja.md / CHANGELOG は挙動と同期させる。
5. **新機能** — 画像編集 (inpainting / outpainting)、バッチ生成、MCP サーバ化は seed.md で「スコープ外」としており、別リポ or feature flag で検討。

## 認証優先順位（src/auth.ts）

1. `--api-key <key>` CLI flag
2. `GEMINI_API_KEY` environment variable
3. ADC (`GoogleAuth` → access token) — the main event

Do not reorder. Users who set `GEMINI_API_KEY` in their shell but pass
`--api-key` explicitly want the explicit key to win.

## ファイル責務

| ファイル | 責務 | 触ってよい範囲 |
|---------|------|---------------|
| `src/cli.ts` | commander で引数を解析し `generate()` を呼ぶ | オプション追加・help 改善 |
| `src/auth.ts` | 認証モード解決、access token 取得、エラー時 exit | 認証ロジックの拡張はここに集約 |
| `src/generate.ts` | Vertex AI fetch / AI Studio SDK 呼び分け、画像保存 | URL / body / response 解析 |
| `bin/nanobanana-adc` | shebang dispatcher | 変更不要 (dist/cli.js を呼ぶだけ) |
| `.claude-plugin/plugin.json` | Plugin manifest + SessionStart hooks | プラグイン挙動の変更 |
| `skills/nanobanana-adc/SKILL.md` | Claude Code が読む skill 定義 | trigger / usage 文言 |

## コミット・リリース

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `refactor:`...).
- CHANGELOG.md is the source of release notes; keep it current when merging
  user-visible changes.
- Release flow is `/release` (see `.claude/commands/release.md`). Never push a
  `v*` tag manually without CHANGELOG + plugin.json + marketplace.json being in
  sync.

## やらないこと

- `src/` に Claude Code 固有の環境変数 (`CLAUDE_PLUGIN_ROOT` 等) を持ち込まない。
- `dist/` を手編集しない。常に `tsc` で再生成する。
- `GEMINI_API_KEY` を `.envrc` や README にハードコードしない。
- 課金が発生する実モデル呼び出しを CI のデフォルトパスで回さない。
