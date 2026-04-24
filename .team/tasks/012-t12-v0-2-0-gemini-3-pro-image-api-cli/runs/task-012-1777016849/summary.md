# Summary: task-012 / v0.2.0 — `--person-generation` CLI option

- Run: `task-012-1777016849`
- Branch: `task-012-1777016849/task`
- Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-012-1777016849`
- Implementer 完了日: 2026-04-24

## 1. 実施内容

plan.md / design-review.md / research.md の方針に従い、`--person-generation <mode>` 1 オプションのみを追加した。research で両経路非対称あるいは未保証と判明した `--count` / `--seed` / `--mime` / `--negative-prompt` は不採用 (task spec 受け入れ基準 0 が許可した narrowing)。

### 変更ファイル

| ファイル | 変更概要 |
|---|---|
| `src/generate.ts` | `PERSON_GENERATION_MODES` 定数 / `PersonGeneration` 型 / `assertPersonGeneration` 追加。`GenerateOptions.personGeneration?: PersonGeneration` 追加。`generateViaVertexFetch` と `generateViaSdk` の `imageConfig` に条件付き spread (`...(options.personGeneration ? { personGeneration: options.personGeneration } : {})`) を 2 箇所 注入。 |
| `src/cli.ts` | `.version('0.2.0')`。`--person-generation <mode>` を `addOption(new Option(...).choices(...).argParser(...))` で追加。`argParser` 内で `toUpperCase()` + 検証 (commander 14 では argParser が後勝ちで choices の validator を上書きするため、argParser 内で再検証する必要があった)。`opts` 型に `personGeneration?: string` を追加し、`if (opts.personGeneration) { assertPersonGeneration(...); generateOptions.personGeneration = opts.personGeneration; }` で詰め直し。 |
| `package.json` | version 0.1.1 → 0.2.0 |
| `package-lock.json` | `npm install --package-lock-only` で同期 |
| `.claude-plugin/plugin.json` | version 0.1.1 → 0.2.0 |
| `.claude-plugin/marketplace.json` | plugins[0].version 0.1.1 → 0.2.0 |
| `CHANGELOG.md` | `## [0.2.0] - 2026-04-24` セクション追加。Scope notes は見出しなしのプレーン段落 (design-review §推奨案 b)、続けて `### Added`。 |
| `README.md` | Options 表に行追加 / Usage examples §6 追加 / `> Note on --person-generation` 注記追加。 |
| `README.ja.md` | 上記の日本語版。 |

差分行数 (概算):

```
 src/cli.ts                          | 21 +++++++++++++++++++--
 src/generate.ts                     | 27 ++++++++++++++++++++++++++-
 package.json                        |  2 +-
 package-lock.json                   |  4 ++--
 .claude-plugin/plugin.json          |  2 +-
 .claude-plugin/marketplace.json     |  2 +-
 CHANGELOG.md                        |  7 +++++++
 README.md                           |  6 ++++++
 README.ja.md                        |  6 ++++++
```

## 2. Static checks の結果

```
$ npm run typecheck
> nanobanana-adc@0.2.0 typecheck
> tsc --noEmit
(0 errors)

$ npm run build
> nanobanana-adc@0.2.0 build
> tsc
(0 errors)

$ node dist/cli.js --version
0.2.0

$ node dist/cli.js --help
... (抜粋)
  --person-generation <mode>  control person generation (choices: "ALLOW_ALL",
                              "ALLOW_ADULT", "ALLOW_NONE")
...

$ node dist/cli.js --prompt x --person-generation invalid; echo "exit=$?"
error: option '--person-generation <mode>' argument 'invalid' is invalid. Allowed choices are ALLOW_ALL, ALLOW_ADULT, ALLOW_NONE.
exit=1

# lowercase test (design-review §推奨)
$ node dist/cli.js --prompt x --person-generation allow_adult --api-key INVALID_KEY
[auth] using: api-key
Error: [generate] API error: [GoogleGenerativeAI Error]: Error fetching from
  https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent:
  [400 Bad Request] Invalid JSON payload received. Unknown name "personGeneration"
  at 'generation_config.image_config': Cannot find field. ...
exit=1
```

すべて意図通り。lowercase 入力 `allow_adult` は argParser で `ALLOW_ADULT` に正規化されて choices チェックを通り、後段の API リクエストへ進んだ (=lowercase alias 動作確認 OK)。

### バージョン同期 確認

```
$ grep -rEn '"version"\s*:\s*"[^"]+"' package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json && grep -n "\.version(" src/cli.ts
package.json:3:  "version": "0.2.0",
.claude-plugin/plugin.json:3:  "version": "0.2.0",
.claude-plugin/marketplace.json:12:      "version": "0.2.0",
18:  .version('0.2.0')
```

`package-lock.json` の root `"version"` も `0.2.0` に更新済み (npm install --package-lock-only により自動)。

## 3. 実画像生成テスト (ADC 経路 1 枚)

design-review §必須 に従い ADC 経路で 1 枚だけ実生成。`GEMINI_API_KEY` がシェル環境に設定されていたため (auth.ts の優先順位でこれが ADC より先に勝つ)、`env -u GEMINI_API_KEY` で一時的に外して実行。

```
$ env -u GEMINI_API_KEY GOOGLE_CLOUD_LOCATION=global node dist/cli.js \
    --prompt "a watercolor of a quiet harbor at dawn, no people" \
    --person-generation ALLOW_NONE \
    --size 1K \
    --output /tmp/nanobanana-adc-test-012.png
[auth] using: adc
[generate] done | output=/tmp/nanobanana-adc-test-012.png | model=gemini-3-pro-image-preview | elapsed_ms=34516
exit=0

$ file /tmp/nanobanana-adc-test-012.png
/tmp/nanobanana-adc-test-012.png: PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced
$ ls -lh /tmp/nanobanana-adc-test-012.png
-rw-r--r--@ 1 yamamoto  wheel   1.8M  4月 24 17:16 /tmp/nanobanana-adc-test-012.png
```

成功条件すべて満たす:
- `[auth] using: adc` 出力あり
- `[generate] done | output=... | model=... | elapsed_ms=...` 出力あり
- 1024×1024 PNG が `/tmp/nanobanana-adc-test-012.png` に保存
- exit code 0

env: `GOOGLE_CLOUD_PROJECT=gen-lang-client-0451899685`, `GOOGLE_CLOUD_LOCATION=global` (一時的に上書き; 元は `global`)。region-less host (`aiplatform.googleapis.com`) 経路。

## 4. task spec §8 の API key 経路 省略理由

design-review §必須 の判断に従い、API key 経路の実画像生成は省略 (CLAUDE.md「ADC is the primary axis」優先)。ただし `--api-key` の commander 受理経路は Step 6 smoke 中に実行済み (上記 lowercase test)。

省略の追加根拠:
- 後述 §5 の発見 (AI Studio v1beta が `personGeneration` を未認識で 400 を返す) により、API key 経路で正常終了させる手段が現状存在しない
- このフィールドは Vertex AI 側のみで現在受理される一次調査結果と符合

## 5. 判断ログ (plan / review からの逸脱・追加発見)

### 5.1 commander 14 での `choices` + `argParser` 評価順序

design-review §推奨 では「argParser → choices」の評価順序を期待していたが、実際の commander 14.0.3 ソース (`node_modules/commander/lib/option.js:181-195` および `:132-134`) を読むと、`.choices()` も `.argParser()` も `this.parseArg = ...` を**上書き**する実装で、後勝ち。

→ 実装としては `choices(...).argParser(...)` の順で呼び、`.choices()` で `argChoices` (help 表示用) をセットしつつ、`.argParser()` 内で大文字化と enum 検証を **両方** 実装した。`InvalidArgumentError` を commander から import して投げているので、commander が usage つきで `error: option '--person-generation <mode>' argument 'invalid' is invalid. Allowed choices are ...` の標準フォーマットで stderr に出すのを再現できている (smoke で確認)。

### 5.2 AI Studio v1beta が `personGeneration` を未認識

研究段階の `@google/genai` SDK 型定義は `personGeneration` を Gemini API 経由で利用可能と示していたが、実際にプロジェクトが使用している `@google/generative-ai@0.24.1` 経由 (`https://generativelanguage.googleapis.com/v1beta/...:generateContent`) では `400 Unknown name "personGeneration" at 'generation_config.image_config': Cannot find field.` が返る (smoke + 実生成試行で確認、INVALID_KEY と有効 API key 両方で field レベル拒否を確認)。

これは design-review §nit が予期していたシナリオで、`@google/generative-ai@0.24.1` はまだこのフィールドの送信に対応していない可能性がある (AI Studio 側の v1beta endpoint も未対応の可能性)。

→ 実装はそのまま (条件付き spread のため、未指定なら従来挙動を完全維持)。README / CHANGELOG に「現状 ADC 経路でのみ受理。AI Studio v1beta は 400 を返す」旨を明記。

### 5.3 README 注記の文面

design-review §推奨「Tier rejection の表現」と上記 §5.2 の発見を統合し、README の `> Note` を 1 つにまとめた:

> Note on `--person-generation`: currently accepted on the Vertex AI (ADC) path. The AI Studio v1beta endpoint used by the `--api-key` / `GEMINI_API_KEY` path does not yet recognize this field for `gemini-3-pro-image-preview` and returns `400 Unknown name "personGeneration"`. There are also reports that some AI Studio API-key tiers may reject `ALLOW_ALL` with a 400 error (not yet confirmed for the Gemini API path). If you hit either, fall back to omitting the flag or use the ADC path.

`.team/` への内部リンクは入れていない (design-review §Q3 の方針)。

### 5.4 GEMINI_API_KEY が環境変数に常設

実画像生成 1 回目は `[auth] using: api-key` に流れて 400。`auth.ts` の優先順位 (`--api-key` → `GEMINI_API_KEY` → ADC) は CLAUDE.md で「reorder 禁止」と明示されているため、CLI 側ではなく `env -u GEMINI_API_KEY` で実行環境側を一時調整して ADC 経路に流した。これは想定内挙動 (= バグではない)。

## 6. 残課題

1. **AI Studio (Gemini API) 経路の `personGeneration` サポート追従**: `@google/generative-ai` の major アップデート、または `@google/genai` への SDK 移行で field が認識されるようになった時点で、CHANGELOG / README の注記を更新する。本リポでの SDK 切替は scope 外 (plan §11.4 / 12.5)。
2. **`skills/nanobanana-adc/SKILL.md` の trigger / usage 文言**: 本タスクでは触らず (plan §11.3 / scope 外)。Claude Code plugin 利用者向けに `--person-generation` の存在を skill 側 metadata で示すかは v0.2.1 以降で別タスク化を推奨。
3. **`as any` cast を剥がすリファクタ**: `@google/generative-ai@0.24.1` の `GenerationConfig` 型に `imageConfig` が未定義のため継続。SDK 移行時に対応 (plan §11.4)。
4. **AI Studio Tier `ALLOW_ALL` rejection の Gemini API 経路での再現確認**: 現状は Imagen 経路報告のみ。Gemini API 経路の field 認識が改善されたら追検証する価値あり。
5. **リリース作業**: `git tag v0.2.0` / push / npm publish / GitHub Release は本タスク scope 外。Conductor 後続 (`/release 0.2.0`) で実施。

## 7. 完了状態

- 実装 / typecheck / build / smoke / ADC 1 枚生成すべて pass
- README en/ja / CHANGELOG / version 4 箇所 + lockfile すべて 0.2.0 に同期
- conventional commits で commit (Implementer が実施)
- push / PR / merge は Conductor が後続で実施
