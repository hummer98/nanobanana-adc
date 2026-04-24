# T06 実装サマリー — Claude Code plugin 設定

## 作成したファイル

| Path | 役割 |
|------|------|
| `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-006-1776970552/SKILL.md` | Skill（slash command）定義。frontmatter + Overview / When to use / Quick examples (3) / Options / Environment variables / Authentication priority / Troubleshooting。 |
| `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-006-1776970552/settings.json` | SessionStart フック 3 段階（deps 同期 → node_modules symlink → build fallback）。 |

`src/`・`bin/`・`package.json`・`tsconfig.json` は一切変更していない。`.team/artifacts/` にも書いていない（Conductor が処理）。git commit も行っていない。

---

## 受け入れ基準への対応

| 受け入れ基準 | 対応 | 根拠 |
|--------------|------|------|
| `SKILL.md` 作成（slash command 定義） | check | frontmatter に `name: nanobanana-adc` / `description`（create / generate / draw / render / Google / Vertex AI / Gemini / ADC / GEMINI_API_KEY を網羅）を記述。plugin namespace 込みで `/nanobanana-adc:nanobanana-adc` として呼ばれる。 |
| `SKILL.md` 使い方 2〜3 例 | check | Quick examples は 3 例: (1) ADC モード既定, (2) aspect+size（16:9 / 2K）, (3) `--api-key` 明示。 |
| `SKILL.md` 環境変数一覧 | check | Environment variables 表に `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` / `GOOGLE_GENAI_USE_VERTEXAI` / `GOOGLE_APPLICATION_CREDENTIALS` / `GEMINI_API_KEY` を列挙（docs/seed.md と一致）。 |
| `SKILL.md` Options 表が `src/cli.ts` と一致 | check | `-p/--prompt` 必須、`-o/--output` 既定 `output.png`、`-a/--aspect` 既定 `1:1`（選択肢 10 種）、`-s/--size` 既定 `1K`（`1K`/`2K`/`4K`）、`-m/--model` 既定 `gemini-3-pro-image-preview`、`--api-key` を `src/cli.ts:13-30` と突き合わせて確定。 |
| Authentication priority が 3 段階 | check | `--api-key` → `GEMINI_API_KEY` → ADC の順で明記。 |
| `settings.json` 作成（SessionStart で `npm install --omit=dev`） | check | hook 1 本目に `npm install --omit=dev --no-audit --no-fund` を配置（seed.md を起点）。 |
| seed.md の JSON をベースに | check | hook 1 本目は seed.md のものを踏襲しつつ `package-lock.json` のコピーと `--no-audit --no-fund` を追加。hook 2（symlink）・3（build fallback）は plan.md §4 で拡張した内容。 |
| `bin/` が plugin の PATH に追加 | check | Claude Code 公式仕様（`plugins-reference.md`）で `bin/` 配下が自動 PATH 追加される前提に依存。`settings.json` 側で `export PATH` は行わない（plan.md §2.4 の判断どおり）。 |
| `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` パス解決の検討 | check | hook 1（diff で冪等）・hook 2（ROOT→DATA symlink で `node_modules` 解決）・hook 3（`dist/cli.js` 欠落時の tsc fallback）で両変数を用いた解決ロジックを構築。plan.md §2.6 の意図を反映。 |

---

## 実施した検証

すべて worktree 直下（`/Users/yamamoto/git/nanobanana-adc/.worktrees/task-006-1776970552`）で実行。

### 1. `jq . settings.json` — JSON として valid

```
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "diff -q ... npm install --omit=dev --no-audit --no-fund)" },
          { "type": "command", "command": "[ -e ... ] || ln -sfn ..." },
          { "type": "command", "command": "[ -f ... ] || (... tsc -p ...)" }
        ]
      }
    ]
  }
}
```

→ パースできた。終了コード 0。

### 2. `head -30 SKILL.md` — frontmatter 確認

```
---
name: nanobanana-adc
description: Generate images with Google's Nano Banana Pro (Gemini 3 Pro Image) using Application Default Credentials (ADC) or a GEMINI_API_KEY. Use this when the user asks to create, generate, draw, or render an image via Google / Vertex AI / Gemini.
---

# nanobanana-adc
...
```

→ frontmatter は valid YAML（`---` 区切り、`name` と `description` のみ、description 1 行）。自動起動キーワード（create / generate / draw / render / Google / Vertex AI / Gemini / ADC）を網羅。

### 3. SessionStart hook の bash 構文チェック（`bash -n`）

```
CLAUDE_PLUGIN_ROOT=/tmp/nbadc-root-$$ CLAUDE_PLUGIN_DATA=/tmp/nbadc-data-$$ \
  bash -n -c "$(jq -r '.hooks.SessionStart[0].hooks[0].command' settings.json)"  # → hook0 OK
  bash -n -c "$(jq -r '.hooks.SessionStart[0].hooks[1].command' settings.json)"  # → hook1 OK
  bash -n -c "$(jq -r '.hooks.SessionStart[0].hooks[2].command' settings.json)"  # → hook2 OK
```

3 本とも bash の syntax check に通過。クォートエスケープ（`\"...\"`）も JSON→shell 展開後に期待通り `"..."` になることを確認。

### 4. `bunx tsc --noEmit` — 既存コードを壊していない

実行結果: 出力なし・終了コード 0（既存 `src/` には触っていないが、念のため確認）。

---

## plan からの乖離

なし。plan.md §3 の SKILL.md 骨格と §4 の settings.json を忠実に実装。以下の軽微な補強のみ：

- SKILL.md Options 表: `src/cli.ts:13-30` と突き合わせて、`--api-key` の Notes を「Falls back to `GEMINI_API_KEY` then ADC when omitted.」に明示化（CLI の help 文言 `falls back to GEMINI_API_KEY / ADC` と整合）。
- SKILL.md Troubleshooting: plan で 1〜2 項目と示唆されていたが、seed.md の 3 段階認証優先順位に対応する 3 項目（credentials 未設定 / PERMISSION_DENIED / モデル id 系）を列挙。
- settings.json hook 3 本目の `tsc` 呼び出しは `${CLAUDE_PLUGIN_DATA}/node_modules/.bin/tsc` を直接起動（plan.md §4 の記載どおり、`npm run build` でなく直接 cwd=ROOT で呼ぶ形）。

---

## 作業境界の遵守

- `src/` / `bin/` / `package.json` / `tsconfig.json`: 変更なし
- 作成: `SKILL.md`, `settings.json`（worktree 直下）+ 本 `summary.md`
- `.team/artifacts/` への書き込み: なし
- git commit: 行っていない
