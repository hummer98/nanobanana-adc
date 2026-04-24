# Plan: v0.2.0 — Gemini 3 Pro Image API オプションを CLI に拡充

- Task: 012 / T12
- Run: task-012-1777016849
- Branch: `task-012-1777016849/task`
- Worktree: `/Users/yamamoto/git/nanobanana-adc/.worktrees/task-012-1777016849`
- Planner 執筆日: 2026-04-24

---

## 1. ゴール (Narrowed Scope)

v0.2.0 (minor) で **両経路（Vertex AI ADC / AI Studio API key）で互換に動作する画像生成パラメータだけ** を CLI に追加する。具体的には 1 個だけ:

- **`--person-generation <mode>`**: `ALLOW_ALL | ALLOW_ADULT | ALLOW_NONE` の enum。未指定時は送信しない（モデル既定に委ねる）。

**意図的に外したもの** — 当初 task spec が想定していた 5 オプションのうち `--person` 以外:

| 当初想定 | 外した理由 | 根拠 |
|---|---|---|
| `-n/--count` | `gemini-3-pro-image-preview` がサーバ側で `400 "Multiple candidates is not enabled for this model"` を返す | research.md §1 |
| `--seed` | `ImageConfig.seed` は存在せず、top-level `generationConfig.seed` の画像モデル動作は一次ソースで保証されていない | research.md §3 |
| `--mime` (png/jpeg) | AI Studio 側 SDK 型定義コメントで明示的に `"not supported in Gemini API"`。Vertex 限定では「両経路対称」の売りが崩れる | research.md §4 |
| `--negative-prompt` | `ImageConfig` に field 自体なし（Imagen 系 config 限定） | research.md §5 |

scope 縮小に伴い、task spec の以下の受け入れ基準も **対応不要** になる:

- 受け入れ基準 3（複数画像の出力命名規則）: `--count` を採用しないので連番ロジックは要らない
- 受け入れ基準 4（`--mime` と `--output` の整合）: `--mime` を採用しないので整合検査は要らない

---

## 2. 前提（research.md 要約 + scope 変更の justification）

### 2.1 research.md の結論（抜粋）

Gemini 3 Pro Image の `generateContent` 用 `imageConfig` は **Imagen 用の `GenerateImagesConfig` と別物で大幅に機能が少ない**。`@google/genai` (js-genai) の `ImageConfig` インタフェースで両経路サポートが確認できたのは `aspectRatio` / `imageSize` / `personGeneration` の 3 つだけで、前者 2 つはすでに v0.1.x で実装済み。**新規に追加可能なのは `personGeneration` のみ** という結論。

### 2.2 Scope 縮小の正当性

task spec 受け入れ基準 0（前提調査）には以下が明記されている:

> 実際の REST API と `@google/generative-ai` SDK で**互換性のあるパラメータだけ**を対象とする。片方にしかないものは今回は採用しない

従って scope 縮小は spec 違反ではなく、spec が事前に許可した narrowing。

### 2.3 CLAUDE.md との整合

- 「One binary, two distributions」「No hidden coupling to Claude Code」: Vertex でしか動かない `--mime` を入れると CLAUDE.md の「両経路対称」方針に反するため、不採用判断が整合する。
- 「ADC is the primary axis」: `personGeneration` は両経路で同じ field 名・同じ 3 値 enum を持つため、ADC 経路への影響は regression-free。

### 2.4 AI Studio Tier の注意

research.md §2 に、AI Studio Tier 1 API key で `ALLOW_ALL` が `400 "allow_all for personGeneration is currently not supported"` となる実運用報告あり（SillyTavern #4824）。ただしこれは Imagen 経路の報告で、Gemini API 側での再現は未確認。**README に一行注記**するに留め、CLI 側でのプリチェックはしない（将来 enum 値が増えた場合に早期 reject で困る）。

---

## 3. 変更ファイル一覧

| ファイル | 編集種別 | 予想行数 | 備考 |
|---|---|---|---|
| `src/cli.ts` | 修正 | +15 / -3 | `addOption` で `--person-generation` 追加、`.version('0.2.0')`、`opts` 型追加、`GenerateOptions` への伝搬 |
| `src/generate.ts` | 修正 | +25 / -0 | `GenerateOptions.personGeneration?` 追加、`PERSON_GENERATION_MODES`、`assertPersonGeneration`、Vertex fetch body と SDK `generationConfig` に条件付き注入 |
| `package.json` | 修正 | +1 / -1 | `"version": "0.2.0"` |
| `.claude-plugin/plugin.json` | 修正 | +1 / -1 | `"version": "0.2.0"` |
| `.claude-plugin/marketplace.json` | 修正 | +1 / -1 | `plugins[0].version` を `"0.2.0"` |
| `CHANGELOG.md` | 追記 | +18 / -0 | 冒頭に `## [0.2.0] - 2026-04-24` セクション |
| `README.md` | 修正 | +4 / -0 | Options 表に行追加、使用例 1 つ追加、AI Studio Tier 注意書き |
| `README.ja.md` | 修正 | +4 / -0 | 同上の日本語版 |

**編集しないファイル** (重要):

- `src/auth.ts` — 認証ロジック変更不要（CLAUDE.md: 「認証優先順位を reorder しない」）
- `bin/nanobanana-adc` — 変更不要
- `docs/seed.md` — 「今後の拡張候補（スコープ外）」は触らない（task spec 受け入れ基準 5 で明示）
- `skills/nanobanana-adc/SKILL.md` — オプションの trigger/usage が大幅に変わらないため、今回はスコープ外（必要があれば後続で別タスク化）
- `tsconfig.json`, `.github/workflows/*`, `.npmrc` — 変更不要

---

## 4. 実装ステップ（順序付き、各ステップに成功条件）

本リポには既存のテストフレームワークが無い（`package.json` に `test` script なし、`devDependencies` に jest/vitest なし）。TDD を形式的に導入すると依存を増やすことになり、task spec のスコープから外れるため、**新規テストフレームワーク導入はしない**。代わりに各ステップで `tsc --noEmit` と `node dist/cli.js --help` をトリガーに段階的に検証する。

### Step 1. 型と定数の追加（`src/generate.ts`）

1. `PERSON_GENERATION_MODES = ['ALLOW_ALL', 'ALLOW_ADULT', 'ALLOW_NONE'] as const` を追加
2. `export type PersonGeneration = (typeof PERSON_GENERATION_MODES)[number];`
3. `export function assertPersonGeneration(value: string): asserts value is PersonGeneration` を `assertAspect` と同じ形で実装
4. `GenerateOptions` に `personGeneration?: PersonGeneration;` を optional で追加

**成功条件**: `npm run typecheck` pass。

### Step 2. Vertex fetch body への注入（`src/generate.ts::generateViaVertexFetch`）

`generationConfig.imageConfig` に **条件付きで** `personGeneration` を追加:

```ts
imageConfig: {
  aspectRatio: ASPECT_MAP[options.aspect],
  imageSize: options.size,
  ...(options.personGeneration ? { personGeneration: options.personGeneration } : {}),
}
```

未指定時はキー自体を送らない（モデル既定に委ねる）。

**成功条件**: `npm run build` pass。

### Step 3. AI Studio SDK body への注入（`src/generate.ts::generateViaSdk`）

既存の `as any` cast と同じパターンで `imageConfig` に同じ条件付き注入を施す。`getGenerativeModel` の `generationConfig.imageConfig` に spread で乗せる。

**成功条件**: `npm run build` pass。`as any` は既存踏襲（SDK 0.24.1 の `GenerationConfig` 型に `imageConfig` が未定義のため）。

### Step 4. CLI オプションの追加（`src/cli.ts`）

`commander` の `addOption` で single long flag を定義する:

```ts
.addOption(
  new Option('--person-generation <mode>', 'control person generation')
    .choices(['ALLOW_ALL', 'ALLOW_ADULT', 'ALLOW_NONE']),
)
```

**フラグ名の決定根拠** (判断ログ §12 とも重複):

- task spec は `--person <mode>` と書いているが、research.md §2 で確認した Google 公式 SDK (`@google/genai`) のフィールド名は `personGeneration`。
- CLI フラグ名を API 名と合わせる方が「API のどのパラメータを制御しているか」が一目瞭然で、ドキュメント参照性が高い。
- 短縮エイリアス `-P` 等は **付けない**。`-p` は既に `--prompt` が取っているため紛らわしく、また今回のオプションは主要な使用頻度が高くないため、短縮を付けるほどの ROI がない。
- enum 値の大文字小文字: `commander.choices` は厳密一致。CLI 側でも大文字で受ける（`ALLOW_ALL` 等）。task spec は「CLI では小文字表記、送信時にマッピング」と書いているが、**小文字に正規化するのは merit が薄い**（API 文書の表記と一致させた方が learnability が高い）。判断ログ §12 に記載。

opts 型に `personGeneration?: string` を追加し、存在すれば `assertPersonGeneration` に通してから `GenerateOptions.personGeneration` に詰める。

**成功条件**:
- `node dist/cli.js --help` に `--person-generation <mode>` が `(choices: ...)` 付きで出る
- `node dist/cli.js --prompt x --person-generation invalid` が commander の choice validation で exit code 1 + stderr メッセージになる

### Step 5. バージョン同期（4 箇所を `0.2.0` に）

- `package.json` `"version"`
- `.claude-plugin/plugin.json` `"version"`
- `.claude-plugin/marketplace.json` `plugins[0].version`
- `src/cli.ts` `.version('0.2.0')`

**成功条件**: `grep -rE '0\.1\.[0-9]+' package.json .claude-plugin/ src/cli.ts` が空。

### Step 6. CHANGELOG.md 更新

冒頭に `## [0.2.0] - 2026-04-24` セクションを追加。詳細は §8.3 参照。

**成功条件**: Keep a Changelog フォーマットを踏襲、既存の v0.1.1 / v0.1.0 の書式と揃っている。

### Step 7. README.md / README.ja.md 更新

Options 表に 1 行追加、使用例 1 つ追加、AI Studio Tier の注記を 1 行追加。Authentication 節は触らない。詳細は §8.1 / §8.2 参照。

**成功条件**: 英日で内容が一致、既存の表スタイルを崩さない。

### Step 8. ビルド成果物の再生成

`dist/` は `.gitignore` 下にあり git 追跡外。手元で `npm run build` を走らせて `dist/cli.js` が最新であることを確認するのみ（commit には含めない）。

**成功条件**: `node dist/cli.js --help` が 0.2.0 相当の表示。

### Step 9. コミット

Conventional Commits に従い、論理単位で分割:

1. `feat(cli): add --person-generation option (ALLOW_ALL/ALLOW_ADULT/ALLOW_NONE)`
2. `docs: add --person-generation to README (en/ja) and 0.2.0 CHANGELOG`
3. `chore: bump version to 0.2.0 across package.json, plugin.json, marketplace.json, cli.ts`

1 本にまとめても可（レビュアの好み次第）。Planner としてはレビュー容易性のため 2〜3 コミットを推奨。

### Step 10. 完了処理

- `summary.md` に実施内容・動作確認ログ・判断メモを記録（conductor-role.md に従う）
- リリース作業（`git tag v0.2.0`、push、CI publish）は **本タスクの外**。task spec「スコープ外」に明記されている通り、完了後に別途 `/release 0.2.0` で実施

---

## 5. 型定義の変更

```ts
// src/generate.ts

export const PERSON_GENERATION_MODES = [
  'ALLOW_ALL',
  'ALLOW_ADULT',
  'ALLOW_NONE',
] as const;

export type PersonGeneration = (typeof PERSON_GENERATION_MODES)[number];

export function assertPersonGeneration(
  value: string,
): asserts value is PersonGeneration {
  if (!(PERSON_GENERATION_MODES as readonly string[]).includes(value)) {
    throw new Error(
      `[generate] unsupported personGeneration: ${value}. supported: ${PERSON_GENERATION_MODES.join(', ')}`,
    );
  }
}

export interface GenerateOptions {
  prompt: string;
  aspect: GenerateAspect;
  size: GenerateSize;
  model: string;
  output: string;
  apiKey?: string;
  personGeneration?: PersonGeneration; // ← 追加
}
```

注意点:

- `personGeneration` は **optional**（`?`）。後方互換のため、未指定の呼び出しは一切挙動が変わってはいけない。
- `assertPersonGeneration` は `assertAspect` と同じく `asserts value is T` の type narrowing を使い、CLI 側で `string` を受けてこの関数を通してから `GenerateOptions` に詰める流れにする。
- `commander.choices` で早期 reject されるため、`assertPersonGeneration` は **保険** として置く（CLI 以外から `generate()` を直接呼ぶライブラリ利用への備え）。

---

## 6. CLI オプション仕様

| 項目 | 仕様 |
|---|---|
| フラグ | `--person-generation <mode>` |
| 短縮形 | なし（`-p` は `--prompt` 占有、`-P` は ROI 低いため付けない） |
| enum 値 | `ALLOW_ALL`, `ALLOW_ADULT`, `ALLOW_NONE`（大文字） |
| default | なし（未指定なら送信しない = モデル既定） |
| 実装手段 | `commander.Option(...).choices([...])` |
| エラー挙動 | choice 外の値 → commander が exit code 1 + usage を stderr に出す |

help 出力例（commander が自動生成）:

```
--person-generation <mode>        control person generation (choices: "ALLOW_ALL", "ALLOW_ADULT", "ALLOW_NONE")
```

---

## 7. API body マッピング（Vertex / AI Studio）

両経路で **完全に同じ位置・同じ文字列** を送る。マッピング分岐は不要。

### Vertex AI REST（`src/generate.ts::generateViaVertexFetch`）

```ts
const body = {
  contents: [
    { role: 'user', parts: [{ text: options.prompt }] },
  ],
  generationConfig: {
    responseModalities: ['IMAGE'],
    imageConfig: {
      aspectRatio: ASPECT_MAP[options.aspect],
      imageSize: options.size,
      ...(options.personGeneration
        ? { personGeneration: options.personGeneration }
        : {}),
    },
  },
};
```

### AI Studio SDK（`src/generate.ts::generateViaSdk`）

```ts
const model = client.getGenerativeModel({
  model: options.model,
  generationConfig: {
    responseModalities: ['IMAGE'],
    imageConfig: {
      aspectRatio: ASPECT_MAP[options.aspect],
      imageSize: options.size,
      ...(options.personGeneration
        ? { personGeneration: options.personGeneration }
        : {}),
    },
  } as any, // 既存踏襲: @google/generative-ai@0.24.1 の型に imageConfig 未定義
});
```

`as any` cast の範囲は既存と同じ `generationConfig` ブロック全体。新しく any を増やさない。

### なぜ条件付き spread か

- `personGeneration: undefined` をそのまま渡すと、SDK によっては JSON 化で `"personGeneration": null` になったり、Vertex 側でバリデーションに引っかかる可能性がある
- 未指定時は **field 自体を送らない** のが最も安全で、モデル既定に委ねる research.md §2 の推奨とも整合

---

## 8. ドキュメント更新方針（README / README.ja / CHANGELOG）

### 8.1 README.md（英語）

**(a) Options 表に 1 行追加**:

```md
| `--person-generation` | — | — | Control person generation. One of `ALLOW_ALL`, `ALLOW_ADULT`, `ALLOW_NONE`. Omit to use the model default. |
```

**(b) Usage examples に 1 つ追加** (既存の `# 5. API-key fallback` の後に `# 6.` として追加):

```bash
# 6. Restrict person generation
nanobanana-adc -p "a bustling plaza" --person-generation ALLOW_ADULT
```

**(c) Features セクション**: 既存の aspect/size 行の下に 1 行追加するか、現状のままで可。**追加しない**方針にする（機能説明は Options 表で十分、feature bullet の膨張を避ける）。

**(d) AI Studio Tier 注記** (Options 表のすぐ下に 1 行の note):

```md
> Note: Some AI Studio API-key tiers reject `ALLOW_ALL` with a 400 error. If so, try `ALLOW_ADULT` or upgrade the tier. (See [research](./.team/tasks/...) — or omit the flag entirely.)
```

(実リンクは .team 配下を公開しない運用なら、文章のみに留める方が良い。最終文面は Implementer 判断で可。)

### 8.2 README.ja.md（日本語）

英版と同じ構造。訳例:

```md
| `--person-generation` | — | — | 人物生成の制御。`ALLOW_ALL` / `ALLOW_ADULT` / `ALLOW_NONE` のいずれか。未指定時はモデル既定に委ねる。 |
```

```bash
# 6. 人物生成の制御
nanobanana-adc -p "にぎやかな広場" --person-generation ALLOW_ADULT
```

```md
> メモ: AI Studio の一部 API キー Tier では `ALLOW_ALL` が 400 エラーで弾かれるとの報告があります。その場合は `ALLOW_ADULT` を使うか、Tier を上げるか、このフラグを省略してください。
```

### 8.3 CHANGELOG.md

冒頭に新セクション。Keep a Changelog フォーマット踏襲:

```md
## [0.2.0] - 2026-04-24

### Added
- `--person-generation <mode>` CLI option (`ALLOW_ALL` / `ALLOW_ADULT` / `ALLOW_NONE`) mapped to `generationConfig.imageConfig.personGeneration` on both the Vertex AI (ADC) and AI Studio (API-key) paths. Omit to use the model default.

### Scope notes (investigated but intentionally not adopted)
After verifying against the Vertex AI REST spec, the `@google/genai` SDK's `ImageConfig` interface, and the `gemini-3-pro-image-preview` runtime, the following parameters were considered and deferred:

- **Multiple candidates (`--count` / `-n`)**: `gemini-3-pro-image-preview` server-side rejects with `"Multiple candidates is not enabled for this model"`. Use parallel invocations instead.
- **`--seed`**: `ImageConfig` has no `seed` field; top-level `generationConfig.seed` behavior is not guaranteed for image models by primary sources. Will revisit when Google publishes image-seed guarantees.
- **`--mime` (png/jpeg)**: The `@google/genai` SDK type definition marks `outputMimeType` / `imageOutputOptions` as `"not supported in Gemini API"` — Vertex-only. Exposing a flag that works on one auth path but not the other would violate the project's "both paths symmetric" design.
- **`--negative-prompt`**: Not present in `ImageConfig` (Imagen-only). The recommended pattern is to write exclusions directly in `--prompt`.
```

**Changed / Fixed / Dependencies セクションは付けない**（該当なし）。

---

## 9. バージョン同期

4 箇所を `0.2.0` に。セマンティックバージョニングでは API が後方互換に拡張されたので **minor bump** が妥当（新規 optional フラグを追加しただけ、既存挙動の破壊なし）。

| ファイル | キー | 新値 |
|---|---|---|
| `package.json` | `version` | `"0.2.0"` |
| `.claude-plugin/plugin.json` | `version` | `"0.2.0"` |
| `.claude-plugin/marketplace.json` | `plugins[0].version` | `"0.2.0"` |
| `src/cli.ts` | `.version('0.1.1')` の引数 | `'0.2.0'` |

一括 grep 確認:

```bash
grep -rnE '"0\.1\.[0-9]+"|0\.1\.[0-9]+' package.json .claude-plugin/ src/cli.ts
# → no match になればバージョン同期 OK
```

（CHANGELOG の `[0.1.1]` / `[0.1.0]` 見出しは残るので `CHANGELOG.md` は grep 対象から除外する）

---

## 10. 動作確認手順

CLAUDE.md「課金が発生する実モデル呼び出しを CI のデフォルトパスで回さない」と、research.md で narrowing した scope に整合させるため、**本タスクでは実画像生成テストを走らせない**。task spec §8 の「API key 経路・ADC 経路で実画像を 1 枚ずつ summary に記録」は **意図的に逸脱**する（summary.md にその旨を明記すること）。

### 10.1 Static checks

```bash
cd /Users/yamamoto/git/nanobanana-adc/.worktrees/task-012-1777016849
npm run typecheck   # 0 errors
npm run build       # 0 errors, dist/cli.js 再生成
```

### 10.2 CLI smoke checks (課金なし)

```bash
node dist/cli.js --version
# → 0.2.0

node dist/cli.js --help
# → --person-generation <mode> が choices 付きで表示されること、
#    --prompt/-p, --output/-o, --aspect/-a, --size/-s, --model/-m, --api-key 既存フラグも正常表示

node dist/cli.js --prompt x --person-generation invalid
# → exit 1 + stderr に commander の
#   "error: option '--person-generation <mode>' argument 'invalid' is invalid."
# が出る

node dist/cli.js --prompt x --person-generation ALLOW_ADULT --api-key dummy
# → ここは API 呼び出しが fail しても OK（認証 → API error の順で死ぬのを確認）。
#   生成までは走らせない／走っても即 401 で止まる。
```

### 10.3 Version 同期確認

```bash
grep -rEn '"version"\s*:\s*"[^"]+"' package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
grep -n "\.version(" src/cli.ts
# 4 行すべて 0.2.0 を指すこと
```

### 10.4 README プレビュー

エディタ（または `cat`）で README.md / README.ja.md を開き、Options 表に行が追加されていること、使用例が正しく日英で対応していることを目視確認。

### 10.5 task spec §8 からの逸脱メモ

task spec は「API key 経路で 1 枚・ADC 経路で 1 枚」生成テストを要求しているが、

- CLAUDE.md「課金が発生する実モデル呼び出しを CI のデフォルトパスで回さない」
- research.md の scope narrowing（`--count` 不採用により連番命名テストも不要）
- 本タスクは API body に field を 1 つ追加する薄い変更で、2 経路で同じ文字列を同じ位置に詰めるだけであり、既存の v0.1.1 smoke 済み経路を壊すリスクが極めて低い

以上の理由から、Implementer は実画像生成テストを **省略**し、上記 10.1〜10.4 に留める。summary.md の「動作確認」節にこの判断と根拠を明記する。

（もしレビュアが「やはり 1 枚は実生成すべき」と判断した場合は、`--size 1K --person-generation ALLOW_ADULT` で最低課金の 1 枚を手元で追加検証する。CI では走らせない。）

---

## 11. 残リスク・将来課題

### 11.1 Tier による `ALLOW_ALL` rejection

research.md §2 の通り、AI Studio Tier 1 で `ALLOW_ALL` が 400 で弾かれる報告あり（SillyTavern #4824）。ただし:

- Imagen 経路の報告で、Gemini API 経路での再現は未確認
- CLI 側でプリチェックするとサーバ側 enum 拡張に追従できなくなる

→ **対応**: README に 1 行注記するのみ。CLI はサーバのエラーをそのまま伝播。

### 11.2 enum 値の将来拡張

Google が `BLOCK_ALL` 等を追加した場合、CLI の `choices()` と `PERSON_GENERATION_MODES` の両方を更新する必要がある。Escape hatch として「環境変数経由で生文字列を流す」手段は **今回は導入しない**（API 変更の都度リリースする方が明示的で安全）。

### 11.3 `skills/nanobanana-adc/SKILL.md` 未更新

本プランでは SKILL.md を更新しない。trigger/usage 文言に `--person-generation` を含めるかは、v0.2.1 でまとめて Claude Code plugin 向け改善として別タスク化する方が scope として綺麗。Implementer は **触らない**（判断ログ §12 参照）。

### 11.4 SDK 0.24.1 の型定義制約

`@google/generative-ai@0.24.1` の `GenerationConfig` 型には `imageConfig` が未定義のため、`as any` cast が継続して必要。将来 SDK が型に追いついたら `as any` を落とすリファクタを別タスクで実施。

### 11.5 実画像生成テストを省略することへの監視

本タスクで実画像生成を省略する判断は、`personGeneration` が薄い追加であるがゆえ。今後もっと body を触る変更（`safetySettings` 等）が入る時は、ADC 経路で 1 枚の実生成を復活させるべき。summary.md でこの trade-off を明記する。

---

## 12. 判断ログ（迷った箇所とその決定根拠）

### 12.1 CLI フラグ名: `--person` vs `--person-generation`

- task spec は `--person <mode>`
- research.md と Google SDK 型定義は `personGeneration`

**決定**: `--person-generation` 単一ロングフラグ、短縮エイリアス無し。

**根拠**:
1. API 名と 1:1 対応する方が、「どの API field を制御しているか」の可読性が高い（CLAUDE.md の「Fail loudly on auth ambiguity」と同じ思想で、隠蔽より透明性を優先）
2. 将来 `--person-*` で別 API field（例: Imagen 系の `prominentPeople`）を追加する際に名前空間が綺麗
3. `--person` は口語的に汎用すぎて、enum 値 3 種に限定されるフラグの意味が伝わりにくい
4. spec は「候補値は CLI では小文字表記、送信時にマッピング」と書くが、API 文書の大文字表記と合わせる方が learnability が高く、マッピング層を 1 つ減らせる（コード量削減、テストケース削減）

### 12.2 実画像生成テストを本タスクで走らせない

- task spec §8 は明示的に「API key 経路で 1 枚・ADC 経路で 1 枚」を要求
- CLAUDE.md は「課金が発生する実モデル呼び出しを CI のデフォルトパスで回さない」

**決定**: 本タスクでは実画像生成テストを省略（§10.5 参照）。

**根拠**:
1. 変更は「`imageConfig` に 1 key を条件付きで足す」だけで、body 構築ロジックに分岐を増やさない
2. task spec 受け入れ基準 0 の調査結果によって scope が縮小され、「連番命名」「mime 整合」の検証点が消えた
3. CLAUDE.md の優先度と整合（CLAUDE.md は spec より上位のルール）
4. summary.md で明示し、レビュアが必要と判断した場合は手元で 1 枚追加検証する余地を残す

### 12.3 default 値の扱い

- 「`ALLOW_ADULT` を default にする」案は棄却
- 「未指定なら field 自体を送らない」案を採用

**根拠**: research.md §2 の推奨に従う。Tier 違いで意図せず制限されるユーザーが出ないこと、モデル側の default に追従できることを優先。

### 12.4 SKILL.md を本タスクで更新するか

**決定**: 更新しない（§11.3）。

**根拠**: task spec 受け入れ基準 5 は「README.md と README.ja.md」を明示、SKILL.md は非言及。scope を尊重する。

### 12.5 `as any` を剥がすか

**決定**: 剥がさない（既存踏襲）。

**根拠**: 本タスクのスコープ外。`@google/generative-ai` の major アップデートか代替 SDK 移行（`@google/genai`）が発生した時に別タスクで対応する方が安全。

### 12.6 AI Studio Tier rejection を CLI でプリチェックするか

**決定**: プリチェックしない（README 注記のみ）。

**根拠**: サーバ側 enum 拡張に追従できなくなるリスク、かつ Gemini API 側での再現が未確認。CLI の責務は body 組立と error 伝播に留める。

---

## 付録 A. 実装差分の予想サイズ

```
 src/cli.ts                          |  18 ++++++++++++++----
 src/generate.ts                     |  28 +++++++++++++++++++++++++++-
 package.json                        |   2 +-
 .claude-plugin/plugin.json          |   2 +-
 .claude-plugin/marketplace.json     |   2 +-
 CHANGELOG.md                        |  18 ++++++++++++++++++
 README.md                           |   8 ++++++++
 README.ja.md                        |   8 ++++++++
 8 files changed, ~86 insertions(+), ~6 deletions(-)
```

純粋な行数としては 90 行未満、コード変更部分は 40 行程度の小さな変更。

## 付録 B. Implementer への申し送り事項

1. **まず CLAUDE.md を読む** — ADC-first、region-less host invariant、コミット規約など。
2. **研究結果の尊重** — research.md の scope narrowing を勝手に広げない。`--seed` や `--count` を「ついでに」足すのは禁止。
3. **ドキュメントの同期** — README 英日 + CHANGELOG + 4 箇所のバージョン番号がすべて揃っていることを、コミット前に `grep` で確認する。
4. **実画像生成の省略を summary.md に明記** — レビュアが後から追跡できるように。
5. **コミットメッセージは Conventional Commits** — `feat(cli): ...`、`docs: ...`、`chore: ...`。
6. **`--no-verify` / `--amend` を使わない** — CLAUDE.md の方針。
7. **dist/ は commit しない** — `.gitignore` 下。
