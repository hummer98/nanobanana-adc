# T06 Inspection Report — Claude Code plugin 設定 (`SKILL.md` / `settings.json`)

## 1. Verdict

**GO**

## 2. Summary

受け入れ基準 4 項目すべて達成、Blocker 0 件。`SKILL.md` は `src/cli.ts:13-30` の `commander` 定義・`docs/seed.md` の環境変数表／認証優先順位と齟齬なく整合。`settings.json` は valid JSON、3 hook すべて bash 構文 OK、seed.md を起点に plan.md §4 のとおり node_modules symlink と dist fallback を段階的に拡張した設計になっている。`src/` / `bin/` / `package.json` / `tsconfig.json` に T06 由来の変更はなく、`tsc --noEmit` も通過。

## 3. 受け入れ基準ごとの評価

| # | 受け入れ基準 | 判定 | 根拠 |
|---|---|---|---|
| 1 | `SKILL.md` — slash command 定義 | pass | `SKILL.md:1-4` に YAML frontmatter `name: nanobanana-adc` / `description`（トリガキーワード `create / generate / draw / render` および `Google / Vertex AI / Gemini / ADC / GEMINI_API_KEY` を含む）。plan.md §2.1 の通り plugin namespace 込みで `/nanobanana-adc:nanobanana-adc` として呼ばれる。 |
| 2 | `SKILL.md` — 使い方 2〜3 例 | pass | `SKILL.md:21-32` の Quick examples に 3 例: (a) ADC 既定モード, (b) `--aspect 16:9 --size 2K`, (c) `--api-key` 明示。すべて実在するフラグのみ使用。 |
| 3 | `SKILL.md` — 環境変数一覧（seed.md と一致） | pass | `SKILL.md:47-53` の表が seed.md:65-71 の 5 変数（`GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` / `GOOGLE_GENAI_USE_VERTEXAI` / `GOOGLE_APPLICATION_CREDENTIALS` / `GEMINI_API_KEY`）と必須区分含めて一致。Authentication priority（`SKILL.md:57-59`）も seed.md:75-77 と一致。 |
| 4 | `settings.json` — `SessionStart` で `${CLAUDE_PLUGIN_DATA}` に package.json 展開し `npm install --omit=dev`（seed.md JSON をベース） | pass | `settings.json:7-8` の hook 1 本目が seed.md:85-96 をそのまま踏襲し、`--no-audit --no-fund` と `package-lock.json` コピーを追加強化。diff で冪等。 |
| 5 | `bin/` が Claude Code plugin PATH に追加されることの確認記述 | pass | plan.md §2.4 で「Claude Code 公式仕様（`plugins-reference.md`）により `bin/` は Bash ツール PATH へ自動追加」「`settings.json` 側で PATH 操作はしない（独立シェルに伝播しないため）」と明示。summary.md でも再確認されている。 |
| 6 | `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` パス解決の検討記述 | pass | plan.md §2.5・§2.6・§5 と summary.md で、hook 1（deps 同期）・hook 2（ROOT→DATA `node_modules` symlink）・hook 3（`dist/cli.js` 欠落時の tsc build fallback）の 3 段階解決ロジックを文書化。`settings.json:11-12`・`settings.json:15-16` に実装反映。 |

## 4. 検証実行結果

すべて `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-006-1776970552` で実行。

### 4.1 `jq . settings.json`

```
exit: 0
```

→ valid JSON。

### 4.2 各 hook コマンドの bash 構文チェック

```
CLAUDE_PLUGIN_ROOT=/tmp/nbadc-root-$$ CLAUDE_PLUGIN_DATA=/tmp/nbadc-data-$$ \
  bash -n -c "$(jq -r '.hooks.SessionStart[0].hooks[N].command' settings.json)"
```

| hook index | exit code |
|-----------:|----------:|
| 0 (deps 同期)           | 0 |
| 1 (node_modules symlink)| 0 |
| 2 (build fallback)      | 0 |

→ クォート・エスケープ（`\"`）も JSON→shell 展開後に正しく解釈されている。

### 4.3 `bunx tsc --noEmit`

```
exit: 0
(新規エラー 0)
```

→ 既存 `src/` を壊していない。

### 4.4 既存ファイルへの変更

```
git status --short
?? SKILL.md
?? settings.json
```

→ T06 で追加したのは `SKILL.md` / `settings.json` の 2 ファイルのみ。追跡済みファイルへの変更なし。

> 補足: プロンプト記載の `git diff main -- src bin package.json tsconfig.json` は空にならないが、これは T01〜T05 の未マージコミット（`97c6e62..904ac1d`）が worktree 側にあるためで、T06 の責務範囲外。`git diff HEAD -- src bin package.json tsconfig.json` は空 (exit 0)。

### 4.5 Options 表と `src/cli.ts` の突合（`src/cli.ts:13-30`）

| `src/cli.ts` | SKILL.md Options |
|---|---|
| `-p, --prompt <text>` required | `-p, --prompt` / (required) ✓ |
| `-o, --output <path>` default `output.png` | `-o, --output` / `output.png` ✓ |
| `-a, --aspect <ratio>` default `1:1` 選択肢 10 種 | `-a, --aspect` / `1:1` / 選択肢 10 種一致 ✓ |
| `-s, --size <size>` choices `1K/2K/4K` default `1K` | `-s, --size` / `1K` / `1K`/`2K`/`4K` ✓ |
| `-m, --model <id>` default `gemini-3-pro-image-preview` | `-m, --model` / `gemini-3-pro-image-preview` ✓ |
| `--api-key <key>` description `falls back to GEMINI_API_KEY / ADC` | `--api-key` / `Falls back to GEMINI_API_KEY then ADC` ✓ |

→ フラグ名・既定値・選択肢すべて一致。

### 4.6 `package.json` の `files` フィールド（将来 T08 の npm publish 用）

```
files: ["dist/", "bin/", "SKILL.md", "settings.json", "README.md", "LICENSE"]
```

→ T05 時点で既に `SKILL.md` / `settings.json` が同梱リストに入っており、T08 publish 時の同梱は保証済み。変更不要。

## 5. Findings

### Blocker
なし。

### Major
なし。

### Minor

1. **hook 2 発火後の dev deps 残置** — hook 2（build fallback）は `cd "${CLAUDE_PLUGIN_DATA}" && npm install --no-audit --no-fund`（`--omit=dev` なし）で TypeScript を一時導入するが、完了後に `--omit=dev` へ戻すクリーンアップはない。ディスク使用量がわずかに増えるのみで機能影響なし。将来 `package.json` を ROOT 側で更新すると、次回 hook 0 が `--omit=dev` で再インストールするため自動で縮む。対応不要。
2. **hook 2 の稀なエッジケース** — 初回セッションで hook 0 が `--omit=dev` 済 → ROOT の `package.json` を更新 → 次セッションで hook 0 が再度 `--omit=dev` 実行（TS 消える）→ 同時に `dist/cli.js` が削除されていると hook 2 が走るが、先に行った `--omit=dev` により `${CLAUDE_PLUGIN_DATA}` の TypeScript は消えている。ただし hook 2 は自分で `npm install`（dev 込み）を再実行してから `tsc` を呼ぶ設計のため、この経路でも自己修復される（設計は正しい）。記録のみ。
3. **SKILL.md description の長さ** — 1 行で 290 文字程度。多くの Skill ランタイムは問題なく扱うが、表示 UI 側で切り詰められる可能性がある。キーワード密度を優先した設計判断として妥当。

## 6. Fix Required

（GO のため該当なし）

---

以上。Implementer の成果物は plan.md に忠実で、受け入れ基準 4 項目を満たし、かつ bash 構文チェック・JSON 妥当性・既存コード不変性のすべてを満たす。**GO**。
